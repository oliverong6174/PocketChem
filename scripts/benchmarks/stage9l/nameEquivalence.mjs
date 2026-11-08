// Stage 9L comparator adapter. Historical Stage 9J/9K scorers remain immutable.
import {loadModule} from '../../tests/engine.mjs';
export async function namesEquivalent(a,b,resolve) {
  const comparator=await loadModule('/src/utils/nomenclature/nameEquivalence.ts');
  return comparator.namesEquivalent(a,b,resolve);
}
