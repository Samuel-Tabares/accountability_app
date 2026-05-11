import { NextRequest, NextResponse } from "next/server";
import { generateTemporaryPassword } from "@/src/lib/temp-password";
import { requireRouteRole } from "@/src/lib/route-auth";
import { jsonResponse, wantsJson } from "@/src/lib/api-utils";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const jsonMode = wantsJson(request);
  const response = NextResponse.redirect(new URL("/admin", request.url), { status: 303 });
  const auth = await requireRouteRole(request, response, "admin");

  if (!auth) {
    if (jsonMode) return jsonResponse(false, "No tienes permisos para resetear contraseñas.", 403);
    return response;
  }

  const profileId = String(formData.get("profile_id") ?? "").trim();
  if (!profileId) {
    return jsonResponse(false, "Selecciona un embajador válido.", 400);
  }

  const { data: profile } = await auth.adminClient
    .from("profiles")
    .select("id, username, ambassador_id, must_change_password")
    .eq("id", profileId)
    .eq("role", "embajador")
    .maybeSingle();

  if (!profile) {
    return jsonResponse(false, "No se encontró el embajador.", 404);
  }

  const password = generateTemporaryPassword();
  const { error: authError } = await auth.adminClient.auth.admin.updateUserById(profile.id, { password });

  if (authError) {
    return jsonResponse(false, authError.message, 500);
  }

  const { error: profileError } = await auth.adminClient
    .from("profiles")
    .update({ must_change_password: true, password_reset_at: new Date().toISOString() })
    .eq("id", profile.id);

  if (profileError) {
    return jsonResponse(false, "La contraseña cambió, pero no se pudo marcar como temporal.", 500);
  }

  return jsonResponse(true, "Contraseña temporal generada.", 200, {
    username: profile.username,
    code: profile.ambassador_id ?? profile.username,
    password
  });
}
