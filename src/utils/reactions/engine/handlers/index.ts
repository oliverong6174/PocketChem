import { addition } from "./addition";
import { substitution } from "./substitution";
import { elimination } from "./elimination";
import { carbonyl } from "./carbonyl";
import { oxidation } from "./oxidation";
import { reduction } from "./reduction";
import { ring } from "./ring";
import { rearrangement } from "./rearrangement";
import type { ReactionHandlerName } from "../../reactionTypes";

type HandlerResult = string | string[] | null;
type ReactionHandler = (
  reactantSmiles: string,
  options?: Record<string, unknown>
) => Promise<HandlerResult>;

const handlers: Record<ReactionHandlerName, ReactionHandler> = {
  addition,
  substitution,
  elimination,
  carbonyl,
  oxidation,
  reduction,
  ring,
  rearrangement,
};

export async function runCustomHandler(
  handler: ReactionHandlerName,
  reactantSmiles: string,
  options?: Record<string, unknown>
): Promise<string[]> {
  const result = await handlers[handler](reactantSmiles, options);

  if (!result) return [];
  return Array.isArray(result) ? result.filter(Boolean) : [result];
}
