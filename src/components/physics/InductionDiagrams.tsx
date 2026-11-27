import { useId } from "react";
import { fmt, formatSI, senseWord } from "../../utils/physics/format";
import { type MotionalInput, type MotionalResult, type RlInput, type Sense } from "../../utils/physics/induction";
import { Arrow, ArrowDefs } from "./sim";
import { useContainerWidth } from "./simHooks";
import { OutIn } from "./MagneticDiagrams";

/**
 * Diagrams for the Electromagnetic induction laboratory. Conventions, identical to induction.ts and to the text on the page:
 *  - The loop's area normal n̂ is fixed by the right-hand rule from the chosen positive circulation. Positive EMF and current go
 *    COUNTER-CLOCKWISE as seen from the side n̂ points toward.
 *  - In the edge-on view the bar's "upper" end is u = (−sin θ, cos θ), which satisfies û × ẑ = n̂. A positive current therefore crosses
 *    the screen OUT (⊙) at the upper end and INTO the screen (⊗) at the other end; a negative current is the reverse.
 *  - Flux Φ = B A cos θ with θ the angle between n̂ and B; z is out of the screen.
 */

const W = 700, H = 340;
const INK = "#0f172a";
const rad = (d: number) => (d * Math.PI) / 180;

export type LoopFieldProps = {
  /** An open loop has an EMF but carries no current: no current arrows are drawn and the text says what the EMF would drive. */
  open?: boolean;
  /** Signed field along the screen +x reference at this time (T). */
  B: number; Bscale: number;
  /** Angle between n̂ and +x (degrees, counter-clockwise on the screen). */
  thetaDeg: number;
  A: number; Ascale: number; N: number;
  /** Sense of the EMF / current, or null when no induced quantity is being shown. */
  sense: Sense | null;
  flux: number;
};

