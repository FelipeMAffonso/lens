// F12 — Gmail OAuth 2.0 flow. Authorize URL generation + token exchange.

export interface GmailOAuthEnv {
  GMAIL_OAUTH_CLIENT_ID?: string;
  GMAIL_OAUTH_CLIENT_SECRET?: string;
  GMAIL_OAUTH_REDIRECT_URI?: string;
}

export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "openid",
  "email",
].join(" ");

const GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

export interface AuthorizeUrlResult {
  url: string;
  state: string;
}

/** Compose the Google OAuth authorize URL. Caller should persist `state` in a
 * short-lived cookie / KV entry scoped to the anon or signed-in user. */
export function buildAuthorizeUrl(env: GmailOAuthEnv, stateSeed: string): AuthorizeUrlResult {
  if (!env.GMAIL_OAUTH_CLIENT_ID) {
    return { url: "", state: "" };
  }
  const state = `${stateSeed}.${crypto.randomUUID()}`;
  const params = new URLSearchParams({
    client_id: env.GMAIL_OAUTH_CLIENT_ID,
    redirect_uri: env.GMAIL_OAUTH_REDIRECT_URI ?? "",
    response_type: "code",
    scope: GMAIL_SCOPES,
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state,
  });
  return { url: `${GOOGLE_AUTHORIZE_URL}?${params.toString()}`, state };
}

export interface TokenExchangeResult {
  ok: boolean;
  tokens?: {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
    token_type: string;
    id_token?: string;
  };
  error?: string;
}

/** Exchange authorization code for tokens. */
export async function exchangeCode(
  env: GmailOAuthEnv,
  code: string,
): Promise<TokenExchangeResult> {
  if (!env.GMAIL_OAUTH_CLIENT_ID || !env.GMAIL_OAUTH_CLIENT_SECRET) {
    return { ok: false, error: "oauth_unconfigured" };
  }
  const body = new URLSearchParams({
    code,
    client_id: env.GMAIL_OAUTH_CLIENT_ID,
    client_secret: env.GMAIL_OAUTH_CLIENT_SECRET,
    redirect_uri: env.GMAIL_OAUTH_REDIRECT_URI ?? "",
    grant_type: "authorization_code",
  });
  try {
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { ok: false, error: `google_http_${res.status}: ${t.slice(0, 200)}` };
    }
    const tokens = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      scope: string;
      token_type: string;
      id_token?: string;
    };
    return { ok: true, tokens };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export interface RefreshResult {
  ok: boolean;
  access_token?: string;
  expires_in?: number;
  error?: string;
}

export async function refreshAccessToken(
  env: GmailOAuthEnv,
  refreshToken: string,
): Promise<RefreshResult> {
  if (!env.GMAIL_OAUTH_CLIENT_ID || !env.GMAIL_OAUTH_CLIENT_SECRET) {
    return { ok: false, error: "oauth_unconfigured" };
  }
  const body = new URLSearchParams({
    client_id: env.GMAIL_OAUTH_CLIENT_ID,
    client_secret: env.GMAIL_OAUTH_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  try {
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { ok: false, error: `google_http_${res.status}: ${t.slice(0, 200)}` };
    }
    const data = (await res.json()) as { access_token: string; expires_in: number };
    return { ok: true, access_token: data.access_token, expires_in: data.expires_in };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
