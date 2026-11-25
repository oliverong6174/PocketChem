import { prettyFormula } from "../../utils/generalChem/formula";
import { formatSig } from "../../utils/generalChem/format";
import { particleUnit, type StoichResult } from "../../utils/generalChem/stoichiometry";
import { useContainerWidth } from "../physics/simHooks";

const INK = "#0f172a";
const TEAL = "#0b6a72";
const AMBER = "#b45309";
const MUTED = "#94a3b8";
const SLATE = "#475569";
const g = (v: number) => formatSig(v, 3);

/** Species colours + shapes (the shape keeps species apart without colour). */
const STYLES = [
  { color: "#0b6a72", shape: "circle" }, { color: "#b45309", shape: "square" }, { color: "#7c3aed", shape: "diamond" },
  { color: "#be123c", shape: "triangle" }, { color: "#1d4ed8", shape: "circle" }, { color: "#15803d", shape: "square" },
] as const;

function Mark({ x, y, r, shape, color }: { x: number; y: number; r: number; shape: (typeof STYLES)[number]["shape"]; color: string }) {
  if (shape === "square") return <rect fill={color} height={2 * r} width={2 * r} x={x - r} y={y - r} />;
  if (shape === "diamond") return <polygon fill={color} points={`${x},${y - r - 1} ${x + r + 1},${y} ${x},${y + r + 1} ${x - r - 1},${y}`} />;
  if (shape === "triangle") return <polygon fill={color} points={`${x},${y - r - 1} ${x + r + 1},${y + r} ${x - r - 1},${y + r}`} />;
  return <circle cx={x} cy={y} fill={color} r={r + 0.5} />;
}

/** Amount ledger as horizontal bars: moles before the reaction (grey) and after it (colour), per species, plus the single reaction extent. */
export function LedgerBars({ result }: { result: StoichResult }) {
  const [wrapRef, avail] = useContainerWidth();
  const W = Math.max(320, Math.min(avail, 860));
  const left = 118; const right = W - 150;
  const rows = result.ledger;
  const maxMol = Math.max(1e-300, ...rows.map((r) => Math.max(r.initialMol, r.finalMol)));
  const rowH = 46;
  const H = 40 + rows.length * rowH + 36;
  const x = (v: number) => left + (v / maxMol) * (right - left);
  return (
    <div className="ph-diagram" ref={wrapRef}>
      <svg aria-label={`Amount ledger: ${rows.map((r) => `${r.text} ${g(r.initialMol)} mol before, ${g(r.finalMol)} mol after`).join("; ")}. Reaction extent ${g(result.extent)} mol.`} className="ph-svg" height={H} role="img" viewBox={`0 0 ${W} ${H}`} width={W}>
        <rect className="ph-paper" height={H} width={W} x={0} y={0} />
        <text className="ph-axis-label" x={left} y={18}>grey: before the reaction, colour: after it (mol)</text>
        {rows.map((r, k) => {
          const y = 34 + k * rowH;
          const st = STYLES[k % STYLES.length];
          return (
            <g key={r.text}>
              <text className="ph-note-text" textAnchor="end" x={left - 8} y={y + 16}>{r.coeff === 1 ? "" : `${r.coeff} `}{prettyFormula(r.text)}</text>
              <rect fill={MUTED} fillOpacity={0.45} height={12} width={Math.max(0, x(r.initialMol) - left)} x={left} y={y} />
              <rect fill={r.role === "product" ? st.color : r.limiting ? AMBER : TEAL} height={12} width={Math.max(0, x(r.finalMol) - left)} x={left} y={y + 16} />
              <text className="ph-tick" x={x(r.initialMol) + 5} y={y + 10}>{g(r.initialMol)}</text>
              <text className="ph-tick" x={x(r.finalMol) + 5} y={y + 26}>{g(r.finalMol)}</text>
              <text className="ph-note-text" x={W - 80} y={y + 20}>{r.role === "product" ? "product" : r.limiting ? "limiting" : r.excess ? "excess" : "used up"}</text>
            </g>
          );
        })}
        <line stroke={INK} x1={left} x2={left} y1={28} y2={34 + rows.length * rowH - 6} />
        <text className="ph-axis-label" x={left} y={H - 12}>reaction extent ξ = {g(result.extent)} mol, shared by every species: Δn = ±coefficient × ξ</text>
      </svg>
    </div>
  );
}

/** Schematic particle counts before and after, from the same ledger as the numbers: one marker stands for `unit` mol. Not a molecular-scale simulation. */
export function ParticlePicture({ result }: { result: StoichResult }) {
  const [wrapRef, avail] = useContainerWidth();
  const W = Math.max(320, Math.min(avail, 860));
  const unit = particleUnit(result);
  const rows = result.ledger;
  const half = (W - 24) / 2;
  const per = Math.max(4, Math.floor((half - 120) / 16));
  const counts = (key: "initialMol" | "finalMol") => rows.map((r) => Math.round(r[key] / unit));
  const before = counts("initialMol"); const after = counts("finalMol");
  const rowH = (c: number) => Math.max(1, Math.ceil(c / per)) * 16 + 14;
  const heights = rows.map((_, k) => Math.max(rowH(before[k]), rowH(after[k])));
  const H = 40 + heights.reduce((a, b) => a + b, 0) + 24;
  const offsets = heights.map((_, k) => 40 + heights.slice(0, k).reduce((a, b) => a + b, 0));
  return (
    <div className="ph-diagram" ref={wrapRef}>
      <svg aria-label={`Schematic particle counts, one marker is ${g(unit)} mol. ${rows.map((r, k) => `${r.text}: ${before[k]} before, ${after[k]} after`).join("; ")}.`} className="ph-svg" height={H} role="img" viewBox={`0 0 ${W} ${H}`} width={W}>
        <rect className="ph-paper" height={H} width={W} x={0} y={0} />
        <text className="ph-axis-label" x={12} y={20}>before</text>
        <text className="ph-axis-label" x={12 + half + 12} y={20}>after</text>
        <line stroke={SLATE} strokeDasharray="4 4" x1={W / 2} x2={W / 2} y1={8} y2={H - 8} />
        {rows.map((r, k) => {
          const y0 = offsets[k];
          const st = STYLES[k % STYLES.length];
          const draw = (n: number, ox: number) => Array.from({ length: n }, (_, j) => <Mark color={st.color} key={j} r={5} shape={st.shape} x={ox + 112 + (j % per) * 16} y={y0 + 12 + Math.floor(j / per) * 16} />);
          return (
            <g key={r.text}>
              <text className="ph-note-text" x={12} y={y0 + 16}>{prettyFormula(r.text)}</text>
              <text className="ph-tick" x={12} y={y0 + 32}>×{before[k]}</text>
              {draw(before[k], 0)}
              <text className="ph-note-text" x={12 + half + 12} y={y0 + 16}>{prettyFormula(r.text)}</text>
              <text className="ph-tick" x={12 + half + 12} y={y0 + 32}>×{after[k]}</text>
              {draw(after[k], half + 12)}
            </g>
          );
        })}
        <text className="ph-note-text" x={12} y={H - 8}>1 marker ≈ {g(unit)} mol (counts rounded): schematic, not a simulation</text>
      </svg>
    </div>
  );
}
