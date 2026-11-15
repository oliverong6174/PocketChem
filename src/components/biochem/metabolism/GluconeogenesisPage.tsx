import { useMemo, useState } from "react";
import { ProvenancePanel } from "./ProvenancePanel";
import { LearningModeSwitch } from "../../ui/LearningModeSwitch";
import { Badge, Callout, DiagramFrame, Disclosure, KeyFigures, Panel, Segmented, ToolHeader } from "../../ui/primitives";
import { useGcWorkspace } from "../../generalChem/useGcWorkspace";
import { QuizPanel, StepControls } from "../../biology/bioShared";
import { useStepPlayer } from "../../biology/bioHooks";
import { LaneDiagram, type LaneView } from "./LaneDiagram";
import { AssumptionsPanel, ChallengePanel, LedgerTable, MetaboliteCard, ReactionCard, RegulationPanel, TendencyBadge, ScrollBox } from "./shared";
import { SIGN } from "./format";
import { ENZYMES_BY_ID, GLUCONEOGENESIS, GLYCOLYSIS } from "../../../utils/biochem/metabolism/network";
import { cumulativeCarriers, formatEquation, pathwayNet, carriersOf } from "../../../utils/biochem/metabolism/ledger";
import { gluconeogenesisChallenges, gluconeogenesisQuestions } from "../../../utils/biochem/metabolism/learning";
import { NORMAL_SIGNALS, REG_SCENARIOS, REG_SCENARIOS_BY_ID, SUBSTRATE_CYCLES, VERDICT_TEXT, comparePathways, signalsFor, substrateCycleCost, type CycleId } from "../../../utils/biochem/metabolism/regulation";
import { cycleNet } from "../../../utils/biochem/metabolism/ledger";
import {
  DEFAULT_GLUCONEOGENESIS_INPUTS, GLUCONEOGENESIS_ENGINE_VERSION, GNG_VIEWS, METABOLIC_ASSUMPTIONS, describeGluconeogenesisAnalysis, summarizeGluconeogenesis, validateGluconeogenesisInputs, type GluconeogenesisInputs, type GngView,
} from "../../../utils/persistence/biochemTools18";
import { validateBiologyResults } from "../../../utils/persistence/biologyTools";
import "../../../styles/biochemistry.css";

type Props = { openRequest?: { id: string; recordId: string } | null; onOpenHandled?: (requestId: string) => void };
const VIEW_LABEL: Record<GngView, string> = { pathway: "Pathway", compare: "Compare with glycolysis", regulation: "Regulation" };
const stepId = (n: number) => (n >= 1 ? GLUCONEOGENESIS[n - 1].reaction.id : null);

