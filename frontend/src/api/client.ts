// Thin API client for the AnyControl Remote backend.
import { storage } from "@/src/utils/storage";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL as string;
export const API = `${BASE}/api`;
export const TOKEN_KEY = "anycontrol_token";

export function wsControlUrl(token: string, deviceId: string) {
  const wsBase = BASE.replace(/^http/, "ws");
  return `${wsBase}/api/ws/control?token=${encodeURIComponent(token)}&device_id=${encodeURIComponent(deviceId)}`;
}

async function request(path: string, options: RequestInit = {}, auth = true) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (auth) {
    const token = await storage.secureGet(TOKEN_KEY, "");
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${API}${path}`, { ...options, headers });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(data?.detail || `Request failed (${res.status})`);
  }
  return data;
}

export type User = { id: string; email: string; name?: string };
export type Device = {
  id: string;
  name: string;
  online: boolean;
  last_seen: string | null;
  created_at: string;
};
export type Session = {
  id: string;
  device_id: string;
  device_name: string;
  started_at: string;
  ended_at: string | null;
  duration_sec: number | null;
};

export const api = {
  register: (email: string, password: string, name?: string) =>
    request("/auth/register", { method: "POST", body: JSON.stringify({ email, password, name }) }, false),
  login: (email: string, password: string) =>
    request("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }, false),
  me: (): Promise<User> => request("/auth/me"),
  devices: (): Promise<Device[]> => request("/devices"),
  deleteDevice: (id: string) => request(`/devices/${id}`, { method: "DELETE" }),
  pairNew: (): Promise<{ code: string; otp: string; expires_in: number }> =>
    request("/devices/pair/new", { method: "POST" }),
  sessions: (): Promise<Session[]> => request("/sessions"),
  deleteAccount: () => request("/auth/account", { method: "DELETE" }),
  agentClaim: (code: string, otp: string) => request("/devices/pair/agent-claim", { method: "POST", body: JSON.stringify({ code, otp }) }),
};
