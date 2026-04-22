// F1 — shared auth types for frontend + workers.

export interface PublicUser {
  id: string;
  email: string;
}

export interface WhoamiResponse {
  userId: string | null;
  email: string | null;
  anonUserId: string | null;
}

export interface SignInRequest {
  email: string;
  anonUserId?: string;
}

export interface SignInResponse {
  ok: boolean;
  message: string;
}

export interface VerifyRequest {
  token: string;
  anonUserId?: string;
  localHistory?: Array<Record<string, unknown>>;
  localProfiles?: Record<string, Record<string, unknown>>;
}

export interface VerifyResponse {
  ok: boolean;
  user?: PublicUser;
  anonUserId?: string | null;
}
