import type { MechanisticStereoDirective } from "./runtime";

type Atom = {
  index: number;
  element: string;
  x: number;
  y: number;
};

type Bond = {
  lineIndex: number;
  atom1: number;
  atom2: number;
  order: number;
  stereo: number;
};

type MolGraph = {
  lines: string[];
  atomCount: number;
  bondCount: number;
  atoms: Atom[];
  bonds: Bond[];
  adjacency: number[][];
};

type StereoTarget = {
  center: number;
  neighbor: number;
  desired: 1 | 6;
  label: string;
};

type PreparedDepiction = {
  molBlock: string;
  desiredMatches: number;
  targetCount: number;
};

type RawMol = {
  get_smiles?: (...args: unknown[]) => string;
  get_molblock?: () => string;
  get_svg_with_highlights?: (options?: string) => string;
  get_stereo_tags?: () => string;
  set_new_coords?: () => void;
  delete?: () => void;
};

export type RawGetMol = (source: string, ...args: unknown[]) => RawMol | null;

function looksLikeMolBlock(source: string) {
  return /(?:V2000|V3000|M\s+END)/.test(source);
}

function cipStereoAtomSet(mol: RawMol): Set<number> {
  const result = new Set<number>();
  try {
    const raw = mol.get_stereo_tags?.();
    if (!raw) return result;
    const parsed = JSON.parse(raw) as { CIP_atoms?: unknown };
    if (!Array.isArray(parsed.CIP_atoms)) return result;
    for (const entry of parsed.CIP_atoms) {
      if (!Array.isArray(entry) || entry.length < 2) continue;
      const atom = Number(entry[0]);
      const descriptor = String(entry[1]).replace(/[()]/g, "");
      if (Number.isInteger(atom) && (descriptor === "R" || descriptor === "S")) {
        result.add(atom);
      }
    }
  } catch {
    // leave empty
  }
  return result;
}

function parseV2000(molBlock: string): MolGraph | null {
  if (!molBlock.includes("V2000")) return null;
  const lines = molBlock.split(/\r?\n/);
  if (lines.length < 5) return null;
  const atomCount = Number.parseInt(lines[3]?.slice(0, 3).trim() ?? "", 10);
  const bondCount = Number.parseInt(lines[3]?.slice(3, 6).trim() ?? "", 10);
  if (!Number.isInteger(atomCount) || !Number.isInteger(bondCount)) return null;

  const atoms: Atom[] = [];
  for (let index = 0; index < atomCount; index += 1) {
    const line = lines[4 + index] ?? "";
    const x = Number.parseFloat(line.slice(0, 10).trim());
    const y = Number.parseFloat(line.slice(10, 20).trim());
    const element = line.slice(31, 34).trim();
    if (!Number.isFinite(x) || !Number.isFinite(y) || !element) return null;
    atoms.push({ index, element, x, y });
  }

  const bonds: Bond[] = [];
  const adjacency = Array.from({ length: atomCount }, () => [] as number[]);
  const bondStart = 4 + atomCount;
  for (let index = 0; index < bondCount; index += 1) {
    const lineIndex = bondStart + index;
    const line = lines[lineIndex] ?? "";
    const atom1 = Number.parseInt(line.slice(0, 3).trim(), 10) - 1;
    const atom2 = Number.parseInt(line.slice(3, 6).trim(), 10) - 1;
    const order = Number.parseInt(line.slice(6, 9).trim(), 10);
    const stereo = Number.parseInt(line.slice(9, 12).trim() || "0", 10);
    if (
      !Number.isInteger(atom1) || !Number.isInteger(atom2) ||
      atom1 < 0 || atom2 < 0 || atom1 >= atomCount || atom2 >= atomCount
    ) continue;
    bonds.push({ lineIndex, atom1, atom2, order, stereo });
    adjacency[atom1].push(atom2);
    adjacency[atom2].push(atom1);
  }

  return { lines, atomCount, bondCount, atoms, bonds, adjacency };
}

function bondBetween(graph: MolGraph, atom1: number, atom2: number): Bond | null {
  return graph.bonds.find(
    (bond) =>
      (bond.atom1 === atom1 && bond.atom2 === atom2) ||
      (bond.atom1 === atom2 && bond.atom2 === atom1),
  ) ?? null;
}

function rewriteBondLine(
  line: string,
  atom1: number,
  atom2: number,
  order: number,
  stereo: number,
) {
  return `${String(atom1 + 1).padStart(3)}${String(atom2 + 1).padStart(3)}${String(order).padStart(3)}${String(stereo).padStart(3)}${line.slice(12)}`;
}

