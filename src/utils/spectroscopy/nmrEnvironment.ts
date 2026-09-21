import { getOtherAtom } from "../nomenclature/molParser";
import type { ParsedMol } from "../nomenclature/types";
import type { HNMRSignal } from "./types";

type ShiftEstimate = {
  shiftCenter: number;
  range: string;
  label: string;
  explanation: string;
};

export type CarbonEnvironment = {
  atomIndex: number;
  hydrogens: number;
  fingerprint: string;
  proton: ShiftEstimate | null;
  carbon: ShiftEstimate;
};

type ExchangeableSite = {
  atomIndex: number;
  protonCount: number;
  fingerprint: string;
  shiftCenter: number;
  range: string;
  sourceGroup: string;
  explanation: string;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
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

  // The molecular graph normally contains implicit carbon hydrogens.  Carbon's
  // ordinary valence is four; positive carbon charge lowers the number of
  // hydrogens that can be inferred from the heavy-atom bond order sum.
  const remaining = 4 - bondOrderSum(graph, atomIndex) - Math.max(0, atom.charge);
  return clamp(Math.round(remaining), 0, 4);
}

function inferredNitrogenHydrogens(graph: ParsedMol, atomIndex: number) {
  const atom = graph.atoms[atomIndex];
  if (!atom || atom.element !== "N") return 0;

  const targetValence = atom.charge > 0 ? 4 : 3;
  return clamp(Math.round(targetValence - bondOrderSum(graph, atomIndex)), 0, 3);
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

  const visit = (
    start: number,
    current: number,
    path: number[],
    seen: Set<number>,
  ) => {
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
    visit(
      atom.atomIndex,
      atom.atomIndex,
      [atom.atomIndex],
      new Set([atom.atomIndex]),
    );
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

  return cycle.length === 5
    && doubleCount === 2
    && elements.some((element) => element !== "C");
}

export function aromaticAtomSet(graph: ParsedMol) {
  const result = new Set<number>();
  for (const cycle of simpleCycles(graph, [5, 6])) {
    if (!aromaticLikeRing(graph, cycle)) continue;
    cycle.forEach((atomIndex) => result.add(atomIndex));
  }
  return result;
}

export function aromaticComponentAtoms(
  graph: ParsedMol,
  atomIndex: number,
  aromaticAtoms: Set<number>,
) {
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

export function aromaticExternalAttachmentAtoms(
  graph: ParsedMol,
  component: Set<number>,
) {
  const attachments = new Set<number>();
  for (const atomIndex of component) {
    for (const bond of graph.adjacency.get(atomIndex) ?? []) {
      const neighbor = getOtherAtom(bond, atomIndex);
      if (component.has(neighbor) || graph.atoms[neighbor]?.element === "H") continue;
      attachments.add(neighbor);
    }
  }
  return attachments;
}

export function aromaticComponentHasExternalBridge(
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

function aromaticRingDistance(
  graph: ParsedMol,
  start: number,
  target: number,
  aromaticAtoms: Set<number>,
) {
  if (start === target) return 0;

  const visited = new Set<number>([start]);
  let frontier = [start];
  for (let distance = 1; distance <= 6; distance += 1) {
    const nextFrontier: number[] = [];
    for (const current of frontier) {
      for (const bond of graph.adjacency.get(current) ?? []) {
        const neighbor = getOtherAtom(bond, current);
        if (!aromaticAtoms.has(neighbor) || visited.has(neighbor)) continue;
        if (neighbor === target) return distance;
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
    return graph.atoms[neighborIndex]?.element === "C"
      && isCarbonylCarbon(graph, neighborIndex);
  });
}

function isBenzylic(
  graph: ParsedMol,
  atomIndex: number,
  aromaticAtoms: Set<number>,
) {
  return (graph.adjacency.get(atomIndex) ?? []).some(
    (bond) => bond.bondOrder === 1 && aromaticAtoms.has(getOtherAtom(bond, atomIndex)),
  );
}

function isAllylic(
  graph: ParsedMol,
  atomIndex: number,
  aromaticAtoms: Set<number>,
) {
  return (graph.adjacency.get(atomIndex) ?? []).some((bond) => {
    if (bond.bondOrder !== 1) return false;
    const neighbor = getOtherAtom(bond, atomIndex);
    return !aromaticAtoms.has(neighbor) && hasBondOrder(graph, neighbor, 2);
  });
}

function distanceToAromatic(
  graph: ParsedMol,
  atomIndex: number,
  aromaticAtoms: Set<number>,
  maxDistance = 3,
) {
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

function betaHeteroatomElements(graph: ParsedMol, atomIndex: number) {
  const elements = new Set<string>();

  for (const bond of graph.adjacency.get(atomIndex) ?? []) {
    if (bond.bondOrder !== 1) continue;
    const neighbor = getOtherAtom(bond, atomIndex);
    if (graph.atoms[neighbor]?.element !== "C") continue;

    for (const secondBond of graph.adjacency.get(neighbor) ?? []) {
      if (secondBond.bondOrder !== 1) continue;
      const secondNeighbor = getOtherAtom(secondBond, neighbor);
      if (secondNeighbor === atomIndex) continue;
      const element = graph.atoms[secondNeighbor]?.element ?? "";
      if (["O", "N", "S", "F", "Cl", "Br", "I"].includes(element)) {
        elements.add(element);
      }
    }
  }

  return elements;
}

function normalizedBondOrderForEquivalence(
  atomA: number,
  atomB: number,
  rawBondOrder: number,
  aromaticAtoms: Set<number>,
) {
  // RDKit molblocks can encode an aromatic ring in one arbitrary Kekulé form
  // (alternating single/double bonds).  Those bond-order choices must not split
  // symmetry-equivalent aromatic atoms into false NMR environments.
  if (aromaticAtoms.has(atomA) && aromaticAtoms.has(atomB)) return 1.5;
  return rawBondOrder;
}

export function iterativeFingerprints(graph: ParsedMol, aromaticAtoms: Set<number>) {
  let labels = graph.atoms.map((atom) => {
    const bonds = graph.adjacency.get(atom.atomIndex) ?? [];
    const bondSignature = bonds
      .map((bond) => normalizedBondOrderForEquivalence(
        atom.atomIndex,
        getOtherAtom(bond, atom.atomIndex),
        bond.bondOrder,
        aromaticAtoms,
      ))
      .sort((a, b) => a - b)
      .join(",");
    const implicitHydrogens = atom.element === "C"
      ? inferredCarbonHydrogens(graph, atom.atomIndex)
      : atom.element === "N"
        ? inferredNitrogenHydrogens(graph, atom.atomIndex)
        : 0;
    return `${atom.element}|${atom.charge}|H${implicitHydrogens}|${bonds.length}|${bondSignature}`;
  });

  const maximumRounds = Math.max(6, graph.atoms.length);
  for (let round = 0; round < maximumRounds; round += 1) {
    const nextRaw = graph.atoms.map((atom) => {
      const neighbors = (graph.adjacency.get(atom.atomIndex) ?? [])
        .map((bond) => {
          const neighbor = getOtherAtom(bond, atom.atomIndex);
          const order = normalizedBondOrderForEquivalence(
            atom.atomIndex,
            neighbor,
            bond.bondOrder,
            aromaticAtoms,
          );
          return `${order}:${labels[neighbor]}`;
        })
        .sort()
        .join(";");
      return `${labels[atom.atomIndex]}[${neighbors}]`;
    });

    const unique = [...new Set(nextRaw)].sort();
    const ids = new Map(unique.map((label, index) => [label, String(index)]));
    const nextLabels = nextRaw.map((label) => ids.get(label) ?? label);

    if (nextLabels.every((label, index) => label === labels[index])) {
      labels = nextLabels;
      break;
    }
    labels = nextLabels;
  }

  return labels;
}

type AromaticSubstituentClass =
  | "oxygen-donor"
  | "nitrogen-donor"
  | "alkyl"
  | "carbonyl-withdrawing"
  | "nitrile-withdrawing"
  | "halogen"
  | "alpha-heteroalkyl"
  | "other";

function aromaticSubstituentClass(
  graph: ParsedMol,
  externalAtomIndex: number,
): AromaticSubstituentClass {
  const atom = graph.atoms[externalAtomIndex];
  if (!atom) return "other";

  if (atom.element === "O") return "oxygen-donor";
  if (atom.element === "N") return "nitrogen-donor";
  if (["F", "Cl", "Br", "I"].includes(atom.element)) return "halogen";

  if (atom.element === "C") {
    if (isCarbonylCarbon(graph, externalAtomIndex)) return "carbonyl-withdrawing";
    const nitrile = (graph.adjacency.get(externalAtomIndex) ?? []).some((bond) => {
      if (bond.bondOrder !== 3) return false;
      return graph.atoms[getOtherAtom(bond, externalAtomIndex)]?.element === "N";
    });
    if (nitrile) return "nitrile-withdrawing";

    // A benzylic carbon bearing O/N/S/halogen is not electronically equivalent
    // to a plain alkyl substituent.  This distinction is especially important
    // in 13C NMR, where the ortho aryl carbons are measurably deshielded.
    const alphaHetero = (graph.adjacency.get(externalAtomIndex) ?? []).some((bond) => {
      if (bond.bondOrder !== 1) return false;
      const neighbor = graph.atoms[getOtherAtom(bond, externalAtomIndex)]?.element ?? "";
      return ["O", "N", "S", "F", "Cl", "Br", "I"].includes(neighbor);
    });
    return alphaHetero ? "alpha-heteroalkyl" : "alkyl";
  }

  return "other";
}

function aromaticSubstituentContribution(
  substituentClass: AromaticSubstituentClass,
  ringDistance: number,
) {
  const position = ringDistance === 1 ? "ortho"
    : ringDistance === 2 ? "meta"
      : ringDistance === 3 ? "para"
        : "remote";

  const values: Record<AromaticSubstituentClass, Record<typeof position, number>> = {
    "oxygen-donor": { ortho: -0.42, meta: -0.08, para: -0.30, remote: 0 },
    "nitrogen-donor": { ortho: -0.34, meta: -0.05, para: -0.24, remote: 0 },
    alkyl: { ortho: -0.08, meta: 0, para: -0.05, remote: 0 },
    "carbonyl-withdrawing": { ortho: 0.55, meta: 0.25, para: 0.38, remote: 0 },
    "nitrile-withdrawing": { ortho: 0.45, meta: 0.22, para: 0.34, remote: 0 },
    halogen: { ortho: 0.08, meta: 0.03, para: 0.02, remote: 0 },
    // Keep the proton model conservative for now; the stronger distinction is
    // needed in the 13C model below.
    "alpha-heteroalkyl": { ortho: -0.08, meta: 0, para: -0.05, remote: 0 },
    other: { ortho: 0.10, meta: 0.04, para: 0.06, remote: 0 },
  };

  return values[substituentClass][position];
}

function aromaticProtonShiftAdjustment(
  graph: ParsedMol,
  atomIndex: number,
  aromaticAtoms: Set<number>,
) {
  const component = aromaticComponentAtoms(graph, atomIndex, aromaticAtoms);
  let adjustment = 0;

  for (const ringAtom of component) {
    if (ringAtom === atomIndex) continue;
    const distance = aromaticRingDistance(graph, atomIndex, ringAtom, aromaticAtoms);
    if (distance === null || distance > 3) continue;

    for (const bond of graph.adjacency.get(ringAtom) ?? []) {
      const externalAtom = getOtherAtom(bond, ringAtom);
      if (component.has(externalAtom)) continue;
      adjustment += aromaticSubstituentContribution(
        aromaticSubstituentClass(graph, externalAtom),
        distance,
      );
    }
  }

  return clamp(adjustment, -0.85, 1.35);
}

function aromaticProtonRange(center: number) {
  if (center >= 8.0) return "7.6–8.8 ppm";
  if (center <= 6.85) return "6.3–7.5 ppm";
  return "6.6–8.2 ppm";
}

function aromaticCarbonSubstituentContribution(
  substituentClass: AromaticSubstituentClass,
  ringDistance: number,
) {
  if (substituentClass === "oxygen-donor") {
    if (ringDistance === 1) return -12;
    if (ringDistance === 2) return 1;
    if (ringDistance === 3) return -7;
  }
  if (substituentClass === "nitrogen-donor") {
    if (ringDistance === 1) return -10;
    if (ringDistance === 2) return 1;
    if (ringDistance === 3) return -6;
  }
  if (substituentClass === "alkyl") {
    if (ringDistance === 1) return -1;
    if (ringDistance === 3) return -1;
  }
  if (substituentClass === "carbonyl-withdrawing") {
    if (ringDistance === 1) return 3;
    if (ringDistance === 2) return 1;
    if (ringDistance === 3) return 2;
  }
  if (substituentClass === "nitrile-withdrawing") {
    if (ringDistance === 1) return 2;
    if (ringDistance === 2) return 1;
    if (ringDistance === 3) return 2;
  }
  if (substituentClass === "halogen") {
    if (ringDistance === 1) return -2;
    if (ringDistance === 2) return 1;
  }
  if (substituentClass === "alpha-heteroalkyl") {
    // Saturated benzylic C-X/C-O/C-N substituents are inductively withdrawing.
    // Their largest 13C effect is on the ortho aryl carbons, while the meta
    // effect is small.
    if (ringDistance === 1) return 4;
    if (ringDistance === 2) return 0.5;
    if (ringDistance === 3) return 1;
  }
  return 0;
}

function aromaticCarbonShiftCenter(
  graph: ParsedMol,
  atomIndex: number,
  hydrogens: number,
  aromaticAtoms: Set<number>,
) {
  const component = aromaticComponentAtoms(graph, atomIndex, aromaticAtoms);

  if (hydrogens <= 0) {
    const directClasses = (graph.adjacency.get(atomIndex) ?? [])
      .map((bond) => getOtherAtom(bond, atomIndex))
      .filter((neighbor) => !component.has(neighbor))
      .map((neighbor) => aromaticSubstituentClass(graph, neighbor));

    let directBase = directClasses.includes("oxygen-donor") ? 155
      : directClasses.includes("nitrogen-donor") ? 150
        : directClasses.includes("alpha-heteroalkyl") ? 138
          : directClasses.includes("alkyl") ? 138
            : directClasses.includes("carbonyl-withdrawing") ? 136
              : directClasses.includes("nitrile-withdrawing") ? 133
                : directClasses.includes("halogen") ? 130
                  : 135;

    // The previous model returned immediately for substituted aryl carbons, so
    // it completely ignored every *other* substituent on the ring.  Remote
    // substituent effects are real but smaller than the direct ipso effect, so
    // apply a damped correction rather than treating the carbon as isolated.
    let remoteAdjustment = 0;
    for (const ringAtom of component) {
      if (ringAtom === atomIndex) continue;
      const distance = aromaticRingDistance(graph, atomIndex, ringAtom, aromaticAtoms);
      if (distance === null || distance > 3) continue;
      for (const bond of graph.adjacency.get(ringAtom) ?? []) {
        const externalAtom = getOtherAtom(bond, ringAtom);
        if (component.has(externalAtom)) continue;
        remoteAdjustment += 0.5 * aromaticCarbonSubstituentContribution(
          aromaticSubstituentClass(graph, externalAtom),
          distance,
        );
      }
    }

    directBase += remoteAdjustment;
    return clamp(directBase, 110, 160);
  }

  let adjustment = 0;
  for (const ringAtom of component) {
    if (ringAtom === atomIndex) continue;
    const distance = aromaticRingDistance(graph, atomIndex, ringAtom, aromaticAtoms);
    if (distance === null || distance > 3) continue;

    for (const bond of graph.adjacency.get(ringAtom) ?? []) {
      const externalAtom = getOtherAtom(bond, ringAtom);
      if (component.has(externalAtom)) continue;
      adjustment += aromaticCarbonSubstituentContribution(
        aromaticSubstituentClass(graph, externalAtom),
        distance,
      );
    }
  }

  return clamp(128 + adjustment, 110, 155);
}

function directHeteroatomClass(graph: ParsedMol, atomIndex: number) {
  const elements = new Set<string>();
  for (const bond of graph.adjacency.get(atomIndex) ?? []) {
    if (bond.bondOrder !== 1) continue;
    const element = graph.atoms[getOtherAtom(bond, atomIndex)]?.element ?? "";
    if (["O", "N", "S", "F", "Cl", "Br", "I"].includes(element)) {
      elements.add(element);
    }
  }

  if (elements.has("O")) return "O";
  if (elements.has("N")) return "N";
  if (elements.has("S")) return "S";
  if ([...elements].some((element) => ["F", "Cl", "Br", "I"].includes(element))) {
    return "halogen";
  }
  return null;
}

type HalogenElement = "F" | "Cl" | "Br" | "I";

function directHalogenElement(graph: ParsedMol, atomIndex: number): HalogenElement | null {
  for (const bond of graph.adjacency.get(atomIndex) ?? []) {
    if (bond.bondOrder !== 1) continue;
    const element = graph.atoms[getOtherAtom(bond, atomIndex)]?.element;
    if (element === "F" || element === "Cl" || element === "Br" || element === "I") {
      return element;
    }
  }
  return null;
}

function halogenShiftBaselines(element: HalogenElement, hydrogens: number) {
  // C–X proton shifts depend strongly on the identity of X.  Treating F, Cl,
  // Br, and I as one generic "halogen" was too coarse, especially for
  // secondary benzylic bromides such as Ar–CH(Br)–CH2–R.
  const protonCenters: Record<HalogenElement, [number, number, number]> = {
    // [methine, methylene, methyl]
    F: [4.80, 4.50, 4.30],
    Cl: [4.10, 3.60, 3.45],
    Br: [4.10, 3.40, 3.25],
    I: [3.35, 3.10, 2.20],
  };
  const carbonCenters: Record<HalogenElement, [number, number, number]> = {
    F: [90, 82, 75],
    Cl: [58, 45, 40],
    Br: [50, 35, 30],
    I: [30, 15, 5],
  };
  const index = hydrogens === 1 ? 0 : hydrogens === 2 ? 1 : 2;
  return {
    protonCenter: protonCenters[element][index],
    carbonCenter: carbonCenters[element][index],
  };
}

function directHeteroatomShiftEstimate(
  graph: ParsedMol,
  atomIndex: number,
  hydrogens: number,
  directHetero: "O" | "N" | "S" | "halogen",
  aromaticAtoms: Set<number>,
) {
  const halogen = directHetero === "halogen"
    ? directHalogenElement(graph, atomIndex)
    : null;

  let protonCenter: number;
  let carbonCenter: number;
  let range: string;
  let carbonRange: string;
  let source: string;

  if (directHetero === "O") {
    protonCenter = hydrogens === 1 ? 4.05 : hydrogens === 2 ? 3.65 : 3.45;
    carbonCenter = hydrogens === 1 ? 72 : hydrogens === 2 ? 62 : 55;
    range = "3.1–4.8 ppm";
    carbonRange = "45–90 ppm";
    source = "O";
  } else if (directHetero === "N") {
    protonCenter = hydrogens === 1 ? 3.15 : 2.85;
    carbonCenter = 48;
    range = "2.2–4.5 ppm";
    carbonRange = "30–75 ppm";
    source = "N";
  } else if (directHetero === "S") {
    protonCenter = 2.65;
    carbonCenter = 40;
    range = "2.0–3.5 ppm";
    carbonRange = "20–60 ppm";
    source = "S";
  } else {
    const element = halogen ?? "Br";
    const baseline = halogenShiftBaselines(element, hydrogens);
    protonCenter = baseline.protonCenter;
    carbonCenter = baseline.carbonCenter;
    range = element === "F" ? "3.8–5.5 ppm"
      : element === "Cl" ? "3.0–4.8 ppm"
        : element === "Br" ? "2.8–4.8 ppm"
          : "1.8–4.0 ppm";
    carbonRange = element === "F" ? "65–105 ppm"
      : element === "Cl" ? "30–75 ppm"
        : element === "Br" ? "20–70 ppm"
          : "−10–50 ppm";
    source = element;
  }

  // Electronic effects are not mutually exclusive.  A carbon can be both
  // directly bonded to a heteroatom and benzylic/allylic.  The old decision
  // tree returned at the first match and therefore predicted Ar–CH(Br)–R as a
  // generic alkyl bromide (~3.4 ppm) instead of the much more downfield
  // benzylic bromide environment (~4.5–5.2 ppm).
  const benzylic = isBenzylic(graph, atomIndex, aromaticAtoms);
  const allylic = isAllylic(graph, atomIndex, aromaticAtoms);
  if (benzylic) {
    const protonAdjustment = directHetero === "O" ? 0.65
      : directHetero === "N" ? 0.45
        : directHetero === "S" ? 0.35
          : halogen === "F" ? 0.35
            : halogen === "Cl" ? 0.65
              : halogen === "Br" ? 0.80
                : 0.65;
    const carbonAdjustment = directHetero === "O" ? 4
      : directHetero === "N" ? 4
        : directHetero === "S" ? 3
          : halogen === "Br" ? 7
            : 5;
    protonCenter += protonAdjustment;
    carbonCenter += carbonAdjustment;
  } else if (allylic) {
    protonCenter += 0.20;
    carbonCenter += 2;
  }

  return {
    protonCenter,
    carbonCenter,
    range,
    carbonRange,
    source,
    benzylic,
    allylic,
  };
}

function saturatedAlkylCarbonBaseline(
  graph: ParsedMol,
  atomIndex: number,
  hydrogens: number,
  aromaticAtoms: Set<number>,
) {
  if (hydrogens !== 3) {
    return hydrogens === 2 ? 28 : hydrogens === 1 ? 38 : 30;
  }

  const carbonNeighbor = (graph.adjacency.get(atomIndex) ?? [])
    .map((bond) => getOtherAtom(bond, atomIndex))
    .find((neighbor) => graph.atoms[neighbor]?.element === "C");
  if (carbonNeighbor === undefined) return 14;
  if (aromaticAtoms.has(carbonNeighbor)) return 22;

  // 13C methyl shifts depend strongly on branching at the adjacent carbon.
  // A terminal n-alkyl methyl is near 14 ppm; methyls attached to methine or
  // quaternary carbons move progressively downfield.
  const neighborHydrogens = inferredCarbonHydrogens(graph, carbonNeighbor);
  if (neighborHydrogens >= 3) return 8;
  if (neighborHydrogens === 2) return 14;
  if (neighborHydrogens === 1) return 21;
  return 27;
}

export function classifyCarbon(
  graph: ParsedMol,
  atomIndex: number,
  fingerprint: string,
  aromaticAtoms: Set<number>,
): CarbonEnvironment {
  const hydrogens = inferredCarbonHydrogens(graph, atomIndex);
  const neighbors = graph.adjacency.get(atomIndex) ?? [];
  const aromatic = aromaticAtoms.has(atomIndex);
  const carbonyl = isCarbonylCarbon(graph, atomIndex);
  const triple = hasBondOrder(graph, atomIndex, 3);
  const double = hasBondOrder(graph, atomIndex, 2);

  if (carbonyl) {
    const hasHeteroSingleBond = neighbors.some((bond) => {
      if (bond.bondOrder !== 1) return false;
      const element = graph.atoms[getOtherAtom(bond, atomIndex)]?.element;
      return element === "O" || element === "N" || element === "S";
    });

    if (hydrogens > 0) {
      return {
        atomIndex,
        hydrogens,
        fingerprint,
        proton: {
          shiftCenter: 9.75,
          range: "9.0–10.5 ppm",
          label: "aldehydic proton",
          explanation: "A proton directly attached to an aldehyde carbonyl carbon is strongly deshielded by the C=O group.",
        },
        carbon: {
          shiftCenter: 195,
          range: "185–205 ppm",
          label: "aldehyde carbonyl",
          explanation: "Aldehyde carbonyl carbons occur far downfield in ¹³C NMR.",
        },
      };
    }

    if (hasHeteroSingleBond) {
      return {
        atomIndex,
        hydrogens,
        fingerprint,
        proton: null,
        carbon: {
          shiftCenter: 170,
          range: "160–185 ppm",
          label: "carboxylic-acid derivative carbonyl",
          explanation: "Carboxylic-acid derivative carbonyl carbons commonly appear around 160–185 ppm.",
        },
      };
    }

    return {
      atomIndex,
      hydrogens,
      fingerprint,
      proton: null,
      carbon: {
        shiftCenter: 205,
        range: "190–220 ppm",
        label: "ketone carbonyl",
        explanation: "Ketone carbonyl carbons are strongly deshielded in ¹³C NMR.",
      },
    };
  }

  if (aromatic) {
    const aromaticAdjustment = hydrogens > 0
      ? aromaticProtonShiftAdjustment(graph, atomIndex, aromaticAtoms)
      : 0;
    const protonCenter = 7.20 + aromaticAdjustment;
    return {
      atomIndex,
      hydrogens,
      fingerprint,
      proton: hydrogens > 0
        ? {
          shiftCenter: protonCenter,
          range: aromaticProtonRange(protonCenter),
          label: "aromatic C–H",
          explanation: aromaticAdjustment === 0
            ? "Aromatic ring-current effects place aryl protons near 7 ppm."
            : "The aromatic ring current sets the base shift, then ortho/meta/para substituent effects adjust this proton environment.",
        }
        : null,
      carbon: {
        shiftCenter: aromaticCarbonShiftCenter(graph, atomIndex, hydrogens, aromaticAtoms),
        range: "110–160 ppm",
        label: hydrogens > 0 ? "aromatic C–H carbon" : "aromatic substituted carbon",
        explanation: hydrogens > 0
          ? "A proton-bearing aromatic sp² carbon lies in the aromatic ¹³C region."
          : "A substituted or ring-junction aromatic carbon has no attached proton but remains in the aromatic ¹³C region.",
      },
    };
  }

  if (triple) {
    return {
      atomIndex,
      hydrogens,
      fingerprint,
      proton: hydrogens > 0
        ? {
          shiftCenter: 2.5,
          range: "1.7–3.2 ppm",
          label: "terminal alkyne proton",
          explanation: "A terminal sp C–H proton is moderately deshielded but remains upfield of vinylic protons.",
        }
        : null,
      carbon: {
        shiftCenter: hydrogens > 0 ? 72 : 82,
        range: "65–95 ppm",
        label: "alkyne carbon",
        explanation: "sp-hybridized alkyne carbons typically appear around 65–95 ppm.",
      },
    };
  }

  if (double) {
    return {
      atomIndex,
      hydrogens,
      fingerprint,
      proton: hydrogens > 0
        ? {
          shiftCenter: 5.4,
          range: "4.5–6.8 ppm",
          label: "vinylic proton",
          explanation: "Vinylic protons lie in the alkene anisotropy region; substitution and conjugation can move them substantially within it.",
        }
        : null,
      carbon: {
        shiftCenter: hydrogens > 0 ? 125 : 135,
        range: "100–160 ppm",
        label: "alkene carbon",
        explanation: "sp² alkene carbons commonly appear between about 100 and 160 ppm.",
      },
    };
  }

  const directHetero = directHeteroatomClass(graph, atomIndex);
  if (directHetero) {
    const estimate = directHeteroatomShiftEstimate(
      graph,
      atomIndex,
      hydrogens,
      directHetero,
      aromaticAtoms,
    );
    const combinedEnvironment = estimate.benzylic
      ? ` It is also benzylic, so the aromatic π system adds a second deshielding contribution.`
      : estimate.allylic
        ? ` It is also allylic, so the neighboring alkene adds a secondary deshielding contribution.`
        : "";

    return {
      atomIndex,
      hydrogens,
      fingerprint,
      proton: hydrogens > 0
        ? {
          shiftCenter: estimate.protonCenter,
          range: estimate.range,
          label: `C–H next to ${estimate.source}`,
          explanation: `A proton on a carbon directly bonded to ${estimate.source} is deshielded. Methine, methylene, and methyl sites use element-specific baseline positions.${combinedEnvironment}`,
        }
        : null,
      carbon: {
        shiftCenter: estimate.carbonCenter,
        range: estimate.carbonRange,
        label: `carbon next to ${estimate.source}`,
        explanation: `A saturated carbon directly bonded to ${estimate.source} is shifted downfield relative to a simple alkyl carbon.${combinedEnvironment}`,
      },
    };
  }

  if (isCarbonylAdjacent(graph, atomIndex)) {
    const protonCenter = hydrogens === 3 ? 2.15 : hydrogens === 2 ? 2.35 : 2.55;
    return {
      atomIndex,
      hydrogens,
      fingerprint,
      proton: hydrogens > 0
        ? {
          shiftCenter: protonCenter,
          range: "2.0–3.0 ppm",
          label: "α to carbonyl",
          explanation: "The carbonyl group deshields protons on the alpha carbon.",
        }
        : null,
      carbon: {
        shiftCenter: hydrogens === 3 ? 30 : 40,
        range: "20–55 ppm",
        label: "carbon α to carbonyl",
        explanation: "A saturated carbon alpha to C=O is shifted downfield relative to an unactivated alkyl carbon.",
      },
    };
  }

  if (isBenzylic(graph, atomIndex, aromaticAtoms)) {
    const protonCenter = hydrogens === 1 ? 2.95 : hydrogens === 2 ? 2.65 : 2.30;
    return {
      atomIndex,
      hydrogens,
      fingerprint,
      proton: hydrogens > 0
        ? {
          shiftCenter: protonCenter,
          range: "2.2–3.3 ppm",
          label: "benzylic",
          explanation: "A carbon directly adjacent to an aromatic π system is deshielded; methine, methylene, and methyl benzylic sites are treated separately.",
        }
        : null,
      carbon: {
        shiftCenter: hydrogens === 3 ? 22 : hydrogens === 2 ? 38 : 42,
        range: "20–55 ppm",
        label: "benzylic carbon",
        explanation: "A saturated carbon directly adjacent to an aromatic ring typically lies in the 20–55 ppm ¹³C region.",
      },
    };
  }

  if (isAllylic(graph, atomIndex, aromaticAtoms)) {
    const protonCenter = hydrogens === 1 ? 2.15 : hydrogens === 2 ? 2.05 : 1.85;
    return {
      atomIndex,
      hydrogens,
      fingerprint,
      proton: hydrogens > 0
        ? {
          shiftCenter: protonCenter,
          range: "1.6–2.6 ppm",
          label: "allylic",
          explanation: "A saturated carbon adjacent to a non-aromatic C=C bond is moderately deshielded by the neighboring π system.",
        }
        : null,
      carbon: {
        shiftCenter: 32,
        range: "20–50 ppm",
        label: "allylic carbon",
        explanation: "Allylic saturated carbons commonly occur in the 20–50 ppm ¹³C region.",
      },
    };
  }

  const betaHetero = betaHeteroatomElements(graph, atomIndex);
  const aromaticDistance = distanceToAromatic(graph, atomIndex, aromaticAtoms);
  if (hydrogens > 0 && (betaHetero.size > 0 || aromaticDistance === 2)) {
    const base = hydrogens === 3 ? 0.95 : hydrogens === 2 ? 1.40 : 1.60;
    const hasOxygen = betaHetero.has("O");
    const hasNitrogen = betaHetero.has("N");
    const hasSulfur = betaHetero.has("S");
    const hasFluorine = betaHetero.has("F");
    const hasChlorine = betaHetero.has("Cl");
    const hasBromine = betaHetero.has("Br");
    const hasIodine = betaHetero.has("I");

    const heteroAdjustment = hasOxygen ? 0.30
      : hasNitrogen ? 0.22
        : hasFluorine ? 0.25
          : hasChlorine ? 0.20
            : hasBromine ? 0.18
              : hasSulfur ? 0.15
                : hasIodine ? 0.12
                  : 0;
    const aromaticAdjustment = aromaticDistance === 2
      ? hydrogens === 3 ? 0.10 : hydrogens === 2 ? 0.35 : 0.30
      : 0;
    const protonCenter = base + heteroAdjustment + aromaticAdjustment;

    const hasBetaHetero = betaHetero.size > 0;
    const hasBetaAromatic = aromaticDistance === 2;
    const label = hasBetaHetero && hasBetaAromatic
      ? "β to heteroatom and aromatic ring"
      : hasBetaHetero
        ? "β to heteroatom"
        : "β to aromatic ring";
    const carbonCenter = saturatedAlkylCarbonBaseline(
      graph,
      atomIndex,
      hydrogens,
      aromaticAtoms,
    )
      + (hasBetaHetero ? 4 : 0)
      + (hasBetaAromatic ? 2 : 0);

    return {
      atomIndex,
      hydrogens,
      fingerprint,
      proton: {
        shiftCenter: protonCenter,
        range: hydrogens === 3 ? "0.8–1.7 ppm" : "1.2–2.5 ppm",
        label,
        explanation: hasBetaHetero && hasBetaAromatic
          ? "This proton set is two bonds from a heteroatom and one carbon beyond a benzylic site. Both secondary deshielding effects are combined instead of allowing one rule to hide the other."
          : hasBetaHetero
            ? "A heteroatom two bonds away still modestly deshields this alkyl proton set."
            : "This saturated carbon is one bond beyond a benzylic site, so the aromatic ring still produces a modest secondary shift effect.",
      },
      carbon: {
        shiftCenter: carbonCenter,
        range: "15–50 ppm",
        label: `carbon ${label}`,
        explanation: hasBetaHetero && hasBetaAromatic
          ? "The carbon receives modest beta substituent effects from both the heteroatom and aromatic ring."
          : hasBetaHetero
            ? "A saturated carbon beta to a heteroatom is modestly shifted from an unactivated alkyl carbon."
            : "A saturated carbon beta to an aromatic ring remains in the alkyl ¹³C region with a modest substituent effect.",
      },
    };
  }

  const protonCenter = hydrogens === 3 ? 0.95 : hydrogens === 2 ? 1.40 : 1.60;
  const protonRange = hydrogens === 3
    ? "0.7–1.3 ppm"
    : hydrogens === 2
      ? "1.0–1.9 ppm"
      : "1.2–2.1 ppm";
  const label = hydrogens === 3
    ? "alkyl methyl"
    : hydrogens === 2
      ? "alkyl methylene"
      : "alkyl methine";
  const carbonCenter = saturatedAlkylCarbonBaseline(
    graph,
    atomIndex,
    hydrogens,
    aromaticAtoms,
  );

  return {
    atomIndex,
    hydrogens,
    fingerprint,
    proton: hydrogens > 0
      ? {
        shiftCenter: protonCenter,
        range: protonRange,
        label,
        explanation: "This is an unactivated saturated alkyl proton environment; methyl, methylene, and methine sites use separate baseline shifts.",
      }
      : null,
    carbon: {
      shiftCenter: carbonCenter,
      range: "0–50 ppm",
      label: hydrogens > 0 ? `${label} carbon` : "alkyl quaternary carbon",
      explanation: "Saturated alkyl carbons typically appear in the upfield portion of the ¹³C spectrum.",
    },
  };
}

function couplingNeighborCounts(
  graph: ParsedMol,
  atomIndex: number,
  sourceSet: Set<number>,
  fingerprints: string[],
  aromaticAtoms: Set<number>,
) {
  const grouped = new Map<string, number>();

  for (const bond of graph.adjacency.get(atomIndex) ?? []) {
    // Adjacent proton-bearing carbons can couple through saturated, vinylic, and
    // aromatic C-C bonds.  Triple-bond long-range coupling is not treated as an
    // n+1 relationship here.
    if (![1, 1.5, 2].includes(bond.bondOrder)) continue;

    const neighbor = getOtherAtom(bond, atomIndex);
    if (sourceSet.has(neighbor) || graph.atoms[neighbor]?.element !== "C") continue;

    const hydrogens = inferredCarbonHydrogens(graph, neighbor);
    if (hydrogens <= 0) continue;

    // Equivalent neighboring atoms belong to one coupling set and their proton
    // counts must be summed.  This is the key distinction between, for example,
    // an isopropyl methine septet (six equivalent methyl H) and a false generic
    // multiplet made from two separate 3H neighbors.
    const normalizedOrder = normalizedBondOrderForEquivalence(
      atomIndex,
      neighbor,
      bond.bondOrder,
      aromaticAtoms,
    );
    const key = `${normalizedOrder}|${fingerprints[neighbor] ?? neighbor}`;
    grouped.set(key, (grouped.get(key) ?? 0) + hydrogens);
  }

  return [...grouped.values()].sort((a, b) => a - b);
}

function nPlusOneName(neighborHydrogens: number) {
  if (neighborHydrogens <= 0) return "singlet";
  if (neighborHydrogens === 1) return "doublet";
  if (neighborHydrogens === 2) return "triplet";
  if (neighborHydrogens === 3) return "quartet";
  if (neighborHydrogens === 4) return "quintet";
  if (neighborHydrogens === 5) return "sextet";
  if (neighborHydrogens === 6) return "septet";
  return "multiplet";
}

export function multiplicityFromNeighborHydrogens(
  graph: ParsedMol,
  atomIndices: number[],
  fingerprints: string[],
  aromaticAtoms: Set<number>,
) {
  const sourceSet = new Set(atomIndices);
  const signatures = atomIndices.map((atomIndex) =>
    couplingNeighborCounts(graph, atomIndex, sourceSet, fingerprints, aromaticAtoms),
  );

  if (signatures.length === 0 || signatures.every((counts) => counts.length === 0)) {
    return "singlet";
  }

  const reference = signatures[0] ?? [];
  const sameEnvironment = signatures.every(
    (counts) => counts.length === reference.length
      && counts.every((value, index) => value === reference[index]),
  );
  if (!sameEnvironment) return "multiplet";

  // n+1 is only applied to one equivalent neighboring proton set.  Multiple
  // non-equivalent sets generate compound splitting (dt, dq, etc.); without a
  // J-coupling calculation the chemically honest prediction is "multiplet".
  if (reference.length !== 1) return "multiplet";
  return nPlusOneName(reference[0] ?? 0);
}

function classifyExchangeableSites(
  graph: ParsedMol,
  fingerprints: string[],
  aromaticAtoms: Set<number>,
) {
  const sites: ExchangeableSite[] = [];

  for (const atom of graph.atoms) {
    const bonds = graph.adjacency.get(atom.atomIndex) ?? [];

    if (atom.element === "O" && atom.charge === 0 && bonds.length === 1 && bonds[0]?.bondOrder === 1) {
      const attachedIndex = getOtherAtom(bonds[0], atom.atomIndex);
      const attached = graph.atoms[attachedIndex];
      if (!attached) continue;

      if (attached.element === "C" && isCarbonylCarbon(graph, attachedIndex)) {
        sites.push({
          atomIndex: atom.atomIndex,
          protonCount: 1,
          fingerprint: fingerprints[atom.atomIndex] ?? `O-${atom.atomIndex}`,
          shiftCenter: 11.5,
          range: "10–13 ppm",
          sourceGroup: "carboxylic acid O–H",
          explanation: "Carboxylic-acid O–H protons are strongly hydrogen-bonded, exchangeable, and characteristically far downfield.",
        });
        continue;
      }

      if (attached.element === "C" && aromaticAtoms.has(attachedIndex)) {
        sites.push({
          atomIndex: atom.atomIndex,
          protonCount: 1,
          fingerprint: fingerprints[atom.atomIndex] ?? `O-${atom.atomIndex}`,
          shiftCenter: 9.0,
          range: "4.5–12 ppm",
          sourceGroup: "phenol O–H",
          explanation: "Phenolic O–H is exchangeable but is generally farther downfield than a simple aliphatic alcohol because the oxygen is attached directly to an aromatic ring.",
        });
        continue;
      }

      if (attached.element === "C") {
        const attachedHydrogens = inferredCarbonHydrogens(graph, attachedIndex);
        const attachedCarbonNeighbors = (graph.adjacency.get(attachedIndex) ?? []).filter((bond) => {
          const neighbor = getOtherAtom(bond, attachedIndex);
          return graph.atoms[neighbor]?.element === "C";
        }).length;
        const alcoholClass = attachedCarbonNeighbors >= 3 || attachedHydrogens === 0
          ? "tertiary"
          : attachedCarbonNeighbors >= 2 || attachedHydrogens === 1
            ? "secondary"
            : "primary";
        const shiftCenter = alcoholClass === "secondary" ? 4.8
          : alcoholClass === "primary" ? 3.0
            : 2.5;

        sites.push({
          atomIndex: atom.atomIndex,
          protonCount: 1,
          fingerprint: fingerprints[atom.atomIndex] ?? `O-${atom.atomIndex}`,
          shiftCenter,
          range: "0.5–5.5 ppm",
          sourceGroup: `${alcoholClass} alcohol O–H`,
          explanation: `${alcoholClass[0]?.toUpperCase()}${alcoholClass.slice(1)} alcohol O–H is exchangeable and strongly solvent/hydrogen-bond dependent; the plotted center is only a structural estimate.`,
        });
        continue;
      }

      if (attached.element === "S") {
        sites.push({
          atomIndex: atom.atomIndex,
          protonCount: 1,
          fingerprint: fingerprints[atom.atomIndex] ?? `O-${atom.atomIndex}`,
          shiftCenter: 10.5,
          range: "7–13 ppm",
          sourceGroup: "acidic O–H",
          explanation: "An acidic O–H bonded through sulfur is exchangeable and can appear substantially downfield.",
        });
      }
    }

    if (atom.element === "N" && atom.charge >= 0) {
      const protonCount = inferredNitrogenHydrogens(graph, atom.atomIndex);
      if (protonCount <= 0) continue;

      const attachedAtomIndices = bonds.map((bond) => getOtherAtom(bond, atom.atomIndex));
      const amideLike = attachedAtomIndices.some((index) =>
        graph.atoms[index]?.element === "C" && isCarbonylCarbon(graph, index),
      );
      const arylAmine = attachedAtomIndices.some((index) => aromaticAtoms.has(index));
      const sourceGroup = amideLike ? "amide N–H" : arylAmine ? "aryl amine N–H" : "amine N–H";
      const shiftCenter = amideLike ? 7.5 : arylAmine ? 4.5 : 2.5;
      const range = amideLike ? "5–9 ppm" : arylAmine ? "3–6 ppm" : "1–5 ppm";

      sites.push({
        atomIndex: atom.atomIndex,
        protonCount,
        fingerprint: fingerprints[atom.atomIndex] ?? `N-${atom.atomIndex}`,
        shiftCenter,
        range,
        sourceGroup,
        explanation: `${sourceGroup} protons are exchangeable; hydrogen bonding, concentration, and solvent can broaden or move the observed resonance.`,
      });
    }

    if (atom.element === "S" && atom.charge === 0 && bonds.length === 1 && bonds[0]?.bondOrder === 1) {
      const attachedIndex = getOtherAtom(bonds[0], atom.atomIndex);
      if (graph.atoms[attachedIndex]?.element !== "C") continue;

      sites.push({
        atomIndex: atom.atomIndex,
        protonCount: 1,
        fingerprint: fingerprints[atom.atomIndex] ?? `S-${atom.atomIndex}`,
        shiftCenter: 2.0,
        range: "1–4 ppm",
        sourceGroup: "thiol S–H",
        explanation: "Thiol S–H protons are exchangeable and usually occur in a broad, variable upfield-to-midfield range.",
      });
    }
  }

  return sites;
}

function groupExchangeableSignals(sites: ExchangeableSite[]) {
  const grouped = new Map<string, ExchangeableSite[]>();
  for (const site of sites) {
    const key = `${site.sourceGroup}|${site.fingerprint}|${site.range}`;
    const group = grouped.get(key) ?? [];
    group.push(site);
    grouped.set(key, group);
  }

  return [...grouped.values()].map((group): HNMRSignal => {
    const first = group[0];
    const protonCount = group.reduce((sum, site) => sum + site.protonCount, 0);
    const shiftCenter = group.reduce((sum, site) => sum + site.shiftCenter, 0) / group.length;
    return {
      shift: first.range,
      shiftCenter,
      multiplicity: "broad singlet",
      integration: `${protonCount}H`,
      protonCount,
      atomIndices: group.map((site) => site.atomIndex),
      sourceGroup: first.sourceGroup,
      explanation: first.explanation,
    };
  });
}

export function predictExchangeableSignals(
  graph: ParsedMol,
  fingerprints: string[],
  aromaticAtoms: Set<number>,
) {
  return groupExchangeableSignals(
    classifyExchangeableSites(graph, fingerprints, aromaticAtoms),
  );
}
