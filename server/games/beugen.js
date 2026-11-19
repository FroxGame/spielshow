'use strict';

const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const MAX_SCORE = 7;

/**
 * Beugen: Ein Verb in der Grundform wird gezeigt, danach die gesuchte Form.
 * Wer sie zuerst richtig nennt, buzzert. Der Admin wertet und vergibt Punkte.
 * Inhalte: beugen.json (Array aus { id, verb, form, answer }), nur per Admin-Event abrufbar.
 * Verb und Form gehoeren immer als Paar zusammen. Die Loesung bleibt im Server bis zum Aufdecken.
 */
module.exports = function createBeugenGame(ctx) {
    const { gameState, createScores, renameKey, emitState, isAdmin, utils } = ctx;

    const roundsPath = path.join(ROOT, 'beugen.json');
    let currentRound = null;

    const state = () => gameState.beugenGame;

    const readRounds = () => utils.readJsonArray(roundsPath, entry =>
        entry && typeof entry.id === 'string' && typeof entry.verb === 'string'
        && typeof entry.form === 'string' && typeof entry.answer === 'string');

    function createState() {
        return {
            beugenGame: {
                phase: 'IDLE',
                roundId: null,
                verb: '',
                form: '',
                formShown: false,
                answer: '',
                buzzerLocked: false,
                buzzerWinner: null,
                buzzerTeam: null,
                scores: createScores()
            }
        };
    }

    function reset() {
        currentRound = null;
        Object.assign(gameState, createState());
    }

    function register(socket) {
        socket.on('getBeugenRounds', () => {
            if (!isAdmin(socket)) return;
            socket.emit('receiveBeugenRounds', readRounds().map(({ id, verb, form, answer }) => ({ id, verb, form, answer })));
        });

        socket.on('adminStartBeugenRound', ({ roundId } = {}) => {
            if (!isAdmin(socket) || typeof roundId !== 'string') return;
            const round = readRounds().find(entry => entry.id === roundId);
            if (!round) return;
            currentRound = round;
            Object.assign(state(), {
                phase: 'PLAYING',
                roundId: round.id,
                verb: round.verb,
                form: '',
                formShown: false,
                answer: '',
                buzzerLocked: false,
                buzzerWinner: null,
                buzzerTeam: null
            });
            emitState();
        });

        socket.on('adminShowBeugenForm', () => {
            if (!isAdmin(socket) || !currentRound || state().phase !== 'PLAYING') return;
            Object.assign(state(), { form: currentRound.form, formShown: true });
            emitState();
        });

        socket.on('adminRevealBeugen', () => {
            if (!isAdmin(socket) || !currentRound || state().phase === 'IDLE') return;
            Object.assign(state(), { phase: 'REVEALED', form: currentRound.form, formShown: true, answer: currentRound.answer });
            emitState();
        });
    }

    function renameTeam(oldName, newName) {
        renameKey(state().scores, oldName, newName);
        if (state().buzzerTeam === oldName) state().buzzerTeam = newName;
    }

    return {
        id: 'BEUGEN',
        title: 'Beugen',
        stateKey: 'beugenGame',
        clientModule: 'beugen',
        maxScore: MAX_SCORE,
        buzzer: true,
        canBuzz: () => state().phase === 'PLAYING' && state().formShown,
        createState,
        reset,
        register,
        renameTeam
    };
};
