"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, Download, X } from "lucide-react";
import type { CompanyInfo } from "@/src/lib/types";
import { downloadInvoicePDF } from "@/src/lib/invoice/pdf";
import { INVOICE_KIND_LABEL, type InvoiceData } from "@/src/lib/invoice/types";
import { Button } from "./ui";

type Props = {
  open: boolean;
  invoice: InvoiceData | null;
  companyInfo: CompanyInfo;
  onClose: () => void;
};

export default function InvoiceSuccessModal({ open, invoice, companyInfo, onClose }: Props) {
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !invoice) return null;
  if (typeof document === "undefined") return null;

  async function handleDownload() {
    if (!invoice) return;
    setDownloading(true);
    try {
      await downloadInvoicePDF({ data: invoice, companyInfo });
    } finally {
      setDownloading(false);
    }
  }

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(16, 45, 59, 0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "1rem"
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface-strong)",
          borderRadius: "var(--radius-lg)",
          padding: "1.75rem 1.5rem",
          maxWidth: 380,
          width: "100%",
          boxShadow: "0 20px 60px rgba(16, 45, 59, 0.25)",
          position: "relative",
          textAlign: "center"
        }}
      >
        <button
          onClick={onClose}
          aria-label="Cerrar"
          style={{
            position: "absolute",
            top: "0.75rem",
            right: "0.75rem",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: "var(--muted)",
            padding: "0.25rem"
          }}
        >
          <X size={18} />
        </button>

        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: "#dff7e8",
            color: "#1f8a4a",
            marginBottom: "0.75rem"
          }}
        >
          <CheckCircle2 size={32} />
        </div>

        <h3 style={{ margin: "0 0 0.25rem", color: "var(--text-strong)" }}>¡Registro exitoso!</h3>
        <p style={{ color: "var(--muted)", margin: "0 0 0.5rem", fontSize: "0.9rem" }}>
          {INVOICE_KIND_LABEL[invoice.kind]}
        </p>
        <p
          style={{
            margin: "0 0 1.25rem",
            fontSize: "1.4rem",
            fontWeight: 700,
            letterSpacing: "0.05em",
            color: "var(--text-strong)"
          }}
        >
          {invoice.number}
        </p>

        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center" }}>
          <Button variant="ghost" onClick={onClose}>
            Cerrar
          </Button>
          <Button onClick={handleDownload} disabled={downloading}>
            <Download size={16} />
            {downloading ? "Generando..." : "Descargar factura"}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
