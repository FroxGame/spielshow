/* Gemeinsamer Baustein fuer das Spiel "Rap Battle" (Admin, Spieler, Zuschauer).
   Enthaelt: Uhr (Server-Zeit), Zeitberechnung, synthetischen Beat (Web Audio, keine Audiodateien),
   die animierte Rap-Buehne fuer den Rappenden, das Rap-Feld (Reimwoerter-Liste) und die Wort-Chips.
   Alle Funktionen hier lesen nur die Daten aus dem privaten Kanal "rapBattleView". */
(function () {
    'use strict';

    const LOOKAHEAD_SECONDS = 0.25;
    const SCHEDULER_INTERVAL_MS = 30;
    const STEPS_PER_BEAT = 4;
    const STEPS_PER_BAR = 16;
    const GLIDE_LEAD_BEATS = 0.2;
    const GLIDE_LENGTH_BEATS = 0.7;
    const FIELD_REFRESH_MS = 150;

    const STYLES = `
        .rb-muted { color: #a4b0be; font-size: 0.9rem; }
        .rb-topic { display: inline-block; margin: 4px 0 10px; padding: 6px 14px; border-radius: 999px; background: #1c202c; border: 2px solid #9b5de5; color: #d9c2ff; font-weight: 700; }
        .rb-reel { position: relative; height: 330px; overflow: hidden; width: 100%; }
        .rb-row { position: absolute; left: 0; right: 0; top: 0; height: 96px; transform-origin: center top; will-change: transform, opacity; }
        .rb-track { position: absolute; left: 0; right: 0; top: 26px; display: grid; grid-template-columns: 1fr 1fr 1fr 1.7fr; gap: 6px; }
        .rb-cell { position: relative; height: 62px; border-radius: 10px; background: #1c202c; border: 2px solid #3d4763; overflow: hidden; display: flex; align-items: center; justify-content: center; }
        .rb-cell > i { position: absolute; left: 0; top: 0; bottom: 0; width: 0; background: linear-gradient(90deg, rgba(155, 93, 229, 0.55), rgba(255, 77, 141, 0.55)); }
        .rb-cell > span { position: relative; z-index: 1; }
        .rb-cell .rb-num { color: #7f8aa3; font-weight: 700; }
        .rb-cell.rb-last { border-color: #9b5de5; }
        .rb-word { padding: 0 6px; font-size: 1.55rem; font-weight: 800; line-height: 1.05; text-align: center; word-break: break-word; color: #fff; }
        .rb-row.rb-due .rb-cell.rb-last { border-color: #ffd166; box-shadow: 0 0 18px #ff4d8d; }
        .rb-row.rb-due .rb-word { color: #ffd166; }
        .rb-ball { position: absolute; top: 4px; left: 0; width: 18px; height: 18px; margin-left: -9px; border-radius: 50%; background: #ffd166; box-shadow: 0 0 12px #ff4d8d; display: none; }
        .rb-row.rb-current .rb-ball { display: block; }
        .rb-progress { height: 4px; border-radius: 2px; background: #2a3147; margin-bottom: 8px; overflow: hidden; }
        .rb-progress > i { display: block; height: 100%; width: 0; background: linear-gradient(90deg, #9b5de5, #ff4d8d); }
        .rb-overlay { position: absolute; top: 0; right: 8px; pointer-events: none; font-size: 4rem; font-weight: 800; line-height: 1; color: #ffd166; text-shadow: 0 0 24px #ff4d8d; z-index: 2; text-align: center; }
        .rb-overlay.rb-small { inset: 0; display: flex; align-items: center; justify-content: center; font-size: 1.8rem; background: rgba(18, 18, 18, 0.55); }
        .rb-overlay:empty { display: none; }
        .rb-dots { display: flex; justify-content: center; gap: 12px; margin-top: 6px; }
        .rb-dots span { width: 16px; height: 16px; border-radius: 50%; background: #2a3147; transition: background 0.08s, transform 0.08s; }
        .rb-dots span.rb-on { background: #ff4d8d; transform: scale(1.35); }
        .rb-linefield { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 10px; text-align: left; }
        .rb-linefield li { display: flex; align-items: baseline; gap: 8px; padding: 6px 10px; border-radius: 8px; background: #1c202c; border: 2px solid #3d4763; transition: border-color 0.15s, background 0.15s; }
        .rb-linefield .rb-num { min-width: 1.6em; color: #7f8aa3; font-size: 0.85rem; }
        .rb-linefield .rb-w { font-weight: 700; word-break: break-word; }
        .rb-linefield li.rb-past { opacity: 0.45; }
        .rb-linefield li.rb-active { border-color: #ff4d8d; background: #3a1f33; opacity: 1; }
        .rb-linefield.rb-large li { padding: 10px 14px; }
        .rb-linefield.rb-large .rb-w { font-size: 1.3rem; }
        .rb-chips { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin: 8px 0; }
        .rb-chip { padding: 8px 14px; border-radius: 999px; border: 2px solid #4a5676; background: #1c202c; color: #fff; font: inherit; font-weight: 700; word-break: break-word; }
        button.rb-chip { cursor: pointer; }
        button.rb-chip:disabled { cursor: default; }
        .rb-chip.rb-empty { opacity: 0.4; border-style: dashed; }
        .rb-chip.rb-marked { background: #19462e; border-color: #2ed573; color: #a4f5c5; }
        .rb-teamboard { margin: 10px 0; padding: 10px 12px; border: 1px solid #3d4763; border-radius: 10px; background: #171922; }
        .rb-teamboard h4 { margin: 0 0 4px; font-size: 1rem; }
        .rb-teamboard .rb-muted { margin: 0; }
        .rb-large .rb-chip { font-size: 1.15rem; }
    `;

    function installStyles() {
        if (document.getElementById('rbStyles')) return;
        const style = document.createElement('style');
        style.id = 'rbStyles';
        style.textContent = STYLES;
        document.head.appendChild(style);
    }
    installStyles();

    function createElement(tag, className, text) {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (text !== undefined) element.textContent = text;
        return element;
    }

    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
    const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

    /* ---------- Uhr und Zeitberechnung ---------- */

    /** Rechnet die Server-Zeit in die lokale Zeit um (Abweichung wird bei jeder Ansicht neu gemessen). */
    function createClock() {
        let offset = 0;
        return {
            sync(view) { if (view && typeof view.serverNow === 'number') offset = view.serverNow - Date.now(); },
            now: () => Date.now() + offset,
            toLocal: serverTime => serverTime - offset
        };
    }

    /**
     * Wo steht der Rap gerade? phase: waiting (vor dem Startzeitpunkt), countin (Einzaehler), rap, done.
     * line = aktuelle Zeile, barPos = Position in der Zeile in Bars (0 bis barsPerLine).
     */
    function locate(timing, nowMs, lineCount) {
        const beatMs = 60000 / timing.bpm;
        const beatsPerLine = timing.beatsPerBar * timing.barsPerLine;
        const beats = (nowMs - timing.startAt) / beatMs;
        const rapBeats = beats - timing.countInBeats;
        const base = { beats, rapBeats, beatsPerLine, beatInBar: ((beats % 4) + 4) % 4 };
        if (beats < 0) return { ...base, phase: 'waiting', line: 0, barPos: 0 };
        if (rapBeats < 0) return { ...base, phase: 'countin', line: 0, barPos: 0, countdown: Math.ceil(timing.countInBeats - beats) };
        if (rapBeats >= lineCount * beatsPerLine) return { ...base, phase: 'done', line: lineCount - 1, barPos: timing.barsPerLine };
        const line = Math.floor(rapBeats / beatsPerLine);
        return { ...base, phase: 'rap', line, barPos: ((rapBeats - line * beatsPerLine) / beatsPerLine) * timing.barsPerLine };
    }

    /* ---------- Beat (synthetisch) ---------- */

    const KICK_STEPS = [0, 7, 10];
    const SNARE_STEPS = [4, 12];
    const HAT_STEPS = [0, 2, 4, 6, 8, 10, 12, 14];
    const OPEN_HAT_STEPS = [14];
    const BASS_STEPS = [0, 10];
    const BASS_NOTES = [55, 55, 65.41, 49];

    function createNoiseBuffer(context) {
        const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        return buffer;
    }

    function envelope(context, destination, time, peak, length) {
        const gain = context.createGain();
        gain.gain.setValueAtTime(peak, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + length);
        gain.connect(destination);
        return gain;
    }

    function playOscillator(context, destination, { time, type, from, to, sweep, peak, length }) {
        const oscillator = context.createOscillator();
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(from, time);
        if (to) oscillator.frequency.exponentialRampToValueAtTime(to, time + sweep);
        oscillator.connect(envelope(context, destination, time, peak, length));
        oscillator.start(time);
        oscillator.stop(time + length + 0.05);
    }

    function playNoise(context, destination, noise, { time, filterType, frequency, peak, length }) {
        const source = context.createBufferSource();
        source.buffer = noise;
        const filter = context.createBiquadFilter();
        filter.type = filterType;
        filter.frequency.value = frequency;
        source.connect(filter);
        filter.connect(envelope(context, destination, time, peak, length));
        source.start(time);
        source.stop(time + length + 0.05);
    }

    const drums = {
        kick: (c, d, n, time) => playOscillator(c, d, { time, type: 'sine', from: 150, to: 45, sweep: 0.12, peak: 1, length: 0.4 }),
        snare: (c, d, n, time) => {
            playNoise(c, d, n, { time, filterType: 'highpass', frequency: 1400, peak: 0.55, length: 0.18 });
            playOscillator(c, d, { time, type: 'triangle', from: 200, to: 140, sweep: 0.08, peak: 0.4, length: 0.1 });
        },
        hat: (c, d, n, time) => playNoise(c, d, n, { time, filterType: 'highpass', frequency: 7000, peak: 0.16, length: 0.04 }),
        openHat: (c, d, n, time) => playNoise(c, d, n, { time, filterType: 'highpass', frequency: 7000, peak: 0.2, length: 0.2 }),
        click: (c, d, n, time, accent) => playOscillator(c, d, { time, type: 'square', from: accent ? 1500 : 1000, peak: 0.18, length: 0.05 }),
        bass: (c, d, n, time, frequency) => {
            const filter = c.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 320;
            filter.connect(d);
            playOscillator(c, filter, { time, type: 'sawtooth', from: frequency, peak: 0.4, length: 0.38 });
        }
    };

    function scheduleStep(context, destination, noise, run, step, time) {
        if (step < run.countInSteps) {
            if (step % STEPS_PER_BEAT === 0) drums.click(context, destination, noise, time, step === 0);
            if (step % 2 === 0) drums.hat(context, destination, noise, time);
            return;
        }
        const rapStep = step - run.countInSteps;
        const inBar = rapStep % STEPS_PER_BAR;
        const bar = Math.floor(rapStep / STEPS_PER_BAR);
        if (KICK_STEPS.includes(inBar)) drums.kick(context, destination, noise, time);
        if (SNARE_STEPS.includes(inBar)) drums.snare(context, destination, noise, time);
        if (OPEN_HAT_STEPS.includes(inBar)) drums.openHat(context, destination, noise, time);
        else if (HAT_STEPS.includes(inBar)) drums.hat(context, destination, noise, time);
        if (BASS_STEPS.includes(inBar)) drums.bass(context, destination, noise, time, BASS_NOTES[bar % BASS_NOTES.length]);
    }

    /**
     * Spielt den Beat zum vorgegebenen Startzeitpunkt (lokale Zeit in ms). Der Einzaehler ist ein Klicken.
     * Ist der Browser noch gesperrt (Autoplay), laeuft der Beat nach der naechsten Beruehrung an der richtigen Stelle weiter.
     */
    function createBeat() {
        let context = null;
        let noise = null;
        let run = null;
        let timer = null;
        let params = null;

        function ensureContext() {
            if (context) return true;
            const ContextClass = window.AudioContext || window.webkitAudioContext;
            if (!ContextClass) return false;
            context = new ContextClass();
            noise = createNoiseBuffer(context);
            return true;
        }

        function endRun(fadeSeconds) {
            if (timer) clearInterval(timer);
            timer = null;
            if (!run) return;
            const { master } = run;
            run = null;
            master.gain.cancelScheduledValues(context.currentTime);
            master.gain.setValueAtTime(master.gain.value, context.currentTime);
            master.gain.linearRampToValueAtTime(0, context.currentTime + fadeSeconds);
            setTimeout(() => master.disconnect(), fadeSeconds * 1000 + 100);
        }

        function tick() {
            const horizon = context.currentTime + LOOKAHEAD_SECONDS;
            while (run.nextStep < run.totalSteps && run.origin + run.nextStep * run.stepSeconds < horizon) {
                scheduleStep(context, run.master, noise, run, run.nextStep, run.origin + run.nextStep * run.stepSeconds);
                run.nextStep += 1;
            }
            if (run.nextStep >= run.totalSteps) {
                clearInterval(timer);
                timer = null;
            }
        }

        function start(options) {
            if (!ensureContext()) return false;
            endRun(0.05);
            params = options;
            const master = context.createGain();
            master.gain.value = 0.8;
            const compressor = context.createDynamicsCompressor();
            master.connect(compressor);
            compressor.connect(context.destination);
            const stepSeconds = 60 / options.bpm / STEPS_PER_BEAT;
            const origin = context.currentTime + (options.startAt - Date.now()) / 1000;
            const elapsedSteps = Math.max(0, Math.ceil((context.currentTime - origin) / stepSeconds));
            run = {
                master,
                origin,
                stepSeconds,
                nextStep: elapsedSteps,
                countInSteps: options.countInBeats * STEPS_PER_BEAT,
                totalSteps: (options.countInBeats + options.totalBeats) * STEPS_PER_BEAT
            };
            if (context.state === 'suspended') context.resume();
            timer = setInterval(tick, SCHEDULER_INTERVAL_MS);
            tick();
            return true;
        }

        function stop() {
            params = null;
            if (context) endRun(0.15);
        }

        function unlock() {
            if (!context || context.state === 'running') return;
            context.resume().then(() => { if (params) start(params); });
        }
        document.addEventListener('pointerdown', unlock);
        document.addEventListener('keydown', unlock);

        return {
            start,
            stop,
            isRunning: () => Boolean(run),
            isBlocked: () => Boolean(context) && context.state !== 'running'
        };
    }

    /* ---------- Rap-Buehne fuer den Rappenden ---------- */

    const SLOTS = [
        { d: -1, y: -70, scale: 0.85, opacity: 0 },
        { d: 0, y: 0, scale: 1, opacity: 1 },
        { d: 1, y: 112, scale: 0.86, opacity: 0.6 },
        { d: 2, y: 208, scale: 0.74, opacity: 0.3 },
        { d: 3, y: 290, scale: 0.65, opacity: 0 }
    ];
    function slotFor(distance) {
        if (distance <= SLOTS[0].d) return SLOTS[0];
        if (distance >= SLOTS[SLOTS.length - 1].d) return SLOTS[SLOTS.length - 1];
        const upper = SLOTS.findIndex(slot => slot.d >= distance);
        const from = SLOTS[upper - 1];
        const to = SLOTS[upper];
        const t = (distance - from.d) / (to.d - from.d);
        return ['y', 'scale', 'opacity'].reduce((result, key) => ({ ...result, [key]: from[key] + (to[key] - from[key]) * t }), {});
    }

    /** Position der Buehne in Zeilen: gleitet in einem Beat um die Zeilengrenze von einer Zeile zur naechsten. */
    function stageShift(located, lineCount) {
        if (located.phase === 'done') return lineCount - 1;
        if (located.phase !== 'rap') return 0;
        const shifted = located.rapBeats + GLIDE_LEAD_BEATS;
        const boundary = Math.floor(shifted / located.beatsPerLine);
        if (boundary < 1) return 0;
        const progress = clamp((shifted - boundary * located.beatsPerLine) / GLIDE_LENGTH_BEATS, 0, 1);
        return Math.min(lineCount - 1, boundary - 1 + easeInOut(progress));
    }

    const CELL_WEIGHTS = [1, 1, 1, 1.7];
    const CELL_TOTAL = CELL_WEIGHTS.reduce((sum, weight) => sum + weight, 0);
    const BALL_HEIGHT = 18;

    /** Waagerechte Position (0..1) in der Zeile fuer eine Position in Bars. */
    function ballX(barPos) {
        const bar = Math.min(CELL_WEIGHTS.length - 1, Math.floor(barPos));
        const before = CELL_WEIGHTS.slice(0, bar).reduce((sum, weight) => sum + weight, 0);
        return (before + clamp(barPos - bar, 0, 1) * CELL_WEIGHTS[bar]) / CELL_TOTAL;
    }

    function createRow(word) {
        const row = createElement('div', 'rb-row');
        const track = createElement('div', 'rb-track');
        const fills = [0, 1, 2, 3].map(bar => {
            const cell = createElement('div', bar === 3 ? 'rb-cell rb-last' : 'rb-cell');
            const fill = document.createElement('i');
            cell.append(fill, bar === 3 ? createElement('span', 'rb-word', word) : createElement('span', 'rb-num', String(bar + 1)));
            track.appendChild(cell);
            return fill;
        });
        const ball = createElement('div', 'rb-ball');
        row.append(track, ball);
        return { row, fills, ball };
    }

    function createStage(container, clock) {
        const progress = createElement('div', 'rb-progress');
        const progressFill = progress.appendChild(document.createElement('i'));
        const reel = createElement('div', 'rb-reel');
        const overlay = createElement('div', 'rb-overlay');
        const dots = createElement('div', 'rb-dots');
        const dotElements = [0, 1, 2, 3].map(() => dots.appendChild(document.createElement('span')));
        container.replaceChildren(progress, reel, dots);
        let lines = [];
        let timing = null;
        let rows = [];
        let signature = '';

        function build() {
            rows = lines.map(createRow);
            reel.replaceChildren(overlay, ...rows.map(entry => entry.row));
        }

        function setOverlay(located) {
            const small = located.phase === 'waiting' || located.phase === 'done';
            overlay.classList.toggle('rb-small', small);
            if (located.phase === 'countin') overlay.textContent = String(located.countdown);
            else if (located.phase === 'waiting') overlay.textContent = 'Gleich geht’s los …';
            else overlay.textContent = located.phase === 'done' ? 'Geschafft!' : '';
        }

        function paintBall(entry, isCurrent, located) {
            entry.row.classList.toggle('rb-current', isCurrent);
            if (!isCurrent) return;
            const track = entry.row.firstChild;
            const beatFraction = ((located.rapBeats % 1) + 1) % 1;
            entry.ball.style.left = `${ballX(located.barPos) * track.clientWidth}px`;
            entry.ball.style.transform = `translateY(${Math.abs(Math.sin(Math.PI * beatFraction)) * -BALL_HEIGHT}px)`;
        }

        function paintRow(entry, index, shift, located) {
            const slot = slotFor(index - shift);
            entry.row.style.transform = `translateY(${slot.y}px) scale(${slot.scale})`;
            entry.row.style.opacity = String(slot.opacity);
            entry.row.style.visibility = slot.opacity <= 0.01 ? 'hidden' : 'visible';
            const isCurrent = located.phase === 'rap' && index === located.line;
            const finished = located.phase === 'done' || (located.phase === 'rap' && index < located.line);
            entry.fills.forEach((fill, bar) => {
                const filled = finished ? 1 : (isCurrent ? clamp(located.barPos - bar, 0, 1) : 0);
                fill.style.width = `${filled * 100}%`;
            });
            entry.row.classList.toggle('rb-due', isCurrent && located.barPos >= 3);
            paintBall(entry, isCurrent, located);
        }

        function paintDots(located) {
            const active = located.phase === 'countin' || located.phase === 'rap' ? Math.floor(located.beatInBar) : -1;
            dotElements.forEach((dot, index) => dot.classList.toggle('rb-on', index === active));
        }

        function paintProgress(located) {
            const total = rows.length * located.beatsPerLine;
            const done = located.phase === 'rap' ? located.rapBeats : (located.phase === 'done' ? total : 0);
            progressFill.style.width = total ? `${clamp(done / total, 0, 1) * 100}%` : '0%';
        }

        function paint() {
            const located = timing && rows.length ? locate(timing, clock.now(), rows.length) : { phase: 'idle', line: 0, barPos: 0, beatInBar: 0, beatsPerLine: 16 };
            const shift = stageShift(located, rows.length);
            setOverlay(located);
            rows.forEach((entry, index) => paintRow(entry, index, shift, located));
            paintDots(located);
            paintProgress(located);
        }
        function frame() {
            if (!container.isConnected) return;
            requestAnimationFrame(frame);
            paint();
        }
        requestAnimationFrame(frame);

        return {
            setData(newLines, newTiming) {
                lines = Array.isArray(newLines) ? newLines : [];
                timing = newTiming || null;
                const newSignature = lines.join('|');
                if (newSignature !== signature) { signature = newSignature; build(); }
                paint();
            }
        };
    }

    /* ---------- Rap-Feld (Reimwoerter-Liste fuer alle anderen) ---------- */

    function createLineField(container, clock, { large = false } = {}) {
        const placeholder = createElement('p', 'rb-muted', 'Das Rap-Feld wird noch nicht gezeigt.');
        const list = createElement('ol', `rb-linefield${large ? ' rb-large' : ''}`);
        container.replaceChildren(placeholder, list);
        let lines = null;
        let timing = null;
        let signature = '';

        function paint() {
            list.style.display = lines ? 'grid' : 'none';
            placeholder.style.display = lines ? 'none' : 'block';
            if (!lines) return;
            const located = timing ? locate(timing, clock.now(), lines.length) : null;
            const active = located && located.phase === 'rap' ? located.line : -1;
            let past = 0;
            if (located) past = located.phase === 'done' ? lines.length : (located.phase === 'rap' ? located.line : 0);
            Array.from(list.children).forEach((item, index) => {
                item.classList.toggle('rb-active', index === active);
                item.classList.toggle('rb-past', index < past);
            });
        }

        const timer = setInterval(() => {
            if (!container.isConnected) { clearInterval(timer); return; }
            paint();
        }, FIELD_REFRESH_MS);

        return {
            setData(newLines, newTiming) {
                lines = Array.isArray(newLines) ? newLines : null;
                timing = newTiming || null;
                const newSignature = lines ? lines.join('|') : '';
                if (newSignature !== signature) {
                    signature = newSignature;
                    list.replaceChildren(...(lines || []).map((word, index) => {
                        const item = document.createElement('li');
                        item.append(createElement('span', 'rb-num', `${index + 1}.`), createElement('span', 'rb-w', word));
                        return item;
                    }));
                }
                paint();
            }
        };
    }

    /* ---------- Wort-Chips ---------- */

    /** Zeigt ein Wortfeld als Chips. Mit onToggle sind gefuellte Chips klickbar (Wort gehoert). */
    function renderChips(container, board, { onToggle, large = false } = {}) {
        container.className = `rb-chips${large ? ' rb-large' : ''}`;
        if (container.children.length !== board.words.length) {
            container.replaceChildren(...board.words.map((word, index) => {
                const chip = createElement(onToggle ? 'button' : 'div', 'rb-chip');
                if (onToggle) {
                    chip.type = 'button';
                    chip.addEventListener('click', () => onToggle(index));
                }
                return chip;
            }));
        }
        Array.from(container.children).forEach((chip, index) => {
            const word = board.words[index];
            chip.textContent = word || '·';
            chip.classList.toggle('rb-empty', !word);
            chip.classList.toggle('rb-marked', Boolean(board.marked[index]));
            if (onToggle) chip.disabled = !word;
        });
    }

    /** Alle Wortfelder je Team (Admin, Zuschauer, Aufdecken). Baut nur neu, wenn sich etwas geaendert hat. */
    function renderTeamBoards(container, boards, state, { large = false } = {}) {
        const teamNames = Object.keys((state && state.teams) || {}).filter(team => boards && boards[team]);
        const signature = JSON.stringify([teamNames, teamNames.map(team => boards[team]), teamNames.map(team => (state.teams[team] || {}).color)]);
        if (container.dataset.rbSignature === signature) return;
        container.dataset.rbSignature = signature;
        container.replaceChildren(...teamNames.map(team => {
            const board = boards[team];
            const section = createElement('div', 'rb-teamboard');
            const heading = createElement('h4', '', team);
            const color = (state.teams[team] || {}).color;
            if (color) heading.style.color = color;
            const filled = board.words.filter(Boolean).length;
            const heard = board.marked.filter(Boolean).length;
            const chips = document.createElement('div');
            renderChips(chips, board, { large });
            section.append(heading, createElement('p', 'rb-muted', `${filled} Wörter, davon ${heard} im Rap gehört`), chips);
            return section;
        }));
    }

    window.RapBattle = { createClock, locate, createBeat, createStage, createLineField, renderChips, renderTeamBoards, createElement };
}());
