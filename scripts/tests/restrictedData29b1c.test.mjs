// Stage 29B-1C: the CC BY-NC pKa index must not reach a default build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { restrictedData, RESTRICTED_DATA } from '../vite/restrictedData.mjs';

function build(mode) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-restricted-'));
  const file = path.join(root, 'dist', RESTRICTED_DATA[0]);
  const keep = path.join(root, 'dist', 'data', 'chemical-names.index.json.gz');
  const source = path.join(root, 'public', RESTRICTED_DATA[0]);
  for (const f of [file, keep, source]) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, 'x'); }
  const plugin = restrictedData();
  plugin.configResolved({ root, mode, build: { outDir: 'dist' }, logger: { info() {}, warn() {} } });
  plugin.closeBundle();
  const result = { restricted: fs.existsSync(file), keep: fs.existsSync(keep), source: fs.existsSync(source) };
  fs.rmSync(root, { recursive: true, force: true });
  return result;
}

test('a default (production) build drops the restricted index and nothing else', () => {
  assert.deepEqual(build('production'), { restricted: false, keep: true, source: true });
});
test('any other mode also drops it; only the explicit personal mode keeps it', () => {
  assert.equal(build('staging').restricted, false);
  assert.equal(build('personal').restricted, true);
});
test('the project build is wired to the plugin and offers one explicit personal command', () => {
  assert.match(fs.readFileSync('vite.config.ts', 'utf8'), /restrictedData\(\)/);
  const scripts = JSON.parse(fs.readFileSync('package.json', 'utf8')).scripts;
  assert.equal(scripts.build, 'tsc -b && vite build');
  assert.equal(scripts['build:personal'], 'tsc -b && vite build --mode personal');
});
