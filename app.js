/* Bikepark Lernkarten – App.
   Bildschirme: Einrichtung, Übersicht, Modul, Karte (Anschauen → Im Stand → Fahren → Wie war's?),
   Tagesplan, Einstellungen, Erwachsenen-Bereich. Inhalte kommen ausschließlich aus content.json. */
import * as DB from "./db.js";
import { mountAnimation } from "./anim/engine.js";
import { SCENES } from "./anim/scenes.js";

export const APP_VERSION = "1.0.0";
const S = { content: null, doc: null, cards: {}, mods: {}, anim: null, timers: [], view: {}, setupStep: 0, parentUntil: 0, updating: false };
const app = document.getElementById("app");
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const LEVEL = { green: "Grün", blue: "Blau", red: "Rot", black: "Schwarz", practice: "Übungsbereich" };

/* ---------- Hilfen ---------- */
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const $ = (sel, root = document) => root.querySelector(sel);
const go = hash => { if (location.hash === hash) render(); else location.hash = hash; };
const chips = levels => levels.map(l => `<span class="chip ${l}">${LEVEL[l]}</span>`).join(" ");
const fmtDate = iso => new Date(iso).toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" });
function toast(msg, bad = false) {
  const t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status");
  if (bad) t.style.background = "var(--bad)";
  t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 3200);
}
async function persist() {
  try { await DB.save(S.doc); return true; }
  catch (e) { toast("Speichern hat nicht geklappt: " + e.message, true); return false; }
}
function bar(title, { back = null, right = "" } = {}) {
  return `<header class="bar">${back ? `<button class="icon-btn" data-go="${back}" aria-label="Zurück">←</button>` : ""}<h1>${esc(title)}</h1>${right}</header>`;
}
function sheet(inner, label = "Dialog") {
  const ov = document.createElement("div"); ov.className = "overlay";
  ov.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(label)}">${inner}</div>`;
  document.body.appendChild(ov);
  const first = ov.querySelector("input, button"); if (first) setTimeout(() => first.focus(), 30);
  return { root: ov, close: () => ov.remove() };
}
function cleanup() {
  if (S.anim) { S.anim.destroy(); S.anim = null; }
  S.timers.forEach(clearInterval); S.timers = [];
}
function applyTheme() {
  const t = S.doc?.settings?.theme || "light", root = document.documentElement;
  if (t === "auto") delete root.dataset.theme; else root.dataset.theme = t;
  try { localStorage.setItem("bp-theme", t); } catch { /* nur Komfort */ }
  const dark = t === "dark" || (t === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  $('meta[name="theme-color"]').setAttribute("content", dark ? "#111512" : "#edf0ea");
}

/* ---------- Fortschritt ---------- */
function cardP(id) { return S.doc.cards[id] || DB.emptyCard(); }
function cardPw(id) { return (S.doc.cards[id] ||= DB.emptyCard()); }
const cardDone = id => { const c = S.doc.cards[id]; return !!(c && (c.mastered || c.skipped)); };
function day() { return (S.doc.days[DB.today()] ||= DB.emptyDay()); }
function moduleState(m) {
  const pm = S.doc.modules[m.id] || {};
  if (pm.status === "passed") return "passed";
  if (!m.prereq.every(id => S.doc.modules[id]?.status === "passed")) return "locked";
  if (m.adultUnlock && !pm.unlockedAt) return "needsAdult";
  return m.cards.every(c => cardDone(c.id)) ? "ready" : "open";
}
const accessible = m => ["open", "ready", "passed"].includes(moduleState(m));
function nextCard() {
  for (const m of S.content.modules) {
    if (moduleState(m) !== "open") continue;
    const c = m.cards.find(c => !cardDone(c.id));
    if (c) return { card: c, mod: m };
  }
  return null;
}
function addStar(type, ref) {
  const st = S.doc.stars;
  if ((type === "card" || type === "skip" || type === "day") && st.some(s => s.type === type && s.ref === ref)) return false;
  if (type === "pause" && st.filter(s => s.type === "pause" && s.ref === ref).length >= 2) return false;
  st.push({ at: DB.nowIso(), type, ref }); return true;
}
const allCards = () => S.content.modules.flatMap(m => m.cards);

/* ---------- PIN-Abfrage mit Sperre ---------- */
async function tryPin(pin) {
  const L = S.doc.lock;
  if (L.until > Date.now()) return { ok: false, msg: `Gesperrt. Noch ${Math.ceil((L.until - Date.now()) / 1000)} Sekunden warten.` };
  if (await DB.checkPin(S.doc, pin)) { L.fails = 0; L.until = 0; await persist(); return { ok: true }; }
  L.fails += 1;
  let msg = `Falsche PIN. Noch ${5 - L.fails} Versuche.`;
  if (L.fails >= 5) { L.fails = 0; L.until = Date.now() + 60000; msg = "Zu viele Fehlversuche. 60 Sekunden warten."; }
  await persist();
  return { ok: false, msg };
}
function askPin(title, text) {
  return new Promise(resolve => {
    const sh = sheet(`<h2>${esc(title)}</h2><p class="small">${esc(text)}</p>
      <div class="field"><label class="label" for="pin-in">PIN</label><input id="pin-in" type="password" inputmode="numeric" pattern="[0-9]*" autocomplete="off" maxlength="8"></div>
      <p class="error" id="pin-err" hidden></p>
      <div class="row"><button class="btn" id="pin-cancel" type="button">Abbrechen</button><button class="btn primary" id="pin-ok" type="button">OK</button></div>`, title);
    const inp = $("#pin-in", sh.root), err = $("#pin-err", sh.root);
    const showLock = () => {
      const left = S.doc.lock.until - Date.now();
      inp.disabled = left > 0; $("#pin-ok", sh.root).disabled = left > 0;
      if (left > 0) { err.hidden = false; err.textContent = `Gesperrt. Noch ${Math.ceil(left / 1000)} Sekunden warten.`; }
      else if (err.dataset.lock) { err.hidden = true; delete err.dataset.lock; }
      if (left > 0) err.dataset.lock = "1";
    };
    showLock(); const tm = setInterval(showLock, 500);
    const done = v => { clearInterval(tm); sh.close(); resolve(v); };
    $("#pin-cancel", sh.root).onclick = () => done(false);
    const ok = async () => {
      const r = await tryPin(inp.value.trim());
      if (r.ok) done(true); else { err.hidden = false; err.textContent = r.msg; inp.value = ""; showLock(); if (!inp.disabled) inp.focus(); }
    };
    $("#pin-ok", sh.root).onclick = ok;
    inp.addEventListener("keydown", e => { if (e.key === "Enter") ok(); });
  });
}
const validPin = p => /^\d{4,8}$/.test(p);

/* ---------- Router ---------- */
function route() { const h = location.hash.replace(/^#\/?/, ""); const [name, id] = h.split("/"); return { name: name || "home", id: id ? decodeURIComponent(id) : null }; }
function render() {
  cleanup();
  document.querySelectorAll(".overlay").forEach(o => o.remove());
  if (!S.doc || !S.doc.pin) { renderSetup(); return; }
  const r = route();
  if (S.view.cardId && r.name !== "c") S.view = {};
  if (r.name === "m" && S.mods[r.id]) renderModule(S.mods[r.id]);
  else if (r.name === "c" && S.cards[r.id]) renderCard(S.cards[r.id]);
  else if (r.name === "plan") renderPlan();
  else if (r.name === "settings") renderSettings();
  else if (r.name === "parent") renderParent();
  else renderHome();
  window.scrollTo(0, 0);
}
app.addEventListener("click", e => { const t = e.target.closest("[data-go]"); if (t) { e.preventDefault(); go(t.dataset.go); } });

/* ---------- Einrichtung ---------- */
function renderSetup() {
  const step = S.setupStep;
  if (step === 0) {
    app.innerHTML = `${bar("Bikepark Lernkarten")}<main>
      <div class="panel"><h2>Willkommen!</h2><p>Mit dieser App lernst du im Bikepark Schritt für Schritt besser zu fahren. Pro Runde gibt es genau einen Merksatz.</p></div>
      <div class="notice"><p>Ein Erwachsener richtet die App einmal ein und legt eine PIN fest. Mit der PIN werden Module freigegeben.</p></div>
      <button class="btn big primary" id="s-go">Einrichten</button></main>`;
    $("#s-go").onclick = () => { S.setupStep = 1; renderSetup(); };
    return;
  }
  if (step === 1) {
    app.innerHTML = `${bar("PIN festlegen", { back: null })}<main>
      <div class="panel"><p>Für Erwachsene: Wähle eine PIN mit 4 bis 8 Ziffern.</p>
        <div class="field"><label class="label" for="p1">PIN</label><input id="p1" type="password" inputmode="numeric" pattern="[0-9]*" autocomplete="new-password" maxlength="8"></div>
        <div class="field"><label class="label" for="p2">PIN wiederholen</label><input id="p2" type="password" inputmode="numeric" pattern="[0-9]*" autocomplete="new-password" maxlength="8"></div></div>
      <div class="notice warn"><p><strong>Wichtig:</strong> PIN vergessen = App neu einrichten. Der Fortschritt lässt sich nur über eine Sicherung retten (Einstellungen → Fortschritt exportieren). Es gibt kein Zurücksetzen der PIN in der App.</p>
        <div class="checks"><label><input type="checkbox" id="p-ack"> Verstanden</label></div></div>
      <p class="error" id="p-err" hidden></p>
      <button class="btn big primary" id="p-save">PIN speichern</button></main>`;
    $("#p-save").onclick = async () => {
      const a = $("#p1").value.trim(), b = $("#p2").value.trim(), err = $("#p-err");
      const fail = m => { err.hidden = false; err.textContent = m; };
      if (!validPin(a)) return fail("Die PIN braucht 4 bis 8 Ziffern.");
      if (a !== b) return fail("Die beiden PINs sind nicht gleich.");
      if (!$("#p-ack").checked) return fail("Bitte „Verstanden“ ankreuzen.");
      S.doc = S.doc || DB.emptyProgress();
      S.doc.pin = await DB.makePin(a);
      if (reduceMotion) S.doc.settings.slow = true;
      if (!(await persist())) return;
      try { if (navigator.storage?.persist) await navigator.storage.persist(); } catch { /* optional */ }
      S.setupStep = 2; renderSetup();
    };
    return;
  }
  app.innerHTML = `${bar("Fast fertig")}<main>
    <div class="panel"><h2>Gibt es schon eine Sicherung?</h2><p>Wenn die App neu eingerichtet wird (zum Beispiel nach vergessener PIN), kannst du jetzt den alten Fortschritt laden.</p></div>
    <button class="btn big primary" id="s-new">Neu starten</button>
    <button class="btn big" id="s-imp">Sicherung laden</button></main>`;
  $("#s-new").onclick = () => { S.setupStep = 0; history.replaceState(null, "", "#/"); render(); };
  $("#s-imp").onclick = () => openImport(true);
}

/* ---------- Übersicht ---------- */
function renderHome() {
  const n = nextCard(), cards = allCards();
  const mastered = cards.filter(c => cardP(c.id).mastered).length, skipped = cards.filter(c => cardP(c.id).skipped && !cardP(c.id).mastered).length;
  const ready = S.content.modules.find(m => moduleState(m) === "ready");
  const passed = S.content.modules.filter(m => moduleState(m) === "passed");
  const stars = S.doc.stars.length;
  const STATE = { passed: ["BESTANDEN", "var(--good)"], ready: ["PRÜFEN", "var(--accent)"], needsAdult: ["FREIGABE", "var(--muted)"], locked: ["GESPERRT", "var(--muted)"] };
  app.innerHTML = `${bar("Bikepark", { right: `<span class="stars" aria-label="${stars} Sterne">★ ${stars}</span><button class="icon-btn" data-go="#/settings" aria-label="Einstellungen">⚙</button>` })}
  <main>
    <section class="panel next-card">
      ${n ? `<span class="label">Nächste Karte · Modul ${n.mod.num}</span><h2>${esc(n.card.num)} ${esc(n.card.title)}</h2>
        <div class="cue"><small>Merksatz für die Fahrt</small><strong>${esc(n.card.cue)}</strong></div>
        <button class="btn big primary" data-go="#/c/${n.card.id}">Los geht's</button>`
      : ready ? `<span class="label">Modul ${ready.num} ist fertig</span><p>Zeig es einem Erwachsenen. Er schaut zu und gibt das Modul mit der PIN frei.</p><button class="btn big primary" data-go="#/m/${ready.id}">Zum Modul</button>`
      : `<span class="label">Gerade nichts offen</span><p>Alle offenen Module sind erledigt. Neue Module gibt ein Erwachsener frei.</p>`}
    </section>
    <button class="btn big dark" data-go="#/plan">Tagesplan für heute</button>
    <section class="panel">
      <span class="label">Dein Fortschritt</span>
      <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${cards.length}" aria-valuenow="${mastered}"><b style="width:${(mastered / cards.length * 100).toFixed(1)}%"></b></div>
      <p class="small">${mastered} von ${cards.length} Karten kannst du${skipped ? ` · ${skipped} ausgelassen` : ""}</p>
      ${passed.length ? `<div class="badges">${passed.map(m => `<span class="badge-item">★ ${esc(m.badge)}</span>`).join("")}</div>` : `<p class="small muted">Für jedes bestandene Modul gibt es ein Abzeichen.</p>`}
    </section>
    <section class="mods" aria-label="Module">
      ${S.content.modules.map(m => {
        const st = moduleState(m), done = m.cards.filter(c => cardDone(c.id)).length, lab = STATE[st];
        return `<button class="mod ${st === "locked" || st === "needsAdult" ? "locked" : ""}" data-go="#/m/${m.id}">
          <span class="num">${m.num}</span>
          <span><span class="h3">${esc(m.title)}</span><span class="meta">${chips(m.levels)} <span>${done}/${m.cards.length}</span></span></span>
          <span class="state" style="font-size:12px;font-weight:800;letter-spacing:.06em;color:${lab ? lab[1] : "var(--fg)"}">${lab ? lab[0] : "▶"}</span>
        </button>`; }).join("")}
    </section>
    <button class="btn" data-go="#/parent">Erwachsenen-Bereich</button>
  </main>`;
}

/* ---------- Modul ---------- */
function renderModule(m) {
  const st = moduleState(m), pm = S.doc.modules[m.id] || {};
  const missing = m.prereq.filter(id => S.doc.modules[id]?.status !== "passed").map(id => S.mods[id]).filter(Boolean);
  let notice = "";
  if (st === "locked") notice = `<div class="notice warn"><p><strong>Noch gesperrt.</strong> Erst ${missing.map(x => `Modul ${x.num} (${esc(x.title)})`).join(" und ")} bestehen.</p></div>`;
  if (st === "needsAdult") notice = `<div class="notice"><p><strong>Rote und schwarze Lines</strong> gibt nur ein Erwachsener frei, der dich fahren gesehen hat.</p><button class="btn primary" id="unlock" style="margin-top:10px">Mit PIN freischalten</button></div>`;
  if (st === "ready") notice = `<div class="notice good"><p><strong>Alle Karten erledigt!</strong> Zeig einem Erwachsenen, was du kannst. Er gibt das Modul mit der PIN frei.</p><button class="btn good" id="pass" style="margin-top:10px">Prüfung mit PIN</button></div>`;
  if (st === "passed") notice = `<div class="notice good"><p><strong>Bestanden</strong> am ${fmtDate(pm.passedAt)}. Abzeichen: ★ ${esc(m.badge)}</p></div>`;
  const open = accessible(m);
  app.innerHTML = `${bar(`Modul ${m.num}`, { back: "#/" })}<main>
    <div class="panel"><div>${chips(m.levels)}</div><h2>${esc(m.title)}</h2><p class="small muted">Wo: ${esc(m.where)}</p></div>
    ${notice}
    <section class="cards" aria-label="Karten">
      ${m.cards.map(c => { const p = cardP(c.id), dot = p.mastered ? "g" : p.skipped ? "s" : p.rating || "";
        const sub = p.mastered ? "Kann ich ★" : p.skipped ? "Ausgelassen" : p.runs ? `${p.runs} ${p.runs === 1 ? "Runde" : "Runden"}` : esc(c.cue);
        return `<button class="card-row" ${open ? `data-go="#/c/${c.id}"` : "disabled"}><span class="n">${esc(c.num)}</span><span class="t">${esc(c.title)}<span>${sub}</span></span><i class="dot ${dot}" aria-hidden="true"></i></button>`; }).join("")}
    </section>
    <p class="small muted">Punkte: grün = kann ich · gelb = fast · rot = noch üben · grau = ausgelassen</p>
  </main>`;
  $("#unlock")?.addEventListener("click", async () => {
    if (!(await askPin("Modul freischalten", `Modul ${m.num} (${m.title}) für Kinder freigeben?`))) return;
    S.doc.modules[m.id] = { ...(S.doc.modules[m.id] || {}), unlockedAt: DB.nowIso(), unlockedBy: "pin" };
    await persist(); toast("Modul freigeschaltet"); render();
  });
  $("#pass")?.addEventListener("click", async () => {
    if (!(await askPin("Modul bestanden?", `Hast du gesehen, dass die Karten von Modul ${m.num} sitzen?`))) return;
    passModule(m);
  });
}
async function passModule(m) {
  S.doc.modules[m.id] = { ...(S.doc.modules[m.id] || {}), status: "passed", passedAt: DB.nowIso(), passedBy: "pin" };
  await persist(); toast(`Bestanden! Abzeichen: ${m.badge}`); render();
}

/* ---------- Karte ---------- */
function renderCard({ card: c, mod: m }) {
  if (!accessible(m)) { go(`#/m/${m.id}`); return; }
  if (S.view.cardId !== c.id) S.view = { cardId: c.id, step: 0, result: null };
  const steps = ["look", c.dry ? "dry" : null, "ride", "rate"].filter(Boolean);
  const NAMES = { look: "Anschauen", dry: "Im Stand", ride: "Fahren", rate: "Wie war's?" };
  const step = steps[Math.min(S.view.step, steps.length - 1)], si = steps.indexOf(step);
  const p = cardP(c.id), d = day();
  const cue = `<div class="cue"><small>Merksatz für die Fahrt</small><strong>${esc(c.cue)}</strong></div>`;
  const right = !p.mastered && !p.skipped ? `<button class="btn" id="skip" style="min-height:44px">Auslassen</button>` : "";
  let body = "";
  if (step === "look") body = `${cue}<div class="anim" id="anim"></div><p>${esc(c.goal)}</p>
    <button class="btn big primary" id="next">${c.dry ? "Weiter: Im Stand üben" : "Weiter: Fahren"}</button>`;
  if (step === "dry") body = `${cue}<div class="panel"><span class="label">Im Stand üben</span><p>${esc(c.dry)}</p></div>
    <button class="btn big primary" id="next">Gemacht, jetzt fahren</button>`;
  if (step === "ride") {
    if (d.sinceMix >= 3) body = `<div class="panel"><span class="label">Mix-Runde</span><h2>Diesmal kein neuer Merksatz</h2><p>Fahr locker und denk an alles, was du schon kannst. Danach geht es mit „${esc(c.cue)}“ weiter.</p></div>
      <button class="btn big primary" id="mix">Mix-Runde gefahren</button>`;
    else body = `${cue}
      <div class="panel"><span class="label">Deine Aufgabe auf dieser Runde</span><p>${esc(c.task)}</p><p class="small muted">Wo: ${esc(m.where)}</p></div>
      <div class="panel"><span class="label">Das passiert oft</span><p>${esc(c.oft)}</p></div>
      <div class="panel"><div class="mixbar" aria-hidden="true">${[0, 1, 2, 3].map(i => `<i class="${i <= d.sinceMix ? "on" : ""}"></i>`).join("")}</div>
        <p class="small muted">Runde ${d.sinceMix + 1} von 4. Danach kommt eine Mix-Runde.</p></div>
      <button class="btn big primary" id="ran">Runde gefahren</button>
      <button class="btn" id="tired">Müde oder genervt? Pause machen</button>`;
  }
  if (step === "rate") {
    const r = S.view.result;
    if (!r) body = `<div class="panel"><span class="label">Geschafft, wenn</span><p>${esc(c.done)}</p></div>
      <p><strong>Wie war's?</strong></p>
      <div class="rate"><button class="r" data-r="r"><i></i>Noch üben</button><button class="y" data-r="y"><i></i>Fast</button><button class="g" data-r="g"><i></i>Kann ich</button></div>
      <p class="small muted">„Kann ich“ 2-mal hintereinander = Stern.${p.streak === 1 && !p.mastered ? " Einmal hast du es schon geschafft!" : ""}</p>`;
    else if (r === "star") body = `<div class="panel celebrate"><div class="big-star" aria-hidden="true">★</div><h2>Stern!</h2><p>Du kannst jetzt: ${esc(c.title)}</p></div>
      <button class="btn big primary" id="to-next">Nächste Karte</button><button class="btn" data-go="#/">Zur Übersicht</button>`;
    else body = `<div class="panel"><p>${r === "g" ? (p.mastered ? "Gut geübt!" : "Super! Noch einmal „Kann ich“, dann gibt es den Stern.") : "Okay. Gleicher Merksatz, nächste Runde."}</p></div>
      <button class="btn big primary" id="again">Noch eine Runde</button><button class="btn" data-go="#/m/${m.id}">Später weiter</button>`;
  }
  app.innerHTML = `${bar(`${c.num} ${c.title}`, { back: `#/m/${m.id}`, right })}<main>
    <nav class="stepnav" aria-label="Schritte">${steps.map((s, i) => `<div class="${i === si ? "now" : i < si ? "done" : ""}">${i + 1} ${NAMES[s]}</div>`).join("")}</nav>
    ${body}</main>`;
  const next = () => { S.view.step = si + 1; S.view.result = null; render(); };
  if (step === "look") S.anim = mountAnimation($("#anim"), c, SCENES[c.anim.scene], { slow: S.doc.settings.slow || reduceMotion });
  $("#next")?.addEventListener("click", next);
  $("#mix")?.addEventListener("click", async () => { d.runs += 1; d.sinceMix = 0; await persist(); toast("Mix-Runde gezählt"); render(); });
  $("#tired")?.addEventListener("click", () => pauseSheet(15));
  $("#ran")?.addEventListener("click", async () => { const pw = cardPw(c.id); pw.runs += 1; d.runs += 1; d.sinceMix += 1; await persist(); next(); });
  app.querySelectorAll(".rate button").forEach(b => b.addEventListener("click", async () => {
    const pw = cardPw(c.id), r = b.dataset.r;
    pw.rating = r; pw.streak = r === "g" ? pw.streak + 1 : 0;
    pw.history.push({ at: DB.nowIso(), rating: r }); if (pw.history.length > 30) pw.history.shift();
    let res = r;
    if (r === "g" && pw.streak >= 2 && !pw.mastered) { pw.mastered = true; pw.masteredAt = DB.nowIso(); addStar("card", c.id); res = "star"; }
    await persist(); S.view.result = res; render();
  }));
  $("#again")?.addEventListener("click", () => { S.view.step = steps.indexOf("ride"); S.view.result = null; render(); });
  $("#to-next")?.addEventListener("click", () => { const n = nextCard(); go(n ? `#/c/${n.card.id}` : "#/"); });
  $("#skip")?.addEventListener("click", () => {
    const sh = sheet(`<h2>Karte auslassen?</h2><p>Auslassen ist okay. Vielleicht passt die Stelle heute nicht. Du bekommst trotzdem einen Stern fürs gute Entscheiden.</p>
      <div class="row"><button class="btn" id="sk-no" type="button">Doch üben</button><button class="btn primary" id="sk-yes" type="button">Auslassen</button></div>`, "Karte auslassen");
    $("#sk-no", sh.root).onclick = sh.close;
    $("#sk-yes", sh.root).onclick = async () => { const pw = cardPw(c.id); pw.skipped = true; pw.skippedAt = DB.nowIso(); addStar("skip", c.id); await persist(); sh.close(); toast("Ausgelassen. ★ für die gute Entscheidung"); go(`#/m/${m.id}`); };
  });
}

/* ---------- Tagesplan ---------- */
function renderPlan() {
  const d = day(), plan = S.content.dayPlan;
  const idx = plan.findIndex(s => !d.plan[s.id]), cur = idx === -1 ? plan.length : idx;
  const n = nextCard();
  const todayStars = S.doc.stars.filter(s => DB.today(new Date(s.at)) === DB.today()).length;
  const stepBody = (s, i) => {
    if (i !== cur) return "";
    if (s.type === "checklist") {
      const items = S.content[s.list] || [], ch = d.checks[s.id] || {};
      return `<p class="small">${esc(s.text)}</p><div class="checks">${items.map((t, k) => `<label><input type="checkbox" data-ck="${s.id}" data-k="${k}" ${ch[k] ? "checked" : ""}> ${esc(t)}</label>`).join("")}</div>
        <button class="btn primary" data-done="${s.id}" ${items.every((_, k) => ch[k]) ? "" : "disabled"}>Fertig</button>`;
    }
    if (s.type === "card") return `<p class="small">${esc(s.text)}</p>${n ? `<p><strong>${esc(n.card.num)} ${esc(n.card.title)}</strong> · „${esc(n.card.cue)}“</p><button class="btn primary" data-go="#/c/${n.card.id}">Karte öffnen</button>` : `<p class="small muted">Gerade keine offene Karte. Fahr die letzte Karte nochmal.</p>`}<button class="btn" data-done="${s.id}">Erledigt</button>`;
    if (s.type === "pause") {
      const left = d.pauseStartedAt ? Math.max(0, d.pauseStartedAt + s.minutes * 60000 - Date.now()) : s.minutes * 60000;
      return `<p class="small">${esc(s.text)}</p><div class="timer" id="timer" aria-live="off">${fmtTime(left)}</div>
        ${d.pauseStartedAt ? "" : `<button class="btn primary" id="pause-start">Pause starten</button>`}<button class="btn" data-done="${s.id}">Pause vorbei</button>`;
    }
    if (s.type === "end") return `<p class="small">${esc(s.text)}</p><p class="stars">★ ${todayStars} heute</p><button class="btn primary" data-done="${s.id}">Tag abschließen</button>`;
    return `<p class="small">${esc(s.text)}</p><button class="btn primary" data-done="${s.id}">Erledigt</button>`;
  };
  app.innerHTML = `${bar("Tagesplan", { back: "#/" })}<main>
    <div class="panel"><span class="label">Sofort Pause, wenn …</span><ul class="stop-list">${S.content.stopSignals.map(t => `<li>${esc(t)}</li>`).join("")}</ul>
      <button class="btn" id="stop-now">Ich mache jetzt Pause</button></div>
    ${cur >= plan.length ? `<div class="panel celebrate"><div class="big-star">★</div><h2>Tag geschafft!</h2><p>Bis zum nächsten Mal.</p></div>` : ""}
    <section class="plan">${plan.map((s, i) => `<div class="plan-step ${i === cur ? "now" : i < cur || d.plan[s.id] ? "done" : ""}">
        <span class="no">${d.plan[s.id] ? "✓" : i + 1}</span><div style="display:grid;gap:8px;min-width:0"><h3>${esc(s.title)}</h3>${stepBody(s, i)}</div></div>`).join("")}</section>
  </main>`;
  app.querySelectorAll("[data-ck]").forEach(cb => cb.addEventListener("change", async () => {
    const id = cb.dataset.ck; (d.checks[id] ||= {})[cb.dataset.k] = cb.checked; await persist();
    const items = S.content[plan.find(s => s.id === id).list] || [];
    const btn = app.querySelector(`[data-done="${id}"]`); if (btn) btn.disabled = !items.every((_, k) => d.checks[id][k]);
  }));
  app.querySelectorAll("[data-done]").forEach(b => b.addEventListener("click", async () => {
    const id = b.dataset.done; d.plan[id] = true;
    if (id === "end" && !d.dayStar) { d.dayStar = true; addStar("day", DB.today()); toast("★ für einen ganzen Tag"); }
    await persist(); render();
  }));
  const startPause = async () => { if (!d.pauseStartedAt) d.pauseStartedAt = Date.now(); if (addStar("pause", DB.today())) toast("★ fürs Pausemachen"); await persist(); render(); };
  $("#pause-start")?.addEventListener("click", startPause);
  $("#stop-now").addEventListener("click", () => pauseSheet(plan.find(s => s.type === "pause")?.minutes || 15));
  const timer = $("#timer");
  if (timer && d.pauseStartedAt) {
    const ps = plan.find(s => s.type === "pause");
    S.timers.push(setInterval(() => { const left = Math.max(0, d.pauseStartedAt + ps.minutes * 60000 - Date.now()); timer.textContent = left === 0 ? "Pause vorbei" : fmtTime(left); }, 1000));
  }
}
function pauseSheet(minutes) {
  const end = Date.now() + minutes * 60000;
  if (addStar("pause", DB.today())) toast("★ fürs Pausemachen");
  persist();
  const sh = sheet(`<h2>Pause</h2><p>Essen, trinken, hinsetzen. Weiter geht es erst, wenn du dich wieder gut fühlst.</p>
    <div class="timer" id="pz">${fmtTime(minutes * 60000)}</div><button class="btn primary" id="pz-ok" type="button">Weiter</button>`, "Pause");
  const t = setInterval(() => { const left = Math.max(0, end - Date.now()), el = $("#pz", sh.root); if (el) el.textContent = left === 0 ? "Pause vorbei" : fmtTime(left); }, 1000);
  S.timers.push(t);
  $("#pz-ok", sh.root).onclick = () => { clearInterval(t); sh.close(); };
}
const fmtTime = ms => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

/* ---------- Einstellungen ---------- */
function renderSettings() {
  const st = S.doc.settings;
  app.innerHTML = `${bar("Einstellungen", { back: "#/" })}<main>
    <section class="panel"><span class="label">Darstellung</span>
      <div class="field"><label class="label" for="theme">Farben</label>
        <select id="theme"><option value="light">Hell (gut in der Sonne)</option><option value="dark">Dunkel</option><option value="auto">Wie das Handy</option></select></div>
      <div class="checks"><label><input type="checkbox" id="slow" ${st.slow ? "checked" : ""}> Animationen immer langsam</label></div></section>
    <section class="panel"><span class="label">Regeln</span><ol class="rules">${S.content.rules.map(r => `<li>${esc(r)}</li>`).join("")}</ol></section>
    <section class="panel"><span class="label">Datensicherung</span>
      <p class="small">Die Sicherung ist eine Datei mit dem ganzen Fortschritt. Sie braucht keine PIN.</p>
      <button class="btn primary" id="exp">Fortschritt exportieren</button>
      <button class="btn" id="imp">Sicherung laden</button>
      <p class="small muted">Laden braucht die PIN, außer direkt nach der Einrichtung.</p></section>
    <section class="panel"><span class="label">PIN</span><button class="btn" id="pinchg">PIN ändern</button>
      <details><summary>PIN vergessen?</summary><ol class="rules small">
        <li>Hier „Fortschritt exportieren“ tippen. Die Datei landet in „Downloads“.</li>
        <li>In Chrome: Einstellungen → Website-Einstellungen → Alle Websites → diese Seite → „Daten löschen“.</li>
        <li>App neu öffnen und neu einrichten (neue PIN).</li>
        <li>Im letzten Schritt „Sicherung laden“ tippen und die Datei wählen.</li></ol></details></section>
    <section class="panel small muted"><span class="label">Info</span>
      <p>App ${APP_VERSION} · Inhalt ${esc(S.content.contentVersion)}</p><p id="persist">Speicher: wird geprüft …</p></section>
  </main>`;
  $("#theme").value = st.theme;
  $("#theme").onchange = async e => { st.theme = e.target.value; applyTheme(); await persist(); };
  $("#slow").onchange = async e => { st.slow = e.target.checked; await persist(); };
  $("#exp").onclick = exportProgress;
  $("#imp").onclick = () => openImport(false);
  $("#pinchg").onclick = changePin;
  (async () => { try { const p = await navigator.storage?.persisted?.(); $("#persist").textContent = p ? "Speicher: dauerhaft (wird nicht automatisch gelöscht)" : "Speicher: normal. Regelmäßig exportieren!"; } catch { $("#persist").textContent = "Speicher: unbekannt"; } })();
}
function exportProgress() {
  const blob = new Blob([JSON.stringify(DB.exportFile(S.doc), null, 2)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `bikepark-fortschritt-${DB.today()}.json`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast("Sicherung gespeichert");
}
async function openImport(fromSetup) {
  if (!(fromSetup || DB.isFresh(S.doc))) { if (!(await askPin("Sicherung laden", "Das ersetzt den jetzigen Fortschritt. Bitte PIN eingeben."))) return; }
  const sh = sheet(`<h2>Sicherung laden</h2><p class="small">Wähle die Datei „bikepark-fortschritt-….json“. Kaputte Dateien werden abgelehnt, dein Stand bleibt dann unverändert.</p>
    <label class="btn primary" style="position:relative">Datei auswählen<input type="file" id="imp-file" accept="application/json,.json" style="position:absolute;inset:0;opacity:0"></label>
    <p class="error" id="imp-err" hidden></p><button class="btn" id="imp-cancel" type="button">Abbrechen</button>`, "Sicherung laden");
  $("#imp-cancel", sh.root).onclick = sh.close;
  $("#imp-file", sh.root).onchange = async e => {
    const f = e.target.files?.[0], err = $("#imp-err", sh.root); if (!f) return;
    try {
      if (f.size > 2_000_000) throw new Error("Die Datei ist zu groß.");
      const data = DB.parseImport(await f.text(), S.doc);
      DB.reconcile(data, S.content);
      const cards = Object.values(data.cards).filter(c => c.mastered).length;
      sh.root.querySelector(".sheet").innerHTML = `<h2>Sicherung prüfen</h2><p>In der Datei: ${cards} Karten „kann ich“, ${data.stars.length} Sterne, ${Object.values(data.modules).filter(m => m.status === "passed").length} bestandene Module.</p><p class="small">Der jetzige Fortschritt wird ersetzt.</p>
        <div class="row"><button class="btn" id="imp-no" type="button">Abbrechen</button><button class="btn primary" id="imp-yes" type="button">Laden</button></div>`;
      $("#imp-no", sh.root).onclick = sh.close;
      $("#imp-yes", sh.root).onclick = async () => { const old = S.doc; S.doc = data; if (!(await persist())) { S.doc = old; return; } sh.close(); S.setupStep = 0; applyTheme(); toast("Sicherung geladen"); history.replaceState(null, "", "#/"); render(); };
    } catch (ex) { err.hidden = false; err.textContent = ex.message; e.target.value = ""; }
  };
}
function changePin() {
  const sh = sheet(`<h2>PIN ändern</h2>
    <div class="field"><label class="label" for="pc0">Alte PIN</label><input id="pc0" type="password" inputmode="numeric" maxlength="8" autocomplete="off"></div>
    <div class="field"><label class="label" for="pc1">Neue PIN</label><input id="pc1" type="password" inputmode="numeric" maxlength="8" autocomplete="new-password"></div>
    <div class="field"><label class="label" for="pc2">Neue PIN wiederholen</label><input id="pc2" type="password" inputmode="numeric" maxlength="8" autocomplete="new-password"></div>
    <p class="error" id="pc-err" hidden></p>
    <div class="row"><button class="btn" id="pc-no" type="button">Abbrechen</button><button class="btn primary" id="pc-ok" type="button">Ändern</button></div>`, "PIN ändern");
  const err = $("#pc-err", sh.root), fail = m => { err.hidden = false; err.textContent = m; };
  $("#pc-no", sh.root).onclick = sh.close;
  $("#pc-ok", sh.root).onclick = async () => {
    const a = $("#pc1", sh.root).value.trim(), b = $("#pc2", sh.root).value.trim();
    if (!validPin(a)) return fail("Die neue PIN braucht 4 bis 8 Ziffern.");
    if (a !== b) return fail("Die neuen PINs sind nicht gleich.");
    const r = await tryPin($("#pc0", sh.root).value.trim());
    if (!r.ok) return fail(r.msg);
    S.doc.pin = await DB.makePin(a); await persist(); sh.close(); toast("PIN geändert");
  };
}

/* ---------- Erwachsenen-Bereich ---------- */
async function renderParent() {
  if (Date.now() > S.parentUntil) {
    app.innerHTML = `${bar("Erwachsene", { back: "#/" })}<main><div class="panel"><p>Dieser Bereich ist für Erwachsene. Hier werden Module geprüft und freigeschaltet.</p></div><button class="btn big primary" id="enter">PIN eingeben</button></main>`;
    $("#enter").onclick = async () => { if (await askPin("Erwachsenen-Bereich", "Bitte PIN eingeben.")) { S.parentUntil = Date.now() + 10 * 60000; render(); } };
    return;
  }
  const RLAB = { r: "noch üben", y: "fast", g: "kann ich" };
  app.innerHTML = `${bar("Erwachsene", { back: "#/" })}<main>
    <div class="notice"><p>Prüfen heißt: zuschauen, ob die Karten auf der Strecke sitzen. Rot und Schwarz nur freischalten, wenn du dabei bist.</p></div>
    ${S.content.modules.map(m => {
      const st = moduleState(m);
      const rows = m.cards.map(c => { const p = cardP(c.id); return `<li>${esc(c.num)} ${esc(c.title)}: ${p.mastered ? "kann ich ★" : p.skipped ? "<strong>ausgelassen</strong>" : p.rating ? RLAB[p.rating] : "noch nicht geübt"}${p.runs ? ` · ${p.runs} Runden` : ""}</li>`; }).join("");
      const action = st === "ready" ? `<button class="btn good" data-pass="${m.id}">Modul bestanden</button>`
        : st === "needsAdult" ? `<button class="btn primary" data-unlock="${m.id}">Modul freischalten</button>`
        : st === "open" ? `<button class="btn" data-pass="${m.id}">Trotzdem bestanden geben</button>` : "";
      return `<details class="panel"${st === "ready" || st === "needsAdult" ? " open" : ""}><summary>Modul ${m.num} · ${esc(m.title)} — ${{ passed: "bestanden", ready: "bereit zur Prüfung", needsAdult: "wartet auf Freischaltung", locked: "gesperrt", open: "in Arbeit" }[st]}</summary>
        <ul class="small" style="margin:0;padding-left:20px">${rows}</ul>${action}</details>`; }).join("")}
    <button class="btn" id="pinchg">PIN ändern</button>
    <button class="btn" id="leave">Bereich verlassen</button>
  </main>`;
  app.querySelectorAll("[data-pass]").forEach(b => b.onclick = () => passModule(S.mods[b.dataset.pass]));
  app.querySelectorAll("[data-unlock]").forEach(b => b.onclick = async () => { const id = b.dataset.unlock; S.doc.modules[id] = { ...(S.doc.modules[id] || {}), unlockedAt: DB.nowIso(), unlockedBy: "pin" }; await persist(); toast("Freigeschaltet"); render(); });
  $("#pinchg").onclick = changePin;
  $("#leave").onclick = () => { S.parentUntil = 0; go("#/"); };
}

/* ---------- Service Worker / Update ---------- */
function initSW() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("./sw.js").then(reg => {
    if (reg.waiting && navigator.serviceWorker.controller) showUpdate(reg.waiting);
    reg.addEventListener("updatefound", () => {
      const w = reg.installing;
      w?.addEventListener("statechange", () => { if (w.state === "installed" && navigator.serviceWorker.controller) showUpdate(w); });
    });
    const check = () => { if (navigator.onLine) reg.update().catch(() => {}); };
    setInterval(check, 60 * 60 * 1000);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") check(); });
  }).catch(() => { /* ohne Service Worker läuft die App online weiter */ });
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (S.updating) location.reload(); });
}
function showUpdate(worker) {
  if ($(".update-banner")) return;
  const b = document.createElement("div"); b.className = "update-banner"; b.setAttribute("role", "status");
  b.innerHTML = `<span>Update verfügbar</span><button class="btn primary" type="button">Jetzt aktualisieren</button>`;
  b.querySelector("button").onclick = () => { S.updating = true; worker.postMessage({ type: "SKIP_WAITING" }); b.querySelector("button").disabled = true; };
  document.body.appendChild(b);
}

/* ---------- Start ---------- */
async function boot() {
  initSW();
  try {
    const res = await fetch("./content.json");
    if (!res.ok) throw new Error("Inhalt nicht geladen (" + res.status + ")");
    S.content = await res.json();
  } catch (e) {
    app.innerHTML = `<main><div class="notice warn"><p>Die Inhalte konnten nicht geladen werden. Beim ersten Start braucht die App einmal Internet.</p><p class="small muted">${esc(e.message)}</p></div><button class="btn" onclick="location.reload()">Nochmal versuchen</button></main>`;
    return;
  }
  for (const m of S.content.modules) { S.mods[m.id] = m; for (const c of m.cards) { S.cards[c.id] = { card: c, mod: m }; if (!SCENES[c.anim.scene]) console.warn("Szene fehlt:", c.anim.scene); } }
  try {
    const raw = await DB.load();
    if (raw) {
      const needs = raw.schemaVersion !== DB.SCHEMA;
      S.doc = DB.migrate(raw);
      if (DB.reconcile(S.doc, S.content) || needs) await persist();
    }
  } catch (e) {
    app.innerHTML = `<main><div class="notice warn"><p>Der Speicher ist nicht verfügbar. Im privaten Modus kann die App nichts speichern.</p><p class="small muted">${esc(e.message)}</p></div></main>`;
    return;
  }
  applyTheme();
  window.addEventListener("hashchange", render);
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", applyTheme);
  render();
}
boot();
