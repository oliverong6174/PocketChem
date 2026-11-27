import fs from 'node:fs';
import path from 'node:path';
import { q, root, screenshot, setViewport, sleep, startBrowser, waitFor } from './lib/chrome.mjs';

const out = path.join(root,'node_modules/.cache/stage29b-1/after');
fs.mkdirSync(out,{recursive:true});
const { cdp, url, stop } = await startBrowser({port:4400,debugPort:9560});
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
try {
  await setViewport(cdp,1440,900,{scheme:'light'});
  await cdp.send('Page.navigate',{url:`${url}?stage29b#/organic/properties`});
  await waitFor(()=>ev(`!!window.ketcher && !document.querySelector('.molecule-name-input')?.disabled`),'editor',90000);
  await analyze('acetic acid');
  check('recognized name, formula and provenance visible',/Loaded as: acetic acid/i.test(await identity())&&/C2H4O2/.test(await identity())&&/CHEBI:/.test(await identity()));
  check('five accessible result tabs',await ev(`[...document.querySelectorAll('.dashboard-tab')].map(e=>e.innerText.trim()).join('|')==='Summary|Acid/Base|Aromaticity|Concepts|All Properties'`));
  await pointer('#properties-tab-overview');await key('ArrowRight','ArrowRight',39);
  check('arrow key selects Acid/Base and moves focus',await ev(`document.activeElement.id==='properties-tab-acidBase'&&document.activeElement.getAttribute('aria-selected')==='true'`));
  check('acid/base table exposes estimated range, confidence and rank',/pKa range/.test(await text('.pr-site-table'))&&/Confidence/.test(await text('.pr-site-table'))&&/Rank/.test(await text('.pr-site-table')));
  check('full acid/base prose is collapsed by default',await ev(`![...document.querySelectorAll('.pr-acid-base details')].some(e=>e.open)`));
  await waitFor(()=>ev(`!!document.querySelector('.pr-acid-base .pr-depiction svg')`),'acid highlight');
  check('selected site has a highlighted atom',await ev(`!!document.querySelector('.pr-acid-base svg ellipse')`));
  await button('Detailed reasoning');
  check('detailed reasoning opens with original ARIO explanation',await ev(`document.querySelector('.pr-acid-base details').open`)&&/Resonance/i.test(await text('.pr-acid-base details')));
  await button('Detailed reasoning');
  await shot('acid-base-1440x900-light');
  await tab('All Properties');await shot('all-properties-1440x900-light');
  check('all properties keeps composition, descriptors and tendency tables',await ev(`document.querySelectorAll('[data-testid=pr-detail] table').length===3`));
  await tab('Concepts');check('concept controls and depiction remain available',await ev(`document.querySelectorAll('.concept-button').length>=8`));
  await tab('Summary');
  for(const [w,h] of [[1920,1080],[1440,900],[1440,768],[1280,720],[820,900],[375,812]]) for(const scheme of ['light','dark']) {
    await setViewport(cdp,w,h,{scheme});await ev('window.scrollTo(0,0)');await sleep(300);const g=await layout();
    check(`${w}x${h} ${scheme}: no horizontal overflow or result scrollboxes`,g.overflow<=0&&g.innerScroll===0,JSON.stringify(g));
    check(`${w}x${h} ${scheme}: useful editor and responsive regions`,g.editorHeight>=400&&g.editorWidth>=280&&(w<1024?!g.sideBySide:g.sideBySide&&g.resultsWidth>g.editorWidth));
    if(w>=1024) check(`${w}x${h}: instructions fit one row`,g.instructionHeight<30);
    await shot(`summary-${w}x${h}-${scheme}`);
    if(w===375){await ev(`document.querySelector('.analysis-dashboard-card').scrollIntoView()`);await shot(`results-${w}x${h}-${scheme}`,{top:false});}
  }
  await setViewport(cdp,1440,900,{scheme:'light'});await tab('Summary');
  await analyze('vitamin K');
  check('vitamin K keeps recognized identity and unavailable derived name',/Loaded as: vitamin K/i.test(await identity())&&/Structure-derived name: Unavailable/.test(await identity()));
  check('generic vitamin K has no mass or exact mass in key facts',/Generic structure/.test(await identity())&&!/Molecular weight|Exact mass/.test(await text('.pr-keyfacts')));
  await shot('generic-1440x900-light');
  await tab('All Properties');
  check('generic scaffold excludes R from known heavy atoms and withholds DBE/tendencies',/Known heavy atoms/.test(await text('[data-testid=pr-detail]'))&&!await ev(`!![...document.querySelectorAll('.pr-table tbody th')].find(e=>/DBE|Molecular weight|Exact mass/.test(e.textContent))`));
  await tab('Summary');await button('Choose a concrete database entry');
  check('generic suggestions contain real concrete entries',/phylloquinone/.test(await identity())&&/CHEBI:18067/.test(await identity()));
  const variantLabel=await ev(`[...document.querySelectorAll('.pr-generic button')].find(e=>e.textContent.includes('phylloquinone'))?.textContent`);
  await button(variantLabel.trim());await waitFor(()=>ev(`/Loaded as: phylloquinone/.test(document.querySelector('.pr-identity')?.innerText||'')`),'concrete variant');
  check('variant is loaded only after selection and has valid full mass',/C31H46O2/.test(await identity())&&/Molecular weight/.test(await text('.pr-keyfacts')));
  await analyze('aspirin');await shot('recognized-1440x900-light');
  const before=await text('.pr-name');await edit('O=C(O)c1ccccc1OC(C)=O');await button('Analyze Molecule');await waitFor(()=>ev(`/Analysis complete/.test(document.querySelector('[data-testid=pr-status]').innerText)`),'equivalent edit');
  check('equivalent SMILES preserves imported aspirin identity',(await text('.pr-name'))===before&&/Loaded as:/.test(await identity()));
  await edit('CCO');await waitFor(()=>ev(`!document.querySelector('[data-testid=pr-identity]')`),'edited identity invalidation');
  check('chemically different editor content invalidates old identity',!await ev(`!!document.querySelector('[data-testid=pr-identity]')`));
  await button('Analyze Molecule');await waitFor(()=>ev(`/C2H6O/.test(document.querySelector('.pr-identity')?.innerText||'')`),'new identity');
  check('fresh structure naming replaces the previous imported alias',!/aspirin/i.test(await identity())&&!/Loaded as:/.test(await identity()));
  await analyze('cholesterol');await shot('complex-1440x900-light');
  check('complex natural product keeps recognized source identity',/Loaded as: cholesterol/i.test(await identity())&&/C27H46O/.test(await identity()));
  await analyze('smiles:c1ccc2ccccc2c1');await tab('Aromaticity');
  await waitFor(()=>ev(`/10 π electrons/.test(document.querySelector('.pr-aromaticity')?.innerText||'')`),'naphthalene');
  check('naphthalene is one fused aromatic system with two rings and 10 π',/1 ring system/.test(await text('.pr-aromatic-summary'))&&/2 rings/.test(await text('.pr-ring-list'))&&/10 π/.test(await text('.pr-ring-list')));
  await waitFor(()=>ev(`!!document.querySelector('.pr-aromaticity > .pr-depiction svg')`),'ring depiction');
  check('aromatic atoms and bonds are highlighted',await ev(`document.querySelectorAll('.pr-aromaticity > .pr-depiction svg ellipse').length>=10`));
  await shot('aromaticity-1440x900-light');
  await button('Find antiaromatic counterpart');
  check('unsupported counterpart is explicit',/No supported counterpart found/.test(await text('[data-testid=pr-counterpart-status]')));
  await analyze('smiles:C1C=CC=C1');await tab('Aromaticity');
  await button('Find aromatic counterpart');await waitFor(()=>ev(`!!document.querySelector('[data-testid=pr-counterpart-preview]')`),'counterpart preview');
  const original=await ev('window.ketcher.getSmiles()');
  check('preview does not overwrite editor',!original.includes('-'));
  check('preview shows original/proposed structures and transparent changes',await ev(`document.querySelectorAll('.pr-comparison-structures figure').length===2`)&&/Hydrogens|Formal charge|Conjugation/.test(await text('.pr-counterpart-preview')));
  await waitFor(()=>ev(`document.querySelectorAll('.pr-comparison-structures svg').length===2`),'comparison drawings');
  await shot('counterpart-preview-1440x900-light');
  await button('Cancel');check('cancel preserves original drawing',(await ev('window.ketcher.getSmiles()'))===original);
  await button('Find aromatic counterpart');await button('Apply to editor');
  await waitFor(()=>ev(`/Analysis complete/.test(document.querySelector('[data-testid=pr-status]')?.innerText||'')&&/6 π electrons/.test(document.querySelector('.pr-ring-list')?.innerText||'')`),'applied counterpart');
  check('explicit apply produces aromatic anion',(await ev('window.ketcher.getSmiles()')).includes('-'));
  await tab('Summary');await tab('Aromaticity');await button('Restore original');
  await waitFor(()=>ev(`/Analysis complete/.test(document.querySelector('[data-testid=pr-status]')?.innerText||'')&&!document.querySelector('[data-testid=pr-counterpart-status]')?.innerText.includes('Validating')`),'restored original');
  check('restore survives tab switches and restores original structure',(await ev('window.ketcher.getSmiles()'))===original);
  await button('Find antiaromatic counterpart');
  check('antiaromatic preview explicitly states planar singlet assumption',/planar singlet/.test(await text('.pr-counterpart-preview')));
  await shot('antiaromatic-preview-1440x900-light');await button('Cancel');
  // Save a recognized name and reopen: no analysis is requested while opening.
  await analyze('vitamin K');await tab('Summary');await button('Save Analysis');
  await setText('.synthesis-save-form input','Stage 29B identity');await button('Save',"document.querySelector('.synthesis-save-form')");await sleep(1400);
  await button('Saved',"document.querySelector('.tool-tabs')");await sleep(1200);
  const saved=await ev(`(()=>{const cards=[...document.querySelectorAll('li,article,tr')].filter(e=>e.innerText.includes('Stage 29B identity'));return cards.some(c=>[...c.querySelectorAll('button')].some(b=>/^Open/.test(b.innerText)));})()`);
  check('saved analysis is present',saved);
  await ev(`(()=>{const card=[...document.querySelectorAll('li,article,tr')].find(e=>e.innerText.includes('Stage 29B identity')&&[...e.querySelectorAll('button')].some(b=>/^Open/.test(b.innerText)));const b=[...card.querySelectorAll('button')].find(b=>/^Open/.test(b.innerText));b.setAttribute('data-open29','yes');})()`);await pointer('[data-open29]');
  await waitFor(()=>ev(`!!document.querySelector('.pr-identity')`),'reopened identity');await sleep(600);
  check('saved generic identity, provenance and mass guard survive reopen',/Loaded as: vitamin K/i.test(await identity())&&!/Molecular weight/.test(await text('.pr-keyfacts')));
  await button('Analyze Molecule');await waitFor(()=>ev(`/Analysis complete/.test(document.querySelector('[data-testid=pr-status]')?.innerText||'')`),'reanalyzed saved');
  check('saved source name survives reanalysis',/Loaded as: vitamin K/i.test(await identity()));
  await analyze('smiles:c1ccccc1C2CCCCC2');await tab('Aromaticity');
  const ringButtons=await ev(`document.querySelectorAll('.pr-ring-list button').length`);check('separate aromatic and saturated rings remain selectable',ringButtons===2);await pointer('.pr-ring-list button:nth-child(2)');
  check('pointer selects another ring system',await ev(`document.querySelector('.pr-ring-list button:nth-child(2)').getAttribute('aria-pressed')==='true'`));
  for(const [w,h,scheme] of [[1280,720,'dark'],[820,900,'light'],[375,812,'dark']]) {
    await setViewport(cdp,w,h,{scheme});await ev(`document.querySelector('.dashboard-tab-row').scrollIntoView()`);await shot(`aromaticity-${w}x${h}-${scheme}`,{top:false});
    await tab('Acid/Base');await shot(`acid-base-${w}x${h}-${scheme}`,{top:false});
    await tab('All Properties');await shot(`all-properties-${w}x${h}-${scheme}`,{top:false});
    check(`${w} specialized results have no page overflow`,await ev(`document.documentElement.scrollWidth<=innerWidth`));
    await tab('Aromaticity');
  }
  check('no uncaught browser exceptions',cdp.errors.length===0,cdp.errors.join(';').slice(0,400));
} catch(error) {check('browser workflow completed',false,error.stack);}
finally {
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({results,shots},null,2));
  console.log(`${results.filter(r=>r.ok).length}/${results.length} checks passed`);console.log('Screenshots:',out);stop();
}
if(results.some(r=>!r.ok))process.exitCode=1;
