import type { ReactNode } from "react";
import type { WorkspaceOverview } from "../../utils/reactions/engine/workspaceRoute";
import type { SequenceOverview } from "../../utils/reactions/engine/sequenceOverview";

type Lookup = (smiles: string) => string | null | undefined;

const STATUS_WORD: Record<string, string> = {
  reaction: "Reaction", "no-reaction": "No reaction", "needs-input": "Needs input", unsupported: "Unsupported", "unknown-rule": "Unknown condition",
  "execution-error": "Evaluation failed", "not-run": "Not run", "needs-selection": "Needs a choice",
};
const statusWord = (status: string): string => STATUS_WORD[status] ?? status;

function Thumb({ svg }: { svg: string | null | undefined }) {
  return svg ? <span aria-hidden="true" className="mc-thumb" dangerouslySetInnerHTML={{ __html: svg }} /> : null;
}

function Chip({ label, name, svg, tag }: { label: string; name: string; svg?: string | null; tag?: string }) {
  return (
    <span className="mc-node" title={`${label}: ${name}`}>
      <Thumb svg={svg} />
      <span className="mc-node-text"><span className="mc-node-label">{label}{tag ? `, ${tag}` : ""}</span><span className="mc-node-name">{name}</span></span>
    </span>
  );
}

function Fact({ term, children }: { term: string; children: ReactNode }) {
  return <div className="mc-fact"><dt>{term}</dt><dd>{children}</dd></div>;
}

