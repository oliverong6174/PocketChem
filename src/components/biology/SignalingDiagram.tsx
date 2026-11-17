import { SelG, Txt } from "./cell23";
import { COL, INK, MUTED } from "./cellConst23";
import { STATUS_SYMBOL, STATUS_WORD } from "./signalingSymbols";
import { isOn, nodeStateText, type Evaluation, type SigNode, type SigSystem, type Status } from "../../utils/biology/signaling23";

/**
 * The signalling diagram. Every node's state word, symbol, fill and outline come from the evaluated mechanism graph, so a node
 * is "on" only if the graph says so. State is never conveyed by colour alone: each state has its own symbol and word, and
 * blocked nodes are hatched and dashed.
 */
const KIND_TAG: Record<SigNode["kind"], string> = { ligand: "LIGAND", receptor: "RECEPTOR", gprotein: "G PROTEIN", enzyme: "ENZYME", messenger: "SECOND MESSENGER", kinase: "KINASE", channel: "ION CHANNEL", adapter: "ADAPTOR", gtpase: "GTPASE", effector: "EVENT", terminator: "TERMINATION", output: "RESPONSE" };

const COLX = [112, 320, 528];
const NW = 190, NH = 74, ROWH = 94, TOP = 34;
const rowY = (r: number) => TOP + r * ROWH;

function wrap(text: string, max = 31): string[] {
  const words = text.split(" "), lines: string[] = [];
  let cur = "";
  for (const w of words) { if ((cur + " " + w).trim().length > max) { lines.push(cur); cur = w; } else cur = (cur + " " + w).trim(); }
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
}
const fillFor = (s: Status, reached: boolean) => (!reached ? "#f1f5f9" : s === "active" ? "#dcfce7" : s === "blocked" ? "url(#sig-hatch)" : s === "attenuated" ? "#fef3c7" : s === "persisting" ? "#fde68a" : "#ffffff");
const strokeFor = (s: Status, reached: boolean) => (!reached ? "#94a3b8" : s === "active" ? COL.ok : s === "blocked" ? COL.bad : s === "attenuated" || s === "persisting" ? "#b45309" : "#64748b");

function elbow(x1: number, y1: number, x2: number, y2: number) {
  if (x1 === x2) return `M${x1} ${y1} L${x2} ${y2}`;
  const ym = (y1 + y2) / 2;
  return `M${x1} ${y1} L${x1} ${ym} L${x2} ${ym} L${x2} ${y2}`;
}

