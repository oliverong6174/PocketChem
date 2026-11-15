import { useMemo } from "react";
import { ProvenancePanel } from "./ProvenancePanel";
import { RelatedConcepts } from "../../ui/RelatedConcepts";
import { LearningModeSwitch } from "../../ui/LearningModeSwitch";
import { Badge, Callout, DiagramFrame, Disclosure, KeyFigures, Panel, Segmented, ToolHeader } from "../../ui/primitives";
import { useGcWorkspace } from "../../generalChem/useGcWorkspace";
import { QuizPanel } from "../../biology/bioShared";
import { MapDiagram } from "./MapDiagram";
import { AssumptionsPanel, ChallengePanel, LedgerTable, MetaboliteCard, ReactionCard, ScrollBox } from "./shared";
import { TENDENCY_GLYPH } from "./format";
import { COMPARTMENTS, METABOLITES, PATHWAYS, REACTIONS, pathwayReactions, type PathwayId } from "../../../utils/biochem/metabolism/network";
import type { BiochemistryToolId } from "../../../navigation/subjects";
import { carriersOf, formatEquation, glucoseLedger, pathwayNet, SHUTTLES, type Shuttle } from "../../../utils/biochem/metabolism/ledger";
import { BASIS_LABEL, MAP_SCENARIOS, mapChallenges, mapQuestions, mapScenarioCondition, mapScenarioOutcome, mapScenarioSignals, type Basis } from "../../../utils/biochem/metabolism/learning";
import { combineTendencies, enzymeTendency } from "../../../utils/biochem/metabolism/regulation";
import { etcOutcome } from "../../../utils/biochem/metabolism/etc";
import {
  DEFAULT_METABOLISM_INPUTS, MAP_LEVELS, METABOLIC_ASSUMPTIONS, METABOLISM_ENGINE_VERSION, describeMetabolismAnalysis, summarizeMetabolism, validateMetabolismInputs, type MapLevel, type MetabolismInputs,
} from "../../../utils/persistence/biochemTools18";
import { validateBiologyResults } from "../../../utils/persistence/biologyTools";
import "../../../styles/biochemistry.css";

type Props = { openRequest?: { id: string; recordId: string } | null; onOpenHandled?: (requestId: string) => void; onOpenTool?: (tool: BiochemistryToolId) => void };
const LEVEL_LABEL: Record<MapLevel, string> = { pathway: "Pathway level", reaction: "Reaction level" };
const TOOL_OF: Record<PathwayId, { id: BiochemistryToolId; label: string }> = {
  glycolysis: { id: "bcGlycolysis", label: "Glycolysis" }, gluconeogenesis: { id: "bcGluconeogenesis", label: "Gluconeogenesis" },
  "pyruvate-oxidation": { id: "bcTca", label: "Pyruvate oxidation & citric acid cycle" }, tca: { id: "bcTca", label: "Pyruvate oxidation & citric acid cycle" }, oxphos: { id: "bcEtc", label: "Electron transport & oxidative phosphorylation" },
};
const BASIS_TONE: Record<Basis, "ok" | "info" | "estimate" | "warn"> = { stoichiometry: "ok", "curated-regulation": "info", "respiratory-model": "estimate", "not-modelled": "warn" };
const BASIS_GLYPH: Record<Basis, string> = { stoichiometry: "■ Stoichiometry", "curated-regulation": "▲ Curated regulation", "respiratory-model": "◆ Respiratory model", "not-modelled": "✖ Not modelled" };
const sign = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0");

