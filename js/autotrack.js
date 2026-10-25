// Авто-трекинг: поиск шаблона по цветной нормированной корреляции (NCC)
// с круглой маской, двухуровневым поиском (грубо на уменьшенном кадре, точно на полном)
// и штрафом за удаление от прогноза траектории.

const PROC_MAX = 640; // максимальный размер стороны кадра для обработки

function downsample(img) {
  const w = img.w >> 1, h = img.h >> 1;
  const c = img.c.map(src => {
    const dst = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      const r0 = 2 * y * img.w, r1 = r0 + img.w;
      for (let x = 0; x < w; x++) {
        const i = 2 * x;
        dst[y * w + x] = 0.25 * (src[r0 + i] + src[r0 + i + 1] + src[r1 + i] + src[r1 + i + 1]);
      }
    }
    return dst;
  });
  return { w, h, c };
}

export class FrameGrabber {
  constructor(video) {
    this.video = video;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
  }

  // Возвращает { w, h, c: [R, G, B], half, scale } — scale: пикс. обработки на пикс. видео.
  grab() {
    const v = this.video;
    const scale = Math.min(1, PROC_MAX / Math.max(v.videoWidth, v.videoHeight));
    const w = Math.round(v.videoWidth * scale), h = Math.round(v.videoHeight * scale);
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    this.ctx.drawImage(v, 0, 0, w, h);
    const rgba = this.ctx.getImageData(0, 0, w, h).data;
    const c = [new Float32Array(w * h), new Float32Array(w * h), new Float32Array(w * h)];
    for (let i = 0, j = 0; i < w * h; i++, j += 4) {
      c[0][i] = rgba[j]; c[1][i] = rgba[j + 1]; c[2][i] = rgba[j + 2];
    }
    const img = { w, h, c, scale };
    img.half = downsample(img);
    return img;
  }
}

function sample(ch, w, h, x, y) {
  const x0 = Math.max(0, Math.min(w - 2, Math.floor(x)));
  const y0 = Math.max(0, Math.min(h - 2, Math.floor(y)));
  const fx = Math.max(0, Math.min(1, x - x0)), fy = Math.max(0, Math.min(1, y - y0));
  const i = y0 * w + x0;
  return (ch[i] * (1 - fx) + ch[i + 1] * fx) * (1 - fy) + (ch[i + w] * (1 - fx) + ch[i + w + 1] * fx) * fy;
}

// Шаблон: точки внутри круга диаметром n, по три цветовых канала.
class Template {
  constructor(n) {
    this.n = n;
    this.half = (n - 1) >> 1;
    const r2 = (this.half + 0.5) ** 2;
    this.dx = [];
    this.dy = [];
    for (let y = -this.half; y <= this.half; y++) {
      for (let x = -this.half; x <= this.half; x++) {
        if (x * x + y * y <= r2) { this.dx.push(x); this.dy.push(y); }
      }
    }
    this.m = this.dx.length;
    this.raw = null;
    this.w = new Float32Array(this.m).fill(1);
  }

