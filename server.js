'use strict';

const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const { createContext } = require('./server/context');
const { createGames } = require('./server/registry');
const { createNotes } = require('./server/core/notes');
const { createAuth } = require('./server/core/auth');
const { createPlayers } = require('./server/core/players');
const { createTeams } = require('./server/core/teams');
const { createScreens } = require('./server/core/screens');
const { createGameControls } = require('./server/core/game-controls');
const { createTimer } = require('./server/core/timer');
const { guardSocket } = require('./server/core/safe-socket');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const ctx = createContext(io);
const games = createGames(ctx);
const notes = createNotes(ctx);

const coreModules = [
    createAuth(ctx, games, notes),
    createPlayers(ctx, games, notes),
    createTeams(ctx, games, notes),
    createScreens(ctx, games),
    createGameControls(ctx, games),
    createTimer(ctx),
    notes
];

app.get('/games.json', (req, res) => res.json(games.describe()));
games.list.forEach(game => game.registerRoutes && game.registerRoutes(app));
app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', socket => {
    guardSocket(socket);
    coreModules.forEach(module => module.register(socket));
    games.list.forEach(game => game.register(socket));
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`Server läuft auf http://localhost:${PORT}`);
});
