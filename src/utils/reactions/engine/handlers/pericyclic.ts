import { getRDKit } from "../../../rdkit";
import { runReactionSmarts } from "../rdkitReaction";
import { canonicalizeStereoStructure } from "../stereochemistry";
import {
  readPositiveIntegerOption,
  readStringOption,
  warnUnsupportedHandlerMode,
} from "./handlerUtils";

type PericyclicMode = "dielsAlder";
const PERICYCLIC_MODES = ["dielsAlder"] as const satisfies readonly PericyclicMode[];

type AlkeneGeometry = "E" | "Z" | null;

type DieneTerminalGeometryRelationship = "same" | "opposite" | null;

function parseSubstructureMatches(raw: string): number[][] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => {
        if (Array.isArray(entry)) {
          return entry.map(Number).filter(Number.isFinite);
        }
        if (
          entry &&
          typeof entry === "object" &&
          Array.isArray((entry as { atoms?: unknown[] }).atoms)
        ) {
          return (entry as { atoms: unknown[] }).atoms
            .map(Number)
            .filter(Number.isFinite);
        }
        return [];
      })
      .filter((entry) => entry.length > 0);
  } catch {
    return [];
  }
}

function bondKey(first: number, second: number): string {
  return first < second ? `${first}-${second}` : `${second}-${first}`;
}


type SimpleBondGraph = Map<number, Set<number>>;

function parseV2000Adjacency(molBlock: string): SimpleBondGraph {
  const graph: SimpleBondGraph = new Map();
  if (!molBlock || molBlock.includes("V3000")) return graph;
  const lines = molBlock.split(/\r?\n/);
  if (lines.length < 5) return graph;
  const atomCount = Number.parseInt(lines[3]?.slice(0, 3).trim() ?? "", 10);
  const bondCount = Number.parseInt(lines[3]?.slice(3, 6).trim() ?? "", 10);
  if (!Number.isInteger(atomCount) || !Number.isInteger(bondCount)) return graph;
  for (let index = 0; index < atomCount; index += 1) graph.set(index, new Set());
  const bondStart = 4 + atomCount;
  for (let index = 0; index < bondCount; index += 1) {
    const line = lines[bondStart + index] ?? "";
    const a = Number.parseInt(line.slice(0, 3).trim(), 10) - 1;
    const b = Number.parseInt(line.slice(3, 6).trim(), 10) - 1;
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) continue;
    graph.get(a)?.add(b);
    graph.get(b)?.add(a);
  }
  return graph;
}

function shortestRestrictedDistance(
  graph: SimpleBondGraph,
  allowed: Set<number>,
  start: number,
  end: number,
): number | null {
  if (start === end) return 0;
  const queue: Array<[number, number]> = [[start, 0]];
  const seen = new Set<number>([start]);
  while (queue.length > 0) {
    const [current, distance] = queue.shift()!;
    for (const next of graph.get(current) ?? []) {
      if (!allowed.has(next) || seen.has(next)) continue;
      if (next === end) return distance + 1;
      seen.add(next);
      queue.push([next, distance + 1]);
    }
  }
  return null;
}

async function matchedFirstAtoms(mol: any, rdkit: any, smarts: string): Promise<number[]> {
  const query = rdkit.get_qmol(smarts);
  if (!query) return [];
  try {
    return parseSubstructureMatches(mol.get_substruct_matches?.(query) ?? "[]")
      .map((match) => match[0])
      .filter(Number.isInteger);
  } finally {
    query.delete?.();
  }
}

/**
 * Textbook normal-electron-demand Diels-Alder regiochemistry follows the
 * familiar ortho/para rule when a strongly donating diene substituent (OR/NR2)
 * is paired with a strongly withdrawing dienophile substituent (CN, C=O,
 * NO2, SO2R).  "Meta" placement is electronically disfavored; when both
 * ortho- and para-like orientations are possible, the para-like product gets a
 * modest steric advantage.
 *
 * Score the GENERATED cyclohexene products rather than keying on a particular
 * substrate. This makes the rule work for OMe/CN, amino/carbonyl, etc., while
 * leaving unpolarized Diels-Alder reactions as true ties.
 */
