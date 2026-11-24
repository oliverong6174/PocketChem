import { useMemo, useState } from "react";
import { LearningModeSwitch } from "../../ui/LearningModeSwitch";
import { Badge, Callout, DiagramFrame, KeyFigures, Panel, Segmented, ToolHeader } from "../../ui/primitives";
import { useGcWorkspace } from "../../generalChem/useGcWorkspace";
import { QuizPanel, StepControls } from "../../biology/bioShared";
import { useStepPlayer } from "../../biology/bioHooks";
import { MoleculeSvg } from "../MoleculeSvg";
import { GraphDiagram, GraphLegend, EDGE_COLORS } from "./GraphDiagram";
import { aminoMapSpec, ureaSpec } from "./diagramSpecs25";
import { AssumptionsPanel, ChallengePanel, ReactionCard, ScrollBox, TendencyBadge } from "./shared";
import { ProvenancePanel } from "./ProvenancePanel";
import { SIGN } from "./format";
import { REACTIONS_BY_ID, metaboliteOf } from "../../../utils/biochem/metabolism/network";
import { formatEquation } from "../../../utils/biochem/metabolism/ledger";
import {
  AMINO_CATABOLISM_BY_ONE, CLASSIFICATION_CAVEAT, ENDPOINTS, NITROGEN_CARRIERS, NITROGEN_EXAMPLES, TRANSAMINATION_SUBSTRATES, UREA_CAVEATS, UREA_CORE, UREA_NITROGEN_SOURCES, AMMONIUM_UREA_LINK,
  aminoAcidRoles, classifyAminoAcid, fumarateConnection, glutamateDehydrogenase, plpCoenzyme, plpMechanism, transamination, transdeamination, ureaEnergy, ureaNet, ureaRegulation, ureaSteps, ureaTrace,
} from "../../../utils/biochem/metabolism/nitrogen";
import { aminoChallenges, aminoQuestions } from "../../../utils/biochem/metabolism/learning25";
import { AMINO_ACID_LIST } from "../../../utils/biochem/aminoAcids";
import {
  AA_VIEWS, AMINOMETABOLISM_ENGINE_VERSION, AMINO_ASSUMPTIONS, DEFAULT_AMINO_INPUTS, NITROGEN_EXAMPLE_IDS, describeAminoAnalysis, summarizeAmino, validateAminoInputs, type AaView, type AminoInputs,
} from "../../../utils/persistence/biochemTools25";
import { validateBiologyResults } from "../../../utils/persistence/biologyTools";
import { RelatedConcepts } from "../../ui/RelatedConcepts";
import "../../../styles/biochemistry.css";
import { EvidencePanel } from "../../ui/EvidencePanel";

type Props = { openRequest?: { id: string; recordId: string } | null; onOpenHandled?: (requestId: string) => void };
const VIEW_LABEL: Record<AaView, string> = { structure: "Amino acid", transamination: "Transamination", deamination: "Deamination", skeleton: "Carbon skeletons", nitrogen: "Nitrogen handling", urea: "Urea cycle" };
const CLASS_LABEL = { glucogenic: "Glucogenic only", ketogenic: "Ketogenic only", both: "Glucogenic and ketogenic" } as const;
const name = (id: string) => metaboliteOf(id)?.name ?? id;

