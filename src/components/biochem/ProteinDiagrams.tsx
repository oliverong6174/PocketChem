import { useId } from "react";
import { RAMA_FILL, RAMA_PATTERN } from "./ramaStyle";
import { AMINO_ACIDS_BY_ONE } from "../../utils/biochem/aminoAcids";
import {
  classifyPhiPsi, helixFreeGroups, helixHBonds, wheelAngle, RAMA_LABEL, type DemoOutcome, type HBond, type IState, type RamaClass, type SheetModel,
} from "../../utils/biochem/protein";

const INK = "#1e293b", MUTED = "#64748b", PAPER = "#ffffff";
const STATE_FILL: Record<IState, string> = { intact: "#15803d", weakened: "#b45309", disrupted: "#b91c1c" };
const STATE_MARK: Record<IState, string> = { intact: "✔", weakened: "~", disrupted: "✖" };

/** The five levels of structure for one curated protein, drawn from its recorded sequence, subunits and disulfides. */
export function LevelsDiagram({ level, sequence, subunits, disulfides }: {
  level: 1 | 2 | 3 | 4; sequence?: string; subunits: Array<{ name: string; residues: number }>; disulfides: Array<{ a: string; b: string; pa: number; pb: number }>;
}) {
  const W = 620, H = 210;
  const seq = (sequence ?? "").slice(0, 30);
  const hydro = (r: string) => AMINO_ACIDS_BY_ONE[r]?.hydropathy ?? 0;
  const dot = (i: number, r: string) => {
    const h = hydro(r);
    return <g key={i}><circle cx={30 + i * 18} cy={70} fill={h > 1 ? "#fde68a" : h < -2 ? "#bfdbfe" : "#e2e8f0"} r={8} stroke={INK} strokeWidth={1} /><text fill={INK} fontSize={10} textAnchor="middle" x={30 + i * 18} y={74}>{r}</text>{i > 0 ? <line stroke={INK} x1={30 + (i - 1) * 18 + 8} x2={30 + i * 18 - 8} y1={70} y2={70} /> : null}</g>;
  };
  return (
    <svg aria-label={`Level ${level} of protein structure`} className="bc-svg" role="img" viewBox={`0 0 ${W} ${H}`}>
      <rect fill={PAPER} height={H} width={W} />
      {level === 1 ? (
        <g>
          <text fill={INK} fontSize={13} x={20} y={30}>Primary structure: the amino-acid sequence (N → C), joined by peptide bonds</text>
          {seq ? [...seq].map((r, i) => dot(i, r)) : <text fill={MUTED} fontSize={12} x={20} y={75}>Sequence not shown for this protein ({subunits[0]?.residues} residues).</text>}
          <text fill={MUTED} fontSize={11} x={20} y={115}>Fill: amber = hydrophobic, blue = very hydrophilic, grey = intermediate (Kyte–Doolittle). First {seq.length} residues shown.</text>
          <text fill={INK} fontSize={12} x={20} y={150}>N-terminus (free –NH₃⁺)</text><text fill={INK} fontSize={12} x={W - 200} y={150}>C-terminus (free –COO⁻)</text>
        </g>
      ) : null}
      {level === 2 ? (
        <g>
          <text fill={INK} fontSize={13} x={20} y={30}>Secondary structure: local, hydrogen-bonded backbone patterns</text>
          <path d="M30 120 q15 -50 30 0 t30 0 t30 0 t30 0 t30 0" fill="none" stroke="#0f766e" strokeWidth={5} />
          <text fill={INK} fontSize={12} x={30} y={160}>α-helix (i → i+4 bonds)</text>
          <path d="M290 120 h130" stroke="#b45309" strokeWidth={4} /><polygon fill="#b45309" points="420,108 445,120 420,132" />
          <path d="M445 150 h-130" stroke="#b45309" strokeWidth={4} /><polygon fill="#b45309" points="315,138 290,150 315,162" />
          <text fill={INK} fontSize={12} x={290} y={185}>β-strands side by side (β-sheet)</text>
          <path d="M500 130 q35 -50 60 -10 t0 30" fill="none" stroke={MUTED} strokeWidth={3} /><text fill={INK} fontSize={12} x={490} y={170}>turn / loop</text>
        </g>
      ) : null}
      {level === 3 ? (
        <g>
          <text fill={INK} fontSize={13} x={20} y={30}>Tertiary structure: the folded shape of one chain</text>
          <path d="M60 150 C 80 40 160 40 180 110 S 250 190 290 100 S 380 30 420 120 S 500 170 560 80" fill="none" stroke="#0f766e" strokeWidth={5} />
          {disulfides.map((d, i) => <g key={`${d.a}${d.pa}-${d.b}${d.pb}`}><path d={`M${130 + i * 130} 62 q30 70 60 0`} fill="none" stroke="#b45309" strokeDasharray="5 3" strokeWidth={3} /><text fill="#92400e" fontSize={11} x={125 + i * 130} y={120}>S–S {d.a}{d.pa}–{d.b}{d.pb}</text></g>)}
          <text fill={MUTED} fontSize={11} x={20} y={195}>Held by the hydrophobic core, hydrogen bonds, salt bridges, van der Waals contacts and (here) {disulfides.length ? `${disulfides.length} disulfide bond${disulfides.length === 1 ? "" : "s"}` : "no disulfide bonds"}. Schematic, not coordinates.</text>
        </g>
      ) : null}
      {level === 4 ? (
        <g>
          <text fill={INK} fontSize={13} x={20} y={30}>Quaternary structure: {subunits.length === 1 ? "one chain only (no quaternary structure)" : `${subunits.length} chains assemble`}</text>
          {subunits.map((s, i) => (
            <g key={`${s.name}-${i}`}><ellipse cx={90 + i * 130} cy={105} fill="#ccfbf1" rx={52} ry={42} stroke="#0f766e" strokeWidth={2} /><text fill={INK} fontSize={12} textAnchor="middle" x={90 + i * 130} y={102}>{s.name}</text><text fill={MUTED} fontSize={11} textAnchor="middle" x={90 + i * 130} y={118}>{s.residues} aa</text></g>
          ))}
          <text fill={MUTED} fontSize={11} x={20} y={185}>Subunits are held together by the same noncovalent forces (and sometimes disulfides). Schematic arrangement.</text>
        </g>
      ) : null}
    </svg>
  );
}

