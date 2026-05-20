"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BadgeDollarSign,
  CheckCircle2,
  Factory,
  HandCoins,
  Hammer,
  LogOut,
  Package,
  Percent
} from "lucide-react";
import { calculateLedger, formatCurrency, formatDate, summarizeExpenses } from "@/src/lib/ledger";
import type { AppState } from "@/src/lib/types";
import { Button, MetricCard, saleRealTotal, type DashboardUser } from "./components/ui";
import SalesPanel from "./components/SalesPanel";
import ProductionPanel from "./components/ProductionPanel";
import ExpensesPanel from "./components/ExpensesPanel";
import AmbassadorsPanel from "./components/AmbassadorsPanel";
import SettingsPanel from "./components/SettingsPanel";
import ConsignacionesPanel from "./components/ConsignacionesPanel";

type ActivePanel = "sales" | "production" | "expenses" | "ambassadors" | "settings" | "consignaciones";

type AdminDashboardProps = {
  initialState: AppState;
  currentUser: DashboardUser;
  initialMessage?: string;
};

function getCurrentWeekBounds(referenceDate = new Date()) {
  const start = new Date(referenceDate);
  start.setHours(0, 0, 0, 0);
  const day = start.getDay();
  const diff = day === 0 ? 6 : day - 1;
  start.setDate(start.getDate() - diff);

  const end = new Date(start);
  end.setDate(end.getDate() + 7);

  return { start, end };
}

function isWithinRange(value: string, start: Date, end: Date) {
  const date = new Date(value);
  return date >= start && date < end;
}

