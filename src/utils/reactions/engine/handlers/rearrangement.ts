import { warnUnsupportedHandlerMode } from "./handlerUtils";

/**
 * Reserved for true substrate-aware skeletal rearrangements.
 *
 * This executor is intentionally conservative today. Rearrangements such as
 * pinacol, Wagner–Meerwein, hydride shifts, and alkyl shifts require migration
 * mapping/ranking that a one-line SMARTS shortcut can easily get wrong.
 * Existing rules therefore stay concept-only until that logic is implemented.
 *
 * Keeping the handler boundary now prevents those future algorithms from being
 * scattered through family files or folded into unrelated handlers.
 */
export async function rearrangement(
  _reactantSmiles: string,
  options?: Record<string, unknown>
): Promise<string[]> {
  warnUnsupportedHandlerMode("Rearrangement", options);
  return [];
}
