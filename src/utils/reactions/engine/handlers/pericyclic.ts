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

const DIELS_ALDER_CONSTITUTIONAL_SMARTS =
  "[C:1]=[C:2]-[C:3]=[C:4].[C:5]=[C:6]>>[C:1]1-[C:2]=[C:3]-[C:4]-[C:5]-[C:6]-1";

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
  const constitutionalProducts = await runReactionSmarts(
    [diene, dienophile],
    DIELS_ALDER_CONSTITUTIONAL_SMARTS,
    Math.max(maxProducts, 8),
  );
  const representative = constitutionalProducts[0] ?? null;

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

  // If E/Z is unspecified, or the substitution pattern is not one for which
  // PocketChem can map the CIP-defining substituents robustly, return the
  // constitutionally correct products rather than inventing configuration.
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
    return dielsAlder(reactants, maxProducts);
  }

  warnUnsupportedHandlerMode("Pericyclic", options);
  return [];
}