function rewriteAtomLine(line: string, x: number, y: number) {
  const fmt = (value: number) => (Math.abs(value) < 0.00005 ? 0 : value).toFixed(4).padStart(10);
  return `${fmt(x)}${fmt(y)}${line.slice(20)}`;
}

function carbonTwoCore(graph: MolGraph): Set<number> {
  const active = new Set(
    graph.atoms.filter((atom) => atom.element === "C").map((atom) => atom.index),
  );

  let changed = true;
  while (changed) {
    changed = false;
    for (const atom of [...active]) {
      const degree = (graph.adjacency[atom] ?? []).filter((neighbor) => active.has(neighbor)).length;
      if (degree < 2) {
        active.delete(atom);
        changed = true;
      }
    }
  }
  return active;
}

function enumerateSimplePaths(
  graph: MolGraph,
  allowed: ReadonlySet<number>,
  start: number,
  end: number,
  maxNodes: number,
): number[][] {
  const results: number[][] = [];
  const visit = (current: number, path: number[]) => {
    if (path.length > maxNodes) return;
    if (current === end) {
      results.push(path);
      return;
    }
    for (const next of graph.adjacency[current] ?? []) {
      if (!allowed.has(next) || path.includes(next)) continue;
      visit(next, [...path, next]);
    }
  };
  visit(start, [start]);
  return results;
}

function pathKey(path: readonly number[]) {
  const forward = path.join("-");
  const reverse = [...path].reverse().join("-");
  return forward < reverse ? forward : reverse;
}

function externalNeighbors(graph: MolGraph, core: ReadonlySet<number>, atom: number) {
  return (graph.adjacency[atom] ?? []).filter((neighbor) => !core.has(neighbor));
}

function pathExternalCount(graph: MolGraph, core: ReadonlySet<number>, path: readonly number[]) {
  return path.slice(1, -1).reduce(
    (sum, atom) => sum + externalNeighbors(graph, core, atom).length,
    0,
  );
}

function hasDoubleBond(graph: MolGraph, path: readonly number[]) {
  for (let i = 0; i < path.length - 1; i += 1) {
    if (bondBetween(graph, path[i], path[i + 1])?.order === 2) return true;
  }
  return false;
}

type DielsAlderBicyclic = {
  core: Set<number>;
  bridgeheads: [number, number];
  dienePath: [number, number, number, number];
  dienophilePath: [number, number, number, number];
  internalBridge: [number, ...number[]];
};

function findDielsAlderBicyclic(graph: MolGraph): DielsAlderBicyclic | null {
  const core = carbonTwoCore(graph);
  if (core.size < 7 || core.size > 10) return null;

  const bridgeheads = [...core].filter(
    (atom) => (graph.adjacency[atom] ?? []).filter((neighbor) => core.has(neighbor)).length === 3,
  );
  if (bridgeheads.length !== 2) return null;

  const [a, b] = bridgeheads;
  const paths = enumerateSimplePaths(graph, core, a, b, core.size)
    .filter((path) => path.length >= 3)
    .filter((path, index, list) => list.findIndex((candidate) => pathKey(candidate) === pathKey(path)) === index);
  if (paths.length !== 3) return null;

  // Diels-Alder always contributes two two-atom bridges: the diene-derived
  // C-C=C-C path and the dienophile-derived C-C-C-C path. The pre-existing
  // cyclic-diene bridge can contain 1-4 internal atoms (cyclopentadiene through
  // cyclooctadiene), so do not hard-code bicyclo[2.2.2].
  const dienePath = paths.find((path) => path.length === 4 && hasDoubleBond(graph, path));
  if (!dienePath) return null;
  const remaining = paths.filter((path) => pathKey(path) !== pathKey(dienePath));
  if (remaining.length !== 2) return null;

  const twoAtomBridges = remaining.filter((path) => path.length === 4);
  let dienophilePath: number[] | null = null;
  let internalBridge: number[] | null = null;

  if (twoAtomBridges.length === 1) {
    dienophilePath = twoAtomBridges[0];
    internalBridge = remaining.find((path) => pathKey(path) !== pathKey(dienophilePath!)) ?? null;
  } else if (twoAtomBridges.length === 2) {
    // cyclohexa-1,3-diene gives two length-4 non-double-bond paths. The one
    // carrying dienophile substituents is the new dienophile bridge; if both are
    // unsubstituted, either assignment is symmetry-equivalent.
    const ranked = [...twoAtomBridges].sort(
      (left, right) => pathExternalCount(graph, core, right) - pathExternalCount(graph, core, left),
    );
    dienophilePath = ranked[0];
    internalBridge = ranked[1];
  }

  if (!dienophilePath || !internalBridge || dienophilePath.length !== 4) return null;

  return {
    core,
    bridgeheads: [a, b],
    dienePath: dienePath as [number, number, number, number],
    dienophilePath: dienophilePath as [number, number, number, number],
    internalBridge: internalBridge as [number, ...number[]],
  };
}

