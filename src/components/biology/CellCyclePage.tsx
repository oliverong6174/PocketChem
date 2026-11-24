import { useMemo } from "react";
import { RelatedConcepts } from "../ui/RelatedConcepts";
import { LearningModeSwitch } from "../ui/LearningModeSwitch";
import { Badge, Callout, DiagramFrame, Panel, Segmented, ToolHeader } from "../ui/primitives";
import { useGcWorkspace } from "../generalChem/useGcWorkspace";
import { PredictPanel, QuizPanel } from "./bioShared";
import { CheckRow } from "./cell23";
import { CycleRing } from "./CycleRing";
import { ChipList, NodeDetail, OutcomePanel, PerturbationList, RegDiagram, ProvenancePanel } from "./reg26";
import { REG_LEGEND } from "./layout26";
import { GraphLegend } from "../biochem/metabolism/GraphDiagram";
import {
  CDK_COMPLEXES, CDK_GRAPH, CYCLE_GRAPH, CYCLE_PERTURBATIONS, LICENSE_GRAPH, LICENSE_PERTURBATIONS, LICENSE_PHASES, LICENSE_PHASE_LABEL, MAX_CYCLE_PERTURBATIONS, MODULE_TITLE, PHASES, PHASE_IDS,
  canAddCyclePerturbation, cycleConsistency, evaluateCdk, evaluateCycle, evaluateLicense, phaseInfo, withPhase, type CdkComplex, type CycleModule, type LicensePhase, type PhaseId,
} from "../../utils/biology/cellcycle26";
import { canAdd } from "../../utils/biology/mechanism26";
import { cellCycleChallenge, cellCycleQuestions } from "../../utils/biology/bioLearning26";
import { CYCLE_ASSUMPTIONS, describeCellCycle, summarizeCellCycle } from "../../utils/biology/bioSummary26";
import { CELLCYCLE_ENGINE_VERSION, CYCLE_SECTIONS, DEFAULT_CELLCYCLE_INPUTS, validateCellCycleInputs, type CellCycleInputs, type CycleSection } from "../../utils/persistence/biologyTools26";
import { validateBiologyResults } from "../../utils/persistence/biologyTools";
import type { BiologyToolId } from "../../navigation/subjects";
import { EvidencePanel } from "../ui/EvidencePanel";

type Props = { openRequest?: { id: string; recordId: string } | null; onOpenHandled?: (requestId: string) => void; onNavigate?: (id: BiologyToolId) => void };

const SECTION_LABEL: Record<CycleSection, string> = { overview: "Cell cycle", cdk: "Cyclin–CDK regulation", g1s: "G1/S control", licensing: "Replication licensing", ddr: "DNA-damage checkpoint", g2m: "G2/M control", sac: "Spindle checkpoint" };
const SECTION_PHASE: Partial<Record<CycleSection, PhaseId>> = { g1s: "G1", ddr: "G1", g2m: "G2", sac: "M" };
const RELEVANT: Record<string, string[]> = {
  g1s: ["cdk46-inhibited", "rb-loss", "cyclin-d-constitutive", "licensing-defective", "p53-loss"],
  ddr: ["p53-loss", "atm-defective", "chk1-defective", "cdc25-loss"],
  g2m: ["wee1-inhibited", "cdc25-loss", "chk1-defective", "p53-loss"],
  sac: ["sac-defective", "securin-stable", "cohesin-uncleavable", "cdc25-loss"],
  overview: CYCLE_PERTURBATIONS.map((p) => p.id),
};
const STATUS_WORD = { proceeds: "✓ proceeds", pauses: "⏸ pauses", unresolved: "! unresolved" } as const;
const CDK_SHORT: Record<CdkComplex["id"], string> = { cdk46d: "Cyclin D–CDK4/6", cdk2e: "Cyclin E–CDK2", cdk2a: "Cyclin A–CDK2", cdk1b: "Cyclin B–CDK1" };

