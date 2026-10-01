import { useMemo, useState } from "react";
import MoleculeDrawer, { type KetcherApi } from "./MoleculeDrawer";
import {
  analyzeFunctionalGroupHierarchy,
  getMoleculeSvg,
} from "../utils/functionalGroups";
import {
  analyzeComparisonMolecule,
  COMPARISON_CATEGORIES,
  COMPARISON_MODES,
  getComparisonMode,
  rankComparisonEntries,
  type ComparisonCategory,
  type ComparisonMetric,
  type ComparisonModeId,
  type ComparisonProfile,
} from "../utils/ranking/comparisonAnalysis";

type ComparisonMolecule = {
  id: number;
  label: string;
  smiles: string;
  structureSvg: string | null;
  profile: ComparisonProfile;
};

const COMPARISON_LABELS = [
  "Molecule A",
  "Molecule B",
  "Molecule C",
  "Molecule D",
  "Molecule E",
] as const;

function getNextComparisonLabel(molecules: ComparisonMolecule[]) {
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
  if (!trimmed || isMolBlockLike(trimmed)) return "";
  return trimmed;
}

function metricsTie(
  first: ComparisonMetric,
  second: ComparisonMetric,
  tolerance = 1e-9,
) {
  if (first.sortVector || second.sortVector) {
    if (!first.sortVector || !second.sortVector) return false;
    if (first.sortVector.length !== second.sortVector.length) return false;
    return first.sortVector.every(
      (value, index) => value === second.sortVector?.[index],
    );
  }

  if (first.score === null || second.score === null) return false;
  return Math.abs(first.score - second.score) <= tolerance;
}

