import { ChromDefs, ChromGlyph } from "./ChromosomeArt";
import { COLORS, chromatidText, glyphWidth } from "./chromosomeGeometry";
import type { CellView, ChromView, DivisionStage } from "../../utils/biology/cellDivision";

/**
 * The cell(s) of one DivisionStage. Everything drawn comes from the engine state: how many cells, which chromosomes are in each,
 * how many chromatids each has, whether they are paired (bivalent), attached to the spindle and facing which pole, and where the
 * crossovers are. The only decisions made here are pixel positions. Chromosomes are drawn in one flat list keyed by id, so a
 * chromosome that persists between stages glides to its new place (CSS transition; disabled by prefers-reduced-motion).
 * Poles: pole 0 is the upper pole, pole 1 the lower pole.
 */
const W = 860, H = 380;

interface Geo { cx: number; cy: number; rx: number; ry: number }
function geometry(n: number, i: number): Geo {
  if (n === 1) return { cx: 430, cy: 190, rx: 340, ry: 160 };
  if (n === 2) return { cx: i === 0 ? 215 : 645, cy: 190, rx: 205, ry: 160 };
  return { cx: 108 + i * 215, cy: 190, rx: 100, ry: 155 };
}

interface Pos { x: number; y: number; flip: boolean; order: number[]; cell: number; height: number; chiasmaGap: number | null }

