import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
type ProductVariantSvgMap = Record<string, string[][]>;

type DisplayProductVariant = {
  completeSmiles: string;
  componentSmiles: string[];
  label: string;
};

type HalogenSymbol = "Cl" | "Br" | "I";
const HALOGEN_SYMBOLS: readonly HalogenSymbol[] = ["Cl", "Br", "I"];

type HalogenDisplaySeries = {
  key: string;
  ruleIds: string[];
  halogens: HalogenSymbol[];
};

type DisplayReactionPathway = ReactionPathway & {
  productVariants: DisplayProductVariant[];
  halogenSeries: HalogenDisplaySeries | null;
};

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

function shouldDisplayForwardPathway(_pathway: ReactionPathway): boolean {
  // If a catalog rule matched the drawn substrate(s), keep it visible even
  // when the current structure generator cannot yet draw the exact product.
  // Hiding matched-but-uncomputed rules made legitimate chemistry appear to be
  // absent from the database (notably highly substituted Diels–Alder cases and
  // concept-level multistep reactions). The card already carries a product
  // hint and model limitation, so showing it is more informative than silently
  // dropping it.
  return true;
}

function generalizeHalogenRuleId(ruleId: string): string {
  return ruleId
    .toLowerCase()
    .replace(/(^|-)(?:hcl|hbr|hi)(?=-|$)/g, "$1hx")
    .replace(/chlorination|bromination|iodination/g, "halogenation")
    .replace(/chloride|bromide|iodide/g, "halide")
    .replace(/chlorine|bromine|iodine/g, "halogen")
    .replace(/chloro|bromo|iodo/g, "halo")
    .replace(/-{2,}/g, "-");
}

function generalizeHalogenText(text: string): string {
  return text
    .replace(/chlorination|bromination|iodination/gi, "halogenation")
    .replace(/chloride|bromide|iodide/gi, "halide")
    .replace(/chlorine|bromine|iodine/gi, "halogen")
    .replace(/chloro|bromo|iodo/gi, "halo")
    .replace(/HCl|HBr|HI/g, "HX")
    .replace(/Cl|Br/g, "X")
    .replace(/\bI(?=[0-9₀-₉+\-.,;)\s]|$)/g, "X");
}


function generalizeHalogenSeriesReagent(text: string): string {
  return generalizeHalogenText(text)
    // A catalog sibling may give one common classroom temperature explicitly
    // (for example HBr at 40 °C) while the parallel HCl/HI rules say
    // "higher temperature". Once the siblings are condensed into HX, do not
    // make that one numerical example look mandatory for every X.
    .replace(/40\s*°?\s*C/gi, "higher temperature")
    .replace(/higher temperature\s*,\s*higher temperature/gi, "higher temperature");
}
function halogensMentionedByRule(rule: (typeof reactionRegistry)[number]): HalogenSymbol[] {
  const source = `${rule.id} ${rule.title} ${rule.reagents} ${rule.productHint}`;
  const found = new Set<HalogenSymbol>();

  if (/hcl|chlor|\bCl\b|Cl[0-9₀-₉]/i.test(source)) found.add("Cl");
  if (/hbr|brom|\bBr\b|Br[0-9₀-₉]/i.test(source)) found.add("Br");
  if (/\bhi\b|iod|\bI\b|I[0-9₀-₉]/i.test(source)) found.add("I");

  return HALOGEN_SYMBOLS.filter((symbol) => found.has(symbol));
}

function halogenSeriesSignature(rule: (typeof reactionRegistry)[number]): string | null {
  if (halogensMentionedByRule(rule).length === 0) return null;

  return [
    rule.family,
    rule.reactionType,
    generalizeHalogenRuleId(rule.id),
    generalizeHalogenText(rule.title).toLowerCase(),
    generalizeHalogenText(rule.productHint).toLowerCase(),
    generalizeHalogenText(rule.reagentNote).toLowerCase(),
    rule.mechanism?.toLowerCase() ?? "",
  ].join("::");
}

const HALOGEN_SERIES_BY_RULE_ID = (() => {
  const candidates = new Map<
    string,
    { ruleIds: string[]; halogens: Set<HalogenSymbol> }
  >();

  for (const rule of reactionRegistry) {
    const signature = halogenSeriesSignature(rule);
    if (!signature) continue;
    const entry = candidates.get(signature) ?? { ruleIds: [], halogens: new Set<HalogenSymbol>() };
    entry.ruleIds.push(rule.id);
    for (const halogen of halogensMentionedByRule(rule)) entry.halogens.add(halogen);
    candidates.set(signature, entry);
  }

  const byRuleId = new Map<
    string,
    { key: string; ruleIds: string[]; halogens: HalogenSymbol[] }
  >();

  for (const [key, entry] of candidates) {
    // Only create a display series when the catalog actually contains at least
    // two parallel rules differing by halogen identity. A lone HBr-specific
    // reaction (for example the peroxide effect) must remain explicitly HBr.
    if (entry.ruleIds.length < 2 || entry.halogens.size < 2) continue;
    const series = {
      key,
      ruleIds: entry.ruleIds,
      halogens: HALOGEN_SYMBOLS.filter((symbol) => entry.halogens.has(symbol)),
    };
    for (const ruleId of entry.ruleIds) byRuleId.set(ruleId, series);
  }

  return byRuleId;
})();

