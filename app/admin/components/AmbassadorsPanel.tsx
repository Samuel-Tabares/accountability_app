"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { formatCurrency, formatDate, isBoostActive } from "@/src/lib/ledger";
import type { Ambassador, AppState, CalculatedState } from "@/src/lib/types";
import type { DashboardUser } from "./ui";
import { mapApiAmbassador } from "@/src/lib/state-mappers";
import { Button, Field, Input, postForm, saleRealTotal, Section, Select } from "./ui";

type AmbassadorDraft = Partial<Ambassador> & {
  phone?: string;
  isActive?: boolean;
};

type CreatedCredentials = {
  username: string;
  password: string;
  reason: "created" | "reset";
} | null;

function levelLabel(level?: Ambassador["level"]) {
  const labels: Record<NonNullable<Ambassador["level"]>, string> = {
    nivel0: "Nivel 0",
    plata: "Plata",
    oro: "Oro",
    diamante: "Diamante"
  };
  return level ? labels[level] : "N/A";
}

type AmbassadorsPanelProps = {
  state: AppState;
  ledger: CalculatedState;
  currentUser: DashboardUser;
  onStateUpdate: (updater: (prev: AppState) => AppState) => void;
  onMessage: (msg: string) => void;
};

export default function AmbassadorsPanel({ state, ledger, currentUser, onStateUpdate, onMessage }: AmbassadorsPanelProps) {
  const [ambassadorDraft, setAmbassadorDraft] = useState<AmbassadorDraft>({});
  const [editingAmbassadorId, setEditingAmbassadorId] = useState<string | null>(null);
  const [createdCredentials, setCreatedCredentials] = useState<CreatedCredentials>(null);

  const activeAmbassadorCount = state.ambassadors.filter((ambassador) => ambassador.active).length;

  const topAmbassadors = useMemo(
    () =>
      state.ambassadors
        .map((ambassador) => {
          const ambassadorSales = ledger.sales.filter(
            (sale) =>
              sale.ambassadorId === ambassador.id ||
              sale.ambassadorCode?.toLowerCase() === ambassador.code.toLowerCase()
          );
          const revenue = ambassadorSales.reduce((sum, sale) => sum + saleRealTotal(sale), 0);
          const commission = ambassadorSales.reduce((sum, sale) => sum + sale.commissionValue, 0);
          const clientSavings = ambassadorSales.reduce((sum, sale) => sum + sale.clientSavings, 0);
          return { ...ambassador, revenue, commission, clientSavings, salesCount: ambassadorSales.length };
        })
        .sort((a, b) => b.revenue - a.revenue),
    [state.ambassadors, ledger.sales]
  );

  function loadAmbassadorForEdit(ambassadorId: string) {
    const ambassador = state.ambassadors.find((entry) => entry.id === ambassadorId);
    if (!ambassador) return;
    setAmbassadorDraft({ ...ambassador, phone: ambassador.notes, isActive: ambassador.active });
    setEditingAmbassadorId(ambassadorId);
  }

  async function saveAmbassador() {
    const name = ambassadorDraft.name?.trim();
    const code = ambassadorDraft.code?.trim();
    if (!name || !code) return;

    try {
      if (editingAmbassadorId) {
        const payload = await postForm("/api/profiles", {
          profile_id: editingAmbassadorId,
          full_name: name,
          phone: ambassadorDraft.phone ?? "",
          is_active: ambassadorDraft.isActive ?? true
        });
        if (payload && typeof payload === "object" && "profileId" in payload) {
          const p = payload as { profileId: string; fullName: string | null; phone: string | null; isActive: boolean };
          onStateUpdate((prev) => ({
            ...prev,
            ambassadors: prev.ambassadors.map((a) =>
              a.id === p.profileId
                ? { ...a, name: p.fullName ?? a.name, notes: p.phone ?? a.notes, active: p.isActive }
                : a
            )
          }));
        }
        setAmbassadorDraft({});
        setEditingAmbassadorId(null);
        return;
      }

      const payload = await postForm("/api/embajadores", {
        code,
        full_name: name,
        phone: ambassadorDraft.phone ?? ""
      });
      if (payload && typeof payload === "object" && "username" in payload && "password" in payload) {
        setCreatedCredentials({
          username: String(payload.username),
          password: String(payload.password),
          reason: "created"
        });
      }
      if (payload && typeof payload === "object" && "profile" in payload) {
        const newAmbassador = mapApiAmbassador((payload as Record<string, unknown>).profile as Record<string, unknown>);
        onStateUpdate((prev) => ({ ...prev, ambassadors: [...prev.ambassadors, newAmbassador] }));
      }
      setAmbassadorDraft({});
      onMessage("Embajador creado. Comparte las credenciales antes de cerrar.");
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "No se pudo guardar el embajador.");
    }
  }

  async function toggleAmbassadorBoost(ambassadorId: string) {
    try {
      const payload = await postForm("/api/embajadores/boost", { profile_id: ambassadorId });
      if (payload && typeof payload === "object" && "profileId" in payload) {
        const p = payload as { profileId: string; boostActive: boolean; boostExpiresAt: string | null };
        onStateUpdate((prev) => ({
          ...prev,
          ambassadors: prev.ambassadors.map((a) =>
            a.id === p.profileId
              ? { ...a, boostActive: p.boostActive, boostExpiresAt: p.boostExpiresAt ?? undefined }
              : a
          )
        }));
      }
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "No se pudo cambiar el boost.");
    }
  }

  async function resetAmbassadorPassword(ambassador: Ambassador) {
    try {
      const payload = await postForm("/api/embajadores/reset-password", { profile_id: ambassador.id });
      if (payload && typeof payload === "object" && "username" in payload && "password" in payload) {
        setCreatedCredentials({
          username: String(payload.username),
          password: String(payload.password),
          reason: "reset"
        });
      }
      onMessage("Contraseña temporal generada. Compártela antes de cerrar.");
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "No se pudo resetear la contraseña.");
    }
  }

  return (
    <Section
      eyebrow="Embajadores"
      title="Embajadores y accesos"
      description="El código define el usuario. El sistema genera la contraseña temporal y obliga a cambiarla en el primer acceso."
      action={
        <div className="section-head-metrics">
          <span className="chip">{activeAmbassadorCount} embajadores</span>
          <span className="chip">{formatCurrency(ledger.totals.revenue)} ingresos netos</span>
          <span className="chip">{formatCurrency(ledger.totals.investment)} inversión</span>
        </div>
      }
    >
      <div className="form-grid split">
        <div className="form-card">
          <h3>{editingAmbassadorId ? "Editar embajador" : "Nuevo embajador"}</h3>
          <div className="grid-2">
            <Field label="Código">
              <Input
                value={ambassadorDraft.code ?? ""}
                disabled={Boolean(editingAmbassadorId)}
                onChange={(event) => setAmbassadorDraft((prev) => ({ ...prev, code: event.target.value }))}
              />
            </Field>
            <Field label="Usuario generado">
              <Input value={ambassadorDraft.code ?? ""} disabled />
            </Field>
            <Field label="Nombre completo">
              <Input
                value={ambassadorDraft.name ?? ""}
                onChange={(event) => setAmbassadorDraft((prev) => ({ ...prev, name: event.target.value }))}
              />
            </Field>
            <Field label="Teléfono">
              <Input
                type="tel"
                value={ambassadorDraft.phone ?? ""}
                onChange={(event) => setAmbassadorDraft((prev) => ({ ...prev, phone: event.target.value }))}
              />
            </Field>
            {editingAmbassadorId ? (
              <Field label="Activo">
                <Select
                  value={String(ambassadorDraft.isActive ?? true)}
                  onChange={(event) =>
                    setAmbassadorDraft((prev) => ({ ...prev, isActive: event.target.value === "true" }))
                  }
                >
                  <option value="true">Sí</option>
                  <option value="false">No</option>
                </Select>
              </Field>
            ) : null}
            <Field label="Nivel inicial">
              <Input value="Nivel 0" disabled />
            </Field>
          </div>
          <p className="section-description">
            La contraseña temporal se muestra solo una vez al crear o resetear. Después del login el embajador debe cambiarla.
          </p>
          {createdCredentials ? (
            <div className="mini-grid" style={{ marginBottom: "1rem" }}>
              <div className="mini-box">
                <span>Origen</span>
                <strong>{createdCredentials.reason === "reset" ? "Reset" : "Nuevo"}</strong>
              </div>
              <div className="mini-box">
                <span>Usuario/código</span>
                <strong>{createdCredentials.username}</strong>
              </div>
              <div className="mini-box">
                <span>Contraseña inicial</span>
                <strong>{createdCredentials.password}</strong>
              </div>
            </div>
          ) : null}
          <div className="actions">
            <Button onClick={saveAmbassador}>
              <Plus size={16} />
              Guardar embajador
            </Button>
          </div>
        </div>

        <div className="table-card scroll-card">
          <div className="table-head">
            <div>
              <h3>Embajadores</h3>
              <p>Ranking por ventas y comisión acumulada.</p>
            </div>
            <span className="chip">{state.ambassadors.length} perfiles</span>
          </div>

          <div className="stack-table stack-table-scroll">
            {topAmbassadors.map((ambassador) => {
              const boostActive = isBoostActive(ambassador);
              return (
                <article key={ambassador.id} className="table-row ambassador-row">
                  <div className="ambassador-row-line ambassador-row-identity">
                    <strong className="ambassador-name">{ambassador.name}</strong>
                    <div className="ambassador-identity-meta">
                      <span>{ambassador.code}</span>
                      <span aria-hidden="true">·</span>
                      <span>{levelLabel(ambassador.level)}</span>
                    </div>
                  </div>
                  <div className="ambassador-row-line ambassador-row-metrics">
                    <div className="ambassador-metric-primary">
                      <span>Descuento clientes</span>
                      <strong>{formatCurrency(ambassador.clientSavings)}</strong>
                    </div>
                    <div>
                      <span>Comisiones</span>
                      <strong>{formatCurrency(ambassador.commission)}</strong>
                    </div>
                    <div>
                      <span>Ventas</span>
                      <strong>{formatCurrency(ambassador.revenue)}</strong>
                    </div>
                  </div>
                  <div className="ambassador-row-line ambassador-row-actions">
                    <div className="ambassador-actions-line">
                      <Button variant="secondary" onClick={() => loadAmbassadorForEdit(ambassador.id)}>
                        Editar
                      </Button>
                      <Button variant="secondary" onClick={() => resetAmbassadorPassword(ambassador)}>
                        Reset clave
                      </Button>
                      <Button
                        variant={boostActive ? "danger" : "secondary"}
                        onClick={() => toggleAmbassadorBoost(ambassador.id)}
                      >
                        {boostActive
                          ? `Vence ${ambassador.boostExpiresAt ? formatDate(ambassador.boostExpiresAt) : "sin fecha"}`
                          : "Boost 7d"}
                      </Button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </Section>
  );
}
