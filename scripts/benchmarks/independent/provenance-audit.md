# Provenance audit of the frozen independent benchmark (Stage 9E Phase A)

Source audit date: 2026-11-02. Cases are not modified; this overlay only re-labels how well each reference was verified and whether the case may count as held-out.

## Source audit (automated fetch + claim-vocabulary coverage; manual overrides noted)

| source | result | detail |
|---|---|---|
| reusch-e2 | supported (0) | Read at the mirror https://chemserv.centre.edu/muzyka/Reusch/jsmol/e2steric.htm (www2.chemistry.msu.edu is behind a WAF): methoxide 80% 2,3-dimethyl-2-butene / 20% 2,3-dimethyl-1-butene; tert-butoxide 25:75. |
| hamburg-sn2 | supported (0.67) | missing: proceeds, experiments |
| ncstate-sn2 | supported (0.6) | missing: concerted, attack |
| ubc-hbo | unreadable | PDF without extractable text (433146 bytes; scanned or compressed) |
| jove-oxymerc | supported (1) |  |
| vanderbilt-alkynes | unreadable | PDF without extractable text (455460 bytes; scanned or compressed) |
| libretexts-alkyne-red | supported (1) |  |
| wikipedia-semihydrog | supported (0.8) | missing: caco3 |
| orgosolver-dibal | supported (0.86) | missing: over-reduces |
| pmc-dibal | unreachable | bot-wall / challenge page |
| ic-os3 | unreadable | PDF without extractable text (176690 bytes; scanned or compressed) |
| uis-eas | supported (0.8) | missing: needs, chiefly |
| ncstate-fc | partial (0.5) | missing: neopentyl, alcl3, methyl-2-phenylbutane, pages, disagreed |
| libretexts-grignard | partial (0.5) | missing: nitrile, hydrolysis |
| chemguide-grignard | supported (0.75) | missing: ethylene, carbons |
| iupac-birch | unreachable | HTTP 403 |
| wikipedia-mch | supported (0.67) | missing: methylenation |
| ncstate-halogenation | partial (0.57) | missing: trans-1, dibromocyclopentane, racemate |
| libretexts-syn-diol | supported (0.71) | missing: osmate, cis-1 |
| jove-epoxidation | supported (1) |  |
| ucla-pcc | partial (0.5) | missing: alcohols, aldehydes, ketones, over-oxidation |
| moc-pcc | partial (0.43) | missing: stops, aqueous, strongly, acidic |
| ncstate-amines | supported (0.67) | missing: lialh4, reduces, nitroarenes |
| openstax-conj | supported (0.83) | missing: favored |
| rsc-naphthalene-fc | unreachable | HTTP 403 |
| libretexts-wacker | supported (0.63) | missing: pdcl2, cucl2, converts |
| katsuki-sharpless-1980 (journal paper) | supported (0.86) | missing: dialkyl |
| orgosolver-bv | supported (0.6) | missing: ring-expanded, epsilon-caprolactone |
| namereaction-mitsunobu | supported (0.67) | missing: undergo, complete |
| heck-1979 (journal paper) | unreadable | PDF without extractable text (659174 bytes; scanned or compressed) |
| suzuki-1979 (journal paper) | unreadable | PDF without extractable text (365319 bytes; scanned or compressed) |
| sonogashira-1975 (journal paper) | unreachable | bot-wall / challenge page |
| corey-suggs-1975 (journal paper) | supported (1) |  |

## Case classification

| category | n | cases |
|---|---|---|
| independent-held-out | 18 | SE-01, SE-02, SE-03, AL-04, AY-03, AY-04, CB-03, CB-06, AR-01, AR-02, OM-01, OR-01, OR-04, OR-05, OR-06, CP-01, RT-02, WS-02 |
| provisional | 14 | SE-04, SE-05, AL-01, AL-02, AL-05, AL-06, AL-11, AY-05, CB-01, CB-05, AR-04, RT-01, RT-03, WS-01 |
| source-unconfirmed | 11 | AL-03, AY-01, AY-02, CB-02, CB-04, AR-05, OM-04, OM-05, OM-06, OR-02, OR-03 |
| existing-fixture-overlap | 7 | AL-07, AL-08, CB-07, AR-03, CP-02, US-01, US-02 |
| verified-development-informed | 2 | AL-09, AL-10 |
| development-guided | 2 | OM-02, OM-03 |
| unsupported-probe | 3 | US-03, US-04, US-05 |

