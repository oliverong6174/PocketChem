import { useEffect, useMemo, useState } from "react";
import MoleculeDrawer, { type KetcherApi } from "./MoleculeDrawer";
import {
  analyzeFunctionalGroupHierarchy,
  getAntiDiolSvg,
  getCondensedSulfonateSvg,
  getGenericHalogenSvg,
  getSynDiolSvg,
} from "../utils/functionalGroups";
import { analyzeNomenclatureAndProperties } from "../utils/nomenclatureUtils";
import {
  getSequentialConditionOptions,
  reactionRegistry,
  runSequentialSynthesis,
  type SequentialConditionOption,
  type SequentialSynthesisBranch,
  type SequentialSynthesisStep,
} from "../utils/reactionUtils";

const MAX_SEARCH_RESULTS = 14;

type SvgMap = Record<string, string | null>;

function isGenericHalogenRuleId(ruleId: string): boolean {
  return (
    /^alkene-hx-addition-/.test(ruleId) ||
    /^alkyne-(hcl|hbr|hi)-addition-/.test(ruleId) ||
    /^alkyne-(bromination|chlorination)-/.test(ruleId) ||
    ruleId === "alkene-halogenation-bromine" ||
    ruleId === "alkene-halohydrin-formation" ||
    ruleId === "alkene-haloether-formation" ||
    ruleId === "alkene-allylic-bromination"
  );
}

function rendererForStep(step: SequentialSynthesisStep) {
  if (step.ruleId === "alkene-syn-dihydroxylation") return getSynDiolSvg;
  if (step.ruleId === "alkene-anti-dihydroxylation") return getAntiDiolSvg;
  if (isGenericHalogenRuleId(step.ruleId)) return getGenericHalogenSvg;
  return getCondensedSulfonateSvg;
}

async function moleculeDisplayName(smiles: string): Promise<string> {
  try {
    const hierarchy = await analyzeFunctionalGroupHierarchy(smiles);
    const functionalGroups = hierarchy.functionalGroups ?? [];
    const identity = await analyzeNomenclatureAndProperties(
      smiles,
      hierarchy.primaryGroups,
      hierarchy.mainGroup ?? functionalGroups[0] ?? null,
    );
    return (
      identity.nomenclature.displayName ||
      identity.nomenclature.estimatedName ||
      "Unnamed structure"
    );
  } catch {
    return "Unnamed structure";
  }
}