async function dielsAlderRegioScore(productSmiles: string): Promise<number> {
  const rdkit = await getRDKit();
  const mol = rdkit.get_mol(productSmiles);
  if (!mol) return 0;
  try {
    const ringAtoms = new Set<number>([
      ...await matchedFirstAtoms(mol, rdkit, "[C;r6]"),
    ]);
    if (ringAtoms.size < 6) return 0;

    const strongDonors = new Set<number>([
      ...await matchedFirstAtoms(mol, rdkit, "[C;r6]-[O;X2;+0]"),
      ...await matchedFirstAtoms(mol, rdkit, "[C;r6]-[N;X3;+0]"),
    ]);
    const strongAcceptors = new Set<number>([
      ...await matchedFirstAtoms(mol, rdkit, "[C;r6]-[C](#[N])"),
      ...await matchedFirstAtoms(mol, rdkit, "[C;r6]-[C](=[O])"),
      ...await matchedFirstAtoms(mol, rdkit, "[C;r6]-[N+](=[O])[O-]"),
      ...await matchedFirstAtoms(mol, rdkit, "[C;r6]-[S](=[O])(=[O])"),
    ]);
    if (strongDonors.size === 0 || strongAcceptors.size === 0) return 0;

    const molBlock = mol.get_molblock?.();
    if (typeof molBlock !== "string") return 0;
    const graph = parseV2000Adjacency(molBlock);

    let best = 0;
    for (const donor of strongDonors) {
      for (const acceptor of strongAcceptors) {
        const distance = shortestRestrictedDistance(graph, ringAtoms, donor, acceptor);
        // para-like 1,4 > ortho-like 1,2 >> meta-like 1,3
        const score = distance === 3 ? 100 : distance === 1 ? 80 : distance === 2 ? 0 : 0;
        if (score > best) best = score;
      }
    }
    return best;
  } catch {
    return 0;
  } finally {
    mol.delete?.();
  }
}

async function selectMajorDielsAlderConstitutionalProducts(
  products: string[],
): Promise<string[]> {
  if (products.length <= 1) return products;
  const scored = await Promise.all(
    products.map(async (product) => ({
      product,
      score: await dielsAlderRegioScore(product),
    })),
  );
  const best = Math.max(...scored.map((item) => item.score));
  if (best <= 0) return products;
  return scored.filter((item) => item.score === best).map((item) => item.product);
}

/**
 * Read the E/Z relationship of the two terminal double bonds of a single
 * conjugated diene path. Only the relationship (same vs opposite) is needed
 * for the Diels-Alder product because reversing the diene atom-map direction
 * swaps the two termini but does not change that relationship.
 *
 * This deliberately avoids substrate-name or reaction-ID special cases. If a
 * molecule contains several inequivalent conjugated-diene paths with
 * conflicting stereo relationships, PocketChem returns null rather than
 * inventing stereochemistry.
 */
async function dieneTerminalGeometryRelationship(
  smiles: string,
): Promise<DieneTerminalGeometryRelationship> {
  const rdkit = await getRDKit();
  const mol = rdkit.get_mol(smiles);
  if (!mol) return null;

  let query: any = null;
  try {
    const rawTags = mol.get_stereo_tags?.();
    if (typeof rawTags !== "string" || !rawTags) return null;

    const parsed = JSON.parse(rawTags) as { CIP_bonds?: unknown };
    if (!Array.isArray(parsed.CIP_bonds)) return null;

    const geometryByBond = new Map<string, Exclude<AlkeneGeometry, null>>();
    for (const entry of parsed.CIP_bonds) {
      if (!Array.isArray(entry) || entry.length < 3) continue;
      const first = Number(entry[0]);
      const second = Number(entry[1]);
      const descriptor = String(entry[2]).replace(/[()]/g, "");
      if (
        Number.isInteger(first) &&
        Number.isInteger(second) &&
        (descriptor === "E" || descriptor === "Z")
      ) {
        geometryByBond.set(bondKey(first, second), descriptor);
      }
    }

    query = rdkit.get_qmol("[C;!a]=[C;!a]-[C;!a]=[C;!a]");
    if (!query) return null;

    const matches = parseSubstructureMatches(
      mol.get_substruct_matches?.(query) ?? "[]",
    );
    const relationships = new Set<Exclude<DieneTerminalGeometryRelationship, null>>();
    const seenPaths = new Set<string>();

    for (const match of matches) {
      if (match.length < 4) continue;
      const forward = match.slice(0, 4);
      const reverse = forward.slice().reverse();
      const pathKey = [forward.join("-"), reverse.join("-")].sort()[0];
      if (seenPaths.has(pathKey)) continue;
      seenPaths.add(pathKey);

      const left = geometryByBond.get(bondKey(forward[0], forward[1]));
      const right = geometryByBond.get(bondKey(forward[2], forward[3]));
      if (!left || !right) continue;
      relationships.add(left === right ? "same" : "opposite");
    }

    return relationships.size === 1 ? [...relationships][0] : null;
  } catch {
    return null;
  } finally {
    query?.delete?.();
    mol.delete?.();
  }
}

