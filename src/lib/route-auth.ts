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
  const supabase = createSupabaseRouteClient(request, response);
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const appSession = readAppSessionCookie(request.cookies);
  const userId = user?.id ?? appSession?.userId;

  if (!userId) {
    return null;
  }

  const adminClient = createSupabaseAdminClient();
  const profileClient = user ? supabase : adminClient;
  const { data: profile } = await profileClient
    .from("profiles")
    .select("id, role, is_active, must_change_password, username, full_name, email, phone, ambassador_id, boost_active, boost_expires_at, level, created_at, updated_at")
    .eq("id", userId)
    .maybeSingle();

  if (!profile || !profile.is_active) {
    return null;
  }

  return {
    userId,
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
