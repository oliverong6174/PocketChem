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
  | "alcoholSn1ToHalide"
  | "vicinalDiolToDihalide"
  | "intermolecularAlcoholDehydration"
  | "etherCleavage";

type SubstitutionNucleophile =
  | "hydroxide"
  | "cyanide"
  | "azide"
  | "ammonia"
  | "alkoxide"
  | "acetylide"
  | "iodide"
  | "water"
  | "alcohol";

type IncomingHalide = "chloride" | "bromide" | "iodide";
type EtherCleavageHalogen = "Br" | "I";

const SUBSTITUTION_NUCLEOPHILES = [
  "hydroxide",
  "cyanide",
  "azide",
  "ammonia",
  "alkoxide",
  "acetylide",
  "iodide",
  "water",
  "alcohol",
] as const satisfies readonly SubstitutionNucleophile[];

const INCOMING_HALIDES = [
  "chloride",
  "bromide",
  "iodide",
] as const satisfies readonly IncomingHalide[];

type AlcoholToHalideSmartsSet = {
  inversion: string;
  generic: string;
};

const alcoholToHalideSmarts: Record<
  IncomingHalide,
  AlcoholToHalideSmartsSet
> = {
  chloride: {
    inversion: "[C@H:1]([*:3])([*:4])[OH:2]>>[C@@H:1]([*:3])([*:4])Cl",
    generic: "[C;X4:1][OH:2]>>[C:1]Cl",
  },
  bromide: {
    inversion: "[C@H:1]([*:3])([*:4])[OH:2]>>[C@@H:1]([*:3])([*:4])Br",
    generic: "[C;X4:1][OH:2]>>[C:1]Br",
  },
  iodide: {
    inversion: "[C@H:1]([*:3])([*:4])[OH:2]>>[C@@H:1]([*:3])([*:4])I",
    generic: "[C;X4:1][OH:2]>>[C:1]I",
  },
};

type AlcoholSn1CaptureSmartsSet = {
  secondaryRacemization: string;
  tertiaryRacemization: string;
  generic: string;
};

const alcoholSn1CaptureSmarts: Record<
  IncomingHalide,
  AlcoholSn1CaptureSmartsSet
> = {
  chloride: {
    secondaryRacemization:
      "[C;H1;X4:1]([*:3])([*:4])[OH:2]>>[C@H:1]([*:3])([*:4])Cl",
    tertiaryRacemization:
      "[C;H0;X4:1]([*:3])([*:4])([*:7])[OH:2]>>[C@:1]([*:3])([*:4])([*:7])Cl",
    generic: "[C;X4:1][OH:2]>>[C:1]Cl",
  },
  bromide: {
    secondaryRacemization:
      "[C;H1;X4:1]([*:3])([*:4])[OH:2]>>[C@H:1]([*:3])([*:4])Br",
    tertiaryRacemization:
      "[C;H0;X4:1]([*:3])([*:4])([*:7])[OH:2]>>[C@:1]([*:3])([*:4])([*:7])Br",
    generic: "[C;X4:1][OH:2]>>[C:1]Br",
  },
  iodide: {
    secondaryRacemization:
      "[C;H1;X4:1]([*:3])([*:4])[OH:2]>>[C@H:1]([*:3])([*:4])I",
    tertiaryRacemization:
      "[C;H0;X4:1]([*:3])([*:4])([*:7])[OH:2]>>[C@:1]([*:3])([*:4])([*:7])I",
    generic: "[C;X4:1][OH:2]>>[C:1]I",
  },
};

function asReactantList(reactants: string | string[]): string[] {
  return Array.isArray(reactants) ? reactants.filter(Boolean) : [reactants];
}

function uniqueProducts(products: string[]): string[] {
  return [...new Set(products.filter(Boolean))];
}