function activeHalogenSeriesKey(pathway: ReactionPathway): string | null {
  return HALOGEN_SERIES_BY_RULE_ID.get(pathway.ruleId)?.key ?? null;
}

function hasFixedHalogenInReactants(pathway: ReactionPathway): boolean {
  return pathway.reactantComponents.some((component) => /Cl|Br|\bI\b/.test(component));
}

function shouldRenderGenericHalogen(pathway: DisplayReactionPathway): boolean {
  return Boolean(pathway.halogenSeries) && !hasFixedHalogenInReactants(pathway);
}

function productVariantsForPathway(pathway: ReactionPathway): DisplayProductVariant[] {
  // A racemate is one reaction outcome, not two regioisomer alternatives.
  // Keep both enantiomers in productMixture.memberSmiles for chemistry/search,
  // but draw one representative enantiomer on the reaction card and label the
  // bottle as racemic. Diastereomeric/constitutional alternatives remain
  // individually visible because they are not interchangeable.
  const completeProducts = pathway.productMixture?.kind === "racemic"
    ? (pathway.productSmiles ? [pathway.productSmiles] : [])
    : pathway.productMixture?.memberSmiles ??
      (pathway.productSmiles ? [pathway.productSmiles] : []);

  return completeProducts.map((completeSmiles) => ({
    completeSmiles,
    componentSmiles: completeSmiles
      .split(".")
      .map((component) => component.trim())
      .filter(Boolean),
    label: pathway.productMixture?.displayName ?? pathway.productLabel,
  }));
}

/**
 * One ReactionRule should render as one reaction line.  RDKit legitimately
 * returns several products when the same rule can react at several equivalent
 * or nonequivalent sites (EAS on a substituted arene, allylic substitution,
 * etc.).  Those are product alternatives, not separate reactions.
 *
 * Keeping the alternatives on the grouped card fixes the old behavior where a
 * molecule with four aromatic C-H sites produced four identical nitration,
 * sulfonation, and bromination cards.
 */
function groupDisplayPathways(pathways: ReactionPathway[]): DisplayReactionPathway[] {
  const candidates = collapseMixtureMembers(pathways).filter(shouldDisplayForwardPathway);

  // A catalog-level halogen family is condensed only when two or more sibling
  // rules are actually present for THIS substrate. This prevents a specific
  // HBr-only reaction from being mislabeled HX merely because related rules
  // exist elsewhere in the catalog.
  const activeRulesByScopedSeries = new Map<string, Set<string>>();
  for (const pathway of candidates) {
    const seriesKey = activeHalogenSeriesKey(pathway);
    if (!seriesKey) continue;
    const scopedKey = [seriesKey, pathway.reactantSmiles, pathway.productStatus].join("::");
    const ruleIds = activeRulesByScopedSeries.get(scopedKey) ?? new Set<string>();
    ruleIds.add(pathway.ruleId);
    activeRulesByScopedSeries.set(scopedKey, ruleIds);
  }

  const grouped = new Map<string, DisplayReactionPathway>();
  const variantKeys = new Map<string, Set<string>>();

  for (const pathway of candidates) {
    const catalogSeries = HALOGEN_SERIES_BY_RULE_ID.get(pathway.ruleId) ?? null;
    const scopedSeriesKey = catalogSeries
      ? [catalogSeries.key, pathway.reactantSmiles, pathway.productStatus].join("::")
      : null;
    const activeRuleIds = scopedSeriesKey
      ? activeRulesByScopedSeries.get(scopedSeriesKey) ?? new Set<string>()
      : new Set<string>();
    const useSeries = Boolean(catalogSeries && activeRuleIds.size >= 2);

    const key = useSeries
      ? `halogen-series::${scopedSeriesKey}`
      : [pathway.ruleId, pathway.reactantSmiles, pathway.productStatus].join("::");

    const variants = productVariantsForPathway(pathway);
    const existing = grouped.get(key);

    if (!existing) {
      const actualHalogens: HalogenSymbol[] = useSeries
        ? HALOGEN_SYMBOLS.filter((symbol) =>
            [...activeRuleIds].some((ruleId) =>
              HALOGEN_SERIES_BY_RULE_ID.get(ruleId)?.halogens.includes(symbol),
            ),
          )
        : [];

      grouped.set(key, {
        ...pathway,
        productVariants: [],
        halogenSeries: useSeries && catalogSeries
          ? {
              key: catalogSeries.key,
              ruleIds: [...activeRuleIds],
              halogens: actualHalogens,
            }
          : null,
      });
      variantKeys.set(key, new Set<string>());
    }

    const target = grouped.get(key)!;

    // If X can safely replace every product halogen (the starting structures
    // contain no fixed Cl/Br/I), one sibling rule is enough to draw the generic
    // product. Otherwise retain the literal sibling products on ONE card so a
    // pre-existing halogen is never incorrectly relabeled X.
    if (
      target.halogenSeries &&
      target.ruleId !== pathway.ruleId &&
      shouldRenderGenericHalogen(target)
    ) {
      continue;
    }

    const seen = variantKeys.get(key)!;
    for (const variant of variants) {
      if (seen.has(variant.completeSmiles)) continue;
      seen.add(variant.completeSmiles);
      target.productVariants.push(variant);
    }
  }

  return [...grouped.values()];
}

