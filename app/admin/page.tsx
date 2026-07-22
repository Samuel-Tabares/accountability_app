import { redirect } from "next/navigation";
import AdminDashboard from "./admin-dashboard";
import { requireAuthContext } from "@/src/lib/auth";
import { pricingRowsToSettings } from "@/src/lib/pricing";
import { blankState } from "@/src/lib/seed";
import { createSupabaseAdminClient } from "@/src/lib/supabase/admin";
import { computeAllClientsStockBreakdown } from "@/src/lib/consignment-traceability";
import type {
  CompanyInfoRow,
  ConsignmentClientRow,
  ConsignmentPickupRow,
  ConsignmentReactivationRow,
  ConsignmentReplenishmentRow,
  ExpenseRow,
  InventoryReturnRow,
  PricingVersionRow,
  PricingWholesaleTierRow,
  ProductionBatchItemRow,
  ProductionBatchRow,
  ProfileRow,
  SaleBatchConsumptionRow,
  SaleRow
} from "@/src/lib/supabase/types";
import type {
  Ambassador,
  AppState,
  BatchLineItem,
  CompanyInfo,
  ConsignmentClient,
  ConsignmentPickup,
  ConsignmentReactivation,
  ConsignmentReplenishment,
  Expense,
  InventoryReturn,
  ProductionBatch,
  Sale,
  SaleBatchConsumption
} from "@/src/lib/types";

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
  if (error === "insufficient_stock") return "Stock insuficiente para esa venta. Registra producción antes de vender.";
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
    boostActive: profile.boost_active ?? false,
    boostExpiresAt: profile.boost_expires_at ?? undefined,
    active: profile.is_active,
    notes: profile.phone ?? "",
    createdAt: profile.created_at
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
    netProfit: row.net_profit == null ? undefined : Number(row.net_profit),
    margin: Number(row.margin ?? 0),
    pricingVersionId: row.pricing_version_id ?? undefined,
    consignmentClientId: row.consignment_client_id ?? undefined,
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
    sourceSaleId: row.source_sale_id ?? undefined,
    ambassadorId: row.ambassador_profile_id ?? undefined,
    ambassadorCode: ambassador?.ambassador_id ?? ambassador?.username,
    batchId: row.batch_id ?? undefined
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

function mapConsignmentClient(row: ConsignmentClientRow): ConsignmentClient {
  return {
    id: row.id,
    createdAt: row.created_at,
    name: row.name,
    address: row.address,
    contactName: row.contact_name ?? undefined,
    phone: row.phone ?? undefined,
    notes: row.notes ?? undefined,
    baseQuantityWithAlcohol: row.base_quantity_with_alcohol,
    baseQuantityWithoutAlcohol: row.base_quantity_without_alcohol,
    priceWithAlcohol: row.price_with_alcohol ?? undefined,
    priceWithoutAlcohol: row.price_without_alcohol ?? undefined,
    nextReplenishmentDate: row.next_replenishment_date,
    initialSaleIdWithAlcohol: row.initial_sale_id_with_alcohol ?? undefined,
    initialSaleIdWithoutAlcohol: row.initial_sale_id_without_alcohol ?? undefined
  };
}

function mapConsignmentReplenishment(row: ConsignmentReplenishmentRow): ConsignmentReplenishment {
  return {
    id: row.id,
    createdAt: row.created_at,
    clientId: row.client_id,
    unitsDeliveredWithAlcohol: row.units_delivered_with_alcohol,
    unitsDeliveredWithoutAlcohol: row.units_delivered_without_alcohol,
    unitPriceWithAlcohol: Number(row.unit_price_with_alcohol),
    unitPriceWithoutAlcohol: Number(row.unit_price_without_alcohol),
    amountCharged: Number(row.amount_charged),
    newBaseWithAlcohol: row.new_base_with_alcohol,
    newBaseWithoutAlcohol: row.new_base_without_alcohol,
    previousBaseWithAlcohol: row.previous_base_with_alcohol ?? undefined,
    previousBaseWithoutAlcohol: row.previous_base_without_alcohol ?? undefined,
    notes: row.notes ?? undefined,
    saleIdWithAlcohol: row.sale_id_with_alcohol ?? undefined,
    saleIdWithoutAlcohol: row.sale_id_without_alcohol ?? undefined
  };
}

