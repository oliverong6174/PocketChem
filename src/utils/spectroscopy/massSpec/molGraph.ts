import type { MassGraph, MassGraphAtom, MassGraphBond } from "./fragmentTypes";

const NOMINAL_MASS: Record<string, number> = {
  H: 1,
  B: 11,
  C: 12,
  N: 14,
  O: 16,
  F: 19,
  Si: 28,
  P: 31,
  S: 32,
  Cl: 35,
  Br: 79,
  I: 127,
};

function parseMolBlockCharge(lines: string[], atomCount: number) {
  const charges = Array.from({ length: atomCount }, () => 0);
  for (const line of lines) {
    if (!line.startsWith("M  CHG")) continue;
    const fields = line.trim().split(/\s+/);
    const pairCount = Number.parseInt(fields[2] ?? "0", 10);
    for (let index = 0; index < pairCount; index += 1) {
      const atomIndex = Number.parseInt(fields[3 + index * 2] ?? "0", 10) - 1;
      const charge = Number.parseInt(fields[4 + index * 2] ?? "0", 10);
      if (atomIndex >= 0 && atomIndex < atomCount && Number.isFinite(charge)) {
        charges[atomIndex] = charge;
      }
    }
  }
  return charges;
}

function typicalValence(symbol: string, charge: number, currentValence: number) {
  if (symbol === "C") return charge > 0 ? 3 : 4;
  if (symbol === "N") return charge > 0 ? 4 : charge < 0 ? 2 : 3;
  if (symbol === "O") return charge > 0 ? 3 : charge < 0 ? 1 : 2;
  if (symbol === "F" || symbol === "Cl" || symbol === "Br" || symbol === "I") return 1;
  if (symbol === "B") return charge < 0 ? 4 : 3;
  if (symbol === "P") return currentValence > 3 ? 5 : 3;
  if (symbol === "S") return currentValence > 2 ? Math.max(4, Math.ceil(currentValence)) : 2;
  if (symbol === "H") return 1;
  return Math.ceil(currentValence);
}

export function parseV2000MassGraph(molBlock: string): MassGraph | null {
  if (!molBlock || molBlock.includes("V3000")) return null;
  const lines = molBlock.split(/\r?\n/);
  if (lines.length < 5) return null;

  const atomCount = Number.parseInt(lines[3]?.slice(0, 3).trim() ?? "", 10);
  const bondCount = Number.parseInt(lines[3]?.slice(3, 6).trim() ?? "", 10);
  if (!Number.isInteger(atomCount) || !Number.isInteger(bondCount) || atomCount <= 0) return null;

  const atomStart = 4;
  const bondStart = atomStart + atomCount;
  const symbols = Array.from({ length: atomCount }, (_, index) =>
    (lines[atomStart + index] ?? "").slice(31, 34).trim(),
  );
  const charges = parseMolBlockCharge(lines, atomCount);
  const valence = Array.from({ length: atomCount }, () => 0);
  const bonds: MassGraphBond[] = [];

  for (let index = 0; index < bondCount; index += 1) {
    const line = lines[bondStart + index] ?? "";
    const a = Number.parseInt(line.slice(0, 3).trim(), 10) - 1;
    const b = Number.parseInt(line.slice(3, 6).trim(), 10) - 1;
    const type = Number.parseInt(line.slice(6, 9).trim(), 10);
    if (a < 0 || b < 0 || a >= atomCount || b >= atomCount) continue;
    const order = type === 2 ? 2 : type === 3 ? 3 : type === 4 ? 1.5 : 1;
    bonds.push({ index: bonds.length, a, b, order, type });
    valence[a] += order;
    valence[b] += order;
  }

  const atoms: MassGraphAtom[] = symbols.map((symbol, index) => {
    const target = typicalValence(symbol, charges[index], valence[index]);
    return {
      index,
      symbol,
      charge: charges[index],
      implicitHydrogens: symbol === "H" ? 0 : Math.max(0, Math.round(target - valence[index])),
    };
  });

  return { atoms, bonds };
}

export function atomNeighbors(graph: MassGraph, atomIndex: number, allowed?: Set<number>) {
  const neighbors: Array<{ atom: number; bond: MassGraphBond }> = [];
  for (const bond of graph.bonds) {
    const other = bond.a === atomIndex ? bond.b : bond.b === atomIndex ? bond.a : -1;
    if (other < 0 || (allowed && !allowed.has(other))) continue;
    neighbors.push({ atom: other, bond });
  }
  return neighbors;
}

