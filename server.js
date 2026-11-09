const express = require('express');

const http = require('http');

const { Server } = require('socket.io');

const path = require('path');

const fs = require('fs');

const discordTerms = require('./discord.json');

const partnerQuestionsPath = path.join(__dirname, 'partnerwissen.json');

const diktatSentencesPath = path.join(__dirname, 'diktat.json');

const categoryRoundsPath = path.join(__dirname, 'kategorien.json');

const referatTopicsPath = path.join(__dirname, 'bingo.json');

const malenWordsPath = path.join(__dirname, 'malen.json');

const kartePlacesPath = path.join(__dirname, 'karte.json');
const flaggenRoundsPath = path.join(__dirname, 'flaggen.json');
const buchstabensalatRoundsPath = path.join(__dirname, 'buchstabensalat.json');

const listenwissen = require('./listenwissen.js');
const utils = require('./utils');

const app = express();

const server = http.createServer(app);

const io = new Server(server);

// Umgebungsvariablen für Passwörter (ersetze "1234" durch sichere Passwörter)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "1234";
const SPECTATOR_PASSWORD = process.env.SPECTATOR_PASSWORD || "1234";

// Spieler-Zähler für automatische Namensvergabe
let playerCounter = 1;

const gameIntroDetails = {
    LISTENWISSEN: { number: 1, name: 'Listenwissen' },
    KARTE: { number: 2, name: 'Wo ist das auf der Karte?' },
    KATEGORIEN: { number: 3, name: 'Begriffe Kategorien zuordnen' },
    DIKTAT: { number: 4, name: 'Diktat' },
    MALEN: { number: 5, name: 'Blindes Malen' },
    PARTNERWISSEN: { number: 6, name: 'Ich weiß, was mein Partner weiß' },
    BINGO: { number: 7, name: 'Referat Bingo' },
    DISCORD_GAME: { number: 8, name: 'Das kam bei Discord nicht an' },
    PROMI_RATEN: { number: 9, name: 'Promis raten' },
    DRUDEL: { number: 10, name: 'Drudel' },
    MERKEN: { number: 11, name: 'Merken' },
    REALITAET: { number: 12, name: 'Ist es real oder ist es nicht Wirklichkeit?' },
    FLAGGEN: { number: 13, name: 'Flaggen bauen' },
    BUCHSTABENSALAT: { number: 14, name: 'Buchstabensalat' }
};

const merkenCards = [
    ['🍎', 'Apfel'], ['🚲', 'Fahrrad'], ['🐱', 'Katze'], ['🌈', 'Regenbogen'], ['⚽', 'Fußball'],
    ['🚀', 'Rakete'], ['🎸', 'Gitarre'], ['🌻', 'Sonnenblume'], ['🐘', 'Elefant'], ['🍕', 'Pizza'],
    ['🚂', 'Zug'], ['⭐', 'Stern'], ['🏠', 'Haus'], ['🦋', 'Schmetterling'], ['☂️', 'Regenschirm'],
    ['🎈', 'Luftballon'], ['🐢', 'Schildkröte'], ['🍦', 'Eis'], ['⛵', 'Segelboot'], ['🔑', 'Schlüssel'],
    ['🌵', 'Kaktus'], ['🎁', 'Geschenk'], ['🕶️', 'Sonnenbrille'], ['🐝', 'Biene'], ['🍄', 'Pilz'],
    ['🎲', 'Würfel'], ['🌙', 'Mond'], ['🧩', 'Puzzle'], ['🦁', 'Löwe'], ['💡', 'Glühbirne']
].map(([icon, name], index) => ({ id: index + 1, icon, name }));

const flaggenCountries = {
    Deutschland: { flag: 'linear-gradient(#000 0 33%, #d00 33% 66%, #ffce00 66%)', elements: [['black', 'Schwarz'], ['red', 'Rot'], ['yellow', 'Gold']] },
    Frankreich: { flag: 'linear-gradient(90deg, #0055a4 0 33%, #fff 33% 66%, #ef4135 66%)', elements: [['blue', 'Blau'], ['white', 'Weiß'], ['red', 'Rot']] },
    Italien: { flag: 'linear-gradient(90deg, #009246 0 33%, #fff 33% 66%, #ce2b37 66%)', elements: [['green', 'Grün'], ['white', 'Weiß'], ['red', 'Rot']] },
    Ukraine: { flag: 'linear-gradient(#0057b7 0 50%, #ffd700 50%)', elements: [['blue', 'Blau'], ['yellow', 'Gelb']] },
    Japan: { flag: 'radial-gradient(circle at center, #bc002d 0 28%, #fff 29%)', elements: [['white', 'Weiß'], ['circle-red', 'Roter Kreis']] }
};

function createFlaggenElements(countryName) {
    const country = flaggenCountries[countryName] || flaggenCountries.Deutschland;
    const elements = country.elements.map(([type, label], index) => ({
        id: `${countryName}-${index}`,
        type,
        label,
        fake: false
    }));
    const fakes = [
        ['orange', 'Orange'], ['purple', 'Lila'], ['circle-blue', 'Blauer Kreis'],
        ['stripe-diagonal', 'Diagonaler Streifen'], ['green', 'Grün']
    ];
    fakes.slice(0, Math.max(2, 5 - elements.length)).forEach(([type, label], index) => {
        elements.push({ id: `${countryName}-fake-${index}`, type, label, fake: true });
    });
    return elements;
}

// Helper-Funktion: Umbenennung von Team-Daten in allen Game-Scores
function renameTeamData(gameState, oldName, newName) {
    // Haupt-Team-Daten
    gameState.teams[newName] = gameState.teams[oldName];
    delete gameState.teams[oldName];

    // Listenwissen
    if (gameState.listenwissenScores[oldName] !== undefined) {
        gameState.listenwissenScores[newName] = gameState.listenwissenScores[oldName];
        delete gameState.listenwissenScores[oldName];
    }

    // Discord Game
    if (discordGame.scores[oldName] !== undefined) {
        discordGame.scores[newName] = discordGame.scores[oldName];
        delete discordGame.scores[oldName];
    }

    // Promi Game
    if (gameState.promiGame.scores[oldName] !== undefined) {
        gameState.promiGame.scores[newName] = gameState.promiGame.scores[oldName];
        delete gameState.promiGame.scores[oldName];
    }

    // Drudel Game
    if (gameState.drudelGame.scores[oldName] !== undefined) {
        gameState.drudelGame.scores[newName] = gameState.drudelGame.scores[oldName];
        delete gameState.drudelGame.scores[oldName];
    }

    // Diktat Game
    if (gameState.diktatGame.scores[oldName] !== undefined) {
        gameState.diktatGame.scores[newName] = gameState.diktatGame.scores[oldName];
        delete gameState.diktatGame.scores[oldName];
    }

    // Partner Game (scores und teams)
    if (gameState.partnerGame.scores[oldName] !== undefined) {
        gameState.partnerGame.scores[newName] = gameState.partnerGame.scores[oldName];
        delete gameState.partnerGame.scores[oldName];
    }
    if (gameState.partnerGame.teams[oldName]) {
        gameState.partnerGame.teams[newName] = gameState.partnerGame.teams[oldName];
        delete gameState.partnerGame.teams[oldName];
    }

    // Malen, Karte, Referat Bingo, Merken, Realität
    [gameState.malenGame, gameState.karteGame, gameState.referatBingo, gameState.merkenGame, gameState.realitaetGame].forEach(game => {
        if (!game || !game.scores || game.scores[oldName] === undefined) return;
        game.scores[newName] = game.scores[oldName];
        delete game.scores[oldName];
    });

    // Flaggen Game (scores und boards)
    if (gameState.flaggenGame.scores[oldName] !== undefined) {
        gameState.flaggenGame.scores[newName] = gameState.flaggenGame.scores[oldName];
        delete gameState.flaggenGame.scores[oldName];
    }
    if (gameState.flaggenGame.boards[oldName]) {
        gameState.flaggenGame.boards[newName] = gameState.flaggenGame.boards[oldName];
        delete gameState.flaggenGame.boards[oldName];
    }

    // Buchstabensalat Game
    if (gameState.buchstabensalatGame.scores[oldName] !== undefined) {
        gameState.buchstabensalatGame.scores[newName] = gameState.buchstabensalatGame.scores[oldName];
        delete gameState.buchstabensalatGame.scores[oldName];
    }
}

// Helper-Funktion: Umbenennung von Team-Zuordnungen bei Spielern
function renameTeamPlayers(gameState, oldName, newName) {
    for (let id in gameState.players) {
        if (gameState.players[id].team === oldName) {
            gameState.players[id].team = newName;
        }
    }
}

app.get('/kategorien.json', (req, res) => {

    res.sendFile(categoryRoundsPath);

});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/bingo.json', (req, res) => {

    res.sendFile(referatTopicsPath);

});

app.get('/malen.json', (req, res) => {

    res.sendFile(malenWordsPath);

});

app.get('/karte.json', (req, res) => {

    res.sendFile(kartePlacesPath);

});

app.get('/flaggen.json', (req, res) => {

    res.sendFile(flaggenRoundsPath);

});

app.get('/buchstabensalat.json', (req, res) => {
    res.sendFile(buchstabensalatRoundsPath);
});

function getFlaggenRounds() {
    return utils.readJsonFile(flaggenRoundsPath);
}

function getBuchstabensalatRounds() {
    return utils.readJsonFile(buchstabensalatRoundsPath);
}

function getKartePlaces() {
    return utils.readJsonArray(kartePlacesPath);
}

function getMalenWords() {
    return utils.readJsonArray(malenWordsPath, t => typeof t === 'string' && t.trim());
}

function getReferatTopics() {
    return utils.readJsonArray(referatTopicsPath, t => typeof t === 'string' && t.trim());
}

// ZENTRALER GAME STATE

