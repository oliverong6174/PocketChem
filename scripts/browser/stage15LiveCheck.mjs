// Stage 15 live-browser check (headless Chrome, production build): Biology navigation, DNA replication, Transcription & RNA
// processing, Translation and DNA -> RNA -> protein, in Explore/Practice/Challenge, saving, reopening and responsive layout.
//   npm run build && node scripts/browser/stage15LiveCheck.mjs      (screenshots: node_modules/.cache/pc-live15)
import path from "node:path";
import { q, root, screenshot, setViewport, sleep, startBrowser, waitFor } from "./lib/chrome.mjs";

const results = [];
const check = (name, ok, detail = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${detail}` : ""}`); };
const outDir = process.env.SHOT_DIR ?? path.join(root, "node_modules", ".cache", "pc-live15");
const { cdp, url, stop } = await startBrowser({ port: 4320, debugPort: 9480 });
const ev = (e) => cdp.evaluate(e);
const click = (label, scope = "document") => ev(`(() => { const b = [...${scope}.querySelectorAll('button')].find((x) => x.innerText.trim() === ${q(label)} && !x.disabled && x.getClientRects().length); if (!b) return false; b.click(); return true; })()`);
const choose = (label) => ev(`(() => { const o = [...document.querySelectorAll('.ui-seg-option')].find((x) => x.textContent.trim() === ${q(label)} && x.getClientRects().length); if (!o) return false; o.querySelector('input').click(); return true; })()`);
const setText = (selector, value) => ev(`(() => { const el = document.querySelector(${q(selector)}); if (!el) return false; const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement : HTMLInputElement; Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, ${q(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
const setLabelled = (startsWith, value) => ev(`(() => { const f = [...document.querySelectorAll('.gc-field label')].find((l) => l.textContent.startsWith(${q(startsWith)})); if (!f) return false; const el = document.getElementById(f.htmlFor); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${q(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
const text = (sel) => ev(`document.querySelector(${q(sel)})?.textContent ?? null`);
const bodyText = () => ev(`document.body.innerText`);
const fresh = async (w, scheme, target) => {
  await setViewport(cdp, w, w < 500 ? 812 : w < 1000 ? 1024 : 900, { scheme });
  await cdp.send("Page.navigate", { url: url + target });
  await waitFor(() => ev(`document.readyState === 'complete' && document.body.innerText.length > 50`), "app");
  await sleep(700);
};
const steps = async (n) => { for (let i = 0; i < n; i += 1) await click("Next ▶"); await sleep(150); };
const readout = async () => (await ev(`document.querySelector('.ph-time-readout')?.textContent ?? ''`)).trim();
const overflow = () => ev(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
const tabs = () => ev(`[...document.querySelectorAll('.tool-tabs [role=tab]')].map((b) => b.textContent.trim()).join('|')`);
const comp = { A: "T", T: "A", C: "G", G: "C" };
const rc = (s) => [...s].reverse().map((b) => comp[b]).join("");

try {
  // ---- navigation
  await fresh(1440, "light", "#/biology/overview");
  check("Biology tabs", (await tabs()) === "Overview|DNA replication|Transcription & RNA processing|Translation|DNA → RNA → protein|Saved", await tabs());
  const ov = await ev(`({ cards: [...document.querySelectorAll('.gc-tool-card button')].map((b) => b.textContent.trim()), pb: document.querySelectorAll('.gc-planned button').length })`);
  check("overview: 4 working tools, planned list has no buttons", ov.cards.length === 4 && ov.pb === 0, ov.cards.join(" | "));
  await click("Open DNA replication"); await sleep(800);
  check("Open button reaches replication; hash", (await ev("location.hash")) === "#/biology/dna-replication");
  await fresh(1440, "light", "#/organic/properties");
  check("Organic tabs unchanged", (await tabs()).startsWith("Properties|Ranking|Spectroscopy|Conformations|Reactions"), await tabs());
  await fresh(1440, "light", "#/physics/overview");
  check("Physics tabs unchanged", (await tabs()) === "Overview|Mechanics & motion|Forces & Newton's laws|Work & energy|Momentum & collisions|DC circuits|RC transient|Saved", await tabs());

  // ---- replication
  await fresh(1440, "light", "#/biology/dna-replication");
  check("replication: initial step 0 of 43, nothing unwound", (await readout()) === "0 of 43" && (await ev(`document.querySelector('[data-testid=replication-diagram]').dataset.unwound`)) === "0", await readout());
  await steps(10);
  check("after 10 steps 10 base pairs open and the diagram agrees", (await ev(`document.querySelector('[data-testid=replication-diagram]').dataset.unwound`)) === "10" && /10 of 32/.test(await ev(`document.querySelector('.ui-figure').textContent`)));
  check("caption names bacterial enzymes only", /DnaB/.test(await text("[data-testid=step-caption]")) && !/CMG|Pol α/.test(await text("[data-testid=step-caption]")));
  await click("⏭"); await sleep(300);
  const lead = await text("[data-testid=final-leading]"), lag = await text("[data-testid=final-lagging]");
  const top = "ATGCGTACCGGATTCAGCTAGCATCGGATACC";
  check("finished daughters are the reverse complements of the right templates (fork right: leading copies the bottom strand)", lead === `5′-${top}-3′` && lag === `5′-${rc(top)}-3′`, `${lead} / ${lag}`);
  await choose("Eukaryote"); await sleep(300);
  await steps(5);
  check("eukaryote switch: CMG helicase, no DnaB", /CMG/.test(await text("[data-testid=step-caption]")) && !/DnaB/.test(await text("[data-testid=step-caption]")));
  await choose("← Left"); await sleep(300);
  check("direction switch resets to step 0", (await readout()).startsWith("0 of"));
  await click("⏭"); await sleep(300);
  const lead2 = await text("[data-testid=final-leading]");
  check("fork left: the leading strand now copies the top strand", lead2 === `5′-${rc(top)}-3′`, lead2);
  await setText("textarea.bio-seq", "ATGU" + "A".repeat(10)); await sleep(300);
  check("invalid template is refused with a message and no diagram", /These values cannot be used/.test(await bodyText()) && !(await ev(`!!document.querySelector('[data-testid=replication-diagram]')`)));
  await click("Mixed 32 bp"); await sleep(300);
  await choose("Practice"); await sleep(300);
  check("practice: labels hidden", /\?/.test(await ev(`document.querySelector('[data-testid=replication-diagram]').textContent`)));
  await click("Reveal labels"); await sleep(200);
  check("practice: Reveal labels shows the names", !/\?/.test(await ev(`document.querySelector('[data-testid=replication-diagram]').textContent`)));
  await ev(`document.querySelector('.bio-quiz .bio-option')?.click()`); await sleep(200);
  check("practice: answering shows an explanation and a score", ((await text("[data-testid=quiz-explanation]")) ?? "").length > 20 && /answered correctly/.test(await text("[data-testid=quiz-score]")));
  await choose("Challenge"); await sleep(300);
  check("challenge: Next is absent and a prediction is asked", !(await ev(`!![...document.querySelectorAll('button')].find((b) => b.innerText.includes('Next ▶'))`)) && /Predict the next step/.test((await text("[data-testid=predict-prompt]")) ?? ""));
  await ev(`document.querySelector('.bio-quiz .bio-option')?.click()`); await sleep(200);
  await ev(`document.querySelector('[data-testid=predict-reveal]')?.click()`); await sleep(300);
  check("challenge: revealing advances exactly one step", /Step 1 of 43/.test(await bodyText()), await ev(`document.querySelector('.ph-note')?.textContent ?? ''`));
  await screenshot(cdp, path.join(outDir, "check-rep-challenge.png"), { fullPage: false });

  // ---- save / reopen
  await choose("Explore"); await steps(7);
  const savedStep = (await readout()).split(" ")[0];
  await click("Save Analysis"); await sleep(300);
  await setText(".synthesis-save-form input", "rep s15");
  await click("Save", "document.querySelector('.synthesis-save-form')");
  await waitFor(() => ev(`document.body.innerText.includes('Saved “rep s15”')`), "save notice", 15000);
  check("save notice shown", true);
  await click("Short 16 bp"); await sleep(200);
  await ev(`[...document.querySelectorAll('.tool-tabs [role=tab]')].find((b) => b.textContent.trim() === 'Saved').click()`);
  await waitFor(() => ev(`document.querySelectorAll('.saved-badge').length >= 1`), "saved list", 15000);
  check("saved list labels it Biology · DNA replication", /Biology · DNA replication/.test(await bodyText()));
  await ev(`(() => { const row = [...document.querySelectorAll('li, article')].find((x) => x.textContent.includes('rep s15') && x.querySelector('button')); [...row.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Open')?.click(); })()`);
  await sleep(1200);
  if (await ev(`!!document.querySelector('[role=alertdialog]')`)) await click("Replace without saving");
  await sleep(900);
  check("reopened: the 32 bp sequence and saved step are restored", (await readout()).startsWith(`${savedStep} of`) && /ATGCGTACCGGATTCAGCTAGCATCGGATACC/.test(await ev(`document.querySelector('textarea.bio-seq')?.value ?? ''`)), await readout());

  // ---- transcription
  await fresh(1440, "light", "#/biology/transcription");
  await steps(1 + 20);
  check("transcription: 20 nt made and the cap is drawn", /20 of 65/.test(await ev(`document.querySelector('.ui-figure').textContent`)) && (await ev(`!!document.querySelector('[data-testid=cap]')`)));
  await click("⏭"); await sleep(400);
  check("transcription end: peptide MAKLGY, tail and lariat drawn", /MAKLGY/.test((await text("[data-testid=mature-peptide]")) ?? "") && (await ev(`!!document.querySelector('[data-testid=polyA]') && !!document.querySelector('[data-testid=lariat]')`)));
  check("strands panel: template is the complement of the coding strand", ((await text("[data-testid=strands]")) ?? "").includes("CCTACCGATTTGACCATTCAGATTGAAAGTCCCAATGACTAATTATTTCGATCGATCCTGGAATG"));
  await choose("Bacterium"); await sleep(300);
  check("bacterium: intron editor gone and the bacterial note shows", !(await bodyText()).includes("Introns (positions") && /bacterial/i.test((await text("[data-testid=organism-note]")) ?? ""));
  await choose("Eukaryote"); await sleep(300);
  await click("Eukaryote: one intron"); await sleep(300);
  await setLabelled("Intron 1 first", "16"); await sleep(300);
  check("moving the intron start to a non-GU site is refused with the splice-site rule", /5′ splice site is GU/.test(await bodyText()));

  // ---- translation
  await fresh(1440, "light", "#/biology/translation");
  await steps(7);
  const sites = await ev(`({ P: document.querySelector('[data-testid=trna-P]')?.dataset.codon, A: document.querySelector('[data-testid=trna-A]')?.dataset.codon, E: document.querySelector('[data-testid=trna-E]')?.dataset.codon })`);
  check("translation after initiation + two cycles: E=GCU, P=AAA, A empty", sites.E === "GCU" && sites.P === "AAA" && sites.A === undefined, JSON.stringify(sites));
  await click("⏭"); await sleep(300);
  check("translation end: release factor drawn and peptide MAKLGY released", (await ev(`!!document.querySelector('[data-testid=release-factor]')`)) && /MAKLGY/.test((await text("[data-testid=peptide-text]")) ?? ""));
  await choose("Bacterium"); await sleep(300);
  check("bacterium title", /Bacterial/.test((await text(".ui-diagram-title")) ?? ""));
  await click("Two AUGs"); await sleep(300);
  check("bacterium with two AUGs: start choice offered", await ev(`!!document.querySelector('#tr-start')`));

  // ---- dogma
  await fresh(1440, "light", "#/biology/dna-rna-protein");
  check("dogma: peptide MAKLGYEPS and codon ladder", (await text("[data-testid=dogma-peptide]")) === "MAKLGYEPS" && (await ev(`!!document.querySelector('[data-testid=codon-ladder]')`)));
  await choose("Substitution"); await sleep(300);
  await setLabelled("Position", "7");
  await ev(`(() => { const s = document.getElementById('mut-base'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, 'A'); s.dispatchEvent(new Event('change', { bubbles: true })); })()`); await sleep(400);
  check("dogma: position 7 C->A (GCT->GAT) is missense, mutant peptide MDKLGYEPS", /Missense/.test(await bodyText()) && ((await text("[data-testid=mutant-peptide]")) ?? "").replace(/\s/g, "").startsWith("MDKLGYEPS"), await text("[data-testid=mutant-peptide]"));
  await choose("Deletion"); await sleep(400);
  check("dogma: a 1-base deletion is a frameshift", /Frameshift/.test(await bodyText()));
  await choose("Challenge"); await sleep(400);
  check("challenge: editor hidden and a prediction asked first", !(await ev(`!!document.querySelector('[data-testid=mutation-editor]')`)) && /Predict the effect/.test((await text("[data-testid=predict-prompt]")) ?? ""));
  await ev(`document.querySelector('.bio-option')?.click()`); await sleep(200);
  await ev(`document.querySelector('[data-testid=apply-mutation]')?.click()`); await sleep(400);
  check("challenge: applying shows the mutant comparison", /Applied mutation/.test(await bodyText()));

  // ---- layout and themes
  for (const [w, scheme] of [[1440, "light"], [1440, "dark"], [820, "light"], [820, "dark"], [375, "light"], [375, "dark"]]) {
    for (const slug of ["dna-replication", "transcription", "translation", "dna-rna-protein"]) {
      await fresh(w, scheme, `#/biology/${slug}`);
      if (slug !== "dna-rna-protein") await steps(8);
      const o = await overflow();
      const paper = await ev(`(() => { const d = document.querySelector('.ui-diagram'); return d ? getComputedStyle(d).backgroundColor : 'none'; })()`);
      check(`${slug} @${w} ${scheme}: no page overflow, diagram on paper`, o <= 1 && (slug === "dna-rna-protein" || /^rgb\(25\d, 25\d, 2[45]\d\)$/.test(paper)), `overflow ${o}, ${paper}`);
      if (w === 375 || slug === "dna-replication") { await ev(`(document.querySelector('.ui-diagram')||document.body).scrollIntoView({block:'start'})`); await screenshot(cdp, path.join(outDir, `check-${slug}-${w}-${scheme}.png`), { fullPage: false }); }
    }
  }
  check("no page exceptions", cdp.errors.length === 0, cdp.errors.slice(0, 2).join(" | "));
} finally { await stop(); }
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
