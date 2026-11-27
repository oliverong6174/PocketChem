import fs from 'node:fs';
import path from 'node:path';
import { q, root, screenshot, setViewport, sleep, startBrowser, waitFor } from './lib/chrome.mjs';

const out = path.join(root, 'node_modules/.cache/stage29b-1/before');
fs.mkdirSync(out, { recursive: true });
const { cdp, url, stop } = await startBrowser({ port: 4399, debugPort: 9559 });
const ev = (s) => cdp.evaluate(s);
async function analyze(name) {
  await ev(`(() => {const e=[...document.querySelectorAll('main input')].find(e=>/SMILES/.test(e.placeholder));e.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${q(name)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await cdp.send('Input.dispatchKeyEvent', { type:'keyDown', key:'Enter', code:'Enter', windowsVirtualKeyCode:13, text:'\r' });
  await cdp.send('Input.dispatchKeyEvent', { type:'keyUp', key:'Enter', code:'Enter', windowsVirtualKeyCode:13 });
  await waitFor(()=>ev(`!/Processing|Resolving|Analyzing/.test(document.querySelector('.molecule-name-message')?.textContent||'') && /Analysis complete/.test(document.querySelector('[data-testid=pr-status]')?.textContent||'')`),name,120000);
  await sleep(1800);
}
try {
  await setViewport(cdp,1440,900,{scheme:'light'});
  await cdp.send('Page.navigate',{url:`${url}?stage29baseline`});
  await waitFor(()=>ev(`!!window.ketcher && [...document.querySelectorAll('main input')].some(e=>/SMILES/.test(e.placeholder))`),'editor',90000);
  await sleep(2500);
  await analyze('acetic acid');
  for(const [w,h] of [[1920,1080],[1440,900],[1440,768],[1280,720],[820,900],[375,812]]) for(const scheme of ['light','dark']) {
    await setViewport(cdp,w,h,{scheme}); await sleep(300); await ev('window.scrollTo(0,0)');
    await screenshot(cdp,path.join(out,`summary-${w}x${h}-${scheme}.png`),{fullPage:false});
  }
  await setViewport(cdp,1440,900,{scheme:'light'});
  for(const label of ['Acid/Base','All properties']) {
    await ev(`[...document.querySelectorAll('.dashboard-tab')].find(e=>e.textContent.trim()===${q(label)})?.click()`); await sleep(300);
    await screenshot(cdp,path.join(out,`${label==='Acid/Base'?'acid-base':'all-properties'}-1440x900-light.png`),{fullPage:false});
  }
  await ev(`[...document.querySelectorAll('.dashboard-tab')].find(e=>e.textContent.trim()==='Summary')?.click()`);
  for(const [name,file] of [['vitamin K','generic'],['aspirin','recognized'],['cholesterol','complex']]) {
    await analyze(name);
    console.log(name, await ev(`document.querySelector('[data-testid=pr-identity]')?.innerText`));
    await screenshot(cdp,path.join(out,`${file}-1440x900-light.png`),{fullPage:false});
  }
  console.log('Baseline:',out);
} finally {stop();}
