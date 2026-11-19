# Spielshow

Lokale Spielshow für Freunde (Express + Socket.IO). Admin steuert, Spieler spielen in Teams, Zuschauer sehen den Host-Bildschirm. Für KI-Agenten gilt die AGENTS.md.

## 🚀 Schnell-Setup

### 1. Installation
```bash
npm install
```

### 2. Umgebungsvariablen einrichten
```bash
# Vorlage kopieren
cp .env.example .env

# Passwörter anpassen (WICHTIG: Sichere Passwörter eingeben!)
# Bearbeite die .env Datei und setze deine eigenen Passwörter
```

### 3. Server starten
```bash
npm start
```
`npm start` lädt die `.env` automatisch. Prüfen, ob alles läuft: `npm run check`.

### 4. Server öffentlich zugänglich machen (optional)
```bash
cloudflared.exe tunnel --url http://localhost:3000/
```

## 📁 Zugriffsadressen

- **Admin**: `http://localhost:3000/admin.html`
- **Spieler**: `http://localhost:3000/`
- **Zuschauer**: `http://localhost:3000/spectator.html`

## 🔐 Passwörter konfigurieren

Erstelle eine `.env` Datei im Projektverzeichnis mit folgenden Inhalten:

```env
ADMIN_PASSWORD=dein_sicheres_admin_passwort
SPECTATOR_PASSWORD=dein_sicheres_spectator_passwort
```

**Wichtig**: 
- `.env` wird nicht ins Git-Repository hochgeladen (in `.gitignore`)
- `.env.example` ist die Vorlage im Repository
- Bei jedem neuen Setup musst du die Passwörter neu einpflegen

## 🧩 Neues Spiel anfordern (Leitfaden für dich)

Ein KI-Agent baut ein neues Spiel am besten, wenn er von dir alle Spielregeln und Entscheidungen auf einmal bekommt. Der Agent liest dafür nur die `AGENTS.md`. Sag ihm zu Beginn: **"Lies die AGENTS.md und implementiere dieses neue Spiel: ..."** und gib die Infos aus der Checkliste unten mit. Was fehlt, fragt er nach. Je vollständiger deine Angaben, desto weniger Rückfragen und Nacharbeit.

### Das bekommt jedes Spiel automatisch (musst du nicht angeben)

- Start-Button im Admin mit Spielnummer und Name, plus die Intro-Animation
- Punkteanzeige je Team für Spieler und Zuschauer
- Punkte **+1 / -1** je Team im Admin (die Punktevergabe per Admin-Klick ist der Standard)
- **Reset-Button "Spiel zurücksetzen"** im Admin. Er setzt das ganze Spiel inklusive Punkte auf den Startzustand
- Buzzer, **falls das Spiel einen hat**: Button für Spieler (unten fixiert), Ton, Anzeige für Zuschauer, im Admin "Buzzer sperren" und "Buzzer freigeben"
- Textfelder für die Teams. Die schaltest du im Admin-Dashboard für alle Spiele gemeinsam ein oder aus
- **Timer** (optional, von Hand): Im Admin-Dashboard per Checkbox einblenden, Zeit einstellen (Standard 30 Sekunden), Start/Fortsetzen, Pause, Zurücksetzen. Spieler und Zuschauer sehen nur die Zeit. Nach Ablauf passiert nichts automatisch
- Teamzuweisung, Teams umbenennen, Gesamtwertung

### Das musst du angeben

