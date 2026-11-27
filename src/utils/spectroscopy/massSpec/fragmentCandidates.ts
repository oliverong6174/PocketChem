import { getRDKit } from "../../rdkit";
import type { MassSpectrumFragmentCandidate } from "../types";
import { atomNeighbors, parseV2000MassGraph } from "./molGraph";

/** Additional EI possibilities without quantitative abundance claims.
 * Scope is deliberately narrow: ordinary unlabelled, neutral, connected
 * monofunctional chains/rings and monocyclic azines. Nominal mass identifies
 * composition, not a unique ion structure. No speculative preview is drawn.
 *
 * Evidence: Dampc et al., EPJD 72:216 (2018), doi:10.1140/epjd/e2018-90474-2
 * (azine HCN/N2 loss); Gross, Mass Spectrometry ch.6, and the isotope-labelled
 * alcohol experiments archived at https://theses.gla.ac.uk/78710/ (water,
 * ethylene loss); carbonyl ring opening/CO/C2H4 loss follows the established
 * cyclic-ketone fragmentation scheme. These support channels, not intensities.
 */
type Counts = Record<string, number>;
const weights: Counts = { C: 12, H: 1, N: 14, O: 16 };
const formula = (counts: Counts) => ["C","H","N","O"].filter(e => counts[e] > 0)
  .map(e => `${e}${counts[e] === 1 ? "" : counts[e]}`).join("");

export async function predictFragmentCandidates(smiles: string | null): Promise<MassSpectrumFragmentCandidate[]> {
  if (!smiles || smiles.includes(".") || /\[\d/.test(smiles)) return [];
  const rdkit = await getRDKit();
  let mol: ReturnType<typeof rdkit.get_mol> | null = null;
  try {
    mol = rdkit.get_mol(smiles);
    if (!mol) return [];
    const block = mol.get_molblock();
    // The legacy mass graph reconstructs ordinary valence hydrogens and does
    // not represent open-shell input atoms. Do not invent their missing H.
    if (/^M {2}RAD/m.test(block)) return [];
    const graph = parseV2000MassGraph(block);
    if (!graph || graph.atoms.length > 128 || graph.atoms.some(a => a.charge !== 0 || !["C","N","O"].includes(a.symbol))) return [];
    const parent: Counts = {};
    for (const a of graph.atoms) {
      parent[a.symbol] = (parent[a.symbol] ?? 0) + 1;
      parent.H = (parent.H ?? 0) + a.implicitHydrogens;
    }
    const has = (smarts: string) => {
      const q = rdkit.get_qmol(smarts);
      if (!q) return false;
      try { return JSON.parse(mol!.get_substruct_matches(q)).length > 0; }
      finally { q.delete(); }
    };
    const found = new Map<string, MassSpectrumFragmentCandidate>();
    const add = (ion: Counts, mechanism: string) => {
      const loss: Counts = {};
      for (const el of new Set([...Object.keys(parent), ...Object.keys(ion)])) {
        loss[el] = (parent[el] ?? 0) - (ion[el] ?? 0);
        if (loss[el] < 0 || (ion[el] ?? 0) < 0) return;
      }
      const mz = Object.entries(ion).reduce((v,[e,n]) => v + weights[e] * n,0);
      if (!Number.isFinite(mz) || mz < 15 || !Object.values(loss).some(v=>v>0)) return;
      const ionFormula = formula(ion), neutralLossFormula = formula(loss);
      found.set(`${ionFormula}|${mechanism}`, { mz, ionFormula, charge: 1, neutralLossFormula, mechanism,
        explanation: `${mechanism}; total lost composition ${neutralLossFormula}. Candidate composition only: no intensity or unique ion structure is assigned.` });
    };
    const n = parent.C ?? 0;
    const cycles = graph.bonds.length - graph.atoms.length + 1;
    const carbonDegrees = graph.atoms.filter(a=>a.symbol === "C").map(a=>
      atomNeighbors(graph,a.index).filter(({atom})=>graph.atoms[atom].symbol === "C").length);
    const linear = cycles === 0 && carbonDegrees.every(d=>d<=2);
    const monoO = parent.O === 1 && !parent.N;
    const allSingle = graph.bonds.every(b=>b.order===1);
    if (monoO && linear && allSingle && n >= 5 && has("[CH2][OH]")) {
      for (let lostEthylene=1; n-2*lostEthylene >= 3; lostEthylene++) {
        const retained = n-2*lostEthylene;
        add({C:retained,H:2*retained}, "Alcohol dehydration followed by ethylene elimination");
      }
      for (let retained=3; retained<=Math.min(8,n-2); retained++)
        add({C:retained,H:2*retained-1}, "Alcohol dehydration followed by allylic cleavage");
    }
    if (monoO && linear && n>=5 && parent.H===2*n && has("[CH1](=O)[CH2]")) {
      for (let retained=3; retained<=Math.min(8,n-2); retained++)
        add({C:retained,H:2*retained}, "Aldehyde decarbonylation followed by hydrogen-transfer cleavage");
    }
    // Exclude fused, branched, unsaturated and substituted cyclic ketones.
    if (monoO && cycles===1 && n>=5 && parent.H===2*n-2 && carbonDegrees.every(d=>d===2) && has("[CH2][C;R](=O)[CH2]")) {
      add({C:n-2,H:2*n-6,O:1}, "Cyclic ketone ring opening and ethylene loss");
      add({C:n-3,H:2*n-6}, "Cyclic ketone ring opening, ethylene and CO loss");
    }
    if (!parent.O && cycles===1 && has("n1aaaaa1") && has("n:[cH]")) {
      add({...parent,C:n-1,H:parent.H-1,N:parent.N-1}, "Azine ring fragmentation with HCN loss");
      // Distinct C-H/n pairs are needed to eliminate two HCN units.
      if (has("[n]:[cH].[n]:[cH]"))
        add({...parent,C:n-2,H:parent.H-2,N:parent.N-2}, "Sequential azine HCN losses");
      if (has("n:n")) {
        add({...parent,N:parent.N-2}, "Adjacent azine nitrogens eliminated as N2");
        add({...parent,H:parent.H-1,N:parent.N-2}, "Azine N2 elimination followed by H loss");
      }
    }
    return [...found.values()];
  } catch { return []; }
  finally { mol?.delete(); }
}
