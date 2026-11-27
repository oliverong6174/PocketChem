/**
 * Puts a saved structure back into a (new, empty) Ketcher editor and checks it came back intact.
 * Shared by the pages that mirror an editor. A structure the user already drew always wins.
 */
import { ketHasStructureText, ketIdentityKey } from "./ketIdentity";

export type EditorLike = {
  getKet: () => Promise<string>;
  setMolecule: (structure: string, options?: { needZoom?: boolean }) => Promise<unknown>;
};

export type EditorRestoreOutcome =
  | { kind: "restored" }
  | { kind: "user-content-kept" }
  | { kind: "superseded" }
  | { kind: "failed"; message: string };

export async function restoreEditorContent(
  api: EditorLike,
  saved: { ket: string; key: string | null },
  isCurrent: () => boolean,
): Promise<EditorRestoreOutcome> {
  try {
    if (!isCurrent()) return { kind: "superseded" };
    if (ketHasStructureText(await api.getKet())) return { kind: "user-content-kept" };
    if (!isCurrent()) return { kind: "superseded" };
    await api.setMolecule(saved.ket, { needZoom: true });
    const actual = await ketIdentityKey(await api.getKet());
    if (!isCurrent()) return { kind: "superseded" };
    if (saved.key && actual !== saved.key) {
      return { kind: "failed", message: "The restored structure does not match the saved one." };
    }
    return { kind: "restored" };
  } catch (error) {
    return { kind: "failed", message: error instanceof Error ? error.message : String(error) };
  }
}
