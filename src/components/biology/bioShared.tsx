import { useId, useState, type ReactNode } from "react";
import { cleanSeq, type PlaySpeed, type useStepPlayer } from "./bioHooks";
import { Callout, Panel, Segmented } from "../ui/primitives";
import { usePrefersReducedMotion } from "../physics/simHooks";
import type { Question } from "../../utils/biology/bioLearning";
import "../../styles/generalChem.css";
import "../../styles/physics.css";
import "../../styles/biology.css";

export function StepControls({ step, max, onStep, player, extra, locked = false, unit = "Step" }: {
  step: number; max: number; onStep: (n: number) => void; player: ReturnType<typeof useStepPlayer>; extra?: ReactNode;
  /** Challenge mode: stepping is done by answering predictions, so only reset is offered. */
  locked?: boolean; unit?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const id = useId();
  const go = (n: number) => { player.pause(); onStep(Math.max(0, Math.min(max, n))); };
  return (
    <div className="ph-controls" role="group" aria-label="Step controls">
      <div className="ph-transport">
        {!locked ? (
          <>
            <button aria-label="First step" className="secondary-button" disabled={step === 0} onClick={() => go(0)} type="button">⏮</button>
            <button aria-label="Previous step" className="secondary-button" disabled={step === 0} onClick={() => go(step - 1)} type="button">◀ Back</button>
            <button aria-label="Next step" className="primary-button" disabled={step >= max} onClick={() => go(step + 1)} type="button">Next ▶</button>
            <button aria-label="Last step" className="secondary-button" disabled={step >= max} onClick={() => go(max)} type="button">⏭</button>
            {!reduced ? (player.playing
              ? <button aria-label="Pause" className="secondary-button" onClick={player.pause} type="button">❚❚ Pause</button>
              : <button aria-label={step >= max ? "Replay" : "Play"} className="secondary-button" disabled={max === 0} onClick={player.play} type="button">{step >= max ? "↻ Replay" : "▶ Play"}</button>) : null}
            {!reduced ? <Segmented<PlaySpeed> label="Playback speed" onChange={player.setSpeed} options={[{ id: "slow", label: "Slow" }, { id: "normal", label: "Normal" }, { id: "fast", label: "Fast" }]} value={player.speed} /> : null}
          </>
        ) : (
          <button className="secondary-button" disabled={step === 0} onClick={() => go(0)} type="button">↻ Start again</button>
        )}
        {extra}
      </div>
      {!locked ? (
        <div className="ph-timeline">
          <label htmlFor={`${id}-s`}>{unit}</label>
          <input aria-valuetext={`${unit} ${step} of ${max}`} id={`${id}-s`} max={max} min={0} onChange={(e) => go(Number(e.target.value))} step={1} type="range" value={step} />
          <output className="ph-time-readout" htmlFor={`${id}-s`}>{step} of {max}</output>
        </div>
      ) : <p className="ph-note">{unit} {step} of {max}. In Challenge mode the next step is revealed after you commit to a prediction.</p>}
    </div>
  );
}

// ---- questions -------------------------------------------------------------------------------------------------------------------

export function Options({ q, choice, onChoose, disabled }: { q: Question; choice: number | null; onChoose: (i: number) => void; disabled?: boolean }) {
  return (
    <div className="bio-options" role="radiogroup" aria-label={q.prompt}>
      {q.options.map((o, i) => {
        const state = choice === null ? "" : i === q.answer ? " is-right" : i === choice ? " is-wrong" : "";
        return (
          <button aria-checked={choice === i} className={`bio-option${state}`} disabled={disabled || choice !== null} key={o} onClick={() => onChoose(i)} role="radio" type="button">{o}</button>
        );
      })}
    </div>
  );
}

/** Practice: a short set of questions about the structure on screen; the answer and reason appear after each choice. */
export function QuizPanel({ questions, title = "Practice questions", subtitle = "Answer from the diagram. The reason appears after you choose." }: { questions: Question[]; title?: string; subtitle?: string }) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  if (!questions.length) return null;
  const i = Math.min(index, questions.length - 1);
  const q = questions[i];
  const choice = answers[q.id] ?? null;
  const answered = questions.filter((x) => answers[x.id] !== undefined);
  const right = answered.filter((x) => answers[x.id] === x.answer).length;
  return (
    <Panel className="bio-quiz" subtitle={subtitle} title={title}>
      <p className="bio-score" data-testid="quiz-score">Question {i + 1} of {questions.length} · {right} of {answered.length} answered correctly</p>
      <p className="gc-question" data-testid="quiz-prompt">{q.prompt}</p>
      <Options choice={choice} onChoose={(c) => setAnswers((a) => ({ ...a, [q.id]: c }))} q={q} />
      {choice !== null ? (
        <div aria-live="polite" className="gc-reveal">
          <Callout tone={choice === q.answer ? "ok" : "warn"} title={choice === q.answer ? "Correct" : `Not quite: the answer is “${q.options[q.answer]}”`}>
            <p data-testid="quiz-explanation">{q.explanation}</p>
          </Callout>
        </div>
      ) : null}
      <div className="bio-quiz-nav">
        <button className="ghost-button" disabled={i === 0} onClick={() => setIndex(i - 1)} type="button">Previous question</button>
        <button className="ghost-button" disabled={i >= questions.length - 1} onClick={() => setIndex(i + 1)} type="button">Next question</button>
      </div>
    </Panel>
  );
}

