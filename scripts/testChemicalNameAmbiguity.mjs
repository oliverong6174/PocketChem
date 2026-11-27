// Regression test: aliases shared by distinct stereoisomers must stay ambiguous
// even when the stored SMILES are identical (CHEBI:38403 vs CHEBI:38413).
// Usage: node scripts/testChemicalNameAmbiguity.mjs   (Node >= 22.6 type stripping)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const gz = readFileSync(new URL('../public/data/chemical-names.index.json.gz', import.meta.url));
globalThis.window = { location: { origin: 'http://localhost' } };
globalThis.document = { baseURI: 'http://localhost/' };
globalThis.fetch = async () => new Response(gz, { status: 200 });

const { lookupLocalChemicalName } = await import('../src/utils/chemicalNameDatabase.ts');

// Shared by both stereoisomers' extra aliases (stored with <i> tags) -> ambiguous.
assert.equal(await lookupLocalChemicalName('(<i>r</i>,<i>e</i>)-octadeca-5,6,16-trienoic acid'), null);

// Unambiguous names still resolve to the right isomer.
assert.equal((await lookupLocalChemicalName('(<i>R</i>)-lamenallenic acid'))?.chebiId, 'CHEBI:38403');
assert.equal((await lookupLocalChemicalName('(<i>S</i>)-lamenallenic acid'))?.chebiId, 'CHEBI:38413');
assert.equal((await lookupLocalChemicalName('(+)-lamenallenic acid'))?.chebiId, 'CHEBI:38413');
assert.equal((await lookupLocalChemicalName('acetone'))?.chebiId, 'CHEBI:15347');

console.log('chemical-name ambiguity regression: all assertions passed');
