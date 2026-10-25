// Авто-трекинг: поиск шаблона по нормированной взаимной корреляции (NCC)
// на уменьшенном чёрно-белом кадре, с субпиксельным уточнением пика.

const PROC_MAX = 640; // максимальный размер стороны кадра для обработки

export class FrameGrabber {
  constructor(video) {
    this.video = video;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
  }

  // Возвращает { data: Float32Array (яркость), w, h, scale } — scale: пикс. обработки на пикс. видео.
  grab() {
    const v = this.video;
    const scale = Math.min(1, PROC_MAX / Math.max(v.videoWidth, v.videoHeight));
    const w = Math.round(v.videoWidth * scale), h = Math.round(v.videoHeight * scale);
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    this.ctx.drawImage(v, 0, 0, w, h);
    const rgba = this.ctx.getImageData(0, 0, w, h).data;
    const data = new Float32Array(w * h);
    for (let i = 0, j = 0; i < data.length; i++, j += 4) {
      data[i] = 0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2];
    }
    return { data, w, h, scale };
  }
}

function sample(img, x, y) {
  const x0 = Math.max(0, Math.min(img.w - 2, Math.floor(x)));
  const y0 = Math.max(0, Math.min(img.h - 2, Math.floor(y)));
  const fx = Math.max(0, Math.min(1, x - x0)), fy = Math.max(0, Math.min(1, y - y0));
  const i = y0 * img.w + x0, d = img.data;
  return (d[i] * (1 - fx) + d[i + 1] * fx) * (1 - fy) + (d[i + img.w] * (1 - fx) + d[i + img.w + 1] * fx) * fy;
}

function patch(img, cx, cy, n) {
  const half = (n - 1) / 2, out = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) out[j * n + i] = sample(img, cx - half + i, cy - half + j);
  return out;
}

export class TemplateTracker {
  // cx, cy, size — в пикселях обработки.
  init(img, cx, cy, size) {
    this.n = Math.max(7, Math.round(size) | 1);
    this.raw = patch(img, cx, cy, this.n);
    this._prepare();
  }

  _prepare() {
    const n2 = this.raw.length;
    let mean = 0;
    for (let i = 0; i < n2; i++) mean += this.raw[i];
    mean /= n2;
    this.t = new Float32Array(n2);
    let ss = 0;
    for (let i = 0; i < n2; i++) { this.t[i] = this.raw[i] - mean; ss += this.t[i] * this.t[i]; }
    this.norm = Math.sqrt(ss);
    this.contrast = Math.sqrt(ss / n2);
  }

  // Плавное обновление шаблона: объект может менять вид (поворот, освещение).
  update(img, cx, cy, alpha = 0.25) {
    const p = patch(img, cx, cy, this.n);
    for (let i = 0; i < p.length; i++) this.raw[i] = this.raw[i] * (1 - alpha) + p[i] * alpha;
    this._prepare();
  }

  // Поиск около (px, py) в радиусе R. Возвращает { x, y, score }.
  match(img, px, py, R) {
    const n = this.n, half = (n - 1) >> 1, N = n * n;
    const W = img.w, H = img.h, d = img.data;
    const cx0 = Math.max(half, Math.round(px - R)), cx1 = Math.min(W - 1 - half, Math.round(px + R));
    const cy0 = Math.max(half, Math.round(py - R)), cy1 = Math.min(H - 1 - half, Math.round(py + R));
    if (cx1 < cx0 || cy1 < cy0 || this.norm < 1e-3) return { x: px, y: py, score: 0 };

    // Интегральные изображения области поиска для быстрых сумм и сумм квадратов.
    const rx0 = cx0 - half, ry0 = cy0 - half, rw = cx1 - cx0 + n, rh = cy1 - cy0 + n;
    const S = new Float64Array((rw + 1) * (rh + 1)), Q = new Float64Array((rw + 1) * (rh + 1));
    for (let y = 0; y < rh; y++) {
      let rs = 0, rq = 0;
      const row = (ry0 + y) * W + rx0;
      for (let x = 0; x < rw; x++) {
        const v = d[row + x];
        rs += v; rq += v * v;
        const k = (y + 1) * (rw + 1) + x + 1;
        S[k] = S[k - rw - 1] + rs;
        Q[k] = Q[k - rw - 1] + rq;
      }
    }

    const gw = cx1 - cx0 + 1, gh = cy1 - cy0 + 1;
    const scores = new Float32Array(gw * gh);
    const t = this.t;
    let best = -2, bi = 0, bj = 0;
    for (let j = 0; j < gh; j++) {
      for (let i = 0; i < gw; i++) {
        const k0 = j * (rw + 1) + i, k1 = k0 + n, k2 = k0 + n * (rw + 1), k3 = k2 + n;
        const sum = S[k3] - S[k1] - S[k2] + S[k0];
        const sq = Q[k3] - Q[k1] - Q[k2] + Q[k0];
        const varI = sq - sum * sum / N;
        let sc = 0;
        if (varI > 1e-6) {
          let cross = 0;
          const base = (ry0 + j) * W + rx0 + i;
          for (let v = 0, ti = 0; v < n; v++) {
            const r = base + v * W;
            for (let u = 0; u < n; u++, ti++) cross += t[ti] * d[r + u];
          }
          sc = cross / (this.norm * Math.sqrt(varI));
        }
        scores[j * gw + i] = sc;
        if (sc > best) { best = sc; bi = i; bj = j; }
      }
    }

    // Субпиксельное уточнение: парабола по соседям пика.
    const at = (i, j) => scores[j * gw + i];
    let dx = 0, dy = 0;
    if (bi > 0 && bi < gw - 1) {
      const l = at(bi - 1, bj), c = at(bi, bj), r = at(bi + 1, bj), den = l - 2 * c + r;
      if (den < 0) dx = Math.max(-0.5, Math.min(0.5, (l - r) / (2 * den)));
    }
    if (bj > 0 && bj < gh - 1) {
      const u = at(bi, bj - 1), c = at(bi, bj), b = at(bi, bj + 1), den = u - 2 * c + b;
      if (den < 0) dy = Math.max(-0.5, Math.min(0.5, (u - b) / (2 * den)));
    }
    // Пик на границе области поиска — скорее всего, ложный.
    const edge = (bi === 0 && cx0 > half) || (bi === gw - 1 && cx1 < W - 1 - half) ||
                 (bj === 0 && cy0 > half) || (bj === gh - 1 && cy1 < H - 1 - half);
    return { x: cx0 + bi + dx, y: cy0 + bj + dy, score: edge ? Math.min(best, 0.3) : best };
  }
}
