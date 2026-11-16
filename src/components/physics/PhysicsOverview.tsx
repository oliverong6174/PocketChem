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
  phForces: [
    "A free-body diagram for a body on a flat or inclined surface, or a block pulled by a hanging mass over a pulley",
    "Weight, normal force, static and kinetic friction, applied force and tension, with net force and acceleration",
    "Static friction that adapts up to μₛN, kinetic friction that opposes sliding, and the normal force that is not always mg",
    "Practice: tick the forces that act on the body and predict the acceleration before the answer is shown",
  ],
  phEnergy: [
    "Block on an incline, rough horizontal surface, spring launch and an object changing height",
    "Kinetic, gravitational and spring energy with an energy bar chart that always balances, heat from friction included",
    "Work done by each force and the work–energy theorem checked at every moment",
    "A “can it get there?” question that explains the physical limit when the energy runs out",
  ],
  phCollisions: [
    "Two bodies in one dimension with independent masses and velocities, elastic to perfectly inelastic collisions",
    "Momentum conservation, centre of mass, coefficient of restitution, impulse and kinetic-energy loss",
    "Before and after table, four synchronized graphs and an animated collision you can scrub",
    "No invented collision when the bodies are separating, and no force history that the model does not have",
  ],
  phWaves: [
    "Traveling waves (transverse or longitudinal) with wavelength, period, phase and the difference between wave speed and particle speed",
    "Superposition of two waves: interference, true versus partly standing waves, and beats",
    "Standing waves on a string and in open or closed pipes, with nodes, antinodes, harmonics and resonance frequencies",
    "The Doppler effect for a moving source and observer, drawn as wavefronts and checked by counting them; supersonic motion is refused",
  ],
  phOptics: [
    "Thin lenses and spherical mirrors with principal-ray diagrams you can drag, real and virtual images, magnification and power",
    "Refraction at a boundary with Snell's law, the critical angle and total internal reflection",
    "An image at the focal point is reported as “at infinity”, never as a large number",
    "Explore, Practice (predict, then observe) and Challenge (reach a target setup)",
  ],
  phInterference: [
    "One slit, two slits and gratings of up to 20 slits at any visible wavelength, with an intensity graph and a coloured fringe strip",
    "Fringe spacing, missing orders, the diffraction envelope and the sharpening of principal maxima with more slits",
    "A probe you can move on the screen that reports the path difference and the intensity there",
    "Settings outside the far-field model are refused with the reason, not approximated",
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
        <h3 className="ph-group-heading">Mechanics</h3>
        <ul className="gc-tool-cards">
          {implemented.filter((tool) => tool.group === "mechanics").map((tool) => (
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
        <h3 className="ph-group-heading">Waves &amp; optics</h3>
        <ul className="gc-tool-cards">
          {implemented.filter((tool) => tool.group === "waves").map((tool) => (
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
        <h3 className="ph-group-heading">Electricity</h3>
        <ul className="gc-tool-cards">
          {implemented.filter((tool) => tool.group === "electricity").map((tool) => (
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
        <p>Mechanics models a point particle with constant acceleration over a flat ground at y = 0; for projectiles that is gravity alone, with no air resistance. The circuit tool handles one ideal DC source with ideal resistors in series and parallel groups only, and the RC tool handles exactly one resistor and one capacitor. Forces treats one body (or a block with a hanging mass) with Coulomb friction; Work & energy uses an ideal spring and constant friction; collisions are two bodies in one dimension with an instantaneous contact. Waves are small-amplitude and linear in a lossless medium, standing waves use the elementary boundary conditions, and the Doppler model is for subsonic motion along one line. Optics uses single thin elements in the paraxial approximation, and interference is the far-field pattern of identical slits in monochromatic light. Arbitrary circuits, AC, inductors, rotation and air resistance are not supported, and the tools say so rather than approximating them. They are teaching models, not substitutes for measurement or design software.</p>
      </Callout>
    </div>
  );
}
