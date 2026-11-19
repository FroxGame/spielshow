/* Gemeinsamer Diagramm-Baustein fuer das Spiel "Diagramme" (Admin, Spieler, Zuschauer).
   Zeichnet das vorgegebene Diagramm, die Loesung und die Teamlinien auf ein Canvas.
   Koordinaten der Zeichnungen: u = Position (0..1 ueber alle Werte), v = Hoehe (0..1 ueber die Achse). */
(function () {
    'use strict';

    const WIDTH = 1000;
    const HEIGHT = 560;
    const PAD = { left: 84, right: 24, top: 40, bottom: 48 };
    const PLOT_WIDTH = WIDTH - PAD.left - PAD.right;
    const PLOT_HEIGHT = HEIGHT - PAD.top - PAD.bottom;
    const Y_TICKS = 5;
    const MAX_X_LABELS = 6;
    const COLORS = { background: '#1c202c', grid: '#333b52', text: '#a4b0be', original: '#e8ecf4', solution: '#ffd166' };

    const formatNumber = (value, digits = 1) => Number(value).toLocaleString('de-DE', { maximumFractionDigits: digits });
    const toX = u => PAD.left + u * PLOT_WIDTH;
    const toY = v => PAD.top + (1 - v) * PLOT_HEIGHT;

    function strokeLine(ctx, points, color, width, dash) {
        if (points.length < 2) return;
        ctx.beginPath();
        points.forEach((point, index) => (index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y)));
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.setLineDash(dash || []);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    function fillDot(ctx, point, radius, color) {
        ctx.beginPath();
        ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
    }

    function drawGrid(ctx, game) {
        const range = game.yMax - game.yMin;
        ctx.font = '16px sans-serif';
        ctx.fillStyle = COLORS.text;
        ctx.strokeStyle = COLORS.grid;
        ctx.lineWidth = 1;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        for (let i = 0; i <= Y_TICKS; i++) {
            const y = toY(i / Y_TICKS);
            ctx.beginPath();
            ctx.moveTo(PAD.left, y);
            ctx.lineTo(WIDTH - PAD.right, y);
            ctx.stroke();
            ctx.fillText(formatNumber(game.yMin + (range * i) / Y_TICKS, 2), PAD.left - 10, y);
        }
        const count = game.xLabels.length;
        const step = Math.ceil(count / MAX_X_LABELS);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        for (let i = 0; i < count; i += step) ctx.fillText(game.xLabels[i], toX(i / (count - 1)), HEIGHT - PAD.bottom + 12);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(game.unit ? `${game.yLabel} (${game.unit})` : game.yLabel, PAD.left, PAD.top - 14);
    }

    function dataPoint(game, values, index) {
        const count = game.xLabels.length;
        return { x: toX(index / (count - 1)), y: toY((values[index] - game.yMin) / (game.yMax - game.yMin)) };
    }

    function drawSeries(ctx, game, values, from, to, color, dash) {
        const points = [];
        for (let i = from; i <= to; i++) points.push(dataPoint(game, values, i));
        strokeLine(ctx, points, color, 4, dash);
    }

    /** Vorschau: gestrichelte Linie vom letzten Punkt (oder Startpunkt) zur Mausposition. */
    function drawPreview(ctx, game, drawings, colors, preview) {
        const own = (drawings && drawings[preview.team]) || [];
        const anchor = dataPoint(game, game.visibleValues, game.shownCount - 1);
        const last = own.length ? { x: toX(own[own.length - 1].u), y: toY(own[own.length - 1].v) } : anchor;
        const target = { x: Math.max(last.x, toX(Math.min(1, preview.u))), y: toY(Math.min(1, Math.max(0, preview.v))) };
        const color = colors[preview.team] || '#ffffff';
        strokeLine(ctx, [last, target], color, 3, [8, 8]);
        ctx.beginPath();
        ctx.arc(target.x, target.y, 6, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    function drawTeamLines(ctx, game, drawings, colors) {
        const anchor = dataPoint(game, game.visibleValues, game.shownCount - 1);
        Object.entries(drawings || {}).forEach(([team, points]) => {
            if (!Array.isArray(points) || !points.length) return;
            const path = [anchor, ...points.map(point => ({ x: toX(point.u), y: toY(point.v) }))];
            const color = colors[team] || '#ffffff';
            const dots = path.slice(1);
            // Geschlossen: fehlendes Stueck bis zum rechten Rand als waagerechte Linie
            if (game.drawingClosed && path[path.length - 1].x < toX(1)) path.push({ x: toX(1), y: path[path.length - 1].y });
            strokeLine(ctx, path, color, 4);
            dots.forEach(point => fillDot(ctx, point, 6, color));
        });
    }

    function drawPlaceholder(ctx) {
        ctx.fillStyle = COLORS.text;
        ctx.font = '24px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Warte auf das nächste Diagramm...', WIDTH / 2, HEIGHT / 2);
    }

    /**
     * Erzeugt ein Diagramm auf dem Canvas.
     * render({ game, drawings, solution, colors, preview }): preview = { team, u, v } (optional), game = Spielstate, solution = alle Werte oder null,
     * colors = Teamfarben. eventToPoint(event) rechnet einen Klick in { u, v } um.
     */
    function createDiagramChart(canvas) {
        canvas.width = WIDTH;
        canvas.height = HEIGHT;
        const ctx = canvas.getContext('2d');

        function render({ game, drawings, solution, colors, preview }) {
            ctx.clearRect(0, 0, WIDTH, HEIGHT);
            ctx.fillStyle = COLORS.background;
            ctx.fillRect(0, 0, WIDTH, HEIGHT);
            if (!game || game.phase === 'IDLE' || !game.xLabels.length) { drawPlaceholder(ctx); return; }

            const anchorX = toX((game.shownCount - 1) / (game.xLabels.length - 1));
            ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
            ctx.fillRect(anchorX, PAD.top, WIDTH - PAD.right - anchorX, PLOT_HEIGHT);
            drawGrid(ctx, game);
            drawSeries(ctx, game, game.visibleValues, 0, game.shownCount - 1, COLORS.original);
            if (solution) {
                const dash = game.solution ? [] : [10, 8];
                drawSeries(ctx, game, solution, game.shownCount - 1, solution.length - 1, COLORS.solution, dash);
            }
            drawTeamLines(ctx, game, drawings, colors || {});
            if (preview && !game.drawingClosed) drawPreview(ctx, game, drawings, colors || {}, preview);
            fillDot(ctx, dataPoint(game, game.visibleValues, game.shownCount - 1), 6, COLORS.original);
        }

        function eventToPoint(event) {
            const rect = canvas.getBoundingClientRect();
            const x = ((event.clientX - rect.left) / rect.width) * WIDTH;
            const y = ((event.clientY - rect.top) / rect.height) * HEIGHT;
            return { u: (x - PAD.left) / PLOT_WIDTH, v: 1 - (y - PAD.top) / PLOT_HEIGHT };
        }

        return { render, eventToPoint };
    }

    function describeResult(game, result) {
        if (!result) return 'keine Zeichnung';
        const unit = game.unit ? ` ${game.unit}` : '';
        return `Abweichung ${formatNumber(result.deviationPct, 2)} % (im Schnitt ${formatNumber(result.mae, 2)}${unit})`;
    }

    /** Legende: Teamfarbe, Teamname und Status bzw. Abweichung. Markiert das Team mit der kleinsten Abweichung. */
    function renderDiagramLegend(container, state, game) {
        container.replaceChildren();
        if (!game || game.phase === 'IDLE') return;
        Object.keys(game.scores || {}).forEach(team => {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex; align-items:center; gap:10px; margin:6px 0; justify-content:center; flex-wrap:wrap;';
            const color = state.teams && state.teams[team] ? state.teams[team].color : '#ffffff';
            const swatch = document.createElement('span');
            swatch.style.cssText = `display:inline-block; width:28px; height:6px; border-radius:3px; background:${color};`;
            const text = document.createElement('span');
            const status = game.results
                ? describeResult(game, game.results[team])
                : `${(game.pointCounts && game.pointCounts[team]) || 0} Punkte gesetzt`;
            text.textContent = `${team}: ${status}${game.closestTeam === team ? ' (näher dran)' : ''}`;
            if (game.closestTeam === team) text.style.fontWeight = 'bold';
            row.append(swatch, text);
            container.appendChild(row);
        });
        if (game.results && !game.closestTeam) {
            const tie = document.createElement('div');
            tie.textContent = 'Kein eindeutiger Sieger.';
            tie.style.textAlign = 'center';
            container.appendChild(tie);
        }
    }

    function getTeamColors(state) {
        return Object.fromEntries(Object.entries(state.teams || {}).map(([team, info]) => [team, info.color]));
    }

    window.Spielshow = window.Spielshow || {};
    Object.assign(window.Spielshow, { createDiagramChart, renderDiagramLegend, getTeamColors });
}());