function mapConsignmentPickup(row: ConsignmentPickupRow): ConsignmentPickup {
  return {
    id: row.id,
    createdAt: row.created_at,
    clientId: row.client_id,
    unitsCollectedWithAlcohol: row.units_collected_with_alcohol,
    unitsCollectedWithoutAlcohol: row.units_collected_without_alcohol,
    unitsChargedWithAlcohol: row.units_charged_with_alcohol,
    unitsChargedWithoutAlcohol: row.units_charged_without_alcohol,
    unitPriceWithAlcohol: Number(row.unit_price_with_alcohol),
    unitPriceWithoutAlcohol: Number(row.unit_price_without_alcohol),
    amountCharged: Number(row.amount_charged),
    saleIdWithAlcohol: row.sale_id_with_alcohol ?? undefined,
    saleIdWithoutAlcohol: row.sale_id_without_alcohol ?? undefined,
    notes: row.notes ?? undefined
  };
}

function mapConsignmentReactivation(row: ConsignmentReactivationRow): ConsignmentReactivation {
  return {
    id: row.id,
    createdAt: row.created_at,
    clientId: row.client_id,
    unitsWithAlcohol: row.units_with_alcohol,
    unitsWithoutAlcohol: row.units_without_alcohol,
    unitPriceWithAlcohol: Number(row.unit_price_with_alcohol),
    unitPriceWithoutAlcohol: Number(row.unit_price_without_alcohol),
    saleIdWithAlcohol: row.sale_id_with_alcohol ?? undefined,
    saleIdWithoutAlcohol: row.sale_id_without_alcohol ?? undefined,
    notes: row.notes ?? undefined
  };
}

function mapCompanyInfo(row: CompanyInfoRow | null): CompanyInfo {
  if (!row) {
    return {
      legalName: "TRABIX GRANIZADOS S.A.S.",
      nit: "109,245,650-1",
      address: "Armenia, Quindío - Colombia",
      phone: "+57 304 353 5455",
      taxStatus: "No responsable de IVA",
      sanitaryRegistry: "RSA-0028762-2023"
    };
  }
  return {
    legalName: row.legal_name,
    nit: row.nit,
    address: row.address,
    phone: row.phone,
    taxStatus: row.tax_status,
    sanitaryRegistry: row.sanitary_registry ?? undefined
  };
}

function mapInventoryReturn(row: InventoryReturnRow): InventoryReturn {
  return {
    id: row.id,
    createdAt: row.created_at,
    batchId: row.batch_id,
    variant: row.variant,
    units: row.units,
    sourcePickupId: row.source_pickup_id ?? undefined,
    sourceClientId: row.source_client_id ?? undefined,
    notes: row.notes ?? undefined
  };
}

function mapSaleBatchConsumption(row: SaleBatchConsumptionRow): SaleBatchConsumption {
  return {
    saleId: row.sale_id,
    batchId: row.batch_id,
    units: Number(row.units),
    cost: Number(row.cost),
    consumesStock: row.consumes_stock !== false
  };
}

