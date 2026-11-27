# Third-party notices

PocketChem includes or derives data from the following sources. Their terms apply to that material.

## ChEBI (bundled: `public/data/chemical-names.index.json.gz`)

Chemical names and structures from ChEBI (Chemical Entities of Biological Interest), EMBL-EBI,
<https://www.ebi.ac.uk/chebi/>, licensed under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
Changes made: records and aliases were selected and repacked into a compressed offline index by
`scripts/buildChemicalNameIndex.mjs`. EMBL-EBI does not endorse PocketChem.

## RDKit.js (bundled: `public/rdkit/`)

BSD 3-Clause License

Copyright (c) 2021-2022, Valence Discovery Inc., Greg Landrum, Paolo Tosco, and other RDKit contributors
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its
   contributors may be used to endorse or promote products derived from
   this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

## Ketcher (npm dependency)

`ketcher-core`, `ketcher-react` and `ketcher-standalone`, EPAM Systems, Apache License 2.0
(<https://www.apache.org/licenses/LICENSE-2.0>).

## IUPAC Digitized pKa Dataset (optional, not distributed)

CC BY-NC 4.0. The locally built index is git-ignored and left out of default builds. See
`scripts/buildPkaReferenceIndex.mjs`.

## Quoted excerpts and reference values in `scripts/benchmarks/`

Benchmark cases, reports and scripts quote short passages and cite individual values from external sources,
identified beside each use. Quoted text stays under its source's terms, including:

- OpenStax, *Organic Chemistry*, <https://openstax.org/books/organic-chemistry/>,
  [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/). Some benchmark comments say
  "CC BY 4.0"; the license recorded in the downloaded collection and pages is CC BY-NC-SA 4.0.
- LibreTexts, <https://chem.libretexts.org/>, licenses vary by page.
- Wikipedia, <https://en.wikipedia.org/>, CC BY-SA 4.0.
- NIST Chemistry WebBook, <https://webbook.nist.gov/>, copyright U.S. Secretary of Commerce. Only selected
  peak values are retained, for evaluation.
