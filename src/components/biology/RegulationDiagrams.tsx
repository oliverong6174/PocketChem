import type { ReactNode } from "react";
import {
  TRP_LEADER_PEPTIDE, TRP_REGIONS, evaluateEuk, evaluateLac, evaluateTrp, lacStepCaption, trpStep,
  type EukInput, type LacInput, type TrpInput,
} from "../../utils/biology/geneRegulation";

/**
 * Regulatory-DNA diagrams for the lac operon, the trp operon (with the leader RNA) and the eukaryotic gene. Every mark comes from
 * the engine state for the current step. Shapes carry meaning as well as colour:
 *   rectangle = cis-acting DNA element · rounded rectangle/ellipse = protein or machine · diamond = small molecule · wavy line = RNA.
 * Elements are selectable (click or Enter/Space) and report their id.
 */
const INK = "#0f172a", MUTED = "#475569";
const DNA = "#334155";
const C = { element: "#e0f2fe", elementStroke: "#0369a1", protein: "#fef3c7", proteinStroke: "#b45309", small: "#fce7f3", smallStroke: "#be185d", rna: "#15803d", bad: "#b91c1c", ok: "#166534", gene: "#e2e8f0", geneStroke: "#475569" };

type SelProps = { id: string; label: string; selected: string | null; onSelect: (id: string | null) => void; children: ReactNode };
function Sel({ id, label, selected, onSelect, children }: SelProps) {
  const on = selected === id;
  return (
    <g aria-label={label} aria-pressed={on} className="rg-sel" data-component={id} onClick={(e) => { e.stopPropagation(); onSelect(on ? null : id); }} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(on ? null : id); } }} role="button" tabIndex={0}>
      {children}
    </g>
  );
}
const Ring = ({ x, y, w, h, on }: { x: number; y: number; w: number; h: number; on: boolean }) => (on ? <rect fill="none" height={h + 8} rx={8} stroke="#1d4ed8" strokeDasharray="5 3" strokeWidth={2.4} width={w + 8} x={x - 4} y={y - 4} /> : null);
const Txt = ({ x, y, children, size = 12, bold = false, anchor = "middle", fill = INK }: { x: number; y: number; children: ReactNode; size?: number; bold?: boolean; anchor?: "start" | "middle" | "end"; fill?: string }) => (
  <text fill={fill} fontFamily="system-ui, sans-serif" fontSize={size} fontWeight={bold ? 700 : 500} textAnchor={anchor} x={x} y={y}>{children}</text>
);
const Wave = ({ x, y, w, amp = 5, color = C.rna, width = 2.4 }: { x: number; y: number; w: number; amp?: number; color?: string; width?: number }) => {
  let d = `M${x},${y}`;
  for (let i = 0; i < w; i += 12) d += ` q 3,${-amp} 6,0 t 6,0`;
  return <path d={d} fill="none" stroke={color} strokeWidth={width} />;
};

// =============================================================================================================================
// lac
// =============================================================================================================================