  // Веса «объект/фон»: пиксели шаблона, похожие по цвету на кольцо фона вокруг рамки,
  // почти не учитываются — иначе трекер может «прилипнуть» к неподвижному фону.
  weighFromRing(img, cx, cy) {
    const ring = [];
    for (let k = 0; k < 48; k++) {
      const a = k / 48 * 2 * Math.PI;
      for (const r of [this.half + 2, this.half + 4]) {
        const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
        if (x < 0 || y < 0 || x > img.w - 1 || y > img.h - 1) continue;
        ring.push([0, 1, 2].map(c => sample(img.c[c], img.w, img.h, x, y)));
      }
    }
    if (ring.length < 16) return;
    const m = this.m, w = new Float32Array(m);
    let sum = 0;
    for (let k = 0; k < m; k++) {
      const p = [this.raw[k], this.raw[m + k], this.raw[2 * m + k]];
      let d = Infinity;
      for (const q of ring) d = Math.min(d, Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]));
      const u = Math.max(0, Math.min(1, (d - 18) / 40));
      w[k] = 0.05 + 0.95 * u * u * (3 - 2 * u);
      sum += w[k];
    }
    // Объект почти не отличается от фона — оставляем равные веса.
    if (sum < 0.15 * m) return;
    this.w = w;
    this.set(this.raw);
  }

  read(img, cx, cy) {
    const m = this.m, out = new Float32Array(3 * m);
    for (let c = 0; c < 3; c++) {
      for (let k = 0; k < m; k++) out[c * m + k] = sample(img.c[c], img.w, img.h, cx + this.dx[k], cy + this.dy[k]);
    }
    return out;
  }

  // t хранит w·(raw − взвешенное среднее), чтобы корреляция считалась одной суммой.
  set(raw) {
    this.raw = raw;
    const m = this.m, w = this.w;
    let W = 0;
    for (let k = 0; k < m; k++) W += w[k];
    this.wsum = W;
    this.t = new Float32Array(3 * m);
    let ss = 0;
    for (let c = 0; c < 3; c++) {
      let mean = 0;
      for (let k = 0; k < m; k++) mean += w[k] * raw[c * m + k];
      mean /= W;
      for (let k = 0; k < m; k++) {
        const v = raw[c * m + k] - mean;
        this.t[c * m + k] = w[k] * v;
        ss += w[k] * v * v;
      }
    }
    this.norm = Math.sqrt(ss);
    this.contrast = Math.sqrt(ss / (3 * W));
    // Вариант без весов — для точного уточнения положения (края объекта тоже важны).
    const u = this.unweighted = { w: new Float32Array(m).fill(1), wsum: m, t: new Float32Array(3 * m), m, dx: this.dx, dy: this.dy, half: this.half };
    let su = 0;
    for (let c = 0; c < 3; c++) {
      let mean = 0;
      for (let k = 0; k < m; k++) mean += raw[c * m + k];
      mean /= m;
      for (let k = 0; k < m; k++) {
        const v = raw[c * m + k] - mean;
        u.t[c * m + k] = v;
        su += v * v;
      }
    }
    u.norm = Math.sqrt(su);
  }

  copyFrom(other) {
    this.w = other.w;
    this.set(other.raw.slice());
  }

  blend(raw, alpha) {
    const r = this.raw.slice();
    for (let i = 0; i < r.length; i++) r[i] = r[i] * (1 - alpha) + raw[i] * alpha;
    this.set(r);
  }
}

// Поиск шаблона T в изображении около (px, py) в радиусе R.
// eff = ncc − pen·(d/R)² — предпочитаем совпадения ближе к прогнозу.
function search(img, T, px, py, R, pen, ex = null) {
  const W = img.w, H = img.h, h = T.half, m = T.m;
  const x0 = Math.max(h, Math.ceil(px - R)), x1 = Math.min(W - 1 - h, Math.floor(px + R));
  const y0 = Math.max(h, Math.ceil(py - R)), y1 = Math.min(H - 1 - h, Math.floor(py + R));
  if (x1 < x0 || y1 < y0 || T.norm < 1e-3) return null;
  const off = new Int32Array(m);
  for (let k = 0; k < m; k++) off[k] = T.dy[k] * W + T.dx[k];
  const [c0, c1, c2] = img.c, t = T.t, wt = T.w, wsum = T.wsum;
  const gw = x1 - x0 + 1, gh = y1 - y0 + 1;
  const ncc = new Float32Array(gw * gh);
  let best = -Infinity, bi = 0, bj = 0;
  const R2 = Math.max(1, R * R);
  for (let j = 0; j < gh; j++) {
    const cy = y0 + j;
    for (let i = 0; i < gw; i++) {
      const cx = x0 + i, base = cy * W + cx;
      if (ex && (cx - ex.x) ** 2 + (cy - ex.y) ** 2 < ex.r * ex.r) { ncc[j * gw + i] = -1; continue; }
      let s0 = 0, s1 = 0, s2 = 0, q = 0, x = 0;
      for (let k = 0; k < m; k++) {
        const p = base + off[k], w = wt[k];
        const a = c0[p], b = c1[p], c = c2[p];
        s0 += w * a; s1 += w * b; s2 += w * c;
        q += w * (a * a + b * b + c * c);
        x += t[k] * a + t[m + k] * b + t[2 * m + k] * c;
      }
      const varI = q - (s0 * s0 + s1 * s1 + s2 * s2) / wsum;
      const sc = varI > 1e-6 ? x / (T.norm * Math.sqrt(varI)) : 0;
      ncc[j * gw + i] = sc;
      const d2 = (cx - px) ** 2 + (cy - py) ** 2;
      const eff = sc - pen * d2 / R2;
      if (eff > best) { best = eff; bi = i; bj = j; }
    }
  }
  // Субпиксельное уточнение: парабола по соседям пика.
  const at = (i, j) => ncc[j * gw + i];
  let dx = 0, dy = 0;
  if (bi > 0 && bi < gw - 1) {
    const l = at(bi - 1, bj), c = at(bi, bj), r = at(bi + 1, bj), den = l - 2 * c + r;
    if (den < 0) dx = Math.max(-0.5, Math.min(0.5, (l - r) / (2 * den)));
  }
  if (bj > 0 && bj < gh - 1) {
    const u = at(bi, bj - 1), c = at(bi, bj), b = at(bi, bj + 1), den = u - 2 * c + b;
    if (den < 0) dy = Math.max(-0.5, Math.min(0.5, (u - b) / (2 * den)));
  }
  const edge = (bi === 0 && x0 > h) || (bi === gw - 1 && x1 < W - 1 - h) ||
               (bj === 0 && y0 > h) || (bj === gh - 1 && y1 < H - 1 - h);
  return { x: x0 + bi + dx, y: y0 + bj + dy, score: at(bi, bj), eff: best, edge };
}

