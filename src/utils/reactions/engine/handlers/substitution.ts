import { runReactionSmarts } from "../rdkitReaction";
import { enumerateCarbocationPrecursors } from "./carbocationUtils";
import {
  readPositiveIntegerOption,
  readStringOption,
  warnUnsupportedHandlerMode,
} from "./handlerUtils";

type SubstitutionMode =
  | "sn1"
  | "sn2"
  | "alkylHalideSubstitution" // legacy alias for sn2
  | "alcoholToHalide"
  | "intermolecularAlcoholDehydration";

type SubstitutionNucleophile =
  | "hydroxide"
  | "cyanide"
  | "azide"
  | "ammonia"
  | "alkoxide"
  | "acetylide"
  | "water"
  | "alcohol";

type IncomingHalide = "chloride" | "bromide" | "iodide";

const SUBSTITUTION_NUCLEOPHILES = [
  "hydroxide",
  "cyanide",
  "azide",
  "ammonia",
  "alkoxide",
  "acetylide",
  "water",
  "alcohol",
] as const satisfies readonly SubstitutionNucleophile[];

const INCOMING_HALIDES = [
  "chloride",
  "bromide",
  "iodide",
] as const satisfies readonly IncomingHalide[];

const alcoholToHalideSmarts: Record<IncomingHalide, string> = {
  chloride: "[C:1][OH:2]>>[C:1]Cl",
  bromide: "[C:1][OH:2]>>[C:1]Br",
  iodide: "[C:1][OH:2]>>[C:1]I",
};

function asReactantList(reactants: string | string[]): string[] {
  return Array.isArray(reactants) ? reactants.filter(Boolean) : [reactants];
}

function uniqueProducts(products: string[]): string[] {
  return [...new Set(products.filter(Boolean))];
}

type Sn2SmartsSet = {
  /** Secondary-center SN2 pattern that inverts tetrahedral chirality. */
  inversion: string;
  /** Primary/methyl fallback; also works when the reacting center has no stereo. */
  generic: string;
};

const SN2_SMARTS: Record<
  Exclude<SubstitutionNucleophile, "water" | "alcohol">,
  Sn2SmartsSet
> = {
  hydroxide: {
    inversion:
      "[C@H:1]([*:3])([*:4])[Cl,Br,I:2].[O-;H1:5]>>[C@@H:1]([*:3])([*:4])[O+0:5]",
    generic:
      "[C;X4:1][Cl,Br,I:2].[O-;H1:5]>>[C:1][O+0:5]",
  },
  cyanide: {
    inversion:
      "[C@H:1]([*:3])([*:4])[Cl,Br,I:2].[C-:5]#[N:6]>>[C@@H:1]([*:3])([*:4])[C+0:5]#[N:6]",
    generic:
      "[C;X4:1][Cl,Br,I:2].[C-:5]#[N:6]>>[C:1][C+0:5]#[N:6]",
  },
  azide: {
    inversion:
      "[C@H:1]([*:3])([*:4])[Cl,Br,I:2].[N-:5]~[N+:6]~[N:7]>>[C@@H:1]([*:3])([*:4])[N+0:5]=[N+:6]=[N-:7]",
    generic:
      "[C;X4:1][Cl,Br,I:2].[N-:5]~[N+:6]~[N:7]>>[C:1][N+0:5]=[N+:6]=[N-:7]",
  },
  ammonia: {
    inversion:
      "[C@H:1]([*:3])([*:4])[Cl,Br,I:2].[N;H3;+0:5]>>[C@@H:1]([*:3])([*:4])[N;H2;+0:5]",
    generic:
      "[C;X4:1][Cl,Br,I:2].[N;H3;+0:5]>>[C:1][N;H2;+0:5]",
  },
  alkoxide: {
    inversion:
      "[C@H:1]([*:3])([*:4])[Cl,Br,I:2].[#6:6][O-:5]>>[C@@H:1]([*:3])([*:4])[O+0:5][#6:6]",
    generic:
      "[C;X4:1][Cl,Br,I:2].[#6:6][O-:5]>>[C:1][O+0:5][#6:6]",
  },
  acetylide: {
    inversion:
      "[C@H:1]([*:3])([*:4])[Cl,Br,I:2].[#6:5]#[C-:6]>>[C@@H:1]([*:3])([*:4])[C+0:6]#[#6:5]",
    generic:
      "[C;X4:1][Cl,Br,I:2].[#6:5]#[C-:6]>>[C:1][C+0:6]#[#6:5]",
  },
};

