'use strict';

/**
 * Spieler-Verwaltung: Anmeldung, Namen, Teamzuweisung, Disconnect.
 */
function createPlayers(ctx, games, notes) {
    const { gameState, adminSockets, spectatorSockets, playerNotes, isAdmin, emitState } = ctx;
    let playerCounter = 1;

    function addPlayer(socket) {
        gameState.players[socket.id] = {
            id: socket.id,
            name: `Spieler #${playerCounter++}`,
            team: null
        };
        emitState();
        notes.emitSpectatorNotes();
    }

    function register(socket) {
        socket.on('registerAsPlayer', () => {
            if (!gameState.players[socket.id]) addPlayer(socket);
            const player = gameState.players[socket.id];
            notes.emitTeamNotesToTeam(player.team);
            const activeGame = games.byId(gameState.currentScreen);
            if (activeGame && activeGame.onPlayerRegistered) activeGame.onPlayerRegistered();
            socket.emit('stateUpdate', gameState);
        });

        socket.on('disconnect', () => {
            spectatorSockets.delete(socket.id);
            adminSockets.delete(socket.id);
            delete playerNotes[socket.id];
            if (!gameState.players[socket.id]) return;
            delete gameState.players[socket.id];
            emitState();
            notes.emitSpectatorNotes();
        });

        socket.on('adminUpdatePlayerName', ({ socketId, newName } = {}) => {
            if (!isAdmin(socket)) return;
            if (typeof socketId !== 'string' || typeof newName !== 'string') return;
            const player = gameState.players[socketId];
            if (!player) return;
            player.name = newName.trim();
            emitState();
            notes.emitTeamNotesToTeam(player.team);
            notes.emitSpectatorNotes();
        });

        socket.on('adminUpdatePlayerTeam', ({ socketId, team } = {}) => {
            if (!isAdmin(socket)) return;
            if (typeof socketId !== 'string' || typeof team !== 'string') return;
            const newTeam = team === '' ? null : team;
            const player = gameState.players[socketId];
            if (!player || player.team === newTeam || (newTeam !== null && !gameState.teams[newTeam])) return;
            const oldTeam = player.team;
            player.team = newTeam;
            console.log(`Spieler ${player.name} wechselt von ${oldTeam || 'kein Team'} nach ${newTeam || 'kein Team'}`);
            emitState();
            notes.emitTeamNotesToTeam(oldTeam);
            notes.emitTeamNotesToTeam(newTeam);
            notes.emitSpectatorNotes();
        });
    }

    return { register };
}

module.exports = { createPlayers };
