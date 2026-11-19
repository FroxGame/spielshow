# AGENTS.md - Spielshow

Dies ist die einzige Anleitung, die du als KI-Agent brauchst. Sie reicht, um ein neues Spiel vollständig und im Standard der anderen Spiele umzusetzen, ohne weitere Dokumente zu lesen. Der Nutzer-Leitfaden (welche Infos der Nutzer liefern soll) steht in `README.md` unter "Neues Spiel anfordern". Fehlen Infos daraus, frage nach, bevor du baust (siehe Abschnitt 2).

## 1. Projekt in 30 Sekunden

Lokale Spielshow für Freunde. Node.js (Express + Socket.IO), kein Build-Schritt. Drei Browser-Ansichten:

- **Admin** (`/admin.html`): der Host steuert alles.
- **Spieler** (`/`): Spieler in Teams (zwei Teams, umbenennbar). Neue Spieler sind in **keinem Team**, der Admin weist zu.
- **Zuschauer** (`/spectator.html`): Host-Bildschirm für alle, braucht Passwort.

Es läuft immer genau ein Spiel (`gameState.currentScreen`). Jedes Spiel hat Punkte pro Team. Die Gesamtwertung zählt gewonnene Spiele (Ziel: 5 Siege).

```bash
npm install
npm start          # Port 3000 (PORT überschreibbar), lädt .env automatisch (Node >= 22.9)
npm run check      # Lint + HTML-Prüfung + Rauchtest mit echtem Server. Pflicht nach jeder Änderung
```

Passwörter: `ADMIN_PASSWORD`, `SPECTATOR_PASSWORD` (Standard `1234`). Der Rauchtest nutzt Port 3999. Bleibt ein Test-Server hängen, ist der Port belegt und der Test bricht mit `EADDRINUSE` ab: Prozess beenden und neu starten.

## 2. Vorgehen für ein neues Spiel

1. **Anforderungen klären.** Du brauchst vom Nutzer mindestens: Ablauf (aus Sicht von Admin, Spieler, Zuschauer), Höchstpunktzahl (Zahl oder keine), Buzzer ja/nein, spezielle Admin-Buttons, Inhalte und Format, Geheimnisse (was darf wer nicht sehen). Der vollständige Fragenkatalog steht in `README.md` ("Neues Spiel anfordern"). Frage gezielt nach, was fehlt. Rate nicht bei Punkte-Limit und Buzzer. **Nicht nachfragen** (Standard, nur bei ausdrücklicher Abweichung ändern): Punktevergabe ist immer **Admin per Klick (+1 / -1)** über `adminAddGamePoint`, und der **globale Host-Timer** ist immer dabei (Abschnitt 4). Ein eigener Spiel-Timer mit Folgen wird nur gebaut, wenn der Nutzer ihn von sich aus verlangt.
2. **Standard abbilden** (Abschnitt 4): Was der Kern liefert, baust du nicht nach.
3. **Server-Modul** schreiben (Abschnitt 5) und in `server/registry.js` eintragen.
4. **Drei Client-Seiten** schreiben (Abschnitt 6).
5. **Inhalte** anlegen (Abschnitt 7).
6. **Test** ergänzen und `npm run check` ausführen (Abschnitt 8).
7. **Doku** aktualisieren (Abschnitt 9) und die Abnahme-Checkliste durchgehen (Abschnitt 10).

Ist das neue Spiel ein "Bild erraten mit Buzzer" (wie Promis, Drudel): nur eine kleine Datei mit `createImageGuessGame` anlegen (siehe Abschnitt 5.6). Dafür sind keine neuen Client-Seiten nötig.

## 3. Architektur

```
server.js                    Start: Express, Socket.IO, verdrahtet Kern + Spiele
server/
  context.js                 Kontext (ctx): gameState, Helfer
  registry.js                Liste aller Spiele, Pflichtfeld-Prüfung, liefert /games.json
  utils.js                   Konstanten, addScore, Validierung, JSON lesen
  core/
    auth.js                  Admin-/Zuschauer-Login
    players.js               Anmeldung, Namen, Teamzuweisung
    teams.js                 Teams umbenennen (ruft renameTeam jedes Spiels), Gesamtpunkte
    screens.js               Spielwechsel, Spiel starten (Intro-Animation)
    notes.js                 Team-Textfelder (Notizen), globaler Schalter
    timer.js                 globaler manueller Timer
    game-controls.js         Generische Events: Punkte, Reset, Buzzer
    safe-socket.js           fängt Fehler in Handlern ab, loggt den Event-Namen
  games/<spiel>.js           ein Modul pro Spiel. image-guess.js ist die Basis für Promis/Drudel
public/
  index.html                 Spieler-Shell
  admin.html                 Admin-Shell
  spectator.html             Zuschauer-Shell
  shared/shared.js|css       gemeinsame Bausteine, globales Objekt `Spielshow`
  games/<clientModule>-admin|player|spectator.html
tests/smoke.js               Rauchtest (jedes Spiel automatisch)
tests/check-html.js          Syntax der Seiten-Skripte, verwaiste Element-IDs, alte Events
*.json im Projektroot        Spielinhalte
```

