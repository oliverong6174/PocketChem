import { getRDKit } from "../../../rdkit";
import { runReactionSmarts } from "../rdkitReaction";

type OxidationMode =
  | "alcoholOxidation"
  | "aldehydeOxidation"
  | "alkeneOxidativeCleavage"
  | "alkyneOxidativeCleavage"
  | "vicinalDiolCleavage"
  | "baeyerVilliger";
type OxidationLevel = "mild" | "strong";
type AlcoholType = "primary" | "secondary" | "tertiary" | "unknown";

async function hasSubstructure(rdkit: any, smiles: string, smarts: string) {
  const molecule = rdkit.get_mol(smiles);
  const query = rdkit.get_qmol(smarts);

  try {
    return Boolean(
      molecule && query && molecule.get_substruct_match(query) !== "{}"
    );
  } finally {
    molecule?.delete?.();
    query?.delete?.();
  }
}

async function runUniqueReactionSet(
  reactantSmiles: string,
  reactionSmarts: string[]
): Promise<string[]> {
  const products = new Set<string>();

  for (const smarts of reactionSmarts) {
    for (const product of await runReactionSmarts(reactantSmiles, smarts)) {
      products.add(product);
    }
  }

  return [...products];
}

/**
 * Periodate cleavage of a cyclic vicinal diol must OPEN the ring and leave the
 * two new carbonyls in the same molecule. A naive two-product SMARTS clones
 * the untouched ring path into both product templates, so cyclic substrates
 * need explicit ring-path templates instead.
 */
const PERIODATE_CYCLIC_CLEAVAGE_SMARTS = [
  "[C;R:1]1([OH:2])-[C;R:3]([OH:4])-[C;R:5]-1>>[C:1](=[O:2])-[C:5]-[C:3](=[O:4])",
  "[C;R:1]1([OH:2])-[C;R:3]([OH:4])-[C;R:5]-[C;R:6]-1>>[C:1](=[O:2])-[C:6]-[C:5]-[C:3](=[O:4])",
  "[C;R:1]1([OH:2])-[C;R:3]([OH:4])-[C;R:5]-[C;R:6]-[C;R:7]-1>>[C:1](=[O:2])-[C:7]-[C:6]-[C:5]-[C:3](=[O:4])",
  "[C;R:1]1([OH:2])-[C;R:3]([OH:4])-[C;R:5]-[C;R:6]-[C;R:7]-[C;R:8]-1>>[C:1](=[O:2])-[C:8]-[C:7]-[C:6]-[C:5]-[C:3](=[O:4])",
  "[C;R:1]1([OH:2])-[C;R:3]([OH:4])-[C;R:5]-[C;R:6]-[C;R:7]-[C;R:8]-[C;R:9]-1>>[C:1](=[O:2])-[C:9]-[C:8]-[C:7]-[C:6]-[C:5]-[C:3](=[O:4])",
  "[C;R:1]1([OH:2])-[C;R:3]([OH:4])-[C;R:5]-[C;R:6]-[C;R:7]-[C;R:8]-[C;R:9]-[C;R:10]-1>>[C:1](=[O:2])-[C:10]-[C:9]-[C:8]-[C:7]-[C:6]-[C:5]-[C:3](=[O:4])",
];

const PERIODATE_ACYCLIC_CLEAVAGE_SMARTS =
  "[C;X4:1]([OH:2])-[C;X4:3]([OH:4])>>[C:1](=[O:2]).[C:3](=[O:4])";

async function vicinalDiolCleavage(reactantSmiles: string): Promise<string[]> {
  // Try ring-opening templates first. The first ring size that matches is the
  // chemically relevant cycle containing the vicinal diol bond.
  for (const smarts of PERIODATE_CYCLIC_CLEAVAGE_SMARTS) {
    const cyclicProducts = await runReactionSmarts(reactantSmiles, smarts, 8);
    if (cyclicProducts.length > 0) {
      return [...new Set(cyclicProducts)];
    }
  }

  // Acyclic vicinal diols cleave into two carbonyl fragments. This fallback
  // also handles cases where the C-C bond is not part of a simple 3-8 membered
  // carbocycle.
  return [...new Set(
    await runReactionSmarts(
      reactantSmiles,
      PERIODATE_ACYCLIC_CLEAVAGE_SMARTS,
      8,
    ),
  )];
}


/**
 * Baeyer-Villiger oxidation is regioselective: oxygen is inserted next to the
 * group with the greater migratory aptitude.  Do not show both formal atom-map
 * orientations merely because an unsymmetrical ketone can be matched in two
 * directions.  We try the textbook aptitude tiers in order and stop at the
 * first tier that actually matches. Equal-aptitude groups remain as a genuine
 * tie and are deduplicated canonically by the reaction engine.
 *
 * Ketone-side aptitude used here (O-Chem level):
 *   tertiary alkyl > secondary alkyl ~ aryl > primary alkyl > methyl
 * Aldehydes are handled by the aldehyde oxidation chemistry rather than this
 * ketone rule, so hydride migration is intentionally outside this handler.
 */