export function SignalingDiagram({ system, ev, selected, onSelect }: { system: SigSystem; ev: Evaluation; selected: string | null; onSelect: (id: string | null) => void }) {
  const rows = Math.max(...system.nodes.map((n) => n.pos[1])) + 1;
  const H = TOP + rows * ROWH + 16;
  const byId = new Map(system.nodes.map((n) => [n.id, n]));
  const box = (n: SigNode) => ({ x: COLX[n.pos[0]] - NW / 2, y: rowY(n.pos[1]) });
  const edges: JSX.Element[] = [];
  for (const n of system.nodes) {
    if (n.kind === "terminator") continue;
    const b = box(n);
    for (const r of n.requires) {
      const f = byId.get(r)!, fb = box(f);
      const live = isOn(ev.current[r]) && isOn(ev.current[n.id]) && ev.reached[n.id];
      edges.push(<path d={elbow(fb.x + NW / 2, fb.y + NH, b.x + NW / 2, b.y)} fill="none" key={`${r}>${n.id}`} markerEnd={live ? "url(#sig-arrow-on)" : "url(#sig-arrow-off)"} stroke={live ? COL.ok : "#94a3b8"} strokeDasharray={live ? undefined : "5 4"} strokeWidth={live ? 3 : 1.6} />);
    }
    for (const r of [...(n.opposedBy ?? []), ...(n.suppressedBy ?? [])]) {
      const f = byId.get(r)!, fb = box(f);
      const live = isOn(ev.current[r]) && ev.reached[r];
      const sx = fb.x + (fb.x < b.x ? NW : 0), tx = b.x + (fb.x < b.x ? 0 : NW);
      edges.push(<path d={`M${sx} ${fb.y + NH / 2} L${(sx + tx) / 2} ${fb.y + NH / 2} L${(sx + tx) / 2} ${b.y + NH / 2} L${tx} ${b.y + NH / 2}`} fill="none" key={`${r}-|${n.id}`} markerEnd="url(#sig-bar)" stroke={live ? COL.bad : "#cbd5e1"} strokeDasharray="6 3" strokeWidth={live ? 2.6 : 1.4} />);
    }
  }
  for (const t of system.nodes.filter((n) => n.kind === "terminator")) {
    const tb = box(t);
    for (const n of system.nodes) {
      const ends = n.terminatedBy === t.id ? "ends" : n.attenuatedBy === t.id ? "attenuates" : null;
      if (!ends) continue;
      const b = box(n);
      const left = tb.x < b.x;
      const sx = tb.x + (left ? NW : 0) * 0 + (left ? 150 : 0), tx = b.x + (left ? 0 : NW);
      const fx = left ? tb.x + 150 : tb.x, tyy = b.y + NH / 2;
      void sx;
      edges.push(<path d={`M${fx} ${tb.y + 22} L${(fx + tx) / 2} ${tb.y + 22} L${(fx + tx) / 2} ${tyy + (ends === "ends" ? 10 : -10)} L${tx} ${tyy + (ends === "ends" ? 10 : -10)}`} fill="none" key={`${t.id}-${n.id}`} markerEnd="url(#sig-bar)" stroke={ev.current[t.id] === "blocked" ? "#cbd5e1" : ends === "ends" ? "#7c3aed" : "#b45309"} strokeDasharray={ends === "ends" ? "3 3" : "1 3"} strokeWidth={1.8} />);
    }
  }
  const mRow = system.membraneRow;
  const summary = `${system.label}. ${system.nodes.filter((n) => n.kind !== "terminator").map((n) => `${n.label}: ${ev.reached[n.id] ? STATUS_WORD[ev.current[n.id]] : "not reached yet"}`).join("; ")}.`;
  return (
    <svg aria-label={summary} className="c23-svg is-wide" role="img" viewBox={`0 0 640 ${H}`}>
      <defs>
        <pattern height="8" id="sig-hatch" patternTransform="rotate(45)" patternUnits="userSpaceOnUse" width="8"><rect fill="#fee2e2" height="8" width="8" /><line stroke="#ef4444" strokeWidth="2" x1="0" x2="0" y1="0" y2="8" /></pattern>
        <marker id="sig-arrow-on" markerHeight="8" markerWidth="8" orient="auto" refX="6.5" refY="4" viewBox="0 0 8 8"><path d="M0 0.5 L7.5 4 L0 7.5 z" fill={COL.ok} /></marker>
        <marker id="sig-arrow-off" markerHeight="8" markerWidth="8" orient="auto" refX="6.5" refY="4" viewBox="0 0 8 8"><path d="M0 0.5 L7.5 4 L0 7.5 z" fill="#94a3b8" /></marker>
        <marker id="sig-bar" markerHeight="12" markerWidth="8" orient="auto" refX="4" refY="6" viewBox="0 0 8 12"><rect fill={INK} height="12" width="3" x="3" y="0" /></marker>
      </defs>
      {/* membrane band */}
      <rect fill="#fde68a" height={NH + 10} opacity={0.55} width={640} x={0} y={rowY(mRow) - 5} />
      <Txt anchor="start" bold fill="#92400e" size={11} x={6} y={rowY(mRow) + 6}>PLASMA MEMBRANE</Txt>
      <Txt anchor="start" bold fill={MUTED} size={11} x={6} y={14}>{system.id === "nuclear" ? "" : "EXTRACELLULAR"}</Txt>
      <Txt anchor="start" bold fill={MUTED} size={11} x={6} y={H - 6}>CYTOSOL</Txt>
      {edges}
      {system.nodes.map((n) => {
        const b = box(n), s = ev.current[n.id], reached = ev.reached[n.id];
        const term = n.kind === "terminator";
        const shown: Status = term ? s : reached ? s : "inactive";
        const on = selected === n.id;
        const w = term ? 150 : NW, h = term ? 44 : NH;
        const stroke = term ? (s === "blocked" ? COL.bad : "#7c3aed") : strokeFor(shown, reached);
        const state = nodeStateText(system, n.id, ev);
        const lines = wrap(term ? state : state.replace(/ \(not reached yet\)$/, ""), term ? 22 : 31);
        const shape = (() => {
          const common = { fill: term ? (s === "blocked" ? "url(#sig-hatch)" : "#f5f3ff") : fillFor(shown, reached), stroke, strokeWidth: shown === "active" || selected === n.id ? 3 : 1.8, strokeDasharray: term || shown === "blocked" ? "5 3" : undefined, opacity: reached ? 1 : 0.7 };
          if (n.kind === "messenger") return <ellipse cx={b.x + w / 2} cy={b.y + h / 2} rx={w / 2} ry={h / 2} {...common} />;
          if (n.kind === "gprotein") return <rect height={h} rx={26} width={w} x={b.x} y={b.y} {...common} />;
          if (n.kind === "ligand") return <polygon points={`${b.x + 16},${b.y} ${b.x + w - 16},${b.y} ${b.x + w},${b.y + h / 2} ${b.x + w - 16},${b.y + h} ${b.x + 16},${b.y + h} ${b.x},${b.y + h / 2}`} {...common} />;
          if (n.kind === "adapter" || n.kind === "effector") return <rect height={h} rx={14} width={w} x={b.x} y={b.y} {...common} />;
          return <rect height={h} rx={n.kind === "terminator" ? 8 : 5} width={w} x={b.x} y={b.y} {...common} />;
        })();
        return (
          <SelG id={n.id} key={n.id} label={`${n.label}: ${term ? state : `${reached ? STATUS_WORD[shown] : "not reached yet"}. ${state}`}`} onSelect={onSelect} selected={selected}>
            {shape}
            {n.kind === "kinase" ? <rect fill={stroke} height={h - 8} rx={2} width={5} x={b.x + 4} y={b.y + 4} /> : null}
            {n.kind === "receptor" || n.kind === "channel" ? <rect fill="none" height={h - 10} rx={3} stroke={stroke} strokeWidth={1.2} width={w - 10} x={b.x + 5} y={b.y + 5} /> : null}
            <Txt anchor="start" bold fill="#475569" size={9} x={b.x + 12} y={b.y + 13}>{KIND_TAG[n.kind]}</Txt>
            <Txt anchor="start" bold size={term ? 11.5 : 13} x={b.x + 12} y={b.y + (term ? 27 : 28)}>{n.label}</Txt>
            {lines.map((l, i) => <Txt anchor="start" fill="#334155" key={i} size={10.5} x={b.x + 12} y={b.y + (term ? 40 : 42) + i * 12}>{l}</Txt>)}
            {!term ? <Txt anchor="end" bold fill={stroke} size={11} x={b.x + w - 8} y={b.y + 13}>{reached ? `${STATUS_SYMBOL[shown]} ${STATUS_WORD[shown]}` : "· not yet"}</Txt> : <Txt anchor="end" bold fill={stroke} size={10} x={b.x + w - 6} y={b.y + 13}>{s === "blocked" ? "✕ BLOCKED" : "⊣ functional"}</Txt>}
            {on ? <rect fill="none" height={h + 8} rx={9} stroke="#1d4ed8" strokeDasharray="5 3" strokeWidth={2.4} width={w + 8} x={b.x - 4} y={b.y - 4} /> : null}
          </SelG>
        );
      })}
    </svg>
  );
}

