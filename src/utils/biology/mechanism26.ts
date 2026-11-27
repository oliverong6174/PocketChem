/**
 * Stage 26: shared mechanism infrastructure for the three Cell Organization and Regulation tools.
 *
 * Two small, typed building blocks, nothing more (this is not a whole-cell simulator):
 *   1. RegGraph: a curated causal graph of boolean molecular states. Every derived node is an explicit expression of other nodes
 *      (all / any / not), so the diagram arrows, the explanation text and the outcome are all read from the same data. Graphs are
 *      validated (unknown references, duplicate ids, cycles, inputs with rules, derived nodes without rules).
 *   2. Perturbation: a loss or gain of function that FORCES one node ON or OFF. Contradictory sets are rejected.
 * States are qualitative (active / inactive). No kinetics, concentrations or durations are implied anywhere.
 */

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

export type Expr = string | { all: Expr[] } | { any: Expr[] } | { not: Expr };
export const all = (...e: Expr[]): Expr => ({ all: e });
export const any = (...e: Expr[]): Expr => ({ any: e });
export const not = (e: Expr): Expr => ({ not: e });

/** How firmly the biology behind a node is established, shown to the learner and never hidden. */
export type Evidence = "established" | "context-dependent" | "simplified";

export interface RegNode {
  id: string;
  label: string;
  /** Diagram module (view) the node belongs to. */
  module: string;
  kind: "input" | "derived";
  /** Required for derived nodes; forbidden for inputs. */
  expr?: Expr;
  /** Default value of an input (ignored for derived nodes). */
  default?: boolean;
  /** Where in the cell the component acts. */
  where: string;
  /** What it does, in a sentence. */
  role: string;
  evidence: Evidence;
  /** Caveat shown with the node when it is not simply true everywhere. */
  caveat?: string;
}
export interface RegGraph { id: string; nodes: RegNode[] }

export interface Perturbation {
  id: string;
  label: string;
  /** The node whose state is forced. */
  target: string;
  /** The forced value: false = loss of function / inhibition, true = constitutive activity. */
  force: boolean;
  kind: "loss" | "gain";
  explanation: string;
}

export function exprRefs(e: Expr, sign = 1, out: Array<{ id: string; sign: 1 | -1 }> = []): Array<{ id: string; sign: 1 | -1 }> {
  if (typeof e === "string") out.push({ id: e, sign: sign as 1 | -1 });
  else if ("not" in e) exprRefs(e.not, -sign, out);
  else if ("all" in e) e.all.forEach((x) => exprRefs(x, sign, out));
  else e.any.forEach((x) => exprRefs(x, sign, out));
  return out;
}

function evalExpr(e: Expr, v: Record<string, boolean>): boolean {
  if (typeof e === "string") return v[e];
  if ("not" in e) return !evalExpr(e.not, v);
  if ("all" in e) return e.all.every((x) => evalExpr(x, v));
  return e.any.some((x) => evalExpr(x, v));
}

/** Returns a list of structural errors (empty = valid) and, when valid, the evaluation order. */
export function validateGraph(g: RegGraph): { errors: string[]; order: string[] } {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const n of g.nodes) {
    if (ids.has(n.id)) errors.push(`duplicate node id ${n.id}`);
    ids.add(n.id);
    if (n.kind === "input" && n.expr !== undefined) errors.push(`input ${n.id} must not have a rule`);
    if (n.kind === "derived" && n.expr === undefined) errors.push(`derived node ${n.id} has no rule`);
  }
  for (const n of g.nodes) if (n.expr !== undefined) for (const r of exprRefs(n.expr)) if (!ids.has(r.id)) errors.push(`${n.id} refers to unknown node ${r.id}`);
  const order: string[] = [];
  const state = new Map<string, 0 | 1 | 2>();
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const visit = (id: string, stack: string[]) => {
    const st = state.get(id) ?? 0;
    if (st === 2) return;
    if (st === 1) { errors.push(`cycle: ${[...stack, id].join(" → ")}`); return; }
    state.set(id, 1);
    const n = byId.get(id);
    if (n?.expr !== undefined) for (const r of exprRefs(n.expr)) if (byId.has(r.id)) visit(r.id, [...stack, id]);
    state.set(id, 2);
    order.push(id);
  };
  g.nodes.forEach((n) => visit(n.id, []));
  return { errors, order };
}

export interface Evaluation {
  values: Record<string, boolean>;
  /** Nodes whose value was set by a perturbation rather than by their rule or input. */
  forced: Record<string, boolean>;
  /** For each derived node: the direct dependencies and their values, in rule order. */
  because: Record<string, Array<{ id: string; sign: 1 | -1; value: boolean }>>;
}