export default function AdminDashboard({ initialState, currentUser, initialMessage = "" }: AdminDashboardProps) {
  const router = useRouter();
  const [state, setState] = useState<AppState>(initialState);
  const ledger = useMemo(() => calculateLedger(state), [state]);
  const expensesSummary = useMemo(() => summarizeExpenses(state.expenses), [state.expenses]);
  const [panel, setPanel] = useState<ActivePanel>("sales");
  const [message, setMessage] = useState<string>(initialMessage);

  useEffect(() => {
    setState(initialState);
  }, [initialState]);

  const ambassadorOptions = state.ambassadors.filter((ambassador) => ambassador.active);
  const currentWeekBounds = useMemo(() => getCurrentWeekBounds(new Date()), []);
  const weeklySales = ledger.sales.filter((sale) =>
    isWithinRange(sale.createdAt, currentWeekBounds.start, currentWeekBounds.end)
  );
  const weeklyExpenses = state.expenses.filter((expense) =>
    isWithinRange(expense.createdAt, currentWeekBounds.start, currentWeekBounds.end)
  );
  const weeklyRevenue = weeklySales.reduce((sum, sale) => sum + saleRealTotal(sale), 0);
  const weeklyCostOfGoods = weeklySales.reduce(
    (sum, sale) => (sale.isConsignmentDelivery ? sum : sum + sale.costOfGoods),
    0
  );
  const weeklyCommissionExpenses = weeklyExpenses.filter(
    (expense) => expense.type === "commission" && Boolean(expense.sourceSaleId)
  );
  const weeklyRegularExpenses = weeklyExpenses.filter(
    (expense) => expense.type !== "commission" && expense.type !== "discount"
  );
  const weeklyLinkedCommissionSaleIds = new Set(
    weeklyCommissionExpenses
      .map((expense) => expense.sourceSaleId)
      .filter((sourceSaleId): sourceSaleId is string => Boolean(sourceSaleId))
  );
  const weeklyLegacyCommissionTotal = weeklySales.reduce((sum, sale) => {
    if (sale.saleType !== "wholesale") return sum;
    if (weeklyLinkedCommissionSaleIds.has(sale.id)) return sum;
    return sum + sale.commissionValue;
  }, 0);
  const weeklyManualExpenses = weeklyRegularExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const weeklyCommissions =
    weeklyCommissionExpenses.reduce((sum, expense) => sum + expense.amount, 0) + weeklyLegacyCommissionTotal;
  const weeklyGrossProfit = weeklyRevenue - weeklyCostOfGoods;
  const weeklyNetProfit = weeklyGrossProfit - weeklyCommissions - weeklyManualExpenses;

  const tabItems: Array<{ key: ActivePanel; label: string }> = [
    { key: "sales", label: "Ventas" },
    { key: "production", label: "Lotes" },
    { key: "expenses", label: "Gastos manuales" },
    { key: "ambassadors", label: "Embajadores" },
    { key: "consignaciones", label: "Consignaciones" },
    { key: "settings", label: "Configuración" }
  ];

  function showMessage(nextMessage: string) {
    setMessage(nextMessage);
    window.setTimeout(() => setMessage(""), 3500);
  }

  function refreshDashboard() {
    router.refresh();
  }

  async function signOut() {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include"
      });
    } catch {
      // Ignore logout transport errors and still send the user to login.
    } finally {
      if (typeof window !== "undefined") {
        window.location.assign("/login");
      }
    }
  }

  return (
    <main className="app-shell">
      <section className="main-content">
        <header className="hero">
          <MetricCard
            icon={<Hammer size={18} />}
            label="Inversión"
            value={formatCurrency(ledger.totals.investment)}
            subtext="Costo total invertido en lotes."
            accent="accent-orange"
          />
          <MetricCard
            icon={<BadgeDollarSign size={18} />}
            label="Venta base"
            value={formatCurrency(ledger.totals.baseSales)}
            subtext="Precio antes de descuentos."
            accent="accent-green"
          />
          <MetricCard
            icon={<BadgeDollarSign size={18} />}
            label="Ingresos netos"
            value={formatCurrency(ledger.totals.revenue)}
            subtext="Dinero realmente cobrado."
            accent="accent-green"
          />
          <MetricCard
            icon={<Percent size={18} />}
            label="Descuentos"
            value={formatCurrency(ledger.totals.discounts)}
            subtext="Dinero que no se cobró por ventas mayoristas."
            accent="accent-orange"
          />
          <MetricCard
            icon={<HandCoins size={18} />}
            label="Comisiones"
            value={formatCurrency(ledger.totals.commissions)}
            subtext="Pago acumulado para embajadores."
            accent="accent-cream"
          />
          <MetricCard
            icon={<Factory size={18} />}
            label="Costo producción"
            value={formatCurrency(ledger.totals.costOfGoods)}
            subtext="Costo FIFO de granizados vendidos (excluye consignación)."
            accent="accent-orange"
          />
          <MetricCard
            icon={<Package size={18} />}
            label="Stock en consignación"
            value={formatCurrency(ledger.totals.consignmentStockCogs)}
            subtext="Costo de producción del stock actualmente en establecimientos."
            accent="accent-cream"
          />
          <MetricCard
            icon={<Hammer size={18} />}
            label="Gastos manuales"
            value={formatCurrency(ledger.totals.manualExpenses)}
            subtext="Pagos operativos registrados manualmente."
            accent="accent-cream"
          />
          <MetricCard
            icon={<CheckCircle2 size={18} />}
            label="Utilidad bruta"
            value={formatCurrency(ledger.totals.grossProfit)}
            subtext="Ingresos menos costo de producción."
            accent="accent-yellow"
          />
          <MetricCard
            icon={<BadgeDollarSign size={18} />}
            label="Utilidad neta"
            value={formatCurrency(ledger.totals.netProfit)}
            subtext="Utilidad bruta menos comisiones y gastos manuales."
            accent="accent-cream"
          />
          <MetricCard
            icon={<Package size={18} />}
            label="Unidades consignadas"
            value={`${ledger.totals.consignedWithAlcohol}A / ${ledger.totals.consignedWithoutAlcohol}SA`}
            subtext="Unidades actualmente en establecimientos."
            accent="accent-cream"
          />
        </header>

        <section className="tabs-row">
          <div className="tabs-list">
            {tabItems.map(({ key, label }) => (
              <button
                key={key}
                className={panel === key ? "tab tab-active" : "tab"}
                onClick={() => setPanel(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <Button variant="ghost" onClick={signOut}>
            <LogOut size={16} />
            Cerrar sesión
          </Button>
        </section>

        {message ? <p className="auth-banner">{message}</p> : null}

        {panel === "sales" ? (
          <SalesPanel
            state={state}
            ledger={ledger}
            ambassadorOptions={ambassadorOptions}
            onRefresh={refreshDashboard}
            onMessage={showMessage}
          />
        ) : null}

        {panel === "production" ? (
          <ProductionPanel
            state={state}
            ledger={ledger}
            onRefresh={refreshDashboard}
            onMessage={showMessage}
          />
        ) : null}

        {panel === "expenses" ? (
          <ExpensesPanel
            state={state}
            expensesSummary={expensesSummary}
            onRefresh={refreshDashboard}
            onMessage={showMessage}
          />
        ) : null}

        {panel === "ambassadors" ? (
          <AmbassadorsPanel
            state={state}
            ledger={ledger}
            currentUser={currentUser}
            onRefresh={refreshDashboard}
            onMessage={showMessage}
          />
        ) : null}

        {panel === "settings" ? (
          <SettingsPanel
            initialSettings={state.settings}
            onRefresh={refreshDashboard}
            onMessage={showMessage}
          />
        ) : null}

        {panel === "consignaciones" ? (
          <ConsignacionesPanel
            consignmentClients={state.consignmentClients}
            consignmentReplenishments={state.consignmentReplenishments}
            consignmentPickups={state.consignmentPickups}
            defaultPriceWithAlcohol={4900}
            defaultPriceWithoutAlcohol={4800}
            onRefresh={refreshDashboard}
            onMessage={showMessage}
          />
        ) : null}

        <section className="footer-note">
          <div>
            <strong>Resumen semanal</strong>
            <p>
              Del {formatDate(currentWeekBounds.start)} al{" "}
              {formatDate(new Date(currentWeekBounds.end.getTime() - 24 * 60 * 60 * 1000))}
            </p>
          </div>
          <div className="weekly-summary">
            <div className="mini-box">
              <span>Ingresos netos</span>
              <strong>{formatCurrency(weeklyRevenue)}</strong>
            </div>
            <div className="mini-box">
              <span>Utilidad bruta</span>
              <strong>{formatCurrency(weeklyGrossProfit)}</strong>
            </div>
            <div className="mini-box">
              <span>Utilidad neta</span>
              <strong>{formatCurrency(weeklyNetProfit)}</strong>
            </div>
            <div className="mini-box">
              <span>Comisiones</span>
              <strong>{formatCurrency(weeklyCommissions)}</strong>
            </div>
            <div className="mini-box">
              <span>Gastos manuales</span>
              <strong>{formatCurrency(weeklyManualExpenses)}</strong>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
