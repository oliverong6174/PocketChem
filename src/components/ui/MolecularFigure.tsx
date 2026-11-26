import { useContext, useEffect, useId, useImperativeHandle, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useNavigation } from "../../navigation/NavigationContext";
import {
  copyMolecule,
  destinationsAccepting,
  exportMolecule,
  putMoleculeTransfer,
  type CopyFormat,
  type MoleculeDestinationId,
  type MoleculeSource,
} from "../../utils/moleculeTransfer";
import { Icon } from "./Icon";
import { MoleculeOriginContext } from "./moleculeOrigin";
import { MoleculeViewer } from "./MoleculeViewer";

export type MolecularFigureProps = {
  /** The SVG markup exactly as drawn on the page. */
  svg: string;
  /** Accessible name of the molecule ("Structure of glucose"). */
  title: string;
  /** What the depiction was drawn from; needed for Copy and Open in. Without it only Expand is offered. */
  source?: MoleculeSource | null;
  className?: string;
  /** Clicking the depiction opens the viewer. Turn off where clicking the picture already selects an atom or bond. */
  clickToExpand?: boolean;
  /** Which actions to offer. */
  actions?: { copy?: boolean; send?: boolean };
  /** Skip the toolbar and click target for very small thumbnails. */
  tiny?: boolean;
  /** Receives the root element (for callers that attach their own listeners to the SVG inside). */
  /** Native tooltip for the whole figure. */
  htmlTitle?: string;
  containerRef?: React.Ref<HTMLDivElement>;
  children?: ReactNode;
};

type MenuName = "copy" | "send" | null;

/**
 * One molecular depiction with a small toolbar: expand to a zoomable viewer, copy the structure, and open it in another workspace.
 * The root keeps the caller's class, so it drops in where the bare `<div dangerouslySetInnerHTML>` was.
 */
