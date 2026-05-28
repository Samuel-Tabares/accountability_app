import type {
  ConsignmentClient,
  ConsignmentPickup,
  ConsignmentReactivation,
  ConsignmentReplenishment,
  Sale
} from "@/src/lib/types";

const PREFIX = {
  wholesale: "VM",
  consignment_initial: "EC",
  consignment_replenishment: "RC",
  consignment_pickup: "RG",
  consignment_reactivation: "RA"
} as const;

function pad(n: number, width = 4): string {
  return String(n).padStart(width, "0");
}

function positionByCreatedAt<T extends { id: string; createdAt: string }>(
  items: readonly T[],
  targetId: string
): number {
  const sorted = items
    .slice()
    .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
  const idx = sorted.findIndex((item) => item.id === targetId);
  return idx === -1 ? sorted.length + 1 : idx + 1;
}

export function wholesaleNumber(sales: readonly Sale[], targetId: string): string {
  const wholesales = sales.filter((s) => s.saleType === "wholesale");
  return `${PREFIX.wholesale}-${pad(positionByCreatedAt(wholesales, targetId))}`;
}

export function initialConsignmentNumber(
  clients: readonly ConsignmentClient[],
  targetId: string
): string {
  return `${PREFIX.consignment_initial}-${pad(positionByCreatedAt(clients, targetId))}`;
}

export function replenishmentNumber(
  replenishments: readonly ConsignmentReplenishment[],
  targetId: string
): string {
  return `${PREFIX.consignment_replenishment}-${pad(positionByCreatedAt(replenishments, targetId))}`;
}

export function pickupNumber(
  pickups: readonly ConsignmentPickup[],
  targetId: string
): string {
  return `${PREFIX.consignment_pickup}-${pad(positionByCreatedAt(pickups, targetId))}`;
}

export function reactivationNumber(
  reactivations: readonly ConsignmentReactivation[],
  targetId: string
): string {
  return `${PREFIX.consignment_reactivation}-${pad(positionByCreatedAt(reactivations, targetId))}`;
}

// Para registros recién creados que aún no están en state: el número será
// (cantidad actual + 1). Se usa al mostrar el modal de éxito tras un POST,
// antes de que el router refresque el state global.
export function predictNextNumber(
  kind: keyof typeof PREFIX,
  currentCount: number
): string {
  return `${PREFIX[kind]}-${pad(currentCount + 1)}`;
}
