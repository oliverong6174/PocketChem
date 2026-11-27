// Stage 29B-1C completion: default molecular forms, biomolecules, and the previously unverified browser paths.
import { session, setViewport, sleep, waitFor, q } from './lib/interact.mjs';

const s = await session({ port: 4431, debugPort: 9591, outDir: 'stage29b-1c-gaps' });
const { ev, check, text, exists, pointer, button, key, analyze, settled, smiles, shot, go, open, editorReady } = s;
const identity = () => text('[data-testid=pr-identity]');
const current = () => text('[data-testid=name-forms-current]');
// An empty CXSMILES label block ("|$;;;;$|") and a bracketed [*] say nothing more than a bare *.
const norm = (v) => String(v).replace(/ \|\$;*\$\|/g, '').replace(/\[\*\]/g, '*').replace(/\s/g, '');
async function chooseForm(label) {
  if (!(await exists('[data-testid=name-forms] [data-testid=name-variant-choices]'))) await pointer('[data-testid=name-forms-toggle]');
  for (let i = 0; i < 5; i += 1) {
    if (await ev(`[...document.querySelectorAll('[data-testid=name-forms] [data-testid=name-variant-choices] strong')].some(e=>e.innerText.trim()===${q(label)})`)) break;
    await pointer('[data-testid=name-forms-next]');
  }
  await ev(`(()=>{document.querySelectorAll('[data-pick]').forEach(e=>e.removeAttribute('data-pick'));[...document.querySelectorAll('[data-testid=name-forms] [data-testid=name-variant-choices] button')].find(b=>b.querySelector('strong').innerText.trim()===${q(label)}).setAttribute('data-pick','1')})()`);
  await pointer('[data-pick="1"]');
  await settled();
}
const sendMenu = async (selector) => { await pointer(selector); await sleep(500); };
const menuItem = async (label) => {
  await ev(`(()=>{document.querySelectorAll('[data-pick]').forEach(e=>e.removeAttribute('data-pick'));[...document.querySelectorAll('.mf-menu [role=menuitem]')].find(b=>b.innerText.trim()===${q(label)}).setAttribute('data-pick','2')})()`);
  await pointer('[data-pick="2"]');
  await sleep(1500);
};

