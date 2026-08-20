import fs from 'fs';
import path from 'path';
import axios from 'axios';
import WebSocket from 'ws';
import { Command } from 'commander';
import dotenv from 'dotenv';
import jpeg from 'jpeg-js';

// Load environment variables
const ROOT_DIR = path.join(__dirname, '..');
dotenv.config({ path: path.join(ROOT_DIR, '.env') });

const STATE_FILE = path.join(ROOT_DIR, 'agent_state.json');
const FRAME_INTERVAL = 120; // ms (~8 fps)

interface State {
  server?: string;
  agent_token?: string;
  device_id?: string;
  name?: string;
}

function loadState(): State {
  if (fs.existsSync(STATE_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    } catch (err) {
      return {};
    }
  }
  return {};
}

function saveState(state: State) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

// REST helper
function http(server: string, endpoint: string): string {
  return server.replace(/\/$/, '') + endpoint;
}

// Provisioning logic
async function provision(args: any): Promise<State> {
  const state = loadState();
  if (state.agent_token && state.device_id && !args.reset) {
    state.server = args.server || state.server;
    console.log(`Using cached device credentials (${state.device_id})`);
    return state;
  }

  const server = args.server || state.server;
  if (!server) {
    console.error('A --server URL is required for first-time setup.');
    process.exit(1);
  }

  if (args.pair) {
    try {
      console.log(`Attempting to claim pairing code: ${args.pair}...`);
      const response = await axios.post(http(server, '/api/devices/pair/claim'), {
        code: args.pair,
        otp: args.otp || '',
        name: args.name,
      });

      const data = response.data;
      const newState: State = {
        server,
        agent_token: data.agent_token,
        device_id: data.device_id,
        name: data.name,
      };
      saveState(newState);
      console.log(`Paired successfully as device ${data.device_id}`);
      return newState;
    } catch (err: any) {
      console.error(`Pairing failed: ${err.response?.status} ${JSON.stringify(err.response?.data)}`);
      process.exit(1);
    }
  }

  if (args.email && args.password) {
    try {
      console.log(`Attempting account login for ${args.email}...`);
      const loginRes = await axios.post(http(server, '/api/auth/login'), {
        email: args.email,
        password: args.password,
      });
      const userToken = loginRes.data.token;

      console.log('Registering device...');
      const deviceRes = await axios.post(
        http(server, '/api/devices/register'),
        { name: args.name },
        { headers: { Authorization: `Bearer ${userToken}` } }
      );

      const data = deviceRes.data;
      const newState: State = {
        server,
        agent_token: data.agent_token,
        device_id: data.id,
        name: data.name,
      };
      saveState(newState);
      console.log(`Registered device successfully as ${data.id}`);
      return newState;
    } catch (err: any) {
      console.error(`Registration failed: ${err.response?.status} ${JSON.stringify(err.response?.data)}`);
      process.exit(1);
    }
  }

  }

  // If no provisioning parameters are provided, default to QR code pairing
  console.log("No credentials provided. Initializing terminal QR code pairing...");
  try {
    const qrcode = require('qrcode-terminal');
    console.log(`Contacting server ${server} for pairing code...`);
    const initRes = await axios.post(http(server, '/api/devices/pair/agent-new'), {
      name: args.name
    });
    const { code, otp } = initRes.data;

    // We encode the pairing details into a JSON payload
    const qrPayload = JSON.stringify({ code, otp });
    
    console.log('\n======================================================');
    console.log('To link this laptop, scan the QR code below on your phone:');
    console.log('======================================================\n');
    
    qrcode.generate(qrPayload, { small: true });

    console.log(`Pairing Code: ${code}  |  OTP: ${otp}`);
    console.log('Waiting for you to scan this QR code inside the web app...\n');

    // Poll until claimed
    while (true) {
      try {
        const checkRes = await axios.post(http(server, '/api/devices/pair/agent-check'), { code, otp });
        if (checkRes.data.status === 'claimed') {
          const data = checkRes.data;
          const newState: State = {
            server,
            agent_token: data.agent_token,
            device_id: data.device_id,
            name: data.name,
          };
          saveState(newState);
          console.log(`\nSuccess! Registered device successfully as ${data.device_id}\n`);
          return newState;
        }
      } catch (checkErr) {
        console.error('\nPairing failed or session expired. Please restart the agent.');
        process.exit(1);
      }
      await new Promise(r => setTimeout(r, 2000));
    }
  } catch (err: any) {
    console.error(`QR Code pairing setup failed: ${err.message || err}`);
    process.exit(1);
  }
}

