/**
 * Stage 25 Practice questions and Challenge (predict-then-reveal) items for the fatty-acid, amino-acid / urea-cycle and fuel-map tools.
 * Every answer is computed from the same engines that draw the diagrams (lipids.ts, nitrogen.ts, fuel.ts, network.ts): there is no answer key.
 */
import type { Question } from "../../biology/bioLearning";
import { mc, type Challenge } from "./learning";
import { ENZYMES_BY_ID, FATTY_ACID_NAME, REACTIONS_BY_ID, TENDENCY_DEFINITIONS, carnitineRequirement, type PathwayId, type Tendency } from "./network";
import {
  LIPID_PRESETS, NORMAL_LIPID_CONDITIONS, activation, lipidRegulation, oxidationSequence, oxidationTotals, synthesisLedger, ketoneOxidationAtp, type LipidConditions, type Substrate,
} from "./lipids";
import {
  AMINO_CATABOLISM_BY_ONE, ENDPOINTS, classifyAminoAcid, glutamateDehydrogenase, transamination, ureaEnergy, ureaNet, ureaRegulation, ureaSteps, plpCoenzyme, type AaClassification,
} from "./nitrogen";
import { FUEL_SCENARIOS, FUEL_SCENARIOS_BY_ID, STATE_LABEL, stateOf, sharedMetabolites, substrateComparison, type PathwayState } from "./fuel";
import { AMINO_ACIDS_BY_ONE } from "../aminoAcids";

const tendencyWord: Record<Tendency, string> = { higher: "Higher", lower: "Lower", reference: "No change (reference)", uncertain: "Uncertain (signals conflict)" };
const n1 = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1));
const others = (correct: number, extra: number[]) => [...new Set(extra.filter((x) => x !== correct && x >= 0))].map(String);

// ---- fatty acids -----------------------------------------------------------------------------------------------------------------------------

