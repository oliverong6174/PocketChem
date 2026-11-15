import { useNavigation } from "../../navigation/NavigationContext";
import { RELATION_LABEL, relationsFrom, type ToolRelation } from "../../utils/concepts/relations";
import type { SubjectId } from "../../navigation/subjects";

/**
 * "Continue learning": a short list of tools that connect scientifically to the current one, each with the reason and, where the
 * connection is conceptual only, what it does not mean. Opening a link never changes any tool's inputs (data moves only through
 * an explicit button in the tool, e.g. "Open this peptide in Biochemistry"). Renders nothing when a tool has no relations.
 */
export function RelatedConcepts({ subject, toolId, limit = 3 }: { subject: SubjectId; toolId: string; limit?: number }) {
  const { openDestination } = useNavigation();
  const relations = relationsFrom(subject, toolId, limit);
  if (relations.length === 0) return null;
  return (
    <aside aria-labelledby={`related-${toolId}`} className="related-learning" data-testid="related-concepts">
      <h3 id={`related-${toolId}`}>Continue learning</h3>
      <p className="related-learning-note">Connected ideas in other tools. “Related” means the idea is shared, not that the models exchange numbers.</p>
      <ul className="related-list">
        {relations.map((relation: ToolRelation) => (
          <li className="related-item" key={relation.id}>
            <span className="related-item-row">
              <button className="related-link" data-testid={`related-${relation.id}`} onClick={() => openDestination(relation.to)} type="button">{relation.label}</button>
              <span className="related-type">{RELATION_LABEL[relation.type]}</span>
            </span>
            <p className="related-explain">{relation.explanation}{relation.caution ? <> <em>{relation.caution}</em></> : null}</p>
          </li>
        ))}
      </ul>
    </aside>
  );
}
