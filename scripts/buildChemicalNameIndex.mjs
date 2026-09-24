#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { createGunzip, gzipSync } from 'node:zlib';
import readline from 'node:readline';

const inputDir = process.argv[2] || 'data/chebi-flat';
const outputDir = process.argv[3] || 'public/data';

function normalize(value) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('en-US')
    .replace(/[αΑ]/g, 'alpha')
    .replace(/[βΒ]/g, 'beta')
    .replace(/[γΓ]/g, 'gamma')
    .replace(/[δΔ]/g, 'delta')
    .replace(/[‐‑‒–—−]/g, '-')
    .replace(/[’′]/g, "'")
    .replace(/″/g, '"')
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ',');
}

function parseTsvLine(line) {
  return line.replace(/\r$/, '').split('\t');
}

function normalizedHeader(value) {
  return normalize(value).replace(/[ _-]+/g, '');
}

function findColumn(headers, candidates, required = true) {
  const normalized = headers.map(normalizedHeader);
  for (const candidate of candidates) {
    const index = normalized.indexOf(normalizedHeader(candidate));
    if (index >= 0) return index;
  }
  if (required) {
    throw new Error(
      `Could not find any of [${candidates.join(', ')}] in headers: ${headers.join(' | ')}`,
    );
  }
  return -1;
}

async function forEachGzipTsv(filePath, onHeader, onRow) {
  const input = createReadStream(filePath).pipe(createGunzip());
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  let headers = null;
  let rowNumber = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;
    rowNumber += 1;
    const values = parseTsvLine(line);
    if (!headers) {
      headers = values;
      onHeader(headers);
      continue;
    }
    await onRow(values, rowNumber);
  }
}

function updateQuotedFieldState(text, inQuotes) {
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== '"') continue;
    if (inQuotes && text[i + 1] === '"') {
      i += 1;
      continue;
    }
    inQuotes = !inQuotes;
  }
  return inQuotes;
}

function parseQuotedTsvRecord(record) {
  const fields = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < record.length; i += 1) {
    const ch = record[i];

    if (ch === '"') {
      if (inQuotes && record[i + 1] === '"') {
        field += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === '\t' && !inQuotes) {
      fields.push(field);
      field = '';
      continue;
    }

    if ((ch === '\n' || ch === '\r') && !inQuotes) {
      continue;
    }

    field += ch;
  }

  if (inQuotes) {
    throw new Error('Malformed TSV record: unterminated quoted field.');
  }

  fields.push(field);
  return fields;
}

// structures.tsv.gz contains an MDL molfile column quoted across many physical
// lines. A normal line-by-line TSV reader therefore mistakes one structure for
// dozens of rows. This reader assembles complete logical TSV records first.
async function forEachGzipMultilineTsv(filePath, onHeader, onRow) {
  const input = createReadStream(filePath).pipe(createGunzip());
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  let headers = null;
  let logicalLines = [];
  let inQuotes = false;
  let physicalLine = 0;
  let logicalRow = 0;

  for await (const line of rl) {
    physicalLine += 1;

    if (logicalLines.length === 0 && !line.trim()) continue;

    logicalLines.push(line);
    inQuotes = updateQuotedFieldState(line, inQuotes);

    if (inQuotes) continue;

    logicalRow += 1;
    const values = parseQuotedTsvRecord(logicalLines.join('\n'));
    logicalLines = [];

    if (!headers) {
      headers = values;
      onHeader(headers);
      continue;
    }

    await onRow(values, logicalRow);
  }

  if (inQuotes || logicalLines.length > 0) {
    throw new Error(
      `Malformed ${basename(filePath)} near physical line ${physicalLine}: unterminated quoted TSV record.`,
    );
  }
}

function normalizeAccession(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const match = raw.match(/^CHEBI:(\d+)$/i);
  return match ? `CHEBI:${match[1]}` : null;
}

function normalizeNumericId(value) {
  const raw = String(value ?? '').trim();
  return /^\d+$/.test(raw) ? raw : null;
}

const records = new Map();
const compoundIdToAccession = new Map();

