'use strict';
module.exports = function createMerkenGame(ctx) {
    const { io, gameState, adminSockets, createScores, renameKey } = ctx;

    const MAX_MERKEN_SCORE = 7;

    const merkenCards = [
        ['🍎', 'Apfel'], ['🚲', 'Fahrrad'], ['🐱', 'Katze'], ['🌈', 'Regenbogen'], ['⚽', 'Fußball'],
        ['🚀', 'Rakete'], ['🎸', 'Gitarre'], ['🌻', 'Sonnenblume'], ['🐘', 'Elefant'], ['🍕', 'Pizza'],
        ['🚂', 'Zug'], ['⭐', 'Stern'], ['🏠', 'Haus'], ['🦋', 'Schmetterling'], ['☂️', 'Regenschirm'],
        ['🎈', 'Luftballon'], ['🐢', 'Schildkröte'], ['🍦', 'Eis'], ['⛵', 'Segelboot'], ['🔑', 'Schlüssel'],
        ['🌵', 'Kaktus'], ['🎁', 'Geschenk'], ['🕶️', 'Sonnenbrille'], ['🐝', 'Biene'], ['🍄', 'Pilz'],
        ['🎲', 'Würfel'], ['🌙', 'Mond'], ['🧩', 'Puzzle'], ['🦁', 'Löwe'], ['💡', 'Glühbirne']
    ].map(([icon, name], index) => ({ id: index + 1, icon, name }));

    function createState() {
        return {
            merkenGame: {
                phase: 'IDLE',
                cards: merkenCards,
                revealedCards: [],
                scores: createScores()
            }
        };
    }

    function reset() {
        Object.assign(gameState, createState());
    }

    function onScoreChanged(team) {
        const game = gameState.merkenGame;
        if (game.scores[team] < MAX_MERKEN_SCORE) return;
        game.phase = 'FINISHED';
    }

    function register(socket) {
        socket.on('adminStartMerken', () => {
            if (!adminSockets.has(socket.id)) return;
            gameState.merkenGame = {
                phase: 'MEMORIZING',
                cards: merkenCards,
                revealedCards: [],
                scores: createScores()
            };
            io.emit('stateUpdate', gameState);
        });

        socket.on('adminEndMerkenMemorizing', () => {
            if (!adminSockets.has(socket.id) || gameState.merkenGame.phase !== 'MEMORIZING') return;
            gameState.merkenGame.phase = 'PLAYING';
            io.emit('stateUpdate', gameState);
        });

        socket.on('adminSelectMerkenCard', (cardId) => {
            if (!adminSockets.has(socket.id)) return;
            const game = gameState.merkenGame;
            const id = parseInt(cardId, 10);
            if (!game || game.phase !== 'PLAYING' || !game.cards.some(card => card.id === id)) return;
            const index = game.revealedCards.indexOf(id);
            if (index === -1) {
                game.revealedCards.push(id);
            } else {
                game.revealedCards.splice(index, 1);
            }
            io.emit('stateUpdate', gameState);
        });

        socket.on('adminRevealAllMerkenCards', () => {
            if (!adminSockets.has(socket.id)) return;
            const game = gameState.merkenGame;
            if (!game || !Array.isArray(game.cards)) return;
            game.revealedCards = game.cards.map(card => card.id);
            io.emit('stateUpdate', gameState);
        });

    }

    function renameTeam(oldName, newName) {
        renameKey(gameState.merkenGame.scores, oldName, newName);
    }

    return {
        id: 'MERKEN',
        title: 'Merken',
        stateKey: 'merkenGame',
        clientModule: 'merken',
        maxScore: MAX_MERKEN_SCORE,
        createState,
        reset,
        onScoreChanged,
        register,
        renameTeam
    };
};
