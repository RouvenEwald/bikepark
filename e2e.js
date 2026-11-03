/* End-to-End-Test der App mit Playwright.
   Aufruf:  python3 -m http.server 8765   (im App-Ordner)   und dann   node tests/e2e.js
   Prüft: Erststart, Kartenablauf, Mix-Runde, offline, App-Update, PIN-Sperre, Notfallweg PIN vergessen,
   kaputter Import, Inhaltsänderung bei bestehendem Fortschritt, alle 44 Karten ohne Fehler. */
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const BASE = process.env.BASE || "http://localhost:8765/";
const ROOT = path.resolve(__dirname, "..");
const OUT = process.env.OUT || path.join(ROOT, "tests", "out");
fs.mkdirSync(OUT, { recursive: true });
let failures = 0;
const ok = (cond, msg) => { console.log((cond ? "  ✓ " : "  ✗ ") + msg); if (!cond) failures++; };
const PIN = "2468";

async function setup(page, pin = PIN) {
  await page.goto(BASE);
  await page.click("#s-go");
  await page.fill("#p1", pin); await page.fill("#p2", pin);
  await page.check("#p-ack");
  await page.click("#p-save");
  await page.waitForSelector("#s-new");
}
async function enterPin(page, pin) { await page.fill("#pin-in", pin); await page.click("#pin-ok"); await page.waitForTimeout(250); }
const seen = (page, sel) => page.waitForSelector(sel, { timeout: 4000 }).then(() => true, () => false);

