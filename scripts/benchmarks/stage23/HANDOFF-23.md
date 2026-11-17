# Stage 23 handoff: Membranes & transport, Cell signaling, Neuronal physiology

Branch `stage10-ui-overhaul`. Nothing pushed. Stage 24 not started.

## 1. Verified starting checkpoint
HEAD `7f01392` (Stage 22 handoff), branch `stage10-ui-overhaul`. Working tree held only the five long-standing untracked files (`CLAUDE.md`,
`scripts/benchmarks/stage9m/rd-probe.mjs`, `scripts/tests/.probe-names.mjs`, `stage5-changes.patch`, `stage5-status.txt`), left untouched and unstaged. The
historical `phase1-synthesis-reliability` stash was not touched. Stage 22 disclosure preserved: the atomic-mass and reduction-potential datasets remain
**unverified against primary tables**; Stage 23 does not use either (its constants are R and F, the exact CODATA values).

## 2. Membrane transport models (`utils/biology/membrane23.ts`)
Nernst with signed valence, `Δμ_in = zF(Vm − E)` with its chemical (−E) and electrical (Vm) parts, GHK for K⁺/Na⁺/Cl⁻ (constant field, zero net current,
no pump current), temperature 0–50 °C, concentrations 1e-6–2000 mM, all validated. Ion explorer (Na⁺, K⁺, Cl⁻, Ca²⁺) with a voltage ladder.

## 3. Active and passive transport
Passive: simple diffusion `J = P·ΔC`, channel (same law for neutral solutes), symmetrical saturable carrier `Jmax([S]o/(Km+[S]o) − [S]i/(Km+[S]i))`;
ions are decided by the electrochemical balance and no ion flux magnitude is claimed. Tests prove no passive mechanism moves a neutral solute uphill and
no model uses ATP. Active: eight-step Post–Albers Na⁺/K⁺-ATPase cycle (3 Na⁺ out, 2 K⁺ in, 1 ATP; E1 → E1~P → E2~P → E2; net +1 charge out; ouabain and
no-ATP stall points); SGLT1 2 Na⁺ : 1 glucose symport with ΔG per cycle and the thermodynamic accumulation limit, explicitly without ATP at the
cotransporter; a transporter classification table (NCX listed only as a classified antiport, not computed).

## 4. Osmosis and tonicity
Osmolarity (all solutes) and tonicity (impermeant solutes only; NaCl counts 2 and is effectively impermeant, sucrose impermeant, urea permeant) are separate
outputs, with an explicit "they disagree" case (300 mM urea). Initial water direction comes from tonicity. Idealized Boyle–van 't Hoff volume
`V/V₀ = inside/outside impermeant` only for 0.5–2×; outside that no volume is reported (no unlimited swelling, no rupture).

## 5. Cell-signaling pathways (`signaling23.ts`)
Mechanism graphs with derived states (on, off, blocked, attenuated, persisting) for: Gs → AC → cAMP → PKA; Gi (with an optional Gs co-stimulus; Gαi opposes
rather than raises cAMP); Gq → PLC-β → IP₃/DAG → Ca²⁺/conventional PKC; EGFR → Grb2/SOS → Ras → Raf → MEK → ERK; nicotinic ligand-gated channel; nuclear
steroid receptor. G proteins show named GDP/GTP states. Phases: ligand present, prolonged (feedback attenuates), ligand removed (persistence only where
termination is blocked or a node is constitutive).

## 6. Signal perturbations
Block or constitutive perturbations (≤ 3, contradictions rejected): receptor cannot bind, GDP/GTP exchange blocked, GTPase-deficient Gα, AC/PLC/PKC/PKA/Raf/
MEK/EGFR-kinase inhibitors, PDE/phosphatase/GAP/DUSP/IP₃-degradation/pump blocks, constitutive Ras. Consequences are diffs of the graph; downstream
phenotypes are explicitly not predicted.

## 7. Neuronal electrical model (`neuron23.ts`)
Resting potential from the shared GHK engine; passive RC membrane `C dV/dt = I − (V−Vrest)/R` (closed form, checked against an independent RK4 in the tests;
τ(ms) = R(MΩ)·C(pF)/1000), with the Physics RC analogy stated and its limits.

## 8. Action-potential demonstration
Approach A: Hodgkin–Huxley squid giant axon at 6.3 °C, fixed parameters, RK4 dt 0.01 ms; only stimulus, a second pulse, and TTX-/TEA-like blocks vary.
Phases (rest, depolarization, rising, repolarization, AHP, recovery) are detected from the trace; channel gates m, h, n and conductances are inspectable at any
time. Threshold finder and a measured refractory profile (absolute: no spike up to 400 µA/cm²; relative: stronger stimulus; recovered). Calibration
facts (from the model, asserted as properties): peak ≈ +40 mV < E_Na, AHP ≈ −76 mV between rest and E_K, 1 ms threshold ≈ 6.9 µA/cm².