await s.run(async () => {
  await open('?stage29b1c-gaps#/organic/properties');
  await editorReady();

  // ---- representative forms
  const message = await analyze('glucose');
  check('glucose loads at once (no error styling, no grid)', /Loaded/.test(message) && !(await exists('.molecule-name-message.error')) && !(await exists('[data-testid=name-variant-choices]')), message);
  check('glucose identifies the exact form', (await current()).trim() === 'β-D-glucopyranose', await current());
  const betaSmiles = await smiles();
  check('beta anomer is in the editor with stereochemistry', (betaSmiles.match(/@/g) ?? []).length >= 5, betaSmiles);
  await shot('glucose-default');
  await pointer('[data-testid=name-forms-toggle]');
  check('More forms shows only a first page', await ev(`document.querySelectorAll('[data-testid=name-variant-choices] button').length`) === 4);
  check('the rest are reachable progressively', await exists('[data-testid=name-forms-next]'));
  await shot('glucose-forms', { top: false });
  await pointer('[data-testid=name-forms-toggle]');
  await chooseForm('α-D-glucopyranose');
  const alphaSmiles = await smiles();
  check('switching to alpha loads a different, exact structure', norm(alphaSmiles) !== norm(betaSmiles), alphaSmiles);
  check('identity and form line follow the switch', /α/.test(await identity()) && (await current()).trim() === 'α-D-glucopyranose', await current());
  check('alternatives stay available after switching', await exists('[data-testid=name-forms-toggle]'));
  await ev(`window.ketcher.setMolecule('CCO')`);
  await sleep(1200);
  check('editing the drawing withdraws the form switcher', !(await exists('[data-testid=name-forms]')));

  await analyze('leucine');
  check('unqualified leucine loads L and says so', (await current()).trim() === 'L-leucine' && /@/.test(await smiles()), await current());
  await analyze('D-leucine');
  const d = await smiles();
  check('D-leucine is authoritative and offers no switcher', !(await exists('[data-testid=name-forms]')) && /@/.test(d), d);

  // ---- genuinely ambiguous name keeps a neutral selector
  await analyze('arabinose');
  check('ambiguous name: neutral selector, not an error', (await exists('[data-testid=name-variant-choices]')) && !(await exists('.molecule-name-message.error')));

  // ---- biomolecules through the real editor and analysis
  for (const name of ['tryptophan', 'histidine', 'GMP', 'FAD', 'coenzyme A', 'NADP+', 'sucrose', 'cholesterol', 'glutathione']) {
    try {
      const status = await analyze(name);
      const id = await identity();
      const drawn = (await ev(`document.querySelector('.pr-structure-svg svg')?.outerHTML.length??0`)) > 500;
      check(`${name}: loads, analyses and is drawn`, /Loaded/.test(status) && drawn && /formula/i.test(id), `${status} | ${id.slice(0, 80)}`);
    } catch (error) {
      check(`${name}: loads, analyses and is drawn`, false, `${error.message} | ${await text('.molecule-name-message')}`);
    }
  }
  await analyze('tryptophan');
  check('restored structure is disclosed', /N–H/.test(await text('.molecule-name-message')), await text('.molecule-name-message'));

  // ---- Saved Analyses: save, change, reopen
  await analyze('L-leucine');
  const leu = await smiles();
  await button('Save Analysis');
  await sleep(500);
  await ev(`document.querySelector('.save-analysis-form button[type=submit], form[class*=save] button[type=submit]')?.setAttribute('data-pick','save')`);
  if (await exists('[data-pick=save]')) await pointer('[data-pick=save]');
  else await button('Save');
  await sleep(1500);
  await analyze('benzene');
  await go('#/organic/saved');
  await waitFor(() => ev(`[...document.querySelectorAll('.saved-item-actions button')].some(b=>b.innerText.trim()==='Open')`), 'saved list', 30000);
  await shot('saved-list');
  await button('Open', `document.querySelector('.saved-item-actions')`);
  await sleep(2500);
  // The unsaved benzene result must be confirmed away; match the exact label (the name box also has a "Replace").
  check('opening over unsaved work asks first', await ev(`[...document.querySelectorAll('button')].some(b=>b.innerText.trim()==='Replace without saving')`));
  await button('Replace without saving');
  await waitFor(() => ev(`/Opened saved analysis/.test(document.querySelector('[data-testid=pr-status]')?.textContent||'')`), 'saved analysis opened', 60000)
    .catch(async (error) => check('saved analysis finishes opening', false, `${error.message} | ${await text('[data-testid=pr-status]')}`));
  await editorReady();
  check('saved analysis reopens with the same stereo structure', norm(await smiles()) === norm(leu), `${await smiles()} vs ${leu}`);
  check('saved analysis reopens its identity', /leucine/i.test(await identity()), (await identity()).slice(0, 80));

  // ---- figures outside Properties: copy and send; transfer INTO Properties with confirmation and cancel
  await go('#/biochemistry/amino-acids');
  await waitFor(() => exists('[data-testid=molecular-figure] [data-testid=mf-send]'), 'amino-acid figure', 30000);
  await ev(`document.querySelector('[data-testid=molecular-figure] [data-testid=mf-copy]').closest('[data-testid=molecular-figure]').setAttribute('data-figure','aa')`);
  await pointer('[data-figure=aa] [data-testid=mf-copy]');
  await sleep(600);
  const copied = await ev('navigator.clipboard.readText()');
  check('copying from a figure outside Properties gives a Molfile', /M {2}END/.test(copied), copied.slice(0, 60));
  await sendMenu('[data-figure=aa] [data-testid=mf-send]');
  await menuItem('Properties');
  await editorReady();
  await waitFor(() => exists('[data-testid=incoming-molecule-confirm],[data-testid=incoming-molecule-note]'), 'incoming', 30000);
  check('sending into an occupied Properties editor asks first', await exists('[data-testid=incoming-molecule-confirm]'));
  const before = await smiles();
  await shot('into-properties-confirm');
  await pointer('[data-testid=incoming-molecule-cancel]');
  await sleep(600);
  check('Keep current preserves the Properties drawing', norm(await smiles()) === norm(before) && !(await exists('[data-testid=incoming-molecule-confirm]')));
  await go('#/biochemistry/amino-acids');
  await waitFor(() => exists('[data-testid=molecular-figure] [data-testid=mf-send]'), 'amino-acid figure', 30000);
  await sendMenu('[data-testid=molecular-figure] [data-testid=mf-send]');
  await menuItem('Properties');
  await editorReady();
  await waitFor(() => exists('[data-testid=incoming-molecule-confirm]'), 'incoming 2', 30000);
  await pointer('[data-testid=incoming-molecule-replace]');
  await sleep(1500);
  check('Replace loads the sent molecule into Properties', norm(await smiles()) !== norm(before), await smiles());

  // ---- enhanced stereochemistry and special structures survive a real editor paste
  const racemate = '\n     RDKit          2D\n\n  0  0  0  0  0  0  0  0  0  0999 V3000\nM  V30 BEGIN CTAB\nM  V30 COUNTS 6 5 0 0 0\nM  V30 BEGIN ATOM\nM  V30 1 C 0.000000 0.000000 0.000000 0\nM  V30 2 C 1.299038 0.750000 0.000000 0\nM  V30 3 N 1.299038 2.250000 0.000000 0\nM  V30 4 C 2.598076 0.000000 0.000000 0\nM  V30 5 O 2.598076 -1.500000 0.000000 0\nM  V30 6 O 3.897114 0.750000 0.000000 0\nM  V30 END ATOM\nM  V30 BEGIN BOND\nM  V30 1 1 2 1 CFG=3\nM  V30 2 1 2 3\nM  V30 3 1 2 4\nM  V30 4 2 4 5\nM  V30 5 1 4 6\nM  V30 END BOND\nM  V30 BEGIN COLLECTION\nM  V30 MDLV30/STERAC1 ATOMS=(1 2)\nM  V30 END COLLECTION\nM  V30 END CTAB\nM  END\n';
  await ev(`window.ketcher.setMolecule(${q(racemate)})`);
  await sleep(1200);
  const kept = await ev('window.ketcher.getMolfile("v3000")');
  check('a racemic group stays racemic in the editor', /STERAC1/.test(kept), kept.slice(-300));

  // The same racemate analysed and copied from the Properties figure must not become one enantiomer.
  await button('Analyze Molecule');
  // A drawn structure has no name message, so wait on the analysis status alone.
  await waitFor(() => ev(`/Analysis complete/.test(document.querySelector('[data-testid=pr-status]')?.textContent||'')`), 'racemate analysis', 90000);
  await sleep(800);
  await pointer('.pr-structure-svg [data-testid=mf-copy]');
  await sleep(600);
  const racemicCopy = await ev('navigator.clipboard.readText()');
  check('copying an analysed racemic drawing keeps the group', /STERAC1/.test(racemicCopy), racemicCopy.slice(-300));

  for (const [label, input] of [['charged', 'smiles:CC(=O)[O-]'], ['isotopic', 'smiles:[2H]OC([2H])([2H])[2H]'], ['disconnected', 'smiles:[NH4+].[Cl-]'], ['wildcard', 'smiles:*CC(=O)O'], ['two stereocentres', 'L-threonine']]) {
    await analyze(input);
    const original = await smiles();
    if (!(await exists('.pr-structure-svg [data-testid=mf-copy]'))) { check(`${label}: copy control present`, false); continue; }
    await pointer('.pr-structure-svg [data-testid=mf-copy]');
    await sleep(500);
    const molfile = await ev('navigator.clipboard.readText()');
    await ev(`window.ketcher.setMolecule('')`);
    await sleep(500);
    await ev(`window.ketcher.setMolecule(${q(molfile)})`);
    await sleep(1200);
    check(`${label}: copy then load into Ketcher gives the same structure`, norm(await smiles()) === norm(original), `${await smiles()} vs ${original}`);
  }

  // ---- keyboard and touch on the enlarged viewer
  await analyze('cholesterol');
  await ev(`document.querySelector('.pr-structure-svg [data-testid=mf-expand]').focus()`);
  await key('Enter');
  check('Enter on the expand control opens the viewer', await exists('[data-testid=molecule-viewer]'));
  await key('Escape');
  check('Escape closes it', !(await exists('[data-testid=molecule-viewer]')));
  await setViewport(s.cdp, 375, 812, { scheme: 'light' });
  await sleep(600);
  await pointer('.pr-structure-svg [data-testid=mf-expand]');
  for (let i = 0; i < 3; i += 1) await pointer('[data-testid=mv-zoom-in]');
  const rect = () => ev(`(()=>{const c=document.querySelector('[data-testid=mv-canvas]').getBoundingClientRect(),t=document.querySelector('[data-testid=mv-stage]').getBoundingClientRect();return {left:c.left,x:t.left+t.width/2,y:t.top+t.height/2}})()`);
  const a = await rect();
  await s.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x, y: a.y, id: 1 }] });
  for (let i = 1; i <= 5; i += 1) await s.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a.x + i * 12, y: a.y, id: 1 }] });
  await s.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(300);
  const b = await rect();
  check('one-finger touch pans the enlarged molecule (emulated touch)', Math.abs(b.left - a.left - 60) < 8, `${b.left - a.left}`);
  await key('Escape');
  await analyze('glucose');
  check('phone: no horizontal overflow with the form line', await ev('document.documentElement.scrollWidth<=innerWidth'));
  await pointer('[data-testid=name-forms-toggle]');
  await ev(`document.querySelector('[data-testid=name-forms]').scrollIntoView({block:'center'})`);
  await shot('phone-forms', { top: false });
  check('phone: forms list does not overflow', await ev('document.documentElement.scrollWidth<=innerWidth'));

  // Last on purpose: this one can block the page and would contaminate every later check.
  // KNOWN DEFECT: property/reaction analysis of vitamin B12 does not finish (see HANDOFF-29B-1C.md).
  await setViewport(s.cdp, 1440, 900, { scheme: 'light' });
  const b12 = await analyze('vitamin B12').catch((error) => error.message);
  check('vitamin B12: analysis finishes', /Loaded/.test(b12) && !/Processing|Timed out|did not answer/.test(b12), b12);
});
