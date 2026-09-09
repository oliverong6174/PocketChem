/**
 * Shared Grignard / organolithium definitions.
 *
 * PocketChem previously used the very broad `[C][Mg,Li]` pattern as both a
 * reagent label and a validity test.  That treated essentially any carbon–Mg
 * bond as if it were a classroom Grignard reagent.  Keep the transformation
 * atom mapping separate from reagent identity: a valid Grignard must contain
 * R–Mg–Cl/Br/I, while an organolithium must contain R–Li.
 */
export const GRIGNARD_OR_ORGANOLITHIUM_TRIGGER_SMARTS =
  "[$([#6][Li]),$([#6][Mg][Cl,Br,I])]";

export const GRIGNARD_OR_ORGANOLITHIUM_SHORT_LABEL =
  "RMgCl/RMgBr/RMgI or RLi";

export const GRIGNARD_OR_ORGANOLITHIUM_LONG_LABEL =
  "Grignard reagent (RMgCl, RMgBr, or RMgI) or organolithium reagent (RLi)";

export const GRIGNARD_HALOGENS = ["Cl", "Br", "I"] as const;
export type GrignardHalogen = (typeof GRIGNARD_HALOGENS)[number];


export type OrganometallicIonPairProfile = {
  metal: "Mg" | "Zn" | "Cu";
  partnerElements: readonly string[];
  representation: "bond-counterion" | "dot-counterion" | "dot-cation-first";
};

/**
 * Structural ion-pair normalization metadata. Add a profile here when Ketcher
 * serializes a new organometallic class as disconnected ions; reactionInput
 * should not grow another metal-specific branch.
 */
export const ORGANOMETALLIC_ION_PAIR_PROFILES: readonly OrganometallicIonPairProfile[] = [
  {
    metal: "Mg",
    partnerElements: GRIGNARD_HALOGENS,
    representation: "bond-counterion",
  },
  {
    metal: "Zn",
    partnerElements: ["F", "Cl", "Br", "I"],
    representation: "dot-counterion",
  },
  {
    metal: "Cu",
    partnerElements: ["Li"],
    representation: "dot-cation-first",
  },
];
