"use client";

import { useMemo, useState } from "react";
import {
  BadgeDollarSign,
  CheckCircle2,
  Factory,
  HandCoins,
  Hammer,
  Layers,
  Package,
  Percent
} from "lucide-react";
import { formatCurrency, formatDate } from "@/src/lib/ledger";
import { computeBatchReports, computeMonthlyReports, type BatchReport, type MonthlyReport } from "@/src/lib/reports";
import type { AppState, CalculatedState } from "@/src/lib/types";
import { MetricCard, Section } from "./ui";

type ReportsPanelProps = {
  state: AppState;
  ledger: CalculatedState;
};

type ReportView = "month" | "batch";

function variantLabel(variant: "withAlcohol" | "withoutAlcohol") {
  return variant === "withAlcohol" ? "Con licor" : "Sin licor";
}

function ReportMetrics({
  investment,
  baseSales,
  discounts,
  revenue,
  costOfGoods,
  grossProfit,
  commissions,
  manualExpenses,
  netProfit
}: {
  investment: number;
  baseSales: number;
  discounts: number;
  revenue: number;
  costOfGoods: number;
  grossProfit: number;
  commissions: number;
  manualExpenses: number;
  netProfit: number;
}) {
  return (
    <div className="hero hero-compact">
      <MetricCard icon={<Hammer size={18} />} label="Inversión" value={formatCurrency(investment)} subtext="Lotes de este periodo" accent="accent-orange" />
      <MetricCard icon={<BadgeDollarSign size={18} />} label="Ingresos brutos" value={formatCurrency(baseSales)} subtext="Antes de descuentos" accent="accent-green" />
      <MetricCard icon={<Percent size={18} />} label="Descuentos" value={formatCurrency(discounts)} subtext="A clientes por embajadores" accent="accent-orange" />
      <MetricCard icon={<BadgeDollarSign size={18} />} label="Ingresos netos" value={formatCurrency(revenue)} subtext="Después de descuentos" accent="accent-green" />
      <MetricCard icon={<Factory size={18} />} label="Costo producción" value={formatCurrency(costOfGoods)} subtext="Excluye consignación" accent="accent-orange" />
      <MetricCard icon={<CheckCircle2 size={18} />} label="Utilidad bruta" value={formatCurrency(grossProfit)} subtext="Ingresos netos menos COGS" accent="accent-yellow" />
      <MetricCard icon={<HandCoins size={18} />} label="Comisiones" value={formatCurrency(commissions)} subtext="A embajadores" accent="accent-cream" />
      <MetricCard icon={<Hammer size={18} />} label="Gastos" value={formatCurrency(manualExpenses)} subtext="Gastos manuales del periodo" accent="accent-cream" />
      <MetricCard icon={<BadgeDollarSign size={18} />} label="Utilidad neta" value={formatCurrency(netProfit)} subtext="Utilidad bruta menos comisiones y gastos" accent="accent-cream" />
    </div>
  );
}

