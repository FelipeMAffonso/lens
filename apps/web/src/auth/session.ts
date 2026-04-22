// F1 — browser-side session module (vanilla TS).
// Calls the worker's /auth/* endpoints, manages an anon ID in localStorage,
// exposes a small event-based API.

import type { WhoamiResponse } from "@lens/shared";

const API_BASE = (import.meta as { env?: { VITE_LENS_API_URL?: string } }).env?.VITE_LENS_API_URL
  ?? "https://lens-api.webmarinelli.workers.dev";

const ANON_KEY = "lens.anon.v1";

export interface SessionState {
  user: { id: string; email: string } | null;
  anonUserId: string | null;
  loading: boolean;
}

type Listener = (state: SessionState) => void;

let state: SessionState = { user: null, anonUserId: null, loading: true };
const listeners = new Set<Listener>();

function emit(): void {
  for (const l of listeners) l(state);
}

export function subscribe(l: Listener): () => void {
  listeners.add(l);
  l(state);
  return () => listeners.delete(l);
}

export function getSession(): SessionState {
  return state;
}

function getOrInitAnonId(): string | null {
  try {
    return localStorage.getItem(ANON_KEY);
  } catch {
    return null;
  }
}

function saveAnonId(id: string): void {
  try {
    localStorage.setItem(ANON_KEY, id);
  } catch {
    // localStorage unavailable (private mode) — keep in memory only
  }
}

function authHeaders(): HeadersInit {
  const anon = getOrInitAnonId();
  return anon ? { "x-lens-anon-id": anon } : {};
}

export async function refreshSession(): Promise<SessionState> {
  state = { ...state, loading: true };
  emit();
  try {
    const res = await fetch(`${API_BASE}/auth/whoami`, {
      credentials: "include",
      headers: authHeaders(),
    });
    // Worker may have minted a new anon id — capture + persist.
    const minted = res.headers.get("x-lens-anon-id-new");
    if (minted) saveAnonId(minted);
    const data = (await res.json()) as WhoamiResponse;
    if (data.anonUserId && !getOrInitAnonId()) saveAnonId(data.anonUserId);
    state = {
      user: data.userId && data.email ? { id: data.userId, email: data.email } : null,
      anonUserId: data.anonUserId ?? getOrInitAnonId(),
      loading: false,
    };
    emit();
    return state;
  } catch (e) {
    state = { ...state, loading: false };
    emit();
    return state;
  }
}

export async function requestSignIn(email: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`${API_BASE}/auth/request`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json", ...authHeaders() },
    body: JSON.stringify({ email, anonUserId: getOrInitAnonId() }),
  });
  if (res.ok) return { ok: true };
  const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  return { ok: false, error: body.error ?? body.message ?? `HTTP ${res.status}` };
}

export async function verifyToken(token: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`${API_BASE}/auth/verify`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json", ...authHeaders() },
    body: JSON.stringify({ token, anonUserId: getOrInitAnonId() }),
  });
  if (res.ok) {
    await refreshSession();
    return { ok: true };
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return { ok: false, error: body.error ?? `HTTP ${res.status}` };
}

export async function signout(): Promise<void> {
  await fetch(`${API_BASE}/auth/signout`, {
    method: "POST",
    credentials: "include",
    headers: authHeaders(),
  });
  await refreshSession();
}