/** Backbone residues in a row with the i → i+4 hydrogen bonds as arcs. */
export function HelixDiagram({ n, selected, onSelect, hideBonds, lost = [] }: { n: number; selected: number | null; onSelect: (i: number | null) => void; hideBonds: boolean; lost?: HBond[] }) {
  const pad = 28, step = Math.min(34, (600 - 2 * pad) / Math.max(1, n - 1)), W = 2 * pad + step * (n - 1), H = 190, y = 120;
  const bonds = helixHBonds(n), free = helixFreeGroups(n);
  const rel = (b: HBond) => selected !== null && (b.acceptor === selected || b.donor === selected);
  return (
    <svg aria-label={`Alpha helix of ${n} residues with ${bonds.length} backbone hydrogen bonds`} className="bc-svg" role="group" viewBox={`0 0 ${Math.max(W, 300)} ${H}`}>
      <rect fill={PAPER} height={H} width={Math.max(W, 300)} />
      {!hideBonds ? bonds.map((b) => {
        const x1 = pad + b.acceptor * step, x2 = pad + b.donor * step;
        const gone = lost.some((l) => l.acceptor === b.acceptor && l.donor === b.donor);
        if (gone) return <g key={`${b.acceptor}-${b.donor}`}><path d={`M${x1} ${y - 12} Q${(x1 + x2) / 2} ${y - 12 - 4 * step * 0.9} ${x2} ${y - 12}`} fill="none" stroke="#b91c1c" strokeDasharray="2 5" strokeWidth={1.6} /><text fill="#b91c1c" fontSize={12} textAnchor="middle" x={(x1 + x2) / 2} y={y - 12 - 3 * step * 0.9}>✖</text></g>;
        return <path d={`M${x1} ${y - 12} Q${(x1 + x2) / 2} ${y - 12 - 4 * step * 0.9} ${x2} ${y - 12}`} fill="none" key={`${b.acceptor}-${b.donor}`} stroke={rel(b) ? "#be123c" : "#0f766e"} strokeDasharray="4 3" strokeWidth={rel(b) ? 3 : 1.6} />;
      }) : null}
      <polyline fill="none" points={Array.from({ length: n }, (_, i) => `${pad + i * step},${y + (i % 2 ? 8 : -8)}`).join(" ")} stroke={MUTED} strokeWidth={2} />
      {Array.from({ length: n }, (_, i) => {
        const cx = pad + i * step, cy = y + (i % 2 ? 8 : -8), on = selected === i;
        return (
          <g aria-label={`Residue ${i + 1}${free.freeDonors.includes(i) ? ", N–H without a hydrogen-bond acceptor" : ""}${free.freeAcceptors.includes(i) ? ", C=O without a donor" : ""}`} aria-pressed={on} key={i} onClick={() => onSelect(on ? null : i)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(on ? null : i); } }} role="button" style={{ cursor: "pointer" }} tabIndex={0}>
            <circle cx={cx} cy={cy} fill={on ? "#fecdd3" : free.freeDonors.includes(i) || free.freeAcceptors.includes(i) ? "#fef3c7" : "#ccfbf1"} r={11} stroke={INK} strokeWidth={on ? 2.5 : 1} />
            <text fill={INK} fontSize={10} textAnchor="middle" x={cx} y={cy + 4}>{i + 1}</text>
          </g>
        );
      })}
      <text fill={MUTED} fontSize={11} x={pad} y={H - 12}>Arcs: C=O of residue i to N–H of residue i+4. Amber residues have a backbone group with no partner inside the helix.</text>
    </svg>
  );
}

