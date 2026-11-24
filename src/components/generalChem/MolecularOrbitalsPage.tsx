import { useMemo } from "react";
import { RelatedConcepts } from "../ui/RelatedConcepts";
import "../../styles/generalChem.css";
import "../../styles/physics.css";
import "../../styles/chem22.css";
import "../../styles/chem28.css";
import { LineChart, type ChartMarker, type ChartSeries } from "../ui/LineChart";
import { LearningModeSwitch } from "../ui/LearningModeSwitch";
import { Badge, Callout, DiagramFrame, Disclosure, KeyFigures, Panel, Segmented, ToolHeader } from "../ui/primitives";
import { EvidencePanel } from "../ui/EvidencePanel";
import { Paragraphs } from "./shared";
import { QuestionPanel } from "./QuestionPanel";
import { RangeField, SelectField } from "./shared28";
import { LcaoCanvas, MODiagram, SchematicLobes } from "./MODiagrams28";
import { useGcWorkspace } from "./useGcWorkspace";
import { formatSig } from "../../utils/generalChem/format";
import { DIATOMICS, addElectron, analyzeOccupancy, boxesOf, getDiatomic, groundOccupancy, lcaoAmplitude, levelsOf, overlapS, removeElectron } from "../../utils/generalChem/mo28";
import { MO_ASSUMPTIONS, MO_CHALLENGE, MO_PRACTICE, moLessons, summarizeMO } from "../../utils/generalChem/learning28";
import {
  DEFAULT_MO_INPUTS, MOLORBITALS_ENGINE_VERSION, MO_VIEWS, MO_VIEW_LABEL, describeMOAnalysis, validateGcResults28, validateMOInputs, type MOInputs, type MOView,
} from "../../utils/persistence/gcTools28";

type Props = { openRequest?: { id: string; recordId: string } | null; onOpenHandled?: (requestId: string) => void };
const g = (v: number, sig = 4) => formatSig(v, sig);
const SPECIES_OPTIONS = DIATOMICS.map((s) => ({ value: s.id, label: `${s.formula} — ${s.name}` }));
const STATE_TEXT = ["empty", "↑", "↓", "↑↓"];
const STATE_WORD = ["empty", "one electron, spin up", "one electron, spin down", "two electrons, paired"];

