/**
 * Explanations, predict-then-observe scenarios and design challenges for the Waves & sound, Geometric optics and Interference &
 * diffraction laboratories. Every number quoted comes from the same model the page draws; challenge checks are pure functions of the
 * saved inputs, so they can be tested without the interface.
 */
import type { PredictScenario } from "../generalChem/predict";
import { fmt, formatSI } from "./format";
import { solveImaging, solveRefraction, validateImaging, validateRefraction } from "./optics";
import type { Lesson } from "./physicsLearning";
import { summarizeSlits, validateSlits } from "./interference";
import {
  classifySuperposition, harmonicFrequency, harmonicWavelength, solveDoppler, validateDoppler, validateResonator, validateSuperposition, validateWave, waveQuantities,
  allowedHarmonic, RESONATOR_LABEL, particleVelocity,
} from "./waves";
import type { InterferenceInputs, OpticsInputs, WavesInputs } from "../persistence/physicsTools";

export interface Challenge<I> {
  id: string;
  title: string;
  prompt: string;
  /** Which view of the laboratory the task is solved in (the page switches to it when the task is picked). */
  view?: string;
  /** Pure check of the learner's current settings: whether the goal is met and a one-line status quoting the measured value. */
  check: (inputs: I) => { met: boolean; status: string };
  hint: string;
  /** One worked way to reach the goal, shown only on request. */
  solution: string;
}

// ================================================================================================================================
// Waves and sound
// ================================================================================================================================

type Wi = WavesInputs;

export function wavesLessons(inputs: Wi): Lesson[] {
  if (inputs.view === "travel") {
    const w = inputs.wave;
    const q = waveQuantities(w);
    return [
      {
        id: "speed-vs-particle", title: "Why is the speed of the wave not the speed of the medium?",
        body: [
          `The pattern moves at v = fλ = ${fmt(w.f)} Hz × ${fmt(q.lambda)} m = ${fmt(w.v)} m/s, set by the medium. Each piece of the medium only oscillates about its place: its speed ∂y/∂t is at most ωA = 2πfA = ${fmt(q.omega * w.A)} m/s, and it is largest where the displacement is zero and zero at a crest.`,
          "A wave carries energy and pattern forward; it does not carry the medium forward. Doubling the amplitude doubles the particle speed but leaves the wave speed alone.",
        ],
      },
      {
        id: "f-lambda", title: "What sets the frequency, and what sets the wavelength?",
        body: [
          "The source sets the frequency: the medium is made to vibrate once per source cycle. The medium sets the speed. The wavelength follows, λ = v/f.",
          `Here f = ${fmt(w.f)} Hz and v = ${fmt(w.v)} m/s give λ = ${fmt(q.lambda)} m and period T = ${fmt(q.T)} s. A wave entering a medium where v is different keeps its frequency and changes its wavelength.`,
        ],
      },
      {
        id: "long", title: "How does a longitudinal wave differ from a transverse one?",
        body: [
          "In a transverse wave the particles move across the direction of travel; in a longitudinal wave (sound in air) they move back and forth along it. The same function y(x, t) describes both: for sound it is the displacement of each particle along x.",
          `Compressions are where neighbouring particles are squeezed together, that is where the displacement is decreasing with x. The local density ratio is 1/(1 + ∂s/∂x): it is above 1 in a compression and below 1 in a rarefaction. Note that a compression is not where the displacement is largest: it is where the slope of the displacement curve is steepest and negative.`,
        ],
      },
      {
        id: "phase", title: "What does the phase constant do?",
        body: [`The phase φ = ${fmt(w.phiDeg)}° only shifts the pattern: the wave is y = A sin(kx ${w.dir === 1 ? "−" : "+"} ωt + φ). A phase of 90° turns a sine into a cosine; 180° inverts the wave. It matters when two waves are added, because the phase difference decides whether they reinforce or cancel.`],
      },
    ];
  }
  if (inputs.view === "superposition") {
    const c = classifySuperposition(inputs.sup);
    return [
      {
        id: "superposition", title: "What does superposition mean?",
        body: [
          "When two small waves overlap, the displacement of the medium at each place and time is just the sum of the two displacements; the waves pass through one another unchanged afterwards. This simple addition is the principle that makes interference possible. It holds for small amplitudes (the linear regime).",
          `Right now: ${c.title}. ${c.detail}`,
        ],
      },
      {
        id: "standing-condition", title: "When do two waves make a true standing wave?",
        body: [
          "Only when they have the same frequency and the same amplitude and travel in opposite directions. Then y = 2A sin(kx) cos(ωt): the shape stays put, the nodes never move, and the amplitude at a node is exactly zero.",
          "If the amplitudes differ, the result is a standing part plus a traveling part: the minima are not zero, nothing is a node, and energy still moves along. Two waves in the same direction never make a standing wave, however they are chosen.",
        ],
      },
      {
        id: "beats", title: "Where do beats come from?",
        body: [
          `Two waves of slightly different frequencies drift in and out of phase, so at one place the combined disturbance swells and fades |f₁ − f₂| times per second. For ${fmt(inputs.sup.w1.f)} Hz and ${fmt(inputs.sup.w2.f)} Hz that is ${fmt(c.beatFrequency)} beats per second.`,
          "The beat frequency is the difference of the frequencies, not the average. The pitch you hear is the average (f₁ + f₂)/2. Beats need frequencies that are close; if they differ by a large fraction the ear hears two tones.",
        ],
      },
    ];
  }
  if (inputs.view === "standing") {
    const r = inputs.res;
    const fn = harmonicFrequency(r.kind, r.L, r.v, r.n);
    return [
      {
        id: "boundary", title: "Why can only certain frequencies exist?",
        body: [
          `A ${RESONATOR_LABEL[r.kind].toLowerCase()} forces the pattern to fit its ends. ${r.kind === "string" ? "Both ends are fixed, so each is a node and an whole number of half-wavelengths must fit: L = nλ/2, f = nv/2L." : r.kind === "open" ? "Both ends are open and the air there moves freely, so each end is a displacement antinode and an integer number of half-wavelengths fits: L = nλ/2, f = nv/2L." : "The closed end is a displacement node and the open end an antinode, so an odd number of quarter-wavelengths fits: L = nλ/4 with n odd, f = nv/4L."}`,
          `With L = ${fmt(r.L)} m and v = ${fmt(r.v)} m/s, harmonic ${r.n} has λ = ${fmt(harmonicWavelength(r.kind, r.L, r.n))} m and f = ${fmt(fn)} Hz.`,
        ],
      },
      {
        id: "closed-odd", title: "Why does a closed pipe have only odd harmonics?",
        body: [
          "Because a node at one end and an antinode at the other can only be joined by a whole number of quarter-wavelengths that is odd: ¼λ, ¾λ, 1¼λ… An even number would put an antinode where the closed end needs a node.",
          `The closed pipe's lowest note is therefore v/4L, half that of an open pipe of the same length (v/2L) and its wavelength is 4L instead of 2L. The harmonics are 1, 3, 5… times the fundamental.${r.kind === "closed" ? "" : " Switch to the closed pipe to see this."}`,
        ],
      },
      {
        id: "nodes", title: "Which points are nodes, and of what?",
        body: [
          "Displacement nodes are places where the particles never move; displacement antinodes are where they move most. For sound in a pipe the pressure pattern is the opposite: a displacement node is a pressure antinode (the air is alternately squeezed and stretched there) and a displacement antinode is a pressure node. This laboratory draws the displacement.",
          `${r.kind === "string" ? "A string has n + 1 nodes counting the fixed ends." : r.kind === "open" ? "An open pipe has n displacement nodes and n + 1 antinodes, with antinodes at both ends." : "A closed pipe in harmonic n has (n + 1)/2 nodes and (n + 1)/2 antinodes."} Real pipes behave as if slightly longer than L (end correction), which is not modelled here.`,
        ],
      },
    ];
  }
  const d = inputs.dop;
  const r = solveDoppler(d);
  return [
    {
      id: "doppler", title: "Why does motion change the observed frequency?",
      body: [
        `The medium fixes the speed of sound c = ${fmt(d.c)} m/s. A source moving toward the observer at ${fmt(d.vs)} m/s catches up with its own wavefronts, so they are emitted closer together: λ′ = (c − v_s)/f = ${fmt(r.lambdaMedium)} m instead of ${fmt(r.lambdaAtRest)} m. An observer moving toward the source simply meets the wavefronts more often.`,
        `The observer hears f′ = f (c + v_o)/(c − v_s) = ${fmt(r.fObserved)} Hz from the source's ${fmt(d.fs)} Hz (${r.trend === "same" ? "no change" : r.trend + " than emitted"}).`,
      ],
    },
    {
      id: "asymmetry", title: "Why does a moving source differ from a moving observer?",
      body: [
        "For sound, the medium is the reference: a moving source changes the wavelength in the medium, a moving observer only changes the rate at which wavefronts are met. At the same speed they give different frequencies: 40 m/s toward the observer from the source gives f c/(c − 40) but the observer moving at 40 m/s gives f(c + 40)/c.",
        `For the present settings, moving the source alone would give ${fmt(r.fSourceOnly)} Hz and moving the observer alone ${fmt(r.fObserverOnly)} Hz. Light has no medium, so its Doppler shift depends only on relative velocity (a different, relativistic formula not modelled here).`,
      ],
    },
    {
      id: "limit", title: "What happens at the speed of sound?",
      body: ["As the source speed approaches c the denominator c − v_s approaches zero and the observed frequency grows without limit: the wavefronts pile up into a shock wave. At and beyond c the formula does not apply, so this laboratory refuses source speeds of c or more instead of showing a number that would be wrong."],
    },
  ];
}

