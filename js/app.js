// Мастер шагов 1 → 4 и общее состояние приложения.
import { VideoSource } from './video.js';
import { Viewer } from './viewer.js';
import { initCalibration, defaultCalibration } from './calibrate.js';
import { initTracking } from './track.js';
import { initResults } from './results.js';
import { toWorld } from './physics.js';
import { tableText } from './export.js';

const $ = s => document.querySelector(s);

const state = {
  step: 1,
  cal: defaultCalibration(16, 9),
  start: 0,
  end: 0,
  points: new Map(),   // номер кадра → { x, y } в пикселях видео
  mode: 'manual',
  trackStep: 1,
  boxSize: 0,
  smoothing: 'none',
  quantity: 'y',
  comma: true,
};

const video = new VideoSource($('#video'));
const viewerEl = $('#viewerTpl').content.firstElementChild.cloneNode(true);
$('#step2 .viewer-slot').appendChild(viewerEl);
const viewer = new Viewer(viewerEl.querySelector('.canvaswrap'), video.el);

let toastTimer = 0;
let busyTimer = 0;
let range = [0, 0];

const app = {
  state, video, viewer,
  toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  },
  goto(n) {
    clearTimeout(busyTimer);
    busyTimer = setTimeout(() => viewerEl.querySelector('.busy').classList.remove('hidden'), 250);
    return video.goto(Math.max(range[0], Math.min(range[1], n))).finally(() => {
      if (!video.busy) {
        clearTimeout(busyTimer);
        viewerEl.querySelector('.busy').classList.add('hidden');
      }
    });
  },
  setFrameRange(a, b) {
    range = [a, b];
    const s = $('#frameSlider');
    s.min = a;
    s.max = b;
    s.value = video.current;
    updateFrameInfo();
  },
  // Точки в метрах и секундах, отсортированные по времени.
  samples() {
    const t0 = video.timeOf(state.start);
    return [...state.points.keys()]
      .filter(f => f >= state.start && f <= state.end)
      .sort((a, b) => a - b)
      .map(f => ({ frame: f, t: video.timeOf(f) - t0, ...toWorld(state.points.get(f), state.cal) }));
  },
  changed() {
    viewer.render();
    refreshNav();
  },
};
window.__app = app; // для отладки и автотестов

const calibration = initCalibration(app);
const tracking = initTracking(app);
const results = initResults(app);
const steps = { 2: calibration, 3: tracking, 4: results };
app.resultsSeries = () => results.series;
app.exportText = (sep, comma) => tableText(results.series, sep, comma);

// ---------- Покадровая навигация ----------

function fmtNum(v, d) { return v.toFixed(d).replace('.', ','); }

function updateFrameInfo() {
  const n = video.current;
  if (n < 0) return;
  const info = $('#frameInfo');
  if (state.step === 3) {
    const t = video.timeOf(n) - video.timeOf(state.start);
    const has = state.points.has(n) ? ' · <span style="color:#17b978">✓ точка</span>' : '';
    info.innerHTML = `Кадр <b>${n}</b> (${state.start}–${state.end}) · t = <b>${fmtNum(t, 3)}</b> с${has}`;
  } else {
    info.innerHTML = `Кадр <b>${n}</b> из ${video.frameCount - 1} · t = <b>${fmtNum(video.timeOf(n), 3)}</b> с`;
  }
  $('#prevFrame').disabled = n <= range[0];
  $('#nextFrame').disabled = n >= range[1];
}

video.onframe = n => {
  const s = $('#frameSlider');
  if (document.activeElement !== s || !s.matches(':active')) s.value = n;
  updateFrameInfo();
  if (steps[state.step] && steps[state.step].onFrame) steps[state.step].onFrame(n);
  viewer.render();
};

function stepFrame(d) {
  tracking.stopAuto();
  app.goto(video.current + d * (state.step === 3 ? state.trackStep : 1));
}

$('#frameSlider').addEventListener('input', e => { tracking.stopAuto(); app.goto(+e.target.value); });

// Удержание кнопки — быстрая прокрутка кадров.
for (const [id, d] of [['#prevFrame', -1], ['#nextFrame', 1]]) {
  const b = $(id);
  let hold = 0, rep = 0;
  const end = () => { clearTimeout(hold); clearInterval(rep); };
  b.addEventListener('pointerdown', e => {
    e.preventDefault();
    stepFrame(d);
    hold = setTimeout(() => { rep = setInterval(() => { if (!video.busy) stepFrame(d); }, 70); }, 400);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, end));
  b.addEventListener('click', e => { if (e.detail === 0) stepFrame(d); }); // клавиатура
}

viewerEl.querySelectorAll('[data-zoom]').forEach(b => b.addEventListener('click', () => {
  const z = b.dataset.zoom;
  if (z === 'in') viewer.zoomBy(1.6);
  else if (z === 'out') viewer.zoomBy(1 / 1.6);
  else viewer.resetView();
}));

