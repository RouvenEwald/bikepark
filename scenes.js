/* Bikepark Lernkarten – Szenen für alle 44 Karten.
   Jede Szene gehört zu genau einer Karte (content.json → anim.scene).
   Seitenansicht: Gelände aus Bausteinen + Pose pro Modus (F = so nicht, R = so geht's). */
import { B, track, P, mix, lerp, clamp, ss, win, f1, arrowD, vis, set, el, COL } from "./engine.js";

const rep = (arr, n) => Array.from({ length: n }, () => arr).flat();
function pumpE(k, sign, ahead = 8, scale = .37, key = "e") {
  const sl = k.slope(k.x + ahead) / scale, e = .5 + .5 * clamp(sign * sl, -1, 1);
  k.s[key] = (k.s[key] ?? .5) + (e - (k.s[key] ?? .5)) * Math.min(1, k.dt * 9);
  return k.s[key];
}
function smoothTo(s, key, target, rate, dt) { s[key] = (s[key] ?? target) + (target - (s[key] ?? target)) * Math.min(1, dt * rate); return s[key]; }
// Luftspalt unter dem Vorderrad anzeigen
function gapBuild(M) { return { gap: M.path({ "stroke-width": 3, opacity: 0 }) }; }
function gapShow(o, k) {
  if (k.s.air) {
    const fw = k.frontW, gy = k.g(fw[0]), a = k.scr(fw[0], fw[1] + 37), b = k.scr(fw[0], gy);
    if (b[1] - a[1] > 4) { set(o.gap, { d: `M${f1(a[0])} ${f1(a[1] + 2)} L${f1(b[0])} ${f1(b[1] - 2)}`, stroke: "var(--bad)", opacity: 1 }); k.bottom("LUFT UNTER DEN RÄDERN", a[0]); return true; }
  }
  vis(o.gap, 0); return false;
}
function downArrow(o, key, pt, len, width, col) { set(o[key], { d: arrowD(pt[0], pt[1] - len - 6, 0, len, 6), stroke: col, "stroke-width": width, opacity: 1 }); }
function groundPath(g, x0, x1, off = -1) { let d = ""; for (let x = x0; x <= x1; x += 3) d += (x === x0 ? "M" : " L") + x + " " + f1(g(x) + off); return d; }

