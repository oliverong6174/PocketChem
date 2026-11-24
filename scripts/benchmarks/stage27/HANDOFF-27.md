# Stage 27 handoff: scientific reliability, reference verification and reproducibility

Branch `stage10-ui-overhaul`. Nothing was pushed. Stage 28 was not started.

## 1. Starting checkpoint
HEAD `013fdd7` (Stage 26 final), branch `stage10-ui-overhaul`. Untracked and preserved: `CLAUDE.md`, `stage5-changes.patch`, `stage5-status.txt`, `scripts/benchmarks/stage9m/rd-probe.mjs`, `scripts/tests/.probe-names.mjs`. `stash@{0}` (phase1-synthesis-reliability) untouched. Explicit-file staging; the unrestricted `npm test` was not run. Node v24.21.0.

## 2. Verification inventory
Kept in `src/utils/evidence/evidence27.ts` (14 records) and mirrored by hand in `scripts/reference/stage27/reproducibility-manifest.json`. Each record separates **kind** (reference data / textbook approximation / numerical model / curated mechanism), **source status** and **calculation status**:

| Record | Kind | Source status | Calc status |
|---|---|---|---|
| Atomic masses (83) | reference data | source-verified (CIAAW) | independently checked |
| Stoichiometry, balancing | textbook approx. | partly (masses only) | checked |
| Ideal gas, kinetic theory | textbook approx. | partly (constants) | checked |
| Standard reduction potentials (28) | reference data | partly (secondary compilation) | checked |
| Galvanic cell, Nernst, ΔG°, K | textbook approx. | partly (constants) | checked |
| Nernst / GHK membrane | textbook approx. | partly (constants, Na⁺ gradient, −70 mV) | checked |
| Hodgkin–Huxley (squid axon, 6.3 °C) | numerical model | **not verified** (1952 paper not retrievable) | checked |
| Physical constants | reference data | source-verified (NIST) | checked |
| Waves/optics/diffraction/fields/induction | textbook approx. | not verified | checked |
| Fatty-acid β-oxidation / ATP accounting | textbook approx. | partly (location, acetyl-CoA entry) | checked |
| Urea cycle | textbook approx. | partly (liver urea from amino-acid N + CO₂) | checked |
| Apoptosis graph | curated mechanism | partly (intrinsic chain) | checked (dependencies) |
| Cell cycle / licensing graph | curated mechanism | partly | checked (one case) |
| Organelle / trafficking routes | curated mechanism | partly | **not checked** in Stage 27 |

## 3. References actually retrieved and read (all 2026-11-23 unless noted)
- CIAAW Standard Atomic Weights 2024 and Abridged Atomic Weights (ciaaw.org), both tables parsed.
- Wikipedia "Standard electrode potential (data page)" via raw wikitext (a **secondary** compilation).
- NIST Fundamental Physical Constants listing (2022 CODATA).
- OpenStax Biology 2e 35.2 (Table 35.1 ion concentrations, −70 mV, +40 mV peak), 7.6 (β-oxidation location, liver urea), OpenStax A&P 2e 12.4 (−70 / −55 / +30 mV). Biology 2e 4.3 and 10.3 were read in Stage 26.
- Seven open-access papers through the Europe PMC full-text service (DOIs from Europe PMC metadata): 10.5936/csbj.201204007 (intrinsic cell death pathway), 10.1007/s00418-007-0363-x (COPII), 10.1186/s12964-021-00741-y (nuclear import), 10.1098/rstb.2011.0073 and 10.1186/1747-1028-1-22 (licensing, Cdt1/geminin), 10.1016/j.tibs.2010.08.004 (BUBR1/MCC), 10.1038/s41419-023-06154-8 (autophagy); editorial 10.3390/ijms23105315 (SRP/Sec61 machinery); NCCD 2018 (10.1038/s41418-017-0012-4) opened but supports only BAX/BAK domain statements.
- **Could not be retrieved:** NCBI/PMC article and Bookshelf chapter pages (bot check), Hodgkin–Huxley 1952 (no text in Europe PMC), CRC Handbook, Bard–Parsons–Jordan, Berg/Lehninger.

