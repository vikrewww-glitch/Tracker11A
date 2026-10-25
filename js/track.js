// Шаг 3: ручной и автоматический трекинг объекта.
import { drawAxes } from './calibrate.js?v=20261025102439';
import { FrameGrabber, TemplateTracker } from './autotrack.js?v=20261025102439';
import { t } from './i18n.js?v=20261025102439';

const ACCEPT = 0.5;     // минимальная корреляция, чтобы принять точку
const REACQUIRE = 0.6;  // после пропуска нужна уверенность повыше
const MAX_MISS = 4;     // сколько кадров подряд можно «проскочить» по прогнозу

export function initTracking(app) {
  const { video, viewer, state } = app;
  const $ = s => document.querySelector(s);
  const grabber = new FrameGrabber(video.el);
  const tracker = new TemplateTracker();
  let running = false;
  let lastTap = null; // позиция рамки, если на текущем кадре ещё нет точки
  let status = null;  // { key, vars, kind } — перерисовывается при смене языка
  let runLabel = 'track.start';

  const boxSize = $('#boxSize'), autoRun = $('#autoRun'), autoStatus = $('#autoStatus'), endHere = $('#endHere');

  function inRange(f) { return f >= state.start && f <= state.end; }

  function setStatus(key, vars, kind = '') {
    status = key ? { key, vars, kind } : null;
    autoStatus.textContent = key ? t(key, vars) : '';
    autoStatus.className = 'status ' + kind;
    endHere.classList.toggle('hidden', key !== 'status.lost');
  }

  function setRunLabel(key) {
    runLabel = key;
    autoRun.textContent = t(key);
  }

  function updateCount() {
    let n = 0;
    for (const f of state.points.keys()) if (inRange(f)) n++;
    $('#pointCount').textContent = n;
    $('#delPoint').disabled = !state.points.has(video.current);
    app.changed();
  }

  function setMode(m) {
    if (running) stop();
    state.mode = m;
    document.querySelectorAll('#modeTabs button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
    document.querySelectorAll('[data-mode-panel]').forEach(p => p.classList.toggle('hidden', p.dataset.modePanel !== m));
    $('#trackLead').textContent = t(m === 'auto' ? 'track.leadAuto' : 'track.leadManual');
    viewer.render();
  }

  function onPlace(p) {
    if (running || video.busy) return;
    const f = video.current;
    if (!inRange(f)) {
      app.toast(t('toast.outOfRange'));
      return;
    }
    if (p.x < 0 || p.y < 0 || p.x > video.width || p.y > video.height) return;
    state.points.set(f, p);
    if (state.mode === 'manual') {
      const next = f + state.trackStep;
      if (next <= state.end) app.goto(next);
      else app.toast(t('toast.lastFrame'));
    } else {
      lastTap = p;
      setStatus('status.selected');
      if (runLabel !== 'track.resume') setRunLabel('track.start');
    }
    updateCount();
    viewer.render();
  }

  function overlay(ctx, v, inLoupe) {
    drawAxes(ctx, v, state.cal.axes, false);
    const frames = [...state.points.keys()].filter(inRange).sort((a, b) => a - b);
    // След траектории.
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255, 214, 10, 0.7)';
    ctx.beginPath();
    frames.forEach((f, i) => {
      const s = v.toScreen(state.points.get(f));
      if (i) ctx.lineTo(s.x, s.y); else ctx.moveTo(s.x, s.y);
    });
    ctx.stroke();
    for (const f of frames) {
      if (f === video.current) continue;
      const s = v.toScreen(state.points.get(f));
      ctx.beginPath();
      ctx.arc(s.x, s.y, inLoupe ? 3 : 4, 0, Math.PI * 2);
      ctx.fillStyle = '#ffd60a';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#1d1b3a';
      ctx.stroke();
    }
    const cur = state.points.get(video.current);
    if (cur) {
      const s = v.toScreen(cur);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#ff375f';
      ctx.beginPath();
      ctx.arc(s.x, s.y, 11, 0, Math.PI * 2);
      ctx.moveTo(s.x - 17, s.y); ctx.lineTo(s.x - 5, s.y);
      ctx.moveTo(s.x + 5, s.y); ctx.lineTo(s.x + 17, s.y);
      ctx.moveTo(s.x, s.y - 17); ctx.lineTo(s.x, s.y - 5);
      ctx.moveTo(s.x, s.y + 5); ctx.lineTo(s.x, s.y + 17);
      ctx.stroke();
    }
    if (state.mode === 'auto' && !inLoupe) {
      const c = cur || lastTap;
      if (c) {
        const s = v.toScreen(c), r = state.boxSize * v.k / 2;
        ctx.setLineDash([6, 4]);
        ctx.lineWidth = 2;
        ctx.strokeStyle = running ? '#30d158' : '#ffffff';
        ctx.beginPath();
        ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  // Прогноз положения на кадре f: парабола (постоянное ускорение) по методу наименьших квадратов
  // через 4–6 недавних точек; по трём — точно через них; по двум — с постоянной скоростью.
  function predict(f) {
    const prev = [...state.points.keys()].filter(k => k < f && inRange(k)).sort((a, b) => b - a).slice(0, 6);
    if (prev.length === 0) return null;
    const P = prev.map(k => state.points.get(k));
    if (prev.length === 1) return { p: P[0], known: 1, step: 0 };
    const recent = prev.filter(k => prev[0] - k <= 10 * state.trackStep);
    const out = p => ({ p, known: recent.length >= 3 ? 3 : 2, step: Math.hypot(p.x - P[0].x, p.y - P[0].y) });
    if (recent.length >= 3) {
      // Квадратичная аппроксимация x(u), y(u), u = k − f (прогноз — свободный член).
      let s0 = 0, s1 = 0, s2 = 0, s3 = 0, s4 = 0;
      const bx = [0, 0, 0], by = [0, 0, 0];
      recent.forEach((k, i) => {
        const u = k - f, u2 = u * u;
        s0 += 1; s1 += u; s2 += u2; s3 += u2 * u; s4 += u2 * u2;
        bx[0] += P[i].x; bx[1] += P[i].x * u; bx[2] += P[i].x * u2;
        by[0] += P[i].y; by[1] += P[i].y * u; by[2] += P[i].y * u2;
      });
      const det = s0 * (s2 * s4 - s3 * s3) - s1 * (s1 * s4 - s3 * s2) + s2 * (s1 * s3 - s2 * s2);
      if (Math.abs(det) > 1e-9) {
        const c0 = b => (b[0] * (s2 * s4 - s3 * s3) - s1 * (b[1] * s4 - s3 * b[2]) + s2 * (b[1] * s3 - s2 * b[2])) / det;
        return out({ x: c0(bx), y: c0(by) });
      }
    }
    const df = prev[0] - prev[1], k = f - prev[0];
    return out({ x: P[0].x + (P[0].x - P[1].x) / df * k, y: P[0].y + (P[0].y - P[1].y) / df * k });
  }

  function stop() {
    running = false;
    setRunLabel('track.resume');
    autoRun.classList.remove('running');
  }

  async function run() {
    const start = video.current;
    const p0 = state.points.get(start);
    if (!inRange(start)) { app.toast(t('toast.outOfRange')); return; }
    if (!p0) { app.toast(t('toast.tapFirst')); return; }
    let img = grabber.grab();
    const s = img.scale;
    const c0 = tracker.init(img, p0.x * s, p0.y * s, state.boxSize * s);
    state.points.set(start, { x: c0.x / s, y: c0.y / s });
    if (tracker.contrast < 4) {
      setStatus('status.lowContrast', null, 'bad');
      return;
    }
    running = true;
    setRunLabel('track.stop');
    autoRun.classList.add('running');
    setStatus('status.tracking', { n: start, end: state.end });
    let f = start, miss = 0;
    const n = tracker.n;
    while (running) {
      const next = f + state.trackStep;
      if (next > state.end) {
        stop();
        setRunLabel('track.start');
        setStatus('status.done', null, 'good');
        break;
      }
      const pr = predict(next);
      await app.goto(next);
      if (!running) break;
      img = grabber.grab();
      // Радиус поиска (в пикселях обработки): шире, если скорость ещё неизвестна или были пропуски.
      const step = pr.step * s;
      let R = pr.known === 1 ? Math.max(2.5 * n, 40)
        : pr.known === 2 ? 0.5 * n + 0.6 * step + 10
        : 0.4 * n + 0.25 * step + 8;
      R *= 1 + 0.35 * miss;
      let m = tracker.match(img, pr.p.x * s, pr.p.y * s, R, pr.known === 1 ? 0.1 : 0.3);
      const d = m ? Math.hypot(m.x - pr.p.x * s, m.y - pr.p.y * s) : Infinity;
      if (pr.known === 1 && m && d < 0.3 * n && m.score < 0.75) {
        // Первый шаг: на месте старта остался фон, а объект уже улетел — ищем в стороне.
        const m2 = tracker.match(img, pr.p.x * s, pr.p.y * s, R, 0.1, { x: pr.p.x * s, y: pr.p.y * s, r: 0.5 * n });
        if (m2 && m2.score >= 0.4) m = m2;
      }
      // Точка принимается при высокой корреляции или при умеренной, но там, где её предсказывает траектория.
      const near = pr.known >= 2 && d <= Math.max(3, 0.25 * n + 0.15 * step);
      // Физическая правдоподобность: при известной траектории точка не может сильно отойти от параболы.
      const plausible = pr.known < 3 ? d <= 0.6 * R : d <= Math.max(4, 0.3 * n) * (1 + 0.5 * miss);
      const strong = m && m.score >= (miss ? REACQUIRE : ACCEPT) && plausible;
      // fixedScore — сходство с исходным объектом: рядом с прогнозом достаточно слабого, вдали — нужно заметное.
      const ok = m && ((strong && m.fixedScore >= 0.3) || (near && m.score >= 0.3 && m.fixedScore >= 0.2) ||
        (pr.known === 1 && d >= 0.3 * n && m.score >= 0.4 && m.fixedScore >= 0.3));
      if (window.__trackLog) window.__trackLog.push({ f: next, score: m && +m.score.toFixed(3), R: +R.toFixed(1), known: pr.known, miss, fx: m && +m.fixedScore.toFixed(3), x: m && m.x / s, y: m && m.y / s, px: pr.p.x, py: pr.p.y });
      if (ok) {
        state.points.set(next, { x: m.x / s, y: m.y / s });
        // Шаблон обновляем, пока найденное место похоже на исходный объект, — иначе он может «впитать» фон.
        if (m.fixedScore >= 0.35) tracker.update(img, m.x, m.y, m.score > 0.75 ? 0.25 : 0.15);
        miss = 0;
      } else if (++miss > MAX_MISS || pr.known === 1) {
        stop();
        lastTap = pr.p;
        setStatus('status.lost', { n: next }, 'bad');
        viewer.render();
        break;
      }
      f = next;
      setStatus('status.tracking', { n: f, end: state.end });
      if (ok) viewer.ensureVisible(state.points.get(f));
      updateCount();
      viewer.render();
      await new Promise(r => requestAnimationFrame(r));
    }
    updateCount();
  }

  document.querySelectorAll('#modeTabs button').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
  autoRun.addEventListener('click', () => {
    if (running) { stop(); setStatus('status.stopped'); } else run();
  });
  // Движение закончилось: конечный кадр — последний отслеженный.
  endHere.addEventListener('click', () => {
    const done = [...state.points.keys()].filter(inRange);
    if (!done.length) return;
    state.end = Math.max(...done);
    app.setFrameRange(state.start, state.end);
    app.goto(state.end);
    setRunLabel('track.start');
    setStatus('status.endSet', { n: state.end }, 'good');
    updateCount();
  });
  boxSize.addEventListener('input', () => {
    state.boxSize = +boxSize.value;
    viewer.render();
  });
  $('#stepSelect').addEventListener('change', e => { state.trackStep = +e.target.value; });
  $('#delPoint').addEventListener('click', () => {
    state.points.delete(video.current);
    updateCount();
    viewer.render();
  });
  $('#clearPoints').addEventListener('click', () => {
    if (!state.points.size || !confirm(t('track.confirmClear'))) return;
    if (running) stop();
    state.points.clear();
    lastTap = null;
    setStatus(null);
    setRunLabel('track.start');
    updateCount();
    viewer.render();
  });

  setRunLabel('track.start');

  return {
    enter() {
      viewer.mode = 'place';
      viewer.hit = null;
      viewer.onDrag = null;
      viewer.onPlace = onPlace;
      viewer.overlay = overlay;
      const minDim = Math.min(video.width, video.height);
      boxSize.max = Math.max(20, Math.round(minDim * 0.5));
      if (!state.boxSize) state.boxSize = Math.round(minDim * 0.08);
      boxSize.value = state.boxSize;
      app.paintRange(boxSize);
      app.setFrameRange(state.start, state.end);
      if (!inRange(video.current)) {
        const done = [...state.points.keys()].filter(inRange);
        app.goto(done.length ? Math.min(state.end, Math.max(...done) + state.trackStep) : state.start);
      }
      setMode(state.mode);
      updateCount();
    },
    leave() { if (running) stop(); },
    onFrame() {
      if (!running) {
        lastTap = state.points.get(video.current) || lastTap;
      }
      $('#delPoint').disabled = !state.points.has(video.current);
    },
    relabel() {
      setMode(state.mode);
      autoRun.textContent = t(runLabel);
      if (status) setStatus(status.key, status.vars, status.kind);
    },
    stopAuto() { if (running) { stop(); setStatus('status.stopped'); } },
    get running() { return running; },
    valid() {
      let n = 0;
      for (const f of state.points.keys()) if (inRange(f)) n++;
      return n >= 3;
    },
  };
}
