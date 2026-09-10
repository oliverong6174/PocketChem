import { getRDKit } from "../../../rdkit";
import { runReactionSmarts } from "../rdkitReaction";
import { classifyCarbonyl } from "./carbonylUtils";
import { epoxideOrganometallicOpening } from "./ring";
import { totalAlkeneSubstitutionScore } from "../productSelectivity";
import { filterProductsByRelativeSubstituentFace } from "../stereochemistry";

export type OneTwoAdditionNucleophile = "water" | "cyanide";
export type AlkeneAdditionRegioselectivity =
  | "markovnikov"
  | "anti-markovnikov";
export type HydrohalogenationHalogen = "Cl" | "Br" | "I";

type AdditionMode =
  | "oneTwoAddition"
  | "alkeneHydration"
  | "alkeneHydrohalogenation"
  | "dieneHydrohalogenation"
  | "polyeneHydrohalogenation"
  | "halohydrin"
  | "haloether"
  | "alkoxymercuration"
  | "synDihydroxylation"
  | "antiDihydroxylation"
  | "epoxidationOrganometallicOpening"
  | "epoxidationAcidicAlcoholOpening";

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

  if (mode === "dieneHydrohalogenation") {
    return dieneHydrohalogenation(primary, options);
  }

  if (mode === "polyeneHydrohalogenation") {
    return polyeneHydrohalogenation(primary, options);
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

  if (mode === "epoxidationOrganometallicOpening") {
    return epoxidationThenOrganometallicOpening(reactantList);
  }

  if (mode === "epoxidationAcidicAlcoholOpening") {
    return epoxidationThenAcidicAlcoholOpening(reactantList, options);
  }

  console.warn("Addition handler missing or unsupported mode:", options);
  return [];
}

