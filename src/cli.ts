#!/usr/bin/env node
import { readFileSync, realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { isCalendarDate } from "./dates.js";
import { editorialPreset, rotationPreset } from "./presets.js";
import { createShelf } from "./shelf.js";
import { simulate } from "./simulate.js";
import { formatSimulation } from "./report.js";
import type { Item, Shelf, ShelfConfig } from "./types.js";
import { VERSION } from "./version.js";

export const HELP = `fair-shelf ${VERSION}
Deterministic, fair daily rotation for curated lists. Pick today's shelf, or replay many days and
see how evenly items were shown.

Usage:
  fair-shelf pick     --items <file.json> --date <YYYY-MM-DD> [options]
  fair-shelf simulate --items <file.json> --days <n> [--start <YYYY-MM-DD>] [options]

Items file: a JSON array of objects with "id" and, for the editorial preset, "publishedAt"
(YYYY-MM-DD or ISO timestamp) and optionally "language". Exposure facts "exposure", "lastShown"
and "shownDates" are read when present (pick) or start at zero (simulate).

Options:
  --preset <editorial|rotation>  editorial: new / underexposed / rediscovery slots (default);
                                 rotation: N identical least-exposed slots
  --size <n>                     Slots for the rotation preset (default: 3)
  --new-days <n>                 editorial: "new" window (default: 14)
  --rediscovery-days <n>         editorial: days unseen before an item counts as a rediscovery (default: 30)
  --cooldown <n>                 Days an item rests after being shown (default: 3)
  --version-tag <s>              Shelf version mixed into the rotation (default: v1)
  --audience <s>                 pick: the audience value, e.g. a language (default: none)
  --audiences <s,s,...>          simulate: one selection per audience per day (default: one, unnamed)
  --window <n>                   simulate: exposure lookback in days (default: 90)
  --log                          simulate: include every day's picks in --json output
  --json                         Print JSON instead of a table
  -h, --help                     Show this help
  -v, --version                  Print the version
`;

type Common = { items: string | undefined; preset: "editorial" | "rotation"; size: number; newDays: number; rediscoveryDays: number; cooldown: number; versionTag: string | undefined; json: boolean };
export type Command =
  | { kind: "pick"; date: string | undefined; audience: string | undefined; common: Common }
  | { kind: "simulate"; days: number | undefined; start: string | undefined; audiences: string[]; window: number; log: boolean; common: Common }
  | { kind: "help" }
  | { kind: "version" }
  | { kind: "usage-error"; message: string };

function integer(flag: string, raw: string | undefined, minimum: number): number {
  if (raw === undefined) throw new Error(`${flag} needs a value`);
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum) throw new Error(`${flag} must be an integer >= ${minimum}`);
  return value;
}

export function parseArgs(argv: readonly string[]): Command {
  const common: Common = { items: undefined, preset: "editorial", size: 3, newDays: 14, rediscoveryDays: 30, cooldown: 3, versionTag: undefined, json: false };
  let kind: "pick" | "simulate" | undefined;
  let date: string | undefined;
  let audience: string | undefined;
  let days: number | undefined;
  let start: string | undefined;
  let audiences: string[] = [];
  let window = 90;
  let log = false;
  try {
    for (let i = 0; i < argv.length; i += 1) {
      const arg = argv[i] ?? "";
      const next = (): string | undefined => argv[(i += 1)];
      const text = (flag: string): string => {
        const value = next();
        if (!value) throw new Error(`${flag} needs a value`);
        return value;
      };
      switch (arg) {
        case "-h": case "--help": return { kind: "help" };
        case "-v": case "--version": return { kind: "version" };
        case "pick": case "simulate":
          if (kind) throw new Error("only one command");
          kind = arg;
          break;
        case "--items": common.items = text(arg); break;
        case "--preset": {
          const value = text(arg);
          if (value !== "editorial" && value !== "rotation") throw new Error("--preset must be editorial or rotation");
          common.preset = value;
          break;
        }
        case "--size": common.size = integer(arg, next(), 1); break;
        case "--new-days": common.newDays = integer(arg, next(), 1); break;
        case "--rediscovery-days": common.rediscoveryDays = integer(arg, next(), 1); break;
        case "--cooldown": common.cooldown = integer(arg, next(), 0); break;
        case "--version-tag": common.versionTag = text(arg); break;
        case "--json": common.json = true; break;
        case "--date": date = text(arg); break;
        case "--audience": audience = text(arg); break;
        case "--days": days = integer(arg, next(), 1); break;
        case "--start": start = text(arg); break;
        case "--audiences": audiences = text(arg).split(",").map((value) => value.trim()).filter(Boolean); break;
        case "--window": window = integer(arg, next(), 1); break;
        case "--log": log = true; break;
        default: throw new Error(`unknown argument ${arg}`);
      }
    }
    if (!kind) throw new Error("missing command (pick or simulate)");
    if (!common.items) throw new Error("--items is required");
    if (kind === "pick") {
      if (!date || !isCalendarDate(date)) throw new Error("--date must be a valid YYYY-MM-DD");
      return { kind, date, audience, common };
    }
    if (days === undefined) throw new Error("--days is required for simulate");
    if (start !== undefined && !isCalendarDate(start)) throw new Error("--start must be a valid YYYY-MM-DD");
    return { kind, days, start, audiences, window, log, common };
  } catch (error) {
    return { kind: "usage-error", message: error instanceof Error ? error.message : String(error) };
  }
}

