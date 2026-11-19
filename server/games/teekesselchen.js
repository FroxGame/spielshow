'use strict';

const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const MAX_WORD_LENGTH = 40;

/**
 * Teekesselchen: Beide Teams spielen gleichzeitig dasselbe Wort, unabhaengig voneinander.
 * In jedem Team bekommt ein Spieler Bedeutung 1 und ein anderer Bedeutung 2 (privat, nur die eigene).
 * Jeder traegt dazu ein Wort ein. Gibt der Admin die Woerter frei, sieht jeder das Wort seines Teampartners.
 * Danach buzzert das schnellere Team und nennt das Teekesselchen. Der Admin loest am Ende auf.
 * Inhalte: teekesselchen.json ({ rounds: [{ id, answer, category1, category2 }] }), nur per Admin-Event abrufbar.
 * Die Loesung und fremde Eingaben bleiben im Server, bis sie freigegeben bzw. aufgedeckt werden.
 */
module.exports = function createTeekesselchenGame(ctx) {
    const { io, gameState, adminSockets, spectatorSockets, createScores, renameKey, emitState, isAdmin, utils } = ctx;

    const roundsPath = path.join(ROOT, 'teekesselchen.json');
    const playerWords = {};         // playerId -> eingegebenes Wort
    let assignments = {};           // playerId -> { team, category }
    let currentRound = null;

    const state = () => gameState.teekesselchenGame;

    function readRounds() {
        const data = utils.readJsonFile(roundsPath);
        return Array.isArray(data.rounds) ? data.rounds : [];
    }

    function clearWords() {
        Object.keys(playerWords).forEach(playerId => delete playerWords[playerId]);
    }

    const teamPlayers = team => Object.values(gameState.players).filter(player => player.team === team);

    /**
     * Gibt jedem Spieler mit Team (maximal zwei je Team) eine der beiden Bedeutungen.
     * Wer schon eine hat und im Team bleibt, behaelt sie. Wird auch nach Teamwechseln erneut aufgerufen.
     */
    function ensureAssignments() {
        if (!currentRound) return;
        const categories = [currentRound.category1, currentRound.category2];
        Object.keys(gameState.teams).forEach(team => {
            const players = teamPlayers(team);
            players.forEach(player => {
                if (assignments[player.id] && assignments[player.id].team !== team) delete assignments[player.id];
            });
            const used = players.filter(player => assignments[player.id]).map(player => assignments[player.id].category);
            const free = categories.filter(category => !used.includes(category));
            if (free.length === 2 && Math.random() < 0.5) free.reverse();
            players.filter(player => !assignments[player.id]).forEach(player => {
                if (free.length) assignments[player.id] = { team, category: free.shift() };
            });
        });
        Object.keys(assignments).forEach(playerId => {
            if (!gameState.players[playerId]) delete assignments[playerId];
        });
    }

    function partnerOf(player) {
        return teamPlayers(player.team).find(other => other.id !== player.id && assignments[other.id]) || null;
    }

    function viewFor(playerId) {
        const player = gameState.players[playerId];
        const own = player && assignments[playerId];
        if (!own) return { category: '', ownWord: '', partnerName: '', partnerWord: '' };
        const partner = partnerOf(player);
        const released = state().wordsReleased;
        return {
            category: own.category,
            ownWord: playerWords[playerId] || '',
            partnerName: partner ? partner.name : '',
            partnerWord: released && partner ? (playerWords[partner.id] || '') : ''
        };
    }

    function emitPlayerViews() {
        ensureAssignments();
        Object.keys(gameState.players).forEach(playerId => io.to(playerId).emit('teekesselchenPlayerUpdate', viewFor(playerId)));
    }

    function describeTeam(team) {
        return teamPlayers(team).filter(player => assignments[player.id]).map(player => ({
            name: player.name,
            category: assignments[player.id].category,
            word: playerWords[player.id] || ''
        }));
    }

    function overview() {
        ensureAssignments();
        return Object.fromEntries(Object.keys(gameState.teams).map(team => [team, describeTeam(team)]));
    }

    const emptyOverview = () => Object.fromEntries(Object.keys(gameState.teams).map(team => [team, []]));

    function emitOverviews() {
        const full = overview();
        adminSockets.forEach(id => io.to(id).emit('teekesselchenOverview', full));
        const forSpectators = state().wordsReleased ? full : emptyOverview();
        spectatorSockets.forEach(id => io.to(id).emit('teekesselchenOverview', forSpectators));
    }

    function startRound(round) {
        currentRound = round;
        assignments = {};
        clearWords();
        Object.assign(state(), {
            phase: 'WRITING',
            roundId: round.id,
            answer: '',
            wordsReleased: false,
            revealedTeams: {},
            buzzerLocked: false,
            buzzerWinner: null,
            buzzerTeam: null
        });
        ensureAssignments();
    }

    function createState() {
        return {
            teekesselchenGame: {
                phase: 'IDLE',
                roundId: null,
                answer: '',
                wordsReleased: false,
                revealedTeams: {},
                buzzerLocked: false,
                buzzerWinner: null,
                buzzerTeam: null,
                scores: createScores()
            }
        };
    }

    function reset() {
        currentRound = null;
        assignments = {};
        clearWords();
        Object.assign(gameState, createState());
        emitPlayerViews();
        emitOverviews();
    }

    function register(socket) {
        socket.on('getTeekesselchenRounds', () => {
            if (!isAdmin(socket)) return;
            socket.emit('receiveTeekesselchenRounds', readRounds());
        });

        socket.on('adminStartTeekesselchenRound', ({ roundId } = {}) => {
            if (!isAdmin(socket)) return;
            const round = readRounds().find(entry => entry.id === roundId);
            if (!round) return;
            startRound(round);
            emitState();
            emitPlayerViews();
            emitOverviews();
        });

        socket.on('getTeekesselchenView', () => {
            if (!gameState.players[socket.id]) return;
            ensureAssignments();
            socket.emit('teekesselchenPlayerUpdate', viewFor(socket.id));
        });

        socket.on('getTeekesselchenOverview', () => {
            if (isAdmin(socket)) socket.emit('teekesselchenOverview', overview());
            else if (spectatorSockets.has(socket.id)) socket.emit('teekesselchenOverview', state().wordsReleased ? overview() : emptyOverview());
        });

        socket.on('updateTeekesselchenWord', word => {
            if (state().phase !== 'WRITING' || !gameState.players[socket.id]) return;
            ensureAssignments();
            if (!assignments[socket.id]) return;
            playerWords[socket.id] = utils.sanitizeString(word, MAX_WORD_LENGTH).replace(/\s+/g, ' ');
            adminSockets.forEach(id => io.to(id).emit('teekesselchenOverview', overview()));
        });

        // Gibt die Woerter frei: Teampartner sehen sich gegenseitig, der Buzzer ist offen.
        socket.on('adminReleaseTeekesselchenWords', () => {
            if (!isAdmin(socket) || state().phase !== 'WRITING') return;
            Object.assign(state(), { phase: 'GUESSING', wordsReleased: true });
            emitState();
            emitPlayerViews();
            emitOverviews();
        });

        socket.on('adminRevealTeekesselchen', () => {
            if (!isAdmin(socket) || !currentRound) return;
            ensureAssignments();
            Object.assign(state(), {
                phase: 'REVEALED',
                wordsReleased: true,
                answer: currentRound.answer,
                revealedTeams: overview()
            });
            emitState();
            emitPlayerViews();
            emitOverviews();
        });
    }

    function renameTeam(oldName, newName) {
        renameKey(state().scores, oldName, newName);
        renameKey(state().revealedTeams, oldName, newName);
        Object.values(assignments).forEach(entry => {
            if (entry.team === oldName) entry.team = newName;
        });
        if (state().buzzerTeam === oldName) state().buzzerTeam = newName;
    }

    return {
        id: 'TEEKESSELCHEN',
        title: 'Teekesselchen',
        stateKey: 'teekesselchenGame',
        clientModule: 'teekesselchen',
        buzzer: true,
        canBuzz: () => state().phase === 'WRITING' || state().phase === 'GUESSING',
        createState,
        reset,
        register,
        renameTeam,
        onPlayerRegistered: emitPlayerViews,
        onAdminLogin: socket => socket.emit('teekesselchenOverview', overview()),
        onSpectatorLogin: socket => socket.emit('teekesselchenOverview', state().wordsReleased ? overview() : emptyOverview())
    };
};
