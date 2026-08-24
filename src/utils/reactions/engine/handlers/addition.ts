import { runReactionSmarts } from "../rdkitReaction";
import { classifyCarbonyl } from "./carbonylUtils";

export type OneTwoAdditionNucleophile = "water" | "cyanide";

type AdditionMode = "oneTwoAddition";

export async function addition(
  reactantSmiles: string,
  options?: Record<string, unknown>
): Promise<string[]> {
  const mode = options?.mode as AdditionMode | undefined;

  if (mode !== "oneTwoAddition") {
    console.warn("Addition handler missing or unsupported mode:", options);
    return [];
  }

  return oneTwoAddition(reactantSmiles, options);
}

async function oneTwoAddition(
  reactantSmiles: string,
  options?: Record<string, unknown>
): Promise<string[]> {
  const requestedNucleophile = options?.nucleophile;
  const nucleophile: OneTwoAdditionNucleophile | null =
    requestedNucleophile === "water" || requestedNucleophile === "cyanide"
      ? requestedNucleophile
      : null;

  if (!nucleophile) {
    console.warn(
      "Addition oneTwoAddition requires water or cyanide. Hydride reductions belong to the reduction handler.",
      options
    );
    return [];
  }

  const carbonylType = await classifyCarbonyl(reactantSmiles);

  if (carbonylType !== "aldehyde" && carbonylType !== "ketone") {
    return [];
  }

  const smarts =
    nucleophile === "water"
      ? "[C:1]=[O:2]>>[C:1]([OH:2])O"
      : "[C:1]=[O:2]>>[C:1]([OH:2])C#N";

  return runReactionSmarts(reactantSmiles, smarts);
}
