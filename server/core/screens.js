'use strict';

/**
 * Spielwechsel: Der Admin schaltet zwischen Warteraum und Spielen um.
 */
function createScreens(ctx, games) {
    const { io, gameState, isAdmin, emitState } = ctx;

    function enterScreen(screenName) {
        gameState.currentScreen = screenName;
        emitState();
        const game = games.byId(screenName);
        return game;
    }

    function register(socket) {
        socket.on('adminChangeScreen', screenName => {
            if (!isAdmin(socket) || typeof screenName !== 'string') return;
            const game = enterScreen(screenName);
            if (game && game.onScreenEnter) game.onScreenEnter();
        });

        socket.on('adminStartGame', screenName => {
            if (!isAdmin(socket)) return;
            const intro = games.getIntro(screenName);
            if (!intro) return;
            const game = enterScreen(screenName);
            io.emit('gameIntro', { screen: screenName, ...intro });
            if (game.onScreenEnter) game.onScreenEnter();
        });
    }

    return { register };
}

module.exports = { createScreens };