type WaveScenario = PredictScenario<Wi>;
const withWave = (i: Wi, patch: Partial<Wi["wave"]>): Wi | null => { const v = validateWave({ ...i.wave, ...patch }); return v.ok ? { ...i, wave: v.value, tNow: 0 } : null; };
const withDop = (i: Wi, patch: Partial<Wi["dop"]>): Wi | null => { const v = validateDoppler({ ...i.dop, ...patch }); return v.ok ? { ...i, dop: v.value, tNow: 0 } : null; };
const withRes = (i: Wi, patch: Partial<Wi["res"]>): Wi | null => { const v = validateResonator({ ...i.res, ...patch }); return v.ok ? { ...i, res: v.value, tNow: 0 } : null; };
const withSupWave = (i: Wi, which: "w1" | "w2", patch: Partial<Wi["wave"]>): Wi | null => {
  const v = validateSuperposition({ ...i.sup, [which]: { ...i.sup[which], ...patch } });
  return v.ok ? { ...i, sup: v.value, tNow: 0 } : null;
};

export function wavesScenarios(inputs: Wi): WaveScenario[] {
  const list: WaveScenario[] = [];
  if (inputs.view === "travel") {
    const lam = (i: Wi) => waveQuantities(i.wave).lambda;
    const pmax = (i: Wi) => Math.abs(particleVelocity({ ...i.wave, phiDeg: 0 }, 0, 0));
    list.push(
      {
        id: "double-f", change: "double the frequency (same medium)", quantity: "the wavelength",
        apply: (x) => withWave(x, { f: x.wave.f * 2 }), measure: lam, format: (v) => `${fmt(v)} m`,
        explain: (b, a) => `The speed is fixed by the medium, so λ = v/f halves: ${fmt(b)} → ${fmt(a)} m.`,
      },
      {
        id: "double-v", change: "double the wave speed (frequency unchanged)", quantity: "the wavelength",
        apply: (x) => withWave(x, { v: x.wave.v * 2 }), measure: lam, format: (v) => `${fmt(v)} m`,
        explain: (b, a) => `Same frequency, faster wave: each cycle spreads over twice the distance. λ = v/f: ${fmt(b)} → ${fmt(a)} m.`,
      },
      {
        id: "double-A", change: "double the amplitude", quantity: "the greatest speed of a piece of the medium",
        apply: (x) => withWave(x, { A: x.wave.A * 2 }), measure: pmax, format: (v) => `${fmt(v)} m/s`,
        explain: (b, a) => `Greatest particle speed ωA doubles: ${fmt(b)} → ${fmt(a)} m/s. The wave speed ${fmt(inputs.wave.v)} m/s does not change.`,
      },
      {
        id: "double-f-pmax", change: "double the frequency", quantity: "the greatest speed of a piece of the medium",
        apply: (x) => withWave(x, { f: x.wave.f * 2 }), measure: pmax, format: (v) => `${fmt(v)} m/s`,
        explain: (b, a) => `ωA = 2πfA doubles with f at fixed amplitude: ${fmt(b)} → ${fmt(a)} m/s.`,
      },
    );
  } else if (inputs.view === "superposition") {
    const beat = (i: Wi) => classifySuperposition(i.sup).beatFrequency;
    const maxAmp = (i: Wi) => classifySuperposition(i.sup).maxAmplitude;
    list.push(
      {
        id: "raise-f2", change: "raise the frequency of wave 2 by 1 Hz", quantity: "the beat frequency",
        apply: (x) => withSupWave(x, "w2", { f: x.sup.w2.f + 1 }), measure: beat, format: (v) => `${fmt(v)} Hz`,
        explain: (b, a) => `Beats occur at |f₁ − f₂|: ${fmt(b)} → ${fmt(a)} Hz.`, absTol: 1e-9,
      },
      {
        id: "invert-w2", change: "shift wave 2 by half a cycle (180°)", quantity: "the largest amplitude of the sum",
        apply: (x) => withSupWave(x, "w2", { phiDeg: x.sup.w2.phiDeg >= 0 ? x.sup.w2.phiDeg - 180 : x.sup.w2.phiDeg + 180 }), measure: maxAmp, format: (v) => `${fmt(v)} m`,
        explain: (b, a) => `A half-cycle shift swaps constructive for destructive interference when the waves share direction and frequency: ${fmt(b)} → ${fmt(a)} m.`,
      },
      {
        id: "double-A2", change: "double the amplitude of wave 2", quantity: "the largest amplitude of the sum",
        apply: (x) => withSupWave(x, "w2", { A: x.sup.w2.A * 2 }), measure: maxAmp, format: (v) => `${fmt(v)} m`,
        explain: (b, a) => `The largest possible amplitude is A₁ + A₂: ${fmt(b)} → ${fmt(a)} m.`,
      },
    );
  } else if (inputs.view === "standing") {
    const f1 = (i: Wi) => harmonicFrequency(i.res.kind, i.res.L, i.res.v, 1);
    const fn = (i: Wi) => harmonicFrequency(i.res.kind, i.res.L, i.res.v, i.res.n);
    list.push(
      {
        id: "double-L", change: "double the length", quantity: "the fundamental frequency",
        apply: (x) => withRes(x, { L: x.res.L * 2 }), measure: f1, format: (v) => `${fmt(v)} Hz`,
        explain: (b, a) => `A longer resonator fits a longer wave, so the pitch falls: ${fmt(b)} → ${fmt(a)} Hz.`,
      },
      {
        id: "double-v", change: "double the wave speed (a tighter string, or warmer air)", quantity: "the fundamental frequency",
        apply: (x) => withRes(x, { v: x.res.v * 2 }), measure: f1, format: (v) => `${fmt(v)} Hz`,
        explain: (b, a) => `f₁ is proportional to v: ${fmt(b)} → ${fmt(a)} Hz.`,
      },
      {
        id: "next-harmonic", change: "go to the next allowed harmonic", quantity: "the frequency",
        apply: (x) => { let n = x.res.n + 1; while (n <= 12 && !allowedHarmonic(x.res.kind, n)) n++; return n <= 12 ? withRes(x, { n }) : null; }, measure: fn, format: (v) => `${fmt(v)} Hz`,
        explain: (b, a) => `${inputs.res.kind === "closed" ? "Closed pipe: the next allowed harmonic is two steps up (odd only)" : "Each harmonic adds one more half-wavelength"}: ${fmt(b)} → ${fmt(a)} Hz.`,
      },
    );
    if (inputs.res.kind !== "closed" && allowedHarmonic("closed", inputs.res.n)) {
      list.push({
        id: "close-one-end", change: "make it a pipe closed at one end (same length, speed and harmonic number)", quantity: "the frequency of that harmonic",
        apply: (x) => withRes(x, { kind: "closed" }), measure: fn, format: (v) => `${fmt(v)} Hz`,
        explain: (b, a) => `For the same harmonic number the closed pipe's wave is twice as long (4L/n against 2L/n): ${fmt(b)} → ${fmt(a)} Hz.`,
      });
    }
  } else {
    const f = (i: Wi) => solveDoppler(i.dop).fObserved;
    list.push(
      {
        id: "double-vs", change: "double the speed of the source toward the observer", quantity: "the observed frequency",
        apply: (x) => withDop(x, { vs: x.dop.vs * 2 }), measure: f, format: (v) => `${fmt(v)} Hz`,
        explain: (b, a) => `A faster source squeezes the wavefronts closer: ${fmt(b)} → ${fmt(a)} Hz. The increase is more than double the shift because of the c − v_s in the denominator.`,
      },
      {
        id: "reverse-vs", change: "make the source move away instead of toward the observer", quantity: "the observed frequency",
        apply: (x) => withDop(x, { vs: -x.dop.vs }), measure: f, format: (v) => `${fmt(v)} Hz`,
        explain: (b, a, t) => `Receding stretches the wavefronts (${t}): ${fmt(b)} → ${fmt(a)} Hz.`,
      },
      {
        id: "source-to-observer", change: "stop the source and move the observer toward it at the same speed", quantity: "the observed frequency",
        apply: (x) => withDop(x, { vs: 0, vo: x.dop.vs }), measure: f, format: (v) => `${fmt(v)} Hz`,
        explain: (b, a, t) => `Equal speeds do not give equal shifts in a medium: a moving source changes the wavelength, a moving observer does not (${t}). ${fmt(b)} → ${fmt(a)} Hz.`,
      },
      {
        id: "hotter-air", change: "raise the speed of sound by 10 % (warmer air) with the same motion", quantity: "the observed frequency",
        apply: (x) => withDop(x, { c: x.dop.c * 1.1 }), measure: f, format: (v) => `${fmt(v)} Hz`,
        explain: (b, a, t) => `The same source speed is a smaller fraction of c, so the shift shrinks (${t}): ${fmt(b)} → ${fmt(a)} Hz.`,
      },
    );
  }
  return list.filter((s) => { const after = s.apply(inputs); return after !== null && Number.isFinite(s.measure(inputs)) && Number.isFinite(s.measure(after)); });
}

