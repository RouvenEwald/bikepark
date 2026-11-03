/* Bikepark Lernkarten – Animations-Engine.
   Vier Ansichten: Seite (side), Draufsicht (top), Front (front), Schaubild (chart).
   Keine externen Abhängigkeiten. Jede Szene hat reset(mode) und frame(dt, mode, p), p = 0..1. */

export const NS = "http://www.w3.org/2000/svg";
export function el(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
export function set(e, a) { for (const k in a) e.setAttribute(k, a[k]); }
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const D2R = Math.PI / 180;
export const f1 = v => (Math.round(v * 10) / 10).toString();
export const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
export const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const win = (x, a, b, c, d) => ss(a, b, x) * (1 - ss(c, d, x));
export const COL = { F: "var(--bad)", R: "var(--good)" };
export const vis = (e, on) => e.setAttribute("opacity", on ? 1 : 0);
export function arrowD(x, y, dx, dy, head = 6) {
  const L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, ex = x + dx, ey = y + dy;
  return `M${f1(x)} ${f1(y)} L${f1(ex)} ${f1(ey)} M${f1(ex - ux * head - uy * head * .7)} ${f1(ey - uy * head + ux * head * .7)} L${f1(ex)} ${f1(ey)} L${f1(ex - ux * head + uy * head * .7)} ${f1(ey - uy * head - ux * head * .7)}`;
}
function makers(g) {
  return {
    text: (a = {}) => el("text", { "font-size": 13, "text-anchor": "middle", ...a }, g),
    path: (a = {}) => el("path", { fill: "none", "stroke-width": 3, "stroke-linecap": "round", "stroke-linejoin": "round", ...a }, g),
    circle: (a = {}) => el("circle", a, g),
    line: (a = {}) => el("line", { "stroke-width": 2, "stroke-linecap": "round", ...a }, g),
    rect: (a = {}) => el("rect", a, g),
    g: (a = {}) => el("g", a, g),
  };
}
function badgeText(mode) { return mode === "F" ? "✗ SO NICHT" : "✓ SO GEHT'S"; }

/* ---------------- Gelände ---------------- */
export const G0 = 205;
export const B = {
  flat: (len, tag) => ({ len, tag, h: () => 0, prof: () => 0, dy: 0 }),
  wave: (len, h, tag) => ({ len, tag, h: q => h * Math.sin(Math.PI * q) ** 2, prof: () => 0, dy: 0 }),
  root: (len, h, tag) => ({ len, tag, h: q => h * Math.sin(Math.PI * q), prof: () => 0, dy: 0 }),
  grain: (len, a, tag) => ({ len, tag, h: q => a * (Math.sin(q * len / 9) + Math.sin(q * len / 4.3)) * .5, prof: () => 0, dy: 0 }),
  table: (up, top, down, h, tag) => {
    const len = up + top + down;
    return { len, tag, dy: 0, prof: () => 0, h: q => {
      const u = q * len;
      if (u < up) { const r = u / up; return h * r * r; }
      if (u < up + top) return h;
      return h * (1 - ss(0, 1, (u - up - top) / down));
    } };
  },
  drop: (len, hh, tag) => ({ len, tag, h: () => 0, prof: () => 0, dy: hh }),
  ledge: (len, hh, tag) => ({ len, tag, h: () => 0, prof: q => -hh * ss(.5 - 3 / len, .5 + 3 / len, q), dy: -hh }),
  steep: (len, deg, tag) => {
    const dy = len * Math.tan(deg * D2R), t = .15;
    const f = q => q < t ? q * q / (2 * t) : q <= 1 - t ? t / 2 + (q - t) : (1 - t) - (1 - q) * (1 - q) / (2 * t);
    return { len, tag, h: () => 0, prof: q => dy * f(q) / (1 - t), dy };
  },
};
export function track(blocks) {
  let x = 0, base = 0;
  const segs = blocks.map(b => { const s = { ...b, x0: x, base0: base }; x += b.len; base += b.dy; return s; });
  const end = x, endBase = base;
  const g = xx => {
    if (xx < 0) return G0;
    if (xx >= end) return G0 + endBase;
    let lo = 0, hi = segs.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (segs[m].x0 <= xx) lo = m; else hi = m - 1; }
    const s = segs[lo], q = (xx - s.x0) / s.len;
    return G0 + s.base0 + s.prof(q) - s.h(q);
  };
  g.tag = name => { const s = segs.find(z => z.tag === name); return s ? { x0: s.x0, x1: s.x0 + s.len, base: G0 + s.base0 } : null; };
  g.end = end;
  return g;
}

/* ---------------- 2-Gelenk-IK ---------------- */
export function ik(A, C, L1, L2, pick) {
  const dx = C[0] - A[0], dy = C[1] - A[1], d = Math.hypot(dx, dy) || 0.01;
  const dm = Math.min(d, L1 + L2 - 0.01);
  const ux = dx / d, uy = dy / d, a = (L1 * L1 - L2 * L2 + dm * dm) / (2 * dm), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  const px = A[0] + ux * a, py = A[1] + uy * a;
  const b1 = [px - uy * h, py + ux * h], b2 = [px + uy * h, py - ux * h];
  return pick(b1, b2) ? b1 : b2;
}

/* ---------------- Seitenansicht: Fahrer + Bike ---------------- */
export const RG = { R: 37, BB: [-8, 12], crank: 17, grip: [42, -60], thigh: 46, shin: 46, upper: 32, fore: 31, torso: 52, travel: 14 };
export const P = {
  ready: { hip: [-18, -66], torso: 36, heel: 24 },
  stiff: { hip: [-6, -80], torso: 52, heel: -24 },
  stance: e => ({ hip: mix([-14, -52], [-18, -78], e), torso: lerp(26, 46, e), heel: 20 }),
};
function buildRig(parent) {
  const g = el("g", {}, parent);
  const gaze = el("polygon", { opacity: 0 }, g);
  const gazeLine = el("line", { "stroke-width": 1.5, "stroke-dasharray": "3 4", opacity: 0 }, g);
  const W = (c, w) => ({ stroke: c, "stroke-width": w, "stroke-linecap": "round" });
  const far = el("g", {}, g);
  const farThigh = el("line", W("var(--rider-far)", 12), far), farShin = el("line", W("var(--rider-far)", 9), far), farShoe = el("line", W("var(--rider-far)", 8), far);
  const bike = el("g", {}, g);
  const wheels = [-60, 60].map(x => {
    const w = el("g", {}, bike);
    el("circle", { cx: x, cy: 0, r: RG.R - 3, fill: "none", stroke: "var(--tire)", "stroke-width": 6 }, w);
    el("circle", { cx: x, cy: 0, r: RG.R - 9, fill: "none", stroke: "var(--bike)", "stroke-width": 1.5 }, w);
    const sp = el("g", {}, w);
    for (let i = 0; i < 3; i++) el("line", { x1: x, y1: 0, x2: x + Math.cos(i * 2.094) * 28, y2: Math.sin(i * 2.094) * 28, stroke: "var(--bike)", "stroke-width": 1.2 }, sp);
    el("circle", { cx: x, cy: 0, r: 3, fill: "var(--bike)" }, w);
    return { sp, x, rot: 0 };
  });
  const frame = el("path", { fill: "none", stroke: "var(--bike)", "stroke-width": 5, "stroke-linejoin": "round", "stroke-linecap": "round" }, bike);
  const fork = el("line", W("var(--bike)", 4), bike), forkLow = el("line", W("var(--tire)", 5.5), bike);
  const saddle = el("line", W("var(--bike)", 6), bike);
  const crank = el("line", W("var(--bike)", 3.5), bike);
  const bb = el("circle", { r: 5, fill: "var(--bike)" }, bike);
  const near = el("g", {}, g);
  const thigh = el("line", W("var(--rider)", 14), near), shin = el("line", W("var(--rider)", 10), near);
  const shoe = el("line", W("var(--shoe)", 10), near);
  const torso = el("line", W("var(--rider)", 20), near), upper = el("line", W("var(--rider)", 10), near), fore = el("line", W("var(--rider)", 8), near);
  const head = el("circle", { r: 12, fill: "var(--rider)" }, near);
  const visor = el("line", W("var(--accent)", 3.5), near);
  const lever = el("circle", { r: 6, fill: "none", "stroke-width": 3, opacity: 0 }, near);
  const joints = [0, 1, 2].map(() => el("circle", { r: 3.6, fill: "var(--accent)", stroke: "var(--sky)", "stroke-width": 1.5 }, near));
  const L = (e, a, b) => set(e, { x1: f1(a[0]), y1: f1(a[1]), x2: f1(b[0]), y2: f1(b[1]) });
  function foot(pedal, heel) {
    const a = heel * D2R, dir = [Math.cos(a), -Math.sin(a)], base = [pedal[0], pedal[1] - 5];
    return { heel: [base[0] - 19 * dir[0], base[1] - 19 * dir[1]], toe: [base[0] + 12 * dir[0], base[1] + 12 * dir[1]], ankle: [base[0] - 10 * dir[0], base[1] - 10 * dir[1] - 10] };
  }
  return {
    g,
    pose(p, dd) {
      const cf = p.cf || 0, cr = p.cr || 0, S = RG.travel;
      const F = pt => [pt[0], pt[1] + lerp(cr, cf, (pt[0] + 60) / 120) * S];
      wheels.forEach((w, i) => { const locked = (i === 0 && p.lockR) || (i === 1 && p.lockF); if (!locked) w.rot += dd / RG.R * 57.3; set(w.sp, { transform: `rotate(${f1(w.rot % 360)} ${w.x} 0)` }); });
      const BB = F(RG.BB), ST = F([-22, -30]), HT = F([48, -40]), HB = F([52, -28]), STEM = F([46, -50]), GRIP = F(RG.grip);
      set(frame, { d: `M-60 0 L${f1(BB[0])} ${f1(BB[1])} L${f1(ST[0])} ${f1(ST[1])} Z M${f1(ST[0])} ${f1(ST[1])} L${f1(HT[0])} ${f1(HT[1])} L${f1(HB[0])} ${f1(HB[1])} L${f1(BB[0])} ${f1(BB[1])} M${f1(HT[0])} ${f1(HT[1])} L${f1(STEM[0])} ${f1(STEM[1])} L${f1(GRIP[0])} ${f1(GRIP[1])}` });
      L(fork, HB, [56, -14]); L(forkLow, [55.5, -16 + cf * S * 0.4], [60, 0]);
      L(saddle, F([-36, -35]), F([-15, -35]));
      const a = p.crank || 0, ca = Math.cos(a), sa = Math.sin(a);
      const fp = [BB[0] + RG.crank * ca, BB[1] + RG.crank * sa - 3], rp = [BB[0] - RG.crank * ca, BB[1] - RG.crank * sa - 3];
      L(crank, [rp[0], rp[1] + 3], [fp[0], fp[1] + 3]); set(bb, { cx: f1(BB[0]), cy: f1(BB[1]) });
      const hip = p.hipFrame === false ? p.hip : F(p.hip);
      const fF = foot(fp, p.heel), fR = foot(rp, p.heel);
      const kneeF = ik(hip, fF.ankle, RG.thigh, RG.shin, (x, y) => x[0] > y[0]);
      const kneeR = ik(hip, fR.ankle, RG.thigh, RG.shin, (x, y) => x[0] > y[0]);
      L(thigh, hip, kneeF); L(shin, kneeF, fF.ankle); L(shoe, fF.heel, fF.toe);
      L(farThigh, hip, kneeR); L(farShin, kneeR, fR.ankle); L(farShoe, fR.heel, fR.toe);
      const ta = p.torso * D2R, sh = [hip[0] + RG.torso * Math.cos(ta), hip[1] - RG.torso * Math.sin(ta)];
      const elbow = ik(sh, GRIP, RG.upper, RG.fore, (x, y) => x[1] > y[1]);
      L(torso, hip, sh); L(upper, sh, elbow); L(fore, elbow, GRIP);
      const hd = [sh[0] + 11, sh[1] - 15 + (p.neck || 0) * 8];
      set(head, { cx: f1(hd[0]), cy: f1(hd[1]) }); L(visor, [hd[0] + 4, hd[1] - 6], [hd[0] + 16, hd[1] - 3]);
      [hip, kneeF, elbow].forEach((j, i) => set(joints[i], { cx: f1(j[0]), cy: f1(j[1]) }));
      const bk = Math.max(p.brakeF || 0, p.brakeR || 0);
      set(lever, { cx: f1(GRIP[0]), cy: f1(GRIP[1]), stroke: (p.lockR || p.lockF) ? "var(--bad)" : "var(--brake)", opacity: bk.toFixed(2) });
      if (p.look) {
        const eye = [hd[0] + 8, hd[1] - 2], t = p.look, dx = t[0] - eye[0], dy = t[1] - eye[1], d = Math.hypot(dx, dy) || 1, sp = d * .14;
        const px = -dy / d * sp, py = dx / d * sp, c = p.lookBad ? "var(--bad)" : "var(--good)";
        set(gaze, { points: `${f1(eye[0])},${f1(eye[1])} ${f1(t[0] + px)},${f1(t[1] + py)} ${f1(t[0] - px)},${f1(t[1] - py)}`, opacity: .16, fill: c });
        set(gazeLine, { x1: f1(eye[0]), y1: f1(eye[1]), x2: f1(t[0]), y2: f1(t[1]), opacity: .85, stroke: c });
      } else { set(gaze, { opacity: 0 }); set(gazeLine, { opacity: 0 }); }
      return { head: hd, heel: fF.heel, toe: fF.toe, pedal: fp, hip, grip: GRIP, sh, bb: BB, knee: kneeF, elbow };
    },
  };
}