Datenfluss: Clients senden Events → Modul ändert `gameState` → `emitState()` sendet `stateUpdate` (der **gesamte** State) an alle → jede Seite rendert in `onModuleStateUpdate` bzw. `onSpectatorStateUpdate`.

Die Spieleliste hat eine einzige Quelle: `server/registry.js`. Die Shells laden sie über `GET /games.json` (Felder `id, number, title, stateKey, clientModule, maxScore, buzzer, layout`). Es gibt keine zweite Liste in den Shells und keine Spielnamen in `admin.html`, `index.html` oder `spectator.html`.

### Bestehende Spiele (Vorlagen)

| Nr | ID | clientModule | Besonderheit | Gute Vorlage für |
|----|----|--------------|--------------|------------------|
| 1 | LISTENWISSEN | listenwissen | aufdeckbare Wortliste | einfaches Spiel |
| 2 | KARTE | karte | Vollbild, max. 7 | Vollbild-Layout |
| 3 | KATEGORIEN | kategorien | Begriffe per Admin zuordnen, ohne Punktelimit | Lösungen nur im Server |
| 4 | DIKTAT | diktat | Spielereingaben, eigene Update-Kanäle, ohne Limit | Eingaben sammeln |
| 5 | MALEN | malen | Rollen (Maler), Zeichnen, ohne Limit | Rollen, Echtzeit-Daten |
| 6 | PARTNERWISSEN | partnerwissen | Rollen pro Team, private Ansichten | private Spieleransichten |
| 7 | BINGO | bingo | Referent + Raster, ohne Limit | Rollen, Phasen per Admin-Button |
| 8 | DISCORD_GAME | discord | private Rollenansichten, ohne Limit | Geheimnisse pro Rolle |
| 9 | PROMI_RATEN | image-guess | Buzzer | Bild erraten (Konfiguration) |
| 10 | DRUDEL | image-guess | Buzzer | Bild erraten (Konfiguration) |
| 11 | MERKEN | merken | Merkphase endet per Admin-Button, max. 7 | eigenes Limit, Phasenwechsel |
| 12 | REALITAET | realitaet | Runde endet per Admin-Button, ohne Limit | einfache Runden |
| 13 | FLAGGEN | flaggen | Bauen per Drag, Bauen sperren per Admin-Button, Original und Bauflächen privat bis zum Aufdecken (`flaggenView`). `flaggen.json` wird mit `node tools/flaggen-builder.js` erzeugt (Flaggen in `tools/flaggen-data.js`, Bauteile in `tools/flaggen-parts.js`, Ablenker im Builder) | komplexe Spielereingaben |
ode tools/flaggen-builder.js erzeugt (Flaggen in 	ools/flaggen-data.js, Bauteile in 	ools/flaggen-parts.js, Ablenker im Builder) | komplexe Spielereingaben |
| 14 | BUCHSTABENSALAT | buchstabensalat | Buzzer, Schritt-Takt, Lösung im Server | **Buzzer + Spiel-Takt (beste Vorlage)** |
| 15 | TEEKESSELCHEN | teekesselchen | Buzzer, Schreibphase, private Kategorie je Team | **private Daten pro Team, Phasen** |
| 16 | BEUGEN | beugen | Buzzer erst nach "Form zeigen", max. 7, Lösung nur im Server (`beugen.json`) | einfache Runden mit Aufdeck-Schritten |
| 17 | DIAGRAMME | diagramme | Diagramm weiterzeichnen per Klick, Zeichner je Team, Auswertung als Abweichung, `layout: 'medium'`, max. 5 (`diagramme.json`) | **private Live-Daten pro Empfänger** (`diagrammeView`), gemeinsamer Canvas-Baustein `public/shared/diagram.js` |
| 18 | RAP_BATTLE | rap-battle | Rappender sieht nur Reimwörter (aktuelle + 2 nächste Zeilen) zu synthetischem Beat, Teams tippen 12 Wörter und markieren sie, Admin gibt Rap per Button frei, ohne Limit (`rap-battle.json`) | **private Ansichten je Rolle** (`rapBattleView`), Takt-Animation und Beat im Client (`public/shared/rap-battle.js`), Server gibt nur `startAt` und Tempo vor |

