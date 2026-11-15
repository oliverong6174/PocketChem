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
  bcGlycolysis: [
    "The ten reactions from glucose to pyruvate with enzymes, structures, cofactors and compartment",
    "ATP investment and payoff, four ATP made and two net, two NADH, and why steps after aldolase run twice per glucose",
    "Qualitative regulation of hexokinase, PFK-1 and pyruvate kinase by ATP, AMP, fructose 2,6-bisphosphate and G6P",
  ],
  bcGluconeogenesis: [
    "Pyruvate to glucose through the mitochondrial matrix, cytosol and ER, with the three bypasses highlighted",
    "A side-by-side lane diagram with glycolysis, the cost of 4 ATP + 2 GTP + 2 NADH, and futile-cycle costs",
    "Fed-like, fasting-like, low-energy and acetyl-CoA scenarios with reciprocal regulation, kept qualitative",
  ],
  bcTca: [
    "The pyruvate dehydrogenase complex in five stages, then the eight cycle reactions around a ring for one or two turns",
    "Carbon counts, NADH, FADH₂, GTP and CO₂ per turn and per glucose without double counting, with oxaloacetate regeneration",
    "Regulation by energy and redox signals, stated as directions only",
  ],
  bcEtc: [
    "Complexes I to IV, coenzyme Q, cytochrome c, oxygen and ATP synthase with electron and proton movement",
    "NADH versus succinate entry, about 10 versus 6 protons per electron pair, and complex II pumping none",
    "Inhibitors (rotenone, malonate, antimycin, cyanide, oligomycin), an uncoupler and low oxygen, with qualitative outcomes",
  ],
  bcMetabolism: [
    "One connected map from glucose to oxidative phosphorylation with gluconeogenesis returning to glucose",
    "Pathway and reaction levels share the same metabolites and reactions, with a single energy-carrier ledger",
    "Scenarios labelled by what stoichiometry, curated regulation or the respiratory model supports, and what would need a kinetic model",
  ],
};
const GROUPS: Array<{ id: string; label: string }> = [{ id: "biomolecules", label: "Biomolecules" }, { id: "metabolism", label: "Metabolism" }];

export default function BiochemOverview({ onOpenTool }: { onOpenTool: (id: BiochemistryToolId) => void }) {
  const subject = getSubject("biochemistry");
  const implemented = BIOCHEMISTRY_TOOLS.filter((tool) => tool.id in FEATURES);
  return (
    <div className="gc-page gc-overview ph-page bio-page">
      <ToolHeader
        group="Analyze"
        headingLevel={1}
        purpose="Interactive study guides for the molecules of life and their metabolism: amino acids and peptides, protein structure, enzymes, and the pathways from glucose to ATP. Every diagram is drawn from the structure, constants or reactions you are looking at."
        title="Biochemistry"
      />
      <Panel subtitle="Working tools you can open now." title="Available now">
        {GROUPS.map((group) => (
          <div key={group.id}>
        <h3 className="ph-group-heading">{group.label}</h3>
        <ul className="gc-tool-cards">
          {implemented.filter((tool) => tool.group === group.id).map((tool) => (
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
          </div>
        ))}
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
        <p>These are teaching models. The pKa and hydropathy values are textbook references, the protein tool illustrates ideal structures and does not predict folding, enzyme kinetics assumes a single substrate and ideal reversible inhibitors, and the metabolic pathways show stoichiometry and curated qualitative regulation: no rates, concentrations or cellular fluxes are computed, and ATP yields are estimates.</p>
      </Callout>
    </div>
  );
}
