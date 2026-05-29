import { useState } from "react";
import MoleculeDrawer from "./components/MoleculeDrawer";
import {
  analyzeFunctionalGroupHierarchy,
  getMoleculeSvg,
  type FunctionalGroupResult,
} from "./utils/analyzeSmiles";
import { analyzeAcidity, type AcidityResult } from "./utils/analyzeAcidity";
import { analyzeBasicity, type BasicityResult } from "./utils/analyzeBasicity";
import "./App.css";

type RankingMode = "acidity" | "basicity";

type ComparisonMolecule = {
  id: number;
  label: string;
  smiles: string;
  structureSvg: string | null;
  functionalGroups: FunctionalGroupResult[];
  acidityResults: AcidityResult[];
  basicityResults: BasicityResult[];
};

function App() {
  const [smiles, setSmiles] = useState("Not analyzed yet");
  const [status, setStatus] = useState("Draw a molecule first");

  const [mainGroup, setMainGroup] = useState<FunctionalGroupResult | null>(
    null
  );
  const [functionalGroups, setFunctionalGroups] = useState<
    FunctionalGroupResult[]
  >([]);
  const [acidityResults, setAcidityResults] = useState<AcidityResult[]>([]);
  const [basicityResults, setBasicityResults] = useState<BasicityResult[]>([]);
const [comparisonMolecules, setComparisonMolecules] = useState<
  ComparisonMolecule[]
>([]);
const [rankingMode, setRankingMode] = useState<RankingMode>("acidity");

  const additionalFunctionalGroups = mainGroup
    ? functionalGroups.filter((group) => group.name !== mainGroup.name)
    : functionalGroups;

  const analyzeMolecule = async () => {
    console.log("Analyze button clicked");
    console.log("Window Ketcher object:", window.ketcher);

    if (!window.ketcher) {
      setStatus("Molecule editor is still loading. Try again in a second.");
      return;
    }

    try {
      const result = await window.ketcher.getSmiles();

      console.log("SMILES result:", result);

      if (!result || result.trim() === "") {
        setSmiles("No molecule detected");
        setStatus("Draw a molecule before analyzing.");
        return;
      }

      setSmiles(result);

      const hierarchy = await analyzeFunctionalGroupHierarchy(result);
      setMainGroup(hierarchy.mainGroup);
      setFunctionalGroups(hierarchy.primaryGroups);

      const acidity = await analyzeAcidity(result, hierarchy.primaryGroups);
      setAcidityResults(acidity);
      const basicity = await analyzeBasicity(result, hierarchy.primaryGroups);
      setBasicityResults(basicity);

      setStatus("Molecule analyzed successfully.");
    } catch (error) {
      console.error("Analyze error:", error);
      setStatus("Something went wrong while analyzing the molecule.");
    }
  };
 
const addCurrentMoleculeToComparison = async () => {
  if (!window.ketcher) {
    setStatus("Molecule editor is still loading. Try again in a second.");
    return;
  }

  if (comparisonMolecules.length >= 5) {
    setStatus("Comparison list is full. You can compare up to 5 molecules.");
    return;
  }

  try {
    const currentSmiles = await window.ketcher.getSmiles();

    if (!currentSmiles || currentSmiles.trim() === "") {
      setStatus("Draw a molecule before adding it to comparison.");
      return;
    }

    const hierarchy = await analyzeFunctionalGroupHierarchy(currentSmiles);
    const acidity = await analyzeAcidity(currentSmiles, hierarchy.primaryGroups);
    const basicity = await analyzeBasicity(currentSmiles, hierarchy.primaryGroups);
    const structureSvg = await getMoleculeSvg(currentSmiles);

    const nextLabel = `Molecule ${String.fromCharCode(
      65 + comparisonMolecules.length
    )}`;

    const newMolecule: ComparisonMolecule = {
      id: Date.now(),
      label: nextLabel,
      smiles: currentSmiles,
      structureSvg,
      functionalGroups: hierarchy.primaryGroups,
      acidityResults: acidity,
      basicityResults: basicity,
    };

    setComparisonMolecules((prev) => [...prev, newMolecule]);

    // Also update the main analysis panel to match the molecule just added
    setSmiles(currentSmiles);
    setMainGroup(hierarchy.mainGroup);
    setFunctionalGroups(hierarchy.primaryGroups);
    setAcidityResults(acidity);
    setBasicityResults(basicity);

    setStatus(`${nextLabel} added to comparison.`);
  } catch (error) {
    console.error("Add to comparison error:", error);
    setStatus("Something went wrong while adding the molecule to comparison.");
  }
};

const deleteComparisonMolecule = (id: number) => {
  setComparisonMolecules((prev) =>
    prev.filter((molecule) => molecule.id !== id)
  );

  setStatus("Molecule removed from comparison.");
};

const getRankedComparison = () => {
  return [...comparisonMolecules].sort((a, b) => {
    const aScore =
      rankingMode === "acidity"
        ? a.acidityResults[0]?.estimatedPkaNumber
        : a.basicityResults[0]?.conjugateAcidPkaNumber;

    const bScore =
      rankingMode === "acidity"
        ? b.acidityResults[0]?.estimatedPkaNumber
        : b.basicityResults[0]?.conjugateAcidPkaNumber;

    // Molecules with no rankable site go to the bottom
    if (aScore === undefined && bScore === undefined) return 0;
    if (aScore === undefined) return 1;
    if (bScore === undefined) return -1;

    // Lower pKa = stronger acid
    if (rankingMode === "acidity") {
      return aScore - bScore;
    }

    // Higher conjugate acid pKa = stronger base
    return bScore - aScore;
  });
};

const rankedComparison = getRankedComparison();

const clearComparison = () => {
  setComparisonMolecules([]);
  setStatus("Comparison list cleared.");
};

  return (
    <main className="app">
      <section className="hero">
        <div>
          <p className="eyebrow">Premed Organic Chemistry Helper</p>
          <h1>PocketChem</h1>
          <p className="subtitle">
            Draw molecules, identify functional groups, understand mechanisms,
            and connect organic chemistry to biochemistry.
          </p>
        </div>
      </section>

      <section className="workspace">
        <div className="card molecule-card">
          <div className="card-header">
            <div>
              <h2>Molecule Drawer</h2>
              <p>Draw a molecule, then click Analyze Molecule.</p>
            </div>
            <span className="status">Draw Mode</span>
          </div>

          <div className="drawer-placeholder">
            <MoleculeDrawer />
          </div>

          <div className="button-row">
            <button className="primary-button" onClick={analyzeMolecule}>
              Analyze Molecule
            </button>

            {/* CLEAR BUTTON */}
            
            <button
              className="secondary-button"
              onClick={() => {
                setSmiles("Not analyzed yet");
                setStatus("Draw a molecule first");
                setMainGroup(null);
                setFunctionalGroups([]);
                setAcidityResults([]);
                setBasicityResults([]);
              }}
            >
              Clear Analysis
            </button>

            <button className="secondary-button" onClick={addCurrentMoleculeToComparison}>
              Add to Comparison
            </button>

            <button className="secondary-button" onClick={clearComparison}>
              Clear Comparison
            </button>
          </div>
        </div>

       <div className="card analysis-card">
  <h2>Analysis</h2>

  <div className="analysis-section">
    <p className="label">Status</p>
    <p>{status}</p>
  </div>

  <div className="analysis-section">
    <p className="label">SMILES</p>
    <p className="smiles-output">{smiles}</p>
  </div>

  <div className="analysis-section">
    <p className="label">Main Functional Group</p>

    {mainGroup ? (
      <div className="group-card">
        <div className="group-card-header">
          <h3>
            {mainGroup.name}
            {mainGroup.count > 1 ? ` (×${mainGroup.count})` : ""}
          </h3>
          <span>{mainGroup.confidence} confidence</span>
        </div>

        <p>
          <strong>Suffix:</strong> {mainGroup.suffix}
        </p>
        <p>
          <strong>Prefix if substituent:</strong> {mainGroup.prefix}
        </p>
        <p>{mainGroup.mcatNote}</p>
      </div>
    ) : (
      <p className="empty">Draw and analyze a molecule first</p>
    )}
  </div>

  <div className="analysis-section">
    <p className="label">Additional Functional Groups</p>

    {functionalGroups.length === 0 ? (
      <p className="empty">Draw and analyze a molecule first</p>
    ) : additionalFunctionalGroups.length === 0 ? (
      <p className="empty">No additional functional groups</p>
    ) : (
      <div className="group-list">
        {additionalFunctionalGroups.map((group) => (
          <div className="group-card" key={group.name}>
            <div className="group-card-header">
              <h3>
                {group.name}
                {group.count > 1 ? ` (×${group.count})` : ""}
              </h3>
              <span>{group.confidence} confidence</span>
            </div>

            <p>
              <strong>Suffix:</strong> {group.suffix}
            </p>
            <p>
              <strong>Prefix if substituent:</strong> {group.prefix}
            </p>
            <p>{group.mcatNote}</p>
          </div>
        ))}
      </div>
    )}
  </div>

      <div className="analysis-section">
        <p className="label">Acidity Estimate</p>

        {acidityResults.length === 0 ? (
          <p className="empty">No acidic sites estimated yet</p>
        ) : (
          <>
            <div className="group-card">
              <div className="group-card-header">
                <h3>Strongest acidic site: {acidityResults[0].acidicSite}</h3>
                <span>pKa {acidityResults[0].estimatedPka}</span>
              </div>

              <p>
                <strong>Related group:</strong> {acidityResults[0].relatedGroup}
              </p>
              <p>
                <strong>A — Atom:</strong> {acidityResults[0].atom}
              </p>
              <p>
                <strong>R — Resonance:</strong> {acidityResults[0].resonance}
              </p>
              <p>
                <strong>I — Induction:</strong> {acidityResults[0].induction}
              </p>
              <p>
                <strong>O — Orbital:</strong> {acidityResults[0].orbital}
              </p>
              <p>{acidityResults[0].explanation}</p>
              {acidityResults[0].modifiers.length > 0 && (
                <p>
                  <strong>pKa modifier:</strong> {acidityResults[0].modifiers.join(" ")}
                </p>
              )}
            </div>

            {acidityResults.length > 1 && (
              <div className="group-list">
                {acidityResults.slice(1).map((result) => (
                  <div className="group-card" key={result.relatedGroup}>
                    <div className="group-card-header">
                      <h3>Weaker acidic site: {result.acidicSite}</h3>
                      <span>pKa {result.estimatedPka}</span>
                    </div>

                    <p>
                      <strong>Related group:</strong> {result.relatedGroup}
                    </p>
                    <p>{result.explanation}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

              <div className="analysis-section">
          <p className="label">Basicity Estimate</p>

          {basicityResults.length === 0 ? (
            <p className="empty">No basic sites estimated yet</p>
          ) : (
            <div className="group-list">
              {basicityResults.map((result) => (
                <div className="group-card" key={result.relatedGroup}>
                  <div className="group-card-header">
                    <h3>{result.basicSite}</h3>
                    <span>conj. acid pKa {result.conjugateAcidPka}</span>
                  </div>

                  <p>
                    <strong>Related group:</strong> {result.relatedGroup}
                  </p>
                  <p>{result.explanation}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="analysis-section">
  <p className="label">Compare Molecules</p>

  <div className="button-row">
    <label>
      <input
        type="radio"
        name="rankingMode"
        value="acidity"
        checked={rankingMode === "acidity"}
        onChange={() => setRankingMode("acidity")}
      />
      Rank by acidity
    </label>

    <label>
      <input
        type="radio"
        name="rankingMode"
        value="basicity"
        checked={rankingMode === "basicity"}
        onChange={() => setRankingMode("basicity")}
      />
      Rank by basicity
    </label>
  </div>

  {comparisonMolecules.length === 0 ? (
    <p className="empty">Analyze molecules and add them to comparison.</p>
  ) : (
    <div className="group-list">
      {rankedComparison.map((molecule, index) => {
  const bestAcid = molecule.acidityResults[0];
  const bestBase = molecule.basicityResults[0];

  const hasRankableSite =
    rankingMode === "acidity" ? Boolean(bestAcid) : Boolean(bestBase);

  return (
          <div className="group-card" key={molecule.id}>
            <div className="group-card-header">
             <h3>
              {hasRankableSite ? `#${index + 1}: ${molecule.label}` : `Unranked: ${molecule.label}`}
            </h3>

              <button
                className="secondary-button"
                type="button"
                onClick={() => deleteComparisonMolecule(molecule.id)}
              >
                Delete
              </button>
            </div>

            {molecule.structureSvg && (
              <div
                className="molecule-preview"
                dangerouslySetInnerHTML={{ __html: molecule.structureSvg }}
              />
            )}

          {hasRankableSite ? (
            <p>
              <strong>
                {rankingMode === "acidity" ? "Estimated pKa:" : "Conjugate acid pKa:"}
              </strong>{" "}
              {rankingMode === "acidity"
                ? bestAcid.estimatedPka
                : bestBase.conjugateAcidPka}
            </p>
          ) : (
            <p className="empty">
              No {rankingMode === "acidity" ? "acidic" : "basic"} site detected for ranking.
            </p>
          )}

            <p>
              <strong>SMILES:</strong> {molecule.smiles}
            </p>

                        {hasRankableSite &&
              (rankingMode === "acidity" ? (
                <>
                  <p>
                    <strong>Strongest acidic site:</strong> {bestAcid.acidicSite}
                  </p>
                  <p>{bestAcid.explanation}</p>
                </>
              ) : (
                <>
                  <p>
                    <strong>Strongest basic site:</strong> {bestBase.basicSite}
                  </p>
                  <p>{bestBase.explanation}</p>
                </>
              ))}
          </div>
        );
      })}
    </div>
  )}
</div>
    </div>

  
      </section>
    </main>
  );
}

export default App;