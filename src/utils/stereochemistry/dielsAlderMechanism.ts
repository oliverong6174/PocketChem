import type { RawGetMol } from "./depictionEngine";

export type DielsAlderRegioRelationship = "1,2" | "1,4" | null;

export type DielsAlderRegioAnalysis = {
  preferredRelationship: DielsAlderRegioRelationship;
  dieneDirectorPosition: "terminal" | "internal" | null;
  dieneDonorStrength: number;
  dienophileAcceptorStrength: number;
  confidence: "strong" | "moderate" | "ambiguous";
  reason: string;
};

type GraphBond = {
  atom1: number;
  atom2: number;
  order: number;
};

type Graph = {
  elements: string[];
  bonds: GraphBond[];
  adjacency: number[][];
};

const DIELS_ALDER_CONSTITUTIONAL_SMARTS =
  "[C:1]=[C:2]-[C:3]=[C:4].[C:5]=[C:6]>>[C:1]1-[C:2]=[C:3]-[C:4]-[C:5]-[C:6]-1";

function parseMatches(raw: string): number[][] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => {
        if (Array.isArray(entry)) return entry.map(Number).filter(Number.isFinite);
        if (entry && typeof entry === "object" && Array.isArray((entry as { atoms?: unknown[] }).atoms)) {
          return (entry as { atoms: unknown[] }).atoms.map(Number).filter(Number.isFinite);
        }
        return [];
      })
      .filter((entry) => entry.length > 0);
  } catch {
    return [];
  }
}

function parseGraph(molBlock: string): Graph | null {
  const lines = molBlock.split(/\r?\n/);
  if (!lines[3]?.includes("V2000")) return null;
  const atomCount = Number.parseInt(lines[3].slice(0, 3).trim(), 10);
  const bondCount = Number.parseInt(lines[3].slice(3, 6).trim(), 10);
  if (!Number.isInteger(atomCount) || !Number.isInteger(bondCount)) return null;

  const elements = Array.from({ length: atomCount }, (_, index) =>
    (lines[4 + index] ?? "").slice(31, 34).trim(),
  );
  const adjacency = Array.from({ length: atomCount }, () => [] as number[]);
  const bonds: GraphBond[] = [];
  const bondStart = 4 + atomCount;
  for (let index = 0; index < bondCount; index += 1) {
    const line = lines[bondStart + index] ?? "";
    const atom1 = Number.parseInt(line.slice(0, 3).trim(), 10) - 1;
    const atom2 = Number.parseInt(line.slice(3, 6).trim(), 10) - 1;
    const order = Number.parseInt(line.slice(6, 9).trim(), 10);
    if (
      !Number.isInteger(atom1) || !Number.isInteger(atom2) ||
      atom1 < 0 || atom2 < 0 || atom1 >= atomCount || atom2 >= atomCount
    ) continue;
    bonds.push({ atom1, atom2, order });
    adjacency[atom1].push(atom2);
    adjacency[atom2].push(atom1);
  }
  return { elements, bonds, adjacency };
}

function bondBetween(graph: Graph, atom1: number, atom2: number): GraphBond | null {
  return graph.bonds.find(
    (bond) =>
      (bond.atom1 === atom1 && bond.atom2 === atom2) ||
      (bond.atom1 === atom2 && bond.atom2 === atom1),
  ) ?? null;
}

function pathKey(path: readonly number[]) {
  const forward = path.join("-");
  const reverse = [...path].reverse().join("-");
  return forward < reverse ? forward : reverse;
}

function uniqueDienePaths(rdkit: any, mol: any): number[][] {
  const query = rdkit.get_qmol?.("[C;!a]=[C;!a]-[C;!a]=[C;!a]");
  if (!query) return [];
  try {
    const seen = new Set<string>();
    const result: number[][] = [];
    for (const match of parseMatches(mol.get_substruct_matches?.(query) ?? "[]")) {
      if (match.length < 4) continue;
      const path = match.slice(0, 4);
      const key = pathKey(path);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(path);
    }
    return result;
  } finally {
    query.delete?.();
  }
}

function uniqueAlkenePairs(rdkit: any, mol: any): Array<[number, number]> {
  const query = rdkit.get_qmol?.("[C;!a]=[C;!a]");
  if (!query) return [];
  try {
    const seen = new Set<string>();
    const result: Array<[number, number]> = [];
    for (const match of parseMatches(mol.get_substruct_matches?.(query) ?? "[]")) {
      if (match.length < 2) continue;
      const pair: [number, number] = [match[0], match[1]];
      const key = pathKey(pair);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(pair);
    }
    return result;
  } finally {
    query.delete?.();
  }
}

