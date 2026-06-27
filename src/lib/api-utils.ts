import { NextRequest, NextResponse } from "next/server";
import type { ProfileRow } from "./supabase/types";

/**
 * Build an absolute origin from the actual request Host header instead of
 * `request.url`. The dev server resolves `request.url` to `localhost`, which
 * breaks server-side redirects when the app is reached over a LAN IP or any
 * non-localhost host (the client gets sent to its own localhost).
 */
export function resolveRequestOrigin(request: NextRequest): string {
  const host = request.headers.get("host");
  if (!host) return new URL(request.url).origin;
  const proto = request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
  return `${proto}://${host}`;
}

export function requestUrl(request: NextRequest, path: string): URL {
  return new URL(path, resolveRequestOrigin(request));
}

export function setRedirect(
  response: NextResponse,
  request: NextRequest,
  fallback: string,
  error?: string,
  notice?: string
): NextResponse {
  const target = request.headers.get("referer") ?? requestUrl(request, fallback).toString();
  const url = new URL(target);
  if (error) url.searchParams.set("error", error);
  if (notice) url.searchParams.set("notice", notice);
  response.headers.set("Location", url.toString());
  return response;
}

export function wantsJson(request: NextRequest): boolean {
  return request.headers.get("accept")?.includes("application/json") ?? false;
}

export function jsonResponse(
  ok: boolean,
  message: string,
  status: number,
  data?: Record<string, unknown>
): NextResponse {
  return NextResponse.json({ ok, message, ...data }, { status });
}

export function isMissingColumnError(
  error: { code?: string; message?: string } | null | undefined
): boolean {
  return Boolean(
    error?.code === "42703" ||
    error?.code === "PGRST204" ||
    error?.message?.includes("does not exist") ||
    error?.message?.includes("schema cache")
  );
}

export function isProfileBoostActive(
  profile: Pick<ProfileRow, "boost_active" | "boost_expires_at"> | null,
  referenceDate = new Date()
): boolean {
  if (!profile?.boost_active) return false;
  if (!profile.boost_expires_at) return true;
  return new Date(profile.boost_expires_at).getTime() > referenceDate.getTime();
}
