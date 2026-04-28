import { NextRequest, NextResponse } from "next/server";
import { createSupabaseRouteClient } from "@/src/lib/supabase/route";
import { dashboardPathForRole } from "@/src/lib/auth";

function setRedirect(response: NextResponse, request: NextRequest, path: string, error?: string) {
  const url = new URL(path, request.url);
  if (error) {
    url.searchParams.set("error", error);
  }
  response.headers.set("Location", url.toString());
  return response;
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const mode = String(formData.get("mode") ?? "login");
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return setRedirect(NextResponse.redirect(new URL("/login", request.url), { status: 303 }), request, "/login", "missing_credentials");
  }

  const response = NextResponse.redirect(new URL("/login", request.url), { status: 303 });
  const supabase = createSupabaseRouteClient(request, response);

  if (mode === "signup") {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
      return setRedirect(response, request, "/login", "signup_failed");
    }

    return setRedirect(response, request, "/login", "account_created");
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    return setRedirect(response, request, "/login", "login_failed");
  }

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", data.user.id).maybeSingle();
  if (!profile) {
    await supabase.auth.signOut();
    return setRedirect(response, request, "/login", "profile_missing");
  }

  return setRedirect(response, request, dashboardPathForRole(profile.role));
}
