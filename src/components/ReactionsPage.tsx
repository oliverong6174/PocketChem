import { reagentBubbleLabels } from "../utils/reactions/reactionPresentation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MoleculeDrawer, { type KetcherApi } from "./MoleculeDrawer";
import {
  analyzeFunctionalGroupHierarchy,
  getCondensedSulfonateSvg,
  getMoleculeSvg,
  getPreservedMolfileSvg,
} from "../utils/functionalGroups";
import { analyzeNomenclatureAndProperties } from "../utils/nomenclatureUtils";
import { readKetcherStructureSnapshot } from "../utils/ketcherSnapshot";
import {
  generalizeHalogenMemberText,
  isHalogenSymbol,
  type HalogenSymbol,
} from "../utils/reactions/profiles/halogens";
import { rendererForReactionDisplay } from "./reactionProductRenderer";
import WorkspaceNotice, { type WorkspaceNoticeItem } from "./WorkspaceNotice";
import { useWorkspacePersistence } from "../utils/persistence/useWorkspacePersistence";
import { DebouncedTask } from "../utils/persistence/debouncedTask";
import { restoreEditorContent } from "../utils/persistence/editorRestore";
import { transferIntoEditor } from "../utils/persistence/handoffTransfer";
import { ketHasStructureText, ketIdentityKey } from "../utils/persistence/ketIdentity";
import {
  REACTIONS_ENGINE_VERSION,
  handoffOfferAvailable,
  isReactionsOutcomeKind,
  restoredResultsAreStale,
  validateReactionsInputs,
  validateReactionsResults,
  type ReactionsOutcomeKind,
  type ReactionsWorkspaceInputs,
  type ReactionsWorkspaceResults,
} from "../utils/persistence/reactionsWorkspace";
import type { Capture, RecoveryOutcome } from "../utils/persistence/workspacePersistence";
import type { WorkspaceResults } from "../utils/persistence/workspaceStore";

import {
  predictReactionPathways,
  predictRetrosynthesisPathways,
  predictNoReactionOutcomes,
  reactionRegistry,
  splitReactionComponents,
  type ReactionPathway,
  type ReactionDisplayMetadata,
  type RetrosynthesisPathway,
  type NoReactionOutcome,
} from "../utils/reactionUtils";

type Props = {
  initialPathways: ReactionPathway[];
  /** Exact Ketcher drawing from the main analyzer, including coordinates/stereo. */
  initialReactantMolfile?: string | null;
  /** Exact Ketcher-rendered SVG; preferred over any chemistry-tool redraw. */
  initialReactantSvg?: string | null;
  /** Preserved Ketcher V3000 block for each disconnected reactant component. */
  initialReactantComponentMolfiles?: string[];
  /** Identifies the Properties analysis the initial props came from; null when there is none. */
  handoffId?: string | null;
  /** Display name of that analysis's molecule, for the "Use in Reactions" offer. */
  handoffLabel?: string | null;
  /** Its SMILES, used only when no molfile is available. */
  handoffSmiles?: string | null;
};

type SvgListMap = Record<string, string[]>;
type ProductVariantSvgMap = Record<string, string[][]>;

type DisplayProductVariant = {
  completeSmiles: string;
  componentSmiles: string[];
  label: string;
};

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

/** What the page knows about the finished analysis on screen. */
type ReactionsResultMeta = {
  kind: ReactionsOutcomeKind;
  computedAt: string;
  engineVersion: number;
  /** Chemistry identity of the structure(s) the analysis was run on. */
  structureKey: string;
  mode: AnalysisMode;
  /** Loaded from a previous session instead of computed in this one. */
  restored: boolean;
  /** Saved by an earlier version of the reaction engine; shown as saved, never recomputed. */
  engineMismatch: boolean;
  /** The saved drawing could not be confirmed to match these results. */
  stale: boolean;
};
const RESULTS_PER_BATCH = 12;

function courseLabel(course: ReactionPathway["course"]) {
  return course === "ochem-1"
    ? "O-Chem I"
    : course === "ochem-2"
      ? "O-Chem II"
      : "Advanced";
}


