import { assertCalendarDate, dayNumber, daysBetween, shiftDate, toCalendarDate } from "./dates.js";
import { hash } from "./hash.js";
import type { Context, Item, Lane, Pick, SelectInput, Shelf, ShelfConfig, Slot } from "./types.js";

export const DEFAULT_COOLDOWN_DAYS = 3;
export const DEFAULT_VERSION = "v1";
const ANY_LANE: Lane<never, never> = { name: "any" };

function audienceKey(audience: unknown): string {
  if (audience === undefined) return "";
  if (typeof audience === "string") return audience;
  try {
    return JSON.stringify(audience) ?? String(audience);
  } catch {
    return String(audience);
  }
}

function makeContext<A>(date: string, audience: A): Context<A> {
  const daysSince = (value: string | Date | null | undefined): number | null => {
    const day = toCalendarDate(value);
    return day === null ? null : daysBetween(day, date);
  };
  return {
    date,
    audience,
    daysSince,
    withinDays: (value, days) => {
      const gap = daysSince(value);
      return gap !== null && gap >= 0 && gap < days;
    },
  };
}

function validateConfig<T, A>(config: ShelfConfig<T, A>): Shelf<T, A>["config"] {
  if (!Array.isArray(config.slots) || config.slots.length === 0) throw new TypeError("slots must be a non-empty array");
  const roles = new Set<string>();
  for (const slot of config.slots) {
    if (!slot || typeof slot.role !== "string" || !slot.role) throw new TypeError("every slot needs a non-empty role");
    roles.add(slot.role);
  }
  const lanes = config.lanes && config.lanes.length > 0 ? config.lanes : [ANY_LANE as Lane<T, A>];
  for (const lane of lanes) if (!lane || typeof lane.name !== "string" || !lane.name) throw new TypeError("every lane needs a non-empty name");
  const cooldownDays = config.cooldownDays ?? DEFAULT_COOLDOWN_DAYS;
  if (!Number.isInteger(cooldownDays) || cooldownDays < 0) throw new TypeError("cooldownDays must be a non-negative integer");
  const version = config.version ?? DEFAULT_VERSION;
  if (typeof version !== "string" || !version) throw new TypeError("version must be a non-empty string");
  return { slots: config.slots, lanes, cooldownDays, version };
}

function validateItems<T>(items: readonly Item<T>[]): void {
  if (!Array.isArray(items)) throw new TypeError("items must be an array");
  const seen = new Set<string>();
  for (const item of items) {
    if (!item || typeof item.id !== "string" || !item.id) throw new TypeError("every item needs a non-empty string id");
    if (seen.has(item.id)) throw new TypeError(`duplicate item id ${JSON.stringify(item.id)}`);
    seen.add(item.id);
    if (typeof item.exposure !== "number" || Number.isNaN(item.exposure)) throw new TypeError(`item ${item.id}: exposure must be a number`);
    if (item.lastShown !== null && item.lastShown !== undefined) assertCalendarDate(item.lastShown, `item ${item.id}: lastShown`);
    for (const date of item.shownDates ?? []) assertCalendarDate(date, `item ${item.id}: shownDates entry`);
  }
}

/**
 * Builds a shelf. `select` fills each slot with the least-exposed eligible item, rotates lanes
 * across slots by date, skips items shown during the cooldown, and relaxes constraints one at a
 * time (cooldown, then lane, then role) only for positions that would otherwise stay empty.
 */
