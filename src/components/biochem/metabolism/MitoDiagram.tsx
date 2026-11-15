import { COMPLEXES, CARRIER_LABEL, DONORS, type CarrierId, type Donor, type EtcOutcome } from "../../../utils/biochem/metabolism/etc";

/**
 * Inner mitochondrial membrane: complexes I-IV, coenzyme Q, cytochrome c, O2 and ATP synthase. Electron markers move along the donor's
 * real path (NADH via complex I, succinate via complex II) and stop at a blocked complex; proton labels, the gradient dots and the ATP
 * synthase arrow come from the outcome of the respiratory-chain model, so the picture and the text cannot disagree.
 */
const INK = "#0f172a", MUTED = "#475569";
const POS: Record<CarrierId, { x: number; y: number }> = {
  NADH: { x: 62, y: 352 }, CI: { x: 120, y: 256 }, CII: { x: 250, y: 256 }, Q: { x: 330, y: 262 }, CIII: { x: 410, y: 256 }, cytc: { x: 475, y: 190 }, CIV: { x: 560, y: 256 }, O2: { x: 560, y: 352 },
};
const IS_COMPLEX = (c: CarrierId): c is "CI" | "CII" | "CIII" | "CIV" => c in COMPLEXES;
const DOTS: Record<EtcOutcome["gradient"], number> = { collapses: 3, lower: 8, normal: 14, higher: 22 };