type FileItem = { id: string; publishedAt?: string; language?: string; exposure?: number; lastShown?: string | null; shownDates?: string[] } & Record<string, unknown>;

export function loadItems(path: string, read: (path: string) => string = (file) => readFileSync(file, "utf8")): FileItem[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(read(path));
  } catch (error) {
    throw new Error(`cannot read ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const list = Array.isArray(parsed) ? parsed : typeof parsed === "object" && parsed !== null && Array.isArray((parsed as { items?: unknown }).items) ? (parsed as { items: unknown[] }).items : null;
  if (!list) throw new Error(`${path} must be a JSON array of items (or an object with an "items" array)`);
  return list.map((entry, index) => {
    if (typeof entry !== "object" || entry === null || typeof (entry as { id?: unknown }).id !== "string") throw new Error(`item ${index} needs a string id`);
    return entry as FileItem;
  });
}

export function buildShelf(common: Common, items: readonly FileItem[]): Shelf<FileItem, string | undefined> {
  let config: ShelfConfig<FileItem, string | undefined>;
  if (common.preset === "rotation") {
    config = rotationPreset<FileItem, string | undefined>({ size: common.size, cooldownDays: common.cooldown });
  } else {
    for (const item of items) if (item.publishedAt === undefined) throw new Error(`item ${item.id} needs publishedAt for the editorial preset (or use --preset rotation)`);
    const hasLanguage = items.some((item) => typeof item.language === "string");
    config = editorialPreset<FileItem, string | undefined>({ newDays: common.newDays, rediscoveryDays: common.rediscoveryDays, cooldownDays: common.cooldown, ...(hasLanguage ? {} : { language: null }) });
  }
  if (common.versionTag) config.version = common.versionTag;
  return createShelf(config);
}

export type CliIo = { argv: readonly string[]; stdout: (text: string) => void; stderr: (text: string) => void; read?: (path: string) => string };

export async function runCli(io: CliIo): Promise<number> {
  const command = parseArgs(io.argv);
  if (command.kind === "help") { io.stdout(HELP); return 0; }
  if (command.kind === "version") { io.stdout(`${VERSION}\n`); return 0; }
  if (command.kind === "usage-error") { io.stderr(`error: ${command.message}\n\n${HELP}`); return 1; }
  try {
    const items = loadItems(command.common.items as string, io.read);
    const shelf = buildShelf(command.common, items);
    if (command.kind === "pick") {
      const picks = shelf.select({ date: command.date as string, audience: command.audience, items: items.map((item) => ({ ...item, exposure: item.exposure ?? 0, lastShown: item.lastShown ?? null }) as Item<FileItem>) });
      if (command.common.json) {
        io.stdout(`${JSON.stringify({ schemaVersion: 1, date: command.date, audience: command.audience ?? null, lanes: shelf.lanesFor(command.date as string, command.audience), picks: picks.map(({ position, id, role, lane, relaxation }) => ({ position, id, role, lane, relaxation })) })}\n`);
      } else {
        io.stdout(`${command.date}${command.audience ? ` (${command.audience})` : ""}\n`);
        for (const pick of picks) io.stdout(`  ${pick.position}. ${pick.id}  [${pick.role} / ${pick.lane}]${pick.relaxation ? `  relaxed:${pick.relaxation}` : ""}\n`);
        if (picks.length < shelf.size) io.stdout(`  (${shelf.size - picks.length} position(s) left empty: not enough items)\n`);
      }
      return 0;
    }
    const start = command.start ?? new Date().toISOString().slice(0, 10);
    const result = simulate({ shelf, items, startDate: start, days: command.days as number, ...(command.audiences.length ? { audiences: command.audiences } : {}), exposureWindowDays: command.window, log: command.log });
    io.stdout(command.common.json ? `${JSON.stringify({ schemaVersion: 1, start, ...result })}\n` : formatSimulation(result));
    return 0;
  } catch (error) {
    io.stderr(`error: ${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }
}

const isEntryPoint = (() => {
  try {
    return process.argv[1] !== undefined && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
})();

if (isEntryPoint) {
  runCli({ argv: process.argv.slice(2), stdout: (text) => process.stdout.write(text), stderr: (text) => process.stderr.write(text) }).then(
    (code) => { process.exitCode = code; },
    (error) => { process.stderr.write(`fatal: ${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; },
  );
}
