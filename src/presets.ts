import type { Item, Lane, ShelfConfig, Slot } from "./types.js";

export type EditorialItem = {
  /** When the item became publishable: a `YYYY-MM-DD` string, ISO timestamp or Date. */
  publishedAt: string | Date;
  /** Optional language or other audience facet, compared with `audience` by the language lanes. */
  language?: string | undefined;
};

export type EditorialOptions<T, A> = {
  /** An item counts as "new" for this many days after `publishedAt`. Default 14. */
  newDays?: number;
  /** An item counts as a "rediscovery" when never shown or last shown at least this many days ago. Default 30. */
  rediscoveryDays?: number;
  /** Reads the publication date from an item. Default `item.publishedAt`. */
  publishedAt?: (item: Item<T>) => string | Date | null | undefined;
  /**
   * Reads the item's language (or any facet to match against `audience`). When given, three lanes
   * rotate across the slots: `preferred` (same as the audience), `any`, `cross` (different from the
   * audience). Default: `item.language` when items carry one; pass `null` to disable lanes.
   */
  language?: ((item: Item<T>, audience: A) => string | undefined) | null;
  cooldownDays?: number;
  version?: string;
};

/**
 * Three slots that give every item a way onto the shelf: `new` (recently published, newest first
 * among equals), `underexposed` (anything, least shown first), `rediscovery` (not shown for a
 * while). With a language accessor, lanes keep the mix between the audience's own language and
 * the rest. This is the configuration Artsnet's home page uses.
 */
export function editorialPreset<T = EditorialItem, A = string>(options: EditorialOptions<T, A> = {}): ShelfConfig<T, A> {
  const newDays = options.newDays ?? 14;
  const rediscoveryDays = options.rediscoveryDays ?? 30;
  const publishedAt = options.publishedAt ?? ((item: Item<T>) => (item as Partial<EditorialItem>).publishedAt);
  const language =
    options.language === null ? null : (options.language ?? ((item: Item<T>) => { const value = (item as Partial<EditorialItem>).language; return typeof value === "string" ? value : undefined; }));
  const slots: Slot<T, A>[] = [
    {
      role: "new",
      match: (item, context) => context.withinDays(publishedAt(item), newDays),
      prefer: (item) => {
        const value = publishedAt(item);
        const time = value instanceof Date ? value.getTime() : value ? Date.parse(typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value) : 0;
        return Number.isNaN(time) ? 0 : -time;
      },
    },
    { role: "underexposed" },
    {
      role: "rediscovery",
      match: (item, context) => item.lastShown === null || (context.daysSince(item.lastShown) ?? 0) >= rediscoveryDays,
    },
  ];
  const lanes: Lane<T, A>[] | undefined = language
    ? [
        { name: "preferred", match: (item, context) => language(item, context.audience) === String(context.audience) },
        { name: "any" },
        { name: "cross", match: (item, context) => language(item, context.audience) !== String(context.audience) },
      ]
    : undefined;
  const config: ShelfConfig<T, A> = { slots };
  if (lanes) config.lanes = lanes;
  if (options.cooldownDays !== undefined) config.cooldownDays = options.cooldownDays;
  if (options.version !== undefined) config.version = options.version;
  return config;
}

export type RotationOptions = { size: number; cooldownDays?: number; version?: string };

/** `size` identical slots that simply take the least-exposed items. The plainest fair rotation. */
export function rotationPreset<T = Record<string, unknown>, A = unknown>(options: RotationOptions): ShelfConfig<T, A> {
  if (!Number.isInteger(options.size) || options.size < 1) throw new TypeError("size must be a positive integer");
  const config: ShelfConfig<T, A> = { slots: Array.from({ length: options.size }, () => ({ role: "underexposed" })) };
  if (options.cooldownDays !== undefined) config.cooldownDays = options.cooldownDays;
  if (options.version !== undefined) config.version = options.version;
  return config;
}
