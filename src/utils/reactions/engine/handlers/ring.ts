import { runReactionSmarts } from "../rdkitReaction";
import { getRDKit } from "../../../rdkit";
import { canonicalizeStereoStructure } from "../stereochemistry";

type RingMode =
  | "epoxideOpening"
  | "epoxideOrganometallicOpening"
  | "epoxideNucleophileOpening"
  | "intramolecularWilliamson";
type EpoxideNucleophile =
  | "water"
  | "hydroxide"
  | "alcohol"
  | "alkoxide"
  | "amine"
  | "ammonia"
  | "organometallic"
  | "halide";
/**
 * "tertiary-else-less-substituted" is the hydrogen halide rule: the halide attacks a tertiary epoxide carbon (SN1-like) when there
 * is one, otherwise the less substituted carbon (SN2-like). It is NOT "more substituted": for propylene oxide + HBr the halide ends up
 * on the primary carbon (LibreTexts, Wade 15.08 and Nassau 8.14: "when both the epoxide carbons are either primary or secondary the
 * halogen anion will attack the less substituted carbon").
 */
/**
 * "cation-stabilized-else-less-substituted" generalises the hydrogen halide rule beyond tertiary carbons: the halide attacks the epoxide
 * carbon that better carries positive charge in the SN1-like transition state (tertiary, benzylic or allylic) when exactly one of the two
 * does, the less substituted carbon when neither does, and both regioisomers are kept when both do (no basis to choose). Styrene oxide + HBr
 * therefore opens at the benzylic carbon, not at CH2.
 */
const CATION_STABILIZED = "cation-stabilized-else-less-substituted";
/**
 * Acid-catalysed opening by an alcohol: a carbon that stabilizes positive charge (tertiary, benzylic, allylic) is attacked when exactly one does;
 * when neither does (primary/secondary epoxides, for example propylene oxide) the opening has mixed SN1/SN2 character and BOTH regioisomers are
 * kept and left unranked rather than reporting one as the product (Parker and Isaacs, Chem. Rev. 1959, 59, 737; Clayden, Greeves and Warren ch. 20;
 * not re-read in this stage).
 */
const CATION_STABILIZED_ELSE_BOTH = "cation-stabilized-else-both";
type AttackPreference =
  | "more-substituted"
  | "less-substituted"
  | "tertiary-else-less-substituted"
  | typeof CATION_STABILIZED
  | typeof CATION_STABILIZED_ELSE_BOTH;
type Halogen = "Cl" | "Br" | "I";

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}


function intramolecularWilliamsonSmarts(ringSize: number): string | null {
  // A cyclic ether of ring size N contains one oxygen plus N-1 tether carbons.
  // Restrict the electrophilic terminus to CH2-X so the closure is a clean
  // intramolecular SN2 rather than a forced substitution at a hindered center.
  if (!Number.isInteger(ringSize) || ringSize < 3 || ringSize > 7) return null;

  const carbonMaps = Array.from(
    { length: ringSize - 1 },
    (_, index) => index + 2,
  );
  const reactantCarbons = carbonMaps
    .map((map, index) =>
      index === carbonMaps.length - 1
        ? `[CH2:${map}][Cl,Br,I]`
        : `[CH2:${map}]`,
    )
    .join("-");
  const productCarbons = carbonMaps
    .map((map) => `[CH2:${map}]`)
    .join("");

  return `[O;H1:1]-${reactantCarbons}>>[O:1]1${productCarbons}1`;
}

async function intramolecularWilliamson(
  reactantSmiles: string,
  ringSize: number,
  maxProducts: number,
): Promise<string[]> {
  const smarts = intramolecularWilliamsonSmarts(ringSize);
  if (!smarts) return [];
  return unique(await runReactionSmarts(reactantSmiles, smarts, maxProducts));
}

type NucleophileTemplate = {
  reactantSuffix: string;
  attachedGroup: string;
  /**
   * The same group written as a chain whose LAST atom is the one that bonds to the attacked carbon, so a stereo
   * template can list the incoming nucleophile in the slot the epoxide oxygen occupied.
   */
  attachedChain: string;
};

