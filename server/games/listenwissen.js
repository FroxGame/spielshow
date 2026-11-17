'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

module.exports = function createListenwissenGame(ctx) {
    const { gameState, createScores, renameKey, emitState, isAdmin } = ctx;

    const wordListsPath = path.join(ROOT, 'listen.json');

    const state = () => gameState.listenwissenGame;

    function getWordLists() {
        try {
            if (!fs.existsSync(wordListsPath)) {
                console.error('listen.json wurde nicht gefunden!');
                return {};
            }
            return JSON.parse(fs.readFileSync(wordListsPath, 'utf8'));
        } catch (error) {
            console.error('Fehler beim Lesen der listen.json:', error.message);
            return {};
        }
    }

    function startWordGame(listKey) {
        const selectedList = getWordLists()[listKey];
        if (!Array.isArray(selectedList)) {
            console.error(`Liste mit Key "${listKey}" nicht gefunden!`);
            return;
        }
        state().currentWordListKey = listKey;
        state().wordGameData = selectedList.map((word, index) => ({ id: index, word, revealed: false }));
    }

    function toggleWord(wordId) {
        const word = state().wordGameData.find(entry => entry.id === wordId);
        if (word) word.revealed = !word.revealed;
    }

    function revealAllWords() {
        state().wordGameData.forEach(word => { word.revealed = true; });
    }

    function createState() {
        return {
            listenwissenGame: {
                currentWordListKey: null,
                wordGameData: [],
                scores: createScores()
            }
        };
    }

    function reset() {
        Object.assign(gameState, createState());
    }

    function register(socket) {
        socket.on('getWordLists', () => {
            socket.emit('receiveWordLists', getWordLists());
        });

        socket.on('adminStartWordGame', listKey => {
            if (!isAdmin(socket)) return;
            startWordGame(listKey);
            emitState();
        });

        socket.on('adminToggleWord', wordId => {
            if (!isAdmin(socket)) return;
            toggleWord(wordId);
            emitState();
        });

        socket.on('adminRevealAllWords', () => {
            if (!isAdmin(socket)) return;
            revealAllWords();
            emitState();
        });
    }

    function renameTeam(oldName, newName) {
        renameKey(state().scores, oldName, newName);
    }

    return {
        id: 'LISTENWISSEN',
        title: 'Listenwissen',
        stateKey: 'listenwissenGame',
        clientModule: 'listenwissen',
        layout: 'wide',
        createState,
        reset,
        register,
        renameTeam
    };
};
