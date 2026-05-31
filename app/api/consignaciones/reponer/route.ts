import { NextRequest, NextResponse } from "next/server";
import { requireRouteRole } from "@/src/lib/route-auth";
import { jsonResponse, wantsJson } from "@/src/lib/api-utils";
import { computeNextReplenishmentDate } from "@/src/lib/consignment-utils";
import { createConsignmentSale, retryOnce, validateStockAvailable } from "@/src/lib/consignment-sale";
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

  // Bug 8: pre-validar stock antes de consumir nada.
  const stockError = await validateStockAvailable(auth.adminClient, [
    { variant: "withAlcohol", quantity: unitsDeliveredWith },
    { variant: "withoutAlcohol", quantity: unitsDeliveredWithout }
  ]);
  if (stockError) {
    if (jsonMode) return jsonResponse(false, stockError, 400);
    return response;
  }

  // FIFO consume exactamente lo que se entrega
  const unitsFromFIFOWith = unitsDeliveredWith;
  const unitsFromFIFOWithout = unitsDeliveredWithout;

  // Solo se cobra hasta la base anterior (el exceso amplía la base sin cobro)
  const amountWith = Math.min(unitsDeliveredWith, clientData.base_quantity_with_alcohol) * unitPriceWithAlcohol;
  const amountWithout = Math.min(unitsDeliveredWithout, clientData.base_quantity_without_alcohol) * unitPriceWithoutAlcohol;
  const amountCharged = amountWith + amountWithout;

  // La base solo sube, nunca baja: si se entrega menos que la base actual, la base se mantiene
  const resolvedBaseWithAlcohol = Math.max(unitsDeliveredWith, clientData.base_quantity_with_alcohol);
  const resolvedBaseWithoutAlcohol = Math.max(unitsDeliveredWithout, clientData.base_quantity_without_alcohol);

  const saleWith = await retryOnce(
    () =>
      createConsignmentSale(
        auth.adminClient,
        auth.userId,
        "withAlcohol",
        unitsFromFIFOWith,
        amountWith,
        { clientId }
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
            unitsFromFIFOWithout,
            amountWithout,
            { clientId }
          ),
        (r) => !r.error
      );

  const rollbackSales = async () => {
    if (saleWith.saleId) {
      await auth.adminClient.from("sales").delete().eq("id", saleWith.saleId);
    }
    if (saleWithout.saleId) {
      await auth.adminClient.from("sales").delete().eq("id", saleWithout.saleId);
    }
  };

  if (saleWith.error || saleWithout.error) {
    await rollbackSales();
    const msg =
      saleWith.error ?? saleWithout.error ?? "La acción no se completó. Vuelve a intentarla.";
    if (jsonMode) return jsonResponse(false, msg, 400);
    return response;
  }

  const insertResult = await retryOnce(
    () =>
      auth.adminClient
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
          previous_base_with_alcohol: clientData.base_quantity_with_alcohol,
          previous_base_without_alcohol: clientData.base_quantity_without_alcohol,
          notes: notes || null,
          sale_id_with_alcohol: saleWith.saleId,
          sale_id_without_alcohol: saleWithout.saleId
        })
        .select("*")
        .single(),
    (r) => !r.error
  );

  if (insertResult.error || !insertResult.data) {
    await rollbackSales();
    if (jsonMode)
      return jsonResponse(false, "La acción no se completó. Vuelve a intentarla.", 500);
    return response;
  }

  const replenishmentId = (insertResult.data as Record<string, unknown>).id as string;

  const nextReplenishmentDate = computeNextReplenishmentDate(new Date());
  const updateResult = await retryOnce(
    () =>
      auth.adminClient
        .from("consignment_clients")
        .update({
          base_quantity_with_alcohol: resolvedBaseWithAlcohol,
          base_quantity_without_alcohol: resolvedBaseWithoutAlcohol,
          next_replenishment_date: nextReplenishmentDate
        })
        .eq("id", clientId),
    (r) => !r.error
  );

  if (updateResult.error) {
    await auth.adminClient.from("consignment_replenishments").delete().eq("id", replenishmentId);
    await rollbackSales();
    if (jsonMode)
      return jsonResponse(false, "La acción no se completó. Vuelve a intentarla.", 500);
    return response;
  }

  if (jsonMode) {
    const saleIds = [saleWith.saleId, saleWithout.saleId].filter(Boolean) as string[];
    const [{ data: salesData }, { data: consumptionsData }] = await Promise.all([
      saleIds.length > 0
        ? auth.adminClient.from("sales").select("*").in("id", saleIds)
        : Promise.resolve({ data: [] as unknown[] }),
      saleIds.length > 0
        ? auth.adminClient.from("sale_batch_consumptions").select("*").in("sale_id", saleIds)
        : Promise.resolve({ data: [] as unknown[] })
    ]);
    return jsonResponse(true, "Reposición registrada", 201, {
      replenishment: insertResult.data,
      clientUpdate: {
        id: clientId,
        baseWithAlcohol: resolvedBaseWithAlcohol,
        baseWithoutAlcohol: resolvedBaseWithoutAlcohol,
        nextReplenishmentDate
      },
      sales: salesData ?? [],
      consumptions: consumptionsData ?? []
    });
  }
  return response;
}
