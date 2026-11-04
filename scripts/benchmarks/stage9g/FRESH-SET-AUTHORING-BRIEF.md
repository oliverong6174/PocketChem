# Stage 9G fresh independent evaluation set: authoring brief

Status: **not yet authored.** Auto mode could not review the delegated authoring call (a hook rewrote its input), so no fresh set exists and
no claim of independent generalisation is made for the Stage 9G changes. Run this brief with an agent that has web access and **no access to the
repository source**, save the output under `scripts/benchmarks/stage9g/fresh/`, record SHA-256 hashes in a manifest and commit it **before**
running any Stage 9G engine against it. Do not edit a case after seeing a prediction.

## Why a fresh set is needed
The Stage 9F holdout was run once and its content has been exposed (the failures were read to choose Stage 9G work), so it can no longer be
called untouched. Stage 9G changes were guided by the development cases and by reading holdout-class failures. Only a set written afterwards
by someone who has not seen the engine can measure generalisation.

## Deliverables
1. `fresh-ranking.json`: at least 30 ranking cases.
2. `fresh-ms.json`: at least 20 electron-ionisation mass-spectrum cases.
3. `snapshots/`: the fetched source text for every cited source.

## Ranking case schema
```json
{"id":"FR-01","category":"physical|electronic|stability|acid-base|substitution","title":"...","source_ids":["..."],
 "evidence":"verified|inferred","uncertainty":"...","mode_id":"<mode>","smiles":["..."],
 "expected_order":[["first"],["next, tied with the one beside it","..."]],
 "basis":"quote the numbers used","values":{"<smiles>":0},"tie_tolerance_note":"","case_type":[]}
```
* 3 to 5 molecules per case; expected_order is groups from first to last (inner lists are genuine ties).
* `verified` only when the order follows directly from numbers in a fetched source.
* Modes: boilingPoint, meltingPoint, solubility, lipophilicity, acidity, basicity, conjugateBaseStability, ewgStrength (largest sigma_para first),
  edgStrength (most negative sigma_para first), alkeneStability, cationStability, radicalStability, nucleophilicity, leavingGroupAbility,
  sn2Reactivity, sn1Reactivity, electrophilicity, carbonylReactivity.
* Distribution: about 10 boilingPoint, 6 ewg/edgStrength (Hammett sigma_p table), 4 alkeneStability, 4 acidity/basicity, 3 lipophilicity,
  3 solubility/meltingPoint. Include cases where a molecular-weight guess is wrong and at least 3 near ties.
* No amides, ureas, charged species, sulfoxides/sulfones, P or Si compounds in boilingPoint cases.
* Do not reuse any molecule set listed in the Stage 9F ranking/spectroscopy cases.

## MS case schema
```json
{"id":"FM-01","category":"mass spectrometry","title":"...","source_ids":["nist-<CAS>"],"evidence":"verified","uncertainty":"",
 "smiles":"...","formula":"...","molecular_ion_mz":0,"base_peak_mz":0,"key_fragments":[{"mz":0}]}
```
* Base peak and molecular ion from the NIST WebBook EI peak table (save it); up to four other peaks with at least 20 % relative intensity.
* 20+ molecules across classes: sec/tert/primary alkyl halides (4+), ethers, esters, ketones, aldehydes, alcohols, amines, nitriles, nitro compounds,
  substituted benzenes with OH/NH2/halogen/alkyl/OCH3/CN/CHO/COOH (6+), cyclic compounds.

## Rules
Every number comes from a fetched source, never from memory. Drop a case if its source cannot be fetched.
