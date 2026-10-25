// Холст с кадром видео: масштабирование двумя пальцами / колёсиком, лупа,
// перетаскивание маркеров и постановка точек тапом.

const LOUPE_R = 56;
const LOUPE_ZOOM = 3;
const HIT_R = 30;

export class Viewer {
  constructor(wrap, video) {
    this.wrap = wrap;
    this.video = video;
    this.canvas = wrap.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.vw = 16;
    this.vh = 9;
    this.k = 1;
    this.o = { x: 0, y: 0 };
    this.cssW = 0;
    this.cssH = 0;
    this.dpr = 1;
    this.pointers = new Map();
    this.gesture = null;
    this.loupe = null;
    this.waitAllUp = false;
    // Настраивается текущим шагом:
    this.mode = 'pan';          // 'pan' — палец двигает картинку, 'place' — палец ставит точку
    this.hit = null;            // (screenPt) => handle | null, handle = { id, x, y }
    this.onDrag = null;         // (id, videoPt, done)
    this.onPlace = null;        // (videoPt)
    this.overlay = null;        // (ctx, viewer)

    this._bind();
    new ResizeObserver(() => this.resize()).observe(wrap);
  }

  setVideoSize(w, h) {
    this.vw = w;
    this.vh = h;
    this.resize(true);
  }

  resize(resetView = false) {
    const w = this.wrap.clientWidth;
    if (!w) return;
    const maxH = Math.max(200, window.innerHeight * 0.58);
    const h = Math.min(w * this.vh / this.vw, maxH);
    const changed = Math.abs(w - this.cssW) > 0.5 || Math.abs(h - this.cssH) > 0.5;
    this.cssW = w;
    this.cssH = h;
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.style.height = h + 'px';
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    if (resetView || changed) this.resetView();
    this.render();
  }

  get fit() { return Math.min(this.cssW / this.vw, this.cssH / this.vh); }

  resetView() {
    this.k = this.fit;
    this.o = { x: (this.cssW - this.vw * this.k) / 2, y: (this.cssH - this.vh * this.k) / 2 };
    this.render();
  }

  toScreen(p) { return { x: this.o.x + p.x * this.k, y: this.o.y + p.y * this.k }; }
  toVideo(s) { return { x: (s.x - this.o.x) / this.k, y: (s.y - this.o.y) / this.k }; }

  zoomAt(s, factor) {
    const k = Math.max(this.fit, Math.min(this.fit * 12, this.k * factor));
    const v = this.toVideo(s);
    this.k = k;
    this.o = { x: s.x - v.x * k, y: s.y - v.y * k };
    this.clampPan();
    this.render();
  }

  zoomBy(factor) { this.zoomAt({ x: this.cssW / 2, y: this.cssH / 2 }, factor); }

  clampPan() {
    const w = this.vw * this.k, h = this.vh * this.k;
    this.o.x = w <= this.cssW ? (this.cssW - w) / 2 : Math.min(0, Math.max(this.cssW - w, this.o.x));
    this.o.y = h <= this.cssH ? (this.cssH - h) / 2 : Math.min(0, Math.max(this.cssH - h, this.o.y));
  }

  // Показать точку p (в пикселях видео), если она ушла за край при увеличении.
  ensureVisible(p) {
    if (this.k <= this.fit * 1.01) return;
    const s = this.toScreen(p), m = 40;
    if (s.x < m || s.x > this.cssW - m || s.y < m || s.y > this.cssH - m) {
      this.o.x += this.cssW / 2 - s.x;
      this.o.y += this.cssH / 2 - s.y;
      this.clampPan();
    }
  }

  centerOn(p) {
    const s = this.toScreen(p);
    this.o.x += this.cssW / 2 - s.x;
    this.o.y += this.cssH / 2 - s.y;
    this.clampPan();
    this.render();
  }