function nucleophileTemplate(
  nucleophile: EpoxideNucleophile,
  halogen?: Halogen,
): NucleophileTemplate | null {
  if (nucleophile === "water" || nucleophile === "hydroxide") {
    return { reactantSuffix: "", attachedGroup: "[OH]", attachedChain: "[OH]" };
  }
  if (nucleophile === "alcohol") {
    return {
      reactantSuffix: ".[O;H1:4][#6:5]",
      attachedGroup: "[O:4][#6:5]",
      attachedChain: "[#6:5][O:4]",
    };
  }
  if (nucleophile === "alkoxide") {
    return {
      reactantSuffix: ".[O-:4][#6:5]",
      attachedGroup: "[O+0:4][#6:5]",
      attachedChain: "[#6:5][O+0:4]",
    };
  }
  if (nucleophile === "amine") {
    return {
      reactantSuffix: ".[N;H1,H2;+0:4]",
      attachedGroup: "[N:4]",
      attachedChain: "[N:4]",
    };
  }
  if (nucleophile === "ammonia") {
    return { reactantSuffix: "", attachedGroup: "[NH2]", attachedChain: "[NH2]" };
  }
  if (nucleophile === "organometallic") {
    return {
      // Any carbon (alkyl, aryl, vinyl, alkynyl) bonded to the metal can attack; [C:4] excluded aromatic carbons.
      reactantSuffix: ".[#6:4][Mg,Li]",
      attachedGroup: "[#6:4]",
      attachedChain: "[#6:4]",
    };
  }
  if (nucleophile === "halide" && halogen) {
    return { reactantSuffix: "", attachedGroup: `[${halogen}]`, attachedChain: `[${halogen}]` };
  }
  return null;
}

/**
 * Build epoxide-opening SMARTS in chemically ranked order.  Hydrogen counts
 * are used only to compare the two carbons of the SAME epoxide: fewer H means
 * more substituted. Equal-substitution cases remain as genuine alternatives.
 *
 * Ring opening is backside (SN2-like), so the attacked carbon is INVERTED. A plain template makes RDKit
 * carry the reactant's chirality tag through unchanged, i.e. retention: trans-2,3-epoxybutane then opened
 * to the (R,R) diol instead of the meso diol. Where the attacked carbon can be a stereocentre (one or no
 * hydrogens) the template lists the nucleophile in the slot the oxygen occupied and flips the chirality
 * symbol, which RDKit applies as inversion of whatever the reactant has; an unspecified reactant stays
 * unspecified. The other carbon keeps its configuration (its C-O bond is not broken).
 */
function epoxideOpeningSmarts(
  preference: AttackPreference,
  nucleophile: EpoxideNucleophile,
  halogen?: Halogen,
  fusedRing = false,
): string[] {
  const template = nucleophileTemplate(nucleophile, halogen);
  if (!template) return [];

  const { reactantSuffix, attachedGroup, attachedChain } = template;
  const sites: Array<{ attackedH: 0 | 1 | 2; otherH: 0 | 1 | 2 }> = [];
  for (const [moreH, lessH] of [[0, 1], [0, 2], [1, 2]] as const) {
    // moreH is the hydrogen count of the more substituted carbon (fewer hydrogens).
    const attacksMoreSubstituted =
      preference === "more-substituted" || (preference === "tertiary-else-less-substituted" && moreH === 0);
    sites.push(attacksMoreSubstituted
      ? { attackedH: moreH, otherH: lessH }
      : { attackedH: lessH, otherH: moreH });
  }
  for (const hydrogenCount of [0, 1, 2] as const) sites.push({ attackedH: hydrogenCount, otherH: hydrogenCount });

  return sites.flatMap(({ attackedH, otherH }) => {
    const other = `[C;H${otherH}:3]`;
    if (fusedRing && attackedH === 1 && otherH === 1) {
      // Cis-fused epoxide drawn without stereo, anti opening: the two new centres are trans (racemic pair). Both
      // carbons are secondary, so each has exactly one other heavy neighbour, which is a ring atom. Neighbour
      // orders (ring, H, O, C) and (C, H, X, ring) with parity (@,@@) or (@@,@) are the trans pair; the other two
      // combinations are cis. The parities were checked on trans-cyclohexane-1,2-diol, (R,R)/(S,S).
      return ([["@", "@@"], ["@@", "@"]] as const).map(
        ([oxygenSide, attackedSide]) =>
          `[O:1]1[C;H1:2]([*:6])[C;H1:3]1[*:5]${reactantSuffix}>>[*:5][C${oxygenSide}H:3]([OH:1])[C${attackedSide}H:2](${attachedGroup})[*:6]`,
      );
    }
    if (attackedH === 1) {
      return [`[O:1]1[C@H:2]([*:7])${other}1${reactantSuffix}>>${attachedChain}[C@@H:2]([*:7])[C:3][OH:1]`];
    }
    if (attackedH === 0) {
      return [`[O:1]1[C@:2]([*:7])([*:8])${other}1${reactantSuffix}>>${attachedChain}[C@@:2]([*:7])([*:8])[C:3][OH:1]`];
    }
    // CH2 attacked: not a stereocentre, nothing to invert.
    return [`[O:1]1[C;H2:2]${other}1${reactantSuffix}>>[OH:1][C:3][C:2](${attachedGroup})`];
  });
}

