import { addition } from "./addition";
import { condensation } from "./condensation";
import { oxidation } from "./oxidation";
import { reduction } from "./reduction";
import type { ReactionTransform } from "../../reactionTypes";

type HandlerName = Extract<
  ReactionTransform,
  { type: "engineHandler" }
>["handler"];

type HandlerResult = string | string[] | null;
type ReactionHandler = (
  reactantSmiles: string,
  options?: Record<string, unknown>
) => Promise<HandlerResult>;

const handlers: Record<HandlerName, ReactionHandler> = {
  addition,
  condensation,
  oxidation,
  reduction,
};

export async function runEngineHandler(
  handler: HandlerName,
  reactantSmiles: string,
  options?: Record<string, unknown>
): Promise<string[]> {
  const result = await handlers[handler](reactantSmiles, options);

  if (!result) return [];
  return Array.isArray(result) ? result.filter(Boolean) : [result];
}