export function LacDiagram({ input, selected, onSelect, hideLabels }: { input: LacInput; selected: string | null; onSelect: (id: string | null) => void; hideLabels: boolean }) {
  const ev = evaluateLac(input);
  const step = input.step;
  const rows = input.copies.length;
  const rowH = 215;
  const H = 70 + rows * rowH + 10;
  const L = (t: string) => (hideLabels ? "?" : t);
  const summary = `lac operon diagram, step ${step} of 4. ${lacStepCaption(input, step).text}`;
  return (
    <div className="bio-diagram" data-testid="lac-diagram" data-rank={ev.transcription.rank} data-step={step} data-repressor-bound={ev.copies.map((c) => (c.repressorBound ? 1 : 0)).join("")} data-crp={ev.crpActive ? 1 : 0}>
      <svg aria-label={summary} className="ph-svg rg-svg" role="img" viewBox={`0 0 860 ${H}`}>
        <rect fill="#f8fafc" height={H} width={860} />
        {/* signals */}
        <g>
          <Sel id="allolactose" label="Allolactose, the inducer" onSelect={onSelect} selected={selected}>
            <Ring on={selected === "allolactose"} h={46} w={74} x={38} y={8} />
            <path d="M75 8 l32 23 -32 23 -32 -23z" fill={input.lactose ? C.small : "#ffffff"} stroke={C.smallStroke} strokeDasharray={input.lactose ? "" : "4 3"} strokeWidth={2} />
            <Txt x={75} y={35} size={10} bold>{input.lactose ? L("inducer") : "no lactose"}</Txt>
          </Sel>
          <Sel id="crp" label="cAMP–CRP, the glucose signal" onSelect={onSelect} selected={selected}>
            <Ring on={selected === "crp"} h={34} w={150} x={160} y={12} />
            <ellipse cx={235} cy={31} fill={ev.crpActive ? C.protein : "#ffffff"} rx={70} ry={17} stroke={C.proteinStroke} strokeDasharray={ev.crpActive ? "" : "4 3"} strokeWidth={2} />
            <Txt x={235} y={35} size={11} bold>{input.crp === "-" ? "CRP defective" : ev.crpActive ? L("cAMP high: CRP·cAMP") : L("cAMP low: no complex")}</Txt>
          </Sel>
          <Txt x={420} y={36} size={11} anchor="start" fill={MUTED}>{`glucose ${input.glucose ? "present" : "absent"} · lactose ${input.lactose ? "present" : "absent"}`}</Txt>
        </g>
        {input.copies.map((copy, ci) => {
          const st = ev.copies[ci];
          const y = 70 + ci * rowH + 105; // DNA line
          const x0 = 30;
          const stepRep = step >= 1, stepCrp = step >= 2, stepPol = step >= 3, stepOut = step >= 4;
          const rank = st.level.rank;
          return (
            <g key={ci}>
              <Txt x={x0} y={y - 98} size={12} bold anchor="start">{rows > 1 ? (ci === 0 ? "Chromosome" : "F′ plasmid (second copy)") : "Chromosome"}</Txt>
              <line stroke={DNA} strokeWidth={3} x1={x0} x2={830} y1={y} y2={y} />
              {/* lacI gene */}
              <Sel id="lacI" label={`lacI gene${rows > 1 ? ` copy ${ci + 1}` : ""}`} onSelect={onSelect} selected={selected}>
                <Ring on={selected === "lacI"} h={32} w={100} x={x0} y={y - 16} />
                <rect fill={C.gene} height={32} stroke={C.geneStroke} strokeWidth={2} width={100} x={x0} y={y - 16} />
                <Txt x={x0 + 50} y={y + 4} size={12} bold>{copy.I === "+" ? "lacI" : copy.I === "-" ? "lacI⁻ ✕" : "lacIˢ"}</Txt>
              </Sel>
              {/* CAP site */}
              <Sel id="cap" label="CAP site" onSelect={onSelect} selected={selected}>
                <Ring on={selected === "cap"} h={26} w={56} x={200} y={y - 13} />
                <rect fill={C.element} height={26} stroke={C.elementStroke} strokeWidth={2} width={56} x={200} y={y - 13} />
                <Txt x={228} y={y + 4} size={10.5} bold>{L("CAP site")}</Txt>
              </Sel>
              {/* promoter */}
              <Sel id="promoter" label="lac promoter" onSelect={onSelect} selected={selected}>
                <Ring on={selected === "promoter"} h={26} w={60} x={262} y={y - 13} />
                <rect fill={copy.P === "+" ? C.element : "#fee2e2"} height={26} stroke={copy.P === "+" ? C.elementStroke : C.bad} strokeWidth={2} width={60} x={262} y={y - 13} />
                <Txt x={292} y={y + 4} size={10.5} bold>{copy.P === "+" ? L("promoter") : "P⁻ ✕"}</Txt>
              </Sel>
              {/* operator */}
              <Sel id="operator" label="lac operator" onSelect={onSelect} selected={selected}>
                <Ring on={selected === "operator"} h={26} w={52} x={326} y={y - 13} />
                <rect fill={copy.O === "+" ? C.element : "#fee2e2"} height={26} stroke={copy.O === "+" ? C.elementStroke : C.bad} strokeWidth={2} width={52} x={326} y={y - 13} />
                <Txt x={352} y={y + 4} size={10.5} bold>{copy.O === "+" ? L("operator") : "Oᶜ"}</Txt>
              </Sel>
              {/* structural genes */}
              <Sel id="lacZYA" label="lacZ, lacY, lacA genes" onSelect={onSelect} selected={selected}>
                <Ring on={selected === "lacZYA"} h={32} w={394} x={386} y={y - 16} />
                {[["lacZ", 386, 146], ["lacY", 536, 118], ["lacA", 658, 122]].map(([n, x, w]) => (
                  <g key={n as string}>
                    <rect fill={C.gene} height={32} stroke={C.geneStroke} strokeWidth={2} width={w as number} x={x as number} y={y - 16} />
                    <Txt x={(x as number) + (w as number) / 2} y={y + 4} size={12} bold>{n === "lacZ" && copy.Z === "-" ? "lacZ⁻ ✕" : (n as string)}</Txt>
                  </g>
                ))}
              </Sel>
              {/* repressor */}
              {stepRep && ev.repressor !== "none" ? (
                <Sel id="repressor" label={`LacI repressor${st.repressorBound ? " bound to the operator" : " not on the operator"}`} onSelect={onSelect} selected={selected}>
                  {st.repressorBound ? (
                    <g>
                      <Ring on={selected === "repressor"} h={40} w={56} x={324} y={y - 58} />
                      {[0, 1, 2, 3].map((k) => <circle cx={338 + (k % 2) * 28} cy={y - 36 + Math.floor(k / 2) * 16} fill={C.protein} key={k} r={12} stroke={C.proteinStroke} strokeWidth={2} />)}
                      <Txt x={352} y={y - 62} size={11} bold>{L("LacI on operator")}</Txt>
                    </g>
                  ) : (
                    <g>
                      <Ring on={selected === "repressor"} h={44} w={96} x={x0 + 4} y={y - 70} />
                      {[0, 1, 2, 3].map((k) => <circle cx={x0 + 30 + (k % 2) * 24} cy={y - 56 + Math.floor(k / 2) * 14} fill={C.protein} key={k} r={10} stroke={C.proteinStroke} strokeWidth={2} />)}
                      {input.lactose && ev.repressor === "inducible" ? <path d={`M${x0 + 84} ${y - 50} l12 8 -12 8 -12 -8z`} fill={C.small} stroke={C.smallStroke} strokeWidth={2} /> : null}
                      <Txt x={x0 + 70} y={y - 76} size={11} bold>{ev.repressor === "uninducible" ? L("LacIˢ (cannot bind inducer)") : L("LacI released")}</Txt>
                    </g>
                  )}
                </Sel>
              ) : null}
              {/* cAMP-CRP on the CAP site */}
              {stepCrp && st.crpBound ? <g><ellipse cx={228} cy={y - 32} fill={C.protein} rx={24} ry={14} stroke={C.proteinStroke} strokeWidth={2} /><Txt x={228} y={y - 28} size={10} bold>{L("CRP·cAMP")}</Txt></g> : null}
              {/* RNA polymerase */}
              {stepPol && st.rnap !== "none" ? (
                <Sel id="rnap" label={`RNA polymerase, ${st.rnap}`} onSelect={onSelect} selected={selected}>
                  <Ring on={selected === "rnap"} h={34} w={78} x={st.rnap === "blocked" ? 252 : 262} y={y + 22} />
                  <rect fill={C.protein} height={34} rx={14} stroke={C.proteinStroke} strokeDasharray={st.rnap === "weak" ? "5 3" : ""} strokeWidth={st.rnap === "strong" ? 3 : 2} width={78} x={st.rnap === "blocked" ? 252 : 262} y={y + 22} />
                  <Txt x={(st.rnap === "blocked" ? 252 : 262) + 39} y={y + 38} size={10.5} bold>{st.rnap === "blocked" ? "RNAP blocked" : st.rnap === "weak" ? "RNAP (weak)" : "RNAP"}</Txt>
                  <Txt x={(st.rnap === "blocked" ? 252 : 262) + 39} y={y + 50} size={9.5} fill={MUTED}>{st.rnap === "blocked" ? "✕ at operator" : st.rnap === "weak" ? "binds rarely" : "binds well"}</Txt>
                </Sel>
              ) : null}
              {stepPol && st.rnap === "none" ? <Txt x={292} y={y + 44} size={10.5} bold fill={C.bad}>no RNAP binding</Txt> : null}
              {/* mRNA output */}
              {stepOut ? (
                <g>
                  {rank > 0 ? Array.from({ length: rank }, (_, k) => <Wave key={k} w={170} x={400} y={y + 36 + k * 11} />) : null}
                  <Txt x={590} y={y + 46} size={11} bold anchor="start" fill={rank > 0 ? C.ok : C.bad}>{`lacZYA mRNA: ${st.level.label}`}</Txt>
                  <Txt x={590} y={y + 60} size={10.5} anchor="start" fill={MUTED}>{copy.Z === "+" ? (rank > 0 ? "β-galactosidase made" : "no enzyme") : "mRNA makes no working β-gal"}</Txt>
                </g>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// =============================================================================================================================
// trp
// =============================================================================================================================

export function TrpDiagram({ input, selected, onSelect, hideLabels }: { input: TrpInput; selected: string | null; onSelect: (id: string | null) => void; hideLabels: boolean }) {
  const ev = evaluateTrp(input);
  const st = trpStep(input, input.step);
  const L = (t: string) => (hideLabels ? "?" : t);
  const y = 70;
  const boxes = TRP_REGIONS;
  // leader RNA strip: four region boxes with the peptide above region 1
  const ry = 250;
  const rx0 = 60, rw = 150, rgap = 40;
  const rX = (i: number) => rx0 + i * (rw + rgap);
  const drawn = st.drawn ?? null;
  const alt = ev.scenario === "mixed" && st.drawn ? ev.structures[1] : null;
  const codons = Array.from(TRP_LEADER_PEPTIDE);
  const ribX = st.ribosome.codon === null ? null : rX(0) + st.ribosome.codon * 25 + 11; // under the leader-peptide residue it is reading
  const arc = (pair: string, dashed: boolean, k: number) => {
    const [a, b] = pair.split(":").map(Number);
    const xa = rX(a - 1) + rw / 2, xb = rX(b - 1) + rw / 2;
    const h = 30 + (b - a) * 26;
    return (
      <g key={`${pair}-${k}-${dashed ? "d" : "s"}`}>
        <path d={`M${xa},${ry - 14} C${xa},${ry - 14 - h * 1.5} ${xb},${ry - 14 - h * 1.5} ${xb},${ry - 14}`} fill="none" stroke={pair === "3:4" ? C.bad : "#1d4ed8"} strokeDasharray={dashed ? "6 4" : ""} strokeWidth={3} />
        <Txt x={(xa + xb) / 2} y={ry - 14 - h * 1.1 - 6 - (dashed ? 14 : 0)} size={11} bold fill={pair === "3:4" ? C.bad : "#1d4ed8"}>{pair === "3:4" ? "3:4 terminator hairpin" : pair === "2:3" ? "2:3 antiterminator" : "1:2 pause hairpin"}{dashed ? " (alternative)" : ""}</Txt>
      </g>
    );
  };
  const summary = `trp operon diagram, step ${input.step} of 5. ${st.title}: ${st.text}`;
  const repX = 330;
  return (
    <div className="bio-diagram" data-testid="trp-diagram" data-step={input.step} data-operator={ev.operator} data-pairs={drawn ? drawn.pairs.join(",") : ""} data-outcome={st.outcome} data-rank={ev.level.rank}>
      <svg aria-label={summary} className="ph-svg rg-svg" role="img" viewBox="0 0 860 390">
        <rect fill="#f8fafc" height={390} width={860} />
        <line stroke={DNA} strokeWidth={3} x1={30} x2={830} y1={y} y2={y} />
        {[
          ["trpR", "trpR gene", 30, 90, C.gene],
        ].map(([id, t, x, w, f]) => (
          <Sel id={id as string} key={id as string} label={t as string} onSelect={onSelect} selected={selected}>
            <Ring on={selected === id} h={30} w={w as number} x={x as number} y={y - 15} />
            <rect fill={f as string} height={30} stroke={C.geneStroke} strokeWidth={2} width={w as number} x={x as number} y={y - 15} />
            <Txt x={(x as number) + (w as number) / 2} y={y + 4} size={11} bold>{input.repressor === "-" ? "trpR⁻ ✕" : "trpR"}</Txt>
          </Sel>
        ))}
        <Sel id="promoter" label="Promoter" onSelect={onSelect} selected={selected}>
          <Ring on={selected === "promoter"} h={30} w={64} x={240} y={y - 15} />
          <rect fill={C.element} height={30} stroke={C.elementStroke} strokeWidth={2} width={64} x={240} y={y - 15} />
          <Txt x={272} y={y + 4} size={11} bold>{L("promoter")}</Txt>
        </Sel>
        <Sel id="operator" label="Operator" onSelect={onSelect} selected={selected}>
          <Ring on={selected === "operator"} h={30} w={64} x={308} y={y - 15} />
          <rect fill={input.operator === "+" ? C.element : "#fee2e2"} height={30} stroke={input.operator === "+" ? C.elementStroke : C.bad} strokeWidth={2} width={64} x={308} y={y - 15} />
          <Txt x={340} y={y + 4} size={11} bold>{input.operator === "+" ? L("operator") : "O⁻ ✕"}</Txt>
        </Sel>
        <Sel id="leader" label="Leader peptide gene trpL" onSelect={onSelect} selected={selected}>
          <Ring on={selected === "leader"} h={30} w={120} x={376} y={y - 15} />
          <rect fill={C.gene} height={30} stroke={C.geneStroke} strokeWidth={2} width={120} x={376} y={y - 15} />
          <Txt x={436} y={y + 4} size={11} bold>{L("trpL (leader)")}</Txt>
        </Sel>
        <Sel id="attenuator" label="Attenuator" onSelect={onSelect} selected={selected}>
          <Ring on={selected === "attenuator"} h={30} w={90} x={500} y={y - 15} />
          <rect fill={input.attenuator === "+" ? C.element : "#fee2e2"} height={30} stroke={input.attenuator === "+" ? C.elementStroke : C.bad} strokeWidth={2} width={90} x={500} y={y - 15} />
          <Txt x={545} y={y + 4} size={11} bold>{input.attenuator === "+" ? L("attenuator") : "attenuator ✕"}</Txt>
        </Sel>
        <rect fill={C.gene} height={30} stroke={C.geneStroke} strokeWidth={2} width={230} x={600} y={y - 15} />
        <Txt x={715} y={y + 4} size={11} bold>trpE … trpA</Txt>
        {/* repressor and corepressor on the operator */}
        {input.step >= 1 || input.step === 0 ? (
          <Sel id="trpR" label="trp repressor" onSelect={onSelect} selected={selected}>
            {ev.operator !== "free" && input.repressor === "+" && input.operator === "+" ? (
              <g>
                <ellipse cx={repX + 10} cy={y - 42} fill={C.protein} rx={34} ry={20} stroke={C.proteinStroke} strokeDasharray={ev.operator === "partly bound" ? "5 3" : ""} strokeWidth={2.4} />
                <Txt x={repX + 10} y={y - 44} size={10.5} bold>{L("repressor")}</Txt>
                <path d={`M${repX + 40} ${y - 62} l10 7 -10 7 -10 -7z`} fill={C.small} stroke={C.smallStroke} strokeWidth={2} />
                <Txt x={repX + 8} y={y - 31} size={9.5}>{ev.operator === "bound" ? "+ Trp: active" : "partly active"}</Txt>
              </g>
            ) : (
              <g>
                {input.repressor === "+" ? <g><ellipse cx={120} cy={y - 42} fill="#ffffff" rx={34} ry={20} stroke={C.proteinStroke} strokeDasharray="4 3" strokeWidth={2} /><Txt x={120} y={y - 38} size={10.5} bold>{L("inactive")}</Txt></g> : null}
              </g>
            )}
          </Sel>
        ) : null}
        <Sel id="trp" label="Tryptophan" onSelect={onSelect} selected={selected}>
          <path d="M150 108 l26 19 -26 19 -26 -19z" fill={C.small} fillOpacity={input.trp === "low" ? 0.35 : input.trp === "moderate" ? 0.65 : 1} stroke={C.smallStroke} strokeWidth={2} />
          <Txt x={150} y={131} size={10} bold>Trp</Txt>
          <Txt x={150} y={162} size={11} bold>{`tryptophan: ${input.trp}`}</Txt>
        </Sel>
        {/* RNA polymerase over the DNA */}
        <g>
          <rect fill={C.protein} height={26} rx={12} stroke={C.proteinStroke} strokeWidth={2} width={70} x={st.rnapBlocked ? 216 : 262 + Math.min(1, st.rnapPos / Math.max(1, TRP_REGIONS[3].end)) * 300} y={y + 20} />
          <Txt x={(st.rnapBlocked ? 216 : 262 + Math.min(1, st.rnapPos / Math.max(1, TRP_REGIONS[3].end)) * 300) + 35} y={y + 37} size={10.5} bold>{st.rnapBlocked ? "RNAP ✕" : "RNAP"}</Txt>
        </g>
        {/* leader RNA: regions 1-4 */}
        <Txt x={30} y={196} size={12} bold anchor="start">Leader RNA (made left to right; regions 1–4)</Txt>
        <line stroke={C.rna} strokeWidth={3} x1={rx0 - 20} x2={rX(3) + rw + 20} y1={ry} y2={ry} />
        {boxes.map((r, i) => {
          const covered = st.ribosome.mode !== "absent" && (st.ribosome.mode === "stalled" ? r.id === 1 : st.ribosome.mode === "stopping" ? r.id === 2 : false);
          const present = !(r.id === 4 && input.attenuator === "-");
          return (
            <g key={r.id} opacity={present ? 1 : 0.35}>
              <rect fill={covered ? "#dbeafe" : "#f0fdf4"} height={28} stroke={C.rna} strokeDasharray={present ? "" : "4 3"} strokeWidth={2.2} width={rw} x={rX(i)} y={ry - 14} />
              <Txt x={rX(i) + rw / 2} y={ry + 5} size={12} bold>{`Region ${r.id}${r.id === 4 ? " + U run" : ""}`}</Txt>
            </g>
          );
        })}
        {drawn ? drawn.pairs.map((p, k) => arc(p, false, k)) : null}
        {alt ? alt.pairs.map((p, k) => arc(p, true, k)) : null}
        {st.hairpins.length && !drawn ? st.hairpins.map((p, k) => arc(p, false, k)) : null}
        {/* leader peptide and ribosome */}
        <Txt x={rX(0)} y={ry + 40} size={11} anchor="start" fill={MUTED}>Leader peptide (translated while the RNA is made):</Txt>
        <g>
          {codons.map((aa, i) => (
            <g key={i}>
              <rect fill={aa === "W" ? "#fde68a" : "#f1f5f9"} height={22} rx={4} stroke={aa === "W" ? C.proteinStroke : "#94a3b8"} strokeWidth={aa === "W" ? 2.2 : 1} width={22} x={rX(0) + i * 25} y={ry + 48} />
              <Txt x={rX(0) + i * 25 + 11} y={ry + 63} size={11} bold>{hideLabels ? "?" : aa}</Txt>
            </g>
          ))}
        </g>
        {ribX !== null ? (
          <Sel id="ribosome" label={`Ribosome on the leader (${st.ribosome.mode})`} onSelect={onSelect} selected={selected}>
            <g data-testid="trp-ribosome" data-mode={st.ribosome.mode}>
              <Ring on={selected === "ribosome"} h={40} w={112} x={ribX - 56} y={ry + 70} />
              <circle cx={ribX} cy={ry + 76} fill="#dcfce7" r={11} stroke={C.ok} strokeWidth={2.2} />
              <rect fill="#dcfce7" height={32} rx={14} stroke={C.ok} strokeWidth={2.2} width={104} x={ribX - 52} y={ry + 76} />
              <Txt x={ribX} y={ry + 97} size={10.5} bold>{st.ribosome.mode === "stalled" ? "ribosome stalled" : st.ribosome.mode === "stopping" ? "ribosome at stop" : "ribosome"}</Txt>
            </g>
          </Sel>
        ) : <Txt x={rX(0) + 330} y={ry + 70} size={11} anchor="start" fill={MUTED}>no ribosome on the leader</Txt>}
      </svg>
    </div>
  );
}

// =============================================================================================================================
// eukaryotic gene
// =============================================================================================================================

export function EukDiagram({ input, selected, onSelect, hideLabels }: { input: EukInput; selected: string | null; onSelect: (id: string | null) => void; hideLabels: boolean }) {
  const ev = evaluateEuk(input);
  const step = input.step;
  const L = (t: string) => (hideLabels ? "?" : t);
  const y = 190;
  const far = input.enhancerDistance === "far";
  const silX = 30, enhX = 160, proX = far ? 560 : 420, geneX = proX + 100;
  const openChrom = ev.chromatin === "open";
  const conflict = ev.chromatin === "conflicting";
  const nuc = (x: number, k: number) => (
    <g key={k}>
      <circle cx={x} cy={y + 112} fill={openChrom ? "#f1f5f9" : "#cbd5e1"} r={openChrom ? 11 : 15} stroke="#64748b" strokeWidth={2} />
      {input.acetylation ? <g><circle cx={x + 10} cy={y + 94} fill="#fef3c7" r={8} stroke={C.proteinStroke} strokeWidth={1.4} /><text fontSize={9} fontWeight={800} textAnchor="middle" x={x + 10} y={y + 97}>Ac</text></g> : null}
    </g>
  );
  const nucs: number[] = [];
  for (let x = 70; x < 820; x += openChrom ? 78 : conflict ? 58 : 44) nucs.push(x);
  const polState = ev.polII;
  const summary = `Eukaryotic regulation diagram, step ${step} of 4. ${ev.reasons[0]}`;
  const showTF = step >= 1, showMed = step >= 2, showPol = step >= 3, showOut = step >= 4;
  return (
    <div className="bio-diagram" data-testid="euk-diagram" data-step={step} data-chromatin={ev.chromatin} data-pol={ev.polII} data-level={ev.level.label} data-uncertain={ev.level.rank === null ? 1 : 0}>
      <svg aria-label={summary} className="ph-svg rg-svg" role="img" viewBox="0 0 860 380">
        <rect fill="#f8fafc" height={380} width={860} />
        <Txt x={30} y={28} size={12} bold anchor="start">{`Chromatin: ${ev.chromatin}${conflict ? " (conflicting marks)" : ""}`}</Txt>
        <line stroke={DNA} strokeWidth={3} x1={30} x2={830} y1={y} y2={y} />
        <line stroke="#94a3b8" strokeDasharray="3 3" strokeWidth={2} x1={30} x2={830} y1={y + 112} y2={y + 112} />
        <Txt x={30} y={y + 72} size={10.5} anchor="start" fill={MUTED}>chromatin (nucleosomes on the same DNA)</Txt>
        {nucs.map((x, k) => nuc(x, k))}
        <Sel id="methyl" label="Promoter DNA methylation" onSelect={onSelect} selected={selected}>
          <Ring on={selected === "methyl"} h={26} w={90} x={proX - 4} y={y - 52} />
          {input.methylation ? [0, 1, 2].map((k) => <g key={k}><line stroke="#7c3aed" strokeWidth={2} x1={proX + 8 + k * 24} x2={proX + 8 + k * 24} y1={y - 12} y2={y - 30} /><circle cx={proX + 8 + k * 24} cy={y - 34} fill="#7c3aed" r={5} /></g>) : <Txt x={proX + 112} y={y - 30} size={10.5} anchor="start" fill={MUTED}>promoter unmethylated</Txt>}
        </Sel>
        <Sel id="histones" label="Histone acetylation" onSelect={onSelect} selected={selected}>
          <Ring on={selected === "histones"} h={22} w={200} x={30} y={y + 136} />
          <Txt x={130} y={y + 152} size={10.5} bold>{input.acetylation ? "histones acetylated (Ac)" : "histones not acetylated"}</Txt>
        </Sel>
        {/* cis elements */}
        <Sel id="silencer" label="Silencer" onSelect={onSelect} selected={selected}>
          <Ring on={selected === "silencer"} h={30} w={80} x={silX} y={y - 15} />
          <rect fill={input.silencer === "present" ? C.element : "#ffffff"} height={30} stroke={C.elementStroke} strokeDasharray={input.silencer === "present" ? "" : "4 3"} strokeWidth={2} width={80} x={silX} y={y - 15} />
          <Txt x={silX + 40} y={y + 4} size={11} bold>{input.silencer === "present" ? L("silencer") : "no silencer"}</Txt>
        </Sel>
        <Sel id="enhancer" label="Enhancer" onSelect={onSelect} selected={selected}>
          <Ring on={selected === "enhancer"} h={30} w={104} x={enhX} y={y - 15} />
          <rect fill={input.enhancer === "absent" ? "#ffffff" : input.enhancer === "mutated" ? "#fee2e2" : C.element} height={30} stroke={input.enhancer === "mutated" ? C.bad : C.elementStroke} strokeDasharray={input.enhancer === "absent" ? "4 3" : ""} strokeWidth={2} width={104} x={enhX} y={y - 15} />
          <Txt x={enhX + 52} y={y + 4} size={11} bold>{input.enhancer === "absent" ? "no enhancer" : input.enhancer === "mutated" ? "enhancer ✕" : `${L("enhancer")} ${input.enhancerOrientation === "forward" ? "→" : "←"}`}</Txt>
        </Sel>
        <Sel id="promoter" label="Core promoter with TATA box" onSelect={onSelect} selected={selected}>
          <Ring on={selected === "promoter"} h={30} w={92} x={proX} y={y - 15} />
          <rect fill={input.promoter === "intact" ? C.element : "#fee2e2"} height={30} stroke={input.promoter === "intact" ? C.elementStroke : C.bad} strokeWidth={2} width={92} x={proX} y={y - 15} />
          <Txt x={proX + 46} y={y + 4} size={11} bold>{input.promoter === "intact" ? L("TATA promoter") : "TATA ✕"}</Txt>
        </Sel>
        <rect fill={C.gene} height={30} stroke={C.geneStroke} strokeWidth={2} width={170} x={geneX} y={y - 15} />
        <Txt x={geneX + 85} y={y + 4} size={11} bold>gene</Txt>
        {far ? <Txt x={(enhX + proX) / 2 + 40} y={y + 4} size={10.5} fill={MUTED}>~ far away ~</Txt> : null}
        {/* trans factors */}
        {showTF ? (
          <g>
            <Sel id="activator" label="Activator transcription factor" onSelect={onSelect} selected={selected}>
              <Ring on={selected === "activator"} h={30} w={96} x={enhX + 4} y={y - 66} />
              <ellipse cx={enhX + 52} cy={y - 50} fill={ev.activatorBound === true ? C.protein : "#ffffff"} rx={48} ry={15} stroke={C.proteinStroke} strokeDasharray={ev.activatorBound === true ? "" : "4 3"} strokeWidth={2} />
              <Txt x={enhX + 52} y={y - 46} size={10.5} bold>{!input.activator ? "no activator" : ev.activatorBound === true ? L("activator bound") : ev.activatorBound === "uncertain" ? "activator: ?" : "activator not bound"}</Txt>
            </Sel>
            {input.silencer === "present" ? (
              <Sel id="repressor" label="Repressor transcription factor" onSelect={onSelect} selected={selected}>
                <Ring on={selected === "repressor"} h={30} w={96} x={silX - 8} y={y - 66} />
                <ellipse cx={silX + 40} cy={y - 50} fill={ev.repressorBound === true ? "#fecaca" : "#ffffff"} rx={48} ry={15} stroke={C.bad} strokeDasharray={ev.repressorBound === true ? "" : "4 3"} strokeWidth={2} />
                <Txt x={silX + 40} y={y - 46} size={10.5} bold>{!input.repressor ? "no repressor" : ev.repressorBound === true ? L("repressor bound") : ev.repressorBound === "uncertain" ? "repressor: ?" : "repressor not bound"}</Txt>
              </Sel>
            ) : null}
          </g>
        ) : null}
        {showMed ? (
          <Sel id="mediator" label="Mediator" onSelect={onSelect} selected={selected}>
            <Ring on={selected === "mediator"} h={26} w={70} x={(enhX + 52 + proX + 46) / 2 - 35} y={y - 138} />
            {ev.mediatorBridge === true ? (
              <g>
                <path d={`M${enhX + 52},${y - 66} C${enhX + 52},${y - 150} ${proX + 46},${y - 150} ${proX + 46},${y - 18}`} fill="none" stroke={C.proteinStroke} strokeWidth={3} />
                <rect fill={C.protein} height={26} rx={10} stroke={C.proteinStroke} strokeWidth={2} width={70} x={(enhX + 52 + proX + 46) / 2 - 35} y={y - 138} />
                <Txt x={(enhX + 52 + proX + 46) / 2} y={y - 121} size={11} bold>{L("Mediator")}</Txt>
              </g>
            ) : (
              <g><rect fill="#ffffff" height={26} rx={10} stroke={C.proteinStroke} strokeDasharray="4 3" strokeWidth={2} width={104} x={(enhX + 52 + proX + 46) / 2 - 52} y={y - 138} /><Txt x={(enhX + 52 + proX + 46) / 2} y={y - 121} size={10.5} bold>{input.mediator ? "no bridge" : "Mediator absent"}</Txt></g>
            )}
          </Sel>
        ) : null}
        {showPol ? (
          <Sel id="polII" label="RNA polymerase II and general factors" onSelect={onSelect} selected={selected}>
            <Ring on={selected === "polII"} h={34} w={96} x={proX - 2} y={y + 22} />
            <rect fill={polState === "strong" || polState === "basal" ? C.protein : "#ffffff"} height={34} rx={14} stroke={C.proteinStroke} strokeDasharray={polState === "no" ? "4 3" : polState === "uncertain" ? "2 3" : ""} strokeWidth={polState === "strong" ? 3 : 2} width={96} x={proX - 2} y={y + 22} />
            <Txt x={proX + 46} y={y + 43} size={10.5} bold>{polState === "strong" ? "Pol II + GTFs" : polState === "basal" ? "Pol II (basal)" : polState === "uncertain" ? "Pol II: ?" : "no Pol II"}</Txt>
          </Sel>
        ) : null}
        {showOut ? (
          <g>
            {ev.level.rank !== null && ev.level.rank > 0 ? Array.from({ length: ev.level.rank }, (_, k) => <Wave key={k} w={150} x={geneX + 10} y={y + 36 + k * 12} />) : null}
            <Txt x={geneX + 175} y={y + 52} size={11} bold anchor="start" fill={ev.level.rank === null ? "#92400e" : ev.level.rank > 0 ? C.ok : C.bad}>{ev.level.rank === null ? "Uncertain" : ev.level.rank === 0 ? "silent / repressed" : ev.level.rank === 1 ? "basal mRNA" : "high mRNA"}</Txt>
          </g>
        ) : null}
      </svg>
    </div>
  );
}
