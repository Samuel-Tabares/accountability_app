"use client";

import { useMemo, useState } from "react";
import { ArrowRight, FileText } from "lucide-react";
import {
  formatCurrency,
  formatDate,
  resolveAmbassador,
  resolveWholesaleDiscountAmount,
  resolveWholesaleNetTotal,
  resolveWholesaleSelection,
  saleTypeLabel
} from "@/src/lib/ledger";
import type { Ambassador, AppState, CalculatedState, ProductVariant, SaleType } from "@/src/lib/types";
import { listWholesaleInvoices } from "@/src/lib/invoice/builders";
import { predictNextNumber } from "@/src/lib/invoice/numbering";
import type { WholesaleInvoice } from "@/src/lib/invoice/types";
import { mapApiExpense, mapApiSale, mapApiSaleBatchConsumption } from "@/src/lib/state-mappers";
import { Button, displayNumber, Field, Input, parseNumber, postForm, saleRealTotal, Section, Select, TextArea } from "./ui";
import InvoiceSuccessModal from "./InvoiceSuccessModal";
import InvoiceHistoryModal from "./InvoiceHistoryModal";

const emptySale = {
  saleType: "unit" as SaleType,
  quantity: 0,
  wholesaleVariant: "withAlcohol" as ProductVariant,
  ambassadorCode: "",
  note: "",
  clientName: "",
  clientAddress: "",
  clientPhone: "",
  deliveryFee: 0
};

function salePreset(saleType: SaleType) {
  switch (saleType) {
    case "singleNoAlcohol":
    case "giftNoAlcohol":
      return { quantity: 0, wholesaleVariant: "withoutAlcohol" as ProductVariant };
    default:
      return { quantity: 0, wholesaleVariant: "withAlcohol" as ProductVariant };
  }
}

function saleTotalPrice(
  settings: AppState["settings"],
  saleType: SaleType,
  quantity: number,
  wholesaleVariant: ProductVariant
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
    case "wholesale": {
      const selection = resolveWholesaleSelection(settings, wholesaleVariant, quantity);
      return (selection.tier?.unitPrice ?? 0) * quantity;
    }
    case "consignment":
      return 0;
  }
}

function saleWholesaleSummary(
  settings: AppState["settings"],
  quantity: number,
  wholesaleVariant: ProductVariant,
  hasAmbassador: boolean
) {
  const selection = resolveWholesaleSelection(settings, wholesaleVariant, quantity);
  const grossTotal = (selection.tier?.unitPrice ?? 0) * quantity;
  const discountAmount = hasAmbassador ? resolveWholesaleDiscountAmount(grossTotal, selection.discountPct) : 0;
  const netTotal = hasAmbassador ? resolveWholesaleNetTotal(grossTotal, selection.discountPct) : grossTotal;
  return { grossTotal, discountAmount, netTotal, discountPct: selection.discountPct };
}

type SalesPanelProps = {
  state: AppState;
  ledger: CalculatedState;
  ambassadorOptions: Ambassador[];
  onStateUpdate: (updater: (prev: AppState) => AppState) => void;
  onMessage: (msg: string) => void;
};

