import { useMemo } from "react";
import { RelatedConcepts } from "../ui/RelatedConcepts";
import { LearningModeSwitch } from "../ui/LearningModeSwitch";
import { Badge, Callout, DiagramFrame, Panel, Segmented, ToolHeader } from "../ui/primitives";
import { GraphDiagram, GraphLegend, type GBand, type GEdge, type GNode, type GText, type Visual } from "../biochem/metabolism/GraphDiagram";
import { useGcWorkspace } from "../generalChem/useGcWorkspace";
import { PredictPanel, QuizPanel, StepControls } from "./bioShared";
import { useStepPlayer } from "./bioHooks";
import { CheckRow } from "./cell23";
import { layoutSizeForFate } from "./fateLayout26";
import { wrapLabel } from "./layout26";
import { NodeDetail, OutcomePanel, PerturbationList, RegDiagram, ProvenancePanel } from "./reg26";
import { REG_LEGEND } from "./layout26";
import { rootCauses, type Evaluation } from "../../utils/biology/mechanism26";
import {
  APOPTOSIS_GRAPH, APOPTOSIS_PERTURBATIONS, AUTOPHAGY_GRAPH, AUTOPHAGY_PERTURBATIONS, AUTOPHAGY_STEPS, CASPASES, FATE_LINKS, FATE_NODES, FATE_PERTURBATIONS, MAX_AUTOPHAGY_PERTURBATIONS, MAX_DEATH_PERTURBATIONS, MAX_FATE_PERTURBATIONS, PATH_STEPS, SCENARIOS,
  canAddAutophagyPerturbation, canAddDeathPerturbation, canAddFatePerturbation, evaluateApoptosis, evaluateAutophagy, evaluateFate, pathProgress, type FateNodeId, type PathStep, type PathwayStatus, type ScenarioId,
} from "../../utils/biology/celldeath26";
import { cellDeathChallenge, cellDeathQuestions } from "../../utils/biology/bioLearning26";
import { DEATH_ASSUMPTIONS, describeCellDeath, summarizeCellDeath } from "../../utils/biology/bioSummary26";
import { CELLDEATH_ENGINE_VERSION, DEATH_SECTIONS, DEFAULT_CELLDEATH_INPUTS, validateCellDeathInputs, type CellDeathInputs, type DeathSection } from "../../utils/persistence/biologyTools26";
import { validateBiologyResults } from "../../utils/persistence/biologyTools";
import type { BiologyToolId } from "../../navigation/subjects";
import { EvidencePanel } from "../ui/EvidencePanel";

type Props = { openRequest?: { id: string; recordId: string } | null; onOpenHandled?: (requestId: string) => void; onNavigate?: (id: BiologyToolId) => void };

const SECTION_LABEL: Record<DeathSection, string> = { overview: "Cell-fate overview", intrinsic: "Intrinsic apoptosis", extrinsic: "Extrinsic apoptosis", caspases: "Caspase cascade", autophagy: "Autophagy", fate: "Fate map" };
const STATUS_WORD: Record<PathwayStatus, string> = { engaged: "● engaged", "not-engaged": "○ not engaged", blocked: "✕ blocked", possible: "◐ possible (context-dependent)" };
const INTRINSIC_PERTS = ["bcl2-overexpression", "bax-loss", "bak-loss", "p53-loss", "apaf1-loss", "casp9-inhibited", "executioner-inhibited", "bid-loss"];
const EXTRINSIC_PERTS = ["receptor-defective", "fadd-loss", "cflip-high", "casp8-inhibited", "executioner-inhibited", "bid-loss", "bcl2-overexpression", "bax-loss", "bak-loss", "apaf1-loss", "casp9-inhibited"];

function stepStates(steps: PathStep[], values: Record<string, boolean>, step: number): Record<string, Visual> {
  const out: Record<string, Visual> = {};
  steps.forEach((s, i) => { out[s.node] = i < step ? (values[s.node] ? "done" : "dim") : "future"; });
  return out;
}

