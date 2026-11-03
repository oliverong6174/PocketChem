import type { NomenclatureResult, ParsedMol } from "../types";

type QueryHandle = { delete?: () => void };
type QueryMol = { get_substruct_matches: (query: QueryHandle) => string };
type QueryRdkit = { get_qmol: (smarts: string) => QueryHandle | null };

function countMatches(RDKit: QueryRdkit, mol: QueryMol, smarts: string): number {
  const query = RDKit.get_qmol(smarts);
  if (!query) return 0;
  try {
    const parsed = JSON.parse(mol.get_substruct_matches(query));
    if (Array.isArray(parsed)) return parsed.length;
    return parsed?.atoms ? 1 : 0;
  } catch {
    return 0;
  } finally {
    query.delete?.();
  }
}

function connectedComponents(parsedMol: ParsedMol): number {
  const seen = new Set<number>();
  let components = 0;
  for (const atom of parsedMol.atoms) {
    if (seen.has(atom.atomIndex)) continue;
    components += 1;
    const stack = [atom.atomIndex];
    while (stack.length) {
      const current = stack.pop() as number;
      if (seen.has(current)) continue;
      seen.add(current);
      for (const bond of parsedMol.adjacency.get(current) ?? []) {
        stack.push(bond.atomA === current ? bond.atomB : bond.atomA);
      }
    }
  }
  return components;
}

/**
 * Structural features the name builders do not describe correctly. When one of them is present and the name did not come from a
 * structure-recognised (retained or common) route, the systematic name is withheld rather than shown with confidence: the generic
 * chain/ring builder reads a fused or bridged skeleton as separate chains and produces a name for a different molecule
 * (cyclohexene oxide as "di(hexyloxypentyl)oxirane", cubane as "octane", crown ethers as "bis(ethoxyethoxy)ethane").
 * Returns a reason, or null when the structure is within what the builders handle.
 */
