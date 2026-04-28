import { redirect } from "next/navigation";
import type { AppRole, ProfileRow } from "./supabase/types";
import { createSupabaseServerClient } from "./supabase/server";

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

  if (!user) {
    return null;
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !profile) {
    return null;
  }

  if (!profile.is_active) {
    return null;
  }

  return {
    userId: user.id,
    profile
  };
}

export async function requireAuthContext(expectedRole?: AppRole) {
  const auth = await getAuthContext();
  if (!auth) {
    redirect("/login");
  }

  if (expectedRole && auth.profile.role !== expectedRole) {
    redirect(dashboardPathForRole(auth.profile.role));
  }

  return auth;
}
