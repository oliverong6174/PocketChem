import { prettyFormula } from "../../utils/generalChem/formula";
import { useContainerWidth } from "../physics/simHooks";

const INK = "#0f172a";
const TEAL = "#0b6a72";
const AMBER = "#b45309";
const RED = "#be123c";
const SLATE = "#475569";

export interface CellDiagramProps {
  kind: "galvanic" | "electrolytic";
  anodeElectrode: string; cathodeElectrode: string;
  anodeSolution: string; cathodeSolution: string;
  anodeLine: string; cathodeLine: string;
  overall: string;
  readoutLabel: string; readoutValue: string;
  bridge?: { cation: string; anion: string };
}

/**
 * Schematic cell: electrodes, solutions, external circuit with the direction of electron flow (anode to cathode in both kinds of cell) and of conventional
 * current (the opposite), the salt bridge with ion directions (galvanic cell), and the half- and overall reactions. Electrons never travel through the
 * salt bridge or the solution; ions carry the charge there. Not to scale.
 */
export function CellDiagram(p: CellDiagramProps) {
  const [wrapRef, avail] = useContainerWidth();
  const W = Math.max(340, Math.min(avail, 820));
  const H = p.kind === "galvanic" ? 430 : 470;
  const galv = p.kind === "galvanic";
  const bw = galv ? Math.min(190, (W - 90) / 2.3) : Math.min(300, W - 120);
  const gap = galv ? Math.max(64, W - 2 * bw - 60) : 0;
  const bx1 = galv ? 30 : (W - bw) / 2; const bx2 = galv ? 30 + bw + gap : bx1;
  const by = 200; const bh = 130;
  const ex1 = galv ? bx1 + bw / 2 : bx1 + bw * 0.14; const ex2 = galv ? bx2 + bw / 2 : bx1 + bw * 0.86;
  const wireY = 56;
  const mid = (ex1 + ex2) / 2;
  const aSign = galv ? "−" : "+"; const cSign = galv ? "+" : "−";
  return (
    <div className="ph-diagram" ref={wrapRef}>
      <svg aria-label={`${galv ? "Galvanic" : "Electrolytic"} cell. Anode (oxidation, ${aSign}): ${p.anodeLine}. Cathode (reduction, ${cSign}): ${p.cathodeLine}. Electrons flow through the external wire from the anode to the cathode. ${p.readoutLabel} ${p.readoutValue}. ${p.overall}`} className="ph-svg" height={H} role="img" viewBox={`0 0 ${W} ${H}`} width={W}>
        <defs>
          <marker id="cell-arrow" markerHeight="8" markerWidth="8" orient="auto-start-reverse" refX="7" refY="4" viewBox="0 0 8 8"><path d="M0 0.5 L7.5 4 L0 7.5 z" fill={RED} /></marker>
          <marker id="cell-arrow-dash" markerHeight="8" markerWidth="8" orient="auto-start-reverse" refX="7" refY="4" viewBox="0 0 8 8"><path d="M0 0.5 L7.5 4 L0 7.5 z" fill={SLATE} /></marker>
          <marker id="cell-arrow-ion" markerHeight="8" markerWidth="8" orient="auto-start-reverse" refX="7" refY="4" viewBox="0 0 8 8"><path d="M0 0.5 L7.5 4 L0 7.5 z" fill={TEAL} /></marker>
        </defs>
        <rect className="ph-paper" height={H} width={W} x={0} y={0} />
        {/* beakers */}
        {galv ? (
          <>
            <path d={`M${bx1} ${by} V${by + bh} H${bx1 + bw} V${by}`} fill="none" stroke={INK} strokeWidth={2.5} />
            <rect fill={AMBER} fillOpacity={0.14} height={bh - 26} width={bw - 3} x={bx1 + 1.5} y={by + 26} />
            <path d={`M${bx2} ${by} V${by + bh} H${bx2 + bw} V${by}`} fill="none" stroke={INK} strokeWidth={2.5} />
            <rect fill={TEAL} fillOpacity={0.14} height={bh - 26} width={bw - 3} x={bx2 + 1.5} y={by + 26} />
          </>
        ) : (
          <>
            <path d={`M${bx1} ${by} V${by + bh} H${bx1 + bw} V${by}`} fill="none" stroke={INK} strokeWidth={2.5} />
            <rect fill={TEAL} fillOpacity={0.14} height={bh - 26} width={bw - 3} x={bx1 + 1.5} y={by + 26} />
          </>
        )}
        {/* electrodes */}
        <rect fill={INK} height={bh - 6} width={11} x={ex1 - 5} y={wireY + 6} />
        <rect fill={INK} height={bh - 6} width={11} x={ex2 - 5} y={wireY + 6} />
        <line stroke={INK} strokeWidth={2.5} x1={ex1} x2={ex1} y1={wireY} y2={wireY + 6} />
        <line stroke={INK} strokeWidth={2.5} x1={ex2} x2={ex2} y1={wireY} y2={wireY + 6} />
        {/* wire and meter / source */}
        <path d={`M${ex1} ${wireY} H${mid - 36}`} fill="none" stroke={INK} strokeWidth={2.5} />
        <path d={`M${mid + 36} ${wireY} H${ex2}`} fill="none" stroke={INK} strokeWidth={2.5} />
        {galv ? (
          <g>
            <circle cx={mid} cy={wireY} fill="#fbfaf7" r={30} stroke={INK} strokeWidth={2.5} />
            <text className="ph-axis-label" textAnchor="middle" x={mid} y={wireY - 2}>{p.readoutValue}</text>
            <text className="ph-tick" textAnchor="middle" x={mid} y={wireY + 14}>{p.readoutLabel}</text>
          </g>
        ) : (
          <g>
            <line stroke={INK} strokeWidth={4} x1={mid - 8} x2={mid - 8} y1={wireY - 20} y2={wireY + 20} />
            <line stroke={INK} strokeWidth={2} x1={mid + 8} x2={mid + 8} y1={wireY - 11} y2={wireY + 11} />
            <text className="ph-axis-label" textAnchor="middle" x={mid - 24} y={wireY - 8}>+</text>
            <text className="ph-axis-label" textAnchor="middle" x={mid + 24} y={wireY - 8}>−</text>
            <text className="ph-tick" textAnchor="middle" x={mid} y={wireY + 38}>{p.readoutLabel} {p.readoutValue}</text>
          </g>
        )}
        {/* electron flow (anode -> cathode) above the wire, conventional current (opposite) below */}
        <line markerEnd="url(#cell-arrow)" stroke={RED} strokeWidth={2.2} x1={mid - 70} x2={mid + 70} y1={wireY - 30} y2={wireY - 30} />
        <text className="ph-note-text" fill={RED} textAnchor="middle" x={mid} y={wireY - 38}>e⁻ flow: anode → cathode</text>
        <line markerEnd="url(#cell-arrow-dash)" stroke={SLATE} strokeDasharray="5 3" strokeWidth={1.8} x1={mid + 70} x2={mid - 70} y1={wireY + 52} y2={wireY + 52} />
        <text className="ph-note-text" textAnchor="middle" x={mid} y={wireY + 72}>current: cathode → anode</text>
        {/* salt bridge */}
        {galv && p.bridge ? (
          <g>
            <path d={`M${bx1 + bw * 0.62} ${by + 70} V${by - 14} H${bx2 + bw * 0.38} V${by + 70}`} fill="none" stroke="#7c5c2e" strokeWidth={14} strokeLinejoin="round" />
            <path d={`M${bx1 + bw * 0.62} ${by + 70} V${by - 14} H${bx2 + bw * 0.38} V${by + 70}`} fill="none" stroke="#fbfaf7" strokeWidth={9} strokeLinejoin="round" />
            <text className="ph-tick" textAnchor="middle" x={(bx1 + bw * 0.62 + bx2 + bw * 0.38) / 2} y={by - 20}>salt bridge ({prettyFormula(p.bridge.cation)} , {prettyFormula(p.bridge.anion)}): ions, never electrons</text>
            <line markerEnd="url(#cell-arrow-ion)" stroke={TEAL} strokeWidth={1.8} x1={(bx1 + bw * 0.62 + bx2 + bw * 0.38) / 2 - 40} x2={(bx1 + bw * 0.62 + bx2 + bw * 0.38) / 2 + 40} y1={by - 4} y2={by - 4} />
            <text className="ph-tick" textAnchor="middle" x={(bx1 + bw * 0.62 + bx2 + bw * 0.38) / 2} y={by + 10}>{prettyFormula(p.bridge.cation)} drifts to the cathode side, {prettyFormula(p.bridge.anion)} to the anode side</text>
          </g>
        ) : null}
        {/* labels */}
        {galv ? (
          <>
            <text className="ph-axis-label" textAnchor="middle" x={ex1} y={by + bh + 20}>ANODE ({aSign}): oxidation</text>
            <text className="ph-note-text" textAnchor="middle" x={ex1} y={by + bh + 36}>{p.anodeElectrode}</text>
            <text className="ph-axis-label" textAnchor="middle" x={ex2} y={by + bh + 20}>CATHODE ({cSign}): reduction</text>
            <text className="ph-note-text" textAnchor="middle" x={ex2} y={by + bh + 36}>{p.cathodeElectrode}</text>
            <text className="ph-tick" textAnchor="middle" x={bx1 + bw / 2} y={by + bh - 8}>{p.anodeSolution}</text>
            <text className="ph-tick" textAnchor="middle" x={bx2 + bw / 2} y={by + bh - 8}>{p.cathodeSolution}</text>
            <text className="ph-note-text" textAnchor="middle" x={ex1} y={by + bh + 56}>{p.anodeLine}</text>
            <text className="ph-note-text" textAnchor="middle" x={ex2} y={by + bh + 74}>{p.cathodeLine}</text>
          </>
        ) : (
          <>
            <text className="ph-tick" textAnchor="middle" x={bx1 + bw / 2} y={by + bh - 8}>{p.cathodeSolution}</text>
            <text className="ph-axis-label" textAnchor="middle" x={W / 2} y={by + bh + 22}>ANODE ({aSign}): oxidation</text>
            <text className="ph-note-text" textAnchor="middle" x={W / 2} y={by + bh + 40}>{p.anodeLine}</text>
            <text className="ph-axis-label" textAnchor="middle" x={W / 2} y={by + bh + 66}>CATHODE ({cSign}): reduction</text>
            <text className="ph-note-text" textAnchor="middle" x={W / 2} y={by + bh + 84}>{p.cathodeLine}</text>
          </>
        )}
        <text className="ph-axis-label" textAnchor="middle" x={W / 2} y={H - 10}>{p.overall}</text>
      </svg>
    </div>
  );
}