export const SCENES = {
  /* ---------- Modul 1 ---------- */
  ready: {
    kind: "side", trace: true, speed: 105,
    track: track([B.flat(150), ...rep([B.flat(40), B.wave(64, 17), B.flat(86), B.root(16, 8), B.flat(94)], 3)]),
    pose: m => m === "F" ? { ...P.stiff } : { steady: { nominal: [-18, -66], follow: .18 }, torso: 36, heel: 24 },
    build: M => ({ heel: M.path({ "stroke-width": 2.5 }) }),
    fx(o, m, k) {
      const he = k.scr(...k.toW(...k.out.heel));
      if (k.p < .5) {
        k.bottom(m === "F" ? "FERSE OBEN" : "FERSE UNTEN", he[0]);
        set(o.heel, { opacity: 1, stroke: COL[m], d: m === "F" ? arrowD(he[0], he[1] + 18, 0, -12, 4) : arrowD(he[0], he[1] + 4, 0, 12, 4) });
      } else { vis(o.heel, 0); k.top(m === "F" ? "KOPF HÜPFT" : "KOPF BLEIBT GLEICH HOCH"); }
    },
  },
  hands: {
    kind: "side", speed: 110,
    track: track([B.flat(250), B.root(18, 11), B.flat(200), B.root(18, 11), B.flat(500)]),
    pose: m => m === "F" ? { hip: [4, -74], torso: 40, heel: 10 } : { hip: [-20, -64], torso: 34, heel: 24 },
    build: M => ({ hand: M.path({ "stroke-linecap": "round" }), foot: M.path({ "stroke-linecap": "round" }) }),
    fx(o, m, k) {
      const gp = k.scr(...k.toW(...k.out.grip)), fp = k.scr(...k.toW(...k.out.pedal));
      const heavy = COL[m], light = "var(--muted)";
      downArrow(o, "hand", [gp[0], gp[1] - 10], m === "F" ? 30 : 12, m === "F" ? 7 : 2.5, m === "F" ? heavy : light);
      downArrow(o, "foot", [fp[0] + 22, fp[1] + 4], m === "F" ? 12 : 30, m === "F" ? 2.5 : 7, m === "F" ? light : heavy);
      k.top(m === "F" ? "GEWICHT AUF DEN HÄNDEN" : "GEWICHT AUF DEN FÜSSEN");
    },
  },
  absorb: {
    kind: "side", speed: 190, flight: { F: true }, grav: 440,
    track: track([B.flat(240), ...rep([B.wave(120, 22)], 7), B.flat(400)]),
    pose: (m, k) => m === "F" ? { hip: [-8, -78], torso: 48, heel: 8 } : { ...P.stance(pumpE(k, 1, 4, .58)), heel: 22, absorb: 1 },
    build: M => gapBuild(M),
    fx(o, m, k) { if (!gapShow(o, k) && m === "R" && k.p > .3) k.bottom("RÄDER BLEIBEN UNTEN", 200); },
  },

  /* ---------- Modul 2 ---------- */
  brake: {
    kind: "side", hud: "brake",
    track: track([B.grain(2400, 1.4)]),
    onReset: (m, s) => { s.v = 210; s.flag = null; s.stop = null; s.bk = 0; },
    vel(m, p, s, dt) {
      if (p > .2) { if (s.flag == null) s.flag = s.x + 60; s.v = Math.max(0, s.v - (m === "R" ? 300 : 115) * dt); if (s.v === 0 && s.stop == null) s.stop = s.x + 60; }
      else s.v = 210;
      return s.v;
    },
    pose(m, k) {
      const held = k.p > .2, braking = held && k.v > 0, b = smoothTo(k.s, "bk", held ? 1 : 0, 8, k.dt);
      if (m === "F") return { hip: mix([-18, -66], [-14, -70], b), torso: lerp(36, 42, b), heel: lerp(24, 6, b), brakeR: b, lockR: braking && b > .5 };
      return { hip: mix([-18, -66], [-26, -60], b), torso: lerp(36, 30, b), heel: lerp(24, 30, b), brakeF: b * .85, brakeR: b * .3, cf: b * .6 * (braking ? 1 : .4) };
    },
    build: (M, U) => {
      const flag = U.g({ opacity: 0 });
      el("line", { x1: 0, y1: 0, x2: 0, y2: -30, stroke: "var(--fg)", "stroke-width": 2 }, flag);
      el("path", { d: "M0 -30 L16 -25 L0 -20 Z", fill: "var(--brake)" }, flag);
      return { flag, meas: U.line({ "stroke-width": 3, opacity: 0 }) };
    },
    fx(o, m, k) {
      if (k.s.flag == null) { vis(o.flag, 0); vis(o.meas, 0); return; }
      const gy = k.g(k.s.flag), end = k.s.stop ?? (k.x + 60);
      set(o.flag, { transform: `translate(${f1(k.s.flag)} ${f1(gy)})`, opacity: 1 });
      set(o.meas, { x1: f1(k.s.flag), y1: f1(gy + 16), x2: f1(end), y2: f1(gy + 16), stroke: COL[m], opacity: 1 });
      if (k.s.stop != null) k.bottom(m === "F" ? "LANGER BREMSWEG" : "KURZER BREMSWEG", k.scr((k.s.flag + end) / 2, 0)[0]);
      else k.bottom("BREMSEN", k.scr(k.s.flag, 0)[0]);
    },
  },
  brakePos: {
    kind: "side", hud: "brake",
    track: track([B.flat(300), B.steep(400, 7), B.flat(1200)]),
    onReset: (m, s) => { s.v = 200; s.bk = 0; },
    vel(m, p, s, dt) { if (p > .3) s.v = Math.max(0, s.v - 250 * dt); else s.v = 200; return s.v; },
    pose(m, k) {
      const held = k.p > .3, braking = held && k.v > 0, b = smoothTo(k.s, "bk", held ? 1 : 0, 7, k.dt);
      if (m === "F") return { hip: mix([-18, -66], [2, -74], b), torso: lerp(36, 50, b), heel: lerp(24, -4, b), brakeF: .95 * b, brakeR: .1 * b, rearLift: braking && b > .6 ? 10 : 0, cf: .5 * b };
      return { hip: mix([-18, -66], [-28, -60], b), torso: lerp(36, 28, b), heel: lerp(24, 32, b), brakeF: .85 * b, brakeR: .3 * b, cf: .6 * b * (braking ? 1 : .4) };
    },
    fx(o, m, k) { if (k.s.bk > .5) k.top(m === "F" ? "HINTERRAD HEBT AB" : "FERSEN UNTEN, PO ZURÜCK"); },
  },

  /* ---------- Modul 4 ---------- */
  pump: {
    kind: "side", zones: true, hud: "speed", speed: 118,
    track: track(rep([B.wave(170, 20)], 9)),
    speedVal: (m, p) => m === "R" ? .3 + .65 * p : .7 - .55 * p,
    pose: (m, k) => ({ ...P.stance(pumpE(k, m === "R" ? 1 : -1)), heel: 20 }),
    build: M => {
      const arrow = M.g({ opacity: 0 });
      el("path", { d: "M0 -18 L0 10 M-8 2 L0 10 L8 2", "stroke-width": 4, fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round" }, arrow);
      el("text", { x: 14, y: 0, "font-size": 14 }, arrow).textContent = "DRUCK";
      return { arrow, prev: .5 };
    },
    fx(o, m, k) {
      const de = k.s.e - o.prev; o.prev = k.s.e;
      set(o.arrow, { transform: "translate(300 64)", stroke: COL[m], fill: COL[m], opacity: clamp(de * 60, 0, 1).toFixed(2) });
    },
  },
  handsFeet: {
    kind: "side", speed: 95,
    track: track([B.flat(240), B.wave(220, 28), B.flat(260), B.wave(220, 28), B.flat(600)]),
    pose(m, k) {
      const sF = k.slope(k.x + 60) / .4, sR = k.slope(k.x - 60) / .4, sC = k.slope(k.x) / .4;
      const ea = smoothTo(k.s, "ea", .5 + .5 * clamp(sF, -1, 1), 9, k.dt);
      const el_ = smoothTo(k.s, "el", .5 + .5 * clamp(m === "R" ? sR : sC, -1, 1), 9, k.dt);
      return { hip: mix([-14, -54], [-18, -78], el_), torso: m === "R" ? lerp(24, 48, ea) : 30, heel: 20 };
    },
    build: M => ({ a: M.path({ "stroke-width": 4 }), pa: .5, pl: .5 }),
    fx(o, m, k) {
      const da = k.s.ea - o.pa, dl = k.s.el - o.pl; o.pa = k.s.ea; o.pl = k.s.el;
      const gp = k.scr(...k.toW(...k.out.grip)), fp = k.scr(...k.toW(...k.out.pedal));
      if (m === "R" && da > .002 && da * 2 > dl) { downArrow(o, "a", [gp[0], gp[1] - 8], 24, 4, COL.R); k.top("1 HÄNDE DRÜCKEN"); }
      else if (dl > .002) { downArrow(o, "a", [fp[0] + 22, fp[1] + 2], 24, 4, COL[m]); k.top(m === "R" ? "2 FÜSSE DRÜCKEN" : "NUR DIE FÜSSE"); }
      else { vis(o.a, 0); if (m === "F") k.top("ARME BLEIBEN STEIF"); }
    },
  },
  rollers: {
    kind: "side", speed: 205, flight: { F: true }, grav: 380,
    track: track([B.flat(240), ...rep([B.wave(120, 22)], 10), B.flat(400)]),
    pose: (m, k) => m === "F" ? { hip: [-10, -76], torso: 44, heel: 10 } : { ...P.stance(pumpE(k, 1, 4, .37)), heel: 20, absorb: 1 },
    build: M => gapBuild(M),
    fx(o, m, k) { if (!gapShow(o, k) && m === "R" && k.p > .3) k.bottom("RÄDER BLEIBEN AM BODEN", 200); },
  },
  noPedal: {
    kind: "side", hud: "speed", speed: 118,
    track: track(rep([B.wave(170, 20)], 9)),
    speedVal: (m, p) => m === "R" ? .3 + .65 * p : .65 - .45 * p,
    pose(m, k) {
      if (m === "F") { k.s.crank = (k.s.crank || 0) + k.dt * 7; return { ...P.stance(.6), heel: 18, crank: k.s.crank }; }
      return { ...P.stance(pumpE(k, 1)), heel: 20, crank: 0 };
    },
    fx(o, m, k) { k.top(m === "F" ? "TRETEN" : "NUR DRÜCKEN, KURBEL STEHT"); },
  },

  /* ---------- Modul 5 ---------- */
  frontLift: {
    kind: "side", speed: 90,
    track: track([B.flat(420), B.root(22, 16), B.flat(900)]),
    pose(m, k) {
      const u = (k.x + 60) - 420; // Vorderachse relativ zur Wurzel
      const cw = win(u, -100, -88, -72, -64), lw = win(u, -66, -54, 6, 30);
      if (m === "R") return { hip: mix(mix([-18, -66], [-16, -54], cw), [-32, -60], lw), torso: lerp(lerp(36, 30, cw), 48, lw), heel: 24, lift: 20 * lw };
      return { hip: [-14, -66], torso: lerp(36, 58, lw), heel: 20, lift: 4 * lw };
    },
    fx(o, m, k) {
      const u = (k.x + 60) - 420;
      if (m === "R" && u > -66 && u < 30) k.top("PO NACH HINTEN, ARME LANG");
      if (m === "F" && u > -66 && u < 30) k.top("ZIEHT MIT KRUMMEN ARMEN");
      if (m === "F" && u > -6 && u < 26) k.bottom("STÖSST AN DIE WURZEL", k.scr(431, 0)[0]);
    },
  },
  manual: {
    kind: "side", speed: 120,
    track: track([B.grain(2400, .8)]),
    pose(m, k) {
      if (m === "R") { const lw = win(k.p, .1, .2, .8, .88); return { hip: mix([-18, -66], [-44, -50], lw), torso: lerp(36, 52, lw), heel: 26, lift: 17 * lw, brakeR: .15 * lw }; }
      const lw = win(k.p, .1, .18, .26, .34) + win(k.p, .5, .58, .63, .71);
      return { hip: mix([-18, -66], [-22, -62], lw), torso: lerp(36, 40, lw), heel: 20, lift: 13 * lw };
    },
    build: (M, U) => ({ meas: U.line({ "stroke-width": 3, opacity: 0 }) }),
    fx(o, m, k) {
      const up = k.s.lift > 6;
      if (up && k.s.mstart == null) k.s.mstart = k.frontW[0];
      if (!up && k.s.mstart != null) { k.s.mlast = [k.s.mstart, k.frontW[0]]; k.s.mstart = null; }
      const seg = k.s.mstart != null ? [k.s.mstart, k.frontW[0]] : k.s.mlast;
      if (seg) {
        const gy = k.g(seg[1]) + 14;
        set(o.meas, { x1: f1(seg[0]), y1: f1(gy), x2: f1(seg[1]), y2: f1(gy), stroke: COL[m], opacity: 1 });
        k.bottom(`${((seg[1] - seg[0]) / 100).toFixed(1).replace(".", ",")} m IN DER LUFT`, k.scr((seg[0] + seg[1]) / 2, 0)[0]);
      } else vis(o.meas, 0);
    },
  },
  bunnyHop: {
    kind: "side", speed: 140, flight: { F: true, R: true }, grav: 700,
    track: track([B.flat(470), B.root(16, 18), B.flat(1000)]),
    pose(m, k) {
      const dF = 470 - (k.x + 60), dR = 470 - (k.x - 60);
      if (k.air) return m === "R" ? { hip: [-14, -56], torso: 34, heel: 18, airLevel: 7 } : { hip: [-12, -70], torso: 42, heel: 12 };
      if (k.s.hopped) return { ...P.ready };
      const cw = win(dF, 130, 118, 102, 92);
      if (m === "R") {
        const lw = clamp((92 - dF) / 14, 0, 1);
        return { hip: mix(mix([-18, -66], [-16, -54], cw), [-34, -58], lw), torso: lerp(lerp(36, 30, cw), 48, lw), heel: 24, lift: 18 * lw, hop: dR < 32 ? 200 : 0 };
      }
      return { hip: mix([-18, -66], [-14, -54], win(dF, 70, 55, 30, 24)), torso: 32, heel: 18, hop: dF < 25 ? 160 : 0 };
    },
    fx(o, m, k) {
      const dF = 470 - (k.x + 60);
      if (m === "R") {
        if (k.air) k.top(k.s.t - k.s.takeT < .22 ?"2 FÜSSE NACH HINTEN SCHIEBEN" : "3 BIKE HOCHZIEHEN");
        else if (!k.s.hopped && dF < 92) k.top("1 VORDERRAD HOCH");
      } else if (!k.air && k.rearW[0] > 452 && k.rearW[0] < 500) k.bottom("HINTERRAD TRIFFT DEN STOCK", k.scr(478, 0)[0]);
    },
  },
  ledge: {
    kind: "side", speed: 100,
    track: track([B.flat(470), B.ledge(20, 16), B.flat(1000)]),
    pose(m, k) {
      const uF = (k.x + 60) - 480, uR = (k.x - 60) - 480;
      if (m === "F") return { hip: [-14, -68], torso: 40, heel: 18 };
      const lw = win(uF, -62, -48, 6, 22), rw = win(uR, -46, -32, 4, 18);
      return { hip: mix(mix([-18, -66], [-30, -62], lw), [-6, -74], rw), torso: lerp(lerp(36, 46, lw), 40, rw), heel: 22, lift: 14 * lw, rearLift: 9 * rw };
    },
    fx(o, m, k) {
      const uF = (k.x + 60) - 480, uR = (k.x - 60) - 480;
      if (m === "F") { if (uR > -14 && uR < 16) k.bottom("HINTEN KNALLT ES", k.scr(480, 0)[0]); }
      else if (uF > -62 && uF < 22) k.top("1 VORDERRAD HOCH");
      else if (uR > -46 && uR < 18) k.top("2 BEINE ANZIEHEN");
    },
  },

  /* ---------- Modul 6 ---------- */
  tableRoll: {
    kind: "side", speed: { F: 245, R: 150 }, flight: { F: true }, grav: 520,
    track: track([B.flat(300), B.table(80, 110, 110, 30), B.flat(1400)]),
    pose: (m, k) => m === "F" ? { hip: [-8, -78], torso: 48, heel: 10, airLevel: 2.5 } : { ...P.stance(pumpE(k, 1, 0, .6)), heel: 20, absorb: 1 },
    build: M => gapBuild(M),
    fx(o, m, k) { if (!gapShow(o, k) && m === "R" && k.x > 260 && k.x < 640) k.bottom("RÄDER BLEIBEN AM BODEN", 200); },
  },
  takeoff: {
    kind: "side", speed: 255, flight: { F: true, R: true }, grav: 520, x0: 90,
    track: track([B.flat(300), B.table(90, 110, 120, 34), B.flat(1400)]),
    pose(m, k) {
      const q = (k.x + 30 - 300) / 90; // Position auf der Rampe
      if (k.air) return m === "R" ? { hip: [-18, -70], torso: 38, heel: 20, airLevel: 4 } : { hip: [-28, -62], torso: 58, heel: 14, airPitch: -38 };
      if (k.s.land) return { ...P.ready };
      if (m === "R") {
        const arms = ss(0, .5, q), legs = ss(.45, 1, q), pre = win(q, -.6, -.2, 0, .05);
        return { hip: mix(mix([-18, -66], [-14, -52], pre), [-18, -80], legs), torso: lerp(lerp(36, 26, pre), 46, arms), heel: 20 };
      }
      const pull = ss(.4, 1, q);
      return { hip: mix([-18, -66], [-28, -62], pull), torso: lerp(36, 58, pull), heel: 18 };
    },
    build: (M, U, g) => {
      const a = U.path({ d: groundPath(g, 300, 345), stroke: "var(--brake)", "stroke-width": 6, opacity: 0 });
      const b = U.path({ d: groundPath(g, 345, 390), stroke: "var(--good)", "stroke-width": 6, opacity: 0 });
      const ta = U.text({ x: 322, y: f1(g(322) + 22), fill: "var(--brake)", "font-size": 13, opacity: 0 }); ta.textContent = "ARME";
      const tb = U.text({ x: 372, y: f1(g(372) + 22), fill: "var(--good)", "font-size": 13, opacity: 0 }); tb.textContent = "BEINE";
      return { zr: [a, b, ta, tb] };
    },
    fx(o, m, k) {
      o.zr.forEach(e => vis(e, m === "R"));
      if (k.air) k.top(m === "F" ? "VORDERRAD STEIGT" : "BIKE FLIEGT GERADE");
      else if (k.s.land) k.bottom(k.s.land.rel < -6 ? "HINTEN ZUERST GELANDET" : "BEIDE RÄDER GLEICHZEITIG", 200);
    },
  },
  landing: {
    kind: "side", speed: 255, flight: { F: true, R: true }, grav: 520, x0: 90, hud: "brake",
    track: track([B.flat(300), B.table(90, 110, 120, 34), B.flat(1400)]),
    pose(m, k) {
      const land = k.s.land, since = land ? k.s.t - land.t : -1;
      if (m === "F") {
        if (k.air) return { hip: [-16, -68], torso: 44, heel: 14, airPitch: -30, lookL: [72, 8], lookBad: true };
        if (land) return { hip: [-14, -70], torso: 44, heel: 10, brakeR: 1, brakeF: .3, lockR: since < .7, lookL: [72, 8], lookBad: true };
        return { ...P.ready, lookL: [72, 8], lookBad: true };
      }
      const lw = { lookW: [620, k.g(620)] };
      if (k.air) return { hip: [-18, -70], torso: 38, heel: 22, airLevel: 4, ...lw };
      if (land) { const a = Math.exp(-since * 4) * Math.min(1, since * 12); return { hip: mix([-18, -66], [-14, -50], a), torso: lerp(36, 28, a), heel: 26, lookW: [k.x + 260, k.g(k.x + 260)] }; }
      return { ...P.ready, ...lw };
    },
    fx(o, m, k) {
      if (k.s.land) k.bottom(m === "F" ? "HINTEN ZUERST, DANN GEBREMST" : "BEIDE RÄDER, BEINE FEDERN", 200);
      else if (k.air) k.top(m === "F" ? "BLICK AUFS VORDERRAD" : "BLICK ZUR LANDUNG");
    },
  },

  /* ---------- Modul 7 ---------- */
  drop: {
    kind: "side", speed: { F: 70, R: 210 }, flight: { R: true }, grav: 520,
    track: track([B.flat(420), B.drop(1, 48), B.flat(1400)]),
    pose(m, k) {
      const uF = (k.x + 60) - 421;
      if (m === "F") { const tilt = clamp((k.s.pitch || 0) / .35, 0, 1); return { hip: mix([-18, -66], [2, -70], tilt), torso: lerp(36, 52, tilt), heel: lerp(24, 0, tilt) }; }
      if (k.air) return { hip: [-24, -66], torso: 40, heel: 22, airLevel: 6 };
      if (k.s.land) { const a = Math.exp(-(k.s.t - k.s.land.t) * 4); return { hip: mix([-18, -66], [-14, -52], a), torso: 34, heel: 26 }; }
      const push = win(uF, -50, -20, 30, 60);
      return { hip: mix([-18, -66], [-34, -60], push), torso: lerp(36, 46, push), heel: 24, lift: 7 * win(uF, -20, -5, 30, 60) };
    },
    build: (M, U, g) => {
      const e = U.path({ d: `M421 ${g(420) - 3} L421 ${g(422) + 2}`, stroke: "var(--brake)", "stroke-width": 3, "stroke-dasharray": "4 4" });
      return { e };
    },
    fx(o, m, k) {
      const uF = (k.x + 60) - 421;
      if (m === "F") { if ((k.s.pitch || 0) > .12) k.top("VORDERRAD KIPPT NACH UNTEN"); }
      else if (k.s.land) k.bottom("LANDUNG AUF BEIDEN RÄDERN", 200);
      else if (uF > -50 && uF < 60) k.top("BIKE NACH VORNE SCHIEBEN");
    },
  },
  dropLand: {
    kind: "side", speed: 210, flight: { F: true, R: true }, grav: 520, trace: true,
    track: track([B.flat(400), B.drop(1, 44), B.flat(1400)]),
    pose(m, k) {
      const land = k.s.land, since = land ? k.s.t - land.t : -1;
      if (m === "F") {
        const jolt = land ? 14 * Math.exp(-since * 10) * Math.min(1, since * 40) : 0;
        return { hip: [-8, -80 + jolt], torso: 50, heel: 4, airLevel: 6, neck: land ? Math.exp(-since * 8) : 0 };
      }
      const a = land ? Math.sin(Math.min(Math.PI, since * 5)) * Math.exp(-since * 1.5) : 0;
      return { hip: mix([-18, -68], [-14, -50], a), torso: lerp(38, 28, a), heel: 24, airLevel: 6 };
    },
    fx(o, m, k) { if (k.s.land) k.top(m === "F" ? "HARTER SCHLAG" : "KNIE UND ARME FEDERN"); },
  },

  /* ---------- Modul 8 ---------- */
  steep: {
    kind: "side", speed: 95,
    track: track([B.flat(300), B.steep(420, 30), B.flat(1000)]),
    pose: m => m === "F" ? { hip: [-48, -48], torso: 52, heel: 8 } : { hip: [-24, -58], torso: 34, heel: 30 },
    build: M => ({ plumb: M.path({ "stroke-width": 2, "stroke-dasharray": "4 4" }), bb: M.circle({ r: 4.5, opacity: 0 }) }),
    fx(o, m, k) {
      const com = mix(k.out.hip, k.out.sh, .35), cw = k.toW(com[0], com[1]), bbw = k.toW(k.out.bb[0], k.out.bb[1]);
      const a = k.scr(cw[0], cw[1]), b = k.scr(cw[0], k.g(cw[0])), bb = k.scr(bbw[0], bbw[1]);
      set(o.plumb, { d: `M${f1(a[0])} ${f1(a[1])} L${f1(b[0])} ${f1(b[1])}`, stroke: COL[m] });
      set(o.bb, { cx: f1(bb[0]), cy: f1(bb[1]), fill: COL[m], opacity: 1 });
      if (k.x > 300) k.top(m === "F" ? "VORDERRAD OHNE DRUCK" : "GEWICHT ÜBER DEN PEDALEN");
    },
  },
  steepBrake: {
    kind: "side", hud: "brake",
    track: track([B.flat(420), B.steep(320, 26), B.flat(1200)]),
    onReset: (m, s) => { s.v = 190; },
    vel(m, p, s, dt) {
      const x = s.x;
      if (m === "R") { if (x > 250 && x < 400) s.v = Math.max(85, s.v - 260 * dt); }
      else if (x > 440) s.v = Math.max(60, s.v - 70 * dt);
      return s.v;
    },
    pose(m, k) {
      const inSteep = k.x > 430 && k.x < 760;
      if (m === "F") { const hard = k.x > 440 && k.x < 760; return { hip: inSteep ? [-30, -58] : [-18, -66], torso: 36, heel: 22, brakeF: hard ? 1 : 0, brakeR: hard ? 1 : 0, lockR: hard, lockF: hard && k.x > 470 }; }
      const zone = k.x > 250 && k.x < 400;
      return { hip: inSteep ? [-26, -58] : [-18, -66], torso: 34, heel: 26, brakeF: zone ? .8 : inSteep ? .4 : 0, brakeR: zone ? .3 : inSteep ? .2 : 0, cf: zone ? .5 : 0 };
    },
    build: (M, U, g) => ({
      zR: U.path({ d: groundPath(g, 310, 460), stroke: "var(--brake)", "stroke-width": 6 }),
      zF: U.path({ d: groundPath(g, 500, 700), stroke: "var(--brake)", "stroke-width": 6 }),
    }),
    fx(o, m, k) {
      vis(o.zR, m === "R"); vis(o.zF, m === "F");
      if (m === "F" && k.pose.lockR) k.top("RÄDER RUTSCHEN");
      if (m === "R") { if (k.x > 250 && k.x < 400) k.top("OBEN BREMSEN"); else if (k.x > 430 && k.x < 760) k.top("IM STEILEN SANFT"); }
    },
  },
  roots: {
    kind: "side", hud: "brake",
    track: track([B.flat(470), B.root(22, 9), B.flat(1200)]),
    onReset: (m, s) => { s.v = 160; },
    vel(m, p, s, dt) {
      const xf = s.x + 60, xr = s.x - 60;
      if (m === "R" && xf > 320 && xf < 450) s.v = Math.max(80, s.v - 170 * dt);
      if (m === "F" && xr > 455 && xr < 500) s.v = Math.max(60, s.v - 90 * dt);
      return s.v;
    },
    pose(m, k) {
      const xf = k.x + 60, xr = k.x - 60;
      if (m === "R") { const zone = xf > 320 && xf < 450; return { ...P.ready, brakeF: zone ? .8 : 0, brakeR: zone ? .3 : 0 }; }
      const onRoot = xr > 455 && xr < 500;
      return { ...P.ready, brakeR: onRoot ? 1 : 0, brakeF: onRoot ? .6 : 0, lockR: onRoot };
    },
    build: (M, U, g) => ({
      root: U.path({ d: groundPath(g, 470, 492, 2), stroke: "var(--root)", "stroke-width": 7 }),
      wet: U.text({ x: 481, y: f1(g(481) + 24), "font-size": 12, fill: "var(--muted)" }),
      zR: U.path({ d: groundPath(g, 320, 450), stroke: "var(--brake)", "stroke-width": 6 }),
    }),
    fx(o, m, k) {
      o.wet.textContent = "NASS"; vis(o.zR, m === "R");
      const xf = k.x + 60, xr = k.x - 60;
      if (m === "F" && k.pose.lockR) k.top("HINTERRAD RUTSCHT");
      if (m === "R") { if (xf > 320 && xf < 450) k.top("VOR DER WURZEL BREMSEN"); else if (xf > 460 && xr < 500) k.top("AUF DER WURZEL: BREMSE LOS"); }
    },
  },

  /* ---------- Modul 9 ---------- */
  relaxed: {
    kind: "side", speed: 150, trace: true,
    track: track([B.flat(160), B.wave(120, 16), B.root(16, 7), B.flat(60), B.wave(120, 18), B.wave(120, 18), B.root(16, 8), B.flat(80), B.table(60, 60, 70, 16), B.flat(60), B.wave(120, 16), B.flat(800)]),
    pose: m => m === "F" ? { hip: [-10, -76], torso: 52, heel: 6, neck: 1 } : { steady: { nominal: [-18, -66], follow: .15 }, torso: 36, heel: 24 },
    fx(o, m, k) { k.top(m === "F" ? "SCHULTERN HOCH, KOPF UNRUHIG" : "LOCKER, KOPF BLEIBT RUHIG"); },
  },

  /* ---------- Modul 10 ---------- */
  commit: {
    kind: "side", flight: { R: true }, grav: 520, hud: "brake",
    track: track([B.flat(470), B.drop(1, 26), B.flat(1400)]),
    onReset: (m, s) => { s.v = 150; },
    vel(m, p, s, dt) { if (m === "F" && s.x + 60 > 395) s.v = Math.max(18, s.v - 280 * dt); return s.v; },
    pose(m, k) {
      if (m === "R") { if (k.air) return { ...P.ready, airLevel: 6 }; return { ...P.ready }; }
      const late = k.x + 60 > 395, tilt = clamp((k.s.pitch || 0) / .2, 0, 1);
      return { hip: mix([-18, -66], [2, -72], tilt), torso: lerp(36, 54, tilt), heel: lerp(24, 0, tilt), brakeF: late ? 1 : 0, brakeR: late ? 1 : 0 };
    },
    build: (M, U, g) => {
      const flag = U.g({ transform: `translate(340 ${g(340)})` });
      el("line", { x1: 0, y1: 0, x2: 0, y2: -34, stroke: "var(--fg)", "stroke-width": 2 }, flag);
      el("path", { d: "M0 -34 L16 -29 L0 -24 Z", fill: "var(--accent)" }, flag);
      [[462, 4, 9], [478, 6, 7], [455, 30, 8], [470, 31, 10]].forEach(r => U.circle({ cx: r[0], cy: f1(g(r[0] - 30) + r[1]), r: r[2], fill: "var(--rock)", stroke: "var(--rock-edge)", "stroke-width": 1.5 }));
      return {};
    },
    fx(o, m, k) {
      const xf = k.x + 60;
      if (xf > 300 && xf < 400) k.top("HIER ENTSCHEIDEN");
      else if (m === "F" && xf >= 400) k.top("BREMST MITTEN IM HINDERNIS");
      else if (m === "R" && xf >= 400) k.top("DURCHROLLEN");
    },
  },

  /* ---------- Frontansicht ---------- */
  slalom: {
    kind: "front", trace: true,
    pose(m, k) { const b = 24 * Math.sin(k.t * 2 * Math.PI * .55); return { bike: b, body: m === "F" ? b : b * .15 }; },
    build: M => ({ c: M.line({ x1: 200, y1: -16, x2: 200, y2: 100, stroke: "var(--muted)", "stroke-dasharray": "3 5", opacity: .7 }) }),
    fx(o, m, k) { k.top(m === "F" ? "KOPF PENDELT" : "KOPF BLEIBT IN DER MITTE"); },
  },
  flatCorner: {
    kind: "front",
    pose(m, k) {
      const env = win(k.p, .08, .3, .7, .9);
      if (m === "F") { const sl = ss(.42, .66, k.p); return { bike: 28 * env + 10 * sl, body: 28 * env + 10 * sl, drop: 0, slide: -42 * sl, skidFrom: sl > .02 ? 0 : null }; }
      return { bike: 34 * env, body: 9 * env, drop: env };
    },
    build: M => ({ lb: M.line({ "stroke-width": 2, "stroke-dasharray": "5 5", stroke: "var(--bike)" }), lc: M.line({ "stroke-width": 2.5, "stroke-dasharray": "5 5", stroke: "var(--accent)" }) }),
    fx(o, m, k) {
      const a = k.C, b = [a[0] + k.u[0] * 170, a[1] + k.u[1] * 170], c = [a[0] + k.Bv[0] * 170, a[1] + k.Bv[1] * 170];
      set(o.lb, { x1: f1(a[0]), y1: f1(a[1]), x2: f1(b[0]), y2: f1(b[1]) }); set(o.lc, { x1: f1(a[0]), y1: f1(a[1]), x2: f1(c[0]), y2: f1(c[1]) });
      if (m === "F") k.top(k.p > .45 ? "VORDERRAD RUTSCHT WEG" : k.p > .1 ? "KÖRPER UND BIKE GLEICH SCHRÄG" : null);
      else k.top(k.p > .4 ? "ÄUSSERES PEDAL UNTEN" : k.p > .1 ? "BIKE SCHRÄG, DU BLEIBST GERADE" : null);
    },
  },
  berm: {
    kind: "front",
    pose(m, k) {
      const env = win(k.p, .06, .28, .78, .95);
      if (m === "F") { const sl = ss(.36, .7, k.p); return { surface: 35 * env, bike: 0, body: 0, slide: 46 * sl, skidFrom: sl > .02 ? 0 : null }; }
      return { surface: 35 * env, bike: 35 * env, body: 29 * env, drop: 0 };
    },
    build: M => ({ push: M.path({ "stroke-width": 4, opacity: 0 }) }),
    fx(o, m, k) {
      if (m === "R") {
        const mid = [(k.pedL[0] + k.pedR[0]) / 2, (k.pedL[1] + k.pedR[1]) / 2], on = k.p > .3 && k.p < .8;
        set(o.push, { d: arrowD(mid[0] - k.u[0] * 4, mid[1] - k.u[1] * 4, -k.u[0] * 34, -k.u[1] * 34, 7), stroke: COL.R, opacity: on ? 1 : 0 });
        k.top(on ? "IN DIE WAND DRÜCKEN" : k.p > .1 ? "PEDALE GERADE" : null);
      } else { vis(o.push, 0); k.top(k.p > .4 ? "RUTSCHT NACH UNTEN" : k.p > .1 ? "BREMST, BIKE BLEIBT GERADE" : null); }
    },
  },
  offCamber: {
    kind: "front",
    pose(m, k) {
      if (m === "F") { const sl = ss(.35, .65, k.p); return { surface: 14, bike: 14 + 6 * sl, body: 14 + 6 * sl, slide: 52 * sl, skidFrom: sl > .02 ? 0 : null }; }
      return { surface: 14, bike: -3, body: -2, drop: -.8 };
    },
    build: M => {
      M.text({ x: 40, y: 150, "font-size": 12, fill: "var(--muted)" }).textContent = "BERG";
      M.text({ x: 360, y: 236, "font-size": 12, fill: "var(--muted)" }).textContent = "TAL";
      return { plumb: M.line({ "stroke-width": 2, "stroke-dasharray": "4 4", stroke: "var(--good)", opacity: 0 }), push: M.path({ "stroke-width": 4, opacity: 0 }) };
    },
    fx(o, m, k) {
      if (m === "R") {
        set(o.plumb, { x1: f1(k.C[0]), y1: f1(k.C[1]), x2: f1(k.C[0]), y2: f1(k.C[1] - 170), opacity: 1 });
        set(o.push, { d: arrowD(k.pedR[0] + 14, k.pedR[1] - 30, 0, 22, 6), stroke: COL.R, opacity: 1 });
        k.top("BIKE SENKRECHT, TALFUSS DRÜCKT");
      } else { vis(o.plumb, 0); vis(o.push, 0); k.top(k.p > .38 ? "RUTSCHT ZUM TAL" : "BIKE KIPPT ZUM TAL"); }
    },
  },

  /* ---------- Draufsicht ---------- */
  apex: {
    kind: "top", trail: "M 250 300 L 250 160 A 90 90 0 0 0 160 70 L -30 70",
    paths: { F: "M 248 300 L 246 195 C 242 160, 224 140, 210 133 C 186 118, 152 58, 100 42 L -30 40",
             R: "M 274 300 L 274 178 C 274 122, 232 100, 192 104 C 152 108, 112 66, 60 60 L -30 58" },
    look: { F: 22, R: 95 },
    marks: { F: [{ type: "circle", pos: [210, 133], at: .45, text: "INNERSTER PUNKT", dx: 12, dy: -10, anchor: "start" }, { type: "x", pos: [112, 44], at: .72, text: "AM RAND", dy: 24 }],
             R: [{ type: "circle", pos: [192, 104], at: .5, text: "INNERSTER PUNKT", dx: 12, dy: -10, anchor: "start" }] },
    labels: { R: [{ at: .78, text: "VIEL PLATZ", pos: [80, 32] }] },
  },
  lookFar: {
    kind: "top", trail: "M 200 300 L 200 200 C 200 140, 160 110, 140 60 L 120 -20",
    rocks: [[158, 95, 10]],
    paths: { F: "M 200 300 L 200 200 C 200 156, 186 126, 172 112 C 162 102, 182 98, 184 86 C 186 72, 160 66, 146 50 L 122 -20",
             R: "M 200 300 L 202 200 C 206 150, 194 116, 182 92 C 172 72, 152 58, 140 40 L 122 -20" },
    look: { F: 18, R: 120 },
    labels: { F: [{ at: .5, text: "STEIN ZU SPÄT GESEHEN", pos: [270, 250] }], R: [{ at: .22, text: "STEIN FRÜH GESEHEN", pos: [270, 250] }] },
  },
  brakeZone: {
    kind: "top", trail: "M 250 300 L 250 160 A 90 90 0 0 0 160 70 L -30 70",
    paths: { F: "M 250 300 L 250 190 C 250 150, 252 120, 240 100 C 222 70, 160 44, 100 40 L -30 38",
             R: "M 274 300 L 274 178 C 274 122, 232 100, 192 104 C 152 108, 112 66, 60 60 L -30 58" },
    brake: { F: [[.4, .6]], R: [[.12, .3]] },
    labels: { F: [{ at: .42, text: "BREMST IN DER KURVE", pos: [150, 160] }, { at: .7, text: "SCHIEBT NACH AUSSEN", pos: [150, 160] }],
              R: [{ at: .14, text: "BREMST VOR DER KURVE", pos: [150, 160] }, { at: .5, text: "ROLLT DURCH", pos: [150, 160] }] },
  },
  inOut: {
    kind: "top", speedWidth: true, trail: "M 250 300 L 250 160 A 90 90 0 0 0 160 70 L -30 70",
    paths: { F: "M 250 300 L 250 190 C 250 150, 252 120, 240 100 C 222 70, 160 44, 100 40 L -30 38",
             R: "M 274 300 L 274 178 C 274 122, 232 100, 192 104 C 152 108, 112 66, 60 60 L -30 58" },
    speed: { F: [[0, 1.15], [.4, 1.15], [.48, .5], [.62, .45], [.8, .6], [1, .75]], R: [[0, 1], [.22, 1], [.36, .5], [.5, .45], [.62, .75], [.8, 1.1], [1, 1.25]] },
    brake: { F: [[.42, .56]] },
    labels: { F: [{ at: .45, text: "ZU SCHNELL REIN", pos: [150, 160] }, { at: .75, text: "LANGSAM RAUS", pos: [150, 160] }],
              R: [{ at: .3, text: "LANGSAM REIN", pos: [150, 160] }, { at: .7, text: "SCHNELL RAUS", pos: [150, 160] }] },
  },
  lookExit: {
    kind: "top", trail: "M 250 300 L 250 160 A 90 90 0 0 0 160 70 L -30 70",
    paths: { F: "M 250 300 L 250 200 C 252 160, 270 132, 270 112 C 268 82, 222 52, 160 44 L -30 42",
             R: "M 274 300 L 274 178 C 274 122, 232 100, 192 104 C 152 108, 112 66, 60 60 L -30 58" },
    look: { F: { point: [282, 112], from: .12, to: .7 }, R: { point: [10, 64], from: .12, to: 1 } },
    labels: { F: [{ at: .15, text: "SCHAUT AUF DEN RAND", pos: [150, 200] }], R: [{ at: .15, text: "SCHAUT ZUM ENDE DER KURVE", pos: [140, 200] }] },
  },
  rockGarden: {
    kind: "top", width: 130, trail: "M 180 300 L 180 -20",
    rocks: [[172, 130, 22], [238, 140, 10], [128, 135, 12], [150, 200, 8], [195, 66, 10], [148, 58, 9], [238, 72, 8], [222, 222, 8]],
    paths: { F: "M 180 300 L 178 200 L 174 150 C 173 140, 174 120, 172 108 L 170 -20",
             R: "M 180 300 L 180 236 C 180 204, 213 176, 211 140 C 209 110, 182 98, 172 82 L 168 -20" },
    look: { F: { point: [172, 130], from: .05, to: .52 }, R: { point: [211, 136], from: .05, to: .45 } },
    bumps: { F: [[.34, .48]] },
    labels: { F: [{ at: .3, text: "FÄHRT AUF DEN STEIN", pos: [292, 236] }], R: [{ at: .1, text: "FÄHRT DURCH DIE LÜCKE", pos: [292, 236] }] },
  },
  lookTwo: {
    kind: "top", width: 70, trail: "M 200 300 C 200 230, 110 220, 125 160 S 260 100, 220 40 L 210 -20",
    features: [.25, .45, .65, .82],
    paths: { F: f => 10 * Math.sin(f * 48) * win(f, .08, .14, .92, .98), R: f => 0 },
    look: { F: { next: 1 }, R: { next: 2 } },
    labels: { F: [{ at: .3, text: "LINIE WIRD ZACKIG", pos: [285, 250] }], R: [{ at: .3, text: "LINIE BLEIBT RUHIG", pos: [285, 250] }] },
  },
  linkCorners: {
    kind: "top", width: 60, trail: "M 110 300 L 110 236 C 110 170, 250 196, 250 132 C 250 68, 110 92, 110 30 L 110 -20",
    paths: { F: f => 18 * win(f, .36, .43, .47, .53) - 16 * win(f, .48, .54, .58, .64), R: f => 13 * Math.sin((f - .1) * Math.PI * 2.2) * win(f, .05, .15, .85, .95) },
    look: { F: 24, R: { point: [110, 60], from: .38, to: .8 } },
    labels: { F: [{ at: .45, text: "MUSS KORRIGIEREN", pos: [280, 250] }], R: [{ at: .4, text: "SCHAUT SCHON ZUR NÄCHSTEN", pos: [262, 250] }] },
  },

  /* ---------- Schaubilder ---------- */
  brakeChart: { kind: "chart", type: "brakes", corners: [.24, .52, .8] },
  brakeChartFast: { kind: "chart", type: "brakes", corners: [.18, .42, .66, .88], fast: true },
  brakePoint: { kind: "chart", type: "arcs" },
  tableSteps: { kind: "chart", type: "tableSteps" },
  dropSteps: { kind: "chart", type: "dropSteps" },
  dropCheck: { kind: "chart", type: "dropCheck" },
  gapSpeed: { kind: "chart", type: "gap" },
  scout: { kind: "chart", type: "scout" },
  sections: { kind: "chart", type: "sections" },
};