| Thema | Was der Agent wissen muss | Beispiel |
|-------|---------------------------|----------|
| **Name** | Name des Spiels (erscheint auf dem Start-Button und im Intro). Optional: an welcher Stelle in der Reihenfolge | "Schätzfragen", als Spiel 6 |
| **Ablauf** | Schritt für Schritt: Was macht der Admin, was machen die Spieler, was sieht der Zuschauer? | "Admin startet Frage, alle Teams tippen eine Zahl, Admin deckt Antworten auf" |
| **Höchstpunktzahl** | Gibt es eine? Wie hoch? Oder zählen die Punkte einfach hoch (dann zeigt die Anzeige nur "n" statt "n / 5")? | "Maximal 5" oder "keine Grenze" |
| **Punkte vergeben** | **Standard: Admin per Klick (+1 / -1), das musst du nicht angeben.** Nur nennen, wenn es anders sein soll: automatische Vergabe (wann?) oder eine Gewinnbedingung (z. B. wer 5 erreicht, gewinnt und der Buzzer sperrt) | "Bei 5 gewinnt das Team" |
| **Buzzer** | Ja/Nein. Wer darf buzzern, ab wann, was passiert danach (pausiert ein Timer, wertet der Admin)? | "Ja, ab Rundenstart, danach wertet der Admin" |
| **Rollen** | Gibt es besondere Spieler (Maler, Referent, Rater)? Wer wird bestimmt und wie (Admin wählt im Dashboard)? | "Pro Team ein Rater, Admin wählt" |
| **Teams** | Spielen beide Teams gleichzeitig oder abwechselnd? | "Abwechselnd, der Admin gibt weiter" |
| **Eingaben der Spieler** | Nichts, Text, Zahl, Auswahl, Klicken, Zeichnen? Wer sieht sie wann? Prüft der Admin oder das System automatisch? | "Zahl eintippen, erst nach Aufdecken für alle sichtbar" |
| **Aufdecken** | Was wird wann aufgedeckt (Lösung, Antworten) und wer löst das aus? | "Admin-Button 'Lösung aufdecken'" |
| **Spezielle Admin-Buttons** | Alle Buttons und Auswahlfelder, die das Spiel braucht, außer den automatischen oben | "Frage wählen, Frage starten, Antworten aufdecken, nächste Frage" |
| **Geheimnisse** | Was dürfen Spieler **nicht** sehen, bevor es aufgedeckt wird? Was darf nur der Admin sehen? | "Lösung nur für Admin" |
| **Zuschauer-Ansicht** | Was soll der Host-Bildschirm zeigen (groß lesbar)? | "Frage groß, Antworten nach dem Aufdecken" |
| **Inhalte** | Wo kommen sie her? Format, Anzahl, Beispiele. Bilder: Dateien selbst ablegen. Soll der Agent Beispielinhalte erfinden? | "10 Fragen mit Lösung, Beispiele erfinden" |
| **Layout** | Normal, breit (viel Platz, z. B. großes Raster) oder Vollbild (wie die Karte)? | "Normal" |
| **Vorbild** | Gibt es ein ähnliches Spiel, an dem sich der Agent orientieren soll? | "Ähnlich wie Promis raten" |
| **Sonderfälle** | Gleichstand, Spieler ohne Team, Abbruch mitten in der Runde, mehrere Runden? | "Mehrere Runden, Punkte bleiben erhalten" |

Hinweise:

- **Reset**: gibt es immer, du musst ihn nicht erwähnen. Sag nur, wenn bei einem Reset **etwas bewusst erhalten** bleiben soll (das ist nicht der Standard).
- **Höchstpunktzahl und Buzzer** immer ausdrücklich nennen. Das sind die Punkte, bei denen Spiele sich unterscheiden.
- Spiele mit einem Bild, das per Buzzer erraten wird (wie Promis, Drudel), sind besonders einfach: Du brauchst nur Namen und Bilder.

### Kopiervorlage

```text
Lies die AGENTS.md und implementiere dieses neue Spiel.

Name: 
Position in der Reihenfolge (optional): 
Kurzbeschreibung: 

Ablauf
- Admin: 
- Spieler: 
- Zuschauer: 

Punkte
- Höchstpunktzahl: (Zahl / keine)
- Abweichung vom Standard "Admin per Klick" (optional, sonst weglassen): (automatisch wenn ... / Gewinnbedingung)

Buzzer: (ja / nein, Details)
Rollen: 
Teams: (gleichzeitig / abwechselnd)
Eingaben der Spieler: 
Aufdecken: 
Spezielle Admin-Buttons: 
Geheimnisse (was darf wer nicht sehen): 
Inhalte (Format, Anzahl, Beispiele, selbst liefern oder erfinden): 
Layout: (normal / breit / Vollbild)
Vorbild: 
Sonderfälle: 
```

### Beispiel (ausgefüllt)

```text
Lies die AGENTS.md und implementiere dieses neue Spiel.

Name: Schätzfragen
Kurzbeschreibung: Alle Teams schätzen eine Zahl, das Team, das am nächsten dran ist, bekommt einen Punkt.

Ablauf
- Admin: wählt eine Frage aus der Liste, startet sie, deckt danach die Lösung auf
- Spieler: ein Spieler pro Team tippt eine Zahl ein
- Zuschauer: Frage groß, nach dem Aufdecken beide Tipps und die Lösung

Punkte
- Höchstpunktzahl: keine

Buzzer: nein
Rollen: nein
Teams: gleichzeitig
Eingaben der Spieler: eine Zahl, erst nach dem Aufdecken für alle sichtbar
Aufdecken: Admin-Button "Lösung aufdecken"
Spezielle Admin-Buttons: Frage wählen, Frage starten, Lösung aufdecken
Geheimnisse: die Lösung nur für den Admin, bis sie aufgedeckt wird
Inhalte: schaetzfragen.json, 10 Fragen mit Zahl als Lösung, bitte Beispiele erfinden
Layout: normal
Vorbild: ähnlich wie Diktat (Eingaben sammeln)
Sonderfälle: gleicher Abstand = beide Teams bekommen einen Punkt (Admin vergibt)
```

Nach der Umsetzung: `npm run check` ausführen (der Agent macht das auch) und das Spiel einmal mit Admin-, Spieler- und Zuschauerfenster durchspielen. Der Agent nennt dir, was er nicht im Browser prüfen konnte.

