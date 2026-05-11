import { NextRequest, NextResponse } from "next/server";
import { dashboardPathForRole } from "@/src/lib/auth";
import { requireRouteRole } from "@/src/lib/route-auth";
import { jsonResponse, setRedirect, wantsJson } from "@/src/lib/api-utils";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const jsonMode = wantsJson(request);
  const response = NextResponse.redirect(new URL("/login", request.url), { status: 303 });
  const auth = await requireRouteRole(request, response, "admin");

  if (!auth) {
    if (jsonMode) return jsonResponse(false, "No tienes permisos para actualizar perfiles.", 403);
    return setRedirect(response, request, "/login", "not_authorized");
  }

  const targetId = String(formData.get("profile_id") ?? "").trim();
  const fullName = String(formData.get("full_name") ?? "").trim() || null;
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const isActive = String(formData.get("is_active") ?? "true") === "true";

  if (!targetId) {
    if (jsonMode) return jsonResponse(false, "Selecciona un perfil válido.", 400);
    return setRedirect(response, request, dashboardPathForRole(auth.profile.role), "missing_profile");
  }

  const { error } = await auth.adminClient
    .from("profiles")
    .update({ full_name: fullName, phone, is_active: isActive })
    .eq("id", targetId);

  if (error) {
    if (jsonMode) return jsonResponse(false, "No se pudo actualizar el perfil.", 500);
    return setRedirect(response, request, dashboardPathForRole(auth.profile.role), "profile_failed");
  }

  if (jsonMode) return jsonResponse(true, "Perfil actualizado correctamente.", 200);
  return setRedirect(response, request, dashboardPathForRole(auth.profile.role));
}
