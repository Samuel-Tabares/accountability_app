import { NextRequest, NextResponse } from "next/server";
import { dashboardPathForRole } from "@/src/lib/auth";
import { getRouteAuthContext } from "@/src/lib/route-auth";
import { isMissingColumnError, isProfileBoostActive, jsonResponse, setRedirect, wantsJson } from "@/src/lib/api-utils";
import { BOOST_DURATION_DAYS } from "@/src/lib/constants";
import type { ProfileRow } from "@/src/lib/supabase/types";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const jsonMode = wantsJson(request);
  const response = NextResponse.redirect(new URL("/login", request.url), { status: 303 });
  const auth = await getRouteAuthContext(request, response);

  if (!auth) {
    if (jsonMode) return jsonResponse(false, "Inicia sesión para continuar.", 401);
    return setRedirect(response, request, "/login", "not_authenticated");
  }

  if (auth.profile.role !== "admin" || !auth.profile.is_active) {
    if (jsonMode) return jsonResponse(false, "No tienes permisos para cambiar boost.", 403);
    return setRedirect(response, request, dashboardPathForRole(auth.profile.role), "not_authorized");
  }

  const profileId = String(formData.get("profile_id") ?? "").trim();
  if (!profileId) {
    if (jsonMode) return jsonResponse(false, "Selecciona un embajador válido.", 400);
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
    if (jsonMode) return jsonResponse(false, message, 500);
    return setRedirect(response, request, dashboardPathForRole(auth.profile.role), "boost_failed");
  }

  if (!target || target.role !== "embajador") {
    if (jsonMode) return jsonResponse(false, "Selecciona un embajador válido.", 400);
    return setRedirect(response, request, dashboardPathForRole(auth.profile.role), "missing_profile");
  }

  const active = isProfileBoostActive(target as ProfileRow);
  const nextBoostExpiresAt = active
    ? null
    : new Date(Date.now() + BOOST_DURATION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { error } = await auth.adminClient
    .from("profiles")
    .update({ boost_active: !active, boost_expires_at: nextBoostExpiresAt })
    .eq("id", profileId);

  if (error) {
    const message = isMissingColumnError(error)
      ? "Falta aplicar la migración 0004_net_sale_boost.sql en Supabase."
      : "No se pudo cambiar el boost.";
    if (jsonMode) return jsonResponse(false, message, 500);
    return setRedirect(response, request, dashboardPathForRole(auth.profile.role), "boost_failed");
  }

  if (jsonMode) return jsonResponse(true, active ? "Boost cancelado." : "Boost activo por 7 días.", 200, {
    profileId,
    boostActive: !active,
    boostExpiresAt: nextBoostExpiresAt
  });
  return setRedirect(response, request, dashboardPathForRole(auth.profile.role));
}