# 📝 Nächste TODOs:
2. Frage zu Bild
4. 10 gegen Willy
5. Size it up
6. Partner Antowort erraten
7. Schätzfragen mit Ranges
3. Tabu


# 💡 Ideen für Sachen in Spielen:

### Videos für Fragen
#### Schwierige Fragen
https://youtu.be/2PX22Zyvbe4?si=CW9G_m8nL6mKYopb

### Begriffe Kategorien zuordnen:
- Charaktere in Filmen
- Charaktere in Zeichentrickserien
- Songs von Musikern
- Filme und Regisseure
- Bücher und Autoren
- Bundestagsabgeordnete und Partei
- Verkaufspreis von Spielen auf Steam(ohne Rabatt)
- Städte und ihre Zugehörigkeit (Landeshauptstadt, mehr als 500k Einwohner, liegt in Bayern, liegt in Schleswig Holstein z.B.)
- Geschehenisse und ihre Jahrhunderte
- GoT Character und ihre Häuser

# 🎮 Implementierte Spiele
- Referatbingo
- Diktat
- Das kam im Discord nicht an
- Drudel
- Begriffe Kategorien zuordnen
- Listenwissen
- Partnerwissen
- Promis raten
- Blindes Malen
- Wo ist das auf der Karte?
- Merken
- Ist es real oder ist es nicht Wirklichkeit?
- Flaggen bauen -> WIP
- Buchstabensalat
- Teekesselchen
- Beugen
- Diagramme
- Rap Battle (Beispiel-Raps in `rap-battle.json`, Beat wird im Browser erzeugt)
- Songtexte vervollständigen (`songtexte.json`: Array aus `{ id, title, part, lyrics }`, `lyrics` ist ein Strophen- oder Refrain-Ausschnitt mit `\n` zwischen den Zeilen. Enthält nur Beispiele mit gemeinfreien Liedern, bitte eigene Songs ergänzen)
- Du sagst (`du-sagst.json`: Array aus `{ id, question, options: [4 Antworten] }`, enthält Beispielfragen)
- Die Mitte (`die-mitte.json`: Array aus `{ id, question, answer: Zahl, unit }`, enthält Beispielfragen)
- Hinweis Quiz (`hinweis-quiz.json`: Array aus `{ id, title, solution, hints: [bis zu 6 × { hint, question, answer }] }`, enthält zwei Beispielrunden)


# Was schon fertig ist für die Spielshow (inklusive Inhalt):
- Listenwissen
- Referatbingo
- Promis raten
- Diktat
- Blindes Malen
- Drudel
- Wo ist das auf der Karte?
- Das kam bei Discord nicht an
- Begriffe Kategorien zuordnen
- Partnerwissen

# Spiele für Spielshow 07.11.2026 (Rückmeldungen und Stand der Umsetzung)
1. Listenwissen - Punktezähler waren bugged - 3,5-4/5 -> behoben (Punkte von 0 aus, bleiben beim Listenwechsel)
2. Wo ist das auf der Karte? - Textfelder fehlen, Punktezähler waren bugged - 4/5 -> Punkte behoben, Textfelder gibt es jetzt in jedem Spiel, wenn der Admin sie im Dashboard einschaltet
3. Begriffe Kategorien zuordnen - evtl Zeitlimit für die teams jeweils abwechselnd, so 15 sek - 3/5, mehr Begriffe die man kennt, weniger Begriffe -> Der Host-Timer (im Admin-Dashboard einblendbar) deckt das Zeitlimit ab. Ein eigener Zug-Timer pro Team wurde wieder entfernt. Begriffe in `kategorien.json` noch anpassen
4. Diktat - groß-kleinschreibung war nicht beachtet - 4/5, ohne Felix -> Groß-/Kleinschreibung zählt jetzt (Satzzeichen werden weiter ignoriert)
5. Blindes Malen - Text unter der Box, am Ende immer Reveal, maler wechseln führt zu error - 5/5 -> Maler-Wechsel überarbeitet, "Begriff aufdecken" für Admin, der Hinweistext steht jetzt unter der Zeichenbox statt darin
6. Partnerwissen - Antworten reveal noch einbauen - 4/5 -> richtige Antwort wird beim Bewerten für alle aufgedeckt
7. Referatbingo - thema den leuten anzeigen die begriffe eingeben, Punktezähler bugged - 4,5-5/5 -> Thema wird beim Eintragen angezeigt, Punkte behoben
8. Das kam bei Discord nicht an - keine Fehler - 4/5 auch gut als letztes Spiel
9. Promis raten - Buzzer villeicht nicht verschieben - 4/5 -> andere Sachen z.B. Viedeospielcharaktere oder so -> Buzzer sitzt jetzt fest unten. Neue Inhalte: Bilder und Namen in `public/games/promis/` bzw. `drudel/` austauschen

# Spiele für übernächste Spielshow
- Drudel
- Morsen
- Merksätze
- Flaggen bauen
- Tabu
- Merken
