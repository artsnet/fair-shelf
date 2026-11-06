import { describe, expect, it } from "vitest";
import { HELP, loadItems, parseArgs, runCli } from "../src/cli.js";
import { VERSION } from "../src/version.js";

const items = JSON.stringify([
  { id: "a", publishedAt: "2026-11-01", language: "ja" },
  { id: "b", publishedAt: "2026-06-01", language: "en", lastShown: "2026-09-01" },
  { id: "c", publishedAt: "2026-10-20", language: "ja", shownDates: ["2026-11-06"] },
  { id: "d", publishedAt: "2026-01-01", language: "en" },
]);

function io(argv: string[], files: Record<string, string> = { "items.json": items }) {
  const out: string[] = [];
  const err: string[] = [];
  const run = () => runCli({ argv, stdout: (text) => out.push(text), stderr: (text) => err.push(text), read: (path) => { const text = files[path]; if (text === undefined) throw new Error("ENOENT"); return text; } });
  return { run, out, err };
}

describe("parseArgs", () => {
  it("parses pick and simulate with options", () => {
    expect(parseArgs(["pick", "--items", "i.json", "--date", "2026-11-07", "--audience", "ja", "--preset", "rotation", "--size", "5", "--cooldown", "0", "--version-tag", "x", "--json"])).toMatchObject({
      kind: "pick", date: "2026-11-07", audience: "ja", common: { items: "i.json", preset: "rotation", size: 5, cooldown: 0, versionTag: "x", json: true },
    });
    expect(parseArgs(["simulate", "--items", "i.json", "--days", "30", "--start", "2026-01-01", "--audiences", "ja,en", "--window", "10", "--log", "--new-days", "7", "--rediscovery-days", "20"])).toMatchObject({
      kind: "simulate", days: 30, start: "2026-01-01", audiences: ["ja", "en"], window: 10, log: true, common: { newDays: 7, rediscoveryDays: 20 },
    });
  });

  it.each([[], ["pick"], ["pick", "--items", "i.json"], ["pick", "--items", "i.json", "--date", "nope"], ["simulate", "--items", "i.json"], ["simulate", "--items", "i.json", "--days", "0"], ["pick", "--items", "i.json", "--date", "2026-11-07", "--preset", "magic"], ["pick", "simulate"], ["--bogus"]])(
    "rejects %j",
    (...argv) => {
      expect(parseArgs(argv)).toMatchObject({ kind: "usage-error" });
    },
  );
});

describe("loadItems", () => {
  it("accepts an array or an object with items, and rejects anything else", () => {
    expect(loadItems("x", () => '[{"id":"a"}]')).toEqual([{ id: "a" }]);
    expect(loadItems("x", () => '{"items":[{"id":"a"}]}')).toEqual([{ id: "a" }]);
    expect(() => loadItems("x", () => "{}")).toThrow(/JSON array/);
    expect(() => loadItems("x", () => "[1]")).toThrow(/string id/);
    expect(() => loadItems("x", () => "not json")).toThrow(/cannot read/);
  });
});

describe("runCli", () => {
  it("prints help and version", async () => {
    const help = io(["--help"]);
    expect(await help.run()).toBe(0);
    expect(help.out.join("")).toBe(HELP);
    const version = io(["-v"]);
    await version.run();
    expect(version.out.join("")).toBe(`${VERSION}\n`);
  });

  it("picks with the editorial preset and language lanes from the file", async () => {
    const { run, out } = io(["pick", "--items", "items.json", "--date", "2026-11-07", "--audience", "ja", "--json"]);
    expect(await run()).toBe(0);
    const parsed = JSON.parse(out.join(""));
    expect(parsed).toMatchObject({ schemaVersion: 1, date: "2026-11-07", audience: "ja" });
    expect(parsed.lanes.slice().sort()).toEqual(["any", "cross", "preferred"]);
    expect(parsed.picks.map((pick: { role: string }) => pick.role)).toEqual(["new", "underexposed", "rediscovery"]);
    // "c" was shown yesterday: it may only appear once the cooldown had to be relaxed.
    for (const pick of parsed.picks as Array<{ id: string; relaxation: number }>) if (pick.id === "c") expect(pick.relaxation).toBeGreaterThanOrEqual(1);
  });

  it("prints a human pick and notes empty positions", async () => {
    const { run, out } = io(["pick", "--items", "items.json", "--date", "2026-11-07", "--preset", "rotation", "--size", "6"]);
    expect(await run()).toBe(0);
    const text = out.join("");
    expect(text).toContain("1. ");
    expect(text).toContain("2 position(s) left empty");
  });

  it("simulates and prints a table or JSON", async () => {
    const table = io(["simulate", "--items", "items.json", "--days", "20", "--start", "2026-11-01", "--audiences", "ja,en"]);
    expect(await table.run()).toBe(0);
    expect(table.out.join("")).toContain("20 days × 2 audience(s): 120 picks over 4 items");
    const json = io(["simulate", "--items", "items.json", "--days", "3", "--start", "2026-11-01", "--json", "--log"]);
    expect(await json.run()).toBe(0);
    const parsed = JSON.parse(json.out.join(""));
    expect(parsed.start).toBe("2026-11-01");
    expect(parsed.log).toHaveLength(3);
  });

  it("fails with exit 2 on a missing file or missing publishedAt", async () => {
    const missing = io(["pick", "--items", "nope.json", "--date", "2026-11-07"]);
    expect(await missing.run()).toBe(2);
    expect(missing.err.join("")).toContain("cannot read nope.json");
    const noDate = io(["pick", "--items", "items.json", "--date", "2026-11-07"], { "items.json": '[{"id":"x"}]' });
    expect(await noDate.run()).toBe(2);
    expect(noDate.err.join("")).toContain("needs publishedAt");
    const rotation = io(["pick", "--items", "items.json", "--date", "2026-11-07", "--preset", "rotation"], { "items.json": '[{"id":"x"}]' });
    expect(await rotation.run()).toBe(0);
  });
});
