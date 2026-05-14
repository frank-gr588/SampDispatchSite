import clsx, { type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  // clsx accepts a spread of class values; ensure we forward them correctly
  return twMerge(clsx(...inputs));
}

// Simple API client for backend
// Default to localhost:5000 when VITE_API_BASE is not provided to make
// local development easier (matches README). Explicit VITE_API_BASE will
// still override this value in CI/hosting environments.
export const API_BASE: string = (import.meta as any).env?.VITE_API_BASE ?? "";
// API key is required by the backend middleware; allow override via env with a safe fallback
export const API_KEY: string | undefined = (import.meta as any).env?.VITE_API_KEY ?? "changeme-key";

async function readResponseBodySafely(res: Response) {
  try {
    const text = await res.text();
    return text;
  } catch {
    return '<unable to read response body>';
  }
}

function mergeHeaders(userHeaders?: HeadersInit): HeadersInit {
  const base = new Headers();
  if (API_KEY) {
    base.set("x-api-key", API_KEY);
  }
  if (userHeaders) {
    const h = new Headers(userHeaders as any);
    h.forEach((value, key) => base.set(key, value));
  }
  return base;
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const headers = mergeHeaders(init?.headers);
  const response = await fetch(`${API_BASE}${path}`, {
    cache: "no-store",
    ...init,
    headers,
  });
  return response;
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await apiFetch(path, { method: "GET" });
  if (!res.ok) {
    const body = await readResponseBodySafely(res);
    throw new Error(`GET ${path} ${res.status} - ${body}`);
  }
  return res.json();
}

export async function apiPost<T>(path: string, body?: any): Promise<T> {
  const res = await apiFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await readResponseBodySafely(res);
    throw new Error(`POST ${path} ${res.status} - ${text}`);
  }
  if (res.status === 204) return undefined as unknown as T;
  
  const text = await res.text();
  if (!text) return undefined as unknown as T;
  return JSON.parse(text);
}

export async function apiPut<T>(path: string, body?: any): Promise<T> {
  const res = await apiFetch(path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await readResponseBodySafely(res);
    throw new Error(`PUT ${path} ${res.status} - ${text}`);
  }
  if (res.status === 204) return undefined as unknown as T;
  
  const text = await res.text();
  if (!text) return undefined as unknown as T;
  return JSON.parse(text);
}

export async function apiDelete<T>(path: string): Promise<T> {
  const res = await apiFetch(path, { method: "DELETE" });
  if (!res.ok) {
    const text = await readResponseBodySafely(res);
    throw new Error(`DELETE ${path} ${res.status} - ${text}`);
  }
  if (res.status === 204) return undefined as unknown as T;
  
  const text = await res.text();
  if (!text) return undefined as unknown as T;
  return JSON.parse(text);
}

// Simple in-browser event helpers for app-level refresh notifications
export type AppEvent = "units:updated" | "players:updated" | "situations:updated" | "player:deleted" | "channels:updated";

export function emitAppEvent(event: AppEvent, detail?: any) {
  try {
    window.dispatchEvent(new CustomEvent(event, { detail }));
  } catch {
    // ignore
  }
}

export function onAppEvent(event: AppEvent, cb: (e: CustomEvent) => void) {
  const handler = (ev: Event) => cb(ev as CustomEvent);
  window.addEventListener(event, handler as EventListener);
  return () => window.removeEventListener(event, handler as EventListener);
}
