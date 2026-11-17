'use strict';

const { createImageGuessGame } = require('./image-guess');

module.exports = function createDrudelGame(ctx) {
    return createImageGuessGame(ctx, {
        id: 'DRUDEL',
        title: 'Drudel',
        stateKey: 'drudelGame',
        folder: 'drudel',
        gameLabel: 'Drudel'
    });
};
