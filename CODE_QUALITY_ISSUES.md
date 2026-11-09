# Code Quality Issues - Spielshow Projekt

Diese Datei dokumentiert bekannte Code-Qualitätsprobleme und schlechte Praktiken im Projekt. Sie dient als Grundlage für schrittweise Verbesserungen.

## 🔴 Kritisch (Sofort beheben) ✅ ALLE ERLEDIGT

### 1. Hardcoded Passwörter ✅ ERLEDIGT
**Problem**: Passwörter waren im Klartext im Code.
```javascript
// server.js
const ADMIN_PASSWORD = "1234";
const SPECTATOR_PASSWORD = "1234";
```
**Risiko**: Sicherheitslücke, Passwörter sind im Repository sichtbar.
**Lösung**: Umgebungsvariablen verwendet.
```javascript
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "1234";
const SPECTATOR_PASSWORD = process.env.SPECTATOR_PASSWORD || "1234";
```

### 2. Verwendung von `eval()` ✅ ERLEDIGT
**Problem**: Dynamische Code-Ausführung in `index.html`.
```javascript
// index.html
scripts.forEach(s => eval(s.innerText));
```
**Risiko**: XSS-Angriffe, Sicherheitslücke, schwer zu debuggen.
**Lösung**: `new Function()` in eigener Funktion verwendet.

### 3. Keine Input-Validierung ✅ ERLEDIGT
**Problem**: Benutzereingaben wurden nicht validiert.
```javascript
// server.js - viele Events ohne Validierung
socket.on('updateDiktatText', text => {
    diktatTexts[socket.id] = String(text || '').slice(0, 500);
});
```
**Risiko**: XSS, Injection-Angriffe, Datenkorruption.
**Lösung**: Alle Eingaben validiert und sanitieren mit `utils.sanitizeString()`.

## 🟡 Hoch (Priorisiert beheben) ✅ TEILWEISE ERLEDIGT

### 4. Globale Variablen
**Problem**: Viele globale Variablen im Server-Code.
```javascript
let playerCounter = 1;
let gameState = { ... };
let playerNotes = {};
```
**Risiko**: Namespace-Pollution, schwer zu testen, Side Effects.
**Lösung**: Module pattern verwenden, State kapseln.
**Status**: Wird schrittweise angegangen.

### 5. Code Duplikation ✅ ERLEDIGT
**Problem**: Gleicher Code wurde mehrfach wiederholt.
```javascript
// Mehrere Spiele haben ähnliche Score-Logik
socket.on('adminAddPromiPoint', ({ team, amount }) => {
    gameState.promiGame.scores[team] = Math.max(0, Math.min(5, ...));
});
socket.on('adminAddDrudelPoint', ({ team, amount }) => {
    gameState.drudelGame.scores[team] = Math.max(0, Math.min(5, ...));
});
```
**Lösung**: Gemeinsame Funktion in `utils.js` erstellt.
```javascript
// utils.js
function addScore(scores, team, amount, max = MAX_POINTS_PER_GAME) {
    scores[team] = Math.max(0, Math.min(max, scores[team] + amount));
}
```

### 6. Lange Funktionen ✅ ERLEDIGT
**Problem**: Funktionen waren zu lang und hatten mehrere Verantwortlichkeiten.
```javascript
// server.js: adminUpdateTeamName war ~100 Zeilen
socket.on('adminUpdateTeamName', ({ oldName, newName }) => {
    // Ändert Team-Namen, Scores, Player-Zuweisungen, etc.
});
```
**Lösung**: Funktionen auf < 30 Zeilen aufgeteilt, Single Responsibility Principle.
**Helper-Funktionen**:
- `renameTeamData(gameState, oldName, newName)` - Umbenennung aller Team-Daten
- `renameTeamPlayers(gameState, oldName, newName)` - Umbenennung von Spieler-Zuweisungen

### 7. Schlechte Fehlerbehandlung ✅ ERLEDIGT
**Problem**: Fehler wurden nur geloggt, nicht behandelt.
```javascript
try {
    const data = JSON.parse(fs.readFileSync(path, 'utf8'));
} catch (e) {
    console.error('Fehler:', e);
    return {};
}
```
**Lösung**: Einheitliche Fehlerbehandlung in `utils.js` mit `readJsonFile()` und `readJsonArray()`.

### 8. Magic Numbers ✅ ERLEDIGT
**Problem**: Zahlen waren nicht erklärt.
```javascript
gameState.promiGame.scores[team] = Math.max(0, Math.min(5, ...));
// Warum 5?
```
**Lösung**: Konstanten in `utils.js` definiert.
```javascript
const MAX_POINTS_PER_GAME = 5;
const MAX_DIKTAT_LENGTH = 500;
const MAX_DISCORD_TARGET_LENGTH = 100;
const MAX_PARTNER_QUESTIONS = 4;
const MAX_ALLOCATION_VALUE = 4;
const TOTAL_ALLOCATION_POINTS = 10;
```

### 9. Inkonsistente Benennung
**Problem**: Vermischte Benennungen (Deutsch/Englisch, camelCase/snake_case).
```javascript
const discordGame = { ... };      // Englisch
const merkenCards = [ ... ];       // Deutsch
const gameIntroDetails = { ... };  // Englisch
```
**Status**: Wird schrittweise angegangen.
**Lösung**: Konsistente Benennung wählen (Englisch empfohlen).