Original 9D headline set (non-provisional, non-overlapping): **35** cases. After this audit the strictly independent held-out set is **18** cases.

### Relabelled cases

| id | claimed | audited | sources | note |
|---|---|---|---|---|
| AL-03 | verified-secondary | source-not-inspected | ubc-hbo:unreadable |  |
| AL-07 | verified-secondary | source-partial | ncstate-halogenation:partial |  |
| AY-01 | verified-secondary | source-not-inspected | vanderbilt-alkynes:unreadable |  |
| AY-02 | verified-secondary | source-not-inspected | vanderbilt-alkynes:unreadable |  |
| CB-02 | verified-secondary | source-not-inspected | ic-os3:unreadable |  |
| CB-04 | verified-secondary | source-not-inspected | ic-os3:unreadable |  |
| AR-05 | verified-secondary | source-partial | ncstate-fc:partial |  |
| OM-04 | verified-primary | source-not-inspected | suzuki-1979:unreadable | Labelled primary; no primary-paper text could be read (scanned PDF, bot-wall or secondary summary). |
| OM-05 | verified-primary | source-not-inspected | sonogashira-1975:unreachable | Labelled primary; no primary-paper text could be read (scanned PDF, bot-wall or secondary summary). |
| OM-06 | verified-secondary | source-partial | libretexts-grignard:partial |  |
| OR-01 | verified-primary | verified-secondary | corey-suggs-1975:supported, ucla-pcc:partial, moc-pcc:partial | Labelled primary; the readable source is a secondary page. |
| OR-02 | verified-secondary | source-partial | moc-pcc:partial |  |
| OR-03 | verified-secondary | source-not-inspected | iupac-birch:unreachable |  |
| CP-02 | verified-secondary | source-not-inspected | rsc-naphthalene-fc:unreachable |  |
| US-03 | verified-primary | verified-secondary | katsuki-sharpless-1980:supported | Labelled primary; the readable source is a secondary page. |

## Dimension tallies by category (pre-fix engine, then post-development engine)

### Strictly independent held-out (18 cases)

| dimension | pre-fix | post-development |
|---|---|---|
| structure | correct 16 | correct 16 |
| connectivity | correct 15, wrong 1 | correct 15, wrong 1 |
| regiochemistry | correct 7 | correct 7 |
| stereochemistry | correct 3 | correct 3 |
| classification | abstained 5 | abstained 5 |
| conditions | unassessed 1, correct 1 | unassessed 1, correct 1 |
| ambiguity | correct 1 | correct 1 |
| routeDiscovery | found 1 | found 1 |
| routeVerification | verified 2 | verified 2 |
| routePlausibility | plausible 1 | plausible 1 |
| workspace | correct 1 | correct 1 |

### Original 9D headline set (for comparison) (35 cases)

| dimension | pre-fix | post-development |
|---|---|---|
| structure | correct 29 | correct 30 |
| connectivity | correct 27, wrong 2, abstained 1 | correct 28, wrong 2 |
| regiochemistry | correct 11, wrong 1 | correct 11, wrong 1 |
| stereochemistry | correct 4, incomplete 2, not-scored 1, wrong 1 | correct 4, incomplete 3, wrong 1 |
| classification | abstained 6 | abstained 6 |
| conditions | unassessed 1, correct 4 | unassessed 1, correct 4 |
| ambiguity | correct 1 | correct 1 |
| unsupported | other-rule-match 2, supported-correct 1 | other-rule-match 2, supported-correct 1 |
| routeDiscovery | found 1 | found 1 |
| routeVerification | verified 2 | verified 2 |
| routePlausibility | plausible 1 | plausible 1 |
| workspace | correct 1 | correct 1 |

### Verified but development-informed (2 cases)

| dimension | pre-fix | post-development |
|---|---|---|
| structure | correct 2 | correct 2 |
| connectivity | correct 2 | correct 2 |
| stereochemistry | incomplete 1, correct 1 | incomplete 1, correct 1 |

### Development-guided (2 cases)

| dimension | pre-fix | post-development |
|---|---|---|
| structure | - | correct 2 |
| connectivity | abstained 2 | correct 2 |
| regiochemistry | abstained 1 | correct 1 |