// Координаты: полный кадр ↔ уменьшенный вдвое (центр пикселя 2i+0.5).
const toHalf = v => (v - 0.5) / 2;
const fromHalf = v => v * 2 + 0.5;

export class TemplateTracker {
  // cx, cy, size — в пикселях обработки.
  init(img, cx, cy, size) {
    this.n = Math.max(9, Math.round(size) | 1);
    this.fixed = new Template(this.n);
    this.fixed.set(this.fixed.read(img, cx, cy));
    this.contrast = this.fixed.contrast;
    this.fixed.weighFromRing(img, cx, cy);
    this.adapt = new Template(this.n);
    this.adapt.copyFrom(this.fixed);
    const nh = Math.max(5, (Math.round(this.n / 2) | 1));
    this.fixedHalf = new Template(nh);
    this.fixedHalf.set(this.fixedHalf.read(img.half, toHalf(cx), toHalf(cy)));
    this.fixedHalf.weighFromRing(img.half, toHalf(cx), toHalf(cy));
    this.adaptHalf = new Template(nh);
    this.adaptHalf.copyFrom(this.fixedHalf);
  }

  // Плавное обновление шаблона: объект может поворачиваться и менять освещение.
  update(img, cx, cy, alpha = 0.25) {
    this.adapt.blend(this.adapt.read(img, cx, cy), alpha);
    this.adaptHalf.blend(this.adaptHalf.read(img.half, toHalf(cx), toHalf(cy)), alpha);
  }

  // Поиск около прогноза (px, py) в радиусе R. Возвращает { x, y, score } или null.
  // ex = { x, y, r } — исключить круг (например, место старта, где остался фон).
  match(img, px, py, R, pen = 0.25, ex = null) {
    const exHalf = ex && { x: toHalf(ex.x), y: toHalf(ex.y), r: ex.r / 2 };
    let cx = px, cy = py;
    let fineR = R;
    if (R > 6) {
      // Грубый поиск на уменьшенном кадре по обоим шаблонам.
      const a = search(img.half, this.adaptHalf, toHalf(px), toHalf(py), R / 2, pen, exHalf);
      const b = search(img.half, this.fixedHalf, toHalf(px), toHalf(py), R / 2, pen, exHalf);
      const c = !a ? b : !b ? a : (a.eff >= b.eff ? a : b);
      if (!c) return null;
      cx = fromHalf(c.x);
      cy = fromHalf(c.y);
      fineR = 3;
    }
    // Точный поиск на полном кадре вокруг найденного места. В малом радиусе — по полному шаблону
    // без весов (точнее по краям объекта), в большом — с весами (устойчивее к фону).
    let best = null;
    for (const T0 of [this.adapt, this.fixed]) {
      const T = fineR <= 3 ? T0.unweighted : T0;
      let r = search(img, T, cx, cy, fineR, 0, ex);
      if (r && r.edge && fineR <= 3) r = search(img, T, r.x, r.y, fineR, 0, ex) || r;
      if (r && (!best || r.score > best.score)) best = r;
    }
    if (best) {
      // Решения (принять точку или нет) — по взвешенной оценке: она не завышается на фоне.
      const a = search(img, this.adapt, best.x, best.y, 1, 0);
      const f = search(img, this.fixed, best.x, best.y, 1, 0);
      // fixedScore — насколько место похоже на исходный объект: защита от «дрейфа» шаблона на фон.
      best.fixedScore = f ? f.score : 0;
      best.score = Math.max(a ? a.score : 0, best.fixedScore);
    }
    return best;
  }
}
