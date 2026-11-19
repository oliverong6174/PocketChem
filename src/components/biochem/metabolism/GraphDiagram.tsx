import { useId, type KeyboardEvent } from "react";

/**
 * A small, dependency-free SVG graph used by the Stage 25 laboratories: compartment bands, labelled boxes and arrows with explicit direction.
 * Everything is described by data built from the shared network (see diagramSpecs25.ts), so diagram and ledger cannot disagree. Nodes and arrows are
 * keyboard-operable buttons when a handler is given. Text sizes are fixed in viewBox units and the SVG keeps `minWidth`, so on narrow screens the
 * diagram scrolls sideways inside its frame instead of shrinking to illegible text.
 */
export type NodeKind = "carbon" | "shared" | "nitrogen" | "lipid" | "ketone" | "product" | "enzyme" | "carrier" | "pathway" | "plain";
export type Visual = "done" | "active" | "future" | "dim" | "normal";
export interface GNode { id: string; x: number; y: number; w: number; h: number; lines: string[]; kind?: NodeKind; state?: Visual; selected?: boolean; aria?: string; badge?: string; badgeKind?: "nitrogen-nh4" | "nitrogen-asp" | "nitrogen-orn" }
export interface GEdge { id: string; from: string; to: string; via?: Array<[number, number]>; label?: string; labelPos?: [number, number]; kind?: "main" | "transport" | "cofactor" | "link" | "regulation"; state?: Visual; selected?: boolean; aria?: string; both?: boolean; noArrow?: boolean }
export interface GBand { id: string; x: number; y: number; w: number; h: number; label: string; tone?: "a" | "b" | "c" | "d" | "e" }
export interface GText { x: number; y: number; text: string; anchor?: "start" | "middle" | "end"; weight?: number; size?: number; fill?: string }

const INK = "#0f172a", MUTED = "#475569", PAPER = "#ffffff";
const FILL: Record<NodeKind, [string, string]> = {
  carbon: ["#f8fafc", "#334155"], shared: ["#ecfeff", "#0e7490"], nitrogen: ["#eff6ff", "#1d4ed8"], lipid: ["#fefce8", "#a16207"], ketone: ["#fff7ed", "#c2410c"],
  product: ["#f0fdf4", "#15803d"], enzyme: ["#faf5ff", "#6d28d9"], carrier: ["#f1f5f9", "#64748b"], pathway: ["#f8fafc", "#334155"], plain: ["#ffffff", "#94a3b8"],
};
const BAND: Record<NonNullable<GBand["tone"]>, string> = { a: "#f1f5f9", b: "#ecfdf5", c: "#fefce8", d: "#eff6ff", e: "#faf5ff" };
const EDGE: Record<NonNullable<GEdge["kind"]>, string> = { main: "#0f172a", transport: "#6d28d9", cofactor: "#64748b", link: "#0e7490", regulation: "#b91c1c" };
const N_COLOR = { "nitrogen-nh4": "#1d4ed8", "nitrogen-asp": "#c2410c", "nitrogen-orn": "#15803d" };

function clip(n: GNode, tx: number, ty: number): [number, number] {
  const cx = n.x + n.w / 2, cy = n.y + n.h / 2, dx = tx - cx, dy = ty - cy;
  if (dx === 0 && dy === 0) return [cx, cy];
  const sx = dx === 0 ? Infinity : (n.w / 2 + 3) / Math.abs(dx), sy = dy === 0 ? Infinity : (n.h / 2 + 3) / Math.abs(dy);
  const s = Math.min(sx, sy);
  return [cx + dx * s, cy + dy * s];
}
const centre = (n: GNode): [number, number] => [n.x + n.w / 2, n.y + n.h / 2];
const key = (fn?: () => void) => (e: KeyboardEvent) => { if (fn && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); fn(); } };