export default function RankingPage() {
  const [ketcher, setKetcher] = useState<KetcherApi | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [status, setStatus] = useState("Add a molecule to begin comparing.");
  const [comparisonMolecules, setComparisonMolecules] = useState<ComparisonMolecule[]>([]);
  const [activeCategory, setActiveCategory] = useState<ComparisonCategory>("Electronic effects");
  const [rankingMode, setRankingMode] = useState<ComparisonModeId>("ewgStrength");

  const activeMode = getComparisonMode(rankingMode);
  const visibleModes = useMemo(
    () => COMPARISON_MODES.filter((mode) => mode.category === activeCategory),
    [activeCategory],
  );

  const rankedRows = useMemo(() => {
    const rows = comparisonMolecules.map((molecule) => ({
      molecule,
      metric: molecule.profile.metrics[rankingMode],
    }));
    return rankComparisonEntries(rows, activeMode);
  }, [activeMode, comparisonMolecules, rankingMode]);

  const rankById = useMemo(() => {
    const map = new Map<number, number>();
    if (activeMode.direction === "none") return map;

    let previousMetric: ComparisonMetric | null = null;
    let previousRank = 0;
    let rankablePosition = 0;

    for (const row of rankedRows) {
      if (row.metric.score === null && !row.metric.sortVector) continue;
      rankablePosition += 1;
      const tied =
        previousMetric !== null &&
        metricsTie(row.metric, previousMetric, activeMode.tieTolerance ?? 1e-9);
      const rank = tied ? previousRank : rankablePosition;
      map.set(row.molecule.id, rank);
      previousMetric = row.metric;
      previousRank = rank;
    }

    return map;
  }, [activeMode, rankedRows]);

  async function addCurrentMoleculeToComparison(throwOnError = false) {
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
    setStatus("Calculating all comparison modes for this molecule…");

    try {
      const rawSmiles = await ketcher.getSmiles();
      const safeSmiles = sanitizeDisplayedSmiles(rawSmiles);

      if (!safeSmiles) {
        setStatus("Draw or enter a molecule before adding it to comparison.");
        return;
      }

      if (safeSmiles.includes(".")) {
        setStatus("Please use one molecule at a time on the Ranking page.");
        return;
      }

      if (comparisonMolecules.some((molecule) => molecule.smiles === safeSmiles)) {
        setStatus("That molecule is already in the comparison list.");
        return;
      }

      const hierarchy = await analyzeFunctionalGroupHierarchy(safeSmiles);
      const [profile, svg] = await Promise.all([
        analyzeComparisonMolecule(safeSmiles, hierarchy),
        getMoleculeSvg(safeSmiles),
      ]);

      const nextLabel = getNextComparisonLabel(comparisonMolecules);
      const newMolecule: ComparisonMolecule = {
        id: Date.now() + Math.random(),
        label: nextLabel,
        smiles: safeSmiles,
        structureSvg: svg,
        profile,
      };

      setComparisonMolecules((previous) => [...previous, newMolecule]);
      setStatus(`${nextLabel} added. All comparison categories are ready.`);
    } catch (error) {
      console.error("Ranking comparison analysis error:", error);
      setStatus("Something went wrong while calculating comparison modes.");
      if (throwOnError) throw error;
    } finally {
      setIsAnalyzing(false);
    }
  }

  function deleteComparisonMolecule(id: number) {
    setComparisonMolecules((previous) => previous.filter((molecule) => molecule.id !== id));
    setStatus("Molecule removed from comparison.");
  }

  async function clearCurrentMolecule() {
    await ketcher?.setMolecule("");
    setStatus("Editor cleared. Your comparison set is unchanged.");
  }

  function clearComparison() {
    setComparisonMolecules([]);
    setStatus("Comparison set cleared.");
  }

  function selectCategory(category: ComparisonCategory) {
    setActiveCategory(category);
    const firstMode = COMPARISON_MODES.find((mode) => mode.category === category);
    if (firstMode) setRankingMode(firstMode.id);
  }

  return (
    <section className="ranking-page">
      <div className="ranking-hero">
        <div>
          <p className="ranking-eyebrow">Organic chemistry comparison workspace</p>
          <h1>Ranking</h1>
          <p>
            Add up to five molecules once, then compare electronic effects,
            stability, mechanisms, spectroscopy, physical properties, and more.
          </p>
        </div>
        <div className="ranking-count-card" aria-label={`${comparisonMolecules.length} comparison molecules`}>
          <strong>{comparisonMolecules.length}</strong>
          <span>/ 5 molecules</span>
        </div>
      </div>

      <div className="ranking-workspace">
        <aside className="card ranking-editor-card">
          <div className="card-header">
            <div>
              <h2>Add molecule</h2>
              <p>Draw a structure or type a common/IUPAC name below the editor.</p>
            </div>
            <span className={`status ${ketcher ? "ready" : "loading"}`}>
              {ketcher ? "Editor ready" : "Loading editor"}
            </span>
          </div>

          <div className="ranking-ketcher-box">
            <MoleculeDrawer
              globalKey="rankingKetcher"
              onReady={setKetcher}
              onNameSubmitProcess={() => addCurrentMoleculeToComparison(true)}
            />
          </div>

          <div className="ranking-editor-actions">
            <button
              className="primary-button"
              onClick={() => void addCurrentMoleculeToComparison()}
              disabled={isAnalyzing || !ketcher || comparisonMolecules.length >= 5}
            >
              {isAnalyzing ? "Analyzing…" : "Add to comparison"}
            </button>
            <button
              className="secondary-button"
              onClick={clearCurrentMolecule}
              disabled={isAnalyzing || !ketcher}
            >
              Clear editor
            </button>
            <button
              className="secondary-button"
              onClick={clearComparison}
              disabled={isAnalyzing || comparisonMolecules.length === 0}
            >
              Clear all
            </button>
          </div>

          <p className="reaction-progress ranking-status" aria-live="polite">
            {isAnalyzing && <span className="loading-spinner" aria-hidden="true" />}
            {status}
          </p>

          <div className="ranking-editor-note">
            <strong>One analysis, every mode.</strong>
            <span>
              PocketChem calculates the comparison profile when a molecule is added,
              so switching categories does not re-run the molecule.
            </span>
          </div>
        </aside>

        <main className="ranking-main-column">
          <section className="card ranking-selector-card">
            <div className="ranking-selector-heading">
              <div>
                <p className="label">Comparison category</p>
                <h2>{activeCategory}</h2>
              </div>
              <span className="ranking-mode-count">
                {visibleModes.length} mode{visibleModes.length === 1 ? "" : "s"}
              </span>
            </div>

            <div className="ranking-select-grid">
              <label className="ranking-select-field">
                <span>Category</span>
                <select
                  value={activeCategory}
                  onChange={(event) =>
                    selectCategory(event.target.value as ComparisonCategory)
                  }
                  aria-label="Comparison category"
                >
                  {COMPARISON_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>

              <label className="ranking-select-field">
                <span>Comparison</span>
                <select
                  value={rankingMode}
                  onChange={(event) =>
                    setRankingMode(event.target.value as ComparisonModeId)
                  }
                  aria-label="Comparison mode"
                >
                  {visibleModes.map((mode) => (
                    <option key={mode.id} value={mode.id}>
                      {mode.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <section className="card ranking-active-mode-card">
            <div className="ranking-active-mode-copy">
              <div>
                <p className="label">Current comparison</p>
                <h2>{activeMode.label}</h2>
                <p>{activeMode.description}</p>
              </div>
              <span className={`ranking-kind-badge ${activeMode.direction === "none" ? "compare" : "rank"}`}>
                {activeMode.direction === "none" ? "Compare" : "Rank"}
              </span>
            </div>
            {activeMode.assumption && (
              <p className="ranking-assumption"><strong>Assumption:</strong> {activeMode.assumption}</p>
            )}
          </section>

          {comparisonMolecules.length === 0 ? (
            <section className="card ranking-empty-state">
              <div className="ranking-empty-number">01</div>
              <h2>Add your first molecule</h2>
              <p>
                Use the editor or type a molecule name. Once it is added, the same
                molecule can be compared across every category without redrawing it.
              </p>
            </section>
          ) : (
            <section className="ranking-results-list" aria-label={`${activeMode.label} results`}>
              {rankedRows.map(({ molecule, metric }) => {
                const displayRank = rankById.get(molecule.id);
                const isRankable = metric.score !== null || Boolean(metric.sortVector);
                return (
                  <article className="card ranking-result-card" key={molecule.id}>
                    <div className="ranking-result-rank">
                      {activeMode.direction === "none" ? (
                        <span>{molecule.label.replace("Molecule ", "")}</span>
                      ) : isRankable && displayRank !== undefined ? (
                        <>
                          <small>Rank</small>
                          <strong>#{displayRank}</strong>
                        </>
                      ) : (
                        <span>—</span>
                      )}
                    </div>

                    <div className="ranking-result-structure">
                      {molecule.structureSvg ? (
                        <div
                          className="molecule-preview ranking-molecule-preview"
                          dangerouslySetInnerHTML={{ __html: molecule.structureSvg }}
                        />
                      ) : (
                        <div className="ranking-no-structure">No preview</div>
                      )}
                    </div>

                    <div className="ranking-result-copy">
                      <div className="ranking-result-title-row">
                        <div>
                          <p className="ranking-result-label">{molecule.label}</p>
                          <h3>{metric.headline}</h3>
                        </div>
                        <button
                          className="ranking-delete-button"
                          type="button"
                          onClick={() => deleteComparisonMolecule(molecule.id)}
                          aria-label={`Delete ${molecule.label}`}
                        >
                          Delete
                        </button>
                      </div>

                      <p className="ranking-result-detail">{metric.detail}</p>

                      {metric.factors && metric.factors.length > 0 && (
                        <details className="ranking-factors">
                          <summary>Why this result?</summary>
                          <ul>
                            {metric.factors.slice(0, 6).map((factor, index) => (
                              <li key={`${molecule.id}-${index}`}>{factor}</li>
                            ))}
                          </ul>
                        </details>
                      )}

                      <div className="ranking-molecule-meta">
                        <span>{molecule.profile.formula || "Formula unavailable"}</span>
                        <code>{molecule.smiles}</code>
                      </div>
                    </div>
                  </article>
                );
              })}
            </section>
          )}
        </main>
      </div>
    </section>
  );
}
