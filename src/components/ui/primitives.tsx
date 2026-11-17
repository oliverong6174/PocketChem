import { useId, type ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

/**
 * Shared presentation components. They carry no chemistry; pages pass in already-computed content.
 * Styles: src/styles/ui.css (.ui-*). Colours come from the semantic tokens, so every component follows
 * the light/dark theme.
 */

export type Tone = "neutral" | "ok" | "warn" | "danger" | "info" | "estimate";

/* ---------- layout ---------- */

/** Input | stage | inspector layout. Without an inspector it is a plain responsive stack. */
export function Workspace({ children, hasInspector = false, label }: { children: ReactNode; hasInspector?: boolean; label?: string }) {
  return (
    <div aria-label={label} className={`ui-workspace${hasInspector ? " has-inspector" : ""}`} role={label ? "group" : undefined}>
      {children}
    </div>
  );
}

export function Panel({ title, subtitle, actions, children, className = "", as: Tag = "section", titleId }: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "aside";
  titleId?: string;
}) {
  const fallbackId = useId();
  const headingId = titleId ?? fallbackId;
  return (
    <Tag aria-labelledby={title ? headingId : undefined} className={`ui-panel ${className}`.trim()}>
      {title || actions ? (
        <div className="ui-panel-head">
          <div>
            {title ? <h2 className="ui-panel-title" id={headingId}>{title}</h2> : null}
            {subtitle ? <p className="ui-panel-sub">{subtitle}</p> : null}
          </div>
          {actions}
        </div>
      ) : null}
      {children}
    </Tag>
  );
}

/** The analysis / results inspector: a Panel that docks beside the stage on wide screens. */
export function Inspector({ title = "Inspector", children, subtitle }: { title?: ReactNode; children: ReactNode; subtitle?: ReactNode }) {
  return (
    <Panel as="aside" className="ui-inspector" subtitle={subtitle} title={title}>
      <div className="ui-stack">{children}</div>
    </Panel>
  );
}

/** Paper-coloured container for structures, projections and graphs. */
export function DiagramFrame({ title, toolbar, legend, caption, children, label }: {
  title?: ReactNode;
  toolbar?: ReactNode;
  legend?: ReactNode;
  caption?: ReactNode;
  children: ReactNode;
  label?: string;
}) {
  return (
    <figure aria-label={label} className="ui-diagram" style={{ margin: 0 }}>
      {title || toolbar ? (
        <figcaption className="ui-diagram-head">
          {title ? <h3 className="ui-diagram-title">{title}</h3> : <span />}
          {toolbar}
        </figcaption>
      ) : null}
      <div className="ui-diagram-body">{children}</div>
      {legend || caption ? (
        <div className="ui-diagram-foot">
          {legend}
          {caption ? <p style={{ margin: legend ? "8px 0 0" : 0 }}>{caption}</p> : null}
        </div>
      ) : null}
    </figure>
  );
}

export interface LegendItem {
  label: string;
  /** A CSS colour (use a token such as var(--status-ok)). */
  color: string;
  kind?: "box" | "line" | "dashed";
}