function branchHasMultipleBondTo(
  graph: Graph,
  root: number,
  excluded: number,
  elements: ReadonlySet<string>,
  orders: ReadonlySet<number>,
) {
  return (graph.adjacency[root] ?? []).some((neighbor) => {
    if (neighbor === excluded || !elements.has(graph.elements[neighbor] ?? "")) return false;
    const order = bondBetween(graph, root, neighbor)?.order ?? 0;
    return orders.has(order);
  });
}

function donorStrength(graph: Graph, center: number, root: number): number {
  const bond = bondBetween(graph, center, root);
  if (!bond || bond.order !== 1) return 0;
  const element = graph.elements[root];

  // Classical lone-pair donors used in normal-electron-demand Diels-Alder.
  if (element === "O" || element === "N") return 5;
  if (element === "S") return 4;

  if (element === "C") {
    // Carbonyl/cyano/sulfonyl-like carbon branches are not donors.
    if (
      branchHasMultipleBondTo(graph, root, center, new Set(["O", "N", "S"]), new Set([2, 3]))
    ) return 0;
    // Alkyl substitution is a weaker donor by hyperconjugation but still gives
    // the familiar 1-substituted/2-substituted Diels-Alder directing trend.
    return 2;
  }

  return 0;
}

function acceptorStrength(graph: Graph, center: number, root: number): number {
  const bond = bondBetween(graph, center, root);
  if (!bond || bond.order !== 1) return 0;
  const element = graph.elements[root];

  if (element === "C") {
    if (branchHasMultipleBondTo(graph, root, center, new Set(["O"]), new Set([2]))) return 6;
    if (branchHasMultipleBondTo(graph, root, center, new Set(["N"]), new Set([3]))) return 6;
  }

  if (element === "N") {
    const oxygenDouble = branchHasMultipleBondTo(graph, root, center, new Set(["O"]), new Set([2]));
    if (oxygenDouble) return 6;
  }

  if (element === "S") {
    const oxoCount = (graph.adjacency[root] ?? []).filter((neighbor) =>
      neighbor !== center && graph.elements[neighbor] === "O" && bondBetween(graph, root, neighbor)?.order === 2,
    ).length;
    if (oxoCount >= 1) return 5;
  }

  return 0;
}

type DieneDirector = {
  position: "terminal" | "internal";
  strength: number;
};

function branchReconnectsDienePath(
  graph: Graph,
  center: number,
  root: number,
  pathSet: ReadonlySet<number>,
) {
  const queue = [root];
  const seen = new Set<number>([center]);
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (pathSet.has(current)) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const next of graph.adjacency[current] ?? []) {
      if (!seen.has(next) && next !== center) queue.push(next);
    }
  }
  return false;
}

function analyzeDieneDirector(rdkit: any, rawGetMol: RawGetMol, smiles: string): DieneDirector | null {
  const mol = rawGetMol(smiles) as any;
  if (!mol) return null;
  try {
    const graph = parseGraph(mol.get_molblock?.() ?? "");
    if (!graph) return null;
    let best: DieneDirector | null = null;

    for (const path of uniqueDienePaths(rdkit, mol)) {
      const pathSet = new Set(path);
      for (let positionIndex = 0; positionIndex < 4; positionIndex += 1) {
        const center = path[positionIndex];
        for (const root of graph.adjacency[center] ?? []) {
          if (pathSet.has(root)) continue;
          // In a cyclic diene, the carbon path that closes the pre-existing
          // ring is scaffold, not an alkyl directing substituent.
          if (branchReconnectsDienePath(graph, center, root, pathSet)) continue;
          const strength = donorStrength(graph, center, root);
          if (strength <= 0) continue;
          const position: "terminal" | "internal" =
            positionIndex === 0 || positionIndex === 3 ? "terminal" : "internal";

          if (
            !best || strength > best.strength ||
            (strength === best.strength && position === "terminal" && best.position === "internal")
          ) {
            best = { position, strength };
          }
        }
      }
    }
    return best;
  } finally {
    mol.delete?.();
  }
}

type DienophileAcceptor = { strength: number; polarized: boolean };

