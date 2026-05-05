import { NextRequest, NextResponse } from "next/server";
import { dashboardPathForRole } from "@/src/lib/auth";
import {
  resolveSaleVariant,
  resolveWholesaleDiscountAmount,
  resolveWholesaleNetTotal,
  resolveWholesaleSelection
} from "@/src/lib/ledger";
import { pricingRowsToSettings } from "@/src/lib/pricing";
import { getRouteAuthContext } from "@/src/lib/route-auth";
import { createRateLimitHtmlResponse, rateLimitEmbajador } from "@/src/lib/rate-limit";
import type { PricingVersionRow, PricingWholesaleTierRow, ProductionBatchRow, SaleType } from "@/src/lib/supabase/types";

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

function saleTotal(
  settings: ReturnType<typeof pricingRowsToSettings>,
  saleType: SaleType,
  quantity: number,
  wholesaleVariant: "withAlcohol" | "withoutAlcohol"
) {
  switch (saleType) {
    case "unit":
      return settings.unitWithAlcoholPrice * quantity;
    case "promo":
      return settings.promoPackagePrice * quantity;
    case "gift":
      return settings.giftWithAlcoholPrice * quantity;
    case "singleNoAlcohol":
      return settings.unitNoAlcoholPrice * quantity;
    case "giftNoAlcohol":
      return settings.giftNoAlcoholPrice * quantity;
    case "wholesale":
      return (resolveWholesaleSelection(settings, wholesaleVariant, quantity).tier?.unitPrice ?? 0) * quantity;
  }
}

function unitsConsumed(saleType: SaleType, quantity: number) {
  return saleType === "promo" ? quantity * 2 : quantity;
}