## 4. Der Standard: Was der Kern automatisch liefert

Baue das **nicht** in ein Spiel. Es ist für jedes Spiel schon da.

| Funktion | Wo sichtbar | Wie es funktioniert |
|----------|-------------|---------------------|
| Start-Button mit Spielname | Admin | aus `/games.json`, Text "<Nr>. <title> starten" |
| Intro-Animation (Spielnummer + Name) | alle | `adminStartGame` sendet `gameIntro` |
| Punkteleiste je Team ("n / max" oder nur "n") | Spieler, Zuschauer | liest `gameState[stateKey].scores` und `maxScore` |
| Punkte +1 / -1 je Team | Admin | Event `adminAddGamePoint { team, amount }`, begrenzt auf 0..`maxScore` |
| **Reset-Button "Spiel zurücksetzen"** (mit Rückfrage) | Admin | Event `adminResetGame` → `reset()` des Moduls. **Setzt alles inklusive Punkte auf den Startzustand.** Jedes Spiel hat ihn |
| Buzzer-Button, Ton, Status | Spieler: fest am unteren Bildschirmrand ab Spielbeginn (wandert nie), auch per **Leertaste** auslösbar, außer in Eingabefeldern | wenn `buzzer: true` |
| Buzzer sperren / freigeben | Admin | `adminLockBuzzer`, `adminResetBuzzer` |
| Buzzer-Anzeige + Ton | Zuschauer | wenn `buzzer: true` |
| Textfelder (Notizen) für Teams | Spieler unten, Zuschauer | **global**, vom Admin im Dashboard ein-/ausschaltbar (`adminSetNotesEnabled`, `gameState.notesEnabled`, Standard aus). Ein Spiel tut dafür nichts |
| **Timer** (manuell, optional) | Admin-Dashboard, Spieler, Zuschauer | **global**, nicht pro Spiel. Admin schaltet ihn ein (Checkbox), stellt die Zeit ein (Standard 30 s), bedient Start/Fortsetzen, Pause, Zurücksetzen. Spieler und Zuschauer sehen nur die Zeit (m:ss), rot ab 10 s. Zustand in gameState.timer { enabled, duration, remaining, running }, Events dminSetTimerEnabled, dminSetTimerDuration, dminStartTimer, dminPauseTimer, dminResetTimer. Nach Ablauf passiert **nichts** automatisch (stoppt bei 0:00). Ein Spiel muss dafür nichts tun und darf keinen eigenen Anzeige-Timer bauen |
| Teamzuweisung, Umbenennen, Gesamtwertung | Admin | Kern |
| Admin-Schutz, Fehlerabfang in Handlern | Server | `isAdmin`, `safe-socket.js` |

Punkte-Konvention: `scores` ist `{ [teamName]: Zahl }`. Immer `{ team, amount }` als Parameter. Prüfe nie `!scores[team]` (bei 0 Punkten wahr), sondern `=== undefined`.

Buzzer-Felder im Spiel-State: `buzzerLocked`, `buzzerWinner` (Text "Name (Team)"), `buzzerTeam`, `buzzerOpen` (vom Server vor jedem Senden berechnet aus `buzzerLocked` und `canBuzz()`). Buzzern kann nur ein Spieler **mit Team**.

## 5. Server-Modul `server/games/<spiel>.js`

### 5.1 Pflichtfelder

Die Registry bricht beim Start ab, wenn eines fehlt: `id`, `title`, `stateKey`, `clientModule`, `createState`, `reset`, `register`, `renameTeam`.

### 5.2 Vorlage (vollständig)

