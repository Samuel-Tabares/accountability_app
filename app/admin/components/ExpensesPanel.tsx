"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { formatCurrency, formatDate, resolveActiveBatch, summarizeExpenses } from "@/src/lib/ledger";
import type { AppState, CalculatedState, Expense } from "@/src/lib/types";
import { mapApiExpense } from "@/src/lib/state-mappers";
import { Button, Field, Input, postForm, Section, Select } from "./ui";

const emptyExpense = {
  category: "logistica",
  description: "",
  amount: 0,
  type: "monthly" as "monthly" | "oneTime",
  batchId: ""
};

function variantLabel(variant: "withAlcohol" | "withoutAlcohol") {
  return variant === "withAlcohol" ? "con licor" : "sin licor";
}

function expenseTypeLabel(expense: Expense) {
  if (expense.type === "commission") return "comision";
  if (expense.type === "discount") return "descuento";
  return expense.type === "monthly" ? "mensual" : "único";
}

function formatExpenseCategory(category: string) {
  return category
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" / ");
}

type ExpensesPanelProps = {
  state: AppState;
  ledger: CalculatedState;
  expensesSummary: ReturnType<typeof summarizeExpenses>;
  onStateUpdate: (updater: (prev: AppState) => AppState) => void;
  onMessage: (msg: string) => void;
};

export default function ExpensesPanel({ state, ledger, expensesSummary, onStateUpdate, onMessage }: ExpensesPanelProps) {
  const [expenseForm, setExpenseForm] = useState(emptyExpense);
  const activeBatch = resolveActiveBatch(ledger.batches);
  const batchLabel = (batchId?: string) => {
    const batch = ledger.batches.find((b) => b.id === batchId);
    return batch ? `${batch.label} · ${variantLabel(batch.variant)}` : undefined;
  };

  async function saveExpense() {
    if (!expenseForm.description.trim()) return;

    try {
      const payload = await postForm("/api/expenses", {
        category: expenseForm.category.trim(),
        description: expenseForm.description.trim(),
        amount: expenseForm.amount,
        expense_type: expenseForm.type,
        batch_id: expenseForm.batchId || undefined
      });

      if (payload && typeof payload === "object" && "expense" in payload) {
        const newExpense = mapApiExpense((payload as Record<string, unknown>).expense as Record<string, unknown>);
        onStateUpdate((prev) => ({ ...prev, expenses: [newExpense, ...prev.expenses] }));
      }

      setExpenseForm(emptyExpense);
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "No se pudo guardar el gasto.");
    }
  }

  return (
    <Section
      eyebrow="Gastos manuales"
      title="Registrar gasto"
      description="Costos fijos y operativos del negocio."
    >
      <div className="form-grid split">
        <div className="form-card">
          <div className="grid-2">
            <Field label="Categoría">
              <Select
                value={expenseForm.category}
                onChange={(event) => setExpenseForm((prev) => ({ ...prev, category: event.target.value }))}
              >
                <option value="logistica">Logística</option>
                <option value="trabajadores">Trabajadores</option>
                <option value="transporte">Transporte</option>
                <option value="servicios">Servicios</option>
                <option value="marketing">Marketing</option>
                <option value="plataformas">Plataformas</option>
                <option value="otros">Otros</option>
              </Select>
            </Field>
            <Field label="Tipo">
              <Select
                value={expenseForm.type}
                onChange={(event) =>
                  setExpenseForm((prev) => ({ ...prev, type: event.target.value as "monthly" | "oneTime" }))
                }
              >
                <option value="monthly">Mensual</option>
                <option value="oneTime">Único</option>
              </Select>
            </Field>
            <Field label="Descripción">
              <Input
                value={expenseForm.description}
                onChange={(event) => setExpenseForm((prev) => ({ ...prev, description: event.target.value }))}
              />
            </Field>
            <Field label="Monto">
              <Input
                type="number"
                min={0}
                value={expenseForm.amount}
                onChange={(event) =>
                  setExpenseForm((prev) => ({ ...prev, amount: Number(event.target.value) }))
                }
              />
            </Field>
            <Field
              label="Lote"
              hint={activeBatch ? `Activo: ${batchLabel(activeBatch.id)}` : "Sin lotes"}
            >
              <Select
                value={expenseForm.batchId}
                onChange={(event) => setExpenseForm((prev) => ({ ...prev, batchId: event.target.value }))}
              >
                <option value="">
                  {activeBatch ? `Lote activo (${batchLabel(activeBatch.id)})` : "Sin lote activo"}
                </option>
                {ledger.batches
                  .slice()
                  .reverse()
                  .map((batch) => (
                    <option key={batch.id} value={batch.id}>
                      {batch.label} · {variantLabel(batch.variant)} · {batch.unitsRemaining} disp.
                    </option>
                  ))}
              </Select>
            </Field>
          </div>
          <div className="actions">
            <Button onClick={saveExpense}>
              <Plus size={16} />
              Guardar gasto manual
            </Button>
          </div>
        </div>

        <div className="table-card expenses-card">
          <div className="table-head">
            <div>
              <h3>Gastos registrados</h3>
              <div className="table-head-meta">
                <span className="chip">Mensuales {formatCurrency(expensesSummary.monthlyTotal)}</span>
                <span className="chip">Únicos {formatCurrency(expensesSummary.oneTimeTotal)}</span>
                <span className="chip">Comisiones {formatCurrency(expensesSummary.commissionTotal)}</span>
              </div>
            </div>
            <span className="chip">{state.expenses.length} movimientos</span>
          </div>

          <div className="stack-table stack-table-scroll">
            {state.expenses.map((expense) => {
              const isAuto = expense.type === "commission" || expense.type === "discount";
              return (
                <article key={expense.id} className={`table-row${isAuto ? " row-auto" : ""}`}>
                  <div>
                    <strong>
                      {isAuto ? (
                        <>
                          {expense.type === "commission" ? "Comisión" : "Descuento"}
                          <span className="row-auto-tag">auto</span>
                        </>
                      ) : (
                        formatExpenseCategory(expense.category)
                      )}
                    </strong>
                    <span>
                      {expense.description} · {expenseTypeLabel(expense)} · {formatDate(expense.createdAt)}
                      {batchLabel(expense.batchId) ? ` · ${batchLabel(expense.batchId)}` : ""}
                    </span>
                  </div>
                  <div className="row-meta">
                    <strong>{formatCurrency(expense.amount)}</strong>
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