## 4. Atomic masses
All 83 entries compared with the CIAAW abridged table; two differed. **Ar 39.948 → 39.95** (its standard weight is now the interval [39.792, 39.963]; 39.95 is the conventional value) and **Zr 91.224 → 91.222** (revised by CIAAW in 2024). Interval elements keep the single conventional value (H 1.008, C 12.011, S 32.06 …); no mass numbers substituted. H₂O, CO₂, NaCl, Ca(OH)₂, Fe₂(SO₄)₃, CuSO₄·5H₂O and K₄[Fe(CN)₆] molar masses are recomputed from the downloaded file in the new suite. Existing hand values in `generalChemGas22` that used 39.948 were updated.

## 5. Standard electrode potentials
28 couples checked for identity, electron count, reduction direction, atom balance (own element counter), charge balance, and value against the secondary compilation: all within 0.025 V, no sign errors. Spreads recorded, not "corrected": Au³⁺/Au 1.498 vs 1.52 (0.022 V), Sn −0.138 vs −0.13, Fe −0.447 vs −0.44, Cu 0.342 vs 0.337. The CRC Handbook was not opened, so the status is "partly verified". Daniell cell (1.104 V, ΔG° = −213.1 kJ/mol, ln K), Nernst with [Zn²⁺] = 0.01 M, electrode reversal and "potentials are not multiplied by coefficients" (MnO₄⁻/Fe³⁺, n = 5) are tested with hand expressions. Gases are tabulated at 101.325 kPa while the module says 1 bar (≈0.2 mV effect; noted).

## 6. Membrane and Hodgkin–Huxley
Nernst/GHK implemented as stated; E_K −95.0, E_Na +66.6, E_Ca +130.9 mV at 37 °C reproduced by hand; GHK equals the hand expression. **Finding:** Na⁺ gradient and −70 mV match OpenStax Biology 2e; the app's default K⁺ (4/140) and Cl⁻ (110/10) differ from that table (K⁺ 155 inside; Cl⁻ 120/4), which changes E_Cl by ≈27 mV. Not an error (values vary by neuron) but now stated in the evidence panel and tested (BIO-ION). HH parameters (g 120/36/0.3, E +50/−77/−54.387, rest −65, 6.3 °C) are the widely reproduced modern-convention set; rate equations match the re-typed published form on −100…60 mV; net current at rest ≈ 0; spike 30–50 mV; no spike at 1 µA/cm² or with Na⁺ block; refractoriness; dt-convergence (peak < 0.1 mV between dt 0.01 and 0.0025 ms). None of this is verified against the 1952 paper, and the panel says so; the model is not offered as a mammalian neuron.

## 7. Biochemical stoichiometry
Independent hand expectations for C4/C8/C12/C16/C18: cycles n/2 − 1, acetyl-CoA n/2, NADH = FADH₂ = cycles, activation 2 ATP-eq, total 2.5·NADH + 1.5·FADH₂ + 10·acetyl − 2. Palmitate: 7, 8, 7, 7, 2, **106** (labelled a convention, not a measured yield). Urea cycle: 3 ATP molecules, 4 high-energy bonds, AMP 1, ADP 2, phosphate balance 9 = 4 + 1 + 4, nitrogens from NH₄⁺ (CPS I) and aspartate (ASS). OpenStax 7.6 was read: it confirms only β-oxidation in the matrix feeding the citric acid cycle and liver urea synthesis, and it simplifies the nitrogen sources to "two ammonia molecules"; the app's more detailed account is therefore recorded as partly checked with that discrepancy stated. Ketogenesis, amino-acid classes, carnitine and fatty-acid synthesis remain unverified (Stage 25 list, otherwise unchanged).

