import { useMemo, useState } from "react";
import { RelatedConcepts } from "../ui/RelatedConcepts";
import { LearningModeSwitch } from "../ui/LearningModeSwitch";
import { Badge, Callout, DiagramFrame, Disclosure, KeyFigures, Panel, Segmented, ToolHeader } from "../ui/primitives";
import { ParamSlider } from "../physics/sim";
import { NumberField } from "../generalChem/shared";
import { useGcWorkspace } from "../generalChem/useGcWorkspace";
import { PredictPanel, QuizPanel } from "../biology/bioShared";
import { MoleculeSvg } from "./MoleculeSvg";
import { HelicalWheel, HelixDiagram, InteractionDiagram, LevelsDiagram, RamachandranPlot, SheetDiagram } from "./ProteinDiagrams";
import { RAMA_LEGEND, ramaColor } from "./ramaStyle";
import { AMINO_ACID_LIST, AMINO_ACIDS_BY_ONE, CLASS_SHAPE } from "../../utils/biochem/aminoAcids";
import {
  BETA_TURNS, HELIX, PROTEIN_EXAMPLES, RAMA_LABEL, SALT_BRIDGES, SCENARIOS, SHEET_LIMITS, HELIX_LIMITS, STRAND, analyzeConditions, analyzeSubstitution, buildSheet, classifyPhiPsi,
  helixFreeGroups, helixHBonds, hydrophobicMoment, saltBridgeFraction, type Thermal,
} from "../../utils/biochem/protein";
import { proteinChallenges, proteinQuestions } from "../../utils/biochem/learning";
import {
  DEFAULT_PROTEINS_INPUTS, PROTEINS_ASSUMPTIONS, PROTEINS_ENGINE_VERSION, PROTEIN_VIEWS, describeProteinsAnalysis, summarizeProteins, validateProteinsInputs,
  type ProteinView, type ProteinsInputs, type RamaResidue,
} from "../../utils/persistence/biochemTools17";
import { validateBiologyResults } from "../../utils/persistence/biologyTools";
import "../../styles/biochemistry.css";

type Props = { openRequest?: { id: string; recordId: string } | null; onOpenHandled?: (requestId: string) => void };

const VIEW_LABEL: Record<ProteinView, string> = { levels: "Levels of structure", helix: "α-helix", sheet: "β-sheet", rama: "Ramachandran", interactions: "Folding forces", mutation: "Mutations" };
const WHEEL_UNIT = "LKKLLKLLKKLLKLLKKLLKLLKK"; // schematic amphipathic helix: hydrophobic Leu on one face, Lys on the other
const THERMAL: Array<{ id: Thermal; label: string }> = [{ id: "low", label: "Low" }, { id: "moderate", label: "Moderate" }, { id: "high", label: "High" }];

