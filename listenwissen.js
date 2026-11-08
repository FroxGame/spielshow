const fs = require('fs');
const path = require('path');

// Pfad zur listen.json
const jsonPath = path.join(__dirname, 'listen.json');

/**
 * Liest die verfügbaren Listen aus listen.json
 */
function getWordLists() {
    try {
        if (!fs.existsSync(jsonPath)) {
            console.error("listen.json wurde nicht gefunden!");
            return {};
        }
        const data = fs.readFileSync(jsonPath, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        console.error("Fehler beim Lesen der listen.json:", err.message);
        return {};
    }
}

/**
 * Startet eine Runde Listenwissen und bereitet die Daten im gameState vor
 */
function startWordGame(gameState, listKey) {
    const allLists = getWordLists();
    const selectedList = allLists[listKey];

    if (!Array.isArray(selectedList)) {
        console.error(`Liste mit Key "${listKey}" nicht gefunden!`);
        return;
    }

    gameState.currentWordListKey = listKey;
    // Jedes Wort erhält eine ID und den Status "revealed: false"
    gameState.wordGameData = selectedList.map((word, index) => ({
        id: index,
        word: word,
        revealed: false
    }));
}

/**
 * Deckt ein Wort auf oder verdeckt es wieder
 */
function toggleWord(gameState, wordId) {
    if (!gameState.wordGameData) return;
    
    const wordObj = gameState.wordGameData.find(w => w.id === wordId);
    if (wordObj) {
        wordObj.revealed = !wordObj.revealed;
    }
}

/**
 * Deckt alle Begriffe der aktuellen Runde auf
 */
function revealAllWords(gameState) {
    if (!gameState.wordGameData) return;

    gameState.wordGameData.forEach(wordObj => {
        wordObj.revealed = true;
    });
}

module.exports = {
    getWordLists,
    startWordGame,
    toggleWord,
    revealAllWords
};