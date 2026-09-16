import { getRDKit } from "../rdkit";
import { getOtherAtom, parseMolBlock } from "../nomenclature/molParser";
import type { ParsedMol } from "../nomenclature/types";
import type { CNMRSignal, HNMRSignal } from "./types";

type CarbonEnvironment = {
  atomIndex: number;
  hydrogens: number;
  shiftCenter: number;
  range: string;
  label: string;
  explanation: string;
  fingerprint: string;
};

function isAromaticCHLabel(label: string) {
  return label === "aromatic C–H";
}

function isAromaticQuaternaryLabel(label: string) {
  return label === "aromatic quaternary carbon";
}

function isAromaticCarbonLabel(label: string) {
  return isAromaticCHLabel(label) || isAromaticQuaternaryLabel(label);
}

function bondOrderSum(graph: ParsedMol, atomIndex: number) {
  return (graph.adjacency.get(atomIndex) ?? []).reduce(
    (sum, bond) => sum + bond.bondOrder,
    0,
  );
}

function inferredCarbonHydrogens(graph: ParsedMol, atomIndex: number) {
  const atom = graph.atoms[atomIndex];
  if (!atom || atom.element !== "C") return 0;
  const remaining = 4 - bondOrderSum(graph, atomIndex) - Math.max(0, atom.charge);
  return Math.max(0, Math.round(remaining));
}

function bondBetween(graph: ParsedMol, atomA: number, atomB: number) {
  return (graph.adjacency.get(atomA) ?? []).find(
    (bond) => getOtherAtom(bond, atomA) === atomB,
  );
}

function cycleKey(cycle: number[]) {
  return [...cycle].sort((a, b) => a - b).join("-");
}

function simpleCycles(graph: ParsedMol, ringSizes: readonly number[]) {
  const allowedSizes = new Set(ringSizes);
  const maxSize = Math.max(...ringSizes);
  const cycles = new Map<string, number[]>();

  const visit = (start: number, current: number, path: number[], seen: Set<number>) => {
    if (path.length > maxSize) return;
    for (const bond of graph.adjacency.get(current) ?? []) {
      const next = getOtherAtom(bond, current);
      if (next === start) {
        if (allowedSizes.has(path.length)) cycles.set(cycleKey(path), [...path]);
        continue;
      }
      if (seen.has(next) || path.length >= maxSize) continue;
      const nextSeen = new Set(seen);
      nextSeen.add(next);
      visit(start, next, [...path, next], nextSeen);
    }
  };

  for (const atom of graph.atoms) {
    visit(atom.atomIndex, atom.atomIndex, [atom.atomIndex], new Set([atom.atomIndex]));
  }
  return [...cycles.values()];
}

function aromaticLikeRing(graph: ParsedMol, cycle: number[]) {
  const elements = cycle.map((atomIndex) => graph.atoms[atomIndex]?.element ?? "");
  if (elements.some((element) => !["C", "N", "O", "S"].includes(element))) return false;

  const ringBonds = cycle.map((atomIndex, index) =>
    bondBetween(graph, atomIndex, cycle[(index + 1) % cycle.length]),
  );
  if (ringBonds.some((bond) => !bond)) return false;
  const orders = ringBonds.map((bond) => bond?.bondOrder ?? 0);
  if (orders.every((order) => order === 1.5)) return true;

  const doubleCount = orders.filter((order) => order === 2).length;
  if (cycle.length === 6 && doubleCount === 3) {
    return cycle.every((_, index) => {
      const previous = orders[(index + orders.length - 1) % orders.length];
      const next = orders[index];
      return Number(previous === 2) + Number(next === 2) === 1;
    });
  }

  if (cycle.length === 5 && doubleCount === 2 && elements.some((element) => element !== "C")) {
    return true;
  }
  return false;
}

