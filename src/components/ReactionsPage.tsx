import { useEffect, useMemo, useRef, useState } from "react";
import MoleculeDrawer, { type KetcherApi } from "./MoleculeDrawer";
import {
  analyzeFunctionalGroupHierarchy,
  getCondensedSulfonateSvg,
  getGenericHalogenSvg,
  getMoleculeSvg,
  getSynDiolSvg,
} from "../utils/functionalGroups";
import { analyzeNomenclatureAndProperties } from "../utils/nomenclatureUtils";

import {
  predictReactionPathways,
  predictRetrosynthesisPathways,
  predictNoReactionOutcomes,
  reactionRegistry,
  splitReactionComponents,
  type ReactionPathway,
  type RetrosynthesisPathway,
  type NoReactionOutcome,
} from "../utils/reactionUtils";

type Props = {
  initialPathways: ReactionPathway[];
};

type SvgListMap = Record<string, string[]>;
type AnalysisMode = "forward" | "retrosynthesis";
const RESULTS_PER_BATCH = 12;

function courseLabel(course: ReactionPathway["course"]) {
  return course === "ochem-1"
    ? "O-Chem I"
    : course === "ochem-2"
      ? "O-Chem II"
      : "Advanced";
}

function reagentBubbleLabels(label: string): string[] {
  const parts = label
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);

  // Only split a semicolon-delimited label when it is clearly a list of
  // alternatives. Sequential reagent sets such as "1) ...; 2) ..." stay
  // together in a single bubble.
  const isAlternativeList =
    parts.length > 1 && /^or\s+/i.test(parts[parts.length - 1] ?? "");

  if (!isAlternativeList) return [label];

  return parts.map((part) => part.replace(/^or\s+/i, "").trim());
}