export default function ProteinsPage({ openRequest = null, onOpenHandled }: Props) {
  const ws = useGcWorkspace<ProteinsInputs>({
    page: "proteins", engineVersion: PROTEINS_ENGINE_VERSION, defaults: DEFAULT_PROTEINS_INPUTS, validateInputs: validateProteinsInputs, validateResults: validateBiologyResults,
    summarize: summarizeProteins, describe: describeProteinsAnalysis, fallbackName: "Protein structure & folding", openRequest, onOpenHandled,
  });
  const { raw, update } = ws;
  const set = (patch: Partial<ProteinsInputs>) => update((c) => ({ ...c, ...patch }));
  const mode = raw.mode, view = raw.view;
  const [level, setLevel] = useState<1 | 2 | 3 | 4>(1);
  const [pick, setPick] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const hide = mode === "practice" && !revealed;

  const example = PROTEIN_EXAMPLES.find((e) => e.id === raw.example) ?? PROTEIN_EXAMPLES[0];
  const wheelSeq = WHEEL_UNIT.slice(0, raw.helixLength);
  const free = helixFreeGroups(raw.helixLength);
  const sheet = useMemo(() => buildSheet(raw.sheetKind, raw.strandLength, raw.strands), [raw.sheetKind, raw.strandLength, raw.strands]);
  const rama = classifyPhiPsi(raw.phi, raw.psi, raw.ramaResidue);
  const outcome = useMemo(() => analyzeConditions(raw.conditions), [raw.conditions]);
  const sub = useMemo(() => analyzeSubstitution(raw.scenario, raw.mutant), [raw.scenario, raw.mutant]);
  const scenario = SCENARIOS.find((s) => s.id === raw.scenario) ?? SCENARIOS[0];
  const questions = useMemo(() => proteinQuestions(raw), [raw]);
  const challenges = useMemo(() => proteinChallenges(), []);
  const challenge = challenges[raw.challenge % challenges.length];
  const setCond = (patch: Partial<ProteinsInputs["conditions"]>) => update((c) => ({ ...c, conditions: { ...c.conditions, ...patch } }));

  return (
    <div className="gc-page ph-page bio-page bc-page">
      <ToolHeader
        group="Biomolecules"
        title="Protein structure & folding"
        purpose="See how a chain of amino acids is organised into secondary, tertiary and quaternary structure, which forces hold a fold together, and what a single substitution can and cannot tell you."
        evidence="model"
        steps={[
          { label: "Pick a level or a structure", detail: "Helix, sheet, backbone angles, interactions or a mutation." },
          { label: "Change one thing", detail: "Length, angle, pH, temperature or a residue." },
          { label: "Practise or predict", detail: "Hide labels, answer questions, or predict a substitution." },
        ]}
        aside={<Badge tone="neutral" title="Ideal geometry and qualitative rules; no folding prediction.">Illustrative, not a folding predictor</Badge>}
      />
      {ws.chrome}
      <div className="gc-toolbar">
        <LearningModeSwitch mode={mode} modes={["explore", "practice", "challenge"]} onChange={(m) => { setRevealed(false); update((c) => ({ ...c, mode: m })); }} />
        {ws.actions}
      </div>
      {ws.saveFormEl}
      <div className="bc-views"><Segmented<ProteinView> label="View" onChange={(v) => { setPick(null); set({ view: v }); }} options={PROTEIN_VIEWS.map((v) => ({ id: v, label: VIEW_LABEL[v] }))} value={view} /></div>
      <Callout tone="info" title="What this is, and is not"><p>These are teaching models with ideal geometry and qualitative rules. They do not predict how a given sequence folds and they are not protein-structure prediction.</p></Callout>

      <div className="gc-layout">
        <Panel className="gc-inputs" title="Controls" subtitle="Each view has its own controls.">
          {view === "levels" ? (
            <>
              <Segmented<string> label="Protein" onChange={(id) => set({ example: id })} options={PROTEIN_EXAMPLES.map((e) => { const n = e.name.replace("Human ", "").replace("Sperm-whale ", ""); return { id: e.id, label: n.charAt(0).toUpperCase() + n.slice(1) }; })} value={raw.example} />
              <Segmented<"1" | "2" | "3" | "4"> label="Level" onChange={(v) => setLevel(Number(v) as 1 | 2 | 3 | 4)} options={[{ id: "1", label: "Primary" }, { id: "2", label: "Secondary" }, { id: "3", label: "Tertiary" }, { id: "4", label: "Quaternary" }]} value={String(level) as "1" | "2" | "3" | "4"} />
            </>
          ) : null}
          {view === "helix" ? <ParamSlider format={(v) => `${v} residues`} label="Helix length" max={HELIX_LIMITS.max} min={HELIX_LIMITS.min} onChange={(v) => { setPick(null); set({ helixLength: v }); }} step={1} value={raw.helixLength} /> : null}
          {view === "sheet" ? (
            <>
              <Segmented<"parallel" | "antiparallel"> label="Strand orientation" onChange={(v) => set({ sheetKind: v })} options={[{ id: "antiparallel", label: "Antiparallel" }, { id: "parallel", label: "Parallel" }]} value={raw.sheetKind} />
              <ParamSlider format={(v) => `${v} strands`} label="Strands" max={SHEET_LIMITS.maxStrands} min={SHEET_LIMITS.minStrands} onChange={(v) => set({ strands: v })} step={1} value={raw.strands} />
              <ParamSlider format={(v) => `${v} residues`} label="Strand length" max={SHEET_LIMITS.maxLen} min={SHEET_LIMITS.minLen} onChange={(v) => set({ strandLength: v })} step={1} value={raw.strandLength} />
            </>
          ) : null}
          {view === "rama" ? (
            <>
              <Segmented<RamaResidue> label="Residue type" onChange={(v) => set({ ramaResidue: v })} options={[{ id: "general", label: "Most residues" }, { id: "G", label: "Glycine" }, { id: "P", label: "Proline" }]} value={raw.ramaResidue} />
              <ParamSlider format={(v) => `${v}°`} label="φ (phi)" max={180} min={-180} onChange={(v) => set({ phi: Math.round(v) })} step={1} value={raw.phi} />
              <ParamSlider format={(v) => `${v}°`} label="ψ (psi)" max={180} min={-180} onChange={(v) => set({ psi: Math.round(v) })} step={1} value={raw.psi} />
              <div className="bc-row">
                <button className="secondary-button" onClick={() => set({ phi: HELIX.phi, psi: HELIX.psi })} type="button">α-helix</button>
                <button className="secondary-button" onClick={() => set({ phi: STRAND.typical.antiparallel.phi, psi: STRAND.typical.antiparallel.psi })} type="button">β-strand</button>
                <button className="secondary-button" onClick={() => set({ phi: 60, psi: 45 })} type="button">Left-handed</button>
                <button className="secondary-button" onClick={() => set({ phi: 60, psi: -120 })} type="button">Clash</button>
              </div>
              <NumberField hint="−180 to 180" label="φ (type a value)" onChange={(v) => { if (Number.isFinite(v) && v >= -180 && v <= 180) set({ phi: Math.round(v) }); }} unit="°" value={raw.phi} />
              <NumberField hint="−180 to 180" label="ψ (type a value)" onChange={(v) => { if (Number.isFinite(v) && v >= -180 && v <= 180) set({ psi: Math.round(v) }); }} unit="°" value={raw.psi} />
            </>
          ) : null}
          {view === "interactions" ? (
            <>
              <ParamSlider format={(v) => v.toFixed(1)} label="pH" max={14} min={0} onChange={(v) => setCond({ pH: Math.round(v * 10) / 10 })} step={0.1} value={raw.conditions.pH} />
              <Segmented<Thermal> label="Thermal energy" onChange={(v) => setCond({ thermal: v })} options={THERMAL} value={raw.conditions.thermal} />
              <label className="bc-check"><input checked={raw.conditions.reducingAgent} onChange={(e) => setCond({ reducingAgent: e.target.checked })} type="checkbox" /> Reducing agent (DTT, β-mercaptoethanol)</label>
              <label className="bc-check"><input checked={raw.conditions.denaturant} onChange={(e) => setCond({ denaturant: e.target.checked })} type="checkbox" /> Denaturant (urea, detergent)</label>
              <button className="secondary-button" onClick={() => update((c) => ({ ...c, conditions: DEFAULT_PROTEINS_INPUTS.conditions }))} type="button">Reset conditions</button>
            </>
          ) : null}
          {view === "mutation" ? (
            <>
              <label className="bc-select">Scenario
                <select data-testid="scenario-select" onChange={(e) => { const sc = SCENARIOS.find((x) => x.id === e.target.value)!; set({ scenario: sc.id, mutant: sc.suggested }); }} value={raw.scenario}>
                  {SCENARIOS.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                </select>
              </label>
              <label className="bc-select">Replace {AMINO_ACIDS_BY_ONE[scenario.original].name} with
                <select data-testid="mutant-select" onChange={(e) => set({ mutant: e.target.value })} value={raw.mutant}>
                  {AMINO_ACID_LIST.map((a) => <option key={a.one} value={a.one}>{CLASS_SHAPE[a.cls]} {a.name} ({a.one})</option>)}
                </select>
              </label>
              <button className="secondary-button" onClick={() => set({ mutant: scenario.suggested })} type="button">Use the documented variant</button>
            </>
          ) : null}
        </Panel>

        <div className="gc-stage">
          {view === "levels" ? (
            <>
              <DiagramFrame caption={`${example.name}: ${example.scope}`} label="Levels of protein structure" title={`${example.name}: ${["", "primary", "secondary", "tertiary", "quaternary"][level]} structure`}>
                <LevelsDiagram disulfides={example.disulfides} level={level} sequence={example.subunits[0].sequence} subunits={example.subunits} />
              </DiagramFrame>
              <Panel title={hide ? "Description hidden" : "What this level means here"}>
                {hide ? <><p>Describe what holds this level together, then reveal.</p><button className="secondary-button" onClick={() => setRevealed(true)} type="button">Reveal description</button></> : (
                  <p data-testid="level-text">{level === 1 ? `The primary structure is the order of amino acids. ${example.subunits.map((s) => `${s.name}: ${s.residues} residues`).join("; ")}.` : level === 2 ? example.secondary : level === 3 ? example.tertiary : example.quaternary}</p>
                )}
              </Panel>
            </>
          ) : null}

          {view === "helix" ? (
            <>
              <DiagramFrame caption="Residue i's C=O accepts a hydrogen bond from residue i+4's N–H. Click a residue to highlight its partners." label="Alpha helix backbone hydrogen bonds" title={`α-helix of ${raw.helixLength} residues`}>
                <HelixDiagram hideBonds={hide} n={raw.helixLength} onSelect={setPick} selected={pick} />
              </DiagramFrame>
              <KeyFigures items={[
                { label: "Backbone H-bonds", value: String(helixHBonds(raw.helixLength).length), note: "n − 4 (i → i+4)" },
                { label: "Residues per turn", value: String(HELIX.residuesPerTurn), note: `${HELIX.turnAngleDeg}° per residue` },
                { label: "Rise", value: `${HELIX.risePerResidueA} Å/residue`, note: `pitch ${HELIX.pitchA} Å` },
                { label: "Ends without partners", value: `${free.freeDonors.length} N–H, ${free.freeAcceptors.length} C=O`, note: "first four and last four" },
                { label: "φ, ψ", value: `${HELIX.phi}°, ${HELIX.psi}°`, note: "ideal right-handed α-helix" },
              ]} />
              {pick !== null ? (
                <Callout tone="info" title={`Residue ${pick + 1}`}>
                  <p data-testid="helix-selected">{[
                    helixHBonds(raw.helixLength).filter((b) => b.acceptor === pick).map((b) => `its C=O accepts from the N–H of residue ${b.donor + 1}`),
                    helixHBonds(raw.helixLength).filter((b) => b.donor === pick).map((b) => `its N–H donates to the C=O of residue ${b.acceptor + 1}`),
                  ].flat().join("; ") || "no backbone hydrogen bond to another residue inside this helix"}.</p>
                </Callout>
              ) : null}
              <DiagramFrame caption={`Looking down the helix axis, each residue is rotated ${HELIX.turnAngleDeg}° from the last. A schematic amphipathic sequence puts Leu (amber) on one face and Lys (blue) on the other; hydrophobic moment ${hydrophobicMoment(wheelSeq).toFixed(2)}.`} label="Helical wheel" title="Helical wheel (schematic amphipathic helix)">
                <HelicalWheel seq={wheelSeq} />
              </DiagramFrame>
              {mode === "explore" ? (
                <Panel title="Why does it behave this way?">
                  <Disclosure defaultOpen summary="Why are the ends different?"><p>Each backbone N–H and C=O points along the helix axis. The first four N–H groups and last four C=O groups have no partner, so helix ends are polar and are often capped by side chains or charged groups.</p></Disclosure>
                  <Disclosure summary="Why is proline a helix breaker?"><p>Proline's backbone nitrogen has no hydrogen and its ring restricts φ, so it cannot donate a hydrogen bond and kinks the helix. Try the “Proline inside an α-helix” scenario under Mutations.</p></Disclosure>
                </Panel>
              ) : null}
            </>
          ) : null}

          {view === "sheet" ? (
            <>
              <DiagramFrame caption="Each strand is almost fully extended (φ ≈ −120°, ψ ≈ +130°). In antiparallel sheets neighboring strands run in opposite directions; in parallel sheets they run the same way." label="Beta sheet" title={`${raw.sheetKind === "parallel" ? "Parallel" : "Antiparallel"} β-sheet`}>
                <SheetDiagram hideBonds={hide} model={sheet} />
              </DiagramFrame>
              <KeyFigures items={[
                { label: "Strands", value: String(sheet.strands), note: raw.sheetKind },
                { label: "Interstrand H-bonds", value: String(sheet.bonds.length), note: "drawn in the diagram" },
                { label: "Typical φ, ψ", value: `${STRAND.typical[raw.sheetKind].phi}°, ${STRAND.typical[raw.sheetKind].psi}°`, note: "textbook averages" },
                { label: "Rise per residue", value: `${STRAND.rise} Å`, note: "pleated, extended" },
              ]} />
              {mode === "explore" ? (
                <Panel title="Why does it behave this way?">
                  <Disclosure defaultOpen summary="Parallel versus antiparallel"><p>{raw.sheetKind === "antiparallel" ? "In an antiparallel sheet, N–H and C=O groups face each other directly across strands, giving short, nearly straight hydrogen bonds in a narrow–wide pattern." : "In a parallel sheet each residue bonds to two different residues on the next strand, so the hydrogen bonds are angled and the sheet is usually more twisted and needs long-range connections."}</p></Disclosure>
                  <Disclosure summary="β-turns"><ul className="gc-assumptions">{BETA_TURNS.map((t) => <li key={t.id}><strong>{t.label}</strong>: φ,ψ of residue i+1 ({t.i1.phi}°, {t.i1.psi}°) and i+2 ({t.i2.phi}°, {t.i2.psi}°). {t.note}</li>)}</ul></Disclosure>
                </Panel>
              ) : null}
            </>
          ) : null}

          {view === "rama" ? (
            <>
              <DiagramFrame caption="Shaded regions are the broad allowed areas for the chosen residue type; unshaded white-grey is sterically disallowed for most residues. Glyphs repeat the region (▲ α, ■ β/PPII, ◆ left-handed, ● bridge). Use the arrow keys on the marker (Shift for 10°)." label="Ramachandran plot" title="Ramachandran plot" legend={<ul className="bc-legend">{RAMA_LEGEND.map((l) => <li key={l.cls}><i style={{ background: ramaColor(l.cls) }} />{l.mark} {RAMA_LABEL[l.cls]}</li>)}</ul>}>
                <RamachandranPlot onChange={(phi, psi) => set({ phi, psi })} phi={raw.phi} psi={raw.psi} residue={raw.ramaResidue} />
              </DiagramFrame>
              <Callout tone={rama === "disallowed" ? "warn" : "ok"} title={hide ? "Region hidden" : RAMA_LABEL[rama]}>
                <p data-testid="rama-readout">{hide ? <>φ = {raw.phi}°, ψ = {raw.psi}°. Decide which region this is, then <button className="secondary-button" onClick={() => setRevealed(true)} type="button">Reveal</button></> : `φ = ${raw.phi}°, ψ = ${raw.psi}°. ${rama === "disallowed" ? "Atoms of neighboring residues would overlap (steric clash) for most residues at these angles." : "These angles are accessible without major steric clashes."}`}</p>
              </Callout>
              {mode === "explore" ? (
                <Panel title="Why does it behave this way?">
                  <Disclosure defaultOpen summary="What are φ and ψ?"><p>φ is the rotation about N–Cα and ψ about Cα–C. The peptide bond itself (ω) is planar and almost always trans, so φ and ψ are the only free backbone rotations. Most combinations are blocked because backbone and side-chain atoms would collide.</p></Disclosure>
                  <Disclosure summary="Glycine and proline"><p>Glycine has no side chain, so far more of the plot is allowed. Proline's ring fixes φ near −63°, so only a narrow band of φ is available.</p></Disclosure>
                </Panel>
              ) : null}
            </>
          ) : null}

          {view === "interactions" ? (
            <>
              <DiagramFrame caption="A made-up domain used to show which interactions respond to which condition. It is a qualitative demonstration, not the behavior of a particular protein." label="Folding interactions" title={hide ? "Model domain" : `Model domain: ${outcome.overall}`}>
                <InteractionDiagram hideLabels={hide} outcome={outcome} />
              </DiagramFrame>
              <Panel subtitle="Each row: how the interaction responds to the conditions on the left." title={hide ? "Interactions (hidden)" : "Interaction status"}>
                {hide ? <><p>Predict which interactions change, then reveal.</p><button className="secondary-button" onClick={() => setRevealed(true)} type="button">Reveal</button></> : (
                  <table className="bc-table" data-testid="interaction-table">
                    <thead><tr><th scope="col">Interaction</th><th scope="col">State</th><th scope="col">Why</th></tr></thead>
                    <tbody>{outcome.statuses.map((s) => <tr key={s.id}><th scope="row">{s.label}</th><td><strong>{s.state}</strong></td><td>{s.why}</td></tr>)}</tbody>
                  </table>
                )}
              </Panel>
              <KeyFigures items={[
                { label: "Overall", value: outcome.overall, note: `core is ${outcome.solvent}` },
                ...SALT_BRIDGES.map((s) => ({ label: s.label, value: `${(saltBridgeFraction(s, raw.conditions.pH) * 100).toFixed(0)}%`, note: "both partners charged" })),
              ]} />
              {outcome.notes.map((n) => <p className="ph-note" key={n}>{n}</p>)}
            </>
          ) : null}

          {view === "mutation" && sub ? (
            <>
              <Panel subtitle={scenario.protein} title={scenario.title}><p>{scenario.background}</p></Panel>
              <div className="bc-two">
                <DiagramFrame label={`Original residue ${sub.original.name}`} title={`Original: ${sub.original.name}`}><MoleculeSvg label={`Structure of ${sub.original.name}`} smiles={sub.original.smiles} width={280} height={210} /></DiagramFrame>
                <DiagramFrame label={`Substitute residue ${sub.mutant.name}`} title={`Substitute: ${sub.mutant.name}`}><MoleculeSvg label={`Structure of ${sub.mutant.name}`} smiles={sub.mutant.smiles} width={280} height={210} /></DiagramFrame>
              </div>
              {sub.helix ? (
                <DiagramFrame caption={`Proline cannot donate its N–H: ${sub.helix.lost.length} of ${sub.helix.madeBefore} i→i+4 hydrogen bonds are lost (marked ✖).`} label="Helix with substitution" title="Backbone hydrogen bonds after the substitution">
                  <HelixDiagram hideBonds={false} lost={sub.helix.lost} n={scenario.helixLength ?? 15} onSelect={() => undefined} selected={scenario.position - 1} />
                </DiagramFrame>
              ) : null}
              <Panel subtitle="Property comparison from the amino-acid reference data." title="What changes">
                {sub.same ? <p>The same amino acid is selected; nothing changes.</p> : (
                  <table className="bc-table" data-testid="substitution-table">
                    <thead><tr><th scope="col">Property</th><th scope="col">{sub.original.name}</th><th scope="col">{sub.mutant.name}</th><th scope="col">Changed</th></tr></thead>
                    <tbody>{sub.diffs.map((d) => <tr key={d.property}><th scope="row">{d.property}</th><td>{d.from}</td><td>{d.to}</td><td>{d.changed ? "yes" : "no"}</td></tr>)}</tbody>
                  </table>
                )}
              </Panel>
              <div className="bc-two">
                <Panel title="Supported by the model"><ul className="gc-assumptions" data-testid="supported">{sub.supported.length ? sub.supported.map((t) => <li key={t}>{t}</li>) : <li>Nothing specific for this substitution.</li>}</ul></Panel>
                <Panel title="Uncertain"><ul className="gc-assumptions" data-testid="uncertain">{sub.uncertain.length ? sub.uncertain.map((t) => <li key={t}>{t}</li>) : <li>No uncertainty flagged.</li>}</ul></Panel>
              </div>
              <p className="ph-note">This is a qualitative comparison of residues, not a prediction of folding, stability or disease.</p>
            </>
          ) : null}

          {mode === "practice" ? <QuizPanel questions={questions} /> : null}
          {mode === "challenge" ? (
            view === "mutation" ? (
              <PredictPanel finished={false} onReveal={() => update((c) => { const next = (c.challenge + 1) % challenges.length; const sc = SCENARIOS[next % SCENARIOS.length]; return { ...c, challenge: c.challenge + 1, scenario: sc.id, mutant: sc.suggested }; })} question={challenge} revealLabel="Show the next scenario" subtitle="Commit to a prediction about the model's support; then continue." />
            ) : <Callout tone="info" title="Challenge uses mutation scenarios"><p>Switch to Mutations to predict what the model supports for a substitution.</p><button className="secondary-button" onClick={() => set({ view: "mutation", scenario: SCENARIOS[raw.challenge % SCENARIOS.length].id, mutant: SCENARIOS[raw.challenge % SCENARIOS.length].suggested })} type="button">Go to Mutations</button></Callout>
          ) : null}
        </div>
      </div>

      <Panel subtitle="What this tool does and does not model." title="Assumptions and limits"><ul className="gc-assumptions">{PROTEINS_ASSUMPTIONS.map((x) => <li key={x}>{x}</li>)}</ul></Panel>
      <RelatedConcepts limit={5} subject="biochemistry" toolId="bcProteins" />
    </div>
  );
}
