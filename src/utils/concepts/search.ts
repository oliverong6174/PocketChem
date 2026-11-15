/**
 * Stage 19: deterministic local search over concepts, tools and saved analyses.
 *
 * Ranking is a fixed ladder of match levels (see LEVEL). Typo tolerance is deliberately narrow: only a single query word of at
 * least five letters, and only edit distance 1 against a name or alias word that starts with the same letter, so it can
 * rescue "glycolisis" but never maps a different word onto an unrelated topic. Approximate results are labelled.
 * Ties break on kind (concept, tool, saved), then name, then key, so a given query always gives the same order.
 */
import type { SubjectId } from "../../navigation/subjects";
import { CONCEPTS, TOOL_ENTRIES, isValidDestination, type Concept, type ConceptDestination, type ToolEntry } from "./conceptIndex";

export type ResultKind = "concept" | "tool" | "saved";

export interface SavedItem { id: string; name: string; summary?: string; subject: SubjectId; page: string }

export interface SearchResult {
  /** Unique across the result list. */
  key: string;
  kind: ResultKind;
  title: string;
  subject: SubjectId;
  summary: string;
  /** Why this result matched, in words a student can read. */
  reason: string;
  score: number;
  approximate: boolean;
  destination: ConceptDestination | null;
  conceptId?: string;
  savedId?: string;
  savedPage?: string;
}

export interface SearchOptions {
  subject?: SubjectId | "all";
  kind?: ResultKind | "all";
  limit?: number;
  saved?: readonly SavedItem[];
  concepts?: readonly Concept[];
  tools?: readonly ToolEntry[];
}

export const LEVEL = {
  nameExact: 1000,
  aliasExact: 900,
  nameStarts: 800,
  aliasStarts: 700,
  nameTokens: 600,
  aliasTokens: 500,
  termExact: 450,
  spread: 350,
  toolSummary: 250,
  typo: 200,
  summary: 120,
} as const;

const STOP = new Set(["the", "of", "and", "a", "an", "in", "to", "for", "is", "on", "with"]);
const SUPERSCRIPT: Record<string, string> = { "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4", "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9", "⁺": "+", "⁻": "-", "−": "-", "–": "-", "—": "-" };

/** Lower-case, accent-free, subscripts as digits, every dash a space-separated break. */
export function normalizeText(text: string): string {
  let out = "";
  for (const ch of text) out += SUPERSCRIPT[ch] ?? ch;
  return out
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9α-ω]+/g, " ")
    .trim();
}

const tokensOf = (normalized: string): string[] => (normalized ? normalized.split(" ") : []);

function queryTokens(normalized: string): string[] {
  const all = tokensOf(normalized);
  const kept = all.filter((token) => !STOP.has(token));
  return kept.length > 0 ? kept : all;
}

/** A query token matches a field token as a whole word, or (3+ letters) as a prefix of it. */
function tokenMatches(query: string, field: string): boolean {
  return field === query || (query.length >= 3 && field.startsWith(query));
}

const allTokensMatch = (q: string[], field: string[]): boolean => q.length > 0 && q.every((token) => field.some((f) => tokenMatches(token, f)));

