# Stage 18 handoff — Metabolic pathways and regulation

## 1. Verified starting checkpoint
Branch `stage10-ui-overhaul`, HEAD `d79db7c` (Stage 17 final) with these untracked files, all unrelated and preserved: `CLAUDE.md`, `stage5-changes.patch`, `stage5-status.txt`, `scripts/benchmarks/stage9m/rd-probe.mjs`, `scripts/tests/.probe-names.mjs`. No task-owned processes were running. Node v24.21.0.

## 2. Metabolic architecture
`src/utils/biochem/metabolism/`:
- `network.ts`: one curated network of 34 metabolites, 29 enzymes, 28 reactions, 5 pathways, 5 compartments (cytosol, matrix, intermembrane space, inner membrane, ER lumen) and 16 curated regulatory effects. Reactions carry stoichiometry, direction, reversibility, compartment and pathway roles with per-glucose multiplicity. A reaction is described once and may play several roles (malate dehydrogenase: forward in the cycle, reverse in gluconeogenesis; succinate dehydrogenase is complex II). `validateNetwork()` reports duplicate ids, unknown references, bad coefficients, unavailable compartments, non-contiguous pathway steps and any reaction that does not balance for atoms and charge. A test feeds it three deliberately broken reactions.
- `ledger.ts`: net equations, carrier ledgers, glucose totals, futile-cycle costs; all from stoichiometry × multiplicity.
- `regulation.ts`: curated qualitative effects, tendency combination, scenarios, substrate cycles.
- `etc.ts`: respiratory-chain topology, proton stoichiometry, inhibitor/uncoupler outcomes.
- `learning.ts`: Practice questions, predict-then-reveal challenges, map scenarios.
Bookkeeping convention (stated in the UI and tests): neutral acid forms, NAD⁺ as a cation, explicit H⁺ and H₂O. With it every reaction balances and pathway sums reproduce the textbook net equations. At cellular pH most species are ionized; that changes proton bookkeeping but not carbon, phosphate or electron accounting.
Structures: only metabolites with a verified structure are drawn (RDKit; open-chain forms for sugars so the carbon chain is visible). RDKit confirms each formula (InChI) and each CIP label against independently known configurations (D-glucose 2R,3S,4R,5R; D-fructose 3S,4R,5R; D-glyceraldehyde 3-phosphate, 1,3-BPG, 3PG, 2PG R; L-malate S; fumarate E); isocitrate is drawn without stereochemistry and says so. CoA derivatives and nucleotides have no structure and are shown schematically.

## 3. Glycolysis
Ten reactions in cytosol, step-through with Next/Back/Play/slider, any arrow or list item selectable, ×2-per-glucose markers after aldolase, reaction cards (equation, enzyme, EC, compartment, cofactor chips with signs, substrate/product structures), metabolite identity cards, cumulative ATP/NADH ledger, energy view (invested 2, made 4, net 2, 2 NADH; cumulative chart; investment vs payoff tables; net equation), regulation view.

## 4. Gluconeogenesis
14-reaction route (pyruvate carrier → PC → MDH2 → malate carrier → MDH1 → PEPCK → reversed glycolytic steps → FBPase-1 → PGI → G6Pase) with matrix/cytosol/ER compartments. Compare view: one diagram with glycolysis-specific (amber), bypass (violet) and shared reversible (teal, double-headed) connectors; bypass table (HK→G6Pase, PFK-1→FBPase-1, PK→PC+PEPCK); energy contrast (glycolysis +2 ATP vs gluconeogenesis −4 ATP −2 GTP −2 NADH); futile-cycle explorer (each cycle wastes one NTP, computed from the same reactions); text states glycolysis and gluconeogenesis are not exclusive in every cell. Assumptions disclosure explains the malate-shuttle NADH accounting.

## 5. Pyruvate oxidation
PDH reaction card, a five-stage complex diagram (E1/TPP, lipoamide, E2/CoA, E3/FAD, NAD⁺) with CO₂ loss and C3 → C2 bookkeeping, regulation panel (acetyl-CoA, NADH, ADP; labelled indirect/covalent).

## 6. Citric acid cycle
Eight reactions on a ring, one or two turns, per-step carriers, oxaloacetate regeneration, carbon COUNTS (not atom identity; the page states the CO₂ released in a turn comes from oxaloacetate-derived carbons, not the acetyl carbons of that turn). Per turn: 3 NADH, 1 FADH₂, 1 GTP, 2 CO₂. Per glucose: pyruvate oxidation (2 NADH, 2 CO₂) and cycle (6 NADH, 2 FADH₂, 2 GTP, 4 CO₂) shown in separate rows, totals 8 NADH / 6 CO₂, no double counting.

