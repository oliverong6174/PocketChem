// Stage 9J: stereo-sensitive synonym equivalence for IUPAC-style names.
//
// The Stage 9I "errata-aware" comparison stripped every CIP descriptor and every cis/trans, so (R)- and (S)- (or E- and Z-) names compared
// equal. That accepts a name of a DIFFERENT molecule as a synonym. This module keeps the lexical equivalences (all are alternative spellings
// of the same structure) but compares stereodescriptors explicitly. It never touches the frozen Stage 9H scorer.

const normBase = (s) => String(s ?? "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[\s‐-―]/g, "").replace(/’/g, "'");

// Lexical equivalences: identical structures, different accepted spelling. Order matters (methanoate contains ethanoate).
// Applied BEFORE whitespace is removed, with a lookbehind, so that "sodium ethanoate" is not misread as "sodiu" + "methanoate".
const LEXICAL = [
  [/(?<![a-z])methanoyl/g, "formyl"], [/(?<![a-z])methanoate/g, "formate"], [/(?<![a-z])methanoic/g, "formic"],
  [/(?<![a-z])ethanoyl/g, "acetyl"], [/(?<![a-z])ethanoate/g, "acetate"], [/(?<![a-z])ethanoic/g, "acetic"],
  [/(?<![a-z])ethanedioic/g, "oxalic"], // ethanedioic acid = oxalic acid (retained name, P-65.1.1.1)
  [/ethan-1-(one|ol|amine)/g, "ethan$1"], // locant 1 is implied for a two-carbon chain (1-phenylethan-1-one = 1-phenylethanone)
  [/prop-2-en-1-yl/g, "prop-2-enyl"], // allyl substituent, 2013 vs 1979 spelling
  [/(cyclo[a-z]+-\d+-en)-1-(one|ol|amine)/g, "$1$2"],
  [/(cyclo[a-z]+)-1-ene\b/g, "$1ene"],
];

const CIP_GROUP = /\(((?:\d+[a-z]?'?)?[rsez](?:,(?:\d+[a-z]?'?)?[rsez])*)\)-?/g;

/** { body, cip, ringRelative } where cip is the ordered descriptor letters (locants dropped) and ringRelative is cis/trans or "". */
export function parseName(name) {
  let text = String(name ?? "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[‐-―]/g, "-").replace(/’/g, "'");
  text = text.replace(/\s+/g, " ").trim();
  for (const [pattern, replacement] of LEXICAL) text = text.replace(pattern, replacement);
  text = normBase(text);
  const cip = [];
  text = text.replace(CIP_GROUP, (_, inner) => {
    for (const part of inner.split(",")) cip.push(part.replace(/^\d+[a-z]?'?(?=[rsez]$)/, ""));
    return "";
  });
  const rel = (text.match(/(cis|trans)-?/) ?? [])[1] ?? "";
  text = text.replace(/(cis|trans)-?/g, "");
  text = text.replace(/[()]/g, "").replace(/^-+/, "").replace(/--+/g, "-");
  return { body: text, cip, ringRelative: rel };
}

export function namesEquivalent(a, b) {
  const x = parseName(a);
  const y = parseName(b);
  if (x.body !== y.body) return false;
  if (x.cip.join(",") !== y.cip.join(",")) return false;
  // cis/trans is redundant only when both names carry CIP descriptors; otherwise it is the only stereo information and must agree.
  if (x.cip.length && y.cip.length) return true;
  return x.ringRelative === y.ringRelative;
}
