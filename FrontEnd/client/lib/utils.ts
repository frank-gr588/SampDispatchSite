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
export const API_BASE: string = (import.meta as any).env?.VITE_API_BASE ?? "http://localhost:5000";

async function readResponseBodySafely(res: Response) {
  try {
    const text = await res.text();
    return text;
  } catch {
    return '<unable to read response body>';
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { cache: 'no-store' });
  if (!res.ok) {
    const body = await readResponseBodySafely(res);
    throw new Error(`GET ${path} ${res.status} - ${body}`);
  }
  return res.json();
}

export async function apiPost<T>(path: string, body?: any, apiKey?: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { "x-api-key": apiKey } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await readResponseBodySafely(res);
    throw new Error(`POST ${path} ${res.status} - ${text}`);
  }
  return res.status === 204 ? (undefined as unknown as T) : res.json();
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
