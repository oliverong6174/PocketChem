# Stage 22 handoff: General Chemistry — Stoichiometry, Gas laws, Electrochemistry

## 1. Starting Git checkpoint
Branch `stage10-ui-overhaul`, HEAD `c2586df` (Stage 21 handoff), working tree clean apart from the preserved untracked files (`CLAUDE.md`, `stage5-changes.patch`, `stage5-status.txt`, `scripts/benchmarks/stage9m/rd-probe.mjs`, `scripts/tests/.probe-names.mjs`). Stash `phase1-synthesis-reliability` present and never touched. Two leftover background tasks from before the Stage 21 commits (a stale test-edit shell and an old `npm test`) were stopped; no task-owned node or Chrome processes remained at the end. The unrestricted `npm test` was **not** run. Nothing pushed.

## 2. Stoichiometry capabilities
`formula.ts` (separate from React): bounded grammar with element symbols (case-sensitive), integer subscripts, `( )` and `[ ]` groups (depth ≤ 6), hydrates (`·`, `.`, `*` with a leading multiplier), ionic charge (`^n+`/`^n-`, or one bare sign for ±1) and the free electron `e-`. Malformed input is rejected with a reason, never reinterpreted (documented quirk: `Fe3+` is Fe₃ with charge +1; charges ≥ 2 need `^`). `elements.ts`: 83 elements, abridged IUPAC conventional atomic weights. `stoichiometry.ts`/page: balanced-equation ledger, grams/moles/purity/solution amounts, limiting reagent(s), excess, theoretical and percent yield, molarity, dilution (refuses "dilution" to a smaller volume), reactive mixing of solutions (additive volumes, complete reaction). Page views: Balance an equation / Limiting reagent and yield / Solutions and dilution; schematic particle picture and amount-ledger bars drawn from the same `StoichResult`.

## 3. Equation-balancing algorithm
`balance.ts`: one linear condition per element plus one for charge; coefficient vector = null space of the integer matrix, found by Gauss–Jordan elimination over BigInt fractions (no floating point). Exactly one independent solution with all coefficients positive → smallest whole numbers. Otherwise no coefficients are returned: `none` (no solution), `underdetermined` (nullity > 1), `inadmissible` (a species would need coefficient 0 or to be on the other side), `invalid` (duplicate species). Manual coefficients are checked by atom and charge recount, flagged "balanced but not smallest" when applicable. It balances a supplied reaction; it never chooses products.

## 4. Limiting reagent and yield
Single reaction extent ξ = min(nᵢ/νᵢ); nᵢ(final) = nᵢ + νᵢξ; ties reported as an exact stoichiometric mixture. Percent yield = actual/theoretical × 100 for a chosen product; > 100 % is flagged as "not a chemical result" (wet/impure product, arithmetic or wrong limiting reagent), never validated.

## 5. Gas-law capabilities
`gas.ts`, SI internally (R = 8.314 462 618). PV = nRT calculator with Pa/kPa/atm/bar/mmHg, m³/L/mL, K/°C conversions; temperature must be > 0 K (Celsius never used directly). Five controlled experiments (isothermal, isochoric, isobaric, add gas at constant P,T, add gas in rigid container) each naming held-fixed/controlled/dependent variables; combined-gas invariant PV/nT = R shown at both ends. Container diagram: volume = gas width, amount = dot count, temperature = dot speed/colour (√T), pressure = gauge; dots are a schematic and the page says so. Three graphs (P–V, V–T, P–T) show the constrained process (solid) and the same law extended (dashed) with start/end markers. Ideal mixtures (≤ 5 curated gases): mole fractions, Dalton partial pressures, average molar mass, density, stacked pressure bar.

## 6. Kinetic-theory model
v_rms = √(3RT/M), mean √(8RT/πM), most probable √(2RT/M), mean translational KE (3/2)kT per molecule (independent of mass), 3-D Maxwell–Boltzmann density 4π(m/2πkT)^{3/2}v²exp(−mv²/2kT) with Simpson-integrated fractions above a draggable speed marker. Two gases at two temperatures; explanatory note on equal energy vs different speeds. Described as an ideal classical distribution, not measured data.

## 7. Electrochemical cell model
`electrochem.ts`: 28 curated half-reactions stored as reductions with E° (V vs SHE, 25 °C, 1 M/1 bar). Two couples → cathode = the couple with the higher potential under the stated conditions (concentrations can reverse the standard order; the page says so). Anode half reversed; reactions scaled to the lowest common electron count, electrons/H⁺/H₂O cancelled by exact integer net; potentials are never multiplied by coefficients. Diagram: electrodes, solutions, external wire with electron flow (anode → cathode) and conventional current (opposite), salt bridge with ion directions ("ions, never electrons"), half- and overall reactions, voltmeter. `polarity()` encodes galvanic (anode −, cathode +) vs electrolytic (anode +, cathode −) conventions.