async function baeyerVilligerOxidation(reactantSmiles: string): Promise<string[]> {
  const tiers: string[][] = [
    [
      // Tertiary alkyl migration.
      "[C:1](=[O:2])([C;H0:3])[C:4]>>[C:1](=[O:2])([C:4])O[C:3]",
    ],
    [
      // Secondary alkyl and aryl groups are comparable at the level needed
      // for introductory selectivity. Keep a real tie if both are present.
      "[C:1](=[O:2])([C;H1:3])[C:4]>>[C:1](=[O:2])([C:4])O[C:3]",
      "[C:1](=[O:2])([c:3])[C,c:4]>>[C:1](=[O:2])([C,c:4])O[c:3]",
    ],
    [
      // Primary alkyl migration.
      "[C:1](=[O:2])([C;H2:3])[C:4]>>[C:1](=[O:2])([C:4])O[C:3]",
    ],
    [
      // Methyl is the least favored common ketone substituent.
      "[C:1](=[O:2])([C;H3:3])[C:4]>>[C:1](=[O:2])([C:4])O[C:3]",
    ],
  ];

  for (const tier of tiers) {
    const products = await runUniqueReactionSet(reactantSmiles, tier);
    if (products.length > 0) return products;
  }

  // Conservative fallback for unusual ketones not classified by the simple
  // aptitude tiers above. This preserves support without pretending a ranking.
  return runReactionSmarts(
    reactantSmiles,
    "[C:1](=[O:2])([C:3])[C:4]>>[C:1](=[O:2])([C:4])O[C:3]",
    8,
  );
}

async function classifyAlcohol(
  rdkit: any,
  smiles: string
): Promise<AlcoholType> {
  if (await hasSubstructure(rdkit, smiles, "[CH2][OH]")) {
    return "primary";
  }

  if (await hasSubstructure(rdkit, smiles, "[CH]([#6])([#6])[OH]")) {
    return "secondary";
  }

  if (await hasSubstructure(rdkit, smiles, "[C;H0]([#6])([#6])([#6])[OH]")) {
    return "tertiary";
  }

  return "unknown";
}

export async function oxidation(
  reactantSmiles: string,
  options?: Record<string, unknown>
): Promise<string[]> {
  const mode = options?.mode as OxidationMode | undefined;
  const level = (options?.level as OxidationLevel | undefined) ?? "mild";

  if (mode === "aldehydeOxidation") {
    return runReactionSmarts(
      reactantSmiles,
      "[C;H1,H2:1]=[O:2]>>[C:1](=[O:2])O"
    );
  }

  if (mode === "vicinalDiolCleavage") {
    return vicinalDiolCleavage(reactantSmiles);
  }

  if (mode === "baeyerVilliger") {
    return baeyerVilligerOxidation(reactantSmiles);
  }

  if (mode === "alkeneOxidativeCleavage") {
    return runUniqueReactionSet(reactantSmiles, [
      // Alkene carbon with one H -> carboxylic acid.
      "[C;H1:1]=[C;H1:2]>>[C:1](=O)O.[C:2](=O)O",
      // Alkene carbon with no H -> ketone.
      "[C;H0:1]=[C;H1:2]>>[C:1]=O.[C:2](=O)O",
      "[C;H1:1]=[C;H0:2]>>[C:1](=O)O.[C:2]=O",
      "[C;H0:1]=[C;H0:2]>>[C:1]=O.[C:2]=O",
      // Terminal =CH2 carbon -> CO2 under vigorous permanganate oxidation.
      "[CH2:1]=[C;H1:2]>>[C:1](=O)=O.[C:2](=O)O",
      "[C;H1:1]=[CH2:2]>>[C:1](=O)O.[C:2](=O)=O",
      "[CH2:1]=[C;H0:2]>>[C:1](=O)=O.[C:2]=O",
      "[C;H0:1]=[CH2:2]>>[C:1]=O.[C:2](=O)=O",
    ]);
  }

  if (mode === "alkyneOxidativeCleavage") {
    return runUniqueReactionSet(reactantSmiles, [
      // Internal alkyne -> two carboxylic-acid fragments.
      "[C;H0:1]#[C;H0:2]>>[C:1](=O)O.[C:2](=O)O",
      // Terminal alkyne carbon -> CO2; substituted carbon -> carboxylic acid.
      "[CH:1]#[C;H0:2]>>[C:1](=O)=O.[C:2](=O)O",
      "[C;H0:1]#[CH:2]>>[C:1](=O)O.[C:2](=O)=O",
    ]);
  }

  if (mode !== "alcoholOxidation") {
    console.warn("Oxidation handler missing or unsupported mode:", options);
    return [];
  }

  const rdkit = await getRDKit();
  const alcoholType = await classifyAlcohol(rdkit, reactantSmiles);

  if (alcoholType === "primary") {
    return runReactionSmarts(
      reactantSmiles,
      level === "strong"
        ? "[C:1][CH2:2][OH:3]>>[C:1][C:2](=O)O"
        : "[C:1][CH2:2][OH:3]>>[C:1][CH:2]=[O:3]"
    );
  }

  if (alcoholType === "secondary") {
    // Only the reacting secondary C-OH site changes. All spectator atoms,
    // including a separate tertiary alcohol stereocenter, stay atom-mapped and
    // therefore retain their original absolute configuration.
    return runReactionSmarts(
      reactantSmiles,
      "[C:1][CH:2]([OH:3])[C:4]>>[C:1][C:2](=[O:3])[C:4]"
    );
  }

  return [];
}
