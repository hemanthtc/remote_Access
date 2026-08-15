#!/usr/bin/env python3
"""
AnyControl Remote — Desktop Agent
=================================

Runs on the computer you want to control from your phone. It captures the
screen, streams JPEG frames to the AnyControl backend over a WebSocket, and
executes the mouse / keyboard events sent back from the mobile app.

Two ways to connect the agent to your account:

  1) Pairing code (recommended, no password on the desktop):
       In the mobile app open "Add Device" to get a 9-digit code + OTP, then:
       python agent.py --server https://YOUR-BACKEND --pair 123456789 --otp ABC123 \
                       --name "My Laptop"

  2) Account login:
       python agent.py --server https://YOUR-BACKEND --email you@mail.com \
                       --password secret --name "My Laptop"

Add --demo to run without a real display (generates synthetic frames and only
logs the control events). Useful for testing the pipeline on a headless server.

Credentials for the device are cached in agent_state.json so subsequent runs
reconnect automatically.
"""

import os
import sys
import json
import time
import base64
import argparse
import asyncio
import logging
from io import BytesIO
from pathlib import Path

import requests
import websockets

logging.basicConfig(level=logging.INFO, format="%(asctime)s [agent] %(message)s")
log = logging.getLogger("agent")

STATE_FILE = Path(__file__).parent / "agent_state.json"
FRAME_INTERVAL = 0.12   # ~8 fps; balances smoothness vs. bandwidth
JPEG_QUALITY = 55


# --------------------------------------------------------------------------- #
# State persistence
# --------------------------------------------------------------------------- #
def load_state() -> dict:
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text())
        except Exception:
            return {}
    return {}


def save_state(state: dict):
    STATE_FILE.write_text(json.dumps(state, indent=2))


# --------------------------------------------------------------------------- #
# Backend auth / device provisioning
# --------------------------------------------------------------------------- #
def http(server: str, path: str) -> str:
    return server.rstrip("/") + path


def provision(args) -> dict:
    """Return {server, token, device_id} — from cache or by pairing / login."""
    state = load_state()
    if state.get("agent_token") and state.get("device_id") and not args.reset:
        state["server"] = args.server or state.get("server")
        log.info("Using cached device credentials (%s)", state["device_id"])
        return state

    server = args.server or state.get("server")
    if not server:
        log.error("A --server URL is required for first-time setup.")
        sys.exit(1)

    if args.pair:
        r = requests.post(http(server, "/api/devices/pair/claim"), json={
            "code": args.pair, "otp": args.otp or "", "name": args.name,
        }, timeout=20)
        if r.status_code != 200:
            log.error("Pairing failed: %s %s", r.status_code, r.text)
            sys.exit(1)
        data = r.json()
        new_state = {"server": server, "agent_token": data["agent_token"],
                     "device_id": data["device_id"], "name": data["name"]}
        save_state(new_state)
        log.info("Paired successfully as device %s", data["device_id"])
        return new_state

    if args.email and args.password:
        r = requests.post(http(server, "/api/auth/login"),
                          json={"email": args.email, "password": args.password}, timeout=20)
        if r.status_code != 200:
            log.error("Login failed: %s %s", r.status_code, r.text)
            sys.exit(1)
        user_token = r.json()["token"]
        r = requests.post(http(server, "/api/devices/register"),
                          headers={"Authorization": f"Bearer {user_token}"},
                          json={"name": args.name}, timeout=20)
        if r.status_code != 200:
            log.error("Device registration failed: %s %s", r.status_code, r.text)
            sys.exit(1)
        data = r.json()
        new_state = {"server": server, "agent_token": data["agent_token"],
                     "device_id": data["id"], "name": data["name"]}
        save_state(new_state)
        log.info("Registered device %s", data["id"])
        return new_state

    log.error("Provide either --pair/--otp or --email/--password for first setup.")
    sys.exit(1)


# --------------------------------------------------------------------------- #
# Screen capture + input control backends
# --------------------------------------------------------------------------- #
class RealBackend:
    """Real screen capture (mss) and input control (pynput)."""

    def __init__(self):
        import mss
        from pynput.mouse import Controller as Mouse, Button
        from pynput.keyboard import Controller as Keyboard, Key
        self.sct = mss.mss()
        self.monitor = self.sct.monitors[1]
        self.width = self.monitor["width"]
        self.height = self.monitor["height"]
        self.mouse = Mouse()
        self.keyboard = Keyboard()
        self.Button = Button
        self.Key = Key
        from PIL import Image
        self.Image = Image

    def capture(self) -> bytes:
        shot = self.sct.grab(self.monitor)
        img = self.Image.frombytes("RGB", shot.size, shot.bgra, "raw", "BGRX")
        buf = BytesIO()
        img.save(buf, format="JPEG", quality=JPEG_QUALITY)
        return buf.getvalue()

    def _abs(self, nx, ny):
        return (self.monitor["left"] + int(nx * self.width),
                self.monitor["top"] + int(ny * self.height))

    def move(self, nx, ny):
        self.mouse.position = self._abs(nx, ny)

    def click(self, nx, ny, button="left", double=False):
        self.mouse.position = self._abs(nx, ny)
        b = self.Button.right if button == "right" else self.Button.left
        self.mouse.click(b, 2 if double else 1)

    def scroll(self, dy):
        self.mouse.scroll(0, dy)

    def key(self, name):
        special = getattr(self.Key, name, None)
        if special is not None:
            self.keyboard.press(special)
            self.keyboard.release(special)
        elif len(name) == 1:
            self.keyboard.press(name)
            self.keyboard.release(name)

    def type_text(self, text):
        self.keyboard.type(text)

    def hotkey(self, keys):
        pressed = []
        for k in keys:
            key = getattr(self.Key, k, k)
            self.keyboard.press(key)
            pressed.append(key)
        for key in reversed(pressed):
            self.keyboard.release(key)