function analyzeDienophileAcceptor(
  rdkit: any,
  rawGetMol: RawGetMol,
  smiles: string,
): DienophileAcceptor | null {
  const mol = rawGetMol(smiles) as any;
  if (!mol) return null;
  try {
    const graph = parseGraph(mol.get_molblock?.() ?? "");
    if (!graph) return null;
    let bestStrength = 0;
    let bestSideStrengths: [number, number] | null = null;

    for (const [left, right] of uniqueAlkenePairs(rdkit, mol)) {
      const pair = new Set([left, right]);
      const sideStrengths = [left, right].map((center) =>
        Math.max(
          0,
          ...(graph.adjacency[center] ?? [])
            .filter((root) => !pair.has(root))
            .map((root) => acceptorStrength(graph, center, root)),
        ),
      ) as [number, number];
      const localBest = Math.max(...sideStrengths);
      if (localBest > bestStrength) {
        bestStrength = localBest;
        bestSideStrengths = sideStrengths;
      }
    }

    if (!bestSideStrengths || bestStrength <= 0) return null;
    return {
      strength: bestStrength,
      polarized: bestSideStrengths[0] !== bestSideStrengths[1],
    };
  } finally {
    mol.delete?.();
  }
}

export function analyzeDielsAlderRegiochemistry(
  rdkit: any,
  rawGetMol: RawGetMol,
  dieneSmiles: string,
  dienophileSmiles: string,
): DielsAlderRegioAnalysis {
  const director = analyzeDieneDirector(rdkit, rawGetMol, dieneSmiles);
  const acceptor = analyzeDienophileAcceptor(rdkit, rawGetMol, dienophileSmiles);

  if (!director || !acceptor || !acceptor.polarized) {
    return {
      preferredRelationship: null,
      dieneDirectorPosition: director?.position ?? null,
      dieneDonorStrength: director?.strength ?? 0,
      dienophileAcceptorStrength: acceptor?.strength ?? 0,
      confidence: "ambiguous",
      reason:
        "No single normal-electron-demand donor/acceptor polarization was strong enough to select one regioisomer; retain alternatives.",
    };
  }

  // Course/FMO rule: a 1-substituted (terminally directed) diene favors the
  // ortho-like 1,2 cycloadduct; a 2-substituted (internally directed) diene
  // favors the para-like 1,4 cycloadduct. When both positions are substituted
  // at equal donor strength, terminal/1-substitution is the stronger director.
  const preferredRelationship: Exclude<DielsAlderRegioRelationship, null> =
    director.position === "terminal" ? "1,2" : "1,4";

  return {
    preferredRelationship,
    dieneDirectorPosition: director.position,
    dieneDonorStrength: director.strength,
    dienophileAcceptorStrength: acceptor.strength,
    confidence: director.strength >= 4 && acceptor.strength >= 5 ? "strong" : "moderate",
    reason:
      director.position === "terminal"
        ? "A terminal (1-substituted) electron-rich diene paired with a polarized electron-poor dienophile favors the ortho-like 1,2 cycloadduct."
        : "An internal (2-substituted) electron-rich diene paired with a polarized electron-poor dienophile favors the para-like 1,4 cycloadduct.",
  };
}

function runConstitutionalReaction(
  rdkit: any,
  rawGetMol: RawGetMol,
  reactants: [string, string],
  maxProducts = 32,
): string[] {
  let reaction: any = null;
  let molList: any = null;
  let productSets: any = null;
  const reactantMols: any[] = [];
  try {
    reaction = rdkit.get_rxn?.(DIELS_ALDER_CONSTITUTIONAL_SMARTS);
    if (!reaction) return [];
    molList = new rdkit.MolList();
    for (const smiles of reactants) {
      const mol = rawGetMol(smiles);
      if (!mol) return [];
      reactantMols.push(mol);
      molList.append(mol);
    }
    productSets = reaction.run_reactants?.(molList);
    if (!productSets || typeof productSets.size !== "function" || typeof productSets.get !== "function") {
      return [];
    }

    const result = new Set<string>();
    for (let setIndex = 0; setIndex < productSets.size(); setIndex += 1) {
      if (result.size >= maxProducts) break;
      const set = productSets.get(setIndex);
      try {
        const parts: string[] = [];
        for (let index = 0; index < (set?.size?.() ?? 0); index += 1) {
          const productMol = set.at(index);
          try {
            const smiles = productMol?.get_smiles?.();
            if (smiles) parts.push(smiles);
          } finally {
            productMol?.delete?.();
          }
        }
        if (parts.length > 0) result.add(parts.sort().join("."));
      } finally {
        set?.delete?.();
      }
    }
    return [...result];
  } catch (error) {
    console.warn("Mechanistic Diels-Alder constitutional enumeration failed.", error);
    return [];
  } finally {
    productSets?.delete?.();
    molList?.delete?.();
    for (const mol of reactantMols) mol?.delete?.();
    reaction?.delete?.();
  }
}

