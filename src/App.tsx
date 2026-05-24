import { useState } from "react";
import MoleculeDrawer from "./components/MoleculeDrawer";
import {
  analyzeFunctionalGroupHierarchy,
  type FunctionalGroupResult,
} from "./utils/analyzeSmiles";
import { analyzeArio, type ArioResult } from "./utils/analyzeArio";
import "./App.css";

function App() {
  const [smiles, setSmiles] = useState("Not analyzed yet");
  const [status, setStatus] = useState("Draw a molecule first");

  const [mainGroup, setMainGroup] = useState<FunctionalGroupResult | null>(
    null
  );
  const [functionalGroups, setFunctionalGroups] = useState<
    FunctionalGroupResult[]
  >([]);
  const [arioResults, setArioResults] = useState<ArioResult[]>([]);

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

      const ario = analyzeArio(hierarchy.primaryGroups);
      setArioResults(ario);

      setStatus("Molecule analyzed successfully.");
    } catch (error) {
      console.error("Analyze error:", error);
      setStatus("Something went wrong while analyzing the molecule.");
    }
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
                setArioResults([]);
              }}
            >
              Clear Analysis
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
        <p className="label">ARIO / Acidity Estimate</p>

        {arioResults.length === 0 ? (
          <p className="empty">No acidic sites estimated yet</p>
        ) : (
          <>
            <div className="group-card">
              <div className="group-card-header">
                <h3>Strongest acidic site: {arioResults[0].acidicSite}</h3>
                <span>pKa {arioResults[0].estimatedPka}</span>
              </div>

              <p>
                <strong>Related group:</strong> {arioResults[0].relatedGroup}
              </p>
              <p>
                <strong>A — Atom:</strong> {arioResults[0].atom}
              </p>
              <p>
                <strong>R — Resonance:</strong> {arioResults[0].resonance}
              </p>
              <p>
                <strong>I — Induction:</strong> {arioResults[0].induction}
              </p>
              <p>
                <strong>O — Orbital:</strong> {arioResults[0].orbital}
              </p>
              <p>{arioResults[0].explanation}</p>
            </div>

            {arioResults.length > 1 && (
              <div className="group-list">
                {arioResults.slice(1).map((result) => (
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
    </div>
      </section>
    </main>
  );
}

export default App;