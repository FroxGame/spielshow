'use strict';

const MIN_SECONDS = 1;
const MAX_SECONDS = 3600;
const TICK_MS = 200;

/**
 * Globaler, manueller Timer. Der Admin schaltet ihn im Dashboard ein, stellt die Zeit ein
 * und steuert Start, Pause und Zuruecksetzen. Er gilt fuer jedes Spiel und loest nach Ablauf
 * keine Spielfunktion aus. Der Zustand liegt in gameState.timer.
 */
function createTimer(ctx) {
    const { gameState, isAdmin, emitState } = ctx;
    let interval = null;
    let endsAt = 0;

    const timer = () => gameState.timer;
    const secondsLeft = () => Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));

    function stopTicking() {
        if (interval) clearInterval(interval);
        interval = null;
    }

    function tick() {
        const left = secondsLeft();
        if (left === timer().remaining) return;
        timer().remaining = left;
        if (left === 0) {
            timer().running = false;
            stopTicking();
        }
        emitState();
    }

    function start() {
        if (timer().running) return;
        if (timer().remaining <= 0) timer().remaining = timer().duration;
        timer().running = true;
        endsAt = Date.now() + timer().remaining * 1000;
        stopTicking();
        interval = setInterval(tick, TICK_MS);
    }

    function pause() {
        if (!timer().running) return;
        timer().remaining = secondsLeft();
        timer().running = false;
        stopTicking();
    }

    function resetTime() {
        stopTicking();
        timer().running = false;
        timer().remaining = timer().duration;
    }

    function setDuration(seconds) {
        timer().duration = seconds;
        if (!timer().running) timer().remaining = seconds;
    }

    function register(socket) {
        const onAdmin = (event, handler) => socket.on(event, (...args) => {
            if (!isAdmin(socket)) return;
            handler(...args);
            emitState();
        });

        onAdmin('adminSetTimerEnabled', enabled => {
            if (typeof enabled !== 'boolean') return;
            timer().enabled = enabled;
            if (!enabled) pause();
        });

        onAdmin('adminSetTimerDuration', seconds => {
            const value = Math.floor(Number(seconds));
            if (!Number.isFinite(value) || value < MIN_SECONDS || value > MAX_SECONDS) return;
            setDuration(value);
        });

        onAdmin('adminStartTimer', start);
        onAdmin('adminPauseTimer', pause);
        onAdmin('adminResetTimer', resetTime);
    }

    return { register };
}

module.exports = { createTimer };
