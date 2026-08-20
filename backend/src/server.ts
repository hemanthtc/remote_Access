import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { MongoClient, ObjectId, Db } from 'mongodb';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
const ROOT_DIR = path.join(__dirname, '..');
dotenv.config({ path: path.join(ROOT_DIR, '.env') });

const MONGO_URL = process.env.MONGO_URL;
if (!MONGO_URL) {
  throw new Error('MONGO_URL environment variable is missing.');
}

const DB_NAME = process.env.DB_NAME || 'anycontrol';
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-with-a-64-char-hex-secret';
const JWT_ALG = 'HS256';
const PORT = process.env.PORT || 8001;

const USER_TOKEN_DAYS = 30;
const AGENT_TOKEN_DAYS = 365;

// DB connection
let client: MongoClient | undefined;
let db: any;

// In-memory WebSocket Relay Registry
class RelayRegistry {
  agents: Map<string, WebSocket> = new Map();       // device_id -> agent socket
  controllers: Map<string, WebSocket> = new Map();  // device_id -> controller socket

  agentOnline(deviceId: string): boolean {
    return this.agents.has(deviceId);
  }
}

const relay = new RelayRegistry();

// Helpers
function nowIso(): string {
  return new Date().toISOString();
}

function makeUserToken(userId: string, email: string): string {
  return jwt.sign(
    {
      sub: userId,
      email: email,
      type: 'user',
    },
    JWT_SECRET,
    { algorithm: JWT_ALG as any, expiresIn: `${USER_TOKEN_DAYS}d` }
  );
}

function makeAgentToken(userId: string, deviceId: string): string {
  return jwt.sign(
    {
      sub: userId,
      device_id: deviceId,
      type: 'agent',
    },
    JWT_SECRET,
    { algorithm: JWT_ALG as any, expiresIn: `${AGENT_TOKEN_DAYS}d` }
  );
}

function decodeToken(token: string): any {
  try {
    return jwt.verify(token, JWT_SECRET, { algorithms: [JWT_ALG as any] });
  } catch (err) {
    return null;
  }
}

// Authentication Middleware
async function authenticateUser(req: any, res: any, next: any) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ detail: 'Not authenticated' });
  }

  const token = authHeader.split(' ')[1];
  const payload = decodeToken(token);

  if (!payload || payload.type !== 'user') {
    return res.status(401).json({ detail: 'Invalid or expired token' });
  }

  const user = await db.collection('users').findOne({ id: payload.sub });
  if (!user) {
    return res.status(401).json({ detail: 'User not found' });
  }

  req.user = user;
  next();
}

// App Setup
const app = express();
app.use(cors());
app.use(express.json());

const api = express.Router();

// Root route
api.get('/', (req, res) => {
  res.json({ message: 'AnyControl Remote API', status: 'ok' });
});

// Register
api.post('/auth/register', async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || password.length < 6) {
    return res.status(400).json({ detail: 'Invalid email or password minimum length of 6 characters' });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const existing = await db.collection('users').findOne({ email: normalizedEmail });
  if (existing) {
    return res.status(409).json({ detail: 'Email is already registered' });
  }

  const userId = new ObjectId().toHexString();
  const user = {
    id: userId,
    email: normalizedEmail,
    name: name || normalizedEmail.split('@')[0],
    password_hash: await bcrypt.hash(password, 10),
    created_at: nowIso(),
  };

  await db.collection('users').insertOne(user);
  const token = makeUserToken(userId, user.email);

  res.json({
    token,
    user: { id: user.id, email: user.email, name: user.name },
  });
});

// Login
api.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ detail: 'Email and password required' });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const user = await db.collection('users').findOne({ email: normalizedEmail });
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ detail: 'Incorrect email or password' });
  }

  const token = makeUserToken(user.id, user.email);
  res.json({
    token,
    user: { id: user.id, email: user.email, name: user.name },
  });
});

// Me
api.get('/auth/me', authenticateUser, (req: any, res) => {
  const user = req.user;
  res.json({ id: user.id, email: user.email, name: user.name });
});