export default function MetabolicMapPage({ openRequest = null, onOpenHandled, onOpenTool }: Props) {
  const ws = useGcWorkspace<MetabolismInputs>({
    page: "metabolism", engineVersion: METABOLISM_ENGINE_VERSION, defaults: DEFAULT_METABOLISM_INPUTS, validateInputs: validateMetabolismInputs, validateResults: validateBiologyResults,
    summarize: summarizeMetabolism, describe: describeMetabolismAnalysis, fallbackName: "Integrated metabolic map", openRequest, onOpenHandled,
  });
  const { raw, update } = ws;
  const set = (patch: Partial<MetabolismInputs>) => update((c) => ({ ...c, ...patch }));
  const { mode, level } = raw;
  const g = glucoseLedger(raw.shuttle);
  const scenario = MAP_SCENARIOS.find((s) => s.id === raw.scenario)!;
  const statements = useMemo(() => mapScenarioOutcome(raw.scenario, raw.shuttle), [raw.scenario, raw.shuttle]);
  const questions = useMemo(() => mapQuestions(raw.shuttle), [raw.shuttle]);
  const challenges = useMemo(() => mapChallenges(), []);
  const glyc = carriersOf(pathwayNet("glycolysis")), pdh = carriersOf(pathwayNet("pyruvate-oxidation")), tca = carriersOf(pathwayNet("tca"));
  const labels = {
    glycolysis: `net ${sign(glyc.atp)} ATP, ${sign(glyc.nadh)} NADH`,
    pdh: `${sign(pdh.nadh)} NADH, ${pdh.co2} CO₂`,
    tca: `${tca.nadh} NADH, ${tca.fadh2} FADH₂, ${tca.gtp} GTP`,
    etc: `≈ ${g.oxidativeAtp.cytosolicNadh + g.oxidativeAtp.matrixNadh + g.oxidativeAtp.fadh2} ATP (est.)`,
    atp: `≈ ${g.totalAtp} per glucose (estimate)`,
    co2: `CO₂: ${pdh.co2} + ${tca.co2} = ${pdh.co2 + tca.co2}`,
  };
  const badges = useMemo(() => {
    const sig = mapScenarioSignals(raw.scenario);
    const t = (ids: string[]) => combineTendencies(ids.map((id) => enzymeTendency(id, sig).tendency));
    const out: Partial<Record<PathwayId, string>> = {};
    if (raw.scenario !== "baseline") {
      const put = (p: PathwayId, tt: ReturnType<typeof t>) => { if (tt !== "reference") out[p] = TENDENCY_GLYPH[tt]; };
      put("glycolysis", t(["hk", "pfk1", "pk"])); put("gluconeogenesis", t(["fbpase1", "pc"])); put("pyruvate-oxidation", t(["pdh"])); put("tca", t(["cs", "idh", "akgdh"]));
      const cond = mapScenarioCondition(raw.scenario);
      if (cond) out.oxphos = `ETC ${etcOutcome(["nadh", "succinate"], cond).electronFlow}`;
    }
    return out;
  }, [raw.scenario]);
  const shownReaction = raw.reaction;
  const reactionPathway = raw.pathway ?? (shownReaction ? REACTIONS.find((r) => r.id === shownReaction)!.roles[0].pathway : undefined);
  const pathwayCard = raw.pathway;

  return (
    <div className="gc-page ph-page bio-page bc-page">
      <ToolHeader
        group="Metabolism"
        title="Integrated metabolic map"
        purpose="One connected map from glucose through glycolysis, pyruvate oxidation, the citric acid cycle and the respiratory chain, with gluconeogenesis returning to glucose. A metabolite or reaction selected here is the same entity used in each pathway tool, and the energy ledger counts every carrier once."
        evidence="model"
        steps={[
          { label: "Pick a pathway", detail: "Or switch to the reaction level." },
          { label: "Read the ledger", detail: "Per-glucose carriers and a stated ATP estimate." },
          { label: "Try a scenario", detail: "See what stoichiometry, curated regulation and the respiratory model each support." },
        ]}
        aside={<Badge tone="neutral" title="Not a flux or time-course simulation">No flux simulation</Badge>}
      />
      {ws.chrome}
      <div className="gc-toolbar">
        <LearningModeSwitch mode={mode} modes={["explore", "practice", "challenge"]} onChange={(m) => update((c) => ({ ...c, mode: m }))} />
        {ws.actions}
      </div>
      {ws.saveFormEl}
      <div className="bc-views"><Segmented<MapLevel> label="Level" onChange={(v) => set({ level: v })} options={MAP_LEVELS.map((v) => ({ id: v, label: LEVEL_LABEL[v] }))} value={level} /></div>

      <div className="gc-layout">
        <Panel className="gc-inputs" subtitle="Choose a scenario and the shuttle used for glycolytic NADH." title="Controls">
          <label className="bc-select">Scenario
            <select data-testid="scenario-select" onChange={(e) => set({ scenario: e.target.value })} value={raw.scenario}>
              {MAP_SCENARIOS.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
          </label>
          <p className="ph-note">{scenario.summary}</p>
          <Segmented<Shuttle> label="Glycolytic NADH enters by" onChange={(s) => set({ shuttle: s })} options={(Object.keys(SHUTTLES) as Shuttle[]).map((s) => ({ id: s, label: SHUTTLES[s].label }))} value={raw.shuttle} />
          <label className="bc-select">Metabolite
            <select data-testid="met-select" onChange={(e) => set({ metabolite: e.target.value === "" ? null : e.target.value })} value={raw.metabolite ?? ""}>
              <option value="">None selected</option>
              {METABOLITES.filter((m) => m.kind !== "inorganic" || m.id === "co2").map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
          <Callout tone="info" title="What this map is"><p>Stoichiometry plus curated qualitative regulation. It is not a model of rates, concentrations or time courses.</p></Callout>
        </Panel>

        <div className="gc-stage">
          {level === "pathway" ? (
            <>
              <DiagramFrame caption="Select a pathway box or a metabolite. Arrow labels are net stoichiometric changes per glucose; ▲/▼ above a box show the curated direction for the chosen scenario." label="Integrated metabolic map" title={`Metabolic map: ${scenario.title}`}>
                <ScrollBox focusKey={raw.pathway}><MapDiagram badges={badges} labels={labels} metabolite={raw.metabolite} onMet={(m) => set({ metabolite: m })} onPath={(p) => set({ pathway: p })} pathway={raw.pathway} /></ScrollBox>
              </DiagramFrame>
              {pathwayCard ? (
                <div className="mt-card" data-testid="pathway-card">
                  <h3>{PATHWAYS[pathwayCard].label}</h3>
                  <p>{PATHWAYS[pathwayCard].summary}</p>
                  <div className="mt-badges">{PATHWAYS[pathwayCard].compartments.map((c) => <Badge key={c} tone="info">{COMPARTMENTS[c].label}</Badge>)}</div>
                  {pathwayCard !== "oxphos" ? <p className="mt-eq">{formatEquation(pathwayNet(pathwayCard))}</p> : <p className="mt-eq">NADH + H⁺ + ½ O₂ → NAD⁺ + H₂O (≈ 10 H⁺ pumped); FADH₂ + ½ O₂ → FAD + H₂O (≈ 6 H⁺ pumped)</p>}
                  <p className="ph-note">Per glucose where the pathway has a defined glucose accounting; the cycle is shown for two turns.</p>
                  <ul className="mt-links">{pathwayReactions(pathwayCard).map(({ reaction }) => <li key={reaction.id}><button className="ghost-button" onClick={() => set({ reaction: reaction.id, level: "reaction" })} type="button">{reaction.name}</button></li>)}</ul>
                  {onOpenTool ? <button className="primary-button" data-testid="open-pathway-tool" onClick={() => onOpenTool(TOOL_OF[pathwayCard].id)} type="button">Open {TOOL_OF[pathwayCard].label}</button> : null}
                </div>
              ) : <Callout tone="info" title="Select a pathway"><p>Choose a box on the map to see its reactions, net equation and compartments, and to open its full tool.</p></Callout>}
            </>
          ) : (
            <>
              {PATHWAYS_ORDER.map((p) => (
                <Panel key={p} subtitle={PATHWAYS[p].summary} title={PATHWAYS[p].label}>
                  <ul className="mt-pathway-list" data-testid={`rxn-list-${p}`}>
                    {pathwayReactions(p).map(({ reaction, role }) => (
                      <li key={`${p}-${reaction.id}`}><button aria-pressed={raw.reaction === reaction.id && raw.pathway === p} className="mt-rxn-chip" onClick={() => set({ reaction: reaction.id, pathway: p })} type="button">{role.step}. {reaction.name}{role.direction === "reverse" ? " (reverse)" : ""}</button></li>
                    ))}
                  </ul>
                </Panel>
              ))}
              {shownReaction ? <ReactionCard onSelectMetabolite={(m) => set({ metabolite: m })} pathway={reactionPathway} reactionId={shownReaction} /> : <Callout tone="info" title="Select a reaction"><p>Choose a reaction above to see its equation, enzyme, compartment, cofactors and structures.</p></Callout>}
            </>
          )}
          {raw.metabolite ? <MetaboliteCard id={raw.metabolite} onSelectReaction={(id) => set({ reaction: id, level: "reaction", pathway: null })} /> : null}

          <Panel subtitle={`Per glucose, complete oxidation. Every carrier is counted once. ${SHUTTLES[raw.shuttle].label}.`} title="Energy-carrier ledger">
            <KeyFigures items={[
              { label: "Substrate-level ATP/GTP", value: String(g.substrateLevel.glycolysis + g.substrateLevel.cycle), note: "2 glycolysis + 2 cycle" },
              { label: "Reduced carriers", value: `${g.cytosolicNadh + g.matrixNadh} NADH + ${g.fadh2} FADH₂`, note: `${g.cytosolicNadh} cytosolic + ${g.matrixNadh} matrix` },
              { label: "CO₂", value: String(g.co2), note: "all six glucose carbons" },
              { label: "ATP (estimate)", value: String(g.totalAtp), note: "not a fixed value" },
            ]} />
            <table className="bc-table" data-testid="map-ledger">
              <thead><tr><th scope="col">Source</th><th scope="col">Carriers made</th><th scope="col">ATP (estimate)</th></tr></thead>
              <tbody>
                <tr><th scope="row">Glycolysis (substrate-level)</th><td>net 2 ATP</td><td>{g.substrateLevel.glycolysis}</td></tr>
                <tr><th scope="row">Citric acid cycle (substrate-level)</th><td>2 GTP</td><td>{g.substrateLevel.cycle}</td></tr>
                <tr><th scope="row">Glycolytic NADH (shuttle)</th><td>{g.cytosolicNadh} NADH</td><td>{g.oxidativeAtp.cytosolicNadh}</td></tr>
                <tr><th scope="row">Pyruvate oxidation + cycle NADH</th><td>{g.matrixNadh} NADH</td><td>{g.oxidativeAtp.matrixNadh}</td></tr>
                <tr><th scope="row">Cycle FADH₂</th><td>{g.fadh2} FADH₂</td><td>{g.oxidativeAtp.fadh2}</td></tr>
                <tr><th scope="row">Total</th><td /><td data-testid="map-total">{g.totalAtp}</td></tr>
              </tbody>
            </table>
            <LedgerTable caption="Gluconeogenesis (reverse direction): 2 pyruvate → glucose" net={pathwayNet("gluconeogenesis")} />
            <p className="ph-note">Glycolysis and gluconeogenesis are different routes, not exact inverses: gluconeogenesis spends 6 NTP and 2 NADH to make one glucose, glycolysis nets 2 ATP and 2 NADH.</p>
          </Panel>

          <Panel subtitle={scenario.summary} title={`Scenario: ${scenario.title}`}>
            <ul className="gc-assumptions" data-testid="scenario-statements">
              {statements.map((s) => <li className="mt-statement" key={s.text}><Badge tone={BASIS_TONE[s.basis]} title={BASIS_LABEL[s.basis]}>{BASIS_GLYPH[s.basis]}</Badge><span>{s.text}</span></li>)}
            </ul>
            <Disclosure summary="What do the labels mean?">
              <ul className="gc-assumptions">{(Object.keys(BASIS_LABEL) as Basis[]).map((b) => <li key={b}><strong>{BASIS_GLYPH[b]}:</strong> {BASIS_LABEL[b]}.</li>)}</ul>
            </Disclosure>
            <Callout tone="warn" title="Not a quantitative cellular model"><p>The map never predicts how fast anything runs or how much a metabolite changes. Statements marked “Not modelled” would need a quantitative kinetic model that is not implemented here.</p></Callout>
          </Panel>

          {mode === "explore" ? (
            <Panel title="Why does it behave this way?">
              <Disclosure defaultOpen summary="What is shared between the tools?"><p>Pyruvate links glycolysis, gluconeogenesis and pyruvate oxidation; acetyl-CoA links pyruvate oxidation to the cycle; oxaloacetate links the cycle to gluconeogenesis; NADH and FADH₂ link both to the respiratory chain. Each is one metabolite identity in the network.</p></Disclosure>
              <Disclosure summary="Why is the ATP total an estimate?"><p>It uses about 2.5 ATP per NADH and 1.5 per FADH₂ (10 and 6 H⁺ pumped, about 4 H⁺ per ATP) and depends on how glycolytic NADH reaches the matrix.</p></Disclosure>
            </Panel>
          ) : null}
          {mode === "practice" ? <QuizPanel questions={questions} /> : null}
          {mode === "challenge" ? <ChallengePanel items={challenges} index={raw.challenge} onNext={() => set({ challenge: raw.challenge + 1 })} onReveal={(p) => set({ scenario: p.scenario })} label="Apply the scenario to the map" /> : null}
          <AssumptionsPanel items={METABOLIC_ASSUMPTIONS} />
          <ProvenancePanel topics={["glycolysis","gluconeogenesis","pyruvate-oxidation","tca","etc","regulation"]} />
        </div>
      </div>
      <RelatedConcepts subject="biochemistry" toolId="bcMetabolism" />
    </div>
  );
}
const PATHWAYS_ORDER: PathwayId[] = ["glycolysis", "gluconeogenesis", "pyruvate-oxidation", "tca", "oxphos"];
