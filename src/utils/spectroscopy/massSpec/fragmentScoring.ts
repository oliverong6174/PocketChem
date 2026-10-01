import { atomNeighbors } from "./molGraph";
import type { MassGraph } from "./fragmentTypes";

const HETERO_STABILIZATION: Record<string, number> = {
  S: 1.75,
  O: 1.55,
  N: 1.45,
  P: 1.15,
};

function componentSet(component: number[]) {
  return new Set(component);
}

function heavyDegree(graph: MassGraph, atomIndex: number, component: Set<number>) {
  return atomNeighbors(graph, atomIndex, component).filter(({ atom }) => graph.atoms[atom].symbol !== "H").length;
}

function adjacentToAromatic(graph: MassGraph, atomIndex: number, component: Set<number>) {
  // Reward benzylic stabilization, not an aryl/vinylic cation sitting directly
  // inside the pi system. The bond from the charge center to the aromatic atom
  // must therefore be a sigma bond.
  return atomNeighbors(graph, atomIndex, component).some(({ atom, bond }) => {
    if (bond.type === 4 || bond.order >= 1.5) return false;
    return atomNeighbors(graph, atom, component).some(({ atom: nextAtom, bond: nextBond }) =>
      nextAtom !== atomIndex && nextBond.type === 4,
    );
  });
}

function adjacentToPiBond(graph: MassGraph, atomIndex: number, component: Set<number>) {
  // Likewise, allylic stabilization requires one intervening sigma bond.
  // Directly charging an alkene carbon is vinylic and is not rewarded.
  return atomNeighbors(graph, atomIndex, component).some(({ atom, bond }) => {
    if (bond.order >= 1.5) return false;
    return atomNeighbors(graph, atom, component).some(({ atom: nextAtom, bond: nextBond }) =>
      nextAtom !== atomIndex && nextBond.order >= 1.5,
    );
  });
}

function chargeStabilityScore(graph: MassGraph, chargeCenter: number, ionComponent: number[]) {
  const atom = graph.atoms[chargeCenter];
  const component = componentSet(ionComponent);
  if (!atom) return 0.25;

  if (atom.symbol !== "C") {
    const heteroBase: Record<string, number> = { S: 2.05, O: 1.75, N: 1.7, P: 1.45, Cl: 0.6, Br: 0.65, I: 0.7 };
    return heteroBase[atom.symbol] ?? 0.8;
  }

  const degree = heavyDegree(graph, chargeCenter, component);
  let score = degree >= 3 ? 2.45 : degree === 2 ? 1.85 : degree === 1 ? 1.2 : 0.72;

  if (adjacentToAromatic(graph, chargeCenter, component)) score += 1.75;
  else if (adjacentToPiBond(graph, chargeCenter, component)) score += 1.35;

  for (const { atom: neighborIndex } of atomNeighbors(graph, chargeCenter, component)) {
    const neighbor = graph.atoms[neighborIndex];
    score += HETERO_STABILIZATION[neighbor.symbol] ?? 0;
  }

  return score;
}

function neutralRadicalScore(graph: MassGraph, neutralEndpoint: number, neutralComponent: number[]) {
  const component = componentSet(neutralComponent);
  const atom = graph.atoms[neutralEndpoint];
  if (!atom) return 0.6;

  let score = 0.8;
  if (atom.symbol === "C") {
    const degree = heavyDegree(graph, neutralEndpoint, component);
    score += degree >= 3 ? 0.65 : degree === 2 ? 0.4 : degree === 1 ? 0.2 : 0;
    if (adjacentToAromatic(graph, neutralEndpoint, component)) score += 0.65;
    else if (adjacentToPiBond(graph, neutralEndpoint, component)) score += 0.45;
  } else if (atom.symbol === "S" || atom.symbol === "O" || atom.symbol === "N") {
    score += 0.45;
  }
  return score;
}

