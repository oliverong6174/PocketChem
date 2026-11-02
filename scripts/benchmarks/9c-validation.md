# Stage 9C: scientific reliability audit, selectivity corrections and the integrated catalytic synthesis

Data: `results/multicatalytic-workspace.json` (`node scripts/benchmarks/multicatalyticBenchmark.mjs`, 18/18 scenarios
matched expectations on real rules). Live browser: `node scripts/browser/multicatalyticLiveCheck.mjs` (33/33 checks,
headless Chrome 156, live Ketcher, production build). Earlier stages: `multicatalytic-validation.md`.

## Phase A: audit (before 9C), by status

| Area | Finding | Status |
|------|---------|--------|
| Identity | Every molecule is a lot with canonical isomeric SMILES; stereo, isotopes, charges and disconnected components survive execution, save and restore (tests, benchmark D9, live check) | Established |
| Competing outcomes | Several outcomes stop the step; nothing is consumed until one is chosen | Established |
| Major/minor | Only alkane halogenation had a numeric estimate; Heck, Friedel–Crafts and pinacol returned unranked sets, two of them chemically wrong (below) | Defects found |
| Epoxidation | E and Z alkenes gave the same product, and a single arbitrary enantiomer was shown for achiral substrates (Reactions-page layer); the workspace engine dropped geometry entirely | Defect found |
| Catalyst roles | 30 of 342 rules curated, each traceable to the rule's own text | Established, narrow |
| Condition compatibility | The pair assessment answered "could these share a pot?" but nothing stated that successive steps are isolated | Gap (reporting) |
| Intermediate isolation / workup | Workup reagents were listed as roles but not tied to the step or the boundary | Gap |
| Coproducts | The primary/coproduct split is the engine's product order, not chemical knowledge. Small coproducts such as water are mostly not generated | Provisional |
| Structural vs chemical | Replay shows consistency with PocketChem's own rules only | Established, and reported as such |
| Ordered-sequence tool | Continued after a step formed no product, labelling later steps "provisional" | Unsafe default |

## Phase B: conditions and isolation (commit `2c8b593`)

- `conditionModel.ts`: declared temperature, light, pressure and medium only where the rule's own text states them (12 rules, each
  checked by a test to appear literally in `reagents`/`reagentNote`); `anhydrous` from the rule's declared conditions; workup
  reagents belong to the step that lists them; in-vessel intolerances come from the existing compatibility findings; everything else
  is listed as "not stated". Original reagent text is preserved.
- Every workspace step carries an explicit **isolation boundary**. Contrasting conditions across a dependency (acid-catalyzed
  hydration, then a strong-base Williamson ether synthesis) are reported as "these reactions could not share a vessel; they did not;
  isolation is needed", never as a conflict. Only steps the user declares to share a vessel (a what-if, not saved) are judged as a
  one-pot pair, and no clash is reported as "no documented conflict, not evidence that the one-pot sequence works".
- No catalyst loading, yield, poisoning, kinetics or solvent effect is modeled. No pair is curated as documented-compatible.

## Phase C: selectivity and stereochemistry (commit `9e8f061`)

| Rule | Defect | Change | Reference status |
|------|--------|--------|------------------|
| `heck-coupling` | no E geometry; all attachment sites listed with no ranking | monosubstituted alkenes: (E)-linear product with E geometry, alpha-product minor; preference only for carbonyl/nitrile/sulfonyl/aryl-substituted alkenes. Alkyl, electron-rich and other alkenes stay unranked | Syn insertion + syn β-H elimination and methyl trans-cinnamate from PhI + methyl acrylate verified (Heck, *Acc. Chem. Res.* 1979, 12, 146); the Beletskaya & Cheprakov, *Chem. Rev.* 2000, 100, 3009 citation was verified bibliographically but its regiochemistry section was not re-read |
| `aromatic-friedel-crafts-*` | every ring C–H offered, unranked, although a directing-effect scorer already existed | positions ranked by that scorer: best = major, within 1.0 = competitive, otherwise minor; fused rings and single-product cases are not ranked | Directing effects are textbook; the 1.0 threshold is a model parameter, not a measured one |
| `pinacol-rearrangement` | both aldehyde and ketone offered for terminal 1,2-diols | the leaving OH is chosen by carbocation stability (substitution + aryl) before the migration hierarchy; ties keep both | Cation-stability-first supported by sources; propanal as the product of acid dehydration of 1,2-propanediol supported (PNNL 2009); hydride-versus-aryl order is disputed in sources and kept as a documented simplification |
| `alkene-epoxidation` | E/Z not transferred | stereospecific syn oxygen transfer for H1=H1 alkenes (E → trans racemate, Z → cis; rings cis); all other alkenes stay constitution-only | Concerted syn, stereospecific: verified. trans-Stilbene oxide (R,R)/(S,S) checked by CIP |

