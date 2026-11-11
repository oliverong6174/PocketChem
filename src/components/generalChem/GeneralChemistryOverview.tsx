import { getSubject, GENERAL_TOOLS, type GeneralToolId } from "../../navigation/subjects";
import { Badge, Callout, EvidenceBadge, Panel, ToolHeader } from "../ui/primitives";
import { Icon } from "../ui/Icon";
import "../../styles/generalChem.css";

/**
 * Landing page of the General Chemistry subject. It lists only tools that exist (with a way to open them) and, separately
 * and clearly marked, the areas that are planned. Planned items have no buttons and no calculators.
 */
export default function GeneralChemistryOverview({ onOpenTool }: { onOpenTool: (id: GeneralToolId) => void }) {
  const subject = getSubject("general");
  const implemented = GENERAL_TOOLS.filter((tool) => tool.id === "gcAcidBase");
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
                  <li>Strong and weak monoprotic acids and bases; pH, pOH, percent ionization</li>
                  <li>Buffers, with a check on whether Henderson–Hasselbalch applies</li>
                  <li>Dilution and the effect of concentration on equilibrium</li>
                  <li>Interactive titration curves with equivalence and half-equivalence points</li>
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

      <Callout tone="info" title="Scope of the acid–base tool">
        <p>It models one monoprotic acid or base in water at 25 °C with ideal-solution assumptions. Polyprotic acids, mixtures, activity corrections, other temperatures and non-aqueous solvents are not supported, and the tool says so rather than approximating them.</p>
      </Callout>
    </div>
  );
}
