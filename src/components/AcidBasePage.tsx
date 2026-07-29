import { useMemo, useState } from "react";
import MoleculeDrawer, { type KetcherApi } from "./MoleculeDrawer";
import {
  analyzeFunctionalGroupHierarchy,
  getMoleculeSvg,
  type FunctionalGroupResult,
} from "../utils/functionalGroups";
import {
  analyzeAcidity,
  type AcidityResult,
} from "../utils/ranking/analyzeAcidity";
import {
  analyzeBasicity,
  type BasicityResult,
} from "../utils/ranking/analyzeBasicity";
import {
  analyzeCarbanionStability,
  getBestCarbanionStabilityResult,
  type CarbanionStabilityResult,
} from "../utils/ranking/anionStability";
import {
  analyzeCarbocationStability,
  getBestCarbocationStabilityResult,
  type CarbocationStabilityResult,
} from "../utils/ranking/cationStability";
import {
  analyzeCarbonRadicalStability,
  getBestCarbonRadicalStabilityResult,
  type CarbonRadicalStabilityResult,
} from "../utils/ranking/radicalStability";
import {
  analyzeBoilingPointRanking,
  compareBoilingPointResults,
  type BoilingPointRankingResult,
} from "../utils/ranking/boilingPoint";
import {
  analyzeSolubilityRanking,
  compareSolubilityResults,
  type SolubilityRankingResult,
} from "../utils/ranking/solubility";
import {
  analyzeCipSubstituentPriority,
  compareCipSubstituentResults,
  type CipSubstituentPriorityResult,
} from "../utils/ranking/cipPriority";
import "ketcher-react/dist/index.css";

type RankingMode =
  | "acidity"
  | "basicity"
  | "anionStability"
  | "cationStability"
  | "radicalStability"
  | "boilingPoint"
  | "solubility"
  | "cipPriority";

type ComparisonMolecule = {
  id: number;
  label: string;
  smiles: string;
  structureSvg: string | null;
  functionalGroups: FunctionalGroupResult[];
  acidityResults: AcidityResult[];
  basicityResults: BasicityResult[];
  anionStabilityResults: CarbanionStabilityResult[];
  cationStabilityResults: CarbocationStabilityResult[];
  radicalStabilityResults: CarbonRadicalStabilityResult[];
  boilingPointResult: BoilingPointRankingResult | null;
  solubilityResult: SolubilityRankingResult | null;
  cipPriorityResult: CipSubstituentPriorityResult | null;
};


const COMPARISON_LABELS = [
  "Molecule A",
  "Molecule B",
  "Molecule C",
  "Molecule D",
  "Molecule E",
] as const;

function getNextComparisonLabel(molecules: ComparisonMolecule[]): string {
  const usedLabels = new Set(molecules.map((molecule) => molecule.label));
  return COMPARISON_LABELS.find((label) => !usedLabels.has(label)) ?? "Molecule";
}

function isMolBlockLike(value: unknown) {
  if (typeof value !== "string") return false;

  return (
    value.includes("M  END") ||
    value.includes("V2000") ||
    value.includes("V3000") ||
    value.includes("-INDIGO-") ||
    /^\s*\n?\s*-INDIGO-/i.test(value)
  );
}

function sanitizeDisplayedSmiles(value: unknown) {
  if (typeof value !== "string") return "";

  const trimmed = value.trim();

  if (!trimmed) return "";
  if (isMolBlockLike(trimmed)) return "";

  return trimmed;
}

function getAnionStabilityScore(molecule: ComparisonMolecule) {
  const directResult = getBestCarbanionStabilityResult(
    molecule.anionStabilityResults
  );

  if (directResult) return directResult.stabilityScore;

  const bestBase = molecule.basicityResults[0];

  if (!bestBase) return 999;

  const group = bestBase.relatedGroup.toLowerCase();
  const site = bestBase.basicSite.toLowerCase();
  const explanation = bestBase.explanation.toLowerCase();

  if (group.includes("carboxylate")) return 0;

  if (
    group.includes("alpha resonance-stabilized") ||
    site.includes("alpha resonance-stabilized") ||
    explanation.includes("resonance-stabilized")
  ) {
    return 1;
  }

  if (group.includes("methyl localized carbanion")) return 2;
  if (group.includes("primary localized carbanion")) return 3;
  if (group.includes("secondary localized carbanion")) return 4;
  if (group.includes("tertiary localized carbanion")) return 5;

  if (group.includes("carbanion")) return 6;

  return 999;
}

function getCationStabilityScore(molecule: ComparisonMolecule) {
  return (
    getBestCarbocationStabilityResult(molecule.cationStabilityResults)
      ?.stabilityScore ?? 999
  );
}

function getRadicalStabilityScore(molecule: ComparisonMolecule) {
  return (
    getBestCarbonRadicalStabilityResult(molecule.radicalStabilityResults)
      ?.stabilityScore ?? 999
  );
}

