/**
 * Practice questions, predict-then-reveal challenges and integrated-map scenarios for the metabolic-pathway tools. Every answer is computed
 * from the shared network, ledger, regulation table and respiratory-chain model that also draw the diagrams, so text and diagrams cannot disagree.
 */
import type { Question } from "../../biology/bioLearning";
import {
  ENZYMES_BY_ID, METABOLITES_BY_ID, PATHWAYS, REACTIONS_BY_ID, TENDENCY_DEFINITIONS, pathwayReactions, type PathwayId, type Tendency,
} from "./network";
import { OXPHOS_ASSUMPTIONS, carriersOf, glucoseLedger, glycolysisAtpBreakdown, pathwayNet, atpPerFadh2, atpPerNadh, type Shuttle } from "./ledger";
import { REG_SCENARIOS, REG_SCENARIOS_BY_ID, comparePathways, enzymeTendency, signalsFor, substrateCycleCost, VERDICT_TEXT, type Signals, type Verdict } from "./regulation";
import { CONDITIONS, CONDITIONS_BY_ID, COMPLEXES, DONORS, etcOutcome, protonsPerPair, type Donor } from "./etc";

const hash = (s: string) => { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
/** Builds a question with the correct option placed deterministically (by id) among the distractors, so answers are not always first. */
export function mc(id: string, prompt: string, correct: string, distractors: string[], explanation: string): Question {
  const uniq = [correct, ...distractors.filter((d, i, a) => d !== correct && a.indexOf(d) === i)];
  const shift = hash(id) % uniq.length;
  const options = uniq.map((_, i) => uniq[(i + uniq.length - shift) % uniq.length]);
  return { id, prompt, options, answer: options.indexOf(correct), explanation };
}
export interface Challenge<Patch> { question: Question; /** state applied to the diagram only after the learner has committed to an answer */ reveal: Patch }

const enzName = (reactionId: string) => ENZYMES_BY_ID[REACTIONS_BY_ID[reactionId].enzyme].short;
const metName = (id: string) => METABOLITES_BY_ID[id].name;
const tendencyWord: Record<Tendency, string> = { higher: "Higher", lower: "Lower", reference: "No change (reference)", uncertain: "Uncertain (signals conflict)" };

// ---- glycolysis -------------------------------------------------------------------------------------------------------------------

export function glycolysisQuestions(step: number): Question[] {
  const steps = pathwayReactions("glycolysis");
  const b = glycolysisAtpBreakdown();
  const spend = steps.filter((x) => (x.reaction.substrates.some((s) => s.met === "atp"))).map((x) => enzName(x.reaction.id));
  const make = steps.filter((x) => x.reaction.products.some((s) => s.met === "atp")).map((x) => enzName(x.reaction.id));
  const irrev = steps.filter((x) => x.reaction.reversibility === "irreversible").map((x) => enzName(x.reaction.id));
  const nadh = steps.find((x) => x.reaction.products.some((p) => p.met === "nadh"))!;
  const out: Question[] = [];
  out.push(mc("gly-spend", "Which two glycolytic enzymes consume ATP?", spend.join(" and "), [make.join(" and "), `${enzName("GAPDH")} and ${enzName("ENO")}`, `${enzName("ALDO")} and ${enzName("TPI")}`],
    `${spend.join(" and ")} each transfer a phosphoryl group from ATP: this is the investment phase (−${b.invested} ATP). ${make.join(" and ")} make ATP in the payoff phase.`));
  out.push(mc("gly-net", "One glucose passes through glycolysis. How many ATP are made in total (gross), and how many are left over (net)?", `${b.produced} made, ${b.net} net`, ["2 made, 2 net", "4 made, 4 net", `${b.produced} made, 0 net`],
    `Each of the two triose phosphates yields 2 ATP (phosphoglycerate kinase and pyruvate kinase), so ${b.produced} ATP are made; ${b.invested} were invested by hexokinase and PFK-1, leaving ${b.net}.`));
  out.push(mc("gly-nadh", "Which glycolytic enzyme reduces NAD⁺ to NADH?", enzName(nadh.reaction.id), [enzName("PGK"), enzName("PK"), enzName("ENO")],
    `${enzName(nadh.reaction.id)} oxidizes the aldehyde of glyceraldehyde 3-phosphate; because this happens for both trioses, one glucose gives ${carriersOf(pathwayNet("glycolysis")).nadh} NADH.`));
  out.push(mc("gly-irrev", "Which set lists the effectively irreversible glycolytic steps?", irrev.join(", "), [`${enzName("PGI")}, ${enzName("ALDO")}, ${enzName("GAPDH")}`, `${enzName("TPI")}, ${enzName("PGM")}, ${enzName("ENO")}`, `${enzName("HK")}, ${enzName("PGK")}, ${enzName("PK")}`],
    `${irrev.join(", ")} have large negative free-energy changes under cellular conditions; they are the steps that gluconeogenesis must bypass and where glycolysis is mainly regulated.`));
  out.push(mc("gly-two", "Why do the reactions after aldolase happen twice per glucose?", "Aldolase and triose phosphate isomerase give two glyceraldehyde 3-phosphate molecules from one fructose 1,6-bisphosphate", ["Each uses two enzyme molecules", "Glycolysis is run twice in the cell cycle", "NAD⁺ is split in two"],
    "The C6 bisphosphate is cleaved to DHAP + glyceraldehyde 3-phosphate, and TPI converts DHAP to a second glyceraldehyde 3-phosphate. Steps 6 to 10 therefore run once for each triose."));
  const pfk = enzymeTendency("pfk1", { ...signalsFor("reference"), f26bp: "high" });
  out.push(mc("gly-f26", "What does a high level of fructose 2,6-bisphosphate do to PFK-1 in this teaching model?", tendencyWord[pfk.tendency], ["Lower", "No change (reference)", "Uncertain (signals conflict)"].filter((x) => x !== tendencyWord[pfk.tendency]).slice(0, 3),
    `${pfk.contributions.find((c) => c.effect.signal === "f26bp")!.effect.note} ${TENDENCY_DEFINITIONS[pfk.tendency]}`));
  if (step >= 1 && step <= 10) {
    const cur = steps[step - 1];
    const others = steps.filter((x) => x !== cur).map((x) => enzName(x.reaction.id));
    out.push(mc(`gly-enz-${step}`, `Which enzyme catalyzes this change? ${cur.reaction.transformation}`, enzName(cur.reaction.id), [others[(step + 1) % others.length], others[(step + 3) % others.length], others[(step + 5) % others.length]],
      `${enzName(cur.reaction.id)}: ${cur.reaction.purpose}`));
  }
  return out;
}
export function glycolysisChallenges(): Array<Challenge<{ signals: Partial<Signals>; view: "regulation" }>> {
  const mk = (id: string, prompt: string, signals: Partial<Signals>, enzyme: string): Challenge<{ signals: Partial<Signals>; view: "regulation" }> => {
    const t = enzymeTendency(enzyme, { ...signalsFor("reference"), ...signals });
    const opts = ["Higher", "Lower", "No change (reference)", "Uncertain (signals conflict)"];
    const correct = tendencyWord[t.tendency];
    return { question: { id, prompt, options: opts, answer: opts.indexOf(correct), explanation: `${t.contributions.filter((c) => c.direction !== 0).map((c) => c.effect.note).join(" ") || "No signal departs from normal."} ${TENDENCY_DEFINITIONS[t.tendency]}` }, reveal: { signals: { ...signals }, view: "regulation" } };
  };
  return [
    mk("gly-ch-atp", "ATP is high and everything else is normal. What happens to PFK-1's net activity (relative to the reference state)?", { atp: "high" }, "pfk1"),
    mk("gly-ch-amp", "AMP is high and everything else is normal. What happens to PFK-1's net activity?", { amp: "high" }, "pfk1"),
    mk("gly-ch-conflict", "ATP is high and fructose 2,6-bisphosphate is high. What can this model say about PFK-1?", { atp: "high", f26bp: "high" }, "pfk1"),
    mk("gly-ch-pk", "ATP is high. What happens to pyruvate kinase's net activity?", { atp: "high" }, "pk"),
    mk("gly-ch-hk", "Glucose 6-phosphate is high. What happens to hexokinase's net activity?", { g6p: "high" }, "hk"),
  ];
}

// ---- gluconeogenesis ---------------------------------------------------------------------------------------------------------------

export function gluconeogenesisQuestions(): Question[] {
  const net = carriersOf(pathwayNet("gluconeogenesis"));
  const cost = (c: Parameters<typeof substrateCycleCost>[0]) => substrateCycleCost(c).ntpHydrolysed;
  return [
    mc("gng-pfk", "Which enzyme bypasses the PFK-1 reaction in gluconeogenesis?", enzName("FBP1"), [enzName("PEPCK"), enzName("PC"), enzName("G6PASE")], "FBPase-1 hydrolyses the C1 phosphate of fructose 1,6-bisphosphate to Pi. It is a different reaction (hydrolysis), not PFK-1 run backward, so it can be regulated separately."),
    mc("gng-pk", "Which two enzymes together bypass pyruvate kinase?", `${enzName("PC")} and ${enzName("PEPCK")}`, [`${enzName("FBP1")} and ${enzName("G6PASE")}`, `${enzName("ENO")} and ${enzName("PGK")}`, `${enzName("PDH")} and ${enzName("CS")}`], "Pyruvate carboxylase (matrix, ATP, biotin) makes oxaloacetate; PEPCK (GTP) decarboxylates and phosphorylates it to PEP."),
    mc("gng-hk", "Which enzyme bypasses hexokinase to release free glucose?", enzName("G6PASE"), [enzName("HK"), enzName("PGI"), enzName("FBP1")], "Glucose-6-phosphatase hydrolyses G6P to glucose and Pi. It sits in the endoplasmic-reticulum membrane (lumenal active site) in liver, kidney cortex and intestine, so muscle cannot release glucose."),
    mc("gng-cost", "How many nucleoside triphosphates are consumed converting 2 pyruvate into 1 glucose?", `${-net.ntpEquivalents} (4 ATP + 2 GTP)`, ["2 (2 ATP)", "4 (4 ATP)", "8 (8 ATP)"], `Pyruvate carboxylase (2 ATP), PEPCK (2 GTP) and phosphoglycerate kinase running backward (2 ATP) give ${-net.atp} ATP + ${-net.gtp} GTP. Two NADH are also consumed (glyceraldehyde-3-phosphate dehydrogenase reversed).`),
    mc("gng-shared", "How many glycolytic reactions are shared with gluconeogenesis (run in reverse)?", "7", ["3", "10", "0"], "Seven reversible steps are shared: PGI, aldolase, TPI, GAPDH, PGK, PGM and enolase. The three irreversible steps are bypassed by four enzymes (PC, PEPCK, FBPase-1, G6Pase)."),
    mc("gng-cycle", "If glycolytic PFK-1 and gluconeogenic FBPase-1 ran at full rate together, what would be the net effect?", `One ATP hydrolysed per cycle (${cost("f6p-f16bp")} NTP), released as heat`, ["One ATP made per cycle", "Net glucose synthesis", "No net chemical change and no cost"], "PFK-1 (F6P + ATP → F1,6BP + ADP) and FBPase-1 (F1,6BP + H₂O → F6P + Pi) sum to ATP + H₂O → ADP + Pi. Reciprocal regulation keeps both from being fully active at once."),
    mc("gng-notback", "Why is gluconeogenesis not simply glycolysis run backward?", "Three glycolytic steps are so favourable that different enzymes are needed to climb back", ["Glycolysis enzymes cannot bind glucose", "Gluconeogenesis happens only in mitochondria", "Gluconeogenesis makes ATP"], "Hexokinase, PFK-1 and pyruvate kinase are effectively irreversible. Bypasses use hydrolysis or carboxylation chemistry coupled to ATP/GTP, giving a different energetics and independent regulation."),
    mc("gng-acoa", "Acetyl-CoA is high. What does this model predict for pyruvate carboxylase?", tendencyWord[enzymeTendency("pc", { ...signalsFor("reference"), acetylcoa: "high" }).tendency], ["Lower", "No change (reference)", "Uncertain (signals conflict)"], "Acetyl-CoA is an allosteric activator of pyruvate carboxylase."),
  ];
}
export function gluconeogenesisChallenges(): Array<Challenge<{ scenario: string; view: "regulation" }>> {
  const verdictLabel: Record<Verdict, string> = { "favours-glycolysis": "Glycolytic control points up, gluconeogenic down", "favours-gluconeogenesis": "Gluconeogenic control points up, glycolytic down", reference: "No change", "mixed-or-uncertain": "Mixed or uncertain" };
  return ["fed", "fasting", "low-energy", "energy-rich", "acetylcoa-rich"].map((id) => {
    const sc = REG_SCENARIOS_BY_ID[id];
    const v = comparePathways(signalsFor(id)).verdict;
    const options = Object.values(verdictLabel);
    return { question: { id: `gng-ch-${id}`, prompt: `Scenario: ${sc.title}. ${sc.text.split(".")[0]}. What does the curated model say about glycolytic versus gluconeogenic control points?`, options, answer: options.indexOf(verdictLabel[v]), explanation: `${VERDICT_TEXT[v]} ${sc.caveat}` }, reveal: { scenario: id, view: "regulation" as const } };
  });
}

// ---- pyruvate oxidation and citric acid cycle ---------------------------------------------------------------------------------------

export function tcaQuestions(): Question[] {
  const t = carriersOf(pathwayNet("tca", "event")), p = carriersOf(pathwayNet("pyruvate-oxidation", "event"));
  const cycle = pathwayReactions("tca");
  const dh = cycle.filter((x) => x.reaction.products.some((p2) => p2.met === "nadh")).map((x) => enzName(x.reaction.id));
  return [
    mc("tca-nadh", "How many NADH does one turn of the citric acid cycle make (not counting pyruvate dehydrogenase)?", String(t.nadh), ["1", "2", "4"], `Isocitrate dehydrogenase, α-ketoglutarate dehydrogenase and malate dehydrogenase each make one NADH (${dh.join(", ")}).`),
    mc("tca-fadh", "Which cycle enzyme produces FADH₂, and what else is it?", `${enzName("SDH")}, which is also complex II of the respiratory chain`, [`${enzName("IDH")}, which is complex I`, `${enzName("FUM")}, which is complex III`, `${enzName("CS")}, which is ATP synthase`], "Succinate dehydrogenase is bound to the inner membrane and passes electrons from FADH₂ to coenzyme Q. It is the only cycle enzyme in the membrane."),
    mc("tca-gtp", "Which cycle step makes GTP (or ATP) by substrate-level phosphorylation?", enzName("SCS"), [enzName("IDH"), enzName("FUM"), enzName("MDH-M")], "Succinyl-CoA synthetase uses the energy of the succinyl-CoA thioester bond to phosphorylate GDP (or ADP)."),
    mc("tca-co2", "How many CO₂ are released per turn of the cycle?", String(t.co2), ["1", "3", "0"], "Isocitrate dehydrogenase and α-ketoglutarate dehydrogenase each release one CO₂ (C6 → C5 → C4)."),
    mc("tca-carbons", "Two carbons enter the cycle as acetyl-CoA and two leave as CO₂ in the same turn. Are they the same two carbons?", "No: the CO₂ released in a turn comes from the oxaloacetate-derived carbons; acetyl-derived carbons leave in later turns", ["Yes, the acetyl carbons are released first", "Yes, as the first CO₂ and the last CO₂", "Carbons are never released, only electrons"], "Carbon COUNT is conserved (2 in, 2 out), but atom identity is not: the acetyl-derived carbons are still in the cycle after the first turn (and, because succinate is symmetric, they are scrambled)."),
    mc("tca-oaa", "What happens to oxaloacetate over one complete turn?", "It is regenerated, so the cycle can continue", ["It is consumed and lost as CO₂", "It is converted to pyruvate", "It is exported and not replaced"], "Malate dehydrogenase makes oxaloacetate again; the net change in cycle intermediates is zero while acetyl-CoA is oxidized."),
    mc("tca-pdh", "How does the pyruvate dehydrogenase reaction differ in its output from one cycle turn?", `${p.nadh} NADH and ${p.co2} CO₂ per pyruvate, and it makes acetyl-CoA (it is not part of the cycle)`, ["It makes 3 NADH and 1 FADH₂", "It makes GTP", "It consumes oxaloacetate"], "Pyruvate oxidation is the link between glycolysis and the cycle. Counted separately: per glucose it adds 2 NADH and 2 CO₂ to the 6 NADH, 2 FADH₂, 2 GTP and 4 CO₂ of the two cycle turns."),
    mc("tca-glucose", "How many NADH come from the matrix per glucose (pyruvate oxidation + two turns)?", String(glucoseLedger("malate-aspartate").matrixNadh), ["6", "10", "12"], "2 from pyruvate dehydrogenase + 2 × 3 from the cycle = 8. The 2 NADH from glycolysis are cytosolic and are counted separately."),
  ];
}
export function tcaPredictions(): Question[] {
  const cycle = pathwayReactions("tca");
  return cycle.slice(0, -1).map((x, i) => {
    const next = cycle[i + 1];
    return mc(`tca-next-${i}`, `The cycle has just completed ${enzName(x.reaction.id)} (step ${i + 1}). Which enzyme acts next?`, enzName(next.reaction.id), cycle.filter((y) => y !== next && y !== x).slice(0, 3).map((y) => enzName(y.reaction.id)), `${enzName(next.reaction.id)}: ${next.reaction.purpose}`);
  });
}

// ---- respiratory chain ---------------------------------------------------------------------------------------------------------------

export function etcQuestions(): Question[] {
  const nad = etcOutcome(["nadh"], "cyanide"), unc = etcOutcome(["nadh"], "uncoupler");
  return [
    mc("etc-h-nadh", "How many protons are pumped per electron pair from NADH (teaching approximation)?", String(protonsPerPair("nadh")), ["4", "6", "12"], `Complexes I (${COMPLEXES.CI.protonsPerPair}), III (${COMPLEXES.CIII.protonsPerPair}) and IV (${COMPLEXES.CIV.protonsPerPair}) pump; the total is ${protonsPerPair("nadh")}.`),
    mc("etc-h-fadh", "How many protons are pumped per electron pair entering at complex II (teaching approximation)?", String(protonsPerPair("succinate")), ["10", "4", "0"], "Complex II does not pump protons; only complexes III (4) and IV (2) do. That is why FADH₂ yields less ATP than NADH."),
    mc("etc-cii", "Does complex II pump protons?", "No", ["Yes, 4", "Yes, 2", "Only in the presence of oxygen"], "Complex II (succinate dehydrogenase) passes electrons to coenzyme Q but the energy released is too small to drive proton translocation."),
    mc("etc-o2", "What is the terminal electron acceptor and what is formed?", "O₂, reduced to H₂O at complex IV", ["NAD⁺, reduced to NADH", "Cytochrome c, reduced to water", "CO₂, reduced to carbon"], "Complex IV transfers electrons from cytochrome c to O₂ with protons: ½ O₂ + 2 H⁺ + 2 e⁻ → H₂O per electron pair."),
    mc("etc-atp", "Using the stated assumptions, how many ATP does one NADH correspond to?", `About ${atpPerNadh()} (an estimate: ${OXPHOS_ASSUMPTIONS.protonsPerNadh} H⁺ ÷ ${OXPHOS_ASSUMPTIONS.protonsPerAtp} H⁺ per ATP)`, ["Exactly 3", `About ${atpPerFadh2()}`, "Exactly 1"], `The ratio is an illustrative P/O value; FADH₂ gives about ${atpPerFadh2()}. Experimental values depend on the proton stoichiometry and on proton leak.`),
    mc("etc-cn", "Cyanide blocks complex IV. What happens to O₂ consumption?", `It ${nad.oxygenUse}`, ["It rises", "It is unchanged", "It rises, then falls"], nad.explanation.join(" ")),
    mc("etc-unc", "An uncoupler is added to coupled mitochondria. What happens to O₂ consumption and to ATP synthesis?", `O₂ consumption ${unc.oxygenUse}; ATP synthesis ${unc.atpSynthesis}`, ["Both fall", "Both rise", "O₂ consumption falls; ATP synthesis rises"], unc.explanation.join(" ")),
    mc("etc-rot", "Rotenone blocks complex I. With succinate as the only substrate, does electron transport continue?", `Yes: ${etcOutcome(["succinate"], "rotenone").electronFlow}`, ["No: everything stops", "Only if NADH is added", "Only in the presence of an uncoupler"], "Succinate donates at complex II, downstream of the rotenone block, so that route (about 6 H⁺ per pair) keeps running."),
  ];
}
export function etcChallenges(): Array<Challenge<{ condition: string; donor: "nadh" | "succinate" | "both"; view: "inhibitors" }>> {
  const sets: Array<[string, "nadh" | "succinate" | "both", string]> = [
    ["rotenone", "nadh", "Only NADH is supplied and complex I is inhibited with rotenone. What happens to electron transport and ATP synthesis?"],
    ["rotenone", "both", "NADH and succinate are both supplied and complex I is inhibited with rotenone. What happens?"],
    ["cyanide", "both", "Cyanide inhibits complex IV. What happens to O₂ consumption and the proton gradient?"],
    ["uncoupler", "nadh", "An uncoupler is added. What happens to O₂ consumption, the proton gradient and ATP synthesis?"],
    ["oligomycin", "nadh", "Oligomycin blocks ATP synthase. What happens to the proton gradient and to electron transport?"],
  ];
  return sets.map(([condition, donorChoice, prompt]) => {
    const donors: Donor[] = donorChoice === "both" ? ["nadh", "succinate"] : [donorChoice];
    const o = etcOutcome(donors, condition);
    const label = (x: ReturnType<typeof etcOutcome>) => `Electron flow ${x.electronFlow}, gradient ${x.gradient}, ATP synthesis ${x.atpSynthesis}`;
    const all = CONDITIONS.filter((c) => c.id !== "malonate" && c.id !== "hypoxia").flatMap((c) => [etcOutcome(donors, c.id)]);
    const options = [...new Set([label(o), ...all.map(label)])].slice(0, 4);
    if (!options.includes(label(o))) options[0] = label(o);
    return { question: { id: `etc-ch-${condition}-${donorChoice}`, prompt, options, answer: options.indexOf(label(o)), explanation: o.explanation.join(" ") }, reveal: { condition, donor: donorChoice, view: "inhibitors" as const } };
  });
}
export { CONDITIONS_BY_ID, DONORS };

// ---- integrated map -----------------------------------------------------------------------------------------------------------------

export type Basis = "stoichiometry" | "curated-regulation" | "respiratory-model" | "not-modelled";
export const BASIS_LABEL: Record<Basis, string> = {
  stoichiometry: "Follows from stoichiometry",
  "curated-regulation": "Follows from curated regulation (direction only)",
  "respiratory-model": "Follows from the respiratory-chain teaching model (direction only)",
  "not-modelled": "Would need a quantitative cellular kinetic model: not implemented",
};
export interface MapScenario { id: string; title: string; summary: string }
export const MAP_SCENARIOS: MapScenario[] = [
  { id: "baseline", title: "Baseline: glucose fully oxidized", summary: "No perturbation: the stoichiometric route from glucose to CO₂." },
  { id: "high-demand", title: "High ATP demand (low energy charge)", summary: "ATP low, AMP and ADP high." },
  { id: "low-demand", title: "Low ATP demand (energy-rich)", summary: "ATP and NADH high, AMP and ADP low." },
  { id: "pfk-down", title: "PFK-1 activity lower", summary: "A qualitative reduction at the main glycolytic control point." },
  { id: "pfk-up", title: "PFK-1 activity higher", summary: "A qualitative increase, as with high fructose 2,6-bisphosphate." },
  { id: "fed", title: "Fed-associated liver", summary: "High fructose 2,6-bisphosphate." },
  { id: "fasting", title: "Fasting-associated liver", summary: "Low fructose 2,6-bisphosphate, high acetyl-CoA." },
  { id: "hypoxia", title: "Reduced oxygen availability", summary: "Complex IV is oxygen-limited." },
  { id: "inhibition", title: "Respiratory-chain inhibition (cyanide)", summary: "Complex IV blocked." },
  { id: "uncoupling", title: "Uncoupling", summary: "Protons leak across the inner membrane." },
];
export interface Statement { text: string; basis: Basis }
const regLine = (scenario: string, ids: string[]): Statement[] => {
  const sig = signalsFor(scenario);
  return ids.map((id) => ({ text: `${ENZYMES_BY_ID[id].short}: ${tendencyWord[enzymeTendency(id, sig).tendency].toLowerCase()} net activity than the reference state.`, basis: "curated-regulation" as const }));
};
const KINETICS: Statement = { text: "How much any rate, flux or metabolite concentration changes.", basis: "not-modelled" };
export function mapScenarioOutcome(id: string, shuttle: Shuttle): Statement[] {
  const g = glucoseLedger(shuttle);
  const base: Statement[] = [
    { text: `Per glucose, glycolysis makes 2 net ATP and 2 NADH whenever it runs to pyruvate (${glycolysisAtpBreakdown().produced} made, ${glycolysisAtpBreakdown().invested} invested).`, basis: "stoichiometry" },
  ];
  switch (id) {
    case "baseline": return [
      ...base,
      { text: `Complete oxidation of one glucose releases ${g.co2} CO₂ and reduces ${g.cytosolicNadh + g.matrixNadh} NADH and ${g.fadh2} FADH₂; substrate-level phosphorylation gives ${g.substrateLevel.glycolysis + g.substrateLevel.cycle} ATP/GTP.`, basis: "stoichiometry" },
      { text: `Estimated total: about ${g.totalAtp} ATP with the ${SHUTTLE_SHORT[shuttle]} (an estimate that depends on the shuttle, proton stoichiometry and proton leak, not a fixed value).`, basis: "respiratory-model" },
    ];
    case "high-demand": return [...regLine("low-energy", ["pfk1", "pk", "fbpase1", "idh", "pdh"]), ...base, KINETICS];
    case "low-demand": return [...regLine("energy-rich", ["pfk1", "pk", "fbpase1", "idh", "pdh"]), ...base, KINETICS];
    case "pfk-down": return [{ text: "PFK-1 net activity lower (for example under high ATP).", basis: "curated-regulation" }, { text: "If glycolysis proceeds, its net yield per glucose is still 2 ATP: the stoichiometry does not depend on rate.", basis: "stoichiometry" }, KINETICS];
    case "pfk-up": return [...regLine("fed", ["pfk1", "fbpase1"]), { text: "If glycolysis proceeds, its net yield per glucose is still 2 ATP.", basis: "stoichiometry" }, KINETICS];
    case "fed": case "fasting": {
      const v = comparePathways(signalsFor(id)).verdict;
      return [...regLine(id, ["pfk1", "fbpase1", "pc"]), { text: VERDICT_TEXT[v], basis: "curated-regulation" }, { text: "Glycolysis and gluconeogenesis are not mutually exclusive in every cell or condition, and tissues differ.", basis: "not-modelled" }, KINETICS];
    }
    case "hypoxia": case "inhibition": case "uncoupling": {
      const cond = id === "hypoxia" ? "hypoxia" : id === "inhibition" ? "cyanide" : "uncoupler";
      const o = etcOutcome(["nadh", "succinate"], cond);
      return [
        { text: `Electron transport ${o.electronFlow}; O₂ consumption ${o.oxygenUse}; proton gradient ${o.gradient}; ATP synthesis ${o.atpSynthesis}.`, basis: "respiratory-model" },
        ...o.explanation.map((t) => ({ text: t, basis: "respiratory-model" as const })),
        { text: `Substrate-level ATP of glycolysis (2) and the cycle (2 GTP) is still defined by stoichiometry; ${id === "uncoupling" ? "oxidative ATP is expected to fall." : "oxidative ATP falls with the chain."}`, basis: "stoichiometry" },
        { text: id === "uncoupling" ? "Reduced carriers are reoxidized faster, so the cycle's NADH-linked regulation would be relieved (direction only)." : "Reduced carriers (NADH, FADH₂) are reoxidized less, which, through the curated NADH signals, tends to lower pyruvate dehydrogenase and isocitrate dehydrogenase activity.", basis: id === "uncoupling" ? "curated-regulation" : "curated-regulation" },
        KINETICS,
      ];
    }
    default: return base;
  }
}
const SHUTTLE_SHORT: Record<Shuttle, string> = { "malate-aspartate": "malate–aspartate shuttle", "glycerol-phosphate": "glycerol-phosphate shuttle" };

export function mapQuestions(shuttle: Shuttle): Question[] {
  const g = glucoseLedger(shuttle), g2 = glucoseLedger(shuttle === "malate-aspartate" ? "glycerol-phosphate" : "malate-aspartate");
  return [
    mc("map-co2", "Complete oxidation of one glucose releases how many CO₂?", String(g.co2), ["2", "4", "12"], "2 from pyruvate dehydrogenase and 4 from two turns of the cycle: all six glucose carbons leave as CO₂."),
    mc("map-pyr", "Which pathways share pyruvate as a metabolite?", "Glycolysis (product), gluconeogenesis (starting material) and pyruvate oxidation (substrate)", ["Only glycolysis", "Glycolysis and the respiratory chain", "The cycle and the respiratory chain"], "One metabolite identity connects three pathways in the shared network."),
    mc("map-oaa", "Which metabolite is both a cycle intermediate and a gluconeogenic intermediate?", metName("oaa"), [metName("acetylcoa"), metName("g3p"), metName("citrate")], "Oxaloacetate: regenerated in the cycle and made by pyruvate carboxylase for gluconeogenesis; it leaves the matrix as malate."),
    mc("map-shuttle", `Changing the shuttle changes the estimated total ATP from ${g.totalAtp} to...`, String(g2.totalAtp), ["It does not change", String(g.totalAtp + 4), String(g.totalAtp - 4)], "Cytosolic NADH enters as mitochondrial NADH (2.5 ATP each) via the malate–aspartate shuttle or as FADH₂ (1.5 each) via glycerol-phosphate: a 2-ATP difference per glucose."),
    mc("map-fixed", "Is the ATP yield of complete glucose oxidation one universal fixed number?", "No: it is an estimate that depends on shuttle use, proton stoichiometry and proton leak", ["Yes, exactly 38", "Yes, exactly 36", "Yes, exactly 32 in every cell"], "Textbooks quote about 30–32; older books quoted 36–38. All are estimates built on stated assumptions."),
    mc("map-comp", "In which compartment does pyruvate carboxylase act?", "Mitochondrial matrix", ["Cytosol", "Endoplasmic-reticulum lumen", "Intermembrane space"], "Pyruvate carboxylase is a mitochondrial matrix enzyme; oxaloacetate exits as malate."),
  ];
}
export function mapChallenges(): Array<Challenge<{ scenario: string }>> {
  const items: Array<[string, string, string]> = [
    ["hypoxia", "Reduced oxygen availability", "What happens to electron transport and ATP synthesis?"],
    ["inhibition", "Complex IV inhibition", "What happens to O₂ consumption and the proton gradient?"],
    ["uncoupling", "Uncoupling", "What happens to O₂ consumption and the proton gradient?"],
    ["fasting", "Fasting-associated liver", "Which pathway's control points does the curated model push up?"],
  ];
  return items.map(([id, title, ask]) => {
    const outcome = mapScenarioOutcome(id, "malate-aspartate");
    const correct = id === "fasting" ? VERDICT_TEXT[comparePathways(signalsFor("fasting")).verdict] : outcome[0].text;
    const wrongs = ["Electron transport rises; O₂ consumption falls; proton gradient higher; ATP synthesis rises.", "Electron transport stops; O₂ consumption rises; proton gradient collapses; ATP synthesis normal.", "Electron transport normal; O₂ consumption normal; proton gradient normal; ATP synthesis normal."];
    return { question: mc(`map-ch-${id}`, `${title}. ${ask}`, correct, id === "fasting" ? [VERDICT_TEXT["favours-glycolysis"], VERDICT_TEXT.reference, VERDICT_TEXT["mixed-or-uncertain"]] : wrongs, outcome.map((s) => s.text).join(" ")), reveal: { scenario: id } };
  });
}
export const PATHWAY_ORDER: PathwayId[] = ["glycolysis", "pyruvate-oxidation", "tca", "oxphos", "gluconeogenesis"];
export const pathwayLabel = (p: PathwayId) => PATHWAYS[p].label;
export { REG_SCENARIOS, atpPerFadh2 };

/** Curated regulatory signals that each integrated-map scenario applies (the same table that produced its statements). */
export function mapScenarioSignals(id: string): Signals {
  switch (id) {
    case "high-demand": return signalsFor("low-energy");
    case "low-demand": return signalsFor("energy-rich");
    case "pfk-down": return { ...signalsFor("reference"), atp: "high" };
    case "pfk-up": return signalsFor("fed");
    case "fed": case "fasting": return signalsFor(id);
    case "hypoxia": case "inhibition": return { ...signalsFor("reference"), nadh: "high" };
    case "uncoupling": return { ...signalsFor("reference"), nadh: "low", adp: "high" };
    default: return signalsFor("reference");
  }
}
export const mapScenarioCondition = (id: string): string | null => (id === "hypoxia" ? "hypoxia" : id === "inhibition" ? "cyanide" : id === "uncoupling" ? "uncoupler" : null);