function getRecord(accession) {
  let record = records.get(accession);
  if (!record) {
    record = {
      chebiId: accession,
      preferredName: null,
      iupacName: null,
      smiles: null,
      inchiKey: null,
      formula: null,
      aliases: new Set(),
      structureIsDefault: false,
    };
    records.set(accession, record);
  }
  return record;
}

function resolveCompoundReference(value) {
  const accession = normalizeAccession(value);
  if (accession) return accession;

  const numeric = normalizeNumericId(value);
  if (!numeric) return null;

  return compoundIdToAccession.get(numeric) ?? null;
}

// 1) Compounds are the authority for translating ChEBI's internal numeric
// compound IDs into stable CHEBI: accessions. Do not assume those namespaces
// are interchangeable across every ChEBI flat-file table.
{
  const file = join(inputDir, 'compounds.tsv.gz');
  let idCol = -1;
  let accessionCol = -1;
  let nameCol = -1;

  await forEachGzipTsv(
    file,
    (headers) => {
      idCol = findColumn(headers, ['id', 'compound_id']);
      accessionCol = findColumn(headers, ['chebi_accession', 'chebi_id'], false);
      nameCol = findColumn(headers, ['name', 'chebi_name', 'ascii_name']);
    },
    (row) => {
      const numericId = normalizeNumericId(row[idCol]);
      const explicitAccession =
        accessionCol >= 0 ? normalizeAccession(row[accessionCol]) : null;
      const accession =
        explicitAccession ?? (numericId ? `CHEBI:${numericId}` : null);
      if (!accession) return;

      if (numericId) compoundIdToAccession.set(numericId, accession);
      compoundIdToAccession.set(accession.replace(/^CHEBI:/, ''), accession);

      const record = getRecord(accession);
      const name = String(row[nameCol] ?? '').trim();
      if (name) {
        record.preferredName = name;
        record.aliases.add(name);
      }
    },
  );
}

if (records.size === 0) {
  throw new Error('No compounds were read from compounds.tsv.gz.');
}

// 2) Names/synonyms. Resolve compound_id through the compounds table instead
// of manufacturing CHEBI:<compound_id> independently.
{
  const file = join(inputDir, 'names.tsv.gz');
  let compoundCol = -1;
  let accessionCol = -1;
  let nameCol = -1;
  let typeCol = -1;
  let languageCol = -1;

  await forEachGzipTsv(
    file,
    (headers) => {
      compoundCol = findColumn(headers, ['compound_id', 'chebi_id', 'id']);
      accessionCol = findColumn(headers, ['chebi_accession'], false);
      nameCol = findColumn(headers, ['name', 'synonym', 'ascii_name', 'value']);
      typeCol = findColumn(headers, ['type', 'name_type', 'type_name'], false);
      languageCol = findColumn(headers, ['language_code', 'language'], false);
    },
    (row) => {
      const accession =
        (accessionCol >= 0 ? normalizeAccession(row[accessionCol]) : null) ??
        resolveCompoundReference(row[compoundCol]);
      if (!accession) return;

      const language =
        languageCol >= 0 ? String(row[languageCol] ?? '').trim().toLowerCase() : '';
      // Keep English plus rows with no language marker. This avoids making the
      // browser alias index unnecessarily huge while preserving normal inputs.
      if (language && language !== 'en') return;

      const name = String(row[nameCol] ?? '').trim();
      if (!name) return;

      const record = getRecord(accession);
      record.aliases.add(name);

      const type = typeCol >= 0 ? String(row[typeCol] ?? '').toLowerCase() : '';
      if (type.includes('iupac') && !record.iupacName) {
        record.iupacName = name;
      }
    },
  );
}

