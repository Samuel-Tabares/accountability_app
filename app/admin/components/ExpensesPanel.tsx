"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { formatCurrency, formatDate, summarizeExpenses } from "@/src/lib/ledger";
import type { AppState, Expense } from "@/src/lib/types";
import { Button, Field, Input, postForm, Section, Select } from "./ui";

const emptyExpense = {
  category: "logistica",
  description: "",
  amount: 0,
  type: "monthly" as "monthly" | "oneTime"
};

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
  expensesSummary: ReturnType<typeof summarizeExpenses>;
  onRefresh: () => void;
  onMessage: (msg: string) => void;
};

export default function ExpensesPanel({ state, expensesSummary, onRefresh, onMessage }: ExpensesPanelProps) {
  const [expenseForm, setExpenseForm] = useState(emptyExpense);

  async function saveExpense() {
    if (!expenseForm.description.trim()) return;

    try {
      await postForm("/api/expenses", {
        category: expenseForm.category.trim(),
        description: expenseForm.description.trim(),
        amount: expenseForm.amount,
        expense_type: expenseForm.type
      });
      setExpenseForm(emptyExpense);
      onRefresh();
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "No se pudo guardar el gasto.");
    }
  }

  return (
    <Section
      eyebrow="Gastos manuales"
      title="Registrar gastos manuales mensuales u operativos"
      description="Registra costos fijos del negocio con categorías predeterminadas."
    >
      <div className="form-grid split">
        <div className="form-card">
          <h3>Nuevo gasto manual</h3>
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
              <h3>Gastos manuales registrados</h3>
              <p>
                Manuales mensuales: {formatCurrency(expensesSummary.monthlyTotal)} · Manuales únicos:{" "}
                {formatCurrency(expensesSummary.oneTimeTotal)} · Descuentos trazables:{" "}
                {formatCurrency(expensesSummary.discountTotal)} · Comisiones:{" "}
                {formatCurrency(expensesSummary.commissionTotal)}
              </p>
            </div>
            <span className="chip">{state.expenses.length} movimientos</span>
          </div>

          <div className="stack-table stack-table-scroll">
            {state.expenses.map((expense) => (
              <article key={expense.id} className="table-row">
                <div>
                  <strong>
                    {expense.type === "commission"
                      ? "Comision"
                      : expense.type === "discount"
                        ? "Descuento"
                        : formatExpenseCategory(expense.category)}
                  </strong>
                  <span>
                    {expense.description} · {expenseTypeLabel(expense)} · {formatDate(expense.createdAt)}
                  </span>
                </div>
                <div className="row-meta">
                  <strong>{formatCurrency(expense.amount)}</strong>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
}
