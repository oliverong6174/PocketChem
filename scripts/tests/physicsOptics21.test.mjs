// Stage 21: geometric optics and interference/diffraction. Expected values are worked out by hand (closed forms), by a geometric
// ray construction that does not use the lens equation, or by numerical integration/scanning of the intensity; none comes from
// the function under test.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, loadModule } from "./engine.mjs";

let O, S;
before(async () => { O = await loadModule("/src/utils/physics/optics.ts"); S = await loadModule("/src/utils/physics/interference.ts"); });
after(async () => { await closeEngine(); });

const near = (a, b, tol, label = "") => assert.ok(Math.abs(a - b) <= tol, `${label} expected ${b} +/- ${tol}, got ${a}`);
const img = (o = {}) => ({ element: "lens", f: 10, s: 25, h: 3, ...o });
const DEG = Math.PI / 180;

describe("thin lens and spherical mirror: 1/s + 1/s' = 1/f", () => {
  test("[lens beyond 2f] f = 10, s = 25: s' = 250/15 = 16.667 cm, m = -2/3, image 2 cm tall, real inverted reduced", () => {
    const r = O.solveImaging(img());
    near(r.sPrime, 50 / 3, 1e-12); near(r.m, -2 / 3, 1e-12); near(r.hPrime, -2, 1e-12);
    assert.deepEqual([r.nature, r.orientation, r.size, r.region], ["real", "inverted", "reduced", "beyond-2f"]);
  });
  test("[lens between f and 2f] s = 15: s' = 30, m = -2 (enlarged)", () => {
    const r = O.solveImaging(img({ s: 15 })); near(r.sPrime, 30, 1e-12); near(r.m, -2, 1e-12); assert.equal(r.size, "enlarged"); assert.equal(r.region, "between-f-and-2f");
  });
  test("[lens at 2f] s = 20: s' = 20, m = -1 (same size)", () => {
    const r = O.solveImaging(img({ s: 20 })); near(r.sPrime, 20, 1e-12); assert.equal(r.size, "same size"); assert.equal(r.region, "at-2f");
  });
  test("[lens inside f] s = 5: s' = -10 (virtual, same side), m = +2, upright and enlarged (magnifying glass)", () => {
    const r = O.solveImaging(img({ s: 5 })); near(r.sPrime, -10, 1e-12); near(r.m, 2, 1e-12);
    assert.deepEqual([r.nature, r.orientation, r.size, r.region], ["virtual", "upright", "enlarged", "inside-f"]);
  });
  test("[lens at the focal point] the image is at infinity: no number is invented", () => {
    const r = O.solveImaging(img({ s: 10 }));
    assert.equal(r.sPrime, null); assert.equal(r.m, null); assert.equal(r.hPrime, null); assert.equal(r.nature, "none"); assert.equal(r.region, "at-f");
  });
  test("[diverging lens] f = -10, s = 30: s' = -7.5 (virtual), m = +0.25, always virtual upright reduced", () => {
    const r = O.solveImaging(img({ f: -10, s: 30 })); near(r.sPrime, -7.5, 1e-12); near(r.m, 0.25, 1e-12);
    for (const s of [1, 5, 10, 50, 300]) { const q = O.solveImaging(img({ f: -10, s })); assert.deepEqual([q.nature, q.orientation, q.size], ["virtual", "upright", "reduced"], `s=${s}`); }
  });
  test("[concave mirror] f = 10 (R = 20), s = 30: s' = 15 cm in front, m = -0.5; inside f the image is virtual and upright", () => {
    const r = O.solveImaging(img({ element: "mirror", s: 30 })); near(r.sPrime, 15, 1e-12); near(r.m, -0.5, 1e-12); near(r.radius, 20, 1e-12); near(r.imageX, -15, 1e-12);
    const v = O.solveImaging(img({ element: "mirror", s: 4 })); assert.deepEqual([v.nature, v.orientation], ["virtual", "upright"]); near(v.sPrime, 40 / (4 - 10), 1e-12);
  });
  test("[convex mirror] f = -15, s = 30: s' = -10 (behind the mirror), m = +1/3", () => {
    const r = O.solveImaging(img({ element: "mirror", f: -15, s: 30 })); near(r.sPrime, -10, 1e-12); near(r.m, 1 / 3, 1e-12); near(r.imageX, 10, 1e-12); near(r.radius, -30, 1e-12);
  });
  test("[power] f = 20 cm is +5 dioptres; f = -50 cm is -2 dioptres", () => {
    near(O.solveImaging(img({ f: 20 })).power, 5, 1e-12); near(O.solveImaging(img({ f: -50 })).power, -2, 1e-12);
  });
  test("[the equation holds] 1/s + 1/s' = 1/f for a grid of objects, lens and mirror", () => {
    for (const element of ["lens", "mirror"]) for (const f of [-30, -5, 4, 12, 80]) for (const s of [1.5, 7, 13, 40, 250]) {
      const r = O.solveImaging(img({ element, f, s })); if (r.sPrime === null) continue;
      near(1 / s + 1 / r.sPrime, 1 / f, 1e-12, `${element} f=${f} s=${s}`);
    }
  });
});

