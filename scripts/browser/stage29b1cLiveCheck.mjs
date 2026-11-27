import fs from 'node:fs';
import path from 'node:path';
import { q, root, screenshot, setViewport, sleep, startBrowser, waitFor } from './lib/chrome.mjs';

const out = path.join(root,'node_modules/.cache/stage29b-1c');
fs.mkdirSync(out,{recursive:true});
const { cdp, url, stop } = await startBrowser({port:4430,debugPort:9590});
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
  await key('Enter','Enter',13,String.fromCharCode(13));
  await sleep(700);
  const done=`!!document.querySelector('.molecule-name-message.success') && /Analysis complete/.test(document.querySelector('[data-testid=pr-status]')?.textContent||'') && !document.querySelector('.molecule-name-input')?.disabled`;
  await waitFor(()=>ev(`(${done})||!!document.querySelector('[data-testid=name-variant-choices] button')||/not found|could not/i.test(document.querySelector('.molecule-name-message')?.textContent||'')`),`analysis ${name}`,120000);
  if(await ev(`!!document.querySelector('[data-testid=name-variant-choices] button')`)){
    notes(`${name}: name is ambiguous or underspecified; variants offered: ${await ev(`[...document.querySelectorAll('[data-testid=name-variant-choices] button')].map(b=>b.innerText.trim()).slice(0,4).join(' / ')`)}`);
    await ev(`document.querySelector('[data-testid=name-variant-choices] button').setAttribute('data-click29','yes')`);
    await pointer('[data-click29]');await sleep(700);
  }
  if(await ev(`/not found|could not/i.test(document.querySelector('.molecule-name-message')?.textContent||'')`)) notes(`${name}: ${await ev(`document.querySelector('.molecule-name-message').textContent`)}`);
  await waitFor(()=>ev(done),`analysis ${name} finished`,120000);
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
const defects=[];
const notes=(s)=>{defects.push(s);console.log('NOTE '+s);};
const mouse=(type,x,y,extra={})=>cdp.send('Input.dispatchMouseEvent',{type,x,y,...extra});
const rectOf=(sel)=>ev(`(()=>{const e=document.querySelector(${q(sel)});if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,cx:r.x+r.width/2,cy:r.y+r.height/2,right:r.right,bottom:r.bottom};})()`);
const viewerOpen=()=>ev(`!!document.querySelector('[data-testid=molecule-viewer]')`);
const zoomText=()=>text('[data-testid=mv-zoom]');
const canvasLeft=()=>ev(`document.querySelector('[data-testid=mv-canvas]').getBoundingClientRect().left`);
const canvasW=()=>ev(`document.querySelector('[data-testid=mv-canvas]').getBoundingClientRect().width`);
async function closeViewer(){await key('Escape','Escape',27);await sleep(250);}
const molecules=['benzene','D-glucose','L-leucine','spermidine','cAMP','cholesterol','ATP'];
const dialogFits=()=>ev(`(()=>{const d=document.querySelector('[data-testid=molecule-viewer]').getBoundingClientRect();return d.left>=-1&&d.top>=-1&&d.right<=innerWidth+1&&d.bottom<=innerHeight+1&&document.documentElement.scrollWidth<=innerWidth;})()`);
try{
  await setViewport(cdp,1440,900,{scheme:'light'});
  await cdp.send('Browser.grantPermissions',{permissions:['clipboardReadWrite','clipboardSanitizedWrite']}).catch(()=>{});
  await cdp.send('Page.navigate',{url:`${url}?stage29b1c#/organic/properties`});
  await waitFor(()=>ev(`!!window.ketcher && !document.querySelector('.molecule-name-input')?.disabled`),'editor',90000);

  for(const name of molecules){
    await analyze(name);
    const id=await identity();
    const first=(id||'').split('\n').find(l=>l.trim()&&!/current molecule/i.test(l))||'';
    console.log(`[${name}] identity: ${first.trim()} | smiles ${await ev(`window.ketcher.getSmiles()`)}`);
    const pageSvg=await ev(`document.querySelector('.pr-structure-svg svg')?.outerHTML??''`);
    check(`${name}: structure drawn on the page`,pageSvg.length>500);
    await pointer('.pr-structure-svg');
    check(`${name}: clicking the depiction opens the viewer`,await viewerOpen());
    check(`${name}: viewer shows the identical depiction (same SVG markup)`,pageSvg===await ev(`document.querySelector('[data-testid=mv-canvas] svg').outerHTML`));
    check(`${name}: dialog inside the window, no page overflow`,await dialogFits());
    check(`${name}: close button focused on open`,await ev(`document.activeElement?.getAttribute('data-testid')==='mv-close'`));
    if(name==='L-leucine'||name==='cholesterol'){ await screenshot(cdp,path.join(out,`viewer-${name}.png`),{fullPage:false});shots.push(`viewer-${name}.png`); }
    if(name==='L-leucine'){
      const z0=parseInt(await zoomText()), w0=await canvasW();
      await pointer('[data-testid=mv-zoom-in]');
      const z1=parseInt(await zoomText());
      check('zoom in button increases zoom and canvas width',z1>z0&&await canvasW()>w0,`${z0}->${z1}`);
      await pointer('[data-testid=mv-zoom-out]');await pointer('[data-testid=mv-zoom-out]');
      check('zoom out button decreases zoom',parseInt(await zoomText())<z0);
      await pointer('[data-testid=mv-fit]');
      const s=await rectOf('[data-testid=mv-stage]');
      const w1=await canvasW();
      await mouse('mouseWheel',s.cx,s.cy,{deltaX:0,deltaY:-300});await sleep(200);
      check('mouse wheel zooms in',await canvasW()>w1+5,`${w1}->${await canvasW()}`);
      const scrollY0=await ev('scrollY');
      const left0=await canvasLeft();
      await mouse('mouseMoved',s.cx,s.cy);await mouse('mousePressed',s.cx,s.cy,{button:'left',clickCount:1});
      await mouse('mouseMoved',s.cx+80,s.cy+30,{button:'left'});await mouse('mouseReleased',s.cx+80,s.cy+30,{button:'left',clickCount:1});await sleep(200);
      check('dragging pans the molecule',Math.abs(await canvasLeft()-left0-80)<3,`dx=${await canvasLeft()-left0}`);
      check('wheel and drag did not scroll the page',await ev('scrollY')===scrollY0);
      await ev(`document.querySelector('[data-testid=mv-stage]').focus()`);
      const left1=await canvasLeft();
      await key('ArrowLeft','ArrowLeft',37);
      check('arrow key pans',Math.abs(await canvasLeft()-left1-40)<3,`dx=${await canvasLeft()-left1}`);
      await pointer('[data-testid=mv-fit]');
      check('fit centres the molecule again',await ev(`(()=>{const s=document.querySelector('[data-testid=mv-stage]').getBoundingClientRect(),c=document.querySelector('[data-testid=mv-canvas]').getBoundingClientRect();return Math.abs((s.left+s.width/2)-(c.left+c.width/2))<2&&c.width<=s.width+1&&c.height<=s.height+1;})()`));
      await pointer('[data-testid=mv-reset]');
      const natural=await ev(`(()=>{const v=document.querySelector('[data-testid=mv-canvas] svg').getAttribute('viewBox').split(' ').map(Number);return v[2];})()`);
      check('100% shows one SVG pixel per CSS pixel',Math.abs(await canvasW()-natural)<2,`${await canvasW()} vs ${natural}`);
      await pointer('[data-testid=mv-fit]');
      await ev(`document.querySelector('[data-testid=mv-stage]').focus()`);
      const wk=await canvasW();await key('+','Equal',187,'+');
      check('plus key zooms in',await canvasW()>wk);
      const s2=await rectOf('[data-testid=mv-stage]');const wA=await canvasW();
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:s2.cx-40,y:s2.cy,id:1},{x:s2.cx+40,y:s2.cy,id:2}]});
      for(let i=1;i<=6;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:s2.cx-40-i*15,y:s2.cy,id:1},{x:s2.cx+40+i*15,y:s2.cy,id:2}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await sleep(250);
      check('two-finger pinch zooms in',await canvasW()>wA*1.3,`${wA}->${await canvasW()}`);
      await ev('window.scrollTo(0,0)');
    }
    await closeViewer();
    check(`${name}: Escape closes the viewer`,!(await viewerOpen()));
  }
  await pointer('.pr-structure-svg [data-testid=mf-expand]');
  check('expand icon opens the viewer',await viewerOpen());
  await pointer('[data-testid=mv-close]');check('close button closes',!(await viewerOpen()));
  check('focus returns to the expand button',await ev(`document.activeElement?.getAttribute('data-testid')==='mf-expand'`));

  await analyze('L-leucine');await tab('Concepts');
  console.log('concepts',(await ev(`[...document.querySelectorAll('.concept-button')].map(e=>e.innerText.trim())`)).join('|'));
  await ev(`(()=>{const b=[...document.querySelectorAll('.concept-button')].find(e=>/functional/i.test(e.innerText))||document.querySelector('.concept-button');b.setAttribute('data-click29','yes')})()`);
  await pointer('[data-click29]');await sleep(600);
  const pageHl=await ev(`document.querySelector('.pr-concept-visual svg')?.outerHTML??''`);
  await pointer('.pr-concept-visual [data-testid=mf-expand]');
  const viewerHl=await ev(`document.querySelector('[data-testid=mv-canvas] svg')?.outerHTML??''`);
  check('concept view: highlights, wedges, labels preserved in the viewer',pageHl.length>500&&pageHl.replaceAll(' svg-clickable-site','')===viewerHl,`ellipses=${(pageHl.match(/<ellipse/g)||[]).length}`);
  await screenshot(cdp,path.join(out,'viewer-concept-highlight.png'),{fullPage:false});shots.push('viewer-concept-highlight.png');
  await closeViewer();
  console.log('dbg',await ev(`(()=>{const f=document.querySelector('.pr-concept-visual .mf');const s=f.querySelector('svg');return JSON.stringify({first:f.firstElementChild.className,svgParent:s.parentElement.className,count:s.querySelectorAll("[class*='atom-'], [class*='bond-']").length,tag:s.tagName})})()`));
  console.log('dbg2',await ev(`JSON.stringify(window.__dbg)`));
  console.log('sites-any',await ev(`document.querySelectorAll('.svg-clickable-site').length`),'inVisual',await ev(`document.querySelectorAll('.pr-concept-visual .svg-clickable-site').length`),await ev(`document.querySelector('.pr-concept-visual')?.innerHTML.slice(0,300)`));
  console.log('clickable',await ev(`[...document.querySelectorAll('.pr-concept-visual svg [class]')].slice(0,6).map(e=>e.getAttribute('class')).join('|')`),await ev(`document.querySelectorAll('.pr-concept-visual svg [class*=atom-], .pr-concept-visual svg [class*=bond-]').length`));
  check('concept atom clicking still works beside the expand control',await ev(`document.querySelectorAll('.pr-concept-visual .svg-clickable-site').length>0`));

  await analyze('L-leucine');
  const smi=await ev('window.ketcher.getSmiles()');
  check('analysed SMILES is isomeric',/@/.test(smi),smi);
  await pointer('.pr-structure-svg [data-testid=mf-copy]');await sleep(300);
  check('compact confirmation after copy',/copied/i.test(await text('.pr-structure-svg [data-testid=mf-note]')));
  const mol=await ev(`navigator.clipboard.readText()`);
  check('default copy puts a Molfile on the clipboard',/M  END/.test(mol)&&/V2000|V3000/.test(mol),mol.slice(0,40));
  await pointer('.pr-structure-svg [data-testid=mf-copy-more]');
  await pointer('[data-testid=mf-copy-smiles]');await sleep(300);
  const copiedSmiles=await ev(`navigator.clipboard.readText()`);
  check('SMILES copy keeps stereochemistry',/@/.test(copiedSmiles),copiedSmiles);
  await pointer('.pr-structure-svg [data-testid=mf-copy-more]');
  await pointer('[data-testid=mf-copy-image]');await sleep(800);
  const types=await ev(`navigator.clipboard.read().then(i=>i.flatMap(x=>x.types))`).catch(e=>['error '+e.message]);
  check('image copy writes image/png',types.includes('image/png'),types.join(','));
  await pointer('.pr-structure-svg [data-testid=mf-copy]');await sleep(300);
  await ev(`window.ketcher.setMolecule('')`);await sleep(600);
  const frame=await rectOf('.drawer-placeholder');
  await mouse('mousePressed',frame.cx,frame.cy,{button:'left',clickCount:1});await mouse('mouseReleased',frame.cx,frame.cy,{button:'left',clickCount:1});await sleep(300);
  await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'v',code:'KeyV',windowsVirtualKeyCode:86,modifiers:2,commands:['paste']});
  await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'v',code:'KeyV',windowsVirtualKeyCode:86,modifiers:2});
  await sleep(1500);
  const pasted=await ev('window.ketcher.getSmiles()');
  console.log('pasted via Ctrl+V:',pasted);
  check('Ctrl+V into Ketcher yields the same stereo structure',/\S/.test(pasted)&&pasted.replace(/\s/g,'')===smi.replace(/\s/g,''),`${pasted} vs ${smi}`);
  await screenshot(cdp,path.join(out,'after-paste.png'),{fullPage:false});shots.push('after-paste.png');
  // ---- cross-workspace transfer
  const menuItems=()=>ev(`[...document.querySelectorAll('.mf-menu [role=menuitem]')].map(b=>b.innerText.trim())`);
  const openSendMenu=async()=>{await ev(`window.scrollTo(0,0)`);await pointer('[data-testid=pr-identity] [data-testid=mf-send]');await sleep(500);};
  const pickDestination=async(label)=>{
    await openSendMenu();
    const ok=await ev(`(()=>{document.querySelectorAll('[data-click29]').forEach(e=>e.removeAttribute('data-click29'));const b=[...document.querySelectorAll('.mf-menu [role=menuitem]')].find(b=>b.innerText.trim()===${q(label)});if(!b)return false;b.setAttribute('data-click29','yes');return true;})()`);
    if(!ok)return false;await pointer('[data-click29]');await sleep(1800);return true;
  };
  const backToProperties=async()=>{await ev(`location.hash='#/organic/properties'`);await waitFor(()=>ev(`!!window.ketcher && !!document.querySelector('.molecule-name-input') && !document.querySelector('.molecule-name-input').disabled`),'properties again',60000);await sleep(800);};
  const norm=(s)=>String(s).replace(/\s/g,'');
  await analyze('L-leucine');
  const leu=(await ev('window.ketcher.getSmiles()'));
  await openSendMenu();
  const dests=await menuItems();
  console.log('destinations (organic origin):',dests.join(', '));
  check('Open in lists every other workspace and not Properties',['Ranking','Spectroscopy','Conformations','Reactions','Multi-Step','Multi-Catalytic'].every(d=>dests.includes(d))&&!dests.includes('Properties'),dests.join(','));
  await key('Escape','Escape',27);await sleep(200);
  check('Escape closes the menu',!(await ev(`!!document.querySelector('.mf-menu')`)));
  const targets=[['Reactions','reactionKetcher'],['Ranking','rankingKetcher'],['Spectroscopy','spectroscopyKetcher'],['Multi-Step','synthesisReactantKetcher'],['Multi-Catalytic','multiCatalyticWorkspaceKetcher']];
  for(const [label,globalKey] of targets){
    check(`send to ${label}`,await pickDestination(label));
    await waitFor(()=>ev(`!!window.${globalKey} && (!!document.querySelector('[data-testid=incoming-molecule-note]')||!!document.querySelector('[data-testid=incoming-molecule-confirm]'))`),`${label} receives`,60000).catch(()=>{});
    const note=await ev(`document.querySelector('[data-testid=incoming-molecule-note]')?.textContent||document.querySelector('[data-testid=incoming-molecule-confirm]')?.textContent||''`);
    const got=await ev(`window.${globalKey}?window.${globalKey}.getSmiles():''`);
    console.log(label,'->',got,'|',note.trim());
    check(`${label}: the actual stereo structure arrived`,norm(got)===norm(leu),got);
    check(`${label}: compact confirmation, no overflow`,/opened here/.test(note)&&await ev('document.documentElement.scrollWidth<=innerWidth'),note.trim());
    await screenshot(cdp,path.join(out,`transfer-${label}.png`),{fullPage:false});shots.push(`transfer-${label}.png`);
    await backToProperties();
  }
  check('send to Conformations',await pickDestination('Conformations'));
  await sleep(2000);
  const confNote=await ev(`document.querySelector('[data-testid=incoming-molecule-note]')?.textContent||document.querySelector('[data-testid=incoming-molecule-confirm]')?.textContent||''`);
  console.log('Conformations ->',confNote.trim(),'|',((await ev(`document.querySelector('.conf-page')?.innerText.slice(0,160)`))||'').replace(/\s+/g,' '));
  check('Conformations received the molecule',/opened here/.test(confNote),confNote.trim());
  await backToProperties();

  await analyze('L-alanine');
  const ala=await ev('window.ketcher.getSmiles()');
  check('send alanine to Reactions (non-empty editor)',await pickDestination('Reactions'));
  await waitFor(()=>ev(`!!document.querySelector('[data-testid=incoming-molecule-confirm]')`),'confirmation').catch(()=>{});
  check('replacing an existing drawing asks first',await ev(`!!document.querySelector('[data-testid=incoming-molecule-confirm]')`));
  check('Reactions drawing unchanged while the question is open',norm(await ev('window.reactionKetcher.getSmiles()'))===norm(leu));
  await screenshot(cdp,path.join(out,'transfer-confirm.png'),{fullPage:false});shots.push('transfer-confirm.png');
  await pointer('[data-testid=incoming-molecule-cancel]');await sleep(500);
  check('Keep current leaves the drawing and removes the question',norm(await ev('window.reactionKetcher.getSmiles()'))===norm(leu)&&!(await ev(`!!document.querySelector('[data-testid=incoming-molecule-confirm]')`)));
  await backToProperties();
  check('send alanine again',await pickDestination('Reactions'));
  await waitFor(()=>ev(`!!document.querySelector('[data-testid=incoming-molecule-confirm]')`),'confirmation 2').catch(()=>{});
  await pointer('[data-testid=incoming-molecule-replace]');await sleep(1200);
  check('Replace loads the new molecule',norm(await ev('window.reactionKetcher.getSmiles()'))===norm(ala));
  await backToProperties();
  check('origin workspace unchanged by the transfer',norm(await ev('window.ketcher.getSmiles()'))===norm(ala));

  await analyze('smiles:[Na+].[Cl-]');
  await openSendMenu();const saltDest=await menuItems();console.log('salt destinations:',saltDest.join(', '));
  check('a salt is not offered to Spectroscopy, Conformations or Ranking',!['Spectroscopy','Conformations','Ranking'].some(d=>saltDest.includes(d)),saltDest.join(','));
  await key('Escape','Escape',27);

  await analyze('L-leucine');
  for(const [w,h,scheme] of [[1440,900,'dark'],[820,1000,'light'],[375,812,'dark']]){
    await setViewport(cdp,w,h,{scheme});await sleep(600);
    await ev('window.scrollTo(0,0)');
    check(`${w}x${h} ${scheme}: figure toolbar present`,await ev(`!!document.querySelector('.pr-structure-svg [data-testid=mf-expand]')`));
    await pointer('.pr-structure-svg [data-testid=mf-expand]');
    check(`${w}x${h} ${scheme}: viewer inside the window, controls reachable`,await viewerOpen()&&await dialogFits()&&await ev(`['mv-zoom-in','mv-zoom-out','mv-fit','mv-reset','mv-close'].every(t=>{const r=document.querySelector('[data-testid='+t+']').getBoundingClientRect();return r.width>0&&r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})`));
    await screenshot(cdp,path.join(out,`viewer-${w}x${h}-${scheme}.png`),{fullPage:false});shots.push(`viewer-${w}x${h}-${scheme}.png`);
    await closeViewer();
    check(`${w}x${h} ${scheme}: no horizontal overflow after closing`,await ev(`document.documentElement.scrollWidth<=innerWidth`));
    await screenshot(cdp,path.join(out,`page-${w}x${h}-${scheme}.png`),{fullPage:false});shots.push(`page-${w}x${h}-${scheme}.png`);
  }
  await setViewport(cdp,1440,900,{scheme:'light'});await sleep(400);
  await analyze('benzene');await tab('Aromaticity');
  const arom=await ev(`document.querySelector('[data-testid=pr-aromaticity]')?.innerText||''`);
  check('Aromaticity panel carries no implementation wording or separator dots',arom.length>20&&!/RDKit|bounded|teaching|edit cost|·/i.test(arom),arom.slice(0,160));
}catch(e){check('script ran to completion',false,String(e.stack||e));}
finally{
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({results,defects,shots},null,1));
  const failed=results.filter(r=>!r.ok);
  console.log(`\n${results.length-failed.length}/${results.length} passed`);failed.forEach(f=>console.log('FAILED:',f.name,f.detail));
  stop();
}
