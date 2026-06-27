import type { Ambassador, AmbassadorPayout, BatchLineItem, ConsignmentClient, ConsignmentPickup, ConsignmentReactivation, ConsignmentReplenishment, Expense, InventoryReturn, ProductionBatch, Sale, SaleBatchConsumption } from "./types";
import type { ProductVariant } from "./types";

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
    clientName: row.client_name ? String(row.client_name) : undefined,
    clientAddress: row.client_address ? String(row.client_address) : undefined,
    clientPhone: row.client_phone ? String(row.client_phone) : undefined,
    deliveryFee: row.delivery_fee != null ? Number(row.delivery_fee) : undefined,
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

export function mapApiConsignmentClient(row: AnyRow): ConsignmentClient {
  return {
    id: String(row.id),
    createdAt: String(row.created_at),
    name: String(row.name),
    address: String(row.address),
    contactName: row.contact_name ? String(row.contact_name) : undefined,
    phone: row.phone ? String(row.phone) : undefined,
    notes: row.notes ? String(row.notes) : undefined,
    baseQuantityWithAlcohol: Number(row.base_quantity_with_alcohol),
    baseQuantityWithoutAlcohol: Number(row.base_quantity_without_alcohol),
    priceWithAlcohol: row.price_with_alcohol != null ? Number(row.price_with_alcohol) : undefined,
    priceWithoutAlcohol: row.price_without_alcohol != null ? Number(row.price_without_alcohol) : undefined,
    nextReplenishmentDate: String(row.next_replenishment_date),
    initialSaleIdWithAlcohol: row.initial_sale_id_with_alcohol ? String(row.initial_sale_id_with_alcohol) : undefined,
    initialSaleIdWithoutAlcohol: row.initial_sale_id_without_alcohol ? String(row.initial_sale_id_without_alcohol) : undefined
  };
}

export function mapApiConsignmentReplenishment(row: AnyRow): ConsignmentReplenishment {
  return {
    id: String(row.id),
    createdAt: String(row.created_at),
    clientId: String(row.client_id),
    unitsDeliveredWithAlcohol: Number(row.units_delivered_with_alcohol),
    unitsDeliveredWithoutAlcohol: Number(row.units_delivered_without_alcohol),
    unitPriceWithAlcohol: Number(row.unit_price_with_alcohol),
    unitPriceWithoutAlcohol: Number(row.unit_price_without_alcohol),
    amountCharged: Number(row.amount_charged),
    newBaseWithAlcohol: Number(row.new_base_with_alcohol),
    newBaseWithoutAlcohol: Number(row.new_base_without_alcohol),
    previousBaseWithAlcohol: row.previous_base_with_alcohol != null ? Number(row.previous_base_with_alcohol) : undefined,
    previousBaseWithoutAlcohol: row.previous_base_without_alcohol != null ? Number(row.previous_base_without_alcohol) : undefined,
    notes: row.notes ? String(row.notes) : undefined,
    saleIdWithAlcohol: row.sale_id_with_alcohol ? String(row.sale_id_with_alcohol) : undefined,
    saleIdWithoutAlcohol: row.sale_id_without_alcohol ? String(row.sale_id_without_alcohol) : undefined
  };
}

export function mapApiConsignmentPickup(row: AnyRow): ConsignmentPickup {
  return {
    id: String(row.id),
    createdAt: String(row.created_at),
    clientId: String(row.client_id),
    unitsCollectedWithAlcohol: Number(row.units_collected_with_alcohol),
    unitsCollectedWithoutAlcohol: Number(row.units_collected_without_alcohol),
    unitsChargedWithAlcohol: Number(row.units_charged_with_alcohol),
    unitsChargedWithoutAlcohol: Number(row.units_charged_without_alcohol),
    unitPriceWithAlcohol: Number(row.unit_price_with_alcohol),
    unitPriceWithoutAlcohol: Number(row.unit_price_without_alcohol),
    amountCharged: Number(row.amount_charged),
    saleIdWithAlcohol: row.sale_id_with_alcohol ? String(row.sale_id_with_alcohol) : undefined,
    saleIdWithoutAlcohol: row.sale_id_without_alcohol ? String(row.sale_id_without_alcohol) : undefined,
    notes: row.notes ? String(row.notes) : undefined
  };
}

export function mapApiConsignmentReactivation(row: AnyRow): ConsignmentReactivation {
  return {
    id: String(row.id),
    createdAt: String(row.created_at),
    clientId: String(row.client_id),
    unitsWithAlcohol: Number(row.units_with_alcohol),
    unitsWithoutAlcohol: Number(row.units_without_alcohol),
    unitPriceWithAlcohol: Number(row.unit_price_with_alcohol),
    unitPriceWithoutAlcohol: Number(row.unit_price_without_alcohol),
    saleIdWithAlcohol: row.sale_id_with_alcohol ? String(row.sale_id_with_alcohol) : undefined,
    saleIdWithoutAlcohol: row.sale_id_without_alcohol ? String(row.sale_id_without_alcohol) : undefined,
    notes: row.notes ? String(row.notes) : undefined
  };
}

export function mapApiInventoryReturn(row: AnyRow): InventoryReturn {
  return {
    id: String(row.id),
    createdAt: String(row.created_at),
    batchId: String(row.batch_id),
    variant: row.variant as ProductVariant,
    units: Number(row.units),
    sourcePickupId: row.source_pickup_id ? String(row.source_pickup_id) : undefined,
    sourceClientId: row.source_client_id ? String(row.source_client_id) : undefined,
    notes: row.notes ? String(row.notes) : undefined
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
    notes: String(row.phone ?? ""),
    createdAt: row.created_at ? String(row.created_at) : undefined
  };
}

export function mapApiPayout(row: AnyRow): AmbassadorPayout {
  return {
    id: String(row.id),
    ambassadorId: String(row.ambassador_profile_id),
    cycleIndex: Number(row.cycle_index ?? 0),
    cycleStart: String(row.cycle_start),
    cycleEnd: String(row.cycle_end),
    units: Number(row.units ?? 0),
    level: (row.level as AmbassadorPayout["level"]) ?? "nivel0",
    baseSalary: Number(row.base_salary ?? 0),
    commissions: Number(row.commissions ?? 0),
    freeUnits: Number(row.free_units ?? 0)
  };
}
