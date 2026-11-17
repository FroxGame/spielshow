'use strict';

const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

module.exports = function createFlaggenGame(ctx) {
    const { io, gameState, adminSockets, createScores, renameKey, utils } = ctx;

    const flaggenRoundsPath = path.join(ROOT, 'flaggen.json');

    let flaggenTimerInterval = null;

    function getFlaggenRounds() {
        return utils.readJsonFile(flaggenRoundsPath);
    }

    function createState() {
        return {
            flaggenGame: {
                phase: 'IDLE',
                country: null,
                targetFlag: null,
                elements: [],
                duration: 180,
                remaining: 0,
                timerRunning: false,
                buildingLocked: false,
                revealed: false,
                builders: {},
                boards: {},
                scores: createScores()
            }
        };
    }

    function reset() {
        if (flaggenTimerInterval) {
            clearInterval(flaggenTimerInterval);
            flaggenTimerInterval = null;
        }
        Object.assign(gameState, createState());
    }

    function register(socket) {
        socket.on('getFlaggenData', () => {
            if (!adminSockets.has(socket.id)) return;
            socket.emit('receiveFlaggenData', getFlaggenRounds());
        });

        socket.on('adminStartFlaggenRound', ({ country, duration, elements, targetFlag, builders }) => {
            if (!adminSockets.has(socket.id)) return;
            console.log('adminStartFlaggenRound received:', country, duration);
            if (flaggenTimerInterval) {
                clearInterval(flaggenTimerInterval);
                flaggenTimerInterval = null;
            }
            const teamNames = Object.keys(gameState.teams);
            const safeDuration = parseInt(duration, 10);
            const hasTimer = !isNaN(safeDuration) && safeDuration > 0;
            const dur = hasTimer ? safeDuration : 0;
            let roundElements = elements;
            let roundTargetFlag = targetFlag;
            if (!roundElements || !roundElements.length) {
                const rounds = getFlaggenRounds().rounds || [];
                let found = rounds.find(r => r.country.toLowerCase() === (country || '').toLowerCase());
                if (!found && rounds.length > 0) {
                    found = rounds[0];
                }
                if (found) {
                    roundElements = found.elements;
                    roundTargetFlag = found.targetFlag;
                    country = country || found.country;
                } else {
                    roundElements = [];
                }
            }
            const currentScores = (gameState.flaggenGame && gameState.flaggenGame.scores) || {};
            gameState.flaggenGame = {
                phase: 'PLAYING',
                country: country || 'Singapur',
                targetFlag: roundTargetFlag || null,
                elements: roundElements || [],
                duration: dur,
                remaining: dur,
                timerRunning: hasTimer,
                buildingLocked: false,
                revealed: false,
                builders: builders || (gameState.flaggenGame ? gameState.flaggenGame.builders : {}) || {},
                boards: Object.fromEntries(teamNames.map(team => [team, {
                    placements: [],
                    submitted: false
                }])),
                scores: Object.fromEntries(teamNames.map(team => [
                    team,
                    currentScores[team] || 0
                ]))
            };
            if (hasTimer) {
                flaggenTimerInterval = setInterval(() => {
                    if (gameState.flaggenGame.phase !== 'PLAYING') return;
                    gameState.flaggenGame.remaining -= 1;
                    if (gameState.flaggenGame.remaining <= 0) {
                        gameState.flaggenGame.remaining = 0;
                        gameState.flaggenGame.buildingLocked = true;
                        gameState.flaggenGame.timerRunning = false;
                        clearInterval(flaggenTimerInterval);
                        flaggenTimerInterval = null;
                    }
                    io.emit('stateUpdate', gameState);
                }, 1000);
            }
            io.emit('stateUpdate', gameState);
        });

        socket.on('adminSetFlaggenBuilders', ({ builders }) => {
            if (!adminSockets.has(socket.id)) return;
            if (!gameState.flaggenGame) return;
            gameState.flaggenGame.builders = builders || {};
            io.emit('stateUpdate', gameState);
        });

        socket.on('adminToggleFlaggenLock', () => {
            if (!adminSockets.has(socket.id)) return;
            if (!gameState.flaggenGame) return;
            gameState.flaggenGame.buildingLocked = !gameState.flaggenGame.buildingLocked;
            io.emit('stateUpdate', gameState);
        });

        socket.on('adminRevealFlaggen', () => {
            if (!adminSockets.has(socket.id)) return;
            if (!gameState.flaggenGame) return;
            gameState.flaggenGame.revealed = true;
            gameState.flaggenGame.buildingLocked = true;
            if (flaggenTimerInterval) {
                clearInterval(flaggenTimerInterval);
                flaggenTimerInterval = null;
            }
            gameState.flaggenGame.timerRunning = false;
            io.emit('stateUpdate', gameState);
        });



        socket.on('playerUpdateFlaggenBoard', ({ placements }) => {
            const game = gameState.flaggenGame;
            const player = gameState.players[socket.id];
            if (!game || !player || !player.team || game.phase !== 'PLAYING') return;
            if (game.buildingLocked) return;
            const builders = game.builders || {};
            const teamBuilder = builders[player.team];
            if (teamBuilder && teamBuilder !== socket.id) {
                return;
            }
            const board = game.boards[player.team];
            if (!board || !Array.isArray(placements)) return;
            board.placements = placements.map((p, idx) => ({
                id: String(p.id || 'p_' + idx),
                elementId: String(p.elementId || ''),
                x: Math.max(0, Math.min(1, Number(p.x) !== undefined ? Number(p.x) : 0.5)),
                y: Math.max(0, Math.min(1, Number(p.y) !== undefined ? Number(p.y) : 0.5)),
                rotation: Number(p.rotation) || 0,
                zIndex: Number(p.zIndex) || idx + 1
            }));
            io.emit('stateUpdate', gameState);
        });

        socket.on('playerClearFlaggenBoard', () => {
            const game = gameState.flaggenGame;
            const player = gameState.players[socket.id];
            if (!game || !player || !player.team || game.phase !== 'PLAYING') return;
            if (game.buildingLocked) return;
            const builders = game.builders || {};
            const teamBuilder = builders[player.team];
            if (teamBuilder && teamBuilder !== socket.id) return;
            if (game.boards[player.team]) {
                game.boards[player.team].placements = [];
            }
            io.emit('stateUpdate', gameState);
        });
    }

    function renameTeam(oldName, newName) {
        renameKey(gameState.flaggenGame.scores, oldName, newName);
        renameKey(gameState.flaggenGame.boards, oldName, newName);
        renameKey(gameState.flaggenGame.builders, oldName, newName);
    }

    return {
        id: 'FLAGGEN',
        title: 'Flaggen bauen',
        stateKey: 'flaggenGame',
        clientModule: 'flaggen',
        layout: 'wide',
        createState,
        reset,
        register,
        renameTeam
    };
};
