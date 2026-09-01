import { warnUnsupportedHandlerMode } from "./handlerUtils";

/**
 * Reserved for standalone substrate-aware skeletal rearrangements.
 *
 * SN1/E1 1,2-hydride and 1,2-alkyl shifts are now implemented in the shared
 * `carbocationUtils.ts` layer because they are intermediates inside
 * substitution/elimination pathways rather than standalone reactions.
 *
 * Named rearrangements such as pinacol and broader Wagner-Meerwein chemistry
 * still require dedicated migration mapping / functional-group logic before
 * they should be routed through this handler.
 */
export async function rearrangement(
  _reactantSmiles: string,
  options?: Record<string, unknown>
): Promise<string[]> {
  warnUnsupportedHandlerMode("Rearrangement", options);
  return [];
}