export function createShelf<T = Record<string, unknown>, A = unknown>(configInput: ShelfConfig<T, A>): Shelf<T, A> {
  const config = validateConfig(configInput);
  const size = config.slots.length;
  const laneCount = config.lanes.length;

  const rotationFor = (date: string, audience: A): { lanes: Lane<T, A>[]; order: number[] } => {
    const day = dayNumber(date);
    const key = audienceKey(audience);
    const laneRotation = (day + hash(`${key}|${config.version}|lanes`)) % laneCount;
    // The processing order decides which slot gets first choice; it shifts every `size` days so no slot is always first.
    const processingStart = (Math.floor(day / size) + hash(`${key}|${config.version}|order`)) % size;
    const lanes = config.slots.map((_, index) => config.lanes[(index + laneRotation) % laneCount] as Lane<T, A>);
    const order = Array.from({ length: size }, (_, index) => (index + processingStart) % size);
    return { lanes, order };
  };

  return {
    config,
    size,
    lanesFor(date, audience) {
      return rotationFor(assertCalendarDate(date), audience as A).lanes.map((lane) => lane.name);
    },
    select(input) {
      const date = assertCalendarDate(input.date);
      validateItems(input.items);
      const audience = input.audience as A;
      const context = makeContext(date, audience);
      const { lanes, order } = rotationFor(date, audience);
      const cooldownStart = shiftDate(date, -config.cooldownDays);
      const reserved = new Map<number, string>();
      for (const { position, id } of input.reserved ?? []) {
        if (!Number.isInteger(position) || position < 1 || position > size) throw new TypeError(`reserved position ${position} is outside 1..${size}`);
        reserved.set(position - 1, id);
      }
      const used = new Set(reserved.values());
      const selected = new Map<number, { item: Item<T>; relaxation: Pick<T>["relaxation"] }>();

      const matchesRole = (item: Item<T>, slot: Slot<T, A>) => (slot.match ? slot.match(item, context) : true);
      const matchesLane = (item: Item<T>, lane: Lane<T, A>) => (lane.match ? lane.match(item, context) : true);
      const inCooldown = (item: Item<T>) => {
        if (config.cooldownDays === 0) return false;
        const dates = item.shownDates ?? (item.lastShown ? [item.lastShown] : []);
        return dates.some((shown) => shown >= cooldownStart && shown < date);
      };
      const tieBreak = (item: Item<T>, slot: Slot<T, A>) => hash(`${date}|${audienceKey(audience)}|${config.version}|${slot.role}|${item.id}`);

      for (let pass = 0 as 0 | 1 | 2 | 3; pass < 4; pass = (pass + 1) as 0 | 1 | 2 | 3) {
        for (const index of order) {
          if (selected.has(index) || reserved.has(index)) continue;
          const slot = config.slots[index] as Slot<T, A>;
          const lane = lanes[index] as Lane<T, A>;
          const candidates = input.items.filter((item) => {
            if (used.has(item.id)) return false;
            if (pass === 0 && inCooldown(item)) return false;
            if (pass < 3 && !matchesRole(item, slot)) return false;
            if (pass < 2 && !matchesLane(item, lane)) return false;
            return true;
          });
          if (candidates.length === 0) continue;
          const scored = candidates.map((item) => ({
            item,
            laneMiss: pass >= 2 && !matchesLane(item, lane) ? 1 : 0, // once the lane is relaxed, still prefer items that fit it
            prefer: slot.prefer ? slot.prefer(item, context) : 0,
            tie: tieBreak(item, slot),
          }));
          scored.sort(
            (left, right) =>
              left.laneMiss - right.laneMiss ||
              left.item.exposure - right.item.exposure ||
              (left.item.lastShown ?? "").localeCompare(right.item.lastShown ?? "") ||
              left.prefer - right.prefer ||
              left.tie - right.tie ||
              left.item.id.localeCompare(right.item.id),
          );
          const winner = (scored[0] as (typeof scored)[number]).item;
          selected.set(index, { item: winner, relaxation: pass });
          used.add(winner.id);
        }
      }

      return config.slots.flatMap((slot, index): Pick<T>[] => {
        const chosen = selected.get(index);
        if (!chosen) return [];
        return [{ position: index + 1, id: chosen.item.id, role: slot.role, lane: (lanes[index] as Lane<T, A>).name, item: chosen.item, relaxation: chosen.relaxation }];
      });
    },
  };
}
