'use strict';
// Rauchtest: startet den echten Server (eigener Port) und prueft zentrale Ablaeufe ueber Socket.IO.
// Aufruf: npm test
const path = require('path');
const { spawn } = require('child_process');
const { io } = require('socket.io-client');

const PORT = 3999;
const URL = `http://localhost:${PORT}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok }); console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ' ' + extra}`); };

const server = spawn('node', ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(PORT), ADMIN_PASSWORD: 'a', SPECTATOR_PASSWORD: 's' }
});
let serverLog = '';
server.stdout.on('data', d => { serverLog += d; });
server.stderr.on('data', d => { serverLog += d; });

function connect() {
    return new Promise((resolve, reject) => {
        const s = io(URL, { transports: ['websocket'], reconnection: false });
        s.state = null;
        s.intros = [];
        s.on('stateUpdate', st => { s.state = JSON.parse(JSON.stringify(st)); });
        s.on('gameIntro', i => s.intros.push(i));
        s.on('connect', () => resolve(s));
        s.on('connect_error', reject);
    });
}

const once = (socket, event) => new Promise(resolve => socket.once(event, resolve));
const sumScores = scores => Object.values(scores).reduce((a, b) => a + b, 0);

(async () => {
    for (let i = 0; i < 50; i++) { if (serverLog.includes('Server l')) break; await sleep(200); }
    await sleep(300);
    const admin = await connect();
    const player = await connect();
    const spectator = await connect();

    const games = await fetch(`${URL}/games.json`).then(r => r.json());
    check('games.json liefert Spiele mit eindeutigen IDs', games.length > 0 && new Set(games.map(g => g.id)).size === games.length);
    check('games.json: Pflichtfelder', games.every(g => g.id && g.title && g.stateKey && g.clientModule && g.number));

    admin.emit('adminLogin', 'wrong');
    check('Falsches Admin-Passwort wird abgelehnt', (await once(admin, 'adminAuthResult')).success === false);
    admin.emit('adminLogin', 'a');
    check('Admin-Login klappt', (await once(admin, 'adminAuthResult')).success === true);
    spectator.emit('spectatorLogin', 's');
    check('Zuschauer-Login klappt', (await once(spectator, 'spectatorAuthResult')).success === true);

    player.emit('registerAsPlayer');
    await sleep(300);
    check('Spieler registriert', Boolean(admin.state && Object.keys(admin.state.players).length === 1));
    check('Neuer Spieler ist in keinem Team', admin.state.players[player.id].team === null);
    player.emit('pressBuzzer');
    admin.emit('adminUpdatePlayerTeam', { socketId: player.id, team: 'Team 1' });
    await sleep(200);
    check('Admin weist Team zu', admin.state.players[player.id].team === 'Team 1');
    admin.emit('adminUpdatePlayerTeam', { socketId: player.id, team: '' });
    await sleep(150);
    check('Admin entfernt Team wieder', admin.state.players[player.id].team === null);
    admin.emit('adminUpdatePlayerTeam', { socketId: player.id, team: 'Team 1' });
    await sleep(150);

    // Admin-Schutz
    player.emit('adminAddGamePoint', { team: 'Team 1', amount: 1 });
    player.emit('adminStartGame', 'PROMI_RATEN');
    player.emit('adminResetGame');
    player.emit('adminUpdateTeamName', { oldName: 'Team 1', newName: 'Hack' });
    await sleep(300);
    check('Spieler kann keine Admin-Events ausführen', admin.state.currentScreen === 'WAITING' && Boolean(admin.state.teams['Team 1']));

    // Textfelder (Notizen): globaler Schalter, nur Admin
    check('Textfelder sind standardmäßig aus', admin.state.notesEnabled === false);
    player.emit('adminSetNotesEnabled', true);
    await sleep(150);
    check('Spieler kann Textfelder nicht einschalten', admin.state.notesEnabled === false);
    admin.emit('adminSetNotesEnabled', 'ja');
    await sleep(150);
    check('Ungültiger Wert wird ignoriert', admin.state.notesEnabled === false);
    admin.emit('adminSetNotesEnabled', true);
    await sleep(150);
    check('Admin schaltet Textfelder ein', admin.state.notesEnabled === true && player.state.notesEnabled === true);
    const notesSeen = new Promise(resolve => spectator.once('spectatorNotesUpdate', resolve));
    player.emit('updatePlayerNote', 'Hallo Team');
    const notes = await notesSeen;
    check('Notiz erscheint beim Zuschauer', JSON.stringify(notes).includes('Hallo Team'));
    admin.emit('adminSetNotesEnabled', false);
    await sleep(150);
    check('Admin schaltet Textfelder aus', admin.state.notesEnabled === false);
    // Globaler Timer: manuell, nur Admin, keine Folgen bei Ablauf
    check('Timer standardmäßig aus, 30 Sekunden', admin.state.timer.enabled === false && admin.state.timer.duration === 30 && admin.state.timer.remaining === 30);
    player.emit('adminSetTimerEnabled', true);
    player.emit('adminStartTimer');
    await sleep(150);
    check('Spieler kann den Timer nicht steuern', admin.state.timer.enabled === false && admin.state.timer.running === false);
    admin.emit('adminSetTimerEnabled', 'ja');
    admin.emit('adminSetTimerDuration', 0);
    admin.emit('adminSetTimerDuration', 'abc');
    await sleep(150);
    check('Ungültige Timer-Werte werden ignoriert', admin.state.timer.enabled === false && admin.state.timer.duration === 30);
    admin.emit('adminStartGame', 'PROMI_RATEN');
    admin.emit('adminSetTimerEnabled', true);
    admin.emit('adminSetTimerDuration', 3);
    await sleep(150);
    check('Timer einschalten und Zeit einstellen', admin.state.timer.enabled === true && admin.state.timer.duration === 3 && admin.state.timer.remaining === 3);
    admin.emit('adminStartTimer');
    await sleep(1300);
    check('Timer läuft herunter', admin.state.timer.running === true && admin.state.timer.remaining < 3);
    admin.emit('adminPauseTimer');
    await sleep(100);
    const pausedAt = admin.state.timer.remaining;
    await sleep(1200);
    check('Pause hält die Zeit an', admin.state.timer.running === false && admin.state.timer.remaining === pausedAt);
    admin.emit('adminStartTimer');
    await sleep(100);
    check('Start setzt nach Pause fort', admin.state.timer.running === true && admin.state.timer.remaining <= pausedAt);
    await sleep(3300);
    check('Bei Ablauf stoppt der Timer bei 0', admin.state.timer.running === false && admin.state.timer.remaining === 0);
    check('Ablauf löst nichts im Spiel aus', admin.state.currentScreen === 'PROMI_RATEN' && admin.state.promiGame.buzzerLocked === false && admin.state.promiGame.winnerTeam === null);
    admin.emit('adminResetTimer');
    await sleep(100);
    check('Zurücksetzen stellt die eingestellte Zeit wieder her', admin.state.timer.remaining === 3 && admin.state.timer.running === false);
    admin.emit('adminStartTimer');
    await sleep(200);
    admin.emit('adminSetTimerEnabled', false);
    await sleep(150);
    check('Ausschalten pausiert den Timer', admin.state.timer.enabled === false && admin.state.timer.running === false);
    admin.emit('adminSetTimerDuration', 30);
    admin.emit('adminResetTimer');
    await sleep(100);

    // Jedes Spiel: starten, Punkt von 0 aus, generischer Reset nullt Punkte
    for (const game of games) {
        admin.emit('adminStartGame', game.id);
        await sleep(100);
        check(`Start: ${game.id}`, admin.state.currentScreen === game.id && admin.intros.some(i => i.screen === game.id));
        admin.emit('adminAddGamePoint', { team: 'Team 1', amount: 1 });
        await sleep(100);
        const after = admin.state[game.stateKey].scores['Team 1'];
        check(`Punkt von 0 aus: ${game.id}`, after === 1, String(after));
        admin.emit('adminAddGamePoint', { team: 'Team 1', amount: -1 });
        admin.emit('adminAddGamePoint', { team: 'Team 1', amount: -1 });
        await sleep(100);
        check(`Punkte nie negativ: ${game.id}`, admin.state[game.stateKey].scores['Team 1'] === 0);
        if (game.maxScore !== null) {
            for (let i = 0; i < game.maxScore + 3; i++) admin.emit('adminAddGamePoint', { team: 'Team 2', amount: 1 });
            await sleep(150);
            check(`Punkte-Limit ${game.maxScore}: ${game.id}`, admin.state[game.stateKey].scores['Team 2'] === game.maxScore, String(admin.state[game.stateKey].scores['Team 2']));
        }
        admin.emit('adminResetGame');
        await sleep(100);
        check(`Reset nullt Punkte: ${game.id}`, sumScores(admin.state[game.stateKey].scores) === 0);
    }
    check('Intro-Nummer passt zur Spielnummer', games.every(g => admin.intros.some(i => i.screen === g.id && i.number === g.number)) && games.map(g => g.number).join(',') === Array.from({ length: games.length }, (_, i) => i + 1).join(','));

    admin.emit('adminAddTeamPoint', { team: 'Team 1', amount: 1 });
    await sleep(80);
    check('Gesamtpunkte von 0 aus', admin.state.teams['Team 1'].score === 1);

    // Promis: Bild, Buzzer, Sperre, Reset des Buzzers, Gewinner bei Limit
    admin.emit('adminStartGame', 'PROMI_RATEN');
    player.emit('pressBuzzer');
    await sleep(100);
    check('Promis: Buzzer ohne Bild wird abgelehnt', admin.state.promiGame.buzzerWinner === null);
    admin.emit('adminNextImage');
    await sleep(100);
    check('Promis: nächstes Bild', Boolean(admin.state.promiGame.currentImage));
    player.emit('pressBuzzer');
    await sleep(100);
    check('Promis: Buzzer vergibt Gewinner mit Team', Boolean(admin.state.promiGame.buzzerWinner) && admin.state.promiGame.buzzerTeam === 'Team 1');
    admin.emit('adminResetBuzzer');
    await sleep(100);
    check('Promis: Buzzer-Reset gibt frei', admin.state.promiGame.buzzerWinner === null && admin.state.promiGame.buzzerLocked === false);
    for (let i = 0; i < 5; i++) admin.emit('adminAddGamePoint', { team: 'Team 1', amount: 1 });
    await sleep(150);
    check('Promis: 5 Punkte setzen Gewinner und sperren Buzzer', admin.state.promiGame.winnerTeam === 'Team 1' && admin.state.promiGame.buzzerLocked === true);
    admin.emit('adminResetGame');
    await sleep(100);
    check('Promis: Reset leert Bild', admin.state.promiGame.currentImage === '' && admin.state.promiGame.winnerTeam === null);

    // Drudel
    admin.emit('adminStartGame', 'DRUDEL');
    admin.emit('adminNextImage');
    await sleep(100);
    player.emit('pressBuzzer');
    await sleep(100);
    check('Drudel: Buzzer', Boolean(admin.state.drudelGame.buzzerWinner));
    admin.emit('adminResetGame');

    // Diktat: Gross-/Kleinschreibung zaehlt
    let diktatView = null;
    admin.on('diktatAdminUpdate', st => { diktatView = st; });
    admin.emit('adminStartGame', 'DIKTAT');
    admin.emit('adminStartDiktatRound', 'Das ist ein Test');
    await sleep(150);
    check('Diktat: Runde startet', diktatView && diktatView.phase === 'WRITING');
    player.emit('updateDiktatText', 'das ist ein test');
    await sleep(100);
    admin.emit('adminCloseDiktat');
    admin.emit('adminShowDiktatAnswers');
    await sleep(200);
    const words = diktatView && diktatView.players[0] && diktatView.players[0].words;
    check('Diktat: Kleinschreibung statt Großschreibung ist falsch', words && words[0].correct === false && words[1].correct === true && words[3].correct === false, JSON.stringify(words));
    admin.emit('adminResetGame');
    await sleep(100);
    check('Diktat: Reset', diktatView.phase === 'IDLE' && diktatView.round === 0);

    // Listenwissen: Punkte bleiben beim Listenwechsel
    admin.emit('adminStartGame', 'LISTENWISSEN');
    admin.emit('adminAddGamePoint', { team: 'Team 1', amount: 1 });
    const lists = await new Promise(resolve => { admin.once('receiveWordLists', resolve); admin.emit('getWordLists'); });
    const listKey = Object.keys(lists)[0];
    admin.emit('adminStartWordGame', listKey);
    await sleep(150);
    check('Listenwissen: Liste geladen', admin.state.listenwissenGame.wordGameData.length > 0);
    check('Listenwissen: Punkte bleiben beim Listenwechsel', admin.state.listenwissenGame.scores['Team 1'] === 1);
    admin.emit('adminResetGame');
    await sleep(100);
    check('Listenwissen: Reset leert Liste', admin.state.listenwissenGame.wordGameData.length === 0 && admin.state.listenwissenGame.scores['Team 1'] === 0);

    // Merken: Ende bei 7 Punkten
    admin.emit('adminStartGame', 'MERKEN');
    admin.emit('adminStartMerken');
    await sleep(1300);
    check('Merken: Merkphase läuft ohne eigenen Timer weiter', admin.state.merkenGame.phase === 'MEMORIZING' && !('remaining' in admin.state.merkenGame));
    admin.emit('adminEndMerkenMemorizing');
    await sleep(150);
    check('Merken: Admin beendet die Merkphase', admin.state.merkenGame.phase === 'PLAYING');
    for (let i = 0; i < 7; i++) admin.emit('adminAddGamePoint', { team: 'Team 1', amount: 1 });
    await sleep(200);
    check('Merken: bei 7 Punkten FINISHED', admin.state.merkenGame.phase === 'FINISHED');
    admin.emit('adminResetGame');
    await sleep(100);
    check('Merken: Reset', admin.state.merkenGame.phase === 'IDLE');

    // Buchstabensalat (neu): Runde, Pausieren beim Buzzer, Aufloesen
    admin.emit('adminStartGame', 'BUCHSTABENSALAT');
    const bsRounds = await new Promise(resolve => { admin.once('receiveBuchstabensalatRounds', resolve); admin.emit('getBuchstabensalatRounds'); });
    check('Buchstabensalat: Runden per Admin-Event', bsRounds.length > 0);
    const playerDenied = await Promise.race([
        new Promise(resolve => { player.once('receiveBuchstabensalatRounds', () => resolve(false)); player.emit('getBuchstabensalatRounds'); }),
        sleep(300).then(() => true)
    ]);
    check('Buchstabensalat: Spieler bekommt keine Lösungen', playerDenied === true);
    admin.emit('adminStartBuchstabensalatRound', { roundId: bsRounds[0].id, duration: 1 });
    await sleep(1500);
    const stepBefore = admin.state.buchstabensalatGame.step;
    check('Buchstabensalat: Schritte laufen, Lösung bleibt verborgen', stepBefore >= 1 && admin.state.buchstabensalatGame.answer === '');
    player.emit('pressBuzzer');
    await sleep(150);
    const stepAtBuzz = admin.state.buchstabensalatGame.step;
    await sleep(1500);
    check('Buchstabensalat: Buzzer pausiert die Auflösung', admin.state.buchstabensalatGame.buzzerWinner && admin.state.buchstabensalatGame.step === stepAtBuzz);
    admin.emit('adminResetBuzzer');
    await sleep(1500);
    check('Buchstabensalat: nach Buzzer-Reset geht es weiter', admin.state.buchstabensalatGame.step > stepAtBuzz);
    admin.emit('adminRevealBuchstabensalat');
    await sleep(150);
    check('Buchstabensalat: Auflösen zeigt Lösung', admin.state.buchstabensalatGame.phase === 'REVEALED' && admin.state.buchstabensalatGame.answer === bsRounds[0].answer);
    admin.emit('adminResetGame');
    await sleep(100);
    check('Buchstabensalat: Reset', admin.state.buchstabensalatGame.phase === 'IDLE' && admin.state.buchstabensalatGame.answer === '');

    // Beugen: Verb, Form zeigen, Buzzer erst nach Form, Aufdecken, Reset
    admin.emit('adminStartGame', 'BEUGEN');
    const beugenRounds = await new Promise(resolve => { admin.once('receiveBeugenRounds', resolve); admin.emit('getBeugenRounds'); });
    check('Beugen: Runden per Admin-Event', beugenRounds.length > 0);
    const beugenDenied = await Promise.race([
        new Promise(resolve => { player.once('receiveBeugenRounds', () => resolve(false)); player.emit('getBeugenRounds'); }),
        sleep(300).then(() => true)
    ]);
    check('Beugen: Spieler bekommt keine Lösungen', beugenDenied === true);
    admin.emit('adminStartBeugenRound', { roundId: beugenRounds[0].id });
    await sleep(150);
    const beugenGame = () => admin.state.beugenGame;
    check('Beugen: Verb sichtbar, Form und Lösung verborgen', beugenGame().verb === beugenRounds[0].verb && beugenGame().form === '' && !JSON.stringify(beugenGame()).includes(beugenRounds[0].answer));
    check('Beugen: Buzzer vor Form gesperrt', admin.state.beugenGame.buzzerOpen === false);
    admin.emit('adminShowBeugenForm');
    await sleep(150);
    check('Beugen: Form sichtbar, Buzzer offen', beugenGame().form === beugenRounds[0].form && beugenGame().buzzerOpen === true);
    admin.emit('adminRevealBeugen');
    await sleep(150);
    check('Beugen: Aufdecken zeigt Lösung', beugenGame().phase === 'REVEALED' && beugenGame().answer === beugenRounds[0].answer);
    admin.emit('adminResetGame');
    await sleep(100);
    check('Beugen: Reset', beugenGame().phase === 'IDLE' && beugenGame().answer === '' && beugenGame().verb === '');

    // Songtexte: 3 Startwoerter, Wort fuer Wort aufdecken, Teamwechsel, ganzen Text aufdecken, Reset
    admin.emit('adminStartGame', 'SONGTEXTE');
    const songtexteSongs = await new Promise(resolve => { admin.once('receiveSongtexteSongs', resolve); admin.emit('getSongtexteSongs'); });
    check('Songtexte: Songs per Admin-Event', songtexteSongs.length > 0);
    const songtexteDenied = await Promise.race([
        new Promise(resolve => { player.once('receiveSongtexteSongs', () => resolve(false)); player.emit('getSongtexteSongs'); }),
        sleep(300).then(() => true)
    ]);
    check('Songtexte: Spieler bekommt keine Songliste', songtexteDenied === true);
    const songtexteNext = new Promise(resolve => admin.once('songtexteNextWord', resolve));
    admin.emit('adminStartSongtexteSong', { songId: songtexteSongs[0].id });
    const songtexteNextInfo = await songtexteNext;
    await sleep(150);
    const songtexteGame = () => admin.state.songtexteGame;
    check('Songtexte: drei Wörter sichtbar', songtexteGame().phase === 'PLAYING' && songtexteGame().revealed.length === 3);
    check('Songtexte: nächstes Wort nur für Admin, nicht im State', typeof songtexteNextInfo.word === 'string'
        && !JSON.stringify(songtexteGame()).includes(`"${songtexteNextInfo.word}"`));
    admin.emit('adminRevealSongtexteWord');
    await sleep(150);
    check('Songtexte: Wort aufgedeckt', songtexteGame().revealed.length === 4);
    admin.emit('adminRevealSongtexteAll');
    await sleep(150);
    check('Songtexte: Aufdecken zeigt alles', songtexteGame().phase === 'REVEALED' && songtexteGame().revealed.length === songtexteGame().totalWords);
    admin.emit('adminResetGame');
    await sleep(100);
    check('Songtexte: Reset', songtexteGame().phase === 'IDLE' && songtexteGame().revealed.length === 0);

    // Du sagst: Frage starten, Rolle, Auswahl privat, Schliessen, getrennt aufdecken, Reset
    admin.emit('adminStartGame', 'DU_SAGST');
    const dsQuestions = await new Promise(resolve => { admin.once('receiveDuSagstQuestions', resolve); admin.emit('getDuSagstQuestions'); });
    check('Du sagst: Fragen per Admin-Event', dsQuestions.length > 0);
    const dsDenied = await Promise.race([
        new Promise(resolve => { player.once('duSagstOverview', () => resolve(false)); player.emit('getDuSagstOverview'); }),
        sleep(300).then(() => true)
    ]);
    check('Du sagst: Spieler bekommt keine Übersicht', dsDenied === true);
    admin.emit('adminStartDuSagstQuestion', { questionId: dsQuestions[0].id });
    await sleep(150);
    const ds = () => admin.state.duSagstGame;
    check('Du sagst: Frage offen mit 4 Antworten', ds().phase === 'OPEN' && ds().options.length === 4);
    check('Du sagst: keine automatische Rolle', ds().roles['Team 1'].answerer === null && ds().roles['Team 1'].guesser === null);
    player.emit('playerChooseDuSagst', 0);
    player.emit('adminSetDuSagstRole', { team: 'Team 1', role: 'answerer', playerId: player.id });
    await sleep(150);
    check('Du sagst: ohne Rolle keine Auswahl, Spieler vergibt keine Rollen', ds().roles['Team 1'].answerer === null);
    admin.emit('adminSetDuSagstRole', { team: 'Team 2', role: 'answerer', playerId: player.id });
    admin.emit('adminSetDuSagstRole', { team: 'Team 1', role: 'answerer', playerId: player.id });
    await sleep(150);
    check('Du sagst: Admin vergibt Rolle nur im eigenen Team', ds().roles['Team 1'].answerer === player.id && ds().roles['Team 2'].answerer === null);
    admin.emit('adminSetDuSagstRole', { team: 'Team 1', role: 'guesser', playerId: player.id });
    await sleep(150);
    check('Du sagst: Spieler hat nur eine Rolle', ds().roles['Team 1'].guesser === player.id && ds().roles['Team 1'].answerer === null);
    admin.emit('adminSetDuSagstRole', { team: 'Team 1', role: 'answerer', playerId: player.id });
    await sleep(150);
    let dsOverview = null;
    admin.on('duSagstOverview', overview => { dsOverview = overview; });
    player.emit('playerChooseDuSagst', 2);
    await sleep(150);
    check('Du sagst: Admin sieht Auswahl live', dsOverview && dsOverview['Team 1'].answer === 2);
    check('Du sagst: Auswahl nicht im State vor Aufdecken', ds().revealed['Team 1'].answer === null);
    player.emit('playerChooseDuSagst', 7);
    admin.emit('adminToggleDuSagstClosed');
    await sleep(150);
    player.emit('playerChooseDuSagst', 1);
    await sleep(150);
    check('Du sagst: Schließen sperrt Auswahl', ds().phase === 'CLOSED' && dsOverview['Team 1'].answer === 2);
    admin.emit('adminRevealDuSagstAnswers');
    await sleep(150);
    check('Du sagst: Antworten getrennt aufgedeckt', ds().revealed['Team 1'].answer === 2 && ds().guessesRevealed === false);
    admin.emit('adminRevealDuSagstGuesses');
    await sleep(150);
    check('Du sagst: Einschätzungen aufgedeckt', ds().guessesRevealed === true);
    admin.off('duSagstOverview');
    admin.emit('adminResetGame');
    await sleep(100);
    check('Du sagst: Reset', ds().phase === 'IDLE' && ds().answersRevealed === false && ds().question === '');

    // Die Mitte: Schätzung privat, Schließen, Mitte aufdecken, Ergebnis mit näherem Team, Reset
    admin.emit('adminStartGame', 'DIE_MITTE');
    const dmQuestions = await new Promise(resolve => { admin.once('receiveDieMitteQuestions', resolve); admin.emit('getDieMitteQuestions'); });
    check('Die Mitte: Fragen per Admin-Event', dmQuestions.length > 0);
    const dmDenied = await Promise.race([
        new Promise(resolve => { player.once('receiveDieMitteQuestions', () => resolve(false)); player.emit('getDieMitteQuestions'); }),
        sleep(300).then(() => true)
    ]);
    check('Die Mitte: Spieler bekommt keine Lösungen', dmDenied === true);
    const dmQuestion = dmQuestions[0];
    admin.emit('adminStartDieMitteQuestion', { questionId: dmQuestion.id });
    await sleep(150);
    const dm = () => admin.state.dieMitteGame;
    check('Die Mitte: Frage offen, Lösung nicht im State', dm().phase === 'OPEN' && dm().answer === null && !JSON.stringify(dm()).includes(`"answer":${dmQuestion.answer}`));
    let dmOverview = null;
    spectator.on('dieMitteOverview', overview => { dmOverview = overview; });
    player.emit('playerDieMitteGuess', 'Unsinn');
    player.emit('playerDieMitteGuess', '1.500');
    await sleep(150);
    check('Die Mitte: Zuschauer sieht Eingabe live, deutsche Zahl gelesen', dmOverview && dmOverview['Team 1'][0].value === 1500);
    check('Die Mitte: Eingabe vor Aufdecken nicht im State', dm().revealedGuesses['Team 1'].length === 0 && dm().middles['Team 1'] === null);
    admin.emit('adminToggleDieMitteClosed');
    await sleep(150);
    player.emit('playerDieMitteGuess', '7');
    await sleep(150);
    check('Die Mitte: Schließen sperrt Eingabe', dm().phase === 'CLOSED' && dmOverview['Team 1'][0].value === 1500);
    admin.emit('adminRevealDieMitteGuesses');
    await sleep(150);
    check('Die Mitte: Schätzungen und Mitte aufgedeckt, Ergebnis noch nicht', dm().middles['Team 1'] === 1500 && dm().answer === null && dm().closerTeam === null);
    admin.emit('adminRevealDieMitteResult');
    await sleep(150);
    check('Die Mitte: Ergebnis zeigt Lösung und näheres Team', dm().answer === dmQuestion.answer && dm().closerTeam === 'Team 1'
        && dm().distances['Team 1'] === Math.abs(1500 - dmQuestion.answer));
    spectator.off('dieMitteOverview');
    admin.emit('adminResetGame');
    await sleep(100);
    check('Die Mitte: Reset', dm().phase === 'IDLE' && dm().answer === null && dm().middles['Team 1'] === null);

    // Hinweis Quiz: Frage, Antwort, Hinweis zuweisen (privat je Team), Buzzer, Endlösung, Reset
    admin.emit('adminStartGame', 'HINWEIS_QUIZ');
    const hqRounds = await new Promise(resolve => { admin.once('receiveHinweisQuizRounds', resolve); admin.emit('getHinweisQuizRounds'); });
    check('Hinweis Quiz: Runden per Admin-Event', hqRounds.length > 0);
    const hqDenied = await Promise.race([
        new Promise(resolve => { player.once('receiveHinweisQuizRounds', () => resolve(false)); player.emit('getHinweisQuizRounds'); }),
        sleep(300).then(() => true)
    ]);
    check('Hinweis Quiz: Spieler bekommt keine Lösungen', hqDenied === true);
    const hqRound = hqRounds[0];
    let hqPlayerView = null;
    let hqSpecView = null;
    player.on('hinweisQuizView', view => { hqPlayerView = view; });
    spectator.on('hinweisQuizView', view => { hqSpecView = view; });
    admin.emit('adminStartHinweisQuizRound', { roundId: hqRound.id });
    await sleep(150);
    const hq = () => admin.state.hinweisQuizGame;
    const hqStateText = () => JSON.stringify(hq());
    check('Hinweis Quiz: Runde läuft, Lösung und Hinweise nicht im State', hq().phase === 'PLAYING'
        && !hqStateText().includes(hqRound.solution) && !hqStateText().includes(hqRound.hints[0].hint));
    admin.emit('adminShowHinweisQuizQuestion', 0);
    await sleep(150);
    check('Hinweis Quiz: Frage sichtbar, Antwort verdeckt', hq().question === hqRound.hints[0].question && hq().questionAnswer === '');
    player.emit('pressBuzzer');
    await sleep(100);
    check('Hinweis Quiz: Buzzer während der Runde', Boolean(hq().buzzerWinner));
    admin.emit('adminRevealHinweisQuizAnswer');
    await sleep(100);
    check('Hinweis Quiz: Antwort aufgedeckt', hq().questionAnswer === hqRound.hints[0].answer);
    admin.emit('adminAssignHinweisQuizHint', { index: 1, team: 'Team 2' });
    await sleep(150);
    check('Hinweis Quiz: fremder Hinweis nur beim Zuschauer', hqPlayerView && hqPlayerView.hints.length === 0
        && hqSpecView && hqSpecView.hints.length === 1 && hqSpecView.hints[0].hint === hqRound.hints[1].hint);
    admin.emit('adminAssignHinweisQuizHint', { index: 0, team: 'Team 1' });
    await sleep(150);
    check('Hinweis Quiz: eigener Hinweis beim Team', hqPlayerView.hints.length === 1 && hqPlayerView.hints[0].hint === hqRound.hints[0].hint
        && hq().hintOwners[0] === 'Team 1' && !hqStateText().includes(hqRound.hints[0].hint));
    admin.emit('adminRevealHinweisQuizSolution');
    await sleep(150);
    check('Hinweis Quiz: Endlösung zeigt Lösung und alle Hinweise', hq().phase === 'SOLVED' && hq().solution === hqRound.solution
        && hq().allHints.length === hqRound.hints.length);
    player.off('hinweisQuizView');
    spectator.off('hinweisQuizView');
    admin.emit('adminResetGame');
    await sleep(100);
    check('Hinweis Quiz: Reset', hq().phase === 'IDLE' && hq().solution === '' && hq().hintOwners.length === 0);

    // Diagramme: Zeichnen, Privatsphaere, Auswertung, Reset
    admin.emit('adminStartGame', 'DIAGRAMME');
    const diagrams = await new Promise(resolve => { admin.once('receiveDiagrammeList', resolve); admin.emit('getDiagrammeList'); });
    check('Diagramme: Liste per Admin-Event', diagrams.length > 0);
    const diagramsDenied = await Promise.race([
        new Promise(resolve => { player.once('receiveDiagrammeList', () => resolve(false)); player.emit('getDiagrammeList'); }),
        sleep(300).then(() => true)
    ]);
    check('Diagramme: Spieler bekommt keine Liste', diagramsDenied === true);
    admin.emit('adminStartDiagrammeRound', { diagramId: diagrams[0].id });
    await sleep(150);
    const dg = () => admin.state.diagrammeGame;
    check('Diagramme: nur erste Hälfte im State, Lösung verborgen', dg().visibleValues.length === dg().shownCount && dg().solution === null && !('values' in dg()));
    check('Diagramme: Spieler ist automatisch Zeichner', dg().painters['Team 1'] === player.id);
    player.emit('playerDiagrammeAddPoint', { u: 0.1, v: 0.5 });
    const playerView = await once(player, 'diagrammeView');
    check('Diagramme: Punkt wird auf rechte Hälfte begrenzt', playerView.drawings['Team 1'].length === 1 && playerView.drawings['Team 1'][0].u >= dg().shownCount / diagrams[0].values.length - 0.05 && playerView.solution === null);
    admin.emit('getDiagrammeView');
    const adminView = await once(admin, 'diagrammeView');
    check('Diagramme: Admin sieht Zeichnung und Lösung', adminView.drawings['Team 1'].length === 1 && adminView.solution.length === diagrams[0].values.length);
    admin.emit('playerDiagrammeAddPoint', { u: 0.9, v: 0.5 }); // Admin ist kein Zeichner: Zähler unten muss 2 bleiben
    player.emit('playerDiagrammeAddPoint', { u: 1, v: 0.5 });
    await sleep(150);
    check('Diagramme: Punktezähler', dg().pointCounts['Team 1'] === 2 && dg().pointCounts['Team 2'] === 0);
    admin.emit('adminCloseDiagrammeDrawing');
    await sleep(150);
    player.emit('playerDiagrammeAddPoint', { u: 1, v: 0.2 });
    await sleep(150);
    check('Diagramme: Admin schließt das Zeichnen', dg().drawingClosed === true && dg().drawingsRevealed === false && dg().pointCounts['Team 1'] === 2);
    admin.emit('adminRevealDiagrammeSolution');
    await sleep(150);
    check('Diagramme: Auswertung mit Abweichung', dg().solution !== null && typeof dg().results['Team 1'].deviationPct === 'number' && dg().results['Team 2'] === null && dg().closestTeam === 'Team 1');
    player.emit('playerDiagrammeAddPoint', { u: 1, v: 0.5 });
    await sleep(150);
    check('Diagramme: nach Aufdecken kein Zeichnen mehr', dg().pointCounts['Team 1'] === 2);
    admin.emit('adminResetGame');
    await sleep(100);
    check('Diagramme: Reset', dg().phase === 'IDLE' && dg().solution === null && dg().pointCounts['Team 1'] === 0);

    // Teekesselchen (neu)
    let privateView = null;
    player.on('teekesselchenPlayerUpdate', v => { privateView = v; });
    admin.emit('adminStartGame', 'TEEKESSELCHEN');
    const tRounds = await new Promise(resolve => { admin.once('receiveTeekesselchenRounds', resolve); admin.emit('getTeekesselchenRounds'); });
    check('Teekesselchen: Runden per Admin-Event', tRounds.length > 0);
    admin.emit('adminStartTeekesselchenRound', { roundId: tRounds[0].id });
    await sleep(300);
    await sleep(1300);
    check('Teekesselchen: Schreibphase läuft ohne eigenen Timer weiter', admin.state.teekesselchenGame.phase === 'WRITING' && !('timeRemaining' in admin.state.teekesselchenGame));
    check('Teekesselchen: eigene Bedeutung privat, Lösung nicht im State', Boolean(privateView && privateView.category) && !JSON.stringify(admin.state.teekesselchenGame).includes(tRounds[0].answer));
    player.emit('pressBuzzer');
    await sleep(100);
    check('Teekesselchen: Buzzer schon in Schreibphase offen', Boolean(admin.state.teekesselchenGame.buzzerWinner));
    admin.emit('adminResetBuzzer');
    await sleep(100);
    player.emit('updateTeekesselchenWord', 'Heft');
    await sleep(100);
    check('Teekesselchen: Wörter vor Freigabe nicht im State', !JSON.stringify(admin.state.teekesselchenGame).includes('Heft') && admin.state.teekesselchenGame.wordsReleased === false);
    admin.emit('adminReleaseTeekesselchenWords');
    await sleep(150);
    check('Teekesselchen: Freigabe -> GUESSING', admin.state.teekesselchenGame.phase === 'GUESSING' && admin.state.teekesselchenGame.wordsReleased === true);
    player.emit('pressBuzzer');
    await sleep(100);
    check('Teekesselchen: Buzzer in Ratephase', Boolean(admin.state.teekesselchenGame.buzzerWinner));    admin.emit('adminRevealTeekesselchen');
    await sleep(100);
    check('Teekesselchen: Auflösen zeigt Lösung', admin.state.teekesselchenGame.answer === tRounds[0].answer);
    admin.emit('adminResetGame');
    await sleep(100);
    check('Teekesselchen: Reset', admin.state.teekesselchenGame.phase === 'IDLE' && admin.state.teekesselchenGame.answer === '');

    // Malen: Maler nur aus dem eigenen Team, Aufdecken
    admin.emit('adminStartGame', 'MALEN');
    admin.emit('adminStartMalenRound', { word: 'Haus', painters: { 'Team 1': player.id, 'Team 2': player.id } });
    await sleep(150);
    check('Malen: Maler aus fremdem Team wird abgelehnt', admin.state.malenGame.painters['Team 1'] === player.id && admin.state.malenGame.painters['Team 2'] === null);
    check('Malen: Begriff zunächst verdeckt', admin.state.malenGame.wordRevealed === false);
    admin.emit('adminRevealMalenWord');
    await sleep(100);
    check('Malen: Begriff aufdecken', admin.state.malenGame.wordRevealed === true);
    admin.emit('adminSetMalenWord', 'Baum');
    await sleep(100);
    check('Malen: neuer Begriff deckt wieder zu', admin.state.malenGame.wordRevealed === false && admin.state.malenGame.word === 'Baum');
    admin.emit('adminResetGame');
    await sleep(100);

    // Realität, Flaggen, Bingo: keine eigenen Timer, Abläufe per Admin-Button
    admin.emit('adminStartGame', 'REALITAET');
    admin.emit('adminStartRealitaet', { targetTeam: 'Team 1', contentType: 'QUESTION' });
    await sleep(1300);
    check('Realität: Runde läuft ohne eigenen Timer weiter', admin.state.realitaetGame.phase === 'PLAYING' && !('remaining' in admin.state.realitaetGame));
    admin.emit('adminEndRealitaet');
    await sleep(150);
    check('Realität: Admin beendet die Runde', admin.state.realitaetGame.phase === 'FINISHED');
    admin.emit('adminResetGame');

    admin.emit('adminStartGame', 'FLAGGEN');
    const flaggenData = await new Promise(resolve => { admin.once('receiveFlaggenData', resolve); admin.emit('getFlaggenData'); });
    check('Flaggen: viele Länder vorhanden (u. a. Kuba)', flaggenData.rounds.length >= 30 && flaggenData.rounds.some(round => round.id === 'kuba'));
    admin.emit('adminStartFlaggenRound', { roundId: 'unbekannt' });
    await sleep(100);
    check('Flaggen: unbekannte Runde wird ignoriert', admin.state.flaggenGame.phase === 'IDLE');
    admin.emit('adminStartFlaggenRound', { roundId: 'kuba' });
    await sleep(1300);
    const fg = () => admin.state.flaggenGame;
    check('Flaggen: Bauen bleibt ohne Timer offen', fg().phase === 'PLAYING' && fg().buildingLocked === false && !('remaining' in fg()));
    check('Flaggen: Original bleibt bis zum Aufdecken im Server', fg().targetFlag === null && fg().elements.length > 0);
    const kubaElement = fg().elements[0].id;
    check('Flaggen: Bauflächen nicht im öffentlichen State', !('boards' in fg()));
    let spectatorSawBoard = false;
    spectator.once('flaggenView', view => { spectatorSawBoard = Object.keys(view.boards).length > 0; });
    const flaggenPlayerViewPromise = once(player, 'flaggenView');
    const flaggenAdminViewPromise = once(admin, 'flaggenView');
    player.emit('playerUpdateFlaggenBoard', { placements: [
        { id: 'a', elementId: kubaElement, x: 0.4, y: 2, rotation: 450, zIndex: 3 },
        { id: 'b', elementId: 'gibt-es-nicht', x: 0.5, y: 0.5 },
        { id: 'c', elementId: kubaElement, x: 'abc', y: 0.5 }
    ] });
    const flaggenPlayerView = await flaggenPlayerViewPromise;
    const flaggenAdminView = await flaggenAdminViewPromise;
    const placed = flaggenPlayerView.boards['Team 1'].placements;
    check('Flaggen: Platzierungen werden geprüft', placed.length === 2 && placed[0].y === 1 && placed[0].rotation === 90 && placed[1].x === 0.5);
    check('Flaggen: Admin sieht die Bauflächen live', flaggenAdminView.boards['Team 1'].placements.length === 2);
    await sleep(150);
    check('Flaggen: Zuschauer sieht vor dem Aufdecken keine Bauflächen', spectatorSawBoard === false);
    admin.emit('adminToggleFlaggenLock');
    await sleep(150);
    check('Flaggen: Admin sperrt das Bauen', fg().buildingLocked === true);
    const blocked = Promise.race([once(player, 'flaggenView').then(() => false), sleep(300).then(() => true)]);
    player.emit('playerClearFlaggenBoard');
    check('Flaggen: gesperrt, Spieler kann nichts mehr ändern', await blocked);
    const revealedView = once(spectator, 'flaggenView');
    admin.emit('adminRevealFlaggen');
    const specView = await revealedView;
    await sleep(100);
    check('Flaggen: Aufdecken zeigt dem Zuschauer die Bauflächen', specView.boards['Team 1'].placements.length === 2);
    check('Flaggen: Aufdecken liefert die Original-Flagge', fg().revealed === true && typeof fg().targetFlag === 'string' && fg().targetFlag.includes('<svg'));
    admin.emit('adminResetGame');

    admin.emit('adminStartGame', 'BINGO');
    admin.emit('adminStartBingo', { topic: 'Testthema', referatPlayerId: player.id });
    await sleep(150);
    check('Bingo: Runde startet ohne eigenen Timer', admin.state.referatBingo.phase === 'PREPARING' && !('timer' in admin.state.referatBingo));
    admin.emit('adminResetGame');
    await sleep(100);

    // Rap Battle: Reimwoerter und Woerter der Teams bleiben privat, Rap per Admin-Button freigeben
    const mate = await connect();
    mate.emit('registerAsPlayer');
    await sleep(200);
    admin.emit('adminUpdatePlayerTeam', { socketId: mate.id, team: 'Team 2' });
    const rapViews = {};
    [['rapper', player], ['mate', mate], ['host', admin], ['spectator', spectator]].forEach(([name, socket]) => {
        socket.on('rapBattleView', view => { rapViews[name] = view; });
    });
    const rb = () => admin.state.rapBattleGame;
    admin.emit('adminStartGame', 'RAP_BATTLE');
    const raps = await new Promise(resolve => { admin.once('receiveRapBattleRaps', resolve); admin.emit('getRapBattleRaps'); });
    check('Rap Battle: Raps mit 12 Zeilen per Admin-Event', raps.length > 0 && raps[0].lines.length === 12);
    admin.emit('adminStartRapBattleRound', { rapId: 'gibt-es-nicht', rapperId: player.id });
    admin.emit('adminStartRapBattleRound', { rapId: raps[0].id, rapperId: 'unbekannt' });
    await sleep(150);
    check('Rap Battle: ungültige Runde wird ignoriert', rb().phase === 'IDLE');
    mate.emit('adminStartRapBattleRound', { rapId: raps[0].id, rapperId: player.id });
    await sleep(150);
    check('Rap Battle: Spieler kann keine Runde starten', rb().phase === 'IDLE');
    admin.emit('adminStartRapBattleRound', { rapId: raps[0].id, rapperId: player.id });
    await sleep(250);
    check('Rap Battle: Runde startet mit Schreibphase', rb().phase === 'WRITING' && rb().rapperId === player.id && rb().rapperTeam === 'Team 1');
    const secretLines = raps[0].lines.slice(2);
    check('Rap Battle: Reimwörter nicht im öffentlichen State', secretLines.every(line => !JSON.stringify(admin.state.rapBattleGame).includes(line)));
    check('Rap Battle: Rappender und Mitspieler sehen den Rap noch nicht', rapViews.rapper.lines === null && rapViews.mate.lines === null);
    check('Rap Battle: Admin und Zuschauer sehen den Rap', rapViews.host.lines.length === 12 && rapViews.spectator.lines.length === 12);
    mate.emit('playerSetRapBattleWord', { index: 0, word: 'Beispielwort' });
    mate.emit('playerSetRapBattleWord', { index: 99, word: 'ungültig' });
    mate.emit('playerSetRapBattleWord', { index: 1, word: 42 });
    player.emit('playerSetRapBattleWord', { index: 1, word: 'Rapper darf nicht' });
    await sleep(250);
    check('Rap Battle: Mitspieler schreibt ins Wortfeld des Teams', rapViews.mate.board.words[0] === 'Beispielwort' && rapViews.host.boards['Team 2'].words[0] === 'Beispielwort');
    check('Rap Battle: ungültige Eingaben und Rappender werden abgelehnt', rapViews.host.boards['Team 2'].words[1] === '' && rapViews.host.boards['Team 1'].words[1] === '');
    check('Rap Battle: Wörter sind für Rappenden und im State verborgen', rapViews.rapper.board === null && rapViews.rapper.boards === null && !JSON.stringify(admin.state.rapBattleGame).includes('Beispielwort'));
    mate.emit('playerToggleRapBattleMark', { index: 0 });
    await sleep(150);
    check('Rap Battle: Markieren erst nach Rap-Start', rapViews.host.boards['Team 2'].marked[0] === false);
    admin.emit('adminShowRapBattleToOthers', true);
    await sleep(200);
    check('Rap Battle: Rap für Mitspieler freigegeben, Rappender sieht ihn weiter nicht', rapViews.mate.lines.length === 12 && rapViews.rapper.lines === null);
    admin.emit('adminStartRapBattleRap', { bpm: 500 });
    await sleep(250);
    check('Rap Battle: Rap-Start zeigt dem Rappenden die Zeilen mit Takt', rb().phase === 'RAPPING' && rapViews.rapper.lines.length === 12 && rapViews.rapper.timing.bpm === 240 && rapViews.rapper.timing.startAt > rapViews.rapper.serverNow);
    check('Rap Battle: Wörter bleiben für den Rappenden verborgen', rapViews.rapper.boards === null);
    mate.emit('playerToggleRapBattleMark', { index: 0 });
    mate.emit('playerToggleRapBattleMark', { index: 5 });
    player.emit('playerToggleRapBattleMark', { index: 0 });
    await sleep(250);
    check('Rap Battle: Mitspieler markiert gesagtes Wort (leere Felder nicht)', rapViews.host.boards['Team 2'].marked[0] === true && rapViews.host.boards['Team 2'].marked[5] === false);
    check('Rap Battle: Fortschritt im State', rb().boardProgress['Team 2'].filled === 1 && rb().boardProgress['Team 2'].marked === 1);
    admin.emit('adminRevealRapBattleWords');
    await sleep(250);
    check('Rap Battle: Aufdecken zeigt allen die Wörter und Zeilen', rb().revealed === true && rapViews.rapper.boards['Team 2'].words[0] === 'Beispielwort' && rapViews.rapper.lines.length === 12);
    mate.emit('playerSetRapBattleWord', { index: 2, word: 'zu spät' });
    await sleep(150);
    check('Rap Battle: nach dem Aufdecken keine Änderungen mehr', rapViews.host.boards['Team 2'].words[2] === '');
    admin.emit('adminResetGame');
    await sleep(250);
    check('Rap Battle: Reset leert Runde und Ansichten', rb().phase === 'IDLE' && rapViews.rapper.lines === null && rapViews.host.boards === null);
    mate.close();
    await sleep(150);

    // Team umbenennen
    for (const game of games) {
        admin.emit('adminStartGame', game.id);
        admin.emit('adminAddGamePoint', { team: 'Team 1', amount: 1 });
    }
    await sleep(300);
    admin.emit('adminUpdateTeamName', { oldName: 'Team 1', newName: 'Alpha' });
    await sleep(250);
    const st = admin.state;
    check('Umbenennen: Reihenfolge bleibt', Object.keys(st.teams).join(',') === 'Alpha,Team 2', Object.keys(st.teams).join(','));
    check('Umbenennen: alle Spiele ziehen um', games.every(g => 'Alpha' in st[g.stateKey].scores && !('Team 1' in st[g.stateKey].scores)));
    check('Umbenennen: Punkte bleiben erhalten', games.every(g => st[g.stateKey].scores.Alpha >= 0));
    check('Umbenennen: Spieler zieht um', Object.values(st.players).every(p => p.team !== 'Team 1'));

    // Routen: Lösungen der neuen Spiele sind nicht mehr öffentlich
    for (const url of ['/kategorien.json', '/bingo.json', '/malen.json', '/karte.json', '/flaggen.json', '/buchstabensalat.json', '/teekesselchen.json', '/beugen.json', '/diagramme.json', '/rap-battle.json', '/songtexte.json', '/du-sagst.json', '/die-mitte.json', '/hinweis-quiz.json']) {
        check(`Nicht öffentlich ${url}`, !(await fetch(URL + url)).ok);
    }

    const contentEvents = [
        ['getReferatTopics', 'receiveReferatTopics'],
        ['getMalenWords', 'receiveMalenWords'],
        ['getKartePlaces', 'receiveKartePlaces'],
        ['getFlaggenData', 'receiveFlaggenData'],
        ['getRapBattleRaps', 'receiveRapBattleRaps']
    ];
    for (const [request, response] of contentEvents) {
        const adminData = await Promise.race([
            new Promise(resolve => { admin.once(response, resolve); admin.emit(request); }),
            sleep(1500).then(() => null)
        ]);
        check(`Admin bekommt Inhalte: ${request}`, adminData !== null && (Array.isArray(adminData) ? adminData.length > 0 : Object.keys(adminData).length > 0));
        const playerData = await Promise.race([
            new Promise(resolve => { player.once(response, () => resolve(true)); player.emit(request); }),
            sleep(400).then(() => false)
        ]);
        check(`Spieler bekommt keine Inhalte: ${request}`, playerData === false);
    }

    check('Server hat keine Handler-Fehler geloggt', !serverLog.includes('Fehler im Event'), serverLog.split('\n').filter(l => l.includes('Fehler im Event')).slice(0, 5).join(' | '));

    [admin, player, spectator].forEach(s => s.close());
    server.kill();
    const failed = results.filter(r => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} Checks ok`);
    process.exit(failed.length ? 1 : 0);
})().catch(err => {
    console.error('Testabbruch:', err);
    console.error(serverLog.slice(-2000));
    server.kill();
    process.exit(2);
});
