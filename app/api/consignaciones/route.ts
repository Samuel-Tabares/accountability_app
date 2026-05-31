import { NextRequest, NextResponse } from "next/server";
import { requireRouteRole } from "@/src/lib/route-auth";
import { jsonResponse, wantsJson } from "@/src/lib/api-utils";
import { computeNextReplenishmentDate } from "@/src/lib/consignment-utils";
import { createConsignmentSale, retryOnce, validateStockAvailable } from "@/src/lib/consignment-sale";

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

  const parsePrice = (raw: string | null): number | null | "invalid" => {
    if (!raw) return null;
    const n = parseFloat(raw);
    if (!Number.isFinite(n) || n <= 0) return "invalid";
    return n;
  };
  const priceWithParsed = parsePrice(priceWithAlcohol);
  const priceWithoutParsed = parsePrice(priceWithoutAlcohol);
  if (priceWithParsed === "invalid" || priceWithoutParsed === "invalid") {
    if (jsonMode) return jsonResponse(false, "Precios deben ser números mayores que 0", 400);
    return response;
  }
  const priceWithNum = priceWithParsed;
  const priceWithoutNum = priceWithoutParsed;

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

    if (jsonMode) return jsonResponse(true, "Cliente actualizado", 200, {
      clientId,
      name,
      address,
      contactName: contactName || null,
      phone: phone || null,
      notes: notes || null,
      priceWithAlcohol: priceWithNum,
      priceWithoutAlcohol: priceWithoutNum
    });
    return response;
  }

  if (initialUnitsWithAlcohol < 0 || initialUnitsWithoutAlcohol < 0) {
    if (jsonMode) return jsonResponse(false, "Las unidades iniciales no pueden ser negativas", 400);
    return response;
  }

  // Bug 8: pre-validar stock disponible antes de crear cliente y consumir nada.
  const stockError = await validateStockAvailable(auth.adminClient, [
    { variant: "withAlcohol", quantity: initialUnitsWithAlcohol },
    { variant: "withoutAlcohol", quantity: initialUnitsWithoutAlcohol }
  ]);
  if (stockError) {
    if (jsonMode) return jsonResponse(false, stockError, 400);
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
    .select("*")
    .single();

  if (error || !inserted) {
    if (jsonMode) return jsonResponse(false, "Error al crear cliente", 500);
    return response;
  }

  const clientInsertedId = inserted.id as string;

  const saleWith = await retryOnce(
    () =>
      createConsignmentSale(
        auth.adminClient,
        auth.userId,
        "withAlcohol",
        initialUnitsWithAlcohol,
        0,
        { clientId: clientInsertedId }
      ),
    (r) => !r.error
  );
  const saleWithout = saleWith.error
    ? { saleId: null, error: null }
    : await retryOnce(
        () =>
          createConsignmentSale(
            auth.adminClient,
            auth.userId,
            "withoutAlcohol",
            initialUnitsWithoutAlcohol,
            0,
            { clientId: clientInsertedId }
          ),
        (r) => !r.error
      );

  if (saleWith.error || saleWithout.error) {
    // Rollback: borrar sale huérfana (si la primera variante quedó creada) y cliente.
    if (saleWith.saleId) {
      await auth.adminClient.from("sales").delete().eq("id", saleWith.saleId);
    }
    if (saleWithout.saleId) {
      await auth.adminClient.from("sales").delete().eq("id", saleWithout.saleId);
    }
    await auth.adminClient.from("consignment_clients").delete().eq("id", clientInsertedId);
    const msg =
      saleWith.error ?? saleWithout.error ?? "La acción no se completó. Vuelve a intentarla.";
    if (jsonMode) return jsonResponse(false, msg, 400);
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

  if (jsonMode) {
    const saleIds = [saleWith.saleId, saleWithout.saleId].filter(Boolean) as string[];
    const [{ data: fullClient }, { data: salesData }, { data: consumptionsData }] = await Promise.all([
      auth.adminClient.from("consignment_clients").select("*").eq("id", clientInsertedId).single(),
      saleIds.length > 0
        ? auth.adminClient.from("sales").select("*").in("id", saleIds)
        : Promise.resolve({ data: [] as unknown[] }),
      saleIds.length > 0
        ? auth.adminClient.from("sale_batch_consumptions").select("*").in("sale_id", saleIds)
        : Promise.resolve({ data: [] as unknown[] })
    ]);
    return jsonResponse(true, "Cliente creado", 201, {
      client: fullClient,
      sales: salesData ?? [],
      consumptions: consumptionsData ?? []
    });
  }
  return response;
}