## 9. Synaptic transmission
Nine ordered stages (AP arrival, voltage-gated Ca²⁺ channels, Ca²⁺ entry, fusion, release, diffusion, receptor, response, clearance); examples: glutamate/AMPA,
GABA_A (Cl⁻ reversal from the intracellular Cl⁻ you set), ACh/nicotinic, ACh/M₂-GIRK. Polarity from reversal potential vs Vm; excitatory/inhibitory from
reversal vs an assumed threshold. Conditions: Ca²⁺-channel block, receptor block, clearance block. Linear summation of PSPs in one RC compartment; reaching the
assumed threshold is never described as firing.

## 10. Interactive diagrams
SVG, fixed paper colours, selectable groups (click, Enter/Space), `role="img"` summaries generated from state. Membrane: bilayer (heads, kinked/straight tails,
cholesterol, 9 selectable components), passive scene with driving-force panel, ion scene + voltage ladder, pump (conformation, bound ions, P, ATP/ADP/Pi,
moved ions), SGLT1, osmosis. Signaling: node graph with state symbols and words (● ○ ✕ ◐ ↻), hatched blocked nodes, inhibition/termination/feedback bars;
at ≤ 600 px a focused ordered list of event cards instead. Neuron: anatomy, propagation, channel-gate diagram synced to the trace, synapse, charts
(voltage with phase bands, gates, conductances, passive, summation).

## 11. Explore / Practice / Challenge
All three tools. Practice questions and Challenge predictions (`bioLearning23.ts`) are built from the same engine calls that draw the diagram; Challenge
commits first and then applies the change. Tests check answers against hand-derived values (E_K −95 mV, E_Ca +131 mV, τ 10 ms, hypotonic water in, etc.).

## 12. Cross-subject connections
18 searchable concepts (plasma membrane … synaptic transmission) and 12 relations: Membranes ↔ Electrochemistry, Membranes → Metabolism, Neuron ↔ Physics RC
transient, Neuron ↔ Membranes, Neuron ↔ Signaling, Signaling → Enzymes, Signaling ↔ Gene regulation. Every relation carries a caution; no numbers are
transferred between tools. (Fixed during the run: a banned "equivalent to" wording in the RC relation.)

## 13. Persistence
Pages `membrane`, `signaling`, `neuron` (engine v1) in the Biology Saved Analyses architecture: section, mode, challenge index, ions/concentrations, mechanism,
selected protein, pump/SGLT step and perturbation, pathway, ligands, phase, step, perturbations, selected node, all neuron parameters, cursors, synapse and
summation state. Validators reject: unknown ids, out-of-range values, pump step beyond what a perturbation allows, proteins not allowed in a section, summation
R/C/rest not matching the passive membrane, manual-voltage resting state, contradictory perturbations. Derived results are rebuilt on open. Existing records
of all five subjects open unchanged.

## 14. Scientific assumptions and simplifications
Ideal solutions; illustrative typical mammalian concentrations and permeability ratios (1 : 0.04 : 0.45); ordinal five-step fluidity; symmetrical carrier;
GHK limits stated on screen; HH is one preparation; propagation counts regenerative sites (13 vs 5 over the same length) without velocities; summation is
linear with 2 ms synaptic decay; on/off pathway states with no kinetics.

## 15. Unsupported scenarios
Arbitrary lipid compositions; quantitative fluidity; ion flux magnitudes; osmotic volume outside 0.5–2× or with walls/volume regulation; arbitrary pathways or
user-named molecules; amplification factors; downstream phenotypes; mammalian or temperature-scaled action potentials; other ion channels; conduction velocity
or failure; dendritic geometry, shunting and synaptic kinetics; per-vesicle or stochastic release.

## 16. Independent scientific test results
| Suite | Tests |
|---|---|
| `biologyMembrane23` | 66 |
| `biologySignaling23` | 46 |
| `biologyNeuron23` | 49 |
| `biologyPlatform23` | 25 |
All 186 pass. Expected values are hand-derived or from independently typed closed forms: base-10 Nernst slope (61.5 mV/decade at 37 °C), GHK −69.1 mV by hand,
SGLT ΔG = 2(RT ln 12/145 + F·(−0.06)) = −24.4 kJ/mol, textbook HH rate functions and resting gates (m 0.053, h 0.596, n 0.318), an independent RK4 of the RC
equation, physical bounds (peak < E_Na, AHP > E_K), dt-halving stability (< 0.5 mV), absolute/relative refractory behaviour, and the textbook pathway logic.
Existing suites rerun and passing: biologyRegulation16 (34), Genetics16 (30), Division16 (32), Processes15 (50), Code15 (28), biologyPlatform15 (22) and 16 (24),
analysisLibraryAllPages (25) and Pages (28), conceptSearch19 (28), conceptRelations19 (19), generalChemPlatform11/12/22 (26/19/69), physicsPlatform13/14/21
(27/18/25), biochemPlatform17/18 (25/18), persistence (39), uiPolish (14). Eleven registry/enumeration assertions were updated for the new pages and group
(`analysisLibraryAllPages`, `analysisLibraryPages`, `biologyPlatform15/16`, `biochemPlatform17`, `generalChemPlatform11/12`, `physicsPlatform14`).