type HalogenAwareDisplayText = {
  ruleId: string;
  halogenSeries?: HalogenDisplaySeries | null;
};

function displayPathwayTitle(
  pathway: HalogenAwareDisplayText & { title: string },
): string {
  if (pathway.halogenSeries) {
    return generalizeHalogenText(pathway.title);
  }
  return pathway.title;
}

function displayReagentLabel(
  pathway: HalogenAwareDisplayText & { reagentLabel: string },
): string {
  if (pathway.halogenSeries) {
    return generalizeHalogenSeriesReagent(pathway.reagentLabel);
  }
  return pathway.reagentLabel;
}

function displayProductLabel(pathway: ReactionPathway | DisplayReactionPathway): string {
  if ("halogenSeries" in pathway && pathway.halogenSeries) {
    return generalizeHalogenText(pathway.productMixture?.displayName ?? pathway.productLabel);
  }
  if ("productVariants" in pathway && pathway.productVariants.length > 1 && !pathway.productMixture) {
    return `${pathway.productVariants.length} chemically competitive product alternatives`;
  }
  return pathway.productMixture?.displayName ?? pathway.productLabel;
}

function formatHalogenList(halogens: HalogenSymbol[]): string {
  if (halogens.length === 1) return halogens[0];
  if (halogens.length === 2) return `${halogens[0]} or ${halogens[1]}`;
  return `${halogens.slice(0, -1).join(", ")}, or ${halogens[halogens.length - 1]}`;
}