/** Objective, route ladder and branch summary for the Workspace mode. All data comes from `buildWorkspaceOverview`. */
export function WorkspaceRoutePanel({ overview, nameOf, svgOf }: { overview: WorkspaceOverview; nameOf: (smiles: string) => string; svgOf: Lookup }) {
  const node = (id: string, extra?: string) => {
    const lot = overview.lots[id];
    return lot ? <Chip key={id} label={lot.label} name={nameOf(lot.smiles)} svg={svgOf(lot.smiles)} tag={extra} /> : <span key={id}>{id}</span>;
  };
  const list = (ids: string[], none: string) => (ids.length === 0 ? <span className="mc-none">{none}</span> : <span className="mc-chips">{ids.map((id) => node(id))}</span>);
  const branchesWithJoin = overview.branches.filter((b) => b.join).length;
  return (
    <div className="mc-route" data-testid="workspace-route">
      <section aria-labelledby="mc-objective" className="mc-objective" data-testid="mc-objective">
        <h3 id="mc-objective">Synthesis objective</h3>
        <p className="mc-lead">
          Workspace mode: you choose which molecules each step consumes. There is no automatic search and no target is set, so this summarizes what you have supplied and what the steps have made so far.
        </p>
        <dl className="mc-facts">
          <Fact term="Starting materials">{list(overview.supplied, "none yet")}</Fact>
          <Fact term="Current end products">{list(overview.endProducts, overview.steps.length === 0 ? "none: no step has run" : "none on the shelf")}</Fact>
          {overview.liveCoproducts.length > 0 ? <Fact term="Coproducts on the shelf">{list(overview.liveCoproducts, "")}</Fact> : null}
          {overview.unused.length > 0 && overview.steps.length > 0 ? <Fact term="Not yet used">{list(overview.unused, "")}</Fact> : null}
          <Fact term="Conditions applied">{overview.reagents.length === 0 ? <span className="mc-none">none yet</span> : <span>{overview.reagents.join("; ")}</span>}</Fact>
          <Fact term="Progress">
            {overview.steps.length} {overview.steps.length === 1 ? "step" : "steps"} completed in {overview.branches.length} {overview.branches.length === 1 ? "branch" : "branches"}
            {branchesWithJoin > 0 ? ", including a join of separate branches" : ""}
            {overview.unresolved.length > 0 ? `; ${overview.unresolved.length} ${overview.unresolved.length === 1 ? "attempt" : "attempts"} gave no product` : ""}.
          </Fact>
        </dl>
        <p className="mc-caveat">Steps run sequentially on isolated compounds. Outcomes are rule-based model predictions; no yields, rates or feasibility scores are computed.</p>
      </section>

      {overview.steps.length > 0 ? (
        <section aria-labelledby="mc-ladder" className="mc-ladder-section" data-testid="mc-ladder">
          <h3 id="mc-ladder">Route overview</h3>
          <ol aria-label="Steps in the order they were run" className="mc-ladder">
            {overview.steps.map((step) => (
              <li className={`mc-rung${step.join ? " is-join" : ""}`} data-testid="mc-rung" key={step.step}>
                <div className="mc-rung-inputs">
                  {step.join ? <p className="mc-join">Step {step.step} joins {step.inputs.length} separate inputs</p> : null}
                  <span className="mc-chips">{step.inputs.map((id) => node(id))}</span>
                </div>
                <div className="mc-arrow"><span className="mc-arrow-step">Step {step.step}</span><span className="mc-arrow-reagent">{step.reagent}</span><span aria-hidden="true" className="mc-arrow-line">↓</span></div>
                <div className="mc-rung-outputs">
                  <span className="mc-chips">
                    {step.products.map((id) => node(id))}
                    {step.coproducts.map((id) => node(id, "coproduct"))}
                  </span>
                  {step.alternatives > 1 ? <small className="mc-note">{step.alternatives} outcomes were offered; {step.selectedBy === "user" ? "you chose this one" : "this one was selected"}. See the step details.</small> : null}
                  {step.cautions > 0 ? <small className="mc-note is-warn">{step.cautions} {step.cautions === 1 ? "caution" : "cautions"} for this step (see details).</small> : null}
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {overview.branches.length > 1 || branchesWithJoin > 0 ? (
        <section aria-labelledby="mc-branches" className="mc-branches" data-testid="mc-branches">
          <h3 id="mc-branches">Branches</h3>
          <div className="mc-table-wrap">
            <table>
              <caption className="pc-visually-hidden">Branches of the workspace and the steps in each</caption>
              <thead><tr><th scope="col">Branch</th><th scope="col">Starts from</th><th scope="col">Steps</th><th scope="col">Ends with</th><th scope="col">Joins</th></tr></thead>
              <tbody>
                {overview.branches.map((branch, i) => (
                  <tr key={branch.id}>
                    <th scope="row">{i + 1}</th>
                    <td>{branch.starts.map((id) => overview.lots[id]?.label ?? id).join(", ") || "—"}</td>
                    <td>{branch.steps.length > 0 ? branch.steps.join(", ") : "—"}</td>
                    <td>{branch.end.map((id) => nameOf(overview.lots[id]?.smiles ?? id)).join(", ") || "— (all consumed)"}</td>
                    <td>{branch.join ? "yes" : "no"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mc-caveat">Branches are the connected groups of molecules linked by the steps you ran; a branch that contains a join combined earlier separate branches.</p>
        </section>
      ) : null}

      {overview.unresolved.length > 0 ? (
        <section aria-labelledby="mc-unresolved" className="mc-unresolved" data-testid="mc-unresolved">
          <h3 id="mc-unresolved">Attempts without a product</h3>
          <ul>
            {overview.unresolved.map((item) => <li key={item.attempt}>Attempt {item.attempt}: {item.title} — <strong>{statusWord(item.status)}</strong>. Nothing was consumed or made.</li>)}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/** Objective, alternatives and route strip for the Ordered-sequence mode. */
export function SequenceRoutePanel({ overview, selectedIndex, onSelect, nameOf, svgOf, stepSvg }: {
  overview: SequenceOverview;
  selectedIndex: number;
  onSelect: (index: number) => void;
  nameOf: (smiles: string) => string;
  svgOf: Lookup;
  stepSvg: (branchId: string, stepNumber: number) => string | null | undefined;
}) {
  const branch = overview.branches[Math.min(selectedIndex, overview.branches.length - 1)];
  if (!branch) return null;
  return (
    <div className="mc-route" data-testid="sequence-route">
      <section aria-labelledby="mc-seq-objective" className="mc-objective" data-testid="mc-objective">
        <h3 id="mc-seq-objective">Synthesis objective</h3>
        <p className="mc-lead">Ordered-sequence mode: one starting molecule and the conditions below, applied in the order listed. Where a condition has several outcomes, each complete path is a separate sequence outcome.</p>
        <dl className="mc-facts">
          <Fact term="Starting material"><span className="mc-chips"><Chip label="Start" name={nameOf(overview.startingSmiles)} svg={svgOf(overview.startingSmiles)} /></span></Fact>
          <Fact term="Conditions, in order">
            <ol className="mc-conditions">{overview.conditions.map((c) => <li key={c.n}><strong>{c.title}</strong> <span className="mc-node-name">{c.reagent}</span></li>)}</ol>
          </Fact>
          <Fact term="Result">
            {overview.branches.length} sequence {overview.branches.length === 1 ? "outcome" : "outcomes"}, {overview.distinctEndStates} distinct end {overview.distinctEndStates === 1 ? "state" : "states"};
            {" "}{overview.fullyReacted} {overview.fullyReacted === 1 ? "reacts" : "react"} at every step{overview.withUnresolved > 0 ? `, ${overview.withUnresolved} stop${overview.withUnresolved === 1 ? "s" : ""} at a step that gave no product` : ""}.
          </Fact>
        </dl>
        <p className="mc-caveat">Outcomes are rule-based model predictions ordered by the engine ({branch.rankingBasis === "heuristic-selectivity-estimate" ? "heuristic selectivity estimates" : "original engine order, no selectivity estimate"}); no yields or feasibility are computed.</p>
      </section>

      <section aria-labelledby="mc-alt" className="mc-alternatives" data-testid="mc-alternatives">
        <h3 id="mc-alt">Sequence outcomes</h3>
        <ul className="mc-outcome-list">
          {overview.branches.map((b, i) => (
            <li key={b.id}>
              <button aria-pressed={i === selectedIndex} className={`mc-outcome${i === selectedIndex ? " is-selected" : ""}`} data-testid="mc-outcome" onClick={() => onSelect(i)} type="button">
                <span className="mc-outcome-n">#{b.index}</span>
                <span className="mc-outcome-main">
                  <span className="mc-outcome-title">{nameOf(b.finalSmiles)}</span>
                  <span className="mc-outcome-steps">{b.steps.map((s) => <span className={`mc-step-chip${s.status === "reaction" ? "" : " is-problem"}`} key={s.n}>{s.n}: {statusWord(s.status)}</span>)}</span>
                </span>
                <span className="mc-outcome-flags">
                  {b.allReacted ? <span className="rxe-tag status-computed">All steps reacted</span> : <span className="rxe-tag is-warn">Stops at step {b.firstUnresolved}</span>}
                  {b.representsRacemate ? <span className="rxe-tag">Racemic</span> : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="mc-strip" className="mc-strip-section" data-testid="mc-strip">
        <h3 id="mc-strip">Route of outcome #{branch.index}</h3>
        <ol aria-label={`Route of sequence outcome ${branch.index}: starting material, then each step's product`} className="mc-strip">
          <li className="mc-strip-node"><Chip label="Start" name={nameOf(branch.startingSmiles)} svg={svgOf(branch.startingSmiles)} /></li>
          {branch.steps.map((s) => (
            <li className="mc-strip-link" key={s.n}>
              <span className="mc-arrow"><span aria-hidden="true" className="mc-arrow-line">→</span><span className="mc-arrow-step">Step {s.n}</span><span className="mc-arrow-reagent">{s.reagent}</span></span>
              {s.status === "reaction" ? (
                <Chip label={`After step ${s.n}`} name={s.productLabel || nameOf(s.productSmiles)} svg={stepSvg(branch.id, s.n) ?? svgOf(s.productSmiles)} tag={s.selectivity ? `est. ${s.selectivity}` : undefined} />
              ) : (
                <span className="mc-node is-problem"><span className="mc-node-text"><span className="mc-node-label">Step {s.n}</span><span className="mc-node-name">{statusWord(s.status)}{s.provisional ? " (provisional)" : ""}: no new product</span></span></span>
              )}
              {s.mixture ? <small className="mc-note">{s.mixture}</small> : null}
              {s.otherComponents > 0 ? <small className="mc-note">{s.otherComponents} other {s.otherComponents === 1 ? "component" : "components"} in the state after this step{s.spectators > 0 ? ` (${s.spectators} carried forward unchanged)` : " (coproducts)"}.</small> : null}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