export default function AminoMetabolismPage({ openRequest = null, onOpenHandled }: Props) {
  const ws = useGcWorkspace<AminoInputs>({
    page: "aminometabolism", engineVersion: AMINOMETABOLISM_ENGINE_VERSION, defaults: DEFAULT_AMINO_INPUTS, validateInputs: validateAminoInputs, validateResults: validateBiologyResults,
    summarize: summarizeAmino, describe: describeAminoAnalysis, fallbackName: "Amino-acid metabolism", openRequest, onOpenHandled,
  });
  const { raw, update } = ws;
  const set = (patch: Partial<AminoInputs>) => update((c) => ({ ...c, ...patch }));
  const { mode, view, aa } = raw;
  const [hideSel] = useState(false);
  const a = AMINO_ACID_LIST.find((x) => x.one === aa)!, cat = AMINO_CATABOLISM_BY_ONE[aa], roles = aminoAcidRoles(aa)!;
  const cls = classifyAminoAcid(aa);
  const tm = transamination(raw.transSubstrate)!, tsub = TRANSAMINATION_SUBSTRATES.find((t) => t.one === raw.transSubstrate)!;
  const plp = plpMechanism(tm.aminoAcid, tm.ketoAcid.name);
  const plpPlayer = useStepPlayer(raw.plpStep, plp.length, (n) => set({ plpStep: n }));
  const uPlayer = useStepPlayer(raw.ureaStep, UREA_CORE.length, (n) => set({ ureaStep: n, selected: n ? UREA_CORE[n - 1] : null }));
  const gdh = glutamateDehydrogenase(raw.gdhCofactor, raw.gdhDirection);
  const td = transdeamination(raw.transSubstrate);
  const steps = ureaSteps(), energy = ureaEnergy(), conn = fumarateConnection();
  const reg = ureaRegulation({ nagPresent: raw.nag, arginine: raw.arginine });
  const questions = useMemo(() => aminoQuestions({ aa, ureaStep: view === "urea" ? raw.ureaStep : 0, substrate: raw.transSubstrate }), [aa, raw.ureaStep, view, raw.transSubstrate]);
  const challenges = useMemo(() => aminoChallenges(), []);
  const trace = ureaTrace(raw.ureaStep);
  const doneNet = ureaNet(raw.ureaStep as number);
  const selStep = raw.selected;
  void hideSel;

  return (
    <div className="gc-page ph-page bio-page bc-page">
      <ToolHeader
        group="Metabolism"
        title="Amino-acid metabolism & urea cycle"
        purpose="Separate what happens to an amino acid's nitrogen from what happens to its carbon skeleton: transamination with pyridoxal phosphate, oxidative deamination, where each skeleton enters central metabolism, and the five-step urea cycle with its nitrogen and ATP ledgers."
        evidence="model"
        steps={[{ label: "Choose an amino acid", detail: "Structure, amino group and skeleton." }, { label: "Move the nitrogen", detail: "Transamination, deamination, urea." }, { label: "Follow the carbon", detail: "Glucogenic, ketogenic or both." }]}
        aside={<Badge tone="neutral" title="Stoichiometry plus curated textbook relationships">Curated + stoichiometry</Badge>}
      />
      {ws.chrome}
      <div className="gc-toolbar">
        <LearningModeSwitch mode={mode} modes={["explore", "practice", "challenge"]} onChange={(m) => { plpPlayer.pause(); uPlayer.pause(); update((c) => ({ ...c, mode: m })); }} />
        {ws.actions}
      </div>
      {ws.saveFormEl}
      <div className="bc-views"><Segmented<AaView> label="View" onChange={(v) => { plpPlayer.pause(); uPlayer.pause(); set({ view: v }); }} options={AA_VIEWS.map((v) => ({ id: v, label: VIEW_LABEL[v] }))} value={view} /></div>

      <div className="gc-layout">
        <Panel className="gc-inputs" subtitle="Choose an amino acid or step through a process." title="Controls">
          {view === "structure" || view === "skeleton" ? (
            <label className="gc-field"><span>Amino acid</span>
              <select data-testid="aa-select" onChange={(e) => set({ aa: e.target.value })} value={aa}>{AMINO_ACID_LIST.map((x) => <option key={x.one} value={x.one}>{x.name} ({x.three})</option>)}</select>
            </label>
          ) : null}
          {view === "transamination" ? (
            <>
              <label className="gc-field"><span>Amino-acid substrate</span>
                <select data-testid="ta-select" onChange={(e) => set({ transSubstrate: e.target.value, plpStep: 0 })} value={raw.transSubstrate}>{TRANSAMINATION_SUBSTRATES.map((t) => <option key={t.one} value={t.one}>{AMINO_ACID_LIST.find((x) => x.one === t.one)!.name}</option>)}</select>
              </label>
              <StepControls locked={mode === "challenge"} max={plp.length} onStep={(n) => set({ plpStep: n })} player={plpPlayer} step={raw.plpStep} unit="Stage" />
            </>
          ) : null}
          {view === "deamination" ? (
            <>
              <Segmented<"deamination" | "amination"> label="Direction" onChange={(v) => set({ gdhDirection: v })} options={[{ id: "deamination", label: "Oxidative deamination" }, { id: "amination", label: "Reductive amination" }]} value={raw.gdhDirection} />
              <Segmented<"nad" | "nadp"> label="Coenzyme" onChange={(v) => set({ gdhCofactor: v })} options={[{ id: "nad", label: "NAD⁺ / NADH" }, { id: "nadp", label: "NADP⁺ / NADPH" }]} value={raw.gdhCofactor} />
            </>
          ) : null}
          {view === "nitrogen" ? (
            <label className="gc-field"><span>Example</span>
              <select data-testid="n-select" onChange={(e) => set({ nitrogenExample: e.target.value as AminoInputs["nitrogenExample"] })} value={raw.nitrogenExample}>{NITROGEN_EXAMPLE_IDS.map((id) => <option key={id} value={id}>{NITROGEN_EXAMPLES.find((x) => x.id === id)!.title}</option>)}</select>
            </label>
          ) : null}
          {view === "urea" ? (
            <>
              <StepControls locked={mode === "challenge"} max={UREA_CORE.length} onStep={(n) => set({ ureaStep: n, selected: n ? UREA_CORE[n - 1] : null })} player={uPlayer} step={raw.ureaStep} unit="Step" />
              <Segmented<"present" | "absent"> label="N-acetylglutamate (activator of CPS I)" onChange={(v) => set({ nag: v === "present" })} options={[{ id: "present", label: "Present" }, { id: "absent", label: "Absent" }]} value={raw.nag ? "present" : "absent"} />
              <Segmented<"normal" | "high"> label="Arginine (stimulates NAGS)" onChange={(v) => set({ arginine: v })} options={[{ id: "normal", label: "Normal" }, { id: "high", label: "High" }]} value={raw.arginine} />
            </>
          ) : null}
          <Callout tone="info" title="Two different questions"><p>Nitrogen: where does the amino group go (glutamate, ammonium, aspartate, urea)? Carbon: where does the skeleton enter metabolism? They have different pathways and different ledgers.</p></Callout>
        </Panel>

        <div className="gc-stage">
          {view === "structure" ? (
            <Panel subtitle="Reused from the Stage 17 amino-acid table (one definition)." title={`${a.name} (${a.three})`}>
              <MoleculeSvg height={170} label={`${a.name} structure`} smiles={a.smiles} width={300} />
              <KeyFigures items={[
                { label: "Formula", value: a.formula }, { label: "Classification", value: CLASS_LABEL[cls], note: "standard nominal label" },
                { label: "Skeleton enters at", value: cat.endpoints.map((e) => ENDPOINTS[e].label.split(" / ")[0]).join(", ") }, { label: "Nitrogen goes to", value: cat.nitrogen.destinations.join(", ") || "not traced" },
              ]} />
              <p><strong>Amino group:</strong> {roles.aminoGroup}.</p>
              <p><strong>Carbon skeleton:</strong> {roles.carbonSkeleton}.</p>
              <p><strong>Functional groups:</strong> {roles.functionalGroups.join("; ")}.</p>
              <p data-testid="aa-nitrogen"><strong>Nitrogen route (curated):</strong> {cat.nitrogen.text}</p>
              <p data-testid="aa-skeleton"><strong>Carbon route (curated):</strong> {cat.skeleton}</p>
              {cat.tissueNote ? <p className="ph-note">{cat.tissueNote}</p> : null}
              {cat.reactions.length ? <p className="ph-note">Reactions of the shared network involved: {cat.reactions.map((r) => REACTIONS_BY_ID[r]?.name ?? r).join("; ")}. Other steps are curated relationships, not modelled reactions.</p> : <p className="ph-note">No reaction in the shared network covers this amino acid's route: the relationship is curated only.</p>}
              <Callout tone="warn" title="Not one universal pathway"><p>Amino acids do not share one degradation route: their nitrogen and skeleton are handled differently (compare alanine, glutamine, serine, lysine and arginine).</p></Callout>
            </Panel>
          ) : null}

          {view === "transamination" ? (
            <>
              <div aria-live="polite" className="mt-caption" data-testid="plp-caption">
                <h3>{raw.plpStep === 0 ? `${tm.aminoAcid} + α-ketoglutarate ⇄ ${tm.ketoAcid.name} + glutamate` : plp[raw.plpStep - 1].title}</h3>
                <p>{raw.plpStep === 0 ? `${tm.enzymeName}, with ${plpCoenzyme.name} (${plpCoenzyme.vitamin}). The amino group moves; no free ammonia is made.` : plp[raw.plpStep - 1].text}</p>
                {raw.plpStep > 0 ? <p className="mt-chips" data-testid="plp-state"><span className="mt-chip mt-chip-none">Amino group on: {plp[raw.plpStep - 1].aminoGroupOn}</span> <span className="mt-chip mt-chip-none">Cofactor: {plp[raw.plpStep - 1].plpForm}</span> <span className="mt-chip mt-chip-none">Free NH₃: none</span></p> : null}
              </div>
              <Panel subtitle="Stoichiometry from the shared network and Stage 17 formulas." title="Reaction">
                <p className="mt-eq" data-testid="ta-eq">{AMINO_ACID_LIST.find((x) => x.one === raw.transSubstrate)!.name} + α-KG → {tm.ketoAcid.name} + Glu</p>
                <KeyFigures items={[{ label: "Ammonium released", value: String(tm.ammoniumReleased), note: "transamination makes none" }, { label: "Atoms balance", value: tm.balanced ? "Yes" : "No" }, { label: "Enzyme", value: tm.enzymeName.replace(/ \(.*/, "") }]} />
                <div className="mt-structs">
                  <div className="mt-struct"><MoleculeSvg height={110} label="Amino acid" smiles={AMINO_ACID_LIST.find((x) => x.one === raw.transSubstrate)!.smiles} width={180} /><span className="ph-note">{tm.aminoAcid}</span></div>
                  <div className="mt-struct"><MoleculeSvg height={110} label="Keto acid" smiles={tsub.keto.smiles} width={180} /><span className="ph-note">{tm.ketoAcid.name}{tsub.one === "I" ? " (stereochemistry not drawn)" : ""}</span></div>
                  <div className="mt-struct"><MoleculeSvg height={110} label="Glutamate" smiles={AMINO_ACID_LIST.find((x) => x.one === "E")!.smiles} width={180} /><span className="ph-note">Glutamate</span></div>
                </div>
                {tm.reaction ? <ReactionCard perUnit="per pass" reaction={tm.reaction} reactionId={tm.reaction.id} /> : null}
              </Panel>
            </>
          ) : null}

          {view === "deamination" ? (
            <>
              <Panel subtitle="Mitochondrial matrix; direction and coenzyme chosen on the left." title="Glutamate dehydrogenase">
                <p className="mt-eq" data-testid="gdh-eq">{formatEquation(gdh.net)}</p>
                <KeyFigures items={[{ label: "Ammonium", value: SIGN(gdh.ammonium), note: gdh.ammonium > 0 ? "released" : "taken up" }, { label: raw.gdhCofactor === "nad" ? "NADH" : "NADPH", value: SIGN(gdh.reducedCarrier) }, { label: "Compartment", value: "Mitochondrial matrix" }]} />
                <p>{gdh.text}</p>
                <ReactionCard direction={raw.gdhDirection === "deamination" ? "forward" : "reverse"} perUnit="per pass" reaction={REACTIONS_BY_ID[gdh.reactionId]} reactionId={gdh.reactionId} />
              </Panel>
              <Panel subtitle="Computed from the reactions, not stated." title="Transamination versus oxidative deamination">
                <table className="bc-table" data-testid="ta-vs-da"><thead><tr><th scope="col" /><th scope="col">Transamination</th><th scope="col">Oxidative deamination</th></tr></thead>
                  <tbody>
                    <tr><th scope="row">What moves</th><td>α-Amino group between carbons</td><td>Nitrogen leaves as NH₄⁺</td></tr>
                    <tr><th scope="row">NH₄⁺ released</th><td>{tm.ammoniumReleased}</td><td>{SIGN(glutamateDehydrogenase("nad", "deamination").ammonium)}</td></tr>
                    <tr><th scope="row">Redox change</th><td>none</td><td>NAD(P)⁺ → NAD(P)H</td></tr>
                    <tr><th scope="row">Cofactor</th><td>Pyridoxal phosphate (B₆)</td><td>NAD⁺ or NADP⁺</td></tr>
                  </tbody></table>
                {td ? <p><strong>Together (transdeamination):</strong> {td.text}</p> : null}
              </Panel>
            </>
          ) : null}

          {view === "skeleton" ? (
            <>
              <Panel subtitle={`${a.name}: ${CLASS_LABEL[cls]}`} title="Carbon-skeleton destination">
                <DiagramFrame caption="Curated textbook relationships; intermediate enzymes are deliberately not drawn. Selected amino acid's arrows go to its endpoints." label="Amino-acid carbon-skeleton map" title="Entry points into central metabolism">
                  <ScrollBox focusKey={aa}><GraphDiagram {...aminoMapSpec(aa)} onNode={(id) => { if (id.startsWith("aa-")) set({ aa: id.slice(3) }); }} /></ScrollBox>
                  <GraphLegend items={[{ color: EDGE_COLORS.main, text: "Selected amino acid → its entry point(s)" }]} />
                </DiagramFrame>
                <p data-testid="skeleton-text">{cat.skeleton}</p>
                <ul className="gc-assumptions">{cat.endpoints.map((e) => <li key={e}><strong>{ENDPOINTS[e].label}</strong> ({ENDPOINTS[e].glucogenic ? "gluconeogenic" : "ketogenic"}): {ENDPOINTS[e].note}</li>)}</ul>
                <Callout tone="warn" title="Reading the labels"><p>{CLASSIFICATION_CAVEAT}</p></Callout>
              </Panel>
              <Panel title="All twenty">
                <table className="bc-table" data-testid="class-table"><thead><tr><th scope="col">Amino acid</th><th scope="col">Entry points</th><th scope="col">Class</th></tr></thead>
                  <tbody>{AMINO_ACID_LIST.map((x) => <tr key={x.one}><th scope="row"><button className="ghost-button" onClick={() => set({ aa: x.one })} type="button">{x.name}</button></th><td>{AMINO_CATABOLISM_BY_ONE[x.one].endpoints.map((e) => ENDPOINTS[e].label.split(" / ")[0]).join(", ")}</td><td>{CLASS_LABEL[classifyAminoAcid(x.one)]}</td></tr>)}</tbody></table>
              </Panel>
            </>
          ) : null}

          {view === "nitrogen" ? (
            <>
              <Panel subtitle="Selected, bounded examples; there is no single universal reaction." title="Nitrogen carriers">
                <table className="bc-table"><thead><tr><th scope="col">Carrier</th><th scope="col">Role</th></tr></thead><tbody>{NITROGEN_CARRIERS.map((c) => <tr key={c.id}><th scope="row">{c.label}</th><td>{c.role}</td></tr>)}</tbody></table>
              </Panel>
              {(() => { const ex = NITROGEN_EXAMPLES.find((x) => x.id === raw.nitrogenExample)!; return (
                <Panel subtitle={`${ex.tissues}; carrier: ${ex.carrier}`} title={ex.title}>
                  <ol className="mt-shuttle" data-testid="n-route">{ex.route.map((r) => <li key={r}>{r}</li>)}</ol>
                  <p className="ph-note">{ex.caveat}</p>
                  {ex.reactions.map((r) => <ReactionCard key={r} perUnit="per pass" reactionId={r} />)}
                </Panel>); })()}
            </>
          ) : null}

          {view === "urea" ? (
            <>
              <div aria-live="polite" className="mt-caption" data-testid="urea-caption">
                <h3>{raw.ureaStep === 0 ? "Urea cycle: matrix and cytosol" : `Step ${raw.ureaStep} of ${UREA_CORE.length}: ${REACTIONS_BY_ID[UREA_CORE[raw.ureaStep - 1]].name}`}</h3>
                <p>{raw.ureaStep === 0 ? "Ammonium, CO₂ and aspartate nitrogen become urea; ornithine is regenerated each turn." : REACTIONS_BY_ID[UREA_CORE[raw.ureaStep - 1]].purpose}</p>
                <p className="mt-chips"><span className="ph-note">So far:</span> <span className="mt-chip mt-chip-down" data-testid="urea-atp-so-far">ATP {SIGN(doneNet.atp ?? 0)}</span> <span className="mt-chip mt-chip-down">AMP {SIGN(doneNet.amp ?? 0)}</span> <span className="mt-chip mt-chip-up">Urea {SIGN(doneNet.urea ?? 0)}</span> <span className="mt-chip mt-chip-up">Fumarate {SIGN(doneNet.fumarate ?? 0)}</span></p>
              </div>
              {!raw.nag ? <Callout tone="warn" title="N-acetylglutamate absent"><p>{reg.summary} The diagram still shows the steps; in this state the cycle would not start.</p></Callout> : null}
              <DiagramFrame caption="Matrix on the left, cytosol on the right; purple arrows cross the inner membrane. Blue badge: nitrogen from NH₄⁺; orange: from aspartate." label="Urea cycle diagram" title="Urea cycle by compartment">
                <ScrollBox focusKey={String(raw.ureaStep)}><GraphDiagram {...ureaSpec(raw.ureaStep, selStep)} onEdge={(id) => { if ((UREA_CORE as readonly string[]).includes(id)) set({ selected: id }); }} onNode={() => undefined} /></ScrollBox>
                <GraphLegend items={[{ color: EDGE_COLORS.main, text: "Chemical step" }, { color: EDGE_COLORS.transport, text: "Transport across the inner membrane" }, { color: EDGE_COLORS.cofactor, text: "Second substrate" }]} />
              </DiagramFrame>
              {selStep ? <ReactionCard perUnit="per urea" reactionId={selStep} /> : null}
              <Panel subtitle="Atom tracing from the accepted mechanism, consistent with the formulas." title="Nitrogen ledger">
                <table className="bc-table" data-testid="n-ledger"><thead><tr><th scope="col">Species present after step {raw.ureaStep}</th><th scope="col">Nitrogen atoms and their source</th></tr></thead>
                  <tbody>{trace.map((t) => <tr key={t.metabolite}><th scope="row">{name(t.metabolite)}</th><td>{t.nitrogens.length ? t.nitrogens.map((n) => n.source).join("; ") : "none"}{t.carbonSource ? ` · carbon: ${t.carbonSource}` : ""}</td></tr>)}</tbody></table>
                <ul className="gc-assumptions" data-testid="urea-sources"><li>{UREA_NITROGEN_SOURCES.ammonium}.</li><li>{UREA_NITROGEN_SOURCES.aspartate}.</li><li>{UREA_NITROGEN_SOURCES.carbon}.</li></ul>
              </Panel>
              <Panel subtitle="Three ATP molecules, four high-energy bonds." title="Energy accounting">
                <KeyFigures items={[{ label: "ATP molecules consumed", value: String(energy.atpMolecules) }, { label: "High-energy bonds spent", value: String(energy.highEnergyBonds) }, { label: "AMP formed", value: String(energy.amp) }, { label: "ADP formed", value: String(energy.adp) }]} />
                <table className="bc-table" data-testid="urea-energy"><thead><tr><th scope="col">Step</th><th scope="col">ATP molecules</th><th scope="col">Bonds</th></tr></thead>
                  <tbody>{energy.perStep.map((s) => <tr key={s.reactionId}><th scope="row">{REACTIONS_BY_ID[s.reactionId].name}</th><td>{SIGN(s.atp)}</td><td>{SIGN(s.bonds)}</td></tr>)}<tr><th scope="row">Total</th><td>{SIGN(-energy.atpMolecules)}</td><td>{SIGN(-energy.highEnergyBonds)}</td></tr></tbody></table>
                <p>{energy.explanation}</p>
                <p className="mt-eq" data-testid="urea-net">{formatEquation(ureaNet())}</p>
                <Callout tone="info" title="Separate accounting: the fumarate connection"><p>Fumarate → malate → oxaloacetate → aspartate gives {conn.nadh} NADH (≈ {conn.atpEstimate} ATP equivalents if fully oxidized). {conn.note} Under that assumption the cycle's net cost would be about {conn.estimatedNetBondEquivalents} bond equivalents; the urea cycle itself still consumes 3 ATP and makes no ATP.</p></Callout>
              </Panel>
              <Panel subtitle="Qualitative; relative to the reference state." title="Regulation of CPS I">
                <table className="bc-table" data-testid="urea-reg"><tbody><tr><th scope="row">NAGS</th><td><TendencyBadge tendency={reg.nags} /></td></tr><tr><th scope="row">N-acetylglutamate</th><td><TendencyBadge tendency={reg.nag} /></td></tr><tr><th scope="row">CPS I</th><td><TendencyBadge tendency={reg.cps1} /></td></tr></tbody></table>
                <p>{reg.summary}</p>
                <p>{AMMONIUM_UREA_LINK}</p>
                <ul className="gc-assumptions">{UREA_CAVEATS.map((c) => <li key={c}>{c}</li>)}</ul>
                <ReactionCard perUnit="per pass" reactionId="NAGS" />
              </Panel>
              <Panel title="Steps and compartments">
                <ol className="mt-shuttle">{steps.map((s) => <li aria-current={raw.ureaStep === s.index} key={s.reactionId}>{s.title} <Badge tone="info">{s.compartment === "inner-membrane" ? "Transport across the inner membrane" : s.compartment === "matrix" ? "Mitochondrial matrix" : "Cytosol"}</Badge></li>)}</ol>
              </Panel>
            </>
          ) : null}

          {mode === "practice" ? <QuizPanel questions={questions} /> : null}
          {mode === "challenge" ? (
            <ChallengePanel index={raw.challenge} items={challenges} onNext={() => set({ challenge: raw.challenge + 1 })} onReveal={(p) => set({ view: p.view, ...(p.aa ? { aa: p.aa } : {}), ...(p.nag !== undefined ? { nag: p.nag } : {}), ...(p.arginine ? { arginine: p.arginine } : {}) })} />
          ) : null}
          <AssumptionsPanel items={AMINO_ASSUMPTIONS} />
          <EvidencePanel id="biochem-urea-cycle" />
          <ProvenancePanel topics={["amino", "urea"]} />
        </div>
      </div>
      <RelatedConcepts limit={5} subject="biochemistry" toolId="bcAminoMetabolism" />
    </div>
  );
}
