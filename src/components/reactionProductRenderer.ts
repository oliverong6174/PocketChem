import {
  getAntiDiolSvg,
  getCondensedSulfonateSvg,
  getGenericHalogenSvg,
  getAlignedGenericHalogenSvg,
  getAlignedStereoSvg,
  getSynDiolSvg,
  getTetrahedralPerspectiveSvg,
  getExplicitAlcoholStereoSvg,
  getHeavyAtomStereoSvg,
  getReferenceAlignedProductStructure,
  getDielsAlderBicyclicSvg,
} from "../utils/functionalGroups";
import type { ReactionDisplayMetadata } from "../utils/reactions/reactionTypes";
import { renderMechanisticReactionProductSvg } from "../utils/stereochemistry/renderBoundary";

type MoleculeSvgRenderer = (smiles: string) => Promise<string | null>;

type ReactionRendererOptions = {
  allowGenericHalogen?: boolean;
  referenceSmiles?: string | null;
  referenceStructure?: string | null;
  /** All disconnected reactant depictions, in the exact Ketcher coordinates. */
  referenceStructures?: readonly (string | null | undefined)[];
  /** SMILES fallbacks used only when a preserved molfile is unavailable. */
  referenceSmilesList?: readonly (string | null | undefined)[];
};

function uniqueReferences(options: ReactionRendererOptions) {
  const references = [
    ...(options.referenceStructures ?? []),
    options.referenceStructure,
    ...(options.referenceSmilesList ?? []),
    options.referenceSmiles,
  ]
    // Do not trim preserved molfiles here. RDKit V2000 header lines are
    // positional, and removing an intentionally blank first line corrupts the
    // molfile. The alignment layer normalizes SMILES vs molfile inputs safely.
    .map((reference) => reference ?? "")
    .filter((reference) => Boolean(reference.trim()));

  return [...new Set(references)];
}

function baseRendererForReactionDisplay(
  display: ReactionDisplayMetadata | null | undefined,
  options: ReactionRendererOptions,
): MoleculeSvgRenderer {
  switch (display?.renderer) {
    case "syn-diol":
      return getSynDiolSvg;
    case "anti-diol":
      return getAntiDiolSvg;
    case "generic-halogen":
      return options.allowGenericHalogen === false
        ? getCondensedSulfonateSvg
        : getGenericHalogenSvg;
    case "aligned-stereo":
      // Generic scaffold alignment is now applied centrally below. This
      // renderer still gives RDKit a heavy-atom wedge/hash presentation when
      // the aligned molblock reaches it.
      return getHeavyAtomStereoSvg;
    case "aligned-generic-halogen":
      return options.allowGenericHalogen === false
        ? getCondensedSulfonateSvg
        : getGenericHalogenSvg;
    case "heavy-atom-stereo":
      return getHeavyAtomStereoSvg;
    case "diels-alder-bicyclic":
      return getHeavyAtomStereoSvg;
    case "tetrahedral-perspective":
      return getTetrahedralPerspectiveSvg;
    case "explicit-alcohol-stereo":
      return getExplicitAlcoholStereoSvg;
    default:
      return getCondensedSulfonateSvg;
  }
}

/**
 * Return the chemistry-specific renderer wrapped in a single, universal
 * depiction-preservation layer. Product SMILES have no drawing coordinates;
 * without this wrapper RDKit is free to rotate/reflect every computed product.
 * We first align the largest unchanged product scaffold to the user's exact
 * Ketcher molfile, then let the specialized renderer add its presentation
 * details without regenerating those coordinates.
 */
export function rendererForReactionDisplay(
  display: ReactionDisplayMetadata | null | undefined,
  options: ReactionRendererOptions = {},
): MoleculeSvgRenderer {
  const references = uniqueReferences(options);
  const baseRenderer = baseRendererForReactionDisplay(display, options);

  return async (productSource) => {
    // Mechanistic stereochemistry is applied explicitly at the reaction-product
    // rendering boundary. This replaces the old global RDKit monkey patch,
    // which broke Ketcher KET -> V3000 imports because embind overload metadata
    // lives on the original get_mol function object.
    const mechanisticSvg = await renderMechanisticReactionProductSvg(productSource);
    if (mechanisticSvg) return mechanisticSvg;

    if (display?.renderer === "diels-alder-bicyclic") {
      return getDielsAlderBicyclicSvg(productSource, references);
    }

    if (references.length > 0) {
      const aligned = await getReferenceAlignedProductStructure(
        productSource,
        references,
      );
      if (aligned) return baseRenderer(aligned);
    }

    // Preserve the old specialized fallback for the two renderers that already
    // knew how to attempt RDKit's full-substructure alignment. This keeps the
    // change backward-compatible when a molecule is too extensively rearranged
    // for the generic maximum-preserved-scaffold matcher.
    const fallbackReference =
      options.referenceStructure ?? options.referenceSmiles ?? null;
    if (display?.renderer === "aligned-stereo") {
      return getAlignedStereoSvg(productSource, fallbackReference);
    }
    if (
      display?.renderer === "aligned-generic-halogen" &&
      options.allowGenericHalogen !== false
    ) {
      return getAlignedGenericHalogenSvg(productSource, fallbackReference);
    }

    return baseRenderer(productSource);
  };
}
