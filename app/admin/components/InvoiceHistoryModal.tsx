"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Download, Eye, FileText, X } from "lucide-react";
import type { CompanyInfo } from "@/src/lib/types";
import { downloadInvoicePDF, openInvoicePDF } from "@/src/lib/invoice/pdf";
import { INVOICE_KIND_LABEL } from "@/src/lib/invoice/types";
import type { InvoiceHistoryEntry } from "@/src/lib/invoice/builders";
import { formatCurrency } from "@/src/lib/ledger";
import { Button } from "./ui";

type Props = {
  open: boolean;
  title: string;
  entries: InvoiceHistoryEntry[];
  companyInfo: CompanyInfo;
  onClose: () => void;
};

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("es-CO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

export default function InvoiceHistoryModal({ open, title, entries, companyInfo, onClose }: Props) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");

  const kinds = useMemo(() => {
    const set = new Set(entries.map((e) => e.kind));
    return ["all", ...Array.from(set)];
  }, [entries]);

  const filtered = useMemo(
    () => (filter === "all" ? entries : entries.filter((e) => e.kind === filter)),
    [entries, filter]
  );

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  async function handleAction(entry: InvoiceHistoryEntry, kind: "view" | "download") {
    setBusyKey(entry.key);
    try {
      const context = { data: entry.invoice, companyInfo };
      if (kind === "view") {
        await openInvoicePDF(context);
      } else {
        await downloadInvoicePDF(context);
      }
    } finally {
      setBusyKey(null);
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
          padding: "1.5rem",
          maxWidth: 720,
          width: "100%",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 20px 60px rgba(16, 45, 59, 0.25)",
          position: "relative"
        }}
      >
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: "1rem"
          }}
        >
          <div>
            <h3 style={{ margin: 0, color: "var(--text-strong)" }}>{title}</h3>
            <p style={{ margin: "0.25rem 0 0", color: "var(--muted)", fontSize: "0.85rem" }}>
              {entries.length} {entries.length === 1 ? "factura" : "facturas"} registradas
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "var(--muted)",
              padding: "0.25rem"
            }}
          >
            <X size={20} />
          </button>
        </header>

        {kinds.length > 2 && (
          <div style={{ display: "flex", gap: "0.4rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
            {kinds.map((k) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={filter === k ? "pill pill-active" : "pill"}
                style={{ fontSize: "0.8rem" }}
              >
                {k === "all" ? "Todas" : INVOICE_KIND_LABEL[k as keyof typeof INVOICE_KIND_LABEL]}
              </button>
            ))}
          </div>
        )}

        <div style={{ overflowY: "auto", flex: 1, marginTop: "0.25rem" }}>
          {filtered.length === 0 ? (
            <div
              style={{
                padding: "2rem 1rem",
                textAlign: "center",
                color: "var(--muted)"
              }}
            >
              <FileText size={32} style={{ opacity: 0.5, marginBottom: "0.5rem" }} />
              <p style={{ margin: 0 }}>Aún no hay facturas en esta categoría.</p>
            </div>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {filtered.map((entry) => (
                <li
                  key={entry.key}
                  style={{
                    background: "var(--surface-soft)",
                    borderRadius: "var(--radius-sm)",
                    padding: "0.85rem 1rem",
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: "0.5rem",
                    alignItems: "center"
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                      <strong style={{ color: "var(--text-strong)", letterSpacing: "0.03em" }}>
                        {entry.number}
                      </strong>
                      <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                        {INVOICE_KIND_LABEL[entry.kind]}
                      </span>
                    </div>
                    <div style={{ fontSize: "0.85rem", marginTop: "0.15rem", color: "var(--text)" }}>
                      {entry.subject}
                    </div>
                    {entry.subjectMeta && (
                      <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                        {entry.subjectMeta}
                      </div>
                    )}
                    <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.15rem" }}>
                      {formatDateTime(entry.createdAt)}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.35rem" }}>
                    <strong style={{ color: "var(--text-strong)" }}>{formatCurrency(entry.total)}</strong>
                    <div style={{ display: "flex", gap: "0.25rem" }}>
                      <Button
                        variant="ghost"
                        onClick={() => handleAction(entry, "view")}
                        disabled={busyKey === entry.key}
                        style={{ padding: "0.3rem 0.55rem", fontSize: "0.78rem" }}
                      >
                        <Eye size={14} />
                        Ver
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => handleAction(entry, "download")}
                        disabled={busyKey === entry.key}
                        style={{ padding: "0.3rem 0.55rem", fontSize: "0.78rem" }}
                      >
                        <Download size={14} />
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
