import { useMemo, useState } from "react";
import { ProvenancePanel } from "./ProvenancePanel";
import { LearningModeSwitch } from "../../ui/LearningModeSwitch";
import { Badge, Callout, DiagramFrame, Disclosure, KeyFigures, Panel, Segmented, ToolHeader } from "../../ui/primitives";
import { LineChart } from "../../ui/LineChart";
import { useGcWorkspace } from "../../generalChem/useGcWorkspace";
import { QuizPanel, StepControls } from "../../biology/bioShared";
import { useStepPlayer } from "../../biology/bioHooks";
import { LaneDiagram } from "./LaneDiagram";
import { AssumptionsPanel, ChallengePanel, LedgerTable, MetaboliteCard, ReactionCard, RegulationPanel, ScrollBox } from "./shared";
import { SIGN } from "./format";
import { GLYCOLYSIS, ENZYMES_BY_ID } from "../../../utils/biochem/metabolism/network";
import { cumulativeCarriers, formatEquation, glycolysisAtpBreakdown, pathwayNet } from "../../../utils/biochem/metabolism/ledger";
import { NORMAL_SIGNALS } from "../../../utils/biochem/metabolism/regulation";
import { glycolysisChallenges, glycolysisQuestions } from "../../../utils/biochem/metabolism/learning";
import {
  DEFAULT_GLYCOLYSIS_INPUTS, CONVENTION, GLYCOLYSIS_ENGINE_VERSION, GLYCOLYSIS_VIEWS, METABOLIC_ASSUMPTIONS, describeGlycolysisAnalysis, summarizeGlycolysis, validateGlycolysisInputs, type GlycolysisInputs, type GlycolysisView,
} from "../../../utils/persistence/biochemTools18";
import { validateBiologyResults } from "../../../utils/persistence/biologyTools";
import "../../../styles/biochemistry.css";

type Props = { openRequest?: { id: string; recordId: string } | null; onOpenHandled?: (requestId: string) => void };
const VIEW_LABEL: Record<GlycolysisView, string> = { pathway: "Pathway", energy: "Energy ledger", regulation: "Regulation" };
const stepId = (n: number) => (n >= 1 ? GLYCOLYSIS[n - 1].reaction.id : null);

