import { runReactionSmarts } from "../rdkitReaction";
import {
  readPositiveIntegerOption,
  warnUnsupportedHandlerMode,
} from "./handlerUtils";

type RadicalMode = "alkaneHalogenation";
type RadicalHalogen = "Cl" | "Br";

/**
 * Generate every symmetry-distinct monohalogenation constitution from an
 * alkane.  The reaction templates are grouped by the stability of the carbon
 * radical formed when H is abstracted.  Running the groups in 3° -> 2° -> 1°
 * order keeps the textbook major product first without deleting valid minor
 * products that a synthesis planner may need.
 *
 * This is deliberately substrate-general: there are no molecule-name or
 * target-specific branches. RDKit atom matching and canonical product
 * deduplication determine the available sites.
 */
async function alkaneHalogenation(
  reactantSmiles: string,
  halogen: RadicalHalogen,
  maxProducts: number,
): Promise<string[]> {
  const siteTemplates = [
    // Tertiary C-H (one H on a saturated carbon).
    `[C;H1;X4:1]>>[C:1]${halogen}`,
    // Secondary C-H2.
    `[C;H2;X4:1]>>[C:1]${halogen}`,
    // Primary C-H3.
    `[C;H3;X4:1]>>[C:1]${halogen}`,
    // Methane, retained for completeness.
    `[C;H4;X4:1]>>[C:1]${halogen}`,
  ];

  const unique = new Set<string>();
  for (const smarts of siteTemplates) {
    for (const product of await runReactionSmarts(
      reactantSmiles,
      smarts,
      Math.max(8, maxProducts),
    )) {
      unique.add(product);
      if (unique.size >= maxProducts) return [...unique];
    }
  }

  return [...unique];
}

export async function radical(
  reactantSmiles: string,
  options?: Record<string, unknown>,
): Promise<string[]> {
  const mode = options?.mode as RadicalMode | undefined;
  if (mode !== "alkaneHalogenation") {
    warnUnsupportedHandlerMode("Radical", options);
    return [];
  }

  const halogen = options?.halogen;
  if (halogen !== "Cl" && halogen !== "Br") {
    console.warn("Radical alkaneHalogenation requires Cl or Br.", options);
    return [];
  }

  const maxProducts = readPositiveIntegerOption(options, "maxProducts", 16);
  return alkaneHalogenation(reactantSmiles, halogen, maxProducts);
}
