// Простой точечно-линейный график на Canvas.

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
  const pad = (hi - lo) * 0.06;
  return [lo - pad, hi + pad];
}

export function formatTick(v, step) {
  const dec = Math.max(0, Math.min(6, -Math.floor(Math.log10(step) + 1e-9)));
  return (Math.abs(v) < step / 1e6 ? 0 : v).toFixed(dec).replace('.', ',').replace('-', '−');
}

// opts: { width, height, dpr, xs, ys, xLabel, yLabel, color, title, highlight, background, font }
export function drawChart(canvas, opts) {
  const { width, height, dpr = 1, xs, ys, color = '#5a4bff' } = opts;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const fs = opts.font || 13;
  const font = w => `${w} ${fs}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;

  ctx.fillStyle = opts.background || '#ffffff';
  ctx.fillRect(0, 0, width, height);

  const pts = [];
  for (let i = 0; i < xs.length; i++) if (ys[i] != null && isFinite(ys[i])) pts.push({ x: xs[i], y: ys[i], i });

  const top = opts.title ? fs * 3 : fs * 1.6;
  const left = fs * 4.6, right = fs * 1.2, bottom = fs * 3.4;
  const pw = width - left - right, ph = height - top - bottom;

  let [x0, x1] = niceRange(Math.min(...xs), Math.max(...xs));
  let [y0, y1] = pts.length ? niceRange(Math.min(...pts.map(p => p.y)), Math.max(...pts.map(p => p.y))) : [0, 1];
  // Ноль по оси Y показываем, если он рядом.
  if (y0 > 0 && y0 < (y1 - y0) * 0.5) y0 = 0;
  if (y1 < 0 && -y1 < (y1 - y0) * 0.5) y1 = 0;
  const X = v => left + (v - x0) / (x1 - x0) * pw;
  const Y = v => top + (1 - (v - y0) / (y1 - y0)) * ph;

  if (opts.title) {
    ctx.fillStyle = '#1d1b3a';
    ctx.font = font('700');
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(opts.title, left, fs * 1.4);
  }

  // Сетка и подписи делений.
  ctx.lineWidth = 1;
  ctx.font = font('400');
  ctx.fillStyle = '#6b6a86';
  const xs_ = niceStep(x1 - x0, Math.max(2, Math.floor(pw / (fs * 5))));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let v = Math.ceil(x0 / xs_) * xs_; v <= x1 + 1e-12; v += xs_) {
    ctx.strokeStyle = '#ecebf7';
    ctx.beginPath(); ctx.moveTo(X(v), top); ctx.lineTo(X(v), top + ph); ctx.stroke();
    ctx.fillText(formatTick(v, xs_), X(v), top + ph + fs * 0.5);
  }
  const ys_ = niceStep(y1 - y0, Math.max(2, Math.floor(ph / (fs * 3))));
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let v = Math.ceil(y0 / ys_) * ys_; v <= y1 + 1e-12; v += ys_) {
    ctx.strokeStyle = Math.abs(v) < ys_ / 1e6 ? '#c9c6e6' : '#ecebf7';
    ctx.beginPath(); ctx.moveTo(left, Y(v)); ctx.lineTo(left + pw, Y(v)); ctx.stroke();
    ctx.fillText(formatTick(v, ys_), left - fs * 0.5, Y(v));
  }
  ctx.strokeStyle = '#b9b6d9';
  ctx.strokeRect(left, top, pw, ph);

  // Подписи осей.
  ctx.fillStyle = '#1d1b3a';
  ctx.font = font('600');
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText(opts.xLabel || '', left + pw, height - fs * 0.4);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText(opts.yLabel || '', left, top - fs * 0.4);

  // Линия и точки.
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, pw, ph);
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = Math.max(1.5, fs / 7);
  ctx.beginPath();
  let started = false;
  for (let i = 0; i < xs.length; i++) {
    if (ys[i] == null) { started = false; continue; }
    if (!started) { ctx.moveTo(X(xs[i]), Y(ys[i])); started = true; } else ctx.lineTo(X(xs[i]), Y(ys[i]));
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = color;
  const r = Math.max(3, fs / 3.6);
  for (const p of pts) {
    ctx.beginPath();
    ctx.arc(X(p.x), Y(p.y), r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  if (opts.highlight != null && ys[opts.highlight] != null) {
    const i = opts.highlight, px = X(xs[i]), py = Y(ys[i]);
    ctx.strokeStyle = '#ff4d8d';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(px, top); ctx.lineTo(px, top + ph); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(px, py, r + 3, 0, Math.PI * 2); ctx.stroke();
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