/** Challenge: commit to a prediction about the NEXT step; the step is revealed only afterwards. */
export function PredictPanel({ question, onReveal, finished, revealLabel = "Reveal the next step", subtitle = "Commit to an answer first; the next step is shown only after you choose." }: { question: Question | null; onReveal: () => void; finished: boolean; revealLabel?: string; subtitle?: string }) {
  const [choice, setChoice] = useState<number | null>(null);
  const [tally, setTally] = useState({ asked: 0, right: 0 });
  const key = question?.id ?? "none";
  const [seenKey, setSeenKey] = useState(key);
  if (seenKey !== key) { setSeenKey(key); setChoice(null); }
  if (!question) {
    return (
      <Panel className="bio-quiz" subtitle="You have reached the end of this process." title="Predict, then reveal">
        <p className="bio-score" data-testid="predict-score">{tally.right} of {tally.asked} predictions correct</p>
        <Callout tone="ok" title={finished ? "Process complete" : "Nothing to predict"}><p>Use “Start again” to try the process again with the same or a different sequence.</p></Callout>
      </Panel>
    );
  }
  return (
    <Panel className="bio-quiz" subtitle={subtitle} title="Predict, then reveal">
      <p className="bio-score" data-testid="predict-score">{tally.right} of {tally.asked} predictions correct</p>
      <p className="gc-question" data-testid="predict-prompt">{question.prompt}</p>
      <Options choice={choice} onChoose={(c) => { setChoice(c); setTally((t) => ({ asked: t.asked + 1, right: t.right + (c === question.answer ? 1 : 0) })); }} q={question} />
      {choice !== null ? (
        <div aria-live="polite" className="gc-reveal">
          <Callout tone={choice === question.answer ? "ok" : "warn"} title={choice === question.answer ? "Your prediction matches" : `Not quite: it is “${question.options[question.answer]}”`}>
            <p>{question.explanation}</p>
            <button className="primary-button" data-testid="predict-reveal" onClick={onReveal} type="button">{revealLabel}</button>
          </Callout>
        </div>
      ) : null}
    </Panel>
  );
}

export function SeqField({ label, value, onChange, error, hint, rows = 1 }: { label: string; value: string; onChange: (v: string) => void; error?: string | null; hint?: string; rows?: number }) {
  const id = useId();
  const common = {
    "aria-describedby": error ? `${id}-err` : hint ? `${id}-hint` : undefined,
    "aria-invalid": error ? true as const : undefined,
    className: "gc-mono bio-seq",
    id,
    onChange: (e: { target: { value: string } }) => onChange(cleanSeq(e.target.value)),
    spellCheck: false,
    value,
  };
  return (
    <div className={`gc-field${error ? " has-error" : ""}`}>
      <label htmlFor={id}>{label}</label>
      {rows > 1 ? <textarea {...common} maxLength={400} rows={rows} /> : <input {...common} maxLength={400} type="text" />}
      {error ? <p className="gc-field-error" id={`${id}-err`} role="alert">{error}</p> : hint ? <p className="gc-field-hint" id={`${id}-hint`}>{hint}</p> : null}
    </div>
  );
}

/** Scope note shown on each tool: which organism's machinery is drawn. */
export function OrganismNote({ organism }: { organism: "bacteria" | "eukaryote" }) {
  return (
    <p className="bio-organism-note" data-testid="organism-note">
      {organism === "bacteria"
        ? "Showing the bacterial (prokaryotic) machinery. Eukaryotic differences are not drawn."
        : "Showing the eukaryotic machinery. Bacterial machinery is not drawn."}
    </p>
  );
}