async function epoxidationThenAcidicAlcoholOpening(
  reactants: string[],
  _options?: Record<string, unknown>,
): Promise<string[]> {
  if (reactants.length < 2) return [];
  const [alkene, alcohol] = reactants;

  /*
   * Net stereochemistry of 1) peroxyacid 2) ROH/H+.
   *
   * The alcohol is a genuine structural reactant: its O-C bond is mapped into
   * the product, so the handler works for methanol, ethanol and user-defined
   * primary/secondary alcohols without another reagent-specific rule.
   *
   * Epoxidation is stereospecific. Opening of the protonated epoxide is
   * backside/anti. A tertiary epoxide carbon is strongly favored
   * electronically. For ordinary unsymmetrical epoxides this is the standard
   * textbook acidic-opening rule: attack the more substituted carbon. Equal
   * substitution is retained rather than inventing selectivity.
   */
  const alcoholPattern = ".[O;H1;+0:3][C;X4:4]";
  const alkoxyBranch = "[O:3][C:4]";
  const templates: string[] = [
    // Cyclic: tertiary vs secondary/primary -> RO at the tertiary carbon.
    `[C;R;H1,H2:1]=[C;R;H0:2]${alcoholPattern}>>[C@@:1]([OH])[C@@:2](${alkoxyBranch})`,
    `[C;R;H1,H2:1]=[C;R;H0:2]${alcoholPattern}>>[C@:1]([OH])[C@:2](${alkoxyBranch})`,
    `[C;R;H0:1]=[C;R;H1,H2:2]${alcoholPattern}>>[C@@:1](${alkoxyBranch})[C@@:2]([OH])`,
    `[C;R;H0:1]=[C;R;H1,H2:2]${alcoholPattern}>>[C@:1](${alkoxyBranch})[C@:2]([OH])`,

    // Acyclic: tertiary vs secondary/primary -> RO at tertiary carbon.
    `[C;!R;H0:1]=[C;!R;H1,H2:2]${alcoholPattern}>>[C@@:1](${alkoxyBranch})[C@:2]([OH])`,
    `[C;!R;H0:1]=[C;!R;H1,H2:2]${alcoholPattern}>>[C@:1](${alkoxyBranch})[C@@:2]([OH])`,
    `[C;!R;H1,H2:1]=[C;!R;H0:2]${alcoholPattern}>>[C@@:1]([OH])[C@:2](${alkoxyBranch})`,
    `[C;!R;H1,H2:1]=[C;!R;H0:2]${alcoholPattern}>>[C@:1]([OH])[C@@:2](${alkoxyBranch})`,

    // Acidic opening: primary/secondary pair -> RO attacks the MORE
    // substituted (H1) epoxide carbon; the epoxide oxygen remains on the H2
    // carbon and becomes OH. The attacked secondary carbon can be formed from
    // either face when the starting alkene is achiral, so retain the mirror pair.
    `[C;H1:1]=[C;H2:2]${alcoholPattern}>>[C@:1](${alkoxyBranch})[C:2]([OH])`,
    `[C;H1:1]=[C;H2:2]${alcoholPattern}>>[C@@:1](${alkoxyBranch})[C:2]([OH])`,
    `[C;H2:1]=[C;H1:2]${alcoholPattern}>>[C:1]([OH])[C@:2](${alkoxyBranch})`,
    `[C;H2:1]=[C;H1:2]${alcoholPattern}>>[C:1]([OH])[C@@:2](${alkoxyBranch})`,
  ];

  for (const hydrogenCount of [1, 2] as const) {
    templates.push(
      `[C;H${hydrogenCount}:1]=[C;H${hydrogenCount}:2]${alcoholPattern}>>[C@@:1]([OH])[C@:2](${alkoxyBranch})`,
      `[C;H${hydrogenCount}:1]=[C;H${hydrogenCount}:2]${alcoholPattern}>>[C@:1]([OH])[C@@:2](${alkoxyBranch})`,
      `[C;H${hydrogenCount}:1]=[C;H${hydrogenCount}:2]${alcoholPattern}>>[C@@:1](${alkoxyBranch})[C@:2]([OH])`,
      `[C;H${hydrogenCount}:1]=[C;H${hydrogenCount}:2]${alcoholPattern}>>[C@:1](${alkoxyBranch})[C@@:2]([OH])`,
    );
  }

  const products = new Set<string>();
  for (const smarts of templates) {
    for (const product of await runReactionSmarts([alkene, alcohol], smarts, 32)) {
      products.add(product);
    }
  }

  // Do not trust @/@@ enumeration by itself for cyclic/fused systems. The same
  // reaction SMARTS can match a ring alkene in both atom-map directions, which
  // can turn the intended anti opening into all four formal R/S combinations.
  // For adjacent ring centers only, inspect the actual OH/OR wedge relationship
  // and remove an unambiguously syn leak. Acyclic products are deliberately not
  // filtered here: their syn/anti history cannot be inferred safely from an
  // arbitrary 2-D depiction after free bond rotation. If RDKit cannot expose a
  // decisive ring-face relationship, the shared guard leaves the set untouched.
  return filterProductsByRelativeSubstituentFace(
    [...products],
    {
      smarts: "[C;R;X4:1]([O;H1;+0:2])-[C;R;X4:3]([O;H0;+0:4][#6:5])",
      firstBond: [0, 1],
      secondBond: [2, 3],
    },
    "opposite",
  );
}

