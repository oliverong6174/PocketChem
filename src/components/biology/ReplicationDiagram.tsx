import { useEffect, useRef } from "react";
import { toColumn, type Cell, type ReplicationModel, type Snapshot } from "../../utils/biology/replication";
import { complementDna, hydrogenBonds } from "../../utils/biology/sequence";

/**
 * The replication fork drawn from one engine snapshot. Every cell is a real base: parental strands show the input sequence, a new
 * strand's base is the complement of the template base in its column, and RNA primers show U. Nothing is drawn that the snapshot
 * does not contain. Colours are fixed (the diagram sits on paper in both themes).
 */
const CW = 26;
const ML = 118;
const MR = 40;
const Y = { newTop: 112, parTopU: 142, parTop: 172, parBot: 198, parBotU: 228, newBot: 258 };
const H = 340;

const C = {
  parTop: { fill: "#dbe7f3", stroke: "#3b5b7d" },
  parBot: { fill: "#e6e0f5", stroke: "#5b4f8f" },
  lead: { fill: "#bfe5e3", stroke: "#0b6a72" },
  lag: { fill: "#f6dcb4", stroke: "#b45309" },
  rna: { fill: "#f8c7d0", stroke: "#be123c" },
};

function Mark({ cx, cy, text, color, w = 46 }: { cx: number; cy: number; text: string; color: string; w?: number }) {
return (
  <g className="bio-enzyme">
    <rect fill={color} height={18} opacity={0.92} rx={9} stroke="#0f172a" strokeWidth={1} width={w} x={cx - w / 2} y={cy - 9} />
    <text className="bio-enz-text" textAnchor="middle" x={cx} y={cy + 4}>{text}</text>
  </g>
);
}

