import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { loadModule, closeEngine } from './engine.mjs';
let ms, names, groups, candidates, normalize;
before(async () => {
  ms = await loadModule('/src/utils/spectroscopy/massSpec.ts');
  names = await loadModule('/src/utils/nomenclatureUtils.ts');
  groups = await loadModule('/src/utils/functionalGroups/index.ts');
  normalize = await loadModule('/src/utils/spectroscopy/massSpec/peakNormalization.ts');
});
after(closeEngine);
async function spectrum(s) {
  const h = await groups.analyzeFunctionalGroupHierarchy(s);
  const identity = await names.analyzeNomenclatureAndProperties(s,h.primaryGroups,h.mainGroup);
  return ms.predictMassSpectrum(identity.properties.molecularFormula, Number(identity.properties.exactMass), h.functionalGroups,s);
}
test('a methyl diazine cannot produce a six-carbon phenyl ion', async () => {
  const out = await spectrum('Cc1ncccn1');
  assert.ok(!out.peaks.some(p=>p.mz === 77 && /phenyl/i.test(p.explanation)));
  // Broad aromatic group metadata must never authorize an impossible C6 ion.
  const broad = await ms.predictMassSpectrum('C5H5N',79.0422,[{name:'Benzene'}],'c1ccncc1');
  assert.ok(!broad.peaks.some(p=>p.mz===77 && /phenyl/i.test(p.explanation)));
  const poorH=await ms.predictMassSpectrum('C6F6',185.9904,[{name:'Aryl halide'}],'Fc1c(F)c(F)c(F)c(F)c1F');
  assert.ok(!poorH.peaks.some(p=>p.mz===77 && /phenyl/i.test(p.explanation)));
});
test('duplicate descriptions of one direct-cleavage ion do not inflate its abundance', () => {
  const base = {mz:43,relativeIntensity:40,label:'alpha',kind:'fragment',explanation:'one cleavage',channelKey:'direct:acetyl'};
  const p = normalize.mergeAndNormalizePeaks([base,{...base,relativeIntensity:30,label:'diagnostic'},
    {...base,mz:58,relativeIntensity:60,channelKey:'rearrangement'}]);
  assert.equal(p.find(p=>p.mz===58).relativeIntensity,100);
  assert.ok(p.find(p=>p.mz===43).relativeIntensity < 70);
  const distinctSites=normalize.mergeAndNormalizePeaks([
    {...base,channelSource:'graph'}, {...base,relativeIntensity:30,channelSource:'graph'},
    {...base,relativeIntensity:35,channelSource:'diagnostic'},
    {...base,mz:58,relativeIntensity:60,channelKey:'rearrangement'}]);
  assert.equal(distinctSites.find(p=>p.mz===43).relativeIntensity,100);
  assert.equal(distinctSites.find(p=>p.mz===43).pathwayCount,2);
});
test('new rearrangement candidates conserve composition without invented intensities', async () => {
  candidates = await loadModule('/src/utils/spectroscopy/massSpec/fragmentCandidates.ts');
  const fixtures = [
    ['CCCCCCCCCCCO','C11H24O',[[126,'C9H18'],[98,'C7H14'],[70,'C5H10'],[55,'C4H7']]],
    ['CCCCCCCCCCC=O','C11H22O',[[56,'C4H8'],[70,'C5H10']]],
    ['O=C1CCCCCCC1','C8H14O',[[98,'C6H10O'],[70,'C5H10']]],
    ['Cc1ncccn1','C5H6N2',[[67,'C4H5N'],[40,'C3H4']]],
    ['Cc1cccnn1','C5H6N2',[[66,'C5H6'],[65,'C5H5']]],
  ];
  const parse = f => Object.fromEntries([...f.matchAll(/([A-Z][a-z]?)(\d*)/g)].map(m=>[m[1],Number(m[2]||1)]));
  const masses = {C:12,H:1,N:14,O:16};
  for (const [s,formula,expected] of fixtures) {
    const out = await candidates.predictFragmentCandidates(s);
    for (const [mz,ionFormula] of expected) assert.ok(out.some(p=>p.mz===mz && p.ionFormula===ionFormula),`${s}: ${mz} ${ionFormula}`);
    for (const p of out) {
      assert.equal(p.charge,1);
      assert.equal(p.relativeIntensity,undefined);
      const parent=parse(formula), ion=parse(p.ionFormula), lost=parse(p.neutralLossFormula);
      for (const el of new Set([...Object.keys(parent),...Object.keys(ion),...Object.keys(lost)]))
        assert.equal((ion[el]||0)+(lost[el]||0),parent[el]||0,`${s}: ${el}`);
      assert.equal(Object.entries(ion).reduce((v,[el,n])=>v+masses[el]*n,0),p.mz);
    }
  }
});
test('unsupported isotope, charge, branched alcohol and polycycle inputs do not get linear-chain candidates', async () => {
  candidates ??= await loadModule('/src/utils/spectroscopy/massSpec/fragmentCandidates.ts');
  for (const s of ['[13CH3]CCCCO','CCCC[O-]','[CH2]CCCCO','CCC(O)(C)CC','O=C1CCC2CCCCC12','CCO'])
    assert.deepEqual(await candidates.predictFragmentCandidates(s),[],s);
});
test('the result separates unranked candidates from chart intensities and certainty', async () => {
  const out=await spectrum('CCCCCCCCCCCO');
  assert.ok(out.fragmentCandidates.some(p=>p.mz===70));
  assert.equal(out.basePeakCertainty,'unreliable');
  assert.ok(out.notes.some(n=>/unranked/i.test(n)));
});
test('unranked competing channels prevent a supported base-peak claim', async () => {
  const out=await spectrum('Cc1ncccn1');
  assert.ok(out.fragmentCandidates.length>0);
  assert.notEqual(out.basePeakCertainty,'supported');
  assert.match(out.basePeakBasis,/abundance|unranked/i);
});
test('saved candidate compositions round-trip; malformed candidates are rejected', async () => {
  const ws=await loadModule('/src/utils/persistence/spectroscopyWorkspace.ts');
  const massSpec=await spectrum('CCCCCCCCCCCO');
  const saved={inputKey:'k',smiles:'CCCCCCCCCCCO',structureSource:'CCCCCCCCCCCO',name:null,formula:'C11H24O',
    result:{ir:[],protonNMR:[],carbonNMR:[],massSpec}};
  const restored=ws.validateSpectroscopyResults(JSON.parse(JSON.stringify(saved)));
  assert.deepEqual(restored?.result.massSpec.fragmentCandidates,massSpec.fragmentCandidates);
  saved.result.massSpec.fragmentCandidates=[{mz:70,ionFormula:'C5H10',charge:1,mechanism:'test',explanation:{bad:true}}];
  assert.equal(ws.validateSpectroscopyResults(saved),null);
});
