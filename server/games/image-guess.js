'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const IMAGE_FILE_PATTERN = /\.(jpg|jpeg|png|webp|gif)$/i;

/**
 * Gemeinsame Logik fuer Spiele, in denen Bilder erraten werden und gebuzzert wird
 * (Promis raten, Drudel). Ein Spiel liefert nur Ordner, Namen und Event-Namen.
 */
function createImageGuessGame(ctx, config) {
    const { io, gameState, adminSockets, createScores, renameKey, emitState, isAdmin, utils } = ctx;
    const { id, title, stateKey, folder, gameLabel } = config;
    const maxScore = utils.MAX_POINTS_PER_GAME;
    const manifestPath = path.join(ROOT, 'public', 'games', folder, `${folder}.json`);
    let currentName = '';

    const state = () => gameState[stateKey];
    const isActive = () => gameState.currentScreen === id;

    function readImages() {
        try {
            const entries = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            if (!Array.isArray(entries)) return [];
            const imageDirectory = path.join(path.dirname(manifestPath), 'images');
            const imageFiles = fs.readdirSync(imageDirectory)
                .filter(file => IMAGE_FILE_PATTERN.test(file))
                .sort((first, second) => first.localeCompare(second, undefined, { numeric: true }));
            return entries.map((entry, index) => normalizeEntry(entry, imageFiles[index])).filter(entry => entry.image && entry.name);
        } catch (error) {
            console.error(`Fehler beim Lesen der ${gameLabel}-Bilder:`, error.message);
            return [];
        }
    }

    function normalizeEntry(entry, fallbackFile) {
        if (typeof entry === 'string') return { name: entry, image: fallbackFile ? `images/${fallbackFile}` : '' };
        const hasFolder = entry.image && entry.image.includes('/');
        return { ...entry, image: hasFolder ? entry.image : `images/${entry.image || ''}` };
    }

    function showNextImage() {
        const images = readImages();
        if (!images.length) return false;
        const nextIndex = (state().imageIndex + 1) % images.length;
        currentName = images[nextIndex].name;
        Object.assign(state(), {
            imageIndex: nextIndex,
            currentImage: `games/${folder}/${images[nextIndex].image}`,
            revealedName: '',
            buzzerLocked: false,
            buzzerWinner: null,
            buzzerTeam: null,
            winnerTeam: null
        });
        return true;
    }

    /** Der Admin sieht die Loesung schon vor dem Aufdecken, die Spieler nicht. */
    function emitAdminInfo(socket) {
        if (!isActive()) return;
        const info = { screen: id, name: currentName };
        if (socket) socket.emit('imageGuessAdminUpdate', info);
        else adminSockets.forEach(socketId => io.to(socketId).emit('imageGuessAdminUpdate', info));
    }

    function createState() {
        return {
            [stateKey]: {
                imageIndex: -1,
                currentImage: '',
                revealedName: '',
                buzzerLocked: false,
                buzzerWinner: null,
                buzzerTeam: null,
                winnerTeam: null,
                scores: createScores()
            }
        };
    }

    function reset() {
        currentName = '';
        Object.assign(gameState, createState());
        emitAdminInfo();
    }

    function register(socket) {
        socket.on('getImageGuessInfo', () => {
            if (isAdmin(socket)) emitAdminInfo(socket);
        });

        socket.on('adminNextImage', () => {
            if (!isActive() || !isAdmin(socket) || !showNextImage()) return;
            emitState();
            emitAdminInfo();
        });

        socket.on('adminRevealImageName', () => {
            if (!isActive() || !isAdmin(socket) || !currentName) return;
            state().revealedName = currentName;
            emitState();
        });
    }

    function renameTeam(oldName, newName) {
        renameKey(state().scores, oldName, newName);
        if (state().winnerTeam === oldName) state().winnerTeam = newName;
    }

    /** Wer das Punktelimit erreicht, gewinnt und sperrt den Buzzer. */
    function onScoreChanged(team) {
        const game = state();
        if (game.scores[team] >= maxScore) {
            game.winnerTeam = team;
            game.buzzerLocked = true;
        } else if (game.winnerTeam === team) {
            game.winnerTeam = null;
        }
    }

    return {
        id,
        title,
        stateKey,
        clientModule: 'image-guess',
        layout: 'medium',
        maxScore,
        buzzer: true,
        canBuzz: () => Boolean(state().currentImage) && !state().winnerTeam,
        onBuzzerReset: () => { state().winnerTeam = null; },
        onScoreChanged,
        createState,
        reset,
        register,
        renameTeam
    };
}

module.exports = { createImageGuessGame };
