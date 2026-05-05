import { NextRequest, NextResponse } from "next/server";
import { createSupabaseRouteClient } from "@/src/lib/supabase/route";
import { createSupabaseAdminClient } from "@/src/lib/supabase/admin";
import { normalizeHandle } from "@/src/lib/identity";
import { upsertAuthAliasUser, upsertProfile } from "@/src/lib/supabase/user-admin";
import { readAppSessionCookie } from "@/src/lib/app-session-cookie";
import { generateTemporaryPassword } from "@/src/lib/temp-password";

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

function wantsJson(request: NextRequest) {
  return request.headers.get("accept")?.includes("application/json") ?? false;
}

function jsonResponse(ok: boolean, message: string, status: number, extras?: Record<string, string>) {
  return NextResponse.json({ ok, message, ...extras }, { status });
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const jsonMode = wantsJson(request);
  const response = NextResponse.redirect(new URL("/admin", request.url), { status: 303 });
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

  const profileClient = user ? supabase : createSupabaseAdminClient();
  const { data: profile } = await profileClient.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (!profile || profile.role !== "admin" || !profile.is_active) {
    await supabase.auth.signOut();
    if (jsonMode) {
      return jsonResponse(false, "No tienes permisos para crear embajadores.", 403);
    }
    return setRedirect(response, request, "/login", "not_authorized");
  }

  const codeRaw = String(formData.get("code") ?? "").trim();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();

  if (!codeRaw || !fullName || !phone) {
    if (jsonMode) {
      return jsonResponse(false, "Completa código, nombre y teléfono.", 400);
    }
    return setRedirect(response, request, "/admin", "invalid_embajador");
  }

  let username: string;
  let code: string;

  try {
    code = normalizeHandle(codeRaw);
    username = code;
  } catch {
    if (jsonMode) {
      return jsonResponse(false, "El código no es válido.", 400);
    }
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
