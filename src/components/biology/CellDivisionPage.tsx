import { useEffect, useMemo, useState } from "react";
import { LearningModeSwitch } from "../ui/LearningModeSwitch";
import { Badge, DiagramFrame, Disclosure, KeyFigures, Panel, Segmented, ToolHeader } from "../ui/primitives";
import { NumberField } from "../generalChem/shared";
import { useGcWorkspace } from "../generalChem/useGcWorkspace";
import { PredictPanel, QuizPanel, StepControls } from "./bioShared";
import { useNarrow, useStepPlayer } from "./bioHooks";
import { CellDiagram } from "./CellDiagram";
import { ChromLegend } from "./ChromosomeArt";
import { chromatidText } from "./chromosomeGeometry";
import { IndividualEditor } from "./GeneticsParts";
import { LAYOUTS, LOCI, MEIOSIS_LAYOUTS, describeIndividual, type Individual, type LayoutId } from "../../utils/biology/chromosome";
import { defaultMeiosisSettings, fertilisationOutcome, gameteComplements, gameteLabel, meiosisDistribution, type MeiosisSettings, type Pole } from "../../utils/biology/cellDivision";
import { frText, gametesOf, parseRecombination, fr } from "../../utils/biology/genetics";
import { divisionQuestions, meiosisChallenge, ndGameteNotes } from "../../utils/biology/bioLearning16";
import { makeQuestion } from "../../utils/biology/bioLearning";
import { putHandoff, takeHandoff } from "../../utils/biology/handoff16";
import { DIVISION_ASSUMPTIONS, summarizeCellDivision } from "../../utils/biology/bioSummary16";
import {
  CELLDIVISION_ENGINE_VERSION, DEFAULT_CELLDIVISION_INPUTS, defaultParents, describeCellDivisionAnalysis, divisionStages, validateCellDivisionInputs, type CellDivisionInputs,
} from "../../utils/persistence/biologyTools16";
import { validateBiologyResults } from "../../utils/persistence/biologyTools";
import type { BiologyToolId } from "../../navigation/subjects";

type Props = { openRequest?: { id: string; recordId: string } | null; onOpenHandled?: (requestId: string) => void; onNavigate?: (id: BiologyToolId) => void };

const SHORT: Record<string, string> = {
  g1: "G1", s: "S", prophase: "Prophase", prometaphase: "Prometaphase", metaphase: "Metaphase", anaphase: "Anaphase", telophase: "Telophase",
  prophase1: "Prophase I", crossing: "Crossing over", metaphase1: "Metaphase I", anaphase1: "Anaphase I", telophase1: "Telophase I", prophase2: "Prophase II", metaphase2: "Metaphase II", anaphase2: "Anaphase II", telophase2: "Telophase II",
};
const poleName = (p: number) => (p === 0 ? "upper" : "lower");