const onView = <I extends { view: string }>(view: string, i: I, fn: () => { met: boolean; status: string }) =>
  i.view === view ? fn() : { met: false, status: "Open this task's view first (the page switches to it when you pick the task)." };

export const WAVES_CHALLENGES: Challenge<Wi>[] = [
  {
    id: "wave-lambda-T", title: "A wave with a given wavelength and period", view: "travel",
    prompt: "Set a traveling wave with wavelength 0.50 m (± 0.005 m) and period 2.0 ms (± 0.05 ms).",
    check: (i) => onView("travel", i, () => { const q = waveQuantities(i.wave); const met = Math.abs(q.lambda - 0.5) <= 0.005 && Math.abs(q.T - 0.002) <= 0.00005; return { met, status: `λ = ${fmt(q.lambda)} m, T = ${fmt(q.T * 1000)} ms (v = ${fmt(i.wave.v)} m/s)` }; }),
    hint: "You need f = 1/T and a speed v = λ f.", solution: "f = 1/0.002 s = 500 Hz and v = fλ = 500 × 0.50 = 250 m/s. Keep the amplitude at or below 0.15 λ = 0.075 m (the small-amplitude limit).",
  },
  {
    id: "wave-beats-3", title: "Exactly three beats per second", view: "superposition",
    prompt: "Make the two waves beat 3.0 times per second (± 0.05 Hz) with both frequencies above 400 Hz, in one medium. The model keeps the frequencies within 25 % of each other for beats.",
    check: (i) => onView("superposition", i, () => { const c = classifySuperposition(i.sup); const met = Math.abs(c.beatFrequency - 3) <= 0.05 && Math.min(i.sup.w1.f, i.sup.w2.f) > 400 && c.kind === "beats"; return { met, status: `${c.kind === "beats" ? `${fmt(c.beatFrequency)} beats per second` : c.title}; f₁ = ${fmt(i.sup.w1.f)} Hz, f₂ = ${fmt(i.sup.w2.f)} Hz` }; }),
    hint: "Beats per second = |f₁ − f₂|. The medium speed is shared by both waves, so keep it equal.", solution: "f₁ = 440 Hz and f₂ = 443 Hz, both at the same speed (343 m/s) and opposite or equal directions as you like; the beat frequency is 3 Hz.",
  },
  {
    id: "wave-true-standing", title: "A true standing wave with antinode amplitude 0.30 m", view: "superposition",
    prompt: "Combine two waves to make a true standing wave whose antinodes reach 0.30 m (± 0.005 m).",
    check: (i) => onView("superposition", i, () => { const c = classifySuperposition(i.sup); const met = c.kind === "standing" && Math.abs(c.maxAmplitude - 0.3) <= 0.005; return { met, status: `${c.title}; largest amplitude ${fmt(c.maxAmplitude)} m` }; }),
    hint: "Equal frequency and equal amplitude, opposite directions. The antinode amplitude is twice each wave's amplitude.", solution: "Give both waves the same frequency, A = 0.15 m, and opposite directions: antinodes reach 2A = 0.30 m. (At 2 Hz and 4 m/s the wavelength is 2 m, so the small-amplitude limit is 0.15 × 2 = 0.30 m per wave.)",
  },
  {
    id: "wave-string-220", title: "Tune a string to 220 Hz", view: "standing",
    prompt: "Make a string fixed at both ends sound 220 Hz (± 1 %) in its fundamental (n = 1), with a length no more than 1.5 m.",
    check: (i) => onView("standing", i, () => { const r = i.res; const f = harmonicFrequency(r.kind, r.L, r.v, r.n); const met = r.kind === "string" && r.n === 1 && r.L <= 1.5 && Math.abs(f - 220) <= 2.2; return { met, status: `${RESONATOR_LABEL[r.kind]}, n = ${r.n}, L = ${fmt(r.L)} m, f = ${fmt(f)} Hz` }; }),
    hint: "f₁ = v/2L: pick a length, then the speed that gives 220 Hz.", solution: "For L = 0.60 m choose v = 2Lf = 2 × 0.60 × 220 = 264 m/s.",
  },
  {
    id: "wave-closed-170", title: "A closed pipe that resonates at 170 Hz", view: "standing",
    prompt: "In air (speed of sound 343 m/s ± 2), build a pipe closed at one end whose lowest resonance is 170 Hz (± 2 Hz).",
    check: (i) => onView("standing", i, () => { const r = i.res; const f = harmonicFrequency(r.kind, r.L, r.v, 1); const met = r.kind === "closed" && Math.abs(r.v - 343) <= 2 && Math.abs(f - 170) <= 2; return { met, status: `${RESONATOR_LABEL[r.kind]}, L = ${fmt(r.L)} m, v = ${fmt(r.v)} m/s, f₁ = ${fmt(f)} Hz` }; }),
    hint: "f₁ = v/4L for a closed pipe, so L = v/4f.", solution: "L = 343/(4 × 170) = 0.504 m with the closed pipe at harmonic 1.",
  },
  {
    id: "wave-doppler-20", title: "An approaching source that sounds 20 % higher", view: "doppler",
    prompt: "With a stationary observer, make the observed frequency 1.20 times the emitted frequency (± 0.01) by moving the source toward the observer.",
    check: (i) => onView("doppler", i, () => { const r = solveDoppler(i.dop); const met = i.dop.vo === 0 && i.dop.vs > 0 && Math.abs(r.ratio - 1.2) <= 0.01; return { met, status: `f′/f = ${fmt(r.ratio)} (source ${fmt(i.dop.vs)} m/s, observer ${fmt(i.dop.vo)} m/s)` }; }),
    hint: "f′/f = c/(c − v_s) = 1.2, so v_s = c(1 − 1/1.2).", solution: "With c = 343 m/s: v_s = 343 × (1 − 1/1.2) = 57.2 m/s.",
  },
];

