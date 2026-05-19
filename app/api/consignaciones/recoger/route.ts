import { NextRequest, NextResponse } from "next/server";
import { requireRouteRole } from "@/src/lib/route-auth";
import { jsonResponse, wantsJson } from "@/src/lib/api-utils";
import { createConsignmentSale } from "@/src/lib/consignment-sale";
import { computeClientBatchOutstanding } from "@/src/lib/consignment-traceability";
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

  const saleWith =
    faltantesWith > 0
      ? await createConsignmentSale(
          auth.adminClient,
          auth.userId,
          "withAlcohol",
          faltantesWith,
          chargeWith,
          { clientId, consumeStock: false }
        )
      : { saleId: null, error: null };

  const saleWithout =
    faltantesWithout > 0
      ? await createConsignmentSale(
          auth.adminClient,
          auth.userId,
          "withoutAlcohol",
          faltantesWithout,
          chargeWithout,
          { clientId, consumeStock: false }
        )
      : { saleId: null, error: null };

  if (saleWith.error || saleWithout.error) {
    if (jsonMode) return jsonResponse(false, "Error al cobrar la diferencia", 500);
    return response;
  }

  // Insertar pickup
  const { data: pickupInsert, error: pickupErr } = await auth.adminClient
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
    .select("id")
    .single();

  if (pickupErr || !pickupInsert) {
    if (jsonMode) return jsonResponse(false, "Error al registrar la recogida", 500);
    return response;
  }

  const pickupId = pickupInsert.id as string;

  // Atribuir unidades recogidas a lotes FIFO sobre el sub-inventario del cliente
  for (const v of variants) {
    if (v.collected <= 0) continue;
    const outstanding = await computeClientBatchOutstanding(auth.adminClient, clientId, v.variant);
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
    // IMPORTANTE: outstanding viene ordenado oldest-first.
    // Lo que "queda" en el cliente son los lotes más nuevos (el cliente consumió FIFO oldest-first).
    // Cuando devolvemos FIFO oldest-first del outstanding, devolvemos a los lotes correctos.
    for (const out of outstanding) {
      if (remaining <= 0) break;
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
      const { error: retErr } = await auth.adminClient.from("inventory_returns").insert(returnRows);
      if (retErr) {
        await auth.adminClient.from("consignment_pickups").delete().eq("id", pickupId);
        if (jsonMode) return jsonResponse(false, "Error al devolver al stock", 500);
        return response;
      }
    }
  }

  // Cerrar al cliente: base = 0
  const { error: updateErr } = await auth.adminClient
    .from("consignment_clients")
    .update({
      base_quantity_with_alcohol: 0,
      base_quantity_without_alcohol: 0
    })
    .eq("id", clientId);

  if (updateErr) {
    if (jsonMode) return jsonResponse(false, "Error al cerrar el cliente", 500);
    return response;
  }

  if (jsonMode) return jsonResponse(true, "Recogida registrada", 201);
  return response;
}