/** Colour/line legend. Always pair colour with a text label; never rely on colour alone. */
export function Legend({ items, label = "Legend" }: { items: LegendItem[]; label?: string }) {
  return (
    <ul aria-label={label} className="ui-legend">
      {items.map((item) => (
        <li key={item.label}>
          <span
            aria-hidden="true"
            className={`ui-legend-swatch${item.kind === "line" ? " is-line" : ""}${item.kind === "dashed" ? " is-line is-dashed" : ""}`}
            style={{ color: item.color, background: item.kind === "box" || !item.kind ? item.color : "transparent" }}
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/* ---------- status and warnings ---------- */

export function Badge({ tone = "neutral", icon, children, title }: { tone?: Tone; icon?: IconName; children: ReactNode; title?: string }) {
  return (
    <span className={`ui-badge tone-${tone}`} title={title}>
      {icon ? <Icon name={icon} size={13} /> : null}
      {children}
    </span>
  );
}

/**
 * Evidence level of a displayed result. These labels are deliberately modest: nothing PocketChem
 * computes is experimental evidence, and "estimate" is drawn dashed so it cannot pass for a measurement.
 */
export type EvidenceLevel = "estimate" | "rule" | "model" | "saved";
const EVIDENCE: Record<EvidenceLevel, { tone: Tone; label: string; hint: string }> = {
  estimate: { tone: "estimate", label: "Heuristic estimate", hint: "Estimated from structural rules; not a measurement or a rigorous calculation." },
  rule: { tone: "info", label: "Rule-based prediction", hint: "Predicted by PocketChem's reaction rules; not experimentally validated." },
  model: { tone: "info", label: "Teaching model", hint: "Computed from a simplified, documented model; not a force-field or quantum result." },
  saved: { tone: "neutral", label: "Saved result", hint: "Restored from a saved analysis; not recomputed." },
};

export function EvidenceBadge({ level }: { level: EvidenceLevel }) {
  const info = EVIDENCE[level];
  return <Badge icon={level === "estimate" ? "warning" : "info"} title={info.hint} tone={info.tone}>{info.label}</Badge>;
}

const CALLOUT_ICON: Record<Tone, IconName> = { neutral: "info", info: "info", ok: "check", warn: "warning", danger: "error", estimate: "info" };

/** Warnings, notes, unsupported-result explanations. `danger` and `warn` announce themselves to screen readers. */
export function Callout({ tone = "info", title, children, action, className = "" }: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const role = tone === "danger" ? "alert" : tone === "warn" ? "status" : "note";
  return (
    <div className={`ui-callout tone-${tone === "neutral" ? "info" : tone} ${className}`.trim()} role={role}>
      <Icon name={CALLOUT_ICON[tone]} size={18} />
      <div className="ui-callout-body" style={{ flex: 1, minWidth: 0 }}>
        {title ? <p className="ui-callout-title">{title}</p> : null}
        {children}
        {action ? <div style={{ marginTop: 8 }}>{action}</div> : null}
      </div>
    </div>
  );
}

export function EmptyState({ icon = "molecule", title, children, action }: { icon?: IconName; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="ui-empty">
      <span aria-hidden="true" className="ui-empty-icon"><Icon name={icon} size={24} /></span>
      <h3 className="ui-empty-title">{title}</h3>
      {children ? <p>{children}</p> : null}
      {action}
    </div>
  );
}

export function LoadingState({ children = "Working…" }: { children?: ReactNode }) {
  return (
    <div className="page-loading" role="status">
      <span aria-hidden="true" className="loading-spinner" />
      {children}
    </div>
  );
}

/* ---------- progressive disclosure ---------- */

/** Native <details>: keyboard and screen-reader support for free; hides advanced or technical material. */
export function Disclosure({ summary, hint, children, defaultOpen = false }: { summary: ReactNode; hint?: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details className="ui-disclosure" open={defaultOpen}>
      <summary>
        {summary}
        {hint ? <span className="ui-disclosure-hint">{hint}</span> : null}
        <Icon name="chevron" size={16} style={hint ? undefined : { marginLeft: "auto" }} />
      </summary>
      <div className="ui-disclosure-body">{children}</div>
    </details>
  );
}

/* ---------- controls ---------- */

export interface SegmentedOption<T extends string> {
  id: T;
  label: ReactNode;
  disabled?: boolean;
  title?: string;
}

/** Radio-group segmented control: one value, native keyboard arrows, visible focus. */
export function Segmented<T extends string>({ label, value, options, onChange, name }: {
  label: string;
  value: T;
  options: Array<SegmentedOption<T>>;
  onChange: (value: T) => void;
  name?: string;
}) {
  const groupName = useId();
  return (
    <div aria-label={label} className="ui-seg" role="radiogroup">
      {options.map((option) => (
        <label className="ui-seg-option" key={option.id} title={option.title}>
          <input
            checked={value === option.id}
            disabled={option.disabled}
            name={name ?? groupName}
            onChange={() => onChange(option.id)}
            type="radio"
            value={option.id}
          />
          {option.label}
        </label>
      ))}
    </div>
  );
}

/* ---------- summaries and explanations ---------- */

export interface Figure {
  label: string;
  value: ReactNode;
  note?: ReactNode;
}

export function KeyFigures({ items }: { items: Figure[] }) {
  return (
    <dl className="ui-figures">
      {items.map((item) => (
        <div className="ui-figure" key={item.label}>
          <dt>{item.label}</dt>
          <dd>
            {item.value}
            {item.note ? <small>{item.note}</small> : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function Explanation({ title, children }: { title?: ReactNode; children: ReactNode }) {
  return (
    <div className="ui-explain">
      {title ? <h3>{title}</h3> : null}
      {children}
    </div>
  );
}

/* ---------- tool page header ---------- */

export interface ToolStep { label: string; detail?: string }

/**
 * The same opening block for every scientific tool: where it sits (group), what it is for, whether the editor is ready,
 * how much to trust its output, and the three-step flow. It replaces each page's ad-hoc intro; it carries no chemistry.
 */
export function ToolHeader({ group, title, purpose, ready, readyLabel = "Editor ready", loadingLabel = "Loading editor", evidence, steps, aside, headingLevel = 2 }: {
  group: "Analyze" | "Synthesize" | "Library" | "Mechanics" | "Waves & optics" | "Electricity" | "Gene expression" | "Genetics & cell division" | "Cellular biology & physiology" | "Biomolecules" | "Metabolism";
  title: ReactNode;
  purpose: ReactNode;
  /** undefined hides the status chip (tools with no editor). */
  ready?: boolean;
  readyLabel?: string;
  loadingLabel?: string;
  evidence?: EvidenceLevel;
  steps?: ToolStep[];
  aside?: ReactNode;
  headingLevel?: 1 | 2;
}) {
  const Heading = headingLevel === 1 ? "h1" : "h2";
  return (
    <header className="ui-tool-header">
      <div className="ui-tool-header-main">
        <p className="ui-tool-eyebrow">{group}</p>
        <Heading className="ui-tool-title">{title}</Heading>
        <p className="ui-tool-purpose">{purpose}</p>
        {steps && steps.length > 0 ? (
          <ol className="ui-tool-steps" aria-label="How this tool works">
            {steps.map((step) => (
              <li key={step.label}>
                <strong>{step.label}</strong>
                {step.detail ? <span>{step.detail}</span> : null}
              </li>
            ))}
          </ol>
        ) : null}
      </div>
      <div className="ui-tool-header-side">
        {ready !== undefined ? <span className={`status ${ready ? "ready" : "loading"}`} role="status">{ready ? readyLabel : loadingLabel}</span> : null}
        {evidence ? <EvidenceBadge level={evidence} /> : null}
        {aside}
      </div>
    </header>
  );
}