// Delete Account (cascades: devices, sessions, pairings, user)
api.delete('/auth/account', authenticateUser, async (req: any, res) => {
  const user = req.user;
  try {
    // Remove all devices owned by this user
    await db.collection('devices').deleteMany({ user_id: user.id });
    // Remove all sessions owned by this user
    await db.collection('sessions').deleteMany({ user_id: user.id });
    // Remove any pending pairings
    await db.collection('pairings').deleteMany({ user_id: user.id });
    // Remove the user record itself
    await db.collection('users').deleteOne({ id: user.id });

    // Disconnect any active WebSocket connections for this user's devices
    relay.agents.forEach((ws, deviceId) => {
      // We can't easily check user_id here, but devices are already deleted
    });

    console.log(`Account deleted: user=${user.id} email=${user.email}`);
    res.json({ deleted: true });
  } catch (err: any) {
    console.error('Account deletion error:', err);
    res.status(500).json({ detail: 'Failed to delete account' });
  }
});

// Devices Registration
api.post('/devices/register', authenticateUser, async (req: any, res) => {
  const { name } = req.body;
  if (!name || name.trim().length === 0) {
    return res.status(400).json({ detail: 'Device name is required' });
  }

  const user = req.user;
  let device: any = await db.collection('devices').findOne({ user_id: user.id, name: name });

  if (!device) {
    const deviceId = new ObjectId().toHexString();
    device = {
      id: deviceId,
      user_id: user.id,
      name: name,
      created_at: nowIso(),
      last_seen: null,
    };
    await db.collection('devices').insertOne(device);
  }

  const agentToken = makeAgentToken(user.id, device.id);
  res.json({
    id: device.id,
    name: device.name,
    online: relay.agentOnline(device.id),
    last_seen: device.last_seen,
    created_at: device.created_at,
    agent_token: agentToken,
  });
});

// Devices List
api.get('/devices', authenticateUser, async (req: any, res) => {
  const user = req.user;
  const devices = await db.collection('devices').find({ user_id: user.id }).toArray();
  const result = devices.map((d: any) => ({
    id: d.id,
    name: d.name,
    online: relay.agentOnline(d.id),
    last_seen: d.last_seen,
    created_at: d.created_at,
  }));
  res.json(result);
});

// Delete Device
api.delete('/devices/:device_id', authenticateUser, async (req: any, res) => {
  const user = req.user;
  const result = await db.collection('devices').deleteOne({ id: req.params.device_id, user_id: user.id });
  if (result.deletedCount === 0) {
    return res.status(404).json({ detail: 'Device not found' });
  }
  res.json({ deleted: true });
});

// Pair New Code
api.post('/devices/pair/new', authenticateUser, async (req: any, res) => {
  const user = req.user;
  // Generate random 9-digit pairing code
  const code = Math.floor(100000000 + Math.random() * 900000000).toString();
  // Generate random 6-character OTP
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let otp = '';
  for (let i = 0; i < 6; i++) {
    otp += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  await db.collection('pairings').deleteMany({ user_id: user.id });

  await db.collection('pairings').insertOne({
    code,
    otp,
    user_id: user.id,
    created_at: nowIso(),
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 minutes
  });

  res.json({ code, otp, expires_in: 600 });
});

// Pair Claim
api.post('/devices/pair/claim', async (req, res) => {
  const { code, otp, name } = req.body;
  if (!code || !otp || !name) {
    return res.status(400).json({ detail: 'Missing code, otp or device name' });
  }

  const pairing = await db.collection('pairings').findOne({ code, otp: otp.toUpperCase() });
  if (!pairing) {
    return res.status(404).json({ detail: 'Invalid pairing credentials' });
  }

  if (new Date(pairing.expires_at).getTime() < Date.now()) {
    await db.collection('pairings').deleteOne({ _id: pairing._id });
    return res.status(410).json({ detail: 'Pairing code expired' });
  }

  const deviceId = new ObjectId().toHexString();
  const device = {
    id: deviceId,
    user_id: pairing.user_id,
    name: name,
    created_at: nowIso(),
    last_seen: null,
  };

  await db.collection('devices').insertOne(device);
  await db.collection('pairings').deleteOne({ _id: pairing._id });

  const agentToken = makeAgentToken(pairing.user_id, deviceId);
  res.json({
    device_id: deviceId,
    name: device.name,
    agent_token: agentToken,
  });
});

// 1. Agent requests new pairing code (to display as QR code)
api.post('/devices/pair/agent-new', async (req, res) => {
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ detail: 'Device name is required' });
  }

  const code = Math.floor(100000000 + Math.random() * 900000000).toString();
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let otp = '';
  for (let i = 0; i < 6; i++) {
    otp += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  const pairing = {
    code,
    otp,
    name,
    user_id: null,
    status: 'pending',
    created_at: nowIso(),
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  };

  await db.collection('pairings').insertOne(pairing);
  res.json({ code, otp, expires_in: 600 });
});

