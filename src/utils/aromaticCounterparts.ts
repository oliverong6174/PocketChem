/** Bounded local comparisons. These are not reaction templates or synthesis predictions. */
import { analyzeAromaticity, readAromaticGraph, type AromaticGraph } from "./aromaticity";

export type CounterpartTarget = "aromatic" | "antiaromatic";
export type CounterpartCandidate = {
  id: string; smiles: string; molfile: string; target: CounterpartTarget; atomIndex: number;
  originalCharge: number; proposedCharge: number; chargeDelta: number; hydrogenDelta: number;
  originalHydrogens: number; proposedHydrogens: number; bondOrderChanges: number;
  piBefore: number | null; piAfter: number; conjugationBefore: string; conjugationAfter: string;
  cost: number; connectivityPreserved: true; assumptions: string;
};
export type CounterpartSearch = { candidates: CounterpartCandidate[]; reason: string; criterion: string };
export const COUNTERPART_CRITERION = "Preserve heavy-atom connectivity and substituents. Cost = 4 × bond-order edits + 2 × |hydrogen change| + |formal-charge change|. Closest within the supported set only; equal-cost structures remain choices. This score does not estimate stability or reaction feasibility.";

function changeCarbonCharge(graph: AromaticGraph, atom: number, charge: number): string | null {
  const lines = graph.molfile.split(/\r?\n/);
  if (!lines[3]?.includes("V2000")) return null;
  const atomLine = lines[4+atom];
  // Restrict unsupported stereochemistry at the edited centre; don't silently erase it.
  const incident = graph.bonds.filter((b) => b.a === atom || b.b === atom);
  if (Number(atomLine.slice(39,42)) !== 0 || incident.some((b) => Number(lines[4+graph.atoms.length+b.index]?.slice(9,12)) !== 0)) return null;
  if (incident.some((b) => graph.atoms[b.a === atom ? b.b : b.a].z === 1)) return null;
  lines[4+atom] = atomLine.slice(0,36) + "  0  0  0" + atomLine.slice(45,48) + "  0" + atomLine.slice(51);
  const output = lines.filter((line) => !line.startsWith("M  CHG") && !line.startsWith("M  END"));
  const charges = graph.atoms.map((a) => [a.index+1, a.index === atom ? charge : a.charge]).filter(([,c]) => c !== 0);
  for (let i=0; i<charges.length; i+=8) {
    const chunk = charges.slice(i,i+8);
    output.push(`M  CHG${String(chunk.length).padStart(3)}${chunk.map(([n,c]) => String(n).padStart(4)+String(c).padStart(4)).join("")}`);
  }
  output.push("M  END");
  return output.join("\n");
}

