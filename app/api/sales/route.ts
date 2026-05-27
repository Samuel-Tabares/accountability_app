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
import { isMissingColumnError, isProfileBoostActive, jsonResponse, setRedirect, wantsJson } from "@/src/lib/api-utils";
import { PROMO_UNITS_MULTIPLIER, WHOLESALE_MIN_QUANTITY } from "@/src/lib/constants";
import { resolveFifoCost } from "@/src/lib/fifo";
import type { PricingVersionRow, PricingWholesaleTierRow, ProfileRow, SaleType } from "@/src/lib/supabase/types";

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
    case "consignment":
      return 0;
  }
}

function unitsConsumed(saleType: SaleType, quantity: number) {
  return saleType === "promo" ? quantity * PROMO_UNITS_MULTIPLIER : quantity;
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
    (saleType === "wholesale" && quantity < WHOLESALE_MIN_QUANTITY)
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
  const ambassadorProfileResult = ambassadorProfileId
    ? await auth.adminClient
        .from("profiles")
        .select("id, boost_active, boost_expires_at")
        .eq("id", ambassadorProfileId)
        .eq("role", "embajador")
        .eq("is_active", true)
        .maybeSingle()
    : { data: null };
  const ambassadorProfile = ambassadorProfileResult.data as ProfileRow | null;
  const validAmbassadorProfileId = ambassadorProfile?.id ?? null;

  const resolvedVariant = resolveSaleVariant({ saleType, wholesaleVariant });
  const priceTotal = saleTotal(settings, saleType, quantity, wholesaleVariant);
  const selection = saleType === "wholesale" ? resolveWholesaleSelection(settings, wholesaleVariant, quantity) : null;
  const hasAmbassador = Boolean(validAmbassadorProfileId);
  const wholesaleDiscountPct = saleType === "wholesale" && hasAmbassador ? selection?.discountPct ?? 0 : 0;
  const wholesaleDiscountValue =
    saleType === "wholesale" && hasAmbassador ? resolveWholesaleDiscountAmount(priceTotal, wholesaleDiscountPct) : 0;
  const wholesaleNetTotal =
    saleType === "wholesale" && hasAmbassador ? resolveWholesaleNetTotal(priceTotal, wholesaleDiscountPct) : priceTotal;
  const wholesaleBaseCommissionPct = saleType === "wholesale" && hasAmbassador ? selection?.commissionRate ?? 0 : 0;
  const wholesaleBoostBonusPct =
    saleType === "wholesale" && hasAmbassador && isProfileBoostActive(ambassadorProfile)
      ? settings.boostBonusPct
      : 0;
  const commissionRate = wholesaleBaseCommissionPct + wholesaleBoostBonusPct;
  const commissionValue = saleType === "wholesale" && hasAmbassador ? wholesaleNetTotal * commissionRate : 0;
  const fifo = await resolveFifoCost(auth.adminClient, resolvedVariant, unitsConsumed(saleType, quantity));
  const grossProfit = wholesaleNetTotal - fifo.totalCost;
  const netProfit = grossProfit - commissionValue;
  const margin = wholesaleNetTotal > 0 ? netProfit / wholesaleNetTotal : 0;

  const { data: sale, error } = await auth.adminClient
    .from("sales")
    .insert({
      amount: wholesaleNetTotal,
      quantity,
      note,
      ambassador_profile_id: validAmbassadorProfileId,
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
      net_profit: netProfit,
      margin
    })
    .select("*")
    .single();

  if (error || !sale) {
    const message = isMissingColumnError(error)
      ? "Falta aplicar la migración 0004_net_sale_boost.sql en Supabase."
      : "No se pudo guardar la venta.";
    if (jsonMode) {
      return jsonResponse(false, message, 500);
    }
    return setRedirect(response, request, dashboardPathForRole(auth.profile.role), "sale_failed");
  }

  if (fifo.rows.length > 0) {
    const { error: consumptionError } = await auth.adminClient.from("sale_batch_consumptions").insert(
      fifo.rows.map((row) => ({
        sale_id: sale.id,
        batch_id: row.batch_id,
        units: row.units,
        cost: row.cost
      }))
    );

    if (consumptionError) {
      await auth.adminClient.from("sales").delete().eq("id", sale.id);
      const message = isMissingColumnError(consumptionError)
        ? "Falta aplicar la migración 0004_net_sale_boost.sql en Supabase."
        : "No se pudo guardar el consumo FIFO de la venta.";
      if (jsonMode) {
        return jsonResponse(false, message, 500);
      }
      return setRedirect(response, request, dashboardPathForRole(auth.profile.role), "sale_failed");
    }
  }

  const automaticExpenses = [
    wholesaleDiscountValue > 0
      ? {
          created_by: auth.userId,
          ambassador_profile_id: validAmbassadorProfileId,
          category: "descuento_cliente",
          description: `Descuento venta mayorista ${sale.id}`,
          amount: wholesaleDiscountValue,
          expense_type: "discount" as const,
          source_sale_id: sale.id
        }
      : null,
    commissionValue > 0
      ? {
          created_by: auth.userId,
          ambassador_profile_id: validAmbassadorProfileId,
          category: "comision_embajador",
          description: `Comisión venta mayorista ${sale.id}`,
          amount: commissionValue,
          expense_type: "commission" as const,
          source_sale_id: sale.id
        }
      : null
  ].filter((expense): expense is NonNullable<typeof expense> => Boolean(expense));

  if (automaticExpenses.length > 0) {
    const { error: expensesError } = await auth.adminClient.from("expenses").insert(automaticExpenses);

    if (expensesError) {
      await auth.adminClient.from("sales").delete().eq("id", sale.id);
      const message = isMissingColumnError(expensesError)
        ? "Falta aplicar la migración 0004_net_sale_boost.sql en Supabase."
        : "No se pudieron guardar los gastos automáticos de la venta.";
      if (jsonMode) {
        return jsonResponse(false, message, 500);
      }
      return setRedirect(response, request, dashboardPathForRole(auth.profile.role), "sale_failed");
    }
  }

  if (jsonMode) {
    return jsonResponse(true, "Venta guardada correctamente.", 201);
  }

  return setRedirect(response, request, dashboardPathForRole(auth.profile.role));
}
