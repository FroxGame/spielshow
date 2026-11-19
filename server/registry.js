'use strict';

const { MAX_POINTS_PER_GAME } = require('./utils');

// Reihenfolge = Spielnummer im Intro. Neue Spiele hier eintragen.
const GAME_FACTORIES = [
    require('./games/listenwissen'),
    require('./games/karte'),
    require('./games/kategorien'),
    require('./games/diktat'),
    require('./games/malen'),
    require('./games/partnerwissen'),
    require('./games/bingo'),
    require('./games/discord'),
    require('./games/promis'),
    require('./games/drudel'),
    require('./games/merken'),
    require('./games/realitaet'),
    require('./games/flaggen'),
    require('./games/buchstabensalat'),
    require('./games/teekesselchen'),
    require('./games/beugen'),
    require('./games/diagramme')
];

const REQUIRED_FIELDS = ['id', 'title', 'stateKey', 'clientModule', 'createState', 'reset', 'register', 'renameTeam'];

function assertValidGame(game) {
    const missing = REQUIRED_FIELDS.filter(field => game[field] === undefined);
    if (missing.length) throw new Error(`Spielmodul "${game.id || '?'}" unvollstaendig: ${missing.join(', ')}`);
}

/** Teilt den Clients mit, ob der Buzzer gerade wirklich drueckbar ist (spielabhaengig). */
function updateBuzzerOpen(state, game) {
    state.buzzerOpen = !state.buzzerLocked && (!game.canBuzz || game.canBuzz());
}

/**
 * Baut alle Spielmodule und fuegt ihren Startzustand in den gameState ein.
 */
function createGames(ctx) {
    const list = GAME_FACTORIES.map((createGame, index) => ({
        number: index + 1,
        maxScore: MAX_POINTS_PER_GAME,
        buzzer: false,
        layout: 'default',
        ...createGame(ctx)
    }));
    list.forEach(assertValidGame);
    list.forEach(game => Object.assign(ctx.gameState, game.createState()));
    ctx.addStateDecorator(() => list.filter(game => game.buzzer).forEach(game => updateBuzzerOpen(ctx.gameState[game.stateKey], game)));

    const byId = id => list.find(game => game.id === id);

    return {
        list,
        byId,
        getIntro(id) {
            const game = byId(id);
            return game ? { number: game.number, name: game.title } : null;
        },
        /** Oeffentliche Beschreibung fuer die Clients (/games.json). */
        describe() {
            return list.map(({ id, number, title, stateKey, clientModule, maxScore, buzzer, layout }) => (
                { id, number, title, stateKey, clientModule, maxScore, buzzer, layout }
            ));
        }
    };
}

module.exports = { createGames };
