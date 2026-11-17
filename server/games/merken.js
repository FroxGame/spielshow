'use strict';
module.exports = function createMerkenGame(ctx) {
    const { io, gameState, adminSockets, createScores, renameKey } = ctx;

    const MAX_MERKEN_SCORE = 7;
    let merkenTimerInterval = null;

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
                duration: 30,
                remaining: 0,
                revealedCards: [],
                scores: createScores()
            }
        };
    }

    function reset() {
        if (merkenTimerInterval) {
            clearInterval(merkenTimerInterval);
            merkenTimerInterval = null;
        }
        Object.assign(gameState, createState());
    }

    function onScoreChanged(team) {
        const game = gameState.merkenGame;
        if (game.scores[team] < MAX_MERKEN_SCORE) return;
        game.phase = 'FINISHED';
        if (merkenTimerInterval) {
            clearInterval(merkenTimerInterval);
            merkenTimerInterval = null;
        }
    }

    function register(socket) {
        socket.on('adminStartMerken', (duration) => {
            if (!adminSockets.has(socket.id)) return;
            if (merkenTimerInterval) {
                clearInterval(merkenTimerInterval);
                merkenTimerInterval = null;
            }
            const teamNames = Object.keys(gameState.teams);
            const dur = Math.max(5, Math.min(3600, parseInt(duration, 10) || 30));
            gameState.merkenGame = {
                phase: 'MEMORIZING',
                cards: merkenCards,
                duration: dur,
                remaining: dur,
                revealedCards: [],
                scores: Object.fromEntries(teamNames.map(team => [team, 0]))
            };
            merkenTimerInterval = setInterval(() => {
                const game = gameState.merkenGame;
                if (!game || game.phase !== 'MEMORIZING') return;
                game.remaining = Math.max(0, game.remaining - 1);
                if (game.remaining === 0) {
                    game.phase = 'PLAYING';
                    clearInterval(merkenTimerInterval);
                    merkenTimerInterval = null;
                }
                io.emit('stateUpdate', gameState);
            }, 1000);
            io.emit('stateUpdate', gameState);
        });

        socket.on('adminStopMerkenTimer', () => {
            if (!adminSockets.has(socket.id) || !gameState.merkenGame) return;
            gameState.merkenGame.phase = 'PLAYING';
            gameState.merkenGame.remaining = 0;
            if (merkenTimerInterval) {
                clearInterval(merkenTimerInterval);
                merkenTimerInterval = null;
            }
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