function aromaticAtomSet(graph: ParsedMol) {
  const result = new Set<number>();
  for (const cycle of simpleCycles(graph, [5, 6])) {
    if (!aromaticLikeRing(graph, cycle)) continue;
    cycle.forEach((atomIndex) => result.add(atomIndex));
  }
  return result;
}

function aromaticComponentAtoms(graph: ParsedMol, atomIndex: number, aromaticAtoms: Set<number>) {
  if (!aromaticAtoms.has(atomIndex)) return new Set<number>();
  const visited = new Set<number>([atomIndex]);
  const queue = [atomIndex];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const bond of graph.adjacency.get(current) ?? []) {
      const neighbor = getOtherAtom(bond, current);
      if (!aromaticAtoms.has(neighbor) || visited.has(neighbor)) continue;
      visited.add(neighbor);
      queue.push(neighbor);
    }
  }
  return visited;
}

function aromaticExternalAttachmentAtoms(
  graph: ParsedMol,
  component: Set<number>,
) {
  const attachments = new Set<number>();
  for (const atomIndex of component) {
    for (const bond of graph.adjacency.get(atomIndex) ?? []) {
      const neighbor = getOtherAtom(bond, atomIndex);
      if (component.has(neighbor)) continue;
      if (graph.atoms[neighbor]?.element === "H") continue;
      attachments.add(neighbor);
    }
  }
  return attachments;
}

function aromaticComponentHasExternalBridge(
  graph: ParsedMol,
  component: Set<number>,
) {
  const attachments = [...aromaticExternalAttachmentAtoms(graph, component)];
  if (attachments.length < 2) return false;
  const targets = new Set(attachments.slice(1));
  const visited = new Set<number>([attachments[0]]);
  const queue = [attachments[0]];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (targets.has(current)) return true;
    for (const bond of graph.adjacency.get(current) ?? []) {
      const neighbor = getOtherAtom(bond, current);
      if (component.has(neighbor) || visited.has(neighbor)) continue;
      visited.add(neighbor);
      queue.push(neighbor);
    }
  }
  return false;
}

function aromaticCarbonylAnchors(graph: ParsedMol, aromaticAtoms: Set<number>) {
  const anchors = new Set<number>();
  for (const atomIndex of aromaticAtoms) {
    for (const bond of graph.adjacency.get(atomIndex) ?? []) {
      if (bond.bondOrder !== 1) continue;
      const neighbor = getOtherAtom(bond, atomIndex);
      if (aromaticAtoms.has(neighbor) || graph.atoms[neighbor]?.element !== "C") continue;
      if (isCarbonylCarbon(graph, neighbor)) anchors.add(atomIndex);
    }
  }
  return anchors;
}

function aromaticRingDistance(
  graph: ParsedMol,
  start: number,
  target: number,
  aromaticAtoms: Set<number>,
) {
  if (start === target) return 0;
  const visited = new Set<number>([start]);
  let frontier = [start];
  for (let distance = 1; distance <= 4; distance += 1) {
    const next: number[] = [];
    for (const current of frontier) {
      for (const bond of graph.adjacency.get(current) ?? []) {
        const neighbor = getOtherAtom(bond, current);
        if (!aromaticAtoms.has(neighbor) || visited.has(neighbor)) continue;
        if (neighbor === target) return distance;
        visited.add(neighbor);
        next.push(neighbor);
      }
    }
    frontier = next;
  }
  return null;
}

function aromaticCarbonylShiftAdjustment(
  graph: ParsedMol,
  atomIndex: number,
  aromaticAtoms: Set<number>,
) {
  let adjustment = 0;
  for (const anchor of aromaticCarbonylAnchors(graph, aromaticAtoms)) {
    const distance = aromaticRingDistance(graph, atomIndex, anchor, aromaticAtoms);
    if (distance === 1) adjustment += 0.75;
    else if (distance === 2) adjustment += 0.40;
    else if (distance === 3) adjustment += 0.20;
  }
  return Math.min(1.30, adjustment);
}

