import type {
  ReactionDisplayMetadata,
  ReactionDisplayRenderer,
  ReactionRule,
} from "./reactionTypes";
import { isHalogenSymbol } from "./profiles/halogens";

function customMode(rule: ReactionRule): string | null {
  if (rule.transform.type !== "customHandler") return null;
  const mode = rule.transform.options?.mode;
  return typeof mode === "string" ? mode : null;
}

/**
 * Derive only from machine-readable transform metadata. Never inspect titles,
 * reagent prose, or rule IDs. Explicit rule.display always wins.
 */
export function deriveReactionDisplayMetadata(
  rule: ReactionRule,
): ReactionDisplayMetadata | null {
  if (rule.display) return rule.display;

  if (rule.transform.type !== "customHandler") return null;
  const options = rule.transform.options as Record<string, unknown>;
  const mode = customMode(rule);

  if (mode === "synDihydroxylation") return { renderer: "syn-diol" };
  if (mode === "antiDihydroxylation") return { renderer: "anti-diol" };

  const halogen = options.halogen;
  if (!isHalogenSymbol(halogen)) return null;

  if (mode === "alkeneHydrohalogenation") {
    const regio = String(options.regioselectivity ?? "unspecified");
    return {
      renderer: "generic-halogen",
      series: {
        id: `alkene-hx-addition-${regio}`,
        variable: "X",
        value: halogen,
      },
    };
  }

  if (mode === "dieneHydrohalogenation") {
    const pattern = String(options.additionPattern ?? "unspecified");
    return {
      // The old aligned-generic-halogen path overpreserved reference geometry.
      // Larger halogen labels (especially Br and I) looked bent or misplaced on
      // flexible allylic products, so diene HX cards should use a fresh generic
      // depiction instead of coordinate forcing.
      renderer: "generic-halogen",
      series: {
        id: `diene-hx-${pattern}`,
        variable: "X",
        value: halogen,
      },
    };
  }

  if (mode === "polyeneHydrohalogenation") {
    const count = Number(options.conjugatedDoubleBonds);
    const capture = String(options.capture ?? "unspecified");
    const span = Number.isInteger(count) && count >= 2 ? 2 * count : "polyene";
    return {
      renderer: "generic-halogen",
      series: {
        id: `polyene-hx-1-${span}-${capture}`,
        variable: "X",
        value: halogen,
      },
    };
  }

  if (
    mode === "halohydrin" ||
    mode === "haloether" ||
    mode === "etherCleavage" ||
    mode === "epoxideNucleophileOpening"
  ) {
    return { renderer: "generic-halogen" };
  }

  const stereo = rule.selectivityProfile?.stereochemistry;
  if (
    stereo?.stereospecific &&
    (stereo.mode === "retention" || stereo.mode === "inversion")
  ) {
    return { renderer: "aligned-stereo" };
  }

  return null;
}

export function getReactionRendererKind(
  display: ReactionDisplayMetadata | null | undefined,
): ReactionDisplayRenderer {
  return display?.renderer ?? "default";
}
