// One isolated diagnostic on the untouched STARTING engine, not any frozen
// benchmark runner. Preserve the same regression substrate and 45 s deadline.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createServer} from 'vite';
import {loadEngine,closeEngine} from '../../tests/engine.mjs';
const root=process.cwd();
const changed=execFileSync('git',['diff','9ab6070','--name-only','--diff-filter=M','--','src'],{encoding:'utf8'}).trim().split('\n').filter(Boolean);
const original=new Map(changed.map(file=>[path.resolve(file).replaceAll('\\','/'),execFileSync('git',['show',`9ab6070:${file}`],{encoding:'utf8'})]));
let server;
try {
  await loadEngine(); // installs the local RDKit runtime; no search
  server=await createServer({root,configFile:path.join(root,'vite.config.ts'),
    plugins:[{name:'stage9l-starting-source',enforce:'pre',transform(_code,id){const source=original.get(id.split('?')[0].replaceAll('\\','/'));return source===undefined?null:{code:source,map:null};}}],
    server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'silent',optimizeDeps:{noDiscovery:true}});
  const engine=await server.ssrLoadModule('/src/utils/reactions/engine/multistepSynthesis.ts');
  const registry=(await server.ssrLoadModule('/src/utils/reactionUtils.ts')).reactionRegistry;
  const ui=await server.ssrLoadModule('/src/utils/reactions/engine/searchOptionsFromUi.ts');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000),start=performance.now();
  let routes;
  try{routes=await engine.findMultistepSynthesisRoutesFromRules('Cc1ccc(O)cc1.CBr.C#C','COc1ccc(CC=C)cc1',registry,
    ui.buildSynthesisSearchOptions('deep',45000,{convergent:false,bidirectional:false,copies:1},{signal:controller.signal}));}
  finally{clearTimeout(timer);}
  const report={checkpoint:'9ab60709f4154dbffd8bcc8adad8dd04f8170f94',purpose:'one starting-engine regression diagnostic; no frozen evaluation',
    elapsedMs:performance.now()-start,deadlineMs:45000,aborted:controller.signal.aborted,routes:routes.length,
    restoredSourceFiles:changed};
  fs.writeFileSync('scripts/benchmarks/stage9l/baseline-search-result.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
}finally{await server?.close();await closeEngine();}
