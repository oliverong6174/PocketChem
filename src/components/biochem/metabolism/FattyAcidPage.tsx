import { useMemo, useState } from "react";
import { LearningModeSwitch } from "../../ui/LearningModeSwitch";
import { Badge, Callout, DiagramFrame, Disclosure, KeyFigures, Panel, Segmented, ToolHeader } from "../../ui/primitives";
import { useGcWorkspace } from "../../generalChem/useGcWorkspace";
import { QuizPanel, StepControls } from "../../biology/bioShared";
import { useStepPlayer } from "../../biology/bioHooks";
import { MoleculeSvg } from "../MoleculeSvg";
import { GraphDiagram, GraphLegend, EDGE_COLORS } from "./GraphDiagram";
import { betaSpec, ketoneSpec, shuttleSpec, synthesisSpec, type SynthPhase } from "./diagramSpecs25";
import { AssumptionsPanel, ChallengePanel, ReactionCard, ScrollBox, TendencyBadge } from "./shared";
import { ProvenancePanel } from "./ProvenancePanel";
import { SIGN } from "./format";
import { ENZYMES_BY_ID, FATTY_ACID_NAME, REACTIONS_BY_ID, TENDENCY_DEFINITIONS, carnitineRequirement } from "../../../utils/biochem/metabolism/network";
import { formatEquation, reactionNet } from "../../../utils/biochem/metabolism/ledger";
import {
  KETOGENESIS_CONDITIONS, KETONE_TISSUES, LIPID_PRESETS, LIPID_REGULATION_CAVEAT, SYNTHESIS_NOTES, UNSUPPORTED_CASES, WHY_NOT_REVERSE, activation, carnitineShuttle, fattyAcidInfo, ketogenesisNet, ketoneOxidationAtp,
  ketolysisNet, lipidRegulation, oxidationSequence, oxidationStateAfter, oxidationSupport, oxidationTotals, propionateRoute, reactionOfId, synthesisLedger, synthesisSequence, type Level3, type Hormone,
} from "../../../utils/biochem/metabolism/lipids";
import { acetylCoaSources } from "../../../utils/biochem/metabolism/fuel";
import { fattyAcidChallenges, fattyAcidQuestions } from "../../../utils/biochem/metabolism/learning25";
import {
  DEFAULT_FATTYACID_INPUTS, FATTYACIDS_ENGINE_VERSION, FA_CHAINS, FA_VIEWS, LIPID_ASSUMPTIONS, describeFattyAcidAnalysis, substrateOf, summarizeFattyAcid, validateFattyAcidInputs, type FaView, type FattyAcidInputs,
} from "../../../utils/persistence/biochemTools25";
import { validateBiologyResults } from "../../../utils/persistence/biologyTools";
import { RelatedConcepts } from "../../ui/RelatedConcepts";
import "../../../styles/biochemistry.css";
import { EvidencePanel } from "../../ui/EvidencePanel";

type Props = { openRequest?: { id: string; recordId: string } | null; onOpenHandled?: (requestId: string) => void };
const VIEW_LABEL: Record<FaView, string> = { structure: "Structure", activation: "Activation & transport", oxidation: "β-Oxidation", energy: "Energy ledger", synthesis: "Synthesis", ketone: "Ketone bodies", regulation: "Regulation" };
const LEVEL_OPTIONS = (["low", "normal", "high"] as Level3[]).map((l) => ({ id: l, label: l[0].toUpperCase() + l.slice(1) }));
const sub = (n: number) => `C${n}:0${FATTY_ACID_NAME[n] ? ` ${FATTY_ACID_NAME[n].split(" ")[0].toLowerCase()}` : ""}`;
const fmt = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1));

/** Row of carbon circles: carboxyl (C1), α, β and ω carbons marked, carbons already released as acetyl-CoA greyed out. */
function ChainBar({ total, remaining }: { total: number; remaining: number }) {
  return (
    <div aria-label={`Carbon chain: ${remaining} of ${total} carbons remain in the acyl-CoA`} className="fa-chain" role="img">
      {Array.from({ length: total }, (_, i) => {
        const released = i >= remaining, role = i === 0 ? "C1 carboxyl (thioester)" : i === 1 ? "α carbon (C2)" : i === 2 ? "β carbon (C3)" : i === total - 1 ? "ω (methyl) carbon" : `C${i + 1}`;
        return <span className={`fa-carbon${released ? " fa-released" : ""}${i === 0 ? " fa-c1" : ""}${i === 1 || i === 2 ? " fa-ab" : ""}`} key={i} title={role}>{i + 1}</span>;
      })}
    </div>
  );
}

