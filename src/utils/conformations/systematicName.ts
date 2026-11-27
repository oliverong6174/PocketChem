/**
 * A deliberately small systematic-name reader for the Conformations page.
 *
 * It exists because the bundled offline ChEBI database has no entry for most substituted cyclohexanes
 * (for example "cis-1,3-dimethylcyclohexane") or for stereo-specified 2,3-dihalobutanes. It is used ONLY after the shared
 * name resolver (resolveMoleculeInput) has reported "not found", and its output is passed back through that resolver as
 * an explicit SMILES, so there is still a single normalisation path. It never guesses: a name outside the documented
 * subset is rejected with the subset listed.
 *
 * Supported:
 *   1. Cyclohexane with up to six simple substituents given as locants: methyl, ethyl, isopropyl, tert-butyl,
 *      fluoro, chloro, bromo, iodo, hydroxy. e.g. "methylcyclohexane", "1,1-dimethylcyclohexane",
 *      "1-bromo-3-methylcyclohexane", "cis-1,3-dimethylcyclohexane", "trans-1,4-dimethylcyclohexane".
 *      cis/trans is accepted only for exactly two substituents on different ring carbons. Without cis/trans (or a CIP
 *      descriptor, which is not supported for rings) the stereochemistry stays UNSPECIFIED.
 *   2. 2,3-Dihalobutanes with optional CIP descriptors: "(2R,3R)-2,3-dibromobutane", "(2S,3R)-…", "meso-…".
 *      Descriptors are verified against RDKit's CIP labels, so the structure returned has exactly that configuration.
 */
import { buildConformationGraph, type RdKitLike } from "./graph";
import { buildChairModel, findChairCandidates, relationship } from "./chair";

export type SystematicNameResult =
  | { ok: true; smiles: string; description: string; stereo: "specified" | "unspecified" }
  | { ok: false; reason: string };

export const SYSTEMATIC_SUBSET_HELP =
  "PocketChem reads only these systematic names offline: substituted cyclohexanes (methyl, ethyl, isopropyl, tert-butyl, fluoro, chloro, bromo, iodo, hydroxy) with optional cis/trans for two substituents, and 2,3-dihalobutanes with (2R,3R)/(2S,3S)/(2R,3S)/meso descriptors. Otherwise draw the molecule or enter a SMILES.";

const SUBSTITUENTS: Record<string, string> = {
  methyl: "C",
  ethyl: "CC",
  isopropyl: "C(C)C",
  "tert-butyl": "C(C)(C)C",
  fluoro: "F",
  chloro: "Cl",
  bromo: "Br",
  iodo: "I",
  hydroxy: "O",
};
const MULT: Record<string, number> = { "": 1, di: 2, tri: 3, tetra: 4, penta: 5, hexa: 6 };

function normalise(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[‐‑‒–—−]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/\s*-\s*/g, "-");
}

/** gem-disubstitution ("1,1-dimethyl") would put two groups on one atom; handled by an explicit multi-map below. */
function ringSmiles(subs: Array<{ position: number; group: string }>, tags: Record<number, string>): string {
  // ring atoms 1..6, written C1..C6 with ring closure on atom 1
  const byPos = new Map<number, string[]>();
  for (const s of subs) byPos.set(s.position, [...(byPos.get(s.position) ?? []), SUBSTITUENTS[s.group]]);
  let out = "";
  for (let p = 1; p <= 6; p += 1) {
    const groups = byPos.get(p) ?? [];
    const atom = groups.length === 0 ? "C" : groups.length === 1 && tags[p] ? `[C${tags[p]}H]` : groups.length === 1 ? "[CH]" : "[C]";
    const branches = groups.map((g) => `(${g})`).join("");
    out += `${atom}${p === 1 ? "1" : ""}${p === 6 ? "1" : ""}${branches}`;
  }
  return out;
}

