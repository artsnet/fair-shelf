import { describe, expect, it } from "vitest";
import { assertCalendarDate, dayNumber, daysBetween, isCalendarDate, shiftDate, toCalendarDate } from "../src/dates.js";

describe("calendar dates", () => {
  it("validates YYYY-MM-DD strictly", () => {
    expect(isCalendarDate("2026-02-28")).toBe(true);
    expect(isCalendarDate("2026-02-30")).toBe(false);
    expect(isCalendarDate("2026-2-3")).toBe(false);
    expect(isCalendarDate("2026-11-07T00:00:00Z")).toBe(false);
    expect(isCalendarDate(20261107)).toBe(false);
    expect(() => assertCalendarDate("nope", "lastShown")).toThrow(/lastShown must be a valid YYYY-MM-DD/);
  });

  it("shifts and measures in whole days across month and year ends", () => {
    expect(shiftDate("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftDate("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetween("2026-01-01", "2026-12-31")).toBe(364);
    expect(daysBetween("2026-01-02", "2026-01-01")).toBe(-1);
    expect(dayNumber("1970-01-02")).toBe(1);
  });

  it("converts timestamps and Dates to the UTC calendar date, and passes nulls through", () => {
    expect(toCalendarDate("2026-11-07")).toBe("2026-11-07");
    expect(toCalendarDate("2026-11-07T23:59:59Z")).toBe("2026-11-07");
    expect(toCalendarDate(new Date("2026-11-07T12:00:00Z"))).toBe("2026-11-07");
    expect(toCalendarDate(null)).toBeNull();
    expect(toCalendarDate(undefined)).toBeNull();
    expect(toCalendarDate("garbage")).toBeNull();
  });
});