function carbonCycleOfSix(graph: Graph): number[] | null {
  const carbonAtoms = graph.elements
    .map((element, index) => ({ element, index }))
    .filter(({ element }) => element === "C")
    .map(({ index }) => index);
  const carbonSet = new Set(carbonAtoms);
  const cycles: number[][] = [];
  const seen = new Set<string>();

  const visit = (start: number, current: number, path: number[]) => {
    if (path.length > 6) return;
    for (const next of graph.adjacency[current] ?? []) {
      if (!carbonSet.has(next)) continue;
      if (next === start && path.length === 6) {
        const cycle = [...path];
        const rotations: string[] = [];
        for (const candidate of [cycle, [...cycle].reverse()]) {
          for (let offset = 0; offset < candidate.length; offset += 1) {
            rotations.push([...candidate.slice(offset), ...candidate.slice(0, offset)].join("-"));
          }
        }
        const key = rotations.sort()[0];
        if (!seen.has(key)) {
          seen.add(key);
          cycles.push(cycle);
        }
        continue;
      }
      if (path.includes(next)) continue;
      visit(start, next, [...path, next]);
    }
  };

  for (const start of carbonAtoms) visit(start, start, [start]);
  const candidates = cycles.filter((cycle) => {
    let doubleCount = 0;
    for (let index = 0; index < cycle.length; index += 1) {
      const next = cycle[(index + 1) % cycle.length];
      if (bondBetween(graph, cycle[index], next)?.order === 2) doubleCount += 1;
    }
    return doubleCount === 1;
  });
  return candidates.length === 1 ? candidates[0] : null;
}

function ringDistance(cycle: readonly number[], left: number, right: number) {
  const li = cycle.indexOf(left);
  const ri = cycle.indexOf(right);
  if (li < 0 || ri < 0) return null;
  const direct = Math.abs(li - ri);
  return Math.min(direct, cycle.length - direct);
}

export function identifyDielsAlderProductRegioRelationship(rawGetMol: RawGetMol, smiles: string): DielsAlderRegioRelationship {
  const mol = rawGetMol(smiles) as any;
  if (!mol) return null;
  try {
    const graph = parseGraph(mol.get_molblock?.() ?? "");
    if (!graph) return null;
    const cycle = carbonCycleOfSix(graph);
    if (!cycle) return null;
    const core = new Set(cycle);

    let bestDonor: { center: number; strength: number } | null = null;
    let bestAcceptor: { center: number; strength: number } | null = null;
    for (const center of cycle) {
      for (const root of graph.adjacency[center] ?? []) {
        if (core.has(root)) continue;
        const donor = donorStrength(graph, center, root);
        if (donor > (bestDonor?.strength ?? 0)) bestDonor = { center, strength: donor };
        const acceptor = acceptorStrength(graph, center, root);
        if (acceptor > (bestAcceptor?.strength ?? 0)) bestAcceptor = { center, strength: acceptor };
      }
    }
    if (!bestDonor || !bestAcceptor) return null;
    const distance = ringDistance(cycle, bestDonor.center, bestAcceptor.center);
    if (distance === 1) return "1,2";
    if (distance === 3) return "1,4";
    return null;
  } finally {
    mol.delete?.();
  }
}

export function generateMechanisticDielsAlderCandidates(
  rdkit: any,
  rawGetMol: RawGetMol,
  dieneSmiles: string,
  dienophileSmiles: string,
): { products: string[]; regio: DielsAlderRegioAnalysis } {
  const regio = analyzeDielsAlderRegiochemistry(
    rdkit,
    rawGetMol,
    dieneSmiles,
    dienophileSmiles,
  );
  const products = runConstitutionalReaction(
    rdkit,
    rawGetMol,
    [dieneSmiles, dienophileSmiles],
  );

  if (!regio.preferredRelationship || products.length <= 1) {
    return { products, regio };
  }

  const preferred = products.filter(
    (product) => identifyDielsAlderProductRegioRelationship(rawGetMol, product) === regio.preferredRelationship,
  );
  return {
    products: preferred.length > 0 ? preferred : products,
    regio,
  };
}
