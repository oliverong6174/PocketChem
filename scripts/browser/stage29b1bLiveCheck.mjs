import fs from 'node:fs';
import path from 'node:path';
import { q, root, screenshot, setViewport, sleep, startBrowser, waitFor } from './lib/chrome.mjs';

const out = path.join(root,'node_modules/.cache/stage29b-1b');
fs.mkdirSync(out,{recursive:true});
const { cdp, url, stop } = await startBrowser({port:4420,debugPort:9580});
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

const rect=(sel)=>ev(`(()=>{const e=document.querySelector(${q(sel)});if(!e)return null;const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,height:r.height};})()`);
const headerBottom=()=>ev(`document.querySelector('.shell').getBoundingClientRect().bottom`);
const overlap=(a,b)=>!a||!b?0:Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
const ellipses=()=>ev(`(document.querySelector('.highlighted-molecule-svg')?.innerHTML.match(/<ellipse/g)||[]).length`);
const scrollTo=async(y)=>{await ev(`window.scrollTo(0,${y})`);await sleep(250);};
const VIEWPORTS=[[1920,1080,'light'],[1440,900,'dark'],[1280,720,'light'],[820,1000,'dark'],[375,812,'light']];
try {
  await setViewport(cdp,1440,900,{scheme:'light'});
  await cdp.send('Page.navigate',{url:`${url}?stage29b1b#/organic/properties`});
  await waitFor(()=>ev(`!!window.ketcher && !document.querySelector('.molecule-name-input')?.disabled`),'editor',90000);
  check('--shell-h is published from the measured header',await ev(`Math.abs(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--shell-h'))-document.querySelector('.shell').getBoundingClientRect().height)<1.5`));
  for(const [w,h,scheme] of VIEWPORTS){
    const tag=`${w}x${h}-${scheme}`;
    await setViewport(cdp,w,h,{scheme});await sleep(500);
    // Concepts: scroll positions, sticky molecule, bond highlighting
    await analyze('smiles:C=CC#CC');await tab('Concepts');
    const buttons=await ev(`[...document.querySelectorAll('.concept-button')].map(e=>e.innerText.trim())`);
    const clickConcept=async(label)=>{await ev(`(()=>{document.querySelectorAll('[data-click29]').forEach(e=>e.removeAttribute('data-click29'));const b=[...document.querySelectorAll('.concept-button')].find(e=>e.innerText.trim()===${q(label)});if(!b)throw Error('no concept '+${q(label)});b.setAttribute('data-click29','yes');})()`);await pointer('[data-click29]');await sleep(900);};
    await clickConcept(buttons.find(b=>/orbital/i.test(b)));
    const el=await ellipses();
    check(`${tag}: bond-orbital selection highlights both endpoint atoms`,el>=2,`ellipses=${el}`);
    check(`${tag}: no horizontal overflow`,await ev('document.documentElement.scrollWidth<=innerWidth'));
    await ev(`document.querySelector('.pr-concept-split').scrollIntoView({block:'start'})`);await sleep(300);
    const splitTop=await ev(`document.querySelector('.pr-concept-split').getBoundingClientRect().top+scrollY`);
    for(const dy of [-100,0,120,260,520,900]){
      await scrollTo(Math.max(0,splitTop+dy));
      const hb=await headerBottom(), v=await rect('.pr-concept-visual'), c=await rect('.annotation-carousel-card'), sp=await rect('.pr-concept-split');
      const clipped=v&&v.top<hb-1&&v.bottom>hb;
      const stacked=v&&c&&c.top>=v.bottom-2;
      check(`${tag} scroll ${dy}: molecule not clipped by header and within its container`,!clipped&&(!v||v.bottom<=sp.bottom+2||v.top<hb),JSON.stringify({hb,v,sp:{top:sp.top,bottom:sp.bottom}}));
      if(!stacked) check(`${tag} scroll ${dy}: side-by-side molecule does not cover the concept card`,overlap(v,c)<=1,`overlap=${overlap(v,c)}`);
      if(dy===0||dy===260||dy===900){await screenshot(cdp,path.join(out,`concepts-${tag}-scroll${dy}.png`),{fullPage:false});shots.push(`concepts-${tag}-scroll${dy}.png`);}
    }
    // Acid/Base: acetic acid (experimental assignment)
    await analyze('smiles:CC(=O)O');await tab('Acid/Base');await scrollTo(0);
    await ev(`document.querySelector('[data-testid=pr-acid-base]').scrollIntoView({block:'start'})`);await sleep(400);
    let ab=await text('[data-testid=pr-acid-base]');
    check(`${tag}: acetic acid shows an experimental pKa near 4.7 and the estimate with its range`,/Experimental pKa\s*4\.7\d?/.test(ab)&&/Estimated pKa\s*≈\s*[\d.]+/.test(ab)&&/Range/.test(ab),ab.replace(/\n/g,' ').slice(0,300));
    check(`${tag}: IUPAC attribution with license is visible`,/IUPAC Digitized pKa Dataset/.test(ab)&&/CC BY-NC/.test(ab));
    const rows=await ev(`document.querySelectorAll('.pr-site-table tbody tr').length`);
    for(let i=0;i<Math.min(rows,3);i++){
      await ev(`(()=>{document.querySelectorAll('[data-click29]').forEach(e=>e.removeAttribute('data-click29'));document.querySelectorAll('.pr-site-table tbody tr')[${i}].querySelector('button').setAttribute('data-click29','yes');})()`);
      await pointer('[data-click29]');
      const head=await rect('.pr-site-head'), hb=await headerBottom(), vh=await ev('innerHeight');
      const label=await text('.pr-site-info h4');
      check(`${tag}: site ${i+1} (${label}) structure and values visible immediately, header not covering them`,head&&head.top>=hb-1&&head.top<vh&&head.height>80,JSON.stringify(head));
      check(`${tag}: site ${i+1} has highlighted atom`,(await ev(`(document.querySelector('.pr-site-head svg')?.innerHTML.match(/<ellipse/g)||[]).length`))>=1);
    }
    await screenshot(cdp,path.join(out,`acid-base-acetic-${tag}.png`),{fullPage:false});shots.push(`acid-base-acetic-${tag}.png`);
    await scrollTo((await ev('scrollY'))+500);await sleep(300);
    await screenshot(cdp,path.join(out,`acid-base-acetic-${tag}-scrolled.png`),{fullPage:false});shots.push(`acid-base-acetic-${tag}-scrolled.png`);
    if(w===1440||w===375){
      await analyze('smiles:NCC(=O)O');await tab('Acid/Base');
      await ev(`document.querySelector('[data-testid=pr-acid-base]').scrollIntoView({block:'start'})`);await sleep(400);
      ab=await text('[data-testid=pr-acid-base]');
      check(`${tag}: glycine lists molecular reference pKa separately (acid and conjugate acid)`,/Molecular reference pKa/.test(ab)&&/Acid dissociation \(pKa\)\s*9\.[6-9]/.test(ab)&&/Conjugate acid \(pKaH\)\s*2\.[2-5]/.test(ab),ab.replace(/\n/g,' ').slice(0,420));
      check(`${tag}: glycine site detail does not claim an experimental site value`,!/Experimental (pKa|Conjugate-acid)/.test(await text('.pr-site-head')));
      await screenshot(cdp,path.join(out,`acid-base-glycine-${tag}.png`),{fullPage:false});shots.push(`acid-base-glycine-${tag}.png`);
      await analyze('smiles:CCN');await tab('Acid/Base');
      const site=await text('.pr-site-head');
      check(`${tag}: ethylamine site shows conjugate-acid pKa and a pKb estimate`,/conjugate-acid pKa/i.test(site)&&/pKb\s*≈/.test(site),site.replace(/\n/g,' ').slice(0,300));
      await analyze('smiles:c1ccccc1O');await tab('Summary');
      const sum=await text('[data-testid=pr-summary]');
      check(`${tag}: Summary has the compact tendencies heading, no boilerplate, no bullet separators`,/Estimated physicochemical tendencies/i.test(sum)&&!/not measured/.test(sum)&&!/[·•]/.test((await text('[data-testid=pr-identity]'))+sum));
      await screenshot(cdp,path.join(out,`summary-${tag}.png`),{fullPage:false});shots.push(`summary-${tag}.png`);
    }
  }
  await setViewport(cdp,1440,900,{scheme:'light'});await sleep(400);
  await analyze('smiles:CCCCCCCCCCCCCCCCCCCC(=O)NC');await tab('Acid/Base');
  const unsupported=await text('[data-testid=pr-acid-base]');
  check('molecule without a reference record keeps model estimates and makes no experimental claim',!/Experimental/.test(unsupported)&&/Estimated/.test(unsupported));
  await analyze('smiles:CC(=O)O');await tab('Summary');await button('Save Analysis');await sleep(800);
  check('save analysis still works',/saved/i.test((await text('[data-testid=pr-status]'))+(await text('body'))));
  check('no uncaught browser exceptions',cdp.errors.length===0,cdp.errors.join(';').slice(0,400));
} catch(error) {check('browser workflow completed',false,error.stack);}
finally {
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({results,shots},null,2));
  console.log(`${results.filter(r=>r.ok).length}/${results.length} checks passed`);console.log('Screenshots:',out);stop();
}
if(results.some(r=>!r.ok))process.exitCode=1;
