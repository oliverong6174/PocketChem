// Versioned reporting primitives. Operate only on supplied saved records.
export function wilson(correct,n) {
  if (!n) return null;
  const z=1.959963984540054, p=correct/n, d=1+z*z/n;
  const center=(p+z*z/(2*n))/d, half=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/d;
  return [Math.max(0,center-half),Math.min(1,center+half)];
}
const metric=(k,n)=>({count:[k,n],rate:n?k/n:null,wilson95:wilson(k,n)});
export function findingAttribution(record) {
  const findings=record.quality?.findings ?? record.findings ?? (record.codes ?? []).map(s=>{
    const [level,...code]=s.split(':');return {level,code:code.join(':')};
  });
  const adverse=findings.filter(f=>['concern','contradiction'].includes(f.level));
  const replay=adverse.filter(f=>['replay-failed','replay-incomplete','structural-replay-failed'].includes(f.code));
  const bookkeeping=adverse.filter(f=>['unsourced-atoms','atom-sourcing'].includes(f.code));
  const chemical=adverse.filter(f=>!replay.includes(f)&&!bookkeeping.includes(f));
  return {replay:replay.length>0,bookkeeping:bookkeeping.length>0,chemical:chemical.length>0};
}
export function routeSummary(cases,records) {
  const byId=new Map(records.map(r=>[r.id,r]));
  const rows=cases.map(c=>({...c,result:byId.get(c.id)}));
  const positives=rows.filter(r=>r.label==='flag'), negatives=rows.filter(r=>r.label==='clear');
  const flagged=r=>['known-concern','contradicted'].includes(r.result?.tier ?? r.result?.quality?.tier);
  const attr=r=>findingAttribution(r.result ?? {});
  const verified=positives.filter(r=>(r.result?.structural ?? r.result?.quality?.structural)==='verified');
  return {
    inventory:{total:cases.length,counts:Object.fromEntries(['flag','clear','not-supported','ambiguous'].map(label=>[label,rows.filter(r=>r.label===label).length]))},
    missingRecords:rows.filter(r=>!r.result).map(r=>r.id),
    combinedSensitivity:metric(positives.filter(flagged).length,positives.length),
    chemicalSensitivity:metric(positives.filter(r=>attr(r).chemical).length,positives.length),
    verifiedChemicalSensitivity:metric(verified.filter(r=>attr(r).chemical).length,verified.length),
    falsePositiveRate:metric(negatives.filter(flagged).length,negatives.length),
    replayFailures:positives.filter(r=>attr(r).replay).map(r=>r.id),
    replayOnly:positives.filter(r=>attr(r).replay&&!attr(r).chemical&&!attr(r).bookkeeping).map(r=>r.id),
    bookkeeping:positives.filter(r=>attr(r).bookkeeping).map(r=>r.id),
    chemical:positives.filter(r=>attr(r).chemical).map(r=>r.id),
    unscored:{ambiguous:rows.filter(r=>r.label==='ambiguous').map(r=>r.id),unsupported:rows.filter(r=>r.label==='not-supported').map(r=>({id:r.id,tier:r.result?.tier ?? null}))},
  };
}
export function msSummary(rows) {
  const base=r=>r.basePeakMz ?? r.engineBasePeak ?? r.ms?.basePeakMz;
  const label=r=>r.basePeakCertainty ?? r.ms?.basePeakCertainty ?? 'unknown';
  const eligible=(r,key)=>['correct','wrong'].includes(r.dimensions?.[key]?.status);
  const dimension=(rs,key)=>metric(rs.filter(r=>r.dimensions?.[key]?.status==='correct').length,rs.filter(r=>eligible(r,key)).length);
  return {
    n:rows.length,
    numericAbstentions:rows.filter(r=>!Number.isFinite(base(r))).length,
    supportedCoverage:rows.length?rows.filter(r=>label(r)==='supported').length/rows.length:null,
    candidateFieldAvailable:rows.filter(r=>Array.isArray(r.basePeakCandidates ?? r.ms?.basePeakCandidates)).length,
    strata:Object.fromEntries(['supported','heuristic','unreliable','unknown'].map(value=>{
      const rs=rows.filter(r=>label(r)===value);
      return [value,{n:rs.length,basePeak:dimension(rs,'basePeak'),fragments:dimension(rs,'fragments')}];
    })),
  };
}
