import { getRDKit } from "../rdkit";

type Atom = { index: number; element: string; x: number; y: number };
type Bond = { lineIndex: number; atom1: number; atom2: number; order: number; stereo: number };
type Graph = {
  lines: string[];
  atomCount: number;
  bondCount: number;
  atoms: Atom[];
  bonds: Bond[];
  adjacency: number[][];
};

type Bicyclo222 = {
  core: Set<number>;
  bridgeheads: [number, number];
  dienePath: [number, number, number, number];
  otherPaths: [[number, number, number, number], [number, number, number, number]];
};

const DRAW_OPTIONS = JSON.stringify({
  atomLabelDeuteriumTritium: true,
  useMolBlockWedging: true,
});

function parseV2000(block: string): Graph | null {
  if (!block.includes("V2000")) return null;
  const lines = block.split(/\r?\n/);
  const atomCount = Number.parseInt(lines[3]?.slice(0, 3).trim() ?? "", 10);
  const bondCount = Number.parseInt(lines[3]?.slice(3, 6).trim() ?? "", 10);
  if (!Number.isInteger(atomCount) || !Number.isInteger(bondCount)) return null;

  const atoms: Atom[] = [];
  for (let i = 0; i < atomCount; i += 1) {
    const line = lines[4 + i] ?? "";
    const x = Number.parseFloat(line.slice(0, 10).trim());
    const y = Number.parseFloat(line.slice(10, 20).trim());
    const element = line.slice(31, 34).trim();
    if (!Number.isFinite(x) || !Number.isFinite(y) || !element) return null;
    atoms.push({ index: i, element, x, y });
  }

  const adjacency = Array.from({ length: atomCount }, () => [] as number[]);
  const bonds: Bond[] = [];
  const start = 4 + atomCount;
  for (let i = 0; i < bondCount; i += 1) {
    const lineIndex = start + i;
    const line = lines[lineIndex] ?? "";
    const atom1 = Number.parseInt(line.slice(0, 3).trim(), 10) - 1;
    const atom2 = Number.parseInt(line.slice(3, 6).trim(), 10) - 1;
    const order = Number.parseInt(line.slice(6, 9).trim(), 10);
    const stereo = Number.parseInt(line.slice(9, 12).trim() || "0", 10);
    if (atom1 < 0 || atom2 < 0 || atom1 >= atomCount || atom2 >= atomCount) continue;
    bonds.push({ lineIndex, atom1, atom2, order, stereo });
    adjacency[atom1].push(atom2);
    adjacency[atom2].push(atom1);
  }
  return { lines, atomCount, bondCount, atoms, bonds, adjacency };
}

function bondBetween(graph: Graph, a: number, b: number): Bond | null {
  return graph.bonds.find(
    (bond) =>
      (bond.atom1 === a && bond.atom2 === b) ||
      (bond.atom1 === b && bond.atom2 === a),
  ) ?? null;
}

function carbonTwoCore(graph: Graph): Set<number> {
  const active = new Set(
    graph.atoms.filter((atom) => atom.element === "C").map((atom) => atom.index),
  );
  let changed = true;
  while (changed) {
    changed = false;
    for (const atom of [...active]) {
      const degree = graph.adjacency[atom].filter((neighbor) => active.has(neighbor)).length;
      if (degree < 2) {
        active.delete(atom);
        changed = true;
      }
    }
  }
  return active;
}

function simplePaths(
  graph: Graph,
  allowed: ReadonlySet<number>,
  start: number,
  end: number,
): number[][] {
  const result: number[][] = [];
  const visit = (atom: number, path: number[]) => {
    if (path.length > allowed.size) return;
    if (atom === end) {
      result.push(path);
      return;
    }
    for (const next of graph.adjacency[atom]) {
      if (!allowed.has(next) || path.includes(next)) continue;
      visit(next, [...path, next]);
    }
  };
  visit(start, [start]);
  return result;
}