function hydroxyOxygenGroups(graph: ParsedMol, fingerprints: string[]) {
  const acid = new Map<string, number[]>();
  const alcohol = new Map<string, number[]>();

  for (const oxygen of graph.atoms.filter((atom) => atom.element === "O" && atom.charge === 0)) {
    const bonds = graph.adjacency.get(oxygen.atomIndex) ?? [];
    if (bonds.length !== 1 || bonds[0]?.bondOrder !== 1) continue;
    const attachedIndex = getOtherAtom(bonds[0], oxygen.atomIndex);
    const attached = graph.atoms[attachedIndex];
    if (!attached || attached.element !== "C") continue;

    const key = fingerprints[oxygen.atomIndex] ?? `O-${oxygen.atomIndex}`;
    const target = isCarbonylCarbon(graph, attachedIndex) ? acid : alcohol;
    const group = target.get(key) ?? [];
    group.push(oxygen.atomIndex);
    target.set(key, group);
  }

  return { acid, alcohol };
}

function distanceToAromatic(graph: ParsedMol, atomIndex: number, aromaticAtoms: Set<number>, maxDistance = 3) {
  if (aromaticAtoms.has(atomIndex)) return 0;
  const visited = new Set<number>([atomIndex]);
  let frontier = [atomIndex];
  for (let distance = 1; distance <= maxDistance; distance += 1) {
    const nextFrontier: number[] = [];
    for (const current of frontier) {
      for (const bond of graph.adjacency.get(current) ?? []) {
        const neighbor = getOtherAtom(bond, current);
        if (visited.has(neighbor)) continue;
        if (aromaticAtoms.has(neighbor)) return distance;
        visited.add(neighbor);
        nextFrontier.push(neighbor);
      }
    }
    frontier = nextFrontier;
  }
  return null;
}

function hasBondOrder(graph: ParsedMol, atomIndex: number, order: number) {
  return (graph.adjacency.get(atomIndex) ?? []).some((bond) => bond.bondOrder === order);
}

function attachedElements(graph: ParsedMol, atomIndex: number) {
  return (graph.adjacency.get(atomIndex) ?? []).map((bond) => graph.atoms[getOtherAtom(bond, atomIndex)]?.element ?? "");
}

function isCarbonylCarbon(graph: ParsedMol, atomIndex: number) {
  return (graph.adjacency.get(atomIndex) ?? []).some((bond) => {
    if (bond.bondOrder !== 2) return false;
    return graph.atoms[getOtherAtom(bond, atomIndex)]?.element === "O";
  });
}

function isCarbonylAdjacent(graph: ParsedMol, atomIndex: number) {
  return (graph.adjacency.get(atomIndex) ?? []).some((bond) => {
    if (bond.bondOrder !== 1) return false;
    const neighborIndex = getOtherAtom(bond, atomIndex);
    return graph.atoms[neighborIndex]?.element === "C" && isCarbonylCarbon(graph, neighborIndex);
  });
}

function isBenzylic(graph: ParsedMol, atomIndex: number, aromaticAtoms: Set<number>) {
  return (graph.adjacency.get(atomIndex) ?? []).some((bond) =>
    bond.bondOrder === 1 && aromaticAtoms.has(getOtherAtom(bond, atomIndex)),
  );
}

function isAllylic(graph: ParsedMol, atomIndex: number, aromaticAtoms: Set<number>) {
  return (graph.adjacency.get(atomIndex) ?? []).some((bond) => {
    if (bond.bondOrder !== 1) return false;
    const neighbor = getOtherAtom(bond, atomIndex);
    return !aromaticAtoms.has(neighbor) && hasBondOrder(graph, neighbor, 2);
  });
}

