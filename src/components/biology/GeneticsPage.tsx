import { useEffect, useMemo, useState } from "react";
import { LearningModeSwitch } from "../ui/LearningModeSwitch";
import { Badge, Callout, DiagramFrame, Disclosure, KeyFigures, Panel, ToolHeader } from "../ui/primitives";
import { NumberField } from "../generalChem/shared";
import { useGcWorkspace } from "../generalChem/useGcWorkspace";
import { QuizPanel, StepControls } from "./bioShared";
import { useStepPlayer } from "./bioHooks";
import { ChromLegend, CrossoverFigure, DistributionTable, GameteDiagram, IndividualEditor, ParentChromosomes, PunnettTable } from "./GeneticsParts";
import { LAYOUTS, LAYOUT_IDS, LOCI, MEIOSIS_LAYOUTS, describeIndividual, type Individual, type LayoutId } from "../../utils/biology/chromosome";
import { analyzeLinkage, cross, frText, parseRecombination, testCross, testCrossInterpretation, testerFor, fr, type CrossResult } from "../../utils/biology/genetics";
import { gameteTask, geneticsChallenge, geneticsQuestions, gradeGameteTask, parseProbabilityInput, probabilityMatches, type GameteTask } from "../../utils/biology/bioLearning16";
import { analyzeDogma } from "../../utils/biology/dogma";
import { putHandoff, takeHandoff } from "../../utils/biology/handoff16";
import { GENETICS_ASSUMPTIONS, summarizeGenetics } from "../../utils/biology/bioSummary16";
import {
  DEFAULT_GENETICS_INPUTS, GENETICS_ENGINE_VERSION, GENETICS_STEPS, defaultParents, describeGeneticsAnalysis, validateGeneticsInputs, type GeneticsInputs,
} from "../../utils/persistence/biologyTools16";
import { validateBiologyResults } from "../../utils/persistence/biologyTools";
import type { BiologyToolId } from "../../navigation/subjects";

type Props = { openRequest?: { id: string; recordId: string } | null; onOpenHandled?: (requestId: string) => void; onNavigate?: (id: BiologyToolId) => void };

const STEP_NAMES = ["Parents", "Gametes", "Fertilisation", "Offspring"];
const LAYOUT_NOTES: Partial<Record<LayoutId, string>> = {
  mono: "Complete dominance: one dominant and one recessive allele (seed shape).",
  di: "Two genes on different chromosome pairs: they assort independently.",
  incomplete: "Incomplete dominance: the heterozygote is intermediate.",
  codominant: "Codominance: the heterozygote shows both alleles.",
  abo: "Multiple alleles: three alleles in one population, two per person.",
  xlinked: "X-linked recessive: a female (XX) mother and a male (XY) father.",
  linked: "Two genes close together on one chromosome pair: linked.",
};

// the Stage 15 link: an allele as one specified sequence variant (the first 18 codons of the human β-globin gene, HBB)
const HBB_CODING = "ATGGTGCACCTGACTCCTGAGGAGAAGTCTGCCGTTACTGCCCTGTGGGGCAAG";
const HBB_VARIANT = { kind: "substitution" as const, pos: 19, base: "T" };

