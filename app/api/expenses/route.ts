import { NextRequest, NextResponse } from "next/server";
import { dashboardPathForRole } from "@/src/lib/auth";
import { createSupabaseRouteClient } from "@/src/lib/supabase/route";
import { createSupabaseAdminClient } from "@/src/lib/supabase/admin";
import { readAppSessionCookie } from "@/src/lib/app-session-cookie";

function setRedirect(response: NextResponse, request: NextRequest, fallback: string, error?: string) {
  const target = request.headers.get("referer") ?? new URL(fallback, request.url).toString();
  const url = new URL(target);
  if (error) {
    url.searchParams.set("error", error);
  }
  response.headers.set("Location", url.toString());
  return response;
}

function wantsJson(request: NextRequest) {
  return request.headers.get("accept")?.includes("application/json") ?? false;
}

function jsonResponse(ok: boolean, message: string, status: number) {
  return NextResponse.json({ ok, message }, { status });
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const jsonMode = wantsJson(request);
  const response = NextResponse.redirect(new URL("/login", request.url), { status: 303 });
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

  const authClient = user ? supabase : createSupabaseAdminClient();
  const { data: profile } = await authClient.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (!profile || profile.role !== "admin" || !profile.is_active) {
    await supabase.auth.signOut();
    if (jsonMode) {
      return jsonResponse(false, "No tienes permisos para registrar gastos.", 403);
    }
    return setRedirect(response, request, "/login", "not_authorized");
  }

  const amount = Number(formData.get("amount"));
  const category = String(formData.get("category") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const expenseType = String(formData.get("expense_type") ?? "monthly");
  const ambassadorProfileIdRaw = String(formData.get("ambassador_profile_id") ?? "").trim();
  const ambassadorProfileId = ambassadorProfileIdRaw || null;

  if (!Number.isFinite(amount) || amount < 0 || !category || !description) {
    if (jsonMode) {
      return jsonResponse(false, "Revisa categoría, descripción y monto.", 400);
    }
    return setRedirect(response, request, dashboardPathForRole(profile.role), "invalid_expense");
  }

  const { error } = await authClient.from("expenses").insert({
    amount,
    category,
    description,
    expense_type: expenseType as "monthly" | "oneTime" | "commission" | "discount",
    ambassador_profile_id: ambassadorProfileId,
    created_by: userId
  });

  if (error) {
    if (jsonMode) {
      return jsonResponse(false, "No se pudo guardar el gasto.", 500);
    }
    return setRedirect(response, request, dashboardPathForRole(profile.role), "expense_failed");
  }

  if (jsonMode) {
    return jsonResponse(true, "Gasto guardado correctamente.", 201);
  }

  return setRedirect(response, request, dashboardPathForRole(profile.role));
}
