import { FUNCTIONAL_GROUPS } from "./patterns/index";
import { validateFunctionalGroupPatterns } from "./validator";

export function initializeFunctionalGroups() {
  if (!import.meta.env.DEV) return;

  console.groupCollapsed(
    "%cPocketChem Functional Groups",
    "color:#42a5f5;font-weight:bold;"
  );

  validateFunctionalGroupPatterns(FUNCTIONAL_GROUPS);

  console.groupEnd();
}