async function epoxidationThenOrganometallicOpening(
  reactants: string[],
): Promise<string[]> {
  const [alkene, organometallic] = reactants;
  if (!alkene || !organometallic) return [];

  /*
   * Net stereochemistry of 1) mCPBA 2) Grignard/RLi 3) H3O+:
   * the peracid forms an epoxide stereospecifically, then the organometallic
   * opens it by backside SN2 attack at the less substituted epoxide carbon.
   * Encoding the net step directly avoids losing the epoxide-face information
   * in an achiral intermediate SMILES. PocketChem draws one representative
   * anti stereoisomer per constitutional pathway instead of listing a mirror
   * drawing as if it were a different regioisomer.
   */
  const organometallicPattern = ".[C:4][Mg,Li]";

  /*
   * Cyclic alkenes constrain the epoxide faces, so anti opening has a defined
   * relative face even when the input SMILES carries no E/Z marker.  RDKit's
   * @/@@ meaning depends on local branch ordering; therefore ring templates
   * are kept separate from the acyclic templates below instead of applying a
   * global tag swap.  This is a structural rule (R), not a substrate-specific
   * exception.
   */
  const ringStereoTemplates = [
    // Unequal substitution: OH remains on the more substituted epoxide carbon
    // and R attacks the less substituted carbon from the opposite face.
    `[C;R;H0:1]=[C;R;H1,H2:2]${organometallicPattern}>>[C@@:1]([OH])[C@@:2]([C:4])`,
    `[C;R;H1:1]=[C;R;H2:2]${organometallicPattern}>>[C@@:1]([OH])[C@@:2]([C:4])`,
    // Equal substitution: retain both constitutional attack orientations,
    // each with the anti face relationship for this mapped branch order.
    ...[0, 1, 2].flatMap((hydrogenCount) => [
      `[C;R;H${hydrogenCount}:1]=[C;R;H${hydrogenCount}:2]${organometallicPattern}>>[C@@:1]([OH])[C@:2]([C:4])`,
      `[C;R;H${hydrogenCount}:1]=[C;R;H${hydrogenCount}:2]${organometallicPattern}>>[C@@:1]([C:4])[C@:2]([OH])`,
    ]),
  ];

  const ringProducts = new Set<string>();
  for (const smarts of ringStereoTemplates) {
    for (const product of await runReactionSmarts(
      [alkene, organometallic],
      smarts,
      16,
    )) {
      ringProducts.add(product);
    }
  }
  if (ringProducts.size > 0) return [...ringProducts];

  const templates: string[] = [];

  const addAntiRepresentative = (alkenePattern: string, product: string) => {
    templates.push(`${alkenePattern}${organometallicPattern}>>${product}`);
  };

  // C1 is more substituted; C2 is attacked by the carbon nucleophile.
  addAntiRepresentative(
    "[C;H0:1]=[C;H1,H2:2]",
    "[C@@:1]([OH])[C@:2]([C:4])",
  );
  addAntiRepresentative(
    "[C;H1:1]=[C;H2:2]",
    "[C@@:1]([OH])[C@:2]([C:4])",
  );

  // Equal-substitution epoxides have no universal constitutional preference;
  // retain the genuinely competitive openings rather than inventing one.
  for (const hydrogenCount of [0, 1, 2]) {
    addAntiRepresentative(
      `[C;H${hydrogenCount}:1]=[C;H${hydrogenCount}:2]`,
      "[C@:1]([OH])[C@@:2]([C:4])",
    );
    addAntiRepresentative(
      `[C;H${hydrogenCount}:1]=[C;H${hydrogenCount}:2]`,
      "[C@@:1]([C:4])[C@:2]([OH])",
    );
  }

  const products = new Set<string>();
  for (const smarts of templates) {
    for (const product of await runReactionSmarts(
      [alkene, organometallic],
      smarts,
      16,
    )) {
      products.add(product);
    }
  }

  // Keep the old explicit epoxide-opening engine as a constitutional fallback
  // for unusual atom/metal encodings that the direct stereochemical SMARTS do
  // not recognize.
  if (products.size === 0) {
    const epoxides = await runReactionSmarts(
      alkene,
      "[C:1]=[C:2]>>[C:1]1[O][C:2]1",
      16,
    );
    for (const epoxide of epoxides) {
      for (const product of await epoxideOrganometallicOpening(
        epoxide,
        organometallic,
      )) {
        products.add(product);
      }
    }
  }

  return [...products];
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



function conjugatedPolyeneReactantPattern(
  doubleBondCount: number,
  cationHydrogenCount?: number,
): string {
  const atomCount = doubleBondCount * 2;
  const atoms: string[] = [];
  for (let atom = 1; atom <= atomCount; atom += 1) {
    if (atom === 2 && cationHydrogenCount !== undefined) {
      atoms.push(`[C;H${cationHydrogenCount}:${atom}]`);
    } else {
      atoms.push(`[C:${atom}]`);
    }
  }

  let pattern = atoms[0];
  for (let atom = 1; atom < atomCount; atom += 1) {
    const bond = atom % 2 === 1 ? "=" : "-";
    pattern += `${bond}${atoms[atom]}`;
  }
  return pattern;
}

function conjugatedPolyeneProductPattern(
  doubleBondCount: number,
  halogen: HydrohalogenationHalogen,
  capture: "adjacent" | "remote",
): string {
  const atomCount = doubleBondCount * 2;

  if (capture === "adjacent") {
    let product = `[C:1]-[C:2]([${halogen}])`;
    for (let atom = 3; atom <= atomCount; atom += 1) {
      const previousAtom = atom - 1;
      const bond = previousAtom % 2 === 1 ? "=" : "-";
      product += `${bond}[C:${atom}]`;
    }
    return product;
  }

  let product = `[C:1]-[C:2]`;
  for (let atom = 3; atom <= atomCount; atom += 1) {
    const previousAtom = atom - 1;
    const bond = previousAtom % 2 === 0 ? "=" : "-";
    const suffix = atom === atomCount ? `([${halogen}])` : "";
    product += `${bond}[C:${atom}]${suffix}`;
  }
  return product;
}

/**
 * HX addition to an extended conjugated polyene. Unlike the historical diene
 * handler, this operates on the entire alternating pi chain supplied by the
 * rule instead of selecting a four-carbon window first.
 *
 * For a triene (three C=C bonds), remote capture is 1,6 addition and leaves a
 * conjugated diene. For a tetraene it is 1,8, etc. The orientation is ranked
 * by the substitution of the initially formed allylic/polyallylic carbocation
 * center (H0 > H1 > H2), without treating an ordinary fused-ring junction as
 * a forbidden bridgehead. R2 alone is not a valid Bredt/planarity test.
 */
async function polyeneHydrohalogenation(
  reactantSmiles: string,
  options?: Record<string, unknown>,
): Promise<string[]> {
  const requestedHalogen = options?.halogen;
  const halogen: HydrohalogenationHalogen | null =
    requestedHalogen === "Cl" || requestedHalogen === "Br" || requestedHalogen === "I"
      ? requestedHalogen
      : null;

  const requestedCount = Number(options?.conjugatedDoubleBonds);
  const doubleBondCount =
    Number.isInteger(requestedCount) && requestedCount >= 2 && requestedCount <= 6
      ? requestedCount
      : null;

  const requestedCapture = options?.capture;
  const capture =
    requestedCapture === "adjacent" || requestedCapture === "remote"
      ? requestedCapture
      : null;

  if (!halogen || !doubleBondCount || !capture) {
    console.warn(
      "Addition polyeneHydrohalogenation requires Cl/Br/I, conjugatedDoubleBonds >= 2, and adjacent/remote capture.",
      options,
    );
    return [];
  }

  const expectedCarbonDoubleBondCount = Math.max(0, doubleBondCount - 1);
  const candidatesByOrientation = new Map<string, number>();

  // H0 means the initially generated cationic center has no hydrogens and is
  // therefore the most substituted. We deliberately do not penalize R2 fused
  // ring junctions; only a true bridged bridgehead analysis would justify that.
  const cationHydrogenRanks = [0, 1, 2, undefined] as const;
  for (const [orientationRank, hydrogenCount] of cationHydrogenRanks.entries()) {
    const reactantPattern = conjugatedPolyeneReactantPattern(
      doubleBondCount,
      hydrogenCount,
    );
    const productPattern = conjugatedPolyeneProductPattern(
      doubleBondCount,
      halogen,
      capture,
    );
    const reactionSmarts = `${reactantPattern}>>${productPattern}`;

    for (const product of await runReactionSmarts(reactantSmiles, reactionSmarts, 32)) {
      const previous = candidatesByOrientation.get(product);
      if (previous === undefined || orientationRank < previous) {
        candidatesByOrientation.set(product, orientationRank);
      }
    }
  }

  if (candidatesByOrientation.size === 0) return [];

  const scored = await Promise.all(
    [...candidatesByOrientation.entries()].map(async ([product, orientationRank]) => {
      const [metrics, alkeneScore] = await Promise.all([
        conjugatedCarbonMetrics(product),
        totalAlkeneSubstitutionScore(product),
      ]);
      return {
        product,
        orientationRank,
        carbonDoubleBondCount: metrics.carbonDoubleBondCount,
        maxConjugatedDoubleBondSpan: metrics.maxConjugatedDoubleBondSpan,
        alkeneScore,
      };
    }),
  );

  let finalists = scored.filter(
    (candidate) => candidate.carbonDoubleBondCount === expectedCarbonDoubleBondCount,
  );
  if (finalists.length === 0) finalists = scored;

  // Remote, thermodynamic capture is selected by the final pi system first.
  // Adjacent, kinetic capture is selected by cation-formation preference first.
  if (capture === "remote") {
    const bestConjugation = Math.max(
      ...finalists.map((candidate) => candidate.maxConjugatedDoubleBondSpan),
    );
    finalists = finalists.filter(
      (candidate) => candidate.maxConjugatedDoubleBondSpan === bestConjugation,
    );

    const bestAlkeneScore = Math.max(
      ...finalists.map((candidate) => candidate.alkeneScore),
    );
    finalists = finalists.filter(
      (candidate) => candidate.alkeneScore === bestAlkeneScore,
    );
  }

  const bestOrientation = Math.min(
    ...finalists.map((candidate) => candidate.orientationRank),
  );
  return finalists
    .filter((candidate) => candidate.orientationRank === bestOrientation)
    .map((candidate) => candidate.product);
}


type ParsedV2000Bond = {
  atom1: number;
  atom2: number;
  order: number;
};

type ParsedV2000Graph = {
  symbols: string[];
  bonds: ParsedV2000Bond[];
};

type ConjugatedCarbonMetrics = {
  carbonDoubleBondCount: number;
  maxConjugatedDoubleBondSpan: number;
};

type RankedDieneProduct = {
  product: string;
  orientationRank: number;
  carbonDoubleBondCount: number;
  maxConjugatedDoubleBondSpan: number;
  alkeneScore: number;
};

function parseMatches(raw: string): number[][] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((entry) => {
        if (Array.isArray(entry)) {
          return entry.map(Number).filter(Number.isFinite);
        }
        if (entry && typeof entry === "object" && Array.isArray((entry as { atoms?: unknown[] }).atoms)) {
          return (entry as { atoms: unknown[] }).atoms.map(Number).filter(Number.isFinite);
        }
        return [];
      })
      .filter((entry) => entry.length > 0);
  } catch {
    return [];
  }
}

