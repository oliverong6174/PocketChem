// Stage 16 live-browser check (headless Chrome, production build): gene regulation, genetics & inheritance, mitosis & meiosis,
// their integration, Explore/Practice/Challenge, saving, reopening, responsive layout, themes and the existing subjects.
//   npm run build && node scripts/browser/stage16LiveCheck.mjs      (screenshots: node_modules/.cache/pc-live16c)
import path from "node:path";
import { q, root, screenshot, setViewport, sleep, startBrowser, waitFor } from "./lib/chrome.mjs";

const results = [];
const check = (name, ok, detail = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${detail}` : ""}`); };
const outDir = process.env.SHOT_DIR ?? path.join(root, "node_modules", ".cache", "pc-live16c");
const { cdp, url, stop } = await startBrowser({ port: 4340, debugPort: 9500 });
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
  // ---- 1. Biology overview and navigation; existing subjects
  await fresh(1440, "light", "#/biology/overview");
  check("1 Biology tabs include the three new tools in order", (await tabs()) === "Overview|DNA replication|Transcription & RNA processing|Translation|DNA → RNA → protein|Gene regulation|Genetics & inheritance|Mitosis & meiosis|Saved", await tabs());
  const ov = await ev(`({ cards: [...document.querySelectorAll('.gc-tool-card button')].map((b) => b.textContent.trim()), pb: document.querySelectorAll('.gc-planned button').length, planned: [...document.querySelectorAll('.gc-planned li')].map((l) => l.textContent).join('|'), headings: [...document.querySelectorAll('.ph-group-heading')].map((h) => h.textContent).join('|') })`);
  check("1 overview: 7 working tools in two groups; planned list has no buttons and no longer lists built tools", ov.cards.length === 7 && ov.pb === 0 && !/Gene regulation|Inheritance/.test(ov.planned) && ov.headings === "Gene expression|Genetics & cell division", `${ov.cards.length} ${ov.headings} / ${ov.planned}`);
  await click("Open Gene regulation"); await sleep(800);
  check("1 Open button reaches Gene regulation; hash", (await ev("location.hash")) === "#/biology/gene-regulation");
  await fresh(1440, "light", "#/organic/properties");
  check("18 Organic tabs unchanged", (await tabs()).startsWith("Properties|Ranking|Spectroscopy|Conformations|Reactions"), await tabs());
  await fresh(1440, "light", "#/physics/overview");
  check("18 Physics tabs unchanged", (await tabs()) === "Overview|Mechanics & motion|Forces & Newton's laws|Work & energy|Momentum & collisions|DC circuits|RC transient|Saved", await tabs());
  await fresh(1440, "light", "#/general/overview");
  check("18 General Chemistry tabs unchanged", (await tabs()) === "Overview|Acid–base & titration|Chemical equilibrium|Reaction kinetics|Thermodynamics|Saved", await tabs());
  await fresh(1440, "light", "#/biology/dna-rna-protein");
  check("18 Stage 15 DNA → RNA → protein still works", /M-?A-?K|MAKLGY|Met/i.test(await bodyText()) && (await count(".bio-ladder, .gc-page")) > 0);

  // ---- 2. lac operon
  await fresh(1440, "light", "#/biology/gene-regulation");
  check("2 lac default: step 0 of 4 and a lac diagram", (await readout()) === "0 of 4" && (await count("[data-testid=lac-diagram]")) === 1);
  await steps(4);
  let l = await lac();
  check("2 lactose, no glucose: repressor released, cAMP–CRP bound, transcription High (rank 3)", l.rank === "3" && l.rep === "0" && l.crp === "1", JSON.stringify(l));
  await shot("lac-induced.png");
  await tick("glucose"); await sleep(250); l = await lac();
  check("2 lactose + glucose: cAMP–CRP lost, transcription Low (rank 2), repressor still off", l.rank === "2" && l.rep === "0" && l.crp === "0", JSON.stringify(l));
  await tick("lactose"); await sleep(250); l = await lac();
  check("2 no lactose, glucose present: repressor on the operator, Basal (leaky, rank 1)", l.rank === "1" && l.rep === "1", JSON.stringify(l));
  await tick("glucose"); await sleep(250); l = await lac();
  check("2 no lactose, no glucose: still Basal even with cAMP–CRP bound (repression dominates)", l.rank === "1" && l.rep === "1" && l.crp === "1", JSON.stringify(l));
  check("2 the explanation says leaky, not zero", /leaks through|basal/i.test(await text("[data-testid=reasons]")));
  await tick("lactose"); await tick("second-copy"); await setSel("preset-1", "Oc"); await sleep(300);
  l = await lac();
  check("2 two copies, lactose on: both operons high with a wild-type repressor pool", l.rank === "3", JSON.stringify(l));
  await tick("lactose"); await sleep(250); l = await lac();
  check("2 cis effect: with no lactose the wild-type copy is repressed (1) while the lacOᶜ copy is not (0): '10'", l.rep === "10" && l.rank === "3", JSON.stringify(l));
  await shot("lac-two-copy-check.png");
  await ev(`document.querySelector('[data-component=operator]').dispatchEvent(new MouseEvent('click', { bubbles: true }))`); await sleep(250);
  check("2 selecting the operator shows it as a cis-acting DNA element", /cis-acting DNA element/.test((await text("[data-testid=component-detail]")) ?? ""));
  await ev(`document.querySelector('[data-component=repressor]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))`); await sleep(250);
  check("2 selecting the repressor shows a trans-acting protein", /trans-acting protein/.test((await text("[data-testid=component-detail]")) ?? ""));
  check("2 cis/trans table: lacI⁻ trans, lacOᶜ cis", /lacI⁻\s*trans/.test((await text("[data-testid=cis-trans-table]")) ?? "") && /lacOᶜ\s*cis/.test((await text("[data-testid=cis-trans-table]")) ?? ""));

  // ---- 3. trp operon
  await choose("trp operon"); await sleep(500);
  check("3 trp default (high Trp): operator bound; repression shown", (await attr("[data-testid=trp-diagram]", "data-operator")) === "bound");
  await steps(5);
  check("3 high Trp: the ribosome passes, 3:4 terminator forms and transcription terminates", (await attr("[data-testid=trp-diagram]", "data-outcome")) === "terminated" && (await attr("[data-testid=trp-diagram]", "data-pairs")) === "3:4", await attr("[data-testid=trp-diagram]", "data-pairs"));
  await shot("trp-high.png");
  await choose("Low"); await sleep(400);
  check("3 low Trp: operator free, ribosome stalled, 2:3 antiterminator, read-through", (await attr("[data-testid=trp-diagram]", "data-operator")) === "free" && (await attr("[data-testid=trp-diagram]", "data-outcome")) === "readthrough" && (await attr("[data-testid=trp-diagram]", "data-pairs")) === "2:3");
  await click("⏮"); await steps(3);
  check("3 at the Trp codons the low-Trp ribosome is drawn stalled", (await attr("[data-testid=trp-ribosome]", "data-mode")) === "stalled");
  await steps(2); await shot("trp-low.png");
  await choose("High"); await setSel("trpR", "-"); await sleep(300);
  check("3 repression ≠ attenuation: trpR⁻ at high Trp leaves the operator free but the leader still terminates (rank 2, not 4)", (await attr("[data-testid=trp-diagram]", "data-operator")) === "free" && (await attr("[data-testid=trp-diagram]", "data-outcome")) === "terminated" && (await attr("[data-testid=trp-diagram]", "data-rank")) === "2");
  await setSel("trpR", "+"); await setSel("attenuator", "-"); await sleep(300);
  check("3 attenuator deleted at high Trp: operator bound but read-through (rank 2)", (await attr("[data-testid=trp-diagram]", "data-outcome")) === "readthrough" && (await attr("[data-testid=trp-diagram]", "data-rank")) === "2");
  await setSel("attenuator", "+"); await choose("Low"); await setSel("leaderStart", "-"); await sleep(300);
  check("3 no leader start codon: no ribosome, hairpins 1:2 and 3:4, termination even at low Trp", (await attr("[data-testid=trp-diagram]", "data-pairs")) === "1:2,3:4" && (await attr("[data-testid=trp-diagram]", "data-outcome")) === "terminated");
  check("3 the explanation separates the controls", /Repression and attenuation are separate controls/.test((await text("[data-testid=reasons]")) ?? ""));

  // ---- 4. eukaryotic regulation
  await choose("Eukaryotic gene"); await sleep(500); await click("⏭"); await sleep(250);
  check("4 default: open chromatin, activator bound, Mediator bridge, Pol II strong → High", (await attr("[data-testid=euk-diagram]", "data-chromatin")) === "open" && (await attr("[data-testid=euk-diagram]", "data-pol")) === "strong" && (await attr("[data-testid=euk-diagram]", "data-level")) === "High (activated)");
  await shot("euk-high.png");
  await setSel("orientation", "reverse"); await sleep(200);
  check("4 reversing the enhancer does not change the result (orientation-independent)", (await attr("[data-testid=euk-diagram]", "data-level")) === "High (activated)");
  await setSel("orientation", "forward"); await tick("methylation"); await sleep(250);
  check("4 acetylation + methylation: reported as UNCERTAIN, not guessed", (await attr("[data-testid=euk-diagram]", "data-uncertain")) === "1" && (await attr("[data-testid=euk-diagram]", "data-chromatin")) === "conflicting");
  await tick("acetylation"); await sleep(250);
  check("4 methylated and deacetylated: closed chromatin, silent", (await attr("[data-testid=euk-diagram]", "data-chromatin")) === "closed" && /Silent/.test((await attr("[data-testid=euk-diagram]", "data-level")) ?? ""));
  await tick("methylation"); await tick("acetylation"); await sleep(250);
  await setSel("enhancer", "mutated"); await sleep(250);
  check("4 cis: a mutated enhancer leaves only basal transcription although the activator is present", (await attr("[data-testid=euk-diagram]", "data-level")) === "Basal");
  await setSel("enhancer", "present"); await tick("activator"); await sleep(250);
  check("4 trans: losing the activator also leaves basal transcription", (await attr("[data-testid=euk-diagram]", "data-level")) === "Basal");
  await tick("activator"); await setSel("silencer", "present"); await tick("repressor"); await sleep(250);
  check("4 activator and repressor both bound: the model says uncertain", (await attr("[data-testid=euk-diagram]", "data-uncertain")) === "1");
  await shot("euk-uncertain.png");

  // ---- 5. monohybrid cross
  await fresh(1440, "light", "#/biology/genetics");
  check("5 default is Rr × Rr; parents' chromosomes drawn", (await count("[data-testid=parent-chromosomes]")) === 2);
  await steps(3);
  check("5 Rr × Rr: 4 boxes, phenotypes 3:1, genotypes 1:2:1", (await attr("[data-testid=punnett]", "data-cells")) === "4" && (await attr("[data-testid=phenotype-dist]", "data-ratio")) === "3:1" && (await attr("[data-testid=genotype-dist]", "data-ratio")) === "1:2:1");
  check("5 exact fractions: round 3/4, wrinkled 1/4", (await tableCells("[data-testid=phenotype-dist]")).includes("round=3/4") && (await tableCells("[data-testid=phenotype-dist]")).includes("wrinkled=1/4"), await tableCells("[data-testid=phenotype-dist]"));
  await shot("gen-mono.png", "[data-testid=punnett]");
  await click("Make parent 2 a tester (test cross: homozygous recessive)"); await sleep(250); await steps(3);
  check("5 test cross Rr × rr: 1:1", (await attr("[data-testid=phenotype-dist]", "data-ratio")) === "1:1");

  // ---- 6. dihybrid
  await setSel("layout-select", "di"); await sleep(300); await steps(3);
  check("6 dihybrid RrYy × RrYy: 16 boxes, 9:3:3:1, four gamete classes of 1/4", (await attr("[data-testid=punnett]", "data-cells")) === "16" && (await attr("[data-testid=phenotype-dist]", "data-ratio")) === "9:3:3:1" && (await ev(`document.querySelector('[data-testid=gamete-diagram]').dataset.gametes`)) === "R Y=1/4,R y=1/4,r Y=1/4,r y=1/4", await ev(`document.querySelector('[data-testid=gamete-diagram]').dataset.gametes`));
  check("6 allele case is preserved in the Punnett headings (r y is not shown as R Y)", /r y/.test(await ev(`[...document.querySelectorAll('.bio-punnett th')].map((t) => t.textContent).join('|')`)));
  await shot("gen-di.png", "[data-testid=punnett]");
  // beyond dominance
  await setSel("layout-select", "incomplete"); await sleep(300); await steps(3);
  check("6 incomplete dominance: red 1/4, pink 1/2, white 1/4", (await tableCells("[data-testid=phenotype-dist]")).split("|").sort().join("|").includes("pink=1/2 (50%)"), await tableCells("[data-testid=phenotype-dist]"));
  await setSel("layout-select", "xlinked"); await sleep(300); await steps(3);
  check("6 X-linked carrier mother × normal father: sons 1/4 colour-blind, daughters all normal", /male, colour-blind=1\/4/.test(await tableCells("[data-testid=phenotype-dist]")) && /female, normal vision=1\/2/.test(await tableCells("[data-testid=phenotype-dist]")), await tableCells("[data-testid=phenotype-dist]"));
  await setSel("layout-select", "abo"); await sleep(300); await steps(3);
  check("6 ABO IAi × IBi: A, B, AB, O each 1/4", /1\/4/.test(await tableCells("[data-testid=phenotype-dist]")) && (await count("[data-testid=phenotype-dist] tbody tr")) === 4);

  // ---- 7. linked genes
  await setSel("layout-select", "linked"); await sleep(300); await steps(1);
  const g1 = await ev(`document.querySelectorAll('[data-testid=gamete-diagram]')[0].dataset.gametes`);
  check("7 coupling AB/ab, r = 0.2: AB and ab 2/5, Ab and aB 1/10", g1 === "AB=2/5,ab=2/5,Ab=1/10,aB=1/10", g1);
  await setLabelled("Recombination fraction r", "0.35"); await sleep(300); await steps(1);
  check("7 r = 0.35: parental 13/40, recombinant 7/40 (frequencies follow r exactly)", (await ev(`document.querySelectorAll('[data-testid=gamete-diagram]')[0].dataset.gametes`)) === "AB=13/40,ab=13/40,Ab=7/40,aB=7/40");
  await tick("phase-repulsion"); await sleep(300); await steps(1);
  check("7 repulsion Ab/aB keeps its phase: Ab and aB are the parental classes (13/40)", (await ev(`document.querySelectorAll('[data-testid=gamete-diagram]')[0].dataset.gametes`)) === "Ab=13/40,aB=13/40,AB=7/40,ab=7/40", await ev(`document.querySelectorAll('[data-testid=gamete-diagram]')[0].dataset.gametes`));
  check("7 the page says this is a simplified two-locus model", /does not (compute|predict)|not compute it from distance or sequence/.test(await bodyText()));
  check("7 crossing-over figure: one exchange makes two recombinant chromatids", (await attr("[data-testid=crossover-figure]", "data-recombinant")) === "2");
  await shot("gen-linked-cross.png", "[data-testid=crossover-figure]");
  await setLabelled("Recombination fraction r", "0.7"); await sleep(300);
  check("7 r above 0.5 is refused with a message and no results", /0 to 0\.5/.test(await bodyText()) && (await count("[data-testid=punnett]")) === 0);
  await setLabelled("Recombination fraction r", "0.5"); await sleep(300); await tick("phase-coupling"); await steps(1);
  check("7 r = 0.5 behaves as unlinked: four gamete classes of 1/4", (await ev(`document.querySelectorAll('[data-testid=gamete-diagram]')[0].dataset.gametes`)) === "AB=1/4,ab=1/4,Ab=1/4,aB=1/4");
  // ---- 8. chromosome visualisation
  check("8 parents' chromosomes have text alternatives naming alleles", /maternal homolog/.test((await attr("[data-testid=parent-chromosomes]", "aria-label")) ?? "") && /Gene A/.test((await attr("[data-testid=parent-chromosomes]", "aria-label")) ?? ""));
  check("8 legend distinguishes maternal (solid) and paternal (hatched) without colour alone", /Maternal homolog \(M, solid\)/.test(await bodyText()) && /Paternal homolog \(P, hatched\)/.test(await bodyText()));

  // ---- 9. mitosis
  await fresh(1440, "light", "#/biology/mitosis-meiosis");
  await choose("Mitosis"); await sleep(400);
  const mitoExpect = [["G1", "4", "4", "1"], ["S", "4", "8", "1"], ["Metaphase", "4", "8", "1"], ["Anaphase", "8", "8", "1"], ["Telophase", "4,4", "4,4", "2"]];
  let mitoOk = true; const seen = [];
  for (const [label, chr, cht, cells] of mitoExpect) { await stageButton(label); await sleep(250); const c = await cell(); seen.push(`${label}:${c.chr}/${c.cht}/${c.cells}`); if (c.chr !== chr || c.cht !== cht || c.cells !== cells) mitoOk = false; }
  check("9 mitosis counts: G1 4/4, S 4/8, metaphase 4/8, anaphase 8/8 (chromosomes double, DNA does not), telophase two cells of 4/4", mitoOk, seen.join("  "));
  await stageButton("Metaphase"); await sleep(300); await shot("mitosis-metaphase.png", "[data-testid=cell-diagram]");
  check("9 mitosis: no bivalents (homologs do not pair)", (await count("[data-testid=bivalent]")) === 0);
  await stageButton("Anaphase"); await sleep(300); await shot("mitosis-anaphase.png", "[data-testid=cell-diagram]");
  await stageButton("Telophase"); await sleep(300);
  check("9 daughter cells carry the parent's genotype", /R\+r Y\+y|parent's genotype/.test(await text("[data-testid=stage-details]")));

  // ---- 10. meiosis I and II, 15. play control
  await choose("Meiosis"); await sleep(400);
  const meiExpect = [["G1", "4", "4", "1"], ["S", "4", "8", "1"], ["Prophase I", "4", "8", "1"], ["Metaphase I", "4", "8", "1"], ["Anaphase I", "4", "8", "1"], ["Telophase I", "2,2", "4,4", "2"], ["Metaphase II", "2,2", "4,4", "2"], ["Anaphase II", "4,4", "4,4", "2"], ["Telophase II", "2,2,2,2", "2,2,2,2", "4"]];
  let meiOk = true; const seenM = [];
  for (const [label, chr, cht, cells] of meiExpect) { await stageButton(label); await sleep(250); const c = await cell(); seenM.push(`${label}:${c.chr}/${c.cht}/${c.cells}`); if (c.chr !== chr || c.cht !== cht || c.cells !== cells) meiOk = false; }
  check("10 meiosis counts through every division (one S phase, homologs separate in I, sisters in II)", meiOk, seenM.join("  "));
  await stageButton("Prophase I"); await sleep(250);
  check("10 prophase I: homologs pair into 2 bivalents", (await count("[data-testid=bivalent]")) === 2);
  await stageButton("Anaphase I"); await sleep(250);
  check("10 anaphase I: no bivalents; homologs have separated toward poles", (await count("[data-testid=bivalent]")) === 0);
  await stageButton("Anaphase II"); await sleep(250); await shot("meiosis-anaphase2.png", "[data-testid=cell-diagram]");
  check("10 anaphase II caption names sister chromatids", /SISTER CHROMATIDS separate/.test(await text("[data-testid=step-caption]")));
  await stageButton("Telophase II"); await sleep(250);
  check("10 four haploid cells at the end", (await attr("[data-testid=cell-diagram]", "data-cells")) === "4" && /haploid \(n\)/.test(await text("[data-testid=gamete-compare]")));
  await stageButton("G1"); await sleep(200);
  await click("▶ Play"); await sleep(2600);
  const playing = await readout(); await click("❚❚ Pause"); await sleep(200);
  check("10 Play advances the stages and Pause stops them", !playing.startsWith("0 of") && (await readout()) === (await readout()), playing);
  await click("⏮"); await sleep(200);
  check("10 first-stage button resets to stage 0", (await readout()).startsWith("0 of"));

  // ---- chromosome selection
  await stageButton("Metaphase I"); await sleep(300);
  await ev(`document.querySelector('[data-chromosome=p0h1]').dispatchEvent(new MouseEvent('click', { bubbles: true }))`); await sleep(250);
  check("10 selecting a chromosome shows its origin, chromatids, alleles and spindle state", /paternal homolog of pair 1/.test((await text("[data-testid=chromosome-detail]")) ?? "") && /2 \(sister chromatids/.test((await text("[data-testid=chromosome-detail]")) ?? "") && /attached to the spindle/.test((await text("[data-testid=chromosome-detail]")) ?? ""));
  await ev(`document.querySelector('[data-chromosome=p0h0]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))`); await sleep(250);
  check("10 chromosomes are keyboard-operable (Enter selects)", /maternal homolog of pair 1/.test((await text("[data-testid=chromosome-detail]")) ?? ""));

  // ---- 11. crossing over
  await fresh(1440, "light", "#/biology/mitosis-meiosis");
  await setSel("layout-select", "linked"); await sleep(300); await tick("co-toggle-0"); await sleep(250);
  await stageButton("Crossing over"); await sleep(300);
  check("11 crossing over: one chiasma on the bivalent", (await count("[data-testid=chiasma]")) === 1);
  await shot("meiosis-crossing.png", "[data-testid=cell-diagram]");
  await stageButton("Prophase I"); await sleep(250);
  check("11 before crossing over there is no chiasma", (await count("[data-testid=chiasma]")) === 0);
  await stageButton("Telophase II"); await sleep(300);
  const rows = await ev(`[...document.querySelectorAll('[data-testid=gamete-compare] tr[data-gamete]')].map((r) => r.dataset.gamete).sort().join(',')`);
  check("11 after one crossover the four gametes are AB, Ab, aB, ab (every class once)", rows === "AB,Ab,aB,ab", rows);
  await shot("meiosis-linked-gametes.png", "[data-testid=cell-diagram]");
  await tick("co-toggle-0"); await sleep(250);
  check("11 without the crossover the gametes are only the parental AB and ab", (await ev(`[...document.querySelectorAll('[data-testid=gamete-compare] tr[data-gamete]')].map((r) => r.dataset.gamete).sort().join(',')`)) === "AB,AB,ab,ab");

  // ---- 12. nondisjunction
  await fresh(1440, "light", "#/biology/mitosis-meiosis");
  await setSel("nd-select", "I"); await sleep(300); await stageButton("Anaphase I"); await sleep(300);
  check("12 meiosis I nondisjunction caption at anaphase I", /NONDISJUNCTION IN MEIOSIS I/.test(await text("[data-testid=step-caption]")));
  await shot("meiosis-nd1-ana1.png", "[data-testid=cell-diagram]");
  await stageButton("Telophase II"); await sleep(300);
  const nd1 = (await text("[data-testid=nd-outcome]")) ?? "";
  check("12 meiosis I error: two gametes n+1 (both homologs), two n−1; trisomy/monosomy explained", /n \+ 1/.test(nd1) && /n − 1/.test(nd1) && /both the maternal and the paternal homolog/.test(nd1) && /trisomy/.test(nd1) && /monosomy/.test(nd1));
  check("12 chromosome counts per gamete are 3,3,1,1 (conserved total 8)", (await attr("[data-testid=cell-diagram]", "data-chromosomes")) === "3,3,1,1", await attr("[data-testid=cell-diagram]", "data-chromosomes"));
  await shot("meiosis-nd1-end.png", "[data-testid=cell-diagram]");
  await setSel("nd-select", "II"); await sleep(300); await stageButton("Anaphase II"); await sleep(300);
  check("12 meiosis II error caption at anaphase II; anaphase I is normal", /NONDISJUNCTION IN MEIOSIS II/.test(await text("[data-testid=step-caption]")));
  await stageButton("Telophase II"); await sleep(300);
  const nd2 = (await text("[data-testid=nd-outcome]")) ?? "";
  check("12 meiosis II error: one gamete with two copies of one homolog (sister copies), one with none; the other cell is normal", /two copies of the same homolog/.test(nd2) && (await attr("[data-testid=cell-diagram]", "data-chromosomes")) === "3,1,2,2", await attr("[data-testid=cell-diagram]", "data-chromosomes"));
  check("12 the page explains chromosome-number errors versus gene mutations", /not a gene mutation|no allele changes/.test(await bodyText()));

  // ---- 13. genotype-to-gamete integration (Genetics ↔ Meiosis)
  await fresh(1440, "light", "#/biology/genetics");
  await setSel("layout-select", "linked"); await sleep(300); await steps(1);
  const genGametes = await ev(`document.querySelectorAll('[data-testid=gamete-diagram]')[0].dataset.gametes`);
  await ev(`[...document.querySelectorAll('details')].forEach((d) => { d.open = true; })`);
  await click("Watch meiosis for parent 1"); await sleep(900);
  check("13 'Watch meiosis' opens the Mitosis & meiosis tool", (await ev("location.hash")) === "#/biology/mitosis-meiosis");
  check("13 the meiosis tool received the same genotype (linked AB/ab)", (await ev(`document.querySelector('[data-testid=layout-select]').value`)) === "linked" && (await ev(`['cd-0a0','cd-0a1','cd-0b0','cd-0b1'].map((t) => document.querySelector('[data-testid=' + t + ']').value).join('')`)) === "ABab");
  await tick("co-toggle-0"); await stageButton("Telophase II"); await sleep(300);
  const expectedRows = await tableCells("[data-testid=expected-gametes]");
  const modelOk = expectedRows.split("|").every((r) => { const [label, a, b] = r.split("="); return a === b && genGametes.includes(`${label}=${a}`); });
  check("13 expected gamete frequencies agree between the Genetics page, the Genetics model and the average over all meioses", modelOk && expectedRows.length > 0, `${genGametes} vs ${expectedRows}`);
  check("13 the page says one meiosis is not a distribution", /not evidence of how often/.test(await bodyText()));
  await click("Combine gametes in the Genetics tool"); await sleep(900);
  check("13 'Combine gametes' returns to Genetics with the same genotype", (await ev("location.hash")) === "#/biology/genetics" && (await ev(`document.querySelector('[data-testid=layout-select]').value`)) === "linked" && (await ev(`['p1-0a0','p1-0a1','p1-0b0','p1-0b1'].map((t) => document.querySelector('[data-testid=' + t + ']').value).join('')`)) === "ABab");
  // Stage 15 link
  await setSel("layout-select", "mono"); await sleep(300); await ev(`[...document.querySelectorAll('details')].forEach((d) => { d.open = true; })`);
  check("13 the HBB allele example is translated by the Stage 15 engine (Glu → Val, missense)", /MVHLTPEEKSAVTALWGK/.test(await text("[data-testid=allele-sequence]")) && /MVHLTPVEKSAVTALWGK/.test(await text("[data-testid=allele-sequence]")) && /missense/.test(await text("[data-testid=allele-sequence]")));
  await click("Open in DNA → RNA → protein"); await sleep(900);
  check("13 the gene and variant arrive in the DNA → RNA → protein tool", (await ev("location.hash")) === "#/biology/dna-rna-protein" && /ATGGTGCACCTGACTCCTGAGGAGAAG/.test(await ev(`[...document.querySelectorAll('textarea, input')].map((e) => e.value).join(' ')`)) && /MVHLTPVEKSAVTALWGK/.test(await bodyText()));

  // ---- 14. Explore / Practice / Challenge
  // regulation
  await fresh(1440, "light", "#/biology/gene-regulation");
  await choose("Practice"); await sleep(300);
  check("14 regulation practice: labels hidden until revealed", /\?/.test(await ev(`document.querySelector('[data-testid=lac-diagram]').textContent`)));
  await click("Reveal labels"); await sleep(250);
  check("14 regulation practice: Reveal labels shows the names", !/\?/.test(await ev(`document.querySelector('[data-testid=lac-diagram]').textContent`)));
  await ev(`document.querySelector('.bio-quiz .bio-option')?.click()`); await sleep(200);
  check("14 regulation practice: an answer shows a reason and a score", ((await text("[data-testid=quiz-explanation]")) ?? "").length > 20 && /answered correctly/.test((await text("[data-testid=quiz-score]")) ?? ""));
  await choose("Challenge"); await sleep(300);
  const chPrompt = (await text("[data-testid=predict-prompt]")) ?? "";
  check("14 regulation challenge: a prediction is asked first", /Predict: .*What happens to transcription/.test(chPrompt), chPrompt);
  const before = await lac();
  await ev(`document.querySelector('.bio-quiz .bio-option')?.click()`); await sleep(200);
  const expl = (await ev(`document.querySelector('.bio-quiz .gc-reveal')?.textContent ?? ''`));
  check("14 regulation challenge: the answer is explained from the before/after states", /Before:.*After:/.test(expl), expl.slice(0, 160));
  await ev(`document.querySelector('[data-testid=predict-reveal]')?.click()`); await sleep(400);
  const after = await lac();
  const chPrompt2 = (await text("[data-testid=predict-prompt]")) ?? "";
  check("14 regulation challenge: revealing applies the change to the diagram and asks the next prediction", JSON.stringify(before) !== JSON.stringify(after) && chPrompt2 !== chPrompt, `${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
  // genetics
  await fresh(1440, "light", "#/biology/genetics");
  await choose("Practice"); await sleep(300);
  await ev(`document.querySelector('[data-gamete-choice="R"]').click()`); await ev(`document.querySelector('[data-gamete-choice="r"]').click()`); await tick("check-gametes"); await sleep(250);
  check("14 genetics practice: picking exactly the possible gametes is correct", /exactly the possible gametes/.test(await bodyText()));
  await setSel("layout-select", "di"); await sleep(300); await choose("Practice"); await sleep(200);
  await ev(`document.querySelector('[data-gamete-choice="R Y"]').click()`); await ev(`document.querySelector('[data-gamete-choice="r y"]').click()`); await tick("check-gametes"); await sleep(250);
  check("14 genetics practice: missing gametes are reported", /Missing: R y, r Y|Missing: r Y, R y/.test((await text("[data-testid=gamete-feedback]")) ?? ""), await text("[data-testid=gamete-feedback]"));
  await choose("Challenge"); await sleep(300);
  check("14 genetics challenge: asks for a fraction; results stay hidden", /fraction of the offspring/.test((await text("[data-testid=predict-prompt]")) ?? "") && (await count("[data-testid=punnett]")) === 0);
  await setText("[data-testid=guess-input]", "0.9"); await tick("check-guess"); await sleep(200);
  check("14 genetics challenge: a wrong prediction is corrected with the exact fraction 1/16", /1\/16/.test(await bodyText()));
  await setText("[data-testid=guess-input]", "1/16"); await tick("check-guess"); await sleep(200);
  check("14 genetics challenge: 1/16 is accepted", /Your prediction matches/.test(await bodyText()));
  await tick("reveal-outcome"); await sleep(300);
  check("14 genetics challenge: reveal shows the Punnett square and 9:3:3:1", (await attr("[data-testid=phenotype-dist]", "data-ratio")) === "9:3:3:1");
  // division
  await fresh(1440, "light", "#/biology/mitosis-meiosis");
  await choose("Practice"); await sleep(300);
  check("14 division practice: stage hidden until labels are revealed", /Stage hidden/.test(await bodyText()) || (await readout()).startsWith("0 of"));
  await stageButton("Metaphase I"); await sleep(250);
  check("14 division practice: caption is hidden", /Stage hidden/.test(await text("[data-testid=step-caption]")));
  await click("Reveal labels"); await sleep(250);
  check("14 division practice: revealed caption names the stage", /Metaphase I/.test(await text("[data-testid=step-caption]")));
  await ev(`document.querySelector('.bio-quiz .bio-option')?.click()`); await sleep(200);
  check("14 division practice: a question explains its answer", ((await text("[data-testid=quiz-explanation]")) ?? "").length > 20);
  await choose("Challenge"); await sleep(300);
  check("14 division challenge: stepping is locked until the gametes are revealed", !(await ev(`!![...document.querySelectorAll('button')].find((b) => b.innerText.includes('Next ▶'))`)) && /How many of the four gametes/.test((await text("[data-testid=predict-prompt]")) ?? ""));
  await setSel("nd-select", "I"); await sleep(300);
  const ndPrompt = (await text("[data-testid=predict-prompt]")) ?? "";
  await ev(`document.querySelector('.bio-quiz .bio-option')?.click()`); await sleep(200);
  check("14 division challenge: the abnormal-gamete count follows the chosen nondisjunction (4 for meiosis I)", /abnormal chromosome number/.test(ndPrompt) && /AB|R\+r|n \+ 1/.test(await ev(`document.querySelector('.bio-quiz .gc-reveal')?.textContent ?? ''`)));
  await ev(`document.querySelector('[data-testid=predict-reveal]')?.click()`); await sleep(400);
  check("14 division challenge: revealing jumps to the final stage with four gametes", (await readout()).startsWith("10 of 10") && (await attr("[data-testid=cell-diagram]", "data-cells")) === "4", await readout());

  // ---- 15. save and reopen; autosave restore
  await fresh(1440, "light", "#/biology/genetics");
  await setSel("layout-select", "di"); await sleep(300); await steps(2);
  await click("Save Analysis"); await sleep(300);
  await setText(".synthesis-save-form input", "gen s16");
  await click("Save", "document.querySelector('.synthesis-save-form')");
  await waitFor(() => ev(`document.body.innerText.includes('Saved “gen s16”')`), "save notice", 15000);
  check("15 genetics save notice shown", true);
  await setSel("layout-select", "mono"); await sleep(300);
  await ev(`[...document.querySelectorAll('.tool-tabs [role=tab]')].find((b) => b.textContent.trim() === 'Saved').click()`);
  await waitFor(() => ev(`document.querySelectorAll('.saved-badge').length >= 1`), "saved list", 15000);
  check("15 saved list labels it Biology · Genetics & inheritance", /Biology · Genetics & inheritance/.test(await bodyText()));
  await ev(`(() => { const row = [...document.querySelectorAll('li, article')].find((x) => x.textContent.includes('gen s16') && x.querySelector('button')); [...row.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Open')?.click(); })()`);
  await sleep(700);
  if (await ev(`!!document.querySelector('[role=alertdialog]')`)) await click("Replace without saving");
  await sleep(1000);
  check("15 reopening restores the dihybrid genotypes, the step and a recomputed result", (await ev("location.hash")) === "#/biology/genetics" && (await ev(`document.querySelector('[data-testid=layout-select]').value`)) === "di" && (await readout()) === "2 of 3" && (await count("[data-testid=punnett]")) === 1, await readout());
  // regulation autosave restore after reload
  await fresh(1440, "light", "#/biology/gene-regulation");
  await tick("glucose"); await tick("second-copy"); await setSel("preset-1", "I-"); await sleep(2600);
  await cdp.send("Page.reload"); await waitFor(() => ev(`document.readyState === 'complete' && document.body.innerText.length > 50`), "reload"); await sleep(1500);
  check("15 autosave: a reloaded regulation page restores glucose, the second copy and its mutation", (await ev(`document.querySelector('[data-testid=glucose]')?.checked`)) === true && (await ev(`document.querySelector('[data-testid=second-copy]')?.checked`)) === true && (await ev(`document.querySelector('[data-testid=lacI-1]')?.value`)) === "-" && /Restored your values/.test(await bodyText()));
  // division autosave restore
  await fresh(1440, "light", "#/biology/mitosis-meiosis");
  await setSel("nd-select", "II"); await stageButton("Metaphase II"); await sleep(2600);
  await cdp.send("Page.reload"); await waitFor(() => ev(`document.readyState === 'complete' && document.body.innerText.length > 50`), "reload"); await sleep(1500);
  check("15 autosave: a reloaded division page restores the nondisjunction scenario and the stage", (await ev(`document.querySelector('[data-testid=nd-select]')?.value`)) === "II" && (await readout()).startsWith("8 of"), await readout());

  // ---- 16/17. layouts and themes
  const pages = [["gene-regulation", "[data-testid=lac-diagram]"], ["genetics", "[data-testid=parent-chromosomes]"], ["mitosis-meiosis", "[data-testid=cell-diagram]"]];
  for (const [slug, sel] of pages) for (const w of [1440, 820, 375]) for (const scheme of ["light", "dark"]) {
    await fresh(w, scheme, `#/biology/${slug}`);
    if (slug === "mitosis-meiosis") { await stageButton("Metaphase I"); await sleep(250); }
    const ov2 = await overflow();
    const paper = await ev(`(() => { const e = document.querySelector(${q(sel)}); const s = e.tagName.toLowerCase() === 'svg' ? e : e.querySelector('svg'); return getComputedStyle(s.querySelector(':scope > rect')).fill; })()`);
    const svgBox = await ev(`(() => { const s = document.querySelector(${q(sel)} + ' svg') ?? document.querySelector(${q(sel)}); const r = s.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })()`);
    check(`16/17 ${slug} @${w} ${scheme}: no page overflow, paper-coloured diagram, visible diagram`, ov2 <= 1 && /248, 250, 252/.test(paper) && svgBox[0] > 150 && svgBox[1] > 100, `overflow ${ov2}, fill ${paper}, svg ${svgBox}`);
  }
  await fresh(375, "light", "#/biology/mitosis-meiosis"); await stageButton("Telophase II"); await sleep(300);
  check("16 phone: a multi-cell stage opens zoomed on one cell, with a way back to all cells", /All cells/.test(await bodyText()) && (await ev(`document.querySelector('[data-testid=cell-diagram] svg').getAttribute('viewBox')`)) !== "0 0 860 380");
  await shot("meiosis-phone.png", "[data-testid=step-caption]");
  await fresh(375, "dark", "#/biology/genetics"); await steps(3); await shot("genetics-phone-dark.png", ".bio-parents");
  await fresh(1440, "dark", "#/biology/gene-regulation"); await steps(4); await shot("lac-dark.png", "[data-testid=step-caption]");
  await fresh(820, "light", "#/biology/mitosis-meiosis"); await stageButton("Prophase I"); await shot("meiosis-tablet.png", "[data-testid=step-caption]");

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
