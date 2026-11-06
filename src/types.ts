/**
 * The exposure facts every item must carry. Everything else on an item is yours; slots and lanes
 * read it through their `match` / `prefer` callbacks.
 */
export type ExposureFacts = {
  /** Stable identifier. One item is never picked twice on the same day. */
  id: string;
  /** How often the item was shown in your lookback window (for example the last 90 days). Lower is picked first. */
  exposure: number;
  /** Calendar date (`YYYY-MM-DD`) the item was last shown, or `null` if never. Older is picked first. */
  lastShown: string | null;
  /** Calendar dates the item was shown recently; used for the cooldown. Optional, defaults to `lastShown` alone. */
  shownDates?: readonly string[] | undefined;
};

export type Item<T = Record<string, unknown>> = T & ExposureFacts;

/** What a slot or lane callback gets alongside the item. */
export type Context<A = unknown> = {
  /** The selection date, `YYYY-MM-DD`. */
  date: string;
  /** Whatever you passed as `audience` (a locale, a segment, a region, …). */
  audience: A;
  /** Whole days from `value` to the selection date; negative for the future, `null` for missing or invalid values. */
  daysSince(value: string | Date | null | undefined): number | null;
  /** True when `value` is within the last `days` days including today. */
  withinDays(value: string | Date | null | undefined, days: number): boolean;
};

/** A position on the shelf with a job to do. */
export type Slot<T = Record<string, unknown>, A = unknown> = {
  /** Name reported on each pick, for example `new`, `underexposed`, `rediscovery`. */
  role: string;
  /** Which items may fill this slot. Default: every item. */
  match?: (item: Item<T>, context: Context<A>) => boolean;
  /**
   * Tie-breaker after exposure and last-shown date: lower comes first. For example `-publishedAt`
   * to favour the newest among equally exposed items. Default: no preference.
   */
  prefer?: (item: Item<T>, context: Context<A>) => number;
};

/**
 * A facet that rotates across the slots day by day, such as the audience's own language versus
 * other languages, or product categories. With three slots and three lanes, every slot sees every
 * lane over three days.
 */
export type Lane<T = Record<string, unknown>, A = unknown> = {
  name: string;
  /** Which items belong to this lane. Default: every item. */
  match?: (item: Item<T>, context: Context<A>) => boolean;
};

export type ShelfConfig<T = Record<string, unknown>, A = unknown> = {
  slots: readonly Slot<T, A>[];
  /** Default: one lane named `any` that matches everything. */
  lanes?: readonly Lane<T, A>[];
  /** An item shown within this many days before the selection date is skipped while alternatives exist. Default 3. */
  cooldownDays?: number;
  /**
   * Mixed into the rotation and the tie-break hash. Change it to reshuffle every assignment at once
   * (a redesign, an A/B arm) without changing anything else. Default `v1`.
   */
  version?: string;
};

export type SelectInput<T = Record<string, unknown>, A = unknown> = {
  /** `YYYY-MM-DD`. Decide it in your audience's time zone before calling. */
  date: string;
  /** Opaque value handed to slot and lane callbacks and mixed into the rotation. Default `undefined`. */
  audience?: A;
  items: readonly Item<T>[];
  /** Positions (1-based) already filled today, for example by a hand-picked feature. Those items are never picked again. */
  reserved?: readonly { position: number; id: string }[];
};

export type Pick<T = Record<string, unknown>> = {
  /** 1-based position on the shelf, in slot order. */
  position: number;
  id: string;
  role: string;
  lane: string;
  item: Item<T>;
  /**
   * How many constraints had to be dropped to fill this position: 0 none, 1 cooldown ignored,
   * 2 lane ignored, 3 role ignored. Useful for monitoring how often the pool runs thin.
   */
  relaxation: 0 | 1 | 2 | 3;
};

export type ResolvedShelfConfig<T = Record<string, unknown>, A = unknown> = {
  slots: readonly Slot<T, A>[];
  lanes: readonly Lane<T, A>[];
  cooldownDays: number;
  version: string;
};

export type Shelf<T = Record<string, unknown>, A = unknown> = {
  readonly config: ResolvedShelfConfig<T, A>;
  /** Number of positions on the shelf. */
  readonly size: number;
  /** Deterministic: the same input always yields the same picks, on any runtime. Never mutates `items`. */
  select(input: SelectInput<T, A>): Pick<T>[];
  /** The lane each position gets on `date`, without selecting anything. */
  lanesFor(date: string, audience?: A): string[];
};
