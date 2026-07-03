export function formatDisplayName(
  iupacName: string,
  commonName: string | null
): string {
  return commonName
    ? `${iupacName} (${commonName})`
    : iupacName;
}