type Sn1SmartsSet = {
  /** Secondary carbocation capture; product @ plus match permutations enumerates both faces. */
  secondaryRacemization: string;
  /** Tertiary carbocation capture; product @ plus match permutations enumerates both faces. */
  tertiaryRacemization: string;
  generic: string;
};

const SN1_SMARTS: Record<"water" | "alcohol", Sn1SmartsSet> = {
  water: {
    secondaryRacemization:
      "[C;H1;X4:1]([*:3])([*:4])[Cl,Br,I:2].[O;H2;+0:5]>>[C@H:1]([*:3])([*:4])[O;H1;+0:5]",
    tertiaryRacemization:
      "[C;H0;X4:1]([*:3])([*:4])([*:7])[Cl,Br,I:2].[O;H2;+0:5]>>[C@:1]([*:3])([*:4])([*:7])[O;H1;+0:5]",
    generic:
      "[C;X4:1][Cl,Br,I:2].[O;H2;+0:5]>>[C:1][O;H1;+0:5]",
  },
  alcohol: {
    secondaryRacemization:
      "[C;H1;X4:1]([*:3])([*:4])[Cl,Br,I:2].[#6:6][O;H1;+0:5]>>[C@H:1]([*:3])([*:4])[O+0:5][#6:6]",
    tertiaryRacemization:
      "[C;H0;X4:1]([*:3])([*:4])([*:7])[Cl,Br,I:2].[#6:6][O;H1;+0:5]>>[C@:1]([*:3])([*:4])([*:7])[O+0:5][#6:6]",
    generic:
      "[C;X4:1][Cl,Br,I:2].[#6:6][O;H1;+0:5]>>[C:1][O+0:5][#6:6]",
  },
};

async function runSn2(
  reactants: string[],
  nucleophile: Exclude<SubstitutionNucleophile, "water" | "alcohol">,
  maxProducts: number
): Promise<string[]> {
  if (reactants.length < 2) return [];

  const smarts = SN2_SMARTS[nucleophile];

  // The stereochemical template applies to secondary centers and tells RDKit
  // to invert tetrahedral configuration. If it matches, do not also run the
  // generic transform, because the generic transform would retain the input
  // chiral tag and create a chemically incorrect second product.
  const stereospecific = await runReactionSmarts(
    reactants.slice(0, 2),
    smarts.inversion,
    maxProducts
  );

  if (stereospecific.length > 0) {
    return uniqueProducts(stereospecific);
  }

  return uniqueProducts(
    await runReactionSmarts(reactants.slice(0, 2), smarts.generic, maxProducts)
  );
}

async function runSn1Capture(
  virtualHalide: string,
  partner: string,
  nucleophile: "water" | "alcohol",
  maxProducts: number
): Promise<string[]> {
  const smarts = SN1_SMARTS[nucleophile];
  const reactants = [virtualHalide, partner];
  const products: string[] = [];

  // A planar carbocation can be attacked from either face. The product-side
  // tetrahedral tag plus RDKit's distinct substituent mappings explicitly
  // enumerates both enantiomeric configurations when the product center is
  // stereogenic. Symmetric/achiral products collapse to one structure.
  for (const stereochemicalSmarts of [
    smarts.secondaryRacemization,
    smarts.tertiaryRacemization,
  ]) {
    products.push(
      ...(await runReactionSmarts(reactants, stereochemicalSmarts, maxProducts))
    );
  }

  if (products.length > 0) {
    return uniqueProducts(products).slice(0, maxProducts);
  }

  return uniqueProducts(
    await runReactionSmarts(reactants, smarts.generic, maxProducts)
  );
}