class DemoBackend:
    """Headless synthetic frames + logged control events (for testing)."""

    def __init__(self):
        from PIL import Image, ImageDraw
        self.Image = Image
        self.ImageDraw = ImageDraw
        self.width = 1280
        self.height = 720
        self.frame = 0

    def capture(self) -> bytes:
        self.frame += 1
        img = self.Image.new("RGB", (self.width, self.height), (15, 15, 15))
        d = self.ImageDraw.Draw(img)
        d.rectangle([0, 0, self.width, 64], fill=(38, 38, 38))
        d.text((24, 22), "AnyControl Remote — DEMO DESKTOP", fill=(255, 109, 0))
        d.text((24, 120), f"Frame #{self.frame}", fill=(242, 242, 242))
        d.text((24, 160), time.strftime("%H:%M:%S"), fill=(163, 163, 163))
        d.ellipse([620, 340, 660, 380], outline=(255, 109, 0), width=3)
        buf = BytesIO()
        img.save(buf, format="JPEG", quality=JPEG_QUALITY)
        return buf.getvalue()

    def move(self, nx, ny):
        log.info("move -> (%.3f, %.3f)", nx, ny)

    def click(self, nx, ny, button="left", double=False):
        log.info("click %s%s -> (%.3f, %.3f)", button, " x2" if double else "", nx, ny)

    def scroll(self, dy):
        log.info("scroll %s", dy)

    def key(self, name):
        log.info("key %s", name)

    def type_text(self, text):
        log.info("type %r", text)

    def hotkey(self, keys):
        log.info("hotkey %s", "+".join(keys))


# --------------------------------------------------------------------------- #
# Main loop
# --------------------------------------------------------------------------- #
async def run(state: dict, backend, demo: bool):
    ws_base = state["server"].replace("http://", "ws://").replace("https://", "wss://")
    url = f"{ws_base.rstrip('/')}/api/ws/agent?token={state['agent_token']}"

    while True:
        try:
            async with websockets.connect(url, max_size=None, ping_interval=20) as ws:
                log.info("Connected to relay. Waiting for viewer...")
                viewer_active = {"on": False}

                async def stream():
                    while True:
                        if viewer_active["on"]:
                            data = backend.capture()
                            b64 = base64.b64encode(data).decode("ascii")
                            await ws.send(json.dumps({
                                "type": "frame", "data": b64,
                                "w": backend.width, "h": backend.height,
                            }))
                            await asyncio.sleep(FRAME_INTERVAL)
                        else:
                            await asyncio.sleep(0.25)

                async def recv():
                    async for raw in ws:
                        try:
                            msg = json.loads(raw)
                        except Exception:
                            continue
                        handle_control(backend, msg, viewer_active)

                await asyncio.gather(stream(), recv())
        except Exception as e:
            log.warning("Connection lost (%s). Reconnecting in 3s...", e)
            await asyncio.sleep(3)


def handle_control(backend, msg: dict, viewer_active: dict):
    t = msg.get("type")
    if t == "viewer":
        viewer_active["on"] = bool(msg.get("active"))
        log.info("Viewer %s", "attached" if viewer_active["on"] else "detached")
    elif t == "move":
        backend.move(msg["x"], msg["y"])
    elif t == "click":
        backend.click(msg["x"], msg["y"], msg.get("button", "left"), msg.get("double", False))
    elif t == "scroll":
        backend.scroll(msg.get("dy", 0))
    elif t == "key":
        backend.key(msg["key"])
    elif t == "text":
        backend.type_text(msg["text"])
    elif t == "hotkey":
        backend.hotkey(msg.get("keys", []))


def main():
    ap = argparse.ArgumentParser(description="AnyControl Remote desktop agent")
    ap.add_argument("--server", default=os.environ.get("ANYCONTROL_SERVER"))
    ap.add_argument("--name", default=os.environ.get("ANYCONTROL_NAME", "My Computer"))
    ap.add_argument("--pair", help="9-digit pairing code from the mobile app")
    ap.add_argument("--otp", help="OTP shown with the pairing code")
    ap.add_argument("--email")
    ap.add_argument("--password")
    ap.add_argument("--demo", action="store_true", help="headless synthetic frames")
    ap.add_argument("--reset", action="store_true", help="ignore cached credentials")
    args = ap.parse_args()

    state = provision(args)
    backend = DemoBackend() if args.demo else RealBackend()
    log.info("Screen %dx%d | mode=%s", backend.width, backend.height,
             "demo" if args.demo else "live")
    try:
        asyncio.run(run(state, backend, args.demo))
    except KeyboardInterrupt:
        log.info("Agent stopped.")


if __name__ == "__main__":
    main()
