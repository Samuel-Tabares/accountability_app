import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveFifoCost } from "@/src/lib/fifo";
import type { ProductVariant } from "@/src/lib/types";

export type ConsignmentSaleResult = {
  saleId: string | null;
  error: string | null;
};

export type CreateConsignmentSaleOptions = {
  clientId?: string | null;
  consumeStock?: boolean;
};

// Creates a sale row of type 'consignment'.
// - quantity: units delivered (drives FIFO consumption when consumeStock=true).
// - amount: monetary amount to record as revenue.
// - clientId: link the sale to a consignment client (traceability).
// - consumeStock=false: used when charging the difference at pickup — no FIFO
//   consumption, no sale_batch_consumptions, cost_of_goods=0. The stock was
//   already consumed at delivery time.
export async function createConsignmentSale(
  adminClient: SupabaseClient,
  userId: string,
  variant: ProductVariant,
  quantity: number,
  amount: number,
  options: CreateConsignmentSaleOptions = {}
): Promise<ConsignmentSaleResult> {
  const consumeStock = options.consumeStock ?? true;
  const clientId = options.clientId ?? null;

  if (quantity <= 0 && amount <= 0) {
    return { saleId: null, error: null };
  }

  const fifo = consumeStock && quantity > 0
    ? await resolveFifoCost(adminClient, variant, quantity)
    : { totalCost: 0, rows: [] };

  const grossProfit = amount - fifo.totalCost;

  const { data: sale, error: saleError } = await adminClient
    .from("sales")
    .insert({
      created_by: userId,
      sale_type: "consignment",
      wholesale_variant: variant,
      quantity,
      amount,
      price_total: amount,
      wholesale_net_total: amount,
      cost_of_goods: fifo.totalCost,
      gross_profit: grossProfit,
      net_profit: grossProfit,
      margin: amount > 0 ? grossProfit / amount : 0,
      consignment_client_id: clientId
    })
    .select("id")
    .single();

  if (saleError || !sale) {
    return { saleId: null, error: saleError?.message ?? "No se pudo crear la venta de consignación." };
  }

  if (fifo.rows.length > 0) {
    const { error: consumptionError } = await adminClient.from("sale_batch_consumptions").insert(
      fifo.rows.map((row) => ({
        sale_id: sale.id,
        batch_id: row.batch_id,
        units: row.units,
        cost: row.cost
      }))
    );

    if (consumptionError) {
      await adminClient.from("sales").delete().eq("id", sale.id);
      return { saleId: null, error: consumptionError.message };
    }
  }

  return { saleId: sale.id, error: null };
}