describe("principal-ray construction agrees with the equation (independent geometry)", () => {
  const cases = [];
  for (const element of ["lens", "mirror"]) for (const f of [10, -15, 6]) for (const s of [3, 8, 14, 25, 60]) if (Math.abs(s - f) > 1e-9) cases.push({ element, f, s, h: 2 });
  test("[intersection] two principal rays meet (or their extensions do) at x = image x and y = m h; the third ray passes through the same point", () => {
    for (const c of cases) {
      const rays = O.principalRays(c); const r = O.solveImaging(c);
      const p = O.imageFromRays(rays[0], rays[2]);
      assert.ok(p, JSON.stringify(c));
      near(p.x, r.imageX, 1e-9, `x ${JSON.stringify(c)}`); near(p.y, r.hPrime, 1e-9, `y ${JSON.stringify(c)}`);
      const f = rays[1]; const cross = (p.x - f.hit.x) * f.dir.y - (p.y - f.hit.y) * f.dir.x;
      near(cross, 0, 1e-9, `third ray ${JSON.stringify(c)}`);
    }
  });
  test("[object at the focal point] the outgoing rays are parallel: no intersection", () => {
    const c = img({ s: 10 }); const rays = O.principalRays(c);
    assert.equal(O.imageFromRays(rays[0], rays[2]), null);
  });
  test("[rays leave the right way] after a lens real rays travel to +x; after a mirror they travel to -x", () => {
    for (const c of cases) for (const ray of O.principalRays(c)) assert.ok(c.element === "lens" ? ray.dir.x > 0 : ray.dir.x < 0, JSON.stringify([c, ray.id]));
  });
});

