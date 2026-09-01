import { runReactionSmarts } from "../rdkitReaction";
import { classifyCarbonyl } from "./carbonylUtils";

export type OneTwoAdditionNucleophile = "water" | "cyanide";
export type AlkeneHydrationRegioselectivity =
  | "markovnikov"
  | "anti-markovnikov";

type AdditionMode = "oneTwoAddition" | "alkeneHydration";

/**
 * Regioselective alkene hydration templates.
 *
 * The previous generic reaction SMARTS `[C:1]=[C:2]...` could match an
 * unsymmetrical alkene in either atom-map direction. That meant a Markovnikov
 * rule such as H3O+ could accidentally generate the anti-Markovnikov alcohol,
 * and vice versa. These templates constrain the alkene carbons by hydrogen
 * count so the more/less substituted carbon has an explicit role.
 */
export function alkeneHydrationReactionSmarts(
  regioselectivity: AlkeneHydrationRegioselectivity,
): string[] {
  const hydroxylOnMoreSubstituted = regioselectivity === "markovnikov";

  const unequal = hydroxylOnMoreSubstituted
    ? [
        "[C;H0:1]=[C;H1,H2:2]>>[C:1]([OH])[C:2]",
        "[C;H1:1]=[C;H2:2]>>[C:1]([OH])[C:2]",
      ]
    : [
        "[C;H0:1]=[C;H1,H2:2]>>[C:1][C:2]([OH])",
        "[C;H1:1]=[C;H2:2]>>[C:1][C:2]([OH])",
      ];

  // When both alkene carbons have the same substitution level there is no
  // Markovnikov distinction. Keep both orientations because an unsymmetrical
  // environment farther from the double bond can still make distinct products.
  const equal: string[] = [];
  for (const hydrogenCount of [0, 1, 2]) {
    equal.push(
      `[C;H${hydrogenCount}:1]=[C;H${hydrogenCount}:2]>>[C:1]([OH])[C:2]`,
      `[C;H${hydrogenCount}:1]=[C;H${hydrogenCount}:2]>>[C:1][C:2]([OH])`,
    );
  }

  return [...unequal, ...equal];
}

export async function addition(
  reactantSmiles: string,
  options?: Record<string, unknown>,
): Promise<string[]> {
  const mode = options?.mode as AdditionMode | undefined;

  if (mode === "oneTwoAddition") {
    return oneTwoAddition(reactantSmiles, options);
  }

  if (mode === "alkeneHydration") {
    return alkeneHydration(reactantSmiles, options);
  }

  console.warn("Addition handler missing or unsupported mode:", options);
  return [];
}

async function alkeneHydration(
  reactantSmiles: string,
  options?: Record<string, unknown>,
): Promise<string[]> {
  const requested = options?.regioselectivity;
  const regioselectivity: AlkeneHydrationRegioselectivity | null =
    requested === "markovnikov" || requested === "anti-markovnikov"
      ? requested
      : null;

  if (!regioselectivity) {
    console.warn(
      "Addition alkeneHydration requires markovnikov or anti-markovnikov regioselectivity.",
      options,
    );
    return [];
  }

  const products = new Set<string>();
  for (const smarts of alkeneHydrationReactionSmarts(regioselectivity)) {
    for (const product of await runReactionSmarts(reactantSmiles, smarts, 8)) {
      products.add(product);
    }
  }

  return [...products];
}

async function oneTwoAddition(
  reactantSmiles: string,
  options?: Record<string, unknown>,
): Promise<string[]> {
  const requestedNucleophile = options?.nucleophile;
  const nucleophile: OneTwoAdditionNucleophile | null =
    requestedNucleophile === "water" || requestedNucleophile === "cyanide"
      ? requestedNucleophile
      : null;

  if (!nucleophile) {
    console.warn(
      "Addition oneTwoAddition requires water or cyanide. Hydride reductions belong to the reduction handler.",
      options,
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
