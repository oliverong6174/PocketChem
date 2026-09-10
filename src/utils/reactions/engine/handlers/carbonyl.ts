import { runReactionSmarts } from "../rdkitReaction";
import { classifyCarbonyl } from "./carbonylUtils";

type CarbonylMode = "oximeFormation" | "imineHydrolysis";


async function imineHydrolysis(reactantSmiles: string): Promise<string[]> {
  const products = new Set<string>();

  const cyclicTemplates = [
    "[N:1]1=[C:2][C:3][C:4][C:5]1>>[N:1][C:5][C:4][C:3][C:2]=O",
    "[N:1]1=[C:2][C:3][C:4][C:5][C:6]1>>[N:1][C:6][C:5][C:4][C:3][C:2]=O",
    "[N:1]1=[C:2][C:3][C:4][C:5][C:6][C:7]1>>[N:1][C:7][C:6][C:5][C:4][C:3][C:2]=O",
  ];

  for (const smarts of cyclicTemplates) {
    for (const product of await runReactionSmarts(reactantSmiles, smarts, 16)) {
      products.add(product);
    }
  }

  for (const product of await runReactionSmarts(
    reactantSmiles,
    "[C:1]=[N:2]>>[C:1]=O.[N:2]",
    16,
  )) {
    products.add(product);
  }

  return [...products];
}

export async function carbonyl(
  reactantSmiles: string,
  options?: Record<string, unknown>
): Promise<string[]> {
  const mode = options?.mode as CarbonylMode | undefined;

  if (mode === "imineHydrolysis") {
    return imineHydrolysis(reactantSmiles);
  }

  if (mode !== "oximeFormation") {
    console.warn("Carbonyl handler missing or unsupported mode:", options);
    return [];
  }

  const carbonylType = await classifyCarbonyl(reactantSmiles);
  if (carbonylType !== "aldehyde" && carbonylType !== "ketone") {
    return [];
  }

  return runReactionSmarts(reactantSmiles, "[C:1]=[O:2]>>[C:1]=NO");
}
