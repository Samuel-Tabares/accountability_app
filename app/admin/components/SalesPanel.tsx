"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
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
import { Button, displayNumber, Field, Input, parseNumber, postForm, saleRealTotal, Section, Select, TextArea } from "./ui";

const emptySale = {
  saleType: "unit" as SaleType,
  quantity: 0,
  wholesaleVariant: "withAlcohol" as ProductVariant,
  ambassadorCode: "",
  note: ""
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
  onRefresh: () => void;
  onMessage: (msg: string) => void;
};

export default function SalesPanel({ state, ledger, ambassadorOptions, onRefresh, onMessage }: SalesPanelProps) {
  const [saleForm, setSaleForm] = useState(emptySale);
  const [editingSaleId, setEditingSaleId] = useState<string | null>(null);

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
          note: nextType === "wholesale" ? prev.note : ""
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

    try {
      await postForm("/api/sales", {
        sale_type: saleForm.saleType,
        quantity: saleForm.quantity,
        wholesale_variant: saleForm.wholesaleVariant,
        ambassador_profile_id: saleForm.saleType === "wholesale" ? ambassador?.id : undefined,
        note: noteParts.join(" | ")
      });
      setSaleForm(emptySale);
      setEditingSaleId(null);
      onRefresh();
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "No se pudo guardar la venta.");
    }
  }

  return (
    <Section
      eyebrow="Movimientos"
      title="Registrar ventas"
      description="Usa un preset plano. La cantidad es editable por admin y el precio se calcula automáticamente."
      action={
        <div className="section-head-metrics">
          <span className="chip">{ledger.totals.unitsSold} granizados vendidos</span>
        </div>
      }
    >
      <div className="form-grid split">
        <div className="form-card">
          <h3>{editingSaleId ? "Editar venta" : "Nueva venta"}</h3>
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
            <Field label="Precio calculado">
              <Input
                value={
                  saleForm.saleType === "wholesale" && salePreviewWholesale
                    ? `${formatCurrency(salePreviewWholesale.grossTotal)} base`
                    : formatCurrency(salePreviewPrice)
                }
                readOnly
              />
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
              {salePreviewWholesale ? (
                <div className="mini-grid" style={{ marginBottom: "1rem" }}>
                  <div className="mini-box">
                    <span>Descuento cliente</span>
                    <strong>{formatCurrency(salePreviewWholesale.discountAmount)}</strong>
                  </div>
                  <div className="mini-box">
                    <span>Cobro neto</span>
                    <strong>{formatCurrency(salePreviewWholesale.netTotal)}</strong>
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

        <div className="table-card">
          <div className="table-head">
            <div>
              <h3>Ventas recientes</h3>
              <p>
                Costo producción (ventas): {formatCurrency(ledger.totals.costOfGoods)} | Descuentos:{" "}
                {formatCurrency(ledger.totals.discounts)} | Comisiones:{" "}
                {formatCurrency(ledger.totals.commissions)}
              </p>
            </div>
            <span className="chip">{registryItems.length} registros</span>
          </div>

          <div className="stack-table">
            {registryItems.slice(0, 8).map((item) => {
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
    </Section>
  );
}
