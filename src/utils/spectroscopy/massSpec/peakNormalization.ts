import type { MassSpectrumPeak } from "../types";

function uniqueAlternatives(peaks: MassSpectrumPeak[]) {
  const seen = new Set<string>();
  const alternatives: Array<{ structure: string; label: string }> = [];
  for (const peak of peaks) {
    if (peak.previewStructure) {
      const key = `${peak.previewStructure}|${peak.previewLabel ?? peak.label}`;
      if (!seen.has(key)) {
        seen.add(key);
        alternatives.push({ structure: peak.previewStructure, label: peak.previewLabel ?? peak.label });
      }
    }
    for (const alternative of peak.previewAlternatives ?? []) {
      const key = `${alternative.structure}|${alternative.label}`;
      if (seen.has(key)) continue;
      seen.add(key);
      alternatives.push(alternative);
    }
  }
  return alternatives.slice(0, 8);
}

export function mergeAndNormalizePeaks(peaks: MassSpectrumPeak[]) {
  if (peaks.length === 0) return [];

  // General graph cleavage and a diagnostic SMARTS can describe the same
  // ion-forming channel. Multiple descriptions are not independent abundance.
  const channels = new Map<string, MassSpectrumPeak[]>();
  const independent: MassSpectrumPeak[] = [];
  for (const peak of peaks) {
    if (!peak.channelKey) { independent.push(peak); continue; }
    const key = `${peak.channelKey}|${peak.mz.toFixed(2)}`;
    channels.set(key, [...(channels.get(key) ?? []), peak]);
  }
  for (const descriptions of channels.values()) {
    const graph = descriptions.filter(p => p.channelSource === "graph");
    const strongest = descriptions.reduce((a,b) => a.relativeIntensity >= b.relativeIntensity ? a : b);
    const graphTotal = graph.reduce((sum,p) => sum + p.relativeIntensity,0);
    // Graph entries enumerate different bonds, including inequivalent sites
    // yielding the same ion. Retain that multiplicity. A diagnostic description
    // of their ion competes as an alternate heuristic, not an extra cleavage.
    if (graph.length && graphTotal >= strongest.relativeIntensity) independent.push(...graph);
    else independent.push(strongest);
  }
  peaks = independent;

  const groups = new Map<string, MassSpectrumPeak[]>();
  for (const peak of peaks) {
    if (!Number.isFinite(peak.mz) || !Number.isFinite(peak.relativeIntensity) || peak.relativeIntensity <= 0) continue;
    const key = peak.mz.toFixed(2);
    groups.set(key, [...(groups.get(key) ?? []), peak]);
  }

  const merged: MassSpectrumPeak[] = [];
  for (const group of groups.values()) {
    const ranked = [...group].sort((a, b) => b.relativeIntensity - a.relativeIntensity);
    const primary = ranked[0];
    const rawTotal = ranked.reduce((sum, peak) => sum + peak.relativeIntensity, 0);
    const pathwayCount = ranked.reduce((sum, peak) => sum + (peak.pathwayCount ?? 1), 0);
    const alternatives = uniqueAlternatives(ranked);
    const contributorLabels = [...new Set(ranked.flatMap((peak) =>
      peak.contributors?.map((entry) => entry.label) ?? [peak.label],
    ))].slice(0, 8);

    merged.push({
      ...primary,
      relativeIntensity: rawTotal,
      pathwayCount,
      contributors: ranked.flatMap((peak) => peak.contributors ?? [{
        label: peak.label,
        explanation: peak.explanation,
        fragmentSmiles: peak.fragmentSmiles,
      }]).slice(0, 12),
      previewAlternatives: alternatives.length > 1 ? alternatives : primary.previewAlternatives,
      previewContributorLabels: contributorLabels.length > 1 ? contributorLabels : primary.previewContributorLabels,
      explanation: ranked.length > 1
        ? `${primary.explanation} ${ranked.length} predicted contribution${ranked.length === 1 ? "" : "s"} overlap at this m/z, so their propensities are combined before normalization.`
        : primary.explanation,
    });
  }

  const maxRaw = Math.max(...merged.map((peak) => peak.relativeIntensity), 1e-12);
  return merged
    .map((peak) => ({
      ...peak,
      relativeIntensity: Number(((peak.relativeIntensity / maxRaw) * 100).toFixed(1)),
    }))
    .filter((peak) => peak.relativeIntensity >= 0.8 || peak.kind === "molecular-ion" || peak.kind === "isotope")
    .sort((a, b) => a.mz - b.mz);
}
