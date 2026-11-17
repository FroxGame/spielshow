'use strict';

/**
 * Standard-Steuerung, die fuer JEDES Spiel gleich ist:
 *   adminAddGamePoint  { team, amount }  Punkte +/- fuer das aktive Spiel
 *   adminResetGame                       Spiel komplett auf Startzustand
 *   pressBuzzer                          Spieler buzzert (nur Spiele mit buzzer: true)
 *   adminLockBuzzer / adminResetBuzzer   Buzzer sperren bzw. freigeben
 *
 * Ein Spielmodul liefert dafuer nur Metadaten (stateKey, maxScore, buzzer)
 * und optionale Hooks (reset, onScoreChanged, canBuzz, onBuzz, onBuzzerReset, emitUpdates).
 */
function createGameControls(ctx, games) {
    const { gameState, utils, isAdmin, emitState } = ctx;

    const activeGame = () => games.byId(gameState.currentScreen);

    function publish(game) {
        emitState();
        if (game.emitUpdates) game.emitUpdates();
    }

    function registerScoreAndReset(socket) {
        socket.on('adminAddGamePoint', ({ team, amount } = {}) => {
            const game = activeGame();
            if (!isAdmin(socket) || !game || !utils.isValidTeamName(team)) return;
            const scores = gameState[game.stateKey].scores;
            if (!utils.addScore(scores, team, amount, game.maxScore === null ? Infinity : game.maxScore)) return;
            if (game.onScoreChanged) game.onScoreChanged(team);
            publish(game);
        });

        socket.on('adminResetGame', () => {
            const game = activeGame();
            if (!isAdmin(socket) || !game) return;
            game.reset();
            publish(game);
        });
    }

    function registerBuzzer(socket) {
        socket.on('pressBuzzer', () => {
            const game = activeGame();
            const player = gameState.players[socket.id];
            if (!game || !game.buzzer || !player || !player.team) return;
            const state = gameState[game.stateKey];
            if (state.buzzerLocked || (game.canBuzz && !game.canBuzz())) return;
            state.buzzerWinner = `${player.name} (${player.team})`;
            state.buzzerTeam = player.team;
            state.buzzerLocked = true;
            if (game.onBuzz) game.onBuzz(player);
            publish(game);
        });

        socket.on('adminLockBuzzer', () => {
            const game = activeGame();
            if (!isAdmin(socket) || !game || !game.buzzer) return;
            gameState[game.stateKey].buzzerLocked = true;
            publish(game);
        });

        socket.on('adminResetBuzzer', () => {
            const game = activeGame();
            if (!isAdmin(socket) || !game || !game.buzzer) return;
            const state = gameState[game.stateKey];
            state.buzzerLocked = false;
            state.buzzerWinner = null;
            state.buzzerTeam = null;
            if (game.onBuzzerReset) game.onBuzzerReset();
            publish(game);
        });
    }

    function register(socket) {
        registerScoreAndReset(socket);
        registerBuzzer(socket);
    }

    return { register };
}

module.exports = { createGameControls };