// ================================================================================================================================
// Geometric optics
// ================================================================================================================================

type Oi = OpticsInputs;

export function opticsLessons(inputs: Oi): Lesson[] {
  if (inputs.view === "refraction") {
    const r = inputs.refraction;
    const s = solveRefraction(r);
    return [
      {
        id: "snell", title: "Why does light bend at a boundary?",
        body: [
          `Light travels at c/n: ${fmt(100 * s.speed1)} % of c in medium 1 and ${fmt(100 * s.speed2)} % of c in medium 2. Its frequency cannot change at the boundary, so the wavelength shortens in the slower medium, and the wavefronts swing round: n₁ sin θ₁ = n₂ sin θ₂ (Snell's law).`,
          s.tir ? `At ${fmt(r.theta1)}° from the normal the sine of the refraction angle would exceed 1, so there is no refracted ray at all.` : `Here θ₂ = ${fmt(s.theta2 as number)}°, ${s.bending}.`,
        ],
      },
      {
        id: "tir", title: "When does total internal reflection happen?",
        body: [
          "Only when light goes from a medium of higher index to lower index, and only when the angle of incidence exceeds the critical angle θc = asin(n₂/n₁). Beyond it Snell's law has no solution: all the light is reflected, with the angle of reflection equal to the angle of incidence.",
          s.critical === null ? "Going into a denser (or equal) medium, there is no critical angle: light always refracts." : `For these media θc = ${fmt(s.critical)}°; ${s.tir ? `${fmt(r.theta1)}° is beyond it.` : `${fmt(r.theta1)}° is below it, so light still gets through.`}`,
        ],
      },
      {
        id: "partial", title: "Is the reflected ray always there?",
        body: ["A real boundary reflects some light even when it also transmits. This model shows the direction of the reflected ray (angle of reflection equal to angle of incidence) but does not calculate how much light is reflected (the Fresnel equations are not modelled)."],
      },
    ];
  }
  const g = inputs.imaging;
  const r = solveImaging(g);
  const el = g.element === "lens" ? "lens" : "mirror";
  return [
    {
      id: "rays", title: "How are the three principal rays chosen?",
      body: [
        g.element === "lens"
          ? "Each ray is one whose path after the lens is known: a ray parallel to the axis is bent through the far focal point (a diverging lens bends it as if it came from the near focal point); a ray through the near focal point leaves parallel; a ray through the centre of a thin lens is not bent."
          : "Each ray is one whose path after reflection is known: a ray parallel to the axis reflects through the focal point (a convex mirror reflects it as if from the focal point behind it); a ray toward the focal point returns parallel; a ray to the vertex reflects at the same angle on the other side of the axis.",
        r.sPrime === null ? "Here the object is at the focal point, so the rays leave parallel and never meet: the image is at infinity." : `Where the rays (or, for a virtual image, their backward extensions, drawn dashed) cross is the image: ${fmt(Math.abs(r.sPrime))} cm ${r.nature === "real" ? "from the element, where light really arrives" : "from the element, where light only appears to come from"}.`,
      ],
    },
    {
      id: "equation", title: "How do the equation and the sign convention fit the diagram?",
      body: [
        `With real objects positive, 1/s + 1/s′ = 1/f. Here 1/${fmt(g.s)} + 1/${r.sPrime === null ? "∞" : fmt(r.sPrime)} = 1/${fmt(g.f)} cm⁻¹. A positive s′ is a real image (light actually converges there, a screen would show it) and a negative s′ a virtual image (no light is there; you see it by looking through the ${el}).`,
        r.m === null ? "At s = f the magnification is undefined (no image)." : `The magnification m = −s′/s = ${fmt(r.m)}: the image is ${r.orientation}, ${r.size} (|m| ${Math.abs(r.m) > 1 ? "> 1" : Math.abs(r.m) < 1 ? "< 1" : "= 1"}).`,
      ],
    },
    {
      id: "regions", title: "How does the image change as the object moves?",
      body: [
        g.f > 0
          ? `A converging ${el} gives a real, inverted image for an object beyond f; it grows as the object approaches f (at 2f it is the same size), and it runs off to infinity at f. Inside f the image is virtual, upright and enlarged: that is a magnifying glass or a shaving mirror. This object is ${({ "beyond-2f": "beyond 2f", "at-2f": "at 2f", "between-f-and-2f": "between f and 2f", "at-f": "at f", "inside-f": "inside f", diverging: "" } as const)[r.region]}.`
          : `A diverging ${el} gives a virtual, upright, reduced image for every real object distance, always between the element and its focal point. That is why a convex mirror is used for wide-angle views.`,
        g.element === "mirror" ? `A mirror's focal length is half its radius of curvature: R = 2f = ${fmt(2 * g.f)} cm.` : `The optical power ${fmt(r.power)} dioptres is 1/f with f in metres; thin lenses in contact add their powers.`,
      ],
    },
    {
      id: "limits", title: "When does this model stop being accurate?",
      body: ["It is a thin-lens, paraxial model: rays are close to the axis and make small angles, the lens has no thickness, and all colours focus alike. Real lenses show spherical and chromatic aberration, thick-lens effects and a limited aperture; none of that is modelled. Two-lens systems and virtual objects are not supported."],
    },
  ];
}

