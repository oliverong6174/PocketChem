import { getRDKit } from "../../rdkit";
import type { MassSpectrumPeak } from "../types";
import {
  buildChargedFragmentMolBlock,
  componentElementCount,
  connectedComponentsAfterBondRemoval,
  nominalMassForComponent,
  parseV2000MassGraph,
} from "./molGraph";
import { describeCleavagePathway, estimateParentIonPropensity, scoreCleavagePathway } from "./fragmentScoring";
import type { MassGraph } from "./fragmentTypes";

export type GeneralFragmentationResult = {
  peaks: MassSpectrumPeak[];
  parentIonPropensity: number;
};

function bondLabel(graph: MassGraph, bondIndex: number) {
  const bond = graph.bonds[bondIndex];
  if (!bond) return "bond cleavage";
  return `${graph.atoms[bond.a]?.symbol ?? "?"}–${graph.atoms[bond.b]?.symbol ?? "?"} cleavage`;
}

async function fragmentSmilesFromMolBlock(molBlock: string | null) {
  if (!molBlock) return undefined;
  const rdkit = await getRDKit();
  let mol: any = null;
  try {
    mol = rdkit.get_mol(molBlock);
    const smiles = mol?.get_smiles?.();
    return typeof smiles === "string" && smiles.trim() ? smiles.trim() : undefined;
  } catch {
    return undefined;
  } finally {
    mol?.delete?.();
  }
}

function fragmentIsotopeCompanions(
  graph: MassGraph,
  component: number[],
  peak: MassSpectrumPeak,
) {
  const companions: MassSpectrumPeak[] = [];
  const bromines = componentElementCount(graph, component, "Br");
  const chlorines = componentElementCount(graph, component, "Cl");

  if (bromines === 1) {
    companions.push({
      ...peak,
      mz: peak.mz + 2,
      relativeIntensity: peak.relativeIntensity * (0.4931 / 0.5069),
      label: `${peak.label} · ⁸¹Br isotope`,
      explanation: `${peak.explanation} This fragment retains one bromine atom, so it also produces the characteristic nearly 1:1 M/M+2 fragment-isotope partner.`,
    });
  } else if (chlorines === 1) {
    companions.push({
      ...peak,
      mz: peak.mz + 2,
      relativeIntensity: peak.relativeIntensity * (0.2424 / 0.7576),
      label: `${peak.label} · ³⁷Cl isotope`,
      explanation: `${peak.explanation} This fragment retains one chlorine atom, so it also produces the characteristic ~3:1 M/M+2 fragment-isotope partner.`,
    });
  }
  return companions;
}

export async function predictGeneralFragmentation(parentSmiles: string | null): Promise<GeneralFragmentationResult> {
  if (!parentSmiles) return { peaks: [], parentIonPropensity: 30 };

  const rdkit = await getRDKit();
  let parent: any = null;
  try {
    parent = rdkit.get_mol(parentSmiles);
    const molBlock = parent?.get_molblock?.();
    if (typeof molBlock !== "string") return { peaks: [], parentIonPropensity: 30 };
    const graph = parseV2000MassGraph(molBlock);
    if (!graph) return { peaks: [], parentIonPropensity: 30 };

    const peaks: MassSpectrumPeak[] = [];
    for (const bond of graph.bonds) {
      if (bond.order !== 1) continue;
      const atomA = graph.atoms[bond.a];
      const atomB = graph.atoms[bond.b];
      if (!atomA || !atomB || atomA.symbol === "H" || atomB.symbol === "H") continue;

      const split = connectedComponentsAfterBondRemoval(graph, bond.index);
      if (!split) continue;
      const [componentA, componentB] = split;

      const orientations = [
        { chargeCenter: bond.a, ion: componentA, neutral: componentB },
        { chargeCenter: bond.b, ion: componentB, neutral: componentA },
      ];

      for (const orientation of orientations) {
        const mz = nominalMassForComponent(graph, orientation.ion);
        if (mz === null || mz < 15) continue;
        const pathwayScore = scoreCleavagePathway(
          graph,
          bond.index,
          orientation.chargeCenter,
          orientation.ion,
          orientation.neutral,
        );
        // A nonlinear response better reflects how EI spectra concentrate intensity
        // into the most stabilized fragmentation channels instead of making every
        // formally possible cleavage appear comparably strong.
        const rawScore = Math.max(2, Math.min(145, 85 * Math.pow(pathwayScore / 6, 2.35)));
        if (rawScore <= 0) continue;

        const fragmentMolBlock = buildChargedFragmentMolBlock(graph, orientation.ion, orientation.chargeCenter);
        const fragmentSmiles = await fragmentSmilesFromMolBlock(fragmentMolBlock);
        const label = `m/z ${mz} · ${bondLabel(graph, bond.index)}`;
        const explanation = describeCleavagePathway(graph, bond.index, orientation.chargeCenter, orientation.ion);
        const peak: MassSpectrumPeak = {
          mz,
          relativeIntensity: rawScore,
          label,
          kind: "fragment",
          explanation,
          fragmentSmiles,
          previewStructure: fragmentSmiles,
          previewLabel: label,
          pathwayCount: 1,
          contributors: [{ label, explanation, fragmentSmiles }],
        };
        peaks.push(peak, ...fragmentIsotopeCompanions(graph, orientation.ion, peak));
      }
    }

    return {
      peaks,
      parentIonPropensity: estimateParentIonPropensity(graph),
    };
  } catch (error) {
    console.warn("General EI fragmentation failed:", error);
    return { peaks: [], parentIonPropensity: 30 };
  } finally {
    parent?.delete?.();
  }
}
