'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

module.exports = function createDiktatGame(ctx) {
    const { io, gameState, adminSockets, spectatorSockets, createScores, renameKey, utils } = ctx;
    const { MAX_DIKTAT_LENGTH } = utils;

    const diktatSentencesPath = path.join(ROOT, 'diktat.json');

    const diktatTexts = {};

    function normalizeDiktatWord(word) {
        return String(word || '')
            .replace(/[.,!?;:"„“‚‘()\[\]{}]/g, '');
    }

    function getDiktatSentences() {
        try {
            const sentences = JSON.parse(fs.readFileSync(diktatSentencesPath, 'utf8'));
            return Array.isArray(sentences) ? sentences.filter(sentence => typeof sentence === 'string' && sentence.trim()) : [];
        } catch (error) {
            console.error('Fehler beim Lesen der Diktat-Sätze:', error.message);
            return [];
        }
    }

    function getDiktatPlayers(includeAnswers, includeLiveText = false) {
        const originalWords = gameState.diktatGame.originalSentence.trim().split(/\s+/).filter(Boolean);
        return Object.values(gameState.players).map(player => {
            const text = diktatTexts[player.id] || '';
            const typedWords = text.trim().split(/\s+/).filter(Boolean);
            return {
                playerId: player.id,
                name: player.name,
                team: player.team,
                text: includeAnswers || includeLiveText ? text : '',
                words: includeAnswers ? typedWords.map((word, index) => ({
                    text: word,
                    correct: normalizeDiktatWord(word) === normalizeDiktatWord(originalWords[index])
                })) : []
            };
        });
    }

    function getDiktatAdminState() {
        const game = gameState.diktatGame;
        return {
            ...game,
            players: game.phase === 'REVEALED' ? getDiktatPlayers(true) : []
        };
    }

    function emitDiktatAdminState() {
        const state = getDiktatAdminState();
        adminSockets.forEach(socketId => io.to(socketId).emit('diktatAdminUpdate', state));
    }

    function emitDiktatSpectatorState() {
        const game = gameState.diktatGame;
        const state = {
            ...game,
            players: getDiktatPlayers(game.phase === 'REVEALED', true)
        };
        spectatorSockets.forEach(socketId => io.to(socketId).emit('diktatSpectatorUpdate', state));
    }

    function emitDiktatPlayerViews() {
        const game = gameState.diktatGame;
        const revealedPlayers = game.phase === 'REVEALED' ? getDiktatPlayers(true) : [];
        Object.values(gameState.players).forEach(player => {
            const ownText = diktatTexts[player.id] || '';
            io.to(player.id).emit('diktatPlayerUpdate', {
                ...game,
                ownText,
                players: revealedPlayers
            });
        });
    }

    function emitDiktatUpdates() {
        emitDiktatAdminState();
        emitDiktatSpectatorState();
        emitDiktatPlayerViews();
    }

    function createState() {
        return {
            diktatGame: {
                phase: 'IDLE',
                round: 0,
                originalSentence: '',
                locked: false,
                scores: createScores()
            }
        };
    }

    function reset() {
        Object.keys(diktatTexts).forEach(playerId => delete diktatTexts[playerId]);
        Object.assign(gameState, createState());
    }

    function onScreenEnter() {
        emitDiktatUpdates();
    }

    function onPlayerRegistered() {
        emitDiktatPlayerViews();
    }

    function onAdminLogin(socket) {
        socket.emit('diktatAdminUpdate', getDiktatAdminState());
    }

    function onSpectatorLogin(socket) {
        socket.emit('diktatSpectatorUpdate', {
            ...gameState.diktatGame,
            players: getDiktatPlayers(gameState.diktatGame.phase === 'REVEALED', true)
        });
    }

    function register(socket) {
        socket.on('adminStartDiktatRound', sentence => {
            if (!adminSockets.has(socket.id)) return;
            const cleanSentence = utils.sanitizeString(sentence, MAX_DIKTAT_LENGTH);
            if (!cleanSentence) {
                console.warn('Leerer Diktat-Satz abgelehnt');
                return;
            }
            Object.keys(diktatTexts).forEach(playerId => delete diktatTexts[playerId]);
            gameState.diktatGame.phase = 'WRITING';
            gameState.diktatGame.round += 1;
            gameState.diktatGame.originalSentence = cleanSentence;
            gameState.diktatGame.locked = false;
            emitDiktatUpdates();
        });

        socket.on('getDiktatSentences', () => {
            socket.emit('receiveDiktatSentences', getDiktatSentences());
        });

        socket.on('updateDiktatText', text => {
            const player = gameState.players[socket.id];
            if (!player || gameState.diktatGame.phase !== 'WRITING' || gameState.diktatGame.locked) return;
            diktatTexts[socket.id] = utils.sanitizeString(text, MAX_DIKTAT_LENGTH);
            socket.emit('diktatPlayerUpdate', {
                ...gameState.diktatGame,
                ownText: diktatTexts[socket.id],
                players: []
            });
            emitDiktatSpectatorState();
        });

        socket.on('adminCloseDiktat', () => {
            if (!adminSockets.has(socket.id) || gameState.diktatGame.phase !== 'WRITING') return;
            gameState.diktatGame.locked = true;
            gameState.diktatGame.phase = 'CLOSED';
            emitDiktatUpdates();
        });

        socket.on('adminShowDiktatAnswers', () => {
            if (!adminSockets.has(socket.id) || gameState.diktatGame.phase !== 'CLOSED') return;
            gameState.diktatGame.phase = 'REVEALED';
            emitDiktatUpdates();
        });
    }

    function renameTeam(oldName, newName) {
        renameKey(gameState.diktatGame.scores, oldName, newName);
    }

    return {
        id: 'DIKTAT',
        title: 'Diktat',
        stateKey: 'diktatGame',
        clientModule: 'diktat',
        maxScore: null,
        createState,
        reset,
        emitUpdates: emitDiktatUpdates,
        register,
        renameTeam,
        onScreenEnter,
        onPlayerRegistered,
        onAdminLogin,
        onSpectatorLogin
    };
};
