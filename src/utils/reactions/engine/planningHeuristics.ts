import { getRDKit } from "../../rdkit";
import { normalizeKetcherRGroups } from "./reactionInput";
import { getCompiledQuerySync } from "./rdkitCaches";

/** Small, structural feature set used only to order planner work. It never
 * decides whether chemistry is valid; every route still has to execute and be
 * structurally verified by the reaction engine. */
const MOTIFS = [
  { id: "aromatic", smarts: "[c]", weight: 2 },
  { id: "aryl-alkyl", smarts: "[c][C;H1,H2,H3]", weight: 5 },
  { id: "aryl-carboxyl", smarts: "[c]C(=O)[O;H1,-]", weight: 7 },
  { id: "carboxylic-acid", smarts: "C(=O)[O;H1,-]", weight: 6 },
  { id: "aryl-nitrile", smarts: "[c]C#N", weight: 8 },
  { id: "nitrile", smarts: "C#N", weight: 6 },
  { id: "aryl-diazonium", smarts: "[c][N+]#N", weight: 8 },
  { id: "aryl-amine", smarts: "[c][NH2]", weight: 7 },
  { id: "aryl-nitro", smarts: "[c][N+](=O)[O-]", weight: 7 },
  { id: "aryl-halide", smarts: "[c][F,Cl,Br,I]", weight: 5 },
  { id: "phenol", smarts: "[c][O;H1]", weight: 5 },
  { id: "alcohol", smarts: "[C;X4][O;H1]", weight: 4 },
  { id: "aldehyde", smarts: "[CH1](=O)", weight: 5 },
  { id: "ketone", smarts: "[#6][C;H0](=O)[#6]", weight: 5 },
  { id: "ester", smarts: "C(=O)O[#6]", weight: 5 },
  { id: "amide", smarts: "C(=O)N", weight: 5 },
  { id: "alkene", smarts: "[C,c]=[C,c]", weight: 3 },
  { id: "alkyne", smarts: "C#C", weight: 3 },
  { id: "alkyl-halide", smarts: "[C;X4][F,Cl,Br,I]", weight: 4 },
  { id: "epoxide", smarts: "[C]1[O][C]1", weight: 4 },
] as const;

export type PlanningSignature = {
  atomCount: number;
  carbonCount: number;
  motifMask: bigint;
};

const signatureCache = new Map<string, Promise<PlanningSignature | null>>();
const MAX_SIGNATURE_CACHE = 1800;

function trimCache(): void {
  while (signatureCache.size > MAX_SIGNATURE_CACHE) {
    const oldest = signatureCache.keys().next().value as string | undefined;
    if (!oldest) break;
    signatureCache.delete(oldest);
  }
}

export async function getPlanningSignature(
  smiles: string,
): Promise<PlanningSignature | null> {
  const normalized = normalizeKetcherRGroups(smiles).trim();
  const cached = signatureCache.get(normalized);
  if (cached) return cached;

  const pending = (async () => {
    try {
      const rdkit = await getRDKit();
      const molecule = rdkit.get_mol(normalized);
      if (!molecule) return null;

      try {
        let motifMask = 0n;
        for (let index = 0; index < MOTIFS.length; index += 1) {
          const query = getCompiledQuerySync(rdkit, MOTIFS[index].smarts);
          if (!query) continue;
          try {
            if (molecule.get_substruct_match(query) !== "{}") {
              motifMask |= 1n << BigInt(index);
            }
          } catch {
            // Search heuristics are advisory only. A query unsupported by the
            // browser RDKit build must never invalidate otherwise valid chemistry.
          }
        }

        let carbonCount = 0;
        try {
          const carbonQuery = getCompiledQuerySync(rdkit, "[C,c]");
          if (carbonQuery) {
            const rawMatches = molecule.get_substruct_matches?.(carbonQuery) ?? "[]";
            const parsed = JSON.parse(rawMatches);
            if (Array.isArray(parsed)) {
              carbonCount = parsed.filter((entry) => {
                if (Array.isArray(entry)) return entry.length > 0;
                return Boolean(
                  entry &&
                    typeof entry === "object" &&
                    Array.isArray((entry as { atoms?: unknown[] }).atoms) &&
                    (entry as { atoms: unknown[] }).atoms.length > 0
                );
              }).length;
            }
          }
        } catch {
          // Carbon balance is only a search-order heuristic. If a browser
          // RDKit build cannot enumerate the single-atom query, leave it at 0
          // rather than affecting reaction validity.
        }

        return {
          atomCount: Number(molecule.get_num_atoms?.() ?? 0),
          carbonCount,
          motifMask,
        };
      } finally {
        molecule.delete?.();
      }
    } catch (error) {
      // A planner heuristic is never authoritative chemistry. If RDKit rejects
      // an unusual intermediate or a cached query, fall back to h=0 and keep
      // searching instead of aborting the entire synthesis run.
      console.warn("[PocketChem:Planning] Could not score intermediate; using neutral heuristic.", {
        smiles: normalized,
        error,
      });
      return null;
    }
  })();

  signatureCache.set(normalized, pending);
  trimCache();
  return pending;
}

export function planningSignatureDistance(
  left: PlanningSignature | null,
  right: PlanningSignature | null,
): number {
  if (!left || !right) return 0;

  const differing = left.motifMask ^ right.motifMask;
  let motifPenalty = 0;
  for (let index = 0; index < MOTIFS.length; index += 1) {
    if ((differing & (1n << BigInt(index))) !== 0n) {
      motifPenalty += MOTIFS[index].weight;
    }
  }

  return motifPenalty + Math.min(12, Math.abs(left.atomCount - right.atomCount) * 0.75);
}

export function closestPlanningDistance(
  candidate: PlanningSignature | null,
  references: Array<PlanningSignature | null>,
): number {
  if (!candidate || references.length === 0) return 0;
  let best = Number.POSITIVE_INFINITY;
  for (const reference of references) {
    best = Math.min(best, planningSignatureDistance(candidate, reference));
  }
  return Number.isFinite(best) ? best : 0;
}
