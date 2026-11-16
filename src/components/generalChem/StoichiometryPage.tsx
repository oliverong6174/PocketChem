import { useMemo } from "react";
import { RelatedConcepts } from "../ui/RelatedConcepts";
import "../../styles/generalChem.css";
import "../../styles/physics.css";
import "../../styles/chem22.css";
import { LearningModeSwitch } from "../ui/LearningModeSwitch";
import { Badge, Callout, DiagramFrame, Disclosure, KeyFigures, Panel, Segmented, ToolHeader } from "../ui/primitives";
import { ParamSlider } from "../physics/sim";
import { NumberField, Paragraphs, TextField } from "./shared";
import { QuestionPanel } from "./QuestionPanel";
import { LedgerBars, ParticlePicture } from "./StoichDiagrams";
import { useGcWorkspace } from "./useGcWorkspace";
import { balanceEquation, conservation, isLowestTerms, parseEquation, type Equation } from "../../utils/generalChem/balance";
import { FORMULA_SYNTAX, formatCounts, prettyFormula } from "../../utils/generalChem/formula";
import { formatSig } from "../../utils/generalChem/format";
import { STOICH_ASSUMPTIONS, STOICH_CHALLENGE, STOICH_PRACTICE, formatReaction, stoichLessons, stoichState, summarizeStoich } from "../../utils/generalChem/chem22Learning";
import { amountToMoles, concentrationsAfterMixing, percentYield, resolveReaction, solveDilution, type AmountSpec, type DilutionUnknown, type ReactionModel } from "../../utils/generalChem/stoichiometry";
import {
  DEFAULT_STOICH_INPUTS, STOICHIOMETRY_ENGINE_VERSION, STOICH_VIEW_LABEL, STOICH_VIEWS, describeStoichAnalysis, validateGcResults22, validateStoichInputs, type StoichInputs, type StoichView,
} from "../../utils/persistence/gcTools22";

type Props = { openRequest?: { id: string; recordId: string } | null; onOpenHandled?: (requestId: string) => void };
const g = (v: number, sig = 4) => formatSig(v, sig);

const PRESETS: Array<{ label: string; equation: string }> = [
  { label: "Water from H₂ and O₂", equation: "H2 + O2 -> H2O" },
  { label: "Propane combustion", equation: "C3H8 + O2 -> CO2 + H2O" },
  { label: "Haber process", equation: "N2 + H2 -> NH3" },
  { label: "Aluminium and HCl", equation: "Al + HCl -> AlCl3 + H2" },
  { label: "Limestone and acid", equation: "CaCO3 + HCl -> CaCl2 + H2O + CO2" },
  { label: "Silver chloride precipitation", equation: "AgNO3 + NaCl -> AgCl + NaNO3" },
  { label: "Neutralisation", equation: "HCl + Ca(OH)2 -> CaCl2 + H2O" },
  { label: "Permanganate and iron(II)", equation: "MnO4^- + Fe^2+ + H^+ -> Mn^2+ + Fe^3+ + H2O" },
];
const resize = (amounts: AmountSpec[], n: number): AmountSpec[] => Array.from({ length: n }, (_, k) => amounts[k] ?? { mode: "mol", value: 1, purity: 100, M: 1, mL: 100 });

