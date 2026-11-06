/**
 * A blog's home page shows three posts a day: something new, something that has had little
 * exposure, and something worth rediscovering. Every post gets its turn; nothing is ranked by
 * popularity and nothing is random, so the editor can explain any day's picks.
 *
 * Run: npm run example examples/01-blog-homepage.ts
 */
import { createShelf, editorialPreset, type Item } from "@artsnet/fair-shelf";
import { isMain } from "./_run.js";

type Post = { title: string; publishedAt: string };

// Exposure facts normally come from your own "shown on the home page" log (see 03-community-gallery).
const posts: Item<Post>[] = [
  { id: "p1", title: "Why we rotate the home page", publishedAt: "2026-11-05", exposure: 0, lastShown: null },
  { id: "p2", title: "Release notes 3.2", publishedAt: "2026-11-03", exposure: 1, lastShown: "2026-11-04" },
  { id: "p3", title: "A tour of the archive", publishedAt: "2026-06-12", exposure: 4, lastShown: "2026-09-20" },
  { id: "p4", title: "Interview: the first contributor", publishedAt: "2026-02-01", exposure: 2, lastShown: "2026-10-30" },
  { id: "p5", title: "How exposure counting works", publishedAt: "2026-08-15", exposure: 0, lastShown: null },
  { id: "p6", title: "Design notes, part 2", publishedAt: "2026-10-28", exposure: 3, lastShown: "2026-11-06" },
];

export function run(date = "2026-11-07") {
  // The editorial preset: slots "new" (published within 14 days), "underexposed", "rediscovery"
  // (not shown for 30 days). No language lanes for a single-language blog.
  const shelf = createShelf<Post, undefined>(editorialPreset<Post, undefined>({ language: null }));
  return shelf.select({ date, items: posts });
}

if (isMain(import.meta.url)) {
  for (const pick of run()) {
    console.log(`${pick.position}. [${pick.role.padEnd(12)}] ${pick.item.title}  (shown ${pick.item.exposure}×, last ${pick.item.lastShown ?? "never"})`);
  }
}
