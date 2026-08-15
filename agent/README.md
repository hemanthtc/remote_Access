# AnyControl Remote — Desktop Agent

Cross-platform (Windows / macOS / Linux) agent that lets you control this
computer from the AnyControl Remote mobile app.

## Install

```bash
cd agent
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

## Connect

### Option A — Pairing code (recommended)
1. Open the mobile app → **Add Device** → note the 9-digit code and OTP.
2. On the computer:
   ```bash
   python agent.py --server https://YOUR-BACKEND-URL \
     --pair 123456789 --otp ABC123 --name "My Laptop"
   ```

### Option B — Account login
```bash
python agent.py --server https://YOUR-BACKEND-URL \
  --email you@mail.com --password yourpass --name "My Laptop"
```

Credentials are cached in `agent_state.json`; later runs just need:
```bash
python agent.py
```

## Headless / testing
```bash
python agent.py --server https://YOUR-BACKEND-URL --demo \
  --email you@mail.com --password yourpass --name "Demo Host"
```
`--demo` generates synthetic frames and only logs input events (no real
screen or mouse/keyboard needed).

## Security notes
- The agent talks to the backend over TLS (`wss://`) and authenticates with a
  device-scoped token.
- Only stream frames while a viewer is attached (bandwidth + privacy).
- Revoke access anytime by deleting the device in the mobile app.