function betaAromaticShiftAdjustment(graph: ParsedMol, atomIndex: number, aromaticAtoms: Set<number>) {
  let adjustment = 0;
  for (const bond of graph.adjacency.get(atomIndex) ?? []) {
    if (bond.bondOrder !== 1) continue;
    const neighbor = getOtherAtom(bond, atomIndex);
    if (graph.atoms[neighbor]?.element !== "C" || !isBenzylic(graph, neighbor, aromaticAtoms)) continue;
    const neighborHydrogens = inferredCarbonHydrogens(graph, neighbor);
    if (neighborHydrogens === 1) adjustment = Math.max(adjustment, 0.18);
    else if (neighborHydrogens === 2) adjustment = Math.min(adjustment, -0.08);
  }
  return adjustment;
}

function iterativeFingerprints(graph: ParsedMol) {
  let labels = graph.atoms.map((atom) => {
    const bonds = graph.adjacency.get(atom.atomIndex) ?? [];
    const bondSignature = bonds.map((bond) => bond.bondOrder).sort((a, b) => a - b).join(",");
    return `${atom.element}|${atom.charge}|${bonds.length}|${bondSignature}`;
  });

  for (let round = 0; round < 4; round += 1) {
    const nextRaw = graph.atoms.map((atom) => {
      const neighbors = (graph.adjacency.get(atom.atomIndex) ?? [])
        .map((bond) => `${bond.bondOrder}:${labels[getOtherAtom(bond, atom.atomIndex)]}`)
        .sort()
        .join(";");
      return `${labels[atom.atomIndex]}[${neighbors}]`;
    });

    const unique = [...new Set(nextRaw)].sort();
    const ids = new Map(unique.map((label, index) => [label, String(index)]));
    labels = nextRaw.map((label) => ids.get(label) ?? label);
  }

  return labels;
}

