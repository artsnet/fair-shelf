/**
 * A community gallery that features four works a day. This example shows the part the library
 * leaves to you: turning a log of past showings into the exposure facts each item needs, and
 * writing today's picks back to that log. The log here is an in-memory array; yours is a table.
 *
 * Run: npm run example examples/03-community-gallery.ts
 */
import { createShelf, rotationPreset, shiftDate, type Item } from "@artsnet/fair-shelf";
import { isMain } from "./_run.js";

type Work = { title: string; creator: string };
type Showing = { workId: string; date: string };

const works: Array<{ id: string } & Work> = [
  { id: "w1", title: "Harbour at dusk", creator: "aki" },
  { id: "w2", title: "Untitled 4", creator: "ben" },
  { id: "w3", title: "Paper cranes", creator: "chi" },
  { id: "w4", title: "Commute", creator: "aki" },
  { id: "w5", title: "Study in red", creator: "dee" },
  { id: "w6", title: "Field recording", creator: "eli" },
  { id: "w7", title: "Neon", creator: "ben" },
];

/** Builds exposure facts from the showings log, counting only the last `windowDays`. */
export function withExposure(date: string, log: readonly Showing[], windowDays = 90): Item<Work>[] {
  const windowStart = shiftDate(date, 1 - windowDays);
  return works.map((work) => {
    const dates = log.filter((entry) => entry.workId === work.id && entry.date >= windowStart && entry.date < date).map((entry) => entry.date).sort();
    return { ...work, exposure: dates.length, lastShown: dates.at(-1) ?? null, shownDates: dates };
  });
}

export function run(days = 7, start = "2026-11-01") {
  const shelf = createShelf<Work, undefined>(rotationPreset<Work, undefined>({ size: 4, cooldownDays: 2 }));
  const log: Showing[] = [];
  const timeline: Array<{ date: string; ids: string[] }> = [];
  let date = start;
  for (let day = 0; day < days; day += 1) {
    const picks = shelf.select({ date, items: withExposure(date, log) });
    // Write back: this is what makes tomorrow's selection fair with respect to today's.
    log.push(...picks.map((pick) => ({ workId: pick.id, date })));
    timeline.push({ date, ids: picks.map((pick) => pick.id) });
    date = shiftDate(date, 1);
  }
  return { timeline, log };
}

if (isMain(import.meta.url)) {
  const { timeline, log } = run();
  for (const day of timeline) console.log(day.date, day.ids.join(" "));
  const counts = new Map<string, number>();
  for (const entry of log) counts.set(entry.workId, (counts.get(entry.workId) ?? 0) + 1);
  console.log("showings per work:", Object.fromEntries([...counts.entries()].sort()));
}
