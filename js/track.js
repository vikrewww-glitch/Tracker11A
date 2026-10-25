// Шаг 3: ручной и автоматический трекинг объекта.
import { drawAxes } from './calibrate.js?v=20261025095113';
import { FrameGrabber, TemplateTracker } from './autotrack.js?v=20261025095113';

const LOST_SCORE = 0.6;

export function initTracking(app) {
  const { video, viewer, state } = app;
  const $ = s => document.querySelector(s);
  const grabber = new FrameGrabber(video.el);
  const tracker = new TemplateTracker();
  let running = false;
  let lastTap = null; // позиция рамки, если на текущем кадре ещё нет точки

  const boxSize = $('#boxSize'), autoRun = $('#autoRun'), autoStatus = $('#autoStatus');

  function inRange(f) { return f >= state.start && f <= state.end; }

  function setStatus(text, kind = '') {
    autoStatus.textContent = text;
    autoStatus.className = 'status ' + kind;
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
    $('#trackLead').textContent = m === 'auto'
      ? 'Tap the object once and size the box around it. Tracking then follows it frame by frame.'
      : 'Tap the center of the object. The video advances to the next frame automatically.';
    viewer.render();
  }

  function onPlace(p) {
    if (running || video.busy) return;
    const f = video.current;
    if (!inRange(f)) {
      app.toast('This frame is outside the selected range');
      return;
    }
    if (p.x < 0 || p.y < 0 || p.x > video.width || p.y > video.height) return;
    state.points.set(f, p);
    if (state.mode === 'manual') {
      const next = f + state.trackStep;
      if (next <= state.end) app.goto(next);
      else app.toast('Last frame reached — on to the results');
    } else {
      lastTap = p;
      setStatus('Object selected. Tap Start Tracking.');
      autoRun.textContent = 'Start Tracking';
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
        const s = v.toScreen(c), half = state.boxSize * v.k / 2;
        ctx.setLineDash([6, 4]);
        ctx.lineWidth = 2;
        ctx.strokeStyle = running ? '#30d158' : '#ffffff';
        ctx.strokeRect(s.x - half, s.y - half, half * 2, half * 2);
        ctx.setLineDash([]);
      }
    }
  }

  // Прогноз положения на кадре f по двум последним точкам (постоянная скорость).
  function predict(f) {
    const prev = [...state.points.keys()].filter(k => k < f && inRange(k)).sort((a, b) => b - a);
    const p1 = state.points.get(prev[0]);
    if (prev.length < 2) return { p: p1, v: null };
    const p0 = state.points.get(prev[1]);
    const df = prev[0] - prev[1];
    const vx = (p1.x - p0.x) / df, vy = (p1.y - p0.y) / df;
    const k = f - prev[0];
    return { p: { x: p1.x + vx * k, y: p1.y + vy * k }, v: Math.hypot(vx, vy) * k };
  }

  function stop() {
    running = false;
    autoRun.textContent = 'Resume';
    autoRun.classList.remove('running');
  }

  async function run() {
    const start = video.current;
    const p0 = state.points.get(start);
    if (!inRange(start)) { app.toast('This frame is outside the selected range'); return; }
    if (!p0) { app.toast('Tap the object first'); return; }
    let img = grabber.grab();
    const s = img.scale;
    tracker.init(img, p0.x * s, p0.y * s, state.boxSize * s);
    if (tracker.contrast < 4) {
      setStatus('The object blends into the background. Try a larger box.', 'bad');
      return;
    }
    running = true;
    autoRun.textContent = 'Stop';
    autoRun.classList.add('running');
    let f = start;
    while (running) {
      const next = f + state.trackStep;
      if (next > state.end) {
        stop();
        autoRun.textContent = 'Start Tracking';
        setStatus('Done — tracked to the end frame.', 'good');
        break;
      }
      const { p, v } = predict(next);
      await app.goto(next);
      if (!running) break;
      img = grabber.grab();
      const R = (v == null ? Math.max(3 * tracker.n, 40 * s) : Math.max(tracker.n, 16 * s + 0.5 * v * s));
      const m = tracker.match(img, p.x * s, p.y * s, R);
      if (m.score < LOST_SCORE) {
        stop();
        setStatus(`Lost the object at frame ${next}. Tap it, then tap Resume.`, 'bad');
        lastTap = p;
        viewer.render();
        break;
      }
      state.points.set(next, { x: m.x / s, y: m.y / s });
      if (m.score > 0.8) tracker.update(img, m.x, m.y);
      f = next;
      setStatus(`Tracking… frame ${f} of ${state.end}`);
      viewer.ensureVisible(state.points.get(f));
      updateCount();
      viewer.render();
      await new Promise(r => requestAnimationFrame(r));
    }
    updateCount();
  }

  document.querySelectorAll('#modeTabs button').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
  autoRun.addEventListener('click', () => {
    if (running) { stop(); setStatus('Stopped.'); } else run();
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
    if (!state.points.size || !confirm('Remove all marked points?')) return;
    if (running) stop();
    state.points.clear();
    lastTap = null;
    setStatus('');
    autoRun.textContent = 'Start Tracking';
    updateCount();
    viewer.render();
  });

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
    stopAuto() { if (running) { stop(); setStatus('Stopped.'); } },
    get running() { return running; },
    valid() {
      let n = 0;
      for (const f of state.points.keys()) if (inRange(f)) n++;
      return n >= 3;
    },
  };
}