function pathKey(path: readonly number[]) {
  const a = path.join("-");
  const b = [...path].reverse().join("-");
  return a < b ? a : b;
}

function hasDoubleBond(graph: Graph, path: readonly number[]) {
  for (let i = 0; i < path.length - 1; i += 1) {
    if (bondBetween(graph, path[i], path[i + 1])?.order === 2) return true;
  }
  return false;
}

function findBicyclo222(graph: Graph): Bicyclo222 | null {
  const core = carbonTwoCore(graph);
  // This renderer intentionally handles only the bicyclo[2.2.2] class. Other
  // Diels-Alder products stay on the existing renderer rather than being
  // distorted by a topology they do not possess.
  if (core.size !== 8) return null;
  const bridgeheads = [...core].filter(
    (atom) => graph.adjacency[atom].filter((neighbor) => core.has(neighbor)).length === 3,
  );
  if (bridgeheads.length !== 2) return null;

  const [a, b] = bridgeheads;
  const unique = simplePaths(graph, core, a, b)
    .filter((path) => path.length === 4)
    .filter((path, index, all) => all.findIndex((candidate) => pathKey(candidate) === pathKey(path)) === index);
  if (unique.length !== 3) return null;
  const diene = unique.find((path) => hasDoubleBond(graph, path));
  if (!diene) return null;
  const others = unique.filter((path) => pathKey(path) !== pathKey(diene));
  if (others.length !== 2) return null;

  return {
    core,
    bridgeheads: [a, b],
    dienePath: diene as [number, number, number, number],
    otherPaths: [
      others[0] as [number, number, number, number],
      others[1] as [number, number, number, number],
    ],
  };
}

function externalCount(graph: Graph, core: ReadonlySet<number>, path: readonly number[]) {
  return path.slice(1, -1).reduce(
    (sum, atom) => sum + graph.adjacency[atom].filter((neighbor) => !core.has(neighbor)).length,
    0,
  );
}

function fmt(value: number) {
  return (Math.abs(value) < 0.00005 ? 0 : value).toFixed(4).padStart(10);
}

function rewriteAtom(line: string, x: number, y: number) {
  return `${fmt(x)}${fmt(y)}${line.slice(20)}`;
}

function rewriteBond(
  line: string,
  begin: number,
  end: number,
  order: number,
  stereo: number,
) {
  return `${String(begin + 1).padStart(3)}${String(end + 1).padStart(3)}${String(order).padStart(3)}${String(stereo).padStart(3)}${line.slice(12)}`;
}

