import { useMemo, useState } from "react";
import { RelatedConcepts } from "../ui/RelatedConcepts";
import "../../styles/generalChem.css";
import "../../styles/physics.css";
import { LearningModeSwitch, type LearningMode } from "../ui/LearningModeSwitch";
import { Badge, Callout, DiagramFrame, Disclosure, KeyFigures, Legend, Panel, Segmented, ToolHeader } from "../ui/primitives";
import { GcPredictPanel, NumberField, Paragraphs } from "../generalChem/shared";
import { useGcWorkspace } from "../generalChem/useGcWorkspace";
import { fmt } from "../../utils/physics/format";
import { OPTICS_LIMITS, solveImaging, solveRefraction, validateImaging, validateRefraction, type Element } from "../../utils/physics/optics";
import { OPTICS_ASSUMPTIONS, summarizeOptics } from "../../utils/physics/physicsSummary";
import { OPTICS_CHALLENGES, opticsLessons, opticsScenarios } from "../../utils/physics/waveOpticsLearning";
import {
  DEFAULT_OPTICS_INPUTS, describeOpticsAnalysis, OPTICS_ENGINE_VERSION, validateOpticsInputs, validatePhysicsResults, type OpticsInputs, type OpticsView,
} from "../../utils/persistence/physicsTools";
import { ChallengePanel } from "./ChallengePanel";
import { ParamSlider } from "./sim";
import { ImagingDiagram, RefractionDiagram } from "./OpticsDiagrams";

type Props = { openRequest?: { id: string; recordId: string } | null; onOpenHandled?: (requestId: string) => void };

const IMAGING_PRESETS: Array<{ label: string; imaging: Partial<OpticsInputs["imaging"]> }> = [
  { label: "Camera-like: object far away", imaging: { element: "lens", f: 10, s: 60, h: 3 } },
  { label: "Projector: between f and 2f", imaging: { element: "lens", f: 10, s: 15, h: 3 } },
  { label: "Magnifying glass: inside f", imaging: { element: "lens", f: 10, s: 6, h: 3 } },
  { label: "Diverging lens", imaging: { element: "lens", f: -12, s: 30, h: 3 } },
  { label: "Shaving mirror (concave)", imaging: { element: "mirror", f: 20, s: 8, h: 3 } },
  { label: "Car mirror (convex)", imaging: { element: "mirror", f: -15, s: 40, h: 3 } },
];
const REFRACTION_PRESETS: Array<{ label: string; refraction: OpticsInputs["refraction"] }> = [
  { label: "Air into glass", refraction: { n1: 1, n2: 1.5, theta1: 40 } },
  { label: "Air into water", refraction: { n1: 1, n2: 1.33, theta1: 50 } },
  { label: "Water into air", refraction: { n1: 1.33, n2: 1, theta1: 35 } },
  { label: "Glass into air: total internal reflection", refraction: { n1: 1.5, n2: 1, theta1: 55 } },
  { label: "Diamond into air, just below critical", refraction: { n1: 2.42, n2: 1, theta1: 23 } },
];
const REGION_LABEL = { "beyond-2f": "beyond 2f", "at-2f": "at 2f", "between-f-and-2f": "between f and 2f", "at-f": "at f", "inside-f": "inside f", diverging: "any distance (diverging)" } as const;

