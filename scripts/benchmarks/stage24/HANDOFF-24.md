# Stage 24 handoff — Electric fields, Magnetic fields and Electromagnetic induction

Branch `stage10-ui-overhaul`. Nothing was pushed. Stage 25 was not started.

## 1. Recovered starting Git state
The previous session was cut off by an API error just before live-browser verification. On recovery:
- HEAD `4c56008` (induction engine), branch `stage10-ui-overhaul`.
- Uncommitted: the six pages/diagram files, `physicsTools24.ts`, `electromagnetismLearning.ts`, `electromagnetismSummary.ts`,
  `directionWords.ts`, `physicsPlatform24.test.mjs`, and edits to navigation, persistence, concept index, App, overview, CSS and
  thirteen existing test files.
- **No Stage 24 browser script existed** (nothing to reuse); `dist/` was already a build of those files. No task-owned browser or
  preview processes were running.
- Stash `stash@{0}` (phase1-synthesis-reliability) and the five long-standing untracked files (`CLAUDE.md`,
  `scripts/benchmarks/stage9m/rd-probe.mjs`, `scripts/tests/.probe-names.mjs`, `stage5-changes.patch`, `stage5-status.txt`) were left
  untouched. No `git reset`, `git clean` or `git stash` was used.

## 2. Existing scientific-engine commits
`fbb43f2` electrostatics, `9974c77` magnetism, `4c56008` induction (each with independent tests).

## 3. Electric fields & potential (`#/physics/electric-fields`)
Point charges (add/remove/select/move by pointer or keyboard), probe P, field vectors and lines, superposition table (per-charge force,
E and V), a test charge (F = qE, U = qV, work to infinity), equipotential contours (levels and "through P"), V along a line through P,
and a uniform-field particle laboratory (proton/electron/alpha, time slider, KE and work-energy readouts).

## 4. Magnetic fields & forces (`#/physics/magnetic-fields`)
Straight wires seen end-on (up to three, ⊙/⊗ glyphs, current reversal), current loop and solenoid on-axis fields (ideal and exact),
Lorentz force on a moving charge (vectors, table, optional E), circular/helical/E×B motion with a top view and an oblique helix, and
the force on a current-carrying conductor.

## 5. Electromagnetic induction (`#/physics/induction`)
Magnetic flux Φ = BA cosθ, Faraday/Lenz (B, A and θ changing together, open or closed loop), motional EMF (rod angle, velocity angle,
rails figures only for a perpendicular rod), rotating-coil generator, RL circuit growth/decay/reversal.

## 6. Diagrams and simulations
Every diagram is generated from the same engine functions as the readouts; each has an assistive-technology label. Time-based views
share one clock (play/step/drag). Diagram text sizes now scale on narrow screens (see section 14).

## 7. Explore, Practice and Challenge
Explore is the laboratory; Practice is the predict-then-observe panel with scenarios that quote the model's numbers; Challenge is a set
of goals checked against the live model (Electric 3, Magnetic 4, Induction 4+; none is met by the defaults).

## 8. Navigation and concept search
New "Electromagnetism" tool group between "Waves & optics" and "Electricity"; twelve Physics laboratories on the overview; concept
index entries and related-learning links (Induction ↔ Magnetic ↔ Electric, plus RC transient). Search pages: "Lenz", "motional EMF",
"generator", "magnetic flux", "Faraday" → Electromagnetic induction; "Lorentz", "solenoid", "right-hand rule" → Magnetic fields;
"Coulomb", "equipotential" → Electric fields; "inductor" → "Inductors and RL circuits".

## 9. Persistence
Strict, versioned validators (`physicsTools24.ts`); an invalid stored record is rejected with a notice and the page is not altered
(browser-verified by replacing a stored charge value with text).

## 10. Scientific assumptions and limitations
Teaching models: static point charges in vacuum; steady currents (ideal filamentary wires, ideal loop/solenoid formulas plus the exact
finite-solenoid axis field); non-relativistic motion (speed capped at 10 % of c); uniform fields; ideal components and no loop
self-inductance in the induction tool; the rails figures apply only when the rod is perpendicular to its velocity. Values were checked
against textbook formulas derived by hand in the tests and in the browser script, **not** against primary references.

## 11. Scientific test results
`physicsElectrostatics24` + `physicsMagnetism24` + `physicsInduction24` + `physicsPlatform24`: **167/167** (135 engine + 32 platform),
re-run on the final code after the last UI edits.

## 12. Platform and regression results
Sequential `node --test --test-concurrency=1` over physicsPlatform13/14/21, physicsOptics21, physicsWaves21, physicsMechanics13,
physicsCircuits13, physicsCollisions14, physicsEnergy14, physicsForces14, analysisLibrary, analysisLibraryPages,
analysisLibraryAllPages, conceptRelations19, conceptSearch19: **466/466**. A 20 000-case comparison of the changed `niceTicks` with the
committed version differed in 1 case, the degenerate float-resolution span the change targets. Not run: unrestricted `npm test`,
`ui10.test.mjs` (known failing before Stage 15), General-Chemistry/Biology suites.

## 13. Browser test results (`scripts/browser/stage24LiveCheck.mjs`, headless Chrome, production build)
- Final full run on the final build: **252/253**. The one failure was a clause in my own check (an unescaped regex); the page was correct.
  After fixing the script the induction section was re-run on the same build: **74/74**.