## 8. Nernst and thermodynamic integration
E = E° − (RT/nF) ln Q with Q the overall-reaction quotient (per-compartment activities, concentrations for aq, bar for gases, pH for H⁺, solids/liquids = 1); E°cell = E°cat − E°an; ΔG° = −nFE°, ΔG = −nFE, ln K = nFE°/RT (reported as K and log₁₀K). E vs log₁₀Q graph with Q = K marker. Kinetics, overpotential and current are explicitly not modelled.

## 9. Electrolysis
Seven curated cases (Cu, Ag, Ni, Zn plating/refining; Cu with inert anode; water in acid; molten NaCl). Q = It, n(e⁻) = Q/F (F = 96 485.332 12 C/mol), product moles = (ν/n)·n(e⁻)·η, masses, ideal-gas volumes from the same gas relation at a stated T and P, thermodynamic minimum voltage (null for the molten salt). No product prediction for arbitrary aqueous electrolysis.

## 10. Interactive diagrams and graphs
Amount-ledger bars, particle picture, gas container, mixture bar, five-way P/V/T graphs, Maxwell–Boltzmann graph with marker, galvanic and electrolytic cell diagrams, E vs log Q graph, deposit-vs-time graph with draggable marker (arrow keys). Shared `LineChart`. Screenshots in `node_modules/.cache/pc-live22` were opened and inspected; layout defects found and fixed from them: ledger value/role labels overlapping, clipped container notes, flat V–T/P–T axes (kelvin range of ±4 K for a constant T), cell diagram text collisions (salt-bridge vs current arrow; electrolytic labels), duplicate "positive (positive)" terminal text, overlapping E-vs-logQ marker labels, a 60 px horizontal overflow of the gas page at 375 px.

## 11. Learning modes
Explore: lessons quoting the current numbers. Practice (all three): typed-answer or choice questions with the answer revealed only after commitment (QuestionPanel; 7 stoichiometry, 8 gas, 8 electro). Challenge: stoichiometry = predict the limiting reagent/maximum yield from a loaded setup; gas and electro = predict-then-observe higher/lower/same scenarios (`GcPredictPanel`), applicable only to the matching experiment (a mismatched scenario is refused, not invented). Mode and selected question are saved with the analysis.

## 12. Scientific assumptions and limitations
- Ideal gas and ideal mixtures only; no condensation or non-ideality warning. Particle animation is schematic.
- Stoichiometry assumes complete reaction, no side reactions; solution volumes additive; no equilibrium (use the acid–base/equilibrium tools).
- Electrochemistry: concentrations as activities; E° not temperature-corrected (a challenge says so); no polarisation, internal resistance, kinetics or power; salt-bridge ions are fixed (K⁺/NO₃⁻) and affect no numbers; curated half-reactions only (no complexation, precipitation, basic-medium variants).
- Atomic masses are abridged and rounded (4–5 s.f.), no isotopes; ion masses ignore electron mass.
- `Fe3+` parses as Fe₃⁺ (documented, shown in the parsed species table).

## 13. Reference-data sources
Atomic masses: IUPAC/CIAAW conventional abridged standard atomic weights (2013 table). Standard reduction potentials: values of the kind tabulated in the CRC Handbook ("Electrochemical Series") and Bard–Parsons–Jordan (IUPAC 1985), ±0.005 V. Constants: CODATA 2018/SI 2019 exact values (R, k_B, N_A, F). **The mass and potential tables were entered without network access and were not re-verified against the source volumes** (the app states this). Tests check them only for internal consistency (every half-reaction conserves atoms/charge by the separate parser, familiar ordering of the activity series) and against well-known values (H₂O 18.015, NaCl 58.44, Daniell 1.10 V …).

## 14. Navigation and search integration
Three tools added to General Chemistry (`#/general/stoichiometry`, `gas-laws`, `electrochemistry`), overview cards, icons, planned list updated. 9 concepts (moles/molar mass, balancing, limiting reagent/yield, ideal gas, partial pressure, kinetic theory, redox/galvanic, Nernst, electrolysis), 11 relations: Stoichiometry → Acid–base titration (and Equilibrium), Gas laws → Physics Waves and → Thermodynamics (caution: Physics has no separate thermodynamics tool), Electrochemistry → Thermodynamics, → Biochemistry electron transport (caution: not a quantitative model of oxidative phosphorylation; numbers not interchangeable), → Physics DC circuits. No numeric handoff between subjects.

## 15. Persistence
New pages `stoichiometry`, `gaslaws`, `electrochem` in the store, library and open-from-Saved maps (subject general), strict validators in `persistence/gcTools22.ts` (build new objects, reject, never coerce; recompute through the models, so contradictory records such as an unbalanced equation, wrong amount count, bad process target, T ≤ 0 K, unknown gas/half-cell/electrolysis, concentrating "dilutions", tNow beyond the run are rejected). Derived results recomputed on open; stored summary only for the integrity check. All existing page types unchanged.