type OpticsScenario = PredictScenario<Oi>;
const withImg = (i: Oi, patch: Partial<Oi["imaging"]>): Oi | null => { const v = validateImaging({ ...i.imaging, ...patch }); return v.ok ? { ...i, imaging: v.value } : null; };
const withRef = (i: Oi, patch: Partial<Oi["refraction"]>): Oi | null => { const v = validateRefraction({ ...i.refraction, ...patch }); return v.ok ? { ...i, refraction: v.value } : null; };
const imgMeasure = (pick: (r: ReturnType<typeof solveImaging>) => number | null) => (i: Oi) => pick(solveImaging(i.imaging)) ?? NaN;

export function opticsScenarios(inputs: Oi): OpticsScenario[] {
  const list: OpticsScenario[] = [];
  if (inputs.view === "imaging") {
    list.push(
      {
        id: "closer", change: "move the object closer to the element (halve the distance)", quantity: "the size of the image",
        apply: (x) => withImg(x, { s: x.imaging.s / 2 }), measure: imgMeasure((r) => (r.hPrime === null ? null : Math.abs(r.hPrime))), format: (v) => `${fmt(v)} cm`,
        explain: (b, a, t) => `Image height ${fmt(b)} → ${fmt(a)} cm (${t}). ${inputs.imaging.f > 0 ? "For a converging element the image grows as the object nears the focal point, whether it is real or virtual; passing it flips the image." : "A diverging element always gives a reduced virtual image that grows slowly as the object approaches."}`,
      },
      {
        id: "stronger", change: "halve the focal length (a stronger element)", quantity: "the image distance, signed (positive = real)",
        apply: (x) => withImg(x, { f: x.imaging.f / 2 }), measure: imgMeasure((r) => r.sPrime), format: (v) => `${fmt(v)} cm`,
        explain: (b, a) => `With 1/s′ = 1/f − 1/s: ${fmt(b)} → ${fmt(a)} cm.`,
      },
      {
        id: "flip", change: "replace the converging element by a diverging one of the same size", quantity: "the magnification (signed)",
        apply: (x) => withImg(x, { f: -x.imaging.f }), measure: imgMeasure((r) => r.m), format: (v) => `${fmt(v)}`,
        explain: (b, a) => `The diverging element gives m = f/(f − s) between 0 and 1: ${fmt(b)} → ${fmt(a)}, always upright and reduced.`,
      },
      {
        id: "taller", change: "double the height of the object", quantity: "the image distance",
        apply: (x) => withImg(x, { h: x.imaging.h * 2 }), measure: imgMeasure((r) => r.sPrime), format: (v) => `${fmt(v)} cm`,
        explain: (b, a) => `Image distance depends only on s and f, not on the size of the object: ${fmt(b)} → ${fmt(a)} cm. The image height doubles, though.`,
      },
    );
  } else {
    const th2 = (i: Oi) => solveRefraction(i.refraction).theta2 ?? NaN;
    list.push(
      {
        id: "denser", change: "increase n₂ by 0.3", quantity: "the angle of refraction",
        apply: (x) => withRef(x, { n2: Math.min(3, x.refraction.n2 + 0.3) }), measure: th2, format: (v) => `${fmt(v)}°`,
        explain: (b, a) => `A denser second medium bends light further toward the normal: ${fmt(b)}° → ${fmt(a)}°.`,
      },
      {
        id: "steeper", change: "increase the angle of incidence by 10°", quantity: "the angle of refraction",
        apply: (x) => withRef(x, { theta1: Math.min(89, x.refraction.theta1 + 10) }), measure: th2, format: (v) => `${fmt(v)}°`,
        explain: (b, a) => `Larger incidence angle, larger refraction angle (the sines stay in the ratio n₁/n₂): ${fmt(b)}° → ${fmt(a)}°.`,
      },
      {
        id: "swap", change: "swap the two media (light goes the other way)", quantity: "the angle of refraction",
        apply: (x) => withRef(x, { n1: x.refraction.n2, n2: x.refraction.n1 }), measure: th2, format: (v) => `${fmt(v)}°`,
        explain: (b, a) => `Going from dense to less dense bends away from the normal: ${fmt(b)}° → ${fmt(a)}°. (It could also fail entirely: total internal reflection.)`,
      },
    );
  }
  return list.filter((s) => { const after = s.apply(inputs); return after !== null && Number.isFinite(s.measure(inputs)) && Number.isFinite(s.measure(after)); });
}