let gameState = {

    currentScreen: 'WAITING', // WAITING, LISTENWISSEN

    teams: {

        'Team 1': { score: 0, color: '#9b59b6' },

        'Team 2': { score: 0, color: '#2ecc71' }

    },

    players: {}, // { socketId: { id, name, team } }

    // Listenwissen State

    currentWordListKey: null,

    wordGameData: [],

    listenwissenScores: {

        'Team 1': 0,

        'Team 2': 0

    },

    promiGame: {

        imageIndex: -1,

        currentImage: '',

        revealedName: '',

        buzzerLocked: false,

        buzzerWinner: null,

        scores: {

            'Team 1': 0,

            'Team 2': 0

        },

        winnerTeam: null

    },

    drudelGame: {

        imageIndex: -1,

        currentImage: '',

        revealedName: '',

        buzzerLocked: false,

        buzzerWinner: null,

        scores: {

            'Team 1': 0,

            'Team 2': 0

        },

        winnerTeam: null

    },

    diktatGame: {

        phase: 'IDLE',

        round: 0,

        originalSentence: '',

        locked: false,

        scores: {

            'Team 1': 0,

            'Team 2': 0

        }

    },

    categoryGame: {

        phase: 'IDLE',

        roundName: null,

        categories: [],

        terms: [],

        assignments: {},

        assignedTeams: {},

        revealed: {},

        results: {},

        scores: {

            'Team 1': 0,

            'Team 2': 0

        }

    },

    categoryRoundNames: [],

    partnerGame: {

        phase: 'IDLE',

        round: 0,

        catalogName: null,

        questionIndexes: [],

        teams: {},

        scores: {

            'Team 1': 0,

            'Team 2': 0

        },

        usedQuestionIndexes: []

    },

    malenGame: {

        phase: 'IDLE', // 'IDLE' | 'PLAYING'

        word: '',

        painters: {

            'Team 1': null, // socketId

            'Team 2': null

        },

        drawings: {

            'Team 1': [],

            'Team 2': []

        },

        scores: {

            'Team 1': 0,

            'Team 2': 0

        }

    },

    karteGame: {

        phase: 'IDLE', // 'IDLE' | 'PLAYING'

        target: null, // { name, lat, lng }

        pinners: {

            'Team 1': null, // socketId

            'Team 2': null

        },

        guesses: {

            'Team 1': null, // { lat, lng }

            'Team 2': null

        },

        locked: {

            'Team 1': false,

            'Team 2': false

        },

        revealed: {

            'Team 1': false,

            'Team 2': false,

            'target': false

        },

        scores: {

            'Team 1': 0,

            'Team 2': 0

        }

    },

    referatBingo: {

        phase: 'IDLE', // 'IDLE' | 'PREPARING' | 'PLAYING'

        topic: '',

        topicRevealed: false,

        referatPlayerId: null,

        referatTeam: null,

        opposingTeam: null,

        partnerWords: Array(9).fill(''),

        partnerMarked: Array(9).fill(false),

        opposingWords: Array(9).fill(''),

        opposingMarked: Array(9).fill(false),

        timer: { duration: 120, remaining: 120, running: false },

        scores: {

            'Team 1': 0,

            'Team 2': 0

        }

    },

    merkenGame: {
        phase: 'IDLE',
        cards: merkenCards,
        duration: 30,
        remaining: 0,
        revealedCards: [],
        scores: {
            'Team 1': 0,
            'Team 2': 0
        }

    },

    realitaetGame: {
        phase: 'IDLE',
        targetTeam: null,
        contentType: null,
        image: '',
        duration: 180,
        remaining: 0,
        scores: {
            'Team 1': 0,
            'Team 2': 0
        }

    },

    flaggenGame: {
        phase: 'IDLE',
        country: null,
        targetFlag: null,
        elements: [],
        duration: 180,
        remaining: 0,
        timerRunning: false,
        buildingLocked: false,
        revealed: false,
        builders: {},
        boards: {},
        scores: {
            'Team 1': 0,
            'Team 2': 0
        }
    },

    buchstabensalatGame: {
        phase: 'IDLE',
        category: null,
        answer: null,
        revealed: '',
        order: [],
        step: 0,
        duration: 0,
        timerRunning: false,
        scores: {
            'Team 1': 0,
            'Team 2': 0
        }
    }

};

const playerNotes = {};

const spectatorSockets = new Set();

const adminSockets = new Set();

const discordGame = {

    phase: 'IDLE',

    giverId: null,

    partnerId: null,

    exchangeId: null,

    target: '',

    originalClues: [],

    exchangeIndex: null,

    replacement: '',

    finalClues: [],

    scores: {

        'Team 1': 0,

        'Team 2': 0

    }

};

const promiManifestPath = path.join(__dirname, 'public', 'games', 'promis', 'promis.json');

let promiCurrentName = '';

const drudelManifestPath = path.join(__dirname, 'public', 'games', 'drudel', 'drudel.json');

let drudelCurrentName = '';

const realitaetImageDirectory = path.join(__dirname, 'public', 'games', 'realitaet');

const diktatTexts = {};

const categoryCorrectAnswers = {};

let bingoTimerInterval = null;
let merkenTimerInterval = null;
let realitaetTimerInterval = null;
let flaggenTimerInterval = null;
let buchstabensalatTimerInterval = null;

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

function resetPartnerGame() {

    gameState.partnerGame = {

        phase: 'IDLE',

        round: 0,

        catalogName: null,

        questionIndexes: [],

        teams: {},

        scores: Object.fromEntries(Object.keys(gameState.teams).map(team => [team, 0])),

        usedQuestionIndexes: []

    };

}

function allPartnerTeamsComplete() {

    return Object.values(gameState.partnerGame.teams).every(teamGame => (

        teamGame.results.every(result => result !== null)

    ));

}

function emitTeamNotesToTeam(team) {

    const teamNotes = Object.values(gameState.players)

        .filter(player => player.team === team)

        .map(player => ({

            playerId: player.id,

            name: player.name,

            text: playerNotes[player.id] || ''

        }));

    Object.values(gameState.players).forEach(player => {

        if (player.team === team) {

            io.to(player.id).emit('teamNotesUpdate', teamNotes);

        }

    });

}

function getAllPlayerNotes() {

    return Object.keys(gameState.teams).map(team => ({

        team,

        players: Object.values(gameState.players)

            .filter(player => player.team === team)

            .map(player => ({

                playerId: player.id,

                name: player.name,

                text: playerNotes[player.id] || ''

            }))

    }));

}

function emitSpectatorNotes() {

    const notes = getAllPlayerNotes();

    spectatorSockets.forEach(socketId => {

        io.to(socketId).emit('spectatorNotesUpdate', notes);

    });

}

function getPlayerName(playerId) {

    return gameState.players[playerId] ? gameState.players[playerId].name : 'Unbekannt';

}

function getDiscordAdminState() {

    const giverTeam = discordGame.giverId && gameState.players[discordGame.giverId]

        ? gameState.players[discordGame.giverId].team

        : null;

    const exchangeTeam = giverTeam

        ? Object.keys(gameState.teams).find(team => team !== giverTeam)

        : null;

    return {

        phase: discordGame.phase,

        giverId: discordGame.giverId,

        giverName: getPlayerName(discordGame.giverId),

        partnerId: discordGame.partnerId,

        partnerName: getPlayerName(discordGame.partnerId),

        exchangeId: discordGame.exchangeId,

        exchangeName: exchangeTeam || 'Gegenteam',

        target: discordGame.target,

        originalClues: discordGame.originalClues,

        exchangeIndex: discordGame.exchangeIndex,

        replacement: discordGame.replacement,

        finalClues: discordGame.finalClues,

        scores: discordGame.scores

    };

}

function emitDiscordAdminState() {

    const state = getDiscordAdminState();

    adminSockets.forEach(socketId => io.to(socketId).emit('discordAdminUpdate', state));

}

function emitDiscordSpectatorState() {

    const state = getDiscordAdminState();

    spectatorSockets.forEach(socketId => io.to(socketId).emit('discordSpectatorUpdate', state));

}

function emitDiscordPlayerViews() {

    const giverTeam = discordGame.giverId && gameState.players[discordGame.giverId]

        ? gameState.players[discordGame.giverId].team

        : null;

    Object.values(gameState.players).forEach(player => {

        let view = { role: 'WAITING', phase: discordGame.phase, scores: discordGame.scores };

        if (player.id === discordGame.giverId) {

            view = {

                role: 'GIVER',

                phase: discordGame.phase,

                target: discordGame.target,

                clues: discordGame.originalClues,

                scores: discordGame.scores

            };

        } else if (player.id === discordGame.partnerId) {

            view = {

                role: 'PARTNER',

                phase: discordGame.phase,

                clues: discordGame.finalClues,

                scores: discordGame.scores

            };

        } else if (giverTeam && player.team !== giverTeam) {

            view = {

                role: 'EXCHANGER',

                phase: discordGame.phase,

                clues: discordGame.phase === 'GUESS' || discordGame.phase === 'COMPLETE'

                    ? discordGame.finalClues

                    : discordGame.originalClues,

                exchangeIndex: discordGame.exchangeIndex,

                replacement: discordGame.replacement,

                scores: discordGame.scores

            };

        }

        io.to(player.id).emit('discordPlayerUpdate', view);

    });

}

function resetDiscordGame() {

    discordGame.phase = 'IDLE';

    discordGame.giverId = null;

    discordGame.partnerId = null;

    discordGame.exchangeId = null;

    discordGame.target = '';

    discordGame.originalClues = [];

    discordGame.exchangeIndex = null;

    discordGame.replacement = '';

    discordGame.finalClues = [];

}

function getPromiImages() {

    try {

        const entries = JSON.parse(fs.readFileSync(promiManifestPath, 'utf8'));

        if (!Array.isArray(entries)) return [];

        const imageDirectory = path.join(path.dirname(promiManifestPath), 'images');

        const imageFiles = fs.readdirSync(imageDirectory)

            .filter(file => /\.(jpg|jpeg|png|webp|gif)$/i.test(file))

            .sort((first, second) => first.localeCompare(second, undefined, { numeric: true }));

        return entries.map((entry, index) => {

            if (typeof entry === 'string') {

                return {

                    name: entry,

                    image: imageFiles[index] ? `images/${imageFiles[index]}` : ''

                };

            }

            return {

                ...entry,

                image: entry.image && entry.image.includes('/')

                    ? entry.image

                    : `images/${entry.image || ''}`

            };

        }).filter(entry => entry && entry.image && entry.name);

    } catch (error) {

        console.error('Fehler beim Lesen der Promi-Bilder:', error.message);

        return [];

    }

}

function getRealitaetImages() {
    try {
        return fs.readdirSync(realitaetImageDirectory)
            .filter(file => /\.(jpg|jpeg|png|webp|gif)$/i.test(file))
            .sort((first, second) => first.localeCompare(second, undefined, { numeric: true }))
            .map(file => ({
                name: path.basename(file, path.extname(file)),
                path: `games/realitaet/${file}`
            }));
    } catch (error) {
        console.error('Fehler beim Lesen der Realität-Bilder:', error.message);
        return [];
    }
}

