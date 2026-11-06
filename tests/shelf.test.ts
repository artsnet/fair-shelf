import { describe, expect, it } from "vitest";
import { createShelf } from "../src/shelf.js";
import type { Item } from "../src/types.js";

type Post = { kind: string; publishedAt: string };
const day = "2026-11-07";

function post(id: string, overrides: Partial<Item<Post>> = {}): Item<Post> {
  return { id, kind: "article", publishedAt: "2026-10-01", exposure: 0, lastShown: null, ...overrides };
}
const pool = Array.from({ length: 12 }, (_, i) => post(`p${i}`, { kind: i % 2 ? "video" : "article", publishedAt: i < 4 ? "2026-11-01" : "2026-10-01" }));

const shelf = createShelf<Post, string>({
  slots: [
    { role: "new", match: (item, ctx) => ctx.withinDays(item.publishedAt, 14), prefer: (item) => -Date.parse(item.publishedAt) },
    { role: "underexposed" },
    { role: "rediscovery", match: (item, ctx) => item.lastShown === null || (ctx.daysSince(item.lastShown) ?? 0) >= 30 },
  ],
  lanes: [
    { name: "article", match: (item) => item.kind === "article" },
    { name: "any" },
    { name: "video", match: (item) => item.kind === "video" },
  ],
});