```js
'use strict';

const path = require('path');

const ROOT = path.join(__dirname, '..', '..');     // Projektroot (für JSON-Dateien)

module.exports = function createMeinSpielGame(ctx) {
    const { gameState, createScores, byTeam, renameKey, emitState, isAdmin, utils } = ctx;

    const roundsPath = path.join(ROOT, 'mein-spiel.json');
    let secretAnswer = null;      // Geheimnisse bleiben privat im Modul, NICHT im State
    let timer = null;             // Timer-Handle, wird in reset() gelöscht

    const state = () => gameState.meinSpielGame;

    function stopTimer() {
        if (timer) clearInterval(timer);
        timer = null;
    }

    // EINZIGE Quelle für den Startzustand. Alles, was zurückgesetzt werden soll, gehört hierher.
    function createState() {
        return {
            meinSpielGame: {
                phase: 'IDLE',
                // buzzerLocked: false, buzzerWinner: null, buzzerTeam: null,   // nur bei buzzer: true
                scores: createScores()
            }
        };
    }

    // Reset = vollständiger Startzustand inklusive Punkten.
    function reset() {
        stopTimer();
        secretAnswer = null;
        Object.assign(gameState, createState());
    }

    // Nur spielspezifische Events. Punkte/Reset/Buzzer NICHT hier.
    function register(socket) {
        socket.on('adminStartMeinSpielRound', ({ roundId } = {}) => {
            if (!isAdmin(socket)) return;                       // Pflicht bei jedem admin*-Event
            if (typeof roundId !== 'string') return;            // Eingaben validieren
            const round = utils.readJsonArray(roundsPath).find(entry => entry.id === roundId);
            if (!round) return;
            secretAnswer = round.answer;                        // Lösung nur privat merken
            Object.assign(state(), { phase: 'PLAYING' });
            emitState();                                        // nach JEDER State-Änderung
        });
    }

    // Alles umziehen, was Teamnamen als Schlüssel ODER als Wert enthält.
    function renameTeam(oldName, newName) {
        renameKey(state().scores, oldName, newName);
        // renameKey(state().andereMapNachTeam, oldName, newName);
        // if (state().buzzerTeam === oldName) state().buzzerTeam = newName;
    }

    return {
        id: 'MEIN_SPIEL',                 // GROSSBUCHSTABEN, eindeutig, = currentScreen
        title: 'Mein Spiel',              // erscheint auf Start-Button und im Intro
        stateKey: 'meinSpielGame',        // Schlüssel in gameState
        clientModule: 'mein-spiel',       // Dateipräfix in public/games/
        // maxScore: null,                // optional, siehe 5.3
        // layout: 'wide',                // optional, siehe 5.3
        // buzzer: true, canBuzz: () => state().phase === 'PLAYING',   // optional
        createState,
        reset,
        register,
        renameTeam
    };
};
```

### 5.3 Optionale Felder und Hooks

| Feld | Bedeutung |
|------|-----------|
| `maxScore` | Höchstpunktzahl. Standard 5. Eine Zahl für ein anderes Limit (z. B. 7). **`null` = unbegrenzt, Anzeige nur "n"** (so bei Kategorien, Diktat, Malen, Bingo, Discord, Realität, Partnerwissen). Frage den Nutzer, nimm nie still den Standard an |
| `layout` | `'default'` (schmal, 500 px), `'medium'` (750 px), `'wide'` (1400 px), `'fullscreen'` (Vollbild, wie Karte). Gilt für die Spieler-Shell. Die Zuschauer-Shell kennt nur Vollbild |
| `buzzer: true` | aktiviert Buzzer. Dazu State-Felder `buzzerLocked: false, buzzerWinner: null, buzzerTeam: null` in `createState()` und in `reset()` mitführen |
| `canBuzz()` | `true`, wenn gerade gebuzzert werden darf (z. B. `phase === 'PLAYING'`). Steuert auch `buzzerOpen` |
| `onBuzz(player)` | nach einem gültigen Buzz (z. B. Timer pausieren) |
| `onBuzzerReset()` | wenn der Admin den Buzzer freigibt |
| `onScoreChanged(team)` | nach `adminAddGamePoint`, vor dem Senden. Für Gewinnregeln (z. B. bei Limit Buzzer sperren) |
| `emitUpdates()` | wird nach Punkte/Reset zusätzlich aufgerufen, wenn das Spiel Sonderkanäle (`io.to(...)`) nutzt |
| `onScreenEnter()` | wenn dieses Spiel aktiv wird (nach `stateUpdate`) |
| `onPlayerRegistered()` | wenn sich ein Spieler anmeldet, während dieses Spiel läuft (private Ansichten nachsenden) |
| `onAdminLogin(socket)`, `onSpectatorLogin(socket)` | Admin/Zuschauer nach dem Login mit Spieldaten versorgen |
| `registerRoutes(app)` | eigene HTTP-Route. Wird derzeit von keinem Spiel genutzt. **Nie** Inhalte oder Lösungen darüber ausliefern |

### 5.4 Kontext `ctx`