/** Helical wheel: 100° per residue; hydrophobic residues amber, charged blue/red (also marked by letter). */
export function HelicalWheel({ seq }: { seq: string }) {
  const R = 78, c = 105;
  return (
    <svg aria-label="Helical wheel" className="bc-svg bc-wheel" role="img" viewBox="0 0 210 210">
      <rect fill={PAPER} height={210} width={210} />
      <circle cx={c} cy={c} fill="none" r={R} stroke="#cbd5e1" />
      {[...seq].map((r, i) => {
        const a = ((wheelAngle(i) - 90) * Math.PI) / 180, x = c + R * Math.cos(a), yy = c + R * Math.sin(a), aa = AMINO_ACIDS_BY_ONE[r];
        const fill = aa.hydropathy > 1.5 ? "#fde68a" : aa.cls === "positive" ? "#bfdbfe" : aa.cls === "negative" ? "#fecdd3" : "#e2e8f0";
        return <g key={i}><line stroke="#e2e8f0" x1={c} x2={x} y1={c} y2={yy} /><circle cx={x} cy={yy} fill={fill} r={11} stroke={INK} /><text fill={INK} fontSize={10} textAnchor="middle" x={x} y={yy + 4}>{r}</text><text fill={MUTED} fontSize={8} textAnchor="middle" x={x} y={yy - 14}>{i + 1}</text></g>;
      })}
      <text fill={MUTED} fontSize={9} textAnchor="middle" x={c} y={c + 3}>top view</text>
    </svg>
  );
}