export default function GeneticsPage({ openRequest = null, onOpenHandled, onNavigate }: Props) {
  const ws = useGcWorkspace<GeneticsInputs>({
    page: "genetics",
    engineVersion: GENETICS_ENGINE_VERSION,
    defaults: DEFAULT_GENETICS_INPUTS,
    validateInputs: validateGeneticsInputs,
    validateResults: validateBiologyResults,
    summarize: summarizeGenetics,
    describe: describeGeneticsAnalysis,
    fallbackName: "Genetics cross",
    openRequest,
    onOpenHandled,
  });
  const { raw, update } = ws;
  const mode = raw.mode;
  const layoutId = raw.parent1.layout;
  const layout = LAYOUTS[layoutId];
  const r = parseRecombination(raw.recombination);
  const step = raw.step;
  const setStep = (n: number) => update((c) => (c.step === n ? c : { ...c, step: n }));
  const player = useStepPlayer(step, GENETICS_STEPS - 1, setStep);
  const [revealed, setRevealed] = useState(false);
  const [guess, setGuess] = useState("");
  const [checked, setChecked] = useState<null | { ok: boolean; value: number | null }>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [graded, setGraded] = useState<null | ReturnType<typeof gradeGameteTask>>(null);
  const resetLearning = () => { setRevealed(false); setGuess(""); setChecked(null); setPicked([]); setGraded(null); };

  // hand-off from the Mitosis & meiosis tool (taken once)
  useEffect(() => {
    const h = takeHandoff("genetics");
    if (h) update((c) => ({ ...c, parent1: h.individual, parent2: h.individual, recombination: LAYOUTS[h.individual.layout].linked ? 0.2 : 0.5, step: 0 }));
  }, [update]);

  const setLayout = (id: LayoutId) => { resetLearning(); player.pause(); update((c) => ({ ...c, ...defaultParents(id), step: 0 })); };
  const setParent = (which: 1 | 2, ind: Individual) => { resetLearning(); update((c) => ({ ...c, [which === 1 ? "parent1" : "parent2"]: ind, step: 0 })); };
  const setR = (v: number) => { resetLearning(); update((c) => ({ ...c, recombination: v, step: 0 })); };

  const result: CrossResult | null = useMemo(() => (r ? cross(raw.parent1, raw.parent2, r) : null), [raw.parent1, raw.parent2, r]);
  const rr = r ?? fr(1, 2);
  const link = useMemo(() => analyzeLinkage(raw.parent1, rr), [raw.parent1, rr]);
  const task: GameteTask = useMemo(() => gameteTask(raw.parent1, rr), [raw.parent1, rr]);
  const challenge = useMemo(() => (result ? geneticsChallenge(raw.parent1, raw.parent2, rr, result) : null), [result, raw.parent1, raw.parent2, rr]);
  const questions = useMemo(() => (result ? geneticsQuestions(raw.parent1, raw.parent2, rr, result) : []), [result, raw.parent1, raw.parent2, rr]);
  const hide = mode === "practice" && !revealed;
  const lockedSteps = mode === "challenge";
  const showGametes = step >= 1, showGrid = step >= 2, showDist = step >= 3;
  const sequenceDemo = useMemo(() => (layoutId === "mono" ? { wild: analyzeDogma({ coding: HBB_CODING, mutation: null }), mut: analyzeDogma({ coding: HBB_CODING, mutation: HBB_VARIANT }) } : null), [layoutId]);
  const interp = useMemo(() => (layoutId === "mono" ? testCrossInterpretation("R") : null), [layoutId]);
  const sexLock = layoutId === "xlinked" ? { p1: "female" as const, p2: "male" as const } : null;

  const captions = [
    "Each parent's chromosome pairs: one maternal and one paternal homolog, with the allele each carries at every gene.",
    result ? `Each parent makes gametes: every gamete receives one homolog of each chromosome pair. Parent 1 makes ${result.gametes1.length} kind${result.gametes1.length === 1 ? "" : "s"}, parent 2 makes ${result.gametes2.length}.${layout.linked ? " The genes are linked, so the parental combinations are most common; recombinants arise by crossing over." : ""}` : "",
    result ? `Gametes from the two parents combine at random. Each of the ${result.gametes1.length * result.gametes2.length} boxes is one possible fertilisation.` : "",
    result ? `Adding up the boxes gives the expected proportion of every genotype and phenotype among many offspring: phenotypic ratio ${result.phenotypicRatio}.` : "",
  ];

  const checkGuess = () => {
    if (!challenge) return;
    const v = parseProbabilityInput(guess);
    setChecked({ ok: v !== null && probabilityMatches(v, challenge.answer), value: v });
  };

  return (
    <div className="gc-page ph-page bio-page">
      <ToolHeader
        group="Genetics & cell division"
        title="Genetics & inheritance"
        purpose="Build the genotypes of two parents, watch their chromosomes separate into gametes, and combine the gametes to see which offspring are possible. Every ratio is derived from the same segregation rules, not looked up."
        evidence="model"
        steps={[
          { label: "Choose a pattern and genotypes", detail: "Dominance, X-linkage or linked genes." },
          { label: "Step from chromosomes to offspring", detail: "Gametes, Punnett square, ratios." },
          { label: "Practise or predict", detail: "Pick the gametes, or predict a fraction first." },
        ]}
        aside={<Badge tone="neutral" title="Expected proportions from the stated model; not the result of any one family.">Expected proportions</Badge>}
      />
      {ws.chrome}
      <div className="gc-toolbar">
        <LearningModeSwitch mode={mode} modes={["explore", "practice", "challenge"]} onChange={(m) => { resetLearning(); player.pause(); update((c) => ({ ...c, mode: m, step: m === "challenge" ? 0 : c.step })); }} />
        {ws.actions}
      </div>
      {ws.saveFormEl}

      <div className="gc-layout">
        <Panel className="gc-inputs" subtitle="Pick an inheritance pattern, then set each parent's alleles." title="Cross">
          <div className="gc-field">
            <label htmlFor="gen-layout">Inheritance pattern</label>
            <select data-testid="layout-select" id="gen-layout" onChange={(e) => setLayout(e.target.value as LayoutId)} value={layoutId}>
              {LAYOUT_IDS.map((id) => <option key={id} value={id}>{LAYOUTS[id].label}</option>)}
            </select>
            <p className="gc-field-hint">{LAYOUT_NOTES[layoutId]}</p>
          </div>
          <IndividualEditor idPrefix="p1" onChange={(i) => setParent(1, i)} sex={sexLock?.p1} title={layoutId === "xlinked" ? "Mother (XX)" : "Parent 1"} value={raw.parent1} />
          <IndividualEditor idPrefix="p2" onChange={(i) => setParent(2, i)} sex={sexLock?.p2} title={layoutId === "xlinked" ? "Father (XY)" : "Parent 2"} value={raw.parent2} />
          {layoutId !== "xlinked" ? (
            <button className="secondary-button" data-testid="make-tester" onClick={() => setParent(2, testerFor(raw.parent1))} type="button">Make parent 2 a tester (test cross: homozygous recessive)</button>
          ) : null}
          {layout.linked ? (
            <>
              <div className="bio-chip-row" role="group" aria-label="Parent 1 phase">
                <button className="secondary-button gc-chip" data-testid="phase-coupling" onClick={() => setParent(1, { ...raw.parent1, pairs: [{ a: { alleles: ["A", "B"] }, b: { alleles: ["a", "b"] } }] })} type="button">Parent 1: coupling AB/ab</button>
                <button className="secondary-button gc-chip" data-testid="phase-repulsion" onClick={() => setParent(1, { ...raw.parent1, pairs: [{ a: { alleles: ["A", "b"] }, b: { alleles: ["a", "B"] } }] })} type="button">Parent 1: repulsion Ab/aB</button>
              </div>
              <NumberField error={r ? null : "Use a value from 0 to 0.5 with at most 3 decimals."} hint="Fraction of gametes that are recombinant (0 = completely linked, 0.5 = behave as if unlinked). This is an input; the model does not compute it from distance or sequence." label="Recombination fraction r" onChange={setR} step={0.01} value={raw.recombination} />
            </>
          ) : null}
          <Callout tone="info" title="How genotype becomes phenotype here">
            <ul className="gc-assumptions">{layout.pairs.flat().map((id) => <li key={id}><strong>{LOCI[id].name}:</strong> {LOCI[id].rule}</li>)}</ul>
          </Callout>
        </Panel>

        <div className="gc-stage">
          {result ? (
            <>
              <StepControls extra={mode === "practice" ? <button className="secondary-button" data-testid="reveal-btn" onClick={() => setRevealed((x) => !x)} type="button">{revealed ? "Hide answers" : "Reveal answers"}</button> : null} locked={lockedSteps} max={GENETICS_STEPS - 1} onStep={setStep} player={player} step={step} unit="Step" />
              <ol className="bio-timeline" aria-label="Stages of the cross">
                {STEP_NAMES.map((n, i) => <li className={i === step ? "is-now" : i < step ? "is-done" : ""} key={n}>{i + 1}. {n}</li>)}
              </ol>
              <div aria-live="polite" className="bio-caption" data-testid="step-caption"><h3>{STEP_NAMES[step]}</h3><p>{captions[step]}</p></div>

              <DiagramFrame caption="Each chromosome pair has a maternal homolog (solid, M) and a paternal homolog (hatched, P). Genes are drawn as bands with their alleles beside them." label="Parent chromosomes" legend={<ChromLegend showCrossover={layout.linked} />} title="Chromosomes of the parents">
                <div className="bio-parents">
                  <ParentChromosomes individual={raw.parent1} label={layoutId === "xlinked" ? "Mother" : "Parent 1"} />
                  <ParentChromosomes individual={raw.parent2} label={layoutId === "xlinked" ? "Father" : "Parent 2"} />
                </div>
              </DiagramFrame>

              {showGametes ? (
                <DiagramFrame label="Gametes" title="Gametes (each receives one homolog of every pair)">
                  <div className="bio-parents">
                    <div><GameteDiagram gametes={result.gametes1} hideLabels={hide} individual={raw.parent1} title="Gametes of parent 1" /></div>
                    <div><GameteDiagram gametes={result.gametes2} hideLabels={hide} individual={raw.parent2} title="Gametes of parent 2" /></div>
                  </div>
                </DiagramFrame>
              ) : null}
              {showGrid ? <Panel subtitle="Gamete frequencies are shown beside each heading." title="Punnett square"><PunnettTable hide={hide} result={result} /></Panel> : null}
              {showDist ? (
                <Panel subtitle="Exact fractions among all offspring." title="Offspring distribution">
                  <div className="bio-dist-grid">
                    <DistributionTable hide={hide} ratio={result.genotypicRatio} testId="genotype-dist" tallies={result.genotypes} title="Genotypes" />
                    <DistributionTable hide={hide} ratio={result.phenotypicRatio} testId="phenotype-dist" tallies={result.phenotypes} title="Phenotypes" />
                  </div>
                </Panel>
              ) : null}
              <KeyFigures items={[
                { label: "Gamete classes", value: `${result.gametes1.length} × ${result.gametes2.length}`, note: "parent 1 × parent 2" },
                { label: "Genotype ratio", value: hide ? "?" : result.genotypicRatio },
                { label: "Phenotype ratio", value: hide ? "?" : result.phenotypicRatio },
                ...(link ? [{ label: "Recombinant gametes (parent 1)", value: hide ? "?" : frText(link.recombinantFrequency), note: link.phase === "undefined" ? "not doubly heterozygous" : link.phase }] : []),
              ]} />

              {mode === "explore" ? (
                <Panel subtitle="Each answer refers to the cross you set up." title="Why does it come out this way?">
                  <Disclosure defaultOpen summary="Segregation and independent assortment"><p>The two homologs of a pair separate, so each gamete gets one allele of each gene (Mendel's first law). Different chromosome pairs line up independently, so a gamete's allele for one pair says nothing about its allele for another pair (second law).{layout.linked ? " Here the two genes are on the SAME pair, so they do not assort independently: they travel together unless a crossover separates them." : ""}</p></Disclosure>
                  <Disclosure summary="Genotype versus phenotype"><p>The genotype is the pair of alleles; the phenotype is what is observed. The link between them is a rule for each gene, stated on the left. For example, with complete dominance Rr and RR look the same (round) but are different genotypes; with incomplete dominance they look different.</p></Disclosure>
                  {link ? (
                    <Disclosure defaultOpen summary="Linked genes, phase and recombination">
                      <p data-testid="linkage-text">{link.explanation}</p>
                      <p>The recombination fraction used here is {frText(rr)}. A fraction r of the gametes are recombinant, split equally between the two recombinant classes, and the rest are parental, split equally between the two parental classes.</p>
                      <CrossoverFigure crossover={{ between: 0, m: 1, p: 0 }} pair={raw.parent1.pairs[0]} />
                      <p className="bio-note">Each crossover involves only two of the four chromatids of a bivalent, so one crossover makes two recombinant and two parental chromatids: at most half the gametes can be recombinant, which is why r cannot exceed 0.5.</p>
                    </Disclosure>
                  ) : null}
                  {interp ? (
                    <Disclosure summary="Test cross: is a dominant-looking parent homozygous or heterozygous?">
                      <p>Cross the unknown parent with a homozygous recessive tester (rr). The tester's gametes all carry r, so the offspring phenotypes reveal the unknown parent's gametes.</p>
                      <ul className="gc-assumptions" data-testid="testcross-outcomes">
                        <li><strong>RR parent:</strong> all offspring {interp.homozygous.phenotypes.map((t) => `${t.label} (${frText(t.p)})`).join(", ")}.</li>
                        <li><strong>Rr parent:</strong> {interp.heterozygous.phenotypes.map((t) => `${t.label} ${frText(t.p)}`).join(" and ")}, ratio {interp.heterozygous.phenotypicRatio}.</li>
                      </ul>
                      <p>With the current parent 1 ({describeIndividual(raw.parent1)}) the test cross would give {testCross(raw.parent1, rr).phenotypicRatio}.</p>
                    </Disclosure>
                  ) : null}
                  <Disclosure summary="See a meiosis that makes these gametes">
                    <p>The gametes above are the expected proportions. A single meiosis is one random event; the Mitosis &amp; meiosis tool shows the chromosomes separating, using exactly the same genotype and (for linked genes) the same crossover model.</p>
                    {(MEIOSIS_LAYOUTS as string[]).includes(layoutId) ? <button className="secondary-button" data-testid="to-meiosis" onClick={() => { putHandoff({ to: "celldivision", individual: raw.parent1 }); onNavigate?.("bioDivision"); }} type="button">Watch meiosis for parent 1</button> : <p className="bio-note">The meiosis tool covers autosomal examples only.</p>}
                  </Disclosure>
                  {sequenceDemo ? (
                    <Disclosure summary="An allele is a DNA sequence: one example">
                      <p>An allele is a version of a gene, which at the sequence level may be a single changed base. As a separate illustration, the first 18 codons of the human β-globin gene (HBB), wild type and the sickle variant (Glu6Val):</p>
                      <dl className="bio-seqline" data-testid="allele-sequence">
                        <dt>Coding strand</dt><dd>5′-{HBB_CODING}-3′</dd>
                        <dt>Wild-type peptide</dt><dd>{sequenceDemo.wild.wild?.protein ?? "—"}</dd>
                        <dt>Variant peptide</dt><dd>{sequenceDemo.mut.consequence?.mutant.protein ?? "—"}</dd>
                        <dt>Consequence</dt><dd>{sequenceDemo.mut.consequence?.class ?? "—"}: {sequenceDemo.mut.consequence?.summary}</dd>
                      </dl>
                      <p className="bio-note">The dominance of this allele (recessive for sickle cell disease, with carriers having both forms of haemoglobin) is stated, not inferred. This tool never predicts a phenotype from an arbitrary DNA sequence.</p>
                      <button className="secondary-button" data-testid="to-dogma" onClick={() => { putHandoff({ to: "dogma", coding: HBB_CODING, mutation: HBB_VARIANT }); onNavigate?.("bioDogma"); }} type="button">Open in DNA → RNA → protein</button>
                    </Disclosure>
                  ) : null}
                </Panel>
              ) : null}

              {mode === "practice" ? (
                <>
                  <Panel className="bio-quiz" subtitle="Select every gamete parent 1 can make, then check." title="Pick the gametes">
                    <div className="bio-chip-row" role="group" aria-label="Candidate gametes">
                      {task.candidates.map((c) => (
                        <button aria-pressed={picked.includes(c)} className={`secondary-button gc-chip bio-toggle${picked.includes(c) ? " is-on" : ""}`} data-gamete-choice={c} disabled={!!graded} key={c} onClick={() => setPicked((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]))} type="button">{c}</button>
                      ))}
                    </div>
                    <div className="bio-quiz-nav">
                      <button className="primary-button" data-testid="check-gametes" disabled={!!graded || picked.length === 0} onClick={() => setGraded(gradeGameteTask(task, picked))} type="button">Check my gametes</button>
                      {graded ? <button className="ghost-button" onClick={() => { setPicked([]); setGraded(null); }} type="button">Try again</button> : null}
                    </div>
                    {graded ? (
                      <Callout tone={graded.ok ? "ok" : "warn"} title={graded.ok ? "Correct: those are exactly the possible gametes" : "Not quite"}>
                        <p data-testid="gamete-feedback">{graded.ok ? "" : `${graded.missing.length ? `Missing: ${graded.missing.join(", ")}. ` : ""}${graded.extra.length ? `Not possible: ${graded.extra.join(", ")}. ` : ""}`}{task.explanation}</p>
                      </Callout>
                    ) : null}
                  </Panel>
                  <QuizPanel questions={questions} title="Practice questions" subtitle="Answer from the cross on the left. The reason appears after you choose." />
                </>
              ) : null}

              {mode === "challenge" && challenge ? (
                <Panel className="bio-quiz" subtitle="Change the genotypes (or the recombination fraction) on the left, then predict before the result is shown." title="Predict, then reveal">
                  <p className="gc-question" data-testid="predict-prompt">{challenge.prompt}</p>
                  <div className="gc-field">
                    <label htmlFor="gen-guess">Your prediction</label>
                    <input data-testid="guess-input" disabled={step >= 3} id="gen-guess" onChange={(e) => { setGuess(e.target.value); setChecked(null); }} placeholder="e.g. 1/4, 0.25 or 25%" type="text" value={guess} />
                  </div>
                  <div className="bio-quiz-nav">
                    <button className="primary-button" data-testid="check-guess" disabled={!guess.trim() || step >= 3} onClick={checkGuess} type="button">Check my prediction</button>
                    <button className="secondary-button" data-testid="reveal-outcome" disabled={checked === null || step >= 3} onClick={() => setStep(3)} type="button">Reveal gametes, Punnett square and ratios</button>
                  </div>
                  {checked ? (
                    <Callout tone={checked.ok ? "ok" : "warn"} title={checked.value === null ? "Enter a fraction, decimal or percentage" : checked.ok ? "Your prediction matches" : `Not quite: the answer is ${frText(challenge.answer)} (${(Number(challenge.answer.n) / challenge.answer.d * 100).toFixed(1).replace(/\.0$/, "")}%)`}>
                      <p data-testid="challenge-explanation">{challenge.explanation}</p>
                    </Callout>
                  ) : null}
                </Panel>
              ) : null}
            </>
          ) : <Callout tone="info" title="Enter a valid recombination fraction to see the cross"><p>The recombination fraction must be a number from 0 to 0.5 with at most 3 decimals.</p></Callout>}
        </div>
      </div>

      <Panel subtitle="What this tool does and does not model." title="Assumptions and limits">
        <ul className="gc-assumptions">{GENETICS_ASSUMPTIONS.map((a) => <li key={a}>{a}</li>)}</ul>
      </Panel>
    </div>
  );
}