| Feld | Zweck |
|------|-------|
| `io`, `gameState` | Socket.IO und zentraler State |
| `adminSockets`, `spectatorSockets` | `Set`s der Socket-IDs |
| `isAdmin(socket)` | Admin-Prüfung |
| `emitState()` | `stateUpdate` an alle senden (berechnet vorher `buzzerOpen`) |
| `createScores()` | `{ [team]: 0 }` für alle aktuellen Teams |
| `byTeam(team => wert)` | Objekt je Team, z. B. `byTeam(() => [])` |
| `teamNames()` | aktuelle Teamnamen |
| `renameKey(map, alt, neu)` | verschiebt einen Teamnamen-Schlüssel |
| `getPlayerName(id)` | Spielername |
| `playerNotes` | Notizen je Spieler (nur Kern nutzt das) |
| `utils` | siehe unten |

`utils`: `MAX_POINTS_PER_GAME` (5), `readJsonFile(pfad)`, `readJsonArray(pfad, filterFn?)`, `isValidTeamName`, `isValidIndex(i, min, max)`, `sanitizeString(text, maxLänge)`, `addScore(scores, team, amount, max)`, `getRandomElements`, `deepClone`.

### 5.5 Regeln

- Jeder `admin*`-Event beginnt mit `if (!isAdmin(socket)) return;`. Der Rauchtest prüft, dass Spieler keine Admin-Events auslösen können.
- Alle Eingaben validieren (Typ, Länge, bekannter Teamname, Index im Bereich).
- **Geheimnisse** (Lösung, Begriff, Rundendaten mit Antworten) bleiben in privaten Variablen im Modul. Jeder Client bekommt `stateUpdate` mit dem ganzen State, im State steht also nur, was alle sehen dürfen. Die Lösung kommt erst beim "Auflösen" in den State.
  - Nur für Admins (z. B. Rundenliste mit Lösungen): Event `getXRounds` mit `if (!isAdmin(socket)) return;` und Antwort `receiveXRounds` (Vorlage: `buchstabensalat.js`).
  - Nur für einzelne Spieler (z. B. eigene Kategorie): `io.to(player.id).emit('xPlayerUpdate', view)`, dazu Hook `onPlayerRegistered` und ein Abruf-Event `getXView` für Seiten, die nach dem Start laden (Vorlage: `teekesselchen.js`).
- Timer: Den manuellen Timer für den Host liefert der Kern (siehe Abschnitt 4), nicht neu bauen. Nur wenn ein Spiel einen Timer **mit Spielfolgen** braucht (z. B. Zug wechselt, Eingaben schließen), baue ihn im Modul: `setInterval`, jede Sekunde `emitState()`, Handle in `reset()` und beim Beenden löschen. Der Client zeigt nur an.
- Teamnamen nie hartkodieren (`'Team 1'`). Nutze `createScores()`, `byTeam()`, `teamNames()`.
- Neue Zustandsfelder immer in `createState()`, damit Reset sie zurücksetzt.
- Event-Namen: `admin<Aktion><Spiel>` für den Admin (`adminStartMeinSpielRound`), `get<Daten>` zum Abrufen, `<Aktion><Spiel>` oder `player<Aktion>` für Spieler. Keine eigenen Punkte-, Reset-, Buzzer-Events.
- Ein Start-Event des Spiels startet eine **Runde**. `adminStartGame` (Spielwechsel) setzt das Spiel nicht zurück.
- Kein `eval`, keine Secrets im Code.

### 5.6 Sonderfall "Bild erraten mit Buzzer"

`server/games/image-guess.js` liefert die gesamte Logik (nächstes Bild, Name aufdecken, Gewinner bei Limit, Admin sieht die Lösung vorab). Ein neues Spiel dieser Art ist nur:

```js
'use strict';

const { createImageGuessGame } = require('./image-guess');

module.exports = function createMeinBilderSpiel(ctx) {
    return createImageGuessGame(ctx, {
        id: 'MEIN_BILDERSPIEL', title: 'Mein Bilderspiel', stateKey: 'meinBilderGame',
        folder: 'mein-bilderspiel',        // public/games/<folder>/<folder>.json + images/
        gameLabel: 'Bild'
    });
};
```

`<folder>.json` ist ein Array mit Namen (Bilder werden nach Dateinamen sortiert zugeordnet) oder mit Objekten `{ "name": "...", "image": "datei.jpg" }`. Bilder liegen in `public/games/<folder>/images/`. Clientseiten sind `image-guess-*` (geteilt). Registry-Eintrag genügt.

### 5.7 Registry

`server/registry.js`: `require('./games/<spiel>')` in `GAME_FACTORIES` an der gewünschten Stelle. Die Position ist die Spielnummer im Intro und auf dem Start-Button. Mehr ist serverseitig nicht nötig.

## 6. Client-Seiten `public/games/<clientModule>-{admin,player,spectator}.html`

