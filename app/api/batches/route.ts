import { NextRequest, NextResponse } from "next/server";
import { requireRouteRole } from "@/src/lib/route-auth";
import { jsonResponse, wantsJson } from "@/src/lib/api-utils";
import type { ProductVariant } from "@/src/lib/types";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const jsonMode = wantsJson(request);
  const response = NextResponse.redirect(new URL("/admin", request.url), { status: 303 });
  const auth = await requireRouteRole(request, response, "admin");

  if (!auth) {
    return jsonResponse(false, "No tienes permisos para guardar lotes.", 403);
  }

  const label = String(formData.get("label") ?? "").trim();
  const variant = String(formData.get("variant") ?? "withoutAlcohol") as ProductVariant;
  const unitsProduced = Number(formData.get("units_produced"));
  const totalCost = Number(formData.get("total_cost"));
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const itemsRaw = String(formData.get("items") ?? "[]");

  if (
    !label ||
    !["withAlcohol", "withoutAlcohol"].includes(variant) ||
    !Number.isFinite(unitsProduced) ||
    unitsProduced < 1 ||
    !Number.isFinite(totalCost) ||
    totalCost < 0
  ) {
    return jsonResponse(false, "Revisa nombre, variante, unidades y costo.", 400);
  }

  let items: Array<{ kind: "granizado" | "other"; name: string; quantity?: number; unitPrice: number }>;
  try {
    items = JSON.parse(itemsRaw);
  } catch {
    return jsonResponse(false, "Los insumos del lote no son válidos.", 400);
  }

  const { data: batch, error: batchError } = await auth.adminClient
    .from("production_batches")
    .insert({ label, variant, units_produced: unitsProduced, total_cost: totalCost, notes, created_by: auth.userId })
    .select("id")
    .single();

  if (batchError || !batch) {
    return jsonResponse(false, "No se pudo guardar el lote.", 500);
  }

  const itemRows = items
    .filter((item) => item.name.trim() && item.unitPrice >= 0)
    .map((item) => ({
      batch_id: batch.id,
      kind: item.kind,
      name: item.name.trim(),
      quantity: item.quantity ?? null,
      unit_price: item.unitPrice
    }));

  if (itemRows.length > 0) {
    const { error: itemsError } = await auth.adminClient.from("production_batch_items").insert(itemRows);
    if (itemsError) {
      return jsonResponse(false, "El lote se creó, pero no se pudieron guardar los insumos.", 500);
    }
  }

  if (jsonMode) return jsonResponse(true, "Lote guardado correctamente.", 201);
  return response;
}
