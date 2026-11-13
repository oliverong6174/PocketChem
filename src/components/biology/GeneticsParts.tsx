import { useId } from "react";
import { ChromDefs, ChromGlyph, ChromLegend, AlleleTspans } from "./ChromosomeArt";
import { COLORS, lociNames } from "./chromosomeGeometry";
import {
  LAYOUTS, LOCI, alleleText, isY, tetrad, chromatidOf, type Chromatid, type Individual, type PairGenotype,
} from "../../utils/biology/chromosome";
import { frNum, frText, type CrossResult, type Gamete, type Tally } from "../../utils/biology/genetics";

/** Parts shared by the Genetics page and the cell-division page: the genotype editor, parent chromosomes, gametes, Punnett square. */

export function IndividualEditor({ title, value, onChange, sex, idPrefix }: { title: string; value: Individual; onChange: (next: Individual) => void; sex?: "female" | "male"; idPrefix: string }) {
  const layout = LAYOUTS[value.layout];
  const uid = useId();
  const setAllele = (pair: number, hom: "a" | "b", k: number, allele: string) => {
    const pairs = value.pairs.map((p, i) => (i !== pair ? p : { ...p, [hom]: { alleles: p[hom].alleles.map((x, j) => (j === k ? allele : x)) } })) as PairGenotype[];
    onChange({ ...value, pairs });
  };
  return (
    <fieldset className="bio-genotype" data-testid={`${idPrefix}-editor`}>
      <legend>{title}</legend>
      {layout.pairs.map((loci, p) => (
        <div className="bio-genotype-pair" key={p}>
          {layout.pairs.length > 1 || loci.length > 1 ? <p className="bio-genotype-pairname">Chromosome pair {p + 1}{loci.length > 1 ? " (genes linked on this chromosome)" : ""}</p> : null}
          {(["a", "b"] as const).map((hom) => {
            const h = value.pairs[p][hom];
            const name = hom === "a" ? "Maternal homolog" : "Paternal homolog";
            if (value.layout === "xlinked" && hom === "b" && sex === "male") return <div className="bio-genotype-row" key={hom}><span className="bio-genotype-hom">Y chromosome</span><span className="bio-note">no allele at this gene</span></div>;
            return (
              <div className="bio-genotype-row" key={hom}>
                <span className="bio-genotype-hom">{value.layout === "xlinked" ? (hom === "a" ? "X chromosome (maternal)" : "X chromosome (paternal)") : name}</span>
                {loci.map((id, k) => (
                  <select aria-label={`${title}: ${name}, ${LOCI[id].name}`} data-testid={`${idPrefix}-${p}${hom}${k}`} id={`${uid}-${p}${hom}${k}`} key={id} onChange={(e) => setAllele(p, hom, k, e.target.value)} value={h.alleles[k] ?? ""}>
                    {LOCI[id].alleles.map((a) => <option key={a} value={a}>{alleleText(a)}</option>)}
                  </select>
                ))}
              </div>
            );
          })}
        </div>
      ))}
    </fieldset>
  );
}

/** The parent's chromosome pairs, unreplicated, with allele symbols: the homologous chromosomes as the cross sees them. */
export function ParentChromosomes({ individual, label, hideLabels = false }: { individual: Individual; label: string; hideLabels?: boolean }) {
  const layout = LAYOUTS[individual.layout];
  const pairW = 150;
  const W = Math.max(190, individual.pairs.length * pairW + 40);
  const text = `${label}: ${individual.pairs.map((p, i) => `pair ${i + 1} ${layout.pairs[i].map((l) => LOCI[l].name).join(" and ")}: maternal homolog ${p.a.alleles.map(alleleText).join("")}, ${isY(p.b) ? "Y chromosome" : `paternal homolog ${p.b.alleles.map(alleleText).join("")}`}`).join("; ")}.`;
  return (
    <svg aria-label={text} className="ph-svg bio-parent-svg" data-testid="parent-chromosomes" role="img" viewBox={`0 0 ${W} 150`}>
      <ChromDefs />
      <rect fill="#f8fafc" height={150} width={W} />
      <text className="bio-small strong" textAnchor="start" x={10} y={16}>{label}</text>
      {individual.pairs.map((p, i) => {
        const cx = 20 + i * pairW + pairW / 2;
        return (
          <g key={i}>
            <ChromGlyph chromatids={[chromatidOf(p.a, "maternal")]} hideLabels={hideLabels} loci={layout.pairs[i]} origin="maternal" tag x={cx - 36} y={52} />
            {isY(p.b)
              ? <ChromGlyph chromatids={[{ alleles: [], origins: ["paternal"] }]} height={56} hideLabels={hideLabels} loci={[]} origin="paternal" tag x={cx + 36} y={52} />
              : <ChromGlyph chromatids={[chromatidOf(p.b, "paternal")]} hideLabels={hideLabels} loci={layout.pairs[i]} origin="paternal" tag x={cx + 36} y={52} />}
            <text className="bio-small" textAnchor="middle" x={cx} y={146}>{lociNames(layout.pairs[i]).slice(0, 26)}</text>
          </g>
        );
      })}
    </svg>
  );
}

