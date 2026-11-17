'use strict';

const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

module.exports = function createKarteGame(ctx) {
    const { io, gameState, adminSockets, createScores, byTeam, renameKey, utils } = ctx;

    const kartePlacesPath = path.join(ROOT, 'karte.json');

    function getKartePlaces() {
        return utils.readJsonArray(kartePlacesPath);
    }

    function createState() {
        return {
            karteGame: {
                phase: 'IDLE',
                target: null,
                pinners: byTeam(() => null),
                guesses: byTeam(() => null),
                locked: byTeam(() => false),
                revealed: { ...byTeam(() => false), target: false },
                scores: createScores()
            }
        };
    }

    function reset() {
        Object.assign(gameState, createState());
    }

    function register(socket) {
        socket.on('getKartePlaces', () => {
            if (!adminSockets.has(socket.id)) return;
            socket.emit('receiveKartePlaces', getKartePlaces());
        });

        socket.on('adminStartKarteRound', ({ target, pinners }) => {
            if (!adminSockets.has(socket.id)) return;
            if (!gameState.karteGame) {
                gameState.karteGame = {
                    phase: 'IDLE',
                    target: null,
                    pinners: { 'Team 1': null, 'Team 2': null },
                    guesses: { 'Team 1': null, 'Team 2': null },
                    locked: { 'Team 1': false, 'Team 2': false },
                    revealed: { 'Team 1': false, 'Team 2': false, 'target': false, 'distances': false },
                    scores: { 'Team 1': 0, 'Team 2': 0 }
                };
            }
            gameState.karteGame.phase = 'PLAYING';
            gameState.karteGame.target = target || null;
            if (pinners && typeof pinners === 'object') {
                gameState.karteGame.pinners = {
                    [Object.keys(gameState.teams)[0] || 'Team 1']: pinners[Object.keys(gameState.teams)[0]] || pinners['Team 1'] || null,
                    [Object.keys(gameState.teams)[1] || 'Team 2']: pinners[Object.keys(gameState.teams)[1]] || pinners['Team 2'] || null
                };
            }
            gameState.karteGame.guesses = { 'Team 1': null, 'Team 2': null };
            gameState.karteGame.locked = { 'Team 1': false, 'Team 2': false };
            gameState.karteGame.revealed = { 'Team 1': false, 'Team 2': false, 'target': false, 'distances': false };
            io.emit('stateUpdate', gameState);
        });

        socket.on('adminSetKartePinners', (pinners) => {
            if (!adminSockets.has(socket.id)) return;
            if (!gameState.karteGame) return;
            if (pinners && typeof pinners === 'object') {
                gameState.karteGame.pinners = {
                    [Object.keys(gameState.teams)[0] || 'Team 1']: pinners[Object.keys(gameState.teams)[0]] || pinners['Team 1'] || null,
                    [Object.keys(gameState.teams)[1] || 'Team 2']: pinners[Object.keys(gameState.teams)[1]] || pinners['Team 2'] || null
                };
                io.emit('stateUpdate', gameState);
            }
        });

        socket.on('adminRevealKartePin', (team) => {
            if (!adminSockets.has(socket.id)) return;
            if (!gameState.karteGame || !gameState.karteGame.revealed) return;
            if (team === 'target') {
                gameState.karteGame.revealed.target = !gameState.karteGame.revealed.target;
            } else if (team === 'distances') {
                gameState.karteGame.revealed.distances = !gameState.karteGame.revealed.distances;
            } else if (team === 'Team 1' || team === 'Team 2' || gameState.teams[team]) {
                const teamNames = Object.keys(gameState.teams);
                const resolvedTeam = team === 'Team 1'
                    ? (teamNames[0] || 'Team 1')
                    : team === 'Team 2'
                        ? (teamNames[1] || 'Team 2')
                        : team;
                gameState.karteGame.revealed[resolvedTeam] = !gameState.karteGame.revealed[resolvedTeam];
            }
            io.emit('stateUpdate', gameState);
        });


        socket.on('playerSetKarteGuess', ({ lat, lng }) => {
            if (!gameState.karteGame || gameState.karteGame.phase !== 'PLAYING') return;
            const player = gameState.players[socket.id];
            if (!player) return;
            const team = player.team;
            if (!team) return;
            // Check if player is the assigned pinner and not locked
            if (gameState.karteGame.pinners[team] && gameState.karteGame.pinners[team] !== socket.id) return;
            if (gameState.karteGame.locked[team]) return;
            gameState.karteGame.guesses[team] = {
                lat: parseFloat(lat),
                lng: parseFloat(lng)
            };
            io.emit('stateUpdate', gameState);
        });

        socket.on('playerLockKarteGuess', () => {
            if (!gameState.karteGame || gameState.karteGame.phase !== 'PLAYING') return;
            const player = gameState.players[socket.id];
            if (!player) return;
            const team = player.team;
            if (!team) return;
            if (gameState.karteGame.pinners[team] && gameState.karteGame.pinners[team] !== socket.id) return;
            if (!gameState.karteGame.guesses[team]) return;
            gameState.karteGame.locked[team] = true;
            io.emit('stateUpdate', gameState);
        });
    }

    function renameTeam(oldName, newName) {
        renameKey(gameState.karteGame.scores, oldName, newName);
        renameKey(gameState.karteGame.pinners, oldName, newName);
        renameKey(gameState.karteGame.guesses, oldName, newName);
        renameKey(gameState.karteGame.locked, oldName, newName);
        renameKey(gameState.karteGame.revealed, oldName, newName);
    }

    return {
        id: 'KARTE',
        title: 'Wo ist das auf der Karte?',
        stateKey: 'karteGame',
        clientModule: 'karte',
        layout: 'fullscreen',
        maxScore: 7,
        createState,
        reset,
        register,
        renameTeam
    };
};