export interface FattyQuestionState { chain: number; substrate: "saturated" | "oleate"; step: number }
export function fattyAcidQuestions(s: FattyQuestionState): Question[] {
  const out: Question[] = [];
  const sat = (n: number): Substrate => ({ kind: "saturated", carbons: n });
  const pal = oxidationTotals(sat(16))!;
  const name = FATTY_ACID_NAME[s.chain] ?? `C${s.chain}`;
  const cur = oxidationTotals(sat(s.chain));
  if (cur && s.chain % 2 === 0) {
    out.push(mc("fa-cycles-cur", `How many β-oxidation cycles does ${name} (C${s.chain}) require?`, String(cur.cycles), others(cur.cycles, [cur.cycles + 1, cur.cycles - 1, s.chain / 2 + 1, s.chain]),
      `Each cycle removes two carbons as acetyl-CoA; the last cycle splits a C4 acyl-CoA into two acetyl-CoA, so a C${s.chain} chain needs ${s.chain}/2 − 1 = ${cur.cycles} cycles and gives ${cur.acetylCoA} acetyl-CoA.`));
    out.push(mc("fa-acetyl-cur", `How many acetyl-CoA does one molecule of ${name} give by β-oxidation?`, String(cur.acetylCoA), others(cur.acetylCoA, [cur.cycles, cur.acetylCoA + 1, cur.acetylCoA * 2, cur.acetylCoA - 1]),
      `C${s.chain} ÷ 2 = ${cur.acetylCoA}: every carbon pair becomes one acetyl-CoA, including the last two from the final thiolysis.`));
  }
  out.push(mc("fa-cycles-pal", "How many β-oxidation cycles does palmitate (C16:0) require?", String(pal.cycles), others(pal.cycles, [8, 6, 16, 9]), "Palmitate has 16 carbons: 16/2 − 1 = 7 cycles, and the last one gives two acetyl-CoA, so there are 8 acetyl-CoA, 7 NADH and 7 FADH₂ in total."));
  const act = activation(16);
  out.push(mc("fa-activation-cost", "Why does fatty-acid activation cost two ATP equivalents?", "ATP is split to AMP + PPi and the PPi is then hydrolyzed, so two high-energy phosphate bonds are spent",
    ["Two ATP are converted to two ADP by acyl-CoA synthetase", "CoA binds with two ATP-dependent steps in the cycle", "The carnitine shuttle consumes one ATP at each step"],
    `Acyl-CoA synthetase makes acyl-CoA + AMP + PPi from ATP (${act.synthetaseBonds} bond spent); pyrophosphatase hydrolyzes PPi (a second bond: ${act.bondsAfterPyrophosphatase} in total). AMP then needs the equivalent of two ATP to be rephosphorylated, so the cost is ${act.atpEquivalents} ATP equivalents although only ${act.atpMolecules} ATP molecule is consumed.`));
  out.push(mc("fa-direct-atp", "How many ATP does β-oxidation of palmitate make directly (before the citric acid cycle and respiratory chain)?", "None: it makes acetyl-CoA, NADH and FADH₂", ["106", "8", "14"],
    `The β-oxidation reactions produce ${pal.acetylCoA} acetyl-CoA, ${pal.nadh} NADH and ${pal.fadh2} FADH₂; the conventional net of ${pal.atp!.total} ATP equivalents arises later in the cycle and the chain (activation costs ${pal.activationAtpEquivalents}).`));
  out.push(mc("fa-pal-total", "What is the conventional net ATP-equivalent estimate for complete oxidation of palmitate (2.5 ATP/NADH, 1.5 ATP/FADH₂)?", n1(pal.atp!.total), [n1(pal.atp!.total + 2), "129", "120"].filter((x) => x !== n1(pal.atp!.total)),
    `8 acetyl-CoA × ${pal.atpPerAcetylCoA} + 7 NADH × 2.5 + 7 FADH₂ × 1.5 − 2 (activation) = ${pal.atp!.fromAcetylCoA} + ${pal.atp!.fromNadh} + ${pal.atp!.fromFadh2} − 2 = ${pal.atp!.total}. Older textbooks use 3 and 2 ATP per carrier and quote 129.`));
  const synth = synthesisLedger(16)!;
  out.push(mc("fa-nadph", "Which cofactor supplies the reducing power in fatty-acid synthesis?", "NADPH", ["NADH", "FADH₂", "FAD"], `The two reductions of every round (ketoacyl reductase and enoyl reductase) use NADPH: ${synth.nadphConsumed} NADPH for palmitate. NADPH is a separate pool from NADH.`));
  out.push(mc("fa-synth-atp", "How many ATP are spent forming the malonyl-CoA for one palmitate (not counting acetyl-CoA export)?", String(synth.atpForMalonylCoA), others(synth.atpForMalonylCoA, [8, 14, 16, 15]),
    `One acetyl-CoA is the primer and seven are carboxylated to malonyl-CoA (one ATP each): ${synth.atpForMalonylCoA} ATP. NADPH (${synth.nadphConsumed}) is counted separately; exporting acetyl-CoA as citrate adds ${synth.atpForAcetylCoAExport} more ATP if it comes from mitochondria.`));
  out.push(mc("fa-malonyl-cpt1", "Why does malonyl-CoA inhibit CPT I?", "It signals active fatty-acid synthesis, so newly made fatty acids are not carried into mitochondria and oxidized (avoiding a futile cycle)", ["It is a competitive substrate analogue of carnitine that is later oxidized", "It is the product of β-oxidation and inhibits by feedback", "It removes CoA from the cytosol"],
    "Malonyl-CoA is made only by acetyl-CoA carboxylase, the committed step of synthesis. By inhibiting CPT I it reciprocally switches oxidation off while synthesis is on."));
  out.push(mc("fa-carnitine-need", `Does ${name} (C${s.chain}) need the carnitine shuttle?`, carnitineRequirement(s.chain) === "yes" ? "Yes: long-chain acyl groups need it" : carnitineRequirement(s.chain) === "partly" ? "Borderline: some enters without it" : "No: medium and short chains reach the matrix without it", ["Yes: long-chain acyl groups need it", "No: medium and short chains reach the matrix without it", "Borderline: some enters without it"],
    "Long-chain acyl groups (about C14 and longer) need CPT I, the translocase and CPT II; short and medium chains cross the mitochondrial membranes without carnitine and are activated in the matrix, so malonyl-CoA does not control them."));
  out.push(mc("ketone-where", "Where are ketone bodies produced and where are they consumed?", "Produced in liver mitochondria; used by extrahepatic tissues such as heart, muscle and (adapted) brain", ["Produced in muscle; used by the liver", "Produced and used in the same hepatocyte", "Produced in red blood cells; used by the brain"],
    "Hepatocytes have HMG-CoA synthase and lyase but very little SCOT, so they make ketone bodies but cannot use them. Peripheral tissues with SCOT use them; red blood cells have no mitochondria."));
  out.push(mc("ketone-scot", "Which enzyme do hepatocytes lack that prevents them from using ketone bodies?", ENZYMES_BY_ID.scot.short, [ENZYMES_BY_ID.hmgcs2.short, ENZYMES_BY_ID.bdh1.short, ENZYMES_BY_ID.thiolase.short], "SCOT (succinyl-CoA:acetoacetate CoA-transferase) activates acetoacetate to acetoacetyl-CoA; with little SCOT the liver cannot oxidize the ketone bodies it makes."));
  const acac = ketoneOxidationAtp("acetoacetate"), bhb = ketoneOxidationAtp("bhb");
  out.push(mc("ketone-atp", "Why does oxidizing acetoacetate give a little less than two acetyl-CoA's worth of ATP?", "SCOT bypasses succinyl-CoA synthetase, so one GTP is forgone", ["Thiolase consumes ATP", "Acetoacetate is oxidized without the citric acid cycle", "BDH1 consumes NADH"],
    `Two acetyl-CoA through the cycle give ${acac.fromCycle} ATP equivalents, minus ${acac.forgoneNtp} GTP forgone = ${acac.total}; β-hydroxybutyrate adds the NADH of BDH1 (${bhb.total}).`));
  if (s.step >= 1) {
    const seq = oxidationSequence(s.substrate === "oleate" ? { kind: "oleate" } : sat(s.chain)), cur2 = seq[Math.min(s.step, seq.length) - 1];
    if (cur2) {
      const pool = ["ACAD", "ECH", "HADH", "THIOL"].map((b) => ENZYMES_BY_ID[({ ACAD: "acad", ECH: "ech", HADH: "hadh", THIOL: "thiolase" } as Record<string, string>)[b]].short);
      const correct = ENZYMES_BY_ID[REACTIONS_BY_ID[cur2.reactionId]?.enzyme ?? cur2.enzyme].short;
      out.push(mc(`fa-step-${s.step}`, `Which enzyme catalyzes this β-oxidation step: ${cur2.title.toLowerCase()} at C${cur2.chainBefore}?`, correct, pool.filter((p) => p !== correct), `${cur2.title}: ${REACTIONS_BY_ID[cur2.reactionId]?.purpose ?? ""}`.trim()));
    }
  }
  return out;
}
export interface FattyPatch { view: "oxidation" | "regulation" | "energy" | "synthesis" | "ketone"; chain?: number; conditions?: LipidConditions }
export function fattyAcidChallenges(): Array<Challenge<FattyPatch>> {
  const out: Array<Challenge<FattyPatch>> = [];
  for (const p of LIPID_PRESETS.filter((x) => x.id !== "reference")) {
    const t = lipidRegulation(p.conditions);
    out.push({
      question: mc(`fa-ch-${p.id}`, `Predict: under "${p.title}", what happens to CPT I's tendency (relative to the reference state)?`, tendencyWord[t.cpt1], Object.values(tendencyWord).filter((w) => w !== tendencyWord[t.cpt1]),
        `${p.text} ${TENDENCY_DEFINITIONS[t.cpt1]} (Directions only: malonyl-CoA is taken to follow ACC activity and CPT I to be inhibited by it.)`), reveal: { view: "regulation", conditions: p.conditions },
    });
  }
  for (const n of [10, 14, 18]) {
    const t = oxidationTotals({ kind: "saturated", carbons: n })!;
    out.push({ question: mc(`fa-ch-acetyl-${n}`, `Predict: how many acetyl-CoA come from one C${n} fatty acid?`, String(t.acetylCoA), others(t.acetylCoA, [t.cycles, t.acetylCoA + 1, t.acetylCoA - 1, t.acetylCoA * 2]), `C${n} ÷ 2 = ${t.acetylCoA} acetyl-CoA from ${t.cycles} cycles (the last cycle gives two).`), reveal: { view: "oxidation", chain: n } });
  }
  return out;
}

