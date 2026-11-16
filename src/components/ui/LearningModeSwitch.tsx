import { Segmented, type SegmentedOption } from "./primitives";

/**
 * Interactive-learning pattern shared by future Biology / Biochemistry tools and, today, the
 * Conformations page.
 *   explore   - labelled diagrams, everything visible
 *   practice  - labels and answers hidden; the learner manipulates the diagram and answers
 *   challenge - the learner predicts the outcome of a changed condition before it is revealed
 * A page declares which modes it actually supports; unsupported modes are not rendered (no placeholders).
 */
export type LearningMode = "explore" | "practice" | "challenge";

const MODE_COPY: Record<LearningMode, { label: string; blurb: string }> = {
  explore: { label: "Explore", blurb: "Everything is labelled. Change the structure and watch what follows." },
  practice: { label: "Practice", blurb: "Names and answers are hidden. Work it out, then check." },
  challenge: { label: "Challenge", blurb: "Predict what changes before it is shown." },
};

export function LearningModeSwitch({ mode, modes = ["explore", "practice"], onChange, blurbs }: {
  mode: LearningMode;
  modes?: LearningMode[];
  onChange: (mode: LearningMode) => void;
  /** Replacement descriptions for a page whose modes work differently from the defaults. */
  blurbs?: Partial<Record<LearningMode, string>>;
}) {
  const options: Array<SegmentedOption<LearningMode>> = modes.map((id) => ({ id, label: MODE_COPY[id].label, title: blurbs?.[id] ?? MODE_COPY[id].blurb }));
  return (
    <div className="ui-learning-switch">
      <Segmented label="Learning mode" onChange={onChange} options={options} value={mode} />
      <p className="ui-learning-note">{blurbs?.[mode] ?? MODE_COPY[mode].blurb}</p>
    </div>
  );
}