export function LoopFieldDiagram({ B, Bscale, thetaDeg, A, Ascale, N, sense, flux, open }: LoopFieldProps) {
  const uid = useId().replace(/:/g, "");
  const [wrapRef, avail] = useContainerWidth(W);
  const k = Math.max(1, W / avail);
  const cx = W / 2, cy = H / 2 + 6;
  const th = rad(thetaDeg);
  const ell = 70 + 110 * Math.sqrt(Math.max(A, 0) / Math.max(Ascale, 1e-30));
  const half = Math.min(ell, 190) / 2;
  const u = { x: -Math.sin(th), y: -Math.cos(th) }; // screen direction of u = (−sinθ, cosθ) in world coordinates
  const n = { x: Math.cos(th), y: -Math.sin(th) }; // screen direction of n̂
  const rows = Array.from({ length: 11 }, (_, i) => cy - 130 + i * 26);
  const reach = Math.abs(half * Math.cos(th)); // half the vertical extent of the bar: the field lines inside it pass through the loop
  const dir = B >= 0 ? 1 : -1;
  const strength = Math.min(1, Math.abs(B) / Math.max(Bscale, 1e-30));
  const lw = 1.2 + 2.6 * strength;
  const through = rows.filter((y) => Math.abs(y - cy) <= reach + 1e-9).length;
  const positive = !open && sense === "counterclockwise";
  const negative = !open && sense === "clockwise";
  const arcR = 52;
  const arcEnd = { x: cx + arcR * Math.cos(th), y: cy - arcR * Math.sin(th) };
  return (
    <div className="ph-diagram" ref={wrapRef}>
      <svg
        aria-label={`Loop seen edge-on in a field along the horizontal axis. Normal at ${fmt(thetaDeg)}° to +x; B = ${formatSI(B, "T")}; flux per turn ${formatSI(flux, "Wb")}, linking N = ${N} turns. ${open && sense && sense !== "none" ? `The loop is open, so no current flows; its EMF would drive a ${senseWord(sense)} current.` : sense && sense !== "none" ? `Induced current ${senseWord(sense)} as seen from the side n̂ points toward.` : sense === "none" ? "No induced current." : ""}`}
        className="ph-svg"
        height={Math.round(H * Math.min(1, avail / W))}
        role="img"
        viewBox={`0 0 ${W} ${H}`}
        width={Math.round(Math.min(W, avail))}
      >
        <ArrowDefs prefix={uid} />
        <rect className="ph-paper" height={H} width={W} x={0} y={0} />
        {rows.map((y) => {
          const inside = Math.abs(y - cy) <= reach + 1e-9;
          const col = inside ? "#0b6a72" : "#94a3b8";
          return (
            <g key={y} opacity={inside ? 1 : 0.55 * (0.4 + 0.6 * strength)}>
              <line stroke={col} strokeWidth={inside ? lw + 0.6 : lw * 0.7} x1={30} x2={W - 30} y1={y} y2={y} />
              {[150, 330, 510].map((x) => <path d="M-6 -5 L6 0 L-6 5 z" fill={col} key={x} transform={`translate(${x} ${y}) scale(${dir} 1)`} />)}
            </g>
          );
        })}
        <text className="ph-note-text" style={{ fontSize: 12 * k }} x={34} y={18 + 6 * k}>B {B === 0 ? "= 0" : dir > 0 ? "→ along +x" : "← along −x"} ({formatSI(Math.abs(B), "T")}); {through} of 11 field lines cross the loop</text>
        <ellipse cx={cx} cy={cy} fill="rgba(180,83,9,0.10)" rx={10} ry={half} stroke="#b45309" strokeWidth={3} transform={`rotate(${-thetaDeg} ${cx} ${cy})`} />
        <Arrow kind="a" prefix={uid} width={3.2} x1={cx} x2={cx + n.x * 96} y1={cy} y2={cy + n.y * 96} />
        <text className="ph-vec-label a" style={{ fontSize: 15 * k }} x={cx + n.x * 106 + 2} y={cy + n.y * 106 + 4}>n̂</text>
        {Math.abs(thetaDeg) > 0.5 ? (
          <g>
            <path d={`M${cx + arcR} ${cy} A${arcR} ${arcR} 0 ${Math.abs(thetaDeg) > 180 ? 1 : 0} ${thetaDeg > 0 ? 0 : 1} ${arcEnd.x} ${arcEnd.y}`} fill="none" stroke={INK} strokeWidth={1.6} />
            <text className="ph-note-text" style={{ fontSize: 12 * k }} x={cx + arcR + 8} y={cy + (thetaDeg > 0 ? -8 : 16)}>θ = {fmt(thetaDeg)}°</text>
          </g>
        ) : <text className="ph-note-text" style={{ fontSize: 12 * k }} x={cx + 60} y={cy - 8}>θ = 0°</text>}
        {positive || negative ? (
          <g>
            <OutIn cx={cx + u.x * half} cy={cy + u.y * half} out={positive} r={11} title={`Induced current ${positive ? "out of" : "into"} the screen at this end of the loop`} />
            <OutIn cx={cx - u.x * half} cy={cy - u.y * half} out={!positive} r={11} title={`Induced current ${positive ? "into" : "out of"} the screen at this end of the loop`} />
            <Arrow kind="i" prefix={uid} width={3} x1={cx + u.x * 16} x2={cx + u.x * 16 + (positive ? n.x : -n.x) * 56} y1={cy + u.y * 16} y2={cy + u.y * 16 + (positive ? n.y : -n.y) * 56} />
            <text className="ph-i-label ph-halo" style={{ fontSize: 12 * Math.min(k, 1.5) }} x={k > 1.2 ? 14 : W - 14} y={k > 1.2 ? H - 8 - 34 * Math.min(k, 1.5) : H - 22} textAnchor={k > 1.2 ? "start" : "end"}>induced current: {senseWord(sense ?? "")} seen from the n̂ side</text>
            <text className="ph-i-label ph-halo" style={{ fontSize: 12 * Math.min(k, 1.5) }} x={k > 1.2 ? 14 : W - 14} y={k > 1.2 ? H - 8 - 17 * Math.min(k, 1.5) : H - 6} textAnchor={k > 1.2 ? "start" : "end"}>its own field (rose arrow) points {positive ? "along" : "against"} n̂</text>
          </g>
        ) : null}
        <text className="ph-val strong ph-halo" style={{ fontSize: 13 * Math.min(k, 1.5) }} x={k > 1.2 ? 14 : 34} y={H - 8}>Φ = BA cos θ = {formatSI(flux, "Wb")} per turn</text>
        {open && sense && sense !== "none" ? <text className="ph-i-label ph-halo" style={{ fontSize: 12 * Math.min(k, 1.5) }} x={k > 1.2 ? 14 : W - 14} y={k > 1.2 ? H - 8 - 17 * Math.min(k, 1.5) : H - 14} textAnchor={k > 1.2 ? "start" : "end"}>open loop: no current flows; the EMF would drive a {senseWord(sense)} current</text> : null}
      </svg>
    </div>
  );
}

