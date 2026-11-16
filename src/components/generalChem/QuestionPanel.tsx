import { useState } from "react";
import { Badge, Callout, Panel } from "../ui/primitives";
import type { Question } from "../../utils/generalChem/chem22Learning";
import { formatSig } from "../../utils/generalChem/format";

/**
 * Practice and Challenge questions. The learner commits an answer (a number, or one choice) and only then sees the model's answer and its
 * explanation. The answer comes from the same pure model as the tool, never from a stored table; the panel can put the tool into the
 * question's own state so the learner can check the working against the tool.
 */
type PanelProps<I> = { questions: Question<I>[]; index: number; onIndex: (i: number) => void; current: I; onLoad: (next: I) => void; title: string; subtitle: string };

export function QuestionPanel<I>(props: PanelProps<I>) {
  const q = props.questions[Math.min(props.index, props.questions.length - 1)];
  if (!q) return null;
  // keyed by the question so the typed answer and the revealed state start fresh for each one
  return <QuestionBody key={q.id} {...props} />;
}

function QuestionBody<I>({ questions, index, onIndex, current, onLoad, title, subtitle }: PanelProps<I>) {
  const i = Math.min(index, questions.length - 1);
  const q = questions[i];
  const [text, setText] = useState("");
  const [choice, setChoice] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const answer = q.answer();
  const guess = q.kind === "number" ? (text.trim() === "" ? NaN : Number(text)) : choice;
  const correct = q.kind === "number"
    ? Number.isFinite(guess as number) && (q.relTol === 0 ? (guess as number) === answer : Math.abs((guess as number) - answer) <= q.relTol * Math.abs(answer))
    : guess === answer;
  const options = q.kind === "choice" ? q.options() : [];
  const canCheck = q.kind === "number" ? Number.isFinite(guess as number) : choice !== null;
  return (
    <Panel className="gc-question-panel" subtitle={subtitle} title={title}>
      <div className="gc-scenario-pick" role="group" aria-label="Choose a question">
        {questions.map((x, k) => (
          <button aria-pressed={k === i} className={k === i ? "secondary-button is-on" : "ghost-button"} key={x.id} onClick={() => onIndex(k)} type="button">{x.title}</button>
        ))}
      </div>
      <p className="gc-question" data-testid="question-prompt">{q.prompt}</p>
      {q.kind === "number" ? (
        <div className="gc-answer-row">
          <label htmlFor="gc-answer">Your answer{q.unit ? ` (${q.unit})` : ""}</label>
          <input aria-describedby="gc-answer-hint" disabled={done} id="gc-answer" inputMode="decimal" onChange={(e) => setText(e.target.value)} type="text" value={text} />
          <span className="gc-field-hint" id="gc-answer-hint">{q.relTol === 0 ? "a whole number" : `accepted within ${formatSig(q.relTol * 100, 2)} %`}</span>
        </div>
      ) : (
        <div className="gc-choice-group" role="radiogroup" aria-label="Choose an answer">
          {options.map((o, k) => (
            <label className="gc-choice" key={o}>
              <input checked={choice === k} disabled={done} name={`q-${q.id}`} onChange={() => setChoice(k)} type="radio" />
              <span>{o}</span>
            </label>
          ))}
        </div>
      )}
      <div className="gc-toolbar-actions">
        <button className="primary-button" disabled={!canCheck || done} onClick={() => setDone(true)} type="button">Check my answer</button>
        <button className="secondary-button" onClick={() => onLoad(q.setup(current))} type="button">Set this up in the tool</button>
      </div>
      {done ? (
        <div aria-live="polite" className="gc-reveal">
          <Callout tone={correct ? "ok" : "warn"} title={correct ? "Correct" : "Not quite"}>
            <p data-testid="question-result">{q.kind === "number" ? `The model gives ${formatSig(answer, 4)}${q.unit ? ` ${q.unit}` : ""}.` : `The model's answer is “${options[answer]}”.`}</p>
            <p>{q.explain(answer)}</p>
          </Callout>
        </div>
      ) : <Badge tone="neutral">Answer first, then the working is shown</Badge>}
    </Panel>
  );
}
