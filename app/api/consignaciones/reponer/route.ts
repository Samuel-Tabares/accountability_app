import { NextRequest, NextResponse } from "next/server";
import { requireRouteRole } from "@/src/lib/route-auth";
import { jsonResponse, wantsJson } from "@/src/lib/api-utils";
import { computeNextReplenishmentDate } from "@/src/lib/consignment-utils";
import { createConsignmentSale } from "@/src/lib/consignment-sale";
import type { ConsignmentClientRow } from "@/src/lib/supabase/types";

const DEFAULT_PRICE_WITH_ALCOHOL = 4900;
const DEFAULT_PRICE_WITHOUT_ALCOHOL = 4800;

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
  const unitsDeliveredWith = parseInt(formData.get("units_delivered_with_alcohol") as string ?? "0", 10) || 0;
  const unitsDeliveredWithout = parseInt(formData.get("units_delivered_without_alcohol") as string ?? "0", 10) || 0;
  const notes = (formData.get("notes") as string ?? "").trim();

  if (!clientId) {
    if (jsonMode) return jsonResponse(false, "Cliente requerido", 400);
    return response;
  }

  if (unitsDeliveredWith < 0 || unitsDeliveredWithout < 0) {
    if (jsonMode) return jsonResponse(false, "Las unidades no pueden ser negativas", 400);
    return response;
  }

  if (unitsDeliveredWith === 0 && unitsDeliveredWithout === 0) {
    if (jsonMode) return jsonResponse(false, "Debes registrar al menos una unidad entregada", 400);
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
  const unitPriceWithAlcohol = clientData.price_with_alcohol ?? DEFAULT_PRICE_WITH_ALCOHOL;
  const unitPriceWithoutAlcohol = clientData.price_without_alcohol ?? DEFAULT_PRICE_WITHOUT_ALCOHOL;

  // FIFO consume exactamente lo que se entrega
  const unitsFromFIFOWith = unitsDeliveredWith;
  const unitsFromFIFOWithout = unitsDeliveredWithout;

  // Solo se cobra hasta la base anterior (el exceso amplía la base sin cobro)
  const amountWith = Math.min(unitsDeliveredWith, clientData.base_quantity_with_alcohol) * unitPriceWithAlcohol;
  const amountWithout = Math.min(unitsDeliveredWithout, clientData.base_quantity_without_alcohol) * unitPriceWithoutAlcohol;
  const amountCharged = amountWith + amountWithout;

  // Nueva base = unidades entregadas
  const resolvedBaseWithAlcohol = unitsDeliveredWith;
  const resolvedBaseWithoutAlcohol = unitsDeliveredWithout;

  const saleWith = await createConsignmentSale(
    auth.adminClient,
    auth.userId,
    "withAlcohol",
    unitsFromFIFOWith,
    amountWith,
    { clientId }
  );
  const saleWithout = await createConsignmentSale(
    auth.adminClient,
    auth.userId,
    "withoutAlcohol",
    unitsFromFIFOWithout,
    amountWithout,
    { clientId }
  );

  if (saleWith.error || saleWithout.error) {
    if (jsonMode) return jsonResponse(false, "Error al registrar la venta de consignación (FIFO)", 500);
    return response;
  }

  const { error: insertError } = await auth.adminClient
    .from("consignment_replenishments")
    .insert({
      client_id: clientId,
      created_by: auth.userId,
      units_delivered_with_alcohol: unitsDeliveredWith,
      units_delivered_without_alcohol: unitsDeliveredWithout,
      unit_price_with_alcohol: unitPriceWithAlcohol,
      unit_price_without_alcohol: unitPriceWithoutAlcohol,
      amount_charged: amountCharged,
      new_base_with_alcohol: resolvedBaseWithAlcohol,
      new_base_without_alcohol: resolvedBaseWithoutAlcohol,
      notes: notes || null,
      sale_id_with_alcohol: saleWith.saleId,
      sale_id_without_alcohol: saleWithout.saleId
    });

  if (insertError) {
    if (jsonMode) return jsonResponse(false, "Error al registrar reposición", 500);
    return response;
  }

  const nextReplenishmentDate = computeNextReplenishmentDate(new Date());
  const { error: updateError } = await auth.adminClient
    .from("consignment_clients")
    .update({
      base_quantity_with_alcohol: resolvedBaseWithAlcohol,
      base_quantity_without_alcohol: resolvedBaseWithoutAlcohol,
      next_replenishment_date: nextReplenishmentDate
    })
    .eq("id", clientId);

  if (updateError) {
    if (jsonMode) return jsonResponse(false, "Error al actualizar cliente", 500);
    return response;
  }

  if (jsonMode) return jsonResponse(true, "Reposición registrada", 201);
  return response;
}
