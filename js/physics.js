// Пересчёт пикселей в метры, сглаживание и производные по центральной разности.

// Калибровка: scale = { a, b, length } (точки в пикселях видео, длина в метрах),
// axes = { origin: {x, y}, angle } — угол оси X в радианах, против часовой стрелки.
// Ось Y повёрнута на +90° от оси X (вверх при angle = 0), flipY — в обратную сторону.
export function pixelsPerMeter(scale) {
  const d = Math.hypot(scale.b.x - scale.a.x, scale.b.y - scale.a.y);
  return scale.length > 0 ? d / scale.length : 0;
}

export function toWorld(p, cal) {
  const ppm = pixelsPerMeter(cal.scale);
  const dx = p.x - cal.axes.origin.x;
  const dy = p.y - cal.axes.origin.y;
  const c = Math.cos(cal.axes.angle), s = Math.sin(cal.axes.angle);
  const y = (-dx * s - dy * c) / ppm;
  return { x: (dx * c - dy * s) / ppm, y: cal.axes.flipY ? -y : y };
}

// Локальная квадратичная аппроксимация по окну из (2*half+1) точек (фильтр
// Савицкого–Голея, работает и при неравномерном шаге по времени).
// Для параболы (равноускоренное движение) сглаживание не искажает данные.
export function smooth(t, y, half) {
  const n = y.length;
  if (half <= 0 || n < 5) return y.slice();
  const win = Math.min(2 * half + 1, n % 2 ? n : n - 1);
  const h = (win - 1) >> 1;
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, Math.min(n - win, i - h));
    let s0 = 0, s1 = 0, s2 = 0, s3 = 0, s4 = 0, b0 = 0, b1 = 0, b2 = 0;
    for (let j = lo; j < lo + win; j++) {
      const u = t[j] - t[i], u2 = u * u;
      s0 += 1; s1 += u; s2 += u2; s3 += u2 * u; s4 += u2 * u2;
      b0 += y[j]; b1 += y[j] * u; b2 += y[j] * u2;
    }
    // Решаем систему 3×3 методом Крамера, нужен только свободный член c0.
    const det = s0 * (s2 * s4 - s3 * s3) - s1 * (s1 * s4 - s3 * s2) + s2 * (s1 * s3 - s2 * s2);
    if (Math.abs(det) < 1e-18) { out[i] = y[i]; continue; }
    const d0 = b0 * (s2 * s4 - s3 * s3) - s1 * (b1 * s4 - s3 * b2) + s2 * (b1 * s3 - s2 * b2);
    out[i] = d0 / det;
  }
  return out;
}

function centralDiff(t, y) {
  const n = y.length, d = new Array(n).fill(null);
  for (let i = 1; i < n - 1; i++) {
    if (y[i - 1] == null || y[i + 1] == null) continue;
    d[i] = (y[i + 1] - y[i - 1]) / (t[i + 1] - t[i - 1]);
  }
  return d;
}

export const SMOOTHING = { none: 0, light: 2, strong: 4 };

// samples: [{ t, x, y }] в секундах и метрах, отсортированы по t.
// mass (кг) > 0 — добавляются силы F = m·a в ньютонах.
export function computeSeries(samples, smoothing = 'none', mass = 0) {
  const t = samples.map(s => s.t);
  const half = SMOOTHING[smoothing] || 0;
  const x = smooth(t, samples.map(s => s.x), half);
  const y = smooth(t, samples.map(s => s.y), half);
  const vx = centralDiff(t, x);
  const vy = centralDiff(t, y);
  const v = vx.map((a, i) => (a == null || vy[i] == null ? null : Math.hypot(a, vy[i])));
  const ax = centralDiff(t, vx);
  const ay = centralDiff(t, vy);
  const out = { t, frame: samples.map(s => s.frame), x, y, vx, vy, v, ax, ay };
  if (mass > 0) {
    out.Fx = ax.map(a => (a == null ? null : mass * a));
    out.Fy = ay.map(a => (a == null ? null : mass * a));
    out.F = ax.map((a, i) => (a == null || ay[i] == null ? null : mass * Math.hypot(a, ay[i])));
  }
  return out;
}

// Линия тренда методом наименьших квадратов: полином степени deg (1 или 2).
// Возвращает коэффициенты c[k] при t^k и R². Точки с null пропускаются.
// origin: прямая через начало координат (y = c1·x); R² в этом случае, как в Excel,
// считается относительно нуля, а не среднего.
export function polyfit(xs, ys, deg, origin = false) {
  const px = [], py = [];
  for (let i = 0; i < xs.length; i++) {
    if (ys[i] != null && isFinite(ys[i]) && xs[i] != null && isFinite(xs[i])) { px.push(xs[i]); py.push(ys[i]); }
  }
  const n = px.length;
  const powers = [];
  for (let k = origin ? 1 : 0; k <= deg; k++) powers.push(k);
  const m = powers.length;
  if (n < Math.max(2, m)) return null;
  // Центрирование по x улучшает обусловленность; после решения пересчитываем коэффициенты обратно.
  const x0 = origin ? 0 : px.reduce((a, b) => a + b, 0) / n;
  const A = Array.from({ length: m }, () => new Array(m + 1).fill(0));
  for (let i = 0; i < n; i++) {
    const u = px[i] - x0;
    const row = powers.map(k => u ** k);
    for (let r = 0; r < m; r++) {
      for (let c = 0; c < m; c++) A[r][c] += row[r] * row[c];
      A[r][m] += row[r] * py[i];
    }
  }
  // Метод Гаусса с выбором главного элемента.
  for (let c = 0; c < m; c++) {
    let p = c;
    for (let r = c + 1; r < m; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-300) return null;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = 0; r < m; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k <= m; k++) A[r][k] -= f * A[c][k];
    }
  }
  const b = new Array(deg + 1).fill(0); // коэффициенты по центрированной переменной u
  powers.forEach((k, i) => { b[k] = A[i][m] / A[i][i]; });
  // u = x − x0 → коэффициенты по x.
  const c = new Array(deg + 1).fill(0);
  for (let k = 0; k <= deg; k++) {
    for (let j = 0; j <= k; j++) c[j] += b[k] * binom(k, j) * (-x0) ** (k - j);
  }
  const f = x => c.reduce((s, ck, k) => s + ck * x ** k, 0);
  const mean = py.reduce((a, v) => a + v, 0) / n;
  let ssRes = 0, ssTot = 0;
  for (let i = 0; i < n; i++) {
    ssRes += (py[i] - f(px[i])) ** 2;
    ssTot += origin ? py[i] ** 2 : (py[i] - mean) ** 2;
  }
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 1;
  return { deg, coef: c, r2, n, f };
}

function binom(n, k) {
  let r = 1;
  for (let i = 1; i <= k; i++) r = r * (n - k + i) / i;
  return r;
}
