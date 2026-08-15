# AnyControl Remote — Product Requirements & Progress

## Original Problem Statement
Build a secure, cross-platform remote desktop system like AnyDesk with a custom
architecture: Android app, desktop agent, back-end API, JWT auth, WebSocket
streaming, mouse/keyboard control, file transfer, security, logging, and Docker
support. The laptop screen is shown on the phone; touches on the phone control
the laptop. Must be secure, simple (not over-complex), and delivered modularly.

## Architecture
- **Backend**: FastAPI + MongoDB (Motor). JWT auth (bcrypt), device registry,
  pairing codes, session audit logs, and an in-memory WebSocket relay that
  forwards JPEG frames (agent→controller) and input events (controller→agent).
  All routes under `/api`. Env: MONGO_URL, DB_NAME, JWT_SECRET.
- **Desktop agent** (`/app/agent/agent.py`): cross-platform Python. Captures the
  screen (mss), streams base64 JPEG frames, executes mouse/keyboard via pynput.
  `--demo` mode = synthetic frames + logged events (headless/testable). Pairing
  or account-login provisioning; caches creds in agent_state.json.
- **Mobile app**: Expo Router (file-based). Dark-First Utility design
  (Rajdhani + Barlow fonts, amber accent). Screens: Auth (login/register),
  Devices dashboard, Add Device (pairing), Remote Viewer (live canvas + touch
  gestures + keyboard + floating toolbar), Activity (session logs), Settings.
- **Docker**: backend Dockerfile, agent Dockerfile, docker-compose (backend + mongo).

## User Personas
- Individual who wants to control their own laptop/PC from their phone remotely
  (support, quick access, presentations).

## Core Requirements (static)
- Secure JWT auth; encrypted transport (WSS in production).
- Live screen view on phone; touch → remote mouse; keyboard input.
- Device online/offline status; connection audit logs.
- Simple, modular, not over-complex. Docker support.

## Implemented (2026-08-15)
- JWT auth: register / login / me (bcrypt, 30d user tokens, 365d agent tokens).
- Devices: register (idempotent), list w/ live online status, delete.
- Pairing: mobile generates 9-digit code + OTP; agent claims → agent token.
- WebSocket relay: agent ↔ controller frame + input relay; viewer-active signaling.
- Session audit logs (start/end/duration) created on controller connect/disconnect.
- Mobile: full auth flow, devices dashboard, add-device, remote viewer with
  tap=click, drag=move, long-press=right-click, double-tap=double-click,
  keyboard typing, special keys (Esc/Tab/arrows/Ctrl+C/Ctrl+V/Ctrl+Alt+Del).
- Desktop agent (real + demo modes) + README; Docker files + compose.
- Verified end-to-end: login → devices → live viewer; 17/17 backend tests pass.

## Backlog / Remaining
- **P1 File transfer** (phone ↔ computer) — requested in v1, deferred.
- **P1** Landscape/orientation lock in viewer for larger remote view.
- **P2** Trackpad (relative cursor) mode toggle; scroll gesture (two-finger).
- **P2** Multiple concurrent viewers; refresh-token rotation & logout revocation.
- **P2** Frame quality/FPS control from the app; WebRTC upgrade for high-FPS.
- **P2** Rate limiting / account lockout on auth.

## Next Tasks
1. File transfer module (upload/download via backend + Object Storage).
2. Viewer landscape mode + zoom/pan for precise control.
3. Trackpad mode + scrolling.
