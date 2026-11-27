import { useEffect, useId, useRef, useState } from "react";
import { MODE_LABELS, SUBJECTS, type SubjectDef, type SubjectId, type SubjectMode } from "../../navigation/subjects";
import { Icon } from "../ui/Icon";

interface Props {
  activeSubject: SubjectId;
  onPreview: (subject: SubjectDef) => void;
  /** When rendered inside the mobile sheet the list is always visible (no popover). */
  inline?: boolean;
  onPicked?: () => void;
  /** Called when an available subject is chosen (the current one included, so the caller may ignore it). */
  onSelectSubject?: (id: SubjectId) => void;
}

/**
 * Subject switcher. Available subjects switch; planned subjects open an informational preview (they never
 * replace the working tool). Grouped by product mode so Workbench and Learning subjects stay distinct.
 */
export function SubjectPicker({ activeSubject, onPreview, inline = false, onPicked, onSelectSubject }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listId = useId();
  const active = SUBJECTS.find((subject) => subject.id === activeSubject) ?? SUBJECTS[0];

  useEffect(() => {
    if (!open || inline) return undefined;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        rootRef.current?.querySelector<HTMLElement>(".subject-trigger")?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, inline]);

  const list = (
    <div className="subject-list" id={listId}>
      {(["workbench", "learning"] as SubjectMode[]).map((mode) => (
        <section aria-labelledby={`${listId}-${mode}`} className="subject-mode" key={mode}>
          <h3 className="subject-mode-title" id={`${listId}-${mode}`}>{MODE_LABELS[mode].label}</h3>
          <p className="subject-mode-blurb">{MODE_LABELS[mode].blurb}</p>
          <ul className="subject-items">
            {SUBJECTS.filter((subject) => subject.mode === mode).map((subject) => {
              const isActive = subject.id === activeSubject;
              return (
                <li key={subject.id}>
                  <button
                    aria-current={isActive ? "true" : undefined}
                    className={`subject-item${isActive ? " is-active" : ""}${subject.status === "planned" ? " is-planned" : ""}`}
                    onClick={() => {
                      setOpen(false);
                      if (subject.status === "planned") onPreview(subject);
                      else onSelectSubject?.(subject.id);
                      onPicked?.();
                    }}
                    type="button"
                  >
                    <Icon name={subject.icon} size={20} />
                    <span className="subject-item-text">
                      <span className="subject-item-name">{subject.label}</span>
                      <span className="subject-item-tag">{subject.tagline}</span>
                    </span>
                    <span className={`subject-badge ${subject.status}`}>{subject.status === "available" ? "Available" : "Planned"}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );

  if (inline) return <div className="subject-picker is-inline">{list}</div>;

  return (
    <div className="subject-picker" ref={rootRef}>
      <button
        aria-controls={open ? listId : undefined}
        aria-expanded={open}
        className="subject-trigger"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <Icon name={active.icon} size={18} />
        <span className="subject-trigger-label">{active.label}</span>
        <Icon className="subject-trigger-chevron" name="chevron" size={16} />
      </button>
      {open ? <div className="subject-popover">{list}</div> : null}
    </div>
  );
}
