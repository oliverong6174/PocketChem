import type { ParsedMol } from "../../nomenclature/types";
import type { ComparisonMetric, ComparisonModeId } from "../comparisonTypes";
import {
  aromaticAtomSet,
  carbonNeighborCount,
  implicitCarbonHydrogens,
  isPiAdjacent,
  metric,
  otherAtom,
  strongestNamedEffect,
  type NamedEffect,
} from "../comparisonUtils";

const HALOGEN_LG_SCORE: Record<string, number> = { I: 5, Br: 4, Cl: 3, F: 0.8 };

const CARBONYL_REACTIVITY_WEIGHTS: Record<string, number> = {
  "Acyl halide": 6,
  "Acid anhydride": 5.5,
  Aldehyde: 5,
  Benzaldehyde: 4.8,
  Enal: 4.8,
  Ketone: 4.2,
  Enone: 4,
  Ester: 3,
  Enoate: 2.9,
  Lactone: 3.1,
  "Carboxylic acid": 2.4,
  Amide: 1.5,
  Carbamate: 1.3,
  Carboxylate: 0.5,
};

export type LeavingGroupSite = {
  score: number;
  label: string;
  carbonIndex: number | null;
  substitution: number;
  benzylicOrAllylic: boolean;
  arylOrVinylic: boolean;
  betaHydrogenCount: number;
};

export type SubstitutionSummary = {
  leavingGroup: LeavingGroupSite | null;
  carbonyl: NamedEffect;
};

export function findBestLeavingGroupSite(
  graph: ParsedMol,
  names: string[],
): LeavingGroupSite | null {
  const aromatic = aromaticAtomSet(graph);
  let best: LeavingGroupSite | null = null;

  for (const atom of graph.atoms) {
    const lgScore = HALOGEN_LG_SCORE[atom.element];
    if (!lgScore) continue;
    for (const bond of graph.adjacency.get(atom.atomIndex) ?? []) {
      const carbonIndex = otherAtom(bond, atom.atomIndex);
      if (graph.atoms[carbonIndex]?.element !== "C") continue;
      const substitution = carbonNeighborCount(graph, carbonIndex);
      const arylOrVinylic =
        aromatic.has(carbonIndex) ||
        (graph.adjacency.get(carbonIndex) ?? []).some(
          (candidate) =>
            candidate.bondOrder === 2 &&
            graph.atoms[otherAtom(candidate, carbonIndex)]?.element === "C",
        );
      const benzylicOrAllylic =
        !arylOrVinylic &&
        (graph.adjacency.get(carbonIndex) ?? []).some((candidate) => {
          const neighbor = otherAtom(candidate, carbonIndex);
          if (
            neighbor === atom.atomIndex ||
            graph.atoms[neighbor]?.element !== "C"
          ) {
            return false;
          }
          return aromatic.has(neighbor) || isPiAdjacent(graph, neighbor, carbonIndex);
        });
      let betaHydrogenCount = 0;
      for (const candidate of graph.adjacency.get(carbonIndex) ?? []) {
        const beta = otherAtom(candidate, carbonIndex);
        if (
          beta === atom.atomIndex ||
          graph.atoms[beta]?.element !== "C"
        ) {
          continue;
        }
        betaHydrogenCount += implicitCarbonHydrogens(graph, beta);
      }
      const site: LeavingGroupSite = {
        score: lgScore,
        label: `${atom.element} leaving group`,
        carbonIndex,
        substitution,
        benzylicOrAllylic,
        arylOrVinylic,
        betaHydrogenCount,
      };
      if (!best || site.score > best.score) best = site;
    }
  }

  const groupFallbacks: Array<[string, number, string]> = [
    ["Sulfonate ester", 4.8, "sulfonate ester"],
    ["Sulfonyl chloride", 4.6, "sulfonyl chloride"],
    ["Acyl halide", 4.5, "acyl halide"],
  ];
  for (const [group, score, label] of groupFallbacks) {
    if (names.includes(group) && (!best || score > best.score)) {
      best = {
        score,
        label,
        carbonIndex: null,
        substitution: 0,
        benzylicOrAllylic: false,
        arylOrVinylic: false,
        betaHydrogenCount: 0,
      };
    }
  }
  return best;
}

