import { runReactionSmarts } from "../rdkitReaction";

type RingMode = "epoxideOpening";
type EpoxideNucleophile = "water" | "hydroxide";

export async function ring(
  reactantSmiles: string,
  options?: Record<string, unknown>
): Promise<string[]> {
  const mode = options?.mode as RingMode | undefined;

  if (mode !== "epoxideOpening") {
    console.warn("Ring handler missing or unsupported mode:", options);
    return [];
  }

  const nucleophile =
    (options?.nucleophile as EpoxideNucleophile | undefined) ?? "water";

  if (nucleophile !== "water" && nucleophile !== "hydroxide") {
    console.warn("Unsupported epoxide-opening nucleophile:", nucleophile);
    return [];
  }

  // The current one-reactant model generates the constitutional diol product.
  // Regio- and stereochemical ranking remain represented in the rule metadata.
  return runReactionSmarts(
    reactantSmiles,
    "[C:1]1[O:2][C:3]1>>[C:1](O)[C:3][OH:2]"
  );
}
