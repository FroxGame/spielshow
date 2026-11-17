'use strict';

const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

module.exports = function createBingoGame(ctx) {
    const { io, gameState, adminSockets, createScores, renameKey, utils } = ctx;

    const referatTopicsPath = path.join(ROOT, 'bingo.json');

    let bingoTimerInterval = null;

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
                timer: { duration: 120, remaining: 120, running: false },
                scores: createScores()
            }
        };
    }

    function reset() {
        if (bingoTimerInterval) {
            clearInterval(bingoTimerInterval);
            bingoTimerInterval = null;
        }
        Object.assign(gameState, createState());
    }

    function register(socket) {
        socket.on('getReferatTopics', () => {
            if (!adminSockets.has(socket.id)) return;
            socket.emit('receiveReferatTopics', getReferatTopics());
        });

        socket.on('adminStartBingo', ({ topic, referatPlayerId, timerDuration }) => {
            if (!adminSockets.has(socket.id)) return;
            const player = gameState.players[referatPlayerId];
            if (!player) return;
            const referatTeam = player.team;
            const allTeams = Object.keys(gameState.teams);
            const opposingTeam = allTeams.find(t => t !== referatTeam) || (referatTeam === 'Team 1' ? 'Team 2' : 'Team 1');
            if (bingoTimerInterval) {
                clearInterval(bingoTimerInterval);
                bingoTimerInterval = null;
            }
            const dur = parseInt(timerDuration) || 120;
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
                timer: {
                    duration: dur,
                    remaining: dur,
                    running: false
                },
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

        socket.on('adminStartBingoTimer', () => {
            if (!adminSockets.has(socket.id)) return;
            if (!gameState.referatBingo || gameState.referatBingo.timer.running) return;
            gameState.referatBingo.timer.running = true;
            if (bingoTimerInterval) clearInterval(bingoTimerInterval);
            bingoTimerInterval = setInterval(() => {
                if (gameState.referatBingo.timer.remaining > 0) {
                    gameState.referatBingo.timer.remaining--;
                    io.emit('stateUpdate', gameState);
                }
                if (gameState.referatBingo.timer.remaining <= 0) {
                    gameState.referatBingo.timer.running = false;
                    clearInterval(bingoTimerInterval);
                    bingoTimerInterval = null;
                    io.emit('stateUpdate', gameState);
                }
            }, 1000);
            io.emit('stateUpdate', gameState);
        });

        socket.on('adminStopBingoTimer', () => {
            if (!adminSockets.has(socket.id)) return;
            if (!gameState.referatBingo) return;
            gameState.referatBingo.timer.running = false;
            if (bingoTimerInterval) {
                clearInterval(bingoTimerInterval);
                bingoTimerInterval = null;
            }
            io.emit('stateUpdate', gameState);
        });

        socket.on('adminResetBingoTimer', () => {
            if (!adminSockets.has(socket.id)) return;
            if (!gameState.referatBingo) return;
            gameState.referatBingo.timer.running = false;
            if (bingoTimerInterval) {
                clearInterval(bingoTimerInterval);
                bingoTimerInterval = null;
            }
            gameState.referatBingo.timer.remaining = gameState.referatBingo.timer.duration;
            io.emit('stateUpdate', gameState);
        });

        socket.on('adminSetBingoTimerDuration', (duration) => {
            if (!adminSockets.has(socket.id)) return;
            if (!gameState.referatBingo) return;
            const dur = Math.max(10, parseInt(duration) || 120);
            gameState.referatBingo.timer.duration = dur;
            if (!gameState.referatBingo.timer.running) {
                gameState.referatBingo.timer.remaining = dur;
            }
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
