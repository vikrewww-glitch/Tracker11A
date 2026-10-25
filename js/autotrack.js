// Авто-трекинг: поиск шаблона по цветной нормированной корреляции (NCC)
// с круглой маской, двухуровневым поиском (грубо на уменьшенном кадре, точно на полном)
// и штрафом за удаление от прогноза траектории.

const PROC_MAX = 640;  // размер стороны кадра для обработки по умолчанию
const MOTION_REF = 10; // разница яркости между кадрами, которую считаем «движением»

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
  const g = new Float32Array(w * h);
  for (let i = 0; i < g.length; i++) g[i] = (c[0][i] + c[1][i] + c[2][i]) / 3;
  return { w, h, c, g };
}

// Общее изменение яркости кадра (мерцание света, автоэкспозиция телефона):
// типичная разница между кадрами, которую не считаем движением объекта.
function globalChange(cur, prev) {
  const d = [];
  for (let i = 0; i < cur.g.length; i += 7) d.push(Math.abs(cur.g[i] - prev.g[i]));
  d.sort((a, b) => a - b);
  return d[Math.floor(d.length * 0.6)] || 0;
}

// Карта движения: интегральное изображение |яркость сейчас − яркость на прошлом кадре|
// за вычетом общего изменения яркости.
function motionMap(cur, prev) {
  if (!prev || prev.w !== cur.w || prev.h !== cur.h) return null;
  const w = cur.w, h = cur.h, I = new Float64Array((w + 1) * (h + 1));
  const base = 1.5 * globalChange(cur, prev);
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += Math.max(0, Math.abs(cur.g[y * w + x] - prev.g[y * w + x]) - base);
      I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row;
    }
  }
  return { I, w, h };
}

// Среднее значение карты (интегрального изображения) в квадрате радиуса r вокруг (cx, cy).
function boxMean(map, cx, cy, r) {
  const x0 = Math.max(0, Math.round(cx - r)), x1 = Math.min(map.w, Math.round(cx + r) + 1);
  const y0 = Math.max(0, Math.round(cy - r)), y1 = Math.min(map.h, Math.round(cy + r) + 1);
  const W = map.w + 1, I = map.I;
  const area = (x1 - x0) * (y1 - y0);
  if (area <= 0) return 0;
  return (I[y1 * W + x1] - I[y0 * W + x1] - I[y1 * W + x0] + I[y0 * W + x0]) / area;
}

// Доля «движения» вокруг (cx, cy): 0 — фон неподвижен, 1 — заметно меняется.
function motionAt(mot, cx, cy, r) {
  return Math.min(1, boxMean(mot, cx, cy, r) / MOTION_REF);
}

export class FrameGrabber {
  constructor(video) {
    this.video = video;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
  }

  // Возвращает { w, h, c: [R, G, B], half, scale } — scale: пикс. обработки на пикс. видео.
  grab(scale) {
    const v = this.video;
    if (!scale) scale = Math.min(1, PROC_MAX / Math.max(v.videoWidth, v.videoHeight));
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

// ---------- Цветовая модель объекта (как в CamShift) ----------
// Гистограмма хроматичности (r/s, g/s) объекта против гистограммы всего кадра:
// оттенки, частые в кадре (стены, плитка, кожа), получают низкую «вероятность объекта».
// Хроматичность не зависит от яркости, поэтому тень и солнце не мешают.
const CB = 64;

function chromaBin(r, g, b) {
  const s = r + g + b;
  if (s < 60) return -1;
  return Math.min(CB - 1, (r / s * CB) | 0) * CB + Math.min(CB - 1, (g / s * CB) | 0);
}

function smoothHist(h) {
  const out = new Float32Array(h.length);
  let sum = 0;
  for (let i = 0; i < CB; i++) {
    for (let j = 0; j < CB; j++) {
      let v = 0;
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        const a = i + di, b = j + dj;
        if (a >= 0 && a < CB && b >= 0 && b < CB) v += h[a * CB + b] * (di || dj ? 0.25 : 1);
      }
      out[i * CB + j] = v;
      sum += v;
    }
  }
  if (sum > 0) for (let i = 0; i < out.length; i++) out[i] /= sum;
  return out;
}

export class ColorModel {
  // T — шаблон (круг вокруг точки старта).
  constructor(img, cx, cy, T) {
    const ho = new Float32Array(CB * CB), hf = new Float32Array(CB * CB);
    const [R, G, B] = img.c;
    let no = 0;
    const objBins = [];
    // Цвет объекта берём в основном из середины рамки (вес убывает к краям):
    // под пальцем почти всегда сам объект, а у краёв — то, что рядом (руки, фон).
    const sig2 = (0.5 * T.half) ** 2;
    for (let k = 0; k < T.m; k++) {
      const x = Math.round(cx + T.dx[k]), y = Math.round(cy + T.dy[k]);
      if (x < 0 || y < 0 || x >= img.w || y >= img.h) continue;
      const i = y * img.w + x, bin = chromaBin(R[i], G[i], B[i]);
      if (bin < 0) continue;
      const g = Math.exp(-(T.dx[k] ** 2 + T.dy[k] ** 2) / sig2);
      ho[bin] += g;
      if (g > 0.3) { no++; objBins.push(bin); }
    }
    const frameBins = [];
    for (let y = 0; y < img.h; y += 2) {
      for (let x = 0; x < img.w; x += 2) {
        const i = y * img.w + x, bin = chromaBin(R[i], G[i], B[i]);
        if (bin >= 0) { hf[bin]++; if ((x + y) % 8 === 0) frameBins.push(bin); }
      }
    }
    const o = smoothHist(ho), f = smoothHist(hf);
    this.lut = new Float32Array(CB * CB);
    for (let i = 0; i < this.lut.length; i++) this.lut[i] = o[i] / (o[i] + f[i] + 1e-6);
    // Радиус «цветового пятна» объекта и насколько его цвет вообще отличается от кадра.
    this.r = Math.max(2, Math.sqrt(no / Math.PI));
    const mean = bins => bins.reduce((a, b) => a + this.lut[b], 0) / Math.max(1, bins.length);
    this.objP = mean(objBins);
    this.frameP = mean(frameBins);
    this.no = no;
    this.useful = no >= 12 && this.objP - this.frameP > 0.35;
  }

