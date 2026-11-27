/**
 * Plain-text form of a chemical name taken from the bundled ChEBI data.
 *
 * ChEBI stores italic stereodescriptors and sub/superscripts as inline HTML, for example
 * "(3<i>S</i>,5<i>Z</i>)-...". React renders strings as text, so those tags would be shown
 * literally. Names are therefore reduced to plain text here: tags are removed (never
 * interpreted or injected) and the few HTML entities ChEBI uses are decoded. The stored
 * database is not modified.
 */
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  omega: "ω",
  mu: "μ",
  plusmn: "±",
  prime: "′",
  minus: "−",
  ndash: "–",
  mdash: "—",
};

function decodeEntity(entity: string, body: string): string {
  if (body.startsWith("#")) {
    const hex = body[1] === "x" || body[1] === "X";
    const code = Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
    if (Number.isFinite(code) && code > 0 && code <= 0x10ffff) {
      try {
        return String.fromCodePoint(code);
      } catch {
        return entity;
      }
    }
    return entity;
  }
  return NAMED_ENTITIES[body.toLowerCase()] ?? entity;
}

export function toPlainChemicalName(value: string): string;
export function toPlainChemicalName(value: string | null | undefined): string | null;
export function toPlainChemicalName(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const withoutTags = value.replace(/<\/?[a-zA-Z][^<>]*>/g, "");
  const decoded = withoutTags.replace(/&(#[0-9]+|#[xX][0-9a-fA-F]+|[a-zA-Z]+);/g, decodeEntity);
  const plain = decoded.replace(/\s+/g, " ").trim();
  return plain || null;
}
