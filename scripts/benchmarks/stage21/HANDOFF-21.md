# Stage 21 handoff: Physics — Waves & sound, Geometric optics, Interference & diffraction

## 1. Starting state
Branch `stage10-ui-overhaul`, HEAD `680829a` (Stage 20 docs). The previous session stopped on an expired login, not on a failure. Uncommitted work found: `src/utils/physics/waves.ts` and `scripts/tests/physicsWaves21.test.mjs` (kept and committed). Untracked files preserved and not committed: `CLAUDE.md`, `stage5-changes.patch`, `stage5-status.txt`, `scripts/benchmarks/stage9m/rd-probe.mjs`, `scripts/tests/.probe-names.mjs`. Stash `phase1-synthesis-reliability` untouched (never used `git stash`). Nothing pushed. Node v24.21.0. All heavy commands were run one at a time.

## 2. Wave model check (the resumed work)
The unfinished shell process was a stale `tsc`; no stuck process remained. The first run of the wave tests showed one failure that was a wrong hand-derived expectation in the test (a left-moving wave at x = 1 m, t = 0.125 s is a trough, −0.1 m, not 0); the model was right. Doppler wavefront counting is validated two independent ways: a bisection time-of-flight calculation against the formula for six source/observer cases, and the dimensionless wavefront-arrival picture against the ratio f′/f. Longitudinal model: density ratio 1/(1+∂s/∂x), particles stay in order up to A = 0.15 λ, mass-conservation check passes. 48/48.

## 3. What was built
- **Models (pure, SI/cm):** `waves.ts` (traveling wave, superposition classification incl. true vs partly standing, beats, string/open/closed resonators, Doppler with supersonic refusal), `optics.ts` (thin lens, spherical mirror, principal-ray construction, Snell/TIR), `interference.ts` (N-slit far-field intensity, missing orders, grating, dispersion, Fresnel-number refusal).
- **Learning:** `waveOpticsLearning.ts`: lessons quoting the model's numbers, predict-then-observe scenarios, and 15 design challenges with pure checks, hints and worked solutions.
- **Pages:** `WavesPage` (four views), `OpticsPage` (lenses/mirrors with draggable, keyboard-operable object; refraction), `InterferencePage` (slit schematic, colour fringe strip, intensity graph with draggable probe), diagrams in `WaveDiagrams.tsx`, `OpticsDiagrams.tsx`, `InterferenceDiagrams.tsx`, shared `ChallengePanel.tsx`.
- **Modes:** Explore (lessons), Practice (predict, then observe), Challenge (reach a target; live check). `LearningModeSwitch` gained an optional `blurbs` prop so Challenge/Practice describe what they do here.
- **Navigation:** new "Waves & optics" tool group between Mechanics and Electricity; three tabs, routes `#/physics/waves-sound`, `geometric-optics`, `interference-diffraction`; icons; Physics overview cards; planned list now says "Thin-film interference and polarization" instead of "Waves and optics".
- **Concept search:** six concepts (waves/beats, standing waves, Doppler, lenses and mirrors, refraction/TIR, interference/diffraction) plus three relations (including Waves → Organic Spectroscopy with a caution); each page shows Related concepts.
- **Persistence:** three new saved page types with strict validators (`validateWavesInputs`, `validateOpticsInputs`, `validateInterferenceInputs`), registered in the library, openable from Saved, autosaved. Validators reject, never coerce (bad view, saved time beyond the axis of the view, supersonic speeds, even closed-pipe harmonics, a ≥ d, far-field violation, probe off the screen).
- **Honest limits built in:** an object at the focal point is "no image / at infinity"; supersonic Doppler and near-field slits are refused with the reason; amplitude above 0.15 λ refused; assumptions panel on each page.

## 4. Tests (all run here)
| Suite | Result |
|---|---|
| `physicsWaves21` | 48/48 |
| `physicsOptics21` (lens/mirror vs ray construction, Snell/TIR, single/double slit, grating) | 51/51 |
| `physicsPlatform21` (navigation, persistence tampering, summaries, scenarios vs hand values, challenge solutions and wrong setups) | 25/25 |
| Earlier platform/library/concept suites (13, 14, 11, 12, 15, 16, 17, library pages, concept search/relations) after updating their hard-coded Physics lists | 261/261 |
| `tsc` (`tsconfig.app.json`) and `npm run build` | clean; only the existing chunk-size warning |
| ESLint on every changed/new source file | clean |
| Real browser `scripts/browser/stage21LiveCheck.mjs` (production build, headless Chrome) | 79/79 |

Independent checks found and fixed real defects: a wrong particle-speed measure in a Practice scenario (phase made the velocity zero), a challenge the defaults already satisfied, a misleading "negative: inverted" note on upright images, Greek letters turned into capitals by the figure-label stylesheet (λ→Λ, ω→Ω), an unreadable spiky density curve, and a three-line group label in the tab bar.

Browser checks cover: navigation and overview, play/pause/scrub, longitudinal and transverse views, every superposition preset, closed-pipe odd harmonics and resonance, Doppler values and refusal, Practice/Challenge flows, keyboard object and probe movement, save then reopen from Saved, autosave across reload, TIR, missing orders, grating, far-field refusal, no overflow at 390/820/1440 px in light and dark and at 375 px for nine extra states, reduced motion (Step replaces Play), no uncaught exceptions. Screenshots (`node_modules/.cache/pc-live21`) were opened and inspected.

## 5. Full `npm test` — not clean, not caused by this stage
I ran the whole suite once (concurrency 2). It did not finish cleanly: it was stopped by me after hours of stalled organic-engine suites. Failures seen were in `speciesPool` (0.6 ms, a suite-level failure), "the Reactions page shows enantiomeric mixtures honestly" and "defects found by the held-out benchmark (Stage 9D)" (both after 690 s and 2,669 s, i.e. timeouts). No file under `src/utils/reactions` or `src/utils/nomenclature` was touched by this stage. `speciesPool.test.mjs` run alone passes 33/33. The other two were **not** re-run individually, so I cannot say they pass; treat them as unverified, probably load-related, and re-run them alone.
Repository-wide lint was not run (only changed files).

## 6. Limitations
- Waves: linear lossless medium, no damping, no 2-D/3-D waves, no end correction, displacement (not pressure) is drawn. Doppler for subsonic motion along one line only.
- Optics: single thin element, paraxial, real objects only, no aberrations, no Fresnel reflectance; vertical scale of the ray diagram is exaggerated (stated on the diagram).
- Interference: monochromatic, identical rectangular slits, far field only (Fresnel number ≤ 0.5), no thin films or polarization. Screen colour is a display aid; brightness is drawn as √(I/I₀).
- The Doppler diagram is empty at t = 0 (it says to press Play); a challenge status has no stored progress by design.
- Offline: no network code was added (a test asserts it); offline mode itself was not separately exercised.

## 7. Commits (local only, not pushed)
- `ab8214a` models and independent tests
- `37b99c6` the three laboratories, wiring, persistence, concepts, earlier tests updated
- `6a9c45e` visual fixes, live-browser scripts
- this handoff is committed separately as the final commit (see `git log`)

## 8. Final Git status
Branch `stage10-ui-overhaul`. Untracked and preserved: `CLAUDE.md`, `scripts/benchmarks/stage9m/rd-probe.mjs`, `scripts/tests/.probe-names.mjs`, `stage5-changes.patch`, `stage5-status.txt`. Stash `phase1-synthesis-reliability` still present. Working tree otherwise clean.