describe("refraction (Snell's law) and total internal reflection", () => {
  const R = (n1, n2, theta1) => O.solveRefraction({ n1, n2, theta1 });
  test("[air to glass] n = 1 -> 1.5 at 30 degrees: sin(theta2) = 0.5/1.5, theta2 = 19.4712 degrees, toward the normal", () => {
    const r = R(1, 1.5, 30); near(r.theta2, Math.asin(1 / 3) / DEG, 1e-9); near(r.theta2, 19.4712, 1e-3); assert.equal(r.bending, "toward the normal"); assert.equal(r.critical, null);
  });
  test("[water to air] critical angle asin(1/1.333) = 48.59 degrees; at 40 degrees it refracts to 58.99 degrees (away from the normal)", () => {
    near(R(4 / 3, 1, 10).critical, Math.asin(0.75) / DEG, 1e-9); near(R(4 / 3, 1, 10).critical, 48.5904, 1e-3);
    const r = R(4 / 3, 1, 40); near(r.theta2, 58.987, 5e-3); assert.equal(r.bending, "away from the normal"); assert.equal(r.tir, false);
  });
  test("[total internal reflection] 50 degrees in water is beyond 48.59: no refracted ray, reflection angle 50 degrees", () => {
    const r = R(4 / 3, 1, 50); assert.equal(r.tir, true); assert.equal(r.theta2, null); near(r.thetaReflected, 50, 1e-12);
  });
  test("[exactly critical] the refracted ray grazes the surface at 90 degrees and total internal reflection has not started", () => {
    const c = R(1.5, 1, 10).critical; const r = R(1.5, 1, c); assert.equal(r.tir, false); near(r.theta2, 90, 1e-6);
    assert.equal(R(1.5, 1, c + 0.01).tir, true);
  });
  test("[no TIR into a denser medium] light entering glass from air refracts at every angle up to 89.9 degrees", () => {
    for (const th of [0, 10, 45, 80, 89.9]) { const r = R(1, 1.5, th); assert.equal(r.tir, false); assert.ok(r.theta2 <= Math.asin(1 / 1.5) / DEG + 1e-9); }
  });
  test("[normal incidence] no bending", () => { const r = R(1, 1.7, 0); near(r.theta2, 0, 1e-12); assert.equal(r.bending, "undeviated"); });
  test("[same index] no bending at any angle", () => { const r = R(1.3, 1.3, 55); near(r.theta2, 55, 1e-9); assert.equal(r.bending, "undeviated"); });
  test("[Snell invariant and reversibility] n1 sin t1 = n2 sin t2, and the reversed ray retraces the path", () => {
    for (const [n1, n2, t] of [[1, 1.33, 20], [1.5, 1.2, 25], [1.2, 2.4, 70], [2, 1.1, 30]]) {
      const r = R(n1, n2, t); if (r.tir) continue;
      near(n1 * Math.sin(t * DEG), n2 * Math.sin(r.theta2 * DEG), 1e-12);
      near(R(n2, n1, r.theta2).theta2, t, 1e-9, `reverse ${n1} ${n2}`);
    }
  });
  test("[speed] v = c/n: light is slower in the denser medium", () => { const r = R(1, 1.5, 20); near(r.speed1, 1, 1e-12); near(r.speed2, 2 / 3, 1e-12); });
});

describe("optics validation: unsupported cases are refused, never clamped", () => {
  test("[imaging] zero or negative object distance, tiny focal length, NaN, unknown element, huge height", () => {
    for (const bad of [{ s: 0 }, { s: -5 }, { s: NaN }, { f: 0 }, { f: 0.5 }, { f: 1000 }, { h: 0 }, { h: 50 }, { element: "prism" }, { f: "10" }]) assert.equal(O.validateImaging(img(bad)).ok, false, JSON.stringify(bad));
    assert.equal(O.validateImaging(img({ f: -10 })).ok, true); assert.equal(O.validateImaging(null).ok, false);
  });
  test("[refraction] index below 1, above the limit, angle of 90 degrees or negative", () => {
    for (const bad of [{ n1: 0.9 }, { n2: 3.5 }, { theta1: 90 }, { theta1: -1 }, { theta1: NaN }]) assert.equal(O.validateRefraction({ n1: 1, n2: 1.5, theta1: 30, ...bad }).ok, false, JSON.stringify(bad));
    assert.equal(O.validateRefraction(O.DEFAULT_REFRACTION).ok, true);
  });
});

