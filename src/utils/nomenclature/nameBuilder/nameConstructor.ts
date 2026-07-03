export function constructName(parts: Array<string | null | undefined>) {
  const cleaned = parts.filter(Boolean) as string[];

  if (cleaned.length === 0) return "";

  return cleaned
    .map((part, index) => {
      if (index === cleaned.length - 1) return part;
      return part.endsWith("-") ? part : `${part}-`;
    })
    .join("");
}