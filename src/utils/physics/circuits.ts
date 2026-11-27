/**
 * DC resistive networks (pure; no React).
 *
 * Supported circuits: one ideal DC voltage source driving a series/parallel tree of ideal resistors. The tree IS the circuit:
 * a node is a resistor, a series group (children joined end to end) or a parallel group (children joined between two common
 * junctions). The diagram is drawn from the same tree, so the picture and the mathematics cannot describe different circuits.
 *
 * Conventions: conventional current leaves the source's + terminal, flows left to right through the network and returns to the
 * − terminal. The voltage across a component is V(left) − V(right), positive in the direction of the current, so every
 * resistor has V = I·R > 0 and dissipates P = V·I > 0. Networks that are not series/parallel reducible (a Wheatstone bridge, for
 * example) cannot be written as such a tree and are therefore not supported.
 */

export const CIRCUIT_LIMITS = {
  minR: 1e-3,
  maxR: 1e9,
  maxV: 1000,
  maxResistors: 12,
  maxDepth: 4,
  maxIdLength: 24,
  maxLabelLength: 24,
} as const;

export type ResistorNode = { kind: "resistor"; id: string; label: string; ohms: number };
export type GroupNode = { kind: "series" | "parallel"; id: string; children: CircuitNode[] };
export type CircuitNode = ResistorNode | GroupNode;

export interface Circuit {
  /** Ideal source voltage (V), > 0. */
  voltage: number;
  root: CircuitNode;
}

export const DEFAULT_CIRCUIT: Circuit = {
  voltage: 12,
  root: {
    kind: "series",
    id: "g1",
    children: [
      { kind: "resistor", id: "r1", label: "R1", ohms: 100 },
      {
        kind: "parallel",
        id: "g2",
        children: [
          { kind: "resistor", id: "r2", label: "R2", ohms: 200 },
          { kind: "resistor", id: "r3", label: "R3", ohms: 300 },
        ],
      },
    ],
  },
};

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export type Validated<T> = { ok: true; value: T } | { ok: false; errors: string[] };

/** Strict validation. New objects are built from known fields; nothing is coerced; unsupported structures are rejected, not guessed. */
export function validateCircuit(raw: unknown): Validated<Circuit> {
  const errors: string[] = [];
  if (!isObject(raw)) return { ok: false, errors: ["The circuit is missing."] };
  if (!finite(raw.voltage) || raw.voltage <= 0 || raw.voltage > CIRCUIT_LIMITS.maxV) errors.push(`Source voltage must be greater than 0 and at most ${CIRCUIT_LIMITS.maxV} V.`);
  const ids = new Set<string>();
  let resistors = 0;
  const build = (n: unknown, depth: number): CircuitNode | null => {
    if (!isObject(n)) { errors.push("A circuit element is malformed."); return null; }
    if (typeof n.id !== "string" || !/^[A-Za-z0-9_-]{1,24}$/.test(n.id)) { errors.push("A circuit element has an invalid id."); return null; }
    if (ids.has(n.id)) { errors.push(`Element id “${n.id}” is used twice.`); return null; }
    ids.add(n.id);
    if (n.kind === "resistor") {
      resistors += 1;
      if (typeof n.label !== "string" || n.label.length === 0 || n.label.length > CIRCUIT_LIMITS.maxLabelLength) { errors.push(`Resistor ${n.id} needs a name of 1–${CIRCUIT_LIMITS.maxLabelLength} characters.`); return null; }
      if (!finite(n.ohms) || n.ohms < CIRCUIT_LIMITS.minR || n.ohms > CIRCUIT_LIMITS.maxR) { errors.push(`${n.label} must be between ${CIRCUIT_LIMITS.minR} Ω and ${CIRCUIT_LIMITS.maxR} Ω.`); return null; }
      return { kind: "resistor", id: n.id, label: n.label, ohms: n.ohms };
    }
    if (n.kind === "series" || n.kind === "parallel") {
      if (depth >= CIRCUIT_LIMITS.maxDepth) { errors.push(`Groups can be nested at most ${CIRCUIT_LIMITS.maxDepth} levels deep.`); return null; }
      if (!Array.isArray(n.children) || n.children.length < 2 || n.children.length > CIRCUIT_LIMITS.maxResistors) { errors.push(`A ${n.kind} group needs between 2 and ${CIRCUIT_LIMITS.maxResistors} parts.`); return null; }
      const children: CircuitNode[] = [];
      for (const c of n.children) { const built = build(c, depth + 1); if (built) children.push(built); }
      if (children.length !== n.children.length) return null;
      return { kind: n.kind, id: n.id, children };
    }
    errors.push("Only resistors and series or parallel groups are supported.");
    return null;
  };
  const root = build(raw.root, 0);
  if (resistors > CIRCUIT_LIMITS.maxResistors) errors.push(`At most ${CIRCUIT_LIMITS.maxResistors} resistors are supported.`);
  if (errors.length || !root) return { ok: false, errors: errors.length ? errors : ["The circuit could not be read."] };
  return { ok: true, value: { voltage: raw.voltage as number, root } };
}

