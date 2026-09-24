#!/usr/bin/env node
import { createReadStream, existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createGunzip } from 'node:zlib';
import readline from 'node:readline';

const indexPath = process.argv[2] || 'public/data/chemical-names.index.json';
const rawDir = process.argv[3] || 'data/chebi-flat';
const QUERY = 'arachidonic acid';
const TARGET_ID = 'CHEBI:15843';

function norm(v) {
  return String(v ?? '')
    .trim()
    .toLocaleLowerCase('en-US')
    .replace(/[‐‑‒–—−]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ',');
}

async function scanGzip(path, patterns, limit = 20) {
  if (!existsSync(path)) return { missing: true, matches: [] };
  const input = createReadStream(path).pipe(createGunzip());
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  const matches = [];
  let header = null;
  for await (const line of rl) {
    if (header === null) {
      header = line;
      continue;
    }
    const lower = line.toLocaleLowerCase('en-US');
    if (patterns.some((p) => lower.includes(p.toLocaleLowerCase('en-US')))) {
      matches.push(line);
      if (matches.length >= limit) {
        rl.close();
        break;
      }
    }
  }
  return { missing: false, header, matches };
}

console.log('=== PocketChem chemical-name database diagnostic ===');
console.log('Index:', indexPath);

if (!existsSync(indexPath)) {
  console.error('FAIL: uncompressed index is missing:', indexPath);
  process.exitCode = 2;
} else {
  console.log('Index bytes:', statSync(indexPath).size.toLocaleString());
  let db;
  try {
    db = JSON.parse(await readFile(indexPath, 'utf8'));
  } catch (e) {
    console.error('FAIL: index could not be parsed as JSON:', e?.message ?? e);
    process.exitCode = 3;
  }

  if (db) {
    const key = norm(QUERY);
    const alias = db.aliases?.[key];
    console.log('Database version:', db.v);
    console.log('Record count:', Object.keys(db.records ?? {}).length.toLocaleString());
    console.log('Alias count:', Object.keys(db.aliases ?? {}).length.toLocaleString());
    console.log(`Direct alias [${JSON.stringify(key)}]:`, JSON.stringify(alias));
    console.log(`Direct record [${TARGET_ID}]:`, JSON.stringify(db.records?.[TARGET_ID] ?? null, null, 2));

    const ids = typeof alias === 'string' ? [alias] : Array.isArray(alias) ? alias : [];
    if (ids.length) {
      console.log('Alias target records:');
      for (const id of ids) {
        console.log(id, JSON.stringify(db.records?.[id] ?? null, null, 2));
      }
    }

    const preferred = Object.entries(db.records ?? {}).filter(([, rec]) =>
      norm(rec?.p) === key || norm(rec?.i) === key
    );
    console.log('Exact preferred/IUPAC-name matches:', preferred.length);
    for (const [id, rec] of preferred.slice(0, 20)) {
      console.log(id, JSON.stringify(rec, null, 2));
    }

    const similarAliases = Object.entries(db.aliases ?? {}).filter(([name]) =>
      name.includes('arachidon')
    );
    console.log('Aliases containing "arachidon":', similarAliases.length);
    for (const [name, target] of similarAliases.slice(0, 30)) {
      console.log(JSON.stringify(name), '=>', JSON.stringify(target));
    }
  }
}

console.log('\n=== Raw ChEBI evidence ===');
for (const file of ['compounds.tsv.gz', 'names.tsv.gz', 'structures.tsv.gz']) {
  const path = `${rawDir}/${file}`;
  const result = await scanGzip(path, ['arachidonic acid', '\t15843\t', '15843']);
  console.log(`\n${file}`);
  if (result.missing) {
    console.log('MISSING:', path);
    continue;
  }
  console.log('Header:', result.header);
  console.log('Matching rows:', result.matches.length);
  for (const row of result.matches) console.log(row);
}

console.log('\n=== Interpretation ===');
console.log('1) If CHEBI:15843 exists in raw files but not db.records, the builder is dropping the structure.');
console.log('2) If db.records[CHEBI:15843] exists but the alias is absent, alias construction is the bug.');
console.log('3) If the alias is an array, the printed target records show why disambiguation is failing.');
console.log('4) If the alias is a single CHEBI:15843 and the record has s (SMILES), the runtime code/cache is the problem.');