function parseV2000Graph(molBlock: string): ParsedV2000Graph | null {
  if (!molBlock || molBlock.includes("V3000")) return null;

  const lines = molBlock.split(/\r?\n/);
  if (lines.length < 5) return null;

  const atomCount = Number.parseInt(lines[3]?.slice(0, 3).trim() ?? "", 10);
  const bondCount = Number.parseInt(lines[3]?.slice(3, 6).trim() ?? "", 10);
  if (!Number.isInteger(atomCount) || atomCount <= 0) return null;
  if (!Number.isInteger(bondCount) || bondCount < 0) return null;

  const atomStart = 4;
  const bondStart = atomStart + atomCount;
  const symbols: string[] = [];
  for (let index = 0; index < atomCount; index += 1) {
    const line = lines[atomStart + index] ?? "";
    symbols.push(line.slice(31, 34).trim());
  }

  const bonds: ParsedV2000Bond[] = [];
  for (let index = 0; index < bondCount; index += 1) {
    const line = lines[bondStart + index] ?? "";
    const atom1 = Number.parseInt(line.slice(0, 3).trim(), 10) - 1;
    const atom2 = Number.parseInt(line.slice(3, 6).trim(), 10) - 1;
    const order = Number.parseInt(line.slice(6, 9).trim(), 10);
    if (!Number.isInteger(atom1) || !Number.isInteger(atom2) || !Number.isInteger(order)) continue;
    if (atom1 < 0 || atom2 < 0 || atom1 >= atomCount || atom2 >= atomCount) continue;
    bonds.push({ atom1, atom2, order });
  }

  return { symbols, bonds };
}

