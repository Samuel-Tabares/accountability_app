import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProductVariant } from "@/src/lib/types";
import type { ConsignmentClientRow, ProductionBatchRow } from "@/src/lib/supabase/types";

export type BatchOutstanding = {
  batchId: string;
  units: number;
  batchCreatedAt: string;
};

// Returns the units of `variant` still physically at the client, grouped by batch,
// ordered by batch.created_at ascending (oldest lot first — closest to expiring).
//
// Assumption: the client sells its oldest lots first, so what remains is the
// newest. When we attribute the client's "sold" units across batches we walk
// the lots oldest-first too — the lots that show up as outstanding here are
// the ones that have NOT been sold yet.
export async function computeClientBatchOutstanding(
  admin: SupabaseClient,
  clientId: string,
  variant: ProductVariant
): Promise<BatchOutstanding[]> {
  // 1. Buscar sales para este cliente.
  //    - Nuevas sales (post-migración): consignment_client_id IS NOT NULL
  //    - Antiguas sales (pre-migración): usar initial_sale_id_* del cliente
  //    - Sales de reposiciones: de consignment_replenishments

  const { data: clientRow } = await admin
    .from("consignment_clients")
    .select("initial_sale_id_with_alcohol, initial_sale_id_without_alcohol, base_quantity_with_alcohol, base_quantity_without_alcohol")
    .eq("id", clientId)
    .single();

  const legacyInitialSaleId =
    variant === "withAlcohol"
      ? clientRow?.initial_sale_id_with_alcohol
      : clientRow?.initial_sale_id_without_alcohol;

  // Buscar sales nuevas por consignment_client_id
  const { data: newSalesData } = await admin
    .from("sales")
    .select("id, wholesale_variant, quantity, created_at")
    .eq("consignment_client_id", clientId)
    .eq("sale_type", "consignment")
    .eq("wholesale_variant", variant)
    .gt("quantity", 0);

  // Buscar sale_ids de reposiciones para este cliente
  const replenishmentSaleField =
    variant === "withAlcohol" ? "sale_id_with_alcohol" : "sale_id_without_alcohol";
  const { data: replenishmentsData } = await admin
    .from("consignment_replenishments")
    .select(replenishmentSaleField)
    .eq("client_id", clientId)
    .not(replenishmentSaleField, "is", null);

  const replenishmentSaleIds = (replenishmentsData ?? [])
    .map((r) => (r as Record<string, unknown>)[replenishmentSaleField])
    .filter((id): id is string => Boolean(id));

  // Combinar: nuevas sales + legacy initial + reposiciones
  let saleIds = (newSalesData ?? []).map((s) => s.id as string);
  if (legacyInitialSaleId) {
    saleIds = Array.from(new Set([...saleIds, legacyInitialSaleId]));
  }
  saleIds = Array.from(new Set([...saleIds, ...replenishmentSaleIds]));

  if (saleIds.length === 0) {
    return [];
  }

  // 2. Batch consumptions linked to those sales → delivered-by-batch
  const { data: consumptions } = await admin
    .from("sale_batch_consumptions")
    .select("batch_id, units")
    .in("sale_id", saleIds);

  const deliveredByBatch = new Map<string, number>();
  for (const row of consumptions ?? []) {
    if (!row.batch_id) continue;
    deliveredByBatch.set(row.batch_id, (deliveredByBatch.get(row.batch_id) ?? 0) + Number(row.units));
  }

  // 3. Subtract previous returns (pickups already executed for this client)
  const { data: returns } = await admin
    .from("inventory_returns")
    .select("batch_id, units")
    .eq("source_client_id", clientId)
    .eq("variant", variant);

  for (const row of returns ?? []) {
    if (!row.batch_id) continue;
    const current = deliveredByBatch.get(row.batch_id) ?? 0;
    deliveredByBatch.set(row.batch_id, Math.max(0, current - Number(row.units)));
  }

  // 4. consumedByClient = totalDelivered (post-returns) − currentBase
  // El cliente actualmente tiene `currentBase` unidades. Todo lo que llegó menos lo que quedó = lo que vendió.
  const totalDelivered = Array.from(deliveredByBatch.values()).reduce((s, v) => s + v, 0);
  const currentBase =
    variant === "withAlcohol"
      ? (clientRow?.base_quantity_with_alcohol ?? 0)
      : (clientRow?.base_quantity_without_alcohol ?? 0);
  const consumedByClient = Math.max(0, totalDelivered - currentBase);

  // 5. Fetch batches to order outstanding FIFO by created_at
  const batchIds = Array.from(deliveredByBatch.keys());
  if (batchIds.length === 0) {
    return [];
  }
  const { data: batches } = await admin
    .from("production_batches")
    .select("id, created_at")
    .in("id", batchIds);

  const orderedBatches = (batches ?? [])
    .map((b) => ({ id: b.id as string, createdAt: b.created_at as string }))
    .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));

  // 6. Attribute client consumption FIFO across batches (oldest first)
  let remaining = consumedByClient;
  const outstanding: BatchOutstanding[] = [];
  for (const batch of orderedBatches) {
    const delivered = deliveredByBatch.get(batch.id) ?? 0;
    if (delivered <= 0) continue;
    const consumedHere = Math.min(delivered, remaining);
    const stillThere = delivered - consumedHere;
    remaining -= consumedHere;
    if (stillThere > 0) {
      outstanding.push({ batchId: batch.id, units: stillThere, batchCreatedAt: batch.createdAt });
    }
  }

  return outstanding;
}

