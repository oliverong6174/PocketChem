import { useEffect, useMemo, useState } from "react";
import { RelatedConcepts } from "../ui/RelatedConcepts";
import { LearningModeSwitch } from "../ui/LearningModeSwitch";
import { Badge, Callout, DiagramFrame, Disclosure, KeyFigures, Panel, Segmented, ToolHeader } from "../ui/primitives";
import { LineChart } from "../ui/LineChart";
import { ParamSlider } from "../physics/sim";
import { useGcWorkspace } from "../generalChem/useGcWorkspace";
import { PredictPanel, QuizPanel, SeqField } from "../biology/bioShared";
import { MoleculeSvg, type Role } from "./MoleculeSvg";
import { getRDKit } from "../../utils/rdkit";
import { AMINO_ACID_LIST, AMINO_ACIDS_BY_ONE, CLASS_LABEL, CLASS_SHAPE, type AaClass } from "../../utils/biochem/aminoAcids";
import { analyzeAminoAcid, peptideRoles, type AminoAcidRoles } from "../../utils/biochem/aaStructure";
import { chargeCurve, dominantForm, groupStates, isoelectricPoint, netCharge, peptideGroups, peptideIsoelectricPoint, peptideNetCharge } from "../../utils/biochem/ionization";
import { PEPTIDE_BOND_CONTEXT, PEPTIDE_BOND_FACTS, PEPTIDE_LIMITS, addResidue, parsePeptide, peptideStructure, removeResidue, reversed, summarizePeptide } from "../../utils/biochem/peptide";
import { aminoAcidChallenges, aminoAcidQuestions } from "../../utils/biochem/learning";
import {
  AMINOACIDS_ASSUMPTIONS, AMINOACIDS_ENGINE_VERSION, DEFAULT_AMINOACIDS_INPUTS, describeAminoAcidsAnalysis, summarizeAminoAcids, validateAminoAcidsInputs,
  type AaView, type AminoAcidsInputs,
} from "../../utils/persistence/biochemTools17";
import { validateBiologyResults } from "../../utils/persistence/biologyTools";
import { takeHandoff } from "../../utils/biology/handoff16";
import "../../styles/biochemistry.css";

type Props = { openRequest?: { id: string; recordId: string } | null; onOpenHandled?: (requestId: string) => void };

const BACKBONE: [number, number, number] = [0.55, 0.78, 0.95];
const SIDE: [number, number, number] = [0.98, 0.78, 0.45];
const IONIC: [number, number, number] = [0.9, 0.45, 0.55];
const BOND: [number, number, number] = [0.6, 0.85, 0.6];
const CLASS_ORDER: AaClass[] = ["nonpolar-aliphatic", "aromatic", "polar-uncharged", "positive", "negative"];
const VIEWS: Array<{ id: AaView; label: string }> = [{ id: "residue", label: "One amino acid" }, { id: "compare", label: "Compare two" }, { id: "ionization", label: "Ionization & pKa" }, { id: "peptide", label: "Build a peptide" }];

function useRoles(one: string): AminoAcidRoles | null {
  const [roles, setRoles] = useState<AminoAcidRoles | null>(null);
  useEffect(() => {
    let live = true;
    getRDKit().then((rd) => { if (live) setRoles(analyzeAminoAcid(rd, one)); }).catch(() => { if (live) setRoles(null); });
    return () => { live = false; };
  }, [one]);
  return roles && roles.smiles === AMINO_ACIDS_BY_ONE[one].smiles ? roles : null;
}

function rolesFor(r: AminoAcidRoles | null, showIonic: boolean): Role[] {
  if (!r) return [];
  const out: Role[] = [
    { atoms: [...r.amino, r.alphaC, ...r.carboxyl], color: BACKBONE, label: "Backbone (amino, Cα, carboxyl)" },
    { atoms: r.sideChain, color: SIDE, label: "Side chain (R)" },
  ];
  if (showIonic && r.sideIonizable) out.push({ atoms: r.sideIonizable, color: IONIC, label: "Ionizable side-chain group" });
  return out;
}

