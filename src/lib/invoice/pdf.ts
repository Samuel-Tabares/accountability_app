"use client";

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { INVOICE_KIND_TITLE, type InvoiceContext, type InvoiceData } from "./types";
import type { CompanyInfo, ProductVariant } from "@/src/lib/types";

const LOGO_URL = "/site-assets/brand/logo-trabix.png";
const PAGE_FORMAT: [number, number] = [148, 210]; // A5 portrait

let logoCache: Promise<string> | null = null;

async function loadLogo(): Promise<string> {
  if (logoCache) return logoCache;
  logoCache = (async () => {
    const response = await fetch(LOGO_URL);
    if (!response.ok) throw new Error("No se pudo cargar el logo");
    const blob = await response.blob();
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error ?? new Error("FileReader error"));
      reader.readAsDataURL(blob);
    });
  })();
  return logoCache;
}

function formatCOP(amount: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0
  }).format(amount);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("es-CO", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function variantLabel(variant: ProductVariant): string {
  return variant === "withAlcohol" ? "con licor" : "sin licor";
}

function variantFullLabel(variant: ProductVariant): string {
  return variant === "withAlcohol"
    ? "Granizado 9oz con licor"
    : "Granizado 9oz sin licor";
}

type PageContext = {
  doc: jsPDF;
  width: number;
  height: number;
  margin: number;
  cursorY: number;
};

function newCtx(): PageContext {
  const doc = new jsPDF({ unit: "mm", format: PAGE_FORMAT, orientation: "portrait" });
  return { doc, width: PAGE_FORMAT[0], height: PAGE_FORMAT[1], margin: 10, cursorY: 10 };
}

function drawHeader(ctx: PageContext, companyInfo: CompanyInfo, logoDataUrl: string | null) {
  const { doc, width } = ctx;
  const centerX = width / 2;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(companyInfo.legalName, centerX, ctx.cursorY + 5, { align: "center" });
  ctx.cursorY += 10;

  if (logoDataUrl) {
    const logoSize = 28;
    doc.addImage(logoDataUrl, "PNG", centerX - logoSize / 2, ctx.cursorY, logoSize, logoSize);
    ctx.cursorY += logoSize + 4;
  } else {
    ctx.cursorY += 4;
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`NIT: ${companyInfo.nit}`, centerX, ctx.cursorY, { align: "center" });
  ctx.cursorY += 4.5;
  doc.text(companyInfo.address.toUpperCase(), centerX, ctx.cursorY, { align: "center" });
  ctx.cursorY += 4.5;
  doc.text(companyInfo.phone, centerX, ctx.cursorY, { align: "center" });
  ctx.cursorY += 4.5;
  doc.text(companyInfo.taxStatus.toUpperCase(), centerX, ctx.cursorY, { align: "center" });
  ctx.cursorY += 4.5;
  if (companyInfo.sanitaryRegistry) {
    doc.text(companyInfo.sanitaryRegistry, centerX, ctx.cursorY, { align: "center" });
    ctx.cursorY += 4.5;
  }

  ctx.cursorY += 2;
  doc.setLineDashPattern([1, 1], 0);
  doc.setDrawColor(120);
  doc.line(ctx.margin, ctx.cursorY, width - ctx.margin, ctx.cursorY);
  doc.setLineDashPattern([], 0);
  doc.setDrawColor(0);
  ctx.cursorY += 5;
}

function drawTitleBlock(ctx: PageContext, data: InvoiceData) {
  const { doc, width } = ctx;
  const centerX = width / 2;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(INVOICE_KIND_TITLE[data.kind], centerX, ctx.cursorY, { align: "center" });
  ctx.cursorY += 5.5;

  doc.setFontSize(14);
  doc.text(data.number, centerX, ctx.cursorY, { align: "center" });
  ctx.cursorY += 7;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const leftCol = ctx.margin + 8;
  const rightCol = width - ctx.margin - 8;
  doc.text(`FECHA: ${formatDate(data.createdAt)}`, leftCol, ctx.cursorY);
  doc.text(`HORA: ${formatTime(data.createdAt)}`, rightCol, ctx.cursorY, { align: "right" });
  ctx.cursorY += 6;
}

function drawClientBlock(ctx: PageContext, data: InvoiceData) {
  if (data.kind === "wholesale") {
    if (!data.ambassador || data.discountPct <= 0) return;
    const { doc, margin } = ctx;
    const pct = (data.discountPct * 100).toFixed(0);
    const labelText = `Código de descuento (${pct}%): `;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(labelText, margin, ctx.cursorY);
    const labelWidth = doc.getTextWidth(labelText);
    doc.setFont("helvetica", "bold");
    doc.text(data.ambassador.code, margin + labelWidth, ctx.cursorY);
    doc.setFont("helvetica", "normal");
    ctx.cursorY += 6;
    return;
  }

  const { doc, margin } = ctx;
  const client = data.client;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("ESTABLECIMIENTO", margin, ctx.cursorY);
  ctx.cursorY += 4.5;
  doc.setFont("helvetica", "normal");
  doc.text(`Local:     ${client.name}`, margin, ctx.cursorY);
  ctx.cursorY += 4;
  if (client.contactName) {
    doc.text(`Contacto:  ${client.contactName}`, margin, ctx.cursorY);
    ctx.cursorY += 4;
  }
  if (client.phone) {
    doc.text(`Teléfono:  ${client.phone}`, margin, ctx.cursorY);
    ctx.cursorY += 4;
  }
  doc.text(`Dirección: ${client.address}`, margin, ctx.cursorY);
  ctx.cursorY += 6;
}

type TableRow = [string, string, string];

function buildRows(data: InvoiceData): TableRow[] {
  switch (data.kind) {
    case "wholesale":
      return [
        [
          String(data.quantity),
          `${variantFullLabel(data.variant)} (mayorista)\n${formatCOP(data.unitPrice)}/u`,
          formatCOP(data.grossTotal)
        ]
      ];
    case "consignment_initial": {
      const rows: TableRow[] = [];
      if (data.unitsWithAlcohol > 0) {
        rows.push([
          String(data.unitsWithAlcohol),
          `${variantFullLabel("withAlcohol")}\n${formatCOP(data.priceWithAlcohol)}/u`,
          formatCOP(data.unitsWithAlcohol * data.priceWithAlcohol)
        ]);
      }
      if (data.unitsWithoutAlcohol > 0) {
        rows.push([
          String(data.unitsWithoutAlcohol),
          `${variantFullLabel("withoutAlcohol")}\n${formatCOP(data.priceWithoutAlcohol)}/u`,
          formatCOP(data.unitsWithoutAlcohol * data.priceWithoutAlcohol)
        ]);
      }
      return rows;
    }
    case "consignment_replenishment": {
      const rows: TableRow[] = [];
      const hasPrev =
        data.previousBaseWithAlcohol !== undefined &&
        data.previousBaseWithoutAlcohol !== undefined;
      const variants: Array<{
        variant: ProductVariant;
        delivered: number;
        price: number;
        previous: number | undefined;
      }> = [
        {
          variant: "withAlcohol",
          delivered: data.unitsDeliveredWithAlcohol,
          price: data.unitPriceWithAlcohol,
          previous: data.previousBaseWithAlcohol
        },
        {
          variant: "withoutAlcohol",
          delivered: data.unitsDeliveredWithoutAlcohol,
          price: data.unitPriceWithoutAlcohol,
          previous: data.previousBaseWithoutAlcohol
        }
      ];
      for (const v of variants) {
        if (v.delivered <= 0) continue;
        if (!hasPrev || v.previous === undefined) {
          // Registro previo a la migración 0010 — vista plana.
          rows.push([
            String(v.delivered),
            `${variantFullLabel(v.variant)} (reposición)\n${formatCOP(v.price)}/u`,
            formatCOP(v.delivered * v.price)
          ]);
          continue;
        }
        const reposicioned = Math.min(v.delivered, v.previous);
        if (reposicioned > 0) {
          rows.push([
            String(reposicioned),
            `${variantFullLabel(v.variant)} (reposición de base)\n${formatCOP(v.price)}/u`,
            formatCOP(reposicioned * v.price)
          ]);
        }
      }
      return rows;
    }
    case "consignment_pickup": {
      const rows: TableRow[] = [];
      if (data.unitsCollectedWithAlcohol > 0) {
        rows.push([
          String(data.unitsCollectedWithAlcohol),
          `Recogidas ${variantLabel("withAlcohol")}\n(devolución al stock)`,
          formatCOP(0)
        ]);
      }
      if (data.unitsCollectedWithoutAlcohol > 0) {
        rows.push([
          String(data.unitsCollectedWithoutAlcohol),
          `Recogidas ${variantLabel("withoutAlcohol")}\n(devolución al stock)`,
          formatCOP(0)
        ]);
      }
      if (data.unitsChargedWithAlcohol > 0) {
        rows.push([
          String(data.unitsChargedWithAlcohol),
          `Faltantes ${variantLabel("withAlcohol")}\n${formatCOP(data.unitPriceWithAlcohol)}/u`,
          formatCOP(data.unitsChargedWithAlcohol * data.unitPriceWithAlcohol)
        ]);
      }
      if (data.unitsChargedWithoutAlcohol > 0) {
        rows.push([
          String(data.unitsChargedWithoutAlcohol),
          `Faltantes ${variantLabel("withoutAlcohol")}\n${formatCOP(data.unitPriceWithoutAlcohol)}/u`,
          formatCOP(data.unitsChargedWithoutAlcohol * data.unitPriceWithoutAlcohol)
        ]);
      }
      return rows;
    }
    case "consignment_reactivation": {
      const rows: TableRow[] = [];
      if (data.unitsWithAlcohol > 0) {
        rows.push([
          String(data.unitsWithAlcohol),
          `${variantFullLabel("withAlcohol")} (reactivación)\n${formatCOP(data.unitPriceWithAlcohol)}/u`,
          formatCOP(data.unitsWithAlcohol * data.unitPriceWithAlcohol)
        ]);
      }
      if (data.unitsWithoutAlcohol > 0) {
        rows.push([
          String(data.unitsWithoutAlcohol),
          `${variantFullLabel("withoutAlcohol")} (reactivación)\n${formatCOP(data.unitPriceWithoutAlcohol)}/u`,
          formatCOP(data.unitsWithoutAlcohol * data.unitPriceWithoutAlcohol)
        ]);
      }
      return rows;
    }
  }
}

function drawDetailsTable(ctx: PageContext, data: InvoiceData) {
  const { doc, width, margin } = ctx;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("DETALLES", width / 2, ctx.cursorY, { align: "center" });
  ctx.cursorY += 4;

  autoTable(ctx.doc, {
    startY: ctx.cursorY,
    margin: { left: margin, right: margin },
    head: [["Cant", "Detalle", "Total"]],
    body: buildRows(data),
    theme: "grid",
    styles: { font: "helvetica", fontSize: 9, cellPadding: 1.5, valign: "middle" },
    headStyles: {
      fillColor: [30, 30, 30],
      textColor: [255, 255, 255],
      halign: "center",
      fontStyle: "bold"
    },
    columnStyles: {
      0: { halign: "center", cellWidth: 14 },
      1: { cellWidth: "auto" },
      2: { halign: "right", cellWidth: 28 }
    }
  });

  // jspdf-autotable mutates the doc; read the last finalY from the doc.
  const lastY = (ctx.doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
    ?.finalY;
  ctx.cursorY = (lastY ?? ctx.cursorY) + 6;
}

// Dibuja una línea label-value con dos columnas right-aligned independientes,
// garantizando un espacio mínimo entre ambas para que nunca se traslapen.
function drawSummaryLine(
  ctx: PageContext,
  label: string,
  value: string,
  opts: { bold?: boolean; fontSize?: number; lineGap?: number } = {}
) {
  const { doc, width, margin } = ctx;
  const fontSize = opts.fontSize ?? 9;
  doc.setFont("helvetica", opts.bold ? "bold" : "normal");
  doc.setFontSize(fontSize);
  const valueRightX = width - margin;
  // 32mm de ancho reservado para el value. El label termina justo antes y
  // se extiende a la izquierda hasta donde lo pida su contenido.
  const labelEndX = valueRightX - 32;
  doc.text(label, labelEndX, ctx.cursorY, { align: "right" });
  doc.text(value, valueRightX, ctx.cursorY, { align: "right" });
  ctx.cursorY += opts.lineGap ?? (fontSize >= 11 ? 6 : 4.5);
}

function drawCenteredItalic(ctx: PageContext, text: string, fontSize = 8) {
  const { doc, width } = ctx;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(fontSize);
  doc.text(text, width / 2, ctx.cursorY, { align: "center" });
  ctx.cursorY += fontSize / 2 + 1;
  doc.setFont("helvetica", "normal");
}

function drawTotals(ctx: PageContext, data: InvoiceData) {
  if (data.kind === "wholesale") {
    drawSummaryLine(ctx, "Subtotal:", formatCOP(data.grossTotal));
    if (data.discountValue > 0) {
      drawSummaryLine(
        ctx,
        `Descuento (${(data.discountPct * 100).toFixed(0)}%):`,
        `-${formatCOP(data.discountValue)}`
      );
    }
    drawSummaryLine(ctx, "IVA:", formatCOP(0));
    ctx.cursorY += 1.5;
    drawSummaryLine(ctx, "TOTAL:", formatCOP(data.netTotal), { bold: true, fontSize: 12 });
    return;
  }

  if (data.kind === "consignment_initial") {
    const total =
      data.unitsWithAlcohol * data.priceWithAlcohol +
      data.unitsWithoutAlcohol * data.priceWithoutAlcohol;
    drawSummaryLine(ctx, "Valor entregado:", formatCOP(total));
    ctx.cursorY += 1.5;
    drawCenteredItalic(ctx, "Entrega en consignación — sin cobro al momento.");
    return;
  }

  if (data.kind === "consignment_replenishment") {
    drawSummaryLine(ctx, "Cobrado por reposición:", formatCOP(data.amountCharged));
    ctx.cursorY += 1.5;
    drawSummaryLine(ctx, "TOTAL:", formatCOP(data.amountCharged), { bold: true, fontSize: 12 });
    return;
  }

  if (data.kind === "consignment_pickup") {
    drawSummaryLine(ctx, "Cobrado por faltantes:", formatCOP(data.amountCharged));
    ctx.cursorY += 1.5;
    drawSummaryLine(ctx, "TOTAL:", formatCOP(data.amountCharged), { bold: true, fontSize: 12 });
    ctx.cursorY += 1;
    drawCenteredItalic(ctx, "Cliente cerrado · stock devuelto al inventario.");
    return;
  }

  if (data.kind === "consignment_reactivation") {
    const total =
      data.unitsWithAlcohol * data.unitPriceWithAlcohol +
      data.unitsWithoutAlcohol * data.unitPriceWithoutAlcohol;
    drawSummaryLine(ctx, "Valor entregado:", formatCOP(total));
    ctx.cursorY += 1.5;
    drawCenteredItalic(ctx, "Reactivación de cliente — sin cobro al momento.");
    return;
  }
}

// Dibuja una segunda tabla con la ampliación de base (solo cuando hubo aumento
// en al menos una variante). Si no hubo ampliación, no dibuja nada.
function drawReplenishmentAmpliation(ctx: PageContext, data: InvoiceData) {
  if (data.kind !== "consignment_replenishment") return;
  if (data.previousBaseWithAlcohol === undefined || data.previousBaseWithoutAlcohol === undefined)
    return;

  const ampWith = Math.max(0, data.unitsDeliveredWithAlcohol - data.previousBaseWithAlcohol);
  const ampWithout = Math.max(
    0,
    data.unitsDeliveredWithoutAlcohol - data.previousBaseWithoutAlcohol
  );
  if (ampWith === 0 && ampWithout === 0) return;

  const { doc, width, margin } = ctx;
  ctx.cursorY += 2;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("AMPLIACIÓN DE BASE", width / 2, ctx.cursorY, { align: "center" });
  ctx.cursorY += 1;

  const body: TableRow[] = [];
  if (ampWith > 0) {
    body.push([
      `+${ampWith}`,
      `${variantFullLabel("withAlcohol")}\nNueva base: ${data.newBaseWithAlcohol} uds`,
      "Sin cobro"
    ]);
  }
  if (ampWithout > 0) {
    body.push([
      `+${ampWithout}`,
      `${variantFullLabel("withoutAlcohol")}\nNueva base: ${data.newBaseWithoutAlcohol} uds`,
      "Sin cobro"
    ]);
  }

  autoTable(ctx.doc, {
    startY: ctx.cursorY + 2,
    margin: { left: margin, right: margin },
    head: [["+", "Detalle", "Cobro"]],
    body,
    theme: "grid",
    styles: { font: "helvetica", fontSize: 9, cellPadding: 1.5, valign: "middle" },
    headStyles: {
      fillColor: [240, 240, 240],
      textColor: [40, 40, 40],
      halign: "center",
      fontStyle: "bold"
    },
    columnStyles: {
      0: { halign: "center", cellWidth: 14, fontStyle: "bold" },
      1: { cellWidth: "auto" },
      2: { halign: "right", cellWidth: 28, fontStyle: "italic" }
    }
  });
  const lastY = (ctx.doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
    ?.finalY;
  ctx.cursorY = (lastY ?? ctx.cursorY) + 4;
}

function drawNotesAndFooter(ctx: PageContext, data: InvoiceData) {
  const { doc, width, margin, height } = ctx;
  if (data.notes && data.notes.trim()) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text("Notas:", margin, ctx.cursorY);
    ctx.cursorY += 4;
    const wrapped = doc.splitTextToSize(data.notes, width - margin * 2);
    doc.text(wrapped, margin, ctx.cursorY);
    ctx.cursorY += wrapped.length * 4 + 2;
  }

  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.text("Gracias por preferirnos", width / 2, height - 12, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(120);
  doc.text(`Trabix Granizados · ${data.number}`, width / 2, height - 7, { align: "center" });
  doc.setTextColor(0);
}

export async function generateInvoicePDF(context: InvoiceContext): Promise<Blob> {
  let logoDataUrl: string | null = null;
  try {
    logoDataUrl = await loadLogo();
  } catch {
    logoDataUrl = null;
  }

  const ctx = newCtx();
  drawHeader(ctx, context.companyInfo, logoDataUrl);
  drawTitleBlock(ctx, context.data);
  drawClientBlock(ctx, context.data);
  drawDetailsTable(ctx, context.data);
  drawTotals(ctx, context.data);
  drawReplenishmentAmpliation(ctx, context.data);
  drawNotesAndFooter(ctx, context.data);

  return ctx.doc.output("blob");
}

export function invoiceFileName(data: InvoiceData): string {
  const date = formatDate(data.createdAt).replace(/\//g, "-");
  return `${data.number}_${date}.pdf`;
}

export async function downloadInvoicePDF(context: InvoiceContext): Promise<void> {
  const blob = await generateInvoicePDF(context);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = invoiceFileName(context.data);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function openInvoicePDF(context: InvoiceContext): Promise<void> {
  const blob = await generateInvoicePDF(context);
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