function AmbassadorBreakdownTable({ report }: { report: MonthlyReport | BatchReport }) {
  if (report.ambassadors.length === 0) return null;
  return (
    <div className="table-card">
      <div className="table-head">
        <h3>Por embajador</h3>
      </div>
      <div className="stack-table">
        {report.ambassadors.map((ambassador) => (
          <article key={ambassador.ambassadorId} className="table-row">
            <div>
              <strong>{ambassador.ambassadorName ?? ambassador.ambassadorId}</strong>
              <span>{Math.round(ambassador.units)} unidades</span>
            </div>
            <div className="row-meta">
              <strong>{formatCurrency(ambassador.revenue)}</strong>
              <span>Comisión {formatCurrency(ambassador.commissions)}</span>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function ConsignmentBreakdownTable({ report }: { report: MonthlyReport | BatchReport }) {
  if (report.consignmentClients.length === 0) return null;
  return (
    <div className="table-card">
      <div className="table-head">
        <h3>Por consignación</h3>
      </div>
      <div className="stack-table">
        {report.consignmentClients.map((client) => (
          <article key={client.clientId} className="table-row">
            <div>
              <strong>{client.clientName ?? client.clientId}</strong>
              <span>
                {Math.round(client.unitsDelivered)} entregadas · {Math.round(client.unitsSold)} vendidas
              </span>
            </div>
            <div className="row-meta">
              <strong>{formatCurrency(client.revenue)}</strong>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

export default function ReportsPanel({ state, ledger }: ReportsPanelProps) {
  const [view, setView] = useState<ReportView>("month");
  const monthlyReports = useMemo(() => computeMonthlyReports(state, ledger), [state, ledger]);
  const batchReportsResult = useMemo(() => computeBatchReports(state, ledger), [state, ledger]);

  const [selectedMonthKey, setSelectedMonthKey] = useState<string | null>(null);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);

  const selectedMonth =
    monthlyReports.find((report) => report.key === selectedMonthKey) ?? monthlyReports[0] ?? null;
  const selectedBatch =
    batchReportsResult.batches.find((report) => report.batchId === selectedBatchId) ??
    batchReportsResult.batches[0] ??
    null;

  return (
    <Section
      eyebrow="Trazabilidad"
      title="Reportes"
      description="Utilidades globales por mes y por lote de producción — mismos KPIs del panel principal, rebanados."
      action={
        <div className="tabs-list">
          <button className={view === "month" ? "tab tab-active" : "tab"} onClick={() => setView("month")}>
            Por mes
          </button>
          <button className={view === "batch" ? "tab tab-active" : "tab"} onClick={() => setView("batch")}>
            Por lote
          </button>
        </div>
      }
    >
      {view === "month" ? (
        <div className="form-grid split">
          <div className="table-card scroll-card">
            <div className="table-head">
              <h3>Meses</h3>
              <span className="chip">{monthlyReports.length} meses</span>
            </div>
            <div className="stack-table stack-table-scroll">
              {monthlyReports.map((report) => (
                <button
                  key={report.key}
                  type="button"
                  className={`table-row table-row-button${report.key === selectedMonth?.key ? " row-selected" : ""}`}
                  onClick={() => setSelectedMonthKey(report.key)}
                >
                  <div>
                    <strong>{report.label}</strong>
                    <span>{report.unitsSold} unidades vendidas</span>
                  </div>
                  <div className="row-meta">
                    <strong>{formatCurrency(report.netProfit)}</strong>
                    <span>utilidad neta</span>
                  </div>
                </button>
              ))}
              {monthlyReports.length === 0 ? <p className="section-description">Aún no hay movimientos registrados.</p> : null}
            </div>
          </div>

          <div>
            {selectedMonth ? (
              <>
                <ReportMetrics {...selectedMonth} />
                <div className="form-grid split">
                  <AmbassadorBreakdownTable report={selectedMonth} />
                  <ConsignmentBreakdownTable report={selectedMonth} />
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="form-grid split">
          <div className="table-card scroll-card">
            <div className="table-head">
              <h3>Lotes</h3>
              <span className="chip">{batchReportsResult.batches.length} lotes</span>
            </div>
            <div className="stack-table stack-table-scroll">
              {batchReportsResult.batches.map((report) => (
                <button
                  key={report.batchId}
                  type="button"
                  className={`table-row table-row-button${report.batchId === selectedBatch?.batchId ? " row-selected" : ""}`}
                  onClick={() => setSelectedBatchId(report.batchId)}
                >
                  <div>
                    <strong>{report.label}</strong>
                    <span>
                      {variantLabel(report.variant)} · {formatDate(report.createdAt)}
                    </span>
                  </div>
                  <div className="row-meta">
                    <strong>{formatCurrency(report.netProfit)}</strong>
                    <span>{Math.round(report.pctSold * 100)}% vendido</span>
                  </div>
                </button>
              ))}
              {batchReportsResult.batches.length === 0 ? <p className="section-description">Aún no hay lotes registrados.</p> : null}
            </div>
            {batchReportsResult.unassignedManualExpenses > 0 ? (
              <p className="section-description">
                {formatCurrency(batchReportsResult.unassignedManualExpenses)} en gastos manuales sin lote asignado
                (previos a esta función) — visibles sólo en el reporte mensual.
              </p>
            ) : null}
          </div>

          <div>
            {selectedBatch ? (
              <>
                <div className="hero hero-compact">
                  <MetricCard
                    icon={<Layers size={18} />}
                    label="Producidas"
                    value={`${selectedBatch.unitsProduced}`}
                    subtext={variantLabel(selectedBatch.variant)}
                    accent="accent-orange"
                  />
                  <MetricCard
                    icon={<Package size={18} />}
                    label="En bodega"
                    value={`${selectedBatch.unitsRemaining}`}
                    subtext="Unidades restantes"
                    accent="accent-cream"
                  />
                  <MetricCard
                    icon={<Package size={18} />}
                    label="En consignación"
                    value={`${Math.round(selectedBatch.unitsInConsignmentStock)}`}
                    subtext="Aún no vendidas por el cliente"
                    accent="accent-cream"
                  />
                  <MetricCard
                    icon={<CheckCircle2 size={18} />}
                    label="Vendidas"
                    value={`${Math.round(selectedBatch.unitsSoldOrConsumed)} (${Math.round(selectedBatch.pctSold * 100)}%)`}
                    subtext="Del total producido en el lote"
                    accent="accent-green"
                  />
                </div>
                <ReportMetrics {...selectedBatch} />
                <div className="form-grid split">
                  <AmbassadorBreakdownTable report={selectedBatch} />
                  <ConsignmentBreakdownTable report={selectedBatch} />
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </Section>
  );
}
