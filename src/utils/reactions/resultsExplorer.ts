/**
 * Stage 20: presentation-only helpers for the Reactions results explorer.
 *
 * Nothing here predicts or changes a reaction. It only counts, groups and filters the pathways the engine already produced. Every
 * pathway keeps its own id and appears in exactly one group; filtering hides rows but never alters or merges them, and
 * `groupResults(...).flatMap(items)` over an empty filter always equals the input (nothing is silently dropped).
 *
 * Distinctions kept explicit:
 *   candidates   = what the engine returned before display grouping (e.g. one rule per halogen);
 *   outcomes     = what the page lists after its own display grouping (one row per displayed reaction);
 *   products     = distinct complete product structures across the outcomes (by SMILES; stereo and regio differences are distinct);
 *   families     = distinct reaction types.
 */

export interface ExplorerVariant { completeSmiles: string }

export interface ExplorerPathway {
  id: string;
  title: string;
  reactionType: string;
  family: string;
  chapter: string;
  productStatus: "computed" | "representative" | "generic" | "concept-only";
  productSmiles: string | null;
  productLabel: string;
  reagentLabel: string;
  selectivity: readonly string[];
  limitations: readonly string[];
  competition: { group: string } | null;
  productVariants?: readonly ExplorerVariant[];
}

export const TYPE_LABEL: Record<string, string> = {
  addition: "Additions", substitution: "Substitutions", elimination: "Eliminations", oxidation: "Oxidations", reduction: "Reductions",
  condensation: "Condensations", rearrangement: "Rearrangements", acidBase: "Acid–base reactions", cleavage: "Cleavages",
  cyclization: "Cyclizations", ringOpening: "Ring openings", coupling: "Couplings", pericyclic: "Pericyclic reactions", radical: "Radical reactions",
  tautomerization: "Tautomerizations", isomerization: "Isomerizations",
};
export const typeLabel = (type: string): string => TYPE_LABEL[type] ?? `${type.charAt(0).toUpperCase()}${type.slice(1)} reactions`;

export const STATUS_LABEL = {
  computed: "Computed product",
  representative: "Representative product",
  generic: "Generic R-group product",
  "concept-only": "Concept / conditions",
} as const;
export type StatusKey = keyof typeof STATUS_LABEL;
export const STATUS_ORDER: StatusKey[] = ["computed", "representative", "generic", "concept-only"];

/** Complete product structures an outcome can lead to (each variant is one product mixture member; otherwise its single product). */
export function productKeys(pathway: ExplorerPathway): string[] {
  const variants = pathway.productVariants?.map((variant) => variant.completeSmiles).filter(Boolean) ?? [];
  if (variants.length > 0) return variants;
  return pathway.productSmiles ? [pathway.productSmiles] : [];
}

export interface ResultsSummary {
  /** Pathways the engine returned before display grouping. */
  candidates: number;
  /** Rows the page lists (after display grouping). */
  outcomes: number;
  /** Distinct complete product structures. */
  distinctProducts: number;
  /** Outcomes whose product list has more than one member (a stated mixture). */
  mixtures: number;
  families: Array<{ type: string; label: string; count: number }>;
  byStatus: Record<StatusKey, number>;
  withSelectivity: number;
  withLimitations: number;
  /** Outcomes in a competition group with at least one other outcome (the engine says they compete for the same event). */
  competing: number;
  reagentSets: number;
  /** Catalog reactions that are chemically related but predicted not to occur for this substrate. */
  noReaction: number;
}

export function summarizeResults(outcomes: readonly ExplorerPathway[], candidateCount: number, noReaction: number): ResultsSummary {
  const products = new Set<string>();
  const families = new Map<string, number>();
  const reagents = new Set<string>();
  const byStatus: Record<StatusKey, number> = { computed: 0, representative: 0, generic: 0, "concept-only": 0 };
  const groupSizes = new Map<string, number>();
  let mixtures = 0, withSelectivity = 0, withLimitations = 0;
  for (const p of outcomes) {
    const keys = productKeys(p);
    for (const key of keys) products.add(key);
    if (keys.length > 1) mixtures += 1;
    families.set(p.reactionType, (families.get(p.reactionType) ?? 0) + 1);
    reagents.add(p.reagentLabel);
    byStatus[p.productStatus] += 1;
    if (p.selectivity.length > 0) withSelectivity += 1;
    if (p.limitations.length > 0) withLimitations += 1;
    if (p.competition) groupSizes.set(p.competition.group, (groupSizes.get(p.competition.group) ?? 0) + 1);
  }
  let competing = 0;
  for (const p of outcomes) if (p.competition && (groupSizes.get(p.competition.group) ?? 0) > 1) competing += 1;
  return {
    candidates: candidateCount, outcomes: outcomes.length, distinctProducts: products.size, mixtures,
    families: [...families.entries()].map(([type, count]) => ({ type, label: typeLabel(type), count })),
    byStatus, withSelectivity, withLimitations, competing, reagentSets: reagents.size, noReaction,
  };
}

export interface ResultGroup<T extends ExplorerPathway = ExplorerPathway> { key: string; label: string; items: T[] }

/** One group per reaction type, in order of first appearance; items keep the engine's order. */
export function groupResults<T extends ExplorerPathway>(outcomes: readonly T[]): ResultGroup<T>[] {
  const groups = new Map<string, ResultGroup<T>>();
  for (const p of outcomes) {
    const group = groups.get(p.reactionType) ?? { key: p.reactionType, label: typeLabel(p.reactionType), items: [] };
    group.items.push(p);
    groups.set(p.reactionType, group);
  }
  return [...groups.values()];
}

export interface ResultFilter { query: string; status: StatusKey | "all" }
export const NO_FILTER: ResultFilter = { query: "", status: "all" };
export const isFiltering = (filter: ResultFilter): boolean => filter.query.trim() !== "" || filter.status !== "all";

const norm = (text: string): string => text.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");

/** Keeps outcomes whose title, reagents, product, chapter or family contain every query word, and (optionally) one product status. */
export function filterResults<T extends ExplorerPathway>(outcomes: readonly T[], filter: ResultFilter): T[] {
  const words = norm(filter.query).split(/\s+/).filter(Boolean);
  return outcomes.filter((p) => {
    if (filter.status !== "all" && p.productStatus !== filter.status) return false;
    if (words.length === 0) return true;
    const haystack = norm([p.title, p.reagentLabel, p.productLabel, p.chapter, p.family, p.reactionType, typeLabel(p.reactionType)].join(" "));
    return words.every((word) => haystack.includes(word));
  });
}

/** Rows (headers only) the explorer mounts for a given expansion state: collapsed groups mount none. */
export function mountedRowCount(groups: readonly ResultGroup[], openGroups: ReadonlySet<string>): number {
  return groups.reduce((n, group) => n + (openGroups.has(group.key) ? group.items.length : 0), 0);
}

/** The groups to open initially: the first group only (so the first screen is compact whatever the result count). */
export const initialOpenGroups = (groups: readonly ResultGroup[]): Set<string> => new Set(groups.slice(0, 1).map((group) => group.key));