function formatReactantList(labels: string[]): string {
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

function missingReactionInputLabels(pathway: ReactionPathway): string[] {
  return pathway.missingReactants.map((requirement) => requirement.label);
}

function missingReactionInputMessage(pathway: ReactionPathway): string {
  const requiredLabels = missingReactionInputLabels(pathway);
  return `Add ${formatReactantList(requiredLabels)} to the same canvas to compute the exact structure`;
}

function shouldDisplayForwardPathway(_pathway: ReactionPathway): boolean {
  return true;
}

function seriesMemberHalogen(pathway: { display?: ReactionDisplayMetadata | null }): HalogenSymbol | null {
  const value = pathway.display?.series?.value;
  return isHalogenSymbol(value) ? value : null;
}

function activeHalogenSeriesKey(pathway: ReactionPathway): string | null {
  const series = pathway.display?.series;
  return series && seriesMemberHalogen(pathway) ? series.id : null;
}

function hasFixedHalogenInReactants(pathway: ReactionPathway): boolean {
  return pathway.reactantComponents.some((component) => /Cl|Br|\bI\b/.test(component));
}

function shouldRenderGenericHalogen(pathway: DisplayReactionPathway): boolean {
  return (
    pathway.display?.renderer === "generic-halogen" &&
    Boolean(pathway.halogenSeries) &&
    !hasFixedHalogenInReactants(pathway)
  );
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

  const activeByScopedSeries = new Map<
    string,
    { ruleIds: Set<string>; halogens: Set<HalogenSymbol> }
  >();

  for (const pathway of candidates) {
    const seriesKey = activeHalogenSeriesKey(pathway);
    const halogen = seriesMemberHalogen(pathway);
    if (!seriesKey || !halogen) continue;

    const scopedKey = [seriesKey, pathway.reactantSmiles, pathway.productStatus].join("::");
    const entry =
      activeByScopedSeries.get(scopedKey) ?? {
        ruleIds: new Set<string>(),
        halogens: new Set<HalogenSymbol>(),
      };
    entry.ruleIds.add(pathway.ruleId);
    entry.halogens.add(halogen);
    activeByScopedSeries.set(scopedKey, entry);
  }

  const grouped = new Map<string, DisplayReactionPathway>();
  const variantKeys = new Map<string, Set<string>>();

  for (const pathway of candidates) {
    const seriesKey = activeHalogenSeriesKey(pathway);
    const scopedSeriesKey = seriesKey
      ? [seriesKey, pathway.reactantSmiles, pathway.productStatus].join("::")
      : null;
    const activeSeries = scopedSeriesKey
      ? activeByScopedSeries.get(scopedSeriesKey) ?? null
      : null;
    const useSeries = Boolean(
      activeSeries &&
        activeSeries.ruleIds.size >= 2 &&
        activeSeries.halogens.size >= 2,
    );

    const key = useSeries
      ? `halogen-series::${scopedSeriesKey}`
      : [pathway.ruleId, pathway.reactantSmiles, pathway.productStatus].join("::");

    const variants = productVariantsForPathway(pathway);
    if (!grouped.has(key)) {
      grouped.set(key, {
        ...pathway,
        productVariants: [],
        halogenSeries:
          useSeries && activeSeries && seriesKey
            ? {
                key: seriesKey,
                ruleIds: [...activeSeries.ruleIds],
                halogens: HALOGEN_SYMBOLS.filter((symbol) =>
                  activeSeries.halogens.has(symbol),
                ),
              }
            : null,
      });
      variantKeys.set(key, new Set<string>());
    }

    const target = grouped.get(key)!;
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
  display?: ReactionDisplayMetadata | null;
  halogenSeries?: HalogenDisplaySeries | null;
};

function generalizedSeriesText(
  pathway: HalogenAwareDisplayText,
  text: string,
): string {
  if (!pathway.halogenSeries) return text;
  const halogen = seriesMemberHalogen(pathway);
  return halogen ? generalizeHalogenMemberText(text, halogen) : text;
}

function displayPathwayTitle(
  pathway: HalogenAwareDisplayText & { title: string },
): string {
  return generalizedSeriesText(pathway, pathway.title);
}

function displayReagentLabel(
  pathway: HalogenAwareDisplayText & { reagentLabel: string },
): string {
  return generalizedSeriesText(pathway, pathway.reagentLabel);
}

function displayProductLabel(pathway: ReactionPathway | DisplayReactionPathway): string {
  const base = pathway.productMixture?.displayName ?? pathway.productLabel;
  if ("halogenSeries" in pathway && pathway.halogenSeries) {
    return generalizedSeriesText(pathway, base);
  }
  if ("productVariants" in pathway && pathway.productVariants.length > 1 && !pathway.productMixture) {
    return `${pathway.productVariants.length} chemically competitive product alternatives`;
  }
  return base;
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

export default function ReactionsPage({
  initialPathways,
  initialReactantMolfile = null,
  handoffId = null,
  handoffLabel = null,
  handoffSmiles = null,
}: Props) {
  const [ketcher, setKetcher] = useState<KetcherApi | null>(null);
  const [reactionSmiles, setReactionSmiles] = useState("");
  // The molecule from the latest Properties analysis is never shown automatically: opening this
  // page restores its own saved workspace. The user can adopt that molecule with "Use in
  // Reactions" (adoptHandoff), which loads its exact Ketcher molfile and its already computed
  // pathways, preserving the main-page depiction, scaffold orientation and wedge/hash bonds.
  const [reactionMolfile, setReactionMolfile] = useState<string | null>(null);
  const [reactionSvgSnapshot, setReactionSvgSnapshot] = useState<string | null>(null);
  const [reactionComponentMolfiles, setReactionComponentMolfiles] = useState<string[]>([]);
  const [reactionInputName, setReactionInputName] = useState("");
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>("forward");
  const [pathways, setPathways] = useState<ReactionPathway[]>([]);
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

  // ---- workspace recovery (Stage 8B-2B) --------------------------------------------------------
  // The drawn structure(s), the analysis mode and the finished analysis (pathways, retrosynthetic
  // routes, NO REACTION outcomes) are saved and come back after a reload or a visit to another
  // page. Restoring never runs a prediction. As before, editing the canvas discards the results on
  // screen, so a saved result is always about the structures it was saved with.
  const [snapshotTask] = useState(() => new DebouncedTask(async () => undefined));
  // The last Properties analysis this workspace adopted (saved with the workspace, so a reload or
  // a later visit does not offer the same molecule again).
  const [handoffSeen, setHandoffSeen] = useState<string | null>(null);
  const { controller: persistence, recovery, status: persistenceStatus } = useWorkspacePersistence<
    ReactionsWorkspaceInputs,
    ReactionsWorkspaceResults
  >({
    page: "reactions",
    engineVersion: REACTIONS_ENGINE_VERSION,
    validateInputs: validateReactionsInputs,
    validateResults: validateReactionsResults,
    beforeLeave: () => snapshotTask.flushNow(),
  });
  const [resultMeta, setResultMeta] = useState<ReactionsResultMeta | null>(null);
  const [recoveryNotices, setRecoveryNotices] = useState<WorkspaceNoticeItem[]>([]);
  const [inputsOnlyRestored, setInputsOnlyRestored] = useState(false);
  const [editorRestoreVersion, setEditorRestoreVersion] = useState(0);
  const ketcherRef = useRef<KetcherApi | null>(null);
  const snapshotRef = useRef<{ ket: string | null; key: string | null }>({ ket: null, key: null });
  const pendingEditorRef = useRef<{ ket: string; key: string | null; token: number } | null>(null);
  const restoringRef = useRef(false);
  const analysisStartedRef = useRef(false);
  const adoptedRef = useRef(false);
  const adoptingRef = useRef(false);
  const deferredRecoveryRef = useRef<RecoveryOutcome<ReactionsWorkspaceInputs, ReactionsWorkspaceResults> | null>(null);
  const [isAdopting, setIsAdopting] = useState(false);
  const appliedRecoveryRef = useRef<unknown>(null);
  const applyRestoreRef = useRef<((outcome: RecoveryOutcome<ReactionsWorkspaceInputs, ReactionsWorkspaceResults>) => void) | null>(null);
  const requestPersistRef = useRef<() => void>(() => undefined);
  const restoreEditorRef = useRef<() => void>(() => undefined);
  const latestRef = useRef({
    reactionSmiles, reactionMolfile, reactionComponentMolfiles, reactionInputName, reactionStatus,
    analysisMode, pathways, retroPathways, noReactionOutcomes, visibleResultCount, isAnalyzing, resultMeta, handoffSeen,
  });

  function captureReactions(): Capture<ReactionsWorkspaceInputs, ReactionsWorkspaceResults> | null {
    const latest = latestRef.current;
    const snapshot = snapshotRef.current;
    const inputs: ReactionsWorkspaceInputs = {
      ket: snapshot.ket,
      key: snapshot.key,
      analysisMode: latest.analysisMode,
      visibleResultCount: latest.visibleResultCount,
      // A prediction that is still running is recorded as interrupted, never as a result.
      interrupted: latest.isAnalyzing ? latest.analysisMode : null,
      handoffSeen: latest.handoffSeen,
    };
    let results: WorkspaceResults<ReactionsWorkspaceResults> | null = null;
    const meta = latest.resultMeta;
    if (meta && !latest.isAnalyzing && latest.reactionSmiles) {
      const forward = meta.mode === "forward";
      results = {
        computedAt: meta.computedAt,
        engineVersion: meta.engineVersion,
        stale: meta.stale,
        status: meta.kind,
        data: {
          inputKey: meta.structureKey,
          mode: meta.mode,
          smiles: latest.reactionSmiles,
          molfile: latest.reactionMolfile,
          componentMolfiles: latest.reactionComponentMolfiles,
          inputName: latest.reactionInputName,
          statusText: latest.reactionStatus,
          pathways: forward ? latest.pathways : [],
          retroPathways: forward ? [] : latest.retroPathways,
          noReactionOutcomes: forward ? latest.noReactionOutcomes : [],
        },
      };
    }
    if (!inputs.ket && !results && !inputs.interrupted) return null;
    return { inputs, results };
  }

  function requestPersist() {
    persistence.requestSave(captureReactions);
  }

  /** Reads the editor and refreshes the saved drawing. */
  async function takeEditorSnapshot() {
    const api = ketcherRef.current;
    if (!api || restoringRef.current || pendingEditorRef.current) return;
    const token = persistence.token();
    try {
      const ket = await Promise.race([
        api.getKet(),
        new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error("Timed out reading the editor.")), 8000)),
      ]);
      const key = await ketIdentityKey(ket);
      if (!persistence.isCurrent(token) || restoringRef.current || pendingEditorRef.current) return;
      snapshotRef.current = { ket: ketHasStructureText(ket) ? ket : null, key };
      requestPersist();
    } catch (snapshotError) {
      console.warn("[PocketChem:Reactions] Could not read the editor for workspace recovery.", snapshotError);
    }
  }

  /** Drops the results on screen (the canvas no longer matches them). */
  function discardShownResults(statusText: string) {
    analysisRunRef.current += 1;
    setResultMeta(null);
    setReactionSmiles("");
    setReactionMolfile(null);
    setReactionComponentMolfiles([]);
    setReactionSvgSnapshot(null);
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
    setReactionStatus(statusText);
  }

  async function restoreEditor() {
    const pending = pendingEditorRef.current;
    const api = ketcherRef.current;
    if (!pending || !api || restoringRef.current || adoptingRef.current) return;
    restoringRef.current = true;
    const { token } = pending;
    // A transfer in progress invalidates a drawing restore, exactly like Clear does.
    const outcome = await restoreEditorContent(api, { ket: pending.ket, key: pending.key }, () => persistence.isCurrent(token) && !adoptingRef.current);
    if (persistence.isCurrent(token)) {
      pendingEditorRef.current = null;
      if (outcome.kind === "failed") {
        // Do not let an editor that failed to restore overwrite the saved copy, and do not present
        // the restored results as belonging to whatever is now on the canvas.
        persistence.disable();
        setResultMeta((meta) => (meta ? { ...meta, stale: true } : meta));
        setRecoveryNotices((notices) => [
          ...notices,
          { tone: "warn", text: "The saved drawing could not be restored into the editor. Your saved work was kept and will not be overwritten; use Clear Analysis to start over." },
        ]);
      } else if (outcome.kind === "user-content-kept") {
        // A drawing made before the saved one arrived wins, and results about another structure go.
        discardShownResults("Structure changed. Predict again when the new input is ready.");
      }
    }
    window.setTimeout(() => {
      restoringRef.current = false;
      if (outcome.kind === "user-content-kept") snapshotTask.schedule();
    }, 500);
  }

  function applyRestoredReactions(outcome: RecoveryOutcome<ReactionsWorkspaceInputs, ReactionsWorkspaceResults>) {
    if (appliedRecoveryRef.current === outcome) return;
    if (adoptingRef.current) {
      // A molecule is being adopted right now: the record is applied only if that transfer fails.
      deferredRecoveryRef.current = outcome;
      return;
    }
    appliedRecoveryRef.current = outcome;
    if (outcome.kind === "rejected") {
      setRecoveryNotices([{ tone: "warn", text: `Saved work from a previous session could not be used (${outcome.message}). It was set aside and the page started clean.` }]);
      return;
    }
    if (outcome.kind !== "restored" || !persistence.isCurrent(outcome.epoch)) return;
    // Opening the page restores its own workspace; a Properties molecule never displaces it. Work
    // (or an adoption) that began before the record arrived is the user's newer choice and wins.
    if (analysisStartedRef.current || latestRef.current.isAnalyzing || adoptedRef.current) {
      setRecoveryNotices([{ tone: "info", text: "Saved work from a previous session was not restored because you had already started working on this page." }]);
      return;
    }
    setHandoffSeen(outcome.inputs.handoffSeen);

    const { inputs, results } = outcome;
    const notices: WorkspaceNoticeItem[] = [];
    setAnalysisMode(inputs.analysisMode);
    setVisibleResultCount(inputs.visibleResultCount);
    snapshotRef.current = { ket: inputs.ket, key: inputs.key };
    if (inputs.ket) {
      pendingEditorRef.current = { ket: inputs.ket, key: inputs.key, token: outcome.epoch };
      setEditorRestoreVersion((version) => version + 1);
    }

    if (results && isReactionsOutcomeKind(results.status)) {
      const data = results.data;
      setAnalysisMode(data.mode);
      setReactionSmiles(data.smiles);
      setReactionMolfile(data.molfile);
      setReactionComponentMolfiles(data.componentMolfiles);
      setReactionSvgSnapshot(null);
      setReactionInputName(data.inputName);
      setPathways(data.pathways);
      setRetroPathways(data.retroPathways);
      setNoReactionOutcomes(data.noReactionOutcomes);
      setReactionError(null);
      setReactionStatus(`Restored from your previous session · ${data.statusText}`);
      setResultMeta({
        kind: results.status,
        computedAt: results.computedAt,
        engineVersion: results.engineVersion,
        structureKey: data.inputKey,
        mode: data.mode,
        restored: true,
        engineMismatch: outcome.engineMismatch,
        // A record whose results do not match its own saved drawing is never presented as current.
        stale: restoredResultsAreStale(inputs, results),
      });
    } else if (inputs.interrupted) {
      notices.push({
        tone: "warn",
        text: `A ${inputs.interrupted === "retrosynthesis" ? "reactant search" : "product prediction"} was running when this page was last saved. It did not finish and was not resumed; press the button again to run it.`,
      });
      setReactionStatus("The previous prediction was interrupted and did not finish.");
    } else if (inputs.ket) {
      setInputsOnlyRestored(true);
      setReactionStatus("Restored your drawing from your previous session.");
    }
    if (outcome.resultsDropped) {
      notices.push({ tone: "warn", text: "Saved reaction results could not be validated and were not restored. Your drawing was." });
    }
    if (outcome.migratedFrom !== null) {
      notices.push({ tone: "info", text: "Your saved workspace was upgraded from an older storage format." });
    }
    setRecoveryNotices(notices);
  }

  /**
   * "Use in Reactions": the user explicitly adopts the molecule from the latest Properties analysis.
   *
   * This is a transaction (see transferIntoEditor) and the saved Reactions workspace is never
   * touched until it succeeds. Late restoration, pending saves and stale callbacks are held off
   * while it runs; on failure the previous drawing is put back and the previous workspace carries
   * on, and a recovery that arrived meanwhile is applied. On success the page shows the transferred
   * molecule with the pathways Properties already computed (nothing is predicted here), every
   * prediction belonging to the old molecule is cleared, and one write replaces the saved record
   * with the new drawing and the adopted analysis id.
   */
  async function adoptHandoff() {
    const api = ketcher;
    const source = initialReactantMolfile || handoffSmiles;
    if (!api || !source || handoffId === null || isAnalyzing) return;
    if (adoptingRef.current || handoffSeen === handoffId) return; // one transfer at a time, never twice
    adoptingRef.current = true;
    setIsAdopting(true);
    snapshotTask.cancel();
    restoringRef.current = true;

    const outcome = await transferIntoEditor(api, source, persistence);

    if (outcome.kind !== "adopted") {
      if (outcome.kind === "rolled-back") {
        const deferred = deferredRecoveryRef.current;
        deferredRecoveryRef.current = null;
        if (deferred) {
          try {
            applyRestoreRef.current?.(deferred);
          } finally {
            persistence.resumeAfterRestore();
          }
        }
        setRecoveryNotices((notices) => [
          ...notices,
          { tone: "warn", text: "The molecule from Properties could not be loaded. Your Reactions workspace is unchanged." },
        ]);
        requestPersistRef.current();
      } else {
        // The canvas may have changed, so the predictions on screen no longer describe it. The
        // stored workspace is untouched and nothing is saved over it.
        discardShownResults("The molecule from Properties could not be loaded.");
        setRecoveryNotices([
          { tone: "warn", text: "The molecule from Properties could not be loaded and the editor could not be restored. Your saved Reactions workspace is unchanged; reload this page to bring it back." },
        ]);
      }
      adoptingRef.current = false;
      setIsAdopting(false);
      window.setTimeout(() => {
        restoringRef.current = false;
      }, 500);
      return;
    }

    deferredRecoveryRef.current = null;
    pendingEditorRef.current = null;
    snapshotRef.current = { ket: outcome.ket, key: outcome.key };
    adoptedRef.current = true;
    analysisStartedRef.current = false;
    analysisRunRef.current += 1;
    setResultMeta(null);
    setInputsOnlyRestored(false);
    setRecoveryNotices([]);
    setReactionSmiles("");
    setReactionMolfile(initialReactantMolfile);
    setReactionComponentMolfiles([]);
    setReactionSvgSnapshot(null);
    setReactionInputName("");
    setReactionError(null);
    setAnalysisMode("forward");
    setPathways(initialPathways);
    setRetroPathways([]);
    setNoReactionOutcomes([]);
    setReactantSvgs({});
    setProductSvgs({});
    setRetroTargetSvgs({});
    setRetroPrecursorSvgs({});
    setIsAnalyzing(false);
    setVisibleResultCount(RESULTS_PER_BATCH);
    setHandoffSeen(handoffId);
    setReactionStatus("Using the molecule from Properties. Press Predict Products or Predict Reactants to run a prediction here.");
    persistence.requestSave(() => ({
      inputs: {
        ket: outcome.ket,
        key: outcome.key,
        analysisMode: "forward",
        visibleResultCount: RESULTS_PER_BATCH,
        interrupted: null,
        handoffSeen: handoffId,
      },
      results: null,
    }));
    await persistence.flush();
    adoptingRef.current = false;
    setIsAdopting(false);
    window.setTimeout(() => {
      restoringRef.current = false;
      snapshotTask.schedule();
    }, 500);
  }

  useEffect(() => {
    ketcherRef.current = ketcher;
    requestPersistRef.current = requestPersist;
    restoreEditorRef.current = () => void restoreEditor();
    applyRestoreRef.current = applyRestoredReactions;
    snapshotTask.setTask(takeEditorSnapshot);
    latestRef.current = {
      reactionSmiles, reactionMolfile, reactionComponentMolfiles, reactionInputName, reactionStatus,
      analysisMode, pathways, retroPathways, noReactionOutcomes, visibleResultCount, isAnalyzing, resultMeta, handoffSeen,
    };
  });

  // Autosave: only settled state is watched (the debounce and the finished-analysis rule keep
  // half-finished predictions and rapid edits out of storage).
  useEffect(() => {
    requestPersistRef.current();
  }, [
    reactionSmiles, reactionMolfile, reactionComponentMolfiles, reactionInputName, analysisMode,
    pathways, retroPathways, noReactionOutcomes, visibleResultCount, isAnalyzing, resultMeta, handoffSeen,
  ]);

  useEffect(() => {
    if (!recovery) return;
    try {
      applyRestoreRef.current?.(recovery);
    } finally {
      // Saving starts only after the recovered record has been applied (or deliberately skipped).
      persistence.resumeAfterRestore();
    }
  }, [recovery, persistence]);

  useEffect(() => {
    if (ketcher && pendingEditorRef.current) restoreEditorRef.current();
  }, [ketcher, editorRestoreVersion]);

  useEffect(() => {
    return () => snapshotTask.cancel();
  }, [snapshotTask]);

  // What was recovered, what could not be saved.
  const workspaceNotices: WorkspaceNoticeItem[] = [...recoveryNotices];
  if (resultMeta?.restored) {
    workspaceNotices.push({
      tone: "info",
      text: `Restored from your previous session (predicted ${new Date(resultMeta.computedAt).toLocaleString()}). These are previously computed model predictions and were not recomputed.`,
    });
  } else if (inputsOnlyRestored) {
    workspaceNotices.push({ tone: "info", text: "Restored your drawing from your previous session." });
  }
  if (resultMeta?.engineMismatch) {
    workspaceNotices.push({
      tone: "warn",
      text: "These results were saved by an earlier version of the reaction engine. They are shown as saved and have not been recomputed.",
    });
  }
  if (resultMeta?.stale) {
    workspaceNotices.push({
      tone: "warn",
      text: "These results may not describe the structure now on the canvas. They are a saved snapshot; predict again to update them.",
    });
  }
  if (!persistenceStatus.available) {
    workspaceNotices.push({ tone: "warn", text: "Browser storage is unavailable, so your work on this page will not be saved." });
  }
  if (persistenceStatus.saveError) {
    workspaceNotices.push({
      tone: "warn",
      text: persistenceStatus.saveError.code === "quota"
        ? "Your latest changes could not be saved because browser storage is full."
        : `Your latest changes could not be saved (${persistenceStatus.saveError.message}).`,
    });
  }
  if (persistenceStatus.resultsOmitted) {
    workspaceNotices.push({ tone: "warn", text: "The results were too large to save; your drawing was saved without them." });
  }

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

        // For a single user-drawn reactant, render the exact Ketcher molfile
        // snapshot instead of rebuilding coordinates from SMILES. This preserves
        // scaffold orientation and the student's chosen wedge/dash bond.
        if (reactionSvgSnapshot && reactantComponents.length === 1) {
          // Exact Ketcher canvas export: preserve the same scaffold orientation
          // and the exact bond the student chose for wedge/hash depiction.
          nextReactants[pathway.id] = [reactionSvgSnapshot];
        } else if (reactionMolfile && reactantComponents.length === 1) {
          const preserved = await getPreservedMolfileSvg(reactionMolfile);
          nextReactants[pathway.id] = preserved ? [preserved] : [];
        } else if (
          reactantComponents.length > 1 &&
          reactionComponentMolfiles.length === reactantComponents.length
        ) {
          // IMPORTANT: disconnected Ketcher reactants must not be round-tripped
          // through canonical SMILES.  Doing so can reflect a symmetric diene,
          // move an equivalent double bond, and make the product look mirrored
          // even though the chemistry engine used the correct connectivity.
          nextReactants[pathway.id] = (
            await Promise.all(
              reactionComponentMolfiles.map((componentMolfile) =>
                getPreservedMolfileSvg(componentMolfile),
              ),
            )
          ).filter((svg): svg is string => Boolean(svg));
        } else {
          nextReactants[pathway.id] = (
            await Promise.all(
              reactantComponents.map((component) => getCondensedSulfonateSvg(component)),
            )
          ).filter((svg): svg is string => Boolean(svg));
        }

        if (pathway.productVariants.length > 0) {
          const preservedReferenceStructures =
            reactantComponents.length === 1 && reactionMolfile
              ? [reactionMolfile]
              : reactionComponentMolfiles.length > 0
                ? reactionComponentMolfiles
                : [];

          const productSvg = rendererForReactionDisplay(pathway.display, {
            allowGenericHalogen: shouldRenderGenericHalogen(pathway),
            referenceSmiles:
              pathway.reactantComponents[0] ??
              pathway.reactantSmiles.split(".").find(Boolean) ??
              null,
            referenceStructure: preservedReferenceStructures[0] ?? null,
            // Do not assume component 0 is the scaffold that survives into a
            // product. Multi-reactant reactions can preserve any component.
            referenceStructures: preservedReferenceStructures,
            referenceSmilesList: reactantComponents,
          });

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
  }, [visiblePathways, reactionMolfile, reactionSvgSnapshot, reactionComponentMolfiles]);

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

  async function getDrawerSnapshot(): Promise<{
    smiles: string;
    molfile: string | null;
    componentMolfiles: string[];
    svg: string | null;
  } | null> {
    if (!ketcher) return null;

    try {
      // Read Ketcher's in-memory KET state rather than getMolfile()/getSmiles().
      // The latter may pass through Indigo and legally regenerate/refelect an
      // equivalent 2-D depiction. KET preserves the exact coordinates and
      // bond placement the student drew; the shared snapshot bridge converts
      // it directly to V3000 + canonical SMILES without changing depiction.
      const snapshot = await readKetcherStructureSnapshot(ketcher);
      if (!snapshot) throw new Error("Ketcher returned an empty/unsupported KET structure.");
      // The shared KET snapshot intentionally stores molecular coordinates,
      // not a renderer-specific SVG string. Re-rendering that preserved V3000
      // molfile keeps the exact Ketcher geometry while avoiding a stale/undefined
      // SVG field on the snapshot type.
      return {
        smiles: snapshot.smiles,
        molfile: snapshot.molfile,
        componentMolfiles: snapshot.componentMolfiles,
        svg: null,
      };
    } catch (error) {
      console.error("Ketcher could not export reaction structure:", error);
      setReactionError(
        "This Ketcher structure could not be exported. For a generic R group, use the pseudoatom R / wildcard atom (*) rather than a full Markush R-group definition.",
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
    analysisStartedRef.current = true;
    setResultMeta(null);
    setInputsOnlyRestored(false);
    setRecoveryNotices([]);
    setIsAnalyzing(true);
    setReactionError(null);
    setReactionStatus(
      mode === "retrosynthesis"
        ? "Searching and forward-checking precursor routes…"
        : "Matching the reaction catalog and generating products…",
    );

    try {
      const snapshot = await getDrawerSnapshot();
      if (snapshot === null || analysisRunRef.current !== runId) return;
      const { smiles, molfile, componentMolfiles, svg } = snapshot;
      setReactionMolfile(molfile);
      setReactionComponentMolfiles(componentMolfiles);
      setReactionSvgSnapshot(svg);

      setAnalysisMode(mode);
      setVisibleResultCount(RESULTS_PER_BATCH);

      if (!smiles.trim()) {
        setReactionSmiles("");
        setReactionMolfile(null);
        setReactionComponentMolfiles([]);
        setReactionSvgSnapshot(null);
        setReactionInputName("");
        setPathways([]);
        setRetroPathways([]);
        setNoReactionOutcomes([]);
        setReactionStatus("Draw a structure before predicting reactions.");
        return;
      }

      setReactionSmiles(smiles);
      // The structure this analysis is about; the saved results are tied to it.
      let analyzedKet: string | null = null;
      try {
        analyzedKet = (await ketcher?.getKet()) ?? null;
      } catch {
        analyzedKet = null;
      }
      const analyzedKey = await ketIdentityKey(analyzedKet);
      if (analysisRunRef.current !== runId) return;
      const recordFinished = (kind: ReactionsOutcomeKind) => {
        if (!analyzedKey) return;
        snapshotRef.current = { ket: ketHasStructureText(analyzedKet) ? analyzedKet : null, key: analyzedKey };
        setResultMeta({
          kind,
          computedAt: new Date().toISOString(),
          engineVersion: REACTIONS_ENGINE_VERSION,
          structureKey: analyzedKey,
          mode,
          restored: false,
          engineMismatch: false,
          stale: false,
        });
        // Edits made while the prediction ran are caught by this re-read.
        snapshotTask.schedule();
      };
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
        recordFinished(results.length > 0 ? "retro-found" : "retro-none");
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
      recordFinished(outcomeCount > 0 ? "forward-found" : "forward-none");
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
    // Clearing also discards the saved workspace and invalidates any restoration still in flight.
    void persistence.discard();
    adoptedRef.current = false;
    setHandoffSeen(null);
    pendingEditorRef.current = null;
    snapshotRef.current = { ket: null, key: null };
    snapshotTask.cancel();
    analysisStartedRef.current = false;
    setResultMeta(null);
    setInputsOnlyRestored(false);
    setRecoveryNotices([]);
    analysisRunRef.current += 1;
    await ketcher?.setMolecule("");
    setReactionSmiles("");
    setReactionMolfile(null);
    setReactionComponentMolfiles([]);
    setReactionSvgSnapshot(null);
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
    // Putting a saved drawing back into the editor is not a user edit.
    if (restoringRef.current || pendingEditorRef.current) return;
    setResultMeta(null);
    snapshotTask.schedule();
    // Results belong to an exact Ketcher snapshot.  As soon as the student
    // changes that snapshot, invalidate both the old forward/retro result and
    // any in-flight async analysis.  This prevents a Diels–Alder/other result
    // from being displayed after the canvas has been edited for the next
    // reaction.
    analysisRunRef.current += 1;
    setReactionSmiles("");
    setReactionMolfile(null);
    setReactionComponentMolfiles([]);
    setReactionSvgSnapshot(null);
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
  }, [snapshotTask]);

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

      <WorkspaceNotice
        embedded
        notices={workspaceNotices}
        onDiscard={resultMeta?.restored || inputsOnlyRestored ? () => void clearAnalysis() : undefined}
        discardDisabled={isAnalyzing}
      />

      {recovery !== null && (initialReactantMolfile || handoffSmiles) && handoffOfferAvailable(handoffId, handoffSeen) && (
        <div className="workspace-notice workspace-notice-embedded">
          <ul>
            <li className="workspace-notice-info">
              A molecule from your Properties analysis is available{handoffLabel ? `: ${handoffLabel}` : ""}. Opening this page keeps your Reactions workspace.
            </li>
          </ul>
          <button className="secondary-button" type="button" disabled={!ketcher || isAnalyzing || isAdopting} onClick={() => void adoptHandoff()}>
            Use in Reactions
          </button>
        </div>
      )}

      <div className="reaction-ketcher-panel">
        <div className="reaction-ketcher-box">
          <MoleculeDrawer
            globalKey="reactionKetcher"
            nameInputMode="add-or-replace"
            onChange={handleReactionCanvasChange}
            onStructureLoaded={() => snapshotTask.schedule()}
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
                        {(() => {
                          const reagentLabel = displayReagentLabel(pathway);
                          const labels = reagentBubbleLabels(
                            reagentLabel,
                            pathway.display?.reagentBubbleMode,
                          );
                          const showAlternativeSeparators =
                            labels.length > 1 &&
                            /\bor\b/i.test(reagentLabel) &&
                            !/\bthen\b/i.test(reagentLabel);

                          return labels.map((reagent, index) => (
                            <span
                              key={`${pathway.id}-reagent-wrap-${index}`}
                              style={{ display: "contents" }}
                            >
                              {index > 0 && showAlternativeSeparators && (
                                <span
                                  aria-label="or"
                                  style={{
                                    fontSize: "0.78rem",
                                    fontWeight: 800,
                                    letterSpacing: "0.08em",
                                    opacity: 0.72,
                                  }}
                                >
                                  OR
                                </span>
                              )}
                              <div className="reagent-pill">
                                {reagent}
                              </div>
                            </span>
                          ));
                        })()}
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
                      {pathway.productMixture.kind === "racemic"
                        ? "Racemic mixture · one enantiomer shown; + mirror-image enantiomer"
                        : `${pathway.productMixture.label} · ${pathway.productMixture.memberCount} stereoisomer${pathway.productMixture.memberCount === 1 ? "" : "s"} shown`}
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
                      {(() => {
                        const reagentLabel = displayReagentLabel(pathway);
                        const labels = reagentBubbleLabels(
                          reagentLabel,
                          pathway.display?.reagentBubbleMode,
                        );
                        const showAlternativeSeparators =
                          labels.length > 1 &&
                          /\bor\b/i.test(reagentLabel) &&
                          !/\bthen\b/i.test(reagentLabel);

                        return labels.map((reagent, index) => (
                          <span
                            key={`${pathway.id}-retro-reagent-wrap-${index}`}
                            style={{ display: "contents" }}
                          >
                            {index > 0 && showAlternativeSeparators && (
                              <span
                                aria-label="or"
                                style={{
                                  fontSize: "0.78rem",
                                  fontWeight: 800,
                                  letterSpacing: "0.08em",
                                  opacity: 0.72,
                                }}
                              >
                                OR
                              </span>
                            )}
                            <div className="reagent-pill">
                              {reagent}
                            </div>
                          </span>
                        ));
                      })()}
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
