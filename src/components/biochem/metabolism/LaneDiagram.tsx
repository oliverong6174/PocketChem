import { type KeyboardEvent } from "react";
import { ENZYMES_BY_ID, METABOLITES_BY_ID, REACTIONS_BY_ID, type PathwayId } from "../../../utils/biochem/metabolism/network";
import { reactionNet } from "../../../utils/biochem/metabolism/ledger";

/**
 * Vertical glycolysis / gluconeogenesis diagram. One layout serves three views: glycolysis only (down arrows), gluconeogenesis only
 * (up arrows, with the mitochondrial detour) and a side-by-side comparison where shared reactions are double-headed and the bypass
 * reactions sit on their own lane. Every node and arrow is a real metabolite or reaction of the shared network.
 */
export type LaneView = "glycolysis" | "gluconeogenesis" | "compare";
type Lane = "glyc" | "gng" | "shared";
interface Node { id: string; met: string; x: number; y: number; w: number; label?: string; compartment: "cytosol" | "matrix" | "er" }
interface Conn { id: string; reaction?: string; from: string; to: string; lane: Lane; dx?: number; label?: string; path?: string; labelX?: number; labelY?: number; side?: "left" | "right" | "middle" }

const NODES: Node[] = [
  { id: "glc", met: "glucose", x: 250, y: 40, w: 170, compartment: "cytosol" },
  { id: "g6p", met: "g6p", x: 250, y: 118, w: 170, compartment: "cytosol" },
  { id: "f6p", met: "f6p", x: 250, y: 196, w: 170, compartment: "cytosol" },
  { id: "f16", met: "f16bp", x: 250, y: 274, w: 170, compartment: "cytosol" },
  { id: "dhap", met: "dhap", x: 100, y: 360, w: 180, compartment: "cytosol" },
  { id: "g3p", met: "g3p", x: 400, y: 360, w: 180, compartment: "cytosol" },
  { id: "bpg", met: "bpg13", x: 250, y: 446, w: 170, compartment: "cytosol" },
  { id: "pg3", met: "pg3", x: 250, y: 524, w: 170, compartment: "cytosol" },
  { id: "pg2", met: "pg2", x: 250, y: 602, w: 170, compartment: "cytosol" },
  { id: "pep", met: "pep", x: 250, y: 680, w: 170, compartment: "cytosol" },
  { id: "pyr", met: "pyruvate", x: 250, y: 762, w: 170, label: "Pyruvate (cytosol)", compartment: "cytosol" },
  { id: "oaac", met: "oaa", x: 500, y: 590, w: 170, label: "Oxaloacetate (cytosol)", compartment: "cytosol" },
  { id: "malc", met: "malate", x: 500, y: 690, w: 170, label: "Malate (cytosol)", compartment: "cytosol" },
  { id: "malm", met: "malate", x: 800, y: 690, w: 170, label: "Malate (matrix)", compartment: "matrix" },
  { id: "oaam", met: "oaa", x: 800, y: 780, w: 170, label: "Oxaloacetate (matrix)", compartment: "matrix" },
  { id: "pyrm", met: "pyruvate", x: 800, y: 870, w: 170, label: "Pyruvate (matrix)", compartment: "matrix" },
];
const CONNS: Conn[] = [
  { id: "hk", reaction: "HK", from: "glc", to: "g6p", lane: "glyc", dx: -24 },
  { id: "g6pase", reaction: "G6PASE", from: "g6p", to: "glc", lane: "gng", dx: 24 },
  { id: "pgi", reaction: "PGI", from: "g6p", to: "f6p", lane: "shared" },
  { id: "pfk", reaction: "PFK1", from: "f6p", to: "f16", lane: "glyc", dx: -24 },
  { id: "fbp", reaction: "FBP1", from: "f16", to: "f6p", lane: "gng", dx: 24 },
  { id: "aldo1", reaction: "ALDO", from: "f16", to: "dhap", lane: "shared", path: "M 215 293 L 130 340", label: "" },
  { id: "aldo2", reaction: "ALDO", from: "f16", to: "g3p", lane: "shared", path: "M 285 293 L 370 340", labelX: 345, labelY: 313, side: "right" },
  { id: "tpi", reaction: "TPI", from: "dhap", to: "g3p", lane: "shared", path: "M 226 360 L 306 360", labelX: 250, labelY: 350, side: "middle" },
  { id: "gapdh", reaction: "GAPDH", from: "g3p", to: "bpg", lane: "shared", path: "M 355 379 L 285 427", labelX: 340, labelY: 418, side: "right" },
  { id: "pgk", reaction: "PGK", from: "bpg", to: "pg3", lane: "shared" },
  { id: "pgm", reaction: "PGM", from: "pg3", to: "pg2", lane: "shared" },
  { id: "eno", reaction: "ENO", from: "pg2", to: "pep", lane: "shared" },
  { id: "pk", reaction: "PK", from: "pep", to: "pyr", lane: "glyc", dx: -24 },
  { id: "pepck", reaction: "PEPCK", from: "oaac", to: "pep", lane: "gng", path: "M 415 600 L 330 666", labelX: 405, labelY: 640, side: "right" },
  { id: "mdhc", reaction: "MDH-C", from: "malc", to: "oaac", lane: "gng", path: "M 500 671 L 500 609", labelX: 514, labelY: 644, side: "right" },
  { id: "malt", reaction: "MAL-T", from: "malm", to: "malc", lane: "gng", path: "M 715 690 L 586 690", labelX: 650, labelY: 678, side: "middle" },
  { id: "mdhm", reaction: "MDH-M", from: "oaam", to: "malm", lane: "gng", path: "M 800 761 L 800 709", labelX: 814, labelY: 740, side: "right" },
  { id: "pc", reaction: "PC", from: "pyrm", to: "oaam", lane: "gng", path: "M 800 851 L 800 799", labelX: 814, labelY: 830, side: "right" },
  { id: "mpc", from: "pyr", to: "pyrm", lane: "gng", path: "M 250 779 V 870 H 713", label: "Pyruvate carrier (transport)", labelX: 270, labelY: 858, side: "right" },
];