export default function MolecularOrbitalsPage({ openRequest = null, onOpenHandled }: Props) {
  const ws = useGcWorkspace<MOInputs>({
    page: "molorbitals", engineVersion: MOLORBITALS_ENGINE_VERSION, defaults: DEFAULT_MO_INPUTS, validateInputs: validateMOInputs, validateResults: validateGcResults28,
    summarize: summarizeMO, describe: describeMOAnalysis, fallbackName: "Molecular orbital analysis", openRequest, onOpenHandled,
  });
  const { raw, update } = ws;
  const mode = raw.learn.mode; const view = raw.view;
  const sp = getDiatomic(raw.species) ?? DIATOMICS[0];
  const levels = levelsOf(sp); const boxes = boxesOf(sp);
  const rep = analyzeOccupancy(sp, raw.occ);
  const lessons = useMemo(() => (ws.valid ? moLessons(ws.valid) : []), [ws.valid]);
  const setLearn = (patch: Partial<MOInputs["learn"]>) => update((c) => ({ ...c, learn: { ...c.learn, ...patch } }));
  const setOcc = (occ: number[]) => update((c) => ({ ...c, occ }));
  const setSpecies = (id: string) => update((c) => ({ ...c, species: id, occ: groundOccupancy(getDiatomic(id) ?? DIATOMICS[0]) }));
  const compare = useMemo(() => DIATOMICS.map((s) => ({ s, r: analyzeOccupancy(s, groundOccupancy(s)) })), []);

  const ov = raw.overlap;
  const axial = useMemo(() => {
    const zmax = ov.R / 2 + 4; const sign = ov.combo === "bonding" ? 1 : -1;
    const pts = Array.from({ length: 241 }, (_, i) => { const z = -zmax + (2 * zmax * i) / 240; return { x: z, y: lcaoAmplitude(sign, ov.R, 0, z) }; });
    const sq = pts.map((p) => ({ x: p.x, y: p.y * p.y }));
    const ymax = Math.max(...pts.map((p) => Math.abs(p.y))) * 1.1 || 1;
    const series: ChartSeries[] = [{ id: "psi", label: "ψ (amplitude)", color: "#2563eb", points: pts }, { id: "psi2", label: "ψ² (probability density)", color: "#b45309", dash: "6 4", points: sq }];
    const markers: ChartMarker[] = [{ id: "a", x: -ov.R / 2, y: 0, label: "nucleus", kind: "info" }, { id: "b", x: ov.R / 2, y: 0, label: "nucleus", kind: "info" }];
    return { series, markers, zmax, ymax };
  }, [ov.R, ov.combo]);

  return (
    <div className="gc-page ph-page">
      <ToolHeader
        group="Analyze"
        title="Molecular orbitals"
        purpose="Build molecular-orbital diagrams of homonuclear diatomic molecules and ions, fill the orbitals electron by electron under Pauli, Hund and Aufbau checks, and read the bond order and magnetism that follow."
        evidence="model"
        steps={[
          { label: "Pick a species", detail: "H₂ to Ne₂ and some ions." },
          { label: "Fill the orbitals", detail: "Lowest first, singly in degenerate orbitals before pairing." },
          { label: "Read bond order and magnetism", detail: "Counted from your occupancy." },
        ]}
        aside={<Badge tone="neutral" title="Qualitative textbook diagrams; not a quantum-chemistry calculation.">qualitative MO theory</Badge>}
      />
      {ws.chrome}
      <div className="gc-toolbar">
        <LearningModeSwitch
          blurbs={{ explore: "Fill or edit the diagram and read the bond order, unpaired electrons and magnetism.", practice: "Fill the diagram and answer questions; the answer is checked against the occupancy model.", challenge: "Predict how a change in electron count alters the bond order or magnetism." }}
          mode={mode} modes={["explore", "practice", "challenge"]} onChange={(m) => setLearn({ mode: m })}
        />
        {ws.actions}
      </div>
      {ws.saveFormEl}

      <div className="gc-layout">
        <Panel className="gc-inputs" subtitle="Valence orbitals only; core 1s electrons cancel in the bond order." title="Species and electrons">
          <Segmented<MOView> label="What to work on" onChange={(v) => update((c) => ({ ...c, view: v }))} options={MO_VIEWS.map((v) => ({ id: v, label: MO_VIEW_LABEL[v] }))} value={view} />
          <SelectField label="Species" onChange={setSpecies} options={SPECIES_OPTIONS} value={raw.species} hint={sp.orderingBasis} />
          {view === "diagram" ? (
            <>
              <div className="gc-toolbar-actions">
                <button className="secondary-button" data-testid="mo-ground" onClick={() => setOcc(groundOccupancy(sp))} type="button">Fill the ground state</button>
                <button className="ghost-button" data-testid="mo-clear" onClick={() => setOcc(boxes.map(() => 0))} type="button">Clear</button>
              </div>
              <p className="gc-field-hint" data-testid="mo-count">{rep.placed} of {sp.valenceElectrons} valence electrons placed.</p>
              <fieldset className="chem-amount"><legend>Orbitals (lowest first)</legend>
                {boxes.map((b, i) => (
                  <div className="chem-mo-row" key={b.id}>
                    <span className="chem-mo-name">{levels[b.level].label}{levels[b.level].degeneracy === 2 ? ` (${b.sub + 1})` : ""}</span>
                    <output aria-label={`${levels[b.level].label} state`} data-testid={`mo-state-${b.id}`}>{STATE_TEXT[raw.occ[i]]}</output>
                    <button aria-label={`Add a spin-up electron to ${levels[b.level].label}${levels[b.level].degeneracy === 2 ? ` orbital ${b.sub + 1}` : ""}`} className="secondary-button" data-testid={`mo-up-${b.id}`} onClick={() => { const n = addElectron(raw.occ, i, "up"); if (n) setOcc(n); }} type="button">↑</button>
                    <button aria-label={`Add a spin-down electron to ${levels[b.level].label}${levels[b.level].degeneracy === 2 ? ` orbital ${b.sub + 1}` : ""}`} className="secondary-button" data-testid={`mo-down-${b.id}`} onClick={() => { const n = addElectron(raw.occ, i, "down"); if (n) setOcc(n); }} type="button">↓</button>
                    <button aria-label={`Remove an electron from ${levels[b.level].label}${levels[b.level].degeneracy === 2 ? ` orbital ${b.sub + 1}` : ""}`} className="ghost-button" data-testid={`mo-rm-${b.id}`} onClick={() => { const n = removeElectron(raw.occ, i); if (n) setOcc(n); }} type="button">−</button>
                  </div>
                ))}
              </fieldset>
            </>
          ) : (
            <>
              <Segmented<"bonding" | "antibonding"> label="Combination" onChange={(combo) => update((c) => ({ ...c, overlap: { ...c.overlap, combo } }))} options={[{ id: "bonding", label: "In phase (bonding)" }, { id: "antibonding", label: "Out of phase (antibonding)" }]} value={ov.combo} />
              <RangeField label="Distance between the nuclei R" max={6} min={0.5} onChange={(R) => update((c) => ({ ...c, overlap: { ...c.overlap, R: Math.round(R * 10) / 10 } }))} step={0.1} unit=" a₀" value={ov.R} />
              <button className="ghost-button" onClick={() => update((c) => ({ ...c, overlap: { ...c.overlap, R: 1.4 } }))} type="button">H₂ equilibrium distance (1.4 a₀)</button>
              <Segmented<"sigma" | "pi"> label="p-orbital picture" onChange={(pType) => update((c) => ({ ...c, overlap: { ...c.overlap, pType } }))} options={[{ id: "sigma", label: "σ (end-on)" }, { id: "pi", label: "π (side-on)" }]} value={ov.pType} />
            </>
          )}
        </Panel>

        <div className="gc-stage">
          {view === "diagram" ? (
            <>
              <Callout tone={rep.valid && rep.complete ? (rep.isGroundState ? "ok" : "info") : "warn"} title={`${sp.formula}: ${rep.complete ? (rep.isGroundState ? "ground-state occupancy" : "all electrons placed, not the ground state") : `${rep.placed} of ${rep.expected} electrons placed`}`}>
                <p data-testid="mo-config">{rep.configuration}</p>
                {rep.hundViolations.map((h) => <p data-testid="mo-hund" key={h}>{h}</p>)}
                {rep.aufbauViolations.map((h) => <p data-testid="mo-aufbau" key={h}>{h}</p>)}
                {rep.placed > rep.expected ? <p data-testid="mo-over">More electrons than the species has: remove {rep.placed - rep.expected}.</p> : null}
              </Callout>
              <DiagramFrame caption={`Electron configuration ${rep.configuration}. Heights show the order only. ${sp.orderingIsConvention ? "For this ion the ordering is the parent atoms' convention." : ""}`} label="Molecular orbital diagram" title={`${sp.formula} molecular orbital diagram`}>
                <MODiagram occ={raw.occ} onChange={setOcc} species={sp} />
              </DiagramFrame>
              <KeyFigures items={[
                { label: "Bonding electrons", value: String(rep.bonding) },
                { label: "Antibonding electrons", value: String(rep.antibonding) },
                { label: "Bond order", value: g(rep.bondOrder, 3), note: "(bonding − antibonding)/2" },
                { label: "Unpaired electrons", value: String(rep.unpaired), note: rep.unpaired > 0 ? `spin multiplicity ${rep.multiplicity}` : "all paired" },
                { label: "Magnetism", value: rep.magnetism, note: rep.spinOnlyMagneticMoment !== null ? `spin-only moment ${g(rep.spinOnlyMagneticMoment, 3)} μB` : "spin-only picture" },
              ]} />
              <Panel subtitle="Occupancy of every valence level, from the lowest." title="Orbital occupancy">
                <div className="gc-table-scroll">
                  <table className="gc-table ph-table" data-testid="mo-table">
                    <thead><tr><th scope="col">Level</th><th scope="col">Type</th><th scope="col">Orbitals</th><th scope="col">Electrons</th><th scope="col">Spins</th><th scope="col">Atomic orbitals combined</th></tr></thead>
                    <tbody>{levels.map((lv, li) => (
                      <tr key={lv.id}><th scope="row">{lv.label}</th><td>{lv.kind}</td><td>{lv.degeneracy}</td><td>{rep.perLevel[li]?.electrons ?? 0} of {2 * lv.degeneracy}</td>
                        <td>{boxes.map((b, i) => ({ b, i })).filter(({ b }) => b.level === li).map(({ i }) => STATE_WORD[raw.occ[i]]).join("; ")}</td><td>{lv.combination}</td></tr>
                    ))}</tbody>
                  </table>
                </div>
                <p className="gc-field-hint">{sp.orderingBasis}</p>
              </Panel>
              <Panel subtitle="Ground-state results for every supported species, from the same model. Bond order is a simple count, not a bond energy." title="Compare species">
                <div className="gc-table-scroll">
                  <table className="gc-table ph-table" data-testid="mo-compare">
                    <thead><tr><th scope="col">Species</th><th scope="col">Valence e⁻</th><th scope="col">Bond order</th><th scope="col">Unpaired</th><th scope="col">Magnetism</th></tr></thead>
                    <tbody>{compare.map(({ s, r }) => <tr className={s.id === sp.id ? "is-selected" : undefined} key={s.id}><th scope="row">{s.formula}</th><td>{s.valenceElectrons}</td><td>{g(r.bondOrder, 3)}</td><td>{r.unpaired}</td><td>{r.magnetism}</td></tr>)}</tbody>
                  </table>
                </div>
              </Panel>
              {sp.id === "o2" ? (
                <Callout tone="info" title="Why a Lewis structure cannot show O₂'s magnetism">
                  <p data-testid="o2-note">The O=O Lewis structure puts every electron in a pair, so it predicts a diamagnetic molecule. The MO diagram puts the last two electrons one each in the two degenerate π*2p orbitals with parallel spins (Hund's rule): two unpaired electrons, so liquid oxygen is attracted by a magnet.</p>
                </Callout>
              ) : null}
            </>
          ) : (
            <>
              <Callout tone="info" title={`${ov.combo === "bonding" ? "In-phase (bonding)" : "Out-of-phase (antibonding)"} combination of two 1s orbitals, R = ${g(ov.R, 3)} a₀`}>
                <p data-testid="lcao-text">ψ{ov.combo === "bonding" ? "+" : "−"} = (1s_A {ov.combo === "bonding" ? "+" : "−"} 1s_B)/√(2(1 {ov.combo === "bonding" ? "+" : "−"} S)), with overlap S = {g(overlapS(ov.R), 4)}. {ov.combo === "bonding" ? "The amplitude keeps one sign and the density builds up between the nuclei." : "The amplitude is zero on the plane midway between the nuclei (a node) and changes sign across it."}</p>
                <p>This is an explicit approximation (two hydrogen 1s functions with exponent 1, no optimisation), an illustration of overlap and not a quantitatively accurate electron density. Blue and orange show the sign of ψ, not electric charge.</p>
              </Callout>
              <DiagramFrame caption="Computed from the formula above in a plane containing the bond axis." label="LCAO of two 1s orbitals" title={ov.combo === "bonding" ? "σ1s (in phase)" : "σ*1s (out of phase)"}><LcaoCanvas R={ov.R} combo={ov.combo} /></DiagramFrame>
              <DiagramFrame caption="Amplitude and probability density along the bond axis." label="Axial profile" title="ψ and ψ² along the bond axis">
                <LineChart formatX={(x) => g(x, 3)} formatY={(y) => g(y, 3)} markers={axial.markers} series={axial.series} title="Axial profile" valueText={`${ov.combo} combination, R ${g(ov.R, 3)}`} xDomain={[-axial.zmax, axial.zmax]} xLabel="Position along the bond axis z (a₀)" yDomain={[-axial.ymax * (ov.combo === "bonding" ? 0.05 : 1), axial.ymax]} yLabel="ψ or ψ²" />
              </DiagramFrame>
              <DiagramFrame caption="p orbitals combine end-on to make σ orbitals and side-on to make π orbitals." label="p-orbital combinations" title={`${ov.pType === "sigma" ? "σ" : "π"}2p ${ov.combo === "bonding" ? "bonding" : "antibonding"} (schematic)`}>
                <SchematicLobes combo={ov.combo} kind={ov.pType} />
              </DiagramFrame>
              <KeyFigures items={[{ label: "Overlap S", value: g(overlapS(ov.R), 4), note: "S = e^(−R)(1 + R + R²/3)" }, { label: "Nodal plane", value: ov.combo === "bonding" ? "none" : "midway between the nuclei" }, { label: "Combination", value: ov.combo === "bonding" ? "in phase: bonding" : "out of phase: antibonding" }]} />
            </>
          )}

          {mode === "practice" ? (
            <QuestionPanel current={raw} index={raw.learn.practice} onIndex={(practice) => setLearn({ practice })} onLoad={(next) => update(() => next)} questions={MO_PRACTICE} subtitle="Use “Set this up in the tool”, fill the diagram, then answer. Answers come from the occupancy model." title="Practice" />
          ) : mode === "challenge" ? (
            <QuestionPanel current={raw} index={raw.learn.challenge} onIndex={(challenge) => setLearn({ challenge })} onLoad={(next) => update(() => next)} questions={MO_CHALLENGE} subtitle="Predict first; the model then shows the result." title="Challenge" />
          ) : lessons.length ? (
            <Panel subtitle="Each answer quotes the numbers for your current species and occupancy." title="Why does it behave this way?">
              {lessons.map((l) => <Disclosure key={l.id} summary={l.title}><Paragraphs items={l.body} /></Disclosure>)}
            </Panel>
          ) : null}
        </div>
      </div>

      <EvidencePanel id="gc-mo-diatomics" />
      <EvidencePanel id="gc-mo-lcao" />
      <Panel subtitle="What this tool does and does not model." title="Assumptions and limits">
        <ul className="gc-assumptions">{MO_ASSUMPTIONS.map((a) => <li key={a}>{a}</li>)}</ul>
      </Panel>
      <RelatedConcepts subject="general" toolId="gcMO" />
    </div>
  );
}
