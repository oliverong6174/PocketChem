import { useMemo } from "react";
import { RelatedConcepts } from "../ui/RelatedConcepts";
import "../../styles/generalChem.css";
import "../../styles/physics.css";
import "../../styles/chem22.css";
import "../../styles/chem28.css";
import { LearningModeSwitch } from "../ui/LearningModeSwitch";
import { Badge, Callout, DiagramFrame, Disclosure, KeyFigures, Panel, Segmented, ToolHeader } from "../ui/primitives";
import { EvidencePanel } from "../ui/EvidencePanel";
import { Paragraphs } from "./shared";
import { QuestionPanel } from "./QuestionPanel";
import { RangeField, SelectField } from "./shared28";
import { rangeOf } from "../../utils/generalChem/range28";
import { GeometryDiagram, HybridDiagram, LewisDiagram } from "./BondingDiagrams28";
import { useGcWorkspace } from "./useGcWorkspace";
import { formatSig } from "../../utils/generalChem/format";
import { MOLECULES, analyzeLewis, getMolecule, hybridization, resonanceHybrid, structureToState } from "../../utils/generalChem/lewis28";
import { POLARITY_CUTOFFS, POLARITY_ELEMENTS, bondPolarity, centerDomains, describeGeometry, polarityOf, vseprGeometry } from "../../utils/generalChem/vsepr28";
import { BONDING_ASSUMPTIONS, BONDING_CHALLENGE, BONDING_PRACTICE, bondingLessons, summarizeBonding } from "../../utils/generalChem/learning28";
import {
  BONDING_ENGINE_VERSION, BONDING_VIEWS, BONDING_VIEW_LABEL, DEFAULT_BONDING_INPUTS, describeBondingAnalysis, lewisStateFor, validateBondingInputs, validateGcResults28, type BondingInputs, type BondingView,
} from "../../utils/persistence/gcTools28";

type Props = { openRequest?: { id: string; recordId: string } | null; onOpenHandled?: (requestId: string) => void };
const g = (v: number, sig = 4) => formatSig(v, sig);
const MOL_OPTIONS = MOLECULES.map((m) => ({ value: m.id, label: `${m.formula} — ${m.name}` }));
const VIEW_PRESETS: Array<{ label: string; az: number; el: number }> = [{ label: "Default", az: 25, el: 15 }, { label: "Front", az: 0, el: 0 }, { label: "Side", az: 90, el: 0 }, { label: "Top", az: 0, el: 80 }];
const fcText = (v: number) => (v > 0 ? `+${v}` : v < 0 ? `−${-v}` : "0");