(async () => {
  const browser = await chromium.launch();

  console.log("1) Erststart und Kartenablauf");
  const ctx = await browser.newContext({ viewport: { width: 400, height: 860 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = []; page.on("pageerror", e => errors.push(e.message)); page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(BASE);
  await page.waitForSelector("#s-go");
  await page.screenshot({ path: path.join(OUT, "01-willkommen.png") });
  await page.click("#s-go");
  await page.fill("#p1", "12"); await page.fill("#p2", "12"); await page.click("#p-save");
  ok(await page.isVisible("text=4 bis 8 Ziffern"), "zu kurze PIN wird abgelehnt");
  await page.fill("#p1", PIN); await page.fill("#p2", "9999"); await page.check("#p-ack"); await page.click("#p-save");
  ok(await page.isVisible("text=nicht gleich"), "ungleiche PINs werden abgelehnt");
  await page.fill("#p2", PIN); await page.click("#p-save");
  await page.waitForSelector("#s-new");
  await page.click("#s-new");
  await page.waitForSelector("text=Los geht's");
  await page.screenshot({ path: path.join(OUT, "02-uebersicht.png"), fullPage: true });
  const stored = await page.evaluate(async () => { const DB = await import("./db.js"); const d = await DB.load(); return { hasHash: !!d.pin?.hash, plain: JSON.stringify(d).includes("2468") }; });
  ok(stored.hasHash && !stored.plain, "PIN nur als Hash gespeichert");

  await page.click("text=Los geht's");
  await page.waitForSelector(".stage svg");
  await page.click(".play");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, "03-karte-animation.png"), fullPage: true });
  ok(await page.isVisible(".caption .badge.F"), "Animation startet mit „So nicht“");
  await page.click("#next");               // → Im Stand
  ok(await page.isVisible("text=Im Stand üben"), "Schritt Im Stand");
  await page.click("#next");               // → Fahren
  await page.screenshot({ path: path.join(OUT, "04-fahren.png"), fullPage: true });
  await page.click("#ran");
  await page.click(".rate .g");
  ok(await seen(page, "#again") && await page.isVisible("text=dann gibt es den Stern"), "erstes „Kann ich“ gibt Hinweis statt Stern");
  await page.click("#again");
  await page.click("#ran");
  await page.click(".rate .g");
  await page.waitForSelector(".celebrate");
  await page.screenshot({ path: path.join(OUT, "05-stern.png"), fullPage: true });
  ok(await page.isVisible("text=Stern!"), "zweites „Kann ich“ in Folge gibt Stern");
  // Mix-Runde: nach 3 Runden ist die 4. eine Mix-Runde
  await page.click("#to-next");
  await page.waitForSelector("#next");
  await page.click("#next"); if (await page.isVisible("text=Gemacht, jetzt fahren")) await page.click("#next");
  await page.click("#ran"); await page.click(".rate .y"); await page.click("#again");
  ok(await seen(page, "#mix"), "nach 3 Runden kommt die Mix-Runde");
  await page.screenshot({ path: path.join(OUT, "06-mix.png"), fullPage: true });
  await page.click("#mix");
  ok(await seen(page, "#ran"), "nach der Mix-Runde geht es normal weiter");

  console.log("2) Offline");
  await page.goto(BASE + "#/");
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 15000 }).catch(() => {});
  await page.reload(); await page.waitForSelector("text=Los geht's");
  await ctx.setOffline(true);
  await page.reload(); await page.waitForSelector(".mods");
  ok(await page.isVisible("text=Los geht's"), "App startet offline");
  await page.click("text=Los geht's"); await page.waitForSelector(".stage svg");
  ok(true, "Karte mit Animation offline");
  await ctx.setOffline(false);

  console.log("3) App-Update");
  const swPath = path.join(ROOT, "sw.js"), swOrig = fs.readFileSync(swPath, "utf8");
  fs.writeFileSync(swPath, swOrig.replace(/const VERSION = "[^"]+";/, 'const VERSION = "test-update";'));
  try {
    await page.goto(BASE + "#/");
    const banner = await page.waitForSelector(".update-banner", { timeout: 15000 }).catch(() => null);
    ok(!!banner, "Hinweis „Update verfügbar“ erscheint (kein stiller Austausch)");
    await page.screenshot({ path: path.join(OUT, "07-update.png") });
    if (banner) {
      await Promise.all([page.waitForNavigation({ timeout: 15000 }).catch(() => null), page.click(".update-banner button")]);
      await page.waitForSelector(".mods");
      const keys = await page.evaluate(() => caches.keys());
      ok(keys.includes("bikepark-test-update") && keys.length === 1, "neuer Cache aktiv, alter gelöscht");
      ok((await page.locator(".stars").innerText()).includes("1"), "Fortschritt nach Update erhalten");
    }
  } finally { fs.writeFileSync(swPath, swOrig); }

  console.log("4) PIN-Sperre");
  await page.goto(BASE + "#/parent"); await page.click("#enter");
  for (let i = 0; i < 5; i++) await enterPin(page, "0000");
  ok(await seen(page, "text=Sekunden warten"), "nach 5 Fehlversuchen Sperre");
  await page.screenshot({ path: path.join(OUT, "13-pin-sperre.png") });
  await page.fill("#pin-in", PIN).catch(() => {});
  ok(await page.isDisabled("#pin-ok"), "Eingabe während Sperre gesperrt");
  await page.evaluate(async () => { const DB = await import("./db.js"); const d = await DB.load(); d.lock = { fails: 0, until: 0 }; await DB.save(d); });
  await page.goto(BASE + "#/"); await page.reload();

  console.log("5) Export und Notfallweg „PIN vergessen“");
  await page.goto(BASE + "#/settings");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#exp")]);
  const exportPath = path.join(OUT, "sicherung.json"); await dl.saveAs(exportPath);
  const exp = JSON.parse(fs.readFileSync(exportPath, "utf8"));
  ok(exp.kind === "progress-export" && !exp.data.pin, "Export ohne PIN, PIN-Hash nicht in der Datei");
  // neues Gerät = Websitedaten gelöscht
  const ctx2 = await browser.newContext({ viewport: { width: 400, height: 860 } });
  const p2 = await ctx2.newPage();
  await setup(p2, "1357");
  await p2.click("#s-imp");
  await p2.setInputFiles("#imp-file", exportPath);
  await p2.waitForSelector("#imp-yes");
  await p2.screenshot({ path: path.join(OUT, "08-import-pruefen.png") });
  await p2.click("#imp-yes");
  await p2.waitForSelector(".mods");
  ok((await p2.locator(".stars").innerText()).includes("1"), "Fortschritt nach Neueinrichtung wiederhergestellt");
  const pinOk = await p2.evaluate(async () => { const DB = await import("./db.js"); const d = await DB.load(); return DB.checkPin(d, "1357"); });
  ok(pinOk, "neue PIN gilt, alte PIN nicht übernommen");

  console.log("6) Kaputter Import");
  const broken = path.join(OUT, "kaputt.json");
  fs.writeFileSync(broken, JSON.stringify({ ...exp, data: { ...exp.data, cards: { "c1-1": { runs: -3, rating: "x" } } } }));
  const before = await p2.evaluate(async () => { const DB = await import("./db.js"); return JSON.stringify((await DB.load()).cards); });
  await p2.goto(BASE + "#/settings"); await p2.click("#imp");
  await enterPin(p2, "1357");
  await p2.setInputFiles("#imp-file", broken);
  await p2.waitForSelector("#imp-err:not([hidden])");
  ok((await p2.locator("#imp-err").innerText()).includes("beschädigt"), "kaputte Datei wird abgelehnt");
  fs.writeFileSync(broken, "{ nicht json");
  await p2.setInputFiles("#imp-file", broken);
  ok(await seen(p2, "text=kein gültiges JSON"), "kein JSON wird abgelehnt");
  const after = await p2.evaluate(async () => { const DB = await import("./db.js"); return JSON.stringify((await DB.load()).cards); });
  ok(before === after, "bestehender Stand bleibt unverändert");
  await p2.screenshot({ path: path.join(OUT, "09-import-fehler.png") });
  await ctx2.close();

  console.log("7) Inhaltsänderung bei bestehendem Fortschritt");
  const ctx3 = await browser.newContext({ viewport: { width: 400, height: 860 }, serviceWorkers: "block" });
  const p3 = await ctx3.newPage();
  const content = JSON.parse(fs.readFileSync(path.join(ROOT, "content.json"), "utf8"));
  await setup(p3); await p3.click("#s-new");
  await p3.evaluate(async () => { const DB = await import("./db.js"); const d = await DB.load();
    d.cards["c1-1"] = { ...DB.emptyCard(), runs: 4, mastered: true, streak: 2, rating: "g" };
    d.cards["c1-3"] = { ...DB.emptyCard(), runs: 2, rating: "y" }; await DB.save(d); });
  const changed = structuredClone(content);
  changed.modules[0].cards[0].id = "c1-1-neu"; changed.modules[0].cards[0].aliases = ["c1-1"];
  changed.modules[0].cards.splice(2, 1); // c1-3 gelöscht
  await p3.route("**/content.json", r => r.fulfill({ contentType: "application/json", body: JSON.stringify(changed) }));
  await p3.reload(); await p3.waitForSelector(".mods");
  let d3 = await p3.evaluate(async () => { const DB = await import("./db.js"); return DB.load(); });
  ok(d3.cards["c1-1-neu"]?.mastered && !d3.cards["c1-1"], "umbenannte Karte behält Fortschritt (aliases)");
  ok(d3.orphans.cards["c1-3"]?.runs === 2, "gelöschte Karte landet im Archiv statt verloren zu gehen");
  await p3.unroute("**/content.json");
  await p3.reload(); await p3.waitForSelector(".mods");
  d3 = await p3.evaluate(async () => { const DB = await import("./db.js"); return DB.load(); });
  ok(d3.cards["c1-3"]?.runs === 2, "Karte kommt mit Fortschritt zurück, wenn die ID wieder existiert");

  console.log("8) Alle 44 Karten");
  await p3.evaluate(async () => { const DB = await import("./db.js"); const d = await DB.load(); const c = await (await fetch("./content.json")).json();
    for (const m of c.modules) d.modules[m.id] = { status: "passed", passedAt: DB.nowIso(), passedBy: "pin", unlockedAt: DB.nowIso(), unlockedBy: "pin" }; await DB.save(d); });
  const errs3 = []; p3.on("pageerror", e => errs3.push(e.message)); p3.on("console", m => { if (m.type() === "error") errs3.push(m.text()); });
  await p3.reload(); await p3.waitForSelector(".mods");
  let rendered = 0;
  for (const m of content.modules) for (const c of m.cards) {
    await p3.goto(BASE + "#/c/" + c.id);
    await p3.waitForSelector(".stage svg");
    await p3.click(".play"); await p3.waitForTimeout(250);
    const n = await p3.evaluate(() => document.querySelector(".stage svg").childElementCount);
    if (n > 3) rendered++;
  }
  ok(rendered === 44, `alle Animationen gerendert (${rendered}/44)`);
  ok(errs3.length === 0, "keine Fehler in der Konsole" + (errs3.length ? ": " + errs3.slice(0, 3).join(" | ") : ""));
  await p3.goto(BASE + "#/plan"); await p3.waitForSelector(".plan");
  await p3.screenshot({ path: path.join(OUT, "10-tagesplan.png"), fullPage: true });
  await p3.goto(BASE + "#/m/m8"); await p3.waitForSelector(".cards");
  await p3.screenshot({ path: path.join(OUT, "11-modul.png"), fullPage: true });
  await p3.emulateMedia({ colorScheme: "dark" });
  await p3.evaluate(async () => { const DB = await import("./db.js"); const d = await DB.load(); d.settings.theme = "dark"; await DB.save(d); });
  await p3.goto(BASE + "#/c/c6-2"); await p3.reload(); await p3.waitForSelector(".stage svg"); await p3.click(".play"); await p3.waitForTimeout(2600);
  await p3.screenshot({ path: path.join(OUT, "12-dunkel.png"), fullPage: true });
  await ctx3.close();

  ok(errors.length === 0, "keine Fehler im Hauptlauf" + (errors.length ? ": " + errors.slice(0, 3).join(" | ") : ""));
  await browser.close();
  console.log(failures ? `\n${failures} Prüfung(en) fehlgeschlagen` : "\nAlle Prüfungen bestanden");
  process.exit(failures ? 1 : 0);
})();
