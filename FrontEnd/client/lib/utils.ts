import clsx, { type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  // clsx accepts a spread of class values; ensure we forward them correctly
  return twMerge(clsx(...inputs));
}

// Simple API client for backend
export const API_BASE: string = (import.meta as any).env?.VITE_API_BASE ?? ""; // same-origin by default

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`GET ${path} ${res.status}`);
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
  if (!res.ok) throw new Error(`POST ${path} ${res.status}`);
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
