'use strict';
/**
 * Erzeugt flaggen.json fuer das Spiel "Flaggen bauen".
 * Jede Flagge wird aus einfachen Bauteilen zusammengesetzt (Streifen, Kreise, Sterne, Halbmond, Polygone, ...).
 * Die Original-Flagge entsteht aus genau denselben Bauteilen, die die Spieler im Pool bekommen.
 * Dazu kommen viele Ablenker: Beinahe-Treffer (gleiche Farbe, andere Groesse oder Form, aehnlicher Farbton)
 * und zufaellige falsche Farben und Formen. Neue Flagge: in tools/flaggen-data.js eintragen, dann
 *   node tools/flaggen-builder.js
 * Optional pro Flagge: extras() liefert zusaetzliche Ablenker (z. B. blaues Dreieck bei Kuba).
 * Platzierung: [Bauteil, cx, cy, Drehung]. Alle Masse sind Einheiten auf einer Flaggenflaeche von 300 x 200.
 * Diese Datei enthaelt nur die Bauteile (flaggen-data.js: Flaggen, flaggen-builder.js: Zusammenbau).
 */
const BOARD_W = 300;
const BOARD_H = 200;
const round2 = value => Math.round(value * 100) / 100;

/* ---------- Farben ---------- */
const color = (stem, hex) => ({ stem, hex });
const masc = col => `${col.stem}er`;
const neut = col => `${col.stem}es`;

const WHITE = color('Weiß', '#ffffff');
const BLACK = color('Schwarz', '#000000');

/** Aehnlicher, aber falscher Farbton: dunkle Farben werden heller, helle dunkler. */
function shade(col) {
    const channels = [1, 3, 5].map(index => parseInt(col.hex.slice(index, index + 2), 16));
    const dark = channels.reduce((sum, value) => sum + value, 0) / 3 < 140;
    const mixed = channels.map(value => Math.round(dark ? value + (255 - value) * 0.28 : value * 0.78));
    return color(col.stem, `#${mixed.map(value => value.toString(16).padStart(2, '0')).join('')}`);
}

/* ---------- Bauteile ---------- */
const svgOf = part => {
    const fit = part.stretch ? 'none' : 'xMidYMid meet';
    return `<svg viewBox='0 0 ${part.w} ${part.h}' preserveAspectRatio='${fit}' style='width:100%;height:100%;display:block;'>${part.inner}</svg>`;
};

const makePart = ({ key, name, type, w, h, inner, spec, stretch = false, hex = null, origin = null }) => (
    { key, name, type, w: round2(w), h: round2(h), inner, spec, stretch, hex, origin }
);

const rectInner = (w, h, hex) => `<rect width='${round2(w)}' height='${round2(h)}' fill='${hex}'/>`;
const fractionText = ([n, d]) => `${n}/${d}`;

const stripeH = (col, fraction) => {
    const h = (BOARD_H * fraction[0]) / fraction[1];
    return makePart({ key: `sh|${col.hex}|${fractionText(fraction)}`, name: `${masc(col)} Querstreifen (${fractionText(fraction)})`, type: 'stripe-horizontal', w: BOARD_W, h, inner: rectInner(BOARD_W, h, col.hex), spec: { kind: 'sh', col, fraction }, stretch: true, hex: col.hex });
};

const stripeV = (col, fraction) => {
    const w = (BOARD_W * fraction[0]) / fraction[1];
    return makePart({ key: `sv|${col.hex}|${fractionText(fraction)}`, name: `${masc(col)} Längsstreifen (${fractionText(fraction)})`, type: 'stripe-vertical', w, h: BOARD_H, inner: rectInner(w, BOARD_H, col.hex), spec: { kind: 'sv', col, fraction }, stretch: true, hex: col.hex });
};

