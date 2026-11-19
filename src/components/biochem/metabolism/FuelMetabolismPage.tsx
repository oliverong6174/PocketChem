import { useMemo } from "react";
import { LearningModeSwitch } from "../../ui/LearningModeSwitch";
import { Badge, Callout, DiagramFrame, KeyFigures, Panel, Segmented, ToolHeader } from "../../ui/primitives";
import { useGcWorkspace } from "../../generalChem/useGcWorkspace";
import { QuizPanel } from "../../biology/bioShared";
import { GraphDiagram } from "./GraphDiagram";
import { fuelMapSpec, nodeIdOfMetabolite, nodeIdOfPathway } from "./diagramSpecs25";
import { AssumptionsPanel, ChallengePanel, MetaboliteCard, ReactionCard, ScrollBox } from "./shared";
import { SIGN } from "./format";
import { COMPARTMENTS, PATHWAYS, REACTIONS_BY_ID, TISSUES, metaboliteOf, pathwayReactions, type PathwayId, type TissueId } from "../../../utils/biochem/metabolism/network";
import { SHUTTLES, formatEquation, type Shuttle } from "../../../utils/biochem/metabolism/ledger";
import {
  BASIS_LABEL, FUEL_SCENARIOS, FUEL_SCENARIOS_BY_ID, GROUPS, MAP_FOCUS, REQUIRED_SHARED, STATE_LABEL, acetylCoaSources, groupOf, metaboliteRoles, pathwayLedger, pathwaysOfMetabolite, scenarioStates, sharedMetabolites,
  stateOf, substrateComparison, type MapFocus,
} from "../../../utils/biochem/metabolism/fuel";
import { fuelChallenges, fuelQuestions } from "../../../utils/biochem/metabolism/learning25";
import {
  DEFAULT_FUEL_INPUTS, FUELMETABOLISM_ENGINE_VERSION, FUEL_ASSUMPTIONS, FUEL_DISPLAYS, describeFuelAnalysis, summarizeFuel, validateFuelInputs, type FuelDisplay, type FuelInputs,
} from "../../../utils/persistence/biochemTools25";
import { validateBiologyResults } from "../../../utils/persistence/biologyTools";
import type { BiochemistryToolId } from "../../../navigation/subjects";
import { RelatedConcepts } from "../../ui/RelatedConcepts";
import "../../../styles/biochemistry.css";

type Props = { openRequest?: { id: string; recordId: string } | null; onOpenHandled?: (requestId: string) => void; onOpenTool?: (tool: BiochemistryToolId) => void };
const DISPLAY_LABEL: Record<FuelDisplay, string> = { map: "Map", ledger: "Ledgers", scenario: "Scenarios", compare: "Compare fuels" };
const TOOL_OF: Record<PathwayId, BiochemistryToolId> = {
  glycolysis: "bcGlycolysis", gluconeogenesis: "bcGluconeogenesis", "pyruvate-oxidation": "bcTca", tca: "bcTca", oxphos: "bcEtc",
  "fa-activation": "bcFattyAcids", "carnitine-shuttle": "bcFattyAcids", "beta-oxidation": "bcFattyAcids", "fa-synthesis": "bcFattyAcids", propionate: "bcFattyAcids", ketogenesis: "bcFattyAcids", ketolysis: "bcFattyAcids",
  transamination: "bcAminoMetabolism", deamination: "bcAminoMetabolism", "urea-cycle": "bcAminoMetabolism",
};
const fmt = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(2).replace(/0$/, ""));
const STATE_TONE = { "tends-active": "ok", "tends-suppressed": "warn", "not-determined": "neutral", absent: "estimate" } as const;
const GLYPH = { "tends-active": "▲", "tends-suppressed": "▼", "not-determined": "?", absent: "✖" } as const;

