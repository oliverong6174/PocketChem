// Offline audit of saved Stage 9J records. Does not run any holdout or engine.
import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';import crypto from 'node:crypto';
import {here,root,canon,mirror} from './molecules.mjs';import {wilson} from './scoring.mjs';import {namesEquivalent,parseName} from '../stage9j/nameEquivalence.mjs';
const dir=path.join(here,'audit');fs.mkdirSync(dir,{recursive:true});
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const git=(...a)=>execFileSync('git',a,{cwd:root,encoding:'utf8'}).trim();
const cases=read('scripts/benchmarks/stage9j/route-quality/cases.json').cases;
const out={routeInventory:{total:cases.length,counts:cases.reduce((m,c)=>(m[c.label]=(m[c.label]??0)+1,m),{})},routeRuns:{}};
const flagged=r=>['known-concern','contradicted'].includes(r.tier);
for(const f of ['first-run','second-run-harness-v2','third-run-harness-v2b']){
  const {records}=read('scripts/benchmarks/stage9j/route-quality/results/'+f+'.json');const pos=records.filter(r=>r.label==='flag'),neg=records.filter(r=>r.label==='clear'),verified=pos.filter(r=>r.structural==='verified');
  out.routeRuns[f]={positiveN:pos.length,flagged:pos.filter(flagged).length,sensitivityWilson95:wilson(pos.filter(flagged).length,pos.length),negativeN:neg.length,falsePositives:neg.filter(flagged).map(r=>r.id),falsePositiveWilson95:wilson(neg.filter(flagged).length,neg.length),verifiedPositiveN:verified.length,verifiedDetected:verified.filter(flagged).length,verifiedWilson95:wilson(verified.filter(flagged).length,verified.length),positiveDetails:pos.map(r=>({id:r.id,structural:r.structural,tier:r.tier,nonReplayConcerns:r.codes.filter(c=>/^(concern|contradiction):/.test(c)&&c!=='contradiction:replay-failed'),allCodes:r.codes})),tierTotal:records.length};
}
const sources=['scripts/benchmarks/stage9i/ms-dev/results/after-fix.json','scripts/benchmarks/stage9j/ms-dev-b/results/baseline.json'];
out.massSpec={sets:{},pooled:{}};
for(const f of sources){const {summary,records}=read(f),groups={};for(const r of records){const l=r.basePeakCertainty??'none',g=groups[l]??={n:0,baseCorrect:0,fragmentN:0,fragmentCorrect:0};g.n++;if(r.dimensions.basePeak.status==='correct')g.baseCorrect++;if(r.dimensions.fragments){g.fragmentN++;if(r.dimensions.fragments.status==='correct')g.fragmentCorrect++;}}
  out.massSpec.sets[f]={summary,recomputed:groups};for(const [l,g] of Object.entries(groups)){const p=out.massSpec.pooled[l]??={n:0,baseCorrect:0,fragmentN:0,fragmentCorrect:0};for(const k of Object.keys(p))p[k]+=g[k];}}
for(const p of Object.values(out.massSpec.pooled))p.wilson95=wilson(p.baseCorrect,p.n);
const pairs=[
  ['(R)-butan-2-ol','(S)-butan-2-ol',false],
  ['(E)-hept-3-ene','(Z)-hept-3-ene',false],
  ['(2R)-hexane-2,4-diol','(4R)-hexane-2,4-diol',false],
  ['(2E)-hepta-2,4-diene','(4E)-hepta-2,4-diene',false],
  ['(2R,4S)-hexane-2,4-diol','(4R,2S)-hexane-2,4-diol',false],
  ['(2R,3S)-butane-2,3-diol','(2S,3R)-butane-2,3-diol',true],
  ['cis-(1R,2R)-cyclohexane-1,2-diol','trans-(1R,2R)-cyclohexane-1,2-diol',false]
];
out.comparatorProbes=pairs.map(([a,b,expected])=>({a,b,expected,actual:namesEquivalent(a,b),parsedA:parseName(a),parsedB:parseName(b)}));
out.dielsAlder={allCis:'C1[C@H](C)C=C[C@H](C)[C@@H]1C(=O)OC',exo:'C1[C@@H](C)C=C[C@@H](C)[C@@H]1C(=O)OC'};
out.dielsAlder.validAllCis=!!canon(out.dielsAlder.allCis);out.dielsAlder.validExo=!!canon(out.dielsAlder.exo);out.dielsAlder.distinctDiastereomers=![canon(out.dielsAlder.exo),canon(mirror(out.dielsAlder.exo))].includes(canon(out.dielsAlder.allCis));
out.git={original:'4218536dd9522d81808957af8d01c048b4ba4b9c',amended:'7f4cdc021790f1d047f96ff9f2c89352ba4c58ee',amendDifference:git('diff','--name-status','4218536','7f4cdc0'),originalFiles:git('show','--format=','--name-only','4218536').split('\n'),amendedFiles:git('show','--format=','--name-only','7f4cdc0').split('\n'),olderArtifactChangesDuring9J:git('diff','--name-status','7763b44','7f4cdc0','--','scripts/benchmarks/stage9f','scripts/benchmarks/stage9h','scripts/benchmarks/stage9i'),all9JFiles:git('diff','--name-status','7763b44','7f4cdc0')};
const start=JSON.parse(fs.readFileSync(path.join(here,'starting-state.json'),'utf8'));
out.integrity={historicFilesChecked:Object.keys(start.historicSHA256).length,historicMismatches:[],unrelatedMismatches:[],srcTreeUnchanged:git('rev-parse','HEAD:src')===start.srcTree};
for(const [p,sha]of Object.entries(start.historicSHA256))if(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex')!==sha)out.integrity.historicMismatches.push(p);
for(const [p,sha]of Object.entries(start.unrelatedSHA256))if(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex')!==sha)out.integrity.unrelatedMismatches.push(p);
out.git.originalBrowserBlob=git('rev-parse','4218536:scripts/browser/stage9fLiveCheck.mjs');out.git.currentUntrackedBrowserBlob=git('hash-object','scripts/browser/stage9fLiveCheck.mjs');
fs.writeFileSync(path.join(dir,'records.json'),JSON.stringify(out,null,2)+'\n');
fs.writeFileSync(path.join(dir,'git-history.txt'),git('reflog','--all','--format=%H %gd %gs','-30')+'\n\n'+out.git.all9JFiles+'\n');
const freeze={freezeCommit:git('rev-parse','03e017b'),engineCommit:start.head,engineSrcTree:start.srcTree,manifestSHA256:crypto.createHash('sha256').update(fs.readFileSync(path.join(here,'manifest.json'))).digest('hex'),casesSHA256:crypto.createHash('sha256').update(fs.readFileSync(path.join(here,'cases.json'))).digest('hex')};
fs.writeFileSync(path.join(dir,'freeze-record.json'),JSON.stringify(freeze,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({inventory:out.routeInventory,massSpec:out.massSpec.pooled,comparatorProbes:out.comparatorProbes.map(p=>({a:p.a,b:p.b,expected:p.expected,actual:p.actual})),git:out.git.amendDifference,integrity:out.integrity},null,2));
