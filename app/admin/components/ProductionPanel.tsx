"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { formatCurrency } from "@/src/lib/ledger";
import type { AppState, CalculatedState, ProductVariant } from "@/src/lib/types";
import { mapApiBatch } from "@/src/lib/state-mappers";
import { Button, displayNumber, Field, Input, parseNumber, postForm, Section, Select, TextArea } from "./ui";

type BatchOtherDraft = {
  id: string;
  name: string;
  cost: number;
};

type BatchDraft = {
  label: string;
  variant: ProductVariant;
  granizadoCount: number;
  granizadoTotalCost: number;
  otherItems: BatchOtherDraft[];
  notes: string;
};

const emptyBatch: BatchDraft = {
  label: "",
  variant: "withoutAlcohol" as ProductVariant,
  granizadoCount: 0,
  granizadoTotalCost: 0,
  otherItems: [],
  notes: ""
};

function createOtherBatchItem(): BatchOtherDraft {
  return { id: crypto.randomUUID(), name: "", cost: 0 };
}

function variantLabel(variant: ProductVariant) {
  return variant === "withAlcohol" ? "Con licor" : "Sin licor";
}

type ProductionPanelProps = {
  state: AppState;
  ledger: CalculatedState;
  onStateUpdate: (updater: (prev: AppState) => AppState) => void;
  onMessage: (msg: string) => void;
};

