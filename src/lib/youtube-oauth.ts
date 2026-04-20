import prisma from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/crypto";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

const SCOPES = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

export function buildAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: requireEnv("GOOGLE_OAUTH_CLIENT_ID"),
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export async function storeTokensFromCode(
  code: string,
  redirectUri: string,
): Promise<void> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: requireEnv("GOOGLE_OAUTH_CLIENT_ID"),
      client_secret: requireEnv("GOOGLE_OAUTH_CLIENT_SECRET"),
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    throw new Error(`Token exchange failed: ${await res.text()}`);
  }
  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
  };

  if (!data.refresh_token) {
    throw new Error(
      "No refresh_token returned. Revoke previous grant in Google Account → Security and try again.",
    );
  }

  const userInfoRes = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${data.access_token}` },
  });
  if (!userInfoRes.ok) {
    throw new Error(`Failed to fetch userinfo: ${await userInfoRes.text()}`);
  }
  const userInfo = (await userInfoRes.json()) as { email: string };

  const expiresAt = new Date(Date.now() + data.expires_in * 1000);

  await prisma.youTubeOAuthToken.upsert({
    where: { singleton: "admin" },
    update: {
      accessTokenEnc: encrypt(data.access_token),
      refreshTokenEnc: encrypt(data.refresh_token),
      expiresAt,
      scope: data.scope,
      googleEmail: userInfo.email,
    },
    create: {
      singleton: "admin",
      accessTokenEnc: encrypt(data.access_token),
      refreshTokenEnc: encrypt(data.refresh_token),
      expiresAt,
      scope: data.scope,
      googleEmail: userInfo.email,
    },
  });
}

export async function getValidAccessToken(): Promise<string> {
  const row = await prisma.youTubeOAuthToken.findUnique({
    where: { singleton: "admin" },
  });
  if (!row) {
    throw new Error(
      "OAuth not connected — admin must complete the connect flow at /admin/reviewer/settings",
    );
  }

  const bufferMs = 5 * 60 * 1000;
  if (row.expiresAt.getTime() > Date.now() + bufferMs) {
    return decrypt(row.accessTokenEnc);
  }

  const refreshToken = decrypt(row.refreshTokenEnc);
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: requireEnv("GOOGLE_OAUTH_CLIENT_ID"),
      client_secret: requireEnv("GOOGLE_OAUTH_CLIENT_SECRET"),
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    throw new Error(`Token refresh failed: ${await res.text()}`);
  }
  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };

  await prisma.youTubeOAuthToken.update({
    where: { singleton: "admin" },
    data: {
      accessTokenEnc: encrypt(data.access_token),
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    },
  });

  return data.access_token;
}

export async function getOAuthStatus(): Promise<
  | { connected: false }
  | { connected: true; email: string; expiresAt: string }
> {
  const row = await prisma.youTubeOAuthToken.findUnique({
    where: { singleton: "admin" },
    select: { googleEmail: true, expiresAt: true },
  });
  if (!row) return { connected: false };
  return {
    connected: true,
    email: row.googleEmail,
    expiresAt: row.expiresAt.toISOString(),
  };
}

export async function disconnectOAuth(): Promise<void> {
  await prisma.youTubeOAuthToken.deleteMany({ where: { singleton: "admin" } });
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} env var is required`);
  return v;
}