## 7–8. Electron transport and oxidative phosphorylation
Mitochondrion diagram (complexes I–IV, Q, cytochrome c, O₂, ATP synthase), donors NADH/succinate/both, electron markers that stop at a blocked complex, proton labels only where complexes pump, relative gradient dots, ATP synthase flow, selectable parts. Stoichiometry: I 4, II 0, III 4, IV 2 → NADH ≈ 10, succinate ≈ 6 H⁺ per pair; ATP estimate = H⁺ ÷ 4 (≈ 2.5 and 1.5), labelled estimates. Yield view: 32 ATP (malate–aspartate) or 30 (glycerol-phosphate) per glucose, stated as estimates. Conditions: rotenone, malonate, antimycin, cyanide, oligomycin, uncoupler, low oxygen; outcomes table (electron flow, O₂ use, pumping, gradient, ATP synthesis, heat) plus redox-crossover for blocked routes.

## 9. Integrated metabolic map
Pathway-level SVG map (glucose → glycolysis → pyruvate → pyruvate oxidation → acetyl-CoA → cycle → carriers → electron transport → ATP, with gluconeogenesis and the OAA link) and a reaction-level view listing every reaction by pathway. Selecting a metabolite (map, list or dropdown) opens the same identity card used elsewhere. One energy-carrier ledger (shuttle selectable). Ten scenarios; each statement is tagged stoichiometry / curated regulation / respiratory model / not modelled. Open-pathway buttons navigate to the individual tools.

## 10. Regulatory interactions
Curated: ATP, AMP, fructose 2,6-bisphosphate, G6P on HK/PFK-1/PK; F2,6BP, AMP on FBPase-1; acetyl-CoA on PC; acetyl-CoA, NADH, ADP on PDH (covalent/indirect); ADP, ATP, NADH on IDH; NADH on α-KGDH and citrate synthase. Each effect is labelled direct allosteric, product feedback or indirect (covalent). Labels: higher / lower / reference / uncertain, defined once in the UI (direction relative to an all-normal reference; opposing signals give "uncertain"). No rate or flux is computed.

## 11. Molecular and enzyme integration
Reuses `MoleculeSvg` and the local RDKit loader; the same enzyme and metabolite identities appear in every tool. The Stage 17 Michaelis–Menten engine is not used or implied to model the network.

## 12. Explore / Practice / Challenge
Explore: labelled diagrams, reasons in disclosures. Practice: enzyme names hidden until Reveal labels, generated questions with explanations. Challenge: predict first (regulatory direction, scenario verdict, inhibitor outcome, next cycle enzyme, map scenario), then Reveal applies the state to the diagram. All answers are computed from the shared modules (test: independently known answers + consistency).

## 13. Persistence and navigation
New group "Metabolism"; tools `bcGlycolysis`, `bcGluconeogenesis`, `bcTca`, `bcEtc`, `bcMetabolism`; saved pages `glycolysis`, `gluconeogenesis`, `tca`, `etc`, `metabolism` (subject Biochemistry). Inputs saved: mode, view, step/turns, selected reaction/metabolite/pathway, signals, scenario, donor, condition, shuttle, challenge index. Validators reject unknown ids, out-of-range steps, malformed signals and never coerce; derived summaries are rebuilt on open. Autosave/reopen verified in the browser for all five; earlier-subject and Stage 17 records coexist (tested).

## 14. Assumptions and sources
Textbook-level accounts (Lehninger *Principles of Biochemistry*, Berg/Tymoczko/Stryer *Biochemistry*, Nelson & Cox) for reaction sequences, enzymes, regulation and the 10/6 proton and ≈ 2.5/1.5 ATP conventions. These were written from knowledge of those texts; I did not re-open the books during this session, so values were checked for internal consistency and independently typed test expectations, not against a physical citation. No ΔG values are shown (deliberately, to avoid unverified numbers). The water/H⁺ counts depend on the neutral-acid and CO₂ (not bicarbonate) conventions, which differ from some textbooks.

## 15. Supported and unsupported
Supported: per-glucose stoichiometry, net equations, ATP/GTP/NADH/FADH₂/CO₂ ledgers, compartments, reversible vs irreversible steps, qualitative regulation, qualitative respiratory scenarios, estimated ATP yield. Not supported (stated in the UI): rates, concentrations, time courses, tissue-specific fluxes, lactate/fermentation, other substrates (fatty acids, amino acids), glycogen, PPP, ΔG, proton leak magnitudes, ATP-synthase reversal, alternative oxidases, individual-carbon-atom tracing.

