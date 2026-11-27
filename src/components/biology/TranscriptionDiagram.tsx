import { useEffect, useRef } from "react";
import { HYBRID_LENGTH, POLY_A_SHOWN, branchPoint, type TranscriptionModel, type TxStep } from "../../utils/biology/transcription";

/**
 * Transcription drawn from one engine step. The coding strand and template strand show the real gene (template written 3′→5′ under
 * the coding strand, column for column); every RNA base is the RNA complement of the template base in its column. Colours are fixed
 * because the diagram sits on paper in both themes.
 */
const CW = 24;
const ML = 118;
const H = 310;
const C = {
  coding: { fill: "#dbe7f3", stroke: "#3b5b7d" },
  template: { fill: "#e6e0f5", stroke: "#5b4f8f" },
  rna: { fill: "#f8c7d0", stroke: "#be123c" },
};

function useFollow(x: number) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (x < el.scrollLeft + 80 || x > el.scrollLeft + el.clientWidth - 80) el.scrollLeft = Math.max(0, x - el.clientWidth / 2);
  }, [x]);
  return ref;
}

export function TranscriptionDiagram({ model, step, hideLabels }: { model: TranscriptionModel; step: TxStep; hideLabels: boolean }) {
  const L = model.rna.length;
  const euk = model.input.organism === "eukaryote";
  const W = ML + L * CW + 60;
  const st = step.state;
  const x = (i: number) => ML + i * CW + CW / 2;
  const lab = (t: string) => (hideLabels ? "?" : t);
  const Y = { codingD: 100, templateD: 128, codingO: 78, templateO: 160, hybrid: 188, free: 240 };
  const inBubble = (i: number) => st.bubble.open && i >= st.bubble.from && i < st.bubble.to;
  const yCoding = (i: number) => (inBubble(i) ? Y.codingO : Y.codingD);
  const yTemplate = (i: number) => (inBubble(i) ? Y.templateO : Y.templateD);
  const hybridFrom = Math.max(0, st.transcribed - HYBRID_LENGTH);
  const released = step.phase !== "initiation" && step.phase !== "elongation";
  const path = (yf: (i: number) => number) => Array.from({ length: L }, (_, i) => `${i === 0 ? "M" : "L"}${x(i)} ${yf(i)}`).join(" ");
  const polX = x(Math.max(0, st.transcribed - 1)) + CW;
  const ref = useFollow(st.polymerasePresent ? polX : ML);
  const cell = (cx: number, cy: number, t: string, k: keyof typeof C, key: string) => (
    <g key={key}>
      <rect fill={C[k].fill} height={20} rx={5} stroke={C[k].stroke} strokeWidth={1.5} width={CW - 4} x={cx - CW / 2 + 2} y={cy - 10} />
      <text className="bio-base" textAnchor="middle" x={cx} y={cy + 5}>{t}</text>
    </g>
  );
  const templ = model.template;
  const rnaY = (i: number) => (released ? Y.free : i >= hybridFrom ? Y.hybrid : Y.free);
  const rnaCells = Array.from({ length: st.transcribed }, (_, i) => i);
  const bubX1 = x(st.bubble.from) - CW / 2 - 4;
  const bubX2 = x(Math.max(st.bubble.from, st.bubble.to - 1)) + CW / 2 + 4;
  return (
    <div className="ph-diagram bio-diagram" ref={ref}>
      <svg aria-label={`Transcription: ${st.transcribed} of ${L} nucleotides made`} className="ph-svg" data-testid="transcription-diagram" data-transcribed={st.transcribed} height={H} role="img" viewBox={`0 0 ${W} ${H}`} width={W}>
        <rect className="ph-paper" height={H} width={W} />
        <line stroke="#0f172a" strokeWidth={2} x1={ML + 4} x2={ML + 80} y1={24} y2={24} />
        <path d={`M${ML + 80} 24 l-8 -5 l0 10 z`} fill="#0f172a" />
        <text className="ph-axis-label" x={ML + 90} y={29}>Polymerase moves along the template (3′→5′ reading)</text>
        <g className="bio-rowlabels">
          <text x={6} y={Y.codingD - 2}>Coding strand</text><text className="bio-end" x={6} y={Y.codingD + 12}>5′ → 3′</text>
          <text x={6} y={Y.templateD - 2}>Template strand</text><text className="bio-end" x={6} y={Y.templateD + 12}>3′ ← 5′ (as drawn)</text>
          <text x={6} y={Y.hybrid - 2}>RNA</text><text className="bio-end" x={6} y={Y.hybrid + 12}>5′ → 3′</text>
        </g>
        {step.phase === "initiation" && !st.polymerasePresent ? (
          <g>
            <rect fill="#fde68a" height={110} opacity={0.7} rx={12} stroke="#92400e" strokeWidth={2} width={86} x={ML - 96} y={40} />
            <text className="bio-enz-text" textAnchor="middle" x={ML - 53} y={92}>{lab(euk ? "Pol II + TFs" : "RNA pol + σ")}</text>
            <text className="bio-small" textAnchor="middle" x={ML - 53} y={108}>{lab("at promoter")}</text>
            <text className="bio-small" textAnchor="middle" x={ML - 53} y={172}>promoter (upstream of +1)</text>
          </g>
        ) : null}
        {/* polymerase */}
        {st.polymerasePresent ? (
          <g data-testid="polymerase">
            <rect fill="#fde68a" height={168} opacity={0.42} rx={16} stroke="#92400e" strokeWidth={2} width={Math.max(60, bubX2 - bubX1 + 26)} x={bubX1 - 13} y={42} />
            <text className="bio-enz-text" textAnchor="middle" x={(bubX1 + bubX2) / 2} y={56}>{lab(euk ? "RNA polymerase II" : "RNA polymerase")}</text>
            {!euk && st.transcribed <= HYBRID_LENGTH + 1 ? <text className="bio-small strong" textAnchor="middle" x={(bubX1 + bubX2) / 2} y={70}>{lab("σ factor bound")}</text> : null}
          </g>
        ) : null}
        {/* DNA strands */}
        <path d={path(yCoding)} fill="none" stroke={C.coding.stroke} strokeLinejoin="round" strokeWidth={2.1} />
        <path d={path(yTemplate)} fill="none" stroke={C.template.stroke} strokeLinejoin="round" strokeWidth={2.1} />
        {Array.from({ length: L }, (_, i) => (inBubble(i) ? null : <line key={`r${i}`} stroke="#64748b" strokeDasharray={model.template[i] === "C" || model.template[i] === "G" ? "2 2" : "4 2"} strokeWidth={1.2} x1={x(i)} x2={x(i)} y1={Y.codingD + 10} y2={Y.templateD - 10} />))}
        {Array.from({ length: L }, (_, i) => cell(x(i), yCoding(i), model.input.coding[i], "coding", `c${i}`))}
        {Array.from({ length: L }, (_, i) => cell(x(i), yTemplate(i), templ[i], "template", `t${i}`))}
        <text className="bio-end" textAnchor="end" x={ML - 4} y={Y.codingD - 14}>5′</text><text className="bio-end" x={ML + L * CW + 4} y={Y.codingD - 14}>3′</text>
        <text className="bio-end" textAnchor="end" x={ML - 4} y={Y.templateD + 26}>3′</text><text className="bio-end" x={ML + L * CW + 4} y={Y.templateD + 26}>5′</text>
        {/* RNA */}
        {st.transcribed > 0 ? <path d={rnaCells.map((i, k) => `${k === 0 ? "M" : "L"}${x(i)} ${rnaY(i) + 14}`).join(" ")} fill="none" stroke={C.rna.stroke} strokeLinejoin="round" strokeWidth={2} /> : null}
        {rnaCells.map((i) => (
          <g key={`n${i}`}>
            {!released && i >= hybridFrom ? <line stroke="#64748b" strokeDasharray={templ[i] === "C" || templ[i] === "G" ? "2 2" : "4 2"} strokeWidth={1.2} x1={x(i)} x2={x(i)} y1={Y.templateO + 10} y2={Y.hybrid - 10} /> : null}
            {cell(x(i), rnaY(i), model.rna[i], "rna", `rn${i}`)}
          </g>
        ))}
        {st.transcribed > 0 ? (
          <g>
            <text className="bio-end" textAnchor="end" x={x(0) - CW / 2 - 4} y={rnaY(0) - 14}>5′</text>
            <path d={`M${x(st.transcribed - 1) + CW / 2 - 2} ${rnaY(st.transcribed - 1) + 14} l6 -4 l0 8 z`} fill={C.rna.stroke} />
            <text className="bio-end" x={x(st.transcribed - 1) + CW / 2 + 8} y={rnaY(st.transcribed - 1) - 4}>3′</text>
          </g>
        ) : null}
        {st.capped ? (
          <g data-testid="cap">
            <circle cx={x(0) - CW / 2 - 18} cy={rnaY(0)} fill="#fed7aa" r={13} stroke="#9a3412" strokeWidth={2} />
            <text className="bio-enz-text" textAnchor="middle" x={x(0) - CW / 2 - 18} y={rnaY(0) + 4}>m⁷G</text>
          </g>
        ) : null}
        <text className="bio-small" x={ML} y={H - 14}>{st.bubble.open ? `Bubble: columns ${st.bubble.from + 1}–${st.bubble.to}; RNA–DNA hybrid ${Math.min(HYBRID_LENGTH, st.transcribed)} bp` : "No bubble: the DNA is a closed duplex"}</text>
      </svg>
    </div>
  );
}

