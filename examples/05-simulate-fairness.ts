/**
 * Before trusting a configuration, replay it. The simulator runs the shelf day after day, feeds
 * each day's picks back as exposure, and reports how evenly items were shown: min, max, Gini,
 * the longest time any item waited, and how often constraints had to be relaxed.
 *
 * Run: npm run example examples/05-simulate-fairness.ts
 */
import { createShelf, editorialPreset, formatSimulation, simulate } from "@artsnet/fair-shelf";
import { isMain } from "./_run.js";

type Article = { publishedAt: string; language: string };

export function run(days = 90) {
  const shelf = createShelf<Article, string>(editorialPreset<Article, string>());
  // 40 articles: a trickle of new ones over the run, in two languages.
  const items = Array.from({ length: 40 }, (_, i) => ({
    id: `a${String(i + 1).padStart(2, "0")}`,
    publishedAt: i < 30 ? "2025-12-01" : `2026-01-${String((i - 29) * 3).padStart(2, "0")}`,
    language: i % 3 === 0 ? "en" : "ja",
  }));
  return simulate({ shelf, items, startDate: "2026-01-01", days, audiences: ["ja", "en"] });
}

if (isMain(import.meta.url)) {
  const result = run();
  console.log(formatSimulation(result));
  console.log(`A Gini of ${result.summary.gini.toFixed(3)} means showings are close to evenly spread (0 = perfectly even).`);
}
