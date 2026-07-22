import type { AppState, CalculatedState, ProductVariant, SaleLedger } from "./types";
import { PROMO_UNITS_MULTIPLIER } from "./constants";

function saleUnits(sale: Pick<SaleLedger, "saleType" | "quantity">) {
  return sale.saleType === "promo" ? sale.quantity * PROMO_UNITS_MULTIPLIER : sale.quantity;
}

function saleRevenue(sale: Pick<SaleLedger, "priceTotal" | "wholesaleNetTotal">) {
  return sale.wholesaleNetTotal ?? sale.priceTotal;
}

// Bogotá es UTC-5 fijo (sin horario de verano), así que agrupar por mes según
// esa zona horaria evita que ventas de fin de mes (tarde en Bogotá, ya el día
// siguiente en UTC) caigan en el mes equivocado.
function monthKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit"
  }).formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value ?? "0000";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  return `${year}-${month}`;
}

function monthLabel(date: Date): string {
  const label = new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    month: "long",
    year: "numeric"
  }).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export type AmbassadorBreakdown = {
  ambassadorId: string;
  ambassadorName?: string;
  units: number;
  revenue: number;
  commissions: number;
};

export type ConsignmentBreakdown = {
  clientId: string;
  clientName?: string;
  /** Unidades entregadas (aún no vendidas por el cliente — stock en tránsito). */
  unitsDelivered: number;
  /** Unidades ya vendidas por el cliente (reposiciones + cobro de faltantes). */
  unitsSold: number;
  revenue: number;
};

export type MonthlyReport = {
  key: string;
  label: string;
  investment: number;
  unitsProduced: number;
  baseSales: number;
  revenue: number;
  discounts: number;
  costOfGoods: number;
  grossProfit: number;
  commissions: number;
  manualExpenses: number;
  netProfit: number;
  unitsSold: number;
  ambassadors: AmbassadorBreakdown[];
  consignmentClients: ConsignmentBreakdown[];
};

export type BatchReport = {
  batchId: string;
  label: string;
  variant: ProductVariant;
  createdAt: string;
  unitsProduced: number;
  unitsRemaining: number;
  unitsInConsignmentStock: number;
  unitsSoldOrConsumed: number;
  pctSold: number;
  investment: number;
  baseSales: number;
  revenue: number;
  discounts: number;
  costOfGoods: number;
  grossProfit: number;
  commissions: number;
  manualExpenses: number;
  netProfit: number;
  ambassadors: AmbassadorBreakdown[];
  consignmentClients: ConsignmentBreakdown[];
};

export type BatchReportsResult = {
  batches: BatchReport[];
  /** Gastos manuales sin lote asignado (datos previos a esta función) — sólo visibles en el reporte mensual. */
  unassignedManualExpenses: number;
};

type MonthlyMutable = MonthlyReport & {
  ambassadorMap: Map<string, AmbassadorBreakdown>;
  consignmentMap: Map<string, ConsignmentBreakdown>;
};