export function MolecularFigure({ svg, title, source = null, className, clickToExpand = true, actions, tiny = false, containerRef, htmlTitle, children }: MolecularFigureProps) {
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState<MenuName>(null);
  const [note, setNote] = useState<{ text: string; tone: "ok" | "warn" } | null>(null);
  const [destinations, setDestinations] = useState<{ id: MoleculeDestinationId; label: string }[] | null>(null);
  const origin = useContext(MoleculeOriginContext);
  const navigation = useNavigation();
  const rootRef = useRef<HTMLDivElement | null>(null);
  useImperativeHandle(containerRef, () => rootRef.current as HTMLDivElement, []);
  const menuRef = useRef<HTMLUListElement | null>(null);
  const [anchor, setAnchor] = useState<{ right: number; top: number } | null>(null);
  const noteTimer = useRef<number | undefined>(undefined);
  const menuId = useId();
  const canCopy = Boolean(source) && actions?.copy !== false;
  const canSend = Boolean(source) && actions?.send !== false;

  useEffect(() => () => window.clearTimeout(noteTimer.current), []);
  useEffect(() => {
    if (!menu) return undefined;
    const close = (event: Event) => { const target = event.target as Node; if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) setMenu(null); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { setMenu(null); rootRef.current?.querySelector<HTMLElement>(`[data-menu-button="${menu}"]`)?.focus(); } };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKey, true);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", onKey, true); };
  }, [menu]);

  const openMenu = (name: Exclude<MenuName, null>, trigger: HTMLElement) => {
    const rect = trigger.getBoundingClientRect();
    setAnchor({ right: Math.max(8, window.innerWidth - rect.right), top: rect.bottom + 4 });
    setMenu(name);
  };

  useEffect(() => {
    if (menu) menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [menu, destinations]);
  const onMenuKey = (event: React.KeyboardEvent<HTMLUListElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const items = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]')];
    if (!items.length) return;
    const index = items.indexOf(document.activeElement as HTMLElement);
    items[(index + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length].focus();
    event.preventDefault();
  };

  const say = (text: string, tone: "ok" | "warn" = "ok") => {
    window.clearTimeout(noteTimer.current);
    setNote({ text, tone });
    noteTimer.current = window.setTimeout(() => setNote(null), tone === "ok" ? 1800 : 5000);
  };

  async function copy(format: CopyFormat) {
    setMenu(null);
    if (!source) return;
    const outcome = await copyMolecule(source, format, svg);
    if (outcome.ok) say(format === "structure" ? "Structure copied" : format === "smiles" ? "SMILES copied" : "Image copied");
    else say(outcome.message, "warn");
  }

  async function toggleSend(trigger: HTMLElement) {
    if (menu === "send") { setMenu(null); return; }
    openMenu("send", trigger);
    setDestinations(null);
    if (!source) return;
    const exported = await exportMolecule(source);
    setDestinations(exported ? destinationsAccepting(exported, origin) : []);
  }

  async function send(destination: MoleculeDestinationId) {
    setMenu(null);
    if (!source) return;
    const exported = await exportMolecule(source);
    if (!exported) { say("This structure could not be read.", "warn"); return; }
    putMoleculeTransfer(destination, origin, { ...exported, label: exported.label ?? source.label ?? title });
    navigation.openDestination({ subject: "organic", toolId: destination });
  }

  const expandButton = (
    <button aria-label={`Enlarge ${title}`} className="mf-btn" data-testid="mf-expand" onClick={() => setOpen(true)} title="Enlarge" type="button"><Icon name="expand" size={16} /></button>
  );
  const toolbar = (
    <>
      {expandButton}
      {canCopy ? (
        <span className="mf-split">
          <button aria-label="Copy molecule" className="mf-btn" data-testid="mf-copy" onClick={() => void copy("structure")} title="Copy structure (Molfile)" type="button"><Icon name="copy" size={16} /></button>
          <button aria-controls={menu === "copy" ? menuId : undefined} aria-expanded={menu === "copy"} aria-haspopup="menu" aria-label="Copy as…" className="mf-btn mf-more" data-menu-button="copy" data-testid="mf-copy-more" onClick={(event) => (menu === "copy" ? setMenu(null) : openMenu("copy", event.currentTarget))} title="Copy as…" type="button"><Icon name="chevron" size={14} /></button>
        </span>
      ) : null}
      {canSend ? (
        <button aria-controls={menu === "send" ? menuId : undefined} aria-expanded={menu === "send"} aria-haspopup="menu" aria-label="Open in another workspace" className="mf-btn" data-menu-button="send" data-testid="mf-send" onClick={(event) => void toggleSend(event.currentTarget)} title="Open in…" type="button"><Icon name="send" size={16} /></button>
      ) : null}
    </>
  );

  return (
    <div className={`mf${className ? ` ${className}` : ""}${clickToExpand && !tiny ? " mf-clickable" : ""}`} data-testid="molecular-figure" title={htmlTitle} ref={rootRef}>
      <span
        aria-hidden="true"
        className="mf-art"
        dangerouslySetInnerHTML={{ __html: svg }}
        onClick={clickToExpand && !tiny ? () => setOpen(true) : undefined}
      />
      {children}
      {tiny ? null : (
        <div className="mf-tools" role="toolbar" aria-label="Molecule actions">
          {toolbar}
        </div>
      )}
      <span aria-live="polite" className={`mf-note${note ? ` is-visible is-${note.tone}` : ""}`} data-testid="mf-note" role="status">{note?.text ?? ""}</span>
      {menu ? createPortal(<>
          {menu === "copy" ? (
            <ul aria-label="Copy as" className="mf-menu" id={menuId} onKeyDown={onMenuKey} ref={menuRef} role="menu" style={{ right: anchor?.right ?? 8, top: anchor?.top ?? 0 }}>
              <li role="none"><button data-testid="mf-copy-structure" onClick={() => void copy("structure")} role="menuitem" type="button">Structure (Molfile)</button></li>
              <li role="none"><button data-testid="mf-copy-smiles" onClick={() => void copy("smiles")} role="menuitem" type="button">Isomeric SMILES</button></li>
              <li role="none"><button data-testid="mf-copy-image" onClick={() => void copy("image")} role="menuitem" type="button">Image (PNG)</button></li>
            </ul>
          ) : null}
          {menu === "send" ? (
            <ul aria-label="Open in" className="mf-menu" id={menuId} onKeyDown={onMenuKey} ref={menuRef} role="menu" style={{ right: anchor?.right ?? 8, top: anchor?.top ?? 0 }}>
              {destinations === null ? <li className="mf-menu-note" role="none">Checking…</li> : destinations.length === 0 ? <li className="mf-menu-note" role="none">No other workspace can take this structure</li> : destinations.map((destination) => (
                <li key={destination.id} role="none"><button data-testid={`mf-send-${destination.id}`} onClick={() => void send(destination.id)} role="menuitem" type="button">{destination.label}</button></li>
              ))}
            </ul>
          ) : null}
      </>, document.body) : null}
      {open ? <MoleculeViewer onClose={() => setOpen(false)} svg={svg} title={title} /> : null}
    </div>
  );
}