const vicinalDiolDihalideSmarts: Record<IncomingHalide, readonly string[]> = {
  chloride: [
    "[C;X4:1]([OH:2])-[C;X4:3]([OH:4])>>[C@:1](Cl)-[C@:3](Cl)",
    "[C;X4:1]([OH:2])-[C;X4:3]([OH:4])>>[C@:1](Cl)-[C@@:3](Cl)",
    "[C;X4:1]([OH:2])-[C;X4:3]([OH:4])>>[C@@:1](Cl)-[C@:3](Cl)",
    "[C;X4:1]([OH:2])-[C;X4:3]([OH:4])>>[C@@:1](Cl)-[C@@:3](Cl)",
  ],
  bromide: [
    "[C;X4:1]([OH:2])-[C;X4:3]([OH:4])>>[C@:1](Br)-[C@:3](Br)",
    "[C;X4:1]([OH:2])-[C;X4:3]([OH:4])>>[C@:1](Br)-[C@@:3](Br)",
    "[C;X4:1]([OH:2])-[C;X4:3]([OH:4])>>[C@@:1](Br)-[C@:3](Br)",
    "[C;X4:1]([OH:2])-[C;X4:3]([OH:4])>>[C@@:1](Br)-[C@@:3](Br)",
  ],
  iodide: [
    "[C;X4:1]([OH:2])-[C;X4:3]([OH:4])>>[C@:1](I)-[C@:3](I)",
    "[C;X4:1]([OH:2])-[C;X4:3]([OH:4])>>[C@:1](I)-[C@@:3](I)",
    "[C;X4:1]([OH:2])-[C;X4:3]([OH:4])>>[C@@:1](I)-[C@:3](I)",
    "[C;X4:1]([OH:2])-[C;X4:3]([OH:4])>>[C@@:1](I)-[C@@:3](I)",
  ],
};