// ---- analysis ------------------------------------------------------------------------------------------------------------------------

export interface NodeResult {
  id: string;
  kind: CircuitNode["kind"];
  label: string;
  /** Equivalent resistance of this part (Ω). */
  resistance: number;
  /** Voltage across this part (V) and the current through it (A). */
  voltage: number;
  current: number;
  /** Power dissipated in this part (W). */
  power: number;
  /** Fraction of the total current this part carries. */
  currentShare: number;
  depth: number;
  parentId: string | null;
}

export interface CircuitAnalysis {
  voltage: number;
  equivalent: number;
  current: number;
  power: number;
  nodes: NodeResult[];
  byId: Record<string, NodeResult>;
  resistors: NodeResult[];
  /** Largest violation of KCL (A) over every junction, and of KVL (V) over every loop through a resistor. */
  kclResidual: number;
  kvlResidual: number;
  /** |source power − Σ resistor power| (W). */
  powerResidual: number;
  kvlLoops: Array<{ resistorId: string; label: string; terms: Array<{ id: string; label: string; volts: number }>; sum: number }>;
  kclJunctions: Array<{ groupId: string; inflow: number; outflow: Array<{ id: string; label: string; amps: number }> }>;
}

export function equivalentResistance(n: CircuitNode): number {
  if (n.kind === "resistor") return n.ohms;
  if (n.kind === "series") return n.children.reduce((s, c) => s + equivalentResistance(c), 0);
  return 1 / n.children.reduce((s, c) => s + 1 / equivalentResistance(c), 0);
}

export function resistorsOf(n: CircuitNode): ResistorNode[] {
  return n.kind === "resistor" ? [n] : n.children.flatMap(resistorsOf);
}