### 10. Keine Typensicherheit
**Problem**: Keine Typenprüfung für Funktionen.
```javascript
function startMerken(duration) {
    // Was ist duration? Number? String?
}
```
**Lösung**: TypeScript oder JSDoc verwenden.

## 🟢 Mittel (Bei Gelegenheit beheben)

### 11. Veraltete JavaScript-Syntax
**Problem**: Verwendung von `var` statt `const`/`let`.
```javascript
var sel = document.getElementById('bsalatRoundSelect');
```
**Lösung**: Immer `const` oder `let` verwenden.

### 12. Unnötige Komplexität
**Problem**: Zu viele verschachtelte Bedingungen.
```javascript
if (gameState.flaggenGame && gameState.flaggenGame.scores && gameState.flaggenGame.scores[team] !== undefined) {
    // ...
}
```
**Lösung**: Optional Chaining verwenden.
```javascript
if (gameState.flaggenGame?.scores?.[team] !== undefined) {
    // ...
}
```

### 13. Fehlende Kommentare für komplexe Logik
**Problem**: Komplexe Algorithmen sind nicht dokumentiert.
```javascript
// Warum wird hier randomisiert?
const selected = available.sort(() => Math.random() - 0.5).slice(0, 4);
```
**Lösung**: Kommentare für "Warum", nicht für "Was".

### 14. CSS in HTML
**Problem**: Styles sind direkt in HTML-Dateien.
```html
<style>
    .card { ... }
</style>
```
**Lösung**: Externe CSS-Dateien verwenden.

### 15. Keine Error Boundaries
**Problem**: Fehler in einem Spiel brechen die ganze Seite.
**Lösung**: Error Boundaries für Module implementieren.

## 📋 Niedrig (Wartung)

### 16. Veraltete Abhängigkeiten
**Problem**: `package.json` hat keine Versionsspezifikation.
```json
"express": "^5.2.1"
```
**Lösung**: Versionsnummern pinen, `npm audit` regelmäßig laufen lassen.

### 17. Fehlende Tests
**Problem**: Keine Unit Tests vorhanden.
**Lösung**: Jest oder Mocha für Tests hinzufügen.

### 18. Keine Dokumentation für API-Endpunkte
**Problem**: Socket.IO Events sind nicht dokumentiert.
**Lösung**: API-Dokumentation erstellen (z.B. mit Swagger).

### 19. Ineffiziente DOM-Manipulation
**Problem**: Häufige DOM-Updates.
```javascript
scores.innerHTML = teams.map(team => `...`).join('');
```
**Lösung**: DocumentFragment oder Virtual DOM verwenden.

### 20. Keine Linting/Formatting
**Problem**: Kein ESLint oder Prettier konfiguriert.
**Lösung**: ESLint und Prettier hinzufügen und automatisieren.

## 📊 Fortschritt

| Issue | Status | Priorität | Geplant | Erledigt |
|-------|--------|-----------|---------|----------|
| Hardcoded Passwörter | ✅ Erledigt | Hoch | Sofort | 2024-11-08 |
| eval() Verwendung | ✅ Erledigt | Hoch | Sofort | 2024-11-08 |
| Input-Validierung | ✅ Erledigt | Hoch | Sofort | 2024-11-08 |
| Globale Variablen | 🟡 Offene | Mittel | Kurzfristig | - |
| Code Duplikation | ✅ Erledigt | Hoch | Sofort | 2024-11-08 |
| Lange Funktionen | ✅ Erledigt | Hoch | Sofort | 2024-11-08 |
| Schlechte Fehlerbehandlung | ✅ Erledigt | Hoch | Sofort | 2024-11-08 |
| Magic Numbers | ✅ Erledigt | Hoch | Sofort | 2024-11-08 |
| Inkonsistente Benennung | 🟡 Offene | Mittel | Mittelfristig | - |
| Typensicherheit | 🟡 Offene | Mittel | Mittelfristig | - |
| Veraltete Syntax | 🟢 Offene | Niedrig | Langfristig | - |
| Fehlende Tests | 🟢 Offene | Niedrig | Langfristig | - |

## 🛠️ Refactoring-Checkliste

Bei Änderungen immer prüfen:

- [ ] Funktion hat eine klare Verantwortung (Single Responsibility)
- [ ] Funktion ist < 20 Zeilen (idealerweise)
- [ ] Keine Magic Numbers (Konstanten verwendet)
- [ ] Klare Benennung (intention-revealing)
- [ ] Keine Code Duplikation (DRY)
- [ ] Fehler werden behandelt
- [ ] Input wird validiert
- [ ] Keine globalen Variablen (wo möglich)
- [ ] Kommentare erklären "Warum", nicht "Was"
- [ ] Code ist selbsterklärend

## 📚 Referenzen

- [Clean Code Principles](./CLEANCODE.md)
- [AGENTS.md](./AGENTS.md) - Projektübersicht
- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)
- [JavaScript Standard Style](https://standardjs.com/)

## 🔐 Umgebungsvariablen einrichten

Erstelle eine `.env` Datei im Projektverzeichnis:

```env
ADMIN_PASSWORD=dein_sicheres_admin_passwort
SPECTATOR_PASSWORD=dein_sicheres_spectator_passwort
```

**Wichtig**: `.env` in `.gitignore` aufnehmen, damit Passwörter nicht ins Repository kommen!

---

**Letzte Aktualisierung**: 2024-11-08  
**Verantwortlich**: Entwicklungsteam
