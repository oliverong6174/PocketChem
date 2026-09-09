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
} from "../utils/functionalGroups";
import type { ReactionDisplayMetadata } from "../utils/reactions/reactionTypes";

type MoleculeSvgRenderer = (smiles: string) => Promise<string | null>;

export function rendererForReactionDisplay(
  display: ReactionDisplayMetadata | null | undefined,
  options: {
    allowGenericHalogen?: boolean;
    referenceSmiles?: string | null;
    referenceStructure?: string | null;
  } = {},
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
      return (smiles) => getAlignedStereoSvg(
        smiles,
        options.referenceStructure ?? options.referenceSmiles,
      );
    case "aligned-generic-halogen":
      return options.allowGenericHalogen === false
        ? getCondensedSulfonateSvg
        : (smiles) => getAlignedGenericHalogenSvg(
            smiles,
            options.referenceStructure ?? options.referenceSmiles,
          );
    case "heavy-atom-stereo":
      return getHeavyAtomStereoSvg;
    case "tetrahedral-perspective":
      return getTetrahedralPerspectiveSvg;
    case "explicit-alcohol-stereo":
      return getExplicitAlcoholStereoSvg;
    default:
      return getCondensedSulfonateSvg;
  }
}
