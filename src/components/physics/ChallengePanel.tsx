import { useState } from "react";
import { Badge, Callout, Disclosure, Panel } from "../ui/primitives";
import type { Challenge } from "../../utils/physics/waveOpticsLearning";

/**
 * Design challenges: reach a stated target by changing the laboratory's own settings. The status line is recomputed from the live
 * settings by a pure check; the hint and one worked solution stay hidden until asked for. Nothing is stored: the challenge in
 * progress is only the learner's own choice on this page.
 */
export function ChallengePanel<I>({ challenges, inputs, onPick }: { challenges: Challenge<I>[]; inputs: I; onPick?: (c: Challenge<I>) => void }) {
  const [index, setIndex] = useState(0);
  const c = challenges[Math.min(index, challenges.length - 1)];
  if (!c) return null;
  const { met, status } = c.check(inputs);
  return (
    <Panel className="ph-challenge" subtitle="Change the settings until the goal is met. The result is checked against the model, not against a stored answer." title="Challenge">
      <div className="gc-scenario-pick" role="group" aria-label="Choose a challenge">
        {challenges.map((x, i) => (
          <button aria-pressed={i === index} className={i === index ? "secondary-button is-on" : "ghost-button"} key={x.id} onClick={() => { setIndex(i); onPick?.(x); }} type="button">{x.title}</button>
        ))}
      </div>
      <p><strong>{c.title}.</strong> {c.prompt}</p>
      <Callout tone={met ? "ok" : "info"} title={met ? "Goal met" : "Not yet"}>
        <p data-testid="challenge-status">{status}</p>
      </Callout>
      <Badge tone={met ? "ok" : "neutral"}>{met ? "Goal met" : "In progress"}</Badge>
      <Disclosure summary="Hint"><p>{c.hint}</p></Disclosure>
      <Disclosure summary="Show one worked solution"><p>{c.solution}</p></Disclosure>
    </Panel>
  );
}
