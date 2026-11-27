import { useEffect, useRef, useState, type ReactNode } from "react";
import type { KetcherApi } from "../MoleculeDrawer";
import { ketHasStructureText } from "../../utils/persistence/ketIdentity";
import {
  MOLECULE_DESTINATIONS,
  peekMoleculeTransfer,
  subscribeMoleculeTransfer,
  takeMoleculeTransfer,
  type MoleculeDestinationId,
  type MoleculeTransfer,
} from "../../utils/moleculeTransfer";

type Options = {
  destination: MoleculeDestinationId;
  /** The editor that receives the molecule. */
  api: KetcherApi | null;
  /** The page has finished restoring its saved workspace and its editor is usable. */
  ready: boolean;
  /** The page holds results or other work that a replacement would discard. */
  hasWork?: boolean;
  /** A saved workspace is being restored, so an empty editor may be about to be filled. */
  expectRestore?: boolean;
  /** Custom loader for pages that do not use the editor (Conformations). Return false to report failure. */
  load?: (transfer: MoleculeTransfer) => Promise<boolean> | boolean;
};

const labelOf = (id: MoleculeDestinationId | null) => MOLECULE_DESTINATIONS.find((entry) => entry.id === id)?.label ?? "another workspace";

async function editorHasStructure(api: KetcherApi): Promise<boolean> {
  try { return ketHasStructureText(await api.getKet()); } catch { return true; /* unknown: do not overwrite */ }
}

/**
 * Receives a molecule sent from another workspace. An empty editor takes it at once; an editor that holds a drawing, or a page that
 * holds results, asks first and keeps everything if the user cancels. Returns the banner to render at the top of the page.
 */
export function useIncomingMolecule({ destination, api, ready, hasWork = false, expectRestore = false, load }: Options): ReactNode {
  const [pending, setPending] = useState<MoleculeTransfer | null>(null);
  const [message, setMessage] = useState<{ text: string; tone: "ok" | "warn" } | null>(null);
  const [busy, setBusy] = useState(false);
  const handled = useRef(0);
  const latest = useRef({ api, hasWork, expectRestore, load });
  useEffect(() => { latest.current = { api, hasWork, expectRestore, load }; });

  async function apply(transfer: MoleculeTransfer) {
    setBusy(true);
    try {
      const { api: editor, load: loader } = latest.current;
      let ok: boolean;
      if (loader) ok = await loader(transfer);
      else if (editor) {
        await editor.setMolecule(transfer.molfile, { needZoom: true });
        ok = ketHasStructureText(await editor.getKet());
      } else ok = false;
      setMessage(ok
        ? { text: `${transfer.label ?? "The molecule"} was opened here${transfer.from ? ` from ${labelOf(transfer.from)}` : ""}.`, tone: "ok" }
        : { text: "The molecule could not be loaded. Nothing was changed.", tone: "warn" });
    } catch {
      setMessage({ text: "The molecule could not be loaded. Nothing was changed.", tone: "warn" });
    } finally {
      takeMoleculeTransfer(destination, transfer.sequence);
      setPending(null);
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!ready) return undefined;
    let cancelled = false;
    const check = async () => {
      const transfer = peekMoleculeTransfer(destination);
      if (!transfer || transfer.sequence === handled.current) return;
      handled.current = transfer.sequence;
      const { api: editor, hasWork: work, expectRestore: restoring } = latest.current;
      let occupied = work;
      if (editor) {
        // A saved drawing may still be on its way into the editor: give it a moment before calling the editor empty.
        for (let attempt = 0; attempt < (restoring ? 6 : 1) && !occupied; attempt += 1) {
          occupied = await editorHasStructure(editor);
          if (!occupied && restoring && attempt < 5) await new Promise((resolve) => setTimeout(resolve, 500));
          if (cancelled) return;
        }
      }
      if (cancelled) return;
      if (occupied) setPending(transfer);
      else await apply(transfer);
    };
    void check();
    const unsubscribe = subscribeMoleculeTransfer(() => void check());
    return () => { cancelled = true; unsubscribe(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, destination, api]);

  // A notice about a finished transfer fades by itself.
  useEffect(() => {
    if (!message || message.tone === "warn") return undefined;
    const timer = window.setTimeout(() => setMessage(null), 6000);
    return () => window.clearTimeout(timer);
  }, [message]);

  if (pending) {
    return (
      <div aria-label="Replace the current molecule?" className="mf-incoming" data-testid="incoming-molecule-confirm" role="alertdialog">
        <p>
          Open {pending.label ? <strong>{pending.label}</strong> : "this molecule"} from {labelOf(pending.from)}? It will replace the drawing{hasWork ? " and results" : ""} in this workspace.
        </p>
        <div className="button-row">
          <button className="primary-button" data-autofocus disabled={busy} data-testid="incoming-molecule-replace" onClick={() => void apply(pending)} type="button">Replace</button>
          <button className="secondary-button" disabled={busy} data-testid="incoming-molecule-cancel" onClick={() => { takeMoleculeTransfer(destination, pending.sequence); setPending(null); }} type="button">Keep current</button>
        </div>
      </div>
    );
  }
  if (message) return <p className={`mf-incoming is-${message.tone}`} data-testid="incoming-molecule-note" role="status">{message.text}</p>;
  return null;
}