/* ---------------- Seitenansicht: Szene mit Physik ---------------- */
function sideScene(svg, cfg) {
  const W = 400, CX = 200, CY = G0 - RG.R;
  const g = cfg.track;
  el("rect", { x: 0, y: -28, width: W, height: 268, fill: "var(--sky)" }, svg);
  let fd = "M0 240";
  for (let sx = 0; sx <= W; sx += 4) fd += ` L${sx} ${f1(120 + 18 * Math.sin(sx / 37) + 10 * Math.sin(sx / 13))}`;
  el("path", { d: fd + ` L${W} 240 Z`, fill: "var(--forest)", opacity: .3 }, svg);
  const ground = el("path", { fill: "var(--ground)", stroke: "var(--ground-edge)", "stroke-width": 2 }, svg);
  const under = el("g", {}, svg);
  const zones = el("path", { fill: "none", "stroke-width": 5, "stroke-linecap": "round" }, svg);
  const skid = el("polyline", { fill: "none", stroke: "var(--bad)", "stroke-width": 4, "stroke-linecap": "round", opacity: .85 }, svg);
  const skidF = el("polyline", { fill: "none", stroke: "var(--bad)", "stroke-width": 4, "stroke-linecap": "round", opacity: .85 }, svg);
  const trace = el("polyline", { fill: "none", "stroke-width": 2.5, "stroke-dasharray": "1 5", "stroke-linecap": "round" }, svg);
  const world = el("g", {}, svg);
  const rig = buildRig(world);
  const fx = el("g", {}, svg);
  const lt = el("text", { x: 388, y: -8, "font-size": 13, "text-anchor": "end" }, svg);
  const lb = el("text", { x: 200, y: 236, "font-size": 13, "text-anchor": "middle" }, svg);
  const badge = el("text", { x: 12, y: -8, "font-size": 15 }, svg);
  let hud = null;
  if (cfg.hud === "brake") {
    const h = el("g", { transform: "translate(268 -20)" }, svg);
    el("text", { x: 0, y: 8, "font-size": 12, fill: "var(--muted)" }, h).textContent = "VORNE";
    el("text", { x: 0, y: 24, "font-size": 12, fill: "var(--muted)" }, h).textContent = "HINTEN";
    el("rect", { x: 46, y: -1, width: 72, height: 10, rx: 5, fill: "none", stroke: "var(--line)", "stroke-width": 1.5 }, h);
    el("rect", { x: 46, y: 15, width: 72, height: 10, rx: 5, fill: "none", stroke: "var(--line)", "stroke-width": 1.5 }, h);
    hud = { type: "brake", f: el("rect", { x: 48, y: 1, height: 6, rx: 3, width: 0 }, h), r: el("rect", { x: 48, y: 17, height: 6, rx: 3, width: 0 }, h) };
    set(lt, { y: 40 });
  } else if (cfg.hud === "speed") {
    el("text", { x: 276, y: -8, "font-size": 13, "text-anchor": "end", fill: "var(--muted)" }, svg).textContent = "TEMPO";
    el("rect", { x: 282, y: -18, width: 106, height: 12, rx: 6, fill: "none", stroke: "var(--line)", "stroke-width": 1.5 }, svg);
    hud = { type: "speed", bar: el("rect", { x: 284, y: -16, height: 8, rx: 4, width: 0 }, svg) };
    set(lt, { y: 14 });
  }
  const M = makers(fx), U = makers(under);
  const o = cfg.build ? cfg.build(M, U, g) : {};
  const axleY = x => { let m = 1e9; for (let dx = -36; dx <= 36; dx += 1) { const v = g(x + dx) - Math.sqrt(RG.R * RG.R - dx * dx); if (v < m) m = v; } return m; };
  let s;
  function reset(mode) {
    s = { mode, x: cfg.x0 || 150, v: 0, t: 0, hist: [], skid: [], air: false, y: null, vy: 0, pitch: 0, camY: null, gPrev: null, smoothCy: null,
      e: .5, lift: 0, rlift: 0, skidF: [], ax: { r: { y: null, v: 0, c: 0 }, f: { y: null, v: 0, c: 0 } }, imp: { r: 0, f: 0 }, land: null, takeT: -1, hopped: false, mem: {}, dispCy: null, dispTh: null };
    if (cfg.onReset) cfg.onReset(mode, s);
  }
  function frame(dt, mode, p) {
    if (!s || s.mode !== mode) reset(mode);
    s.t += dt;
    const v = cfg.vel ? cfg.vel(mode, p, s, dt) : (cfg.speed?.[mode] ?? cfg.speed ?? 110);
    s.v = v;
    const dd = v * dt; s.x += dd;
    const x = s.x;
    const ry = axleY(x - 60), fy = axleY(x + 60), gTh = Math.atan2(fy - ry, 120), gCy = (ry + fy) / 2;
    if (s.y === null) { s.y = gCy; s.pitch = gTh; s.camY = gCy; s.smoothCy = gCy; s.gPrev = gCy; }
    const vyG = dt > 0 ? (gCy - s.gPrev) / dt : 0; s.gPrev = gCy;
    const accG = dt > 0 ? (vyG - (s.vyG ?? vyG)) / dt : 0; s.vyG = vyG;
    s.accG = (s.accG ?? 0) + (accG - (s.accG ?? 0)) * Math.min(1, dt * 25);
    s.smoothCy += (gCy - s.smoothCy) * Math.min(1, dt * 2.5);
    const K = { x, p, dt, s, v, mode, g, air: s.air, slope: xx => (g(xx + 1) - g(xx - 1)) / 2, tag: g.tag };
    const pose = Object.assign({}, cfg.pose(mode, K) || {});
    const G = cfg.grav || 520;
    s.lift += ((pose.lift || 0) - s.lift) * Math.min(1, dt * 10);
    s.rlift += ((pose.rearLift || 0) - s.rlift) * Math.min(1, dt * 10);
    const flight = cfg.flight ? !!cfg.flight[mode] : false;
    const takeoff = () => { s.air = true; s.takeT = s.t; if (s.dispCy !== null) { s.y = s.dispCy; s.pitch = s.dispTh; } s.lift = 0; s.rlift = 0; };
    if (pose.hop && !s.air && !s.hopped) { takeoff(); s.vy = -pose.hop; s.hopped = true; }
    // Abheben, wenn der Boden schneller wegfällt als die Schwerkraft zieht
    if (!s.air && flight && dt > 0 && s.accG > G && s.vy < 60) { takeoff(); s.vy = s.vy * (1 - (pose.absorb || 0)); }
    if (s.air) {
      s.vy += G * dt; s.y += s.vy * dt;
      if (pose.airPitch) s.pitch += pose.airPitch * D2R * dt;
      if (pose.airLevel) { const ahead = Math.atan2(axleY(x + 110) - axleY(x - 10), 120); s.pitch += (ahead - s.pitch) * Math.min(1, dt * pose.airLevel); }
      if (s.y >= gCy) {
        const rel = (s.pitch - gTh) / D2R;
        if (s.t - s.takeT > .15) s.land = { t: s.t, p, rel, vy: s.vy, x };
        s.air = false; s.y = gCy;
        const imp = clamp(s.vy / 380, 0, 1.2);
        s.imp.r += imp * (rel < -6 ? 1.3 : rel > 6 ? .3 : 1); s.imp.f += imp * (rel > 6 ? 1.3 : rel < -6 ? .3 : 1);
        s.vy = vyG;
      }
    } else {
      s.y = gCy; s.vy = clamp(vyG, -900, 900);
      s.pitch += (gTh - s.pitch) * Math.min(1, dt * 14);
    }
    let th = s.pitch, cx = x, cy = s.y;
    if (!s.air && s.lift > .2) {
      const rw = [x - 60 * Math.cos(s.pitch), s.y - 60 * Math.sin(s.pitch)];
      th = s.pitch - s.lift * D2R; cx = rw[0] + 60 * Math.cos(th); cy = rw[1] + 60 * Math.sin(th);
    } else if (!s.air && s.rlift > .2) {
      const fw = [x + 60 * Math.cos(s.pitch), s.y + 60 * Math.sin(s.pitch)];
      th = s.pitch + s.rlift * D2R; cx = fw[0] - 60 * Math.cos(th); cy = fw[1] - 60 * Math.sin(th);
    }
    s.dispCy = cy; s.dispTh = th;
    const c = Math.cos(th), sn = Math.sin(th);
    const toW = (lx, ly) => [cx + lx * c - ly * sn, cy + lx * sn + ly * c];
    const toL = (wx, wy) => { const dx = wx - cx, dy = wy - cy; return [dx * c + dy * sn, -dx * sn + dy * c]; };
    const rearW = toW(-60, 0), frontW = toW(60, 0);
    // Federung aus vertikaler Achsbeschleunigung + Landestoß
    if (dt > 0) {
      [["r", rearW[1]], ["f", frontW[1]]].forEach(([k, y]) => {
        const a = s.ax[k];
        if (a.y === null || s.air) { a.y = y; a.v = 0; a.c += (0 - a.c) * Math.min(1, dt * 8); return; }
        const nv = (y - a.y) / dt, acc = (nv - a.v) / dt; a.y = y; a.v = nv;
        const tgt = clamp(-acc / 2600, 0, 1); a.c += (tgt - a.c) * Math.min(1, dt * (tgt > a.c ? 18 : 6));
      });
      s.imp.r *= Math.exp(-dt * 7); s.imp.f *= Math.exp(-dt * 7);
    }
    pose.cr = clamp((pose.cr || 0) + s.ax.r.c + s.imp.r, 0, 1);
    pose.cf = clamp((pose.cf || 0) + s.ax.f.c + s.imp.f, 0, 1);
    if (s.air) { pose.cr = 0; pose.cf = 0; }
    if (pose.steady) {
      const nom = pose.steady.nominal, w = toW(nom[0], nom[1]), Y0 = s.smoothCy + nom[1];
      const hw = [w[0], Y0 + pose.steady.follow * (w[1] - Y0)];
      const l = toL(hw[0], hw[1]);
      pose.hip = [clamp(l[0], -30, -8), clamp(l[1], -84, -46)]; pose.hipFrame = false;
    }
    if (pose.lookW) pose.look = toL(pose.lookW[0], pose.lookW[1]);
    else if (pose.lookL) pose.look = pose.lookL;
    s.camY += (cy - s.camY) * Math.min(1, dt * 9);
    const oy = CY - s.camY;
    const scr = (wx, wy) => [wx - x + CX, wy + oy];
    let gd = "M0 240";
    for (let sx = 0; sx <= W; sx += 3) gd += ` L${sx} ${f1(clamp(g(x - CX + sx) + oy, -40, 300))}`;
    set(ground, { d: gd + ` L${W} 300 L0 300 Z` });
    set(under, { transform: `translate(${f1(CX - x)} ${f1(oy)})` });
    set(rig.g, { transform: `translate(${f1(cx - x + CX)} ${f1(cy + oy)}) rotate(${f1(th / D2R)})` });
    const out = rig.pose(pose, dd);
    if (cfg.trace) {
      const hw = toW(out.head[0], out.head[1]);
      s.hist.push(hw); while (s.hist.length && s.hist[0][0] < x - CX - 10) s.hist.shift();
      set(trace, { points: s.hist.map(h => scr(h[0], h[1]).map(f1).join(",")).join(" "), stroke: COL[mode], opacity: 1 });
    } else set(trace, { opacity: 0 });
    if (pose.lockR && v > 1 && !s.air) s.skid.push([rearW[0], g(rearW[0])]);
    if (pose.lockF && v > 1 && !s.air) s.skidF.push([frontW[0], g(frontW[0])]);
    [[s.skid, skid], [s.skidF, skidF]].forEach(([arr, elx]) => { while (arr.length && arr[0][0] < x - CX - 10) arr.shift(); set(elx, { points: arr.map(h => scr(h[0], h[1]).map(f1).join(",")).join(" ") }); });
    if (cfg.zones) {
      let d = "", on = false; const want = mode === "R" ? 1 : -1;
      for (let sx = 0; sx <= W; sx += 3) {
        const wx = x - CX + sx, sl = (g(wx + 1) - g(wx - 1)) / 2;
        if (sl * want > 0.07) { d += (on ? " L" : " M") + sx + " " + f1(g(wx) - 1 + oy); on = true; } else on = false;
      }
      set(zones, { d, stroke: COL[mode] });
    }
    if (hud?.type === "brake") {
      set(hud.f, { width: f1(68 * clamp(pose.brakeF || 0, 0, 1)), fill: pose.lockF ? "var(--bad)" : "var(--brake)" });
      set(hud.r, { width: f1(68 * clamp(pose.brakeR || 0, 0, 1)), fill: pose.lockR ? "var(--bad)" : "var(--brake)" });
    } else if (hud?.type === "speed") {
      set(hud.bar, { width: f1(102 * clamp(cfg.speedVal(mode, p, s), 0, 1)), fill: COL[mode] });
    }
    set(badge, { fill: COL[mode] }); badge.textContent = badgeText(mode);
    let top = null, bottom = null;
    const KK = { ...K, air: s.air, pose, out, toW, toL, scr, oy, rearW, frontW, cx, cy, th,
      top: t => { top = t; }, bottom: (t, bx) => { bottom = [t, bx]; } };
    if (cfg.fx) cfg.fx(o, mode, KK);
    set(lt, { fill: COL[mode], opacity: top ? 1 : 0 }); lt.textContent = top || "";
    if (bottom) { set(lb, { fill: COL[mode], opacity: 1, x: f1(clamp(bottom[1] ?? 200, 110, 290)) }); lb.textContent = bottom[0]; } else set(lb, { opacity: 0 });
  }
  return { reset, frame, state: () => s };
}

