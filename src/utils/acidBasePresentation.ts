import type { AcidityResult } from "./ranking/acidBase/analyzeAcidity";
import type { BasicityResult } from "./ranking/acidBase/analyzeBasicity";

export type SiteRow = {
  id: string; kind: "Acid" | "Base"; rank: number; atomIndex: number; label: string; group: string;
  range: readonly [number, number]; confidence: string; reasons: Array<{ label: string; text: string }>;
  detail: AcidityResult | BasicityResult;
};
/** Preserve complete sentences; full original reasoning is always available separately. */
const sentence = (text: string) => text.match(/^.*?[.!?](?:\s|$)/)?.[0].trim() || text;
const neutral = /^(?:no |little |limited |not |there is no |does not )/i;

export function acidBaseSiteRows(acids: readonly AcidityResult[], bases: readonly BasicityResult[]): SiteRow[] {
  return [
    ...acids.map((site, i): SiteRow => ({ id: `acid-${site.siteAtomIndex}-${i}`, kind: "Acid", rank: i + 1, atomIndex: site.siteAtomIndex, label: site.acidicSite, group: site.relatedGroup, range: site.estimatedPkaRange, confidence: site.confidence, reasons: [], detail: site })),
    ...bases.map((site, i): SiteRow => ({ id: `base-${site.siteAtomIndex}-${i}`, kind: "Base", rank: i + 1, atomIndex: site.siteAtomIndex, label: site.basicSite, group: site.relatedGroup, range: site.conjugateAcidPkaRange, confidence: site.confidence, reasons: [], detail: site })),
  ].map((row) => {
    const effects: SiteRow["reasons"] = row.detail.factors?.filter((f) => f.pkaDelta !== 0).map((f) => ({ label: f.category, text: sentence(f.explanation) })) ?? [];
    if (row.kind === "Acid") {
      const site = row.detail as AcidityResult;
      for (const key of ["atom", "resonance", "induction", "orbital"] as const) {
        if (!site[key] || neutral.test(site[key]) || effects.some((e) => e.label === key)) continue;
        effects.push({ label: key === "atom" ? "Atom" : key[0].toUpperCase() + key.slice(1), text: sentence(site[key]) });
      }
    }
    return { ...row, reasons: effects.length ? effects.slice(0, 4) : [{ label: "Site", text: sentence(row.detail.explanation) }] };
  });
}