const barH = (col, t) => makePart({ key: `bh|${col.hex}|${round2(t)}`, name: `${masc(col)} Querbalken`, type: 'stripe-horizontal', w: BOARD_W, h: t, inner: rectInner(BOARD_W, t, col.hex), spec: { kind: 'bh', col, t }, stretch: true, hex: col.hex });

const barV = (col, t) => makePart({ key: `bv|${col.hex}|${round2(t)}`, name: `${masc(col)} Längsbalken`, type: 'stripe-vertical', w: t, h: BOARD_H, inner: rectInner(t, BOARD_H, col.hex), spec: { kind: 'bv', col, t }, stretch: true, hex: col.hex });

const field = col => makePart({ key: `f|${col.hex}`, name: `${neut(col)} Flaggenfeld`, type: 'field', w: BOARD_W, h: BOARD_H, inner: rectInner(BOARD_W, BOARD_H, col.hex), spec: { kind: 'f', col }, stretch: true, hex: col.hex });

const square = (col, size) => makePart({ key: `sq|${col.hex}|${round2(size)}`, name: `${neut(col)} Quadrat`, type: 'symbol', w: size, h: size, inner: rectInner(size, size, col.hex), spec: { kind: 'sq', col, size }, hex: col.hex });

const disc = (col, r) => makePart({ key: `d|${col.hex}|${round2(r)}`, name: `${masc(col)} Kreis`, type: 'symbol', w: r * 2, h: r * 2, inner: `<circle cx='${r}' cy='${r}' r='${r}' fill='${col.hex}'/>`, spec: { kind: 'd', col, r }, hex: col.hex });

const starPoints = (cx, cy, outer, count, ratio) => Array.from({ length: count * 2 }, (_, i) => {
    const angle = ((-90 + (180 / count) * i) * Math.PI) / 180;
    const radius = i % 2 === 0 ? outer : outer * ratio;
    return `${round2(cx + radius * Math.cos(angle))},${round2(cy + radius * Math.sin(angle))}`;
}).join(' ');

const polyStar = (col, R, count, ratio, label) => makePart({
    key: `ps|${col.hex}|${round2(R)}|${count}`, name: `${masc(col)} ${label}`, type: 'symbol', w: R * 2, h: R * 2,
    inner: `<polygon points='${starPoints(R, R, R, count, ratio)}' fill='${col.hex}'/>`, spec: { kind: 'ps', col, R, count, ratio, label }, hex: col.hex
});

const star = (col, R) => polyStar(col, R, 5, 0.381966, 'Stern');
const star7 = (col, R) => polyStar(col, R, 7, 0.45, 'Stern (7 Zacken)');

/** Halbmond, offen nach rechts. R = aeusserer Radius, r = innerer Radius, d = Versatz des inneren Kreises. */
const crescent = (col, R, r, d) => {
    const x = (d * d + R * R - r * r) / (2 * d);
    const y = Math.sqrt(R * R - x * x);
    const large = x > d ? 1 : 0;
    const top = `${round2(R + x)} ${round2(R - y)}`;
    const bottom = `${round2(R + x)} ${round2(R + y)}`;
    const shape = `M ${top} A ${R} ${R} 0 1 0 ${bottom} A ${r} ${r} 0 ${large} 1 ${top} Z`;
    return makePart({ key: `cr|${col.hex}|${round2(R)}|${round2(r)}`, name: `${masc(col)} Halbmond`, type: 'symbol', w: R * 2, h: R * 2, inner: `<path d='${shape}' fill='${col.hex}'/>`, spec: { kind: 'cr', col, R, r, d }, hex: col.hex });
};

/** Dreieck an der linken Kante, Spitze nach rechts. */
const triangle = (col, w, h) => makePart({ key: `tr|${col.hex}|${round2(w)}x${round2(h)}`, name: `${neut(col)} Dreieck`, type: 'symbol', w, h, inner: `<polygon points='0,0 ${round2(w)},${round2(h / 2)} 0,${round2(h)}' fill='${col.hex}'/>`, spec: { kind: 'tr', col, w, h }, hex: col.hex });

