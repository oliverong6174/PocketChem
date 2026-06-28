export function capitalizeFirst(value: string) {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function joinWithCommas(values: string[]) {
  return values.filter(Boolean).join(", ");
}

export function formatLocants(locants: number[]) {
  return [...locants].sort((a, b) => a - b).join(",");
}

export function formatLocantedPrefix(locants: number[], prefix: string) {
  if (locants.length === 0) return prefix;
  return `${formatLocants(locants)}-${prefix}`;
}

export function dedupeStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

export function sortNumbers(values: number[]) {
  return [...values].sort((a, b) => a - b);
}