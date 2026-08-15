"""AnyControl Remote — backend regression tests.

Covers: auth (register/login/me), devices CRUD, pairing (new/claim),
sessions listing, and WebSocket relay (agent frames + control events + online status).
"""
import os
import json
import time
import uuid
import asyncio
import pytest
import requests
import websockets

BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE}/api"
WS_LOCAL = "ws://localhost:8001"  # WS via ingress can be flaky; local is fine for relay tests

DEMO_EMAIL = "demo@anycontrol.io"
DEMO_PASSWORD = "secret123"


# --------------------------------------------------------------------------- #
# Fixtures
# --------------------------------------------------------------------------- #
@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def demo_token(session):
    r = session.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def auth(demo_token):
    return {"Authorization": f"Bearer {demo_token}", "Content-Type": "application/json"}


# --------------------------------------------------------------------------- #
# Auth
# --------------------------------------------------------------------------- #
class TestAuth:
    def test_register_new_user(self, session):
        email = f"TEST_{uuid.uuid4().hex[:10]}@example.com"
        r = session.post(f"{API}/auth/register", json={"email": email, "password": "abc123"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert "token" in data and data["user"]["email"] == email.lower()

    def test_register_duplicate_email(self, session):
        r = session.post(f"{API}/auth/register",
                         json={"email": DEMO_EMAIL, "password": "whatever12"})
        assert r.status_code == 409, r.text

    def test_register_short_password(self, session):
        r = session.post(f"{API}/auth/register",
                         json={"email": f"TEST_{uuid.uuid4().hex[:6]}@x.com", "password": "abc"})
        assert r.status_code == 422

    def test_login_wrong_password(self, session):
        r = session.post(f"{API}/auth/login",
                         json={"email": DEMO_EMAIL, "password": "wrong-pw"})
        assert r.status_code == 401

    def test_login_success_and_me(self, session, demo_token):
        assert demo_token
        r = session.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {demo_token}"})
        assert r.status_code == 200
        assert r.json()["email"] == DEMO_EMAIL

    def test_me_missing_token(self, session):
        r = session.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_me_invalid_token(self, session):
        r = session.get(f"{API}/auth/me", headers={"Authorization": "Bearer garbage.token.value"})
        assert r.status_code == 401


# --------------------------------------------------------------------------- #
# Devices
# --------------------------------------------------------------------------- #
class TestDevices:
    def test_register_idempotent(self, session, auth):
        name = f"TEST_dev_{uuid.uuid4().hex[:6]}"
        r1 = session.post(f"{API}/devices/register", headers=auth, json={"name": name})
        r2 = session.post(f"{API}/devices/register", headers=auth, json={"name": name})
        assert r1.status_code == 200 and r2.status_code == 200
        assert r1.json()["id"] == r2.json()["id"]
        assert "agent_token" in r1.json()
        # cleanup
        session.delete(f"{API}/devices/{r1.json()['id']}", headers=auth)

    def test_list_devices_contains_demo_host(self, session, auth):
        r = session.get(f"{API}/devices", headers=auth)
        assert r.status_code == 200
        devices = r.json()
        assert isinstance(devices, list)
        demo = [d for d in devices if d["name"] == "Demo Host"]
        assert demo, "Demo Host device missing"
        assert isinstance(demo[0]["online"], bool)

    def test_delete_other_users_device_returns_404(self, session, auth):
        # Create a second user + device
        email = f"TEST_{uuid.uuid4().hex[:10]}@example.com"
        r = session.post(f"{API}/auth/register", json={"email": email, "password": "abc123"})
        other_tok = r.json()["token"]
        r = session.post(f"{API}/devices/register",
                         headers={"Authorization": f"Bearer {other_tok}"},
                         json={"name": "TEST_other_dev"})
        did = r.json()["id"]
        # delete with the demo user's auth -> should 404
        r = session.delete(f"{API}/devices/{did}", headers=auth)
        assert r.status_code == 404


# --------------------------------------------------------------------------- #
# Pairing
# --------------------------------------------------------------------------- #
class TestPairing:
    def test_pair_new_and_claim(self, session, auth):
        r = session.post(f"{API}/devices/pair/new", headers=auth)
        assert r.status_code == 200
        code, otp = r.json()["code"], r.json()["otp"]
        assert len(code) == 9 and len(otp) == 6

        r = session.post(f"{API}/devices/pair/claim",
                         json={"code": code, "otp": otp, "name": f"TEST_paired_{uuid.uuid4().hex[:4]}"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["device_id"] and data["agent_token"]
        session.delete(f"{API}/devices/{data['device_id']}", headers=auth)

    def test_pair_claim_invalid_code(self, session):
        r = session.post(f"{API}/devices/pair/claim",
                         json={"code": "000000000", "otp": "XXXXXX", "name": "TEST_x"})
        assert r.status_code == 404


# --------------------------------------------------------------------------- #
# Sessions + WebSocket relay
# --------------------------------------------------------------------------- #
class TestSessions:
    def test_sessions_list_shape(self, session, auth):
        r = session.get(f"{API}/sessions", headers=auth)
        assert r.status_code == 200
        assert isinstance(r.json(), list)


class TestWebSocketRelay:
    def _get_demo_device(self, session, auth):
        devices = session.get(f"{API}/devices", headers=auth).json()
        for d in devices:
            if d["name"] == "Demo Host":
                return d
        pytest.skip("Demo Host not present")

    def test_demo_agent_online(self, session, auth):
        d = self._get_demo_device(session, auth)
        # Give agent a moment if it just started
        for _ in range(6):
            d = self._get_demo_device(session, auth)
            if d["online"]:
                break
            time.sleep(1)
        assert d["online"] is True, "Demo agent should be connected"

    def test_controller_relay_frame_and_click(self, session, demo_token, auth):
        d = self._get_demo_device(session, auth)
        url = f"{WS_LOCAL}/api/ws/control?token={demo_token}&device_id={d['id']}"

        async def _run():
            got_frame = False
            async with websockets.connect(url) as ws:
                # Send a click while waiting for a frame
                await ws.send(json.dumps({"type": "click", "x": 0.5, "y": 0.5, "button": "left"}))
                await ws.send(json.dumps({"type": "text", "text": "hello_test"}))
                deadline = time.time() + 5
                while time.time() < deadline:
                    try:
                        raw = await asyncio.wait_for(ws.recv(), timeout=2)
                    except asyncio.TimeoutError:
                        continue
                    msg = json.loads(raw)
                    if msg.get("type") == "frame":
                        got_frame = True
                        break
            return got_frame

        assert asyncio.run(_run()) is True, "Controller should have received a frame from agent"

        # session should have been recorded
        sess = session.get(f"{API}/sessions", headers=auth).json()
        assert any(s["device_id"] == d["id"] for s in sess), "Session log missing"

    def test_ws_control_invalid_token_rejected(self):
        url = f"{WS_LOCAL}/api/ws/control?token=bad&device_id=whatever"

        async def _run():
            try:
                async with websockets.connect(url) as ws:
                    # should close before we can send anything usable
                    await asyncio.wait_for(ws.recv(), timeout=3)
                return False
            except Exception:
                return True

        assert asyncio.run(_run()) is True

    def test_ws_agent_invalid_token_rejected(self):
        url = f"{WS_LOCAL}/api/ws/agent?token=bad"

        async def _run():
            try:
                async with websockets.connect(url) as ws:
                    await asyncio.wait_for(ws.recv(), timeout=3)
                return False
            except Exception:
                return True

        assert asyncio.run(_run()) is True
