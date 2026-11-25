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
import { rangeOf } from "../../utils/generalChem/range28";
import { EnergyLevels, OrbitalBoxes, OrbitalSlice, SpectrumStrip } from "./AtomicDiagrams28";
import { useGcWorkspace } from "./useGcWorkspace";
import { formatSig } from "../../utils/generalChem/format";
import { checkQuantumNumbers, enumerateOrbitals, shellCapacity, shellOrbitalCount, subshellCapacity, subshellLabel, subshellLetter, subshellOrbitalCount } from "../../utils/generalChem/quantum28";
import {
  SUPPORTED_ORBITALS, angularNodes, describeOrbital, displayRadius, ionisationEnergyEV, radialProbability, seriesLines, seriesLimitNm, transition, wavelengthToRgb,
} from "../../utils/generalChem/hydrogenic28";
import { BUILD_SUBSHELLS, MAX_Z, aufbauConfiguration, checkBuild, configurationFor, elementName, elementSymbol, formatConfiguration, orbitalBoxes } from "../../utils/generalChem/config28";
import { ATOMIC_ASSUMPTIONS, ATOMIC_CHALLENGE, ATOMIC_PRACTICE, atomicLessons, summarizeAtomic } from "../../utils/generalChem/learning28";
import {
  ATOMIC_ENGINE_VERSION, ATOMIC_VIEWS, ATOMIC_VIEW_LABEL, DEFAULT_ATOMIC_INPUTS, SLICE_PLANES, describeAtomicAnalysis, validateAtomicInputs, validateGcResults28, type AtomicInputs, type AtomicView,
} from "../../utils/persistence/gcTools28";

type Props = { openRequest?: { id: string; recordId: string } | null; onOpenHandled?: (requestId: string) => void };
const g = (v: number, sig = 4) => formatSig(v, sig);
const ORBITAL_OPTIONS = SUPPORTED_ORBITALS.map((o) => ({ value: `${o.n}${o.l}`, label: subshellLabel(o.n, o.l) }));
const SPECTRA_PRESETS: Array<{ label: string; ni: number; nf: number; Z: number }> = [
  { label: "H-α (Balmer, 3 → 2)", ni: 3, nf: 2, Z: 1 }, { label: "Lyman-α (2 → 1)", ni: 2, nf: 1, Z: 1 }, { label: "Paschen-α (4 → 3)", ni: 4, nf: 3, Z: 1 }, { label: "Absorption 1 → 3", ni: 1, nf: 3, Z: 1 }, { label: "He⁺ 2 → 1", ni: 2, nf: 1, Z: 2 },
];
const SUPS = "⁰¹²³⁴⁵⁶⁷⁸⁹";
const chargeText = (q: number) => (q === 0 ? "neutral" : q > 0 ? `${q === 1 ? "" : q}+` : `${q === -1 ? "" : -q}−`);
const ionSymbol = (Z: number, q: number) => `${elementSymbol(Z)}${q === 0 ? "" : q > 0 ? `${q === 1 ? "" : SUPS[q]}⁺` : `${q === -1 ? "" : SUPS[-q]}⁻`}`;