/** The stepwise mitochondrial diagram: each molecular event is a selectable box placed in the cell compartment where it happens. */
function mitoSpec(ev: { values: Record<string, boolean>; forced: Record<string, boolean> }, step: number, selected: string | null) {
  const steps = PATH_STEPS.intrinsic;
  const pos: Record<string, [number, number]> = { bh3Signal: [190, 10], bh3Effective: [190, 105], baxBak: [190, 200], momp: [440, 236], cytC: [440, 120], apoptosome: [720, 20], casp9: [720, 120], casp37: [720, 220] };
  const nodes: GNode[] = steps.map((s, i) => {
    const n = APOPTOSIS_GRAPH.nodes.find((x) => x.id === s.node)!;
    const on = ev.values[s.node], shown = i < step, isForced = s.node in ev.forced;
    const state: Visual = shown ? (on ? "done" : "dim") : "future";
    const word = !shown ? "· later" : on ? "✓ occurs" : "✕ does not occur";
    const [x, y] = pos[s.node];
    return { id: s.node, x, y, w: 200, h: 78, lines: [...wrapLabel(n.label, 24).slice(0, 3), word], kind: isForced ? "ketone" : "carbon", state: shown && on ? "active" : state, selected: selected === s.node, badge: shown && !on ? "✕" : isForced ? "▲" : undefined, aria: `${n.label}: ${word}` };
  });
  nodes.push({ id: "bcl2", x: 10, y: 120, w: 150, h: 78, lines: ["Pro-survival BCL-2", "family proteins", ev.values.prosurvivalExcess ? "in excess" : "normal level"], kind: "shared" });
  const edges: GEdge[] = [];
  const chain = steps.map((s) => s.node);
  chain.slice(1).forEach((to, i) => { const from = chain[i]; edges.push({ id: `${from}>${to}`, from, to, kind: "main", state: i + 1 < step && ev.values[to] ? "active" : i + 1 <= step ? "dim" : "future" }); });
  edges.push({ id: "bcl2>bh3Effective", from: "bcl2", to: "bh3Effective", kind: "regulation", end: "bar", state: ev.values.prosurvivalExcess ? "active" : "dim" });
  const bands: GBand[] = [
    { id: "cyto", x: 0, y: 0, w: 960, h: 300, label: "Cytosol", tone: "b" },
    { id: "mito", x: 290, y: 300, w: 390, h: 180, label: "Mitochondrion", tone: "e" },
  ];
  const texts: GText[] = [
    { x: 304, y: 336, text: "Outer membrane = the top edge of this box", size: 12 }, { x: 304, y: 400, text: "Intermembrane space holds cytochrome c", size: 12 },
    { x: 304, y: 420, text: ev.values.momp && step >= 4 ? "BAX/BAK pores open: cytochrome c escapes ↑" : "cytochrome c stays inside until MOMP", size: 12, weight: 700 },
    { x: 720, y: 330, text: "Executioner caspases cleave lamins, ICAD,", size: 12 }, { x: 720, y: 346, text: "ROCK1/gelsolin and activate scrambling:", size: 12 }, { x: 720, y: 362, text: "nuclear, DNA, cytoskeletal and membrane", size: 12 }, { x: 720, y: 378, text: "changes of apoptosis.", size: 12 },
  ];
  return { nodes, edges, bands, texts, width: 960, height: 500 };
}