export function analyzeCircuit(circuit: Circuit): CircuitAnalysis {
  const nodes: NodeResult[] = [];
  const reqCache = new Map<string, number>();
  const req = (n: CircuitNode): number => {
    const cached = reqCache.get(n.id);
    if (cached !== undefined) return cached;
    const v = n.kind === "resistor" ? n.ohms : n.kind === "series" ? n.children.reduce((s, c) => s + req(c), 0) : 1 / n.children.reduce((s, c) => s + 1 / req(c), 0);
    reqCache.set(n.id, v);
    return v;
  };
  const Req = req(circuit.root);
  const Itotal = circuit.voltage / Req;
  let seriesN = 0;
  let parallelN = 0;
  const names = new Map<string, string>();
  const walk = (n: CircuitNode, V: number, I: number, depth: number, parentId: string | null) => {
    const label = n.kind === "resistor" ? n.label : n.kind === "series" ? `Series group ${(seriesN += 1)}` : `Parallel group ${(parallelN += 1)}`;
    names.set(n.id, label);
    nodes.push({ id: n.id, kind: n.kind, label, resistance: req(n), voltage: V, current: I, power: V * I, currentShare: I / Itotal, depth, parentId });
    if (n.kind === "series") for (const c of n.children) walk(c, I * req(c), I, depth + 1, n.id);
    else if (n.kind === "parallel") for (const c of n.children) walk(c, V, V / req(c), depth + 1, n.id);
  };
  walk(circuit.root, circuit.voltage, Itotal, 0, null);
  const byId: Record<string, NodeResult> = Object.fromEntries(nodes.map((x) => [x.id, x]));
  const resistors = nodes.filter((x) => x.kind === "resistor");

  // KCL: at the junction that opens a parallel group, the current in equals the sum over the branches.
  const kclJunctions: CircuitAnalysis["kclJunctions"] = [];
  const kvlLoops: CircuitAnalysis["kvlLoops"] = [];
  const findGroups = (n: CircuitNode) => {
    if (n.kind === "parallel") {
      kclJunctions.push({ groupId: n.id, inflow: byId[n.id].current, outflow: n.children.map((c) => ({ id: c.id, label: names.get(c.id)!, amps: byId[c.id].current })) });
    }
    if (n.kind !== "resistor") n.children.forEach(findGroups);
  };
  findGroups(circuit.root);
  let kcl = 0;
  for (const j of kclJunctions) kcl = Math.max(kcl, Math.abs(j.inflow - j.outflow.reduce((s, o) => s + o.amps, 0)));
  // Series groups: the same current through every part (KCL on the connecting nodes).
  const checkSeries = (n: CircuitNode) => {
    if (n.kind === "series") for (const c of n.children) kcl = Math.max(kcl, Math.abs(byId[c.id].current - byId[n.id].current));
    if (n.kind !== "resistor") n.children.forEach(checkSeries);
  };
  checkSeries(circuit.root);

  // KVL: one loop for each resistor: source → the series siblings met on the way down (their voltages) → the resistor.
  let kvl = 0;
  const loops = (n: CircuitNode, siblingsAbove: Array<{ id: string; label: string; volts: number }>) => {
    if (n.kind === "resistor") {
      const terms = [...siblingsAbove, { id: n.id, label: n.label, volts: byId[n.id].voltage }];
      const sum = terms.reduce((s, t) => s + t.volts, 0);
      kvl = Math.max(kvl, Math.abs(sum - circuit.voltage));
      kvlLoops.push({ resistorId: n.id, label: n.label, terms, sum });
    } else if (n.kind === "series") {
      for (const c of n.children) {
        const others = n.children.filter((o) => o !== c).map((o) => ({ id: o.id, label: names.get(o.id)!, volts: byId[o.id].voltage }));
        loops(c, [...siblingsAbove, ...others]);
      }
    } else {
      for (const c of n.children) loops(c, siblingsAbove);
    }
  };
  loops(circuit.root, []);

  const sourcePower = circuit.voltage * Itotal;
  const sum = resistors.reduce((s, r) => s + r.power, 0);
  return { voltage: circuit.voltage, equivalent: Req, current: Itotal, power: sourcePower, nodes, byId, resistors, kclResidual: kcl, kvlResidual: kvl, powerResidual: Math.abs(sourcePower - sum), kvlLoops, kclJunctions };
}

// ---- editing helpers (immutable; used by the structured editor and the tests) -----------------------------------------------------------

let idCounter = 0;
export function nextId(circuit: Circuit, prefix: string): string {
  const used = new Set<string>();
  const collect = (n: CircuitNode) => { used.add(n.id); if (n.kind !== "resistor") n.children.forEach(collect); };
  collect(circuit.root);
  let id: string;
  do { idCounter += 1; id = `${prefix}${idCounter}`; } while (used.has(id));
  return id;
}

function nextResistorLabel(circuit: Circuit): string {
  const labels = new Set(resistorsOf(circuit.root).map((r) => r.label));
  for (let i = 1; i < 100; i += 1) if (!labels.has(`R${i}`)) return `R${i}`;
  return "R";
}

const mapNode = (n: CircuitNode, id: string, fn: (node: CircuitNode) => CircuitNode | null): CircuitNode | null => {
  if (n.id === id) return fn(n);
  if (n.kind === "resistor") return n;
  const children: CircuitNode[] = [];
  for (const c of n.children) { const r = mapNode(c, id, fn); if (r) children.push(r); }
  if (children.length === n.children.length && children.every((c, i) => c === n.children[i])) return n;
  // a group left with a single part collapses into that part; an empty group disappears
  if (children.length === 0) return null;
  if (children.length === 1) return children[0];
  return { ...n, children };
};

