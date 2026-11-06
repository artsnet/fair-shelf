/**
 * Calendar-day arithmetic on `YYYY-MM-DD` strings. The library never looks at a clock or a time
 * zone: the caller decides what "today" is (for example midnight in the audience's time zone) and
 * passes it in, so a selection is reproducible on any server.
 */

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function assertCalendarDate(value: unknown, what = "date"): string {
  if (!isCalendarDate(value)) throw new TypeError(`${what} must be a valid YYYY-MM-DD string, got ${JSON.stringify(value)}`);
  return value;
}

/** Days since 1970-01-01 (UTC) for a calendar date. */
export function dayNumber(date: string): number {
  return Math.floor(Date.parse(`${assertCalendarDate(date)}T00:00:00Z`) / 86_400_000);
}

export function shiftDate(date: string, days: number): string {
  const shifted = new Date(`${assertCalendarDate(date)}T00:00:00.000Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

/** `to - from` in whole days; positive when `to` is later. */
export function daysBetween(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from);
}

/** Turns a Date or ISO timestamp into the UTC calendar date it falls on. Returns null for null/invalid input. */
export function toCalendarDate(value: string | Date | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && isCalendarDate(value)) return value;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}
