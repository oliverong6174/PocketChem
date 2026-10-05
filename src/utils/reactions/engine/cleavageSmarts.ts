/**
 * Build a ring-opening reductive-ozonolysis SMARTS for a simple carbocyclic
 * alkene. A cyclic C=C must become ONE open-chain dicarbonyl molecule; using
 * two disconnected product templates incorrectly clones the untouched ring
 * path into two separate fragments.
 */
function cyclicReductiveOzonolysisSmarts(ringSize: number): string {
  if (ringSize < 3) throw new Error("A carbocycle must contain at least 3 atoms.");

  const lhsAtoms: string[] = ["[C;R:1]1=[C;R:2]"];
  for (let atomMap = 3; atomMap <= ringSize; atomMap += 1) {
    lhsAtoms.push(`-[C;R:${atomMap}]`);
  }
  const lhs = `${lhsAtoms.join("")}-1`;

  const chainMaps: number[] = [];
  for (let atomMap = ringSize; atomMap >= 3; atomMap -= 1) {
    chainMaps.push(atomMap);
  }
  const middle = chainMaps.map((atomMap) => `-[C:${atomMap}]`).join("");
  const rhs = `[C:1](=O)${middle}-[C:2]=O`;

  return `${lhs}>>${rhs}`;
}

/**
 * Forward templates for reductive alkene cleavage. Simple rings from 3-12
 * members are tried before the acyclic fallback. The range is an engine safety
 * bound, not molecule-specific chemistry.
 */
export function alkeneReductiveCleavageReactionSmarts(): string[] {
  const cyclic: string[] = [];
  for (let ringSize = 3; ringSize <= 12; ringSize += 1) {
    cyclic.push(cyclicReductiveOzonolysisSmarts(ringSize));
  }

  return [
    ...cyclic,
    // Acyclic alkene: two carbonyl fragments.
    "[C;!R:1]=[C;!R:2]>>[C:1]=O.[C:2]=O",
    // Exocyclic alkene: the ring remains intact on the ring-carbon side while
    // the exocyclic carbon becomes a separate carbonyl fragment.
    "[C;R:1]=[C;!R:2]>>[C:1]=O.[C:2]=O",
    "[C;!R:1]=[C;R:2]>>[C:1]=O.[C:2]=O",
  ];
}