## 17. Browser verification and screenshot inspection
`scripts/browser/stage23LiveCheck.mjs` (headless Chrome, production build): **150/152** on the full run, no page exceptions. The two failures were bad
check expectations, both fixed in the script and verified by `scripts/browser/stage23Quick.mjs` (**7/7**, which also confirms the phone fix below): a
selector that matched the new receptor list instead of the event list, and a stale panel title. Covers navigation, bilayer selection and fluidity, passive
diffusion (O₂, glucose carrier, K⁺ against its concentration gradient at −120 mV), Nernst values and valence, GHK, the pump step by step and with ouabain,
SGLT1, four osmosis cases, GPCR Gs/Gi/Gq differences, RTK stepping, inhibitor/PDE/constitutive-Ras cases, anatomy, resting potential, RC τ, HH spike,
phases/channel states, threshold, TTX-/TEA-like blocks, refractory table, propagation, synapse (AMPA, GABA_A with 8 and 30 mM Cl⁻, M₂), summation,
Explore/Practice/Challenge on all tools, save → reopen of all three tools, concept search and related links, 3 tools × (1440, 820, 375) × (light, dark),
reduced motion, and Physics/General/Biology regressions.
Screenshots inspected (`node_modules/.cache/pc-live23`, git-ignored). Defects found by inspection and fixed: "tails"/"cholesterol" labels overlapping;
the passive driving-force panel overlapping the membrane and its own text; ion/protein labels crossing arrows; "3 Na⁺ moved out" label over the pump; pump
step numbering disagreeing with the slider (now "Step n of 7"); the action-potential voltage chart shaded across its whole width (now only rising →
AHP); channel-diagram labels under arrows; hillock label touching the soma and cleft/postsynaptic labels colliding; synapse labels on the frame border;
the CYTOSOL label under a terminator node; and a **real 244 px horizontal overflow at 375 px** from the receptor-class table (now a card list on phones, and
tables are in scroll wrappers). Phone screenshots were inspected at reduced size only, so phone text legibility was checked through the focused card view
and the layout assertions rather than pixel review.

## 18. TypeScript, build and lint
`tsc -p tsconfig.app.json --noEmit`: clean. `npm run build`: passes (~6 s). `eslint` on every changed/new path: clean. `npx eslint .`: 18 problems, all in
files untouched by this stage (KetcherFrameApp, MoleculeDrawer, SpectroscopyPage, nomenclature and reaction-engine files), the same count as Stage 15/16.

## 19. Resource and performance observations
Tests and Chrome runs were strictly sequential; no unrestricted `npm test`. One full browser run takes roughly 20 minutes of wall time on this machine
(much of it page loads and 36 layout checks). HH: one integration ≈ 4 000 RK4 steps (instant); the refractory profile runs ~150 integrations and returns in a
few seconds, so it is on demand only. Memory was not measured.

## 20. Known limitations and data-provenance issues
Typical ion concentrations, permeability ratios, the HH parameter set and the transporter stoichiometries were entered from textbook knowledge offline and
have **not** been checked against primary references in this session (same disclosure as Stage 22). The full 152-check browser run was not repeated after the
last two script fixes (only the targeted 7-check run). `ui10.test.mjs` "five branches" was already failing before Stage 15 and was not rerun.

## 21. Exact local commits
- `54e709a` feat(biology): membrane transport engine (Nernst, GHK, passive and active transport, SGLT, osmosis, bilayer) with independent tests
- `0dc3d76` feat(biology): cell-signaling engine (GPCR Gs/Gi/Gq, EGFR-MAPK, ligand-gated channel, nuclear receptor) with perturbations and tests
- `f80b044` feat(biology): neuronal physiology engine (RC membrane, Hodgkin-Huxley RK4, propagation, synapse, summation) with independent tests
- `d15b808` feat(biology): Stage 23 learning questions, challenges, summaries and strict versioned persistence
- `470e183` feat(biology): Membranes & transport, Cell signaling and Neuronal physiology tools with navigation, concept search, cross-subject links and platform tests
- `362a91f` test(browser): Stage 23 live-browser check; visual fixes from screenshot inspection; docs
- final commit: pump-step wording in summaries and this handoff (see `git log`)

## 22. Final Git status
Only the five long-standing untracked files listed in section 1; nothing staged.

## 23. Recommended Stage 24 scope
Depth over breadth: (1) verify the Stage 22/23 reference values (ion concentrations, HH constants, reduction potentials, atomic masses) against primary
tables and record the provenance; (2) a second excitability model (an A-type K⁺ or Ca²⁺ channel, or a two-compartment axon) reusing the RK4 harness;
(3) cable-theory propagation with a real length constant to replace the schematic site-counting; (4) a documented single-process browser runner with a
reduced "smoke" profile so a full Stage 23 check takes minutes, not twenty; (5) persist Practice quiz progress.