describe("createShelf", () => {
  it("fills every slot with a distinct item and reports role and lane per position", () => {
    const picks = shelf.select({ date: day, audience: "x", items: pool });
    expect(picks.map((pick) => pick.position)).toEqual([1, 2, 3]);
    expect(picks.map((pick) => pick.role)).toEqual(["new", "underexposed", "rediscovery"]);
    expect(new Set(picks.map((pick) => pick.id)).size).toBe(3);
    expect(picks.map((pick) => pick.lane).sort()).toEqual(["any", "article", "video"]);
    for (const pick of picks) {
      expect(pick.relaxation).toBe(0);
      if (pick.lane === "article") expect(pick.item.kind).toBe("article");
      if (pick.lane === "video") expect(pick.item.kind).toBe("video");
    }
  });

  it("is deterministic and never mutates the input", () => {
    const before = JSON.stringify(pool);
    const a = shelf.select({ date: day, audience: "x", items: pool });
    const b = shelf.select({ date: day, audience: "x", items: [...pool].reverse() });
    expect(a).toEqual(b);
    expect(JSON.stringify(pool)).toBe(before);
  });

  it("rotates lanes across positions day by day and lanesFor agrees with select", () => {
    const seen = new Set<string>();
    for (let offset = 0; offset < 3; offset += 1) {
      const date = `2026-11-0${7 + offset}`;
      const lanes = shelf.lanesFor(date, "x");
      seen.add(lanes.join(","));
      expect(shelf.select({ date, audience: "x", items: pool }).map((pick) => pick.lane)).toEqual(lanes);
    }
    expect(seen.size).toBe(3);
  });

  it("changes the assignment with the audience and with the version, not with item order", () => {
    const ja = shelf.lanesFor(day, "ja");
    const en = shelf.lanesFor(day, "en");
    const v2 = createShelf<Post, string>({ ...shelf.config, version: "v2" });
    expect([ja, en, v2.lanesFor(day, "ja")].some((lanes) => lanes.join() !== ja.join())).toBe(true);
    expect(createShelf<Post, string>({ ...shelf.config, version: "v1" }).lanesFor(day, "ja")).toEqual(ja);
  });

  it("prefers lower exposure, then the oldest last showing, then the slot's preference", () => {
    const single = createShelf<Post, string>({ slots: [{ role: "any" }], cooldownDays: 0 });
    const items = [
      post("busy", { exposure: 5 }),
      post("recent", { exposure: 1, lastShown: "2026-10-30" }),
      post("stale", { exposure: 1, lastShown: "2026-09-01" }),
    ];
    expect(single.select({ date: day, items }).map((pick) => pick.id)).toEqual(["stale"]);
    const newest = createShelf<Post, string>({ slots: [{ role: "new", prefer: (item) => -Date.parse(item.publishedAt) }], cooldownDays: 0 });
    const tied = [post("older", { publishedAt: "2026-11-01" }), post("newer", { publishedAt: "2026-11-06" })];
    expect(newest.select({ date: day, items: tied }).map((pick) => pick.id)).toEqual(["newer"]);
  });

  it("rests items shown during the cooldown while alternatives exist, using shownDates or lastShown", () => {
    const items = [post("yesterday", { shownDates: ["2026-11-06"] }), post("last-shown-only", { lastShown: "2026-11-05" }), ...pool];
    const ids = shelf.select({ date: day, audience: "x", items }).map((pick) => pick.id);
    expect(ids).not.toContain("yesterday");
    expect(ids).not.toContain("last-shown-only");
    const longAgo = [post("old", { shownDates: ["2026-11-03"] })];
    expect(createShelf<Post, string>({ slots: [{ role: "r" }] }).select({ date: day, items: longAgo }).map((pick) => pick.id)).toEqual(["old"]);
  });

  it("relaxes cooldown, then lane, then role, and reports the level", () => {
    const thin = [post("a", { kind: "article", shownDates: ["2026-11-06"] }), post("b", { kind: "article", publishedAt: "2026-01-01" })];
    const picks = createShelf<Post, string>({
      slots: [{ role: "new", match: (item, ctx) => ctx.withinDays(item.publishedAt, 14) }, { role: "video", match: (item) => item.kind === "video" }],
      lanes: [{ name: "video", match: (item) => item.kind === "video" }],
    }).select({ date: day, items: thin });
    expect(picks).toHaveLength(2);
    expect(new Set(picks.map((pick) => pick.id)).size).toBe(2);
    expect(picks.every((pick) => pick.relaxation > 0)).toBe(true);
    expect(Math.max(...picks.map((pick) => pick.relaxation))).toBe(3);
  });

  it("still prefers lane-matching items once the lane has been relaxed", () => {
    const only = createShelf<Post, string>({ slots: [{ role: "r", match: (item) => item.kind === "article" }], lanes: [{ name: "video", match: (item) => item.kind === "video" }], cooldownDays: 0 });
    const items = [post("article-only", { kind: "article" })];
    expect(only.select({ date: day, items }).map((pick) => [pick.id, pick.relaxation])).toEqual([["article-only", 2]]);
  });

  it("leaves a position empty rather than repeating an item", () => {
    const picks = shelf.select({ date: day, audience: "x", items: [post("solo")] });
    expect(picks).toHaveLength(1);
    expect(picks[0]?.id).toBe("solo");
  });

  it("honours reserved positions and never re-picks their items", () => {
    const full = shelf.select({ date: day, audience: "x", items: pool });
    const reserved = [{ position: 2, id: full[1]?.id as string }];
    const refill = shelf.select({ date: day, audience: "x", items: pool, reserved });
    expect(refill.map((pick) => pick.position)).toEqual([1, 3]);
    expect(refill.map((pick) => pick.id)).not.toContain(full[1]?.id);
    expect(refill.map(({ role, lane }) => ({ role, lane }))).toEqual([full[0], full[2]].map((pick) => ({ role: pick?.role, lane: pick?.lane })));
    expect(shelf.select({ date: day, audience: "x", items: pool, reserved: full.map(({ position, id }) => ({ position, id })) })).toEqual([]);
    expect(() => shelf.select({ date: day, audience: "x", items: pool, reserved: [{ position: 4, id: "x" }] })).toThrow(/outside 1..3/);
  });

  it("defaults to a single lane and validates config and items", () => {
    const plain = createShelf({ slots: [{ role: "a" }, { role: "b" }] });
    expect(plain.config.lanes.map((lane) => lane.name)).toEqual(["any"]);
    expect(plain.config.cooldownDays).toBe(3);
    expect(plain.size).toBe(2);
    expect(() => createShelf({ slots: [] })).toThrow(/non-empty/);
    expect(() => createShelf({ slots: [{ role: "" }] })).toThrow(/role/);
    expect(() => createShelf({ slots: [{ role: "a" }], cooldownDays: -1 })).toThrow(/cooldownDays/);
    expect(() => plain.select({ date: "2026-13-01", items: [] })).toThrow(/YYYY-MM-DD/);
    expect(() => plain.select({ date: day, items: [post("dup"), post("dup")] })).toThrow(/duplicate/);
    expect(() => plain.select({ date: day, items: [{ ...post("bad"), exposure: Number.NaN }] })).toThrow(/exposure/);
    expect(() => plain.select({ date: day, items: [post("bad", { lastShown: "yesterday" })] })).toThrow(/lastShown/);
  });

  it("gives callbacks a context with the date, the audience and day helpers", () => {
    const seen: Array<[string, unknown, number | null, boolean]> = [];
    const probe = createShelf<Post, { locale: string }>({
      slots: [{ role: "probe", match: (item, ctx) => { seen.push([ctx.date, ctx.audience, ctx.daysSince(item.publishedAt), ctx.withinDays(item.publishedAt, 40)]); return true; } }],
      cooldownDays: 0,
    });
    probe.select({ date: day, audience: { locale: "ja" }, items: [post("x", { publishedAt: "2026-10-01" })] });
    expect(seen[0]).toEqual([day, { locale: "ja" }, 37, true]);
  });
});
