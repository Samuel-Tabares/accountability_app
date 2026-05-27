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

  // Bug 8: pre-validar stock disponible antes de consumir nada.
  const stockError = await validateStockAvailable(auth.adminClient, [
    { variant: "withAlcohol", quantity: unitsWithAlcohol },
    { variant: "withoutAlcohol", quantity: unitsWithoutAlcohol }
  ]);
  if (stockError) {
    if (jsonMode) return jsonResponse(false, stockError, 400);
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
  const nextReplenishmentDate = computeNextReplenishmentDate(new Date());

  const saleWith = await retryOnce(
    () =>
      createConsignmentSale(auth.adminClient, auth.userId, "withAlcohol", unitsWithAlcohol, 0, {
        clientId
      }),
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
            unitsWithoutAlcohol,
            0,
            { clientId }
          ),
        (r) => !r.error
      );

  if (saleWith.error || saleWithout.error) {
    if (saleWith.saleId) {
      await auth.adminClient.from("sales").delete().eq("id", saleWith.saleId);
    }
    if (saleWithout.saleId) {
      await auth.adminClient.from("sales").delete().eq("id", saleWithout.saleId);
    }
    const msg =
      saleWith.error ?? saleWithout.error ?? "La acción no se completó. Vuelve a intentarla.";
    if (jsonMode) return jsonResponse(false, msg, 400);
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

  const updateResult = await retryOnce(
    () => auth.adminClient.from("consignment_clients").update(updatePayload).eq("id", clientId),
    (r) => !r.error
  );

  if (updateResult.error) {
    // Rollback: las sales ya consumieron FIFO. Borrarlas evita stock fantasma.
    if (saleWith.saleId) {
      await auth.adminClient.from("sales").delete().eq("id", saleWith.saleId);
    }
    if (saleWithout.saleId) {
      await auth.adminClient.from("sales").delete().eq("id", saleWithout.saleId);
    }
    if (jsonMode)
      return jsonResponse(false, "La acción no se completó. Vuelve a intentarla.", 500);
    return response;
  }

  if (jsonMode) return jsonResponse(true, "Cliente reactivado", 201);
  return response;
}
