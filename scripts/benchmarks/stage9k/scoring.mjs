// Frozen, pure scoring. No PocketChem imports. Molecular canonicalization is supplied.
export const norm=s=>String(s??'').normalize('NFKC').toLowerCase().replace(/[\s\-\u2010-\u2015]/g,'');
export function wilson(k,n){if(!n)return null;const z=1.959963984540054,d=1+z*z/n,m=(k/n+z*z/(2*n))/d,h=z*Math.sqrt(k/n*(1-k/n)/n+z*z/(4*n*n))/d;return [m-h,m+h];}
const v=(status,detail='')=>({status,detail});
const known=s=>/[@/\\]/.test(s);
export function score(c,out,h){
  if(!out||out.error)return Object.fromEntries(c.criteria.map(d=>[d,v(out?.timedOut?'timeout':'execution-error',out?.error??'missing output')]));
  const dims={};
  if(c.kind==='nomenclature'){
    const n=out.identity.nomenclature, name=n.estimatedName??n.displayName;
    const abstain=n.namingStatus==='unsupported'||!name;
    const matched=c.expected.accepted_names.some(s=>norm(s)===norm(name));
    dims.nomenclature=v(abstain?'abstained':matched?'correct':'lexical-mismatch',name);
    // Independent name resolution is an auxiliary, post-prediction reference call.
    const resolved=out.resolvedIdentity;
    dims.molecularIdentity=v(abstain?'abstained':resolved?.smiles?(h.canon(resolved.smiles)===h.canon(c.smiles)?'correct':'wrong'):matched?'correct':'unresolved',resolved?.error??name);
    if(c.criteria.includes('stereochemistry'))dims.stereochemistry=v(abstain?'abstained':resolved?.smiles?(h.canon(resolved.smiles)===h.canon(c.smiles)?'correct':'wrong'):matched?'correct':'unresolved');
  }else if(c.kind==='ms'){
    const ms=out.ms;
    if(c.criteria.includes('molecularIon'))dims.molecularIon=v(Number.isFinite(ms.molecularIonMz)?Math.abs(ms.molecularIonMz-c.expected.molecular_ion_mz)<=0.5?'correct':'wrong':'abstained');
    dims.basePeak=v(Number.isFinite(ms.basePeakMz)?c.expected.base_peaks_mz.some(m=>Math.abs(m-ms.basePeakMz)<=0.5)?'correct':'wrong':'abstained');
    if(c.criteria.includes('keyFragments')){
      const keys=c.expected.key_fragments,hit=keys.filter(k=>ms.peaks.some(p=>Math.abs(k.mz-p.mz)<=0.5&&p.relativeIntensity>0)).length;
      dims.keyFragments=v(hit===keys.length?'correct':'wrong',`${hit}/${keys.length} key peaks present`);
      dims.fragmentRecall={status:'count',hit,n:keys.length};
    }
  }else if(c.kind==='reaction'){
    const products=out.products??[],wanted=c.expected.products.map(p=>h.canon(p.smiles,false));
    const got=products.map(p=>h.canon(p.smiles,false));
    const exists=wanted.every(w=>got.includes(w));
    dims.connectivity=v(!products.length?'abstained':exists?'correct':'wrong','Reference constitutional product present in condition-matched pathways');
    if(c.criteria.includes('regiochemistry')){
      const forb=[...c.expected.forbidden,...c.expected.minor].map(s=>h.canon(s,false));
      const conflicts=products.filter(p=>forb.includes(h.canon(p.smiles,false)));
      const ranked=products.filter(p=>p.level==='major');
      dims.regiochemistry=v(!products.length?'abstained':!exists?'wrong':!conflicts.length?'correct':ranked.length?(ranked.every(p=>wanted.includes(h.canon(p.smiles,false)))?'correct':'wrong'):'abstained');
    }
    if(c.criteria.includes('majorMinorRanking')){
      const expected=[...c.expected.products.map(p=>[p.smiles,'major']),...c.expected.minor.map(s=>[s,'minor'])];
      const states=expected.map(([s,level])=>{const ps=products.filter(p=>h.canon(p.smiles,false)===h.canon(s,false));return !ps.length?'missing':ps.some(p=>p.level===level)&&!ps.some(p=>p.level===(level==='major'?'minor':'major'))?'correct':ps.some(p=>['major','minor'].includes(p.level))?'wrong':'abstained';});
      dims.majorMinorRanking=v(states.includes('wrong')?'wrong':states.every(s=>s==='correct')?'correct':states.includes('missing')&&products.length?'incomplete':'abstained',states.join(','));
    }
    if(c.criteria.includes('stereochemistry')){
      const want=c.expected.products[0].smiles,constitution=h.canon(want,false),ps=products.filter(p=>h.canon(p.smiles,false)===constitution);
      const acceptable=new Set([h.canon(want),...(c.expected.stereo==='racemic'?[h.canon(h.mirror(want))]:[])]);
      const specified=ps.filter(p=>known(p.smiles));
      dims.stereochemistry=v(!products.length?'abstained':!ps.length?'wrong':!specified.length?'incomplete':specified.some(p=>!acceptable.has(h.canon(p.smiles)))?'wrong':ps.some(p=>!known(p.smiles))?'incomplete':'correct','Relative stereochemistry scored; for racemic cases either correct enantiomer depiction accepted. Enantiomer completeness recorded separately.');
      if(c.expected.stereo==='racemic')dims.enantiomerCompleteness=v([...acceptable].every(s=>ps.some(p=>h.canon(p.smiles)===s))?'correct':'incomplete');
    }
  }else if(c.kind==='route'){
    const q=out.quality,flag=['known-concern','contradicted'].includes(q.tier);
    const dim=c.expected.label==='flag'?'routeSensitivity':'routeSpecificity';
    dims[dim]=v((c.expected.label==='flag'?flag:!flag)?'correct':'wrong',q.tier);
    const chemical=(q.findings??[]).filter(f=>f.level!=='info'&&!['structural-replay','structural-replay-failed','route-not-verified'].includes(f.code));
    dims.routeQualityOnly={status:'annotation',structural:out.route.verification.status,nonInfoFindings:chemical,allFindings:q.findings};
  }
  return dims;
}
export function summarize(cases,records){
  const buckets={};
  for(const c of cases){const r=records.find(r=>r.id===c.id);const group=c.source.quality.startsWith('A:')?'A-direct-reference':'B-textbook-extrapolation';
    for(const d of c.criteria){const key=group+'/'+d,b=buckets[key]??={n:0,correct:0,statuses:{}};b.n++;const status=r?.dimensions?.[d]?.status??'missing';b.statuses[status]=(b.statuses[status]??0)+1;if(status==='correct')b.correct++;}
  }
  for(const b of Object.values(buckets)){b.rate=b.correct/b.n;b.wilson95=wilson(b.correct,b.n);}return buckets;
}