const hapChromatid = (alleles: string[], origin: "maternal" | "paternal"): Chromatid => ({ alleles, origins: alleles.map(() => origin) });

/** The gamete classes of one parent: each a cell holding one haplotype per chromosome pair, with its exact frequency. */
export function GameteDiagram({ gametes, individual, title, hideLabels = false }: { gametes: Gamete[]; individual: Individual; title: string; hideLabels?: boolean }) {
  const layout = LAYOUTS[individual.layout];
  const cellW = 130;
  const W = Math.max(200, gametes.length * cellW + 20);
  const parental = (g: Gamete) => g.kind === "parental";
  const summary = `${title}: ${gametes.map((g) => `${g.label} with probability ${frText(g.p)}${g.kind === "recombinant" ? " (recombinant)" : g.kind === "parental" ? " (parental)" : ""}`).join("; ")}.`;
  return (
    <svg aria-label={summary} className="ph-svg bio-gamete-svg" data-gametes={gametes.map((g) => `${g.label}=${frText(g.p)}`).join(",")} data-testid="gamete-diagram" role="img" viewBox={`0 0 ${W} 170`}>
      <ChromDefs />
      <rect fill="#f8fafc" height={170} width={W} />
      {gametes.map((g, i) => {
        const cx = 10 + i * cellW + cellW / 2;
        return (
          <g data-gamete={g.label} key={g.label}>
            <circle cx={cx} cy={70} fill="#ffffff" r={56} stroke="#475569" strokeDasharray={g.kind === "recombinant" ? "6 4" : ""} strokeWidth={2.4} />
            {g.haplotypes.map((h, k) => {
              const n = g.haplotypes.length;
              const x = cx + (k - (n - 1) / 2) * 38;
              const origin: "maternal" | "paternal" = "maternal";
              const pairHom = individual.pairs[k];
              const fromMat = h.alleles.join("|") === pairHom.a.alleles.join("|");
              const chroms = h.chrom === "Y" ? [{ alleles: [], origins: ["paternal" as const] }] : [hapChromatid(h.alleles, fromMat ? "maternal" : "paternal")];
              if (!fromMat && layout.pairs[k].length > 1 && h.alleles.join("|") !== pairHom.b.alleles.join("|")) {
                // recombinant haplotype: first locus from one homolog, second from the other
                const first = h.alleles[0] === pairHom.a.alleles[0] ? "maternal" : "paternal";
                chroms[0] = { alleles: h.alleles, origins: [first, first === "maternal" ? "paternal" : "maternal"] };
              }
              void origin;
              return <ChromGlyph chromatids={chroms} height={h.chrom === "Y" ? 44 : 64} hideLabels={hideLabels} key={k} loci={h.chrom === "Y" ? [] : layout.pairs[k]} origin="maternal" x={x} y={h.chrom === "Y" ? 66 : 62} />;
            })}
            <text className="bio-small strong" textAnchor="middle" x={cx} y={146}>{hideLabels ? "?" : g.label}</text>
            <text className="bio-small" textAnchor="middle" x={cx} y={162}>{frText(g.p)}{g.kind === "recombinant" ? " · recombinant" : parental(g) ? " · parental" : ""}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function PunnettTable({ result, hide = false }: { result: CrossResult; hide?: boolean }) {
  return (
    <div className="bio-punnett-wrap">
      <table className="bio-punnett" data-cells={result.gametes1.length * result.gametes2.length} data-testid="punnett">
        <caption>Punnett square: rows are the gametes of parent 1, columns the gametes of parent 2. Each box is one fertilisation; its probability is the product of the two gamete probabilities.</caption>
        <thead>
          <tr><td aria-hidden /><th scope="col" className="bio-punnett-corner">♂ / ♀ gametes</th>{result.gametes2.map((g) => <th key={g.label} scope="col">{g.label}<small>{frText(g.p)}</small></th>)}</tr>
        </thead>
        <tbody>
          {result.grid.map((row, i) => (
            <tr key={result.gametes1[i].label}>
              <td aria-hidden />
              <th scope="row">{result.gametes1[i].label}<small>{frText(result.gametes1[i].p)}</small></th>
              {row.map((cell) => (
                <td data-genotype={cell.offspring.genotype} data-phenotype={cell.offspring.phenotype} key={cell.g2.label} title={hide ? "" : cell.offspring.phenotype}>
                  {hide ? "?" : <><strong>{cell.offspring.genotype}</strong><span>{cell.offspring.phenotype}</span><small>{frText(cell.offspring.p)}</small></>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DistributionTable({ title, tallies, ratio, testId, hide = false }: { title: string; tallies: Tally[]; ratio: string; testId: string; hide?: boolean }) {
  return (
    <table className="bio-dist" data-ratio={ratio} data-testid={testId}>
      <caption>{title} — ratio <strong>{hide ? "?" : ratio}</strong></caption>
      <thead><tr><th scope="col">Class</th><th scope="col">Fraction</th><th scope="col"><span className="bio-visually-hidden">Share</span></th></tr></thead>
      <tbody>
        {tallies.map((t) => (
          <tr data-class={t.label} key={t.label}>
            <th scope="row">{hide ? "?" : t.label}</th>
            <td>{hide ? "?" : `${frText(t.p)} (${(frNum(t.p) * 100).toFixed(frNum(t.p) * 100 % 1 === 0 ? 0 : 1)}%)`}</td>
            <td aria-hidden><span className="bio-bar"><span style={{ width: `${hide ? 0 : frNum(t.p) * 100}%` }} /></span></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Shows how one crossover between two non-sister chromatids turns parental chromatids into recombinant ones. */
export function CrossoverFigure({ pair, crossover, hideLabels = false }: { pair: PairGenotype; crossover: { between: number; m: 0 | 1; p: 0 | 1 } | null; hideLabels?: boolean }) {
  const loci = LAYOUTS.linked.pairs[0];
  const before = tetrad(pair, null);
  const after = tetrad(pair, crossover);
  const recomb = (c: Chromatid) => c.alleles.join("|") !== pair.a.alleles.join("|") && c.alleles.join("|") !== pair.b.alleles.join("|");
  const label = (c: Chromatid, i: number) => `${i < 2 ? "maternal" : "paternal"} chromatid ${(i % 2) + 1}: ${c.alleles.map(alleleText).join("")}${recomb(c) ? " (recombinant)" : ""}`;
  const W = 640;
  const col = (i: number) => 70 + i * 60 + (i >= 2 ? 24 : 0);
  const row = (cs: Chromatid[], y: number, offset: number) => cs.map((c, i) => <ChromGlyph chromatids={[c]} height={62} hideLabels={hideLabels} key={i} loci={loci} origin={i < 2 ? "maternal" : "paternal"} x={col(i) + offset} y={y} />);
  return (
    <svg aria-label={`Crossing over. Before: ${before.map(label).join("; ")}. After: ${after.map(label).join("; ")}.`} className="ph-svg bio-cross-svg" data-recombinant={after.filter(recomb).length} data-testid="crossover-figure" role="img" viewBox={`0 0 ${W} 150`}>
      <ChromDefs />
      <rect fill="#f8fafc" height={150} width={W} />
      <text className="bio-small strong" x={10} y={16}>Before</text>
      {row(before, 50, 0)}
      <path d="M300 62 h30 m-8 -6 l8 6 -8 6" fill="none" stroke={COLORS.ink} strokeWidth={2} />
      <text className="bio-small strong" x={340} y={16}>{crossover ? "After crossing over" : "No crossover"}</text>
      {row(after, 50, 330)}
      {after.map((c, i) => <text className="bio-small" key={i} textAnchor="middle" x={col(i) + 330} y={140}>{recomb(c) ? "recomb." : "parental"}</text>)}
    </svg>
  );
}

export { ChromLegend, AlleleTspans };
