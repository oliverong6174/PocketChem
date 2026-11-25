import fs from 'node:fs';
import path from 'node:path';
import { q, root, screenshot, setViewport, sleep, startBrowser, waitFor } from './lib/chrome.mjs';

const out = path.join(root,'node_modules/.cache/stage29b-1a/after');
fs.mkdirSync(out,{recursive:true});
const { cdp, url, stop } = await startBrowser({port:4410,debugPort:9570});
const ev=(s)=>cdp.evaluate(s), results=[], shots=[];
const check=(name,ok,detail='')=>{results.push({name,ok,detail});console.log(`${ok?'PASS':'FAIL'} ${name} ${detail}`);};
const text=(selector)=>ev(`document.querySelector(${q(selector)})?.innerText??''`);
async function key(key,code,vk,text) {
  await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode:vk,...(text?{text}:{})});
  await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:vk});
}
async function pointer(selector) {
  const r=await ev(`(()=>{const e=document.querySelector(${q(selector)});if(!e)throw Error('Missing '+${q(selector)});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  await sleep(100);
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',...r});
  await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',...r,button:'left',clickCount:1});
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',...r,button:'left',clickCount:1});
  await sleep(250);
}
async function button(label,scope='document') {
  const found=await ev(`(()=>{const e=[...${scope}.querySelectorAll('button,summary')].find(e=>e.innerText.trim()===${q(label)}&&e.getClientRects().length&&!e.disabled);if(!e)return false;document.querySelectorAll('[data-click29]').forEach(e=>e.removeAttribute('data-click29'));e.setAttribute('data-click29','yes');return true;})()`);
  if(!found)throw Error(`Missing button: ${label}`);
  await pointer('[data-click29]');
}
async function setText(selector,value) {
  await ev(`(()=>{const e=document.querySelector(${q(selector)});e.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${q(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
}
async function analyze(name) {
  await setText('.molecule-name-input',name);
  await key('Enter','Enter',13,'\r');
  await sleep(700);
  await waitFor(()=>ev(`!!document.querySelector('.molecule-name-message.success') && /Analysis complete/.test(document.querySelector('[data-testid=pr-status]')?.textContent||'') && !document.querySelector('.molecule-name-input')?.disabled`),`analysis ${name}`,120000);
  await sleep(500);
}
async function tab(label){await button(label,"document.querySelector('.dashboard-tab-row')");await sleep(250);}
async function shot(file,{top=true,full=false}={}) {
  if(top)await ev('window.scrollTo(0,0)');
  await sleep(200);await screenshot(cdp,path.join(out,`${file}.png`),{fullPage:full});shots.push(file+'.png');
}
async function edit(smiles) {await ev(`window.ketcher.setMolecule(${q(smiles)})`);await sleep(1200);}
const identity=()=>text('[data-testid=pr-identity]');
const layout=()=>ev(`(()=>{const e=document.querySelector('.drawer-placeholder').getBoundingClientRect(),r=document.querySelector('.analysis-dashboard-card').getBoundingClientRect();return {overflow:document.documentElement.scrollWidth-innerWidth,editorWidth:e.width,editorHeight:e.height,resultsWidth:r.width,sideBySide:e.right<=r.left,innerScroll:[...document.querySelectorAll('.analysis-dashboard-card,.analysis-dashboard-card *')].filter(e=>/auto|scroll/.test(getComputedStyle(e).overflowY)&&e.scrollHeight>e.clientHeight+2).length,instructionHeight:document.querySelector('.pr-instructions').getBoundingClientRect().height};})()`);
const concreteRect=(sel)=>ev(`(()=>{const e=document.querySelector(${q(sel)});if(!e)return null;const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height,left:r.left,right:r.right};})()`);
const visibleTogether=async()=>{
  const a=await concreteRect('.pr-concept-visual .highlight-preview'),b=await concreteRect('.annotation-carousel-card');
  if(!a||!b)return {ok:false,a,b};
  const vh=await ev('innerHeight');
  return {ok:a.top<vh&&a.bottom>0&&b.top<vh&&b.bottom>0&&a.height>120&&b.height>40,a,b,vh};
};
async function chooseVariant(label){
  await ev(`(()=>{document.querySelectorAll('[data-click29]').forEach(e=>e.removeAttribute('data-click29'));const b=[...document.querySelectorAll('[data-testid=name-variant-choices] button')].find(b=>b.innerText.trim().startsWith(${q(label)}));if(!b)throw Error('No variant '+${q(label)});b.setAttribute('data-click29','yes');})()`);
  await pointer('[data-click29]');
  await sleep(700);
  await waitFor(()=>ev(`!!document.querySelector('.molecule-name-message.success') && /Analysis complete/.test(document.querySelector('[data-testid=pr-status]')?.textContent||'') && !document.querySelector('[data-testid=name-variant-choices]')`),'variant analysed',90000);
  await sleep(500);
}
async function enterAmbiguous(name){
  await setText('.molecule-name-input',name);await key('Enter','Enter',13,'\r');
  await waitFor(()=>ev(`!!document.querySelector('[data-testid=name-variant-choices] button')`),'variant selector');await sleep(300);
}
const smilesNow=()=>ev('window.ketcher.getSmiles()');
const countAt=(s)=>(s.match(/@@?/g)||[]).length;
try {
  await setViewport(cdp,1440,900,{scheme:'light'});
  await cdp.send('Page.navigate',{url:`${url}?stage29b1a#/organic/properties`});
  await waitFor(()=>ev(`!!window.ketcher && !document.querySelector('.molecule-name-input')?.disabled`),'editor',90000);

  // ---- L-leucine: stereo through name -> Ketcher -> analysis -> UI ----
  await analyze('L-leucine');
  const id=await identity();
  check('L-leucine resolves and names itself',/L-leucine/.test(id)&&/CHEBI:15603/.test(id),id.slice(0,200));
  check('no identity provenance / loaded-as / confidence boilerplate',!/Identity provenance|Loaded as:|Identity confidence|Recognized names/.test(id));
  const molfile=await ev('window.ketcher.getMolfile()'),ketSmiles=await smilesNow();
  const wedge=molfile.split('\n').some(l=>/^\s*\d+\s+\d+\s+1\s+[16](\s|$)/.test(l));
  check('Ketcher export retains the stereocenter (wedge bond in molfile, @ in SMILES)',/@/.test(ketSmiles)&&wedge,ketSmiles);
  const summary=await text('[data-testid=pr-summary]');
  check('summary lists the assigned stereocenter as S',/Stereocenters/.test(summary)&&/atom \d+: S\b/.test(summary),summary.replace(/\n/g,' | ').slice(0,300));
  check('no per-value badges in the summary',!/\b(CALCULATED|ESTIMATED|DETECTED|PREDICTED)\b/.test(await ev(`document.querySelector('[data-testid=pr-summary]').textContent`))&&await ev(`!document.querySelector('.pr-evidence')`));
  await shot('summary-L-leucine-1440x900-light');
  await tab('Acid/Base');
  const ab=await text('[data-testid=pr-acid-base]');
  check('acid/base has no Detailed reasoning and keeps factor rows',!/Detailed reasoning/.test(ab)&&/Atom|Resonance|Induction/i.test(ab),ab.slice(0,200).replace(/\n/g,' '));
  await shot('acid-base-L-leucine-1440x900-light',{top:false});
  await tab('All Properties');
  const detail=await text('[data-testid=pr-detail]');
  check('all properties has no calculation notes / naming-limits disclosures',!/Calculation notes|How this name was decided/.test(detail));
  await tab('Concepts');
  const buttons=await ev(`[...document.querySelectorAll('.concept-button')].map(e=>e.innerText.trim())`);
  console.log('concept buttons:',buttons.join(' | '));
  const clickConcept=async(label)=>{await ev(`(()=>{document.querySelectorAll('[data-click29]').forEach(e=>e.removeAttribute('data-click29'));const b=[...document.querySelectorAll('.concept-button')].find(e=>e.innerText.trim()===${q(label)});if(!b)throw Error('no concept '+${q(label)});b.setAttribute('data-click29','yes');})()`);await pointer('[data-click29]');await sleep(900);};
  const labelOf=(re)=>buttons.find(b=>re.test(b));
  const svgHash=()=>ev(`(()=>{const s=document.querySelector('.highlighted-molecule-svg')?.innerHTML||'';let h=0;for(const c of s)h=(h*31+c.charCodeAt(0))|0;return h;})()`);
  const toSplit=async()=>{await ev(`document.querySelector('.pr-concept-split').scrollIntoView({block:'start'})`);await sleep(300);};
  await clickConcept(labelOf(/chiral/i));await toSplit();
  const vt=await visibleTogether();
  check('chirality: molecule and concept card visible together without scrolling between them',vt.ok,JSON.stringify(vt));
  const chirCard=await text('.annotation-carousel-card');
  check('chirality card shows S and no assignment-method boilerplate',/Configuration:\s*S/.test(chirCard)&&!/Assignment source|How the configuration was assigned/.test(chirCard),chirCard.slice(0,200).replace(/\n/g,' '));
  const chirHash=await svgHash();
  await shot('concepts-chirality-L-leucine-1440x900-light',{top:false});
  await clickConcept(labelOf(/functional/i));await toSplit();
  check('selecting a different concept changes the molecular highlighting',chirHash!==await svgHash());
  const fgVt=await visibleTogether();check('functional groups: molecule and card still together',fgVt.ok,JSON.stringify(fgVt));
  await shot('concepts-functional-groups-L-leucine-1440x900-light',{top:false});
  await clickConcept(labelOf(/bond/i));await toSplit();
  const bondCard=await text('.annotation-carousel-card');
  const sigmaMentions=(bondCard.match(/σ bond/g)||[]).length;
  check('bond card states sigma once, with no Orbital info / Sigma component repetition',sigmaMentions===1&&!/Orbital info|Sigma component|Sigma overlap/.test(bondCard),bondCard.replace(/\n/g,' | '));
  await shot('bond-orbitals-L-leucine-1440x900-light',{top:false});
  const bondVt=await visibleTogether();check('bond orbitals: molecule and card visible together',bondVt.ok,JSON.stringify(bondVt));

  // ---- double / triple bond molecule ----
  await analyze('smiles:C=CC#CC');await tab('Concepts');await clickConcept(labelOf(/bond/i));await toSplit();
  const sub=(name)=>ev(`[...document.querySelectorAll('.concept-subfilter-button')].find(b=>b.innerText.trim()===${q(name)})?.click()`);
  await sub('triple');await sleep(700);
  const triple=await text('.annotation-carousel-card');
  check('triple bond card: distinct sigma and pi, each once',(triple.match(/σ bond/g)||[]).length===1&&(triple.match(/π bond/g)||[]).length===1&&/two p–p/.test(triple),triple.replace(/\n/g,' | '));
  await sub('double');await sleep(700);
  const dbl=await text('.annotation-carousel-card');
  check('double bond card: one sigma and one pi',(dbl.match(/σ bond/g)||[]).length===1&&(dbl.match(/π bond/g)||[]).length===1,dbl.replace(/\n/g,' | '));
  await sub('single');await sleep(700);
  const sgl=await text('.annotation-carousel-card');
  check('single bond card: sigma only',!/π bond/.test(sgl)&&(sgl.match(/σ bond/g)||[]).length===1,sgl.replace(/\n/g,' | '));
  await sub('triple');await sleep(700);await shot('bond-orbitals-triple-bond-1440x900-light',{top:false});

  // ---- unspecified leucine: potential stereocenter, L/D offered ----
  await analyze('leucine');
  const un=await identity();
  check('unspecified leucine says stereochemistry is unspecified',/Stereochemistry unspecified/.test(un),un.slice(0,200));
  await waitFor(()=>ev(`[...document.querySelectorAll('.pr-generic button')].map(b=>b.innerText.trim()).join()==='L-leucine,D-leucine'`),'L/D variants');
  await tab('Summary');
  const usum=await text('[data-testid=pr-summary]');
  check('summary reports a potential, unspecified stereocenter (not "no stereocenter")',/1 potential stereocenter/.test(usum)&&!/No stereocenter/.test(usum),usum.replace(/\n/g,' | ').slice(0,300));
  await tab('Concepts');await clickConcept(labelOf(/chiral/i));await toSplit();
  const unCard=await text('.annotation-carousel-card');
  check('chirality card for unspecified leucine: unspecified potential stereocenter',/Unspecified \(potential stereocenter\)/.test(unCard),unCard.slice(0,180).replace(/\n/g,' '));
  await shot('concepts-chirality-unspecified-leucine-1440x900-light',{top:false});
  await tab('Summary');await shot('summary-unspecified-leucine-1440x900-light');
  await button('D-leucine',"document.querySelector('.pr-identity')");
  await waitFor(()=>ev(`/Analysis complete/.test(document.querySelector('[data-testid=pr-status]')?.innerText||'')&&/: R\\b/.test(document.querySelector('[data-testid=pr-summary]')?.innerText||'')`),'D-leucine analysed',60000).catch(async e=>{console.log('DIAG status:',await text('[data-testid=pr-status]'),'| summary:',(await text('[data-testid=pr-summary]')).slice(0,400),'| id:',(await identity()).slice(0,300),'| smiles:',await smilesNow());throw e;});
  check('choosing D-leucine loads the R isomer',/: R\b/.test(await text('[data-testid=pr-summary]'))&&(await smilesNow())!==ketSmiles&&countAt(await smilesNow())===1,await smilesNow());

  // ---- L-lysine ----
  await analyze('L-lysine');await tab('Summary');
  check('L-lysine: S stereocenter assigned',/atom \d+: S\b/.test(await text('[data-testid=pr-summary]')));
  await tab('Concepts');await clickConcept(labelOf(/chiral/i));await toSplit();
  check('L-lysine chirality card shown with molecule',(await visibleTogether()).ok&&/Configuration:\s*S/.test(await text('.annotation-carousel-card')));
  await shot('concepts-chirality-L-lysine-1440x900-light',{top:false});

  // ---- glucose family: selector, stereo-preserving Ketcher load ----
  for(const [typed,expectLabels] of [['glucose',['aldehydo-D-glucose','α-D-glucopyranose','β-D-glucopyranose','α-L-glucopyranose']],['D-glucose',['aldehydo-D-glucose','α-D-glucopyranose','β-D-glucopyranose']],['L-glucose',['aldehydo-L-glucose','α-L-glucopyranose','β-L-glucopyranose']]]) {
    await enterAmbiguous(typed);
    const labels=await ev(`[...document.querySelectorAll('[data-testid=name-variant-choices] button strong')].map(e=>e.innerText.trim())`);
    check(`${typed}: selector offers ${expectLabels.join(', ')}`,expectLabels.every(l=>labels.includes(l)),labels.join(' | '));
    check(`${typed}: nothing was loaded silently`,await ev(`/does not specify/.test(document.querySelector('.molecule-name-message')?.innerText||'')`));
    if(typed==='glucose')await shot('carbohydrate-variant-selection-glucose-1440x900-light',{top:false});
  }
  await enterAmbiguous('D-glucose');await chooseVariant('α-D-glucopyranose');
  const alphaD=await smilesNow();
  check('α-D-glucopyranose loaded into Ketcher with 5 stereocenters',countAt(alphaD)===5,alphaD);
  await tab('Summary');
  const asum=await text('[data-testid=pr-summary]');
  check('summary: stereocenters with both R and S',/: R\b/.test(asum)&&/atom \d+: S\b/.test(asum),asum.replace(/\n/g,' | ').slice(0,260));
  await shot('summary-alpha-D-glucopyranose-1440x900-light');
  await tab('Concepts');await clickConcept(labelOf(/chiral/i));await toSplit();
  await shot('ketcher-and-concepts-alpha-D-glucopyranose-1440x900-light',{top:false});
  await ev('window.scrollTo(0,0)');await sleep(300);await shot('ketcher-stereo-drawing-alpha-D-glucopyranose-1440x900-light');
  await enterAmbiguous('D-glucose');await chooseVariant('β-D-glucopyranose');
  const betaD=await smilesNow();
  check('β-D-glucopyranose is a different stereo identity with 5 centers',alphaD!==betaD&&countAt(betaD)===5,`${alphaD} / ${betaD}`);
  await enterAmbiguous('L-glucose');await chooseVariant('α-L-glucopyranose');
  const alphaL=await smilesNow();
  const flip=alphaD.replace(/@@/g,'#').replace(/@/g,'@@').replace(/#/g,'@');
  check('α-L-glucopyranose differs from α-D with 5 centers',alphaL!==alphaD&&countAt(alphaL)===5,`${alphaD} / ${alphaL} (flip ${flip})`);
  await shot('summary-alpha-L-glucopyranose-1440x900-light');
  await enterAmbiguous('D-glucose');await chooseVariant('aldehydo-D-glucose');
  const open=await smilesNow();
  check('open-chain D-glucose loaded with aldehyde and 4 stereocenters',/C=O|O=C/.test(open)&&countAt(open)===4,open);
  await shot('summary-aldehydo-D-glucose-1440x900-light');
  for(const sugar of ['fructose','galactose','mannose','ribose']){await enterAmbiguous(sugar);check(`${sugar}: variant selector shown instead of a silent anomer`,await ev(`document.querySelectorAll('[data-testid=name-variant-choices] button').length>=2`));}
  await setText('.molecule-name-input','');

  // ---- save and reopen keeps the stereo identity ----
  await analyze('L-leucine');await tab('Summary');await button('Save Analysis');
  await setText('.synthesis-save-form input','Stage 29B-1A L-leucine');await button('Save',"document.querySelector('.synthesis-save-form')");await sleep(1400);
  await analyze('smiles:CC');
  await button('Saved',"document.querySelector('.tool-tabs')");await sleep(1200);
  await ev(`(()=>{const card=[...document.querySelectorAll('li,article,tr')].find(e=>e.innerText.includes('Stage 29B-1A L-leucine')&&[...e.querySelectorAll('button')].some(b=>/^Open/.test(b.innerText)));const b=[...card.querySelectorAll('button')].find(b=>/^Open/.test(b.innerText));b.setAttribute('data-open29','yes');})()`);await pointer('[data-open29]');
  await sleep(800);
  if(await ev(`!!document.querySelector('[role=alertdialog]')`)){await ev(`(()=>{document.querySelectorAll('[data-click29]').forEach(e=>e.removeAttribute('data-click29'));const b=[...document.querySelectorAll('[role=alertdialog] button')].find(b=>/^Replace|^Discard|^Open/.test(b.innerText.trim()));b.setAttribute('data-click29','yes');})()`);await pointer('[data-click29]');await sleep(800);}
  await waitFor(()=>ev(`!!document.querySelector('.pr-identity')`),'reopened identity');await sleep(800);
  await waitFor(()=>ev(`/Analysis complete|restored|Restored/.test(document.querySelector('[data-testid=pr-status]')?.innerText||'')`),'restored status',20000).catch(()=>{});
  await sleep(1200);
  const reopened=await smilesNow(),rid=await identity(),rsum=await text('[data-testid=pr-summary]');
  check('saved L-leucine reopens with its name',/L-leucine/.test(rid),rid.slice(0,120));
  check('saved L-leucine reopens with its stereo marks in the analysis',/atom \d+: S\b/.test(rsum)&&/SMILES[^\n]*@/.test(rid),`${reopened} | ${rsum.replace(/\n/g,' ').slice(0,200)}`);

  // ---- vitamin E and responsive layouts ----
  await analyze('vitamin E');
  check('vitamin E: no implementation-detail sections',!/Identity provenance|Calculation notes/.test(await text('[data-testid=pr-identity]')));
  await shot('summary-vitamin-E-1440x900-light');
  await tab('Concepts');await shot('concepts-vitamin-E-1440x900-light',{top:false});
  for(const [w,h,scheme] of [[1920,1080,'light'],[1280,720,'dark'],[820,1000,'light'],[375,812,'dark']]) {
    await setViewport(cdp,w,h,{scheme});await sleep(400);
    await analyze('L-leucine');await tab('Concepts');await clickConcept(labelOf(/chiral/i));await toSplit();
    const together=await visibleTogether();
    check(`${w}x${h} ${scheme}: concept molecule and card visible together`,together.ok,JSON.stringify(together));
    check(`${w}x${h} ${scheme}: no horizontal overflow`,await ev('document.documentElement.scrollWidth<=innerWidth'));
    await shot(`concepts-chirality-${w}x${h}-${scheme}`,{top:false});
    await tab('Summary');await shot(`summary-${w}x${h}-${scheme}`);
    await tab('Acid/Base');await shot(`acid-base-${w}x${h}-${scheme}`,{top:false});
  }
  check('no uncaught browser exceptions',cdp.errors.length===0,cdp.errors.join(';').slice(0,400));
} catch(error) {check('browser workflow completed',false,error.stack);}
finally {
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({results,shots},null,2));
  console.log(`${results.filter(r=>r.ok).length}/${results.length} checks passed`);console.log('Screenshots:',out);stop();
}
if(results.some(r=>!r.ok))process.exitCode=1;