function emitPromiState() {

    io.emit('stateUpdate', gameState);

}

function nextPromiImage() {

    const images = getPromiImages();

    if (!images.length) return false;

    const nextIndex = (gameState.promiGame.imageIndex + 1) % images.length;

    const selected = images[nextIndex];

    promiCurrentName = selected.name;

    gameState.promiGame.imageIndex = nextIndex;

    gameState.promiGame.currentImage = `games/promis/${selected.image}`;

    gameState.promiGame.revealedName = '';

    gameState.promiGame.buzzerLocked = false;

    gameState.promiGame.buzzerWinner = null;

    gameState.promiGame.winnerTeam = null;

    return true;

}

function getDrudelImages() {

    try {

        const entries = JSON.parse(fs.readFileSync(drudelManifestPath, 'utf8'));

        if (!Array.isArray(entries)) return [];

        const imageDirectory = path.join(path.dirname(drudelManifestPath), 'images');

        const imageFiles = fs.readdirSync(imageDirectory)

            .filter(file => ['.jpg', '.jpeg', '.png', '.webp', '.gif'].some(ext => file.toLowerCase().endsWith(ext)))

            .sort((first, second) => first.localeCompare(second, undefined, { numeric: true }));

        return entries.map((entry, index) => typeof entry === 'string'

            ? { name: entry, image: imageFiles[index] ? `images/${imageFiles[index]}` : '' }

            : { ...entry, image: entry.image && entry.image.includes('/') ? entry.image : `images/${entry.image || ''}` }

        ).filter(entry => entry && entry.image && entry.name);

    } catch (error) {

        console.error('Fehler beim Lesen der Drudel-Bilder:', error.message);

        return [];

    }

}

function emitDrudelState() {

    io.emit('stateUpdate', gameState);

}

function nextDrudelImage() {

    const images = getDrudelImages();

    if (!images.length) return false;

    const nextIndex = (gameState.drudelGame.imageIndex + 1) % images.length;

    const selected = images[nextIndex];

    drudelCurrentName = selected.name;

    gameState.drudelGame.imageIndex = nextIndex;

    gameState.drudelGame.currentImage = `games/drudel/${selected.image}`;

    gameState.drudelGame.revealedName = '';

    gameState.drudelGame.buzzerLocked = false;

    gameState.drudelGame.buzzerWinner = null;

    gameState.drudelGame.winnerTeam = null;

    return true;

}

