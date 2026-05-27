import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveFifoCost } from "@/src/lib/fifo";
import type { ProductVariant } from "@/src/lib/types";

// Reintenta una op una sola vez tras una pausa corta. Reduce el riesgo de
// estados parciales por fallas transitorias (red, timeout) sin enmascarar
// errores reales: si el segundo intento también falla, retorna el error.
// Acepta PromiseLike para soportar los thenables de Supabase (query builders).
export async function retryOnce<T>(
  op: () => PromiseLike<T>,
  predicate: (result: T) => boolean
): Promise<T> {
  const first = await op();
  if (predicate(first)) return first;
  await new Promise((r) => setTimeout(r, 200));
  return await op();
}

export type ConsignmentSaleResult = {
  saleId: string | null;
  error: string | null;
};

// Pre-valida disponibilidad de stock para múltiples variantes antes de iniciar
// los inserts. Devuelve `null` si todo OK, o un mensaje de error si alguna
// variante no tiene stock suficiente. Evita estados parciales (variante 1 OK
// consumió stock, variante 2 falló y dejó al cliente creado sin entrega).
export async function validateStockAvailable(
  adminClient: SupabaseClient,
  requests: Array<{ variant: ProductVariant; quantity: number }>
): Promise<string | null> {
  for (const req of requests) {
    if (req.quantity <= 0) continue;
    const fifo = await resolveFifoCost(adminClient, req.variant, req.quantity);
    const fifoUnits = fifo.rows.reduce((s, r) => s + r.units, 0);
    if (fifoUnits < req.quantity) {
      const variantLabel = req.variant === "withAlcohol" ? "con alcohol" : "sin alcohol";
      return `Stock insuficiente: solo hay ${fifoUnits} de ${req.quantity} unidades ${variantLabel} disponibles.`;
    }
  }
  return null;
}

export type CreateConsignmentSaleOptions = {
  clientId?: string | null;
  consumeStock?: boolean;
  // Cuando consumeStock=false (cobro de faltantes en recogida o reposición),
  // permite registrar el cost_of_goods extraído del outstanding del cliente
  // sin volver a consumir lotes. Los rows NO se insertan en
  // sale_batch_consumptions (evita doble FIFO).
  precomputedCost?: { totalCost: number };
};

// Creates a sale row of type 'consignment'.
// - quantity: units delivered (drives FIFO consumption when consumeStock=true).
// - amount: monetary amount to record as revenue.
// - clientId: link the sale to a consignment client (traceability).
// - consumeStock=false: used when charging the difference at pickup — no FIFO
//   consumption, no sale_batch_consumptions. El costo de los granizados ya
//   vendidos por el cliente se pasa vía `precomputedCost` para que el margen
//   refleje la realidad y los totales del ledger no contabilicen doble.
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
    : { totalCost: options.precomputedCost?.totalCost ?? 0, rows: [] };

  // Bug 8: resolveFifoCost retorna parcial silenciosamente si no hay stock.
  // Si pidieron consumir stock y no alcanza, abortar antes de crear sale inconsistente.
  if (consumeStock && quantity > 0) {
    const fifoUnits = fifo.rows.reduce((s, r) => s + r.units, 0);
    if (fifoUnits < quantity) {
      const variantLabel = variant === "withAlcohol" ? "con alcohol" : "sin alcohol";
      return {
        saleId: null,
        error: `Stock insuficiente: solo hay ${fifoUnits} de ${quantity} unidades ${variantLabel} disponibles.`
      };
    }
  }

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