export const OPTICS_CHALLENGES: Challenge<Oi>[] = [
  {
    id: "opt-same-size", title: "A real image the same size as the object", view: "imaging",
    prompt: "With a converging lens, make a real, inverted image exactly as large as the object (magnification −1, ± 0.02).",
    check: (i) => onView("imaging", i, () => { const g = i.imaging; const r = solveImaging(g); const met = g.element === "lens" && g.f > 0 && r.m !== null && Math.abs(r.m + 1) <= 0.02; return { met, status: r.m === null ? "The image is at infinity." : `${g.element === "lens" ? (g.f > 0 ? "converging lens" : "diverging lens") : "mirror"}: m = ${fmt(r.m)}` }; }),
    hint: "Put the object at the centre of curvature, a distance 2f from the lens.", solution: "s = 2f. For f = 10 cm put the object at 20 cm: s′ = 20 cm and m = −1.",
  },
  {
    id: "opt-magnifier", title: "A magnifying glass", view: "imaging",
    prompt: "With a converging lens, make an upright virtual image at least 3 times as large as the object.",
    check: (i) => onView("imaging", i, () => { const g = i.imaging; const r = solveImaging(g); const met = g.element === "lens" && g.f > 0 && r.nature === "virtual" && r.m !== null && r.m >= 3; return { met, status: r.m === null ? "The image is at infinity." : `${r.nature} image, m = ${fmt(r.m)}` }; }),
    hint: "The object must be inside the focal length.", solution: "m = f/(f − s) = 3 gives s = 2f/3. For f = 12 cm put the object at 8 cm.",
  },
  {
    id: "opt-convex-quarter", title: "A convex mirror that shrinks to a quarter", view: "imaging",
    prompt: "Use a convex mirror to make an image 0.25 times the size of the object (± 0.01).",
    check: (i) => onView("imaging", i, () => { const g = i.imaging; const r = solveImaging(g); const met = g.element === "mirror" && g.f < 0 && r.m !== null && Math.abs(r.m - 0.25) <= 0.01; return { met, status: r.m === null ? "The image is at infinity." : `${g.element === "mirror" ? (g.f < 0 ? "convex mirror" : "concave mirror") : "lens"}: m = ${fmt(r.m)}` }; }),
    hint: "For a diverging element m = f/(f − s) = |f|/(|f| + s).", solution: "m = 1/4 needs s = 3|f|. For |f| = 15 cm the object is at 45 cm.",
  },
  {
    id: "opt-collimate", title: "Parallel rays from a point source", view: "imaging",
    prompt: "Place a small bright object so that a converging lens sends its light out as a parallel beam (no image forms).",
    check: (i) => onView("imaging", i, () => { const g = i.imaging; const r = solveImaging(g); const met = g.f > 0 && r.region === "at-f"; return { met, status: r.region === "at-f" ? "At the focal point: rays leave parallel." : `Object at ${fmt(g.s)} cm, focal length ${fmt(g.f)} cm` }; }),
    hint: "Parallel output means the image is at infinity.", solution: "Put the object exactly at the focal point: s = f.",
  },
  {
    id: "opt-just-tir", title: "Just beyond the critical angle", view: "refraction",
    prompt: "For light going from a denser medium to a rarer one, set the angle of incidence so that total internal reflection has just started: between the critical angle and 2° above it.",
    check: (i) => onView("refraction", i, () => { const r = i.refraction; const s = solveRefraction(r); const met = s.critical !== null && s.tir && r.theta1 - s.critical <= 2; return { met, status: s.critical === null ? "Light goes into a denser medium: no critical angle exists." : `Critical angle ${fmt(s.critical)}°, angle of incidence ${fmt(r.theta1)}° (${s.tir ? "total internal reflection" : "still refracting"})` }; }),
    hint: "Total internal reflection needs n₁ > n₂ and θ₁ above asin(n₂/n₁).", solution: "Glass (1.5) to air (1.0): θc = asin(1/1.5) = 41.8°, so choose θ₁ = 42° to 43.8°.",
  },
];