Die Shells (`admin.html`, `index.html`, `spectator.html`) laden die Seite per `fetch`, setzen sie in einen Container und führen die `<script>`-Blöcke per `new Function(...)` im **globalen Scope** aus. Die Shell zeigt bereits Punkte, Buzzer, Textfelder, Reset und Punkte-Buttons. Die Seiten enthalten davon **nichts**.

Globale Variablen in Seiten: `socket` (Socket.IO), `Spielshow` (Hilfsobjekt, siehe unten).

### 6.1 Regeln

- Handler: Admin- und Spielerseite `window.onModuleStateUpdate = function(state) {...}`, Zuschauerseite `window.onSpectatorStateUpdate = function(state) {...}`. Der Handler wird bei jedem `stateUpdate` und einmal nach dem Laden mit dem letzten State aufgerufen. Er muss wiederholt ausführbar sein und fehlende Elemente abfangen (`if (!el) return;`).
- Funktionen für `onclick` als `window.name = function() {...}` definieren (sonst nicht erreichbar).
- Daten sofort anfordern (kein `DOMContentLoaded`). Vor jedem `socket.on('x', ...)` ein `socket.off('x')`, sonst läuft der Handler nach erneutem Laden doppelt.
- Eigene Variablen/Funktionen mit spielspezifischem Präfix benennen (alle Seiten teilen den globalen Scope).
- Spielinfos nicht hartkodieren: `const game = Spielshow.getGame(state.currentScreen)` liefert `title`, `stateKey`, `maxScore`, `buzzer`, `layout`. Den Spielstate liest man mit `state[game.stateKey]`.
- Nutzereingaben mit `textContent` setzen, nicht mit `innerHTML`.
- Eingabefelder, die andere nur lesen, sind `readOnly` (nicht `disabled`), damit sie vergrößerbar sind.
- Admin-Seite: `<div class="card">`, Zuschauer-Seite: `<section class="card">`, Spielerseite: kein äußeres `.card` (der Container ist schon eins).
- Gemeinsame Hilfen: `Spielshow.formatScore(punkte, maxScore)`, `Spielshow.playBuzzerSound()`. Die Punkteleiste, den Buzzer und die Notizen rendert die Shell, nicht die Seite.
- Layout ändert man über `layout` im Servermodul, nicht in den Shells.

### 6.2 Vorlagen

Admin (`mein-spiel-admin.html`): spielspezifische Steuerung. Kein Reset-, Punkte- oder Buzzer-Button.

```html
<div class="card">
    <h2>Mein Spiel</h2>
    <select id="msRoundSelect"></select>
    <button onclick="msStartRound()">Runde starten</button>
    <button onclick="msReveal()">Auflösen</button>
    <p id="msAdminStatus">Noch keine Runde aktiv.</p>
</div>

<script>
    socket.off('receiveMsRounds');
    socket.on('receiveMsRounds', rounds => {
        const select = document.getElementById('msRoundSelect');
        if (!select) return;
        select.replaceChildren(...rounds.map(round => {
            const option = document.createElement('option');
            option.value = round.id;
            option.textContent = round.answer;
            return option;
        }));
    });
    socket.emit('getMsRounds');

    window.msStartRound = () => socket.emit('adminStartMeinSpielRound', { roundId: document.getElementById('msRoundSelect').value });
    window.msReveal = () => socket.emit('adminRevealMeinSpiel');

    window.onModuleStateUpdate = function(state) {
        const game = state.meinSpielGame || {};
        const status = document.getElementById('msAdminStatus');
        if (!status) return;
        status.textContent = game.phase === 'IDLE' ? 'Noch keine Runde aktiv.' : `Phase: ${game.phase}`;
    };
</script>
```

Spieler (`mein-spiel-player.html`): zeigt, was Spieler sehen und tun.

```html
<div class="ms-game">
    <h2>Mein Spiel</h2>
    <p id="msPlayerStatus">Warte auf die nächste Runde...</p>
</div>

<script>
    window.onModuleStateUpdate = function(state) {
        const game = state.meinSpielGame || {};
        const status = document.getElementById('msPlayerStatus');
        if (!status) return;
        status.textContent = game.phase === 'PLAYING' ? 'Los geht es!' : 'Warte auf die nächste Runde...';
    };
</script>
```

Zuschauer (`mein-spiel-spectator.html`): große, gut lesbare Darstellung für den Host-Bildschirm.

