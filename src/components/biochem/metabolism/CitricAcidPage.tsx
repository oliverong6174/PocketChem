import { useMemo, useState } from "react";
import { LearningModeSwitch } from "../../ui/LearningModeSwitch";
import { Badge, Callout, DiagramFrame, Disclosure, KeyFigures, Panel, Segmented, ToolHeader } from "../../ui/primitives";
import { useGcWorkspace } from "../../generalChem/useGcWorkspace";
import { PredictPanel, QuizPanel, StepControls } from "../../biology/bioShared";
import { useStepPlayer } from "../../biology/bioHooks";
import { CycleDiagram } from "./CycleDiagram";
import { AssumptionsPanel, LedgerTable, MetaboliteCard, ReactionCard, RegulationPanel, ScrollBox } from "./shared";
import { ENZYMES_BY_ID, METABOLITES_BY_ID, PDH_MECHANISM, TCA } from "../../../utils/biochem/metabolism/network";
import { carriersOf, formatEquation, pathwayNet, type Net } from "../../../utils/biochem/metabolism/ledger";
import { mc, tcaPredictions, tcaQuestions } from "../../../utils/biochem/metabolism/learning";
import {
  DEFAULT_TCA_INPUTS, METABOLIC_ASSUMPTIONS, TCA_ENGINE_VERSION, TCA_VIEWS, describeTcaAnalysis, summarizeTca, validateTcaInputs, type TcaInputs, type TcaView,
} from "../../../utils/persistence/biochemTools18";
import { validateBiologyResults } from "../../../utils/persistence/biologyTools";
import "../../../styles/biochemistry.css";

type Props = { openRequest?: { id: string; recordId: string } | null; onOpenHandled?: (requestId: string) => void };
const VIEW_LABEL: Record<TcaView, string> = { pdh: "Pyruvate oxidation", cycle: "Citric acid cycle", energy: "Carbons and carriers" };
const scale = (net: Net, k: number): Net => Object.fromEntries(Object.entries(net).map(([a, v]) => [a, v * k]));
const INK = "#0f172a", MUTED = "#475569";

/** The three enzymes of the pyruvate dehydrogenase complex and the five stages of the reaction. */
function PdhDiagram({ stage }: { stage: number }) {
  const box = (x: number, w: number, label: string, sub: string, active: boolean) => (
    <g>
      <rect fill={active ? "#fef3c7" : "#f1f5f9"} height={78} rx={10} stroke={active ? "#b45309" : "#94a3b8"} strokeWidth={active ? 3 : 1.5} width={w} x={x} y={110} />
      <text fill={INK} fontSize={13} fontWeight={700} textAnchor="middle" x={x + w / 2} y={138}>{label}</text>
      <text fill={MUTED} fontSize={11} textAnchor="middle" x={x + w / 2} y={158}>{sub}</text>
    </g>
  );
  const carbons = PDH_MECHANISM[stage].carbons;
  return (
    <svg aria-label={`Pyruvate dehydrogenase complex, stage ${stage} of 5`} className="mt-svg" data-testid="pdh-diagram" role="group" style={{ minWidth: 520 }} viewBox="0 0 640 300">
      <title>Pyruvate dehydrogenase complex</title>
      <rect fill="#fff" height={300} width={640} />
      <text fill={MUTED} fontSize={11} x={12} y={20}>Mitochondrial matrix</text>
      {box(30, 170, "E1", "pyruvate dehydrogenase · TPP", stage === 1 || stage === 2)}
      {box(235, 170, "E2", "transacetylase · lipoamide, CoA", stage === 2 || stage === 3)}
      {box(440, 170, "E3", "dihydrolipoyl DH · FAD, NAD⁺", stage === 4 || stage === 5)}
      <path d="M 200 149 H 233" fill="none" stroke="#475569" strokeWidth={2} />
      <path d="M 405 149 H 438" fill="none" stroke="#475569" strokeWidth={2} />
      <g fontSize={12} fontWeight={700}>
        <text fill={stage === 0 ? "#0e7490" : MUTED} x={30} y={96}>Pyruvate (C3) →</text>
        {stage >= 1 ? <text fill="#9a3412" x={120} y={78}>CO₂ ↑ (C1 lost)</text> : null}
        {stage >= 3 ? <text fill="#166534" x={250} y={216}>Acetyl-CoA (C2) ↓</text> : null}
        {stage >= 5 ? <text fill="#166534" x={450} y={216}>NADH + H⁺ ↓</text> : null}
      </g>
      <text fill={INK} fontSize={13} fontWeight={700} x={30} y={262}>Carbon bookkeeping: pyruvate C3 → acetyl group C{carbons}{stage >= 1 ? " + CO₂ C1" : ""}</text>
      <text fill={MUTED} fontSize={11} x={30} y={282}>Five coenzymes: TPP, lipoamide, CoA, FAD, NAD⁺. Acetyl-CoA then enters the cycle.</text>
    </svg>
  );
}