const cross = (col, L, t) => {
    const offset = (L - t) / 2;
    const inner = `<rect x='${round2(offset)}' width='${round2(t)}' height='${round2(L)}' fill='${col.hex}'/><rect y='${round2(offset)}' width='${round2(L)}' height='${round2(t)}' fill='${col.hex}'/>`;
    return makePart({ key: `x|${col.hex}|${round2(L)}|${round2(t)}`, name: `${neut(col)} Kreuz`, type: 'symbol', w: L, h: L, inner, spec: { kind: 'x', col, L, t }, hex: col.hex });
};

/** Sternumriss (Pentagramm), wie auf der Flagge von Marokko. */
const pentagram = (col, R, stroke) => {
    const size = R * 2 + stroke * 3;
    const center = size / 2;
    const corner = k => {
        const angle = ((-90 + 72 * k) * Math.PI) / 180;
        return `${round2(center + R * Math.cos(angle))} ${round2(center + R * Math.sin(angle))}`;
    };
    const shape = `M ${corner(0)} L ${corner(2)} L ${corner(4)} L ${corner(1)} L ${corner(3)} Z`;
    return makePart({ key: `pg|${col.hex}|${R}`, name: `${masc(col)} Sternumriss`, type: 'symbol', w: size, h: size, inner: `<path d='${shape}' fill='none' stroke='${col.hex}' stroke-width='${stroke}' stroke-linejoin='miter' stroke-miterlimit='10'/>`, spec: { kind: 'pg', col, R, stroke }, hex: col.hex });
};

/**
 * Beliebiges Vieleck. points in Flaggen-Einheiten (300 x 200). Das Teil bekommt die Groesse der Huelle,
 * origin merkt sich die linke obere Ecke, damit place() es richtig auf der Flagge platziert.
 */
const POLYGON_ENDINGS = { Raute: 'e', 'Y-Form': 'e', Keil: 'er' };

const polygon = (col, points, label, id) => {
    const xs = points.map(point => point[0]);
    const ys = points.map(point => point[1]);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const w = Math.max(...xs) - minX;
    const h = Math.max(...ys) - minY;
    const shifted = points.map(([x, y]) => `${round2(x - minX)},${round2(y - minY)}`).join(' ');
    return makePart({ key: `poly|${id}|${col.hex}`, name: `${col.stem}${POLYGON_ENDINGS[label.split(' ')[0]] || 'es'} ${label}`, type: 'symbol', w, h, inner: `<polygon points='${shifted}' fill='${col.hex}'/>`, spec: { kind: 'poly', col, points, label, id }, hex: col.hex, origin: { x: minX, y: minY } });
};

/** Sol de Mayo (Argentinien): Sonne mit Gesicht und 32 Strahlen. */
const sun = () => {
    const gold = '#f6b40e';
    const brown = '#85340a';
    const half = 40;
    const point = (radius, theta) => `${round2(half + radius * Math.cos(theta))},${round2(half + radius * Math.sin(theta))}`;
    const rays = Array.from({ length: 32 }, (_, k) => {
        const angle = (k * 11.25 * Math.PI) / 180;
        const tip = k % 2 === 0 ? 39 : 30;
        const spread = (k % 2 === 0 ? 3.4 : 3.8) * (Math.PI / 180);
        return `<polygon points='${point(15, angle - spread)} ${point(tip, angle)} ${point(15, angle + spread)}' fill='${gold}'/>`;
    }).join('');
    const face = `<circle cx='${half}' cy='${half}' r='16' fill='${gold}' stroke='${brown}' stroke-width='1.2'/><circle cx='${half - 5.5}' cy='${half - 3}' r='1.9' fill='${brown}'/><circle cx='${half + 5.5}' cy='${half - 3}' r='1.9' fill='${brown}'/><path d='M ${half - 6} ${half + 5.5} Q ${half} ${half + 10.5} ${half + 6} ${half + 5.5}' stroke='${brown}' stroke-width='1.6' fill='none' stroke-linecap='round'/>`;
    return makePart({ key: 'sun-may', name: 'Mai-Sonne (Sol de Mayo)', type: 'symbol', w: 80, h: 80, inner: rays + face });
};