export default function GlycolysisPage({ openRequest = null, onOpenHandled }: Props) {
  const ws = useGcWorkspace<GlycolysisInputs>({
    page: "glycolysis", engineVersion: GLYCOLYSIS_ENGINE_VERSION, defaults: DEFAULT_GLYCOLYSIS_INPUTS, validateInputs: validateGlycolysisInputs, validateResults: validateBiologyResults,
    summarize: summarizeGlycolysis, describe: describeGlycolysisAnalysis, fallbackName: "Glycolysis", openRequest, onOpenHandled,
  });
  const { raw, update } = ws;
  const set = (patch: Partial<GlycolysisInputs>) => update((c) => ({ ...c, ...patch }));
  const { mode, view, step } = raw;
  const [revealed, setRevealed] = useState(false);
  const [met, setMet] = useState<string | null>(null);
  const hide = mode === "practice" && !revealed;
  const setStep = (n: number) => update((c) => (c.step === n && c.selected === stepId(n) ? c : { ...c, step: n, selected: stepId(n) }));
  const player = useStepPlayer(step, 10, setStep);
  const shown = raw.selected ?? stepId(step);
  const questions = useMemo(() => glycolysisQuestions(step), [step]);
  const challenges = useMemo(() => glycolysisChallenges(), []);
  const b = glycolysisAtpBreakdown();
  const done = cumulativeCarriers("glycolysis", step);
  const doneNet = pathwayNet("glycolysis", "glucose", step);
  const series = useMemo(() => [{ id: "atp", label: "Cumulative ATP (net)", points: Array.from({ length: 11 }, (_, i) => ({ x: i, y: cumulativeCarriers("glycolysis", i).atp })) },
    { id: "nadh", label: "Cumulative NADH", points: Array.from({ length: 11 }, (_, i) => ({ x: i, y: cumulativeCarriers("glycolysis", i).nadh })), dash: "7 4", color: "#64748b" }], []);
  const invest = pathwayNet("glycolysis", "glucose", 5), payoff = (() => { const all = pathwayNet("glycolysis"); const o: Record<string, number> = {}; for (const k of new Set([...Object.keys(all), ...Object.keys(invest)])) o[k] = (all[k] ?? 0) - (invest[k] ?? 0); return o; })();

  return (
    <div className="gc-page ph-page bio-page bc-page">
      <ToolHeader
        group="Metabolism"
        title="Glycolysis"
        purpose="Follow glucose through the ten reactions of glycolysis in the cytosol: see which steps spend ATP, which make ATP and NADH, why one glucose gives two three-carbon units, and how ATP, AMP and fructose 2,6-bisphosphate steer PFK-1."
        evidence="model"
        steps={[
          { label: "Step through", detail: "Advance reaction by reaction or select any arrow." },
          { label: "Read the ledger", detail: "Investment, payoff and net energy carriers." },
          { label: "Change the signals", detail: "ATP, AMP and fructose 2,6-bisphosphate." },
        ]}
        aside={<Badge tone="neutral" title="Stoichiometry and qualitative regulation; no flux is computed">Qualitative regulation</Badge>}
      />
      {ws.chrome}
      <div className="gc-toolbar">
        <LearningModeSwitch mode={mode} modes={["explore", "practice", "challenge"]} onChange={(m) => { setRevealed(false); player.pause(); update((c) => ({ ...c, mode: m })); }} />
        {ws.actions}
      </div>
      {ws.saveFormEl}
      <div className="bc-views"><Segmented<GlycolysisView> label="View" onChange={(v) => { player.pause(); set({ view: v }); }} options={GLYCOLYSIS_VIEWS.map((v) => ({ id: v, label: VIEW_LABEL[v] }))} value={view} /></div>

      <div className="gc-layout">
        <Panel className="gc-inputs" subtitle="Move through the pathway or choose a reaction." title="Controls">
          {view !== "regulation" ? (
            <>
              <StepControls extra={mode === "practice" ? <button className="secondary-button" data-testid="reveal-labels" onClick={() => setRevealed((r) => !r)} type="button">{revealed ? "Hide labels" : "Reveal labels"}</button> : null} locked={mode === "challenge"} max={10} onStep={setStep} player={player} step={step} unit="Reaction" />
              <h3 className="mt-group">Reactions</h3>
              <ul className="mt-pathway-list" data-testid="reaction-list">
                {GLYCOLYSIS.map(({ reaction, role }) => (
                  <li key={reaction.id}><button aria-pressed={shown === reaction.id} onClick={() => set({ selected: reaction.id })} type="button">{role.step}. {hide ? "?" : ENZYMES_BY_ID[reaction.enzyme].short}</button></li>
                ))}
              </ul>
            </>
          ) : <p className="ph-note">Set the signals, then read the effect on each enzyme. Directions are relative to the all-normal reference state.</p>}
          <Callout tone="info" title="Bookkeeping convention"><p>{CONVENTION}</p></Callout>
        </Panel>

        <div className="gc-stage">
          {view === "pathway" ? (
            <>
              <div aria-live="polite" className="mt-caption" data-testid="step-caption">
                <h3>{step === 0 ? "Glucose (C6) in the cytosol" : `After reaction ${step} of 10`}</h3>
                <p>{step === 0 ? "Nothing has happened yet. Glucose must be phosphorylated before it can be processed." : hide ? "Names are hidden: use the diagram, then Reveal labels." : GLYCOLYSIS[step - 1].reaction.purpose}</p>
                <p className="mt-chips"><span className="ph-note">Cumulative:</span> <span className="mt-chip mt-chip-none" data-testid="cum-atp">ATP {SIGN(done.atp)}</span> <span className="mt-chip mt-chip-none">NADH {SIGN(done.nadh)}</span></p>
              </div>
              <DiagramFrame caption={`Arrows are reactions of the shared network. Dashed arrows have not yet happened; ×2 means each step runs twice per glucose. ${b.invested} ATP are invested (hexokinase, PFK-1), ${b.produced} are made (PGK, pyruvate kinase).`} label="Glycolysis diagram" title="Glycolysis">
                <ScrollBox focusKey={shown}>
                  <LaneDiagram hideNames={hide} highlightMetabolite={met} onSelect={(id) => update((c) => ({ ...c, selected: id }))} onSelectMetabolite={setMet} selected={shown} step={step} view="glycolysis" />
                </ScrollBox>
              </DiagramFrame>
              {shown ? <ReactionCard hideNames={hide} onSelectMetabolite={setMet} pathway="glycolysis" reactionId={shown} /> : <Callout tone="info" title="Select a reaction"><p>Press Next, or choose an arrow or a name in the list, to see its enzyme, equation, structures and cofactors.</p></Callout>}
              {met ? <MetaboliteCard id={met} onSelectReaction={(id) => update((c) => ({ ...c, selected: id }))} /> : null}
              {mode === "explore" ? (
                <Panel title="Why does it behave this way?">
                  <Disclosure defaultOpen summary="Why spend ATP to get ATP?"><p>Phosphorylating glucose twice (steps 1 and 3) traps it in the cell and makes the sugar splittable into two C3 phosphates. In the payoff phase each C3 unit yields 2 ATP, so {b.produced} ATP are made but only {b.net} remain after repaying the {b.invested} invested.</p></Disclosure>
                  <Disclosure summary="Why does one glucose give two trioses?"><p>Aldolase cleaves fructose 1,6-bisphosphate into DHAP and glyceraldehyde 3-phosphate; triose phosphate isomerase converts DHAP into a second glyceraldehyde 3-phosphate. Reactions 6 to 10 therefore happen twice per glucose.</p></Disclosure>
                  <Disclosure summary="Why are three steps marked irreversible?"><p>Hexokinase, PFK-1 and pyruvate kinase have large negative free-energy changes in cells. They are the main sites of regulation and the steps that gluconeogenesis must bypass.</p></Disclosure>
                </Panel>
              ) : null}
            </>
          ) : null}

          {view === "energy" ? (
            <>
              <KeyFigures items={[
                { label: "ATP invested", value: String(b.invested), note: "hexokinase + PFK-1" },
                { label: "ATP made (gross)", value: String(b.produced), note: "2 per triose: PGK + PK" },
                { label: "ATP net", value: String(b.net), note: "per glucose" },
                { label: "NADH", value: String(done.nadh), note: step === 10 ? "per glucose" : `after reaction ${step}` },
              ]} />
              <StepControls locked={mode === "challenge"} max={10} onStep={setStep} player={player} step={step} unit="Reaction" />
              <DiagramFrame caption="Cumulative net ATP falls to −2 during the investment phase, returns to 0 at phosphoglycerate kinase and ends at +2. NADH appears at glyceraldehyde-3-phosphate dehydrogenase." label="Energy ledger chart" title="Where the ATP goes">
                <LineChart current={{ x: step, y: done.atp }} formatX={(x) => String(Math.round(x))} formatY={(y) => y.toFixed(0)} series={series} title="Cumulative carriers" valueText={`After reaction ${step}: ATP ${done.atp}, NADH ${done.nadh}`} xDomain={[0, 10]} xLabel="Reactions completed" xStep={1} yDomain={[-3, 3]} yLabel="Cumulative carriers per glucose" yTickStep={1} onXChange={(x) => setStep(Math.max(0, Math.min(10, Math.round(x))))} />
              </DiagramFrame>
              <div className="bc-two">
                <LedgerTable caption="Investment phase (reactions 1 to 5)" net={invest} />
                <LedgerTable caption="Payoff phase (reactions 6 to 10, two trioses)" net={payoff} />
              </div>
              <LedgerTable caption={`Net so far (${step} of 10 reactions)`} net={doneNet} />
              <Panel subtitle="Per glucose, all ten reactions." title="Net equation">
                <p className="mt-eq" data-testid="net-equation">{formatEquation(pathwayNet("glycolysis"))}</p>
                <p className="ph-note">Written in the neutral-acid bookkeeping convention; at cellular pH the protons and water are accounted differently but the carbon, phosphate and electron accounting is the same.</p>
                <p>Four ATP are made, but two were spent, so the net is two ATP. Substrate-level phosphorylation (a phosphoryl group moves from a high-energy intermediate straight to ADP) happens at PGK and pyruvate kinase.</p>
              </Panel>
            </>
          ) : null}

          {view === "regulation" ? (
            <>
              <RegulationPanel enzymeIds={["hk", "pfk1", "pk"]} onChange={(s) => set({ signals: s })} signalIds={["atp", "amp", "f26bp", "g6p"]} signals={raw.signals} />
              <Callout tone="info" title="Direct versus indirect">
                <p>ATP, AMP, fructose 2,6-bisphosphate and G6P bind the enzymes directly (allosteric or product feedback). Hormonal effects such as insulin raising fructose 2,6-bisphosphate in liver are indirect and are represented only through that signal. Muscle and liver differ; this is a teaching model, not a flux prediction.</p>
              </Callout>
            </>
          ) : null}

          {mode === "practice" ? <QuizPanel questions={questions} /> : null}
          {mode === "challenge" ? (
            <ChallengePanel items={challenges} index={raw.challenge} onNext={() => set({ challenge: raw.challenge + 1 })} onReveal={(p) => set({ signals: { ...NORMAL_SIGNALS, ...p.signals }, view: p.view })} />
          ) : null}
          <AssumptionsPanel items={METABOLIC_ASSUMPTIONS} />
          <ProvenancePanel topics={["glycolysis","regulation"]} />
        </div>
      </div>
    </div>
  );
}