const INK = "#0f172a", MUTED = "#475569", GLYC = "#b45309", GNG = "#6d28d9", SHARED = "#0f766e", PAPER = "#ffffff";
const LANE_COLOR: Record<Lane, string> = { glyc: GLYC, gng: GNG, shared: SHARED };
const nodeById = Object.fromEntries(NODES.map((n) => [n.id, n]));
const H = 34;

/** Which connectors a view draws. */
function visible(c: Conn, view: LaneView): boolean {
  if (view === "compare") return true;
  if (view === "glycolysis") return c.lane !== "gng";
  return c.lane !== "glyc";
}
function nodeVisible(n: Node, view: LaneView): boolean {
  if (view === "compare") return true;
  if (view === "glycolysis") return !["oaac", "malc", "malm", "oaam", "pyrm"].includes(n.id);
  return true;
}
function endpoints(c: Conn, headAt: "from" | "to") {
  const a = nodeById[c.from], b = nodeById[c.to];
  const dx = c.dx ?? 0;
  return { a, b, dx, headAt };
}

export function LaneDiagram({ view, step, selected, onSelect, onSelectMetabolite, hideNames, highlightMetabolite }: {
  view: LaneView; step: number; selected: string | null; onSelect: (reactionId: string) => void; onSelectMetabolite?: (met: string) => void; hideNames?: boolean; highlightMetabolite?: string | null;
}) {
  const pathway: PathwayId = view === "gluconeogenesis" ? "gluconeogenesis" : "glycolysis";
  const stepOf = (reactionId: string, lane: Lane): number | null => {
    const r = REACTIONS_BY_ID[reactionId];
    const role = r.roles.find((x) => x.pathway === (lane === "gng" ? "gluconeogenesis" : lane === "glyc" ? "glycolysis" : pathway));
    return role ? role.step : null;
  };
  const conns = CONNS.filter((c) => visible(c, view));
  const done = (c: Conn): boolean => {
    if (view === "compare") return false;
    if (!c.reaction) return step >= 1; // transport follows the first step of the pathway
    const s = stepOf(c.reaction, c.lane);
    return s !== null && s <= step;
  };
  const reached = new Set<string>(view === "gluconeogenesis" ? ["pyr"] : ["glc"]);
  for (const c of conns) if (done(c)) reached.add(view === "gluconeogenesis" && c.lane === "shared" ? c.from : c.to);
  // in gluconeogenesis the aldolase/triose branches end at glucose-side nodes: arrive at the 'from' node of the glycolytic direction
  const wide = view === "glycolysis" ? 520 : 940;
  const height = view === "glycolysis" ? 810 : 940;
  const nodes = NODES.filter((n) => nodeVisible(n, view));

  const onKey = (e: KeyboardEvent, id: string) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(id); } };

  return (
    <svg aria-label={`${view === "compare" ? "Glycolysis and gluconeogenesis side by side" : view === "glycolysis" ? "Glycolysis pathway" : "Gluconeogenesis pathway"}`} className={`mt-svg mt-lane ${view === "glycolysis" ? "mt-lane-narrow" : "mt-lane-wide"}`} data-testid="lane-diagram" role="group" viewBox={`0 0 ${wide} ${height}`} style={{ minWidth: view === "glycolysis" ? 440 : 700 }}>
      <title>{view === "compare" ? "Glycolysis and gluconeogenesis compared" : view === "glycolysis" ? "Glycolysis" : "Gluconeogenesis"}</title>
      <defs>
        {(["glyc", "gng", "shared"] as Lane[]).map((l) => (
          <marker id={`mt-arrow-${l}`} key={l} markerHeight="7" markerWidth="7" orient="auto-start-reverse" refX="6" refY="3.5" viewBox="0 0 7 7"><path d="M0 0 L7 3.5 L0 7 z" fill={LANE_COLOR[l]} /></marker>
        ))}
      </defs>
      <rect fill={PAPER} height={height} width={wide} />
      {view !== "glycolysis" ? (
        <g>
          <rect fill="#f5f3ff" height={300} rx={10} stroke="#c4b5fd" strokeDasharray="6 4" width={238} x={696} y={630} />
          <text fill={GNG} fontSize={13} fontWeight={700} x={710} y={654}>Mitochondrial matrix</text>
          <text fill={MUTED} fontSize={12} x={352} y={80}>G6Pase acts in the ER lumen</text>
        </g>
      ) : null}
      <text fill={MUTED} fontSize={12} fontWeight={700} x={12} y={22}>Cytosol</text>
      {/* connectors */}
      {conns.map((c) => {
        const { a, b, dx } = endpoints(c, "to");
        const isDone = done(c);
        const isSel = !!c.reaction && selected === c.reaction;
        const color = LANE_COLOR[c.lane];
        const faint = view !== "compare" && step > 0 && !isDone && !isSel;
        const vertical = Math.abs(a.x - b.x) < 5 && !c.path;
        const goingDown = b.y > a.y;
        let d = c.path;
        if (!d && vertical) {
          const x = a.x + dx;
          d = goingDown ? `M ${x} ${a.y + H / 2} L ${x} ${b.y - H / 2 - 2}` : `M ${x} ${a.y - H / 2} L ${x} ${b.y + H / 2 + 2}`;
        }
        const shared = c.lane === "shared";
        // glycolysis direction is "down"/"to"; for shared connectors the gluconeogenic head goes the other way (reverse)
        const headEnd = view === "gluconeogenesis" && shared ? "start" : "end";
        const both = view === "compare" && shared;
        const label = c.label ?? (c.reaction ? (hideNames && !isDone && !isSel ? `Step ${REACTIONS_BY_ID[c.reaction].roles.find((r) => r.pathway === pathway)?.step ?? ""}` : ENZYMES_BY_ID[REACTIONS_BY_ID[c.reaction].enzyme].short) : "");
        const midY = a.y + (b.y - a.y) / 2;
        const labelX = c.labelX ?? (c.lane === "gng" && !c.path ? a.x + dx + 16 : a.x + dx - 16);
        const anchor = c.side ? (c.side === "left" ? "end" : c.side === "middle" ? "middle" : "start") : c.lane === "gng" ? "start" : "end";
        const labelY = c.labelY ?? midY + 4;
        const chips = c.reaction ? chipText(c.reaction, c.lane, view) : "";
        const aria = c.reaction ? `${REACTIONS_BY_ID[c.reaction].name}${hideNames && !isDone ? "" : ""}, ${isSel ? "selected" : isDone ? "completed" : "not yet reached"}` : label;
        return (
          <g
            aria-label={aria}
            aria-pressed={c.reaction ? isSel : undefined}
            className={c.reaction ? "mt-hit" : undefined}
            data-testid={c.reaction ? `conn-${c.reaction}` : undefined}
            key={c.id}
            onClick={c.reaction ? () => onSelect(c.reaction!) : undefined}
            onKeyDown={c.reaction ? (e) => onKey(e, c.reaction!) : undefined}
            opacity={faint ? 0.42 : 1}
            role={c.reaction ? "button" : undefined}
            tabIndex={c.reaction ? 0 : undefined}
          >
            {isSel ? <path d={d} fill="none" stroke="#fde68a" strokeLinecap="round" strokeWidth={9} /> : null}
            <path d={d} fill="none" markerEnd={headEnd === "end" || both ? `url(#mt-arrow-${c.lane})` : undefined} markerStart={headEnd === "start" || both ? `url(#mt-arrow-${c.lane})` : undefined} stroke={color} strokeDasharray={isDone || view === "compare" ? undefined : "5 4"} strokeWidth={isDone || isSel ? 3 : 2} />
            <rect fill="transparent" height={36} width={150} x={anchor === "end" ? labelX - 150 : anchor === "middle" ? labelX - 75 : labelX} y={labelY - 20} />
            <text fill={isSel ? INK : color} fontSize={13.5} fontWeight={isSel ? 800 : 700} paintOrder="stroke" stroke="#fff" strokeWidth={4} textAnchor={anchor} x={labelX} y={labelY}>{label}</text>
            {chips && label !== "" ? <text fill={MUTED} fontSize={12} paintOrder="stroke" stroke="#fff" strokeWidth={4} textAnchor={anchor} x={labelX} y={labelY + 15}>{chips}</text> : null}
          </g>
        );
      })}
      {/* nodes */}
      {nodes.map((n) => {
        const m = METABOLITES_BY_ID[n.met];
        const isReached = view === "compare" || reached.has(n.id);
        const hl = highlightMetabolite === n.met;
        return (
          <g
            aria-label={`${n.label ?? m.name}${m.carbons ? `, ${m.carbons} carbons` : ""}`}
            className="mt-hit"
            data-testid={`node-${n.id}`}
            key={n.id}
            onClick={() => onSelectMetabolite?.(n.met)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelectMetabolite?.(n.met); } }}
            role="button"
            tabIndex={0}
          >
            <rect fill={hl ? "#fef9c3" : isReached ? "#ecfeff" : "#f8fafc"} height={H} rx={8} stroke={hl ? "#ca8a04" : isReached ? "#0e7490" : "#94a3b8"} strokeWidth={hl ? 3 : isReached ? 2 : 1.2} width={n.w} x={n.x - n.w / 2} y={n.y - H / 2} />
            <text fill={INK} fontSize={(n.label ?? m.name).length > 22 ? 12 : 13.5} fontWeight={600} textAnchor="middle" x={n.x} y={n.y + 5}>{n.label ?? m.name}</text>
            {m.carbons ? <text fill={MUTED} fontSize={12} fontWeight={600} textAnchor="start" x={n.x + n.w / 2 + 6} y={n.y + 5}>C{m.carbons}</text> : null}
          </g>
        );
      })}
      {view !== "gluconeogenesis" ? (
        <g aria-hidden="true">
          <rect fill="#fffbeb" height={46} rx={5} stroke="#f59e0b" width={150} x={6} y={470} />
          <text fill={INK} fontSize={12} x={12} y={489}>From GAPDH on, each</text>
          <text fill={INK} fontSize={12} x={12} y={505}>step runs ×2 per glucose</text>
        </g>
      ) : null}
    </svg>
  );
}

function chipText(reactionId: string, lane: Lane, view: LaneView): string {
  const r = REACTIONS_BY_ID[reactionId];
  const dir = lane === "gng" ? r.roles.find((x) => x.pathway === "gluconeogenesis")?.direction ?? "forward" : view === "gluconeogenesis" && lane === "shared" ? "reverse" : "forward";
  const net = reactionNet(r, dir);
  const parts: string[] = [];
  for (const [id, label] of [["atp", "ATP"], ["gtp", "GTP"], ["nadh", "NADH"], ["fadh2", "FADH₂"], ["co2", "CO₂"]] as const) { const v = net[id] ?? 0; if (v) parts.push(`${v > 0 ? "+" : "−"}${Math.abs(v) === 1 ? "" : Math.abs(v)}${label}`); }
  return parts.join(" ");
}