function orderedSixMemberCycle(graph: MolGraph): number[] | null {
  const core = carbonTwoCore(graph);
  if (core.size !== 6) return null;
  if ([...core].some((atom) => (graph.adjacency[atom] ?? []).filter((n) => core.has(n)).length !== 2)) {
    return null;
  }

  const doubleBond = graph.bonds.find(
    (bond) => bond.order === 2 && core.has(bond.atom1) && core.has(bond.atom2),
  );
  if (!doubleBond) return null;

  const start = doubleBond.atom1;
  const end = doubleBond.atom2;
  const path = enumerateSimplePaths(graph, core, end, start, 6)
    .find((candidate) => candidate.length === 6 && candidate[1] !== start);
  if (!path) return null;

  // Return an order whose final -> first edge is the double bond, allowing a
  // deterministic left-side C=C drawing.
  return [end, ...path.slice(1, -1), start];
}

function translateExternalComponents(
  graph: MolGraph,
  core: ReadonlySet<number>,
  targetCoords: Map<number, { x: number; y: number }>,
) {
  const oldCoords = new Map(graph.atoms.map((atom) => [atom.index, { x: atom.x, y: atom.y }]));
  const center = {
    x: [...targetCoords.values()].reduce((sum, point) => sum + point.x, 0) / Math.max(1, targetCoords.size),
    y: [...targetCoords.values()].reduce((sum, point) => sum + point.y, 0) / Math.max(1, targetCoords.size),
  };

  const moved = new Set<number>();
  for (const coreAtom of core) {
    const anchor = targetCoords.get(coreAtom);
    if (!anchor) continue;
    for (const root of externalNeighbors(graph, core, coreAtom)) {
      if (moved.has(root)) continue;
      const component: number[] = [];
      const queue = [root];
      const seen = new Set<number>([coreAtom]);
      while (queue.length > 0) {
        const current = queue.shift()!;
        if (seen.has(current) || core.has(current)) continue;
        seen.add(current);
        component.push(current);
        for (const next of graph.adjacency[current] ?? []) {
          if (!seen.has(next) && !core.has(next)) queue.push(next);
        }
      }
      component.forEach((atom) => moved.add(atom));

      const oldCore = oldCoords.get(coreAtom)!;
      const oldRoot = oldCoords.get(root)!;
      const oldVx = oldRoot.x - oldCore.x;
      const oldVy = oldRoot.y - oldCore.y;
      const oldLen = Math.max(Math.hypot(oldVx, oldVy), 0.001);

      // Reaction products should not have substituents cutting back through the
      // newly formed ring. Rotate each exocyclic component so its first bond
      // points radially away from the product core, while preserving the whole
      // substituent's internal geometry by the same rigid transform.
      let outX = anchor.x - center.x;
      let outY = anchor.y - center.y;
      let outLen = Math.hypot(outX, outY);
      if (outLen < 0.15) {
        outX = oldVx;
        outY = oldVy;
        outLen = Math.max(Math.hypot(outX, outY), 0.001);
      }
      outX /= outLen;
      outY /= outLen;

      const oldAngle = Math.atan2(oldVy, oldVx);
      const newAngle = Math.atan2(outY, outX);
      const angle = newAngle - oldAngle;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const scale = 1.0 / oldLen;

      for (const atom of component) {
        const old = oldCoords.get(atom)!;
        const rx = old.x - oldCore.x;
        const ry = old.y - oldCore.y;
        targetCoords.set(atom, {
          x: anchor.x + scale * (rx * cos - ry * sin),
          y: anchor.y + scale * (rx * sin + ry * cos),
        });
      }
    }
  }
}