export default function SalesPanel({ state, ledger, ambassadorOptions, onStateUpdate, onMessage }: SalesPanelProps) {
  const [saleForm, setSaleForm] = useState(emptySale);
  const [editingSaleId, setEditingSaleId] = useState<string | null>(null);
  const [successInvoice, setSuccessInvoice] = useState<WholesaleInvoice | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const wholesaleHistory = useMemo(
    () => listWholesaleInvoices(state, state.ambassadors),
    [state]
  );

  const salePreviewPrice = saleTotalPrice(state.settings, saleForm.saleType, saleForm.quantity, saleForm.wholesaleVariant);
  const salePreviewAmbassador =
    saleForm.saleType === "wholesale"
      ? resolveAmbassador(state.ambassadors, { ambassadorCode: saleForm.ambassadorCode.trim() || undefined })
      : undefined;
  const salePreviewWholesale =
    saleForm.saleType === "wholesale"
      ? saleWholesaleSummary(state.settings, saleForm.quantity, saleForm.wholesaleVariant, Boolean(salePreviewAmbassador))
      : null;
  const salePanelOptions: Array<{ key: SaleType; label: string }> = [
    { key: "unit", label: "Unidad" },
    { key: "promo", label: "Promoción" },
    { key: "gift", label: "Regalo" },
    { key: "singleNoAlcohol", label: "Unidad sin licor" },
    { key: "giftNoAlcohol", label: "Regalo sin licor" },
    { key: "wholesale", label: "Venta al por mayor" }
  ];
  const filteredSales = ledger.sales.slice().sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  const consignmentClientById = new Map(state.consignmentClients.map((c) => [c.id, c]));

  // Entradas virtuales de recogidas en el registro (solo visual). El cobro de
  // faltantes ya aparece como su propia sale; estas filas representan el evento
  // físico de devolución, con $0 porque no se está recibiendo dinero.
  type PickupRow = {
    kind: "pickup";
    id: string;
    createdAt: string;
    variant: ProductVariant;
    clientName: string;
    collected: number;
    faltantes: number;
  };
  const pickupRows: PickupRow[] = (state.consignmentPickups ?? []).flatMap((pickup) => {
    const client = consignmentClientById.get(pickup.clientId);
    const rows: PickupRow[] = [];
    if (pickup.unitsCollectedWithAlcohol > 0) {
      rows.push({
        kind: "pickup",
        id: `${pickup.id}-with`,
        createdAt: pickup.createdAt,
        variant: "withAlcohol",
        clientName: client?.name ?? "Cliente eliminado",
        collected: pickup.unitsCollectedWithAlcohol,
        faltantes: pickup.unitsChargedWithAlcohol
      });
    }
    if (pickup.unitsCollectedWithoutAlcohol > 0) {
      rows.push({
        kind: "pickup",
        id: `${pickup.id}-without`,
        createdAt: pickup.createdAt,
        variant: "withoutAlcohol",
        clientName: client?.name ?? "Cliente eliminado",
        collected: pickup.unitsCollectedWithoutAlcohol,
        faltantes: pickup.unitsChargedWithoutAlcohol
      });
    }
    return rows;
  });

  type RegistryItem =
    | { kind: "sale"; createdAt: string; sale: (typeof filteredSales)[number] }
    | PickupRow;
  const registryItems: RegistryItem[] = [
    ...filteredSales.map((sale) => ({ kind: "sale" as const, createdAt: sale.createdAt, sale })),
    ...pickupRows
  ].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

  function updateSaleForm(field: string, value: string | number | boolean) {
    setSaleForm((prev) => {
      if (field === "saleType") {
        const nextType = value as SaleType;
        const preset = salePreset(nextType);
        return {
          ...prev,
          saleType: nextType,
          ...preset,
          ambassadorCode: nextType === "wholesale" ? prev.ambassadorCode : "",
          note: nextType === "wholesale" ? prev.note : "",
          clientName: nextType === "wholesale" ? prev.clientName : "",
          clientAddress: nextType === "wholesale" ? prev.clientAddress : "",
          clientPhone: nextType === "wholesale" ? prev.clientPhone : "",
          deliveryFee: nextType === "wholesale" ? prev.deliveryFee : 0
        };
      }
      return { ...prev, [field]: value };
    });
  }

  async function saveSale() {
    if (!saleForm.quantity || saleForm.quantity < 1) return;
    if (saleForm.saleType === "wholesale" && saleForm.quantity < 20) return;

    const ambassador = resolveAmbassador(state.ambassadors, {
      ambassadorCode: saleForm.ambassadorCode.trim() || undefined
    });
    const noteParts = [
      saleTypeLabel(saleForm.saleType, saleForm.wholesaleVariant),
      saleForm.note.trim()
    ].filter(Boolean);

    // Snapshot wholesale form data BEFORE the request so we can build the invoice
    // after success even though we clear the form on success.
    const wholesaleSnapshot =
      saleForm.saleType === "wholesale"
        ? {
            variant: saleForm.wholesaleVariant,
            quantity: saleForm.quantity,
            note: saleForm.note.trim(),
            ambassador: ambassador,
            clientName: saleForm.clientName.trim(),
            clientAddress: saleForm.clientAddress.trim(),
            clientPhone: saleForm.clientPhone.trim(),
            deliveryFee: saleForm.deliveryFee
          }
        : null;

    try {
      const payload = await postForm("/api/sales", {
        sale_type: saleForm.saleType,
        quantity: saleForm.quantity,
        wholesale_variant: saleForm.wholesaleVariant,
        ambassador_profile_id: saleForm.saleType === "wholesale" ? ambassador?.id : undefined,
        note: noteParts.join(" | "),
        client_name: saleForm.saleType === "wholesale" ? saleForm.clientName.trim() : undefined,
        client_address: saleForm.saleType === "wholesale" ? saleForm.clientAddress.trim() : undefined,
        client_phone: saleForm.saleType === "wholesale" ? saleForm.clientPhone.trim() : undefined,
        delivery_fee: saleForm.saleType === "wholesale" ? saleForm.deliveryFee : undefined
      });

      if (wholesaleSnapshot) {
        const summary = saleWholesaleSummary(
          state.settings,
          wholesaleSnapshot.quantity,
          wholesaleSnapshot.variant,
          Boolean(wholesaleSnapshot.ambassador)
        );
        const unitPrice =
          wholesaleSnapshot.quantity > 0 ? summary.grossTotal / wholesaleSnapshot.quantity : 0;
        const currentCount = state.sales.filter((s) => s.saleType === "wholesale").length;
        const invoice: WholesaleInvoice = {
          kind: "wholesale",
          number: predictNextNumber("wholesale", currentCount),
          createdAt: new Date().toISOString(),
          variant: wholesaleSnapshot.variant,
          quantity: wholesaleSnapshot.quantity,
          unitPrice,
          grossTotal: summary.grossTotal,
          discountPct: summary.discountPct,
          discountValue: summary.discountAmount,
          netTotal: summary.netTotal,
          ambassador: wholesaleSnapshot.ambassador
            ? {
                name: wholesaleSnapshot.ambassador.name,
                code: wholesaleSnapshot.ambassador.code
              }
            : undefined,
          client: wholesaleSnapshot.clientName
            ? {
                name: wholesaleSnapshot.clientName,
                address: wholesaleSnapshot.clientAddress || undefined,
                phone: wholesaleSnapshot.clientPhone || undefined
              }
            : undefined,
          deliveryFee: wholesaleSnapshot.deliveryFee > 0 ? wholesaleSnapshot.deliveryFee : undefined,
          notes: wholesaleSnapshot.note || undefined
        };
        setSuccessInvoice(invoice);
      }

      if (payload && typeof payload === "object" && "sale" in payload) {
        const p = payload as Record<string, unknown>;
        const newSale = mapApiSale(p.sale as Record<string, unknown>, state.ambassadors);
        const newConsumptions = (p.consumptions as Array<Record<string, unknown>> ?? []).map(mapApiSaleBatchConsumption);
        const newExpenses = (p.expenses as Array<Record<string, unknown>> ?? []).map((r) =>
          mapApiExpense(r, state.ambassadors)
        );
        onStateUpdate((prev) => ({
          ...prev,
          sales: [newSale, ...prev.sales],
          saleBatchConsumptions: [...prev.saleBatchConsumptions, ...newConsumptions],
          expenses: [...prev.expenses, ...newExpenses]
        }));
      }

      setSaleForm(emptySale);
      setEditingSaleId(null);
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "No se pudo guardar la venta.");
    }
  }

  return (
    <Section
      eyebrow="Movimientos"
      title="Registrar ventas"
      description="Precio calculado automáticamente según el tipo y cantidad."
      action={
        <div className="section-head-metrics" style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <span className="chip">{ledger.totals.unitsSold} granizados vendidos</span>
          <Button variant="ghost" onClick={() => setHistoryOpen(true)} style={{ fontSize: "0.8rem" }}>
            <FileText size={14} />
            Facturas ({wholesaleHistory.length})
          </Button>
        </div>
      }
    >
      <div className="form-grid split">
        <div className="form-card">
          <div className="pill-grid">
            {salePanelOptions.map((option) => (
              <button
                key={option.key}
                className={saleForm.saleType === option.key ? "pill pill-active" : "pill"}
                onClick={() =>
                  setSaleForm((prev) => ({ ...prev, saleType: option.key, ...salePreset(option.key) }))
                }
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="grid-2">
            <Field label="Cantidad">
              <Input
                type="number"
                min={1}
                value={displayNumber(saleForm.quantity)}
                onChange={(event) => updateSaleForm("quantity", parseNumber(event.target.value))}
              />
            </Field>
            <Field label="Total">
              <div className="form-price-preview">
                {saleForm.saleType === "wholesale" && salePreviewWholesale
                  ? `${formatCurrency(salePreviewWholesale.grossTotal)} base`
                  : formatCurrency(salePreviewPrice)}
              </div>
            </Field>
          </div>

          {saleForm.saleType === "wholesale" ? (
            <>
              <div className="grid-2">
                <Field label="Tipo mayorista">
                  <Select
                    value={saleForm.wholesaleVariant}
                    onChange={(event) => updateSaleForm("wholesaleVariant", event.target.value as ProductVariant)}
                  >
                    <option value="withAlcohol">Con licor</option>
                    <option value="withoutAlcohol">Sin licor</option>
                  </Select>
                </Field>
                <Field label="Código de embajador">
                  <Select
                    value={saleForm.ambassadorCode}
                    onChange={(event) => updateSaleForm("ambassadorCode", event.target.value)}
                  >
                    <option value="">Ninguno</option>
                    {ambassadorOptions.map((ambassador) => (
                      <option key={ambassador.id} value={ambassador.code}>
                        {ambassador.code} · {ambassador.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="grid-2">
                <Field label="Nombre del cliente / negocio">
                  <Input
                    type="text"
                    placeholder="Tienda Lupita, Juan García…"
                    value={saleForm.clientName}
                    onChange={(event) => updateSaleForm("clientName", event.target.value)}
                  />
                </Field>
                <Field label="Teléfono">
                  <Input
                    type="text"
                    placeholder="+57 300 123 4567"
                    value={saleForm.clientPhone}
                    onChange={(event) => updateSaleForm("clientPhone", event.target.value)}
                  />
                </Field>
              </div>
              <div className="grid-2">
                <Field label="Dirección de entrega">
                  <Input
                    type="text"
                    placeholder="Calle 45 # 12-34"
                    value={saleForm.clientAddress}
                    onChange={(event) => updateSaleForm("clientAddress", event.target.value)}
                  />
                </Field>
                <Field label="Domicilio ($)">
                  <Input
                    type="number"
                    min={0}
                    placeholder="0"
                    value={displayNumber(saleForm.deliveryFee)}
                    onChange={(event) => updateSaleForm("deliveryFee", parseNumber(event.target.value))}
                  />
                </Field>
              </div>
              {salePreviewWholesale ? (
                <div className="mini-grid" style={{ marginBottom: "1rem" }}>
                  <div className="mini-box">
                    <span>Descuento cliente</span>
                    <strong>{formatCurrency(salePreviewWholesale.discountAmount)}</strong>
                  </div>
                  <div className="mini-box">
                    <span>Domicilio</span>
                    <strong>{formatCurrency(saleForm.deliveryFee)}</strong>
                  </div>
                  <div className="mini-box">
                    <span>Cobro neto</span>
                    <strong>{formatCurrency(salePreviewWholesale.netTotal + saleForm.deliveryFee)}</strong>
                  </div>
                </div>
              ) : null}
              {salePreviewAmbassador ? null : (
                <p className="section-description">
                  Sin embajador asociado la venta mayorista se cobra normal y no genera descuento ni comisión.
                </p>
              )}
              <Field label="Notas">
                <TextArea
                  value={saleForm.note}
                  onChange={(event) => updateSaleForm("note", event.target.value)}
                />
              </Field>
            </>
          ) : null}

          <div className="actions">
            <Button onClick={saveSale}>
              <ArrowRight size={16} />
              Guardar venta
            </Button>
          </div>
        </div>

        <div className="table-card scroll-card">
          <div className="table-head">
            <div>
              <h3>Ventas recientes</h3>
              <div className="table-head-meta">
                <span className="chip">Costo {formatCurrency(ledger.totals.costOfGoods)}</span>
                <span className="chip">Descuentos {formatCurrency(ledger.totals.discounts)}</span>
                <span className="chip">Comisiones {formatCurrency(ledger.totals.commissions)}</span>
              </div>
            </div>
            <span className="chip">{registryItems.length} registros</span>
          </div>

          <div className="stack-table stack-table-scroll">
            {registryItems.map((item) => {
              if (item.kind === "pickup") {
                const variantLabel = item.variant === "withAlcohol" ? "con licor" : "sin licor";
                return (
                  <article key={item.id} className="table-row">
                    <div>
                      <strong>Recogida consignación · {variantLabel} · {item.clientName}</strong>
                      <span>
                        Recogidas {item.collected} · Faltantes {item.faltantes} · {formatDate(item.createdAt)}
                      </span>
                    </div>
                    <div className="row-meta">
                      <strong>{formatCurrency(0)}</strong>
                      <span>Sin cobro</span>
                    </div>
                  </article>
                );
              }
              const sale = item.sale;
              const consignmentClient =
                sale.saleType === "consignment" && sale.consignmentClientId
                  ? consignmentClientById.get(sale.consignmentClientId)
                  : undefined;
              const titleLabel = consignmentClient
                ? `${sale.displayLabel} · ${consignmentClient.name}`
                : sale.displayLabel;
              return (
              <article key={sale.id} className="table-row">
                <div>
                  <strong>{titleLabel}</strong>
                  <span>
                    {sale.saleType === "promo"
                      ? `${sale.quantity} promo(s) · ${sale.quantity * 2} granizados`
                      : `Cantidad ${sale.quantity}`}{" "}
                    · {formatDate(sale.createdAt)}
                  </span>
                </div>
                <div className="row-meta">
                  <strong>
                    {sale.saleType === "gift" || sale.saleType === "giftNoAlcohol"
                      ? "Sin precio"
                      : sale.saleType === "wholesale"
                        ? `${formatCurrency(sale.wholesaleNetTotal ?? sale.priceTotal)} real`
                        : formatCurrency(sale.priceTotal)}
                  </strong>
                  <span>
                    {sale.saleType === "wholesale" ? `Base ${formatCurrency(sale.priceTotal)} · ` : ""}
                    Neto {formatCurrency(sale.netProfit)} · margen {(sale.margin * 100).toFixed(0)}%
                  </span>
                </div>
              </article>
              );
            })}
          </div>
        </div>
      </div>

      <InvoiceSuccessModal
        open={successInvoice !== null}
        invoice={successInvoice}
        companyInfo={state.companyInfo}
        onClose={() => setSuccessInvoice(null)}
      />
      <InvoiceHistoryModal
        open={historyOpen}
        title="Facturas de ventas al por mayor"
        entries={wholesaleHistory}
        companyInfo={state.companyInfo}
        onClose={() => setHistoryOpen(false)}
      />
    </Section>
  );
}