/** Strands as arrows in rows, with the interstrand backbone hydrogen bonds drawn between neighbouring strands. */
export function SheetDiagram({ model, hideBonds }: { model: SheetModel; hideBonds: boolean }) {
  const pad = 40, step = Math.min(44, 520 / model.strandLength), rowGap = 62, W = pad * 2 + step * (model.strandLength - 1) + 40, H = pad + rowGap * (model.strands - 1) + 52;
  const xOf = (s: number, r: number) => pad + (model.directions[s] > 0 ? r : model.strandLength - 1 - r) * step;
  const yOf = (s: number) => 36 + s * rowGap;
  return (
    <svg aria-label={`${model.kind} beta sheet, ${model.strands} strands of ${model.strandLength} residues`} className="bc-svg" role="img" viewBox={`0 0 ${W} ${H}`}>
      <rect fill={PAPER} height={H} width={W} />
      {!hideBonds ? model.bonds.map((b, i) => <line key={i} stroke="#0f766e" strokeDasharray="4 3" strokeWidth={1.8} x1={xOf(b.strandA, b.resA)} x2={xOf(b.strandB, b.resB)} y1={yOf(b.strandA) + 8} y2={yOf(b.strandB) - 8} />) : null}
      {Array.from({ length: model.strands }, (_, s) => {
        const left = model.directions[s] > 0, x0 = pad - 14, x1 = pad + (model.strandLength - 1) * step + 14;
        return (
          <g key={s}>
            <path d={left ? `M${x0} ${yOf(s) - 9} H${x1 - 10} V${yOf(s) - 15} L${x1 + 10} ${yOf(s)} L${x1 - 10} ${yOf(s) + 15} V${yOf(s) + 9} H${x0} Z` : `M${x1} ${yOf(s) - 9} H${x0 + 10} V${yOf(s) - 15} L${x0 - 10} ${yOf(s)} L${x0 + 10} ${yOf(s) + 15} V${yOf(s) + 9} H${x1} Z`} fill="#fef3c7" stroke="#b45309" strokeWidth={1.5} />
            {Array.from({ length: model.strandLength }, (_, r) => <circle cx={xOf(s, r)} cy={yOf(s)} fill="#b45309" key={r} r={2.5} />)}
            <text fill={INK} fontSize={11} x={4} y={yOf(s) + 4}>{left ? "N→C" : "C←N"}</text>
          </g>
        );
      })}
      <text fill={MUTED} fontSize={11} x={pad} y={H - 8}>Arrow points toward the C-terminus. Dashed: backbone C=O···H–N bonds between neighbouring strands.</text>
    </svg>
  );
}

/** Ramachandran plot: allowed regions shaded from the same classifier the readout uses. The marker moves with the arrow keys. */
export function RamachandranPlot({ phi, psi, residue, onChange }: { phi: number; psi: number; residue: "general" | "G" | "P"; onChange: (phi: number, psi: number) => void }) {
  const size = 360, m = 44, plot = size - m - 12, id = useId();
  const sx = (v: number) => m + ((v + 180) / 360) * plot, sy = (v: number) => 12 + ((180 - v) / 360) * plot;
  const cells: Array<{ x: number; y: number; c: RamaClass }> = [];
  for (let p = -180; p < 180; p += 10) for (let q = -180; q < 180; q += 10) cells.push({ x: p, y: q, c: classifyPhiPsi(p + 5, q + 5, residue) });
  const cur = classifyPhiPsi(phi, psi, residue);
  const clamp = (v: number) => ((((v + 180) % 360) + 360) % 360) - 180;
  const key = (e: React.KeyboardEvent) => {
    const d = e.shiftKey ? 10 : 2;
    const next = e.key === "ArrowLeft" ? [phi - d, psi] : e.key === "ArrowRight" ? [phi + d, psi] : e.key === "ArrowUp" ? [phi, psi + d] : e.key === "ArrowDown" ? [phi, psi - d] : null;
    if (next) { e.preventDefault(); onChange(Math.round(clamp(next[0])), Math.round(clamp(next[1]))); }
  };
  const ticks = [-180, -120, -60, 0, 60, 120, 180];
  return (
    <svg aria-label={`Ramachandran plot. Current point phi ${phi}, psi ${psi}: ${RAMA_LABEL[cur]}`} className="bc-svg bc-rama" data-testid="rama-plot" role="img" viewBox={`0 0 ${size} ${size}`}>
      <rect fill={PAPER} height={size} width={size} />
      {cells.map((c) => <rect fill={RAMA_FILL[c.c]} height={(10 / 360) * plot + 0.5} key={`${c.x},${c.y}`} width={(10 / 360) * plot + 0.5} x={sx(c.x)} y={sy(c.y + 10)} />)}
      {cells.filter((c) => RAMA_PATTERN[c.c] && c.x % 30 === 0 && c.y % 30 === 0).map((c) => <text fill="#475569" fontSize={9} key={`g${c.x},${c.y}`} textAnchor="middle" x={sx(c.x + 5)} y={sy(c.y + 5) + 3}>{RAMA_PATTERN[c.c]}</text>)}
      <rect fill="none" height={plot} stroke={INK} width={plot} x={m} y={12} />
      {ticks.map((t) => <g key={t}><line stroke="#94a3b8" x1={sx(t)} x2={sx(t)} y1={12 + plot} y2={12 + plot + 4} /><text fill={INK} fontSize={10} textAnchor="middle" x={sx(t)} y={12 + plot + 16}>{t}</text><line stroke="#94a3b8" x1={m - 4} x2={m} y1={sy(t)} y2={sy(t)} /><text fill={INK} fontSize={10} textAnchor="end" x={m - 7} y={sy(t) + 3}>{t}</text></g>)}
      <text fill={INK} fontSize={11} textAnchor="middle" x={m + plot / 2} y={size - 4}>φ (°)</text>
      <text fill={INK} fontSize={11} textAnchor="middle" transform={`rotate(-90 12 ${12 + plot / 2})`} x={12} y={12 + plot / 2}>ψ (°)</text>
      <g aria-label={`Backbone angles phi ${phi}, psi ${psi}. Arrow keys move by 2 degrees, with Shift by 10.`} aria-valuetext={`phi ${phi}, psi ${psi}, ${RAMA_LABEL[cur]}`} id={id} onKeyDown={key} role="slider" aria-valuemax={180} aria-valuemin={-180} aria-valuenow={phi} data-testid="rama-marker" tabIndex={0}>
        <circle cx={sx(phi)} cy={sy(psi)} fill="#be123c" r={7} stroke="#fff" strokeWidth={2} />
        <circle cx={sx(phi)} cy={sy(psi)} fill="none" r={11} stroke="#be123c" strokeWidth={1.5} />
      </g>
    </svg>
  );
}

