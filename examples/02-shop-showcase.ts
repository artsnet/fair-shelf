/**
 * A small shop's "featured" row. Custom slots instead of the preset: a new arrival, a product
 * that has not been featured much, and a seasonal pick. Lanes rotate the product category
 * across the slots day by day, so the row is never three mugs. The audience is the month, so
 * the seasonal slot knows what season it is.
 *
 * Run: npm run example examples/02-shop-showcase.ts
 */
import { createShelf, type Item } from "@artsnet/fair-shelf";
import { isMain } from "./_run.js";

type Product = { name: string; category: "mug" | "print" | "tote"; listedOn: string; seasons: number[] };
type Audience = { month: number };

const products: Item<Product>[] = [
  { id: "mug-rain", name: "Rainy-day mug", category: "mug", listedOn: "2026-11-02", seasons: [10, 11, 12, 1], exposure: 0, lastShown: null },
  { id: "mug-sun", name: "Morning sun mug", category: "mug", listedOn: "2026-03-10", seasons: [4, 5, 6, 7, 8], exposure: 6, lastShown: "2026-10-01" },
  { id: "print-fox", name: "Fox in snow (print)", category: "print", listedOn: "2025-12-01", seasons: [11, 12, 1, 2], exposure: 2, lastShown: "2026-10-20" },
  { id: "print-sea", name: "Open sea (print)", category: "print", listedOn: "2026-10-30", seasons: [6, 7, 8], exposure: 1, lastShown: "2026-11-05" },
  { id: "tote-plain", name: "Plain tote", category: "tote", listedOn: "2025-05-05", seasons: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], exposure: 9, lastShown: "2026-11-06" },
  { id: "tote-leaf", name: "Leaf tote", category: "tote", listedOn: "2026-09-15", seasons: [9, 10, 11], exposure: 0, lastShown: null },
];

export const showcase = createShelf<Product, Audience>({
  slots: [
    { role: "new-arrival", match: (item, ctx) => ctx.withinDays(item.listedOn, 21), prefer: (item) => -Date.parse(item.listedOn) },
    { role: "underexposed" },
    { role: "seasonal", match: (item, ctx) => item.seasons.includes(ctx.audience.month) },
  ],
  lanes: [
    { name: "mug", match: (item) => item.category === "mug" },
    { name: "print", match: (item) => item.category === "print" },
    { name: "tote", match: (item) => item.category === "tote" },
  ],
  cooldownDays: 2,
});

export function run(date = "2026-11-07") {
  const month = Number(date.slice(5, 7));
  return showcase.select({ date, audience: { month }, items: products });
}

if (isMain(import.meta.url)) {
  for (const date of ["2026-11-07", "2026-11-08", "2026-11-09"]) {
    console.log(date, "lanes:", showcase.lanesFor(date, { month: 11 }).join(" / "));
    for (const pick of run(date)) console.log(`  ${pick.position}. [${pick.role} / ${pick.lane}] ${pick.item.name}${pick.relaxation ? `  (relaxed ${pick.relaxation})` : ""}`);
  }
}