export default function OpticsPage({ openRequest = null, onOpenHandled }: Props) {
  const ws = useGcWorkspace<OpticsInputs>({
    page: "optics",
    engineVersion: OPTICS_ENGINE_VERSION,
    defaults: DEFAULT_OPTICS_INPUTS,
    validateInputs: validateOpticsInputs,
    validateResults: validatePhysicsResults,
    summarize: summarizeOptics,
    describe: describeOpticsAnalysis,
    fallbackName: "Optics analysis",
    openRequest,
    onOpenHandled,
  });
  const { raw, update } = ws;
  const [mode, setMode] = useState<LearningMode>("explore");
  const view = raw.view;
  const setImg = (p: Partial<OpticsInputs["imaging"]>) => update((c) => ({ ...c, imaging: { ...c.imaging, ...p } }));
  const setRef = (p: Partial<OpticsInputs["refraction"]>) => update((c) => ({ ...c, refraction: { ...c.refraction, ...p } }));
  const imgCheck = useMemo(() => validateImaging(raw.imaging), [raw.imaging]);
  const refCheck = useMemo(() => validateRefraction(raw.refraction), [raw.refraction]);
  const check = view === "imaging" ? imgCheck : refCheck;
  const errors = check.ok ? null : check.errors;
  const errorFor = (needle: RegExp) => errors?.find((e) => needle.test(e)) ?? null;
  const img = imgCheck.ok ? solveImaging(imgCheck.value) : null;
  const ref = refCheck.ok ? solveRefraction(refCheck.value) : null;
  const practice = mode === "practice";
  const challenge = mode === "challenge";
  const practiceInput = ws.valid;
  const scenarios = useMemo(() => (practiceInput ? opticsScenarios(practiceInput) : []), [practiceInput]);
  const lessons = useMemo(() => (ws.valid ? opticsLessons(ws.valid) : []), [ws.valid]);
  const g = raw.imaging;
  const kind = g.element === "lens" ? (g.f > 0 ? "converging lens" : "diverging lens") : g.f > 0 ? "concave mirror" : "convex mirror";
  const table = useMemo(() => {
    if (!imgCheck.ok) return [];
    const f = imgCheck.value.f;
    const base = imgCheck.value;
    const rows = f > 0
      ? [{ at: "beyond-2f" as const, s: 3 * f }, { at: "at-2f" as const, s: 2 * f }, { at: "between-f-and-2f" as const, s: 1.5 * f }, { at: "at-f" as const, s: f }, { at: "inside-f" as const, s: 0.5 * f }]
      : [{ at: "diverging" as const, s: 2 * Math.abs(f) }];
    return rows.map((r) => ({ ...r, res: solveImaging({ ...base, s: r.s }) }));
  }, [imgCheck]);

  return (
    <div className="gc-page ph-page">
      <ToolHeader
        group="Waves & optics"
        title="Geometric optics"
        purpose="Place an object in front of a lens or mirror, drag it, and watch the principal rays form the image; then see how light bends at a boundary and when it cannot get out."
        evidence="model"
        steps={[
          { label: "Choose an element", detail: "Converging or diverging lens, concave or convex mirror, or a boundary between two media." },
          { label: "Move the object", detail: "Drag it in the diagram or use the sliders." },
          { label: "Read the image", detail: "Real or virtual, upright or inverted, larger or smaller." },
        ]}
        aside={<Badge tone="neutral" title="Thin elements, paraxial rays.">thin-element model</Badge>}
      />
      {ws.chrome}
      <div className="gc-toolbar">
        <LearningModeSwitch blurbs={{ practice: "Predict what a change does, then check it against the model.", challenge: "Reach a stated target setup; the model checks it." }} mode={mode} modes={["explore", "practice", "challenge"]} onChange={setMode} />
        {ws.actions}
      </div>
      {ws.saveFormEl}

      <div className="gc-layout">
        <Panel className="gc-inputs" subtitle="Lengths in centimetres." title="Settings">
          <Segmented<OpticsView> label="View" onChange={(v) => update((c) => ({ ...c, view: v }))} options={[{ id: "imaging", label: "Lenses and mirrors" }, { id: "refraction", label: "Refraction at a boundary" }]} value={view} />
          {view === "imaging" ? (
            <>
              <div className="gc-presets" role="group" aria-label="Example setups">
                {IMAGING_PRESETS.map((p) => <button className="secondary-button gc-chip" key={p.label} onClick={() => setImg(p.imaging)} type="button">{p.label}</button>)}
              </div>
              <Segmented<Element> label="Element" onChange={(element) => setImg({ element })} options={[{ id: "lens", label: "Lens" }, { id: "mirror", label: "Mirror" }]} value={g.element} />
              <Segmented<"+" | "-"> label="Type" onChange={(sg) => setImg({ f: sg === "+" ? Math.abs(g.f) : -Math.abs(g.f) })} options={[{ id: "+", label: g.element === "lens" ? "Converging (f > 0)" : "Concave (f > 0)" }, { id: "-", label: g.element === "lens" ? "Diverging (f < 0)" : "Convex (f < 0)" }]} value={g.f >= 0 ? "+" : "-"} />
              <ParamSlider format={(v) => `${fmt(v)} cm`} label="Focal length size |f|" max={50} min={OPTICS_LIMITS.minF} onChange={(a) => setImg({ f: (g.f >= 0 ? 1 : -1) * a })} step={0.5} value={Math.abs(g.f)} />
              <NumberField error={errorFor(/Focal length/)} label="Focal length f (signed)" onChange={(f) => setImg({ f })} unit="cm" value={g.f} />
              <ParamSlider format={(v) => `${fmt(v)} cm`} label="Object distance" max={120} min={1} onChange={(s) => setImg({ s })} step={0.5} value={g.s} />
              <NumberField error={errorFor(/Object distance/)} hint="Or drag the object in the diagram." label="Object distance s" onChange={(s) => setImg({ s })} unit="cm" value={g.s} />
              <NumberField error={errorFor(/height/)} label="Object height" onChange={(h) => setImg({ h })} unit="cm" value={g.h} />
              <p className="gc-field-hint">Limits: |f| {OPTICS_LIMITS.minF}–{OPTICS_LIMITS.maxF} cm, object distance {OPTICS_LIMITS.minS}–{OPTICS_LIMITS.maxS} cm, real objects only.</p>
            </>
          ) : (
            <>
              <div className="gc-presets" role="group" aria-label="Example boundaries">
                {REFRACTION_PRESETS.map((p) => <button className="secondary-button gc-chip" key={p.label} onClick={() => setRef(p.refraction)} type="button">{p.label}</button>)}
              </div>
              <ParamSlider format={(v) => fmt(v)} label="Index of refraction n₁ (light starts here)" max={2.5} min={1} onChange={(n1) => setRef({ n1 })} step={0.01} value={raw.refraction.n1} />
              <NumberField error={errorFor(/medium 1/)} label="n₁" onChange={(n1) => setRef({ n1 })} value={raw.refraction.n1} />
              <ParamSlider format={(v) => fmt(v)} label="Index of refraction n₂" max={2.5} min={1} onChange={(n2) => setRef({ n2 })} step={0.01} value={raw.refraction.n2} />
              <NumberField error={errorFor(/medium 2/)} label="n₂" onChange={(n2) => setRef({ n2 })} value={raw.refraction.n2} />
              <ParamSlider format={(v) => `${fmt(v)}°`} label="Angle of incidence θ₁ (from the normal)" max={89} min={0} onChange={(theta1) => setRef({ theta1 })} step={0.5} value={raw.refraction.theta1} />
              <NumberField error={errorFor(/angle of incidence/i)} label="θ₁" onChange={(theta1) => setRef({ theta1 })} unit="°" value={raw.refraction.theta1} />
              <p className="gc-field-hint">Indices from {OPTICS_LIMITS.minN} to {OPTICS_LIMITS.maxN}; angles below 90°.</p>
            </>
          )}
          {errors ? <Callout tone="danger" title="These values cannot be used"><ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul></Callout> : null}
        </Panel>

        <div className="gc-stage">
          {view === "imaging" && imgCheck.ok && img ? (
            <>
              <Callout tone={img.nature === "none" ? "warn" : "info"} title={img.sPrime === null ? "No image: the rays leave parallel (image at infinity)" : `${img.nature[0].toUpperCase()}${img.nature.slice(1)}, ${img.orientation}, ${img.size} image`}>
                <p>{img.sPrime === null ? `The object is at the focal point (s = f = ${fmt(imgCheck.value.f)} cm), so the outgoing rays are parallel and never meet. No image distance is given because there is none.` : `1/s + 1/s′ = 1/f gives s′ = ${fmt(img.sPrime)} cm (${img.nature === "real" ? "positive: real, light really converges there" : "negative: virtual, light only appears to come from there"}) and magnification m = −s′/s = ${fmt(img.m as number)}.`}</p>
              </Callout>
              <DiagramFrame caption="Solid rays are real light; dashed lines are backward extensions that locate a virtual image. Drag the object (or focus it and use the arrow keys)." label="Ray diagram" legend={<Legend items={[{ label: "parallel ray", color: "#0b6a72" }, { label: "focal ray", color: "#b45309" }, { label: "centre / vertex ray", color: "#6d28d9" }, { label: "image", color: "#be123c" }]} />} title={kind[0].toUpperCase() + kind.slice(1)}>
                <ImagingDiagram input={imgCheck.value} onObjectDistance={(s) => setImg({ s })} />
              </DiagramFrame>
              <KeyFigures items={[
                { label: "Image distance", value: img.sPrime === null ? "at infinity" : `${fmt(img.sPrime)} cm`, note: img.nature === "real" ? "s′ > 0: real" : img.nature === "virtual" ? "s′ < 0: virtual" : "no image" },
                { label: "Magnification", value: img.m === null ? "undefined" : fmt(img.m), note: img.orientation ? `m = −s′/s: ${img.orientation}, ${img.size}` : undefined },
                { label: "Image height", value: img.hPrime === null ? "—" : `${fmt(img.hPrime)} cm`, note: img.hPrime === null ? undefined : img.hPrime < 0 ? "negative: inverted" : "positive: upright" },
                { label: "Optical power", value: `${fmt(img.power)} D`, note: "1/f with f in metres" },
                { label: "Object region", value: REGION_LABEL[img.region] },
                ...(img.radius !== null ? [{ label: "Radius of curvature", value: `${fmt(img.radius)} cm`, note: "R = 2f" }] : []),
              ]} />
              <Panel subtitle="The standard cases for this element; the row for your object is highlighted." title="Where is the object, what is the image?">
                <div className="gc-table-scroll">
                  <table className="gc-table ph-table" data-testid="image-table">
                    <thead><tr><th scope="col">Object</th><th scope="col">s</th><th scope="col">Image</th><th scope="col">Orientation</th><th scope="col">Size</th></tr></thead>
                    <tbody>{table.map((r) => <tr className={r.at === img.region ? "is-here" : ""} key={r.at}><th scope="row">{REGION_LABEL[r.at]}</th><td>{fmt(r.s)} cm</td><td>{r.res.nature === "none" ? "none (at infinity)" : `${r.res.nature}, s′ = ${fmt(r.res.sPrime as number)} cm`}</td><td>{r.res.orientation ?? "—"}</td><td>{r.res.size ?? "—"}</td></tr>)}</tbody>
                  </table>
                </div>
              </Panel>
            </>
          ) : null}

          {view === "refraction" && refCheck.ok && ref ? (
            <>
              <Callout tone={ref.tir ? "warn" : "info"} title={ref.tir ? "Total internal reflection: no refracted ray" : `Refracted ray at ${fmt(ref.theta2 as number)}° (${ref.bending})`}>
                <p>{ref.tir ? `n₁ sin θ₁ = ${fmt(refCheck.value.n1 * Math.sin((refCheck.value.theta1 * Math.PI) / 180))} would have to equal n₂ sin θ₂ ≤ ${fmt(refCheck.value.n2)}, which is impossible, so all the light is reflected at ${fmt(ref.thetaReflected)}°.` : `n₁ sin θ₁ = n₂ sin θ₂: ${fmt(refCheck.value.n1)} × sin ${fmt(refCheck.value.theta1)}° = ${fmt(refCheck.value.n2)} × sin ${fmt(ref.theta2 as number)}°.`}</p>
              </Callout>
              <DiagramFrame caption="Both angles are measured from the dashed normal. The shading is denser where the index is higher." label="Refraction diagram" title="Light at a boundary">
                <RefractionDiagram input={refCheck.value} />
              </DiagramFrame>
              <KeyFigures items={[
                { label: "Angle of refraction", value: ref.theta2 === null ? "none" : `${fmt(ref.theta2)}°`, note: ref.tir ? "θ₂: total internal reflection" : `θ₂: ${ref.bending}` },
                { label: "Critical angle", value: ref.critical === null ? "none" : `${fmt(ref.critical)}°`, note: ref.critical === null ? "light enters a denser medium" : "asin(n₂/n₁)" },
                { label: "Speed in medium 1", value: `${fmt(100 * ref.speed1)} % of c` },
                { label: "Speed in medium 2", value: `${fmt(100 * ref.speed2)} % of c` },
                { label: "Reflected angle", value: `${fmt(ref.thetaReflected)}°`, note: "equals the angle of incidence" },
              ]} />
            </>
          ) : null}

          {!check.ok ? <Callout tone="info" title="Enter valid values to see the diagram"><p>{errors?.[0] ?? "The diagram appears as soon as every field is valid."}</p></Callout> : null}

          {check.ok ? (
            practice ? (
              scenarios.length && practiceInput ? <GcPredictPanel input={practiceInput} onApply={(next) => update(() => next)} scenarios={scenarios} /> : <Callout tone="info" title="Nothing to predict here"><p>Practice questions need valid settings and an image that exists (an object at the focal point has none).</p></Callout>
            ) : challenge ? (
              <ChallengePanel challenges={OPTICS_CHALLENGES} inputs={raw} onPick={(c) => { if (c.view && c.view !== raw.view) update((x) => ({ ...x, view: c.view as OpticsView })); }} />
            ) : (
              <Panel subtitle="Each answer quotes the numbers for the setup you have chosen." title="Why does it behave this way?">
                {lessons.map((l) => <Disclosure key={l.id} summary={l.title}><Paragraphs items={l.body} /></Disclosure>)}
              </Panel>
            )
          ) : null}
        </div>
      </div>

      <Panel subtitle="What this tool does and does not model." title="Assumptions and limits">
        <ul className="gc-assumptions">
          {OPTICS_ASSUMPTIONS.map((a) => <li key={a}>{a}</li>)}
          <li>Not modelled: thick lenses, systems of several elements, aberrations, aperture and brightness of the image, and curved or rough boundaries.</li>
        </ul>
      </Panel>
      <RelatedConcepts subject="physics" toolId="phOptics" />
    </div>
  );
}
