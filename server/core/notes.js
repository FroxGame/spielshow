'use strict';

const MAX_NOTE_LENGTH = 500;

/**
 * Team-Notizen: Spieler schreiben, Teampartner und Zuschauer lesen mit.
 */
function createNotes(ctx) {
    const { io, gameState, playerNotes, spectatorSockets, isAdmin, emitState } = ctx;

    function toNote(player) {
        return { playerId: player.id, name: player.name, text: playerNotes[player.id] || '' };
    }

    function emitTeamNotesToTeam(team) {
        if (!team) return;
        const teamPlayers = Object.values(gameState.players).filter(player => player.team === team);
        const teamNotes = teamPlayers.map(toNote);
        teamPlayers.forEach(player => io.to(player.id).emit('teamNotesUpdate', teamNotes));
    }

    function getAllPlayerNotes() {
        return Object.keys(gameState.teams).map(team => ({
            team,
            players: Object.values(gameState.players).filter(player => player.team === team).map(toNote)
        }));
    }

    function emitSpectatorNotes() {
        const notes = getAllPlayerNotes();
        spectatorSockets.forEach(socketId => io.to(socketId).emit('spectatorNotesUpdate', notes));
    }

    function register(socket) {
        socket.on('adminSetNotesEnabled', enabled => {
            if (!isAdmin(socket) || typeof enabled !== 'boolean') return;
            gameState.notesEnabled = enabled;
            emitState();
            Object.keys(gameState.teams).forEach(emitTeamNotesToTeam);
            emitSpectatorNotes();
        });

        socket.on('updatePlayerNote', text => {
            const player = gameState.players[socket.id];
            if (!player) return;
            playerNotes[socket.id] = String(text || '').slice(0, MAX_NOTE_LENGTH);
            emitTeamNotesToTeam(player.team);
            emitSpectatorNotes();
        });
    }

    return { emitTeamNotesToTeam, getAllPlayerNotes, emitSpectatorNotes, register };
}

module.exports = { createNotes };
