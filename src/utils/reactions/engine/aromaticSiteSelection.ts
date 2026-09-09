import { getRDKit } from "../../rdkit";
import type { AromaticEasElectrophileId } from "../profiles/aromaticEas";

type Bond = { a: number; b: number; order: number };
type Graph = { symbols: string[]; bonds: Bond[]; adjacency: Map<number, Bond[]> };
type SiteScore = { product: string; score: number };

function parseMatches(raw: string): number[][] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((entry) => {
      if (Array.isArray(entry)) return entry.map(Number).filter(Number.isFinite);
      if (entry && typeof entry === "object" && Array.isArray((entry as { atoms?: unknown[] }).atoms)) {
        return (entry as { atoms: unknown[] }).atoms.map(Number).filter(Number.isFinite);
      }
      return [];
    }).filter((entry) => entry.length > 0);
  } catch {
    return [];
  }
}

function parseMolBlock(block: string): Graph | null {
  if (!block || block.includes("V3000")) return null;
  const lines = block.split(/\r?\n/);
  const atomCount = Number.parseInt(lines[3]?.slice(0, 3).trim() ?? "", 10);
  const bondCount = Number.parseInt(lines[3]?.slice(3, 6).trim() ?? "", 10);
  if (!Number.isInteger(atomCount) || !Number.isInteger(bondCount)) return null;
  const symbols: string[] = [];
  for (let i = 0; i < atomCount; i += 1) symbols.push((lines[4 + i] ?? "").slice(31, 34).trim());
  const bonds: Bond[] = [];
  const adjacency = new Map<number, Bond[]>();
  for (let i = 0; i < atomCount; i += 1) adjacency.set(i, []);
  for (let i = 0; i < bondCount; i += 1) {
    const line = lines[4 + atomCount + i] ?? "";
    const a = Number.parseInt(line.slice(0, 3).trim(), 10) - 1;
    const b = Number.parseInt(line.slice(3, 6).trim(), 10) - 1;
    const order = Number.parseInt(line.slice(6, 9).trim(), 10);
    if (![a,b,order].every(Number.isFinite)) continue;
    const bond = { a, b, order };
    bonds.push(bond);
    adjacency.get(a)?.push(bond); adjacency.get(b)?.push(bond);
  }
  return { symbols, bonds, adjacency };
}

function other(bond: Bond, atom: number) { return bond.a === atom ? bond.b : bond.a; }
function bondBetween(graph: Graph, a: number, b: number) {
  return (graph.adjacency.get(a) ?? []).find((bond) => other(bond, a) === b) ?? null;
}

function benzeneLikeCycles(graph: Graph): number[][] {
  const cycles = new Map<string, number[]>();
  const carbonAtoms = graph.symbols.map((s,i)=>s === "C" ? i : -1).filter(i=>i>=0);
  const dfs = (start: number, current: number, path: number[]) => {
    if (path.length === 6) {
      if (!bondBetween(graph, current, start)) return;
      const key = [...path].sort((a,b)=>a-b).join("-");
      if (cycles.has(key)) return;
      let doubles=0, aromatics=0;
      for (let i=0;i<6;i++) {
        const bond=bondBetween(graph,path[i],path[(i+1)%6]);
        if (!bond) return;
        if (bond.order===2) doubles++;
        if (bond.order===4) aromatics++;
      }
      if (doubles===3 || aromatics>=5) cycles.set(key,[...path]);
      return;
    }
    for (const bond of graph.adjacency.get(current) ?? []) {
      const next=other(bond,current);
      if (next===start || path.includes(next) || graph.symbols[next]!=="C") continue;
      dfs(start,next,[...path,next]);
    }
  };
  for (const atom of carbonAtoms) dfs(atom,atom,[atom]);
  return [...cycles.values()];
}

function ringDistance(ring: number[], from: number, to: number): number {
  const a=ring.indexOf(from), b=ring.indexOf(to);
  if (a<0 || b<0) return 99;
  const d=Math.abs(a-b); return Math.min(d, ring.length-d);
}

function isCarbonylCarbon(graph: Graph, atom: number): boolean {
  if (graph.symbols[atom] !== "C") return false;
  return (graph.adjacency.get(atom) ?? []).some((bond) => bond.order===2 && graph.symbols[other(bond,atom)]==="O");
}
function isNitrileCarbon(graph: Graph, atom: number): boolean {
  return graph.symbols[atom] === "C" && (graph.adjacency.get(atom) ?? []).some((bond) => bond.order===3 && graph.symbols[other(bond,atom)]==="N");
}
function isNitroNitrogen(graph: Graph, atom: number): boolean {
  if (graph.symbols[atom] !== "N") return false;
  return (graph.adjacency.get(atom) ?? []).filter((bond)=>graph.symbols[other(bond,atom)]==="O").length >= 2;
}
function isSulfonylSulfur(graph: Graph, atom: number): boolean {
  return graph.symbols[atom] === "S" && (graph.adjacency.get(atom) ?? []).filter((bond)=>bond.order===2 && graph.symbols[other(bond,atom)]==="O").length >= 1;
}

/**
 * Scores one pre-existing substituent on a simple benzene ring.  Critically,
 * classification starts from the atom DIRECTLY bonded to the ring, so
 * Ar-CH2-C(=O)R remains an alkyl/benzylic o/p director while Ar-C(=O)-R is a
 * directly conjugated acyl meta director.
 */
