"use client";

import { useState, useMemo } from "react";
import { FileText, MapPin, Plus } from "lucide-react";
import { computeNextReplenishmentDate } from "@/src/lib/consignment-utils";
import { formatCurrency } from "@/src/lib/ledger";
import type {
  AppState,
  ConsignmentClient,
  ConsignmentPickup,
  ConsignmentReplenishment
} from "@/src/lib/types";
import { listConsignmentInvoices } from "@/src/lib/invoice/builders";
import { predictNextNumber } from "@/src/lib/invoice/numbering";
import type { InvoiceData } from "@/src/lib/invoice/types";
import {
  Button,
  Field,
  Input,
  Section,
  TextArea,
  displayNumber,
  parseNumber,
  postForm
} from "./ui";
import InvoiceSuccessModal from "./InvoiceSuccessModal";
import InvoiceHistoryModal from "./InvoiceHistoryModal";

type FormMode =
  | { kind: "create" }
  | { kind: "edit"; clientId: string }
  | { kind: "reponer"; clientId: string }
  | { kind: "recoger"; clientId: string }
  | { kind: "historial"; clientId: string }
  | { kind: "reactivar"; clientId: string };

type ClientDraft = {
  name: string;
  address: string;
  contactName: string;
  phone: string;
  notes: string;
  initialUnitsWithAlcohol: number;
  initialUnitsWithoutAlcohol: number;
  priceWithAlcohol: string;
  priceWithoutAlcohol: string;
};

type ReponerDraft = {
  unitsDeliveredWithAlcohol: number;
  unitsDeliveredWithoutAlcohol: number;
  notes: string;
};

type RecogerDraft = {
  unitsCollectedWithAlcohol: number;
  unitsCollectedWithoutAlcohol: number;
  notes: string;
};

type ReactivarDraft = {
  unitsWithAlcohol: number;
  unitsWithoutAlcohol: number;
  priceWithAlcohol: string;
  priceWithoutAlcohol: string;
  notes: string;
};

const emptyClientDraft: ClientDraft = {
  name: "",
  address: "",
  contactName: "",
  phone: "",
  notes: "",
  initialUnitsWithAlcohol: 0,
  initialUnitsWithoutAlcohol: 0,
  priceWithAlcohol: "",
  priceWithoutAlcohol: ""
};

const emptyReponerDraft: ReponerDraft = {
  unitsDeliveredWithAlcohol: 0,
  unitsDeliveredWithoutAlcohol: 0,
  notes: ""
};

const emptyRecogerDraft: RecogerDraft = {
  unitsCollectedWithAlcohol: 0,
  unitsCollectedWithoutAlcohol: 0,
  notes: ""
};

const emptyReactivarDraft: ReactivarDraft = {
  unitsWithAlcohol: 0,
  unitsWithoutAlcohol: 0,
  priceWithAlcohol: "",
  priceWithoutAlcohol: "",
  notes: ""
};

type ConsignacionesPanelProps = {
  state: AppState;
  defaultPriceWithAlcohol: number;
  defaultPriceWithoutAlcohol: number;
  onRefresh: () => void;
  onMessage: (msg: string) => void;
};

