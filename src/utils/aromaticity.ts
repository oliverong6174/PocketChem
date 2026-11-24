/**
 * RDKit owns ring perception and aromatic flags. This module groups those rings and adds a
 * deliberately conservative electron interpretation, never a second aromaticity detector.
 * Antiaromaticity is restricted to supported monocyclic planar teaching models (4-C diene,
 * 5-C dienyl cation). Geometry and spin are not inferred from a 2D drawing.
 */
import { getRDKit } from "./rdkit";

export type RingAtom = { index: number; z: number; charge: number; hydrogens: number; isotope: number; radicals: number; aromatic: boolean };
export type RingBond = { index: number; a: number; b: number; order: number; aromatic: boolean };
export type AromaticGraph = { atoms: RingAtom[]; bonds: RingBond[]; rings: number[][]; smiles: string; molfile: string };
export type AromaticClassification = "aromatic" | "nonaromatic" | "antiaromatic (planar model)" | "mixed" | "uncertain";
export type ElectronContribution = { atom: number; element: string; charge: number; electrons: number | null; reason: string };
export type RingSystem = {
  id: string; atoms: number[]; bonds: number[]; rings: Array<{ atoms: number[]; aromatic: boolean }>;
  classification: AromaticClassification; piElectrons: number | null; conjugation: string;
  geometry: string; explanation: string; contributions: ElectronContribution[];
};
export type AromaticityAnalysis = { systems: RingSystem[]; summary: string; limitations: string[]; model: string };

type JsonAtom = { z?: number; chg?: number; impHs?: number; isotope?: number; nRad?: number };
type JsonBond = { atoms: [number, number]; bo?: number };
type JsonExtension = { name: string; aromaticAtoms?: number[]; aromaticBonds?: number[]; atomRings?: number[][] };

/** Same RDKit JSON representation used by the existing conformation graph; supports fragments. */
export async function readAromaticGraph(structure: string): Promise<AromaticGraph> {
  const rdkit = await getRDKit();
  const mol = rdkit.get_mol(structure);
  if (!mol) throw new Error("RDKit could not read this molecular structure.");
  try {
    const json = JSON.parse(mol.get_json()) as { molecules: Array<{ atoms: JsonAtom[]; bonds: JsonBond[]; extensions: JsonExtension[] }> };
    const data = json.molecules[0];
    const ext = data.extensions.find((e) => e.name === "rdkitRepresentation");
    const aromaticAtoms = new Set(ext?.aromaticAtoms ?? []), aromaticBonds = new Set(ext?.aromaticBonds ?? []);
    const atoms = data.atoms.map((a, index): RingAtom => ({ index, z: a.z ?? 6, charge: a.chg ?? 0, hydrogens: a.impHs ?? 0, isotope: a.isotope ?? 0, radicals: a.nRad ?? 0, aromatic: aromaticAtoms.has(index) }));
    const bonds = data.bonds.map((b, index): RingBond => ({ index, a: b.atoms[0], b: b.atoms[1], order: b.bo ?? 1, aromatic: aromaticBonds.has(index) }));
    for (const a of atoms) a.hydrogens += bonds.filter((b) => (b.a === a.index && atoms[b.b].z === 1) || (b.b === a.index && atoms[b.a].z === 1)).length;
    return { atoms, bonds, rings: ext?.atomRings ?? [], smiles: mol.get_smiles(), molfile: mol.get_molblock() };
  } finally { mol.delete(); }
}

const element = (z: number) => ({ 0: "R/*", 6: "C", 7: "N", 8: "O", 15: "P", 16: "S" }[z] ?? `Z=${z}`);