async function conjugatedCarbonMetrics(smiles: string): Promise<ConjugatedCarbonMetrics> {
  const rdkit = await getRDKit();
  const mol = rdkit.get_mol(smiles);
  if (!mol) {
    return { carbonDoubleBondCount: 0, maxConjugatedDoubleBondSpan: 0 };
  }

  try {
    const molBlock = mol.get_molblock?.();
    if (typeof molBlock !== "string") {
      return { carbonDoubleBondCount: 0, maxConjugatedDoubleBondSpan: 0 };
    }

    const graph = parseV2000Graph(molBlock);
    if (!graph) {
      return { carbonDoubleBondCount: 0, maxConjugatedDoubleBondSpan: 0 };
    }

    const carbonDoubleBonds = graph.bonds
      .map((bond, index) => ({ bond, index }))
      .filter(
        ({ bond }) =>
          bond.order === 2 &&
          graph.symbols[bond.atom1] === "C" &&
          graph.symbols[bond.atom2] === "C",
      );

    if (carbonDoubleBonds.length === 0) {
      return { carbonDoubleBondCount: 0, maxConjugatedDoubleBondSpan: 0 };
    }

    const doubleBondIndicesByAtom = new Map<number, number[]>();
    for (const { index, bond } of carbonDoubleBonds) {
      const first = doubleBondIndicesByAtom.get(bond.atom1) ?? [];
      first.push(index);
      doubleBondIndicesByAtom.set(bond.atom1, first);
      const second = doubleBondIndicesByAtom.get(bond.atom2) ?? [];
      second.push(index);
      doubleBondIndicesByAtom.set(bond.atom2, second);
    }

    const adjacency = new Map<number, Set<number>>();
    for (const { index } of carbonDoubleBonds) adjacency.set(index, new Set<number>());

    for (const bond of graph.bonds) {
      if (bond.order !== 1) continue;
      if (graph.symbols[bond.atom1] !== "C" || graph.symbols[bond.atom2] !== "C") continue;

      const left = doubleBondIndicesByAtom.get(bond.atom1) ?? [];
      const right = doubleBondIndicesByAtom.get(bond.atom2) ?? [];
      for (const first of left) {
        for (const second of right) {
          if (first === second) continue;
          adjacency.get(first)?.add(second);
          adjacency.get(second)?.add(first);
        }
      }
    }

    let maxConjugatedDoubleBondSpan = 0;
    const visited = new Set<number>();
    for (const { index } of carbonDoubleBonds) {
      if (visited.has(index)) continue;
      const queue = [index];
      visited.add(index);
      let componentSize = 0;
      while (queue.length > 0) {
        const current = queue.shift()!;
        componentSize += 1;
        for (const neighbor of adjacency.get(current) ?? []) {
          if (visited.has(neighbor)) continue;
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
      if (componentSize > maxConjugatedDoubleBondSpan) {
        maxConjugatedDoubleBondSpan = componentSize;
      }
    }

    return {
      carbonDoubleBondCount: carbonDoubleBonds.length,
      maxConjugatedDoubleBondSpan,
    };
  } finally {
    mol.delete?.();
  }
}

async function ringJunctionAlkeneCount(smiles: string): Promise<number> {
  const rdkit = await getRDKit();
  const molecule = rdkit.get_mol(smiles);
  if (!molecule) return 0;

  const queries = ["[C;R2]=[C]", "[C]=[C;R2]"];
  const seenBonds = new Set<string>();

  try {
    for (const smarts of queries) {
      const query = rdkit.get_qmol(smarts);
      if (!query) continue;
      try {
        const matches = parseMatches(molecule.get_substruct_matches?.(query) ?? "[]");
        for (const match of matches) {
          if (match.length < 2) continue;
          const [first, second] = match;
          const key = first < second ? `${first}-${second}` : `${second}-${first}`;
          seenBonds.add(key);
        }
      } finally {
        query.delete?.();
      }
    }
    return seenBonds.size;
  } finally {
    molecule.delete?.();
  }
}

/**
 * Electrophilic HX addition to an isolated conjugated diene.
 *
 * A diene is just the two-double-bond member of the same maximal-conjugation
 * model used for trienes and longer polyenes.  Delegating to that executor is
 * important: both the 1,2 and 1,4 products are generated DIRECTLY from the
 * same four-carbon reactant path, rather than generating a 1,2 product and
 * re-matching that product to "shift" the double bond.  Product re-matching
 * was the source of the persistent one-carbon/off-manifold errors in fused
 * cyclic dienes.
 */
async function dieneHydrohalogenation(
  reactantSmiles: string,
  options?: Record<string, unknown>,
): Promise<string[]> {
  const requestedPattern = options?.additionPattern;
  const capture = requestedPattern === "1,2"
    ? "adjacent"
    : requestedPattern === "1,4"
      ? "remote"
      : null;

  if (!capture) {
    console.warn(
      "Addition dieneHydrohalogenation requires a 1,2 or 1,4 pattern.",
      options,
    );
    return [];
  }

  return polyeneHydrohalogenation(reactantSmiles, {
    ...options,
    mode: "polyeneHydrohalogenation",
    conjugatedDoubleBonds: 2,
    capture,
  });
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
