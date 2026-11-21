import type { ReactNode } from "react";
import { phaseInfo, type CycleVerdict, type PhaseId, type TransitionId } from "../../utils/biology/cellcycle26";
import { SelG, Txt } from "./cell23";
import "../../styles/bio26.css";

/**
 * Circular cell-cycle diagram. The arcs are the phases; the markers on the ring are the transitions whose verdicts (proceeds / pauses / unresolved)
 * come from the regulatory model, shown with a symbol AND a word. Arc angles are schematic and do not represent durations.
 */
const CX = 250, CY = 230, RO = 150, RI = 98;
const ARCS: Record<Exclude<PhaseId, "G0">, [number, number]> = { G1: [-90, 40], S: [40, 130], G2: [130, 205], M: [205, 270] };
const FILL: Record<Exclude<PhaseId, "G0">, string> = { G1: "#dbeafe", S: "#fef3c7", G2: "#dcfce7", M: "#fee2e2" };
const STROKE: Record<Exclude<PhaseId, "G0">, string> = { G1: "#1d4ed8", S: "#a16207", G2: "#15803d", M: "#b91c1c" };
const polar = (r: number, deg: number) => [CX + r * Math.cos((deg * Math.PI) / 180), CY + r * Math.sin((deg * Math.PI) / 180)] as const;
function sector(a0: number, a1: number): string {
  const [x0, y0] = polar(RO, a0), [x1, y1] = polar(RO, a1), [x2, y2] = polar(RI, a1), [x3, y3] = polar(RI, a0);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${x0} ${y0} A ${RO} ${RO} 0 ${large} 1 ${x1} ${y1} L ${x2} ${y2} A ${RI} ${RI} 0 ${large} 0 ${x3} ${y3} Z`;
}
const SYMBOL = { proceeds: "✓", pauses: "⏸", unresolved: "!" } as const;
const WORD = { proceeds: "proceeds", pauses: "pauses", unresolved: "unresolved" } as const;
const MARK: Record<TransitionId, { deg: number; r: number; label: string; dx: number; dy: number; anchor: "start" | "middle" | "end" }> = {
  g1s: { deg: 40, r: 124, label: "G1/S", dx: 22, dy: 6, anchor: "start" },
  s: { deg: 130, r: 124, label: "S→G2", dx: -8, dy: 26, anchor: "middle" },
  g2m: { deg: 205, r: 124, label: "G2/M", dx: -24, dy: 8, anchor: "end" },
  m: { deg: 240, r: 124, label: "Anaphase", dx: -24, dy: -8, anchor: "end" },
  g0g1: { deg: 0, r: 0, label: "Re-entry", dx: 0, dy: 0, anchor: "middle" },
};

export function CycleRing({ phase, verdicts, onPhase, label = "Cell-cycle diagram" }: { phase: PhaseId; verdicts: CycleVerdict[]; onPhase: (p: PhaseId) => void; label?: string }) {
  const v = (id: TransitionId) => verdicts.find((x) => x.id === id)!;
  const sel = (p: PhaseId) => phase === p;
  const info = phaseInfo(phase);
  const nodes: ReactNode[] = [];
  (Object.keys(ARCS) as Array<keyof typeof ARCS>).forEach((p) => {
    const [a0, a1] = ARCS[p], mid = (a0 + a1) / 2, [lx, ly] = polar((RO + RI) / 2, mid);
    nodes.push(
      <SelG id={p} key={p} label={`${phaseInfo(p).name}${sel(p) ? " (selected)" : ""}`} onSelect={() => onPhase(p)} selected={sel(p) ? p : null}>
        <path d={sector(a0, a1)} fill={FILL[p]} stroke={sel(p) ? "#0f172a" : STROKE[p]} strokeWidth={sel(p) ? 5 : 2.5} />
        <Txt bold size={17} x={lx} y={ly + 6}>{p}</Txt>
      </SelG>,
    );
  });
  return (
    <svg aria-label={label} className="b26-ring" role="group" viewBox="0 0 500 470">
      <title>{label}</title>
      <rect fill="#ffffff" height="470" width="500" />
      <defs><marker id="b26ring-ar" markerHeight="8" markerWidth="8" orient="auto" refX="6" refY="4" viewBox="0 0 8 8"><path d="M0 0.5 L7.5 4 L0 7.5 z" fill="#334155" /></marker></defs>
      {nodes}
      {/* direction */}
      <path d={`M ${polar(RO + 14, 255)[0]} ${polar(RO + 14, 255)[1]} A ${RO + 14} ${RO + 14} 0 0 1 ${polar(RO + 14, 284)[0]} ${polar(RO + 14, 284)[1]}`} fill="none" markerEnd="url(#b26ring-ar)" stroke="#334155" strokeWidth="2.5" />
      <Txt anchor="start" fill="#334155" size={11} x={polar(RO + 14, 292)[0]} y={polar(RO + 14, 292)[1] - 4}>clockwise</Txt>
      {/* G0 */}
      <SelG id="G0" label={`${phaseInfo("G0").name}${sel("G0") ? " (selected)" : ""}`} onSelect={() => onPhase("G0")} selected={sel("G0") ? "G0" : null}>
        <circle cx={62} cy={70} fill="#f1f5f9" r={34} stroke={sel("G0") ? "#0f172a" : "#475569"} strokeWidth={sel("G0") ? 5 : 2.5} />
        <Txt bold size={17} x={62} y={76}>G0</Txt>
      </SelG>
      <Txt fill="#334155" size={11} x={62} y={122}>quiescence</Txt>
      <path d="M 96 78 C 130 98 150 100 168 112" fill="none" markerEnd="url(#b26ring-ar)" stroke="#334155" strokeWidth="2" />
      <Txt anchor="start" fill="#334155" size={11} x={110} y={78}>{`re-entry: ${SYMBOL[v("g0g1").status]} ${WORD[v("g0g1").status]}`}</Txt>
      {/* transition markers */}
      {(["g1s", "s", "g2m", "m"] as const).map((id) => {
        const m = MARK[id], [x, y] = polar(m.r, m.deg), st = v(id).status;
        const here = v(id).from === phase;
        return (
          <SelG id={`t-${id}`} key={id} label={`${v(id).label}: ${WORD[st]}`} onSelect={() => onPhase(v(id).from)} selected={here ? `t-${id}` : null}>
            <circle cx={x} cy={y} fill={st === "proceeds" ? "#dcfce7" : st === "pauses" ? "#fee2e2" : "#fef3c7"} r={13} stroke="#0f172a" strokeDasharray={st === "pauses" ? "3 2" : undefined} strokeWidth={here ? 4 : 2} />
            <Txt bold size={13} x={x} y={y + 5}>{SYMBOL[st]}</Txt>
            <Txt anchor={m.anchor} bold size={11} x={x + m.dx + (m.anchor === "start" ? 6 : m.anchor === "end" ? -6 : 0)} y={y + m.dy - 8}>{m.label}</Txt>
            <Txt anchor={m.anchor} size={11} x={x + m.dx + (m.anchor === "start" ? 6 : m.anchor === "end" ? -6 : 0)} y={y + m.dy + 4}>{WORD[st]}</Txt>
          </SelG>
        );
      })}
      {/* centre */}
      <Txt bold size={16} x={CX} y={CY - 8}>{info.id === "G0" ? "G0" : info.id}</Txt>
      <Txt fill="#334155" size={12} x={CX} y={CY + 10}>{info.process}</Txt>
      <Txt fill="#334155" size={11} x={CX} y={CY + 28}>arcs are not to scale</Txt>
      <Txt anchor="start" fill="#334155" size={11} x={14} y={450}>✓ proceeds · ⏸ pauses · ! permitted despite a checkpoint signal (unresolved)</Txt>
    </svg>
  );
}