function fateSpec(i: CellDeathInputs, f: ReturnType<typeof evaluateFate>) {
  const { pos, size } = layoutSizeForFate();
  const sc = SCENARIOS.find((s) => s.id === i.fate.scenario)!;
  const rowOf = (id: FateNodeId) => f.rows.find((r) => r.id === id);
  const nodes: GNode[] = FATE_NODES.map((n) => {
    const row = rowOf(n.id), isStressor = n.kind === "stressor", chosen = n.id === sc.stressor;
    const word = isStressor ? (chosen ? "● applied" : "○ not applied") : row ? STATUS_WORD[row.status].split(" (")[0] : "modulator";
    const state: Visual = isStressor ? (chosen ? "active" : "normal") : row?.status === "engaged" ? "active" : row?.status === "blocked" || row?.status === "possible" ? "future" : "normal";
    return { id: n.id, x: pos[n.id][0], y: pos[n.id][1], w: size.w, h: size.h, lines: [...wrapLabel(n.label, 24), word], kind: isStressor ? "lipid" : n.kind === "outcome" ? "product" : n.id === "bcl2" ? "shared" : "carbon", state, selected: i.fate.selected === n.id, badge: row?.status === "blocked" ? "✕" : undefined, aria: `${n.label}: ${word}` };
  });
  const VIA: Record<string, Array<[number, number]>> = { "bcl-auto": [[552, 248], [552, 500]], "ext-int": [[268, 350], [268, 162]] };
  const edges: GEdge[] = FATE_LINKS.map((l) => {
    const fromRow = rowOf(l.from), fromOn = l.from === sc.stressor || fromRow?.status === "engaged" || (l.from === "bcl2" && l.kind === "inhibits" && false);
    return { id: l.id, from: l.from, to: l.to, via: VIA[l.id], kind: l.kind === "activates" ? "main" : "regulation", end: l.kind === "inhibits" ? "bar" : undefined, state: l.evidence === "context-dependent" ? "future" : fromOn ? "active" : "dim", aria: `${l.kind} (${l.evidence}): ${l.text}` };
  });
  const texts: GText[] = [{ x: 10, y: 14, text: "Stressors", weight: 700 }, { x: pos.checkpoint[0], y: 14, text: "Mechanisms", weight: 700 }, { x: pos.arrest[0], y: 14, text: "Outcomes (modelled)", weight: 700 }];
  return { nodes, edges, texts, width: 800, height: 560 };
}

