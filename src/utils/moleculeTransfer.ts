/**
 * Moving a molecule between PocketChem workspaces and out to the clipboard.
 *
 * - `exportMolecule` turns whatever structure a depiction was drawn from (a Molfile, KET, or SMILES) into a Molfile and an
 *   isomeric SMILES using the local RDKit. A Molfile that already exists is passed through untouched (it carries the exact
 *   drawing, wedge bonds, isotopes, charges and any R groups); only a SMILES needs a Molfile generated for it.
 * - `copyMolecule` writes the chosen format to the clipboard. The default is the Molfile, which Ketcher reads when pasted.
 * - The inbox is a one-shot slot like the Biology hand-offs: a sender puts a validated payload in, the receiving page takes
 *   it once when it opens. A payload that is never taken is dropped; nothing is persisted here.
 */
import { getRDKit } from "./rdkit";

export type MoleculeSource = { smiles?: string | null; molfile?: string | null; ket?: string | null; label?: string | null };
export type MoleculeExport = { molfile: string; smiles: string; label: string | null };

export type MoleculeDestinationId = "analysis" | "acidBase" | "spectroscopy" | "conformations" | "reactions" | "multiStep" | "multiCatalytic";

export const MOLECULE_DESTINATIONS: { id: MoleculeDestinationId; label: string }[] = [
  { id: "analysis", label: "Properties" },
  { id: "acidBase", label: "Ranking" },
  { id: "spectroscopy", label: "Spectroscopy" },
  { id: "conformations", label: "Conformations" },
  { id: "reactions", label: "Reactions" },
  { id: "multiStep", label: "Multi-Step" },
  { id: "multiCatalytic", label: "Multi-Catalytic" },
];

export type MoleculeTransfer = MoleculeExport & { to: MoleculeDestinationId; from: MoleculeDestinationId | null; sequence: number };

/** The structure text to give RDKit: a Molfile or SMILES (KET is not read by RDKit, so a KET source needs one of the others). */
function structureText(source: MoleculeSource): string | null {
  const molfile = source.molfile?.trim();
  if (molfile && /M {2}END/.test(molfile)) return source.molfile as string;
  const smiles = source.smiles?.trim();
  return smiles ? smiles : null;
}

export async function exportMolecule(source: MoleculeSource): Promise<MoleculeExport | null> {
  const text = structureText(source);
  if (!text) return null;
  const rdkit = await getRDKit();
  const mol = rdkit.get_mol(text);
  if (!mol) return null;
  try {
    if (typeof mol.is_valid === "function" && !mol.is_valid()) return null;
    const smiles: string = mol.get_smiles();
    let molfile: string;
    if (text === source.molfile) molfile = source.molfile as string;
    else {
      // A SMILES has no layout: give it 2D coordinates so the Molfile opens as a readable drawing.
      if (typeof mol.set_new_coords === "function") mol.set_new_coords();
      molfile = mol.get_molblock();
    }
    return { molfile, smiles, label: source.label ?? null };
  } finally {
    mol.delete();
  }
}

export type CopyFormat = "structure" | "smiles" | "image";
export type CopyOutcome = { ok: true; format: CopyFormat; note: string | null } | { ok: false; message: string };

async function writeText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers and some embedded contexts only allow the copy command inside a user gesture.
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const done = document.execCommand("copy");
      area.remove();
      return done;
    } catch {
      return false;
    }
  }
}

/** Rasterises an SVG string to a PNG blob at a size that stays sharp when pasted (2x of the SVG's own size). */
export async function svgToPngBlob(svg: string): Promise<Blob | null> {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() !== "svg") return null;
  const box = root.getAttribute("viewBox")?.split(/[\s,]+/).map(Number);
  const width = Number.parseFloat(root.getAttribute("width") ?? "") || box?.[2] || 400;
  const height = Number.parseFloat(root.getAttribute("height") ?? "") || box?.[3] || 300;
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const image = new Image();
    image.decoding = "async";
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("image")); image.src = url; });
    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Copies a molecule. "structure" writes the Molfile as text, which Ketcher pastes as a drawing; "smiles" writes the isomeric
 * SMILES; "image" writes a PNG when the browser allows image clipboard items. An SVG picture is never used as structure data.
 */
export async function copyMolecule(source: MoleculeSource, format: CopyFormat, svg?: string | null): Promise<CopyOutcome> {
  if (format === "image") {
    if (!svg) return { ok: false, message: "There is no image to copy." };
    if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) return { ok: false, message: "This browser cannot copy images. Copy the structure or SMILES instead." };
    try {
      const png = await svgToPngBlob(svg);
      if (!png) return { ok: false, message: "The image could not be prepared." };
      await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
      return { ok: true, format, note: null };
    } catch {
      return { ok: false, message: "The browser did not allow copying the image." };
    }
  }
  const exported = await exportMolecule(source);
  if (!exported) return { ok: false, message: "This structure could not be read." };
  const text = format === "smiles" ? exported.smiles : exported.molfile;
  if (!(await writeText(text))) return { ok: false, message: "The browser did not allow copying. Select the structure in the editor instead." };
  return { ok: true, format, note: null };
}

// ---- cross-workspace inbox ------------------------------------------------------------------------------------------------

let slot: MoleculeTransfer | null = null;
let counter = 0;
const listeners = new Set<() => void>();

export function putMoleculeTransfer(to: MoleculeDestinationId, from: MoleculeDestinationId | null, exported: MoleculeExport): void {
  slot = { ...exported, to, from, sequence: (counter += 1) };
  listeners.forEach((listener) => listener());
}

/** The pending transfer for a page, without consuming it. */
export function peekMoleculeTransfer(to: MoleculeDestinationId): MoleculeTransfer | null {
  return slot && slot.to === to ? slot : null;
}

/** Consumes the pending transfer for a page (only if it is still the one that was peeked). */
export function takeMoleculeTransfer(to: MoleculeDestinationId, sequence?: number): MoleculeTransfer | null {
  if (!slot || slot.to !== to || (sequence !== undefined && slot.sequence !== sequence)) return null;
  const taken = slot;
  slot = null;
  return taken;
}

export function clearMoleculeTransfer(): void {
  slot = null;
}

export function subscribeMoleculeTransfer(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Source for item `index` of a list of component SMILES, only when the list lines up one to one with the drawings shown. */
export function componentSource(components: readonly string[], drawn: number, index: number): MoleculeSource | null {
  return components.length === drawn && components[index] ? { smiles: components[index] } : null;
}
