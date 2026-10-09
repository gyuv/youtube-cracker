"use client";
import type { ApiError } from "./types";

/**
 * Client-side request queue: serializes AI calls and spaces them ≥2s apart
 * so rapid clicks never fan out into 429s on a free Gemini key.
 */
const GAP_MS = 2000;
let queue: Promise<unknown> = Promise.resolve();
let last = 0;

export class ClientApiError extends Error {
  constructor(message: string, public code?: ApiError["code"], public status?: number) {
    super(message);
  }
}

export function postJSON<T>(path: string, body: unknown, { queued = true } = {}): Promise<T> {
  const run = async () => {
    if (queued) {
      const wait = last + GAP_MS - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      last = Date.now();
    }
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({ error: `Server returned ${res.status}` }));
    if (!res.ok) throw new ClientApiError(data.error ?? "Request failed", data.code, res.status);
    return data as T;
  };
  if (!queued) return run();
  const p = queue.then(run, run);
  queue = p.catch(() => {});
  return p;
}
