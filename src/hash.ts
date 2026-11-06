/** FNV-1a 32-bit over the UTF-8 bytes of `value`. Stable across runtimes; used only for deterministic tie-breaking and rotation. */
export function hash(value: string): number {
  let result = 2166136261;
  for (const byte of new TextEncoder().encode(value)) {
    result ^= byte;
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}
