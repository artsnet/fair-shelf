import { shiftDate } from "./dates.js";
import type { ExposureFacts, Item, Pick, Shelf } from "./types.js";

export type SimulationItem<T> = Omit<Item<T>, keyof ExposureFacts> & { id: string } & Partial<Omit<ExposureFacts, "id">>;

export type SimulateOptions<T, A> = {
  shelf: Shelf<T, A>;
  /** Items without exposure facts start fresh (never shown). */
  items: readonly SimulationItem<T>[];
  /** First simulated date, `YYYY-MM-DD`. */
  startDate: string;
  days: number;
  /** One selection per audience per day. Default: a single `undefined` audience. */
  audiences?: readonly A[];
  /** `exposure` is recomputed each day as the number of showings within this many days. Default 90. */
  exposureWindowDays?: number;
  /** Keep every day's picks in the result (memory grows with days × audiences). Default false. */
  log?: boolean;
};

export type ItemStats = {
  id: string;
  shown: number;
  /** Share of all pick slots over the run. */
  share: number;
  firstShown: string | null;
  lastShown: string | null;
  /** Longest run of days without being shown, including the lead-in before the first showing and the tail after the last. */
  maxGap: number;
  byRole: Record<string, number>;
  byLane: Record<string, number>;
};

export type SimulationResult<A> = {
  days: number;
  audiences: number;
  /** Total pick slots that were filled. */
  picks: number;
  items: ItemStats[];
  summary: {
    itemCount: number;
    neverShown: number;
    min: number;
    max: number;
    mean: number;
    /** 0 = everyone shown equally often, 1 = one item took everything. */
    gini: number;
    /** How many picks needed each relaxation level (0 none … 3 role ignored). */
    relaxation: Record<0 | 1 | 2 | 3, number>;
  };
  log?: Array<{ date: string; audience: A; picks: Array<{ position: number; id: string; role: string; lane: string; relaxation: number }> }>;
};

export function gini(values: readonly number[]): number {
  const sorted = values.filter((value) => Number.isFinite(value)).slice().sort((a, b) => a - b);
  const n = sorted.length;
  const total = sorted.reduce((sum, value) => sum + value, 0);
  if (n === 0 || total === 0) return 0;
  let weighted = 0;
  sorted.forEach((value, index) => {
    weighted += (index + 1) * value;
  });
  return (2 * weighted) / (n * total) - (n + 1) / n;
}

/**
 * Replays the shelf day by day, feeding each day's picks back as exposure, and reports how evenly
 * showings were spread. Deterministic, so a simulation doubles as a regression test for a config.
 */
export function simulate<T, A = unknown>(options: SimulateOptions<T, A>): SimulationResult<A> {
  const { shelf, startDate, days } = options;
  if (!Number.isInteger(days) || days < 1) throw new TypeError("days must be a positive integer");
  const windowDays = options.exposureWindowDays ?? 90;
  const audiences = options.audiences && options.audiences.length > 0 ? options.audiences : ([undefined] as unknown as readonly A[]);

  const state = options.items.map((item) => ({
    ...(item as Item<T>),
    exposure: item.exposure ?? 0,
    lastShown: item.lastShown ?? null,
    shownDates: [...(item.shownDates ?? [])],
  })) as Array<Item<T> & { shownDates: string[] }>;
  const stats = new Map<string, ItemStats & { previousShown: string | null }>(
    state.map((item) => [item.id, { id: item.id, shown: 0, share: 0, firstShown: null, lastShown: null, maxGap: 0, byRole: {}, byLane: {}, previousShown: null }]),
  );
  const relaxation: Record<0 | 1 | 2 | 3, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
  const log: NonNullable<SimulationResult<A>["log"]> = [];
  let picksTotal = 0;

  let date = startDate;
  for (let day = 0; day < days; day += 1) {
    const windowStart = shiftDate(date, 1 - windowDays);
    for (const item of state) {
      item.shownDates = item.shownDates.filter((shown) => shown >= windowStart);
      item.exposure = item.shownDates.length;
    }
    const todaysPicks: Pick<T>[] = [];
    for (const audience of audiences) {
      const picks = shelf.select({ date, audience, items: state });
      todaysPicks.push(...picks);
      if (options.log) log.push({ date, audience, picks: picks.map(({ position, id, role, lane, relaxation: level }) => ({ position, id, role, lane, relaxation: level })) });
    }
    for (const pick of todaysPicks) {
      picksTotal += 1;
      relaxation[pick.relaxation] += 1;
      const stat = stats.get(pick.id) as ItemStats & { previousShown: string | null };
      stat.shown += 1;
      stat.byRole[pick.role] = (stat.byRole[pick.role] ?? 0) + 1;
      stat.byLane[pick.lane] = (stat.byLane[pick.lane] ?? 0) + 1;
      if (stat.firstShown === null) {
        stat.firstShown = date;
        stat.maxGap = Math.max(stat.maxGap, day);
      } else if (stat.previousShown !== null && stat.previousShown !== date) {
        stat.maxGap = Math.max(stat.maxGap, dayIndex(startDate, date) - dayIndex(startDate, stat.previousShown) - 1);
      }
      stat.lastShown = date;
      stat.previousShown = date;
    }
    // Feed today's picks back as exposure (deduplicated per item per day).
    const shownToday = new Set(todaysPicks.map((pick) => pick.id));
    for (const item of state) {
      if (!shownToday.has(item.id)) continue;
      item.shownDates.push(date);
      item.lastShown = date;
    }
    date = shiftDate(date, 1);
  }

  const items = Array.from(stats.values()).map(({ previousShown, ...stat }) => {
    const tail = stat.lastShown === null ? days : days - 1 - dayIndex(startDate, stat.lastShown);
    return { ...stat, maxGap: Math.max(stat.maxGap, tail), share: picksTotal === 0 ? 0 : stat.shown / picksTotal };
  });
  const counts = items.map((item) => item.shown);
  const result: SimulationResult<A> = {
    days,
    audiences: audiences.length,
    picks: picksTotal,
    items,
    summary: {
      itemCount: items.length,
      neverShown: counts.filter((count) => count === 0).length,
      min: counts.length ? Math.min(...counts) : 0,
      max: counts.length ? Math.max(...counts) : 0,
      mean: counts.length ? counts.reduce((sum, count) => sum + count, 0) / counts.length : 0,
      gini: gini(counts),
      relaxation,
    },
  };
  if (options.log) result.log = log;
  return result;
}

function dayIndex(startDate: string, date: string): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000);
}
