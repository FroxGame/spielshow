'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

module.exports = function createRealitaetGame(ctx) {
    const { io, gameState, adminSockets, createScores, renameKey } = ctx;

    const realitaetImageDirectory = path.join(ROOT, 'public', 'games', 'realitaet');

    let realitaetTimerInterval = null;

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

    function createState() {
        return {
            realitaetGame: {
                phase: 'IDLE',
                targetTeam: null,
                contentType: null,
                image: '',
                duration: 180,
                remaining: 0,
                scores: createScores()
            }
        };
    }

    function reset() {
        if (realitaetTimerInterval) {
            clearInterval(realitaetTimerInterval);
            realitaetTimerInterval = null;
        }
        Object.assign(gameState, createState());
    }

    function register(socket) {
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

    }

    function renameTeam(oldName, newName) {
        renameKey(gameState.realitaetGame.scores, oldName, newName);
        if (gameState.realitaetGame.targetTeam === oldName) gameState.realitaetGame.targetTeam = newName;
    }

    return {
        id: 'REALITAET',
        title: 'Ist es real oder ist es nicht Wirklichkeit?',
        stateKey: 'realitaetGame',
        clientModule: 'realitaet',
        maxScore: null,
        createState,
        reset,
        register,
        renameTeam
    };
};
