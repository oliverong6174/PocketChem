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
    // The Kekule form in a mol block can hide a ring from the alternation test (one ring of naphthalene was read as an alkene), so the
    // aromatic atoms RDKit perceives from the input are added. Atom indices of the mol block equal those of the molecule.
    {
      const query = RDKit.get_qmol("[a]");
      try {
        if (query) {
          const parsed = JSON.parse(mol.get_substruct_matches(query));
          const list: Array<{ atoms: number[] }> = Array.isArray(parsed) ? parsed : parsed?.atoms ? [parsed] : [];
          for (const match of list) for (const atom of match.atoms) aromaticAtoms.add(atom);
        }
      } finally {
        query?.delete?.();
      }
    }
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

    // A monosubstituted ring shows one overlapping aryl multiplet only while the substituent barely perturbs the ring protons. When the
    // predicted ortho/meta/para shifts spread by more than this, they are separate signals (phenol, aniline, anisole, nitrobenzene,
    // benzonitrile, benzoate esters), so the ring is not collapsed. Toluene and other alkylbenzenes stay one multiplet.
    const AROMATIC_COLLAPSE_SPREAD_PPM = 0.2;
    const aromaticSpread = new Map<number, number>();
    // Identical rings (benzophenone, biphenyl) share one signal set: a collapsed ring is keyed by the sorted fingerprints of its CH atoms.
    const aromaticSignature = new Map<number, string>();
    {
      const centers = new Map<number, number[]>();
      const fingerprintsByComponent = new Map<number, string[]>();
      for (const environment of environments.filter((item) => item.proton?.label === "aromatic C–H")) {
        const component = aromaticComponentAtoms(graph, environment.atomIndex, aromaticAtoms);
        const componentId = component.size > 0 ? Math.min(...component) : environment.atomIndex;
        const list = centers.get(componentId) ?? [];
        list.push(environment.proton!.shiftCenter);
        centers.set(componentId, list);
        const prints = fingerprintsByComponent.get(componentId) ?? [];
        prints.push(String(environment.fingerprint));
        fingerprintsByComponent.set(componentId, prints);
      }
      for (const [componentId, prints] of fingerprintsByComponent) aromaticSignature.set(componentId, [...prints].sort().join(","));
      for (const [componentId, list] of centers) aromaticSpread.set(componentId, Math.max(...list) - Math.min(...list));
    }

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
        const collapseComponent = (attachmentCount === 1 && (aromaticSpread.get(componentId) ?? 0) < AROMATIC_COLLAPSE_SPREAD_PPM)
          || aromaticComponentHasExternalBridge(graph, component);
        const key = collapseComponent
          ? `aromatic-component|${aromaticSignature.get(componentId) ?? componentId}`
          : `aromatic|${environment.fingerprint}`;
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
