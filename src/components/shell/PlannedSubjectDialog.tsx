import { MODE_LABELS, type SubjectDef } from "../../navigation/subjects";
import { Icon } from "../ui/Icon";
import { useDialog } from "../ui/useDialog";

/** Informational preview of a planned subject. It deliberately offers no tool controls. */
export function PlannedSubjectDialog({ subject, onClose }: { subject: SubjectDef | null; onClose: () => void }) {
  const ref = useDialog<HTMLDivElement>(subject !== null, onClose);
  if (!subject) return null;
  const mode = MODE_LABELS[subject.mode];
  return (
    <div className="dialog-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div aria-labelledby="planned-subject-title" aria-modal="true" className="dialog planned-dialog" ref={ref} role="dialog">
        <div className="dialog-head">
          <span className="dialog-icon"><Icon name={subject.icon} size={26} /></span>
          <div>
            <p className="dialog-eyebrow">{mode.label}, Planned</p>
            <h2 id="planned-subject-title">{subject.label}</h2>
          </div>
          <button aria-label="Close preview" className="icon-button" data-autofocus onClick={onClose} type="button">
            <Icon name="close" size={18} />
          </button>
        </div>
        <p className="dialog-lead">{subject.tagline}</p>
        <div className="ui-callout tone-info" role="note">
          <Icon name="info" size={18} />
          <p><strong>Not available yet.</strong> This is a preview of where PocketChem is heading. No tools exist for {subject.label} today, and nothing here has been built or tested.</p>
        </div>
        {subject.planned ? (
          <>
            <h3 className="dialog-subhead">Intended areas</h3>
            <ul className="planned-list">
              {subject.planned.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </>
        ) : null}
        <div className="dialog-actions">
          <button className="primary-button" onClick={onClose} type="button">Back to Organic Chemistry</button>
        </div>
      </div>
    </div>
  );
}