/** The demonstration domain with each stabilizing interaction drawn as a labelled mark whose symbol and color give its state. */
export function InteractionDiagram({ outcome, hideLabels }: { outcome: DemoOutcome; hideLabels: boolean }) {
  const W = 560, H = 230;
  const pos: Record<string, [number, number]> = { salt: [150, 60], disulfide: [410, 60], hbond: [150, 150], hydrophobic: [280, 110], vdw: [410, 150] };
  const folded = outcome.overall === "native-like";
  return (
    <svg aria-label={`Model domain, ${outcome.overall}`} className="bc-svg" role="img" viewBox={`0 0 ${W} ${H}`}>
      <rect fill={PAPER} height={H} width={W} />
      <path d={folded ? "M80 130 C 100 20 250 10 280 70 S 450 20 490 100 S 400 210 300 190 S 90 220 80 130 Z" : outcome.overall === "partly unfolded" ? "M60 110 C 120 30 200 190 280 90 S 380 180 450 90 S 500 130 520 150" : "M30 120 L 70 60 L 110 170 L 150 70 L 190 160 L 230 80 L 270 150 L 310 90 L 350 160 L 390 80 L 430 150 L 470 90 L 520 130"} fill={folded ? "#ecfdf5" : "none"} stroke="#0f766e" strokeWidth={folded ? 3 : 4} />
      {outcome.statuses.map((s) => {
        const [x, y] = pos[s.id] ?? [50, 50];
        return (
          <g key={s.id}>
            <circle cx={x} cy={y} fill={PAPER} r={17} stroke={STATE_FILL[s.state]} strokeDasharray={s.state === "intact" ? undefined : s.state === "weakened" ? "4 3" : "2 3"} strokeWidth={3} />
            <text fill={STATE_FILL[s.state]} fontSize={15} fontWeight={700} textAnchor="middle" x={x} y={y + 5}>{STATE_MARK[s.state]}</text>
            {!hideLabels ? <text fill={INK} fontSize={11} textAnchor="middle" x={x} y={y + 33}>{s.label.split(" (")[0].split(" and ")[0]}</text> : null}
          </g>
        );
      })}
      <text fill={MUTED} fontSize={11} x={14} y={H - 8}>✔ intact, ~ weakened, ✖ disrupted (color and symbol). Schematic domain, not a real protein.</text>
    </svg>
  );
}
