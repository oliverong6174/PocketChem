/**
 * Learner-facing explanations and practice questions. Everything is computed from the same chair /
 * torsion models the views use, so an explanation and a drawing can never disagree.
 */
import { isHydrogenIndex, type ConformationGraph } from "./graph";
import { buildConformer, relationship, ringDistance, type ChairAnalysis, type ChairModel, type ConformerAssessment } from "./chair";
import { classify, conformationAt, dihedralBetween, type TorsionSetup } from "./torsion";
import { wrap180 } from "./geometry";

export type Note = { id: string; title: string; text: string };

const groupNames = (items: Array<{ label: string }>) => (items.length === 0 ? "no groups" : items.map((g) => g.label).join(" and "));

export function chairNotes(model: ChairModel, analysis: ChairAnalysis, flipped: boolean): Note[] {
  const current: ConformerAssessment = flipped ? analysis.B : analysis.A;
  const other: ConformerAssessment = flipped ? analysis.A : analysis.B;
  const notes: Note[] = [];
  const substituted = [...new Set(model.slots.filter((s) => !s.isHydrogen).map((s) => s.ringAtom))];
  notes.push({
    id: "flip",
    title: "What a chair flip does",
    text:
      `A ring flip rotates the carbons through the plane of the ring, so every axial bond becomes equatorial and every equatorial bond becomes axial. ` +
      `In the chair shown, ${groupNames(current.axialGroups)} ${current.axialGroups.length === 1 ? "is" : "are"} axial and ${groupNames(current.equatorialGroups)} ${current.equatorialGroups.length === 1 ? "is" : "are"} equatorial; ` +
      (other.axialGroups.length === 0 ? "after the flip no groups are axial." : `after the flip ${groupNames(other.axialGroups)} ${other.axialGroups.length === 1 ? "is" : "are"} axial.`),
  });
  if (substituted.length >= 2) {
    const pairs: string[] = [];
    for (let i = 0; i < substituted.length; i++) {
      for (let j = i + 1; j < substituted.length; j++) {
        const rel = relationship(model, substituted[i], substituted[j]);
        const d = ringDistance(model, substituted[i], substituted[j]);
        if (rel) pairs.push(`atoms ${substituted[i]} and ${substituted[j]} are 1,${d + 1} ${rel}`);
      }
    }
    notes.push({
      id: "cis-trans",
      title: "cis and trans do not change",
      text:
        `Up and down are properties of the ring faces, not of the chair: ${pairs.join("; ")}. A ring flip changes which positions are axial but never moves a group to the other face, so cis stays cis and trans stays trans.`,
    });
  }
  const axial = current.axialGroups;
  if (axial.length > 0) {
    notes.push({
      id: "diaxial",
      title: "1,3-diaxial interactions",
      text:
        `An axial group points straight up or down, parallel to the other axial bonds on the same face. ${axial.map((g) => g.label).join(" and ")} on this chair ${axial.length === 1 ? "sits" : "sit"} ` +
        `close to the two axial groups three atoms away on the same face (${current.synDiaxial.length} such contact${current.synDiaxial.length === 1 ? "" : "s"} here). ` +
        `Those contacts are what the A-value measures; an equatorial group points outward and avoids them.`,
    });
  }
  if (model.slots.some((s) => s.identity?.aValue?.id === "tert-butyl")) {
    notes.push({
      id: "tert-butyl",
      title: "Why tert-butyl insists on equatorial",
      text: "A tert-butyl group is so large that, axial, it would crash into the two syn-axial hydrogens (A-value about 4.9 kcal/mol). The ring locks into the chair that keeps it equatorial; any other substituent then takes whichever position the ring geometry leaves it.",
    });
  }
  return notes;
}

