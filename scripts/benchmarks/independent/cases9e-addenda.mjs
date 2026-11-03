// Stage 9E addenda to the frozen untouched set (cases9e.mjs). These cases were written AFTER the first run of cases9e.mjs, in response to
// what that run showed, and are therefore reported SEPARATELY and never counted in the held-out figures.
//
// HX-06R restates HX-06. HX-06 supplied sodium ethoxide as a second molecule to the E2 rule; the workspace treats that base as a reagent
// "supplied by the rule itself" and rejects it as an inventory molecule (status invalid-selection), so HX-06 could only ever be
// "abstained". That was an authoring error against the harness's convention, not an engine result. HX-06 itself is left unchanged.
import { SOURCES as BASE_SOURCES } from "./cases9e.mjs";
export const CHECKED_ON = "2026-11-02";
export const CORRECTIONS = [
  { id: "HX-06", note: "authoring error: the E2 rule supplies its own base, so ethoxide must not be a second molecule; restated as HX-06R" },
];
export const SOURCES = { "libretexts-ether-synthesis": BASE_SOURCES["libretexts-ether-synthesis"], "libretexts-williamson-nassau": BASE_SOURCES["libretexts-williamson-nassau"] };
export const CASES = [
  {
    id: "HX-06R",
    category: "competing-pathways",
    kind: "step",
    title: "tert-Butyl bromide + an unhindered alkoxide (base supplied by the rule): isobutylene by E2; the Williamson ether is not formed",
    reactants: ["CC(C)(C)Br"],
    rule: "haloalkane-e2-zaitsev",
    expect: { products: [{ smiles: "C=C(C)C", role: "sole" }], forbidden: ["CCOC(C)(C)C"] },
    provenance: { level: "verified-secondary", sources: ["libretexts-ether-synthesis", "libretexts-williamson-nassau"], note: "Tertiary halide with a strong alkoxide gives elimination." },
  },
];
