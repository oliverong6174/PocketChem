# Stage 28 handoff: atomic structure, chemical bonding and molecular orbital theory

Branch `stage10-ui-overhaul`. Nothing was pushed. Stage 29 was not started.

## 1. Starting checkpoint
HEAD `2987f8d` (Stage 27 final), branch `stage10-ui-overhaul`, Node v24.21.0. Untracked and preserved: `CLAUDE.md`, `stage5-changes.patch`, `stage5-status.txt`, `scripts/benchmarks/stage9m/rd-probe.mjs`, `scripts/tests/.probe-names.mjs`. `stash@{0}` (phase1-synthesis-reliability) untouched. Explicit-file staging; no `git stash`, `git clean`, destructive reset or unrestricted `npm test`. (Two of my own unpushed commits were reworded with a non-interactive rebase to correct test counts in their messages.) The CLAUDE.md ChEBI v1/v3 preflight was not touched or re-checked: no name-lookup code changed.

## 2. Atomic quantum-number model (`quantum28.ts`)
n ≥ 1, 0 ≤ l ≤ n−1, −l ≤ m_l ≤ l, m_s = ±1/2; capacities 2(2l+1) and 2n²; shell n has n² orbitals and 2n² electron states; node counts n−l−1 and l. The explorer deliberately accepts invalid combinations and reports each broken rule. Orbitals (spatial) and states (orbital + spin) are shown separately.

## 3. Hydrogenic orbitals (`hydrogenic28.ts`)
Closed-form R_nl for 1s, 2s, 2p, 3s, 3p, 3d (Z = 1–4) and Y_lm for l ≤ 2 in a real basis (m_l = +1 → p_x/d_xz, −1 → p_y/d_yz, +2 → d_x²−y², −2 → d_xy, documented) and a complex basis with Condon–Shortley phase. Radial node radii in closed form (2s at 2/Z; 3s at (9∓3√3)/2Z; 3p at 6/Z). Density/amplitude slices on an 81×81 grid (planes xz, xy, yz), a 71³ grid giving the iso-density surface that encloses a chosen share of probability (cached), radial probability r²R². The sign colours are explicitly phase, not charge.

## 4. Electron configurations (`config28.ts`)
Z = 1–36 curated and compared with the NIST Handbook per-element tables, **all 36 match**. Aufbau (Madelung) differs from observation exactly for Cr and Cu. Ions: removal rule (highest n, then highest l) and Aufbau-filling for anions, labelled model rules; compared with NIST gas-phase +1 ions for the 34 elements with an entry: they agree except V⁺ (3d⁴), Co⁺ (3d⁸), Ni⁺ (3d⁹), which carry a visible note. The NIST pages were fetched once to `scripts/reference/stage28/nist-ground-states.json` (test data only, never imported).

## 5. Transitions and spectra
E_n = −13.605693 Z²/n² eV; photon energy, frequency (h exact), wavelength (hc/ΔE), emission versus absorption, named hydrogen series, series limits, visible range 380–750 nm (approximate screen colours). Neglected effects are stated (reduced mass ≈ 0.054 %, fine structure, relativistic, Lamb shift). Not applied to multi-electron atoms.

## 6–7. Lewis structures, formal charge, resonance (`lewis28.ts`)
30 curated species with explicit bond orders and lone pairs (H₂O, NH₃, CH₄, NH₄⁺, CO₂, HCN, N₂, O₂, CO, O₃, NO₃⁻, CO₃²⁻, NO₂⁻, SO₂, SO₄²⁻, BF₃, CCl₄, CHCl₃, CH₂Cl₂, PCl₅, SF₄, ClF₃, XeF₂, SF₆, BrF₅, XeF₄, CH₂O, C₂H₄, C₂H₂, C₂H₆). Students set bond orders and lone pairs; the model reports electron conservation, FC = V − N − B/2 (checked against an independent hand formula), octet/duet/expanded status, whether the structure equals a curated one. Resonance averages (nitrate and carbonate 4/3, ozone 1.5 with end charges −½) with the warning that contributors are not real interconverting species. SO₂, SO₄²⁻, BF₃ show alternatives, not resonance.

## 8. VSEPR (`vsepr28.ts`)
13 (bonded atoms, lone pairs) cases, 11 shapes, ideal coordinates and angles computed from direction vectors (lone pairs equatorial in a trigonal bipyramid, trans in an octahedron). Rotatable SVG with lone-pair lobes, domain outline, angle labels, text description. Real angles are not computed; only H₂O 104.5°, NH₃ ≈107°, O₃ ≈117°, CO₂ 180° appear as labelled textbook values.

## 9. Polarity and hybridisation
Schematic bond dipoles (|ΔEN|, Pauling values typed from standard tables, not retrieved) in the ideal geometry; cancellation shown for CO₂, CCl₄, BF₃, PCl₅, XeF₂, XeF₄, SF₆; never a dipole moment in debye; NF₃ and ozone named as limitations. Hybridisation sp/sp²/sp³ from the electron-domain count with σ/π counts; sp³d and sp³d² labelled bookkeeping.