export function torsionNotes(graph: ConformationGraph, setup: TorsionSetup, rotation: number): Note[] {
  const cls = classify(graph, setup, rotation);
  const notes: Note[] = [{ id: "state", title: "This conformation", text: cls.description }];
  const refsHeavy = !isHydrogenIndex(graph, setup.frontRef) && !isHydrogenIndex(graph, setup.rearRef);
  if (refsHeavy) {
    notes.push({
      id: "anti-gauche",
      title: "Why anti is usually more stable than gauche",
      text: "In the anti conformation the two large groups are as far apart as possible (180°). In the gauche conformation they are 60° apart and their electron clouds overlap, a steric (van der Waals) repulsion that costs about 3.8 kJ/mol for two methyl groups.",
    });
    notes.push({
      id: "fully-eclipsed",
      title: "Why fully eclipsed is the worst",
      text: "When the two large groups are directly in line (0°) the molecule pays twice: the torsional strain of every eclipsed pair of bonds, plus the steric clash of the two large groups pressed against each other.",
    });
  }
  return notes;
}

// ------------------------------------------------------------------------------------------------
// Practice questions
// ------------------------------------------------------------------------------------------------

export type Question = {
  id: string;
  prompt: string;
  choices: string[];
  correct: number;
  explanation: string;
};

export function chairQuestions(model: ChairModel, analysis: ChairAnalysis, flipped: boolean): Question[] {
  const questions: Question[] = [];
  const conformer = buildConformer(model, flipped);
  const substituents = conformer.substituents.filter((s) => !s.slot.isHydrogen);
  substituents.slice(0, 2).forEach((item, i) => {
    const label = item.slot.identity?.label ?? "substituent";
    questions.push({
      id: `orientation-${i}`,
      prompt: `In the chair shown, is the ${label} on ring atom ${item.slot.ringAtom} axial or equatorial?`,
      choices: ["axial", "equatorial"],
      correct: item.orientation === "axial" ? 0 : 1,
      explanation:
        item.orientation === "axial"
          ? `Its bond is parallel to the ring axis (straight ${item.slot.face}), so it is axial. After a ring flip it becomes equatorial.`
          : `Its bond points outward, close to the plane of the ring, so it is equatorial. After a ring flip it becomes axial.`,
    });
  });
  const pref = analysis.preference;
  if (pref.kind === "quantified" && pref.preferred !== "equal") {
    questions.push({
      id: "stability",
      prompt: "Which chair is more stable?",
      choices: ["Chair A", "Chair B", "About equal"],
      correct: pref.preferred === "Chair A" ? 0 : 1,
      explanation: `${pref.summary} The chair that places the larger A-value groups equatorial avoids their 1,3-diaxial interactions.`,
    });
  } else if (pref.kind === "equivalent-by-symmetry") {
    questions.push({
      id: "stability",
      prompt: "Which chair is more stable?",
      choices: ["Chair A", "Chair B", "About equal"],
      correct: 2,
      explanation: pref.summary,
    });
  }
  return questions;
}

export function torsionQuestions(graph: ConformationGraph, setup: TorsionSetup, rotation: number): Question[] {
  const cls = classify(graph, setup, rotation);
  const refsHeavy = !isHydrogenIndex(graph, setup.frontRef) && !isHydrogenIndex(graph, setup.rearRef);
  const conf = conformationAt(setup, rotation);
  const d = Math.abs(wrap180(dihedralBetween(conf, setup.frontRef, setup.rearRef)));
  const out: Question[] = [];
  if (refsHeavy) {
    const options = ["anti", "gauche", "eclipsed", "fully eclipsed"];
    const answer = cls.name === "eclipsed" || cls.name === "fully eclipsed" || cls.name === "anti" || cls.name === "gauche" ? cls.name : null;
    if (answer) {
      out.push({
        id: "name",
        prompt: "What kind of conformation is shown?",
        choices: options,
        correct: options.indexOf(answer),
        explanation: `The two reference groups are ${d.toFixed(0)}° apart, so this is ${answer}. ${cls.description}`,
      });
    }
  } else if (cls.kind === "staggered" || cls.kind === "eclipsed") {
    const options = ["staggered", "eclipsed"];
    out.push({
      id: "kind",
      prompt: "Is this conformation staggered or eclipsed?",
      choices: options,
      correct: options.indexOf(cls.kind),
      explanation: cls.description,
    });
  }
  return out;
}
