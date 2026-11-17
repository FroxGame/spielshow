'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

module.exports = function createRealitaetGame(ctx) {
    const { io, gameState, adminSockets, createScores, renameKey } = ctx;

    const realitaetImageDirectory = path.join(ROOT, 'public', 'games', 'realitaet');

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
                scores: createScores()
            }
        };
    }

    function reset() {
        Object.assign(gameState, createState());
    }

    function register(socket) {
        socket.on('getRealitaetImages', () => {
            if (!adminSockets.has(socket.id)) return;
            socket.emit('receiveRealitaetImages', getRealitaetImages());
        });

        socket.on('adminStartRealitaet', ({ targetTeam, contentType, image }) => {
            if (!adminSockets.has(socket.id)) return;
            const teams = Object.keys(gameState.teams);
            if (!teams.includes(targetTeam) || !['IMAGE', 'QUESTION'].includes(contentType)) return;
            if (contentType === 'IMAGE' && !getRealitaetImages().some(entry => entry.path === image)) return;
            gameState.realitaetGame = {
                phase: 'PLAYING',
                targetTeam,
                contentType,
                image: contentType === 'IMAGE' ? image : '',
                scores: gameState.realitaetGame.scores || Object.fromEntries(teams.map(team => [team, 0]))
            };
            io.emit('stateUpdate', gameState);
        });

        socket.on('adminEndRealitaet', () => {
            if (!adminSockets.has(socket.id) || gameState.realitaetGame.phase !== 'PLAYING') return;
            gameState.realitaetGame.phase = 'FINISHED';
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
