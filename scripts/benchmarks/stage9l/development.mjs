// Exposed development molecules only. Original code is loaded from the verified
// starting Git checkpoint into temporary repository-local modules, then removed.
// This never reads or runs a frozen benchmark case list.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {loadModule,closeEngine} from '../../tests/engine.mjs';
const fixtures=[
  ['undecan-1-ol','CCCCCCCCCCCO',[126,98,70,55]],
  ['dodecan-1-ol','CCCCCCCCCCCCO',[140,112,84,56]],
  ['undecanal','CCCCCCCCCCC=O',[56,70]],
  ['cyclooctanone','O=C1CCCCCCC1',[98,70]],
  ['2-methylpyrimidine','Cc1ncccn1',[67,40]],
  ['3-methylpyridazine','Cc1cccnn1',[66,65]],
  ['methyl decanoate','CCCCCCCCCC(=O)OC',[74]],
];
const temp=[];
function snapshot(file,replace=[]) {
  let content=execFileSync('git',['show',`9ab6070:${file}`],{encoding:'utf8'});
  for(const [from,to] of replace)content=content.replaceAll(from,to);
  const target=file.replace(/\.ts$/,'Stage9lBaseline.ts');
  if(fs.existsSync(target))throw Error(`Refusing to overwrite ${target}`);
  fs.writeFileSync(target,content);temp.push(target);return '/'+target;
}
const percentile=(a,p)=>[...a].sort((a,b)=>a-b)[Math.min(a.length-1,Math.floor(a.length*p))];
try {
  snapshot('src/utils/spectroscopy/massSpec/peakNormalization.ts');
  snapshot('src/utils/spectroscopy/massSpec/fragmentationEngine.ts');
  const oldPath=snapshot('src/utils/spectroscopy/massSpec.ts',[
    ['./massSpec/peakNormalization','./massSpec/peakNormalizationStage9lBaseline'],
    ['./massSpec/fragmentationEngine','./massSpec/fragmentationEngineStage9lBaseline']]);
  const old=await loadModule(oldPath), current=await loadModule('/src/utils/spectroscopy/massSpec.ts');
  const groups=await loadModule('/src/utils/functionalGroups/index.ts');
  const naming=await loadModule('/src/utils/nomenclatureUtils.ts');
  const candidate=await loadModule('/src/utils/spectroscopy/massSpec/fragmentCandidates.ts');
  const rows=[],oldTimes=[],newTimes=[],candidateTimes=[];
  for(const [name,smiles,expectedCandidates] of fixtures) {
    const h=await groups.analyzeFunctionalGroupHierarchy(smiles);
    const p=(await naming.analyzeNomenclatureAndProperties(smiles,h.primaryGroups,h.mainGroup)).properties;
    const args=[p.molecularFormula,Number(p.exactMass),h.functionalGroups,smiles];
    let before,after;
    // Alternate ordering to reduce systematic warm-cache bias.
    for(let round=0;round<6;round++) {
      for(const [kind,module,times] of (round%2?[[0,old,oldTimes],[1,current,newTimes]]:[[1,current,newTimes],[0,old,oldTimes]])) {
        const t=performance.now(),out=await module.predictMassSpectrum(...args),elapsed=performance.now()-t;
        if(round>0)times.push(elapsed);
        if(kind)after=out;else before=out;
      }
      const t=performance.now();await candidate.predictFragmentCandidates(smiles);
      if(round>0)candidateTimes.push(performance.now()-t);
    }
    const present=(s,mz)=>s.peaks.some(p=>Math.abs(p.mz-mz)<.5) || s.fragmentCandidates?.some(p=>p.mz===mz);
    rows.push({name,smiles,formula:p.molecularFormula,expectedMechanisticCandidates:expectedCandidates,
      before:{base:before.basePeakMz,certainty:before.basePeakCertainty,expectedPresent:expectedCandidates.filter(mz=>present(before,mz)),fragmentCandidates:[]},
      after:{base:after.basePeakMz,certainty:after.basePeakCertainty,expectedPresent:expectedCandidates.filter(mz=>present(after,mz)),fragmentCandidates:after.fragmentCandidates}});
  }
  const stats=a=>({n:a.length,medianMs:percentile(a,.5),p95Ms:percentile(a,.95)});
  const report={checkpoint:'9ab60709f4154dbffd8bcc8adad8dd04f8170f94',evidenceClass:'same-author development; no held-out accuracy or base-peak reference claim',
    rows,performance:{before:stats(oldTimes),after:stats(newTimes),candidateGeneration:stats(candidateTimes),rssBytes:process.memoryUsage().rss},
    notes:['Mass matches include existing ranked peaks and new unranked composition candidates. This is channel coverage, not measured spectral accuracy.',
      'Base peaks remain heuristic; new unranked candidates cannot win the base-peak ranking. No intensity constants were fitted.']};
  fs.writeFileSync('scripts/benchmarks/stage9l/development-results.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({developmentCoverage:rows.map(r=>[r.name,r.before.expectedPresent.length,r.after.expectedPresent.length,r.expectedMechanisticCandidates.length]),performance:report.performance},null,2));
} finally {
  await closeEngine();
  for(const file of temp) {
    const resolved=path.resolve(file),root=path.resolve('src/utils')+path.sep;
    if(!resolved.startsWith(root)||!resolved.endsWith('Stage9lBaseline.ts'))throw Error('Unsafe temporary path');
    fs.unlinkSync(resolved);
  }
}
