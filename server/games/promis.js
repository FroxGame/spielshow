'use strict';

const { createImageGuessGame } = require('./image-guess');

module.exports = function createPromisGame(ctx) {
    return createImageGuessGame(ctx, {
        id: 'PROMI_RATEN',
        title: 'Promis raten',
        stateKey: 'promiGame',
        folder: 'promis',
        gameLabel: 'Promi'
    });
};
