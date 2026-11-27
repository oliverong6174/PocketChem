import { useMemo, type ReactNode } from "react";
import { GraphDiagram, type GEdge, type GNode, type Visual } from "../biochem/metabolism/GraphDiagram";
import { Badge, Callout, Panel } from "../ui/primitives";
import { layeredLayout, wrapLabel } from "./layout26";
import { claimsFor, type Claim } from "../../utils/biology/provenance26";
import { exprText, graphEdges, rootCauses, type Evaluation, type Outcome, type Perturbation, type RegGraph, type RegNode } from "../../utils/biology/mechanism26";
import "../../styles/metabolism.css";
import "../../styles/bio26.css";

const W = 196;
const LINE = 16;

/**
 * Diagram of one module of a curated regulatory graph. Boxes and arrows are read from the graph itself: an arrow exists exactly where one component's
 * rule refers to another, a red bar-headed arrow means "inhibits" (the reference sits under NOT), green-teal boxes are ON, and a perturbed component
 * is marked in words (✕ forced OFF / ▲ forced ON) as well as by its orange outline and badge. Dashed boxes belong to another module and are shown
 * only so that the arrows into this module have a visible source.
 */
export function RegDiagram({ graph, module, values, forced, selected, onSelect, stepStates, label, minWidth }: {
  graph: RegGraph; module: string; values: Record<string, boolean>; forced: Record<string, boolean>; selected: string | null; onSelect: (id: string) => void;
  stepStates?: Record<string, Visual>; label: string; minWidth?: number;
}) {
  const spec = useMemo(() => {
    const own = graph.nodes.filter((n) => n.module === module);
    const ownIds = new Set(own.map((n) => n.id));
    const all = graphEdges(graph);
    const ghostIds = [...new Set(all.filter((e) => ownIds.has(e.to) && !ownIds.has(e.from)).map((e) => e.from))];
    const nodes: RegNode[] = [...own, ...ghostIds.map((id) => graph.nodes.find((n) => n.id === id)!)];
    const heightOf = (n: RegNode) => (wrapLabel(n.label, 25).length + 1) * LINE + 14;
    const edges = all.filter((e) => ownIds.has(e.to) && nodes.some((n) => n.id === e.from));
    const lay = layeredLayout(nodes.map((n) => ({ id: n.id, w: W, h: heightOf(n) })), edges.map((e) => ({ from: e.from, to: e.to })), 34, 54, 44);
    return { nodes, ownIds, edges, lay, heightOf };
  }, [graph, module]);
  const gnodes: GNode[] = spec.nodes.map((n) => {
    const ghost = !spec.ownIds.has(n.id);
    const isForced = n.id in forced;
    const on = values[n.id];
    const stateLine = isForced ? (forced[n.id] ? "▲ forced ON" : "✕ forced OFF") : on ? "● ON" : "○ off";
    const p = spec.lay.pos[n.id];
    const lines = [...wrapLabel(ghost ? `↗ ${n.label}` : n.label, 25), stateLine];
    return {
      id: n.id, x: p.x, y: p.y, w: W, h: spec.heightOf(n), lines,
      kind: isForced ? "ketone" : ghost ? "carrier" : n.kind === "input" ? "plain" : "carbon",
      state: stepStates?.[n.id] ?? (ghost ? "future" : on ? "active" : "normal"),
      selected: selected === n.id, badge: isForced ? (forced[n.id] ? "▲" : "✕") : undefined,
      aria: `${n.label}: ${isForced ? (forced[n.id] ? "forced on by a perturbation" : "forced off by a perturbation") : on ? "on" : "off"}${ghost ? " (from another module)" : ""}`,
    };
  });
  // arrows that skip a row run along the left or right gutter instead of behind unrelated boxes
  const used = { left: 0, right: 0 };
  const route = (from: string, to: string): Array<[number, number]> | undefined => {
    if (spec.lay.depth[to] - spec.lay.depth[from] < 2) return undefined;
    const a = gnodes.find((n) => n.id === from)!, b = gnodes.find((n) => n.id === to)!;
    const left = a.x + a.w / 2 < spec.lay.width / 2;
    const gx = left ? 10 + 6 * used.left++ : spec.lay.width - 10 - 6 * used.right++;
    return [[gx, a.y + a.h / 2], [gx, b.y + b.h / 2]];
  };
  const gedges: GEdge[] = spec.edges.map((e) => ({
    id: `${e.from}>${e.to}`, from: e.from, to: e.to, via: route(e.from, e.to), kind: e.sign === 1 ? "main" : "regulation", end: e.sign === -1 ? "bar" : undefined,
    state: values[e.from] ? "active" : "dim", aria: `${e.sign === 1 ? "activates or is required by" : "inhibits"}: ${graph.nodes.find((n) => n.id === e.from)!.label} to ${graph.nodes.find((n) => n.id === e.to)!.label}`,
  }));
  return <GraphDiagram edges={gedges} height={spec.lay.height} label={label} minWidth={minWidth ?? Math.min(spec.lay.width, 760)} nodes={gnodes} onNode={onSelect} width={spec.lay.width} />;
}

export function EvidenceBadge({ evidence }: { evidence: RegNode["evidence"] }) {
  const tone = evidence === "established" ? "ok" : "estimate";
  const text = evidence === "established" ? "Established" : evidence === "context-dependent" ? "Context-dependent" : "Simplified in this model";
  return <Badge tone={tone}>{text}</Badge>;
}