```html
<section class="card">
    <h2>Mein Spiel</h2>
    <p id="msSpecStatus"></p>
</section>

<script>
    window.onSpectatorStateUpdate = function(state) {
        const game = state.meinSpielGame || {};
        const status = document.getElementById('msSpecStatus');
        if (!status) return;
        status.textContent = game.phase === 'PLAYING' ? 'Läuft...' : 'Warte auf die nächste Runde...';
    };
</script>
```

Private Daten und Sonderkanäle (z. B. eigene Kategorie je Team): in der Spielerseite `socket.off('msPlayerUpdate'); socket.on('msPlayerUpdate', view => {...}); socket.emit('getMsView');` (Vorlage: `teekesselchen-player.html`).

## 7. Inhalte

- JSON im Projektroot (`<spiel>.json`) oder in `public/games/<spiel>/`. Bilder in `public/games/<spiel>/images/`. Beschreibe das Format in einem kurzen Kommentar im Servermodul.
- Dateien in `public/` sind für alle abrufbar. Inhalte mit Lösungen gehören ins Projektroot und werden **nur** per Admin-Event ausgeliefert (`getXRounds`, `if (!isAdmin(socket)) return;`), nie über eine HTTP-Route und nie per `fetch` aus einer Spielseite. Das gilt für alle Spiele. `tests/check-html.js` schlägt an, wenn eine Spielseite eine `.json` per `fetch` lädt, und der Rauchtest prüft, dass keine Inhalts-JSON öffentlich erreichbar ist und Spieler die Abruf-Events nicht nutzen können.
- Ausnahme `public/games/<ordner>/`: Bei Bilder-raten-Spielen (Promis, Drudel) liegen Bilder und Namensliste in `public/`. Bilddateinamen mit dem Lösungswort (z. B. `1_miley_cyrus.jpg`) sind für Spieler in der Browser-Entwicklerkonsole sichtbar. Wer das vermeiden will, nennt die Bilder neutral (`1.jpg`) und ordnet sie über die Namensliste zu.
- Hat der Nutzer keine Inhalte geliefert, lege wenige klar gekennzeichnete Beispielinhalte an und sage das im Ergebnis.

## 8. Tests

`npm run check` führt aus:

1. `eslint` (undefinierte Variablen, ungenutzte Variablen),
2. `tests/check-html.js` (Skript-Syntax aller Seiten, im JS genutzte Element-IDs ohne Gegenstück im HTML, alte Event-Namen),
3. `tests/smoke.js` (echter Server auf Port 3999, mehrere Socket-Clients).

Der Rauchtest prüft für **jedes** Spiel aus `/games.json` automatisch: startbar, Punkt von 0 aus, Punkte nie negativ, Punktelimit (nur wenn `maxScore` nicht `null`), Reset nullt Punkte, Umbenennen zieht Teamdaten um, Spieler können keine Admin-Events auslösen. Ein neues Spiel ist damit schon grundlegend abgedeckt.

Ergänze für spielspezifische Abläufe einen Abschnitt in `tests/smoke.js` **vor** dem Kommentar `// Team umbenennen`, nach dem Muster der vorhandenen (z. B. Buchstabensalat oder Teekesselchen): `admin.emit('adminStartGame', 'MEIN_SPIEL')`, Runde starten, Zustand prüfen, Buzzer testen, Geheimnis nicht im State (`JSON.stringify(admin.state.meinSpielGame)` darf die Lösung nicht enthalten), Auflösen, Reset. Der Test-Spieler `player` ist in `Team 1`, `admin` ist Admin. Hilfsfunktionen: `check(name, bedingung)`, `sleep(ms)`, `once(socket, event)`.

Ein grüner Check ersetzt keinen Blick in den Browser. Sage dem Nutzer, was du **nicht** im Browser geprüft hast.

## 9. Doku nach jedem neuen Spiel

- `README.md`: Spiel unter "Implementierte Spiele" eintragen.
- `AGENTS.md`: Spiel in die Tabelle "Bestehende Spiele" aufnehmen. Neue Erkenntnisse unter "Lessons Learned" festhalten.

## 10. Abnahme-Checkliste (vor "fertig")

- [ ] Alle Pflichtfelder im Modul, Eintrag in `registry.js` an der gewünschten Position
- [ ] `maxScore` und `layout` bewusst gesetzt (mit dem Nutzer geklärt)
- [ ] Jeder `admin*`-Event prüft `isAdmin(socket)`, Eingaben sind validiert
- [ ] Reset setzt wirklich alles zurück (State, Timer, private Variablen, Punkte)
- [ ] Teamnamen nicht hartkodiert, `renameTeam` zieht alle Teamnamen in Schlüsseln und Werten um
- [ ] Lösungen/Geheimnisse stehen nicht im State und nicht in öffentlichen Routen
- [ ] Seiten enthalten keine eigenen Punkte-, Reset-, Buzzer- oder Notiz-Elemente
- [ ] Jede Seite funktioniert bei wiederholtem Aufruf von `onModuleStateUpdate` und nach Spielwechsel
- [ ] `npm run check` ist grün
- [ ] Doku (Abschnitt 9) aktualisiert
- [ ] Ergebnis nennt, was nicht im Browser geprüft wurde

