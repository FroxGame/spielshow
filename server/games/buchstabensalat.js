'use strict';

const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const MIN_STEP_SECONDS = 1;
const MAX_STEP_SECONDS = 30;
const DEFAULT_STEP_SECONDS = 2;

/**
 * Buchstabensalat: Ein Begriff taucht Schritt fuer Schritt aus einem Buchstabensalat auf.
 * Wer ihn erkennt, buzzert. Der Buzzer pausiert die Aufloesung, der Admin wertet.
 * Die Loesung bleibt serverseitig, bis der Admin aufloest.
 */
module.exports = function createBuchstabensalatGame(ctx) {
    const { gameState, createScores, renameKey, emitState, isAdmin, utils } = ctx;

    const roundsPath = path.join(ROOT, 'buchstabensalat.json');
    let currentRound = null;
    let stepTimer = null;

    const state = () => gameState.buchstabensalatGame;

    function readRounds() {
        const data = utils.readJsonFile(roundsPath);
        return Array.isArray(data.rounds) ? data.rounds : [];
    }

    function stopTimer() {
        if (stepTimer) clearInterval(stepTimer);
        stepTimer = null;
    }

    function revealAnswer() {
        stopTimer();
        state().phase = 'REVEALED';
        state().answer = currentRound ? currentRound.answer : '';
        state().revealed = state().answer;
    }

    function showNextStep() {
        const game = state();
        if (game.phase !== 'PLAYING' || game.buzzerLocked) return;
        if (game.step >= currentRound.order.length) {
            revealAnswer();
        } else {
            game.revealed = currentRound.order[game.step];
            game.step += 1;
        }
        emitState();
    }

    function startRound(round, stepSeconds) {
        stopTimer();
        currentRound = round;
        Object.assign(state(), {
            phase: 'PLAYING',
            roundId: round.id,
            category: round.category,
            answer: '',
            revealed: '',
            step: 0,
            totalSteps: round.order.length,
            stepSeconds,
            buzzerLocked: false,
            buzzerWinner: null,
            buzzerTeam: null
        });
        stepTimer = setInterval(showNextStep, stepSeconds * 1000);
    }

    function createState() {
        return {
            buchstabensalatGame: {
                phase: 'IDLE',
                roundId: null,
                category: null,
                answer: '',
                revealed: '',
                step: 0,
                totalSteps: 0,
                stepSeconds: DEFAULT_STEP_SECONDS,
                buzzerLocked: false,
                buzzerWinner: null,
                buzzerTeam: null,
                scores: createScores()
            }
        };
    }

    function reset() {
        stopTimer();
        currentRound = null;
        Object.assign(gameState, createState());
    }

    function register(socket) {
        socket.on('getBuchstabensalatRounds', () => {
            if (!isAdmin(socket)) return;
            socket.emit('receiveBuchstabensalatRounds', readRounds().map(({ id, category, answer }) => ({ id, category, answer })));
        });

        socket.on('adminStartBuchstabensalatRound', ({ roundId, duration } = {}) => {
            if (!isAdmin(socket)) return;
            const round = readRounds().find(entry => entry.id === roundId);
            if (!round || !Array.isArray(round.order) || !round.order.length) return;
            const seconds = Math.min(MAX_STEP_SECONDS, Math.max(MIN_STEP_SECONDS, parseInt(duration, 10) || DEFAULT_STEP_SECONDS));
            startRound(round, seconds);
            emitState();
        });

        socket.on('adminRevealBuchstabensalat', () => {
            if (!isAdmin(socket) || !currentRound) return;
            revealAnswer();
            emitState();
        });
    }

    function renameTeam(oldName, newName) {
        renameKey(state().scores, oldName, newName);
        if (state().buzzerTeam === oldName) state().buzzerTeam = newName;
    }

    return {
        id: 'BUCHSTABENSALAT',
        title: 'Buchstabensalat',
        stateKey: 'buchstabensalatGame',
        clientModule: 'buchstabensalat',
        buzzer: true,
        canBuzz: () => state().phase === 'PLAYING',
        createState,
        reset,
        register,
        renameTeam
    };
};
