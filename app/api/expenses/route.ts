import { NextRequest, NextResponse } from "next/server";
import { dashboardPathForRole } from "@/src/lib/auth";
import { requireRouteRole } from "@/src/lib/route-auth";
import { jsonResponse, setRedirect, wantsJson } from "@/src/lib/api-utils";
import { resolveActiveProductionBatch } from "@/src/lib/fifo";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const jsonMode = wantsJson(request);
  const response = NextResponse.redirect(new URL("/login", request.url), { status: 303 });
  const auth = await requireRouteRole(request, response, "admin");

  if (!auth) {
    if (jsonMode) return jsonResponse(false, "No tienes permisos para registrar gastos.", 403);
    return setRedirect(response, request, "/login", "not_authorized");
  }

  const amount = Number(formData.get("amount"));
  const category = String(formData.get("category") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const expenseType = String(formData.get("expense_type") ?? "monthly");
  const ambassadorProfileId = String(formData.get("ambassador_profile_id") ?? "").trim() || null;
  const batchIdOverride = String(formData.get("batch_id") ?? "").trim() || null;

  if (!Number.isFinite(amount) || amount < 0 || !category || !description) {
    if (jsonMode) return jsonResponse(false, "Revisa categoría, descripción y monto.", 400);
    return setRedirect(response, request, dashboardPathForRole(auth.profile.role), "invalid_expense");
  }

  // Todo gasto manual se liga a un lote — es de donde entró el dinero, así que
  // de ahí sale para que la utilidad por lote sea real. Por defecto el lote
  // activo (el más viejo con stock); el admin puede sobreescribirlo.
  const batchId = batchIdOverride ?? (await resolveActiveProductionBatch(auth.adminClient))?.id ?? null;

  const { data: expense, error } = await auth.adminClient
    .from("expenses")
    .insert({
      amount,
      category,
      description,
      expense_type: expenseType as "monthly" | "oneTime" | "commission" | "discount",
      ambassador_profile_id: ambassadorProfileId,
      batch_id: batchId,
      created_by: auth.userId
    })
    .select("*")
    .single();

  if (error) {
    if (jsonMode) return jsonResponse(false, "No se pudo guardar el gasto.", 500);
    return setRedirect(response, request, dashboardPathForRole(auth.profile.role), "expense_failed");
  }

  if (jsonMode) return jsonResponse(true, "Gasto guardado correctamente.", 201, { expense });
  return setRedirect(response, request, dashboardPathForRole(auth.profile.role));
}
