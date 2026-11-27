// Post-run diagnostics only. Frozen scorer, answers and predictions remain untouched.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {execFileSync}from'node:child_process';
import {here,root,canon,mirror}from'./molecules.mjs';import{score,wilson}from'./scoring.mjs';
const dir=path.join(here,'results'),read=p=>JSON.parse(fs.readFileSync(path.join(here,p),'utf8'));
const cases=read('cases.json').cases,scores=read('results/scores.json'),raw=fs.readFileSync(path.join(dir,'raw.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
const out={executed:raw.length,uniqueCaseIDs:new Set(raw.map(r=>r.id)).size,errors:raw.filter(r=>r.record.error||r.exitCode!==0||r.timedOut).map(r=>({id:r.id,error:r.record.error,exitCode:r.exitCode,timedOut:r.timedOut})),rawFileMismatches:[],scoreMismatches:[],fragmentRecall:{hit:0,n:0},massSpecConfidence:{},routeRows:[],reactionRows:[],nameCoverage:{n:0,emitted:0,abstained:0},reactionFilterContamination:[],benchmarkErrata:[]};
for(const c of cases){
  const envelope=raw.find(r=>r.id===c.id),prediction=read('results/'+c.id+'.json');
  if(JSON.stringify(prediction)!==JSON.stringify(envelope.record))out.rawFileMismatches.push(c.id);
  const copy=structuredClone(prediction),res=path.join(dir,'identity-resolution',c.id+'.json');if(fs.existsSync(res))copy.resolvedIdentity=JSON.parse(fs.readFileSync(res,'utf8'));
  const dims=score(c,copy,{canon,mirror}),saved=scores.records.find(r=>r.id===c.id).dimensions;
  if(JSON.stringify(dims)!==JSON.stringify(saved))out.scoreMismatches.push(c.id);
  if(dims.fragmentRecall){out.fragmentRecall.hit+=dims.fragmentRecall.hit;out.fragmentRecall.n+=dims.fragmentRecall.n;}
  if(c.kind==='ms'){
    const label=prediction.ms.basePeakCertainty??'none',g=out.massSpecConfidence[label]??={n:0,baseCorrect:0};g.n++;if(dims.basePeak.status==='correct')g.baseCorrect++;
  }
  if(c.kind==='nomenclature'){out.nameCoverage.n++;if(prediction.identity.nomenclature.namingStatus==='unsupported')out.nameCoverage.abstained++;else out.nameCoverage.emitted++;}
  if(c.kind==='route'){
    const findings=prediction.quality.findings,nonReplayChemical=findings.filter(f=>['concern','contradiction'].includes(f.level)&&f.code!=='replay-failed'&&f.code!=='unsourced-atoms');
    out.routeRows.push({id:c.id,label:c.expected.label,tier:prediction.quality.tier,structural:prediction.route.verification.status,construction:prediction.construction,chemicalCodes:nonReplayChemical.map(f=>f.code),replayFailure:findings.some(f=>f.code==='replay-failed'),allCodes:findings.map(f=>f.level+':'+f.code)});
  }
  if(c.kind==='reaction'){
    out.reactionRows.push({id:c.id,selectedRules:[...new Set(prediction.selected.map(p=>p.ruleId))],dimensions:dims});
    const wrongRules=prediction.selected.filter(p=>
      c.family==='hbr'?p.ruleId!=='alkene-hx-addition-hbr':
      c.family==='bromination'?p.ruleId!=='alkene-halogenation-bromine':
      ['lindlar','dissolving-metal'].includes(c.family)?/deuteration/.test(p.ruleId):false).map(p=>p.ruleId);
    if(wrongRules.length)out.reactionFilterContamination.push({id:c.id,wrongRules,interpretation:'Harness over-selection, not an engine reagent-conditioned false prediction. Frozen score retained; no rerun or replacement score.'});
  }
}
for(const g of Object.values(out.massSpecConfidence))g.wilson95=wilson(g.baseCorrect,g.n);
const pos=out.routeRows.filter(r=>r.label==='flag'),verified=pos.filter(r=>r.structural==='verified');
out.routeBreakdown={positiveN:pos.length,endToEndFlagged:pos.filter(r=>['known-concern','contradicted'].includes(r.tier)).length,chemistryFindingN:pos.filter(r=>r.chemicalCodes.length).length,chemistryFindingWilson95:wilson(pos.filter(r=>r.chemicalCodes.length).length,pos.length),verifiedPositiveN:verified.length,verifiedChemicalDetected:verified.filter(r=>r.chemicalCodes.length).length,verifiedWilson95:wilson(verified.filter(r=>r.chemicalCodes.length).length,verified.length),replayOnly:pos.filter(r=>r.replayFailure&&!r.chemicalCodes.length).map(r=>r.id),negativeN:out.routeRows.filter(r=>r.label==='clear').length};
out.benchmarkErrata=[
{id:'K-01',cases:['RX-01','RX-04','RX-06','RX-08','RX-09'],issue:'Frozen regex pathway-family filters match CHBr3 as HBr, hydrobromination as bromination, and D2 pathways under reduction families. Raw allPathways/selected reveal contamination. No frozen files or scores changed.'},
{id:'K-02',cases:['RX-06'],issue:'C1=CCCCCCC1 has unspecified E/Z geometry; cyclooctene can have both cis and trans configurations. The trans vicinal dibromide answer assumes cis substrate. Engine explicitly abstains from relative stereo; do not call this a demonstrated chemical failure. Already excluded from A scoring; retained in frozen B denominator and flagged as underdetermined.'},
{id:'K-03',cases:out.routeRows.map(r=>r.id),issue:'Frozen routeQualityOnly.nonInfoFindings annotation uses obsolete replay-code exclusions and includes incomplete/support levels. It is not a chemical-only detection count. This diagnostic file instead classifies concern/contradiction, excluding replay-failed and unsourced-atoms. Primary frozen sensitivity/specificity scores unchanged.'},
{id:'K-04',cases:['RX-07'],issue:'Symmetric cis-1,2-dimethylcycloheptane is meso; the frozen racemic metadata is imprecise. mirror canonical equals target, so relative stereo scoring and completeness set have no duplicated enantiomer. No answer or score changed.'}
];
const start=read('starting-state.json');out.integrity={historicN:Object.keys(start.historicSHA256).length,historicMismatches:[],unrelatedMismatches:[],frozenMismatches:[],srcTreeUnchanged:execFileSync('git',['rev-parse','HEAD:src'],{cwd:root,encoding:'utf8'}).trim()===start.srcTree};
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
for(const [p,h]of Object.entries(start.historicSHA256))if(sha(path.join(root,p))!==h)out.integrity.historicMismatches.push(p);
for(const [p,h]of Object.entries(start.unrelatedSHA256))if(sha(path.join(root,p))!==h)out.integrity.unrelatedMismatches.push(p);
for(const [p,h]of Object.entries(read('manifest.json').hashes))if(sha(path.join(here,p))!==h)out.integrity.frozenMismatches.push(p);
fs.writeFileSync(path.join(dir,'diagnostics.json'),JSON.stringify(out,null,2)+'\n',{flag:'wx'});
if(out.errors.length||out.rawFileMismatches.length||out.scoreMismatches.length||out.integrity.historicMismatches.length||out.integrity.unrelatedMismatches.length||out.integrity.frozenMismatches.length||!out.integrity.srcTreeUnchanged)throw Error('Verification discrepancies; inspect diagnostics');
console.log(JSON.stringify({executed:out.executed,unique:out.uniqueCaseIDs,errors:out.errors,scoreMismatches:out.scoreMismatches,fragmentRecall:out.fragmentRecall,confidence:out.massSpecConfidence,routeBreakdown:out.routeBreakdown,filterContamination:out.reactionFilterContamination,integrity:out.integrity},null,2));
