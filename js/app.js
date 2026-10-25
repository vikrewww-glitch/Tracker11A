// Мастер шагов 1 → 4 и общее состояние приложения.
import { VideoSource } from './video.js?v=20261025111844';
import { Viewer } from './viewer.js?v=20261025111844';
import { initCalibration, defaultCalibration } from './calibrate.js?v=20261025111844';
import { initTracking } from './track.js?v=20261025111844';
import { initResults } from './results.js?v=20261025111844';
import { toWorld } from './physics.js?v=20261025111844';
import { tableText } from './export.js?v=20261025111844';
import { t, num, applyDom, setLang, getLang, onLang } from './i18n.js?v=20261025111844';

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
  comma: false,
};

const video = new VideoSource($('#video'));
const viewerEl = $('#viewerTpl').content.firstElementChild.cloneNode(true);
$('#step2 .viewer-slot').appendChild(viewerEl);
const viewer = new Viewer(viewerEl.querySelector('.canvaswrap'), video.el);
applyDom();

let toastTimer = 0;
let busyTimer = 0;
let range = [0, 0];

const app = {
  state, video, viewer,
  toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
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
    paintRange(s);
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

const fmtNum = num;

// Заливка дорожки ползунка до текущего значения.
function paintRange(el) {
  const min = +el.min, max = +el.max;
  el.style.setProperty('--p', (max > min ? (el.value - min) / (max - min) * 100 : 0) + '%');
}
app.paintRange = paintRange;
document.addEventListener('input', e => { if (e.target.matches('input[type=range]')) paintRange(e.target); });

function updateFrameInfo() {
  const n = video.current;
  if (n < 0) return;
  const info = $('#frameInfo');
  if (state.step === 3) {
    const time = video.timeOf(n) - video.timeOf(state.start);
    const has = state.points.has(n) ? ` · <span class="ok">${t('frame.marked')}</span>` : '';
    info.innerHTML = t('frame.infoRange', { n, a: state.start, b: state.end, t: fmtNum(time, 3) }) + has;
  } else {
    info.innerHTML = t('frame.info', { n, max: video.frameCount - 1, t: fmtNum(video.timeOf(n), 3) });
  }
  $('#prevFrame').disabled = n <= range[0];
  $('#nextFrame').disabled = n >= range[1];
}

video.onframe = n => {
  const s = $('#frameSlider');
  if (document.activeElement !== s || !s.matches(':active')) s.value = n;
  paintRange(s);
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
  if (e.target.matches('input, select, textarea')) return;
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
  next.textContent = t(state.step === 3 ? 'nav.results' : 'nav.continue');
  $('#progress').style.width = state.step * 25 + '%';
}

function goStep(n) {
  if (!canEnter(n)) {
    if (n === 2) app.toast(t('toast.needVideo'));
    if (n === 3) app.toast(t('toast.needLength'));
    if (n === 4) app.toast(t('toast.needPoints'));
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

const ICON = { '': 'i-check', warn: 'i-alert', error: 'i-alert', busy: 'i-video' };

// render() возвращает { title, meta, kind } — перерисовывается при смене языка.
let infoRender = null;

function renderInfo() {
  if (!infoRender) return;
  const { title, meta = '', kind = '' } = infoRender();
  const el = $('#videoInfo');
  el.innerHTML = `<svg class="i"><use href="#${ICON[kind]}"/></svg><div><b>${title}</b>${meta ? `<div class="meta">${meta}</div>` : ''}</div>`;
  el.className = 'filecard ' + kind;
}

function showInfo(render) {
  infoRender = render;
  renderInfo();
}

async function loadFile(file, demo = false) {
  if (state.points.size && !confirm(t('load.confirm'))) return;
  showInfo(() => ({ title: t('load.opening'), kind: 'busy' }));
  try {
    await video.load(file);
  } catch (e) {
    console.error(e);
    video.reset();
    showInfo(() => ({ title: t('load.failed'), meta: t('load.failedHint'), kind: 'error' }));
    refreshNav();
    return;
  }
  state.cal = defaultCalibration(video.width, video.height);
  state.start = 0;
  state.end = video.frameCount - 1;
  state.points.clear();
  state.boxSize = 0;
  video.isSample = demo;
  if (demo) applyDemoCalibration();
  viewer.setVideoSize(video.width, video.height);
  const warn = video.fpsSource !== 'file' || video.variableFps;
  showInfo(() => {
    const v = fmtNum(video.fps, 2);
    const fps = { file: t('load.fps', { v }), estimate: t('load.fpsEstimate', { v }), default: t('load.fpsUnknown') }[video.fpsSource];
    const meta = t('load.meta', { w: video.width, h: video.height, d: fmtNum(video.duration, 2), n: video.frameCount, fps }) +
      (video.variableFps ? '<br>' + t('load.variable') : '');
    return { title: escapeHtml(video.name), meta, kind: warn ? 'warn' : '' };
  });
  refreshNav();
}

// В примере линейка 1 м нарисована в кадре: ставим масштаб за пользователя.
function applyDemoCalibration() {
  state.cal.scale = { a: { x: 140, y: 660 }, b: { x: 640, y: 660 }, length: 1 };
  state.cal.axes.origin = { x: 140, y: 600 };
  // Полёт мяча — кадры 6…31 (бросок в 0.2 с, приземление в 1.06 с).
  state.start = 6;
  state.end = 31;
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
  showInfo(() => ({ title: t('load.sample'), kind: 'busy' }));
  try {
    const r = await fetch('demo/throw.mp4');
    if (!r.ok) throw new Error(r.status);
    const blob = await r.blob();
    await loadFile(new File([blob], t('load.sampleName'), { type: 'video/mp4' }), true);
  } catch {
    showInfo(() => ({ title: t('load.sampleFailed'), kind: 'error' }));
  }
});

window.addEventListener('beforeunload', e => {
  if (state.points.size) { e.preventDefault(); e.returnValue = ''; }
});

// ---------- Язык ----------

function paintLang() {
  document.querySelectorAll('#langBtn span').forEach(s => s.classList.toggle('on', s.dataset.l === getLang()));
}
$('#langBtn').addEventListener('click', () => setLang(getLang() === 'en' ? 'pt' : 'en'));
onLang(() => {
  paintLang();
  $('#toast').classList.remove('show');
  $('#toast').textContent = '';
  if (video.isSample) video.name = t('load.sampleName');
  renderInfo();
  updateFrameInfo();
  refreshNav();
  for (const s of Object.values(steps)) if (s.relabel) s.relabel();
  viewer.render();
});
paintLang();

goStep(1);
