import type { CompanyInfo, ProductVariant } from "@/src/lib/types";

export type InvoiceKind =
  | "wholesale"
  | "consignment_initial"
  | "consignment_replenishment"
  | "consignment_pickup"
  | "consignment_reactivation";

export type InvoiceClient = {
  name: string;
  address: string;
  contactName?: string;
  phone?: string;
};

export type WholesaleInvoice = {
  kind: "wholesale";
  number: string;
  createdAt: string;
  variant: ProductVariant;
  quantity: number;
  unitPrice: number;
  grossTotal: number;
  discountPct: number;
  discountValue: number;
  netTotal: number;
  ambassador?: { name: string; code: string };
  client?: { name: string; address?: string; phone?: string };
  deliveryFee?: number;
  notes?: string;
};

export type ConsignmentInitialInvoice = {
  kind: "consignment_initial";
  number: string;
  createdAt: string;
  client: InvoiceClient;
  unitsWithAlcohol: number;
  unitsWithoutAlcohol: number;
  priceWithAlcohol: number;
  priceWithoutAlcohol: number;
  notes?: string;
};

export type ConsignmentReplenishmentInvoice = {
  kind: "consignment_replenishment";
  number: string;
  createdAt: string;
  client: InvoiceClient;
  unitsDeliveredWithAlcohol: number;
  unitsDeliveredWithoutAlcohol: number;
  unitPriceWithAlcohol: number;
  unitPriceWithoutAlcohol: number;
  amountCharged: number;
  newBaseWithAlcohol: number;
  newBaseWithoutAlcohol: number;
  // Optional: undefined for legacy replenishments saved before column existed.
  // When present, the PDF differentiates "reposición de base" vs "ampliación de base".
  previousBaseWithAlcohol?: number;
  previousBaseWithoutAlcohol?: number;
  notes?: string;
};

export type ConsignmentPickupInvoice = {
  kind: "consignment_pickup";
  number: string;
  createdAt: string;
  client: InvoiceClient;
  unitsCollectedWithAlcohol: number;
  unitsCollectedWithoutAlcohol: number;
  unitsChargedWithAlcohol: number;
  unitsChargedWithoutAlcohol: number;
  unitPriceWithAlcohol: number;
  unitPriceWithoutAlcohol: number;
  amountCharged: number;
  notes?: string;
};

export type ConsignmentReactivationInvoice = {
  kind: "consignment_reactivation";
  number: string;
  createdAt: string;
  client: InvoiceClient;
  unitsWithAlcohol: number;
  unitsWithoutAlcohol: number;
  unitPriceWithAlcohol: number;
  unitPriceWithoutAlcohol: number;
  notes?: string;
};

export type InvoiceData =
  | WholesaleInvoice
  | ConsignmentInitialInvoice
  | ConsignmentReplenishmentInvoice
  | ConsignmentPickupInvoice
  | ConsignmentReactivationInvoice;

export type InvoiceContext = {
  data: InvoiceData;
  companyInfo: CompanyInfo;
};

export const INVOICE_KIND_LABEL: Record<InvoiceKind, string> = {
  wholesale: "Venta al por mayor",
  consignment_initial: "Consignación · Entrega inicial",
  consignment_replenishment: "Consignación · Reposición",
  consignment_pickup: "Consignación · Recogida",
  consignment_reactivation: "Consignación · Reactivación"
};

export const INVOICE_KIND_TITLE: Record<InvoiceKind, string> = {
  wholesale: "FACTURA DE VENTA AL POR MAYOR",
  consignment_initial: "FACTURA CONSIGNACIÓN — ENTREGA INICIAL",
  consignment_replenishment: "FACTURA CONSIGNACIÓN — REPOSICIÓN",
  consignment_pickup: "FACTURA CONSIGNACIÓN — RECOGIDA",
  consignment_reactivation: "FACTURA CONSIGNACIÓN — REACTIVACIÓN"
};
