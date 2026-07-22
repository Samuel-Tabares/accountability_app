import { NextRequest, NextResponse } from "next/server";
import { requireRouteRole } from "@/src/lib/route-auth";
import { jsonResponse, setRedirect, wantsJson } from "@/src/lib/api-utils";
import { closedCycles } from "@/src/lib/levels";
import { resolveActiveProductionBatch, resolveFifoCost } from "@/src/lib/fifo";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const jsonMode = wantsJson(request);
  const response = NextResponse.redirect(new URL("/admin", request.url), { status: 303 });
  const auth = await requireRouteRole(request, response, "admin");

  if (!auth) {
    if (jsonMode) return jsonResponse(false, "No tienes permisos para liquidar.", 403);
    return setRedirect(response, request, "/login", "not_authorized");
  }

  const profileId = String(formData.get("profile_id") ?? "").trim();
  const cycleStartRaw = String(formData.get("cycle_start") ?? "").trim();
  const cycleStart = new Date(cycleStartRaw);
  if (!profileId || !cycleStartRaw || Number.isNaN(cycleStart.getTime())) {
    if (jsonMode) return jsonResponse(false, "Faltan datos para liquidar el ciclo.", 400);
    return setRedirect(response, request, "/admin", "invalid_payout");
  }

  const { data: profile } = await auth.adminClient
    .from("profiles")
    .select("id, role, created_at, full_name")
    .eq("id", profileId)
    .maybeSingle();
  if (!profile || profile.role !== "embajador") {
    if (jsonMode) return jsonResponse(false, "Selecciona un embajador válido.", 400);
    return setRedirect(response, request, "/admin", "invalid_payout");
  }

  const { data: salesData } = await auth.adminClient
    .from("sales")
    .select("created_at, quantity, commission_value")
    .eq("ambassador_profile_id", profileId)
    .eq("sale_type", "wholesale");
  const sales = salesData ?? [];

  // Re-derive the cycle, level and amount server-side — never trust client values.
  const anchor = new Date(profile.created_at);
  const target = closedCycles(sales, anchor).find((cycle) => cycle.start.getTime() === cycleStart.getTime());
  if (!target) {
    if (jsonMode) return jsonResponse(false, "Ese ciclo no está cerrado o no tiene ventas.", 400);
    return setRedirect(response, request, "/admin", "invalid_payout");
  }
  if (target.level.baseSalary <= 0) {
    if (jsonMode) return jsonResponse(false, "El nivel alcanzado en ese ciclo no tiene sueldo base.", 400);
    return setRedirect(response, request, "/admin", "no_base_salary");
  }

  const commissions = sales.reduce((sum, sale) => {
    const ts = new Date(sale.created_at).getTime();
    return ts >= target.start.getTime() && ts < target.end.getTime()
      ? sum + Number(sale.commission_value ?? 0)
      : sum;
  }, 0);

  const embajadorName = profile.full_name ?? "embajador";
  const activeBatch = await resolveActiveProductionBatch(auth.adminClient);
  const { data: expense, error: expenseError } = await auth.adminClient
    .from("expenses")
    .insert({
      created_by: auth.userId,
      ambassador_profile_id: profileId,
      category: "sueldo_base",
      description: `Sueldo base ${target.level.label} · ${embajadorName}`,
      amount: target.level.baseSalary,
      expense_type: "oneTime",
      batch_id: activeBatch?.id ?? null
    })
    .select("*")
    .single();
  if (expenseError || !expense) {
    if (jsonMode) return jsonResponse(false, "No se pudo registrar el gasto de sueldo base.", 500);
    return setRedirect(response, request, "/admin", "payout_failed");
  }

  // Auto-consume the level's free granizados as a gift sale (FIFO cost, no revenue).
  let giftSale: Record<string, unknown> | null = null;
  let giftConsumptions: Array<Record<string, unknown>> = [];
  if (target.level.freeUnits > 0) {
    const fifo = await resolveFifoCost(auth.adminClient, "withAlcohol", target.level.freeUnits);
    const { data: sale, error: saleError } = await auth.adminClient
      .from("sales")
      .insert({
        created_by: auth.userId,
        ambassador_profile_id: profileId,
        amount: 0,
        quantity: target.level.freeUnits,
        note: `Regalo a embajador ${embajadorName} · ${target.level.label}`,
        sale_type: "gift",
        wholesale_variant: null,
        price_total: 0,
        commission_rate: 0,
        commission_value: 0,
        cost_of_goods: fifo.totalCost,
        gross_profit: -fifo.totalCost,
        net_profit: -fifo.totalCost,
        margin: 0
      })
      .select("*")
      .single();

    if (saleError || !sale) {
      await auth.adminClient.from("expenses").delete().eq("id", expense.id);
      if (jsonMode) return jsonResponse(false, "No se pudieron registrar los granizados de regalo.", 500);
      return setRedirect(response, request, "/admin", "payout_failed");
    }
    giftSale = sale;

    if (fifo.rows.length > 0) {
      const { data: consumptions } = await auth.adminClient
        .from("sale_batch_consumptions")
        .insert(fifo.rows.map((row) => ({ sale_id: sale.id, batch_id: row.batch_id, units: row.units, cost: row.cost })))
        .select("sale_id, batch_id, units, cost");
      giftConsumptions = (consumptions ?? []) as Array<Record<string, unknown>>;
    }
  }

  const { data: payout, error: payoutError } = await auth.adminClient
    .from("ambassador_payouts")
    .insert({
      created_by: auth.userId,
      ambassador_profile_id: profileId,
      cycle_index: target.index,
      cycle_start: target.start.toISOString(),
      cycle_end: target.end.toISOString(),
      units: target.units,
      level: target.level.level,
      base_salary: target.level.baseSalary,
      commissions,
      free_units: target.level.freeUnits,
      expense_id: expense.id
    })
    .select("*")
    .single();

  if (payoutError || !payout) {
    // Avoid orphans if the payout row could not be written.
    if (giftSale) await auth.adminClient.from("sales").delete().eq("id", String(giftSale.id));
    await auth.adminClient.from("expenses").delete().eq("id", expense.id);
    const alreadyPaid = payoutError?.code === "23505";
    const message = alreadyPaid ? "Ese ciclo ya fue liquidado." : "No se pudo registrar la liquidación.";
    if (jsonMode) return jsonResponse(false, message, alreadyPaid ? 409 : 500);
    return setRedirect(response, request, "/admin", alreadyPaid ? "already_paid" : "payout_failed");
  }

  if (jsonMode) {
    return jsonResponse(true, "Sueldo base liquidado correctamente.", 201, {
      payout,
      expense,
      giftSale,
      giftConsumptions
    });
  }
  return setRedirect(response, request, "/admin", undefined, "payout_done");
}
