/** Whole numbers lo..hi inclusive, for option lists. */
export const rangeOf = (lo: number, hi: number): number[] => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