/* ---------------- Frontansicht ---------------- */
function frontScene(svg, cfg) {
  el("rect", { x: 0, y: -28, width: 400, height: 268, fill: "var(--sky)" }, svg);
  let fd = "M0 240";
  for (let sx = 0; sx <= 400; sx += 4) fd += ` L${sx} ${f1(110 + 16 * Math.sin(sx / 41) + 9 * Math.sin(sx / 15))}`;
  el("path", { d: fd + " L400 240 Z", fill: "var(--forest)", opacity: .3 }, svg);
  const ground = el("path", { fill: "var(--ground)", stroke: "var(--ground-edge)", "stroke-width": 2 }, svg);
  const under = el("g", {}, svg);
  const skid = el("line", { stroke: "var(--bad)", "stroke-width": 5, "stroke-linecap": "round", opacity: 0 }, svg);
  const dots = Array.from({ length: 14 }, () => el("circle", { r: 3, opacity: 0 }, svg));
  const R = el("g", {}, svg);
  const W = (c, w) => ({ stroke: c, "stroke-width": w, "stroke-linecap": "round", fill: "none" });
  const legL = [el("line", W("var(--rider)", 13), R), el("line", W("var(--rider)", 10), R)];
  const legR = [el("line", W("var(--rider)", 13), R), el("line", W("var(--rider)", 10), R)];
  const shoes = [el("circle", { r: 7, fill: "var(--shoe)" }, R), el("circle", { r: 7, fill: "var(--shoe)" }, R)];
  const torso = el("line", W("var(--rider)", 28), R);
  const head = el("circle", { r: 13, fill: "var(--rider)" }, R);
  const visor = el("line", W("var(--accent)", 4), R);
  const tire = el("line", W("var(--tire)", 12), R);
  const forks = [el("line", W("var(--bike)", 4), R), el("line", W("var(--bike)", 4), R)];
  const stem = el("line", W("var(--bike)", 5), R);
  const bar = el("line", W("var(--bike)", 5), R);
  const cranks = el("line", W("var(--bike)", 3.5), R);
  const armL = [el("line", W("var(--rider)", 10), R), el("line", W("var(--rider)", 8), R)];
  const armR = [el("line", W("var(--rider)", 10), R), el("line", W("var(--rider)", 8), R)];
  const joints = [0, 1, 2, 3].map(() => el("circle", { r: 3.6, fill: "var(--accent)", stroke: "var(--sky)", "stroke-width": 1.5 }, R));
  const fx = el("g", {}, svg);
  const lt = el("text", { x: 388, y: -8, "font-size": 13, "text-anchor": "end" }, svg);
  const badge = el("text", { x: 12, y: -8, "font-size": 15 }, svg);
  const M = makers(fx);
  const o = cfg.build ? cfg.build(M, makers(under)) : {};
  const L = (e, a, b) => set(e, { x1: f1(a[0]), y1: f1(a[1]), x2: f1(b[0]), y2: f1(b[1]) });
  const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k];
  let s;
  function reset(mode) { s = { mode, t: 0, slide: 0, hist: [], mem: {} }; }
  function frame(dt, mode, p) {
    if (!s || s.mode !== mode) reset(mode);
    s.t += dt;
    const k = { p, dt, s, t: s.t, mode };
    const ps = cfg.pose(mode, k);
    const a = (ps.surface || 0) * D2R, tg = [Math.cos(a), Math.sin(a)];
    const base = [200, 206];
    const C = add(base, tg, ps.slide || 0);
    // Boden: Linie durch den Basispunkt mit Winkel a
    const pL = add(base, tg, -320), pR = add(base, tg, 320);
    set(ground, { d: `M${f1(pL[0])} ${f1(pL[1])} L${f1(pR[0])} ${f1(pR[1])} L${f1(pR[0])} 330 L${f1(pL[0])} 330 Z` });
    const b = (ps.bike || 0) * D2R, u = [Math.sin(b), -Math.cos(b)], n = [Math.cos(b), Math.sin(b)];
    const c = (ps.body ?? ps.bike ?? 0) * D2R, Bv = [Math.sin(c), -Math.cos(c)], m = [Math.cos(c), Math.sin(c)];
    const wheelTop = add(C, u, 74);
    L(tire, add(C, u, 6), add(C, u, 68));
    L(forks[0], add(add(C, u, 37), n, -9), add(add(C, u, 84), n, -9));
    L(forks[1], add(add(C, u, 37), n, 9), add(add(C, u, 84), n, 9));
    L(stem, add(C, u, 84), add(C, u, 96));
    const barC = add(C, u, 98), gL = add(barC, n, -38), gR = add(barC, n, 38);
    L(bar, gL, gR);
    const drop = ps.drop || 0; // + = linkes Pedal unten
    const bbC = add(C, u, 34);
    const pedL = add(add(bbC, n, -22), u, -15 * drop), pedR = add(add(bbC, n, 22), u, 15 * drop);
    L(cranks, pedL, pedR);
    set(shoes[0], { cx: f1(pedL[0]), cy: f1(pedL[1]) }); set(shoes[1], { cx: f1(pedR[0]), cy: f1(pedR[1]) });
    const ankL = add(pedL, u, 7), ankR = add(pedR, u, 7);
    const H = add(C, Bv, 90 + (ps.hipAdj || 0));
    const hL = add(H, m, -11), hR = add(H, m, 11);
    const dotm = (q) => (q[0] - H[0]) * m[0] + (q[1] - H[1]) * m[1];
    const kL = ik(hL, ankL, 46, 46, (q1, q2) => dotm(q1) < dotm(q2));
    const kR = ik(hR, ankR, 46, 46, (q1, q2) => dotm(q1) > dotm(q2));
    L(legL[0], hL, kL); L(legL[1], kL, ankL); L(legR[0], hR, kR); L(legR[1], kR, ankR);
    const S = add(H, Bv, 46 - (ps.shrug || 0) * 4);
    L(torso, H, S);
    const sL = add(S, m, -19), sR = add(S, m, 19);
    const eL = ik(sL, gL, 32, 31, (q1, q2) => dotm(q1) < dotm(q2));
    const eR = ik(sR, gR, 32, 31, (q1, q2) => dotm(q1) > dotm(q2));
    L(armL[0], sL, eL); L(armL[1], eL, gL); L(armR[0], sR, eR); L(armR[1], eR, gR);
    const hd = add(S, Bv, 18 - (ps.shrug || 0) * 6);
    set(head, { cx: f1(hd[0]), cy: f1(hd[1]) });
    L(visor, add(add(hd, Bv, 5), m, -9), add(add(hd, Bv, 5), m, 9));
    [kL, kR, eL, eR].forEach((j, i) => set(joints[i], { cx: f1(j[0]), cy: f1(j[1]) }));
    if (cfg.trace) {
      s.hist.push(hd[0]); if (s.hist.length > 70) s.hist.shift();
      dots.forEach((d, i) => { const idx = s.hist.length - 1 - i * 5; if (idx < 0) { vis(d, 0); return; }
        set(d, { cx: f1(s.hist[idx]), cy: f1(hd[1] - 22 - i * 5), fill: COL[mode], opacity: (1 - i / dots.length).toFixed(2) }); });
    }
    if (ps.skidFrom != null) { const s0 = add(base, tg, ps.skidFrom); L(skid, s0, C); vis(skid, 1); } else vis(skid, 0);
    set(badge, { fill: COL[mode] }); badge.textContent = badgeText(mode);
    let top = null;
    if (cfg.fx) cfg.fx(o, mode, { ...k, ps, C, u, n, Bv, m, H, S, hd, pedL, pedR, gL, gR, wheelTop, base, tg, top: t => { top = t; } });
    set(lt, { fill: COL[mode], opacity: top ? 1 : 0 }); lt.textContent = top || "";
  }
  return { reset, frame };
}

