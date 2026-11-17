---
inclusion: always
---

# Spielshow: Arbeitsregeln

- Vor jeder Änderung `AGENTS.md` lesen. Sie enthält Architektur, Standard und die komplette Anleitung für neue Spiele. Fehlen dem Nutzer-Auftrag Angaben (Höchstpunktzahl, Buzzer, Timer, Admin-Buttons, Inhalte), frage nach.
- Punkte, Reset, Buzzer, Notizen und Teamzuweisung gehören in `server/core` und `public/shared`, nie in ein einzelnes Spiel. Neue Spiele nutzen die generischen Events (`adminAddGamePoint`, `adminResetGame`, `pressBuzzer`).
- Jedes Spielmodul in `server/games/` liefert `id`, `title`, `stateKey`, `clientModule`, `createState`, `reset`, `register`, `renameTeam`. Neue Spiele zusätzlich in `server/registry.js` eintragen.
- Reset bedeutet kompletter Startzustand inklusive Punkten. Neue State-Felder gehören in `createState()`.
- Teamnamen nie hartkodieren. Jeder `admin*`-Event prüft `isAdmin(socket)`. Lösungen bleiben im Server.
- Nach jeder Änderung `npm run check` ausführen und das Ergebnis berichten.