export default function CellDivisionPage({ openRequest = null, onOpenHandled, onNavigate }: Props) {
  const ws = useGcWorkspace<CellDivisionInputs>({
    page: "celldivision",
    engineVersion: CELLDIVISION_ENGINE_VERSION,
    defaults: DEFAULT_CELLDIVISION_INPUTS,
    validateInputs: validateCellDivisionInputs,
    validateResults: validateBiologyResults,
    summarize: summarizeCellDivision,
    describe: describeCellDivisionAnalysis,
    fallbackName: "Cell division",
    openRequest,
    onOpenHandled,
  });
  const { raw, update } = ws;
  const { process, individual: ind, settings, mode } = raw;
  const meiosis = process === "meiosis";
  const stages = useMemo(() => divisionStages({ process, individual: ind, settings }), [process, ind, settings]);
  const max = stages.length - 1;
  const stageIndex = Math.min(raw.stage, max);
  const stage = stages[stageIndex];
  const setStage = (n: number) => update((c) => {
    if (c.stage === n) return c;
    const ids = new Set(stages[Math.min(n, max)].cells.flatMap((x) => x.chromosomes.map((y) => y.id)));
    return { ...c, stage: n, selected: c.selected && ids.has(c.selected) ? c.selected : null };
  });
  const player = useStepPlayer(stageIndex, max, setStage);
  const [revealedLabels, setRevealedLabels] = useState(false);
  const narrow = useNarrow();
  const [focus, setFocus] = useState<number | null>(narrow ? 0 : null);
  const locked = mode === "challenge" && !raw.revealed;
  const hide = mode === "practice" && !revealedLabels;
  const layoutId = ind.layout;
  const r = parseRecombination(raw.recombination) ?? fr(1, 5);
  const selectedChrom = raw.selected ? stage.cells.flatMap((c, i) => c.chromosomes.map((x) => ({ x, cell: stage.cells[i] }))).find((e) => e.x.id === raw.selected) ?? null : null;

  // hand-off from the Genetics tool (taken once)
  useEffect(() => {
    const h = takeHandoff("celldivision");
    if (h && (MEIOSIS_LAYOUTS as string[]).includes(h.individual.layout)) update((c) => ({ ...c, process: "meiosis", individual: h.individual, settings: defaultMeiosisSettings(h.individual), stage: 0, selected: null, revealed: false }));
  }, [update]);

  const resetForChange = (c: CellDivisionInputs): CellDivisionInputs => ({ ...c, stage: c.mode === "challenge" ? 0 : c.stage, revealed: false, selected: null });
  const setProcess = (p: "mitosis" | "meiosis") => { player.pause(); setFocus(null); update((c) => ({ ...c, process: p, stage: 0, selected: null, revealed: false })); };
  const setInd = (next: Individual) => update((c) => resetForChange({ ...c, individual: next, settings: defaultMeiosisSettings(next) }));
  const setLayout = (id: LayoutId) => { const d = defaultParents(id); setInd(d.parent1); };
  const setSettings = (patch: (s: MeiosisSettings) => MeiosisSettings) => update((c) => resetForChange({ ...c, settings: patch(c.settings) }));

  const questions = useMemo(() => divisionQuestions(stages, stageIndex, process), [stages, stageIndex, process]);
  const challenge = useMemo(() => {
    if (meiosis) return meiosisChallenge(ind, settings);
    const last = stages[max].counts[0];
    const q = makeQuestion("dv-ch-mitosis", "After mitosis, how many chromosomes will EACH daughter cell have?", String(last.chromosomes), [String(last.chromosomes / 2), String(last.chromosomes * 2), String(last.chromosomes + 1)], `Mitosis separates sister chromatids, so each daughter cell gets one copy of every chromosome: ${last.chromosomes} chromosomes (${last.sets}) and ${last.dnaC}C DNA, identical to the parent cell.`);
    return { prompt: q.prompt, question: q, answer: last.chromosomes };
  }, [meiosis, ind, settings, stages, max]);

  const finals = stages[max];
  const expected = useMemo(() => (meiosis ? gametesOf(ind, r) : []), [meiosis, ind, r]);
  const averaged = useMemo(() => (meiosis ? meiosisDistribution(ind, r) : null), [meiosis, ind, r]);
  const complements = useMemo(() => (meiosis ? gameteComplements(ind, settings) : []), [meiosis, ind, settings]);
  const ndNotes = useMemo(() => (meiosis ? ndGameteNotes(ind, settings) : []), [meiosis, ind, settings]);
  const nPairs = ind.pairs.length;

  const setCo = (pair: number, on: boolean) => setSettings((s) => ({ ...s, crossover: s.crossover.map((c, i) => (i !== pair ? c : on ? { between: 0, m: 1, p: 0 } : null)) }));
  const setCoPart = (pair: number, key: "m" | "p", v: 0 | 1) => setSettings((s) => ({ ...s, crossover: s.crossover.map((c, i) => (i !== pair || !c ? c : { ...c, [key]: v })) }));
  const setO1 = (pair: number, v: Pole) => setSettings((s) => ({ ...s, orient1: s.orient1.map((o, i) => (i === pair ? v : o)) }));
  const setO2 = (cell: 0 | 1, pair: number, v: Pole) => setSettings((s) => ({ ...s, orient2: (cell === 0 ? [s.orient2[0].map((o, i) => (i === pair ? v : o)), s.orient2[1]] : [s.orient2[0], s.orient2[1].map((o, i) => (i === pair ? v : o))]) as [Pole[], Pole[]] }));
  const nd = settings.nd;
  const setNd = (kind: "none" | "I" | "II") => setSettings((s) => ({ ...s, nd: kind === "none" ? { kind: "none" } : kind === "I" ? { kind: "I", pair: 0, pole: 0 } : { kind: "II", pair: 0, cell: 0, pole: 0 } }));
  const setNdField = (patch: Record<string, number>) => setSettings((s) => ({ ...s, nd: { ...s.nd, ...patch } as MeiosisSettings["nd"] }));

  const sel = (id: string | null) => update((c) => ({ ...c, selected: id }));
  const linkedHet = layoutId === "linked";

  return (
    <div className="gc-page ph-page bio-page">
      <ToolHeader
        group="Genetics & cell division"
        title="Mitosis & meiosis"
        purpose="Follow the chromosomes of a small cell through mitosis and meiosis. Every cell, chromosome and chromatid on the diagram comes from the process engine, so the counts, the allele combinations and the effect of a crossover or a nondisjunction are the real consequences of the choices you make."
        evidence="model"
        steps={[
          { label: "Choose a genotype and a process", detail: "Mitosis, or meiosis with your own settings." },
          { label: "Step through the stages", detail: "Select a chromosome to inspect it." },
          { label: "Compare the gametes", detail: "With the Genetics tool's expectation." },
        ]}
        aside={<Badge tone="neutral" title="2n = 2 or 4. One illustrated meiosis is one random outcome, not a distribution.">Small model · one outcome</Badge>}
      />
      {ws.chrome}
      <div className="gc-toolbar">
        <LearningModeSwitch mode={mode} modes={["explore", "practice", "challenge"]} onChange={(m) => { setRevealedLabels(false); player.pause(); update((c) => ({ ...c, mode: m, revealed: false, stage: m === "challenge" ? 0 : c.stage, selected: null })); }} />
        {ws.actions}
      </div>
      {ws.saveFormEl}

      <div className="gc-layout">
        <Panel className="gc-inputs" subtitle="Genotype of the dividing cell and the choices that shape one meiosis." title="Cell and settings">
          <Segmented<"mitosis" | "meiosis"> label="Process" onChange={setProcess} options={[{ id: "mitosis", label: "Mitosis" }, { id: "meiosis", label: "Meiosis" }]} value={process} />
          <div className="gc-field">
            <label htmlFor="cd-layout">Chromosomes and genes</label>
            <select data-testid="layout-select" id="cd-layout" onChange={(e) => setLayout(e.target.value as LayoutId)} value={layoutId}>
              {MEIOSIS_LAYOUTS.map((id) => <option key={id} value={id}>{LAYOUTS[id].label}</option>)}
            </select>
          </div>
          <IndividualEditor idPrefix="cd" onChange={setInd} title="Genotype of the cell" value={ind} />
          {meiosis ? (
            <>
              {ind.pairs.map((_, p) => (LAYOUTS[layoutId].pairs[p].length >= 2 ? (
                <fieldset className="bio-genotype" key={`co${p}`}>
                  <legend>Crossing over, pair {p + 1}</legend>
                  <label className="bio-check"><input checked={!!settings.crossover[p]} data-testid={`co-toggle-${p}`} onChange={(e) => setCo(p, e.target.checked)} type="checkbox" /> One crossover between the two genes</label>
                  {settings.crossover[p] ? (
                    <div className="bio-genotype-row">
                      <label>Maternal chromatid <select data-testid={`co-m-${p}`} onChange={(e) => setCoPart(p, "m", Number(e.target.value) as 0 | 1)} value={settings.crossover[p]!.m}><option value={0}>1</option><option value={1}>2</option></select></label>
                      <label>Paternal chromatid <select data-testid={`co-p-${p}`} onChange={(e) => setCoPart(p, "p", Number(e.target.value) as 0 | 1)} value={settings.crossover[p]!.p}><option value={0}>1</option><option value={1}>2</option></select></label>
                    </div>
                  ) : null}
                </fieldset>
              ) : null))}
              <fieldset className="bio-genotype">
                <legend>Metaphase I: which way do the homologs face?</legend>
                {ind.pairs.map((_, p) => (
                  <div className="bio-genotype-row" key={p}>
                    <span className="bio-genotype-hom">Pair {p + 1}: maternal homolog toward the</span>
                    <select aria-label={`Pair ${p + 1} maternal homolog faces`} data-testid={`orient1-${p}`} onChange={(e) => setO1(p, Number(e.target.value) as Pole)} value={settings.orient1[p]}><option value={0}>upper pole</option><option value={1}>lower pole</option></select>
                  </div>
                ))}
              </fieldset>
              <fieldset className="bio-genotype">
                <legend>Metaphase II: which sister goes up?</legend>
                {([0, 1] as const).map((cell) => ind.pairs.map((_, p) => (
                  <div className="bio-genotype-row" key={`${cell}${p}`}>
                    <span className="bio-genotype-hom">Cell {cell === 0 ? "A" : "B"}, pair {p + 1}: sister chromatid</span>
                    <select aria-label={`Cell ${cell === 0 ? "A" : "B"} pair ${p + 1}: sister chromatid to the upper pole`} data-testid={`orient2-${cell}-${p}`} onChange={(e) => setO2(cell, p, Number(e.target.value) as Pole)} value={settings.orient2[cell][p]}><option value={0}>1 goes to the upper pole</option><option value={1}>2 goes to the upper pole</option></select>
                  </div>
                )))}
              </fieldset>
              <fieldset className="bio-genotype">
                <legend>Nondisjunction</legend>
                <div className="gc-field">
                  <label htmlFor="cd-nd">Scenario</label>
                  <select data-testid="nd-select" id="cd-nd" onChange={(e) => setNd(e.target.value as "none" | "I" | "II")} value={nd.kind}>
                    <option value="none">None: normal meiosis</option>
                    <option value="I">Meiosis I nondisjunction (homologs stay together)</option>
                    <option value="II">Meiosis II nondisjunction (sister chromatids stay together)</option>
                  </select>
                </div>
                {nd.kind !== "none" ? (
                  <div className="bio-genotype-row">
                    <label>Affected pair <select data-testid="nd-pair" onChange={(e) => setNdField({ pair: Number(e.target.value) })} value={nd.pair}>{ind.pairs.map((_, p) => <option key={p} value={p}>{p + 1}</option>)}</select></label>
                    {nd.kind === "II" ? <label>In cell <select data-testid="nd-cell" onChange={(e) => setNdField({ cell: Number(e.target.value) })} value={nd.cell}><option value={0}>A</option><option value={1}>B</option></select></label> : null}
                    <label>Both go to the <select data-testid="nd-pole" onChange={(e) => setNdField({ pole: Number(e.target.value) })} value={nd.pole}><option value={0}>upper pole</option><option value={1}>lower pole</option></select></label>
                  </div>
                ) : null}
              </fieldset>
              {linkedHet ? <NumberField hint="Used only to compare this run with the expected gamete frequencies below; a single meiosis does not depend on it." label="Recombination fraction r (for the comparison)" onChange={(v) => update((c) => ({ ...c, recombination: v }))} step={0.01} value={raw.recombination} error={parseRecombination(raw.recombination) ? null : "Use 0 to 0.5 with at most 3 decimals."} /> : null}
            </>
          ) : null}
        </Panel>

        <div className="gc-stage">
          <StepControls
            extra={<>
              {mode === "practice" ? <button className="secondary-button" data-testid="reveal-btn" onClick={() => setRevealedLabels((x) => !x)} type="button">{revealedLabels ? "Hide labels" : "Reveal labels"}</button> : null}
              {mode === "challenge" && raw.revealed ? <button className="secondary-button" data-testid="new-prediction" onClick={() => update((c) => ({ ...c, revealed: false, stage: 0, selected: null }))} type="button">New prediction</button> : null}
            </>}
            locked={locked}
            max={max}
            onStep={setStage}
            player={player}
            step={stageIndex}
            unit="Stage"
          />
          <ol aria-label="Stage timeline" className="bio-timeline cd-timeline" data-testid="stage-timeline">
            {stages.map((s, i) => (
              <li className={i === stageIndex ? "is-now" : i < stageIndex ? "is-done" : ""} key={s.id}>
                <button aria-current={i === stageIndex ? "step" : undefined} className="ghost-button" disabled={locked} onClick={() => { player.pause(); setStage(i); }} type="button">{SHORT[s.id] ?? s.id}</button>
              </li>
            ))}
          </ol>
          <div aria-live="polite" className="bio-caption" data-testid="step-caption">
            <h3>{hide && stageIndex > 0 ? "Stage hidden" : stage.title}</h3>
            <p>{hide && stageIndex > 0 ? "Labels are hidden. Count the chromosomes and chromatids, decide what stage this is, then use Reveal labels." : stage.caption}</p>
            {!hide ? <ul className="bio-detail-list" data-testid="stage-details">{stage.details.map((d) => <li key={d}>{d}</li>)}</ul> : null}
          </div>
          {stage.cells.length > 1 ? (
            <div className="bio-chip-row" role="group" aria-label="Zoom to one cell">
              <button aria-pressed={focus === null} className="secondary-button gc-chip" onClick={() => setFocus(null)} type="button">All cells</button>
              {stage.cells.map((c, i) => <button aria-pressed={focus === i} className="secondary-button gc-chip" key={c.id} onClick={() => setFocus(i)} type="button">{hide ? `Cell ${i + 1}` : c.label}</button>)}
            </div>
          ) : null}
          <DiagramFrame caption="Select a chromosome (click, or Tab then Enter) to inspect it. Poles: the upper and lower ends of the spindle." label="Cell division diagram" legend={<ChromLegend showCrossover />} title={`${process === "mitosis" ? "Mitosis" : "Meiosis"}: ${hide && stageIndex > 0 ? "?" : stage.title}`}>
            <CellDiagram focus={focus !== null && stage.cells[focus] ? focus : null} hideLabels={hide} onSelect={sel} selectedId={raw.selected} stage={stage} />
          </DiagramFrame>

          <KeyFigures items={stage.cells.length === 1
            ? [{ label: "Chromosomes (centromeres)", value: String(stage.counts[0].chromosomes) }, { label: "Chromatids (DNA molecules)", value: String(stage.counts[0].chromatids) }, { label: "DNA content", value: `${stage.counts[0].dnaC}C`, note: "1C = one haploid set" }, { label: "Chromosome sets", value: stage.counts[0].sets }]
            : [{ label: "Cells", value: String(stage.cells.length) }, { label: "Chromosomes per cell", value: stage.counts.map((c) => c.chromosomes).join(" · ") }, { label: "Chromatids per cell", value: stage.counts.map((c) => c.chromatids).join(" · ") }, { label: "DNA content per cell", value: stage.counts.map((c) => `${c.dnaC}C`).join(" · ") }]} />

          {selectedChrom ? (
            <Panel subtitle="Chromosome selected in the diagram." title={`Chromosome ${selectedChrom.x.id}`}>
              <dl className="bio-seqline" data-testid="chromosome-detail">
                <dt>Origin</dt><dd>{selectedChrom.x.origin} homolog of pair {selectedChrom.x.pair + 1} ({selectedChrom.x.loci.map((l) => LOCI[l].name).join(", ")})</dd>
                <dt>Chromatids</dt><dd>{selectedChrom.x.chromatids.length} ({selectedChrom.x.chromatids.length === 2 ? "sister chromatids joined at one centromere" : "a single chromatid"})</dd>
                <dt>Alleles</dt><dd>{selectedChrom.x.chromatids.map((c, i) => `chromatid ${i + 1}: ${chromatidText(c)}${new Set(c.origins).size > 1 ? " (recombinant: part maternal, part paternal)" : ""}`).join("; ")}</dd>
                <dt>State</dt><dd>{[selectedChrom.x.paired ? "paired with its homolog (bivalent)" : null, selectedChrom.x.attached ? `attached to the spindle${selectedChrom.x.facing ? ` (kinetochores face the ${selectedChrom.x.facing.map(poleName).join(" and ")} pole)` : ""}` : "not attached to the spindle", selectedChrom.x.position === "plate" ? "on the metaphase plate" : null, selectedChrom.x.chiasmata.length ? "has a chiasma (crossover)" : null].filter(Boolean).join("; ")}</dd>
              </dl>
              <button className="ghost-button" onClick={() => sel(null)} type="button">Clear selection</button>
            </Panel>
          ) : null}

          {mode === "explore" ? (
            <Panel subtitle="Each answer refers to the process on screen." title="Why does it behave this way?">
              <Disclosure defaultOpen summary="Chromosome number is not DNA content">
                <p>Chromosome number is the number of centromeres; DNA content is the number of chromatids (in units of C, one haploid set). The table follows the first cell through every stage of this run.</p>
                <table className="bio-dist" data-testid="counts-table">
                  <thead><tr><th scope="col">Stage</th><th scope="col">Chromosomes</th><th scope="col">Chromatids</th><th scope="col">DNA</th></tr></thead>
                  <tbody>{stages.map((s) => <tr key={s.id}><th scope="row">{s.title}</th><td>{s.counts.map((c) => c.chromosomes).join(" · ")}</td><td>{s.counts.map((c) => c.chromatids).join(" · ")}</td><td>{s.counts.map((c) => `${c.dnaC}C`).join(" · ")}</td></tr>)}</tbody>
                </table>
              </Disclosure>
              <Disclosure summary="Homologs versus sister chromatids"><p>Homologous chromosomes are the maternal and the paternal copy of the same chromosome: similar genes, possibly different alleles. Sister chromatids are the two identical copies made by DNA replication of ONE chromosome. {meiosis ? "In meiosis I the homologs separate; in meiosis II the sister chromatids separate." : "In mitosis the homologs never pair; the sister chromatids of every chromosome separate."}</p></Disclosure>
              {meiosis ? <Disclosure summary="Independent assortment and crossing over"><p>Each pair lines up on its own at metaphase I, so which homolog goes to which pole is independent for each pair (change the orientations on the left). Crossing over exchanges segments between non-sister chromatids, so a gamete can carry a combination of alleles that neither parent chromosome had.</p></Disclosure> : null}
              {meiosis ? <Disclosure summary="Nondisjunction is a chromosome-number error, not a gene mutation"><p>In nondisjunction no allele changes: chromosomes are simply distributed unequally, so a gamete gets two copies or none of a whole chromosome. A mutation, by contrast, changes the sequence of a gene. A meiosis I error leaves both different homologs together; a meiosis II error leaves two sister copies together; they are not equivalent.</p></Disclosure> : null}
            </Panel>
          ) : null}

          {meiosis && nd.kind !== "none" && (stageIndex === max || mode === "explore") ? (
            <Panel subtitle="What the chosen error produced." title="Nondisjunction outcome">
              <ul className="gc-assumptions" data-testid="nd-outcome">
                {complements.map((g, i) => <li key={i}><strong>Gamete {i + 1}:</strong> {g.label} — {g.sets}. {g.perPair[nd.pair] === 2 ? fertilisationOutcome(2) : g.perPair[nd.pair] === 0 ? fertilisationOutcome(0) : ""}</li>)}
                {ndNotes.map((n) => <li key={n}>{n}</li>)}
              </ul>
            </Panel>
          ) : null}

          {meiosis && stageIndex === max ? (
            <Panel subtitle="The four gametes of THIS run, compared with the Genetics model's expected frequencies." title="Gametes and expectation">
              <table className="bio-dist" data-testid="gamete-compare">
                <caption>Illustrated gametes (one meiosis)</caption>
                <thead><tr><th scope="col">Gamete</th><th scope="col">Alleles</th><th scope="col">Chromosomes</th><th scope="col">Expected class frequency</th></tr></thead>
                <tbody>
                  {finals.cells.map((c, i) => {
                    const label = gameteLabel(c.chromosomes, nPairs);
                    const cls = expected.find((g) => g.label === label);
                    return <tr data-gamete={label} key={c.id}><th scope="row">{c.label}</th><td>{hide ? "?" : label}</td><td>{finals.counts[i].sets}</td><td>{cls ? `${frText(cls.p)}${cls.kind === "recombinant" ? " (recombinant class)" : ""}` : "not a normal gamete class"}</td></tr>;
                  })}
                </tbody>
              </table>
              <table className="bio-dist" data-testid="expected-gametes">
                <caption>Expected gamete classes (Genetics model){linkedHet ? ` with r = ${frText(r)}` : ""}, and the average over every possible meiosis</caption>
                <thead><tr><th scope="col">Class</th><th scope="col">Genetics model</th><th scope="col">Average over all meioses</th></tr></thead>
                <tbody>{expected.map((g) => <tr key={g.label}><th scope="row">{g.label}</th><td>{frText(g.p)}</td><td>{averaged?.get(g.label) ? frText(averaged.get(g.label)!) : "0"}</td></tr>)}</tbody>
              </table>
              <p className="bio-note">A single illustrated meiosis is one random outcome. It is not evidence of how often each gamete class occurs; the expected frequencies come from averaging over every equally likely crossover and orientation, and agree with the Genetics tool.</p>
              {(MEIOSIS_LAYOUTS as string[]).includes(layoutId) ? <button className="secondary-button" data-testid="to-genetics" onClick={() => { putHandoff({ to: "genetics", individual: ind }); onNavigate?.("bioGenetics"); }} type="button">Combine gametes in the Genetics tool</button> : null}
            </Panel>
          ) : null}

          {mode === "practice" ? <QuizPanel questions={questions} /> : null}
          {mode === "challenge" ? (
            <PredictPanel
              finished={raw.revealed}
              onReveal={() => update((c) => ({ ...c, revealed: true, stage: max, selected: null }))}
              question={raw.revealed ? null : challenge.question}
              revealLabel={meiosis ? "Reveal the gametes" : "Reveal the daughter cells"}
              subtitle={meiosis ? "Change the crossover, orientations or nondisjunction on the left, commit to an answer, then see the gametes." : "Commit to an answer first; the daughter cells are shown after you choose."}
            />
          ) : null}
          <p className="bio-note">{describeIndividual(ind)}</p>
        </div>
      </div>

      <Panel subtitle="What this tool does and does not model." title="Assumptions and limits">
        <ul className="gc-assumptions">{DIVISION_ASSUMPTIONS.map((a) => <li key={a}>{a}</li>)}</ul>
      </Panel>
    </div>
  );
}
