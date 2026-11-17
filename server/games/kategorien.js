'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

module.exports = function createKategorienGame(ctx) {
    const { io, gameState, adminSockets, createScores, renameKey } = ctx;

    const categoryRoundsPath = path.join(ROOT, 'kategorien.json');

    const categoryCorrectAnswers = {};

    function getCategoryRounds() {
        try {
            const rounds = JSON.parse(fs.readFileSync(categoryRoundsPath, 'utf8'));
            return rounds && typeof rounds === 'object' && !Array.isArray(rounds) ? rounds : {};
        } catch (error) {
            console.error('Fehler beim Lesen der Kategorien-Runden:', error.message);
            return {};
        }
    }

    const DEFAULT_TURN_SECONDS = 15;
    const MIN_TURN_SECONDS = 5;
    const MAX_TURN_SECONDS = 120;
    let turnTimer = null;

    function createTurn() {
        return { team: null, duration: DEFAULT_TURN_SECONDS, remaining: 0, running: false, expired: false };
    }

    function stopTurnTimer() {
        if (turnTimer) clearInterval(turnTimer);
        turnTimer = null;
    }

    function startTurn(team, duration) {
        stopTurnTimer();
        const seconds = Math.min(MAX_TURN_SECONDS, Math.max(MIN_TURN_SECONDS, parseInt(duration, 10) || DEFAULT_TURN_SECONDS));
        gameState.categoryGame.turn = { team, duration: seconds, remaining: seconds, running: true, expired: false };
        turnTimer = setInterval(tickTurn, 1000);
    }

    function tickTurn() {
        const turn = gameState.categoryGame.turn;
        turn.remaining -= 1;
        if (turn.remaining <= 0) {
            turn.remaining = 0;
            turn.running = false;
            turn.expired = true;
            stopTurnTimer();
        }
        emitCategoryState();
    }

    /** Naechstes Team ist dran. Ohne laufenden Zug beginnt das erste Team. */
    function startNextTurn() {
        const teams = Object.keys(gameState.teams);
        const turn = gameState.categoryGame.turn;
        const currentIndex = teams.indexOf(turn.team);
        startTurn(teams[(currentIndex + 1) % teams.length], turn.duration);
    }

    function emitCategoryState() {
        io.emit('stateUpdate', gameState);
    }

    function createState() {
        return {
            categoryGame: {
                phase: 'IDLE',
                roundName: null,
                categories: [],
                terms: [],
                assignments: {},
                assignedTeams: {},
                revealed: {},
                results: {},
                turn: createTurn(),
                scores: createScores()
            },
            categoryRoundNames: []
        };
    }

    function onScreenEnter() {
        gameState.categoryRoundNames = Object.keys(getCategoryRounds());
        io.emit('stateUpdate', gameState);
    }

    function onAdminLogin(socket) {
        socket.emit('receiveCategoryRounds', Object.keys(getCategoryRounds()));
    }

    function reset() {
        stopTurnTimer();
        Object.keys(categoryCorrectAnswers).forEach(term => delete categoryCorrectAnswers[term]);
        Object.assign(gameState, createState());
        gameState.categoryRoundNames = Object.keys(getCategoryRounds());
    }

    function register(socket) {    gameState.categoryRoundNames = Object.keys(getCategoryRounds());

        socket.on('getCategoryRounds', () => {
            const rounds = Object.keys(getCategoryRounds());
            gameState.categoryRoundNames = rounds;
            socket.emit('receiveCategoryRounds', rounds);
        });

        socket.on('adminStartCategoryRound', roundName => {
            if (!adminSockets.has(socket.id)) return;
            const round = getCategoryRounds()[roundName];
            if (!round || !Array.isArray(round.categories) || !Array.isArray(round.terms) || round.categories.length === 0 || round.terms.length === 0) return;
            Object.keys(categoryCorrectAnswers).forEach(term => delete categoryCorrectAnswers[term]);
            round.terms.forEach(entry => {
                categoryCorrectAnswers[entry.term] = entry.category;
            });
            gameState.categoryGame = {
                phase: 'PLAYING',
                roundName,
                categories: round.categories,
                terms: round.terms.map(entry => ({ term: entry.term })),
                assignments: {},
                assignedTeams: {},
                revealed: {},
                results: {},
                turn: createTurn(),
                scores: gameState.categoryGame.scores
            };
            stopTurnTimer();
            emitCategoryState();
        });

        socket.on('adminAssignCategoryTerm', ({ term, category, team }) => {
            if (!adminSockets.has(socket.id) || gameState.categoryGame.phase !== 'PLAYING') return;
            const entry = gameState.categoryGame.terms.find(item => item.term === term);
            if (!entry) return;
            if (!category) {
                delete gameState.categoryGame.assignments[term];
                delete gameState.categoryGame.assignedTeams[term];
                delete gameState.categoryGame.revealed[term];
                delete gameState.categoryGame.results[term];
            } else if (gameState.categoryGame.categories.includes(category)) {
                gameState.categoryGame.assignments[term] = category;
                if (team && gameState.teams[team]) {
                    gameState.categoryGame.assignedTeams[term] = team;
                } else if (team === null) {
                    delete gameState.categoryGame.assignedTeams[term];
                }
                // Not revealed yet - do not compute result immediately
                delete gameState.categoryGame.revealed[term];
                delete gameState.categoryGame.results[term];
                if (gameState.categoryGame.turn.running) startNextTurn();
            } else {
                return;
            }
            emitCategoryState();
        });

        socket.on('adminSetCategoryTurnDuration', duration => {
            if (!adminSockets.has(socket.id) || gameState.categoryGame.phase !== 'PLAYING') return;
            const seconds = parseInt(duration, 10);
            if (!Number.isInteger(seconds)) return;
            gameState.categoryGame.turn.duration = Math.min(MAX_TURN_SECONDS, Math.max(MIN_TURN_SECONDS, seconds));
            emitCategoryState();
        });

        socket.on('adminStartCategoryTurn', team => {
            if (!adminSockets.has(socket.id) || gameState.categoryGame.phase !== 'PLAYING') return;
            if (team && gameState.teams[team]) startTurn(team, gameState.categoryGame.turn.duration);
            else startNextTurn();
            emitCategoryState();
        });

        socket.on('adminStopCategoryTurn', () => {
            if (!adminSockets.has(socket.id) || gameState.categoryGame.phase !== 'PLAYING') return;
            stopTurnTimer();
            gameState.categoryGame.turn = { ...createTurn(), duration: gameState.categoryGame.turn.duration };
            emitCategoryState();
        });

        socket.on('adminSetCategoryTermTeam', ({ term, team }) => {
            if (!adminSockets.has(socket.id) || gameState.categoryGame.phase !== 'PLAYING') return;
            if (!gameState.categoryGame.assignments[term]) return;
            if (team && gameState.teams[team]) {
                gameState.categoryGame.assignedTeams[term] = team;
            } else {
                delete gameState.categoryGame.assignedTeams[term];
            }
            emitCategoryState();
        });


        socket.on('adminRevealCategoryTerm', (term) => {
            if (!adminSockets.has(socket.id) || gameState.categoryGame.phase !== 'PLAYING') return;
            const assignedCategory = gameState.categoryGame.assignments[term];
            if (!assignedCategory) return;
            if (gameState.categoryGame.revealed[term]) {
                delete gameState.categoryGame.revealed[term];
                delete gameState.categoryGame.results[term];
            } else {
                gameState.categoryGame.revealed[term] = true;
                gameState.categoryGame.results[term] = (categoryCorrectAnswers[term] === assignedCategory);
            }
            emitCategoryState();
        });

        socket.on('adminRevealAllCategoryTerms', () => {
            if (!adminSockets.has(socket.id) || gameState.categoryGame.phase !== 'PLAYING') return;
            (gameState.categoryGame.terms || []).forEach(entry => {
                const assignedCategory = gameState.categoryGame.assignments[entry.term];
                if (assignedCategory) {
                    gameState.categoryGame.revealed[entry.term] = true;
                    gameState.categoryGame.results[entry.term] = (categoryCorrectAnswers[entry.term] === assignedCategory);
                }
            });
            emitCategoryState();
        });

    }

    function renameTeam(oldName, newName) {
        renameKey(gameState.categoryGame.scores, oldName, newName);
        if (gameState.categoryGame.turn.team === oldName) gameState.categoryGame.turn.team = newName;
        Object.entries(gameState.categoryGame.assignedTeams).forEach(([term, team]) => {
            if (team === oldName) gameState.categoryGame.assignedTeams[term] = newName;
        });
    }

    function registerRoutes(app) {
        app.get('/kategorien.json', (req, res) => {
            res.sendFile(categoryRoundsPath);
        });
    }

    return {
        id: 'KATEGORIEN',
        title: 'Begriffe Kategorien zuordnen',
        stateKey: 'categoryGame',
        clientModule: 'kategorien',
        layout: 'wide',
        maxScore: null,
        createState,
        reset,
        register,
        renameTeam,
        onScreenEnter,
        onAdminLogin,
        registerRoutes
    };
};