export function computeMonthlyReports(state: AppState, ledger: CalculatedState): MonthlyReport[] {
  const buckets = new Map<string, MonthlyMutable>();

  function bucket(date: Date): MonthlyMutable {
    const key = monthKey(date);
    let entry = buckets.get(key);
    if (!entry) {
      entry = {
        key,
        label: monthLabel(date),
        investment: 0,
        unitsProduced: 0,
        baseSales: 0,
        revenue: 0,
        discounts: 0,
        costOfGoods: 0,
        grossProfit: 0,
        commissions: 0,
        manualExpenses: 0,
        netProfit: 0,
        unitsSold: 0,
        ambassadors: [],
        consignmentClients: [],
        ambassadorMap: new Map(),
        consignmentMap: new Map()
      };
      buckets.set(key, entry);
    }
    return entry;
  }

  for (const batch of state.batches) {
    const entry = bucket(new Date(batch.createdAt));
    entry.investment += batch.totalCost;
    entry.unitsProduced += batch.unitsProduced;
  }

  for (const sale of ledger.sales) {
    const entry = bucket(new Date(sale.createdAt));
    const revenue = saleRevenue(sale);
    entry.baseSales += sale.priceTotal;
    entry.revenue += revenue;
    if (!sale.isConsignmentDelivery) {
      entry.costOfGoods += sale.costOfGoods;
      entry.unitsSold += saleUnits(sale);
    }

    const hasAmbassador = sale.saleType === "wholesale" && Boolean(sale.ambassadorId || sale.ambassadorCode);
    if (hasAmbassador) {
      // La comisión de la expense automática siempre es igual a sale.commissionValue
      // (misma variable en el momento de crear la venta) — sumar el snapshot de la
      // venta evita depender de que exista/persista la expense vinculada.
      entry.commissions += sale.commissionValue;
      const key = sale.ambassadorId ?? sale.ambassadorCode!;
      const ambassador = entry.ambassadorMap.get(key) ?? {
        ambassadorId: key,
        ambassadorName: sale.ambassadorName,
        units: 0,
        revenue: 0,
        commissions: 0
      };
      ambassador.units += sale.quantity;
      ambassador.revenue += revenue;
      ambassador.commissions += sale.commissionValue;
      entry.ambassadorMap.set(key, ambassador);
    }

    if (sale.saleType === "consignment" && sale.consignmentClientId) {
      const client = state.consignmentClients.find((c) => c.id === sale.consignmentClientId);
      const consignment = entry.consignmentMap.get(sale.consignmentClientId) ?? {
        clientId: sale.consignmentClientId,
        clientName: client?.name,
        unitsDelivered: 0,
        unitsSold: 0,
        revenue: 0
      };
      if (sale.isConsignmentDelivery) {
        consignment.unitsDelivered += sale.quantity;
      } else {
        consignment.unitsSold += sale.quantity;
        consignment.revenue += revenue;
      }
      entry.consignmentMap.set(sale.consignmentClientId, consignment);
    }
  }

  for (const expense of state.expenses) {
    if (expense.type === "commission" || expense.type === "discount") continue;
    const entry = bucket(new Date(expense.createdAt));
    entry.manualExpenses += expense.amount;
  }

  return Array.from(buckets.values())
    .map((entry) => {
      entry.discounts = Math.max(0, entry.baseSales - entry.revenue);
      entry.grossProfit = entry.revenue - entry.costOfGoods;
      entry.netProfit = entry.grossProfit - entry.commissions - entry.manualExpenses;
      entry.ambassadors = Array.from(entry.ambassadorMap.values()).sort((a, b) => b.units - a.units);
      entry.consignmentClients = Array.from(entry.consignmentMap.values()).sort((a, b) => b.revenue - a.revenue);
      return entry;
    })
    .sort((a, b) => (a.key < b.key ? 1 : -1));
}

type BatchMutable = BatchReport & {
  ambassadorMap: Map<string, AmbassadorBreakdown>;
  consignmentMap: Map<string, ConsignmentBreakdown>;
};

