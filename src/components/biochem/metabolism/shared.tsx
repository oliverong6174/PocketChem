import { useEffect, useRef, type ReactNode } from "react";
import { Badge, Callout, Disclosure, Panel, Segmented } from "../../ui/primitives";
import { PredictPanel } from "../../biology/bioShared";
import { MoleculeSvg } from "../MoleculeSvg";
import {
  COMPARTMENTS, ENZYMES_BY_ID, PATHWAYS, REACTIONS_BY_ID, metaboliteOf, SIGNALS, TENDENCY_DEFINITIONS, type PathwayId, type Reaction, type SignalId, type SignalLevel, type Tendency,
} from "../../../utils/biochem/metabolism/network";
import { carriersOf, type Net } from "../../../utils/biochem/metabolism/ledger";
import { equationText } from "./format";
import { LEVELS, contributions, enzymeTendency, type Signals } from "../../../utils/biochem/metabolism/regulation";
import type { Question } from "../../../utils/biology/bioLearning";
import { KEY_CARRIERS, SIGN, TENDENCY_GLYPH, carrierChanges } from "./format";
import "../../../styles/metabolism.css";

export function CarrierChips({ reaction, direction = "forward" }: { reaction: Reaction; direction?: "forward" | "reverse" }) {
  const chips = carrierChanges(reaction, direction);
  if (!chips.length) return <span className="mt-chip mt-chip-none">No carrier change</span>;
  return <>{chips.map((c) => <span className={`mt-chip ${c.sign > 0 ? "mt-chip-up" : "mt-chip-down"}`} key={c.key}>{c.text}</span>)}</>;
}

export function TendencyBadge({ tendency }: { tendency: Tendency }) {
  return <Badge title={TENDENCY_DEFINITIONS[tendency]} tone={tendency === "higher" ? "ok" : tendency === "lower" ? "warn" : tendency === "uncertain" ? "estimate" : "neutral"}>{TENDENCY_GLYPH[tendency]}</Badge>;
}

/** Everything about one reaction: equation, enzyme, compartment, cofactors, structures and the reason for the step. */
export function ReactionCard({ reactionId, reaction, direction: forcedDirection, pathway, hideNames = false, onSelectMetabolite, perUnit }: { reactionId: string; reaction?: Reaction; direction?: "forward" | "reverse"; pathway?: PathwayId; hideNames?: boolean; onSelectMetabolite?: (id: string) => void; perUnit?: string }) {
  const r = reaction ?? REACTIONS_BY_ID[reactionId];
  const enzyme = ENZYMES_BY_ID[r.enzyme];
  const role = r.roles.find((x) => x.pathway === pathway) ?? r.roles[0];
  const direction = forcedDirection ?? role.direction;
  const times = role.perGlucose;
  const resolve = (xs: Array<{ met: string }>) => xs.map((p) => metaboliteOf(p.met)!).filter(Boolean);
  const structured = resolve([...r.substrates, ...r.products]).filter((m, i, a) => m.structure && m.kind !== "inorganic" && a.indexOf(m) === i);
  const schematic = resolve([...r.substrates, ...r.products]).filter((m, i, a) => !m.structure && m.kind !== "cofactor" && m.kind !== "carrier" && a.indexOf(m) === i);
  return (
    <div className="mt-card" data-testid="reaction-card">
      <h3>{hideNames ? `Reaction ${role.step}` : r.name}</h3>
      <div className="mt-badges">
        <Badge tone="info">{COMPARTMENTS[r.compartment].label}</Badge>
        <Badge tone={r.reversibility === "irreversible" ? "warn" : "neutral"} title="Under cellular conditions">{r.reversibility === "irreversible" ? "Effectively irreversible" : "Reversible"}</Badge>
        {r.tags?.includes("regulatory") ? <Badge tone="estimate">Regulated step</Badge> : null}
        {r.tags?.includes("substrate-level-phosphorylation") ? <Badge tone="ok">Substrate-level phosphorylation</Badge> : null}
        {r.tags?.includes("bypass") ? <Badge tone="info">Gluconeogenic bypass</Badge> : null}
        {times > 1 ? <Badge tone="neutral">×{times} {perUnit ?? "per glucose"}</Badge> : null}
        {r.transport ? <Badge tone="info">Transport: {r.transport.map((t) => `${metaboliteOf(t.met)?.abbreviation ?? t.met} ${COMPARTMENTS[t.from].label.toLowerCase()} → ${COMPARTMENTS[t.to].label.toLowerCase()}`).join("; ")}</Badge> : null}
        {r.tissues ? <Badge tone="neutral">{r.tissues.length === 1 ? (r.tissues[0] === "liver" ? "Liver" : "Extrahepatic tissues") : "Liver and extrahepatic"}</Badge> : null}
        {direction === "reverse" && pathway ? <Badge tone="neutral">Run in reverse here</Badge> : null}
      </div>
      <p className="mt-eq" data-testid="reaction-equation">{equationText(r, direction)}</p>
      <p className="mt-chips"><CarrierChips direction={direction} reaction={r} /></p>
      {hideNames ? <p className="ph-note">Enzyme and explanation are hidden. Work out what the enzyme does, then use Reveal labels.</p> : (
        <>
          <p><strong>Enzyme:</strong> {enzyme.name}{enzyme.ec ? ` (EC ${enzyme.ec})` : ""}. {enzyme.note ?? ""}</p>
          <p><strong>What changes:</strong> {r.transformation}</p>
          <p><strong>Why it matters:</strong> {r.purpose}</p>
        </>
      )}
      {structured.length ? (
        <div className="mt-structs">
          {structured.map((m) => (
            <div className="mt-struct" key={m.id}>
              <MoleculeSvg height={110} label={`${m.name} structure`} smiles={m.structure!.smiles} width={190} />
              <button className="ghost-button mt-struct-name" onClick={() => onSelectMetabolite?.(m.id)} type="button">{m.name}</button>
              <span className="ph-note">{m.carbons != null ? `C${m.carbons}` : ""}{m.structure!.form === "open-chain" ? " · open-chain form" : ""}</span>
            </div>
          ))}
        </div>
      ) : null}
      {schematic.length ? <p className="ph-note">Schematic only (no atom-level structure is drawn for): {schematic.map((m) => m.name).join(", ")}.</p> : null}
    </div>
  );
}

