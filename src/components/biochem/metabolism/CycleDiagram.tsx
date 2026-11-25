import { ENZYMES_BY_ID, METABOLITES_BY_ID, REACTIONS_BY_ID, TCA } from "../../../utils/biochem/metabolism/network";
import { carrierChanges } from "./format";

/** The citric acid cycle as a ring: eight metabolite nodes and the eight reactions between them, from the shared network. */
const CX = 380, CY = 345, R = 235, HW = 66, HH = 21;
const ORDER = ["oaa", "citrate", "isocitrate", "akg", "succoa", "succinate", "fumarate", "malate"];
const INK = "#0f172a", MUTED = "#475569", TEAL = "#0e7490";
// the node that each cycle reaction PRODUCES (oxaloacetate closes the ring)
const PRODUCES = ["citrate", "isocitrate", "akg", "succoa", "succinate", "fumarate", "malate", "oaa"];
const angleOf = (i: number) => (-90 + i * 45) * (Math.PI / 180);
const pos = (i: number, r = R) => ({ x: CX + r * Math.cos(angleOf(i)), y: CY + r * Math.sin(angleOf(i)) });

function arc(i: number): string {
  // from node i to node i+1 along the ring, leaving a gap that depends on how the node boxes sit on the circle
  const a0 = angleOf(i), a1 = angleOf(i + 1);
  const off = (a: number) => (HW * Math.abs(Math.sin(a)) + HH * Math.abs(Math.cos(a)) + 8) / R;
  const s = a0 + off(a0), e = a1 - off(a1);
  const p = (a: number) => `${(CX + R * Math.cos(a)).toFixed(1)} ${(CY + R * Math.sin(a)).toFixed(1)}`;
  return `M ${p(s)} A ${R} ${R} 0 0 1 ${p(e)}`;
}

export function CycleDiagram({ inTurn, turnNo, selected, onSelect, onSelectMetabolite, hideNames, highlightMetabolite }: {
  inTurn: number; turnNo: number; selected: string | null; onSelect: (reactionId: string) => void; onSelectMetabolite?: (id: string) => void; hideNames?: boolean; highlightMetabolite?: string | null;
}) {
  return (
    <svg aria-label={`Citric acid cycle, turn ${turnNo}, ${inTurn} of 8 reactions`} className="mt-svg mt-cycle" data-testid="cycle-diagram" role="group" style={{ minWidth: 560 }} viewBox="0 0 760 680">
      <title>Citric acid cycle</title>
      <defs><marker id="mt-cyc-arrow" markerHeight="13" markerUnits="userSpaceOnUse" markerWidth="13" orient="auto" refX="11" refY="6.5" viewBox="0 0 13 13"><path d="M0 0 L13 6.5 L0 13 z" fill={TEAL} /></marker></defs>
      <rect fill="#fff" height={680} width={760} />
      <text fill={MUTED} fontSize={12.5} x={12} y={22}>Mitochondrial matrix (succinate dehydrogenase sits in the inner membrane)</text>
      {TCA.map(({ reaction }, i) => {
        const done = i + 1 <= inTurn;
        const isSel = selected === reaction.id;
        const mid = (angleOf(i) + angleOf(i + 1)) / 2;
        const lx = CX + (R + 62) * Math.cos(mid), ly = CY + (R + 62) * Math.sin(mid);
        const anchor = Math.cos(mid) > 0.25 ? "start" : Math.cos(mid) < -0.25 ? "end" : "middle";
        const chips = carrierChanges(reaction).map((c) => c.text).join("  ");
        const name = hideNames && !done && !isSel ? `Step ${i + 1}` : ENZYMES_BY_ID[reaction.enzyme].short;
        return (
          <g
            aria-label={`${reaction.name}, ${isSel ? "selected" : done ? "completed" : "not yet reached"}`} aria-pressed={isSel} className="mt-hit" data-testid={`conn-${reaction.id}`} key={reaction.id}
            onClick={() => onSelect(reaction.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(reaction.id); } }} role="button" tabIndex={0}
          >
            {isSel ? <path d={arc(i)} fill="none" stroke="#fde68a" strokeLinecap="round" strokeWidth={11} /> : null}
            <path d={arc(i)} fill="none" markerEnd="url(#mt-cyc-arrow)" stroke={TEAL} strokeDasharray={done ? undefined : "6 5"} strokeWidth={done || isSel ? 3.5 : 2.2} opacity={done || isSel || inTurn === 0 ? 1 : 0.5} />
            <rect fill="transparent" height={40} width={170} x={anchor === "end" ? lx - 170 : anchor === "middle" ? lx - 85 : lx} y={ly - 20} />
            <text fill={isSel ? INK : TEAL} fontSize={14} fontWeight={isSel ? 800 : 700} paintOrder="stroke" stroke="#fff" strokeWidth={4} textAnchor={anchor} x={lx} y={ly}>{i + 1}. {name}</text>
            {chips ? <text fill={MUTED} fontSize={12.5} paintOrder="stroke" stroke="#fff" strokeWidth={4} textAnchor={anchor} x={lx} y={ly + 16}>{chips}</text> : null}
          </g>
        );
      })}
      {ORDER.map((id, i) => {
        const m = METABOLITES_BY_ID[id];
        const { x, y } = pos(i);
        const reached = inTurn > 0 && (PRODUCES.indexOf(id) < inTurn || (id === "oaa" && inTurn === 8)) ;
        const regenerated = id === "oaa" && inTurn === 8;
        const hl = highlightMetabolite === id;
        return (
          <g
            aria-label={`${m.name}, ${m.carbons} carbons${regenerated ? ", regenerated" : ""}`} className="mt-hit" data-testid={`node-${id}`} key={id}
            onClick={() => onSelectMetabolite?.(id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelectMetabolite?.(id); } }} role="button" tabIndex={0}
          >
            <rect fill={hl ? "#fef9c3" : regenerated ? "#dcfce7" : reached || (id === "oaa" && inTurn === 0) ? "#ecfeff" : "#f8fafc"} height={HH * 2} rx={8} stroke={regenerated ? "#15803d" : hl ? "#ca8a04" : reached ? "#0e7490" : "#94a3b8"} strokeWidth={regenerated || hl ? 3 : reached ? 2 : 1.2} width={HW * 2} x={x - HW} y={y - HH} />
            <text fill={INK} fontSize={13.5} fontWeight={700} textAnchor="middle" x={x} y={y + 1}>{m.name}</text>
            <text fill={MUTED} fontSize={12} textAnchor="middle" x={x} y={y + 16}>C{m.carbons}{regenerated ? ", regenerated ✔" : ""}</text>
          </g>
        );
      })}
      <g aria-hidden="true">
        <path d="M 676 134 L 482 130" fill="none" markerEnd="url(#mt-cyc-arrow)" stroke="#b45309" strokeWidth={2.5} />
        <text fill="#b45309" fontSize={13.5} fontWeight={700} textAnchor="middle" x={580} y={120}>Acetyl-CoA (C2) enters</text>
        <text fill={MUTED} fontSize={13} textAnchor="middle" x={CX} y={CY - 6}>Turn {turnNo || 1}</text>
        <text fill={MUTED} fontSize={13} textAnchor="middle" x={CX} y={CY + 14}>{inTurn} of 8 reactions</text>
      </g>
      <text fill={MUTED} fontSize={12} x={12} y={668}>{REACTIONS_BY_ID.IDH ? "CO₂ is released at isocitrate dehydrogenase and α-ketoglutarate dehydrogenase." : ""}</text>
    </svg>
  );
}