/** Cyclopentene, cyclohexene and cycloheptene oxides: the epoxide is necessarily cis-fused to the carbocycle. */
const FUSED_EPOXIDE_SMARTS = ["O1C2C1*~*~*2", "O1C2C1*~*~*~*2", "O1C2C1*~*~*~*~*2"];

/**
 * True for a single-component epoxide whose only other ring is a 5-7 membered one containing both epoxide
 * carbons, drawn without any stereochemistry. A larger ring can hold a trans epoxide, and a polycyclic
 * skeleton (norbornene oxide, epoxytetralin) has face constraints this model does not capture, so those are not
 * completed. Ring count = bonds - atoms + 1 for a connected structure.
 */
async function isUnspecifiedFusedRingEpoxide(smiles: string): Promise<boolean> {
  if (smiles.includes("@") || smiles.includes(".")) return false;
  const rdkit = await getRDKit();
  const mol = rdkit.get_mol(smiles);
  if (!mol) return false;
  try {
    const block = mol.get_molblock?.() ?? "";
    const counts = block.split(String.fromCharCode(10))[3] ?? "";
    const atoms = Number.parseInt(counts.slice(0, 3).trim(), 10);
    const bonds = Number.parseInt(counts.slice(3, 6).trim(), 10);
    if (!Number.isInteger(atoms) || !Number.isInteger(bonds) || bonds - atoms + 1 !== 2) return false;
    for (const smarts of FUSED_EPOXIDE_SMARTS) {
      const query = rdkit.get_qmol(smarts);
      try {
        const match = query ? mol.get_substruct_match(query) : "{}";
        if (match && match !== "{}") return true;
      } finally {
        query?.delete?.();
      }
    }
    return false;
  } finally {
    mol.delete?.();
  }
}

/**
 * Chooses between the regioisomeric halohydrins from the product alone. In X-C1-C2-OH the halide attacked C1. C1 is "cation stabilized"
 * when it carries no hydrogen (tertiary) or is bonded to an aromatic atom or a C=C (benzylic, allylic). Products are kept when
 * C1 is stabilized and C2 is not, when neither is stabilized and C1 is at least as unsubstituted as C2, or when both are stabilized.
 * A product whose halohydrin pattern is not unique (two epoxides opened, say) is kept unchanged.
 */
async function keepCationStabilizedAttack(products: string[], keepBothWhenNeitherStabilized = false, attacker = "[Cl,Br,I]"): Promise<string[]> {
  const rdkit = await getRDKit();
  const queries = {
    pattern: rdkit.get_qmol(`[C:1](${attacker})[C:2][OX2H]`),
    stabilized: rdkit.get_qmol("[C;H0,$(C-a),$(C-[#6]=[#6])]"),
    h0: rdkit.get_qmol("[C;H0]"),
    h1: rdkit.get_qmol("[C;H1]"),
  };
  const atomsOf = (mol: { get_substruct_matches: (query: unknown) => string }, query: unknown): Set<number> => {
    const parsed = JSON.parse(mol.get_substruct_matches(query));
    const list = Array.isArray(parsed) ? parsed : parsed?.atoms ? [parsed] : [];
    return new Set(list.flatMap((match: { atoms: number[] }) => match.atoms));
  };
  try {
    const kept: string[] = [];
    for (const product of products) {
      const mol = rdkit.get_mol(product);
      if (!mol) { kept.push(product); continue; }
      try {
        const parsed = JSON.parse(mol.get_substruct_matches(queries.pattern));
        const matches: Array<{ atoms: number[] }> = Array.isArray(parsed) ? parsed : parsed?.atoms ? [parsed] : [];
        if (matches.length !== 1) { kept.push(product); continue; }
        // Query atom order: C1, attacker atom(s), C2, OH. The alcohol attacker is two atoms (O and its carbon), the halide one.
        const halo = matches[0].atoms[0];
        const other = matches[0].atoms[attacker === "[Cl,Br,I]" ? 2 : 3];
        const stabilized = atomsOf(mol, queries.stabilized);
        const h0 = atomsOf(mol, queries.h0);
        const h1 = atomsOf(mol, queries.h1);
        const hydrogens = (atom: number) => (h0.has(atom) ? 0 : h1.has(atom) ? 1 : 2);
        const haloStable = stabilized.has(halo);
        const otherStable = stabilized.has(other);
        const keep =
          haloStable !== otherStable
            ? haloStable
            : haloStable || keepBothWhenNeitherStabilized
              ? true
              : hydrogens(halo) >= hydrogens(other);
        if (keep) kept.push(product);
      } finally {
        mol.delete?.();
      }
    }
    return kept;
  } finally {
    for (const query of Object.values(queries)) query?.delete?.();
  }
}

