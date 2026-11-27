// Real pointer and keyboard interaction on top of lib/chrome.mjs, shared by the Stage 29B-1 checks.
import path from 'node:path';
import fs from 'node:fs';
import { q, root, screenshot, setViewport, sleep, startBrowser, waitFor } from './chrome.mjs';

export { q, root, setViewport, sleep, waitFor };

const KEY_CODES = {
  Enter: [13, 'Enter'], Escape: [27, 'Escape'], Tab: [9, 'Tab'], ArrowLeft: [37, 'ArrowLeft'], ArrowRight: [39, 'ArrowRight'],
  ArrowUp: [38, 'ArrowUp'], ArrowDown: [40, 'ArrowDown'], '+': [187, 'Equal'], '=': [187, 'Equal'], '-': [189, 'Minus'], '0': [48, 'Digit0'], '?': [191, 'Slash'], Backspace: [8, 'Backspace'],
};
export const CTRL = 2, SHIFT = 8;

export async function session({ port, debugPort, outDir }) {
  const out = path.join(root, 'node_modules/.cache', outDir);
  fs.mkdirSync(out, { recursive: true });
  const { cdp, url, stop } = await startBrowser({ port, debugPort });
  const results = [], shots = [], notes = [];
  const ev = (s) => cdp.evaluate(s);
  const check = (name, ok, detail = '') => { results.push({ name, ok: Boolean(ok), detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${ok ? '' : detail}`); };
  const note = (s) => { notes.push(s); console.log('NOTE ' + s); };
  const text = (selector) => ev(`document.querySelector(${q(selector)})?.innerText??''`);
  const exists = (selector) => ev(`!!document.querySelector(${q(selector)})`);

  /** Presses a key with optional modifiers; `commands` triggers Chrome's native editing command (copy, paste, undo...). */
  async function key(k, { modifiers = 0, commands } = {}) {
    const [vk, code] = KEY_CODES[k] ?? [k.toUpperCase().charCodeAt(0), `Key${k.toUpperCase()}`];
    const printable = !(modifiers & CTRL) && (k.length === 1 || k === 'Enter');
    const text = printable ? (k === 'Enter' ? '\r' : k) : undefined;
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, modifiers, ...(text ? { text } : {}), ...(commands ? { commands } : {}) });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, modifiers });
    await sleep(150);
  }
  async function pointer(selector) {
    const r = await ev(`(()=>{const e=document.querySelector(${q(selector)});if(!e)throw Error('Missing '+${q(selector)});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    await sleep(120);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...r });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...r, button: 'left', clickCount: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...r, button: 'left', clickCount: 1 });
    await sleep(250);
  }
  /** Clicks the first visible, enabled button (or summary, menu item) whose text or label matches. */
  async function button(label, scope = 'document') {
    const found = await ev(`(()=>{document.querySelectorAll('[data-click29]').forEach(e=>e.removeAttribute('data-click29'));const e=[...${scope}.querySelectorAll('button,summary')].find(e=>(e.innerText.trim()===${q(label)}||e.getAttribute('aria-label')===${q(label)})&&e.getClientRects().length&&!e.disabled);if(!e)return false;e.setAttribute('data-click29','yes');return true;})()`);
    if (!found) throw Error(`Missing button: ${label}`);
    await pointer('[data-click29]');
  }
  async function type(selector, value) {
    await ev(`(()=>{const e=document.querySelector(${q(selector)});e.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${q(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await sleep(80);
  }
  const editorReady = () => waitFor(() => ev(`!!window.ketcher && !!document.querySelector('.molecule-name-input') && !document.querySelector('.molecule-name-input').disabled`), 'editor', 90000);
  async function go(hash) {
    await ev(`location.hash=${q(hash)}`);
    await sleep(500);
  }
  async function open(hash) {
    await cdp.send('Page.navigate', { url: `${url}${hash}` });
    await sleep(500);
  }
  const analysisDone = `!!document.querySelector('.molecule-name-message.success') && /Analysis complete/.test(document.querySelector('[data-testid=pr-status]')?.textContent||'') && !document.querySelector('.molecule-name-input')?.disabled`;
  /** Types a name on Properties and waits for the analysis or the chooser. Returns the status message. */
  async function analyze(name) {
    await editorReady();
    await type('.molecule-name-input', name);
    await key('Enter');
    await sleep(600);
    await waitFor(() => ev(`(${analysisDone})||!!document.querySelector('[data-testid=name-variant-choices] button:not([disabled])') && !document.querySelector('[data-testid=name-forms]') || !!document.querySelector('.molecule-name-message.error')`), `analysis ${name}`, 120000);
    await sleep(400);
    return text('.molecule-name-message');
  }
  async function settled() {
    await sleep(500);
    await waitFor(() => ev(analysisDone), 'analysis finished', 120000);
    await sleep(500);
  }
  const smiles = (globalKey = 'ketcher') => ev(`window.${globalKey}.getSmiles()`);
  async function shot(file, { top = true } = {}) {
    if (top) await ev('window.scrollTo(0,0)');
    await sleep(200);
    await screenshot(cdp, path.join(out, `${file}.png`), { fullPage: false });
    shots.push(`${file}.png`);
  }
  async function run(body) {
    try {
      await setViewport(cdp, 1440, 900, { scheme: 'light' });
      await cdp.send('Browser.grantPermissions', { permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] }).catch(() => {});
      await body();
    } catch (error) {
      check('script ran to completion', false, String(error.stack || error));
      await shot('failure', { top: false }).catch(() => {});
    } finally {
      check('no uncaught page exceptions', cdp.errors.length === 0, cdp.errors.slice(0, 3).join(' | ').slice(0, 600));
      fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ results, notes, shots }, null, 1));
      const failed = results.filter((r) => !r.ok);
      console.log(`\n${results.length - failed.length}/${results.length} passed`);
      failed.forEach((f) => console.log('FAILED:', f.name, String(f.detail).slice(0, 500)));
      stop();
      setTimeout(() => process.exit(failed.length ? 1 : 0), 500);
    }
  }
  return { cdp, url, out, ev, check, note, text, exists, key, pointer, button, type, editorReady, go, open, analyze, settled, smiles, shot, run };
}
