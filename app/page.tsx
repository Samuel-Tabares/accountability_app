"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BadgeDollarSign,
  Bot,
  Box,
  CheckCircle2,
  Coins,
  HandCoins,
  Hammer,
  LogOut,
  Menu,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Users
} from "lucide-react";
import {
  calculateLedger,
  formatCurrency,
  formatDate,
  resolveAmbassador,
  isBoostActive,
  resolveWholesaleDiscountAmount,
  resolveWholesaleNetTotal,
  resolveWholesaleSelection,
  saleTypeLabel,
  saleVariantForType,
  summarizeExpenses
} from "@/src/lib/ledger";
import { clearState, loadState, saveState } from "@/src/lib/storage";
import type {
  Ambassador,
  AppState,
  Expense,
  ProductionBatch,
  ProductVariant,
  Role,
  Sale,
  SaleType,
  PricingSettings,
  WholesaleTier,
  User
} from "@/src/lib/types";
import { blankState } from "@/src/lib/seed";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes
} from "react";

type ActivePanel = "sales" | "production" | "expenses" | "ambassadors" | "settings";

const emptySale = {
  saleType: "unit" as SaleType,
  quantity: 0,
  wholesaleVariant: "withAlcohol" as ProductVariant,
  ambassadorCode: "",
  note: "",
};

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

const emptyExpense = {
  category: "logistica",
  description: "",
  amount: 0,
  type: "monthly" as "monthly" | "oneTime"
};

function useStoredState() {
  const [state, setState] = useState<AppState>(() => loadState());

  useEffect(() => {
    saveState(state);
  }, [state]);

  return [state, setState] as const;
}

function useStoredSession(users: User[]) {
  const [sessionId, setSessionId] = useState<string | null>(() =>
    typeof window === "undefined" ? null : window.localStorage.getItem("trabix-accountability-session")
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionId) {
      window.localStorage.setItem("trabix-accountability-session", sessionId);
    } else {
      window.localStorage.removeItem("trabix-accountability-session");
    }
  }, [sessionId]);

  const currentUser = users.find((user) => user.id === sessionId) ?? null;

  return { currentUser, setSessionId, sessionId };
}

function useLocalAdminMode(state: AppState, currentUser: User | null, sessionId: string | null) {
  return !currentUser && (state.users.length === 0 || sessionId === "local-admin")
    ? {
        id: "local-admin",
        email: "local@trabix.app",
        password: "",
        name: "Admin local",
        role: "admin" as const
      }
    : currentUser;
}

function shellClassName(active: boolean) {
  return active
    ? "tab tab-active"
    : "tab";
}

function Section({
  eyebrow,
  title,
  description,
  action,
  children
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="panel">
      <header className="section-head">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
          <p className="section-description">{description}</p>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function MetricCard({
  icon,
  label,
  value,
  subtext,
  accent
}: {
  icon: ReactNode;
  label: string;
  value: string;
  subtext: string;
  accent?: string;
}) {
  return (
    <article className="metric-card">
      <div className="metric-top">
        <span className={`metric-icon ${accent ?? ""}`}>{icon}</span>
        <span className="metric-label">{label}</span>
      </div>
      <strong>{value}</strong>
      <p>{subtext}</p>
    </article>
  );
}

function Field({
  label,
  children,
  hint
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>
        {label}
        {hint ? <em>{hint}</em> : null}
      </span>
      {children}
    </label>
  );
}

function Button({
  children,
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  return (
    <button className={`button button-${variant}${className ? ` ${className}` : ""}`} {...props}>
      {children}
    </button>
  );
}

function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className="input" {...props} />;
}

function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className="input" {...props} />;
}

function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className="input textarea" {...props} />;
}

function pillType(type: SaleType) {
  const map: Record<SaleType, string> = {
    unit: "unidad con licor",
    promo: "promoción",
    gift: "regalo con licor",
    singleNoAlcohol: "sin licor",
    giftNoAlcohol: "regalo sin licor",
    wholesale: "mayorista"
  };

  return map[type];
}

function variantLabel(variant: ProductVariant) {
  return variant === "withAlcohol" ? "Con licor" : "Sin licor";
}

function displayNumber(value: number) {
  return value === 0 ? "" : String(value);
}

function parseNumber(value: string) {
  return value === "" ? 0 : Number(value);
}

function levelLabel(level?: Ambassador["level"]) {
  const labels: Record<NonNullable<Ambassador["level"]>, string> = {
    nivel0: "Nivel 0",
    plata: "Plata",
    oro: "Oro",
    diamante: "Diamante"
  };

  return level ? labels[level] : "N/A";
}

function saleLabel(sale: Pick<Sale, "saleType" | "wholesaleVariant">) {
  return saleTypeLabel(sale.saleType, sale.wholesaleVariant ?? "withAlcohol");
}

