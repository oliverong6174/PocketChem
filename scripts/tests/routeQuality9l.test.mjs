import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { loadModule, closeEngine } from './engine.mjs';
let quality;
before(async()=> {quality=await loadModule('/src/utils/reactions/engine/routeQuality.ts');});
after(closeEngine);
const rule=(reagents,note='',sources)=>({id:'source-probe',reagents,reagentNote:note,reagentAtomSources:sources});
async function assess(r,product,label='',reactant='CC=O') {
  const route={steps:[{ruleId:r.id,stepNumber:1,reactantComponents:[reactant],productComponents:[product],reagentLabel:label}]};
  return quality.assessRouteQuality(route,[r]);
}
test('capitalized prose and saved labels cannot supply product atoms',async()=> {
  for(const [text,product] of [['Catalytic conditions','CC[Ca]'],['Compatible conditions','CC[Co]'],['Polar aprotic','CCP']]) {
    const q=await assess(rule(text),product);
    assert.ok(q.findings.some(f=>f.code==='unsourced-atoms'),text);
    assert.ok(!q.findings.some(f=>f.code==='documented-reagents'),text);
  }
  for(const [note,label] of [['Sulfur is incompatible here',''],['','P, Br2']]) {
    const q=await assess(rule('NaBH4',note),label?'CCBr':'CCS',label);
    assert.ok(q.findings.some(f=>f.code==='unsourced-atoms'));
  }
});
test('complete chemical formulas remain recognized; Ph3P cannot supply ligand carbon',async()=> {
  for(const [reagent,product] of [['HBr','CCBr'],['NaCN','CCC#N'],['NH3','CCN'],['Me3SiCl','CC[Si](C)(C)C']])
    assert.ok(!(await assess(rule(reagent),product)).findings.some(f=>f.code==='unsourced-atoms'),reagent);
  assert.ok((await assess(rule('Ph3P, strong base'),'CCCC')).findings.some(f=>f.code==='unsourced-atoms'));
});
test('explicit source metadata is authoritative and unknown provenance is disclosed',async()=> {
  assert.ok(!(await assess(rule('named nitrogen donor','',['N']),'CCN')).findings.some(f=>f.code==='unsourced-atoms'));
  assert.ok((await assess(rule('NaCN','',[]),'CCC#N')).findings.some(f=>f.code==='unsourced-atoms'));
  const unknown=await assess(rule('proprietary donor'),'CCO');
  assert.ok(unknown.findings.some(f=>f.code==='reagent-source-unresolved' && f.level==='incomplete'));
  const unresolved=await assess(rule('proprietary donor'),'CCP');
  assert.ok(!unresolved.findings.some(f=>f.code==='unsourced-atoms' && f.level==='contradiction'));
});
test('declared phosphate donor remains a valid atom source for its real rule',async()=> {
  const {modules,runRule}=await import('./fixtures/convergentHelpers.mjs');
  const {registry}=await modules();
  const r=registry.find(r=>r.id==='alcohol-phosphate-ester');
  const paths=await runRule(r.id,['CCCCCO']);
  assert.ok(paths.length);
  for(const p of paths)assert.ok(!(await assess(r,p.productSmiles,'','CCCCCO')).findings.some(f=>f.code==='unsourced-atoms'));
});
