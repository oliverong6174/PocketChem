import { useMemo, useState } from "react";
import { RelatedConcepts } from "../ui/RelatedConcepts";
import { LearningModeSwitch } from "../ui/LearningModeSwitch";
import { Badge, Callout, DiagramFrame, Disclosure, KeyFigures, Legend, Panel, Segmented, ToolHeader } from "../ui/primitives";
import { useGcWorkspace } from "../generalChem/useGcWorkspace";
import { PredictPanel, QuizPanel, StepControls } from "./bioShared";
import { useStepPlayer } from "./bioHooks";
import { CheckRow, LogParam, Param, SelectRow } from "./cell23";
import { mv, sci } from "./cellConst23";
import { BilayerScene, IonScene, OsmosisScene, PassiveScene, PumpScene, SgltScene, VoltageLadder } from "./MembraneDiagrams";
import {
  BILAYER_COMPONENTS, CONC_RANGE, FLUIDITY_CAVEAT, ION_IDS, IONS, NAK_STEPS, PASSIVE_SOLUTES, PASSIVE_SOLUTE_IDS, PERMEABILITY_CLASSES, PUMP_ELECTROGENIC_NOTE, PUMP_PERTURBATIONS, SGLT_STEPS, TRANSPORTERS, TYPICAL_IONS,
  evaluateIons, evaluateOsmosis, evaluatePassive, evaluateSglt, fluidity, pumpMaxStep, pumpState, validateBilayer, validateIonExplorer, validateOsmosis, validatePassive, validateSglt,
  type BilayerComponentId, type PassiveSolute,
} from "../../utils/biology/membrane23";
import { membraneChallenge, membraneQuestions } from "../../utils/biology/bioLearning23";
import { MEMBRANE_ASSUMPTIONS, describeMembrane, summarizeMembrane } from "../../utils/biology/bioSummary23";
import {
  DEFAULT_MEMBRANE_INPUTS, MEMBRANE_ENGINE_VERSION, MEMBRANE_SECTIONS, validateMembraneInputs, type MembraneInputs, type MembraneProtein, type MembraneSection,
} from "../../utils/persistence/biologyTools23";
import { validateBiologyResults } from "../../utils/persistence/biologyTools";

type Props = { openRequest?: { id: string; recordId: string } | null; onOpenHandled?: (requestId: string) => void; onNavigate?: (id: "bioNeuron") => void };

const SECTION_LABELS: Record<MembraneSection, string> = { bilayer: "Bilayer", passive: "Passive transport", ions: "Ion gradients", active: "Active transport", osmosis: "Osmosis & tonicity" };
const SOLUTE_DEFAULTS: Record<PassiveSolute, { out: number; in: number; vm?: number }> = {
  o2: { out: 8, in: 2 }, glycerol: { out: 10, in: 2 }, glucose: { out: 5, in: 1 },
  na: { out: 145, in: 12, vm: -70 }, k: { out: 4, in: 140, vm: -70 }, cl: { out: 110, in: 10, vm: -70 }, ca: { out: 1.8, in: 0.0001, vm: -70 },
};
const MECH_LABEL = { simple: "Simple diffusion", channel: "Channel (facilitated)", carrier: "Carrier (facilitated)" } as const;
const PROTEIN_INFO: Record<string, { label: string; text: string }> = {
  channel: { label: "Channel protein", text: "A water-filled pore through the bilayer. It lets specific ions or molecules pass down their electrochemical or concentration gradient. It is passive: no ATP, and it never moves a solute uphill. Many channels open only in response to voltage, a ligand or force." },
  carrier: { label: "Carrier (uniporter)", text: "Binds one solute, changes shape and releases it on the other side. Facilitated diffusion through a carrier is passive and saturable, because there are a limited number of carriers." },
  pump: { label: "Na⁺/K⁺-ATPase (pump)", text: "Uses the energy of ATP hydrolysis to move 3 Na⁺ out and 2 K⁺ in against their electrochemical gradients (primary active transport)." },
  sglt: { label: "SGLT1 (cotransporter)", text: "Moves 2 Na⁺ and 1 glucose in the same direction (symport). Na⁺ flowing down its electrochemical gradient drives glucose uphill. SGLT1 does not hydrolyse ATP: the Na⁺ gradient is maintained by the Na⁺/K⁺-ATPase (secondary active transport)." },
};

