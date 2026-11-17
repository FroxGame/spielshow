'use strict';

/**
 * Faengt Fehler in Event-Handlern ab, damit ein Fehler in einem Spiel
 * nicht den ganzen Server beendet. Der Fehler wird mit Event-Namen geloggt.
 */
function guardSocket(socket) {
    const originalOn = socket.on.bind(socket);
    socket.on = (event, handler) => originalOn(event, (...args) => {
        try {
            return handler(...args);
        } catch (error) {
            console.error(`Fehler im Event "${event}":`, error);
            return undefined;
        }
    });
}

module.exports = { guardSocket };
