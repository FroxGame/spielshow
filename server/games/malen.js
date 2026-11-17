'use strict';

const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

module.exports = function createMalenGame(ctx) {
    const { io, gameState, adminSockets, createScores, byTeam, renameKey, utils } = ctx;

    const malenWordsPath = path.join(ROOT, 'malen.json');

    function getMalenWords() {
        return utils.readJsonArray(malenWordsPath, t => typeof t === 'string' && t.trim());
    }

    /** Nur Spieler des jeweiligen Teams duerfen Maler sein. Alles andere wird zu "kein Maler". */
    function normalizePainters(painters) {
        return byTeam(team => {
            const player = gameState.players[painters[team]];
            return player && player.team === team ? player.id : null;
        });
    }

    function startNewWord(word) {
        const game = gameState.malenGame;
        game.word = String(word || '').trim();
        game.wordRevealed = false;
        game.drawings = byTeam(() => []);
        io.emit('malenCanvasCleared', { team: 'ALL' });
    }

    function createState() {        return {
            malenGame: {
                phase: 'IDLE',
                word: '',
                wordRevealed: false,
                painters: byTeam(() => null),
                drawings: byTeam(() => []),
                scores: createScores()
            }
        };
    }

    function reset() {
        Object.assign(gameState, createState());
        io.emit('malenCanvasCleared', { team: 'ALL' });
    }

    function register(socket) {
        socket.on('getMalenWords', () => {
            socket.emit('receiveMalenWords', getMalenWords());
        });

        socket.on('adminStartMalenRound', ({ word, painters } = {}) => {
            if (!adminSockets.has(socket.id)) return;
            const game = gameState.malenGame;
            game.phase = 'PLAYING';
            startNewWord(word);
            if (painters) game.painters = normalizePainters(painters);
            io.emit('stateUpdate', gameState);
        });

        socket.on('adminSetMalenWord', word => {
            if (!adminSockets.has(socket.id)) return;
            startNewWord(word);
            io.emit('stateUpdate', gameState);
        });

        socket.on('adminSetMalenPainters', painters => {
            if (!adminSockets.has(socket.id) || !painters || typeof painters !== 'object') return;
            gameState.malenGame.painters = normalizePainters(painters);
            io.emit('stateUpdate', gameState);
        });

        socket.on('adminRevealMalenWord', () => {
            if (!adminSockets.has(socket.id) || gameState.malenGame.phase !== 'PLAYING') return;
            gameState.malenGame.wordRevealed = true;
            io.emit('stateUpdate', gameState);
        });
        socket.on('adminClearAllMalenCanvases', () => {
            if (!adminSockets.has(socket.id)) return;
            if (!gameState.malenGame) return;
            gameState.malenGame.drawings = Object.fromEntries(Object.keys(gameState.teams).map(team => [team, []]));
            io.emit('malenCanvasCleared', { team: 'ALL' });
            io.emit('stateUpdate', gameState);
        });


        socket.on('playerMalenDrawBatch', ({ lines }) => {
            if (!gameState.malenGame || gameState.malenGame.phase !== 'PLAYING') return;
            const player = gameState.players[socket.id];
            if (!player) return;
            const team = player.team;
            if (!team) return;
            // Check if player is the assigned painter for their team
            if (gameState.malenGame.painters[team] && gameState.malenGame.painters[team] !== socket.id) {
                return;
            }
            if (Array.isArray(lines) && lines.length > 0) {
                // Cap lines to prevent memory explosion
                if (!gameState.malenGame.drawings[team]) {
                    gameState.malenGame.drawings[team] = [];
                }
                if (gameState.malenGame.drawings[team].length < 15000) {
                    gameState.malenGame.drawings[team].push(...lines);
                }
                // Broadcast the new lines immediately to everyone
                io.emit('malenLinesAdded', { team, lines });
            }
        });

        socket.on('playerClearMalenCanvas', () => {
            if (!gameState.malenGame || gameState.malenGame.phase !== 'PLAYING') return;
            const player = gameState.players[socket.id];
            if (!player) return;
            const team = player.team;
            if (!team) return;
            // Only the painter can clear their team canvas
            if (gameState.malenGame.painters[team] && gameState.malenGame.painters[team] !== socket.id) {
                return;
            }
            if (gameState.malenGame.drawings[team]) {
                gameState.malenGame.drawings[team] = [];
            }
            io.emit('malenCanvasCleared', { team });
        });
    }

    function renameTeam(oldName, newName) {
        renameKey(gameState.malenGame.scores, oldName, newName);
        renameKey(gameState.malenGame.painters, oldName, newName);
        renameKey(gameState.malenGame.drawings, oldName, newName);
    }

    function registerRoutes(app) {
        app.get('/malen.json', (req, res) => {
            res.sendFile(malenWordsPath);
        });
    }

    return {
        id: 'MALEN',
        title: 'Blindes Malen',
        stateKey: 'malenGame',
        clientModule: 'malen',
        layout: 'wide',
        maxScore: null,
        createState,
        reset,
        register,
        renameTeam,
        registerRoutes
    };
};
