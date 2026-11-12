import { useId, useMemo } from "react";
import { niceTicks } from "../../utils/chartTicks";
import { BODY_WIDTH, stateAt, traceCollision, type CollisionInput, type CollisionResult } from "../../utils/physics/collisions";
import { fmt } from "../../utils/physics/format";
import { Arrow, ArrowDefs } from "./sim";
import { useContainerWidth } from "./simHooks";

/**
 * Two bodies on a straight track at the selected time. Box width is the true 1 m body width, so the faces touch exactly at the
 * contact time. Arrows show each velocity (one common scale), the diamond is the centre of mass (it never changes velocity),
 * and the dashed line marks where the collision happens.
 */
export function CollisionDiagram({ input, result, t }: { input: CollisionInput; result: CollisionResult; t: number }) {
  const [wrapRef, avail] = useContainerWidth();
  const uid = useId().replace(/:/g, "");
  const compact = avail < 520;
  const now = stateAt(input, result, t);
  const geo = useMemo(() => {
    const tr = traceCollision(input, result, 120);
    const xs = tr.flatMap((s) => [s.xA - BODY_WIDTH / 2, s.xA + BODY_WIDTH / 2, s.xB - BODY_WIDTH / 2, s.xB + BODY_WIDTH / 2]);
    const lo = Math.min(...xs);
    const hi = Math.max(...xs);
    const pad = Math.max((hi - lo) * 0.05, 0.5);
    const vmax = Math.max(1e-9, Math.abs(input.vA), Math.abs(input.vB), Math.abs(result.vA2), Math.abs(result.vB2));
    return { lo: lo - pad, hi: hi + pad, vmax };
  }, [input, result]);
  const W = Math.max(300, Math.min(avail, 880));
  const H = compact ? 250 : 280;
  const left = 30;
  const s = (W - 2 * left) / (geo.hi - geo.lo);
  const px = (x: number) => left + (x - geo.lo) * s;
  const ground = H - 70;
  const ticks = niceTicks(geo.lo, geo.hi, compact ? 4 : 8);
  const hA = 28 + 14 * Math.cbrt(input.mA);
  const hB = 28 + 14 * Math.cbrt(input.mB);
  const kv = Math.min(80, (W - 2 * left) * 0.16) / geo.vmax;
  const cm = (input.mA * now.xA + input.mB * now.xB) / (input.mA + input.mB);
  const body = (x: number, h: number, cls: string, name: string, m: number, v: number) => (
    <g data-body={name}>
      <rect className={`ph-block ${cls}`} height={h} rx={3} width={BODY_WIDTH * s} x={px(x - BODY_WIDTH / 2)} y={ground - h} />
      <text className="ph-block-label" textAnchor="middle" x={px(x)} y={ground - h / 2 + 5}>{name}</text>
      <text className="ph-note-text" textAnchor="middle" x={px(x)} y={ground - h - 48}>{name}: {fmt(m)} kg</text>
      <Arrow kind={name === "A" ? "v" : "a"} prefix={uid} title={`velocity of ${name}: ${fmt(v)} m/s`} width={3.4} x1={px(x)} x2={px(x) + v * kv} y1={ground - h - 16} y2={ground - h - 16} />
      <text className="ph-val strong" textAnchor="middle" x={px(x) + (v * kv) / 2} y={ground - h - 28}>{fmt(v)} m/s</text>
    </g>
  );
  return (
    <div className="ph-diagram" ref={wrapRef}>
      <svg aria-label={`Collision diagram at t = ${fmt(t)} s: A at ${fmt(now.xA)} m moving ${fmt(now.vA)} m/s, B at ${fmt(now.xB)} m moving ${fmt(now.vB)} m/s, ${now.after ? "after" : "before"} the collision`} className="ph-svg" height={H} role="img" viewBox={`0 0 ${W} ${H}`} width={W}>
        <ArrowDefs prefix={uid} />
        <rect className="ph-sky" height={H} width={W} x={0} y={0} />
        <rect className="ph-earth" height={H - ground} width={W} x={0} y={ground} />
        <line className="ph-ground" x1={0} x2={W} y1={ground} y2={ground} />
        {ticks.map((v) => (
          <g key={v}>
            <line className="ph-grid" x1={px(v)} x2={px(v)} y1={ground} y2={ground + 7} />
            <text className="ph-tick" textAnchor="middle" x={px(v)} y={ground + 21}>{v}</text>
          </g>
        ))}
        <text className="ph-axis-label" textAnchor="middle" x={W / 2} y={H - 10}>position x (m)</text>
        {result.collides && result.xAc !== null && result.xBc !== null ? (
          <g>
            <line className="ph-dim-line" x1={px((result.xAc + result.xBc) / 2)} x2={px((result.xAc + result.xBc) / 2)} y1={22} y2={ground} strokeDasharray="4 3" />
            <text className="ph-note-text" textAnchor="middle" x={px((result.xAc + result.xBc) / 2)} y={16}>collision at t = {fmt(result.tc as number)} s</text>
          </g>
        ) : null}
        {body(now.xA, hA, "a", "A", input.mA, now.vA)}
        {body(now.xB, hB, "b", "B", input.mB, now.vB)}
        <polygon className="ph-cm" points={`${px(cm)},${ground + 28} ${px(cm) + 7},${ground + 36} ${px(cm)},${ground + 44} ${px(cm) - 7},${ground + 36}`}><title>centre of mass</title></polygon>
        <text className="ph-note-text" textAnchor={px(cm) > W * 0.55 ? "end" : "start"} x={px(cm) + (px(cm) > W * 0.55 ? -12 : 12)} y={ground + 40}>{compact ? "CM" : "centre of mass"} {fmt(cm)} m, {fmt(result.vcm)} m/s</text>
        <text className="ph-note-text" x={8} y={H - 28}>{now.after ? "after the collision" : result.collides ? "before the collision" : "no collision"}</text>
      </svg>
    </div>
  );
}