export default function MultiCatalyticPage() {
  const [ketcher, setKetcher] = useState<KetcherApi | null>(null);
  const [query, setQuery] = useState("");
  const [sequence, setSequence] = useState<SequentialConditionOption[]>([]);
  const [branches, setBranches] = useState<SequentialSynthesisBranch[]>([]);
  const [startingSmiles, setStartingSmiles] = useState("");
  const [startingName, setStartingName] = useState("");
  const [svgs, setSvgs] = useState<SvgMap>({});
  const [isRunning, setIsRunning] = useState(false);
  const [status, setStatus] = useState("Draw one starting molecule, then build a reagent sequence.");
  const [error, setError] = useState<string | null>(null);

  const allOptions = useMemo(
    () => getSequentialConditionOptions(reactionRegistry),
    [],
  );

  const searchResults = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const source = normalized
      ? allOptions.filter((option) => option.searchText.includes(normalized))
      : allOptions;
    return source.slice(0, MAX_SEARCH_RESULTS);
  }, [allOptions, query]);

  useEffect(() => {
    let cancelled = false;

    async function buildSvgs() {
      const next: SvgMap = {};
      if (startingSmiles) {
        next.start = await getCondensedSulfonateSvg(startingSmiles);
      }

      for (const branch of branches) {
        for (const step of branch.steps) {
          if (step.status === "no-reaction") continue;
          const renderer = rendererForStep(step);
          next[`${branch.id}-${step.stepNumber}`] = await renderer(step.productSmiles);
        }
      }

      if (!cancelled) setSvgs(next);
    }

    void buildSvgs();
    return () => {
      cancelled = true;
    };
  }, [branches, startingSmiles]);

  function addCondition(option: SequentialConditionOption) {
    setSequence((current) => [...current, option]);
    setQuery("");
    setBranches([]);
    setStatus("Sequence changed. Run it again to compute products.");
  }

  function moveCondition(index: number, direction: -1 | 1) {
    setSequence((current) => {
      const next = [...current];
      const destination = index + direction;
      if (destination < 0 || destination >= next.length) return current;
      [next[index], next[destination]] = [next[destination], next[index]];
      return next;
    });
    setBranches([]);
  }

  function removeCondition(index: number) {
    setSequence((current) => current.filter((_, currentIndex) => currentIndex !== index));
    setBranches([]);
  }

  async function runSequence() {
    if (!ketcher || isRunning) return;
    setError(null);

    if (sequence.length === 0) {
      setError("Add at least one reagent/catalyst condition to the sequence.");
      return;
    }

    setIsRunning(true);
    setStatus("Applying the selected conditions in order…");

    try {
      const smiles = (await ketcher.getSmiles()).trim();
      if (!smiles) {
        setError("Draw a starting molecule first.");
        setStatus("No starting molecule was found.");
        return;
      }
      if (smiles.includes(".")) {
        setError(
          "Multi-Catalytic Synthesis starts from one molecule. Draw only one connected starting structure on this page.",
        );
        setStatus("This page requires one connected starting molecule.");
        return;
      }

      setStartingSmiles(smiles);
      setStartingName(await moleculeDisplayName(smiles));

      const results = await runSequentialSynthesis(
        smiles,
        sequence.map((condition) => condition.ruleId),
        reactionRegistry,
        { branchLimit: 6 },
      );
      setBranches(results);
      setStatus(
        results.length === 0
          ? "No sequence result was generated."
          : `${results.length} sequence outcome${results.length === 1 ? "" : "s"} computed.`,
      );
    } catch (runError) {
      console.error("Multi-catalytic synthesis failed:", runError);
      setError("The reagent sequence could not be computed. Check the structure and try again.");
      setStatus("Sequence calculation failed.");
    } finally {
      setIsRunning(false);
    }
  }

  async function clearPage() {
    await ketcher?.setMolecule("");
    setQuery("");
    setSequence([]);
    setBranches([]);
    setStartingSmiles("");
    setStartingName("");
    setSvgs({});
    setError(null);
    setStatus("Draw one starting molecule, then build a reagent sequence.");
  }

  return (
    <section className="card multicatalytic-page-card">
      <div className="card-header">
        <div>
          <h2>Multi-Catalytic Synthesis</h2>
          <p>
            Start with one molecule and apply an ordered reagent/catalyst sequence.
            A NO REACTION step leaves the molecule unchanged and continues to the next condition.
          </p>
        </div>
        <span className={`status ${ketcher ? "ready" : "loading"}`}>
          {ketcher ? "Editor ready" : "Loading editor"}
        </span>
      </div>

      <div className="multicatalytic-editor">
        <MoleculeDrawer globalKey="multiCatalyticKetcher" onReady={setKetcher} />
      </div>

      <div className="multicatalytic-builder">
        <div className="multicatalytic-search-panel">
          <label htmlFor="condition-search"><strong>Add reagent / catalyst</strong></label>
          <input
            id="condition-search"
            className="multicatalytic-search-input"
            type="search"
            value={query}
            placeholder="Search PCC, Lindlar, mCPBA, OsO4, HBr…"
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="multicatalytic-search-results" role="listbox" aria-label="Reaction conditions">
            {searchResults.map((option) => (
              <button
                className="multicatalytic-condition-option"
                key={option.ruleId}
                type="button"
                onClick={() => addCondition(option)}
              >
                <span>{option.reagents}</span>
                <small>{option.title} · {option.family}</small>
              </button>
            ))}
          </div>
        </div>

        <div className="multicatalytic-sequence-panel">
          <div className="multicatalytic-sequence-heading">
            <strong>Sequence</strong>
            <span>{sequence.length} step{sequence.length === 1 ? "" : "s"}</span>
          </div>

          {sequence.length === 0 ? (
            <p className="empty">Search above and click conditions to add them in order.</p>
          ) : (
            <ol className="multicatalytic-sequence-list">
              {sequence.map((condition, index) => (
                <li key={`${condition.ruleId}-${index}`}>
                  <div>
                    <strong>{condition.reagents}</strong>
                    <small>{condition.title}</small>
                  </div>
                  <div className="multicatalytic-step-actions">
                    <button type="button" disabled={index === 0} onClick={() => moveCondition(index, -1)} aria-label={`Move step ${index + 1} up`}>↑</button>
                    <button type="button" disabled={index === sequence.length - 1} onClick={() => moveCondition(index, 1)} aria-label={`Move step ${index + 1} down`}>↓</button>
                    <button type="button" onClick={() => removeCondition(index)} aria-label={`Remove step ${index + 1}`}>×</button>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      <div className="reaction-actions">
        <button className="primary-button" type="button" disabled={!ketcher || isRunning} onClick={() => void runSequence()}>
          {isRunning ? "Computing…" : "Run Sequence"}
        </button>
        <button className="secondary-button" type="button" disabled={isRunning} onClick={() => void clearPage()}>
          Clear
        </button>
      </div>

      {error && <p className="reaction-detail reaction-limitation">{error}</p>}
      <p className="reaction-progress" aria-live="polite">{status}</p>

      {startingSmiles && (
        <div className="multicatalytic-starting-structure">
          <strong>Starting molecule</strong>
          {svgs.start && <div className="reaction-svg-box" dangerouslySetInnerHTML={{ __html: svgs.start }} />}
          <p>{startingName}</p>
        </div>
      )}

      {branches.length > 0 && (
        <div className="multicatalytic-results">
          {branches.map((branch, branchIndex) => (
            <article className="reaction-pathway-card" key={branch.id}>
              <div className="reaction-card-heading">
                <div>
                  <h3>Sequence outcome {branchIndex + 1}</h3>
                  <p className="reaction-curriculum">Conditions applied in the selected order</p>
                </div>
              </div>

              <div className="multicatalytic-route-steps">
                {branch.steps.map((step) => (
                  <div className="multicatalytic-result-step" key={`${branch.id}-${step.stepNumber}`}>
                    <div className="multicatalytic-result-step-heading">
                      <strong>Step {step.stepNumber}: {step.title}</strong>
                      <span className={step.status === "no-reaction" ? "no-reaction-chip" : "reaction-status reaction-status-computed"}>
                        {step.status === "no-reaction" ? "NO REACTION" : "Reaction"}
                      </span>
                    </div>
                    <div className="reagent-pill">{step.reagentLabel}</div>

                    {step.status === "no-reaction" ? (
                      <div className="no-reaction-result">
                        <strong>NO REACTION</strong>
                        <p>{step.explanation}</p>
                        {step.noReaction?.suggestion && <p><strong>Instead:</strong> {step.noReaction.suggestion}</p>}
                        <small>Starting material carries forward unchanged to the next step.</small>
                      </div>
                    ) : (
                      <>
                        {svgs[`${branch.id}-${step.stepNumber}`] && (
                          <div
                            className="reaction-svg-box multicatalytic-product-svg"
                            dangerouslySetInnerHTML={{ __html: svgs[`${branch.id}-${step.stepNumber}`] ?? "" }}
                          />
                        )}
                        <p className="multicatalytic-product-name">{step.productLabel}</p>
                        <p className="reaction-note">{step.explanation}</p>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
