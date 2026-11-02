import { runReactionSmarts } from "../rdkitReaction";
import {
  readPositiveIntegerOption,
  readStringOption,
  warnUnsupportedHandlerMode,
} from "./handlerUtils";

type RearrangementMode = "pinacol";

const REARRANGEMENT_MODES = ["pinacol"] as const satisfies readonly RearrangementMode[];

/**
 * Ring-bond migration in a cyclic vicinal diol.
 *
 * Atom 5 is the ring carbon adjacent to one of the two carbinol carbons. During
 * the pinacol shift the 5-1 bond migrates to carbon 3, the hydroxyl on carbon
 * 1 becomes the carbonyl oxygen, and the hydroxyl on carbon 3 leaves as water.
 * The net result is contraction of that ring by one atom.
 *
 * This is the ring-contraction fallback.  It is evaluated only after
 * higher-ranked hydride/aryl/exocyclic-alkyl migrations have been ruled out.
 */
export const PINACOL_RING_CONTRACTION_SMARTS =
  "[C;R:5]-[C;R:1]([OH:2])-[C;R:3]([OH:4])>>[C;R:5]-[C:3]-[C:1](=[O:2])";

/**
 * Hydride migration: the H-bearing carbinol carbon becomes the carbonyl.
 * This is especially important for secondary vicinal diols, where hydride
 * migration normally outranks simple C-C alkyl migration.
 */
const PINACOL_HYDRIDE_SHIFT_SMARTS =
  "[C;H1,H2:1]([OH:2])-[C:3]([OH:4])>>[C:1](=[O:2])-[C:3]";

/** Aryl migration from the carbon that becomes the carbonyl carbon. */
const PINACOL_ARYL_SHIFT_SMARTS =
  "[c:5]-[C:1]([OH:2])-[C:3]([OH:4])>>[c:5]-[C:3]-[C:1](=[O:2])";

/**
 * Non-ring carbon migration (methyl/alkyl shift). Ring atoms are excluded so
 * cyclic substrates do not duplicate the ring-contraction pathway here.
 */
const PINACOL_ALKYL_SHIFT_SMARTS = [
  // More substituted migrating carbon first; ties are retained only within
  // the same migration class.
  "[C;!R;H0:5]-[C:1]([OH:2])-[C:3]([OH:4])>>[C:5]-[C:3]-[C:1](=[O:2])",
  "[C;!R;H1:5]-[C:1]([OH:2])-[C:3]([OH:4])>>[C:5]-[C:3]-[C:1](=[O:2])",
  "[C;!R;H2:5]-[C:1]([OH:2])-[C:3]([OH:4])>>[C:5]-[C:3]-[C:1](=[O:2])",
  "[C;!R;H3:5]-[C:1]([OH:2])-[C:3]([OH:4])>>[C:5]-[C:3]-[C:1](=[O:2])",
] as const;

function uniqueProducts(products: string[]): string[] {
  return [...new Set(products.filter(Boolean))];
}

/**
 * Which hydroxyl leaves decides everything that follows: the carbon that loses its OH becomes
 * the carbocation, and the group that migrates comes from the OTHER carbinol carbon (which ends
 * as the carbonyl). Textbook rule: the more stable carbocation forms first, and then
 * H > aryl > alkyl migrate. The stability score of the leaving carbon is its number of carbon
 * substituents plus one for each aryl group (an aryl group stabilises a cation about as much as
 * one more alkyl substituent). Ties keep every tied orientation, so a genuinely ambiguous diol
 * still gives several outcomes. Applied before the migration hierarchy, it fixes diols such as
 * propane-1,2-diol, where the secondary cation (hydride shift, giving the aldehyde) beats the
 * primary one (giving the ketone).
 */
const LEAVING_CARBON_TIERS: ReadonlyArray<readonly string[]> = [
  // score 4
  ["H0;$(C(-c)-c)"],
  // score 3
  ["H0;$(C-c);!$(C(-c)-c)", "H1;$(C(-c)-c)"],
  // score 2
  ["H0;!$(C-c)", "H1;$(C-c);!$(C(-c)-c)"],
  // score 1
  ["H1;!$(C-c)", "H2;$(C-c)"],
  // score 0
  ["H2;!$(C-c)"],
];

/** Restrict the leaving carbon (map number 3) of a reaction SMARTS to a stability tier member. */
function withLeavingCarbon(smarts: string, atomExpression: string): string {
  if (smarts.includes("[C;R:3]")) return smarts.replace("[C;R:3]", `[C;R;X4;${atomExpression}:3]`);
  return smarts.replace("[C:3]", `[C;X4;${atomExpression}:3]`);
}

async function migrationHierarchy(
  reactantSmiles: string,
  atomExpressions: readonly string[],
  maxProducts: number,
): Promise<string[]> {
  const classes: string[][] = [
    // Hydride migration: the H-bearing carbinol carbon becomes the carbonyl (fixes secondary cyclic diols
    // such as (1S,2R)-4-ethylcyclopentane-1,2-diol, which keep the ring and give 3-ethylcyclopentanone).
    [PINACOL_HYDRIDE_SHIFT_SMARTS],
    // Aryl migration.
    [PINACOL_ARYL_SHIFT_SMARTS],
    // Exocyclic alkyl migration, most substituted migrating carbon first.
    ...PINACOL_ALKYL_SHIFT_SMARTS.map((smarts) => [smarts]),
    // Ring C-C migration (ring contraction) is a fallback, not an assumption for every cyclic diol.
    [PINACOL_RING_CONTRACTION_SMARTS],
  ];
  for (const migrationClass of classes) {
    const products: string[] = [];
    for (const smarts of migrationClass) {
      for (const expression of atomExpressions) {
        products.push(...(await runReactionSmarts(reactantSmiles, withLeavingCarbon(smarts, expression), maxProducts)));
      }
    }
    const unique = uniqueProducts(products);
    if (unique.length > 0) return unique.slice(0, maxProducts);
  }
  return [];
}

async function pinacolRearrangement(
  reactantSmiles: string,
  maxProducts: number,
): Promise<string[]> {
  // The most stable carbocation that can form decides first; only if that tier gives nothing
  // does a less stable one get considered.
  for (const tier of LEAVING_CARBON_TIERS) {
    const products = await migrationHierarchy(reactantSmiles, tier, maxProducts);
    if (products.length > 0) return products;
  }
  return [];
}

/**
 * Substrate-aware skeletal rearrangements.
 *
 * SN1/E1 hydride/alkyl shifts that occur *inside* an ionization pathway remain
 * in carbocationUtils.ts. Named rearrangements that are reactions in their own
 * right are handled here.
 */
export async function rearrangement(
  reactantSmiles: string,
  options?: Record<string, unknown>
): Promise<string[]> {
  const mode = readStringOption(options, "mode", REARRANGEMENT_MODES);
  if (!mode) {
    warnUnsupportedHandlerMode("Rearrangement", options);
    return [];
  }

  const maxProducts = readPositiveIntegerOption(options, "maxProducts", 8);

  if (mode === "pinacol") {
    return pinacolRearrangement(reactantSmiles, maxProducts);
  }

  warnUnsupportedHandlerMode("Rearrangement", options);
  return [];
}