## 11. Bestehendes Spiel ändern

1. Servermodul und die drei Seiten lesen.
2. Änderungen am Standardverhalten (Punkte, Reset, Buzzer, Textfelder, Teams) gehören nach `server/core/` bzw. `public/shared/`, nie in ein einzelnes Spiel.
3. Neue Zustandsfelder in `createState()`, Teamnamen in `renameTeam()`.
4. `npm run check`.

## 12. Fehlersuche und Lessons Learned

- Zeitgesteuerte Abläufe im Client (Rap Battle): Der Server schickt nur `startAt` (Server-Zeit) und Tempo. Jede Ansicht bringt `serverNow` mit, der Client rechnet damit die Uhr um (`RapBattle.createClock`). Private Daten gehen nie über `stateUpdate`, auch nicht an den Rappenden.
- Teamwechsel durch den Admin löst kein `emitUpdates` aus: Spielerseiten mit privaten Ansichten fordern die Ansicht bei geändertem Team neu an (Rap Battle, `getRapBattleView`).
- Punkte lassen sich nicht erhöhen: Prüfung `!scores[team]` statt `=== undefined`.
- Handler wirft ReferenceError: Konstante nicht importiert. Der Server läuft weiter und loggt `Fehler im Event "<name>"`. Der Lint meldet es vorher.
- Update kommt nicht an: falscher Handler-Name für die Seite, `emitState()` vergessen oder nur auf einem Sonderkanal gesendet.
- Button tut nichts: Event-Name oder Parameterform stimmt nicht mit `socket.on` im Server überein (Punkte immer `{ team, amount }`).
- Doppelte Aktionen: `socket.on` ohne vorheriges `socket.off` in einer Seite.
- Reset lässt etwas stehen: Feld fehlt in `createState()`, Timer nicht gestoppt oder private Variable nicht geleert.
- Eingabefeld springt auf alte Größe: Elemente bei jedem Update komplett neu aufbauen. Nur neu aufbauen, wenn sich die Struktur ändert, sonst nur Werte aktualisieren.
- Vollbild-Layout, Timer und Textfelder: Im Vollbild liegt der Timer als Streifen oben und der Textfeld-Streifen unten. Die Seite schrumpft dafür über `--app-height` (und beginnt bei `--app-top`). Vollbild-Seiten dürfen deshalb nicht fest `100vh` verwenden, sondern `var(--app-height, 100vh)`; die Shell setzt `top` über `var(--app-top, 0px)`.
- `EADDRINUSE` im Test: ein alter Test-Server belegt Port 3999.
- Mojibake (kaputte Umlaute) beim Lesen mit älteren PowerShell-Befehlen ist nur Anzeige. Dateien sind UTF-8.

## 13. Bekannte offene Punkte

- Nur Buchstabensalat (Schritt-Takt der Buchstaben) hat noch einen eigenen Timer im Modul. Er ist Spielmechanik und läuft getrennt vom globalen Host-Timer. Alle anderen Spiele nutzen keine eigenen Timer mehr. Folgen wie Phasenwechsel löst der Admin per Button aus (Merken: `adminEndMerkenMemorizing`, Realität: `adminEndRealitaet`, Flaggen: `adminToggleFlaggenLock`, Teekesselchen: `adminCloseTeekesselchenInputs`).
- **Optionales TODO:** Aktionen bei Timer-Ablauf. Idee: Der Admin wählt im Dashboard, was bei 0:00 passieren soll (nichts, Buzzer sperren, Eingaben schließen, Signalton, nächstes Team). Dafür bräuchte jedes Spiel einen kleinen Hook (z. B. onTimerEnd) und die Auswahl im Admin. Bisher bewusst nicht gebaut: Der Host löst Folgen von Hand aus.

## 14. Code-Qualität

Siehe `CLEANCODE.md` und `CODE_QUALITY_ISSUES.md`. Kurz: kleine Funktionen, keine Duplikate (Gemeinsames in `server/core`, `server/games/image-guess.js`, `public/shared`), sprechende Namen, `const`/`let` statt `var`, kein toter Code, keine Secrets im Repository (`.env` ist in `.gitignore`).
