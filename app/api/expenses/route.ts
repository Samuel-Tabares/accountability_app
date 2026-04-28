import { NextRequest, NextResponse } from "next/server";
import { dashboardPathForRole } from "@/src/lib/auth";
import { createSupabaseRouteClient } from "@/src/lib/supabase/route";

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
  if (!profile || profile.role !== "admin" || !profile.is_active) {
    await supabase.auth.signOut();
    return setRedirect(response, request, "/login", "not_authorized");
  }

  const amount = Number(formData.get("amount"));
  const category = String(formData.get("category") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const expenseType = String(formData.get("expense_type") ?? "monthly");
  const ambassadorProfileIdRaw = String(formData.get("ambassador_profile_id") ?? "").trim();
  const ambassadorProfileId = ambassadorProfileIdRaw || null;

  if (!Number.isFinite(amount) || amount < 0 || !category || !description) {
    return setRedirect(response, request, dashboardPathForRole(profile.role), "invalid_expense");
  }

  const { error } = await supabase.from("expenses").insert({
    amount,
    category,
    description,
    expense_type: expenseType as "monthly" | "oneTime" | "commission" | "discount",
    ambassador_profile_id: ambassadorProfileId,
    created_by: user.id
  });

  if (error) {
    return setRedirect(response, request, dashboardPathForRole(profile.role), "expense_failed");
  }

  return setRedirect(response, request, dashboardPathForRole(profile.role));
}
