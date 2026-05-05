import { NextRequest, NextResponse } from "next/server";
import { createRateLimitHtmlResponse, rateLimitEmbajador } from "@/src/lib/rate-limit";
import { readSupabaseSessionCookie } from "@/src/lib/supabase/session-cookie";

const APP_SESSION_COOKIE = "trabix-session";

function dashboardPathForRole(role: "admin" | "embajador") {
  return role === "admin" ? "/admin" : "/embajador";
}

function withRedirect(request: NextRequest, path: string, error?: string) {
  const url = new URL(path, request.url);
  if (error) {
    url.searchParams.set("error", error);
  }
  return NextResponse.redirect(url, { status: 307 });
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = readSupabaseSessionCookie(request.cookies);
  const appSessionExists = Boolean(request.cookies.get(APP_SESSION_COOKIE)?.value);
  const userId = session?.userId ?? (appSessionExists ? "app-session" : undefined);
  const role = session?.role === "admin" ? "admin" : session?.role === "embajador" ? "embajador" : null;

  if (pathname === "/") {
    if (!userId) {
      return withRedirect(request, "/login");
    }
    return withRedirect(request, dashboardPathForRole(role ?? "embajador"));
  }

  if (pathname === "/login" || pathname === "/cambiar-contrasena") {
    return NextResponse.next();
  }

  if (!userId) {
    return withRedirect(request, "/login", "not_authenticated");
  }

  if (!role) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/embajador") && role === "embajador") {
    const embajadorLimit = await rateLimitEmbajador(request, userId);
    if (!embajadorLimit.allowed) {
      return createRateLimitHtmlResponse(
        "Has alcanzado el límite temporal de acceso al panel de embajador.",
        embajadorLimit.retryAfterSeconds
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api).*)"]
};
