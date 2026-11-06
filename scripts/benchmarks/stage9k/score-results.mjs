import fs from 'node:fs';import path from 'node:path';
import {here,canon,mirror} from './molecules.mjs';import {score,summarize} from './scoring.mjs';
const cases=JSON.parse(fs.readFileSync(path.join(here,'cases.json'),'utf8')).cases;
const records=cases.map(c=>{
  const out=JSON.parse(fs.readFileSync(path.join(here,'results',c.id+'.json'),'utf8'));
  const file=path.join(here,'results/identity-resolution',c.id+'.json');if(fs.existsSync(file))out.resolvedIdentity=JSON.parse(fs.readFileSync(file,'utf8'));
  return {id:c.id,kind:c.kind,dimensions:score(c,out,{canon,mirror})};
});
const summary=summarize(cases,records);
const result={scoredUTC:new Date().toISOString(),summary,records};
const target=path.join(here,'results/scores.json');fs.writeFileSync(target,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(summary,null,2));
