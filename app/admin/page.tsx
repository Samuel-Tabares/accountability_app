import { redirect } from "next/navigation";
import AdminDashboard from "./admin-dashboard";
import { requireAuthContext } from "@/src/lib/auth";
import { pricingRowsToSettings } from "@/src/lib/pricing";
import { blankState } from "@/src/lib/seed";
import { createSupabaseAdminClient } from "@/src/lib/supabase/admin";
import type {
  ExpenseRow,
  PricingVersionRow,
  PricingWholesaleTierRow,
  ProductionBatchItemRow,
  ProductionBatchRow,
  ProfileRow,
  SaleRow
} from "@/src/lib/supabase/types";
import type { Ambassador, AppState, BatchLineItem, Expense, ProductionBatch, Sale } from "@/src/lib/types";

type Props = {
  searchParams?: Promise<{
    error?: string;
    notice?: string;
  }>;
};

function adminMessage(error?: string, notice?: string) {
  if (error === "not_authenticated") return "Inicia sesión para continuar.";
  if (error === "not_authorized") return "No tienes permisos para esa acción.";
  if (error === "profile_failed") return "No se pudo actualizar el embajador.";
  if (error === "invalid_embajador") return "Revisa código, nombre y teléfono.";
  if (error === "embajador_failed") return "No se pudo crear el embajador.";
  if (error === "missing_profile") return "Selecciona un perfil válido.";
  if (error === "invalid_sale") return "Revisa la venta antes de guardarla.";
  if (error === "sale_failed") return "No se pudo guardar la venta.";
  if (error === "invalid_expense") return "Revisa el gasto antes de guardarlo.";
  if (error === "expense_failed") return "No se pudo guardar el gasto.";
  if (notice === "embajador_created") return "Embajador creado correctamente.";
  return "";
}

function profileName(profile: ProfileRow) {
  return profile.full_name ?? profile.username;
}

function mapAmbassador(profile: ProfileRow): Ambassador {
  return {
    id: profile.id,
    name: profileName(profile),
    code: profile.ambassador_id ?? profile.username,
    level: profile.level ?? "nivel0",
    boostActive: false,
    active: profile.is_active,
    notes: profile.phone ?? ""
  };
}

function mapSale(row: SaleRow, profilesById: Map<string, ProfileRow>): Sale {
  const ambassador = row.ambassador_profile_id ? profilesById.get(row.ambassador_profile_id) : undefined;
  const amount = Number(row.amount);

  return {
    id: row.id,
    createdAt: row.created_at,
    saleType: row.sale_type ?? "unit",
    quantity: row.quantity,
    priceTotal: Number(row.price_total ?? amount),
    ambassadorId: row.ambassador_profile_id ?? undefined,
    ambassadorCode: ambassador?.ambassador_id ?? ambassador?.username,
    wholesaleVariant: row.wholesale_variant ?? undefined,
    wholesaleDiscountPct: Number(row.wholesale_discount_pct ?? 0),
    wholesaleDiscountValue: Number(row.wholesale_discount_value ?? 0),
    wholesaleNetTotal: Number(row.wholesale_net_total ?? amount),
    wholesaleBaseCommissionPct: Number(row.wholesale_base_commission_pct ?? 0),
    wholesaleBoostBonusPct: Number(row.wholesale_boost_bonus_pct ?? 0),
    commissionRate: Number(row.commission_rate ?? 0),
    commissionValue: Number(row.commission_value ?? 0),
    costOfGoods: Number(row.cost_of_goods ?? 0),
    grossProfit: Number(row.gross_profit ?? 0),
    margin: Number(row.margin ?? 0),
    pricingVersionId: row.pricing_version_id ?? undefined,
    note: row.note ?? ""
  };
}

function mapExpense(row: ExpenseRow, profilesById: Map<string, ProfileRow>): Expense {
  const ambassador = row.ambassador_profile_id ? profilesById.get(row.ambassador_profile_id) : undefined;

  return {
    id: row.id,
    createdAt: row.created_at,
    category: row.category,
    description: row.description,
    amount: Number(row.amount),
    type: row.expense_type,
    ambassadorId: row.ambassador_profile_id ?? undefined,
    ambassadorCode: ambassador?.ambassador_id ?? ambassador?.username
  };
}

function mapBatch(row: ProductionBatchRow, itemsByBatch: Map<string, ProductionBatchItemRow[]>): ProductionBatch {
  const items = (itemsByBatch.get(row.id) ?? []).map<BatchLineItem>((item) => ({
    id: item.id,
    kind: item.kind,
    name: item.name,
    quantity: item.quantity ?? undefined,
    unitPrice: Number(item.unit_price)
  }));

  return {
    id: row.id,
    createdAt: row.created_at,
    label: row.label,
    variant: row.variant,
    unitsProduced: row.units_produced,
    totalCost: Number(row.total_cost),
    items,
    notes: row.notes ?? ""
  };
}

export default async function AdminPage({ searchParams }: Props) {
  const auth = await requireAuthContext("admin");
  const params = await searchParams;
  const supabase = createSupabaseAdminClient();

  const [profilesResult, salesResult, expensesResult, batchesResult, batchItemsResult, pricingResult, tiersResult] = await Promise.all([
    supabase.from("profiles").select("*").order("created_at", { ascending: false }),
    supabase.from("sales").select("*").order("created_at", { ascending: false }),
    supabase.from("expenses").select("*").order("created_at", { ascending: false }),
    supabase.from("production_batches").select("*").order("created_at", { ascending: false }),
    supabase.from("production_batch_items").select("*"),
    supabase.from("pricing_versions").select("*").eq("is_active", true).maybeSingle(),
    supabase.from("pricing_wholesale_tiers").select("*")
  ]);

  if (profilesResult.error || salesResult.error || expensesResult.error) {
    redirect("/login?error=profile_missing");
  }

  const profiles = (profilesResult.data ?? []) as ProfileRow[];
  const salesRows = (salesResult.data ?? []) as SaleRow[];
  const expenseRows = (expensesResult.data ?? []) as ExpenseRow[];
  const batches = (batchesResult.data ?? []) as ProductionBatchRow[];
  const batchItems = (batchItemsResult.data ?? []) as ProductionBatchItemRow[];
  const activePricing = pricingResult.data as PricingVersionRow | null;
  const tiers = (tiersResult.data ?? []) as PricingWholesaleTierRow[];
  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
  const itemsByBatch = new Map<string, ProductionBatchItemRow[]>();
  for (const item of batchItems) {
    itemsByBatch.set(item.batch_id, [...(itemsByBatch.get(item.batch_id) ?? []), item]);
  }

  const initialState: AppState = {
    ...blankState,
    ambassadors: profiles.filter((profile) => profile.role === "embajador").map(mapAmbassador),
    batches: batches.map((batch) => mapBatch(batch, itemsByBatch)),
    sales: salesRows.map((sale) => mapSale(sale, profilesById)),
    expenses: expenseRows.map((expense) => mapExpense(expense, profilesById)),
    settings: pricingRowsToSettings(
      activePricing,
      activePricing ? tiers.filter((tier) => tier.pricing_version_id === activePricing.id) : []
    )
  };

  return (
    <AdminDashboard
      initialState={initialState}
      currentUser={{
        id: auth.userId,
        name: auth.profile.full_name ?? auth.profile.username,
        username: auth.profile.username,
        role: "admin"
      }}
      initialMessage={adminMessage(params?.error, params?.notice)}
    />
  );
}