describe("single-slit diffraction", () => {
  const one = (o = {}) => ({ lambdaNm: 500, aUm: 50, dUm: 100, N: 1, L: 2, ...o });
  test("[central maximum] I(0) = 1 and the first minimum is at sin(theta) = lambda/a = 0.01, i.e. y = 2 tan(asin 0.01) = 20.001 mm", () => {
    near(S.intensityAtSin(one(), 0), 1, 1e-12); near(S.intensityAtSin(one(), 0.01), 0, 1e-12);
    near(S.summarizeSlits(one()).centralHalfWidth, 2 * 0.01 / Math.sqrt(1 - 1e-4), 1e-9); near(S.summarizeSlits(one()).centralHalfWidth, 0.020001, 1e-6);
  });
  test("[all minima] I = 0 at sin(theta) = m lambda/a for m = 1..5 and in between there is light", () => {
    for (let m = 1; m <= 5; m++) { near(S.intensityAtSin(one(), m * 0.01), 0, 1e-12, `m=${m}`); assert.ok(S.intensityAtSin(one(), (m + 0.5) * 0.01) > 1e-4); }
  });
  test("[first sidelobe] the brightest point between the first and second minima is 4.72 % of the central peak (beta = 4.4934)", () => {
    let best = 0; for (let k = 0; k <= 20000; k++) best = Math.max(best, S.intensityAtSin(one(), 0.01 + (0.01 * k) / 20000));
    near(best, (Math.sin(4.4934) / 4.4934) ** 2, 2e-4); near(best, 0.0472, 5e-4);
  });
  test("[narrower slit, wider pattern] halving the slit width doubles the central half-width", () => {
    near(S.summarizeSlits(one({ aUm: 25 })).centralHalfWidth / S.summarizeSlits(one()).centralHalfWidth, 2, 1e-3);
  });
  test("[energy] the integral of sinc^2(pi a x / lambda) over x = sin(theta) is lambda/a (within a small tail error)", () => {
    const s = one(); const X = 0.6; const n = 240000; let sum = 0;
    for (let k = 0; k <= n; k++) { const x = -X + (2 * X * k) / n; sum += S.intensityAtSin(s, x) * (k === 0 || k === n ? 0.5 : 1); }
    near((sum * 2 * X) / n, 500e-9 / 50e-6, 5e-5);
  });
  test("[one slit has no interference fringes] N = 1 gives no fringe spacing, no orders and no fringe count", () => {
    const r = S.summarizeSlits(one()); assert.equal(r.fringeSpacing, null); assert.equal(r.orders.length, 0); assert.equal(r.fringesInCentral, null);
  });
});

describe("double slit (Young) with finite slits", () => {
  const two = (o = {}) => ({ lambdaNm: 500, aUm: 50, dUm: 200, N: 2, L: 2, ...o });
  test("[fringe spacing] lambda L / d = 500e-9 x 2 / 200e-6 = 5.0 mm", () => { near(S.summarizeSlits(two()).fringeSpacing, 0.005, 1e-12); });
  test("[bright and dark fringes] d sin(theta) = m lambda is bright; (m + 1/2) lambda is exactly dark", () => {
    near(S.intensityAtSin(two({ aUm: 0.6 }), 0.0025) / S.envelopeAtSin(two({ aUm: 0.6 }), 0.0025), 1, 1e-9);
    for (let m = 0; m < 6; m++) near(S.intensityAtSin(two(), (m + 0.5) * 0.0025), 0, 1e-12, `dark ${m}`);
  });
  test("[equals envelope x cos^2] I = sinc^2(beta) cos^2(gamma) at arbitrary angles (independent closed form for N = 2)", () => {
    for (const s of [0.0003, 0.0011, 0.0042, 0.0123, 0.031]) {
      const beta = (Math.PI * 50e-6 * s) / 500e-9; const gamma = (Math.PI * 200e-6 * s) / 500e-9;
      near(S.intensityAtSin(two(), s), (Math.sin(beta) / beta) ** 2 * Math.cos(gamma) ** 2, 1e-12, `sin=${s}`);
    }
  });
  test("[first-order brightness] with a/d = 1/4 the first bright fringe has relative intensity sinc^2(pi/4) = 8/pi^2 = 0.8106", () => {
    const o = S.summarizeSlits(two()).orders[0]; near(o.m, 1, 0); near(o.intensity, 8 / (Math.PI * Math.PI), 1e-9); near(o.sinTheta, 0.0025, 1e-12);
  });
  test("[missing orders] d/a = 4: orders 4, 8, 12... fall on diffraction minima and have zero intensity; 3 fringes each side lie inside the central peak (7 in all)", () => {
    const r = S.summarizeSlits(two());
    assert.deepEqual(r.missingOrders.slice(0, 3), [4, 8, 12]); assert.equal(r.fringesInCentral, 7);
    for (const o of r.orders.slice(0, 12)) { if (o.m % 4 === 0) { assert.equal(o.missing, true); near(o.intensity, 0, 1e-9, `m=${o.m}`); } else { assert.equal(o.missing, false); assert.ok(o.intensity > 1e-3, `m=${o.m}`); } }
  });
  test("[missing orders for a non-integer ratio] d/a = 3.5: order m is missing when m a/d is a whole number, so the first missing order is 7 (k = 2), not 3 or 4", () => {
    const r = S.summarizeSlits(two({ dUm: 175 }));
    assert.deepEqual(r.missingOrders.slice(0, 3), [7, 14, 21]); assert.equal(r.fringesInCentral, 7); // orders 1..3 lie inside the central peak (3 < 3.5)
    assert.deepEqual(S.summarizeSlits(two({ dUm: 173 })).missingOrders.slice(0, 1), [173], "d/a = 3.46: the first coincidence is at m = 173 (50 m/173 = integer)");
  });
  test("[highest order] d sin(theta) = m lambda needs m < d/lambda: d = 200 um, 500 nm gives at most 399; d = 2.2 um gives 4", () => {
    assert.equal(S.summarizeSlits(two()).maxOrder, 399); assert.equal(S.summarizeSlits(two({ dUm: 2.2, aUm: 0.6 })).maxOrder, 4);
  });
  test("[path difference] at the m-th bright fringe the path difference is m wavelengths", () => {
    const s = two(); for (const o of S.summarizeSlits(s).orders.slice(0, 5)) near(S.pathDifferenceWavelengths(s, o.y), o.m, 1e-9, `m=${o.m}`);
    near(S.pathDifferenceWavelengths(s, 0), 0, 1e-12);
  });
  test("[exact geometry] the first-order fringe is at L tan(asin(lambda/d)), beyond the small-angle value for a large angle", () => {
    const s = { lambdaNm: 700, aUm: 0.6, dUm: 2, N: 2, L: 1 }; assert.equal(S.validateSlits(s).ok, true);
    near(S.summarizeSlits(s).firstOrderY, Math.tan(Math.asin(0.35)), 1e-12); assert.ok(S.summarizeSlits(s).firstOrderY > 0.35);
  });
});

