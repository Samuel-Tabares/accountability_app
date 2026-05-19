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

  const clientId = formData.get("client_id") as string | null;
  const isUpdate = !!clientId;
  const name = (formData.get("name") as string ?? "").trim();
  const address = (formData.get("address") as string ?? "").trim();
  const contactName = (formData.get("contact_name") as string ?? "").trim();
  const phone = (formData.get("phone") as string ?? "").trim();
  const notes = (formData.get("notes") as string ?? "").trim();
  const initialUnitsWithAlcohol = parseInt(formData.get("initial_units_with_alcohol") as string ?? "0", 10) || 0;
  const initialUnitsWithoutAlcohol = parseInt(formData.get("initial_units_without_alcohol") as string ?? "0", 10) || 0;
  const priceWithAlcohol = formData.get("price_with_alcohol") as string | null;
  const priceWithoutAlcohol = formData.get("price_without_alcohol") as string | null;

  if (!name || !address) {
    if (jsonMode) return jsonResponse(false, "Nombre y dirección son requeridos", 400);
    return response;
  }

  const priceWithNum = priceWithAlcohol ? parseFloat(priceWithAlcohol) : null;
  const priceWithoutNum = priceWithoutAlcohol ? parseFloat(priceWithoutAlcohol) : null;

  if (isUpdate) {
    const updatePayload = {
      name,
      address,
      contact_name: contactName || null,
      phone: phone || null,
      notes: notes || null,
      price_with_alcohol: priceWithNum,
      price_without_alcohol: priceWithoutNum
    };

    const { error } = await auth.adminClient
      .from("consignment_clients")
      .update(updatePayload)
      .eq("id", clientId);

    if (error) {
      if (jsonMode) return jsonResponse(false, "Error al actualizar cliente", 500);
      return response;
    }

    if (jsonMode) return jsonResponse(true, "Cliente actualizado", 200);
    return response;
  }

  if (initialUnitsWithAlcohol < 0 || initialUnitsWithoutAlcohol < 0) {
    if (jsonMode) return jsonResponse(false, "Las unidades iniciales no pueden ser negativas", 400);
    return response;
  }

  const now = new Date();
  const nextReplenishmentDate = computeNextReplenishmentDate(now);

  const { data: inserted, error } = await auth.adminClient
    .from("consignment_clients")
    .insert({
      created_by: auth.userId,
      name,
      address,
      contact_name: contactName || null,
      phone: phone || null,
      notes: notes || null,
      base_quantity_with_alcohol: initialUnitsWithAlcohol,
      base_quantity_without_alcohol: initialUnitsWithoutAlcohol,
      price_with_alcohol: priceWithNum,
      price_without_alcohol: priceWithoutNum,
      next_replenishment_date: nextReplenishmentDate
    })
    .select("id")
    .single();

  if (error || !inserted) {
    if (jsonMode) return jsonResponse(false, "Error al crear cliente", 500);
    return response;
  }

  const clientInsertedId = inserted.id as string;

  const saleWith = await createConsignmentSale(
    auth.adminClient,
    auth.userId,
    "withAlcohol",
    initialUnitsWithAlcohol,
    0,
    { clientId: clientInsertedId }
  );
  const saleWithout = await createConsignmentSale(
    auth.adminClient,
    auth.userId,
    "withoutAlcohol",
    initialUnitsWithoutAlcohol,
    0,
    { clientId: clientInsertedId }
  );

  if (saleWith.error || saleWithout.error) {
    await auth.adminClient.from("consignment_clients").delete().eq("id", clientInsertedId);
    if (jsonMode) return jsonResponse(false, "Error al registrar la entrega inicial (FIFO)", 500);
    return response;
  }

  if (saleWith.saleId || saleWithout.saleId) {
    await auth.adminClient
      .from("consignment_clients")
      .update({
        initial_sale_id_with_alcohol: saleWith.saleId,
        initial_sale_id_without_alcohol: saleWithout.saleId
      })
      .eq("id", clientInsertedId);
  }

  if (jsonMode) return jsonResponse(true, "Cliente creado", 201);
  return response;
}