function placeCell(cell: CellView, geo: Geo, cellIndex: number, nCells: number): Map<string, Pos> {
  const out = new Map<string, Pos>();
  const height = nCells >= 4 ? 70 : nCells === 2 ? 80 : 88;
  const groups = new Map<string, ChromView[]>();
  for (const c of cell.chromosomes) {
    const key = c.position === "moving" && c.pole !== null ? `pole${c.pole}` : "mid";
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  for (const [key, list] of groups) {
    // units: a bivalent (two paired homologs) moves as one
    type Unit = ChromView[];
    const units: Unit[] = [];
    const used = new Set<string>();
    for (const c of list) {
      if (used.has(c.id)) continue;
      if (c.paired) { const pair = list.filter((d) => d.paired && d.pair === c.pair).sort((a, b) => a.homolog - b.homolog); pair.forEach((d) => used.add(d.id)); units.push(pair); }
      else { used.add(c.id); units.push([c]); }
    }
    units.sort((a, b) => a[0].pair - b[0].pair || a[0].homolog - b[0].homolog);
    const unitW = (u: Unit) => u.reduce((a, c) => a + glyphWidth(c.chromatids.length) + 26, 0) + (u.length > 1 ? 8 : 0);
    const gap = nCells >= 4 ? 22 : 34;
    const total = units.reduce((a, u) => a + unitW(u), 0) + gap * (units.length - 1);
    let x = geo.cx - total / 2;
    const stagger = key === "mid" && list.some((c) => c.position === "moving");
    units.forEach((u, ui) => {
      const w = unitW(u);
      const y0 = key === "pole0" ? geo.cy - geo.ry * 0.45 : key === "pole1" ? geo.cy + geo.ry * 0.45 : stagger ? geo.cy + (ui % 2 === 0 ? -32 : 30) : geo.cy;
      let cursor = x;
      u.forEach((c) => {
        const gw = glyphWidth(c.chromatids.length) + 26;
        const cross = c.chiasmata[0];
        const order = c.paired && c.chromatids.length === 2 && cross ? (c.homolog === 0 ? (cross.mine === 0 ? [1, 0] : [0, 1]) : (cross.mine === 0 ? [0, 1] : [1, 0])) : c.chromatids.map((_, i) => i);
        out.set(c.id, { x: cursor + gw / 2, y: y0 + (stagger ? 0 : 0), flip: key === "pole1", order, cell: cellIndex, height, chiasmaGap: cross ? cross.gap : null });
        cursor += gw;
      });
      x += w + gap;
    });
  }
  return out;
}

const poleOf = (geo: Geo, pole: 0 | 1) => ({ x: geo.cx, y: pole === 0 ? geo.cy - geo.ry + 12 : geo.cy + geo.ry - 12 });

export function CellDiagram({ stage, selectedId, onSelect, hideLabels, focus }: { stage: DivisionStage; selectedId: string | null; onSelect: (id: string | null) => void; hideLabels: boolean; focus: number | null }) {
  const n = stage.cells.length;
  const geos = stage.cells.map((_, i) => geometry(n, i));
  const placed = new Map<string, Pos & { c: ChromView }>();
  stage.cells.forEach((cell, i) => { for (const [id, p] of placeCell(cell, geos[i], i, n)) placed.set(id, { ...p, c: cell.chromosomes.find((c) => c.id === id)! }); });
  const g = focus !== null && geos[focus] ? geos[focus] : null;
  const viewBox = g ? `${g.cx - g.rx - 12} 0 ${(g.rx + 12) * 2} ${H}` : `0 0 ${W} ${H}`;
  const summary = `${stage.title}. ${n} cell${n === 1 ? "" : "s"}. ${stage.counts.map((c, i) => `${stage.cells[i].label}: ${c.chromosomes} chromosomes, ${c.chromatids} chromatids, DNA ${c.dnaC}C, ${c.sets}`).join("; ")}.`;
  return (
    <div className="bio-diagram cd-diagram" data-testid="cell-diagram" data-stage={stage.id} data-cells={n} data-chromosomes={stage.counts.map((c) => c.chromosomes).join(",")} data-chromatids={stage.counts.map((c) => c.chromatids).join(",")}>
      <svg aria-label={summary} className="ph-svg cd-svg" role="img" viewBox={viewBox}>
        <ChromDefs />
        <rect fill="#f8fafc" height={H} width={W} x={g ? g.cx - g.rx - 12 : 0} y={0} />
        {stage.cells.map((cell, i) => {
          const geo = geos[i];
          const plate = cell.chromosomes.some((c) => c.position === "plate");
          const top = poleOf(geo, 0), bot = poleOf(geo, 1);
          return (
            <g key={cell.id}>
              <ellipse cx={geo.cx} cy={geo.cy} fill="#ffffff" rx={geo.rx} ry={geo.ry} stroke="#64748b" strokeWidth={2.4} />
              {cell.envelope ? <ellipse cx={geo.cx} cy={geo.cy} fill="#eff6ff" fillOpacity={0.7} rx={geo.rx * 0.62} ry={geo.ry * 0.5} stroke="#2563eb" strokeDasharray="2 3" strokeWidth={2.2} /> : null}
              {cell.spindle ? (
                <g stroke="#94a3b8" strokeWidth={1.4}>
                  {[top, bot].map((p, k) => <g key={k}><circle cx={p.x} cy={p.y} fill="#e2e8f0" r={6} />{[-24, 0, 24].map((dx) => <line key={dx} x1={p.x} x2={p.x + dx} y1={p.y} y2={p.y + (k === 0 ? 22 : -22)} />)}</g>)}
                </g>
              ) : null}
              {plate ? <g><line stroke="#64748b" strokeDasharray="6 5" strokeWidth={1.2} x1={geo.cx - geo.rx * 0.82} x2={geo.cx + geo.rx * 0.82} y1={geo.cy} y2={geo.cy} />{!hideLabels && n <= 2 ? <text className="bio-small" x={geo.cx + geo.rx * 0.84} y={geo.cy - 4} textAnchor="end">plate</text> : null}</g> : null}
              <text className="bio-small strong" textAnchor="middle" x={geo.cx} y={H - 8}>{hideLabels ? `Cell ${i + 1}` : `${cell.label} · ${stage.counts[i].chromosomes} chr · ${stage.counts[i].chromatids} chromatids · ${stage.counts[i].dnaC}C`}</text>
            </g>
          );
        })}
        {/* spindle fibres from each attached kinetochore to the pole it faces */}
        {[...placed.values()].filter((p) => p.c.attached && p.c.facing).map((p) => {
          const geo = geos[p.cell];
          const gw = glyphWidth(p.c.chromatids.length);
          return p.c.facing!.map((pole, k) => {
            const tp = poleOf(geo, pole);
            const kx = p.x - gw / 2 + (p.c.chromatids.length === 1 ? gw / 2 : k * (gw - 11) + 5.5);
            return <line key={`${p.c.id}-${k}`} stroke="#94a3b8" strokeOpacity={0.9} strokeWidth={1.2} x1={kx} x2={tp.x} y1={p.y} y2={tp.y} />;
          });
        })}
        {[...placed.entries()].map(([id, p]) => (
          <g
            aria-label={`Chromosome ${id}: ${p.c.origin} homolog of pair ${p.c.pair + 1}, ${p.c.chromatids.length} chromatid${p.c.chromatids.length === 1 ? "" : "s"}, alleles ${p.c.chromatids.map(chromatidText).join(" and ")}`}
            aria-pressed={selectedId === id}
            className="cd-chrom"
            data-chromosome={id}
            key={id}
            onClick={(e) => { e.stopPropagation(); onSelect(selectedId === id ? null : id); }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(selectedId === id ? null : id); } }}
            role="button"
            style={{ transform: `translate(${p.x}px, ${p.y}px)` }}
            tabIndex={0}
          >
            <ChromGlyph chromatids={p.c.chromatids} chiasmaGap={p.chiasmaGap} condensed={p.c.condensed || p.c.chromatids.length === 2 || p.c.position !== "nucleus"} flip={p.flip} height={p.height} hideLabels={hideLabels} loci={p.c.loci} order={p.order} origin={p.c.origin} selected={selectedId === id} showIndex={stage.id === "metaphase2"} tag x={0} y={0} />
          </g>
        ))}
        {/* synapsis ladders and chiasmata between paired homologs */}
        {[...placed.values()].filter((p) => p.c.paired && p.c.homolog === 0).map((p) => {
          const partner = placed.get(`p${p.c.pair}h1`);
          if (!partner) return null;
          const wL = glyphWidth(p.c.chromatids.length) / 2, x1 = p.x + wL, x2 = partner.x - glyphWidth(partner.c.chromatids.length) / 2;
          const h = p.height;
          const yAt = (f: number) => p.y - 0.28 * h + f * h;
          return (
            <g data-testid="bivalent" key={`bv${p.c.pair}`} pointerEvents="none">
              {[0.45, 0.55, 0.65, 0.75, 0.85, 0.95].map((f) => <line key={f} stroke="#475569" strokeDasharray="2 2" strokeWidth={1} x1={x1} x2={x2} y1={yAt(f)} y2={yAt(f)} />)}
              {p.c.chiasmata.map((_, k) => <path d={`M${x1 - 2},${yAt(0.62)} L${x2 + 2},${yAt(0.78)} M${x1 - 2},${yAt(0.78)} L${x2 + 2},${yAt(0.62)}`} data-testid="chiasma" fill="none" key={k} stroke={COLORS.ink} strokeWidth={2.2} />)}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
