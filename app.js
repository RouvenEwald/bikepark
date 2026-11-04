/* Bikepark Lernkarten – App.
   Bildschirme: Einrichtung, Übersicht, Modul, Karte (Anschauen → Im Stand → Fahren → Wie war's?),
   Rucksack (Belohnungen + Abzeichen), Tagesplan, Einstellungen, Erwachsenen-Bereich.
   Inhalte kommen ausschließlich aus content.json. */
import * as DB from "./db.js";
import { mountAnimation } from "./engine.js";
import { SCENES } from "./scenes.js";

export const APP_VERSION = "1.1.0";
const S = { content: null, doc: null, cards: {}, mods: {}, anim: null, timers: [], view: {}, setupStep: 0, adultUntil: 0, updating: false };
const app = document.getElementById("app");
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const LEVEL = { green: "Grün", blue: "Blau", red: "Rot", black: "Schwarz", practice: "Übungsbereich" };

/* ---------- Hilfen ---------- */
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const $ = (sel, root = document) => root.querySelector(sel);
const go = hash => { if (location.hash === hash) render(); else location.hash = hash; };
const chips = levels => levels.map(l => `<span class="chip ${l}">${LEVEL[l]}</span>`).join(" ");
const fmtDate = iso => new Date(iso).toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" });
const fmtDay = key => { const [y, m, d] = key.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" }); };
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

/* ---------- Bilder für den Rucksack ---------- */
const ICON = {
  pommes: `<path d="M15 18 L13 6 M19 17 L18 4 M24 17 L24 3 M29 17 L30 4 M33 18 L35 6" stroke="#f2c230" stroke-width="4" stroke-linecap="round"/><path d="M10 17 H38 L34 44 H14 Z" fill="#d6322b"/><path d="M17 26 Q24 31 31 26" stroke="#fff" stroke-width="2.5" fill="none" stroke-linecap="round"/>`,
  limo: `<path d="M27 4 L22 14" stroke="#2f6fd0" stroke-width="3" stroke-linecap="round"/><path d="M12 13 H36 L33 44 H15 Z" fill="#cfe9f7" stroke="#6a8aa0" stroke-width="2"/><path d="M14 22 H34 L32 42 H16 Z" fill="#f4c542"/><circle cx="21" cy="30" r="1.8" fill="#fff"/><circle cx="27" cy="35" r="1.5" fill="#fff"/><circle cx="25" cy="26" r="1.2" fill="#fff"/>`,
  kuchen: `<path d="M6 30 L40 18 L42 38 L8 42 Z" fill="#f5deb3" stroke="#a0763a" stroke-width="2"/><path d="M6 30 L40 18 L40 24 L7 35 Z" fill="#e85d8a"/><path d="M7 36 L41 30" stroke="#a0763a" stroke-width="2"/><circle cx="33" cy="15" r="4" fill="#c4122f"/><path d="M33 11 Q35 6 38 5" stroke="#3a7a2a" stroke-width="2" fill="none"/>`,
  gel: `<path d="M14 4 H34 L36 9 L34 14 H35 V42 Q35 45 32 45 H16 Q13 45 13 42 V14 H14 L12 9 Z" fill="#2fa36b" stroke="#1d6b45" stroke-width="2"/><path d="M26 18 L19 30 H25 L22 40 L30 27 H24 L27 18 Z" fill="#fff"/>`,
};
const icon = (id, size = 48) => `<svg class="ricon" width="${size}" height="${size}" viewBox="0 0 48 48" aria-hidden="true">${ICON[id] || `<circle cx="24" cy="24" r="16" fill="var(--muted)"/>`}</svg>`;
const BAG = `<svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 7 V5 a4 4 0 0 1 8 0 V7" fill="none" stroke="currentColor" stroke-width="2"/><rect x="4" y="7" width="16" height="15" rx="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 14 H16 V18 H8 Z" fill="currentColor"/></svg>`;

/* ---------- Fortschritt ---------- */
function cardP(id) { return S.doc.cards[id] || DB.emptyCard(); }
function cardPw(id) { return (S.doc.cards[id] ||= DB.emptyCard()); }
const cardDone = id => { const c = S.doc.cards[id]; return !!(c && (c.mastered || c.deferred)); };
function day() { return (S.doc.days[DB.today()] ||= DB.emptyDay()); }
function moduleState(m) {
  if (S.doc.modules[m.id]?.status === "passed") return "passed";
  if (!m.prereq.every(id => S.doc.modules[id]?.status === "passed")) return "locked";
  return m.cards.every(c => cardDone(c.id)) ? "ready" : "open";
}
const accessible = m => moduleState(m) !== "locked";
function activeModule() { return S.content.modules.find(m => ["open", "ready"].includes(moduleState(m))) || null; }
function nextCard() {
  const m = activeModule(); if (!m) return null;
  const c = m.cards.find(c => !cardDone(c.id));
  return c ? { card: c, mod: m } : null;
}
const allCards = () => S.content.modules.flatMap(m => m.cards);
const rewardDef = id => S.content.rewards.find(r => r.id === id) || { id, name: "Überraschung", gift: "eine Überraschung" };
const openItems = () => S.doc.rewards.items.filter(i => !i.redeemedAt);
function pickReward() {
  const items = S.doc.rewards.items, last = items.slice(-2).map(i => i.item);
  let pool = S.content.rewards;
  if (last.length === 2 && last[0] === last[1]) pool = pool.filter(r => r.id !== last[0]); // nie 3-mal dasselbe
  const total = pool.reduce((s, r) => s + r.weight, 0);
  let x = DB.rand(total);
  for (const r of pool) { if (x < r.weight) return r; x -= r.weight; }
  return pool[0];
}
// Jede gefahrene Runde (auch Mix-Runde): Tageszähler, Parktag, Rucksack
async function countRun() {
  const d = day(); d.runs += 1;
  const t = DB.today(); let badge = null;
  if (!S.doc.parkDays.includes(t)) { S.doc.parkDays.push(t); const n = S.doc.parkDays.length; if (S.content.dayBadges.includes(n)) badge = n; }
  const R = S.doc.rewards; R.runs += 1; let item = null;
  if (R.runs >= R.nextAt) {
    const r = pickReward();
    item = { id: Date.now().toString(36) + DB.rand(1e6).toString(36), item: r.id, at: DB.nowIso(), redeemedAt: null };
    R.items.push(item); R.runs = 0; R.nextAt = 1 + DB.rand(3);
  }
  await persist();
  return { item, badge };
}
function showGain({ item, badge }) {
  if (!item && !badge) return;
  const parts = [];
  if (item) { const r = rewardDef(item.item); parts.push(`<div class="reveal">${icon(r.id, 96)}<h2>Du hast ${esc(r.gift)} bekommen!</h2><p class="small">Es liegt jetzt in deinem Rucksack. Abholen kannst du es bei einem Erwachsenen.</p></div>`); }
  if (badge) parts.push(`<div class="reveal"><span class="badge-tile big"><b>${badge}</b><span>${badge === 1 ? "Parktag" : "Parktage"}</span></span><h2>Neues Abzeichen!</h2><p class="small">${badge === 1 ? "Dein erster Parktag." : `Du warst schon an ${badge} Tagen im Park.`}</p></div>`);
  const sh = sheet(`${parts.join("")}<button class="btn big primary" id="gain-ok" type="button">Weiter</button>`, "Belohnung");
  $("#gain-ok", sh.root).onclick = sh.close;
}

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
      if (left > 0) { err.hidden = false; err.textContent = `Gesperrt. Noch ${Math.ceil(left / 1000)} Sekunden warten.`; err.dataset.lock = "1"; }
      else if (err.dataset.lock) { err.hidden = true; delete err.dataset.lock; }
    };
    showLock(); const tm = setInterval(showLock, 500);
    const done = v => { clearInterval(tm); sh.close(); resolve(v); };
    $("#pin-cancel", sh.root).onclick = () => done(false);
    const ok = async () => {
      const r = await tryPin(inp.value.trim());
      if (r.ok) { S.adultUntil = Math.max(S.adultUntil, Date.now() + 2 * 60000); done(true); }
      else { err.hidden = false; err.textContent = r.msg; inp.value = ""; showLock(); if (!inp.disabled) inp.focus(); }
    };
    $("#pin-ok", sh.root).onclick = ok;
    inp.addEventListener("keydown", e => { if (e.key === "Enter") ok(); });
  });
}
// Nach einer richtigen PIN gilt der Erwachsene 2 Minuten als anwesend (mehrere Sachen abholen ohne neue PIN)
const adult = (title, text) => Date.now() < S.adultUntil ? Promise.resolve(true) : askPin(title, text);
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
  else if (r.name === "rucksack") renderBag();
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
      <div class="notice"><p>Ein Erwachsener richtet die App einmal ein und legt eine PIN fest. Mit der PIN werden Module abgeschlossen und Sachen aus dem Rucksack eingelöst.</p></div>
      <button class="btn big primary" id="s-go">Einrichten</button></main>`;
    $("#s-go").onclick = () => { S.setupStep = 1; renderSetup(); };
    return;
  }
  if (step === 1) {
    app.innerHTML = `${bar("PIN festlegen")}<main>
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
  const n = nextCard(), cards = allCards(), act = activeModule();
  const mastered = cards.filter(c => cardP(c.id).mastered).length;
  const deferred = cards.filter(c => cardP(c.id).deferred && !cardP(c.id).mastered).length;
  const open = openItems().length, badges = S.content.modules.filter(m => moduleState(m) === "passed").length + S.content.dayBadges.filter(b => S.doc.parkDays.length >= b).length;
  const STATE = { passed: ["BESTANDEN", "var(--good)"], ready: ["ABSCHLIESSEN", "var(--accent)"], locked: ["GESPERRT", "var(--muted)"] };
  app.innerHTML = `${bar("Bikepark", { right: `<button class="icon-btn bag-btn" data-go="#/rucksack" aria-label="Rucksack, ${open} Sachen zum Abholen">${BAG}<span>${open}</span></button><button class="icon-btn" data-go="#/settings" aria-label="Einstellungen">⚙</button>` })}
  <main>
    <section class="panel next-card">
      ${n ? `<span class="label">Nächste Karte · Modul ${n.mod.num}</span><h2>${esc(n.card.num)} ${esc(n.card.title)}</h2>
        <div class="cue"><small>Merksatz für die Fahrt</small><strong>${esc(n.card.cue)}</strong></div>
        <button class="btn big primary" data-go="#/c/${n.card.id}">Los geht's</button>
        <p class="small muted">Du kannst im Modul auch eine andere Karte wählen.</p>`
      : act ? `<span class="label">Modul ${act.num} · alle Karten sitzen</span><p>Zeig einem Erwachsenen, was du kannst. Mit seiner PIN ist das Modul fertig und das nächste geht auf.</p><button class="btn big primary" data-go="#/m/${act.id}">Modul abschließen</button>`
      : `<span class="label">Alles geschafft!</span><p>Alle 10 Module sind bestanden.</p>`}
    </section>
    <button class="btn big dark" data-go="#/plan">Tagesplan für heute</button>
    <section class="panel">
      <span class="label">Dein Fortschritt</span>
      <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${cards.length}" aria-valuenow="${mastered}"><b style="width:${(mastered / cards.length * 100).toFixed(1)}%"></b></div>
      <p class="small">${mastered} von ${cards.length} Karten kannst du${deferred ? ` · ${deferred} zurückgestellt` : ""}</p>
      <button class="btn" data-go="#/rucksack">${BAG} Rucksack: ${open} zum Abholen · ${badges} ${badges === 1 ? "Abzeichen" : "Abzeichen"}</button>
    </section>
    <section class="mods" aria-label="Module">
      ${S.content.modules.map(m => {
        const st = moduleState(m), done = m.cards.filter(c => cardP(c.id).mastered).length, lab = STATE[st];
        return `<button class="mod ${st === "locked" ? "locked" : ""}" data-go="#/m/${m.id}">
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
  const prev = m.prereq.map(id => S.mods[id]).filter(Boolean);
  let notice = "";
  if (st === "locked") notice = `<div class="notice warn"><p><strong>Noch gesperrt.</strong> Erst ${prev.map(x => `Modul ${x.num} (${esc(x.title)})`).join(" und ")} abschließen.</p></div>`;
  if (st === "ready") notice = `<div class="notice good"><p><strong>Alle Karten sitzen!</strong> Zeig einem Erwachsenen, was du kannst. Mit seiner PIN ist das Modul fertig.</p><button class="btn good big" id="finish" style="margin-top:10px">Modul abschließen</button></div>`;
  if (st === "passed") notice = `<div class="notice good"><p><strong>Bestanden</strong> am ${fmtDate(pm.passedAt)}. Abzeichen: ${esc(m.badge)}</p></div>`;
  const usable = accessible(m);
  app.innerHTML = `${bar(`Modul ${m.num}`, { back: "#/" })}<main>
    <div class="panel"><div>${chips(m.levels)}</div><h2>${esc(m.title)}</h2><p class="small muted">Wo: ${esc(m.where)}</p></div>
    ${notice}
    <section class="cards" aria-label="Karten">
      ${m.cards.map(c => { const p = cardP(c.id), dot = p.mastered ? "g" : p.deferred ? "s" : p.rating || "";
        const sub = p.mastered ? "Kann ich ✓" : p.deferred ? "Zurückgestellt" : p.runs ? `${p.runs} ${p.runs === 1 ? "Runde" : "Runden"}` : esc(c.cue);
        return `<button class="card-row" ${usable ? `data-go="#/c/${c.id}"` : "disabled"}><span class="n">${esc(c.num)}</span><span class="t">${esc(c.title)}<span>${sub}</span></span><i class="dot ${dot}" aria-hidden="true"></i></button>`; }).join("")}
    </section>
    <p class="small muted">Punkte: grün = kann ich · gelb = fast · rot = noch üben · grau = zurückgestellt</p>
    ${st === "open" ? `<button class="btn" id="check">Erwachsene: Modul prüfen</button>` : ""}
  </main>`;
  const check = async () => { if (await adult(`Modul ${m.num} abschließen`, "Bitte PIN eingeben.")) moduleCheck(m); };
  $("#finish")?.addEventListener("click", check);
  $("#check")?.addEventListener("click", check);
}
// Erwachsenen-Prüfung: alle Karten müssen sitzen oder werden hier zurückgestellt
function moduleCheck(m) {
  const sh = sheet(`<h2>Modul ${m.num}: ${esc(m.title)}</h2>
    <p class="small">Zum Abschließen müssen alle Karten sitzen. Karten, die noch nicht sitzen oder hier nicht passen, kannst du zurückstellen. Sie bleiben markiert und können später weiter geübt werden.</p>
    <div class="checks">${m.cards.map(c => { const p = cardP(c.id);
      return p.mastered ? `<label><span class="dot g" aria-hidden="true"></span> ${esc(c.num)} ${esc(c.title)} · kann ich</label>`
        : `<label><input type="checkbox" data-def="${c.id}" ${p.deferred ? "checked" : ""}> ${esc(c.num)} ${esc(c.title)} · zurückstellen</label>`; }).join("")}</div>
    <p class="error" id="ck-err" hidden></p>
    <div class="row"><button class="btn" id="ck-save" type="button">Speichern</button><button class="btn good" id="ck-ok" type="button">Modul bestanden</button></div>
    <button class="btn" id="ck-no" type="button">Abbrechen</button>`, "Modul prüfen");
  const apply = () => sh.root.querySelectorAll("[data-def]").forEach(cb => {
    const pw = cardPw(cb.dataset.def);
    if (cb.checked && !pw.deferred) { pw.deferred = true; pw.deferredAt = DB.nowIso(); }
    if (!cb.checked && pw.deferred) { pw.deferred = false; pw.deferredAt = null; }
  });
  const allOk = () => m.cards.every(c => cardP(c.id).mastered || sh.root.querySelector(`[data-def="${c.id}"]`)?.checked);
  const upd = () => { $("#ck-ok", sh.root).disabled = !allOk(); };
  sh.root.querySelectorAll("[data-def]").forEach(cb => cb.addEventListener("change", upd)); upd();
  $("#ck-no", sh.root).onclick = sh.close;
  $("#ck-save", sh.root).onclick = async () => { apply(); await persist(); sh.close(); toast("Gespeichert"); render(); };
  $("#ck-ok", sh.root).onclick = async () => {
    if (!allOk()) return;
    apply();
    S.doc.modules[m.id] = { status: "passed", passedAt: DB.nowIso(), passedBy: "pin" };
    await persist(); sh.close(); render();
    const nx = S.content.modules[S.content.modules.indexOf(m) + 1];
    const done = sheet(`<div class="reveal"><span class="badge-tile big"><b>${m.num}</b><span>${esc(m.badge)}</span></span><h2>Modul ${m.num} bestanden!</h2>
      <p>${nx ? `Neues Abzeichen im Rucksack. Jetzt geht Modul ${nx.num} (${esc(nx.title)}) auf.` : "Neues Abzeichen im Rucksack. Alle Module geschafft!"}</p></div>
      <button class="btn big primary" id="md-ok" type="button">${nx ? `Zu Modul ${nx.num}` : "Zur Übersicht"}</button>`, "Modul bestanden");
    $("#md-ok", done.root).onclick = () => { done.close(); go(nx ? `#/m/${nx.id}` : "#/"); };
  };
}

