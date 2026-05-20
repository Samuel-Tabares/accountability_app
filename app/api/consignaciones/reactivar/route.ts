import { NextRequest, NextResponse } from "next/server";
import { requireRouteRole } from "@/src/lib/route-auth";
import { jsonResponse, wantsJson } from "@/src/lib/api-utils";
import { computeNextReplenishmentDate } from "@/src/lib/consignment-utils";
import { createConsignmentSale } from "@/src/lib/consignment-sale";

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
  const unitsWithAlcohol = parseInt(formData.get("units_with_alcohol") as string ?? "0", 10) || 0;
  const unitsWithoutAlcohol = parseInt(formData.get("units_without_alcohol") as string ?? "0", 10) || 0;
  const priceWithAlcohol = formData.get("price_with_alcohol") as string | null;
  const priceWithoutAlcohol = formData.get("price_without_alcohol") as string | null;
  const notes = (formData.get("notes") as string ?? "").trim();

  if (!clientId) {
    if (jsonMode) return jsonResponse(false, "Cliente requerido", 400);
    return response;
  }

  if (unitsWithAlcohol <= 0 && unitsWithoutAlcohol <= 0) {
    if (jsonMode) return jsonResponse(false, "Debes entregar al menos una unidad", 400);
    return response;
  }

  const { data: client, error: clientError } = await auth.adminClient
    .from("consignment_clients")
    .select("base_quantity_with_alcohol, base_quantity_without_alcohol")
    .eq("id", clientId)
    .single();

  if (clientError || !client) {
    if (jsonMode) return jsonResponse(false, "Cliente no encontrado", 404);
    return response;
  }

  if (client.base_quantity_with_alcohol > 0 || client.base_quantity_without_alcohol > 0) {
    if (jsonMode) return jsonResponse(false, "El cliente ya está activo", 400);
    return response;
  }

  const priceWithNum = priceWithAlcohol ? parseFloat(priceWithAlcohol) : null;
  const priceWithoutNum = priceWithoutAlcohol ? parseFloat(priceWithoutAlcohol) : null;
  const nextReplenishmentDate = computeNextReplenishmentDate(new Date());

  const saleWith = await createConsignmentSale(
    auth.adminClient,
    auth.userId,
    "withAlcohol",
    unitsWithAlcohol,
    0,
    { clientId }
  );
  const saleWithout = await createConsignmentSale(
    auth.adminClient,
    auth.userId,
    "withoutAlcohol",
    unitsWithoutAlcohol,
    0,
    { clientId }
  );

  if (saleWith.error || saleWithout.error) {
    if (jsonMode) return jsonResponse(false, "Error al registrar la entrega inicial (FIFO)", 500);
    return response;
  }

  const updatePayload: Record<string, unknown> = {
    base_quantity_with_alcohol: unitsWithAlcohol,
    base_quantity_without_alcohol: unitsWithoutAlcohol,
    next_replenishment_date: nextReplenishmentDate,
    ...(notes ? { notes } : {}),
    ...(priceWithNum !== null ? { price_with_alcohol: priceWithNum } : {}),
    ...(priceWithoutNum !== null ? { price_without_alcohol: priceWithoutNum } : {})
  };

  const { error: updateError } = await auth.adminClient
    .from("consignment_clients")
    .update(updatePayload)
    .eq("id", clientId);

  if (updateError) {
    if (jsonMode) return jsonResponse(false, "Error al reactivar cliente", 500);
    return response;
  }

  if (jsonMode) return jsonResponse(true, "Cliente reactivado", 201);
  return response;
}
