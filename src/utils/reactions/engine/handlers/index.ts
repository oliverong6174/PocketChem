import { addition } from "./addition";
import { substitution } from "./substitution";
import { elimination } from "./elimination";
import { carbonyl } from "./carbonyl";
import { oxidation } from "./oxidation";
import { reduction } from "./reduction";
import { ring } from "./ring";
import { rearrangement } from "./rearrangement";
import { pericyclic } from "./pericyclic";
import type { ReactionHandlerName } from "../../reactionTypes";

type HandlerResult = string | string[] | null;
type MultiReactantHandler = (
  reactants: string | string[],
  options?: Record<string, unknown>
) => Promise<HandlerResult>;
type SingleReactantHandler = (
  reactantSmiles: string,
  options?: Record<string, unknown>
) => Promise<HandlerResult>;

function primaryOnly(handler: SingleReactantHandler): MultiReactantHandler {
  return async (reactants, options) => {
    const primary = Array.isArray(reactants) ? reactants[0] : reactants;
    if (!primary) return [];
    return handler(primary, options);
  };
}

/**
 * Most chemistry handlers are still intentionally one-substrate executors.
 * Addition, substitution, ring-opening, and pericyclic handlers can consume
 * structural partner reactants, so they receive the whole ordered reactant
 * list. The adapter keeps genuinely single-substrate handlers backward compatible.
 */
const handlers: Record<ReactionHandlerName, MultiReactantHandler> = {
  addition,
  substitution,
  elimination: primaryOnly(elimination),
  carbonyl: primaryOnly(carbonyl),
  oxidation: primaryOnly(oxidation),
  reduction: primaryOnly(reduction),
  ring,
  rearrangement: primaryOnly(rearrangement),
  pericyclic,
};

export async function runCustomHandler(
  handler: ReactionHandlerName,
  reactants: string | string[],
  options?: Record<string, unknown>
): Promise<string[]> {
  const result = await handlers[handler](reactants, options);

  if (!result) return [];
  return Array.isArray(result) ? result.filter(Boolean) : [result];
}