describe("N slits and the diffraction grating", () => {
  const grating = (N, o = {}) => ({ lambdaNm: 500, aUm: 1, dUm: 100, N, L: 2, ...o });
  test("[principal maxima do not depend on N] I = envelope at d sin(theta) = m lambda for N = 2, 5, 12", () => {
    for (const N of [2, 5, 12]) for (let m = 0; m < 4; m++) near(S.intensityAtSin(grating(N), (m * 500e-9) / 100e-6), S.envelopeAtSin(grating(N), (m * 500e-9) / 100e-6), 1e-9, `N=${N} m=${m}`);
  });
  test("[zeros] N - 1 zeros between principal maxima, at d sin(theta) = (k/N) lambda", () => {
    for (const N of [3, 5, 8]) for (let k = 1; k < N; k++) near(S.intensityAtSin(grating(N), (k * 500e-9) / (N * 100e-6)), 0, 1e-9, `N=${N} k=${k}`);
  });
  test("[secondary maxima] N slits have N - 2 secondary maxima between principal maxima (counted by scanning the intensity)", () => {
    for (const N of [3, 4, 5, 7]) {
      const s = grating(N); const top = 500e-9 / 100e-6; const n = 20000; const v = [];
      for (let k = 0; k <= n; k++) v.push(S.intensityAtSin(s, (top * k) / n));
      let peaks = 0; for (let k = 1; k < n; k++) if (v[k] > v[k - 1] && v[k] >= v[k + 1]) peaks++;
      assert.equal(peaks, N - 2, `N=${N}`); assert.equal(S.summarizeSlits(s).secondaryMaxima, N - 2);
    }
  });
  test("[secondary maximum height] for N = 3 the single secondary maximum is 1/9 of the principal ones", () => {
    near(S.intensityAtSin(grating(3), 500e-9 / (2 * 100e-6)) / S.envelopeAtSin(grating(3), 500e-9 / (2 * 100e-6)), 1 / 9, 1e-9);
  });
  test("[sharper with more slits] the first zero beside a principal maximum is at sin = lambda/(N d): N = 10 gives 0.0005", () => {
    near(S.summarizeSlits(grating(10)).principalHalfWidth, 0.0005, 1e-12); near(S.intensityAtSin(grating(10), 0.0005), 0, 1e-9);
    assert.ok(S.summarizeSlits(grating(10)).principalHalfWidth < S.summarizeSlits(grating(2)).principalHalfWidth);
  });
  test("[dispersion] first-order angles for d = 2 um: 400 nm -> 11.537 degrees, 700 nm -> 20.487 degrees; red bends more than violet", () => {
    const g = { lambdaNm: 550, aUm: 0.6, dUm: 2, N: 5, L: 1.5 }; assert.equal(S.validateSlits(g).ok, true);
    const [v, r] = S.dispersion(g, [400, 700]); near(v.thetaDeg, 11.5370, 1e-3); near(r.thetaDeg, 20.4873, 1e-3); assert.ok(r.thetaDeg > v.thetaDeg);
    assert.equal(S.dispersion({ ...g, N: 1 }, [500])[0].thetaDeg, null);
  });
  test("[the pattern is symmetric and bounded] I(-s) = I(s), 0 <= I <= 1, I(0) = 1", () => {
    const s = grating(4, { aUm: 20 }); near(S.intensityAtSin(s, 0), 1, 1e-12);
    for (const x of [0.0007, 0.003, 0.012]) { near(S.intensityAtSin(s, -x), S.intensityAtSin(s, x), 1e-12); assert.ok(S.intensityAtSin(s, x) >= 0 && S.intensityAtSin(s, x) <= 1 + 1e-12); }
  });
});