function salePreset(saleType: SaleType) {
  switch (saleType) {
    case "unit":
      return { quantity: 0, wholesaleVariant: "withAlcohol" as ProductVariant };
    case "promo":
      return { quantity: 0, wholesaleVariant: "withAlcohol" as ProductVariant };
    case "gift":
      return { quantity: 0, wholesaleVariant: "withAlcohol" as ProductVariant };
    case "singleNoAlcohol":
      return { quantity: 0, wholesaleVariant: "withoutAlcohol" as ProductVariant };
    case "giftNoAlcohol":
      return { quantity: 0, wholesaleVariant: "withoutAlcohol" as ProductVariant };
    case "wholesale":
      return { quantity: 0, wholesaleVariant: "withAlcohol" as ProductVariant };
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

  return {
    grossTotal,
    discountAmount,
    netTotal,
    discountPct: selection.discountPct,
    baseCommissionPct: selection.commissionRate
  };
}

function wholesaleVariantText(variant: ProductVariant) {
  return variant === "withAlcohol" ? "con licor" : "sin licor";
}

function buildDiscountExpenseDescription(params: {
  ambassador: Ambassador;
  sale: Pick<Sale, "quantity" | "wholesaleVariant">;
}) {
  return [
    `${params.ambassador.name} (${params.ambassador.code})`,
    `${params.sale.quantity} unidades ${wholesaleVariantText(params.sale.wholesaleVariant ?? "withAlcohol")}`
  ]
    .filter(Boolean)
    .join(" | ");
}

function buildCommissionExpenseDescription(params: {
  ambassador: Ambassador;
  sale: Pick<Sale, "quantity" | "wholesaleVariant">;
}) {
  return [
    `${params.ambassador.name} (${params.ambassador.code})`,
    `${params.sale.quantity} unidades ${wholesaleVariantText(params.sale.wholesaleVariant ?? "withAlcohol")}`
  ]
    .filter(Boolean)
    .join(" | ");
}

function buildCommissionExpense(params: {
  sale: Sale;
  ambassador: Ambassador;
  commissionValue: number;
  expenseId?: string;
  existingExpense?: Expense;
}): Expense {
  return {
    id: params.expenseId ?? params.existingExpense?.id ?? `exp-${crypto.randomUUID()}`,
    createdAt: params.existingExpense?.createdAt ?? params.sale.createdAt,
    category: "comisiones",
    description: buildCommissionExpenseDescription(params),
    amount: params.commissionValue,
    type: "commission",
    sourceSaleId: params.sale.id,
    ambassadorId: params.ambassador.id,
    ambassadorCode: params.ambassador.code
  };
}

function buildDiscountExpense(params: {
  sale: Sale;
  ambassador: Ambassador;
  discountValue: number;
  expenseId?: string;
  existingExpense?: Expense;
}): Expense {
  return {
    id: params.expenseId ?? params.existingExpense?.id ?? `exp-${crypto.randomUUID()}`,
    createdAt: params.existingExpense?.createdAt ?? params.sale.createdAt,
    category: "descuentos",
    description: buildDiscountExpenseDescription({
      ambassador: params.ambassador,
      sale: params.sale
    }),
    amount: params.discountValue,
    type: "discount",
    sourceSaleId: params.sale.id,
    ambassadorId: params.ambassador.id,
    ambassadorCode: params.ambassador.code
  };
}

function expenseTypeLabel(expense: Expense) {
  if (expense.type === "commission") {
    return "comision";
  }

  if (expense.type === "discount") {
    return "descuento";
  }

  return expense.type === "monthly" ? "mensual" : "único";
}

function formatExpenseCategory(category: string) {
  return category
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" / ");
}

function createOtherBatchItem(): BatchOtherDraft {
  return {
    id: crypto.randomUUID(),
    name: "",
    cost: 0
  };
}

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

