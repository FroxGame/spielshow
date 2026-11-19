'use strict';

const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const MAX_ABS_VALUE = 1e15;

/**
 * Die Mitte: Schaetzfrage fuer beide Teams gleichzeitig. Jeder Spieler mit Team gibt eine Zahl ein.
 * Der Mittelwert aller Schaetzungen eines Teams ist die Teamschaetzung. Naeher an der Loesung gewinnt.
 * Admin und Zuschauer sehen die Eingaben live (Kanal dieMitteOverview). Spieler sehen nur die eigene.
 * Schaetzungen und Mitte kommen erst mit "aufdecken" in den State, die Loesung erst mit "Ergebnis".
 * Inhalte: die-mitte.json (Array aus { id, question, answer: Zahl, unit?: Text }), nur per Admin-Event.
 */
module.exports = function createDieMitteGame(ctx) {
    const { io, gameState, adminSockets, spectatorSockets, createScores, byTeam,
        renameKey, emitState, isAdmin, utils } = ctx;

    const questionsPath = path.join(ROOT, 'die-mitte.json');
    const guesses = {};             // playerId -> Zahl
    let currentQuestion = null;

    const state = () => gameState.dieMitteGame;

    const readQuestions = () => utils.readJsonArray(questionsPath, entry =>
        entry && typeof entry.id === 'string' && typeof entry.question === 'string'
        && typeof entry.answer === 'number' && Number.isFinite(entry.answer));

    /** Liest deutsche und englische Zahlen: "1.500", "1500,5", "1 500", "2.5". Liefert null bei Unsinn. */
    function parseGuess(raw) {
        if (typeof raw === 'number') return Number.isFinite(raw) && Math.abs(raw) < MAX_ABS_VALUE ? raw : null;
        if (typeof raw !== 'string') return null;
        let text = raw.trim().replace(/\s+/g, '');
        if (!text || text.length > 30) return null;
        if (text.includes(',')) text = text.replace(/\./g, '').replace(',', '.');
        else if (/^-?\d{1,3}(\.\d{3})+$/.test(text)) text = text.replace(/\./g, '');
        if (!/^-?\d+(\.\d+)?$/.test(text)) return null;
        const value = Number(text);
        return Number.isFinite(value) && Math.abs(value) < MAX_ABS_VALUE ? value : null;
    }

    function clearGuesses() {
        Object.keys(guesses).forEach(playerId => delete guesses[playerId]);
    }

    const teamPlayers = team => Object.values(gameState.players).filter(player => player.team === team);

    /** Eingaben je Team: [{ name, value }], nur Spieler, die aktuell im Team sind und geschaetzt haben. */
    function teamGuesses() {
        return byTeam(team => teamPlayers(team)
            .filter(player => guesses[player.id] !== undefined)
            .map(player => ({ name: player.name, value: guesses[player.id] })));
    }

    const middleOf = entries => (entries.length
        ? entries.reduce((sum, entry) => sum + entry.value, 0) / entries.length
        : null);

    /** Team mit dem kleinsten Abstand der Mitte zur Loesung. 'TIE' bei Gleichstand, null ohne Schaetzungen. */
    function closerTeam(middles, answer) {
        const distances = Object.entries(middles)
            .filter(([, middle]) => middle !== null)
            .map(([team, middle]) => ({ team, distance: Math.abs(middle - answer) }));
        if (!distances.length) return null;
        const best = Math.min(...distances.map(entry => entry.distance));
        const winners = distances.filter(entry => entry.distance === best);
        return winners.length === 1 ? winners[0].team : 'TIE';
    }

    /** Uebertraegt Aufgedecktes in den State. Wird nach jeder Aenderung aufgerufen. */
    function updateRevealed() {
        const game = state();
        const all = teamGuesses();
        game.revealedGuesses = game.guessesRevealed ? all : byTeam(() => []);
        game.middles = game.guessesRevealed ? byTeam(team => middleOf(all[team])) : byTeam(() => null);
        if (game.resultRevealed && currentQuestion) {
            game.answer = currentQuestion.answer;
            game.distances = byTeam(team => (game.middles[team] === null ? null : Math.abs(game.middles[team] - game.answer)));
            game.closerTeam = closerTeam(game.middles, game.answer);
        }
    }

    function overview() {
        return teamGuesses();
    }

    function emitPlayerViews() {
        Object.keys(gameState.players).forEach(playerId => io.to(playerId).emit('dieMittePlayerUpdate',
            { guess: guesses[playerId] === undefined ? null : guesses[playerId] }));
    }

    function emitOverviews() {
        const full = overview();
        [...adminSockets, ...spectatorSockets].forEach(id => io.to(id).emit('dieMitteOverview', full));
    }

    function emitUpdates() {
        emitPlayerViews();
        emitOverviews();
    }

    function publish() {
        updateRevealed();
        emitState();
        emitUpdates();
    }

    function createState() {
        return {
            dieMitteGame: {
                phase: 'IDLE',              // IDLE | OPEN | CLOSED
                questionId: null,
                question: '',
                unit: '',
                guessesRevealed: false,
                resultRevealed: false,
                revealedGuesses: byTeam(() => []),
                middles: byTeam(() => null),
                answer: null,
                distances: byTeam(() => null),
                closerTeam: null,
                scores: createScores()
            }
        };
    }

    function reset() {
        currentQuestion = null;
        clearGuesses();
        Object.assign(gameState, createState());
    }

    function startQuestion(question) {
        currentQuestion = question;
        clearGuesses();
        Object.assign(state(), {
            phase: 'OPEN',
            questionId: question.id,
            question: question.question,
            unit: typeof question.unit === 'string' ? question.unit : '',
            guessesRevealed: false,
            resultRevealed: false,
            answer: null,
            distances: byTeam(() => null),
            closerTeam: null
        });
        publish();
    }

    function registerAdminEvents(socket) {
        socket.on('getDieMitteQuestions', () => {
            if (!isAdmin(socket)) return;
            socket.emit('receiveDieMitteQuestions', readQuestions().map(({ id, question, answer, unit }) => (
                { id, question, answer, unit: typeof unit === 'string' ? unit : '' })));
        });

        socket.on('adminStartDieMitteQuestion', ({ questionId } = {}) => {
            if (!isAdmin(socket) || typeof questionId !== 'string') return;
            const question = readQuestions().find(entry => entry.id === questionId);
            if (question) startQuestion(question);
        });

        // Schliessen sperrt die Eingabe, erneutes Klicken oeffnet sie wieder (solange nichts aufgedeckt ist).
        socket.on('adminToggleDieMitteClosed', () => {
            const game = state();
            if (!isAdmin(socket) || game.phase === 'IDLE' || game.guessesRevealed) return;
            game.phase = game.phase === 'OPEN' ? 'CLOSED' : 'OPEN';
            publish();
        });

        // Aufdecken schliesst die Eingabe, damit niemand nach dem Aufdecken nachbessert.
        socket.on('adminRevealDieMitteGuesses', () => {
            if (!isAdmin(socket) || state().phase === 'IDLE') return;
            Object.assign(state(), { phase: 'CLOSED', guessesRevealed: true });
            publish();
        });

        socket.on('adminRevealDieMitteResult', () => {
            if (!isAdmin(socket) || state().phase === 'IDLE' || !currentQuestion) return;
            Object.assign(state(), { phase: 'CLOSED', guessesRevealed: true, resultRevealed: true });
            publish();
        });
    }

    function registerViewEvents(socket) {
        socket.on('getDieMitteView', () => {
            if (!gameState.players[socket.id]) return;
            socket.emit('dieMittePlayerUpdate', { guess: guesses[socket.id] === undefined ? null : guesses[socket.id] });
        });

        socket.on('getDieMitteOverview', () => {
            if (!isAdmin(socket) && !spectatorSockets.has(socket.id)) return;
            socket.emit('dieMitteOverview', overview());
        });

        socket.on('playerDieMitteGuess', raw => {
            const player = gameState.players[socket.id];
            if (state().phase !== 'OPEN' || !player || !player.team) return;
            const empty = typeof raw === 'string' && raw.trim() === '';
            const value = empty ? null : parseGuess(raw);
            if (value === null && !empty) return;
            if (value === null) delete guesses[socket.id];
            else guesses[socket.id] = value;
            socket.emit('dieMittePlayerUpdate', { guess: value });
            emitOverviews();
        });
    }

    function register(socket) {
        registerAdminEvents(socket);
        registerViewEvents(socket);
    }

    function renameTeam(oldName, newName) {
        const game = state();
        [game.scores, game.revealedGuesses, game.middles, game.distances].forEach(map => renameKey(map, oldName, newName));
        if (game.closerTeam === oldName) game.closerTeam = newName;
    }

    return {
        id: 'DIE_MITTE',
        title: 'Die Mitte',
        stateKey: 'dieMitteGame',
        clientModule: 'die-mitte',
        maxScore: 5,
        createState,
        reset,
        register,
        renameTeam,
        emitUpdates,
        onScreenEnter: emitUpdates,
        onPlayerRegistered: emitPlayerViews,
        onAdminLogin: socket => socket.emit('dieMitteOverview', overview()),
        onSpectatorLogin: socket => socket.emit('dieMitteOverview', overview())
    };
};