describe("slit validation and the far-field condition", () => {
  const ok = { lambdaNm: 550, aUm: 20, dUm: 100, N: 2, L: 1.5 };
  test("[valid defaults]", () => { assert.equal(S.validateSlits(S.DEFAULT_SLITS).ok, true); assert.equal(S.validateSlits(ok).ok, true); });
  test("[rejected] wavelength outside the visible range, slit not narrower than the spacing, non-integer N, zero slits, screen too near, NaN", () => {
    for (const bad of [{ lambdaNm: 300 }, { lambdaNm: 900 }, { aUm: 100 }, { aUm: 150 }, { N: 1.5 }, { N: 0 }, { N: 21 }, { L: 0.1 }, { L: NaN }, { dUm: 1 }, { aUm: 0.1 }]) assert.equal(S.validateSlits({ ...ok, ...bad }).ok, false, JSON.stringify(bad));
  });
  test("[far-field condition] a wide grating on a near screen is refused with the Fresnel number in the message, and accepted when the screen is moved back", () => {
    const wide = { lambdaNm: 500, aUm: 20, dUm: 500, N: 20, L: 0.3 };
    const bad = S.validateSlits(wide); assert.equal(bad.ok, false); assert.match(bad.errors[0], /Fresnel number/);
    near(S.fresnelNumber(wide), (19 * 500e-6 + 20e-6) ** 2 / (500e-9 * 0.3), 1e-6);
    assert.equal(S.validateSlits({ ...wide, N: 2, L: 3 }).ok, true);
  });
  test("[single slit ignores d] N = 1 does not require d > a, and a missing d is still refused", () => {
    assert.equal(S.validateSlits({ lambdaNm: 500, aUm: 50, dUm: 10, N: 1, L: 2 }).ok, true);
    assert.equal(S.validateSlits({ lambdaNm: 500, aUm: 50, N: 1, L: 2 }).ok, false);
  });
  test("[colour helper] 550 nm is green-dominant, 650 nm red-dominant, 450 nm blue-dominant", () => {
    const rgb = (nm) => S.wavelengthColor(nm).match(/\d+/g).map(Number);
    let [r, g, b] = rgb(550); assert.ok(g > r && g > b); [r, g, b] = rgb(650); assert.ok(r > g && r > b); [r, g, b] = rgb(450); assert.ok(b > r && b > g);
  });
});
