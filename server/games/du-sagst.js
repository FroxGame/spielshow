'use strict';

const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const OPTION_COUNT = 4;
const ROLE_KEYS = ['answerer', 'guesser'];

/**
 * Du sagst: Eine Frage mit vier Antworten. Beide Teams spielen gleichzeitig.
 * Je Team klickt ein Spieler an, was er antworten wuerde (Antwortender), der andere schaetzt,
 * was sein Partner anklickt (Einschaetzender). Die Rollen vergibt der Admin per Hand (bleiben ueber Fragen hinweg).
 * Auswahl ist aenderbar, bis der Admin schliesst.
 * Admin und Zuschauer sehen alle Auswahlen live ueber einen eigenen Kanal (duSagstOverview).
 * Spieler sehen nur die eigene Auswahl, bis der Admin Antworten bzw. Einschaetzungen aufdeckt.
 * Inhalte: du-sagst.json (Array aus { id, question, options: [4 Texte] }), nur per Admin-Event abrufbar.
 */
module.exports = function createDuSagstGame(ctx) {
    const { io, gameState, adminSockets, spectatorSockets, createScores, byTeam, teamNames,
        renameKey, emitState, addStateDecorator, isAdmin, utils } = ctx;

    const questionsPath = path.join(ROOT, 'du-sagst.json');
    const choices = {};             // playerId -> gewaehlter Index (0..3)
    let rolesSignature = '';

    const state = () => gameState.duSagstGame;

    const readQuestions = () => utils.readJsonArray(questionsPath, entry =>
        entry && typeof entry.id === 'string' && typeof entry.question === 'string'
        && Array.isArray(entry.options) && entry.options.length === OPTION_COUNT
        && entry.options.every(option => typeof option === 'string'));

    const emptyRole = () => ({ answerer: null, guesser: null });
    const teamPlayerIds = team => Object.values(gameState.players)
        .filter(player => player.team === team).map(player => player.id);

    function clearChoices() {
        Object.keys(choices).forEach(playerId => delete choices[playerId]);
    }

    /** Der Admin vergibt die Rollen. Verlaesst ein Spieler das Team, wird seine Rolle frei. */
    function ensureRoles() {
        const roles = state().roles;
        teamNames().forEach(team => {
            const ids = teamPlayerIds(team);
            const role = roles[team] || emptyRole();
            ROLE_KEYS.forEach(key => {
                if (role[key] && !ids.includes(role[key])) {
                    delete choices[role[key]];
                    role[key] = null;
                }
            });
            roles[team] = role;
        });
    }

    /** Setzt eine Rolle. Hatte der Spieler die andere Rolle, wird sie frei. Betroffene Auswahlen verfallen. */
    function setRole(team, key, playerId) {
        const role = state().roles[team];
        const otherKey = key === 'answerer' ? 'guesser' : 'answerer';
        delete choices[role[key]];
        if (playerId && role[otherKey] === playerId) role[otherKey] = null;
        if (playerId) delete choices[playerId];
        role[key] = playerId;
    }

    const choiceOf = playerId => (playerId && choices[playerId] !== undefined ? choices[playerId] : null);

    function overview() {
        return byTeam(team => {
            const role = state().roles[team] || emptyRole();
            return { answer: choiceOf(role.answerer), guess: choiceOf(role.guesser) };
        });
    }

    function updateRevealed() {
        const { answersRevealed, guessesRevealed } = state();
        const full = overview();
        state().revealed = byTeam(team => ({
            answer: answersRevealed ? full[team].answer : null,
            guess: guessesRevealed ? full[team].guess : null
        }));
    }

    function emitPlayerViews() {
        Object.keys(gameState.players).forEach(playerId =>
            io.to(playerId).emit('duSagstPlayerUpdate', { choice: choiceOf(playerId) }));
    }

    function emitOverviews() {
        const full = overview();
        [...adminSockets, ...spectatorSockets].forEach(id => io.to(id).emit('duSagstOverview', full));
    }

    function emitUpdates() {
        emitPlayerViews();
        emitOverviews();
    }

    // Vor jedem stateUpdate: Rollen nachziehen und Aufgedecktes aktualisieren.
    // Aendern sich die Rollen (z. B. Teamwechsel), bekommen Admin und Zuschauer eine neue Uebersicht.
    addStateDecorator(() => {
        if (!state()) return;
        ensureRoles();
        updateRevealed();
        const signature = JSON.stringify(state().roles);
        if (signature !== rolesSignature) {
            rolesSignature = signature;
            setImmediate(emitOverviews);
        }
    });

    function createState() {
        return {
            duSagstGame: {
                phase: 'IDLE',          // IDLE | OPEN | CLOSED
                questionId: null,
                question: '',
                options: [],
                roles: byTeam(emptyRole),
                answersRevealed: false,
                guessesRevealed: false,
                revealed: byTeam(() => ({ answer: null, guess: null })),
                scores: createScores()
            }
        };
    }

    function reset() {
        clearChoices();
        rolesSignature = '';
        Object.assign(gameState, createState());
    }

    function startQuestion(question) {
        clearChoices();
        Object.assign(state(), {
            phase: 'OPEN',
            questionId: question.id,
            question: question.question,
            options: question.options.slice(),
            answersRevealed: false,
            guessesRevealed: false
        });
        emitState();
        emitUpdates();
    }

    function registerAdminEvents(socket) {
        socket.on('getDuSagstQuestions', () => {
            if (!isAdmin(socket)) return;
            socket.emit('receiveDuSagstQuestions', readQuestions().map(({ id, question }) => ({ id, question })));
        });

        socket.on('adminStartDuSagstQuestion', ({ questionId } = {}) => {
            if (!isAdmin(socket) || typeof questionId !== 'string') return;
            const question = readQuestions().find(entry => entry.id === questionId);
            if (question) startQuestion(question);
        });

        // Schliessen sperrt die Auswahl, erneutes Klicken oeffnet sie wieder.
        socket.on('adminToggleDuSagstClosed', () => {
            if (!isAdmin(socket) || state().phase === 'IDLE') return;
            state().phase = state().phase === 'OPEN' ? 'CLOSED' : 'OPEN';
            emitState();
        });

        socket.on('adminRevealDuSagstAnswers', () => {
            if (!isAdmin(socket) || state().phase === 'IDLE') return;
            state().answersRevealed = true;
            emitState();
        });

        socket.on('adminRevealDuSagstGuesses', () => {
            if (!isAdmin(socket) || state().phase === 'IDLE') return;
            state().guessesRevealed = true;
            emitState();
        });

        socket.on('adminSetDuSagstRole', ({ team, role, playerId } = {}) => {
            if (!isAdmin(socket) || !utils.isValidTeamName(team) || !state().roles[team] || !ROLE_KEYS.includes(role)) return;
            const id = playerId || null;
            if (id !== null && (typeof id !== 'string' || !gameState.players[id] || gameState.players[id].team !== team)) return;
            setRole(team, role, id);
            emitState();
            emitUpdates();
        });
    }

    function registerViewEvents(socket) {
        socket.on('getDuSagstView', () => {
            if (!gameState.players[socket.id]) return;
            socket.emit('duSagstPlayerUpdate', { choice: choiceOf(socket.id) });
        });

        socket.on('getDuSagstOverview', () => {
            if (!isAdmin(socket) && !spectatorSockets.has(socket.id)) return;
            socket.emit('duSagstOverview', overview());
        });

        socket.on('playerChooseDuSagst', index => {
            const player = gameState.players[socket.id];
            if (state().phase !== 'OPEN' || !player || !utils.isValidIndex(index, 0, OPTION_COUNT - 1)) return;
            const role = state().roles[player.team];
            if (!role || (role.answerer !== socket.id && role.guesser !== socket.id)) return;
            choices[socket.id] = Number(index);
            socket.emit('duSagstPlayerUpdate', { choice: choices[socket.id] });
            emitOverviews();
            if (state().answersRevealed || state().guessesRevealed) emitState();
        });
    }

    function register(socket) {
        registerAdminEvents(socket);
        registerViewEvents(socket);
    }

    function renameTeam(oldName, newName) {
        renameKey(state().scores, oldName, newName);
        renameKey(state().roles, oldName, newName);
        renameKey(state().revealed, oldName, newName);
    }

    return {
        id: 'DU_SAGST',
        title: 'Du sagst',
        stateKey: 'duSagstGame',
        clientModule: 'du-sagst',
        maxScore: 5,
        createState,
        reset,
        register,
        renameTeam,
        emitUpdates,
        onScreenEnter: emitUpdates,
        onPlayerRegistered: emitPlayerViews,
        onAdminLogin: socket => socket.emit('duSagstOverview', overview()),
        onSpectatorLogin: socket => socket.emit('duSagstOverview', overview())
    };
};
