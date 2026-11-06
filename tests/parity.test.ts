/**
 * The editorial preset with language lanes must behave like the selector it was extracted from
 * (Artsnet's lib/catalogue/selection.ts). These cases mirror that module's tests.
 */
import { describe, expect, it } from "vitest";
import { editorialPreset } from "../src/presets.js";
import { createShelf } from "../src/shelf.js";
import type { Item } from "../src/types.js";

type Song = { language: "ja" | "en" | "other"; publishedAt: string };
const day = "2026-09-18";
const shelf = createShelf<Song, "ja" | "en">(editorialPreset<Song, "ja" | "en">({ version: "v2" }));

function song(id: string, language: Song["language"] = "ja", overrides: Partial<Item<Song>> = {}): Item<Song> {
  return { id, language, publishedAt: "2026-09-17", exposure: 0, lastShown: null, shownDates: [], ...overrides };
}
const many = [
  ...Array.from({ length: 8 }, (_, i) => song(`ja-${i}`)),
  ...Array.from({ length: 8 }, (_, i) => song(`en-${i}`, "en")),
  ...Array.from({ length: 4 }, (_, i) => song(`other-${i}`, "other")),
];

describe("editorial preset parity", () => {
  it("fills three unique roles with one song per language lane", () => {
    const result = shelf.select({ date: day, audience: "ja", items: many });
    expect(result.map((pick) => pick.role)).toEqual(["new", "underexposed", "rediscovery"]);
    expect(new Set(result.map((pick) => pick.id)).size).toBe(3);
    expect(result.map((pick) => pick.lane).sort()).toEqual(["any", "cross", "preferred"]);
    expect(result.find((pick) => pick.lane === "preferred")?.id.startsWith("ja-")).toBe(true);
    expect(result.find((pick) => pick.lane === "cross")?.id.startsWith("ja-")).toBe(false);
    expect(shelf.select({ date: day, audience: "ja", items: many })).toEqual(result);
    expect(shelf.select({ date: day, audience: "en", items: many }).find((pick) => pick.lane === "preferred")?.id.startsWith("en-")).toBe(true);
  });

  it("normally suppresses songs selected in the previous three dates", () => {
    const result = shelf.select({ date: day, audience: "ja", items: [song("recent", "ja", { shownDates: ["2026-09-17"] }), ...many] });
    expect(result.map((pick) => pick.id)).not.toContain("recent");
  });

  it("prefers lower exposure, then older last selection", () => {
    const pool = [
      song("high", "ja", { exposure: 2 }),
      song("recent", "ja", { exposure: 0, lastShown: "2026-08-01" }),
      song("old", "ja", { exposure: 0, lastShown: "2026-07-01" }),
      song("en", "en"),
      song("other", "other"),
    ];
    const chosen = shelf.select({ date: day, audience: "ja", items: pool }).map((pick) => pick.id);
    expect(chosen).toContain("old");
    expect(chosen).not.toContain("high");
  });

  it("uses cooldown, language, then role fallback without duplicating songs", () => {
    const pool = [song("ja", "ja", { shownDates: ["2026-09-17"] }), song("en", "en"), song("other", "other")];
    const result = shelf.select({ date: day, audience: "ja", items: pool });
    expect(result).toHaveLength(3);
    expect(new Set(result.map((pick) => pick.id)).size).toBe(3);
  });

  it("rotates lane assignments with the date", () => {
    const today = shelf.select({ date: day, audience: "ja", items: many });
    const tomorrow = shelf.select({ date: "2026-09-19", audience: "ja", items: many });
    expect(today.map((pick) => pick.lane)).not.toEqual(tomorrow.map((pick) => pick.lane));
  });

  it("fills only unreserved positions and keeps each position's daily role and lane", () => {
    const full = shelf.select({ date: day, audience: "ja", items: many });
    const refill = shelf.select({ date: day, audience: "ja", items: many, reserved: [{ position: 2, id: full[1]?.id as string }] });
    expect(refill.map((pick) => pick.position)).toEqual([1, 3]);
    expect(refill.map(({ role, lane }) => ({ role, lane }))).toEqual([{ role: full[0]?.role, lane: full[0]?.lane }, { role: full[2]?.role, lane: full[2]?.lane }]);
    expect(refill.map((pick) => pick.id)).not.toContain(full[1]?.id);
  });

  it("treats 'new' as published within 14 days and 'rediscovery' as unseen for 30 days", () => {
    // Each role has exactly one eligible item, so the picks are the same whichever slot is processed first.
    const fresh = song("fresh", "ja", { publishedAt: "2026-09-10", exposure: 2, lastShown: "2026-09-05" }); // new; shown 13 days ago
    const forgotten = song("forgotten", "ja", { publishedAt: "2026-01-01", exposure: 1, lastShown: "2026-08-01" }); // unseen 48 days
    const filler = song("filler", "ja", { publishedAt: "2026-01-01", exposure: 0, lastShown: "2026-09-10" }); // neither new nor forgotten
    const picks = createShelf<Song, "ja" | "en">(editorialPreset<Song, "ja" | "en">({ language: null })).select({ date: day, audience: "ja", items: [fresh, forgotten, filler] });
    expect(picks.map((pick) => [pick.role, pick.id, pick.relaxation])).toEqual([["new", "fresh", 0], ["underexposed", "filler", 0], ["rediscovery", "forgotten", 0]]);
  });
});