// 3) Structures. ChEBI 2.x flat files can expose more than one identifier-like
// column. Prefer a stable CHEBI accession when present; otherwise translate the
// compound foreign key through compounds.tsv. Never key a molecule by the
// structure-row ID merely because a column happens to be called "id".
{
  const file = join(inputDir, 'structures.tsv.gz');
  let accessionCol = -1;
  let compoundCol = -1;
  let idCol = -1;
  let smilesCol = -1;
  let inchiKeyCol = -1;
  let defaultCol = -1;
  let joined = 0;
  let skipped = 0;

  await forEachGzipMultilineTsv(
    file,
    (headers) => {
      accessionCol = findColumn(headers, ['chebi_accession', 'chebi_id'], false);
      compoundCol = findColumn(headers, ['compound_id', 'compoundid'], false);
      idCol = findColumn(headers, ['id', 'structure_id'], false);
      smilesCol = findColumn(
        headers,
        ['smiles', 'canonical_smiles', 'standard_smiles'],
        false,
      );
      inchiKeyCol = findColumn(
        headers,
        ['standard_inchi_key', 'standard_inchikey', 'inchi_key', 'inchikey'],
        false,
      );
      defaultCol = findColumn(
        headers,
        ['default_structure', 'is_default', 'default'],
        false,
      );

      if (smilesCol < 0) {
        throw new Error(
          `structures.tsv.gz has no SMILES column. Headers: ${headers.join(' | ')}`,
        );
      }
    },
    (row) => {
      const candidates = [];
      if (accessionCol >= 0) candidates.push(row[accessionCol]);
      if (compoundCol >= 0) candidates.push(row[compoundCol]);
      // A bare row id is only accepted if it maps to an actual compound from
      // compounds.tsv. This prevents structure IDs from becoming fake CHEBI IDs.
      if (idCol >= 0) candidates.push(row[idCol]);

      let accession = null;
      for (const candidate of candidates) {
        accession = normalizeAccession(candidate) ?? resolveCompoundReference(candidate);
        if (accession && records.has(accession)) break;
        accession = null;
      }

      if (!accession) {
        skipped += 1;
        return;
      }

      const smiles = String(row[smilesCol] ?? '').trim();
      if (!smiles) return;

      const record = getRecord(accession);
      const inchiKey =
        inchiKeyCol >= 0 ? String(row[inchiKeyCol] ?? '').trim() : '';
      const isDefault =
        defaultCol < 0 || /^(1|true|t|yes|y)$/i.test(String(row[defaultCol] ?? '').trim());

      // Prefer ChEBI's designated default structure. If there is no default
      // marker, retain the first usable structure.
      if (!record.smiles || (isDefault && !record.structureIsDefault)) {
        record.smiles = smiles;
        record.inchiKey = inchiKey || record.inchiKey;
        record.structureIsDefault = isDefault;
      }
      joined += 1;
    },
  );

  console.log(`Structure rows joined to compounds: ${joined.toLocaleString()}`);
  if (skipped) {
    console.log(`Structure rows skipped (no compound join): ${skipped.toLocaleString()}`);
  }
}

// 4) Formula. Support both the old TYPE/CHEMICAL_DATA layout and the newer
// direct FORMULA column layout.
{
  const file = join(inputDir, 'chemical_data.tsv.gz');
  let compoundCol = -1;
  let accessionCol = -1;
  let formulaCol = -1;
  let typeCol = -1;
  let valueCol = -1;

  try {
    await forEachGzipTsv(
      file,
      (headers) => {
        compoundCol = findColumn(headers, ['compound_id', 'chebi_id', 'id']);
        accessionCol = findColumn(headers, ['chebi_accession'], false);
        formulaCol = findColumn(headers, ['formula', 'molecular_formula'], false);
        typeCol = findColumn(headers, ['type', 'chemical_data_type', 'type_name'], false);
        valueCol = findColumn(headers, ['chemical_data', 'value', 'data'], false);
      },
      (row) => {
        const accession =
          (accessionCol >= 0 ? normalizeAccession(row[accessionCol]) : null) ??
          resolveCompoundReference(row[compoundCol]);
        if (!accession) return;

        let formula = formulaCol >= 0 ? String(row[formulaCol] ?? '').trim() : '';
        if (!formula && typeCol >= 0 && valueCol >= 0) {
          const type = String(row[typeCol] ?? '').toLowerCase();
          if (type.includes('formula')) formula = String(row[valueCol] ?? '').trim();
        }
        if (formula) getRecord(accession).formula = formula;
      },
    );
  } catch (error) {
    console.warn(`Skipping ${basename(file)}: ${error.message}`);
  }
}

const browserRecords = new Map(
  [...records.entries()].filter(([, record]) => Boolean(record.smiles)),
);

