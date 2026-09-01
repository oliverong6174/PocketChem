/**
 * Alphabetization key used for substituent/prefix ordering.
 * Multiplicative prefixes and nonalphabetized sec-/tert- descriptors are
 * ignored. iso- remains significant, consistent with standard introductory
 * organic nomenclature conventions.
 */
export function getAlphabetizationKey(prefix: string) {
  return prefix
    .trim()
    .toLowerCase()
    .replace(/^(?:\d+(?:,\d+)*-|(?:n|o|s|p)(?:,(?:n|o|s|p))*-)+/i, "")
    .replace(/^(?:sec-|tert-)/, "")
    .replace(/^(?:di|tri|tetra|penta|hexa|hepta|octa|nona|deca|bis|tris|tetrakis)/, "")
    .replace(/[^a-z0-9]/g, "");
}