function applyNucleophilicityMetric(
  metrics: Record<ComparisonModeId, ComparisonMetric>,
  graph: ParsedMol,
  names: string[],
) {
  let bestScore = 0;
  let bestLabel = "No strong nucleophilic site detected";

  for (const atom of graph.atoms) {
    const base =
      atom.element === "S"
        ? 3.8
        : atom.element === "N"
          ? 3.4
          : atom.element === "O"
            ? 2.8
            : atom.element === "C" && atom.charge < 0
              ? 2.2
              : 0;
    if (base === 0) continue;
    let score = base;
    if (atom.charge < 0) score += 3;
    if (atom.charge > 0) score -= 4;
    if (score > bestScore) {
      bestScore = score;
      bestLabel = `${atom.element} at atom ${atom.atomIndex + 1}`;
    }
  }

  if (names.some((name) => ["Amide", "Sulfonamide"].includes(name))) {
    bestScore -= 1.2;
  }
  if (names.includes("Pyrrole")) bestScore -= 1.5;
  if (names.includes("Carboxylate")) bestScore = Math.max(bestScore, 3.6);
  if (names.includes("Cyanide")) bestScore = Math.max(bestScore, 5.2);
  if (names.includes("Acetylide anion")) bestScore = Math.max(bestScore, 5.4);

  metrics.nucleophilicity = metric(
    bestScore > 0 ? bestScore : null,
    bestScore > 0
      ? `${bestLabel} · score ${bestScore.toFixed(1)}`
      : "No strong nucleophile detected",
    "Higher score reflects an anionic or available lone-pair site with less resonance deactivation. Solvent and sterics can change real nucleophilicity.",
  );
}

export function applySubstitutionMetrics(
  metrics: Record<ComparisonModeId, ComparisonMetric>,
  graph: ParsedMol,
  names: string[],
  strongestEwg: NamedEffect,
): SubstitutionSummary {
  applyNucleophilicityMetric(metrics, graph, names);

  const leavingGroup = findBestLeavingGroupSite(graph, names);
  if (leavingGroup) {
    const substitutionBonus =
      leavingGroup.substitution >= 3
        ? 4
        : leavingGroup.substitution === 2
          ? 2.5
          : leavingGroup.substitution === 1
            ? 1.2
            : 0.4;
    const resonanceBonus = leavingGroup.benzylicOrAllylic ? 3 : 0;
    const arylPenalty = leavingGroup.arylOrVinylic ? 6 : 0;
    const sn1 =
      leavingGroup.score * 2 + substitutionBonus + resonanceBonus - arylPenalty;
    const sn2Steric =
      leavingGroup.substitution === 0
        ? 5
        : leavingGroup.substitution === 1
          ? 4
          : leavingGroup.substitution === 2
            ? 2
            : 0;
    const sn2 =
      leavingGroup.score * 2 +
      sn2Steric +
      (leavingGroup.benzylicOrAllylic ? 2 : 0) -
      arylPenalty;
    const siteDescription =
      leavingGroup.carbonIndex === null
        ? leavingGroup.label
        : `${leavingGroup.label} at C${leavingGroup.carbonIndex + 1} (${leavingGroup.substitution} carbon substituent${leavingGroup.substitution === 1 ? "" : "s"})`;

    metrics.leavingGroupAbility = metric(
      leavingGroup.score,
      `${leavingGroup.label} · ${leavingGroup.score.toFixed(1)}/5`,
      "Higher score corresponds to a better conventional leaving group under comparable conditions.",
    );
    metrics.sn1Reactivity = metric(
      sn1,
      siteDescription,
      "SN1 score combines leaving-group ability with substitution/resonance stabilization and strongly penalizes aryl/vinylic leaving-group carbons.",
    );
    metrics.sn2Reactivity = metric(
      sn2,
      siteDescription,
      "SN2 score rewards good leaving groups and low steric congestion; benzylic/allylic sites receive an accessibility/resonance bonus.",
    );
  }

  const carbonyl = strongestNamedEffect(names, CARBONYL_REACTIVITY_WEIGHTS);
  metrics.carbonylReactivity = metric(
    carbonyl.score || null,
    carbonyl.name
      ? `${carbonyl.name} · ${carbonyl.score.toFixed(1)}/6`
      : "No reactive carbonyl detected",
    "Qualitative order reflects carbonyl electrophilicity and leaving-group effects for acyl derivatives.",
  );
  const formalPositive = graph.atoms.filter((atom) => atom.charge > 0).length;
  const electrophileScore =
    formalPositive * 5 + carbonyl.score + strongestEwg.score * 0.8;
  metrics.electrophilicity = metric(
    electrophileScore > 0 ? electrophileScore : null,
    formalPositive > 0
      ? `${formalPositive} positively charged center(s)`
      : carbonyl.name ?? strongestEwg.name ?? "No strong electrophile detected",
    "Higher score reflects formal positive charge, reactive carbonyls and strong electron-withdrawing activation.",
  );

  return { leavingGroup, carbonyl };
}
