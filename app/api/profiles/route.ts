import { NextRequest, NextResponse } from "next/server";
import { dashboardPathForRole } from "@/src/lib/auth";
import { createSupabaseRouteClient } from "@/src/lib/supabase/route";
import { createSupabaseAdminClient } from "@/src/lib/supabase/admin";
import { readAppSessionCookie } from "@/src/lib/app-session-cookie";

function setRedirect(response: NextResponse, request: NextRequest, fallback: string, error?: string) {
  const target = request.headers.get("referer") ?? new URL(fallback, request.url).toString();
  const url = new URL(target);
  if (error) {
    url.searchParams.set("error", error);
  }
  response.headers.set("Location", url.toString());
  return response;
}

function wantsJson(request: NextRequest) {
  return request.headers.get("accept")?.includes("application/json") ?? false;
}

function jsonResponse(ok: boolean, message: string, status: number) {
  return NextResponse.json({ ok, message }, { status });
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const jsonMode = wantsJson(request);
  const response = NextResponse.redirect(new URL("/login", request.url), { status: 303 });
  const supabase = createSupabaseRouteClient(request, response);

  const {
    data: { user }
  } = await supabase.auth.getUser();
  const appSession = readAppSessionCookie(request.cookies);
  const userId = user?.id ?? appSession?.userId;

  if (!userId) {
    if (jsonMode) {
      return jsonResponse(false, "Inicia sesión para continuar.", 401);
    }
    return setRedirect(response, request, "/login", "not_authenticated");
  }

  const authClient = user ? supabase : createSupabaseAdminClient();
  const { data: profile } = await authClient.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (!profile || profile.role !== "admin" || !profile.is_active) {
    await supabase.auth.signOut();
    if (jsonMode) {
      return jsonResponse(false, "No tienes permisos para actualizar perfiles.", 403);
    }
    return setRedirect(response, request, "/login", "not_authorized");
  }

  const targetId = String(formData.get("profile_id") ?? "").trim();
  const fullName = String(formData.get("full_name") ?? "").trim() || null;
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const isActive = String(formData.get("is_active") ?? "true") === "true";

  if (!targetId) {
    if (jsonMode) {
      return jsonResponse(false, "Selecciona un perfil válido.", 400);
    }
    return setRedirect(response, request, dashboardPathForRole(profile.role), "missing_profile");
  }

  const { error } = await authClient
    .from("profiles")
    .update({
      full_name: fullName,
      phone,
      is_active: isActive
    })
    .eq("id", targetId);

  if (error) {
    if (jsonMode) {
      return jsonResponse(false, "No se pudo actualizar el perfil.", 500);
    }
    return setRedirect(response, request, dashboardPathForRole(profile.role), "profile_failed");
  }

  if (jsonMode) {
    return jsonResponse(true, "Perfil actualizado correctamente.", 200);
  }

  return setRedirect(response, request, dashboardPathForRole(profile.role));
}
