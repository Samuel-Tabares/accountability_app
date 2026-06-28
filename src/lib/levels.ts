import type { Level } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Each reward cycle is a rolling 30-day window anchored to the ambassador's join date. */
export const CYCLE_DAYS = 30;

/** Last N days of the cycle where rewards become claimable. */
export const PAYOUT_WINDOW_DAYS = 5;

export type LevelConfig = {
  level: Level;
  label: string;
  /** Minimum units sold in the cycle to hold this level. */
  minUnits: number;
  /** Base salary in COP paid at cycle close while at this level. */
  baseSalary: number;
  /** Free units granted at cycle close at this level. */
  freeUnits: number;
  /** Monthly stories/reels quota (program rule, not auto-verified by the app). */
  storiesQuota: number;
  /** Badge visual identity. */
  badge: {
    emoji: string;
    accent: string;
    glow: string;
  };
};

export const LEVELS: LevelConfig[] = [
  {
    level: "nivel0",
    label: "Nivel 0",
    minUnits: 0,
    baseSalary: 0,
    freeUnits: 0,
    storiesQuota: 0,
    badge: { emoji: "🌱", accent: "#9aa0a6", glow: "rgba(154,160,166,0.35)" }
  },
  {
    level: "plata",
    label: "Plata",
    minUnits: 99,
    baseSalary: 100_000,
    freeUnits: 5,
    storiesQuota: 2,
    badge: { emoji: "🥈", accent: "#b8c2cc", glow: "rgba(184,194,204,0.45)" }
  },
  {
    level: "oro",
    label: "Oro",
    minUnits: 199,
    baseSalary: 200_000,
    freeUnits: 7,
    storiesQuota: 4,
    badge: { emoji: "🥇", accent: "#e8b923", glow: "rgba(232,185,35,0.45)" }
  },
  {
    level: "diamante",
    label: "Diamante",
    minUnits: 399,
    baseSalary: 350_000,
    freeUnits: 10,
    storiesQuota: 4,
    badge: { emoji: "💎", accent: "#4cc9f0", glow: "rgba(76,201,240,0.5)" }
  }
];

const LEVELS_DESC = [...LEVELS].sort((a, b) => b.minUnits - a.minUnits);

export function levelConfig(level: Level): LevelConfig {
  return LEVELS.find((entry) => entry.level === level) ?? LEVELS[0];
}

/** Resolve the level a given cycle unit count qualifies for. */
export function computeLevel(unitsInCycle: number): LevelConfig {
  return LEVELS_DESC.find((entry) => unitsInCycle >= entry.minUnits) ?? LEVELS[0];
}

export type LevelProgress = {
  current: LevelConfig;
  next: LevelConfig | null;
  unitsInCycle: number;
  unitsToNext: number;
  /** 0..1 progress from current threshold to next threshold. */
  pct: number;
};

export function levelProgress(unitsInCycle: number): LevelProgress {
  const current = computeLevel(unitsInCycle);
  const currentIndex = LEVELS.findIndex((entry) => entry.level === current.level);
  const next = currentIndex >= 0 && currentIndex < LEVELS.length - 1 ? LEVELS[currentIndex + 1] : null;

  if (!next) {
    return { current, next: null, unitsInCycle, unitsToNext: 0, pct: 1 };
  }

  const span = next.minUnits - current.minUnits;
  const gained = unitsInCycle - current.minUnits;
  const pct = span > 0 ? Math.min(1, Math.max(0, gained / span)) : 1;
  return { current, next, unitsInCycle, unitsToNext: Math.max(0, next.minUnits - unitsInCycle), pct };
}

// ── Personal cycle: rolling 30-day windows anchored to the join date ──────────
// Each ambassador's cycle is independent: it starts the day they joined and
// resets every 30 days, so two ambassadors can be at different points in their
// own cycle at the same time.

/** Index of the 30-day cycle a date falls in, relative to the join anchor. */
function cycleIndexOf(anchor: Date, date: Date): number {
  const elapsed = date.getTime() - anchor.getTime();
  return elapsed <= 0 ? 0 : Math.floor(elapsed / (CYCLE_DAYS * DAY_MS));
}

function cycleBounds(anchor: Date, index: number): { start: Date; end: Date } {
  const start = new Date(anchor.getTime() + index * CYCLE_DAYS * DAY_MS);
  const end = new Date(start.getTime() + CYCLE_DAYS * DAY_MS);
  return { start, end };
}

