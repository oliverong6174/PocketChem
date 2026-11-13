import type { ReactNode } from "react";
import { ALLELE_DISPLAY, type Chromatid, type Origin } from "../../utils/biology/chromosome";
import { COLORS, ROD_GAP, ROD_W, glyphWidth } from "./chromosomeGeometry";

/**
 * Shared chromosome drawing for the Genetics and the Mitosis/Meiosis diagrams. Fixed paper-safe colours (like the other Biology
 * diagrams), and colour is never the only cue:
 *   maternal homolog  – solid teal rod, labelled "M"
 *   paternal homolog  – orange rod with diagonal hatching, labelled "P"
 * A recombinant chromatid is drawn half teal and half hatched orange. The dark band is the centromere; the long arm carries the
 * genes, drawn as bands with their allele symbols beside them. Sister chromatids are drawn side by side, joined at the centromere.
 */

export function ChromDefs() {
  return (
    <defs>
      <pattern height="6" id="pc-hatch" patternTransform="rotate(45)" patternUnits="userSpaceOnUse" width="6">
        <rect fill={COLORS.paternal} height="6" width="6" />
        <line stroke="#ffffff" strokeOpacity="0.85" strokeWidth="2" x1="0" x2="0" y1="0" y2="6" />
      </pattern>
    </defs>
  );
}
const fillOf = (o: Origin) => (o === "maternal" ? COLORS.maternal : "url(#pc-hatch)");
const strokeOf = (o: Origin) => (o === "maternal" ? "#134e4a" : "#7c2d12");

/** An allele symbol as SVG text parts (superscript for Iᴬ, Cᴿ …). */
export function AlleleTspans({ id }: { id: string }): ReactNode {
  const d = ALLELE_DISPLAY[id];
  if (!d) return id;
  return <>{d.base}{d.sup ? <tspan baselineShift="super" fontSize="75%">{d.sup}</tspan> : null}</>;
}

const CEN = 0.28;

export interface GlyphProps {
  chromatids: Chromatid[];
  loci: string[];
  origin: Origin;
  /** Centre x and the y of the centromere. */
  x: number;
  y: number;
  height?: number;
  /** Centromere leads at the bottom (a chromosome moving to the lower pole). */
  flip?: boolean;
  condensed?: boolean;
  selected?: boolean;
  hideLabels?: boolean;
  /** Draw order of the chromatids, left to right (indices into `chromatids`). */
  order?: number[];
  showIndex?: boolean;
  /** "M" / "P" tag above the chromosome. */
  tag?: boolean;
  /** Crossover to mark: the gap index (between locus gap and gap+1). */
  chiasmaGap?: number | null;
}

/** One chromosome (one or two chromatids) with its genes. */
export function ChromGlyph(p: GlyphProps) {
  const H = p.height ?? 88;
  const n = p.chromatids.length;
  const order = p.order ?? p.chromatids.map((_, i) => i);
  const w = glyphWidth(n);
  const top = p.y - (p.flip ? 1 - CEN : CEN) * H;
  const yAt = (f: number) => top + (p.flip ? 1 - f : f) * H;
  const locusF = (k: number) => (p.loci.length === 1 ? 0.7 : 0.55 + 0.3 * k);
  const cut = p.loci.length >= 2 ? 0.7 : 2;
  const rodW = p.condensed === false ? 6 : ROD_W;
  const lab = !p.hideLabels;
  return (
    <g>
      {order.map((ci, slot) => {
        const ch = p.chromatids[ci];
        const cx = p.x - w / 2 + slot * (ROD_W + ROD_GAP) + ROD_W / 2;
        const oTop = ch.origins[0];
        const oBot = ch.origins[ch.origins.length - 1];
        const yCut = yAt(cut);
        const seg = (f0: number, f1: number, o: Origin, k: string) => {
          const ya = yAt(f0), yb = yAt(f1);
          return <rect fill={fillOf(o)} height={Math.abs(yb - ya)} key={k} rx={rodW / 2} stroke={strokeOf(o)} strokeWidth={1.4} width={rodW} x={cx - rodW / 2} y={Math.min(ya, yb)} />;
        };
        return (
          <g key={ci}>
            {cut > 1 ? seg(0, 1, oTop, "a") : <>{seg(0, cut, oTop, "a")}{seg(cut, 1, oBot, "b")}</>}
            {cut <= 1 ? <line stroke="#ffffff" strokeWidth={2} x1={cx - rodW / 2} x2={cx + rodW / 2} y1={yCut} y2={yCut} /> : null}
            {p.loci.map((_, k) => <rect fill="#ffffff" fillOpacity={0.9} height={4} key={k} stroke={COLORS.ink} strokeWidth={0.8} width={rodW + 2} x={cx - rodW / 2 - 1} y={yAt(locusF(k)) - 2} />)}
            {lab ? p.loci.map((_, k) => {
              const left = n > 1 && slot === 0;
              return <text className="bio-chrom-allele" key={`t${k}`} textAnchor={left ? "end" : "start"} x={left ? cx - rodW / 2 - 4 : cx + rodW / 2 + 4} y={yAt(locusF(k)) + 4}><AlleleTspans id={ch.alleles[k]} /></text>;
            }) : null}
            {p.showIndex && n > 1 && lab ? <text className="bio-small" textAnchor="middle" x={cx} y={yAt(0) + (p.flip ? 12 : -4)}>{ci + 1}</text> : null}
          </g>
        );
      })}
      <rect fill={COLORS.centromere} height={6} rx={3} width={w + 6} x={p.x - w / 2 - 3} y={p.y - 3} />
      {p.chiasmaGap !== null && p.chiasmaGap !== undefined ? <text className="bio-small strong" textAnchor="middle" x={p.x} y={yAt(0.7) + 4}>✕</text> : null}
      {p.tag && lab ? <text className="bio-chrom-tag" textAnchor="middle" x={p.x} y={yAt(p.flip ? 1.0 : 0) + (p.flip ? 14 : -6)}>{p.origin === "maternal" ? "M" : "P"}</text> : null}
      {p.selected ? <rect fill="none" height={H + 10} rx={8} stroke={COLORS.select} strokeDasharray="5 3" strokeWidth={2.2} width={w + 36} x={p.x - w / 2 - 18} y={top - 5} /> : null}
    </g>
  );
}

export function ChromLegend({ showCrossover = true }: { showCrossover?: boolean }) {
  return (
    <div className="bio-legend" role="list" aria-label="Chromosome key">
      <span className="bio-key" role="listitem"><svg aria-hidden height="16" width="14"><ChromDefs /><rect fill={COLORS.maternal} height="14" rx="3" stroke="#134e4a" strokeWidth="1.4" width="10" x="2" y="1" /></svg>Maternal homolog (M, solid)</span>
      <span className="bio-key" role="listitem"><svg aria-hidden height="16" width="14"><ChromDefs /><rect fill="url(#pc-hatch)" height="14" rx="3" stroke="#7c2d12" strokeWidth="1.4" width="10" x="2" y="1" /></svg>Paternal homolog (P, hatched)</span>
      <span className="bio-key" role="listitem"><span className="bio-swatch" style={{ background: COLORS.centromere, borderColor: COLORS.centromere, borderRadius: 3, height: 8 }} />Centromere</span>
      <span className="bio-key" role="listitem"><span className="bio-swatch" style={{ background: "#ffffff", borderColor: COLORS.ink, borderRadius: 2, height: 6 }} />Gene (band, allele beside it)</span>
      {showCrossover ? <span className="bio-key" role="listitem">Half solid, half hatched = recombinant chromatid</span> : null}
    </div>
  );
}

