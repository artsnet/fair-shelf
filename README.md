# fair-shelf

Deterministic, fair daily rotation for curated lists. Reserve a slot per role (new, underexposed, rediscovery, or roles you define), fill each slot with the least-exposed eligible item, rest items that were just shown, and get the same result for the same day on every server. No popularity ranking, no randomness, no dependencies.

Library (Node 20+, Cloudflare Workers, browsers) plus a CLI that picks today's shelf or replays months of days and reports how evenly items were shown.

[日本語](#日本語) · [Examples](examples/README.md)

```ts
import { createShelf, editorialPreset } from "@artsnet/fair-shelf";

const shelf = createShelf(editorialPreset({ language: null }));

shelf.select({
  date: "2026-11-07",
  items: [
    { id: "p1", publishedAt: "2026-11-05", exposure: 0, lastShown: null },
    { id: "p2", publishedAt: "2026-06-12", exposure: 4, lastShown: "2026-09-20" },
    { id: "p3", publishedAt: "2026-08-15", exposure: 0, lastShown: null },
  ],
});
// [ { position: 1, id: "p1", role: "new", lane: "any", relaxation: 0, item: … },
//   { position: 2, id: "p3", role: "underexposed", … },
//   { position: 3, id: "p2", role: "rediscovery", … } ]
```

## Who this is for

Any list that is curated rather than ranked, where everything in the pool deserves a turn:

- a blog or magazine home page (new, under-read, worth rediscovering)
- a small shop's featured row (new arrivals, seasonal, not always the bestseller)
- a community gallery, a showcase of member projects, a directory of events or jobs
- a multilingual catalogue that should mix the visitor's language with others in a fixed proportion

It replaces "sort by views" and `ORDER BY RANDOM()` with something you can explain: every item's position follows from the date, its exposure, and the rules you wrote. The [examples](examples/README.md) are six complete scenarios, each runnable.

## How a selection works

1. **Slots.** The shelf has one slot per role, in order. A slot's `match` says which items may fill it; its `prefer` breaks ties (newest first, say).
2. **Lanes.** Optional facets such as language or category. Lanes rotate across the slots by date, so over `lanes.length` days every slot has seen every lane. The rotation also depends on `audience` and `version`.
3. **Ordering.** Within a slot, candidates are ordered by lowest `exposure`, then oldest `lastShown` (never shown first), then the slot's `prefer`, then a hash of date, audience, version, role and id. The hash is the only "randomness" and it is reproducible.
4. **Cooldown.** An item shown within `cooldownDays` before the date is skipped while alternatives exist.
5. **Relaxation.** A position that cannot be filled relaxes one rule at a time: the cooldown (1), then the lane (2), then the role (3). Each pick reports the level it needed, so a thin pool shows up in your metrics instead of as a hole. An item is never picked twice on the same day.
6. **Reserved positions.** Positions you filled by hand are skipped and their items excluded.

Nothing here reads a clock or a time zone. You decide what today's date is for your audience and pass it in, and you supply the exposure facts from your own log of showings. That is what makes the output reproducible and testable.

## Library

```bash
npm install @artsnet/fair-shelf
```

### Items

```ts
type Item<T> = T & {
  id: string;
  exposure: number;              // showings in your lookback window (e.g. 90 days); lower first
  lastShown: string | null;      // YYYY-MM-DD; older first, never-shown first of all
  shownDates?: string[];         // recent showing dates, for the cooldown (defaults to lastShown)
};
```

Everything else on an item is yours. See `examples/03-community-gallery.ts` for building these facts from a showings log.

### Configuration

```ts
const shelf = createShelf<Product, { month: number }>({
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
  cooldownDays: 2, // default 3
  version: "v1",   // change to reshuffle every assignment at once
});

shelf.select({ date: "2026-11-07", audience: { month: 11 }, items, reserved: [{ position: 1, id: "hand-picked" }] });
shelf.lanesFor("2026-11-07", { month: 11 }); // ["print", "tote", "mug"]
```

Callbacks receive a context with `date`, `audience`, `daysSince(value)` and `withinDays(value, days)`; `value` may be a `YYYY-MM-DD` string, an ISO timestamp or a `Date`.

### Presets

- `editorialPreset({ newDays = 14, rediscoveryDays = 30, publishedAt?, language?, cooldownDays?, version? })`: slots `new`, `underexposed`, `rediscovery`. With a language (default `item.language`), lanes `preferred` / `any` / `cross` compare it with `audience`; pass `language: null` for a single-language list. This is the configuration behind Artsnet's home page.
- `rotationPreset({ size, cooldownDays?, version? })`: `size` identical least-exposed slots. The plainest fair rotation.

### Simulator

```ts
import { simulate, formatSimulation } from "@artsnet/fair-shelf";

const result = simulate({ shelf, items, startDate: "2026-01-01", days: 90, audiences: ["ja", "en"] });
console.log(formatSimulation(result));
// 90 days × 2 audience(s): 540 picks over 40 items
// shown per item: min 10, max 20, mean 13.50, gini 0.072, never shown 0
// relaxation: none 253, cooldown ignored 45, lane ignored 10, role ignored 232
// …one row per item with showings, share, longest gap and roles
```

Each day's picks are fed back as exposure (within `exposureWindowDays`, default 90). Because everything is deterministic, a simulation doubles as a regression test for a configuration: assert on `summary.gini`, `summary.neverShown` or `summary.relaxation` in your test suite.

## CLI

```bash
npx @artsnet/fair-shelf pick --items items.json --date 2026-11-07 --audience ja
npx @artsnet/fair-shelf simulate --items items.json --days 90 --start 2026-01-01 --audiences ja,en
npx @artsnet/fair-shelf simulate --items items.json --days 90 --preset rotation --size 4 --json
```

`items.json` is an array of objects with `id` and, for the editorial preset, `publishedAt` (plus optional `language`, `exposure`, `lastShown`, `shownDates`). Options: `--preset editorial|rotation`, `--size`, `--new-days`, `--rediscovery-days`, `--cooldown`, `--version-tag`, `--window`, `--log`, `--json`. Exit codes: `0` ok, `1` usage error, `2` bad input file.

## Design notes

- The order in which slots get first choice shifts every `slots.length` days, so no slot is always first.
- A relaxed lane still prefers items that fit the lane; relaxation only widens the pool.
- The FNV-1a tie-break hash is stable across runtimes; results are identical in Node, Workers and browsers.
- Changing `version` changes every rotation and tie-break at once. Use it when you redesign the shelf or run an A/B arm; bump it rather than editing hashes.
- Not included on purpose: exposure counting (it depends on your storage), time zones (pass the date), weighting by popularity (the point is not to).

## Development

```bash
npm install
npm run typecheck && npm test && npm run build
npm run examples                  # runs every example
npm run example examples/05-simulate-fairness.ts
```

MIT © Artsnet. See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).