// ---- motional EMF -------------------------------------------------------------------------------------------------------------------------

export function MotionalDiagram({ p, r, progress }: { p: MotionalInput; r: MotionalResult; progress: number }) {
  const uid = useId().replace(/:/g, "");
  const [wrapRef, avail] = useContainerWidth(W);
  const k = Math.max(1, W / avail);
  const cx = 310, cy = H / 2;
  const a = rad(p.rodAngleDeg), w = rad(p.velAngleDeg);
  const ud = { x: Math.cos(w), y: -Math.sin(w) }; // screen direction of the velocity
  const ra = { x: Math.cos(a), y: -Math.sin(a) }; // screen direction of the rod (tail → tip)
  const half = 78;
  const travel = (progress - 0.5) * 120;
  const rc = { x: cx + ud.x * travel, y: cy + ud.y * travel };
  const tip = { x: rc.x + ra.x * half, y: rc.y + ra.y * half }, tail = { x: rc.x - ra.x * half, y: rc.y - ra.y * half };
  const out = p.Bz > 0;
  const gx = [0.06, 0.2, 0.34, 0.48, 0.62, 0.76, 0.9], gy = [0.14, 0.34, 0.54, 0.74, 0.92];
  const fdir = r.forceDirDeg === null ? null : { x: Math.cos(rad(r.forceDirDeg)), y: -Math.sin(rad(r.forceDirDeg)) };
  const back = { x: -ud.x, y: -ud.y };
  const railLen = 190;
  const emfPos = r.positiveEnd === "tip" ? tip : r.positiveEnd === "tail" ? tail : null;
  const emfNeg = r.positiveEnd === "tip" ? tail : r.positiveEnd === "tail" ? tip : null;
  return (
    <div className="ph-diagram" ref={wrapRef}>
      <svg
        aria-label={`Rod of length ${formatSI(p.L, "m")} moving at ${formatSI(p.v, "m/s")} in a field ${out ? "out of" : "into"} the screen of ${formatSI(Math.abs(p.Bz), "T")}. EMF ${formatSI(r.emf, "V")}; ${r.positiveEnd === "neither" ? "no net EMF" : `the ${r.positiveEnd} is the positive end`}.`}
        className="ph-svg"
        height={Math.round(H * Math.min(1, avail / W))}
        role="img"
        viewBox={`0 0 ${W} ${H}`}
        width={Math.round(Math.min(W, avail))}
      >
        <ArrowDefs prefix={uid} />
        <rect className="ph-paper" height={H} width={W} x={0} y={0} />
        {gx.flatMap((fx) => gy.map((fy) => <g key={`${fx}${fy}`} opacity={0.4}><OutIn cx={W * fx} cy={H * fy} out={out} r={7} /></g>))}
        {r.perpendicular ? (
          <g>
            <polyline className="ph-wire" points={`${tip.x},${tip.y} ${tip.x + back.x * railLen},${tip.y + back.y * railLen}`} />
            <polyline className="ph-wire" points={`${tail.x},${tail.y} ${tail.x + back.x * railLen},${tail.y + back.y * railLen}`} />
            <polyline className="ph-wire" points={`${tip.x + back.x * railLen},${tip.y + back.y * railLen} ${tail.x + back.x * railLen},${tail.y + back.y * railLen}`} />
            <rect className="ph-resistor-box" height={22} width={22} x={(tip.x + tail.x) / 2 + back.x * railLen - 11} y={(tip.y + tail.y) / 2 + back.y * railLen - 11} />
            <text className="ph-comp-label" style={{ fontSize: 13 * k }} x={(tip.x + tail.x) / 2 + back.x * railLen + 16} y={(tip.y + tail.y) / 2 + back.y * railLen - 16}>R = {formatSI(p.R, "Ω")}</text>
          </g>
        ) : null}
        <line stroke="#b45309" strokeLinecap="round" strokeWidth={7} x1={tail.x} x2={tip.x} y1={tail.y} y2={tip.y} />
        <circle cx={tip.x} cy={tip.y} fill="#ffffff" r={8} stroke={INK} strokeWidth={2} />
        <text className="ph-note-text" style={{ fontSize: 12 * k }} x={tip.x + 12} y={tip.y - 8}>tip</text>
        <circle cx={tail.x} cy={tail.y} fill="#ffffff" r={8} stroke={INK} strokeWidth={2} />
        <text className="ph-note-text" style={{ fontSize: 12 * k }} x={tail.x + 12} y={tail.y + 16}>tail</text>
        {emfPos && emfNeg ? (
          <g>
            <text className="ph-sign" textAnchor="middle" x={emfPos.x} y={emfPos.y + 5}>+</text>
            <text className="ph-sign" textAnchor="middle" x={emfNeg.x} y={emfNeg.y + 5}>−</text>
          </g>
        ) : null}
        {p.v > 0 ? (
          <g>
            <Arrow kind="v" prefix={uid} width={3.4} x1={rc.x} x2={rc.x + ud.x * 80} y1={rc.y} y2={rc.y + ud.y * 80} />
            <text className="ph-vec-label v ph-halo" style={{ fontSize: 15 * k }} x={rc.x + ud.x * 88 + 4} y={rc.y + ud.y * 88}>v</text>
          </g>
        ) : null}
        {fdir ? (
          <g>
            <Arrow kind="a" prefix={uid} width={3} x1={rc.x} x2={rc.x + fdir.x * 62} y1={rc.y} y2={rc.y + fdir.y * 62} />
            <text className="ph-vec-label a ph-halo" style={{ fontSize: 14 * k }} x={rc.x + fdir.x * 31 + 12} y={rc.y + fdir.y * 31 + 4}>q(v × B)</text>
          </g>
        ) : null}
        <text className="ph-note-text" style={{ fontSize: 12 * k }} x={14} y={22}>B {out ? "out of the screen ⊙" : "into the screen ⊗"}, {formatSI(Math.abs(p.Bz), "T")}</text>
        <text className="ph-val strong ph-halo" style={{ fontSize: 13 * Math.min(k, 1.4) }} x={14} y={k > 1.2 ? H - 12 - 15 * Math.min(k, 1.4) : H - 30}>ε = (v × B)·L = {formatSI(r.emf, "V")}{r.positiveEnd === "neither" ? "" : ` (${r.positiveEnd} positive)`}</text>
        <text className="ph-note-text ph-halo" style={{ fontSize: 12 * Math.min(k, 1.4) }} x={14} y={H - 10}>{k > 1.2 ? "" : "The rod drifts schematically across the frame; its true speed is v. "}{r.perpendicular ? "Rails: closed circuit." : "Not a rails case: EMF only, no sustained current."}</text>
      </svg>
    </div>
  );
}

