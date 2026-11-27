import { ALLELE_DISPLAY, LOCI, type Chromatid } from "../../utils/biology/chromosome";

/** Non-component helpers of the chromosome drawing (kept apart so the component file only exports components). */
export const COLORS = { maternal: "#0f766e", paternal: "#c2410c", ink: "#0f172a", muted: "#475569", select: "#1d4ed8", centromere: "#1e293b" };
export const ROD_W = 11;
export const ROD_GAP = 6;
export const glyphWidth = (nChromatids: number) => nChromatids * ROD_W + (nChromatids - 1) * ROD_GAP;

/** Genes carried by the chromosome in words, for text alternatives. */
export const lociNames = (loci: string[]) => loci.map((l) => LOCI[l]?.name ?? l).join(" and ");
export const chromatidText = (c: Chromatid) => c.alleles.map((a) => { const d = ALLELE_DISPLAY[a]; return d ? `${d.base}${d.sup ?? ""}` : a; }).join("");