## 8. Biology mechanism verification
Provenance (`provenance26.ts`) now has verified / partly-verified / not-checked. Verified: intrinsic chain BAX/BAK → MOMP → cytochrome c → APAF1 apoptosome → caspase-9 → caspase-3/7; COPII assembly (Sar1, Sec23/24, Sec13/31). Partly: BH3 control of BAX/BAK (the source presents competing direct and indirect models; the app follows the indirect picture), nuclear import, licensing brakes, MCC–APC/C–securin, autophagy core, SRP/Sec61 machinery. Not checked (11): COPI/Rab/SNARE, M6P, mitochondrial import, endosome pH, ERAD, ORC/Cdc6/MCM, ATM/ATR/Wee1/Cdc25, separase/cohesin, p53→PUMA/NOXA + BAX/BAK redundancy + BCL-2 neutralisation, Fas/DISC/c-FLIP/BID/type I–II, fate-map links. Causal dependencies were additionally tested as hand-specified valid/invalid transitions (BIO-MECH-1…8). No incorrect direction or dependency was found.

## 9. Scientific defects discovered
1. Ar and Zr atomic masses out of date (real, small: 0.002 g/mol).
2. HH α_n/α_m used a hard cut-off (|x| < 1e-7) around a removable singularity with `1 − exp(−x/10)`: relative error up to 2.6 × 10⁻⁹ near the cut-off. Numerically tiny; no visible effect on spikes.
3. Stage 26 provenance said "verified claims cite OpenStax" and listed 12 unchecked groups; seven now have partial or full sources.
4. Stage 25 provenance claimed OpenStax lipid page returned 404: the page is numbered 7.6.
5. Stage 15/16 exact-list assertions were stale (not a scientific defect).
My own first-run test errors (RT/F hand value, regex, a test helper) were test mistakes, not model defects.

## 10. Defects corrected
Ar, Zr masses; HH rates now `c·x/(−expm1(−x/10))` (exact limit at 0, ≈1e-16 relative error everywhere; tested to 1e-12 against the series 10c(1 + x/20 + x²/1200) at x = ±1e-12…±1e-3); provenance statuses; stale test assertions. No scientific model was weakened.

## 11. Independent reference cases
`scripts/tests/scientificReference27.test.mjs`: **86/86** (identifiers in the manifest). Chemistry (masses, balance with atom recount, gas, electrochemistry), physics (constants vs NIST, closed pipe/string harmonics and nodes, thin lens/mirror signs, Snell, single/double slit with missing orders, dipole and midpoint fields, Lorentz force sign, motional EMF with rails power balance, RL growth/decay and Lenz sign), biology (Nernst, GHK, HH, apoptosis and checkpoint dependencies), biochemistry (fatty-acid and urea bookkeeping), plus evidence-registry consistency/tamper tests. Expected values come from the downloaded tables or closed forms in the file, not from the modules.

## 12. Evidence UI
`src/components/ui/EvidencePanel.tsx` + `src/utils/evidence/evidence27.ts`; collapsed by default; shows kind, source status, calc status and a "qualitative" badge for mechanisms, what the source status covers, sources with retrieval dates (https, `_blank`, `noreferrer`), conditions, assumptions, unsupported conclusions and reference-case ids. Added to 12 workspaces: Stoichiometry (2 panels), Gas laws, Electrochemistry (2), Membranes, Neuronal physiology (2), Apoptosis, Cell cycle, Organelles, Fatty acids, Amino-acid/urea, Waves, Optics. Existing Biology provenance panel shows three statuses with caveats. Validation prevents "source-verified" without a dated source and a quantitative curated mechanism.

## 13. Legacy test corrections
Stage 15 and 16 stale assertions replaced by order-preserving invariants (original tools present in order, Overview first, Saved last, original seven overview cards and two groups present, no planned-list buttons). Nothing deleted or weakened. Organic: `stereo9d.test.mjs` alone **28/28 in 3 m 18 s** (the "timeouts" in Stage 21 were load-related); `speciesPool` passed alone in Stage 21; no synthesis investigation.

