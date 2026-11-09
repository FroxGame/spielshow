# AGENTS.md - Spielshow Projekt

## Projektübersicht
Dies ist eine interaktive Spielshow-Webanwendung für private Veranstaltungen mit Freunden. Die Anwendung besteht aus einem Node.js/Express-Server mit Socket.IO für Echtzeit-Kommunikation und mehreren HTML-Spielen.

## Architektur

### Backend
- **Server**: `server.js` (Node.js mit Express und Socket.IO)
- **Daten**: JSON-Dateien für Spielinhalte (`*.json`)
- **Modulare Spiele**: Separate HTML-Dateien in `public/games/`

### Frontend
- **Hauptseite**: `public/index.html` (Spieler & Zuschauer)
- **Admin**: `public/admin.html`
- **Spielmodule**: `public/games/[spiel]-admin.html`, `[spiel]-player.html`, `[spiel]-spectator.html`

## Spielmodi

| Spiel | ID | Beschreibung |
|-------|-----|--------------|
| Listenwissen | LISTENWISSEN | Wörter erraten |
| Wo ist das auf der Karte? | KARTE | Orte auf Karte zeigen |
| Begriffe Kategorien zuordnen | KATEGORIEN | Drag & Drop Kategorien |
| Diktat | DIKTAT | Sätze tippen |
| Blindes Malen | MALEN | Begriffe malen |
| Ich weiß, was mein Partner weiß | PARTNERWISSEN | Partnerfragen |
| Referat Bingo | BINGO | Bingo mit Referatsthemen |
| Das kam bei Discord nicht an | DISCORD_GAME | Hinweise raten |
| Promis raten | PROMI_RATEN | Promi-Bilder erraten |
| Drudel | DRUDEL | Verwaschene Bilder |
| Merken | MERKEN | 30 Karten merken |
| Ist es real oder nicht? | REALITAET | Bilder bewerten |
| Flaggen bauen | FLAGGEN | Flaggen zusammenbauen |
| Buchstabensalat | BUCHSTABENSALAT | Buchstaben anordnen |

## Wichtige Konzepte

### State Management
- **Zentraler gameState** in `server.js` verwaltet alle Spielzustände
- **Module-spezifische States**: `discordGame`, `promiGame`, `drudelGame`, `diktatGame`, `partnerGame`, `categoryGame`, `flaggenGame`, `buchstabensalatGame`, `merkenGame`, `realitaetGame`
- **Team-Scores**: Jedes Spiel hat eigene Scores pro Team

### Socket.IO Events

#### Client → Server
- `registerAsPlayer`: Spieler verbindet sich
- `adminLogin`: Admin-Authentifizierung
- `spectatorLogin`: Zuschauer-Authentifizierung
- `adminStartGame`: Spiel starten
- `admin*`: Admin-spezifische Events (z.B. `adminNextPromiImage`)
- `player*`: Spieler-spezifische Events (z.B. `pressPromiBuzzer`)

#### Server → Client
- `stateUpdate`: Gesamter State
- `*AdminUpdate`: Admin-spezifische Updates
- `*PlayerUpdate`: Spieler-spezifische Updates
- `*SpectatorUpdate`: Zuschauer-Updates

### Authentifizierung
- **Admin-Passwort**: `ADMIN_PASSWORD = "1234"` (in `server.js`)
- **Spectator-Passwort**: `SPECTATOR_PASSWORD = "1234"` (in `server.js`)
- **Wichtig**: Passwörter sollten aus der Umgebung gelesen werden!

## Dateistruktur

```
spielshow/
├── server.js                 # Hauptserver
├── *.json                    # Spielinhalte
│   ├── bingo.json
│   ├── discord.json
│   ├── diktat.json
│   ├── flaggen.json
│   ├── karte.json
│   ├── kategorien.json
│   ├── malen.json
│   ├── partnerwissen.json
│   └── buchstabensalat.json
├── listenwissen.js           # Modul für Listenwissen
├── package.json
├── public/
│   ├── index.html            # Spieler/Spectator
│   ├── admin.html            # Admin
│   ├── karte-config.js       # Kartenkonfiguration
│   ├── europe_land_clean.js  # Europakarte
│   └── games/
│       ├── [spiel]-admin.html
│       ├── [spiel]-player.html
│       ├── [spiel]-spectator.html
│       ├── drudel/           # Drudel-Bilder
│       ├── promis/           # Promi-Bilder
│       └── realitaet/        # Realität-Bilder
```

