'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

module.exports = function createPartnerwissenGame(ctx) {
    const { io, gameState, adminSockets, spectatorSockets, getPlayerName, createScores, renameKey, utils } = ctx;
    const { MAX_PARTNER_QUESTIONS, MAX_ALLOCATION_VALUE, TOTAL_ALLOCATION_POINTS } = utils;

    const partnerQuestionsPath = path.join(ROOT, 'partnerwissen.json');

    function getPartnerCatalogs() {
        try {
            const source = JSON.parse(fs.readFileSync(partnerQuestionsPath, 'utf8'));
            if (Array.isArray(source)) return { Allgemein: source };
            return Object.fromEntries(Object.entries(source).map(([name, questions]) => [
                name,
                Array.isArray(questions) ? questions.filter(question => question.question && question.answer) : []
            ]));
        } catch (error) {
            console.error('Fehler beim Lesen der Partnerfragen:', error.message);
            return {};
        }
    }

    function getPartnerQuestions(catalogName) {
        const catalogs = getPartnerCatalogs();
        return catalogs[catalogName] || catalogs[Object.keys(catalogs)[0]] || [];
    }

    function getPartnerAdminState() {
        const game = gameState.partnerGame;
        const questions = getPartnerQuestions(game.catalogName);
        const teams = {};
        Object.entries(game.teams).forEach(([team, teamGame]) => {
            teams[team] = {
                ...teamGame,
                raterName: getPlayerName(teamGame.raterId),
                answererName: getPlayerName(teamGame.answererId)
            };
        });
        return {
            phase: game.phase,
            round: game.round,
            catalogName: game.catalogName,
            questions: game.questionIndexes.map(index => questions[index]),
            teams,
            scores: game.scores
        };
    }

    function emitPartnerAdminState() {
        const state = getPartnerAdminState();
        adminSockets.forEach(socketId => io.to(socketId).emit('partnerAdminUpdate', state));
    }

    function emitPartnerSpectatorState() {
        const state = getPartnerAdminState();
        spectatorSockets.forEach(socketId => io.to(socketId).emit('partnerSpectatorUpdate', state));
    }

    function emitPartnerPlayerViews() {
        const game = gameState.partnerGame;
        const questions = getPartnerQuestions(game.catalogName);
        Object.values(gameState.players).forEach(player => {
            const teamGame = game.teams[player.team];
            let view = { role: 'WAITING', phase: game.phase, round: game.round, scores: game.scores };
            if (teamGame && player.id === teamGame.raterId) {
                view = {
                    ...view,
                    role: 'RATER',
                    questions: game.questionIndexes.map(index => ({ question: questions[index].question })),
                    allocations: teamGame.allocations,
                    results: teamGame.results
                };
            } else if (teamGame && player.id === teamGame.answererId) {
                view = {
                    ...view,
                    role: 'ANSWERER',
                    questions: teamGame.revealedIndexes.map(index => ({
                        index,
                        question: questions[game.questionIndexes[index]].question
                    })),
                    revealedIndexes: teamGame.revealedIndexes,
                    results: teamGame.results
                };
            }
            io.to(player.id).emit('partnerPlayerUpdate', view);
        });
    }

    function emitPartnerUpdates() {
        emitPartnerPlayerViews();
        emitPartnerAdminState();
        emitPartnerSpectatorState();
    }

    function reset() {
        Object.assign(gameState, createState());
    }

    function allPartnerTeamsComplete() {
        return Object.values(gameState.partnerGame.teams).every(teamGame => (
            teamGame.results.every(result => result !== null)
        ));
    }

    function createState() {
        return {
            partnerGame: {
                phase: 'IDLE',
                round: 0,
                catalogName: null,
                questionIndexes: [],
                teams: {},
                scores: createScores(),
                usedQuestionIndexes: []
            }
        };
    }

    function onScreenEnter() {
        emitPartnerUpdates();
    }

    function onPlayerRegistered() {
        emitPartnerPlayerViews();
    }

    function onAdminLogin(socket) {
        socket.emit('partnerAdminUpdate', getPartnerAdminState());
    }

    function onSpectatorLogin(socket) {
        socket.emit('partnerSpectatorUpdate', getPartnerAdminState());
    }

    function register(socket) {
        socket.on('adminStartPartnerRound', ({ assignments, catalogName }) => {
            if (!adminSockets.has(socket.id)) return;
            if (gameState.partnerGame.round >= MAX_PARTNER_QUESTIONS) {
                console.warn('Maximale Anzahl an Partner-Runden erreicht');
                return;
            }
            const catalogs = getPartnerCatalogs();
            const selectedCatalog = catalogName || Object.keys(catalogs)[0];
            const questions = catalogs[selectedCatalog] || [];
            if (questions.length < MAX_PARTNER_QUESTIONS) {
                console.warn('Nicht genügend Fragen im Katalog');
                return;
            }
            const teams = Object.keys(gameState.teams);
            const nextTeams = {};
            for (const team of teams) {
                const assignment = assignments && assignments[team];
                const rater = assignment && gameState.players[assignment.raterId];
                const answerer = assignment && gameState.players[assignment.answererId];
                if (!rater || !answerer || rater.id === answerer.id || rater.team !== team || answerer.team !== team) return;
                nextTeams[team] = {
                    raterId: rater.id,
                    answererId: answerer.id,
                    revealedIndexes: [],
                    allocations: [null, null, null, null],
                    results: [null, null, null, null]
                };
            }
            let available = questions
                .map((question, index) => index)
                .filter(index => !gameState.partnerGame.usedQuestionIndexes.includes(index));
            if (available.length < 4) {
                gameState.partnerGame.usedQuestionIndexes = [];
                available = questions.map((question, index) => index);
            }
            const selected = available.sort(() => Math.random() - 0.5).slice(0, 4);
            gameState.partnerGame.phase = 'PLAYING';
            gameState.partnerGame.round += 1;
            gameState.partnerGame.catalogName = selectedCatalog;
            gameState.partnerGame.teams = nextTeams;
            gameState.partnerGame.questionIndexes = selected;
            gameState.partnerGame.usedQuestionIndexes.push(...selected);
            emitPartnerUpdates();
        });


        socket.on('getPartnerCatalogs', () => {
            socket.emit('receivePartnerCatalogs', Object.keys(getPartnerCatalogs()));
        });

        socket.on('submitPartnerAllocations', allocations => {
            const game = gameState.partnerGame;
            if (game.phase !== 'PLAYING' || !Array.isArray(allocations)) {
                console.warn('Ungültige Partner-Allokation: Phase oder Array-Format');
                return;
            }
            const team = Object.keys(game.teams).find(teamName => game.teams[teamName].raterId === socket.id);
            if (!team) return;
            const teamGame = game.teams[team];
            // Validierung der Allokationen
            if (allocations.length !== MAX_PARTNER_QUESTIONS) {
                console.warn('Falsche Anzahl Allokationen:', allocations.length);
                return;
            }
            const cleanAllocations = allocations.map(value => Number(value));
            if (cleanAllocations.some(value => !Number.isInteger(value) || value < 0 || value > MAX_ALLOCATION_VALUE)) {
                console.warn('Allokationswerte außerhalb des Bereichs 0-4');
                return;
            }
            if (cleanAllocations.reduce((sum, value) => sum + value, 0) !== TOTAL_ALLOCATION_POINTS) {
                console.warn('Summe der Allokationen muss 10 sein');
                return;
            }
            teamGame.allocations = cleanAllocations;
            emitPartnerUpdates();
        });

        socket.on('adminRevealPartnerQuestion', ({ team, index }) => {
            if (!adminSockets.has(socket.id) || gameState.partnerGame.phase !== 'PLAYING') return;
            if (!utils.isValidTeamName(team)) {
                console.warn('Ungültiger Team-Name bei Partner-Frage');
                return;
            }
            const teamGame = gameState.partnerGame.teams[team];
            if (!teamGame) {
                console.warn('Team nicht gefunden:', team);
                return;
            }
            if (!utils.isValidIndex(index, 0, MAX_PARTNER_QUESTIONS - 1)) {
                console.warn('Ungültiger Index bei Partner-Frage:', index);
                return;
            }
            const cleanIndex = Number(index);
            if (!teamGame.revealedIndexes.includes(cleanIndex)) {
                teamGame.revealedIndexes.push(cleanIndex);
            }
            emitPartnerUpdates();
        });

        socket.on('adminMarkPartnerAnswer', ({ team, index, correct }) => {
            if (!adminSockets.has(socket.id) || gameState.partnerGame.phase !== 'PLAYING') return;
            if (!utils.isValidTeamName(team)) {
                console.warn('Ungültiger Team-Name bei Partner-Antwort');
                return;
            }
            const teamGame = gameState.partnerGame.teams[team];
            if (!teamGame) {
                console.warn('Team nicht gefunden:', team);
                return;
            }
            if (!utils.isValidIndex(index, 0, MAX_PARTNER_QUESTIONS - 1)) {
                console.warn('Ungültiger Index bei Partner-Antwort:', index);
                return;
            }
            const cleanIndex = Number(index);
            if (!teamGame.revealedIndexes.includes(cleanIndex) || teamGame.allocations[cleanIndex] === null) {
                console.warn('Frage nicht freigegeben oder keine Allokation');
                return;
            }
            if (teamGame.results[cleanIndex] !== null) {
                console.warn('Frage bereits bewertet');
                return;
            }
            const isCorrect = Boolean(correct);
            const question = getPartnerQuestions(gameState.partnerGame.catalogName)[gameState.partnerGame.questionIndexes[cleanIndex]];
            teamGame.results[cleanIndex] = {
                correct: isCorrect,
                points: isCorrect ? teamGame.allocations[cleanIndex] : 0,
                answer: question ? question.answer : ''
            };
            if (isCorrect) {
                gameState.partnerGame.scores[team] += teamGame.allocations[cleanIndex];
            }
            if (allPartnerTeamsComplete()) {
                gameState.partnerGame.phase = 'COMPLETE';
            }
            emitPartnerUpdates();
        });

    }

    function renameTeam(oldName, newName) {
        renameKey(gameState.partnerGame.scores, oldName, newName);
        renameKey(gameState.partnerGame.teams, oldName, newName);
    }

    return {
        id: 'PARTNERWISSEN',
        title: 'Ich weiß, was mein Partner weiß',
        stateKey: 'partnerGame',
        clientModule: 'partnerwissen',
        maxScore: null,
        createState,
        reset,
        emitUpdates: emitPartnerUpdates,
        register,
        renameTeam,
        onScreenEnter,
        onPlayerRegistered,
        onAdminLogin,
        onSpectatorLogin
    };
};