  render() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => { this._raf = 0; this.draw(); });
  }

  drawFrame(ctx, k, o) {
    ctx.imageSmoothingEnabled = k < 3;
    if (this.video.readyState >= 2) ctx.drawImage(this.video, o.x, o.y, this.vw * k, this.vh * k);
  }

  draw() {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#14122b';
    ctx.fillRect(0, 0, this.cssW, this.cssH);
    this.drawFrame(ctx, this.k, this.o);
    if (this.overlay) this.overlay(ctx, this);
    if (this.loupe) this.drawLoupe(ctx);
  }

  drawLoupe(ctx) {
    const { finger, point } = this.loupe;
    let cx = finger.x, cy = finger.y - LOUPE_R - 48;
    if (cy < LOUPE_R + 4) cy = finger.y + LOUPE_R + 48;
    cx = Math.max(LOUPE_R + 4, Math.min(this.cssW - LOUPE_R - 4, cx));
    const kL = this.k * LOUPE_ZOOM;
    const oL = { x: cx - point.x * kL, y: cy - point.y * kL };
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, LOUPE_R, 0, Math.PI * 2);
    ctx.fillStyle = '#14122b';
    ctx.fill();
    ctx.clip();
    this.drawFrame(ctx, kL, oL);
    if (this.overlay) {
      const k = this.k, o = this.o;
      this.k = kL; this.o = oL;
      this.overlay(ctx, this, true);
      this.k = k; this.o = o;
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - LOUPE_R, cy); ctx.lineTo(cx - 6, cy);
    ctx.moveTo(cx + 6, cy); ctx.lineTo(cx + LOUPE_R, cy);
    ctx.moveTo(cx, cy - LOUPE_R); ctx.lineTo(cx, cy - 6);
    ctx.moveTo(cx, cy + 6); ctx.lineTo(cx, cy + LOUPE_R);
    ctx.stroke();
    ctx.strokeStyle = '#ff3b6b';
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(cx, cy, LOUPE_R, 0, Math.PI * 2);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
  }

  _pos(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  _bind() {
    const c = this.canvas;
    c.addEventListener('pointerdown', e => this._down(e));
    c.addEventListener('pointermove', e => this._move(e));
    c.addEventListener('pointerup', e => this._up(e, false));
    c.addEventListener('pointercancel', e => this._up(e, true));
    c.addEventListener('wheel', e => {
      e.preventDefault();
      this.zoomAt(this._pos(e), Math.exp(-e.deltaY * 0.0015));
    }, { passive: false });
    c.addEventListener('contextmenu', e => e.preventDefault());
  }

  _down(e) {
    e.preventDefault();
    try { this.canvas.setPointerCapture(e.pointerId); } catch { /* не критично */ }
    const s = this._pos(e);
    this.pointers.set(e.pointerId, s);
    if (this.pointers.size === 2) {
      // Щипок: отменяем текущий жест, точку не ставим.
      const [a, b] = [...this.pointers.values()];
      this.gesture = {
        type: 'pinch',
        dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        k: this.k, o: { ...this.o },
      };
      this.loupe = null;
      this.waitAllUp = true;
      this.render();
      return;
    }
    if (this.pointers.size > 2 || this.waitAllUp) return;
    const mouse = e.pointerType === 'mouse';
    if (mouse && e.button !== 0) { this.gesture = { type: 'pan', start: s, o: { ...this.o }, moved: true }; return; }
    const h = this.hit ? this.hit(s) : null;
    if (h) {
      const p = this.toVideo(s);
      this.gesture = { type: 'drag', id: h.id, off: { x: h.x - p.x, y: h.y - p.y } };
      this.loupe = { finger: s, point: { x: h.x, y: h.y } };
    } else if (this.mode === 'place' && !mouse) {
      this.gesture = { type: 'aim' };
      this.loupe = { finger: s, point: this.toVideo(s) };
    } else {
      this.gesture = { type: 'pan', start: s, o: { ...this.o }, moved: false, click: this.mode === 'place' };
    }
    this.render();
  }

  _move(e) {
    if (!this.pointers.has(e.pointerId)) return;
    const s = this._pos(e);
    this.pointers.set(e.pointerId, s);
    const g = this.gesture;
    if (!g) return;
    if (g.type === 'pinch' && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const k = Math.max(this.fit, Math.min(this.fit * 12, g.k * dist / g.dist));
      const v = { x: (g.mid.x - g.o.x) / g.k, y: (g.mid.y - g.o.y) / g.k };
      this.k = k;
      this.o = { x: mid.x - v.x * k, y: mid.y - v.y * k };
      this.clampPan();
      this.render();
    } else if (g.type === 'drag') {
      const p = this.toVideo(s);
      const q = { x: p.x + g.off.x, y: p.y + g.off.y };
      this.loupe = { finger: s, point: q };
      if (this.onDrag) this.onDrag(g.id, q, false);
      this.render();
    } else if (g.type === 'aim') {
      this.loupe = { finger: s, point: this.toVideo(s) };
      this.render();
    } else if (g.type === 'pan') {
      if (Math.hypot(s.x - g.start.x, s.y - g.start.y) > 6) g.moved = true;
      if (g.moved) {
        this.o = { x: g.o.x + s.x - g.start.x, y: g.o.y + s.y - g.start.y };
        this.clampPan();
        this.render();
      }
    }
  }

  _up(e, cancelled) {
    if (!this.pointers.has(e.pointerId)) return;
    const s = this._pos(e);
    this.pointers.delete(e.pointerId);
    const g = this.gesture;
    if (this.pointers.size === 0) this.waitAllUp = false;
    if (!g || g.type === 'pinch') {
      if (this.pointers.size === 0) this.gesture = null;
      return;
    }
    this.gesture = null;
    this.loupe = null;
    if (!cancelled) {
      if (g.type === 'aim' || (g.type === 'pan' && g.click && !g.moved)) {
        if (this.onPlace) this.onPlace(this.toVideo(s));
      } else if (g.type === 'drag') {
        const p = this.toVideo(s);
        if (this.onDrag) this.onDrag(g.id, { x: p.x + g.off.x, y: p.y + g.off.y }, true);
      }
    }
    this.render();
  }
}

// Попадание пальцем в маркер (в экранных координатах).
export function hitHandles(viewer, s, handles) {
  let best = null, bestD = HIT_R;
  for (const h of handles) {
    const p = viewer.toScreen(h);
    const d = Math.hypot(p.x - s.x, p.y - s.y);
    if (d < bestD) { best = h; bestD = d; }
  }
  return best;
}
