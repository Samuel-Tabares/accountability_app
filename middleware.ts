import { NextRequest, NextResponse } from "next/server";
import { dashboardPathForRole } from "@/src/lib/auth";
import { createSupabaseMiddlewareClient } from "@/src/lib/supabase/middleware";
import { createRateLimitHtmlResponse, rateLimitEmbajador } from "@/src/lib/rate-limit";

function withRedirect(request: NextRequest, path: string, error?: string) {
  const url = new URL(path, request.url);
  if (error) {
    url.searchParams.set("error", error);
  }
  return NextResponse.redirect(url, { status: 307 });
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const supabase = createSupabaseMiddlewareClient(request);

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (pathname === "/") {
    if (!user) {
      return withRedirect(request, "/login");
    }

    const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
    if (!profile || !profile.is_active) {
      return withRedirect(request, "/login", "profile_inactive");
    }

    return withRedirect(request, dashboardPathForRole(profile.role));
  }

  if (pathname === "/login") {
    if (!user) {
      return NextResponse.next();
    }

    const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
    if (!profile || !profile.is_active) {
      return withRedirect(request, "/login", "profile_inactive");
    }

    return withRedirect(request, dashboardPathForRole(profile.role));
  }

  if (!user) {
    return withRedirect(request, "/login", "not_authenticated");
  }

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (!profile || !profile.is_active) {
    return withRedirect(request, "/login", "profile_inactive");
  }

  if (pathname.startsWith("/admin") && profile.role !== "admin") {
    return withRedirect(request, dashboardPathForRole(profile.role), "not_authorized");
  }

  if (pathname.startsWith("/embajador") && profile.role !== "embajador") {
    return withRedirect(request, dashboardPathForRole(profile.role), "not_authorized");
  }

  if (pathname.startsWith("/embajador") && profile.role === "embajador") {
    const embajadorLimit = await rateLimitEmbajador(request, user.id);
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
