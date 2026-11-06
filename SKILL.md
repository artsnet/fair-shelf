---
name: fair-shelf
description: Pick a fair, deterministic daily selection for a curated list (home page shelf, featured row, gallery) using @artsnet/fair-shelf, or simulate a configuration to check how evenly items get shown. Use when a task asks for rotation, "give everything a turn", or an explainable alternative to popularity or random ordering.
---

# fair-shelf

`@artsnet/fair-shelf` fills N slots per day from a pool of items: one slot per role, least-exposed item first, recent picks rested, same result for the same date everywhere. It is a library plus a CLI; there is no network and no state.

## When to reach for it

- The user wants a list that rotates fairly rather than ranks by popularity or picks at random.
- The user needs to explain why an item appeared on a given day.
- The user asks whether a rotation design is fair: run the simulator and report the summary.

## Integrate it

1. Decide the date in the audience's time zone and pass it as `YYYY-MM-DD`. The library never reads a clock.
2. Build items with `id`, `exposure` (showings in the last N days), `lastShown`, optional `shownDates`. Compute these from the user's own showings log; `examples/03-community-gallery.ts` shows the pattern.
3. Start from a preset: `editorialPreset()` for new / underexposed / rediscovery (with `language: null` when there is one language), or `rotationPreset({ size })` for identical slots. Write custom `slots` and `lanes` only when the roles differ; see `examples/02-shop-showcase.ts`.
4. Write today's picks back to the showings log, or tomorrow will not know about today.
5. Keep `version` fixed once live. Bump it only to reshuffle everything deliberately.

## Check a configuration

```bash
npx -y @artsnet/fair-shelf simulate --items items.json --days 90 --audiences ja,en
```

Read `gini` (0 is perfectly even; under 0.1 is good), `never shown` (should be 0) and the `relaxation` counts (many "role ignored" picks mean a slot's rule rarely has candidates; widen it or accept it). In code, `simulate()` returns the same numbers for assertions.

## Rules

- Do not add popularity, votes or views to `exposure`; it counts showings only.
- Do not sort or shuffle the picks afterwards; `position` is the order.
- `reserved` is for positions a person filled by hand. Do not use it to force items in programmatically.
- A pick's `relaxation` above 0 is a signal to report, not an error to hide.
