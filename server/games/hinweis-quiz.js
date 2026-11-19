'use strict';

const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const MAX_HINTS = 6;

/**
 * Hinweis Quiz: Gesucht ist eine Endloesung (z. B. eine Person). Es gibt bis zu 6 Hinweise.
 * Zu jedem Hinweis gehoert eine Frage. Der Admin deckt Frage und Antwort auf und weist den Hinweis
 * dem Team zu, das richtig geantwortet hat (bei falscher Antwort dem anderen Team).
 * Zugewiesene Hinweise sieht nur das eigene Team (Kanal hinweisQuizView), Admin und Zuschauer sehen alle.
 * Die Hinweistexte stehen erst mit der Endloesung im State. Buzzer offen, solange die Runde laeuft.
 * Inhalte: hinweis-quiz.json (Array aus { id, title, solution, hints: [{ hint, question, answer }] }),
 * nur per Admin-Event abrufbar.
 */
module.exports = function createHinweisQuizGame(ctx) {
    const { io, gameState, adminSockets, spectatorSockets, createScores, renameKey, emitState, isAdmin, utils } = ctx;

    const roundsPath = path.join(ROOT, 'hinweis-quiz.json');
    let currentRound = null;

    const state = () => gameState.hinweisQuizGame;

    const isValidHint = hint => hint && typeof hint.hint === 'string'
        && typeof hint.question === 'string' && typeof hint.answer === 'string';

    const readRounds = () => utils.readJsonArray(roundsPath, entry =>
        entry && typeof entry.id === 'string' && typeof entry.title === 'string'
        && typeof entry.solution === 'string' && Array.isArray(entry.hints)
        && entry.hints.length > 0 && entry.hints.length <= MAX_HINTS && entry.hints.every(isValidHint));

    function createState() {
        return {
            hinweisQuizGame: {
                phase: 'IDLE',              // IDLE | PLAYING | SOLVED
                roundId: null,
                title: '',
                totalHints: 0,
                activeIndex: null,          // Hinweis, dessen Frage gerade gezeigt wird
                question: '',
                questionAnswer: '',
                hintOwners: [],             // je Hinweis: Teamname oder null
                allHints: [],               // erst nach der Endloesung: [{ hint, question, answer, owner }]
                solution: '',
                buzzerLocked: false,
                buzzerWinner: null,
                buzzerTeam: null,
                scores: createScores()
            }
        };
    }

    function reset() {
        currentRound = null;
        Object.assign(gameState, createState());
    }

    /** Zugewiesene Hinweise, optional nur die eines Teams: [{ index, hint, question, answer, owner }]. */
    function assignedHints(team) {
        if (!currentRound) return [];
        return currentRound.hints
            .map((entry, index) => ({ index, ...entry, owner: state().hintOwners[index] }))
            .filter(entry => entry.owner && (team === undefined || entry.owner === team));
    }

    function viewForPlayer(playerId) {
        const player = gameState.players[playerId];
        return { hints: player && player.team ? assignedHints(player.team) : [] };
    }

    function emitPlayerViews() {
        Object.keys(gameState.players).forEach(playerId => io.to(playerId).emit('hinweisQuizView', viewForPlayer(playerId)));
    }

    function emitOverviews() {
        const view = { hints: assignedHints() };
        [...adminSockets, ...spectatorSockets].forEach(id => io.to(id).emit('hinweisQuizView', view));
    }

    function emitUpdates() {
        emitPlayerViews();
        emitOverviews();
    }

    function publish() {
        emitState();
        emitUpdates();
    }

    function startRound(round) {
        currentRound = round;
        Object.assign(state(), {
            phase: 'PLAYING',
            roundId: round.id,
            title: round.title,
            totalHints: round.hints.length,
            activeIndex: null,
            question: '',
            questionAnswer: '',
            hintOwners: round.hints.map(() => null),
            allHints: [],
            solution: '',
            buzzerLocked: false,
            buzzerWinner: null,
            buzzerTeam: null
        });
        publish();
    }

    const validIndex = index => currentRound && state().phase !== 'IDLE'
        && utils.isValidIndex(index, 0, currentRound.hints.length - 1);

    function registerAdminEvents(socket) {
        socket.on('getHinweisQuizRounds', () => {
            if (!isAdmin(socket)) return;
            socket.emit('receiveHinweisQuizRounds', readRounds());
        });

        socket.on('adminStartHinweisQuizRound', ({ roundId } = {}) => {
            if (!isAdmin(socket) || typeof roundId !== 'string') return;
            const round = readRounds().find(entry => entry.id === roundId);
            if (round) startRound(round);
        });

        // Zeigt allen die Frage zu einem Hinweis (Antwort noch verdeckt). Buzzer wird freigegeben.
        socket.on('adminShowHinweisQuizQuestion', index => {
            if (!isAdmin(socket) || !validIndex(index)) return;
            const i = Number(index);
            Object.assign(state(), {
                activeIndex: i,
                question: currentRound.hints[i].question,
                questionAnswer: '',
                buzzerLocked: false,
                buzzerWinner: null,
                buzzerTeam: null
            });
            emitState();
        });

        socket.on('adminRevealHinweisQuizAnswer', () => {
            const i = state().activeIndex;
            if (!isAdmin(socket) || i === null || !validIndex(i)) return;
            state().questionAnswer = currentRound.hints[i].answer;
            emitState();
        });

        // team: Teamname oder '' (Zuweisung entfernen)
        socket.on('adminAssignHinweisQuizHint', ({ index, team } = {}) => {
            if (!isAdmin(socket) || !validIndex(index) || typeof team !== 'string') return;
            if (team !== '' && !gameState.teams[team]) return;
            state().hintOwners[Number(index)] = team || null;
            publish();
        });

        socket.on('adminRevealHinweisQuizSolution', () => {
            if (!isAdmin(socket) || !currentRound || state().phase === 'IDLE') return;
            Object.assign(state(), {
                phase: 'SOLVED',
                solution: currentRound.solution,
                allHints: currentRound.hints.map((entry, index) => ({ ...entry, owner: state().hintOwners[index] })),
                buzzerLocked: true
            });
            publish();
        });
    }

    function register(socket) {
        registerAdminEvents(socket);
        socket.on('getHinweisQuizView', () => {
            if (isAdmin(socket) || spectatorSockets.has(socket.id)) socket.emit('hinweisQuizView', { hints: assignedHints() });
            else if (gameState.players[socket.id]) socket.emit('hinweisQuizView', viewForPlayer(socket.id));
        });
    }

    function renameTeam(oldName, newName) {
        const game = state();
        renameKey(game.scores, oldName, newName);
        game.hintOwners = game.hintOwners.map(owner => (owner === oldName ? newName : owner));
        game.allHints.forEach(entry => { if (entry.owner === oldName) entry.owner = newName; });
        if (game.buzzerTeam === oldName) game.buzzerTeam = newName;
    }

    return {
        id: 'HINWEIS_QUIZ',
        title: 'Hinweis Quiz',
        stateKey: 'hinweisQuizGame',
        clientModule: 'hinweis-quiz',
        maxScore: 5,
        buzzer: true,
        canBuzz: () => state().phase === 'PLAYING',
        createState,
        reset,
        register,
        renameTeam,
        emitUpdates,
        onScreenEnter: emitUpdates,
        onPlayerRegistered: emitPlayerViews,
        onAdminLogin: socket => socket.emit('hinweisQuizView', { hints: assignedHints() }),
        onSpectatorLogin: socket => socket.emit('hinweisQuizView', { hints: assignedHints() })
    };
};