function classifyCarbon(graph: ParsedMol, atomIndex: number, fingerprint: string, aromaticAtoms: Set<number>): CarbonEnvironment {
  const hydrogens = inferredCarbonHydrogens(graph, atomIndex);
  const neighbors = graph.adjacency.get(atomIndex) ?? [];
  const elements = attachedElements(graph, atomIndex);
  const aromatic = aromaticAtoms.has(atomIndex);
  const carbonyl = isCarbonylCarbon(graph, atomIndex);
  const triple = hasBondOrder(graph, atomIndex, 3);
  const double = hasBondOrder(graph, atomIndex, 2);

  if (carbonyl) {
    const hasHydrogen = hydrogens > 0;
    const hasHeteroSingleBond = neighbors.some((bond) => {
      if (bond.bondOrder !== 1) return false;
      const element = graph.atoms[getOtherAtom(bond, atomIndex)]?.element;
      return element === "O" || element === "N" || element === "S";
    });

    if (hasHydrogen) {
      return { atomIndex, hydrogens, shiftCenter: 9.8, range: "9.0–10.5 ppm", label: "aldehydic proton", explanation: "A proton directly attached to an aldehyde carbonyl carbon is strongly deshielded.", fingerprint };
    }

    if (hasHeteroSingleBond) {
      return { atomIndex, hydrogens, shiftCenter: 170, range: "160–185 ppm", label: "carboxylic-acid derivative carbonyl", explanation: "Carbonyl carbons bonded to O/N/S usually appear below aldehyde/ketone carbonyls in ¹³C NMR.", fingerprint };
    }

    return { atomIndex, hydrogens, shiftCenter: 205, range: "190–220 ppm", label: "aldehyde/ketone carbonyl", explanation: "A ketone/aldehyde carbonyl carbon is strongly deshielded in ¹³C NMR.", fingerprint };
  }

  if (aromatic) {
    const carbonylAdjustment = hydrogens > 0
      ? aromaticCarbonylShiftAdjustment(graph, atomIndex, aromaticAtoms)
      : 0;
    const shiftCenter = hydrogens > 0 ? 7.15 + carbonylAdjustment : 135;
    const range = hydrogens > 0
      ? carbonylAdjustment >= 0.9
        ? "7.8–8.6 ppm"
        : carbonylAdjustment >= 0.35
          ? "7.3–8.2 ppm"
          : "6.7–8.2 ppm"
      : "110–160 ppm";
    return {
      atomIndex,
      hydrogens,
      shiftCenter,
      range,
      label: hydrogens > 0 ? "aromatic C–H" : "aromatic quaternary carbon",
      explanation: hydrogens > 0
        ? carbonylAdjustment > 0
          ? "Aromatic ring-current effects place aryl protons downfield; nearby ring-attached carbonyl substituents add further ortho/meta deshielding."
          : "Aromatic ring-current effects place aryl protons near 7 ppm; fused-ring substitution can spread the individual lines into an overlapping multiplet."
        : "An aromatic ring-junction or substituted carbon has no attached proton but remains in the aromatic ¹³C region.",
      fingerprint,
    };
  }

  if (triple) {
    return { atomIndex, hydrogens, shiftCenter: hydrogens > 0 ? 2.5 : 80, range: hydrogens > 0 ? "1.7–3.2 ppm" : "65–95 ppm", label: hydrogens > 0 ? "terminal alkyne proton" : "alkyne carbon", explanation: hydrogens > 0 ? "An sp C–H proton is moderately deshielded." : "sp-hybridized alkyne carbons typically appear in this ¹³C region.", fingerprint };
  }

  if (double) {
    return { atomIndex, hydrogens, shiftCenter: hydrogens > 0 ? 5.4 : 125, range: hydrogens > 0 ? "4.5–6.5 ppm" : "100–160 ppm", label: hydrogens > 0 ? "vinylic proton" : "alkene carbon", explanation: hydrogens > 0 ? "Vinylic protons lie in the alkene anisotropy region." : "sp² alkene carbons commonly appear between about 100 and 160 ppm.", fingerprint };
  }

  if (elements.some((element) => ["O", "N", "F", "Cl", "Br", "I"].includes(element))) {
    return { atomIndex, hydrogens, shiftCenter: hydrogens > 0 ? 3.5 : 60, range: hydrogens > 0 ? "2.5–4.5 ppm" : "35–90 ppm", label: "C–H next to heteroatom/halogen", explanation: "Electronegative substituents withdraw electron density and shift nearby nuclei downfield.", fingerprint };
  }

  if (isCarbonylAdjacent(graph, atomIndex)) {
    return { atomIndex, hydrogens, shiftCenter: hydrogens > 0 ? 2.35 : 35, range: hydrogens > 0 ? "2.0–3.0 ppm" : "20–50 ppm", label: "α to carbonyl", explanation: "The carbonyl group deshields nuclei on the alpha carbon.", fingerprint };
  }

  if (isBenzylic(graph, atomIndex, aromaticAtoms)) {
    const shiftCenter = hydrogens === 1 ? 2.95 : hydrogens === 2 ? 2.65 : hydrogens === 3 ? 2.30 : 35;
    return { atomIndex, hydrogens, shiftCenter, range: hydrogens > 0 ? "2.2–3.3 ppm" : "20–50 ppm", label: "benzylic", explanation: "A carbon directly adjacent to an aromatic π system is deshielded; benzylic methine protons usually lie farther downfield than benzylic methylene protons.", fingerprint };
  }

  if (isAllylic(graph, atomIndex, aromaticAtoms)) {
    const shiftCenter = hydrogens === 1 ? 2.15 : hydrogens === 2 ? 2.05 : hydrogens === 3 ? 1.85 : 30;
    return { atomIndex, hydrogens, shiftCenter, range: hydrogens > 0 ? "1.6–2.6 ppm" : "20–50 ppm", label: "allylic", explanation: "A saturated carbon adjacent to a non-aromatic C=C bond is moderately deshielded by the neighboring π system.", fingerprint };
  }

  const aromaticDistance = distanceToAromatic(graph, atomIndex, aromaticAtoms);
  if (hydrogens > 0 && aromaticDistance === 2) {
    const base = hydrogens === 3 ? 1.02 : hydrogens === 2 ? 1.72 : 1.88;
    const adjustment = hydrogens === 3 ? 0.02 : betaAromaticShiftAdjustment(graph, atomIndex, aromaticAtoms);
    return {
      atomIndex,
      hydrogens,
      shiftCenter: base + adjustment,
      range: hydrogens === 3 ? "0.8–1.4 ppm" : "1.3–2.2 ppm",
      label: "β to aromatic ring",
      explanation: "This saturated carbon is one bond beyond a benzylic site. The aromatic ring still shifts it modestly downfield, with local substitution differentiating otherwise similar ring methylenes.",
      fingerprint,
    };
  }

  if (hydrogens > 0) {
    const shiftCenter = hydrogens === 3 ? 0.95 : hydrogens === 2 ? 1.40 : 1.60;
    const range = hydrogens === 3 ? "0.7–1.3 ppm" : hydrogens === 2 ? "1.0–1.9 ppm" : "1.2–2.1 ppm";
    const label = hydrogens === 3 ? "alkyl methyl" : hydrogens === 2 ? "alkyl methylene" : "alkyl methine";
    return { atomIndex, hydrogens, shiftCenter, range, label, explanation: "Saturated alkyl protons appear upfield; methyl, methylene, and methine environments are assigned separate default centers before local structural modifiers are applied.", fingerprint };
  }

  return { atomIndex, hydrogens, shiftCenter: 25, range: "0–50 ppm", label: "alkyl carbon", explanation: "Saturated alkyl carbons typically appear in the upfield portion of the ¹³C spectrum.", fingerprint };
}

