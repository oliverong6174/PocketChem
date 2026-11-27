/**
 * Stage 20: a read-only overview of an ordered-sequence run (Multi-Catalytic, "Ordered sequence" mode).
 *
 * The sequence is linear by construction (one molecule, conditions applied in order), but a step can have several outcomes, and each
 * complete path through those outcomes is one engine "branch". This summarises the engine's branches without re-ranking them: the
 * order is the engine's order, and the ranking basis is reported as the engine states it.
 */
import type { SequentialSynthesisBranch, SequentialSynthesisStep } from "./sequentialSynthesis";

export interface SequenceStepSummary {
  n: number;
  title: string;
  reagent: string;
  status: SequentialSynthesisStep["status"];
  productSmiles: string;
  productLabel: string;
  selectivity: string | null;
  /** The step ran on the carried-forward molecule of an unresolved earlier step. */
  provisional: boolean;
  mixture: string | null;
  spectators: number;
  /** Other molecular components of the state after this step (coproducts and carried-forward spectators). */
  otherComponents: number;
}

export interface SequenceBranchSummary {
  id: string;
  /** 1-based, the engine's order. */
  index: number;
  startingSmiles: string;
  finalSmiles: string;
  steps: SequenceStepSummary[];
  reactionSteps: number;
  /** First step that did not give a computed reaction, or null when every step reacted. */
  firstUnresolved: number | null;
  allReacted: boolean;
  representsRacemate: boolean;
  rankingBasis: SequentialSynthesisBranch["ranking"]["basis"];
}

export interface SequenceOverview {
  mode: "sequence";
  startingSmiles: string;
  conditions: Array<{ n: number; title: string; reagent: string }>;
  branches: SequenceBranchSummary[];
  /** Distinct end states across the branches (by SMILES). */
  distinctEndStates: number;
  fullyReacted: number;
  withUnresolved: number;
  status: "no-run" | "single-outcome" | "alternatives";
}

export function buildSequenceOverview(startingSmiles: string, branches: readonly SequentialSynthesisBranch[]): SequenceOverview {
  const summaries: SequenceBranchSummary[] = branches.map((branch, i) => {
    const steps: SequenceStepSummary[] = branch.steps.map((step) => ({
      n: step.stepNumber,
      title: step.title,
      reagent: step.reagentLabel,
      status: step.status,
      productSmiles: step.productSmiles,
      productLabel: step.productLabel,
      selectivity: step.selectivity ? step.selectivity.label : null,
      provisional: step.inputUnresolved,
      mixture: step.mixture ? (step.mixture.collapsed ? `racemic (${step.mixture.memberCount} enantiomers; one drawn)` : `${step.mixture.kind} mixture member (of ${step.mixture.memberCount})`) : null,
      spectators: step.spectators.length,
      otherComponents: Math.max(0, step.productComponents.length - 1),
    }));
    const firstBad = steps.find((step) => step.status !== "reaction");
    return {
      id: branch.id,
      index: i + 1,
      startingSmiles: branch.startingSmiles,
      finalSmiles: branch.finalSmiles,
      steps,
      reactionSteps: steps.filter((step) => step.status === "reaction").length,
      firstUnresolved: firstBad ? firstBad.n : null,
      allReacted: steps.length > 0 && !firstBad,
      representsRacemate: branch.representsRacemate,
      rankingBasis: branch.ranking.basis,
    };
  });
  const first = branches[0];
  return {
    mode: "sequence",
    startingSmiles,
    conditions: first ? first.steps.map((step) => ({ n: step.stepNumber, title: step.title, reagent: step.reagentLabel })) : [],
    branches: summaries,
    distinctEndStates: new Set(summaries.map((branch) => branch.finalSmiles)).size,
    fullyReacted: summaries.filter((branch) => branch.allReacted).length,
    withUnresolved: summaries.filter((branch) => !branch.allReacted).length,
    status: summaries.length === 0 ? "no-run" : summaries.length === 1 ? "single-outcome" : "alternatives",
  };
}