async function singleDefinedAlkeneGeometry(smiles: string): Promise<AlkeneGeometry> {
  const rdkit = await getRDKit();
  const mol = rdkit.get_mol(smiles);
  if (!mol) return null;

  try {
    const raw = mol.get_stereo_tags?.();
    if (typeof raw !== "string" || !raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const cipBonds = parsed.CIP_bonds;
    if (!Array.isArray(cipBonds)) return null;

    const geometries = cipBonds
      .map((entry) => {
        if (!Array.isArray(entry) || entry.length < 3) return null;
        const descriptor = String(entry[2]).replace(/[()]/g, "");
        return descriptor === "E" || descriptor === "Z" ? descriptor : null;
      })
      .filter((item): item is "E" | "Z" => Boolean(item));

    return geometries.length === 1 ? geometries[0] : null;
  } catch {
    return null;
  } finally {
    mol.delete?.();
  }
}

// Keep the diene's pre-existing nonreacting bonds intact. In particular, a
// cyclic diene contributes its original alternate path between C1 and C4; the
// new six-membered Diels-Alder ring is added on top of that path. Thus
// cyclohexa-1,3-diene + an alkene correctly gives a bicyclo[2.2.2] framework.
const DIELS_ALDER_CONSTITUTIONAL_SMARTS =
  "[C:1]=[C:2]-[C:3]=[C:4].[C:5]=[C:6]>>[C:1]1-[C:2]=[C:3]-[C:4]-[C:5]-[C:6]-1";

const DIELS_ALDER_ALKYNE_CONSTITUTIONAL_SMARTS =
  "[C:1]=[C:2]-[C:3]=[C:4].[C:5]#[C:6]>>[C:1]1-[C:2]=[C:3]-[C:4]-[C:5]=[C:6]-1";

function mirrorTags(tags: readonly ("@" | "@@")[]): ("@" | "@@")[] {
  return tags.map(invertTetrahedralTag);
}

/**
 * Generic terminal-diene stereochemistry for Diels-Alder reactions.
 *
 * For a diene whose two terminal C=C bonds both have defined E/Z geometry,
 * equal terminal geometries place equivalent face labels on the two diene
 * termini after a suprafacial [4+2] reaction; opposite terminal geometries
 * place them on opposite faces. The templates below cover the two broad
 * textbook endpoint classes that generate tetrahedral product centers:
 *   - H1 termini (one carbon substituent + H), and
 *   - H0 termini bearing methyl + a non-methyl carbon substituent.
 *
 * The second class is intentionally structural rather than molecule-specific:
 * it covers arbitrary methyl/alkyl, methyl/aryl, etc. termini as long as the
 * two carbon branches are distinguishable. Unsupported more exotic branch
 * patterns fall back to constitutional output instead of inventing R/S.
 */
function dieneTerminalStereoTags(
  relationship: Exclude<DieneTerminalGeometryRelationship, null>,
): readonly ["@" | "@@", "@" | "@@"] {
  // With this product-ring branch order, opposite tags draw the two selected
  // terminal substituents cis; equal tags draw them trans.
  return relationship === "same" ? ["@", "@@"] : ["@", "@"];
}

function h1TerminalDieneAlkyneStereoSmarts(
  relationship: Exclude<DieneTerminalGeometryRelationship, null>,
): string[] {
  const reactant =
    "[C;H1:1]([*:7])=[C:2]-[C:3]=[C;H1:4]([*:8]).[C:5]#[C:6]";
  const [d1, d4] = dieneTerminalStereoTags(relationship);
  const [m1, m4] = mirrorTags([d1, d4]);

  const product = (t1: "@" | "@@", t4: "@" | "@@") =>
    `${reactant}>>[C${t1}:1]1([*:7])-[C:2]=[C:3]-[C${t4}:4]([*:8])-[C:5]=[C:6]-1`;

  return [product(d1, d4), product(m1, m4)];
}

function h0MethylOtherDieneAlkyneStereoSmarts(
  relationship: Exclude<DieneTerminalGeometryRelationship, null>,
): string[] {
  const reactant =
    "[C;H0:1]([C;H3:7])([#6;!H3:11])=[C:2]-[C:3]=" +
    "[C;H0:4]([C;H3:8])([#6;!H3:12]).[C:5]#[C:6]";
  const [d1, d4] = dieneTerminalStereoTags(relationship);
  const [m1, m4] = mirrorTags([d1, d4]);

  const product = (t1: "@" | "@@", t4: "@" | "@@") =>
    `${reactant}>>[C${t1}:1]1([C:7])([#6:11])-[C:2]=[C:3]-` +
    `[C${t4}:4]([C:8])([#6:12])-[C:5]=[C:6]-1`;

  return [product(d1, d4), product(m1, m4)];
}

function combinedH1DieneH1DienophileStereoSmarts(
  dieneRelationship: Exclude<DieneTerminalGeometryRelationship, null>,
  dienophileGeometry: Exclude<AlkeneGeometry, null>,
): string[] {
  const reactant =
    "[C;H1:1]([*:7])=[C:2]-[C:3]=[C;H1:4]([*:8])." +
    "[C;H1:5]([*:9])=[C;H1:6]([*:10])";
  const [d1, d4] = dieneTerminalStereoTags(dieneRelationship);
  const e5: "@" | "@@" = "@";
  const e6: "@" | "@@" = dienophileGeometry === "Z" ? "@" : "@@";
  const [m1, m4, m5, m6] = mirrorTags([d1, d4, e5, e6]);

  const product = (
    t1: "@" | "@@",
    t4: "@" | "@@",
    t5: "@" | "@@",
    t6: "@" | "@@",
  ) =>
    `${reactant}>>[C${t1}:1]1([*:7])-[C:2]=[C:3]-[C${t4}:4]([*:8])-` +
    `[C${t5}:5]([*:9])-[C${t6}:6]([*:10])-1`;

  return [
    product(d1, d4, e5, e6),
    product(m1, m4, m5, m6),
  ];
}

function combinedH0MethylOtherDieneH1DienophileStereoSmarts(
  dieneRelationship: Exclude<DieneTerminalGeometryRelationship, null>,
  dienophileGeometry: Exclude<AlkeneGeometry, null>,
): string[] {
  const reactant =
    "[C;H0:1]([C;H3:7])([#6;!H3:11])=[C:2]-[C:3]=" +
    "[C;H0:4]([C;H3:8])([#6;!H3:12])." +
    "[C;H1:5]([*:9])=[C;H1:6]([*:10])";
  const [d1, d4] = dieneTerminalStereoTags(dieneRelationship);
  const e5: "@" | "@@" = "@";
  const e6: "@" | "@@" = dienophileGeometry === "Z" ? "@" : "@@";
  const [m1, m4, m5, m6] = mirrorTags([d1, d4, e5, e6]);

  const product = (
    t1: "@" | "@@",
    t4: "@" | "@@",
    t5: "@" | "@@",
    t6: "@" | "@@",
  ) =>
    `${reactant}>>[C${t1}:1]1([C:7])([#6:11])-[C:2]=[C:3]-` +
    `[C${t4}:4]([C:8])([#6:12])-[C${t5}:5]([*:9])-` +
    `[C${t6}:6]([*:10])-1`;

  return [
    product(d1, d4, e5, e6),
    product(m1, m4, m5, m6),
  ];
}

/**
 * A common O-chem Diels-Alder dienophile is an alpha/beta-unsaturated
 * aldehyde/ketone with a halogen and carbon substituent on the other alkene
 * carbon (for example, the bromo-enal in the reaction-page regression case).
 *
 * Both CIP-defining external branches are explicitly mapped here. That is
 * important: simply putting @/@@ on an unqualified H0/H1 alkene can reverse
 * the apparent cis/trans result when RDKit chooses a different branch order.
 * With the mapped branches below, equal product tags encode cis and opposite
 * tags encode trans for the halogen/carbonyl relationship.
 */

function invertTetrahedralTag(tag: "@" | "@@"): "@" | "@@" {
  return tag === "@" ? "@@" : "@";
}

/**
 * Stereo-complete variant of the halo-carbonyl Diels-Alder motif when the
 * diene itself creates a stereocenter at a substituted terminal carbon.
 *
 * This covers the common course pattern CH2=C(R)-CH=C(Me)(alkyl) reacting
 * with a halo-substituted enal/enone.  The old handler set only the two
 * dienophile-derived centers, which made the terminal diene center
 * stereochemically undefined.  Diels-Alder is suprafacial on BOTH partners,
 * so the diene E/Z geometry must be carried into that new center as well.
 * The two returned templates are mirror-related facial approaches.
 */
function substitutedDieneHaloCarbonylStereoSmarts(
  dieneGeometry: Exclude<AlkeneGeometry, null>,
  dienophileGeometry: Exclude<AlkeneGeometry, null>,
): string[] {
  const reactant =
    "[C;H2:1]=[C:2]-[C;H1:3]=" +
    "[C;H0:4]([C;H3:13])([C;!H3:14])." +
    "[C;H0:5]([Cl,Br,I:7])([#6:9])=[C;H1:6]([C:8]=[O:10])";

  // Choose one facial representative, then generate its exact mirror.
  // For this mapped branch order, E diene geometry places the methyl branch
  // opposite the dienophile-face tag; Z places it on the same side.  Z
  // dienophile geometry keeps X and the carbonyl-derived substituent cis; E
  // keeps them trans.
  const c5: "@" | "@@" = "@@";
  const c6: "@" | "@@" = dienophileGeometry === "Z" ? "@@" : "@";
  const c4: "@" | "@@" = dieneGeometry === "E" ? "@" : "@@";

  const product = (t4: "@" | "@@", t5: "@" | "@@", t6: "@" | "@@") =>
    `${reactant}>>[C:1]1-[C:2]=[C:3]-` +
    `[C${t4}:4]([C:13])([C:14])-` +
    `[C${t5}:5]([*:7])([*:9])-` +
    `[C${t6}:6]([C:8]=[O:10])-1`;

  return [
    product(c4, c5, c6),
    product(
      invertTetrahedralTag(c4),
      invertTetrahedralTag(c5),
      invertTetrahedralTag(c6),
    ),
  ];
}

function haloCarbonylDienophileStereoSmarts(
  geometry: Exclude<AlkeneGeometry, null>,
): string[] {
  const reactant =
    "[C:1]=[C:2]-[C:3]=[C:4]." +
    "[C;H0:5]([Cl,Br,I:7])([#6:9])=[C;H1:6]([C:8]=[O:10])";

  if (geometry === "Z") {
    return [
      `${reactant}>>[C:1]1-[C:2]=[C:3]-[C:4]-[C@@:5]([*:7])([*:9])-[C@@:6]([C:8]=[O:10])-1`,
      `${reactant}>>[C:1]1-[C:2]=[C:3]-[C:4]-[C@:5]([*:7])([*:9])-[C@:6]([C:8]=[O:10])-1`,
    ];
  }

  return [
    `${reactant}>>[C:1]1-[C:2]=[C:3]-[C:4]-[C@@:5]([*:7])([*:9])-[C@:6]([C:8]=[O:10])-1`,
    `${reactant}>>[C:1]1-[C:2]=[C:3]-[C:4]-[C@:5]([*:7])([*:9])-[C@@:6]([C:8]=[O:10])-1`,
  ];
}

/**
 * For the ordinary H1=H1 disubstituted-dienophile case, Diels-Alder is
 * stereospecific: Z substituents remain cis and E substituents remain trans.
 * The two templates represent attack from the two faces of an achiral system;
 * duplicate/meso products collapse in runReactionSmarts.
 */
function h1H1DienophileStereoSmarts(
  geometry: Exclude<AlkeneGeometry, null>,
): string[] {
  const reactant = "[C:1]=[C:2]-[C:3]=[C:4].[C;H1:5]=[C;H1:6]";

  if (geometry === "Z") {
    return [
      `${reactant}>>[C:1]1-[C:2]=[C:3]-[C:4]-[C@:5]-[C@:6]-1`,
      `${reactant}>>[C:1]1-[C:2]=[C:3]-[C:4]-[C@@:5]-[C@@:6]-1`,
    ];
  }

  return [
    `${reactant}>>[C:1]1-[C:2]=[C:3]-[C:4]-[C@:5]-[C@@:6]-1`,
    `${reactant}>>[C:1]1-[C:2]=[C:3]-[C:4]-[C@@:5]-[C@:6]-1`,
  ];
}

/**
 * Endo stereochemistry for the common cyclic-diene Diels-Alder class.
 *
 * A cyclic diene fixes the two diene faces. With a terminal, monosubstituted
 * electron-poor dienophile, the kinetic endo approach places the activating
 * group under the developing bridge. The templates are structural rather than
 * substrate-specific and cover the common 5-8 member cyclic-diene range.
 * Carbonyl derivatives, aldehydes and nitriles are mapped explicitly.
 *
 * Each pair contains the two mirror-related facial approaches. The caller
 * filters them back to the already-selected constitutional regioisomer; the
 * product-mixture layer can then recognize a racemate and draw one member.
 */
function cyclicDieneEndoStereoSmarts(): string[] {
  const templates: string[] = [];

  for (const ringSize of [5, 6, 7, 8]) {
    const cyclicDiene =
      `[C;r${ringSize}:1]=[C;r${ringSize}:2]-[C;r${ringSize}:3]=[C;r${ringSize}:4].`;
    const carbonylActivated =
      `${cyclicDiene}[C;H2:5]=[C;H1:6]([C:7](=[O:8])[*:9])`;
    const aldehydeActivated =
      `${cyclicDiene}[C;H2:5]=[C;H1:6]([C;H1:7]=[O:8])`;
    const nitrileActivated =
      `${cyclicDiene}[C;H2:5]=[C;H1:6]([C:7]#[N:8])`;

    templates.push(
      `${carbonylActivated}>>[C@:1]1-[C:2]=[C:3]-[C@:4]-[C:5]-[C@@:6]([C:7](=[O:8])[*:9])-1`,
      `${carbonylActivated}>>[C@@:1]1-[C:2]=[C:3]-[C@@:4]-[C:5]-[C@:6]([C:7](=[O:8])[*:9])-1`,
      `${aldehydeActivated}>>[C@:1]1-[C:2]=[C:3]-[C@:4]-[C:5]-[C@@:6]([C;H1:7]=[O:8])-1`,
      `${aldehydeActivated}>>[C@@:1]1-[C:2]=[C:3]-[C@@:4]-[C:5]-[C@:6]([C;H1:7]=[O:8])-1`,
      `${nitrileActivated}>>[C@:1]1-[C:2]=[C:3]-[C@:4]-[C:5]-[C@@:6]([C:7]#[N:8])-1`,
      `${nitrileActivated}>>[C@@:1]1-[C:2]=[C:3]-[C@@:4]-[C:5]-[C@:6]([C:7]#[N:8])-1`,
    );
  }

  return templates;
}

/**
 * Generic stereochemistry for cyclic 1,3-dienes reacting with an ordinary
 * terminal monosubstituted alkene.  A cyclic diene fixes the relative face of
 * the two diene termini, so Diels–Alder closure creates a defined pair of
 * bridgehead stereocenters even when the dienophile itself has no E/Z label.
 *
 * The rule is structural rather than tied to cyclopentadiene: ring sizes 5–8
 * cover the common O-Chem II cyclic-diene set (cyclopentadiene through
 * cyclooctadiene).  Two mirror-related facial approaches are emitted for an
 * achiral starting system.  The substituent on a terminal dienophile is mapped
 * explicitly so the newly created dienophile stereocenter is assigned in the
 * same concerted suprafacial event as the diene bridgeheads.
 */
function cyclicDieneTerminalDienophileStereoSmarts(): string[] {
  const templates: string[] = [];

  for (const ringSize of [5, 6, 7, 8]) {
    const reactant =
      `[C;r${ringSize}:1]=[C;r${ringSize}:2]-[C;r${ringSize}:3]=[C;r${ringSize}:4].` +
      `[C;H2:5]=[C;H1:6]([*:7])`;

    // Keep the three newly defined facial relationships coupled. With the
    // product-ring branch order used here, matching tags on C1/C4/C6 give the
    // textbook same-face representative; its complete mirror is emitted as the
    // second member. Mixing the C6 tag independently created the recurring
    // dash/dash/wedge diastereomer bug.
    templates.push(
      `${reactant}>>[C@@:1]1-[C:2]=[C:3]-[C@@:4]-[C:5]-[C@@:6]([*:7])-1`,
      `${reactant}>>[C@:1]1-[C:2]=[C:3]-[C@:4]-[C:5]-[C@:6]([*:7])-1`,
    );
  }

  return templates;
}

/**
 * Cyclic diene + ethylene still creates a stereochemically defined bicyclic
 * framework even though the dienophile contributes no stereogenic substituent.
 * Assign the two bridgeheads together so the product is drawn as a genuine
 * bicyclic stereostructure rather than a flat constitutional graph.
 */
function cyclicDieneEthyleneStereoSmarts(): string[] {
  const templates: string[] = [];
  for (const ringSize of [5, 6, 7, 8]) {
    const reactant =
      `[C;r${ringSize}:1]=[C;r${ringSize}:2]-[C;r${ringSize}:3]=[C;r${ringSize}:4].[CH2:5]=[CH2:6]`;
    templates.push(
      `${reactant}>>[C@:1]1-[C:2]=[C:3]-[C@:4]-[C:5]-[C:6]-1`,
      `${reactant}>>[C@@:1]1-[C:2]=[C:3]-[C@@:4]-[C:5]-[C:6]-1`,
    );
  }
  return templates;
}

async function collectFromTemplates(
  reactants: string[],
  templates: string[],
  maxProducts: number,
): Promise<string[]> {
  const products = new Set<string>();

  for (const smarts of templates) {
    for (const product of await runReactionSmarts(
      reactants,
      smarts,
      maxProducts,
    )) {
      products.add(product);
      if (products.size >= maxProducts) return [...products];
    }
  }

  return [...products];
}

async function keepRepresentativeConnectivity(
  products: string[],
  representative: string | null,
): Promise<string[]> {
  if (!representative || products.length === 0) return products;

  const representativeStructure = await canonicalizeStereoStructure(representative);
  if (!representativeStructure) return products;

  const kept: string[] = [];
  for (const product of products) {
    const structure = await canonicalizeStereoStructure(product);
    if (structure?.connectivity === representativeStructure.connectivity) {
      kept.push(product);
    }
  }

  return kept.length > 0 ? kept : products;
}

async function dielsAlderAlkyne(
  reactants: string[],
  maxProducts: number,
): Promise<string[]> {
  if (reactants.length < 2) return [];
  const [diene, alkyne] = reactants;

  const constitutionalProducts = await selectMajorDielsAlderConstitutionalProducts(
    await runReactionSmarts(
      [diene, alkyne],
      DIELS_ALDER_ALKYNE_CONSTITUTIONAL_SMARTS,
      Math.max(maxProducts, 8),
    ),
  );
  const representative = constitutionalProducts[0] ?? null;
  const relationship = await dieneTerminalGeometryRelationship(diene);

  if (relationship) {
    // First cover the common H1/H1 terminal diene class. These are the
    // methyl-/alkyl-substituted termini seen in many textbook examples.
    const h1Products = await collectFromTemplates(
      [diene, alkyne],
      h1TerminalDieneAlkyneStereoSmarts(relationship),
      Math.max(maxProducts * 2, 8),
    );
    if (h1Products.length > 0) {
      return (await keepRepresentativeConnectivity(
        h1Products,
        representative,
      )).slice(0, maxProducts);
    }

    // Then cover tetra-substituted terminal diene carbons carrying methyl +
    // another carbon branch. The two branches become stereochemically distinct
    // tetrahedral substituents in the cyclohexadiene product.
    const h0Products = await collectFromTemplates(
      [diene, alkyne],
      h0MethylOtherDieneAlkyneStereoSmarts(relationship),
      Math.max(maxProducts * 2, 8),
    );
    if (h0Products.length > 0) {
      return (await keepRepresentativeConnectivity(
        h0Products,
        representative,
      )).slice(0, maxProducts);
    }
  }

  return constitutionalProducts.slice(0, maxProducts);
}

async function dielsAlder(
  reactants: string[],
  maxProducts: number,
): Promise<string[]> {
  if (reactants.length < 2) return [];
  const [diene, dienophile] = reactants;
  const geometry = await singleDefinedAlkeneGeometry(dienophile);
  const dieneGeometry = await singleDefinedAlkeneGeometry(diene);

  // Establish the same representative constitutional orientation that the
  // original Diels-Alder SMARTS produced. Stereo generation is then filtered
  // back to this connectivity so adding wedges/dashes does not suddenly turn
  // one representative card into multiple regioisomer cards.
  const constitutionalProducts = await selectMajorDielsAlderConstitutionalProducts(
    await runReactionSmarts(
      [diene, dienophile],
      DIELS_ALDER_CONSTITUTIONAL_SMARTS,
      Math.max(maxProducts, 8),
    ),
  );
  const representative = constitutionalProducts[0] ?? null;
  const dieneRelationship = await dieneTerminalGeometryRelationship(diene);

  // When BOTH reacting components carry defined alkene stereochemistry, assign
  // all newly created tetrahedral centers together. Doing this in one template
  // is essential: running a dienophile-only template first would preserve E/Z
  // at C5/C6 but silently discard the stereochemical information carried by
  // substituted diene termini.
  if (geometry && dieneRelationship) {
    const h1Combined = await collectFromTemplates(
      [diene, dienophile],
      combinedH1DieneH1DienophileStereoSmarts(
        dieneRelationship,
        geometry,
      ),
      Math.max(maxProducts * 2, 8),
    );
    if (h1Combined.length > 0) {
      return (await keepRepresentativeConnectivity(
        h1Combined,
        representative,
      )).slice(0, maxProducts);
    }

    const h0Combined = await collectFromTemplates(
      [diene, dienophile],
      combinedH0MethylOtherDieneH1DienophileStereoSmarts(
        dieneRelationship,
        geometry,
      ),
      Math.max(maxProducts * 2, 8),
    );
    if (h0Combined.length > 0) {
      return (await keepRepresentativeConnectivity(
        h0Combined,
        representative,
      )).slice(0, maxProducts);
    }
  }

  // A terminal activated dienophile has no E/Z descriptor, but a cyclic
  // five-membered diene still defines a meaningful endo/exo relationship.
  // Assign the common kinetic endo product before falling back to a flat
  // constitutional drawing.
  if (!geometry) {
    const endoProducts = await collectFromTemplates(
      [diene, dienophile],
      cyclicDieneEndoStereoSmarts(),
      Math.max(maxProducts * 2, 8),
    );
    if (endoProducts.length > 0) {
      return (await keepRepresentativeConnectivity(
        endoProducts,
        representative,
      )).slice(0, maxProducts);
    }

    // Ordinary terminal monosubstituted dienophiles (for example propene) do
    // not carry an E/Z descriptor, but a cyclic diene still fixes the two
    // bridgeheads and the newly created dienophile stereocenter.  Assign all
    // three in one concerted template rather than letting RDKit flatten them.
    const cyclicTerminalProducts = await collectFromTemplates(
      [diene, dienophile],
      cyclicDieneTerminalDienophileStereoSmarts(),
      Math.max(maxProducts * 2, 8),
    );
    if (cyclicTerminalProducts.length > 0) {
      return (await keepRepresentativeConnectivity(
        cyclicTerminalProducts,
        representative,
      )).slice(0, maxProducts);
    }

    const cyclicEthyleneProducts = await collectFromTemplates(
      [diene, dienophile],
      cyclicDieneEthyleneStereoSmarts(),
      Math.max(maxProducts * 2, 8),
    );
    if (cyclicEthyleneProducts.length > 0) {
      return (await keepRepresentativeConnectivity(
        cyclicEthyleneProducts,
        representative,
      )).slice(0, maxProducts);
    }
  }

  if (geometry) {
    // If the substituted diene also has one defined E/Z bond, assign the new
    // diene-terminal stereocenter as well as the two dienophile-derived
    // centers. This is the stereochemically complete path for the course
    // halo-enal/halo-enone examples.
    if (dieneGeometry) {
      const completeStereoProducts = await collectFromTemplates(
        [diene, dienophile],
        substitutedDieneHaloCarbonylStereoSmarts(dieneGeometry, geometry),
        Math.max(maxProducts * 2, 8),
      );
      if (completeStereoProducts.length > 0) {
        return (await keepRepresentativeConnectivity(
          completeStereoProducts,
          representative,
        )).slice(0, maxProducts);
      }
    }

    // First handle the H0/H1 halo-enal / halo-enone motif used in the course
    // examples. Explicit branch mapping prevents branch-order-dependent
    // inversion of the intended cis/trans relationship.
    const haloCarbonylProducts = await collectFromTemplates(
      [diene, dienophile],
      haloCarbonylDienophileStereoSmarts(geometry),
      Math.max(maxProducts * 2, 8),
    );
    if (haloCarbonylProducts.length > 0) {
      return (await keepRepresentativeConnectivity(
        haloCarbonylProducts,
        representative,
      )).slice(0, maxProducts);
    }

    // Then handle the general disubstituted H1=H1 dienophile case.
    const h1H1Products = await collectFromTemplates(
      [diene, dienophile],
      h1H1DienophileStereoSmarts(geometry),
      Math.max(maxProducts * 2, 8),
    );
    if (h1H1Products.length > 0) {
      return (await keepRepresentativeConnectivity(
        h1H1Products,
        representative,
      )).slice(0, maxProducts);
    }
  }

  // If E/Z is unspecified and no supported cyclic-diene endo model applies,
  // or the substitution pattern is not one for which PocketChem can map the
  // stereochemistry robustly, return the constitutionally correct products
  // rather than inventing configuration.
  return constitutionalProducts.slice(0, maxProducts);
}

export async function pericyclic(
  reactantInput: string | string[],
  options?: Record<string, unknown>,
): Promise<string[]> {
  const reactants = Array.isArray(reactantInput)
    ? reactantInput.filter(Boolean)
    : [reactantInput];
  const mode = readStringOption(options, "mode", PERICYCLIC_MODES);

  if (!mode) {
    warnUnsupportedHandlerMode("Pericyclic", options);
    return [];
  }

  const maxProducts = readPositiveIntegerOption(options, "maxProducts", 8);

  if (mode === "dielsAlder") {
    const dienophileBond = String(options?.dienophileBond ?? "alkene");
    return dienophileBond === "alkyne"
      ? dielsAlderAlkyne(reactants, maxProducts)
      : dielsAlder(reactants, maxProducts);
  }

  warnUnsupportedHandlerMode("Pericyclic", options);
  return [];
}
