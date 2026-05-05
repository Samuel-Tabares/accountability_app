import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import type { AppRole, ProfileRow } from "./supabase/types";
import { readAppSessionCookie } from "./app-session-cookie";
import { createSupabaseAdminClient } from "./supabase/admin";
import { createSupabaseServerClient } from "./supabase/server";
import { readSupabaseSessionCookie } from "./supabase/session-cookie";

export type AuthContext = {
  userId: string;
  profile: ProfileRow;
};

export function dashboardPathForRole(role: AppRole) {
  return role === "admin" ? "/admin" : "/embajador";
}

export async function getAuthContext(): Promise<AuthContext | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const cookieStore = await cookies();
  const appSession = readAppSessionCookie(cookieStore);
  const session = readSupabaseSessionCookie(cookieStore);
  const userId = user?.id ?? appSession?.userId ?? session?.userId;

  if (!userId) {
    return null;
  }

  const profileClient = user && user.id === userId ? supabase : createSupabaseAdminClient();
  const { data: profile } = await profileClient.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (!profile || !profile.is_active) {
    return null;
  }

  return {
    userId,
    profile: profile as ProfileRow
  };
}

export async function requireAuthContext(expectedRole?: AppRole) {
  const auth = await getAuthContext();
  if (!auth) {
    redirect("/login");
  }

  if (auth.profile.must_change_password) {
    redirect("/cambiar-contrasena" as any);
  }

  if (expectedRole && auth.profile.role !== expectedRole) {
    redirect(dashboardPathForRole(auth.profile.role));
  }

  return auth;
}
