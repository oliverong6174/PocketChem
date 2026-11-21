import { useMemo } from "react";
import { RelatedConcepts } from "../ui/RelatedConcepts";
import { LearningModeSwitch } from "../ui/LearningModeSwitch";
import { Badge, Callout, DiagramFrame, Panel, Segmented, ToolHeader } from "../ui/primitives";
import { GraphDiagram, type GEdge, type GNode, type Visual } from "../biochem/metabolism/GraphDiagram";
import { useGcWorkspace } from "../generalChem/useGcWorkspace";
import { PredictPanel, QuizPanel, StepControls } from "./bioShared";
import { useStepPlayer } from "./bioHooks";
import { CheckRow } from "./cell23";
import { CellMap26 } from "./CellMap26";
import { ChipList, NodeDetail, OutcomePanel, PerturbationList, RegDiagram } from "./reg26";
import { REG_LEGEND } from "./layout26";
import {
  CARGOS, ENDO_CARGOS, ENDO_PERTURBATIONS, ENDO_STAGES, MAX_TRAFF_PERTURBATIONS, ORGANELLES, QC_GRAPH, QC_PERTURBATIONS, TRAFF_PERTURBATIONS, VESICLE_ROUTES, VESICLE_STAGES, VESICLE_STAGE_DISTINCTION, VESICLE_STAGE_TITLE,
  cargoById, compartmentOf, endoCargo, endoStage, evaluateQc, organelleById, processesThrough, topologyAt, traceCargo, traceEndocytosis, transitionBetween, vesicleRoute,
  type CargoId, type EndoPert, type TraffPertId, type VesicleRoute, type VesicleStageId,
} from "../../utils/biology/trafficking26";
import { canAdd, type Outcome } from "../../utils/biology/mechanism26";
import { organelleChallenge, organelleQuestions } from "../../utils/biology/bioLearning26";
import { ORGANELLE_ASSUMPTIONS, describeOrganelles, summarizeOrganelles } from "../../utils/biology/bioSummary26";
import { ORGANELLES_ENGINE_VERSION, validateOrganelleInputs, DEFAULT_ORGANELLE_INPUTS, type OrganelleInputs, type OrganelleSection } from "../../utils/persistence/biologyTools26";
import { validateBiologyResults } from "../../utils/persistence/biologyTools";
import type { BiologyToolId } from "../../navigation/subjects";

type Props = { openRequest?: { id: string; recordId: string } | null; onOpenHandled?: (requestId: string) => void; onNavigate?: (id: BiologyToolId) => void };

const SECTIONS: Array<{ id: OrganelleSection; label: string }> = [
  { id: "cell", label: "Cell organization" }, { id: "tracker", label: "Cargo tracker" }, { id: "vesicles", label: "Vesicle transport" }, { id: "endosomes", label: "Endosomes & lysosomes" }, { id: "quality", label: "Protein quality control" },
];
const CARGO_SHORT: Record<CargoId, string> = { cytosolic: "Cytosolic", secreted: "Secreted", membrane: "Membrane", lysosomal: "Lysosomal hydrolase", nuclear: "Nuclear", mitochondrial: "Mitochondrial matrix" };

function qcOutcome(v: Record<string, boolean>): Outcome {
  const d: string[] = [], u: string[] = [];
  if (v.exported) d.push("The protein folds, passes quality control and is exported from the ER in COPII carriers.");
  else d.push("The protein is misfolded and is retained in the ER: it is not exported.");
  if (v.proteasomeDeg) d.push("It is retrotranslocated by ERAD, polyubiquitinated and degraded by the proteasome.");
  if (v.retro && !v.proteasomeDeg) d.push("It is retrotranslocated and ubiquitinated, but the proteasome is not functional, so it is not degraded.");
  if (v.lysoDeg) d.push("It is delivered to lysosomes for degradation (autophagy / ER-phagy), a route distinct from the proteasome.");
  if (v.accumulates) { d.push("No modelled degradation route is available, so the protein accumulates."); u.push("Accumulation is expected to trigger the unfolded protein response; its consequences are not modelled."); }
  u.push("Rates of folding and degradation, and the fate of the cell, are not modelled.");
  return { definite: d, uncertain: u };
}

