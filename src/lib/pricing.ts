import { blankState } from "./seed";
import type {
  PricingVersionRow,
  PricingWholesaleTierRow,
  ProductVariant
} from "./supabase/types";
import type { PricingSettings, WholesaleTier } from "./types";

export function pricingRowsToSettings(
  version?: PricingVersionRow | null,
  tiers: PricingWholesaleTierRow[] = []
): PricingSettings {
  if (!version) {
    return blankState.settings;
  }

  const mapTier = (tier: PricingWholesaleTierRow): WholesaleTier => ({
    minQuantity: tier.min_quantity,
    unitPrice: Number(tier.unit_price),
    commissionPct: Number(tier.commission_pct),
    clientDiscountPct: Number(tier.client_discount_pct)
  });

  const byVariant = (variant: ProductVariant) =>
    tiers
      .filter((tier) => tier.variant === variant)
      .sort((a, b) => a.min_quantity - b.min_quantity)
      .map(mapTier);

  return {
    unitWithAlcoholPrice: Number(version.unit_with_alcohol_price),
    unitNoAlcoholPrice: Number(version.unit_no_alcohol_price),
    promoPackagePrice: Number(version.promo_package_price),
    giftWithAlcoholPrice: Number(version.gift_with_alcohol_price),
    giftNoAlcoholPrice: Number(version.gift_no_alcohol_price),
    boostBonusPct: Number(version.boost_bonus_pct),
    wholesaleWithAlcoholTiers: byVariant("withAlcohol"),
    wholesaleNoAlcoholTiers: byVariant("withoutAlcohol")
  };
}

export function settingsToPricingInsert(settings: PricingSettings, userId: string) {
  return {
    created_by: userId,
    is_active: true,
    unit_with_alcohol_price: settings.unitWithAlcoholPrice,
    unit_no_alcohol_price: settings.unitNoAlcoholPrice,
    promo_package_price: settings.promoPackagePrice,
    gift_with_alcohol_price: settings.giftWithAlcoholPrice,
    gift_no_alcohol_price: settings.giftNoAlcoholPrice,
    boost_bonus_pct: settings.boostBonusPct
  };
}

export function settingsToTierInserts(settings: PricingSettings, pricingVersionId: string) {
  return [
    ...settings.wholesaleWithAlcoholTiers.map((tier) => ({
      pricing_version_id: pricingVersionId,
      variant: "withAlcohol" as const,
      min_quantity: tier.minQuantity,
      unit_price: tier.unitPrice,
      commission_pct: tier.commissionPct,
      client_discount_pct: tier.clientDiscountPct
    })),
    ...settings.wholesaleNoAlcoholTiers.map((tier) => ({
      pricing_version_id: pricingVersionId,
      variant: "withoutAlcohol" as const,
      min_quantity: tier.minQuantity,
      unit_price: tier.unitPrice,
      commission_pct: tier.commissionPct,
      client_discount_pct: tier.clientDiscountPct
    }))
  ];
}
