# Independent benchmark: generated tables

Cases: 57. Verdicts are never combined into one accuracy number; each dimension is reported on the cases that have an expectation for it.

## Pre-fix engine (before the benchmark-driven fixes), final scorer

### reference-validated, held-out (35 cases)

| dimension | verdicts |
|---|---|
| structure | correct 29 |
| connectivity | correct 27, wrong 2, abstained 1 |
| regiochemistry | correct 11, wrong 1 |
| stereochemistry | correct 4, incomplete 2, not-scored 1, wrong 1 |
| classification | abstained 6 |
| conditions | unassessed 1, correct 4 |
| ambiguity | correct 1 |
| unsupported | other-rule-match 2, supported-correct 1 |
| routeDiscovery | found 1 |
| routeVerification | verified 2 |
| routePlausibility | plausible 1 |
| workspace | correct 1 |

### provisional (excluded from validated figures) (18 cases)

| dimension | verdicts |
|---|---|
| structure | correct 11 |
| connectivity | correct 12, wrong 1, abstained 1 |
| regiochemistry | correct 5, wrong 1, abstained 1 |
| stereochemistry | incomplete 1 |
| classification | abstained 2 |
| unsupported | correct-abstention 1 |
| routeDiscovery | found 2 |
| routeVerification | verified 3 |
| routePlausibility | plausible 2 |
| workspace | correct 1 |

### verified but overlapping existing fixtures (4 cases)

| dimension | verdicts |
|---|---|
| structure | correct 3 |
| connectivity | correct 3 |
| stereochemistry | correct 2 |
| ambiguity | correct 1 |
| unsupported | correct-abstention 1 |

## Post-fix engine (current)

### reference-validated, held-out (35 cases)

| dimension | verdicts |
|---|---|
| structure | correct 30 |
| connectivity | correct 28, wrong 2 |
| regiochemistry | correct 11, wrong 1 |
| stereochemistry | correct 4, incomplete 3, wrong 1 |
| classification | abstained 6 |
| conditions | unassessed 1, correct 4 |
| ambiguity | correct 1 |
| unsupported | other-rule-match 2, supported-correct 1 |
| routeDiscovery | found 1 |
| routeVerification | verified 2 |
| routePlausibility | plausible 1 |
| workspace | correct 1 |

### provisional (excluded from validated figures) (18 cases)

| dimension | verdicts |
|---|---|
| structure | correct 12 |
| connectivity | correct 13, wrong 1 |
| regiochemistry | correct 6, wrong 1 |
| stereochemistry | incomplete 1 |
| classification | abstained 2 |
| unsupported | correct-abstention 1 |
| routeDiscovery | found 2 |
| routeVerification | verified 3 |
| routePlausibility | plausible 2 |
| workspace | correct 1 |

### verified but overlapping existing fixtures (4 cases)

| dimension | verdicts |
|---|---|
| structure | correct 3 |
| connectivity | correct 3 |
| stereochemistry | correct 2 |
| ambiguity | correct 1 |
| unsupported | correct-abstention 1 |

## Per-category, reference-validated held-out, post-fix engine

| category | cases | connectivity | regiochemistry | stereochemistry | classification | other |
|---|---|---|---|---|---|---|
| substitution-elimination | 3 | correct 3 | correct 2 | correct 1 | abstained 2 | - |
| alkenes | 4 | correct 4 | correct 2 | incomplete 2, correct 1 | - | - |
| alkynes | 4 | correct 4 | correct 2 | correct 2 | - | - |
| carbonyl | 4 | correct 4 | correct 2 | - | abstained 2 | conditions: unassessed 1, correct 1 |
| aromatic-substitution | 3 | wrong 2, correct 1 | correct 2, wrong 1 | - | abstained 2 | - |
| organometallic | 5 | correct 5 | - | - | - | conditions: correct 2 |
| oxidation-reduction | 6 | correct 6 | correct 1 | - | - | conditions: correct 1 |
| competing-pathways | 1 | correct 1 | - | - | - | ambiguity: correct 1 |
| unsupported | 3 | - | - | incomplete 1, wrong 1 | - | unsupported: other-rule-match 2, supported-correct 1 |
| multistep-route | 1 | - | - | - | - | routeDiscovery: found 1; routePlausibility: plausible 1 |
| multicatalytic | 1 | - | - | - | - | workspace: correct 1 |

## Case table (verdict per dimension; pre-fix -> post-fix when different)