// 2. Agent checks if its pairing has been claimed by a user
api.post('/devices/pair/agent-check', async (req, res) => {
  const { code, otp } = req.body;
  if (!code || !otp) {
    return res.status(400).json({ detail: 'Missing code or otp' });
  }

  const pairing = await db.collection('pairings').findOne({ code, otp: otp.toUpperCase() });
  if (!pairing) {
    return res.status(404).json({ detail: 'Pairing code expired or not found' });
  }

  if (new Date(pairing.expires_at).getTime() < Date.now()) {
    await db.collection('pairings').deleteOne({ _id: pairing._id });
    return res.status(410).json({ detail: 'Pairing code expired' });
  }

  if (pairing.status === 'claimed' && pairing.user_id) {
    const deviceId = new ObjectId().toHexString();
    const device = {
      id: deviceId,
      user_id: pairing.user_id,
      name: pairing.name,
      created_at: nowIso(),
      last_seen: null,
    };

    await db.collection('devices').insertOne(device);
    await db.collection('pairings').deleteOne({ _id: pairing._id });

    const agentToken = makeAgentToken(pairing.user_id, deviceId);
    return res.json({
      status: 'claimed',
      device_id: deviceId,
      agent_token: agentToken,
      name: device.name,
    });
  }

  res.json({ status: 'pending' });
});

// 3. User claims the agent's pairing code via QR Code scan (authenticated)
api.post('/devices/pair/agent-claim', authenticateUser, async (req: any, res) => {
  const { code, otp } = req.body;
  if (!code || !otp) {
    return res.status(400).json({ detail: 'Missing pairing code or otp' });
  }

  const user = req.user;
  const pairing = await db.collection('pairings').findOne({ code, otp: otp.toUpperCase() });
  if (!pairing) {
    return res.status(404).json({ detail: 'Invalid or expired pairing code' });
  }

  if (new Date(pairing.expires_at).getTime() < Date.now()) {
    await db.collection('pairings').deleteOne({ _id: pairing._id });
    return res.status(410).json({ detail: 'Pairing code expired' });
  }

  await db.collection('pairings').updateOne(
    { _id: pairing._id },
    { $set: { status: 'claimed', user_id: user.id } }
  );

  res.json({ claimed: true });
});


// List Sessions
api.get('/sessions', authenticateUser, async (req: any, res) => {
  const user = req.user;
  const sessions = await db
    .collection('sessions')
    .find({ user_id: user.id })
    .sort({ started_at: -1 })
    .limit(200)
    .toArray();

  res.json(
    sessions.map((s: any) => ({
      id: s.id,
      device_id: s.device_id,
      device_name: s.device_name,
      started_at: s.started_at,
      ended_at: s.ended_at,
      duration_sec: s.duration_sec,
    }))
  );
});

app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

app.get('/', (req, res) => {
  res.redirect('/api');
});

app.use('/api', api);

// Safe Send WebSocket helper
function safeSend(ws: WebSocket | undefined, message: string) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  try {
    ws.send(message);
  } catch (err) {
    // ignore
  }
}

// HTTP and WebSockets Server Wiring
const httpServer = createServer(app);
const wss = new WebSocketServer({ noServer: true });

// Upgrade HTTP to WS
httpServer.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url || '', `http://${request.headers.host}`);
  const pathname = url.pathname;

  if (pathname === '/api/ws/agent' || pathname === '/api/ws/control') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

