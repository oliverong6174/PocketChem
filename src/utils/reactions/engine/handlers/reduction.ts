import { runReactionSmarts } from "../rdkitReaction";
import { classifyCarbonyl } from "./carbonylUtils";

type ReductionMode = "oneTwoAddition" | "carbonylToAlkane";

function hydrideReductionSmarts(
  carbonylType: Awaited<ReturnType<typeof classifyCarbonyl>>
) {
  switch (carbonylType) {
    case "aldehyde":
    case "ketone":
      return "[C:1]=[O:2]>>[C:1][OH:2]";

    case "ester":
      return "[C:1](=[O:2])[O:3][C:4]>>[CH2:1][OH:2].[C:4][OH:3]";

    case "acidChloride":
      return "[C:1](=[O:2])[F,Cl,Br,I:3]>>[CH2:1][OH:2]";

    case "carboxylicAcid":
      return "[C:1](=[O:2])[OH:3]>>[CH2:1][OH:2]";

    case "amide":
      return "[C:1](=[O:2])[N:3]>>[CH2:1][N:3]";

    default:
      return null;
  }
}

export async function reduction(
  reactantSmiles: string,
  options?: Record<string, unknown>
): Promise<string[]> {
  const mode = options?.mode as ReductionMode | undefined;

  if (mode === "oneTwoAddition") {
    const carbonylType = await classifyCarbonyl(reactantSmiles);
    const smarts = hydrideReductionSmarts(carbonylType);
    return smarts ? runReactionSmarts(reactantSmiles, smarts) : [];
  }

  if (mode === "carbonylToAlkane") {
    return runReactionSmarts(reactantSmiles, "[C:1]=[O:2]>>[C:1]");
  }

  console.warn("Reduction handler missing or unsupported mode:", options);
  return [];
}
