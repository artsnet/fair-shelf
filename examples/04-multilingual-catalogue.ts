/**
 * A bilingual catalogue (this is how Artsnet's home page works). Each visitor language is an
 * audience; the three language lanes rotate so a Japanese visitor sees a Japanese work, a work
 * in any language, and a work in another language, in a different arrangement every day. The
 * same code serves both audiences; only `audience` changes.
 *
 * Run: npm run example examples/04-multilingual-catalogue.ts
 */
import { createShelf, editorialPreset, type Item } from "@artsnet/fair-shelf";
import { isMain } from "./_run.js";

type Song = { title: string; language: "ja" | "en" | "other"; publishedAt: string };

const songs: Item<Song>[] = [
  { id: "s1", title: "夜明けのうた", language: "ja", publishedAt: "2026-11-04", exposure: 0, lastShown: null },
  { id: "s2", title: "Paper Boats", language: "en", publishedAt: "2026-11-01", exposure: 1, lastShown: "2026-11-02" },
  { id: "s3", title: "青い回廊", language: "ja", publishedAt: "2026-07-19", exposure: 5, lastShown: "2026-09-30" },
  { id: "s4", title: "Low Tide", language: "en", publishedAt: "2026-05-02", exposure: 2, lastShown: "2026-10-28" },
  { id: "s5", title: "Canción del río", language: "other", publishedAt: "2026-09-09", exposure: 0, lastShown: null },
  { id: "s6", title: "遠い汽笛", language: "ja", publishedAt: "2026-02-14", exposure: 3, lastShown: "2026-10-01" },
  { id: "s7", title: "Glasshouse", language: "en", publishedAt: "2026-10-26", exposure: 0, lastShown: null },
];

// language defaults to item.language; audience is compared with it by the lanes.
export const catalogue = createShelf<Song, "ja" | "en">(editorialPreset<Song, "ja" | "en">({ version: "v2" }));

export function run(date = "2026-11-07") {
  return {
    ja: catalogue.select({ date, audience: "ja", items: songs }),
    en: catalogue.select({ date, audience: "en", items: songs }),
  };
}

if (isMain(import.meta.url)) {
  for (const date of ["2026-11-07", "2026-11-08", "2026-11-09"]) {
    const picks = run(date);
    for (const audience of ["ja", "en"] as const) {
      console.log(`${date} for ${audience}:`);
      for (const pick of picks[audience]) console.log(`  ${pick.position}. [${pick.role.padEnd(12)} / ${pick.lane.padEnd(9)}] ${pick.item.title} (${pick.item.language})`);
    }
  }
}