  // Радиус объекта: площадь пикселей «цвета объекта» внутри круга радиуса R.
  objectRadius(img, cx, cy, R) {
    let cnt = 0;
    for (let y = Math.max(0, Math.floor(cy - R)); y <= Math.min(img.h - 1, Math.ceil(cy + R)); y++) {
      for (let x = Math.max(0, Math.floor(cx - R)); x <= Math.min(img.w - 1, Math.ceil(cx + R)); x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= R * R && this.p(img, y * img.w + x) > 0.5) cnt++;
      }
    }
    return cnt >= 12 ? Math.sqrt(cnt / Math.PI) : 0;
  }

  p(img, i) {
    const bin = chromaBin(img.c[0][i], img.c[1][i], img.c[2][i]);
    return bin < 0 ? 0 : this.lut[bin];
  }

  // Интегральное изображение вероятности объекта (для быстрой оценки кандидатов).
  // prev — прошлый кадр: если объект движется, неподвижные пиксели похожего цвета (освещённая
  // брусчатка, кожа, одежда) весят меньше.
  map(img, prev = null) {
    const w = img.w, h = img.h, I = new Float64Array((w + 1) * (h + 1));
    const moving = prev && prev.w === w && prev.h === h;
    const base = moving ? 1.5 * globalChange(img, prev) : 0;
    for (let y = 0; y < h; y++) {
      let row = 0;
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        let p = this.p(img, i);
        if (moving && p > 0) p *= Math.min(1, 0.2 + Math.max(0, Math.abs(img.g[i] - prev.g[i]) - base) / 12);
        row += p;
        I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row;
      }
    }
    return { I, w, h };
  }

  // Mean-shift: сдвигаем круг к центру масс пикселей цвета объекта. Устойчиво к вращению и швам.
  // prev — прошлый кадр: если объект движется, неподвижные пиксели того же цвета весят меньше.
  refine(img, x, y, prev = null) {
    const moving = prev && prev.w === img.w && prev.h === img.h;
    const r = this.r * 1.25, r2 = r * r, area = Math.PI * r2;
    let support = 0;
    for (let it = 0; it < 8; it++) {
      let sx = 0, sy = 0, sp = 0, raw = 0;
      const x0 = Math.max(0, Math.floor(x - r)), x1 = Math.min(img.w - 1, Math.ceil(x + r));
      const y0 = Math.max(0, Math.floor(y - r)), y1 = Math.min(img.h - 1, Math.ceil(y + r));
      for (let yy = y0; yy <= y1; yy++) {
        for (let xx = x0; xx <= x1; xx++) {
          if ((xx - x) ** 2 + (yy - y) ** 2 > r2) continue;
          const i = yy * img.w + xx;
          let p = this.p(img, i);
          if (p < 0.2) continue;
          raw += p;
          if (moving) {
            const diff = Math.abs(img.c[0][i] + img.c[1][i] + img.c[2][i] - prev.c[0][i] - prev.c[1][i] - prev.c[2][i]) / 3;
            p *= Math.min(1, 0.3 + diff / 15);
          }
          sx += p * xx; sy += p * yy; sp += p;
        }
      }
      support = raw / area;
      if (sp < 1e-3) return null;
      const nx = sx / sp, ny = sy / sp, shift = Math.hypot(nx - x, ny - y);
      x = nx; y = ny;
      if (shift < 0.05) break;
    }
    return { x, y, support };
  }
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

  // Центр «объектных» пикселей (с большим весом) относительно центра рамки.
  objectCenter() {
    let sx = 0, sy = 0, sw = 0;
    for (let k = 0; k < this.m; k++) {
      const w = this.w[k] > 0.5 ? this.w[k] : 0;
      sx += w * this.dx[k]; sy += w * this.dy[k]; sw += w;
    }
    if (sw < 0.1 * this.m || sw > 0.9 * this.m) return null;
    return { x: sx / sw, y: sy / sw };
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
function search(img, T, px, py, R, pen, ex = null, mot = null, col = null) {
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
      let eff = sc - pen * d2 / R2;
      // Неподвижный фон (ноги, перила, стены) получает штраф, если объект должен двигаться.
      if (mot) eff -= mot.gamma * (1 - motionAt(mot, cx, cy, mot.r));
      // Цвет объекта: кандидаты, где пикселей «цвета объекта» больше, получают бонус.
      if (col) eff += col.lambda * boxMean(col, cx, cy, col.r);
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
  const motion = mot ? motionAt(mot, x0 + bi, y0 + bj, mot.r) : 1;
  return { x: x0 + bi + dx, y: y0 + bj + dy, score: at(bi, bj), eff: best, edge, motion };
}

// Координаты: полный кадр ↔ уменьшенный вдвое (центр пикселя 2i+0.5).
const toHalf = v => (v - 0.5) / 2;
const fromHalf = v => v * 2 + 0.5;

export class TemplateTracker {
  // cx, cy, size — в пикселях обработки. Возвращает центр объекта (может немного сместиться:
  // рамка центрируется на самом объекте, а не на месте тапа).
  init(img, cx, cy, size) {
    this.n = Math.max(9, Math.round(size) | 1);
    for (let pass = 0; pass < 2; pass++) {
      this._build(img, cx, cy);
      const c = this.fixed.objectCenter();
      if (!c || Math.hypot(c.x, c.y) < 1 || Math.hypot(c.x, c.y) > 0.35 * this.n) break;
      cx += c.x;
      cy += c.y;
    }
    // Цветовая модель; если цвет объекта отличается от кадра — центрируем точку по цветовому пятну
    // и подгоняем размер шаблона под сам объект (рамка пользователя может быть с запасом).
    this.color = new ColorModel(img, cx, cy, this.fixed);
    if (this.color.useful) {
      const r = this.color.refine(img, cx, cy);
      if (r && r.support > 0.3 && Math.hypot(r.x - cx, r.y - cy) < 0.35 * this.n) {
        cx = r.x;
        cy = r.y;
      }
      const ro = this.color.objectRadius(img, cx, cy, this.n / 2);
      const n = Math.max(9, Math.round(2.3 * ro) | 1);
      if (ro && n < 0.85 * this.n) this.n = n;
      this._build(img, cx, cy);
      this.color.r = Math.max(2, ro || this.color.r);
    }
    return { x: cx, y: cy };
  }

  _build(img, cx, cy) {
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
  // prev — предыдущий кадр (для учёта движения), gamma — сила штрафа за неподвижность.
  match(img, px, py, R, pen = 0.25, ex = null, prev = null, gamma = 0) {
    const exHalf = ex && { x: toHalf(ex.x), y: toHalf(ex.y), r: ex.r / 2 };
    const mm = gamma > 0 && prev ? motionMap(img.half, prev.half) : null;
    const mot = mm && { ...mm, r: Math.max(2, this.fixedHalf.half), gamma };
    const useColor = this.color && this.color.useful;
    const col = useColor && R > 6 ? { ...this.color.map(img.half, gamma > 0 && prev ? prev.half : null), r: Math.max(1, 0.6 * this.color.r / 2), lambda: 0.4 } : null;
    let motion = 1;
    let cx = px, cy = py;
    let fineR = R;
    if (R > 6) {
      // Грубый поиск на уменьшенном кадре по обоим шаблонам.
      const a = search(img.half, this.adaptHalf, toHalf(px), toHalf(py), R / 2, pen, exHalf, mot, col);
      const b = search(img.half, this.fixedHalf, toHalf(px), toHalf(py), R / 2, pen, exHalf, mot, col);
      const c = !a ? b : !b ? a : (a.eff >= b.eff ? a : b);
      if (!c) return null;
      motion = c.motion;
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
      best.motion = motion;
      best.color = 0;
      if (useColor) {
        // Итоговая точка — центр цветового пятна объекта (если оно уверенно найдено рядом).
        const r = this.color.refine(img, best.x, best.y, gamma > 0 ? prev : null);
        const shift = r ? Math.hypot(r.x - best.x, r.y - best.y) : Infinity;
        if (r && r.support > 0.3 && shift < 0.5 * this.n) {
          best.color = r.support;
          // Уверенное совпадение узора точнее центра цветового пятна (субпиксельный пик) — оставляем его;
          // если узор совпал плохо (вращение, швы), берём центр цвета.
          if (!(best.score >= 0.85 && shift < 0.2 * this.n)) {
            best.x = r.x;
            best.y = r.y;
          }
        }
      }
    }
    return best;
  }
}
