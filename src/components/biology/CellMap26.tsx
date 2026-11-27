import { useId, type ReactNode } from "react";
import { COMPARTMENTS, compartmentOf, type CompartmentId } from "../../utils/biology/trafficking26";
import { SelG, Txt } from "./cell23";
import "../../styles/bio26.css";

/**
 * Schematic eukaryotic animal cell. Shapes are drawn at the same layout coordinates the transport graph uses (COMPARTMENTS), so a cargo's position,
 * the arrows between compartments and the organelle you select cannot disagree. Sizes and positions are schematic, not measured.
 */
export interface MapRoute {
  /** Locations in order, one per step taken (consecutive duplicates mean "no movement"). */
  at: CompartmentId[];
  /** Index of the current step. */
  current: number;
  /** Where the next, blocked step would have taken the cargo, if the route is blocked. */
  blockedAt?: CompartmentId | null;
}

const INK = "#0f172a", MUTE = "#475569", TEAL = "#0f766e", RED = "#b91c1c";
const FILL = { nuc: "#dbeafe", er: "#ede9fe", golgi: "#fef3c7", mito: "#fee2e2", lyso: "#dcfce7", endo: "#cffafe", perox: "#fae8ff", cyto: "#fffbeb", ves: "#e2e8f0" };
const C = (id: CompartmentId) => compartmentOf(id);

function bend(a: { x: number; y: number }, b: { x: number; y: number }, k = 0.16): string {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, dx = b.x - a.x, dy = b.y - a.y;
  return `M ${a.x} ${a.y} Q ${mx - dy * k} ${my + dx * k} ${b.x} ${b.y}`;
}
function shorten(a: { x: number; y: number }, b: { x: number; y: number }, by: number) {
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
  return { x: b.x - (dx / len) * by, y: b.y - (dy / len) * by };
}

function Sel({ id, name, selected, onSelect, children }: { id: string; name: string; selected: string | null; onSelect?: (id: string | null) => void; children: ReactNode }) {
  return onSelect ? <SelG id={id} label={name} onSelect={onSelect} selected={selected}>{children}</SelG> : <g>{children}</g>;
}