export default async function AdminPage({ searchParams }: Props) {
  const auth = await requireAuthContext("admin");
  const params = await searchParams;
  const supabase = createSupabaseAdminClient();

  const [
    profilesResult,
    salesResult,
    expensesResult,
    batchesResult,
    batchItemsResult,
    pricingResult,
    tiersResult,
    consignmentClientsResult,
    consignmentReplenishmentsResult,
    consignmentPickupsResult,
    consignmentReactivationsResult,
    inventoryReturnsResult,
    saleBatchConsumptionsResult,
    companyInfoResult,
    ambassadorPayoutsResult
  ] = await Promise.all([
    supabase.from("profiles").select("*").order("created_at", { ascending: false }),
    supabase.from("sales").select("*").order("created_at", { ascending: false }),
    supabase.from("expenses").select("*").order("created_at", { ascending: false }),
    supabase.from("production_batches").select("*").order("created_at", { ascending: false }),
    supabase.from("production_batch_items").select("*"),
    supabase.from("pricing_versions").select("*").eq("is_active", true).maybeSingle(),
    supabase.from("pricing_wholesale_tiers").select("*"),
    supabase.from("consignment_clients").select("*").order("name", { ascending: true }),
    supabase.from("consignment_replenishments").select("*").order("created_at", { ascending: false }),
    supabase.from("consignment_pickups").select("*").order("created_at", { ascending: false }),
    supabase.from("consignment_reactivations").select("*").order("created_at", { ascending: false }),
    supabase.from("inventory_returns").select("*").order("created_at", { ascending: false }),
    supabase.from("sale_batch_consumptions").select("sale_id, batch_id, units, cost, consumes_stock"),
    supabase.from("company_info").select("*").eq("id", "singleton").maybeSingle(),
    supabase.from("ambassador_payouts").select("*").order("cycle_start", { ascending: false })
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
  const consignmentClientsRows = (consignmentClientsResult.data ?? []) as ConsignmentClientRow[];
  const consignmentReplenishmentsRows = (consignmentReplenishmentsResult.data ?? []) as ConsignmentReplenishmentRow[];
  const consignmentPickupsRows = (consignmentPickupsResult.data ?? []) as ConsignmentPickupRow[];
  const consignmentReactivationsRows = (consignmentReactivationsResult.data ?? []) as ConsignmentReactivationRow[];
  const inventoryReturnsRows = (inventoryReturnsResult.data ?? []) as InventoryReturnRow[];
  const saleBatchConsumptionsRows = (saleBatchConsumptionsResult.data ?? []) as SaleBatchConsumptionRow[];
  const companyInfoRow = (companyInfoResult.data ?? null) as CompanyInfoRow | null;
  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));

  const consignmentStockBreakdown = await computeAllClientsStockBreakdown(
    supabase,
    consignmentClientsRows,
    batches
  );
  const consignmentStockByBatch: Record<string, { units: number; cogs: number }> = {};
  for (const [batchId, entry] of consignmentStockBreakdown.byBatch) {
    consignmentStockByBatch[batchId] = entry;
  }
  const itemsByBatch = new Map<string, ProductionBatchItemRow[]>();
  for (const item of batchItems) {
    itemsByBatch.set(item.batch_id, [...(itemsByBatch.get(item.batch_id) ?? []), item]);
  }

  const initialState: AppState = {
    ...blankState,
    ambassadors: profiles.filter((profile) => profile.role === "embajador").map(mapAmbassador),
    ambassadorPayouts: (ambassadorPayoutsResult.data ?? []).map((row) => ({
      id: String(row.id),
      ambassadorId: String(row.ambassador_profile_id),
      cycleIndex: Number(row.cycle_index ?? 0),
      cycleStart: String(row.cycle_start),
      cycleEnd: String(row.cycle_end),
      units: Number(row.units ?? 0),
      level: (row.level as Ambassador["level"]) ?? "nivel0",
      baseSalary: Number(row.base_salary ?? 0),
      commissions: Number(row.commissions ?? 0),
      freeUnits: Number(row.free_units ?? 0)
    })),
    batches: batches.map((batch) => mapBatch(batch, itemsByBatch)),
    sales: salesRows.map((sale) => mapSale(sale, profilesById)),
    expenses: expenseRows.map((expense) => mapExpense(expense, profilesById)),
    settings: pricingRowsToSettings(
      activePricing,
      activePricing ? tiers.filter((tier) => tier.pricing_version_id === activePricing.id) : []
    ),
    consignmentClients: consignmentClientsRows.map(mapConsignmentClient),
    consignmentReplenishments: consignmentReplenishmentsRows.map(mapConsignmentReplenishment),
    consignmentPickups: consignmentPickupsRows.map(mapConsignmentPickup),
    consignmentReactivations: consignmentReactivationsRows.map(mapConsignmentReactivation),
    inventoryReturns: inventoryReturnsRows.map(mapInventoryReturn),
    saleBatchConsumptions: saleBatchConsumptionsRows.map(mapSaleBatchConsumption),
    consignmentStockCogs: consignmentStockBreakdown.total,
    consignmentStockByBatch,
    companyInfo: mapCompanyInfo(companyInfoRow)
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
