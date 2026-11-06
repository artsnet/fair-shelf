import { describe, expect, it } from "vitest";
import { editorialPreset, rotationPreset } from "../src/presets.js";
import { formatSimulation } from "../src/report.js";
import { createShelf } from "../src/shelf.js";
import { gini, simulate } from "../src/simulate.js";

describe("gini", () => {
  it("is 0 for equal shares, near 1 for one winner, 0 for empty", () => {
    expect(gini([5, 5, 5, 5])).toBe(0);
    expect(gini([0, 0, 0, 100])).toBeCloseTo(0.75, 5);
    expect(gini([])).toBe(0);
    expect(gini([0, 0])).toBe(0);
  });
});

describe("simulate", () => {
  it("spreads a plain rotation evenly over a long run", () => {
    const shelf = createShelf(rotationPreset({ size: 3, cooldownDays: 3 }));
    const items = Array.from({ length: 30 }, (_, i) => ({ id: `item-${i}` }));
    const result = simulate({ shelf, items, startDate: "2026-01-01", days: 120 });
    expect(result.picks).toBe(360);
    expect(result.summary.neverShown).toBe(0);
    expect(result.summary.max - result.summary.min).toBeLessThanOrEqual(1);
    expect(result.summary.gini).toBeLessThan(0.05);
    expect(result.summary.relaxation[0]).toBe(360);
    expect(result.items.every((item) => item.maxGap <= 12)).toBe(true);
  });

  it("feeds showings back as exposure and respects the lookback window", () => {
    const shelf = createShelf(rotationPreset({ size: 1, cooldownDays: 0 }));
    const items = [{ id: "a" }, { id: "b" }];
    const result = simulate({ shelf, items, startDate: "2026-01-01", days: 6, exposureWindowDays: 2, log: true });
    const sequence = result.log?.map((entry) => entry.picks[0]?.id);
    expect(sequence).toEqual(["a", "b", "a", "b", "a", "b"]);
    expect(result.items.find((item) => item.id === "a")?.maxGap).toBe(1);
  });

  it("runs one selection per audience per day and keeps editorial roles", () => {
    const shelf = createShelf<{ publishedAt: string; language: string }, string>(editorialPreset<{ publishedAt: string; language: string }, string>());
    const items = Array.from({ length: 20 }, (_, i) => ({ id: `s${i}`, publishedAt: "2025-12-25", language: i % 2 ? "ja" : "en" }));
    const result = simulate({ shelf, items, startDate: "2026-01-01", days: 30, audiences: ["ja", "en"] });
    expect(result.audiences).toBe(2);
    expect(result.picks).toBe(180);
    const roles = new Set(result.items.flatMap((item) => Object.keys(item.byRole)));
    expect(roles).toEqual(new Set(["new", "underexposed", "rediscovery"]));
    expect(result.summary.neverShown).toBe(0);
  });

  it("validates days and reports a thin pool through relaxation counts", () => {
    const shelf = createShelf(rotationPreset({ size: 3, cooldownDays: 3 }));
    expect(() => simulate({ shelf, items: [], startDate: "2026-01-01", days: 0 })).toThrow(/days/);
    const result = simulate({ shelf, items: [{ id: "only" }, { id: "two" }], startDate: "2026-01-01", days: 5 });
    expect(result.picks).toBe(10);
    expect(result.summary.relaxation[1]).toBeGreaterThan(0);
  });

  it("formats a readable table", () => {
    const shelf = createShelf(rotationPreset({ size: 2 }));
    const text = formatSimulation(simulate({ shelf, items: [{ id: "alpha" }, { id: "beta" }, { id: "gamma" }], startDate: "2026-01-01", days: 9 }));
    expect(text).toContain("9 days × 1 audience(s): 18 picks over 3 items");
    expect(text).toMatch(/alpha\s+6\s+33\.3%/);
    expect(text).toContain("underexposed:6");
  });
});
