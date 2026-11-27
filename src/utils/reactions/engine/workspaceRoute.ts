/**
 * Stage 20: a read-only route overview of a Multi-Catalytic workspace.
 *
 * Everything here is derived from the engine's own records (`workspace.pool.lots` and `workspace.history`); nothing is predicted,
 * scored or invented. The workspace has no automatic search and no declared target, so the "objective" reports exactly that:
 * what was supplied, what has been made, what is still on the shelf, and which attempts did not give a product.
 *
 * Connectivity is the real lot lineage: a committed step links every consumed lot to every lot it produced, and branches are the
 * connected components of those links. A step that consumes lots from two branches is reported as a join, never as a linear step.
 */
import { lotLabel } from "./workspacePresentation";
import type { ReactionWorkspace, WorkspaceStep } from "./reactionWorkspace";

export interface RouteLot {
  id: string;
  label: string;
  smiles: string;
  kind: "supplied" | "product" | "coproduct";
  availability: "live" | "consumed";
  /** Step that made it (null for supplied). */
  madeInStep: number | null;
  consumedByStep: number | null;
}

export interface RouteStep {
  step: number;
  attempt: number;
  title: string;
  reagent: string;
  inputs: string[];
  products: string[];
  coproducts: string[];
  /** Consumes lots that descend from different supplied materials (two or more branches merge here). */
  join: boolean;
  /** The engine offered several outcomes for this step. */
  alternatives: number;
  selectedBy: WorkspaceStep["selectedBy"];
  cautions: number;
}

export interface RouteBranch {
  id: string;
  starts: string[];
  steps: number[];
  end: string[];
  join: boolean;
}

export interface WorkspaceOverview {
  mode: "workspace";
  lots: Record<string, RouteLot>;
  supplied: string[];
  steps: RouteStep[];
  branches: RouteBranch[];
  /** Live lots made by a step (the current end products), without coproducts. */
  endProducts: string[];
  liveCoproducts: string[];
  /** Supplied lots no step has touched yet. */
  unused: string[];
  attempts: number;
  /** Attempts that gave no committed product (no reaction, needs input, unsupported, ...). */
  unresolved: Array<{ attempt: number; title: string; status: string }>;
  reagents: string[];
  status: "empty" | "no-steps" | "in-progress";
}

export function buildWorkspaceOverview(workspace: ReactionWorkspace): WorkspaceOverview {
  const lots: Record<string, RouteLot> = {};
  for (const lot of workspace.pool.lots) {
    const made = lot.provenance.kind === "supplied" ? null : lot.provenance.step;
    lots[lot.id] = {
      id: lot.id,
      label: lotLabel(lot),
      smiles: lot.smiles,
      kind: lot.provenance.kind === "supplied" ? "supplied" : lot.role === "coproduct" ? "coproduct" : "product",
      availability: lot.availability === "live" ? "live" : "consumed",
      madeInStep: made,
      consumedByStep: lot.consumedByStep,
    };
  }
  const suppliedIds = Object.values(lots).filter((lot) => lot.kind === "supplied").map((lot) => lot.id);
  const committed = workspace.history.filter((item) => item.status === "reaction" && item.committedStep !== null);

  // Connected components over lots linked by committed steps (union-find).
  const parent = new Map<string, string>();
  const find = (id: string): string => { let root = id; while ((parent.get(root) ?? root) !== root) root = parent.get(root) as string; parent.set(id, root); return root; };
  const union = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(rb, ra); };
  for (const id of Object.keys(lots)) parent.set(id, id);
  for (const item of committed) {
    const linked = [...item.consumedLotIds, ...item.producedLotIds].filter((id) => id in lots);
    for (const id of linked.slice(1)) union(linked[0], id);
  }

  // Which supplied materials each lot descends from (workspace lineage is authoritative).
  const lineageOf = (id: string): number[] => workspace.pool.lots.find((lot) => lot.id === id)?.lineage ?? [];

  const steps: RouteStep[] = committed.map((item) => {
    const consumedLineages = item.consumedLotIds.map((id) => lineageOf(id).join(","));
    const roots = new Set(item.consumedLotIds.map((id) => find(id)));
    const selected = item.selectedOutcome !== null ? item.outcomes[item.selectedOutcome] : null;
    return {
      step: item.committedStep as number,
      attempt: item.attempt,
      title: item.title,
      reagent: item.reagentLabel,
      inputs: [...item.consumedLotIds],
      products: item.producedLotIds.filter((id) => lots[id]?.kind === "product"),
      coproducts: item.producedLotIds.filter((id) => lots[id]?.kind === "coproduct"),
      join: item.consumedLotIds.length >= 2 && (roots.size > 1 || new Set(consumedLineages).size > 1),
      alternatives: item.outcomes.length,
      selectedBy: item.selectedBy,
      cautions: (selected?.limitations.length ?? 0) + (item.compatibility?.length ?? 0) + (selected && selected.productStatus !== "computed" ? 1 : 0),
    };
  });

  const byRoot = new Map<string, RouteBranch>();
  const branchOf = (id: string): RouteBranch => {
    const root = find(id);
    let branch = byRoot.get(root);
    if (!branch) { branch = { id: `branch-${byRoot.size + 1}`, starts: [], steps: [], end: [], join: false }; byRoot.set(root, branch); }
    return branch;
  };
  for (const lot of Object.values(lots)) {
    // Supplied materials that no step touched are listed as `unused`, not as one-lot branches.
    const touched = committed.some((item) => item.consumedLotIds.includes(lot.id) || item.producedLotIds.includes(lot.id));
    if (!touched) continue;
    const branch = branchOf(lot.id);
    if (lot.kind === "supplied") branch.starts.push(lot.id);
    if (lot.availability === "live" && lot.kind !== "supplied") branch.end.push(lot.id);
  }
  for (const route of steps) {
    const branch = branchOf(route.inputs[0] ?? route.products[0]);
    branch.steps.push(route.step);
    if (route.join) branch.join = true;
  }

  const unresolved = workspace.history.filter((item) => item.status !== "reaction").map((item) => ({ attempt: item.attempt, title: item.title, status: item.status }));
  const live = Object.values(lots).filter((lot) => lot.availability === "live");
  const endProducts = live.filter((lot) => lot.kind === "product").map((lot) => lot.id);
  return {
    mode: "workspace",
    lots,
    supplied: suppliedIds,
    steps,
    branches: [...byRoot.values()],
    endProducts,
    liveCoproducts: live.filter((lot) => lot.kind === "coproduct").map((lot) => lot.id),
    unused: live.filter((lot) => lot.kind === "supplied" && !committed.some((item) => item.consumedLotIds.includes(lot.id))).map((lot) => lot.id),
    attempts: workspace.history.length,
    unresolved,
    reagents: [...new Set(steps.map((route) => route.reagent))],
    status: suppliedIds.length === 0 ? "empty" : steps.length === 0 ? "no-steps" : "in-progress",
  };
}
