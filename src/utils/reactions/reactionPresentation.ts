/**
 * Legacy compatibility helper for rendering reagent labels.
 *
 * Reaction mechanics must never depend on this parser. It exists only because
 * much of the current catalog still stores reagent presentation as a string.
 * New structured condition metadata can replace this function later without
 * changing any chemistry code.
 */
function normalizeBubbleWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function splitTopLevel(value: string, delimiter: "comma" | "or"): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "(") depth += 1;
    if (character === ")" && depth > 0) depth -= 1;

    if (depth !== 0) continue;

    if (delimiter === "comma" && character === ",") {
      parts.push(value.slice(start, index));
      start = index + 1;
      continue;
    }

    if (
      delimiter === "or" &&
      value.slice(index).match(/^\s+or\s+/i)
    ) {
      parts.push(value.slice(start, index));
      const match = value.slice(index).match(/^\s+or\s+/i);
      start = index + (match?.[0].length ?? 0);
      index = start - 1;
    }
  }

  parts.push(value.slice(start));
  return parts.map((part) => normalizeBubbleWhitespace(part)).filter(Boolean);
}

function looksLikeSharedTailAlternative(alternatives: readonly string[]) {
  if (alternatives.length !== 2) return false;
  const [left, right] = alternatives;
  const leftCommaParts = splitTopLevel(left, "comma");
  const rightCommaParts = splitTopLevel(right, "comma");
  return leftCommaParts.length === 1 && rightCommaParts.length >= 2;
}

function expandSharedTailAlternatives(alternatives: readonly string[]) {
  const [left, right] = alternatives;
  const rightCommaParts = splitTopLevel(right, "comma");
  if (rightCommaParts.length < 2) return [...alternatives];

  const [rightHead, ...sharedTail] = rightCommaParts;
  const sharedTailLabel = sharedTail.join(", ");
  return [
    `${left}, ${sharedTailLabel}`,
    `${rightHead}, ${sharedTailLabel}`,
  ].map((part) => normalizeBubbleWhitespace(part));
}

function splitSerialAlternatives(stepBody: string) {
  const commaParts = splitTopLevel(stepBody.replace(/,\s+or\s+/gi, ", "), "comma");
  return commaParts.length > 1 ? commaParts : [normalizeBubbleWhitespace(stepBody)];
}

function splitStepAlternatives(stepLabel: string): string[] {
  const normalized = normalizeBubbleWhitespace(stepLabel);
  if (!normalized) return [];

  const stepMatch = normalized.match(/^(\d+\))\s*(.*)$/);
  const stepPrefix = stepMatch?.[1] ?? "";
  const body = stepMatch?.[2] ?? normalized;

  const topLevelAlternatives = splitTopLevel(body, "or");
  let bubbles: string[];

  if (topLevelAlternatives.length <= 1) {
    // `body` has the step prefix removed. The prefix is added exactly once
    // below, so keeping `normalized` here would produce labels such as
    // "1) 1) Ph3P" and "2) 2) strong base".
    bubbles = [body];
  } else if (/,[ ]*or[ ]+/i.test(body) && splitTopLevel(body, "comma").length >= 3) {
    bubbles = splitSerialAlternatives(body);
  } else if (looksLikeSharedTailAlternative(topLevelAlternatives)) {
    bubbles = expandSharedTailAlternatives(topLevelAlternatives);
  } else {
    bubbles = topLevelAlternatives;
  }

  return bubbles.map((part, index) => (
    stepPrefix && index === 0 ? `${stepPrefix} ${part}` : part
  ));
}

export function reagentBubbleLabels(label: string): string[] {
  const normalized = label.replace(/\s{2,}/g, '; ');
  const stepLikeParts = normalized
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);

  if (stepLikeParts.length > 1) {
    return stepLikeParts.flatMap(splitStepAlternatives);
  }

  const alternatives = splitStepAlternatives(label);
  return alternatives.length > 0 ? alternatives : [label];
}