export function GraphDiagram({ width, height, nodes, edges, bands = [], texts = [], label, onNode, onEdge, minWidth, className = "" }: {
  width: number; height: number; nodes: GNode[]; edges: GEdge[]; bands?: GBand[]; texts?: GText[]; label: string;
  onNode?: (id: string) => void; onEdge?: (id: string) => void; minWidth?: number; className?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const marker = (c: string, k: string) => (
    <marker id={`${uid}-${k}`} markerHeight="7" markerWidth="7" orient="auto-start-reverse" refX="6" refY="3.5" viewBox="0 0 7 7"><path d="M0 0 L7 3.5 L0 7 z" fill={c} /></marker>
  );
  const opacity = (s?: Visual) => (s === "dim" ? 0.35 : s === "future" ? 0.6 : 1);
  return (
    <svg aria-label={label} className={`mt-svg ${className}`} role="group" style={{ minWidth: minWidth ?? width }} viewBox={`0 0 ${width} ${height}`}>
      <title>{label}</title>
      <defs>{(Object.keys(EDGE) as Array<keyof typeof EDGE>).map((k) => marker(EDGE[k], k))}{marker(INK, "sel")}</defs>
      <rect fill={PAPER} height={height} width={width} />
      {bands.map((b) => (
        <g key={b.id}>
          <rect fill={BAND[b.tone ?? "a"]} height={b.h} rx={8} stroke="#cbd5e1" width={b.w} x={b.x} y={b.y} />
          <text fill={MUTED} fontSize={13} fontWeight={700} x={b.x + 10} y={b.y + 18}>{b.label}</text>
        </g>
      ))}
      {texts.map((t, i) => <text fill={t.fill ?? MUTED} fontSize={t.size ?? 12} fontWeight={t.weight ?? 400} key={i} textAnchor={t.anchor ?? "start"} x={t.x} y={t.y}>{t.text}</text>)}
      {edges.map((e) => {
        const a = byId[e.from], b = byId[e.to];
        if (!a || !b) return null;
        const mids = e.via ?? [];
        const first = mids[0] ?? centre(b), last = mids[mids.length - 1] ?? centre(a);
        const p0 = clip(a, first[0], first[1]), p1 = clip(b, last[0], last[1]);
        const pts = [p0, ...mids, p1];
        const d = pts.map((p, i) => `${i ? "L" : "M"} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
        const kind = e.kind ?? "main", color = e.selected ? INK : EDGE[kind];
        const mk = e.selected ? "sel" : kind;
        // label at the midpoint of the longest segment unless a position is given
        let lp = e.labelPos;
        if (!lp) { let best = 0, bi = 0; for (let i = 0; i < pts.length - 1; i++) { const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); if (l > best) { best = l; bi = i; } } lp = [(pts[bi][0] + pts[bi + 1][0]) / 2, (pts[bi][1] + pts[bi + 1][1]) / 2 - 5]; }
        const dashed = e.state === "future" || kind === "regulation";
        const inner = (
          <>
            {onEdge ? <path d={d} fill="none" stroke="transparent" strokeWidth={16} /> : null}
            <path d={d} fill="none" markerEnd={e.noArrow || kind === "link" ? undefined : `url(#${uid}-${mk})`} markerStart={e.both ? `url(#${uid}-${mk})` : undefined} opacity={opacity(e.state)} stroke={color} strokeDasharray={dashed ? "6 4" : undefined} strokeWidth={e.selected || e.state === "active" ? 3.5 : 2} />
            {e.label ? <text fill={INK} fontSize={12} fontWeight={e.selected ? 700 : 500} opacity={opacity(e.state)} paintOrder="stroke" stroke={PAPER} strokeLinejoin="round" strokeWidth={9} textAnchor="middle" x={lp[0]} y={lp[1]}>{e.label}</text> : null}
          </>
        );
        return onEdge ? (
          <g aria-label={e.aria ?? e.label ?? e.id} aria-pressed={!!e.selected} className="mt-hit" data-testid={`edge-${e.id}`} key={e.id} onClick={() => onEdge(e.id)} onKeyDown={key(() => onEdge(e.id))} role="button" tabIndex={0}>{inner}</g>
        ) : <g key={e.id}>{inner}</g>;
      })}
      {nodes.map((n) => {
        const [fill, stroke] = FILL[n.kind ?? "carbon"];
        const lineH = 16, top = n.y + n.h / 2 - ((n.lines.length - 1) * lineH) / 2 + 4;
        const inner = (
          <>
            <rect fill={n.state === "active" ? "#ccfbf1" : fill} height={n.h} opacity={opacity(n.state)} rx={n.kind === "enzyme" ? n.h / 2 : 8} stroke={n.selected ? INK : stroke} strokeDasharray={n.state === "future" ? "5 3" : undefined} strokeWidth={n.selected || n.state === "active" ? 4 : 2} width={n.w} x={n.x} y={n.y} />
            {n.lines.map((t, i) => <text fill={INK} fontSize={13} fontWeight={i === 0 ? 700 : 400} key={i} opacity={opacity(n.state)} textAnchor="middle" x={n.x + n.w / 2} y={top + i * lineH}>{t}</text>)}
            {n.badge ? (
              <g>
                <circle cx={n.x + n.w - 6} cy={n.y + 2} fill={n.badgeKind ? N_COLOR[n.badgeKind] : INK} r={11} />
                <text fill="#fff" fontSize={11} fontWeight={700} textAnchor="middle" x={n.x + n.w - 6} y={n.y + 6}>{n.badge}</text>
              </g>
            ) : null}
          </>
        );
        return onNode ? (
          <g aria-label={n.aria ?? n.lines.join(" ")} aria-pressed={!!n.selected} className="mt-hit" data-testid={`node-${n.id}`} key={n.id} onClick={() => onNode(n.id)} onKeyDown={key(() => onNode(n.id))} role="button" tabIndex={0}>{inner}</g>
        ) : <g key={n.id}>{inner}</g>;
      })}
    </svg>
  );
}

/** Colour-independent key for the standard arrow kinds. */
export function GraphLegend({ items }: { items: Array<{ color: string; text: string; dashed?: boolean }> }) {
  return <ul className="mt-legend">{items.map((i) => <li key={i.text}><i style={{ borderTopColor: i.color, borderTopStyle: i.dashed ? "dashed" : "solid" }} />{i.text}</li>)}</ul>;
}
export const EDGE_COLORS = EDGE;