export default function Page() {
  const [state, setState] = useStoredState();
  const ledger = useMemo(() => calculateLedger(state), [state]);
  const expensesSummary = useMemo(() => summarizeExpenses(state.expenses), [state.expenses]);
  const { currentUser, setSessionId, sessionId } = useStoredSession(state.users);
  const activeUser = useLocalAdminMode(state, currentUser, sessionId);
  const [panel, setPanel] = useState<ActivePanel>("sales");
  const [saleForm, setSaleForm] = useState(emptySale);
  const [batchForm, setBatchForm] = useState(emptyBatch);
  const [expenseForm, setExpenseForm] = useState(emptyExpense);
  const [ambassadorDraft, setAmbassadorDraft] = useState<Partial<Ambassador>>({});
  const [editingSaleId, setEditingSaleId] = useState<string | null>(null);
  const [editingAmbassadorId, setEditingAmbassadorId] = useState<string | null>(null);
  const [message, setMessage] = useState<string>("");

  const currentRole: Role | null = activeUser?.role ?? null;
  const currentAmbassador = activeUser?.ambassadorId
    ? state.ambassadors.find((ambassador) => ambassador.id === activeUser.ambassadorId)
    : null;
  const currentAmbassadorSales = currentAmbassador
    ? ledger.sales.filter(
        (sale) =>
          sale.ambassadorId === currentAmbassador.id ||
          sale.ambassadorCode?.toLowerCase() === currentAmbassador.code.toLowerCase()
      )
    : [];
  const currentAmbassadorCommission = currentAmbassadorSales.reduce(
    (sum, sale) => sum + sale.commissionValue,
    0
  );
  const currentWeekBounds = useMemo(() => getCurrentWeekBounds(new Date()), []);
  const weeklySales = ledger.sales.filter((sale) =>
    isWithinRange(sale.createdAt, currentWeekBounds.start, currentWeekBounds.end)
  );
  const weeklyExpenses = state.expenses.filter((expense) =>
    isWithinRange(expense.createdAt, currentWeekBounds.start, currentWeekBounds.end)
  );
  const weeklyRevenue = weeklySales.reduce((sum, sale) => sum + sale.priceTotal, 0);
  const weeklyCostOfGoods = weeklySales.reduce((sum, sale) => sum + sale.costOfGoods, 0);
  const weeklyCommissionExpenses = weeklyExpenses.filter(
    (expense) => expense.type === "commission" && Boolean(expense.sourceSaleId)
  );
  const weeklyDiscountExpenses = weeklyExpenses.filter(
    (expense) => expense.type === "discount" && Boolean(expense.sourceSaleId)
  );
  const weeklyRegularExpenses = weeklyExpenses.filter(
    (expense) => expense.type !== "commission" && expense.type !== "discount"
  );
  const weeklyLinkedCommissionSaleIds = new Set(
    weeklyCommissionExpenses
      .map((expense) => expense.sourceSaleId)
      .filter((sourceSaleId): sourceSaleId is string => Boolean(sourceSaleId))
  );
  const weeklyLinkedDiscountSaleIds = new Set(
    weeklyDiscountExpenses
      .map((expense) => expense.sourceSaleId)
      .filter((sourceSaleId): sourceSaleId is string => Boolean(sourceSaleId))
  );
  const weeklyLegacyCommissionTotal = weeklySales.reduce((sum, sale) => {
    if (sale.saleType !== "wholesale") {
      return sum;
    }

    if (weeklyLinkedCommissionSaleIds.has(sale.id)) {
      return sum;
    }

    return sum + sale.commissionValue;
  }, 0);
  const weeklyLegacyDiscountTotal = weeklySales.reduce((sum, sale) => {
    if (sale.saleType !== "wholesale") {
      return sum;
    }

    if (weeklyLinkedDiscountSaleIds.has(sale.id)) {
      return sum;
    }

    return sum + sale.clientSavings;
  }, 0);
  const weeklyExpenseTotal =
    weeklyRegularExpenses.reduce((sum, expense) => sum + expense.amount, 0) +
    weeklyCommissionExpenses.reduce((sum, expense) => sum + expense.amount, 0) +
    weeklyDiscountExpenses.reduce((sum, expense) => sum + expense.amount, 0) +
    weeklyLegacyCommissionTotal +
    weeklyLegacyDiscountTotal;
  const weeklyGrossProfit = weeklyRevenue - weeklyCostOfGoods;
  const weeklyNetProfit = weeklyGrossProfit - weeklyExpenseTotal;
  const ambassadorOptions = state.ambassadors.filter((ambassador) => ambassador.active);
  const filteredSales =
    currentRole === "ambassador" && activeUser?.ambassadorId
      ? ledger.sales.filter(
          (sale) => sale.ambassadorId === activeUser.ambassadorId || sale.ambassadorCode === currentAmbassador?.code
        )
      : ledger.sales;

  const salePreviewPrice = saleTotalPrice(
    state.settings,
    saleForm.saleType,
    saleForm.quantity,
    saleForm.wholesaleVariant
  );
  const salePreviewAmbassador =
    saleForm.saleType === "wholesale"
      ? resolveAmbassador(state.ambassadors, {
          ambassadorCode: saleForm.ambassadorCode.trim() || undefined
        })
      : undefined;
  const salePreviewWholesale =
    saleForm.saleType === "wholesale"
      ? saleWholesaleSummary(
          state.settings,
          saleForm.quantity,
          saleForm.wholesaleVariant,
          Boolean(salePreviewAmbassador)
        )
      : null;
  const salePanelOptions: Array<{ key: SaleType; label: string }> = [
    { key: "unit", label: "Unidad" },
    { key: "promo", label: "Promoción" },
    { key: "gift", label: "Regalo" },
    { key: "singleNoAlcohol", label: "Unidad sin licor" },
    { key: "giftNoAlcohol", label: "Regalo sin licor" },
    { key: "wholesale", label: "Venta al por mayor" }
  ];

  function mutateState(next: AppState) {
    setState(next);
    setMessage("Cambios guardados en el almacenamiento local.");
    window.setTimeout(() => setMessage(""), 2500);
  }

  function updateSettings<K extends keyof PricingSettings>(key: K, value: PricingSettings[K]) {
    setState((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        [key]: value
      }
    }));
  }

  function updateTier(
    key: "wholesaleWithAlcoholTiers" | "wholesaleNoAlcoholTiers",
    index: number,
    field: keyof WholesaleTier,
    value: number
  ) {
    setState((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        [key]: prev.settings[key].map((tier, tierIndex) =>
          tierIndex === index
            ? {
                ...tier,
                [field]: value
              }
            : tier
        )
      }
    }));
  }

  function updateOtherBatchItem(itemId: string, field: keyof BatchOtherDraft, value: string | number) {
    setBatchForm((prev) => ({
      ...prev,
      otherItems: prev.otherItems.map((item) =>
        item.id === itemId
          ? {
              ...item,
              [field]: field === "cost" ? Number(value) : value
            }
          : item
      )
    }));
  }

  function addOtherBatchItem() {
    setBatchForm((prev) => ({
      ...prev,
      otherItems: [...prev.otherItems, createOtherBatchItem()]
    }));
  }

  function removeOtherBatchItem(itemId: string) {
    setBatchForm((prev) => ({
      ...prev,
      otherItems: prev.otherItems.filter((item) => item.id !== itemId)
    }));
  }

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

  function saveSale() {
    if (!saleForm.quantity || saleForm.quantity < 1) return;
    if (saleForm.saleType === "wholesale" && saleForm.quantity < 20) return;

    const resolvedVariant = saleVariantForType(saleForm.saleType, saleForm.wholesaleVariant);
    const totalPrice = saleTotalPrice(state.settings, saleForm.saleType, saleForm.quantity, saleForm.wholesaleVariant);
    const ambassador = resolveAmbassador(state.ambassadors, {
      ambassadorCode: saleForm.ambassadorCode.trim() || undefined
    });
    const existingSale = editingSaleId ? state.sales.find((sale) => sale.id === editingSaleId) : undefined;
    const createdAt = existingSale?.createdAt ?? new Date().toISOString();
    const isWholesaleSale = saleForm.saleType === "wholesale";
    const hasWholesaleAmbassador = isWholesaleSale && Boolean(ambassador);
    const wholesaleSelection = isWholesaleSale
      ? resolveWholesaleSelection(state.settings, resolvedVariant, saleForm.quantity)
      : undefined;
    const wholesaleSummary = isWholesaleSale
      ? saleWholesaleSummary(state.settings, saleForm.quantity, saleForm.wholesaleVariant, hasWholesaleAmbassador)
      : null;
    const discountValue = wholesaleSummary?.discountAmount ?? 0;
    const netTotal = wholesaleSummary?.netTotal ?? totalPrice;
    const boostBonusPct =
      hasWholesaleAmbassador && ambassador && isBoostActive(ambassador)
        ? state.settings.boostBonusPct
        : 0;
    const baseCommissionPct = wholesaleSelection?.commissionRate ?? 0;
    const commissionRate = hasWholesaleAmbassador ? baseCommissionPct + boostBonusPct : 0;
    const commissionValue = hasWholesaleAmbassador ? netTotal * commissionRate : 0;
    const discountExpense = editingSaleId
      ? state.expenses.find((expense) => expense.type === "discount" && expense.sourceSaleId === editingSaleId)
      : undefined;
    const commissionExpense = editingSaleId
      ? state.expenses.find(
          (expense) => expense.type === "commission" && expense.sourceSaleId === editingSaleId
        )
      : undefined;
    const discountExpenseId =
      hasWholesaleAmbassador && discountValue > 0
        ? discountExpense?.id ?? `exp-${crypto.randomUUID()}`
        : undefined;
    const commissionExpenseId =
      hasWholesaleAmbassador && commissionValue > 0
        ? commissionExpense?.id ?? `exp-${crypto.randomUUID()}`
        : undefined;

    const nextSale: Sale = {
      id: editingSaleId ?? `sale-${crypto.randomUUID()}`,
      createdAt,
      saleType: saleForm.saleType,
      quantity: saleForm.quantity,
      priceTotal: totalPrice,
      ambassadorId: ambassador?.id,
      ambassadorCode: saleForm.ambassadorCode.trim() || ambassador?.code,
      wholesaleVariant: saleForm.saleType === "wholesale" ? saleForm.wholesaleVariant : resolvedVariant,
      wholesaleDiscountPct: hasWholesaleAmbassador ? wholesaleSelection?.discountPct : 0,
      wholesaleDiscountValue: discountValue,
      wholesaleNetTotal: netTotal,
      wholesaleBaseCommissionPct: hasWholesaleAmbassador ? wholesaleSelection?.commissionRate : 0,
      wholesaleBoostBonusPct: boostBonusPct,
      commissionRate,
      commissionValue,
      discountExpenseId,
      commissionExpenseId,
      note: saleForm.note.trim()
    };

    const nextExpenses = (() => {
      const nextSalesId = nextSale.id;
      const filteredExpenses = state.expenses.filter(
        (expense) =>
          (expense.type !== "commission" && expense.type !== "discount") || expense.sourceSaleId !== nextSalesId
      );

      if (!isWholesaleSale || !hasWholesaleAmbassador || !ambassador) {
        return filteredExpenses;
      }

      const nextExpenseList = [...filteredExpenses];

      if (discountExpenseId && discountValue > 0) {
        const discountEntry = buildDiscountExpense({
          sale: nextSale,
          ambassador,
          discountValue,
          expenseId: discountExpenseId,
          existingExpense: discountExpense
        });
        nextExpenseList.unshift(discountEntry);
      }

      if (commissionExpenseId && commissionValue > 0) {
        const commissionEntry = buildCommissionExpense({
          sale: nextSale,
          ambassador,
          commissionValue,
          expenseId: commissionExpenseId,
          existingExpense: commissionExpense
        });
        nextExpenseList.unshift(commissionEntry);
      }

      return nextExpenseList;
    })();

    const nextSales = editingSaleId
      ? state.sales.map((sale) => (sale.id === editingSaleId ? nextSale : sale))
      : [nextSale, ...state.sales];

    mutateState({ ...state, sales: nextSales, expenses: nextExpenses });
    setSaleForm(emptySale);
    setEditingSaleId(null);
    setPanel("sales");
  }

  function saveBatch() {
    if (!batchForm.label.trim() || batchForm.granizadoCount < 1 || batchForm.granizadoTotalCost < 0) return;

    const validOtherItems = batchForm.otherItems.filter((item) => item.name.trim());
    const otherCost = validOtherItems.reduce((sum, item) => sum + Math.max(item.cost, 0), 0);
    const totalCost = batchForm.granizadoTotalCost + otherCost;
    const unitCost = batchForm.granizadoCount > 0 ? totalCost / batchForm.granizadoCount : 0;

    const batch: ProductionBatch = {
      id: `batch-${crypto.randomUUID()}`,
      createdAt: new Date().toISOString(),
      label: batchForm.label.trim(),
      variant: batchForm.variant,
      unitsProduced: batchForm.granizadoCount,
      totalCost,
      items: [
        {
          id: "granizado-fixed",
          kind: "granizado",
          name: "Granizados",
          quantity: batchForm.granizadoCount,
          unitPrice: unitCost
        },
        ...validOtherItems.map((item) => ({
          id: item.id,
          kind: "other" as const,
          name: item.name.trim(),
          unitPrice: Math.max(item.cost, 0)
        }))
      ],
      notes: batchForm.notes.trim()
    };

    mutateState({ ...state, batches: [batch, ...state.batches] });
    setBatchForm(emptyBatch);
    setPanel("production");
  }

  function saveExpense() {
    if (!expenseForm.description.trim()) return;

    const entry: Expense = {
      id: `exp-${crypto.randomUUID()}`,
      createdAt: new Date().toISOString(),
      category: expenseForm.category.trim(),
      description: expenseForm.description.trim(),
      amount: expenseForm.amount,
      type: expenseForm.type
    };

    mutateState({ ...state, expenses: [entry, ...state.expenses] });
    setExpenseForm(emptyExpense);
    setPanel("expenses");
  }

  function saveAmbassador() {
    const name = ambassadorDraft.name?.trim();
    const code = ambassadorDraft.code?.trim();
    const level = ambassadorDraft.level ?? "nivel0";
    if (!name || !code) return;

    const id = editingAmbassadorId ?? `amb-${crypto.randomUUID()}`;
    const nextAmbassador: Ambassador = {
      id,
      name,
      code,
      level,
      boostActive: Boolean(ambassadorDraft.boostActive),
      boostExpiresAt: ambassadorDraft.boostExpiresAt,
      active: true,
      notes: ambassadorDraft.notes ?? ""
    };

    const nextAmbassadors = editingAmbassadorId
      ? state.ambassadors.map((ambassador) => (ambassador.id === editingAmbassadorId ? nextAmbassador : ambassador))
      : [nextAmbassador, ...state.ambassadors];

    mutateState({ ...state, ambassadors: nextAmbassadors });
    setAmbassadorDraft({});
    setEditingAmbassadorId(null);
    setPanel("ambassadors");
  }

  function toggleAmbassadorBoost(ambassadorId: string) {
    setState((prev) => ({
      ...prev,
      ambassadors: prev.ambassadors.map((ambassador) => {
        if (ambassador.id !== ambassadorId) {
          return ambassador;
        }

        const currentlyActive = isBoostActive(ambassador);

        if (currentlyActive) {
          return {
            ...ambassador,
            boostActive: false,
            boostExpiresAt: undefined
          };
        }

        const boostExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        return {
          ...ambassador,
          boostActive: true,
          boostExpiresAt
        };
      })
    }));
  }

  function resetAll() {
    clearState();
    setState(blankState);
    setSessionId(null);
    setSaleForm(emptySale);
    setBatchForm(emptyBatch);
    setExpenseForm(emptyExpense);
    setAmbassadorDraft({});
    setEditingSaleId(null);
    setEditingAmbassadorId(null);
    setMessage("Base de datos local vaciada y lista para seeding.");
  }

  function loadSaleForEdit(saleId: string) {
    const sale = state.sales.find((entry) => entry.id === saleId);
    if (!sale) return;

    setSaleForm({
      saleType: sale.saleType,
      quantity: sale.quantity,
      wholesaleVariant: sale.wholesaleVariant ?? saleVariantForType(sale.saleType),
      ambassadorCode: sale.ambassadorCode ?? "",
      note: sale.note
    });
    setEditingSaleId(saleId);
    setPanel("sales");
  }

  function loadAmbassadorForEdit(ambassadorId: string) {
    const ambassador = state.ambassadors.find((entry) => entry.id === ambassadorId);
    if (!ambassador) return;

    setAmbassadorDraft(ambassador);
    setEditingAmbassadorId(ambassadorId);
    setPanel("ambassadors");
  }

  const topAmbassadors = useMemo(
    () =>
      state.ambassadors
        .map((ambassador) => {
          const ambassadorSales = ledger.sales.filter(
            (sale) =>
              sale.ambassadorId === ambassador.id ||
              sale.ambassadorCode?.toLowerCase() === ambassador.code.toLowerCase()
          );
          const revenue = ambassadorSales.reduce((sum, sale) => sum + sale.priceTotal, 0);
          const commission = ambassadorSales.reduce((sum, sale) => sum + sale.commissionValue, 0);
          const clientSavings = ambassadorSales.reduce((sum, sale) => sum + sale.clientSavings, 0);
          return {
            ...ambassador,
            revenue,
            commission,
            clientSavings,
            salesCount: ambassadorSales.length
          };
        })
        .sort((a, b) => b.revenue - a.revenue),
    [state.ambassadors, ledger.sales]
  );

  const activeAmbassadorCount = state.ambassadors.length;
  const sidebarItems: Array<{ key: ActivePanel; label: string; icon: ReactNode }> = [
    { key: "sales", label: "Ventas", icon: <BadgeDollarSign size={16} /> },
    { key: "production", label: "Lotes", icon: <Box size={16} /> },
    { key: "expenses", label: "Gastos", icon: <Coins size={16} /> },
    { key: "ambassadors", label: "Embajadores", icon: <Users size={16} /> }
  ];
  if (currentRole === "admin") {
    sidebarItems.push({ key: "settings", label: "Configuración", icon: <Menu size={16} /> });
  }
  const tabItems: Array<{ key: ActivePanel; label: string }> = [
    { key: "sales", label: "Ventas" },
    { key: "production", label: "Lotes" },
    { key: "expenses", label: "Gastos" },
    { key: "ambassadors", label: "Embajadores" }
  ];
  if (currentRole === "admin") {
    tabItems.push({ key: "settings", label: "Configuración" });
  }

  useEffect(() => {
    if (panel === "settings" && currentRole !== "admin") {
      setPanel("sales");
    }
  }, [currentRole, panel]);

  if (!activeUser) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <div className="auth-mark">
            <Sparkles size={18} />
            TRABIX Granizados
          </div>
          <h1>Control operativo para ventas, embajadores y utilidad real.</h1>
          <p>
            No hay datos cargados todavía. Entra con un usuario local vacío para comenzar a
            seedear la app desde cero y probar los flujos.
          </p>

          <div className="demo-grid">
            <button className="demo-user" onClick={() => setSessionId("local-admin")}>
              <strong>Entrar al panel</strong>
              <span>Modo admin local vacío</span>
              <span>Sin seed inicial</span>
            </button>
          </div>

          <p className="auth-footnote">
            La autenticación real con Supabase queda lista para conectar después. Esta versión ya
            funciona como prototipo local operativo.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-card">
          <div className="brand-top">
            <div className="brand-mark">
              <Bot size={18} />
            </div>
            <div>
              <p className="eyebrow">TRABIX</p>
              <h1>Operación de granizados</h1>
            </div>
          </div>
          <p className="brand-copy">
            Ventas, embajadores, inventario FIFO, gastos y utilidad en una sola pantalla.
          </p>
        </div>

        <nav className="nav-list">
          {sidebarItems.map(({ key, label, icon }) => (
            <button
              key={key}
              className={shellClassName(panel === key)}
              onClick={() => setPanel(key as ActivePanel)}
            >
              <span>{icon}</span>
              {label}
            </button>
          ))}
        </nav>

        <div className="side-summary">
          <div className="user-pill">
            <ShieldCheck size={16} />
            <div>
              <strong>{activeUser.name}</strong>
              <span>{activeUser.role === "admin" ? "Admin" : "Embajador"}</span>
            </div>
          </div>
          <div className="mini-stats">
            <div>
              <span>Código</span>
              <strong>{currentAmbassador?.code ?? "N/A"}</strong>
            </div>
            <div>
              <span>Boost</span>
              <strong>{currentAmbassador && isBoostActive(currentAmbassador) ? "Activo" : "Inactivo"}</strong>
            </div>
          </div>
        </div>

        <div className="sidebar-actions">
          <Button variant="secondary" onClick={resetAll}>
            <RefreshCw size={16} />
            Vaciar todo
          </Button>
          {state.users.length > 0 ? (
            <Button
              variant="ghost"
              onClick={() => {
                setSessionId(null);
              }}
            >
              <LogOut size={16} />
              Salir
            </Button>
          ) : null}
        </div>
      </aside>

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
            label="Ingresos"
            value={formatCurrency(ledger.totals.revenue)}
            subtext="Todo lo cobrado por ventas."
            accent="accent-green"
          />
          <MetricCard
            icon={<CheckCircle2 size={18} />}
            label="Utilidad bruta"
            value={formatCurrency(ledger.totals.grossProfit)}
            subtext="Ingresos brutos menos costo FIFO."
            accent="accent-yellow"
          />
          <MetricCard
            icon={<HandCoins size={18} />}
            label="Utilidad neta"
            value={formatCurrency(ledger.totals.netProfit)}
            subtext="Después de descuentos, comisiones y gastos."
            accent="accent-cream"
          />
        </header>

        <section className="tabs-row">
          {tabItems.map(({ key, label }) => (
            <button key={key} className={panel === key ? "tab tab-active" : "tab"} onClick={() => setPanel(key as ActivePanel)}>
              {label}
            </button>
          ))}
        </section>

        {panel === "sales" ? (
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
                        setSaleForm((prev) => ({
                          ...prev,
                          saleType: option.key,
                          ...salePreset(option.key)
                        }))
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
                          onChange={(event) =>
                            updateSaleForm("wholesaleVariant", event.target.value as ProductVariant)
                          }
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
                      Costo FIFO: {formatCurrency(ledger.totals.costOfGoods)} | Descuentos:{" "}
                      {formatCurrency(ledger.totals.discounts)} | Comisiones:{" "}
                      {formatCurrency(ledger.totals.commissions)}
                    </p>
                  </div>
                  <span className="chip">{filteredSales.length} registros</span>
                </div>

                <div className="stack-table">
                  {filteredSales.slice(0, 8).map((sale) => (
                    <article key={sale.id} className="table-row">
                      <div>
                        <strong>{sale.displayLabel}</strong>
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
                              ? `${formatCurrency(sale.priceTotal)} base`
                              : formatCurrency(sale.priceTotal)}
                        </strong>
                        <span>
                          {sale.saleType === "wholesale"
                            ? `Cobro ${formatCurrency(sale.wholesaleNetTotal ?? sale.priceTotal - (sale.wholesaleDiscountValue ?? 0))} · `
                            : ""}
                          Costo {formatCurrency(sale.costOfGoods)} · margen {(sale.margin * 100).toFixed(0)}%
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          </Section>
        ) : null}

        {panel === "production" ? (
          <Section
            eyebrow="FIFO"
            title="Lotes y costeo manual"
            description="Registra la cantidad de granizados y su costo total, luego agrega otros gastos como envío o etiquetas."
            action={undefined}
          >
            <div className="form-grid split">
              <div className="form-card">
                <h3>Nuevo lote</h3>
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

                <Field label="Notas">
                  <TextArea
                    value={batchForm.notes}
                    onChange={(event) => setBatchForm((prev) => ({ ...prev, notes: event.target.value }))}
                  />
                </Field>
                <div className="actions">
                  <Button onClick={saveBatch}>
                    <Plus size={16} />
                    Guardar lote
                  </Button>
                </div>
              </div>

              <div className="table-card">
                <div className="table-head">
                  <div>
                    <h3>Lotes activos</h3>
                    <p>
                      Granizados totales: {ledger.totals.unitsProduced} | Restantes: {ledger.totals.unitsRemaining}
                    </p>
                  </div>
                  <span className="chip">{state.batches.length} lotes</span>
                </div>

                <div className="stack-table">
                  {ledger.batches.map((batch) => (
                    <article key={batch.id} className="table-row">
                      <div>
                        <strong>{batch.label}</strong>
                        <span>
                          {variantLabel(batch.variant)} · {batch.unitsProduced} granizados ·{" "}
                          {formatCurrency(batch.unitCost)} por granizado
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
        ) : null}

        {panel === "expenses" ? (
          <Section
            eyebrow="Gastos"
            title="Registrar gastos mensuales u operativos"
            description="Registra costos fijos del negocio con categorías predeterminadas."
          >
            <div className="form-grid split">
              <div className="form-card">
                <h3>Nuevo gasto</h3>
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
                      onChange={(event) =>
                        setExpenseForm((prev) => ({ ...prev, description: event.target.value }))
                      }
                    />
                  </Field>
                  <Field label="Monto">
                    <Input
                      type="number"
                      min={0}
                      value={expenseForm.amount}
                      onChange={(event) => setExpenseForm((prev) => ({ ...prev, amount: Number(event.target.value) }))}
                    />
                  </Field>
                </div>
                <div className="actions">
                  <Button onClick={saveExpense}>
                    <Plus size={16} />
                    Guardar gasto
                  </Button>
                </div>
              </div>

              <div className="table-card expenses-card">
                <div className="table-head">
                  <div>
                    <h3>Gastos registrados</h3>
                    <p>
                      Mensuales: {formatCurrency(expensesSummary.monthlyTotal)} · Únicos:{" "}
                      {formatCurrency(expensesSummary.oneTimeTotal)} · Descuentos:{" "}
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
        ) : null}

        {panel === "ambassadors" ? (
          <Section
            eyebrow="Embajadores"
            title="Editar embajadores y boost"
            description="Todos los embajadores permanecen activos. El boost se activa por 7 días y se puede cancelar."
            action={
              <div className="section-head-metrics">
                <span className="chip">{activeAmbassadorCount} embajadores</span>
                <span className="chip">{formatCurrency(ledger.totals.revenue)} ingresos</span>
                <span className="chip">{formatCurrency(ledger.totals.investment)} inversión</span>
              </div>
            }
          >
            <div className="form-grid split">
              {currentRole === "admin" ? (
                <div className="form-card">
                  <h3>{editingAmbassadorId ? "Editar embajador" : "Nuevo embajador"}</h3>
                  <div className="grid-2">
                    <Field label="Nombre">
                      <Input
                        value={ambassadorDraft.name ?? ""}
                        onChange={(event) => setAmbassadorDraft((prev) => ({ ...prev, name: event.target.value }))}
                      />
                    </Field>
                    <Field label="Código">
                      <Input
                        value={ambassadorDraft.code ?? ""}
                        onChange={(event) => setAmbassadorDraft((prev) => ({ ...prev, code: event.target.value }))}
                      />
                    </Field>
                    <Field label="Nivel">
                      <Select
                        value={ambassadorDraft.level ?? "nivel0"}
                        onChange={(event) =>
                          setAmbassadorDraft((prev) => ({ ...prev, level: event.target.value as Ambassador["level"] }))
                        }
                      >
                        <option value="nivel0">Nivel 0</option>
                        <option value="plata">Plata</option>
                        <option value="oro">Oro</option>
                        <option value="diamante">Diamante</option>
                      </Select>
                    </Field>
                  </div>
                  <Field label="Notas">
                    <TextArea
                      value={ambassadorDraft.notes ?? ""}
                      onChange={(event) => setAmbassadorDraft((prev) => ({ ...prev, notes: event.target.value }))}
                    />
                  </Field>
                  <div className="actions">
                    <Button onClick={saveAmbassador}>
                      <Plus size={16} />
                      Guardar embajador
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="form-card">
                  <h3>Vista del embajador</h3>
                  <div className="mini-grid">
                    <div className="mini-box">
                      <span>Nombre</span>
                      <strong>{currentAmbassador?.name ?? activeUser.name}</strong>
                    </div>
                    <div className="mini-box">
                      <span>Comisiones</span>
                      <strong>{currentAmbassador ? formatCurrency(currentAmbassadorCommission) : "N/A"}</strong>
                    </div>
                    <div className="mini-box">
                      <span>Boost</span>
                      <strong>{currentAmbassador && isBoostActive(currentAmbassador) ? "Sí" : "No"}</strong>
                    </div>
                    <div className="mini-box">
                      <span>Nivel</span>
                      <strong>{levelLabel(currentAmbassador?.level)}</strong>
                    </div>
                  </div>
                  <p className="section-description">
                    Este panel filtra los datos del embajador actual. El admin controla el boost y las reglas desde
                    configuración.
                  </p>
                </div>
              )}

                <div className="table-card">
                <div className="table-head">
                  <div>
                    <h3>Embajadores</h3>
                    <p>Ranking por ventas y comisión acumulada.</p>
                  </div>
                  <span className="chip">{state.ambassadors.length} perfiles</span>
                </div>

                <div className="stack-table">
                  {topAmbassadors.map((ambassador) => {
                    const boostActive = isBoostActive(ambassador);
                    return (
                      <article key={ambassador.id} className="table-row ambassador-row">
                        <div className="ambassador-row-line ambassador-row-identity">
                          <strong className="ambassador-name">{ambassador.name}</strong>
                          <div className="ambassador-identity-meta">
                            <span>{ambassador.code}</span>
                            <span aria-hidden="true">·</span>
                            <span>{levelLabel(ambassador.level)}</span>
                          </div>
                        </div>
                        <div className="ambassador-row-line ambassador-row-metrics">
                          <div className="ambassador-metric-primary">
                            <span>Descuento clientes</span>
                            <strong>{formatCurrency(ambassador.clientSavings)}</strong>
                          </div>
                          <div>
                            <span>Comisiones</span>
                            <strong>{formatCurrency(ambassador.commission)}</strong>
                          </div>
                          <div>
                            <span>Ventas</span>
                            <strong>{formatCurrency(ambassador.revenue)}</strong>
                          </div>
                        </div>
                        {currentRole === "admin" ? (
                          <div className="ambassador-row-line ambassador-row-actions">
                            <div className="ambassador-actions-line">
                              <Button variant="secondary" onClick={() => loadAmbassadorForEdit(ambassador.id)}>
                                Editar
                              </Button>
                              <Button
                                variant={boostActive ? "danger" : "primary"}
                                onClick={() => toggleAmbassadorBoost(ambassador.id)}
                              >
                                {boostActive && ambassador.boostExpiresAt
                                  ? `Vence ${formatDate(ambassador.boostExpiresAt)}`
                                  : "Boost 7d"}
                              </Button>
                            </div>
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              </div>
            </div>
          </Section>
        ) : null}

        {panel === "settings" && currentRole === "admin" ? (
          <Section
            eyebrow="Configuración"
            title="Precios, mayorista y comisiones"
            description="Aquí el admin cambia todo lo que afecta el cálculo automático de ventas, los niveles y la tabla mayorista."
          >
            <div className="form-grid split">
              <div className="form-card">
                <h3>Precios base</h3>
                <div className="grid-2">
                  <Field label="Unidad con licor">
                    <Input
                      type="number"
                      min={0}
                      value={state.settings.unitWithAlcoholPrice}
                      onChange={(event) => updateSettings("unitWithAlcoholPrice", Number(event.target.value))}
                    />
                  </Field>
                  <Field label="Unidad sin licor">
                    <Input
                      type="number"
                      min={0}
                      value={state.settings.unitNoAlcoholPrice}
                      onChange={(event) => updateSettings("unitNoAlcoholPrice", Number(event.target.value))}
                    />
                  </Field>
                  <Field label="Promoción" hint="1 promo = 2 unidades">
                    <Input
                      type="number"
                      min={0}
                      value={state.settings.promoPackagePrice}
                      onChange={(event) => updateSettings("promoPackagePrice", Number(event.target.value))}
                    />
                  </Field>
                  <Field label="Boost extra">
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      value={state.settings.boostBonusPct * 100}
                      onChange={(event) =>
                        updateSettings("boostBonusPct", Number(event.target.value) / 100)
                      }
                    />
                  </Field>
                </div>
              </div>

              <div className="form-card">
                <h3>Mayorista con licor</h3>
                <div className="tier-list">
                  {state.settings.wholesaleWithAlcoholTiers.map((tier, index) => (
                    <div key={`with-${index}`} className="tier-row">
                      <Field label="Desde">
                        <Input
                          type="number"
                          min={0}
                          value={tier.minQuantity}
                          onChange={(event) =>
                            updateTier(
                              "wholesaleWithAlcoholTiers",
                              index,
                              "minQuantity",
                              Number(event.target.value)
                            )
                          }
                        />
                      </Field>
                      <Field label="Precio unidad">
                        <Input
                          type="number"
                          min={0}
                          value={tier.unitPrice}
                          onChange={(event) =>
                            updateTier(
                              "wholesaleWithAlcoholTiers",
                              index,
                              "unitPrice",
                              Number(event.target.value)
                            )
                          }
                        />
                      </Field>
                      <Field label="Comisión %">
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          value={tier.commissionPct * 100}
                          onChange={(event) =>
                            updateTier(
                              "wholesaleWithAlcoholTiers",
                              index,
                              "commissionPct",
                              Number(event.target.value) / 100
                            )
                          }
                        />
                      </Field>
                      <Field label="Descuento %">
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          value={tier.clientDiscountPct * 100}
                          onChange={(event) =>
                            updateTier(
                              "wholesaleWithAlcoholTiers",
                              index,
                              "clientDiscountPct",
                              Number(event.target.value) / 100
                            )
                          }
                        />
                      </Field>
                    </div>
                  ))}
                </div>

                <h3 style={{ marginTop: "1rem" }}>Mayorista sin licor</h3>
                <div className="tier-list">
                  {state.settings.wholesaleNoAlcoholTiers.map((tier, index) => (
                    <div key={`without-${index}`} className="tier-row">
                      <Field label="Desde">
                        <Input
                          type="number"
                          min={0}
                          value={tier.minQuantity}
                          onChange={(event) =>
                            updateTier(
                              "wholesaleNoAlcoholTiers",
                              index,
                              "minQuantity",
                              Number(event.target.value)
                            )
                          }
                        />
                      </Field>
                      <Field label="Precio unidad">
                        <Input
                          type="number"
                          min={0}
                          value={tier.unitPrice}
                          onChange={(event) =>
                            updateTier(
                              "wholesaleNoAlcoholTiers",
                              index,
                              "unitPrice",
                              Number(event.target.value)
                            )
                          }
                        />
                      </Field>
                      <Field label="Comisión %">
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          value={tier.commissionPct * 100}
                          onChange={(event) =>
                            updateTier(
                              "wholesaleNoAlcoholTiers",
                              index,
                              "commissionPct",
                              Number(event.target.value) / 100
                            )
                          }
                        />
                      </Field>
                      <Field label="Descuento %">
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          value={tier.clientDiscountPct * 100}
                          onChange={(event) =>
                            updateTier(
                              "wholesaleNoAlcoholTiers",
                              index,
                              "clientDiscountPct",
                              Number(event.target.value) / 100
                            )
                          }
                        />
                      </Field>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Section>
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
              <span>Ingresos</span>
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
              <span>Gastos</span>
              <strong>{formatCurrency(weeklyExpenseTotal)}</strong>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