function ClassButton({ one, active, onPick, mark }: { one: string; active: boolean; onPick: () => void; mark?: string }) {
  const a = AMINO_ACIDS_BY_ONE[one];
  return (
    <button aria-label={`${a.name}, ${a.three}, ${CLASS_LABEL[a.cls]}`} aria-pressed={active} className={`bc-aa bc-${a.cls}${active ? " is-active" : ""}`} data-testid={`aa-${one}`} onClick={onPick} title={`${a.name}, ${CLASS_LABEL[a.cls]}`} type="button">
      <span aria-hidden="true">{CLASS_SHAPE[a.cls]}</span> {a.one} <small>{a.three}</small>{mark ? <em>{mark}</em> : null}
    </button>
  );
}

function AaGrid({ value, onPick, label }: { value: string; onPick: (one: string) => void; label: string }) {
  return (
    <div aria-label={label} className="bc-grid" role="group">
      {CLASS_ORDER.map((c) => (
        <div className="bc-grid-row" key={c}>
          <span className="bc-grid-label">{CLASS_SHAPE[c]} {CLASS_LABEL[c]}</span>
          {AMINO_ACID_LIST.filter((a) => a.cls === c).map((a) => <ClassButton active={a.one === value} key={a.one} onPick={() => onPick(a.one)} one={a.one} />)}
        </div>
      ))}
    </div>
  );
}

function Properties({ one }: { one: string }) {
  const a = AMINO_ACIDS_BY_ONE[one];
  return (
    <dl className="bc-props" data-testid="aa-props">
      <dt>Name</dt><dd>{a.name} ({a.three}, {a.one})</dd>
      <dt>Class</dt><dd>{CLASS_SHAPE[a.cls]} {CLASS_LABEL[a.cls]}</dd>
      <dt>Formula</dt><dd>{a.formula}</dd>
      <dt>Hydropathy (Kyte–Doolittle)</dt><dd>{a.hydropathy > 0 ? "+" : ""}{a.hydropathy}</dd>
      <dt>Residue volume</dt><dd>{a.volume} Å³</dd>
      <dt>Ionizable groups (pKa)</dt><dd>{a.groups.map((g) => `${g.label} ${g.pKa}`).join(", ")}</dd>
      <dt>Isoelectric point</dt><dd>{isoelectricPoint(a.groups).toFixed(2)}</dd>
      <dt>Stereochemistry</dt><dd>{Object.keys(a.stereo).length ? Object.entries(a.stereo).map(([k, v]) => `${k} (${v})`).join(", ") + " — the natural L-form" : "none (achiral)"}</dd>
    </dl>
  );
}