/* ---------- Karte ---------- */
function renderCard({ card: c, mod: m }) {
  if (!accessible(m)) { go(`#/m/${m.id}`); return; }
  if (S.view.cardId !== c.id) S.view = { cardId: c.id, step: 0, result: null };
  const steps = ["look", c.dry ? "dry" : null, "ride", "rate"].filter(Boolean);
  const NAMES = { look: "Anschauen", dry: "Im Stand", ride: "Fahren", rate: "Wie war's?" };
  const step = steps[Math.min(S.view.step, steps.length - 1)], si = steps.indexOf(step);
  const p = cardP(c.id), d = day(), R = S.doc.rewards;
  const cue = `<div class="cue"><small>Merksatz für die Fahrt</small><strong>${esc(c.cue)}</strong></div>`;
  const tag = p.mastered ? `<span class="tag good">Kann ich ✓</span>` : p.deferred ? `<span class="tag">Zurückgestellt</span>` : "";
  let body = "";
  if (step === "look") body = `${cue}${tag}<div class="anim" id="anim"></div><p>${esc(c.goal)}</p>
    <button class="btn big primary" id="next">${c.dry ? "Weiter: Im Stand üben" : "Weiter: Fahren"}</button>`;
  if (step === "dry") body = `${cue}<div class="panel"><span class="label">Im Stand üben</span><p>${esc(c.dry)}</p></div>
    <button class="btn big primary" id="next">Gemacht, jetzt fahren</button>`;
  if (step === "ride") {
    const bagMeter = `<div class="panel"><div class="rbar" aria-hidden="true">${[0, 1, 2].map(i => `<i class="${i < R.runs ? "on" : ""}"></i>`).join("")}</div>
      <p class="small muted">${BAG} Spätestens nach 3 Runden gibt es etwas für den Rucksack.</p></div>`;
    if (d.sinceMix >= 3) body = `<div class="panel"><span class="label">Mix-Runde</span><h2>Diesmal kein neuer Merksatz</h2><p>Fahr locker und denk an alles, was du schon kannst. Danach geht es mit „${esc(c.cue)}“ weiter.</p></div>
      <button class="btn big primary" id="mix">Mix-Runde gefahren</button>${bagMeter}`;
    else body = `${cue}
      <div class="panel"><span class="label">Deine Aufgabe auf dieser Runde</span><p>${esc(c.task)}</p><p class="small muted">Wo: ${esc(m.where)}</p></div>
      <div class="panel"><span class="label">Das passiert oft</span><p>${esc(c.oft)}</p></div>
      <div class="panel"><div class="mixbar" aria-hidden="true">${[0, 1, 2, 3].map(i => `<i class="${i <= d.sinceMix ? "on" : ""}"></i>`).join("")}</div>
        <p class="small muted">Runde ${d.sinceMix + 1} von 4. Danach kommt eine Mix-Runde.</p></div>
      <button class="btn big primary" id="ran">Runde gefahren</button>
      ${bagMeter}
      <button class="btn" id="tired">Müde oder genervt? Pause machen</button>`;
  }
  if (step === "rate") {
    const r = S.view.result;
    if (!r) body = `<div class="panel"><span class="label">Geschafft, wenn</span><p>${esc(c.done)}</p></div>
      <p><strong>Wie war's?</strong></p>
      <div class="rate"><button class="r" data-r="r"><i></i>Noch üben</button><button class="y" data-r="y"><i></i>Fast</button><button class="g" data-r="g"><i></i>Kann ich</button></div>
      <p class="small muted">„Kann ich“ 2-mal hintereinander: Die Karte sitzt.${p.streak === 1 && !p.mastered ? " Einmal hast du es schon geschafft!" : ""}</p>`;
    else if (r === "mastered") {
      const n = nextCard();
      body = `<div class="panel celebrate"><div class="big-check" aria-hidden="true">✓</div><h2>Kann ich!</h2><p>Die Karte „${esc(c.title)}“ sitzt.</p></div>
        ${n ? `<button class="btn big primary" data-go="#/c/${n.card.id}">Nächste Karte</button>` : `<div class="notice good"><p>Alle Karten im Modul sitzen. Zeig es einem Erwachsenen und schließ das Modul ab.</p></div><button class="btn big primary" data-go="#/m/${m.id}">Modul abschließen</button>`}
        <button class="btn" data-go="#/m/${m.id}">Andere Karte wählen</button>`;
    } else body = `<div class="panel"><p>${r === "g" ? (p.mastered ? "Gut geübt!" : "Super! Noch einmal „Kann ich“, dann sitzt die Karte.") : "Okay. Gleicher Merksatz, nächste Runde."}</p></div>
      <button class="btn big primary" id="again">Noch eine Runde</button><button class="btn" data-go="#/m/${m.id}">Andere Karte wählen</button>`;
  }
  app.innerHTML = `${bar(`${c.num} ${c.title}`, { back: `#/m/${m.id}` })}<main>
    <nav class="stepnav" aria-label="Schritte">${steps.map((s, i) => `<div class="${i === si ? "now" : i < si ? "done" : ""}">${i + 1} ${NAMES[s]}</div>`).join("")}</nav>
    ${body}</main>`;
  const next = () => { S.view.step = si + 1; S.view.result = null; render(); };
  if (step === "look") S.anim = mountAnimation($("#anim"), c, SCENES[c.anim.scene], { slow: S.doc.settings.slow || reduceMotion });
  $("#next")?.addEventListener("click", next);
  $("#mix")?.addEventListener("click", async () => { d.sinceMix = 0; const g = await countRun(); toast("Mix-Runde gezählt"); render(); showGain(g); });
  $("#tired")?.addEventListener("click", () => pauseSheet(15));
  $("#ran")?.addEventListener("click", async () => { cardPw(c.id).runs += 1; d.sinceMix += 1; const g = await countRun(); next(); showGain(g); });
  app.querySelectorAll(".rate button").forEach(b => b.addEventListener("click", async () => {
    const pw = cardPw(c.id), r = b.dataset.r;
    pw.rating = r; pw.streak = r === "g" ? pw.streak + 1 : 0;
    pw.history.push({ at: DB.nowIso(), rating: r }); if (pw.history.length > 30) pw.history.shift();
    let res = r;
    if (r === "g" && pw.streak >= 2 && !pw.mastered) { pw.mastered = true; pw.masteredAt = DB.nowIso(); res = "mastered"; }
    await persist(); S.view.result = res; render();
  }));
  $("#again")?.addEventListener("click", () => { S.view.step = steps.indexOf("ride"); S.view.result = null; render(); });
}

/* ---------- Rucksack ---------- */
function renderBag() {
  const items = S.doc.rewards.items, open = items.filter(i => !i.redeemedAt), used = items.filter(i => i.redeemedAt);
  const group = list => S.content.rewards.map(r => ({ r, list: list.filter(i => i.item === r.id) })).filter(g => g.list.length)
    .concat(list.some(i => !S.content.rewards.find(r => r.id === i.item)) ? [{ r: rewardDef("?"), list: list.filter(i => !S.content.rewards.find(r => r.id === i.item)) }] : []);
  const days = S.doc.parkDays.length;
  const modTiles = S.content.modules.map(m => { const pm = S.doc.modules[m.id]; return `<div class="badge-tile ${pm?.status === "passed" ? "" : "off"}"><b>${m.num}</b><span>${esc(m.badge)}</span><small>${pm?.status === "passed" ? fmtDate(pm.passedAt) : "noch offen"}</small></div>`; }).join("");
  const dayTiles = S.content.dayBadges.map(b => `<div class="badge-tile ${days >= b ? "" : "off"}"><b>${b}</b><span>${b === 1 ? "Parktag" : "Parktage"}</span><small>${days >= b ? fmtDay(S.doc.parkDays[b - 1]) : `noch ${b - days}`}</small></div>`).join("");
  app.innerHTML = `${bar("Rucksack", { back: "#/" })}<main>
    <section class="panel"><span class="label">Zum Abholen</span>
      ${open.length ? `<div class="bag">${group(open).map(g => `<div class="bag-item">${icon(g.r.id, 64)}<strong>${esc(g.r.name)}</strong><span class="count">× ${g.list.length}</span>
        <button class="btn primary" data-redeem="${esc(g.list[0].id)}">1 abholen</button></div>`).join("")}</div>
        <p class="small muted">Abholen geht bei einem Erwachsenen. Er bestätigt mit der PIN.</p>`
      : `<p>Gerade nichts drin. Nach 1 bis 3 Runden kommt etwas dazu.</p>`}
    </section>
    <section class="panel"><span class="label">Abzeichen für Module</span><div class="badge-grid">${modTiles}</div></section>
    <section class="panel"><span class="label">Abzeichen für Parktage · bisher ${days}</span><div class="badge-grid">${dayTiles}</div></section>
    ${used.length ? `<details class="panel"><summary>Schon abgeholt (${used.length})</summary><div class="bag small-bag">${group(used).map(g => `<div class="bag-item">${icon(g.r.id, 40)}<span>${esc(g.r.name)} × ${g.list.length}</span></div>`).join("")}</div></details>` : ""}
  </main>`;
  app.querySelectorAll("[data-redeem]").forEach(b => b.addEventListener("click", async () => {
    const it = S.doc.rewards.items.find(i => i.id === b.dataset.redeem); if (!it) return;
    const r = rewardDef(it.item);
    if (!(await adult(`${r.name} abholen`, `Bekommt er jetzt ${r.gift}? Bitte PIN eingeben.`))) return;
    it.redeemedAt = DB.nowIso(); await persist(); toast(`${r.name} abgeholt. Lass es dir schmecken!`); render();
  }));
}

/* ---------- Tagesplan ---------- */
function renderPlan() {
  const d = day(), plan = S.content.dayPlan;
  const idx = plan.findIndex(s => !d.plan[s.id]), cur = idx === -1 ? plan.length : idx;
  const n = nextCard();
  const todayItems = S.doc.rewards.items.filter(i => DB.today(new Date(i.at)) === DB.today()).length;
  const stepBody = (s, i) => {
    if (i !== cur) return "";
    if (s.type === "checklist") {
      const items = S.content[s.list] || [], ch = d.checks[s.id] || {};
      return `<p class="small">${esc(s.text)}</p><div class="checks">${items.map((t, k) => `<label><input type="checkbox" data-ck="${s.id}" data-k="${k}" ${ch[k] ? "checked" : ""}> ${esc(t)}</label>`).join("")}</div>
        <button class="btn primary" data-done="${s.id}" ${items.every((_, k) => ch[k]) ? "" : "disabled"}>Fertig</button>`;
    }
    if (s.type === "card") return `<p class="small">${esc(s.text)}</p>${n ? `<p><strong>${esc(n.card.num)} ${esc(n.card.title)}</strong> · „${esc(n.card.cue)}“</p><button class="btn primary" data-go="#/c/${n.card.id}">Karte öffnen</button>` : `<p class="small muted">Gerade keine offene Karte. Übe eine Karte aus dem Modul nochmal.</p>`}<button class="btn" data-done="${s.id}">Erledigt</button>`;
    if (s.type === "pause") {
      const left = d.pauseStartedAt ? Math.max(0, d.pauseStartedAt + s.minutes * 60000 - Date.now()) : s.minutes * 60000;
      return `<p class="small">${esc(s.text)}</p><div class="timer" id="timer" aria-live="off">${fmtTime(left)}</div>
        ${d.pauseStartedAt ? "" : `<button class="btn primary" id="pause-start">Pause starten</button>`}<button class="btn" data-done="${s.id}">Pause vorbei</button>`;
    }
    if (s.type === "end") return `<p class="small">${esc(s.text)}</p><p>Heute in den Rucksack gekommen: <strong>${todayItems}</strong></p><button class="btn" data-go="#/rucksack">Rucksack ansehen</button><button class="btn primary" data-done="${s.id}">Tag abschließen</button>`;
    return `<p class="small">${esc(s.text)}</p><button class="btn primary" data-done="${s.id}">Erledigt</button>`;
  };
  app.innerHTML = `${bar("Tagesplan", { back: "#/" })}<main>
    <div class="panel"><span class="label">Sofort Pause, wenn …</span><ul class="stop-list">${S.content.stopSignals.map(t => `<li>${esc(t)}</li>`).join("")}</ul>
      <button class="btn" id="stop-now">Ich mache jetzt Pause</button></div>
    ${cur >= plan.length ? `<div class="panel celebrate"><div class="big-check">✓</div><h2>Tag geschafft!</h2><p>Bis zum nächsten Mal.</p></div>` : ""}
    <section class="plan">${plan.map((s, i) => `<div class="plan-step ${i === cur ? "now" : i < cur || d.plan[s.id] ? "done" : ""}">
        <span class="no">${d.plan[s.id] ? "✓" : i + 1}</span><div style="display:grid;gap:8px;min-width:0"><h3>${esc(s.title)}</h3>${stepBody(s, i)}</div></div>`).join("")}</section>
  </main>`;
  app.querySelectorAll("[data-ck]").forEach(cb => cb.addEventListener("change", async () => {
    const id = cb.dataset.ck; (d.checks[id] ||= {})[cb.dataset.k] = cb.checked; await persist();
    const items = S.content[plan.find(s => s.id === id).list] || [];
    const btn = app.querySelector(`[data-done="${id}"]`); if (btn) btn.disabled = !items.every((_, k) => d.checks[id][k]);
  }));
  app.querySelectorAll("[data-done]").forEach(b => b.addEventListener("click", async () => { d.plan[b.dataset.done] = true; await persist(); render(); }));
  $("#pause-start")?.addEventListener("click", async () => { if (!d.pauseStartedAt) d.pauseStartedAt = Date.now(); await persist(); render(); toast("Gute Entscheidung. Pausen gehören dazu."); });
  $("#stop-now").addEventListener("click", () => pauseSheet(plan.find(s => s.type === "pause")?.minutes || 15));
  const timer = $("#timer");
  if (timer && d.pauseStartedAt) {
    const ps = plan.find(s => s.type === "pause");
    S.timers.push(setInterval(() => { const left = Math.max(0, d.pauseStartedAt + ps.minutes * 60000 - Date.now()); timer.textContent = left === 0 ? "Pause vorbei" : fmtTime(left); }, 1000));
  }
}
function pauseSheet(minutes) {
  const end = Date.now() + minutes * 60000;
  const sh = sheet(`<h2>Gute Entscheidung.</h2><p>Pausen gehören dazu. Essen, trinken, hinsetzen. Weiter geht es, wenn du dich wieder gut fühlst.</p>
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
      sh.root.querySelector(".sheet").innerHTML = `<h2>Sicherung prüfen</h2><p>In der Datei: ${cards} Karten „kann ich“, ${Object.values(data.modules).filter(m => m.status === "passed").length} bestandene Module, ${data.rewards.items.length} Sachen im Rucksack, ${data.parkDays.length} Parktage.</p><p class="small">Der jetzige Fortschritt wird ersetzt.</p>
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
function renderParent() {
  if (Date.now() > S.adultUntil) {
    app.innerHTML = `${bar("Erwachsene", { back: "#/" })}<main><div class="panel"><p>Dieser Bereich ist für Erwachsene. Hier siehst du den Stand jeder Karte und schließt Module ab.</p></div><button class="btn big primary" id="enter">PIN eingeben</button></main>`;
    $("#enter").onclick = async () => { if (await askPin("Erwachsenen-Bereich", "Bitte PIN eingeben.")) { S.adultUntil = Date.now() + 10 * 60000; render(); } };
    return;
  }
  const RLAB = { r: "noch üben", y: "fast", g: "kann ich" };
  const NAME = { passed: "bestanden", ready: "alle Karten sitzen", locked: "gesperrt", open: "in Arbeit" };
  app.innerHTML = `${bar("Erwachsene", { back: "#/" })}<main>
    <div class="notice"><p>Abschließen heißt: zuschauen, ob die Karten auf der Strecke sitzen. Was noch nicht sitzt oder im Park nicht passt, kannst du zurückstellen.</p></div>
    ${S.content.modules.map(m => {
      const st = moduleState(m);
      const rows = m.cards.map(c => { const p = cardP(c.id); return `<li>${esc(c.num)} ${esc(c.title)}: ${p.mastered ? "kann ich ✓" : p.deferred ? "<strong>zurückgestellt</strong>" : p.rating ? RLAB[p.rating] : "noch nicht geübt"}${p.runs ? ` · ${p.runs} Runden` : ""}</li>`; }).join("");
      return `<details class="panel"${st === "ready" || st === "open" ? " open" : ""}><summary>Modul ${m.num} · ${esc(m.title)}: ${NAME[st]}</summary>
        <ul class="small" style="margin:0;padding-left:20px">${rows}</ul>${st === "open" || st === "ready" ? `<button class="btn good" data-check="${m.id}">Modul prüfen und abschließen</button>` : ""}</details>`; }).join("")}
    <button class="btn" id="pinchg">PIN ändern</button>
    <button class="btn" id="leave">Bereich verlassen</button>
  </main>`;
  app.querySelectorAll("[data-check]").forEach(b => b.onclick = () => moduleCheck(S.mods[b.dataset.check]));
  $("#pinchg").onclick = changePin;
  $("#leave").onclick = () => { S.adultUntil = 0; go("#/"); };
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
  S.content.rewards ||= []; S.content.dayBadges ||= [];
  for (const m of S.content.modules) { S.mods[m.id] = m; m.prereq ||= []; for (const c of m.cards) { S.cards[c.id] = { card: c, mod: m }; if (!SCENES[c.anim.scene]) console.warn("Szene fehlt:", c.anim.scene); } }
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