function canonicalBondKey(a: number, b: number) {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

function componentOutsideCore(
  graph: Graph,
  core: ReadonlySet<number>,
  attachment: number,
  first: number,
) {
  const found = new Set<number>();
  const queue = [first];
  while (queue.length > 0) {
    const atom = queue.shift()!;
    if (found.has(atom) || core.has(atom) || atom === attachment) continue;
    found.add(atom);
    for (const next of graph.adjacency[atom]) {
      if (!found.has(next) && !core.has(next)) queue.push(next);
    }
  }
  return found;
}

function deterministicCoordinates(
  graph: Graph,
  scaffold: Bicyclo222,
): { block: string; internalBridge: [number, number, number, number]; outerPath: [number, number, number, number] } {
  const lines = [...graph.lines];
  const [a, b] = scaffold.bridgeheads;
  const [path1, path2] = scaffold.otherPaths;

  // For a substituted terminal dienophile the new dienophile bridge is the
  // non-diene bridge carrying the external substituent. The other non-diene
  // path is the pre-existing cyclohexadiene bridge and is drawn inside.
  const path1External = externalCount(graph, scaffold.core, path1);
  const path2External = externalCount(graph, scaffold.core, path2);
  const outerPath = (path1External >= path2External ? path1 : path2) as [number, number, number, number];
  const internalBridge = (pathKey(outerPath) === pathKey(path1) ? path2 : path1) as [number, number, number, number];

  // Canonical textbook projection: diene-derived bridge left, dienophile bridge
  // right, original cyclic-diene bridge inside the perimeter.
  const coords = new Map<number, { x: number; y: number }>([
    [a, { x: 0.0, y: 1.35 }],
    [b, { x: 0.0, y: -1.35 }],
    [scaffold.dienePath[1], { x: -1.35, y: 0.68 }],
    [scaffold.dienePath[2], { x: -1.35, y: -0.68 }],
    [outerPath[1], { x: 1.35, y: 0.68 }],
    [outerPath[2], { x: 1.35, y: -0.68 }],
    [internalBridge[1], { x: 0.42, y: 0.42 }],
    [internalBridge[2], { x: 0.42, y: -0.42 }],
  ]);

  // Place every substituent radially outward from the bicyclic perimeter while
  // preserving the local geometry of the rest of that substituent component.
  const center = { x: 0, y: 0 };
  const movedExternal = new Set<number>();
  for (const coreAtom of scaffold.core) {
    const anchor = coords.get(coreAtom);
    if (!anchor) continue;
    for (const neighbor of graph.adjacency[coreAtom]) {
      if (scaffold.core.has(neighbor) || movedExternal.has(neighbor)) continue;
      const component = componentOutsideCore(graph, scaffold.core, coreAtom, neighbor);
      if (component.size === 0) continue;
      const oldAnchor = graph.atoms[coreAtom];
      const oldFirst = graph.atoms[neighbor];
      const oldLength = Math.hypot(oldFirst.x - oldAnchor.x, oldFirst.y - oldAnchor.y) || 1.0;
      const rx = anchor.x - center.x;
      const ry = anchor.y - center.y;
      const rlen = Math.hypot(rx, ry) || 1;
      const firstTarget = {
        x: anchor.x + (rx / rlen) * oldLength,
        y: anchor.y + (ry / rlen) * oldLength,
      };
      const dx = firstTarget.x - oldFirst.x;
      const dy = firstTarget.y - oldFirst.y;
      for (const atom of component) {
        coords.set(atom, { x: graph.atoms[atom].x + dx, y: graph.atoms[atom].y + dy });
        movedExternal.add(atom);
      }
    }
  }

  for (const [atom, point] of coords) {
    lines[4 + atom] = rewriteAtom(lines[4 + atom] ?? "", point.x, point.y);
  }
  return { block: lines.join("\n"), internalBridge, outerPath };
}

function stereoTargets(
  graph: Graph,
  scaffold: Bicyclo222,
  internalBridge: [number, number, number, number],
) {
  const targets: Array<{ center: number; neighbor: number; kind: "bridge" | "substituent" }> = [
    { center: scaffold.bridgeheads[0], neighbor: internalBridge[1], kind: "bridge" },
    { center: scaffold.bridgeheads[1], neighbor: internalBridge[2], kind: "bridge" },
  ];

  // Any exocyclic bond from a tetrahedral core carbon may carry reaction
  // stereochemistry. The canonical-identity filter below determines whether it
  // must be wedge or dash; we do not guess from drawing direction.
  for (const center of scaffold.core) {
    for (const neighbor of graph.adjacency[center]) {
      if (scaffold.core.has(neighbor)) continue;
      const bond = bondBetween(graph, center, neighbor);
      if (bond?.order !== 1) continue;
      targets.push({ center, neighbor, kind: "substituent" });
    }
  }
  return targets;
}

function applyStereoCodes(
  graph: Graph,
  block: string,
  targets: Array<{ center: number; neighbor: number; kind: "bridge" | "substituent" }>,
  codes: readonly (1 | 6)[],
) {
  const lines = block.split(/\r?\n/);
  const byBond = new Map<string, { center: number; neighbor: number; code: 1 | 6 }>();
  targets.forEach((target, index) => {
    byBond.set(canonicalBondKey(target.center, target.neighbor), {
      center: target.center,
      neighbor: target.neighbor,
      code: codes[index],
    });
  });

  for (const bond of graph.bonds) {
    const line = lines[bond.lineIndex] ?? "";
    const target = byBond.get(canonicalBondKey(bond.atom1, bond.atom2));
    if (target) {
      lines[bond.lineIndex] = rewriteBond(
        line,
        target.center,
        target.neighbor,
        bond.order,
        target.code,
      );
    } else if (bond.stereo === 1 || bond.stereo === 6) {
      lines[bond.lineIndex] = rewriteBond(line, bond.atom1, bond.atom2, bond.order, 0);
    }
  }
  return lines.join("\n");
}

function allCodeVectors(count: number): Array<Array<1 | 6>> {
  if (count <= 0) return [[]];
  if (count > 8) return [];
  const vectors: Array<Array<1 | 6>> = [];
  for (let mask = 0; mask < 2 ** count; mask += 1) {
    const codes: Array<1 | 6> = [];
    for (let i = 0; i < count; i += 1) {
      codes.push((mask & (1 << i)) === 0 ? 1 : 6);
    }
    vectors.push(codes);
  }
  return vectors;
}

/**
 * Deterministic textbook renderer for cyclic-diene Diels-Alder products with a
 * bicyclo[2.2.2] core. Unlike the previous alignment-based attempts, this does
 * not try to salvage RDKit's arbitrary bicyclic projection. It reconstructs a
 * clean projection directly from graph topology and then exhaustively chooses
 * wedge/hash codes that preserve the exact canonical stereoisomer.
 */
export async function getTextbookBicyclo222DielsAlderSvg(
  productSource: string,
): Promise<string | null> {
  if (!productSource?.trim()) return null;
  const rdkit = await getRDKit();
  let sourceMol: any = null;
  try {
    sourceMol = rdkit.get_mol(productSource);
    if (!sourceMol) return null;
    const canonical = sourceMol.get_smiles?.();
    if (typeof canonical !== "string" || !canonical) return null;

    sourceMol.set_new_coords?.();
    const rawBlock = sourceMol.get_molblock?.();
    if (typeof rawBlock !== "string") return null;
    const graph = parseV2000(rawBlock);
    if (!graph) return null;
    const scaffold = findBicyclo222(graph);
    if (!scaffold) return null;

    const laidOut = deterministicCoordinates(graph, scaffold);
    const targets = stereoTargets(graph, scaffold, laidOut.internalBridge);

    type Candidate = { svg: string; score: number; block: string };
    const candidates: Candidate[] = [];
    for (const codes of allCodeVectors(targets.length)) {
      const candidateBlock = applyStereoCodes(graph, laidOut.block, targets, codes);
      let candidateMol: any = null;
      try {
        candidateMol = rdkit.get_mol(candidateBlock);
        if (!candidateMol) continue;
        const candidateCanonical = candidateMol.get_smiles?.();
        if (candidateCanonical !== canonical) continue;

        // Prefer the textbook perspective: both internal bridge bonds are solid
        // wedges. Substituent wedge/hash is then forced by molecular identity.
        let score = 0;
        targets.forEach((target, index) => {
          if (target.kind === "bridge") score += codes[index] === 1 ? 100 : -100;
        });
        // A small tie-breaker favors fewer hashed bonds without overriding the
        // chemical-identity constraint. This yields the all-wedge member for the
        // propene racemate when that member is the product being rendered.
        score += codes.reduce((sum, code) => sum + (code === 1 ? 1 : 0), 0);
        const svg = candidateMol.get_svg_with_highlights?.(DRAW_OPTIONS);
        if (typeof svg === "string" && svg) {
          candidates.push({ svg, score, block: candidateBlock });
        }
      } finally {
        candidateMol?.delete?.();
      }
    }

    candidates.sort((left, right) => right.score - left.score);
    return candidates[0]?.svg ?? null;
  } catch (error) {
    console.warn("Textbook bicyclo[2.2.2] Diels-Alder depiction failed.", error);
    return null;
  } finally {
    sourceMol?.delete?.();
  }
}
