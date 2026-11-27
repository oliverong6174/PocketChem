import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
const root=process.cwd(),folder=path.resolve('scripts/benchmarks/stage9l');
fs.writeFileSync(path.join(folder,'browser-pid.txt'),String(process.pid));
const chromePath=process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const results=[];
function check(name,ok,detail=''){results.push({name,ok,detail});console.log(`${ok?'PASS':'FAIL'} ${name} ${detail}`);}
async function until(fn,name,timeout=90000){const t=Date.now();while(Date.now()-t<timeout){try{const v=await fn();if(v)return v;}catch{}await sleep(250);}throw Error(`Timed out: ${name}`);}
class CDP {
  constructor(url){this.ws=new WebSocket(url);this.id=0;this.pending=new Map();this.errors=[];
    this.ready=new Promise((resolve,reject)=>{this.ws.addEventListener('open',resolve);this.ws.addEventListener('error',reject);});
    this.ws.addEventListener('message',e=>{const m=JSON.parse(e.data),p=this.pending.get(m.id);if(p){this.pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')this.errors.push(m.params.exceptionDetails?.text);});}
  send(method,params={}){const id=++this.id;this.ws.send(JSON.stringify({id,method,params}));return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{this.pending.delete(id);reject(Error(`Browser command timed out: ${method}`));},90000);
    this.pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});
  });}
  async eval(expression){const r=await this.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result.value;}
}
let chrome,preview,cdp,profile;
try {
  if(!fs.existsSync(chromePath))throw Error('Set CHROME_PATH to installed Chrome or Edge');
  // Keep the temporary profile inside the authorized repository but under the
  // dependency cache, which Vite excludes from file watching.
  const cache=path.resolve('node_modules/.cache');fs.mkdirSync(cache,{recursive:true});
  profile=fs.mkdtempSync(path.join(cache,'pocketchem-stage9l-browser-'));
  preview=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--port','4192','--strictPort','--host','127.0.0.1'],{cwd:root,stdio:'ignore',windowsHide:true});
  chrome=spawn(chromePath,['--headless=new','--remote-debugging-port=9352',`--user-data-dir=${profile}`,'--no-first-run','--disable-gpu','--window-size=1450,2000','about:blank'],{stdio:'ignore',windowsHide:true});
  await until(async()=> (await fetch('http://127.0.0.1:4192')).ok,'preview');
  const target=await until(async()=> (await(await fetch('http://127.0.0.1:9352/json',{signal:AbortSignal.timeout(2000)})).json()).find(t=>t.type==='page'),'Chrome');
  cdp=new CDP(target.webSocketDebuggerUrl);await cdp.ready;
  await cdp.send('Runtime.enable');await cdp.send('Page.enable');await cdp.send('Network.enable');
  await cdp.send('Network.setBlockedURLs',{urls:['https://*','http://pubchem.*','http://www.ebi.*']});
  await cdp.send('Page.navigate',{url:'http://127.0.0.1:4192'});
  await until(()=>cdp.eval(`document.readyState==='complete' && document.body.innerText.includes('Spectroscopy')`),'app shell');
  const click=label=>cdp.eval(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.innerText.trim()===${JSON.stringify(label)});if(!b)throw Error('Missing button');b.click();return true;})()`);
  await click('Spectroscopy');
  await until(()=>cdp.eval('Boolean(window.spectroscopyKetcher)'),'spectroscopy editor');
  await cdp.eval(`window.spectroscopyKetcher.setMolecule('CCCCCCCCCCCO')`);await sleep(400);
  await click('Predict Spectra');
  await until(()=>cdp.eval(`document.body.innerText.includes('Mass Spec') && [...document.querySelectorAll('button')].some(b=>b.innerText.trim()==='Predict Spectra' && !b.disabled)`),'spectra');
  await click('Mass Spec');
  await until(()=>cdp.eval(`document.body.innerText.includes('Additional fragment candidates')`),'candidates panel');
  await cdp.eval(`document.querySelector('details.spectroscopy-notes').open=true`);
  check('unranked candidates display abundance uncertainty',await cdp.eval(`document.body.innerText.includes('abundance unknown') && document.body.innerText.includes('excluded from the plot')`));
  check('development fragment m/z 70 appears with composition',await cdp.eval(`document.querySelector('details.spectroscopy-notes').innerText.includes('m/z 70') && document.querySelector('details.spectroscopy-notes').innerText.includes('C5H10')`));
  const summary=await cdp.eval(`document.querySelector('.mass-summary-grid').innerText`);
  check('base peak remains explicitly unreliable',/unreliable/i.test(summary),summary);
  await sleep(1500);
  await cdp.send('Page.reload');
  await until(()=>cdp.eval(`document.readyState==='complete' && document.body.innerText.includes('Spectroscopy')`),'reloaded app shell');
  await click('Spectroscopy');
  await until(()=>cdp.eval(`document.body.innerText.includes('Additional fragment candidates')`),'restored saved workspace');
  check('reload restores candidates without recomputation',await cdp.eval(`document.body.innerText.includes('Additional fragment candidates') && !document.body.innerText.includes('Predicting…')`));
  await click('Reactions');
  await until(()=>cdp.eval('Boolean(window.reactionKetcher)'),'reaction editor');
  await cdp.eval(`window.reactionKetcher.setMolecule('CC1=C(C)CCC1')`);await sleep(400);
  await click('Predict Products');
  await until(()=>cdp.eval(`document.querySelectorAll('.reaction-pathway-card').length>0 && [...document.querySelectorAll('button')].some(b=>b.innerText.trim()==='Predict Products'&&!b.disabled)`),'reaction predictions');
  for(let i=0;i<12;i++){
    const clicked=await cdp.eval(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>/^Show\s/.test(b.innerText.trim()));if(!b)return false;b.click();return true;})()`);
    if(!clicked)break;await sleep(300);
  }
  const hydrogenation=await cdp.eval(`(()=>{const c=[...document.querySelectorAll('.reaction-pathway-card')].find(c=>c.innerText.includes('Alkene Hydrogenation'));return c?{text:c.innerText,svgs:c.querySelectorAll('svg').length}:null;})()`);
  check('hydrogenation card shows syn mechanism and scope',Boolean(hydrogenation)&&/syn/.test(hydrogenation.text)&&/5–7/.test(hydrogenation.text));
  check('meso hydrogenation product is not labelled racemic',Boolean(hydrogenation)&&!/Racemic mixture/.test(hydrogenation.text));
  check('no uncaught browser exceptions',cdp.errors.length===0,cdp.errors.join(';'));
  const screenshot=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  fs.writeFileSync(path.join(folder,'browser-reactions.png'),Buffer.from(screenshot.data,'base64'));
} catch(error){check('browser harness',false,String(error));}
finally {
  cdp?.ws.close();
  for(const child of [chrome,preview])if(child){child.kill();await sleep(250);}
  if(profile){
    const target=path.resolve(profile),allowed=path.resolve('node_modules/.cache')+path.sep;
    if(!target.startsWith(allowed)||!path.basename(target).startsWith('pocketchem-stage9l-browser-'))throw Error('Unsafe profile path');
    for(let i=0;i<8;i++){try{fs.rmSync(target,{recursive:true,force:true});break;}catch{await sleep(300);}}
  }
  fs.writeFileSync(path.join(folder,'browser-results.json'),JSON.stringify(results,null,2)+'\n');
}
process.exitCode=results.every(r=>r.ok)?0:1;
