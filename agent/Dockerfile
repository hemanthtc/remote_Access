# Desktop agent container. NOTE: capturing a real screen / controlling input
# requires access to the host display (X11 / Wayland) and is intended for
# Linux hosts. For headless testing use `--demo`.
FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libx11-6 libxext6 libxrender1 libxtst6 libxi6 scrot \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /agent
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY agent.py .

# Pass configuration via env or CLI args, e.g.:
#   docker run --rm -e ANYCONTROL_SERVER=https://host anycontrol-agent \
#     python agent.py --demo --name "Docker Host"
ENTRYPOINT ["python", "agent.py"]
CMD ["--demo"]