export function connectedComponentsAfterBondRemoval(
  graph: MassGraph,
  bondIndex: number,
): [number[], number[]] | null {
  const removed = graph.bonds[bondIndex];
  if (!removed) return null;

  const visit = (start: number) => {
    const seen = new Set<number>([start]);
    const queue = [start];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const bond of graph.bonds) {
        if (bond.index === bondIndex) continue;
        const other = bond.a === current ? bond.b : bond.b === current ? bond.a : -1;
        if (other < 0 || seen.has(other)) continue;
        seen.add(other);
        queue.push(other);
      }
    }
    return [...seen].sort((a, b) => a - b);
  };

  const first = visit(removed.a);
  if (first.includes(removed.b)) return null; // ring bond: cleavage opens a ring but does not create a lower-mass ion yet
  const second = visit(removed.b);
  return [first, second];
}

export function nominalMassForComponent(graph: MassGraph, component: number[]) {
  let total = 0;
  for (const index of component) {
    const atom = graph.atoms[index];
    const mass = NOMINAL_MASS[atom.symbol];
    if (mass === undefined) return null;
    total += mass + atom.implicitHydrogens;
  }
  return total;
}

export function componentElementCount(graph: MassGraph, component: number[], symbol: string) {
  return component.reduce((count, index) => count + (graph.atoms[index]?.symbol === symbol ? 1 : 0), 0);
}

function formatAtomLine(symbol: string, valenceOverride = 0) {
  return `    0.0000    0.0000    0.0000 ${symbol.padEnd(3, " ")} 0  0  0  0  0${String(valenceOverride).padStart(3, " ")}  0  0  0  0  0  0`;
}

export function buildChargedFragmentMolBlock(
  graph: MassGraph,
  component: number[],
  chargeCenter: number,
) {
  const memberSet = new Set(component);
  if (!memberSet.has(chargeCenter)) return null;

  const indexMap = new Map<number, number>();
  component.forEach((original, next) => indexMap.set(original, next));
  const bonds = graph.bonds.filter((bond) => memberSet.has(bond.a) && memberSet.has(bond.b));

  const lines = [
    "PocketChem fragment",
    "  PocketChem",
    "",
    `${String(component.length).padStart(3, " ")}${String(bonds.length).padStart(3, " ")}  0  0  0  0            999 V2000`,
  ];

  for (const original of component) {
    const atom = graph.atoms[original];
    let valenceOverride = 0;
    if (original === chargeCenter) {
      const heavyValence = bonds.reduce((sum, bond) => {
        if (bond.a !== original && bond.b !== original) return sum;
        return sum + bond.order;
      }, 0);
      const desiredValence = Math.max(0, Math.round(heavyValence + atom.implicitHydrogens));
      // In V2000, valence code 0 means "use default valence" while 15 means
      // explicit zero valence. The latter is required for isolated halogen ions
      // such as Br+ so RDKit does not invent hydrogens in the preview.
      valenceOverride = desiredValence === 0 ? 15 : desiredValence;
    }
    lines.push(formatAtomLine(atom.symbol, valenceOverride));
  }
  for (const bond of bonds) {
    const a = (indexMap.get(bond.a) ?? 0) + 1;
    const b = (indexMap.get(bond.b) ?? 0) + 1;
    lines.push(`${String(a).padStart(3, " ")}${String(b).padStart(3, " ")}${String(bond.type).padStart(3, " ")}  0  0  0  0`);
  }

  const charges: Array<{ atom: number; charge: number }> = [];
  for (const original of component) {
    const baseCharge = graph.atoms[original].charge;
    const charge = baseCharge + (original === chargeCenter ? 1 : 0);
    if (charge !== 0) charges.push({ atom: (indexMap.get(original) ?? 0) + 1, charge });
  }

  if (charges.length > 0) {
    for (let offset = 0; offset < charges.length; offset += 8) {
      const batch = charges.slice(offset, offset + 8);
      const payload = batch.map((entry) => `${String(entry.atom).padStart(4, " ")}${String(entry.charge).padStart(4, " ")}`).join("");
      lines.push(`M  CHG${String(batch.length).padStart(3, " ")}${payload}`);
    }
  }
  lines.push("M  END");
  return lines.join("\n");
}
