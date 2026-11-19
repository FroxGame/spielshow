'use strict';
/**
 * Baut flaggen.json fuer das Spiel "Flaggen bauen" aus tools/flaggen-data.js (Flaggen) und
 * tools/flaggen-parts.js (Bauteile). Aufruf:  node tools/flaggen-builder.js
 * Zu jeder Flagge kommen viele Ablenker in den Pool: wenige Beinahe-Treffer der echten Teile (andere Groesse,
 * Form oder Zackenzahl, nie nur ein anderer Farbton) und viele ganz falsche Farben und Symbole (keine Kreise).
 */
const fs = require('fs');
const path = require('path');
const {
    BOARD_W, BOARD_H, round2, color, svgOf, fractionText,
    stripeH, stripeV, barH, barV, square, polyStar, star, star7, crescent, triangle, cross, pentagram, polygon
} = require('./flaggen-parts');
const { FLAGS } = require('./flaggen-data');

const MAX_NEAR_MISSES = 1;
const DECOY_STRIPE_COUNT = 2;
const DECOY_SYMBOL_COUNT = 2;
const DIFFICULTY_ORDER = ['Sehr leicht', 'Leicht', 'Mittel', 'Schwer', 'Sehr schwer'];
const FRACTIONS = [[1, 2], [1, 3], [1, 4], [1, 5], [1, 6]];

/* ---------- Beinahe-Treffer ---------- */

const otherFraction = fraction => FRACTIONS.find(entry => fractionText(entry) !== fractionText(fraction));

/**
 * Falsche Varianten eines echten Teils in der Form, nicht im Farbton: anderer Bruchteil, andere Ausrichtung,
 * andere Groesse oder Zackenzahl. Aehnliche Farbtoene waeren kein fairer Ablenker.
 */
function variantsOf(part) {
    const s = part.spec;
    if (!s) return [];
    switch (s.kind) {
        case 'sh': return [stripeH(s.col, otherFraction(s.fraction)), stripeV(s.col, s.fraction)];
        case 'sv': return [stripeV(s.col, otherFraction(s.fraction)), stripeH(s.col, s.fraction)];
        case 'bh': return [barH(s.col, s.t * 1.7), barV(s.col, s.t)];
        case 'bv': return [barV(s.col, s.t * 1.7), barH(s.col, s.t)];
        case 'sq': return [square(s.col, s.size * 0.7)];
        case 'd': return [star(s.col, s.r)];
        case 'ps': return [polyStar(s.col, s.R * 1.5, s.count, s.ratio, s.label), polyStar(s.col, s.R, s.count === 5 ? 6 : 5, s.ratio, 'Stern (anders)')];
        case 'cr': return [crescent(s.col, s.R * 0.7, s.r * 0.7, s.d * 0.7)];
        case 'tr': return [triangle(s.col, s.w * 0.7, s.h * 0.8)];
        case 'x': return [cross(s.col, s.L, s.t * 0.6)];
        case 'pg': return [star(s.col, s.R)];
        default: return [];
    }
}

const shapeOf = part => `${part.key.split('|')[0]}|${part.hex}`;

/**
 * Reihum je ein Beinahe-Treffer pro echtem Teil. Varianten, die wie ein vorhandenes Teil aussehen
 * (gleiche Form und Farbe, nur anders gross), werden uebersprungen, damit der Pool nicht voller Zwillinge ist.
 */
function pickNearMisses(used) {
    const seen = new Set(used.map(shapeOf));
    const lists = used.map(variantsOf);
    const picked = [];
    for (let round = 0; round < 3 && picked.length < MAX_NEAR_MISSES; round++) {
        for (const list of lists) {
            const candidate = list[round];
            if (!candidate || seen.has(shapeOf(candidate)) || picked.length >= MAX_NEAR_MISSES) continue;
            seen.add(shapeOf(candidate));
            picked.push(candidate);
        }
    }
    return picked;
}

/** Grobe Farbfamilie, damit ein "falsches" Blau nicht wie das echte Blau aussieht. */
function familyOf(hex) {
    const [r, g, b] = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (min > 0.85) return 'weiss';
    if (max < 0.25) return 'schwarz';
    if (max - min < 0.12) return 'grau';
    const delta = max - min;
    let hue = 60 * (max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4);
    if (hue < 0) hue += 360;
    const bounds = [[15, 'rot'], [40, 'orange'], [70, 'gelb'], [170, 'gruen'], [200, 'tuerkis'], [260, 'blau'], [300, 'violett'], [345, 'rosa']];
    const found = bounds.find(([limit]) => hue < limit);
    return found ? found[1] : 'rot';
}

/* ---------- Zufaellige Ablenker ---------- */

const DECOY_COLORS = [
    color('Rot', '#d62828'), color('Blau', '#1d4ed8'), color('Grün', '#1b9e4b'), color('Gelb', '#fcd116'),
    color('Schwarz', '#111111'), color('Weiß', '#ffffff'), color('Orang', '#f57c00'),
    color('Violett', '#7b2cbf'), color('Braun', '#8b5a2b'), color('Rosafarben', '#e75480')
];

const rhombus = col => polygon(col, [[100, 0], [200, 60], [100, 120], [0, 60]], 'Raute', 'rhombus');

/** Falsche Symbole (keine Kreise): jeweils in einer Farbe, die auf der echten Flagge nicht vorkommt. */
const DECOY_SYMBOLS = [
    col => star(col, 30),
    col => crescent(col, 40, 32, 10),
    col => triangle(col, 130, 200),
    col => cross(col, 110, 30),
    col => square(col, 90),
    col => rhombus(col),
    col => star7(col, 28),
    col => pentagram(col, 36, 8),
    col => star(col, 18)
];