export function MetaboliteCard({ id, onSelectReaction }: { id: string; onSelectReaction?: (reactionId: string) => void }) {
  const m = metaboliteOf(id)!;
  const involved = Object.values(REACTIONS_BY_ID).filter((r) => [...r.substrates, ...r.products].some((p) => p.met === id));
  const pathways = [...new Set(involved.flatMap((r) => r.roles.map((x) => x.pathway)))];
  return (
    <div className="mt-card" data-testid="metabolite-card">
      <h3>{m.name}</h3>
      <div className="mt-badges">
        {m.carbons != null && m.carbons > 0 ? <Badge tone="neutral">{m.carbons} carbon{m.carbons === 1 ? "" : "s"}</Badge> : null}
        {m.formula ? <Badge tone="neutral">{m.formula}</Badge> : null}
        {m.compartments.map((c) => <Badge key={c} tone="info">{COMPARTMENTS[c].label}</Badge>)}
      </div>
      {m.structure ? <MoleculeSvg height={140} label={`${m.name} structure`} smiles={m.structure.smiles} width={260} /> : <p className="ph-note">Schematic metabolite: no atom-level structure is drawn.</p>}
      {m.note ? <p className="ph-note">{m.note}</p> : null}
      <p><strong>Pathways:</strong> {pathways.map((p) => PATHWAYS[p].label).join(", ") || "none"}</p>
      <p><strong>Reactions:</strong></p>
      <ul className="mt-links">
        {involved.map((r) => (
          <li key={r.id}>
            <button className="ghost-button" onClick={() => onSelectReaction?.(r.id)} type="button">{r.name}</button>
            <span className="ph-note"> {r.substrates.some((p) => p.met === id) ? "uses it" : "makes it"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function LedgerTable({ net, caption, rows }: { net: Net; caption: string; rows?: Array<[string, string]> }) {
  const c = carriersOf(net);
  const items: Array<[string, number]> = [["ATP", c.atp], ["GTP", c.gtp], ["NADH", c.nadh], ["FADH₂", c.fadh2], ["CO₂", c.co2]];
  const shown = (rows ?? KEY_CARRIERS.map(([, l]) => [l, l] as [string, string])).map(([label]) => items.find(([l]) => l === label)).filter((x): x is [string, number] => !!x);
  return (
    <table className="bc-table mt-ledger" data-testid="ledger">
      <caption>{caption}</caption>
      <thead><tr><th scope="col">Carrier</th><th scope="col">Net change</th><th scope="col">Meaning</th></tr></thead>
      <tbody>
        {shown.map(([label, v]) => (
          <tr key={label}><th scope="row">{label}</th><td>{SIGN(v)}</td><td>{v > 0 ? "made" : v < 0 ? "consumed" : "no net change"}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

export function AssumptionsPanel({ items, title = "Assumptions and limits" }: { items: string[]; title?: string }) {
  return (
    <Panel subtitle="What this model does and does not claim." title={title}>
      <ul className="gc-assumptions">{items.map((a) => <li key={a}>{a}</li>)}</ul>
    </Panel>
  );
}

const SIGNAL_NOTE: Partial<Record<SignalId, string>> = { nadh: "reduced NADH relative to NAD⁺" };
/** Signal controls and the resulting qualitative tendency of each listed enzyme, with the curated reason for every contributing signal. */
export function RegulationPanel({ signals, onChange, signalIds, enzymeIds, title = "Regulatory signals" }: {
  signals: Signals; onChange: (next: Signals) => void; signalIds: SignalId[]; enzymeIds: string[]; title?: string;
}) {
  return (
    <>
      <Panel subtitle="Each signal is low, normal or high relative to a reference state. These are directions, not concentrations." title={title}>
        <div className="mt-signals">
          {signalIds.map((id) => (
            <Segmented<SignalLevel> key={id} label={`${SIGNALS[id]}${SIGNAL_NOTE[id] ? ` (${SIGNAL_NOTE[id]})` : ""}`} onChange={(v) => onChange({ ...signals, [id]: v })} options={LEVELS.map((l) => ({ id: l, label: l[0].toUpperCase() + l.slice(1) }))} value={signals[id]} />
          ))}
        </div>
        <button className="ghost-button" onClick={() => onChange({ ...signals, ...Object.fromEntries(signalIds.map((id) => [id, "normal"])) })} type="button">Reset to reference</button>
      </Panel>
      <Panel subtitle="Relative to the all-normal reference state; opposing signals are reported as uncertain." title="Effect on each enzyme">
        <table className="bc-table" data-testid="tendency-table">
          <thead><tr><th scope="col">Enzyme</th><th scope="col">Net tendency</th><th scope="col">Why (curated)</th></tr></thead>
          <tbody>
            {enzymeIds.map((e) => {
              const t = enzymeTendency(e, signals);
              const active = t.contributions.filter((c) => c.direction !== 0);
              const all = contributions(e, signals);
              return (
                <tr key={e}>
                  <th scope="row">{ENZYMES_BY_ID[e].short}</th>
                  <td><TendencyBadge tendency={t.tendency} /></td>
                  <td>
                    {active.length ? active.map((c) => (
                      <p key={c.effect.id}><Badge tone={c.effect.kind === "allosteric" || c.effect.kind === "product-feedback" ? "info" : "neutral"}>{c.effect.kind === "allosteric" ? "Direct allosteric" : c.effect.kind === "product-feedback" ? "Product feedback" : "Indirect (covalent)"}</Badge> {c.effect.note}</p>
                    )) : <span className="ph-note">{all.length ? "No signal here departs from normal." : "No curated signal for this enzyme."}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <Disclosure summary="What do these labels mean?">
          <ul className="gc-assumptions">{Object.values(TENDENCY_DEFINITIONS).map((d) => <li key={d}>{d}</li>)}</ul>
          <p className="ph-note">Direct allosteric or product-feedback effects act on the enzyme itself; indirect effects work through hormones, kinases or phosphatases. No rate, flux or concentration is calculated.</p>
        </Disclosure>
      </Panel>
    </>
  );
}

/** Challenge mode: commit to a prediction first; the answer's state is applied to the diagram only afterwards. */
export function ChallengePanel<P>({ items, index, onReveal, onNext, label = "Show the result in the diagram" }: {
  items: Array<{ question: Question; reveal: P }>; index: number; onReveal: (patch: P) => void; onNext: () => void; label?: string;
}) {
  const item = items[index % items.length];
  return (
    <PredictPanel
      finished={false}
      onReveal={() => { onReveal(item.reveal); onNext(); }}
      question={item.question}
      revealLabel={label}
      subtitle="Commit to an answer first. The diagram changes only after you choose."
    />
  );
}

export function PracticeNote({ children }: { children: ReactNode }) {
  return <Callout tone="info" title="Practice mode"><p>{children}</p></Callout>;
}


/** Wide diagrams scroll sideways inside their frame on narrow screens (text stays readable); the selected part is brought into view. */
export function ScrollBox({ children, focusKey }: { children: ReactNode; focusKey?: string | null }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const box = ref.current;
    if (!box || box.scrollWidth <= box.clientWidth + 2) return;
    const el = box.querySelector<SVGElement>('[aria-pressed="true"]');
    if (!el) return;
    const b = box.getBoundingClientRect(), r = el.getBoundingClientRect();
    box.scrollLeft += r.left + r.width / 2 - (b.left + b.width / 2);
  }, [focusKey]);
  return (
    <>
      <div className="mt-scroll" ref={ref}>{children}</div>
      <p className="mt-hint">Swipe sideways inside the diagram to see all of it.</p>
    </>
  );
}
