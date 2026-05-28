import type {
  Ambassador,
  AppState,
  ConsignmentClient,
  ConsignmentPickup,
  ConsignmentReactivation,
  ConsignmentReplenishment,
  Sale
} from "@/src/lib/types";
import {
  initialConsignmentNumber,
  pickupNumber,
  reactivationNumber,
  replenishmentNumber,
  wholesaleNumber
} from "./numbering";
import type {
  ConsignmentInitialInvoice,
  ConsignmentPickupInvoice,
  ConsignmentReactivationInvoice,
  ConsignmentReplenishmentInvoice,
  InvoiceData,
  InvoiceKind,
  WholesaleInvoice
} from "./types";

function clientToInvoiceClient(client: ConsignmentClient) {
  return {
    name: client.name,
    address: client.address,
    contactName: client.contactName,
    phone: client.phone
  };
}

function defaultPrices(state: AppState) {
  const withTier = state.settings.wholesaleWithAlcoholTiers[0];
  const withoutTier = state.settings.wholesaleNoAlcoholTiers[0];
  return {
    withAlcohol: withTier?.unitPrice ?? 4900,
    withoutAlcohol: withoutTier?.unitPrice ?? 4800
  };
}

export function buildWholesaleInvoice(
  sale: Sale,
  state: AppState,
  ambassadors: Ambassador[]
): WholesaleInvoice {
  const variant = sale.wholesaleVariant ?? "withAlcohol";
  const grossTotal = sale.priceTotal;
  const unitPrice = sale.quantity > 0 ? grossTotal / sale.quantity : 0;
  const ambassador = sale.ambassadorId
    ? ambassadors.find((a) => a.id === sale.ambassadorId)
    : undefined;

  return {
    kind: "wholesale",
    number: wholesaleNumber(state.sales, sale.id),
    createdAt: sale.createdAt,
    variant,
    quantity: sale.quantity,
    unitPrice,
    grossTotal,
    discountPct: sale.wholesaleDiscountPct ?? 0,
    discountValue: sale.wholesaleDiscountValue ?? 0,
    netTotal: sale.wholesaleNetTotal ?? grossTotal,
    ambassador: ambassador
      ? { name: ambassador.name, code: ambassador.code }
      : undefined,
    notes: sale.note?.trim() || undefined
  };
}

export function buildInitialConsignmentInvoice(
  client: ConsignmentClient,
  state: AppState
): ConsignmentInitialInvoice {
  const defaults = defaultPrices(state);
  return {
    kind: "consignment_initial",
    number: initialConsignmentNumber(state.consignmentClients, client.id),
    createdAt: client.createdAt,
    client: clientToInvoiceClient(client),
    unitsWithAlcohol: client.baseQuantityWithAlcohol,
    unitsWithoutAlcohol: client.baseQuantityWithoutAlcohol,
    priceWithAlcohol: client.priceWithAlcohol ?? defaults.withAlcohol,
    priceWithoutAlcohol: client.priceWithoutAlcohol ?? defaults.withoutAlcohol,
    notes: client.notes?.trim() || undefined
  };
}

export function buildReplenishmentInvoice(
  replenishment: ConsignmentReplenishment,
  client: ConsignmentClient,
  state: AppState
): ConsignmentReplenishmentInvoice {
  return {
    kind: "consignment_replenishment",
    number: replenishmentNumber(state.consignmentReplenishments, replenishment.id),
    createdAt: replenishment.createdAt,
    client: clientToInvoiceClient(client),
    unitsDeliveredWithAlcohol: replenishment.unitsDeliveredWithAlcohol,
    unitsDeliveredWithoutAlcohol: replenishment.unitsDeliveredWithoutAlcohol,
    unitPriceWithAlcohol: replenishment.unitPriceWithAlcohol,
    unitPriceWithoutAlcohol: replenishment.unitPriceWithoutAlcohol,
    amountCharged: replenishment.amountCharged,
    newBaseWithAlcohol: replenishment.newBaseWithAlcohol,
    newBaseWithoutAlcohol: replenishment.newBaseWithoutAlcohol,
    previousBaseWithAlcohol: replenishment.previousBaseWithAlcohol,
    previousBaseWithoutAlcohol: replenishment.previousBaseWithoutAlcohol,
    notes: replenishment.notes?.trim() || undefined
  };
}

export function buildPickupInvoice(
  pickup: ConsignmentPickup,
  client: ConsignmentClient,
  state: AppState
): ConsignmentPickupInvoice {
  return {
    kind: "consignment_pickup",
    number: pickupNumber(state.consignmentPickups, pickup.id),
    createdAt: pickup.createdAt,
    client: clientToInvoiceClient(client),
    unitsCollectedWithAlcohol: pickup.unitsCollectedWithAlcohol,
    unitsCollectedWithoutAlcohol: pickup.unitsCollectedWithoutAlcohol,
    unitsChargedWithAlcohol: pickup.unitsChargedWithAlcohol,
    unitsChargedWithoutAlcohol: pickup.unitsChargedWithoutAlcohol,
    unitPriceWithAlcohol: pickup.unitPriceWithAlcohol,
    unitPriceWithoutAlcohol: pickup.unitPriceWithoutAlcohol,
    amountCharged: pickup.amountCharged,
    notes: pickup.notes?.trim() || undefined
  };
}