export default function CellCyclePage({ openRequest = null, onOpenHandled, onNavigate }: Props) {
  const ws = useGcWorkspace<CellCycleInputs>({
    page: "cellcycle", engineVersion: CELLCYCLE_ENGINE_VERSION, defaults: DEFAULT_CELLCYCLE_INPUTS, validateInputs: validateCellCycleInputs, validateResults: validateBiologyResults,
    summarize: summarizeCellCycle, describe: describeCellCycle, fallbackName: "Cell cycle & checkpoints", openRequest, onOpenHandled,
  });
  const { raw, update } = ws;
  const { section, cycle, mode } = raw;
  const ev = useMemo(() => evaluateCycle(cycle), [cycle]);
  const cdkEv = useMemo(() => evaluateCdk(raw.cdk), [raw.cdk]);
  const licEv = useMemo(() => evaluateLicense(raw.license), [raw.license]);
  const questions = useMemo(() => cellCycleQuestions(raw), [raw]);
  const challenge = useMemo(() => cellCycleChallenge(raw, raw.challenge), [raw]);
  const applyChallenge = () => { if (challenge) update((c) => ({ ...challenge.next, challenge: c.challenge + 1 })); };
  const problems = cycleConsistency(cycle);

  const setCycle = (patch: Partial<CellCycleInputs["cycle"]>) => update((c) => ({ ...c, cycle: { ...c.cycle, ...patch } }));
  const setPhase = (p: PhaseId) => update((c) => ({ ...c, cycle: withPhase(c.cycle, p), selected: null }));
  const suits = (s: CycleSection, p: PhaseId) => (s === "g1s" ? p === "G1" : s === "ddr" ? p === "G1" || p === "S" || p === "G2" : s === "g2m" ? p === "G2" : s === "sac" ? p === "M" : true);
  const setSection = (s: CycleSection) => update((c) => {
    const phase = SECTION_PHASE[s];
    return { ...c, section: s, selected: null, cycle: phase && !suits(s, c.cycle.phase) ? withPhase(c.cycle, phase) : c.cycle };
  });
  const select = (id: string | null) => update((c) => ({ ...c, selected: c.selected === id ? null : id }));
  const togglePert = (id: string, on: boolean) => update((c) => ({ ...c, cycle: { ...c.cycle, perturbations: on ? [...c.cycle.perturbations, id] : c.cycle.perturbations.filter((p) => p !== id) } }));
  const rel = new Set(RELEVANT[section] ?? RELEVANT.overview);
  const visiblePerts = CYCLE_PERTURBATIONS.filter((p) => rel.has(p.id) || cycle.perturbations.includes(p.id));
  const phaseInfoNow = phaseInfo(cycle.phase);
  const moduleOf: Partial<Record<CycleSection, CycleModule>> = { g1s: "g1s", ddr: "ddr", g2m: "g2m", sac: "sac" };
  const mod = moduleOf[section];

  const conditions = (
    <Panel subtitle="Set the cell's state. A condition that contradicts the phase is disabled, with the reason." title="Cell state and conditions">
      <Segmented<PhaseId> label="Cell-cycle phase" onChange={setPhase} options={PHASE_IDS.map((p) => ({ id: p, label: p }))} value={cycle.phase} />
      <CheckRow checked={cycle.mitogen} id="cond-mitogen" label="Mitogenic (growth-factor) signal present" onChange={(v) => setCycle({ mitogen: v })} />
      <CheckRow checked={cycle.pastRestriction} disabled={cycle.phase !== "G1"} hint={cycle.phase === "G0" ? "a G0 cell has not passed the restriction point" : "fixed by the phase"} id="cond-restriction" label="Past the restriction point" onChange={(v) => setCycle({ pastRestriction: v })} />
      <CheckRow checked={cycle.dsb} id="cond-dsb" label="DNA double-strand breaks" onChange={(v) => setCycle({ dsb: v })} />
      <CheckRow checked={cycle.replStress} disabled={cycle.phase !== "S" && cycle.phase !== "G2"} hint="forks exist only in S or G2" id="cond-replstress" label="Stalled replication forks" onChange={(v) => setCycle({ replStress: v })} />
      <CheckRow checked={cycle.replicationComplete} disabled={cycle.phase === "G0" || cycle.phase === "G1" || cycle.phase === "S"} hint={cycle.phase === "S" ? "replication is still in progress in S phase" : "no replication to complete yet"} id="cond-replcomplete" label="DNA replication complete" onChange={(v) => setCycle({ replicationComplete: v })} />
      <CheckRow checked={cycle.allAttached} disabled={cycle.phase !== "M"} hint="kinetochores attach only in mitosis" id="cond-attached" label="All kinetochores attached (bipolar, under tension)" onChange={(v) => setCycle({ allAttached: v })} />
      {problems.length ? <Callout tone="warn" title="Inconsistent state"><p>{problems[0]}</p></Callout> : null}
      <PerturbationList canAddFn={(cur, id) => canAddCyclePerturbation(cur, id)} catalogue={visiblePerts} max={MAX_CYCLE_PERTURBATIONS} onToggle={togglePert} selected={cycle.perturbations} legend="Mutations and inhibitors" />
    </Panel>
  );

  const verdicts = (
    <Panel subtitle="Each transition is evaluated from the same regulatory graph the diagrams draw. “Unresolved” means the model permits it although a checkpoint signal is present." title="Does the cycle progress?">
      <ul className="b26-verdicts" data-testid="verdicts">
        {ev.verdicts.map((v) => (
          <li className={v.from === cycle.phase ? "is-here" : ""} data-testid={`verdict-${v.id}`} key={v.id}>
            <strong>{v.label}</strong> <span className={`b26-status ${v.status}`} data-testid={`verdict-status-${v.id}`}>{STATUS_WORD[v.status]}</span>
            <p>{v.text}</p>
            <p><em>Decided by:</em> {v.causes.map((c) => `${CYCLE_GRAPH.nodes.find((n) => n.id === c.id)!.label} ${c.forced ? "(perturbed) " : ""}is ${c.value ? "ON" : "off"}`).join("; ")}</p>
          </li>
        ))}
      </ul>
    </Panel>
  );

  return (
    <div className="gc-page ph-page bio-page">
      <ToolHeader
        group="Cell organization & regulation"
        title="Cell cycle & checkpoints"
        purpose="A regulatory model of cell-cycle progression: cyclin–CDK activity, the RB–E2F switch, once-per-cycle origin licensing, the DNA-damage checkpoint, G2/M control and the spindle assembly checkpoint. Set conditions and mutations, then see whether each transition proceeds, pauses or is left unresolved."
        evidence="model"
        steps={[{ label: "Pick a phase", detail: "Use the circular diagram or the phase buttons." }, { label: "Set conditions", detail: "Growth signal, DNA damage, replication, attachment, mutations." }, { label: "Read the verdicts", detail: "Proceeds, pauses or unresolved, with the components that decide it." }]}
        aside={<Badge tone="neutral" title="Qualitative regulatory graphs; no durations or activity levels.">Regulatory graph</Badge>}
      />
      {ws.chrome}
      <div className="gc-toolbar">
        <LearningModeSwitch mode={mode} modes={["explore", "practice", "challenge"]} onChange={(m) => update((c) => ({ ...c, mode: m }))} />
        {ws.actions}
      </div>
      {ws.saveFormEl}
      <div className="c23-sections"><Segmented<CycleSection> label="Section" onChange={setSection} options={CYCLE_SECTIONS.map((s) => ({ id: s, label: SECTION_LABEL[s] }))} value={section} /></div>

      {section === "overview" ? (
        <>
          <Panel subtitle="Select a phase or a checkpoint marker." title="The cell cycle">
            <DiagramFrame caption="Arc sizes are schematic, not durations. The markers on the ring are the transitions: ✓ proceeds, ⏸ pauses, ! permitted although a checkpoint signal is present." label="Circular cell-cycle diagram" title="Phases and checkpoints">
              <CycleRing onPhase={setPhase} phase={cycle.phase} verdicts={ev.verdicts} />
            </DiagramFrame>
            <Panel subtitle="Selected phase." title={phaseInfoNow.name}>
              <dl className="b26-facts" data-testid="phase-detail">
                <dt>What happens</dt><dd>{phaseInfoNow.summary}</dd>
                <dt>Main process</dt><dd>{phaseInfoNow.process}</dd>
                <dt>Active complexes</dt><dd><ChipList items={phaseInfoNow.complexes} /></dd>
                <dt>Leaving the phase</dt><dd>{phaseInfoNow.transitionOut}</dd>
                <dt>Connected tools</dt><dd>{phaseInfoNow.links}</dd>
              </dl>
            </Panel>
          </Panel>
          <div className="gc-layout"><div className="gc-inputs">{conditions}</div><div className="gc-stage">{verdicts}<OutcomePanel outcome={ev.outcome} /></div></div>
          <Panel subtitle="Growth, replication, checkpoint control and segregation are different things." title="Four jobs of the cycle">
            <ul className="gc-assumptions">{PHASES.map((p) => <li key={p.id}><strong>{p.name}</strong>: {p.process}.</li>)}<li><strong>Checkpoints</strong> are control points between phases; they decide whether the next phase may begin, they are not phases.</li></ul>
          </Panel>
        </>
      ) : null}

      {section === "cdk" ? (
        <>
          <Panel subtitle="Cyclin concentration alone does not decide activity: four conditions must hold at once." title="Cyclin–CDK complexes">
            <Segmented<CdkComplex["id"]> label="Complex" onChange={(c) => update((x) => ({ ...x, cdk: { ...x.cdk, complex: c } }))} options={CDK_COMPLEXES.map((c) => ({ id: c.id, label: CDK_SHORT[c.id] }))} value={raw.cdk.complex} />
            <CheckRow checked={raw.cdk.cyclin} id="cdk-cyclin" label="Cyclin bound" onChange={(v) => update((x) => ({ ...x, cdk: { ...x.cdk, cyclin: v } }))} />
            <CheckRow checked={raw.cdk.cak} id="cdk-cak" label="Activating phosphorylation by CAK" onChange={(v) => update((x) => ({ ...x, cdk: { ...x.cdk, cak: v } }))} />
            <CheckRow checked={raw.cdk.inhibPhos} id="cdk-inhib" label="Inhibitory phosphates on Thr14/Tyr15 (Wee1/Myt1)" onChange={(v) => update((x) => ({ ...x, cdk: { ...x.cdk, inhibPhos: v } }))} />
            <CheckRow checked={raw.cdk.cki} id="cdk-cki" label="CDK inhibitor bound (INK4 or CIP/KIP)" onChange={(v) => update((x) => ({ ...x, cdk: { ...x.cdk, cki: v } }))} />
            <p className="bio-score" data-testid="cdk-result">{CDK_SHORT[raw.cdk.complex]}: {cdkEv.values.active ? "ACTIVE" : "inactive"}</p>
            <DiagramFrame label="Cyclin–CDK regulation" legend={<GraphLegend items={REG_LEGEND} />} title="What decides CDK activity">
              <RegDiagram forced={cdkEv.forced} graph={CDK_GRAPH} label="Cyclin–CDK regulation graph" module="cdk" onSelect={select} selected={raw.selected} values={cdkEv.values} />
            </DiagramFrame>
            <dl className="b26-facts" data-testid="cdk-facts">
              {(() => { const c = CDK_COMPLEXES.find((x) => x.id === raw.cdk.complex)!; return <><dt>Phase</dt><dd>{c.phase}</dd><dt>Substrates</dt><dd>{c.substrates}</dd><dt>Inhibitors</dt><dd>{c.inhibitors}</dd><dt>Role</dt><dd>{c.role}</dd></>; })()}
            </dl>
          </Panel>
          {raw.selected ? <NodeDetail ev={cdkEv} graph={CDK_GRAPH} id={raw.selected} onClear={() => select(null)} /> : <p className="bio-note">Select a condition to read its role.</p>}
        </>
      ) : null}

      {mod ? (
        <div className="gc-layout">
          <div className="gc-inputs">{conditions}</div>
          <div className="gc-stage">
            <Panel subtitle={mod === "g1s" ? "Mitogen → cyclin D–CDK4/6 → RB phosphorylation → E2F → cyclin E–CDK2 → S phase. Connects to the RTK–Ras–ERK pathway in Cell signaling." : mod === "ddr" ? "Damage sensors → ATM–CHK2 / ATR–CHK1 → p53 → p21, and Cdc25 inhibition, hold CDKs inactive." : mod === "g2m" ? "Cyclin B accumulates; Wee1 holds CDK1 inactive until Cdc25 acts; replication must be complete." : "An unattached kinetochore assembles the MCC, which blocks APC/C–Cdc20, securin and separase hold cohesin in place."} title={MODULE_TITLE[mod]}>
              <DiagramFrame caption="Arrows run from a component to the component whose rule depends on it. Red bar arrows inhibit. Dashed boxes belong to another module." label={`${MODULE_TITLE[mod]} regulatory diagram`} legend={<GraphLegend items={REG_LEGEND} />} title="Regulatory network">
                <RegDiagram forced={ev.forced} graph={CYCLE_GRAPH} label={`${MODULE_TITLE[mod]} regulatory network`} module={mod} onSelect={select} selected={raw.selected} values={ev.values} />
              </DiagramFrame>
              {mod === "g1s" && onNavigate ? <p className="c23-note">The mitogenic signal arises from receptor pathways such as the RTK–Ras–ERK cascade: <button className="ghost-button" onClick={() => onNavigate("bioSignaling")} type="button">open Cell signaling</button>. Cell types differ in how much they depend on growth factors.</p> : null}
              {mod === "sac" && onNavigate ? <p className="c23-note">See the chromosomes and spindle in <button className="ghost-button" onClick={() => onNavigate("bioDivision")} type="button">Mitosis &amp; meiosis</button>. Attachment and tension are sensed by more complex mechanisms than the single condition used here.</p> : null}
            </Panel>
            {raw.selected ? <NodeDetail ev={ev} graph={CYCLE_GRAPH} id={raw.selected} onClear={() => select(null)} /> : <p className="bio-note">Select a component (click, or Tab then Enter) to see its rule and what decides its state.</p>}
            {verdicts}
            <OutcomePanel outcome={ev.outcome} />
          </div>
        </div>
      ) : null}

      {section === "licensing" ? (
        <>
          <Panel subtitle="ORC marks origins; Cdc6 and Cdt1 load the MCM2–7 helicase (licensing) in G1; CDK and DDK fire licensed origins in S. Licensing is not replication." title="Replication licensing and firing">
            <Segmented<LicensePhase> label="Phase" onChange={(p) => update((c) => ({ ...c, license: { ...c.license, phase: p }, selected: null }))} options={LICENSE_PHASES.map((p) => ({ id: p, label: LICENSE_PHASE_LABEL[p] }))} value={raw.license.phase} />
            <PerturbationList canAddFn={(cur, id) => canAdd(LICENSE_PERTURBATIONS, cur, id, 4)} catalogue={LICENSE_PERTURBATIONS} max={4} onToggle={(id, on) => update((c) => ({ ...c, license: { ...c.license, perturbations: on ? [...c.license.perturbations, id] : c.license.perturbations.filter((p) => p !== id) } }))} selected={raw.license.perturbations} />
            <div className="b26-origins" data-testid="origins">
              {[0, 1, 2].map((i) => <div className="b26-origin" key={i}><strong>Origin {i + 1}</strong><span data-testid={`origin-state-${i}`}>{licEv.origin}</span></div>)}
            </div>
            <p className="bio-score" data-testid="license-result">Licensing {licEv.values.licensingPermitted ? "PERMITTED" : "blocked"} · firing {licEv.values.firing ? "possible" : "not possible"}{licEv.values.relicensing ? " · RE-LICENSING HAZARD" : ""}</p>
            <DiagramFrame caption="Three brakes stop licensing outside G1: geminin binds Cdt1, Cdt1 is degraded in S, and CDK inactivates Cdc6/ORC." label="Replication licensing regulatory diagram" legend={<GraphLegend items={REG_LEGEND} />} title="Licensing, firing and the brakes on re-licensing">
              <RegDiagram forced={licEv.forced} graph={LICENSE_GRAPH} label="Replication licensing graph" module="licensing" onSelect={select} selected={raw.selected} values={licEv.values} />
            </DiagramFrame>
            <Callout tone="info" title="Why replicate once per cycle?">
              <p>An origin can fire only if it was licensed, and licensing is possible only before S phase. If origins could be licensed again during S phase, regions could be replicated twice. That is not a normal behaviour: it is the hazard the brakes prevent.</p>
            </Callout>
            {onNavigate ? <p className="c23-note">The replication machinery itself is in <button className="ghost-button" onClick={() => onNavigate("bioReplication")} type="button">DNA replication</button>.</p> : null}
          </Panel>
          {raw.selected ? <NodeDetail ev={licEv} graph={LICENSE_GRAPH} id={raw.selected} onClear={() => select(null)} /> : <p className="bio-note">Select a component to see its rule.</p>}
          <OutcomePanel outcome={licEv.outcome} />
        </>
      ) : null}

      {mode === "practice" ? <QuizPanel questions={questions} /> : null}
      {mode === "challenge" ? (challenge ? <PredictPanel finished={false} onReveal={applyChallenge} question={challenge.question} revealLabel={`Apply: ${challenge.label}`} subtitle="Commit to a prediction first; the conditions are then applied to the diagram." /> : <Callout tone="info" title="Nothing to predict"><p>No challenge is available.</p></Callout>) : null}

      <Panel subtitle="What this tool does and does not model." title="Assumptions and limits">
        <ul className="gc-assumptions">{CYCLE_ASSUMPTIONS.map((a) => <li key={a}>{a}</li>)}</ul>
      </Panel>
      <EvidencePanel id="bio-cell-cycle" />
      <ProvenancePanel tool="cellcycle" />
      <RelatedConcepts subject="biology" toolId="bioCellCycle" />
    </div>
  );
}
