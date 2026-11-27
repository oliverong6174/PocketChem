import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeSummary, msSummary, wilson } from '../benchmarks/stage9l/reporting.mjs';
test('route report separates replay, bookkeeping, chemical findings and exclusions',()=>{
  const cases=[{id:'a',label:'flag'},{id:'b',label:'flag'},{id:'c',label:'flag'},{id:'d',label:'clear'},
    {id:'e',label:'ambiguous'},{id:'f',label:'not-supported'}];
  const result=routeSummary(cases,[
    {id:'a',structural:'failed',tier:'contradicted',codes:['contradiction:replay-failed']},
    {id:'b',structural:'failed',tier:'contradicted',codes:['contradiction:replay-failed','contradiction:unsourced-atoms']},
    {id:'c',structural:'verified',tier:'known-concern',codes:['concern:compatibility-competing-reactivity','incomplete:conditions-unassessed']},
    {id:'d',structural:'verified',tier:'plausible-incomplete',codes:['incomplete:conditions-unassessed']},
  ]);
  assert.equal(result.inventory.total,6);
  assert.deepEqual(result.combinedSensitivity.count,[3,3]);
  assert.deepEqual(result.chemicalSensitivity.count,[1,3]);
  assert.deepEqual(result.verifiedChemicalSensitivity.count,[1,1]);
  assert.deepEqual(result.falsePositiveRate.count,[0,1]);
  assert.deepEqual(result.replayOnly,['a']);
  assert.deepEqual(result.bookkeeping,['b']);
  assert.equal(result.unscored.ambiguous.length,1);
});
test('MS coverage uses real confidence enums, eligible denominators and numerical abstention',()=>{
  const rows=[{basePeakMz:43,basePeakCertainty:'supported',basePeakCandidates:[43,58],dimensions:{basePeak:{status:'correct'},fragments:{status:'wrong'}}},
    {basePeakMz:31,basePeakCertainty:'unreliable',dimensions:{basePeak:{status:'wrong'},fragments:{status:'excluded'}}},
    {basePeakMz:null,dimensions:{basePeak:{status:'wrong'}}}];
  const result=msSummary(rows);
  assert.equal(result.numericAbstentions,1);
  assert.equal(result.supportedCoverage,1/3);
  assert.deepEqual(result.strata.supported.fragments.count,[0,1]);
  assert.deepEqual(result.strata.unreliable.fragments.count,[0,0]);
  assert.equal(result.candidateFieldAvailable,1);
});
test('Wilson intervals use their actual fixed denominator',()=>{
  assert.equal(wilson(0,0),null);
  const interval=wilson(11,12);
  assert.ok(Math.abs(interval[0]-.64612)<.00001);
  assert.ok(Math.abs(wilson(0,13)[1]-.228095)<.00001);
});