function multiplicityFromNeighborHydrogens(graph: ParsedMol, atomIndices: number[]) {
  const sourceSet = new Set(atomIndices);
  const signatures: number[][] = [];

  for (const atomIndex of atomIndices) {
    const neighborCounts: number[] = [];
    for (const bond of graph.adjacency.get(atomIndex) ?? []) {
      if (bond.bondOrder !== 1) continue;
      const neighbor = getOtherAtom(bond, atomIndex);
      if (sourceSet.has(neighbor) || graph.atoms[neighbor]?.element !== "C") continue;
      const hydrogens = inferredCarbonHydrogens(graph, neighbor);
      if (hydrogens > 0) neighborCounts.push(hydrogens);
    }
    signatures.push(neighborCounts.sort((a, b) => a - b));
  }

  if (signatures.length === 0 || signatures.every((counts) => counts.length === 0)) return "singlet";

  const sourceHydrogens = atomIndices.length
    ? Math.round(atomIndices.reduce((sum, atomIndex) => sum + inferredCarbonHydrogens(graph, atomIndex), 0) / atomIndices.length)
    : 0;

  // Methine protons coupled to more than one neighboring proton set are usually
  // visibly complex. For methylene groups, a 1H + 2H neighborhood is commonly
  // taught as an approximate quartet, while two separate CH2 neighbors are safer
  // to report as a multiplet because the couplings are rarely truly equivalent.
  if (signatures.some((counts) => counts.length > 1)) {
    const representative = signatures[0] ?? [];
    if (sourceHydrogens === 2 && representative.length === 2 && representative[0] === 1 && representative[1] === 2) {
      return "quartet";
    }
    return "multiplet";
  }

  const nValues = signatures.map((counts) => counts[0] ?? 0);
  if (nValues.some((value) => value !== nValues[0])) return "multiplet";

  const n = nValues[0] ?? 0;
  if (n <= 0) return "singlet";
  if (n === 1) return "doublet";
  if (n === 2) return "triplet";
  if (n === 3) return "quartet";
  if (n === 4) return "quintet";
  if (n === 5) return "sextet";
  if (n === 6) return "septet";
  return "multiplet";
}