export function computeBatchReports(state: AppState, ledger: CalculatedState): BatchReportsResult {
  // Agrupa TODAS las filas de sale_batch_consumptions por venta — incluye las
  // marcadas consumes_stock=false (atribución de cobro de faltantes), porque
  // para repartir ingresos/comisiones entre lotes sólo importa de dónde salió
  // el producto, no si ese consumo ya se había descontado del stock antes.
  const consumptionsBySale = new Map<string, Array<{ batchId: string; units: number }>>();
  for (const c of state.saleBatchConsumptions) {
    if (!c.batchId) continue;
    const rows = consumptionsBySale.get(c.saleId) ?? [];
    rows.push({ batchId: c.batchId, units: c.units });
    consumptionsBySale.set(c.saleId, rows);
  }

  const createdAtByBatch = new Map(state.batches.map((b) => [b.id, b.createdAt]));
  const perBatch = new Map<string, BatchMutable>();
  for (const batch of ledger.batches) {
    perBatch.set(batch.id, {
      batchId: batch.id,
      label: batch.label,
      variant: batch.variant,
      createdAt: createdAtByBatch.get(batch.id) ?? "",
      unitsProduced: batch.unitsProduced,
      unitsRemaining: batch.unitsRemaining,
      unitsInConsignmentStock: state.consignmentStockByBatch[batch.id]?.units ?? 0,
      unitsSoldOrConsumed: 0,
      pctSold: 0,
      investment: batch.totalCost,
      baseSales: 0,
      revenue: 0,
      discounts: 0,
      costOfGoods: 0,
      grossProfit: 0,
      commissions: 0,
      manualExpenses: 0,
      netProfit: 0,
      ambassadors: [],
      consignmentClients: [],
      ambassadorMap: new Map(),
      consignmentMap: new Map()
    });
  }

  for (const sale of ledger.sales) {
    const rows = consumptionsBySale.get(sale.id);
    if (!rows || rows.length === 0) continue;
    const totalUnits = rows.reduce((sum, row) => sum + row.units, 0);
    if (totalUnits <= 0) continue;

    const revenue = saleRevenue(sale);
    const hasAmbassador = sale.saleType === "wholesale" && Boolean(sale.ambassadorId || sale.ambassadorCode);
    const ambassadorKey = hasAmbassador ? sale.ambassadorId ?? sale.ambassadorCode! : null;
    const isConsignmentFlow = sale.saleType === "consignment" && Boolean(sale.consignmentClientId);
    const client = isConsignmentFlow
      ? state.consignmentClients.find((c) => c.id === sale.consignmentClientId)
      : undefined;

    // Una venta puede consumir de varios lotes (multi-lotaje): se reparte cada
    // KPI proporcional a las unidades que salieron de cada lote.
    for (const row of rows) {
      const entry = perBatch.get(row.batchId);
      if (!entry) continue;
      const fraction = row.units / totalUnits;

      entry.baseSales += sale.priceTotal * fraction;
      entry.revenue += revenue * fraction;

      if (hasAmbassador) {
        entry.commissions += sale.commissionValue * fraction;
        const key = ambassadorKey!;
        const ambassador = entry.ambassadorMap.get(key) ?? {
          ambassadorId: key,
          ambassadorName: sale.ambassadorName,
          units: 0,
          revenue: 0,
          commissions: 0
        };
        ambassador.units += sale.quantity * fraction;
        ambassador.revenue += revenue * fraction;
        ambassador.commissions += sale.commissionValue * fraction;
        entry.ambassadorMap.set(key, ambassador);
      }

      if (isConsignmentFlow) {
        const key = sale.consignmentClientId!;
        const consignment = entry.consignmentMap.get(key) ?? {
          clientId: key,
          clientName: client?.name,
          unitsDelivered: 0,
          unitsSold: 0,
          revenue: 0
        };
        if (sale.isConsignmentDelivery) {
          consignment.unitsDelivered += sale.quantity * fraction;
        } else {
          consignment.unitsSold += sale.quantity * fraction;
          consignment.revenue += revenue * fraction;
        }
        entry.consignmentMap.set(key, consignment);
      }
    }
  }

  let unassignedManualExpenses = 0;
  for (const expense of state.expenses) {
    if (expense.type === "commission" || expense.type === "discount") continue;
    const entry = expense.batchId ? perBatch.get(expense.batchId) : undefined;
    if (entry) {
      entry.manualExpenses += expense.amount;
    } else {
      unassignedManualExpenses += expense.amount;
    }
  }

  for (const batch of ledger.batches) {
    const entry = perBatch.get(batch.id)!;
    const stockOnHand = batch.unitsRemaining * batch.unitCost;
    const consignmentCogs = state.consignmentStockByBatch[batch.id]?.cogs ?? 0;
    // Misma identidad que el COGS global (inversión − bodega − consignación),
    // aplicada al lote: robusta ante devoluciones y garantiza que la suma de
    // todos los lotes cuadre exactamente con el COGS global del dashboard.
    entry.costOfGoods = Math.max(0, entry.investment - stockOnHand - consignmentCogs);
    entry.discounts = Math.max(0, entry.baseSales - entry.revenue);
    entry.grossProfit = entry.revenue - entry.costOfGoods;
    entry.netProfit = entry.grossProfit - entry.commissions - entry.manualExpenses;
    entry.unitsSoldOrConsumed = Math.max(0, entry.unitsProduced - entry.unitsRemaining - entry.unitsInConsignmentStock);
    entry.pctSold = entry.unitsProduced > 0 ? entry.unitsSoldOrConsumed / entry.unitsProduced : 0;
    entry.ambassadors = Array.from(entry.ambassadorMap.values()).sort((a, b) => b.units - a.units);
    entry.consignmentClients = Array.from(entry.consignmentMap.values()).sort((a, b) => b.revenue - a.revenue);
  }

  const batches = Array.from(perBatch.values()).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return { batches, unassignedManualExpenses };
}