function layoutDielsAlderBicyclic(graph: MolGraph, bicyclo: DielsAlderBicyclic): string {
  const [a, d] = bicyclo.bridgeheads;
  const orient4 = (path: [number, number, number, number]): [number, number, number, number] =>
    path[0] === a ? path : ([...path].reverse() as [number, number, number, number]);
  const diene = orient4(bicyclo.dienePath);
  const dienophile = orient4(bicyclo.dienophilePath);
  const bridge = bicyclo.internalBridge[0] === a
    ? bicyclo.internalBridge
    : ([...bicyclo.internalBridge].reverse() as [number, ...number[]]);

  const target = new Map<number, { x: number; y: number }>([
    [a, { x: 0.0, y: 1.25 }],
    [d, { x: 0.0, y: -1.25 }],
    [diene[1], { x: -1.25, y: 0.68 }],
    [diene[2], { x: -1.25, y: -0.68 }],
    [dienophile[1], { x: 1.35, y: 0.68 }],
    [dienophile[2], { x: 1.35, y: -0.68 }],
  ]);

  const bridgeInternal = bridge.slice(1, -1);
  bridgeInternal.forEach((atom, index) => {
    const t = (index + 1) / (bridgeInternal.length + 1);
    // Keep the bridge inside the outer six-membered Diels-Alder ring. A small
    // rightward bow avoids laying every bridge bond directly on top of the
    // bridgehead-to-bridgehead axis.
    target.set(atom, {
      x: 0.18 + Math.sin(Math.PI * t) * 0.16,
      y: 1.25 * (1 - 2 * t),
    });
  });

  translateExternalComponents(graph, bicyclo.core, target);
  const lines = [...graph.lines];
  for (const [atom, point] of target) {
    lines[4 + atom] = rewriteAtomLine(lines[4 + atom] ?? "", point.x, point.y);
  }
  return lines.join("\n");
}

function layoutCyclohexene(graph: MolGraph, cycle: number[]): string {
  const targetPoints = [
    { x: -1.15, y: 0.72 },
    { x: 0.0, y: 1.45 },
    { x: 1.25, y: 0.72 },
    { x: 1.25, y: -0.72 },
    { x: 0.0, y: -1.45 },
    { x: -1.15, y: -0.72 },
  ];
  const core = new Set(cycle);
  const target = new Map<number, { x: number; y: number }>();
  cycle.forEach((atom, index) => target.set(atom, targetPoints[index]));
  translateExternalComponents(graph, core, target);
  const lines = [...graph.lines];
  for (const [atom, point] of target) {
    lines[4 + atom] = rewriteAtomLine(lines[4 + atom] ?? "", point.x, point.y);
  }
  return lines.join("\n");
}

function isElectronWithdrawingBranch(graph: MolGraph, root: number, center: number) {
  if (graph.atoms[root]?.element !== "C") return false;
  for (const neighbor of graph.adjacency[root] ?? []) {
    if (neighbor === center) continue;
    const bond = bondBetween(graph, root, neighbor);
    const element = graph.atoms[neighbor]?.element;
    if (bond?.order === 3 && element === "N") return true;
    if (bond?.order === 2 && (element === "O" || element === "N" || element === "S")) return true;
  }
  return false;
}

function pickExternalStereoTarget(
  graph: MolGraph,
  core: ReadonlySet<number>,
  center: number,
  desired: 1 | 6,
  label: string,
): StereoTarget | null {
  const candidates = externalNeighbors(graph, core, center).filter(
    (neighbor) => bondBetween(graph, center, neighbor)?.order === 1,
  );
  if (candidates.length === 0) return null;
  const ranked = [...candidates].sort((left, right) => {
    const leftEwg = isElectronWithdrawingBranch(graph, left, center) ? 1 : 0;
    const rightEwg = isElectronWithdrawingBranch(graph, right, center) ? 1 : 0;
    if (leftEwg !== rightEwg) return rightEwg - leftEwg;
    return left - right;
  });
  return { center, neighbor: ranked[0], desired, label };
}

