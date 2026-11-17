'use strict';
// Prueft alle HTML-Seiten: Skript-Syntax, verwaiste Element-IDs, alte Events.
// Aufruf: npm run check:html
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PUBLIC = path.join(__dirname, '..', 'public');
const files = [
    ...fs.readdirSync(PUBLIC).filter(f => f.endsWith('.html')).map(f => path.join(PUBLIC, f)),
    ...fs.readdirSync(path.join(PUBLIC, 'games')).filter(f => f.endsWith('.html')).map(f => path.join(PUBLIC, 'games', f))
];

const OLD_EVENTS = /adminAdd\w*Point|adminAdjust\w*Score|adminReset(?!BingoTimer)\w+|adminLock\w+Buzzer|press\w+Buzzer|adminNext(Promi|Drudel)Image|adminReveal(Promi|Drudel)Name/g;
let problems = 0;

files.forEach(file => {
    const html = fs.readFileSync(file, 'utf8');
    const name = path.relative(PUBLIC, file);
    const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
    scripts.forEach((code, index) => {
        try {
            new vm.Script(code, { filename: `${name}#script${index}` });
        } catch (error) {
            problems++;
            console.log(`SYNTAX ${name} Skript ${index}: ${error.message}`);
        }
    });

    if (name.startsWith('games')) {
        const definedIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
        const code = scripts.join('\n');
        const usedIds = new Set([...code.matchAll(/getElementById\('([^']+)'\)/g)].map(m => m[1]));
        const createdIds = new Set([...code.matchAll(/\.id\s*=\s*['"`]([^'"`]+)['"`]/g)].map(m => m[1]));
        usedIds.forEach(id => {
            if (!definedIds.has(id) && !createdIds.has(id) && !/\$\{/.test(id)) {
                problems++;
                console.log(`ID fehlt ${name}: ${id}`);
            }
        });
        const oldEvents = [...new Set(code.match(OLD_EVENTS) || [])];
        if (oldEvents.length) {
            problems++;
            console.log(`ALTE EVENTS ${name}: ${oldEvents.join(', ')}`);
        }
    }
});

console.log(`${files.length} Dateien geprueft, ${problems} Probleme`);
process.exit(problems ? 1 : 0);
