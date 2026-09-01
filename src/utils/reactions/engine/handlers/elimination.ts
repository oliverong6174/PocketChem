import { getRDKit } from "../../../rdkit";
import { runReactionSmarts } from "../rdkitReaction";
import { enumerateCarbocationPrecursors } from "./carbocationUtils";
import {
  readPositiveIntegerOption,
  readStringOption,
  warnUnsupportedHandlerMode,
} from "./handlerUtils";

type EliminationMode = "betaElimination" | "e1" | "e2";
type LeavingGroup = "halide" | "alcohol";
type AlkenePreference = "all" | "zaitsev" | "hofmann";

const LEAVING_GROUPS = ["halide", "alcohol"] as const satisfies readonly LeavingGroup[];
const ALKENE_PREFERENCES = ["all", "zaitsev", "hofmann"] as const satisfies readonly AlkenePreference[];

const betaEliminationSmarts: Record<LeavingGroup, string> = {
  halide: "[C;H1,H2,H3:1][C;X4:2][Cl,Br,I:3]>>[C:1]=[C:2]",
  alcohol: "[C;H1,H2,H3:1][C:2][OH:3]>>[C:1]=[C:2]",
};

function uniqueProducts(products: string[]): string[] {
  return [...new Set(products.filter(Boolean))];
}

/**
 * Approximate constitutional alkene substitution from the product graph.
 *
 * For a simple carbon-carbon alkene, the number of carbon substituents equals
 * 4 minus the total number of hydrogens on the two alkene carbons. The query
 * ladder below therefore gives a useful Zaitsev/Hofmann ranking without
 * pretending to solve 3D antiperiplanar conformations or E/Z stereochemistry.
 */
async function alkeneSubstitutionScore(smiles: string): Promise<number> {
  const rdkit = await getRDKit();
  const molecule = rdkit.get_mol(smiles);
  if (!molecule) return -1;

  const queries: Array<{ score: number; smarts: string }> = [
    { score: 4, smarts: "[C;H0]=[C;H0]" },
    { score: 3, smarts: "[C;H0]=[C;H1]" },
    { score: 2, smarts: "[C;H1]=[C;H1]" },
    { score: 2, smarts: "[C;H0]=[C;H2]" },
    { score: 1, smarts: "[C;H1]=[C;H2]" },
    { score: 0, smarts: "[C;H2]=[C;H2]" },
  ];

  try {
    let best = -1;

    for (const querySpec of queries) {
      const query = rdkit.get_qmol(querySpec.smarts);
      try {
        if (query && molecule.get_substruct_match(query) !== "{}") {
          best = Math.max(best, querySpec.score);
        }
      } finally {
        query?.delete?.();
      }
    }

    return best;
  } finally {
    molecule.delete();
  }
}

async function applyAlkenePreference(
  products: string[],
  preference: AlkenePreference
): Promise<string[]> {
  if (preference === "all" || products.length <= 1) return products;

  const scored = await Promise.all(
    products.map(async (product) => ({
      product,
      score: await alkeneSubstitutionScore(product),
    }))
  );

  const validScores = scored.map((item) => item.score).filter((score) => score >= 0);
  if (validScores.length === 0) return products;

  const target =
    preference === "zaitsev"
      ? Math.max(...validScores)
      : Math.min(...validScores);

  return scored
    .filter((item) => item.score === target)
    .map((item) => item.product);
}

async function eliminateFromPrecursors(
  precursorSmiles: string[],
  leavingGroup: LeavingGroup,
  preference: AlkenePreference,
  maxProducts: number
): Promise<string[]> {
  const products: string[] = [];

  for (const precursor of precursorSmiles) {
    products.push(
      ...(await runReactionSmarts(
        precursor,
        betaEliminationSmarts[leavingGroup],
        maxProducts
      ))
    );

    if (uniqueProducts(products).length >= maxProducts * 2) break;
  }

  const unique = uniqueProducts(products);
  const preferred = await applyAlkenePreference(unique, preference);
  return uniqueProducts(preferred).slice(0, maxProducts);
}

/**
 * Enumerates constitutional beta-elimination products.
 *
 * `e2` is concerted and therefore never invokes carbocation shifts.
 * `e1` first enumerates strictly favorable 1,2-hydride / 1,2-alkyl shifts and
 * then performs beta elimination from each accessible carbocation precursor.
 * The legacy `betaElimination` mode remains for older dehydration rules.
 *
 * The handler deliberately does not claim to solve 3D anti-periplanar
 * conformer availability or E/Z stereochemistry yet.
 */
export async function elimination(
  reactantSmiles: string,
  options?: Record<string, unknown>
): Promise<string[]> {
  const mode = options?.mode as EliminationMode | undefined;

  if (
    mode !== "betaElimination" &&
    mode !== "e1" &&
    mode !== "e2"
  ) {
    warnUnsupportedHandlerMode("Elimination", options);
    return [];
  }

  const leavingGroup = readStringOption(options, "leavingGroup", LEAVING_GROUPS);
  if (!leavingGroup) {
    warnUnsupportedHandlerMode("Elimination", options);
    return [];
  }

  const preference =
    readStringOption(options, "preference", ALKENE_PREFERENCES) ?? "all";
  const maxProducts = readPositiveIntegerOption(options, "maxProducts", 8);

  if (mode === "e1" && leavingGroup === "halide") {
    const maxShiftDepth = readPositiveIntegerOption(options, "maxShiftDepth", 2);
    const allowRearrangement = options?.allowRearrangement !== false;

    const precursors = allowRearrangement
      ? await enumerateCarbocationPrecursors(reactantSmiles, {
          maxShiftDepth,
          maxCandidates: Math.max(6, maxProducts),
          includeUnrearranged: true,
        })
      : [{
          smiles: reactantSmiles,
          shiftType: "none" as const,
          shiftDepth: 0,
          stabilityScore: Number.POSITIVE_INFINITY,
        }];

    return eliminateFromPrecursors(
      precursors.map((precursor) => precursor.smiles),
      leavingGroup,
      preference,
      maxProducts
    );
  }

  return eliminateFromPrecursors(
    [reactantSmiles],
    leavingGroup,
    preference,
    maxProducts
  );
}
