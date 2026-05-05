"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
  ShieldCheck,
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
import type {
  Ambassador,
  AppState,
  Expense,
  ProductionBatch,
  ProductVariant,
  Sale,
  SaleType,
  PricingSettings,
  WholesaleTier
} from "@/src/lib/types";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes
} from "react";

type ActivePanel = "sales" | "production" | "expenses" | "ambassadors" | "settings";

type DashboardUser = {
  id: string;
  name: string;
  username: string;
  role: "admin";
};

type AmbassadorDraft = Partial<Ambassador> & {
  phone?: string;
  isActive?: boolean;
};

type CreatedCredentials = {
  username: string;
  password: string;
  reason: "created" | "reset";
} | null;

type AdminDashboardProps = {
  initialState: AppState;
  currentUser: DashboardUser;
  initialMessage?: string;
};

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

export default function AdminDashboard({ initialState, currentUser, initialMessage = "" }: AdminDashboardProps) {
  const router = useRouter();
  const [state, setState] = useState<AppState>(initialState);
  const ledger = useMemo(() => calculateLedger(state), [state]);
  const expensesSummary = useMemo(() => summarizeExpenses(state.expenses), [state.expenses]);
  const [panel, setPanel] = useState<ActivePanel>("sales");
  const [saleForm, setSaleForm] = useState(emptySale);
  const [batchForm, setBatchForm] = useState(emptyBatch);
  const [expenseForm, setExpenseForm] = useState(emptyExpense);
  const [ambassadorDraft, setAmbassadorDraft] = useState<AmbassadorDraft>({});
  const [editingSaleId, setEditingSaleId] = useState<string | null>(null);
  const [editingAmbassadorId, setEditingAmbassadorId] = useState<string | null>(null);
  const [message, setMessage] = useState<string>(initialMessage);
  const [createdCredentials, setCreatedCredentials] = useState<CreatedCredentials>(null);

  useEffect(() => {
    setState(initialState);
  }, [initialState]);

  const currentRole = "admin" as const;
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
  const filteredSales = ledger.sales
    .slice()
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

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

  function showMessage(nextMessage: string) {
    setMessage(nextMessage);
    window.setTimeout(() => setMessage(""), 3500);
  }

  async function postForm(path: string, fields: Record<string, string | number | boolean | null | undefined>) {
    const formData = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined && value !== null) {
        formData.set(key, String(value));
      }
    }

    const response = await fetch(path, {
      method: "POST",
      body: formData,
      credentials: "include",
      headers: {
        Accept: "application/json"
      }
    });

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      // Redirect-style handlers may not always return JSON.
    }

    if (!response.ok) {
      const message =
        payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string"
          ? payload.message
          : "No se pudo guardar el cambio.";
      throw new Error(message);
    }

    return payload;
  }

  function refreshDashboard() {
    router.refresh();
  }

  function mutateState(next: AppState) {
    setState(next);
    showMessage("Esta sección todavía no persiste en Supabase.");
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

  async function saveSale() {
    if (!saleForm.quantity || saleForm.quantity < 1) return;
    if (saleForm.saleType === "wholesale" && saleForm.quantity < 20) return;

    const ambassador = resolveAmbassador(state.ambassadors, {
      ambassadorCode: saleForm.ambassadorCode.trim() || undefined
    });
    const noteParts = [
      saleLabel({ saleType: saleForm.saleType, wholesaleVariant: saleForm.wholesaleVariant }),
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
      refreshDashboard();
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "No se pudo guardar la venta.");
    }
  }

  async function saveBatch() {
    if (!batchForm.label.trim() || batchForm.granizadoCount < 1 || batchForm.granizadoTotalCost < 0) return;

    const validOtherItems = batchForm.otherItems.filter((item) => item.name.trim());
    const otherCost = validOtherItems.reduce((sum, item) => sum + Math.max(item.cost, 0), 0);
    const totalCost = batchForm.granizadoTotalCost + otherCost;
    const unitCost = batchForm.granizadoCount > 0 ? totalCost / batchForm.granizadoCount : 0;

    const items = [
      {
        kind: "granizado",
        name: "Granizados",
        quantity: batchForm.granizadoCount,
        unitPrice: unitCost
      },
      ...validOtherItems.map((item) => ({
        kind: "other" as const,
        name: item.name.trim(),
        unitPrice: Math.max(item.cost, 0)
      }))
    ];

    try {
      await postForm("/api/batches", {
        label: batchForm.label.trim(),
        variant: batchForm.variant,
        units_produced: batchForm.granizadoCount,
        total_cost: totalCost,
        items: JSON.stringify(items),
        notes: batchForm.notes.trim()
      });
      setBatchForm(emptyBatch);
      setPanel("production");
      refreshDashboard();
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "No se pudo guardar el lote.");
    }
  }

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
      refreshDashboard();
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "No se pudo guardar el gasto.");
    }
  }

  async function saveAmbassador() {
    const name = ambassadorDraft.name?.trim();
    const code = ambassadorDraft.code?.trim();
    if (!name || !code) return;

    try {
      if (editingAmbassadorId) {
        await postForm("/api/profiles", {
          profile_id: editingAmbassadorId,
          full_name: name,
          phone: ambassadorDraft.phone ?? "",
          is_active: ambassadorDraft.isActive ?? true
        });
        setAmbassadorDraft({});
        setEditingAmbassadorId(null);
        refreshDashboard();
        return;
      }

      const payload = await postForm("/api/embajadores", {
        code,
        full_name: name,
        phone: ambassadorDraft.phone ?? ""
      });
      if (payload && typeof payload === "object" && "username" in payload && "password" in payload) {
        setCreatedCredentials({
          username: String(payload.username),
          password: String(payload.password),
          reason: "created"
        });
      }
      setAmbassadorDraft({});
      setPanel("ambassadors");
      showMessage("Embajador creado. Comparte las credenciales antes de refrescar.");
      refreshDashboard();
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "No se pudo guardar el embajador.");
    }
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

  async function resetAmbassadorPassword(ambassador: Ambassador) {
    try {
      const payload = await postForm("/api/embajadores/reset-password", {
        profile_id: ambassador.id
      });

      if (payload && typeof payload === "object" && "username" in payload && "password" in payload) {
        setCreatedCredentials({
          username: String(payload.username),
          password: String(payload.password),
          reason: "reset"
        });
      }

      showMessage("Contraseña temporal generada. Compártela antes de refrescar.");
      setPanel("ambassadors");
      refreshDashboard();
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "No se pudo resetear la contraseña.");
    }
  }

  async function saveSettings() {
    try {
      await postForm("/api/settings", {
        unit_with_alcohol_price: state.settings.unitWithAlcoholPrice,
        unit_no_alcohol_price: state.settings.unitNoAlcoholPrice,
        promo_package_price: state.settings.promoPackagePrice,
        gift_with_alcohol_price: state.settings.giftWithAlcoholPrice,
        gift_no_alcohol_price: state.settings.giftNoAlcoholPrice,
        boost_bonus_pct: state.settings.boostBonusPct,
        wholesale_with_alcohol_tiers: JSON.stringify(state.settings.wholesaleWithAlcoholTiers),
        wholesale_no_alcohol_tiers: JSON.stringify(state.settings.wholesaleNoAlcoholTiers)
      });
      showMessage("Configuración guardada como nueva versión.");
      refreshDashboard();
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "No se pudo guardar la configuración.");
    }
  }

  function resetAll() {
    setSaleForm(emptySale);
    setBatchForm(emptyBatch);
    setExpenseForm(emptyExpense);
    setAmbassadorDraft({});
    setEditingSaleId(null);
    setEditingAmbassadorId(null);
    setCreatedCredentials(null);
    showMessage("Se limpiaron los formularios. Los datos reales de Supabase no se vacían desde este panel.");
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

    setAmbassadorDraft({
      ...ambassador,
      phone: ambassador.notes,
      isActive: ambassador.active
    });
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

  const activeAmbassadorCount = state.ambassadors.filter((ambassador) => ambassador.active).length;
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
              <strong>{currentUser.name}</strong>
              <span>Admin</span>
            </div>
          </div>
          <div className="mini-stats">
            <div>
              <span>Código</span>
              <strong>N/A</strong>
            </div>
            <div>
              <span>Boost</span>
              <strong>Inactivo</strong>
            </div>
          </div>
        </div>

        <div className="sidebar-actions">
          <Button variant="secondary" onClick={resetAll}>
            Vaciar todo
          </Button>
          <Button variant="ghost" onClick={signOut}>
            <LogOut size={16} />
            Cerrar sesión
          </Button>
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

        {message ? <p className="auth-banner">{message}</p> : null}

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
            title="Embajadores y accesos"
            description="El código define el usuario. El sistema genera la contraseña temporal y obliga a cambiarla en el primer acceso."
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
                    <Field label="Código">
                      <Input
                        value={ambassadorDraft.code ?? ""}
                        disabled={Boolean(editingAmbassadorId)}
                        onChange={(event) =>
                          setAmbassadorDraft((prev) => ({
                            ...prev,
                            code: event.target.value
                          }))
                        }
                      />
                    </Field>
                    <Field label="Usuario generado">
                      <Input value={ambassadorDraft.code ?? ""} disabled />
                    </Field>
                    <Field label="Nombre completo">
                      <Input
                        value={ambassadorDraft.name ?? ""}
                        onChange={(event) => setAmbassadorDraft((prev) => ({ ...prev, name: event.target.value }))}
                      />
                    </Field>
                    <Field label="Teléfono">
                      <Input
                        type="tel"
                        value={ambassadorDraft.phone ?? ""}
                        onChange={(event) => setAmbassadorDraft((prev) => ({ ...prev, phone: event.target.value }))}
                      />
                    </Field>
                    {editingAmbassadorId ? (
                      <Field label="Activo">
                        <Select
                          value={String(ambassadorDraft.isActive ?? true)}
                          onChange={(event) =>
                            setAmbassadorDraft((prev) => ({ ...prev, isActive: event.target.value === "true" }))
                          }
                        >
                          <option value="true">Sí</option>
                          <option value="false">No</option>
                        </Select>
                      </Field>
                    ) : null}
                    <Field label="Nivel inicial">
                      <Input value="Nivel 0" disabled />
                    </Field>
                  </div>
                  <p className="section-description">
                    La contraseña temporal se muestra solo una vez al crear o resetear. Después del login el embajador debe cambiarla.
                  </p>
                  {createdCredentials ? (
                    <div className="mini-grid" style={{ marginBottom: "1rem" }}>
                      <div className="mini-box">
                        <span>Origen</span>
                        <strong>{createdCredentials.reason === "reset" ? "Reset" : "Nuevo"}</strong>
                      </div>
                      <div className="mini-box">
                        <span>Usuario/código</span>
                        <strong>{createdCredentials.username}</strong>
                      </div>
                      <div className="mini-box">
                        <span>Contraseña inicial</span>
                        <strong>{createdCredentials.password}</strong>
                      </div>
                    </div>
                  ) : null}
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
                      <strong>{currentUser.name}</strong>
                    </div>
                    <div className="mini-box">
                      <span>Comisiones</span>
                      <strong>N/A</strong>
                    </div>
                    <div className="mini-box">
                      <span>Boost</span>
                      <strong>No</strong>
                    </div>
                    <div className="mini-box">
                      <span>Nivel</span>
                      <strong>{levelLabel()}</strong>
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
                                variant="secondary"
                                onClick={() => resetAmbassadorPassword(ambassador)}
                              >
                                Reset clave
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
            action={
              <Button onClick={saveSettings}>
                <CheckCircle2 size={16} />
                Guardar configuración
              </Button>
            }
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