async function runVicinalDiolToDihalide(
  substrate: string,
  halide: IncomingHalide,
): Promise<string[]> {
  const products: string[] = [];

  // Strong HX can replace both OH groups of a vicinal diol when reagent is in
  // excess. For secondary/tertiary centers the ionization/capture sequence does
  // not preserve a single starting configuration, so enumerate the allowed
  // tetrahedral outcomes and let the mixture classifier collapse them into one
  // stereoisomeric-mixture reaction card instead of four duplicate HBr cards.
  for (const smarts of vicinalDiolDihalideSmarts[halide]) {
    products.push(...await runReactionSmarts(substrate, smarts, 8));
  }

  return uniqueProducts(products);
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
  iodide: {
    inversion:
      "[C@H:1]([*:3])([*:4])[Cl,Br:2].[I-:5]>>[C@@H:1]([*:3])([*:4])[I+0:5]",
    generic:
      "[C;X4:1][Cl,Br:2].[I-:5]>>[C:1][I+0:5]",
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

async function runAlcoholToHalide(
  substrate: string,
  halide: IncomingHalide,
  invertStereo: boolean,
): Promise<string[]> {
  const smarts = alcoholToHalideSmarts[halide];

  if (invertStereo) {
    const stereospecific = await runReactionSmarts(
      substrate,
      smarts.inversion,
      8,
    );
    if (stereospecific.length > 0) return uniqueProducts(stereospecific);
  }

  return uniqueProducts(await runReactionSmarts(substrate, smarts.generic, 8));
}

async function runAlcoholSn1ToHalide(
  substrate: string,
  halide: IncomingHalide,
  maxProducts: number,
  allowRearrangement: boolean,
  maxShiftDepth: number,
): Promise<string[]> {
  const precursors = allowRearrangement
    ? await enumerateCarbocationPrecursors(substrate, {
        maxShiftDepth,
        maxCandidates: Math.max(4, maxProducts),
        includeUnrearranged: true,
        leavingGroup: "alcohol",
      })
    : [{
        smiles: substrate,
        shiftType: "none" as const,
        shiftDepth: 0,
        stabilityScore: Number.POSITIVE_INFINITY,
      }];

  const smarts = alcoholSn1CaptureSmarts[halide];
  const products: string[] = [];

  for (const precursor of precursors) {
    for (const stereochemicalSmarts of [
      smarts.secondaryRacemization,
      smarts.tertiaryRacemization,
    ]) {
      products.push(
        ...(await runReactionSmarts(
          precursor.smiles,
          stereochemicalSmarts,
          maxProducts,
        )),
      );
    }

    if (uniqueProducts(products).length >= maxProducts) break;
  }

  if (products.length > 0) {
    return uniqueProducts(products).slice(0, maxProducts);
  }

  const fallback: string[] = [];
  for (const precursor of precursors) {
    fallback.push(
      ...(await runReactionSmarts(precursor.smiles, smarts.generic, maxProducts)),
    );
  }
  return uniqueProducts(fallback).slice(0, maxProducts);
}

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
        leavingGroup: "halide",
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

/**
 * Rank acid cleavage of an unsymmetrical dialkyl ether instead of returning
 * both atom-map orientations. A tertiary/benzylic/allylic side can ionize and
 * is preferred for SN1-like cleavage; otherwise halide attacks the least
 * hindered side by SN2 (methyl > primary > secondary). Exact ties remain.
 */
async function runRankedEtherCleavage(
  substrate: string,
  halogen: EtherCleavageHalogen,
): Promise<string[]> {
  const product = (attacked: string) =>
    `[C;X4:3][O:2]${attacked}>>[C:1]${halogen}.[C:3][OH:2]`;

  const tiers: string[][] = [
    [
      // Tertiary alkyl side: favorable C-O ionization (SN1-like).
      product("[C;H0;X4:1]"),
      // Recursive SMARTS tests benzylic/allylic adjacency without explicitly
      // consuming those substituent atoms, so the carbon skeleton is retained
      // in the product rather than being accidentally truncated.
      product("[$([C;X4][c]):1]"),
      product("[$([C;X4][C,c]=[C,c]):1]"),
    ],
    [product("[CH3:1]")],
    [product("[CH2:1]")],
    [product("[CH:1]")],
  ];

  for (const tier of tiers) {
    const products: string[] = [];
    for (const smarts of tier) {
      products.push(...await runReactionSmarts(substrate, smarts, 8));
    }
    const uniqueTier = uniqueProducts(products);
    if (uniqueTier.length > 0) return uniqueTier;
  }

  // Unusual saturated carbon environments fall back to the general cleavage
  // rather than disappearing from the catalog.
  return uniqueProducts(await runReactionSmarts(
    substrate,
    `[C;X4:3][O:2][C;X4:1]>>[C:1]${halogen}.[C:3][OH:2]`,
    8,
  ));
}

export async function substitution(
  reactantInput: string | string[],
  options?: Record<string, unknown>
): Promise<string[]> {
  const reactants = asReactantList(reactantInput);
  const primaryReactant = reactants[0] ?? "";
  const mode = options?.mode as SubstitutionMode | undefined;

  if (mode === "etherCleavage") {
    const substrate = reactants[0];
    const halogen = options?.halogen as EtherCleavageHalogen | undefined;
    if (!substrate || (halogen !== "Br" && halogen !== "I")) {
      console.warn("Ether cleavage requires Br or I.", options);
      return [];
    }
    return runRankedEtherCleavage(substrate, halogen);
  }

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

  if (mode === "vicinalDiolToDihalide") {
    const halide = readStringOption(options, "halide", INCOMING_HALIDES);
    if (!halide) {
      warnUnsupportedHandlerMode("Substitution", options);
      return [];
    }

    return runVicinalDiolToDihalide(primaryReactant, halide);
  }

  if (mode === "alcoholSn1ToHalide") {
    const halide = readStringOption(options, "halide", INCOMING_HALIDES);
    if (!halide) {
      warnUnsupportedHandlerMode("Substitution", options);
      return [];
    }

    const maxProducts = readPositiveIntegerOption(options, "maxProducts", 12);
    const maxShiftDepth = readPositiveIntegerOption(options, "maxShiftDepth", 2);
    const allowRearrangement = options?.allowRearrangement !== false;

    return runAlcoholSn1ToHalide(
      primaryReactant,
      halide,
      maxProducts,
      allowRearrangement,
      maxShiftDepth,
    );
  }

  if (mode === "alcoholToHalide") {
    const halide = readStringOption(options, "halide", INCOMING_HALIDES);

    if (!halide) {
      warnUnsupportedHandlerMode("Substitution", options);
      return [];
    }

    const stereochemistry = readStringOption(
      options,
      "stereochemistry",
      ["invert", "unspecified"] as const,
    ) ?? "unspecified";

    return runAlcoholToHalide(
      primaryReactant,
      halide,
      stereochemistry === "invert",
    );
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
