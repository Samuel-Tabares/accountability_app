"use client";

import { useState } from "react";
import { CheckCircle2, Save } from "lucide-react";
import type { AppState, CompanyInfo, PricingSettings, WholesaleTier } from "@/src/lib/types";
import { Button, Field, Input, postForm, Section } from "./ui";

type SettingsPanelProps = {
  initialSettings: AppState["settings"];
  initialCompanyInfo: CompanyInfo;
  onRefresh: () => void;
  onMessage: (msg: string) => void;
};

export default function SettingsPanel({
  initialSettings,
  initialCompanyInfo,
  onRefresh,
  onMessage
}: SettingsPanelProps) {
  const [settings, setSettings] = useState<AppState["settings"]>(initialSettings);
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo>(initialCompanyInfo);

  function updateCompany<K extends keyof CompanyInfo>(key: K, value: CompanyInfo[K]) {
    setCompanyInfo((prev) => ({ ...prev, [key]: value }));
  }

  async function saveCompanyInfo() {
    if (!companyInfo.legalName.trim() || !companyInfo.nit.trim() || !companyInfo.address.trim() ||
        !companyInfo.phone.trim() || !companyInfo.taxStatus.trim()) {
      onMessage("Razón social, NIT, dirección, teléfono y estado tributario son obligatorios.");
      return;
    }
    try {
      const fd = new FormData();
      fd.set("legal_name", companyInfo.legalName.trim());
      fd.set("nit", companyInfo.nit.trim());
      fd.set("address", companyInfo.address.trim());
      fd.set("phone", companyInfo.phone.trim());
      fd.set("tax_status", companyInfo.taxStatus.trim());
      fd.set("sanitary_registry", (companyInfo.sanitaryRegistry ?? "").trim());
      const response = await fetch("/api/company-info", {
        method: "PUT",
        body: fd,
        credentials: "include",
        headers: { Accept: "application/json" }
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          (payload && typeof payload === "object" && "message" in payload && typeof (payload as { message: unknown }).message === "string"
            ? (payload as { message: string }).message
            : "No se pudo actualizar los datos de empresa.")
        );
      }
      onMessage("Datos de empresa actualizados.");
      onRefresh();
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "No se pudo actualizar los datos de empresa.");
    }
  }

  function updateSettings<K extends keyof PricingSettings>(key: K, value: PricingSettings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  function updateTier(
    key: "wholesaleWithAlcoholTiers" | "wholesaleNoAlcoholTiers",
    index: number,
    field: keyof WholesaleTier,
    value: number
  ) {
    setSettings((prev) => ({
      ...prev,
      [key]: prev[key].map((tier, tierIndex) =>
        tierIndex === index ? { ...tier, [field]: value } : tier
      )
    }));
  }

  async function saveSettings() {
    try {
      await postForm("/api/settings", {
        unit_with_alcohol_price: settings.unitWithAlcoholPrice,
        unit_no_alcohol_price: settings.unitNoAlcoholPrice,
        promo_package_price: settings.promoPackagePrice,
        gift_with_alcohol_price: settings.giftWithAlcoholPrice,
        gift_no_alcohol_price: settings.giftNoAlcoholPrice,
        boost_bonus_pct: settings.boostBonusPct,
        wholesale_with_alcohol_tiers: JSON.stringify(settings.wholesaleWithAlcoholTiers),
        wholesale_no_alcohol_tiers: JSON.stringify(settings.wholesaleNoAlcoholTiers)
      });
      onMessage("Configuración guardada como nueva versión.");
      onRefresh();
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "No se pudo guardar la configuración.");
    }
  }

  return (
    <Section
      eyebrow="Configuración"
      title="Precios, mayorista y comisiones"
      description="Aquí el admin cambia todo lo que afecta el cálculo automático de ventas, los niveles y la tabla mayorista."
      action={
        <Button onClick={saveSettings}>
          <CheckCircle2 size={16} />
          Guardar configuración
        </Button>
      }
    >
      <div className="form-card" style={{ marginBottom: "1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
          <h3 style={{ margin: 0 }}>Datos de la empresa (factura)</h3>
          <Button onClick={saveCompanyInfo} variant="secondary">
            <Save size={14} />
            Guardar empresa
          </Button>
        </div>
        <p className="section-description" style={{ marginTop: 0 }}>
          Estos datos aparecen en el encabezado de cada factura PDF.
        </p>
        <div className="grid-2">
          <Field label="Razón social">
            <Input
              value={companyInfo.legalName}
              onChange={(e) => updateCompany("legalName", e.currentTarget.value)}
            />
          </Field>
          <Field label="NIT">
            <Input
              value={companyInfo.nit}
              onChange={(e) => updateCompany("nit", e.currentTarget.value)}
            />
          </Field>
          <Field label="Dirección">
            <Input
              value={companyInfo.address}
              onChange={(e) => updateCompany("address", e.currentTarget.value)}
            />
          </Field>
          <Field label="Teléfono">
            <Input
              value={companyInfo.phone}
              onChange={(e) => updateCompany("phone", e.currentTarget.value)}
            />
          </Field>
          <Field label="Estado tributario">
            <Input
              value={companyInfo.taxStatus}
              onChange={(e) => updateCompany("taxStatus", e.currentTarget.value)}
              placeholder="Ej: No responsable de IVA"
            />
          </Field>
          <Field label="Registro sanitario (opcional)">
            <Input
              value={companyInfo.sanitaryRegistry ?? ""}
              onChange={(e) => updateCompany("sanitaryRegistry", e.currentTarget.value)}
              placeholder="Ej: RSA-0028762-2023"
            />
          </Field>
        </div>
      </div>

      <div className="form-grid split">
        <div className="form-card">
          <h3>Precios base</h3>
          <div className="grid-2">
            <Field label="Unidad con licor">
              <Input
                type="number"
                min={0}
                value={settings.unitWithAlcoholPrice}
                onChange={(event) => updateSettings("unitWithAlcoholPrice", Number(event.target.value))}
              />
            </Field>
            <Field label="Unidad sin licor">
              <Input
                type="number"
                min={0}
                value={settings.unitNoAlcoholPrice}
                onChange={(event) => updateSettings("unitNoAlcoholPrice", Number(event.target.value))}
              />
            </Field>
            <Field label="Promoción" hint="1 promo = 2 unidades">
              <Input
                type="number"
                min={0}
                value={settings.promoPackagePrice}
                onChange={(event) => updateSettings("promoPackagePrice", Number(event.target.value))}
              />
            </Field>
            <Field label="Boost extra">
              <Input
                type="number"
                min={0}
                step={0.01}
                value={settings.boostBonusPct * 100}
                onChange={(event) => updateSettings("boostBonusPct", Number(event.target.value) / 100)}
              />
            </Field>
          </div>
        </div>

        <div className="form-card">
          <h3>Mayorista con licor</h3>
          <div className="tier-list">
            {settings.wholesaleWithAlcoholTiers.map((tier, index) => (
              <div key={`with-${index}`} className="tier-row">
                <Field label="Desde">
                  <Input
                    type="number"
                    min={0}
                    value={tier.minQuantity}
                    onChange={(event) =>
                      updateTier("wholesaleWithAlcoholTiers", index, "minQuantity", Number(event.target.value))
                    }
                  />
                </Field>
                <Field label="Precio unidad">
                  <Input
                    type="number"
                    min={0}
                    value={tier.unitPrice}
                    onChange={(event) =>
                      updateTier("wholesaleWithAlcoholTiers", index, "unitPrice", Number(event.target.value))
                    }
                  />
                </Field>
                <Field label="Comisión %">
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    value={tier.commissionPct * 100}
                    onChange={(event) =>
                      updateTier("wholesaleWithAlcoholTiers", index, "commissionPct", Number(event.target.value) / 100)
                    }
                  />
                </Field>
                <Field label="Descuento %">
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    value={tier.clientDiscountPct * 100}
                    onChange={(event) =>
                      updateTier("wholesaleWithAlcoholTiers", index, "clientDiscountPct", Number(event.target.value) / 100)
                    }
                  />
                </Field>
              </div>
            ))}
          </div>

          <h3 style={{ marginTop: "1rem" }}>Mayorista sin licor</h3>
          <div className="tier-list">
            {settings.wholesaleNoAlcoholTiers.map((tier, index) => (
              <div key={`without-${index}`} className="tier-row">
                <Field label="Desde">
                  <Input
                    type="number"
                    min={0}
                    value={tier.minQuantity}
                    onChange={(event) =>
                      updateTier("wholesaleNoAlcoholTiers", index, "minQuantity", Number(event.target.value))
                    }
                  />
                </Field>
                <Field label="Precio unidad">
                  <Input
                    type="number"
                    min={0}
                    value={tier.unitPrice}
                    onChange={(event) =>
                      updateTier("wholesaleNoAlcoholTiers", index, "unitPrice", Number(event.target.value))
                    }
                  />
                </Field>
                <Field label="Comisión %">
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    value={tier.commissionPct * 100}
                    onChange={(event) =>
                      updateTier("wholesaleNoAlcoholTiers", index, "commissionPct", Number(event.target.value) / 100)
                    }
                  />
                </Field>
                <Field label="Descuento %">
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    value={tier.clientDiscountPct * 100}
                    onChange={(event) =>
                      updateTier("wholesaleNoAlcoholTiers", index, "clientDiscountPct", Number(event.target.value) / 100)
                    }
                  />
                </Field>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
}
