import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {execFileSync,spawn} from 'node:child_process';
import {here,root} from './molecules.mjs';
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const m=JSON.parse(fs.readFileSync(path.join(here,'manifest.json'),'utf8'));
for(const [f,sha] of Object.entries(m.hashes))if(crypto.createHash('sha256').update(fs.readFileSync(path.join(here,f))).digest('hex')!==sha)throw Error('Frozen hash mismatch: '+f);
if(git('rev-parse','HEAD:src')!==m.engineSrcTree||git('status','--porcelain','--','src'))throw Error('Engine integrity failure');
if(process.argv.includes('--verify-only')){console.log('Frozen integrity OK:',Object.keys(m.hashes).length,'files');process.exit(0);}
const dir=path.join(here,'results');fs.mkdirSync(dir,{recursive:true});
const params={startedUTC:new Date().toISOString(),engineCommit:m.engineCommit,executionCommit:git('rev-parse','HEAD'),srcTree:m.engineSrcTree,node:process.version,platform:process.platform,timeoutMs:45000,concurrency:1,attemptsPerCase:1,mode:'isolated-process-per-case, fixed family filters, no target-dependent fallback'};
fs.writeFileSync(path.join(dir,'RUN-LOCK.json'),JSON.stringify(params,null,2)+'\n',{flag:'wx'});
const cases=JSON.parse(fs.readFileSync(path.join(here,'cases.json'),'utf8')).cases;
for(const c of cases){
  const file=path.join(dir,c.id+'.json'),started=Date.now();
  const outcome=await new Promise(resolve=>{
    const child=spawn(process.execPath,[path.join(here,'worker.mjs'),c.id,file],{cwd:root,stdio:['ignore','pipe','pipe']});
    const log=fs.createWriteStream(path.join(dir,c.id+'.log'),{flags:'wx'});child.stdout.pipe(log,{end:false});child.stderr.pipe(log,{end:false});
    let timedOut=false;const timer=setTimeout(()=>{timedOut=true;child.kill();},params.timeoutMs);
    child.on('error',error=>{clearTimeout(timer);log.end();resolve({error:String(error),timedOut:false});});
    child.on('close',(code,signal)=>{clearTimeout(timer);log.end();resolve({exitCode:code,signal,timedOut});});
  });
  let record=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{id:c.id,error:outcome.timedOut?'Process timeout before result':'Process failed before result',timedOut:outcome.timedOut};
  const envelope={id:c.id,ms:Date.now()-started,...outcome,resultFile:c.id+'.json',record};
  if(!fs.existsSync(file))fs.writeFileSync(file,JSON.stringify(record,null,2)+'\n',{flag:'wx'});
  fs.appendFileSync(path.join(dir,'raw.jsonl'),JSON.stringify(envelope)+'\n');console.log(c.id,envelope.ms+'ms',record.error?'ERROR':record.products?record.products.length+' products':'returned');
}
fs.writeFileSync(path.join(dir,'COMPLETE.json'),JSON.stringify({finishedUTC:new Date().toISOString(),cases:cases.length},null,2)+'\n',{flag:'wx'});