export function setResistance(c: Circuit, id: string, ohms: number): Circuit {
  const root = mapNode(c.root, id, (n) => (n.kind === "resistor" ? { ...n, ohms } : n))!;
  return { ...c, root };
}
export function setLabel(c: Circuit, id: string, label: string): Circuit {
  const root = mapNode(c.root, id, (n) => (n.kind === "resistor" ? { ...n, label } : n))!;
  return { ...c, root };
}
/** Remove a part. A group left with one part becomes that part. The last resistor cannot be removed. */
export function removeNode(c: Circuit, id: string): Circuit {
  if (c.root.id === id || resistorsOf(c.root).length <= 1) return c;
  const root = mapNode(c.root, id, () => null);
  return root ? { ...c, root } : c;
}
/** Switch a group between series and parallel. */
export function toggleGroupKind(c: Circuit, id: string): Circuit {
  const root = mapNode(c.root, id, (n) => (n.kind === "series" ? { ...n, kind: "parallel" as const } : n.kind === "parallel" ? { ...n, kind: "series" as const } : n))!;
  return { ...c, root };
}
/** Add a resistor to a group, or beside a lone resistor (which turns it into a group of the given kind). */
export function addResistor(c: Circuit, targetId: string, kind: "series" | "parallel", ohms = 100): Circuit {
  if (resistorsOf(c.root).length >= CIRCUIT_LIMITS.maxResistors) return c;
  const fresh: ResistorNode = { kind: "resistor", id: nextId(c, "r"), label: nextResistorLabel(c), ohms };
  const root = mapNode(c.root, targetId, (n) => (n.kind === "resistor" ? { kind, id: nextId(c, "g"), children: [n, fresh] } : { ...n, children: [...n.children, fresh] }))!;
  const next = { ...c, root };
  return depthOf(next.root) > CIRCUIT_LIMITS.maxDepth ? c : next;
}
export function depthOf(n: CircuitNode): number {
  return n.kind === "resistor" ? 0 : 1 + Math.max(...n.children.map(depthOf));
}
/** The set of presets offered by the editor. */
export const CIRCUIT_PRESETS: Array<{ label: string; circuit: Circuit }> = [
  {
    label: "Series: 3 resistors",
    circuit: { voltage: 9, root: { kind: "series", id: "g1", children: [{ kind: "resistor", id: "r1", label: "R1", ohms: 100 }, { kind: "resistor", id: "r2", label: "R2", ohms: 200 }, { kind: "resistor", id: "r3", label: "R3", ohms: 300 }] } },
  },
  {
    label: "Parallel: 3 resistors",
    circuit: { voltage: 12, root: { kind: "parallel", id: "g1", children: [{ kind: "resistor", id: "r1", label: "R1", ohms: 100 }, { kind: "resistor", id: "r2", label: "R2", ohms: 200 }, { kind: "resistor", id: "r3", label: "R3", ohms: 300 }] } },
  },
  { label: "R1 in series with (R2 ∥ R3)", circuit: DEFAULT_CIRCUIT },
  {
    label: "(R1 + R2) ∥ (R3 + R4)",
    circuit: {
      voltage: 10,
      root: {
        kind: "parallel", id: "g1",
        children: [
          { kind: "series", id: "g2", children: [{ kind: "resistor", id: "r1", label: "R1", ohms: 100 }, { kind: "resistor", id: "r2", label: "R2", ohms: 150 }] },
          { kind: "series", id: "g3", children: [{ kind: "resistor", id: "r3", label: "R3", ohms: 200 }, { kind: "resistor", id: "r4", label: "R4", ohms: 50 }] },
        ],
      },
    },
  },
];

/** Human-readable structure, e.g. "R1 + (R2 ∥ R3)". */
export function describeStructure(n: CircuitNode): string {
  if (n.kind === "resistor") return n.label;
  const sep = n.kind === "series" ? " + " : " ∥ ";
  return n.children.map((c) => (c.kind !== "resistor" ? `(${describeStructure(c)})` : c.label)).join(sep);
}
