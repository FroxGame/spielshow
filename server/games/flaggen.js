'use strict';

const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const MAX_PLACEMENTS = 40;
const MAX_Z_INDEX = 1000;

/**
 * Flaggen bauen: Jedes Team baut aus einem Pool von Bauteilen die Flagge eines Landes.
 * Inhalte: flaggen.json, erzeugt mit tools/flaggen-builder.js (Format: { rounds: [{ id, country, difficulty,
 * targetFlag (SVG), elements: [{ id, name, type, defaultWidth, defaultHeight, svg }] }] }).
 * Geheim bleiben die Original-Flagge (kommt erst beim Aufdecken in den State) und die Bauflaechen.
 * Die Bauflaechen gehen ueber den privaten Kanal "flaggenView": Admin sieht alle live, Spieler nur das
 * eigene Team, Zuschauer und alle anderen erst nach dem Aufdecken.
 */
module.exports = function createFlaggenGame(ctx) {
    const { io, gameState, adminSockets, spectatorSockets, createScores, byTeam, renameKey, emitState, isAdmin, utils } = ctx;

    const roundsPath = path.join(ROOT, 'flaggen.json');
    let targetFlag = null;
    let boards = {};

    const state = () => gameState.flaggenGame;

    const isRound = entry => Boolean(entry) && typeof entry.id === 'string' && typeof entry.country === 'string'
        && typeof entry.targetFlag === 'string' && Array.isArray(entry.elements);

    function readRounds() {
        const data = utils.readJsonFile(roundsPath);
        return Array.isArray(data.rounds) ? data.rounds.filter(isRound) : [];
    }

    const createBoards = () => byTeam(() => ({ placements: [] }));

    function createState() {
        return {
            flaggenGame: {
                phase: 'IDLE',
                roundId: null,
                country: null,
                targetFlag: null,
                elements: [],
                buildingLocked: false,
                revealed: false,
                builders: byTeam(() => null),
                scores: createScores()
            }
        };
    }

    function reset() {
        targetFlag = null;
        boards = createBoards();
        Object.assign(gameState, createState());
    }

    /** Was ein bestimmter Socket sehen darf. */
    function viewFor(socketId) {
        const player = gameState.players[socketId];
        if (adminSockets.has(socketId) || state().revealed) return { boards };
        if (player && player.team && boards[player.team]) return { boards: { [player.team]: boards[player.team] } };
        return { boards: {} };
    }

    function emitViews() {
        const recipients = new Set([...adminSockets, ...spectatorSockets, ...Object.keys(gameState.players)]);
        recipients.forEach(socketId => io.to(socketId).emit('flaggenView', viewFor(socketId)));
    }

    function publish() {
        emitState();
        emitViews();
    }

    /** Nur Spieler des jeweiligen Teams duerfen Baumeister sein. Alles andere wird zu "alle duerfen bauen". */
    function normalizeBuilders(builders) {
        return byTeam(team => {
            const player = gameState.players[builders && builders[team]];
            return player && player.team === team ? player.id : null;
        });
    }

    /** Liefert das Team des Spielers, wenn er gerade bauen darf, sonst null. */
    function buildingTeamOf(socket) {
        const game = state();
        const player = gameState.players[socket.id];
        if (!player || !player.team || game.phase !== 'PLAYING' || game.buildingLocked) return null;
        const builder = game.builders[player.team];
        return !builder || builder === socket.id ? player.team : null;
    }

    const finiteOr = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

    function sanitizePlacements(placements) {
        const knownElements = new Set(state().elements.map(element => element.id));
        return placements
            .filter(piece => piece && knownElements.has(piece.elementId))
            .slice(0, MAX_PLACEMENTS)
            .map((piece, index) => ({
                id: utils.sanitizeString(String(piece.id || `p_${index}`), 40),
                elementId: piece.elementId,
                x: clamp(finiteOr(piece.x, 0.5), 0, 1),
                y: clamp(finiteOr(piece.y, 0.5), 0, 1),
                rotation: ((Math.round(finiteOr(piece.rotation, 0)) % 360) + 360) % 360,
                zIndex: clamp(Math.round(finiteOr(piece.zIndex, index + 1)), 1, MAX_Z_INDEX)
            }));
    }

    function registerAdminEvents(socket) {
        socket.on('getFlaggenData', () => {
            if (!isAdmin(socket)) return;
            socket.emit('receiveFlaggenData', { rounds: readRounds() });
        });

        socket.on('adminStartFlaggenRound', ({ roundId, builders } = {}) => {
            if (!isAdmin(socket) || typeof roundId !== 'string') return;
            const round = readRounds().find(entry => entry.id === roundId);
            if (!round) return;
            targetFlag = round.targetFlag;
            boards = createBoards();
            Object.assign(state(), {
                phase: 'PLAYING',
                roundId: round.id,
                country: round.country,
                targetFlag: null,
                elements: round.elements,
                buildingLocked: false,
                revealed: false,
                builders: normalizeBuilders(builders || state().builders)
            });
            publish();
        });

        socket.on('adminSetFlaggenBuilders', ({ builders } = {}) => {
            if (!isAdmin(socket)) return;
            state().builders = normalizeBuilders(builders);
            emitState();
        });

        socket.on('adminToggleFlaggenLock', () => {
            if (!isAdmin(socket) || state().phase !== 'PLAYING' || state().revealed) return;
            state().buildingLocked = !state().buildingLocked;
            emitState();
        });

        socket.on('adminRevealFlaggen', () => {
            if (!isAdmin(socket) || state().phase !== 'PLAYING') return;
            Object.assign(state(), { revealed: true, buildingLocked: true, targetFlag });
            publish();
        });
    }

    function registerPlayerEvents(socket) {
        socket.on('getFlaggenView', () => socket.emit('flaggenView', viewFor(socket.id)));

        socket.on('playerUpdateFlaggenBoard', ({ placements } = {}) => {
            const team = buildingTeamOf(socket);
            if (!team || !Array.isArray(placements)) return;
            boards[team] = { placements: sanitizePlacements(placements) };
            emitViews();
        });

        socket.on('playerClearFlaggenBoard', () => {
            const team = buildingTeamOf(socket);
            if (!team) return;
            boards[team] = { placements: [] };
            emitViews();
        });
    }

    function register(socket) {
        registerAdminEvents(socket);
        registerPlayerEvents(socket);
    }

    function renameTeam(oldName, newName) {
        renameKey(state().scores, oldName, newName);
        renameKey(state().builders, oldName, newName);
        renameKey(boards, oldName, newName);
    }

    boards = createBoards();

    return {
        id: 'FLAGGEN',
        title: 'Flaggen bauen',
        stateKey: 'flaggenGame',
        clientModule: 'flaggen',
        layout: 'wide',
        createState,
        reset,
        register,
        renameTeam,
        emitUpdates: emitViews,
        onPlayerRegistered: emitViews
    };
};
