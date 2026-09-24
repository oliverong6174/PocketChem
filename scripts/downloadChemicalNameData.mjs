#!/usr/bin/env node
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const outDir = process.argv[2] || 'data/chebi-flat';
const base = 'https://ftp.ebi.ac.uk/pub/databases/chebi/flat_files';
const files = [
  'README',
  'LICENSE',
  'compounds.tsv.gz',
  'names.tsv.gz',
  'structures.tsv.gz',
  'chemical_data.tsv.gz',
];

await mkdir(outDir, { recursive: true });

for (const file of files) {
  const url = `${base}/${file}`;
  const output = join(outDir, file);
  process.stdout.write(`Downloading ${url} ... `);
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download ${url}: HTTP ${response.status}`);
  }
  await mkdir(dirname(output), { recursive: true });
  await pipeline(Readable.fromWeb(response.body), createWriteStream(output));
  console.log('done');
}

console.log(`\nChEBI flat files saved in ${outDir}`);
console.log('Next: node scripts/buildChemicalNameIndex.mjs ' + outDir + ' public/data');
console.log('\nPubChem bulk RDF is intentionally NOT downloaded by this script because it is much larger.');
console.log('Official PubChem bulk directories:');
console.log('  Synonyms:   https://ftp.ncbi.nlm.nih.gov/pubchem/RDF/synonym/');
console.log('  Descriptors:https://ftp.ncbi.nlm.nih.gov/pubchem/RDF/descriptor/compound/');
console.log('  Compounds:  https://ftp.ncbi.nlm.nih.gov/pubchem/RDF/compound/general/');
