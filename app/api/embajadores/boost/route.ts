import { NextRequest, NextResponse } from "next/server";
import { dashboardPathForRole } from "@/src/lib/auth";
import { getRouteAuthContext } from "@/src/lib/route-auth";
import type { ProfileRow } from "@/src/lib/supabase/types";

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

function isMissingColumnError(error: { code?: string; message?: string } | null | undefined) {
  return (
    error?.code === "42703" ||
    error?.code === "PGRST204" ||
    error?.message?.includes("does not exist") ||
    error?.message?.includes("schema cache")
  );
}

function isBoostActive(profile: Pick<ProfileRow, "boost_active" | "boost_expires_at">) {
  if (!profile.boost_active) {
    return false;
  }

  if (!profile.boost_expires_at) {
    return true;
  }

  return new Date(profile.boost_expires_at).getTime() > Date.now();
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const jsonMode = wantsJson(request);
  const response = NextResponse.redirect(new URL("/login", request.url), { status: 303 });
  const auth = await getRouteAuthContext(request, response);

  if (!auth) {
    if (jsonMode) {
      return jsonResponse(false, "Inicia sesión para continuar.", 401);
    }
    return setRedirect(response, request, "/login", "not_authenticated");
  }

  if (auth.profile.role !== "admin" || !auth.profile.is_active) {
    if (jsonMode) {
      return jsonResponse(false, "No tienes permisos para cambiar boost.", 403);
    }
    return setRedirect(response, request, dashboardPathForRole(auth.profile.role), "not_authorized");
  }

  const profileId = String(formData.get("profile_id") ?? "").trim();
  if (!profileId) {
    if (jsonMode) {
      return jsonResponse(false, "Selecciona un embajador válido.", 400);
    }
    return setRedirect(response, request, dashboardPathForRole(auth.profile.role), "missing_profile");
  }

  const { data: target, error: targetError } = await auth.adminClient
    .from("profiles")
    .select("id, role, boost_active, boost_expires_at")
    .eq("id", profileId)
    .maybeSingle();

  if (targetError) {
    const message = isMissingColumnError(targetError)
      ? "Falta aplicar la migración 0004_net_sale_boost.sql en Supabase."
      : "No se pudo consultar el embajador.";
    if (jsonMode) {
      return jsonResponse(false, message, 500);
    }
    return setRedirect(response, request, dashboardPathForRole(auth.profile.role), "boost_failed");
  }

  if (!target || target.role !== "embajador") {
    if (jsonMode) {
      return jsonResponse(false, "Selecciona un embajador válido.", 400);
    }
    return setRedirect(response, request, dashboardPathForRole(auth.profile.role), "missing_profile");
  }

  const active = isBoostActive(target as ProfileRow);
  const nextBoostExpiresAt = active ? null : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await auth.adminClient
    .from("profiles")
    .update({
      boost_active: !active,
      boost_expires_at: nextBoostExpiresAt
    })
    .eq("id", profileId);

  if (error) {
    const message = isMissingColumnError(error)
      ? "Falta aplicar la migración 0004_net_sale_boost.sql en Supabase."
      : "No se pudo cambiar el boost.";
    if (jsonMode) {
      return jsonResponse(false, message, 500);
    }
    return setRedirect(response, request, dashboardPathForRole(auth.profile.role), "boost_failed");
  }

  if (jsonMode) {
    return jsonResponse(true, active ? "Boost cancelado." : "Boost activo por 7 días.", 200);
  }

  return setRedirect(response, request, dashboardPathForRole(auth.profile.role));
}
