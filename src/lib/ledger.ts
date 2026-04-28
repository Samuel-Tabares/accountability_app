import type {
  Ambassador,
  AppState,
  BatchRemaining,
  CalculatedState,
  Expense,
  Level,
  PricingSettings,
  ProductVariant,
  Sale,
  SaleType,
  SaleLedger,
  WholesaleTier
} from "./types";

export type WholesaleSelection = {
  tier?: WholesaleTier;
  commissionRate: number;
  discountPct: number;
};

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0
  }).format(value);
}

export function formatDate(value: string | Date) {
  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(typeof value === "string" ? new Date(value) : value);
}

export function resolveWholesaleTier(
  tiers: WholesaleTier[],
  quantity: number
): WholesaleTier | undefined {
  return tiers
    .slice()
    .sort((a, b) => a.minQuantity - b.minQuantity)
    .filter((tier) => quantity >= tier.minQuantity)
    .at(-1);
}

export function resolveWholesaleSelection(
  settings: PricingSettings,
  variant: ProductVariant,
  quantity: number
): WholesaleSelection {
  const tier = resolveWholesaleTier(
    variant === "withoutAlcohol" ? settings.wholesaleNoAlcoholTiers : settings.wholesaleWithAlcoholTiers,
    quantity
  );

  return {
    tier,
    commissionRate: tier?.commissionPct ?? 0,
    discountPct: tier?.clientDiscountPct ?? 0
  };
}

export function resolveWholesaleDiscountAmount(grossTotal: number, discountPct: number) {
  if (discountPct <= 0) {
    return 0;
  }

  return grossTotal * discountPct;
}

export function resolveWholesaleNetTotal(grossTotal: number, discountPct: number) {
  return grossTotal - resolveWholesaleDiscountAmount(grossTotal, discountPct);
}

export function saleTypeLabel(
  saleType: SaleType,
  variant: "withAlcohol" | "withoutAlcohol" = "withAlcohol"
) {
  const labels: Record<SaleType, string> = {
    unit: "Unidad con licor",
    promo: "Promoción",
    gift: "Regalo con licor",
    singleNoAlcohol: "Unidad sin licor",
    giftNoAlcohol: "Regalo sin licor",
    wholesale: "Venta al por mayor"
  };

  if (saleType === "wholesale") {
    return variant === "withAlcohol" ? "Mayorista con licor" : "Mayorista sin licor";
  }

  return labels[saleType];
}

export function saleVariantForType(saleType: SaleType, wholesaleVariant?: "withAlcohol" | "withoutAlcohol") {
  if (saleType === "singleNoAlcohol" || saleType === "giftNoAlcohol") {
    return "withoutAlcohol";
  }

  if (saleType === "wholesale") {
    return wholesaleVariant ?? "withAlcohol";
  }

  return "withAlcohol";
}

export function resolveSaleUnitPrice(
  settings: PricingSettings,
  sale: Pick<Sale, "saleType" | "quantity" | "wholesaleVariant">
) {
  switch (sale.saleType) {
    case "unit":
      return settings.unitWithAlcoholPrice;
    case "promo":
      return settings.promoPackagePrice;
    case "gift":
      return settings.giftWithAlcoholPrice;
    case "singleNoAlcohol":
      return settings.unitNoAlcoholPrice;
    case "giftNoAlcohol":
      return settings.giftNoAlcoholPrice;
    case "wholesale":
      return resolveWholesaleSelection(
        settings,
        sale.wholesaleVariant ?? "withAlcohol",
        sale.quantity
      ).tier?.unitPrice ?? 0;
  }
}

export function resolveSaleVariant(
  sale: Pick<Sale, "saleType" | "wholesaleVariant">
): "withAlcohol" | "withoutAlcohol" {
  return saleVariantForType(sale.saleType, sale.wholesaleVariant);
}

export function resolveAmbassador(
  ambassadors: Ambassador[],
  sale: { ambassadorId?: string; ambassadorCode?: string }
) {
  if (sale.ambassadorId) {
    return ambassadors.find((ambassador) => ambassador.id === sale.ambassadorId);
  }

  if (sale.ambassadorCode) {
    return ambassadors.find(
      (ambassador) => ambassador.code.toLowerCase() === sale.ambassadorCode?.toLowerCase()
    );
  }

  return undefined;
}

export function isBoostActive(ambassador: Ambassador, referenceDate = new Date()) {
  if (!ambassador.boostActive) {
    return false;
  }

  if (!ambassador.boostExpiresAt) {
    return true;
  }

  return new Date(ambassador.boostExpiresAt).getTime() > referenceDate.getTime();
}

