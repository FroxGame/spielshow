'use strict';

const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const START_WORDS = 3;
const MAX_WORD_LENGTH = 60;

/**
 * Songtexte vervollstaendigen: Die ersten drei Woerter eines Songtext-Abschnitts sind sichtbar.
 * Die Teams ergaenzen abwechselnd das naechste Wort. Der Admin deckt jedes richtige Wort auf
 * (sieht vorab das naechste Wort) oder den ganzen Text, wenn jemand falsch liegt.
 * Inhalte: songtexte.json (Array aus { id, title, part, lyrics }), nur per Admin-Event abrufbar.
 * lyrics ist ein Strophen- oder Refrain-Ausschnitt, Zeilen mit \n getrennt.
 * Der unaufgedeckte Text bleibt im Server. Im State stehen nur aufgedeckte Woerter.
 */
module.exports = function createSongtexteGame(ctx) {
    const { io, gameState, adminSockets, createScores, renameKey, emitState, isAdmin, utils } = ctx;

    const songsPath = path.join(ROOT, 'songtexte.json');
    let words = [];           // alle Woerter der Runde: { text, newLine }
    let revealedCount = 0;

    const state = () => gameState.songtexteGame;

    const readSongs = () => utils.readJsonArray(songsPath, entry =>
        entry && typeof entry.id === 'string' && typeof entry.title === 'string'
        && typeof entry.lyrics === 'string');

    function splitWords(lyrics) {
        return lyrics.split(/\r?\n/).flatMap(line =>
            line.split(/\s+/).filter(Boolean).map((text, index) => ({ text, newLine: index === 0 })));
    }

    function createState() {
        return {
            songtexteGame: {
                phase: 'IDLE',
                songId: null,
                title: '',
                part: '',
                revealed: [],        // aufgedeckte Woerter: { text, newLine }
                totalWords: 0,
                scores: createScores()
            }
        };
    }

    function reset() {
        words = [];
        revealedCount = 0;
        Object.assign(gameState, createState());
        sendNextWordToAdmins();
    }

    function nextWordInfo() {
        const next = words[revealedCount];
        return { word: next ? next.text : null, remaining: words.length - revealedCount };
    }

    function sendNextWordToAdmins() {
        adminSockets.forEach(id => io.to(id).emit('songtexteNextWord', nextWordInfo()));
    }

    function syncRevealed() {
        state().revealed = words.slice(0, revealedCount);
    }

    function publish() {
        syncRevealed();
        sendNextWordToAdmins();
        emitState();
    }

    function startSong(song) {
        words = splitWords(song.lyrics).slice(0, 2000).map(word => ({ ...word, text: word.text.slice(0, MAX_WORD_LENGTH) }));
        revealedCount = Math.min(START_WORDS, words.length);
        Object.assign(state(), {
            phase: revealedCount >= words.length ? 'REVEALED' : 'PLAYING',
            songId: song.id,
            title: song.title,
            part: typeof song.part === 'string' ? song.part : '',
            totalWords: words.length
        });
        publish();
    }

    function revealNextWord() {
        if (state().phase !== 'PLAYING' || revealedCount >= words.length) return;
        revealedCount += 1;
        if (revealedCount >= words.length) state().phase = 'REVEALED';
        publish();
    }

    function revealAll() {
        if (state().phase === 'IDLE') return;
        revealedCount = words.length;
        state().phase = 'REVEALED';
        publish();
    }

    function register(socket) {
        socket.on('getSongtexteSongs', () => {
            if (!isAdmin(socket)) return;
            socket.emit('receiveSongtexteSongs', readSongs().map(({ id, title, part }) => ({
                id, title, part: typeof part === 'string' ? part : ''
            })));
        });

        socket.on('getSongtexteNextWord', () => {
            if (!isAdmin(socket)) return;
            socket.emit('songtexteNextWord', nextWordInfo());
        });

        socket.on('adminStartSongtexteSong', ({ songId } = {}) => {
            if (!isAdmin(socket) || typeof songId !== 'string') return;
            const song = readSongs().find(entry => entry.id === songId);
            if (!song) return;
            startSong(song);
        });

        socket.on('adminRevealSongtexteWord', () => {
            if (!isAdmin(socket)) return;
            revealNextWord();
        });

        socket.on('adminRevealSongtexteAll', () => {
            if (!isAdmin(socket)) return;
            revealAll();
        });
    }

    function renameTeam(oldName, newName) {
        renameKey(state().scores, oldName, newName);
    }

    return {
        id: 'SONGTEXTE',
        title: 'Songtexte vervollständigen',
        stateKey: 'songtexteGame',
        clientModule: 'songtexte',
        maxScore: 5,
        createState,
        reset,
        register,
        renameTeam,
        onAdminLogin: socket => socket.emit('songtexteNextWord', nextWordInfo())
    };
};