export default function CitricAcidPage({ openRequest = null, onOpenHandled }: Props) {
  const ws = useGcWorkspace<TcaInputs>({
    page: "tca", engineVersion: TCA_ENGINE_VERSION, defaults: DEFAULT_TCA_INPUTS, validateInputs: validateTcaInputs, validateResults: validateBiologyResults,
    summarize: summarizeTca, describe: describeTcaAnalysis, fallbackName: "Pyruvate oxidation & citric acid cycle", openRequest, onOpenHandled,
  });
  const { raw, update } = ws;
  const set = (patch: Partial<TcaInputs>) => update((c) => ({ ...c, ...patch }));
  const { mode, view, step, turns } = raw;
  const [revealed, setRevealed] = useState(false);
  const [met, setMet] = useState<string | null>(null);
  const hide = mode === "practice" && !revealed;
  const maxStep = turns * 8;
  const inTurn = step === 0 ? 0 : ((step - 1) % 8) + 1, turnNo = step === 0 ? 0 : Math.floor((step - 1) / 8) + 1;
  const cycleId = (n: number) => (n >= 1 ? TCA[((n - 1) % 8)].reaction.id : null);
  const setStep = (n: number) => update((c) => (c.step === n && c.selected === cycleId(n) ? c : { ...c, step: n, selected: cycleId(n) }));
  const player = useStepPlayer(step, maxStep, setStep);
  const setPdh = (n: number) => update((c) => (c.pdhStep === n ? c : { ...c, pdhStep: n }));
  const pdhPlayer = useStepPlayer(raw.pdhStep, 5, setPdh);
  const shown = raw.selected ?? cycleId(step);
  const questions = useMemo(() => tcaQuestions(), []);
  const predictions = useMemo(() => tcaPredictions(), []);
  const turnNet = pathwayNet("tca", "event");
  const t = carriersOf(turnNet), p = carriersOf(pathwayNet("pyruvate-oxidation", "event"));
  // carriers released so far in the displayed turn(s)
  const soFar = useMemo(() => {
    const full = Math.floor(step / 8), part = step % 8;
    const n: Net = {};
    const add = (net: Net, k: number) => { for (const [a, v] of Object.entries(net)) n[a] = (n[a] ?? 0) + v * k; };
    add(pathwayNet("tca", "event"), full);
    if (part) add(pathwayNet("tca", "event", part), 1);
    return carriersOf(n);
  }, [step]);
  const firstQ = mc(`tca-first-${step}`, step === 0 ? "Acetyl-CoA (C2) is about to join oxaloacetate (C4). Which enzyme catalyzes this first reaction?" : "Oxaloacetate has been regenerated. Which enzyme catalyzes the first reaction of the next turn?", ENZYMES_BY_ID.cs.short, [ENZYMES_BY_ID.aco.short, ENZYMES_BY_ID.idh.short, ENZYMES_BY_ID["mdh-m"].short], TCA[0].reaction.purpose);
  const nextQ = mode === "challenge" && step < maxStep ? (inTurn === 0 || inTurn === 8 ? firstQ : predictions[inTurn - 1]) : null;
  const pdhNet = carriersOf(pathwayNet("pyruvate-oxidation"));
  const glucoseTca = carriersOf(pathwayNet("tca"));

  return (
    <div className="gc-page ph-page bio-page bc-page">
      <ToolHeader
        group="Metabolism"
        title="Pyruvate oxidation & citric acid cycle"
        purpose="Pyruvate becomes acetyl-CoA, and the eight reactions of the cycle oxidize its two carbons to CO₂ while regenerating oxaloacetate and reducing NAD⁺ and FAD. Count the carbons and the carriers per turn and per glucose without double counting."
        evidence="model"
        steps={[
          { label: "Start with pyruvate", detail: "The pyruvate dehydrogenase complex." },
          { label: "Turn the cycle", detail: "Advance one or two turns." },
          { label: "Check the carriers", detail: "NADH, FADH₂, GTP and CO₂." },
        ]}
        aside={<Badge tone="neutral" title="Stoichiometry and qualitative regulation; no flux is computed">Qualitative regulation</Badge>}
      />
      {ws.chrome}
      <div className="gc-toolbar">
        <LearningModeSwitch mode={mode} modes={["explore", "practice", "challenge"]} onChange={(m) => { setRevealed(false); player.pause(); pdhPlayer.pause(); update((c) => ({ ...c, mode: m })); }} />
        {ws.actions}
      </div>
      {ws.saveFormEl}
      <div className="bc-views"><Segmented<TcaView> label="View" onChange={(v) => { player.pause(); pdhPlayer.pause(); set({ view: v }); }} options={TCA_VIEWS.map((v) => ({ id: v, label: VIEW_LABEL[v] }))} value={view} /></div>

      <div className="gc-layout">
        <Panel className="gc-inputs" subtitle="Move through the reaction or choose a step." title="Controls">
          {view === "pdh" ? (
            <StepControls locked={mode === "challenge"} max={5} onStep={setPdh} player={pdhPlayer} step={raw.pdhStep} unit="Stage" />
          ) : view === "cycle" ? (
            <>
              <Segmented<"1" | "2"> label="Turns to follow" onChange={(v) => update((c) => ({ ...c, turns: Number(v) as 1 | 2, step: Math.min(c.step, Number(v) * 8) }))} options={[{ id: "1", label: "One turn (one acetyl-CoA)" }, { id: "2", label: "Two turns (one glucose)" }]} value={String(turns) as "1" | "2"} />
              <StepControls extra={mode === "practice" ? <button className="secondary-button" data-testid="reveal-labels" onClick={() => setRevealed((r) => !r)} type="button">{revealed ? "Hide labels" : "Reveal labels"}</button> : null} locked={mode === "challenge"} max={maxStep} onStep={setStep} player={player} step={step} unit="Reaction" />
              <h3 className="mt-group">Reactions</h3>
              <ul className="mt-pathway-list" data-testid="reaction-list">
                {TCA.map(({ reaction, role }) => (
                  <li key={reaction.id}><button aria-pressed={shown === reaction.id} onClick={() => set({ selected: reaction.id })} type="button">{role.step}. {hide ? "?" : ENZYMES_BY_ID[reaction.enzyme].short}</button></li>
                ))}
              </ul>
            </>
          ) : (
            <Segmented<"1" | "2"> label="Turns to total" onChange={(v) => set({ turns: Number(v) as 1 | 2, step: Math.min(raw.step, Number(v) * 8) })} options={[{ id: "1", label: "One turn" }, { id: "2", label: "Two turns" }]} value={String(turns) as "1" | "2"} />
          )}
          <Callout tone="info" title="Not the same output"><p>Pyruvate dehydrogenase makes 1 NADH and 1 CO₂ per pyruvate and is not part of the cycle. One turn of the cycle makes 3 NADH, 1 FADH₂, 1 GTP and 2 CO₂.</p></Callout>
        </Panel>

        <div className="gc-stage">
          {view === "pdh" ? (
            <>
              <div aria-live="polite" className="mt-caption" data-testid="step-caption">
                <h3>{PDH_MECHANISM[raw.pdhStep].title}</h3>
                <p>{PDH_MECHANISM[raw.pdhStep].text}</p>
              </div>
              <DiagramFrame caption="Pyruvate dehydrogenase complex (matrix): E1, E2 and E3 pass the acetyl group by lipoamide and move electrons from pyruvate to NAD⁺. Pyruvate (C3) becomes acetyl-CoA (C2) and CO₂ (C1)." label="Pyruvate dehydrogenase diagram" title="Pyruvate → acetyl-CoA">
                <ScrollBox><PdhDiagram stage={raw.pdhStep} /></ScrollBox>
              </DiagramFrame>
              <ReactionCard hideNames={false} onSelectMetabolite={setMet} pathway="pyruvate-oxidation" reactionId="PDH" />
              {met ? <MetaboliteCard id={met} onSelectReaction={(id) => set({ selected: id, view: "cycle" })} /> : null}
              <Panel subtitle="Curated, qualitative. The complex is controlled covalently (kinase / phosphatase) and by products." title="Regulation of pyruvate dehydrogenase">
                <RegulationPanel enzymeIds={["pdh"]} onChange={(s) => set({ signals: s })} signalIds={["acetylcoa", "nadh", "adp"]} signals={raw.signals} title="Signals" />
              </Panel>
              {mode === "explore" ? (
                <Panel title="Why does it behave this way?">
                  <Disclosure defaultOpen summary="What does it link?"><p>Glycolysis makes pyruvate in the cytosol; pyruvate crosses into the matrix, where this irreversible reaction makes acetyl-CoA. In animals acetyl-CoA cannot be converted back to pyruvate, so fatty acids cannot be turned into glucose.</p></Disclosure>
                  <Disclosure summary="Which parts are mitochondrial?"><p>The complex lives in the matrix of eukaryotic mitochondria (the bacterial equivalent is cytosolic), so pyruvate must first be transported across the inner membrane.</p></Disclosure>
                </Panel>
              ) : null}
            </>
          ) : null}

          {view === "cycle" ? (
            <>
              <div aria-live="polite" className="mt-caption" data-testid="step-caption">
                <h3>{step === 0 ? "Oxaloacetate (C4) waits for acetyl-CoA" : `Turn ${turnNo}, after reaction ${inTurn} of 8`}</h3>
                <p>{step === 0 ? "The cycle needs one oxaloacetate and one acetyl-CoA to begin." : hide ? "Names are hidden: use the diagram, then Reveal labels." : TCA[inTurn - 1].reaction.purpose}</p>
                <p className="mt-chips"><span className="ph-note">So far:</span> <span className="mt-chip mt-chip-none" data-testid="cum-nadh">NADH {soFar.nadh}</span> <span className="mt-chip mt-chip-none" data-testid="cum-fadh2">FADH₂ {soFar.fadh2}</span> <span className="mt-chip mt-chip-none" data-testid="cum-gtp">GTP {soFar.gtp}</span> <span className="mt-chip mt-chip-none" data-testid="cum-co2">CO₂ {soFar.co2}</span></p>
              </div>
              <DiagramFrame caption="Eight reactions form a ring: oxaloacetate is regenerated at the end of each turn. Numbers beside each metabolite are carbon COUNTS, not atom identities. Dashed arrows have not happened yet." label="Citric acid cycle diagram" title="Citric acid cycle">
                <ScrollBox focusKey={shown}><CycleDiagram hideNames={hide} highlightMetabolite={met} inTurn={inTurn} onSelect={(id) => update((c) => ({ ...c, selected: id }))} onSelectMetabolite={setMet} selected={shown} turnNo={turnNo} /></ScrollBox>
              </DiagramFrame>
              {shown ? <ReactionCard hideNames={hide} onSelectMetabolite={setMet} pathway="tca" reactionId={shown} /> : <Callout tone="info" title="Select a reaction"><p>Press Next, or choose an arrow or a name in the list.</p></Callout>}
              {met ? <MetaboliteCard id={met} onSelectReaction={(id) => set({ selected: id })} /> : null}
              <Panel subtitle="Qualitative regulatory checkpoints; the redox and energy signals that control the cycle." title="Regulation checkpoints">
                <RegulationPanel enzymeIds={["cs", "idh", "akgdh", "pdh"]} onChange={(s) => set({ signals: s })} signalIds={["atp", "adp", "nadh", "acetylcoa"]} signals={raw.signals} title="Energy and redox signals" />
                <p className="ph-note">Calcium and substrate availability also regulate the cycle in vivo and are not modelled. The cycle runs only where NAD⁺ and FAD can be regenerated, which in practice needs oxygen and the respiratory chain.</p>
              </Panel>
              {mode === "explore" ? (
                <Panel title="Why does it behave this way?">
                  <Disclosure defaultOpen summary="Are the two CO₂ released in turn 1 the two acetyl carbons?"><p>No. The count is conserved (2 carbons in as acetyl-CoA, 2 out as CO₂ per turn), but the CO₂ released in a turn comes from the oxaloacetate-derived carbons. The acetyl-derived carbons are released in later turns, and because succinate is symmetric they are scrambled between positions.</p></Disclosure>
                  <Disclosure summary="How is oxaloacetate regenerated?"><p>Malate dehydrogenase oxidizes malate to oxaloacetate (making the third NADH). The cycle intermediates are catalysts: their total does not change, while each turn oxidizes one acetyl group.</p></Disclosure>
                </Panel>
              ) : null}
            </>
          ) : null}

          {view === "energy" ? (
            <>
              <KeyFigures items={[
                { label: "NADH", value: String(t.nadh * turns), note: turns === 1 ? "per turn" : "two turns" },
                { label: "FADH₂", value: String(t.fadh2 * turns), note: turns === 1 ? "per turn" : "two turns" },
                { label: "GTP (ATP equivalent)", value: String(t.gtp * turns), note: "substrate-level" },
                { label: "CO₂", value: String(t.co2 * turns), note: turns === 1 ? "per turn" : "two turns" },
              ]} />
              <LedgerTable caption={`Cycle only: ${turns} turn${turns === 1 ? "" : "s"} (pyruvate oxidation excluded)`} net={scale(turnNet, turns)} />
              <Panel subtitle="One glucose: pyruvate oxidation happens twice and the cycle turns twice." title="Per glucose, without double counting">
                <table className="bc-table" data-testid="per-glucose-table">
                  <thead><tr><th scope="col">Source</th><th scope="col">NADH</th><th scope="col">FADH₂</th><th scope="col">GTP</th><th scope="col">CO₂</th></tr></thead>
                  <tbody>
                    <tr><th scope="row">Pyruvate oxidation (2 pyruvate)</th><td>{pdhNet.nadh}</td><td>{pdhNet.fadh2}</td><td>{pdhNet.gtp}</td><td>{pdhNet.co2}</td></tr>
                    <tr><th scope="row">Citric acid cycle (2 turns)</th><td>{glucoseTca.nadh}</td><td>{glucoseTca.fadh2}</td><td>{glucoseTca.gtp}</td><td>{glucoseTca.co2}</td></tr>
                    <tr><th scope="row">Total from the matrix</th><td data-testid="tot-nadh">{pdhNet.nadh + glucoseTca.nadh}</td><td>{pdhNet.fadh2 + glucoseTca.fadh2}</td><td>{pdhNet.gtp + glucoseTca.gtp}</td><td data-testid="tot-co2">{pdhNet.co2 + glucoseTca.co2}</td></tr>
                  </tbody>
                </table>
                <p className="ph-note">The 2 NADH of glycolysis are cytosolic and are counted in the glycolysis and integrated-map ledgers, not here.</p>
              </Panel>
              <Panel title="Carbon counts through the cycle">
                <table className="bc-table" data-testid="carbon-table">
                  <thead><tr><th scope="col">Metabolite</th><th scope="col">Carbons</th></tr></thead>
                  <tbody>
                    {["pyruvate", "acetylcoa", "oaa", "citrate", "isocitrate", "akg", "succoa", "succinate", "fumarate", "malate"].map((id) => <tr key={id}><th scope="row">{METABOLITES_BY_ID[id].name}</th><td>{id === "acetylcoa" ? "2 (acetyl)" : id === "succoa" ? "4 (succinyl)" : METABOLITES_BY_ID[id].carbons}</td></tr>)}
                  </tbody>
                </table>
                <p className="ph-note">Counts, not atom tracing: the model does not assign labels to individual carbon atoms. Per turn: C2 in, 2 × CO₂ out; oxaloacetate (C4) returns unchanged in number.</p>
                <p className="mt-eq">{formatEquation(turnNet)}</p>
              </Panel>
              <Callout tone="info" title="One carbon accounting"><p>Per turn: {t.co2} CO₂ out. Per glucose including pyruvate oxidation ({p.co2} each): {pdhNet.co2 + glucoseTca.co2} CO₂, all six glucose carbons.</p></Callout>
            </>
          ) : null}

          {mode === "practice" ? <QuizPanel questions={questions} /> : null}
          {mode === "challenge" && view === "cycle" ? (
            <PredictPanel finished={step >= maxStep} onReveal={() => setStep(Math.min(maxStep, step + 1))} question={nextQ} revealLabel="Reveal the next reaction" />
          ) : null}
          {mode === "challenge" && view !== "cycle" ? <Callout tone="info" title="Challenge"><p>Switch to the Citric acid cycle view to predict each next reaction before it is revealed.</p></Callout> : null}
          <AssumptionsPanel items={METABOLIC_ASSUMPTIONS} />
        </div>
      </div>
    </div>
  );
}
