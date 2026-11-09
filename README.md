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
node server.js
```

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

# 📝 Nächste TODOs:
2. Frage zu Bild
3. Buchstabensalat
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

# Spiele für Spielshow 07.11.2026
1. Listenwissen - Punktezähler waren bugged - 3,5-4/5
2. Wo ist das auf der Karte? - Textfelder fehlen, Punktezähler waren bugged - 4/5
3. Begriffe Kategorien zuordnen - evtl Zeitlimit für die teams jeweils abwechselnd, so 15 sek - 3/5, mehr Begriffe die man kennt, weniger Begriffe
4. Diktat - groß-kleinschreibung war nicht beachtet - 4/5, ohne Felix
5. Blindes Malen - Text unter der Box, am Ende immer Reveal, maler wechseln führt zu error - 5/5
6. Partnerwissen - Antworten reveal noch einbauen - 4/5
7. Referatbingo - thema den leuten anzeigen die begriffe eingeben, Punktezähler bugged - 4,5-5/5
8. Das kam bei Discord nicht an - keine Fehler - 4/5 auch gut als letztes Spiel
9. Promis raten - Buzzer villeicht nicht verschieben - 4/5 -> andere Sachen z.B. Viedeospielcharaktere oder so

generell: 
- Eingabefelder im Zuschauermodus sind nicht vergrößerbar
- Beim reinladen sollte man standardmäßig in keinem Team sein

# Spiele für übernächste Spielshow
- Drudel
- Morsen
- Merksätze
- Flaggen bauen
- Tabu
- Merken
