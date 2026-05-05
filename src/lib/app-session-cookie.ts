import { createHmac, timingSafeEqual } from "crypto";
import type { NextResponse } from "next/server";

type CookieLike = {
  get(name: string): { value: string } | undefined;
};

export const APP_SESSION_COOKIE = "trabix-session";

export type AppSessionCookie = {
  userId: string;
  expiresAt: number;
};

function sessionSecret() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "trabix-dev-session";
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(value: string) {
  return createHmac("sha256", sessionSecret()).update(value).digest("base64url");
}

export function createAppSessionToken(userId: string, maxAgeSeconds = 60 * 60 * 24 * 7) {
  const payload = base64UrlEncode(
    JSON.stringify({
      userId,
      expiresAt: Date.now() + maxAgeSeconds * 1000
    } satisfies AppSessionCookie)
  );

  return `${payload}.${sign(payload)}`;
}

export function readAppSessionCookie(cookies: CookieLike): AppSessionCookie | null {
  const token = cookies.get(APP_SESSION_COOKIE)?.value;
  if (!token) {
    return null;
  }

  const [payload, signature] = token.split(".");
  if (!payload || !signature) {
    return null;
  }

  const expected = sign(payload);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (signatureBuffer.length !== expectedBuffer.length || !timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const session = JSON.parse(base64UrlDecode(payload)) as AppSessionCookie;
    if (!session.userId || session.expiresAt < Date.now()) {
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

export function setAppSessionCookie(response: NextResponse, userId: string) {
  response.cookies.set(APP_SESSION_COOKIE, createAppSessionToken(userId), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7
  });
}

export function clearAppSessionCookie(response: NextResponse) {
  response.cookies.set(APP_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0
  });
}