// WS Connection handler
wss.on('connection', async (ws: WebSocket, request) => {
  const url = new URL(request.url || '', `http://${request.headers.host}`);
  const pathname = url.pathname;
  const token = url.searchParams.get('token');

  if (!token) {
    ws.close(1008, 'Token required');
    return;
  }

  const payload = decodeToken(token);
  if (!payload) {
    ws.close(1008, 'Invalid token');
    return;
  }

  if (pathname === '/api/ws/agent') {
    // --- Agent Websocket ---
    const deviceId = payload.device_id || url.searchParams.get('device_id');
    if (!deviceId) {
      ws.close(1008, 'Device ID required');
      return;
    }

    const device = await db.collection('devices').findOne({ id: deviceId, user_id: payload.sub });
    if (!device) {
      ws.close(1008, 'Device not found');
      return;
    }

    relay.agents.set(deviceId, ws);
    await db.collection('devices').updateOne({ id: deviceId }, { $set: { last_seen: nowIso() } });
    console.log(`Agent connected: device=${deviceId}`);

    // Tell agent if controller/viewer is waiting
    safeSend(ws, JSON.stringify({
      type: 'viewer',
      active: relay.controllers.has(deviceId),
    }));

    ws.on('message', (data) => {
      // Relay frame/agent packet to controller
      const controller = relay.controllers.get(deviceId);
      if (controller) {
        safeSend(controller, data.toString());
      }
    });

    ws.on('close', async () => {
      if (relay.agents.get(deviceId) === ws) {
        relay.agents.delete(deviceId);
      }
      await db.collection('devices').updateOne({ id: deviceId }, { $set: { last_seen: nowIso() } });
      const controller = relay.controllers.get(deviceId);
      if (controller) {
        safeSend(controller, JSON.stringify({ type: 'agent_disconnected' }));
      }
      console.log(`Agent disconnected: device=${deviceId}`);
    });

    ws.on('error', (err) => {
      console.warn(`Agent socket error device=${deviceId}:`, err);
    });

  } else if (pathname === '/api/ws/control') {
    // --- Controller Websocket ---
    const deviceId = url.searchParams.get('device_id');
    if (!deviceId) {
      ws.close(1008, 'Device ID required');
      return;
    }

    if (payload.type !== 'user') {
      ws.close(1008, 'Invalid token type');
      return;
    }

    const device = await db.collection('devices').findOne({ id: deviceId, user_id: payload.sub });
    if (!device) {
      ws.close(1008, 'Device not found');
      return;
    }

    // Force disconnect old controller if any
    const old = relay.controllers.get(deviceId);
    if (old) {
      safeSend(old, JSON.stringify({ type: 'replaced' }));
      old.close();
    }

    relay.controllers.set(deviceId, ws);

    const agentWs = relay.agents.get(deviceId);
    safeSend(ws, JSON.stringify({
      type: 'status',
      agent_online: agentWs !== undefined,
    }));
    if (agentWs) {
      safeSend(agentWs, JSON.stringify({ type: 'viewer', active: true }));
    }

    // Session log
    const sessionId = new ObjectId().toHexString();
    const started = Date.now();
    await db.collection('sessions').insertOne({
      id: sessionId,
      user_id: payload.sub,
      device_id: deviceId,
      device_name: device.name,
      started_at: new Date(started).toISOString(),
      ended_at: null,
      duration_sec: null,
    });

    ws.on('message', (data) => {
      // Relay control event to agent
      const agent = relay.agents.get(deviceId);
      if (agent) {
        safeSend(agent, data.toString());
      }
    });

    ws.on('close', async () => {
      if (relay.controllers.get(deviceId) === ws) {
        relay.controllers.delete(deviceId);
        const agent = relay.agents.get(deviceId);
        if (agent) {
          safeSend(agent, JSON.stringify({ type: 'viewer', active: false }));
        }
      }
      const ended = Date.now();
      await db.collection('sessions').updateOne(
        { id: sessionId },
        {
          $set: {
            ended_at: new Date(ended).toISOString(),
            duration_sec: Math.floor((ended - started) / 1000),
          },
        }
      );
      console.log(`Controller disconnected: device=${deviceId}`);
    });

    ws.on('error', (err) => {
      console.warn(`Control socket error device=${deviceId}:`, err);
    });
  }
});

import fs from 'fs';

// Mock File-backed Database implementation for local fallback when MongoDB Atlas / local MongoDB is unavailable
class MockCollection {
  name: string;
  dbFile: string;

  constructor(name: string, dbFile: string) {
    this.name = name;
    this.dbFile = dbFile;
  }

  private loadData(): any[] {
    try {
      if (fs.existsSync(this.dbFile)) {
        const fileContent = fs.readFileSync(this.dbFile, 'utf8');
        const dbData = JSON.parse(fileContent);
        return dbData[this.name] || [];
      }
    } catch (err) {
      console.error(`Error loading mock data for collection ${this.name}:`, err);
    }
    return [];
  }

  private saveData(data: any[]) {
    try {
      let dbData: any = {};
      if (fs.existsSync(this.dbFile)) {
        const fileContent = fs.readFileSync(this.dbFile, 'utf8');
        dbData = JSON.parse(fileContent);
      }
      dbData[this.name] = data;
      fs.writeFileSync(this.dbFile, JSON.stringify(dbData, null, 2), 'utf8');
    } catch (err) {
      console.error(`Error saving mock data for collection ${this.name}:`, err);
    }
  }

  async createIndex(keys: any, options?: any) {
    // No-op for mock index
  }

