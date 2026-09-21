import { getRDKit } from "../rdkit";
import { parseMolBlock } from "../nomenclature/molParser";
import type { CNMRSignal, HNMRSignal } from "./types";
import {
  aromaticAtomSet,
  aromaticComponentAtoms,
  aromaticComponentHasExternalBridge,
  aromaticExternalAttachmentAtoms,
  classifyCarbon,
  iterativeFingerprints,
  multiplicityFromNeighborHydrogens,
  predictExchangeableSignals,
  type CarbonEnvironment,
} from "./nmrEnvironment";

export async function predictStructureNMR(smilesOrMolfile: string): Promise<{
  protonNMR: HNMRSignal[];
  carbonNMR: CNMRSignal[];
}> {
  const RDKit = await getRDKit();
  const mol = RDKit.get_mol(smilesOrMolfile);
  if (!mol) return { protonNMR: [], carbonNMR: [] };

  try {
    const graph = parseMolBlock(mol.get_molblock());
    const aromaticAtoms = aromaticAtomSet(graph);
    const fingerprints = iterativeFingerprints(graph, aromaticAtoms);
    const environments = graph.atoms
      .filter((atom) => atom.element === "C")
      .map((atom) => classifyCarbon(
        graph,
        atom.atomIndex,
        fingerprints[atom.atomIndex] ?? "",
        aromaticAtoms,
      ));

    const carbonGroups = new Map<string, CarbonEnvironment[]>();
    for (const environment of environments) {
      const key = `${environment.fingerprint}|${environment.carbon.label}|${environment.carbon.range}`;
      const group = carbonGroups.get(key) ?? [];
      group.push(environment);
      carbonGroups.set(key, group);
    }

    const carbonNMR: CNMRSignal[] = [...carbonGroups.values()]
      .map((group) => {
        const first = group[0];
        const shiftCenter = group.reduce(
          (sum, environment) => sum + environment.carbon.shiftCenter,
          0,
        ) / group.length;

        return {
          shift: first.carbon.range,
          shiftCenter,
          carbonCount: group.length,
          atomIndices: group.map((item) => item.atomIndex),
          sourceGroup: first.carbon.label,
          explanation: `${first.carbon.explanation} ${group.length > 1 ? `${group.length} graph-equivalent carbons are grouped.` : "One distinct carbon environment is predicted."}`,
        };
      })
      .sort((a, b) => (b.shiftCenter ?? 0) - (a.shiftCenter ?? 0));

    const protonGroups = new Map<string, CarbonEnvironment[]>();
    const aromaticGroupWasCollapsed = new Map<string, boolean>();

    for (const environment of environments.filter((item) => item.proton !== null)) {
      const proton = environment.proton!;

      if (proton.label === "aromatic C–H") {
        const component = aromaticComponentAtoms(graph, environment.atomIndex, aromaticAtoms);
        const componentId = component.size > 0 ? Math.min(...component) : environment.atomIndex;
        const attachmentCount = aromaticExternalAttachmentAtoms(graph, component).size;

        // Monosubstituted arenes and fused aromatic/saturated systems often show
        // several heavily overlapping aryl lines.  Keep those as one teaching-level
        // multiplet, but retain distinct graph-equivalent classes for disubstituted
        // and more substituted rings so A2B2 patterns resolve correctly.
        const collapseComponent = attachmentCount === 1
          || aromaticComponentHasExternalBridge(graph, component);
        const key = collapseComponent
          ? `aromatic-component-${componentId}`
          : `aromatic-${componentId}|${environment.fingerprint}`;
        const group = protonGroups.get(key) ?? [];
        group.push(environment);
        protonGroups.set(key, group);
        aromaticGroupWasCollapsed.set(key, collapseComponent);
        continue;
      }

      const key = `${environment.fingerprint}|${proton.label}|H${environment.hydrogens}`;
      const group = protonGroups.get(key) ?? [];
      group.push(environment);
      protonGroups.set(key, group);
    }

    const carbonBoundSignals: HNMRSignal[] = [...protonGroups.entries()]
      .map(([key, group]) => {
        const first = group[0];
        const firstProton = first.proton!;
        const protonCount = group.reduce((sum, item) => sum + item.hydrogens, 0);
        const atomIndices = group.map((item) => item.atomIndex);
        const collapsedAromatic = aromaticGroupWasCollapsed.get(key) ?? false;
        const multiplicity = collapsedAromatic
          ? "multiplet"
          : multiplicityFromNeighborHydrogens(
            graph,
            atomIndices,
            fingerprints,
            aromaticAtoms,
          );
        const shiftCenter = group.reduce(
          (sum, item) => sum + (item.proton?.shiftCenter ?? firstProton.shiftCenter),
          0,
        ) / group.length;

        return {
          shift: firstProton.range,
          shiftCenter,
          multiplicity,
          integration: `${protonCount}H`,
          protonCount,
          atomIndices,
          sourceGroup: firstProton.label,
          explanation: `${firstProton.explanation} ${collapsedAromatic ? "Overlapping aromatic environments are intentionally represented as one multiplet." : "Multiplicity is estimated from graph-equivalent neighboring proton sets; n+1 is used only when one equivalent neighboring set is present."}`,
        };
      });

    const exchangeableSignals = predictExchangeableSignals(
      graph,
      fingerprints,
      aromaticAtoms,
    );

    const protonNMR = [...carbonBoundSignals, ...exchangeableSignals]
      .sort((a, b) => (b.shiftCenter ?? 0) - (a.shiftCenter ?? 0));

    return { protonNMR, carbonNMR };
  } finally {
    mol.delete?.();
  }
}