export default function StoichiometryPage({ openRequest = null, onOpenHandled }: Props) {
  const ws = useGcWorkspace<StoichInputs>({
    page: "stoichiometry",
    engineVersion: STOICHIOMETRY_ENGINE_VERSION,
    defaults: DEFAULT_STOICH_INPUTS,
    validateInputs: validateStoichInputs,
    validateResults: validateGcResults22,
    summarize: summarizeStoich,
    describe: describeStoichAnalysis,
    fallbackName: "Stoichiometry analysis",
    openRequest,
    onOpenHandled,
  });
  const { raw, update } = ws;
  const mode = raw.learn.mode;
  const setLearn = (patch: Partial<StoichInputs["learn"]>) => update((c) => ({ ...c, learn: { ...c.learn, ...patch } }));

  const parsed = useMemo(() => parseEquation(raw.equation), [raw.equation]);
  const rxnRes = useMemo(() => resolveReaction(raw.equation), [raw.equation]);
  const auto = useMemo(() => (parsed.ok ? balanceEquation(parsed.value) : null), [parsed]);
  const state = useMemo(() => stoichState(raw), [raw]);
  const lessons = useMemo(() => (ws.valid ? stoichLessons(ws.valid) : []), [ws.valid]);

  const setEquation = (text: string) => update((c) => {
    const p = parseEquation(text);
    const nR = p.ok ? p.value.reactants.length : c.amounts.length;
    const nP = p.ok ? p.value.products.length : 1;
    return { ...c, equation: text, amounts: resize(c.amounts, nR), manual: [], yieldProduct: Math.min(c.yieldProduct, Math.max(0, nP - 1)) };
  });
  const loadPreset = (equation: string) => update((c) => {
    const r = resolveReaction(equation);
    if (!r.ok) return c;
    const amounts: AmountSpec[] = r.value.reactants.map((s, k) => ({ mode: "mol", value: Math.round(s.coeff * (k === 0 ? 1 : 1.5) * 1000) / 1000, purity: 100, M: 1, mL: 100 }));
    return { ...c, equation, amounts, manual: [], yieldProduct: 0, actualOn: false };
  });
  const setAmount = (k: number, patch: Partial<AmountSpec>) => update((c) => ({ ...c, amounts: c.amounts.map((a, j) => (j === k ? { ...a, ...patch } : a)) }));
  const amountError = (k: number): string | null => {
    if (!rxnRes.ok || !rxnRes.value.reactants[k]) return null;
    const m = amountToMoles(raw.amounts[k], rxnRes.value.reactants[k].mass);
    return m.ok ? null : m.error;
  };
  const rxn = state?.rxn ?? (rxnRes.ok ? rxnRes.value : null);
  const result = state?.result ?? null;
  const dil = useMemo(() => solveDilution(raw.dilution), [raw.dilution]);
  const mix = result ? concentrationsAfterMixing(result) : null;
  const yieldInfo = result && raw.actualOn ? percentYield(result, raw.yieldProduct, raw.actualG) : null;
  const eqSpecies = parsed.ok ? [...parsed.value.reactants, ...parsed.value.products] : [];
  const nReact = parsed.ok ? parsed.value.reactants.length : 0;
  const manual = raw.manual;
  const manualRows = parsed.ok && manual.length === eqSpecies.length ? conservation(parsed.value, manual) : null;
  const manualOk = manualRows ? manualRows.every((r) => r.balanced) && manual.every((c) => c >= 1) : false;

  const setView = (view: StoichView) => update((c) => ({ ...c, view }));
  const setUnknown = (unknown: DilutionUnknown) => update((c) => ({ ...c, dilution: { ...c.dilution, unknown } }));
  const setDil = (k: "M1" | "V1" | "M2" | "V2", v: number) => update((c) => ({ ...c, dilution: { ...c.dilution, [k]: v } }));

  return (
    <div className="gc-page ph-page">
      <ToolHeader
        group="Analyze"
        title="Stoichiometry"
        purpose="Balance a reaction you supply, then use the mole ratios of the balanced equation for limiting reagents, theoretical and percent yield, and solutions."
        evidence="model"
        steps={[
          { label: "Enter a reaction", detail: "Formulas with ( ), hydrates and ionic charges; coefficients optional." },
          { label: "Give the amounts", detail: "Moles, grams (with purity) or a solution (molarity and volume)." },
          { label: "Read the ledger", detail: "One reaction extent sets the limiting reagent, leftovers and every yield." },
        ]}
        aside={<Badge tone="neutral" title="A supplied reaction is balanced; no reaction is predicted.">balancing, not prediction</Badge>}
      />
      {ws.chrome}
      <div className="gc-toolbar">
        <LearningModeSwitch
          blurbs={{ explore: "Inspect species, coefficients, mole ratios and conservation.", practice: "Balance, find limiting reagents and yields; answer, then see the working.", challenge: "Predict the limiting reagent or maximum yield before the ledger is opened." }}
          mode={mode}
          modes={["explore", "practice", "challenge"]}
          onChange={(m) => setLearn({ mode: m })}
        />
        {ws.actions}
      </div>
      {ws.saveFormEl}

      <div className="gc-layout">
        <Panel className="gc-inputs" subtitle="Separate species with spaces around the plus. Coefficients are optional." title="Reaction">
          <div className="gc-presets" role="group" aria-label="Example reactions">
            {PRESETS.map((p) => <button className="secondary-button gc-chip" key={p.equation} onClick={() => loadPreset(p.equation)} type="button">{p.label}</button>)}
          </div>
          <TextField error={rxnRes.ok ? null : rxnRes.error} hint="Arrow: ->, → or =. Charges: Fe^3+, SO4^2-, OH-. Hydrate: CuSO4.5H2O." label="Equation" mono onChange={setEquation} value={raw.equation} />
          <Segmented<StoichView> label="What to work on" onChange={setView} options={STOICH_VIEWS.map((v) => ({ id: v, label: STOICH_VIEW_LABEL[v] }))} value={raw.view} />
          <Disclosure summary="Formula syntax that is accepted"><ul className="gc-assumptions">{FORMULA_SYNTAX.map((x) => <li key={x}>{x}</li>)}</ul></Disclosure>

          {raw.view !== "balance" && parsed.ok ? (
            <div className="chem-amounts">
              <h3 className="chem-h3">Reactant amounts</h3>
              {parsed.value.reactants.map((sp, k) => {
                const a = raw.amounts[k];
                if (!a) return null;
                const err = amountError(k);
                const moles = rxnRes.ok ? amountToMoles(a, rxnRes.value.reactants[k].mass) : null;
                return (
                  <fieldset className="chem-amount" key={`${sp.text}-${k}`}>
                    <legend>{prettyFormula(sp.text)}</legend>
                    <div className="chem-amount-mode">
                      <label htmlFor={`amode-${k}`}>Given as</label>
                      <select id={`amode-${k}`} onChange={(e) => setAmount(k, { mode: e.target.value as AmountSpec["mode"] })} value={a.mode}>
                        <option value="mol">moles</option><option value="g">grams</option><option value="soln">solution (M and mL)</option>
                      </select>
                    </div>
                    {a.mode === "mol" ? (
                      <>
                        <NumberField error={err} label="Amount" onChange={(value) => setAmount(k, { value })} unit="mol" value={a.value} />
                        <ParamSlider format={(v) => `${g(v, 3)} mol`} label="Adjust" max={Math.max(10, a.value * 2 || 10)} min={0} onChange={(value) => setAmount(k, { value: Math.round(value * 100) / 100 })} step={0.05} value={Number.isFinite(a.value) ? a.value : 0} />
                      </>
                    ) : a.mode === "g" ? (
                      <>
                        <NumberField error={err} label="Mass of the sample" onChange={(value) => setAmount(k, { value })} unit="g" value={a.value} />
                        <NumberField hint="Mass percent of this reactant in the sample" label="Purity" onChange={(purity) => setAmount(k, { purity })} unit="%" value={a.purity} />
                        <ParamSlider format={(v) => `${g(v, 3)} g`} label="Adjust" max={Math.max(50, a.value * 2 || 50)} min={0} onChange={(value) => setAmount(k, { value: Math.round(value * 10) / 10 })} step={0.5} value={Number.isFinite(a.value) ? a.value : 0} />
                      </>
                    ) : (
                      <>
                        <NumberField error={err} label="Molarity" onChange={(M) => setAmount(k, { M })} unit="mol/L" value={a.M} />
                        <NumberField label="Volume" onChange={(mL) => setAmount(k, { mL })} unit="mL" value={a.mL} />
                      </>
                    )}
                    {moles && moles.ok ? <p className="gc-field-hint">= {g(moles.moles)} mol = {g(moles.grams)} g of pure {prettyFormula(sp.text)} (molar mass {g(rxnRes.ok ? rxnRes.value.reactants[k].mass : 0)} g/mol)</p> : null}
                  </fieldset>
                );
              })}
            </div>
          ) : null}
        </Panel>

        <div className="gc-stage">
          {!rxnRes.ok ? (
            <Callout tone="danger" title="This equation cannot be used yet"><p>{rxnRes.error}</p></Callout>
          ) : null}

          {raw.view === "balance" && parsed.ok ? (
            <>
              {auto?.ok ? (
                <Callout tone="ok" title="Balanced equation">
                  <p className="chem-equation" data-testid="balanced">{formatReaction({ ...rxnFromBalance(parsed.value, auto.coefficients), equation: parsed.value, balancedBy: "auto", lowestTerms: true })}</p>
                  <p>{auto.note}</p>
                  <button className="secondary-button" onClick={() => update((c) => ({ ...c, equation: equationWith(parsed.value, auto.coefficients), manual: [] }))} type="button">Write these coefficients into the equation</button>
                </Callout>
              ) : auto ? (
                <Callout tone="warn" title={auto.kind === "underdetermined" ? "Underdetermined: no coefficients returned" : auto.kind === "none" ? "No balancing exists for these species" : "Cannot be balanced as written"}><p data-testid="balance-error">{auto.error}</p></Callout>
              ) : null}
              <Panel subtitle="Try your own coefficients; the table counts every element and the charge on each side." title="Check coefficients by hand">
                <div className="chem-coeff-row">
                  {eqSpecies.map((sp, k) => (
                    <div className="chem-coeff" key={`${sp.text}-${k}`}>
                      {k === nReact ? <span aria-hidden="true" className="chem-arrow">→</span> : k > 0 ? <span aria-hidden="true" className="chem-plus">+</span> : null}
                      <label htmlFor={`coef-${k}`}>coefficient of {prettyFormula(sp.text)}</label>
                      <input id={`coef-${k}`} max={999} min={0} onChange={(e) => update((c) => ({ ...c, manual: (c.manual.length === eqSpecies.length ? c.manual : eqSpecies.map(() => 1)).map((v, j) => (j === k ? Math.max(0, Math.min(999, Math.round(Number(e.target.value) || 0))) : v)) }))} type="number" value={manual.length === eqSpecies.length ? manual[k] : ""} placeholder="–" />
                      <span aria-hidden="true" className="chem-coeff-formula">{prettyFormula(sp.text)}</span>
                    </div>
                  ))}
                </div>
                <div className="gc-toolbar-actions">
                  <button className="secondary-button" onClick={() => update((c) => ({ ...c, manual: eqSpecies.map(() => 1) }))} type="button">Start from 1 each</button>
                  <button className="ghost-button" onClick={() => update((c) => ({ ...c, manual: [] }))} type="button">Clear</button>
                </div>
                {manualRows ? (
                  <>
                    <div className="gc-table-scroll">
                      <table className="gc-table ph-table" data-testid="conservation">
                        <thead><tr><th scope="col">Atom or charge</th><th scope="col">Left</th><th scope="col">Right</th><th scope="col">Balanced?</th></tr></thead>
                        <tbody>{manualRows.map((r) => <tr key={r.label}><th scope="row">{r.label}</th><td>{r.left}</td><td>{r.right}</td><td>{r.balanced ? "✓ yes" : "✗ no"}</td></tr>)}</tbody>
                      </table>
                    </div>
                    <Callout tone={manualOk ? (isLowestTerms(manual) ? "ok" : "warn") : "warn"} title={manualOk ? (isLowestTerms(manual) ? "Balanced, in the smallest whole numbers" : "Balanced, but not in the smallest whole numbers") : manual.some((c) => c < 1) ? "Every species needs a coefficient of at least 1" : "Not balanced yet"}>
                      <p data-testid="manual-status">{manualOk ? "Every atom and the charge match on both sides." : "Change coefficients (never subscripts) until every row matches."}</p>
                    </Callout>
                  </>
                ) : <p className="gc-field-hint">Enter a coefficient for each species to see the atom and charge count.</p>}
              </Panel>
              <Panel subtitle="Each formula is read by the parser; masses use the atomic-mass table." title="Species">
                <div className="gc-table-scroll">
                  <table className="gc-table ph-table" data-testid="species">
                    <thead><tr><th scope="col">Formula</th><th scope="col">Atoms</th><th scope="col">Charge</th><th scope="col">Molar mass</th></tr></thead>
                    <tbody>{eqSpecies.map((sp, k) => <tr key={`${sp.text}-${k}`}><th scope="row">{prettyFormula(sp.text)}</th><td>{formatCounts(sp.parsed.counts) || "—"}</td><td>{sp.parsed.charge === 0 ? "0" : sp.parsed.charge > 0 ? `+${sp.parsed.charge}` : `${sp.parsed.charge}`}</td><td>{sp.parsed.electron ? "≈ 0" : `${g(sp.parsed.mass, 5)} g/mol`}</td></tr>)}</tbody>
                  </table>
                </div>
              </Panel>
            </>
          ) : null}

          {raw.view !== "balance" && rxn && result ? (
            <>
              <Callout tone={result.extent === 0 ? "warn" : "info"} title={result.extent === 0 ? "Nothing reacts: a reactant is absent" : result.exact ? "A stoichiometric mixture: every reactant is used up together" : `Limiting reactant: ${result.limiting.map((k) => prettyFormula(rxn.reactants[k].text)).join(", ")}`}>
                <p className="chem-equation">{formatReaction(rxn)}</p>
                <p>{result.extent === 0 ? "A reaction extent of 0 means no product forms." : `Reaction extent ξ = ${g(result.extent)} mol. Each reactant's amount ÷ its coefficient is ${result.ledger.filter((r) => r.role === "reactant").map((r) => `${prettyFormula(r.text)} ${g(r.capacity as number)}`).join(", ")} mol; the smallest sets ξ.`}</p>
              </Callout>
              <DiagramFrame caption="The same ledger drives the bars, the particle picture and the table below." label="Amount ledger" title="Before and after the reaction">
                <LedgerBars result={result} />
              </DiagramFrame>
              <KeyFigures items={[
                { label: "Reaction extent", value: `${g(result.extent)} mol`, note: "the smallest amount ÷ coefficient" },
                { label: "Limiting", value: result.exact ? "all (exact ratio)" : result.limiting.map((k) => prettyFormula(rxn.reactants[k].text)).join(", ") },
                ...result.ledger.filter((r) => r.role === "product").map((r) => ({ label: `Theoretical ${prettyFormula(r.text)}`, value: `${g(r.finalG)} g`, note: `${g(r.finalMol)} mol` })),
                ...(yieldInfo && !("error" in yieldInfo) ? [{ label: "Percent yield", value: yieldInfo.percent === null ? "—" : `${g(yieldInfo.percent, 4)} %`, note: "actual ÷ theoretical" }] : []),
              ]} />
              <Panel subtitle="Moles and masses before and after; excess reactant is what is left." title="Ledger">
                <div className="gc-table-scroll">
                  <table className="gc-table ph-table" data-testid="ledger">
                    <thead><tr><th scope="col">Species</th><th scope="col">Coefficient</th><th scope="col">Molar mass (g/mol)</th><th scope="col">Before (mol)</th><th scope="col">After (mol)</th><th scope="col">After (g)</th><th scope="col">Role</th></tr></thead>
                    <tbody>{result.ledger.map((r) => <tr key={r.text}><th scope="row">{prettyFormula(r.text)}</th><td>{r.coeff}</td><td>{g(r.molarMass, 5)}</td><td>{g(r.initialMol)}</td><td>{g(r.finalMol)}</td><td>{g(r.finalG)}</td><td>{r.role === "product" ? "product" : r.limiting ? "limiting" : r.excess ? "excess" : "used up"}</td></tr>)}</tbody>
                  </table>
                </div>
              </Panel>
              <DiagramFrame caption="Schematic particle counts from the ledger above; not a molecular-scale simulation." label="Particle picture" title="Particle picture (schematic)">
                <ParticlePicture result={result} />
              </DiagramFrame>
              {raw.view === "limiting" ? (
                <Panel subtitle="Theoretical yield is a calculation; an actual yield is a measurement you supply." title="Yield">
                  <div className="chem-yield-row">
                    <div className="gc-field">
                      <label htmlFor="yield-product">Product</label>
                      <select id="yield-product" onChange={(e) => update((c) => ({ ...c, yieldProduct: Number(e.target.value) }))} value={raw.yieldProduct}>
                        {rxn.products.map((p, k) => <option key={p.text} value={k}>{prettyFormula(p.text)}</option>)}
                      </select>
                    </div>
                    <label className="gc-check"><input checked={raw.actualOn} onChange={(e) => update((c) => ({ ...c, actualOn: e.target.checked }))} type="checkbox" /> I measured an actual yield</label>
                    {raw.actualOn ? <NumberField label="Actual yield (mass collected)" onChange={(actualG) => update((c) => ({ ...c, actualG }))} unit="g" value={raw.actualG} /> : null}
                  </div>
                  {yieldInfo && "error" in yieldInfo ? <Callout tone="danger" title="Check the actual yield"><p>{yieldInfo.error}</p></Callout> : null}
                  {yieldInfo && !("error" in yieldInfo) ? (
                    <Callout tone={yieldInfo.over100 ? "warn" : "info"} title={yieldInfo.percent === null ? "No theoretical yield to compare with" : `Percent yield ${g(yieldInfo.percent, 4)} %`}>
                      <p data-testid="percent-yield">Actual {g(yieldInfo.actualG)} g ÷ theoretical {g(yieldInfo.theoreticalG)} g × 100.</p>
                      {yieldInfo.over100 ? <p>A yield above 100 % is not a chemical result. It usually points to a wet or impure product, an arithmetic error, or the wrong limiting reagent.</p> : null}
                    </Callout>
                  ) : null}
                </Panel>
              ) : null}
              {raw.view === "solution" ? (
                <>
                  <Panel subtitle="Reactive mixing changes the amounts of the species; dilution does not." title="Mixing reactive solutions">
                    {mix ? (
                      <div className="gc-table-scroll">
                        <table className="gc-table ph-table" data-testid="mixing">
                          <thead><tr><th scope="col">Species after reaction</th><th scope="col">Concentration (mol/L)</th></tr></thead>
                          <tbody>{mix.map((r) => <tr key={r.text}><th scope="row">{prettyFormula(r.text)} ({r.role})</th><td>{g(r.M)}</td></tr>)}</tbody>
                        </table>
                      </div>
                    ) : <p>Give every reactant as a solution (molarity and volume) to see concentrations after mixing.</p>}
                    <p className="gc-field-hint">Volumes are taken as additive{result.totalMl ? `: ${g(result.totalMl)} mL in total` : ""}. The reaction is taken to go to completion, with no equilibrium; for weak acids and bases use Acid–base & titration.</p>
                    <button className="secondary-button" onClick={() => update((c) => ({ ...c, amounts: c.amounts.map((a) => ({ ...a, mode: "soln" })) }))} type="button">Give every reactant as a solution</button>
                  </Panel>
                  <Panel subtitle="M₁V₁ = M₂V₂: only solvent is added; the moles of solute are unchanged." title="Dilution calculator">
                    <Segmented<DilutionUnknown> label="Solve for" onChange={setUnknown} options={[{ id: "M2", label: "final M₂" }, { id: "V2", label: "final V₂" }, { id: "V1", label: "stock V₁" }, { id: "M1", label: "stock M₁" }]} value={raw.dilution.unknown} />
                    <div className="chem-dil-grid">
                      {(["M1", "V1", "M2", "V2"] as const).map((k) => (
                        raw.dilution.unknown === k
                          ? <NumberField disabled key={k} label={`${k.startsWith("M") ? "Molarity" : "Volume"} ${k[0]}${k[1] === "1" ? "₁" : "₂"} (answer)`} onChange={() => undefined} unit={k.startsWith("M") ? "mol/L" : "mL"} value={dil.ok ? dil.value : NaN} />
                          : <NumberField key={k} label={`${k.startsWith("M") ? "Molarity" : "Volume"} ${k[0]}${k[1] === "1" ? "₁" : "₂"}`} onChange={(v) => setDil(k, v)} unit={k.startsWith("M") ? "mol/L" : "mL"} value={raw.dilution[k]} />
                      ))}
                    </div>
                    {dil.ok ? (
                      <Callout tone="info" title={`${raw.dilution.unknown} = ${g(dil.value)}`}>
                        <p data-testid="dilution">Solute: {g(dil.solute)} mol, the same before and after. Solvent added: {g(dil.solventAdded ?? NaN)} mL.</p>
                      </Callout>
                    ) : <Callout tone="danger" title="This is not a dilution"><p>{dil.error}</p></Callout>}
                  </Panel>
                </>
              ) : null}
            </>
          ) : null}

          {raw.view !== "balance" && !result && rxnRes.ok ? (
            <Callout tone="danger" title="Fix the amounts to see the ledger"><ul>{rxnRes.value.reactants.map((_, k) => amountError(k)).filter(Boolean).map((e) => <li key={e}>{e}</li>)}</ul></Callout>
          ) : null}

          {mode === "practice" ? (
            <QuestionPanel current={raw} index={raw.learn.practice} onIndex={(practice) => setLearn({ practice })} onLoad={(next) => update(() => next)} questions={STOICH_PRACTICE} subtitle="Work it out, type your answer, then check. The answer comes from the same model as the tool." title="Practice" />
          ) : mode === "challenge" ? (
            <QuestionPanel current={raw} index={raw.learn.challenge} onIndex={(challenge) => setLearn({ challenge })} onLoad={(next) => update(() => next)} questions={STOICH_CHALLENGE} subtitle="Press “Set this up in the tool”, look at the amounts, and predict before opening the ledger." title="Challenge: predict first" />
          ) : lessons.length ? (
            <Panel subtitle="Each answer quotes the numbers for the reaction you have entered." title="Why does it work this way?">
              {lessons.map((l) => <Disclosure key={l.id} summary={l.title}><Paragraphs items={l.body} /></Disclosure>)}
            </Panel>
          ) : null}
        </div>
      </div>

      <Panel subtitle="What this tool does and does not model." title="Assumptions and limits">
        <ul className="gc-assumptions">{STOICH_ASSUMPTIONS.map((a) => <li key={a}>{a}</li>)}</ul>
        <p className="gc-field-hint">Atomic masses are abridged IUPAC conventional values (4–5 significant figures); see the source note in the code and handoff.</p>
      </Panel>
      <RelatedConcepts subject="general" toolId="gcStoichiometry" />
    </div>
  );
}

function rxnFromBalance(eq: Equation, coeffs: number[]): Pick<ReactionModel, "reactants" | "products"> {
  const nR = eq.reactants.length;
  const sp = (s: Equation["reactants"][number], k: number) => ({ text: s.text, coeff: coeffs[k], mass: s.parsed.mass, charge: s.parsed.charge });
  return { reactants: eq.reactants.map((s, k) => sp(s, k)), products: eq.products.map((s, k) => sp(s, nR + k)) };
}
function equationWith(eq: Equation, coeffs: number[]): string {
  const nR = eq.reactants.length;
  const side = (list: Equation["reactants"], off: number) => list.map((s, k) => `${coeffs[off + k] === 1 ? "" : `${coeffs[off + k]} `}${s.text}`).join(" + ");
  return `${side(eq.reactants, 0)} -> ${side(eq.products, nR)}`;
}
