import { useEffect, useRef } from "react";
import { AMINO_ACIDS, readCodon } from "../../utils/biology/geneticCode";
import type { TranslationModel, TrnaOnSite, TrStep } from "../../utils/biology/translation";

/**
 * The ribosome drawn from one engine step. The codons are the real codons of the mRNA, each tRNA's anticodon is drawn under its
 * codon (3′→5′, so it reads as the codon's complement), and the peptide is the one built so far. Fixed colours: paper in both themes.
 */
const CB = 22; // width of one base
const SLOTS = 7; // codons shown
const ML = 70;
const W = ML + SLOTS * 3 * CB + 150;
const H = 344;
const Y = { mrna: 214, anti: 176, chain: 40 };

export function RibosomeDiagram({ model, step, hideLabels }: { model: TranslationModel; step: TrStep; hideLabels: boolean }) {
  const mrna = model.input.mrna;
  const start = model.start ?? 0;
  const bact = model.input.organism === "bacteria";
  const lab = (t: string) => (hideLabels ? "?" : t);
  // codon index k of the A site relative to the frame of the start codon (k = 0 is the start codon)
  const kA = Math.round((step.aSiteStart - start) / 3);
  const first = kA - 3; // slot 0 shows codon kA-5 so that E, P, A sit in the middle-left and 2 codons are visible ahead
  const slotX = (slot: number) => ML + slot * 3 * CB;
  const slotOf = (k: number) => k - first;
  const cod = (k: number) => { const i = start + 3 * k; return i >= 0 && i + 3 <= mrna.length ? mrna.slice(i, i + 3) : null; };
  const aSlot = slotOf(kA), pSlot = aSlot - 1, eSlot = aSlot - 2;
  const subL = slotX(eSlot) - 6;
  const subW = 3 * 3 * CB + 12;
  const scroller = useRef<HTMLDivElement>(null);
  const centerX = slotX(aSlot - 1) + 1.5 * CB;
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = Math.max(0, centerX - el.clientWidth / 2);
  }, [centerX]);
  const tRNA = (t: TrnaOnSite | null, slot: number, role: "E" | "P" | "A") => {
    if (!t) return null;
    const cx = slotX(slot) + 1.5 * CB;
    const empty = role === "E";
    return (
      <g data-testid={`trna-${role}`} data-codon={t.codon} key={role}>
        <rect fill={empty ? "#e2e8f0" : "#d9f2e3"} height={58} rx={10} stroke="#166534" strokeWidth={1.8} width={3 * CB - 10} x={cx - (3 * CB - 10) / 2} y={Y.anti - 62} />
        <line stroke="#166534" strokeWidth={2} x1={cx} x2={cx} y1={Y.anti - 62} y2={Y.anti - 80} />
        {!empty && t.aa ? (
          <g>
            <circle cx={cx} cy={Y.anti - 92} fill="#fde68a" r={13} stroke="#92400e" strokeWidth={1.8} />
            <text className="bio-enz-text" textAnchor="middle" x={cx} y={Y.anti - 88}>{lab(AMINO_ACIDS[t.aa].three)}</text>
          </g>
        ) : null}
        {t.anticodonUnder.split("").map((b, j) => (
          <g key={j}>
            <rect fill="#bbf7d0" height={20} rx={4} stroke="#166534" strokeWidth={1.4} width={CB - 2} x={slotX(slot) + j * CB + 1} y={Y.anti} />
            <text className="bio-base" style={{ fontSize: 12 }} textAnchor="middle" x={slotX(slot) + j * CB + CB / 2} y={Y.anti + 14.5}>{b}</text>
            <line stroke="#64748b" strokeDasharray="3 2" strokeWidth={1.2} x1={slotX(slot) + j * CB + CB / 2} x2={slotX(slot) + j * CB + CB / 2} y1={Y.anti + 20} y2={Y.mrna - 13} />
          </g>
        ))}
      </g>
    );
  };
  // peptide chain drawn as beads above the large subunit, attached to the tRNA that holds it
  const chainSlot = step.chainOnA ? aSlot : pSlot;
  const beads = step.peptide.split("");
  const maxBeads = 14;
  const shown = beads.slice(-maxBeads);
  const chainAnchorX = slotX(chainSlot) + 1.5 * CB;
  const showChain = beads.length > 0 && !step.released && step.sites[step.chainOnA ? "A" : "P"] !== null;
  const released = step.released;
  const stopCodon = step.phase === "termination" ? cod(kA) : null;
  return (
    <div className="ph-diagram bio-diagram" ref={scroller}>
      <svg aria-label={`Ribosome: ${step.title}`} className="ph-svg" data-phase={step.phase} data-testid="ribosome-diagram" height={H} role="img" viewBox={`0 0 ${W} ${H}`} width={W}>
        <rect className="ph-paper" height={H} width={W} />
        {/* large subunit (above) */}
        {step.largeSubunit ? (
          <g data-testid="large-subunit">
            <rect fill="#e0e7ff" height={146} opacity={0.75} rx={20} stroke="#4338ca" strokeWidth={2.2} width={subW} x={subL} y={Y.anti - 118} />
            <text className="bio-enz-text" x={subL + subW + 8} y={Y.anti - 92}>{lab(bact ? "50S large subunit" : "60S large subunit")}</text>
          </g>
        ) : null}
        {/* small subunit (below) */}
        <g data-testid="small-subunit">
          <rect fill="#fef3c7" height={50} opacity={0.85} rx={18} stroke="#b45309" strokeWidth={2.2} width={subW} x={subL} y={Y.mrna + 16} />
          <text className="bio-enz-text" x={subL + subW + 8} y={Y.mrna + 44}>{lab(bact ? "30S small subunit" : "40S small subunit")}</text>
        </g>
        {/* site labels */}
        {[["E", eSlot], ["P", pSlot], ["A", aSlot]].map(([r, s]) => (
          <text className="bio-site-label" key={r as string} textAnchor="middle" x={slotX(s as number) + 1.5 * CB} y={Y.mrna + 60}>{lab(r as string)} site</text>
        ))}
        {/* mRNA */}
        <text className="bio-end" textAnchor="end" x={ML - 8} y={Y.mrna + 4}>5′</text>
        <text className="bio-end" x={ML + SLOTS * 3 * CB + 8} y={Y.mrna + 4}>3′</text>
        <line stroke="#be123c" strokeWidth={2.4} x1={ML - 4} x2={ML + SLOTS * 3 * CB + 4} y1={Y.mrna + 14} y2={Y.mrna + 14} />
        {Array.from({ length: SLOTS }, (_, slot) => {
          const k = first + slot;
          const c = cod(k);
          if (c === null) return null;
          const m = readCodon(c);
          const isStart = k === 0;
          const isStop = m?.kind === "stop" && k > 0;
          const decoded = k < kA || (k === kA && step.sites.A !== null);
          return (
            <g data-codon={c} data-k={k} key={slot}>
              {c.split("").map((b, j) => (
                <g key={j}>
                  <rect fill={k < 0 ? "#f1f5f9" : "#fbe3e8"} height={22} rx={4} stroke={isStart ? "#16a34a" : isStop ? "#dc2626" : "#be123c"} strokeWidth={isStart || isStop ? 2.2 : 1.3} width={CB - 2} x={slotX(slot) + j * CB + 1} y={Y.mrna - 11} />
                  <text className="bio-base" style={{ fontSize: 12.5 }} textAnchor="middle" x={slotX(slot) + j * CB + CB / 2} y={Y.mrna + 4}>{b}</text>
                </g>
              ))}
              <text className="bio-small" textAnchor="middle" x={slotX(slot) + 1.5 * CB} y={Y.mrna + 84}>
                {k < 0 ? "5′ UTR" : isStart ? "start" : isStop ? "stop" : decoded && m?.kind === "amino" ? AMINO_ACIDS[m.aa].three : ""}
              </text>
            </g>
          );
        })}
        {tRNA(step.sites.E, eSlot, "E")}
        {tRNA(step.sites.P, pSlot, "P")}
        {tRNA(step.sites.A, aSlot, "A")}
        {/* release factor at a stop codon */}
        {stopCodon && !released ? (
          <g data-testid="release-factor">
            <path d={`M${slotX(aSlot) + 4} ${Y.anti + 22} l${1.5 * CB - 4} -78 l${1.5 * CB - 4} 78 z`} fill="#fecaca" stroke="#b91c1c" strokeWidth={2} />
            <text className="bio-enz-text" textAnchor="middle" x={slotX(aSlot) + 1.5 * CB} y={Y.anti - 10}>{lab(step.factors[0] ?? "RF")}</text>
          </g>
        ) : null}
        {released ? (
          <g data-testid="release-factor">
            <path d={`M${slotX(aSlot) + 4} ${Y.anti + 22} l${1.5 * CB - 4} -78 l${1.5 * CB - 4} 78 z`} fill="#fecaca" stroke="#b91c1c" strokeWidth={2} />
            <text className="bio-enz-text" textAnchor="middle" x={slotX(aSlot) + 1.5 * CB} y={Y.anti - 10}>{lab(step.factors[0] ?? "RF")}</text>
          </g>
        ) : null}
        {/* peptide */}
        {showChain || released ? (
          <g data-testid="peptide">
            {shown.map((aa, j) => {
              const idx = shown.length - 1 - j; // 0 = newest, next to the tRNA
              const cx = released ? ML + 14 + j * 22 : chainAnchorX - idx * 22;
              const cy = released ? 28 : Y.chain;
              return (
                <g key={j}>
                  <circle cx={cx} cy={cy} fill="#fde68a" r={10} stroke="#92400e" strokeWidth={1.4} />
                  <text className="bio-enz-text" textAnchor="middle" x={cx} y={cy + 3.5}>{aa}</text>
                  {idx === 0 && !released ? <line stroke="#92400e" strokeWidth={1.8} x1={cx} x2={cx} y1={cy + 10} y2={Y.anti - 79} /> : null}
                </g>
              );
            })}
            {beads.length > maxBeads ? <text className="bio-small" x={chainAnchorX - maxBeads * 22 - 20} y={Y.chain + 4}>…</text> : null}
            <text className="bio-small strong" x={released ? ML + 10 : Math.max(8, chainAnchorX - shown.length * 22 - 6)} y={released ? 54 : Y.chain - 18}>{released ? `released polypeptide: ${step.peptide}` : `growing chain (${beads.length} aa)`}</text>
          </g>
        ) : null}
        <g>
          <line stroke="#0f172a" strokeWidth={2} x1={ML} x2={ML + 70} y1={H - 12} y2={H - 12} />
          <path d={`M${ML + 70} ${H - 12} l-8 -5 l0 10 z`} fill="#0f172a" />
          <text className="ph-axis-label" x={ML + 80} y={H - 7}>Ribosome moves 5′→3′ along the mRNA</text>
        </g>
      </svg>
    </div>
  );
}
