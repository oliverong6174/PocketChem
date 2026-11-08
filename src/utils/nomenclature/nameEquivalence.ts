import { canonicalizeStereoStructure, compareStereoStructureKeys } from "../reactions/engine/stereochemistry";

/** Optional offline name-to-structure evidence. Return null for unresolved names.
 * A resolver must resolve each complete name, including its stereo and mixture
 * qualifiers; the comparator never infers a structure from the other name.
 */
export type NameStructureResolver = (name: string) => Promise<string | null>;

const lexical: Array<[RegExp, string]> = [
  [/(?<![a-z])methanoyl/g, "formyl"], [/(?<![a-z])methanoate/g, "formate"],
  [/(?<![a-z])methanoic/g, "formic"], [/(?<![a-z])ethanoyl/g, "acetyl"],
  [/(?<![a-z])ethanoate/g, "acetate"], [/(?<![a-z])ethanoic/g, "acetic"],
  [/(?<![a-z])ethanedioic/g, "oxalic"],
  [/ethan-1-(one|ol|amine)/g, "ethan$1"],
  [/prop-2-en-1-yl/g, "prop-2-enyl"],
  [/(cyclo[a-z]+-\d+-en)-1-(one|ol|amine)/g, "$1$2"],
  [/(cyclo[a-z]+)-1-ene\b/g, "$1ene"],
];

function parse(name: string) {
  let text = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2010-\u2015]/g, "-").replace(/\u2019/g, "'").toLowerCase().trim();
  for (const [pattern, replacement] of lexical) text = text.replace(pattern, replacement);
  const descriptors: Array<{ locant: string; value: string }> = [];
  text = text.replace(/\(((?:\d+[a-z]?'?)?[rsez](?:,(?:\d+[a-z]?'?)?[rsez])*)\)-?/g, (_, group: string) => {
    for (const token of group.split(",")) {
      const match = /^(.*)([rsez])$/.exec(token)!;
      descriptors.push({ locant: match[1], value: match[2] });
    }
    return "";
  });
  const relative = [...text.matchAll(/\b(cis|trans)-?/g)].map(m => m[1]).sort().join(",");
  text = text.replace(/\b(cis|trans)-?/g, "");
  const mixture = [...text.matchAll(/\b(racemic|rac|dl)-?/g)].map(m => m[1] === "racemic" ? "rac" : m[1]).join(",");
  text = text.replace(/\b(racemic|rac|dl)-?/g, "");
  const body = text.replace(/\s+/g, "").replace(/[()]/g, "").replace(/^-+/, "").replace(/--+/g, "-");
  // Omitted locants are safe only when the name has a unique possible locant.
  const locants = [...new Set(body.match(/\d+[a-z]?'?/g) ?? [])];
  if (descriptors.length === 1 && !descriptors[0].locant && locants.length === 1) descriptors[0].locant = locants[0];
  return { body, descriptors: descriptors.map(d => `${d.locant}:${d.value}`).sort().join(","), relative, mixture };
}

/** Conservative lexical equivalence, with RDKit graph identity when both full
 * names independently resolve. No descriptors are discarded to force a match.
 * Unresolved symmetry/retained-name cases return false rather than guessing.
 */
export async function namesEquivalent(a: string, b: string, resolve?: NameStructureResolver): Promise<boolean> {
  if (!a.trim() || !b.trim()) return false;
  const x = parse(a), y = parse(b);
  if (x.mixture !== y.mixture) return false;
  // Contradictory explicit relative labels invalidate a lexical or graph match.
  if (x.relative && y.relative && x.relative !== y.relative) return false;
  if (resolve) {
    const [sa, sb] = await Promise.all([resolve(a), resolve(b)]);
    if (sa && sb) {
      const [ka, kb] = await Promise.all([canonicalizeStereoStructure(sa), canonicalizeStereoStructure(sb)]);
      return Boolean(ka && kb && compareStereoStructureKeys(ka, kb) === "exact");
    }
  }
  return x.body === y.body && x.descriptors === y.descriptors && x.relative === y.relative;
}
