import "./App.css";
import MoleculeDrawer from "./components/MoleculeDrawer";

function App() {
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
              <p>Draw a molecule here. The real editor will be added next.</p>
            </div>
            <span className="status">Draft Mode</span>
          </div>

          <div className="drawer-placeholder">
            <MoleculeDrawer />
          </div>

          <div className="button-row">
            <button className="primary-button">Analyze Molecule</button>
            <button className="secondary-button">Clear</button>
          </div>
        </div>

        <div className="card analysis-card">
          <h2>Analysis</h2>

          <div className="analysis-section">
            <p className="label">SMILES</p>
            <p className="empty">Not analyzed yet</p>
          </div>

          <div className="analysis-section">
            <p className="label">Functional Groups</p>
            <p className="empty">Draw a molecule first</p>
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
          <p>Identify alcohols, amines, carbonyls, carboxylic acids, esters, amides, phosphates, and more.</p>
        </div>

        <div className="tool-card">
          <h3>Acid/Base Helper</h3>
          <p>Use ARIO logic to compare acidity and basicity for MCAT-style questions.</p>
        </div>

        <div className="tool-card">
          <h3>Mechanism Tags</h3>
          <p>Classify reactions as substitution, elimination, addition, oxidation, reduction, hydrolysis, or phosphorylation.</p>
        </div>
      </section>
    </main>
  );
}

export default App;