## 10–11. Molecular orbitals, bond order, magnetism (`mo28.ts`)
17 homonuclear diatomics (H₂, H₂⁺, He₂, He₂⁺, Li₂, Be₂, B₂, C₂, N₂, O₂, F₂, Ne₂, N₂⁺, C₂²⁻, O₂⁺, O₂⁻, O₂²⁻). π2p below σ2p for the lighter atoms and σ2p below π2p for O₂, F₂, Ne₂; ion orderings are flagged as conventions and tested to give the same bond order and unpaired count under both orderings (B₂ and C₂ are the species whose magnetism depends on it). Occupancy checks: code per orbital, Pauli (never two same-spin electrons), Hund, Aufbau excitation, electron count. Bond order (bonding − antibonding)/2, unpaired electrons, spin multiplicity, spin-only moment. O₂ gives bond order 2, two parallel π* electrons, paramagnetic. LCAO illustration of σ1s/σ*1s from two hydrogen 1s functions (S(R) = e^−R(1+R+R²/3), normalised, tested by independent quadrature) and schematic, explicitly "not computed" p-lobe pictures.

## 12. Interactive diagrams and graphs
Orbital slice canvas with 90 %-type probability outline; radial probability LineChart with node and maximum markers; orbital box diagrams; energy-level diagram at true relative energies; spectrum strip; Lewis diagram with dots and charge labels; rotatable VSEPR picture; hybrid-orbital diagram; keyboard-operable MO diagram plus explicit ↑/↓/− controls; LCAO canvas and axial ψ/ψ² chart. All have text descriptions.

## 13. Learning modes
Explore lessons that quote current numbers, Practice (13 atomic, 11 bonding, 9 MO questions) and Challenge (6, 7, 6), all answered by the same models; every question's setup passes the strict validator, MO setups clear the diagram for the learner to fill.

## 14. Navigation and cross-subject connections
New tools after Overview: Atomic structure, Bonding & geometry, Molecular orbitals (routes `atomic-structure`, `bonding-geometry`, `molecular-orbitals`), overview cards, 19 concept-search entries (every requested term), 14 relations: atomic ↔ bonding ↔ MO, atomic → Waves/Optics/Interference, bonding → Organic Properties, Conformations, Reactions, MO → Magnetism and Organic Spectroscopy, each cross-subject link with a caution. **"Electron Configurations → Periodic Trends" was not built as a link** because Periodic trends is still only a planned item; Atomic → Bonding is the implemented substitute. No state is transferred.

## 15. Persistence and restoration
`gcTools28.ts`: pages `atomic`, `bonding`, `molorbitals` registered in the store, the library, the saved-open map and App. Strict validators reject (never coerce) bad values (dozens of tamper cases per page); the stored results are only a display summary and a check number; the page recomputes everything on restore. Browser-verified autosave restore and Saved Analyses reopen for all three.

## 16. Sources and evidence statuses (`evidence28.ts`, separate registry; Stage 27 manifest left pinned)
Retrieved 2026-11-24 and read: OpenStax Chemistry 2e 6.3, 6.4, 7.3, 7.4, 7.5, 7.6, 8.2, 8.4; NIST Handbook per-element tables (36 neutral atoms, 34 +1 ions); MIT OCW 5.111 page (landing page only: the PDF was **not** read); NIST ASD pages did not return usable data. Statuses: neutral ground-state table **source-verified**; quantum-orbital, spectra, ions, Lewis, VSEPR, polarity, hybridisation, MO diatomics **partly verified** with exactly what was and was not covered stated; LCAO illustration **not verified** (closed forms verified by quadrature). The Rydberg energy and Pauling electronegativities were typed from standard values and are stated as not re-compared. OpenStax 8.2 assigns sp³d to SeF₄; the app's caution about d-orbital hybridisation is its own and marked as not checked against a retrieved text.

## 17. Mathematical approximations
Nonrelativistic hydrogenic model with infinite nuclear mass; ideal VSEPR directions; schematic |ΔEN| dipoles without lone-pair terms; qualitative MO ordering (heights are order only); LCAO with exponent 1 at fixed R; 3-D enclosure estimated on a bounded grid (grid total within 4 % of 1, tested).

## 18. Unsupported
Orbitals beyond 3d, any many-electron orbital picture, elements beyond Z = 36, d-block anions, charges beyond −3…+8, molecules outside the 30 curated, radicals in Lewis structures, domains > 6 or the (3,3) case, heteronuclear or polyatomic MO diagrams, real dipole moments, bond energies/lengths.