// ---- amino acids and the urea cycle ------------------------------------------------------------------------------------------------------------

export interface AminoQuestionState { aa: string; ureaStep: number; substrate: string }
const classWord: Record<AaClassification, string> = { glucogenic: "Glucogenic only", ketogenic: "Ketogenic only", both: "Both glucogenic and ketogenic" };
export function aminoQuestions(s: AminoQuestionState): Question[] {
  const out: Question[] = [];
  const e = ureaEnergy();
  out.push(mc("aa-transfer", "What does transamination transfer?", "An α-amino group, from an amino acid to an α-keto acid; no free ammonia is released", ["Ammonium ions to carbamoyl phosphate", "A carboxyl group from the amino acid", "An amide nitrogen to water"],
    `${transamination("A")!.aminoAcid} + α-ketoglutarate → pyruvate + glutamate: the net ammonium released is ${transamination("A")!.ammoniumReleased}. Only glutamate dehydrogenase (or an amidase/dehydratase) releases NH₄⁺.`));
  out.push(mc("aa-plp", "Which vitamin-derived cofactor supports aminotransferases?", plpCoenzyme.name.replace(" (PLP)", "") + " (vitamin B₆)", ["Thiamine pyrophosphate (vitamin B₁)", "Biotin", "Adenosylcobalamin (vitamin B₁₂)"], "Pyridoxal 5′-phosphate forms Schiff bases with the amino acid and carries the amino group as pyridoxamine phosphate between the two half-reactions."));
  out.push(mc("urea-sources", "What are the two nitrogen sources of urea?", "Free ammonium (through carbamoyl phosphate) and aspartate", ["Glutamine and glutamate", "Two ammonium ions", "Arginine and ornithine"],
    "Carbamoyl phosphate synthetase I incorporates NH₄⁺ (with CO₂); argininosuccinate synthetase incorporates aspartate's α-amino nitrogen. The carbon comes from CO₂, and aspartate's carbons leave as fumarate."));
  out.push(mc("urea-bonds", "Why does the urea cycle consume four high-energy phosphate bonds but only three ATP molecules?", "Argininosuccinate synthetase converts ATP to AMP + PPi, and PPi hydrolysis spends a second bond", ["CPS I uses two ATP and each makes two bonds", "The cycle also consumes GTP", "Arginase uses ATP twice"],
    `ATP molecules: ${e.atpMolecules} (CPS I: 2, ASS: 1). Bonds: ${e.highEnergyBonds} = 2 (CPS I) + 1 (ATP → AMP + PPi) + 1 (PPi → 2 Pi).`));
  out.push(mc("urea-comp", "Which urea-cycle enzymes act in the mitochondrial matrix?", "CPS I and ornithine transcarbamylase", ["Argininosuccinate synthetase and lyase", "Arginase and OTC", "CPS I and arginase"],
    "CPS I and OTC are mitochondrial; citrulline is exported, the next three steps (ASS, ASL, arginase) are cytosolic, and ornithine is imported again."));
  out.push(mc("urea-nag", "What does N-acetylglutamate do in the urea cycle?", "It is an essential allosteric activator of CPS I", ["It is the carbon donor for urea", "It is hydrolyzed to give ornithine", "It inhibits arginase"], `Without it ${ENZYMES_BY_ID.cps1.short} is essentially inactive: ${ureaRegulation({ nagPresent: false, arginine: "normal" }).summary}`));
  out.push(mc("urea-atp", "Does nitrogen disposal through the urea cycle produce ATP?", "No: it consumes 3 ATP (4 high-energy bonds)", ["Yes: it makes 3 ATP", "Yes: it makes 1 ATP", "No, it consumes 1 ATP"], `Net ATP ${-ureaNet().atp}: the cycle consumes energy; NADH recovered from fumarate → malate → oxaloacetate is separate accounting for the carbon skeleton.`));
  out.push(mc("gdh-vs-ta", "Which reaction frees ammonium from the glutamate pool?", "Glutamate dehydrogenase (oxidative deamination)", ["Alanine aminotransferase", "Aspartate aminotransferase", "Pyridoxal phosphate itself"], `GDH: ${glutamateDehydrogenase("nad", "deamination").text} Aminotransferases only move the group.`));
  out.push(mc("aa-ketogenic", "Which amino acid is exclusively ketogenic in the standard classification?", "Leucine", ["Isoleucine", "Phenylalanine", "Alanine"], "Leucine (with lysine) gives only acetyl-CoA and acetoacetate. Isoleucine, phenylalanine, tryptophan, threonine and tyrosine give both gluconeogenic and ketogenic products."));
  out.push(mc("aa-both", "Which amino acid is both glucogenic and ketogenic?", "Phenylalanine", ["Leucine", "Lysine", "Alanine"], "Phenylalanine → tyrosine → fumarate (glucogenic) + acetoacetate (ketogenic)."));
  const a = AMINO_ACIDS_BY_ONE[s.aa], c = AMINO_CATABOLISM_BY_ONE[s.aa];
  if (a && c) {
    const cls = classifyAminoAcid(s.aa);
    out.push(mc(`aa-class-${s.aa}`, `How is ${a.name} classified?`, classWord[cls], Object.values(classWord).filter((w) => w !== classWord[cls]),
      `${a.name} gives ${c.endpoints.map((x) => ENDPOINTS[x].label).join(" and ")}. Glucogenic products are pyruvate and citric-acid-cycle intermediates; ketogenic ones are acetyl-CoA or acetoacetate.`));
    const endLabels = c.endpoints.map((x) => ENDPOINTS[x].label);
    if (endLabels.length === 1) out.push(mc(`aa-end-${s.aa}`, `Where does the carbon skeleton of ${a.name} enter central metabolism?`, endLabels[0], Object.values(ENDPOINTS).map((x) => x.label).filter((l) => l !== endLabels[0]), c.skeleton));
  }
  const step = ureaSteps()[Math.max(0, Math.min(ureaSteps().length, s.ureaStep) - 1)];
  if (s.ureaStep >= 1 && step) {
    const pool = ureaSteps().filter((x) => !x.transport && x.reactionId !== "PPASE").map((x) => ENZYMES_BY_ID[REACTIONS_BY_ID[x.reactionId].enzyme].short);
    if (!step.transport && step.reactionId !== "PPASE") { const correct = ENZYMES_BY_ID[REACTIONS_BY_ID[step.reactionId].enzyme].short; out.push(mc(`urea-step-${s.ureaStep}`, `Which enzyme catalyzes this step: ${REACTIONS_BY_ID[step.reactionId].transformation}`, correct, pool.filter((p) => p !== correct), REACTIONS_BY_ID[step.reactionId].purpose)); }
  }
  return out;
}
export interface AminoPatch { view: "urea" | "skeleton" | "transamination"; aa?: string; nag?: boolean; arginine?: "normal" | "high"; ureaStep?: number }
export function aminoChallenges(): Array<Challenge<AminoPatch>> {
  const lys = classifyAminoAcid("K"), tyr = classifyAminoAcid("Y"), thr = classifyAminoAcid("T");
  const noNag = ureaRegulation({ nagPresent: false, arginine: "normal" }), hi = ureaRegulation({ nagPresent: true, arginine: "high" });
  return [
    { question: mc("aa-ch-nag", "Predict: if N-acetylglutamate is absent, what happens to CPS I activity (relative to the reference state)?", tendencyWord[noNag.cps1], Object.values(tendencyWord).filter((w) => w !== tendencyWord[noNag.cps1]), noNag.summary), reveal: { view: "urea", nag: false, arginine: "normal" } },
    { question: mc("aa-ch-arg", "Predict: if arginine is high (and N-acetylglutamate present), what happens to CPS I activity?", tendencyWord[hi.cps1], Object.values(tendencyWord).filter((w) => w !== tendencyWord[hi.cps1]), hi.summary), reveal: { view: "urea", nag: true, arginine: "high" } },
    { question: mc("aa-ch-lys", "Predict: how is lysine classified?", classWord[lys], Object.values(classWord).filter((w) => w !== classWord[lys]), "Lysine gives acetoacetyl-CoA and acetyl-CoA only: exclusively ketogenic."), reveal: { view: "skeleton", aa: "K" } },
    { question: mc("aa-ch-tyr", "Predict: how is tyrosine classified?", classWord[tyr], Object.values(classWord).filter((w) => w !== classWord[tyr]), "Tyrosine gives fumarate (glucogenic) and acetoacetate (ketogenic)."), reveal: { view: "skeleton", aa: "Y" } },
    { question: mc("aa-ch-thr", "Predict: how is threonine classified?", classWord[thr], Object.values(classWord).filter((w) => w !== classWord[thr]), "Threonine gives pyruvate and succinyl-CoA (glucogenic) and, by another route, acetyl-CoA (ketogenic)."), reveal: { view: "skeleton", aa: "T" } },
  ];
}

