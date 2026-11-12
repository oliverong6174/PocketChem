import { getSubject, PHYSICS_TOOLS, type PhysicsToolId } from "../../navigation/subjects";
import { Badge, Callout, EvidenceBadge, Panel, ToolHeader } from "../ui/primitives";
import { Icon } from "../ui/Icon";
import "../../styles/generalChem.css";
import "../../styles/physics.css";

/**
 * Landing page of the Physics subject. It lists only tools that exist (with a way to open them) and, separately and clearly
 * marked, the areas that are planned. Planned items have no buttons and no simulations.
 */
const FEATURES: Record<string, string[]> = {
  phMechanics: [
    "Projectile motion with launch speed, angle, height and gravity, and general constant-acceleration motion in two dimensions",
    "A live diagram with the trajectory, velocity and acceleration vectors, ground, axes and distances",
    "Play, pause, reset and scrub: the diagram, the readouts and four graphs share one clock",
    "Time of flight, maximum height and range, including launches from a height and straight downward",
  ],
  phCircuits: [
    "Build series, parallel and nested resistor networks with one ideal DC source",
    "A circuit diagram drawn from the same network the calculations use, with current directions and voltage drops",
    "Equivalent resistance, every branch current, voltage and power, with Kirchhoff's laws checked",
    "Select any component to inspect it; change a value and see everything update",
  ],
  phRc: [
    "Charging and discharging of one capacitor through one resistor, from any initial voltage to any final voltage",
    "Circuit diagram, capacitor voltage, current and stored energy that move together with the time slider",
    "Time constant τ = RC, half-way and settling times, and the energy balance",
    "Explicit limits: one resistor, one capacitor, one loop",
  ],
};

export default function PhysicsOverview({ onOpenTool }: { onOpenTool: (id: PhysicsToolId) => void }) {
  const subject = getSubject("physics");
  const implemented = PHYSICS_TOOLS.filter((tool) => tool.id in FEATURES);
  return (
    <div className="gc-page gc-overview ph-page">
      <ToolHeader
        group="Analyze"
        headingLevel={1}
        purpose="Interactive laboratories where you change a physical quantity and see the diagram, the numbers and the graphs respond together."
        title="Physics"
      />

      <Panel subtitle="Working laboratories you can open now." title="Available now">
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
                  <button className="primary-button" onClick={() => onOpenTool(tool.id as PhysicsToolId)} type="button">Open {tool.label}</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel subtitle="Not built yet. These are plans, not features, and nothing here can be opened." title="Planned">
        <ul aria-label="Planned Physics areas" className="gc-planned">
          {(subject.planned ?? []).map((item) => (
            <li key={item}>
              <span>{item}</span>
              <Badge tone="neutral">Planned</Badge>
            </li>
          ))}
        </ul>
      </Panel>

      <Callout tone="info" title="Scope of the laboratories">
        <p>Mechanics models a point particle with constant acceleration over a flat ground at y = 0; for projectiles that is gravity alone, with no air resistance. The circuit tool handles one ideal DC source with ideal resistors in series and parallel groups only, and the RC tool handles exactly one resistor and one capacitor. Arbitrary circuits, AC, inductors, forces and rotation are not supported, and the tools say so rather than approximating them. They are teaching models, not substitutes for measurement or design software.</p>
      </Callout>
    </div>
  );
}
