/**
 * Utility-Funktionen für das Spielshow-Projekt
 * Enthält gemeinsame Funktionen zur Vermeidung von Code-Duplikation
 */

const fs = require('fs');
const path = require('path');

/**
 * Konstanten für das Spiel
 */
const MAX_POINTS_PER_GAME = 5;
const MAX_DIKTAT_LENGTH = 500;
const MAX_DISCORD_TARGET_LENGTH = 100;
const MAX_PARTNER_QUESTIONS = 4;
const MAX_ALLOCATION_VALUE = 4;
const TOTAL_ALLOCATION_POINTS = 10;

/**
 * Sichere JSON-Datei lesen mit Fehlerbehandlung
 * @param {string} filePath - Pfad zur JSON-Datei
 * @param {string[]} requiredFields - Erforderliche Felder im JSON (optional)
 * @returns {object|array} Parsed JSON oder leeres Array/Object bei Fehler
 */
function readJsonFile(filePath, requiredFields = null) {
    try {
        if (!fs.existsSync(filePath)) {
            console.warn(`JSON-Datei nicht gefunden: ${filePath}`);
            return requiredFields === null ? {} : [];
        }

        const raw = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(raw);

        if (requiredFields && typeof data === 'object') {
            for (const field of requiredFields) {
                if (!(field in data)) {
                    console.warn(`Fehlendes Feld "${field}" in ${filePath}`);
                    return {};
                }
            }
        }

        return data;
    } catch (error) {
        console.error(`Fehler beim Lesen von ${filePath}:`, error.message);
        return requiredFields === null ? {} : [];
    }
}

/**
 * JSON-Datei lesen und als Array filtern
 * @param {string} filePath - Pfad zur JSON-Datei
 * @param {Function} filterFn - Filterfunktion (optional)
 * @returns {array} Gefiltertes Array
 */
function readJsonArray(filePath, filterFn = null) {
    try {
        if (!fs.existsSync(filePath)) return [];

        const raw = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(raw);

        if (!Array.isArray(data)) return [];

        if (filterFn) {
            return data.filter(filterFn);
        }

        return data;
    } catch (error) {
        console.error(`Fehler beim Lesen von ${filePath}:`, error.message);
        return [];
    }
}

/**
 * Punktestand sicher aktualisieren
 * @param {object} scores - Scores-Objekt
 * @param {string} team - Team-Name
 * @param {number} amount - Zu addierende Punkte
 * @param {number} max - Maximale Punkte (default: 5)
 * @returns {boolean} Erfolg
 */
function addScore(scores, team, amount, max = MAX_POINTS_PER_GAME) {
    if (!scores || !scores[team]) return false;

    const points = Number(amount);
    if (!Number.isInteger(points)) {
        console.warn('Ungültiger Punktwert:', amount);
        return false;
    }

    scores[team] = Math.max(0, Math.min(max, scores[team] + points));
    return true;
}

/**
 * String sicher trimmen und begrenzen
 * @param {string} str - Eingabestring
 * @param {number} maxLength - Maximale Länge
 * @returns {string} Bereinigter String
 */
function sanitizeString(str, maxLength = MAX_DIKTAT_LENGTH) {
    if (typeof str !== 'string') {
        console.warn('Ungültiger String:', str);
        return '';
    }

    const trimmed = str.trim();
    if (trimmed.length > maxLength) {
        console.warn(`String zu lang: ${trimmed.length} > ${maxLength}`);
    }

    return trimmed.slice(0, maxLength);
}

/**
 * Zufällige Elemente aus Array auswählen
 * @param {array} array - Eingabe-Array
 * @param {number} count - Anzahl der Elemente
 * @returns {array} Ausgewählte Elemente
 */
function getRandomElements(array, count) {
    if (!Array.isArray(array) || array.length === 0) return [];
    if (count >= array.length) return [...array];

    const shuffled = [...array].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
}

/**
 * Timer-Intervall sicher starten
 * @param {Function} callback - Callback-Funktion
 * @param {number} interval - Intervall in ms
 * @returns {object} Timer-Objekt mit id und stop-Funktion
 */
function startTimer(callback, interval) {
    const id = setInterval(callback, interval);
    
    return {
        id,
        stop: () => {
            clearInterval(id);
        }
    };
}

/**
 * Validiere Team-Name
 * @param {string} teamName - Team-Name
 * @returns {boolean} Gültig
 */
function isValidTeamName(teamName) {
    return typeof teamName === 'string' && teamName.trim().length > 0;
}

/**
 * Validiere Index-Bereich
 * @param {number} index - Index
 * @param {number} min - Minimaler Wert
 * @param {number} max - Maximaler Wert
 * @returns {boolean} Gültig
 */
function isValidIndex(index, min = 0, max = Infinity) {
    const idx = Number(index);
    return Number.isInteger(idx) && idx >= min && idx <= max;
}

/**
 * Deep Clone eines Objekts
 * @param {object} obj - Zu klonendes Objekt
 * @returns {object} Kopie des Objekts
 */
function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

/**
 * Objekt-Werte summieren
 * @param {object} obj - Objekt mit Zahlenwerten
 * @returns {number} Summe aller Werte
 */
function sumObjectValues(obj) {
    if (typeof obj !== 'object' || obj === null) return 0;
    return Object.values(obj).reduce((sum, val) => sum + (Number(val) || 0), 0);
}

/**
 * Array-Elemente unique machen
 * @param {array} array - Eingabe-Array
 * @returns {array} Unique Array
 */
function uniqueArray(array) {
    if (!Array.isArray(array)) return [];
    return [...new Set(array)];
}

/**
 * Sichere Division
 * @param {number} numerator - Zähler
 * @param {number} denominator - Nenner
 * @param {number} defaultValue - Default bei Division durch 0
 * @returns {number} Ergebnis oder Default
 */
function safeDivision(numerator, denominator, defaultValue = 0) {
    if (denominator === 0) return defaultValue;
    return numerator / denominator;
}

module.exports = {
    // Konstanten
    MAX_POINTS_PER_GAME,
    MAX_DIKTAT_LENGTH,
    MAX_DISCORD_TARGET_LENGTH,
    MAX_PARTNER_QUESTIONS,
    MAX_ALLOCATION_VALUE,
    TOTAL_ALLOCATION_POINTS,

    // Datei-Operationen
    readJsonFile,
    readJsonArray,

    // Validierung
    isValidTeamName,
    isValidIndex,
    sanitizeString,

    // Mathematik
    addScore,
    sumObjectValues,
    safeDivision,

    // Array-Operationen
    getRandomElements,
    uniqueArray,

    // Timer
    startTimer,

    // Utility
    deepClone
};
