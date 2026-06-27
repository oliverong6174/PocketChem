import { addition } from "./addition";
import { oxidation } from "./oxidation";
import { reduction } from "./reduction";

export async function runEngineHandler(
  handler: string,
  reactantSmiles: string,
  options?: Record<string, unknown>
) {
  switch (handler) {
    case "addition":
      return addition(reactantSmiles, options);
    
    case "oxidation":
      return oxidation(reactantSmiles, options);
      
    case "reduction":
      return reduction(reactantSmiles, options);
    

    default:
      console.warn(`Unknown reaction handler: ${handler}`);
      return null;
  }
}