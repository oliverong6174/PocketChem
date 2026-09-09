/**
 * Legacy compatibility helper for rendering reagent labels.
 *
 * Reaction mechanics must never depend on this parser. It exists only because
 * much of the current catalog still stores reagent presentation as a string.
 * New structured condition metadata can replace this function later without
 * changing any chemistry code.
 */
export function reagentBubbleLabels(label: string): string[] {
  const parts = label
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);

  const isAlternativeList =
    parts.length > 1 && /^or\s+/i.test(parts[parts.length - 1] ?? "");

  if (!isAlternativeList) return [label];
  return parts.map((part) => part.replace(/^or\s+/i, "").trim());
}
