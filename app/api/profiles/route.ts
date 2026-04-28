import { NextRequest, NextResponse } from "next/server";
import { dashboardPathForRole } from "@/src/lib/auth";
import { createSupabaseRouteClient } from "@/src/lib/supabase/route";

function setRedirect(response: NextResponse, request: NextRequest, fallback: string, error?: string) {
  const target = request.headers.get("referer") ?? new URL(fallback, request.url).toString();
  const url = new URL(target);
  if (error) {
    url.searchParams.set("error", error);
  }
  response.headers.set("Location", url.toString());
  return response;
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const response = NextResponse.redirect(new URL("/login", request.url), { status: 303 });
  const supabase = createSupabaseRouteClient(request, response);

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return setRedirect(response, request, "/login", "not_authenticated");
  }

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (!profile || profile.role !== "admin" || !profile.is_active) {
    await supabase.auth.signOut();
    return setRedirect(response, request, "/login", "not_authorized");
  }

  const targetId = String(formData.get("profile_id") ?? "").trim();
  const fullName = String(formData.get("full_name") ?? "").trim() || null;
  const role = String(formData.get("role") ?? "embajador");
  const ambassadorId = String(formData.get("ambassador_id") ?? "").trim() || null;
  const isActive = String(formData.get("is_active") ?? "true") === "true";

  if (!targetId) {
    return setRedirect(response, request, dashboardPathForRole(profile.role), "missing_profile");
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: fullName,
      role: role === "admin" ? "admin" : "embajador",
      ambassador_id: ambassadorId,
      is_active: isActive
    })
    .eq("id", targetId);

  if (error) {
    return setRedirect(response, request, dashboardPathForRole(profile.role), "profile_failed");
  }

  return setRedirect(response, request, dashboardPathForRole(profile.role));
}