export function MitoDiagram({ donors, outcome, step, selected, onSelect, hideNames, condition }: {
  donors: Donor[]; outcome: EtcOutcome; step: number; selected: CarrierId | "ATPSYN" | null; onSelect: (c: CarrierId | "ATPSYN") => void; hideNames?: boolean; condition: string;
}) {
  const blockedSet = new Set(outcome.donors.filter((d) => d.blockedAt).map((d) => d.blockedAt));
  const synthBlocked = condition === "oligomycin";
  const uncoupler = condition === "uncoupler";
  const reached = new Map<CarrierId, number>(); // carrier -> number of donors whose electrons have reached it
  const markers: Array<{ donor: Donor; at: CarrierId }> = [];
  const pumpLabels = new Map<CarrierId, number>();
  for (const d of donors) {
    const path = DONORS[d].path;
    const row = outcome.donors.find((r) => r.donor === d);
    const blockIdx = row?.blockedAt ? path.indexOf(row.blockedAt) : path.length;
    const count = Math.min(step, blockIdx);
    path.slice(0, count).forEach((c) => reached.set(c, (reached.get(c) ?? 0) + 1));
    if (count > 0) markers.push({ donor: d, at: path[count - 1] });
    if (row?.flows) path.slice(0, count).forEach((c) => { if (IS_COMPLEX(c) && COMPLEXES[c].protonsPerPair) pumpLabels.set(c, (pumpLabels.get(c) ?? 0) + COMPLEXES[c].protonsPerPair); });
  }
  const o2Reached = reached.has("O2");
  const segs = (d: Donor) => {
    const path = DONORS[d].path;
    return path.slice(1).map((c, i) => ({ from: POS[path[i]], to: POS[c], idx: i + 1, id: `${d}-${i}` }));
  };
  const dotsTop = Array.from({ length: DOTS[outcome.gradient] }, (_, i) => ({ x: 60 + (i % 11) * 62 + (Math.floor(i / 11) % 2) * 25, y: 70 + Math.floor(i / 11) * 38 }));
  const dotsBottom = Array.from({ length: outcome.gradient === "collapses" ? 3 : 3 }, (_, i) => ({ x: 90 + i * 190, y: 420 }));

  return (
    <svg aria-label={`Mitochondrial inner membrane, electron transport; ${outcome.electronFlow} electron flow, ${outcome.gradient} gradient`} className="mt-svg mt-mito" data-testid="mito-diagram" role="group" style={{ minWidth: 640 }} viewBox="0 0 780 500">
      <title>Respiratory chain in the inner mitochondrial membrane</title>
      <defs>
        <marker id="mt-e-arrow" markerHeight="7" markerWidth="7" orient="auto" refX="6" refY="3.5" viewBox="0 0 7 7"><path d="M0 0 L7 3.5 L0 7 z" fill="#1d4ed8" /></marker>
        <marker id="mt-h-arrow" markerHeight="7" markerWidth="7" orient="auto" refX="6" refY="3.5" viewBox="0 0 7 7"><path d="M0 0 L7 3.5 L0 7 z" fill="#be123c" /></marker>
      </defs>
      <rect fill="#fff" height={500} width={780} />
      <rect fill="#fff7ed" height={184} width={780} y={30} />
      <rect fill="#ecfeff" height={200} width={780} y={300} />
      <rect fill="#e2e8f0" height={86} width={780} y={214} />
      <text fill={MUTED} fontSize={13} fontWeight={700} x={12} y={22}>Intermembrane space (H⁺ accumulate here)</text>
      <text fill={MUTED} fontSize={13} fontWeight={700} x={12} y={492}>Matrix (NADH, succinate and ATP made here)</text>
      <text fill={MUTED} fontSize={12} x={12} y={207}>Inner mitochondrial membrane</text>
      {/* gradient dots: relative, qualitative */}
      <g aria-hidden="true" fill="#be123c" fontSize={11} fontWeight={700}>
        {dotsTop.map((d, i) => <text key={i} x={d.x} y={d.y}>H⁺</text>)}
      </g>
      <g aria-hidden="true" fill="#be123c" fontSize={11} fontWeight={700}>{dotsBottom.map((d, i) => <text key={i} x={d.x} y={d.y}>H⁺</text>)}</g>
      <text fill={INK} fontSize={13} fontWeight={700} x={560} y={62}>H⁺ gradient: {outcome.gradient}</text>
      {/* electron paths */}
      {donors.map((d) => segs(d).map((s) => {
        const row = outcome.donors.find((r) => r.donor === d);
        const blockIdx = row?.blockedAt ? DONORS[d].path.indexOf(row.blockedAt) : DONORS[d].path.length;
        const on = s.idx <= Math.min(step, blockIdx) - 1;
        return <path d={`M ${s.from.x} ${s.from.y} L ${s.to.x} ${s.to.y}`} fill="none" key={s.id} markerEnd={on ? "url(#mt-e-arrow)" : undefined} stroke={on ? "#1d4ed8" : "#94a3b8"} strokeDasharray={on ? undefined : "5 5"} strokeWidth={on ? 3 : 1.5} />;
      }))}
      {/* complexes */}
      {(["CI", "CII", "CIII", "CIV"] as const).map((c) => {
        const { x, y } = POS[c];
        const sel = selected === c, blocked = blockedSet.has(c);
        const hit = reached.has(c);
        const on = donors.some((d) => DONORS[d].path.includes(c));
        return (
          <g aria-label={`${COMPLEXES[c].name}${blocked ? ", inhibited" : ""}`} aria-pressed={sel} className="mt-hit" data-testid={`complex-${c}`} key={c} onClick={() => onSelect(c)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(c); } }} role="button" tabIndex={0}>
            <rect fill={blocked ? "#fee2e2" : hit ? "#fef3c7" : on ? "#f1f5f9" : "#e5e7eb"} height={90} rx={10} stroke={sel ? INK : blocked ? "#be123c" : "#475569"} strokeWidth={sel ? 4 : 2} width={108} x={x - 54} y={y - 45} />
            <text fill={INK} fontSize={hideNames ? 12 : 14} fontWeight={700} textAnchor="middle" x={x} y={y - 8}>{hideNames ? "Complex ?" : `Complex ${COMPLEXES[c].short}`}</text>
            <text fill={MUTED} fontSize={12} textAnchor="middle" x={x} y={y + 12}>{hideNames ? "enzyme" : c === "CII" ? "no H⁺ pumped" : `${COMPLEXES[c].protonsPerPair} H⁺ / 2 e⁻`}</text>
            {blocked ? <text fill="#be123c" fontSize={14} fontWeight={800} textAnchor="middle" x={x} y={y + 34}>✖ blocked</text> : null}
          </g>
        );
      })}
      {/* proton pumping */}
      {(["CI", "CIII", "CIV"] as const).map((c) => {
        const n = pumpLabels.get(c);
        if (!n) return null;
        const { x } = POS[c];
        return (
          <g aria-hidden="true" key={`p-${c}`}>
            <path d={`M ${x} 208 L ${x} 168`} fill="none" markerEnd="url(#mt-h-arrow)" stroke="#be123c" strokeWidth={3} />
            <text fill="#be123c" fontSize={14} fontWeight={800} textAnchor="middle" x={x} y={160}>+{n} H⁺</text>
          </g>
        );
      })}
      {/* Q, cytochrome c */}
      {([["Q", 330, 262, 24], ["cytc", 475, 190, 22]] as const).map(([id, x, y, r]) => (
        <g aria-label={CARRIER_LABEL[id]} aria-pressed={selected === id} className="mt-hit" data-testid={`carrier-${id}`} key={id} onClick={() => onSelect(id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(id); } }} role="button" tabIndex={0}>
          <circle cx={x} cy={y} fill={reached.has(id) ? "#fde68a" : "#f1f5f9"} r={r} stroke={selected === id ? INK : "#475569"} strokeWidth={selected === id ? 4 : 2} />
          <text fill={INK} fontSize={13} fontWeight={700} textAnchor="middle" x={x} y={y + 5}>{id === "Q" ? "Q" : "cyt c"}</text>
        </g>
      ))}
      <text fill={MUTED} fontSize={12} textAnchor="middle" x={330} y={318}>{hideNames ? "mobile carrier" : "Coenzyme Q (lipid)"}</text>
      <text fill={MUTED} fontSize={12} textAnchor="middle" x={475} y={150}>{hideNames ? "mobile protein" : "Cytochrome c"}</text>
      {/* donors and oxygen */}
      {donors.includes("nadh") ? (
        <g aria-hidden="true">
          <rect fill={reached.has("NADH") ? "#dcfce7" : "#f8fafc"} height={32} rx={8} stroke="#15803d" width={120} x={2} y={336} />
          <text fill={INK} fontSize={13} fontWeight={700} textAnchor="middle" x={62} y={357}>NADH → NAD⁺</text>
        </g>
      ) : null}
      {donors.includes("succinate") ? (
        <g aria-hidden="true">
          <rect fill={reached.has("CII") ? "#dcfce7" : "#f8fafc"} height={32} rx={8} stroke="#15803d" width={170} x={165} y={336} />
          <text fill={INK} fontSize={13} fontWeight={700} textAnchor="middle" x={250} y={357}>Succinate → fumarate</text>
        </g>
      ) : null}
      <g aria-hidden="true">
        <rect fill={o2Reached ? "#dbeafe" : "#f8fafc"} height={50} rx={8} stroke="#1d4ed8" width={196} x={462} y={330} />
        <text fill={INK} fontSize={13} fontWeight={700} textAnchor="middle" x={560} y={351}>½ O₂ + 2 H⁺ + 2 e⁻</text>
        <text fill={INK} fontSize={13} fontWeight={700} textAnchor="middle" x={560} y={370}>{o2Reached ? "→ H₂O formed" : "(terminal acceptor)"}</text>
      </g>
      {/* ATP synthase */}
      <g aria-label={`ATP synthase${synthBlocked ? ", inhibited" : ""}`} aria-pressed={selected === "ATPSYN"} className="mt-hit" data-testid="complex-ATPSYN" onClick={() => onSelect("ATPSYN")} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect("ATPSYN"); } }} role="button" tabIndex={0}>
        <rect fill={synthBlocked ? "#fee2e2" : "#fef9c3"} height={56} rx={8} stroke={selected === "ATPSYN" ? INK : synthBlocked ? "#be123c" : "#a16207"} strokeWidth={selected === "ATPSYN" ? 4 : 2} width={112} x={660} y={228} />
        <text fill={INK} fontSize={13} fontWeight={700} textAnchor="middle" x={716} y={252}>{hideNames ? "Enzyme ?" : "ATP synthase"}</text>
        <text fill={MUTED} fontSize={12} textAnchor="middle" x={716} y={270}>{synthBlocked ? "✖ blocked" : "F₀ rotor + F₁"}</text>
        <rect fill={synthBlocked ? "#fee2e2" : "#fde68a"} height={40} rx={20} stroke="#a16207" width={72} x={680} y={300} />
        <text fill={INK} fontSize={12.5} fontWeight={700} textAnchor="middle" x={716} y={324}>F₁ head</text>
      </g>
      {outcome.atpSynthesis !== "stops" && !synthBlocked && step >= 6 ? (
        <g aria-hidden="true">
          <path d="M 716 170 L 716 224" fill="none" markerEnd="url(#mt-h-arrow)" stroke="#be123c" strokeDasharray="4 3" strokeWidth={2.5} />
          <text fill="#be123c" fontSize={13} fontWeight={700} textAnchor="middle" x={716} y={160}>H⁺ flow back</text>
          <text fill="#166534" fontSize={13} fontWeight={800} textAnchor="middle" x={712} y={366}>{outcome.atpSynthesis === "normal" ? "ADP + Pi → ATP" : "ADP + Pi → ATP (reduced)"}</text>
        </g>
      ) : null}
      {uncoupler ? (
        <g aria-hidden="true">
          <path d="M 637 148 L 637 322" fill="none" markerEnd="url(#mt-h-arrow)" stroke="#be123c" strokeDasharray="6 4" strokeWidth={3} />
          <text fill="#be123c" fontSize={13} fontWeight={800} textAnchor="middle" x={637} y={132}>Uncoupler: H⁺ leak, ATP synthase bypassed</text>
        </g>
      ) : null}
      {markers.map((m) => {
        const p = POS[m.at];
        return (
          <g aria-hidden="true" className="mt-move" key={m.donor}>
            <circle cx={p.x + (m.donor === "nadh" ? -20 : 20)} cy={p.y - (IS_COMPLEX(m.at) ? 62 : 38)} fill="#1d4ed8" r={14} />
            <text fill="#fff" fontSize={11} fontWeight={800} textAnchor="middle" x={p.x + (m.donor === "nadh" ? -20 : 20)} y={p.y - (IS_COMPLEX(m.at) ? 58 : 34)}>2e⁻</text>
          </g>
        );
      })}
      <text fill={MUTED} fontSize={12} x={12} y={472}>Blue 2e⁻ = an electron pair; solid blue path = electrons carried so far; H⁺ dots = relative level (qualitative).</text>
    </svg>
  );
}