function cleavageBondScore(graph: MassGraph, bondIndex: number) {
  const bond = graph.bonds[bondIndex];
  if (!bond) return 0.5;
  const a = graph.atoms[bond.a]?.symbol;
  const b = graph.atoms[bond.b]?.symbol;
  const pair = new Set([a, b]);

  if (pair.has("S") && pair.has("C")) return 1.55;
  if (pair.has("O") && pair.has("C")) return 1.38;
  if (pair.has("N") && pair.has("C")) return 1.28;
  if ((pair.has("Cl") || pair.has("Br") || pair.has("I")) && pair.has("C")) return 1.18;
  if (a === "C" && b === "C") return 1;
  return 0.82;
}

export function scoreCleavagePathway(
  graph: MassGraph,
  bondIndex: number,
  chargeCenter: number,
  ionComponent: number[],
  neutralComponent: number[],
) {
  const bond = graph.bonds[bondIndex];
  if (!bond) return 0;
  const neutralEndpoint = bond.a === chargeCenter ? bond.b : bond.a;
  const ionStability = chargeStabilityScore(graph, chargeCenter, ionComponent);
  const neutralStability = neutralRadicalScore(graph, neutralEndpoint, neutralComponent);
  const bondPreference = cleavageBondScore(graph, bondIndex);

  // Product form keeps every factor positive and makes strong resonance/
  // heteroatom stabilization meaningfully outweigh ordinary alkyl cleavage.
  return bondPreference * (0.75 + ionStability) * (0.82 + neutralStability * 0.34);
}

export function describeCleavagePathway(
  graph: MassGraph,
  bondIndex: number,
  chargeCenter: number,
  ionComponent: number[],
) {
  const bond = graph.bonds[bondIndex];
  if (!bond) return "General EI bond cleavage.";
  const component = componentSet(ionComponent);
  const atom = graph.atoms[chargeCenter];
  const factors: string[] = [];

  if (atom?.symbol === "C") {
    const degree = heavyDegree(graph, chargeCenter, component);
    if (degree >= 3) factors.push("tertiary carbocation substitution");
    else if (degree === 2) factors.push("secondary carbocation substitution");
    else if (degree === 1) factors.push("primary carbocation substitution");
    if (adjacentToAromatic(graph, chargeCenter, component)) factors.push("benzylic/aromatic resonance stabilization");
    else if (adjacentToPiBond(graph, chargeCenter, component)) factors.push("allylic/conjugative stabilization");

    for (const { atom: neighborIndex } of atomNeighbors(graph, chargeCenter, component)) {
      const symbol = graph.atoms[neighborIndex]?.symbol;
      if (symbol && HETERO_STABILIZATION[symbol]) factors.push(`${symbol} lone-pair stabilization adjacent to the charge`);
    }
  } else if (atom?.symbol === "S" || atom?.symbol === "O" || atom?.symbol === "N") {
    factors.push(`charge retention on ${atom.symbol}`);
  }

  const bondLabel = `${graph.atoms[bond.a]?.symbol ?? "?"}–${graph.atoms[bond.b]?.symbol ?? "?"}`;
  const factorText = factors.length > 0 ? ` Favored features: ${[...new Set(factors)].join(", ")}.` : "";
  return `General EI σ-bond cleavage of the ${bondLabel} bond forms this charge-retaining fragment and the complementary neutral radical.${factorText} Relative abundance is estimated from bond lability, ion stabilization, neutral-radical stability, and pathway multiplicity.`;
}

export function estimateParentIonPropensity(graph: MassGraph) {
  const aromaticBonds = graph.bonds.filter((bond) => bond.type === 4).length;
  const piBonds = graph.bonds.filter((bond) => bond.order >= 2 && bond.type !== 4).length;
  const heteroAtoms = graph.atoms.filter((atom) => !["C", "H"].includes(atom.symbol)).length;
  const heavyAtoms = graph.atoms.filter((atom) => atom.symbol !== "H").length;

  // Small, conjugated/aromatic molecules tend to retain a stronger molecular ion;
  // large flexible aliphatics fragment more readily.
  const sizePenalty = Math.max(0, heavyAtoms - 8) * 0.85;
  return Math.max(12, Math.min(82, 28 + aromaticBonds * 2.4 + piBonds * 4 + heteroAtoms * 1.8 - sizePenalty));
}
