'use strict';
module.exports = function createDiscordGame(ctx) {
    const { io, gameState, adminSockets, spectatorSockets, getPlayerName, createScores, renameKey, utils } = ctx;
    const { MAX_DISCORD_TARGET_LENGTH } = utils;

    const discordTerms = require('../../discord.json');

    const discordGame = {
        phase: 'IDLE',
        giverId: null,
        partnerId: null,
        exchangeId: null,
        target: '',
        originalClues: [],
        exchangeIndex: null,
        replacement: '',
        finalClues: [],
        get scores() {
            return gameState.discordGame.scores;
        }
    };

    function getDiscordAdminState() {
        const giverTeam = discordGame.giverId && gameState.players[discordGame.giverId]
            ? gameState.players[discordGame.giverId].team
            : null;
        const exchangeTeam = giverTeam
            ? Object.keys(gameState.teams).find(team => team !== giverTeam)
            : null;
        return {
            phase: discordGame.phase,
            giverId: discordGame.giverId,
            giverName: getPlayerName(discordGame.giverId),
            partnerId: discordGame.partnerId,
            partnerName: getPlayerName(discordGame.partnerId),
            exchangeId: discordGame.exchangeId,
            exchangeName: exchangeTeam || 'Gegenteam',
            target: discordGame.target,
            originalClues: discordGame.originalClues,
            exchangeIndex: discordGame.exchangeIndex,
            replacement: discordGame.replacement,
            finalClues: discordGame.finalClues,
            scores: discordGame.scores
        };
    }

    function emitDiscordAdminState() {
        const state = getDiscordAdminState();
        adminSockets.forEach(socketId => io.to(socketId).emit('discordAdminUpdate', state));
    }

    function emitDiscordSpectatorState() {
        const state = getDiscordAdminState();
        spectatorSockets.forEach(socketId => io.to(socketId).emit('discordSpectatorUpdate', state));
    }

    function emitDiscordPlayerViews() {
        const giverTeam = discordGame.giverId && gameState.players[discordGame.giverId]
            ? gameState.players[discordGame.giverId].team
            : null;
        Object.values(gameState.players).forEach(player => {
            let view = { role: 'WAITING', phase: discordGame.phase, scores: discordGame.scores };
            if (player.id === discordGame.giverId) {
                view = {
                    role: 'GIVER',
                    phase: discordGame.phase,
                    target: discordGame.target,
                    clues: discordGame.originalClues,
                    scores: discordGame.scores
                };
            } else if (player.id === discordGame.partnerId) {
                view = {
                    role: 'PARTNER',
                    phase: discordGame.phase,
                    clues: discordGame.finalClues,
                    scores: discordGame.scores
                };
            } else if (giverTeam && player.team !== giverTeam) {
                view = {
                    role: 'EXCHANGER',
                    phase: discordGame.phase,
                    clues: discordGame.phase === 'GUESS' || discordGame.phase === 'COMPLETE'
                        ? discordGame.finalClues
                        : discordGame.originalClues,
                    exchangeIndex: discordGame.exchangeIndex,
                    replacement: discordGame.replacement,
                    scores: discordGame.scores
                };
            }
            io.to(player.id).emit('discordPlayerUpdate', view);
        });
    }

    function resetDiscordGame() {
        discordGame.phase = 'IDLE';
        discordGame.giverId = null;
        discordGame.partnerId = null;
        discordGame.exchangeId = null;
        discordGame.target = '';
        discordGame.originalClues = [];
        discordGame.exchangeIndex = null;
        discordGame.replacement = '';
        discordGame.finalClues = [];
    }

    function createState() {
        return { discordGame: { scores: createScores() } };
    }

    function onScreenEnter() {
        emitDiscordPlayerViews();
        emitDiscordAdminState();
        emitDiscordSpectatorState();
    }

    function onPlayerRegistered() {
        emitDiscordPlayerViews();
    }

    function onAdminLogin(socket) {
        socket.emit('discordAdminUpdate', getDiscordAdminState());
    }

    function onSpectatorLogin(socket) {
        socket.emit('discordSpectatorUpdate', getDiscordAdminState());
    }

    function reset() {
        resetDiscordGame();
        Object.assign(gameState, createState());
    }

    function emitUpdates() {
        emitDiscordPlayerViews();
        emitDiscordAdminState();
        emitDiscordSpectatorState();
    }

    function register(socket) {
        socket.on('adminStartDiscordGame', ({ giverId, target }) => {
            if (!adminSockets.has(socket.id)) return;
            if (typeof giverId !== 'string' || typeof target !== 'string') {
                console.warn('Ungültige Discord-Game-Parameter');
                return;
            }
            const giver = gameState.players[giverId];
            const cleanTarget = utils.sanitizeString(target, MAX_DISCORD_TARGET_LENGTH);
            if (!giver || !cleanTarget) {
                console.warn('Ungültiger Discord-Game-Start: Spieler nicht gefunden oder leerer Zielbegriff');
                return;
            }
            const partner = Object.values(gameState.players).find(player => (
                player.team === giver.team && player.id !== giver.id
            ));
            const opposingPlayer = Object.values(gameState.players).find(player => player.team !== giver.team);
            if (!partner || !opposingPlayer) return;
            discordGame.phase = 'GIVER_CLUES';
            discordGame.giverId = giver.id;
            discordGame.partnerId = partner.id;
            discordGame.exchangeId = null;
            discordGame.target = cleanTarget;
            discordGame.originalClues = [];
            discordGame.exchangeIndex = null;
            discordGame.replacement = '';
            discordGame.finalClues = [];
            emitDiscordPlayerViews();
            emitDiscordAdminState();
            emitDiscordSpectatorState();
        });


        socket.on('getDiscordTerms', () => {
            socket.emit('receiveDiscordTerms', discordTerms);
        });

        socket.on('adminSubmitDiscordClues', (clues) => {
            if (!adminSockets.has(socket.id) || discordGame.phase !== 'GIVER_CLUES') return;
            const cleanClues = Array.isArray(clues)
                ? clues.map(clue => String(clue || '').trim().slice(0, 60)).filter(Boolean)
                : [];
            if (cleanClues.length !== 3) return;
            discordGame.originalClues = cleanClues;
            discordGame.phase = 'EXCHANGE';
            emitDiscordPlayerViews();
            emitDiscordAdminState();
            emitDiscordSpectatorState();
        });

        socket.on('adminSubmitDiscordExchange', ({ index, replacement }) => {
            if (!adminSockets.has(socket.id) || discordGame.phase !== 'EXCHANGE') return;
            const cleanIndex = Number(index);
            const cleanReplacement = String(replacement || '').trim().slice(0, 60);
            if (!Number.isInteger(cleanIndex) || cleanIndex < 0 || cleanIndex > 2 || !cleanReplacement) return;
            discordGame.exchangeIndex = cleanIndex;
            discordGame.replacement = cleanReplacement;
            discordGame.finalClues = discordGame.originalClues.map((clue, clueIndex) => (
                clueIndex === cleanIndex ? cleanReplacement : clue
            ));
            discordGame.phase = 'COMPLETE';
            emitDiscordPlayerViews();
            emitDiscordAdminState();
            emitDiscordSpectatorState();
        });

    }

    function renameTeam(oldName, newName) {
        renameKey(discordGame.scores, oldName, newName);
    }

    return {
        id: 'DISCORD_GAME',
        title: 'Das kam bei Discord nicht an',
        stateKey: 'discordGame',
        clientModule: 'discord',
        maxScore: null,
        createState,
        reset,
        emitUpdates,
        register,
        renameTeam,
        onScreenEnter,
        onPlayerRegistered,
        onAdminLogin,
        onSpectatorLogin
    };
};
