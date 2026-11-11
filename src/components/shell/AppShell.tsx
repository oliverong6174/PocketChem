import { useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { ORGANIC_TOOLS, SUBJECTS, TOOL_GROUPS, type SubjectDef, type SubjectId, type ToolDef } from "../../navigation/subjects";
import { useTheme } from "../../theme/useTheme";
import { Icon } from "../ui/Icon";
import { useDialog } from "../ui/useDialog";
import { PlannedSubjectDialog } from "./PlannedSubjectDialog";
import { SubjectPicker } from "./SubjectPicker";
import { ThemeToggle } from "./ThemeToggle";

interface Props {
  activeToolId: string;
  onSelectTool: (id: string) => void;
  onToolKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>, id: string) => void;
  /** Tools of the active subject. Defaults to the Organic Chemistry tools (the only implemented subject). */
  tools?: ToolDef[];
  activeSubject?: SubjectId;
  onSelectSubject?: (id: SubjectId) => void;
}

function BrandMark() {
  return (
    <svg aria-hidden="true" className="brand-mark" focusable="false" height="30" viewBox="0 0 32 32" width="30">
      <path d="M16 3.5l10.8 6.25v12.5L16 28.5 5.2 22.25V9.75L16 3.5z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="M16 10.5l5 2.9v5.7l-5 2.9-5-2.9v-5.7l5-2.9z" fill="none" opacity="0.55" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.4" />
      <circle className="brand-mark-dot" cx="16" cy="3.5" r="2.4" />
    </svg>
  );
}

/**
 * Application chrome: brand, subject switcher, theme control and tool navigation.
 *  - >= 960px: a sticky bar plus a grouped tab bar (the tool tabs keep role=tab and page-tab-* ids).
 *  - <  960px: one compact bar whose "current tool" button opens a full-height sheet with every tool,
 *    its description, the subject list and the theme control (large touch targets, focus-trapped).
 */
export function AppShell({ activeToolId, onSelectTool, onToolKeyDown, tools = ORGANIC_TOOLS, activeSubject = "organic", onSelectSubject }: Props) {
  const { preference, setPreference } = useTheme();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [preview, setPreview] = useState<SubjectDef | null>(null);
  const sheetRef = useDialog<HTMLDivElement>(sheetOpen, () => setSheetOpen(false));
  const subject = SUBJECTS.find((entry) => entry.id === activeSubject) ?? SUBJECTS[0];
  const activeTool = tools.find((tool) => tool.id === activeToolId) ?? tools[0];

  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to tool workspace
      </a>

      <header className="shell">
        <div className="shell-bar">
          <a aria-label="PocketChem home" className="brand" href="/" onClick={(event) => { event.preventDefault(); onSelectTool(tools[0].id); }}>
            <BrandMark />
            <span className="brand-word">PocketChem</span>
          </a>

          <div className="shell-subject">
            <SubjectPicker activeSubject={activeSubject} onPreview={setPreview} onSelectSubject={onSelectSubject} />
          </div>

          <button
            aria-expanded={sheetOpen}
            aria-haspopup="dialog"
            className="shell-menu"
            onClick={() => setSheetOpen(true)}
            type="button"
          >
            <Icon name={activeTool.icon} size={18} />
            <span className="shell-menu-text">
              <span className="shell-menu-sub">{subject.label}</span>
              <span className="shell-menu-current">{activeTool.label}</span>
            </span>
            <Icon name="menu" size={20} />
          </button>

          <div className="shell-theme">
            <ThemeToggle onChange={setPreference} preference={preference} />
          </div>
        </div>

        <nav aria-label={`${subject.label} tools`} className="tool-nav">
          <div aria-label={`${subject.label} tools`} className="tool-tabs" role="tablist">
            {TOOL_GROUPS.map((group) => {
              const groupTools = tools.filter((tool) => tool.group === group.id);
              if (groupTools.length === 0) return null;
              return (
                <div className="tool-group" key={group.id} role="none">
                  <span aria-hidden="true" className="tool-group-label">{group.label}</span>
                  {groupTools.map((tool) => (
                    <button
                      aria-controls={`page-panel-${tool.id}`}
                      aria-selected={activeToolId === tool.id}
                      className={activeToolId === tool.id ? "page-tab active" : "page-tab"}
                      id={`page-tab-${tool.id}`}
                      key={tool.id}
                      onClick={() => onSelectTool(tool.id)}
                      onKeyDown={(event) => onToolKeyDown(event, tool.id)}
                      role="tab"
                      tabIndex={activeToolId === tool.id ? 0 : -1}
                      title={tool.summary}
                      type="button"
                    >
                      <Icon name={tool.icon} size={16} />
                      {tool.label}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </nav>
      </header>

      <p aria-live="polite" className="tool-context">
        <span className="tool-context-name">{activeTool.label}</span>
        <span className="tool-context-summary">{activeTool.summary}</span>
      </p>

      {sheetOpen ? (
        <div className="dialog-scrim is-sheet" onMouseDown={(event) => { if (event.target === event.currentTarget) setSheetOpen(false); }}>
          <div aria-label="Navigation" aria-modal="true" className="sheet" ref={sheetRef} role="dialog">
            <div className="sheet-head">
              <span className="sheet-title">PocketChem</span>
              <button aria-label="Close menu" className="icon-button" data-autofocus onClick={() => setSheetOpen(false)} type="button">
                <Icon name="close" size={18} />
              </button>
            </div>

            <h2 className="sheet-subject">{subject.label}</h2>
            {TOOL_GROUPS.map((group) => {
              const groupTools = tools.filter((tool) => tool.group === group.id);
              if (groupTools.length === 0) return null;
              return (
                <section aria-label={group.label} className="sheet-group" key={group.id}>
                  <h3 className="sheet-group-label">{group.label}</h3>
                  <ul className="sheet-tools">
                    {groupTools.map((tool) => (
                      <li key={tool.id}>
                        <button
                          aria-current={activeToolId === tool.id ? "page" : undefined}
                          className={`sheet-tool${activeToolId === tool.id ? " is-active" : ""}`}
                          onClick={() => { onSelectTool(tool.id); setSheetOpen(false); }}
                          type="button"
                        >
                          <Icon name={tool.icon} size={22} />
                          <span className="sheet-tool-text">
                            <span className="sheet-tool-name">{tool.label}</span>
                            <span className="sheet-tool-summary">{tool.summary}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}

            <h2 className="sheet-subject">Subjects</h2>
            <SubjectPicker activeSubject={activeSubject} inline onPicked={() => setSheetOpen(false)} onPreview={setPreview} onSelectSubject={onSelectSubject} />

            <h2 className="sheet-subject">Appearance</h2>
            <ThemeToggle onChange={setPreference} preference={preference} />
          </div>
        </div>
      ) : null}

      <PlannedSubjectDialog onClose={() => setPreview(null)} subject={preview} />
    </>
  );
}
