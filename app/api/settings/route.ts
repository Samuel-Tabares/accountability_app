import { NextRequest, NextResponse } from "next/server";
import { settingsToPricingInsert, settingsToTierInserts } from "@/src/lib/pricing";
import { requireRouteRole } from "@/src/lib/route-auth";
import { jsonResponse } from "@/src/lib/api-utils";
import type { PricingSettings } from "@/src/lib/types";

function numberField(formData: FormData, key: string) {
  const value = Number(formData.get(key));
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const response = NextResponse.redirect(new URL("/admin", request.url), { status: 303 });
  const auth = await requireRouteRole(request, response, "admin");

  if (!auth) {
    return jsonResponse(false, "No tienes permisos para guardar configuración.", 403);
  }

  const unitWithAlcoholPrice = numberField(formData, "unit_with_alcohol_price");
  const unitNoAlcoholPrice = numberField(formData, "unit_no_alcohol_price");
  const promoPackagePrice = numberField(formData, "promo_package_price");
  const giftWithAlcoholPrice = numberField(formData, "gift_with_alcohol_price") ?? 0;
  const giftNoAlcoholPrice = numberField(formData, "gift_no_alcohol_price") ?? 0;
  const boostBonusPct = numberField(formData, "boost_bonus_pct") ?? 0;

  if (unitWithAlcoholPrice === null || unitNoAlcoholPrice === null || promoPackagePrice === null) {
    return jsonResponse(false, "Revisa los precios base.", 400);
  }

  let wholesaleWithAlcoholTiers: PricingSettings["wholesaleWithAlcoholTiers"];
  let wholesaleNoAlcoholTiers: PricingSettings["wholesaleNoAlcoholTiers"];
  try {
    wholesaleWithAlcoholTiers = JSON.parse(String(formData.get("wholesale_with_alcohol_tiers") ?? "[]"));
    wholesaleNoAlcoholTiers = JSON.parse(String(formData.get("wholesale_no_alcohol_tiers") ?? "[]"));
  } catch {
    return jsonResponse(false, "Las tablas mayoristas no son válidas.", 400);
  }

  const settings: PricingSettings = {
    unitWithAlcoholPrice,
    unitNoAlcoholPrice,
    promoPackagePrice,
    giftWithAlcoholPrice,
    giftNoAlcoholPrice,
    boostBonusPct,
    wholesaleWithAlcoholTiers,
    wholesaleNoAlcoholTiers
  };

  const validTiers = [...settings.wholesaleWithAlcoholTiers, ...settings.wholesaleNoAlcoholTiers].every(
    (tier) =>
      Number.isFinite(tier.minQuantity) &&
      tier.minQuantity > 0 &&
      Number.isFinite(tier.unitPrice) &&
      tier.unitPrice >= 0 &&
      Number.isFinite(tier.commissionPct) &&
      tier.commissionPct >= 0 &&
      Number.isFinite(tier.clientDiscountPct) &&
      tier.clientDiscountPct >= 0
  );

  if (!validTiers) {
    return jsonResponse(false, "Revisa cantidades, precios, comisiones y descuentos mayoristas.", 400);
  }

  const { error: deactivateError } = await auth.adminClient
    .from("pricing_versions")
    .update({ is_active: false })
    .eq("is_active", true);

  if (deactivateError) {
    return jsonResponse(false, "No se pudo reemplazar la configuración activa.", 500);
  }

  const { data: version, error: versionError } = await auth.adminClient
    .from("pricing_versions")
    .insert(settingsToPricingInsert(settings, auth.userId))
    .select("id")
    .single();

  if (versionError || !version) {
    return jsonResponse(false, "No se pudo guardar la configuración.", 500);
  }

  const { error: tiersError } = await auth.adminClient
    .from("pricing_wholesale_tiers")
    .insert(settingsToTierInserts(settings, version.id));

  if (tiersError) {
    return jsonResponse(false, "La configuración se creó, pero fallaron las tablas mayoristas.", 500);
  }

  return jsonResponse(true, "Configuración guardada como nueva versión.", 201);
}
