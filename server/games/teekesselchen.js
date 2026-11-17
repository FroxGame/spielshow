'use strict';

const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const MIN_SECONDS = 10;
const MAX_SECONDS = 300;
const DEFAULT_SECONDS = 60;
const MAX_TEXT_LENGTH = 200;

/**
 * Teekesselchen: Jedes Team bekommt eine andere Bedeutung desselben Worts und beschreibt sie schriftlich.
 * Danach wird per Buzzer das gemeinsame Wort erraten. Loesung und Bedeutungen bleiben serverseitig,
 * bis der Admin sie aufdeckt. Die eigene Bedeutung bekommt jedes Team ueber einen privaten Kanal.
 */
module.exports = function createTeekesselchenGame(ctx) {
    const { io, gameState, createScores, renameKey, emitState, isAdmin, utils } = ctx;

    const roundsPath = path.join(ROOT, 'teekesselchen.json');
    const playerTexts = {};
    let currentRound = null;
    let teamCategories = {};
    let countdownTimer = null;

    const state = () => gameState.teekesselchenGame;

    function readRounds() {
        const data = utils.readJsonFile(roundsPath);
        return Array.isArray(data.rounds) ? data.rounds : [];
    }

    function stopTimer() {
        if (countdownTimer) clearInterval(countdownTimer);
        countdownTimer = null;
    }

    function assignCategories(round) {
        const categories = [round.category1, round.category2];
        const teams = Object.keys(gameState.teams);
        return Object.fromEntries(teams.map((team, index) => [team, categories[index % categories.length]]));
    }

    function emitPlayerViews() {
        Object.values(gameState.players).forEach(player => {
            io.to(player.id).emit('teekesselchenPlayerUpdate', {
                category: teamCategories[player.team] || '',
                ownText: playerTexts[player.id] || ''
            });
        });
    }

    function closeWriting() {
        stopTimer();
        if (state().phase === 'WRITING') state().phase = 'GUESSING';
    }

    function tick() {
        state().timeRemaining -= 1;
        if (state().timeRemaining <= 0) {
            state().timeRemaining = 0;
            closeWriting();
        }
        emitState();
    }

    function startRound(round, seconds) {
        stopTimer();
        currentRound = round;
        teamCategories = assignCategories(round);
        Object.keys(playerTexts).forEach(playerId => delete playerTexts[playerId]);
        Object.assign(state(), {
            phase: 'WRITING',
            roundId: round.id,
            timeRemaining: seconds,
            answer: '',
            revealedTeams: {},
            buzzerLocked: false,
            buzzerWinner: null,
            buzzerTeam: null
        });
        countdownTimer = setInterval(tick, 1000);
    }

    function describeTeam(team) {
        const players = Object.values(gameState.players).filter(player => player.team === team);
        return {
            category: teamCategories[team] || '',
            texts: players.map(player => ({ name: player.name, text: playerTexts[player.id] || '' })).filter(entry => entry.text)
        };
    }

    function createState() {
        return {
            teekesselchenGame: {
                phase: 'IDLE',
                roundId: null,
                timeRemaining: 0,
                answer: '',
                revealedTeams: {},
                buzzerLocked: false,
                buzzerWinner: null,
                buzzerTeam: null,
                scores: createScores()
            }
        };
    }

    function reset() {
        stopTimer();
        currentRound = null;
        teamCategories = {};
        Object.keys(playerTexts).forEach(playerId => delete playerTexts[playerId]);
        Object.assign(gameState, createState());
        emitPlayerViews();
    }

    function register(socket) {
        socket.on('getTeekesselchenRounds', () => {
            if (!isAdmin(socket)) return;
            socket.emit('receiveTeekesselchenRounds', readRounds());
        });

        socket.on('adminStartTeekesselchenRound', ({ roundId, duration } = {}) => {
            if (!isAdmin(socket)) return;
            const round = readRounds().find(entry => entry.id === roundId);
            if (!round) return;
            const seconds = Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, parseInt(duration, 10) || DEFAULT_SECONDS));
            startRound(round, seconds);
            emitState();
            emitPlayerViews();
        });

        socket.on('getTeekesselchenView', () => {
            const player = gameState.players[socket.id];
            if (!player) return;
            socket.emit('teekesselchenPlayerUpdate', {
                category: teamCategories[player.team] || '',
                ownText: playerTexts[socket.id] || ''
            });
        });

        socket.on('updateTeekesselchenText', text => {
            if (state().phase !== 'WRITING' || !gameState.players[socket.id]) return;
            playerTexts[socket.id] = utils.sanitizeString(text, MAX_TEXT_LENGTH);
        });

        socket.on('adminCloseTeekesselchenInputs', () => {
            if (!isAdmin(socket) || state().phase !== 'WRITING') return;
            closeWriting();
            emitState();
        });

        socket.on('adminRevealTeekesselchenTeam', team => {
            if (!isAdmin(socket) || !currentRound || !gameState.teams[team]) return;
            state().revealedTeams[team] = describeTeam(team);
            emitState();
        });

        socket.on('adminRevealTeekesselchen', () => {
            if (!isAdmin(socket) || !currentRound) return;
            stopTimer();
            state().phase = 'REVEALED';
            state().answer = currentRound.answer;
            Object.keys(gameState.teams).forEach(team => {
                state().revealedTeams[team] = describeTeam(team);
            });
            emitState();
        });
    }

    function renameTeam(oldName, newName) {
        renameKey(state().scores, oldName, newName);
        renameKey(state().revealedTeams, oldName, newName);
        renameKey(teamCategories, oldName, newName);
        if (state().buzzerTeam === oldName) state().buzzerTeam = newName;
    }

    return {
        id: 'TEEKESELCHEN',
        title: 'Teekesselchen',
        stateKey: 'teekesselchenGame',
        clientModule: 'teekesselchen',
        buzzer: true,
        canBuzz: () => state().phase === 'GUESSING',
        createState,
        reset,
        register,
        renameTeam,
        onPlayerRegistered: emitPlayerViews
    };
};