function formatReactantList(labels: string[]): string {
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

function missingReactionInputLabels(pathway: ReactionPathway): string[] {
  const rule = reactionRegistry.find((candidate) => candidate.id === pathway.ruleId);
  return (rule?.additionalReactants ?? []).map((requirement) => requirement.label);
}

function missingReactionInputMessage(pathway: ReactionPathway): string {
  const requiredLabels = missingReactionInputLabels(pathway);
  return `Add ${formatReactantList(requiredLabels)} to the same canvas to compute the exact structure`;
}

function shouldDisplayForwardPathway(pathway: ReactionPathway): boolean {
  // A visible reaction card must either have a real product structure or tell
  // the student exactly which additional structural reactant to draw.
  if (pathway.productSmiles) return true;
  return missingReactionInputLabels(pathway).length > 0;
}

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

function normalizedHalogenDisplayRuleId(ruleId: string): string {
  return ruleId
    .replace(/alkene-hx-addition-(hcl|hbr|hi)/, "alkene-hx-addition-hx")
    .replace(/alkyne-(hcl|hbr|hi)-addition-/g, "alkyne-hx-addition-")
    .replace(/alkyne-(bromination|chlorination)-/g, "alkyne-halogenation-")
    .replace(/allylic-bromination/g, "allylic-halogenation");
}

function collapseDisplayEquivalentPathways(pathways: ReactionPathway[]): ReactionPathway[] {
  const seen = new Set<string>();

  return pathways.filter((pathway) => {
    const baseKey = pathway.productMixture
      ? `${pathway.ruleId}::${pathway.reactantSmiles}::${pathway.productMixture.groupId}`
      : `${pathway.ruleId}::${pathway.reactantSmiles}::${pathway.productSmiles ?? ""}`;

    const key = isGenericHalogenRuleId(pathway.ruleId)
      ? `${normalizedHalogenDisplayRuleId(pathway.ruleId)}::${pathway.reactantSmiles}::${pathway.productStatus}`
      : baseKey;

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function displayPathwayTitle(pathway: Pick<ReactionPathway, "ruleId" | "title">): string {
  if (/^alkene-hx-addition-/.test(pathway.ruleId)) return "HX Addition: Hydrohalogenation";
  if (/^alkyne-hx-addition-/.test(normalizedHalogenDisplayRuleId(pathway.ruleId))) {
    return pathway.ruleId.includes("excess")
      ? "Hydrohalogenation: Excess HX"
      : "Hydrohalogenation: HX (1 equiv)";
  }
  if (/^alkyne-halogenation-/.test(normalizedHalogenDisplayRuleId(pathway.ruleId))) {
    return pathway.ruleId.includes("excess")
      ? "Halogenation: Excess X₂"
      : "Halogenation: X₂ (1 equiv)";
  }
  if (pathway.ruleId === "alkene-halogenation-bromine") return "Halogenation";
  if (pathway.ruleId === "alkene-halohydrin-formation") return "Halohydrin Formation";
  if (pathway.ruleId === "alkene-haloether-formation") return "Haloether Formation";
  if (pathway.ruleId === "alkene-allylic-bromination") return "Allylic Halogenation";
  return pathway.title;
}

function displayReagentLabel(pathway: Pick<ReactionPathway, "ruleId" | "reagentLabel">): string {
  if (/^alkene-hx-addition-/.test(pathway.ruleId)) return "HX";
  if (/^alkyne-hx-addition-/.test(normalizedHalogenDisplayRuleId(pathway.ruleId))) {
    return pathway.ruleId.includes("excess") ? "excess HX" : "1 equiv HX";
  }
  if (pathway.ruleId === "alkene-halogenation-bromine") return "X₂";
  if (pathway.ruleId === "alkene-halohydrin-formation") return "X₂; H₂O";
  if (pathway.ruleId === "alkene-haloether-formation") return "X₂; ROH";
  if (/^alkyne-halogenation-/.test(normalizedHalogenDisplayRuleId(pathway.ruleId))) {
    return pathway.ruleId.includes("excess") ? "excess X₂" : "1 equiv X₂";
  }
  if (pathway.ruleId === "alkene-allylic-bromination") return "NXS; hν or radical initiator";
  return pathway.reagentLabel;
}

function displayProductLabel(pathway: ReactionPathway): string {
  if (/^alkene-hx-addition-/.test(pathway.ruleId)) return "Alkyl halide";
  if (/^alkyne-hx-addition-/.test(normalizedHalogenDisplayRuleId(pathway.ruleId))) {
    return pathway.ruleId.includes("excess") ? "Geminal dihalide" : "Vinyl halide";
  }
  if (pathway.ruleId === "alkene-halogenation-bromine") return "Vicinal dihalide";
  if (/^alkyne-halogenation-/.test(normalizedHalogenDisplayRuleId(pathway.ruleId))) {
    return pathway.ruleId.includes("excess") ? "Tetrahalide" : "Dihaloalkene";
  }
  if (pathway.ruleId === "alkene-halohydrin-formation") return "Halohydrin";
  if (pathway.ruleId === "alkene-haloether-formation") return "Haloether";
  if (pathway.ruleId === "alkene-allylic-bromination") return "Allylic halide";
  return pathway.productMixture?.displayName ?? pathway.productLabel;
}

function halogenLegend(ruleId: string): string | null {
  if (ruleId === "alkene-allylic-bromination") {
    return "X = Cl, Br, or I (for example NCS, NBS, or NIS).";
  }
  if (isGenericHalogenRuleId(ruleId)) {
    return "X = Cl, Br, or I.";
  }
  return null;
}

function collapseMixtureMembers(pathways: ReactionPathway[]): ReactionPathway[] {
  const seenMixtures = new Set<string>();

  return pathways.filter((pathway) => {
    if (!pathway.productMixture) return true;
    const key = `${pathway.ruleId}::${pathway.reactantSmiles}::${pathway.productMixture.groupId}`;
    if (seenMixtures.has(key)) return false;
    seenMixtures.add(key);
    return true;
  });
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

async function reactionInputDisplayName(smiles: string): Promise<string> {
  const components = splitReactionComponents(smiles);
  if (components.length === 0) return "Unnamed structure";
  const names = await Promise.all(components.map(moleculeDisplayName));
  return names.join(" + ");
}

export default function ReactionsPage({ initialPathways }: Props) {
  const [ketcher, setKetcher] = useState<KetcherApi | null>(null);
  const [reactionSmiles, setReactionSmiles] = useState("");
  const [reactionInputName, setReactionInputName] = useState("");
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>("forward");
  const [pathways, setPathways] = useState<ReactionPathway[]>(initialPathways);
  const [retroPathways, setRetroPathways] = useState<RetrosynthesisPathway[]>([]);
  const [noReactionOutcomes, setNoReactionOutcomes] = useState<NoReactionOutcome[]>([]);
  const [reactantSvgs, setReactantSvgs] = useState<SvgListMap>({});
  const [productSvgs, setProductSvgs] = useState<SvgListMap>({});
  const [retroTargetSvgs, setRetroTargetSvgs] = useState<SvgListMap>({});
  const [retroPrecursorSvgs, setRetroPrecursorSvgs] = useState<SvgListMap>({});
  const [reactionError, setReactionError] = useState<string | null>(null);
  const [reactionStatus, setReactionStatus] = useState("Draw a structure to begin.");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [visibleResultCount, setVisibleResultCount] = useState(RESULTS_PER_BATCH);
  const analysisRunRef = useRef(0);

  const displayPathways = useMemo(
    () => collapseDisplayEquivalentPathways(collapseMixtureMembers(pathways)).filter(shouldDisplayForwardPathway),
    [pathways],
  );
  const visiblePathways = useMemo(
    () => displayPathways.slice(0, visibleResultCount),
    [displayPathways, visibleResultCount],
  );
  const visibleRetroPathways = useMemo(
    () => retroPathways.slice(0, visibleResultCount),
    [retroPathways, visibleResultCount],
  );

  useEffect(() => {
    let cancelled = false;

    async function buildSvgs() {
      const nextReactants: SvgListMap = {};
      const nextProducts: SvgListMap = {};

      for (const pathway of visiblePathways) {
        const reactantComponents = pathway.reactantComponents.length > 0
          ? pathway.reactantComponents
          : pathway.reactantSmiles.split(".").filter(Boolean);

        nextReactants[pathway.id] = (
          await Promise.all(
            reactantComponents.map((component) => getCondensedSulfonateSvg(component)),
          )
        ).filter((svg): svg is string => Boolean(svg));

        if (pathway.productSmiles) {
          const productComponents = (
            pathway.productMixture?.memberSmiles ?? [pathway.productSmiles]
          ).flatMap((member) =>
            member
              .split(".")
              .map((component) => component.trim())
              .filter(Boolean),
          );

          const productSvg = pathway.ruleId === "alkene-syn-dihydroxylation"
            ? getSynDiolSvg
            : isGenericHalogenRuleId(pathway.ruleId)
              ? getGenericHalogenSvg
              : getCondensedSulfonateSvg;

          nextProducts[pathway.id] = (
            await Promise.all(
              productComponents.map((component) => productSvg(component)),
            )
          ).filter((svg): svg is string => Boolean(svg));
        } else {
          nextProducts[pathway.id] = [];
        }
      }

      if (!cancelled) {
        setReactantSvgs(nextReactants);
        setProductSvgs(nextProducts);
      }
    }

    void buildSvgs();

    return () => {
      cancelled = true;
    };
  }, [visiblePathways]);

  useEffect(() => {
    let cancelled = false;

    async function buildRetroSvgs() {
      const nextTargets: SvgListMap = {};
      const nextPrecursors: SvgListMap = {};

      for (const pathway of visibleRetroPathways) {
        const targetComponents = pathway.targetSmiles
          .split(".")
          .map((component) => component.trim())
          .filter(Boolean);

        nextTargets[pathway.id] = (
          await Promise.all(
            targetComponents.map((component) => getMoleculeSvg(component)),
          )
        ).filter((svg): svg is string => Boolean(svg));

        nextPrecursors[pathway.id] = (
          await Promise.all(
            pathway.precursorComponents.map((component) =>
              getMoleculeSvg(component),
            ),
          )
        ).filter((svg): svg is string => Boolean(svg));
      }

      if (!cancelled) {
        setRetroTargetSvgs(nextTargets);
        setRetroPrecursorSvgs(nextPrecursors);
      }
    }

    void buildRetroSvgs();

    return () => {
      cancelled = true;
    };
  }, [visibleRetroPathways]);

  async function getDrawerSmiles(): Promise<string | null> {
    if (!ketcher) return null;

    try {
      return await ketcher.getSmiles();
    } catch (error) {
      console.error("Ketcher could not export reaction SMILES:", error);
      setReactionError(
        "This Ketcher structure could not be exported as SMILES. For a generic R group, use the pseudoatom R / wildcard atom (*) rather than a full Markush R-group definition.",
      );
      setPathways([]);
      setRetroPathways([]);
      return null;
    }
  }

  async function analyzeReactionMolecule(mode: AnalysisMode) {
    if (isAnalyzing) return;

    const runId = analysisRunRef.current + 1;
    analysisRunRef.current = runId;
    setIsAnalyzing(true);
    setReactionError(null);
    setReactionStatus(
      mode === "retrosynthesis"
        ? "Searching and forward-checking precursor routes…"
        : "Matching the reaction catalog and generating products…",
    );

    try {
      const smiles = await getDrawerSmiles();
      if (smiles === null || analysisRunRef.current !== runId) return;

      setAnalysisMode(mode);
      setVisibleResultCount(RESULTS_PER_BATCH);

      if (!smiles.trim()) {
        setReactionSmiles("");
        setReactionInputName("");
        setPathways([]);
        setRetroPathways([]);
        setNoReactionOutcomes([]);
        setReactionStatus("Draw a structure before predicting reactions.");
        return;
      }

      setReactionSmiles(smiles);
      const inputName = await reactionInputDisplayName(smiles);
      if (analysisRunRef.current !== runId) return;
      setReactionInputName(inputName);

      if (mode === "retrosynthesis") {
        const results = await predictRetrosynthesisPathways(smiles);
        if (analysisRunRef.current !== runId) return;
        setPathways([]);
        setNoReactionOutcomes([]);
        setRetroPathways(results);
        setReactionStatus(
          results.length > 0
            ? `${results.length} verified precursor route${results.length === 1 ? "" : "s"} found.`
            : "No verified precursor routes were found.",
        );
        return;
      }

      const isMultiReactant = smiles.includes(".");
      const hierarchy = isMultiReactant
        ? null
        : await analyzeFunctionalGroupHierarchy(smiles);
      const results = await predictReactionPathways(
        smiles,
        hierarchy?.primaryGroups ?? [],
      );

      if (analysisRunRef.current !== runId) return;
      setRetroPathways([]);
      setPathways(results);
      const successfulRuleIds = results
        .filter((pathway) => Boolean(pathway.productSmiles))
        .map((pathway) => pathway.ruleId);
      setNoReactionOutcomes(
        await predictNoReactionOutcomes(smiles, successfulRuleIds),
      );
      const outcomeCount = collapseDisplayEquivalentPathways(collapseMixtureMembers(results))
        .filter(shouldDisplayForwardPathway).length;
      setReactionStatus(
        outcomeCount > 0
          ? `${outcomeCount} supported reaction outcome${outcomeCount === 1 ? "" : "s"} found.`
          : "No supported reactions were found.",
      );
    } catch (error) {
      console.error("Reaction analysis failed:", error);
      if (analysisRunRef.current === runId) {
        setReactionStatus("Reaction analysis failed. Check the structure and try again.");
      }
    } finally {
      if (analysisRunRef.current === runId) setIsAnalyzing(false);
    }
  }

  async function clearAnalysis() {
    analysisRunRef.current += 1;
    await ketcher?.setMolecule("");
    setReactionSmiles("");
    setReactionInputName("");
    setReactionError(null);
    setPathways([]);
    setRetroPathways([]);
    setNoReactionOutcomes([]);
    setIsAnalyzing(false);
    setVisibleResultCount(RESULTS_PER_BATCH);
    setReactionStatus("Draw a structure to begin.");
  }

  return (
    <section className="card reactions-page-card">
      <div className="card-header">
        <div>
          <h2>Molecule Drawer</h2>
          <p>
            Draw reactant(s) to predict products, or draw a product to predict
            reactants. Use R or * for generic groups.
          </p>
        </div>
        <span className={`status ${ketcher ? "ready" : "loading"}`}>
          {ketcher ? "Editor ready" : "Loading editor"}
        </span>
      </div>

      <div className="reaction-ketcher-panel">
        <div className="reaction-ketcher-box">
          <MoleculeDrawer
            globalKey="reactionKetcher"
            onReady={setKetcher}
          />
        </div>

        <div className="reaction-actions">
          <button
            className="primary-button"
            disabled={!ketcher || isAnalyzing}
            onClick={() => void analyzeReactionMolecule("forward")}
          >
            {isAnalyzing && analysisMode === "forward"
              ? "Predicting…"
              : "Predict Products"}
          </button>

          <button
            className="primary-button"
            disabled={!ketcher || isAnalyzing}
            onClick={() => void analyzeReactionMolecule("retrosynthesis")}
          >
            {isAnalyzing && analysisMode === "retrosynthesis"
              ? "Searching…"
              : "Predict Reactants"}
          </button>

          <button
            className="secondary-button"
            disabled={!ketcher || isAnalyzing}
            onClick={() => void clearAnalysis()}
          >
            Clear Analysis
          </button>
        </div>

        {reactionSmiles && (
          <p className="empty" title={reactionSmiles}>
            {analysisMode === "retrosynthesis"
              ? "Current target product: "
              : "Current reaction input: "}
            <strong>{reactionInputName || "Naming structure…"}</strong>
          </p>
        )}
        {reactionError && (
          <p className="reaction-detail reaction-limitation">{reactionError}</p>
        )}
        <p className="reaction-progress" aria-live="polite">
          {isAnalyzing && <span className="loading-spinner" aria-hidden="true" />}
          {reactionStatus}
        </p>
      </div>

      {analysisMode === "forward" ? (
        displayPathways.length === 0 && noReactionOutcomes.length === 0 ? (
          reactionSmiles ? (
            <p className="empty">
              No supported reactions found yet for this molecule.
            </p>
          ) : null
        ) : (
          <>
            <p className="empty">
              Computed products are drawn when the structures on the canvas are
              enough to determine them. Multi-reactant rules use disconnected
              structures from the same Ketcher canvas.
            </p>

            <div className="reaction-pathway-list">
              {visiblePathways.map((pathway) => (
                <div className="reaction-pathway-card" key={pathway.id}>
                  <div className="reaction-card-heading">
                    <div>
                      <h3>{displayPathwayTitle(pathway)}</h3>
                      <p className="reaction-curriculum">
                        {courseLabel(pathway.course)} · {pathway.chapter}
                        {pathway.mechanism ? ` · ${pathway.mechanism}` : ""}
                      </p>
                    </div>
                    <span
                      className={`reaction-status reaction-status-${pathway.productStatus}`}
                    >
                      {pathway.productStatus === "computed"
                        ? "Computed product"
                        : pathway.productStatus === "generic"
                          ? "Generic R-group product"
                          : pathway.productStatus === "representative"
                            ? "Representative product"
                            : "Needs reactant input"}
                    </span>
                  </div>

                  <div className="reaction-three-column">
                    <div className="reaction-column">
                      <div className="reaction-svg-box reaction-component-box">
                        {(reactantSvgs[pathway.id] ?? []).map((svg, index) => (
                          <div
                            className="reaction-component-item"
                            key={`${pathway.id}-reactant-${index}`}
                          >
                            {index > 0 && (
                              <span className="reaction-component-plus">+</span>
                            )}
                            <div dangerouslySetInnerHTML={{ __html: svg }} />
                          </div>
                        ))}
                      </div>
                      <p>{pathway.reactantLabel}</p>
                    </div>

                    <div className="reaction-column reagent-column">
                      <div className="reagent-pill-group">
                        {reagentBubbleLabels(displayReagentLabel(pathway)).map((reagent, index) => (
                          <div
                            className="reagent-pill"
                            key={`${pathway.id}-reagent-${index}`}
                          >
                            {reagent}
                          </div>
                        ))}
                      </div>
                      <span className="reaction-arrow">→</span>
                      <p>{pathway.reagentNote}</p>
                      {halogenLegend(pathway.ruleId) && (
                        <p className="reaction-detail">{halogenLegend(pathway.ruleId)}</p>
                      )}
                    </div>

                    <div className="reaction-column">
                      {(productSvgs[pathway.id] ?? []).length > 0 ? (
                        <div className="reaction-svg-box reaction-component-box">
                          {(productSvgs[pathway.id] ?? []).map((svg, index) => (
                            <div
                              className="reaction-component-item"
                              key={`${pathway.id}-product-${index}`}
                            >
                              {index > 0 && (
                                <span className="reaction-component-plus">+</span>
                              )}
                              <div dangerouslySetInnerHTML={{ __html: svg }} />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="reaction-svg-box reaction-placeholder">
                          {pathway.productStatus === "concept-only"
                            ? missingReactionInputMessage(pathway)
                            : "No valid product structure was generated"}
                        </div>
                      )}
                      <p>
                        {displayProductLabel(pathway)}
                      </p>
                    </div>
                  </div>

                  {pathway.productMixture && (
                    <p className="reaction-detail">
                      <strong>Product mixture:</strong>{" "}
                      {pathway.productMixture.label} · {pathway.productMixture.memberCount}{" "}
                      stereoisomer{pathway.productMixture.memberCount === 1 ? "" : "s"} shown
                    </p>
                  )}

                  <p className="reaction-note">{pathway.shortExplanation}</p>

                  {pathway.selectivity.length > 0 && (
                    <p className="reaction-detail">
                      <strong>Selectivity:</strong>{" "}
                      {pathway.selectivity.join(" · ")}
                    </p>
                  )}

                  {pathway.limitations.length > 0 && (
                    <p className="reaction-detail reaction-limitation">
                      <strong>Model note:</strong>{" "}
                      {pathway.limitations.join(" ")}
                    </p>
                  )}
                </div>
              ))}
            </div>
            {noReactionOutcomes.length > 0 && (
              <div className="no-reaction-section">
                <h3>Common NO REACTION cases for this substrate</h3>
                <p className="empty">
                  These are conditions students often expect to work, but the required structural or mechanistic requirement is missing.
                </p>
                <div className="reaction-pathway-list">
                  {noReactionOutcomes.map((outcome) => (
                    <div className="reaction-pathway-card no-reaction-card" key={outcome.id}>
                      <div className="reaction-card-heading">
                        <div>
                          <h3>{outcome.title}</h3>
                          <p className="reaction-curriculum">Predicted no reaction</p>
                        </div>
                        <span className="no-reaction-chip">NO REACTION</span>
                      </div>
                      <div className="reagent-pill">{outcome.reagentLabel}</div>
                      <p className="reaction-note">{outcome.explanation}</p>
                      {outcome.suggestion && (
                        <p className="reaction-detail">
                          <strong>Instead:</strong> {outcome.suggestion}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {visiblePathways.length < displayPathways.length && (
              <button
                className="secondary-button load-more-button"
                onClick={() =>
                  setVisibleResultCount((count) => count + RESULTS_PER_BATCH)
                }
                type="button"
              >
                Show{" "}
                {Math.min(
                  RESULTS_PER_BATCH,
                  displayPathways.length - visiblePathways.length,
                )}{" "}
                more reactions
              </button>
            )}
          </>
        )
      ) : retroPathways.length === 0 ? (
        reactionSmiles ? (
          <p className="empty">
            No forward-verified precursor sets were found from the current reaction catalog.
          </p>
        ) : null
      ) : (
        <>
          <p className="empty">
            Retrosynthesis runs the existing PocketChem reaction catalog
            backward, then replays each proposed precursor set through the
            original forward reaction. Suggestions that cannot regenerate the
            target are discarded.
          </p>

          <div className="reaction-pathway-list">
            {visibleRetroPathways.map((pathway) => (
              <div className="reaction-pathway-card" key={pathway.id}>
                <div className="reaction-card-heading">
                  <div>
                    <h3>Retrosynthesis via {displayPathwayTitle(pathway)}</h3>
                    <p className="reaction-curriculum">
                      {courseLabel(pathway.course)} · {pathway.chapter}
                      {pathway.mechanism ? ` · ${pathway.mechanism}` : ""}
                    </p>
                  </div>
                  <span
                    className={`reaction-status ${
                      pathway.confidence === "confirmed"
                        ? "reaction-status-computed"
                        : "reaction-status-representative"
                    }`}
                  >
                    {pathway.confidence === "confirmed"
                      ? "Forward-verified"
                      : "Connectivity verified"}
                  </span>
                </div>

                <div className="reaction-three-column">
                  <div className="reaction-column">
                    <div className="reaction-svg-box reaction-component-box">
                      {(retroTargetSvgs[pathway.id] ?? []).map((svg, index) => (
                        <div
                          className="reaction-component-item"
                          key={`${pathway.id}-target-${index}`}
                        >
                          {index > 0 && (
                            <span className="reaction-component-plus">+</span>
                          )}
                          <div dangerouslySetInnerHTML={{ __html: svg }} />
                        </div>
                      ))}
                    </div>
                    <p>{pathway.targetLabel}</p>
                  </div>

                  <div className="reaction-column reagent-column">
                    <div className="reagent-pill-group">
                      {reagentBubbleLabels(displayReagentLabel(pathway)).map((reagent, index) => (
                        <div
                          className="reagent-pill"
                          key={`${pathway.id}-retro-reagent-${index}`}
                        >
                          {reagent}
                        </div>
                      ))}
                    </div>
                    <span className="reaction-arrow">←</span>
                    <p>{pathway.reagentNote}</p>
                    {halogenLegend(pathway.ruleId) && (
                      <p className="reaction-detail">{halogenLegend(pathway.ruleId)}</p>
                    )}
                    {pathway.requiredReactantLabels.length > 0 && (
                      <p>
                        Rule requires: {pathway.requiredReactantLabels.join(", ")}
                      </p>
                    )}
                  </div>

                  <div className="reaction-column">
                    <div className="reaction-svg-box reaction-component-box">
                      {(retroPrecursorSvgs[pathway.id] ?? []).map((svg, index) => (
                        <div
                          className="reaction-component-item"
                          key={`${pathway.id}-precursor-${index}`}
                        >
                          {index > 0 && (
                            <span className="reaction-component-plus">+</span>
                          )}
                          <div dangerouslySetInnerHTML={{ __html: svg }} />
                        </div>
                      ))}
                    </div>
                    <p>{pathway.precursorLabel}</p>
                  </div>
                </div>

                <p className="reaction-note">{pathway.shortExplanation}</p>

                {pathway.alternativeRoutes.length > 0 && (
                  <p className="reaction-detail">
                    <strong>Alternative conditions:</strong>{" "}
                    {pathway.alternativeRoutes
                      .map(
                        (route) =>
                          `${displayReagentLabel(route)} — ${displayPathwayTitle(route)}${
                            route.reagentNote ? ` (${route.reagentNote})` : ""
                          }`,
                      )
                      .join(" · ")}
                  </p>
                )}

                {pathway.selectivity.length > 0 && (
                  <p className="reaction-detail">
                    <strong>Forward selectivity:</strong>{" "}
                    {pathway.selectivity.join(" · ")}
                  </p>
                )}

                {pathway.limitations.length > 0 && (
                  <p className="reaction-detail reaction-limitation">
                    <strong>Model note:</strong>{" "}
                    {pathway.limitations.join(" ")}
                  </p>
                )}
              </div>
            ))}
          </div>
          {visibleRetroPathways.length < retroPathways.length && (
            <button
              className="secondary-button load-more-button"
              onClick={() =>
                setVisibleResultCount((count) => count + RESULTS_PER_BATCH)
              }
              type="button"
            >
              Show{" "}
              {Math.min(
                RESULTS_PER_BATCH,
                retroPathways.length - visibleRetroPathways.length,
              )}{" "}
              more routes
            </button>
          )}
        </>
      )}
    </section>
  );
}
