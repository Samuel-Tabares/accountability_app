import { NextRequest, NextResponse } from "next/server";
import type { ProfileRow } from "./supabase/types";

export function setRedirect(
  response: NextResponse,
  request: NextRequest,
  fallback: string,
  error?: string,
  notice?: string
): NextResponse {
  const target = request.headers.get("referer") ?? new URL(fallback, request.url).toString();
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
