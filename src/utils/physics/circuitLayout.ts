/**
 * Geometry of the resistor-network diagram, derived from the circuit tree (pure; no React).
 *
 * The layout emits the drawing as primitives: resistors (with their two terminal points) and wire segments, in integer
 * coordinates. Because every wire endpoint is an exact integer, the drawing can be turned back into a netlist by merging
 * coincident endpoints; the tests do that and solve the netlist independently to prove that what is drawn is the same
 * electrical network as the tree the calculations use.
 */
import { type Circuit, type CircuitNode } from "./circuits";

export interface Pt { x: number; y: number }
export interface Wire { a: Pt; b: Pt }
export interface PlacedResistor { id: string; label: string; a: Pt; b: Pt }
export interface PlacedSource { plus: Pt; minus: Pt }
export interface CircuitDrawing {
  width: number;
  height: number;
  wires: Wire[];
  resistors: PlacedResistor[];
  source: PlacedSource;
  /** Group boxes (for highlighting a selected group). */
  groups: Array<{ id: string; kind: "series" | "parallel"; x: number; y: number; w: number; h: number }>;
}

export const GEO = {
  resistorW: 90,
  resistorH: 44,
  seriesGap: 36,
  busGap: 28,
  railMargin: 40,
  sourceX: 40,
  stub: 28,
  pad: 24,
  /** Room above and below a resistor for its label and annotations. */
  note: 34,
} as const;

interface Box { w: number; above: number; below: number }

function measure(n: CircuitNode, cache: Map<string, Box>): Box {
  let box: Box;
  if (n.kind === "resistor") {
    box = { w: GEO.resistorW, above: GEO.resistorH / 2 + GEO.note, below: GEO.resistorH / 2 + GEO.note };
  } else if (n.kind === "series") {
    const kids = n.children.map((c) => measure(c, cache));
    box = {
      w: kids.reduce((s, k) => s + k.w, 0) + GEO.seriesGap * (kids.length - 1),
      above: Math.max(...kids.map((k) => k.above)),
      below: Math.max(...kids.map((k) => k.below)),
    };
  } else {
    const kids = n.children.map((c) => measure(c, cache));
    const inner = Math.max(...kids.map((k) => k.w));
    const total = kids.reduce((s, k) => s + k.above + k.below, 0);
    // the group's centre line is half-way between its first and last branch lines (where the buses meet the terminals)
    const firstMid = kids[0].above;
    const lastMid = total - kids[kids.length - 1].below;
    const mid = (firstMid + lastMid) / 2;
    box = { w: inner + 2 * GEO.busGap, above: mid, below: total - mid };
  }
  cache.set(n.id, box);
  return box;
}

/** Place a part so that its left terminal is at (x, y) on its centre line. Returns the x of its right terminal. */
function place(n: CircuitNode, x: number, y: number, cache: Map<string, Box>, out: CircuitDrawing): number {
  const box = cache.get(n.id)!;
  if (n.kind === "resistor") {
    out.resistors.push({ id: n.id, label: n.label, a: { x, y }, b: { x: x + box.w, y } });
    return x + box.w;
  }
  if (n.kind === "series") {
    let cx = x;
    n.children.forEach((c, i) => {
      const end = place(c, cx, y, cache, out);
      if (i < n.children.length - 1) { out.wires.push({ a: { x: end, y }, b: { x: end + GEO.seriesGap, y } }); cx = end + GEO.seriesGap; } else cx = end;
    });
    out.groups.push({ id: n.id, kind: "series", x, y: y - box.above, w: box.w, h: box.above + box.below });
    return x + box.w;
  }
  // parallel: the branches are stacked and joined by a vertical bus at each end
  const kids = n.children.map((c) => cache.get(c.id)!);
  const inner = Math.max(...kids.map((k) => k.w));
  const top = y - box.above;
  const left = x + GEO.busGap;
  const right = x + GEO.busGap + inner;
  let cursor = top;
  const mids: number[] = [];
  n.children.forEach((c, i) => {
    const k = kids[i];
    const my = cursor + k.above;
    mids.push(my);
    const offset = Math.round((inner - k.w) / 2);
    if (offset > 0) out.wires.push({ a: { x: left, y: my }, b: { x: left + offset, y: my } });
    const end = place(c, left + offset, my, cache, out);
    if (end < right) out.wires.push({ a: { x: end, y: my }, b: { x: right, y: my } });
    cursor += k.above + k.below;
  });
  // each bus is cut at every branch line, so a bus segment always ends exactly where a branch (or the group terminal) joins it
  const ys = [...new Set([...mids, y])].sort((p, q) => p - q);
  for (let i = 0; i + 1 < ys.length; i += 1) {
    out.wires.push({ a: { x: left, y: ys[i] }, b: { x: left, y: ys[i + 1] } });
    out.wires.push({ a: { x: right, y: ys[i] }, b: { x: right, y: ys[i + 1] } });
  }
  out.wires.push({ a: { x, y }, b: { x: left, y } });
  out.wires.push({ a: { x: right, y }, b: { x: x + box.w, y } });
  out.groups.push({ id: n.id, kind: "parallel", x, y: top, w: box.w, h: box.above + box.below });
  return x + box.w;
}

export function layoutCircuit(circuit: Circuit): CircuitDrawing {
  const cache = new Map<string, Box>();
  const box = measure(circuit.root, cache);
  const netX = GEO.sourceX + 2 * GEO.pad + GEO.stub + 40;
  const midY = GEO.railMargin + box.above;
  const out: CircuitDrawing = {
    width: 0, height: 0, wires: [], resistors: [], groups: [],
    source: { plus: { x: GEO.sourceX, y: midY - 30 }, minus: { x: GEO.sourceX, y: midY + 30 } },
  };
  const end = place(circuit.root, netX, midY, cache, out);
  const railTop = midY - box.above - GEO.railMargin / 2;
  const railBottom = midY + box.below + GEO.railMargin / 2;
  const left = netX - GEO.stub;
  const right = end + GEO.stub;
  // stubs join the network's two terminals to the top and bottom rails, which return to the source's + and − terminals
  out.wires.push({ a: { x: left, y: midY }, b: { x: netX, y: midY } });
  out.wires.push({ a: { x: end, y: midY }, b: { x: right, y: midY } });
  out.wires.push({ a: { x: left, y: midY }, b: { x: left, y: railTop } });
  out.wires.push({ a: { x: left, y: railTop }, b: { x: GEO.sourceX, y: railTop } });
  out.wires.push({ a: { x: GEO.sourceX, y: railTop }, b: out.source.plus });
  out.wires.push({ a: { x: right, y: midY }, b: { x: right, y: railBottom } });
  out.wires.push({ a: { x: right, y: railBottom }, b: { x: GEO.sourceX, y: railBottom } });
  out.wires.push({ a: { x: GEO.sourceX, y: railBottom }, b: out.source.minus });
  out.width = right + GEO.pad + 20;
  out.height = railBottom + GEO.pad;
  return out;
}
