import { useRef } from "react";
import { lewisLayout, type LewisReport, type LewisState, type MoleculeDef } from "../../utils/generalChem/lewis28";
import { angleBetween, rotate, type BondDipole, type Vec3, type VseprGeometry } from "../../utils/generalChem/vsepr28";

const INK = "#0f172a";
const SLATE = "#475569";
const TEAL = "#0b6a72";
const AMBER = "#b45309";
const RED = "#be123c";
const PURPLE = "#6d28d9";
const BLUE = "#1d4ed8";

// ---- Lewis diagram ---------------------------------------------------------------------------------------------------------------------

const deg = (rad: number) => ((rad * 180) / Math.PI + 360) % 360;

/** Lone pairs and formal charge labels are placed in the free angular gaps around each atom. */
function freeAngles(taken: number[], count: number): number[] {
  const chosen: number[] = [];
  const cands = Array.from({ length: 12 }, (_, i) => i * 30);
  const dist = (a: number, b: number) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
  for (let k = 0; k < count; k++) {
    let best = cands[0]; let bestScore = -1;
    for (const c of cands) {
      const all = [...taken, ...chosen];
      const score = all.length ? Math.min(...all.map((a) => dist(a, c))) : 360;
      if (score > bestScore) { bestScore = score; best = c; }
    }
    chosen.push(best);
  }
  return chosen;
}

export function LewisDiagram({ mol, state, report, showCharges }: { mol: MoleculeDef; state: LewisState; report: LewisReport; showCharges: boolean }) {
  const W = 440; const H = 330; const pad = 70;
  const pts = lewisLayout(mol);
  const xs = pts.map((p) => p[0]); const ys = pts.map((p) => p[1]);
  const spanX = Math.max(1, Math.max(...xs) - Math.min(...xs)); const spanY = Math.max(1, Math.max(...ys) - Math.min(...ys));
  const S = Math.min(95, (W - 2 * pad) / spanX, (H - 2 * pad) / spanY);
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2; const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
  const P = pts.map((p) => ({ x: W / 2 + (p[0] - cx) * S, y: H / 2 - (p[1] - cy) * S }));
  const bondAngles = mol.atoms.map((_, i) => mol.bonds.filter((b) => b[0] === i || b[1] === i).map((b) => { const o = b[0] === i ? b[1] : b[0]; return deg(Math.atan2(-(P[o].y - P[i].y), P[o].x - P[i].x)); }));
  const desc = `Lewis structure of ${mol.name}, ${mol.formula}: ${mol.bonds.map((b, k) => `${mol.atoms[b[0]]}${b[0] + 1} ${state.bondOrders[k] === 1 ? "single" : state.bondOrders[k] === 2 ? "double" : "triple"} bond to ${mol.atoms[b[1]]}${b[1] + 1}`).join(", ")}. Lone pairs: ${mol.atoms.map((a, i) => `${a}${i + 1} ${state.lonePairs[i]}`).join(", ")}. Formal charges: ${report.valid ? report.atoms.map((a) => `${a.el}${a.index + 1} ${a.formalCharge}`).join(", ") : "not available"}.`;
  return (
    <div className="ph-diagram">
      <svg aria-label={desc} className="ph-svg" data-testid="lewis-svg" height={H} role="img" viewBox={`0 0 ${W} ${H}`} width={W}>
        <rect className="ph-paper" height={H} width={W} />
        {mol.bonds.map((b, k) => {
          const a = P[b[0]]; const c = P[b[1]]; const dx = c.x - a.x; const dy = c.y - a.y; const len = Math.hypot(dx, dy) || 1;
          const ux = dx / len; const uy = dy / len; const nx = -uy; const ny = ux; const n = state.bondOrders[k];
          return (
            <g key={k}>
              {Array.from({ length: n }, (_, j) => { const off = (j - (n - 1) / 2) * 6; return <line key={j} stroke={INK} strokeLinecap="round" strokeWidth={2.4} x1={a.x + ux * 17 + nx * off} x2={c.x - ux * 17 + nx * off} y1={a.y + uy * 17 + ny * off} y2={c.y - uy * 17 + ny * off} />; })}
            </g>
          );
        })}
        {mol.atoms.map((el, i) => {
          const lps = freeAngles(bondAngles[i], state.lonePairs[i]);
          const fcSlot = freeAngles([...bondAngles[i], ...lps], 1)[0];
          const fc = report.valid ? report.atoms[i].formalCharge : 0;
          const fx = P[i].x + 27 * Math.cos((fcSlot * Math.PI) / 180); const fy = P[i].y - 27 * Math.sin((fcSlot * Math.PI) / 180);
          return (
            <g key={i}>
              {lps.map((a, j) => {
                const r = (a * Math.PI) / 180; const bx = P[i].x + 26 * Math.cos(r); const by = P[i].y - 26 * Math.sin(r); const px = -Math.sin(r) * 4.5; const py = -Math.cos(r) * 4.5;
                return <g key={j} fill={TEAL}><circle cx={bx + px} cy={by + py} r={2.6} /><circle cx={bx - px} cy={by - py} r={2.6} /></g>;
              })}
              <circle cx={P[i].x} cy={P[i].y} fill="#fbfaf7" r={15} stroke="none" />
              <text dominantBaseline="central" fill={INK} fontSize={18} fontWeight={700} textAnchor="middle" x={P[i].x} y={P[i].y}>{el}</text>
              {showCharges && fc !== 0 ? <text dominantBaseline="central" fill={fc > 0 ? BLUE : RED} fontSize={14} fontWeight={700} textAnchor="middle" x={fx} y={fy}>{fc > 0 ? `+${fc === 1 ? "" : fc}` : `−${fc === -1 ? "" : -fc}`}</text> : null}
            </g>
          );
        })}
        {mol.charge !== 0 ? (
          <g fill="none" stroke={INK} strokeWidth={2}>
            <path d={`M${pad - 20} 24V${H - 24}H${pad - 8}M${pad - 20} 24H${pad - 8}`} />
            <path d={`M${W - pad + 20} 24V${H - 24}H${W - pad + 8}M${W - pad + 20} 24H${W - pad + 8}`} />
            <text fill={INK} fontSize={15} fontWeight={700} stroke="none" x={W - pad + 24} y={34}>{mol.charge > 0 ? `${mol.charge === 1 ? "" : mol.charge}+` : `${mol.charge === -1 ? "" : -mol.charge}−`}</text>
          </g>
        ) : null}
        <text fill={SLATE} fontSize={11} x={10} y={H - 8}>Dots are lone pairs; coloured numbers are formal charges. Not the molecular geometry.</text>
      </svg>
    </div>
  );
}

