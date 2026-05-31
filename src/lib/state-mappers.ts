import type { Ambassador, BatchLineItem, Expense, ProductionBatch, Sale, SaleBatchConsumption } from "./types";

type AmbassadorLike = { id: string; code: string };

function findCode(ambassadors: AmbassadorLike[], id: unknown): string | undefined {
  if (!id || typeof id !== "string") return undefined;
  return ambassadors.find((a) => a.id === id)?.code;
}

type AnyRow = Record<string, unknown>;

export function mapApiSale(row: AnyRow, ambassadors: AmbassadorLike[] = []): Sale {
  const amount = Number(row.amount);
  return {
    id: String(row.id),
    createdAt: String(row.created_at),
    saleType: (row.sale_type as Sale["saleType"]) ?? "unit",
    quantity: Number(row.quantity),
    priceTotal: Number(row.price_total ?? amount),
    ambassadorId: row.ambassador_profile_id ? String(row.ambassador_profile_id) : undefined,
    ambassadorCode: findCode(ambassadors, row.ambassador_profile_id),
    wholesaleVariant: row.wholesale_variant ? (row.wholesale_variant as Sale["wholesaleVariant"]) : undefined,
    wholesaleDiscountPct: Number(row.wholesale_discount_pct ?? 0),
    wholesaleDiscountValue: Number(row.wholesale_discount_value ?? 0),
    wholesaleNetTotal: Number(row.wholesale_net_total ?? amount),
    wholesaleBaseCommissionPct: Number(row.wholesale_base_commission_pct ?? 0),
    wholesaleBoostBonusPct: Number(row.wholesale_boost_bonus_pct ?? 0),
    commissionRate: Number(row.commission_rate ?? 0),
    commissionValue: Number(row.commission_value ?? 0),
    costOfGoods: Number(row.cost_of_goods ?? 0),
    grossProfit: Number(row.gross_profit ?? 0),
    netProfit: row.net_profit == null ? undefined : Number(row.net_profit),
    margin: Number(row.margin ?? 0),
    pricingVersionId: row.pricing_version_id ? String(row.pricing_version_id) : undefined,
    consignmentClientId: row.consignment_client_id ? String(row.consignment_client_id) : undefined,
    note: String(row.note ?? "")
  };
}

export function mapApiExpense(row: AnyRow, ambassadors: AmbassadorLike[] = []): Expense {
  return {
    id: String(row.id),
    createdAt: String(row.created_at),
    category: String(row.category),
    description: String(row.description),
    amount: Number(row.amount),
    type: row.expense_type as Expense["type"],
    sourceSaleId: row.source_sale_id ? String(row.source_sale_id) : undefined,
    ambassadorId: row.ambassador_profile_id ? String(row.ambassador_profile_id) : undefined,
    ambassadorCode: findCode(ambassadors, row.ambassador_profile_id)
  };
}

export function mapApiBatch(row: AnyRow, items: AnyRow[] = []): ProductionBatch {
  return {
    id: String(row.id),
    createdAt: String(row.created_at),
    label: String(row.label),
    variant: row.variant as ProductionBatch["variant"],
    unitsProduced: Number(row.units_produced),
    totalCost: Number(row.total_cost),
    items: items.map<BatchLineItem>((item) => ({
      id: String(item.id),
      kind: item.kind as BatchLineItem["kind"],
      name: String(item.name),
      quantity: item.quantity != null ? Number(item.quantity) : undefined,
      unitPrice: Number(item.unit_price)
    })),
    notes: String(row.notes ?? "")
  };
}

export function mapApiSaleBatchConsumption(row: AnyRow): SaleBatchConsumption {
  return {
    saleId: String(row.sale_id),
    batchId: row.batch_id ? String(row.batch_id) : null,
    units: Number(row.units),
    cost: Number(row.cost)
  };
}

export function mapApiAmbassador(row: AnyRow): Ambassador {
  return {
    id: String(row.id),
    name: String(row.full_name ?? row.username),
    code: String(row.ambassador_id ?? row.username),
    level: (row.level as Ambassador["level"]) ?? "nivel0",
    boostActive: Boolean(row.boost_active),
    boostExpiresAt: row.boost_expires_at ? String(row.boost_expires_at) : undefined,
    active: row.is_active !== false,
    notes: String(row.phone ?? "")
  };
}