async function runRankedEpoxideOpening(
  reactants: string[],
  preference: AttackPreference,
  nucleophile: EpoxideNucleophile,
  halogen?: Halogen,
): Promise<string[]> {
  let products: string[] = [];
  const fusedRing = await isUnspecifiedFusedRingEpoxide(reactants[0]);
  // The cation-stabilization rule needs both regioisomers; the choice is made afterwards from the product structure.
  const orientations: AttackPreference[] =
    preference === CATION_STABILIZED || preference === CATION_STABILIZED_ELSE_BOTH ? ["more-substituted", "less-substituted"] : [preference];
  for (const orientation of orientations) {
    for (const smarts of epoxideOpeningSmarts(orientation, nucleophile, halogen, fusedRing)) {
      products.push(...await runReactionSmarts(reactants, smarts, 16));
    }
  }
  if (preference === CATION_STABILIZED) products = await keepCationStabilizedAttack(unique(products));
  if (preference === CATION_STABILIZED_ELSE_BOTH) products = await keepCationStabilizedAttack(unique(products), true, "[OX2;H0]([#6])");
  // Both attack sites of a symmetric epoxide give the same compound written differently: keep one of each structure.
  const byStructure = new Map<string, string>();
  for (const product of unique(products)) {
    const key = (await canonicalizeStereoStructure(product))?.isomeric ?? product;
    if (!byStructure.has(key)) byStructure.set(key, product);
  }
  return [...byStructure.values()];
}

export async function epoxideOrganometallicOpening(
  epoxideSmiles: string,
  organometallicSmiles: string,
): Promise<string[]> {
  return runRankedEpoxideOpening(
    [epoxideSmiles, organometallicSmiles],
    "less-substituted",
    "organometallic",
  );
}

export async function ring(
  reactantInput: string | string[],
  options?: Record<string, unknown>,
): Promise<string[]> {
  const reactants = Array.isArray(reactantInput)
    ? reactantInput.filter(Boolean)
    : [reactantInput];
  const primary = reactants[0];
  if (!primary) return [];

  const mode = options?.mode as RingMode | undefined;

  if (mode === "intramolecularWilliamson") {
    const ringSize = Number(options?.ringSize ?? 5);
    const maxProducts = Number(options?.maxProducts ?? 8);
    return intramolecularWilliamson(primary, ringSize, maxProducts);
  }

  if (mode === "epoxideOrganometallicOpening") {
    const organometallic = reactants[1];
    if (!organometallic) return [];
    return epoxideOrganometallicOpening(primary, organometallic);
  }

  if (mode === "epoxideNucleophileOpening") {
    const nucleophile = options?.nucleophile as EpoxideNucleophile | undefined;
    const preference = options?.attackPreference as AttackPreference | undefined;
    const halogen = options?.halogen as Halogen | undefined;
    if (!nucleophile || !preference) {
      console.warn("Epoxide nucleophile opening requires nucleophile and attackPreference.", options);
      return [];
    }
    return runRankedEpoxideOpening(reactants, preference, nucleophile, halogen);
  }

  if (mode !== "epoxideOpening") {
    console.warn("Ring handler missing or unsupported mode:", options);
    return [];
  }

  const nucleophile =
    (options?.nucleophile as EpoxideNucleophile | undefined) ?? "water";
  const preference =
    (options?.attackPreference as AttackPreference | undefined) ??
    (nucleophile === "water" ? "more-substituted" : "less-substituted");

  return runRankedEpoxideOpening([primary], preference, nucleophile);
}
