// Простой точечно-линейный график на Canvas.

const LIGHT = { bg: '#ffffff', grid: 'rgba(60,60,67,0.10)', zero: 'rgba(60,60,67,0.28)', text: '#1d1d1f', text2: '#86868b' };
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

export function formatTick(v, step) {
  const dec = Math.max(0, Math.min(6, -Math.floor(Math.log10(step) + 1e-9)));
  return (Math.abs(v) < step / 1e6 ? 0 : v).toFixed(dec).replace('-', '−');
}

// opts: { width, height, dpr, xs, ys, xLabel, yLabel, color, title, highlight, theme, font }
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

  const top = opts.title ? fs * 4.2 : fs * 2.4;
  const left = fs * 4.4, right = fs * 1.4, bottom = fs * 3.2;
  const pw = width - left - right, ph = height - top - bottom;

  let [x0, x1] = niceRange(Math.min(...xs), Math.max(...xs));
  let [y0, y1] = pts.length ? niceRange(Math.min(...pts.map(p => p.y)), Math.max(...pts.map(p => p.y))) : [0, 1];
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
    ctx.fillText(formatTick(v, ys_), left - fs * 0.7, Y(v));
  }
  const xs_ = niceStep(x1 - x0, Math.max(2, Math.floor(pw / (fs * 5.5))));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let v = Math.ceil(x0 / xs_) * xs_; v <= x1 + 1e-12; v += xs_) {
    ctx.strokeStyle = th.grid;
    ctx.beginPath(); ctx.moveTo(Math.round(X(v)) + 0.5, top + ph); ctx.lineTo(Math.round(X(v)) + 0.5, top + ph + 4); ctx.stroke();
    ctx.fillText(formatTick(v, xs_), X(v), top + ph + fs * 0.7);
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
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  let started = false;
  for (let i = 0; i < xs.length; i++) {
    if (ys[i] == null) { started = false; continue; }
    if (!started) { ctx.moveTo(X(xs[i]), Y(ys[i])); started = true; } else ctx.lineTo(X(xs[i]), Y(ys[i]));
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = color;
  const r = Math.max(2.5, fs / 4.2);
  for (const p of pts) {
    ctx.beginPath();
    ctx.arc(X(p.x), Y(p.y), r, 0, Math.PI * 2);
    ctx.fill();
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