function systemDetails(graph: AromaticGraph, cycles: number[][], index: number): RingSystem {
  const atoms = [...new Set(cycles.flat())].sort((a,b) => a-b), members = new Set(atoms);
  const internal = graph.bonds.filter((b) => members.has(b.a) && members.has(b.b));
  const bonds = internal.map((b) => b.index);
  const rings = cycles.map((cycle) => ({ atoms: cycle, aromatic: cycle.every((a, i) => graph.bonds.some((b) => b.aromatic && ((b.a === a && b.b === cycle[(i+1)%cycle.length]) || (b.b === a && b.a === cycle[(i+1)%cycle.length])))) }));
  const hasExocyclicDouble = graph.bonds.some((b) => b.order >= 2 && members.has(b.a) !== members.has(b.b));
  const invalid = atoms.some((a) => graph.atoms[a].z === 0 || graph.atoms[a].radicals > 0);
  const contributions = atoms.map((i): ElectronContribution => {
    const atom = graph.atoms[i], local = internal.filter((b) => b.a === i || b.b === i);
    const dbl = local.some((b) => b.order === 2);
    let electrons: number | null = null, reason = "Electron contribution is outside the supported model.";
    if (!invalid && !hasExocyclicDouble) {
      if (atom.z === 6 && atom.charge === 0) {
        electrons = dbl ? 1 : atom.aromatic ? null : 0;
        reason = dbl ? "One electron in a ring p orbital." : "Saturated carbon interrupts cyclic p overlap.";
      } else if (atom.z === 6 && atom.charge === -1 && !dbl && local.length === 2) {
        electrons = 2; reason = "Anionic carbon contributes a lone pair to the p system.";
      } else if (atom.z === 6 && atom.charge === 1 && !dbl && local.length === 2) {
        electrons = 0; reason = "Cationic carbon supplies an empty p orbital.";
      } else if ([7,8,16].includes(atom.z) && atom.aromatic && Math.abs(atom.charge) <= 1) {
        electrons = dbl ? 1 : atom.charge <= 0 ? 2 : null;
        reason = dbl ? "One p electron; the pyridine-type lone pair does not enter this π system." : "One pyrrole-type lone pair contributes two π electrons.";
      }
    }
    return { atom: i, element: element(atom.z), charge: atom.charge, electrons, reason };
  });
  let piElectrons = contributions.every((c) => c.electrons !== null) ? contributions.reduce((n,c) => n + (c.electrons ?? 0),0) : null;
  const allAromatic = atoms.every((i) => graph.atoms[i].aromatic) && internal.some((b) => b.aromatic);
  const someAromatic = internal.some((b) => b.aromatic);
  const carbocycle = cycles.length === 1 && atoms.every((i) => graph.atoms[i].z === 6) && internal.every((b) => [1,2].includes(b.order));
  const conjugated = contributions.every((c) => c.electrons !== null && !(c.electrons === 0 && graph.atoms[c.atom].charge === 0));
  let classification: AromaticClassification = "uncertain";
  let geometry = "Planarity is not established by a 2D structure.";
  let explanation = "RDKit does not mark this ring system aromatic. Geometry or electron contributions need additional evidence; no antiaromaticity is inferred.";
  let conjugation = conjugated ? "Cyclic p-orbital connectivity supported" : "Cyclic conjugation interrupted or unsupported";
  if (invalid) {
    piElectrons = null;
    explanation = "A wildcard or radical in this ring prevents a supported electron and spin assignment.";
  } else if (allAromatic) {
    classification = "aromatic";
    conjugation = "Aromatic conjugation perceived by RDKit";
    geometry = "Planar conjugated model implicit in RDKit aromaticity; no 3D geometry measurement.";
    explanation = cycles.length > 1 ? "RDKit perceives aromaticity in this fused system. Count shared atoms once; individual ring flags are shown separately. A global 4n+2 test is not applied to arbitrary fused topologies." : "RDKit perceives an aromatic cyclic system. The supported electron count is interpreted with heteroatom and charge contributions.";
  } else if (someAromatic) {
    classification = "mixed"; piElectrons = null;
    explanation = "This fused system contains aromatic and other ring regions. One electron total would obscure their different environments.";
  } else if (carbocycle && !hasExocyclicDouble && piElectrons !== null) {
    const neutral4 = atoms.length === 4 && piElectrons === 4 && atoms.every((i) => graph.atoms[i].charge === 0);
    const cation5 = atoms.length === 5 && piElectrons === 4 && atoms.filter((i) => graph.atoms[i].charge === 1).length === 1 && atoms.every((i) => [0,1].includes(graph.atoms[i].charge));
    if (conjugated && (neutral4 || cation5)) {
      classification = "antiaromatic (planar model)";
      geometry = "Supported planar, singlet teaching model; geometry and spin assumed.";
      explanation = cation5 ? "The planar singlet cyclopentadienyl-cation model has four π electrons and cyclic p overlap. Actual spin state, distortion and substituents can change this conclusion; no ground-state stability claim is made." : "Cyclobutadiene is a supported four-π planar antiaromatic model. Bond-length distortion does not make it an aromatic system; it is highly reactive.";
    } else if (atoms.length === 8 && piElectrons === 8 && conjugated && atoms.every((i) => graph.atoms[i].charge === 0)) {
      classification = "nonaromatic";
      geometry = "Cyclooctatetraene reference: nonplanar tub geometry; substituted structures may require 3D evidence.";
      conjugation = "p orbitals present; continuous overlap disrupted by nonplanarity";
      explanation = "Eight π electrons alone do not establish antiaromaticity. Ordinary cyclooctatetraene avoids a planar antiaromatic arrangement by adopting a tub conformation.";
    } else if (!conjugated) {
      classification = "nonaromatic";
      explanation = "At least one saturated ring carbon interrupts the cyclic p system. An electron total without cyclic overlap does not imply aromaticity or antiaromaticity.";
    }
  }
  return { id: `ring-system-${index+1}`, atoms, bonds, rings, classification, piElectrons, conjugation, geometry, explanation, contributions };
}

export async function analyzeAromaticity(structure: string): Promise<AromaticityAnalysis> {
  const graph = await readAromaticGraph(structure);
  // Rings sharing a bond belong to one fused/bridged system; spiro rings remain separate.
  const pending = graph.rings.map((r) => [r]);
  for (let i=0; i<pending.length; i++) {
    let merged = true;
    while (merged) {
      merged = false;
      for (let j=i+1; j<pending.length; j++) {
        if (!pending[i].some((a) => pending[j].some((b) => a.filter((v) => b.includes(v)).length >= 2))) continue;
        pending[i].push(...pending[j]); pending.splice(j,1); merged = true; break;
      }
    }
  }
  const systems = pending.map((cycles,i) => systemDetails(graph,cycles,i));
  const counts = systems.reduce<Record<string,number>>((acc,s) => { acc[s.classification] = (acc[s.classification] ?? 0)+1; return acc; },{});
  return { systems, summary: systems.length ? `${systems.length} ring system${systems.length===1?"":"s"} · ${Object.entries(counts).map(([k,v]) => `${v} ${k}`).join(" · ")}` : "No rings detected. Aromaticity requires a cyclic system.", model: "RDKit aromaticity + bounded planar teaching models", limitations: ["Aromaticity is model dependent. RDKit supplies aromatic flags and a smallest-ring basis, not an experimental measurement or all possible cycles.", "A 2D drawing does not determine 3D planarity, spin, stability or reaction feasibility. Antiaromatic labels are explicitly conditional.", "Electron totals are withheld for unsupported heteroatoms, radicals, wildcard ring atoms, mixed systems and exocyclic π interactions. Fused-system totals are not sums of individual rings."] };
}
