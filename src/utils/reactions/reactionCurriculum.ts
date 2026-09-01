import type { OrganicChemCourse, ReactionRule } from "./reactionTypes";

type FamilyCurriculum = {
  course: OrganicChemCourse;
  chapter: string;
};

const FAMILY_CURRICULUM: Record<string, FamilyCurriculum> = {
  alkanes: { course: "ochem-1", chapter: "Radical reactions" },
  haloalkanes: { course: "ochem-1", chapter: "Substitution and elimination" },
  alcohols: { course: "ochem-1", chapter: "Alcohols" },
  ethers: { course: "ochem-1", chapter: "Ethers" },
  epoxides: { course: "ochem-1", chapter: "Epoxides" },
  alkenes: { course: "ochem-1", chapter: "Alkenes" },
  alkynes: { course: "ochem-1", chapter: "Alkynes" },
  dienes: { course: "ochem-2", chapter: "Conjugated systems" },
  aromatics: { course: "ochem-2", chapter: "Aromatic reactions" },
  phenols: { course: "ochem-2", chapter: "Phenols" },
  aldehydes: { course: "ochem-2", chapter: "Aldehydes and ketones" },
  ketones: { course: "ochem-2", chapter: "Aldehydes and ketones" },
  "carbonyl-derivatives": { course: "ochem-2", chapter: "Carbonyl derivatives and protecting groups" },
  couplings: { course: "ochem-2", chapter: "Carbon-carbon cross-coupling" },
  enolates: { course: "ochem-2", chapter: "Enols and enolates" },
  "carboxylic-acids": { course: "ochem-2", chapter: "Carboxylic acids" },
  "acid-chlorides": {
    course: "ochem-2",
    chapter: "Carboxylic acid derivatives",
  },
  anhydrides: {
    course: "ochem-2",
    chapter: "Carboxylic acid derivatives",
  },
  esters: { course: "ochem-2", chapter: "Carboxylic acid derivatives" },
  amides: { course: "ochem-2", chapter: "Carboxylic acid derivatives" },
  nitriles: { course: "ochem-2", chapter: "Nitriles" },
  amines: { course: "ochem-2", chapter: "Amines" },
  diazonium: { course: "ochem-2", chapter: "Aromatic amines" },
  sulfur: { course: "ochem-2", chapter: "Organosulfur compounds" },
};

export function getRuleCourse(rule: ReactionRule): OrganicChemCourse {
  return rule.course ?? FAMILY_CURRICULUM[rule.family]?.course ?? "advanced";
}

export function getRuleChapter(rule: ReactionRule): string {
  return rule.chapter ?? FAMILY_CURRICULUM[rule.family]?.chapter ?? rule.family;
}