function seededShuffle(list, seed) {
    const result = [...list];
    let state = seed * 9301 + 49297;
    for (let i = result.length - 1; i > 0; i--) {
        state = (state * 9301 + 49297) % 233280;
        const j = Math.floor((state / 233280) * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

/** Bauteile ohne eine einzelne Farbe (Union Jack, Sonne) melden ihre Farbfamilien selbst. */
const FAMILIES_WITHOUT_HEX = { uk: ['blau', 'weiss', 'rot'], 'sun-may': ['gelb', 'orange'] };

/** Farben aus Familien, die auf der echten Flagge nicht vorkommen, in wiederholbarer Zufallsreihenfolge. */
function freeColorsFor(used, index) {
    const usedFamilies = new Set(used.flatMap(part => (part.hex ? [familyOf(part.hex)] : FAMILIES_WITHOUT_HEX[part.key.split('|')[0]] || [])));
    const free = DECOY_COLORS.filter(col => !usedFamilies.has(familyOf(col.hex)));
    return seededShuffle(free.length ? free : DECOY_COLORS, index + 7);
}

/** Gleiche Vielecke wie die echten Teile, aber in deutlich falscher Farbe (Flaggen mit shapeDecoys). */
function pickShapeDecoys(used, index) {
    const colors = freeColorsFor(used, index);
    return used.filter(part => part.spec && part.spec.kind === 'poly').slice(0, colors.length)
        .map((part, i) => polygon(colors[i], part.spec.points, part.spec.label, `-falsch`));
}

/** Ganz falsche Streifen und Symbole: Farben aus Familien, die auf der echten Flagge nicht vorkommen. */
function pickRandomDecoys(used, index) {
    const usedShapes = new Set(used.map(shapeOf));
    const freeColors = freeColorsFor(used, index);
    const firstStripe = used.find(part => part.type === 'stripe-horizontal' || part.type === 'stripe-vertical');
    const vertical = firstStripe && firstStripe.type === 'stripe-vertical';
    const stripes = freeColors.slice(0, DECOY_STRIPE_COUNT).map(col => (vertical ? stripeV(col, [1, 3]) : stripeH(col, [1, 3])));
    const symbols = [];
    for (let step = 0; step < DECOY_SYMBOLS.length && symbols.length < DECOY_SYMBOL_COUNT; step++) {
        const col = freeColors[(symbols.length + step) % freeColors.length];
        const part = DECOY_SYMBOLS[(index * 3 + step) % DECOY_SYMBOLS.length](col);
        if (!usedShapes.has(shapeOf(part)) && !symbols.some(entry => shapeOf(entry) === shapeOf(part))) symbols.push(part);
    }
    return [...stripes, ...symbols];
}

/* ---------- Ausgabe ---------- */

function toElement(roundId, part) {
    return {
        id: `${roundId}-${part.key.replace(/[^a-z0-9]+/gi, '-')}`,
        name: part.name,
        type: part.type,
        defaultWidth: round2((part.w / BOARD_W) * 100),
        defaultHeight: round2((part.h / BOARD_H) * 100),
        color: part.hex || undefined,
        svg: svgOf(part)
    };
}

function toTargetFlag(placements) {
    const pieces = placements.map(([part, cx, cy, rotation]) => {
        const grow = part.stretch ? 0.6 : 0;
        const centerX = round2(cx * BOARD_W);
        const centerY = round2(cy * BOARD_H);
        const fit = part.stretch ? 'none' : 'xMidYMid meet';
        const piece = `<svg x='${round2(centerX - part.w / 2)}' y='${round2(centerY - part.h / 2)}' width='${round2(part.w + grow)}' height='${round2(part.h + grow)}' viewBox='0 0 ${part.w} ${part.h}' preserveAspectRatio='${fit}' overflow='visible'>${part.inner}</svg>`;
        return rotation ? `<g transform='rotate(${rotation} ${centerX} ${centerY})'>${piece}</g>` : piece;
    });
    return `<svg viewBox='0 0 ${BOARD_W} ${BOARD_H}' style='width:100%;height:100%;display:block;'>${pieces.join('')}</svg>`;
}

function buildRound(flag, index) {
    const placements = flag.parts();
    const used = [];
    placements.forEach(([part]) => { if (!used.some(entry => entry.key === part.key)) used.push(part); });
    const extras = flag.extras ? flag.extras() : [];
    const known = [...used, ...extras];
    const nearMisses = pickNearMisses(used).filter(part => !extras.some(extra => extra.key === part.key));
    const randomDecoys = flag.shapeDecoys ? pickShapeDecoys(used, index) : pickRandomDecoys([...known, ...nearMisses], index);
    const parts = seededShuffle([...used, ...extras, ...nearMisses, ...randomDecoys], index + 1);
    return {
        id: flag.id,
        country: flag.country,
        difficulty: flag.difficulty,
        targetFlag: toTargetFlag(placements),
        elements: parts.map(part => toElement(flag.id, part))
    };
}

function buildAll() {
    return FLAGS.map(buildRound).sort((a, b) => DIFFICULTY_ORDER.indexOf(a.difficulty) - DIFFICULTY_ORDER.indexOf(b.difficulty));
}

if (require.main === module) {
    const rounds = buildAll();
    fs.writeFileSync(path.join(__dirname, '..', 'flaggen.json'), `${JSON.stringify({ rounds }, null, 2)}\n`);
    console.log(`${rounds.length} Flaggen nach flaggen.json geschrieben.`);
}

module.exports = { buildAll };
