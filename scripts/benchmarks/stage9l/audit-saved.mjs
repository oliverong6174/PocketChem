// Historical arithmetic only: no chemistry imports, predictions, or old scorer.
import fs from 'node:fs';
import {routeSummary,msSummary} from './reporting.mjs';
const read=p=>JSON.parse(fs.readFileSync(`scripts/benchmarks/${p}`,'utf8'));
const routeCases=read('stage9j/route-quality/cases.json').cases;
const runs=Object.fromEntries(['first-run','second-run-harness-v2','third-run-harness-v2b'].map(run=>
  [run,routeSummary(routeCases,read(`stage9j/route-quality/results/${run}.json`).records)]));
const msRows=[...read('stage9i/ms-dev/results/after-fix.json').records,...read('stage9j/ms-dev-b/results/baseline.json').records];
const casesK=read('stage9k/cases.json').cases.filter(c=>c.kind==='route');
const routesK=casesK.map(c=>{const r=read(`stage9k/results/${c.id}.json`);return {id:c.id,quality:r.quality};});
const labelsK=casesK.map(c=>({id:c.id,label:c.criteria.includes('routeSensitivity')?'flag':'clear'}));
const report={purpose:'Read-only historical audit, not replacement scores; no predictions executed',
  stage9jRoutes:runs,pooledDevelopmentMS:msSummary(msRows),stage9kRouteAttribution:routeSummary(labelsK,routesK)};
fs.writeFileSync('scripts/benchmarks/stage9l/historical-audit.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({routeInventory:runs['third-run-harness-v2b'].inventory,
  combined:runs['third-run-harness-v2b'].combinedSensitivity,chemical:runs['third-run-harness-v2b'].chemicalSensitivity,
  verified:runs['third-run-harness-v2b'].verifiedChemicalSensitivity,ms:report.pooledDevelopmentMS},null,2));