function halogenLegend(pathway: HalogenAwareDisplayText): string | null {
  if (!pathway.halogenSeries) return null;
  return `X = ${formatHalogenList(pathway.halogenSeries.halogens)}.`;
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
  const [productSvgs, setProductSvgs] = useState<ProductVariantSvgMap>({});
  const [retroTargetSvgs, setRetroTargetSvgs] = useState<SvgListMap>({});
  const [retroPrecursorSvgs, setRetroPrecursorSvgs] = useState<SvgListMap>({});
  const [reactionError, setReactionError] = useState<string | null>(null);
  const [reactionStatus, setReactionStatus] = useState("Draw a structure to begin.");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [visibleResultCount, setVisibleResultCount] = useState(RESULTS_PER_BATCH);
  const analysisRunRef = useRef(0);

  const displayPathways = useMemo(
    () => groupDisplayPathways(pathways),
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
      const nextProducts: ProductVariantSvgMap = {};

      for (const pathway of visiblePathways) {
        const reactantComponents = pathway.reactantComponents.length > 0
          ? pathway.reactantComponents
          : pathway.reactantSmiles.split(".").filter(Boolean);

        nextReactants[pathway.id] = (
          await Promise.all(
            reactantComponents.map((component) => getCondensedSulfonateSvg(component)),
          )
        ).filter((svg): svg is string => Boolean(svg));

        if (pathway.productVariants.length > 0) {
          const productSvg = pathway.ruleId === "alkene-syn-dihydroxylation"
            ? getSynDiolSvg
            : shouldRenderGenericHalogen(pathway)
              ? getGenericHalogenSvg
              : getCondensedSulfonateSvg;

          nextProducts[pathway.id] = await Promise.all(
            pathway.productVariants
              .map(async (variant) => (
                await Promise.all(
                  variant.componentSmiles.map((component) => productSvg(component)),
                )
              ).filter((svg): svg is string => Boolean(svg))),
          );
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
        await predictNoReactionOutcomes(
          smiles,
          successfulRuleIds,
          reactionRegistry,
          hierarchy?.functionalGroups ?? hierarchy?.primaryGroups ?? [],
        ),
      );
      const outcomeCount = groupDisplayPathways(results).length;
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
    setReactantSvgs({});
    setProductSvgs({});
    setRetroTargetSvgs({});
    setRetroPrecursorSvgs({});
    setIsAnalyzing(false);
    setVisibleResultCount(RESULTS_PER_BATCH);
    setReactionStatus("Draw a structure to begin.");
  }

  const handleReactionCanvasChange = useCallback(() => {
    // Results belong to an exact Ketcher snapshot.  As soon as the student
    // changes that snapshot, invalidate both the old forward/retro result and
    // any in-flight async analysis.  This prevents a Diels–Alder/other result
    // from being displayed after the canvas has been edited for the next
    // reaction.
    analysisRunRef.current += 1;
    setReactionSmiles("");
    setReactionInputName("");
    setReactionError(null);
    setPathways([]);
    setRetroPathways([]);
    setNoReactionOutcomes([]);
    setReactantSvgs({});
    setProductSvgs({});
    setRetroTargetSvgs({});
    setRetroPrecursorSvgs({});
    setIsAnalyzing(false);
    setVisibleResultCount(RESULTS_PER_BATCH);
    setReactionStatus("Structure changed. Predict again when the new input is ready.");
  }, []);

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
            onChange={handleReactionCanvasChange}
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
                            ? pathway.productSmiles
                              ? "Representative product"
                              : "Supported reaction"
                            : missingReactionInputLabels(pathway).length > 0
                              ? "Needs reactant input"
                              : "Concept / conditions"}
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
                      {halogenLegend(pathway) && (
                        <p className="reaction-detail">{halogenLegend(pathway)}</p>
                      )}
                    </div>

                    <div className="reaction-column">
                      {(productSvgs[pathway.id] ?? []).some((variant) => variant.length > 0) ? (
                        <div className="reaction-svg-box reaction-product-variant-list">
                          {(productSvgs[pathway.id] ?? []).map((variantSvgs, variantIndex) => (
                            <div
                              className="reaction-product-variant"
                              key={`${pathway.id}-product-variant-${variantIndex}`}
                            >
                              {variantIndex > 0 && (
                                <span className="reaction-product-or">
                                  {pathway.productMixture?.kind === "racemic"
                                    ? "enantiomer"
                                    : "or"}
                                </span>
                              )}
                              <div className="reaction-component-box">
                                {variantSvgs.map((svg, componentIndex) => (
                                  <div
                                    className="reaction-component-item"
                                    key={`${pathway.id}-product-${variantIndex}-${componentIndex}`}
                                  >
                                    {componentIndex > 0 && (
                                      <span className="reaction-component-plus">+</span>
                                    )}
                                    <div dangerouslySetInnerHTML={{ __html: svg }} />
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="reaction-svg-box reaction-placeholder">
                          {pathway.productStatus === "concept-only"
                            ? missingReactionInputLabels(pathway).length > 0
                              ? missingReactionInputMessage(pathway)
                              : pathway.productLabel
                            : "The reaction rule matched, but the exact product structure could not be generated for this substrate yet."}
                        </div>
                      )}
                      <p>{displayProductLabel(pathway)}</p>
                    </div>
                  </div>

                  {pathway.productMixture && (
                    <p className="reaction-detail">
                      <strong>Product mixture:</strong>{" "}
                      {pathway.productMixture.label} · {pathway.productMixture.memberCount}{" "}
                      stereoisomer{pathway.productMixture.memberCount === 1 ? "" : "s"} shown
                    </p>
                  )}

                  {!pathway.productMixture && pathway.productVariants.length > 1 && (
                    <p className="reaction-detail">
                      <strong>Alternative products:</strong>{" "}
                      {pathway.halogenSeries
                        ? "Parallel halogen variants are condensed onto this one card; any remaining structural alternatives are genuine selectivity ties after major-product ranking."
                        : "Major-product ranking has already removed lower-probability atom-map/regioisomer matches; multiple structures remain only when the rule represents a genuine mixture or an unresolved chemical tie."}
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
                <h3>Applicable NO REACTION conditions for this substrate</h3>
                <p className="empty">
                  These catalog reactions are chemically related to the functional groups you drew, but this substrate fails a required structural, steric, electronic, or mechanistic condition.
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
                    {halogenLegend(pathway) && (
                      <p className="reaction-detail">{halogenLegend(pathway)}</p>
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
