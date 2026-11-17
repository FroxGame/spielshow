'use strict';

const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

module.exports = function createBingoGame(ctx) {
    const { io, gameState, adminSockets, createScores, renameKey, utils } = ctx;

    const referatTopicsPath = path.join(ROOT, 'bingo.json');

    function getReferatTopics() {
        return utils.readJsonArray(referatTopicsPath, t => typeof t === 'string' && t.trim());
    }

    function createState() {
        return {
            referatBingo: {
                phase: 'IDLE',
                topic: '',
                topicRevealed: false,
                referatPlayerId: null,
                referatTeam: null,
                opposingTeam: null,
                partnerWords: Array(9).fill(''),
                partnerMarked: Array(9).fill(false),
                opposingWords: Array(9).fill(''),
                opposingMarked: Array(9).fill(false),
                scores: createScores()
            }
        };
    }

    function reset() {
        Object.assign(gameState, createState());
    }

    function register(socket) {
        socket.on('getReferatTopics', () => {
            if (!adminSockets.has(socket.id)) return;
            socket.emit('receiveReferatTopics', getReferatTopics());
        });

        socket.on('adminStartBingo', ({ topic, referatPlayerId }) => {
            if (!adminSockets.has(socket.id)) return;
            const player = gameState.players[referatPlayerId];
            if (!player) return;
            const referatTeam = player.team;
            const allTeams = Object.keys(gameState.teams);
            const opposingTeam = allTeams.find(t => t !== referatTeam) || (referatTeam === 'Team 1' ? 'Team 2' : 'Team 1');
            gameState.referatBingo = {
                phase: 'PREPARING',
                topic: String(topic || '').trim(),
                topicRevealed: false,
                referatPlayerId: referatPlayerId,
                referatTeam: referatTeam,
                opposingTeam: opposingTeam,
                partnerWords: Array(9).fill(''),
                partnerMarked: Array(9).fill(false),
                opposingWords: Array(9).fill(''),
                opposingMarked: Array(9).fill(false),
                scores: gameState.referatBingo.scores || { 'Team 1': 0, 'Team 2': 0 }
            };
            io.emit('stateUpdate', gameState);
        });

        socket.on('adminBingoStartPlaying', () => {
            if (!adminSockets.has(socket.id)) return;
            if (!gameState.referatBingo || gameState.referatBingo.phase === 'IDLE') return;
            gameState.referatBingo.phase = 'PLAYING';
            io.emit('stateUpdate', gameState);
        });

        socket.on('adminRevealBingoTopic', () => {
            if (!adminSockets.has(socket.id)) return;
            if (!gameState.referatBingo) return;
            gameState.referatBingo.topicRevealed = !gameState.referatBingo.topicRevealed;
            io.emit('stateUpdate', gameState);
        });

        socket.on('playerUpdateBingoWords', ({ role, words }) => {
            if (!gameState.referatBingo) return;
            const player = gameState.players[socket.id];
            if (!player) return;
            // Security check
            if (role === 'partner') {
                if (player.team !== gameState.referatBingo.referatTeam || socket.id === gameState.referatBingo.referatPlayerId) {
                    return;
                }
                if (Array.isArray(words)) {
                    gameState.referatBingo.partnerWords = words.slice(0, 9).map(w => String(w || '').slice(0, 50));
                    io.emit('stateUpdate', gameState);
                }
            } else if (role === 'opposing') {
                if (player.team !== gameState.referatBingo.opposingTeam) {
                    return;
                }
                if (Array.isArray(words)) {
                    gameState.referatBingo.opposingWords = words.slice(0, 9).map(w => String(w || '').slice(0, 50));
                    io.emit('stateUpdate', gameState);
                }
            }
        });

        socket.on('playerToggleBingoMark', ({ role, index }) => {
            if (!gameState.referatBingo || gameState.referatBingo.phase !== 'PLAYING') return;
            const player = gameState.players[socket.id];
            if (!player) return;
            const idx = parseInt(index);
            if (isNaN(idx) || idx < 0 || idx >= 9) return;
            if (role === 'partner') {
                if (player.team !== gameState.referatBingo.referatTeam || socket.id === gameState.referatBingo.referatPlayerId) return;
                gameState.referatBingo.partnerMarked[idx] = !gameState.referatBingo.partnerMarked[idx];
                io.emit('stateUpdate', gameState);
            } else if (role === 'opposing') {
                if (player.team !== gameState.referatBingo.opposingTeam) return;
                gameState.referatBingo.opposingMarked[idx] = !gameState.referatBingo.opposingMarked[idx];
                io.emit('stateUpdate', gameState);
            }
        });
    }

    function renameTeam(oldName, newName) {
        renameKey(gameState.referatBingo.scores, oldName, newName);
        ['referatTeam', 'opposingTeam'].forEach(key => {
            if (gameState.referatBingo[key] === oldName) gameState.referatBingo[key] = newName;
        });
    }

    return {
        id: 'BINGO',
        title: 'Referat Bingo',
        stateKey: 'referatBingo',
        clientModule: 'bingo',
        maxScore: null,
        createState,
        reset,
        register,
        renameTeam
    };
};