## 14. Browser verification (production build, sequential, headless Chrome)
Stage 27 **112/112**, Stage 15 **60/60** (was 57), Stage 16 **124/124** (was 120), Stage 18 108/108, Stage 21 79/79, Stage 22 159/159, Stage 23 152/152, Stage 25 150/150, Stage 26 192/192. Stage 27 covers panel presence/order/labels on 12 pages, source links, honest-scope wording, provenance counts, corrected ZrO₂ mass in the Stoichiometry tool, three widths × two themes with no overflow, contrast ≥ 4.5. Screenshots (`node_modules/.cache/pc-live27`) were opened for the HH mobile dark and electrochemistry desktop pages; only two of 16 were inspected by eye.

## 15. TypeScript / build / lint
`tsc -p tsconfig.app.json --noEmit` clean; `npm run build` succeeds (about 2 min wall time when the machine was busy; existing chunk-size warning only); ESLint clean on all 26 changed or new source, test and browser files. Repository-wide lint not run.

## 16. Source-verification coverage
Source-verified: atomic masses, physical constants. Partly: 10 records. Not verified: Hodgkin–Huxley, physics closed forms. Biology provenance across the three tools: 9 verified, 6 partly verified, 11 not checked (Stage 26 had 7 / 0 / 12). Stage 25 biochemistry: 2 partly, the rest unverified.
Per tool (verified / partly / not): cell death 1/2/3, cell cycle 5/2/3, organelles 3/2/5.

## 17. Still unverified
HH 1952 parameters; CRC/Bard potentials; ion concentrations beyond Na⁺ and −70 mV; membrane permeability ratios; palmitate 106 and the 2.5/1.5 convention; urea-cycle enzymes and accounting; ketogenesis; amino-acid classes; every "not checked" mechanism in §8; physics closed forms (hand-checked only).

## 18. Numerical assumptions and conventions
See `docs/REPRODUCIBILITY.md` and manifest `unitConventions`: CIAAW conventional weights, reduction potentials vs SHE (never scaled), Vm = in − out, HH modern convention at 6.3 °C with RK4 dt 0.01 ms, 2.5/1.5 P/O, SI units. ε₀, μ₀, particle masses remain labelled CODATA 2018 (differ from 2022 by < 2 × 10⁻⁹ relative; not updated, tested against NIST 2022 to that tolerance).

## 19. Reproducibility manifest
`scripts/reference/stage27/reproducibility-manifest.json` (hand-authored; hashes of reference files; statuses checked against the registry by `reproducibilityManifest27.test.mjs`, 7/7), `docs/REPRODUCIBILITY.md`. No runtime or test dependency on the network; downloaded data are test fixtures only.

## 20. Resource observations
All suites sequential, one Chrome at a time; build never overlapped a browser. Browser run times: Stage 15 50 s, 16 152 s, 22 249 s, 23 214 s, 25 293 s, 26 426 s, 21 63 s, 18 303 s. Foreground `tsc` once exceeded the 120 s tool limit and was run in the background. No task-owned processes left.

## 21. Local commits (not pushed)
- `9e5df2d` CIAAW corrections, stable HH rates, potential cross-check, reference cases
- `759a8ba` provenance verification (Biology, two biochemical claims)
- `bea877e` evidence panel on 12 workspaces, registry validation, browser check
- `7cb8af8` Stage 15/16 stale assertions replaced
- the final commit (manifest, reproducibility note, manifest test, this handoff): see `git log -1`

## 22. Final git status
Only the five long-standing untracked files remain; `stash@{0}` preserved.

## 23. Recommended Stage 28
1. Open primary sources for what remained unverified: CRC/Bard potentials, HH 1952 via a library copy, one textbook chapter for ketogenesis, carnitine and the urea cycle.
2. Offer an alternative OpenStax ion-concentration preset and show E_Cl sensitivity in the membrane tool.
3. Add independent reference cases for trafficking routes and licensing; verify COPI, M6P and Fas/DISC.
4. Optionally update CODATA labels to 2022 and add temperature-corrected E°.
