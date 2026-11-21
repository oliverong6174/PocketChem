/**
 * Pure layered layout for the Stage 26 regulatory diagrams. Nodes are placed in rows by their longest dependency depth (sources at the top) and
 * ordered inside a row by the average position of their neighbours, so arrows mostly run between neighbouring rows. Everything is derived from the
 * graph itself: there are no hand-placed coordinates that could disagree with the model.
 */
export interface LNode { id: string; w: number; h: number }
export interface LEdge { from: string; to: string }
export interface Layout { pos: Record<string, { x: number; y: number }>; width: number; height: number; depth: Record<string, number> }

export function layeredLayout(nodes: LNode[], edges: LEdge[], gapX = 34, gapY = 54, pad = 14): Layout {
  const ids = new Set(nodes.map((n) => n.id));
  const es = edges.filter((e) => ids.has(e.from) && ids.has(e.to) && e.from !== e.to);
  const preds = new Map<string, string[]>(), succs = new Map<string, string[]>();
  for (const n of nodes) { preds.set(n.id, []); succs.set(n.id, []); }
  for (const e of es) { preds.get(e.to)!.push(e.from); succs.get(e.from)!.push(e.to); }
  const depth: Record<string, number> = {};
  const visiting = new Set<string>();
  const d = (id: string): number => {
    if (id in depth) return depth[id];
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const p = preds.get(id)!;
    depth[id] = p.length ? 1 + Math.max(...p.map(d)) : 0;
    visiting.delete(id);
    return depth[id];
  };
  nodes.forEach((n) => d(n.id));
  // pure inputs sit one row above their earliest consumer, so a long arrow never runs through unrelated boxes
  for (const n of nodes) { const out = succs.get(n.id)!; if (!preds.get(n.id)!.length && out.length) depth[n.id] = Math.min(...out.map((x) => depth[x])) - 1; }
  const lowest = Math.min(...Object.values(depth), 0);
  for (const k of Object.keys(depth)) depth[k] -= lowest;
  const layers: string[][] = [];
  for (const n of nodes) (layers[depth[n.id]] ??= []).push(n.id);
  for (let i = 0; i < layers.length; i++) layers[i] ??= [];
  const order = new Map<string, number>();
  layers.forEach((l) => l.forEach((id, i) => order.set(id, i)));
  const bary = (id: string, nbrs: Map<string, string[]>) => { const n = nbrs.get(id)!; return n.length ? n.reduce((a, b) => a + (order.get(b) ?? 0), 0) / n.length : order.get(id)!; };
  for (let pass = 0; pass < 4; pass++) {
    const down = pass % 2 === 0;
    const seq = down ? layers.map((_, i) => i) : layers.map((_, i) => layers.length - 1 - i);
    for (const li of seq) {
      const l = layers[li];
      const key = new Map(l.map((id) => [id, bary(id, down ? preds : succs)]));
      l.sort((a, b) => key.get(a)! - key.get(b)! || order.get(a)! - order.get(b)!);
      l.forEach((id, i) => order.set(id, i));
    }
  }
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const rowW = layers.map((l) => l.reduce((a, id) => a + byId.get(id)!.w, 0) + Math.max(0, l.length - 1) * gapX);
  const width = Math.max(...rowW, 0) + pad * 2;
  const pos: Record<string, { x: number; y: number }> = {};
  let y = pad;
  layers.forEach((l, li) => {
    const rowH = Math.max(0, ...l.map((id) => byId.get(id)!.h));
    let x = pad + (width - pad * 2 - rowW[li]) / 2;
    for (const id of l) { const n = byId.get(id)!; pos[id] = { x, y: y + (rowH - n.h) / 2 }; x += n.w + gapX; }
    y += rowH + gapY;
  });
  return { pos, width, height: y - gapY + pad, depth };
}

/** Breaks a label into lines of at most `max` characters, at spaces. */
export function wrapLabel(text: string, max = 26): string[] {
  const out: string[] = [];
  let line = "";
  for (const w of text.split(" ")) {
    if (line && (line + " " + w).length > max) { out.push(line); line = w; } else line = line ? `${line} ${w}` : w;
  }
  if (line) out.push(line);
  return out;
}

/** Colour-independent key for the two arrow kinds of the regulatory diagrams. */
export const REG_LEGEND = [
  { color: "#0f172a", text: "arrow: activates or is required by" },
  { color: "#b91c1c", text: "red bar: inhibits", dashed: true },
];
