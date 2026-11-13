import { BIOCHEMISTRY_TOOLS, getSubject, type BiochemistryToolId } from "../../navigation/subjects";
import { Badge, Callout, EvidenceBadge, Panel, ToolHeader } from "../ui/primitives";
import { Icon } from "../ui/Icon";
import "../../styles/generalChem.css";
import "../../styles/physics.css";
import "../../styles/biology.css";
import "../../styles/biochemistry.css";

/** Landing page of Biochemistry: lists only tools that exist; planned areas are marked and cannot be opened. */
const FEATURES: Record<string, string[]> = {
  bcAminoAcids: [
    "All 20 standard L-amino acids drawn from verified structures, grouped by side-chain class with a shape cue as well as color",
    "Side-chain properties, hydropathy, volume and pKa values, and a titration curve with the isoelectric point you can drag along",
    "Compare any two amino acids; build peptides up to 30 residues and see the peptide bonds, formula, mass and charge",
    "Open a peptide translated in the Biology tools directly in the peptide builder",
  ],
  bcProteins: [
    "Primary to quaternary structure for insulin, myoglobin, hemoglobin and GFP, with their subunit counts and disulfide bonds",
    "Alpha-helix hydrogen bonds (i → i+4) and a helical wheel; parallel and antiparallel β-sheets with their hydrogen bonds",
    "A Ramachandran plot you can move with the keyboard, with separate regions for glycine and proline",
    "Folding forces under pH, temperature, reducing agent and denaturant, and curated mutations such as sickle-cell Glu6Val and proline in a helix",
  ],
  bcEnzymes: [
    "Lock-and-key, induced-fit and conformational-selection binding drawn as an enzyme and its substrate",
    "A seven-step serine-protease mechanism with the catalytic triad, oxyanion hole and both products",
    "Michaelis–Menten and Lineweaver–Burk graphs plus the enzyme-species fractions, for competitive, uncompetitive, noncompetitive and mixed inhibition",
    "An energy profile showing that catalysis lowers the barrier without changing ΔG° or the equilibrium constant",
  ],
};

export default function BiochemOverview({ onOpenTool }: { onOpenTool: (id: BiochemistryToolId) => void }) {
  const subject = getSubject("biochemistry");
  const implemented = BIOCHEMISTRY_TOOLS.filter((tool) => tool.id in FEATURES);
  return (
    <div className="gc-page gc-overview ph-page bio-page">
      <ToolHeader
        group="Analyze"
        headingLevel={1}
        purpose="Interactive study guides for the molecules of life: amino acids and peptides, how proteins are organized and held together, and how enzymes speed reactions. Every diagram is drawn from the structure or constants you are looking at."
        title="Biochemistry"
      />
      <Panel subtitle="Working tools you can open now." title="Available now">
        <h3 className="ph-group-heading">Biomolecules</h3>
        <ul className="gc-tool-cards">
          {implemented.map((tool) => (
            <li className="gc-tool-card" key={tool.id}>
              <Icon name={tool.icon} size={26} />
              <div>
                <h3>{tool.label}</h3>
                <p>{tool.summary}</p>
                <ul className="gc-feature-list">{FEATURES[tool.id].map((line) => <li key={line}>{line}</li>)}</ul>
                <div className="gc-tool-card-foot">
                  <EvidenceBadge level="model" />
                  <button className="primary-button" onClick={() => onOpenTool(tool.id as BiochemistryToolId)} type="button">Open {tool.label}</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel subtitle="How to use the learning modes." title="Explore, Practice, Challenge">
        <ul className="gc-assumptions">
          <li><strong>Explore</strong>: everything is labelled and each behavior comes with a reason.</li>
          <li><strong>Practice</strong>: labels or results are hidden and questions ask about the diagram in front of you.</li>
          <li><strong>Challenge</strong>: predict the change first (a charge, a substitution, an inhibitor effect); it is applied only after you commit.</li>
        </ul>
      </Panel>
      <Panel subtitle="Not built yet. These are plans, not features, and nothing here can be opened." title="Planned">
        <ul aria-label="Planned Biochemistry areas" className="gc-planned">
          {(subject.planned ?? []).map((item) => <li key={item}><span>{item}</span><Badge tone="neutral">Planned</Badge></li>)}
        </ul>
      </Panel>
      <Callout tone="info" title="Scope of the tools">
        <p>These are teaching models. The pKa and hydropathy values are textbook references, the protein tool illustrates ideal structures and does not predict folding, and enzyme kinetics assumes a single substrate and ideal reversible inhibitors.</p>
      </Callout>
    </div>
  );
}