export function assessNamingSupport(
  RDKit: QueryRdkit,
  mol: QueryMol,
  parsedMol: ParsedMol,
  canonicalSmiles: string | null,
  result: NomenclatureResult,
): string | null {
  // Isotope labels are not part of any name the builders write; the result would describe the unlabelled compound.
  if (canonicalSmiles && /\[\d+[A-Z]/.test(canonicalSmiles)) {
    return "the structure carries isotopic labels, which PocketChem's names do not express (the name would describe the unlabelled compound)";
  }

  // Names recognised from the whole structure (retained heterocycles, common names) are trusted as before.
  if (result.namingStatus === "retained" || result.namingStatus === "common" || result.namingStatus === "unsupported") return null;

  const bonds = parsedMol.bonds.length;
  const atoms = parsedMol.atoms.length;
  const rings = bonds - atoms + connectedComponents(parsedMol);
  if (rings <= 0) return null;

  const spiro = countMatches(RDKit, mol, "[x4]") > 0;
  const aromatic = countMatches(RDKit, mol, "[a]") > 0;
  const ringHetero = countMatches(RDKit, mol, "[!#6;R]") > 0;
  const shared = countMatches(RDKit, mol, "[R;!R1]") > 0;

  if (spiro) return "the structure has a spiro centre, and PocketChem does not yet write spiro names";
  if (rings >= 3 && shared) return "the structure is a polycyclic (three or more fused or bridged rings) skeleton that PocketChem does not yet name";
  if (shared && aromatic) return "the structure is a fused aromatic ring system without a retained parent in PocketChem";
  if (shared && ringHetero) return "the structure is a fused or bridged heterocycle that PocketChem does not yet name (von Baeyer heteroatom and fusion nomenclature are not implemented)";
  // A fused or bridged skeleton is described correctly only by the von Baeyer route ("bicyclo[...]" / "tricyclo[...]"); any other builder
  // reads the shared atoms as separate chains.
  if (shared && !/(?:bi|tri)cyclo\[/.test(result.estimatedName)) return "the structure has a fused or bridged ring skeleton with substituents or functional groups that PocketChem's von Baeyer route does not cover";
  if (ringHetero && countMatches(RDKit, mol, "[!#6;r{9-}]") > 0) return "the structure contains a heteroatom macrocycle (crown-ether type), which PocketChem does not yet name";
  return null;
}

const RING_WORDS = /cyclo|benz|phen|naphth|toluene|xylene|styren|anilin|pyr(?:id|rol|az|im)|furan|thiophen|indol|quinol|oxir|azirid|thiir|oxet|azetid|thiet|oxol|thiol|oxan|thian|piperid|piperaz|morpholin|dioxol|dioxan|imidazol|thiazol|oxazol|triazol|tetrazol|purin|adamant|cubane|spiro/;
/** True when every letter of the name belongs to acyclic-chain vocabulary, so a missing ring word really means "named as a chain". */
const CHAIN_VOCABULARY = new RegExp(
  "^(?:(?:meth|eth|prop|but|pent|hex|hept|oct|non|dec|undec|dodec|tridec|tetradec|pentadec|hexadec|heptadec|octadec|nonadec|icos)(?:ane|ene|yne|yl|an|en|yn|a)?" +
    "|di|tri|tetra|penta|hexa|hepta|octa|bis|tris|sec|tert|iso|neo|n|ane|ene|yne|yl|diene|triene|yloxy|oxy|chloro|bromo|iodo|fluoro|hydroxy|methoxy|ethoxy|propoxy|butoxy|amino|nitro|oxo|cyano|formyl|carboxy|carbonyl|carbamoyl|imino|acetyl|sulfanyl" +
    "|oic|oate|acid|al|one|ol|amine|amide|nitrile|thiol|ethanoate|methanoate|propanoate|butanoate|ethanoic|methanoic)+$",
);
const isChainVocabulary = (name: string) => CHAIN_VOCABULARY.test(name.replace(/[^a-z]/g, ""));

const ALKENE_WORDS = /(?:^|[^a-z])[a-z]*?en(?:oic|oate|amide|nitrile|one|al|ol|yl|e|o)?(?![a-z])|ylidene|vinyl|allyl|styren/;
const ALKYNE_WORDS = /yn(?:oic|oate|e|yl)?(?![a-z])/;
const HALOGEN_WORDS = /fluor|chlor|bromo|iod|halo/;
const NITROGEN_WORDS = /amin|amid|nitr|imin|aza|azi|pyr(?:id|rol|az|im)|ind|quin|azol|pip|morph|cyan|carbamo|anilin|hydrazin|oxim|diazo|purin|urea|aniline/;
const SULFUR_WORDS = /thi|sulf|mercapt/;

/**
 * Cheap name-versus-structure consistency screen for a systematic name. It never tries to prove a name right; it only catches a name that
 * cannot describe the structure because a whole class of feature is missing from it: a molecule with rings named as a chain
 * ("dodecane" for dicyclohexyl, "trideca-hexaene" for diphenylmethane), fewer ring words than rings ("benzene" for biphenyl), a C=C or
 * C#C that the name never mentions (methylcyclopentane for methylidenecyclopentane), or a halogen, nitrogen or sulfur the name omits.
 * Names that use multipliers around ring words (di, tri, bis) are exempt from the ring-count test because the count cannot be read off.
 */
export function assessNameConsistency(
  RDKit: QueryRdkit,
  mol: QueryMol,
  parsedMol: ParsedMol,
  result: NomenclatureResult,
): string | null {
  // Retained parents are matched on a substructure, so they get only the ring-count test (a retained "benzene" for biphenyl drops a ring).
  const retained = result.namingStatus === "retained";
  if (result.namingStatus !== "systematic" && result.namingStatus !== "functional-class" && !retained) return null;
  const name = result.estimatedName.toLowerCase();
  const rings = parsedMol.bonds.length - parsedMol.atoms.length + connectedComponents(parsedMol);

  if (rings > 0) {
    if (!RING_WORDS.test(name)) {
      if (isChainVocabulary(name)) return `the molecule has ${rings} ring(s) but the generated name "${result.estimatedName}" contains no ring`;
      return null; // an unfamiliar (for example retained) name: the ring test cannot judge it
    }
    const multiplied = /(?:^|[^a-z])(?:di|tri|tetra|bis|tris)[a-z(]/.test(name) || /bi[a-z]*(?:cyclo|phenyl)/.test(name);
    if (!multiplied) {
      let weight = 0;
      weight += (name.match(/bicyclo/g) ?? []).length * 2 + (name.match(/tricyclo/g) ?? []).length * 3;
      const scrubbed = name.replace(/bicyclo|tricyclo/g, "");
      weight += (scrubbed.match(/cyclo|benz|phen|naphth|indol|quinol|purin|spiro/g) ?? []).length;
      weight += (scrubbed.match(/naphth|indol|quinol|purin/g) ?? []).length;
      // retained benzo-fused heterocycles are two-ring names (benzimidazole, benzofuran, ...)
      weight += (scrubbed.match(/benz(?:imidazol|oxazol|thiazol|ofuran|othiophen|odioxol|otriazol)/g) ?? []).length;
      if (weight > 0 && weight < rings && !/decahydro|tetrahydro|hexahydro|octahydro|dihydro/.test(name) && !/bicyclo|tricyclo|spiro/.test(name)) {
        return `the molecule has ${rings} rings but the generated name "${result.estimatedName}" describes fewer`;
      }
    }
  }
  if (retained) return null;
  if (countMatches(RDKit, mol, "[C;!a]=[C;!a]") > 0 && !ALKENE_WORDS.test(name)) return `the molecule has a C=C bond that the generated name "${result.estimatedName}" does not express`;
  if (countMatches(RDKit, mol, "[C]#[C]") > 0 && !ALKYNE_WORDS.test(name)) return `the molecule has a C#C bond that the generated name "${result.estimatedName}" does not express`;
  if (countMatches(RDKit, mol, "[F,Cl,Br,I]") > 0 && !HALOGEN_WORDS.test(name)) return `the molecule contains a halogen that the generated name "${result.estimatedName}" omits`;
  if (countMatches(RDKit, mol, "[#7]") > 0 && !NITROGEN_WORDS.test(name)) return `the molecule contains nitrogen that the generated name "${result.estimatedName}" omits`;
  if (countMatches(RDKit, mol, "[#16]") > 0 && !SULFUR_WORDS.test(name)) return `the molecule contains sulfur that the generated name "${result.estimatedName}" omits`;
  return null;
}
