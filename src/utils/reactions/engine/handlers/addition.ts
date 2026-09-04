import { getRDKit } from "../../../rdkit";
import { runReactionSmarts } from "../rdkitReaction";
import { classifyCarbonyl } from "./carbonylUtils";

export type OneTwoAdditionNucleophile = "water" | "cyanide";
export type AlkeneAdditionRegioselectivity =
  | "markovnikov"
  | "anti-markovnikov";
export type HydrohalogenationHalogen = "Cl" | "Br" | "I";

type AdditionMode =
  | "oneTwoAddition"
  | "alkeneHydration"
  | "alkeneHydrohalogenation"
  | "halohydrin"
  | "haloether"
  | "alkoxymercuration"
  | "synDihydroxylation"
  | "antiDihydroxylation";

/**
 * Regioselective alkene hydration templates.
 *
 * A generic `[C:1]=[C:2]` reaction can match an unsymmetrical alkene in either
 * atom-map direction. These templates constrain the alkene carbons by hydrogen
 * count so PocketChem actually puts OH on the intended carbon rather than only
 * labeling the result Markovnikov/anti-Markovnikov after the fact.
 */
export function alkeneHydrationReactionSmarts(
  regioselectivity: AlkeneAdditionRegioselectivity,
): string[] {
  const hydroxylOnMoreSubstituted = regioselectivity === "markovnikov";

  const unequal = hydroxylOnMoreSubstituted
    ? [
        "[C;H0:1]=[C;H1,H2:2]>>[C:1]([OH])[C:2]",
        "[C;H1:1]=[C;H2:2]>>[C:1]([OH])[C:2]",
      ]
    : [
        "[C;H0:1]=[C;H1,H2:2]>>[C:1][C:2]([OH])",
        "[C;H1:1]=[C;H2:2]>>[C:1][C:2]([OH])",
      ];

  return [...unequal, ...equalSubstitutionHydrationTemplates()];
}

function equalSubstitutionHydrationTemplates(): string[] {
  const equal: string[] = [];
  for (const hydrogenCount of [0, 1, 2]) {
    equal.push(
      `[C;H${hydrogenCount}:1]=[C;H${hydrogenCount}:2]>>[C:1]([OH])[C:2]`,
      `[C;H${hydrogenCount}:1]=[C;H${hydrogenCount}:2]>>[C:1][C:2]([OH])`,
    );
  }
  return equal;
}

/**
 * Hydrohalogenation uses the same substitution-level logic as hydration, but
 * places X instead of OH. This matters because the old symmetric reaction
 * SMARTS could claim "Markovnikov" while producing either constitutional
 * orientation on an unsymmetrical alkene.
 */
export function alkeneHydrohalogenationReactionSmarts(
  regioselectivity: AlkeneAdditionRegioselectivity,
  halogen: HydrohalogenationHalogen,
): string[] {
  const halogenOnMoreSubstituted = regioselectivity === "markovnikov";
  const unequal = halogenOnMoreSubstituted
    ? [
        `[C;H0:1]=[C;H1,H2:2]>>[C:1]([${halogen}])[C:2]`,
        `[C;H1:1]=[C;H2:2]>>[C:1]([${halogen}])[C:2]`,
      ]
    : [
        `[C;H0:1]=[C;H1,H2:2]>>[C:1][C:2]([${halogen}])`,
        `[C;H1:1]=[C;H2:2]>>[C:1][C:2]([${halogen}])`,
      ];

  const equal: string[] = [];
  for (const hydrogenCount of [0, 1, 2]) {
    equal.push(
      `[C;H${hydrogenCount}:1]=[C;H${hydrogenCount}:2]>>[C:1]([${halogen}])[C:2]`,
      `[C;H${hydrogenCount}:1]=[C;H${hydrogenCount}:2]>>[C:1][C:2]([${halogen}])`,
    );
  }

  return [...unequal, ...equal];
}


/**
 * Halohydrin formation via halonium-ion opening. For an unsymmetrical alkene,
 * water attacks the more substituted carbon of the bridged halonium ion, so
 * OH is placed on the more substituted carbon and X on the less substituted
 * carbon. Equal-substitution cases keep both constitutional orientations.
 */
