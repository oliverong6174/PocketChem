import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine, loadModule, closeEngine } from './engine.mjs';
let presentation, acid, base;
before(async()=>{await loadEngine();presentation=await loadModule('/src/utils/acidBasePresentation.ts');acid=await loadModule('/src/utils/ranking/acidBase/analyzeAcidity.ts');base=await loadModule('/src/utils/ranking/acidBase/analyzeBasicity.ts');});
after(closeEngine);
test('table preserves original estimates, confidence, rank and atom index with full detail',async()=>{
  const acids=await acid.analyzeAcidity('CC(=O)O',[]), bases=await base.analyzeBasicity('NCC(=O)O',[]);
  const rows=presentation.acidBaseSiteRows(acids,bases);
  assert.equal(rows.length,acids.length+bases.length);
  for(const [i,r] of rows.entries()) {
    const source=i<acids.length?acids[i]:bases[i-acids.length];
    assert.equal(r.detail,source);assert.equal(r.atomIndex,source.siteAtomIndex);
    assert.equal(r.confidence,source.confidence);assert.equal(r.range,source.estimatedPkaRange??source.conjugateAcidPkaRange);
    assert.ok(r.reasons.length>0 && r.reasons.length<=4);
  }
  assert.equal(rows[0].rank,1);assert.equal(rows[acids.length].rank,1);
});
test('empty analyses stay empty',()=>assert.deepEqual(presentation.acidBaseSiteRows([],[]),[]));
