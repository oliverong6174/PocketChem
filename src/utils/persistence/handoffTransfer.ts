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
