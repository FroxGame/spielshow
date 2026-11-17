'use strict';

const MAX_TEAM_SCORE = 5;

/**
 * Team-Verwaltung: Umbenennen und Gesamtpunkte.
 * Beim Umbenennen bekommt jedes Spielmodul die Chance, seine Daten umzuziehen.
 */
function createTeams(ctx, games, notes) {
    const { gameState, utils, isAdmin, emitState } = ctx;

    function renameTeamKeepingOrder(oldName, newName) {
        const entries = Object.entries(gameState.teams).map(([name, data]) => [name === oldName ? newName : name, data]);
        Object.keys(gameState.teams).forEach(name => delete gameState.teams[name]);
        entries.forEach(([name, data]) => { gameState.teams[name] = data; });
    }

    function renameTeam(oldName, newName) {
        renameTeamKeepingOrder(oldName, newName);
        games.list.forEach(game => game.renameTeam(oldName, newName));
        Object.values(gameState.players).forEach(player => {
            if (player.team === oldName) player.team = newName;
        });
    }

    function register(socket) {
        socket.on('adminUpdateTeamName', ({ oldName, newName } = {}) => {
            if (!isAdmin(socket)) return;
            if (typeof oldName !== 'string' || typeof newName !== 'string') return;
            const trimmedName = newName.trim();
            if (!trimmedName || oldName === trimmedName) return;
            if (!gameState.teams[oldName] || gameState.teams[trimmedName]) return;
            renameTeam(oldName, trimmedName);
            emitState();
            notes.emitTeamNotesToTeam(trimmedName);
            notes.emitSpectatorNotes();
        });

        socket.on('adminAddTeamPoint', ({ team, amount } = {}) => {
            if (!isAdmin(socket) || !utils.isValidTeamName(team) || !gameState.teams[team]) return;
            utils.addScore(gameState.teams[team], 'score', amount, MAX_TEAM_SCORE);
            emitState();
        });
    }

    return { register };
}

module.exports = { createTeams };
