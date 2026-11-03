/* Bikepark Lernkarten – Fortschritt.
   Ein Dokument in IndexedDB, getrennt von den Inhalten (Verweise nur über IDs).
   Schema-Version + Migrationen, Validierung für Import, PIN-Hash (SHA-256 mit Salt). */

export const APP_ID = "bikepark-lernkarten";
export const SCHEMA = 1;
const DB_NAME = "bikepark-lernkarten", STORE = "kv", KEY = "progress";
const RATINGS = [null, "r", "y", "g"];
const STAR_TYPES = ["card", "skip", "pause", "day"];

export const nowIso = () => new Date().toISOString();
export function today(d = new Date()) {
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function emptyProgress() {
  return {
    app: APP_ID,
    schemaVersion: SCHEMA,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    pin: null,                         // { algo, salt, hash, setAt }
    lock: { fails: 0, until: 0 },      // Sperre nach 5 Fehlversuchen
    settings: { theme: "light", slow: false },
    cards: {},                         // Karten-ID → { runs, rating, streak, mastered, masteredAt, skipped, skippedAt, history[] }
    modules: {},                       // Modul-ID → { status: "passed", passedAt, passedBy, unlockedAt, unlockedBy }
    stars: [],                         // { at, type, ref }
    days: {},                          // "JJJJ-MM-TT" → Tageszustand
    orphans: { cards: {}, modules: {} }, // Fortschritt zu IDs, die es im Inhalt (noch) nicht gibt
    remote: { enabled: false, keyId: null }, // vorbereitet für spätere Freigabe per Code (HMAC je Modul-ID)
  };
}
export function emptyCard() { return { runs: 0, rating: null, streak: 0, mastered: false, masteredAt: null, skipped: false, skippedAt: null, history: [] }; }
export function emptyDay() { return { runs: 0, sinceMix: 0, plan: {}, checks: {}, pauseStartedAt: null, pauseStars: 0, dayStar: false }; }

/* ---------- IndexedDB ---------- */
let dbp = null;
function openDb() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    if (!("indexedDB" in self)) { rej(new Error("IndexedDB fehlt")); return; }
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error || new Error("IndexedDB nicht verfügbar"));
    r.onblocked = () => rej(new Error("IndexedDB blockiert"));
  });
  return dbp;
}
export async function load() {
  const db = await openDb();
  return new Promise((res, rej) => {
    const q = db.transaction(STORE, "readonly").objectStore(STORE).get(KEY);
    q.onsuccess = () => res(q.result ?? null);
    q.onerror = () => rej(q.error);
  });
}
export async function save(doc) {
  doc.updatedAt = nowIso();
  const db = await openDb();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(doc, KEY);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error || new Error("Speichern abgebrochen"));
  });
}

/* ---------- Migration ---------- */
// Für Version n → n+1 hier eine Funktion ergänzen, z. B. 1: d => { d.neuesFeld = …; return d; }
const MIGRATIONS = {};
export function migrate(input) {
  if (!input || typeof input !== "object") throw new Error("Kein gültiger Fortschritt.");
  let d = structuredClone(input);
  if (!Number.isInteger(d.schemaVersion) || d.schemaVersion < 1) throw new Error("Die Datei hat keine gültige Schema-Version.");
  if (d.schemaVersion > SCHEMA) throw new Error("Die Datei stammt aus einer neueren App-Version. Bitte zuerst die App aktualisieren.");
  while (d.schemaVersion < SCHEMA) {
    const f = MIGRATIONS[d.schemaVersion];
    if (!f) throw new Error(`Keine Migration von Version ${d.schemaVersion} vorhanden.`);
    d = f(d); d.schemaVersion += 1;
  }
  return normalize(d);
}
// fehlende Felder mit Standardwerten auffüllen
function normalize(d) {
  const base = emptyProgress();
  for (const k of Object.keys(base)) if (d[k] === undefined) d[k] = base[k];
  d.settings = { ...base.settings, ...(d.settings || {}) };
  d.lock = { ...base.lock, ...(d.lock || {}) };
  d.orphans = { cards: {}, modules: {}, ...(d.orphans || {}) };
  d.remote = { ...base.remote, ...(d.remote || {}) };
  for (const id of Object.keys(d.cards || {})) d.cards[id] = { ...emptyCard(), ...d.cards[id] };
  for (const id of Object.keys(d.days || {})) d.days[id] = { ...emptyDay(), ...d.days[id] };
  return d;
}