function normalizeDiktatWord(word) {

    return String(word || '')

        .toLocaleLowerCase()

        .replace(/[.,!?;:"â€žâ€œâ€šâ€˜()\[\]{}]/g, '');

}

function getDiktatSentences() {

    try {

        const sentences = JSON.parse(fs.readFileSync(diktatSentencesPath, 'utf8'));

        return Array.isArray(sentences) ? sentences.filter(sentence => typeof sentence === 'string' && sentence.trim()) : [];

    } catch (error) {

        console.error('Fehler beim Lesen der Diktat-SÃ¤tze:', error.message);

        return [];

    }

}

function getCategoryRounds() {

    try {

        const rounds = JSON.parse(fs.readFileSync(categoryRoundsPath, 'utf8'));

        return rounds && typeof rounds === 'object' && !Array.isArray(rounds) ? rounds : {};

    } catch (error) {

        console.error('Fehler beim Lesen der Kategorien-Runden:', error.message);

        return {};

    }

}

function getCategoryAdminState() {

    return gameState.categoryGame;

}

function emitCategoryState() {

    io.emit('stateUpdate', gameState);

}

function getDiktatPlayers(includeAnswers, includeLiveText = false) {

    const originalWords = gameState.diktatGame.originalSentence.trim().split(/\s+/).filter(Boolean);

    return Object.values(gameState.players).map(player => {

        const text = diktatTexts[player.id] || '';

        const typedWords = text.trim().split(/\s+/).filter(Boolean);

        return {

            playerId: player.id,

            name: player.name,

            team: player.team,

            text: includeAnswers || includeLiveText ? text : '',

            words: includeAnswers ? typedWords.map((word, index) => ({

                text: word,

                correct: normalizeDiktatWord(word) === normalizeDiktatWord(originalWords[index])

            })) : []

        };

    });

}

function getDiktatAdminState() {

    const game = gameState.diktatGame;

    return {

        ...game,

        players: game.phase === 'REVEALED' ? getDiktatPlayers(true) : []

    };

}

function emitDiktatAdminState() {

    const state = getDiktatAdminState();

    adminSockets.forEach(socketId => io.to(socketId).emit('diktatAdminUpdate', state));

}

function emitDiktatSpectatorState() {

    const game = gameState.diktatGame;

    const state = {

        ...game,

        players: getDiktatPlayers(game.phase === 'REVEALED', true)

    };

    spectatorSockets.forEach(socketId => io.to(socketId).emit('diktatSpectatorUpdate', state));

}

function emitDiktatPlayerViews() {

    const game = gameState.diktatGame;

    const revealedPlayers = game.phase === 'REVEALED' ? getDiktatPlayers(true) : [];

    Object.values(gameState.players).forEach(player => {

        const ownText = diktatTexts[player.id] || '';

        io.to(player.id).emit('diktatPlayerUpdate', {

            ...game,

            ownText,

            players: revealedPlayers

        });

    });

}

function emitDiktatUpdates() {

    emitDiktatAdminState();

    emitDiktatSpectatorState();

    emitDiktatPlayerViews();

}

io.on('connection', (socket) => {

    gameState.categoryRoundNames = Object.keys(getCategoryRounds());

    // 1. Client meldet sich als Spieler an

    socket.on('registerAsPlayer', () => {

        if (!gameState.players[socket.id]) {

            const defaultName = `Spieler #${playerCounter++}`;

            const firstTeam = Object.keys(gameState.teams)[0] || 'Team 1';

            gameState.players[socket.id] = {

                id: socket.id,

                name: defaultName,

                team: firstTeam

            };

            io.emit('stateUpdate', gameState);

            emitSpectatorNotes();

        }

        const player = gameState.players[socket.id];

    emitTeamNotesToTeam(player.team);

        if (gameState.currentScreen === 'DISCORD_GAME') {

            emitDiscordPlayerViews();

        }

        if (gameState.currentScreen === 'PARTNERWISSEN') {

            emitPartnerPlayerViews();

        }

        if (gameState.currentScreen === 'DIKTAT') {

            emitDiktatPlayerViews();

        }

        socket.emit('stateUpdate', gameState);

    });

    // 2. Admin Login

    socket.on('adminLogin', (password) => {

        // Input-Validierung: Passwort muss String sein
        if (typeof password !== 'string') {
            console.warn('Ungültiger Admin-Login-Versuch: Passwort ist kein String');
            socket.emit('adminAuthResult', { success: false, error: 'Ungültige Eingabe' });
            return;
        }

        if (password === ADMIN_PASSWORD) {

            adminSockets.add(socket.id);
            console.log(`Admin von ${socket.id} eingeloggt`);

            socket.emit('adminAuthResult', { success: true });
            socket.emit('stateUpdate', gameState);

            socket.emit('receiveCategoryRounds', Object.keys(getCategoryRounds()));

            socket.emit('discordAdminUpdate', getDiscordAdminState());

            socket.emit('partnerAdminUpdate', getPartnerAdminState());

            socket.emit('diktatAdminUpdate', getDiktatAdminState());

        } else {

            console.warn(`Fehlgeschlagener Admin-Login-Versuch von ${socket.id}`);
            socket.emit('adminAuthResult', { success: false, error: 'Falsches Passwort' });

        }

    });

    // 3. Spieler verlÃ¤sst Spiel

    socket.on('disconnect', () => {

        spectatorSockets.delete(socket.id);

        adminSockets.delete(socket.id);

        if (gameState.players[socket.id]) {

            delete gameState.players[socket.id];

            io.emit('stateUpdate', gameState);

            emitSpectatorNotes();

        }

    });

    socket.on('spectatorLogin', (password) => {

        // Input-Validierung: Passwort muss String sein
        if (typeof password !== 'string') {
            console.warn('Ungültiger Spectator-Login-Versuch: Passwort ist kein String');
            socket.emit('spectatorAuthResult', { success: false, error: 'Ungültige Eingabe' });
            return;
        }

        if (password !== SPECTATOR_PASSWORD) {
            console.warn(`Fehlgeschlagener Spectator-Login-Versuch von ${socket.id}`);
            socket.emit('spectatorAuthResult', { success: false, error: 'Falsches Passwort' });
            return;
        }

        spectatorSockets.add(socket.id);
        console.log(`Spectator von ${socket.id} eingeloggt`);
        socket.emit('spectatorAuthResult', { success: true });
        socket.emit('stateUpdate', gameState);

        socket.emit('spectatorNotesUpdate', getAllPlayerNotes());

        socket.emit('discordSpectatorUpdate', getDiscordAdminState());

        socket.emit('partnerSpectatorUpdate', getPartnerAdminState());

        socket.emit('diktatSpectatorUpdate', {

            ...gameState.diktatGame,

            players: getDiktatPlayers(gameState.diktatGame.phase === 'REVEALED', true)

        });

    });

    // 4. Admin Player Management

    socket.on('adminUpdatePlayerName', ({ socketId, newName }) => {

        // Input-Validierung
        if (typeof socketId !== 'string' || typeof newName !== 'string') {
            console.warn('Ungültige Player-Namen-Änderung');
            return;
        }

        if (gameState.players[socketId]) {

            const oldName = gameState.players[socketId].name;
            gameState.players[socketId].name = newName.trim();

            console.log(`Spieler-Name geändert: ${oldName} → ${gameState.players[socketId].name}`);

            io.emit('stateUpdate', gameState);

            emitTeamNotesToTeam(gameState.players[socketId].team);

            emitSpectatorNotes();

        }

    });

    socket.on('adminUpdatePlayerTeam', ({ socketId, team }) => {

        // Input-Validierung
        if (typeof socketId !== 'string' || typeof team !== 'string') {
            console.warn('Ungültige Team-Zuweisung');
            return;
        }

        if (gameState.players[socketId]) {

            const oldTeam = gameState.players[socketId].team;

            if (oldTeam === team) {
                console.log(`Spieler ${gameState.players[socketId].name} bleibt im Team ${oldTeam}`);
                return;
            }

            gameState.players[socketId].team = team;

            console.log(`Spieler ${gameState.players[socketId].name} wechselt von ${oldTeam} nach ${team}`);

            io.emit('stateUpdate', gameState);

            emitTeamNotesToTeam(oldTeam);

            emitTeamNotesToTeam(team);

            emitSpectatorNotes();

        }

    });

    // 5. Admin Team Management

    socket.on('adminUpdateTeamName', ({ oldName, newName }) => {
        const trimmedNew = newName.trim();

        // Input-Validierung
        if (typeof oldName !== 'string' || typeof trimmedNew !== 'string' || !trimmedNew) {
            console.warn('Ungültige Team-Namen-Änderung');
            return;
        }

        if (oldName === trimmedNew) return;
        if (!gameState.teams[oldName]) {
            console.warn(`Team "${oldName}" existiert nicht`);
            return;
        }
        if (gameState.teams[trimmedNew]) {
            console.warn(`Team-Name "${trimmedNew}" existiert bereits`);
            return;
        }

        renameTeamData(gameState, oldName, trimmedNew);
        renameTeamPlayers(gameState, oldName, trimmedNew);

        io.emit('stateUpdate', gameState);
        emitTeamNotesToTeam(trimmedNew);
        emitSpectatorNotes();
    });

    socket.on('adminAddTeamPoint', ({ team, amount }) => {

        if (!utils.isValidTeamName(team)) {
            console.warn('Ungültiger Team-Name bei Punktestand');
            return;
        }

        if (gameState.teams[team]) {
            const oldScore = gameState.teams[team].score;
            utils.addScore(gameState.teams[team], 'score', amount, 5);
            console.log(`Team ${team}: ${oldScore} → ${gameState.teams[team].score} Punkte`);
            io.emit('stateUpdate', gameState);
        }

    });

    // 6. Spielmodi Steuerung

    socket.on('adminChangeScreen', (newScreen) => {

        gameState.currentScreen = newScreen;

        if (newScreen === 'KATEGORIEN') {

            gameState.categoryRoundNames = Object.keys(getCategoryRounds());

        }

        io.emit('stateUpdate', gameState);

        if (newScreen === 'DISCORD_GAME') {

            emitDiscordPlayerViews();

            emitDiscordAdminState();

            emitDiscordSpectatorState();

        }

        if (newScreen === 'PARTNERWISSEN') {

            emitPartnerUpdates();

        }

        if (newScreen === 'DIKTAT') {

            emitDiktatUpdates();

        }

    });

    socket.on('adminStartGame', (screenName) => {
        const intro = gameIntroDetails[screenName];
        if (!intro) return;

        gameState.currentScreen = screenName;

        if (screenName === 'KATEGORIEN') {
            gameState.categoryRoundNames = Object.keys(getCategoryRounds());
        }

        io.emit('stateUpdate', gameState);
        io.emit('gameIntro', { screen: screenName, ...intro });

        if (screenName === 'DISCORD_GAME') {
            emitDiscordPlayerViews();
            emitDiscordAdminState();
            emitDiscordSpectatorState();
        }

        if (screenName === 'PARTNERWISSEN') {
            emitPartnerUpdates();
        }

        if (screenName === 'DIKTAT') {
            emitDiktatUpdates();
        }
    });

    // --- Flaggen bauen ---

    socket.on('getFlaggenData', () => {
        socket.emit('receiveFlaggenData', getFlaggenRounds());
    });

    socket.on('adminStartFlaggenRound', ({ country, duration, elements, targetFlag, builders }) => {
        console.log('adminStartFlaggenRound received:', country, duration);
        if (flaggenTimerInterval) {
            clearInterval(flaggenTimerInterval);
            flaggenTimerInterval = null;
        }

        const teamNames = Object.keys(gameState.teams);
        const safeDuration = parseInt(duration, 10);
        const hasTimer = !isNaN(safeDuration) && safeDuration > 0;
        const dur = hasTimer ? safeDuration : 0;

        let roundElements = elements;
        let roundTargetFlag = targetFlag;
        if (!roundElements || !roundElements.length) {
            const rounds = getFlaggenRounds().rounds || [];
            let found = rounds.find(r => r.country.toLowerCase() === (country || '').toLowerCase());
            if (!found && rounds.length > 0) {
                found = rounds[0];
            }
            if (found) {
                roundElements = found.elements;
                roundTargetFlag = found.targetFlag;
                country = country || found.country;
            } else {
                roundElements = [];
            }
        }

        const currentScores = (gameState.flaggenGame && gameState.flaggenGame.scores) || {};

        gameState.flaggenGame = {
            phase: 'PLAYING',
            country: country || 'Singapur',
            targetFlag: roundTargetFlag || null,
            elements: roundElements || [],
            duration: dur,
            remaining: dur,
            timerRunning: hasTimer,
            buildingLocked: false,
            revealed: false,
            builders: builders || (gameState.flaggenGame ? gameState.flaggenGame.builders : {}) || {},
            boards: Object.fromEntries(teamNames.map(team => [team, {
                placements: [],
                submitted: false
            }])),
            scores: Object.fromEntries(teamNames.map(team => [
                team,
                currentScores[team] || 0
            ]))
        };

        if (hasTimer) {
            flaggenTimerInterval = setInterval(() => {
                if (gameState.flaggenGame.phase !== 'PLAYING') return;
                gameState.flaggenGame.remaining -= 1;
                if (gameState.flaggenGame.remaining <= 0) {
                    gameState.flaggenGame.remaining = 0;
                    gameState.flaggenGame.buildingLocked = true;
                    gameState.flaggenGame.timerRunning = false;
                    clearInterval(flaggenTimerInterval);
                    flaggenTimerInterval = null;
                }
                io.emit('stateUpdate', gameState);
            }, 1000);
        }

        io.emit('stateUpdate', gameState);
    });

    socket.on('adminSetFlaggenBuilders', ({ builders }) => {
        if (!gameState.flaggenGame) return;
        gameState.flaggenGame.builders = builders || {};
        io.emit('stateUpdate', gameState);
    });

    socket.on('adminToggleFlaggenLock', () => {
        if (!gameState.flaggenGame) return;
        gameState.flaggenGame.buildingLocked = !gameState.flaggenGame.buildingLocked;
        io.emit('stateUpdate', gameState);
    });

    socket.on('adminRevealFlaggen', () => {
        if (!gameState.flaggenGame) return;
        gameState.flaggenGame.revealed = true;
        gameState.flaggenGame.buildingLocked = true;
        if (flaggenTimerInterval) {
            clearInterval(flaggenTimerInterval);
            flaggenTimerInterval = null;
        }
        gameState.flaggenGame.timerRunning = false;
        io.emit('stateUpdate', gameState);
    });

    socket.on('adminResetFlaggen', () => {
        if (flaggenTimerInterval) {
            clearInterval(flaggenTimerInterval);
            flaggenTimerInterval = null;
        }
        const currentScores = (gameState.flaggenGame && gameState.flaggenGame.scores) || {};
        gameState.flaggenGame = {
            phase: 'IDLE',
            country: null,
            targetFlag: null,
            elements: [],
            duration: 180,
            remaining: 0,
            timerRunning: false,
            buildingLocked: false,
            revealed: false,
            builders: gameState.flaggenGame ? gameState.flaggenGame.builders : {},
            boards: {},
            scores: Object.fromEntries(Object.keys(gameState.teams).map(team => [team, currentScores[team] || 0]))
        };
        io.emit('stateUpdate', gameState);
    });

    socket.on('adminAddFlaggenPoint', ({ team, amount }) => {
        if (!gameState.flaggenGame || !utils.isValidTeamName(team)) return;
        if (!gameState.flaggenGame.scores[team]) return;
        utils.addScore(gameState.flaggenGame.scores, team, amount);
        io.emit('stateUpdate', gameState);
    });

    socket.on('playerUpdateFlaggenBoard', ({ placements }) => {
        const game = gameState.flaggenGame;
        const player = gameState.players[socket.id];
        if (!game || !player || !player.team || game.phase !== 'PLAYING') return;
        if (game.buildingLocked) return;

        const builders = game.builders || {};
        const teamBuilder = builders[player.team];
        if (teamBuilder && teamBuilder !== socket.id) {
            return;
        }

        const board = game.boards[player.team];
        if (!board || !Array.isArray(placements)) return;

        board.placements = placements.map((p, idx) => ({
            id: String(p.id || 'p_' + idx),
            elementId: String(p.elementId || ''),
            x: Math.max(0, Math.min(1, Number(p.x) !== undefined ? Number(p.x) : 0.5)),
            y: Math.max(0, Math.min(1, Number(p.y) !== undefined ? Number(p.y) : 0.5)),
            rotation: Number(p.rotation) || 0,
            zIndex: Number(p.zIndex) || idx + 1
        }));

        io.emit('stateUpdate', gameState);
    });

    socket.on('playerClearFlaggenBoard', () => {
        const game = gameState.flaggenGame;
        const player = gameState.players[socket.id];
        if (!game || !player || !player.team || game.phase !== 'PLAYING') return;
        if (game.buildingLocked) return;

        const builders = game.builders || {};
        const teamBuilder = builders[player.team];
        if (teamBuilder && teamBuilder !== socket.id) return;

        if (game.boards[player.team]) {
            game.boards[player.team].placements = [];
        }
        io.emit('stateUpdate', gameState);
    });

    // 7. Promis raten

    socket.on('adminNextPromiImage', () => {

        if (!adminSockets.has(socket.id) || !nextPromiImage()) return;

        emitPromiState();

    });

    socket.on('adminLockPromiBuzzer', () => {

        if (!adminSockets.has(socket.id)) return;

        gameState.promiGame.buzzerLocked = true;

        emitPromiState();

    });

    socket.on('adminResetPromiBuzzer', () => {

        if (!adminSockets.has(socket.id)) return;

        gameState.promiGame.buzzerLocked = false;

        gameState.promiGame.buzzerWinner = null;

        gameState.promiGame.winnerTeam = null;

        emitPromiState();

    });

    socket.on('adminRevealPromiName', () => {

        if (!adminSockets.has(socket.id) || !promiCurrentName) return;

        gameState.promiGame.revealedName = promiCurrentName;

        emitPromiState();

    });

    socket.on('adminAddPromiPoint', ({ team, amount }) => {

        if (!adminSockets.has(socket.id) || !utils.isValidTeamName(team)) return;

        if (!gameState.promiGame.scores[team]) return;

        utils.addScore(gameState.promiGame.scores, team, amount);

        if (gameState.promiGame.scores[team] >= MAX_POINTS_PER_GAME) {

            gameState.promiGame.winnerTeam = team;
            gameState.promiGame.buzzerLocked = true;

        } else if (gameState.promiGame.winnerTeam === team) {

            gameState.promiGame.winnerTeam = null;

        }

        emitPromiState();

    });

    socket.on('pressPromiBuzzer', () => {

        if (gameState.currentScreen !== 'PROMI_RATEN' || gameState.promiGame.buzzerLocked) return;

        const player = gameState.players[socket.id];

        if (!player) return;

        gameState.promiGame.buzzerWinner = `${player.name} (${player.team})`;

        gameState.promiGame.buzzerLocked = true;

        emitPromiState();

    });

    // 8. Drudel

    socket.on('adminNextDrudelImage', () => {

        if (!adminSockets.has(socket.id) || !nextDrudelImage()) return;

        emitDrudelState();

    });

    socket.on('adminLockDrudelBuzzer', () => {

        if (!adminSockets.has(socket.id)) return;

        gameState.drudelGame.buzzerLocked = true;

        emitDrudelState();

    });

    socket.on('adminResetDrudelBuzzer', () => {

        if (!adminSockets.has(socket.id)) return;

        gameState.drudelGame.buzzerLocked = false;

        gameState.drudelGame.buzzerWinner = null;

        gameState.drudelGame.winnerTeam = null;

        emitDrudelState();

    });

    socket.on('adminRevealDrudelName', () => {

        if (!adminSockets.has(socket.id) || !drudelCurrentName) return;

        gameState.drudelGame.revealedName = drudelCurrentName;

        emitDrudelState();

    });

    socket.on('adminAddDrudelPoint', ({ team, amount }) => {

        if (!adminSockets.has(socket.id) || !utils.isValidTeamName(team)) return;

        if (!gameState.drudelGame.scores[team]) return;

        utils.addScore(gameState.drudelGame.scores, team, amount);

        if (gameState.drudelGame.scores[team] >= MAX_POINTS_PER_GAME) {

            gameState.drudelGame.winnerTeam = team;
            gameState.drudelGame.buzzerLocked = true;

        } else if (gameState.drudelGame.winnerTeam === team) {

            gameState.drudelGame.winnerTeam = null;

        }

        emitDrudelState();

    });

    socket.on('pressDrudelBuzzer', () => {

        if (gameState.currentScreen !== 'DRUDEL' || gameState.drudelGame.buzzerLocked) return;

        const player = gameState.players[socket.id];

        if (!player) return;

        gameState.drudelGame.buzzerWinner = `${player.name} (${player.team})`;

        gameState.drudelGame.buzzerLocked = true;

        emitDrudelState();

    });

    // 9. Diktat

    socket.on('adminStartDiktatRound', sentence => {

        if (!adminSockets.has(socket.id)) return;

        const cleanSentence = utils.sanitizeString(sentence, MAX_DIKTAT_LENGTH);

        if (!cleanSentence) {
            console.warn('Leerer Diktat-Satz abgelehnt');
            return;
        }

        Object.keys(diktatTexts).forEach(playerId => delete diktatTexts[playerId]);

        gameState.diktatGame.phase = 'WRITING';

        gameState.diktatGame.round += 1;

        gameState.diktatGame.originalSentence = cleanSentence;

        gameState.diktatGame.locked = false;

        emitDiktatUpdates();

    });

    socket.on('getDiktatSentences', () => {

        socket.emit('receiveDiktatSentences', getDiktatSentences());

    });

    socket.on('updateDiktatText', text => {

        const player = gameState.players[socket.id];

        if (!player || gameState.diktatGame.phase !== 'WRITING' || gameState.diktatGame.locked) return;

        diktatTexts[socket.id] = utils.sanitizeString(text, MAX_DIKTAT_LENGTH);

        socket.emit('diktatPlayerUpdate', {

            ...gameState.diktatGame,

            ownText: diktatTexts[socket.id],

            players: []

        });

        emitDiktatSpectatorState();

    });

    socket.on('adminCloseDiktat', () => {

        if (!adminSockets.has(socket.id) || gameState.diktatGame.phase !== 'WRITING') return;

        gameState.diktatGame.locked = true;

        gameState.diktatGame.phase = 'CLOSED';

        emitDiktatUpdates();

    });

    socket.on('adminShowDiktatAnswers', () => {

        if (!adminSockets.has(socket.id) || gameState.diktatGame.phase !== 'CLOSED') return;

        gameState.diktatGame.phase = 'REVEALED';

        emitDiktatUpdates();

    });

    socket.on('adminResetDiktat', () => {

        if (!adminSockets.has(socket.id)) return;

        Object.keys(diktatTexts).forEach(playerId => delete diktatTexts[playerId]);

        gameState.diktatGame.phase = 'IDLE';

        gameState.diktatGame.round = 0;

        gameState.diktatGame.originalSentence = '';

        gameState.diktatGame.locked = false;

        gameState.diktatGame.scores = Object.fromEntries(Object.keys(gameState.teams).map(team => [team, 0]));

        emitDiktatUpdates();

    });

    socket.on('adminAddDiktatPoint', ({ team, amount }) => {

        if (!adminSockets.has(socket.id) || !utils.isValidTeamName(team)) return;

        if (!gameState.diktatGame.scores[team]) return;

        utils.addScore(gameState.diktatGame.scores, team, amount);

        emitDiktatUpdates();

    });

    // 10. Begriffe Kategorien zuordnen

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

            scores: gameState.categoryGame.scores || Object.fromEntries(Object.keys(gameState.teams).map(team => [team, 0]))

        };

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

        } else {

            return;

        }

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

    socket.on('adminAddCategoryPoint', ({ team, amount }) => {

        if (!adminSockets.has(socket.id) || !utils.isValidTeamName(team)) return;

        if (!gameState.categoryGame.scores) {

            gameState.categoryGame.scores = Object.fromEntries(Object.keys(gameState.teams).map(t => [t, 0]));

        }

        if (gameState.categoryGame.scores[team] === undefined) {

            gameState.categoryGame.scores[team] = 0;

        }

        utils.addScore(gameState.categoryGame.scores, team, amount);

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

    socket.on('adminResetCategoryGame', () => {

        if (!adminSockets.has(socket.id)) return;

        gameState.categoryGame = {

            phase: 'IDLE',

            roundName: null,

            categories: [],

            terms: [],

            assignments: {},

            assignedTeams: {},

            revealed: {},

            results: {},

            scores: Object.fromEntries(Object.keys(gameState.teams).map(team => [team, 0]))

        };

        Object.keys(categoryCorrectAnswers).forEach(term => delete categoryCorrectAnswers[term]);

        emitCategoryState();

    });

    // 11. Ich weiÃŸ, was mein Partner weiÃŸ

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

    socket.on('adminResetPartnerGame', () => {

        if (!adminSockets.has(socket.id)) return;

        resetPartnerGame();

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

        teamGame.results[cleanIndex] = {

            correct: isCorrect,

            points: isCorrect ? teamGame.allocations[cleanIndex] : 0

        };

        if (isCorrect) {

            gameState.partnerGame.scores[team] += teamGame.allocations[cleanIndex];

        }

        if (allPartnerTeamsComplete()) {

            gameState.partnerGame.phase = 'COMPLETE';

        }

        emitPartnerUpdates();

    });

    socket.on('adminAddPartnerPoint', ({ team, amount }) => {

        if (!adminSockets.has(socket.id) || !utils.isValidTeamName(team)) return;

        if (!gameState.partnerGame.scores[team]) return;

        utils.addScore(gameState.partnerGame.scores, team, amount);

        emitPartnerUpdates();

    });

    // 12. Kam bei Discord nicht an

    socket.on('adminStartDiscordGame', ({ giverId, target }) => {

        if (typeof giverId !== 'string' || typeof target !== 'string') {
            console.warn('Ungültige Discord-Game-Parameter');
            return;
        }

        const giver = gameState.players[giverId];

        const cleanTarget = utils.sanitizeString(target, MAX_DISCORD_TARGET_LENGTH);

        if (!giver || !cleanTarget) {
            console.warn('Ungültiger Discord-Game-Start: Spieler nicht gefunden oder leerer Zielbegriff');
            return;
        }

        const partner = Object.values(gameState.players).find(player => (

            player.team === giver.team && player.id !== giver.id

        ));

        const opposingPlayer = Object.values(gameState.players).find(player => player.team !== giver.team);

        if (!partner || !opposingPlayer) return;

        discordGame.phase = 'GIVER_CLUES';

        discordGame.giverId = giver.id;

        discordGame.partnerId = partner.id;

        discordGame.exchangeId = null;

        discordGame.target = cleanTarget;

        discordGame.originalClues = [];

        discordGame.exchangeIndex = null;

        discordGame.replacement = '';

        discordGame.finalClues = [];

        emitDiscordPlayerViews();

        emitDiscordAdminState();

        emitDiscordSpectatorState();

    });

    socket.on('adminResetDiscordGame', () => {

        resetDiscordGame();

        emitDiscordPlayerViews();

        emitDiscordAdminState();

        emitDiscordSpectatorState();

    });

    socket.on('getDiscordTerms', () => {

        socket.emit('receiveDiscordTerms', discordTerms);

    });

    socket.on('adminSubmitDiscordClues', (clues) => {

        if (!adminSockets.has(socket.id) || discordGame.phase !== 'GIVER_CLUES') return;

        const cleanClues = Array.isArray(clues)

            ? clues.map(clue => String(clue || '').trim().slice(0, 60)).filter(Boolean)

            : [];

        if (cleanClues.length !== 3) return;

        discordGame.originalClues = cleanClues;

        discordGame.phase = 'EXCHANGE';

        emitDiscordPlayerViews();

        emitDiscordAdminState();

        emitDiscordSpectatorState();

    });

    socket.on('adminSubmitDiscordExchange', ({ index, replacement }) => {

        if (!adminSockets.has(socket.id) || discordGame.phase !== 'EXCHANGE') return;

        const cleanIndex = Number(index);

        const cleanReplacement = String(replacement || '').trim().slice(0, 60);

        if (!Number.isInteger(cleanIndex) || cleanIndex < 0 || cleanIndex > 2 || !cleanReplacement) return;

        discordGame.exchangeIndex = cleanIndex;

        discordGame.replacement = cleanReplacement;

        discordGame.finalClues = discordGame.originalClues.map((clue, clueIndex) => (

            clueIndex === cleanIndex ? cleanReplacement : clue

        ));

        discordGame.phase = 'COMPLETE';

        emitDiscordPlayerViews();

        emitDiscordAdminState();

        emitDiscordSpectatorState();

    });

    socket.on('adminAddDiscordPoint', ({ team, amount }) => {

        if (!adminSockets.has(socket.id) || discordGame.scores[team] === undefined) return;

        discordGame.scores[team] = Math.max(0, discordGame.scores[team] + Number(amount || 0));

        emitDiscordAdminState();

        emitDiscordPlayerViews();

        emitDiscordSpectatorState();

    });

    // 10. Listenwissen Events

    socket.on('getWordLists', () => {

        socket.emit('receiveWordLists', listenwissen.getWordLists());

    });

    socket.on('adminStartWordGame', (listKey) => {

        listenwissen.startWordGame(gameState, listKey);

        Object.keys(gameState.teams).forEach(team => {

            gameState.listenwissenScores[team] = 0;

        });

        io.emit('stateUpdate', gameState);

    });

    socket.on('adminToggleWord', (wordId) => {

        listenwissen.toggleWord(gameState, wordId);

        io.emit('stateUpdate', gameState);

    });

    socket.on('adminRevealAllWords', () => {

        listenwissen.revealAllWords(gameState);

        io.emit('stateUpdate', gameState);

    });

    socket.on('adminAddWordGamePoint', ({ team, amount }) => {

        if (gameState.listenwissenScores[team] !== undefined) {

            gameState.listenwissenScores[team] = Math.max(

                0,

                Math.min(5, gameState.listenwissenScores[team] + amount)

            );

            io.emit('stateUpdate', gameState);

        }

    });

    socket.on('updatePlayerNote', (text) => {

        const player = gameState.players[socket.id];

        if (!player) return;

        playerNotes[socket.id] = String(text || '').slice(0, 500);

        emitTeamNotesToTeam(player.team);

        emitSpectatorNotes();

    });

    // --- Malen Handlers ---

    socket.on('getMalenWords', () => {

        socket.emit('receiveMalenWords', getMalenWords());

    });

    socket.on('adminStartMalenRound', ({ word, painters }) => {

        if (!gameState.malenGame) {

            gameState.malenGame = {

                phase: 'IDLE',

                word: '',

                painters: { 'Team 1': null, 'Team 2': null },

                drawings: { 'Team 1': [], 'Team 2': [] },

                scores: { 'Team 1': 0, 'Team 2': 0 }

            };

        }

        gameState.malenGame.phase = 'PLAYING';

        gameState.malenGame.word = String(word || '').trim();

        if (painters && typeof painters === 'object') {

            gameState.malenGame.painters = {

                [Object.keys(gameState.teams)[0] || 'Team 1']: painters[Object.keys(gameState.teams)[0]] || painters['Team 1'] || null,

                [Object.keys(gameState.teams)[1] || 'Team 2']: painters[Object.keys(gameState.teams)[1]] || painters['Team 2'] || null

            };

        }

        gameState.malenGame.drawings = Object.fromEntries(Object.keys(gameState.teams).map(team => [team, []]));

        io.emit('malenCanvasCleared', { team: 'ALL' });

        io.emit('stateUpdate', gameState);

    });

    socket.on('adminSetMalenWord', (word) => {

        if (!gameState.malenGame) return;

        gameState.malenGame.word = String(word || '').trim();

        gameState.malenGame.drawings = Object.fromEntries(Object.keys(gameState.teams).map(team => [team, []]));

        io.emit('malenCanvasCleared', { team: 'ALL' });

        io.emit('stateUpdate', gameState);

    });

    socket.on('adminSetMalenPainters', (painters) => {

        if (!gameState.malenGame) return;

        if (painters && typeof painters === 'object') {

            gameState.malenGame.painters = {

                [Object.keys(gameState.teams)[0] || 'Team 1']: painters[Object.keys(gameState.teams)[0]] || painters['Team 1'] || null,

                [Object.keys(gameState.teams)[1] || 'Team 2']: painters[Object.keys(gameState.teams)[1]] || painters['Team 2'] || null

            };

            io.emit('stateUpdate', gameState);

        }

    });

    socket.on('adminClearAllMalenCanvases', () => {

        if (!gameState.malenGame) return;

        gameState.malenGame.drawings = Object.fromEntries(Object.keys(gameState.teams).map(team => [team, []]));

        io.emit('malenCanvasCleared', { team: 'ALL' });

        io.emit('stateUpdate', gameState);

    });

    socket.on('adminAddMalenPoint', ({ team, amount }) => {

        if (!gameState.malenGame || !gameState.malenGame.scores) return;

        if (gameState.malenGame.scores[team] !== undefined) {

            gameState.malenGame.scores[team] = Math.max(0, (gameState.malenGame.scores[team] || 0) + (parseInt(amount) || 0));

            io.emit('stateUpdate', gameState);

        }

    });

    socket.on('adminResetMalen', () => {

        gameState.malenGame = {

            phase: 'IDLE',

            word: '',

            painters: { 'Team 1': null, 'Team 2': null },

            drawings: { 'Team 1': [], 'Team 2': [] },

            scores: { 'Team 1': 0, 'Team 2': 0 }

        };

        io.emit('stateUpdate', gameState);

    });

    socket.on('playerMalenDrawBatch', ({ lines }) => {

        if (!gameState.malenGame || gameState.malenGame.phase !== 'PLAYING') return;

        const player = gameState.players[socket.id];

        if (!player) return;

        const team = player.team;

        if (!team) return;

        // Check if player is the assigned painter for their team

        if (gameState.malenGame.painters[team] && gameState.malenGame.painters[team] !== socket.id) {

            return;

        }

        if (Array.isArray(lines) && lines.length > 0) {

            // Cap lines to prevent memory explosion

            if (!gameState.malenGame.drawings[team]) {

                gameState.malenGame.drawings[team] = [];

            }

            if (gameState.malenGame.drawings[team].length < 15000) {

                gameState.malenGame.drawings[team].push(...lines);

            }

            // Broadcast the new lines immediately to everyone

            io.emit('malenLinesAdded', { team, lines });

        }

    });

    socket.on('playerClearMalenCanvas', () => {

        if (!gameState.malenGame || gameState.malenGame.phase !== 'PLAYING') return;

        const player = gameState.players[socket.id];

        if (!player) return;

        const team = player.team;

        if (!team) return;

        // Only the painter can clear their team canvas

        if (gameState.malenGame.painters[team] && gameState.malenGame.painters[team] !== socket.id) {

            return;

        }

        if (gameState.malenGame.drawings[team]) {

            gameState.malenGame.drawings[team] = [];

        }

        io.emit('malenCanvasCleared', { team });

    });

    // --- Merken Game Handlers ---

    socket.on('adminStartMerken', (duration) => {
        if (!adminSockets.has(socket.id)) return;

        if (merkenTimerInterval) {
            clearInterval(merkenTimerInterval);
            merkenTimerInterval = null;
        }

        const teamNames = Object.keys(gameState.teams);
        const dur = Math.max(5, Math.min(3600, parseInt(duration, 10) || 30));
        gameState.merkenGame = {
            phase: 'MEMORIZING',
            cards: merkenCards,
            duration: dur,
            remaining: dur,
            revealedCards: [],
            scores: Object.fromEntries(teamNames.map(team => [team, 0]))
        };

        merkenTimerInterval = setInterval(() => {
            const game = gameState.merkenGame;
            if (!game || game.phase !== 'MEMORIZING') return;
            game.remaining = Math.max(0, game.remaining - 1);
            if (game.remaining === 0) {
                game.phase = 'PLAYING';
                clearInterval(merkenTimerInterval);
                merkenTimerInterval = null;
            }
            io.emit('stateUpdate', gameState);
        }, 1000);

        io.emit('stateUpdate', gameState);
    });

    socket.on('adminStopMerkenTimer', () => {
        if (!adminSockets.has(socket.id) || !gameState.merkenGame) return;
        gameState.merkenGame.phase = 'PLAYING';
        gameState.merkenGame.remaining = 0;
        if (merkenTimerInterval) {
            clearInterval(merkenTimerInterval);
            merkenTimerInterval = null;
        }
        io.emit('stateUpdate', gameState);
    });

    socket.on('adminSelectMerkenCard', (cardId) => {
        if (!adminSockets.has(socket.id)) return;
        const game = gameState.merkenGame;
        const id = parseInt(cardId, 10);
        if (!game || game.phase !== 'PLAYING' || !game.cards.some(card => card.id === id)) return;
        const index = game.revealedCards.indexOf(id);
        if (index === -1) {
            game.revealedCards.push(id);
        } else {
            game.revealedCards.splice(index, 1);
        }
        io.emit('stateUpdate', gameState);
    });

    socket.on('adminRevealAllMerkenCards', () => {
        if (!adminSockets.has(socket.id)) return;
        const game = gameState.merkenGame;
        if (!game || !Array.isArray(game.cards)) return;

        game.revealedCards = game.cards.map(card => card.id);
        io.emit('stateUpdate', gameState);
    });

    socket.on('adminAdjustMerkenScore', ({ team, amount }) => {
        if (!adminSockets.has(socket.id)) return;
        const game = gameState.merkenGame;
        if (!game || !game.scores || game.scores[team] === undefined) return;

        const delta = Number(amount);
        if (!Number.isFinite(delta) || ![-1, 1].includes(delta)) return;
        game.scores[team] = Math.max(0, Math.min(7, game.scores[team] + delta));
        if (game.scores[team] >= 7) {
            game.phase = 'FINISHED';
            if (merkenTimerInterval) {
                clearInterval(merkenTimerInterval);
                merkenTimerInterval = null;
            }
        }
        io.emit('stateUpdate', gameState);
    });

    socket.on('adminResetMerken', () => {
        if (!adminSockets.has(socket.id)) return;
        if (merkenTimerInterval) {
            clearInterval(merkenTimerInterval);
            merkenTimerInterval = null;
        }
        gameState.merkenGame = {
            phase: 'IDLE',
            cards: merkenCards,
            duration: 30,
            remaining: 0,
            revealedCards: [],
            scores: Object.fromEntries(Object.keys(gameState.teams).map(team => [team, 0]))
        };
        io.emit('stateUpdate', gameState);
    });

    // --- Realität oder Wirklichkeit Game Handlers ---

    socket.on('getRealitaetImages', () => {
        if (!adminSockets.has(socket.id)) return;
        socket.emit('receiveRealitaetImages', getRealitaetImages());
    });

    socket.on('adminStartRealitaet', ({ targetTeam, contentType, image, duration }) => {
        if (!adminSockets.has(socket.id)) return;
        const teams = Object.keys(gameState.teams);
        if (!teams.includes(targetTeam) || !['IMAGE', 'QUESTION'].includes(contentType)) return;
        if (contentType === 'IMAGE' && !getRealitaetImages().some(entry => entry.path === image)) return;

        if (realitaetTimerInterval) {
            clearInterval(realitaetTimerInterval);
            realitaetTimerInterval = null;
        }

        const seconds = Math.max(10, Math.min(3600, parseInt(duration, 10) || 180));
        gameState.realitaetGame = {
            phase: 'PLAYING',
            targetTeam,
            contentType,
            image: contentType === 'IMAGE' ? image : '',
            duration: seconds,
            remaining: seconds,
            scores: gameState.realitaetGame.scores || Object.fromEntries(teams.map(team => [team, 0]))
        };

        realitaetTimerInterval = setInterval(() => {
            const game = gameState.realitaetGame;
            if (!game || game.phase !== 'PLAYING') return;
            game.remaining = Math.max(0, game.remaining - 1);
            if (game.remaining === 0) {
                game.phase = 'FINISHED';
                clearInterval(realitaetTimerInterval);
                realitaetTimerInterval = null;
            }
            io.emit('stateUpdate', gameState);
        }, 1000);

        io.emit('stateUpdate', gameState);
    });

    socket.on('adminStopRealitaet', () => {
        if (!adminSockets.has(socket.id) || !gameState.realitaetGame) return;
        gameState.realitaetGame.phase = 'FINISHED';
        if (realitaetTimerInterval) {
            clearInterval(realitaetTimerInterval);
            realitaetTimerInterval = null;
        }
        io.emit('stateUpdate', gameState);
    });

    socket.on('adminAdjustRealitaetScore', ({ team, amount }) => {
        if (!adminSockets.has(socket.id)) return;
        const game = gameState.realitaetGame;
        if (!game || !game.scores || game.scores[team] === undefined) return;
        const delta = Number(amount);
        if (![-1, 1].includes(delta)) return;
        game.scores[team] = Math.max(0, game.scores[team] + delta);
        io.emit('stateUpdate', gameState);
    });

    socket.on('adminResetRealitaet', () => {
        if (!adminSockets.has(socket.id)) return;
        if (realitaetTimerInterval) {
            clearInterval(realitaetTimerInterval);
            realitaetTimerInterval = null;
        }
        gameState.realitaetGame = {
            phase: 'IDLE',
            targetTeam: null,
            contentType: null,
            image: '',
            duration: 180,
            remaining: 0,
            scores: Object.fromEntries(Object.keys(gameState.teams).map(team => [team, 0]))
        };
        io.emit('stateUpdate', gameState);
    });

    // --- Karte Game Handlers ---

    socket.on('getKartePlaces', () => {

        socket.emit('receiveKartePlaces', getKartePlaces());

    });

    socket.on('adminStartKarteRound', ({ target, pinners }) => {

        if (!gameState.karteGame) {

            gameState.karteGame = {

                phase: 'IDLE',

                target: null,

                pinners: { 'Team 1': null, 'Team 2': null },

                guesses: { 'Team 1': null, 'Team 2': null },

                locked: { 'Team 1': false, 'Team 2': false },

                revealed: { 'Team 1': false, 'Team 2': false, 'target': false, 'distances': false },

                scores: { 'Team 1': 0, 'Team 2': 0 }

            };

        }

        gameState.karteGame.phase = 'PLAYING';

        gameState.karteGame.target = target || null;

        if (pinners && typeof pinners === 'object') {

            gameState.karteGame.pinners = {

                [Object.keys(gameState.teams)[0] || 'Team 1']: pinners[Object.keys(gameState.teams)[0]] || pinners['Team 1'] || null,

                [Object.keys(gameState.teams)[1] || 'Team 2']: pinners[Object.keys(gameState.teams)[1]] || pinners['Team 2'] || null

            };

        }

        gameState.karteGame.guesses = { 'Team 1': null, 'Team 2': null };

        gameState.karteGame.locked = { 'Team 1': false, 'Team 2': false };

        gameState.karteGame.revealed = { 'Team 1': false, 'Team 2': false, 'target': false, 'distances': false };

        io.emit('stateUpdate', gameState);

    });

    socket.on('adminSetKartePinners', (pinners) => {

        if (!gameState.karteGame) return;

        if (pinners && typeof pinners === 'object') {

            gameState.karteGame.pinners = {

                [Object.keys(gameState.teams)[0] || 'Team 1']: pinners[Object.keys(gameState.teams)[0]] || pinners['Team 1'] || null,

                [Object.keys(gameState.teams)[1] || 'Team 2']: pinners[Object.keys(gameState.teams)[1]] || pinners['Team 2'] || null

            };

            io.emit('stateUpdate', gameState);

        }

    });

    socket.on('adminRevealKartePin', (team) => {

        if (!gameState.karteGame || !gameState.karteGame.revealed) return;

        if (team === 'target') {

            gameState.karteGame.revealed.target = !gameState.karteGame.revealed.target;

        } else if (team === 'distances') {

            gameState.karteGame.revealed.distances = !gameState.karteGame.revealed.distances;

        } else if (team === 'Team 1' || team === 'Team 2' || gameState.teams[team]) {

            const teamNames = Object.keys(gameState.teams);
            const resolvedTeam = team === 'Team 1'
                ? (teamNames[0] || 'Team 1')
                : team === 'Team 2'
                    ? (teamNames[1] || 'Team 2')
                    : team;
            gameState.karteGame.revealed[resolvedTeam] = !gameState.karteGame.revealed[resolvedTeam];

        }

        io.emit('stateUpdate', gameState);

    });

    socket.on('adminAddKartePoint', ({ team, amount }) => {

        if (!gameState.karteGame || !gameState.karteGame.scores) return;

        if (gameState.karteGame.scores[team] !== undefined) {

            gameState.karteGame.scores[team] = Math.max(0, Math.min(7, (gameState.karteGame.scores[team] || 0) + (parseInt(amount) || 0)));

            io.emit('stateUpdate', gameState);

        }

    });

    socket.on('adminResetKarteGame', () => {

        gameState.karteGame = {

            phase: 'IDLE',

            target: null,

            pinners: { 'Team 1': null, 'Team 2': null },

            guesses: { 'Team 1': null, 'Team 2': null },

            locked: { 'Team 1': false, 'Team 2': false },

            revealed: { 'Team 1': false, 'Team 2': false, 'target': false },

            scores: { 'Team 1': 0, 'Team 2': 0 }

        };

        io.emit('stateUpdate', gameState);

    });

    socket.on('playerSetKarteGuess', ({ lat, lng }) => {

        if (!gameState.karteGame || gameState.karteGame.phase !== 'PLAYING') return;

        const player = gameState.players[socket.id];

        if (!player) return;

        const team = player.team;

        if (!team) return;

        // Check if player is the assigned pinner and not locked

        if (gameState.karteGame.pinners[team] && gameState.karteGame.pinners[team] !== socket.id) return;

        if (gameState.karteGame.locked[team]) return;

        gameState.karteGame.guesses[team] = {

            lat: parseFloat(lat),

            lng: parseFloat(lng)

        };

        io.emit('stateUpdate', gameState);

    });

    socket.on('playerLockKarteGuess', () => {

        if (!gameState.karteGame || gameState.karteGame.phase !== 'PLAYING') return;

        const player = gameState.players[socket.id];

        if (!player) return;

        const team = player.team;

        if (!team) return;

        if (gameState.karteGame.pinners[team] && gameState.karteGame.pinners[team] !== socket.id) return;

        if (!gameState.karteGame.guesses[team]) return;

        gameState.karteGame.locked[team] = true;

        io.emit('stateUpdate', gameState);

    });

    // --- Referat Bingo Handlers ---

    socket.on('getReferatTopics', () => {

        socket.emit('receiveReferatTopics', getReferatTopics());

    });

    socket.on('adminStartBingo', ({ topic, referatPlayerId, timerDuration }) => {

        const player = gameState.players[referatPlayerId];

        if (!player) return;

        const referatTeam = player.team;

        const allTeams = Object.keys(gameState.teams);

        const opposingTeam = allTeams.find(t => t !== referatTeam) || (referatTeam === 'Team 1' ? 'Team 2' : 'Team 1');

        if (bingoTimerInterval) {

            clearInterval(bingoTimerInterval);

            bingoTimerInterval = null;

        }

        const dur = parseInt(timerDuration) || 120;

        gameState.referatBingo = {

            phase: 'PREPARING',

            topic: String(topic || '').trim(),

            topicRevealed: false,

            referatPlayerId: referatPlayerId,

            referatTeam: referatTeam,

            opposingTeam: opposingTeam,

            partnerWords: Array(9).fill(''),

            partnerMarked: Array(9).fill(false),

            opposingWords: Array(9).fill(''),

            opposingMarked: Array(9).fill(false),

            timer: {

                duration: dur,

                remaining: dur,

                running: false

            },

            scores: gameState.referatBingo.scores || { 'Team 1': 0, 'Team 2': 0 }

        };

        io.emit('stateUpdate', gameState);

    });

    socket.on('adminBingoStartPlaying', () => {

        if (!gameState.referatBingo || gameState.referatBingo.phase === 'IDLE') return;

        gameState.referatBingo.phase = 'PLAYING';

        io.emit('stateUpdate', gameState);

    });

    socket.on('adminRevealBingoTopic', () => {

        if (!gameState.referatBingo) return;

        gameState.referatBingo.topicRevealed = !gameState.referatBingo.topicRevealed;

        io.emit('stateUpdate', gameState);

    });

    socket.on('adminStartBingoTimer', () => {

        if (!gameState.referatBingo || gameState.referatBingo.timer.running) return;

        gameState.referatBingo.timer.running = true;

        if (bingoTimerInterval) clearInterval(bingoTimerInterval);

        bingoTimerInterval = setInterval(() => {

            if (gameState.referatBingo.timer.remaining > 0) {

                gameState.referatBingo.timer.remaining--;

                io.emit('stateUpdate', gameState);

            }

            if (gameState.referatBingo.timer.remaining <= 0) {

                gameState.referatBingo.timer.running = false;

                clearInterval(bingoTimerInterval);

                bingoTimerInterval = null;

                io.emit('stateUpdate', gameState);

            }

        }, 1000);

        io.emit('stateUpdate', gameState);

    });

    socket.on('adminStopBingoTimer', () => {

        if (!gameState.referatBingo) return;

        gameState.referatBingo.timer.running = false;

        if (bingoTimerInterval) {

            clearInterval(bingoTimerInterval);

            bingoTimerInterval = null;

        }

        io.emit('stateUpdate', gameState);

    });

    socket.on('adminResetBingoTimer', () => {

        if (!gameState.referatBingo) return;

        gameState.referatBingo.timer.running = false;

        if (bingoTimerInterval) {

            clearInterval(bingoTimerInterval);

            bingoTimerInterval = null;

        }

        gameState.referatBingo.timer.remaining = gameState.referatBingo.timer.duration;

        io.emit('stateUpdate', gameState);

    });

    socket.on('adminSetBingoTimerDuration', (duration) => {

        if (!gameState.referatBingo) return;

        const dur = Math.max(10, parseInt(duration) || 120);

        gameState.referatBingo.timer.duration = dur;

        if (!gameState.referatBingo.timer.running) {

            gameState.referatBingo.timer.remaining = dur;

        }

        io.emit('stateUpdate', gameState);

    });

    socket.on('adminAddBingoPoint', ({ team, amount }) => {

        if (!gameState.referatBingo || !gameState.referatBingo.scores) return;

        if (gameState.referatBingo.scores[team] !== undefined) {

            gameState.referatBingo.scores[team] = Math.max(0, (gameState.referatBingo.scores[team] || 0) + amount);

            io.emit('stateUpdate', gameState);

        }

    });

    socket.on('adminResetBingo', () => {

        if (bingoTimerInterval) {

            clearInterval(bingoTimerInterval);

            bingoTimerInterval = null;

        }

        gameState.referatBingo = {

            phase: 'IDLE',

            topic: '',

            topicRevealed: false,

            referatPlayerId: null,

            referatTeam: null,

            opposingTeam: null,

            partnerWords: Array(9).fill(''),

            partnerMarked: Array(9).fill(false),

            opposingWords: Array(9).fill(''),

            opposingMarked: Array(9).fill(false),

            timer: { duration: 120, remaining: 120, running: false },

            scores: { 'Team 1': 0, 'Team 2': 0 }

        };

        io.emit('stateUpdate', gameState);

    });

    socket.on('playerUpdateBingoWords', ({ role, words }) => {

        if (!gameState.referatBingo) return;

        const player = gameState.players[socket.id];

        if (!player) return;

        // Security check

        if (role === 'partner') {

            if (player.team !== gameState.referatBingo.referatTeam || socket.id === gameState.referatBingo.referatPlayerId) {

                return;

            }

            if (Array.isArray(words)) {

                gameState.referatBingo.partnerWords = words.slice(0, 9).map(w => String(w || '').slice(0, 50));

                io.emit('stateUpdate', gameState);

            }

        } else if (role === 'opposing') {

            if (player.team !== gameState.referatBingo.opposingTeam) {

                return;

            }

            if (Array.isArray(words)) {

                gameState.referatBingo.opposingWords = words.slice(0, 9).map(w => String(w || '').slice(0, 50));

                io.emit('stateUpdate', gameState);

            }

        }

    });

    socket.on('playerToggleBingoMark', ({ role, index }) => {

        if (!gameState.referatBingo || gameState.referatBingo.phase !== 'PLAYING') return;

        const player = gameState.players[socket.id];

        if (!player) return;

        const idx = parseInt(index);

        if (isNaN(idx) || idx < 0 || idx >= 9) return;

        if (role === 'partner') {

            if (player.team !== gameState.referatBingo.referatTeam || socket.id === gameState.referatBingo.referatPlayerId) return;

            gameState.referatBingo.partnerMarked[idx] = !gameState.referatBingo.partnerMarked[idx];

            io.emit('stateUpdate', gameState);

        } else if (role === 'opposing') {

            if (player.team !== gameState.referatBingo.opposingTeam) return;

            gameState.referatBingo.opposingMarked[idx] = !gameState.referatBingo.opposingMarked[idx];

            io.emit('stateUpdate', gameState);

        }

    });

    // --- Buchstabensalat ---

    socket.on('getBuchstabensalatRoundsData', () => {
        socket.emit('receiveBuchstabensalatRoundsData', getBuchstabensalatRounds());
    });

    socket.on('adminStartBuchstabensalatRound', ({ roundId, duration }) => {
        console.log('adminStartBuchstabensalatRound received:', roundId, duration, 'isAdmin:', adminSockets.has(socket.id));
        if (!adminSockets.has(socket.id)) return;
        const rounds = getBuchstabensalatRounds().rounds;
        const round = rounds.find(r => r.id === roundId);
        console.log('round found:', round ? round.id : 'NOT FOUND');
        if (!round) return;

        if (buchstabensalatTimerInterval) {
            clearInterval(buchstabensalatTimerInterval);
            buchstabensalatTimerInterval = null;
        }

        gameState.buchstabensalatGame = {
            phase: 'PLAYING',
            category: round.category,
            answer: round.answer,
            revealed: '',
            order: round.order,
            step: 0,
            duration: duration || 0,
            timerRunning: true,
            buzzerWinner: null,
            buzzerLocked: false,
            scores: Object.fromEntries(Object.keys(gameState.teams).map(team => [team, 0]))
        };

        buchstabensalatTimerInterval = setInterval(() => {
            const game = gameState.buchstabensalatGame;
            if (!game || game.phase !== 'PLAYING' || game.buzzerLocked) {
                clearInterval(buchstabensalatTimerInterval);
                buchstabensalatTimerInterval = null;
                return;
            }
            if (game.step >= game.order.length) {
                clearInterval(buchstabensalatTimerInterval);
                buchstabensalatTimerInterval = null;
                game.phase = 'REVEALED';
                game.revealed = game.answer;
                game.timerRunning = false;
                io.emit('stateUpdate', gameState);
                return;
            }
            game.revealed = game.order[game.step];
            game.step++;
            io.emit('stateUpdate', gameState);
        }, (duration || 2) * 1000);

        io.emit('stateUpdate', gameState);
    });

    socket.on('adminLockBuchstabensalatBuzzer', () => {
        if (!adminSockets.has(socket.id)) return;
        const game = gameState.buchstabensalatGame;
        if (!game || game.phase !== 'PLAYING') return;
        
        game.buzzerLocked = true;
        io.emit('stateUpdate', gameState);
    });

    socket.on('pressBuchstabensalatBuzzer', () => {
        const game = gameState.buchstabensalatGame;
        if (!game || game.phase !== 'PLAYING') return;
        if (game.buzzerWinner || game.buzzerLocked) return;
        
        // First person to buzz wins
        game.buzzerWinner = socket.id;
        
        // Store team and player name for scoring
        const player = gameState.players[socket.id];
        if (player) {
            game.buzzerTeam = player.team;
            game.buzzerName = player.name;
        }
        
        io.emit('stateUpdate', gameState);
    });

    socket.on('adminSubmitBuchstabensalatGuess', ({ guess }) => {
        const game = gameState.buchstabensalatGame;
        if (!game || game.phase !== 'PLAYING') return;
        if (!game.buzzerWinner || game.buzzerWinner !== socket.id) return;
        
        // Check if guess is correct (case-insensitive)
        const correctGuess = guess.trim().toLowerCase() === game.answer.trim().toLowerCase();
        
        if (correctGuess) {
            // Award 1 point per correct guess, max 5 points
            const currentScore = game.scores[game.buzzerTeam] || 0;
            if (currentScore < 5) {
                game.scores[game.buzzerTeam] = currentScore + 1;
                console.log(`Player ${game.buzzerName} from ${game.buzzerTeam} got 1 point! Total: ${game.scores[game.buzzerTeam]}/5`);
            } else {
                console.log(`Team ${game.buzzerTeam} already has 5 points!`);
            }
        } else {
            console.log(`Wrong guess from player ${socket.id}: "${guess}"`);
        }
        
        io.emit('stateUpdate', gameState);
    });

    socket.on('adminAddBuchstabensalatPoint', ({ team, amount }) => {
        if (!adminSockets.has(socket.id)) return;
        const game = gameState.buchstabensalatGame;
        if (!game || !team) return;
        
        // Add points to specific team
        if (game.scores[team] !== undefined) {
            game.scores[team] = Math.max(0, Math.min(5, game.scores[team] + amount));
        }
        
        io.emit('stateUpdate', gameState);
    });

    socket.on('adminRevealBuchstabensalat', () => {
        if (!adminSockets.has(socket.id)) return;
        const game = gameState.buchstabensalatGame;
        if (!game) return;
        if (buchstabensalatTimerInterval) {
            clearInterval(buchstabensalatTimerInterval);
            buchstabensalatTimerInterval = null;
        }
        game.phase = 'REVEALED';
        game.revealed = game.answer;
        game.timerRunning = false;
        io.emit('stateUpdate', gameState);
    });

    socket.on('adminResetBuchstabensalat', () => {
        if (!adminSockets.has(socket.id)) return;
        if (buchstabensalatTimerInterval) {
            clearInterval(buchstabensalatTimerInterval);
            buchstabensalatTimerInterval = null;
        }
        gameState.buchstabensalatGame = {
            phase: 'IDLE',
            category: null,
            answer: null,
            revealed: '',
            order: [],
            step: 0,
            duration: 0,
            timerRunning: false,
            buzzerWinner: null,
            buzzerLocked: false,
            scores: Object.fromEntries(Object.keys(gameState.teams).map(team => [team, 0]))
        };
        io.emit('stateUpdate', gameState);
    });

});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {

    console.log(`Server läuft auf http://localhost:${PORT}`);

});