/* ---------------- Draufsicht ---------------- */
function topScene(svg, cfg) {
  el("rect", { x: 0, y: 0, width: 360, height: 280, fill: "var(--forest)", opacity: .5 }, svg);
  const tw = cfg.width || 64;
  el("path", { d: cfg.trail, fill: "none", stroke: "var(--ground-edge)", "stroke-width": tw + 6, "stroke-linecap": "butt" }, svg);
  el("path", { d: cfg.trail, fill: "none", stroke: "var(--trail)", "stroke-width": tw, "stroke-linecap": "butt" }, svg);
  el("path", { d: cfg.trail, fill: "none", stroke: "var(--ground-edge)", "stroke-width": 1, "stroke-dasharray": "3 7", opacity: .5 }, svg);
  const trailEl = el("path", { d: cfg.trail, fill: "none", stroke: "none" }, svg);
  const TL = trailEl.getTotalLength();
  const trailAt = f => { const a = trailEl.getPointAtLength(clamp(f, 0, 1) * TL), b = trailEl.getPointAtLength(clamp(f + .002, 0, 1) * TL); const d = Math.hypot(b.x - a.x, b.y - a.y) || 1; return { x: a.x, y: a.y, tx: (b.x - a.x) / d, ty: (b.y - a.y) / d }; };
  const feats = (cfg.features || []).map(f => {
    const q = trailAt(f), ang = Math.atan2(q.ty, q.tx) / D2R;
    const gr = el("g", { transform: `translate(${f1(q.x)} ${f1(q.y)}) rotate(${f1(ang + 90)})` }, svg);
    el("rect", { x: -tw / 2 + 6, y: -4, width: tw - 12, height: 8, rx: 4, fill: "var(--root)" }, gr);
    return { f, x: q.x, y: q.y };
  });
  (cfg.rocks || []).forEach(r => el("circle", { cx: r[0], cy: r[1], r: r[2], fill: "var(--rock)", stroke: "var(--rock-edge)", "stroke-width": 2 }, svg));
  const segG = el("g", {}, svg);
  const marks = el("g", {}, svg);
  const look = el("line", { "stroke-width": 2, "stroke-dasharray": "5 4", stroke: "var(--accent)" }, svg);
  const bike = el("g", {}, svg);
  el("rect", { x: -11, y: -3.5, width: 22, height: 7, rx: 3.5, fill: "var(--rider)" }, bike);
  el("line", { x1: 7, y1: -8, x2: 7, y2: 8, stroke: "var(--rider)", "stroke-width": 3, "stroke-linecap": "round" }, bike);
  el("circle", { cx: -1, cy: 0, r: 5.5, fill: "var(--accent)" }, bike);
  const lbl = el("text", { "font-size": 12, "text-anchor": "middle" }, svg);
  const badge = el("text", { x: 12, y: 268, "font-size": 15 }, svg);
  const meas = el("path", { fill: "none", stroke: "none" }, svg);
  const N = 140;
  const segs = Array.from({ length: N }, () => el("line", { "stroke-linecap": "round" }, segG));
  const markEls = [];
  const built = {};
  function pathFor(mode) {
    const spec = cfg.paths[mode];
    if (typeof spec === "string") return spec;
    let d = "";
    for (let i = 0; i <= 200; i++) { const f = i / 200, q = trailAt(f), off = spec(f); d += (i ? " L" : "M") + f1(q.x - q.ty * off) + " " + f1(q.y + q.tx * off); }
    return d;
  }
  function prep(mode) {
    if (built[mode]) return built[mode];
    meas.setAttribute("d", pathFor(mode));
    const L = meas.getTotalLength(), pts = [];
    for (let i = 0; i <= N; i++) { const q = meas.getPointAtLength(L * i / N); pts.push([q.x, q.y]); }
    const prof = cfg.speed?.[mode] || [[0, 1], [1, 1]];
    const vAt = f => { for (let i = 1; i < prof.length; i++) if (f <= prof[i][0]) { const a = prof[i - 1], b = prof[i]; return lerp(a[1], b[1], (f - a[0]) / (b[0] - a[0] || 1)); } return prof[prof.length - 1][1]; };
    const times = [0]; for (let i = 1; i <= N; i++) times.push(times[i - 1] + 1 / Math.max(.05, vAt((i - .5) / N)));
    const T = times[N];
    built[mode] = { d: meas.getAttribute("d"), L, pts, times: times.map(t => t / T), vAt };
    return built[mode];
  }
  let s;
  function reset(mode) {
    s = { mode };
    const P0 = prep(mode), zones = cfg.brake?.[mode] || [];
    segs.forEach((e, i) => {
      const a = P0.pts[i], b = P0.pts[i + 1], f = (i + .5) / N;
      const inZone = zones.some(z => f >= z[0] && f <= z[1]);
      const w = cfg.speedWidth ? lerp(2.5, 7, clamp((P0.vAt(f) - .4) / .8, 0, 1)) : 4;
      set(e, { x1: f1(a[0]), y1: f1(a[1]), x2: f1(b[0]), y2: f1(b[1]), stroke: inZone ? "var(--brake)" : COL[mode], "stroke-width": inZone ? 7 : w, opacity: 0 });
    });
    markEls.forEach(e => e.remove()); markEls.length = 0;
    (cfg.marks?.[mode] || []).forEach(mk => {
      const gr = el("g", { opacity: 0, transform: `translate(${mk.pos[0]} ${mk.pos[1]})` }, marks);
      if (mk.type === "x") el("path", { d: "M-7 -7 L7 7 M7 -7 L-7 7", stroke: "var(--bad)", "stroke-width": 3.5, "stroke-linecap": "round" }, gr);
      else el("circle", { r: 7, fill: "none", stroke: COL[mode], "stroke-width": 2.5 }, gr);
      if (mk.text) { const t = el("text", { x: mk.dx ?? 0, y: mk.dy ?? 22, "font-size": 12, "text-anchor": mk.anchor || "middle", fill: COL[mode] }, gr); t.textContent = mk.text; }
      mk.el = gr; markEls.push(gr);
    });
  }
  function frame(dt, mode, p) {
    if (!s || s.mode !== mode) reset(mode);
    const P0 = prep(mode);
    const q = clamp(p / .85, 0, 1);
    let i = 0; while (i < N && P0.times[i + 1] < q) i++;
    const t0 = P0.times[i], t1 = P0.times[Math.min(N, i + 1)], fr = t1 > t0 ? (q - t0) / (t1 - t0) : 0;
    const a = P0.pts[i], b = P0.pts[Math.min(N, i + 1)];
    const pos = [lerp(a[0], b[0], fr), lerp(a[1], b[1], fr)];
    const f = (i + fr) / N;
    segs.forEach((e, j) => e.setAttribute("opacity", j < i ? 1 : 0));
    let ang = Math.atan2(b[1] - a[1], b[0] - a[0]) / D2R;
    let jolt = 0;
    (cfg.bumps?.[mode] || []).forEach(bm => { if (f > bm[0] && f < bm[1]) jolt = Math.sin(p * 90) * 3; });
    set(bike, { transform: `translate(${f1(pos[0])} ${f1(pos[1] + jolt)}) rotate(${f1(ang)})` });
    // Blick
    const lk = cfg.look?.[mode] ?? 40;
    let tgt;
    if (typeof lk === "number") { const j = Math.min(N, i + Math.round(lk / P0.L * N)); tgt = P0.pts[j]; }
    else if (lk.point && f >= (lk.from ?? 0) && f <= (lk.to ?? 1)) tgt = lk.point;
    else if (lk.next) { const ahead = feats.filter(ft => ft.f > f + .02); const ft = ahead[Math.min(ahead.length - 1, lk.next - 1)]; tgt = ft ? [ft.x, ft.y] : P0.pts[N]; }
    else { const j = Math.min(N, i + Math.round((lk.dist || 40) / P0.L * N)); tgt = P0.pts[j]; }
    set(look, { x1: f1(pos[0]), y1: f1(pos[1]), x2: f1(tgt[0]), y2: f1(tgt[1]) });
    (cfg.marks?.[mode] || []).forEach(mk => mk.el && vis(mk.el, f >= mk.at));
    const lab = (cfg.labels?.[mode] || []).filter(l => f >= l.at).pop();
    if (lab) { set(lbl, { x: lab.pos[0], y: lab.pos[1], fill: COL[mode], opacity: 1 }); lbl.textContent = lab.text; } else vis(lbl, 0);
    set(badge, { fill: COL[mode] }); badge.textContent = badgeText(mode);
  }
  return { reset, frame };
}