export default function BondingGeometryPage({ openRequest = null, onOpenHandled }: Props) {
  const ws = useGcWorkspace<BondingInputs>({
    page: "bonding", engineVersion: BONDING_ENGINE_VERSION, defaults: DEFAULT_BONDING_INPUTS, validateInputs: validateBondingInputs, validateResults: validateGcResults28,
    summarize: summarizeBonding, describe: describeBondingAnalysis, fallbackName: "Bonding and geometry analysis", openRequest, onOpenHandled,
  });
  const { raw, update } = ws;
  const mode = raw.learn.mode; const view = raw.view;
  const m = getMolecule(raw.molecule) ?? MOLECULES[0];
  const setLearn = (patch: Partial<BondingInputs["learn"]>) => update((c) => ({ ...c, learn: { ...c.learn, ...patch } }));
  const setGeo = (patch: Partial<BondingInputs["geometry"]>) => update((c) => ({ ...c, geometry: { ...c.geometry, ...patch } }));
  const setMolecule = (id: string) => update((c) => ({ ...c, molecule: id, lewis: lewisStateFor(id), vsepr: { ...c.vsepr, source: "molecule" } }));
  const lessons = useMemo(() => (ws.valid ? bondingLessons(ws.valid) : []), [ws.valid]);

  // ---- Lewis
  const state = { bondOrders: raw.lewis.bondOrders, lonePairs: raw.lewis.lonePairs };
  const report = useMemo(() => analyzeLewis(m, state), [m, raw.lewis.bondOrders, raw.lewis.lonePairs]); // eslint-disable-line react-hooks/exhaustive-deps
  const compare = useMemo(() => m.structures.map((s) => ({ s, r: analyzeLewis(m, structureToState(s)) })), [m]);
  const hybrid = useMemo(() => resonanceHybrid(m), [m]);
  const setBond = (k: number, order: number) => update((c) => ({ ...c, lewis: { ...c.lewis, structure: -1, bondOrders: c.lewis.bondOrders.map((b, i) => (i === k ? order : b)) } }));
  const setLp = (i: number, n: number) => update((c) => ({ ...c, lewis: { ...c.lewis, structure: -1, lonePairs: c.lewis.lonePairs.map((p, j) => (j === i ? n : p)) } }));
  const selectStructure = (k: number) => update((c) => ({ ...c, lewis: { bondOrders: [...m.structures[k].bondOrders], lonePairs: [...m.structures[k].lonePairs], structure: k } }));

  // ---- geometry
  const structIdx = Math.max(0, Math.min(m.structures.length - 1, raw.lewis.structure));
  const fromMol = view !== "geometry" || raw.vsepr.source === "molecule";
  const dom = fromMol ? centerDomains(m, structIdx) : { X: raw.vsepr.X, E: raw.vsepr.E };
  const geoOut = dom ? vseprGeometry(dom.X, dom.E) : null;
  const pol = useMemo(() => polarityOf(m, structIdx), [m, structIdx]);
  const centerEl = fromMol && m.center !== null ? m.atoms[m.center] : "A";
  const ligands = fromMol && m.center !== null ? m.atoms.filter((_, i) => i !== m.center) : Array.from({ length: dom?.X ?? 0 }, () => "X");
  const geoText = geoOut && geoOut.ok ? describeGeometry(geoOut.value, fromMol && m.center !== null ? `${m.name}'s central ${centerEl} atom` : "The central atom") : "";
  const showDip = view === "polarity" ? true : raw.geometry.showDipoles;

  // ---- polarity & hybrid
  const bp = bondPolarity(raw.polarity.a, raw.polarity.b);
  const hyb = useMemo(() => hybridization(m, structureToState(m.structures[structIdx])), [m, structIdx]);
  const hybKinds = [...new Set(hyb.map((h) => h.hybrid).filter((x): x is string => x === "sp" || x === "sp²" || x === "sp³"))];

  const GeometryBlock = (
    geoOut && geoOut.ok ? (
      <DiagramFrame caption={geoText} label="Molecular geometry" title={fromMol && m.center !== null ? `${m.formula}: ${geoOut.value.entry.molecularGeometry}` : `AX${dom?.X}E${dom?.E}: ${geoOut.value.entry.molecularGeometry}`}>
        <GeometryDiagram bonds={fromMol && pol ? pol.bonds : null} center={centerEl} description={geoText} geo={geoOut.value} ligands={ligands} net={fromMol && pol ? pol.net : null} onRotate={(azimuth, elevation) => setGeo({ azimuth, elevation })} view={{ ...raw.geometry, showDipoles: showDip && fromMol }} />
      </DiagramFrame>
    ) : null
  );

  return (
    <div className="gc-page ph-page">
      <ToolHeader
        group="Analyze"
        title="Bonding and geometry"
        purpose="Count valence electrons and place bonds and lone pairs, compare Lewis and resonance structures, see the 3-D shape that electron-domain repulsion predicts, test whether bond dipoles cancel, and read the hybridisation model."
        evidence="model"
        steps={[
          { label: "Pick a molecule", detail: "A curated set of 30 molecules and ions." },
          { label: "Place electrons, read the shape", detail: "Formal charges, domains, angles and dipoles follow." },
          { label: "Check the limits", detail: "Lewis, VSEPR and hybridisation are teaching models." },
        ]}
        aside={<Badge tone="neutral" title="Curated molecules only; ideal geometries; schematic dipoles.">teaching models</Badge>}
      />
      {ws.chrome}
      <div className="gc-toolbar">
        <LearningModeSwitch
          blurbs={{ explore: "Edit the structure, rotate the geometry and read the consequences.", practice: "Count electrons, assign formal charges, name shapes and decide polarity; then check.", challenge: "Predict the shape or polarity of a molecule before it is shown." }}
          mode={mode} modes={["explore", "practice", "challenge"]} onChange={(md) => setLearn({ mode: md })}
        />
        {ws.actions}
      </div>
      {ws.saveFormEl}

      <div className="gc-layout">
        <Panel className="gc-inputs" subtitle="Only the listed molecules are supported; nothing is inferred from a formula." title="Molecule">
          <Segmented<BondingView> label="What to work on" onChange={(v) => update((c) => ({ ...c, view: v }))} options={BONDING_VIEWS.map((v) => ({ id: v, label: BONDING_VIEW_LABEL[v] }))} value={view} />
          <SelectField label="Molecule or ion" onChange={setMolecule} options={MOL_OPTIONS} value={raw.molecule} hint={m.topic} />

          {view === "lewis" ? (
            <>
              {m.structures.length > 1 ? (
                <div className="gc-presets" role="group" aria-label="Curated structures">
                  {m.structures.map((s, k) => <button aria-pressed={raw.lewis.structure === k} className={raw.lewis.structure === k ? "secondary-button gc-chip is-on" : "secondary-button gc-chip"} key={s.id} onClick={() => selectStructure(k)} type="button">{s.kind === "resonance" ? "Contributor" : s.kind === "alternative" ? "Alternative" : "Structure"} {k + 1}</button>)}
                </div>
              ) : null}
              <fieldset className="chem-amount"><legend>Bonds (order)</legend>
                {m.bonds.map((b, k) => (
                  <SelectField key={k} label={`${m.atoms[b[0]]}${b[0] + 1} – ${m.atoms[b[1]]}${b[1] + 1}`} onChange={(v) => setBond(k, v)} options={[{ value: 1, label: "single" }, { value: 2, label: "double" }, { value: 3, label: "triple" }]} value={raw.lewis.bondOrders[k]} />
                ))}
              </fieldset>
              <fieldset className="chem-amount"><legend>Lone pairs on each atom</legend>
                {m.atoms.map((a, i) => <SelectField key={i} label={`${a}${i + 1}`} onChange={(v) => setLp(i, v)} options={rangeOf(0, 4).map((v) => ({ value: v, label: String(v) }))} value={raw.lewis.lonePairs[i]} />)}
              </fieldset>
              <button className="ghost-button" onClick={() => selectStructure(0)} type="button">Reset to the curated structure</button>
            </>
          ) : null}

          {view === "geometry" ? (
            <>
              <Segmented<"molecule" | "domains"> label="Geometry of" onChange={(source) => update((c) => ({ ...c, vsepr: { ...c.vsepr, source } }))} options={[{ id: "molecule", label: "The molecule above" }, { id: "domains", label: "Chosen domains" }]} value={raw.vsepr.source} />
              {raw.vsepr.source === "domains" ? (
                <>
                  <SelectField label="Bonded atoms" onChange={(X) => update((c) => ({ ...c, vsepr: { ...c.vsepr, X } }))} options={rangeOf(0, 8).map((v) => ({ value: v, label: String(v) }))} value={raw.vsepr.X} />
                  <SelectField label="Lone pairs on the central atom" onChange={(E) => update((c) => ({ ...c, vsepr: { ...c.vsepr, E } }))} options={rangeOf(0, 8).map((v) => ({ value: v, label: String(v) }))} value={raw.vsepr.E} />
                </>
              ) : null}
              <div className="gc-presets" role="group" aria-label="Viewpoints">
                {VIEW_PRESETS.map((p) => <button className="secondary-button gc-chip" key={p.label} onClick={() => setGeo({ azimuth: p.az, elevation: p.el })} type="button">{p.label}</button>)}
              </div>
              <RangeField label="Rotate about the vertical axis" max={180} min={-180} onChange={(azimuth) => setGeo({ azimuth })} unit="°" value={raw.geometry.azimuth} />
              <RangeField label="Tilt" max={90} min={-90} onChange={(elevation) => setGeo({ elevation })} unit="°" value={raw.geometry.elevation} />
              {([["showLonePairs", "Lone pairs"], ["showDomains", "Electron-domain outline"], ["showAngles", "Bond-angle labels"], ["showDipoles", "Bond dipoles"]] as const).map(([key, label]) => (
                <label className="gc-check" key={key}><input checked={raw.geometry[key]} onChange={(e) => setGeo({ [key]: e.target.checked })} type="checkbox" /> {label}</label>
              ))}
            </>
          ) : null}

          {view === "polarity" ? (
            <>
              <p className="gc-field-hint">Bond calculator: choose two elements.</p>
              <SelectField label="Element A" onChange={(a) => update((c) => ({ ...c, polarity: { ...c.polarity, a } }))} options={POLARITY_ELEMENTS.map((e) => ({ value: e, label: e }))} value={raw.polarity.a} />
              <SelectField label="Element B" onChange={(b) => update((c) => ({ ...c, polarity: { ...c.polarity, b } }))} options={POLARITY_ELEMENTS.map((e) => ({ value: e, label: e }))} value={raw.polarity.b} />
              <RangeField label="Rotate" max={180} min={-180} onChange={(azimuth) => setGeo({ azimuth })} unit="°" value={raw.geometry.azimuth} />
              <RangeField label="Tilt" max={90} min={-90} onChange={(elevation) => setGeo({ elevation })} unit="°" value={raw.geometry.elevation} />
            </>
          ) : null}
        </Panel>

        <div className="gc-stage">
          {view === "lewis" ? (
            <>
              <Callout tone={report.valid && report.conserved && report.chargeConsistent ? "ok" : "warn"} title={report.valid ? (report.conserved ? "Electron count conserved" : `Electron count is off by ${report.difference > 0 ? "+" : ""}${report.difference}`) : "Cannot analyse"}>
                <p data-testid="lewis-count">{m.formula} needs {report.totalValence} valence electrons ({m.atoms.map((a, i) => `${a}${i + 1}`).join(" + ") && `${m.atoms.reduce((s, a) => s + (report.atoms.find((x) => x.el === a)?.valence ?? 0), 0)} from the atoms`}{m.charge !== 0 ? `, ${m.charge > 0 ? "minus" : "plus"} ${Math.abs(m.charge)} for the charge` : ""}); your structure uses {report.counted} ({report.counted / 2} pairs).</p>
                <p data-testid="lewis-match">{report.matchedStructure ? `This matches curated structure “${m.structures.find((s) => s.id === report.matchedStructure)?.label}”.` : report.conserved ? "A valid electron count, but not one of the curated structures for this species. Check the octet and formal-charge details." : "Add or remove lone pairs or change bond orders until the count is conserved."}</p>
                {m.caution ? <p data-testid="lewis-caution">{m.caution}</p> : null}
              </Callout>
              <DiagramFrame caption="Formal charge FC = V − N − B/2 (valence electrons − nonbonding electrons − half the bonding electrons)." label="Lewis structure" title={`${m.name}: Lewis structure`}>
                <LewisDiagram mol={m} report={report} showCharges state={state} />
              </DiagramFrame>
              {report.valid ? (
                <Panel subtitle="One row per atom. The formal charges must sum to the charge of the species." title="Formal charges and octets">
                  <div className="gc-table-scroll">
                    <table className="gc-table ph-table" data-testid="fc-table">
                      <thead><tr><th scope="col">Atom</th><th scope="col">V</th><th scope="col">N (nonbonding)</th><th scope="col">B (bonding)</th><th scope="col">FC</th><th scope="col">Electrons around</th><th scope="col">Octet status</th></tr></thead>
                      <tbody>{report.atoms.map((a) => <tr key={a.index}><th scope="row">{a.el}{a.index + 1}</th><td>{a.valence}</td><td>{a.nonbonding}</td><td>{a.bonding}</td><td>{fcText(a.formalCharge)}</td><td>{a.electronsAround}</td><td>{a.statusNote}</td></tr>)}</tbody>
                    </table>
                  </div>
                  <p className="gc-field-hint" data-testid="fc-sum">Sum of formal charges {fcText(report.formalChargeSum)}; charge of the species {fcText(m.charge)}{report.chargeConsistent ? " (consistent)" : " (inconsistent: the structure does not use the right number of electrons)"}.</p>
                </Panel>
              ) : null}
              {m.structures.length > 1 ? (
                <Panel subtitle="Valid Lewis representations are compared by formal charge and octet status. None is 'the' structure." title="Comparing valid structures">
                  <div className="gc-table-scroll">
                    <table className="gc-table ph-table" data-testid="compare-table">
                      <thead><tr><th scope="col">Structure</th><th scope="col">Kind</th><th scope="col">Formal charges</th><th scope="col">Σ|FC|</th><th scope="col">Octet notes</th></tr></thead>
                      <tbody>{compare.map(({ s, r }, k) => <tr key={s.id}><th scope="row">{k + 1}. {s.label}</th><td>{s.kind}</td><td>{r.atoms.map((a) => `${a.el}${a.index + 1} ${fcText(a.formalCharge)}`).join(", ")}</td><td>{r.sumAbsFormalCharge}</td><td>{r.atoms.filter((a) => a.status !== "octet" && a.status !== "duet").map((a) => `${a.el}${a.index + 1}: ${a.electronsAround} e⁻`).join(", ") || "all octets"}</td></tr>)}</tbody>
                    </table>
                  </div>
                </Panel>
              ) : null}
              {hybrid ? (
                <Callout tone="info" title="Resonance hybrid (average over the contributors)">
                  <p data-testid="resonance-text">{hybrid.contributors.length} equivalent contributors: {hybrid.equivalent ? "same elements and formal charges, related by relabelling" : "not equivalent"}. Average bond orders: {m.bonds.map((b, k) => `${m.atoms[b[0]]}${b[0] + 1}–${m.atoms[b[1]]}${b[1] + 1} ${g(hybrid.averageBondOrders[k], 3)}`).join(", ")}. Average formal charges: {m.atoms.map((a, i) => `${a}${i + 1} ${g(hybrid.averageFormalCharge[i], 3)}`).join(", ")}.</p>
                  <p>The contributors are not real species and the molecule does not flip between them: the real structure has delocalised electrons that no single Lewis diagram shows.</p>
                </Callout>
              ) : null}
            </>
          ) : null}

          {view === "geometry" ? (
            <>
              {geoOut && geoOut.ok ? (
                <>
                  <Callout tone="info" title={`${geoOut.value.entry.domains} electron domains: ${geoOut.value.entry.domainGeometry}; molecular geometry: ${geoOut.value.entry.molecularGeometry}`}>
                    <p data-testid="geometry-text">{geoText}</p>
                    {fromMol && m.textbookAngle ? <p>Textbook measured {m.textbookAngle.atoms} angle: about {m.textbookAngle.deg}° (the ideal values above are reduced by lone-pair repulsion).</p> : null}
                  </Callout>
                  {GeometryBlock}
                  <KeyFigures items={[
                    { label: "Bonded atoms (X)", value: String(geoOut.value.entry.X) },
                    { label: "Lone pairs (E)", value: String(geoOut.value.entry.E) },
                    { label: "Electron domains", value: String(geoOut.value.entry.domains), note: "a double or triple bond is one domain" },
                    { label: "Electron-domain geometry", value: geoOut.value.entry.domainGeometry },
                    { label: "Molecular geometry", value: geoOut.value.entry.molecularGeometry },
                    { label: "Ideal bond angles", value: geoOut.value.angleClasses.map((a) => `${a.deg % 1 === 0 ? a.deg : a.deg.toFixed(1)}°`).join(", ") },
                  ]} />
                  <Panel subtitle="Counts of atom pairs at each ideal angle." title="Angles">
                    <ul className="gc-assumptions" data-testid="angle-list">{geoOut.value.angleClasses.map((a) => <li key={a.deg}>{a.deg % 1 === 0 ? a.deg : a.deg.toFixed(1)}°: {a.count} pair{a.count === 1 ? "" : "s"} of atoms</li>)}</ul>
                    <p className="gc-field-hint">{geoOut.value.entry.note}</p>
                  </Panel>
                </>
              ) : (
                <Callout tone="warn" title={dom ? "Not a supported geometry" : "No single central atom"}>
                  <p data-testid="geometry-error">{geoOut && !geoOut.ok ? geoOut.error : `${m.name} has more than one central atom, so there is no single VSEPR shape; see Hybridisation for each atom.`}</p>
                </Callout>
              )}
            </>
          ) : null}

          {view === "polarity" ? (
            <>
              {bp ? (
                <KeyFigures items={[
                  { label: `${bp.a} electronegativity`, value: String(bp.ena) }, { label: `${bp.b} electronegativity`, value: String(bp.enb) },
                  { label: "ΔEN", value: g(bp.delta, 3), note: `cut-offs ${POLARITY_CUTOFFS.nonpolar} and ${POLARITY_CUTOFFS.ionic} are conventions` },
                  { label: "Bond", value: bp.cls, note: bp.moreElectronegative ? `δ− on ${bp.moreElectronegative}` : "no difference" },
                ]} />
              ) : null}
              {pol ? (
                <>
                  <Callout tone={pol.cancels ? "ok" : "info"} title={`${m.formula}: ${pol.classification}`}>
                    <p data-testid="polarity-text">{pol.reason}</p>
                    <p>Schematic resultant {g(pol.netMagnitude, 3)} (ΔEN units; not a dipole moment in debye).</p>
                  </Callout>
                  {GeometryBlock}
                  <Panel subtitle="Each bond contributes a vector of length |ΔEN| pointing to the more electronegative atom." title="Bond dipoles">
                    <ul className="gc-assumptions" data-testid="bond-dipoles">{pol.bonds.map((b) => <li key={b.index}>{b.from} → {b.to}: ΔEN {g(b.delta, 3)}</li>)}</ul>
                    <p className="gc-field-hint">{pol.limitation}</p>
                  </Panel>
                </>
              ) : <Callout tone="warn" title="Not available for this molecule"><p>Schematic polarity is available for molecules with a single central atom. {m.name} has none, so only the bond calculator applies.</p></Callout>}
            </>
          ) : null}

          {view === "hybrid" ? (
            <>
              <Callout tone="info" title={`${m.formula}: ${hyb.filter((h) => h.hybrid).map((h) => `${h.el}${h.index + 1} ${h.hybrid}`).join(", ") || "no hybridised atom"}`}>
                <p data-testid="hybrid-text">Hybridisation is assigned from the number of electron domains of each atom in structure {structIdx + 1}. It is a bonding model, not something that can be observed, and it does not describe delocalised bonding or O₂ magnetism.</p>
              </Callout>
              {hybKinds.length ? hybKinds.map((k) => <DiagramFrame key={k} label={`${k} hybridisation`} title={`${k} hybrid orbitals`}><HybridDiagram type={k as "sp" | "sp²" | "sp³"} /></DiagramFrame>) : null}
              <Panel subtitle="σ bonds are end-on overlaps (one per bond); each extra bond order is a π bond from unhybridised p orbitals." title="Atoms, hybrids, σ and π bonds">
                <div className="gc-table-scroll">
                  <table className="gc-table ph-table" data-testid="hybrid-table">
                    <thead><tr><th scope="col">Atom</th><th scope="col">Domains</th><th scope="col">Hybrid</th><th scope="col">σ</th><th scope="col">π</th><th scope="col">Note</th></tr></thead>
                    <tbody>{hyb.map((h) => <tr key={h.index}><th scope="row">{h.el}{h.index + 1}</th><td>{h.stericNumber}</td><td>{h.hybrid ?? "—"}{h.level === "bookkeeping" ? " (label only)" : ""}</td><td>{h.sigma}</td><td>{h.pi}</td><td>{h.note}</td></tr>)}</tbody>
                  </table>
                </div>
              </Panel>
            </>
          ) : null}

          {mode === "practice" ? (
            <QuestionPanel current={raw} index={raw.learn.practice} onIndex={(practice) => setLearn({ practice })} onLoad={(next) => update(() => next)} questions={BONDING_PRACTICE} subtitle="Work it out, answer, then check. Answers come from the same model as the tool." title="Practice" />
          ) : mode === "challenge" ? (
            <QuestionPanel current={raw} index={raw.learn.challenge} onIndex={(challenge) => setLearn({ challenge })} onLoad={(next) => update(() => next)} questions={BONDING_CHALLENGE} subtitle="Predict the shape or polarity first; the model then shows the result." title="Challenge" />
          ) : lessons.length ? (
            <Panel subtitle="Each answer quotes the numbers for your current molecule." title="Why does it behave this way?">
              {lessons.map((l) => <Disclosure key={l.id} summary={l.title}><Paragraphs items={l.body} /></Disclosure>)}
            </Panel>
          ) : null}
        </div>
      </div>

      <EvidencePanel id="gc-lewis" />
      <EvidencePanel id="gc-vsepr" />
      <EvidencePanel id="gc-polarity" />
      <EvidencePanel id="gc-hybridization" />
      <Panel subtitle="What this tool does and does not model." title="Assumptions and limits">
        <ul className="gc-assumptions">{BONDING_ASSUMPTIONS.map((a) => <li key={a}>{a}</li>)}</ul>
      </Panel>
      <RelatedConcepts subject="general" toolId="gcBonding" />
    </div>
  );
}
