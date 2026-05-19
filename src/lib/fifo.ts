import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProductVariant } from "@/src/lib/types";
import type { ProductionBatchRow } from "@/src/lib/supabase/types";

export type FifoRow = { batch_id: string; units: number; cost: number };
export type FifoResult = { totalCost: number; rows: FifoRow[] };

export async function resolveFifoCost(
  adminClient: SupabaseClient,
  variant: ProductVariant,
  units: number
): Promise<FifoResult> {
  if (units <= 0) {
    return { totalCost: 0, rows: [] };
  }

  const [batchesResult, consumptionsResult] = await Promise.all([
    adminClient
      .from("production_batches")
      .select("*")
      .eq("variant", variant)
      .order("created_at", { ascending: true }),
    adminClient.from("sale_batch_consumptions").select("batch_id, units")
  ]);

  const batches = (batchesResult.data ?? []) as ProductionBatchRow[];
  const consumedByBatch = new Map<string, number>();
  for (const row of consumptionsResult.data ?? []) {
    const batchId = row.batch_id;
    if (!batchId) continue;
    consumedByBatch.set(batchId, (consumedByBatch.get(batchId) ?? 0) + Number(row.units));
  }

  let remaining = units;
  let totalCost = 0;
  const rows: FifoRow[] = [];

  for (const batch of batches) {
    if (remaining <= 0) break;
    const alreadyConsumed = consumedByBatch.get(batch.id) ?? 0;
    const available = Math.max(0, batch.units_produced - alreadyConsumed);
    if (available <= 0) continue;

    const take = Math.min(available, remaining);
    const cost = take * (Number(batch.total_cost) / batch.units_produced);
    rows.push({ batch_id: batch.id, units: take, cost });
    totalCost += cost;
    remaining -= take;
  }

  return { totalCost, rows };
}