// --------------------------------------------------------------------------- //
// Capturing and input simulation backends
// --------------------------------------------------------------------------- //

class DemoBackend {
  width = 1280;
  height = 720;
  frame = 0;

  capture(): Buffer {
    this.frame++;
    const frameData = Buffer.alloc(this.width * this.height * 4);

    // Draw background (dark gray: 15, 15, 15)
    for (let i = 0; i < frameData.length; i += 4) {
      frameData[i] = 15;     // R
      frameData[i + 1] = 15; // G
      frameData[i + 2] = 15; // B
      frameData[i + 3] = 255; // A
    }

    // Draw simulated active moving block to verify relay framerate
    const rectSize = 100;
    const rectX = Math.floor((this.width - rectSize) / 2 + Math.cos(this.frame * 0.1) * 300);
    const rectY = Math.floor((this.height - rectSize) / 2 + Math.sin(this.frame * 0.1) * 200);

    for (let y = rectY; y < rectY + rectSize; y++) {
      if (y < 0 || y >= this.height) continue;
      for (let x = rectX; x < rectX + rectSize; x++) {
        if (x < 0 || x >= this.width) continue;
        const idx = (y * this.width + x) * 4;
        frameData[idx] = 255;     // Orange R
        frameData[idx + 1] = 109; // Orange G
        frameData[idx + 2] = 0;   // Orange B
      }
    }

    const rawImageData = {
      data: frameData,
      width: this.width,
      height: this.height,
    };
    const jpegImageData = jpeg.encode(rawImageData, 55);
    return jpegImageData.data;
  }

  move(nx: number, ny: number) {
    console.log(`[demo] move -> (${nx.toFixed(3)}, ${ny.toFixed(3)})`);
  }

  click(nx: number, ny: number, button = 'left', double = false) {
    console.log(`[demo] click ${button}${double ? ' x2' : ''} -> (${nx.toFixed(3)}, ${ny.toFixed(3)})`);
  }

  scroll(dy: number) {
    console.log(`[demo] scroll ${dy}`);
  }

  key(name: string) {
    console.log(`[demo] key ${name}`);
  }

  typeText(text: string) {
    console.log(`[demo] type ${JSON.stringify(text)}`);
  }

  hotkey(keys: string[]) {
    console.log(`[demo] hotkey ${keys.join('+')}`);
  }
}

class RealBackend {
  width = 1920;
  height = 1080;
  private nutMouse: any;
  private nutKeyboard: any;
  private nutKey: any;
  private nutButton: any;
  private screenshot: any;

  constructor() {
    try {
      this.nutMouse = require('@nut-tree-fork/nut-js').mouse;
      this.nutKeyboard = require('@nut-tree-fork/nut-js').keyboard;
      this.nutKey = require('@nut-tree-fork/nut-js').Key;
      this.nutButton = require('@nut-tree-fork/nut-js').Button;
      this.screenshot = require('screenshot-desktop');
    } catch (err) {
      console.error('Failed to load real input automation dependencies. Forcing fallback to DemoBackend.', err);
      throw err;
    }
  }

  async capture(): Promise<Buffer> {
    return await this.screenshot({ format: 'jpeg' });
  }

  async move(nx: number, ny: number) {
    const targetX = Math.floor(nx * this.width);
    const targetY = Math.floor(ny * this.height);
    const { Point } = require('@nut-tree-fork/nut-js');
    await this.nutMouse.setPosition(new Point(targetX, targetY));
  }

  async click(nx: number, ny: number, button = 'left', double = false) {
    await this.move(nx, ny);
    const btn = button === 'right' ? this.nutButton.RIGHT : this.nutButton.LEFT;
    if (double) {
      await this.nutMouse.doubleClick(btn);
    } else {
      await this.nutMouse.click(btn);
    }
  }

  async scroll(dy: number) {
    if (dy > 0) {
      await this.nutMouse.scrollUp(Math.abs(dy) * 100);
    } else if (dy < 0) {
      await this.nutMouse.scrollDown(Math.abs(dy) * 100);
    }
  }

  async key(name: string) {
    const keyEnum = (this.nutKey as any)[name.toUpperCase()] || name;
    await this.nutKeyboard.pressKey(keyEnum);
    await this.nutKeyboard.releaseKey(keyEnum);
  }

  async typeText(text: string) {
    await this.nutKeyboard.type(text);
  }

