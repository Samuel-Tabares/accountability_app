import { NextRequest, NextResponse } from "next/server";
import { requireRouteRole } from "@/src/lib/route-auth";
import { jsonResponse, wantsJson } from "@/src/lib/api-utils";
import { createConsignmentSale, retryOnce } from "@/src/lib/consignment-sale";
import {
  computeClientBatchOutstanding,
  extractCostFromOutstanding,
  type BatchOutstanding
} from "@/src/lib/consignment-traceability";
import type { ConsignmentClientRow } from "@/src/lib/supabase/types";
import type { ProductVariant } from "@/src/lib/types";

const DEFAULT_PRICE_WITH_ALCOHOL = 4900;
const DEFAULT_PRICE_WITHOUT_ALCOHOL = 4800;

type VariantResolved = {
  variant: ProductVariant;
  collected: number;
  base: number;
  price: number;
};

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const jsonMode = wantsJson(request);
  const response = NextResponse.redirect(new URL("/admin", request.url), { status: 303 });

  const auth = await requireRouteRole(request, response, "admin");
  if (!auth) {
    if (jsonMode) return jsonResponse(false, "No autorizado", 403);
    return response;
  }

  const clientId = (formData.get("client_id") as string ?? "").trim();
  const collectedWith = parseInt(formData.get("units_collected_with_alcohol") as string ?? "0", 10) || 0;
  const collectedWithout = parseInt(formData.get("units_collected_without_alcohol") as string ?? "0", 10) || 0;
  const notes = (formData.get("notes") as string ?? "").trim();

  if (!clientId) {
    if (jsonMode) return jsonResponse(false, "Cliente requerido", 400);
    return response;
  }

  if (collectedWith < 0 || collectedWithout < 0) {
    if (jsonMode) return jsonResponse(false, "Las unidades no pueden ser negativas", 400);
    return response;
  }

  const { data: client, error: clientError } = await auth.adminClient
    .from("consignment_clients")
    .select("*")
    .eq("id", clientId)
    .single();

  if (clientError || !client) {
    if (jsonMode) return jsonResponse(false, "Cliente no encontrado", 404);
    return response;
  }

  const clientData = client as ConsignmentClientRow;
  const priceWith = clientData.price_with_alcohol ?? DEFAULT_PRICE_WITH_ALCOHOL;
  const priceWithout = clientData.price_without_alcohol ?? DEFAULT_PRICE_WITHOUT_ALCOHOL;
  const baseWith = clientData.base_quantity_with_alcohol;
  const baseWithout = clientData.base_quantity_without_alcohol;

  if (collectedWith > baseWith || collectedWithout > baseWithout) {
    if (jsonMode) return jsonResponse(false, "No puedes recoger más de la base actual del cliente", 400);
    return response;
  }

  const variants: VariantResolved[] = [
    { variant: "withAlcohol", collected: collectedWith, base: baseWith, price: priceWith },
    { variant: "withoutAlcohol", collected: collectedWithout, base: baseWithout, price: priceWithout }
  ];

  const chargeWith = (baseWith - collectedWith) * priceWith;
  const chargeWithout = (baseWithout - collectedWithout) * priceWithout;
  const amountCharged = chargeWith + chargeWithout;

  // Crear sale de cobro por faltantes (no consume stock — los granizados ya salieron antes).
  // quantity = faltantes (no 0) para cumplir el CHECK constraint de sales.quantity > 0.
  const faltantesWith = baseWith - collectedWith;
  const faltantesWithout = baseWithout - collectedWithout;

  // Bug 1: el cost_of_goods del cobro de faltantes debe reflejar los lotes
  // de donde realmente salieron los granizados que el cliente vendió.
  // Extraemos oldest-first del outstanding del cliente (asume que el cliente
  // vende FIFO oldest-first, por lo que lo que vendió = lo más viejo).
  // El outstanding se reusa más abajo para distribuir los returns de collected.
  const outstandingWith = await computeClientBatchOutstanding(auth.adminClient, clientId, "withAlcohol");
  const outstandingWithout = await computeClientBatchOutstanding(auth.adminClient, clientId, "withoutAlcohol");
  const costFaltantesWith =
    faltantesWith > 0
      ? await extractCostFromOutstanding(auth.adminClient, outstandingWith, faltantesWith)
      : { totalCost: 0, rows: [] };
  const costFaltantesWithout =
    faltantesWithout > 0
      ? await extractCostFromOutstanding(auth.adminClient, outstandingWithout, faltantesWithout)
      : { totalCost: 0, rows: [] };

  const saleWith =
    faltantesWith > 0
      ? await retryOnce(
          () =>
            createConsignmentSale(
              auth.adminClient,
              auth.userId,
              "withAlcohol",
              faltantesWith,
              chargeWith,
              {
                clientId,
                consumeStock: false,
                precomputedCost: { totalCost: costFaltantesWith.totalCost, rows: costFaltantesWith.rows }
              }
            ),
          (r) => !r.error
        )
      : { saleId: null, error: null };

  const saleWithout =
    faltantesWithout > 0 && !saleWith.error
      ? await retryOnce(
          () =>
            createConsignmentSale(
              auth.adminClient,
              auth.userId,
              "withoutAlcohol",
              faltantesWithout,
              chargeWithout,
              {
                clientId,
                consumeStock: false,
                precomputedCost: { totalCost: costFaltantesWithout.totalCost, rows: costFaltantesWithout.rows }
              }
            ),
          (r) => !r.error
        )
      : { saleId: null, error: null };

  const rollbackFaltantesSales = async () => {
    if (saleWith.saleId) {
      await auth.adminClient.from("sales").delete().eq("id", saleWith.saleId);
    }
    if (saleWithout.saleId) {
      await auth.adminClient.from("sales").delete().eq("id", saleWithout.saleId);
    }
  };

  if (saleWith.error || saleWithout.error) {
    await rollbackFaltantesSales();
    if (jsonMode)
      return jsonResponse(false, "La acción no se completó. Vuelve a intentarla.", 500);
    return response;
  }

  // Insertar pickup
  const pickupResult = await retryOnce(
    () =>
      auth.adminClient
        .from("consignment_pickups")
        .insert({
          created_by: auth.userId,
          client_id: clientId,
          units_collected_with_alcohol: collectedWith,
          units_collected_without_alcohol: collectedWithout,
          units_charged_with_alcohol: baseWith - collectedWith,
          units_charged_without_alcohol: baseWithout - collectedWithout,
          unit_price_with_alcohol: priceWith,
          unit_price_without_alcohol: priceWithout,
          amount_charged: amountCharged,
          sale_id_with_alcohol: saleWith.saleId,
          sale_id_without_alcohol: saleWithout.saleId,
          notes: notes || null
        })
        .select("*")
        .single(),
    (r) => !r.error && !!r.data
  );

  if (pickupResult.error || !pickupResult.data) {
    await rollbackFaltantesSales();
    if (jsonMode)
      return jsonResponse(false, "La acción no se completó. Vuelve a intentarla.", 500);
    return response;
  }

  const pickupId = (pickupResult.data as Record<string, unknown>).id as string;

  // Atribuir unidades recogidas a lotes FIFO sobre el sub-inventario del cliente.
  // Reusamos outstandingWith/outstandingWithout ya calculados arriba.
  const outstandingByVariant: Record<ProductVariant, BatchOutstanding[]> = {
    withAlcohol: outstandingWith,
    withoutAlcohol: outstandingWithout
  };
  for (const v of variants) {
    if (v.collected <= 0) continue;
    const outstanding = outstandingByVariant[v.variant];
    const totalOutstanding = outstanding.reduce((s, o) => s + o.units, 0);

    // Si outstanding está vacío pero hay collected > 0, fallback: no hay trazabilidad
    // (probablemente datos legacy). En este caso, saltamos retornos pero NO abortamos.
    if (totalOutstanding === 0 && v.collected > 0) {
      // Log silencioso: no hay outstanding para este lote. Saltamos retornos.
      continue;
    }

    if (v.collected > totalOutstanding) {
      // Inconsistencia: se recolecta más de lo disponible. Error.
      await auth.adminClient.from("consignment_pickups").delete().eq("id", pickupId);
      await rollbackFaltantesSales();
      if (jsonMode)
        return jsonResponse(
          false,
          `No se pueden trazar ${v.collected} unidades de ${v.variant} para este cliente (solo ${totalOutstanding} disponibles).`,
          400
        );
      return response;
    }

    let remaining = v.collected;
    const returnRows: Array<{
      created_by: string;
      batch_id: string;
      variant: ProductVariant;
      units: number;
      source_pickup_id: string;
      source_client_id: string;
    }> = [];
    // Returns van newest-first: el cliente vende FIFO oldest-first, así que lo que
    // queda físicamente en el local son los lotes más nuevos del outstanding. Al
    // recoger, esas son las unidades que físicamente recibimos de vuelta.
    // El cost de faltantes (más arriba) sí va oldest-first porque atribuye a lo
    // que el cliente YA vendió. Ambos walks juntos cubren el outstanding completo
    // por extremos opuestos sin solaparse.
    for (let i = outstanding.length - 1; i >= 0; i--) {
      if (remaining <= 0) break;
      const out = outstanding[i];
      const take = Math.min(out.units, remaining);
      returnRows.push({
        created_by: auth.userId,
        batch_id: out.batchId,
        variant: v.variant,
        units: take,
        source_pickup_id: pickupId,
        source_client_id: clientId
      });
      remaining -= take;
    }

    if (returnRows.length > 0) {
      const returnsResult = await retryOnce(
        () => auth.adminClient.from("inventory_returns").insert(returnRows),
        (r) => !r.error
      );
      if (returnsResult.error) {
        await auth.adminClient.from("consignment_pickups").delete().eq("id", pickupId);
        await rollbackFaltantesSales();
        if (jsonMode)
          return jsonResponse(false, "La acción no se completó. Vuelve a intentarla.", 500);
        return response;
      }
    }
  }

  // Cerrar al cliente: base = 0
  const closeResult = await retryOnce(
    () =>
      auth.adminClient
        .from("consignment_clients")
        .update({
          base_quantity_with_alcohol: 0,
          base_quantity_without_alcohol: 0
        })
        .eq("id", clientId),
    (r) => !r.error
  );

  if (closeResult.error) {
    // Las returns ya cascadean si borramos el pickup, así que el rollback completo
    // limpia pickup + returns + faltantes sales y deja al cliente sin cambios.
    await auth.adminClient.from("consignment_pickups").delete().eq("id", pickupId);
    await rollbackFaltantesSales();
    if (jsonMode)
      return jsonResponse(false, "La acción no se completó. Vuelve a intentarla.", 500);
    return response;
  }

  if (jsonMode) {
    const saleIds = [saleWith.saleId, saleWithout.saleId].filter(Boolean) as string[];
    const [{ data: salesData }, { data: returnsData }] = await Promise.all([
      saleIds.length > 0
        ? auth.adminClient.from("sales").select("*").in("id", saleIds)
        : Promise.resolve({ data: [] as unknown[] }),
      auth.adminClient.from("inventory_returns").select("*").eq("source_pickup_id", pickupId)
    ]);
    return jsonResponse(true, "Recogida registrada", 201, {
      pickup: pickupResult.data,
      clientId,
      sales: salesData ?? [],
      inventoryReturns: returnsData ?? []
    });
  }
  return response;
}