export default function AtomicStructurePage({ openRequest = null, onOpenHandled }: Props) {
  const ws = useGcWorkspace<AtomicInputs>({
    page: "atomic", engineVersion: ATOMIC_ENGINE_VERSION, defaults: DEFAULT_ATOMIC_INPUTS, validateInputs: validateAtomicInputs, validateResults: validateGcResults28,
    summarize: summarizeAtomic, describe: describeAtomicAnalysis, fallbackName: "Atomic structure analysis", openRequest, onOpenHandled,
  });
  const { raw, update } = ws;
  const mode = raw.learn.mode; const view = raw.view;
  const setLearn = (patch: Partial<AtomicInputs["learn"]>) => update((c) => ({ ...c, learn: { ...c.learn, ...patch } }));
  const setQ = (patch: Partial<AtomicInputs["q"]>) => update((c) => ({ ...c, q: { ...c.q, ...patch } }));
  const setOrb = (patch: Partial<AtomicInputs["orbital"]>) => update((c) => ({ ...c, orbital: { ...c.orbital, ...patch } }));
  const setCfg = (patch: Partial<AtomicInputs["config"]>) => update((c) => ({ ...c, config: { ...c.config, ...patch } }));
  const setSp = (patch: Partial<AtomicInputs["spectra"]>) => update((c) => ({ ...c, spectra: { ...c.spectra, ...patch } }));
  const lessons = useMemo(() => (ws.valid ? atomicLessons(ws.valid) : []), [ws.valid]);

  // ---- quantum numbers
  const qc = checkQuantumNumbers(raw.q);
  const shellOrbs = useMemo(() => enumerateOrbitals(raw.q.n), [raw.q.n]);

  // ---- orbital
  const o = raw.orbital;
  const od = useMemo(() => describeOrbital(o.n, o.l, o.ml, o.basis, o.Z), [o.n, o.l, o.ml, o.basis, o.Z]);
  const ang = angularNodes(o.l, o.ml, o.basis);
  const radial = useMemo(() => {
    const R = displayRadius(o.n, o.Z); const pts = Array.from({ length: 241 }, (_, i) => { const r = (R * i) / 240; return { x: r, y: radialProbability(o.n, o.l, r, o.Z) }; });
    const ymax = Math.max(...pts.map((p) => p.y)) * 1.12;
    const series: ChartSeries[] = [{ id: "P", label: "r² R(r)²", color: "#0b6a72", points: pts }];
    const markers: ChartMarker[] = [
      ...od.nodeRadii.map((r, k) => ({ id: `n${k}`, x: r, y: 0, label: `radial node ${g(r, 3)} a₀`, kind: "info" as const })),
      ...od.peaks.map((r, k) => ({ id: `p${k}`, x: r, y: radialProbability(o.n, o.l, r, o.Z), label: `maximum ${g(r, 3)} a₀`, kind: "half" as const })),
    ];
    return { series, markers, R, ymax };
  }, [o.n, o.l, o.Z, od.nodeRadii, od.peaks]);
  const orbitalText = `${od.label}${od.realName ? ` (${od.realName})` : ""} orbital, ${o.basis} basis, Z = ${o.Z}. ${od.radialNodes} radial node${od.radialNodes === 1 ? "" : "s"}${od.nodeRadii.length ? ` at ${od.nodeRadii.map((r) => g(r, 3)).join(" and ")} bohr radii` : ""} and ${ang.total} angular node${ang.total === 1 ? "" : "s"}. Mean radius ${g(od.meanRadius)} bohr radii. Slice plane ${o.plane}, showing ${o.mode === "density" ? "probability density" : "signed wavefunction amplitude"}.`;

  // ---- configuration
  const cfg = useMemo(() => configurationFor(raw.config.Z, raw.config.charge), [raw.config.Z, raw.config.charge]);
  const boxes = useMemo(() => (cfg.ok ? orbitalBoxes(cfg.value.occupation) : []), [cfg]);
  const build = raw.config.build ?? BUILD_SUBSHELLS.map(() => 0);
  const buildCheck = useMemo(() => (raw.config.build ? checkBuild(raw.config.Z, raw.config.charge, raw.config.build) : null), [raw.config]);
  const buildBoxes = useMemo(() => orbitalBoxes(BUILD_SUBSHELLS.map((s, i) => ({ n: s.n, l: s.l, count: build[i] })).filter((x) => x.count > 0).sort((a, b) => a.n - b.n || a.l - b.l)), [build]);
  const setBuild = (i: number, delta: number) => update((c) => {
    const cur = (c.config.build ?? BUILD_SUBSHELLS.map(() => 0)).slice();
    cur[i] = Math.max(0, Math.min(subshellCapacity(BUILD_SUBSHELLS[i].l), cur[i] + delta));
    return { ...c, config: { ...c.config, build: cur } };
  });
  const fillAufbau = () => update((c) => { const occ = aufbauConfiguration(c.config.Z - c.config.charge); return { ...c, config: { ...c.config, build: BUILD_SUBSHELLS.map((s) => occ.find((x) => x.n === s.n && x.l === s.l)?.count ?? 0) } }; });

  // ---- spectra
  const sp = raw.spectra;
  const tr = useMemo(() => transition(sp.ni, sp.nf, sp.Z), [sp.ni, sp.nf, sp.Z]);
  const lines = useMemo(() => (tr.ok ? seriesLines(tr.value.lowerLevel, sp.Z) : []), [tr, sp.Z]);
  const rgb = tr.ok ? wavelengthToRgb(tr.value.wavelengthNm) : null;

  return (
    <div className="gc-page ph-page">
      <ToolHeader
        group="Analyze"
        title="Atomic structure"
        purpose="Explore the quantum numbers that label electrons in atoms, the exact orbitals of one-electron atoms, ground-state electron configurations, and the light an atom emits or absorbs."
        evidence="model"
        steps={[
          { label: "Pick a view", detail: "Quantum numbers, orbitals, configurations or spectra." },
          { label: "Change the quantum numbers or the atom", detail: "Orbitals, nodes and photons follow from the model." },
          { label: "Check the assumptions", detail: "The hydrogenic model is exact only for one electron." },
        ]}
        aside={<Badge tone="neutral" title="Closed-form hydrogenic wavefunctions; NIST configurations; ideal one-electron spectra.">exact for one electron</Badge>}
      />
      {ws.chrome}
      <div className="gc-toolbar">
        <LearningModeSwitch
          blurbs={{ explore: "Change the quantum numbers, orbital, atom or transition and read what follows.", practice: "Answer questions about quantum numbers, nodes, configurations and photons; the model then shows the working.", challenge: "Predict an outcome before it is shown." }}
          mode={mode} modes={["explore", "practice", "challenge"]} onChange={(m) => setLearn({ mode: m })}
        />
        {ws.actions}
      </div>
      {ws.saveFormEl}

      <div className="gc-layout">
        <Panel className="gc-inputs" subtitle="Atomic units: lengths in bohr radii a₀." title="Atom and orbital">
          <Segmented<AtomicView> label="What to work on" onChange={(v) => update((c) => ({ ...c, view: v }))} options={ATOMIC_VIEWS.map((v) => ({ id: v, label: ATOMIC_VIEW_LABEL[v] }))} value={view} />

          {view === "quantum" ? (
            <>
              <SelectField label="Principal quantum number n" onChange={(n) => setQ({ n })} options={rangeOf(1, 7).map((v) => ({ value: v, label: String(v) }))} value={raw.q.n} />
              <SelectField label="Angular momentum quantum number l" onChange={(l) => setQ({ l })} options={rangeOf(0, 6).map((v) => ({ value: v, label: `${v} (${subshellLetter(v)})` }))} value={raw.q.l} />
              <SelectField label="Magnetic quantum number m_l" onChange={(m) => setQ({ ml: m })} options={rangeOf(-6, 6).map((v) => ({ value: v, label: String(v) }))} value={raw.q.ml} />
              <SelectField label="Spin projection m_s" onChange={(s) => setQ({ ms: s as 1 | -1 })} options={[{ value: 1, label: "+1/2 (spin up)" }, { value: -1, label: "−1/2 (spin down)" }]} value={raw.q.ms} />
              <p className="gc-field-hint">Invalid combinations are allowed here on purpose, so the model can say which rule they break.</p>
            </>
          ) : null}

          {view === "orbital" ? (
            <>
              <SelectField label="Orbital" onChange={(v) => { const n = Number(v[0]); const l = Number(v[1]); setOrb({ n, l, ml: Math.max(-l, Math.min(l, o.ml)) }); }} options={ORBITAL_OPTIONS} value={`${o.n}${o.l}`} />
              <SelectField label="Magnetic quantum number m_l" onChange={(m) => setOrb({ ml: m })} options={rangeOf(-o.l, o.l).map((v) => ({ value: v, label: String(v) }))} value={o.ml} />
              <Segmented<"real" | "complex"> label="Basis" onChange={(basis) => setOrb({ basis })} options={[{ id: "real", label: "Real (p_x, d_xy …)" }, { id: "complex", label: "Complex (m_l)" }]} value={o.basis} />
              <Segmented<"density" | "amplitude"> label="Show" onChange={(m) => setOrb({ mode: m })} options={[{ id: "density", label: "Probability density |ψ|²" }, { id: "amplitude", label: "Wavefunction sign ψ" }]} value={o.mode} />
              <SelectField label="Slice plane (viewpoint)" onChange={(plane) => setOrb({ plane })} options={SLICE_PLANES.map((p) => ({ value: p, label: `${p} plane` }))} value={o.plane} />
              <RangeField label="Probability inside the outline" max={99} min={50} onChange={(enclosurePct) => setOrb({ enclosurePct })} unit=" %" value={o.enclosurePct} />
              <SelectField label="Nuclear charge Z" onChange={(Z) => setOrb({ Z })} options={rangeOf(1, 4).map((v) => ({ value: v, label: `${v}${v === 1 ? " (H)" : v === 2 ? " (He⁺)" : v === 3 ? " (Li²⁺)" : " (Be³⁺)"}` }))} value={o.Z} />
            </>
          ) : null}

          {view === "config" ? (
            <>
              <SelectField label="Element" onChange={(Z) => setCfg({ Z, build: null })} options={rangeOf(1, MAX_Z).map((Z) => ({ value: Z, label: `${Z} ${elementSymbol(Z)} ${elementName(Z)}` }))} value={raw.config.Z} />
              <SelectField label="Charge" onChange={(charge) => setCfg({ charge, build: null })} options={rangeOf(-3, 8).map((v) => ({ value: v, label: v === 0 ? "0 (neutral atom)" : v > 0 ? `+${v}` : `−${-v}` }))} value={raw.config.charge} />
              <div className="gc-presets" role="group" aria-label="Examples">
                {[{ l: "Cr", Z: 24, q: 0 }, { l: "Cu", Z: 29, q: 0 }, { l: "Fe³⁺", Z: 26, q: 3 }, { l: "Cu²⁺", Z: 29, q: 2 }, { l: "O²⁻", Z: 8, q: -2 }, { l: "Ni⁺", Z: 28, q: 1 }].map((p) => (
                  <button className="secondary-button gc-chip" key={p.l} onClick={() => setCfg({ Z: p.Z, charge: p.q, build: null })} type="button">{p.l}</button>
                ))}
              </div>
            </>
          ) : null}

          {view === "spectra" ? (
            <>
              <SelectField label="One-electron species" onChange={(Z) => setSp({ Z })} options={rangeOf(1, 4).map((v) => ({ value: v, label: `Z = ${v} ${["H", "He⁺", "Li²⁺", "Be³⁺"][v - 1]}` }))} value={sp.Z} />
              <SelectField label="Initial level n" onChange={(ni) => setSp({ ni })} options={rangeOf(1, 10).map((v) => ({ value: v, label: String(v) }))} value={sp.ni} />
              <SelectField label="Final level n" onChange={(nf) => setSp({ nf })} options={rangeOf(1, 10).map((v) => ({ value: v, label: String(v) }))} value={sp.nf} />
              <button className="ghost-button" onClick={() => setSp({ ni: sp.nf, nf: sp.ni })} type="button">Swap initial and final</button>
              <div className="gc-presets" role="group" aria-label="Example transitions">
                {SPECTRA_PRESETS.map((p) => <button className="secondary-button gc-chip" key={p.label} onClick={() => setSp({ ni: p.ni, nf: p.nf, Z: p.Z })} type="button">{p.label}</button>)}
              </div>
              {!tr.ok ? <Callout tone="danger" title="No transition"><p>{tr.error}</p></Callout> : null}
            </>
          ) : null}
        </Panel>

        <div className="gc-stage">
          {view === "quantum" ? (
            <>
              <Callout tone={qc.ok ? "ok" : "danger"} title={qc.ok ? `n = ${raw.q.n}, l = ${raw.q.l}, m_l = ${raw.q.ml}, m_s = ${raw.q.ms > 0 ? "+" : "−"}1/2 is an allowed electron state` : "These quantum numbers are not allowed"}>
                {qc.ok ? <p data-testid="qn-result">This is one of {shellCapacity(raw.q.n)} states in shell n = {raw.q.n}. It names the {subshellLabel(raw.q.n, raw.q.l)} subshell (orbital {raw.q.ml} of {subshellOrbitalCount(raw.q.l)}) with spin {raw.q.ms > 0 ? "up" : "down"}.</p> : <ul data-testid="qn-result">{qc.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
              </Callout>
              <KeyFigures items={[
                { label: "Shell n", value: String(raw.q.n), note: `${raw.q.n} subshell${raw.q.n === 1 ? "" : "s"}` },
                { label: "Orbitals in the shell", value: String(shellOrbitalCount(raw.q.n)), note: "n²" },
                { label: "Electrons in the shell", value: String(shellCapacity(raw.q.n)), note: "2n²" },
                { label: `Subshell ${subshellLabel(raw.q.n, Math.min(raw.q.l, raw.q.n - 1))}`, value: `${subshellOrbitalCount(Math.min(raw.q.l, raw.q.n - 1))} orbitals`, note: `${subshellCapacity(Math.min(raw.q.l, raw.q.n - 1))} electrons` },
              ]} />
              <Panel subtitle="Every orbital of the shell: a spatial function. Each holds two electron states that differ only in m_s." title={`Orbitals of shell n = ${raw.q.n}`}>
                <div className="gc-table-scroll">
                  <table className="gc-table ph-table" data-testid="orbital-table">
                    <thead><tr><th scope="col">Subshell</th><th scope="col">l</th><th scope="col">m_l values (orbitals)</th><th scope="col">Electrons</th></tr></thead>
                    <tbody>
                      {Array.from({ length: raw.q.n }, (_, l) => (
                        <tr key={l} className={l === raw.q.l ? "is-selected" : undefined}>
                          <th scope="row">{subshellLabel(raw.q.n, l)}</th><td>{l}</td>
                          <td>{shellOrbs.filter((x) => x.l === l).map((x) => (x.ml === raw.q.ml && x.l === raw.q.l ? <strong key={x.ml}>[{x.ml}] </strong> : <span key={x.ml}>{x.ml} </span>))}</td>
                          <td>{subshellCapacity(l)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="gc-field-hint">Orbitals and states are different things: the table lists {shellOrbitalCount(raw.q.n)} orbitals; with spin there are {shellCapacity(raw.q.n)} electron states. An orbital is a probability amplitude, not an orbit.</p>
              </Panel>
            </>
          ) : null}

          {view === "orbital" ? (
            <>
              <Callout tone="info" title={`${od.label}${od.realName ? ` (${od.realName})` : ""}: ${od.radialNodes} radial and ${ang.total} angular node${ang.total === 1 ? "" : "s"}`}>
                <p data-testid="orbital-summary">{ang.note} The colours show {o.mode === "density" ? "|ψ|², the probability per unit volume" : "the SIGN of ψ (two phases), which is a property of the mathematical function and not an electric charge"}.</p>
              </Callout>
              <DiagramFrame caption={orbitalText} label="Orbital slice" title={`${od.label} orbital: slice in the ${o.plane} plane`}>
                <OrbitalSlice Z={o.Z} basis={o.basis} description={orbitalText} enclosurePct={o.enclosurePct} l={o.l} ml={o.ml} mode={o.mode} n={o.n} plane={o.plane} />
              </DiagramFrame>
              <KeyFigures items={[
                { label: "Radial nodes", value: String(od.radialNodes), note: "n − l − 1" },
                { label: "Angular nodes", value: String(ang.total), note: o.basis === "real" ? "l (real basis)" : "complex basis" },
                { label: "Mean radius ⟨r⟩", value: `${g(od.meanRadius)} a₀`, note: o.Z > 1 ? `scales as 1/Z (Z = ${o.Z})` : "(3n² − l(l+1))/2" },
                { label: "Radial node radii", value: od.nodeRadii.length ? od.nodeRadii.map((r) => `${g(r, 3)} a₀`).join(", ") : "none" },
                { label: "Most probable radii", value: od.peaks.map((r) => `${g(r, 3)} a₀`).join(", ") },
              ]} />
              <DiagramFrame caption="Probability per unit radius (summed over all directions). It is zero at the nucleus because of the r² factor, so the most probable distance is not where the density is highest." label="Radial probability distribution" title="Radial probability distribution r²R(r)²">
                <LineChart
                  formatX={(x) => g(x, 3)} formatY={(y) => g(y, 3)} markers={radial.markers} series={radial.series} title="Radial probability distribution"
                  valueText={`${od.label} radial distribution with ${od.radialNodes} node${od.radialNodes === 1 ? "" : "s"}`} xDomain={[0, radial.R]} xLabel="Distance from the nucleus r (a₀)" yDomain={[0, radial.ymax]} yLabel="r² R(r)² (per a₀)"
                />
              </DiagramFrame>
              {o.basis === "real" ? <Callout tone="info" title="Basis choice"><p>Real orbitals such as p_x and d_xy are equal-weight combinations of the +m_l and −m_l complex functions. This tool maps m_l = +1 to p_x or d_xz, −1 to p_y or d_yz, +2 to d_x²−y², −2 to d_xy. They are a convenient basis for drawing shapes, not eigenstates of L_z.</p></Callout> : null}
              <p className="sr-only" data-testid="orbital-text">{orbitalText}</p>
            </>
          ) : null}

          {view === "config" ? (
            cfg.ok ? (
              <>
                <Callout tone="info" title={`${ionSymbol(raw.config.Z, raw.config.charge)} (${elementName(raw.config.Z)}, ${chargeText(raw.config.charge)}): ${formatConfiguration(cfg.value.occupation, { noble: true, neutral: raw.config.charge === 0 })}`}>
                  <p data-testid="cfg-text">{formatConfiguration(cfg.value.occupation, { neutral: raw.config.charge === 0 })}, {cfg.value.electrons} electron{cfg.value.electrons === 1 ? "" : "s"}, {cfg.value.unpaired} unpaired</p>
                  <p>
                    <Badge tone={cfg.value.status === "reference-atom" ? "ok" : "estimate"}>{cfg.value.status === "reference-atom" ? "Curated reference data (NIST)" : cfg.value.status === "removal-rule" ? "Model rule: remove highest n first" : "Model rule: add in Aufbau order"}</Badge>{" "}
                    {cfg.value.isException ? <Badge tone="warn">Exception to the simple Aufbau order</Badge> : null}
                  </p>
                  {cfg.value.gasPhaseNote ? <p data-testid="gas-phase-note">{cfg.value.gasPhaseNote}</p> : null}
                </Callout>
                {cfg.value.isException || raw.config.charge === 0 ? (
                  <div className="chem-vs">
                    <div className="chem-vs-card"><h4>Observed ground state</h4><p>{formatConfiguration(cfg.value.occupation, { noble: true, neutral: true })}</p></div>
                    <div className="chem-vs-card"><h4>Simple Aufbau (Madelung) order</h4><p data-testid="aufbau-text">{formatConfiguration(cfg.value.aufbau, { noble: true, neutral: raw.config.charge === 0 })}{cfg.value.isException ? " — differs from what is observed" : " — agrees with what is observed"}</p></div>
                  </div>
                ) : null}
                <DiagramFrame caption="Each box is one orbital. Electrons fill the boxes of a subshell one at a time with parallel spins (Hund's rule) before pairing; a box holds at most two electrons of opposite spin (Pauli)." label="Orbital boxes" title="Orbital box diagram">
                  <OrbitalBoxes label={`${ionSymbol(raw.config.Z, raw.config.charge)} configuration`} subshells={boxes} />
                </DiagramFrame>
                <KeyFigures items={[
                  { label: "Electrons", value: String(cfg.value.electrons), note: `Z = ${raw.config.Z}, charge ${raw.config.charge}` },
                  { label: "Unpaired electrons", value: String(cfg.value.unpaired), note: cfg.value.unpaired > 0 ? "paramagnetic as an isolated atom or ion" : "all paired" },
                  { label: "Noble-gas notation", value: formatConfiguration(cfg.value.occupation, { noble: true, neutral: raw.config.charge === 0 }) },
                ]} />
                <Panel subtitle="Place the electrons yourself. The checks report Pauli limits, the electron count and whether you reproduced the ground state." title="Build the configuration">
                  <div className="chem-build" role="group" aria-label="Electrons per subshell">
                    {BUILD_SUBSHELLS.map((s, i) => (
                      <div className="chem-build-row" key={`${s.n}${s.l}`}>
                        <span>{subshellLabel(s.n, s.l)} <small>(max {subshellCapacity(s.l)})</small></span>
                        <button aria-label={`Remove an electron from ${subshellLabel(s.n, s.l)}`} className="secondary-button" onClick={() => setBuild(i, -1)} type="button">−</button>
                        <output aria-label={`${subshellLabel(s.n, s.l)} electrons`} data-testid={`build-${subshellLabel(s.n, s.l)}`}>{build[i]}</output>
                        <button aria-label={`Add an electron to ${subshellLabel(s.n, s.l)}`} className="secondary-button" onClick={() => setBuild(i, 1)} type="button">+</button>
                      </div>
                    ))}
                  </div>
                  <div className="gc-toolbar-actions">
                    <button className="secondary-button" onClick={fillAufbau} type="button">Fill by the Aufbau order</button>
                    <button className="ghost-button" onClick={() => setCfg({ build: null })} type="button">Clear</button>
                  </div>
                  {buildCheck ? (
                    <Callout tone={buildCheck.cls === "matches-model" ? "ok" : buildCheck.cls === "matches-aufbau-only" || buildCheck.cls === "valid-other" ? "warn" : "danger"} title={buildCheck.cls === "matches-model" ? "Matches" : buildCheck.cls === "matches-aufbau-only" ? "Aufbau, but not what is observed" : buildCheck.cls === "valid-other" ? "Valid, but not the ground state" : buildCheck.cls === "wrong-count" ? "Wrong number of electrons" : "Pauli limit exceeded"}>
                      <p data-testid="build-result">{buildCheck.messages.join(" ")}</p>
                    </Callout>
                  ) : <p className="gc-field-hint">Use + and − to place electrons; the result appears here.</p>}
                  {buildBoxes.length ? <OrbitalBoxes label="Your configuration" subshells={buildBoxes} /> : null}
                </Panel>
              </>
            ) : <Callout tone="danger" title="Not supported"><p data-testid="cfg-error">{cfg.error}</p></Callout>
          ) : null}

          {view === "spectra" && tr.ok ? (
            <>
              <Callout tone="info" title={`${tr.value.kind === "emission" ? "Emission" : "Absorption"} n = ${tr.value.ni} → ${tr.value.nf}: λ = ${g(tr.value.wavelengthNm)} nm (${tr.value.region})`}>
                <p data-testid="photon-summary">ΔE = |E({tr.value.nf}) − E({tr.value.ni})| = {g(tr.value.photonEV)} eV, f = ΔE/h = {g(tr.value.frequencyHz)} Hz, λ = hc/ΔE = {g(tr.value.wavelengthNm)} nm.{tr.value.series ? ` A line of the ${tr.value.series} series.` : ""}</p>
                {rgb ? <p><span aria-hidden="true" className="chem-swatch" style={{ background: `rgb(${rgb[0]},${rgb[1]},${rgb[2]})` }} /> approximate screen colour of this visible photon</p> : null}
              </Callout>
              <DiagramFrame caption="Heights are true energies of the ideal one-electron model. The arrow points up for absorption and down for emission; the wavy line is the photon." label="Energy levels" title="Energy levels and the transition">
                <EnergyLevels Z={sp.Z} t={tr.value} />
              </DiagramFrame>
              <KeyFigures items={[
                { label: "Photon energy", value: `${g(tr.value.photonEV)} eV`, note: `${g(tr.value.photonJ)} J` },
                { label: "Frequency", value: `${g(tr.value.frequencyHz)} Hz`, note: "f = E/h" },
                { label: "Wavelength", value: `${g(tr.value.wavelengthNm)} nm`, note: "λ = hc/E" },
                { label: "Region", value: tr.value.region, note: "visible = 380–750 nm" },
                { label: "Ionisation energy", value: `${g(ionisationEnergyEV(sp.Z))} eV`, note: "from n = 1" },
              ]} />
              <DiagramFrame caption={`The series ending on n = ${tr.value.lowerLevel} (lines up to n = 10); its limit is ${g(seriesLimitNm(tr.value.lowerLevel, sp.Z))} nm.`} label="Spectral series" title="Lines of the same series">
                <SpectrumStrip lines={lines} selected={tr.value} />
              </DiagramFrame>
            </>
          ) : null}

          {mode === "practice" ? (
            <QuestionPanel current={raw} index={raw.learn.practice} onIndex={(practice) => setLearn({ practice })} onLoad={(next) => update(() => next)} questions={ATOMIC_PRACTICE} subtitle="Work it out, answer, then check. The answer comes from the same model as the tool." title="Practice" />
          ) : mode === "challenge" ? (
            <QuestionPanel current={raw} index={raw.learn.challenge} onIndex={(challenge) => setLearn({ challenge })} onLoad={(next) => update(() => next)} questions={ATOMIC_CHALLENGE} subtitle="Predict first; the model then shows the result." title="Challenge" />
          ) : lessons.length ? (
            <Panel subtitle="Each answer quotes the numbers for your current setup." title="Why does it behave this way?">
              {lessons.map((l) => <Disclosure key={l.id} summary={l.title}><Paragraphs items={l.body} /></Disclosure>)}
            </Panel>
          ) : null}
        </div>
      </div>

      <EvidencePanel id="gc-quantum-orbitals" />
      <EvidencePanel id="gc-config-atoms" />
      <EvidencePanel id="gc-config-ions" />
      <EvidencePanel id="gc-hydrogen-spectra" />
      <Panel subtitle="What this tool does and does not model." title="Assumptions and limits">
        <ul className="gc-assumptions">{ATOMIC_ASSUMPTIONS.map((a) => <li key={a}>{a}</li>)}</ul>
      </Panel>
      <RelatedConcepts subject="general" toolId="gcAtomic" />
    </div>
  );
}
