# Scientific reproducibility (Stage 27)

This note explains how the scientific reference data, model assumptions and evidence statuses behind PocketChem's Chemistry, Physics, Biology and Biochemistry tools can be re-checked. It is not a certification, and passing tests is not scientific validity: tests show that code agrees with the stated reference data and hand calculations.

## What is recorded where

| Item | Location |
|---|---|
| Machine-readable manifest (reference data with SHA-256, modules, constants, unit conventions, evidence statuses, reference-case ids, test commands, recorded results, unsupported scenarios) | `scripts/reference/stage27/reproducibility-manifest.json` |
| Offline copies of retrieved reference data (tests only, never loaded at run time) | `scripts/reference/stage27/*.json` |
| Evidence statuses shown in the application | `src/utils/evidence/evidence27.ts`, `src/components/ui/EvidencePanel.tsx` |
| Biology mechanism provenance | `src/utils/biology/provenance26.ts` |
| Biochemistry provenance | `src/utils/biochem/metabolism/provenance.ts` |
| Independent reference cases | `scripts/tests/scientificReference27.test.mjs` |
| Manifest consistency test | `scripts/tests/reproducibilityManifest27.test.mjs` |
| Handoff with sources, findings, defects and results | `scripts/benchmarks/stage27/HANDOFF-27.md` |

## Three separate questions

Each evidence record answers three questions independently, because the answers differ:

1. **Kind** – reference data, textbook approximation, numerical model or curated educational mechanism. A curated mechanism is never labelled quantitative.
2. **Source status** – *source-verified*, *partly source-verified* or *not verified*. A record is only source-verified if a retrieved text with a retrieval date is listed, and the record states what that text covers.
3. **Calculation status** – whether the behaviour was reproduced by an independent calculation (values typed from a retrieved table, or closed-form hand expressions) rather than by the module under test.

A model can be calculation-checked without being source-verified (for example the Hodgkin–Huxley implementation) and a source-verified constant does not make a simplified model exact.

## Re-running the checks

All commands run offline. Do not run the unrestricted `npm test` for this purpose; run files individually.

```
node --test --test-timeout=250000 scripts/tests/scientificReference27.test.mjs
node --test --test-timeout=250000 scripts/tests/reproducibilityManifest27.test.mjs
npm run build
node scripts/browser/stage27LiveCheck.mjs
```

If a reference file changes (for example a table is re-retrieved) the manifest test fails until the SHA-256 recorded in the manifest is updated deliberately; evidence statuses in the manifest must equal those in the registry, so a manifest edit cannot upgrade a claim.

## Reference conventions

* Atomic masses: CIAAW 2024 conventional (abridged) standard atomic weights; interval elements use the single conventional value; no isotope masses.
* Standard potentials: reductions, V versus SHE, 25 °C, unit activity; never multiplied by stoichiometric coefficients. Cross-checked against a secondary compilation within 0.025 V; the CRC Handbook itself was not opened.
* Constants: R, F, k_B, N_A, e and c are exact SI values; ε₀, μ₀ and particle masses are labelled CODATA 2018 and differ from NIST's 2022 values by less than 2 parts in 10⁹.
* Membrane potential: Vm = inside − outside, mV. Hodgkin–Huxley: modern convention, rest −65 mV, squid giant axon at 6.3 °C.
* ATP equivalents: 2.5 per NADH, 1.5 per FADH₂ (a convention, not a measured yield).

## Known gaps

The original Hodgkin–Huxley paper, the CRC Handbook and the Bard–Parsons–Jordan tables could not be retrieved as text, and most Stage 26 trafficking and checkpoint mechanisms remain "not independently checked". These gaps are stated in the application and in the manifest.