function dielsAlderTargets(
  graph: MolGraph,
  bicyclo: DielsAlderBicyclic | null,
  stereoCenters: ReadonlySet<number>,
  directive: MechanisticStereoDirective,
  includePotentialBridgeheads = false,
): StereoTarget[] {
  if (bicyclo) {
    const [a] = bicyclo.bridgeheads;
    const dienophile = bicyclo.dienophilePath[0] === a
      ? bicyclo.dienophilePath
      : ([...bicyclo.dienophilePath].reverse() as [number, number, number, number]);

    // Bridge bonds are chemical stereo encoders only when RDKit confirms that
    // the bridgehead itself has an R/S descriptor. Symmetry-equivalent
    // bridgeheads (CIP "?") use the same bold wedge only as a perspective cue.
    const bridge = bicyclo.internalBridge[0] === a
      ? bicyclo.internalBridge
      : ([...bicyclo.internalBridge].reverse() as [number, ...number[]]);
    const d = bicyclo.bridgeheads[1];
    const targets: StereoTarget[] = [];
    if (includePotentialBridgeheads || stereoCenters.has(a)) {
      targets.push({ center: a, neighbor: bridge[1], desired: 1, label: "bridge-a" });
    }
    if (includePotentialBridgeheads || stereoCenters.has(d)) {
      targets.push({
        center: d,
        neighbor: bridge[bridge.length - 2],
        desired: 1,
        label: "bridge-d",
      });
    }
    const dienophileExternalTargets: StereoTarget[] = [];
    for (const center of [dienophile[1], dienophile[2]]) {
      const externals = externalNeighbors(graph, bicyclo.core, center);
      for (const external of externals) {
        if (bondBetween(graph, center, external)?.order !== 1) continue;
        const activated = isElectronWithdrawingBranch(graph, external, center);
        const desired: 1 | 6 = activated ? 6 : 1;
        dienophileExternalTargets.push({
          center,
          neighbor: external,
          desired,
          label: "dienophile-substituent",
        });
      }
    }

    // Preserve E/Z stereochemistry of a disubstituted dienophile. Z remains
    // same-face; E remains opposite-face in the cycloadduct.
    if (dienophileExternalTargets.length >= 2) {
      const geometry = directive.dielsAlder?.dienophileGeometry ?? null;
      if (geometry === "Z") {
        dienophileExternalTargets[1].desired = dienophileExternalTargets[0].desired;
      } else if (geometry === "E") {
        dienophileExternalTargets[1].desired = dienophileExternalTargets[0].desired === 1 ? 6 : 1;
      }
    }
    targets.push(...dienophileExternalTargets);
    return targets;
  }

  const cycle = orderedSixMemberCycle(graph);
  if (!cycle) return [];
  const core = new Set(cycle);
  const targets: StereoTarget[] = [];

  // orderedSixMemberCycle() fixes the C=C at cycle[5]-cycle[0]. Therefore the
  // diene terminal atoms are cycle[1]/cycle[4], and the dienophile-derived
  // atoms are cycle[2]/cycle[3]. This lets the stereochemical rule act on atom
  // provenance rather than on a molecule name or a one-off SMARTS.
  const dieneCenters = [cycle[1], cycle[4]];
  const dienophileCenters = [cycle[2], cycle[3]];

  const dieneTargets = dieneCenters
    .map((center, index) => pickExternalStereoTarget(
      graph,
      core,
      center,
      index === 0 ? 6 : 6,
      `diene-terminal-${index + 1}`,
    ))
    .filter((target): target is StereoTarget => target !== null);

  if (dieneTargets.length >= 2) {
    const relationship = directive.dielsAlder?.dieneTerminalRelationship ?? null;
    if (relationship === "opposite") {
      dieneTargets[1].desired = dieneTargets[0].desired === 1 ? 6 : 1;
    } else if (relationship === "same") {
      dieneTargets[1].desired = dieneTargets[0].desired;
    }
  }
  targets.push(...dieneTargets);

  const dienophileTargets = dienophileCenters
    .map((center, index) => pickExternalStereoTarget(
      graph,
      core,
      center,
      6,
      `dienophile-${index + 1}`,
    ))
    .filter((target): target is StereoTarget => target !== null);

  if (dienophileTargets.length >= 2) {
    const geometry = directive.dielsAlder?.dienophileGeometry ?? null;
    if (geometry === "E") {
      dienophileTargets[1].desired = dienophileTargets[0].desired === 1 ? 6 : 1;
    } else if (geometry === "Z") {
      dienophileTargets[1].desired = dienophileTargets[0].desired;
    }
  }
  targets.push(...dienophileTargets);

  return targets;
}

function dielsAlderPerspectiveBonds(
  bicyclo: DielsAlderBicyclic,
  stereoCenters: ReadonlySet<number>,
): Array<{ center: number; neighbor: number; stereo: 1 | 6 }> {
  const [a, d] = bicyclo.bridgeheads;
  const bridge = bicyclo.internalBridge[0] === a
    ? bicyclo.internalBridge
    : ([...bicyclo.internalBridge].reverse() as [number, ...number[]]);
  return [
    ...(!stereoCenters.has(a) ? [{ center: a, neighbor: bridge[1], stereo: 1 as const }] : []),
    ...(!stereoCenters.has(d)
      ? [{ center: d, neighbor: bridge[bridge.length - 2], stereo: 1 as const }]
      : []),
  ];
}

function addPresentationStereoBonds(
  molBlock: string,
  bondsToStyle: Array<{ center: number; neighbor: number; stereo: 1 | 6 }>,
): string {
  const graph = parseV2000(molBlock);
  if (!graph) return molBlock;
  const lines = [...graph.lines];
  for (const style of bondsToStyle) {
    const bond = bondBetween(graph, style.center, style.neighbor);
    if (!bond || bond.order !== 1) continue;
    lines[bond.lineIndex] = rewriteBondLine(
      lines[bond.lineIndex] ?? "",
      style.center,
      style.neighbor,
      bond.order,
      style.stereo,
    );
  }
  return lines.join("\n");
}

