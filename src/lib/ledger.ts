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
    wholesale: "Venta al por mayor",
    consignment: "Consignación"
  };

  if (saleType === "wholesale") {
    return variant === "withAlcohol" ? "Mayorista con licor" : "Mayorista sin licor";
  }

  if (saleType === "consignment") {
    return variant === "withAlcohol" ? "Consignación con licor" : "Consignación sin licor";
  }

  return labels[saleType];
}

export function saleVariantForType(saleType: SaleType, wholesaleVariant?: "withAlcohol" | "withoutAlcohol") {
  if (saleType === "singleNoAlcohol" || saleType === "giftNoAlcohol") {
    return "withoutAlcohol";
  }

  if (saleType === "wholesale" || saleType === "consignment") {
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
    case "consignment":
      return 0;
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

function saleRealTotal(sale: Pick<Sale, "priceTotal" | "wholesaleNetTotal">) {
  return sale.wholesaleNetTotal ?? sale.priceTotal;
}

// Reemplaza la simulación FIFO previa por aritmética determinística basada en
// los `sale_batch_consumptions` y `inventory_returns` reales registrados en BD.
// La simulación anterior re-aplicaba FIFO oldest-first ignorando los registros,
// lo que generaba divergencias del display vs estado real cuando había returns
// o consumos multi-lote.
function computeBatchesRemaining(state: AppState): BatchRemaining[] {
  const consumedByBatch = new Map<string, number>();
  for (const c of state.saleBatchConsumptions ?? []) {
    if (!c.batchId) continue;
    consumedByBatch.set(c.batchId, (consumedByBatch.get(c.batchId) ?? 0) + c.units);
  }

  const returnsByBatch = new Map<string, number>();
  for (const r of state.inventoryReturns ?? []) {
    returnsByBatch.set(r.batchId, (returnsByBatch.get(r.batchId) ?? 0) + r.units);
  }

  return state.batches
    .slice()
    .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt))
    .map((batch) => {
      const consumed = consumedByBatch.get(batch.id) ?? 0;
      const returned = returnsByBatch.get(batch.id) ?? 0;
      const unitsRemaining = Math.max(0, batch.unitsProduced - consumed + returned);
      return {
        id: batch.id,
        label: batch.label,
        variant: batch.variant,
        unitsRemaining,
        unitsProduced: batch.unitsProduced,
        totalCost: batch.totalCost,
        unitCost: batch.unitsProduced > 0 ? batch.totalCost / batch.unitsProduced : 0
      };
    });
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
  const batches = computeBatchesRemaining(state);
  const sortedSales = state.sales
    .slice()
    .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));

  // Clasificación de sales de consignación por su rol operacional.
  // Datos disponibles en `state` — sin necesidad de re-querys.
  const initialDeliverySaleIds = new Set<string>(
    (state.consignmentClients ?? [])
      .flatMap((c) => [c.initialSaleIdWithAlcohol, c.initialSaleIdWithoutAlcohol])
      .filter((id): id is string => Boolean(id))
  );
  const replenishmentSaleIds = new Set<string>(
    (state.consignmentReplenishments ?? [])
      .flatMap((r) => [r.saleIdWithAlcohol, r.saleIdWithoutAlcohol])
      .filter((id): id is string => Boolean(id))
  );
  // IDs de sales generadas al cobrar faltantes en recogidas (consumeStock=false).
  // El stock ya fue consumido en la entrega original — son ventas reales.
  const pickupChargeSaleIds = new Set<string>(
    (state.consignmentPickups ?? [])
      .flatMap((p) => [p.saleIdWithAlcohol, p.saleIdWithoutAlcohol])
      .filter((id): id is string => Boolean(id))
  );

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
    const isPickupCharge = pickupChargeSaleIds.has(sale.id);
    const isReplenishment = replenishmentSaleIds.has(sale.id);
    const isInitialDelivery =
      sale.saleType === "consignment" && initialDeliverySaleIds.has(sale.id);
    // Para los totales: sólo la entrega inicial es "stock en tránsito".
    // Reposiciones y cobros de faltantes son ventas reales (el cliente vendió).
    const isConsignmentDelivery = isInitialDelivery;
    const realTotal = wholesaleNetTotal;
    const costOfGoods = sale.costOfGoods ?? 0;
    const grossProfit = sale.grossProfit ?? realTotal - costOfGoods;
    const netProfit = sale.netProfit ?? grossProfit - commissionValue;
    const margin = sale.margin ?? (realTotal > 0 ? netProfit / realTotal : 0);

    let displayLabel: string;
    if (sale.saleType === "wholesale") {
      displayLabel = `${saleTypeLabel(sale.saleType, resolvedVariant)} · ${
        sale.ambassadorId || sale.ambassadorCode ? "Con embajador" : "Normal"
      }`;
    } else if (sale.saleType === "consignment") {
      const variantTag = resolvedVariant === "withAlcohol" ? "con licor" : "sin licor";
      if (isPickupCharge) {
        displayLabel = `Recogida consignación · cobro faltantes · ${variantTag}`;
      } else if (isReplenishment) {
        displayLabel = `Reposición consignación · ${variantTag}`;
      } else if (isInitialDelivery) {
        displayLabel = `Entrega inicial consignación · ${variantTag}`;
      } else {
        displayLabel = saleTypeLabel(sale.saleType, resolvedVariant);
      }
    } else {
      displayLabel = saleTypeLabel(sale.saleType, resolvedVariant);
    }

    return {
      ...sale,
      ambassadorName: ambassador?.name,
      ambassadorLevel: ambassador?.level,
      commissionRate,
      commissionValue,
      clientSavings,
      costOfGoods,
      grossProfit,
      netProfit,
      margin,
      resolvedVariant,
      isConsignmentDelivery,
      isReplenishment,
      isPickupCharge,
      displayLabel,
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
  const regularExpenses = state.expenses.filter((expense) => expense.type !== "commission" && expense.type !== "discount");
  const linkedCommissionSaleIds = new Set(
    commissionExpenses.map((expense) => expense.sourceSaleId).filter((sourceSaleId): sourceSaleId is string => Boolean(sourceSaleId))
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
  const commissionExpensesTotal = commissionExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const regularExpensesTotal = regularExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const expensesTotal = regularExpensesTotal + commissionExpensesTotal + legacyCommissionTotal;

  const baseSales = sales.reduce((sum, sale) => sum + sale.priceTotal, 0);
  const revenue = sales.reduce((sum, sale) => sum + saleRealTotal(sale), 0);
  // unitsSold reales (excluye entregas iniciales de consignación que aún no se "vendieron")
  const unitsSold = sales.reduce(
    (sum, sale) => (sale.isConsignmentDelivery ? sum : sum + saleUnitsConsumed(sale)),
    0
  );
  // consignmentStockCogs viene precomputado del server (outstanding × unit_cost por cliente).
  // Refleja el costo del stock que ACTUALMENTE está físicamente en clientes.
  const consignmentStockCogs = state.consignmentStockCogs ?? 0;
  const unitsProduced = state.batches.reduce((sum, batch) => sum + batch.unitsProduced, 0);
  const unitsRemaining = batches.reduce((sum, batch) => sum + batch.unitsRemaining, 0);
  const investment = state.batches.reduce((sum, batch) => sum + batch.totalCost, 0);
  // COGS de ventas reales = inversión menos lo que queda en bodega menos lo que queda en clientes.
  // Esta fórmula es robusta ante `inventory_returns` (devoluciones al stock al recoger),
  // que NO deben contar como COGS. Sumar `sale.costOfGoods` directamente sobre-contabiliza
  // porque las unidades devueltas vía returns ya regresaron al stockOnHand.
  const stockOnHand = batches.reduce((sum, batch) => sum + batch.unitsRemaining * batch.unitCost, 0);
  const costOfGoods = Math.max(0, investment - stockOnHand - consignmentStockCogs);
  const commissions = commissionExpensesTotal + legacyCommissionTotal;
  const discounts = Math.max(0, baseSales - revenue);
  const grossProfit = revenue - costOfGoods;
  const netProfit = grossProfit - commissions - regularExpensesTotal;
  const consignedWithAlcohol = state.consignmentClients
    .filter((c) => c.baseQuantityWithAlcohol > 0 || c.baseQuantityWithoutAlcohol > 0)
    .reduce((sum, c) => sum + c.baseQuantityWithAlcohol, 0);
  const consignedWithoutAlcohol = state.consignmentClients
    .filter((c) => c.baseQuantityWithAlcohol > 0 || c.baseQuantityWithoutAlcohol > 0)
    .reduce((sum, c) => sum + c.baseQuantityWithoutAlcohol, 0);

  return {
    batches,
    sales,
    totals: {
      investment,
      baseSales,
      revenue,
      costOfGoods,
      grossProfit,
      commissions,
      discounts,
      manualExpenses: regularExpensesTotal,
      expenses: expensesTotal,
      netProfit,
      unitsSold,
      unitsProduced,
      unitsRemaining,
      consignedWithAlcohol,
      consignedWithoutAlcohol,
      consignmentStockCogs
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