## 19. Scientific tests
New: `atomic28` 64, `bonding28` 40, `mo28` 25, `generalChemPlatform28` 38 (167 total, all pass). Expectations are closed forms (normalisation, ⟨r⟩ = (3n²−l(l+1))/2Z, node radii, 3 ± √5 peaks of 2s, Unsöld sum rule, orthonormality by own quadrature, Rydberg wavelengths), hand tables or the NIST fixture. Stale exact assertions in 12 older test files (tool lists, page maps, page lists) were replaced by order-preserving invariants; `generalChemPlatform22`'s "no network" test now ignores comments (it had been failing since Stage 27 added a CIAAW citation to `elements.ts`). Affected older suites re-run: 167/167 on the five files touched, 676/681 in the first broad batch before those fixes.

## 20. Browser verification (production build, real headless Chrome, sequential)
`scripts/browser/stage28LiveCheck.mjs` **182/182**: navigation, quantum numbers (invalid combinations), orbital canvases (pixel symmetry of p_x and d_z², sign colours of p_x lobes, empty nodal-plane slice, He⁺ scale), radial graph, configurations (Fe, Cr, Cu²⁺, Fe³⁺, O²⁻, V⁺ note, Ne⁻ refusal, Aufbau build, Pauli cap), spectra (H-α 656.1 nm, Lyman-α 121.5 nm UV, absorption, He⁺, equal levels), Lewis edit/conservation/resonance/sulfate/O₂/PCl₅, nine VSEPR molecules and AX_nE_m selector, polarity (CO₂, H₂O, CCl₄, CHCl₃), hybridisation, MO occupancy (Pauli, Hund, over-full, keyboard Enter), N₂/B₂/C₂/O₂⁻/He₂/N₂⁺, LCAO sign colours and node, Practice/Challenge, save/autosave/reopen, search (14 queries + navigation), related links, evidence panels, three widths × both themes. Also: Stage 12 142/142 (two stale exact assertions updated), Stage 22 159/159 (card count 7 → 10), Stage 27 112/112.

## 21. Screenshot inspection
Opened and examined: atomic orbital (dark and light), MO diagram (dark), bonding geometry (dark), Lewis nitrate (dark), spectra (dark), MO mobile (too small to read at full-page scale; overflow checked numerically). Defects found and fixed from the images: orbital slice too zoomed out and pixelated (extent halved); row headers upper-cased by existing CSS ("HE₂"); the 180° label overlapped the central atom; crowded level labels on the energy diagram. Not individually inspected: the other 11 screenshots, Lewis/geometry at 375 px, light-theme MO overlap.

## 22. TypeScript / build / lint
`tsc -p tsconfig.app.json --noEmit` clean after fixing two unused variables; `npm run build` succeeds (vite 20 s; existing chunk-size warning only); ESLint clean on all changed and new source, test and browser files. Repository-wide lint not run.

## 23. Resource observations
Heavy work sequential. A foreground `tsc` run exceeded 110 s on this machine (about 5 minutes while other node work ran) and was run in the background. Leftover headless Chrome processes from an interrupted run held the debug port once and were stopped. Slice grid 81², enclosure grid 71³ computed once per orbital and cached; parameter changes redraw a canvas only.

## 24. Remaining defects and verification gaps
- Stage 11 browser check 47/54 and Stage 19 51/56 fail. Stage 11's failures are stale expectations (subject picker statuses, "four tools"); Stage 19's are a search-Enter navigation case ("Krebs" → expected Citric acid cycle; a unit search confirms the right concept is first) and a Physics tab list. I did not prove these failed before Stage 28 (no baseline worktree build) and did not change them.
- Source status gaps: MIT OCW PDF unread; Rydberg energy and Pauling values not retrieved; ClF₃/BrF₅ and the ion MO orderings not individually compared; ozone, nitrate, nitrite, sulfur dioxide and sulfate descriptions not compared with a retrieved text.
- No real-device touch testing (touch emulation only). Reduced motion: the labs contain no animation (tested statically).
- The repository's line-ending warnings (CRLF/LF) appear on commit; no files were normalised.

## 25. Exact local commits (not pushed)
- `7688231` atomic models and reference tests
- `1d9fb2b` bonding and geometry models and tests
- `1bdc7a2` molecular-orbital models and tests
- `5d4d216` the three interactive laboratories, learning content, saved state, evidence registry
- `a6377a2` navigation, concept search, relations, registration, platform tests, stale-assertion updates
- `009d9f3` browser checks, documentation and this handoff (a later small commit corrects hashes in this file)

## 26. Final git status
Only the five long-standing untracked files remain; `stash@{0}` preserved.

## 27. Recommended Stage 29
1. Periodic trends laboratory (effective nuclear charge, radii, ionisation energies from the NIST data already fetched), which also makes the planned Electron configurations → Periodic trends link real.
2. Read the MIT OCW PDF or another primary hydrogenic-wavefunction source and the NIST ASD Balmer lines; retrieve CODATA Rydberg energy and a Pauling electronegativity table; upgrade the partly-verified records accordingly.
3. Heteronuclear diatomic MO (CO, NO, HF) with a documented ordering, and π-system Hückel diagrams for conjugated molecules to connect to Organic resonance.
4. Fix the stale Stage 11 and Stage 19 expectations after confirming their baseline.