## 16. Scientific test results
`biochemMetabolism18` 57/57 (network integrity, glycolysis, regulation, gluconeogenesis, cycle, respiratory chain, integrated network, RDKit structures). `biochemPlatform18` 18/18. Stage 17 biochem tests unchanged and passing (56/56 across the four files). Combined sequential run of all biochem tests plus Biology/Physics/General Chemistry platform, persistence and Saved Analyses suites: 501/501. Expectations were typed independently of the code (hand-derived equations, textbook sequences, proton counts); the tests also check that the validators reject deliberately broken data.

## 17. Browser verification and visual inspection
`scripts/browser/stage18LiveCheck.mjs`: 108/108 against the production build (headless Chrome, one browser at a time), covering overview/navigation, glycolysis progression/ledger/regulation, gluconeogenic bypasses and comparison, fed/fasting scenarios, pyruvate oxidation, cycle turns and accounting, respiratory chain (NADH vs succinate, cyanide, rotenone, uncoupler, oligomycin, yield, shuttle), integrated map, Explore/Practice/Challenge, save/reopen/autosave for five tools, light/dark × 1440/820/375 for five pages, and other subjects' navigation. Stage 17 regression `stage17LiveCheck.mjs`: 90/90 (tab/overview expectations updated for the new tools).
Screenshots in `node_modules/.cache/pc-live18` were opened and inspected. Defects found by looking, not by assertions, and fixed: diagrams rendering at about 60% scale because the SVG shrink-wrapped to its minimum width (fonts were about 8 px); overlapping labels (triose names, PEPCK/MDH1/malate-carrier labels, ×2 note overlapping a node, ATP label colliding with the O₂ box, uncoupler leak arrow crossing coenzyme Q, "OAA regenerated" and "reoxidized" labels hidden behind nodes); oversized arrowheads on the cycle. Also fixed: seven assertions of my own script that wrongly matched case-sensitively against CSS-uppercased headers. Representative existing Stage 17 diagrams were not re-inspected visually beyond the passing regression run.

## 18. TypeScript, build, lint
`npx tsc -b` clean; `npm run build` succeeds (existing >500 kB chunk warning only); ESLint on all changed source files clean (the repository-wide lint was not run).

## 19. Resource and performance observations
Everything ran sequentially (`--test-concurrency=1`, one Node process at a time, one headless Chrome at a time); no memory problems occurred. The 501-test sequential run took about 84 s. The full repository suite was not run.

## 20. Known defects and limitations
- On a 375 px phone the wide diagrams (lane, cycle, chain, map) scroll sideways inside their frame (minimum widths 440–760 px) with a hint and the selected part scrolled into view; the whole map is not visible at once. The reaction-level view of the map is the compact alternative.
- Pyruvate oxidation and the cycle share one tool; the map's "Open" button for either goes to it.
- Saved state does not include the diagram's horizontal scroll position or the transient metabolite card.
- Oxaloacetate and malate appear in both compartments as separate nodes in the gluconeogenesis diagram; the pyruvate carrier is drawn as a connector, not a catalytic reaction.
- Regulation tables use directions only; magnitudes, hormones and tissue differences are described in text.
- Respiratory outcomes assume a coupled, schematic mitochondrion; heat is shown only as normal/rises.

## 21. Local commits (nothing pushed)
- `aec5c76` shared metabolic network, ledger, regulation and respiratory-chain models + independent scientific tests (Phase A/K)
- `52aa0a3` five pathway tools, persistence, navigation, overview, styles (the registry, App wiring and pages land together because they share the route table, so the glycolysis/gluconeogenesis, cycle, chain and map UI are one commit rather than four)
- `9c5d906` Stage 18 platform tests and updated registry assertions
- `c00774f` live-browser check, Stage 17 check update, subject docs
- the commit containing this handoff follows (see `git log`)

## 22. Final Git status
Branch `stage10-ui-overhaul`; only the five long-standing unrelated untracked files remain (`CLAUDE.md`, `stage5-changes.patch`, `stage5-status.txt`, `scripts/benchmarks/stage9m/rd-probe.mjs`, `scripts/tests/.probe-names.mjs`).

## 23. Recommended Stage 19 scope
1. Fatty-acid β-oxidation and ketone bodies feeding acetyl-CoA, with the same ledger and regulation conventions.
2. Glycogen metabolism and the pentose phosphate pathway, closing the glucose-6-phosphate hub.
3. Lactate fermentation and the Cori cycle (NAD⁺ regeneration without oxygen), connecting directly to the hypoxia scenario.
4. A phone-first pathway layout (vertical, one pathway section at a time) to replace sideways scrolling.
5. Citations: add per-reaction/regulation source fields to the network and a visible references panel.
