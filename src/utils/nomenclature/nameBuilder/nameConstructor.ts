export function constructName(parts: Array<string | null | undefined>) {
  const cleaned = parts.filter(Boolean) as string[];

  if (cleaned.length === 0) return "";

  if (cleaned.length === 1) return cleaned[0];

  const [suffixName] = cleaned.slice(-1);
  const prefixParts = cleaned.slice(0, -1);

  const prefixString = prefixParts
    .map((part) => part.replace(/-$/, ""))
    .filter(Boolean)
    .join("-");

  return prefixString ? `${prefixString}${suffixName}` : suffixName;
}