// Extrae `units` unidades del outstanding oldest-first, devolviendo:
// - rows: [{ batch_id, units, cost }] que suma a `units` total (o menos si no hay suficiente)
// - totalCost: suma de costos
// El unitCost por lote se calcula con production_batches.total_cost / units_produced.
export async function extractCostFromOutstanding(
  admin: SupabaseClient,
  outstanding: BatchOutstanding[],
  unitsToExtract: number
): Promise<{ totalCost: number; rows: Array<{ batch_id: string; units: number; cost: number }> }> {
  if (unitsToExtract <= 0 || outstanding.length === 0) {
    return { totalCost: 0, rows: [] };
  }

  const batchIds = outstanding.map((o) => o.batchId);
  const { data: batches } = await admin
    .from("production_batches")
    .select("id, units_produced, total_cost")
    .in("id", batchIds);

  const unitCostByBatch = new Map<string, number>();
  for (const b of (batches ?? []) as ProductionBatchRow[]) {
    const produced = b.units_produced || 1;
    unitCostByBatch.set(b.id, Number(b.total_cost) / produced);
  }

  let remaining = unitsToExtract;
  let totalCost = 0;
  const rows: Array<{ batch_id: string; units: number; cost: number }> = [];
  for (const out of outstanding) {
    if (remaining <= 0) break;
    const take = Math.min(out.units, remaining);
    const unitCost = unitCostByBatch.get(out.batchId) ?? 0;
    const cost = take * unitCost;
    rows.push({ batch_id: out.batchId, units: take, cost });
    totalCost += cost;
    remaining -= take;
  }
  return { totalCost, rows };
}

// Suma el costo (FIFO unit cost por lote) del stock que ACTUALMENTE está
// físicamente en clientes de consignación. Se usa server-side en admin/page.tsx
// para poblar `consignmentStockCogs` en el estado del dashboard.
export async function computeAllClientsStockCogs(
  admin: SupabaseClient,
  clients: ConsignmentClientRow[],
  batches: ProductionBatchRow[]
): Promise<number> {
  const unitCostByBatch = new Map<string, number>();
  for (const b of batches) {
    const produced = b.units_produced || 1;
    unitCostByBatch.set(b.id, Number(b.total_cost) / produced);
  }

  let total = 0;
  const variants: ProductVariant[] = ["withAlcohol", "withoutAlcohol"];
  for (const client of clients) {
    const baseWith = client.base_quantity_with_alcohol;
    const baseWithout = client.base_quantity_without_alcohol;
    if (baseWith <= 0 && baseWithout <= 0) continue;

    for (const variant of variants) {
      const base = variant === "withAlcohol" ? baseWith : baseWithout;
      if (base <= 0) continue;
      const outstanding = await computeClientBatchOutstanding(admin, client.id, variant);
      for (const out of outstanding) {
        const unitCost = unitCostByBatch.get(out.batchId) ?? 0;
        total += out.units * unitCost;
      }
    }
  }
  return total;
}