/* ---------- Validierung (vor jedem Import) ---------- */
const isObj = v => v && typeof v === "object" && !Array.isArray(v);
const isInt = v => Number.isInteger(v) && v >= 0;
export function validate(d) {
  const fail = m => { throw new Error("Die Datei ist beschädigt: " + m); };
  if (!isObj(d)) fail("kein Objekt");
  if (d.app !== APP_ID) fail("gehört nicht zu dieser App");
  if (d.schemaVersion !== SCHEMA) fail("falsche Schema-Version");
  if (!isObj(d.cards)) fail("Karten fehlen");
  for (const [id, c] of Object.entries(d.cards)) {
    if (typeof id !== "string" || !id) fail("Karten-ID ungültig");
    if (!isObj(c)) fail(`Karte ${id} ungültig`);
    if (!isInt(c.runs)) fail(`Runden bei ${id} ungültig`);
    if (!RATINGS.includes(c.rating)) fail(`Bewertung bei ${id} ungültig`);
    if (!isInt(c.streak)) fail(`Serie bei ${id} ungültig`);
    if (typeof c.mastered !== "boolean" || typeof c.skipped !== "boolean") fail(`Status bei ${id} ungültig`);
    if (!Array.isArray(c.history)) fail(`Verlauf bei ${id} ungültig`);
  }
  if (!isObj(d.modules)) fail("Module fehlen");
  for (const [id, m] of Object.entries(d.modules)) {
    if (!isObj(m)) fail(`Modul ${id} ungültig`);
    if (m.status !== undefined && m.status !== null && m.status !== "passed") fail(`Status von ${id} ungültig`);
  }
  if (!Array.isArray(d.stars)) fail("Sterne fehlen");
  for (const s of d.stars) if (!isObj(s) || typeof s.at !== "string" || !STAR_TYPES.includes(s.type)) fail("Stern ungültig");
  if (!isObj(d.days)) fail("Tage fehlen");
  for (const [k, v] of Object.entries(d.days)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || !isObj(v)) fail("Tag ungültig");
    if (!isInt(v.runs) || !isInt(v.sinceMix)) fail("Runden eines Tages ungültig");
  }
  if (!isObj(d.settings)) fail("Einstellungen fehlen");
  if (!isObj(d.orphans) || !isObj(d.orphans.cards) || !isObj(d.orphans.modules)) fail("Archiv ungültig");
  return true;
}

/* ---------- Inhalt und Fortschritt abgleichen (gelöschte / umbenannte IDs) ---------- */
// Umbenennung: im Inhalt bei Karte oder Modul "aliases": ["alte-id"] eintragen.
// Gelöschte IDs wandern ins Archiv (orphans) und kommen zurück, sobald die ID wieder existiert.
export function reconcile(d, content) {
  let changed = false;
  const cardIds = new Set(), modIds = new Set(), alias = {};
  for (const m of content.modules) {
    modIds.add(m.id); (m.aliases || []).forEach(a => { alias["m:" + a] = m.id; });
    for (const c of m.cards) { cardIds.add(c.id); (c.aliases || []).forEach(a => { alias["c:" + a] = c.id; }); }
  }
  const pass = (live, arch, ids, pre) => {
    for (const [id, v] of Object.entries(live)) {
      if (ids.has(id)) continue;
      const to = alias[pre + id];
      if (to && !live[to]) live[to] = v; else arch[id] = v;
      delete live[id]; changed = true;
    }
    for (const [id, v] of Object.entries(arch)) {
      const to = ids.has(id) ? id : alias[pre + id];
      if (to && !live[to]) { live[to] = v; delete arch[id]; changed = true; }
    }
  };
  pass(d.cards, d.orphans.cards, cardIds, "c:");
  pass(d.modules, d.orphans.modules, modIds, "m:");
  // alte Tage aufräumen (nur die letzten 90 behalten)
  const days = Object.keys(d.days).sort();
  if (days.length > 90) { days.slice(0, days.length - 90).forEach(k => delete d.days[k]); changed = true; }
  return changed;
}

/* ---------- Export / Import ---------- */
export function exportFile(d) {
  const data = structuredClone(d);
  delete data.pin; delete data.lock; // PIN bleibt auf dem Gerät
  return { kind: "progress-export", app: APP_ID, schemaVersion: SCHEMA, exportedAt: nowIso(), data };
}
// Liefert einen geprüften neuen Fortschritt. Wirft bei jedem Fehler – der alte Stand bleibt unberührt.
export function parseImport(text, current) {
  let f;
  try { f = JSON.parse(text); } catch { throw new Error("Die Datei ist kein gültiges JSON."); }
  if (!isObj(f) || f.kind !== "progress-export" || f.app !== APP_ID) throw new Error("Das ist keine Sicherung dieser App.");
  if (!isObj(f.data)) throw new Error("In der Datei fehlen die Daten.");
  const data = migrate({ ...f.data, app: f.data.app ?? APP_ID, schemaVersion: f.data.schemaVersion ?? f.schemaVersion });
  validate(data);
  data.pin = current.pin; data.lock = current.lock; data.settings = current.settings;
  return data;
}
export function isFresh(d) {
  return d.stars.length === 0 && Object.values(d.cards).every(c => c.runs === 0 && !c.mastered && !c.skipped) && Object.keys(d.modules).length === 0;
}

/* ---------- PIN ---------- */
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
export function newSalt() { const a = new Uint8Array(16); crypto.getRandomValues(a); return hex(a.buffer); }
export async function hashPin(pin, salt) { return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(salt + ":" + pin))); }
export async function makePin(pin) { const salt = newSalt(); return { algo: "SHA-256", salt, hash: await hashPin(pin, salt), setAt: nowIso() }; }
export async function checkPin(d, pin) { if (!d.pin) return false; return (await hashPin(pin, d.pin.salt)) === d.pin.hash; }