export function alkeneHalohydrinReactionSmarts(
  halogen: HydrohalogenationHalogen,
): string[] {
  const unequal = [
    `[C;H0:1]=[C;H1,H2:2]>>[C:1]([OH])[C:2]([${halogen}])`,
    `[C;H1:1]=[C;H2:2]>>[C:1]([OH])[C:2]([${halogen}])`,
  ];

  const equal: string[] = [];
  for (const hydrogenCount of [0, 1, 2]) {
    equal.push(
      `[C;H${hydrogenCount}:1]=[C;H${hydrogenCount}:2]>>[C:1]([OH])[C:2]([${halogen}])`,
      `[C;H${hydrogenCount}:1]=[C;H${hydrogenCount}:2]>>[C:1]([${halogen}])[C:2]([OH])`,
    );
  }

  return [...unequal, ...equal];
}

/**
 * Haloether (haloalkoxylation) formation. An alcohol opens the halonium ion,
 * carrying its actual R group into the product. OR is placed on the more
 * substituted alkene carbon and X on the less substituted carbon.
 */
export function alkeneHaloetherReactionSmarts(
  halogen: HydrohalogenationHalogen,
): string[] {
  const alcohol = ".[O;H1:3][C;X4:4]";
  const alkoxy = "[O:3][C:4]";
  const unequal = [
    `[C;H0:1]=[C;H1,H2:2]${alcohol}>>[C:1](${alkoxy})[C:2]([${halogen}])`,
    `[C;H1:1]=[C;H2:2]${alcohol}>>[C:1](${alkoxy})[C:2]([${halogen}])`,
  ];

  const equal: string[] = [];
  for (const hydrogenCount of [0, 1, 2]) {
    equal.push(
      `[C;H${hydrogenCount}:1]=[C;H${hydrogenCount}:2]${alcohol}>>[C:1](${alkoxy})[C:2]([${halogen}])`,
      `[C;H${hydrogenCount}:1]=[C;H${hydrogenCount}:2]${alcohol}>>[C:1]([${halogen}])[C:2](${alkoxy})`,
    );
  }

  return [...unequal, ...equal];
}

/**
 * Alkoxymercuration-demercuration attaches the oxygen of a supplied alcohol
 * to the more substituted alkene carbon. The mapped carbon attached to that
 * oxygen carries the rest of the alcohol's R group through the reaction, so
 * methanol, ethanol, etc. generate the corresponding ether rather than a
 * hard-coded methoxy product.
 */
export function alkoxymercurationReactionSmarts(): string[] {
  const alcohol = ".[O;H1:3][C;X4:4]";
  const productOnMoreSubstituted = "[O:3][C:4]";
  const unequal = [
    `[C;H0:1]=[C;H1,H2:2]${alcohol}>>[C:1](${productOnMoreSubstituted})[C:2]`,
    `[C;H1:1]=[C;H2:2]${alcohol}>>[C:1](${productOnMoreSubstituted})[C:2]`,
  ];

  const equal: string[] = [];
  for (const hydrogenCount of [0, 1, 2]) {
    equal.push(
      `[C;H${hydrogenCount}:1]=[C;H${hydrogenCount}:2]${alcohol}>>[C:1](${productOnMoreSubstituted})[C:2]`,
      `[C;H${hydrogenCount}:1]=[C;H${hydrogenCount}:2]${alcohol}>>[C:1][C:2](${productOnMoreSubstituted})`,
    );
  }

  return [...unequal, ...equal];
}

export async function addition(
  reactants: string | string[],
  options?: Record<string, unknown>,
): Promise<string[]> {
  const reactantList = Array.isArray(reactants) ? reactants : [reactants];
  const primary = reactantList[0];
  if (!primary) return [];

  const mode = options?.mode as AdditionMode | undefined;

  if (mode === "oneTwoAddition") {
    return oneTwoAddition(primary, options);
  }

  if (mode === "alkeneHydration") {
    return alkeneHydration(primary, options);
  }

  if (mode === "alkeneHydrohalogenation") {
    return alkeneHydrohalogenation(primary, options);
  }

  if (mode === "halohydrin") {
    return alkeneHalohydrin(primary, options);
  }

  if (mode === "haloether") {
    return alkeneHaloether(reactantList, options);
  }

  if (mode === "alkoxymercuration") {
    return alkoxymercuration(reactantList);
  }

  if (mode === "synDihydroxylation") {
    return synDihydroxylation(primary);
  }

  if (mode === "antiDihydroxylation") {
    return antiDihydroxylation(primary);
  }

  console.warn("Addition handler missing or unsupported mode:", options);
  return [];
}