// ================================================================================================================================
// Interference and diffraction
// ================================================================================================================================

type Ii = InterferenceInputs;

export function interferenceLessons(inputs: Ii): Lesson[] {
  const s = inputs.slits;
  const r = summarizeSlits(s);
  const nm = s.lambdaNm;
  return [
    {
      id: "path", title: "Why do bright and dark fringes appear?",
      body: [
        "Light from the two slits travels slightly different distances to a point on the screen. Where the path difference d sinθ is a whole number of wavelengths the waves arrive in step and add (bright); where it is an odd number of half-wavelengths they arrive in opposite step and cancel (dark).",
        s.N === 1 ? "With one slit there is no second source, so there is no interference between slits; the pattern is diffraction from different parts of the same slit." : `Here d = ${fmt(s.dUm)} µm and λ = ${fmt(nm)} nm, so bright fringes are at sinθ = mλ/d with spacing ≈ λL/d = ${fmt((r.fringeSpacing ?? 0) * 1000)} mm on the screen (about; the exact positions use L tanθ).`,
      ],
    },
    {
      id: "single", title: "Why does a narrower slit give a wider pattern?",
      body: [
        `Each slit is itself a diffracting source: waves from different parts of the slit interfere, giving a central maximum with first minima where a sinθ = ±λ. A narrower slit has a larger spread: the central maximum is ${fmt(2000 * (r.centralHalfWidth ?? 0))} mm wide here, proportional to λL/a. Diffraction is the same effect that limits how sharply light can be focused.`,
        "This is why a wide slit casts a sharp shadow and a slit of about the size of the wavelength spreads light widely. The slit-width envelope multiplies the two-slit fringes, so the fringes get dimmer away from the centre.",
      ],
    },
    {
      id: "missing", title: "What are missing orders?",
      body: [
        s.N === 1 ? "Missing orders appear when interference fringes (from two or more slits) coincide with the zeros of the diffraction envelope; one slit has no fringes to go missing." : `If the diffraction envelope is zero at the place where an interference maximum would be, that order has no light. This happens when m = k d/a for whole numbers k: with d/a = ${fmt(s.dUm / s.aUm)} the missing orders are ${r.missingOrders.length ? r.missingOrders.slice(0, 4).join(", ") + (r.missingOrders.length > 4 ? "…" : "") : "none within the observable range (the ratio gives no whole-number coincidence below the highest order)"}. The central diffraction peak holds ${r.fringesInCentral ?? "—"} fringes.`,
        "It is a sign that the intensity is a product of two effects, interference between slits and diffraction by each slit, rather than one effect.",
      ],
    },
    {
      id: "grating", title: "What changes with many slits (a grating)?",
      body: [
        s.N < 3 ? "Add slits and the principal maxima stay in the same places (d sinθ = mλ) but become narrower and brighter relative to the background, with N − 2 faint subsidiary maxima between them." : `With N = ${s.N} slits the principal maxima stay at d sinθ = mλ, their width falls as 1/N (first zero at sinθ = λ/Nd = ${fmt(r.principalHalfWidth as number)} from each maximum), and there are ${s.N - 2} faint secondary maxima between them.`,
        "Narrow, well-separated maxima are why a grating can separate wavelengths so well: each wavelength has its own angle sinθ = mλ/d, so white light is spread into spectra in each order. A grating resolves wavelengths by the narrowness of its maxima.",
      ],
    },
    {
      id: "farfield", title: "When is this far-field pattern correct?",
      body: [`The formulas assume the screen is far enough that the waves from the whole aperture arrive as nearly parallel rays (Fraunhofer diffraction): the Fresnel number D²/(λL) must be small. Here it is ${fmt(r.fresnel)} (the model refuses values above 0.5). Nearer than that the pattern changes shape (Fresnel diffraction), which this laboratory does not model. Light is treated as a scalar wave of one colour; polarization and the finite coherence of real sources are not modelled.`],
    },
  ];
}

type InterferenceScenario = PredictScenario<Ii>;
const withSlits = (i: Ii, patch: Partial<Ii["slits"]>): Ii | null => { const v = validateSlits({ ...i.slits, ...patch }); return v.ok ? { ...i, slits: v.value } : null; };