document.addEventListener('keydown', e => {
  if (!(state.step === 2 || state.step === 3)) return;
  if (e.target.matches('input[type=number], select, textarea')) return;
  if (e.key === 'ArrowLeft') { e.preventDefault(); stepFrame(-1); }
  if (e.key === 'ArrowRight') { e.preventDefault(); stepFrame(1); }
});

// ---------- Мастер ----------

function canEnter(n) {
  if (n <= 1) return true;
  if (!video.loaded) return false;
  if (n >= 3 && !calibration.valid()) return false;
  if (n >= 4 && !tracking.valid()) return false;
  return true;
}

function refreshNav() {
  document.querySelectorAll('.stepbtn').forEach(b => {
    const n = +b.dataset.step;
    b.classList.toggle('active', n === state.step);
    b.classList.toggle('done', n < state.step);
    b.disabled = !canEnter(n);
  });
  $('#backBtn').style.visibility = state.step > 1 ? 'visible' : 'hidden';
  const next = $('#nextBtn');
  next.classList.toggle('hidden', state.step === 4);
  next.disabled = !canEnter(state.step + 1);
  next.textContent = state.step === 3 ? 'Результаты →' : 'Далее →';
}

function goStep(n) {
  if (!canEnter(n)) {
    if (n === 3) app.toast('Введите длину предмета для масштаба');
    if (n === 4) app.toast('Поставьте хотя бы 3 точки');
    return;
  }
  const prev = steps[state.step];
  if (prev) prev.leave();
  state.step = n;
  document.querySelectorAll('.step').forEach(s => s.classList.toggle('active', s.id === 'step' + n));
  if (n === 2 || n === 3) {
    $(`#step${n} .viewer-slot`).appendChild(viewerEl);
    viewer.resize();
  }
  if (steps[n]) steps[n].enter();
  updateFrameInfo();
  refreshNav();
  window.scrollTo({ top: 0 });
}

$('#steps').addEventListener('click', e => {
  const b = e.target.closest('.stepbtn');
  if (b) goStep(+b.dataset.step);
});
$('#backBtn').addEventListener('click', () => goStep(state.step - 1));
$('#nextBtn').addEventListener('click', () => goStep(state.step + 1));

// ---------- Шаг 1: загрузка видео ----------

function showInfo(html, kind = '') {
  const el = $('#videoInfo');
  el.innerHTML = html;
  el.className = 'card info ' + kind;
}

async function loadFile(file, demo = false) {
  if (state.points.size && !confirm('Загрузить новое видео? Поставленные точки будут удалены.')) return;
  showInfo('<b>Открываю видео…</b>');
  try {
    await video.load(file);
  } catch (e) {
    console.error(e);
    video.reset();
    showInfo('<b>Не удалось открыть видео</b><div class="meta">Возможно, этот браузер не поддерживает формат файла (например, HEVC с iPhone в Chrome на Android или Windows). Попробуйте другое видео или в настройках камеры iPhone выберите «Наиболее совместимый» формат.</div>', 'error');
    refreshNav();
    return;
  }
  state.cal = defaultCalibration(video.width, video.height);
  state.start = 0;
  state.end = video.frameCount - 1;
  state.points.clear();
  state.boxSize = 0;
  if (demo) applyDemoCalibration();
  viewer.setVideoSize(video.width, video.height);
  const fpsText = {
    file: `${fmtNum(video.fps, 2)} к/с (из файла)`,
    estimate: `≈ ${fmtNum(video.fps, 2)} к/с (оценка, проверьте на шаге 2)`,
    default: 'не определилась, введите на шаге 2',
  }[video.fpsSource];
  const warn = video.fpsSource !== 'file' || video.variableFps;
  showInfo(`<b>✓ ${escapeHtml(video.name)}</b>
    <div class="meta">${video.width}×${video.height} · ${fmtNum(video.duration, 2)} с · ${video.frameCount} кадров<br>FPS: ${fpsText}${video.variableFps ? '<br>⚠ Частота кадров переменная, время берётся для каждого кадра из файла' : ''}</div>`, warn ? 'warn' : '');
  refreshNav();
}

// В примере линейка 1 м нарисована в кадре: ставим масштаб за пользователя.
function applyDemoCalibration() {
  state.cal.scale = { a: { x: 140, y: 660 }, b: { x: 640, y: 660 }, length: 1 };
  state.cal.axes.origin = { x: 140, y: 600 };
}

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

for (const id of ['#fileInput', '#cameraInput']) {
  $(id).addEventListener('change', e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (f) loadFile(f);
  });
}

$('#demoBtn').addEventListener('click', async () => {
  showInfo('<b>Загружаю пример…</b>');
  try {
    const r = await fetch('demo/throw.mp4');
    if (!r.ok) throw new Error(r.status);
    const blob = await r.blob();
    await loadFile(new File([blob], 'Пример — бросок мяча.mp4', { type: 'video/mp4' }), true);
  } catch {
    showInfo('<b>Не удалось загрузить пример</b>', 'error');
  }
});

window.addEventListener('beforeunload', e => {
  if (state.points.size) { e.preventDefault(); e.returnValue = ''; }
});

goStep(1);