export default function FattyAcidPage({ openRequest = null, onOpenHandled }: Props) {
  const ws = useGcWorkspace<FattyAcidInputs>({
    page: "fattyacids", engineVersion: FATTYACIDS_ENGINE_VERSION, defaults: DEFAULT_FATTYACID_INPUTS, validateInputs: validateFattyAcidInputs, validateResults: validateBiologyResults,
    summarize: summarizeFattyAcid, describe: describeFattyAcidAnalysis, fallbackName: "Fatty-acid metabolism", openRequest, onOpenHandled,
  });
  const { raw, update } = ws;
  const set = (patch: Partial<FattyAcidInputs>) => update((c) => ({ ...c, ...patch }));
  const { mode, view, chain, substrate } = raw;
  const [selected, setSelected] = useState<string | null>(null);
  const subst = substrateOf(raw);
  const support = oxidationSupport(subst);
  const seq = useMemo(() => oxidationSequence(subst), [chain, substrate]); // eslint-disable-line react-hooks/exhaustive-deps
  const totals = oxidationTotals(subst);
  const state = oxidationStateAfter(subst, raw.step);
  const evenInfo = substrate === "saturated" && chain % 2 === 0 ? fattyAcidInfo(chain) : null;
  const oxPlayer = useStepPlayer(raw.step, seq.length, (n) => set({ step: n }));
  const shuttle = carnitineShuttle(chain), shuttleMax = shuttle.required === "no" ? 2 : 4;
  const shuttlePlayer = useStepPlayer(raw.shuttleStep, shuttleMax, (n) => set({ shuttleStep: n }));
  const act = activation(chain);
  const synthSeq = useMemo(() => synthesisSequence(16), []);
  const synthPlayer = useStepPlayer(raw.synthStep, synthSeq.length, (n) => set({ synthStep: n }));
  const synth = synthesisLedger(16, raw.acetylSource)!;
  const questions = useMemo(() => fattyAcidQuestions({ chain, substrate, step: view === "oxidation" ? raw.step : 0 }), [chain, substrate, raw.step, view]);
  const challenges = useMemo(() => fattyAcidChallenges(), []);
  const reg = lipidRegulation(raw.conditions);
  const hide = false;
  const chainChoice = substrate === "oleate" ? "oleate" : String(chain);
  const chooseChain = (v: string) => { if (v === "oleate") set({ substrate: "oleate", chain: 18, step: 0, shuttleStep: 0 }); else set({ substrate: "saturated", chain: Number(v), step: 0, shuttleStep: 0, activationStep: 0 }); };

  const curStep = raw.step >= 1 ? seq[Math.min(raw.step, seq.length) - 1] : null;
  const cycle = raw.step === 0 ? 1 : Math.ceil(raw.step / 4), doneInCycle = raw.step === 0 ? 0 : raw.step - 4 * (cycle - 1);
  const cycleStart = seq[(cycle - 1) * 4];
  const odd = substrate === "saturated" && chain % 2 === 1;

  const ketoneStepMap = raw.ketoneMode === "ketogenesis" ? (raw.ketoneForm === "bhb" ? [0, 1, 2, 3, 4, 5] : [0, 1, 2, 3, 5]) : raw.ketoneForm === "bhb" ? [0, 1, 2, 3, 4] : [0, 1, 3, 4];
  const ketoneMax = ketoneStepMap.length - 1, ketoneEff = ketoneStepMap[Math.min(raw.ketoneStep, ketoneMax)];
  const ketonePlayer = useStepPlayer(raw.ketoneStep, ketoneMax, (n) => set({ ketoneStep: n }));
  const ketoneKeys: Record<string, string> = { ACAT: "ACAT", HMGCS2: "HMGCS2", HMGCL: "HMGCL", BDH1: "BDH1", "BDH1-R": "BDH1", "KB-EXPORT": "KB-EXPORT", "KB-EXPORT-B": "KB-EXPORT", "KB-IMPORT": "KB-IMPORT", "KB-IMPORT-B": "KB-IMPORT", SCOT: "SCOT", "ACAT-R": "ACAT", TCA: "CS", ACETONE: "ACETONE" };
  const ketoneSel = selected && ketoneKeys[selected] ? ketoneKeys[selected] : null;

  const phase: SynthPhase = (() => {
    if (raw.synthStep === 0) return "start";
    const id = synthSeq[raw.synthStep - 1].reactionId.split(":")[0];
    return ({ "MAT-AC": "load", "MAT-MAL": "load", ACC: "acc", KS: "condense", KR: "reduce1", DH: "dehydrate", ER: "reduce2", TE: "release" } as Record<string, SynthPhase>)[id] ?? "start";
  })();
  const synthState = raw.synthStep === 0 ? { chain: 0, round: 0 } : { chain: synthSeq[raw.synthStep - 1].chainAfter, round: synthSeq[raw.synthStep - 1].round };
  const synthSoFar = (() => {
    const net: Record<string, number> = {};
    for (const s of synthSeq.slice(0, raw.synthStep)) for (const [k, v] of Object.entries(reactionNet(reactionOfId(s.reactionId)))) net[k] = (net[k] ?? 0) + v;
    return net;
  })();
  const synthRound = (round: number) => synthSeq.filter((s) => s.round === round && /^(KS|KR|DH|ER)/.test(s.reactionId));

  return (
    <div className="gc-page ph-page bio-page bc-page">
      <ToolHeader
        group="Metabolism"
        title="Fatty-acid & ketone-body metabolism"
        purpose="Activate a fatty acid, carry it into mitochondria, shorten it two carbons at a time, count the carriers and acetyl-CoA, compare with synthesis in the cytosol, and follow acetyl-CoA to ketone bodies that other tissues burn. Every number is summed from the shared metabolic network."
        evidence="model"
        steps={[
          { label: "Choose a fatty acid", detail: "Even-chain C4–C18, an odd-chain example or oleate." },
          { label: "Step through", detail: "Activation, shuttle, each β-oxidation reaction." },
          { label: "Compare ledgers", detail: "Oxidation, synthesis (NADPH) and ketone bodies." },
        ]}
        aside={<Badge tone="neutral" title="Stoichiometry and qualitative regulation; no flux is computed">Qualitative regulation</Badge>}
      />
      {ws.chrome}
      <div className="gc-toolbar">
        <LearningModeSwitch mode={mode} modes={["explore", "practice", "challenge"]} onChange={(m) => { oxPlayer.pause(); update((c) => ({ ...c, mode: m })); }} />
        {ws.actions}
      </div>
      {ws.saveFormEl}
      <div className="bc-views"><Segmented<FaView> label="View" onChange={(v) => { oxPlayer.pause(); synthPlayer.pause(); shuttlePlayer.pause(); ketonePlayer.pause(); setSelected(null); set({ view: v }); }} options={FA_VIEWS.map((v) => ({ id: v, label: VIEW_LABEL[v] }))} value={view} /></div>

      <div className="gc-layout">
        <Panel className="gc-inputs" subtitle="Choose the substrate, then step through the process." title="Controls">
          {view !== "regulation" && view !== "synthesis" && view !== "ketone" ? (
            <label className="gc-field">
              <span>Fatty acid (chain length)</span>
              <select data-testid="fa-chain" onChange={(e) => chooseChain(e.target.value)} value={chainChoice}>
                {FA_CHAINS.filter((n) => n % 2 === 0 || n === 15).map((n) => <option key={n} value={String(n)}>{sub(n)}{n % 2 ? " (odd chain: special case)" : ""}</option>)}
                <option value="oleate">C18:1 oleate (cis-Δ9: special case)</option>
              </select>
            </label>
          ) : null}
          {view === "oxidation" ? (
            <>
              <StepControls extra={null} locked={mode === "challenge"} max={seq.length} onStep={(n) => set({ step: n })} player={oxPlayer} step={raw.step} unit="Reaction" />
              <p className="ph-note" data-testid="ox-position">{raw.step === 0 ? "Start: the activated acyl-CoA is in the matrix." : `Cycle ${cycle} of ${totals?.cycles ?? "?"}, reaction ${doneInCycle} of 4.`}</p>
            </>
          ) : null}
          {view === "activation" ? <StepControls locked={mode === "challenge"} max={shuttleMax} onStep={(n) => set({ shuttleStep: n })} player={shuttlePlayer} step={raw.shuttleStep} unit="Transport step" /> : null}
          {view === "synthesis" ? (
            <>
              <Segmented<"mitochondrial-citrate" | "cytosolic"> label="Acetyl-CoA supply" onChange={(v) => set({ acetylSource: v })} options={[{ id: "mitochondrial-citrate", label: "Mitochondrial (citrate export)" }, { id: "cytosolic", label: "Already cytosolic" }]} value={raw.acetylSource} />
              <StepControls locked={mode === "challenge"} max={synthSeq.length} onStep={(n) => set({ synthStep: n })} player={synthPlayer} step={raw.synthStep} unit="Reaction" />
            </>
          ) : null}
          {view === "ketone" ? (
            <>
              <Segmented<"ketogenesis" | "ketolysis"> label="Process" onChange={(v) => { ketonePlayer.pause(); set({ ketoneMode: v, ketoneStep: 0 }); setSelected(null); }} options={[{ id: "ketogenesis", label: "Ketogenesis (liver)" }, { id: "ketolysis", label: "Ketolysis (peripheral)" }]} value={raw.ketoneMode} />
              <Segmented<"acetoacetate" | "bhb"> label="Ketone body" onChange={(v) => set({ ketoneForm: v, ketoneStep: 0 })} options={[{ id: "acetoacetate", label: "Acetoacetate" }, { id: "bhb", label: "β-Hydroxybutyrate" }]} value={raw.ketoneForm} />
              <StepControls locked={mode === "challenge"} max={ketoneMax} onStep={(n) => set({ ketoneStep: n })} player={ketonePlayer} step={Math.min(raw.ketoneStep, ketoneMax)} unit="Step" />
            </>
          ) : null}
          {view === "regulation" ? <p className="ph-note">Choose a preset or set each condition. Directions are relative to the reference state.</p> : null}
          <Callout tone="info" title="Accounting convention"><p>ATP equivalents: about 2.5 per NADH, 1.5 per FADH₂ (the Stage 18 convention). “High-energy bonds” counts phosphoanhydride bonds. These are conventions, not measurements.</p></Callout>
        </Panel>

        <div className="gc-stage">
          {view === "structure" ? (
            <>
              <Panel subtitle="Chemistry of the selected fatty acid, drawn from the shared network." title={substrate === "oleate" ? "Oleate (C18:1, cis-Δ9)" : evenInfo ? `${evenInfo.name} (C${chain}:0)` : `C${chain}:0 fatty acid (odd chain)`}>
                {substrate === "oleate"
                  ? <MoleculeSvg height={110} label="Oleate structure" smiles="CCCCCCCC/C=C\CCCCCCCC(=O)O" width={420} />
                  : <MoleculeSvg height={110} label={`C${chain} fatty acid structure`} smiles={"C".repeat(chain - 1) + "C(=O)O"} width={Math.min(460, 60 + chain * 22)} />}
                <ChainBar remaining={substrate === "oleate" ? 18 : chain} total={substrate === "oleate" ? 18 : chain} />
                <p className="ph-note">Numbered from the carboxyl carbon (C1, outlined): C2 is the α carbon and C3 the β carbon (green rings), where β-oxidation acts; the last carbon is ω.</p>
                <KeyFigures items={[
                  { label: "Carbons", value: String(substrate === "oleate" ? 18 : chain), note: substrate === "oleate" ? "one cis double bond (Δ9)" : "saturated, unbranched" },
                  { label: "Formula", value: substrate === "oleate" ? "C18H34O2" : `C${chain}H${2 * chain}O2`, note: "free acid" },
                  { label: "Acyl-CoA formula", value: substrate === "oleate" ? "C39H68N7O17P3S" : `C${21 + chain}H${34 + 2 * chain}N7O17P3S`, note: "CoA + fatty acid − H₂O" },
                  { label: "Carnitine shuttle", value: carnitineRequirement(chain) === "yes" ? "Required" : carnitineRequirement(chain) === "partly" ? "Borderline" : "Not required", note: "long chains need it" },
                ]} />
                {evenInfo ? <p><strong>Where it is activated:</strong> {evenInfo.activationEnzyme}. <strong>Compartments:</strong> cytosol and the outer mitochondrial membrane (long chains), or the matrix (short and medium chains).</p> : null}
                {support.supported && support.reason ? <Callout tone="warn" title="Special case"><p>{support.reason}</p></Callout> : null}
              </Panel>
              <Panel subtitle="These structures are not calculated here." title="Not supported">
                <ul className="gc-assumptions">{UNSUPPORTED_CASES.map((c) => <li key={c.id}><strong>{c.label}.</strong> {c.reason}</li>)}</ul>
              </Panel>
            </>
          ) : null}

          {view === "activation" ? (
            <>
              <Panel subtitle="ATP → AMP + PPi is two high-energy bonds, not one." title="Activation: fatty acid → fatty acyl-CoA">
                <div className="mt-stage-actions" role="group" aria-label="Activation steps">
                  {[["ACS", "1. Acyl-CoA synthetase"], ["PPASE", "2. Pyrophosphatase"], ["ADK", "3. Adenylate kinase (accounting)"]].map(([id, label], i) => (
                    <button aria-pressed={raw.activationStep === i + 1} className="mt-rxn-chip" data-testid={`act-${i + 1}`} key={id} onClick={() => set({ activationStep: raw.activationStep === i + 1 ? 0 : i + 1 })} type="button">{label}</button>
                  ))}
                </div>
                <KeyFigures items={[
                  { label: "ATP molecules consumed", value: String(raw.activationStep >= 3 ? act.atpEquivalents : act.atpMolecules), note: raw.activationStep >= 3 ? "after AMP is rephosphorylated" : "ATP → AMP + PPi" },
                  { label: "High-energy bonds spent", value: String(raw.activationStep === 0 ? 0 : raw.activationStep === 1 ? act.synthetaseBonds : act.bondsAfterPyrophosphatase), note: raw.activationStep >= 2 ? "ATP → AMP + PPi, then PPi → 2 Pi" : "" },
                  { label: "ATP equivalents (cost)", value: String(raw.activationStep >= 3 ? act.atpEquivalents : "—"), note: "two, for any fatty acid" },
                ]} />
                {raw.activationStep >= 1 ? <ReactionCard hideNames={hide} perUnit="per fatty acid" reaction={raw.activationStep === 1 ? reactionOfId(`ACS:${chain}`) : raw.activationStep === 2 ? REACTIONS_BY_ID.PPASE : REACTIONS_BY_ID.ADK} reactionId="ACS" /> : <p className="ph-note">Choose a step to see its equation, enzyme and bond count. Activation is separate from the β-oxidation cycle that follows.</p>}
                <p className="mt-eq" data-testid="activation-net">{raw.activationStep >= 3 ? formatEquation(act.full) : raw.activationStep === 2 ? formatEquation(act.withPyrophosphatase) : raw.activationStep === 1 ? formatEquation(act.synthetase) : ""}</p>
              </Panel>
              <DiagramFrame caption={`${shuttle.note} Malonyl-CoA inhibits CPT I (dashed: not yet reached).`} label="Carnitine shuttle diagram" title={`Carnitine shuttle for C${chain}`}>
                <ScrollBox focusKey={String(raw.shuttleStep)}>
                  <GraphDiagram {...shuttleSpec(chain, raw.shuttleStep, selected)} onEdge={(id) => setSelected(id.startsWith("a") ? "acs" : id.startsWith("b") ? "cpt1" : id.startsWith("c") ? "cact" : "cpt2")} onNode={(id) => setSelected(id === "acs" || id === "acsm" ? "acs" : id === "cpt1" ? "cpt1" : id === "cact" ? "cact" : id === "cpt2" ? "cpt2" : null)} />
                </ScrollBox>
                <GraphLegend items={[{ color: EDGE_COLORS.main, text: "Chemical step" }, { color: EDGE_COLORS.transport, text: "Transport / carnitine exchange" }]} />
              </DiagramFrame>
              <Panel subtitle={shuttle.note} title="Shuttle steps">
                <ol className="mt-shuttle">{shuttle.steps.map((s, i) => <li aria-current={raw.shuttleStep === i + 1} key={s.id}><strong>{s.title}</strong>: {s.text} <span className="ph-note">({s.location}; {s.carnitineMovement})</span></li>)}</ol>
                {selected && ["acs", "cpt1", "cact", "cpt2"].includes(selected) ? <ReactionCard perUnit="per acyl group" reaction={reactionOfId(selected === "acs" ? `ACS:${chain}` : selected === "cpt1" ? `CPT1:${chain}` : selected === "cact" ? `CACT:${chain}` : `CPT2:${chain}`)} reactionId="CPT1" /> : null}
                <Callout tone="info" title="Transport is not oxidation"><p>The shuttle only relocates the acyl group; it makes no NADH, FADH₂ or acetyl-CoA. β-Oxidation begins once acyl-CoA is in the matrix.</p></Callout>
              </Panel>
            </>
          ) : null}

          {view === "oxidation" ? (
            <>
              {odd ? <Callout tone="warn" title="Odd-chain special case"><p>The cycle count, acetyl-CoA and carriers are exact, but the last thiolysis leaves propionyl-CoA (C3), whose conversion to succinyl-CoA needs biotin, ATP and vitamin B₁₂. The ATP estimate is not calculated for odd-chain acids.</p></Callout> : null}
              {substrate === "oleate" ? <Callout tone="info" title="Unsaturated case"><p>The cis-Δ9 bond reaches C3 after three cycles. Enoyl-CoA isomerase replaces the acyl-CoA dehydrogenase step once, so one FADH₂ is not made. Intermediates before cycle 4 are shown by chain length only.</p></Callout> : null}
              <div aria-live="polite" className="mt-caption" data-testid="ox-caption">
                <h3>{raw.step === 0 ? `Acyl-CoA (C${substrate === "oleate" ? 18 : chain}) in the matrix` : `After reaction ${raw.step} of ${seq.length}: ${curStep!.title}`}</h3>
                <p>{raw.step === 0 ? "Nothing has been oxidized yet. Each cycle removes two carbons as acetyl-CoA." : REACTIONS_BY_ID[curStep!.reactionId]?.purpose ?? reactionOfId(curStep!.reactionId).purpose}</p>
                <p className="mt-chips" data-testid="ox-cumulative"><span className="ph-note">Cumulative:</span> <span className="mt-chip mt-chip-none">Chain C{state.chain}</span> <span className="mt-chip mt-chip-up">NADH {SIGN(state.nadh)}</span> <span className="mt-chip mt-chip-up">FADH₂ {SIGN(state.fadh2)}</span> <span className="mt-chip mt-chip-up">Acetyl-CoA {SIGN(state.acetylCoA)}</span>{state.propionylCoA ? <span className="mt-chip mt-chip-up">Propionyl-CoA {SIGN(state.propionylCoA)}</span> : null}</p>
              </div>
              <ChainBar remaining={state.chain} total={substrate === "oleate" ? 18 : chain} />
              <DiagramFrame caption="Cycle shown at its current chain length. Arrows are the four reactions; dashed ones have not happened yet. The shortened acyl-CoA re-enters the top of the cycle." label="β-oxidation cycle" title={`β-Oxidation: cycle ${cycle}`}>
                <ScrollBox focusKey={String(raw.step)}>
                  <GraphDiagram {...betaSpec(cycleStart?.chainBefore ?? chain, doneInCycle, { isomerase: cycleStart ? seq[(cycle - 1) * 4].phase === "isomerase" : false, selected, odd })} onEdge={(id) => setSelected(id)} />
                </ScrollBox>
              </DiagramFrame>
              {curStep ? <ReactionCard direction={curStep.direction} perUnit="per cycle" reaction={reactionOfId(curStep.reactionId)} reactionId={curStep.reactionId} /> : <Callout tone="info" title="Press Next"><p>Each step shows its enzyme, equation, cofactors and why it matters.</p></Callout>}
              <Panel title="Where the cycle ends">
                <p className="mt-eq" data-testid="ox-total">{totals ? `${totals.cycles} cycles → ${totals.acetylCoA} acetyl-CoA${totals.propionylCoA ? ` + ${totals.propionylCoA} propionyl-CoA` : ""}, ${totals.nadh} NADH, ${totals.fadh2} FADH₂` : "Not supported"}</p>
                <p className="ph-note">Counted by summing the same reactions drawn above, not from a stored table.</p>
              </Panel>
            </>
          ) : null}

          {view === "energy" ? (
            <>
              {totals ? (
                <>
                  <KeyFigures items={[
                    { label: "β-Oxidation cycles", value: String(totals.cycles) }, { label: "Acetyl-CoA", value: String(totals.acetylCoA) },
                    { label: "NADH", value: String(totals.nadh) }, { label: "FADH₂", value: String(totals.fadh2) },
                    { label: "ATP made directly by β-oxidation", value: "0", note: "carriers and acetyl-CoA only" },
                  ]} />
                  {totals.atp ? (
                    <Panel subtitle="Conventional estimate, not a measurement." title="Complete oxidation (ATP equivalents)">
                      <table className="bc-table" data-testid="fa-atp-table">
                        <thead><tr><th scope="col">Source</th><th scope="col">Amount</th><th scope="col">ATP equivalents</th></tr></thead>
                        <tbody>
                          <tr><th scope="row">NADH from β-oxidation</th><td>{totals.nadh} × 2.5</td><td>{fmt(totals.atp.fromNadh)}</td></tr>
                          <tr><th scope="row">FADH₂ from β-oxidation</th><td>{totals.fadh2} × 1.5</td><td>{fmt(totals.atp.fromFadh2)}</td></tr>
                          <tr><th scope="row">Acetyl-CoA in the citric acid cycle</th><td>{totals.acetylCoA} × {totals.atpPerAcetylCoA}</td><td>{fmt(totals.atp.fromAcetylCoA)}</td></tr>
                          <tr><th scope="row">Activation (ATP → AMP + PPi)</th><td>2 ATP equivalents</td><td>−{totals.activationAtpEquivalents}</td></tr>
                          <tr><th scope="row">Net estimate</th><td /><td data-testid="fa-atp-total"><strong>{fmt(totals.atp.total)}</strong></td></tr>
                        </tbody>
                      </table>
                      <p>These ATP appear in the citric acid cycle and respiratory chain, not in the β-oxidation reactions: β-oxidation itself makes no ATP.</p>
                    </Panel>
                  ) : <Callout tone="warn" title="ATP not calculated"><p>{totals.note}</p></Callout>}
                </>
              ) : <Callout tone="warn" title="Not supported"><p>{!support.supported ? support.reason : ""}</p></Callout>}
              {odd ? (
                <Panel subtitle="Biotin and vitamin B₁₂ are required." title="Propionyl-CoA → succinyl-CoA">
                  {propionateRoute().steps.map((r) => <ReactionCard key={r.id} perUnit="per propionyl-CoA" reactionId={r.id} />)}
                  <p className="mt-eq">{formatEquation(propionateRoute().net)}</p>
                  <ul className="gc-assumptions">{propionateRoute().cofactors.map((c) => <li key={c.reaction}><strong>{c.enzyme}</strong> needs {c.cofactor}.</li>)}</ul>
                  <p className="ph-note">{propionateRoute().note}</p>
                </Panel>
              ) : null}
            </>
          ) : null}

          {view === "synthesis" ? (
            <>
              <div aria-live="polite" className="mt-caption" data-testid="synth-caption">
                <h3>{raw.synthStep === 0 ? "Palmitate synthesis (C16:0), cytosol" : `After reaction ${raw.synthStep} of ${synthSeq.length}: ${synthSeq[raw.synthStep - 1].title}`}</h3>
                <p>{raw.synthStep === 0 ? "Acetyl-CoA supply, then acetyl-CoA carboxylase makes malonyl-CoA, and fatty-acid synthase extends the chain by two carbons per round, seven rounds in all." : reactionOfId(synthSeq[raw.synthStep - 1].reactionId).purpose}</p>
                <p className="mt-chips" data-testid="synth-cumulative"><span className="ph-note">So far:</span> <span className="mt-chip mt-chip-none">Chain C{synthState.chain || 0}</span> <span className="mt-chip mt-chip-down">NADPH {SIGN(synthSoFar.nadph ?? 0)}</span> <span className="mt-chip mt-chip-down">ATP {SIGN(synthSoFar.atp ?? 0)}</span> <span className="mt-chip mt-chip-up">CO₂ {SIGN(synthSoFar.co2 ?? 0)}</span></p>
              </div>
              <ChainBar remaining={synthState.chain} total={16} />
              <DiagramFrame caption="Cytosolic synthesis. Dashed or dimmed parts are not in use for the chosen acetyl-CoA supply." label="Fatty-acid synthesis diagram" title="De novo synthesis of palmitate">
                <ScrollBox focusKey={phase}>
                  <GraphDiagram {...synthesisSpec(phase, synthState.round, raw.acetylSource, selected)} onNode={(id) => setSelected(id === "acly" ? "ACLY" : id === "accE" ? "ACC" : id === "fas" ? "FAS" : null)} />
                </ScrollBox>
              </DiagramFrame>
              {raw.synthStep >= 1 ? <ReactionCard perUnit="per round" reaction={reactionOfId(synthSeq[raw.synthStep - 1].reactionId)} reactionId={synthSeq[raw.synthStep - 1].reactionId} /> : null}
              <Panel subtitle="ATP and NADPH are different currencies and are kept in separate rows." title="Palmitate ledger">
                <KeyFigures items={[
                  { label: "Acetyl-CoA units", value: String(synth.acetylUnits), note: "1 primer + 7 extenders" }, { label: "Malonyl-CoA", value: String(synth.malonylCoA) },
                  { label: "NADPH consumed", value: String(synth.nadphConsumed), note: "2 per round" }, { label: "ATP: malonyl-CoA", value: String(synth.atpForMalonylCoA), note: "acetyl-CoA carboxylase" },
                  { label: "ATP: acetyl-CoA export", value: String(synth.atpForAcetylCoAExport), note: raw.acetylSource === "cytosolic" ? "not needed" : "ATP-citrate lyase" },
                ]} />
                <table className="bc-table" data-testid="synth-ledger"><tbody>
                  <tr><th scope="row">NADPH made by malic enzyme (citrate route)</th><td>{synth.nadphFromMalicEnzyme}</td></tr>
                  <tr><th scope="row">NADPH from other sources (pentose phosphate pathway, not modelled)</th><td>{synth.nadphOtherSources}</td></tr>
                  <tr><th scope="row">CO₂ fixed by ACC / released at condensation</th><td>{synth.co2Fixed} / {synth.co2Released}</td></tr>
                  <tr><th scope="row">Free CoA released</th><td>{synth.coaReleased}</td></tr>
                </tbody></table>
                <p className="mt-eq" data-testid="synth-net">{formatEquation(synth.net)}</p>
                <ul className="gc-assumptions">{SYNTHESIS_NOTES.map((n) => <li key={n}>{n}</li>)}</ul>
              </Panel>
              <Panel title="Why synthesis is not β-oxidation run backward">
                <ul className="gc-assumptions" data-testid="why-not-reverse">{WHY_NOT_REVERSE.map((n) => <li key={n}>{n}</li>)}</ul>
                <table className="bc-table"><thead><tr><th scope="col">Round</th><th scope="col">Reactions</th></tr></thead><tbody>{[1, 2, 7].map((r) => <tr key={r}><th scope="row">{r}</th><td>{synthRound(r).map((s) => s.title).join(" → ")}</td></tr>)}</tbody></table>
              </Panel>
            </>
          ) : null}

          {view === "ketone" ? (
            <>
              <div aria-live="polite" className="mt-caption" data-testid="ketone-caption">
                <h3>{raw.ketoneMode === "ketogenesis" ? "Hepatic ketogenesis" : "Peripheral ketolysis"} ({raw.ketoneForm === "bhb" ? "β-hydroxybutyrate" : "acetoacetate"})</h3>
                <p>{raw.ketoneMode === "ketogenesis" ? "Hepatic β-oxidation supplies acetyl-CoA; liver mitochondria condense it to HMG-CoA and release acetoacetate, which is exported (and reduced to β-hydroxybutyrate by NADH)." : "Extrahepatic mitochondria take up ketone bodies, activate acetoacetate with succinyl-CoA (SCOT) and cleave it to two acetyl-CoA for the cycle."}</p>
              </div>
              <DiagramFrame caption="Fatty acids → acetyl-CoA → ketogenesis → ketone bodies in blood → extrahepatic acetyl-CoA → citric acid cycle. Dimmed arrows belong to the other process." label="Ketone-body diagram" title="Liver → blood → peripheral tissue">
                <ScrollBox focusKey={String(raw.ketoneStep)}>
                  <GraphDiagram {...ketoneSpec(raw.ketoneMode, raw.ketoneForm, ketoneEff, ketoneSel)} onEdge={(id) => setSelected(id)} />
                </ScrollBox>
                <GraphLegend items={[{ color: EDGE_COLORS.main, text: "Chemical step" }, { color: EDGE_COLORS.transport, text: "Transport between compartments" }, { color: EDGE_COLORS.cofactor, text: "Second substrate" }]} />
              </DiagramFrame>
              {ketoneSel ? <ReactionCard perUnit="per pass" reactionId={ketoneSel} /> : <p className="ph-note">Select an arrow to see its enzyme, equation and tissue.</p>}
              <Panel subtitle="Computed from the same reactions." title="Net equations">
                <p className="mt-eq" data-testid="ketone-net">{raw.ketoneMode === "ketogenesis" ? formatEquation(ketogenesisNet(raw.ketoneForm)) : formatEquation(ketolysisNet(raw.ketoneForm))}</p>
                <p>Oxidizing one {raw.ketoneForm === "bhb" ? "β-hydroxybutyrate" : "acetoacetate"} completely: about <strong data-testid="ketone-atp">{fmt(ketoneOxidationAtp(raw.ketoneForm).total)}</strong> ATP equivalents (2 acetyl-CoA × {fmt(ketoneOxidationAtp(raw.ketoneForm).fromCycle / 2)}{ketoneOxidationAtp(raw.ketoneForm).forgoneNtp ? ` − ${ketoneOxidationAtp(raw.ketoneForm).forgoneNtp} GTP forgone because SCOT bypasses succinyl-CoA synthetase` : ""}{raw.ketoneForm === "bhb" ? ", + 2.5 for the NADH of the dehydrogenase" : ""}).</p>
              </Panel>
              <Panel subtitle="Liver makes; other tissues use." title="Who makes and who uses ketone bodies">
                <table className="bc-table" data-testid="ketone-tissues"><thead><tr><th scope="col">Tissue</th><th scope="col">Makes</th><th scope="col">Uses</th><th scope="col">Why</th></tr></thead>
                  <tbody>{KETONE_TISSUES.map((t) => <tr key={t.id}><th scope="row">{t.label}</th><td>{t.makes ? "Yes" : "No"}</td><td>{t.uses ? "Yes" : "No"}</td><td>{t.why}</td></tr>)}</tbody></table>
                <ul className="gc-assumptions">{KETOGENESIS_CONDITIONS.map((c) => <li key={c}>{c}</li>)}</ul>
              </Panel>
              <Panel subtitle="Acetyl-CoA is one molecule whatever its source; only the cost upstream differs." title="Carbohydrate-derived versus ketone-derived acetyl-CoA">
                {(() => { const a = acetylCoaSources(); const rows: Array<[string, number, string]> = [["Glucose-derived (per acetyl-CoA)", a.carbohydrate.upstreamPerAcetylCoA, a.carbohydrate.note], ["Acetoacetate-derived", a.acetoacetate.upstreamPerAcetylCoA, a.acetoacetate.note], ["β-Hydroxybutyrate-derived", a.bhb.upstreamPerAcetylCoA, a.bhb.note]];
                  return <table className="bc-table" data-testid="acetyl-sources"><thead><tr><th scope="col">Source</th><th scope="col">ATP equivalents upstream of acetyl-CoA</th><th scope="col">Note</th></tr></thead><tbody>{rows.map(([l, v, n]) => <tr key={l}><th scope="row">{l}</th><td>{SIGN(v)}</td><td>{n}</td></tr>)}</tbody></table>; })()}
                <p className="ph-note">After acetyl-CoA the cycle gives about {fmt(acetylCoaSources().cycleAtpPerAcetylCoA)} ATP equivalents per acetyl-CoA from any source. Ketone bodies are not equivalent to free fatty acids: they are water-soluble, made only by liver and burned only outside it.</p>
              </Panel>
            </>
          ) : null}

          {view === "regulation" ? (
            <>
              <Panel subtitle="Reciprocal control of synthesis and oxidation through malonyl-CoA. Directions only." title="Regulatory conditions">
                <div className="mt-signals">
                  <Segmented<string> label="Preset" onChange={(id) => set({ conditions: LIPID_PRESETS.find((p) => p.id === id)!.conditions })} options={LIPID_PRESETS.map((p) => ({ id: p.id, label: p.title }))} value={LIPID_PRESETS.find((p) => JSON.stringify(p.conditions) === JSON.stringify(raw.conditions))?.id ?? "custom"} />
                  <Segmented<Hormone> label="Hormonal state (insulin- or glucagon-dominant)" onChange={(v) => set({ conditions: { ...raw.conditions, hormone: v } })} options={[{ id: "insulin", label: "Insulin-dominant (fed)" }, { id: "balanced", label: "Balanced" }, { id: "glucagon", label: "Glucagon-dominant (fasting)" }]} value={raw.conditions.hormone} />
                  <Segmented<Level3> label="Cellular energy status (low = AMPK-like signal)" onChange={(v) => set({ conditions: { ...raw.conditions, energy: v } })} options={LEVEL_OPTIONS} value={raw.conditions.energy} />
                  <Segmented<Level3> label="Citrate" onChange={(v) => set({ conditions: { ...raw.conditions, citrate: v } })} options={LEVEL_OPTIONS} value={raw.conditions.citrate} />
                  <Segmented<Level3> label="Long-chain acyl-CoA" onChange={(v) => set({ conditions: { ...raw.conditions, acylCoa: v } })} options={LEVEL_OPTIONS} value={raw.conditions.acylCoa} />
                </div>
              </Panel>
              <Panel subtitle="Relative to the all-balanced reference state; opposing signals are reported as uncertain." title="Effect on each step">
                <table className="bc-table" data-testid="lipid-reg-table">
                  <thead><tr><th scope="col">Step or pathway</th><th scope="col">Net tendency</th></tr></thead>
                  <tbody>
                    <tr><th scope="row">{ENZYMES_BY_ID.acc.short}</th><td><TendencyBadge tendency={reg.acc} /></td></tr>
                    <tr><th scope="row">Malonyl-CoA</th><td><TendencyBadge tendency={reg.malonylCoA} /></td></tr>
                    <tr><th scope="row">{ENZYMES_BY_ID.cpt1.short}</th><td><TendencyBadge tendency={reg.cpt1} /></td></tr>
                    <tr><th scope="row">Fatty-acid synthesis</th><td><TendencyBadge tendency={reg.synthesis} /></td></tr>
                    <tr><th scope="row">Fatty-acid oxidation (long chain)</th><td><TendencyBadge tendency={reg.oxidation} /></td></tr>
                  </tbody>
                </table>
                <ul className="gc-assumptions" data-testid="lipid-reasons">{reg.reasons.length ? reg.reasons.map((r) => <li key={r.id}>{r.note}</li>) : <li>No condition departs from the reference state.</li>}</ul>
                <Disclosure summary="What do these labels mean?"><ul className="gc-assumptions">{Object.values(TENDENCY_DEFINITIONS).map((d) => <li key={d}>{d}</li>)}</ul></Disclosure>
                <Callout tone="info" title="Reciprocal regulation"><p>Malonyl-CoA, made only by the synthesis pathway, inhibits CPT I; so when synthesis is favoured, oxidation of long-chain fatty acids tends to be restrained, and the reverse. {LIPID_REGULATION_CAVEAT}</p></Callout>
              </Panel>
            </>
          ) : null}

          {mode === "practice" ? <QuizPanel questions={questions} /> : null}
          {mode === "challenge" ? (
            <ChallengePanel index={raw.challenge} items={challenges} onNext={() => set({ challenge: raw.challenge + 1 })} onReveal={(p) => { set({ view: p.view, ...(p.chain ? { chain: p.chain, substrate: "saturated" as const, step: 0 } : {}), ...(p.conditions ? { conditions: p.conditions } : {}) }); }} />
          ) : null}
          <AssumptionsPanel items={LIPID_ASSUMPTIONS} />
          <EvidencePanel id="biochem-fatty-acid-atp" />
          <ProvenancePanel topics={["lipid", "ketone"]} />
        </div>
      </div>
      <RelatedConcepts limit={5} subject="biochemistry" toolId="bcFattyAcids" />
    </div>
  );
}