function saleUnitsConsumed(sale: Pick<Sale, "saleType" | "quantity">) {
  if (sale.saleType === "promo") {
    return sale.quantity * 2;
  }

  return sale.quantity;
}

function cloneBatches(state: AppState): BatchRemaining[] {
  return state.batches
    .slice()
    .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt))
    .map((batch) => ({
      id: batch.id,
      label: batch.label,
      variant: batch.variant,
      unitsRemaining: batch.unitsProduced,
      unitsProduced: batch.unitsProduced,
      totalCost: batch.totalCost,
      unitCost: batch.unitsProduced > 0 ? batch.totalCost / batch.unitsProduced : 0
    }));
}

function fifoConsume(
  batches: BatchRemaining[],
  units: number,
  variant: ProductVariant
) {
  let remaining = units;
  let cost = 0;

  for (const batch of batches) {
    if (remaining <= 0) break;
    if (batch.variant !== variant || batch.unitsRemaining <= 0) continue;

    const take = Math.min(batch.unitsRemaining, remaining);
    batch.unitsRemaining -= take;
    remaining -= take;
    cost += take * batch.unitCost;
  }

  return { cost, fulfilled: remaining === 0, remaining };
}

function resolveStoredWholesaleSnapshot(
  settings: PricingSettings,
  ambassador: Ambassador | undefined,
  sale: Pick<
    Sale,
    | "saleType"
    | "quantity"
    | "wholesaleVariant"
    | "wholesaleDiscountPct"
    | "wholesaleDiscountValue"
    | "wholesaleNetTotal"
    | "wholesaleBaseCommissionPct"
    | "wholesaleBoostBonusPct"
    | "commissionRate"
    | "commissionValue"
    | "priceTotal"
    | "ambassadorId"
    | "ambassadorCode"
  >,
  referenceDate = new Date()
) {
  const resolvedVariant = resolveSaleVariant(sale);
  const hasWholesaleAmbassador = sale.saleType === "wholesale" && Boolean(sale.ambassadorId || sale.ambassadorCode);
  const selection =
      hasWholesaleAmbassador
      ? resolveWholesaleSelection(settings, resolvedVariant, sale.quantity)
      : undefined;
  const wholesaleDiscountPct = sale.wholesaleDiscountPct ?? selection?.discountPct ?? 0;
  const wholesaleDiscountValue = hasWholesaleAmbassador
    ? sale.wholesaleDiscountValue ?? resolveWholesaleDiscountAmount(sale.priceTotal, wholesaleDiscountPct)
    : 0;
  const wholesaleNetTotal = hasWholesaleAmbassador
    ? sale.wholesaleNetTotal ?? resolveWholesaleNetTotal(sale.priceTotal, wholesaleDiscountPct)
    : sale.priceTotal;
  const wholesaleBaseCommissionPct = sale.wholesaleBaseCommissionPct ?? selection?.commissionRate ?? 0;
  const wholesaleBoostBonusPct =
    sale.wholesaleBoostBonusPct ??
    (hasWholesaleAmbassador && ambassador && isBoostActive(ambassador, referenceDate)
      ? settings.boostBonusPct
      : 0);
  const commissionRate = sale.commissionRate ?? wholesaleBaseCommissionPct + wholesaleBoostBonusPct;
  const commissionValue =
    hasWholesaleAmbassador && ambassador
      ? wholesaleNetTotal * commissionRate
      : hasWholesaleAmbassador
        ? sale.commissionValue ?? 0
        : 0;
  const clientSavings = hasWholesaleAmbassador ? wholesaleDiscountValue : 0;

  return {
    resolvedVariant,
    wholesaleDiscountPct,
    wholesaleDiscountValue,
    wholesaleNetTotal,
    wholesaleBaseCommissionPct,
    wholesaleBoostBonusPct,
    commissionRate,
    commissionValue,
    clientSavings
  };
}