export function CellMap26({ selected, onSelect, route, label = "Schematic animal cell", highlight = [] }: {
  selected: string | null; onSelect?: (id: string | null) => void; route?: MapRoute; label?: string; highlight?: CompartmentId[];
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const ring = (id: string) => (selected === id ? { stroke: INK, strokeWidth: 4 } : {});
  const hl = (id: CompartmentId) => highlight.includes(id);

  // route arrows between consecutive distinct locations
  const moves: Array<{ from: CompartmentId; to: CompartmentId; step: number; blocked?: boolean }> = [];
  if (route) {
    for (let i = 1; i < route.at.length; i++) if (route.at[i] !== route.at[i - 1]) moves.push({ from: route.at[i - 1], to: route.at[i], step: i });
    if (route.blockedAt && route.at.length && route.blockedAt !== route.at[route.at.length - 1]) moves.push({ from: route.at[route.at.length - 1], to: route.blockedAt, step: route.at.length, blocked: true });
  }
  const cargoAt = route ? route.at[Math.min(route.current, route.at.length - 1)] : null;

  const stack = [0, 0.25, 0.5, 0.75, 1].map((t) => ({ cx: 525 + 80 * t, cy: 205 - 40 * t }));
  return (
    <svg aria-label={label} className="b26-cell" role="group" style={{ minWidth: 720 }} viewBox="0 0 900 580">
      <title>{label}</title>
      <defs>
        <marker id={`${uid}-ok`} markerHeight="9" markerWidth="9" orient="auto" refX="7" refY="4.5" viewBox="0 0 9 9"><path d="M0 0.5 L8 4.5 L0 8.5 z" fill={TEAL} /></marker>
        <marker id={`${uid}-no`} markerHeight="9" markerWidth="9" orient="auto" refX="7" refY="4.5" viewBox="0 0 9 9"><path d="M0 0.5 L8 4.5 L0 8.5 z" fill={RED} /></marker>
        <marker id={`${uid}-fu`} markerHeight="9" markerWidth="9" orient="auto" refX="7" refY="4.5" viewBox="0 0 9 9"><path d="M0 0.5 L8 4.5 L0 8.5 z" fill="#64748b" /></marker>
      </defs>
      <rect fill="#ffffff" height="580" width="900" />
      <rect fill="#f1f5f9" height="540" width="100" x="800" y="20" />
      <Txt anchor="middle" fill={MUTE} size={12} x={850} y={40}>Outside</Txt>
      <Txt anchor="middle" fill={MUTE} size={12} x={850} y={56}>the cell</Txt>

      {/* plasma membrane and cytosol */}
      <Sel onSelect={onSelect} selected={selected} id="cytosol" name="Cytoplasm and cytosol">
        <rect fill={FILL.cyto} height="540" rx="70" width="780" x="20" y="20" />
      </Sel>
      <Sel onSelect={onSelect} selected={selected} id="plasma-membrane" name="Plasma membrane">
        <rect fill="none" height="540" rx="70" stroke={selected === "plasma-membrane" ? INK : "#92400e"} strokeWidth={selected === "plasma-membrane" ? 8 : 5} width="780" x="20" y="20" />
      </Sel>
      <Txt anchor="start" bold fill="#92400e" size={12} x={84} y={46}>Plasma membrane</Txt>
      <Txt anchor="start" fill={MUTE} italic size={12} x={84} y={64}>Cytosol (between the organelles)</Txt>

      {/* cytoskeleton */}
      <Sel onSelect={onSelect} selected={selected} id="cytoskeleton" name="Cytoskeletal elements (microtubules)">
        <g fill="none" stroke={selected === "cytoskeleton" ? INK : "#94a3b8"} strokeDasharray="2 5" strokeLinecap="round" strokeWidth={selected === "cytoskeleton" ? 5 : 3}>
          <path d="M 300 330 C 400 330 520 320 640 270" /><path d="M 280 300 C 400 380 560 420 660 400" /><path d="M 300 200 C 420 160 560 120 690 120" />
        </g>
        <Txt anchor="start" fill={MUTE} size={11} x={560} y={395}>microtubules</Txt>
      </Sel>

      {/* nucleus */}
      <Sel onSelect={onSelect} selected={selected} id="nucleus" name="Nucleus">
        <circle cx="170" cy="220" fill={FILL.nuc} r="104" {...ring("nucleus")} stroke={selected === "nucleus" ? INK : "#1d4ed8"} strokeWidth={selected === "nucleus" ? 4 : 2} />
        <path d="M 120 190 q 20 -20 40 0 t 40 0 M 110 230 q 25 -20 50 0 t 50 0 M 130 265 q 20 -15 40 0 t 40 0" fill="none" stroke="#93c5fd" strokeWidth="2.5" />
        <Txt bold size={13} x={170} y={178}>Nucleus</Txt>
      </Sel>
      <Sel onSelect={onSelect} selected={selected} id="nuclear-envelope" name="Nuclear envelope">
        <circle cx="170" cy="220" fill="none" r="112" stroke={selected === "nuclear-envelope" ? INK : "#1d4ed8"} strokeWidth={selected === "nuclear-envelope" ? 5 : 3} />
      </Sel>
      <Txt anchor="end" fill="#1d4ed8" size={11} x={120} y={118}>Nuclear envelope</Txt>
      <Sel onSelect={onSelect} selected={selected} id="nuclear-pore" name="Nuclear pore complex">
        {[[170, 108], [281, 215], [250, 290], [90, 300], [250, 150]].map(([x, y], i) => <circle cx={x} cy={y} fill="#ffffff" key={i} r={7} stroke={selected === "nuclear-pore" ? INK : "#1d4ed8"} strokeWidth={selected === "nuclear-pore" ? 4 : 2} />)}
        <Txt anchor="start" fill="#1d4ed8" size={11} x={286} y={236}>pore</Txt>
      </Sel>

      {/* rough and smooth ER */}
      <Sel onSelect={onSelect} selected={selected} id="rough-er" name="Rough endoplasmic reticulum">
        {[165, 200, 235, 270, 305].map((y) => (
          <g key={y}>
            <rect fill={FILL.er} height="20" rx="10" stroke={selected === "rough-er" ? INK : "#6d28d9"} strokeWidth={selected === "rough-er" ? 4 : 2} width="125" x="332" y={y} />
            {[345, 372, 399, 426].map((x) => <circle cx={x} cy={y - 3} fill="#334155" key={x} r={2.6} />)}
          </g>
        ))}
        <path d="M 282 215 L 332 215" stroke="#6d28d9" strokeWidth="3" />
        <Txt anchor="start" bold fill="#5b21b6" size={12} x={335} y={152}>Rough ER</Txt>
      </Sel>
      <Sel onSelect={onSelect} selected={selected} id="smooth-er" name="Smooth endoplasmic reticulum">
        <path d="M 400 458 C 430 443 445 478 475 463 S 515 478 535 463 M 420 485 C 450 475 465 505 495 491" fill="none" stroke={selected === "smooth-er" ? INK : "#7c3aed"} strokeLinecap="round" strokeWidth={selected === "smooth-er" ? 8 : 6} />
        <Txt anchor="start" fill="#5b21b6" size={11} x={440} y={522}>Smooth ER</Txt>
      </Sel>

      {/* Golgi */}
      <Sel onSelect={onSelect} selected={selected} id="golgi" name="Golgi apparatus">
        {stack.map((s, i) => <line key={i} stroke={selected === "golgi" ? INK : "#b45309"} strokeLinecap="round" strokeWidth={selected === "golgi" ? 9 : 7} x1={s.cx - 12.5} x2={s.cx + 12.5} y1={s.cy - 25} y2={s.cy + 25} />)}
        <Txt anchor="start" bold fill="#92400e" size={12} x={505} y={252}>Golgi apparatus</Txt>
        <Txt anchor="middle" fill="#92400e" size={11} x={518} y={178}>cis</Txt>
        <Txt anchor="middle" fill="#92400e" size={11} x={565} y={150}>medial</Txt>
        <Txt anchor="middle" fill="#92400e" size={11} x={610} y={132}>trans</Txt>
      </Sel>

      {/* mitochondrion */}
      <Sel onSelect={onSelect} selected={selected} id="mitochondrion" name="Mitochondrion">
        <ellipse cx="175" cy="480" fill={FILL.mito} rx="85" ry="38" stroke={selected === "mitochondrion" ? INK : "#b91c1c"} strokeWidth={selected === "mitochondrion" ? 5 : 3} />
        <ellipse cx="175" cy="480" fill="#fecaca" rx="72" ry="26" stroke="#b91c1c" strokeWidth="2" />
        <path d="M 130 460 v 16 M 150 502 v -16 M 175 458 v 18 M 200 504 v -18 M 220 460 v 16" stroke="#b91c1c" strokeWidth="2" />
        <Txt bold size={12} x={175} y={531}>Mitochondrion</Txt>
      </Sel>

      {/* endosomes, lysosome, peroxisome */}
      <Sel onSelect={onSelect} selected={selected} id="endosome" name="Endosomes">
        <ellipse cx={722} cy={335} fill={FILL.endo} rx="28" ry="18" stroke={selected === "endosome" ? INK : "#0e7490"} strokeWidth={selected === "endosome" ? 4 : 2} />
        <ellipse cx={670} cy={405} fill={FILL.endo} rx="30" ry="20" stroke={selected === "endosome" ? INK : "#0e7490"} strokeWidth={selected === "endosome" ? 4 : 2} />
        <Txt anchor="start" size={11} x={700} y={316}>Early endosome</Txt>
        <Txt anchor="end" size={11} x={640} y={440}>Late endosome</Txt>
      </Sel>
      <Sel onSelect={onSelect} selected={selected} id="lysosome" name="Lysosome">
        <circle cx={590} cy={485} fill={FILL.lyso} r="22" stroke={selected === "lysosome" ? INK : "#15803d"} strokeWidth={selected === "lysosome" ? 5 : 3} />
        {[[582, 480], [598, 478], [590, 494]].map(([x, y], i) => <circle cx={x} cy={y} fill="#15803d" key={i} r={2.5} />)}
        <Txt bold size={12} x={590} y={528}>Lysosome</Txt>
      </Sel>
      <Sel onSelect={onSelect} selected={selected} id="peroxisome" name="Peroxisome">
        <circle cx={350} cy={510} fill={FILL.perox} r="18" stroke={selected === "peroxisome" ? INK : "#a21caf"} strokeWidth={selected === "peroxisome" ? 5 : 3} />
        <Txt size={11} x={350} y={546}>Peroxisome</Txt>
      </Sel>
      <Sel onSelect={onSelect} selected={selected} id="ribosomes" name="Ribosomes (free in the cytosol)">
        {[[270, 400], [285, 415], [262, 422], [300, 395], [292, 432]].map(([x, y], i) => <circle cx={x} cy={y} fill="#334155" key={i} r={3.4} stroke={selected === "ribosomes" ? INK : "none"} strokeWidth="2" />)}
        <Txt anchor="start" size={11} x={300} y={445}>free ribosomes</Txt>
      </Sel>

      {/* transport carriers and the proteasome (drawn at the layout positions) */}
      {COMPARTMENTS.filter((c) => c.kind === "vesicle").map((c) => (
        <g key={c.id}><circle cx={c.x} cy={c.y} fill={hl(c.id) ? "#fde68a" : FILL.ves} r="9" stroke="#475569" strokeDasharray={c.id === "v-clathrin" || c.id === "v-endocytic" ? "3 2" : undefined} strokeWidth="2" /></g>
      ))}
      <rect fill="#e2e8f0" height="18" rx="9" stroke="#475569" strokeWidth="2" width="40" x={460} y={401} />
      <Txt anchor="start" size={11} x={508} y={414}>proteasome</Txt>
      <Txt anchor="middle" fill={MUTE} size={11} x={470} y={196}>COPII</Txt>
      <Txt anchor="start" fill={MUTE} size={11} x={482} y={306}>COPI (retrograde)</Txt>
      <Txt anchor="start" fill={MUTE} size={11} x={682} y={100}>secretory carrier</Txt>

      {/* route */}
      {moves.map((m) => {
        const a = C(m.from), b = C(m.to);
        const reached = route ? m.step <= route.current : false;
        const end = shorten(a, b, 12);
        const d = bend(a, end);
        const color = m.blocked ? RED : reached ? TEAL : "#64748b";
        const mk = m.blocked ? "no" : reached ? "ok" : "fu";
        const mx = (a.x + b.x) / 2 - (b.y - a.y) * 0.08, my = (a.y + b.y) / 2 + (b.x - a.x) * 0.08;
        return (
          <g key={`${m.from}-${m.to}-${m.step}`}>
            <path d={d} fill="none" markerEnd={`url(#${uid}-${mk})`} opacity={reached || m.blocked ? 1 : 0.7} stroke={color} strokeDasharray={reached ? undefined : "6 4"} strokeWidth={reached ? 4 : 2.5} />
            <circle cx={mx} cy={my} fill="#ffffff" r="9" stroke={color} strokeWidth="2" />
            <Txt bold fill={INK} size={11} x={mx} y={my + 4}>{m.blocked ? "✕" : String(m.step)}</Txt>
          </g>
        );
      })}
      {cargoAt ? (
        <g data-testid="cargo-marker">
          <circle cx={C(cargoAt).x} cy={C(cargoAt).y} fill="#fde047" r="11" stroke={INK} strokeWidth="3.5" />
          <Txt bold size={11} x={C(cargoAt).x} y={C(cargoAt).y + 4}>P</Txt>
        </g>
      ) : null}
    </svg>
  );
}
