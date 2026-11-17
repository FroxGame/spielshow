'use strict';

const utils = require('./utils');

const DEFAULT_TEAMS = {
    'Team 1': { score: 0, color: '#9b59b6' },
    'Team 2': { score: 0, color: '#2ecc71' }
};

/**
 * Gemeinsamer Kontext, den jedes Spielmodul bekommt.
 * Enthaelt den zentralen Zustand und kleine Helfer, die mehrere Spiele brauchen.
 */
function createContext(io) {
    const gameState = {
        currentScreen: 'WAITING',
        notesEnabled: false,
        teams: structuredClone(DEFAULT_TEAMS),
        players: {}
    };
    const adminSockets = new Set();
    const spectatorSockets = new Set();
    const playerNotes = {};
    const stateDecorators = [];

    const teamNames = () => Object.keys(gameState.teams);

    const createScores = () => Object.fromEntries(teamNames().map(team => [team, 0]));

    const byTeam = createValue => Object.fromEntries(teamNames().map(team => [team, createValue(team)]));

    const getPlayerName = playerId => (gameState.players[playerId] ? gameState.players[playerId].name : 'Unbekannt');

    const addStateDecorator = decorate => { stateDecorators.push(decorate); decorate(); };

    const emitState = () => {
        stateDecorators.forEach(decorate => decorate());
        io.emit('stateUpdate', gameState);
    };

    const isAdmin = socket => adminSockets.has(socket.id);

    function renameKey(map, oldName, newName) {
        if (!map || !Object.prototype.hasOwnProperty.call(map, oldName)) return;
        map[newName] = map[oldName];
        delete map[oldName];
    }

    return {
        io,
        utils,
        gameState,
        adminSockets,
        spectatorSockets,
        playerNotes,
        teamNames,
        createScores,
        byTeam,
        getPlayerName,
        emitState,
        addStateDecorator,
        isAdmin,
        renameKey
    };
}

module.exports = { createContext };
