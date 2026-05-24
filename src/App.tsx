import { useState } from "react";
import MoleculeDrawer from "./components/MoleculeDrawer";
import {
  analyzeFunctionalGroupHierarchy,
  type FunctionalGroupResult,
} from "./utils/analyzeSmiles";
import "./App.css";


function App() {
  const [smiles, setSmiles] = useState("Not analyzed yet");
  const [status, setStatus] = useState("Draw a molecule first");
  
  const [mainGroup, setMainGroup] = useState<FunctionalGroupResult | null>(null);
  const [functionalGroups, setFunctionalGroups] = useState<FunctionalGroupResult[]>([]);
  const additionalFunctionalGroups = mainGroup
  ? functionalGroups.filter((group) => group.name !== mainGroup.name)
  : functionalGroups;
//ANALYZE MOLECULE

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
    setStatus("Molecule analyzed successfully.");

  } catch (error) {
    console.error("Analyze error:", error);
    setStatus("Something went wrong while analyzing the molecule.");
  }
};

//DISPLAY

  return (
    <main className="app">
      <section className="hero">
        <div>
          <p className="eyebrow">MCAT + Premed Chemistry Helper</p>
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
            <button
              className="secondary-button"
              onClick={() => {
                setSmiles("Not analyzed yet");
                setStatus("Draw a molecule first");
                   setMainGroup(null);
                    setFunctionalGroups([]);
                setFunctionalGroups([]);
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
            <p className="label">MCAT Notes</p>
            <p>
              This section will explain acidity, polarity, reactions,
              metabolism connections, and high-yield test logic.
            </p>
          </div>

          <div className="analysis-section">
            <p className="label">Biochem Connection</p>
            <p>
              Later, this will connect molecules to pathways like glycolysis,
              TCA cycle, amino acids, fatty acids, and nucleotides.
            </p>
          </div>
        </div>
      </section>

      <section className="tool-grid">
        <div className="tool-card">
          <h3>Functional Groups</h3>
          <p>
            Identify alcohols, amines, carbonyls, carboxylic acids, esters,
            amides, phosphates, and more.
          </p>
        </div>

        <div className="tool-card">
          <h3>Acid/Base Helper</h3>
          <p>
            Use ARIO logic to compare acidity and basicity for MCAT-style
            questions.
          </p>
        </div>

        <div className="tool-card">
          <h3>Mechanism Tags</h3>
          <p>
            Classify reactions as substitution, elimination, addition,
            oxidation, reduction, hydrolysis, or phosphorylation.
          </p>
        </div>
      </section>
    </main>
  );
}

export default App;