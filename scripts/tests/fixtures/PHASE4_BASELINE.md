# Phase 4 baseline (Stages 0-2)

Recorded on branch `phase4-convergent-synthesis`, from `c90b176`, Node v24.21.0, Windows 11.
Timings are from one machine and are indicative only.

## Before Phase 4 work (`npm test` at c90b176)

73 tests, 67 pass, 0 fail, 6 todo (the documented known gaps). 14 s.

## After Stages 0-2 (`npm test`)

208 tests, 202 pass, 0 fail, 6 todo (unchanged). 90 s.
+135 tests: convergentFixtures 55, routeInventory 24, speciesPool 33, reactantRoleIndex 23.
The extra time is almost all the role-index recall sweep (~20 s) plus engine start-up per file.

## Normal-search control (acetone -> ethanol), one run each

|              | route                                   | time  | progress events |
|--------------|-----------------------------------------|-------|-----------------|
| c90b176      | ketone-baeyer-villiger > ester-lah-reduction | 13.3 s | 80 |
| with Stage 0-2 | same                                  | 13.3 s | 80 |

Note: this is 1.7 s under the 15 s normal-search limit on this machine. That headroom
is pre-existing and not something Stages 0-2 changed.

## Fixture chemistry (each step replayed against the existing registry)

| fixture | steps (rule) | notes |
|---|---|---|
| fischer-isopropyl-propanoate | aldehyde-oxidation, ketone-reduction, fischer-esterification | oxidation/reduction are `representative` (generic reagent) |
| williamson-cyclohexyl-propyl-ether | alkene-hbr-peroxide, ketone-reduction, alcohol-williamson-ether | base not modelled |
| grignard-2-butanol-from-ethanol | primary-alcohol-mild-oxidation, alcohol-hbr-substitution-primary, haloalkane-grignard-formation-bromide, aldehyde-organometallic-addition | needs 2 copies of ethanol |
| ester-reduction-coproduct | ester-lah-reduction | two real products; one equals 2-propanol of another fixture |
| racemic-diol-coupling | alkene-syn-dihydroxylation, fischer-esterification | racemic mixture inherited by the coupling product |

Registry findings that fixtures work around (no rule was changed):

- `carboxylic-acid-fischer-esterification` is `concept-only`; `fischer-esterification` is the executable rule.
- Grignard formation returns `C[CH2][Mg][Br]`; canonicalization makes it identical to `CC[Mg]Br`.
- `aldehyde-organometallic-addition` gives `CCC(C)O` with no stereodescriptor and no mixture marker, although a stereocentre forms (`[known-gap]` test).
- With 2+ drawn structures the engine only runs rules that consume them; "auto" reagents (cyanide, iodide) are conditions, not lots.

## Role-index recall

- Default sweep: 45 pairs, 33 engine pathways, 33 proposed, 0 missed.
- `PC_FULL_RECALL=1`: 300 pairs, 350 engine pathways, 336 proposals, 0 missed; 0.97 of 83 multi-lot rules proposed per pair.

## Static checks

- `tsc -b`: clean. `npm run build`: passes (existing chunk-size warning only).
- `npm run lint`: 19 problems (17 errors, 2 warnings), identical to c90b176; none in files added or edited here.
