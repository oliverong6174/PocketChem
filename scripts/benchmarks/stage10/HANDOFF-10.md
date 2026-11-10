# Stage 10 handoff — UI/UX and aesthetic overhaul

Branch `stage10-ui-overhaul` (from `stage9l-scientific-correctness` @ `1373bb9`). Local commits only; nothing pushed. Stage 11 not started.

## 1. Starting checkpoint
`1373bb9 docs: Stage 9N handoff`. Untracked files left untouched: `CLAUDE.md`, `stage5-*`, `scripts/browser/stage9fLiveCheck.mjs`, `scripts/benchmarks/stage9m/rd-probe.mjs`.

## 2. Visual direction — "ink and paper"
Deep blue-black ink theme and warm paper theme, one verdigris accent for action/selection. Amber, violet, red, green carry meaning only. Serif display face for titles (system stack: Iowan/Palatino/Georgia), system sans for UI, mono for SMILES. **No webfont request** (the old Google Fonts `@import` was removed, which also fixes an offline-mode violation). Chemistry drawings, Ketcher and spectra always sit on a paper surface so RDKit colours stay correct in both themes. Uncertainty is shown with dashed borders and the "Heuristic estimate / Rule-based prediction / Teaching model / Saved result" badges (`EvidenceBadge`).

## 3. Design tokens (`src/styles/tokens.css`)
- Palette scales `--n-*` (neutral), `--a-*` (accent), `--warn-*`, `--danger-*`, `--ok-*`, `--viol-*`; theme-swapped. All legacy `App.css` colours (≈400 hex/rgba values) were mechanically mapped onto them, so every older page follows the theme.
- Semantic roles: `--bg --surface --surface-raised --surface-sunken --border --text* --accent* --focus --status-{ok,warn,danger,info,estimate}[-bg]`. Use these in new code.
- Scale tokens: `--sp-1..7`, `--radius-*`, `--fs-*`, `--shadow-*`, `--dur-*`, `--z-*`, `--touch` (44px).
- Paper scope: `.on-paper` plus the listed legacy drawing surfaces re-declare the dark-scale values and ink roles, so they look identical in both themes.
- Theme: `<html data-theme>` set before first paint (inline script in `index.html`) and by `src/theme/useTheme.ts` (System / Light / Dark, persisted in `localStorage` key `pocketchem.theme`, live system tracking).
- Reduced motion and forced-colors handled globally.

## 4. Navigation architecture
- `src/navigation/subjects.ts`: `SUBJECTS` (Organic, General, Physics, Biology, Biochemistry), `MODE_LABELS` (Scientific Workbench / Interactive Learning), `TOOL_GROUPS` (Analyze / Synthesize / Library), `ORGANIC_TOOLS`. Adding a subject = adding registry entries; the shell is subject-generic (`tools`, `activeSubject` props).
- `src/components/shell/`: `AppShell` (sticky bar + grouped tablist), `SubjectPicker`, `PlannedSubjectDialog`, `ThemeToggle`.
- ≥1040px: grouped underline tabs (role=tab, `page-tab-*`/`page-panel-*` ids and arrow-key handling kept). <1040px: one compact bar whose "current tool" button opens a focus-trapped sheet with every tool + description, the subject list and theme control.
- Planned subjects open an informational dialog ("Not available yet", intended areas) and never replace the working tool, so editor state is not unmounted.
- Tab order is now Properties, Ranking, Spectroscopy, Conformations | Reactions, Multi-Step, Multi-Catalytic | Saved. Labels are unchanged.

## 5. Pages redesigned
All tools inherit the new shell, tokens, buttons, inputs, cards, tables, focus rings and themes. Deeper work: Conformations (below), reagent list rows (clipping fix), spectroscopy summary cards (2-column on phones), drawing/entry surfaces (paper in both themes). Reactions/Synthesis/Multi-Catalytic/Ranking/Spectroscopy/Saved layouts were **restyled, not restructured**; see section 13.

## 6. Reusable components (`src/components/ui/`)
`Icon` (inline stroke set), `useDialog` (focus trap/Esc/scroll lock/focus return), `primitives.tsx`: `Workspace` (input|stage|inspector grid), `Panel`, `Inspector`, `DiagramFrame` (paper figure with title/toolbar/legend/caption), `Legend`, `Badge`, `EvidenceBadge`, `Callout` (tones, ARIA roles), `EmptyState`, `LoadingState`, `Disclosure`, `Segmented`, `KeyFigures`, `Explanation`; `LearningModeSwitch` (Explore / Practice / Challenge — each page declares only the modes it supports; Conformations uses Explore + Practice). Styles in `src/styles/ui.css`. Shared in real use: Conformations, shell, dialogs.

## 7. Conformations improvements (`src/styles/conformations.css`, `views.tsx`, `ConformationsPage.tsx`)
- Diagrams in paper `DiagramFrame`s with legends; fixed `--draw-*` palette; roles unchanged (axial magenta, equatorial blue, diaxial amber dashed, selection gold) and always paired with text/line style.
- Labels stay ≥11.5px on screen at any width (`--inv` scale variable); energy graph is drawn in real pixels with greedy collision-free label placement, labels clamped inside the plot (fixes the 0°/360° collisions), leader lines, compact energy-only labels on phones, and a values table under the graph (accessible alternative).
- Newman: verified real mouse drag, touch drag, `touch-action:none`, pointer cancel/lost-capture handling, keyboard (arrows 5°, Alt 1°, PageUp/Down 60°, Home), `role=slider` with `aria-valuenow/valuetext`, 60° ticks, larger chips. Structure-map bonds/rings are keyboard focusable.
- Chair flip: eased morph between the two *computed* chairs; the page states the path is not modelled and draws no ax/eq labels during it; skipped under `prefers-reduced-motion`. State flips instantly underneath (undo/save unchanged).
- Stability: strain bars for Chair A vs B (hatched when not assessed), verdict, population note, "not included" disclosure.
- Practice: Explore/Practice segmented control, option cards, running score; explanations as disclosures.
- Shared-state contract preserved: one `ConformationsWorkspaceInputs` drives every view and the saved summary.