/* ---------- Union Jack (Geometrie nach der Standard-Konstruktion, 60 x 30) ---------- */
const UK_BLUE = '#012169';
const UK_RED = '#c8102e';
const UK_LAYERS = {
    blue: { label: 'Blaues Flaggenfeld', content: `<rect width='60' height='30' fill='${UK_BLUE}'/>` },
    whiteSaltire: { label: 'Weißes Diagonalkreuz', content: `<path d='M0,0 L60,30 M60,0 L0,30' stroke='#fff' stroke-width='6'/>` },
    redSaltire: { label: 'Rotes Diagonalkreuz', content: `<clipPath id='ukclip'><path d='M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z'/></clipPath><path d='M0,0 L60,30 M60,0 L0,30' clip-path='url(#ukclip)' stroke='${UK_RED}' stroke-width='4'/>` },
    whiteCross: { label: 'Weißes Kreuz', content: `<path d='M30,0 v30 M0,15 h60' stroke='#fff' stroke-width='10'/>` },
    redCross: { label: 'Rotes Kreuz', content: `<path d='M30,0 v30 M0,15 h60' stroke='${UK_RED}' stroke-width='6'/>` }
};
UK_LAYERS.all = { label: 'Union Jack', content: ['blue', 'whiteSaltire', 'redSaltire', 'whiteCross', 'redCross'].map(name => UK_LAYERS[name].content).join('') };

const ukPart = (layer, w, h) => makePart({
    key: `uk|${layer}|${w}x${h}`, name: UK_LAYERS[layer].label, type: w >= BOARD_W ? 'field' : 'symbol', w, h, stretch: true,
    inner: `<svg width='${w}' height='${h}' viewBox='0 0 60 30' preserveAspectRatio='none'>${UK_LAYERS[layer].content}</svg>`
});

/* ---------- Platzierung ---------- */

/** Platzierung mit Mitte in Einheiten (300 x 200). rotation in Grad (Vielfache von 90). */
const at = (part, x, y, rotation = 0) => [part, x / BOARD_W, y / BOARD_H, rotation];

/** Platziert ein Vieleck-Teil dort, wo seine Punkte definiert wurden. */
const place = part => at(part, part.origin.x + part.w / 2, part.origin.y + part.h / 2);

/** Streifen nacheinander stapeln. Liefert Platzierungen (cx, cy = Mitte, 0..1). */
function stack(direction, list) {
    let used = 0;
    return list.map(([col, fraction]) => {
        const part = direction === 'H' ? stripeH(col, fraction) : stripeV(col, fraction);
        const size = direction === 'H' ? part.h : part.w;
        const center = (used + size / 2) / (direction === 'H' ? BOARD_H : BOARD_W);
        used += size;
        return direction === 'H' ? [part, 0.5, center, 0] : [part, center, 0.5, 0];
    });
}

/** Nordisches Kreuz aus zwei Balken. cx in Bruchteilen der Breite. */
function nordic(col, { verticalThickness, horizontalThickness, cx }) {
    return [[barV(col, verticalThickness), cx, 0.5, 0], [barH(col, horizontalThickness), 0.5, 0.5, 0]];
}

const full = part => [part, 0.5, 0.5, 0];

module.exports = {
    BOARD_W, BOARD_H, round2, color, masc, neut, WHITE, BLACK, shade, svgOf, fractionText,
    stripeH, stripeV, barH, barV, field, square, disc, polyStar, star, star7, crescent, triangle, cross, pentagram, polygon, sun, ukPart,
    at, place, stack, nordic, full
};