// ---- integrated map ---------------------------------------------------------------------------------------------------------------------------

export interface FuelQuestionState { scenario: string }
export function fuelQuestions(s: FuelQuestionState): Question[] {
  const out: Question[] = [];
  const shared = sharedMetabolites();
  out.push(mc("fuel-acetyl", "Which metabolite do carbohydrate, fatty-acid and ketone-body oxidation all deliver to the citric acid cycle?", "Acetyl-CoA", ["Pyruvate", "Oxaloacetate", "Succinyl-CoA"], `Acetyl-CoA is one identity in the shared network (${shared.includes("acetylcoa") ? "used by several pathways" : ""}): from PDH, β-oxidation thiolase and ketolysis (thiolase). Oxaloacetate accepts it in citrate synthase.`));
  out.push(mc("fuel-nadph", "Can NADPH be treated as interchangeable with NADH in the ledgers?", "No: they are separate pools; NADPH is consumed by biosynthesis such as fatty-acid synthesis", ["Yes: both give about 2.5 ATP", "Yes: transhydrogenase interconverts them freely", "No: NADPH is made only by glycolysis"], "The model keeps NADPH in its own row: fatty-acid synthesis consumes NADPH, whereas NADH and FADH₂ feed the respiratory chain."));
  out.push(mc("fuel-n-atp", "Is nitrogen disposal an ATP-producing pathway?", "No: the urea cycle consumes ATP", ["Yes, through glutamate dehydrogenase", "Yes, through transamination", "Yes, through fumarate"], "Transamination and urea formation make no ATP; GDH makes NADH (a reduced carrier), but the urea cycle spends 3 ATP."));
  const cmp = substrateComparison();
  out.push(mc("fuel-pal-vs-glc", "Which substrate gives more estimated ATP per carbon: glucose or palmitate?", `Palmitate (${cmp[1].atpPerCarbon.toFixed(2)} vs ${cmp[0].atpPerCarbon.toFixed(2)})`, [`Glucose (${cmp[0].atpPerCarbon.toFixed(2)} vs ${cmp[1].atpPerCarbon.toFixed(2)})`, "They are equal", "Cannot be compared"], "Palmitate is more reduced, so more electrons per carbon reach the respiratory chain (conventional estimates: 106/16 versus 32/6)."));
  const sc = FUEL_SCENARIOS_BY_ID[s.scenario];
  if (sc && sc.id !== "baseline") {
    const live = stateOf(sc.id, "ketogenesis", "liver"), ext = stateOf(sc.id, "ketolysis", "extrahepatic");
    out.push(mc(`fuel-keto-${sc.id}`, `In the scenario "${sc.title}", what does the model say about ketogenesis in the liver?`, STATE_LABEL[live], Object.values(STATE_LABEL).filter((l) => l !== STATE_LABEL[live]), `${sc.summary} Basis: curated regulation and tissue enzymes; the model gives a direction, not an amount.`));
    out.push(mc(`fuel-ketolysis-${sc.id}`, `In the scenario "${sc.title}", what does the model say about ketolysis in extrahepatic tissue?`, STATE_LABEL[ext], Object.values(STATE_LABEL).filter((l) => l !== STATE_LABEL[ext]), "Extrahepatic tissues have SCOT; the liver does not."));
  }
  return out;
}
export interface FuelPatch { scenario: string; display: "scenario" }
export function fuelChallenges(): Array<Challenge<FuelPatch>> {
  const pick = (id: string, p: PathwayId, t: "liver" | "extrahepatic", prompt: string): Challenge<FuelPatch> => {
    const st: PathwayState = stateOf(id, p, t);
    return { question: mc(`fuel-ch-${id}-${p}-${t}`, prompt, STATE_LABEL[st], Object.values(STATE_LABEL).filter((l) => l !== STATE_LABEL[st]), `${FUEL_SCENARIOS_BY_ID[id].summary} The label means the direction curated regulation and tissue enzymes point; the model has no rates.`), reveal: { scenario: id, display: "scenario" } };
  };
  return [
    pick("fed", "beta-oxidation", "liver", "Predict: in the fed-associated scenario, what does the model say about β-oxidation in the liver?"),
    pick("fasting-fao", "ketogenesis", "liver", "Predict: in the fasting-associated scenario, what does the model say about ketogenesis in the liver?"),
    pick("ketolysis", "ketolysis", "liver", "Predict: in the peripheral ketone-body scenario, what does the model say about ketolysis in the liver?"),
    pick("aa-catabolism", "urea-cycle", "liver", "Predict: with increased amino-acid catabolism, what does the model say about the urea cycle in the liver?"),
    pick("nitrogen-disposal", "urea-cycle", "extrahepatic", "Predict: what does the model say about the urea cycle in extrahepatic tissue?"),
  ];
}
export { NORMAL_LIPID_CONDITIONS, FUEL_SCENARIOS };