// ---- series RL circuit -------------------------------------------------------------------------------------------------------------------------

export function RlDiagram({ p, now }: { p: RlInput; now: { t: number; i: number; vR: number; vL: number; energy: number } }) {
  const uid = useId().replace(/:/g, "");
  const [wrapRef, avail] = useContainerWidth(W);
  const compact = avail < 560;
  const Wd = compact ? 430 : 700, Hd = 300;
  const scale = Math.min(1, Math.max(0.7, avail / Wd));
  const iRef = Math.max(Math.abs(p.Vs / p.R), Math.abs(p.i0), 1e-30);
  const iFrac = Math.min(1, Math.abs(now.i) / iRef);
  const idle = Math.abs(now.i) <= 1e-9 * iRef;
  const forward = now.i > 0;
  const topY = 80, botY = 240;
  const srcX = compact ? 90 : 170, indX = compact ? 340 : 520;
  const resX0 = compact ? 160 : 280, resX1 = compact ? 270 : 420;
  const zig: Array<[number, number]> = [[resX0, topY], [resX0 + 14, topY]];
  for (let q = 0; q < 6; q += 1) zig.push([resX0 + 14 + ((q + 0.5) * (resX1 - resX0 - 28)) / 6, topY + (q % 2 ? 12 : -12)]);
  zig.push([resX1 - 14, topY], [resX1, topY]);
  const coilTop = 140, coilBot = 190, loops = 5;
  const arcs = Array.from({ length: loops }, (_, q) => { const y0 = coilTop + (q * (coilBot - coilTop)) / loops, y1 = coilTop + ((q + 1) * (coilBot - coilTop)) / loops; return `M${indX} ${y0} a16 ${(y1 - y0) / 2} 0 0 1 0 ${y1 - y0}`; });
  const arrowOpacity = idle ? 0.15 : 0.35 + 0.65 * iFrac;
  const lx = compact ? indX - 40 : indX + 40, anchor = compact ? "end" : "start";
  return (
    <div className="ph-diagram" ref={wrapRef}>
      <svg
        aria-label={`RL circuit at t = ${formatSI(now.t, "s")}: current ${formatSI(now.i, "A")}, resistor ${fmt(now.vR)} V, inductor ${fmt(now.vL)} V, stored energy ${formatSI(now.energy, "J")}`}
        className="ph-svg"
        height={Math.round(Hd * scale)}
        role="img"
        viewBox={`0 0 ${Wd} ${Hd}`}
        width={Math.round(Wd * scale)}
      >
        <ArrowDefs prefix={uid} />
        <rect className="ph-paper" height={Hd} width={Wd} x={0} y={0} />
        <polyline className="ph-wire" fill="none" points={`${srcX},138 ${srcX},${topY} ${resX0},${topY}`} />
        <polyline className="ph-wire" fill="none" points={`${resX1},${topY} ${indX},${topY} ${indX},${coilTop}`} />
        <polyline className="ph-wire" fill="none" points={`${indX},${coilBot} ${indX},${botY} ${srcX},${botY} ${srcX},150`} />
        <line className="ph-plate long" x1={srcX - 20} x2={srcX + 20} y1={138} y2={138} />
        <line className="ph-plate" x1={srcX - 11} x2={srcX + 11} y1={150} y2={150} />
        <text className="ph-sign" textAnchor="end" x={srcX - 12} y={134}>+</text>
        <text className="ph-sign" textAnchor="end" x={srcX - 12} y={162}>−</text>
        <text className="ph-comp-label" textAnchor="end" x={srcX - 26} y={150}>Vs = {fmt(p.Vs)} V</text>
        <polyline className="ph-zigzag" fill="none" points={zig.map(([x, y]) => `${x},${y}`).join(" ")} />
        <text className="ph-comp-label" textAnchor="middle" x={(resX0 + resX1) / 2} y={topY - 22}>R = {formatSI(p.R, "Ω")}</text>
        <text className="ph-val" textAnchor="middle" x={(resX0 + resX1) / 2} y={topY + 38}>vR = {formatSI(now.vR, "V")}</text>
        {arcs.map((d, q) => <path className="ph-coil" d={d} fill="none" key={q} />)}
        <text className="ph-comp-label" textAnchor={anchor} x={lx} y={coilTop + 2}>L = {formatSI(p.L, "H")}</text>
        <text className="ph-val strong" textAnchor={anchor} x={lx} y={coilBot - 6}>vL = {formatSI(now.vL, "V")}</text>
        <text className="ph-val" textAnchor={anchor} x={lx} y={coilBot + 12}>U = {formatSI(now.energy, "J")}</text>
        <g opacity={arrowOpacity}>
          {forward || idle ? <Arrow kind="i" prefix={uid} width={3.4} x1={resX0 + 20} x2={resX1 - 20} y1={topY - 42} y2={topY - 42} /> : <Arrow kind="i" prefix={uid} width={3.4} x1={resX1 - 20} x2={resX0 + 20} y1={topY - 42} y2={topY - 42} />}
        </g>
        <text className="ph-i-label" textAnchor="middle" x={(resX0 + resX1) / 2} y={topY - 56}>i = {formatSI(now.i, "A")}</text>
        <text className="ph-note-text" textAnchor="middle" x={(srcX + indX) / 2} y={botY + 22}>KVL: Vs = vR + vL → {fmt(p.Vs)} = {fmt(now.vR)} + {fmt(now.vL)} V</text>
        <text className="ph-note-text" textAnchor="middle" x={(srcX + indX) / 2} y={botY + 40}>{Math.abs(now.vL) < 1e-6 * Math.max(1, Math.abs(p.Vs)) ? "Steady: di/dt = 0, so the inductor drops no voltage." : now.vL > 0 ? "Current rising: the inductor opposes the increase (v_L = L di/dt > 0)." : "Current falling: the inductor opposes the decrease and acts as a source (v_L < 0)."}</text>
      </svg>
    </div>
  );
}
