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

async function pinacolRearrangement(
  reactantSmiles: string,
  maxProducts: number,
): Promise<string[]> {
  // Hydride has a higher migratory aptitude than an ordinary alkyl/ring bond.
  // This fixes secondary cyclic vicinal diols such as
  // (1S,2R)-4-ethylcyclopentane-1,2-diol: both carbinol centers bear H, so the
  // major rearrangement is the ring-retaining ketone (3-ethylcyclopentanone),
  // not dehydration products or a ring-contracted aldehyde.
  const hydrideProducts = uniqueProducts(
    await runReactionSmarts(
      reactantSmiles,
      PINACOL_HYDRIDE_SHIFT_SMARTS,
      maxProducts,
    ),
  );

  if (hydrideProducts.length > 0) {
    return hydrideProducts.slice(0, maxProducts);
  }

  // If hydride migration is unavailable, do NOT assume that every cyclic
  // tertiary vicinal diol must ring-contract.  The previous implementation
  // short-circuited here and therefore never even evaluated an exocyclic
  // alkyl (often methyl) migration.  That incorrectly forced substrates such
  // as 1,2-dialkylcycloalkan-1,2-diols into the contracted-ring product.
  //
  // Rank the remaining migration classes instead:
  //   aryl > exocyclic alkyl > ring C-C migration.
  // This keeps the product list selective (one preferred migration class),
  // while allowing the ring-retaining pinacolone product whenever a genuine
  // exocyclic C-C migration is available.
  const arylProducts = uniqueProducts(
    await runReactionSmarts(
      reactantSmiles,
      PINACOL_ARYL_SHIFT_SMARTS,
      maxProducts,
    ),
  );

  if (arylProducts.length > 0) {
    return arylProducts.slice(0, maxProducts);
  }

  for (const alkylShiftSmarts of PINACOL_ALKYL_SHIFT_SMARTS) {
    const alkylProducts = uniqueProducts(
      await runReactionSmarts(
        reactantSmiles,
        alkylShiftSmarts,
        maxProducts,
      ),
    );

    if (alkylProducts.length > 0) {
      return alkylProducts.slice(0, maxProducts);
    }
  }

  // Ring contraction is now a fallback for cyclic systems that do not have a
  // higher-ranked hydride/aryl/exocyclic-alkyl migration available.  This is
  // deliberately a fallback rather than an unconditional "cyclic = contract"
  // rule, because the latter was the bug that produced the wrong scaffold.
  const ringContractions = uniqueProducts(
    await runReactionSmarts(
      reactantSmiles,
      PINACOL_RING_CONTRACTION_SMARTS,
      maxProducts,
    ),
  );

  return ringContractions.slice(0, maxProducts);
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