---

## 日本語

編集型の一覧のための、決定的で公平な日替わり選出ライブラリです。役割ごとに枠を確保し(新着・露出不足・再発見、または自分で定義した役割)、枠内は露出回数の少ないものから選び、直近に出したものは休ませ、同じ日・同じ入力ならどのサーバーでも同じ結果になります。人気順でもランダムでもなく、依存パッケージもありません。

ライブラリ(Node 20 以上、Cloudflare Workers、ブラウザ)に加えて、今日の選出を出す CLI と、数か月分を再生して露出の偏りを表にするシミュレーターを同梱しています。

### 向いている用途

- ブログやメディアのトップ枠(新着・読まれていない記事・再掲したい過去記事)
- 小さな EC の「おすすめ」枠(新商品・季節もの・売上順にしない)
- コミュニティの作品紹介、メンバーのプロジェクト一覧、イベントや求人の一覧
- 閲覧者の言語と他言語の作品を決まった比率で混ぜたい多言語カタログ

「閲覧数順」や `ORDER BY RANDOM()` の代わりに、説明できる仕組みを置くためのものです。各アイテムの位置は、日付と露出回数と自分で書いたルールから決まります。[examples](examples/README.md) に 6 つの完全なシナリオがあり、どれも実行できます。

### 仕組み

1. **枠(slot)** 役割ごとに 1 枠。`match` でその枠に入れるアイテムを、`prefer` で同点時の優先を決めます。
2. **レーン(lane)** 言語やカテゴリなどの切り口。日付に応じて枠の間を回るので、`lanes.length` 日で全枠が全レーンを一度ずつ経験します。回り方は `audience` と `version` にも依存します。
3. **並び順** 枠内の候補は、露出回数の少ない順、最終表示日の古い順(未表示が最優先)、枠の `prefer`、最後に日付・対象・バージョン・役割・ID のハッシュで並びます。この ハッシュだけが「ランダム性」で、再現可能です。
4. **クールダウン** `cooldownDays` 以内に表示したアイテムは、代替がある限り飛ばします。
5. **緩和** 埋まらない枠は、クールダウン(1)、レーン(2)、役割(3)の順に 1 つずつルールを外します。各選出に緩和レベルが付くので、候補不足が穴ではなく数字として見えます。同じ日に同じアイテムを 2 回選ぶことはありません。
6. **予約枠** 手で決めた位置は飛ばし、そのアイテムは除外します。

時計もタイムゾーンも参照しません。閲覧者にとっての「今日」はアプリ側で決めて渡し、露出回数も自分の表示ログから計算して渡します。それが再現性とテスト可能性の源です。

### 使い方

```ts
import { createShelf, editorialPreset } from "@artsnet/fair-shelf";

const shelf = createShelf(editorialPreset()); // 新着 14 日、再発見 30 日、言語レーン付き
const picks = shelf.select({ date: "2026-11-07", audience: "ja", items });
```

アイテムは `id`、`exposure`(直近の表示回数)、`lastShown`(最終表示日、未表示なら null)、任意で `shownDates` を持ち、他の属性は自由です。プリセットは `editorialPreset`(新着・露出不足・再発見。Artsnet のトップページと同じ設定)と `rotationPreset`(同じ枠を N 個並べた最も素朴な公平ローテーション)の 2 つで、`createShelf` に自分の枠とレーンを渡すこともできます。

```bash
npx @artsnet/fair-shelf pick --items items.json --date 2026-11-07 --audience ja
npx @artsnet/fair-shelf simulate --items items.json --days 90 --audiences ja,en
```

### 含めていないもの

露出回数の集計(保存先に依存するため)、タイムゾーン処理(日付を渡してください)、人気による重み付け(それをしないための道具です)。
