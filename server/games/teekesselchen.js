'use strict';

const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
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

    const state = () => gameState.teekesselchenGame;

    function readRounds() {
        const data = utils.readJsonFile(roundsPath);
        return Array.isArray(data.rounds) ? data.rounds : [];
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
        if (state().phase === 'WRITING') state().phase = 'GUESSING';
    }

    function startRound(round) {
        currentRound = round;
        teamCategories = assignCategories(round);
        Object.keys(playerTexts).forEach(playerId => delete playerTexts[playerId]);
        Object.assign(state(), {
            phase: 'WRITING',
            roundId: round.id,
            answer: '',
            revealedTeams: {},
            buzzerLocked: false,
            buzzerWinner: null,
            buzzerTeam: null
        });
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

        socket.on('adminStartTeekesselchenRound', ({ roundId } = {}) => {
            if (!isAdmin(socket)) return;
            const round = readRounds().find(entry => entry.id === roundId);
            if (!round) return;
            startRound(round);
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
        id: 'TEEKESSELCHEN',
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
