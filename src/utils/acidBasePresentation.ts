import type { AcidityResult } from "./ranking/acidBase/analyzeAcidity";
import type { BasicityResult } from "./ranking/acidBase/analyzeBasicity";

export type SiteRow = {
  id: string; kind: "Acid" | "Base"; rank: number; atomIndex: number; label: string; group: string;
  range: readonly [number, number]; /** The engine's central estimate for the site (acid pKa, or conjugate-acid pKa for bases). */ center: number; confidence: string; reasons: Array<{ label: string; text: string }>;
  detail: AcidityResult | BasicityResult;
};
/** Keep the first complete sentence of each effect; the engine's full text remains on the result objects. */
const sentence = (text: string) => text.match(/^.*?[.!?](?:\s|$)/)?.[0].trim() || text;
const neutral = /^(?:no |little |limited |not |there is no |does not )/i;

export function acidBaseSiteRows(acids: readonly AcidityResult[], bases: readonly BasicityResult[]): SiteRow[] {
  return [
    ...acids.map((site, i): SiteRow => ({ id: `acid-${site.siteAtomIndex}-${i}`, kind: "Acid", rank: i + 1, atomIndex: site.siteAtomIndex, label: site.acidicSite, group: site.relatedGroup, range: site.estimatedPkaRange, center: site.estimatedPkaNumber, confidence: site.confidence, reasons: [], detail: site })),
    ...bases.map((site, i): SiteRow => ({ id: `base-${site.siteAtomIndex}-${i}`, kind: "Base", rank: i + 1, atomIndex: site.siteAtomIndex, label: site.basicSite, group: site.relatedGroup, range: site.conjugateAcidPkaRange, center: site.conjugateAcidPkaNumber, confidence: site.confidence, reasons: [], detail: site })),
  ].map((row) => {
    const effects: SiteRow["reasons"] = row.detail.factors?.filter((f) => f.pkaDelta !== 0).map((f) => ({ label: f.category, text: sentence(f.explanation) })) ?? [];
    if (row.kind === "Acid") {
      const site = row.detail as AcidityResult;
      for (const key of ["atom", "resonance", "induction", "orbital"] as const) {
        if (!site[key] || neutral.test(site[key]) || effects.some((e) => e.label === key)) continue;
        effects.push({ label: key === "atom" ? "Atom" : key[0].toUpperCase() + key.slice(1), text: sentence(site[key]) });
      }
    }
    return { ...row, reasons: effects.length ? effects.slice(0, 5) : [{ label: "Site", text: sentence(row.detail.explanation) }] };
  });
}

const MINUS = "−";
const signed = (n: number) => (n < 0 ? `${MINUS}${Math.abs(n)}` : String(n));

/**
 * Representative pKa for display. The engine's central estimate is used (kept inside its own range) and rounded to
 * the resolution the range supports: whole numbers for wide ranges, halves otherwise. Never more precise than that.
 */
export function representativePka(center: number, range: readonly [number, number]): number {
  const width = range[1] - range[0];
  const step = width >= 4 ? 1 : 0.5;
  const inside = Math.min(Math.max(center, range[0]), range[1]);
  const rounded = Math.round(inside / step) * step;
  // Rounding must not leave the engine's own range; for very narrow ranges keep one decimal instead.
  return rounded >= range[0] && rounded <= range[1] ? rounded : Math.round(inside * 10) / 10;
}

export const formatPkaValue = (n: number) => signed(Math.round(n * 100) / 100);
export const formatPkaRange = (range: readonly [number, number]) => `${signed(range[0])}${range[0] < 0 || range[1] < 0 ? " to " : "–"}${signed(range[1])}`;
/** pKb of the conjugate base at 25 °C in water (pKw = 14.00); shown only for base sites. */
export const pKbFromConjugateAcid = (pKaH: number) => 14 - pKaH;