export default function AminoAcidsPage({ openRequest = null, onOpenHandled }: Props) {
  const ws = useGcWorkspace<AminoAcidsInputs>({
    page: "aminoacids", engineVersion: AMINOACIDS_ENGINE_VERSION, defaults: DEFAULT_AMINOACIDS_INPUTS, validateInputs: validateAminoAcidsInputs, validateResults: validateBiologyResults,
    summarize: summarizeAminoAcids, describe: describeAminoAcidsAnalysis, fallbackName: "Amino acids & peptides", openRequest, onOpenHandled,
  });
  const { raw, update } = ws;
  const set = (patch: Partial<AminoAcidsInputs>) => update((c) => ({ ...c, ...patch }));
  const mode = raw.mode;
  const a = AMINO_ACIDS_BY_ONE[raw.residue], b = AMINO_ACIDS_BY_ONE[raw.other];
  const rolesA = useRoles(raw.residue), rolesB = useRoles(raw.other);
  const [revealed, setRevealed] = useState(false);
  const [handoffNote, setHandoffNote] = useState<string | null>(null);

  // A peptide sent from Biology's Translation tool is taken once and saved in this tool's own state.
  useEffect(() => {
    const h = takeHandoff("peptide");
    if (!h) return;
    const p = parsePeptide(h.sequence);
    if (p.ok && p.ignored === 0) {
      update((c) => ({ ...c, view: "peptide", sequence: p.seq, selected: null }));
      // eslint-disable-next-line react-hooks/set-state-in-effect -- takes the one-shot hand-off slot (an external value) once at mount
      setHandoffNote(`Loaded ${p.seq.length} residues from ${h.source}.`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const parsed = useMemo(() => parsePeptide(raw.sequence), [raw.sequence]);
  const seq = parsed.ok ? parsed.seq : DEFAULT_AMINOACIDS_INPUTS.sequence;
  const summary = useMemo(() => summarizePeptide(seq), [seq]);
  const pep = useMemo(() => peptideRoles(seq), [seq]);
  const peptideErr = !parsed.ok ? parsed.error : null;

  const questions = useMemo(() => aminoAcidQuestions(raw.residue, raw.other, raw.pH, seq), [raw.residue, raw.other, raw.pH, seq]);
  const challenges = useMemo(() => aminoAcidChallenges(raw.residue), [raw.residue]);
  const challenge = challenges[raw.challenge % challenges.length];
  const hide = mode === "practice" && !revealed;

  const states = useMemo(() => groupStates(a.groups, raw.pH), [a, raw.pH]);
  const form = dominantForm(a, raw.pH);
  const pI = isoelectricPoint(a.groups);
  const curve = useMemo(() => chargeCurve(a.groups), [a]);
  const q = netCharge(a, raw.pH);
  const view = raw.view;

  const peptideHighlights: Role[] = useMemo(() => {
    const sel = raw.selected !== null && raw.selected < seq.length ? pep && peptideStructureAtoms(seq, raw.selected) : null;
    const base: Role[] = [
      { atoms: pep.backbone, color: BACKBONE, label: "Backbone" },
      { atoms: pep.side, color: SIDE, label: "Side chains" },
      { atoms: pep.bondAtoms, color: BOND, label: "Peptide-bond planar unit (C=O, N)" },
    ];
    if (sel) base.push({ atoms: sel, color: IONIC, label: `Selected residue ${raw.selected! + 1} (${seq[raw.selected!]})` });
    return base;
  }, [pep, raw.selected, seq]);

  const setSeq = (next: string | null) => { if (next !== null) set({ sequence: next, selected: null }); };

  return (
    <div className="gc-page ph-page bio-page bc-page">
      <ToolHeader
        group="Biomolecules"
        title="Amino acids & peptides"
        purpose="Explore the 20 standard amino acids as real structures: what their side chains do, how each group gains or loses protons as the pH changes, and how a peptide chain is built from them."
        evidence="model"
        steps={[
          { label: "Pick an amino acid", detail: "Grouped by side-chain class; the shape marks the class." },
          { label: "Change the pH or build a chain", detail: "Charges and the peptide bond update with the structure." },
          { label: "Practise or predict", detail: "Hide labels, answer questions, or predict a charge change." },
        ]}
        aside={<Badge tone="neutral" title="Textbook pKa and hydropathy values.">Reference values</Badge>}
      />
      {ws.chrome}
      <div className="gc-toolbar">
        <LearningModeSwitch mode={mode} modes={["explore", "practice", "challenge"]} onChange={(m) => { setRevealed(false); update((c) => ({ ...c, mode: m })); }} />
        {ws.actions}
      </div>
      {ws.saveFormEl}

      <div className="bc-views"><Segmented<AaView> label="View" onChange={(v) => set({ view: v })} options={VIEWS} value={view} /></div>

      <div className="gc-layout">
        <Panel className="gc-inputs" subtitle={view === "compare" ? "Pick the first amino acid here and the second below." : view === "peptide" ? "Click a residue to add it at the end." : "Choose an amino acid."} title={view === "peptide" ? "Residue palette" : "Amino acid"}>
          <AaGrid label="Amino acids" onPick={(one) => (view === "peptide" ? setSeq(addResidue(seq, one)) : set({ residue: one }))} value={view === "peptide" ? "" : raw.residue} />
          {view === "compare" ? (
            <>
              <h4 className="bc-sub">Compare with</h4>
              <AaGrid label="Second amino acid" onPick={(one) => set({ other: one })} value={raw.other} />
            </>
          ) : null}
          {view === "peptide" ? (
            <>
              <SeqField error={peptideErr} hint={`One-letter codes, ${PEPTIDE_LIMITS.min}–${PEPTIDE_LIMITS.max} residues, written N→C.`} label="Sequence (N → C)" onChange={(v) => set({ sequence: v, selected: null })} value={raw.sequence} />
              <div className="bc-row">
                <button className="secondary-button" disabled={seq.length <= PEPTIDE_LIMITS.min} onClick={() => setSeq(removeResidue(seq, seq.length - 1))} type="button">Remove last</button>
                <button className="secondary-button" onClick={() => setSeq(reversed(seq))} type="button">Reverse chain</button>
              </div>
              {handoffNote ? <Callout tone="info" title="From Biology"><p>{handoffNote}</p></Callout> : null}
            </>
          ) : null}
          {view === "ionization" || view === "peptide" ? <ParamSlider format={(v) => v.toFixed(1)} label="pH" max={14} min={0} onChange={(v) => set({ pH: Math.round(v * 10) / 10 })} step={0.1} value={raw.pH} /> : null}
        </Panel>

        <div className="gc-stage">
          {view !== "peptide" && view !== "compare" ? (
            <>
              <DiagramFrame
                caption="Backbone atoms are shaded blue and the side chain amber; the ionizable side-chain group (when there is one) is shaded rose. The free amino acid is drawn in its neutral form; in water near pH 7 it is a zwitterion."
                label={`Structure of ${a.name}`}
                title={hide && view === "residue" ? "Structure (name hidden)" : `${a.name} (${a.three})`}
              >
                <MoleculeSvg highlights={rolesFor(rolesA, view === "ionization")} label={`Structure of ${hide ? "an amino acid" : a.name}`} smiles={a.smiles} />
              </DiagramFrame>
              {view === "residue" ? (
                <>
                  <Panel subtitle="Reference values for the free amino acid." title={hide ? "Properties hidden" : "Properties"}>
                    {hide ? (
                      <><p>Name the class of this side chain from the structure, then reveal.</p><button className="secondary-button" onClick={() => setRevealed(true)} type="button">Reveal properties</button></>
                    ) : <Properties one={raw.residue} />}
                  </Panel>
                  {mode === "explore" ? (
                    <Panel title="Why does it behave this way?">
                      <Disclosure defaultOpen summary="What does this side chain do?"><p>{a.role}</p><ul className="gc-assumptions">{a.interactions.map((x) => <li key={x}>{x}</li>)}</ul></Disclosure>
                      <Disclosure summary="Why is the structure drawn this way?"><p>Every α-amino acid has an amino group, a carboxyl group and a side chain on the same carbon (Cα). The natural amino acids are the L-form; with CIP rules that is (S) for all chiral ones except cysteine, where sulfur raises the priority of the side chain and the same spatial arrangement is labelled (R).</p></Disclosure>
                      <Disclosure summary="What are the class shapes for?"><p>The shape (● ⬢ ◆ ▲ ▼) on each button repeats the class so the grouping never relies on color alone.</p></Disclosure>
                    </Panel>
                  ) : null}
                </>
              ) : (
                <>
                  <KeyFigures items={[
                    { label: "Net charge", value: q.toFixed(2), note: form.name },
                    { label: "Isoelectric point", value: pI.toFixed(2), note: "neutral overall" },
                    { label: "Dominant form", value: form.charge > 0 ? "+" : form.charge < 0 ? "−" : "0", note: form.note },
                  ]} />
                  <DiagramFrame caption="Net charge of the free amino acid against pH. The marker is your pH; the dashed levels are the pKa values and the isoelectric point (pI) is where the curve crosses zero." label="Titration charge curve" title="Net charge versus pH">
                    <LineChart
                      current={{ x: raw.pH, y: q }}
                      formatX={(x) => x.toFixed(1)}
                      formatY={(y) => y.toFixed(1)}
                      markers={[...a.groups.map((g) => ({ id: g.id, x: g.pKa, y: netCharge(a, g.pKa), label: `pKa ${g.pKa}`, kind: "half" as const })), { id: "pi", x: pI, y: 0, label: `pI ${pI.toFixed(2)}`, kind: "equivalence" as const }]}
                      onXChange={(x) => set({ pH: Math.round(Math.min(14, Math.max(0, x)) * 10) / 10 })}
                      series={[{ id: "q", label: "Net charge", points: curve }]}
                      title={`Net charge of ${a.name}`}
                      valueText={`pH ${raw.pH.toFixed(1)}, net charge ${q.toFixed(2)}`}
                      xDomain={[0, 14]} xLabel="pH" xStep={0.1}
                      yDomain={[-3, 3]} yLabel="Net charge (e)"
                    />
                  </DiagramFrame>
                  <Panel subtitle="Fraction protonated = 1 / (1 + 10^(pH − pKa)); at pH = pKa it is one half." title="Each ionizable group">
                    <table className="bc-table" data-testid="group-table">
                      <thead><tr><th scope="col">Group</th><th scope="col">pKa</th><th scope="col">Protonated</th><th scope="col">Charge</th><th scope="col">Main form</th></tr></thead>
                      <tbody>{states.map((s) => (
                        <tr key={s.group.id}><th scope="row">{s.group.label}</th><td>{s.group.pKa}</td><td>{(s.protonated * 100).toFixed(0)}%</td><td>{s.charge > 0 ? "+" : ""}{s.charge.toFixed(2)}</td><td>{s.state}{s.mixed ? " (mixture)" : ""}</td></tr>
                      ))}</tbody>
                    </table>
                  </Panel>
                </>
              )}
            </>
          ) : null}

          {view === "compare" ? (
            <>
              <div className="bc-two">
                <DiagramFrame label={`Structure of ${a.name}`} title={a.name}><MoleculeSvg highlights={rolesFor(rolesA, true)} label={`Structure of ${a.name}`} smiles={a.smiles} width={300} height={230} /></DiagramFrame>
                <DiagramFrame label={`Structure of ${b.name}`} title={b.name}><MoleculeSvg highlights={rolesFor(rolesB, true)} label={`Structure of ${b.name}`} smiles={b.smiles} width={300} height={230} /></DiagramFrame>
              </div>
              <Panel subtitle="Differences are marked; shared values are shown once." title="Side by side">
                <table className="bc-table" data-testid="compare-table">
                  <thead><tr><th scope="col">Property</th><th scope="col">{a.name}</th><th scope="col">{b.name}</th><th scope="col">Differs</th></tr></thead>
                  <tbody>
                    {([
                      ["Class", CLASS_LABEL[a.cls], CLASS_LABEL[b.cls]],
                      ["Formula", a.formula, b.formula],
                      ["Hydropathy", String(a.hydropathy), String(b.hydropathy)],
                      ["Residue volume (Å³)", String(a.volume), String(b.volume)],
                      ["Side-chain heavy atoms", String(a.sideChainHeavyAtoms), String(b.sideChainHeavyAtoms)],
                      ["Side-chain pKa", a.groups.find((g) => g.id === "side-chain")?.pKa.toString() ?? "none", b.groups.find((g) => g.id === "side-chain")?.pKa.toString() ?? "none"],
                      ["pI", isoelectricPoint(a.groups).toFixed(2), isoelectricPoint(b.groups).toFixed(2)],
                      ["Net charge at pH 7", netCharge(a, 7).toFixed(2), netCharge(b, 7).toFixed(2)],
                    ] as Array<[string, string, string]>).map(([k, x, y]) => <tr key={k}><th scope="row">{k}</th><td>{x}</td><td>{y}</td><td>{x === y ? "same" : "different"}</td></tr>)}
                  </tbody>
                </table>
                {a.one === b.one ? <p className="ph-note">The same amino acid is selected twice; pick a different second amino acid to see differences.</p> : null}
              </Panel>
            </>
          ) : null}

          {view === "peptide" ? (
            <>
              <Panel subtitle={mode === "practice" ? "Select a residue to inspect it." : "Click a residue to inspect it, in the order N → C."} title={`Chain (${seq.length} residues)`}>
                <ol aria-label="Residues in the peptide" className="bc-chain" data-testid="peptide-chain">
                  {[...seq].map((r, i) => (
                    <li key={i}>
                      <button aria-pressed={raw.selected === i} className={`bc-aa bc-${AMINO_ACIDS_BY_ONE[r].cls}${raw.selected === i ? " is-active" : ""}`} onClick={() => set({ selected: raw.selected === i ? null : i })} type="button">
                        <span aria-hidden="true">{CLASS_SHAPE[AMINO_ACIDS_BY_ONE[r].cls]}</span> {r}<small>{i + 1}</small>
                      </button>
                      {i < seq.length - 1 ? <span aria-label="peptide bond" className="bc-bond" role="img">–CO–NH–</span> : null}
                    </li>
                  ))}
                </ol>
                {raw.selected !== null && raw.selected < seq.length ? (
                  <div className="bc-selected" data-testid="selected-residue">
                    <Properties one={seq[raw.selected]} />
                    <p>{raw.selected === 0 ? "N-terminal residue: its α-amino group is free (pKa ≈ 8)." : raw.selected === seq.length - 1 ? "C-terminal residue: its α-carboxyl group is free (pKa ≈ 3.1)." : "Internal residue: its α-amino and α-carboxyl groups are part of peptide bonds."}</p>
                  </div>
                ) : null}
              </Panel>
              <DiagramFrame
                caption="Blue: backbone. Amber: side chains. Green: the atoms of each peptide bond (C=O of one residue and the N of the next); the planar amide unit also includes both neighboring Cα atoms. The chain is drawn neutral and un-ionized."
                label={`Structure of the peptide ${seq}`}
                title={`Peptide ${seq.length > 12 ? `${seq.slice(0, 12)}…` : seq} (${seq.length} residues)`}
              >
                <MoleculeSvg highlights={peptideHighlights} height={seq.length > 6 ? 360 : 280} label={`Structure of the peptide ${seq}`} smiles={pep.smiles} width={seq.length > 6 ? 640 : 480} />
              </DiagramFrame>
              <KeyFigures items={[
                { label: "Formula", value: summary.formula, note: `${summary.bonds} peptide bond${summary.bonds === 1 ? "" : "s"}; ${summary.bonds} water${summary.bonds === 1 ? "" : "s"} lost` },
                { label: "Monoisotopic mass", value: `${summary.monoMass.toFixed(4)} Da`, note: `average ${summary.avgMass.toFixed(2)} Da` },
                { label: `Net charge at pH ${raw.pH.toFixed(1)}`, value: peptideNetCharge(seq, raw.pH).toFixed(2), note: `pI ≈ ${peptideIsoelectricPoint(seq).toFixed(2)}` },
                { label: "GRAVY", value: summary.gravy.toFixed(2), note: summary.gravy > 0 ? "overall hydrophobic" : "overall hydrophilic" },
              ]} />
              <Panel subtitle="Counts of ionizable groups at the terminus and in side chains." title="Ionizable groups in this peptide">
                <ul className="gc-assumptions" data-testid="peptide-groups">{peptideGroups(seq).map((g, i) => <li key={`${g.label}-${i}`}>{g.label}: pKa ≈ {g.pKa}</li>)}</ul>
              </Panel>
              {mode === "explore" ? (
                <Panel title="Why is the peptide bond special?">
                  <Disclosure defaultOpen summary="Facts about the amide (peptide) bond"><ul className="gc-assumptions">{PEPTIDE_BOND_FACTS.map((f) => <li key={f}>{f}</li>)}</ul></Disclosure>
                  <Disclosure summary="Is forming it favorable?"><p>{PEPTIDE_BOND_CONTEXT}</p></Disclosure>
                  <Disclosure summary="Does the order matter?"><p>Yes. {seq} and its reverse {reversed(seq)} have the same composition and mass but are different molecules, because a peptide has direction: the free amino end (N-terminus) and the free carboxyl end (C-terminus). Use “Reverse chain” to compare.</p></Disclosure>
                </Panel>
              ) : null}
            </>
          ) : null}

          {mode === "practice" ? <QuizPanel questions={questions} /> : null}
          {mode === "challenge" ? (
            view === "ionization" || view === "residue" ? (
              <PredictPanel finished={false} onReveal={() => update((c) => ({ ...c, view: "ionization", pH: challenge.reveal.pH ?? c.pH, challenge: c.challenge + 1 }))} question={challenge.question} revealLabel="Apply the pH and show the curve" subtitle="Commit to a prediction first; the pH is then applied to the chart." />
            ) : <Callout tone="info" title="Challenge uses the ionization chart"><p>Switch to “Ionization &amp; pKa” to predict how the net charge changes with pH.</p><button className="secondary-button" onClick={() => set({ view: "ionization" })} type="button">Go to Ionization &amp; pKa</button></Callout>
          ) : null}
        </div>
      </div>

      <Panel subtitle="What this tool does and does not model." title="Assumptions and limits">
        <ul className="gc-assumptions">{AMINOACIDS_ASSUMPTIONS.map((x) => <li key={x}>{x}</li>)}</ul>
      </Panel>
      <RelatedConcepts subject="biochemistry" toolId="bcAminoAcids" />
    </div>
  );
}

/** Atoms of one residue in the assembled peptide (backbone and side chain), for the selection highlight. */
function peptideStructureAtoms(seq: string, index: number): number[] {
  const r = peptideStructure(seq).residues[index];
  return [r.N, r.CA, r.C, r.O, ...r.side];
}
