/**
 * Moves a molecule into a page's editor as a transaction that cannot destroy the saved workspace.
 *
 *   1. Saving is suspended, so nothing is written (and a recovery that finishes meanwhile is held
 *      back by the controller) until the outcome is known. The saved record is never touched here.
 *   2. The editor's current drawing is remembered, the molecule is loaded and read back; it must
 *      arrive as a real structure.
 *   3. If loading fails, even after the editor was partly changed, the previous drawing is put back
 *      and verified, and saving resumes as if nothing had happened ("rolled-back").
 *   4. If the previous drawing cannot be put back, the editor's content is unknown: saving is
 *      switched off so nothing is saved over the stored workspace ("editor-unknown").
 *   5. On success the controller's epoch moves on, which invalidates every callback that belonged to
 *      the old workspace, and saving is live again. The caller then writes the new workspace, which
 *      replaces the old record in one write.
 */
import { ketHasStructureText, ketIdentityKey } from "./ketIdentity";

export type TransferEditor = {
  getKet: () => Promise<string>;
  setMolecule: (structure: string, options?: { needZoom?: boolean }) => Promise<unknown>;
};

export type TransferController = {
  suspend: () => void;
  resume: () => void;
  disable: () => void;
  replaceWorkspace: () => void;
};

export type TransferOutcome =
  | { kind: "adopted"; ket: string; key: string }
  | { kind: "rolled-back" }
  | { kind: "editor-unknown" };

export async function transferIntoEditor(
  api: TransferEditor,
  source: string,
  controller: TransferController,
): Promise<TransferOutcome> {
  controller.suspend();
  const previousKet = await api.getKet().catch(() => null);
  const previousHadStructure = ketHasStructureText(previousKet);

  try {
    await api.setMolecule(source, { needZoom: true });
    const ket = await api.getKet();
    const key = await ketIdentityKey(ket);
    if (!key || !ketHasStructureText(ket)) throw new Error("The molecule did not arrive in the editor.");
    controller.replaceWorkspace();
    return { kind: "adopted", ket, key };
  } catch {
    // fall through to the rollback
  }

  let rolledBack = false;
  if (previousKet !== null) {
    try {
      await api.setMolecule(previousHadStructure ? previousKet : "", { needZoom: true });
      const after = await ketIdentityKey(await api.getKet());
      rolledBack = after === (previousHadStructure ? await ketIdentityKey(previousKet) : null);
    } catch {
      rolledBack = false;
    }
  }
  if (rolledBack) {
    controller.resume();
    return { kind: "rolled-back" };
  }
  controller.disable();
  return { kind: "editor-unknown" };
}

// ---- several editors at once (opening a saved two-editor analysis) --------------------------------------------

const EMPTY_KET = JSON.stringify({ root: { nodes: [] } });

export type TransferEntry = {
  api: TransferEditor;
  /** KET (or any structure text) to load; null clears the editor. */
  source: string | null;
  /** The chemistry identity the editor must show afterwards; null when no check beyond "has a structure". */
  expectKey: string | null;
};

export type MultiTransferOutcome =
  | { kind: "adopted"; editors: Array<{ ket: string | null; key: string | null }> }
  | { kind: "rolled-back" }
  | { kind: "editor-unknown" };

/**
 * The same transaction as `transferIntoEditor`, for several editors that must change together: all
 * of them reach their new content, or all of them are put back and verified. Editors are touched one
 * at a time (concurrent exports can leave a Ketcher worker waiting).
 */
export async function transferIntoEditors(
  entries: TransferEntry[],
  controller: TransferController,
): Promise<MultiTransferOutcome> {
  controller.suspend();
  const previous: Array<string | null> = [];
  for (const entry of entries) previous.push(await entry.api.getKet().catch(() => null));

  const touched: number[] = [];
  const loaded: Array<{ ket: string | null; key: string | null }> = [];
  let failed = false;
  for (let index = 0; index < entries.length && !failed; index += 1) {
    const { api, source, expectKey } = entries[index];
    touched.push(index);
    try {
      await api.setMolecule(source ?? EMPTY_KET, { needZoom: true });
      const ket = await api.getKet();
      const key = await ketIdentityKey(ket);
      const hasStructure = ketHasStructureText(ket);
      if (source === null) {
        if (hasStructure) throw new Error("The editor did not clear.");
        loaded.push({ ket: null, key: null });
      } else {
        if (!key || !hasStructure) throw new Error("The structure did not arrive in the editor.");
        if (expectKey !== null && key !== expectKey) throw new Error("The structure in the editor is not the saved one.");
        loaded.push({ ket, key });
      }
    } catch {
      failed = true;
    }
  }

  if (!failed) {
    controller.replaceWorkspace();
    return { kind: "adopted", editors: loaded };
  }

  // Put every editor that was touched back and confirm it.
  let rolledBack = true;
  for (const index of touched) {
    const before = previous[index];
    if (before === null) {
      rolledBack = false;
      continue;
    }
    try {
      const had = ketHasStructureText(before);
      await entries[index].api.setMolecule(had ? before : EMPTY_KET, { needZoom: true });
      const after = await ketIdentityKey(await entries[index].api.getKet());
      if (after !== (had ? await ketIdentityKey(before) : null)) rolledBack = false;
    } catch {
      rolledBack = false;
    }
  }
  if (rolledBack) {
    controller.resume();
    return { kind: "rolled-back" };
  }
  controller.disable();
  return { kind: "editor-unknown" };
}