const orderCache = new WeakMap<RegGraph, string[]>();
export function evaluateGraph(g: RegGraph, inputs: Record<string, boolean>, perturbations: readonly Perturbation[] = []): Evaluation {
  let order = orderCache.get(g);
  if (!order) {
    const v = validateGraph(g);
    if (v.errors.length) throw new Error(`Invalid graph ${g.id}: ${v.errors.join("; ")}`);
    order = v.order; orderCache.set(g, order);
  }
  const forced: Record<string, boolean> = {};
  for (const p of perturbations) forced[p.target] = p.force;
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const values: Record<string, boolean> = {};
  const because: Evaluation["because"] = {};
  for (const id of order) {
    const n = byId.get(id)!;
    let val = n.kind === "input" ? (inputs[id] ?? n.default ?? false) : evalExpr(n.expr as Expr, values);
    if (n.kind === "derived") because[id] = exprRefs(n.expr as Expr).map((r) => ({ id: r.id, sign: r.sign, value: values[r.id] }));
    if (id in forced) val = forced[id];
    values[id] = val;
  }
  return { values, forced, because };
}

/** Rejects unknown, duplicate or contradictory perturbation ids. */
export function validatePerturbations(ids: unknown, catalogue: readonly Perturbation[], max: number): Checked<string[]> {
  if (!Array.isArray(ids) || ids.length > max) return { ok: false, error: `At most ${max} perturbations.` };
  const seen = new Set<string>(), targets = new Map<string, boolean>();
  for (const id of ids) {
    if (typeof id !== "string" || seen.has(id)) return { ok: false, error: "Perturbations must be unique ids." };
    const p = catalogue.find((c) => c.id === id);
    if (!p) return { ok: false, error: `Perturbation "${String(id)}" is not supported.` };
    if (targets.has(p.target)) return { ok: false, error: `Perturbations act on the same component (${p.target}).` };
    seen.add(id); targets.set(p.target, p.force);
  }
  return { ok: true, value: ids as string[] };
}
export const pertById = (catalogue: readonly Perturbation[], ids: readonly string[]): Perturbation[] => ids.map((id) => catalogue.find((c) => c.id === id)!).filter(Boolean);
/** True when adding `id` to `current` is allowed (not already present, no target clash, under the limit). */
export function canAdd(catalogue: readonly Perturbation[], current: readonly string[], id: string, max: number): boolean {
  const p = catalogue.find((c) => c.id === id);
  if (!p || current.includes(id) || current.length >= max) return false;
  return !current.some((c) => catalogue.find((x) => x.id === c)?.target === p.target);
}

/** Arrows for a diagram: one per (dependency → node) reference, signed (+ activates / required, − inhibits). Computed from the graph itself. */
export function graphEdges(g: RegGraph): Array<{ from: string; to: string; sign: 1 | -1 }> {
  const out: Array<{ from: string; to: string; sign: 1 | -1 }> = [];
  for (const n of g.nodes) if (n.expr !== undefined) for (const r of exprRefs(n.expr)) out.push({ from: r.id, to: n.id, sign: r.sign });
  return out;
}

export interface RootCause { id: string; value: boolean; forced: boolean }
/**
 * Why does node `id` have the value it has? Walks the rule back to the inputs and perturbations that actually decide it
 * (for an `all` that failed: the false members; for an `any` that held: the true members; negations flip the question).
 */
export function rootCauses(g: RegGraph, ev: Evaluation, id: string): RootCause[] {
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const out: RootCause[] = [];
  const seen = new Set<string>();
  const node = (nid: string) => {
    if (seen.has(nid)) return;
    seen.add(nid);
    const n = byId.get(nid)!;
    if (nid in ev.forced || n.kind === "input") { out.push({ id: nid, value: ev.values[nid], forced: nid in ev.forced }); return; }
    expr(n.expr as Expr, ev.values[nid]);
  };
  const val = (e: Expr): boolean => evalExpr(e, ev.values);
  const expr = (e: Expr, want: boolean): void => {
    if (typeof e === "string") { node(e); return; }
    if ("not" in e) { expr(e.not, !want); return; }
    if ("all" in e) { e.all.filter((c) => val(c) === want || want).forEach((c) => expr(c, val(c))); return; }
    e.any.filter((c) => val(c) === want || !want).forEach((c) => expr(c, val(c)));
  };
  node(id);
  return out;
}

/** A readable form of a rule, for example "Cyclin E expressed and not p21 and Cdc25 active". */
export function exprText(e: Expr, label: (id: string) => string, top = true): string {
  if (typeof e === "string") return label(e);
  if ("not" in e) return `not ${exprText(e.not, label, false)}`;
  const parts = ("all" in e ? e.all : e.any).map((x) => exprText(x, label, false));
  const joined = parts.join("all" in e ? " AND " : " OR ");
  return top || parts.length === 1 ? joined : `(${joined})`;
}

/** What a model says it can and cannot conclude. */
export interface Outcome { definite: string[]; uncertain: string[] }

export const isValidMode = (v: unknown): boolean => v === "explore" || v === "practice" || v === "challenge";