export default function ProductionPanel({ state, ledger, onStateUpdate, onMessage }: ProductionPanelProps) {
  const [batchForm, setBatchForm] = useState(emptyBatch);
  const [showNotes, setShowNotes] = useState(false);

  function updateOtherBatchItem(itemId: string, field: keyof BatchOtherDraft, value: string | number) {
    setBatchForm((prev) => ({
      ...prev,
      otherItems: prev.otherItems.map((item) =>
        item.id === itemId ? { ...item, [field]: field === "cost" ? Number(value) : value } : item
      )
    }));
  }

  function addOtherBatchItem() {
    setBatchForm((prev) => ({ ...prev, otherItems: [...prev.otherItems, createOtherBatchItem()] }));
  }

  function removeOtherBatchItem(itemId: string) {
    setBatchForm((prev) => ({ ...prev, otherItems: prev.otherItems.filter((item) => item.id !== itemId) }));
  }

  async function saveBatch() {
    if (!batchForm.label.trim() || batchForm.granizadoCount < 1 || batchForm.granizadoTotalCost < 0) return;

    const validOtherItems = batchForm.otherItems.filter((item) => item.name.trim());
    const otherCost = validOtherItems.reduce((sum, item) => sum + Math.max(item.cost, 0), 0);
    const totalCost = batchForm.granizadoTotalCost + otherCost;
    const unitCost = batchForm.granizadoCount > 0 ? totalCost / batchForm.granizadoCount : 0;

    const items = [
      { kind: "granizado", name: "Granizados", quantity: batchForm.granizadoCount, unitPrice: unitCost },
      ...validOtherItems.map((item) => ({
        kind: "other" as const,
        name: item.name.trim(),
        unitPrice: Math.max(item.cost, 0)
      }))
    ];

    try {
      const payload = await postForm("/api/batches", {
        label: batchForm.label.trim(),
        variant: batchForm.variant,
        units_produced: batchForm.granizadoCount,
        total_cost: totalCost,
        items: JSON.stringify(items),
        notes: batchForm.notes.trim()
      });

      if (payload && typeof payload === "object" && "batch" in payload) {
        const p = payload as Record<string, unknown>;
        const newBatch = mapApiBatch(
          p.batch as Record<string, unknown>,
          p.items as Array<Record<string, unknown>> ?? []
        );
        onStateUpdate((prev) => ({ ...prev, batches: [newBatch, ...prev.batches] }));
      }

      setBatchForm(emptyBatch);
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "No se pudo guardar el lote.");
    }
  }

  return (
    <Section
      eyebrow="FIFO"
      title="Lotes y costeo manual"
      description="Registra granizados producidos, su costo y gastos adicionales del lote."
    >
      <div className="form-grid split">
        <div className="form-card">
          <div className="grid-2">
            <Field label="Nombre del lote">
              <Input
                value={batchForm.label}
                onChange={(event) => setBatchForm((prev) => ({ ...prev, label: event.target.value }))}
              />
            </Field>
            <Field label="Variante">
              <Select
                value={batchForm.variant}
                onChange={(event) =>
                  setBatchForm((prev) => ({ ...prev, variant: event.target.value as ProductVariant }))
                }
              >
                <option value="withAlcohol">Con licor</option>
                <option value="withoutAlcohol">Sin licor</option>
              </Select>
            </Field>
            <Field label="Granizados solicitados">
              <Input
                type="number"
                min={1}
                value={displayNumber(batchForm.granizadoCount)}
                onChange={(event) =>
                  setBatchForm((prev) => ({ ...prev, granizadoCount: parseNumber(event.target.value) }))
                }
              />
            </Field>
            <Field label="Costo total granizados">
              <Input
                type="number"
                min={0}
                value={displayNumber(batchForm.granizadoTotalCost)}
                onChange={(event) =>
                  setBatchForm((prev) => ({ ...prev, granizadoTotalCost: parseNumber(event.target.value) }))
                }
              />
            </Field>
          </div>

          <div className="batch-item-list">
            <div className="batch-actions">
              <Button variant="secondary" onClick={addOtherBatchItem}>
                <Plus size={16} />
                Agregar otro gasto
              </Button>
            </div>

            {batchForm.otherItems.map((item) => (
              <article key={item.id} className="batch-item-row">
                <div className="grid-2">
                  <Field label="Nombre">
                    <Input
                      value={item.name}
                      onChange={(event) => updateOtherBatchItem(item.id, "name", event.target.value)}
                    />
                  </Field>
                  <Field label="Costo">
                    <Input
                      type="number"
                      min={0}
                      value={displayNumber(item.cost)}
                      onChange={(event) => updateOtherBatchItem(item.id, "cost", Number(event.target.value))}
                    />
                  </Field>
                </div>
                <div className="actions">
                  <Button variant="ghost" onClick={() => removeOtherBatchItem(item.id)}>
                    Eliminar
                  </Button>
                </div>
              </article>
            ))}
          </div>

          {showNotes ? (
            <Field label="Notas">
              <TextArea
                value={batchForm.notes}
                onChange={(event) => setBatchForm((prev) => ({ ...prev, notes: event.target.value }))}
              />
            </Field>
          ) : (
            <button type="button" className="notes-toggle" onClick={() => setShowNotes(true)}>
              + Agregar notas
            </button>
          )}
          <div className="actions">
            <Button onClick={saveBatch}>
              <Plus size={16} />
              Guardar lote
            </Button>
          </div>
        </div>

        <div className="table-card scroll-card">
          <div className="table-head">
            <div>
              <h3>Lotes activos</h3>
              <div className="table-head-meta">
                <span className="chip">{ledger.totals.unitsProduced} producidos</span>
                <span className="chip">{ledger.totals.unitsRemaining} restantes</span>
              </div>
            </div>
            <span className="chip">{state.batches.length} lotes</span>
          </div>

          <div className="stack-table stack-table-scroll">
            {ledger.batches.map((batch) => (
              <article key={batch.id} className="table-row">
                <div>
                  <strong>{batch.label}</strong>
                  <span>
                    {variantLabel(batch.variant)} · {batch.unitsProduced} uds · {formatCurrency(batch.unitCost)}/ud
                  </span>
                </div>
                <div className="row-meta">
                  <strong>{batch.unitsRemaining} disponibles</strong>
                  <span>{formatCurrency(batch.totalCost)} costo total</span>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
}