| id | provenance | overlap | dimension verdicts | known gap |
|---|---|---|---|---|
| SE-01 | verified-secondary |  | structure: correct; connectivity: correct; stereochemistry: correct |  |
| SE-02 | verified-secondary |  | structure: correct; connectivity: correct; regiochemistry: correct; classification: abstained |  |
| SE-03 | verified-secondary |  | structure: correct; connectivity: correct; regiochemistry: correct; classification: abstained |  |
| SE-04 | provisional |  | connectivity: correct |  |
| SE-05 | provisional |  | structure: correct; connectivity: correct; regiochemistry: correct; classification: abstained |  |
| AL-01 | provisional |  | structure: correct; connectivity: correct; regiochemistry: correct |  |
| AL-02 | provisional |  | structure: correct; connectivity: correct; regiochemistry: correct |  |
| AL-03 | verified-secondary |  | structure: correct; connectivity: correct; regiochemistry: correct; stereochemistry: incomplete |  |
| AL-04 | verified-secondary |  | structure: correct; connectivity: correct; regiochemistry: correct |  |
| AL-05 | provisional |  | structure: correct; connectivity: wrong; regiochemistry: wrong | yes |
| AL-06 | provisional |  | structure: correct; connectivity: correct |  |
| AL-07 | verified-secondary | yes | structure: correct; connectivity: correct; stereochemistry: correct |  |
| AL-08 | verified-secondary | yes | structure: correct; connectivity: correct; stereochemistry: correct |  |
| AL-09 | verified-secondary |  | structure: correct; connectivity: correct; stereochemistry: incomplete |  |
| AL-10 | verified-secondary |  | structure: correct; connectivity: correct; stereochemistry: correct |  |
| AL-11 | provisional |  | structure: correct; connectivity: correct; stereochemistry: incomplete |  |
| AY-01 | verified-secondary |  | structure: correct; connectivity: correct; regiochemistry: correct |  |
| AY-02 | verified-secondary |  | structure: correct; connectivity: correct; regiochemistry: correct |  |
| AY-03 | verified-secondary |  | structure: correct; connectivity: correct; stereochemistry: correct |  |
| AY-04 | verified-secondary |  | structure: correct; connectivity: correct; stereochemistry: correct |  |
| AY-05 | provisional |  | structure: correct; connectivity: correct |  |
| CB-01 | provisional |  | structure: correct; connectivity: correct |  |
| CB-02 | verified-secondary |  | structure: correct; connectivity: correct; regiochemistry: correct; classification: abstained |  |
| CB-03 | verified-secondary |  | structure: correct; connectivity: correct; regiochemistry: correct; classification: abstained; conditions: unassessed |  |
| CB-04 | verified-secondary |  | structure: correct; connectivity: correct; conditions: correct |  |
| CB-05 | provisional |  | structure: correct; connectivity: correct; regiochemistry: correct |  |
| CB-06 | verified-secondary |  | structure: correct; connectivity: correct |  |
| CB-07 | provisional | yes | structure: correct; connectivity: correct |  |
| AR-01 | verified-secondary |  | structure: correct; connectivity: wrong; regiochemistry: correct; classification: abstained |  |
| AR-02 | verified-secondary |  | structure: correct; connectivity: correct; regiochemistry: correct; classification: abstained |  |
| AR-03 | provisional | yes | structure: correct; connectivity: correct; regiochemistry: correct; classification: abstained |  |
| AR-04 | provisional |  | connectivity: correct |  |
| AR-05 | verified-secondary |  | structure: correct; connectivity: wrong; regiochemistry: wrong | yes |
| OM-01 | verified-secondary |  | structure: correct; connectivity: correct |  |
| OM-02 | verified-secondary |  | structure: n/a -> correct; connectivity: abstained -> correct |  |
| OM-03 | provisional |  | structure: n/a -> correct; connectivity: abstained -> correct; regiochemistry: abstained -> correct |  |
| OM-04 | verified-primary |  | structure: correct; connectivity: correct; conditions: correct |  |
| OM-05 | verified-primary |  | structure: correct; connectivity: correct; conditions: correct |  |
| OM-06 | verified-secondary |  | structure: correct; connectivity: correct |  |
| OR-01 | verified-primary |  | structure: correct; connectivity: correct; regiochemistry: correct; conditions: correct |  |
| OR-02 | verified-secondary |  | structure: correct; connectivity: correct |  |
| OR-03 | verified-secondary |  | structure: correct; connectivity: correct |  |
| OR-04 | verified-secondary |  | structure: correct; connectivity: correct |  |
| OR-05 | verified-secondary |  | structure: correct; connectivity: correct |  |
| OR-06 | verified-secondary |  | structure: correct; connectivity: correct |  |
| CP-01 | verified-secondary |  | structure: correct; connectivity: correct; ambiguity: correct |  |
| CP-02 | verified-secondary | yes | structure: correct; connectivity: correct; ambiguity: correct |  |
| US-01 | verified-secondary | yes | unsupported: correct-abstention |  |
| US-02 | provisional | yes | unsupported: correct-abstention |  |
| US-03 | verified-primary |  | stereochemistry: not-scored -> incomplete; unsupported: other-rule-match |  |
| US-04 | verified-secondary |  | unsupported: supported-correct |  |
| US-05 | verified-secondary |  | stereochemistry: wrong; unsupported: other-rule-match |  |
| RT-01 | provisional |  | routeDiscovery: found; routeVerification: verified; routePlausibility: plausible |  |
| RT-02 | verified-secondary |  | routeDiscovery: found; routeVerification: verified; routePlausibility: plausible |  |
| RT-03 | provisional |  | routeDiscovery: found; routeVerification: verified; routePlausibility: plausible |  |
| WS-01 | provisional |  | workspace: correct; routeVerification: verified |  |
| WS-02 | verified-secondary |  | workspace: correct; routeVerification: verified |  |

## Runtime and resources (post-fix run)

Total 17780 ms over 57 cases; slowest case 2917 ms; peak RSS 311 MB.

Route searches (15 s budget each): RT-01: found, 2640 ms, alkene-acid-hydration > benzylic-allylic-alcohol-oxidation | RT-02: found, 1576 ms, aromatic-nitration > aromatic-halogenation-bromination | RT-03: found, 2917 ms, aromatic-nitration > benzylic-oxidation