function substituentContribution(graph: Graph, root: number, distance: number): number {
  const symbol=graph.symbols[root];
  const orthoPara = distance===1 || distance===3;
  const meta = distance===2;
  const paraBonus = distance===3 ? 0.45 : 0;

  if (symbol === "O") return 4.0 + (orthoPara ? 4.0 + paraBonus : 0) + (meta ? -1.5 : 0);
  if (symbol === "N") {
    if (isNitroNitrogen(graph,root)) return -4.0 + (meta ? 4.0 : orthoPara ? -2.0 : 0);
    return 4.5 + (orthoPara ? 4.2 + paraBonus : 0) + (meta ? -1.5 : 0);
  }
  if (["F","Cl","Br","I"].includes(symbol)) return -1.7 + (orthoPara ? 2.4 + paraBonus : 0) + (meta ? -0.5 : 0);
  if (symbol === "S") {
    if (isSulfonylSulfur(graph,root)) return -3.5 + (meta ? 3.5 : orthoPara ? -1.5 : 0);
    return 1.0 + (orthoPara ? 1.5 + paraBonus : 0);
  }
  if (symbol === "C") {
    if (isCarbonylCarbon(graph,root) || isNitrileCarbon(graph,root)) {
      return -3.2 + (meta ? 3.4 : orthoPara ? -1.5 : 0);
    }
    const bonds=graph.adjacency.get(root) ?? [];
    const unsaturated=bonds.some((bond)=>bond.order>=2);
    if (unsaturated) return 0.3 + (orthoPara ? 1.0 + paraBonus : 0);
    // sp3 carbon directly attached to ring: alkyl/benzylic director.
    return 1.7 + (orthoPara ? 2.3 + paraBonus : meta ? -0.4 : 0);
  }
  return 0;
}

function matchesInstalledElectrophile(graph: Graph, root: number, electrophile: AromaticEasElectrophileId): boolean {
  const symbol=graph.symbols[root];
  if (electrophile === "bromo") return symbol === "Br";
  if (electrophile === "chloro") return symbol === "Cl";
  if (electrophile === "iodo") return symbol === "I";
  if (electrophile === "fluoro") return symbol === "F";
  if (electrophile === "nitro") return isNitroNitrogen(graph,root);
  return isSulfonylSulfur(graph,root);
}

function scoreSite(graph: Graph, ring: number[], site: number, installedRoot: number): number {
  const ringSet=new Set(ring);
  let score=0;
  for (const ringAtom of ring) {
    for (const bond of graph.adjacency.get(ringAtom) ?? []) {
      const root=other(bond,ringAtom);
      if (ringSet.has(root) || root===installedRoot) continue;
      score += substituentContribution(graph,root,ringDistance(ring,ringAtom,site));
    }
  }
  return score;
}

async function scoreProduct(substrate: string, product: string, electrophile: AromaticEasElectrophileId): Promise<number | null> {
  const rdkit=await getRDKit();
  const mol=rdkit.get_mol(product);
  const substrateQuery=rdkit.get_qmol(substrate);
  if (!mol || !substrateQuery) { mol?.delete?.(); substrateQuery?.delete?.(); return null; }
  try {
    const block=mol.get_molblock?.();
    if (typeof block !== "string") return null;
    const graph=parseMolBlock(block); if (!graph) return null;
    const mappings=parseMatches(mol.get_substruct_matches?.(substrateQuery) ?? "[]");
    if (!mappings.length) return null;
    const rings=benzeneLikeCycles(graph);
    // Simple benzene rule set only; fused aromatics deliberately fall back.
    const atomRingCounts=new Map<number,number>();
    for (const ring of rings) for (const atom of ring) atomRingCounts.set(atom,(atomRingCounts.get(atom)??0)+1);
    const simpleRings=rings.filter((ring)=>ring.every((atom)=>(atomRingCounts.get(atom)??0)===1));
    let best: number | null=null;
    for (const ring of simpleRings) {
      const ringSet=new Set(ring);
      for (const site of ring) {
        for (const bond of graph.adjacency.get(site) ?? []) {
          const root=other(bond,site);
          if (ringSet.has(root) || !matchesInstalledElectrophile(graph,root,electrophile)) continue;
          const isNew=mappings.some((mapping)=>!new Set(mapping).has(root));
          if (!isNew) continue;
          const value=scoreSite(graph,ring,site,root);
          if (best===null || value>best) best=value;
        }
      }
    }
    return best;
  } finally { substrateQuery.delete?.(); mol.delete?.(); }
}

/** Rank formal EAS products by ring activation plus directing effects. */
export async function selectMajorAromaticEasProducts(
  substrateSmiles: string,
  products: string[],
  electrophile: AromaticEasElectrophileId,
): Promise<string[]> {
  if (products.length <= 1) return products;
  const scored: SiteScore[]=[];
  let unsupported=false;
  for (const product of products) {
    const score=await scoreProduct(substrateSmiles,product,electrophile);
    if (score===null) { unsupported=true; continue; }
    scored.push({product,score});
  }
  // Do not partially rank fused/unsupported systems.
  if (unsupported || !scored.length) return products;
  const best=Math.max(...scored.map((item)=>item.score));
  return scored.filter((item)=>Math.abs(item.score-best)<1e-6).map((item)=>item.product);
}
