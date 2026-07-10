import { useMemo, useState } from "react";
import MoleculeDrawer, { type KetcherApi } from "./MoleculeDrawer";
import {
  analyzeFunctionalGroupHierarchy,
  getMoleculeSvg,
  type FunctionalGroupResult,
} from "../utils/functionalGroups";
import { analyzeAcidity, type AcidityResult } from "../utils/analyzeAcidity";
import { analyzeBasicity, type BasicityResult } from "../utils/analyzeBasicity";
import "ketcher-react/dist/index.css";

type RankingMode = "acidity" | "basicity" | "anionStability";

type ComparisonMolecule = {
  id: number;
  label: string;
  smiles: string;
  structureSvg: string | null;
  functionalGroups: FunctionalGroupResult[];
  acidityResults: AcidityResult[];
  basicityResults: BasicityResult[];
};

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

export default function AcidBasePage() {
  const [ketcher, setKetcher] = useState<KetcherApi | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [status, setStatus] = useState("Draw a molecule first");
  const [smiles, setSmiles] = useState("Not analyzed yet");
  const [structureSvg, setStructureSvg] = useState<string | null>(null);
  const [functionalGroups, setFunctionalGroups] = useState<FunctionalGroupResult[]>([]);
  const [acidityResults, setAcidityResults] = useState<AcidityResult[]>([]);
  const [basicityResults, setBasicityResults] = useState<BasicityResult[]>([]);
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
        setStatus("Draw a molecule before analyzing.");
        return;
      }

      if (safeSmiles.includes(".")) {
        setSmiles(safeSmiles);
        setStructureSvg(null);
        setFunctionalGroups([]);
        setAcidityResults([]);
        setBasicityResults([]);
        setStatus("Please draw only one molecule at a time for acid/base analysis.");
        return;
      }

      const hierarchy = await analyzeFunctionalGroupHierarchy(safeSmiles);
      const acidity = await analyzeAcidity(safeSmiles, hierarchy.primaryGroups);
      const basicity = await analyzeBasicity(safeSmiles, hierarchy.primaryGroups);
      const svg = await getMoleculeSvg(safeSmiles);

      setSmiles(safeSmiles);
      setStructureSvg(svg);
      setFunctionalGroups(hierarchy.functionalGroups);
      setAcidityResults(acidity);
      setBasicityResults(basicity);
      setStatus("Acid/base analysis complete.");
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

    if (comparisonMolecules.length >= 5) {
      setStatus("Comparison list is full. You can compare up to 5 molecules.");
      return;
    }

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

      const hierarchy = await analyzeFunctionalGroupHierarchy(safeSmiles);
      const acidity = await analyzeAcidity(safeSmiles, hierarchy.primaryGroups);
      const basicity = await analyzeBasicity(safeSmiles, hierarchy.primaryGroups);
      const svg = await getMoleculeSvg(safeSmiles);

      const nextLabel = `Molecule ${String.fromCharCode(65 + comparisonMolecules.length)}`;

      const newMolecule: ComparisonMolecule = {
        id: Date.now(),
        label: nextLabel,
        smiles: safeSmiles,
        structureSvg: svg,
        functionalGroups: hierarchy.functionalGroups,
        acidityResults: acidity,
        basicityResults: basicity,
      };

      setComparisonMolecules((prev) => [...prev, newMolecule]);
      setSmiles(safeSmiles);
      setStructureSvg(svg);
      setFunctionalGroups(hierarchy.functionalGroups);
      setAcidityResults(acidity);
      setBasicityResults(basicity);
      setStatus(`${nextLabel} added to comparison.`);
    } catch (error) {
      console.error("Add to acid/base comparison error:", error);
      setStatus("Something went wrong while adding the molecule to comparison.");
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
  }

  function clearComparison() {
    setComparisonMolecules([]);
    setStatus("Comparison list cleared.");
  }

  const strongestAcid = acidityResults[0];
  const strongestBase = basicityResults[0];

  return (
    <section className="acid-base-page">
      <div className="card acid-base-intro-card">
        <div>
          <p className="eyebrow">Acid/Base Workspace</p>
          <h2>Acidity, basicity, and comparison</h2>
          <p>
            Use this page when you want to reason about pKa, conjugate-base stability,
            basic sites, and relative rankings between molecules.
          </p>
        </div>

        <div className="acid-base-status-pill">{status}</div>
      </div>

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

            <button className="secondary-button" onClick={addCurrentMoleculeToComparison}>
              Add to Comparison
            </button>

            <button className="secondary-button" onClick={clearAcidBaseWorkspace}>
              Clear Molecule
            </button>

            <button className="secondary-button" onClick={clearComparison}>
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
              <strong>{strongestAcid?.acidicSite ?? "None detected"}</strong>
              <p>{strongestAcid ? `Estimated pKa ${strongestAcid.estimatedPka}` : "Analyze a molecule first."}</p>
            </div>

            <div className="acid-base-summary-card">
              <span>Strongest basic site</span>
              <strong>{strongestBase?.basicSite ?? "None detected"}</strong>
              <p>
                {strongestBase
                  ? `Conjugate acid pKa ${strongestBase.conjugateAcidPka}`
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
            </div>

            {comparisonMolecules.length === 0 ? (
              <p className="empty">Draw molecules and click Add to Comparison.</p>
            ) : (
              <div className="group-list acid-base-comparison-list">
                {rankedComparison.map((molecule, index) => {
                  const bestAcid = molecule.acidityResults[0];
                  const bestBase = molecule.basicityResults[0];
                  const hasRankableSite =
                    rankingMode === "acidity" ? Boolean(bestAcid) : Boolean(bestBase);

                  return (
                    <div className="group-card comparison-card" key={molecule.id}>
                      <div className="group-card-header">
                        <h3>
                          {hasRankableSite
                            ? `#${index + 1}: ${molecule.label}`
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
                                <strong>Stability basis:</strong> {bestBase.relatedGroup}
                              </p>
                            ) : (
                              <p>
                                <strong>
                                  {rankingMode === "acidity"
                                    ? "Estimated pKa:"
                                    : "Conjugate acid pKa:"}
                                </strong>{" "}
                                {rankingMode === "acidity"
                                  ? bestAcid.estimatedPka
                                  : bestBase.conjugateAcidPka}
                              </p>
                            )
                          ) : (
                            <p className="empty">
                              No {rankingMode === "acidity" ? "acidic" : "basic"} site detected for ranking.
                            </p>
                          )}

                          <p className="comparison-smiles">
                            <strong>SMILES:</strong> <code>{molecule.smiles}</code>
                          </p>

                          {hasRankableSite && rankingMode === "acidity" && (
                            <>
                              <p>
                                <strong>Strongest acidic site:</strong> {bestAcid.acidicSite}
                              </p>
                              <p>{bestAcid.explanation}</p>
                            </>
                          )}

                          {hasRankableSite && rankingMode !== "acidity" && (
                            <>
                              <p>
                                <strong>Strongest basic site:</strong> {bestBase.basicSite}
                              </p>
                              <p>{bestBase.explanation}</p>
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