async function alkeneHydration(
  reactantSmiles: string,
  options?: Record<string, unknown>,
): Promise<string[]> {
  const requested = options?.regioselectivity;
  const regioselectivity: AlkeneAdditionRegioselectivity | null =
    requested === "markovnikov" || requested === "anti-markovnikov"
      ? requested
      : null;

  if (!regioselectivity) {
    console.warn(
      "Addition alkeneHydration requires markovnikov or anti-markovnikov regioselectivity.",
      options,
    );
    return [];
  }

  const products = new Set<string>();
  for (const smarts of alkeneHydrationReactionSmarts(regioselectivity)) {
    for (const product of await runReactionSmarts(reactantSmiles, smarts, 8)) {
      products.add(product);
    }
  }

  return [...products];
}

async function alkeneHydrohalogenation(
  reactantSmiles: string,
  options?: Record<string, unknown>,
): Promise<string[]> {
  const requestedRegioselectivity = options?.regioselectivity;
  const regioselectivity: AlkeneAdditionRegioselectivity | null =
    requestedRegioselectivity === "markovnikov" ||
    requestedRegioselectivity === "anti-markovnikov"
      ? requestedRegioselectivity
      : null;
  const requestedHalogen = options?.halogen;
  const halogen: HydrohalogenationHalogen | null =
    requestedHalogen === "Cl" || requestedHalogen === "Br" || requestedHalogen === "I"
      ? requestedHalogen
      : null;

  if (!regioselectivity || !halogen) {
    console.warn(
      "Addition alkeneHydrohalogenation requires a regioselectivity and Cl, Br, or I.",
      options,
    );
    return [];
  }

  const products = new Set<string>();
  for (const smarts of alkeneHydrohalogenationReactionSmarts(
    regioselectivity,
    halogen,
  )) {
    for (const product of await runReactionSmarts(reactantSmiles, smarts, 8)) {
      products.add(product);
    }
  }

  return [...products];
}

async function alkeneHalohydrin(
  reactantSmiles: string,
  options?: Record<string, unknown>,
): Promise<string[]> {
  const requestedHalogen = options?.halogen;
  const halogen: HydrohalogenationHalogen | null =
    requestedHalogen === "Cl" || requestedHalogen === "Br" || requestedHalogen === "I"
      ? requestedHalogen
      : null;

  if (!halogen) {
    console.warn("Addition halohydrin requires Cl, Br, or I.", options);
    return [];
  }

  const products = new Set<string>();
  for (const smarts of alkeneHalohydrinReactionSmarts(halogen)) {
    for (const product of await runReactionSmarts(reactantSmiles, smarts, 8)) {
      products.add(product);
    }
  }

  return [...products];
}

async function alkeneHaloether(
  reactants: string[],
  options?: Record<string, unknown>,
): Promise<string[]> {
  if (reactants.length < 2) return [];

  const requestedHalogen = options?.halogen;
  const halogen: HydrohalogenationHalogen | null =
    requestedHalogen === "Cl" || requestedHalogen === "Br" || requestedHalogen === "I"
      ? requestedHalogen
      : null;

  if (!halogen) {
    console.warn("Addition haloether requires Cl, Br, or I.", options);
    return [];
  }

  const [alkene, alcohol] = reactants;
  const products = new Set<string>();
  for (const smarts of alkeneHaloetherReactionSmarts(halogen)) {
    for (const product of await runReactionSmarts([alkene, alcohol], smarts, 8)) {
      products.add(product);
    }
  }

  return [...products];
}

async function alkoxymercuration(reactants: string[]): Promise<string[]> {
  if (reactants.length < 2) return [];
  const [alkene, alcohol] = reactants;
  const products = new Set<string>();

  for (const smarts of alkoxymercurationReactionSmarts()) {
    for (const product of await runReactionSmarts([alkene, alcohol], smarts, 8)) {
      products.add(product);
    }
  }

  return [...products];
}

