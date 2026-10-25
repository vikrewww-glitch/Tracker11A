// Видео: загрузка, определение FPS и точный покадровый переход.
import { readMp4Timing } from './mp4fps.js?v=20261025111844';

const COMMON_FPS = [10, 12, 15, 20, 23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60, 90, 100, 120, 240];

function snapFps(fps) {
  let best = fps, bestErr = Infinity;
  for (const f of COMMON_FPS) {
    const err = Math.abs(f - fps) / f;
    if (err < bestErr) { best = f; bestErr = err; }
  }
  return bestErr < 0.015 ? best : Math.round(fps * 100) / 100;
}

function waitEvent(el, ok, fail = 'error', timeout = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error('timeout')); }, timeout);
    const onOk = () => { cleanup(); resolve(); };
    const onFail = () => { cleanup(); reject(new Error('decode')); };
    function cleanup() {
      clearTimeout(timer);
      el.removeEventListener(ok, onOk);
      el.removeEventListener(fail, onFail);
    }
    el.addEventListener(ok, onOk);
    el.addEventListener(fail, onFail);
  });
}

export class VideoSource {
  constructor(el) {
    this.el = el;
    this.reset();
    this.onframe = null;
  }

  reset() {
    this.name = '';
    this.width = 0;
    this.height = 0;
    this.duration = 0;
    this.fps = 30;
    this.fileFps = null;
    this.fileTimes = null;
    this.frameTimes = null;
    this.fpsSource = '';
    this.variableFps = false;
    this.frameCount = 0;
    this.current = 0;
    this.busy = false;
    this._want = null;
    this._loop = null;
  }

  get loaded() { return this.frameCount > 0; }

  async load(file) {
    const el = this.el;
    if (el.src) URL.revokeObjectURL(el.src);
    this.reset();
    this.name = file.name || 'video';
    el.src = URL.createObjectURL(file);
    el.load();
    await waitEvent(el, 'loadedmetadata');
    if (!el.videoWidth || !isFinite(el.duration)) throw new Error('decode');
    if (el.readyState < 2) await waitEvent(el, 'loadeddata', 'error', 8000).catch(() => {});
    this.width = el.videoWidth;
    this.height = el.videoHeight;
    this.duration = el.duration;

    const timing = await readMp4Timing(file).catch(() => null);
    if (timing && timing.fps > 1 && timing.fps < 1000 &&
        Math.abs(timing.times.length / timing.fps - this.duration) < Math.max(1, this.duration * 0.2)) {
      this.fileTimes = timing.times;
      this.fileFps = timing.fps;
      this.frameTimes = timing.times;
      this.fps = timing.fps;
      this.variableFps = timing.variable;
      this.fpsSource = 'file';
    } else {
      const est = await this.estimateFps();
      this.fps = est || 30;
      this.fpsSource = est ? 'estimate' : 'default';
    }
    this.frameCount = this.frameTimes ? this.frameTimes.length : Math.max(1, Math.floor(this.duration * this.fps + 1e-6));
    this.current = -1;
    await this.goto(0);
  }

  // Оценка FPS по реальному воспроизведению (если в файле нет таблицы кадров).
  estimateFps() {
    const v = this.el;
    if (!v.requestVideoFrameCallback) return Promise.resolve(null);
    return new Promise(resolve => {
      const times = [];
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        v.pause();
        const d = [];
        for (let i = 1; i < times.length; i++) {
          const dt = times[i] - times[i - 1];
          if (dt > 1e-4) d.push(dt);
        }
        if (d.length < 5) { resolve(null); return; }
        d.sort((a, b) => a - b);
        resolve(snapFps(1 / d[Math.floor(d.length / 2)]));
      };
      const cb = (now, meta) => {
        times.push(meta.mediaTime);
        if (times.length < 40 && !done) v.requestVideoFrameCallback(cb); else finish();
      };
      v.requestVideoFrameCallback(cb);
      setTimeout(finish, 3000);
      v.currentTime = 0;
      v.play().catch(finish);
    });
  }

  // Ручная установка FPS: равномерная сетка кадров.
  setFps(fps) {
    if (!(fps > 0)) return;
    if (this.fileFps && Math.abs(fps - this.fileFps) < 0.005) {
      this.frameTimes = this.fileTimes;
      this.fps = this.fileFps;
      this.fpsSource = 'file';
    } else {
      this.frameTimes = null;
      this.fps = fps;
      this.fpsSource = 'manual';
    }
    this.frameCount = this.frameTimes ? this.frameTimes.length : Math.max(1, Math.floor(this.duration * this.fps + 1e-6));
  }

  // Время кадра n (секунды от начала видео).
  timeOf(n) {
    return this.frameTimes ? this.frameTimes[n] : n / this.fps;
  }

  // Куда перематывать, чтобы гарантированно попасть на кадр n: в середину кадра.
  seekTarget(n) {
    let t;
    if (this.frameTimes) {
      const a = this.frameTimes[n];
      const b = n + 1 < this.frameTimes.length ? this.frameTimes[n + 1] : a + 1 / this.fps;
      t = (a + b) / 2;
    } else {
      t = (n + 0.5) / this.fps;
    }
    return Math.min(t, Math.max(0, this.duration - 0.0005));
  }

  clampFrame(n) {
    return Math.max(0, Math.min(this.frameCount - 1, Math.round(n)));
  }

  // Переход на кадр. Быстрые повторные вызовы схлопываются: показывается последний запрошенный.
  goto(n) {
    this._want = this.clampFrame(n);
    if (!this._loop) {
      this.busy = true;
      this._loop = this._run().finally(() => { this._loop = null; this.busy = false; });
    }
    return this._loop;
  }

  async _run() {
    while (this._want !== null) {
      const n = this._want;
      this._want = null;
      await this._seek(this.seekTarget(n));
      this.current = n;
      if (this.onframe) this.onframe(n);
    }
  }

  _seek(t) {
    const v = this.el;
    return new Promise(resolve => {
      if (Math.abs(v.currentTime - t) < 1e-5 && v.readyState >= 2 && !v.seeking) { resolve(); return; }
      let done = false, frameShown = false, seeked = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        v.removeEventListener('seeked', onSeeked);
        resolve();
      };
      const hasRvfc = !!v.requestVideoFrameCallback;
      // Ждём не только seeked, но и фактического показа нового кадра.
      if (hasRvfc) v.requestVideoFrameCallback(() => { frameShown = true; if (seeked) finish(); });
      const onSeeked = () => {
        seeked = true;
        if (frameShown || !hasRvfc) finish(); else setTimeout(finish, 80);
      };
      v.addEventListener('seeked', onSeeked);
      const timer = setTimeout(finish, 4000);
      v.currentTime = t;
    });
  }
}