function rangeLabel(start: Date, end: Date): string {
  const fmt = new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "short", timeZone: "America/Bogota" });
  // `end` is exclusive; show the last day of the window (end - 1 day).
  const lastDay = new Date(end.getTime() - DAY_MS);
  return `${fmt.format(start)} – ${fmt.format(lastDay)}`;
}

/** Sum wholesale units sold within the ambassador's current cycle. */
export function currentCycleUnits(
  sales: Array<{ created_at: string; quantity: number | string | null }>,
  anchor: Date,
  now: Date = new Date()
): number {
  const currentIndex = cycleIndexOf(anchor, now);
  return sales.reduce((total, sale) => {
    return cycleIndexOf(anchor, new Date(sale.created_at)) === currentIndex
      ? total + Number(sale.quantity ?? 0)
      : total;
  }, 0);
}

export type CycleInfo = {
  /** e.g. "12 jun – 11 jul" */
  label: string;
  start: Date;
  end: Date;
  /** Whole days left until the cycle resets. */
  daysRemaining: number;
  totalDays: number;
  /** True during the last PAYOUT_WINDOW_DAYS days — rewards claimable. */
  payoutWindow: boolean;
};

export function cycleInfo(anchor: Date, now: Date = new Date()): CycleInfo {
  const index = cycleIndexOf(anchor, now);
  const { start, end } = cycleBounds(anchor, index);
  const daysRemaining = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / DAY_MS));
  return {
    label: rangeLabel(start, end),
    start,
    end,
    daysRemaining,
    totalDays: CYCLE_DAYS,
    payoutWindow: daysRemaining <= PAYOUT_WINDOW_DAYS
  };
}

export type ClosedCycle = {
  index: number;
  start: Date;
  end: Date;
  label: string;
  units: number;
  level: LevelConfig;
};

/**
 * Closed cycles (cycle_end < now) that have wholesale units — candidates for
 * base-salary liquidation. Newest first. Caller filters out already-paid ones.
 */
export function closedCycles(
  sales: Array<{ created_at: string; quantity: number | string | null }>,
  anchor: Date,
  now: Date = new Date()
): ClosedCycle[] {
  const buckets = new Map<number, number>();
  for (const sale of sales) {
    const index = cycleIndexOf(anchor, new Date(sale.created_at));
    buckets.set(index, (buckets.get(index) ?? 0) + Number(sale.quantity ?? 0));
  }

  const result: ClosedCycle[] = [];
  for (const [index, units] of buckets) {
    const { start, end } = cycleBounds(anchor, index);
    if (end.getTime() < now.getTime() && units > 0) {
      result.push({ index, start, end, label: rangeLabel(start, end), units, level: computeLevel(units) });
    }
  }
  return result.sort((a, b) => b.index - a.index);
}

export type CycleRecapRow = {
  /** Cycle index relative to join anchor. */
  index: number;
  label: string;
  units: number;
  level: LevelConfig;
  commissions: number;
  /** Base salary the cycle's units qualified for (estimate until paid as expense). */
  baseSalary: number;
  freeUnits: number;
  total: number;
};

type RecapSale = {
  created_at: string;
  quantity: number | string | null;
  commission_value: number | string | null;
};

/**
 * Compute-on-read history: group wholesale sales into the ambassador's personal
 * 30-day cycles and derive each cycle's level from units sold. Newest first.
 */
export function cycleHistory(sales: RecapSale[], anchor: Date): CycleRecapRow[] {
  const buckets = new Map<number, { units: number; commissions: number }>();

  for (const sale of sales) {
    const index = cycleIndexOf(anchor, new Date(sale.created_at));
    const bucket = buckets.get(index) ?? { units: 0, commissions: 0 };
    bucket.units += Number(sale.quantity ?? 0);
    bucket.commissions += Number(sale.commission_value ?? 0);
    buckets.set(index, bucket);
  }

  return Array.from(buckets.entries())
    .map(([index, bucket]) => {
      const level = computeLevel(bucket.units);
      const { start, end } = cycleBounds(anchor, index);
      return {
        index,
        label: rangeLabel(start, end),
        units: bucket.units,
        level,
        commissions: bucket.commissions,
        baseSalary: level.baseSalary,
        freeUnits: level.freeUnits,
        total: bucket.commissions + level.baseSalary
      };
    })
    .sort((a, b) => b.index - a.index);
}
