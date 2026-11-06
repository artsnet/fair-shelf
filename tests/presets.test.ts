import { describe, expect, it } from "vitest";
import { editorialPreset, rotationPreset } from "../src/presets.js";
import { createShelf } from "../src/shelf.js";

describe("rotationPreset", () => {
  it("builds N identical slots with one lane", () => {
    const shelf = createShelf(rotationPreset({ size: 4, cooldownDays: 1, version: "r1" }));
    expect(shelf.size).toBe(4);
    expect(shelf.config.slots.every((slot) => slot.role === "underexposed")).toBe(true);
    expect(shelf.config.lanes.map((lane) => lane.name)).toEqual(["any"]);
    expect(shelf.config.cooldownDays).toBe(1);
    expect(() => rotationPreset({ size: 0 })).toThrow(/size/);
  });

  it("spreads picks across the least exposed items", () => {
    const shelf = createShelf(rotationPreset({ size: 2, cooldownDays: 0 }));
    const items = [
      { id: "a", exposure: 3, lastShown: null },
      { id: "b", exposure: 0, lastShown: null },
      { id: "c", exposure: 1, lastShown: null },
    ];
    expect(shelf.select({ date: "2026-11-07", items }).map((pick) => pick.id).sort()).toEqual(["b", "c"]);
  });
});

describe("editorialPreset", () => {
  it("accepts custom accessors and windows", () => {
    type Product = { listedOn: Date; market: string };
    const shelf = createShelf<Product, string>(
      editorialPreset<Product, string>({ newDays: 7, rediscoveryDays: 10, publishedAt: (item) => item.listedOn, language: (item) => item.market }),
    );
    // One eligible item per role, so the outcome does not depend on which slot is processed first.
    const items = [
      { id: "fresh", listedOn: new Date("2026-11-05T00:00:00Z"), market: "jp", exposure: 2, lastShown: "2026-11-01" }, // new (2 days), seen 6 days ago
      { id: "old", listedOn: new Date("2026-01-01T00:00:00Z"), market: "us", exposure: 1, lastShown: "2026-10-01" }, // rediscovery (37 days)
      { id: "mid", listedOn: new Date("2026-10-01T00:00:00Z"), market: "jp", exposure: 0, lastShown: "2026-11-03" }, // neither
    ];
    const picks = shelf.select({ date: "2026-11-07", audience: "jp", items });
    expect(picks.map((pick) => [pick.role, pick.id])).toEqual([["new", "fresh"], ["underexposed", "mid"], ["rediscovery", "old"]]);
    expect(shelf.config.lanes.map((lane) => lane.name)).toEqual(["preferred", "any", "cross"]);
  });

  it("omits lanes when language is null, and passes cooldown and version through", () => {
    const config = editorialPreset({ language: null, cooldownDays: 5, version: "e9" });
    expect(config.lanes).toBeUndefined();
    expect(config.cooldownDays).toBe(5);
    expect(config.version).toBe("e9");
  });
});
