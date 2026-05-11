import { NextRequest, NextResponse } from "next/server";
import { normalizeHandle } from "@/src/lib/identity";
import { upsertAuthAliasUser, upsertProfile } from "@/src/lib/supabase/user-admin";
import { requireRouteRole } from "@/src/lib/route-auth";
import { generateTemporaryPassword } from "@/src/lib/temp-password";
import { createSupabaseAdminClient } from "@/src/lib/supabase/admin";
import { jsonResponse, setRedirect, wantsJson } from "@/src/lib/api-utils";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const jsonMode = wantsJson(request);
  const response = NextResponse.redirect(new URL("/admin", request.url), { status: 303 });
  const auth = await requireRouteRole(request, response, "admin");

  if (!auth) {
    if (jsonMode) return jsonResponse(false, "No tienes permisos para crear embajadores.", 403);
    return setRedirect(response, request, "/login", "not_authorized");
  }

  const codeRaw = String(formData.get("code") ?? "").trim();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();

  if (!codeRaw || !fullName || !phone) {
    if (jsonMode) return jsonResponse(false, "Completa código, nombre y teléfono.", 400);
    return setRedirect(response, request, "/admin", "invalid_embajador");
  }

  let username: string;
  let code: string;
  try {
    code = normalizeHandle(codeRaw);
    username = code;
  } catch {
    if (jsonMode) return jsonResponse(false, "El código no es válido.", 400);
    return setRedirect(response, request, "/admin", "invalid_embajador");
  }

  const password = generateTemporaryPassword();
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
      level: "nivel0",
      mustChangePassword: true,
      isActive: true
    });
  } catch (error) {
    if (jsonMode) {
      return jsonResponse(
        false,
        error instanceof Error ? error.message : "No se pudo crear el embajador.",
        500
      );
    }
    return setRedirect(response, request, "/admin", "embajador_failed");
  }

  if (jsonMode) {
    return jsonResponse(true, "Embajador creado correctamente.", 201, { username, code, password });
  }
  return setRedirect(response, request, "/admin", undefined, "embajador_created");
}