export default function CellDeathPage({ openRequest = null, onOpenHandled, onNavigate }: Props) {
  const ws = useGcWorkspace<CellDeathInputs>({
    page: "celldeath", engineVersion: CELLDEATH_ENGINE_VERSION, defaults: DEFAULT_CELLDEATH_INPUTS, validateInputs: validateCellDeathInputs, validateResults: validateBiologyResults,
    summarize: summarizeCellDeath, describe: describeCellDeath, fallbackName: "Apoptosis & autophagy", openRequest, onOpenHandled,
  });
  const { raw, update } = ws;
  const { section, apop, auto, mode } = raw;
  const path = section === "extrinsic" ? "extrinsic" : "intrinsic";
  const apEv = useMemo(() => evaluateApoptosis(apop), [apop]);
  const auEv = useMemo(() => evaluateAutophagy(auto), [auto]);
  const fate = useMemo(() => evaluateFate(raw.fate), [raw.fate]);
  const questions = useMemo(() => cellDeathQuestions(raw), [raw]);
  const challenge = useMemo(() => cellDeathChallenge(raw, raw.challenge), [raw]);
  const applyChallenge = () => { if (challenge) update((c) => ({ ...challenge.next, challenge: c.challenge + 1 })); };

  const steps = section === "autophagy" ? AUTOPHAGY_STEPS : PATH_STEPS[path];
  const stepVal = section === "autophagy" ? auto.step : apop.step;
  const setStep = (n: number) => update((c) => (section === "autophagy" ? (c.auto.step === n ? c : { ...c, auto: { ...c.auto, step: n } }) : c.apop.step === n ? c : { ...c, apop: { ...c.apop, step: n } }));
  const player = useStepPlayer(stepVal, steps.length, setStep);
  const setSection = (s: DeathSection) => { player.pause(); update((c) => ({ ...c, section: s, selected: null, apop: s === "intrinsic" || s === "extrinsic" ? { ...c.apop, path: s, step: Math.min(c.apop.step, PATH_STEPS[s].length) } : c.apop })); };
  const select = (id: string | null) => update((c) => ({ ...c, selected: c.selected === id ? null : id }));
  const setApop = (patch: Partial<CellDeathInputs["apop"]>) => update((c) => ({ ...c, apop: { ...c.apop, ...patch } }));
  const setAuto = (patch: Partial<CellDeathInputs["auto"]>) => update((c) => ({ ...c, auto: { ...c.auto, ...patch } }));

  const evNow: Evaluation = section === "autophagy" ? auEv : apEv;
  const graphNow = section === "autophagy" ? AUTOPHAGY_GRAPH : APOPTOSIS_GRAPH;
  const caption = (() => {
    if (section === "intrinsic" || section === "extrinsic" || section === "autophagy") {
      if (stepVal === 0) return { title: "Starting state", text: section === "autophagy" ? "Nothing has happened yet. Step through initiation, nucleation, expansion, cargo sequestration, fusion and degradation." : "No event has happened yet. Step through the pathway one molecular event at a time." };
      const s = steps[stepVal - 1];
      const on = evNow.values[s.node];
      const why = rootCauses(graphNow, evNow, s.node).map((c) => `${graphNow.nodes.find((n) => n.id === c.id)!.label} ${c.forced ? "(perturbed) " : ""}is ${c.value ? "ON" : "off"}`).join("; ");
      return { title: `${on ? "✓" : "✕"} ${s.title}`, text: on ? `This event occurs. It depends on: ${why}.` : `This event does not occur, so later steps do not follow in this model. Decided by: ${why}.` };
    }
    return null;
  })();

  const apopPerts = APOPTOSIS_PERTURBATIONS.filter((p) => (path === "intrinsic" ? INTRINSIC_PERTS : EXTRINSIC_PERTS).includes(p.id) || apop.perturbations.includes(p.id));
  const stimuli = (
    <Panel subtitle="Choose what the cell experiences, then add perturbations." title="Stimulus and perturbations">
      <CheckRow checked={apop.dnaDamage} id="stim-dna" label="Severe DNA damage" onChange={(v) => setApop({ dnaDamage: v })} />
      <CheckRow checked={apop.gfWithdrawal} id="stim-gf" label="Growth-factor withdrawal" onChange={(v) => setApop({ gfWithdrawal: v })} />
      <CheckRow checked={apop.erStress} id="stim-er" label="Severe, unresolved ER stress" onChange={(v) => setApop({ erStress: v })} />
      <CheckRow checked={apop.mitoStress} id="stim-mito" label="Mitochondrial stress" onChange={(v) => setApop({ mitoStress: v })} />
      <CheckRow checked={apop.deathLigand} id="stim-fasl" label="Death ligand (FasL) present" onChange={(v) => setApop({ deathLigand: v })} />
      <CheckRow checked={apop.typeII} id="stim-type2" label="Type II cell (needs mitochondrial amplification)" onChange={(v) => setApop({ typeII: v })} />
      <PerturbationList canAddFn={canAddDeathPerturbation} catalogue={apopPerts} max={MAX_DEATH_PERTURBATIONS} onToggle={(id, on) => update((c) => ({ ...c, apop: { ...c.apop, perturbations: on ? [...c.apop.perturbations, id] : c.apop.perturbations.filter((p) => p !== id) } }))} selected={apop.perturbations} />
    </Panel>
  );
  const autoPanel = (
    <Panel subtitle="Starvation (mTORC1 off) initiates autophagy; nutrients keep it off." title="Conditions and perturbations">
      <CheckRow checked={auto.nutrients} id="auto-nutrients" label="Nutrients (amino acids, growth factors) available" onChange={(v) => setAuto({ nutrients: v })} />
      <CheckRow checked={auto.energyStress} id="auto-energy" label="Low energy (AMPK active)" onChange={(v) => setAuto({ energyStress: v })} />
      <CheckRow checked={auto.cargoAvailable} id="auto-cargo" label="Cargo available (aggregates, damaged organelles)" onChange={(v) => setAuto({ cargoAvailable: v })} />
      <PerturbationList canAddFn={canAddAutophagyPerturbation} catalogue={AUTOPHAGY_PERTURBATIONS} max={MAX_AUTOPHAGY_PERTURBATIONS} onToggle={(id, on) => update((c) => ({ ...c, auto: { ...c.auto, perturbations: on ? [...c.auto.perturbations, id] : c.auto.perturbations.filter((p) => p !== id) } }))} selected={auto.perturbations} />
    </Panel>
  );

  const fSel = raw.fate.selected ? FATE_NODES.find((n) => n.id === raw.fate.selected)! : null;
  const fSpec = fateSpec(raw, fate);
  const mito = mitoSpec(apEv, apop.step, raw.selected);

  return (
    <div className="gc-page ph-page bio-page">
      <ToolHeader
        group="Cell organization & regulation"
        title="Apoptosis & autophagy"
        purpose="Intrinsic (mitochondrial) and extrinsic (death-receptor) apoptosis, the caspase cascade, and macroautophagy as a separate recycling pathway, with a fate map linking selected stressors to the mechanisms they engage. Pathway outcomes are derived from the mechanism; whether a cell lives or dies is deliberately left undetermined."
        evidence="model"
        steps={[{ label: "Pick a pathway", detail: "Intrinsic, extrinsic, caspases, autophagy or the fate map." }, { label: "Step through", detail: "Select any component to see its state and the rule it follows." }, { label: "Perturb and predict", detail: "BCL-2, BAX/BAK, APAF1, caspases, receptors, mTOR, ULK1, lysosomes." }]}
        aside={<Badge tone="neutral" title="Curated mechanisms; no probabilities or clinical predictions.">Mechanism graph</Badge>}
      />
      {ws.chrome}
      <div className="gc-toolbar">
        <LearningModeSwitch mode={mode} modes={["explore", "practice", "challenge"]} onChange={(m) => update((c) => ({ ...c, mode: m }))} />
        {ws.actions}
      </div>
      {ws.saveFormEl}
      <div className="c23-sections"><Segmented<DeathSection> label="Section" onChange={setSection} options={DEATH_SECTIONS.map((s) => ({ id: s, label: SECTION_LABEL[s] }))} value={section} /></div>

      {section === "overview" ? (
        <>
          <Panel subtitle="A damaged or stressed cell has several possible courses. The tool models selected mechanisms, not the choice between them." title="What can happen to a stressed cell">
            <ul className="gc-assumptions" data-testid="fate-list">
              <li><strong>Survival.</strong> Many stresses are tolerated or buffered.</li>
              <li><strong>Repair and recovery.</strong> Damage is fixed and the cell resumes its normal state.</li>
              <li><strong>Cell-cycle arrest.</strong> Checkpoints pause progression (see Cell cycle &amp; checkpoints). Arrest can be transient or permanent (senescence).</li>
              <li><strong>Apoptosis.</strong> A regulated, caspase-executed death: intrinsic (mitochondrial) or extrinsic (death-receptor).</li>
              <li><strong>Autophagy.</strong> Lysosomal recycling of cellular components. It is not a form of apoptosis and does not by itself kill the cell.</li>
              <li><strong>Other regulated death</strong> (for example necroptosis, pyroptosis, ferroptosis) is mentioned for comparison and not modelled.</li>
            </ul>
            <Callout tone="info" title="Regulated versus accidental death">
              <p>Regulated cell death runs on dedicated molecular machinery that can be blocked or enhanced. Accidental, injury-induced death follows physical or chemical damage that overwhelms the cell. Not every kind of damage produces apoptosis.</p>
            </Callout>
            <div className="b26-cargo-btns">
              {(["intrinsic", "extrinsic", "autophagy", "fate"] as const).map((s) => <button className="secondary-button" data-testid={`open-${s}`} key={s} onClick={() => setSection(s)} type="button">Open {SECTION_LABEL[s]}</button>)}
            </div>
          </Panel>
        </>
      ) : null}

      {section === "intrinsic" ? (
        <div className="gc-layout">
          <div className="gc-inputs">{stimuli}</div>
          <div className="gc-stage">
            <StepControls locked={mode === "challenge"} max={PATH_STEPS.intrinsic.length} onStep={setStep} player={player} step={apop.step} unit="Event" extra={<button className="secondary-button" data-testid="replay" onClick={() => setStep(0)} type="button">Reset to start</button>} />
            {caption ? <div aria-live="polite" className="bio-caption" data-testid="step-caption"><h3>{caption.title}</h3><p>{caption.text}</p></div> : null}
            <DiagramFrame caption="Each box is one molecular event. ✓ occurs, ✕ does not occur, · later. The red bar shows pro-survival BCL-2 proteins restraining the BH3 signal." label="Stepwise mitochondrial apoptosis diagram" title="Intrinsic pathway">
              <GraphDiagram bands={mito.bands} edges={mito.edges} height={mito.height} label="Intrinsic apoptosis steps" minWidth={720} nodes={mito.nodes} onNode={(id) => select(id)} texts={mito.texts} width={mito.width} />
            </DiagramFrame>
            <p className="bio-score" data-testid="path-progress">Pathway reaches step {pathProgress("intrinsic", apEv.values)} of {PATH_STEPS.intrinsic.length}</p>
            {raw.selected ? <NodeDetail ev={apEv} graph={APOPTOSIS_GRAPH} id={raw.selected} onClear={() => select(null)} /> : <p className="bio-note">Select an event to see what it is, where it happens and what decides it.</p>}
            <OutcomePanel outcome={apEv.outcome} />
          </div>
        </div>
      ) : null}

      {section === "extrinsic" ? (
        <div className="gc-layout">
          <div className="gc-inputs">{stimuli}</div>
          <div className="gc-stage">
            <StepControls locked={mode === "challenge"} max={PATH_STEPS.extrinsic.length} onStep={setStep} player={player} step={apop.step} unit="Event" extra={<button className="secondary-button" data-testid="replay" onClick={() => setStep(0)} type="button">Reset to start</button>} />
            {caption ? <div aria-live="polite" className="bio-caption" data-testid="step-caption"><h3>{caption.title}</h3><p>{caption.text}</p></div> : null}
            <DiagramFrame caption="Fas is shown as the example death receptor; other death receptors use different adaptors. Dashed boxes are not yet reached." label="Extrinsic apoptosis diagram" legend={<GraphLegend items={REG_LEGEND} />} title="Extrinsic (death-receptor) pathway">
              <RegDiagram forced={apEv.forced} graph={APOPTOSIS_GRAPH} label="Extrinsic apoptosis graph" module="extrinsic" onSelect={select} selected={raw.selected} stepStates={stepStates(PATH_STEPS.extrinsic, apEv.values, apop.step)} values={apEv.values} />
            </DiagramFrame>
            <p className="bio-score" data-testid="path-progress">Pathway reaches step {pathProgress("extrinsic", apEv.values)} of {PATH_STEPS.extrinsic.length}</p>
            <Callout tone="info" title="Extrinsic versus intrinsic">
              <p>The extrinsic pathway starts at a death receptor and caspase-8; the intrinsic pathway starts with BH3-only proteins and mitochondria. They connect through BID: caspase-8 cleaves BID to tBID, which engages BAX/BAK. Type II cells need this link; type I cells activate caspase-3/7 directly.</p>
            </Callout>
            {raw.selected ? <NodeDetail ev={apEv} graph={APOPTOSIS_GRAPH} id={raw.selected} onClear={() => select(null)} /> : <p className="bio-note">Select a component to see its role.</p>}
            <OutcomePanel outcome={apEv.outcome} />
          </div>
        </div>
      ) : null}

      {section === "caspases" ? (
        <div className="gc-layout">
          <div className="gc-inputs">{stimuli}</div>
          <div className="gc-stage">
            <Panel subtitle="Initiator caspases are activated on platforms; executioner caspases are activated by cleavage and act on many substrates." title="Initiator and executioner caspases">
              <div className="c23-tablewrap"><table className="c23-table" data-testid="caspase-table">
                <thead><tr><th scope="col">Caspase</th><th scope="col">Kind</th><th scope="col">Platform</th><th scope="col">Activation</th><th scope="col">State now</th></tr></thead>
                <tbody>{CASPASES.map((c) => <tr key={c.id}><th scope="row">{c.name}</th><td>{c.kind}</td><td>{c.platform}</td><td>{c.activation}</td><td data-testid={`caspase-state-${c.id}`}>{apEv.values[c.id === "casp3" || c.id === "casp7" ? "casp37" : c.id] ? "active" : "inactive"}</td></tr>)}</tbody>
              </table></div>
            </Panel>
            <DiagramFrame caption="Executioner caspase-3/7 activation leads to the dismantling steps shown below it. Dashed boxes come from the apoptosis pathways above." label="Caspase cascade diagram" legend={<GraphLegend items={REG_LEGEND} />} title="From initiator to dismantling">
              <RegDiagram forced={apEv.forced} graph={APOPTOSIS_GRAPH} label="Caspase cascade graph" module="caspase" onSelect={select} selected={raw.selected} values={apEv.values} />
            </DiagramFrame>
            {raw.selected ? <NodeDetail ev={apEv} graph={APOPTOSIS_GRAPH} id={raw.selected} onClear={() => select(null)} /> : <p className="bio-note">Select a box to see the consequence or caspase.</p>}
            <OutcomePanel outcome={apEv.outcome} />
          </div>
        </div>
      ) : null}

      {section === "autophagy" ? (
        <div className="gc-layout">
          <div className="gc-inputs">{autoPanel}</div>
          <div className="gc-stage">
            <StepControls locked={mode === "challenge"} max={AUTOPHAGY_STEPS.length} onStep={setStep} player={player} step={auto.step} unit="Stage" extra={<button className="secondary-button" data-testid="replay" onClick={() => setStep(0)} type="button">Reset to start</button>} />
            {caption ? <div aria-live="polite" className="bio-caption" data-testid="step-caption"><h3>{caption.title}</h3><p>{caption.text}</p></div> : null}
            <DiagramFrame caption="Macroautophagy: initiation (ULK1), nucleation (Beclin 1–VPS34), expansion (LC3), cargo sequestration, autophagosome–lysosome fusion, degradation and recycling. A separate pathway from apoptosis." label="Autophagy pathway diagram" legend={<GraphLegend items={REG_LEGEND} />} title="Macroautophagy">
              <RegDiagram forced={auEv.forced} graph={AUTOPHAGY_GRAPH} label="Autophagy graph" module="autophagy" onSelect={select} selected={raw.selected} stepStates={stepStates(AUTOPHAGY_STEPS, auEv.values, auto.step)} values={auEv.values} />
            </DiagramFrame>
            <p className="bio-score" data-testid="path-progress">Autophagy reaches stage {auEv.progress} of {AUTOPHAGY_STEPS.length}</p>
            {raw.selected ? <NodeDetail ev={auEv} graph={AUTOPHAGY_GRAPH} id={raw.selected} onClear={() => select(null)} /> : <p className="bio-note">Select a component to see its rule.</p>}
            <OutcomePanel outcome={auEv.outcome} />
            {onNavigate ? <p className="c23-note">Lysosomes and their acidification: <button className="ghost-button" onClick={() => onNavigate("bioOrganelles")} type="button">Organelles &amp; protein trafficking</button>.</p> : null}
          </div>
        </div>
      ) : null}

      {section === "fate" ? (
        <div className="gc-layout">
          <div className="gc-inputs">
            <Panel subtitle="Pick a stressor; the map shows which modelled mechanisms are engaged." title="Stressor and perturbations">
              <Segmented<ScenarioId> label="Stressor" onChange={(s) => update((c) => ({ ...c, fate: { ...c.fate, scenario: s } }))} options={SCENARIOS.map((s) => ({ id: s.id, label: s.label }))} value={raw.fate.scenario} />
              <p className="bio-note" data-testid="scenario-summary">{SCENARIOS.find((s) => s.id === raw.fate.scenario)!.summary}</p>
              <PerturbationList canAddFn={canAddFatePerturbation} catalogue={FATE_PERTURBATIONS} max={MAX_FATE_PERTURBATIONS} onToggle={(id, on) => update((c) => ({ ...c, fate: { ...c.fate, perturbations: on ? [...c.fate.perturbations, id] : c.fate.perturbations.filter((p) => p !== id) } }))} selected={raw.fate.perturbations} />
            </Panel>
          </div>
          <div className="gc-stage">
            <DiagramFrame caption="Solid arrows are established connections; dashed arrows are context-dependent. Red bar arrows inhibit. Teal boxes are engaged, dashed boxes are possible or blocked (✕ = blocked). This is a teaching map, not a predictor of cell fate." label="Cell-fate map" title="Stressors, mechanisms and outcomes">
              <GraphDiagram edges={fSpec.edges} height={fSpec.height} label="Cell-fate map" minWidth={680} nodes={fSpec.nodes} onNode={(id) => update((c) => ({ ...c, fate: { ...c.fate, selected: c.fate.selected === id ? null : (id as FateNodeId) } }))} texts={fSpec.texts} width={fSpec.width} />
            </DiagramFrame>
            <Panel subtitle="Derived from the same pathway graphs as the other views." title="Mechanisms engaged in this scenario">
              <ul className="b26-fate-rows" data-testid="fate-rows">
                {fate.rows.map((r) => (
                  <li data-testid={`fate-row-${r.id}`} key={r.id}>
                    <span><strong>{r.label}</strong> <span className={`b26-status ${r.status === "not-engaged" ? "" : r.status}`}>{STATUS_WORD[r.status]}</span> <small>{r.evidence}</small></span>
                    <p>{r.text}</p>
                  </li>
                ))}
              </ul>
            </Panel>
            {fSel ? (
              <Panel subtitle="Selected in the map." title={fSel.label}>
                <ul className="gc-assumptions" data-testid="fate-links">
                  {FATE_LINKS.filter((l) => l.from === fSel.id || l.to === fSel.id).map((l) => <li key={l.id}><strong>{FATE_NODES.find((n) => n.id === l.from)!.label} {l.kind === "activates" ? "→" : "⊣"} {FATE_NODES.find((n) => n.id === l.to)!.label}</strong> ({l.evidence}): {l.text}</li>)}
                </ul>
                <button className="ghost-button" onClick={() => update((c) => ({ ...c, fate: { ...c.fate, selected: null } }))} type="button">Clear selection</button>
              </Panel>
            ) : <p className="bio-note">Select a box to see its connections and how well established each one is.</p>}
            <OutcomePanel outcome={{ definite: fate.established, uncertain: fate.uncertain }} title="Established versus uncertain" />
          </div>
        </div>
      ) : null}

      {mode === "practice" ? <QuizPanel questions={questions} /> : null}
      {mode === "challenge" ? (challenge ? <PredictPanel finished={false} onReveal={applyChallenge} question={challenge.question} revealLabel={`Apply: ${challenge.label}`} subtitle="Commit to a prediction first; the perturbation is then applied to the diagram." /> : <Callout tone="info" title="Nothing to predict"><p>No challenge is available.</p></Callout>) : null}

      <Panel subtitle="What this tool does and does not model." title="Assumptions and limits">
        <ul className="gc-assumptions">{DEATH_ASSUMPTIONS.map((a) => <li key={a}>{a}</li>)}</ul>
      </Panel>
      {onNavigate ? <p className="c23-note">Related: <button className="ghost-button" onClick={() => onNavigate("bioCellCycle")} type="button">Cell cycle &amp; checkpoints</button> <button className="ghost-button" onClick={() => onNavigate("bioSignaling")} type="button">Cell signaling</button></p> : null}
      <EvidencePanel id="bio-apoptosis" />
      <ProvenancePanel tool="celldeath" />
      <RelatedConcepts subject="biology" toolId="bioCellDeath" />
    </div>
  );
}
