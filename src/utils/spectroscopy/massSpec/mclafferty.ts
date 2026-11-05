import { getRDKit } from "../../rdkit";
import type { MassSpectrumPeak } from "../types";
import { atomNeighbors, connectedComponentsAfterBondRemoval, nominalMassForComponent, parseV2000MassGraph } from "./molGraph";
import type { MassGraph } from "./fragmentTypes";

/**
 * McLafferty rearrangement ions.
 *
 * A radical cation with an unsaturated acceptor X=Y (C=O or C≡N) and a hydrogen on the carbon three bonds from the acceptor carbon
 * (the γ carbon: acceptor–Cα–Cβ–Cγ–H) transfers that hydrogen through a six-membered transition state and loses the Cβ=Cγ alkene:
 *
 *   acceptor C(=X)–Cα–Cβ–Cγ(H)  →  [enol / ketenimine radical cation containing the acceptor and Cα]  +  alkene
 *
 * The ion therefore has the mass of the fragment on the acceptor side of the Cα–Cβ bond PLUS ONE hydrogen (the transferred H), which is
 * deterministic from the graph: 60 for straight-chain acids (CH2=C(OH)2+•), 74 for methyl esters, 88 for ethyl esters, 44 for aldehydes,
 * 58 for 2-alkanones, 59 for primary amides, 41 for aliphatic nitriles (McLafferty & Turecek, Interpretation of Mass Spectra, 4th ed.,
 * ch. 6; Gross, Mass Spectrometry, 3rd ed., ch. 6.3).
 *
 * Fragment generation only. The ion's abundance is NOT derived from first principles: it is set by acceptor class (strong for acids,
 * esters, amides and nitriles, where the rearrangement is the characteristic channel; moderate for ketones and aldehydes, which also cleave
 * α to the carbonyl), and the result is reported as heuristic.
 */

const CLASS_INTENSITY = { carboxyl: 90, nitrile: 85, carbonyl: 55 } as const;

type Acceptor = "carboxyl" | "nitrile" | "carbonyl";

function acceptorKind(graph: MassGraph, carbon: number): Acceptor | null {
  const neighbours = atomNeighbors(graph, carbon);
  const doubleO = neighbours.some(({ atom, bond }) => bond.order === 2 && graph.atoms[atom].symbol === "O");
  if (doubleO) {
    const heteroSingle = neighbours.some(({ atom, bond }) => bond.order === 1 && ["O", "N"].includes(graph.atoms[atom].symbol));
    return heteroSingle ? "carboxyl" : "carbonyl";
  }
  const tripleN = neighbours.some(({ atom, bond }) => bond.order === 3 && graph.atoms[atom].symbol === "N");
  return tripleN ? "nitrile" : null;
}

export async function predictMcLaffertyPeaks(parentSmiles: string | null): Promise<MassSpectrumPeak[]> {
  if (!parentSmiles) return [];
  const rdkit = await getRDKit();
  let mol: any = null;
  try {
    mol = rdkit.get_mol(parentSmiles);
    const molBlock = mol?.get_molblock?.();
    if (typeof molBlock !== "string") return [];
    const graph = parseV2000MassGraph(molBlock);
    if (!graph) return [];

    const found = new Map<number, MassSpectrumPeak>();
    for (const anchor of graph.atoms) {
      if (anchor.symbol !== "C") continue;
      const kind = acceptorKind(graph, anchor.index);
      if (!kind) continue;
      for (const { atom: alpha, bond: anchorBond } of atomNeighbors(graph, anchor.index)) {
        // Cα: a saturated sp3 carbon joined by a single, non-aromatic bond.
        if (graph.atoms[alpha].symbol !== "C" || anchorBond.order !== 1 || anchorBond.type === 4) continue;
        for (const { atom: beta, bond: alphaBeta } of atomNeighbors(graph, alpha)) {
          if (beta === anchor.index || graph.atoms[beta].symbol !== "C" || alphaBeta.order !== 1 || alphaBeta.type === 4) continue;
          // Cγ must carry at least one hydrogen to transfer, and join Cβ by a single bond.
          const hasGammaHydrogen = atomNeighbors(graph, beta).some(
            ({ atom: gamma, bond }) =>
              gamma !== alpha && graph.atoms[gamma].symbol === "C" && bond.order === 1 && bond.type !== 4 && graph.atoms[gamma].implicitHydrogens > 0,
          );
          if (!hasGammaHydrogen) continue;
          const split = connectedComponentsAfterBondRemoval(graph, alphaBeta.index);
          if (!split) continue; // a ring bond: no neutral alkene can leave
          const acceptorSide = split.find((component) => component.includes(anchor.index));
          const mass = acceptorSide ? nominalMassForComponent(graph, acceptorSide) : null;
          if (mass === null) continue;
          const mz = mass + 1;
          if (mz < 15 || found.has(mz)) continue;
          found.set(mz, {
            mz,
            relativeIntensity: CLASS_INTENSITY[kind],
            label: `m/z ${mz} · McLafferty rearrangement`,
            kind: "fragment",
            explanation:
              "McLafferty rearrangement: a γ-hydrogen transfers to the carbonyl/nitrile through a six-membered transition state and the Cβ=Cγ alkene is lost, leaving an enol-type radical cation. Its m/z follows from the structure; its abundance is a class-based heuristic, not a calculated value.",
          });
        }
      }
    }
    return [...found.values()];
  } catch (error) {
    console.warn("McLafferty ion prediction failed:", error);
    return [];
  } finally {
    mol?.delete?.();
  }
}