/** Narrow screens: a focused list of events instead of a shrunken graph. */
export function SignalingCards({ system, ev, selected, onSelect }: { system: SigSystem; ev: Evaluation; selected: string | null; onSelect: (id: string | null) => void }) {
  const main = system.nodes.filter((n) => n.kind !== "terminator");
  const terms = system.nodes.filter((n) => n.kind === "terminator");
  const byId = new Map(system.nodes.map((n) => [n.id, n]));
  const card = (n: SigNode) => {
    const s = ev.current[n.id], reached = ev.reached[n.id];
    const term = n.kind === "terminator";
    const cls = term ? (s === "blocked" ? "blocked" : "") : !reached ? "pending" : s === "active" ? "on" : s === "inactive" ? "" : s;
    const sym = term ? (s === "blocked" ? "✕" : "⊣") : reached ? STATUS_SYMBOL[s] : "·";
    const word = term ? (s === "blocked" ? "BLOCKED" : "functional") : reached ? STATUS_WORD[s] : "not yet";
    return (
      <li key={n.id}>
        <button aria-pressed={selected === n.id} className={`c23-card ${cls}`} data-component={n.id} onClick={() => onSelect(selected === n.id ? null : n.id)} type="button">
          <span aria-hidden="true" className="sym">{sym}</span>
          <span className="name">{n.label} <span className="c23-status">· {word}</span></span>
          <span className="state">{nodeStateText(system, n.id, ev)}{n.requires.length > 1 ? ` · needs ${n.requires.map((r) => byId.get(r)!.label).join(" and ")}` : ""}</span>
        </button>
      </li>
    );
  };
  return (
    <div>
      <ol aria-label={`${system.label}: events in order`} className="c23-mech-list">{main.map(card)}</ol>
      <p className="c23-note">Termination and feedback</p>
      <ul className="c23-mech-list">{terms.map(card)}</ul>
    </div>
  );
}