/* ---------------- Schaubilder ---------------- */
function chartBase(svg) {
  el("rect", { x: 0, y: 0, width: 400, height: 260, fill: "var(--sky)" }, svg);
  const g = el("g", {}, svg);
  const badge = el("text", { x: 12, y: 22, "font-size": 15 }, svg);
  const lt = el("text", { x: 388, y: 22, "font-size": 13, "text-anchor": "end" }, svg);
  return { g, M: makers(g), setMode(mode, top) { set(badge, { fill: COL[mode] }); badge.textContent = badgeText(mode); set(lt, { fill: COL[mode], opacity: top ? 1 : 0 }); lt.textContent = top || ""; } };
}
// Bremsen über die Zeit (2.3, 9.2)
function chartBrakes(svg, cfg) {
  const c = chartBase(svg), M = c.M;
  const X0 = 40, X1 = 380, Y0 = 200, Y1 = 50;
  M.line({ x1: X0, y1: Y0, x2: X1, y2: Y0, stroke: "var(--muted)" });
  M.line({ x1: X0, y1: Y0, x2: X0, y2: Y1 - 8, stroke: "var(--muted)" });
  M.text({ x: X0 - 6, y: Y1 - 14, "text-anchor": "start", fill: "var(--muted)", "font-size": 12 }).textContent = "TEMPO";
  M.text({ x: X1, y: Y1 - 14, "text-anchor": "end", fill: "var(--muted)", "font-size": 12 }).textContent = "ZEIT →";
  cfg.corners.forEach(t => {
    const x = lerp(X0, X1, t);
    M.line({ x1: x, y1: Y1, x2: x, y2: Y0, stroke: "var(--line)", "stroke-dasharray": "3 4" });
    M.text({ x, y: Y0 + 16, fill: "var(--muted)", "font-size": 11 }).textContent = "KURVE";
  });
  const line = M.path({ "stroke-width": 3.5 });
  const dots = M.g();
  const cnt = M.text({ x: 216, y: 237, "text-anchor": "start", "font-size": 13, fill: "var(--fg)" });
  M.text({ x: 40, y: 236, "text-anchor": "start", "font-size": 12, fill: "var(--muted)" }).textContent = "BREMSE";
  M.rect({ x: 86, y: 226, width: 114, height: 12, rx: 6, fill: "none", stroke: "var(--line)", "stroke-width": 1.5 });
  const temp = M.rect({ x: 88, y: 228, height: 8, rx: 4, width: 0 });
  const base = cfg.fast ? .9 : .8, per = cfg.fast ? .045 : .06;
  const vR = t => { let v = base; for (const k of cfg.corners) { const tb = k - .07; v = Math.min(v, base - (base - .42) * ss(tb, tb + .03, t) * (1 - ss(k + .03, k + .14, t))); } return v; };
  const vF = t => { const ph = (t % per) / per, saw = ph < .3 ? ph / .3 : 1 - (ph - .3) / .7; let v = base - .07 - .13 * saw * (cfg.fast ? 1.3 : 1); for (const k of cfg.corners) v = Math.min(v, base - (base - .38) * ss(k - .02, k + .02, t) * (1 - ss(k + .06, k + .16, t))); return v; };
  const ev = { R: cfg.corners.map(k => k - .07), F: [] };
  for (let t = .02; t < 1; t += per) ev.F.push(t);
  let mode0 = null;
  function reset(mode) { mode0 = mode; dots.innerHTML = ""; ev[mode].forEach(t => { const v = (mode === "F" ? vF : vR)(t + .01); el("circle", { cx: f1(lerp(X0, X1, t)), cy: f1(lerp(Y0, Y1, v)), r: 4.5, fill: "var(--brake)", opacity: 0, "data-t": t }, dots); }); }
  function frame(dt, mode, p) {
    if (mode0 !== mode) reset(mode);
    const T = clamp(p / .9, 0, 1), fn = mode === "F" ? vF : vR;
    let d = ""; for (let i = 0; i <= 200 * T; i++) { const t = i / 200; d += (i ? " L" : "M") + f1(lerp(X0, X1, t)) + " " + f1(lerp(Y0, Y1, fn(t))); }
    set(line, { d, stroke: COL[mode] });
    let n = 0; dots.childNodes.forEach(e => { const on = +e.getAttribute("data-t") <= T; vis(e, on); if (on) n++; });
    cnt.textContent = `BREMSUNGEN: ${n}`;
    const tv = mode === "F" ? clamp(.15 + n * .05, 0, 1) : clamp(.15 + n * .05, 0, .45);
    set(temp, { width: f1(110 * tv), fill: tv > .6 ? "var(--bad)" : "var(--brake)" });
    c.setMode(mode, T > .5 ? (mode === "F" ? "BREMSE WIRD HEISS" : "BREMSE BLEIBT KÜHL") : null);
  }
  return { reset, frame };
}
// Gemeinsames Table-Profil
const TBL = { gy: 215, lipX: 192, lipY: 175, platEnd: 262, knuckle: 274, landEnd: 334 };
function tableProfileY(x) {
  const t = TBL;
  if (x < 150) return t.gy;
  if (x < t.lipX) { const r = (x - 150) / (t.lipX - 150); return t.gy - 40 * r * r; }
  if (x < t.platEnd) return t.lipY;
  if (x < t.knuckle) return t.lipY + 5 * ss(t.platEnd, t.knuckle, x);
  if (x < t.landEnd) return lerp(t.lipY + 5, t.gy - 2, (x - t.knuckle) / (t.landEnd - t.knuckle));
  if (x < t.landEnd + 12) return lerp(t.gy - 2, t.gy, (x - t.landEnd) / 12);
  return t.gy;
}
function drawTable(M) {
  let d = "M0 260 L0 " + TBL.gy; for (let x = 0; x <= 400; x += 3) d += ` L${x} ${f1(tableProfileY(x))}`;
  M.path({ d: d + " L400 260 Z", fill: "var(--ground)", stroke: "var(--ground-edge)", "stroke-width": 2 });
}
function arcPt(x0, y0, x1, y1, h, t) { // quadratische Bezier
  const cx = (x0 + x1) / 2, cy = Math.min(y0, y1) - h;
  return [(1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * cx + t * t * x1, (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * cy + t * t * y1];
}
function arcD(x0, y0, x1, y1, h, upto = 1) { let d = ""; for (let i = 0; i <= 30; i++) { const q = arcPt(x0, y0, x1, y1, h, upto * i / 30); d += (i ? " L" : "M") + f1(q[0]) + " " + f1(q[1]); } return d; }
// 6.3 Gleicher Bremspunkt
function chartArcs(svg) {
  const c = chartBase(svg), M = c.M;
  drawTable(M);
  M.rect({ x: 286, y: 0, width: 34, height: 4, opacity: 0 });
  const zone = M.path({ "stroke-width": 7, stroke: "var(--good)", opacity: .35 });
  set(zone, { d: `M288 ${f1(tableProfileY(288) - 1)} L320 ${f1(tableProfileY(320) - 1)}` });
  const runs = { F: [{ flag: 120, land: 362 }, { flag: 40, land: 254 }, { flag: 80, land: 302 }], R: [{ flag: 80, land: 298 }, { flag: 80, land: 303 }, { flag: 80, land: 300 }] };
  const flags = [0, 1, 2].map(i => { const gr = M.g({ opacity: 0 }); el("line", { x1: 0, y1: 0, x2: 0, y2: -26, stroke: "var(--fg)", "stroke-width": 2 }, gr); el("path", { d: "M0 -26 L14 -21 L0 -16 Z", fill: "var(--brake)" }, gr); const t = el("text", { x: 4, y: 14, "font-size": 11, "text-anchor": "middle", fill: "var(--muted)" }, gr); t.textContent = String(i + 1); return gr; });
  const arcs = [0, 1, 2].map(() => M.path({ "stroke-width": 2.5, "stroke-dasharray": "4 4" }));
  const lands = [0, 1, 2].map(() => M.g({ opacity: 0 }));
  const dot = M.circle({ r: 6, fill: "var(--accent)" });
  M.text({ x: 200, y: 246, fill: "var(--muted)", "font-size": 12 }).textContent = "FAHNE = HIER BREMSEN";
  let mode0 = null;
  function reset(mode) {
    mode0 = mode;
    runs[mode].forEach((r, i) => {
      set(flags[i], { transform: `translate(${r.flag} ${TBL.gy})`, opacity: 0 });
      lands[i].innerHTML = ""; vis(lands[i], 0);
      const ok = r.land >= 288 && r.land <= 320, ly = tableProfileY(r.land);
      if (ok) el("circle", { cx: r.land, cy: f1(ly - 4), r: 6, fill: "var(--good)" }, lands[i]);
      else { el("path", { d: `M${r.land - 6} ${f1(ly - 10)} L${r.land + 6} ${f1(ly + 2)} M${r.land + 6} ${f1(ly - 10)} L${r.land - 6} ${f1(ly + 2)}`, stroke: "var(--bad)", "stroke-width": 3, "stroke-linecap": "round" }, lands[i]); const t = el("text", { x: r.land, y: f1(ly - 16), "font-size": 11, "text-anchor": "middle", fill: "var(--bad)" }, lands[i]); t.textContent = r.land < 288 ? "ZU KURZ" : "ZU WEIT"; }
    });
  }
  function frame(dt, mode, p) {
    if (mode0 !== mode) reset(mode);
    let cur = null;
    runs[mode].forEach((r, i) => {
      const a = i * .3, q = clamp((p - a) / .28, 0, 1), started = p >= a;
      set(flags[i], { opacity: started ? (q < 1 ? 1 : .45) : 0 });
      const h = r.land > 330 ? 34 : r.land < 288 ? 10 : 24;
      if (!started) { set(arcs[i], { d: "" }); return; }
      const ay = q < .45 ? 1 : 0;
      if (q < .45) cur = [lerp(20, TBL.lipX, q / .45), tableProfileY(lerp(20, TBL.lipX, q / .45)) - 6];
      else if (q < .9) { const t = (q - .45) / .45; cur = arcPt(TBL.lipX, TBL.lipY - 6, r.land, tableProfileY(r.land) - 6, h, t); set(arcs[i], { d: arcD(TBL.lipX, TBL.lipY - 6, r.land, tableProfileY(r.land) - 6, h, t), stroke: COL[mode] }); }
      else set(arcs[i], { d: arcD(TBL.lipX, TBL.lipY - 6, r.land, tableProfileY(r.land) - 6, h, 1), stroke: COL[mode], opacity: .6 });
      vis(lands[i], q >= .9); void ay;
    });
    if (cur) { set(dot, { cx: f1(cur[0]), cy: f1(cur[1]), opacity: 1 }); } else vis(dot, 0);
    c.setMode(mode, p > .85 ? (mode === "F" ? "3 VERSCHIEDENE LANDUNGEN" : "3-MAL GLEICH") : null);
  }
  return { reset, frame };
}
// 6.5 Weite steigern
function chartTableSteps(svg) {
  const c = chartBase(svg), M = c.M;
  drawTable(M);
  const zones = [{ a: 205, b: 240, x: 222, n: "OBEN", y: 96 }, { a: 252, b: 272, x: 263, n: "KANTE", y: 110 }, { a: 288, b: 320, x: 306, n: "LANDUNG", y: 96 }];
  const zEls = zones.map(z => { const p0 = M.path({ "stroke-width": 7, opacity: .3, stroke: "var(--good)", d: `M${z.a} ${f1(tableProfileY(z.a) - 1)} L${z.b} ${f1(tableProfileY(z.b) - 1)}` }); const t = M.text({ x: z.x, y: z.y, "font-size": 11, fill: "var(--muted)" }); t.textContent = z.n; const ch = M.text({ x: z.x, y: z.y + 16, "font-size": 12, fill: "var(--good)" }); return { p0, ch }; });
  const arc = M.path({ "stroke-width": 2.5, "stroke-dasharray": "4 4" });
  const dot = M.circle({ r: 6, fill: "var(--accent)" });
  const x = M.g({ opacity: 0 });
  el("path", { d: "M262 168 L274 180 M274 168 L262 180", stroke: "var(--bad)", "stroke-width": 3.5, "stroke-linecap": "round" }, x);
  const xt = el("text", { x: 268, y: 160, "font-size": 12, "text-anchor": "middle", fill: "var(--bad)" }, x); xt.textContent = "HARTER AUFPRALL";
  let mode0 = null;
  function reset(mode) { mode0 = mode; zEls.forEach(z => z.ch.textContent = ""); vis(x, 0); }
  function frame(dt, mode, p) {
    if (mode0 !== mode) reset(mode);
    if (mode === "F") {
      zEls.forEach(z => z.ch.textContent = "");
      const q = clamp((p - .05) / .5, 0, 1), land = 266;
      if (q < .4) set(dot, { cx: f1(lerp(30, TBL.lipX, q / .4)), cy: f1(tableProfileY(lerp(30, TBL.lipX, q / .4)) - 6), opacity: 1 });
      else { const t = (q - .4) / .6, pt = arcPt(TBL.lipX, TBL.lipY - 6, land, tableProfileY(land) - 6, 30, t); set(dot, { cx: f1(pt[0]), cy: f1(pt[1]), opacity: 1 }); set(arc, { d: arcD(TBL.lipX, TBL.lipY - 6, land, tableProfileY(land) - 6, 30, t), stroke: COL.F }); }
      if (q < .4) set(arc, { d: "" });
      vis(x, q >= 1);
      c.setMode(mode, q >= 1 ? "ZIEL: GLEICH GANZ WEIT" : null);
      return;
    }
    const k = Math.min(8, Math.floor(p / .1)), q = clamp((p - k * .1) / .085, 0, 1), z = zones[Math.floor(k / 3)];
    zEls.forEach((e, i) => { const done = Math.min(3, Math.max(0, (i < Math.floor(k / 3) ? 3 : i === Math.floor(k / 3) ? k % 3 + (q >= 1 ? 1 : 0) : 0))); e.ch.textContent = "✓".repeat(done); });
    const land = z.x + ((k % 3) - 1) * 4, h = 12 + Math.floor(k / 3) * 8;
    const pt = arcPt(TBL.lipX, TBL.lipY - 6, land, tableProfileY(land) - 6, h, q);
    set(dot, { cx: f1(pt[0]), cy: f1(pt[1]), opacity: p < .9 ? 1 : 0 });
    set(arc, { d: arcD(TBL.lipX, TBL.lipY - 6, land, tableProfileY(land) - 6, h, q), stroke: COL.R });
    c.setMode(mode, p > .9 ? "JEDE STUFE 3-MAL" : null);
  }
  return { reset, frame };
}
// 7.4 Drop-Höhe steigern
function chartDropSteps(svg) {
  const c = chartBase(svg), M = c.M;
  const drops = [{ x: 95, h: 18, n: "KLEIN" }, { x: 215, h: 34, n: "MITTEL" }, { x: 335, h: 54, n: "HOCH" }];
  const gy = 215;
  drops.forEach(d => {
    M.path({ d: `M${d.x - 70} 260 L${d.x - 70} ${gy - d.h} L${d.x} ${gy - d.h} L${d.x} ${gy} L${d.x + 50} ${gy} L${d.x + 50} 260 Z`, fill: "var(--ground)", stroke: "var(--ground-edge)", "stroke-width": 2 });
    M.text({ x: d.x - 10, y: gy + 30, "font-size": 12, fill: "var(--muted)" }).textContent = d.n;
  });
  const checks = drops.map(d => M.text({ x: d.x - 10, y: gy - d.h - 30, "font-size": 15, fill: "var(--good)" }));
  const arc = M.path({ "stroke-width": 2.5, "stroke-dasharray": "4 4" });
  const dot = M.circle({ r: 6, fill: "var(--accent)" });
  const x = M.g({ opacity: 0 });
  el("path", { d: "M364 203 L376 215 M376 203 L364 215", stroke: "var(--bad)", "stroke-width": 3.5, "stroke-linecap": "round" }, x);
  const skipT = [M.text({ x: 85, y: 150, "font-size": 11, fill: "var(--bad)" }), M.text({ x: 205, y: 132, "font-size": 11, fill: "var(--bad)" })];
  let mode0 = null;
  function reset(mode) { mode0 = mode; checks.forEach(t => t.textContent = ""); vis(x, 0); skipT.forEach(t => t.textContent = ""); }
  function frame(dt, mode, p) {
    if (mode0 !== mode) reset(mode);
    if (mode === "F") {
      const d = drops[2], q = clamp((p - .1) / .5, 0, 1);
      const x0 = d.x - 60, y0 = gy - d.h - 6;
      const pt = q < .4 ? [lerp(x0, d.x, q / .4), y0] : arcPt(d.x, y0, d.x + 32, gy - 6, 6, (q - .4) / .6);
      set(dot, { cx: f1(pt[0]), cy: f1(pt[1]), opacity: 1 });
      set(arc, { d: q >= .4 ? arcD(d.x, y0, d.x + 32, gy - 6, 6, (q - .4) / .6) : "", stroke: COL.F });
      vis(x, q >= 1);
      skipT.forEach(t => t.textContent = p > .05 ? "AUSGELASSEN" : "");
      c.setMode(mode, q >= 1 ? "ZU VIEL AUF EINMAL" : null);
      return;
    }
    const k = Math.min(8, Math.floor(p / .1)), q = clamp((p - k * .1) / .085, 0, 1), di = Math.floor(k / 3), d = drops[di];
    checks.forEach((t, i) => { const n = i < di ? 3 : i === di ? k % 3 + (q >= 1 ? 1 : 0) : 0; t.textContent = "✓".repeat(Math.min(3, n)); });
    const x0 = d.x - 55, y0 = gy - d.h - 6, lx = d.x + 22 + d.h * .2;
    const pt = q < .4 ? [lerp(x0, d.x, q / .4), y0] : arcPt(d.x, y0, lx, gy - 6, 5, (q - .4) / .6);
    set(dot, { cx: f1(pt[0]), cy: f1(pt[1]), opacity: p < .9 ? 1 : 0 });
    set(arc, { d: q >= .4 ? arcD(d.x, y0, lx, gy - 6, 5, (q - .4) / .6) : "", stroke: COL.R });
    c.setMode(mode, p > .9 ? "JEDE HÖHE 3-MAL" : null);
  }
  return { reset, frame };
}
// 7.1 Drop anschauen
function chartDropCheck(svg) {
  const c = chartBase(svg), M = c.M;
  const top = 140, gy = 210, edge = 210;
  M.path({ d: `M0 260 L0 ${top} L${edge} ${top} L${edge} ${gy} L400 ${gy} L400 260 Z`, fill: "var(--ground)", stroke: "var(--ground-edge)", "stroke-width": 2 });
  const hidden = M.rect({ x: edge + 2, y: gy - 24, width: 110, height: 22, fill: "var(--muted)", opacity: 0 });
  const q = M.text({ x: edge + 57, y: gy - 8, "font-size": 14, fill: "var(--bg)", opacity: 0 }); q.textContent = "?";
  const sight = M.path({ "stroke-width": 2, "stroke-dasharray": "4 4", stroke: "var(--bad)", opacity: 0 });
  const items = [
    { at: .08, build: g => { el("path", { d: arrowD(edge + 14, top, 0, gy - top - 2, 6) + " " + arrowD(edge + 14, gy - 2, 0, -(gy - top - 2), 6), stroke: "var(--good)", "stroke-width": 2.5, fill: "none" }, g); const t = el("text", { x: edge + 22, y: (top + gy) / 2, "font-size": 12, fill: "var(--good)", "text-anchor": "start" }, g); t.textContent = "1 HÖHE"; } },
    { at: .26, build: g => { el("circle", { cx: edge + 60, cy: gy - 6, r: 14, fill: "none", stroke: "var(--good)", "stroke-width": 2.5 }, g); const t = el("text", { x: edge + 60, y: gy + 28, "font-size": 12, fill: "var(--good)" }, g); t.textContent = "2 LANDUNG"; } },
    { at: .44, build: g => { el("path", { d: arrowD(edge + 90, gy - 14, 90, 0, 7), stroke: "var(--good)", "stroke-width": 2.5, fill: "none" }, g); const t = el("text", { x: edge + 140, y: gy - 22, "font-size": 12, fill: "var(--good)" }, g); t.textContent = "3 PLATZ DANACH"; } },
    { at: .62, build: g => { el("path", { d: arrowD(60, top - 16, 80, 0, 7), stroke: "var(--good)", "stroke-width": 2.5, fill: "none" }, g); const t = el("text", { x: 100, y: top - 26, "font-size": 12, fill: "var(--good)" }, g); t.textContent = "4 TEMPO"; } },
  ].map(it => { const gr = M.g({ opacity: 0 }); it.build(gr); return { ...it, gr }; });
  const dot = M.circle({ r: 6, fill: "var(--accent)" });
  const arc = M.path({ "stroke-width": 2.5, "stroke-dasharray": "4 4" });
  let mode0 = null;
  function reset(mode) { mode0 = mode; }
  function frame(dt, mode, p) {
    if (mode0 !== mode) reset(mode);
    items.forEach(it => vis(it.gr, mode === "R" && p >= it.at));
    vis(hidden, mode === "F"); vis(q, mode === "F");
    if (mode === "F") {
      const qq = clamp((p - .05) / .55, 0, 1), x = lerp(20, edge, qq);
      set(dot, { cx: f1(x), cy: top - 6, opacity: 1 });
      set(sight, { d: `M${f1(x)} ${top - 22} L${edge} ${top} L${edge + 60} ${top + 26}`, opacity: 1 });
      set(arc, { d: qq >= 1 ? arcD(edge, top - 6, edge + 40, gy - 6, 4, clamp((p - .6) / .2, 0, 1)) : "", stroke: COL.F });
      c.setMode(mode, p > .45 ? "LANDUNG NICHT GESEHEN" : null);
    } else {
      vis(sight, 0);
      const qq = clamp((p - .78) / .12, 0, 1), x = lerp(60, edge, Math.min(1, qq / .5));
      if (p < .78) set(dot, { cx: 40, cy: top - 6, opacity: 1 });
      else if (qq < .5) set(dot, { cx: f1(x), cy: top - 6, opacity: 1 });
      else { const pt = arcPt(edge, top - 6, edge + 60, gy - 6, 6, (qq - .5) / .5); set(dot, { cx: f1(pt[0]), cy: f1(pt[1]), opacity: 1 }); }
      set(arc, { d: qq > .5 ? arcD(edge, top - 6, edge + 60, gy - 6, 6, (qq - .5) / .5) : "", stroke: COL.R });
      c.setMode(mode, p > .7 ? "ALLES GEPRÜFT" : null);
    }
  }
  return { reset, frame };
}
// 10.2 Tempo vom Vorfahrer
function chartGap(svg) {
  const c = chartBase(svg), M = c.M;
  const d = "M0 260 L0 215 L110 215 Q150 214 168 165 L174 165 L180 240 L262 240 L262 168 L270 168 Q300 180 335 213 L400 215 L400 260 Z";
  M.path({ d, fill: "var(--ground)", stroke: "var(--ground-edge)", "stroke-width": 2 });
  M.text({ x: 221, y: 232, "font-size": 11, fill: "var(--muted)" }).textContent = "LÜCKE";
  const zone = M.path({ d: "M282 176 L318 199", stroke: "var(--good)", "stroke-width": 7, opacity: .35 });
  const arcA = M.path({ "stroke-width": 2.5, "stroke-dasharray": "4 4", stroke: "var(--muted)" });
  const arcB = M.path({ "stroke-width": 2.5, "stroke-dasharray": "4 4" });
  const lead = M.circle({ r: 6, fill: "var(--muted)", opacity: 0 });
  const leadT = M.text({ "font-size": 11, fill: "var(--muted)", opacity: 0 }); leadT.textContent = "KÖNNER";
  const me = M.circle({ r: 6, fill: "var(--accent)" });
  const x = M.g({ opacity: 0 }); el("path", { d: "M256 160 L268 172 M268 160 L256 172", stroke: "var(--bad)", "stroke-width": 3.5, "stroke-linecap": "round" }, x);
  const yLip = 159, xLip = 172;
  const run = (q, land, ly, h) => q < .4 ? [lerp(20, xLip, q / .4), q < .3 ? 209 : lerp(209, yLip, (q - .3) / .1)] : arcPt(xLip, yLip, land, ly, h, (q - .4) / .6);
  let mode0 = null;
  function reset(mode) { mode0 = mode; vis(x, 0); }
  function frame(dt, mode, p) {
    if (mode0 !== mode) reset(mode);
    void zone;
    if (mode === "F") {
      vis(lead, 0); vis(leadT, 0); set(arcA, { d: "" });
      const q = clamp((p - .05) / .6, 0, 1), pt = run(q, 262, 166, 14);
      set(me, { cx: f1(pt[0]), cy: f1(pt[1]) });
      set(arcB, { d: q > .4 ? arcD(xLip, yLip, 262, 166, 14, (q - .4) / .6) : "", stroke: COL.F });
      vis(x, q >= 1);
      c.setMode(mode, q >= 1 ? "ZU KURZ" : null);
    } else {
      const qa = clamp((p - .02) / .55, 0, 1), qb = clamp((p - .3) / .55, 0, 1);
      const pa = run(qa, 300, 186, 26), pb = run(qb, 300, 186, 26);
      set(lead, { cx: f1(pa[0]), cy: f1(pa[1]), opacity: qa < 1 ? 1 : .4 }); set(leadT, { x: f1(pa[0]), y: f1(pa[1] - 12), opacity: qa < 1 ? 1 : 0 });
      set(arcA, { d: qa > .4 ? arcD(xLip, yLip, 300, 186, 26, (qa - .4) / .6) : "" });
      set(me, { cx: f1(pb[0]), cy: f1(pb[1]) });
      set(arcB, { d: qb > .4 ? arcD(xLip, yLip, 300, 186, 26, (qb - .4) / .6) : "", stroke: COL.R });
      vis(x, 0);
      c.setMode(mode, qb >= 1 ? "LANDUNG PASST" : qa > .1 ? "ABSTAND HALTEN" : null);
    }
  }
  return { reset, frame };
}
// 10.1 Zu Fuß ansehen
function chartScout(svg) {
  el("rect", { x: 0, y: 0, width: 400, height: 260, fill: "var(--forest)", opacity: .5 }, svg);
  const trail = "M 200 262 C 200 210, 120 200, 140 150 S 270 110, 230 64 L 210 -4";
  el("path", { d: trail, fill: "none", stroke: "var(--ground-edge)", "stroke-width": 50 }, svg);
  el("path", { d: trail, fill: "none", stroke: "var(--trail)", "stroke-width": 44 }, svg);
  const tEl = el("path", { d: trail, fill: "none", stroke: "none" }, svg), TL = tEl.getTotalLength();
  const at = f => { const a = tEl.getPointAtLength(clamp(f, 0, 1) * TL), b = tEl.getPointAtLength(clamp(f + .003, 0, 1) * TL), d = Math.hypot(b.x - a.x, b.y - a.y) || 1; return { x: a.x, y: a.y, nx: -(b.y - a.y) / d, ny: (b.x - a.x) / d }; };
  const feats = [{ f: .16, k: "g" }, { f: .34, k: "g" }, { f: .52, k: "y" }, { f: .7, k: "g" }, { f: .86, k: "r" }];
  const colK = { g: "var(--good)", y: "var(--brake)", r: "var(--bad)" }, symK = { g: "✓", y: "!", r: "✕" };
  const bypass = f => feats.reduce((a, ft) => a + (ft.k !== "g" ? 30 * win(f, ft.f - .07, ft.f - .03, ft.f + .03, ft.f + .07) : 0), 0);
  feats.forEach(ft => { const q = at(ft.f); el("rect", { x: f1(q.x - 14), y: f1(q.y - 5), width: 28, height: 10, rx: 4, fill: "var(--root)" }, svg); ft.q = q; });
  const chick = feats.filter(f => f.k !== "g").map(ft => { let d = ""; for (let i = 0; i <= 20; i++) { const f = ft.f - .08 + .16 * i / 20, q = at(f), o = bypass(f); d += (i ? " L" : "M") + f1(q.x + q.nx * o) + " " + f1(q.y + q.ny * o); } return el("path", { d, fill: "none", stroke: colK[ft.k], "stroke-width": 2.5, "stroke-dasharray": "4 4", opacity: 0 }, svg); });
  const marks = feats.map(ft => { const gr = el("g", { transform: `translate(${f1(ft.q.x + 30)} ${f1(ft.q.y)})`, opacity: 0 }, svg); const cc = el("circle", { r: 10, "stroke-width": 0 }, gr); const t = el("text", { y: 5, "font-size": 13, "text-anchor": "middle", fill: "#fff" }, gr); return { gr, cc, t }; });
  const walker = el("g", { opacity: 0 }, svg); el("circle", { cy: -9, r: 5, fill: "var(--rider)" }, walker); el("line", { x1: 0, y1: -4, x2: 0, y2: 8, stroke: "var(--rider)", "stroke-width": 4, "stroke-linecap": "round" }, walker);
  const dot = el("circle", { r: 7, fill: "var(--accent)", stroke: "var(--rider)", "stroke-width": 2 }, svg);
  const c = { badge: el("text", { x: 12, y: 22, "font-size": 15 }, svg), lt: el("text", { x: 388, y: 22, "font-size": 13, "text-anchor": "end" }, svg) };
  el("text", { x: 388, y: 250, "font-size": 11, "text-anchor": "end", fill: "var(--fg)" }, svg).textContent = "✓ fahren   ! später   ✕ nein";
  let mode0 = null;
  function reset(mode) { mode0 = mode; }
  function frame(dt, mode, p) {
    if (mode0 !== mode) reset(mode);
    let top = null;
    if (mode === "F") {
      vis(walker, 0); chick.forEach(e => vis(e, 0));
      const f = clamp((p - .05) / .8, 0, 1), q = at(f);
      set(dot, { cx: f1(q.x), cy: f1(q.y) });
      marks.forEach((m, i) => { const on = f >= feats[i].f - .04; vis(m.gr, on); set(m.cc, { fill: "var(--muted)" }); m.t.textContent = "?"; });
      top = p > .2 ? "OHNE PLAN" : null;
    } else {
      const fw = clamp((p - .02) / .45, 0, 1), qw = at(fw);
      set(walker, { transform: `translate(${f1(qw.x)} ${f1(qw.y)})`, opacity: p < .5 ? 1 : 0 });
      marks.forEach((m, i) => { const on = fw >= feats[i].f; vis(m.gr, on); set(m.cc, { fill: colK[feats[i].k] }); m.t.textContent = symK[feats[i].k]; });
      chick.forEach((e, j) => { const ft = feats.filter(z => z.k !== "g")[j]; vis(e, fw >= ft.f); });
      const fr = clamp((p - .52) / .43, 0, 1), q = at(fr), o = bypass(fr);
      set(dot, { cx: f1(q.x + q.nx * o), cy: f1(q.y + q.ny * o), opacity: p >= .5 ? 1 : 0 });
      top = p < .5 ? "ERST ZU FUSS" : "JETZT FAHREN";
    }
    if (mode === "F") vis(dot, 1);
    set(c.badge, { fill: COL[mode] }); c.badge.textContent = badgeText(mode);
    set(c.lt, { fill: COL[mode], opacity: top ? 1 : 0 }); c.lt.textContent = top || "";
  }
  return { reset, frame };
}
// 10.3 Stück für Stück
function chartSections(svg) {
  el("rect", { x: 0, y: 0, width: 400, height: 260, fill: "var(--forest)", opacity: .5 }, svg);
  const trail = "M 60 240 C 60 180, 200 210, 200 150 S 340 120, 330 70 S 220 30, 150 20";
  el("path", { d: trail, fill: "none", stroke: "var(--ground-edge)", "stroke-width": 40 }, svg);
  el("path", { d: trail, fill: "none", stroke: "var(--trail)", "stroke-width": 34 }, svg);
  const tEl = el("path", { d: trail, fill: "none", stroke: "none" }, svg), TL = tEl.getTotalLength();
  const at = f => tEl.getPointAtLength(clamp(f, 0, 1) * TL);
  const done = el("path", { d: trail, fill: "none", "stroke-width": 5, "stroke-linecap": "round", "stroke-dasharray": `0 ${TL}` }, svg);
  const stops = [.36, .7].map(f => { const q = at(f); const gr = el("g", { transform: `translate(${f1(q.x + 26)} ${f1(q.y)})`, opacity: 0 }, svg); el("polygon", { points: "-9,-4 -4,-9 4,-9 9,-4 9,4 4,9 -4,9 -9,4", fill: "var(--bad)" }, gr); el("rect", { x: -5, y: -1.5, width: 10, height: 3, fill: "#fff" }, gr); return { gr, f }; });
  const dot = el("circle", { r: 7, fill: "var(--accent)", stroke: "var(--rider)", "stroke-width": 2 }, svg);
  const badge = el("text", { x: 12, y: 252, "font-size": 15 }, svg), lt = el("text", { x: 388, y: 252, "font-size": 13, "text-anchor": "end" }, svg);
  const segR = [[.02, .22, 0, .36], [.36, .48, .36, .36], [.48, .64, .36, .7], [.64, .76, .7, .7], [.76, .95, .7, 1]];
  function reset() {}
  function frame(dt, mode, p) {
    let f, top = null;
    if (mode === "F") { f = clamp((p - .05) / .6, 0, 1); stops.forEach(s => vis(s.gr, 0)); top = p > .2 ? "ALLES AM STÜCK" : null; }
    else {
      const sg = segR.find(z => p >= z[0] && p < z[1]) || (p < .02 ? [0, .02, 0, 0] : segR[4]);
      f = lerp(sg[2], sg[3], clamp((p - sg[0]) / (sg[1] - sg[0]), 0, 1));
      stops.forEach(s => vis(s.gr, f >= s.f - .001));
      const paused = segR.some(z => z[2] === z[3] && p >= z[0] && p < z[1]);
      top = paused ? "ANHALTEN · PLANEN" : p > .02 ? "EIN STÜCK FAHREN" : null;
    }
    const q = at(f);
    set(dot, { cx: f1(q.x), cy: f1(q.y) });
    set(done, { stroke: COL[mode], "stroke-dasharray": `${f1(f * TL)} ${f1(TL)}` });
    set(badge, { fill: COL[mode] }); badge.textContent = badgeText(mode);
    set(lt, { fill: COL[mode], opacity: top ? 1 : 0 }); lt.textContent = top || "";
  }
  return { reset, frame };
}

const CHARTS = { brakes: chartBrakes, arcs: chartArcs, tableSteps: chartTableSteps, dropSteps: chartDropSteps, dropCheck: chartDropCheck, gap: chartGap, scout: chartScout, sections: chartSections };
const VIEWBOX = { side: "0 -28 400 268", front: "0 -28 400 268", top: "0 0 360 280", chart: "0 0 400 260" };

export function createScene(svg, def) {
  svg.setAttribute("viewBox", VIEWBOX[def.kind]);
  svg.innerHTML = "";
  if (def.kind === "side") return sideScene(svg, def);
  if (def.kind === "front") return frontScene(svg, def);
  if (def.kind === "top") return topScene(svg, def);
  return CHARTS[def.type](svg, def);
}

/* ---------------- Kinder-Player: Start → 1 So nicht → Ansage → 2 So geht's → 3 So geht's → Stopp ---------------- */
export const PLAY = 4.8, GAP = 1.3, SEQ = ["F", "R", "R"];
export const LBL = { F: "✗ So nicht", R: "✓ So geht's" };
export function mountAnimation(host, card, def, opts = {}) {
  host.innerHTML = `
    <div class="stage"><svg role="img" aria-label="Animation: ${card.title}"></svg><button class="play" type="button">▶ Start</button></div>
    <div class="steps" aria-hidden="true">${SEQ.map((m, i) => `<div><i><b class="${m}"></b></i><span>${i + 1} · ${LBL[m]}</span></div>`).join("")}</div>
    <div class="caption" aria-live="polite"><span class="badge" hidden></span><p></p></div>
    <div class="ctrl"><button class="btn go" type="button">▶ Start</button><button class="btn tog" type="button" aria-pressed="false">Langsam</button></div>`;
  const svg = host.querySelector("svg"), play = host.querySelector(".play"), go = host.querySelector(".go"), slowB = host.querySelector(".tog");
  const bars = [...host.querySelectorAll(".steps b")], cells = [...host.querySelectorAll(".steps > div")];
  const badge = host.querySelector(".badge"), cap = host.querySelector(".caption p");
  const scene = createScene(svg, def);
  const st = { run: false, slow: !!opts.slow, t: 0, i: 0, gapShown: -1 };
  const setSlow = v => { st.slow = v; slowB.classList.toggle("on", v); slowB.setAttribute("aria-pressed", String(v)); };
  setSlow(st.slow);
  const say = (m, t) => { if (m) { badge.hidden = false; badge.className = "badge " + m; badge.textContent = LBL[m]; } else badge.hidden = true; cap.textContent = t; };
  // Ruhebild: „So geht's“ bei 35 %
  function still() { scene.reset("R"); const n = Math.round(PLAY * 60 * .35); for (let i = 0; i <= n; i++) scene.frame(1 / 60, "R", i / (PLAY * 60)); }
  still();
  say(null, "Tippe auf Start. Erst siehst du einmal, wie es nicht geht. Dann zweimal, wie es geht.");
  let raf = 0, prev = 0;
  function start() {
    st.run = true; st.t = 0; st.i = 0; st.gapShown = -1; play.hidden = true; go.textContent = "▶ Nochmal";
    bars.forEach(b => b.style.width = "0"); scene.reset("F"); say("F", card.anim.F);
    prev = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
    if (opts.onStart) opts.onStart();
  }
  function loop(now) {
    let dt = Math.min(.05, (now - prev) / 1000); prev = now;
    if (st.slow) dt *= .45;
    tick(dt);
    if (st.run) raf = requestAnimationFrame(loop);
  }
  function tick(dt) {
    st.t += dt;
    const mode = SEQ[st.i];
    cells.forEach((c, j) => c.classList.toggle("now", j === st.i));
    if (st.t < PLAY) { bars[st.i].style.width = (st.t / PLAY * 100).toFixed(1) + "%"; scene.frame(dt, mode, st.t / PLAY); return; }
    bars[st.i].style.width = "100%";
    const next = SEQ[st.i + 1];
    if (st.t < PLAY + GAP) { if (next && st.gapShown !== st.i) { st.gapShown = st.i; say(null, "Als Nächstes: " + LBL[next] + "."); } return; }
    st.i++; st.t = 0;
    if (st.i >= SEQ.length) {
      st.run = false; cells.forEach(c => c.classList.remove("now")); play.hidden = false; play.textContent = "↻ Nochmal";
      say("R", "Fertig! Jetzt eine Runde fahren und nur an den Merksatz denken.");
      if (opts.onDone) opts.onDone();
      return;
    }
    scene.reset(SEQ[st.i]); say(SEQ[st.i], card.anim[SEQ[st.i]]);
  }
  play.onclick = start; go.onclick = start;
  slowB.onclick = () => { setSlow(!st.slow); if (opts.onSlow) opts.onSlow(st.slow); };
  return {
    destroy() { st.run = false; cancelAnimationFrame(raf); host.innerHTML = ""; },
    // für Tests: deterministisch vorspulen
    _seek(mode, p) { scene.reset(mode); const n = Math.round(PLAY * 60 * p); for (let i = 0; i <= n; i++) scene.frame(1 / 60, mode, i / (PLAY * 60)); },
  };
}