## 16. Scientific tests (all run here, independent expectations)
| Suite | Result |
|---|---|
| `generalChemStoich22` (masses, grammar, 14 balancing cases, redox/charge, ties, purity, solutions) | 58/58 |
| `generalChemGas22` (molar volumes, units, laws, mixtures, rms speed, numerical MB moments, erf tail) | 30/30 |
| `generalChemElectro22` (half-reaction balance, 378-pair overall-equation conservation, Nernst, ΔG°/K, Faraday) | 39/39 |
| `generalChemPlatform22` (navigation, tampering, summaries, practice/challenge answers vs hand values, search, relations) | 69/69 |
Real defects found by these tests: gas density returned g/m³ instead of g/L (fixed), plus several of my own wrong hand values (SO₄²⁻ mass, N₂ rms at 573 K) corrected against recomputation. Earlier suites updated only for new hard-coded General Chemistry lists: generalChemPlatform11/12, analysisLibraryPages/AllPages, physicsPlatform13/14, biologyPlatform15/16, biochemPlatform17.

## 17. Browser verification
`scripts/browser/stage22LiveCheck.mjs` (production build, headless Chrome): **159/159**. Covers navigation, formula validation, balancing (incl. redox, hydrate, underdetermined, impossible), manual coefficients, limiting reagent, yield, > 100 % flag, solutions/dilution/mixing, gas laws (all views and units, absolute-zero refusal, challenge refusal), mixtures, speed graph, galvanic cell construction, anode/cathode labelling, standard and Nernst potentials, pH, electrolysis, Explore/Practice/Challenge in all three, save → reopen for all three, global search (8 queries), cross-subject links, light/dark × 1440/820/375 px for 8 states without overflow, reduced motion, no uncaught exceptions. Existing `stage12LiveCheck.mjs` (General Chemistry regression) 142/142 after updating its three hard-coded tool-count expectations. Existing Physics and Organic navigation opened in the Stage 22 script.

## 18. TypeScript / build / lint
`tsc -p tsconfig.app.json --noEmit` clean; `npm run build` succeeds (only the existing chunk-size warning); ESLint (including the strict React rules) clean on every changed or new source, test and browser file. Repo-wide lint not run.

## 19. Resource and performance observations
Everything ran sequentially; no unrestricted full test run. tsc 25–35 s, build ≈ 33 s, each model/platform suite a few seconds, Stage 22 browser script ≈ 3.7 min, Stage 12 ≈ 1 min. One build-time scare: a tsc started alongside file operations took > 400 s once and was moved to the background; it finished clean.

## 20. Known defects and unverified cases
- Reference tables unverified against source volumes (see §13).
- The two Organic suites still unverified from Stage 21 ("enantiomeric mixtures" page, Stage 9D held-out benchmark) were not run; `speciesPool` passed alone in Stage 21. Not touched.
- Offline mode not separately exercised (no network code added; a test asserts it).
- Gas calculator: changing a unit keeps the typed number (not converted).
- Electrolytic diagram is a schematic: one beaker, fixed layout; molten NaCl uses an aqueous-style Cl⁻ label for the anode species.
- A git hygiene incident: `git add scripts/tests` briefly committed the preserved untracked `.probe-names.mjs`; the three local commits were rewritten with `filter-branch` to drop it, and the file restored to the working tree from the old commit object (content identical).

## 21. Exact local commits (not pushed)
- `6cd45df` formula parser, exact balancing, stoichiometry models + tests
- `1ca3161` ideal gas, mixture, kinetic theory, Maxwell–Boltzmann models + tests
- `5cb8142` electrochemistry models + tests
- `ed1aa01` learning content, persistence, navigation, concept search; earlier tests updated
- `1781d7b` interactive workspaces (three pages, diagrams, question panel, CSS, App/overview/icons)
- `0533509` Stage 22 browser check and probe; Stage 12 browser check updated
- this handoff: committed last (see `git log`)

## 22. Final Git status
Branch `stage10-ui-overhaul`. Untracked and preserved: `CLAUDE.md`, `scripts/benchmarks/stage9m/rd-probe.mjs`, `scripts/tests/.probe-names.mjs`, `stage5-changes.patch`, `stage5-status.txt`. Stash `phase1-synthesis-reliability` present. Tree otherwise clean.

## 23. Stage 23 recommendations
Verify the atomic-mass and potential tables against the CRC/CIAAW files; add temperature-corrected E° and a basic-medium half-reaction set; add a real-gas (van der Waals) comparison view; add an optional pH link from the stoichiometry mixing view into the acid–base tool by explicit validated handoff; run the two outstanding Organic suites individually.
