'use strict';

const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

const WORDS_PER_BOARD = 12;
const MAX_WORD_LENGTH = 40;
const MAX_LINES = 24;
const MAX_LINE_LENGTH = 40;
const MIN_BPM = 60;
const MAX_BPM = 240;
const DEFAULT_BPM = 90;
const BEATS_PER_BAR = 1;
const BARS_PER_LINE = 4;
const COUNT_IN_BEATS = 4;
const START_DELAY_MS = 1500;

/**
 * Rap Battle: Ein Spieler rappt zu einem Beat. Auf dem Bildschirm sieht er nur das Reimwort am Ende jeder
 * Zeile (die aktuelle Zeile und die naechsten beiden). Jede Zeile hat 4 Bars (je ein Beat, also 4 Beats pro Zeile), die ersten Bars freestylt er
 * so, dass die Zeile zum Reimwort passt. Alle anderen Spieler schreiben vorher Woerter auf, die ihrer
 * Meinung nach im Rap vorkommen (je Team ein gemeinsames Feld mit 12 Woertern) und markieren sie waehrend
 * des Raps, wenn sie fallen.
 *
 * Inhalte: rap-battle.json (nur per Admin-Event), Array aus
 *   { id, title, topic?, bpm?, lines: ["Reimwort", ...] }   (1 bis 24 Reimwoerter, je eine Zeile)
 * Alles Geheime (Reimwoerter, Woerter der Teams) bleibt im Server und geht nur ueber den privaten Kanal
 * "rapBattleView" an den, der es sehen darf:
 *   Admin/Zuschauer: immer alles. Rappender: Reimwoerter nur nach "Rap dem Rappenden zeigen", Woerter nie
 *   (ausser nach dem Aufdecken). Mitspieler: Reimwoerter nur nach "Rap den Mitspielern zeigen", dazu das
 *   Wortfeld des eigenen Teams.
 * Der Beat und die Animation laufen im Client. Der Server gibt nur Startzeitpunkt und Tempo vor.
 */