const aliasCandidates = Object.create(null);
for (const [id, record] of browserRecords) {
  for (const alias of record.aliases) {
    const key = normalize(alias);
    if (!key || key.length > 240) continue;
    const ids = aliasCandidates[key] ?? (aliasCandidates[key] = []);
    if (!ids.includes(id)) ids.push(id);
  }
}

function chooseAliasTarget(key, ids) {
  if (ids.length <= 1) return ids[0] ?? null;

  const preferredMatches = ids.filter(
    (id) => normalize(browserRecords.get(id)?.preferredName) === key,
  );
  if (preferredMatches.length === 1) return preferredMatches[0];

  const iupacMatches = ids.filter(
    (id) => normalize(browserRecords.get(id)?.iupacName) === key,
  );
  if (iupacMatches.length === 1) return iupacMatches[0];

  const structureKeys = ids.map((id) => {
    const record = browserRecords.get(id);
    return record?.inchiKey || record?.smiles || null;
  });
  const first = structureKeys[0];
  if (first && structureKeys.every((value) => value === first)) return ids[0];

  // Preserve genuinely ambiguous aliases as arrays. Runtime code can reject
  // those safely instead of guessing a constitutional/stereochemical isomer.
  return ids;
}

const aliases = Object.create(null);
for (const [key, ids] of Object.entries(aliasCandidates)) {
  const target = chooseAliasTarget(key, ids);
  if (target) aliases[key] = target;
}

const compactRecords = Object.create(null);
for (const [id, record] of browserRecords) {
  compactRecords[id] = {
    s: record.smiles,
    k: record.inchiKey,
    p: record.preferredName,
    i: record.iupacName,
    f: record.formula,
  };
}

// Integrity checks: a 20+ MB database with zero aliases is corrupt for
// PocketChem's purposes. Fail loudly rather than publishing another unusable
// index.
const recordCount = Object.keys(compactRecords).length;
const aliasCount = Object.keys(aliases).length;
if (recordCount === 0) {
  throw new Error('Build failed: no usable structures were joined to ChEBI compounds.');
}
if (aliasCount === 0) {
  throw new Error(
    'Build failed: zero aliases were generated. The ChEBI names-to-structures join is broken.',
  );
}

const arachidonic = aliases[normalize('arachidonic acid')];
if (records.has('CHEBI:15843')) {
  const aaRecord = compactRecords['CHEBI:15843'];
  if (!aaRecord?.s) {
    throw new Error(
      'Build integrity check failed: CHEBI:15843 exists but has no joined SMILES structure.',
    );
  }
  const aaTargets = Array.isArray(arachidonic) ? arachidonic : [arachidonic];
  if (!aaTargets.includes('CHEBI:15843')) {
    throw new Error(
      'Build integrity check failed: "arachidonic acid" does not resolve to CHEBI:15843.',
    );
  }
}

let release = null;
try {
  const readme = await readFile(join(inputDir, 'README'), 'utf8');
  release = readme.match(/ChEBI Release:\s*([^\s]+)/i)?.[1] ?? null;
} catch {
  // Attribution still identifies ChEBI even if README is unavailable.
}

const payload = {
  v: 1,
  generatedAt: new Date().toISOString(),
  source: {
    name: 'ChEBI',
    release,
    url: 'https://www.ebi.ac.uk/chebi',
  },
  records: compactRecords,
  aliases,
};

await mkdir(outputDir, { recursive: true });
const json = JSON.stringify(payload);
const jsonPath = join(outputDir, 'chemical-names.index.json');
const gzipPath = `${jsonPath}.gz`;
await writeFile(jsonPath, json);
await writeFile(gzipPath, gzipSync(json, { level: 9 }));

console.log(`Wrote ${jsonPath}`);
console.log(`Wrote ${gzipPath}`);
console.log(`Records: ${recordCount.toLocaleString()}`);
console.log(`Aliases: ${aliasCount.toLocaleString()}`);
console.log(
  `Arachidonic acid: ${JSON.stringify(aliases[normalize('arachidonic acid')] ?? null)}`,
);
console.log('\nKeep ChEBI attribution visible in PocketChem documentation/about UI.');