function oxygenRole(graph: MolGraph, oxygen: number, carbon: number): "OH" | "OR" | null {
  if (graph.atoms[oxygen]?.element !== "O") return null;
  const heavyNeighbors = (graph.adjacency[oxygen] ?? []).filter((neighbor) => neighbor !== carbon);
  if (heavyNeighbors.length === 0) return "OH";
  if (heavyNeighbors.some((neighbor) => graph.atoms[neighbor]?.element === "C")) return "OR";
  return null;
}

function epoxideAlcoholTargets(graph: MolGraph): StereoTarget[] {
  for (const bond of graph.bonds) {
    if (bond.order !== 1) continue;
    const [left, right] = [bond.atom1, bond.atom2];
    if (graph.atoms[left]?.element !== "C" || graph.atoms[right]?.element !== "C") continue;

    const leftO = (graph.adjacency[left] ?? []).filter(
      (neighbor) => neighbor !== right && graph.atoms[neighbor]?.element === "O" && bondBetween(graph, left, neighbor)?.order === 1,
    );
    const rightO = (graph.adjacency[right] ?? []).filter(
      (neighbor) => neighbor !== left && graph.atoms[neighbor]?.element === "O" && bondBetween(graph, right, neighbor)?.order === 1,
    );
    if (leftO.length === 0 || rightO.length === 0) continue;

    for (const lo of leftO) {
      for (const ro of rightO) {
        const leftRole = oxygenRole(graph, lo, left);
        const rightRole = oxygenRole(graph, ro, right);
        if (leftRole === "OH" && rightRole === "OR") {
          return [
            { center: left, neighbor: lo, desired: 1, label: "oxygen-derived-OH" },
            { center: right, neighbor: ro, desired: 6, label: "nucleophile-OR" },
          ];
        }
        if (leftRole === "OR" && rightRole === "OH") {
          return [
            { center: right, neighbor: ro, desired: 1, label: "oxygen-derived-OH" },
            { center: left, neighbor: lo, desired: 6, label: "nucleophile-OR" },
          ];
        }
      }
    }
  }
  return [];
}

function genericVicinalTargets(graph: MolGraph, relationship: "syn" | "anti"): StereoTarget[] {
  const hetero = new Set(["O", "N", "F", "Cl", "Br", "I", "S"]);
  for (const bond of graph.bonds) {
    if (bond.order !== 1) continue;
    const [left, right] = [bond.atom1, bond.atom2];
    if (graph.atoms[left]?.element !== "C" || graph.atoms[right]?.element !== "C") continue;
    const leftSub = (graph.adjacency[left] ?? []).find(
      (neighbor) => neighbor !== right && hetero.has(graph.atoms[neighbor]?.element ?? "") && bondBetween(graph, left, neighbor)?.order === 1,
    );
    const rightSub = (graph.adjacency[right] ?? []).find(
      (neighbor) => neighbor !== left && hetero.has(graph.atoms[neighbor]?.element ?? "") && bondBetween(graph, right, neighbor)?.order === 1,
    );
    if (leftSub === undefined || rightSub === undefined) continue;
    return relationship === "syn"
      ? [
          { center: left, neighbor: leftSub, desired: 6, label: "syn-a" },
          { center: right, neighbor: rightSub, desired: 6, label: "syn-b" },
        ]
      : [
          { center: left, neighbor: leftSub, desired: 1, label: "anti-a" },
          { center: right, neighbor: rightSub, desired: 6, label: "anti-b" },
        ];
  }
  return [];
}

function clearStereoAtCenters(graph: MolGraph, centers: ReadonlySet<number>) {
  const lines = [...graph.lines];
  for (const bond of graph.bonds) {
    if (!centers.has(bond.atom1) && !centers.has(bond.atom2)) continue;
    lines[bond.lineIndex] = rewriteBondLine(
      lines[bond.lineIndex] ?? "",
      bond.atom1,
      bond.atom2,
      bond.order,
      0,
    );
  }
  return lines;
}