export function interferenceScenarios(inputs: Ii): InterferenceScenario[] {
  const s = inputs.slits;
  const spacing = (i: Ii) => summarizeSlits(i.slits).fringeSpacing ?? NaN;
  const half = (i: Ii) => summarizeSlits(i.slits).centralHalfWidth ?? NaN;
  const list: InterferenceScenario[] = [
    {
      id: "red", change: "use light of twice the wavelength (if the range allows)", quantity: s.N === 1 ? "the width of the central maximum" : "the fringe spacing",
      apply: (x) => withSlits(x, { lambdaNm: x.slits.lambdaNm * 2 }), measure: s.N === 1 ? half : spacing, format: (v) => `${fmt(v * 1000)} mm`,
      explain: (b, a) => `Fringe spacing ∝ λ: ${fmt(b * 1000)} → ${fmt(a * 1000)} mm. Red light gives wider patterns than blue.`,
    },
    {
      id: "closer-screen", change: "halve the distance to the screen", quantity: s.N === 1 ? "the width of the central maximum" : "the fringe spacing",
      apply: (x) => withSlits(x, { L: x.slits.L / 2 }), measure: s.N === 1 ? half : spacing, format: (v) => `${fmt(v * 1000)} mm`,
      explain: (b, a) => `The angles do not change; the screen is nearer so the pattern is half as wide: ${fmt(b * 1000)} → ${fmt(a * 1000)} mm.`,
    },
    {
      id: "narrower", change: "halve the slit width a", quantity: "the width of the central diffraction maximum",
      apply: (x) => withSlits(x, { aUm: x.slits.aUm / 2 }), measure: half, format: (v) => `${fmt(v * 1000)} mm`,
      explain: (b, a) => `Diffraction spreads light more through a narrower slit: ${fmt(b * 1000)} → ${fmt(a * 1000)} mm.`,
    },
  ];
  if (s.N > 1) {
    list.push(
      {
        id: "wider-d", change: "double the slit separation d", quantity: "the fringe spacing",
        apply: (x) => withSlits(x, { dUm: x.slits.dUm * 2 }), measure: spacing, format: (v) => `${fmt(v * 1000)} mm`,
        explain: (b, a) => `Fringe spacing ∝ 1/d: ${fmt(b * 1000)} → ${fmt(a * 1000)} mm. Slits that are further apart give finer fringes.`,
      },
      {
        id: "more-slits", change: "double the number of slits", quantity: "the width of each principal maximum (angular half-width)",
        apply: (x) => withSlits(x, { N: Math.min(20, x.slits.N * 2) }), measure: (i) => summarizeSlits(i.slits).principalHalfWidth ?? NaN, format: (v) => `${formatSI(v, "rad")}`,
        explain: (b, a) => `The width falls as 1/N: ${formatSI(b, "rad")} → ${formatSI(a, "rad")}.`,
      },
    );
  }
  return list.filter((sc) => { const after = sc.apply(inputs); return after !== null && Number.isFinite(sc.measure(inputs)) && Number.isFinite(sc.measure(after)); });
}

export const INTERFERENCE_CHALLENGES: Challenge<Ii>[] = [
  {
    id: "int-spacing-4mm", title: "Fringes 4.0 mm apart",
    prompt: "With two slits, make the bright fringes 4.0 mm apart (± 0.1 mm) on the screen (small-angle spacing λL/d).",
    check: (i) => { const r = summarizeSlits(i.slits); const met = i.slits.N === 2 && r.fringeSpacing !== null && Math.abs(r.fringeSpacing * 1000 - 4) <= 0.1; return { met, status: r.fringeSpacing === null ? "A single slit has no fringe spacing." : `${i.slits.N === 2 ? "" : `N = ${i.slits.N}; `}spacing ${fmt(r.fringeSpacing * 1000)} mm` }; },
    hint: "Spacing = λL/d. Keep d wider than the slit width a.", solution: "For λ = 500 nm and L = 2 m: d = λL/spacing = 500×10⁻⁹ × 2 / 0.004 = 250 µm.",
  },
  {
    id: "int-missing-3", title: "Make the third order disappear",
    prompt: "With two slits, make the third bright fringe (order m = 3) missing, because it falls on a diffraction minimum.",
    check: (i) => { const r = summarizeSlits(i.slits); const met = i.slits.N === 2 && r.missingOrders.includes(3); return { met, status: i.slits.N !== 2 ? "Use exactly two slits." : `d/a = ${fmt(i.slits.dUm / i.slits.aUm)}; missing orders: ${r.missingOrders.length ? r.missingOrders.slice(0, 5).join(", ") : "none"}` }; },
    hint: "An order is missing when m = k d/a.", solution: "Make d/a = 3 (or d/a = 3/2, 3/4 …): for d = 90 µm choose a = 30 µm. Then orders 3, 6, 9… are missing.",
  },
  {
    id: "int-central-20mm", title: "A central maximum 20 mm wide",
    prompt: "With a single slit, make the whole central bright band 20 mm wide (± 0.5 mm), measured between its first minima.",
    check: (i) => { const r = summarizeSlits(i.slits); const w = r.centralHalfWidth === null ? NaN : 2000 * r.centralHalfWidth; const met = i.slits.N === 1 && Math.abs(w - 20) <= 0.5; return { met, status: i.slits.N !== 1 ? "Use a single slit (N = 1)." : Number.isFinite(w) ? `Central band ${fmt(w)} mm wide` : "The slit is narrower than a wavelength: no minimum." }; },
    hint: "Full width ≈ 2λL/a.", solution: "For λ = 550 nm and L = 1.5 m: a = 2λL/width = 2 × 550×10⁻⁹ × 1.5 / 0.020 = 82.5 µm.",
  },
  {
    id: "int-four-secondary", title: "Four faint maxima between the bright ones",
    prompt: "Use a grating with exactly four secondary (subsidiary) maxima between adjacent principal maxima.",
    check: (i) => { const r = summarizeSlits(i.slits); const met = r.secondaryMaxima === 4; return { met, status: r.secondaryMaxima === null ? "A single slit has no secondary maxima of this kind." : `N = ${i.slits.N}: ${r.secondaryMaxima} secondary maxima` }; },
    hint: "There are N − 2 secondary maxima between principal maxima.", solution: "N = 6 slits.",
  },
];