// ---- 3-D geometry ----------------------------------------------------------------------------------------------------------------------

export interface GeometryView { azimuth: number; elevation: number; showLonePairs: boolean; showDomains: boolean; showAngles: boolean; showDipoles: boolean }

export function GeometryDiagram({ geo, center, ligands, view, bonds, net, onRotate, description }: {
  geo: VseprGeometry; center: string; ligands: string[]; view: GeometryView; bonds: BondDipole[] | null; net: Vec3 | null; onRotate: (azimuth: number, elevation: number) => void; description: string;
}) {
  const W = 380; const H = 330; const S = 104; const cx = W / 2; const cy = H / 2;
  const drag = useRef<{ x: number; y: number; az: number; el: number } | null>(null);
  const proj = (p: Vec3, scale = 1) => { const r = rotate([p[0] * scale, p[1] * scale, p[2] * scale], view.azimuth, view.elevation); const f = 1 + r[2] * 0.1; return { x: cx + r[0] * S * f, y: cy - r[1] * S * f, z: r[2], f }; };
  const atoms = geo.atoms.map((p, i) => ({ p, i, q: proj(p) }));
  const lps = geo.lonePairs.map((p, i) => ({ p, i, q: proj(p, 0.62) }));
  const all = [...geo.atoms, ...geo.lonePairs];
  const edges: Array<[Vec3, Vec3]> = [];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) { const d = Math.hypot(all[i][0] - all[j][0], all[i][1] - all[j][1], all[i][2] - all[j][2]); if (d <= 1.75 && all.length > 2) edges.push([all[i], all[j]]); }
  const items: Array<{ z: number; node: JSX.Element }> = [];
  atoms.forEach(({ i, q }) => {
    items.push({ z: q.z, node: (
      <g key={`b${i}`}>
        <line stroke={INK} strokeLinecap="round" strokeWidth={4.5} x1={cx} x2={q.x} y1={cy} y2={q.y} />
        <circle cx={q.x} cy={q.y} fill="#e2f1f2" r={15 * q.f} stroke={INK} strokeWidth={1.8} />
        <text dominantBaseline="central" fill={INK} fontSize={14 * q.f} fontWeight={700} textAnchor="middle" x={q.x} y={q.y}>{ligands[i] ?? ""}</text>
      </g>) });
  });
  if (view.showLonePairs) lps.forEach(({ i, q }) => {
    const ang = (Math.atan2(q.y - cy, q.x - cx) * 180) / Math.PI;
    items.push({ z: q.z, node: (
      <g key={`l${i}`} transform={`translate(${(cx + q.x) / 2} ${(cy + q.y) / 2}) rotate(${ang})`}>
        <ellipse cx={0} cy={0} fill={AMBER} fillOpacity={0.35} rx={Math.max(8, Math.hypot(q.x - cx, q.y - cy) / 2 + 6)} ry={11} stroke={AMBER} strokeWidth={1.5} />
        <circle cx={-3} cy={-3.5} fill={AMBER} r={2.4} /><circle cx={-3} cy={3.5} fill={AMBER} r={2.4} />
      </g>) });
  });
  const mid = proj([0, 0, 0]);
  items.push({ z: 0, node: <g key="c"><circle cx={mid.x} cy={mid.y} fill="#fde7c7" r={19} stroke={INK} strokeWidth={2} /><text dominantBaseline="central" fill={INK} fontSize={16} fontWeight={700} textAnchor="middle" x={mid.x} y={mid.y}>{center}</text></g> });
  items.sort((a, b) => a.z - b.z);
  // angle labels: one representative pair per distinct angle
  const seen = new Set<number>(); const labelPairs: Array<{ i: number; j: number; deg: number }> = [];
  for (const a of geo.angles) { const k = Math.round(a.deg * 10); if (!seen.has(k)) { seen.add(k); labelPairs.push(a); } }
  return (
    <div className="ph-diagram">
      <svg
        aria-label={description} className="ph-svg" data-testid="geometry-svg" height={H} role="img" style={{ touchAction: "none", cursor: "grab" }} viewBox={`0 0 ${W} ${H}`} width={W}
        onPointerDown={(e) => { (e.currentTarget as SVGSVGElement).setPointerCapture?.(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, az: view.azimuth, el: view.elevation }; }}
        onPointerMove={(e) => { const d = drag.current; if (!d) return; onRotate(Math.max(-180, Math.min(180, Math.round(d.az + (e.clientX - d.x) * 0.6))), Math.max(-90, Math.min(90, Math.round(d.el + (e.clientY - d.y) * 0.6)))); }}
        onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
      >
        <defs><marker id="geo-arrow" markerHeight="8" markerWidth="8" orient="auto" refX="6" refY="4" viewBox="0 0 8 8"><path d="M0 0.5 L7.5 4 L0 7.5 z" fill={RED} /></marker><marker id="geo-arrow-net" markerHeight="9" markerWidth="9" orient="auto" refX="7" refY="4.5" viewBox="0 0 9 9"><path d="M0 0.5 L8.5 4.5 L0 8.5 z" fill={PURPLE} /></marker></defs>
        <rect className="ph-paper" height={H} width={W} />
        {view.showDomains ? edges.map((e, k) => { const a = proj(e[0]); const b = proj(e[1]); return <line key={k} stroke={SLATE} strokeDasharray="4 4" strokeOpacity={0.55} x1={a.x} x2={b.x} y1={a.y} y2={b.y} />; }) : null}
        {items.map((it) => it.node)}
        {view.showAngles ? labelPairs.map((a, k) => {
          const u = geo.atoms[a.i]; const v = geo.atoms[a.j];
          const m: Vec3 = [(u[0] + v[0]) / 2, (u[1] + v[1]) / 2, (u[2] + v[2]) / 2];
          const len0 = Math.hypot(...m);
          // opposite atoms (180°): the midpoint is the centre, so place the label beside the bond instead
          const perp: Vec3 = len0 < 1e-6 ? (Math.abs(u[1]) < 0.9 ? [-u[2], 0, u[0]] : [0, u[2], -u[1]]) : m;
          const plen = Math.hypot(...perp) || 1;
          const q = proj(perp.map((c) => (c / plen) * (len0 < 1e-6 ? 0.3 : 0.42)) as Vec3);
          return <g key={k}><rect fill="#fbfaf7" fillOpacity={0.85} height={16} rx={3} width={46} x={q.x - 23} y={q.y - 9} /><text fill={BLUE} fontSize={12} fontWeight={700} textAnchor="middle" x={q.x} y={q.y + 3}>{`${angleBetween(u, v).toFixed(angleBetween(u, v) % 1 < 0.05 || angleBetween(u, v) % 1 > 0.95 ? 0 : 1)}°`}</text></g>;
        }) : null}
        {view.showDipoles && bonds ? bonds.map((b, k) => {
          const dir = geo.atoms[k]; const toLig = b.vector[0] * dir[0] + b.vector[1] * dir[1] + b.vector[2] * dir[2] >= 0;
          const p0 = toLig ? proj(dir, 0.3) : proj(dir, 0.85); const p1 = toLig ? proj(dir, 0.82) : proj(dir, 0.3);
          return b.delta < 0.01 ? null : <line key={`d${k}`} markerEnd="url(#geo-arrow)" stroke={RED} strokeWidth={2.4} x1={p0.x + 7} x2={p1.x + 7} y1={p0.y - 7} y2={p1.y - 7} />;
        }) : null}
        {view.showDipoles && net && Math.hypot(...net) > 1e-9 ? (() => { const m = Math.hypot(...net); const q = proj(net.map((c) => (c / m) * 0.9) as Vec3); return <line markerEnd="url(#geo-arrow-net)" stroke={PURPLE} strokeWidth={4.5} x1={cx} x2={q.x} y1={cy + 24} y2={q.y + 24} />; })() : null}
        <text fill={SLATE} fontSize={11} x={10} y={H - 8}>Drag to rotate. Amber lobes are lone pairs (domains, not atoms).{view.showDipoles ? " Red arrows: bond dipoles; purple: schematic net." : ""}</text>
      </svg>
    </div>
  );
}