export function calculateLedger(state: AppState): CalculatedState {
  const batches = cloneBatches(state);
  const sortedSales = state.sales
    .slice()
    .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));

  const sales: SaleLedger[] = sortedSales.map((sale) => {
    const ambassador = resolveAmbassador(state.ambassadors, sale);
    const {
      resolvedVariant,
      wholesaleDiscountPct,
      wholesaleDiscountValue,
      wholesaleNetTotal,
      wholesaleBaseCommissionPct,
      wholesaleBoostBonusPct,
      commissionRate,
      commissionValue,
      clientSavings
    } = resolveStoredWholesaleSnapshot(state.settings, ambassador, sale, new Date(sale.createdAt));
    const consumption = fifoConsume(batches, saleUnitsConsumed(sale), resolvedVariant);
    const costOfGoods = consumption.cost;
    const grossProfit = sale.priceTotal - costOfGoods;
    const margin = sale.priceTotal > 0 ? grossProfit / sale.priceTotal : 0;

    return {
      ...sale,
      ambassadorName: ambassador?.name,
      ambassadorLevel: ambassador?.level,
      commissionRate,
      commissionValue,
      clientSavings,
      costOfGoods,
      grossProfit,
      margin,
      resolvedVariant,
      displayLabel:
        sale.saleType === "wholesale"
          ? `${saleTypeLabel(sale.saleType, resolvedVariant)} · ${
              sale.ambassadorId || sale.ambassadorCode ? "Con embajador" : "Normal"
            }`
          : saleTypeLabel(sale.saleType, resolvedVariant),
      wholesaleDiscountPct,
      wholesaleDiscountValue,
      wholesaleNetTotal,
      wholesaleBaseCommissionPct,
      wholesaleBoostBonusPct
    };
  });

  const commissionExpenses = state.expenses.filter(
    (expense) => expense.type === "commission" && Boolean(expense.sourceSaleId)
  );
  const discountExpenses = state.expenses.filter(
    (expense) => expense.type === "discount" && Boolean(expense.sourceSaleId)
  );
  const regularExpenses = state.expenses.filter((expense) => expense.type !== "commission" && expense.type !== "discount");
  const linkedCommissionSaleIds = new Set(
    commissionExpenses.map((expense) => expense.sourceSaleId).filter((sourceSaleId): sourceSaleId is string => Boolean(sourceSaleId))
  );
  const linkedDiscountSaleIds = new Set(
    discountExpenses.map((expense) => expense.sourceSaleId).filter((sourceSaleId): sourceSaleId is string => Boolean(sourceSaleId))
  );
  const legacyCommissionTotal = sales.reduce((sum, sale) => {
    if (sale.saleType !== "wholesale" || !(sale.ambassadorId || sale.ambassadorCode)) {
      return sum;
    }

    if (linkedCommissionSaleIds.has(sale.id)) {
      return sum;
    }

    return sum + sale.commissionValue;
  }, 0);
  const legacyDiscountTotal = sales.reduce((sum, sale) => {
    if (sale.saleType !== "wholesale" || !(sale.ambassadorId || sale.ambassadorCode)) {
      return sum;
    }

    if (linkedDiscountSaleIds.has(sale.id)) {
      return sum;
    }

    return sum + sale.clientSavings;
  }, 0);
  const commissionExpensesTotal = commissionExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const discountExpensesTotal = discountExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const regularExpensesTotal = regularExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const expensesTotal = regularExpensesTotal + commissionExpensesTotal + discountExpensesTotal + legacyCommissionTotal + legacyDiscountTotal;
  const revenue = sales.reduce((sum, sale) => sum + sale.priceTotal, 0);
  const costOfGoods = sales.reduce((sum, sale) => sum + sale.costOfGoods, 0);
  const commissions = commissionExpensesTotal + legacyCommissionTotal;
  const discounts = discountExpensesTotal + legacyDiscountTotal;
  const grossProfit = revenue - costOfGoods;
  const netProfit = grossProfit - expensesTotal;
  const unitsSold = sales.reduce((sum, sale) => sum + saleUnitsConsumed(sale), 0);
  const unitsProduced = state.batches.reduce((sum, batch) => sum + batch.unitsProduced, 0);
  const unitsRemaining = batches.reduce((sum, batch) => sum + batch.unitsRemaining, 0);
  const investment = state.batches.reduce((sum, batch) => sum + batch.totalCost, 0);

  return {
    batches,
    sales,
    totals: {
      investment,
      revenue,
      costOfGoods,
      grossProfit,
      commissions,
      discounts,
      expenses: expensesTotal,
      netProfit,
      unitsSold,
      unitsProduced,
      unitsRemaining
    }
  };
}

export function summarizeExpenses(expenses: Expense[]) {
  const monthly = expenses.filter((expense) => expense.type === "monthly");
  const oneTime = expenses.filter((expense) => expense.type === "oneTime");
  const commission = expenses.filter((expense) => expense.type === "commission" && Boolean(expense.sourceSaleId));
  const discount = expenses.filter((expense) => expense.type === "discount" && Boolean(expense.sourceSaleId));

  return {
    monthlyTotal: monthly.reduce((sum, item) => sum + item.amount, 0),
    oneTimeTotal: oneTime.reduce((sum, item) => sum + item.amount, 0),
    commissionTotal: commission.reduce((sum, item) => sum + item.amount, 0),
    discountTotal: discount.reduce((sum, item) => sum + item.amount, 0)
  };
}
