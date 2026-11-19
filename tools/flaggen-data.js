'use strict';
/**
 * Die Flaggen fuer "Flaggen bauen". Jeder Eintrag: id, country, difficulty und parts() mit den Platzierungen
 * [Bauteil, cx, cy, Drehung] der Original-Flagge (cx, cy = Mitte, 0..1). Bauteile: flaggen-parts.js.
 */
const {
    BOARD_W, BOARD_H, round2, color, WHITE, BLACK,
    stripeH, field, square, disc, star, star7, crescent, triangle, cross, pentagram, polygon, sun, ukPart,
    at, place, stack, nordic, full
} = require('./flaggen-parts');

const third = [1, 3];
const half = [1, 2];
const thirds = (direction, a, b, c) => stack(direction, [[a, third], [b, third], [c, third]]);

const FLAGS = [
    { id: 'deutschland', country: 'Deutschland', difficulty: 'Sehr leicht', parts: () => thirds('H', BLACK, color('Rot', '#dd0000'), color('Golden', '#ffce00')) },
    { id: 'frankreich', country: 'Frankreich', difficulty: 'Sehr leicht', parts: () => thirds('V', color('Blau', '#0055a4'), WHITE, color('Rot', '#ef4135')) },
    { id: 'italien', country: 'Italien', difficulty: 'Sehr leicht', parts: () => thirds('V', color('Grün', '#009246'), WHITE, color('Rot', '#ce2b37')) },
    { id: 'japan', country: 'Japan', difficulty: 'Sehr leicht', parts: () => [full(field(WHITE)), full(disc(color('Rot', '#bc002d'), 60))] },
    { id: 'schweiz', country: 'Schweiz', difficulty: 'Sehr leicht', parts: () => [full(field(color('Rot', '#da291c'))), full(cross(WHITE, 120, 36))] },
    { id: 'polen', country: 'Polen', difficulty: 'Sehr leicht', parts: () => stack('H', [[WHITE, half], [color('Rot', '#dc143c'), half]]) },
    { id: 'oesterreich', country: 'Österreich', difficulty: 'Sehr leicht', parts: () => thirds('H', color('Rot', '#ed2939'), WHITE, color('Rot', '#ed2939')) },
    { id: 'niederlande', country: 'Niederlande', difficulty: 'Leicht', parts: () => thirds('H', color('Rot', '#ae1c28'), WHITE, color('Blau', '#21468b')) },
    { id: 'belgien', country: 'Belgien', difficulty: 'Leicht', parts: () => thirds('V', BLACK, color('Gelb', '#fae042'), color('Rot', '#ed2939')) },
    { id: 'irland', country: 'Irland', difficulty: 'Leicht', parts: () => thirds('V', color('Grün', '#169b62'), WHITE, color('Orang', '#ff883e')) },
    { id: 'ungarn', country: 'Ungarn', difficulty: 'Leicht', parts: () => thirds('H', color('Rot', '#cd2a3e'), WHITE, color('Grün', '#436f4d')) },
    { id: 'ukraine', country: 'Ukraine', difficulty: 'Leicht', parts: () => stack('H', [[color('Blau', '#0057b7'), half], [color('Gelb', '#ffd700'), half]]) },
    { id: 'russland', country: 'Russland', difficulty: 'Leicht', parts: () => thirds('H', WHITE, color('Blau', '#0039a6'), color('Rot', '#d52b1e')) },
    { id: 'bulgarien', country: 'Bulgarien', difficulty: 'Leicht', parts: () => thirds('H', WHITE, color('Grün', '#00966e'), color('Rot', '#d62612')) },
    { id: 'estland', country: 'Estland', difficulty: 'Leicht', parts: () => thirds('H', color('Blau', '#0072ce'), BLACK, WHITE) },
    { id: 'litauen', country: 'Litauen', difficulty: 'Leicht', parts: () => thirds('H', color('Gelb', '#fdb913'), color('Grün', '#006a44'), color('Rot', '#c1272d')) },
    { id: 'kolumbien', country: 'Kolumbien', difficulty: 'Leicht', parts: () => stack('H', [[color('Gelb', '#fcd116'), half], [color('Blau', '#003893'), [1, 4]], [color('Rot', '#ce1126'), [1, 4]]]) },
    { id: 'nigeria', country: 'Nigeria', difficulty: 'Leicht', parts: () => thirds('V', color('Grün', '#008751'), WHITE, color('Grün', '#008751')) },
    { id: 'peru', country: 'Peru', difficulty: 'Leicht', parts: () => thirds('V', color('Rot', '#d91023'), WHITE, color('Rot', '#d91023')) },
    { id: 'armenien', country: 'Armenien', difficulty: 'Leicht', parts: () => thirds('H', color('Rot', '#d90012'), color('Blau', '#0033a0'), color('Orang', '#f2a800')) },
    {
        id: 'schweden', country: 'Schweden', difficulty: 'Leicht',
        parts: () => [full(field(color('Blau', '#006aa7'))), ...nordic(color('Gelb', '#fecc00'), { verticalThickness: 37.5, horizontalThickness: 40, cx: 7 / 16 })]
    },
    {
        id: 'daenemark', country: 'Dänemark', difficulty: 'Leicht',
        parts: () => [full(field(color('Rot', '#c8102e'))), ...nordic(WHITE, { verticalThickness: 32.4, horizontalThickness: 28.6, cx: 14 / 37 })]
    },
    {
        id: 'finnland', country: 'Finnland', difficulty: 'Leicht',
        parts: () => [full(field(WHITE)), ...nordic(color('Blau', '#003580'), { verticalThickness: 50, horizontalThickness: 54.5, cx: 6.5 / 18 })]
    },
    { id: 'bangladesch', country: 'Bangladesch', difficulty: 'Leicht', parts: () => [full(field(color('Grün', '#006a4e'))), at(disc(color('Rot', '#f42a41'), 60), 135, 100)] },
    {
        id: 'kuba', country: 'Kuba', difficulty: 'Mittel',
        parts: () => {
            const blue = color('Blau', '#002a8f');
            const width = round2(BOARD_H * 0.866);
            return [
                ...stack('H', [[blue, [1, 5]], [WHITE, [1, 5]], [blue, [1, 5]], [WHITE, [1, 5]], [blue, [1, 5]]]),
                at(triangle(color('Rot', '#cf142b'), width, BOARD_H), width / 2, 100),
                at(star(WHITE, 45), width / 3, 100)
            ];
        },
        extras: () => [triangle(color('Blau', '#002a8f'), round2(BOARD_H * 0.866), BOARD_H)]
    },
    {
        id: 'tschechien', country: 'Tschechien', difficulty: 'Mittel',
        parts: () => [...stack('H', [[WHITE, half], [color('Rot', '#d7141a'), half]]), at(triangle(color('Blau', '#11457e'), 150, BOARD_H), 75, 100)]
    },
    {
        id: 'norwegen', country: 'Norwegen', difficulty: 'Mittel',
        parts: () => [
            full(field(color('Rot', '#ba0c2f'))),
            ...nordic(WHITE, { verticalThickness: 54.5, horizontalThickness: 50, cx: 8 / 22 }),
            ...nordic(color('Dunkelblau', '#00205b'), { verticalThickness: 27.3, horizontalThickness: 25, cx: 8 / 22 })
        ]
    },
    {
        id: 'island', country: 'Island', difficulty: 'Mittel',
        parts: () => [
            full(field(color('Blau', '#02529c'))),
            ...nordic(WHITE, { verticalThickness: 48, horizontalThickness: 44.4, cx: 9 / 25 }),
            ...nordic(color('Rot', '#dc1e35'), { verticalThickness: 24, horizontalThickness: 22.2, cx: 9 / 25 })
        ]
    },
    { id: 'vietnam', country: 'Vietnam', difficulty: 'Mittel', parts: () => [full(field(color('Rot', '#da251d'))), full(star(color('Gelb', '#ffff00'), 62))] },
    {
        id: 'ghana', country: 'Ghana', difficulty: 'Mittel',
        parts: () => [...thirds('H', color('Rot', '#ce1126'), color('Gelb', '#fcd116'), color('Grün', '#006b3f')), full(star(BLACK, 45))]
    },
    { id: 'lettland', country: 'Lettland', difficulty: 'Mittel', parts: () => stack('H', [[color('Dunkelrot', '#9e3039'), [2, 5]], [WHITE, [1, 5]], [color('Dunkelrot', '#9e3039'), [2, 5]]]) },
    {
        id: 'thailand', country: 'Thailand', difficulty: 'Mittel',
        parts: () => {
            const red = color('Rot', '#a51931');
            const white = color('Weiß', '#f4f5f8');
            return stack('H', [[red, [1, 6]], [white, [1, 6]], [color('Dunkelblau', '#2d2a4a'), third], [white, [1, 6]], [red, [1, 6]]]);
        }
    },
    {
        id: 'chile', country: 'Chile', difficulty: 'Mittel',
        parts: () => [...stack('H', [[WHITE, half], [color('Rot', '#d52b1e'), half]]), at(square(color('Blau', '#0039a6'), 100), 50, 50), at(star(WHITE, 32), 50, 50)]
    },
    {
        id: 'tuerkei', country: 'Türkei', difficulty: 'Mittel',
        parts: () => [full(field(color('Rot', '#e30a17'))), at(crescent(WHITE, 50, 40, 12.5), 100, 100), at(star(WHITE, 25), 139, 100)]
    },
    { id: 'marokko', country: 'Marokko', difficulty: 'Mittel', parts: () => [full(field(color('Rot', '#c1272d'))), full(pentagram(color('Grün', '#006233'), 46, 8))] },
    {
        id: 'singapur', country: 'Singapur', difficulty: 'Schwer',
        parts: () => {
            const ringStar = star(WHITE, 9);
            const ring = Array.from({ length: 5 }, (_, k) => {
                const angle = ((-90 + 72 * k) * Math.PI) / 180;
                return at(ringStar, 97 + 21 * Math.cos(angle), 50 + 21 * Math.sin(angle));
            });
            return [...stack('H', [[color('Rot', '#ed2939'), half], [WHITE, half]]), at(crescent(WHITE, 34, 28, 10), 66, 50), ...ring];
        }
    },
    {
        id: 'argentinien', country: 'Argentinien', difficulty: 'Schwer',
        parts: () => {
            const blue = color('Hellblau', '#74acdf');
            return [...thirds('H', blue, WHITE, blue), full(sun())];
        }
    },
    {
        id: 'jamaika', country: 'Jamaika', difficulty: 'Schwer',
        parts: () => {
            const d = 22; // halbe Breite des goldenen Diagonalkreuzes (senkrecht gemessen)
            const topWidth = BOARD_W - 3 * d;
            const topHeight = BOARD_H / 2 - d;
            const sideWidth = BOARD_W / 2 - 1.5 * d;
            const sideHeight = BOARD_H - 2 * d;
            const green = color('Grün', '#009b3a');
            const top = polygon(green, [[0, 0], [topWidth, 0], [topWidth / 2, topHeight]], 'Dreieck (Spitze unten)', 'jm-top');
            const side = triangle(BLACK, sideWidth, sideHeight);
            return [
                full(field(color('Golden', '#fed100'))),
                at(top, BOARD_W / 2, topHeight / 2), at(top, BOARD_W / 2, BOARD_H - topHeight / 2, 180),
                at(side, sideWidth / 2, BOARD_H / 2), at(side, BOARD_W - sideWidth / 2, BOARD_H / 2, 180)
            ];
        }
    },
    {
        id: 'katar', country: 'Katar', difficulty: 'Schwer',
        parts: () => {
            const edge = Array.from({ length: 19 }, (_, k) => [k % 2 ? 118 : 88, (k * BOARD_H) / 18]);
            const maroon = polygon(color('Kastanienbraun', '#8a1538'), [[BOARD_W, 0], ...edge, [BOARD_W, BOARD_H]], 'Feld mit 9 Zacken', 'katar');
            return [full(field(WHITE)), place(maroon)];
        }
    },
    {
        id: 'algerien', country: 'Algerien', difficulty: 'Schwer',
        parts: () => {
            const red = color('Rot', '#d21034');
            return [...stack('V', [[color('Grün', '#006233'), half], [WHITE, half]]), at(crescent(red, 50, 40, 14), 148, 100), at(star(red, 22), 170, 100)];
        }
    },
    {
        id: 'togo', country: 'Togo', difficulty: 'Schwer',
        parts: () => {
            const green = color('Grün', '#006a4e');
            const yellow = color('Gelb', '#ffce00');
            const fifth = [1, 5];
            return [
                ...stack('H', [[green, fifth], [yellow, fifth], [green, fifth], [yellow, fifth], [green, fifth]]),
                at(square(color('Rot', '#d21034'), 120), 60, 60), at(star(WHITE, 40), 60, 60)
            ];
        }
    },
    {
        id: 'tunesien', country: 'Tunesien', difficulty: 'Schwer',
        parts: () => {
            const red = color('Rot', '#e70013');
            return [full(field(red)), full(disc(WHITE, 60)), at(crescent(red, 38, 30, 10), 143, 100), at(star(red, 22), 163, 100)];
        }
    },
    {
        id: 'mauretanien', country: 'Mauretanien', difficulty: 'Schwer',
        parts: () => {
            const gold = color('Golden', '#ffc400');
            const red = color('Rot', '#d01c1f');
            return [
                full(field(color('Grün', '#006233'))),
                at(stripeH(red, [1, 10]), 150, 10), at(stripeH(red, [1, 10]), 150, 190),
                at(crescent(gold, 48, 40, 14), 150, 112, 270), at(star(gold, 17), 150, 88)
            ];
        }
    },
    {
        id: 'griechenland', country: 'Griechenland', difficulty: 'Sehr schwer',
        parts: () => {
            const blue = color('Blau', '#0d5eaf');
            const nine = [1, 9];
            const size = round2((BOARD_H * 5) / 9);
            const stripes = stack('H', Array.from({ length: 9 }, (_, k) => [k % 2 ? WHITE : blue, nine]));
            return [...stripes, at(square(blue, size), size / 2, size / 2), at(cross(WHITE, size, round2(BOARD_H / 9)), size / 2, size / 2)];
        }
    },
    {
        id: 'liberia', country: 'Liberia', difficulty: 'Sehr schwer',
        parts: () => {
            const eleven = [1, 11];
            const size = round2((BOARD_H * 5) / 11);
            const stripes = stack('H', Array.from({ length: 11 }, (_, k) => [k % 2 ? WHITE : color('Rot', '#bf0a30'), eleven]));
            return [...stripes, at(square(color('Blau', '#002868'), size), size / 2, size / 2), at(star(WHITE, 32), size / 2, size / 2)];
        }
    },
    {
        id: 'seychellen', country: 'Seychellen', difficulty: 'Sehr schwer', shapeDecoys: true,
        parts: () => {
            const corner = [0, BOARD_H];
            const wedge = (col, a, b, id) => place(polygon(col, [corner, a, b], 'Keil', id));
            return [
                wedge(color('Blau', '#003f87'), [0, 0], [100, 0], 'sc1'),
                wedge(color('Gelb', '#fcd856'), [100, 0], [BOARD_W, 0], 'sc2'),
                wedge(color('Rot', '#d62828'), [BOARD_W, 0], [BOARD_W, 67], 'sc3'),
                wedge(WHITE, [BOARD_W, 67], [BOARD_W, 133], 'sc4'),
                wedge(color('Grün', '#007a3d'), [BOARD_W, 133], [BOARD_W, BOARD_H], 'sc5')
            ];
        }
    },
    {
        id: 'suedafrika', country: 'Südafrika', difficulty: 'Sehr schwer',
        parts: () => {
            const notch = 26.7; // senkrechte Dicke der gruenen Arme
            const yShape = (grow, id, col) => {
                const a = grow / 0.832;
                const junction = 1.5 * (80 - grow + a);
                const apex = (BOARD_H - 2 * (notch + a)) * 0.75;
                const points = [[0, 0], [1.5 * a, 0], [junction, 80 - grow], [BOARD_W, 80 - grow], [BOARD_W, 120 + grow], [junction, 120 + grow],
                    [1.5 * a, BOARD_H], [0, BOARD_H], [0, BOARD_H - notch - a], [apex, 100], [0, notch + a]];
                return place(polygon(col, points, 'Y-Form', id));
            };
            const tri = (inset, col, id) => place(polygon(col, [[0, inset], [(BOARD_H - 2 * inset) * 0.75, 100], [0, BOARD_H - inset]], 'Dreieck', id));
            return [
                ...stack('H', [[color('Rot', '#de3831'), half], [color('Blau', '#002395'), half]]),
                yShape(9, 'za-white', WHITE), yShape(0, 'za-green', color('Grün', '#007a4d')),
                tri(notch, color('Golden', '#ffb612'), 'za-gold'), tri(notch + 10, BLACK, 'za-black')
            ];
        }
    },
    {
        id: 'australien', country: 'Australien', difficulty: 'Sehr schwer',
        parts: () => {
            const crossStar = star7(WHITE, 11);
            const spots = [[225, 28], [225, 176], [187, 98], [262, 74]];
            return [
                full(field(color('Dunkelblau', '#012169'))),
                at(ukPart('all', 150, 100), 75, 50),
                at(star7(WHITE, 30), 75, 150),
                ...spots.map(([x, y]) => at(crossStar, x, y)),
                at(star(WHITE, 6), 247, 116)
            ];
        },
        extras: () => [ukPart('redCross', 150, 100)]
    },
    {
        id: 'grossbritannien', country: 'Vereinigtes Königreich', difficulty: 'Sehr schwer',
        parts: () => ['blue', 'whiteSaltire', 'redSaltire', 'whiteCross', 'redCross'].map(layer => full(ukPart(layer, BOARD_W, BOARD_H)))
    }
];

module.exports = { FLAGS };