export default function GluconeogenesisPage({ openRequest = null, onOpenHandled }: Props) {
  const ws = useGcWorkspace<GluconeogenesisInputs>({
    page: "gluconeogenesis", engineVersion: GLUCONEOGENESIS_ENGINE_VERSION, defaults: DEFAULT_GLUCONEOGENESIS_INPUTS, validateInputs: validateGluconeogenesisInputs, validateResults: validateBiologyResults,
    summarize: summarizeGluconeogenesis, describe: describeGluconeogenesisAnalysis, fallbackName: "Gluconeogenesis", openRequest, onOpenHandled,
  });
  const { raw, update } = ws;
  const set = (patch: Partial<GluconeogenesisInputs>) => update((c) => ({ ...c, ...patch }));
  const { mode, view, step } = raw;
  const [revealed, setRevealed] = useState(false);
  const [met, setMet] = useState<string | null>(null);
  const hide = mode === "practice" && !revealed;
  const setStep = (n: number) => update((c) => (c.step === n && c.selected === stepId(n) ? c : { ...c, step: n, selected: stepId(n) }));
  const player = useStepPlayer(step, 14, setStep);
  const shown = raw.selected ?? stepId(step);
  const questions = useMemo(() => gluconeogenesisQuestions(), []);
  const challenges = useMemo(() => gluconeogenesisChallenges(), []);
  const net = pathwayNet("gluconeogenesis"), c = carriersOf(net), g = carriersOf(pathwayNet("glycolysis"));
  const done = cumulativeCarriers("gluconeogenesis", step);
  const cmp = comparePathways(raw.signals);
  const cycleCost = substrateCycleCost(raw.cycle);
  const cycle = SUBSTRATE_CYCLES.find((x) => x.id === raw.cycle)!;
  const presetSignals = signalsFor(raw.scenario);
  const edited = Object.keys(presetSignals).some((k) => presetSignals[k as keyof typeof presetSignals] !== raw.signals[k as keyof typeof presetSignals]);
  const laneView: LaneView = view === "compare" ? "compare" : "gluconeogenesis";
  const bypass = [
    { glyc: "HK", gng: ["G6PASE"], note: "Hydrolysis of G6P to glucose and Pi (ER lumen); no ATP made." },
    { glyc: "PFK1", gng: ["FBP1"], note: "Hydrolysis of F1,6BP to F6P and Pi; no ATP made." },
    { glyc: "PK", gng: ["PC", "PEPCK"], note: "Carboxylation (1 ATP) then decarboxylative phosphorylation (1 GTP) via oxaloacetate." },
  ];

  return (
    <div className="gc-page ph-page bio-page bc-page">
      <ToolHeader
        group="Metabolism"
        title="Gluconeogenesis"
        purpose="Build glucose from pyruvate: which glycolytic reactions are reused in reverse, which three irreversible steps need different enzymes (bypasses), what it costs in ATP, GTP and NADH, and how reciprocal regulation limits futile cycling."
        evidence="model"
        steps={[
          { label: "Follow the route", detail: "Mitochondrial matrix, cytosol, ER lumen." },
          { label: "Compare lanes", detail: "Shared steps versus bypasses." },
          { label: "Change the scenario", detail: "Fed-like, fasting-like, energy and acetyl-CoA signals." },
        ]}
        aside={<Badge tone="neutral" title="Stoichiometry and qualitative regulation; no flux is computed">Qualitative regulation</Badge>}
      />
      {ws.chrome}
      <div className="gc-toolbar">
        <LearningModeSwitch mode={mode} modes={["explore", "practice", "challenge"]} onChange={(m) => { setRevealed(false); player.pause(); update((cur) => ({ ...cur, mode: m })); }} />
        {ws.actions}
      </div>
      {ws.saveFormEl}
      <div className="bc-views"><Segmented<GngView> label="View" onChange={(v) => { player.pause(); set({ view: v }); }} options={GNG_VIEWS.map((v) => ({ id: v, label: VIEW_LABEL[v] }))} value={view} /></div>

      <div className="gc-layout">
        <Panel className="gc-inputs" subtitle="Move through the pathway or choose a reaction." title="Controls">
          {view === "pathway" ? (
            <>
              <StepControls extra={mode === "practice" ? <button className="secondary-button" data-testid="reveal-labels" onClick={() => setRevealed((r) => !r)} type="button">{revealed ? "Hide labels" : "Reveal labels"}</button> : null} locked={mode === "challenge"} max={14} onStep={setStep} player={player} step={step} unit="Reaction" />
              <h3 className="mt-group">Reactions</h3>
              <ul className="mt-pathway-list" data-testid="reaction-list">
                {GLUCONEOGENESIS.map(({ reaction, role }) => (
                  <li key={reaction.id}><button aria-pressed={shown === reaction.id} onClick={() => set({ selected: reaction.id })} type="button">{role.step}. {hide ? "?" : ENZYMES_BY_ID[reaction.enzyme].short}</button></li>
                ))}
              </ul>
            </>
          ) : null}
          {view === "compare" ? (
            <>
              <p className="ph-note">Left lane (amber): glycolysis only. Right lane (violet): gluconeogenic bypasses. Teal arrows with two heads: reactions both pathways share, run in opposite directions.</p>
              <Segmented<CycleId> label="Substrate cycle" onChange={(v) => set({ cycle: v })} options={SUBSTRATE_CYCLES.map((x) => ({ id: x.id, label: x.id === "f6p-f16bp" ? "PFK-1 / FBPase-1" : x.id === "glc-g6p" ? "HK / G6Pase" : "PK / PC + PEPCK" }))} value={raw.cycle} />
            </>
          ) : null}
          {view === "regulation" ? (
            <Segmented<string> label="Scenario" onChange={(id) => set({ scenario: id, signals: signalsFor(id) })} options={REG_SCENARIOS.map((s) => ({ id: s.id, label: s.title }))} value={raw.scenario} />
          ) : null}
          <Callout tone="info" title="Not glycolysis backward"><p>Hexokinase, PFK-1 and pyruvate kinase are effectively irreversible. Different reactions (hydrolysis or carboxylation coupled to ATP/GTP) climb back, so each direction can be regulated separately.</p></Callout>
        </Panel>

        <div className="gc-stage">
          {view === "pathway" ? (
            <>
              <div aria-live="polite" className="mt-caption" data-testid="step-caption">
                <h3>{step === 0 ? "Start: pyruvate (C3) in the cytosol" : `After reaction ${step} of 14`}</h3>
                <p>{step === 0 ? "Pyruvate enters the mitochondrial matrix on the pyruvate carrier. Two pyruvate molecules are needed for one glucose." : hide ? "Names are hidden: use the diagram, then Reveal labels." : GLUCONEOGENESIS[step - 1].reaction.purpose}</p>
                <p className="mt-chips"><span className="ph-note">Cumulative:</span> <span className="mt-chip mt-chip-none" data-testid="cum-atp">ATP {SIGN(done.atp)}</span> <span className="mt-chip mt-chip-none">GTP {SIGN(done.gtp)}</span> <span className="mt-chip mt-chip-none">NADH {SIGN(done.nadh)}</span></p>
              </div>
              <DiagramFrame caption="Violet arrows are gluconeogenic bypasses; teal arrows are glycolytic reactions run in reverse. The cytosolic/matrix split and the ER step are labelled. Each step below pyruvate runs twice per glucose." label="Gluconeogenesis diagram" title="Gluconeogenesis">
                <ScrollBox focusKey={shown}>
                  <LaneDiagram hideNames={hide} highlightMetabolite={met} onSelect={(id) => update((cur) => ({ ...cur, selected: id }))} onSelectMetabolite={setMet} selected={shown} step={step} view={laneView} />
                </ScrollBox>
              </DiagramFrame>
              {shown ? <ReactionCard hideNames={hide} onSelectMetabolite={setMet} pathway="gluconeogenesis" reactionId={shown} /> : <Callout tone="info" title="Select a reaction"><p>Press Next, or choose an arrow or a name in the list.</p></Callout>}
              {met ? <MetaboliteCard id={met} onSelectReaction={(id) => update((cur) => ({ ...cur, selected: id }))} /> : null}
              <Panel subtitle="Two pyruvate → one glucose." title="Energy accounting">
                <KeyFigures items={[
                  { label: "ATP consumed", value: String(-c.atp), note: "2 at pyruvate carboxylase, 2 at PGK (reverse)" },
                  { label: "GTP consumed", value: String(-c.gtp), note: "2 at PEPCK" },
                  { label: "NADH consumed", value: String(-c.nadh), note: "2 at GAPDH (reverse)" },
                ]} />
                <p className="mt-eq" data-testid="net-equation">{formatEquation(net)}</p>
                <LedgerTable caption="Net per glucose synthesized" net={net} />
                <Disclosure summary="Assumptions in this accounting">
                  <ul className="gc-assumptions">
                    <li>Starting from pyruvate (not lactate or amino acids): the two NADH needed by glyceraldehyde-3-phosphate dehydrogenase (reverse) come, via the malate shuttle, from reducing oxaloacetate in the matrix; the two NADH made by cytosolic malate dehydrogenase pay for the GAPDH step, so the net consumption shown is 2.</li>
                    <li>CO₂ added by pyruvate carboxylase is released again by PEPCK; water and H⁺ counts depend on the CO₂/bicarbonate and neutral-acid conventions.</li>
                    <li>Gluconeogenic yield is tissue-specific: G6Pase is mainly in liver, kidney cortex and intestine.</li>
                  </ul>
                </Disclosure>
              </Panel>
              {mode === "explore" ? (
                <Panel title="Why does it behave this way?">
                  <Disclosure defaultOpen summary="Why must oxaloacetate travel as malate?"><p>The inner mitochondrial membrane has no oxaloacetate carrier. Malate dehydrogenase reduces oxaloacetate to malate in the matrix (using NADH), malate crosses the membrane, and cytosolic malate dehydrogenase regenerates oxaloacetate and NADH.</p></Disclosure>
                  <Disclosure summary="Why does PEPCK release the CO₂ that pyruvate carboxylase added?"><p>Carboxylation uses ATP to make a high-energy C4 compound; its decarboxylation, coupled to GTP, then drives phosphoenolpyruvate formation, a reaction that cannot be driven directly from pyruvate.</p></Disclosure>
                </Panel>
              ) : null}
            </>
          ) : null}

          {view === "compare" ? (
            <>
              <DiagramFrame caption="Amber: glycolysis-specific enzymes. Violet: gluconeogenic bypass enzymes. Teal: shared reversible reactions (arrows at both ends)." label="Glycolysis and gluconeogenesis compared" title="Side by side">
                <ScrollBox focusKey={raw.selected}><LaneDiagram hideNames={hide} highlightMetabolite={met} onSelect={(id) => update((cur) => ({ ...cur, selected: id }))} onSelectMetabolite={setMet} selected={raw.selected} step={0} view="compare" /></ScrollBox>
                <ul className="mt-legend" aria-label="Legend"><li><i style={{ color: "#b45309" }} />Glycolysis-specific</li><li><i style={{ color: "#6d28d9" }} />Gluconeogenic bypass</li><li><i style={{ color: "#0f766e" }} />Shared reversible</li></ul>
              </DiagramFrame>
              {raw.selected ? <ReactionCard hideNames={false} onSelectMetabolite={setMet} pathway={GLYCOLYSIS.some((x) => x.reaction.id === raw.selected) ? "glycolysis" : "gluconeogenesis"} reactionId={raw.selected} /> : null}
              <Panel subtitle="The three irreversible glycolytic reactions and their gluconeogenic bypasses." title="Bypasses">
                <table className="bc-table" data-testid="bypass-table">
                  <thead><tr><th scope="col">Glycolysis</th><th scope="col">Gluconeogenic bypass</th><th scope="col">Chemistry</th></tr></thead>
                  <tbody>{bypass.map((b) => (
                    <tr key={b.glyc}><th scope="row">{ENZYMES_BY_ID[b.glyc === "HK" ? "hk" : b.glyc === "PFK1" ? "pfk1" : "pk"].short}</th><td>{b.gng.map((id) => ENZYMES_BY_ID[id === "G6PASE" ? "g6pase" : id === "FBP1" ? "fbpase1" : id === "PC" ? "pc" : "pepck"].short).join(" + ")}</td><td>{b.note}</td></tr>
                  ))}</tbody>
                </table>
              </Panel>
              <Panel subtitle="Per glucose." title="Energy: generating versus consuming">
                <div className="bc-two">
                  <div className="mt-card"><h3>Glycolysis</h3><p>Net <strong>+{g.ntpEquivalents} ATP</strong> and +{g.nadh} NADH.</p></div>
                  <div className="mt-card"><h3>Gluconeogenesis</h3><p>Net <strong>−{-c.ntpEquivalents} NTP</strong> ({-c.atp} ATP + {-c.gtp} GTP) and −{-c.nadh} NADH.</p></div>
                </div>
                <p className="ph-note">Running both without regulation would waste ATP: each substrate cycle below hydrolyses one nucleoside triphosphate per turn.</p>
              </Panel>
              <Panel subtitle="Futile (substrate) cycling, from the same stoichiometry." title="What if both directions ran at once?">
                <p><strong>{cycle.title}</strong></p>
                <p className="mt-eq" data-testid="cycle-equation">{formatEquation(cycleNet(cycle.steps.map((s) => ({ id: s.id }))))}</p>
                <p data-testid="cycle-cost">Net cost per cycle: {cycleCost.ntpHydrolysed} nucleoside triphosphate hydrolysed, released as heat. Reciprocal regulation (fructose 2,6-bisphosphate, AMP, acetyl-CoA) keeps the opposing enzymes from both being fully active; the cycle is not always zero in real cells (it contributes to heat and fine control), so glycolysis and gluconeogenesis are not mutually exclusive in every cell or condition.</p>
              </Panel>
            </>
          ) : null}

          {view === "regulation" ? (
            <>
              <Panel subtitle={REG_SCENARIOS_BY_ID[raw.scenario].title + (edited ? " (signals edited)" : "")} title="Scenario">
                <p>{REG_SCENARIOS_BY_ID[raw.scenario].text}</p>
                <Callout tone="warn" title="Isolated pathway, not a tissue"><p>{REG_SCENARIOS_BY_ID[raw.scenario].caveat}</p></Callout>
              </Panel>
              <Panel title="Glycolytic versus gluconeogenic control points">
                <div className="bc-two" data-testid="verdict">
                  <div className="mt-card"><h3>Glycolysis (HK, PFK-1, PK)</h3><TendencyBadge tendency={cmp.glycolysis} /></div>
                  <div className="mt-card"><h3>Gluconeogenesis (FBPase-1, PC)</h3><TendencyBadge tendency={cmp.gluconeogenesis} /></div>
                </div>
                <p data-testid="verdict-text"><strong>{VERDICT_TEXT[cmp.verdict]}</strong></p>
                <p className="ph-note">This reports the direction of curated regulatory signals only. It does not predict flux, and it does not mean the opposing pathway is off.</p>
              </Panel>
              <RegulationPanel enzymeIds={["pfk1", "pk", "fbpase1", "pc"]} onChange={(s) => set({ signals: s })} signalIds={["atp", "amp", "f26bp", "acetylcoa"]} signals={raw.signals} />
            </>
          ) : null}

          {mode === "practice" ? <QuizPanel questions={questions} /> : null}
          {mode === "challenge" ? (
            <ChallengePanel items={challenges} index={raw.challenge} onNext={() => set({ challenge: raw.challenge + 1 })} onReveal={(p) => set({ scenario: p.scenario, signals: { ...NORMAL_SIGNALS, ...signalsFor(p.scenario) }, view: p.view })} />
          ) : null}
          <AssumptionsPanel items={METABOLIC_ASSUMPTIONS} />
          <ProvenancePanel topics={["gluconeogenesis","regulation"]} />
        </div>
      </div>
    </div>
  );
}