export async function findAromaticCounterparts(structure: string, target: CounterpartTarget): Promise<CounterpartSearch> {
  const graph = await readAromaticGraph(structure);
  const empty = (reason: string): CounterpartSearch => ({ candidates: [], reason, criterion: COUNTERPART_CRITERION });
  if (graph.atoms.length > 160) return empty("No supported counterpart found. This comparison is limited to 160 input atoms.");
  if (graph.atoms.some((a) => a.z === 0 || a.radicals)) return empty("No supported counterpart found. Generic structures and radical spin assignments are outside this comparison model.");
  const analysis = await analyzeAromaticity(structure);
  const candidates: CounterpartCandidate[] = [];
  const seen = new Set<string>();
  for (const system of analysis.systems) {
    if (system.rings.length !== 1 || ![5,7].includes(system.atoms.length) || system.atoms.some((i) => graph.atoms[i].z !== 6)) continue;
    // Isolated means no fused, bridged or spiro junction, even to a second nonaromatic ring.
    if (system.atoms.some((i) => graph.rings.filter((ring) => ring.includes(i)).length !== 1)) continue;
    if (system.atoms.some((i) => ![0,1,-1].includes(graph.atoms[i].charge))) continue;
    const members = new Set(system.atoms), ringBonds = graph.bonds.filter((b) => members.has(b.a) && members.has(b.b));
    if (ringBonds.length !== system.atoms.length || ringBonds.some((b) => ![1,2].includes(b.order))) continue;
    const expectedDouble = system.atoms.length === 5 ? 2 : 3;
    if (ringBonds.filter((b) => b.order === 2).length !== expectedDouble) continue;
    const saturated = system.atoms.filter((i) => !ringBonds.some((b) => b.order === 2 && (b.a === i || b.b === i)));
    if (saturated.length !== 1) continue;
    const atomIndex = saturated[0], atom = graph.atoms[atomIndex];
    if (system.atoms.some((i) => i !== atomIndex && graph.atoms[i].charge !== 0)) continue;
    if (graph.bonds.some((b) => b.order > 1 && members.has(b.a) !== members.has(b.b))) continue;
    const proposedCharge = system.atoms.length === 5 ? (target === "aromatic" ? -1 : 1) : (target === "aromatic" ? 1 : null);
    if (proposedCharge === null || proposedCharge === atom.charge || (atom.charge === 0 && atom.hydrogens < 1)) continue;
    const edited = changeCarbonCharge(graph,atomIndex,proposedCharge);
    if (!edited) continue;
    let next: AromaticGraph;
    try { next = await readAromaticGraph(edited); } catch { continue; }
    if (next.atoms.length !== graph.atoms.length || next.bonds.length !== graph.bonds.length) continue;
    if (next.atoms.some((a,i) => a.z !== graph.atoms[i].z || a.isotope !== graph.atoms[i].isotope || a.radicals)) continue;
    if (next.bonds.some((b,i) => b.a !== graph.bonds[i].a || b.b !== graph.bonds[i].b || b.order !== graph.bonds[i].order)) continue;
    if (next.atoms.some((a,i) => i !== atomIndex && (a.charge !== graph.atoms[i].charge || a.hydrogens !== graph.atoms[i].hydrogens))) continue;
    const hydrogenDelta = next.atoms[atomIndex].hydrogens - atom.hydrogens;
    if (hydrogenDelta !== (atom.charge === 0 ? -1 : 0) || next.atoms[atomIndex].charge !== proposedCharge) continue;
    const validated = await analyzeAromaticity(edited);
    const proposed = validated.systems.find((s) => s.atoms.length === system.atoms.length && s.atoms.every((i) => members.has(i)));
    if (!proposed || proposed.classification !== (target === "aromatic" ? "aromatic" : "antiaromatic (planar model)") || proposed.piElectrons === null) continue;
    const key = next.smiles.split(".").sort().join(".");
    if (seen.has(key)) continue;
    seen.add(key);
    const chargeDelta = proposedCharge - atom.charge;
    candidates.push({ id: `counterpart-${atomIndex}-${proposedCharge}`, smiles: next.smiles, molfile: next.molfile, target, atomIndex, originalCharge: atom.charge, proposedCharge, chargeDelta, hydrogenDelta, originalHydrogens: atom.hydrogens, proposedHydrogens: next.atoms[atomIndex].hydrogens, bondOrderChanges: 0, piBefore: system.piElectrons, piAfter: proposed.piElectrons, conjugationBefore: system.conjugation, conjugationAfter: proposed.conjugation, cost: 2*Math.abs(hydrogenDelta)+Math.abs(chargeDelta), connectivityPreserved: true, assumptions: target === "antiaromatic" ? "Idealized planar singlet comparison. Spin and geometry can change the physical classification; an unstable teaching structure, not a reaction or ground-state prediction." : "Planar conjugated aromatic model validated by RDKit. No claim about how this ion forms or its stability under particular conditions." });
  }
  candidates.sort((a,b) => a.cost-b.cost || a.smiles.localeCompare(b.smiles));
  return { candidates, reason: candidates.length ? "Validated local structural comparisons; preview before applying." : "No supported counterpart found. Supported edits require an isolated all-carbon five-membered diene or seven-membered triene with one eligible carbon. Already-matching, fused, bridged, spiro, stereochemically restricted and other ring systems are excluded.", criterion: COUNTERPART_CRITERION };
}
