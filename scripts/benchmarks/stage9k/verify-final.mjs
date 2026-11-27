// Read-only delivery checks. Never executes a chemistry prediction.
import fs from 'node:fs';import path from'node:path';import crypto from'node:crypto';import {execFileSync}from'node:child_process';import{here,root}from'./molecules.mjs';
const read=p=>JSON.parse(fs.readFileSync(path.join(here,p),'utf8')),git=(...a)=>execFileSync('git',a,{cwd:root,encoding:'utf8'}).trim();
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');let checked=0;
for(const[f,h]of Object.entries(read('manifest.json').hashes)){if(sha(path.join(here,f))!==h)throw Error('Frozen mismatch '+f);checked++;}
for(const[f,h]of Object.entries(read('EVIDENCE-HASHES.json'))){if(sha(path.join(here,f))!==h)throw Error('Evidence mismatch '+f);checked++;}
const start=read('starting-state.json');for(const[f,h]of Object.entries({...start.historicSHA256,...start.unrelatedSHA256})){if(sha(path.join(root,f))!==h)throw Error('Historical/unrelated mismatch '+f);checked++;}
if(git('rev-parse','HEAD:src')!==start.srcTree)throw Error('Production tree changed');
const changed=git('diff','--name-only',start.head,'HEAD').split('\n').filter(Boolean);if(changed.some(f=>!f.startsWith('scripts/benchmarks/stage9k/')))throw Error('Out of scope committed change');
const cases=read('cases.json').cases,raw=fs.readFileSync(path.join(here,'results/raw.jsonl'),'utf8').trim().split('\n').map(JSON.parse),scores=read('results/scores.json');
if(raw.length!==52||new Set(raw.map(r=>r.id)).size!==52||scores.records.length!==52||cases.length!==52)throw Error('Case count mismatch');
if(raw.some(r=>r.record.error||r.exitCode!==0||r.timedOut))throw Error('Execution failure in evidence');
const diagnostics=read('results/diagnostics.json');if(diagnostics.rawFileMismatches.length||diagnostics.scoreMismatches.length)throw Error('Score/raw discrepancy');
const status=git('status','--short');
if(process.argv.includes('--delivery')){
  const tracked=new Set(git('ls-files','-z','--','scripts/benchmarks/stage9k').split('\0'));
  for(const f of Object.keys(read('EVIDENCE-HASHES.json')))if(!tracked.has('scripts/benchmarks/stage9k/'+f))throw Error('Evidence not committed: '+f);
  const expected=['?? CLAUDE.md','?? scripts/browser/stage9fLiveCheck.mjs','?? stage5-changes.patch','?? stage5-status.txt'];
  if(JSON.stringify(status.split('\n').sort())!==JSON.stringify(expected.sort()))throw Error('Unexpected final Git status: '+status);
  if(git('diff','--cached','--name-only'))throw Error('Unexpected staged changes');
}
console.log(JSON.stringify({checkedHashes:checked,frozenFiles:118,historicalFiles:740,uniqueCases:52,errors:0,timeouts:0,productionSrcTree:start.srcTree,head:git('rev-parse','HEAD'),localCommits:git('log','--format=%H %s',start.head+'..HEAD').split('\n'),status},null,2));
