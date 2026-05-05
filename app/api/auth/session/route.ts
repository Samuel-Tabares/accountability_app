import { NextRequest, NextResponse } from "next/server";
import { buildAuthAliasEmail, normalizeHandle } from "@/src/lib/identity";
import { dashboardPathForRole } from "@/src/lib/auth";
import { createRateLimitHtmlResponse, rateLimitLogin } from "@/src/lib/rate-limit";
import { createSupabaseAdminClient } from "@/src/lib/supabase/admin";
import { createSupabaseRouteClient } from "@/src/lib/supabase/route";
import { setAppSessionCookie } from "@/src/lib/app-session-cookie";

function wantsJson(request: NextRequest) {
  return request.headers.get("accept")?.includes("application/json") ?? false;
}

function jsonResponse(body: unknown, status: number, headers?: Record<string, string>) {
  return NextResponse.json(body, {
    status,
    headers
  });
}

function redirectResponse(request: NextRequest, path: string, error?: string, extras?: Record<string, string>) {
  const url = new URL(path, request.url);
  if (error) {
    url.searchParams.set("error", error);
  }
  if (extras) {
    for (const [key, value] of Object.entries(extras)) {
      url.searchParams.set(key, value);
    }
  }

  return NextResponse.redirect(url, { status: 303 });
}

function copySetCookies(source: NextResponse, target: NextResponse) {
  const headers = source.headers as Headers & { getSetCookie?: () => string[] };
  const cookies = headers.getSetCookie?.() ?? [];

  if (cookies.length > 0) {
    for (const cookie of cookies) {
      target.headers.append("Set-Cookie", cookie);
    }
    return;
  }

  const singleCookie = source.headers.get("set-cookie");
  if (singleCookie) {
    target.headers.append("Set-Cookie", singleCookie);
  }
}

function loginFailureMessage(errorCode: string) {
  if (errorCode === "missing_credentials") return "Faltan credenciales.";
  if (errorCode === "profile_missing") return "La cuenta no tiene perfil activo.";
  if (errorCode === "login_failed") return "No se pudo iniciar sesión.";
  if (errorCode === "invalid_identifier") return "El usuario o código no es válido.";
  return "No se pudo completar la solicitud.";
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const jsonMode = wantsJson(request);
  const identifier = String(formData.get("identifier") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!identifier || !password) {
    const message = loginFailureMessage("missing_credentials");
    if (jsonMode) {
      return jsonResponse({ ok: false, message }, 400);
    }

    return redirectResponse(request, "/login", "missing_credentials");
  }

  let normalizedIdentifier: string;
  try {
    normalizedIdentifier = normalizeHandle(identifier);
  } catch {
    const message = loginFailureMessage("invalid_identifier");
    if (jsonMode) {
      return jsonResponse({ ok: false, message }, 400);
    }

    return redirectResponse(request, "/login", "invalid_identifier");
  }

  const rateLimit = await rateLimitLogin(request, normalizedIdentifier);
  if (!rateLimit.allowed) {
    const retryAfterSeconds = rateLimit.retryAfterSeconds ?? 10;
    const message = rateLimit.unavailable
      ? "La protección temporal de acceso no está disponible. Intenta de nuevo en unos segundos."
      : `Demasiados intentos. Intenta de nuevo en ${retryAfterSeconds} segundos.`;

    if (jsonMode) {
      return jsonResponse(
        {
          ok: false,
          message,
          retryAfterSeconds
        },
        rateLimit.unavailable ? 503 : 429,
        {
          "Retry-After": String(retryAfterSeconds),
          "Cache-Control": "no-store"
        }
      );
    }

    return rateLimit.unavailable
      ? new NextResponse(
          `<!doctype html><html lang="es"><body><p>${message}</p></body></html>`,
          {
            status: 503,
            headers: {
              "Content-Type": "text/html; charset=utf-8",
              "Retry-After": String(retryAfterSeconds),
              "Cache-Control": "no-store"
            }
          }
        )
      : createRateLimitHtmlResponse(message, retryAfterSeconds);
  }

  const cookieResponse = NextResponse.next();
  const supabase = createSupabaseRouteClient(request, cookieResponse);
  const aliasDomain = process.env.SUPABASE_AUTH_ALIAS_DOMAIN ?? "trabix.local";
  const aliasEmail = buildAuthAliasEmail(normalizedIdentifier, aliasDomain);

  const { data, error } = await supabase.auth.signInWithPassword({ email: aliasEmail, password });
  if (error || !data.user) {
    const message = loginFailureMessage("login_failed");
    if (jsonMode) {
      return jsonResponse({ ok: false, message }, 401);
    }

    return redirectResponse(request, "/login", "login_failed");
  }

  const adminClient = createSupabaseAdminClient();
  const { data: profile } = await adminClient.from("profiles").select("*").eq("id", data.user.id).maybeSingle();
  if (!profile) {
    await supabase.auth.signOut();
    const message = loginFailureMessage("profile_missing");
    if (jsonMode) {
      const response = jsonResponse({ ok: false, message }, 403);
      copySetCookies(cookieResponse, response);
      return response;
    }

    const response = redirectResponse(request, "/login", "profile_missing");
    copySetCookies(cookieResponse, response);
    return response;
  }

  const redirectTo = profile.must_change_password ? "/cambiar-contrasena" : dashboardPathForRole(profile.role);
  if (jsonMode) {
    const response = jsonResponse(
      {
        ok: true,
        redirectTo
      },
      200
    );
    setAppSessionCookie(response, data.user.id);
    return response;
  }

  const response = redirectResponse(request, redirectTo);
  copySetCookies(cookieResponse, response);
  setAppSessionCookie(response, data.user.id);
  return response;
}
