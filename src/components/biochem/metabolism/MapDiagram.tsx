import { METABOLITES_BY_ID, PATHWAYS, type PathwayId } from "../../../utils/biochem/metabolism/network";

/** Pathway-level map: metabolite nodes (shared identities) and pathway boxes, with the carriers each arrow transfers. */
interface MapNode { id: string; kind: "met" | "path" | "info"; met?: string; path?: PathwayId; x: number; y: number; w: number; label: string; sub?: string }
const INK = "#0f172a", MUTED = "#475569", TEAL = "#0e7490", AMBER = "#b45309", VIOLET = "#6d28d9";

export interface MapLabels { glycolysis: string; pdh: string; tca: string; etc: string; atp: string; co2: string }
export function MapDiagram({ labels, pathway, metabolite, badges, onPath, onMet }: {
  labels: MapLabels; pathway: PathwayId | null; metabolite: string | null; badges: Partial<Record<PathwayId, string>>; onPath: (p: PathwayId) => void; onMet: (m: string) => void;
}) {
  const N: MapNode[] = [
    { id: "glucose", kind: "met", met: "glucose", x: 72, y: 96, w: 116, label: "Glucose", sub: "C6" },
    { id: "glycolysis", kind: "path", path: "glycolysis", x: 245, y: 96, w: 136, label: "Glycolysis", sub: "cytosol" },
    { id: "pyruvate", kind: "met", met: "pyruvate", x: 398, y: 96, w: 104, label: "Pyruvate", sub: "C3" },
    { id: "pdh", kind: "path", path: "pyruvate-oxidation", x: 610, y: 96, w: 168, label: "Pyruvate oxidation", sub: "matrix" },
    { id: "acetylcoa", kind: "met", met: "acetylcoa", x: 840, y: 96, w: 116, label: "Acetyl-CoA", sub: "C2" },
    { id: "gng", kind: "path", path: "gluconeogenesis", x: 245, y: 236, w: 170, label: "Gluconeogenesis", sub: "matrix · cytosol · ER" },
    { id: "oaa", kind: "met", met: "oaa", x: 560, y: 236, w: 124, label: "Oxaloacetate", sub: "C4" },
    { id: "tca", kind: "path", path: "tca", x: 840, y: 236, w: 160, label: "Citric acid cycle", sub: "matrix" },
    { id: "atp", kind: "info", x: 258, y: 420, w: 190, label: "ATP", sub: labels.atp },
    { id: "etc", kind: "path", path: "oxphos", x: 612, y: 420, w: 230, label: "Electron transport + ATP synthase", sub: "inner membrane" },
    { id: "carriers", kind: "info", x: 842, y: 420, w: 150, label: "NADH · FADH₂", sub: "reduced carriers" },
  ];
  const by = Object.fromEntries(N.map((n) => [n.id, n]));
  const H = 50;
  const edge = (a: string, b: string, label: string, opts: { color?: string; dash?: boolean; fx?: number; fy?: number; tx?: number; ty?: number; lx?: number; ly?: number; anchor?: "start" | "middle" | "end"; both?: boolean } = {}) => {
    const A = by[a], B = by[b];
    const horizontal = Math.abs(A.y - B.y) < 10;
    const fx = opts.fx ?? (horizontal ? A.x + (B.x > A.x ? A.w / 2 : -A.w / 2) : A.x), fy = opts.fy ?? (horizontal ? A.y : A.y + (B.y > A.y ? H / 2 : -H / 2));
    const tx = opts.tx ?? (horizontal ? B.x + (B.x > A.x ? -B.w / 2 : B.w / 2) : B.x), ty = opts.ty ?? (horizontal ? B.y : B.y + (B.y > A.y ? -H / 2 : H / 2));
    const color = opts.color ?? TEAL;
    return (
      <g aria-hidden="true" key={`${a}-${b}`}>
        <path d={`M ${fx} ${fy} L ${tx} ${ty}`} fill="none" markerEnd={`url(#mt-map-${color.slice(1)})`} markerStart={opts.both ? `url(#mt-map-${color.slice(1)})` : undefined} stroke={color} strokeDasharray={opts.dash ? "6 4" : undefined} strokeWidth={2.5} />
        {label ? <text fill={INK} fontSize={13} fontWeight={700} paintOrder="stroke" stroke="#fff" strokeWidth={4} textAnchor={opts.anchor ?? "middle"} x={opts.lx ?? (fx + tx) / 2} y={opts.ly ?? (fy + ty) / 2 - 8}>{label}</text> : null}
      </g>
    );
  };
  return (
    <svg aria-label="Integrated metabolic map from glucose to oxidative phosphorylation" className="mt-svg mt-map" data-testid="map-diagram" role="group" style={{ minWidth: 760 }} viewBox="0 0 960 520">
      <title>Integrated metabolic map</title>
      <defs>
        {[TEAL, AMBER, VIOLET].map((c) => <marker id={`mt-map-${c.slice(1)}`} key={c} markerHeight="7" markerWidth="7" orient="auto-start-reverse" refX="6" refY="3.5" viewBox="0 0 7 7"><path d="M0 0 L7 3.5 L0 7 z" fill={c} /></marker>)}
      </defs>
      <rect fill="#fff" height={520} width={960} />
      <rect fill="#f0fdfa" height={462} rx={10} stroke="#5eead4" strokeDasharray="6 4" width={470} x={478} y={14} />
      <text fill={TEAL} fontSize={13} fontWeight={700} x={490} y={36}>Mitochondrion</text>
      <text fill={MUTED} fontSize={13} fontWeight={700} x={12} y={26}>Cytosol</text>
      {edge("glucose", "glycolysis", "")}
      {edge("glycolysis", "pyruvate", labels.glycolysis, { ly: 50, lx: 322 })}
      {edge("pyruvate", "pdh", "pyruvate carrier", { ly: 50, lx: 492 })}
      {edge("pdh", "acetylcoa", labels.pdh, { ly: 50, lx: 735 })}
      {edge("acetylcoa", "tca", "", { fx: 840, fy: 121, tx: 840, ty: 211 })}
      {edge("tca", "carriers", labels.tca, { fx: 840, fy: 261, tx: 842, ty: 395, lx: 828, ly: 330, anchor: "end" })}
      {edge("carriers", "etc", "reoxidized", { ly: 386, lx: 747 })}
      {edge("etc", "atp", labels.etc, { ly: 408, lx: 440 })}
      {edge("pyruvate", "gng", "", { color: VIOLET, dash: true, fx: 372, fy: 121, tx: 300, ty: 211 })}
      {edge("gng", "glucose", "", { color: VIOLET, dash: true, fx: 190, fy: 211, tx: 88, ty: 121 })}
      {edge("oaa", "gng", "via malate → PEP", { color: VIOLET, dash: true, ly: 222, lx: 410 })}
      {edge("tca", "oaa", "OAA regenerated", { color: AMBER, ly: 222, lx: 688, both: true })}
      <text fill="#9a3412" fontSize={13} fontWeight={700} x={858} y={332}>{labels.co2}</text>
      <text fill={VIOLET} fontSize={12.5} fontWeight={700} x={14} y={320}>Dashed violet: gluconeogenic route (bypasses of PK, PFK-1, HK)</text>
      {N.map((n) => {
        const isPath = n.kind === "path", isMet = n.kind === "met";
        const selected = (isPath && pathway === n.path) || (isMet && metabolite === n.met);
        const badge = isPath ? badges[n.path!] : undefined;
        const body = (
          <>
            <rect fill={isPath ? "#f0f9ff" : isMet ? "#fffbeb" : "#f1f5f9"} height={H} rx={isPath ? 12 : 25} stroke={selected ? INK : isPath ? "#0369a1" : isMet ? "#b45309" : "#64748b"} strokeWidth={selected ? 4 : 2} width={n.w} x={n.x - n.w / 2} y={n.y - H / 2} />
            <text fill={INK} fontSize={n.label.length > 22 ? 12.5 : 14} fontWeight={700} textAnchor="middle" x={n.x} y={n.y - 2}>{n.label}</text>
            <text fill={MUTED} fontSize={11.5} textAnchor="middle" x={n.x} y={n.y + 15}>{n.sub}</text>
            {badge ? <text fill="#7c2d12" fontSize={12.5} fontWeight={800} textAnchor="middle" x={n.x} y={n.y + H / 2 + 16}>{badge}</text> : null}
          </>
        );
        if (n.kind === "info") return <g aria-label={`${n.label}: ${n.sub}`} key={n.id} role="img">{body}</g>;
        return (
          <g
            aria-label={isPath ? PATHWAYS[n.path!].label : METABOLITES_BY_ID[n.met!].name} aria-pressed={selected} className="mt-hit" data-testid={`map-${n.id}`} key={n.id} role="button" tabIndex={0}
            onClick={() => (isPath ? onPath(n.path!) : onMet(n.met!))}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (isPath) onPath(n.path!); else onMet(n.met!); } }}
          >{body}</g>
        );
      })}
      <text fill={MUTED} fontSize={12} x={12} y={506}>Boxes: pathways. Rounded ends: shared metabolites (the same entity in every tool). Arrow labels are net stoichiometric changes per glucose.</text>
    </svg>
  );
}