function assignTargets(
  molBlock: string,
  targets: StereoTarget[],
  codes: Array<1 | 6>,
): string | null {
  const graph = parseV2000(molBlock);
  if (!graph || targets.length !== codes.length) return null;
  const centers = new Set(targets.map((target) => target.center));
  const lines = clearStereoAtCenters(graph, centers);

  targets.forEach((target, index) => {
    const bond = bondBetween(graph, target.center, target.neighbor);
    if (!bond || bond.order !== 1) return;
    lines[bond.lineIndex] = rewriteBondLine(
      lines[bond.lineIndex] ?? "",
      target.center,
      target.neighbor,
      bond.order,
      codes[index],
    );
  });
  return lines.join("\n");
}

function desiredScore(targets: StereoTarget[], codes: Array<1 | 6>) {
  return targets.reduce((score, target, index) => score + (target.desired === codes[index] ? 1 : 0), 0);
}

function verifiedStereoAssignment(
  rawGetMol: RawGetMol,
  molBlock: string,
  canonical: string,
  targets: StereoTarget[],
): PreparedDepiction | null {
  if (targets.length === 0) return { molBlock, desiredMatches: 0, targetCount: 0 };
  if (targets.length > 8) return null;

  let best: PreparedDepiction | null = null;
  const variants = 1 << targets.length;
  for (let mask = 0; mask < variants; mask += 1) {
    const codes = targets.map((_, index) => ((mask >> index) & 1 ? 6 : 1) as 1 | 6);
    const candidate = assignTargets(molBlock, targets, codes);
    if (!candidate) continue;
    const mol = rawGetMol(candidate);
    if (!mol) continue;
    try {
      const candidateCanonical = mol.get_smiles?.();
      if (candidateCanonical !== canonical) continue;
      const score = desiredScore(targets, codes);
      if (!best || score > best.desiredMatches) {
        best = { molBlock: candidate, desiredMatches: score, targetCount: targets.length };
        if (score === targets.length) break;
      }
    } finally {
      mol.delete?.();
    }
  }
  return best;
}

function prepareFromMol(
  rawGetMol: RawGetMol,
  smiles: string,
  directive: MechanisticStereoDirective,
  sourceStructure?: string,
): PreparedDepiction | null {
  const source =
    directive.kind !== "diels-alder" && sourceStructure && looksLikeMolBlock(sourceStructure)
      ? sourceStructure
      : smiles;
  const mol = rawGetMol(source);
  if (!mol) return null;
  try {
    const canonical = mol.get_smiles?.();
    if (!canonical) return null;
    const stereoCenters = cipStereoAtomSet(mol);
    if (!looksLikeMolBlock(source)) mol.set_new_coords?.();
    let molBlock = mol.get_molblock?.();
    if (!molBlock || !molBlock.includes("V2000")) return null;
    let graph = parseV2000(molBlock);
    if (!graph) return null;

    let targets: StereoTarget[] = [];
    let dielsBicyclo: DielsAlderBicyclic | null = null;
    if (directive.kind === "diels-alder") {
      dielsBicyclo = findDielsAlderBicyclic(graph);
      if (dielsBicyclo) {
        molBlock = layoutDielsAlderBicyclic(graph, dielsBicyclo);
        graph = parseV2000(molBlock) ?? graph;
        dielsBicyclo = findDielsAlderBicyclic(graph) ?? dielsBicyclo;
        targets = dielsAlderTargets(graph, dielsBicyclo, stereoCenters, directive);
      } else {
        const cycle = orderedSixMemberCycle(graph);
        if (cycle) {
          molBlock = layoutCyclohexene(graph, cycle);
          graph = parseV2000(molBlock) ?? graph;
        }
        targets = dielsAlderTargets(graph, null, stereoCenters, directive);
      }
    } else if (directive.kind === "epoxide-alcohol-opening") {
      targets = epoxideAlcoholTargets(graph);
    } else if (directive.kind === "syn-vicinal") {
      targets = genericVicinalTargets(graph, "syn");
    } else if (directive.kind === "anti-vicinal") {
      targets = genericVicinalTargets(graph, "anti");
    } else {
      return { molBlock, desiredMatches: 0, targetCount: 0 };
    }

    const verified = verifiedStereoAssignment(rawGetMol, molBlock, canonical, targets) ?? {
      molBlock,
      desiredMatches: 0,
      targetCount: targets.length,
    };

    // Perspective bridge wedges are deliberately applied *after* canonical
    // stereochemical verification. Re-parsing them as atom chirality would
    // incorrectly reject textbook bridge perspective on symmetric bridgeheads.
    if (directive.kind === "diels-alder" && dielsBicyclo) {
      verified.molBlock = addPresentationStereoBonds(
        verified.molBlock,
        dielsAlderPerspectiveBonds(dielsBicyclo, stereoCenters),
      );
    }

    return verified;
  } finally {
    mol.delete?.();
  }
}