## Best Practices für Erweiterungen

### Neue Spiele hinzufügen

1. **JSON-Daten erstellen**: `public/games/[spiel]/[spiel].json`
2. **Manifest erstellen**: `[spiel].json` mit Bild-Liste
3. **Server-Logik**:
   - Game State im `gameState` Objekt hinzufügen
   - Socket.IO Events für Admin und Spieler hinzufügen
   - Emit-Funktionen für State-Updates erstellen
4. **HTML-Dateien**:
   - `[spiel]-admin.html`: Admin-Steuerung
   - `[spiel]-player.html`: Spieler-Ansicht
   - `[spiel]-spectator.html`: Zuschauer-Ansicht
5. **Hauptseite aktualisieren**:
   - In `index.html`: Module-Map erweitern
   - In `server.js`: `gameIntroDetails` erweitern
   - In `admin.html`: Start-Buttons hinzufügen

### Code-Qualität

- **DRY (Don't Repeat Yourself)**: Gemeinsame Funktionen extrahieren
- **KISS (Keep It Simple)**: Einfache Lösungen bevor komplexe
- **YAGNI (You Aren't Gonna Need It)**: Nicht für hypothetische Anforderungen entwickeln
- **Modularität**: Spiele sollten unabhängig voneinander sein

### Sicherheit

- **Passwörter**: Aus Umgebungsvariablen lesen (`process.env.ADMIN_PASSWORD`)
- **Input-Validierung**: Alle Benutzereingaben validieren
- **Sandboxing**: `eval()` vermeiden (aktuell in `index.html` verwendet)

### Performance

- **State-Updates**: Nur notwendige Daten emitieren
- **Timer**: Intervalle bei Spielende sauber löschen
- **Speicher**: Alte Daten bereinigen (z.B. `diktatTexts`)

## Entwicklungsumgebung

### Installation
```bash
npm install
```

### Starten
```bash
node server.js
```

### Zugriffsadressen
- Admin: `http://localhost:3000/admin.html`
- Spieler: `http://localhost:3000/`
- Zuschauer: `http://localhost:3000/spectator.html`

## Häufige Aufgaben

### Teamnamen ändern
- Admin Panel → Teamverwaltung → Namen bearbeiten
- Server-seitig: `adminUpdateTeamName` Event

### Spieler zuweisen
- Admin Panel → Spielerliste → Team zuweisen
- Server-seitig: `adminUpdatePlayerTeam` Event

### Spielstand anpassen
- Admin Panel: +/- Buttons pro Spiel
- Server-seitig: `adminAdd*Point` Events

### Spielinhalte bearbeiten
- JSON-Dateien in Projektwurzel bearbeiten
- Bilder in `public/games/[spiel]/images/` hinzufügen

## Troubleshooting

### Spieler verbinden sich nicht
- Socket.IO Connection prüfen
- Browser-Konsole auf Fehler untersuchen
- `gameState.players` im Server prüfen

### Spiel startet nicht
- `gameIntroDetails` in `server.js` prüfen
- Module-Map in `index.html` prüfen
- Admin-Login erfolgreich?

### Timer läuft weiter
- `clearInterval()` bei Reset aufrufen
- Timer-IDs speichern (`flaggenTimerInterval`, etc.)

## Wichtige Hinweise

⚠️ **Kritisch**:
- `eval()` in `index.html` wird für dynamische Scripts verwendet → Sicherheitsrisiko!
- Passwörter sind im Klartext in `server.js` → Umgebungsvariablen verwenden!
- Keine Input-Validierung bei vielen Events → XSS-Risiko!

✅ **Empfohlen**:
- Code nach CLEANCODE.md refaktorisieren
- Unit Tests hinzufügen
- Environment Variables für Konfiguration
- Error Logging implementieren

## Versionierung
- Version: 1.0.0
- Letzte Änderung: 2024
- Node.js: >= 14.x

## Lizenz
ISC (siehe package.json)