module.exports = function createRapBattleGame(ctx) {
    const { io, gameState, adminSockets, spectatorSockets, createScores, byTeam, renameKey, emitState, isAdmin, utils } = ctx;

    const rapsPath = path.join(ROOT, 'rap-battle.json');
    let currentRap = null;
    let boards = {};
    let timing = null;

    const state = () => gameState.rapBattleGame;

    const emptyBoard = () => ({ words: Array(WORDS_PER_BOARD).fill(''), marked: Array(WORDS_PER_BOARD).fill(false) });

    function isValidRap(entry) {
        return Boolean(entry) && typeof entry.id === 'string' && typeof entry.title === 'string'
            && Array.isArray(entry.lines) && entry.lines.length >= 1 && entry.lines.length <= MAX_LINES
            && entry.lines.every(line => typeof line === 'string' && line.trim() !== '');
    }

    function clampBpm(value, fallback) {
        const bpm = Number(value);
        return Number.isFinite(bpm) ? Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(bpm))) : fallback;
    }

    function normalizeRap(entry) {
        return {
            id: entry.id,
            title: utils.sanitizeString(entry.title, MAX_LINE_LENGTH * 2),
            topic: typeof entry.topic === 'string' ? utils.sanitizeString(entry.topic, MAX_LINE_LENGTH * 2) : '',
            bpm: clampBpm(entry.bpm, DEFAULT_BPM),
            lines: entry.lines.map(line => utils.sanitizeString(line, MAX_LINE_LENGTH))
        };
    }

    const readRaps = () => utils.readJsonArray(rapsPath, isValidRap).map(normalizeRap);

    /* ---------- Private Ansichten ---------- */

    function canSeeLines(game, socketId, isHost) {
        if (!currentRap) return false;
        if (isHost || game.revealed) return true;
        if (socketId === game.rapperId) return game.rapperShown;
        return Boolean(gameState.players[socketId]) && game.othersShown;
    }

    function viewFor(socketId) {
        const game = state();
        const isHost = adminSockets.has(socketId) || spectatorSockets.has(socketId);
        const player = gameState.players[socketId];
        const showLines = canSeeLines(game, socketId, isHost);
        const isRapper = !isHost && socketId === game.rapperId;
        const ownBoard = player && player.team && !isRapper ? boards[player.team] : null;
        return {
            role: isHost ? 'host' : (isRapper ? 'rapper' : 'player'),
            serverNow: Date.now(),
            title: isHost && currentRap ? currentRap.title : '',
            lines: showLines ? currentRap.lines.slice() : null,
            timing: game.rapperShown ? timing : null,
            board: ownBoard && !game.revealed ? structuredClone(ownBoard) : null,
            boards: currentRap && (isHost || game.revealed) ? structuredClone(boards) : null
        };
    }

    function emitViews() {
        const recipients = new Set([...adminSockets, ...spectatorSockets, ...Object.keys(gameState.players)]);
        recipients.forEach(socketId => io.to(socketId).emit('rapBattleView', viewFor(socketId)));
    }

    function syncProgress() {
        state().boardProgress = byTeam(team => {
            const board = boards[team] || emptyBoard();
            return { filled: board.words.filter(Boolean).length, marked: board.marked.filter(Boolean).length };
        });
    }

    function publish() {
        syncProgress();
        emitState();
        emitViews();
    }

    /* ---------- Zustand ---------- */

    function createState() {
        return {
            rapBattleGame: {
                phase: 'IDLE',
                topic: '',
                rapperId: null,
                rapperTeam: null,
                lineCount: 0,
                wordsPerBoard: WORDS_PER_BOARD,
                bpm: DEFAULT_BPM,
                othersShown: false,
                rapperShown: false,
                revealed: false,
                boardProgress: byTeam(() => ({ filled: 0, marked: 0 })),
                scores: createScores()
            }
        };
    }

    function reset() {
        currentRap = null;
        boards = {};
        timing = null;
        Object.assign(gameState, createState());
    }

    function startRound(rap, rapper) {
        currentRap = rap;
        boards = byTeam(emptyBoard);
        timing = null;
        Object.assign(state(), {
            phase: 'WRITING',
            topic: rap.topic,
            rapperId: rapper.id,
            rapperTeam: rapper.team,
            lineCount: rap.lines.length,
            bpm: rap.bpm,
            othersShown: false,
            rapperShown: false,
            revealed: false
        });
    }

    function startRap(bpm) {
        const game = state();
        game.bpm = clampBpm(bpm, game.bpm);
        timing = {
            startAt: Date.now() + START_DELAY_MS,
            bpm: game.bpm,
            beatsPerBar: BEATS_PER_BAR,
            barsPerLine: BARS_PER_LINE,
            countInBeats: COUNT_IN_BEATS
        };
        Object.assign(game, { phase: 'RAPPING', rapperShown: true });
    }

    function stopRap() {
        timing = null;
        Object.assign(state(), { phase: 'FINISHED', rapperShown: false });
    }

    const isRoundOpen = () => Boolean(currentRap) && !state().revealed;

    /* ---------- Events ---------- */

    function registerAdminEvents(socket) {
        socket.on('getRapBattleRaps', () => {
            if (!isAdmin(socket)) return;
            socket.emit('receiveRapBattleRaps', readRaps());
        });

        socket.on('adminStartRapBattleRound', ({ rapId, rapperId } = {}) => {
            if (!isAdmin(socket) || typeof rapId !== 'string' || typeof rapperId !== 'string') return;
            const rap = readRaps().find(entry => entry.id === rapId);
            const rapper = gameState.players[rapperId];
            if (!rap || !rapper || !rapper.team) return;
            startRound(rap, rapper);
            publish();
        });

        socket.on('adminShowRapBattleToOthers', shown => {
            if (!isAdmin(socket) || !isRoundOpen() || typeof shown !== 'boolean') return;
            state().othersShown = shown;
            publish();
        });

        socket.on('adminStartRapBattleRap', ({ bpm } = {}) => {
            if (!isAdmin(socket) || !isRoundOpen()) return;
            startRap(bpm);
            publish();
        });

        socket.on('adminStopRapBattleRap', () => {
            if (!isAdmin(socket) || !isRoundOpen()) return;
            stopRap();
            publish();
        });

        socket.on('adminRevealRapBattleWords', () => {
            if (!isAdmin(socket) || !currentRap) return;
            timing = null;
            Object.assign(state(), { phase: 'FINISHED', rapperShown: false, revealed: true });
            publish();
        });
    }

    function registerPlayerEvents(socket) {
        socket.on('getRapBattleView', () => socket.emit('rapBattleView', viewFor(socket.id)));

        /** Das Wortfeld des eigenen Teams. Der Rappende ist ausgeschlossen. */
        function boardOf(socketId) {
            const player = gameState.players[socketId];
            if (!player || !player.team || socketId === state().rapperId) return null;
            return boards[player.team] || null;
        }

        socket.on('playerSetRapBattleWord', ({ index, word } = {}) => {
            const board = boardOf(socket.id);
            if (!board || !isRoundOpen() || state().phase !== 'WRITING') return;
            if (!utils.isValidIndex(index, 0, WORDS_PER_BOARD - 1) || typeof word !== 'string') return;
            board.words[index] = utils.sanitizeString(word, MAX_WORD_LENGTH);
            if (!board.words[index]) board.marked[index] = false;
            publish();
        });

        socket.on('playerToggleRapBattleMark', ({ index } = {}) => {
            const board = boardOf(socket.id);
            if (!board || !isRoundOpen() || !['RAPPING', 'FINISHED'].includes(state().phase)) return;
            if (!utils.isValidIndex(index, 0, WORDS_PER_BOARD - 1) || !board.words[index]) return;
            board.marked[index] = !board.marked[index];
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
        renameKey(game.boardProgress, oldName, newName);
        renameKey(boards, oldName, newName);
        if (game.rapperTeam === oldName) game.rapperTeam = newName;
    }

    return {
        id: 'RAP_BATTLE',
        title: 'Rap Battle',
        stateKey: 'rapBattleGame',
        clientModule: 'rap-battle',
        maxScore: null,
        createState,
        reset,
        register,
        renameTeam,
        emitUpdates: emitViews,
        onScreenEnter: emitViews,
        onPlayerRegistered: emitViews,
        onAdminLogin: socket => socket.emit('rapBattleView', viewFor(socket.id)),
        onSpectatorLogin: socket => socket.emit('rapBattleView', viewFor(socket.id))
    };
};
