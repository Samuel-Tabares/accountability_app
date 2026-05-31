import { NextRequest, NextResponse } from "next/server";
import { requireRouteRole } from "@/src/lib/route-auth";
import { jsonResponse, wantsJson } from "@/src/lib/api-utils";
import type { CompanyInfoRow } from "@/src/lib/supabase/types";

export async function PUT(request: NextRequest) {
  const formData = await request.formData();
  const jsonMode = wantsJson(request);
  const response = NextResponse.redirect(new URL("/admin", request.url), { status: 303 });

  const auth = await requireRouteRole(request, response, "admin");
  if (!auth) {
    if (jsonMode) return jsonResponse(false, "No autorizado", 403);
    return response;
  }

  const legalName = (formData.get("legal_name") as string ?? "").trim();
  const nit = (formData.get("nit") as string ?? "").trim();
  const address = (formData.get("address") as string ?? "").trim();
  const phone = (formData.get("phone") as string ?? "").trim();
  const taxStatus = (formData.get("tax_status") as string ?? "").trim();
  const sanitaryRegistry = (formData.get("sanitary_registry") as string ?? "").trim();

  if (!legalName || !nit || !address || !phone || !taxStatus) {
    if (jsonMode) return jsonResponse(false, "Faltan datos obligatorios", 400);
    return response;
  }

  const { error } = await auth.adminClient
    .from("company_info")
    .update({
      legal_name: legalName,
      nit,
      address,
      phone,
      tax_status: taxStatus,
      sanitary_registry: sanitaryRegistry || null,
      updated_by: auth.userId
    })
    .eq("id", "singleton");

  if (error) {
    if (jsonMode) return jsonResponse(false, "No se pudo actualizar datos de la empresa", 500);
    return response;
  }

  if (jsonMode) return jsonResponse(true, "Datos de empresa actualizados", 200, {
    companyInfo: {
      legalName,
      nit,
      address,
      phone,
      taxStatus,
      sanitaryRegistry: sanitaryRegistry || undefined
    }
  });
  return response;
}

export async function GET(request: NextRequest) {
  const response = NextResponse.json({ ok: true });
  const auth = await requireRouteRole(request, response, "admin");
  if (!auth) {
    return NextResponse.json({ ok: false, message: "No autorizado" }, { status: 403 });
  }
  const { data, error } = await auth.adminClient
    .from("company_info")
    .select("*")
    .eq("id", "singleton")
    .maybeSingle();
  if (error || !data) {
    return NextResponse.json({ ok: false, message: "Sin datos de empresa" }, { status: 404 });
  }
  const row = data as CompanyInfoRow;
  return NextResponse.json({ ok: true, companyInfo: row });
}
