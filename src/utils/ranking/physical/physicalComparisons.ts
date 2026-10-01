import type { ParsedMol } from "../../nomenclature/types";
import type { BoilingPointRankingResult } from "./boilingPoint";
import type { SolubilityRankingResult } from "./solubility";
import type { ComparisonMetric, ComparisonModeId } from "../comparisonTypes";
import { carbonNeighborCount, emptyMetric, metric, type DelocalizationSummary, type NamedEffect } from "../comparisonUtils";

export type PhysicalDescriptorInputs = {
  molecularWeight: number | null;
  tpsa: number | null;
  logP: number | null;
  hbd: number | null;
  hba: number | null;
  rotatableBonds: number | null;
  ringCount: number | null;
};

export type PhysicalSummary = {
  heavyAtoms: number;
  branching: number;
  rigidityScore: number;
};

export function applyPhysicalMetrics(
  metrics: Record<ComparisonModeId, ComparisonMetric>,
  graph: ParsedMol,
  counts: Map<string, number>,
  descriptors: PhysicalDescriptorInputs,
  delocalization: DelocalizationSummary,
  strongestEwg: NamedEffect,
  carbonyl: NamedEffect,
  boiling: BoilingPointRankingResult | null,
  solubility: SolubilityRankingResult | null,
): PhysicalSummary {
  metrics.boilingPoint = boiling
    ? metric(
        boiling.boilingPointScore,
        `${boiling.tendency} · score ${boiling.boilingPointScore.toFixed(1)}`,
        boiling.explanation,
        boiling.factors,
      )
    : emptyMetric("Boiling-point tendency could not be estimated.");
  metrics.solubility = solubility
    ? metric(
        solubility.waterSolubilityScore,
        `${solubility.tendency} · score ${solubility.waterSolubilityScore.toFixed(1)}`,
        solubility.explanation,
        solubility.factors,
      )
    : emptyMetric("Water-solubility tendency could not be estimated.");

  const formalCharge = graph.atoms.reduce((sum, atom) => sum + atom.charge, 0);
  const heavyAtoms = graph.atoms.filter((atom) => atom.element !== "H").length;
  const carbonAtoms = graph.atoms.filter((atom) => atom.element === "C").length;
  const heteroAtoms = heavyAtoms - carbonAtoms;
  const branching = graph.atoms.filter(
    (atom) =>
      atom.element === "C" && carbonNeighborCount(graph, atom.atomIndex) >= 3,
  ).length;

  const polarityScore =
    (descriptors.tpsa ?? heteroAtoms * 12) +
    Math.abs(formalCharge) * 45 -
    Math.max(0, descriptors.logP ?? 0) * 4;
  metrics.polarity = metric(
    polarityScore,
    descriptors.tpsa !== null
      ? `TPSA ${descriptors.tpsa.toFixed(1)} Å²${descriptors.logP !== null ? ` · logP ${descriptors.logP.toFixed(2)}` : ""}`
      : `polarity proxy ${polarityScore.toFixed(1)}`,
    "Higher TPSA/charge and lower hydrophobicity increase this qualitative polarity score.",
  );
  metrics.lipophilicity =
    descriptors.logP !== null
      ? metric(
          descriptors.logP,
          `logP ${descriptors.logP.toFixed(2)}`,
          "Higher logP indicates greater lipophilicity in the current RDKit descriptor model.",
        )
      : emptyMetric("RDKit logP was unavailable.");

  const hbScore = (descriptors.hbd ?? 0) * 2 + (descriptors.hba ?? 0);
  metrics.hydrogenBonding = metric(
    hbScore,
    `${descriptors.hbd ?? 0} donor(s) · ${descriptors.hba ?? 0} acceptor(s)`,
    "Donors receive extra weight because they contribute directly to intermolecular hydrogen-bond donation.",
  );
  const dipoleScore = polarityScore + strongestEwg.score * 4 + carbonyl.score * 3;
  metrics.dipoleTendency = metric(
    dipoleScore,
    `dipole proxy ${dipoleScore.toFixed(1)}`,
    "This is a qualitative proxy from polar surface area, charge and strongly polar functional groups; it is not a calculated dipole moment.",
  );
  const halogenPolarizability =
    (counts.get("I") ?? 0) * 8 +
    (counts.get("Br") ?? 0) * 5 +
    (counts.get("Cl") ?? 0) * 3;
  const dispersionScore =
    (descriptors.molecularWeight ?? heavyAtoms * 12) + halogenPolarizability;
  metrics.dispersionTendency = metric(
    dispersionScore,
    descriptors.molecularWeight !== null
      ? `MW ${descriptors.molecularWeight.toFixed(1)}`
      : `${heavyAtoms} heavy atoms`,
    "Larger, more polarizable electron clouds generally strengthen London dispersion forces.",
  );

  const rigidityScore =
    (descriptors.ringCount ?? 0) * 2.5 +
    delocalization.piBonds * 1.1 -
    (descriptors.rotatableBonds ?? 0) * 1.2;
  const meltingScore =
    rigidityScore +
    hbScore * 1.2 +
    Math.abs(formalCharge) * 5 +
    polarityScore * 0.03 -
    branching * 0.6;
  metrics.meltingPoint = metric(
    meltingScore,
    `packing tendency ${meltingScore.toFixed(1)}`,
    "Higher rigidity, hydrogen bonding and ionic character raise this qualitative crystal-packing score; branching/flexibility reduce it.",
  );

  return { heavyAtoms, branching, rigidityScore };
}