const ACID_BASE_TIE_TOLERANCE = 0.15;

function getAcidBaseRankingScore(
  molecule: ComparisonMolecule,
  rankingMode: RankingMode
): number | null {
  if (rankingMode === "acidity") {
    return molecule.acidityResults[0]?.estimatedPkaNumber ?? null;
  }

  if (rankingMode === "basicity") {
    return molecule.basicityResults[0]?.conjugateAcidPkaNumber ?? null;
  }

  return null;
}

function formatPkaRange(range: readonly [number, number]): string {
  return `${range[0]}–${range[1]}`;
}

export default function AcidBasePage() {
  const [ketcher, setKetcher] = useState<KetcherApi | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [status, setStatus] = useState("Draw a molecule first");
  const [smiles, setSmiles] = useState("Not analyzed yet");
  const [structureSvg, setStructureSvg] = useState<string | null>(null);
  const [functionalGroups, setFunctionalGroups] = useState<FunctionalGroupResult[]>([]);
  const [acidityResults, setAcidityResults] = useState<AcidityResult[]>([]);
  const [basicityResults, setBasicityResults] = useState<BasicityResult[]>([]);
  const [anionStabilityResults, setAnionStabilityResults] = useState<
    CarbanionStabilityResult[]
  >([]);
  const [cationStabilityResults, setCationStabilityResults] = useState<
    CarbocationStabilityResult[]
  >([]);
  const [radicalStabilityResults, setRadicalStabilityResults] = useState<
    CarbonRadicalStabilityResult[]
  >([]);
  const [comparisonMolecules, setComparisonMolecules] = useState<ComparisonMolecule[]>([]);
  const [rankingMode, setRankingMode] = useState<RankingMode>("acidity");

  const rankedComparison = useMemo(() => {
    return [...comparisonMolecules].sort((a, b) => {
      if (rankingMode === "anionStability") {
        const aStabilityScore = getAnionStabilityScore(a);
        const bStabilityScore = getAnionStabilityScore(b);

        if (aStabilityScore !== bStabilityScore) {
          return aStabilityScore - bStabilityScore;
        }

        const aAcidScore = a.acidityResults[0]?.estimatedPkaNumber;
        const bAcidScore = b.acidityResults[0]?.estimatedPkaNumber;

        if (aAcidScore === undefined && bAcidScore === undefined) return 0;
        if (aAcidScore === undefined) return 1;
        if (bAcidScore === undefined) return -1;

        return aAcidScore - bAcidScore;
      }

      if (rankingMode === "cationStability") {
        const aStabilityScore = getCationStabilityScore(a);
        const bStabilityScore = getCationStabilityScore(b);

        if (aStabilityScore !== bStabilityScore) {
          return aStabilityScore - bStabilityScore;
        }

        const aResult = getBestCarbocationStabilityResult(
          a.cationStabilityResults
        );
        const bResult = getBestCarbocationStabilityResult(
          b.cationStabilityResults
        );

        if (!aResult && !bResult) return 0;
        if (!aResult) return 1;
        if (!bResult) return -1;

        return aResult.stabilityShift - bResult.stabilityShift;
      }

      if (rankingMode === "radicalStability") {
        const aStabilityScore = getRadicalStabilityScore(a);
        const bStabilityScore = getRadicalStabilityScore(b);

        if (aStabilityScore !== bStabilityScore) {
          return aStabilityScore - bStabilityScore;
        }

        const aResult = getBestCarbonRadicalStabilityResult(
          a.radicalStabilityResults
        );
        const bResult = getBestCarbonRadicalStabilityResult(
          b.radicalStabilityResults
        );

        if (!aResult && !bResult) return 0;
        if (!aResult) return 1;
        if (!bResult) return -1;

        if (aResult.stabilityShift !== bResult.stabilityShift) {
          return aResult.stabilityShift - bResult.stabilityShift;
        }

        return bResult.stabilizerCount - aResult.stabilizerCount;
      }

      if (rankingMode === "boilingPoint") {
        if (!a.boilingPointResult && !b.boilingPointResult) return 0;
        if (!a.boilingPointResult) return 1;
        if (!b.boilingPointResult) return -1;

        return compareBoilingPointResults(
          a.boilingPointResult,
          b.boilingPointResult
        );
      }

      if (rankingMode === "solubility") {
        if (!a.solubilityResult && !b.solubilityResult) return 0;
        if (!a.solubilityResult) return 1;
        if (!b.solubilityResult) return -1;

        return compareSolubilityResults(
          a.solubilityResult,
          b.solubilityResult
        );
      }

      if (rankingMode === "cipPriority") {
        if (!a.cipPriorityResult && !b.cipPriorityResult) return 0;
        if (!a.cipPriorityResult) return 1;
        if (!b.cipPriorityResult) return -1;

        return compareCipSubstituentResults(
          a.cipPriorityResult,
          b.cipPriorityResult
        );
      }

      const aScore =
        rankingMode === "acidity"
          ? a.acidityResults[0]?.estimatedPkaNumber
          : a.basicityResults[0]?.conjugateAcidPkaNumber;

      const bScore =
        rankingMode === "acidity"
          ? b.acidityResults[0]?.estimatedPkaNumber
          : b.basicityResults[0]?.conjugateAcidPkaNumber;

      if (aScore === undefined && bScore === undefined) return 0;
      if (aScore === undefined) return 1;
      if (bScore === undefined) return -1;

      if (rankingMode === "acidity") {
        return aScore - bScore;
      }

      return bScore - aScore;
    });
  }, [comparisonMolecules, rankingMode]);

  const comparisonRankById = useMemo(() => {
    const rankById = new Map<number, number>();
    let previousAcidBaseScore: number | null = null;
    let previousRank = 0;
    let rankablePosition = 0;

    for (const molecule of rankedComparison) {
      const hasRankableResult =
        rankingMode === "acidity"
          ? Boolean(molecule.acidityResults[0])
          : rankingMode === "basicity"
          ? Boolean(molecule.basicityResults[0])
          : rankingMode === "anionStability"
          ? getAnionStabilityScore(molecule) < 999
          : rankingMode === "cationStability"
          ? getCationStabilityScore(molecule) < 999
          : rankingMode === "radicalStability"
          ? getRadicalStabilityScore(molecule) < 999
          : rankingMode === "boilingPoint"
          ? Boolean(molecule.boilingPointResult)
          : rankingMode === "solubility"
          ? Boolean(molecule.solubilityResult)
          : Boolean(molecule.cipPriorityResult);

      if (!hasRankableResult) continue;

      rankablePosition += 1;
      const currentAcidBaseScore = getAcidBaseRankingScore(
        molecule,
        rankingMode
      );
      const sharesApproximateRank =
        currentAcidBaseScore !== null &&
        previousAcidBaseScore !== null &&
        Math.abs(currentAcidBaseScore - previousAcidBaseScore) <=
          ACID_BASE_TIE_TOLERANCE;

      const rank = sharesApproximateRank ? previousRank : rankablePosition;
      rankById.set(molecule.id, rank);
      previousRank = rank;
      previousAcidBaseScore = currentAcidBaseScore;
    }

    return rankById;
  }, [rankedComparison, rankingMode]);

  const comparisonRankCounts = useMemo(() => {
    const counts = new Map<number, number>();

    for (const rank of comparisonRankById.values()) {
      counts.set(rank, (counts.get(rank) ?? 0) + 1);
    }

    return counts;
  }, [comparisonRankById]);

  async function analyzeAcidBaseMolecule() {
    if (!ketcher) {
      setStatus("Molecule editor is still loading. Try again in a second.");
      return;
    }

    setIsAnalyzing(true);
    setStatus("Analyzing acid/base behavior...");

    try {
      const rawSmiles = await ketcher.getSmiles();
      const safeSmiles = sanitizeDisplayedSmiles(rawSmiles);

      if (!safeSmiles) {
        setSmiles("No molecule detected");
        setStructureSvg(null);
        setFunctionalGroups([]);
        setAcidityResults([]);
        setBasicityResults([]);
        setAnionStabilityResults([]);
        setCationStabilityResults([]);
        setRadicalStabilityResults([]);
        setStatus("Draw a molecule before analyzing.");
        return;
      }

      if (safeSmiles.includes(".")) {
        setSmiles(safeSmiles);
        setStructureSvg(null);
        setFunctionalGroups([]);
        setAcidityResults([]);
        setBasicityResults([]);
        setAnionStabilityResults([]);
        setCationStabilityResults([]);
        setRadicalStabilityResults([]);
        setStatus("Please draw only one molecule at a time for acid/base analysis.");
        return;
      }

      const hierarchy = await analyzeFunctionalGroupHierarchy(safeSmiles);
      const [
        acidity,
        basicity,
        anionStability,
        cationStability,
        radicalStability,
        svg,
      ] = await Promise.all([
        analyzeAcidity(safeSmiles, hierarchy.primaryGroups),
        analyzeBasicity(safeSmiles, hierarchy.primaryGroups),
        analyzeCarbanionStability(safeSmiles),
        analyzeCarbocationStability(safeSmiles),
        analyzeCarbonRadicalStability(safeSmiles),
        getMoleculeSvg(safeSmiles),
      ]);

      setSmiles(safeSmiles);
      setStructureSvg(svg);
      setFunctionalGroups(hierarchy.functionalGroups);
      setAcidityResults(acidity);
      setBasicityResults(basicity);
      setAnionStabilityResults(anionStability);
      setCationStabilityResults(cationStability);
      setRadicalStabilityResults(radicalStability);
      setStatus("Acid/base and stability analysis complete.");
    } catch (error) {
      console.error("Acid/base analysis error:", error);
      setStatus("Something went wrong while analyzing acid/base behavior.");
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function addCurrentMoleculeToComparison() {
    if (!ketcher) {
      setStatus("Molecule editor is still loading. Try again in a second.");
      return;
    }

    if (isAnalyzing) return;

    if (comparisonMolecules.length >= 5) {
      setStatus("Comparison list is full. You can compare up to 5 molecules.");
      return;
    }

    setIsAnalyzing(true);
    setStatus("Analyzing molecule for comparison...");

    try {
      const rawSmiles = await ketcher.getSmiles();
      const safeSmiles = sanitizeDisplayedSmiles(rawSmiles);

      if (!safeSmiles) {
        setStatus("Draw a molecule before adding it to comparison.");
        return;
      }

      if (safeSmiles.includes(".")) {
        setStatus("Please draw only one molecule at a time before adding it to comparison.");
        return;
      }

      if (comparisonMolecules.some((molecule) => molecule.smiles === safeSmiles)) {
        setStatus("That molecule is already in the comparison list.");
        return;
      }

      const hierarchy = await analyzeFunctionalGroupHierarchy(safeSmiles);
      const [
        acidity,
        basicity,
        anionStability,
        cationStability,
        radicalStability,
        boilingPoint,
        solubility,
        cipPriority,
        svg,
      ] = await Promise.all([
        analyzeAcidity(safeSmiles, hierarchy.primaryGroups),
        analyzeBasicity(safeSmiles, hierarchy.primaryGroups),
        analyzeCarbanionStability(safeSmiles),
        analyzeCarbocationStability(safeSmiles),
        analyzeCarbonRadicalStability(safeSmiles),
        analyzeBoilingPointRanking(safeSmiles, hierarchy.functionalGroups),
        analyzeSolubilityRanking(safeSmiles, hierarchy.functionalGroups),
        analyzeCipSubstituentPriority(safeSmiles),
        getMoleculeSvg(safeSmiles),
      ]);

      const nextLabel = getNextComparisonLabel(comparisonMolecules);

      const newMolecule: ComparisonMolecule = {
        id: Date.now() + Math.random(),
        label: nextLabel,
        smiles: safeSmiles,
        structureSvg: svg,
        functionalGroups: hierarchy.functionalGroups,
        acidityResults: acidity,
        basicityResults: basicity,
        anionStabilityResults: anionStability,
        cationStabilityResults: cationStability,
        radicalStabilityResults: radicalStability,
        boilingPointResult: boilingPoint,
        solubilityResult: solubility,
        cipPriorityResult: cipPriority,
      };

      setComparisonMolecules((prev) => [...prev, newMolecule]);
      setSmiles(safeSmiles);
      setStructureSvg(svg);
      setFunctionalGroups(hierarchy.functionalGroups);
      setAcidityResults(acidity);
      setBasicityResults(basicity);
      setAnionStabilityResults(anionStability);
      setCationStabilityResults(cationStability);
      setRadicalStabilityResults(radicalStability);
      setStatus(`${nextLabel} added to comparison.`);
    } catch (error) {
      console.error("Add to acid/base comparison error:", error);
      setStatus("Something went wrong while adding the molecule to comparison.");
    } finally {
      setIsAnalyzing(false);
    }
  }

  function deleteComparisonMolecule(id: number) {
    setComparisonMolecules((prev) => prev.filter((molecule) => molecule.id !== id));
    setStatus("Molecule removed from comparison.");
  }

  async function clearAcidBaseWorkspace() {
    await ketcher?.setMolecule("");
    setStatus("Draw a molecule first");
    setSmiles("Not analyzed yet");
    setStructureSvg(null);
    setFunctionalGroups([]);
    setAcidityResults([]);
    setBasicityResults([]);
    setAnionStabilityResults([]);
    setCationStabilityResults([]);
    setRadicalStabilityResults([]);
  }

  function clearComparison() {
    setComparisonMolecules([]);
    setStatus("All comparison molecules deleted.");
  }

  const strongestAcid = acidityResults[0];
  const strongestBase = basicityResults[0];
  const strongestAnion = getBestCarbanionStabilityResult(anionStabilityResults);
  const strongestCation = getBestCarbocationStabilityResult(
    cationStabilityResults
  );
  const strongestRadical = getBestCarbonRadicalStabilityResult(
    radicalStabilityResults
  );

  return (
    <section className="acid-base-page">

      <section className="acid-base-workspace">
        <div className="card acid-base-drawer-card">
          <div className="card-header">
            <div>
              <h2>Acid/Base Drawer</h2>
              <p>Draw one molecule, then analyze or add it to the comparison set.</p>
            </div>
            <span className="status">Draw Mode</span>
          </div>

          <div className="acid-base-ketcher-box">
            <MoleculeDrawer
              globalKey="acidBaseKetcher"
              onReady={(api) => setKetcher(api)}
            />
          </div>

          <div className="button-row">
            <button
              className="primary-button"
              onClick={analyzeAcidBaseMolecule}
              disabled={isAnalyzing}
            >
              {isAnalyzing ? "Analyzing..." : "Analyze Acid/Base"}
            </button>

            <button
              className="secondary-button"
              onClick={addCurrentMoleculeToComparison}
              disabled={isAnalyzing}
            >
              Add to Comparison
            </button>

            <button
              className="secondary-button"
              onClick={clearAcidBaseWorkspace}
              disabled={isAnalyzing}
            >
              Clear Molecule
            </button>

            <button
              className="secondary-button"
              onClick={clearComparison}
              disabled={isAnalyzing || comparisonMolecules.length === 0}
            >
              Clear Comparison
            </button>
          </div>

          <div className="analysis-section">
            <p className="label">SMILES</p>
            <p className="smiles-output">{smiles}</p>
          </div>

          {structureSvg && (
            <div className="analysis-section">
              <p className="label">Current Molecule</p>
              <div
                className="acid-base-current-preview"
                dangerouslySetInnerHTML={{ __html: structureSvg }}
              />
            </div>
          )}
        </div>

        <div className="acid-base-results-column">
          <div className="acid-base-summary-grid">
            <div className="acid-base-summary-card">
              <span>Strongest acidic site</span>
              <strong>
                {strongestAcid
                  ? `${strongestAcid.acidicSite} (atom ${strongestAcid.siteAtomIndex + 1})`
                  : "None detected"}
              </strong>
              <p>
                {strongestAcid
                  ? `Estimated pKa ${strongestAcid.estimatedPka} · typical range ${formatPkaRange(
                      strongestAcid.estimatedPkaRange
                    )} · ${strongestAcid.confidence.toLowerCase()} confidence`
                  : "Analyze a molecule first."}
              </p>
            </div>

            <div className="acid-base-summary-card">
              <span>Strongest basic site</span>
              <strong>
                {strongestBase
                  ? `${strongestBase.basicSite} (atom ${strongestBase.siteAtomIndex + 1})`
                  : "None detected"}
              </strong>
              <p>
                {strongestBase
                  ? `Conjugate acid pKa ${strongestBase.conjugateAcidPka} · ${strongestBase.confidence.toLowerCase()} confidence`
                  : "Analyze a molecule first."}
              </p>
            </div>

            <div className="acid-base-summary-card">
              <span>Detected groups</span>
              <strong>{functionalGroups.length}</strong>
              <p>
                {functionalGroups.length > 0
                  ? functionalGroups.map((group) => group.name).join(", ")
                  : "No groups loaded yet."}
              </p>
            </div>
          </div>

          <div className="card acid-base-result-card">
            <p className="label">Acidity Estimate</p>

            {acidityResults.length === 0 ? (
              <p className="empty">No acidic sites estimated yet.</p>
            ) : (
              <div className="group-list">
                {acidityResults.map((result, index) => (
                  <div
                    className="group-card"
                    key={`${result.relatedGroup}-${result.acidicSite}-${index}`}
                  >
                    <div className="group-card-header">
                      <h3>
                        {index === 0 ? "Strongest acidic site" : "Weaker acidic site"}: {result.acidicSite}
                      </h3>
                      <span>pKa {result.estimatedPka}</span>
                    </div>

                    <p>
                      <strong>Related group:</strong> {result.relatedGroup}
                    </p>
                    <p>
                      <strong>Detected atom:</strong> Atom {result.siteAtomIndex + 1} · {result.confidence.toLowerCase()} confidence
                    </p>
                    <p>
                      <strong>Typical pKa range:</strong>{" "}
                      {formatPkaRange(result.estimatedPkaRange)}
                    </p>
                    <p>
                      <strong>A — Atom:</strong> {result.atom}
                    </p>
                    <p>
                      <strong>R — Resonance:</strong> {result.resonance}
                    </p>
                    <p>
                      <strong>I — Induction:</strong> {result.induction}
                    </p>
                    <p>
                      <strong>O — Orbital:</strong> {result.orbital}
                    </p>
                    <p>{result.explanation}</p>

                    {result.modifiers.length > 0 && (
                      <p>
                        <strong>pKa modifier:</strong> {result.modifiers.join(" ")}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card acid-base-result-card">
            <p className="label">Basicity Estimate</p>

            {basicityResults.length === 0 ? (
              <p className="empty">No basic sites estimated yet.</p>
            ) : (
              <div className="group-list">
                {basicityResults.map((result, index) => (
                  <div
                    className="group-card"
                    key={`${result.relatedGroup}-${result.basicSite}-${index}`}
                  >
                    <div className="group-card-header">
                      <h3>{result.basicSite}</h3>
                      <span>conj. acid pKa {result.conjugateAcidPka}</span>
                    </div>

                    <p>
                      <strong>Related group:</strong> {result.relatedGroup}
                    </p>
                    <p>
                      <strong>Detected atom:</strong> Atom {result.siteAtomIndex + 1} · {result.confidence.toLowerCase()} confidence
                    </p>
                    <p>{result.explanation}</p>

                    {result.modifiers.length > 0 && (
                      <p>
                        <strong>Basicity modifier:</strong> {result.modifiers.join(" ")}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {(anionStabilityResults.length > 0 ||
            cationStabilityResults.length > 0 ||
            radicalStabilityResults.length > 0) && (
            <div className="card acid-base-result-card">
              <p className="label">Carbon Intermediate Stability</p>

              <div className="group-list">
                {strongestAnion && (
                  <div className="group-card">
                    <div className="group-card-header">
                      <h3>
                        Carbanion at atom {strongestAnion.chargedAtomIndex + 1}
                      </h3>
                      <span>score {strongestAnion.stabilityScore}</span>
                    </div>
                    <p>
                      <strong>Substitution:</strong> {strongestAnion.substitution}
                    </p>
                    <p>
                      <strong>Nearest stabilizer:</strong>{" "}
                      {strongestAnion.nearestStabilizer ?? "None detected"}
                    </p>
                    <p>{strongestAnion.explanation}</p>
                  </div>
                )}

                {strongestCation && (
                  <div className="group-card">
                    <div className="group-card-header">
                      <h3>
                        Carbocation at atom {strongestCation.chargedAtomIndex + 1}
                      </h3>
                      <span>score {strongestCation.stabilityScore}</span>
                    </div>
                    <p>
                      <strong>Substitution:</strong> {strongestCation.substitution}
                    </p>
                    <p>
                      <strong>Nearest stabilizer:</strong>{" "}
                      {strongestCation.nearestStabilizer ?? "None detected"}
                    </p>
                    <p>{strongestCation.explanation}</p>
                  </div>
                )}

                {strongestRadical && (
                  <div className="group-card">
                    <div className="group-card-header">
                      <h3>
                        Carbon radical at atom {strongestRadical.radicalAtomIndex + 1}
                      </h3>
                      <span>score {strongestRadical.stabilityScore}</span>
                    </div>
                    <p>
                      <strong>Type:</strong> {strongestRadical.centerType}
                    </p>
                    <p>
                      <strong>Substitution:</strong> {strongestRadical.substitution}
                    </p>
                    <p>
                      <strong>Nearest stabilizer:</strong>{" "}
                      {strongestRadical.nearestStabilizer ?? "None detected"}
                    </p>
                    <p>{strongestRadical.explanation}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="card acid-base-result-card">
            <div className="group-card-header">
              <div>
                <p className="label">Compare Molecules</p>
                <p className="empty">Add up to five molecules, then choose the ranking mode.</p>
              </div>

            </div>

            <div className="acid-base-ranking-row">
              <label>
                <input
                  type="radio"
                  name="acidBaseRankingMode"
                  value="acidity"
                  checked={rankingMode === "acidity"}
                  onChange={() => setRankingMode("acidity")}
                />
                Rank by acidity
              </label>

              <label>
                <input
                  type="radio"
                  name="acidBaseRankingMode"
                  value="basicity"
                  checked={rankingMode === "basicity"}
                  onChange={() => setRankingMode("basicity")}
                />
                Rank by basicity
              </label>

              <label>
                <input
                  type="radio"
                  name="acidBaseRankingMode"
                  value="anionStability"
                  checked={rankingMode === "anionStability"}
                  onChange={() => setRankingMode("anionStability")}
                />
                Rank by anion stability
              </label>

              <label>
                <input
                  type="radio"
                  name="acidBaseRankingMode"
                  value="cationStability"
                  checked={rankingMode === "cationStability"}
                  onChange={() => setRankingMode("cationStability")}
                />
                Rank by cation stability
              </label>

              <label>
                <input
                  type="radio"
                  name="acidBaseRankingMode"
                  value="radicalStability"
                  checked={rankingMode === "radicalStability"}
                  onChange={() => setRankingMode("radicalStability")}
                />
                Rank by radical stability
              </label>


              <label>
                <input
                  type="radio"
                  name="acidBaseRankingMode"
                  value="boilingPoint"
                  checked={rankingMode === "boilingPoint"}
                  onChange={() => setRankingMode("boilingPoint")}
                />
                Rank by boiling point
              </label>

              <label>
                <input
                  type="radio"
                  name="acidBaseRankingMode"
                  value="solubility"
                  checked={rankingMode === "solubility"}
                  onChange={() => setRankingMode("solubility")}
                />
                Rank by water solubility
              </label>

              <label>
                <input
                  type="radio"
                  name="acidBaseRankingMode"
                  value="cipPriority"
                  checked={rankingMode === "cipPriority"}
                  onChange={() => setRankingMode("cipPriority")}
                />
                Rank by CIP priority
              </label>
            </div>

            {comparisonMolecules.length === 0 ? (
              <p className="empty">Draw molecules and click Add to Comparison.</p>
            ) : (
              <div className="group-list acid-base-comparison-list">
                {rankedComparison.map((molecule) => {
                  const bestAcid = molecule.acidityResults[0];
                  const bestBase = molecule.basicityResults[0];
                  const bestAnion = getBestCarbanionStabilityResult(
                    molecule.anionStabilityResults
                  );
                  const bestCation = getBestCarbocationStabilityResult(
                    molecule.cationStabilityResults
                  );
                  const bestRadical = getBestCarbonRadicalStabilityResult(
                    molecule.radicalStabilityResults
                  );
                  const displayRank = comparisonRankById.get(molecule.id);
                  const hasApproximateTie =
                    displayRank !== undefined &&
                    (comparisonRankCounts.get(displayRank) ?? 0) > 1 &&
                    (rankingMode === "acidity" || rankingMode === "basicity");
                  const hasRankableSite =
                    rankingMode === "acidity"
                      ? Boolean(bestAcid)
                      : rankingMode === "basicity"
                      ? Boolean(bestBase)
                      : rankingMode === "anionStability"
                      ? getAnionStabilityScore(molecule) < 999
                      : rankingMode === "cationStability"
                      ? Boolean(bestCation)
                      : rankingMode === "radicalStability"
                      ? Boolean(bestRadical)
                      : rankingMode === "boilingPoint"
                      ? Boolean(molecule.boilingPointResult)
                      : rankingMode === "solubility"
                      ? Boolean(molecule.solubilityResult)
                      : Boolean(molecule.cipPriorityResult);

                  return (
                    <div className="group-card comparison-card" key={molecule.id}>
                      <div className="group-card-header">
                        <h3>
                          {hasRankableSite && displayRank !== undefined
                            ? `#${displayRank}: ${molecule.label}`
                            : `Unranked: ${molecule.label}`}
                        </h3>

                        <button
                          className="secondary-button"
                          type="button"
                          onClick={() => deleteComparisonMolecule(molecule.id)}
                        >
                          Delete
                        </button>
                      </div>

                      <div className="comparison-content">
                        {molecule.structureSvg && (
                          <div
                            className="molecule-preview"
                            dangerouslySetInnerHTML={{ __html: molecule.structureSvg }}
                          />
                        )}

                        <div className="comparison-details">
                          {hasRankableSite ? (
                            rankingMode === "anionStability" ? (
                              <p>
                                <strong>Stability basis:</strong>{" "}
                                {bestAnion
                                  ? bestAnion.nearestStabilizer ??
                                    `${bestAnion.substitution} substitution`
                                  : bestBase?.relatedGroup ?? "Detected anion"}
                              </p>
                            ) : rankingMode === "cationStability" ? (
                              <p>
                                <strong>Stability basis:</strong>{" "}
                                {bestCation?.nearestStabilizer ??
                                  `${bestCation?.substitution ?? "unknown"} substitution`}
                              </p>
                            ) : rankingMode === "radicalStability" ? (
                              <p>
                                <strong>Stability basis:</strong>{" "}
                                {bestRadical?.nearestStabilizer ??
                                  `${bestRadical?.substitution ?? "unknown"} substitution`}
                              </p>
                            ) : rankingMode === "boilingPoint" ? (
                              <p>
                                <strong>Boiling-point tendency:</strong>{" "}
                                {molecule.boilingPointResult?.tendency} (score{" "}
                                {molecule.boilingPointResult?.boilingPointScore})
                              </p>
                            ) : rankingMode === "solubility" ? (
                              <p>
                                <strong>Water-solubility tendency:</strong>{" "}
                                {molecule.solubilityResult?.tendency} (score{" "}
                                {molecule.solubilityResult?.waterSolubilityScore})
                              </p>
                            ) : rankingMode === "cipPriority" ? (
                              <p>
                                <strong>CIP attachment atom:</strong>{" "}
                                {molecule.cipPriorityResult?.rootElement} at atom{" "}
                                {(molecule.cipPriorityResult?.rootAtomIndex ?? 0) + 1}
                              </p>
                            ) : (
                              <p>
                                <strong>
                                  {rankingMode === "acidity"
                                    ? "Estimated pKa:"
                                    : "Conjugate acid pKa:"}
                                </strong>{" "}
                                {rankingMode === "acidity"
                                  ? bestAcid?.estimatedPka
                                  : bestBase?.conjugateAcidPka}
                              </p>
                            )
                          ) : (
                            <p className="empty">
                              No {
                                rankingMode === "acidity"
                                  ? "acidic"
                                  : rankingMode === "basicity"
                                  ? "basic"
                                  : rankingMode === "anionStability"
                                  ? "anionic carbon"
                                  : rankingMode === "cationStability"
                                  ? "cationic carbon"
                                  : rankingMode === "radicalStability"
                                  ? "carbon radical"
                                  : rankingMode === "boilingPoint"
                                  ? "boiling-point result"
                                  : rankingMode === "solubility"
                                  ? "water-solubility result"
                                  : "CIP attachment atom"
                              } detected for ranking.
                            </p>
                          )}

                          {hasRankableSite &&
                            rankingMode === "acidity" &&
                            bestAcid && (
                              <p>
                                <strong>Typical pKa range:</strong>{" "}
                                {formatPkaRange(bestAcid.estimatedPkaRange)}
                              </p>
                            )}

                          {hasApproximateTie && (
                            <p className="empty">
                              Approximate tie: the estimated pKa centers differ by 0.15 or less.
                            </p>
                          )}

                          <p className="comparison-smiles">
                            <strong>SMILES:</strong> <code>{molecule.smiles}</code>
                          </p>

                          {hasRankableSite &&
                            rankingMode === "acidity" &&
                            bestAcid && (
                              <>
                                <p>
                                  <strong>Strongest acidic site:</strong>{" "}
                                  {bestAcid.acidicSite} at atom {bestAcid.siteAtomIndex + 1}
                                </p>
                                <p>{bestAcid.explanation}</p>
                              </>
                            )}

                          {hasRankableSite &&
                            rankingMode === "basicity" &&
                            bestBase && (
                              <>
                                <p>
                                  <strong>Strongest basic site:</strong>{" "}
                                  {bestBase.basicSite} at atom {bestBase.siteAtomIndex + 1}
                                </p>
                                <p>{bestBase.explanation}</p>
                              </>
                            )}

                          {hasRankableSite &&
                            rankingMode === "anionStability" &&
                            bestAnion && (
                              <>
                                <p>
                                  <strong>Charged carbon:</strong> Atom{" "}
                                  {bestAnion.chargedAtomIndex + 1}
                                </p>
                                <p>{bestAnion.explanation}</p>
                              </>
                            )}

                          {hasRankableSite &&
                            rankingMode === "cationStability" &&
                            bestCation && (
                              <>
                                <p>
                                  <strong>Charged carbon:</strong> Atom{" "}
                                  {bestCation.chargedAtomIndex + 1}
                                </p>
                                <p>{bestCation.explanation}</p>
                              </>
                            )}

                          {hasRankableSite &&
                            rankingMode === "radicalStability" &&
                            bestRadical && (
                              <>
                                <p>
                                  <strong>Radical carbon:</strong> Atom{" "}
                                  {bestRadical.radicalAtomIndex + 1}
                                </p>
                                <p>
                                  <strong>Radical type:</strong>{" "}
                                  {bestRadical.centerType}
                                </p>
                                <p>{bestRadical.explanation}</p>
                              </>
                            )}


                          {hasRankableSite &&
                            rankingMode === "boilingPoint" &&
                            molecule.boilingPointResult && (
                              <>
                                <p>
                                  <strong>Molecular weight:</strong>{" "}
                                  {molecule.boilingPointResult.molecularWeight?.toFixed(2) ??
                                    "Unavailable"}
                                </p>
                                <p>{molecule.boilingPointResult.explanation}</p>
                              </>
                            )}

                          {hasRankableSite &&
                            rankingMode === "solubility" &&
                            molecule.solubilityResult && (
                              <>
                                <p>
                                  <strong>logP:</strong>{" "}
                                  {molecule.solubilityResult.logP?.toFixed(2) ??
                                    "Unavailable"}
                                </p>
                                <p>{molecule.solubilityResult.explanation}</p>
                              </>
                            )}

                          {hasRankableSite &&
                            rankingMode === "cipPriority" &&
                            molecule.cipPriorityResult && (
                              <>
                                <p>
                                  <strong>Direct atomic number:</strong>{" "}
                                  {molecule.cipPriorityResult.directAtomicNumber}
                                </p>
                                <p>{molecule.cipPriorityResult.explanation}</p>
                                {molecule.cipPriorityResult.attachmentSource ===
                                  "firstAtomFallback" && (
                                  <p className="empty">
                                    Draw * bonded to the substituent for an explicit
                                    CIP attachment point.
                                  </p>
                                )}
                              </>
                            )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>
    </section>
  );
}