export default function OrganellesPage({ openRequest = null, onOpenHandled, onNavigate }: Props) {
  const ws = useGcWorkspace<OrganelleInputs>({
    page: "organelles", engineVersion: ORGANELLES_ENGINE_VERSION, defaults: DEFAULT_ORGANELLE_INPUTS, validateInputs: validateOrganelleInputs, validateResults: validateBiologyResults,
    summarize: summarizeOrganelles, describe: describeOrganelles, fallbackName: "Organelles & protein trafficking", openRequest, onOpenHandled,
  });
  const { raw, update } = ws;
  const mode = raw.mode, section = raw.section;
  const trace = useMemo(() => traceCargo(raw.cargo, raw.perturbations), [raw.cargo, raw.perturbations]);
  const cargo = cargoById(raw.cargo);
  const step = Math.min(raw.step, trace.steps.length - 1);
  const setStep = (n: number) => update((c) => (c.step === n ? c : { ...c, step: n }));
  const player = useStepPlayer(step, trace.steps.length - 1, setStep);
  const setSection = (s: OrganelleSection) => { player.pause(); update((c) => ({ ...c, section: s })); };
  const questions = useMemo(() => organelleQuestions(raw), [raw]);
  const challenge = useMemo(() => organelleChallenge(raw, raw.challenge), [raw]);
  const applyChallenge = () => { if (challenge) update((c) => ({ ...challenge.next, challenge: c.challenge + 1 })); };
  const openInTracker = (id: CargoId) => update((c) => ({ ...c, section: "tracker", cargo: id, perturbations: [], step: 0 }));

  const cur = trace.steps[step];
  const topo = topologyAt(raw.cargo, trace, step);
  const trans = step > 0 && trace.steps[step - 1].at !== cur.at ? transitionBetween(trace.steps[step - 1].at, cur.at) : null;
  const atEnd = step === trace.steps.length - 1;

  const togglePert = (id: TraffPertId, on: boolean) => update((c) => {
    const perturbations = on ? [...c.perturbations, id] : c.perturbations.filter((p) => p !== id);
    return { ...c, perturbations, step: Math.min(c.step, traceCargo(c.cargo, perturbations).steps.length - 1) };
  });
  const selOrg = raw.organelle ? organelleById(raw.organelle) : null;

  // vesicle diagram
  const vr = vesicleRoute(raw.vesicle.route);
  const vStage = raw.vesicle.stage;
  const setVesicle = (patch: Partial<OrganelleInputs["vesicle"]>) => update((c) => ({ ...c, vesicle: { ...c.vesicle, ...patch } }));
  const vpos: Record<string, [number, number]> = { donor: [20, 10], selection: [20, 100], budding: [280, 100], transport: [540, 100], tethering: [540, 210], docking: [280, 210], fusion: [20, 210], acceptor: [20, 310] };
  const vnodes: GNode[] = [
    { id: "donor", x: vpos.donor[0], y: vpos.donor[1], w: 200, h: 50, lines: ["Donor membrane", compartmentOf(vr.donor).name.slice(0, 28)], kind: "pathway", state: "normal" },
    ...VESICLE_STAGES.map((s): GNode => ({ id: s, x: vpos[s][0], y: vpos[s][1], w: 200, h: 66, lines: [VESICLE_STAGE_TITLE[s], ...(vr.stage[s].machinery[0].length > 30 ? [vr.stage[s].machinery[0].slice(0, 30) + "…"] : [vr.stage[s].machinery[0]])], kind: "carbon", state: vStage === s ? "active" : "normal", selected: vStage === s })),
    { id: "acceptor", x: vpos.acceptor[0], y: vpos.acceptor[1], w: 200, h: 50, lines: ["Acceptor membrane", compartmentOf(vr.acceptor).name.slice(0, 28)], kind: "pathway", state: "normal" },
  ];
  const chain = ["donor", ...VESICLE_STAGES, "acceptor"];
  const vedges: GEdge[] = chain.slice(1).map((to, i) => ({ id: `${chain[i]}>${to}`, from: chain[i], to, kind: "main" as const }));

  // endosome diagram
  const ec = endoCargo(raw.endo.cargo), et = traceEndocytosis(ec.id, raw.endo.perturbations);
  const epos: Record<string, [number, number]> = { uptake: [20, 110], early: [250, 110], recycle: [480, 20], transcytosed: [710, 20], late: [480, 200], lysosome: [710, 200], degraded: [710, 290] };
  const enodes: GNode[] = ENDO_STAGES.map((s) => {
    const on = et.path.includes(s.id);
    const blockedDeg = s.id === "degraded" && on && !et.degrades;
    const state: Visual = blockedDeg ? "future" : on ? (raw.endo.stage === s.id ? "active" : "done") : "dim";
    return { id: s.id, x: epos[s.id][0], y: epos[s.id][1], w: 200, h: 62, lines: [s.title.length > 26 ? s.title.slice(0, 25) + "…" : s.title, `pH ${s.ph.split(" ")[0] === "≈" ? s.ph.replace("≈ ", "≈") : s.ph}`.slice(0, 30)], kind: s.id === "degraded" ? "product" : "carbon", state, selected: raw.endo.stage === s.id, badge: blockedDeg ? "✕" : undefined, aria: `${s.title}${on ? "" : " (not on this cargo's route)"}${blockedDeg ? " (does not occur: no acidification)" : ""}` };
  });
  const eedges: GEdge[] = [["uptake", "early"], ["early", "recycle"], ["recycle", "transcytosed"], ["early", "late"], ["late", "lysosome"], ["lysosome", "degraded"]].map(([a, b]) => {
    const ia = et.path.indexOf(a as never), ib = et.path.indexOf(b as never);
    return { id: `${a}>${b}`, from: a, to: b, kind: "main" as const, state: ia >= 0 && ib === ia + 1 ? "active" as Visual : "dim" as Visual };
  });
  const setEndo = (patch: Partial<OrganelleInputs["endo"]>) => update((c) => ({ ...c, endo: { ...c.endo, ...patch } }));
  const toggleEndoPert = (id: EndoPert, on: boolean) => setEndo({ perturbations: on ? [...raw.endo.perturbations, id] : raw.endo.perturbations.filter((p) => p !== id) });
  const selEndo = raw.endo.stage ? endoStage(raw.endo.stage) : null;
  const m6pSteps = CARGOS.find((c) => c.id === "lysosomal")!.steps.filter((s) => s.gate === "m6p-blocked");

  // quality control
  const qcEv = useMemo(() => evaluateQc(raw.qc), [raw.qc]);
  const setQc = (patch: Partial<OrganelleInputs["qc"]>) => update((c) => ({ ...c, qc: { ...c.qc, ...patch, aggregates: (patch.defect === false ? false : patch.aggregates ?? c.qc.aggregates) } }));

  return (
    <div className="gc-page ph-page bio-page">
      <ToolHeader
        group="Cell organization & regulation"
        title="Organelles & protein trafficking"
        purpose="Select an organelle, then follow a curated protein from its ribosome to its destination. Each step synchronises the cargo's position, the membrane compartment, the molecular machinery, its processing state and the direction of movement, and every perturbation is derived from the transport graph."
        evidence="model"
        steps={[{ label: "Explore the cell", detail: "Select an organelle and read its functions and the routes that pass through it." }, { label: "Track a cargo", detail: "Pick a protein class and step through its route." }, { label: "Perturb and predict", detail: "Disable SRP, ER export, NLS recognition, M6P tagging and more." }]}
        aside={<Badge tone="neutral" title="Curated routes for six cargo classes. Not a localisation predictor.">Transport graph</Badge>}
      />
      {ws.chrome}
      <div className="gc-toolbar">
        <LearningModeSwitch mode={mode} modes={["explore", "practice", "challenge"]} onChange={(m) => update((c) => ({ ...c, mode: m }))} />
        {ws.actions}
      </div>
      {ws.saveFormEl}
      <div className="c23-sections"><Segmented<OrganelleSection> label="Section" onChange={setSection} options={SECTIONS.map((s) => ({ id: s.id, label: s.label }))} value={section} /></div>

      {section === "cell" ? (
        <>
          <Panel subtitle="Select an organelle in the diagram or from the list. Positions and sizes are schematic, not measured." title="A representative eukaryotic animal cell">
            <DiagramFrame caption="Schematic: the shapes show relationships (the nuclear envelope is continuous with the ER; carriers travel between compartments), not experimentally measured sizes or positions." label="Schematic animal cell with selectable organelles" title="Animal cell">
              <CellMap26 onSelect={(id) => update((c) => ({ ...c, organelle: id }))} selected={raw.organelle} />
            </DiagramFrame>
            <div className="b26-cargo-btns" role="group" aria-label="Organelles">
              {ORGANELLES.map((o) => <button aria-pressed={raw.organelle === o.id} className="secondary-button" data-testid={`org-${o.id}`} key={o.id} onClick={() => update((c) => ({ ...c, organelle: c.organelle === o.id ? null : o.id }))} type="button">{o.name}</button>)}
            </div>
          </Panel>
          {selOrg ? (
            <Panel subtitle="Selected organelle." title={selOrg.name}>
              <dl className="b26-facts" data-testid="organelle-detail">
                <dt>Boundary</dt><dd>{selOrg.boundary}</dd>
                <dt>Functions</dt><dd><ul className="gc-assumptions">{selOrg.functions.map((f) => <li key={f}>{f}</li>)}</ul></dd>
                <dt>Relationships</dt><dd>{selOrg.relation}</dd>
                <dt>In this drawing</dt><dd>{selOrg.schematic}</dd>
              </dl>
              {(() => {
                const through = processesThrough(selOrg.id);
                return through.length ? (
                  <div data-testid="organelle-processes">
                    <h3>Connected processes in the cargo routes</h3>
                    <ul className="gc-assumptions">{through.map((p) => <li key={p.cargo}><strong>{p.cargoName}</strong>: {p.steps.join("; ")} <button className="ghost-button" onClick={() => openInTracker(p.cargo)} type="button">Track this cargo</button></li>)}</ul>
                  </div>
                ) : <p className="bio-note">No modelled cargo route passes through this organelle; it is shown for context.</p>;
              })()}
              <button className="ghost-button" onClick={() => update((c) => ({ ...c, organelle: null }))} type="button">Clear selection</button>
            </Panel>
          ) : <p className="bio-note">Select an organelle to see its functions and the processes that pass through it.</p>}
        </>
      ) : null}

      {section === "tracker" ? (
        <>
          <Panel subtitle="Choose a protein class. The route is a curated, validated sequence of compartment transitions." title="Cargo">
            <div className="b26-cargo-btns" role="group" aria-label="Cargo class">
              {CARGOS.map((c) => <button aria-pressed={raw.cargo === c.id} className="secondary-button" data-testid={`cargo-${c.id}`} key={c.id} onClick={() => { player.pause(); update((x) => ({ ...x, cargo: c.id, step: 0 })); }} type="button">{CARGO_SHORT[c.id]}</button>)}
            </div>
            <dl className="b26-facts" data-testid="cargo-facts">
              <dt>Example</dt><dd>{cargo.example}</dd>
              <dt>Translated</dt><dd>{cargo.translatedAt}</dd>
              <dt>Targeting signal</dt><dd>{cargo.signal}</dd>
              <dt>Recognition</dt><dd>{cargo.recognition}</dd>
              <dt>Route</dt><dd>{cargo.routeSummary}</dd>
              <dt>Destination</dt><dd>{cargo.destinationNote}</dd>
              <dt>Limits</dt><dd>{cargo.limits}</dd>
            </dl>
            <fieldset className="c23-fieldset">
              <legend>Perturbations (up to {MAX_TRAFF_PERTURBATIONS})</legend>
              <div className="c23-pert-list">
                {TRAFF_PERTURBATIONS.map((p) => {
                  const checked = raw.perturbations.includes(p.id);
                  return <CheckRow checked={checked} id={`pert-${p.id}`} key={p.id} label={p.label} onChange={(v) => { if (v && raw.perturbations.length >= MAX_TRAFF_PERTURBATIONS) return; togglePert(p.id, v); }} />;
                })}
              </div>
              <button className="ghost-button" disabled={!raw.perturbations.length} onClick={() => update((c) => ({ ...c, perturbations: [], step: Math.min(c.step, traceCargo(c.cargo, []).steps.length - 1) }))} type="button">Clear perturbations</button>
            </fieldset>
          </Panel>
          <div className="gc-stage">
            <StepControls locked={mode === "challenge"} max={trace.steps.length - 1} onStep={setStep} player={player} step={step} unit="Step" />
            <div aria-live="polite" className="bio-caption" data-testid="step-caption"><h3>{cur.title}</h3><p>{cur.explanation}</p></div>
            <DiagramFrame caption="Numbered teal arrows are steps taken; dashed grey arrows are steps still to come; a red ✕ arrow is the step that cannot occur. “P” marks the cargo." label="Cargo route through the cell" title={`${cargo.name} route`}>
              <CellMap26 route={{ at: trace.steps.map((s) => s.at), current: step, blockedAt: trace.blocked && atEnd ? trace.blocked.at : null }} selected={null} />
            </DiagramFrame>
            <Panel subtitle={`Step ${step + 1} of ${trace.steps.length}`} title="This step">
              <dl className="b26-facts" data-testid="step-detail">
                <dt>Compartment</dt><dd data-testid="step-compartment">{compartmentOf(cur.at).name}</dd>
                <dt>Machinery</dt><dd>{cur.machinery.length ? <ChipList items={cur.machinery} /> : "None needed"}</dd>
                <dt>Processing state</dt><dd data-testid="step-processing">{cur.processing}</dd>
                <dt>Direction</dt><dd>{cur.direction}</dd>
                {trans ? <><dt>Transport step</dt><dd>{trans.kind}: {trans.note}</dd></> : null}
                {topo ? <><dt>Membrane topology</dt><dd data-testid="step-topology">N-terminal domain faces: {topo.nDomain}. C-terminal domain faces: {topo.cDomain}.</dd></> : null}
              </dl>
              {atEnd && trace.blocked ? <Callout tone="warn" title={`Blocked: ${trace.blocked.title}`}><p data-testid="blocked-note">{trace.summary}</p></Callout> : null}
            </Panel>
            <OutcomePanel outcome={trace.outcome} title={`Outcome for ${cargo.name.toLowerCase()}`} />
          </div>
        </>
      ) : null}

      {section === "vesicles" ? (
        <>
          <Panel subtitle="A coat selects cargo and forms the bud; Rab GTPases and tethers capture the vesicle; SNAREs fuse it. These are separate stages." title="Vesicle transport">
            <Segmented<VesicleRoute["id"]> label="Transport route" onChange={(r) => setVesicle({ route: r })} options={VESICLE_ROUTES.map((r) => ({ id: r.id, label: r.id === "copii" ? "COPII" : r.id === "copi" ? "COPI" : r.id === "clathrin-ap2" ? "Clathrin / AP-2" : "Clathrin / AP-1" }))} value={raw.vesicle.route} />
            <p className="bio-note" data-testid="vesicle-route">{vr.name}</p>
            <DiagramFrame caption="Select a stage. Each stage names the machinery that acts in it; budding, transport, tethering, docking and fusion are different events." label="Stages of vesicle transport" title="From donor to acceptor membrane">
              <GraphDiagram edges={vedges} height={380} label="Vesicle transport stages" minWidth={640} nodes={vnodes} onNode={(id) => { if (id !== "donor" && id !== "acceptor") setVesicle({ stage: raw.vesicle.stage === id ? null : (id as VesicleStageId) }); }} width={760} />
            </DiagramFrame>
          </Panel>
          {vStage ? (
            <Panel subtitle="Selected stage." title={VESICLE_STAGE_TITLE[vStage]}>
              <dl className="b26-facts" data-testid="vesicle-detail">
                <dt>What happens</dt><dd>{vr.stage[vStage].text}</dd>
                <dt>Machinery</dt><dd><ChipList items={vr.stage[vStage].machinery} /></dd>
                <dt>How this stage differs</dt><dd>{VESICLE_STAGE_DISTINCTION[vStage]}</dd>
              </dl>
            </Panel>
          ) : <p className="bio-note">Select a stage in the diagram to inspect its mechanism.</p>}
          <Panel subtitle="Targeting and specificity." title="Rab GTPases and SNAREs">
            <dl className="b26-facts"><dt>Rab</dt><dd>{vr.rab}</dd><dt>SNAREs</dt><dd>{vr.snares}</dd><dt>Caveat</dt><dd data-testid="vesicle-caveat">{vr.caveat}</dd></dl>
          </Panel>
        </>
      ) : null}

      {section === "endosomes" ? (
        <>
          <Panel subtitle="Receptor-mediated uptake and the endolysosomal route. Not all internalised material is degraded." title="Endocytosis, endosomes and lysosomes">
            <Segmented<OrganelleInputs["endo"]["cargo"]> label="Endocytic cargo" onChange={(c) => setEndo({ cargo: c })} options={ENDO_CARGOS.map((c) => ({ id: c.id, label: c.id === "transferrin" ? "Transferrin" : c.id === "ldl" ? "LDL" : c.id === "egf" ? "EGF–EGFR" : "IgA (transcytosis)" }))} value={raw.endo.cargo} />
            <p className="bio-note" data-testid="endo-summary">{ec.summary}</p>
            <fieldset className="c23-fieldset">
              <legend>Perturbations</legend>
              {ENDO_PERTURBATIONS.map((p) => <CheckRow checked={raw.endo.perturbations.includes(p.id)} id={`endo-pert-${p.id}`} key={p.id} label={p.label} onChange={(v) => toggleEndoPert(p.id, v)} />)}
            </fieldset>
            <DiagramFrame caption="Teal boxes are stages on this cargo's route; faded boxes are not on it. A ✕ on lysosomal degradation means it does not occur under the current perturbation." label="Endocytic pathway" title="Endosomal and lysosomal sorting">
              <GraphDiagram edges={eedges} height={380} label="Endocytic pathway stages" minWidth={640} nodes={enodes} onNode={(id) => setEndo({ stage: raw.endo.stage === id ? null : (id as never) })} width={930} />
            </DiagramFrame>
          </Panel>
          {selEndo ? (
            <Panel subtitle="Selected stage." title={selEndo.title}>
              <dl className="b26-facts" data-testid="endo-detail"><dt>pH (approximate)</dt><dd>{selEndo.ph}</dd><dt>Machinery</dt><dd><ChipList items={selEndo.machinery} /></dd><dt>What happens</dt><dd>{selEndo.text}</dd></dl>
            </Panel>
          ) : <p className="bio-note">Select a stage to inspect it.</p>}
          <OutcomePanel outcome={{ definite: et.statements, uncertain: [...et.uncertain, ec.note] }} title="What the model says about this cargo" />
          <Panel subtitle="A curated example of receptor-based sorting." title="Mannose 6-phosphate sorting of lysosomal hydrolases">
            <ol className="gc-assumptions" data-testid="m6p-steps">{m6pSteps.map((s) => <li key={s.id}><strong>{s.title}.</strong> {s.explanation}</li>)}<li><strong>Without the tag</strong>, the enzyme follows the default secretory route and leaves the cell.</li></ol>
            <button className="secondary-button" onClick={() => update((c) => ({ ...c, section: "tracker", cargo: "lysosomal", perturbations: [], step: 0 }))} type="button">Follow a lysosomal hydrolase in the Cargo tracker</button>
          </Panel>
          <Panel subtitle="Vacuolar H⁺-ATPases." title="Why acidic compartments need proton pumps">
            <p>V-ATPases use ATP to pump protons into endosomes and lysosomes. The falling pH (approximately 6.0–6.5 in early endosomes to 4.5–5 in lysosomes) releases ligands from receptors and is required for the acid hydrolases to work.</p>
          </Panel>
        </>
      ) : null}

      {section === "quality" ? (
        <>
          <Panel subtitle="Folding in the ER, retention of misfolded protein, ERAD, the proteasome and lysosomal degradation, as qualitative states." title="Protein quality control">
            <CheckRow checked={raw.qc.defect} id="qc-defect" label="Folding-prone (defective) protein" onChange={(v) => setQc({ defect: v })} />
            <CheckRow checked={raw.qc.aggregates} id="qc-aggregates" label="Forms large aggregates" onChange={(v) => { if (raw.qc.defect) setQc({ aggregates: v }); }} />
            <PerturbationList canAddFn={(cur, id) => canAdd(QC_PERTURBATIONS, cur, id, 3)} catalogue={QC_PERTURBATIONS} max={3} onToggle={(id, on) => update((c) => ({ ...c, qc: { ...c.qc, perturbations: on ? [...c.qc.perturbations, id] : c.qc.perturbations.filter((p) => p !== id) } }))} selected={raw.qc.perturbations} />
            <DiagramFrame caption="Boxes are states; arrows run from what a state depends on to the state it gates. Red bar arrows inhibit." label="Protein quality-control states" legend={REG_LEGEND.map((l) => <span key={l.text}>{l.text}</span>)} title="ER quality control and degradation routes">
              <RegDiagram forced={qcEv.forced} graph={QC_GRAPH} label="Protein quality-control graph" module="qc" onSelect={(id) => update((c) => ({ ...c, qcSelected: c.qcSelected === id ? null : id }))} selected={raw.qcSelected} values={qcEv.values} />
            </DiagramFrame>
          </Panel>
          {raw.qcSelected ? <NodeDetail ev={qcEv} graph={QC_GRAPH} id={raw.qcSelected} onClear={() => update((c) => ({ ...c, qcSelected: null }))} /> : <p className="bio-note">Select a state to see its rule and what decides it.</p>}
          <OutcomePanel outcome={qcOutcome(qcEv.values)} />
        </>
      ) : null}

      {mode === "practice" ? <QuizPanel questions={questions} /> : null}
      {mode === "challenge" ? (challenge ? <PredictPanel finished={false} onReveal={applyChallenge} question={challenge.question} revealLabel={`Apply: ${challenge.label}`} subtitle="Commit to a prediction first; the perturbation is applied in the Cargo tracker afterwards." /> : <Callout tone="info" title="Nothing to predict"><p>No challenge is available.</p></Callout>) : null}

      <Panel subtitle="What this tool does and does not model." title="Assumptions and limits">
        <ul className="gc-assumptions">{ORGANELLE_ASSUMPTIONS.map((a) => <li key={a}>{a}</li>)}</ul>
      </Panel>
      {onNavigate ? (
        <p className="c23-note">Related: <button className="ghost-button" onClick={() => onNavigate("bioTranslation")} type="button">Translation</button> <button className="ghost-button" onClick={() => onNavigate("bioMembrane")} type="button">Membranes &amp; transport</button> <button className="ghost-button" onClick={() => onNavigate("bioCellDeath")} type="button">Apoptosis &amp; autophagy</button></p>
      ) : null}
      <RelatedConcepts subject="biology" toolId="bioOrganelles" />
    </div>
  );
}