async function alkeneGeometry(smiles: string): Promise<"E" | "Z" | null> {
  const rdkit = await getRDKit();
  const mol = rdkit.get_mol(smiles);
  if (!mol) return null;

  try {
    const raw = mol.get_stereo_tags?.();
    if (typeof raw !== "string" || !raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const cipBonds = parsed.CIP_bonds;
    if (!Array.isArray(cipBonds) || cipBonds.length !== 1) return null;

    const entry = cipBonds[0];
    if (!Array.isArray(entry) || entry.length < 3) return null;
    const descriptor = String(entry[2]).replace(/[()]/g, "");
    return descriptor === "E" || descriptor === "Z" ? descriptor : null;
  } catch {
    return null;
  } finally {
    mol.delete?.();
  }
}

/**
 * Explicitly stereospecific syn dihydroxylation for an alkene whose E/Z
 * geometry is defined. For the common H1=H1 case, E alkenes give the
 * enantiomeric R,R/S,S pair while Z alkenes give the corresponding meso
 * relationship. If the alkene geometry is unspecified (or the substitution
 * pattern does not create two tetrahedral centers), PocketChem falls back to
 * the constitutionally correct diol without inventing stereochemistry.
 */
async function synDihydroxylation(reactantSmiles: string): Promise<string[]> {
  const geometry = await alkeneGeometry(reactantSmiles);
  const products = new Set<string>();

  let stereoSmarts: string[] = [];
  if (geometry === "E") {
    stereoSmarts = [
      "[C;H1:1]=[C;H1:2]>>[C@:1]([OH])[C@@:2]([OH])",
      "[C;H1:1]=[C;H1:2]>>[C@@:1]([OH])[C@:2]([OH])",
    ];
  } else if (geometry === "Z") {
    stereoSmarts = [
      "[C;H1:1]=[C;H1:2]>>[C@:1]([OH])[C@:2]([OH])",
      "[C;H1:1]=[C;H1:2]>>[C@@:1]([OH])[C@@:2]([OH])",
    ];
  }

  for (const smarts of stereoSmarts) {
    for (const product of await runReactionSmarts(reactantSmiles, smarts, 8)) {
      products.add(product);
    }
  }

  if (products.size > 0) return [...products];

  for (const product of await runReactionSmarts(
    reactantSmiles,
    "[C:1]=[C:2]>>[C:1]([OH])[C:2]([OH])",
    8,
  )) {
    products.add(product);
  }

  return [...products];
}


/**
 * Anti dihydroxylation is the stereochemical complement of syn
 * dihydroxylation: epoxidation followed by acid-catalyzed opening places the
 * two OH groups on opposite faces. For E/Z-defined H1=H1 alkenes we generate
 * the explicit stereoisomer set. Other substitution patterns retain the
 * correct vicinal-diol connectivity without inventing an absolute R/S label.
 */
async function antiDihydroxylation(reactantSmiles: string): Promise<string[]> {
  const geometry = await alkeneGeometry(reactantSmiles);
  const products = new Set<string>();

  let stereoSmarts: string[] = [];
  if (geometry === "E") {
    stereoSmarts = [
      "[C;H1:1]=[C;H1:2]>>[C@:1]([OH])[C@:2]([OH])",
      "[C;H1:1]=[C;H1:2]>>[C@@:1]([OH])[C@@:2]([OH])",
    ];
  } else if (geometry === "Z") {
    stereoSmarts = [
      "[C;H1:1]=[C;H1:2]>>[C@:1]([OH])[C@@:2]([OH])",
      "[C;H1:1]=[C;H1:2]>>[C@@:1]([OH])[C@:2]([OH])",
    ];
  }

  for (const smarts of stereoSmarts) {
    for (const product of await runReactionSmarts(reactantSmiles, smarts, 8)) {
      products.add(product);
    }
  }

  if (products.size > 0) return [...products];

  for (const product of await runReactionSmarts(
    reactantSmiles,
    "[C:1]=[C:2]>>[C:1]([OH])[C:2]([OH])",
    8,
  )) {
    products.add(product);
  }

  return [...products];
}

async function oneTwoAddition(
  reactantSmiles: string,
  options?: Record<string, unknown>,
): Promise<string[]> {
  const requestedNucleophile = options?.nucleophile;
  const nucleophile: OneTwoAdditionNucleophile | null =
    requestedNucleophile === "water" || requestedNucleophile === "cyanide"
      ? requestedNucleophile
      : null;

  if (!nucleophile) {
    console.warn(
      "Addition oneTwoAddition requires water or cyanide. Hydride reductions belong to the reduction handler.",
      options,
    );
    return [];
  }

  const carbonylType = await classifyCarbonyl(reactantSmiles);

  if (carbonylType !== "aldehyde" && carbonylType !== "ketone") {
    return [];
  }

  const smarts =
    nucleophile === "water"
      ? "[C:1]=[O:2]>>[C:1]([OH:2])O"
      : "[C:1]=[O:2]>>[C:1]([OH:2])C#N";

  return runReactionSmarts(reactantSmiles, smarts);
}
