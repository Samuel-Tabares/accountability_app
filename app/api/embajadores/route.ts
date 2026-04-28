import { NextRequest, NextResponse } from "next/server";
import { createSupabaseRouteClient } from "@/src/lib/supabase/route";
import { createSupabaseAdminClient } from "@/src/lib/supabase/admin";
import { normalizeHandle } from "@/src/lib/identity";
import { upsertAuthAliasUser, upsertProfile } from "@/src/lib/supabase/user-admin";

function setRedirect(
  response: NextResponse,
  request: NextRequest,
  fallback: string,
  error?: string,
  notice?: string
) {
  const target = request.headers.get("referer") ?? new URL(fallback, request.url).toString();
  const url = new URL(target);
  if (error) {
    url.searchParams.set("error", error);
  }
  if (notice) {
    url.searchParams.set("notice", notice);
  }
  response.headers.set("Location", url.toString());
  return response;
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const response = NextResponse.redirect(new URL("/admin", request.url), { status: 303 });
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

  const usernameRaw = String(formData.get("username") ?? "").trim();
  const codeRaw = String(formData.get("code") ?? "").trim();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!usernameRaw || !codeRaw || !fullName || !phone || !password) {
    return setRedirect(response, request, "/admin", "invalid_embajador");
  }

  let username: string;
  let code: string;

  try {
    username = normalizeHandle(usernameRaw);
    code = normalizeHandle(codeRaw);
  } catch {
    return setRedirect(response, request, "/admin", "invalid_embajador");
  }

  if (username !== code) {
    return setRedirect(response, request, "/admin", "invalid_embajador");
  }

  try {
    const adminClient = createSupabaseAdminClient();
    const aliasDomain = process.env.SUPABASE_AUTH_ALIAS_DOMAIN ?? "trabix.local";
    const authUser = await upsertAuthAliasUser(adminClient, {
      identifier: username,
      password,
      fullName,
      phone,
      role: "embajador",
      aliasDomain
    });

    await upsertProfile(adminClient, {
      id: authUser.user.id,
      email: authUser.email,
      username,
      fullName,
      phone,
      role: "embajador",
      ambassadorId: code,
      isActive: true
    });
  } catch {
    return setRedirect(response, request, "/admin", "embajador_failed");
  }

  return setRedirect(response, request, "/admin", undefined, "embajador_created");
}
