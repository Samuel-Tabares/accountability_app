import { NextRequest, NextResponse } from "next/server";
import { dashboardPathForRole } from "@/src/lib/auth";
import { validatePassword } from "@/src/lib/password-policy";
import { getRouteAuthContext } from "@/src/lib/route-auth";

function wantsJson(request: NextRequest) {
  return request.headers.get("accept")?.includes("application/json") ?? false;
}

function jsonResponse(ok: boolean, message: string, status: number, redirectTo?: string) {
  return NextResponse.json({ ok, message, redirectTo }, { status });
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
    return response;
  }

  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");

  if (password !== confirmation) {
    return jsonResponse(false, "Las contraseñas no coinciden.", 400);
  }

  const policyError = validatePassword(password);
  if (policyError) {
    return jsonResponse(false, policyError, 400);
  }

  const { error: authError } = await auth.adminClient.auth.admin.updateUserById(auth.userId, {
    password
  });

  if (authError) {
    return jsonResponse(false, authError.message, 500);
  }

  const { error: profileError } = await auth.adminClient
    .from("profiles")
    .update({
      must_change_password: false,
      password_updated_at: new Date().toISOString()
    })
    .eq("id", auth.userId);

  if (profileError) {
    return jsonResponse(false, "No se pudo actualizar el perfil.", 500);
  }

  const redirectTo = dashboardPathForRole(auth.profile.role);
  if (jsonMode) {
    return jsonResponse(true, "Contraseña actualizada.", 200, redirectTo);
  }

  return NextResponse.redirect(new URL(redirectTo, request.url), { status: 303 });
}
