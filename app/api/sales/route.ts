import { NextRequest, NextResponse } from "next/server";
import { dashboardPathForRole } from "@/src/lib/auth";
import { createSupabaseRouteClient } from "@/src/lib/supabase/route";
import { createRateLimitHtmlResponse, rateLimitEmbajador } from "@/src/lib/rate-limit";

function setRedirect(response: NextResponse, request: NextRequest, fallback: string, error?: string) {
  const target = request.headers.get("referer") ?? new URL(fallback, request.url).toString();
  const url = new URL(target);
  if (error) {
    url.searchParams.set("error", error);
  }
  response.headers.set("Location", url.toString());
  return response;
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const response = NextResponse.redirect(new URL("/login", request.url), { status: 303 });
  const supabase = createSupabaseRouteClient(request, response);

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return setRedirect(response, request, "/login", "not_authenticated");
  }

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (!profile || !profile.is_active) {
    await supabase.auth.signOut();
    return setRedirect(response, request, "/login", "profile_inactive");
  }

  if (profile.role === "embajador") {
    const embajadorLimit = await rateLimitEmbajador(request, user.id);
    if (!embajadorLimit.allowed) {
      return createRateLimitHtmlResponse(
        "Has alcanzado el límite temporal de acciones para embajadores.",
        embajadorLimit.retryAfterSeconds
      );
    }
  }

  const amount = Number(formData.get("amount"));
  const quantity = Number(formData.get("quantity") ?? 1);
  const note = String(formData.get("note") ?? "").trim() || null;
  const ambassadorProfileIdRaw = String(formData.get("ambassador_profile_id") ?? "").trim();
  const ambassadorProfileId = profile.role === "admin" && ambassadorProfileIdRaw ? ambassadorProfileIdRaw : user.id;

  if (!Number.isFinite(amount) || amount < 0 || !Number.isFinite(quantity) || quantity < 1) {
    return setRedirect(response, request, dashboardPathForRole(profile.role), "invalid_sale");
  }

  const { error } = await supabase.from("sales").insert({
    amount,
    quantity,
    note,
    ambassador_profile_id: ambassadorProfileId,
    created_by: user.id
  });

  if (error) {
    return setRedirect(response, request, dashboardPathForRole(profile.role), "sale_failed");
  }

  return setRedirect(response, request, dashboardPathForRole(profile.role));
}
