/**
 * Two everyday situations. First, an editor hand-picks position 1 today: pass it as `reserved`
 * and the shelf fills the rest without repeating that item. Second, the pool is thin (a new
 * site, a niche category): the shelf relaxes its rules one at a time instead of leaving holes,
 * and `relaxation` on each pick tells you it had to.
 *
 * Run: npm run example examples/06-reserved-and-thin-pools.ts
 */
import { createShelf, editorialPreset, type Item } from "@artsnet/fair-shelf";
import { isMain } from "./_run.js";

type Post = { title: string; publishedAt: string };
const shelf = createShelf<Post, undefined>(editorialPreset<Post, undefined>({ language: null }));

const posts: Item<Post>[] = [
  { id: "feature", title: "Editor's feature for today", publishedAt: "2026-10-01", exposure: 1, lastShown: "2026-10-15" },
  { id: "new-1", title: "Fresh post", publishedAt: "2026-11-06", exposure: 0, lastShown: null },
  { id: "old-1", title: "From the archive", publishedAt: "2026-01-10", exposure: 2, lastShown: "2026-09-01" },
  { id: "old-2", title: "Also from the archive", publishedAt: "2026-02-10", exposure: 2, lastShown: "2026-10-20" },
];

export function run(date = "2026-11-07") {
  const withFeature = shelf.select({ date, items: posts, reserved: [{ position: 1, id: "feature" }] });
  const thin = shelf.select({ date, items: posts.filter((post) => post.id.startsWith("old")) });
  return { withFeature, thin };
}

if (isMain(import.meta.url)) {
  const { withFeature, thin } = run();
  console.log("With position 1 reserved for the feature:");
  console.log("  1. [reserved] Editor's feature for today");
  for (const pick of withFeature) console.log(`  ${pick.position}. [${pick.role}] ${pick.item.title}`);
  console.log("Thin pool (two archive posts, three slots):");
  for (const pick of thin) console.log(`  ${pick.position}. [${pick.role}] ${pick.item.title}  relaxation=${pick.relaxation}`);
  console.log("  (relaxation 3 = the role rule was dropped so the position would not stay empty)");
}
