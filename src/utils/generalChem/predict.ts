/** Predict-then-observe scenarios shared by the General Chemistry tools (pure; the panel that shows them is in components/generalChem/shared.tsx). */
export type Trend = "higher" | "lower" | "same";

export interface PredictScenario<I> {
  id: string;
  /** What is changed, phrased as an action. */
  change: string;
  /** The quantity the learner predicts, e.g. "the half-life". */
  quantity: string;
  /** The changed inputs, or null when the change would leave the model's supported range. */
  apply: (input: I) => I | null;
  measure: (input: I) => number;
  format: (value: number) => string;
  /** Relative tolerance below which the change counts as "about the same". */
  relTol?: number;
  absTol?: number;
  /** One or two sentences grounded in the model, shown after the reveal. */
  explain: (before: number, after: number, trend: Trend) => string;
}

export function evaluatePredict<I>(s: PredictScenario<I>, input: I): { before: number; after: number; trend: Trend; afterInput: I } | null {
  const afterInput = s.apply(input);
  if (!afterInput) return null;
  const before = s.measure(input);
  const after = s.measure(afterInput);
  if (!Number.isFinite(before) || !Number.isFinite(after)) return null;
  const tol = Math.max(s.absTol ?? 0, Math.abs(before) * (s.relTol ?? 1e-6));
  const trend: Trend = Math.abs(after - before) <= tol ? "same" : after > before ? "higher" : "lower";
  return { before, after, trend, afterInput };
}