// ---- RNA processing ---------------------------------------------------------------------------------------------------------------

const CWR = 18;

export function RnaProcessingDiagram({ model, step, hideLabels }: { model: TranscriptionModel; step: TxStep; hideLabels: boolean }) {
  const st = step.state;
  const rna = model.rna;
  const introns = model.input.introns;
  const lab = (t: string) => (hideLabels ? "?" : t);
  const ML = 56;
  const Ymain = 92;
  const Ylow = 178;
  type Piece = { i: number; ch: string; kind: "exon" | "intron" };
  const kindAt = (i: number): "exon" | number => { for (let k = 0; k < introns.length; k += 1) if (i >= introns[k].start && i < introns[k].end) return k; return "exon"; };
  // main row: exons plus introns not yet removed (a step-1 intron is drawn lower but keeps its place)
  const main: Array<Piece & { x: number; low?: boolean }> = [];
  const lariats: Array<{ k: number; x0: number }> = [];
  let cursor = 0;
  const cleaveAt = model.polyA && st.cleaved ? model.polyA.cleavageIndex : null;
  // pre-mRNA index of the cleavage site after splicing = position in the mature string; track it while laying out
  let matureIdx = 0;
  const downstream: Array<{ ch: string; x: number }> = [];
  for (let i = 0; i < rna.length; i += 1) {
    const k = kindAt(i);
    if (k !== "exon" && st.introns[k] === "removed") {
      if (!lariats.some((l) => l.k === k)) lariats.push({ k, x0: ML + cursor * CWR });
      continue;
    }
    const isIntron = k !== "exon";
    const piece = { i, ch: rna[i], kind: (isIntron ? "intron" : "exon") as "exon" | "intron", x: ML + cursor * CWR, low: isIntron && st.introns[k as number] === "step1" };
    if (!isIntron && cleaveAt !== null && matureIdx >= cleaveAt) downstream.push({ ch: rna[i], x: piece.x });
    else main.push(piece);
    if (!isIntron) matureIdx += 1;
    cursor += 1;
  }
  const spliceStarted = st.introns.some((s) => s !== "pre");
  const W = ML + (cursor + (st.tailed ? POLY_A_SHOWN : 0) + 4) * CWR + 40;
  const ref = useFollow(0);
  const tailStartX = (main.length ? main[main.length - 1].x + CWR : ML) + 4;
  const tr = model.translation;
  // coding region within the mature string (only after processing is complete)
  const showAnnot = step.phase === "mature" && tr && euk(model);
  const exonOnly = main.filter((p) => p.kind === "exon");
  const aug = tr ? exonOnly[tr.start]?.x : undefined;
  const stopEnd = tr && tr.status === "terminated" ? exonOnly[(tr.stopPosition as number) + 2]?.x : undefined;
  const bp = (k: number) => branchPoint(introns[k], rna);
  return (
    <div className="ph-diagram bio-diagram" ref={ref}>
      <svg aria-label={`RNA processing: ${step.title}`} className="ph-svg" data-testid="processing-diagram" height={260} role="img" viewBox={`0 0 ${W} 260`} width={W}>
        <rect className="ph-paper" height={260} width={W} />
        <text className="ph-axis-label" x={8} y={22}>{lab(step.phase === "cap" ? "5′ capping" : step.phase === "splicing" ? "Splicing" : step.phase === "polyA" ? "3′ end formation" : "Processed mRNA")}</text>
        {st.capped ? (
          <g data-testid="cap">
            <circle cx={ML - 22} cy={Ymain} fill="#fed7aa" r={14} stroke="#9a3412" strokeWidth={2} />
            <text className="bio-enz-text" textAnchor="middle" x={ML - 22} y={Ymain + 4}>m⁷G</text>
            <line stroke="#9a3412" strokeWidth={2.4} x1={ML - 8} x2={ML + 2} y1={Ymain} y2={Ymain} />
            <text className="bio-small" textAnchor="middle" x={ML - 22} y={Ymain + 30}>{lab("5′ cap")}</text>
          </g>
        ) : null}
        <line stroke="#be123c" strokeWidth={2} x1={ML} x2={main.length ? main[main.length - 1].x + CWR / 2 : ML} y1={Ymain + 14} y2={Ymain + 14} />
        {main.map((p) => {
          const lowY = p.low ? Ylow : Ymain;
          const fill = p.kind === "exon" ? "#cfe3f7" : "#e5e7eb";
          const stroke = p.kind === "exon" ? "#1d4ed8" : "#6b7280";
          const isBranch = p.kind === "intron" && introns.some((_, k) => bp(k) === p.i && st.introns[k] !== "pre");
          const isSS5 = p.kind === "intron" && introns.some((it, k) => (p.i === it.start || p.i === it.start + 1) && st.introns[k] !== "pre");
          const isSS3 = p.kind === "intron" && introns.some((it, k) => (p.i === it.end - 1 || p.i === it.end - 2) && st.introns[k] !== "pre");
          return (
            <g key={`m${p.i}`}>
              <rect fill={isBranch ? "#fde68a" : isSS5 || isSS3 ? "#fbcfe8" : fill} height={20} rx={4} stroke={isBranch ? "#92400e" : stroke} strokeWidth={isBranch ? 2.2 : 1.3} width={CWR - 2} x={p.x - CWR / 2 + 1} y={lowY - 10} />
              <text className="bio-base" style={{ fontSize: 11.5 }} textAnchor="middle" x={p.x} y={lowY + 4}>{p.ch}</text>
            </g>
          );
        })}
        {/* labels for spliceosome landmarks (positions come from the pieces actually laid out) */}
        {introns.map((it, k) => {
          if (st.introns[k] !== "recognized" && st.introns[k] !== "step1") return null;
          const px = (i: number) => main.find((p) => p.i === i)?.x ?? 0;
          return (
            <g key={`lm${k}`}>
              <text className="bio-small strong" textAnchor="start" x={px(it.start) - CWR / 2} y={Ymain - 22}>{lab("5′ splice site GU")}</text>
              <text className="bio-small strong" textAnchor="middle" x={px(bp(k) as number)} y={Ymain + 36}>{lab("branch point A")}</text>
              <text className="bio-small strong" textAnchor="end" x={px(it.end - 1) + CWR / 2} y={Ymain - 22}>{lab("3′ splice site AG")}</text>
            </g>
          );
        })}
        {/* removed introns as lariats */}
        {lariats.map((l) => {
          const it = introns[l.k];
          const seq = rna.slice(it.start, it.end);
          const b = bp(l.k) as number;
          const loopLen = b - it.start + 1;
          return (
            <g key={`lar${l.k}`} data-testid="lariat">
              <text className="bio-small strong" x={l.x0 - CWR} y={Ylow - 20}>{lab(`lariat (intron ${l.k + 1}) 2′–5′ bond G···A`)}</text>
              {[...seq].map((ch, j) => {
                const inLoop = j < loopLen;
                const cx = l.x0 + (inLoop ? (j - loopLen / 2) * CWR * 0.8 + loopLen * CWR * 0.4 : (j - loopLen + 1) * CWR) - 0;
                const cy = inLoop ? Ylow + 6 + Math.sin((j / Math.max(1, loopLen - 1)) * Math.PI) * 26 : Ylow + 6 + 26 + (j - loopLen) * 0;
                return (
                  <g key={j}>
                    <rect fill={j === b - it.start ? "#fde68a" : "#e5e7eb"} height={16} rx={3} stroke="#6b7280" width={CWR - 3} x={cx - CWR / 2 + 1.5} y={cy - 8} />
                    <text className="bio-base" style={{ fontSize: 10 }} textAnchor="middle" x={cx} y={cy + 3.5}>{ch}</text>
                  </g>
                );
              })}
            </g>
          );
        })}
        {/* cleaved 3' piece */}
        {downstream.length ? (
          <g data-testid="degraded" opacity={0.55}>
            {downstream.map((d, j) => (
              <g key={j}><rect fill="#f3f4f6" height={16} rx={3} stroke="#9ca3af" strokeDasharray="3 2" width={CWR - 3} x={d.x - CWR / 2 + 1.5} y={Ylow - 8} /><text className="bio-base" style={{ fontSize: 10 }} textAnchor="middle" x={d.x} y={Ylow + 3.5}>{d.ch}</text></g>
            ))}
            <text className="bio-small" x={downstream[0].x - CWR / 2} y={Ylow + 24}>{lab("cleaved-off 3′ piece (degraded)")}</text>
          </g>
        ) : null}
        {st.cleaved && main.length ? <line stroke="#dc2626" strokeDasharray="3 3" strokeWidth={2} x1={main[main.length - 1].x + CWR / 2 + 1} x2={main[main.length - 1].x + CWR / 2 + 1} y1={Ymain - 22} y2={Ymain + 28} /> : null}
        {/* poly(A) tail */}
        {st.tailed ? (
          <g data-testid="polyA">
            {Array.from({ length: POLY_A_SHOWN }, (_, j) => (
              <g key={j}><rect fill="#bbf7d0" height={20} rx={4} stroke="#15803d" width={CWR - 2} x={tailStartX + j * CWR - CWR / 2 + 1} y={Ymain - 10} /><text className="bio-base" style={{ fontSize: 11.5 }} textAnchor="middle" x={tailStartX + j * CWR} y={Ymain + 4}>A</text></g>
            ))}
            <text className="bio-small strong" x={tailStartX - CWR / 2} y={Ymain - 22}>{lab(`poly(A) tail (${POLY_A_SHOWN} A drawn)`)}</text>
          </g>
        ) : null}
        {showAnnot && aug !== undefined ? (
          <g>
            <rect fill="none" height={26} rx={5} stroke="#16a34a" strokeWidth={2.4} width={CWR * 3} x={aug - CWR / 2} y={Ymain - 14} />
            <text className="bio-small strong" x={aug - CWR / 2} y={Ymain + 46}>AUG start</text>
            {stopEnd !== undefined ? <><rect fill="none" height={26} rx={5} stroke="#dc2626" strokeWidth={2.4} width={CWR * 3} x={stopEnd - CWR * 2.5} y={Ymain - 14} /><text className="bio-small strong" x={stopEnd - CWR * 2.5} y={Ymain + 46}>stop codon</text></> : null}
          </g>
        ) : null}
        {!spliceStarted && introns.length ? <text className="bio-small" x={8} y={248}>Blue: exon, grey: intron. Splice sites are GU…AG.</text> : <text className="bio-small" x={8} y={248}>Blue: exon, grey: intron or lariat, yellow: branch-point A, pink: splice-site dinucleotides.</text>}
      </svg>
    </div>
  );
}

const euk = (m: TranscriptionModel) => m.input.organism === "eukaryote";