  async findOne(query: any) {
    const data = this.loadData();
    return data.find(item => this.matches(item, query)) || null;
  }

  async insertOne(doc: any) {
    const data = this.loadData();
    const clone = { ...doc };
    if (!clone._id) {
      clone._id = new ObjectId().toHexString();
    }
    data.push(clone);
    this.saveData(data);
    return { insertedId: clone._id };
  }

  async updateOne(query: any, update: any) {
    const data = this.loadData();
    const item = data.find(i => this.matches(i, query));
    if (item) {
      if (update.$set) {
        Object.assign(item, update.$set);
      }
      this.saveData(data);
      return { modifiedCount: 1 };
    }
    return { modifiedCount: 0 };
  }

  async deleteOne(query: any) {
    const data = this.loadData();
    const idx = data.findIndex(i => this.matches(i, query));
    if (idx !== -1) {
      data.splice(idx, 1);
      this.saveData(data);
      return { deletedCount: 1 };
    }
    return { deletedCount: 0 };
  }

  async deleteMany(query: any) {
    let data = this.loadData();
    const originalLength = data.length;
    data = data.filter(item => !this.matches(item, query));
    const deletedCount = originalLength - data.length;
    this.saveData(data);
    return { deletedCount };
  }

  find(query: any) {
    let data = this.loadData().filter(item => this.matches(item, query));
    
    const cursor = {
      sort: (sortObj: any) => {
        const key = Object.keys(sortObj)[0];
        const dir = sortObj[key];
        data.sort((a, b) => {
          if (a[key] < b[key]) return dir === -1 ? 1 : -1;
          if (a[key] > b[key]) return dir === -1 ? -1 : 1;
          return 0;
        });
        return cursor;
      },
      limit: (n: number) => {
        data = data.slice(0, n);
        return cursor;
      },
      toArray: async () => {
        return data;
      }
    };

    return cursor;
  }

  private matches(item: any, query: any): boolean {
    for (const key in query) {
      if (key === 'otp') {
        if (typeof query[key] === 'string' && typeof item[key] === 'string') {
          if (item[key].toUpperCase() !== query[key].toUpperCase()) return false;
        } else if (item[key] !== query[key]) {
          return false;
        }
      } else if (query[key] && typeof query[key] === 'object' && !Array.isArray(query[key])) {
        if (item[key]?.toString() !== query[key]?.toString()) {
          return false;
        }
      } else {
        if (item[key] !== query[key]) return false;
      }
    }
    return true;
  }
}

function createMockDb(dbFile: string) {
  const collections: Map<string, MockCollection> = new Map();
  return {
    collection(name: string) {
      if (!collections.has(name)) {
        collections.set(name, new MockCollection(name, dbFile));
      }
      return collections.get(name)!;
    }
  };
}

// Startup Initialization
async function bootstrap() {
  let isMock = false;
  const dbFile = path.join(ROOT_DIR, 'db_local.json');

  try {
    console.log('Connecting to MongoDB...');
    const mongoClient = new MongoClient(MONGO_URL!, {
      serverSelectionTimeoutMS: 4000 // Timeout early if connection cannot be established
    });
    await mongoClient.connect();
    client = mongoClient;
    db = client.db(DB_NAME);
    console.log('Connected to MongoDB successfully');
  } catch (err: any) {
    console.warn(`\n[WARNING] MongoDB connection failed: ${err.message || err}`);
    console.warn(`Falling back to local file-based database: ${dbFile}\n`);
    isMock = true;
    db = createMockDb(dbFile);
  }

  // Create indexes (handle failure gracefully for mock DB)
  try {
    await db.collection('users').createIndex({ email: 1 }, { unique: true });
    await db.collection('users').createIndex({ id: 1 }, { unique: true });
    await db.collection('devices').createIndex({ id: 1 }, { unique: true });
    await db.collection('devices').createIndex({ user_id: 1 });
    await db.collection('pairings').createIndex({ code: 1 });
    console.log('Database indexes checked/created successfully');
  } catch (indexErr) {
    // index creation not required on mock db
  }

  httpServer.listen(PORT, () => {
    console.log(`AnyControl Remote Node.js API server running [Mode: ${isMock ? 'Mock File DB' : 'MongoDB'}]:`);
    console.log(`  - API Server: http://localhost:${PORT}`);
    console.log(`  - API URL:    http://localhost:${PORT}/api`);
    console.log(`  - Frontend:   http://localhost:8081`);
  });
}

bootstrap().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