/** Detail of one selected node: state, the rule it follows, what decides it, where and why it matters, and its caveat. */
export function NodeDetail({ graph, ev, id, onClear, extra }: { graph: RegGraph; ev: Evaluation; id: string; onClear: () => void; extra?: ReactNode }) {
  const n = graph.nodes.find((x) => x.id === id);
  if (!n) return null;
  const label = (x: string) => graph.nodes.find((y) => y.id === x)?.label ?? x;
  const causes = n.kind === "derived" ? rootCauses(graph, ev, id) : [];
  const forcedHere = id in ev.forced;
  return (
    <Panel subtitle="Component selected in the diagram." title={n.label}>
      <dl className="bio-seqline" data-testid="node-detail">
        <dt>State now</dt><dd data-testid="node-state">{forcedHere ? (ev.forced[id] ? "forced ON by a perturbation" : "forced OFF by a perturbation") : ev.values[id] ? "ON (active)" : "off (inactive)"}</dd>
        <dt>Kind</dt><dd>{n.kind === "input" ? "Condition you can set" : "Derived from the components that act on it"}</dd>
        <dt>Where</dt><dd>{n.where}</dd>
        <dt>Role</dt><dd>{n.role}</dd>
        {n.kind === "derived" ? <><dt>Rule</dt><dd data-testid="node-rule">ON when {exprText(n.expr!, label)}.</dd></> : null}
        {causes.length ? <><dt>Decided by</dt><dd data-testid="node-causes">{causes.map((c) => `${label(c.id)} ${c.forced ? "(perturbed) " : ""}is ${c.value ? "ON" : "off"}`).join("; ")}</dd></> : null}
        <dt>Evidence</dt><dd><EvidenceBadge evidence={n.evidence} /></dd>
        {n.caveat ? <><dt>Caveat</dt><dd>{n.caveat}</dd></> : null}
      </dl>
      {extra}
      <button className="ghost-button" onClick={onClear} type="button">Clear selection</button>
    </Panel>
  );
}

/** Checkbox list of perturbations: clash and limit rules come from the model's own catalogue. */
export function PerturbationList({ catalogue, selected, onToggle, canAddFn, max, legend = "Perturbations" }: {
  catalogue: readonly Perturbation[]; selected: readonly string[]; onToggle: (id: string, on: boolean) => void; canAddFn: (cur: readonly string[], id: string) => boolean; max: number; legend?: string;
}) {
  return (
    <fieldset className="c23-fieldset">
      <legend>{legend} (up to {max})</legend>
      <div className="c23-pert-list">
        {catalogue.map((p) => {
          const checked = selected.includes(p.id);
          return (
            <label className="bio-check" key={p.id} title={p.explanation}>
              <input checked={checked} data-testid={`pert-${p.id}`} disabled={!checked && !canAddFn(selected, p.id)} onChange={(e) => onToggle(p.id, e.target.checked)} type="checkbox" />
              {" "}{p.label}{p.kind === "gain" ? " (gain)" : ""}
            </label>
          );
        })}
      </div>
      <button className="ghost-button" disabled={!selected.length} onClick={() => selected.forEach((s) => onToggle(s, false))} type="button">Clear perturbations</button>
    </fieldset>
  );
}

/** What the model derives for certain and what it explicitly does not conclude. */
export function OutcomePanel({ outcome, title = "What the model concludes" }: { outcome: Outcome; title?: string }) {
  return (
    <Panel subtitle="Definite consequences within the modelled mechanism, kept separate from uncertain biology." title={title}>
      <ul className="gc-assumptions" data-testid="outcome-definite">{outcome.definite.map((s) => <li key={s}>{s}</li>)}</ul>
      {outcome.uncertain.length ? (
        <Callout tone="info" title="Not determined by this model">
          <ul className="gc-assumptions" data-testid="outcome-uncertain">{outcome.uncertain.map((s) => <li key={s}>{s}</li>)}</ul>
        </Callout>
      ) : null}
    </Panel>
  );
}

export function ChipList({ items }: { items: readonly string[] }) {
  return <ul className="b26-chips">{items.map((i) => <li key={i}>{i}</li>)}</ul>;
}

/** Which claims were checked against a retrieved source, which only in part, and which are standard textbook mechanisms not independently checked. */
const PROV_LABEL = { verified: "Verified", "partly-verified": "Partly verified", "not-checked": "Not independently checked" } as const;
const PROV_TONE = { verified: "ok", "partly-verified": "info", "not-checked": "estimate" } as const;
export function ProvenancePanel({ tool }: { tool: Claim["tool"] }) {
  const claims = claimsFor(tool);
  return (
    <Panel subtitle="A claim is verified only if its cited text was retrieved and read, and states it. Reviews and simplified models are not exact." title="Sources and verification">
      <ul className="gc-assumptions" data-testid="provenance">
        {claims.map((c) => (
          <li data-status={c.status} key={c.id}>
            <Badge tone={PROV_TONE[c.status]}>{PROV_LABEL[c.status]}</Badge>{" "}
            {c.statement}{c.source ? <> <a href={`https://${c.source.url}`} rel="noreferrer" target="_blank">{c.source.title}</a>{c.retrieved ? ` (retrieved ${c.retrieved})` : ""}</> : null}
            {c.caveat ? <span className="provenance-caveat"> {c.caveat}</span> : null}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
