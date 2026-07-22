import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProductVariant } from "@/src/lib/types";
import type { ProductionBatchRow } from "@/src/lib/supabase/types";

export type FifoRow = { batch_id: string; units: number; cost: number };
export type FifoResult = {
  totalCost: number;
  rows: FifoRow[];
  /** Units requested to consume. */
  requested: number;
  /** Units actually covered by available stock (rows sum). */
  covered: number;
  /** Units that could NOT be covered (requested − covered). > 0 means overselling. */
  shortfall: number;
  /** True when stock fully covered the requested units. */
  sufficient: boolean;
};

export async function resolveFifoCost(
  adminClient: SupabaseClient,
  variant: ProductVariant,
  units: number
): Promise<FifoResult> {
  if (units <= 0) {
    return { totalCost: 0, rows: [], requested: units, covered: 0, shortfall: 0, sufficient: true };
  }

  const [batchesResult, consumptionsResult, returnsResult] = await Promise.all([
    adminClient
      .from("production_batches")
      .select("*")
      .eq("variant", variant)
      .order("created_at", { ascending: true }),
    // consumes_stock=false son atribuciones de costo para reportes (p. ej. cobro de
    // faltantes en recogida de consignación) que NO deben restar disponibilidad real.
    adminClient.from("sale_batch_consumptions").select("batch_id, units").eq("consumes_stock", true),
    adminClient.from("inventory_returns").select("batch_id, units")
  ]);

  const batches = (batchesResult.data ?? []) as ProductionBatchRow[];
  const consumedByBatch = new Map<string, number>();
  for (const row of consumptionsResult.data ?? []) {
    const batchId = row.batch_id;
    if (!batchId) continue;
    consumedByBatch.set(batchId, (consumedByBatch.get(batchId) ?? 0) + Number(row.units));
  }

  // Crédito por devoluciones al stock (recogidas de consignación).
  // Sin esto, un lote que recibió returns sigue marcado como consumido y FIFO
  // salta a lotes más nuevos/caros, además de bloquear validaciones de stock.
  const returnedByBatch = new Map<string, number>();
  for (const row of returnsResult.data ?? []) {
    const batchId = row.batch_id;
    if (!batchId) continue;
    returnedByBatch.set(batchId, (returnedByBatch.get(batchId) ?? 0) + Number(row.units));
  }

  let remaining = units;
  let totalCost = 0;
  const rows: FifoRow[] = [];

  for (const batch of batches) {
    if (remaining <= 0) break;
    const alreadyConsumed = consumedByBatch.get(batch.id) ?? 0;
    const returned = returnedByBatch.get(batch.id) ?? 0;
    const available = Math.max(0, batch.units_produced - alreadyConsumed + returned);
    if (available <= 0) continue;

    const take = Math.min(available, remaining);
    const cost = take * (Number(batch.total_cost) / batch.units_produced);
    rows.push({ batch_id: batch.id, units: take, cost });
    totalCost += cost;
    remaining -= take;
  }

  const covered = units - remaining;
  return {
    totalCost,
    rows,
    requested: units,
    covered,
    shortfall: Math.max(0, remaining),
    sufficient: remaining <= 0
  };
}

export type ActiveBatch = {
  id: string;
  label: string;
  variant: ProductVariant;
};

// El "lote activo" para efectos de gastos manuales: el más viejo (entre ambas
// variantes) que todavía tenga stock disponible. Normalmente coincide con el
// lote que se está vendiendo hoy — es donde un gasto operativo (transporte,
// insumos, sueldos) causa utilidad real. Si no queda stock en ningún lote,
// cae al lote más reciente (mejor a asignar ahí que quedar huérfano).
export async function resolveActiveProductionBatch(adminClient: SupabaseClient): Promise<ActiveBatch | null> {
  const [batchesResult, consumptionsResult, returnsResult] = await Promise.all([
    adminClient.from("production_batches").select("id, label, variant, units_produced").order("created_at", { ascending: true }),
    adminClient.from("sale_batch_consumptions").select("batch_id, units").eq("consumes_stock", true),
    adminClient.from("inventory_returns").select("batch_id, units")
  ]);

  const batches = (batchesResult.data ?? []) as Array<Pick<ProductionBatchRow, "id" | "label" | "variant" | "units_produced">>;
  if (batches.length === 0) return null;

  const consumedByBatch = new Map<string, number>();
  for (const row of consumptionsResult.data ?? []) {
    if (!row.batch_id) continue;
    consumedByBatch.set(row.batch_id, (consumedByBatch.get(row.batch_id) ?? 0) + Number(row.units));
  }
  const returnedByBatch = new Map<string, number>();
  for (const row of returnsResult.data ?? []) {
    if (!row.batch_id) continue;
    returnedByBatch.set(row.batch_id, (returnedByBatch.get(row.batch_id) ?? 0) + Number(row.units));
  }

  for (const batch of batches) {
    const consumed = consumedByBatch.get(batch.id) ?? 0;
    const returned = returnedByBatch.get(batch.id) ?? 0;
    const remaining = batch.units_produced - consumed + returned;
    if (remaining > 0) {
      return { id: batch.id, label: batch.label, variant: batch.variant };
    }
  }

  const newest = batches[batches.length - 1];
  return { id: newest.id, label: newest.label, variant: newest.variant };
}
