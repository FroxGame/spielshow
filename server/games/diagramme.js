'use strict';

const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const MAX_SCORE = 5;
const MAX_POINTS_PER_DRAWING = 100;
const MIN_VALUES = 6;

/**
 * Diagramme: Die Spieler sehen die erste Haelfte eines Diagramms und zeichnen die zweite Haelfte weiter.
 * Pro Team zeichnet ein Spieler: Jeder Klick setzt einen Punkt, zum Vorgaenger geht eine gerade Linie.
 * Nach dem Schliessen (Admin) sind keine Punkte mehr moeglich. Fehlt am Ende ein Stueck, gilt eine waagerechte
 * Linie vom letzten Punkt bis zum rechten Rand (Bewertung im Server, Darstellung im Client).
 * Der Server bewertet die Abweichung vom Original (mittlere absolute Abweichung ueber die Zeichenhaelfte,
 * in Prozent der Achsenhoehe). Der Admin vergibt die Punkte selbst.
 *
 * Inhalte: diagramme.json (nur Admin-Event), Array aus
 *   { id, title, yLabel, unit, source, xLabels: [...], values: [...], yMin, yMax, shownCount? }
 * xLabels und values sind gleich lang und gleichmaessig verteilt. shownCount (optional) = Anzahl der
 * vorgegebenen Punkte, Standard ist die Haelfte. Die Loesung (values) bleibt privat im Server.
 * Zeichnungen sind privat: Admin und Zuschauer sehen alles live, Spieler nur die des eigenen Teams,
 * bis der Admin aufdeckt. Wire-Format der Zeichnung: Punkte { u, v } je 0..1 (u = Position, v = Hoehe).
 */
