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
    check('Intro-Nummern 1..n', admin.intros.map(i => i.number).join(',') === Array.from({ length: games.length }, (_, i) => i + 1).join(','));

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
    admin.emit('adminStartMerken', 10);
    await sleep(150);
    check('Merken: startet', admin.state.merkenGame.phase !== 'IDLE');
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

    // Teekesselchen (neu)
    let privateView = null;
    player.on('teekesselchenPlayerUpdate', v => { privateView = v; });
    admin.emit('adminStartGame', 'TEEKESELCHEN');
    const tRounds = await new Promise(resolve => { admin.once('receiveTeekesselchenRounds', resolve); admin.emit('getTeekesselchenRounds'); });
    check('Teekesselchen: Runden per Admin-Event', tRounds.length > 0);
    admin.emit('adminStartTeekesselchenRound', { roundId: tRounds[0].id, duration: 10 });
    await sleep(300);
    check('Teekesselchen: Phase WRITING mit Timer', admin.state.teekesselchenGame.phase === 'WRITING' && admin.state.teekesselchenGame.timeRemaining >= 9);
    check('Teekesselchen: eigene Kategorie privat, Lösung nicht im State', Boolean(privateView && privateView.category) && !JSON.stringify(admin.state.teekesselchenGame).includes(tRounds[0].answer));
    player.emit('pressBuzzer');
    await sleep(100);
    check('Teekesselchen: Buzzer in Schreibphase abgelehnt', admin.state.teekesselchenGame.buzzerWinner === null);
    player.emit('updateTeekesselchenText', 'Etwas zum Beschreiben');
    admin.emit('adminCloseTeekesselchenInputs');
    await sleep(150);
    check('Teekesselchen: Eingaben schließen -> GUESSING', admin.state.teekesselchenGame.phase === 'GUESSING');
    player.emit('pressBuzzer');
    await sleep(100);
    check('Teekesselchen: Buzzer in Ratephase', Boolean(admin.state.teekesselchenGame.buzzerWinner));
    admin.emit('adminRevealTeekesselchenTeam', 'Team 1');
    await sleep(100);
    check('Teekesselchen: Team-Beschreibung aufdecken', admin.state.teekesselchenGame.revealedTeams['Team 1'].texts[0].text === 'Etwas zum Beschreiben');
    admin.emit('adminRevealTeekesselchen');
    await sleep(100);
    check('Teekesselchen: Auflösen zeigt Lösung', admin.state.teekesselchenGame.answer === tRounds[0].answer);
    admin.emit('adminResetGame');
    await sleep(100);
    check('Teekesselchen: Reset', admin.state.teekesselchenGame.phase === 'IDLE' && admin.state.teekesselchenGame.answer === '');

    // Kategorien: Zug-Timer mit abwechselnden Teams
    admin.emit('adminStartGame', 'KATEGORIEN');
    const categoryRounds = await new Promise(resolve => { admin.once('receiveCategoryRounds', resolve); admin.emit('getCategoryRounds'); });
    admin.emit('adminStartCategoryRound', categoryRounds[0]);
    await sleep(150);
    admin.emit('adminSetCategoryTurnDuration', 5);
    admin.emit('adminStartCategoryTurn');
    await sleep(150);
    check('Kategorien: Zug startet beim ersten Team', admin.state.categoryGame.turn.running && admin.state.categoryGame.turn.team === 'Team 1');
    admin.emit('adminStartCategoryTurn');
    await sleep(150);
    check('Kategorien: Zug wechselt zum nächsten Team', admin.state.categoryGame.turn.team === 'Team 2');
    await sleep(1300);
    check('Kategorien: Timer zählt herunter', admin.state.categoryGame.turn.remaining <= 4);
    admin.emit('adminStopCategoryTurn');
    await sleep(150);
    check('Kategorien: Zug beenden', admin.state.categoryGame.turn.running === false && admin.state.categoryGame.turn.team === null);
    admin.emit('adminResetGame');
    await sleep(100);

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
    for (const url of ['/kategorien.json', '/bingo.json', '/malen.json', '/karte.json', '/flaggen.json']) {
        check(`Route ${url}`, (await fetch(URL + url)).ok);
    }
    for (const url of ['/buchstabensalat.json', '/teekesselchen.json']) {
        check(`Nicht öffentlich ${url}`, !(await fetch(URL + url)).ok);
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
