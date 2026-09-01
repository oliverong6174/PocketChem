import {
  analyzeCarbocationStability,
  getBestCarbocationStabilityResult,
} from "../../../ranking/cationStability";
import { runReactionSmarts } from "../rdkitReaction";

export type CarbocationShiftType = "none" | "hydride" | "alkyl";

export type CarbocationPrecursor = {
  /**
   * A virtual alkyl-halide precursor whose C-X bond marks the carbocation
   * center after ionization. Shifted precursors are internal bookkeeping
   * structures; they are never shown directly to the user.
   */
  smiles: string;
  shiftType: CarbocationShiftType;
  shiftDepth: number;
  stabilityScore: number;
};

type RearrangementOptions = {
  maxShiftDepth?: number;
  maxCandidates?: number;
  includeUnrearranged?: boolean;
};

const HALIDE_IONIZATION_SMARTS =
  "[C;X4:1][Cl,Br,I:2]>>[C+:1]";

/**
 * Virtual 1,2-hydride shift.
 *
 * Instead of trying to carry an explicit hydride atom through RDKit, the
 * leaving group is moved to the adjacent carbon. Ionizing this virtual halide
 * gives the same carbon skeleton / implicit-H bookkeeping as the rearranged
 * carbocation. The virtual structure is used only as an internal precursor.
 */
const HYDRIDE_SHIFT_PRECURSOR_SMARTS =
  "[C;X4:1]([Cl,Br,I:4])-[C;H1,H2,H3:2]>>[C:1]-[C:2][*:4]";

/**
 * Virtual 1,2-alkyl shift. A carbon substituent migrates from the carbon next
 * to the cation center onto the original cation carbon; the leaving-group
 * marker moves to the newly generated cation center.
 *
 * This representation can also capture simple ring-expansion migrations when
 * the migrated C-C bond belongs to a ring. Candidates are retained only when
 * the resulting carbocation is more stable than the precursor carbocation.
 */
const ALKYL_SHIFT_PRECURSOR_SMARTS =
  "[C;X4:1]([Cl,Br,I:4])-[C;X4:2]-[C:3]>>[C:1](-[C:3])-[C:2][*:4]";

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

async function getBestIonizedCarbocationScore(
  virtualHalideSmiles: string
): Promise<number | null> {
  const carbocations = await runReactionSmarts(
    virtualHalideSmiles,
    HALIDE_IONIZATION_SMARTS,
    16
  );

  let bestScore: number | null = null;

  for (const carbocationSmiles of carbocations) {
    const results = await analyzeCarbocationStability(carbocationSmiles);
    const best = getBestCarbocationStabilityResult(results);

    if (!best) continue;

    if (bestScore === null || best.stabilityScore < bestScore) {
      bestScore = best.stabilityScore;
    }
  }

  return bestScore;
}

async function generateShiftedPrecursors(
  precursor: CarbocationPrecursor,
  shiftType: Exclude<CarbocationShiftType, "none">
): Promise<CarbocationPrecursor[]> {
  const smarts =
    shiftType === "hydride"
      ? HYDRIDE_SHIFT_PRECURSOR_SMARTS
      : ALKYL_SHIFT_PRECURSOR_SMARTS;

  const candidates = await runReactionSmarts(precursor.smiles, smarts, 24);
  const shifted: CarbocationPrecursor[] = [];

  for (const candidateSmiles of unique(candidates)) {
    if (candidateSmiles === precursor.smiles) continue;

    const score = await getBestIonizedCarbocationScore(candidateSmiles);
    if (score === null) continue;

    // A 1,2-shift is only promoted automatically when it produces a clearly
    // more stable carbocation. Equal-stability migrations are intentionally
    // omitted because they often create mixtures and require conformational
    // or migratory-aptitude reasoning beyond the current engine.
    if (score >= precursor.stabilityScore) continue;

    shifted.push({
      smiles: candidateSmiles,
      shiftType,
      shiftDepth: precursor.shiftDepth + 1,
      stabilityScore: score,
    });
  }

  return shifted;
}

/**
 * Enumerate favorable 1,2-hydride and 1,2-alkyl rearrangements for an alkyl
 * halide that is about to undergo SN1/E1 ionization.
 *
 * The algorithm deliberately follows only a short, strictly downhill path in
 * carbocation stability. That captures the standard O-Chem rearrangements
 * without wandering through equal-energy skeletal isomerizations.
 */
export async function enumerateCarbocationPrecursors(
  substrateSmiles: string,
  options: RearrangementOptions = {}
): Promise<CarbocationPrecursor[]> {
  const maxShiftDepth = Math.max(0, options.maxShiftDepth ?? 2);
  const maxCandidates = Math.max(1, options.maxCandidates ?? 12);
  const includeUnrearranged = options.includeUnrearranged ?? true;

  const originalScore = await getBestIonizedCarbocationScore(substrateSmiles);
  if (originalScore === null) {
    return includeUnrearranged
      ? [{
          smiles: substrateSmiles,
          shiftType: "none",
          shiftDepth: 0,
          stabilityScore: Number.POSITIVE_INFINITY,
        }]
      : [];
  }

  const original: CarbocationPrecursor = {
    smiles: substrateSmiles,
    shiftType: "none",
    shiftDepth: 0,
    stabilityScore: originalScore,
  };

  const seen = new Set<string>([substrateSmiles]);
  const rearranged: CarbocationPrecursor[] = [];
  let frontier: CarbocationPrecursor[] = [original];

  for (let depth = 0; depth < maxShiftDepth && frontier.length > 0; depth += 1) {
    const nextFrontier: CarbocationPrecursor[] = [];

    for (const precursor of frontier) {
      for (const shiftType of ["hydride", "alkyl"] as const) {
        const candidates = await generateShiftedPrecursors(precursor, shiftType);

        for (const candidate of candidates) {
          if (seen.has(candidate.smiles)) continue;
          seen.add(candidate.smiles);
          rearranged.push(candidate);
          nextFrontier.push(candidate);

          if (rearranged.length >= maxCandidates) break;
        }

        if (rearranged.length >= maxCandidates) break;
      }

      if (rearranged.length >= maxCandidates) break;
    }

    frontier = nextFrontier;
    if (rearranged.length >= maxCandidates) break;
  }

  // Show the most stabilized rearranged pathways first. The unrearranged
  // pathway remains available because capture can sometimes compete with a
  // rearrangement even when a lower-energy cation is accessible.
  rearranged.sort((a, b) =>
    a.stabilityScore - b.stabilityScore ||
    a.shiftDepth - b.shiftDepth ||
    a.smiles.localeCompare(b.smiles)
  );

  return includeUnrearranged ? [...rearranged, original] : rearranged;
}
