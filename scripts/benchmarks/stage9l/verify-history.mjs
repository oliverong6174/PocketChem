// Read-only historical integrity check. Never imports a prediction engine.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root = process.cwd(), k = path.join(root,'scripts/benchmarks/stage9k');
const read = p => JSON.parse(fs.readFileSync(p,'utf8'));
const sha = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
let count = 0;
for (const [f,h] of Object.entries(read(path.join(k,'manifest.json')).hashes)) {
  if (sha(path.join(k,f)) !== h) throw Error(`Frozen mismatch: ${f}`); count++;
}
for (const [f,h] of Object.entries(read(path.join(k,'EVIDENCE-HASHES.json')))) {
  if (sha(path.join(k,f)) !== h) throw Error(`Evidence mismatch: ${f}`); count++;
}
const start = read(path.join(k,'starting-state.json'));
for (const [f,h] of Object.entries({...start.historicSHA256,...start.unrelatedSHA256})) {
  if (sha(path.join(root,f)) !== h) throw Error(`Historical/unrelated mismatch: ${f}`); count++;
}
// Includes files added to 9K after its evidence manifests (report, manifests).
const { execFileSync } = await import('node:child_process');
const changed = execFileSync('git',['diff','9ab6070','--name-only','--','scripts/benchmarks/stage9k'],{encoding:'utf8'}).trim();
if (changed) throw Error(`Stage 9K changed: ${changed}`);
console.log(JSON.stringify({checkedHashes:count,stage9kUnchanged:true,predictionsExecuted:0}));
