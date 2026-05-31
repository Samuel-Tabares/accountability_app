import type { NextRequest, NextResponse } from "next/server";
import { readAppSessionCookie } from "./app-session-cookie";
import { createSupabaseAdminClient } from "./supabase/admin";
import { createSupabaseRouteClient } from "./supabase/route";
import type { AppRole, ProfileRow } from "./supabase/types";

export type RouteAuthContext = {
  userId: string;
  profile: ProfileRow;
  supabase: ReturnType<typeof createSupabaseRouteClient>;
  adminClient: ReturnType<typeof createSupabaseAdminClient>;
};

export async function getRouteAuthContext(request: NextRequest, response: NextResponse) {
  const appSession = readAppSessionCookie(request.cookies);

  // Fast path: HMAC-verified app session — skip the Supabase Auth network round-trip.
  if (appSession) {
    const adminClient = createSupabaseAdminClient();
    const { data: profile } = await adminClient
      .from("profiles")
      .select("id, role, is_active, must_change_password, username, full_name, email, phone, ambassador_id, boost_active, boost_expires_at, level, created_at, updated_at")
      .eq("id", appSession.userId)
      .maybeSingle();

    if (!profile || !profile.is_active) return null;

    return {
      userId: appSession.userId,
      profile: profile as ProfileRow,
      supabase: createSupabaseRouteClient(request, response),
      adminClient
    };
  }

  // Slow path: no app session cookie — validate via Supabase JWT.
  const supabase = createSupabaseRouteClient(request, response);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const adminClient = createSupabaseAdminClient();
  const { data: profile } = await adminClient
    .from("profiles")
    .select("id, role, is_active, must_change_password, username, full_name, email, phone, ambassador_id, boost_active, boost_expires_at, level, created_at, updated_at")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !profile.is_active) return null;

  return {
    userId: user.id,
    profile: profile as ProfileRow,
    supabase,
    adminClient
  };
}

export async function requireRouteRole(
  request: NextRequest,
  response: NextResponse,
  expectedRole: AppRole
) {
  const auth = await getRouteAuthContext(request, response);
  if (!auth || auth.profile.role !== expectedRole) {
    return null;
  }

  return auth;
}