export default function FuelMetabolismPage({ openRequest = null, onOpenHandled, onOpenTool }: Props) {
  const ws = useGcWorkspace<FuelInputs>({
    page: "fuelmetabolism", engineVersion: FUELMETABOLISM_ENGINE_VERSION, defaults: DEFAULT_FUEL_INPUTS, validateInputs: validateFuelInputs, validateResults: validateBiologyResults,
    summarize: summarizeFuel, describe: describeFuelAnalysis, fallbackName: "Integrated fuel metabolism", openRequest, onOpenHandled,
  });
  const { raw, update } = ws;
  const set = (patch: Partial<FuelInputs>) => update((c) => ({ ...c, ...patch }));
  const { mode, display, focus, pathway, metabolite, scenario, tissue } = raw;
  const questions = useMemo(() => fuelQuestions({ scenario }), [scenario]);
  const challenges = useMemo(() => fuelChallenges(), []);
  const spec = useMemo(() => fuelMapSpec(focus, pathway, metabolite), [focus, pathway, metabolite]);
  const shared = useMemo(() => sharedMetabolites(), []);
  const roles = metabolite ? metaboliteRoles(metabolite) : [];
  const sc = FUEL_SCENARIOS_BY_ID[scenario], states = scenarioStates(scenario);
  const led = pathway ? pathwayLedger(pathway) : null;
  const rows = substrateComparison(raw.shuttle), src = acetylCoaSources(raw.shuttle);
  const allPathways = Object.keys(PATHWAYS) as PathwayId[];

  return (
    <div className="gc-page ph-page bio-page bc-page">
      <ToolHeader
        group="Metabolism"
        title="Integrated fuel metabolism"
        purpose="Carbohydrate, fatty acids, ketone bodies and amino acids on one map. Pick a pathway or a shared metabolite, read separate carbon, nitrogen and energy-carrier ledgers, see which tissue does what, and compare fuels. Connections are stoichiometric or curated relationships, not flux predictions."
        evidence="model"
        steps={[{ label: "Pick a focus", detail: "Whole map or a focused view." }, { label: "Select a metabolite", detail: "See every pathway that uses it." }, { label: "Read the ledgers", detail: "Carbon, nitrogen, ATP, NADH, NADPH." }]}
        aside={<Badge tone="neutral" title="Curated relationships; no flux is computed">Qualitative</Badge>}
      />
      {ws.chrome}
      <div className="gc-toolbar">
        <LearningModeSwitch mode={mode} modes={["explore", "practice", "challenge"]} onChange={(m) => update((c) => ({ ...c, mode: m }))} />
        {ws.actions}
      </div>
      {ws.saveFormEl}
      <div className="bc-views"><Segmented<FuelDisplay> label="Display" onChange={(v) => set({ display: v })} options={FUEL_DISPLAYS.map((v) => ({ id: v, label: DISPLAY_LABEL[v] }))} value={display} /></div>

      <div className="gc-layout">
        <Panel className="gc-inputs" subtitle="Choose what to look at." title="Controls">
          {display === "map" ? (
            <>
              <label className="gc-field"><span>Focused view</span>
                <select data-testid="fuel-focus" onChange={(e) => set({ focus: e.target.value as MapFocus })} value={focus}>{(Object.keys(MAP_FOCUS) as MapFocus[]).map((f) => <option key={f} value={f}>{MAP_FOCUS[f].label}</option>)}</select>
              </label>
              <label className="gc-field"><span>Shared metabolite</span>
                <select data-testid="fuel-metabolite" onChange={(e) => set({ metabolite: e.target.value || null })} value={metabolite ?? ""}><option value="">(none)</option>{shared.map((id) => <option key={id} value={id}>{metaboliteOf(id)!.name}</option>)}</select>
              </label>
            </>
          ) : null}
          {display === "ledger" || display === "map" ? (
            <label className="gc-field"><span>Pathway</span>
              <select data-testid="fuel-pathway" onChange={(e) => set({ pathway: (e.target.value || null) as PathwayId | null })} value={pathway ?? ""}><option value="">(none)</option>{allPathways.map((p) => <option key={p} value={p}>{PATHWAYS[p].label}</option>)}</select>
            </label>
          ) : null}
          {display === "scenario" ? (
            <>
              <label className="gc-field"><span>Scenario</span>
                <select data-testid="fuel-scenario" onChange={(e) => set({ scenario: e.target.value })} value={scenario}>{FUEL_SCENARIOS.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}</select>
              </label>
              <Segmented<TissueId> label="Tissue" onChange={(v) => set({ tissue: v })} options={(Object.keys(TISSUES) as TissueId[]).map((t) => ({ id: t, label: t === "liver" ? "Liver" : "Extrahepatic" }))} value={tissue} />
            </>
          ) : null}
          {display === "compare" ? <Segmented<Shuttle> label="Cytosolic NADH shuttle" onChange={(v) => set({ shuttle: v })} options={(Object.keys(SHUTTLES) as Shuttle[]).map((s) => ({ id: s, label: s === "malate-aspartate" ? "Malate–aspartate" : "Glycerol phosphate" }))} value={raw.shuttle} /> : null}
          <Callout tone="info" title="Reading the map"><p>A line means a pathway uses or makes that metabolite. It does not say how fast, or in which direction in a given cell.</p></Callout>
        </Panel>

        <div className="gc-stage">
          {display === "map" ? (
            <>
              <DiagramFrame caption={`${MAP_FOCUS[focus].summary} Pathways dimmed are outside this focus or do not use the selected metabolite. The diagram scrolls sideways on narrow screens.`} label="Integrated fuel map" title="Fuels meet at shared metabolites">
                <ScrollBox focusKey={`${focus}${pathway}${metabolite}`}>
                  <GraphDiagram {...spec} onNode={(id) => { const p = nodeIdOfPathway(id), m = nodeIdOfMetabolite(id); if (p) set({ pathway: pathway === p ? null : p }); else if (m) set({ metabolite: metabolite === m ? null : m }); }} />
                </ScrollBox>
                <ul className="mt-legend">{(Object.keys(GROUPS) as Array<keyof typeof GROUPS>).map((g) => <li key={g}><strong>{GROUPS[g].label}:</strong> {GROUPS[g].summary}</li>)}</ul>
              </DiagramFrame>
              {metabolite ? (
                <Panel subtitle="Every reaction of the network that makes or uses it." title={`${metaboliteOf(metabolite)!.name} across pathways`}>
                  <p data-testid="metabolite-pathways"><strong>Pathways:</strong> {pathwaysOfMetabolite(metabolite).map((p) => PATHWAYS[p].label).join(", ")}</p>
                  <table className="bc-table" data-testid="metabolite-roles"><thead><tr><th scope="col">Reaction</th><th scope="col">It is a…</th><th scope="col">Compartment</th><th scope="col">Tissue</th></tr></thead>
                    <tbody>{roles.map((r) => <tr key={`${r.reactionId}${r.side}`}><th scope="row"><button className="ghost-button" onClick={() => set({ reaction: r.reactionId })} type="button">{REACTIONS_BY_ID[r.reactionId].name}</button></th><td>{r.side}</td><td>{COMPARTMENTS[REACTIONS_BY_ID[r.reactionId].compartment].label}</td><td>{r.tissues.length === 2 ? "Both" : TISSUES[r.tissues[0]].label}</td></tr>)}</tbody></table>
                  <MetaboliteCard id={metabolite} onSelectReaction={(id) => set({ reaction: id })} />
                  {raw.reaction ? <ReactionCard perUnit="per pass" reactionId={raw.reaction} /> : null}
                </Panel>
              ) : null}
              {pathway ? (
                <Panel subtitle={PATHWAYS[pathway].summary} title={PATHWAYS[pathway].label}>
                  <div className="mt-badges">{PATHWAYS[pathway].compartments.map((c) => <Badge key={c} tone="info">{COMPARTMENTS[c].label}</Badge>)}<Badge tone="neutral">{GROUPS[groupOf(pathway)].label}</Badge></div>
                  <ul className="mt-links">{pathwayReactions(pathway).map(({ reaction }) => <li key={reaction.id}><button className="ghost-button" onClick={() => set({ reaction: reaction.id })} type="button">{reaction.name}</button></li>)}</ul>
                  {onOpenTool ? <button className="primary-button" data-testid="open-pathway-tool" onClick={() => onOpenTool(TOOL_OF[pathway])} type="button">Open the {PATHWAYS[pathway].label} laboratory</button> : null}
                </Panel>
              ) : <p className="ph-note">Select a pathway box or a shared metabolite to inspect it.</p>}
              <Panel title="Shared identities">
                <p>One definition each: {REQUIRED_SHARED.map((id) => metaboliteOf(id)!.name).join(", ")}. NADPH is a separate pool from NADH.</p>
              </Panel>
            </>
          ) : null}

          {display === "ledger" ? (
            led ? (
              <Panel subtitle={`${PATHWAYS[pathway!].label}, ${led.unit}`} title="Separate ledgers">
                <table className="bc-table" data-testid="fuel-ledgers">
                  <thead><tr><th scope="col">Ledger</th><th scope="col">Value</th><th scope="col">Meaning</th></tr></thead>
                  <tbody>
                    <tr><th scope="row">Carbon (skeleton carbons)</th><td>{led.ledgers.carbon.consumed} in, {led.ledgers.carbon.produced} out</td><td>Carrier moieties (CoA, ACP, carnitine) are not counted; CO₂ net {SIGN(led.ledgers.carbon.co2)}.</td></tr>
                    <tr><th scope="row">Nitrogen</th><td>{led.ledgers.nitrogen.consumed} in, {led.ledgers.nitrogen.produced} out</td><td>Ammonium {SIGN(led.ledgers.nitrogen.ammonium)}, urea {SIGN(led.ledgers.nitrogen.urea)}; not an energy ledger.</td></tr>
                    <tr><th scope="row">ATP / GTP</th><td>ATP {SIGN(led.ledgers.energy.atp)}, GTP {SIGN(led.ledgers.energy.gtp)}</td><td>{led.ledgers.energy.highEnergyBonds >= 0 ? "bonds made" : "bonds spent"}: {Math.abs(led.ledgers.energy.highEnergyBonds)}</td></tr>
                    <tr><th scope="row">NADH / FADH₂</th><td>NADH {SIGN(led.ledgers.redox.nadh)}, FADH₂ {SIGN(led.ledgers.redox.fadh2)}</td><td>Feed the respiratory chain.</td></tr>
                    <tr><th scope="row">NADPH</th><td>{SIGN(led.ledgers.nadph)}</td><td>Separate pool; consumed by biosynthesis, not interchangeable with NADH.</td></tr>
                  </tbody>
                </table>
                <p className="mt-eq" data-testid="fuel-net">{formatEquation(led.net)}</p>
                <p className="ph-note">Each pathway's own passes are added; a reaction listed in two pathways runs once for each. Carbohydrate pathways are per glucose; fatty-acid synthesis per palmitate; others per pass of the pathway.</p>
              </Panel>
            ) : <Callout tone="info" title="Choose a pathway"><p>Select a pathway on the left to see its carbon, nitrogen, energy, redox and NADPH ledgers.</p></Callout>
          ) : null}

          {display === "scenario" ? (
            <>
              <Panel subtitle={sc.summary} title={sc.title}>
                <table className="bc-table" data-testid="scenario-table">
                  <thead><tr><th scope="col">Pathway</th><th scope="col">Liver</th><th scope="col">Extrahepatic</th></tr></thead>
                  <tbody>{allPathways.map((p) => (
                    <tr key={p} aria-current={states[p] && tissue ? true : undefined}>
                      <th scope="row">{PATHWAYS[p].label}</th>
                      {(["liver", "extrahepatic"] as TissueId[]).map((t) => { const s = stateOf(scenario, p, t); return <td key={t}><Badge tone={STATE_TONE[s]} title={STATE_LABEL[s]}>{GLYPH[s]} {STATE_LABEL[s]}</Badge></td>; })}
                    </tr>))}</tbody>
                </table>
                <p className="ph-note">{TISSUES[tissue].note}</p>
              </Panel>
              <Panel title="What supports each statement">
                {sc.statements.map((s) => <p className="mt-statement" key={s.text}><Badge tone={s.basis === "stoichiometry" ? "ok" : s.basis === "curated-regulation" ? "info" : s.basis === "tissue-enzyme" ? "estimate" : "warn"}>{BASIS_LABEL[s.basis]}</Badge><span>{s.text}</span></p>)}
              </Panel>
              <Panel subtitle="Where the model cannot decide, it says so." title="Missing information">
                <ul className="gc-assumptions" data-testid="scenario-missing">{sc.missing.map((m) => <li key={m}>{m}</li>)}</ul>
              </Panel>
            </>
          ) : null}

          {display === "compare" ? (
            <>
              <Panel subtitle="Conventional estimates (2.5 ATP/NADH, 1.5 ATP/FADH₂); complete oxidation per molecule." title="Substrate utilization">
                <table className="bc-table" data-testid="fuel-compare"><thead><tr><th scope="col">Substrate</th><th scope="col">Carbons</th><th scope="col">ATP equivalents</th><th scope="col">Per carbon</th><th scope="col">Enters through</th><th scope="col">Used by</th></tr></thead>
                  <tbody>{rows.map((r) => <tr key={r.id}><th scope="row">{r.label}</th><td>{r.carbons}</td><td data-testid={`atp-${r.id}`}>{fmt(r.atp)}</td><td>{r.atpPerCarbon.toFixed(2)}</td><td>{r.enters}</td><td>{r.tissues}</td></tr>)}</tbody></table>
                <ul className="gc-assumptions">{rows.map((r) => <li key={r.id}><strong>{r.label}:</strong> {r.note}</li>)}</ul>
                <p className="ph-note">Amino acids are not ranked: their yield depends on which amino acid it is and what happens to its nitrogen.</p>
              </Panel>
              <Panel subtitle="Acetyl-CoA is the same molecule from every source." title="Acetyl-CoA from carbohydrate versus ketone bodies">
                <KeyFigures items={[{ label: "Cycle yield per acetyl-CoA", value: fmt(src.cycleAtpPerAcetylCoA), note: "ATP equivalents" }, { label: "Upstream, glucose", value: SIGN(src.carbohydrate.upstreamPerAcetylCoA) }, { label: "Upstream, acetoacetate", value: SIGN(src.acetoacetate.upstreamPerAcetylCoA) }, { label: "Upstream, β-HB", value: SIGN(src.bhb.upstreamPerAcetylCoA) }]} />
              </Panel>
            </>
          ) : null}

          {mode === "practice" ? <QuizPanel questions={questions} /> : null}
          {mode === "challenge" ? <ChallengePanel index={raw.challenge} items={challenges} onNext={() => set({ challenge: raw.challenge + 1 })} onReveal={(p) => set({ scenario: p.scenario, display: p.display })} /> : null}
          <AssumptionsPanel items={FUEL_ASSUMPTIONS} />
        </div>
      </div>
      <RelatedConcepts limit={5} subject="biochemistry" toolId="bcFuel" />
    </div>
  );
}
