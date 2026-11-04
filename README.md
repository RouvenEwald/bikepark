# Bikepark Lernkarten

Lern-App für den Bikepark als Progressive Web App (PWA). 10 Module, 44 Karten, Rucksack mit Belohnungen, jede Karte mit einem Merksatz für genau eine Runde und einer Animation („✗ So nicht“, dann 2× „✓ So geht's“). Gedacht für Kinder (auch mit AuDHS) zusammen mit einem Erwachsenen.

- Vanilla HTML/CSS/JavaScript, kein Build-Schritt, keine Frameworks
- keine externen Ressourcen: keine CDNs, keine Webfonts, keine Analytics
- nach dem ersten Laden komplett offline nutzbar
- Fortschritt bleibt auf dem Gerät (IndexedDB), Sicherung per Export-Datei

## Dateien

```
index.html          App-Hülle
styles.css          Aussehen (Hell/Dunkel, nur Systemschriften)
app.js              Bildschirme und Abläufe
db.js               Fortschritt: IndexedDB, Schema-Version, Migration, Import-Prüfung, PIN-Hash
engine.js           Animations-Engine (Seite, Draufsicht, Front, Schaubild) und Kinder-Player
scenes.js           Die 44 Animationen
content.json        Alle Inhalte (Module, Karten, Tagesplan, Checklisten)
sw.js               Service Worker (Offline, Update-Hinweis)
manifest.json       Installation auf dem Startbildschirm
icon-192.png, icon-512.png, maskable-512.png   App-Icons
tests/              Nur zum Testen, gehört NICHT auf GitHub Pages
```

Alle App-Dateien liegen flach in einem Ordner. Beim Hochladen gehen deshalb keine Unterordner verloren.

```
```

## 1. Auf GitHub Pages veröffentlichen

1. Auf github.com ein neues Repository anlegen, z. B. `bikepark`. Öffentlich oder privat (privat braucht ein kostenpflichtiges Konto für Pages).
2. Die 13 App-Dateien hochladen (alles außer dem Ordner `tests`): „Add file“ → „Upload files“ → Dateien auswählen → „Commit changes“.
3. Im Repository: **Settings → Pages**. Bei „Build and deployment“ als Quelle „Deploy from a branch“ wählen, Branch `main`, Ordner `/ (root)`, speichern.
4. Nach 1–2 Minuten ist die App erreichbar unter
   `https://<dein-github-name>.github.io/bikepark/`

Alle Pfade in der App sind relativ. Sie funktioniert deshalb auch in einem Unterordner.

## 2. Auf dem Handy installieren (Android, Chrome)

1. Die Adresse oben in **Chrome** öffnen (nicht in einem anderen Browser).
2. Einmal komplett laden lassen, mit Internet.
3. Chrome-Menü (⋮) → **„Zum Startbildschirm hinzufügen“** bzw. **„App installieren“**.
4. Die App vom Startbildschirm öffnen und einrichten: Ein Erwachsener legt die PIN fest.

Ab jetzt läuft die App auch ohne Netz, zum Beispiel am Lift.

## 3. Family Link

Freizugeben ist genau eine Domain:

```
<dein-github-name>.github.io
```

Die App lädt nichts von anderen Domains. In der Family-Link-App die Chrome-Einstellungen des Kindes öffnen und die Seite bei den erlaubten bzw. genehmigten Websites eintragen. Die genauen Menünamen können je nach Version abweichen.

Hinweis: Die Freigabe gilt für alle GitHub-Pages-Seiten unter diesem Namen, nicht nur für diese App.

## 4. Notfall: PIN vergessen

In der App gibt es absichtlich kein Zurücksetzen der PIN. So geht's:

1. In der App: **⚙ Einstellungen → Fortschritt exportieren**. Dafür braucht man keine PIN. Die Datei `bikepark-fortschritt-JJJJ-MM-TT.json` landet in „Downloads“.
2. Chrome → Einstellungen → Website-Einstellungen → Alle Websites → `<name>.github.io` → **Daten löschen**. Dadurch werden die Daten nur für diese Seite gelöscht.
3. Die App neu öffnen und neu einrichten (neue PIN).
4. Im letzten Einrichtungsschritt **„Sicherung laden“** tippen und die Datei wählen.

Tipp: Nach jedem Parktag einmal exportieren.

## 5. Wie die App funktioniert

- **Karte:** 1 Anschauen (Animation mit Start-Knopf) → 2 Im Stand üben (falls vorhanden) → 3 Fahren (eine Runde, ein Merksatz) → 4 Wie war's? (Noch üben / Fast / Kann ich)
- **Karte sitzt:** wenn das Kind 2-mal hintereinander „Kann ich“ wählt. Dafür braucht es keine PIN. Im aktiven Modul wählt das Kind selbst, welche Karte es übt.
- **Mix-Runde:** jede 4. Runde, ohne neuen Merksatz.
- **Module:** strikt der Reihe nach, 1 → 10. Ein Modul ist fertig, wenn alle Karten sitzen. Dann bestätigt ein Erwachsener mit der PIN („Modul abschließen“). Dafür gibt es ein Abzeichen, und das nächste Modul geht auf.
- **Zurückstellen:** kann nur ein Erwachsener, im selben Schritt wie die Modul-Prüfung. Karten, die noch nicht sitzen oder im Park nicht passen, werden als „Zurückgestellt“ markiert. Sie zählen für den Abschluss und können später weiter geübt werden.
- **Rucksack:** Nach 1 bis 3 gefahrenen Runden (zufällig, Mix-Runden zählen mit) gibt es Pommes, Limo, Kuchen oder ein Energy-Gel. Seltener: Pommes, häufiger: Energy-Gel. Nie 3-mal hintereinander dasselbe. Beim Abholen bestätigt ein Erwachsener mit der PIN. Danach gilt die Sache als „eingelöst“. Nach einer richtigen PIN kann man 2 Minuten lang ohne neue PIN weitere Sachen abholen.
- **Abzeichen:** je eines pro bestandenem Modul, dazu Abzeichen für den 1., 3., 5., 10. und 20. Parktag. Ein Parktag ist jeder Tag mit mindestens einer gefahrenen Runde.
- **Pause:** gibt keine Belohnung. Die App sagt: „Gute Entscheidung. Pausen gehören dazu.“
- **PIN:** Sie wird nur als SHA-256-Hash mit Salt gespeichert. Nach 5 Fehlversuchen ist die Eingabe 60 Sekunden gesperrt. Die PIN lässt sich nur mit der alten PIN ändern. Hinweis: Das ist eine Hürde für Kinder, kein Schutz gegen jemanden mit Entwickler-Werkzeugen.
- **Tagesplan:** feste Blöcke mit Bike-Check, Schutz, Aufwärmen, 3 Lernkarten, Pause mit Timer, freie Runden und Abschluss. Die Stopp-Signale stehen immer oben.
- **Ältere Daten:** Beim ersten Start nach dem Update werden die Daten automatisch umgestellt. Sterne fallen weg, früher ausgelassene Karten sind wieder offen, bestandene Module bleiben bestanden.

## 6. Inhalte ändern

Alle Texte stehen in `content.json`. Neue Karten oder geänderte Texte brauchen keine Code-Änderung.

- **Neue Karte:** Eintrag mit eigener, neuer `id` anlegen. Bei `anim.scene` eine vorhandene Animation aus `scenes.js` angeben. Eine ganz neue Animation ist Code und gehört in `scenes.js`.
- **Karte umbenennen (ID ändern):** die alte ID unter `"aliases": ["alte-id"]` eintragen, dann bleibt der Fortschritt erhalten. Für Module gilt dasselbe.
- **Karte löschen:** Der Fortschritt dazu wird archiviert und kommt zurück, wenn die ID wieder auftaucht.
- **Danach immer** in `sw.js` die Zeile `const VERSION = "…"` hochzählen. Sonst bekommen installierte Apps die Änderung nicht. Auf dem Handy erscheint dann „Update verfügbar“.

## 7. Für später vorbereitet: Freigabe per Code

Jedes Modul speichert, wie es abgeschlossen wurde (`passedBy`: `"pin"`). Der Fortschritt hat ein Feld `remote` (`enabled`, `keyId`). Eine spätere Fern-Freigabe per Code (z. B. HMAC über die Modul-ID) kann dort andocken und `passedBy: "code"` setzen, ohne dass sich das Datenmodell ändert. Sie ist nicht eingebaut.

## 8. Testen (optional)

```bash
python3 -m http.server 8765          # im App-Ordner
node tests/e2e.js                    # braucht: npm install playwright
```

Der Test prüft Erststart, Kartenablauf, Mix-Runde, Rucksack und Einlösen, Tages-Abzeichen, Modul-Abschluss mit Zurückstellen, Pause, Offline-Start, App-Update, PIN-Sperre, Export und Notfallweg, kaputten Import, Migration alter Daten, Inhaltsänderung mit umbenannten und gelöschten IDs sowie alle 44 Animationen. Unter `http://localhost:8765/tests/sheet.html` zeigt ein Kontaktbogen alle Animationen auf einen Blick.