function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i += 1; j += 1; continue; }
    edits += 1;
    if (edits > 1) return false;
    if (a.length > b.length) i += 1;
    else if (a.length < b.length) j += 1;
    else { i += 1; j += 1; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

interface Hit { score: number; reason: string; approximate: boolean }

interface Field { text: string; norm: string; tokens: string[] }
const field = (text: string): Field => { const norm = normalizeText(text); return { text, norm, tokens: tokensOf(norm) }; };

function matchNamed(q: string, qt: string[], name: Field, aliases: Field[], kind: ResultKind): Hit | null {
  if (name.norm === q) return { score: LEVEL.nameExact, reason: kind === "tool" ? "Tool name" : kind === "saved" ? "Saved analysis name" : "Concept name", approximate: false };
  const aliasExact = aliases.find((a) => a.norm === q);
  if (aliasExact) return { score: LEVEL.aliasExact, reason: `Also known as “${aliasExact.text}”`, approximate: false };
  if (q.length >= 2 && name.norm.startsWith(q)) return { score: LEVEL.nameStarts, reason: "Name starts with your search", approximate: false };
  const aliasStarts = q.length >= 2 ? aliases.find((a) => a.norm.startsWith(q)) : undefined;
  if (aliasStarts) return { score: LEVEL.aliasStarts, reason: `Also known as “${aliasStarts.text}”`, approximate: false };
  if (allTokensMatch(qt, name.tokens)) return { score: LEVEL.nameTokens, reason: "Words in the name match", approximate: false };
  const aliasTokens = aliases.find((a) => allTokensMatch(qt, a.tokens));
  if (aliasTokens) return { score: LEVEL.aliasTokens, reason: `Matches the alias “${aliasTokens.text}”`, approximate: false };
  return null;
}

function matchTypo(qt: string[], names: Field[]): Hit | null {
  if (qt.length !== 1 || qt[0].length < 5) return null;
  const q = qt[0];
  for (const f of names) {
    for (const token of f.tokens) {
      if (token.length >= 5 && token[0] === q[0] && token !== q && withinOneEdit(q, token)) return { score: LEVEL.typo, reason: `Approximate match for “${token}”`, approximate: true };
    }
  }
  return null;
}

function summaryHit(qt: string[], summary: string): boolean {
  const words = tokensOf(normalizeText(summary));
  return qt.every((token) => words.some((w) => (token.length >= 4 ? w.startsWith(token) : w === token)));
}

function scoreConcept(q: string, qt: string[], concept: Concept): Hit | null {
  const name = field(concept.name);
  const aliases = concept.aliases.map(field);
  const terms = concept.relatedTerms.map(field);
  const named = matchNamed(q, qt, name, aliases, "concept");
  if (named) return named;
  const term = terms.find((t) => t.norm === q);
  if (term) return { score: LEVEL.termExact, reason: concept.termNotes?.[term.text] ?? `Related term: ${term.text}`, approximate: false };
  const union = [...name.tokens, ...aliases.flatMap((a) => a.tokens), ...terms.flatMap((t) => t.tokens)];
  if (qt.length > 1 && allTokensMatch(qt, union)) return { score: LEVEL.spread, reason: "Search words appear in its name, aliases and related terms", approximate: false };
  if (qt.length === 1 && terms.some((t) => allTokensMatch(qt, t.tokens))) {
    const t = terms.find((x) => allTokensMatch(qt, x.tokens)) as Field;
    return { score: LEVEL.spread, reason: concept.termNotes?.[t.text] ?? `Related term: ${t.text}`, approximate: false };
  }
  const typo = matchTypo(qt, [name, ...aliases]);
  if (typo) return typo;
  if (summaryHit(qt, concept.summary)) return { score: LEVEL.summary, reason: "Mentioned in its description", approximate: false };
  return null;
}

function scoreTool(q: string, qt: string[], tool: ToolEntry): Hit | null {
  const name = field(tool.name);
  const named = matchNamed(q, qt, name, [], "tool");
  if (named) return named;
  const typo = matchTypo(qt, [name]);
  if (typo) return typo;
  if (summaryHit(qt, tool.summary)) return { score: LEVEL.toolSummary, reason: "Described by this tool", approximate: false };
  return null;
}

function scoreSaved(q: string, qt: string[], item: SavedItem): Hit | null {
  const named = matchNamed(q, qt, field(item.name), [], "saved");
  if (named) return named;
  if (item.summary && summaryHit(qt, item.summary)) return { score: LEVEL.summary, reason: "Mentioned in its summary", approximate: false };
  return null;
}

const KIND_ORDER: Record<ResultKind, number> = { concept: 0, tool: 1, saved: 2 };

/** Searches concepts, tools and (when supplied) saved analyses. An empty or symbol-only query gives no results. */
export function searchConcepts(query: string, options: SearchOptions = {}): SearchResult[] {
  const q = normalizeText(query);
  if (!q) return [];
  const qt = queryTokens(q);
  const wantSubject = options.subject && options.subject !== "all" ? options.subject : null;
  const wantKind = options.kind && options.kind !== "all" ? options.kind : null;
  const results: SearchResult[] = [];

  if (!wantKind || wantKind === "concept") {
    for (const concept of options.concepts ?? CONCEPTS) {
      if (wantSubject && concept.subject !== wantSubject) continue;
      if (!isValidDestination(concept.destination)) continue;
      const hit = scoreConcept(q, qt, concept);
      if (hit) results.push({ key: `concept:${concept.id}`, kind: "concept", title: concept.name, subject: concept.subject, summary: concept.summary, reason: hit.reason, score: hit.score, approximate: hit.approximate, destination: concept.destination, conceptId: concept.id });
    }
  }
  if (!wantKind || wantKind === "tool") {
    for (const tool of options.tools ?? TOOL_ENTRIES) {
      if (wantSubject && tool.subject !== wantSubject) continue;
      if (!isValidDestination(tool.destination)) continue;
      const hit = scoreTool(q, qt, tool);
      if (hit) results.push({ key: tool.id, kind: "tool", title: tool.name, subject: tool.subject, summary: tool.summary, reason: hit.reason, score: hit.score, approximate: hit.approximate, destination: tool.destination });
    }
  }
  if (!wantKind || wantKind === "saved") {
    for (const item of options.saved ?? []) {
      if (wantSubject && item.subject !== wantSubject) continue;
      const hit = scoreSaved(q, qt, item);
      if (hit) results.push({ key: `saved:${item.id}`, kind: "saved", title: item.name, subject: item.subject, summary: item.summary ?? "", reason: hit.reason, score: hit.score, approximate: hit.approximate, destination: null, savedId: item.id, savedPage: item.page });
    }
  }

  // A tool that carries exactly the name of a matching concept with the same destination is the same thing: keep the concept.
  const conceptKeys = new Set(results.filter((r) => r.kind === "concept" && r.destination).map((r) => `${normalizeText(r.title)}|${r.destination?.subject}|${r.destination?.toolId}`));
  const unique = new Map<string, SearchResult>();
  for (const result of results) {
    if (result.kind === "tool" && result.destination && conceptKeys.has(`${normalizeText(result.title)}|${result.destination.subject}|${result.destination.toolId}`)) continue;
    if (!unique.has(result.key)) unique.set(result.key, result);
  }

  const ordered = [...unique.values()].sort((a, b) =>
    b.score - a.score || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.title.localeCompare(b.title, "en") || a.key.localeCompare(b.key, "en"));
  return ordered.slice(0, options.limit ?? 40);
}

/** Suggestions for the empty state: a few fixed concepts per subject (not a search). */
export function suggestedQueries(): string[] {
  return ["pH", "ATP", "peptide", "Newton's laws", "operon", "chair flip", "enthalpy", "glycolysis"];
}
