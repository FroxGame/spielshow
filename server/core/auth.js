'use strict';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '1234';
const SPECTATOR_PASSWORD = process.env.SPECTATOR_PASSWORD || '1234';

/**
 * Login fuer Admin und Zuschauer. Nach dem Login bekommt der Client
 * den aktuellen Zustand und die Sonderansichten der Spiele.
 */
function createAuth(ctx, games, notes) {
    const { gameState, adminSockets, spectatorSockets } = ctx;

    function register(socket) {
        socket.on('adminLogin', password => {
            if (typeof password !== 'string') {
                socket.emit('adminAuthResult', { success: false, error: 'Ungültige Eingabe' });
                return;
            }
            if (password !== ADMIN_PASSWORD) {
                console.warn(`Fehlgeschlagener Admin-Login-Versuch von ${socket.id}`);
                socket.emit('adminAuthResult', { success: false, error: 'Falsches Passwort' });
                return;
            }
            adminSockets.add(socket.id);
            console.log(`Admin von ${socket.id} eingeloggt`);
            socket.emit('adminAuthResult', { success: true });
            socket.emit('stateUpdate', gameState);
            games.list.forEach(game => game.onAdminLogin && game.onAdminLogin(socket));
        });

        socket.on('spectatorLogin', password => {
            if (typeof password !== 'string') {
                socket.emit('spectatorAuthResult', { success: false, error: 'Ungültige Eingabe' });
                return;
            }
            if (password !== SPECTATOR_PASSWORD) {
                console.warn(`Fehlgeschlagener Spectator-Login-Versuch von ${socket.id}`);
                socket.emit('spectatorAuthResult', { success: false, error: 'Falsches Passwort' });
                return;
            }
            spectatorSockets.add(socket.id);
            console.log(`Spectator von ${socket.id} eingeloggt`);
            socket.emit('spectatorAuthResult', { success: true });
            socket.emit('stateUpdate', gameState);
            socket.emit('spectatorNotesUpdate', notes.getAllPlayerNotes());
            games.list.forEach(game => game.onSpectatorLogin && game.onSpectatorLogin(socket));
        });
    }

    return { register };
}

module.exports = { createAuth };