export function buildReactivationInvoice(
  reactivation: ConsignmentReactivation,
  client: ConsignmentClient,
  state: AppState
): ConsignmentReactivationInvoice {
  return {
    kind: "consignment_reactivation",
    number: reactivationNumber(state.consignmentReactivations, reactivation.id),
    createdAt: reactivation.createdAt,
    client: clientToInvoiceClient(client),
    unitsWithAlcohol: reactivation.unitsWithAlcohol,
    unitsWithoutAlcohol: reactivation.unitsWithoutAlcohol,
    unitPriceWithAlcohol: reactivation.unitPriceWithAlcohol,
    unitPriceWithoutAlcohol: reactivation.unitPriceWithoutAlcohol,
    notes: reactivation.notes?.trim() || undefined
  };
}

// =====================================================
// Historial — lista resumida para tablas
// =====================================================

export type InvoiceHistoryEntry = {
  key: string;
  kind: InvoiceKind;
  number: string;
  createdAt: string;
  subject: string;
  subjectMeta?: string;
  total: number;
  invoice: InvoiceData;
};

export function listWholesaleInvoices(
  state: AppState,
  ambassadors: Ambassador[]
): InvoiceHistoryEntry[] {
  const wholesales = state.sales.filter((s) => s.saleType === "wholesale");
  return wholesales
    .map((sale) => {
      const invoice = buildWholesaleInvoice(sale, state, ambassadors);
      return {
        key: `wholesale-${sale.id}`,
        kind: "wholesale" as const,
        number: invoice.number,
        createdAt: sale.createdAt,
        subject: invoice.ambassador
          ? `${invoice.ambassador.name} (${invoice.ambassador.code})`
          : "Sin embajador",
        subjectMeta: `${sale.quantity} uds · ${sale.wholesaleVariant === "withAlcohol" ? "con licor" : "sin licor"}`,
        total: invoice.netTotal,
        invoice
      };
    })
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
}

export function listConsignmentInvoices(state: AppState): InvoiceHistoryEntry[] {
  const clientById = new Map(state.consignmentClients.map((c) => [c.id, c]));
  const entries: InvoiceHistoryEntry[] = [];

  for (const client of state.consignmentClients) {
    const inv = buildInitialConsignmentInvoice(client, state);
    const total =
      inv.unitsWithAlcohol * inv.priceWithAlcohol +
      inv.unitsWithoutAlcohol * inv.priceWithoutAlcohol;
    entries.push({
      key: `initial-${client.id}`,
      kind: "consignment_initial",
      number: inv.number,
      createdAt: client.createdAt,
      subject: client.name,
      subjectMeta: `${inv.unitsWithAlcohol}A / ${inv.unitsWithoutAlcohol}SA entregadas`,
      total,
      invoice: inv
    });
  }

  for (const r of state.consignmentReplenishments) {
    const client = clientById.get(r.clientId);
    if (!client) continue;
    const inv = buildReplenishmentInvoice(r, client, state);
    entries.push({
      key: `rep-${r.id}`,
      kind: "consignment_replenishment",
      number: inv.number,
      createdAt: r.createdAt,
      subject: client.name,
      subjectMeta: `${r.unitsDeliveredWithAlcohol}A / ${r.unitsDeliveredWithoutAlcohol}SA repuestas`,
      total: r.amountCharged,
      invoice: inv
    });
  }

  for (const p of state.consignmentPickups) {
    const client = clientById.get(p.clientId);
    if (!client) continue;
    const inv = buildPickupInvoice(p, client, state);
    entries.push({
      key: `pick-${p.id}`,
      kind: "consignment_pickup",
      number: inv.number,
      createdAt: p.createdAt,
      subject: client.name,
      subjectMeta: `Recogidas ${p.unitsCollectedWithAlcohol}A/${p.unitsCollectedWithoutAlcohol}SA · faltantes ${p.unitsChargedWithAlcohol}A/${p.unitsChargedWithoutAlcohol}SA`,
      total: p.amountCharged,
      invoice: inv
    });
  }

  for (const ra of state.consignmentReactivations) {
    const client = clientById.get(ra.clientId);
    if (!client) continue;
    const inv = buildReactivationInvoice(ra, client, state);
    const total =
      ra.unitsWithAlcohol * ra.unitPriceWithAlcohol +
      ra.unitsWithoutAlcohol * ra.unitPriceWithoutAlcohol;
    entries.push({
      key: `react-${ra.id}`,
      kind: "consignment_reactivation",
      number: inv.number,
      createdAt: ra.createdAt,
      subject: client.name,
      subjectMeta: `${ra.unitsWithAlcohol}A / ${ra.unitsWithoutAlcohol}SA reactivadas`,
      total,
      invoice: inv
    });
  }

  return entries.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
}