// ---- hybridisation ---------------------------------------------------------------------------------------------------------------------

export function HybridDiagram({ type }: { type: "sp" | "sp²" | "sp³" }) {
  const n = type === "sp" ? 2 : type === "sp²" ? 3 : 4;
  const leftover = 4 - n; const angle = type === "sp" ? "180°" : type === "sp²" ? "120°" : "109.5°";
  const W = 420; const H = 260;
  const yS = 190; const yP = 100;
  const yH = 140;
  const desc = `${type} hybridisation: one s and ${n - 1} p orbitals mix into ${n} equivalent ${type} hybrid orbitals at about ${angle}${leftover ? `; ${leftover} p orbital${leftover === 1 ? "" : "s"} stay unhybridised and can form π bonds` : ""}. Heights are qualitative.`;
  return (
    <div className="ph-diagram">
      <svg aria-label={desc} className="ph-svg" data-testid="hybrid-svg" height={H} role="img" viewBox={`0 0 ${W} ${H}`} width={W}>
        <rect className="ph-paper" height={H} width={W} />
        <text fill={INK} fontSize={12} fontWeight={700} x={30} y={24}>Atomic orbitals</text>
        <text fill={INK} fontSize={12} fontWeight={700} x={W - 190} y={24}>After mixing</text>
        <line stroke={INK} strokeWidth={3} x1={40} x2={90} y1={yS} y2={yS} /><text fill={INK} fontSize={12} x={96} y={yS + 4}>s</text>
        {[0, 1, 2].map((k) => <g key={k}><line stroke={INK} strokeWidth={3} x1={40 + k * 56} x2={84 + k * 56} y1={yP} y2={yP} /><text fill={INK} fontSize={12} x={46 + k * 56} y={yP - 8}>p</text></g>)}
        {Array.from({ length: n }, (_, k) => <g key={k}><line stroke={TEAL} strokeWidth={3} x1={W - 210 + k * 46} x2={W - 172 + k * 46} y1={yH} y2={yH} /><text fill={TEAL} fontSize={12} x={W - 207 + k * 46} y={yH + 16}>{type}</text></g>)}
        {Array.from({ length: leftover }, (_, k) => <g key={k}><line stroke={AMBER} strokeWidth={3} x1={W - 210 + (n + k) * 46} x2={W - 172 + (n + k) * 46} y1={yP} y2={yP} /><text fill={AMBER} fontSize={12} x={W - 207 + (n + k) * 46} y={yP - 8}>p</text></g>)}
        <path d={`M100 ${yS - 8}C170 ${yS - 40} 190 ${yH + 10} ${W - 214} ${yH}`} fill="none" stroke={SLATE} strokeDasharray="4 4" />
        <path d={`M120 ${yP + 8}C170 ${yP + 20} 190 ${yH - 6} ${W - 214} ${yH - 4}`} fill="none" stroke={SLATE} strokeDasharray="4 4" />
        <text fill={INK} fontSize={13} x={30} y={H - 24}>1 s + {n - 1} p → {n} {type} hybrids, about {angle} apart</text>
        <text fill={SLATE} fontSize={11} x={30} y={H - 8}>{leftover ? `${leftover} unhybridised p orbital${leftover === 1 ? "" : "s"} remain (π bonds). ` : ""}Heights are qualitative; hybridisation is a bonding model, not an observable.</text>
      </svg>
    </div>
  );
}
