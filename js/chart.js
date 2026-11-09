// Простой точечно-линейный график на Canvas.

const LIGHT = { bg: '#ffffff', grid: 'rgba(60,60,67,0.10)', zero: 'rgba(60,60,67,0.28)', text: '#1d1d1f', text2: '#86868b', trend: '#ff9500', band: 'rgba(0,113,227,0.08)' };
const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", Inter, "Segoe UI", Roboto, sans-serif';

function niceStep(range, target) {
  const raw = range / Math.max(1, target);
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / p;
  return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p;
}

function niceRange(lo, hi) {
  if (!isFinite(lo) || !isFinite(hi)) return [0, 1];
  if (hi - lo < 1e-9) {
    const pad = Math.abs(hi) * 0.1 || 0.5;
    return [lo - pad, hi + pad];
  }
  const pad = (hi - lo) * 0.08;
  return [lo - pad, hi + pad];
}

export function formatTick(v, step, comma = false) {
  const dec = Math.max(0, Math.min(6, -Math.floor(Math.log10(step) + 1e-9)));
  const s = (Math.abs(v) < step / 1e6 ? 0 : v).toFixed(dec).replace('-', '−');
  return comma ? s.replace('.', ',') : s;
}

// opts: { width, height, dpr, xs, ys, xLabel, yLabel, color, title, subtitle, highlight, theme, font, comma,
//         trend (функция x → y), band ([x0, x1] — выделенный участок), scatter (без соединительной линии),
//         zero (оси начинаются с нуля) }
export function drawChart(canvas, opts) {
  const { width, height, dpr = 1, xs, ys, color = '#0071e3' } = opts;
  const th = { ...LIGHT, ...(opts.theme || {}) };
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const fs = opts.font || 12;
  const font = w => `${w} ${fs}px ${FONT}`;

  ctx.fillStyle = th.bg;
  ctx.fillRect(0, 0, width, height);

  const pts = [];
  for (let i = 0; i < xs.length; i++) if (ys[i] != null && isFinite(ys[i])) pts.push({ x: xs[i], y: ys[i], i });

  const top = (opts.title ? fs * 4.2 : fs * 2.4) + (opts.subtitle ? fs * 1.6 : 0);
  const left = fs * 4.4, right = fs * 1.4, bottom = fs * 3.2;
  const pw = width - left - right, ph = height - top - bottom;

  const xv = pts.length ? pts.map(p => p.x) : xs;
  let [x0, x1] = xv.length ? niceRange(Math.min(...xv, ...(opts.zero ? [0] : [])), Math.max(...xv)) : [0, 1];
  let [y0, y1] = pts.length ? niceRange(Math.min(...pts.map(p => p.y), ...(opts.zero ? [0] : [])), Math.max(...pts.map(p => p.y))) : [0, 1];
  if (opts.zero) {
    if (x0 < 0 && Math.min(...xv) >= 0) x0 = 0;
    if (y0 < 0 && pts.every(p => p.y >= 0)) y0 = 0;
  }
  if (y0 > 0 && y0 < (y1 - y0) * 0.5) y0 = 0;
  if (y1 < 0 && -y1 < (y1 - y0) * 0.5) y1 = 0;
  const X = v => left + (v - x0) / (x1 - x0) * pw;
  const Y = v => top + (1 - (v - y0) / (y1 - y0)) * ph;

  if (opts.title) {
    ctx.fillStyle = th.text;
    ctx.font = `600 ${fs * 1.3}px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(opts.title, left, fs * 2);
    if (opts.subtitle) {
      ctx.fillStyle = th.text2;
      ctx.font = `400 ${fs}px ${FONT}`;
      ctx.fillText(opts.subtitle, left, fs * 3.7);
    }
  }

  if (opts.band) {
    const a = Math.max(x0, Math.min(...opts.band)), b = Math.min(x1, Math.max(...opts.band));
    ctx.fillStyle = th.band;
    ctx.fillRect(X(a), top, Math.max(1, X(b) - X(a)), ph);
  }

  // Горизонтальная сетка и подписи значений.
  ctx.lineWidth = 1;
  ctx.font = font('400');
  ctx.fillStyle = th.text2;
  const ys_ = niceStep(y1 - y0, Math.max(2, Math.floor(ph / (fs * 3.4))));
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let v = Math.ceil(y0 / ys_) * ys_; v <= y1 + 1e-12; v += ys_) {
    const zero = Math.abs(v) < ys_ / 1e6;
    ctx.strokeStyle = zero ? th.zero : th.grid;
    ctx.beginPath(); ctx.moveTo(left, Math.round(Y(v)) + 0.5); ctx.lineTo(left + pw, Math.round(Y(v)) + 0.5); ctx.stroke();
    ctx.fillText(formatTick(v, ys_, opts.comma), left - fs * 0.7, Y(v));
  }
  const xs_ = niceStep(x1 - x0, Math.max(2, Math.floor(pw / (fs * 5.5))));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let v = Math.ceil(x0 / xs_) * xs_; v <= x1 + 1e-12; v += xs_) {
    ctx.strokeStyle = th.grid;
    ctx.beginPath(); ctx.moveTo(Math.round(X(v)) + 0.5, top + ph); ctx.lineTo(Math.round(X(v)) + 0.5, top + ph + 4); ctx.stroke();
    ctx.fillText(formatTick(v, xs_, opts.comma), X(v), top + ph + fs * 0.7);
  }

  // Подписи осей.
  ctx.fillStyle = th.text2;
  ctx.font = font('500');
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText(opts.xLabel || '', left + pw, height - fs * 0.2);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText(opts.yLabel || '', left - fs * 0.2, top - fs * 0.9);

  // Линия и точки.
  ctx.save();
  ctx.beginPath();
  ctx.rect(left - 6, top - 6, pw + 12, ph + 12);
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.5, fs / 6);
  ctx.lineJoin = 'round';
  if (!opts.scatter) {
    ctx.globalAlpha = opts.trend ? 0.25 : 0.5;
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < xs.length; i++) {
      if (ys[i] == null) { started = false; continue; }
      if (!started) { ctx.moveTo(X(xs[i]), Y(ys[i])); started = true; } else ctx.lineTo(X(xs[i]), Y(ys[i]));
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = color;
  const r = Math.max(2.5, fs / 4.2);
  for (const p of pts) {
    ctx.beginPath();
    ctx.arc(X(p.x), Y(p.y), r, 0, Math.PI * 2);
    ctx.fill();
  }
  if (opts.trend) {
    // Линия тренда — поверх точек, по всей ширине графика (на выделенном участке, если он задан).
    const [a, b] = opts.band ? [Math.min(...opts.band), Math.max(...opts.band)]
      : opts.zero ? [x0, x1] : [Math.min(...xv), Math.max(...xv)];
    ctx.strokeStyle = th.trend;
    ctx.lineWidth = Math.max(2, fs / 5);
    ctx.setLineDash([fs * 0.6, fs * 0.4]);
    ctx.beginPath();
    for (let k = 0; k <= 120; k++) {
      const x = a + (b - a) * k / 120, y = opts.trend(x);
      if (k) ctx.lineTo(X(x), Y(y)); else ctx.moveTo(X(x), Y(y));
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();

  if (opts.highlight != null && ys[opts.highlight] != null) {
    const i = opts.highlight, px = X(xs[i]), py = Y(ys[i]);
    ctx.strokeStyle = th.zero;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(px, top); ctx.lineTo(px, top + ph); ctx.stroke();
    ctx.fillStyle = th.bg;
    ctx.beginPath(); ctx.arc(px, py, r + 4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  return { pts, X, Y, left, top, pw, ph };
}

export function nearestPoint(layout, sx) {
  let best = null, bestD = Infinity;
  for (const p of layout.pts) {
    const d = Math.abs(layout.X(p.x) - sx);
    if (d < bestD) { best = p; bestD = d; }
  }
  return best;
}