  async hotkey(keys: string[]) {
    const mappedKeys = keys.map(k => (this.nutKey as any)[k.toUpperCase()] || k);
    await this.nutKeyboard.pressKey(...mappedKeys);
    await this.nutKeyboard.releaseKey(...mappedKeys);
  }
}

// --------------------------------------------------------------------------- //
// Websocket streaming execution loop
// --------------------------------------------------------------------------- //

async function run(state: State, backend: any, demo: boolean) {
  const wsBase = state.server!
    .replace('http://', 'ws://')
    .replace('https://', 'wss://')
    .replace(/\/$/, '');
  const url = `${wsBase}/api/ws/agent?token=${state.agent_token}`;

  while (true) {
    try {
      console.log(`Connecting to WebSocket relay: ${url}`);
      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(url);
        let viewerActive = { on: false };
        let streamTimer: NodeJS.Timeout | null = null;

        ws.on('open', () => {
          console.log('Connected to relay. Waiting for viewer...');

          // Run streaming loop
          streamTimer = setInterval(async () => {
            if (viewerActive.on) {
              try {
                const imgData = await backend.capture();
                const b64 = imgData.toString('base64');
                ws.send(JSON.stringify({
                  type: 'frame',
                  data: b64,
                  w: backend.width,
                  h: backend.height,
                }));
              } catch (err) {
                console.error('Capture/send frame failed:', err);
              }
            }
          }, FRAME_INTERVAL);
        });

        ws.on('message', async (data) => {
          try {
            const msg = JSON.parse(data.toString());
            await handleControl(backend, msg, viewerActive);
          } catch (err) {
            // ignore malformed packets
          }
        });

        ws.on('close', (code, reason) => {
          console.warn(`WebSocket disconnected: ${code} - ${reason.toString()}`);
          if (streamTimer) clearInterval(streamTimer);
          reject(new Error('Connection closed'));
        });

        ws.on('error', (err) => {
          console.error('WebSocket connection error:', err);
          if (streamTimer) clearInterval(streamTimer);
          reject(err);
        });
      });
    } catch (err) {
      console.log('Reconnecting in 3 seconds...');
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

async function handleControl(backend: any, msg: any, viewerActive: any) {
  const t = msg.type;
  if (t === 'viewer') {
    viewerActive.on = !!msg.active;
    console.log(`Viewer ${viewerActive.on ? 'attached' : 'detached'}`);
  } else if (t === 'move') {
    await backend.move(msg.x, msg.y);
  } else if (t === 'click') {
    await backend.click(msg.x, msg.y, msg.button || 'left', !!msg.double);
  } else if (t === 'scroll') {
    await backend.scroll(msg.dy || 0);
  } else if (t === 'key') {
    await backend.key(msg.key);
  } else if (t === 'text') {
    await backend.typeText(msg.text);
  } else if (t === 'hotkey') {
    await backend.hotkey(msg.keys || []);
  }
}

// --------------------------------------------------------------------------- //
// CLI Entrypoint
// --------------------------------------------------------------------------- //

async function main() {
  const program = new Command();
  program
    .description('AnyControl Remote Desktop Agent in Node.js')
    .option('--server <url>', 'AnyControl server URL', process.env.ANYCONTROL_SERVER)
    .option('--name <name>', 'Device registration name', process.env.ANYCONTROL_NAME || 'My Desktop')
    .option('--pair <code>', '9-digit pairing code from mobile app')
    .option('--otp <otp>', 'OTP paired code validation')
    .option('--email <email>', 'Account email')
    .option('--password <password>', 'Account password')
    .option('--demo', 'Enable headless synthetic frame generation', false)
    .option('--reset', 'Ignore cached authentication state', false);

  program.parse(process.argv);
  const options = program.opts();

  const state = await provision(options);

  let backend: any;
  if (options.demo) {
    console.log('Starting agent in DEMO mode');
    backend = new DemoBackend();
  } else {
    try {
      console.log('Starting agent in LIVE mode');
      backend = new RealBackend();
    } catch (err) {
      console.warn('Fallback to DEMO mode due to environment missing automation libs');
      backend = new DemoBackend();
      options.demo = true;
    }
  }

  console.log(`Screen resolution: ${backend.width}x${backend.height} | Mode: ${options.demo ? 'demo' : 'live'}`);

  process.on('SIGINT', () => {
    console.log('Agent stopped.');
    process.exit(0);
  });

  await run(state, backend, options.demo);
}

main().catch(err => {
  console.error('Unhandled fatal exception:', err);
  process.exit(1);
});