## 8. Responsive behaviour
375 / 768 / 1440 audited for every tool in both themes: no horizontal overflow (live check). Phone/tablet use the navigation sheet; Conformations stacks stage→assessment→bond map→graph; toolbars wrap; touch targets ≥40–44px (`pointer: coarse` enlarges controls and bond hit areas).

## 9. Accessibility
Skip link → `#main-content`; visible 3px focus ring everywhere; tablist roles/arrow keys; dialog/sheet focus trap + Esc + focus return; radiogroup theme toggle with arrow keys; slider semantics on Newman; `role=alert/status/note` on callouts; text labels on every colour code; reduced-motion and forced-colors support; coarse-pointer sizing.

## 10. Scientific functionality preserved
No chemistry engine, rule, persistence schema or Ketcher protocol file was modified. Heuristic labelling kept and strengthened (evidence badges, "not recomputed" saved states). The 9N live check (35/35) still passes with two deliberate edits (Practice is now a segmented control; flip waits for the animation).

## 11. Browser checks (real headless Chrome, production build)
- `scripts/browser/stage10LiveCheck.mjs`: **30/30** — tabs, groups, keyboard tab move, subject picker + planned preview + Esc, theme persistence/light background, real mouse drag (→120°), slider sync, assessment follows drag, keyboard PageDown, touch drag at 375px (→180°), no overflow, graph label ≥11px, chair-flip animation + final labels, reduced-motion immediate flip, 6 overflow audits (3 widths × 2 themes × 8 tools), sheet touch targets, no page exceptions.
- `stage9nLiveCheck.mjs`: 35/35.
- Screenshots inspected by eye (dark/light × 375/768/1440 for all tools via `stage10Shots.mjs`; Conformations via `stage10ConfShots.mjs`; Reactions results via `stage10ReactionShots.mjs`; nav sheet and planned dialog). Defects found and fixed from them: invisible badge on paper, unreadable "Enter" button in light, clipped reagent rows, wrapped sheet label, light text on paper entry row, compact sawhorse size. Not inspected: Synthesis results with a found route, Multi-Catalytic with populated inventory, Spectroscopy plots in light theme (dark/empty states only).

## 12. Tests / build / lint
- `tsc -b` clean; `vite build` succeeds (existing chunk-size warning).
- Node suites (13 files: uiPolish, analysisLibrary*, persistence*, multicatalyticPersistence, conformations*, synthesisUi, reactionWorkspace): **380/380**; new `scripts/tests/ui10.test.mjs` 5/5. One source-pattern assertion in `analysisLibrary.test.mjs` was updated to the new shell wiring (`onSelectTool={(id) => switchPage(id as AppPage)}`).
- ESLint: all new/touched Stage 10 files clean. Repo-wide `eslint .` still reports the pre-existing engine-file errors (16 errors/2 warnings, none in Stage 10 files).
- The full `npm test` was **not** rerun (no engine files touched); the known search-deadline failures remain neither confirmed nor refuted.

## 13. Performance
JS unchanged except small shell/UI code; total `dist/assets` 31,676 → 31,732 KB (+56 KB, mostly CSS: app CSS 50→68 KB, Conformations CSS split into its lazy chunk 13 KB). No dependency added. Diagram resize uses `ResizeObserver` state only on size change; the Newman/graph pointer paths are unchanged in cost.

## 14. Remaining design issues
- Reactions, Synthesis, Multi-Catalytic, Ranking, Spectroscopy keep their original internal layouts (restyled only). Not yet using `Workspace/Inspector`; route/convergent-branch visualisation, provenance and alternative-product presentation were not redesigned.
- Properties page still has dense tile grids and the older chip tabs inside the dashboard.
- Ketcher's own UI is always light (by design: paper) and not themed.
- Sawhorse companion drawing is small on narrow widths; sheet icons slightly misalign with two-line text.
- Challenge learning mode defined but not used anywhere.
- Offline mode not separately exercised (no network calls added; font import removed).

## 15. Commits (this branch)
See `git log --oneline 1373bb9..HEAD` (tokens/shell/primitives; Conformations redesign; Stage 10 live check; reagent-row style; lint/tests/handoff).

## 16. Recommended Stage 11 (shared platform)
1. Move tool pages onto `Workspace/Panel/Inspector/DiagramFrame` one at a time (Synthesis first: route graph as a `DiagramFrame` with provenance legend).
2. Promote `subjects.ts` to a registry where each subject exports `{tools, load()}` and lazy-loads its code; add URL routing (`/organic/conformations`) so deep links and back/forward work.
3. Extract a `useWorkspacePersistence`-style shared "saved workspace" control into `ui/` and share it across subjects.
4. Build the Explore/Practice/Challenge pattern as a `LearningScene` (labelled layer toggle, hidden-label practice, predict-then-reveal) before any Biology content.
5. Add a visual-regression screenshot suite (`stage10Shots.mjs` is the seed) and a contrast checker over tokens.
6. Remove the remaining raw hex values from legacy TSX/SVG (mass-spec badges, spectroscopy plots) in favour of tokens.