export default function MembranePage({ openRequest = null, onOpenHandled, onNavigate }: Props) {
  const ws = useGcWorkspace<MembraneInputs>({
    page: "membrane", engineVersion: MEMBRANE_ENGINE_VERSION, defaults: DEFAULT_MEMBRANE_INPUTS, validateInputs: validateMembraneInputs, validateResults: validateBiologyResults,
    summarize: summarizeMembrane, describe: describeMembrane, fallbackName: "Membranes & transport", openRequest, onOpenHandled,
  });
  const { raw, update } = ws;
  const { section, mode } = raw;
  const [revealed, setRevealed] = useState(false);
  void revealed; void setRevealed;

  const pumpMax = pumpMaxStep(raw.active.pumpPerturbation);
  const pumpStep = Math.min(raw.active.pumpStep, pumpMax);
  const setPumpStep = (n: number) => update((c) => ({ ...c, active: { ...c.active, pumpStep: Math.min(n, pumpMaxStep(c.active.pumpPerturbation)) } }));
  const pumpPlayer = useStepPlayer(pumpStep, pumpMax, setPumpStep);
  const setSgltStep = (n: number) => update((c) => ({ ...c, active: { ...c.active, sgltStep: n } }));
  const sgltPlayer = useStepPlayer(raw.active.sgltStep, SGLT_STEPS.length - 1, setSgltStep);

  const setSection = (s: MembraneSection) => { pumpPlayer.pause(); sgltPlayer.pause(); update((c) => ({ ...c, section: s, selectedProtein: null, bilayer: { ...c.bilayer, selected: null } })); };
  const setBilayer = (p: Partial<MembraneInputs["bilayer"]>) => update((c) => ({ ...c, bilayer: { ...c.bilayer, ...p } }));
  const setPassive = (p: Partial<MembraneInputs["passive"]>) => update((c) => ({ ...c, passive: { ...c.passive, ...p } }));
  const setIons = (p: Partial<MembraneInputs["ions"]>) => update((c) => ({ ...c, ions: { ...c.ions, ...p } }));
  const setIonConc = (id: (typeof ION_IDS)[number], side: "out" | "in", v: number) => update((c) => ({ ...c, ions: { ...c.ions, ions: { ...c.ions.ions, [id]: { ...c.ions.ions[id], [side]: v } } } }));
  const setOsm = (p: Partial<MembraneInputs["osmosis"]>) => update((c) => ({ ...c, osmosis: { ...c.osmosis, ...p } }));
  const setSglt = (p: Partial<MembraneInputs["active"]["sglt"]>) => update((c) => ({ ...c, active: { ...c.active, sglt: { ...c.active.sglt, ...p } } }));
  const selectProtein = (id: string | null) => update((c) => ({ ...c, selectedProtein: (id as MembraneProtein | null) }));

  const bilayerOk = validateBilayer(raw.bilayer), passiveOk = validatePassive(raw.passive), ionsOk = validateIonExplorer(raw.ions), osmOk = validateOsmosis(raw.osmosis), sgltOk = validateSglt(raw.active.sglt);
  const valid = ws.valid;
  const questions = useMemo(() => (valid ? membraneQuestions(valid) : []), [valid]);
  const challenge = useMemo(() => (valid ? membraneChallenge(valid, raw.challenge) : null), [valid, raw.challenge]);
  const applyChallenge = () => { if (challenge) update((c) => ({ ...challenge.next, challenge: c.challenge + 1 })); };
  const err = (r: { ok: boolean; error?: string }) => (r.ok ? null : (r as { error: string }).error);
  const firstError = err(bilayerOk) ?? err(passiveOk) ?? err(ionsOk) ?? err(osmOk) ?? err(sgltOk);

  let inputs: JSX.Element | null = null, diagram: JSX.Element | null = null, figures: Array<{ label: string; value: string; note?: string }> = [], explore: JSX.Element | null = null, caption = "", title = "", frameLabel = "", steps: JSX.Element | null = null, detail: JSX.Element | null = null;

  if (section === "bilayer" && bilayerOk.ok) {
    const f = fluidity(raw.bilayer);
    const compSel = raw.bilayer.selected;
    const info = BILAYER_COMPONENTS.find((c) => c.id === compSel);
    title = "The plasma membrane: a phospholipid bilayer with proteins"; frameLabel = "Phospholipid bilayer diagram";
    caption = "Select a component in the diagram (click, or Tab then Enter) or from the list. Heads are drawn as circles with two tails; unsaturated tails are kinked; cholesterol is drawn between the tails.";
    inputs = (
      <>
        <SelectRow id="lipids" label="Lipid composition (schematic)" onChange={(v) => setBilayer({ lipids: v })} options={[["saturated", "Mostly saturated tails"], ["mixed", "Mixed tails"], ["unsaturated", "Mostly unsaturated (cis, kinked) tails"]]} value={raw.bilayer.lipids} />
        <SelectRow id="temperature" label="Temperature (relative)" onChange={(v) => setBilayer({ temperature: v })} options={[["cool", "Cool"], ["moderate", "Moderate"], ["warm", "Warm"]]} value={raw.bilayer.temperature} />
        <CheckRow checked={raw.bilayer.cholesterol} id="cholesterol-toggle" label="Cholesterol present" onChange={(v) => setBilayer({ cholesterol: v })} />
        <p className="c23-note">Components</p>
        <div className="c23-chips" role="group" aria-label="Membrane components">
          {BILAYER_COMPONENTS.map((c) => <button aria-pressed={compSel === c.id} className={compSel === c.id ? "primary-button" : "secondary-button"} data-testid={`comp-${c.id}`} key={c.id} onClick={() => setBilayer({ selected: compSel === c.id ? null : c.id })} type="button">{c.label}</button>)}
        </div>
      </>
    );
    diagram = <BilayerScene onSelect={(id: BilayerComponentId | null) => setBilayer({ selected: id })} state={raw.bilayer} />;
    figures = [{ label: "Lipid tails", value: raw.bilayer.lipids }, { label: "Cholesterol", value: raw.bilayer.cholesterol ? "present" : "absent" }, { label: "Schematic fluidity", value: f.label, note: "ordinal comparison" }];
    detail = info ? (
      <Panel subtitle="Component selected." title={info.label}>
        <dl className="bio-seqline" data-testid="component-detail"><dt>Kind</dt><dd>{info.kind}</dd><dt>Where</dt><dd>{info.where}</dd><dt>Role</dt><dd>{info.role}</dd><dt>Note</dt><dd>{info.note}</dd></dl>
        <button className="ghost-button" onClick={() => setBilayer({ selected: null })} type="button">Clear selection</button>
      </Panel>
    ) : <p className="bio-note">Select a component to see what it is and what it does.</p>;
    explore = (
      <>
        <Panel subtitle="Why the bilayer forms and what crosses it." title="What the model says">
          <ul className="gc-assumptions" data-testid="reasons">{f.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
          <p><strong>Schematic fluidity:</strong> {f.label}</p>
          <p className="c23-note">{FLUIDITY_CAVEAT}</p>
        </Panel>
        <Panel subtitle="Selective permeability: what the lipid core lets through by itself." title="Permeability of the bilayer">
          <table className="c23-table" data-testid="permeability-table"><thead><tr><th scope="col">Solute class</th><th scope="col">Examples</th><th scope="col">Through the lipid</th><th scope="col">Usual route</th></tr></thead>
            <tbody>{PERMEABILITY_CLASSES.map((p) => <tr key={p.id}><th scope="row">{p.label}</th><td>{p.examples}</td><td>{p.bilayer}</td><td>{p.route}</td></tr>)}</tbody></table>
        </Panel>
      </>
    );
  }

  if (section === "passive" && passiveOk.ok) {
    const p = raw.passive, r = evaluatePassive(p), def = PASSIVE_SOLUTES[p.solute];
    title = `${def.label}: ${MECH_LABEL[p.mechanism]}`; frameLabel = "Passive transport diagram";
    caption = "Dots show relative concentration on each side. The arrow shows the net passive movement; it always follows the driving force and never uses ATP.";
    inputs = (
      <>
        <SelectRow id="solute" label="Solute" onChange={(v) => { const d = SOLUTE_DEFAULTS[v]; update((c) => ({ ...c, selectedProtein: null, passive: { ...c.passive, solute: v, mechanism: PASSIVE_SOLUTES[v].mechanisms[0], cOut: d.out, cIn: d.in, vmMv: d.vm ?? c.passive.vmMv } })); }} options={PASSIVE_SOLUTE_IDS.map((s): [PassiveSolute, string] => [s, PASSIVE_SOLUTES[s].label])} value={p.solute} />
        {def.mechanisms.length > 1 ? <Segmented label="Mechanism" onChange={(m) => setPassive({ mechanism: m })} options={def.mechanisms.map((m) => ({ id: m, label: MECH_LABEL[m] }))} value={p.mechanism} /> : <p className="c23-note">Mechanism: {MECH_LABEL[p.mechanism]}</p>}
        <LogParam error={null} hi={CONC_RANGE[1]} label={`Outside concentration of ${def.label}`} lo={CONC_RANGE[0]} onChange={(v) => setPassive({ cOut: v })} testId="c-out" unit="mM" value={p.cOut} />
        <LogParam error={null} hi={CONC_RANGE[1]} label={`Inside concentration of ${def.label}`} lo={CONC_RANGE[0]} onChange={(v) => setPassive({ cIn: v })} testId="c-in" unit="mM" value={p.cIn} />
        {def.ion ? <Param label="Membrane voltage Vm" max={60} min={-120} onChange={(v) => setPassive({ vmMv: v })} step={1} testId="vm" unit="mV" value={p.vmMv} /> : null}
        {!def.ion && p.mechanism !== "carrier" ? <LogParam hi={10} label="Permeability P" lo={1e-9} onChange={(v) => setPassive({ permeability: v })} testId="perm" unit="cm/s" value={p.permeability} /> : null}
        {p.mechanism === "carrier" ? <><LogParam hi={1} label="Carrier maximum flux Jmax" lo={1e-6} onChange={(v) => setPassive({ jmax: v })} unit="µmol cm⁻² s⁻¹" value={p.jmax} /><LogParam hi={1000} label="Half-saturation Km" lo={0.01} onChange={(v) => setPassive({ km: v })} unit="mM" value={p.km} /></> : null}
        <Param label="Temperature" max={50} min={0} onChange={(v) => setPassive({ tempC: v })} step={1} unit="°C" value={p.tempC} />
      </>
    );
    diagram = <PassiveScene input={p} onSelect={selectProtein} result={r} selected={raw.selectedProtein} />;
    figures = r.ion
      ? [{ label: "Net movement", value: r.direction === "none" ? "none (equilibrium)" : r.direction }, { label: `E(${def.label})`, value: mv(r.ion.eMv) }, { label: "Vm − E", value: mv(r.ion.drivingMv) }, { label: "Δμ (inward)", value: `${r.ion.deltaGInwardKJ.toFixed(2)} kJ/mol` }]
      : [{ label: "Net movement", value: r.direction === "none" ? "none (equilibrium)" : r.direction }, { label: "Concentration difference", value: `${sci(r.concentrationDifference)} mM`, note: "outside − inside" }, { label: "Net inward flux", value: `${sci(r.fluxIn ?? 0)} µmol cm⁻² s⁻¹` }, { label: "Uses ATP", value: "no" }];
    detail = raw.selectedProtein && PROTEIN_INFO[raw.selectedProtein] ? <Panel subtitle="Protein selected in the diagram." title={PROTEIN_INFO[raw.selectedProtein].label}><p data-testid="protein-detail">{PROTEIN_INFO[raw.selectedProtein].text}</p><button className="ghost-button" onClick={() => selectProtein(null)} type="button">Clear selection</button></Panel> : <p className="bio-note">Select the transport protein in the diagram to read what it does.</p>;
    explore = (
      <Panel subtitle="Each line follows from the values on the left." title="What the model says">
        <ul className="gc-assumptions" data-testid="reasons">{r.explanation.map((e) => <li key={e}>{e}</li>)}</ul>
        <p className="gc-mono"><strong>Relation:</strong> {r.equation}</p>
        <Disclosure summary="Permeability is not the same as the concentration difference">
          <p>The concentration difference decides the <em>direction</em> and, together with the permeability, the <em>size</em> of a neutral solute&apos;s net flux: J = P·ΔC. A membrane can be very permeable and show no net flux (ΔC = 0), or have a large ΔC and almost no flux (tiny P). Change the permeability and the concentrations separately to see both.</p>
        </Disclosure>
        <Disclosure summary="Why charged ions need the electrical term">
          <p>For an ion the driving force is the electrochemical potential difference, Δμ = zF(Vm − E). The concentration term alone can point the wrong way: with K⁺ at 4 mM outside and 140 mM inside, a membrane voltage more negative than E<sub>K</sub> (about −95 mV) drives K⁺ <em>into</em> the cell even though its concentration is lower outside.</p>
        </Disclosure>
      </Panel>
    );
  }

  if (section === "ions" && ionsOk.ok) {
    const e = evaluateIons(raw.ions);
    const sel = e.ions.find((d) => d.ion === raw.ions.selected)!;
    title = "Ion gradients and equilibrium potentials"; frameLabel = "Ion gradient diagram";
    caption = "Each channel is drawn open. The arrow is the net passive movement of that ion at the membrane voltage shown, so it points toward that ion's equilibrium potential. Select an ion to inspect it.";
    inputs = (
      <>
        <Segmented<(typeof ION_IDS)[number]> label="Ion to inspect" onChange={(v) => setIons({ selected: v })} options={ION_IDS.map((i) => ({ id: i, label: IONS[i].symbol }))} value={raw.ions.selected} />
        <Param label="Temperature" max={50} min={0} onChange={(v) => setIons({ tempC: v })} step={1} testId="temp" unit="°C" value={raw.ions.tempC} />
        <LogParam hi={CONC_RANGE[1]} label={`Outside ${IONS[raw.ions.selected].symbol}`} lo={CONC_RANGE[0]} onChange={(v) => setIonConc(raw.ions.selected, "out", v)} testId="ion-out" unit="mM" value={raw.ions.ions[raw.ions.selected].out} />
        <LogParam hi={CONC_RANGE[1]} label={`Inside ${IONS[raw.ions.selected].symbol}`} lo={CONC_RANGE[0]} onChange={(v) => setIonConc(raw.ions.selected, "in", v)} testId="ion-in" unit="mM" value={raw.ions.ions[raw.ions.selected].in} />
        <Disclosure summary="Concentrations of all four ions">
          {ION_IDS.filter((i) => i !== raw.ions.selected).map((i) => (
            <div className="c23-fieldset" key={i}>
              <LogParam hi={CONC_RANGE[1]} label={`Outside ${IONS[i].symbol}`} lo={CONC_RANGE[0]} onChange={(v) => setIonConc(i, "out", v)} unit="mM" value={raw.ions.ions[i].out} />
              <LogParam hi={CONC_RANGE[1]} label={`Inside ${IONS[i].symbol}`} lo={CONC_RANGE[0]} onChange={(v) => setIonConc(i, "in", v)} unit="mM" value={raw.ions.ions[i].in} />
            </div>
          ))}
        </Disclosure>
        <Segmented<"ghk" | "manual"> label="Membrane voltage" onChange={(v) => setIons({ vmSource: v })} options={[{ id: "ghk", label: "From permeabilities (GHK)" }, { id: "manual", label: "Set by hand" }]} value={raw.ions.vmSource} />
        {raw.ions.vmSource === "manual" ? <Param label="Membrane voltage Vm" max={60} min={-120} onChange={(v) => setIons({ vmManualMv: v })} step={1} testId="vm-manual" unit="mV" value={raw.ions.vmManualMv} /> : (
          <>
            <Param format={(v) => `${v}`} label="Relative P(K⁺)" max={2} min={0} onChange={(v) => setIons({ perms: { ...raw.ions.perms, k: v } })} step={0.01} unit="" value={raw.ions.perms.k} />
            <Param format={(v) => `${v}`} label="Relative P(Na⁺)" max={2} min={0} onChange={(v) => setIons({ perms: { ...raw.ions.perms, na: v } })} step={0.01} testId="pna" unit="" value={raw.ions.perms.na} />
            <Param format={(v) => `${v}`} label="Relative P(Cl⁻)" max={2} min={0} onChange={(v) => setIons({ perms: { ...raw.ions.perms, cl: v } })} step={0.01} unit="" value={raw.ions.perms.cl} />
          </>
        )}
        <button className="secondary-button" onClick={() => setIons({ ions: TYPICAL_IONS })} type="button">Restore typical mammalian values</button>
      </>
    );
    diagram = <><IonScene input={raw.ions} onSelect={(id) => setIons({ selected: (id ?? raw.ions.selected) as typeof raw.ions.selected })} selected={raw.ions.selected} /><VoltageLadder input={raw.ions} /></>;
    figures = [{ label: `E(${IONS[sel.ion].symbol})`, value: mv(sel.eMv), note: "Nernst, z = " + (sel.z > 0 ? "+" : "−") + Math.abs(sel.z) }, { label: "Membrane voltage Vm", value: mv(e.vmMv), note: raw.ions.vmSource === "ghk" ? "GHK" : "set by hand" }, { label: "Vm − E", value: mv(sel.drivingMv) }, { label: "Open channel", value: sel.direction === "none" ? "no net flow" : `net ${sel.direction}` }];
    explore = (
      <Panel subtitle="For the selected ion." title="Chemical and electrical driving forces">
        <table className="c23-table" data-testid="ion-table"><thead><tr><th scope="col">Ion</th><th scope="col">E (mV)</th><th scope="col">Vm − E (mV)</th><th scope="col">Open channel</th></tr></thead>
          <tbody>{e.ions.map((d) => <tr key={d.ion}><th scope="row">{IONS[d.ion].symbol}</th><td>{d.eMv.toFixed(1)}</td><td>{d.drivingMv.toFixed(1)}</td><td>{d.direction === "none" ? "no net flow" : d.direction}</td></tr>)}</tbody></table>
        <ul className="gc-assumptions" data-testid="reasons">
          <li>Chemical term: {IONS[sel.ion].symbol} is {raw.ions.ions[sel.ion].out > raw.ions.ions[sel.ion].in ? "more concentrated outside, so diffusion alone would push it in" : "more concentrated inside, so diffusion alone would push it out"}.</li>
          <li>Electrical term: with Vm = {mv(e.vmMv)} the electrical force {sel.z * e.vmMv < 0 ? "favours inward movement" : "favours outward movement"} of {IONS[sel.ion].symbol} (valence {sel.z > 0 ? "+" : "−"}{Math.abs(sel.z)}).</li>
          <li>Equilibrium: the two terms cancel at E = {mv(sel.eMv)}. Δμ(in) = zF(Vm − E) = {sel.deltaGInwardKJ.toFixed(2)} kJ/mol.</li>
          <li>The Nernst potential of one ion is the actual membrane potential only if the membrane is permeable to that ion alone. With several permeant ions Vm is a permeability-weighted balance (GHK), here {mv(e.vmMv)}.</li>
        </ul>
        <p className="c23-note">GHK assumptions: constant field, independent ions, K⁺, Na⁺ and Cl⁻ only, zero net current, no pump current. A plain average of the Nernst potentials is not used because it has no physical justification.</p>
      </Panel>
    );
  }

  if (section === "active") {
    const a = raw.active;
    const nak = a.transporter === "nak";
    title = nak ? "The Na⁺/K⁺-ATPase cycle (primary active transport)" : "SGLT1: Na⁺–glucose symport (secondary active transport)"; frameLabel = nak ? "Sodium-potassium pump diagram" : "Cotransporter diagram";
    inputs = (
      <>
        <Segmented<"nak" | "sglt"> label="Transporter" onChange={(v) => { pumpPlayer.pause(); sgltPlayer.pause(); update((c) => ({ ...c, active: { ...c.active, transporter: v }, selectedProtein: null })); }} options={[{ id: "nak", label: "Na⁺/K⁺-ATPase" }, { id: "sglt", label: "SGLT1 cotransport" }]} value={a.transporter} />
        {nak ? (
          <SelectRow id="pump-pert" label="Pump condition" onChange={(v) => update((c) => ({ ...c, active: { ...c.active, pumpPerturbation: v, pumpStep: Math.min(c.active.pumpStep, pumpMaxStep(v)) } }))} options={PUMP_PERTURBATIONS.map((p): [typeof a.pumpPerturbation, string] => [p.id, p.label])} value={a.pumpPerturbation} />
        ) : sgltOk.ok ? (
          <>
            <LogParam hi={CONC_RANGE[1]} label="Outside Na⁺" lo={CONC_RANGE[0]} onChange={(v) => setSglt({ naOut: v })} unit="mM" value={a.sglt.naOut} />
            <LogParam hi={CONC_RANGE[1]} label="Inside Na⁺" lo={CONC_RANGE[0]} onChange={(v) => setSglt({ naIn: v })} testId="sglt-nain" unit="mM" value={a.sglt.naIn} />
            <LogParam hi={CONC_RANGE[1]} label="Outside glucose" lo={CONC_RANGE[0]} onChange={(v) => setSglt({ gluOut: v })} unit="mM" value={a.sglt.gluOut} />
            <LogParam hi={CONC_RANGE[1]} label="Inside glucose" lo={CONC_RANGE[0]} onChange={(v) => setSglt({ gluIn: v })} testId="sglt-gluin" unit="mM" value={a.sglt.gluIn} />
            <Param label="Membrane voltage Vm" max={60} min={-120} onChange={(v) => setSglt({ vmMv: v })} step={1} unit="mV" value={a.sglt.vmMv} />
          </>
        ) : null}
      </>
    );
    if (nak) {
      const s = pumpState(pumpStep, a.pumpPerturbation);
      diagram = <PumpScene state={s} />;
      steps = <StepControls locked={false} max={pumpMax} onStep={setPumpStep} player={pumpPlayer} step={pumpStep} unit="Pump step" />;
      caption = "The pump's conformation, bound ions, phosphorylation and the ions moved so far all come from the cycle state at this step.";
      figures = [{ label: "Conformation", value: s.conformation, note: s.facing === "occluded" ? "occluded" : `open to ${s.facing}` }, { label: "Na⁺ moved out", value: `${s.naMovedOut} of 3` }, { label: "K⁺ moved in", value: `${s.kMovedIn} of 2` }, { label: "ATP hydrolysed", value: `${s.atpHydrolyzed}`, note: "per completed cycle: 1" }];
      explore = (
        <Panel subtitle="One simplified Post–Albers cycle." title={`Step ${pumpStep + 1}: ${s.title}`}>
          <p data-testid="pump-text">{s.text}</p>
          {a.pumpPerturbation !== "none" ? <Callout tone="warn" title={PUMP_PERTURBATIONS.find((p) => p.id === a.pumpPerturbation)!.label}><p>{PUMP_PERTURBATIONS.find((p) => p.id === a.pumpPerturbation)!.effect}</p></Callout> : null}
          <p><strong>Net charge moved out so far:</strong> {s.netChargeOut > 0 ? `+${s.netChargeOut}` : s.netChargeOut} elementary charge{Math.abs(s.netChargeOut) === 1 ? "" : "s"}</p>
          <p className="c23-note">{PUMP_ELECTROGENIC_NOTE}</p>
        </Panel>
      );
      detail = <Panel subtitle="Stoichiometry per completed cycle." title="3 Na⁺ out · 2 K⁺ in · 1 ATP"><p data-testid="protein-detail">{PROTEIN_INFO.pump.text}</p></Panel>;
    } else if (sgltOk.ok) {
      const r = evaluateSglt(a.sglt);
      diagram = <SgltScene input={a.sglt} result={r} step={a.sgltStep} step_titles={SGLT_STEPS.map((s) => s.title)} />;
      steps = <StepControls locked={false} max={SGLT_STEPS.length - 1} onStep={setSgltStep} player={sgltPlayer} step={a.sgltStep} unit="Transport step" />;
      caption = "The drawn cycle is the inward direction. If the energy balance reverses, the diagram says so and the arrows are reversed.";
      figures = [{ label: "ΔG per cycle (2 Na⁺ + 1 glucose in)", value: `${r.deltaGCycleKJ.toFixed(1)} kJ/mol` }, { label: "Net glucose", value: r.glucoseDirection === "none" ? "none (equilibrium)" : r.glucoseDirection }, { label: "Accumulation limit", value: `${r.maxAccumulationRatio.toPrecision(3)}×`, note: "thermodynamic limit, not a prediction" }, { label: "ATP used by SGLT1", value: "none" }];
      explore = (
        <Panel subtitle="Energy bookkeeping." title={`Step ${a.sgltStep + 1}: ${SGLT_STEPS[a.sgltStep].title}`}>
          <p>{SGLT_STEPS[a.sgltStep].text}</p>
          <ul className="gc-assumptions" data-testid="reasons">
            <li>Na⁺ term for two Na⁺ moving in: {r.naTermKJ.toFixed(1)} kJ/mol (strongly negative: a steep gradient and a negative membrane voltage).</li>
            <li>Glucose term: {r.glucoseTermKJ.toFixed(1)} kJ/mol (positive when glucose is more concentrated inside).</li>
            <li>Sum ΔG = {r.deltaGCycleKJ.toFixed(1)} kJ/mol: the cycle runs {r.glucoseDirection === "inward" ? "inward" : r.glucoseDirection === "outward" ? "in reverse" : "at equilibrium"}.</li>
            <li>The cotransporter does not hydrolyse ATP. The Na⁺/K⁺-ATPase maintains the Na⁺ gradient, so ATP is used indirectly. If intracellular Na⁺ rises, the accumulation limit falls.</li>
          </ul>
        </Panel>
      );
      detail = <Panel subtitle="Secondary active transport." title="Primary versus secondary active transport"><p data-testid="protein-detail">{PROTEIN_INFO.sglt.text}</p></Panel>;
    }
    figures = figures.length ? figures : [];
  }

  if (section === "osmosis" && osmOk.ok) {
    const o = raw.osmosis, r = evaluateOsmosis(o);
    title = "Osmosis, osmolarity and tonicity"; frameLabel = "Osmosis diagram";
    caption = "Blue arrows show the initial net water movement, which follows the effective (impermeant) solute balance. The dashed circle appears only when the idealized equilibrium volume is within the supported range.";
    inputs = (
      <>
        <Param label="Impermeant solute inside" max={600} min={10} onChange={(v) => setOsm({ inImpermeant: v })} step={5} testId="in-imp" unit="mOsm/L" value={o.inImpermeant} />
        <Param label="Permeant solute (urea) inside" max={600} min={0} onChange={(v) => setOsm({ inUrea: v })} step={5} unit="mM" value={o.inUrea} />
        <Param label="Outside NaCl (2 particles each)" max={600} min={0} onChange={(v) => setOsm({ naCl: v })} step={5} testId="nacl" unit="mM" value={o.naCl} />
        <Param label="Outside sucrose (impermeant)" max={1000} min={0} onChange={(v) => setOsm({ sucrose: v })} step={5} testId="sucrose" unit="mM" value={o.sucrose} />
        <Param label="Outside urea (freely permeant)" max={1000} min={0} onChange={(v) => setOsm({ urea: v })} step={5} testId="urea" unit="mM" value={o.urea} />
        <div className="c23-chips" role="group" aria-label="Example solutions">
          <button className="secondary-button" onClick={() => setOsm({ naCl: 150, sucrose: 0, urea: 0 })} type="button">Isotonic saline</button>
          <button className="secondary-button" onClick={() => setOsm({ naCl: 75, sucrose: 0, urea: 0 })} type="button">Hypotonic</button>
          <button className="secondary-button" onClick={() => setOsm({ naCl: 300, sucrose: 0, urea: 0 })} type="button">Hypertonic</button>
          <button className="secondary-button" onClick={() => setOsm({ naCl: 0, sucrose: 0, urea: 300 })} type="button">300 mM urea</button>
        </div>
      </>
    );
    diagram = <OsmosisScene input={o} result={r} />;
    figures = [{ label: "Osmolarity (all solutes)", value: `${r.osmolarity}`, note: `outside ${r.outTotalOsm.toFixed(0)} · inside ${r.inTotalOsm.toFixed(0)} mOsm/L` }, { label: "Tonicity (impermeant)", value: r.tonicity, note: `outside ${r.outImpermeantOsm.toFixed(0)} · inside ${r.inImpermeantOsm.toFixed(0)} mOsm/L` }, { label: "Initial water movement", value: r.initialWater }, { label: "Idealized equilibrium volume", value: r.relativeVolume === null ? "not reported" : `${r.relativeVolume.toFixed(2)} × V₀` }];
    explore = (
      <Panel subtitle="Osmolarity counts every particle; tonicity counts only those that cannot cross." title="What the model says">
        {r.disagree ? <Callout tone="warn" title="Osmolarity and tonicity disagree here"><p>The solution is {r.osmolarity} but {r.tonicity} for this cell, because a freely permeant solute adds to osmolarity without holding water.</p></Callout> : null}
        <ul className="gc-assumptions" data-testid="reasons">{r.notes.map((n) => <li key={n}>{n}</li>)}<li>{r.volumeNote}</li></ul>
        <Disclosure summary="Assumptions of the volume calculation">
          <p>Ideal solutions (no osmotic coefficients: NaCl counts exactly two particles); a membrane perfectly permeable to water and impermeable to NaCl and sucrose; urea freely permeant; no elasticity, cell wall or volume regulation; no active transport; all cell water osmotically active. Under these assumptions the equilibrium condition is equal impermeant solute concentration inside and out, so V/V₀ = (impermeant inside)/(impermeant outside). Cells with walls, or cells that regulate their volume, behave differently, and the model never predicts rupture.</p>
        </Disclosure>
      </Panel>
    );
  }

  const legend = <Legend items={[{ label: "Na⁺", color: "#2563eb" }, { label: "K⁺", color: "#c2410c" }, { label: "Cl⁻", color: "#15803d" }, { label: "Ca²⁺", color: "#7e22ce" }, { label: "Glucose", color: "#be185d" }]} />;

  return (
    <div className="gc-page ph-page bio-page">
      <ToolHeader
        group="Cellular biology & physiology"
        title="Membranes & transport"
        purpose="Build a membrane, change the concentrations on either side and see which way solutes move, what costs ATP, and what water does. Passive transport, active transport and osmosis are kept separate, and every arrow follows the model."
        evidence="model"
        steps={[{ label: "Pick a section", detail: "Bilayer, passive, ions, active transport or osmosis." }, { label: "Change the conditions", detail: "Concentrations, voltage, temperature, mechanism." }, { label: "Predict, then check", detail: "Practice and Challenge use the same calculations." }]}
        aside={<Badge tone="neutral" title="Ideal-solution teaching models.">Bounded models</Badge>}
      />
      {ws.chrome}
      <div className="gc-toolbar">
        <LearningModeSwitch mode={mode} modes={["explore", "practice", "challenge"]} onChange={(m) => update((c) => ({ ...c, mode: m }))} />
        {ws.actions}
      </div>
      {ws.saveFormEl}
      <div className="c23-sections"><Segmented<MembraneSection> label="Membrane section" onChange={setSection} options={MEMBRANE_SECTIONS.map((s) => ({ id: s, label: SECTION_LABELS[s] }))} value={section} /></div>

      <div className="gc-layout">
        <Panel className="gc-inputs" subtitle="Change a value and every arrow, label and number updates." title={SECTION_LABELS[section]}>
          {inputs}
          {firstError ? <Callout tone="danger" title="These values cannot be used"><p>{firstError}</p></Callout> : null}
        </Panel>
        <div className="gc-stage">
          {steps}
          {diagram ? (
            <DiagramFrame caption={caption} label={frameLabel} legend={section === "ions" || section === "active" || section === "passive" ? legend : undefined} title={title}>{diagram}</DiagramFrame>
          ) : null}
          {figures.length ? <KeyFigures items={figures} /> : null}
          {detail}
          {mode === "explore" ? explore : null}
          {mode === "practice" ? <QuizPanel questions={questions} /> : null}
          {mode === "challenge" ? (
            challenge ? <PredictPanel finished={false} onReveal={applyChallenge} question={challenge.question} revealLabel={`Apply: ${challenge.label}`} subtitle="Commit to a prediction first; the change is applied to the diagram afterwards." /> : <Callout tone="info" title="Nothing to predict"><p>No further change is available in this section.</p></Callout>
          ) : null}
          {section === "ions" && onNavigate ? <p className="c23-note">The neuronal tool uses the same equations to explain the resting potential: <button className="ghost-button" onClick={() => onNavigate("bioNeuron")} type="button">open Neuronal physiology</button></p> : null}
        </div>
      </div>
      <Panel subtitle="What this tool does and does not model." title="Assumptions and limits">
        <ul className="gc-assumptions">{MEMBRANE_ASSUMPTIONS.map((a) => <li key={a}>{a}</li>)}</ul>
        <p className="c23-note">Transporter classes in this tool: {TRANSPORTERS.map((t) => `${t.name} (${t.category}${t.usesATPDirectly ? ", uses ATP directly" : ""})`).join("; ")}. Steps in the pump cycle: {NAK_STEPS}.</p>
      </Panel>
      <RelatedConcepts subject="biology" toolId="bioMembrane" />
    </div>
  );
}