export async function predictStructureNMR(smilesOrMolfile: string): Promise<{
  protonNMR: HNMRSignal[];
  carbonNMR: CNMRSignal[];
}> {
  const RDKit = await getRDKit();
  const mol = RDKit.get_mol(smilesOrMolfile);
  if (!mol) return { protonNMR: [], carbonNMR: [] };

  try {
    const graph = parseMolBlock(mol.get_molblock());
    const fingerprints = iterativeFingerprints(graph);
    const aromaticAtoms = aromaticAtomSet(graph);
    const environments = graph.atoms
      .filter((atom) => atom.element === "C")
      .map((atom) => classifyCarbon(graph, atom.atomIndex, fingerprints[atom.atomIndex] ?? "", aromaticAtoms));

    const carbonGroups = new Map<string, CarbonEnvironment[]>();
    for (const environment of environments) {
      const key = `${environment.fingerprint}|${environment.range}|${environment.label}`;
      const group = carbonGroups.get(key) ?? [];
      group.push(environment);
      carbonGroups.set(key, group);
    }

    const carbonNMR: CNMRSignal[] = [...carbonGroups.values()]
      .map((group) => {
        const first = group[0];
        const center = isAromaticQuaternaryLabel(first.label) ? 135
          : isAromaticCHLabel(first.label) ? 128
          : first.label.includes("vinylic") ? 125
          : first.label.includes("alkyne") ? 80
          : first.label.includes("heteroatom") ? 60
          : first.label.includes("aldehydic") || first.label.includes("aldehyde/ketone") ? 200
          : first.label.includes("carboxylic") ? 170
          : first.label.includes("carbonyl") ? 170
          : first.label.includes("benzylic") || first.label.includes("allylic") || first.label.includes("α") ? 35
          : first.label.includes("β to aromatic") ? 28
          : first.label.includes("alkyl methyl") ? 18
          : first.label.includes("alkyl methylene") ? 28
          : first.label.includes("alkyl methine") ? 35
          : first.shiftCenter >= 12 ? first.shiftCenter : 25;
        const range = isAromaticCarbonLabel(first.label) ? "110–160 ppm"
          : first.label.includes("vinylic") ? "100–160 ppm"
          : first.label.includes("alkyne") ? "65–95 ppm"
          : first.label.includes("heteroatom") ? "35–90 ppm"
          : first.label.includes("aldehydic") || first.label.includes("aldehyde/ketone") ? "190–220 ppm"
          : first.label.includes("carboxylic") ? "160–185 ppm"
          : first.label.includes("carbonyl") ? "160–220 ppm"
          : first.label.includes("benzylic") || first.label.includes("allylic") || first.label.includes("α") || first.label.includes("β to aromatic") ? "20–50 ppm"
          : "0–50 ppm";
        return {
          shift: range,
          shiftCenter: center,
          carbonCount: group.length,
          atomIndices: group.map((item) => item.atomIndex),
          sourceGroup: first.label,
          explanation: `${first.explanation} ${group.length > 1 ? `${group.length} symmetry-equivalent carbons are grouped.` : "One distinct carbon environment is predicted."}`,
        };
      })
      .sort((a, b) => (b.shiftCenter ?? 0) - (a.shiftCenter ?? 0));

    const protonGroups = new Map<string, CarbonEnvironment[]>();
    const aromaticGroupWasCollapsed = new Map<string, boolean>();
    for (const environment of environments.filter((item) => item.hydrogens > 0)) {
      if (isAromaticCHLabel(environment.label)) {
        const component = aromaticComponentAtoms(graph, environment.atomIndex, aromaticAtoms);
        const componentId = component.size > 0 ? Math.min(...component) : environment.atomIndex;
        const attachmentCount = aromaticExternalAttachmentAtoms(graph, component).size;
        // A monosubstituted arene is normally reported as one overlapping aromatic
        // multiplet. Fused aromatic/saturated systems are treated similarly because
        // their individual aryl lines strongly overlap. Independently disubstituted
        // rings retain graph-equivalent proton classes so symmetric A2B2 patterns can
        // resolve into two distinct signals.
        const collapseComponent = attachmentCount <= 1 || aromaticComponentHasExternalBridge(graph, component);
        const key = collapseComponent
          ? `aromatic-component-${componentId}`
          : `aromatic-${componentId}|${environment.fingerprint}|${environment.range}`;
        const group = protonGroups.get(key) ?? [];
        group.push(environment);
        protonGroups.set(key, group);
        aromaticGroupWasCollapsed.set(key, collapseComponent);
        continue;
      }

      const key = `${environment.fingerprint}|${environment.range}|${environment.label}|H${environment.hydrogens}`;
      const group = protonGroups.get(key) ?? [];
      group.push(environment);
      protonGroups.set(key, group);
    }

    const carbonBoundSignals: HNMRSignal[] = [...protonGroups.entries()]
      .map(([key, group]) => {
        const first = group[0];
        const protonCount = group.reduce((sum, item) => sum + item.hydrogens, 0);
        const atomIndices = group.map((item) => item.atomIndex);
        const aromatic = isAromaticCHLabel(first.label);
        const collapsedAromatic = aromaticGroupWasCollapsed.get(key) ?? false;
        const multiplicity = aromatic
          ? !collapsedAromatic && protonCount === 2
            ? "doublet"
            : "multiplet"
          : first.label === "vinylic proton"
            ? "multiplet"
            : multiplicityFromNeighborHydrogens(graph, atomIndices);
        const shiftCenter = group.reduce((sum, item) => sum + item.shiftCenter, 0) / group.length;
        return {
          shift: first.range,
          shiftCenter,
          multiplicity,
          integration: `${protonCount}H`,
          protonCount,
          atomIndices,
          sourceGroup: first.label,
          explanation: `${first.explanation} ${aromatic && !collapsedAromatic && protonCount === 2 ? "A symmetric disubstituted aromatic environment gives an approximate two-proton doublet in this teaching model." : "Multiplicity is estimated from the local proton environment using a simplified first-order model."}`,
        };
      });

    // Exchangeable O-H protons are determined from the molecular graph rather than
    // appended from functional-group labels. This prevents carboxylic-acid OH atoms
    // from being misread as generic alcohol protons at 0 ppm.
    const hydroxylGroups = hydroxyOxygenGroups(graph, fingerprints);
    const exchangeableSignals: HNMRSignal[] = [];

    for (const atomIndices of hydroxylGroups.acid.values()) {
      const protonCount = atomIndices.length;
      exchangeableSignals.push({
        shift: "10.5–13.5 ppm",
        shiftCenter: 13.0,
        multiplicity: "singlet",
        integration: `${protonCount}H`,
        protonCount,
        atomIndices,
        sourceGroup: "carboxylic acid O–H",
        explanation: "Carboxylic-acid O-H protons are strongly deshielded and exchangeable, commonly appearing as a broad singlet around 10.5–13.5 ppm.",
      });
    }

    for (const atomIndices of hydroxylGroups.alcohol.values()) {
      const protonCount = atomIndices.length;
      exchangeableSignals.push({
        shift: "0.5–5 ppm",
        shiftCenter: 2.5,
        multiplicity: "broad singlet",
        integration: `${protonCount}H`,
        protonCount,
        atomIndices,
        sourceGroup: "alcohol O–H",
        explanation: "Alcohol O-H protons are exchangeable; hydrogen bonding and solvent conditions can move them over a broad chemical-shift range.",
      });
    }

    const protonNMR = [...carbonBoundSignals, ...exchangeableSignals]
      .sort((a, b) => (b.shiftCenter ?? 0) - (a.shiftCenter ?? 0));

    return { protonNMR, carbonNMR };
  } finally {
    mol.delete?.();
  }
}