async function resolveFifoCost(
  adminClient: any,
  variant: "withAlcohol" | "withoutAlcohol",
  units: number
) {
  const [batchesResult, consumptionsResult] = await Promise.all([
    adminClient.from("production_batches").select("*").eq("variant", variant).order("created_at", { ascending: true }),
    adminClient.from("sale_batch_consumptions").select("batch_id, units")
  ]);

  const batches = (batchesResult.data ?? []) as ProductionBatchRow[];
  const consumedByBatch = new Map<string, number>();
  for (const row of consumptionsResult.data ?? []) {
    const batchId = row.batch_id;
    if (!batchId) continue;
    consumedByBatch.set(batchId, (consumedByBatch.get(batchId) ?? 0) + Number(row.units));
  }

  let remaining = units;
  let totalCost = 0;
  const rows: Array<{ batch_id: string; units: number; cost: number }> = [];

  for (const batch of batches) {
    if (remaining <= 0) break;

    const alreadyConsumed = consumedByBatch.get(batch.id) ?? 0;
    const available = Math.max(0, batch.units_produced - alreadyConsumed);
    if (available <= 0) continue;

    const take = Math.min(available, remaining);
    const cost = take * (Number(batch.total_cost) / batch.units_produced);
    rows.push({ batch_id: batch.id, units: take, cost });
    totalCost += cost;
    remaining -= take;
  }

  return { totalCost, rows };
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const jsonMode = wantsJson(request);
  const response = NextResponse.redirect(new URL("/login", request.url), { status: 303 });
  const auth = await getRouteAuthContext(request, response);

  if (!auth) {
    if (jsonMode) {
      return jsonResponse(false, "Inicia sesión para continuar.", 401);
    }
    return setRedirect(response, request, "/login", "not_authenticated");
  }

  if (auth.profile.must_change_password) {
    return jsonResponse(false, "Debes cambiar tu contraseña antes de registrar ventas.", 403);
  }

  if (auth.profile.role === "embajador") {
    const embajadorLimit = await rateLimitEmbajador(request, auth.userId);
    if (!embajadorLimit.allowed) {
      return createRateLimitHtmlResponse(
        "Has alcanzado el límite temporal de acciones para embajadores.",
        embajadorLimit.retryAfterSeconds
      );
    }

    if (jsonMode) {
      return jsonResponse(false, "El embajador solo puede consultar ventas asignadas en esta fase.", 403);
    }
    return setRedirect(response, request, dashboardPathForRole(auth.profile.role), "not_authorized");
  }

  const saleType = String(formData.get("sale_type") ?? "unit") as SaleType;
  const quantity = Number(formData.get("quantity") ?? 1);
  const wholesaleVariant = String(formData.get("wholesale_variant") ?? "withAlcohol") as "withAlcohol" | "withoutAlcohol";
  const note = String(formData.get("note") ?? "").trim() || null;
  const ambassadorProfileIdRaw = String(formData.get("ambassador_profile_id") ?? "").trim();

  if (
    !["unit", "promo", "gift", "singleNoAlcohol", "giftNoAlcohol", "wholesale"].includes(saleType) ||
    !["withAlcohol", "withoutAlcohol"].includes(wholesaleVariant) ||
    !Number.isFinite(quantity) ||
    quantity < 1 ||
    (saleType === "wholesale" && quantity < 20)
  ) {
    if (jsonMode) {
      return jsonResponse(false, "Revisa tipo, variante y cantidad.", 400);
    }
    return setRedirect(response, request, dashboardPathForRole(auth.profile.role), "invalid_sale");
  }

  const ambassadorProfileId =
    auth.profile.role === "admin" && saleType === "wholesale" && ambassadorProfileIdRaw
      ? ambassadorProfileIdRaw
      : null;

  const [pricingResult, tiersResult] = await Promise.all([
    auth.adminClient.from("pricing_versions").select("*").eq("is_active", true).maybeSingle(),
    auth.adminClient.from("pricing_wholesale_tiers").select("*")
  ]);
  const pricing = pricingResult.data as PricingVersionRow | null;
  const tiers = (tiersResult.data ?? []) as PricingWholesaleTierRow[];
  const activeTiers = pricing ? tiers.filter((tier) => tier.pricing_version_id === pricing.id) : [];
  const settings = pricingRowsToSettings(pricing, activeTiers);

  const resolvedVariant = resolveSaleVariant({ saleType, wholesaleVariant });
  const priceTotal = saleTotal(settings, saleType, quantity, wholesaleVariant);
  const selection = saleType === "wholesale" ? resolveWholesaleSelection(settings, wholesaleVariant, quantity) : null;
  const hasAmbassador = Boolean(ambassadorProfileId);
  const wholesaleDiscountPct = saleType === "wholesale" && hasAmbassador ? selection?.discountPct ?? 0 : 0;
  const wholesaleDiscountValue =
    saleType === "wholesale" && hasAmbassador ? resolveWholesaleDiscountAmount(priceTotal, wholesaleDiscountPct) : 0;
  const wholesaleNetTotal =
    saleType === "wholesale" && hasAmbassador ? resolveWholesaleNetTotal(priceTotal, wholesaleDiscountPct) : priceTotal;
  const wholesaleBaseCommissionPct = saleType === "wholesale" && hasAmbassador ? selection?.commissionRate ?? 0 : 0;
  const wholesaleBoostBonusPct = 0;
  const commissionRate = wholesaleBaseCommissionPct + wholesaleBoostBonusPct;
  const commissionValue = saleType === "wholesale" && hasAmbassador ? wholesaleNetTotal * commissionRate : 0;
  const fifo = await resolveFifoCost(auth.adminClient, resolvedVariant, unitsConsumed(saleType, quantity));
  const grossProfit = priceTotal - fifo.totalCost;
  const margin = priceTotal > 0 ? grossProfit / priceTotal : 0;

  const { data: sale, error } = await auth.adminClient
    .from("sales")
    .insert({
      amount: wholesaleNetTotal,
      quantity,
      note,
      ambassador_profile_id: ambassadorProfileId,
      created_by: auth.userId,
      sale_type: saleType,
      wholesale_variant: saleType === "wholesale" ? wholesaleVariant : null,
      pricing_version_id: pricing?.id ?? null,
      price_total: priceTotal,
      wholesale_discount_pct: wholesaleDiscountPct,
      wholesale_discount_value: wholesaleDiscountValue,
      wholesale_net_total: wholesaleNetTotal,
      wholesale_base_commission_pct: wholesaleBaseCommissionPct,
      wholesale_boost_bonus_pct: wholesaleBoostBonusPct,
      commission_rate: commissionRate,
      commission_value: commissionValue,
      cost_of_goods: fifo.totalCost,
      gross_profit: grossProfit,
      margin
    })
    .select("*")
    .single();

  if (error || !sale) {
    if (jsonMode) {
      return jsonResponse(false, "No se pudo guardar la venta.", 500);
    }
    return setRedirect(response, request, dashboardPathForRole(auth.profile.role), "sale_failed");
  }

  if (fifo.rows.length > 0) {
    await auth.adminClient.from("sale_batch_consumptions").insert(
      fifo.rows.map((row) => ({
        sale_id: sale.id,
        batch_id: row.batch_id,
        units: row.units,
        cost: row.cost
      }))
    );
  }

  if (jsonMode) {
    return jsonResponse(true, "Venta guardada correctamente.", 201);
  }

  return setRedirect(response, request, dashboardPathForRole(auth.profile.role));
}