function connectivitySmiles(mol: RawMol): string | null {
  try {
    return mol.get_smiles?.(JSON.stringify({ doIsomericSmiles: false })) ?? null;
  } catch {
    return null;
  }
}

/**
 * Complete reaction-created stereocenters when the legacy product generator
 * returned only connectivity. The completed structure is accepted only when
 * its connectivity-only canonical SMILES is exactly unchanged.
 */
export function completeStereoRepresentative(
  rawGetMol: RawGetMol,
  productSmiles: string,
  directive: MechanisticStereoDirective,
): string | null {
  const originalMol = rawGetMol(productSmiles);
  if (!originalMol) return null;
  let connectivity: string | null = null;
  try {
    connectivity = connectivitySmiles(originalMol);
  } finally {
    originalMol.delete?.();
  }
  if (!connectivity) return null;

  const mol = rawGetMol(connectivity);
  if (!mol) return null;
  try {
    mol.set_new_coords?.();
    let molBlock = mol.get_molblock?.();
    if (!molBlock || !molBlock.includes("V2000")) return null;
    let graph = parseV2000(molBlock);
    if (!graph) return null;

    let targets: StereoTarget[] = [];
    if (directive.kind === "diels-alder") {
      const bicyclo = findDielsAlderBicyclic(graph);
      if (bicyclo) {
        molBlock = layoutDielsAlderBicyclic(graph, bicyclo);
        graph = parseV2000(molBlock) ?? graph;
        const remapped = findDielsAlderBicyclic(graph) ?? bicyclo;
        targets = dielsAlderTargets(graph, remapped, new Set(), directive, true);
      } else {
        const cycle = orderedSixMemberCycle(graph);
        if (cycle) {
          molBlock = layoutCyclohexene(graph, cycle);
          graph = parseV2000(molBlock) ?? graph;
        }
        targets = dielsAlderTargets(graph, null, new Set(), directive, true);
      }
    } else if (directive.kind === "epoxide-alcohol-opening") {
      targets = epoxideAlcoholTargets(graph);
    } else if (directive.kind === "syn-vicinal") {
      targets = genericVicinalTargets(graph, "syn");
    } else if (directive.kind === "anti-vicinal") {
      targets = genericVicinalTargets(graph, "anti");
    } else {
      return null;
    }

    if (targets.length === 0 || targets.length > 8) return null;
    const desiredCodes = targets.map((target) => target.desired);
    for (const codes of [
      desiredCodes,
      desiredCodes.map((code) => (code === 1 ? 6 : 1) as 1 | 6),
    ]) {
      const candidateBlock = assignTargets(molBlock, targets, codes);
      if (!candidateBlock) continue;
      const candidateMol = rawGetMol(candidateBlock);
      if (!candidateMol) continue;
      try {
        if (connectivitySmiles(candidateMol) !== connectivity) continue;
        const candidate = candidateMol.get_smiles?.() ?? null;
        if (candidate && /@/.test(candidate)) return candidate;
      } finally {
        candidateMol.delete?.();
      }
    }
    return null;
  } finally {
    mol.delete?.();
  }
}

export function scoreStereoRepresentative(
  rawGetMol: RawGetMol,
  smiles: string,
  directive: MechanisticStereoDirective,
): number {
  const prepared = prepareFromMol(rawGetMol, smiles, directive);
  if (!prepared) return -1;
  return prepared.targetCount === 0
    ? 0
    : prepared.desiredMatches / prepared.targetCount;
}

export function renderWithMechanisticStereoDirective(
  rawGetMol: RawGetMol,
  smiles: string,
  directive: MechanisticStereoDirective,
  drawOptions?: string,
  sourceStructure?: string,
): string | null {
  const prepared = prepareFromMol(rawGetMol, smiles, directive, sourceStructure);
  if (!prepared) return null;
  const presentationMol = rawGetMol(prepared.molBlock);
  if (!presentationMol) return null;
  try {
    return presentationMol.get_svg_with_highlights?.(drawOptions) ?? null;
  } finally {
    presentationMol.delete?.();
  }
}

/**
 * Diagnostic/regression entry point. It exposes the final verified V2000
 * presentation used by the mechanism runtime so tests can assert wedge/hash
 * placement without scraping SVG path geometry.
 */
export function prepareMechanisticStereoMolBlock(
  rawGetMol: RawGetMol,
  smiles: string,
  directive: MechanisticStereoDirective,
  sourceStructure?: string,
): string | null {
  return prepareFromMol(rawGetMol, smiles, directive, sourceStructure)?.molBlock ?? null;
}