- The 253 checks: navigation 7, Electric fields 50 (independent Coulomb superposition at default and nondefault probes, positive and
  negative charges, add/remove, keyboard moves, test charge, equipotential circle geometry, uniform-field trajectories for
  proton/electron/alpha), Magnetic fields 41 (B = μ₀I/2πr and B = ẑ×r̂, reversal, two/three wires, loop, solenoid, Lorentz force,
  orbits/helix/E×B, conductor, Practice and Challenge), Induction 73 (flux, Faraday/Lenz with sign and sense, motional EMF, generator
  phase at 0/¼/½/¾ period, RL at several times, Practice and Challenge), robustness sweep 13 (every field of every mode set to 0, empty,
  −1, 1e9, 1e-7), layout 43 (overflow at 375/820/1440 px in both themes, every mode at 375 and 820, reduced motion), integration 22
  (save/open ×3, invalid-record rejection, concept search ×12, related-learning navigation), electric challenges 3, and 1 check for no
  uncaught page exceptions.
- Representative Stage 21 Physics regression: **79/79** (it was 76/79 until its three hard-coded navigation expectations were updated to
  the twelve-laboratory layout; the failures showed the intended new structure).
- Intermediate sections failed only where my checks were wrong (value/note text concatenation, spelling, an axis position left over
  from a previous test); each was inspected and fixed. Failures that exposed real defects are listed in section 14.

## 14. Screenshot inspection and corrections
Diagram clips (`scripts/browser/stage24Shots.mjs`) were inspected at 1440 px light and 375 px dark; layout screenshots at 375/820/1440 in
both themes were produced with overflow checks. Real defects found by running the page or inspecting it, all fixed:
1. **Page freeze**: selecting *Particle motion* hung the browser. `niceTicks` looped forever on a speed chart that is constant to
   rounding error. Fixed in `chartTicks.ts` (span guard, 200-tick cap) and in each page's axis padding.
2. **Page crash**: a zero velocity (e.g. while typing components) threw "angle with a zero vector" and unmounted the Magnetic page;
   fixed with a guarded angle (also for the conductor).
3. Electron preset left the proton's duration: the Electric tool landed in the speed-limit error state, the Magnetic tool aliased ~2000
   orbits into 400 samples; durations now rescale by m/|q|.
4. Force components of 10⁻¹⁶ N printed "(0, 0) N"; now shown in a shared SI prefix (note and table).
5. Rounding residue displayed as "6×10⁻⁷ pWb" at θ = 90°; now 0.
6. "counterclockwise" vs "counter-clockwise" inconsistency in the UI; engines unchanged, display hyphenated.
7. An open loop's diagram and alt text claimed an induced current; it now says no current flows and what the EMF would drive.
8. Overlaps: equipotential labels at one angle ("189VV"), "B = …" over arrows/windings, "F" under its arrowhead, "q(v × B)" over the tail
   terminal, motion arrows leaving the plot; fixed with staggering, relocation, padding and a paper-coloured halo (`.ph-halo`).
9. **Phone text**: CSS class `font-size` rules overrode the SVG `fontSize` attribute, so the `k` scaling in all three diagram files did
   nothing and labels rendered ≈ 6 px at 375 px. Converted to inline styles, wrapped long in-diagram notes, stacked the generator/motional
   bottom notes, capped growth at 1.15–1.5×.

## 15. TypeScript / build / lint
`npx tsc -b`: clean. `npm run build`: exit 0 on the final code. ESLint on all changed source, test and script files: clean.

## 16. Stage 23 carryover
**152/152** (earlier recovery session). Not re-run: Stage 24 changed no Biology code; the shared changes were an append-only CSS rule,
helper functions and the degenerate-case guard in `niceTicks` (also used by the shared `LineChart`; numerically equivalent on
20 000 random ranges).

## 17. Resource and memory observations
The machine reports 32 GB RAM (not 16 GB); ≈ 10 GB was free during runs. Builds and browser sessions were sequential except once: I
started a second headless session while a long run was active, it contended and the long run stalled; that run was stopped and repeated
alone. All task-owned Chrome/preview processes were terminated. An unrelated orphan, `find / -name panel_graph.pkl` (PID 29556, started
2:06 PM, parent gone, ~2 h of CPU), was already running and was **not** terminated.

## 18. Remaining unverified behaviour
- Pointer drag/touch of charges and the probe (keyboard movement was tested; pointer events were not).
- The 820 px (tablet) captures were generated and overflow-checked but not visually inspected; not every diagram was viewed in both
  themes (1440 dark was seen only for the induction/magnetic headers and the 375 dark set).
- Real-device phone legibility (headless emulation only).
- General-Chemistry and Biology suites and browser checks after the shared-helper changes; full `npm test`.
- Engines keep "counterclockwise" strings; only the display layer was normalised.

## 19. Local commit hashes (not pushed)
- `7b63513` logic: learning, summaries, strict persistence, concept links, display helpers, `niceTicks` guard
- `015da84` the three laboratory pages and diagrams, navigation, overview, CSS, defect fixes
- `614a6cf` platform test and updated existing platform tests
- `6ae2140` browser check, probe, shots; Stage 21 expectations
- the commit that adds this file (see `git log -1 -- scripts/benchmarks/stage24/HANDOFF-24.md`)

## 20. Final Git status
Clean apart from the five long-standing untracked files listed in section 1; `stash@{0}` preserved.

## 21. Recommended Stage 25
AC circuits (RLC impedance, phasors, resonance — already listed as planned) building on the RL transient and generator; or rotational
motion and torque. Carry-overs: a documented single-process browser runner (still open from Stage 23), a pointer-drag test for the
charge/probe handles, normalising sense-of-rotation wording in the engines with the tests, and a visual pass of the 820 px captures.