Consequences: the 9B-1 benchmark route "anti-dihydroxylation → pinacol → 2-octanone" is **no longer accepted** (pinacol of
octane-1,2-diol gives octanal). That route was structurally accepted before only because the old rule offered a ketone it should not have.
Three 9B-1 tests that asserted the old behavior were rewritten to assert the corrected facts.

Mechanism added: `ForwardTemplate` (forward-only templates, optionally conditional on the reactant's defined E/Z geometry; the plain
`smarts` stays the retrosynthetic template) and `ProductPreference` (a referenced, qualitative major/minor with no fraction).

## Phase D: execution safety (commit `1009587`)

The ordered-sequence tool now stops a branch after a step that needed input, was unsupported, unknown or failed; later steps show
**NOT RUN** with the cause named. NO REACTION still lets the molecule continue (it is a chemical conclusion). Other branches are
unaffected. The old behavior is an unchecked "Diagnostic mode" checkbox (`unresolvedStepPolicy: "continue-provisional"`); the four
existing tests that document it opt in with unchanged assertions. Saved analyses are untouched (this tool is not persisted).

## Phase E: integrated synthesis INT-1 (real rules, no hand-made products)

Starting molecules: 4-bromobenzoic acid, methanol, methyl propiolate.

| Step | Rule | Catalyst (as the registry states it) | Product | Selectivity | Expected |
|------|------|--------------------------------------|---------|-------------|----------|
| 1 (branch A) | `fischer-esterification` (acid + MeOH) | H₂SO₄ (named) | methyl 4-bromobenzoate | single outcome | match |
| 2 (branch B) | `alkyne-lindlar-reduction-terminal` | Lindlar catalyst (named) | methyl acrylate | single outcome | match |
| 3 (join) | `heck-coupling`, chosen explicitly by the user | Pd catalyst (**type only**) | methyl 4-[(E)-3-methoxy-3-oxoprop-1-enyl]benzoate, `COC(=O)/C=C/c1ccc(C(=O)OC)cc1` | **major** (qualitative, referenced); the alpha-aryl acrylate is the minor alternative offered | match |
| 4 | `alkene-hydrogenation` | Pd/C (named) | methyl 3-[4-(methoxycarbonyl)phenyl]propanoate | single outcome | match |

Structure replay: **verified**; dependencies `[[],[],[1,2],[3]]`; final molecule descends from all three starting materials; four distinct
catalyst systems; three isolation boundaries (1>3, 2>3, 3>4); zero declared-condition warnings; every pair combination is "incomplete"
or "unassessed"; `claims: {tandem: false, cooperative: false}`.

Chemistry status of INT-1: each transformation is standard (Fischer–Speier esterification, Lindlar semi-hydrogenation, Heck coupling, Pd/C
hydrogenation) but the **combination is provisional**: methyl acrylate polymerises readily and propiolate semi-hydrogenation needs careful
control; Pd/C hydrogenation would also remove an aryl bromide, which is why the bromide is consumed in step 3 first (PocketChem models
neither). It is not experimentally validated.

Regression scenarios kept in the same benchmark: single-material chain (D1), two-material couplings (D2a–c incl. duplicate copies),
two-branch convergences (D3/D4, D3b/D4b), several catalytic steps (D5), competing products (D6a–f), missing partner (D7), failure
propagation (D8), stereo/isotope identity (D9), coproduct/retained species (D10). Saved-workspace restoration is covered by
`multicatalyticPersistence.test.mjs`, `integrated9c.test.mjs` and the live check; previously passing convergent syntheses by
`convergentFixtures`/`convergentSearch`.

## Limits that remain

- Not corrected: anti-addition of Br₂ and Simmons–Smith cyclopropanation also ignore alkene geometry in the workspace engine (E and Z
  2-butene give the same constitution-only product, which is honest but lossy); the Reactions-page stereo layer still picks one arbitrary
  enantiomer for some epoxides of achiral alkenes.
- Heck regiochemistry for alkyl or electron-rich alkenes, Friedel–Crafts ortho/para ratios and carbocation rearrangement, and the
  hydride-versus-aryl migratory order in pinacol rearrangements are not modeled.
- Catalyst identity is explicit for 30 rules; the other 312 are unassessed. Palladium catalysts are type-only.
- No yield, loading, poisoning, chemoselectivity between catalysts (for example hydrodehalogenation), or solvent effects.
- Level 6 (experimental feasibility) is outside what a rule-based model establishes. Reference answers above are provisional unless marked verified.
