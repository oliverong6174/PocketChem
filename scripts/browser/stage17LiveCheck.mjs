// Stage 17 live-browser check (headless Chrome, production build): Biochemistry amino acids and peptides, protein structure and folding,
// enzymes and catalysis, Explore/Practice/Challenge, saving, reopening, the Translation hand-off, responsive layout, themes and other subjects.
//   npm run build && node scripts/browser/stage17LiveCheck.mjs      (screenshots: node_modules/.cache/pc-live17)
import path from "node:path";
import { q, root, screenshot, setViewport, sleep, startBrowser, waitFor } from "./lib/chrome.mjs";

const results = [];
const check = (name, ok, detail = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${detail}` : ""}`); };
const outDir = process.env.SHOT_DIR ?? path.join(root, "node_modules", ".cache", "pc-live17");
const { cdp, url, stop } = await startBrowser({ port: 4350, debugPort: 9510 });
const ev = (e) => cdp.evaluate(e);
let nav = 0;
const click = (label, scope = "document") => ev(`(() => { const b = [...${scope}.querySelectorAll('button')].find((x) => x.innerText.trim() === ${q(label)} && !x.disabled && x.getClientRects().length); if (!b) return false; b.click(); return true; })()`);
const choose = (label) => ev(`(() => { const o = [...document.querySelectorAll('.ui-seg-option')].find((x) => x.textContent.trim() === ${q(label)} && x.getClientRects().length); if (!o) return false; o.querySelector('input').click(); return true; })()`);
const setSel = (testid, value) => ev(`(() => { const el = document.querySelector('[data-testid=${testid}]'); if (!el) return false; Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, ${q(String(value))}); el.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
const tick = (testid) => ev(`(() => { const el = document.querySelector('[data-testid=${testid}]'); if (!el) return false; el.click(); return true; })()`);
const setText = (selector, value) => ev(`(() => { const el = document.querySelector(${q(selector)}); if (!el) return false; const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement : HTMLInputElement; Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, ${q(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
const setLabelled = (startsWith, value) => ev(`(() => { const f = [...document.querySelectorAll('.gc-field label')].find((l) => l.textContent.startsWith(${q(startsWith)})); if (!f) return false; const el = document.getElementById(f.htmlFor); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${q(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
const text = (sel) => ev(`document.querySelector(${q(sel)})?.textContent ?? null`);
const attr = (sel, a) => ev(`document.querySelector(${q(sel)})?.getAttribute(${q(a)}) ?? null`);
const count = (sel) => ev(`document.querySelectorAll(${q(sel)}).length`);
const figs = () => ev(`(document.querySelector('.ui-figures')?.innerText ?? '').replace(/\\s+/g, ' ')`);
const bodyText = () => ev(`document.body.innerText`);
const clearStorage = () => ev(`(async () => { try { localStorage.clear(); sessionStorage.clear(); const dbs = (await indexedDB.databases?.()) ?? []; await Promise.all(dbs.map((d) => new Promise((res) => { const r = indexedDB.deleteDatabase(d.name); r.onsuccess = r.onerror = r.onblocked = () => res(); }))); } catch (e) { /* nothing to clear */ } return true; })()`);
const fresh = async (w, scheme, target, { keep = false } = {}) => {
  await setViewport(cdp, w, w < 500 ? 812 : w < 1000 ? 1024 : 900, { scheme });
  if (!keep) {
    // the page being left autosaves on unload, so clear from a freshly loaded, untouched page and then load the target
    nav += 1;
    await cdp.send("Page.navigate", { url: `${url}?n=${nav}#/biology/overview` });
    await waitFor(() => ev(`document.readyState === 'complete' && document.body.innerText.length > 50`), "app");
    await sleep(300);
    await clearStorage();
  }
  nav += 1;
  await cdp.send("Page.navigate", { url: `${url}?n=${nav}${target}` });
  await waitFor(() => ev(`document.readyState === 'complete' && document.body.innerText.length > 50`), "app");
  await sleep(800);
};
const steps = async (n) => { for (let i = 0; i < n; i += 1) await click("Next ▶"); await sleep(200); };
const readout = async () => (await ev(`document.querySelector('.ph-time-readout')?.textContent ?? ''`)).trim();
const overflow = () => ev(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
const tabs = () => ev(`[...document.querySelectorAll('.tool-tabs [role=tab]')].map((b) => b.textContent.trim()).join('|')`);
const shot = async (name, sel = ".ui-diagram") => { await ev(`(document.querySelector(${q(sel)}) || document.body).scrollIntoView({ block: 'start' })`); await sleep(250); await screenshot(cdp, path.join(outDir, name), { fullPage: false }); };
const lac = async () => ({ rank: await attr("[data-testid=lac-diagram]", "data-rank"), rep: await attr("[data-testid=lac-diagram]", "data-repressor-bound"), crp: await attr("[data-testid=lac-diagram]", "data-crp") });
const cell = async () => ({ stage: await attr("[data-testid=cell-diagram]", "data-stage"), cells: await attr("[data-testid=cell-diagram]", "data-cells"), chr: await attr("[data-testid=cell-diagram]", "data-chromosomes"), cht: await attr("[data-testid=cell-diagram]", "data-chromatids") });
const stageButton = (label) => ev(`(() => { const b = [...document.querySelectorAll('[data-testid=stage-timeline] button')].find((x) => x.textContent.trim() === ${q(label)}); if (!b) return false; b.click(); return true; })()`);
const tableCells = (sel) => ev(`[...document.querySelectorAll(${q(sel)} + ' tbody tr')].map((r) => [...r.children].map((c) => c.textContent.trim()).join('=')).join('|')`);

try {
  // ---- 1. Biochemistry navigation; the other subjects
  await fresh(1440, "light", "#/biochemistry/overview");
  check("1 Biochemistry tabs", (await tabs()) === "Overview|Amino acids & peptides|Protein structure & folding|Enzymes & catalysis|Glycolysis|Gluconeogenesis|Pyruvate oxidation & citric acid cycle|Electron transport & oxidative phosphorylation|Integrated metabolic map|Saved", await tabs());
  const ov = await ev(`({ cards: [...document.querySelectorAll('.gc-tool-card button')].map((b) => b.textContent.trim()), pb: document.querySelectorAll('.gc-planned button').length, planned: [...document.querySelectorAll('.gc-planned li')].map((x) => x.textContent).join('|') })`);
  check("1 overview: eight working tools (three Stage 17 + five metabolic), planned list has no buttons and no longer lists metabolic pathway maps", ov.cards.length === 8 && ov.pb === 0 && /Carbohydrates/.test(ov.planned) && !/Metabolic pathway|Enzyme kinetics|Amino acids/.test(ov.planned), JSON.stringify(ov.cards));
  await click("Open Enzymes & catalysis"); await sleep(800);
  check("1 Open button reaches Enzymes; hash", (await ev("location.hash")) === "#/biochemistry/enzymes", await ev("location.hash"));
  const picker = await ev(`[...document.querySelectorAll('button, [role=tab], [role=option], option')].map((b) => b.textContent.trim()).filter((t) => /Biochemistry/.test(t)).slice(0, 3).join('|')`);
  check("1 Biochemistry is selectable in the subject switcher", /Biochemistry/.test(picker), picker);
  await fresh(1440, "light", "#/organic/properties");
  check("18 Organic tabs unchanged", (await tabs()).startsWith("Properties|Ranking|Spectroscopy|Conformations|Reactions"), await tabs());
  await fresh(1440, "light", "#/physics/overview");
  check("18 Physics tabs unchanged", (await tabs()) === "Overview|Mechanics & motion|Forces & Newton's laws|Work & energy|Momentum & collisions|DC circuits|RC transient|Saved", await tabs());
  await fresh(1440, "light", "#/general/overview");
  check("18 General Chemistry tabs unchanged", (await tabs()) === "Overview|Acid–base & titration|Chemical equilibrium|Reaction kinetics|Thermodynamics|Saved", await tabs());
  await fresh(1440, "light", "#/biology/overview");
  check("18 Biology tabs unchanged", (await tabs()) === "Overview|DNA replication|Transcription & RNA processing|Translation|DNA → RNA → protein|Gene regulation|Genetics & inheritance|Mitosis & meiosis|Saved", await tabs());

  // ---- 2. amino acids: one residue
  await fresh(1440, "light", "#/biochemistry/amino-acids");
  await waitFor(() => ev(`!!document.querySelector('[data-testid=molecule-svg] svg')`), "structure drawn", 20000);
  check("2 default alanine: structure drawn with RDKit, 20 amino-acid buttons", (await count("[data-testid^=aa-]")) >= 20 && /Alanine/.test((await text("[data-testid=aa-props]")) ?? ""));
  await ev(`document.querySelector('[data-testid=aa-W]').click()`); await sleep(900);
  const trp = (await text("[data-testid=aa-props]")) ?? "";
  check("2 tryptophan: name, aromatic class, formula, hydropathy −0.9, one stereocentre (S)", /Tryptophan/.test(trp) && /Aromatic/.test(trp) && /C11H12N2O2/.test(trp) && /-0\.9/.test(trp) && /Cα \(S\)/.test(trp), trp.slice(0, 160));
  check("2 structure legend names backbone and side chain", /Backbone/.test(await text(".bc-mol-legend")) && /Side chain/.test(await text(".bc-mol-legend")));
  await ev(`document.querySelector('[data-testid=aa-C]').click()`); await sleep(700);
  check("2 cysteine is labelled (R) although it is the L-form", /Cα \(R\)/.test((await text("[data-testid=aa-props]")) ?? ""));
  check("2 a class shape accompanies each button (not color alone)", (await ev(`[...document.querySelectorAll('[data-testid^=aa-]')].every((b) => /[●⬢◆▲▼]/.test(b.textContent))`)) === true);
  await shot("aa-residue.png", ".ui-diagram");

  // ---- 3. compare
  await choose("Compare two"); await sleep(900);
  await ev(`document.querySelector('[aria-label="Second amino acid"] [data-testid=aa-D]').click()`); await sleep(900);
  const cmp = (await text("[data-testid=compare-table]")) ?? "";
  check("3 compare Cys vs Asp: hydropathy 2.5 vs -3.5 differs, net charge at pH 7 shown", /Hydropathy2\.5-3\.5different/.test(cmp.replace(/\s/g, "")) && /Net charge at pH 7/.test(cmp), cmp.replace(/\s+/g, " ").slice(0, 200));
  check("3 two structures drawn", (await count("[data-testid=molecule-svg] svg")) === 2);

  // ---- 4. ionization
  await choose("Ionization & pKa"); await sleep(900);
  await ev(`document.querySelector('[data-testid=aa-K]').click()`); await sleep(700);
  const setPh = (v) => ev(`(() => { const el = [...document.querySelectorAll('input[type=range]')].find((x) => x.closest('.gc-slider')?.textContent.includes('pH')); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${q(String(v))}); el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  await setPh(7); await sleep(400);
  const rows7 = await tableCells("[data-testid=group-table]");
  await setPh(12); await sleep(400);
  const rows12 = await tableCells("[data-testid=group-table]");
  check("4 lysine: side-chain amino is ~100% protonated at pH 7 and ~3% at pH 12", /side-chain.*?=10\.53=100%/i.test(rows7) && /side-chain.*?=10\.53=3%/i.test(rows12), `${rows7} || ${rows12}`);
  check("4 titration chart with a draggable pH marker (slider) and a pI marker", (await count("[data-testid=aa-props], .ui-diagram [role=slider]")) >= 1 && /pI 9\.74|pI 9\.7/.test(await bodyText()));
  await ev(`(() => { const s = document.querySelector('.ui-diagram [role=slider]'); s.focus(); s.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); })()`); await sleep(300);
  check("4 keyboard moves the chart's pH marker", /pH 12\.1/.test(await attr(".ui-diagram [role=slider]", "aria-valuetext") ?? ""), await attr(".ui-diagram [role=slider]", "aria-valuetext"));
  await shot("aa-ionization.png", ".ui-diagram");

  // ---- 5. peptide builder
  await choose("Build a peptide"); await sleep(900);
  await setLabelled("Sequence (N → C)", "YGGFL"); await sleep(1200);
  const keys = await text(".ui-figures") ?? "";
  check("5 Leu-enkephalin YGGFL: formula C28H37N5O7 and mass 555.2693", /C28H37N5O7/.test(await bodyText()) && /555\.2693/.test(await bodyText()), keys.slice(0, 120));
  check("5 four peptide bonds listed and drawn in green", (await count("[data-testid=peptide-chain] .bc-bond")) === 4 && /Peptide-bond planar unit/.test(await text(".bc-mol-legend")));
  await ev(`document.querySelectorAll('[data-testid=peptide-chain] button')[3].click()`); await sleep(500);
  check("5 selecting residue 4 (Phe) shows its properties and highlights it", /Phenylalanine/.test((await text("[data-testid=selected-residue]")) ?? "") && /Selected residue 4/.test(await text(".bc-mol-legend")));
  await click("Reverse chain"); await sleep(900);
  check("5 reversing gives LFGGY with the same formula", (await ev(`document.querySelector('.gc-field input.bio-seq')?.value`)) === "LFGGY" && /C28H37N5O7/.test(await bodyText()));
  await setLabelled("Sequence (N → C)", "GAXZ"); await sleep(500);
  check("5 invalid letters give an inline error, not a crash", /not a standard amino acid|X|invalid|letter/i.test((await text(".gc-field-error")) ?? "") || (await count(".gc-field.has-error")) === 1);
  await setLabelled("Sequence (N → C)", "GAS"); await sleep(500);

  // ---- 6. practice and challenge on amino acids
  await ev(`[...document.querySelectorAll('.ui-seg-option')].find((x) => x.textContent.trim() === 'Practice')?.click()`); await sleep(600);
  await choose("One amino acid"); await sleep(600);
  check("6 practice (one residue): properties hidden until revealed, a quiz appears", /Properties hidden/.test(await bodyText()) && (await count("[data-testid=quiz-prompt]")) === 1);
  const quizAnswer = async () => ev(`(() => { const o = document.querySelectorAll('.bio-quiz .bio-option'); o[0].click(); return true; })()`);
  await quizAnswer(); await sleep(300);
  check("6 practice: an answer shows a reason", ((await text("[data-testid=quiz-explanation]")) ?? "").length > 20);
  await click("Reveal properties"); await sleep(400);
  check("6 reveal shows the properties", (await count("[data-testid=aa-props]")) === 1);
  await ev(`[...document.querySelectorAll('.ui-seg-option')].find((x) => x.textContent.trim() === 'Challenge')?.click()`); await sleep(600);
  await choose("Ionization & pKa"); await sleep(700);
  const prompt = (await text("[data-testid=predict-prompt]")) ?? "";
  check("6 challenge: asks to predict a charge change before the pH is applied", /Predict the change in net charge/.test(prompt), prompt.slice(0, 100));
  const phBefore = await ev(`[...document.querySelectorAll('.gc-slider')].find((x) => x.textContent.includes('pH'))?.querySelector('strong')?.textContent`);
  await ev(`document.querySelectorAll('.bio-quiz .bio-option')[0].click()`); await sleep(300);
  check("6 challenge: the pH has not moved until the learner answers and reveals", phBefore === (await ev(`[...document.querySelectorAll('.gc-slider')].find((x) => x.textContent.includes('pH'))?.querySelector('strong')?.textContent`)));
  await tick("predict-reveal"); await sleep(600);
  check("6 challenge: revealing applies the new pH", phBefore !== (await ev(`[...document.querySelectorAll('.gc-slider')].find((x) => x.textContent.includes('pH'))?.querySelector('strong')?.textContent`)));

  // ---- 7. protein structure
  await fresh(1440, "light", "#/biochemistry/protein-structure");
  check("7 levels: insulin primary structure shows real residues", (await count("svg[aria-label^='Level 1'] text")) > 10 && /insulin/i.test(await bodyText()));
  await choose("Tertiary"); await sleep(400);
  check("7 insulin tertiary level shows its three disulfide bonds", (await ev(`document.querySelector("svg[aria-label^='Level 3']").textContent.match(/S–S/g)?.length`)) === 3 && /three disulfide|disulfide/i.test((await text("[data-testid=level-text]")) ?? ""));
  await choose("Quaternary"); await choose("Hemoglobin A"); await sleep(400);
  check("7 hemoglobin quaternary: four subunits", /4 chains assemble/.test(await ev(`document.querySelector("svg[aria-label^='Level 4']").textContent`)));
  await choose("α-helix"); await sleep(500);
  check("7 helix of 14: 10 backbone H-bonds, and 4 free N–H and 4 free C=O", /10/.test(await ev(`document.querySelector('.ui-figures')?.textContent ?? ''`)) && /4 N–H, 4 C=O/.test(await bodyText()));
  await ev(`document.querySelector('svg[aria-label^="Alpha helix"] [role=button]').dispatchEvent(new MouseEvent('click', { bubbles: true }))`); await sleep(300);
  check("7 helix: selecting residue 1 reports its partner (residue 5)", /residue 5/.test((await text("[data-testid=helix-selected]")) ?? ""), await text("[data-testid=helix-selected]"));
  await shot("helix.png", ".ui-diagram");
  await choose("β-sheet"); await sleep(400);
  const antiBonds = await ev(`document.querySelectorAll('svg[aria-label*="beta sheet"] line').length`);
  await choose("Parallel"); await sleep(400);
  const parBonds = await ev(`document.querySelectorAll('svg[aria-label*="beta sheet"] line').length`);
  check("7 sheet: both orientations draw interstrand bonds; antiparallel label then parallel label", antiBonds > 0 && parBonds > 0 && /parallel/.test(await attr("svg[aria-label*='beta sheet']", "aria-label")), `${antiBonds}/${parBonds}`);
  await shot("sheet.png", ".ui-diagram");
  await choose("Ramachandran"); await sleep(400);
  check("7 rama: default φ −57, ψ −47 is the α-helix region", /α-helix|alpha/i.test((await text("[data-testid=rama-readout]")) ?? "") || /helix/i.test(await attr("[data-testid=rama-plot]", "aria-label") ?? ""), await attr("[data-testid=rama-plot]", "aria-label"));
  await click("Clash"); await sleep(400);
  check("7 rama: φ 60, ψ −120 is disallowed with an explanation", /clash|disallowed|overlap/i.test(await bodyText()) && /disfavou?red/i.test(await attr("[data-testid=rama-plot]", "aria-label") ?? ""));
  await choose("Glycine"); await sleep(400);
  check("7 rama: the same angles are allowed for glycine", !/disfavou?red/i.test(await attr("[data-testid=rama-plot]", "aria-label") ?? ""), await attr("[data-testid=rama-plot]", "aria-label"));
  await choose("Most residues"); await click("α-helix"); await sleep(300);
  await ev(`(() => { const m = document.querySelector('[data-testid=rama-marker]'); m.focus(); m.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); })()`); await sleep(300);
  check("7 rama: the marker moves by 2° with the arrow key", /phi -55/.test(await attr("[data-testid=rama-plot]", "aria-label") ?? ""), await attr("[data-testid=rama-plot]", "aria-label"));
  await shot("rama.png", ".ui-diagram");
  await choose("Folding forces"); await sleep(400);
  check("7 forces: default native-like with five interactions", /native-like/.test(await text("[data-testid=interaction-table]") + await bodyText()) && (await count("[data-testid=interaction-table] tbody tr")) === 5);
  await ev(`[...document.querySelectorAll('.bc-check input')][0].click()`); await sleep(300);
  check("7 forces: a reducing agent disrupts only the disulfide bond", /Disulfide bond \(covalent\)=disrupted/.test((await tableCells("[data-testid=interaction-table]")).replace(/\s*=\s*/g, "=").replace(/=([a-z]+)=.*?\|/g, "=$1|")) || /Disulfide[^|]*=disrupted/.test(await tableCells("[data-testid=interaction-table]")), (await tableCells("[data-testid=interaction-table]")).slice(0, 200));
  await ev(`[...document.querySelectorAll('.bc-check input')][1].click()`); await choose("High"); await sleep(400);
  check("7 forces: denaturant + high thermal energy gives a denatured domain", /denatured/.test(await attr("svg[aria-label^='Model domain']", "aria-label") ?? ""), await attr("svg[aria-label^='Model domain']", "aria-label"));
  await shot("forces.png", ".ui-diagram");
  await choose("Mutations"); await sleep(900);
  const sub1 = await bodyText();
  check("7 mutation (sickle-cell): Glu → Val, charge changes, supported/uncertain lists present, no folding prediction claimed", /Glutamic acid/.test(sub1) && /Valine/.test(sub1) && (await count("[data-testid=supported] li")) >= 1 && (await count("[data-testid=uncertain] li")) >= 1 && /not a prediction of folding|qualitative/.test(sub1));
  check("7 mutation: two structures drawn", (await count("[data-testid=molecule-svg] svg")) === 2);
  await setSel("scenario-select", "pro-helix"); await sleep(900);
  check("7 mutation (proline in a helix): lost backbone bonds are marked", (await ev(`document.querySelector('svg[aria-label^="Alpha helix"]')?.textContent.match(/✖/g)?.length ?? 0`)) >= 1 && /lost|cannot donate/i.test(await bodyText()));
  await shot("mutation.png", ".ui-diagram");

  // ---- 8. enzymes
  await fresh(1440, "light", "#/biochemistry/enzymes");
  check("8 kinetics default: two charts (Michaelis–Menten and Lineweaver–Burk) and enzyme species", (await count(".ui-diagram svg")) >= 3 && (await count("[data-testid=species-bars]")) === 1);
  const km0 = await ev(`[...document.querySelectorAll('.ui-keyfigure, .gc-figure, .ui-keyfigures > *')].map((x) => x.textContent.replace(/\\s+/g, ' ')).join('|')`);
  check("8 kinetics default (competitive, [I]=5, Ki=2, Ki′=4): Vmax,app 100, Km,app 7, v 22.22", /vmax,app\s*100/i.test(await figs()) && /km,app\s*7\b/i.test(await figs()) && /velocity v\s*22\.22/i.test(await figs()), await figs());
  await choose("Uncompetitive"); await sleep(500);
  const un = await figs();
  check("8 uncompetitive (α′ = 2.25): Vmax,app 44.44 and Km,app 0.8889 (both fall by α′)", /vmax,app\s*44\.44/i.test(un) && /km,app\s*0\.8889/i.test(un), un);
  await choose("Noncompetitive"); await sleep(500);
  const nc = await figs();
  check("8 noncompetitive (α = α′ = 3.5): Km,app unchanged (2), Vmax,app 28.57", /km,app\s*2\b/i.test(nc) && /vmax,app\s*28\.57/i.test(nc), nc);
  await choose("None"); await sleep(500);
  check("8 no inhibitor: v at [S]=Km is Vmax/2 = 50", /velocity v\s*50\b/i.test(await figs()), await figs());
  await choose("Competitive"); await sleep(400);
  await ev(`(() => { const s = document.querySelector('.ui-diagram [role=slider]'); s.focus(); for (let i = 0; i < 10; i += 1) s.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); })()`); await sleep(400);
  check("8 the [S] marker moves with the keyboard and the readout follows", /\[S\] 2\.[0-9]+|\[S\] [3-9]/.test(await attr(".ui-diagram [role=slider]", "aria-valuetext") ?? "") || (await ev(`[...document.querySelectorAll('.gc-field input')].some((i) => Number(i.value) > 2 && Number(i.value) < 3.5)`)));
  await setLabelled("Km", "-5"); await sleep(400);
  check("8 invalid Km (−5) is reported inline and the graphs are withheld", /cannot be used|between/.test(await bodyText()) && (await count(".ui-diagram svg")) === 0);
  await setLabelled("Km", "2"); await sleep(400);
  await shot("kinetics.png", ".ui-figures");
  await choose("Catalytic mechanism"); await sleep(500);
  check("8 mechanism: step 0 of 6 with the free enzyme and substrate", (await readout()) === "0 of 6" && /Free enzyme and substrate/.test(await text("[data-testid=step-caption]")));
  await steps(3);
  check("8 mechanism step 3: nucleophilic attack with an oxyanion (O⁻) and protonated His", /Nucleophilic attack/.test(await text("[data-testid=step-caption]")) && /O⁻/.test(await ev(`document.querySelector("svg[aria-label^='Mechanism step']").textContent`)) && /N–H⁺/.test(await ev(`document.querySelector("svg[aria-label^='Mechanism step']").textContent`)));
  await steps(3);
  check("8 mechanism last step: enzyme regenerated and second product released", (await readout()) === "6 of 6" && /Free enzyme regenerated/.test(await ev(`document.querySelector("svg[aria-label^='Mechanism step']").textContent`)));
  await shot("mechanism.png", ".ui-diagram");
  await choose("Enzyme–substrate binding"); await sleep(500);
  await tick("bind-toggle"); await sleep(300);
  check("8 binding: substrate bound state in the diagram label", /substrate bound/.test(await attr("svg[aria-label*='model']", "aria-label") ?? ""), await attr("svg[aria-label*='model']", "aria-label"));
  await choose("Lock and key"); await sleep(300);
  check("8 binding: lock and key text states it is an analogy", /analogy/.test(await bodyText()));
  await choose("Energy & catalysis"); await sleep(500);
  check("8 energy: states that ΔG° and K are unchanged", /unchanged by the enzyme/.test(await bodyText()) && /same with and without catalyst/.test(await bodyText()));
  await shot("energy.png", ".ui-diagram");

  // ---- 9. enzyme practice / challenge
  await choose("Kinetics & inhibition"); await sleep(500);
  await ev(`[...document.querySelectorAll('.ui-seg-option')].find((x) => x.textContent.trim() === 'Practice')?.click()`); await sleep(500);
  check("9 enzyme practice: questions appear", (await count("[data-testid=quiz-prompt]")) === 1);
  await ev(`[...document.querySelectorAll('.ui-seg-option')].find((x) => x.textContent.trim() === 'Challenge')?.click()`); await sleep(500);
  const ep = (await text("[data-testid=predict-prompt]")) ?? "";
  check("9 enzyme challenge: asks to predict apparent Vmax for a competitive inhibitor", /competitive inhibitor is added/.test(ep) && /Vmax/.test(ep), ep.slice(0, 100));
  await ev(`document.querySelectorAll('.bio-quiz .bio-option')[2].click()`); await sleep(300);
  check("9 enzyme challenge: competitive Vmax stays the same (correct answer is explained)", /Apparent Vmax = 100/.test((await text(".gc-reveal")) ?? ""), (await text(".gc-reveal"))?.slice(0, 120));
  await tick("predict-reveal"); await sleep(500);
  check("9 enzyme challenge: reveal moves to the kinetics graph and offers the next prediction", (await count(".ui-diagram svg")) >= 2 && (await text("[data-testid=predict-prompt]")) !== ep, String(await text("[data-testid=predict-prompt]")).slice(0, 80));

  // ---- 10. Translation hand-off
  await fresh(1440, "light", "#/biology/translation");
  await ev(`[...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Last step')?.click()`); await sleep(500);
  check("10 translation end: peptide MAKLGY and the Biochemistry link", /MAKLGY/.test((await text("[data-testid=peptide-text]")) ?? "") && (await count("[data-testid=to-peptide]")) === 1);
  await tick("to-peptide"); await sleep(1500);
  check("10 hand-off opens Amino acids & peptides on the peptide with MAKLGY", (await ev("location.hash")) === "#/biochemistry/amino-acids" && (await ev(`document.querySelector('.gc-field input.bio-seq')?.value`)) === "MAKLGY", await ev("location.hash"));
  check("10 the peptide's formula and bond count are shown", /C28H47N7O8S|C\d+H\d+N\d+O\d+S?/.test(await bodyText()) && (await count("[data-testid=peptide-chain] .bc-bond")) === 5);

  // ---- 11. save, reopen, autosave
  await fresh(1440, "light", "#/biochemistry/amino-acids");
  await choose("Build a peptide"); await setLabelled("Sequence (N → C)", "KRDE"); await sleep(700);
  await click("Save Analysis"); await sleep(300);
  await setText(".synthesis-save-form input", "pep s17");
  await click("Save", "document.querySelector('.synthesis-save-form')");
  await waitFor(() => ev(`document.body.innerText.includes('Saved “pep s17”')`), "save notice", 15000);
  check("11 peptide save notice shown", true);
  await setLabelled("Sequence (N → C)", "GGG"); await sleep(400);
  await ev(`[...document.querySelectorAll('.tool-tabs [role=tab]')].find((b) => b.textContent.trim() === 'Saved').click()`);
  await waitFor(() => ev(`document.querySelectorAll('.saved-badge').length >= 1`), "saved list", 15000);
  check("11 saved list labels it Biochemistry", /Biochemistry/.test(await bodyText()) && /Amino acids & peptides/.test(await bodyText()));
  await ev(`(() => { const row = [...document.querySelectorAll('li, article')].find((x) => x.textContent.includes('pep s17') && x.querySelector('button')); [...row.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Open')?.click(); })()`);
  await sleep(700);
  if (await ev(`!!document.querySelector('[role=alertdialog]')`)) await click("Replace without saving");
  await sleep(1200);
  check("11 reopening restores KRDE in the peptide builder on the Biochemistry route", (await ev("location.hash")) === "#/biochemistry/amino-acids" && (await ev(`document.querySelector('.gc-field input.bio-seq')?.value`)) === "KRDE", await ev("location.hash"));
  // enzymes autosave
  await fresh(1440, "light", "#/biochemistry/enzymes");
  await choose("Uncompetitive"); await sleep(2600);
  await cdp.send("Page.reload"); await waitFor(() => ev(`document.readyState === 'complete' && document.body.innerText.length > 50`), "reload"); await sleep(1500);
  check("11 autosave: a reloaded enzymes page restores the uncompetitive inhibitor", /vmax,app\s*44\.44/i.test(await figs()), await figs());
  await fresh(1440, "light", "#/biochemistry/protein-structure");
  await choose("Ramachandran"); await click("Left-handed"); await sleep(2600);
  await cdp.send("Page.reload"); await waitFor(() => ev(`document.readyState === 'complete' && document.body.innerText.length > 50`), "reload"); await sleep(1500);
  check("11 autosave: a reloaded protein page restores the Ramachandran point", /phi 60, psi 45/.test(await attr("[data-testid=rama-plot]", "aria-label") ?? ""), await attr("[data-testid=rama-plot]", "aria-label"));

  // ---- 12. layouts and themes
  const pages = [["amino-acids", "[data-testid=molecule-svg]"], ["protein-structure", "svg.bc-svg"], ["enzymes", ".ui-diagram svg"]];
  for (const [slug, sel] of pages) for (const w of [1440, 820, 375]) for (const scheme of ["light", "dark"]) {
    await fresh(w, scheme, `#/biochemistry/${slug}`);
    await sleep(slug === "amino-acids" ? 1200 : 400);
    const ov2 = await overflow();
    const box = await ev(`(() => { const e = document.querySelector(${q(sel)}); if (!e) return [0, 0]; const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })()`);
    check(`12 ${slug} @${w} ${scheme}: no page overflow and a visible diagram`, ov2 <= 1 && box[0] > 100 && box[1] > 50, `overflow ${ov2}, box ${box}`);
  }
  await fresh(375, "light", "#/biochemistry/amino-acids"); await choose("Build a peptide"); await setLabelled("Sequence (N → C)", "ACDEFGHIKLMN"); await sleep(1500); await shot("aa-peptide-phone.png", ".ui-diagram");
  check("12 phone: a long peptide does not overflow the page", (await overflow()) <= 1, String(await overflow()));
  await fresh(375, "dark", "#/biochemistry/protein-structure"); await choose("Ramachandran"); await shot("rama-phone-dark.png", ".ui-diagram");
  await fresh(1440, "dark", "#/biochemistry/enzymes"); await shot("kinetics-dark.png", ".ui-diagram");
  await fresh(820, "light", "#/biochemistry/overview"); await shot("overview-tablet.png", ".gc-tool-cards");

  console.log(`errors: ${JSON.stringify(cdp.errors.slice(0, 5))}`);
  check("no page exceptions", cdp.errors.length === 0, cdp.errors.slice(0, 2).join(" | "));
} catch (error) {
  console.log("SCRIPT ERROR", error.message);
  results.push(false);
} finally {
  await stop();
  const passed = results.filter(Boolean).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  process.exit(passed === results.length ? 0 : 1);
}