export function ReplicationDiagram({ model, snap, hideLabels }: { model: ReplicationModel; snap: Snapshot; hideLabels: boolean }) {
  const { input, length: N } = model;
  const dir = input.direction;
  const W = ML + N * CW + MR;
  const colOf = (u: number) => toColumn(u, N, dir);
  const uOf = (p: number) => toColumn(p, N, dir); // the mapping is its own inverse
  const x = (p: number) => ML + p * CW + CW / 2;
  const unwoundAt = (p: number) => uOf(p) < snap.unwound;
  const yTop = (p: number) => (unwoundAt(p) ? Y.parTopU : Y.parTop);
  const yBot = (p: number) => (unwoundAt(p) ? Y.parBotU : Y.parBot);
  const lab = (text: string) => (hideLabels ? "?" : text);

  // fork x-position: the boundary between opened and intact columns
  const forkX = dir === "right" ? ML + snap.unwound * CW : ML + (N - snap.unwound) * CW;
  const topIsLeading = model.leadingTemplate === "top";
  const dTop = topIsLeading ? snap.lead : snap.lag; // cells by u of the daughter on the top template
  const dBot = topIsLeading ? snap.lag : snap.lead;
  const baseTop = (p: number) => complementDna(model.top[p]);
  const baseBot = (p: number) => complementDna(model.bottom[p]);

  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const target = forkX - el.clientWidth / 2;
    if (forkX < el.scrollLeft + 60 || forkX > el.scrollLeft + el.clientWidth - 60) el.scrollLeft = Math.max(0, target);
  }, [forkX]);

  const cell = (px: number, py: number, letter: string, kind: keyof typeof C, key: string, glow = false) => (
    <g key={key}>
      {glow ? <rect fill="#fde68a" height={28} opacity={0.75} rx={7} width={CW} x={px - CW / 2} y={py - 14} /> : null}
      <rect fill={C[kind].fill} height={20} rx={5} stroke={C[kind].stroke} strokeWidth={1.6} width={CW - 4} x={px - CW / 2 + 2} y={py - 10} />
      <text className="bio-base" textAnchor="middle" x={px} y={py + 5}>{letter}</text>
    </g>
  );

  const active = new Set(snap.actions.map((a) => colOf(a.u)));

  // backbone through parental strands (a Y shape appears where the strands separate)
  const pathFor = (yf: (p: number) => number) => Array.from({ length: N }, (_, p) => `${p === 0 ? "M" : "L"}${x(p)} ${yf(p)}`).join(" ");

  // daughter runs
  type Run = { from: number; to: number; frag: number | null };
  const boundaries = new Set<number>(); // boundary after u
  snap.junctions.forEach((j) => {
    const f = snap.fragments[j.index];
    if (j.stage === "waiting") boundaries.add(f.b);
    if (j.stage === "filled") boundaries.add(f.b - input.primerLength);
  });
  const runsOf = (cells: Cell[], isLag: boolean): Run[] => {
    const runs: Run[] = [];
    let start: number | null = null;
    for (let u = 0; u <= N; u += 1) {
      const filled = u < N && cells[u] !== 0;
      const split = start !== null && u > 0 && boundaries.has(u - 1) && isLag;
      if (start !== null && (!filled || split)) { runs.push({ from: start, to: u - 1, frag: null }); start = null; }
      if (filled && start === null) start = u;
    }
    return runs;
  };
  const leadRuns = runsOf(snap.lead, false);
  const lagRuns = runsOf(snap.lag, true);
  const fragOf = (u: number) => snap.fragments.find((f) => u >= f.a && u <= f.b)?.index ?? 0;

  const drawDaughter = (cells: Cell[], runs: Run[], role: "lead" | "lag", onTop: boolean) => {
    const yD = onTop ? Y.newTop : Y.newBot;
    const yT = onTop ? Y.parTopU : Y.parBotU;
    const baseAt = (p: number) => (onTop ? baseTop(p) : baseBot(p));
    // 3' end is on the left for a daughter of the top template (5' on the right) and on the right for the bottom template
    const threeLeft = onTop;
    const out: JSX.Element[] = [];
    runs.forEach((r, ri) => {
      const pa = colOf(r.from);
      const pb = colOf(r.to);
      const left = Math.min(pa, pb);
      const right = Math.max(pa, pb);
      const x1 = x(left) - CW / 2 + 3;
      const x2 = x(right) + CW / 2 - 3;
      const yLine = onTop ? yD - 16 : yD + 16;
      out.push(<line key={`${role}-bb-${ri}`} stroke={C[role === "lead" ? "lead" : "lag"].stroke} strokeWidth={2} x1={x1} x2={x2} y1={yLine} y2={yLine} />);
      // arrowhead at the 3' end
      const ax = threeLeft ? x1 : x2;
      const dx = threeLeft ? -1 : 1;
      out.push(<path d={`M${ax} ${yLine} l${-7 * dx} -4.5 l0 9 z`} fill={C[role].stroke} key={`${role}-ah-${ri}`} />);
      if (role === "lag") out.push(<text className="bio-frag" key={`${role}-fn-${ri}`} textAnchor="middle" x={(x1 + x2) / 2} y={onTop ? yLine - 6 : yLine + 14}>{lab(`fragment ${fragOf(r.from) + 1}`)}</text>);
    });
    for (let u = 0; u < N; u += 1) {
      const c = cells[u];
      if (c === 0) continue;
      const p = colOf(u);
      const letter = c === 1 ? baseAt(p).replace("T", "U") : baseAt(p);
      out.push(cell(x(p), yD, letter, c === 1 ? "rna" : role, `${role}-c-${u}`, active.has(p) && snap.actions.some((a) => colOf(a.u) === p && a.strand === (role === "lead" ? "leading" : "lagging"))));
      // base-pair rung to the template strand
      const bonds = hydrogenBonds(letter === "U" ? "A" : baseAt(p));
      const ya = onTop ? yD + 10 : yT + 10;
      const yb = onTop ? yT - 10 : yD - 10;
      out.push(<line key={`${role}-r-${u}`} stroke="#64748b" strokeDasharray={bonds === 3 ? "2 2" : "4 2"} strokeWidth={1.2} x1={x(p)} x2={x(p)} y1={ya} y2={yb} />);
    }
    return out;
  };

  const duplexRungs = Array.from({ length: N }, (_, p) => (unwoundAt(p) ? null : (
    <line key={`rung-${p}`} stroke="#64748b" strokeDasharray={hydrogenBonds(model.top[p]) === 3 ? "2 2" : "4 2"} strokeWidth={1.3} x1={x(p)} x2={x(p)} y1={Y.parTop + 10} y2={Y.parBot - 10} />
  )));

  // enzyme positions
  const leadEndU = snap.lead.filter((c) => c !== 0).length - 1;
  const leadPolX = leadEndU >= 0 ? x(colOf(leadEndU)) : forkX;
  const activeFrag = snap.fragments.find((f) => f.primed && !f.done);
  const lagPolX = activeFrag ? x(colOf(Math.min(N - 1, activeFrag.next + 1))) : null;
  const ligate = snap.actions.find((a) => a.kind === "ligate");
  const removeA = snap.actions.find((a) => a.kind === "removePrimer");
  const fillA = snap.actions.find((a) => a.kind === "fillGap");
  const lagPrimerA = snap.actions.find((a) => a.kind === "lagPrimer");
  const leadPrimerA = snap.actions.find((a) => a.kind === "leadPrimer");
  const lagOnTop = !topIsLeading;
  const yLagRow = lagOnTop ? Y.newTop : Y.newBot;
  const yLeadRow = lagOnTop ? Y.newBot : Y.newTop;

  // single-stranded binding protein dots on lagging-template bases not yet copied
  const ssb: JSX.Element[] = [];
  for (let u = 0; u < snap.unwound; u += 1) {
    if (snap.lag[u] === 0) {
      const p = colOf(u);
      ssb.push(<circle cx={x(p)} cy={lagOnTop ? Y.parTopU - 17 : Y.parBotU + 17} fill="#94a3b8" key={`ssb-${u}`} opacity={0.55} r={3.4} />);
    }
  }

  const dirWord = dir === "right" ? "right" : "left";
  return (
    <div className="ph-diagram bio-diagram" ref={scroller}>
      <svg aria-label={`DNA replication fork moving ${dirWord}: ${snap.unwound} of ${N} base pairs open`} className="ph-svg" data-testid="replication-diagram" data-unwound={snap.unwound} height={H} role="img" viewBox={`0 0 ${W} ${H}`} width={W}>
        <rect className="ph-paper" height={H} width={W} />
        {/* fork direction */}
        <g>
          <line stroke="#0f172a" strokeWidth={2} x1={dir === "right" ? ML + 8 : W - MR - 8} x2={dir === "right" ? ML + 86 : W - MR - 86} y1={26} y2={26} />
          <path d={dir === "right" ? `M${ML + 86} 26 l-8 -5 l0 10 z` : `M${W - MR - 86} 26 l8 -5 l0 10 z`} fill="#0f172a" />
          <text className="ph-axis-label" textAnchor={dir === "right" ? "start" : "end"} x={dir === "right" ? ML + 96 : W - MR - 96} y={31}>Fork moves {dirWord}</text>
        </g>
        {/* row labels */}
        <g className="bio-rowlabels">
          <text x={6} y={Y.newTop - 2}>New strand</text>
          <text className="bio-role" x={6} y={Y.newTop + 12}>{hideLabels ? "role: ?" : topIsLeading ? "leading" : "lagging"}</text>
          <text x={6} y={Y.parTop + 4}>Top parent 5′→3′</text>
          <text x={6} y={Y.parBot + 4}>Bottom parent 3′←5′</text>
          <text x={6} y={Y.newBot - 2}>New strand</text>
          <text className="bio-role" x={6} y={Y.newBot + 12}>{hideLabels ? "role: ?" : topIsLeading ? "lagging" : "leading"}</text>
        </g>
        {/* parental strands */}
        <path d={pathFor(yTop)} fill="none" stroke={C.parTop.stroke} strokeLinejoin="round" strokeWidth={2.2} />
        <path d={pathFor(yBot)} fill="none" stroke={C.parBot.stroke} strokeLinejoin="round" strokeWidth={2.2} />
        {duplexRungs}
        {Array.from({ length: N }, (_, p) => cell(x(p), yTop(p), model.top[p], "parTop", `pt-${p}`, active.has(p) && snap.actions.some((a) => a.kind === "unwind" && colOf(a.u) === p)))}
        {Array.from({ length: N }, (_, p) => cell(x(p), yBot(p), model.bottom[p], "parBot", `pb-${p}`))}
        {/* strand end labels of the parental strands */}
        <text className="bio-end" x={ML - 4} y={Y.parTop - 14} textAnchor="end">5′</text>
        <text className="bio-end" x={W - MR + 4} y={Y.parTop - 14}>3′</text>
        <text className="bio-end" x={ML - 4} y={Y.parBot + 24} textAnchor="end">3′</text>
        <text className="bio-end" x={W - MR + 4} y={Y.parBot + 24}>5′</text>
        {ssb}
        {drawDaughter(dTop, topIsLeading ? leadRuns : lagRuns, topIsLeading ? "lead" : "lag", true)}
        {drawDaughter(dBot, topIsLeading ? lagRuns : leadRuns, topIsLeading ? "lag" : "lead", false)}
        {/* machinery */}
        {snap.unwound > 0 && snap.unwound < N ? (
          <g>
            <circle cx={forkX} cy={(Y.parTop + Y.parBot) / 2} fill="#fde68a" r={19} stroke="#92400e" strokeWidth={2.4} />
            <text className="bio-enz-text" textAnchor="middle" x={forkX} y={(Y.parTop + Y.parBot) / 2 + 4}>{hideLabels ? "?" : "Hel"}</text>
            <Mark color="#e2e8f0" cx={forkX + (dir === "right" ? 44 : -44)} cy={Y.parBot + 38} text={lab("Topo")} w={42} />
          </g>
        ) : snap.unwound === 0 ? <Mark color="#fde68a" cx={forkX + (dir === "right" ? 24 : -24)} cy={(Y.parTop + Y.parBot) / 2} text={lab("Helicase")} w={62} /> : null}
        {snap.lead.some((c) => c) && snap.step < model.steps.length ? <Mark color="#bfe5e3" cx={leadPolX} cy={yLeadRow + (yLeadRow === Y.newTop ? -44 : 44)} text={lab(input.organism === "bacteria" ? "Pol III" : "Pol ε")} w={52} /> : null}
        {lagPolX !== null ? <Mark color="#f6dcb4" cx={lagPolX} cy={yLagRow + (yLagRow === Y.newTop ? -44 : 44)} text={lab(input.organism === "bacteria" ? "Pol III" : "Pol δ")} w={52} /> : null}
        {lagPrimerA ? <Mark color="#f8c7d0" cx={x(colOf(lagPrimerA.u))} cy={yLagRow + (yLagRow === Y.newTop ? -44 : 44)} text={lab("Primase")} w={58} /> : null}
        {leadPrimerA ? <Mark color="#f8c7d0" cx={x(colOf(leadPrimerA.u + 1))} cy={yLeadRow + (yLeadRow === Y.newTop ? -44 : 44)} text={lab("Primase")} w={58} /> : null}
        {removeA ? <Mark color="#e9d5ff" cx={x(colOf(removeA.u))} cy={yLagRow + (yLagRow === Y.newTop ? -44 : 44)} text={lab(input.organism === "bacteria" ? "Pol I" : "FEN1")} w={48} /> : null}
        {fillA ? <Mark color="#f6dcb4" cx={x(colOf(fillA.u))} cy={yLagRow + (yLagRow === Y.newTop ? -44 : 44)} text={lab(input.organism === "bacteria" ? "Pol I" : "Pol δ")} w={48} /> : null}
        {ligate ? (
          <g>
            <circle cx={x(colOf(ligate.u))} cy={yLagRow} fill="none" r={17} stroke="#16a34a" strokeWidth={2.4} />
            <Mark color="#bbf7d0" cx={x(colOf(ligate.u))} cy={yLagRow + (yLagRow === Y.newTop ? -44 : 44)} text={lab("Ligase")} w={52} />
          </g>
        ) : null}
      </svg>
    </div>
  );
}

export function ReplicationLegend() {
  const sw = (c: { fill: string; stroke: string }, text: string) => (
    <span className="bio-key" key={text}><span className="bio-swatch" style={{ background: c.fill, borderColor: c.stroke }} />{text}</span>
  );
  return (
    <div className="ph-legend-line" role="group" aria-label="Legend">
      {sw(C.parTop, "Parental top strand")}{sw(C.parBot, "Parental bottom strand")}{sw(C.lead, "Leading strand (DNA)")}{sw(C.lag, "Lagging strand (DNA)")}{sw(C.rna, "RNA primer (U)")}
      <span className="bio-key"><span className="bio-swatch ssb" />SSB</span>
    </div>
  );
}