async function runSn1(
  reactants: string[],
  nucleophile: "water" | "alcohol",
  maxProducts: number,
  allowRearrangement: boolean,
  maxShiftDepth: number
): Promise<string[]> {
  if (reactants.length < 2) return [];

  const [substrate, partner] = reactants;
  const precursors = allowRearrangement
    ? await enumerateCarbocationPrecursors(substrate, {
        maxShiftDepth,
        maxCandidates: Math.max(4, maxProducts),
        includeUnrearranged: true,
      })
    : [{
        smiles: substrate,
        shiftType: "none" as const,
        shiftDepth: 0,
        stabilityScore: Number.POSITIVE_INFINITY,
      }];

  const products: string[] = [];

  for (const precursor of precursors) {
    products.push(
      ...(await runSn1Capture(
        precursor.smiles,
        partner,
        nucleophile,
        maxProducts
      ))
    );

    if (uniqueProducts(products).length >= maxProducts) break;
  }

  return uniqueProducts(products).slice(0, maxProducts);
}

/**
 * Reusable net substitution transforms.
 *
 * The family/rule layer decides whether SN1 or SN2 is chemically eligible.
 * This executor owns the graph operation, SN2 inversion, SN1 racemization,
 * and favorable carbocation rearrangements so that those details are not
 * duplicated across individual reaction rules.
 */
export async function substitution(
  reactantInput: string | string[],
  options?: Record<string, unknown>
): Promise<string[]> {
  const reactants = asReactantList(reactantInput);
  const primaryReactant = reactants[0] ?? "";
  const mode = options?.mode as SubstitutionMode | undefined;

  if (mode === "sn2" || mode === "alkylHalideSubstitution") {
    const nucleophile = readStringOption(
      options,
      "nucleophile",
      SUBSTITUTION_NUCLEOPHILES
    );

    if (
      !nucleophile ||
      nucleophile === "water" ||
      nucleophile === "alcohol"
    ) {
      warnUnsupportedHandlerMode("Substitution", options);
      return [];
    }

    const maxProducts = readPositiveIntegerOption(options, "maxProducts", 8);
    return runSn2(reactants, nucleophile, maxProducts);
  }

  if (mode === "sn1") {
    const nucleophile = readStringOption(
      options,
      "nucleophile",
      ["water", "alcohol"] as const
    );

    if (!nucleophile) {
      warnUnsupportedHandlerMode("Substitution", options);
      return [];
    }

    const maxProducts = readPositiveIntegerOption(options, "maxProducts", 12);
    const maxShiftDepth = readPositiveIntegerOption(options, "maxShiftDepth", 2);
    const allowRearrangement = options?.allowRearrangement !== false;

    return runSn1(
      reactants,
      nucleophile,
      maxProducts,
      allowRearrangement,
      maxShiftDepth
    );
  }

  if (mode === "alcoholToHalide") {
    const halide = readStringOption(options, "halide", INCOMING_HALIDES);

    if (!halide) {
      warnUnsupportedHandlerMode("Substitution", options);
      return [];
    }

    return runReactionSmarts(primaryReactant, alcoholToHalideSmarts[halide]);
  }

  if (mode === "intermolecularAlcoholDehydration") {
    // Symmetrical ether formation consumes two molecules of the same
    // unhindered primary alcohol. The reaction rule is responsible for
    // restricting this mode to appropriate substrates.
    return runReactionSmarts(
      [primaryReactant, primaryReactant],
      "[C:1][O;H1:2].[C:3][O;H1:4]>>[C:1][O:2][C:3]"
    );
  }

  warnUnsupportedHandlerMode("Substitution", options);
  return [];
}
