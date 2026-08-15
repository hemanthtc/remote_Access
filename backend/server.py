"""
AnyControl Remote — Secure Remote Desktop backend.

Modules:
  - Auth: JWT register / login / me (bcrypt password hashing)
  - Devices: register (agent), list (with live online status), delete
  - Pairing: mobile generates a pairing code -> desktop agent claims it -> agent token
  - Relay: WebSocket relay between a desktop agent and a mobile controller
  - Sessions: connection audit logs (start / end / duration)
"""

import os
import uuid
import json
import random
import string
import logging
from pathlib import Path
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict

import jwt
import bcrypt
from dotenv import load_dotenv
from fastapi import (
    FastAPI,
    APIRouter,
    Depends,
    HTTPException,
    WebSocket,
    WebSocketDisconnect,
    Query,
    status,
)
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field

# --------------------------------------------------------------------------- #
# Config
# --------------------------------------------------------------------------- #
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALG = "HS256"
USER_TOKEN_DAYS = 30      # mobile + agent login tokens
AGENT_TOKEN_DAYS = 365    # long-lived device tokens issued during pairing

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("anycontrol")

app = FastAPI(title="AnyControl Remote API")
api = APIRouter(prefix="/api")
bearer = HTTPBearer(auto_error=False)


# --------------------------------------------------------------------------- #
# Helpers — auth
# --------------------------------------------------------------------------- #
def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def make_user_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "type": "user",
        "iat": now_utc(),
        "exp": now_utc() + timedelta(days=USER_TOKEN_DAYS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def make_agent_token(user_id: str, device_id: str) -> str:
    payload = {
        "sub": user_id,
        "device_id": device_id,
        "type": "agent",
        "iat": now_utc(),
        "exp": now_utc() + timedelta(days=AGENT_TOKEN_DAYS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


async def get_current_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
) -> dict:
    if creds is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode_token(creds.credentials)
    if payload.get("type") != "user":
        raise HTTPException(status_code=401, detail="Invalid token type")
    user = await db.users.find_one({"id": payload["sub"]})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


# --------------------------------------------------------------------------- #
# Models
# --------------------------------------------------------------------------- #
class RegisterBody(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    name: Optional[str] = None


class LoginBody(BaseModel):
    email: EmailStr
    password: str


class DeviceRegisterBody(BaseModel):
    name: str = Field(min_length=1, max_length=64)


class PairClaimBody(BaseModel):
    code: str
    otp: str
    name: str = Field(min_length=1, max_length=64)


def public_user(u: dict) -> dict:
    return {"id": u["id"], "email": u["email"], "name": u.get("name")}


# --------------------------------------------------------------------------- #
# Live connection registry (single-process, in-memory)
# --------------------------------------------------------------------------- #
class Relay:
    def __init__(self):
        self.agents: Dict[str, WebSocket] = {}       # device_id -> agent socket
        self.controllers: Dict[str, WebSocket] = {}  # device_id -> controller socket

    def agent_online(self, device_id: str) -> bool:
        return device_id in self.agents


relay = Relay()


# --------------------------------------------------------------------------- #
# Auth routes
# --------------------------------------------------------------------------- #
@api.get("/")
async def root():
    return {"message": "AnyControl Remote API", "status": "ok"}


@api.post("/auth/register")
async def register(body: RegisterBody):
    email = body.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=409, detail="Email is already registered")
    user = {
        "id": uuid.uuid4().hex,
        "email": email,
        "name": body.name or email.split("@")[0],
        "password_hash": hash_password(body.password),
        "created_at": now_utc().isoformat(),
    }
    await db.users.insert_one(user)
    token = make_user_token(user["id"], user["email"])
    return {"token": token, "user": public_user(user)}


@api.post("/auth/login")
async def login(body: LoginBody):
    email = body.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    token = make_user_token(user["id"], user["email"])
    return {"token": token, "user": public_user(user)}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return public_user(user)


# --------------------------------------------------------------------------- #
# Device routes
# --------------------------------------------------------------------------- #
async def _device_public(d: dict) -> dict:
    return {
        "id": d["id"],
        "name": d["name"],
        "online": relay.agent_online(d["id"]),
        "last_seen": d.get("last_seen"),
        "created_at": d.get("created_at"),
    }


@api.post("/devices/register")
async def register_device(body: DeviceRegisterBody, user: dict = Depends(get_current_user)):
    """Idempotent per (user, name). Returns the device + a long-lived agent token."""
    existing = await db.devices.find_one({"user_id": user["id"], "name": body.name})
    if existing:
        device = existing
    else:
        device = {
            "id": uuid.uuid4().hex,
            "user_id": user["id"],
            "name": body.name,
            "created_at": now_utc().isoformat(),
            "last_seen": None,
        }
        await db.devices.insert_one(device)
    agent_token = make_agent_token(user["id"], device["id"])
    result = await _device_public(device)
    result["agent_token"] = agent_token
    return result


@api.get("/devices")
async def list_devices(user: dict = Depends(get_current_user)):
    devices = await db.devices.find({"user_id": user["id"]}).to_list(500)
    return [await _device_public(d) for d in devices]


@api.delete("/devices/{device_id}")
async def delete_device(device_id: str, user: dict = Depends(get_current_user)):
    res = await db.devices.delete_one({"id": device_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Device not found")
    return {"deleted": True}


# --------------------------------------------------------------------------- #
# Pairing routes
# --------------------------------------------------------------------------- #
@api.post("/devices/pair/new")
async def pair_new(user: dict = Depends(get_current_user)):
    """Mobile generates a short-lived pairing code + OTP for a desktop agent."""
    code = "".join(random.choices(string.digits, k=9))
    otp = "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
    await db.pairings.delete_many({"user_id": user["id"]})  # one active pairing per user
    await db.pairings.insert_one({
        "code": code,
        "otp": otp,
        "user_id": user["id"],
        "created_at": now_utc().isoformat(),
        "expires_at": (now_utc() + timedelta(minutes=10)).isoformat(),
    })
    return {"code": code, "otp": otp, "expires_in": 600}


@api.post("/devices/pair/claim")
async def pair_claim(body: PairClaimBody):
    """Desktop agent claims a pairing -> creates the device + returns an agent token."""
    pairing = await db.pairings.find_one({"code": body.code, "otp": body.otp.upper()})
    if not pairing:
        raise HTTPException(status_code=404, detail="Invalid pairing code")
    if datetime.fromisoformat(pairing["expires_at"]) < now_utc():
        await db.pairings.delete_one({"_id": pairing["_id"]})
        raise HTTPException(status_code=410, detail="Pairing code expired")

    device = {
        "id": uuid.uuid4().hex,
        "user_id": pairing["user_id"],
        "name": body.name,
        "created_at": now_utc().isoformat(),
        "last_seen": None,
    }
    await db.devices.insert_one(device)
    await db.pairings.delete_one({"_id": pairing["_id"]})
    agent_token = make_agent_token(pairing["user_id"], device["id"])
    return {"device_id": device["id"], "name": device["name"], "agent_token": agent_token}


# --------------------------------------------------------------------------- #
# Session (audit) routes
# --------------------------------------------------------------------------- #
@api.get("/sessions")
async def list_sessions(user: dict = Depends(get_current_user)):
    sessions = (
        await db.sessions.find({"user_id": user["id"]})
        .sort("started_at", -1)
        .to_list(200)
    )
    return [
        {
            "id": s["id"],
            "device_id": s["device_id"],
            "device_name": s.get("device_name"),
            "started_at": s.get("started_at"),
            "ended_at": s.get("ended_at"),
            "duration_sec": s.get("duration_sec"),
        }
        for s in sessions
    ]


# --------------------------------------------------------------------------- #
# WebSocket relay
# --------------------------------------------------------------------------- #
async def _safe_send(ws: Optional[WebSocket], data: str):
    if ws is None:
        return
    try:
        await ws.send_text(data)
    except Exception:
        pass


@api.websocket("/ws/agent")
async def ws_agent(websocket: WebSocket, token: str = Query(...)):
    """Desktop agent connection. Accepts an agent token (type=agent) or a user
    token together with a valid device_id query param."""
    try:
        payload = decode_token(token)
    except HTTPException:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    device_id = payload.get("device_id") or websocket.query_params.get("device_id")
    if not device_id:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    device = await db.devices.find_one({"id": device_id, "user_id": payload["sub"]})
    if not device:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept()
    relay.agents[device_id] = websocket
    await db.devices.update_one({"id": device_id}, {"$set": {"last_seen": now_utc().isoformat()}})
    logger.info(f"Agent connected: device={device_id}")

    # Tell the agent whether a viewer is already waiting.
    await _safe_send(websocket, json.dumps({
        "type": "viewer", "active": device_id in relay.controllers,
    }))

    try:
        while True:
            msg = await websocket.receive_text()
            # Relay frames / agent messages to the controller (if any).
            await _safe_send(relay.controllers.get(device_id), msg)
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.warning(f"Agent socket error device={device_id}: {e}")
    finally:
        if relay.agents.get(device_id) is websocket:
            relay.agents.pop(device_id, None)
        await db.devices.update_one({"id": device_id}, {"$set": {"last_seen": now_utc().isoformat()}})
        # Notify controller the agent dropped.
        await _safe_send(relay.controllers.get(device_id),
                         json.dumps({"type": "agent_disconnected"}))
        logger.info(f"Agent disconnected: device={device_id}")


@api.websocket("/ws/control")
async def ws_control(websocket: WebSocket, token: str = Query(...), device_id: str = Query(...)):
    """Mobile controller connection."""
    try:
        payload = decode_token(token)
    except HTTPException:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    if payload.get("type") != "user":
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    device = await db.devices.find_one({"id": device_id, "user_id": payload["sub"]})
    if not device:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept()

    # Only one controller per device — replace any previous one.
    old = relay.controllers.get(device_id)
    if old is not None:
        await _safe_send(old, json.dumps({"type": "replaced"}))
    relay.controllers[device_id] = websocket

    agent_ws = relay.agents.get(device_id)
    await websocket.send_text(json.dumps({
        "type": "status", "agent_online": agent_ws is not None,
    }))
    await _safe_send(agent_ws, json.dumps({"type": "viewer", "active": True}))

    # Start a session audit log.
    session_id = uuid.uuid4().hex
    started = now_utc()
    await db.sessions.insert_one({
        "id": session_id,
        "user_id": payload["sub"],
        "device_id": device_id,
        "device_name": device["name"],
        "started_at": started.isoformat(),
        "ended_at": None,
        "duration_sec": None,
    })

    try:
        while True:
            msg = await websocket.receive_text()
            # Relay control events to the agent.
            await _safe_send(relay.agents.get(device_id), msg)
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.warning(f"Control socket error device={device_id}: {e}")
    finally:
        if relay.controllers.get(device_id) is websocket:
            relay.controllers.pop(device_id, None)
            await _safe_send(relay.agents.get(device_id),
                             json.dumps({"type": "viewer", "active": False}))
        ended = now_utc()
        await db.sessions.update_one(
            {"id": session_id},
            {"$set": {
                "ended_at": ended.isoformat(),
                "duration_sec": int((ended - started).total_seconds()),
            }},
        )
        logger.info(f"Controller disconnected: device={device_id}")


# --------------------------------------------------------------------------- #
# App wiring
# --------------------------------------------------------------------------- #
app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.devices.create_index("id", unique=True)
    await db.devices.create_index("user_id")
    await db.pairings.create_index("code")
    logger.info("AnyControl Remote API started")


@app.on_event("shutdown")
async def shutdown():
    client.close()
