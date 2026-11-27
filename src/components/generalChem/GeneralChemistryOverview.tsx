import { getSubject, GENERAL_TOOLS, type GeneralToolId } from "../../navigation/subjects";
import { Badge, Callout, EvidenceBadge, Panel, ToolHeader } from "../ui/primitives";
import { Icon } from "../ui/Icon";
import "../../styles/generalChem.css";

/**
 * Landing page of the General Chemistry subject. It lists only tools that exist (with a way to open them) and, separately
 * and clearly marked, the areas that are planned. Planned items have no buttons and no calculators.
 */
const FEATURES: Record<string, string[]> = {
  gcAtomic: [
    "Quantum-number explorer: which (n, l, m_l, m_s) are allowed, with subshell and shell capacities and the reason when they are not",
    "Hydrogenic orbitals 1s to 3d from their closed-form wavefunctions: density slices, probability enclosure, radial probability graphs and node counts",
    "Ground-state configurations for Z = 1–36 (NIST), Aufbau exceptions such as Cr and Cu, ions, orbital boxes and noble-gas notation",
    "Hydrogen-like energy levels and transitions: photon energy, frequency, wavelength and spectral series",
  ],
  gcBonding: [
    "Lewis structures for 30 curated molecules and ions: place bonds and lone pairs, check electron conservation and formal charges",
    "Resonance for ozone, nitrate, carbonate, nitrite and sulfur dioxide, with the hybrid averages and the usual cautions",
    "Interactive VSEPR geometry you can rotate, electron-domain versus molecular shape, and ideal bond angles",
    "Schematic bond dipoles and molecular polarity, and sp, sp², sp³ hybridisation with σ and π bond counts",
  ],
  gcMO: [
    "Qualitative MO diagrams of 17 homonuclear diatomic molecules and ions, with the right 2p ordering for each",
    "Fill the orbitals yourself under Pauli, Hund and Aufbau checks; bond order, unpaired electrons and magnetism follow from your occupancy",
    "O₂ versus N₂: why oxygen is paramagnetic and a simple Lewis structure cannot show it",
    "In-phase and out-of-phase orbital combinations from an explicit LCAO illustration",
  ],
  gcStoichiometry: [
    "Formula masses from a documented formula grammar (groups, hydrates, ionic charges); malformed formulas are refused",
    "Exact balancing of a reaction you supply, including redox and ionic equations, with a conservation check for manual coefficients",
    "Limiting reagent, excess, theoretical and percent yield from one reaction extent; grams, moles, purity or solutions",
    "Molarity, dilution, and reactive mixing of solutions, with a schematic particle picture",
  ],
  gcGas: [
    "PV = nRT with unit conversion and absolute temperature; Boyle, Charles, Gay-Lussac and Avogadro as controlled experiments",
    "A gas container with schematic particles and synchronized P-V, V-T and P-T graphs",
    "Ideal gas mixtures: mole fractions, Dalton's law, density",
    "Kinetic theory: rms speed and the Maxwell-Boltzmann speed distribution for two gases at two temperatures",
  ],
  gcElectro: [
    "Galvanic cells from 28 curated half-reactions: anode, cathode, electron flow, salt bridge, overall reaction",
    "Standard cell potential, the Nernst equation with concentrations, gas pressures and pH, and the link to Gibbs energy and K",
    "Electrolysis with Faraday's law for seven curated cases, with current efficiency and gas volumes",
    "Galvanic versus electrolytic sign conventions, and E against log Q",
  ],
  gcAcidBase: [
    "Strong and weak monoprotic acids and bases; pH, pOH, percent ionization",
    "Buffers, with a check on whether Henderson–Hasselbalch applies",
    "Dilution and the effect of concentration on equilibrium",
    "Interactive titration curves with equivalence and half-equivalence points",
  ],
  gcEquilibrium: [
    "Q versus K, ICE tables and the equilibrium composition for one reaction (up to 2 reactants and 2 products)",
    "Composition and Q-versus-K graphs you can drag along the reaction progress",
    "Le Châtelier: add or remove a species, change the volume, and see the shift computed",
    "Kc to Kp for gases; guided worked solution",
  ],
  gcKinetics: [
    "Zero-, first- and second-order single-reactant rate laws with half-lives and integrated equations",
    "Concentration–time and linearized plots that move together",
    "Fit your concentration–time data and compare the three orders with a stated criterion",
    "Arrhenius: activation energy from two points or a table, and k at any temperature",
  ],
  gcThermo: [
    "ΔG° = ΔH° − TΔS° against temperature, crossover temperatures, K, and nonstandard ΔG",
    "Hess's law with automatic reversal and scaling and a species-cancellation table",
    "Calorimetry: reaction ΔH, mixing, and specific heat, with every energy-balance step",
    "Explicit assumptions: constant ΔH and ΔS unless ΔCp is given",
  ],
};

export default function GeneralChemistryOverview({ onOpenTool }: { onOpenTool: (id: GeneralToolId) => void }) {
  const subject = getSubject("general");
  const implemented = GENERAL_TOOLS.filter((tool) => tool.id in FEATURES);
  return (
    <div className="gc-page gc-overview">
      <ToolHeader
        group="Analyze"
        headingLevel={1}
        purpose="Quantitative tools for introductory chemistry. Each tool states its assumptions and shows the numbers behind every result."
        title="General Chemistry"
      />

      <Panel subtitle="Working tools you can open now." title="Available now">
        <ul className="gc-tool-cards">
          {implemented.map((tool) => (
            <li className="gc-tool-card" key={tool.id}>
              <Icon name={tool.icon} size={26} />
              <div>
                <h3>{tool.label}</h3>
                <p>{tool.summary}</p>
                <ul className="gc-feature-list">
                  {FEATURES[tool.id].map((line) => <li key={line}>{line}</li>)}
                </ul>
                <div className="gc-tool-card-foot">
                  <EvidenceBadge level="model" />
                  <button className="primary-button" onClick={() => onOpenTool(tool.id as GeneralToolId)} type="button">Open {tool.label}</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel subtitle="Not built yet. These are plans, not features, and nothing here can be opened." title="Planned">
        <ul aria-label="Planned General Chemistry areas" className="gc-planned">
          {(subject.planned ?? []).map((item) => (
            <li key={item}>
              <span>{item}</span>
              <Badge tone="neutral">Planned</Badge>
            </li>
          ))}
        </ul>
      </Panel>

      <Callout tone="info" title="Scope of the tools">
        <p>The acid–base tool models one monoprotic acid or base in water at 25 °C with ideal-solution assumptions. Polyprotic acids, mixtures, activity corrections, other temperatures and non-aqueous solvents are not supported, and the tool says so rather than approximating them.</p>
        <p>The equilibrium tool handles one reaction with ideal species at constant temperature. The kinetics tool handles one reactant with a zero-, first- or second-order rate law. The thermodynamics tool treats ΔH° and ΔS° as constant unless ΔCp is given. All of these are teaching models, not substitutes for measured data.</p>
      </Callout>
    </div>
  );
}