module.exports = function createDiagrammeGame(ctx) {
    const { io, gameState, adminSockets, spectatorSockets, createScores, byTeam, renameKey, emitState, isAdmin, utils } = ctx;

    const diagramsPath = path.join(ROOT, 'diagramme.json');
    let currentDiagram = null;
    let drawings = {};

    const state = () => gameState.diagrammeGame;

    const isFiniteNumber = value => typeof value === 'number' && Number.isFinite(value);
    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

    function isValidDiagram(entry) {
        return Boolean(entry) && typeof entry.id === 'string' && typeof entry.title === 'string'
            && Array.isArray(entry.values) && entry.values.length >= MIN_VALUES && entry.values.every(isFiniteNumber)
            && Array.isArray(entry.xLabels) && entry.xLabels.length === entry.values.length
            && isFiniteNumber(entry.yMin) && isFiniteNumber(entry.yMax) && entry.yMin < entry.yMax;
    }

    const readDiagrams = () => utils.readJsonArray(diagramsPath, isValidDiagram);

    function shownCountOf(diagram) {
        const count = Number.isInteger(diagram.shownCount) ? diagram.shownCount : Math.floor(diagram.values.length / 2);
        return clamp(count, 2, diagram.values.length - 2);
    }

    const toV = (diagram, value) => (value - diagram.yMin) / (diagram.yMax - diagram.yMin);

    /** Letzter vorgegebener Punkt: Hier beginnt jede Zeichnung. */
    function anchorOf(diagram) {
        const lastShown = shownCountOf(diagram) - 1;
        return { u: lastShown / (diagram.values.length - 1), v: toV(diagram, diagram.values[lastShown]) };
    }

    function interpolate(points, u) {
        if (u <= points[0].u) return points[0].v;
        for (let i = 1; i < points.length; i++) {
            if (u <= points[i].u) {
                const from = points[i - 1];
                const to = points[i];
                if (to.u === from.u) return to.v;
                return from.v + ((u - from.u) / (to.u - from.u)) * (to.v - from.v);
            }
        }
        return points[points.length - 1].v;
    }

    /** Mittlere absolute Abweichung ueber alle zu zeichnenden Punkte. null = nichts gezeichnet. */
    function evaluate(diagram, drawing) {
        if (!drawing || !drawing.length) return null;
        const points = [anchorOf(diagram), ...drawing];
        const count = diagram.values.length;
        const range = diagram.yMax - diagram.yMin;
        let sum = 0;
        let samples = 0;
        for (let i = shownCountOf(diagram); i < count; i++) {
            const drawnValue = diagram.yMin + interpolate(points, i / (count - 1)) * range;
            sum += Math.abs(drawnValue - diagram.values[i]);
            samples += 1;
        }
        const mae = sum / samples;
        return { mae, deviationPct: (mae / range) * 100 };
    }

    function pickClosestTeam(results) {
        const ranked = Object.entries(results).filter(([, result]) => result).sort((a, b) => a[1].deviationPct - b[1].deviationPct);
        if (!ranked.length) return null;
        if (ranked.length > 1 && ranked[0][1].deviationPct === ranked[1][1].deviationPct) return null;
        return ranked[0][0];
    }

    /** Nur ein Spieler des Teams darf Maler sein. Alles andere wird zu "kein Maler". */
    function normalizePainters(painters) {
        return byTeam(team => {
            const player = gameState.players[painters[team]];
            return player && player.team === team ? player.id : null;
        });
    }

    function firstPlayerOf(team) {
        const player = Object.values(gameState.players).find(entry => entry.team === team);
        return player ? player.id : null;
    }

    function isSolutionRevealed() {
        return Boolean(state().solution);
    }

    /** Was ein bestimmter Socket sehen darf. */
    function viewFor(socketId) {
        const game = state();
        const isHost = adminSockets.has(socketId) || spectatorSockets.has(socketId);
        const player = gameState.players[socketId];
        const revealed = game.drawingsRevealed;
        const visibleDrawings = {};
        Object.keys(drawings).forEach(team => {
            if (isHost || revealed || (player && player.team === team)) visibleDrawings[team] = drawings[team];
        });
        return {
            drawings: visibleDrawings,
            solution: currentDiagram && (isHost || isSolutionRevealed()) ? currentDiagram.values : null
        };
    }

    function emitViews() {
        const recipients = new Set([...adminSockets, ...spectatorSockets, ...Object.keys(gameState.players)]);
        recipients.forEach(socketId => io.to(socketId).emit('diagrammeView', viewFor(socketId)));
    }

    function syncCounts() {
        state().pointCounts = byTeam(team => (drawings[team] || []).length);
    }

    function publish() {
        syncCounts();
        emitState();
        emitViews();
    }

    function createState() {
        return {
            diagrammeGame: {
                phase: 'IDLE',
                diagramId: null,
                title: '',
                yLabel: '',
                unit: '',
                xLabels: [],
                yMin: 0,
                yMax: 1,
                shownCount: 0,
                visibleValues: [],
                painters: byTeam(() => null),
                pointCounts: byTeam(() => 0),
                drawingClosed: false,
                drawingsRevealed: false,
                solution: null,
                results: null,
                closestTeam: null,
                scores: createScores()
            }
        };
    }

    function reset() {
        currentDiagram = null;
        drawings = {};
        Object.assign(gameState, createState());
    }

    function startRound(diagram, painters) {
        currentDiagram = diagram;
        drawings = byTeam(() => []);
        const shown = shownCountOf(diagram);
        const chosen = normalizePainters(painters || state().painters);
        Object.keys(chosen).forEach(team => { if (!chosen[team]) chosen[team] = firstPlayerOf(team); });
        Object.assign(state(), {
            phase: 'PLAYING',
            diagramId: diagram.id,
            title: diagram.title,
            yLabel: typeof diagram.yLabel === 'string' ? diagram.yLabel : '',
            unit: typeof diagram.unit === 'string' ? diagram.unit : '',
            xLabels: diagram.xLabels.map(String),
            yMin: diagram.yMin,
            yMax: diagram.yMax,
            shownCount: shown,
            visibleValues: diagram.values.slice(0, shown),
            painters: chosen,
            drawingClosed: false,
            drawingsRevealed: false,
            solution: null,
            results: null,
            closestTeam: null
        });
    }

    /** Liefert das Team, fuer das der Socket gerade zeichnen darf, sonst null. */
    function drawingTeamOf(socket) {
        const game = state();
        const player = gameState.players[socket.id];
        if (!currentDiagram || game.phase !== 'PLAYING' || game.drawingClosed || !player || !player.team) return null;
        return game.painters[player.team] === socket.id ? player.team : null;
    }

    function registerAdminEvents(socket) {
        socket.on('getDiagrammeList', () => {
            if (!isAdmin(socket)) return;
            socket.emit('receiveDiagrammeList', readDiagrams());
        });

        socket.on('adminStartDiagrammeRound', ({ diagramId, painters } = {}) => {
            if (!isAdmin(socket) || typeof diagramId !== 'string') return;
            const diagram = readDiagrams().find(entry => entry.id === diagramId);
            if (!diagram) return;
            startRound(diagram, painters && typeof painters === 'object' ? painters : null);
            publish();
        });

        socket.on('adminSetDiagrammePainters', painters => {
            if (!isAdmin(socket) || !painters || typeof painters !== 'object') return;
            state().painters = normalizePainters({ ...state().painters, ...painters });
            publish();
        });

        socket.on('adminCloseDiagrammeDrawing', () => {
            if (!isAdmin(socket) || !currentDiagram) return;
            state().drawingClosed = true;
            publish();
        });

        socket.on('adminRevealDiagrammeDrawings', () => {
            if (!isAdmin(socket) || !currentDiagram) return;
            Object.assign(state(), { drawingClosed: true, drawingsRevealed: true });
            publish();
        });

        socket.on('adminRevealDiagrammeSolution', () => {
            if (!isAdmin(socket) || !currentDiagram) return;
            const results = byTeam(team => evaluate(currentDiagram, drawings[team]));
            Object.assign(state(), {
                drawingClosed: true,
                drawingsRevealed: true,
                solution: currentDiagram.values.slice(),
                results,
                closestTeam: pickClosestTeam(results)
            });
            publish();
        });
    }

    function registerPlayerEvents(socket) {
        socket.on('getDiagrammeView', () => socket.emit('diagrammeView', viewFor(socket.id)));

        socket.on('playerDiagrammeAddPoint', ({ u, v } = {}) => {
            const team = drawingTeamOf(socket);
            if (!team || !isFiniteNumber(u) || !isFiniteNumber(v)) return;
            const points = drawings[team] || (drawings[team] = []);
            if (points.length >= MAX_POINTS_PER_DRAWING) return;
            const minU = points.length ? points[points.length - 1].u : anchorOf(currentDiagram).u;
            points.push({ u: clamp(u, minU, 1), v: clamp(v, 0, 1) });
            publish();
        });

        socket.on('playerDiagrammeUndo', () => {
            const team = drawingTeamOf(socket);
            if (!team || !drawings[team] || !drawings[team].length) return;
            drawings[team].pop();
            publish();
        });

        socket.on('playerDiagrammeClear', () => {
            const team = drawingTeamOf(socket);
            if (!team) return;
            drawings[team] = [];
            publish();
        });
    }

    function register(socket) {
        registerAdminEvents(socket);
        registerPlayerEvents(socket);
    }

    function renameTeam(oldName, newName) {
        const game = state();
        renameKey(game.scores, oldName, newName);
        renameKey(game.painters, oldName, newName);
        renameKey(game.pointCounts, oldName, newName);
        renameKey(game.results, oldName, newName);
        if (game.closestTeam === oldName) game.closestTeam = newName;
        renameKey(drawings, oldName, newName);
    }

    return {
        id: 'DIAGRAMME',
        title: 'Diagramme',
        stateKey: 'diagrammeGame',
        clientModule: 'diagramme',
        layout: 'medium',
        maxScore: MAX_SCORE,
        createState,
        reset,
        register,
        renameTeam,
        emitUpdates: emitViews,
        onPlayerRegistered: emitViews
    };
};
