import type { FunctionalGroupResult } from "../analyzeSmiles";

export type ReactionTransform = {
  type: "rdkitReactionSmarts";
  smarts: string;
};

export type ReactionTrigger = {
  functionalGroups: string[];
};

export type ReactionRule = {
  id: string;
  family: string;
  title: string;
  reagents: string;
  reagentNote: string;
  productHint: string;
  explanation: string;
  trigger: ReactionTrigger;
  transform: ReactionTransform;
  priority: number;
};

export type ReactionPathway = {
  id: string;
  title: string;
  reactantSmiles: string;
  reactantLabel: string;
  reagentLabel: string;
  reagentNote: string;
  productSmiles: string | null;
  productLabel: string;
  shortExplanation: string;
};

export type ReactionPredictionInput = {
  reactantSmiles: string;
  functionalGroups: FunctionalGroupResult[];
};