function googleMapsUrl(client: ConsignmentClient): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(client.address)}`;
}

// Para fechas YYYY-MM-DD (next_replenishment_date)
function formatDateIso(isoDate: string): string {
  const date = new Date(isoDate + "T00:00:00Z");
  return date.toLocaleDateString("es-CO", { year: "numeric", month: "2-digit", day: "2-digit" });
}

// Para timestamptz (created_at de replenishments/pickups)
function formatDateTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString("es-CO", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function daysUntil(isoDate: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(isoDate + "T00:00:00Z");
  return Math.ceil((target.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
}

type ClientStatus = {
  badgeClass: string;
  label: string;
};

function resolveClientStatus(client: ConsignmentClient): ClientStatus {
  const baseTotal = client.baseQuantityWithAlcohol + client.baseQuantityWithoutAlcohol;
  if (baseTotal === 0) return { badgeClass: "badge badge-muted", label: "Sin entregas" };
  const days = daysUntil(client.nextReplenishmentDate);
  if (days < 0) return { badgeClass: "badge badge-red", label: `Vencido ${Math.abs(days)}d` };
  if (days <= 7) return { badgeClass: "badge badge-amber", label: `Próxima ${days}d` };
  return { badgeClass: "badge badge-green", label: "Al día" };
}

type TimelineEvent = {
  id: string;
  kind: "delivery" | "replenishment" | "pickup";
  createdAt: string;
  label: string;
  units: string;
  amount: number;
  notes?: string;
};

function buildTimeline(
  client: ConsignmentClient,
  replenishments: ConsignmentReplenishment[],
  pickups: ConsignmentPickup[]
): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  events.push({
    id: `delivery-${client.id}`,
    kind: "delivery",
    createdAt: client.createdAt,
    label: "Entrega inicial",
    units: `—`,
    amount: 0,
    notes: undefined
  });

  for (const r of replenishments) {
    events.push({
      id: `rep-${r.id}`,
      kind: "replenishment",
      createdAt: r.createdAt,
      label: "Reposición",
      units: `${r.unitsDeliveredWithAlcohol}A / ${r.unitsDeliveredWithoutAlcohol}SA`,
      amount: r.amountCharged,
      notes: r.notes
    });
  }

  for (const p of pickups) {
    events.push({
      id: `pick-${p.id}`,
      kind: "pickup",
      createdAt: p.createdAt,
      label: "Recogida (cierre)",
      units: `Recogidas ${p.unitsCollectedWithAlcohol}A / ${p.unitsCollectedWithoutAlcohol}SA · cobradas ${p.unitsChargedWithAlcohol}A / ${p.unitsChargedWithoutAlcohol}SA`,
      amount: p.amountCharged,
      notes: p.notes
    });
  }

  return events.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
}

export default function ConsignacionesPanel({
  state,
  defaultPriceWithAlcohol,
  defaultPriceWithoutAlcohol,
  onRefresh,
  onMessage
}: ConsignacionesPanelProps) {
  const consignmentClients = state.consignmentClients;
  const consignmentReplenishments = state.consignmentReplenishments;
  const consignmentPickups = state.consignmentPickups;
  const [mode, setMode] = useState<FormMode>({ kind: "create" });
  const [clientDraft, setClientDraft] = useState<ClientDraft>(emptyClientDraft);
  const [reponerDraft, setReponerDraft] = useState<ReponerDraft>(emptyReponerDraft);
  const [recogerDraft, setRecogerDraft] = useState<RecogerDraft>(emptyRecogerDraft);
  const [reactivarDraft, setReactivarDraft] = useState<ReactivarDraft>(emptyReactivarDraft);
  const [showHistorical, setShowHistorical] = useState(false);
  const [successInvoice, setSuccessInvoice] = useState<InvoiceData | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const invoiceHistory = useMemo(() => listConsignmentInvoices(state), [state]);

  function resolvePrice(raw: string, fallback: number) {
    const parsed = parseNumber(raw);
    return parsed > 0 ? parsed : fallback;
  }

  const currentEditingClient =
    mode.kind === "edit" ||
    mode.kind === "reponer" ||
    mode.kind === "recoger" ||
    mode.kind === "historial" ||
    mode.kind === "reactivar"
      ? consignmentClients.find((c) => c.id === mode.clientId)
      : undefined;

  const replenishmentsForClient = useMemo(
    () =>
      currentEditingClient
        ? consignmentReplenishments.filter((r) => r.clientId === currentEditingClient.id)
        : [],
    [currentEditingClient, consignmentReplenishments]
  );
  const pickupsForClient = useMemo(
    () =>
      currentEditingClient
        ? consignmentPickups.filter((p) => p.clientId === currentEditingClient.id)
        : [],
    [currentEditingClient, consignmentPickups]
  );

  const timelineEvents = useMemo(() => {
    if (!currentEditingClient) return [];
    return buildTimeline(currentEditingClient, replenishmentsForClient, pickupsForClient);
  }, [currentEditingClient, replenishmentsForClient, pickupsForClient]);

  const today = new Date().toISOString().slice(0, 10);
  const sevenDaysOut = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const activeClients = useMemo(
    () =>
      consignmentClients.filter(
        (c) => c.baseQuantityWithAlcohol > 0 || c.baseQuantityWithoutAlcohol > 0
      ),
    [consignmentClients]
  );

  const historicalClients = useMemo(
    () =>
      consignmentClients.filter(
        (c) => c.baseQuantityWithAlcohol === 0 && c.baseQuantityWithoutAlcohol === 0
      ),
    [consignmentClients]
  );

  const urgentClients = useMemo(
    () => activeClients.filter((c) => c.nextReplenishmentDate <= sevenDaysOut),
    [activeClients, sevenDaysOut]
  );

  const overdueCount = urgentClients.filter((c) => c.nextReplenishmentDate < today).length;
  const upcomingCount = urgentClients.filter(
    (c) => c.nextReplenishmentDate >= today && c.nextReplenishmentDate <= sevenDaysOut
  ).length;

  const visibleClients = showHistorical ? consignmentClients : activeClients;

  async function saveClient() {
    const isEdit = mode.kind === "edit";
    if (!clientDraft.name.trim() || !clientDraft.address.trim()) {
      onMessage("Nombre y dirección son requeridos");
      return;
    }
    if (!isEdit) {
      const totalInitial =
        clientDraft.initialUnitsWithAlcohol + clientDraft.initialUnitsWithoutAlcohol;
      if (totalInitial < 1) {
        onMessage("Debes entregar al menos 1 unidad para crear el cliente");
        return;
      }
    }
    if (clientDraft.priceWithAlcohol !== "" && parseNumber(clientDraft.priceWithAlcohol) <= 0) {
      onMessage("El precio con alcohol debe ser mayor que 0");
      return;
    }
    if (clientDraft.priceWithoutAlcohol !== "" && parseNumber(clientDraft.priceWithoutAlcohol) <= 0) {
      onMessage("El precio sin alcohol debe ser mayor que 0");
      return;
    }
    const createSnapshot = !isEdit
      ? {
          name: clientDraft.name.trim(),
          address: clientDraft.address.trim(),
          contactName: clientDraft.contactName.trim() || undefined,
          phone: clientDraft.phone.trim() || undefined,
          notes: clientDraft.notes.trim() || undefined,
          unitsWithAlcohol: clientDraft.initialUnitsWithAlcohol,
          unitsWithoutAlcohol: clientDraft.initialUnitsWithoutAlcohol,
          priceWithAlcohol: resolvePrice(clientDraft.priceWithAlcohol, defaultPriceWithAlcohol),
          priceWithoutAlcohol: resolvePrice(clientDraft.priceWithoutAlcohol, defaultPriceWithoutAlcohol)
        }
      : null;

    try {
      await postForm("/api/consignaciones", {
        ...(isEdit ? { client_id: mode.clientId } : {}),
        name: clientDraft.name.trim(),
        address: clientDraft.address.trim(),
        contact_name: clientDraft.contactName.trim() || undefined,
        phone: clientDraft.phone.trim() || undefined,
        notes: clientDraft.notes.trim() || undefined,
        ...(isEdit
          ? {}
          : {
              initial_units_with_alcohol: clientDraft.initialUnitsWithAlcohol,
              initial_units_without_alcohol: clientDraft.initialUnitsWithoutAlcohol
            }),
        price_with_alcohol: clientDraft.priceWithAlcohol || undefined,
        price_without_alcohol: clientDraft.priceWithoutAlcohol || undefined
      });

      if (createSnapshot) {
        setSuccessInvoice({
          kind: "consignment_initial",
          number: predictNextNumber("consignment_initial", consignmentClients.length),
          createdAt: new Date().toISOString(),
          client: {
            name: createSnapshot.name,
            address: createSnapshot.address,
            contactName: createSnapshot.contactName,
            phone: createSnapshot.phone
          },
          unitsWithAlcohol: createSnapshot.unitsWithAlcohol,
          unitsWithoutAlcohol: createSnapshot.unitsWithoutAlcohol,
          priceWithAlcohol: createSnapshot.priceWithAlcohol,
          priceWithoutAlcohol: createSnapshot.priceWithoutAlcohol,
          notes: createSnapshot.notes
        });
      } else {
        onMessage("Cliente actualizado");
      }
      setMode({ kind: "create" });
      setClientDraft(emptyClientDraft);
      onRefresh();
    } catch {
      onMessage("Error al guardar cliente");
    }
  }

  async function saveReplenishment() {
    if (mode.kind !== "reponer" || !currentEditingClient) return;
    const totalDelivered =
      reponerDraft.unitsDeliveredWithAlcohol + reponerDraft.unitsDeliveredWithoutAlcohol;
    if (totalDelivered < 1) {
      onMessage("Debes entregar al menos 1 unidad");
      return;
    }
    const client = currentEditingClient;
    const priceWith = client.priceWithAlcohol ?? defaultPriceWithAlcohol;
    const priceWithout = client.priceWithoutAlcohol ?? defaultPriceWithoutAlcohol;
    const amount =
      Math.min(reponerDraft.unitsDeliveredWithAlcohol, client.baseQuantityWithAlcohol) * priceWith +
      Math.min(reponerDraft.unitsDeliveredWithoutAlcohol, client.baseQuantityWithoutAlcohol) *
        priceWithout;
    const newBaseWith = Math.max(
      reponerDraft.unitsDeliveredWithAlcohol,
      client.baseQuantityWithAlcohol
    );
    const newBaseWithout = Math.max(
      reponerDraft.unitsDeliveredWithoutAlcohol,
      client.baseQuantityWithoutAlcohol
    );
    const snapshot = {
      client,
      unitsDeliveredWithAlcohol: reponerDraft.unitsDeliveredWithAlcohol,
      unitsDeliveredWithoutAlcohol: reponerDraft.unitsDeliveredWithoutAlcohol,
      priceWith,
      priceWithout,
      amount,
      newBaseWith,
      newBaseWithout,
      notes: reponerDraft.notes.trim() || undefined
    };

    try {
      await postForm("/api/consignaciones/reponer", {
        client_id: currentEditingClient.id,
        units_delivered_with_alcohol: reponerDraft.unitsDeliveredWithAlcohol,
        units_delivered_without_alcohol: reponerDraft.unitsDeliveredWithoutAlcohol,
        notes: reponerDraft.notes.trim() || undefined
      });
      setSuccessInvoice({
        kind: "consignment_replenishment",
        number: predictNextNumber("consignment_replenishment", consignmentReplenishments.length),
        createdAt: new Date().toISOString(),
        client: {
          name: snapshot.client.name,
          address: snapshot.client.address,
          contactName: snapshot.client.contactName,
          phone: snapshot.client.phone
        },
        unitsDeliveredWithAlcohol: snapshot.unitsDeliveredWithAlcohol,
        unitsDeliveredWithoutAlcohol: snapshot.unitsDeliveredWithoutAlcohol,
        unitPriceWithAlcohol: snapshot.priceWith,
        unitPriceWithoutAlcohol: snapshot.priceWithout,
        amountCharged: snapshot.amount,
        newBaseWithAlcohol: snapshot.newBaseWith,
        newBaseWithoutAlcohol: snapshot.newBaseWithout,
        previousBaseWithAlcohol: snapshot.client.baseQuantityWithAlcohol,
        previousBaseWithoutAlcohol: snapshot.client.baseQuantityWithoutAlcohol,
        notes: snapshot.notes
      });
      setMode({ kind: "create" });
      setReponerDraft(emptyReponerDraft);
      onRefresh();
    } catch {
      onMessage("Error al registrar reposición");
    }
  }

  async function savePickup() {
    if (mode.kind !== "recoger" || !currentEditingClient) return;
    const totalCollected =
      recogerDraft.unitsCollectedWithAlcohol + recogerDraft.unitsCollectedWithoutAlcohol;
    const totalBase =
      currentEditingClient.baseQuantityWithAlcohol +
      currentEditingClient.baseQuantityWithoutAlcohol;
    const charge =
      (currentEditingClient.baseQuantityWithAlcohol - recogerDraft.unitsCollectedWithAlcohol) *
        (currentEditingClient.priceWithAlcohol ?? defaultPriceWithAlcohol) +
      (currentEditingClient.baseQuantityWithoutAlcohol -
        recogerDraft.unitsCollectedWithoutAlcohol) *
        (currentEditingClient.priceWithoutAlcohol ?? defaultPriceWithoutAlcohol);

    const ok = window.confirm(
      `Esta acción cierra al cliente "${currentEditingClient.name}".\n\n` +
        `Se devolverán ${totalCollected} unidades al stock (de ${totalBase} base) y se cobrarán ${formatCurrency(charge)}.\n\n¿Continuar?`
    );
    if (!ok) return;

    const priceWith = currentEditingClient.priceWithAlcohol ?? defaultPriceWithAlcohol;
    const priceWithout = currentEditingClient.priceWithoutAlcohol ?? defaultPriceWithoutAlcohol;
    const chargedWith =
      currentEditingClient.baseQuantityWithAlcohol - recogerDraft.unitsCollectedWithAlcohol;
    const chargedWithout =
      currentEditingClient.baseQuantityWithoutAlcohol - recogerDraft.unitsCollectedWithoutAlcohol;
    const snapshot = {
      client: currentEditingClient,
      collectedWith: recogerDraft.unitsCollectedWithAlcohol,
      collectedWithout: recogerDraft.unitsCollectedWithoutAlcohol,
      chargedWith,
      chargedWithout,
      priceWith,
      priceWithout,
      amount: chargedWith * priceWith + chargedWithout * priceWithout,
      notes: recogerDraft.notes.trim() || undefined
    };

    try {
      await postForm("/api/consignaciones/recoger", {
        client_id: currentEditingClient.id,
        units_collected_with_alcohol: recogerDraft.unitsCollectedWithAlcohol,
        units_collected_without_alcohol: recogerDraft.unitsCollectedWithoutAlcohol,
        notes: recogerDraft.notes.trim() || undefined
      });
      setSuccessInvoice({
        kind: "consignment_pickup",
        number: predictNextNumber("consignment_pickup", consignmentPickups.length),
        createdAt: new Date().toISOString(),
        client: {
          name: snapshot.client.name,
          address: snapshot.client.address,
          contactName: snapshot.client.contactName,
          phone: snapshot.client.phone
        },
        unitsCollectedWithAlcohol: snapshot.collectedWith,
        unitsCollectedWithoutAlcohol: snapshot.collectedWithout,
        unitsChargedWithAlcohol: snapshot.chargedWith,
        unitsChargedWithoutAlcohol: snapshot.chargedWithout,
        unitPriceWithAlcohol: snapshot.priceWith,
        unitPriceWithoutAlcohol: snapshot.priceWithout,
        amountCharged: snapshot.amount,
        notes: snapshot.notes
      });
      setMode({ kind: "create" });
      setRecogerDraft(emptyRecogerDraft);
      onRefresh();
    } catch (err) {
      onMessage(err instanceof Error ? err.message : "Error al registrar recogida");
    }
  }

  async function saveReactivation() {
    if (mode.kind !== "reactivar" || !currentEditingClient) return;
    if (reactivarDraft.unitsWithAlcohol === 0 && reactivarDraft.unitsWithoutAlcohol === 0) {
      onMessage("Debes entregar al menos una unidad");
      return;
    }
    if (reactivarDraft.priceWithAlcohol !== "" && parseNumber(reactivarDraft.priceWithAlcohol) <= 0) {
      onMessage("El precio con alcohol debe ser mayor que 0");
      return;
    }
    if (reactivarDraft.priceWithoutAlcohol !== "" && parseNumber(reactivarDraft.priceWithoutAlcohol) <= 0) {
      onMessage("El precio sin alcohol debe ser mayor que 0");
      return;
    }
    const priceWith = resolvePrice(
      reactivarDraft.priceWithAlcohol,
      currentEditingClient.priceWithAlcohol ?? defaultPriceWithAlcohol
    );
    const priceWithout = resolvePrice(
      reactivarDraft.priceWithoutAlcohol,
      currentEditingClient.priceWithoutAlcohol ?? defaultPriceWithoutAlcohol
    );
    const snapshot = {
      client: currentEditingClient,
      unitsWith: reactivarDraft.unitsWithAlcohol,
      unitsWithout: reactivarDraft.unitsWithoutAlcohol,
      priceWith,
      priceWithout,
      notes: reactivarDraft.notes.trim() || undefined
    };

    try {
      await postForm("/api/consignaciones/reactivar", {
        client_id: currentEditingClient.id,
        units_with_alcohol: reactivarDraft.unitsWithAlcohol,
        units_without_alcohol: reactivarDraft.unitsWithoutAlcohol,
        price_with_alcohol: reactivarDraft.priceWithAlcohol || undefined,
        price_without_alcohol: reactivarDraft.priceWithoutAlcohol || undefined,
        notes: reactivarDraft.notes.trim() || undefined
      });
      setSuccessInvoice({
        kind: "consignment_reactivation",
        number: predictNextNumber(
          "consignment_reactivation",
          state.consignmentReactivations.length
        ),
        createdAt: new Date().toISOString(),
        client: {
          name: snapshot.client.name,
          address: snapshot.client.address,
          contactName: snapshot.client.contactName,
          phone: snapshot.client.phone
        },
        unitsWithAlcohol: snapshot.unitsWith,
        unitsWithoutAlcohol: snapshot.unitsWithout,
        unitPriceWithAlcohol: snapshot.priceWith,
        unitPriceWithoutAlcohol: snapshot.priceWithout,
        notes: snapshot.notes
      });
      setMode({ kind: "create" });
      setReactivarDraft(emptyReactivarDraft);
      onRefresh();
    } catch {
      onMessage("Error al reactivar cliente");
    }
  }

  function loadClientForEdit(clientId: string) {
    const client = consignmentClients.find((c) => c.id === clientId);
    if (!client) return;
    setClientDraft({
      name: client.name,
      address: client.address,
      contactName: client.contactName ?? "",
      phone: client.phone ?? "",
      notes: client.notes ?? "",
      initialUnitsWithAlcohol: 0,
      initialUnitsWithoutAlcohol: 0,
      priceWithAlcohol: client.priceWithAlcohol?.toString() ?? "",
      priceWithoutAlcohol: client.priceWithoutAlcohol?.toString() ?? ""
    });
    setMode({ kind: "edit", clientId });
  }

  function loadClientForReponer(clientId: string) {
    setReponerDraft(emptyReponerDraft);
    setMode({ kind: "reponer", clientId });
  }

  function loadClientForRecoger(clientId: string) {
    setRecogerDraft(emptyRecogerDraft);
    setMode({ kind: "recoger", clientId });
  }

  function loadClientForHistorial(clientId: string) {
    setMode({ kind: "historial", clientId });
  }

  function loadClientForReactivar(clientId: string) {
    const client = consignmentClients.find((c) => c.id === clientId);
    setReactivarDraft({
      ...emptyReactivarDraft,
      priceWithAlcohol: client?.priceWithAlcohol?.toString() ?? "",
      priceWithoutAlcohol: client?.priceWithoutAlcohol?.toString() ?? ""
    });
    setMode({ kind: "reactivar", clientId });
  }

  function cancelEdit() {
    setMode({ kind: "create" });
    setClientDraft(emptyClientDraft);
    setReponerDraft(emptyReponerDraft);
    setRecogerDraft(emptyRecogerDraft);
    setReactivarDraft(emptyReactivarDraft);
  }

  const reponerEffectivePriceWithAlcohol =
    currentEditingClient?.priceWithAlcohol ?? defaultPriceWithAlcohol;
  const reponerEffectivePriceWithoutAlcohol =
    currentEditingClient?.priceWithoutAlcohol ?? defaultPriceWithoutAlcohol;

  // Cobro = min(entregado, base anterior) × precio
  const reponerAmount =
    Math.min(reponerDraft.unitsDeliveredWithAlcohol, currentEditingClient?.baseQuantityWithAlcohol ?? 0) *
      reponerEffectivePriceWithAlcohol +
    Math.min(reponerDraft.unitsDeliveredWithoutAlcohol, currentEditingClient?.baseQuantityWithoutAlcohol ?? 0) *
      reponerEffectivePriceWithoutAlcohol;

  const recogerFaltantesWith =
    currentEditingClient
      ? Math.max(
          0,
          currentEditingClient.baseQuantityWithAlcohol - recogerDraft.unitsCollectedWithAlcohol
        )
      : 0;
  const recogerFaltantesWithout =
    currentEditingClient
      ? Math.max(
          0,
          currentEditingClient.baseQuantityWithoutAlcohol -
            recogerDraft.unitsCollectedWithoutAlcohol
        )
      : 0;
  const recogerAmount =
    recogerFaltantesWith * reponerEffectivePriceWithAlcohol +
    recogerFaltantesWithout * reponerEffectivePriceWithoutAlcohol;

  const nextReplenishmentPreview =
    mode.kind === "create" ? computeNextReplenishmentDate(new Date()) : undefined;

  const formTitle = (() => {
    switch (mode.kind) {
      case "create":
        return "Nuevo cliente";
      case "edit":
        return `Editar ${currentEditingClient?.name ?? ""}`;
      case "reponer":
        return `Reponer ${currentEditingClient?.name ?? ""}`;
      case "recoger":
        return `Recoger ${currentEditingClient?.name ?? ""}`;
      case "historial":
        return `Historial · ${currentEditingClient?.name ?? ""}`;
      case "reactivar":
        return `Reactivar ${currentEditingClient?.name ?? ""}`;
    }
  })();

  const submitLabel = (() => {
    switch (mode.kind) {
      case "create":
        return "Crear cliente";
      case "edit":
        return "Guardar cambios";
      case "reponer":
        return "Registrar reposición";
      case "recoger":
        return "Registrar recogida";
      case "historial":
        return "";
      case "reactivar":
        return "Reactivar cliente";
    }
  })();

  function onSubmit() {
    switch (mode.kind) {
      case "create":
      case "edit":
        return saveClient();
      case "reponer":
        return saveReplenishment();
      case "recoger":
        return savePickup();
      case "reactivar":
        return saveReactivation();
      case "historial":
        return;
    }
  }

  return (
    <Section
      eyebrow="Establecimientos y reposiciones"
      title="Consignaciones"
      description="cliente vende FIFO, yo recojo FIFO. Gestiona entregas sin cobro inmediato, reposiciones y recogidas."
      action={
        <Button variant="ghost" onClick={() => setHistoryOpen(true)} style={{ fontSize: "0.8rem" }}>
          <FileText size={14} />
          Facturas ({invoiceHistory.length})
        </Button>
      }
    >
      <div className="form-grid split">
        <div className="form-card">
          <h3>{formTitle}</h3>

          {(mode.kind === "create" || mode.kind === "edit") && (
            <div className="grid-2">
              <Field label="Nombre del local">
                <Input
                  value={clientDraft.name}
                  onChange={(e) => setClientDraft({ ...clientDraft, name: e.currentTarget.value })}
                  placeholder="Ej: Supermercado XYZ"
                />
              </Field>
              <Field label="Dirección">
                <Input
                  value={clientDraft.address}
                  onChange={(e) =>
                    setClientDraft({ ...clientDraft, address: e.currentTarget.value })
                  }
                  placeholder="Calle 45 #12-34"
                />
              </Field>
              <Field label="Persona de contacto">
                <Input
                  value={clientDraft.contactName}
                  onChange={(e) =>
                    setClientDraft({ ...clientDraft, contactName: e.currentTarget.value })
                  }
                  placeholder="Nombre"
                />
              </Field>
              <Field label="Teléfono">
                <Input
                  value={clientDraft.phone}
                  onChange={(e) => setClientDraft({ ...clientDraft, phone: e.currentTarget.value })}
                  placeholder="+57 300 123 4567"
                />
              </Field>
              {mode.kind === "create" && (
                <>
                  <Field label="Unidades con alcohol a entregar hoy">
                    <Input
                      type="number"
                      value={displayNumber(clientDraft.initialUnitsWithAlcohol)}
                      onChange={(e) =>
                        setClientDraft({
                          ...clientDraft,
                          initialUnitsWithAlcohol: parseNumber(e.currentTarget.value)
                        })
                      }
                      min={0}
                      step={1}
                    />
                  </Field>
                  <Field label="Unidades sin alcohol a entregar hoy">
                    <Input
                      type="number"
                      value={displayNumber(clientDraft.initialUnitsWithoutAlcohol)}
                      onChange={(e) =>
                        setClientDraft({
                          ...clientDraft,
                          initialUnitsWithoutAlcohol: parseNumber(e.currentTarget.value)
                        })
                      }
                      min={0}
                      step={1}
                    />
                  </Field>
                </>
              )}
              <Field label={`Precio con alcohol (default: $${defaultPriceWithAlcohol})`}>
                <Input
                  type="number"
                  value={clientDraft.priceWithAlcohol}
                  onChange={(e) =>
                    setClientDraft({ ...clientDraft, priceWithAlcohol: e.currentTarget.value })
                  }
                  placeholder={defaultPriceWithAlcohol.toString()}
                  min={1}
                  step="any"
                />
              </Field>
              <Field label={`Precio sin alcohol (default: $${defaultPriceWithoutAlcohol})`}>
                <Input
                  type="number"
                  value={clientDraft.priceWithoutAlcohol}
                  onChange={(e) =>
                    setClientDraft({ ...clientDraft, priceWithoutAlcohol: e.currentTarget.value })
                  }
                  placeholder={defaultPriceWithoutAlcohol.toString()}
                  min={1}
                  step="any"
                />
              </Field>
              {nextReplenishmentPreview && (
                <Field label="Próxima reposición (30 días)">
                  <div
                    style={{
                      padding: "0.75rem",
                      background: "var(--surface-soft)",
                      borderRadius: "var(--radius-sm)"
                    }}
                  >
                    <strong>{formatDateIso(nextReplenishmentPreview)}</strong>
                  </div>
                </Field>
              )}
              <Field label="Notas">
                <TextArea
                  value={clientDraft.notes}
                  onChange={(e) => setClientDraft({ ...clientDraft, notes: e.currentTarget.value })}
                  placeholder="Observaciones..."
                />
              </Field>
            </div>
          )}

          {mode.kind === "reponer" && currentEditingClient && (
            <div className="grid-2">
              <Field
                label={`Unidades a entregar con alcohol (base actual: ${currentEditingClient.baseQuantityWithAlcohol})`}
              >
                <Input
                  type="number"
                  value={displayNumber(reponerDraft.unitsDeliveredWithAlcohol)}
                  onChange={(e) =>
                    setReponerDraft({
                      ...reponerDraft,
                      unitsDeliveredWithAlcohol: parseNumber(e.currentTarget.value)
                    })
                  }
                  min={0}
                />
              </Field>
              <Field
                label={`Unidades a entregar sin alcohol (base actual: ${currentEditingClient.baseQuantityWithoutAlcohol})`}
              >
                <Input
                  type="number"
                  value={displayNumber(reponerDraft.unitsDeliveredWithoutAlcohol)}
                  onChange={(e) =>
                    setReponerDraft({
                      ...reponerDraft,
                      unitsDeliveredWithoutAlcohol: parseNumber(e.currentTarget.value)
                    })
                  }
                  min={0}
                />
              </Field>
              <Field
                label={`Total a cobrar (base anterior: ${currentEditingClient.baseQuantityWithAlcohol}A · ${currentEditingClient.baseQuantityWithoutAlcohol}SA)`}
              >
                <div
                  style={{
                    padding: "0.75rem",
                    background: "var(--surface-soft)",
                    borderRadius: "var(--radius-sm)"
                  }}
                >
                  <strong>{formatCurrency(reponerAmount)}</strong>
                  {(reponerDraft.unitsDeliveredWithAlcohol > currentEditingClient.baseQuantityWithAlcohol ||
                    reponerDraft.unitsDeliveredWithoutAlcohol > currentEditingClient.baseQuantityWithoutAlcohol) && (
                    <span style={{ marginLeft: "0.5rem", color: "var(--muted)", fontSize: "0.85rem" }}>
                      (exceso amplía la base sin cobro)
                    </span>
                  )}
                </div>
              </Field>
              <Field label="Nueva base (resultado)">
                <div
                  style={{
                    padding: "0.75rem",
                    background: "var(--surface-soft)",
                    borderRadius: "var(--radius-sm)",
                    fontSize: "0.9rem"
                  }}
                >
                  {Math.max(reponerDraft.unitsDeliveredWithAlcohol, currentEditingClient?.baseQuantityWithAlcohol ?? 0)}A
                  {" · "}
                  {Math.max(reponerDraft.unitsDeliveredWithoutAlcohol, currentEditingClient?.baseQuantityWithoutAlcohol ?? 0)}SA
                </div>
              </Field>
              <Field label="Notas">
                <TextArea
                  value={reponerDraft.notes}
                  onChange={(e) => setReponerDraft({ ...reponerDraft, notes: e.currentTarget.value })}
                  placeholder="Observaciones..."
                />
              </Field>
            </div>
          )}

          {mode.kind === "recoger" && currentEditingClient && (
            <div className="grid-2">
              <Field
                label={`Unidades recogidas con alcohol (máx ${currentEditingClient.baseQuantityWithAlcohol})`}
              >
                <Input
                  type="number"
                  value={displayNumber(recogerDraft.unitsCollectedWithAlcohol)}
                  onChange={(e) => {
                    const next = parseNumber(e.currentTarget.value);
                    setRecogerDraft({
                      ...recogerDraft,
                      unitsCollectedWithAlcohol: Math.min(
                        next,
                        currentEditingClient.baseQuantityWithAlcohol
                      )
                    });
                  }}
                  min={0}
                  max={currentEditingClient.baseQuantityWithAlcohol}
                />
              </Field>
              <Field
                label={`Unidades recogidas sin alcohol (máx ${currentEditingClient.baseQuantityWithoutAlcohol})`}
              >
                <Input
                  type="number"
                  value={displayNumber(recogerDraft.unitsCollectedWithoutAlcohol)}
                  onChange={(e) => {
                    const next = parseNumber(e.currentTarget.value);
                    setRecogerDraft({
                      ...recogerDraft,
                      unitsCollectedWithoutAlcohol: Math.min(
                        next,
                        currentEditingClient.baseQuantityWithoutAlcohol
                      )
                    });
                  }}
                  min={0}
                  max={currentEditingClient.baseQuantityWithoutAlcohol}
                />
              </Field>
              <Field label="Faltantes a cobrar">
                <div
                  style={{
                    padding: "0.75rem",
                    background: "var(--surface-soft)",
                    borderRadius: "var(--radius-sm)"
                  }}
                >
                  <strong>
                    {recogerFaltantesWith}A / {recogerFaltantesWithout}SA
                  </strong>
                </div>
              </Field>
              <Field label="Monto a cobrar">
                <div
                  style={{
                    padding: "0.75rem",
                    background: "var(--surface-soft)",
                    borderRadius: "var(--radius-sm)"
                  }}
                >
                  <strong>{formatCurrency(recogerAmount)}</strong>
                </div>
              </Field>
              <Field label="Devolución al stock">
                <div
                  style={{
                    padding: "0.75rem",
                    background: "var(--surface-soft)",
                    borderRadius: "var(--radius-sm)",
                    fontSize: "0.9rem",
                    color: "var(--muted)"
                  }}
                >
                  {recogerDraft.unitsCollectedWithAlcohol + recogerDraft.unitsCollectedWithoutAlcohol}{" "}
                  unidades volverán al stock con su lote original (FIFO por vencimiento).
                </div>
              </Field>
              <Field label="Notas">
                <TextArea
                  value={recogerDraft.notes}
                  onChange={(e) => setRecogerDraft({ ...recogerDraft, notes: e.currentTarget.value })}
                  placeholder="Observaciones..."
                />
              </Field>
            </div>
          )}

          {mode.kind === "historial" && currentEditingClient && (
            <div style={{ marginTop: "1rem", color: "var(--muted)", fontSize: "0.9rem" }}>
              <p>
                {currentEditingClient.address}
                {currentEditingClient.phone ? ` · ${currentEditingClient.phone}` : ""}
              </p>
              <a
                href={googleMapsUrl(currentEditingClient)}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--accent)", textDecoration: "underline" }}
              >
                Ver en Google Maps
              </a>
            </div>
          )}

          {mode.kind === "reactivar" && currentEditingClient && (
            <div className="grid-2">
              <Field label="Unidades a entregar con alcohol">
                <Input
                  type="number"
                  value={displayNumber(reactivarDraft.unitsWithAlcohol)}
                  onChange={(e) =>
                    setReactivarDraft({ ...reactivarDraft, unitsWithAlcohol: parseNumber(e.currentTarget.value) })
                  }
                  min={0}
                />
              </Field>
              <Field label="Unidades a entregar sin alcohol">
                <Input
                  type="number"
                  value={displayNumber(reactivarDraft.unitsWithoutAlcohol)}
                  onChange={(e) =>
                    setReactivarDraft({ ...reactivarDraft, unitsWithoutAlcohol: parseNumber(e.currentTarget.value) })
                  }
                  min={0}
                />
              </Field>
              <Field label={`Precio con alcohol (anterior: $${currentEditingClient.priceWithAlcohol ?? defaultPriceWithAlcohol})`}>
                <Input
                  type="number"
                  value={reactivarDraft.priceWithAlcohol}
                  onChange={(e) =>
                    setReactivarDraft({ ...reactivarDraft, priceWithAlcohol: e.currentTarget.value })
                  }
                  placeholder={(currentEditingClient.priceWithAlcohol ?? defaultPriceWithAlcohol).toString()}
                  min={1}
                  step="any"
                />
              </Field>
              <Field label={`Precio sin alcohol (anterior: $${currentEditingClient.priceWithoutAlcohol ?? defaultPriceWithoutAlcohol})`}>
                <Input
                  type="number"
                  value={reactivarDraft.priceWithoutAlcohol}
                  onChange={(e) =>
                    setReactivarDraft({ ...reactivarDraft, priceWithoutAlcohol: e.currentTarget.value })
                  }
                  placeholder={(currentEditingClient.priceWithoutAlcohol ?? defaultPriceWithoutAlcohol).toString()}
                  min={1}
                  step="any"
                />
              </Field>
              <Field label="Notas">
                <TextArea
                  value={reactivarDraft.notes}
                  onChange={(e) => setReactivarDraft({ ...reactivarDraft, notes: e.currentTarget.value })}
                  placeholder="Observaciones de reactivación..."
                />
              </Field>
            </div>
          )}

          <div className="actions">
            {mode.kind !== "create" && (
              <Button onClick={cancelEdit} variant="ghost">
                Cancelar
              </Button>
            )}
            {mode.kind !== "historial" && (
              <Button onClick={onSubmit}>
                {mode.kind === "create" ? <Plus size={16} /> : null}
                {submitLabel}
              </Button>
            )}
          </div>

          {(mode.kind === "reponer" ||
            mode.kind === "recoger" ||
            mode.kind === "historial" ||
            mode.kind === "reactivar") &&
            currentEditingClient &&
            timelineEvents.length > 0 && (
              <div className="consignment-timeline">
                <h4>Historial de movimientos</h4>
                <ul>
                  {timelineEvents.map((ev) => (
                    <li key={ev.id} className={`timeline-event timeline-${ev.kind}`}>
                      <div className="timeline-event-head">
                        <strong>{ev.label}</strong>
                        <span>{formatDateTime(ev.createdAt)}</span>
                      </div>
                      <div className="timeline-event-body">
                        <span>{ev.units}</span>
                        {ev.amount > 0 && <span>{formatCurrency(ev.amount)}</span>}
                      </div>
                      {ev.notes && <p className="timeline-event-notes">{ev.notes}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
        </div>

        <div className="table-card">
          {urgentClients.length > 0 && (
            <div className="alert-banner">
              <span>
                <strong>{overdueCount} vencidas</strong>, <strong>{upcomingCount} próximas</strong>
              </span>
              {urgentClients.map((client) => (
                <Button
                  key={client.id}
                  variant="secondary"
                  onClick={() => loadClientForReponer(client.id)}
                  style={{ fontSize: "0.85rem" }}
                >
                  {client.name}
                </Button>
              ))}
            </div>
          )}

          <div className="table-head">
            <div>
              <h3>Clientes</h3>
              <p>
                {activeClients.length} activos · {historicalClients.length} históricos
              </p>
            </div>
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                fontSize: "0.85rem"
              }}
            >
              <input
                type="checkbox"
                checked={showHistorical}
                onChange={(e) => setShowHistorical(e.currentTarget.checked)}
              />
              Mostrar histórico
            </label>
          </div>

          <div className="consignment-cards">
            {visibleClients.length === 0 ? (
              <p style={{ padding: "1rem", color: "var(--muted)" }}>Sin clientes para mostrar.</p>
            ) : (
              visibleClients.map((client) => {
                const repsForClient = consignmentReplenishments.filter(
                  (r) => r.clientId === client.id
                );
                const lastReplenishment = repsForClient.sort(
                  (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)
                )[0];

                const totalCharged =
                  repsForClient.reduce((s, r) => s + r.amountCharged, 0) +
                  consignmentPickups
                    .filter((p) => p.clientId === client.id)
                    .reduce((s, p) => s + p.amountCharged, 0);

                const valuePending =
                  client.baseQuantityWithAlcohol *
                    (client.priceWithAlcohol ?? defaultPriceWithAlcohol) +
                  client.baseQuantityWithoutAlcohol *
                    (client.priceWithoutAlcohol ?? defaultPriceWithoutAlcohol);

                const status = resolveClientStatus(client);
                const days = daysUntil(client.nextReplenishmentDate);
                const isClosed =
                  client.baseQuantityWithAlcohol === 0 && client.baseQuantityWithoutAlcohol === 0;

                return (
                  <article key={client.id} className="consignment-card">
                    <header className="consignment-card-head">
                      <span className={status.badgeClass}>{status.label}</span>
                      <strong>{client.name}</strong>
                    </header>
                    <div className="consignment-card-meta">
                      <span>{client.address}</span>
                      {client.phone && <span>📞 {client.phone}</span>}
                      {client.contactName && <span>👤 {client.contactName}</span>}
                    </div>
                    <div className="consignment-card-stats">
                      <div>
                        <span>Base actual</span>
                        <strong>
                          {client.baseQuantityWithAlcohol}A / {client.baseQuantityWithoutAlcohol}SA
                        </strong>
                      </div>
                      <div>
                        <span>Valor pendiente</span>
                        <strong>{formatCurrency(valuePending)}</strong>
                      </div>
                      <div>
                        <span>Próxima reposición</span>
                        <strong>
                          {isClosed ? (
                            "Cerrado"
                          ) : (
                            <>
                              {formatDateIso(client.nextReplenishmentDate)}
                              <em
                                style={{ marginLeft: "0.35rem", fontStyle: "normal", opacity: 0.7 }}
                              >
                                ({days >= 0 ? `en ${days}d` : `${Math.abs(days)}d atrás`})
                              </em>
                            </>
                          )}
                        </strong>
                      </div>
                      {lastReplenishment && (
                        <div>
                          <span>Última reposición</span>
                          <strong>{formatDateTime(lastReplenishment.createdAt)}</strong>
                        </div>
                      )}
                      <div>
                        <span>Cobrado histórico</span>
                        <strong>{formatCurrency(totalCharged)}</strong>
                      </div>
                    </div>
                    {client.notes && (
                      <p className="consignment-card-notes">📝 {client.notes}</p>
                    )}
                    <div className="consignment-card-actions">
                      {isClosed ? (
                        <>
                          <Button variant="ghost" onClick={() => loadClientForHistorial(client.id)}>
                            Historial
                          </Button>
                          <Button variant="ghost" onClick={() => loadClientForReactivar(client.id)}>
                            Reactivar
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button variant="ghost" onClick={() => loadClientForEdit(client.id)}>
                            Editar
                          </Button>
                          <Button variant="ghost" onClick={() => loadClientForReponer(client.id)}>
                            Reponer
                          </Button>
                          <Button variant="ghost" onClick={() => loadClientForRecoger(client.id)}>
                            Recoger
                          </Button>
                        </>
                      )}
                      <a
                        href={googleMapsUrl(client)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="button button-ghost"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.25rem",
                          fontSize: "0.9rem"
                        }}
                      >
                        <MapPin size={14} /> Mapa
                      </a>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </div>
      </div>

      <InvoiceSuccessModal
        open={successInvoice !== null}
        invoice={successInvoice}
        companyInfo={state.companyInfo}
        onClose={() => setSuccessInvoice(null)}
      />
      <InvoiceHistoryModal
        open={historyOpen}
        title="Facturas de consignaciones"
        entries={invoiceHistory}
        companyInfo={state.companyInfo}
        onClose={() => setHistoryOpen(false)}
      />
    </Section>
  );
}