function parseCyclohexane(name: string, rdkit: RdKitLike): SystematicNameResult | null {
  const m = /^(?:(cis|trans)-)?(.*?)cyclohexane$/.exec(name);
  if (!m) return null;
  const stereoWord = m[1] as "cis" | "trans" | undefined;
  let prefix = m[2].replace(/-$/, "");
  prefix = prefix.replace(/^-/, "");
  // allow gem-disubstitution by splitting "1,1-dimethyl" into two entries manually
  const subs: Array<{ position: number; group: string }> = [];
  if (prefix) {
    const names = Object.keys(SUBSTITUENTS).join("|");
    const re = new RegExp(`(?:(\\d+(?:,\\d+)*)-)?(di|tri|tetra|penta|hexa)?(${names})-?`, "g");
    let consumed = 0;
    let match: RegExpExecArray | null;
    const tokens: Array<{ locants: number[] | null; mult: number; group: string }> = [];
    while ((match = re.exec(prefix)) !== null) {
      if (match.index !== consumed) return { ok: false, reason: `“${prefix}” contains text PocketChem cannot read as ring substituents. ${SYSTEMATIC_SUBSET_HELP}` };
      consumed = match.index + match[0].length;
      tokens.push({ locants: match[1] ? match[1].split(",").map(Number) : null, mult: MULT[match[2] ?? ""], group: match[3] });
    }
    if (consumed !== prefix.length) return { ok: false, reason: `“${prefix}” contains text PocketChem cannot read as ring substituents. ${SYSTEMATIC_SUBSET_HELP}` };
    for (const token of tokens) {
      if (token.locants === null) {
        if (tokens.length !== 1 || token.mult !== 1) return { ok: false, reason: "Give a locant for every substituent (for example 1,3-dimethylcyclohexane)." };
        subs.push({ position: 1, group: token.group });
        continue;
      }
      if (token.locants.length !== token.mult) return { ok: false, reason: `The number of locants (${token.locants.join(",")}) does not match “${token.group}” ×${token.mult}.` };
      for (const locant of token.locants) {
        if (locant < 1 || locant > 6) return { ok: false, reason: `Ring position ${locant} does not exist in cyclohexane (use 1–6).` };
        subs.push({ position: locant, group: token.group });
      }
    }
  }
  const positions = subs.map((s) => s.position);
  // gem-disubstituted carbons are allowed only when no stereo word is given (they are not stereocentres)
  const distinctPositions = [...new Set(positions)];
  if (subs.length === 0) return { ok: false, reason: "That is plain cyclohexane; load it by name or SMILES C1CCCCC1." };

  if (stereoWord) {
    if (subs.length !== 2 || distinctPositions.length !== 2) {
      return { ok: false, reason: `“${stereoWord}” is supported only for exactly two substituents on different ring carbons (cis/trans does not define a ring with ${subs.length} substituent${subs.length === 1 ? "" : "s"}).` };
    }
    const [a, b] = distinctPositions.sort((x, y) => x - y);
    for (const first of ["@", "@@"]) {
      for (const second of ["@", "@@"]) {
        const smiles = ringSmiles(subs, { [a]: first, [b]: second });
        const graph = buildConformationGraph(rdkit, smiles);
        if (!graph.ok) continue;
        const candidates = findChairCandidates(graph.graph).filter((c) => c.eligible);
        if (candidates.length !== 1) continue;
        const ring = candidates[0].ring;
        const model = buildChairModel(rdkit, graph.graph, ring, {});
        if (model.status !== "ready") continue;
        const ringAtoms = model.slots.filter((s) => !s.isHydrogen).map((s) => s.ringAtom);
        if (ringAtoms.length !== 2) continue;
        if (relationship(model, ringAtoms[0], ringAtoms[1]) === stereoWord) {
          return { ok: true, smiles, stereo: "specified", description: `${stereoWord}-${subs.map((s) => s.group).join("/")} cyclohexane, positions ${a} and ${b}` };
        }
      }
    }
    return { ok: false, reason: "PocketChem could not verify the cis/trans arrangement for that name, so it did not guess. Enter a SMILES with explicit stereochemistry." };
  }
  const smiles = ringSmiles(subs, {});
  return {
    ok: true,
    smiles,
    stereo: "unspecified",
    description: `${subs.map((s) => `${s.position}-${s.group}`).join(", ")} cyclohexane; the name does not specify the ring stereochemistry`,
  };
}

const HALOGENS: Record<string, string> = { fluoro: "F", chloro: "Cl", bromo: "Br", iodo: "I" };

function parseDihalobutane(name: string, rdkit: RdKitLike): SystematicNameResult | null {
  const m = /^(?:\(?(2[rs],3[rs]|[rs],[rs])\)?-|(meso)-)?2,3-di(fluoro|chloro|bromo|iodo)butane$/.exec(name);
  if (!m) return null;
  const halogen = HALOGENS[m[3]];
  const descriptor = m[1]?.replace(/[23]/g, "").replace(",", "").toUpperCase(); // "RR", "SS", "RS", "SR"
  const meso = m[2] === "meso";
  if (!descriptor && !meso) {
    return { ok: true, smiles: `CC(${halogen})C(${halogen})C`, stereo: "unspecified", description: `2,3-di${m[3]}butane; the name does not specify the configuration` };
  }
  const want = meso ? ["RS", "SR"] : [descriptor as string];
  for (const t1 of ["@", "@@"]) {
    for (const t2 of ["@", "@@"]) {
      const smiles = `C[C${t1}H](${halogen})[C${t2}H](${halogen})C`;
      const mol = rdkit.get_mol(smiles);
      if (!mol) continue;
      let tags: string;
      try {
        const parsed = JSON.parse((mol as unknown as { get_stereo_tags: () => string }).get_stereo_tags()) as { CIP_atoms: Array<[number, string]> };
        tags = parsed.CIP_atoms.map(([, label]) => label.replace(/[()]/g, "")).join("");
      } catch {
        tags = "";
      } finally {
        mol.delete();
      }
      if (want.includes(tags)) {
        return { ok: true, smiles, stereo: "specified", description: meso ? `meso-2,3-di${m[3]}butane (2R,3S)` : `(2${descriptor![0]},3${descriptor![1]})-2,3-di${m[3]}butane` };
      }
    }
  }
  return { ok: false, reason: "PocketChem could not verify those CIP descriptors for 2,3-dihalobutane, so it did not guess." };
}

export function parseSystematicName(raw: string, rdkit: RdKitLike): SystematicNameResult {
  const name = normalise(raw);
  if (!name) return { ok: false, reason: "Enter a name." };
  try {
    return parseCyclohexane(name, rdkit) ?? parseDihalobutane(name, rdkit) ?? { ok: false, reason: `“${raw.trim()}” is not in the offline name reader's subset. ${SYSTEMATIC_SUBSET_HELP}` };
  } catch (error) {
    return { ok: false, reason: `The name could not be interpreted (${error instanceof Error ? error.message : "unknown error"}). ${SYSTEMATIC_SUBSET_HELP}` };
  }
}

// kept for tests of the shared substituent table
export const SUPPORTED_SUBSTITUENTS = Object.keys(SUBSTITUENTS);
