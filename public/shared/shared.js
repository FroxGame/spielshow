/* Gemeinsame Bausteine fuer alle Spiele. Wird in Spieler-, Zuschauer- und Admin-Seite geladen.
   Quelle der Wahrheit fuer die Spieleliste ist der Server (/games.json). */
(function () {
    'use strict';

    let games = [];
    const ready = fetch('/games.json')
        .then(response => response.json())
        .then(list => { games = list; return list; });

    const getGame = id => games.find(game => game.id === id) || null;

    function getModuleFile(screenId, role) {
        const game = getGame(screenId);
        return game ? `games/${game.clientModule}-${role}.html` : null;
    }

    function formatScore(points, maxScore) {
        const value = points === undefined || points === null ? 0 : points;
        return maxScore === null || maxScore === undefined ? String(value) : `${value} / ${maxScore}`;
    }

    function createElement(tag, className, text) {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (text !== undefined) element.textContent = text;
        return element;
    }

    function getGameState(state, game) {
        return (game && state && state[game.stateKey]) || null;
    }

    /* ---------- Punkteanzeige ---------- */

    function renderScoreChips(container, state, game, highlightTeam) {
        const gameState = getGameState(state, game);
        container.replaceChildren();
        if (!gameState) return;
        Object.entries(gameState.scores || {}).forEach(([team, points]) => {
            const chip = createElement('span', 'sp-score-chip', `${team}: ${formatScore(points, game.maxScore)}`);
            const teamColor = state.teams && state.teams[team] ? state.teams[team].color : null;
            if (teamColor) chip.style.borderColor = teamColor;
            if (team === highlightTeam) {
                chip.classList.add('sp-mine');
                if (teamColor) chip.style.color = teamColor;
            }
            container.appendChild(chip);
        });
    }

    /* ---------- Buzzer ---------- */

    let audioContext = null;

    function playBuzzerSound() {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        audioContext = audioContext || new AudioContextClass();
        if (audioContext.state === 'suspended') audioContext.resume();
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        const now = audioContext.currentTime;
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(880, now);
        oscillator.frequency.exponentialRampToValueAtTime(440, now + 0.18);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        oscillator.connect(gain);
        gain.connect(audioContext.destination);
        oscillator.start();
        oscillator.stop(now + 0.22);
    }

    /** Merkt sich den letzten Buzzer-Gewinner und meldet nur neue Gewinner. */
    function createBuzzerWatcher() {
        let lastWinner = null;
        let playedLocally = false;
        return {
            markPlayedLocally() { playedLocally = true; },
            /** Spielt den Ton genau einmal pro neuem Gewinner. */
            update(winner) {
                const isNew = Boolean(winner) && winner !== lastWinner;
                lastWinner = winner || null;
                if (isNew && !playedLocally) playBuzzerSound();
                if (isNew || !winner) playedLocally = false;
                return isNew;
            }
        };
    }

    function describeBuzzer(gameState) {
        if (gameState.buzzerWinner) return `${gameState.buzzerWinner} hat gebuzzert.`;
        if (gameState.buzzerLocked) return 'Der Buzzer ist gesperrt.';
        return gameState.buzzerOpen ? 'Der Buzzer ist offen.' : 'Der Buzzer ist noch nicht freigegeben.';
    }

    /* ---------- Team-Notizen ---------- */

    const MAX_NOTE_LENGTH = 500;

    function createNoteField(note, socket) {
        const isMine = note.playerId === socket.id;
        const field = createElement('div', 'sp-note-field');
        field.appendChild(createElement('label', '', isMine ? 'Deine Notiz' : `${note.name}s Notiz`));
        const textarea = createElement('textarea', 'sp-note-input');
        textarea.dataset.playerId = note.playerId;
        textarea.maxLength = MAX_NOTE_LENGTH;
        textarea.value = note.text || '';
        textarea.readOnly = !isMine;
        textarea.placeholder = isMine ? 'Notiz für dich und deinen Teampartner...' : 'Noch keine Notiz vorhanden';
        if (isMine) textarea.addEventListener('input', () => socket.emit('updatePlayerNote', textarea.value));
        field.appendChild(textarea);
        return field;
    }

    /** Notizen des eigenen Teams. Fremde Notizen sind lesbar und vergroesserbar, aber nicht editierbar. */
    function createTeamNotes({ socket, container }) {
        let renderedIds = '';
        return {
            update(notes) {
                if (!Array.isArray(notes)) return;
                const ids = notes.map(note => note.playerId).join('|');
                if (ids !== renderedIds) {
                    container.replaceChildren(...notes.map(note => createNoteField(note, socket)));
                    renderedIds = ids;
                    return;
                }
                notes.forEach(note => {
                    const textarea = container.querySelector(`[data-player-id="${note.playerId}"]`);
                    if (textarea && document.activeElement !== textarea) textarea.value = note.text || '';
                });
            }
        };
    }

    /* ---------- Spieler: Punkte und Buzzer unter/ueber dem Spiel ---------- */

    function createPlayerChrome({ socket, scorebar, buzzerBar, notesContainer }) {
        const watcher = createBuzzerWatcher();
        const notes = createTeamNotes({ socket, container: notesContainer });
        const button = createElement('button', 'sp-buzzer-btn', 'BUZZER (Leertaste)');
        const status = createElement('div', 'sp-buzzer-status');
        buzzerBar.append(button, status);
        function pressBuzzer() {
            playBuzzerSound();
            watcher.markPlayedLocally();
            socket.emit('pressBuzzer');
        }

        button.addEventListener('click', pressBuzzer);

        /* Leertaste buzzert, solange man nicht in einem Eingabefeld ist. */
        let spaceHandled = false;
        const isTypingTarget = element => Boolean(element) && (
            element.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName)
        );

        document.addEventListener('keydown', event => {
            if (event.code !== 'Space' || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
            if (isTypingTarget(event.target) || !buzzerBar.classList.contains('sp-visible') || button.disabled) return;
            event.preventDefault();
            spaceHandled = true;
            pressBuzzer();
        });

        document.addEventListener('keyup', event => {
            if (event.code !== 'Space' || !spaceHandled) return;
            event.preventDefault(); // verhindert, dass ein fokussierter Button zusaetzlich klickt
            spaceHandled = false;
        });

        return {
            updateNotes: notes.update,
            update(state) {
                const game = getGame(state.currentScreen);
                const me = state.players && state.players[socket.id];
                const notesOpen = Boolean(state.notesEnabled && me && me.team);
                notesContainer.style.display = notesOpen ? 'grid' : 'none';
                if (document.body.classList.contains('sp-notes-open') !== notesOpen) {
                    document.body.classList.toggle('sp-notes-open', notesOpen);
                    window.dispatchEvent(new Event('resize'));
                }
                scorebar.style.display = game ? 'flex' : 'none';
                if (game) renderScoreChips(scorebar, state, game, me ? me.team : null);
                const gameState = getGameState(state, game);
                const showBuzzer = Boolean(game && game.buzzer && gameState);
                buzzerBar.classList.toggle('sp-visible', showBuzzer);
                document.body.classList.toggle('sp-buzzer-open', showBuzzer);
                if (!showBuzzer) { watcher.update(null); return; }
                button.disabled = !gameState.buzzerOpen;
                status.textContent = describeBuzzer(gameState);
                watcher.update(gameState.buzzerWinner);
            }
        };
    }

    /* ---------- Zuschauer: Punkte und Buzzer-Banner ---------- */

    function createSpectatorChrome({ scorebar, buzzerBanner }) {
        const watcher = createBuzzerWatcher();
        return {
            update(state) {
                const game = getGame(state.currentScreen);
                scorebar.style.display = game ? 'flex' : 'none';
                if (game) renderScoreChips(scorebar, state, game, null);
                const gameState = getGameState(state, game);
                const showBuzzer = Boolean(game && game.buzzer && gameState);
                buzzerBanner.classList.toggle('sp-visible', showBuzzer);
                if (!showBuzzer) { watcher.update(null); return; }
                buzzerBanner.classList.toggle('sp-won', Boolean(gameState.buzzerWinner));
                buzzerBanner.textContent = describeBuzzer(gameState);
                watcher.update(gameState.buzzerWinner);
            }
        };
    }

    /* ---------- Admin: Standard-Steuerung (Punkte, Buzzer, Reset) ---------- */

    function createAdminButton(label, onClick, className) {
        const button = createElement('button', className, label);
        button.addEventListener('click', onClick);
        return button;
    }

    function buildScoreRows(container, teamNames, socket) {
        container.replaceChildren();
        const rows = {};
        teamNames.forEach(team => {
            const row = createElement('div', 'sp-admin-score-row');
            const label = createElement('b');
            row.append(
                label,
                createAdminButton('-1', () => socket.emit('adminAddGamePoint', { team, amount: -1 })),
                createAdminButton('+1', () => socket.emit('adminAddGamePoint', { team, amount: 1 }))
            );
            container.appendChild(row);
            rows[team] = label;
        });
        return rows;
    }

    function createAdminChrome({ socket, container }) {
        const watcher = createBuzzerWatcher();
        let builtFor = null;
        let scoreLabels = {};
        let buzzerStatus = null;
        let buzzerSection = null;

        function build(game, teamNames) {
            container.replaceChildren();
            container.appendChild(createElement('h3', '', `Spielsteuerung: ${game.title}`));
            const scoreSection = createElement('div', 'sp-admin-section');
            container.appendChild(scoreSection);
            scoreLabels = buildScoreRows(scoreSection, teamNames, socket);

            buzzerSection = createElement('div', 'sp-admin-section');
            buzzerStatus = createElement('div', 'sp-admin-buzzer-status');
            buzzerSection.append(
                buzzerStatus,
                createAdminButton('Buzzer sperren', () => socket.emit('adminLockBuzzer')),
                createAdminButton('Buzzer freigeben', () => socket.emit('adminResetBuzzer'))
            );
            container.appendChild(buzzerSection);

            const resetSection = createElement('div', 'sp-admin-section');
            resetSection.appendChild(createAdminButton('Spiel zurücksetzen', () => {
                if (confirm(`${game.title} komplett zurücksetzen (inklusive Punkte)?`)) socket.emit('adminResetGame');
            }, 'sp-btn-danger'));
            container.appendChild(resetSection);
        }

        return {
            update(state) {
                const game = getGame(state.currentScreen);
                const gameState = getGameState(state, game);
                container.style.display = game && gameState ? 'block' : 'none';
                if (!game || !gameState) { builtFor = null; watcher.update(null); return; }

                const teamNames = Object.keys(gameState.scores || {});
                const signature = `${game.id}|${teamNames.join(',')}`;
                if (builtFor !== signature) { build(game, teamNames); builtFor = signature; }

                teamNames.forEach(team => {
                    if (scoreLabels[team]) scoreLabels[team].textContent = `${team}: ${formatScore(gameState.scores[team], game.maxScore)}`;
                });
                buzzerSection.style.display = game.buzzer ? 'block' : 'none';
                if (game.buzzer) {
                    buzzerStatus.textContent = describeBuzzer(gameState);
                    watcher.update(gameState.buzzerWinner);
                }
            }
        };
    }

    window.Spielshow = {
        ready,
        getGame,
        getGames: () => games,
        getModuleFile,
        formatScore,
        playBuzzerSound,
        createBuzzerWatcher,
        createPlayerChrome,
        createSpectatorChrome,
        createAdminChrome
    };
}());
