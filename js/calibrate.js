// Шаг 2: FPS, начальный/конечный кадр, масштаб и система координат.
import { hitHandles } from './viewer.js?v=20261025102439';
import { pixelsPerMeter } from './physics.js?v=20261025102439';
import { t, num, getLang } from './i18n.js?v=20261025102439';

// Число из поля ввода: принимаем и запятую, и точку.
export function parseNum(str) {
  const v = parseFloat(String(str).trim().replace(/\s/g, '').replace(',', '.'));
  return isFinite(v) ? v : NaN;
}

// Число для поля ввода в формате текущего языка.
function fieldNum(v) {
  const s = String(v);
  return getLang() === 'pt' ? s.replace('.', ',') : s;
}

const AXIS_PX = 90; // длина стрелки оси на экране
const BLUE = '#0a84ff';
const PINK = '#ff375f';

export function defaultCalibration(w, h) {
  return {
    scale: { a: { x: w * 0.3, y: h * 0.85 }, b: { x: w * 0.7, y: h * 0.85 }, length: 1 },
    axes: { origin: { x: w * 0.12, y: h * 0.88 }, angle: 0, flipY: false },
  };
}

function axisDirs(axes) {
  const c = Math.cos(axes.angle), s = Math.sin(axes.angle);
  const ux = { x: c, y: -s };
  const uy = axes.flipY ? { x: s, y: c } : { x: -s, y: -c };
  return { ux, uy };
}

function arrow(ctx, from, to, color, width) {
  const ang = Math.atan2(to.y - from.y, to.x - from.x);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(to.x + Math.cos(ang) * 4, to.y + Math.sin(ang) * 4);
  ctx.lineTo(to.x - Math.cos(ang - 0.45) * 14, to.y - Math.sin(ang - 0.45) * 14);
  ctx.lineTo(to.x - Math.cos(ang + 0.45) * 14, to.y - Math.sin(ang + 0.45) * 14);
  ctx.closePath(); ctx.fill();
}

function label(ctx, text, x, y, bg, color = '#fff') {
  ctx.font = '600 13px -apple-system, BlinkMacSystemFont, Inter, system-ui, sans-serif';
  const w = ctx.measureText(text).width + 14;
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x - w / 2, y - 12, w, 24, 12) : ctx.rect(x - w / 2, y - 12, w, 24);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + 0.5);
}

function handleDot(ctx, p, color, r = 9) {
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#fff';
  ctx.stroke();
}

export function drawAxes(ctx, viewer, axes, strong) {
  const o = viewer.toScreen(axes.origin);
  const { ux, uy } = axisDirs(axes);
  const L = 5000;
  ctx.save();
  ctx.globalAlpha = strong ? 0.55 : 0.35;
  ctx.strokeStyle = PINK;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(o.x - ux.x * L, o.y - ux.y * L); ctx.lineTo(o.x + ux.x * L, o.y + ux.y * L);
  ctx.moveTo(o.x - uy.x * L, o.y - uy.y * L); ctx.lineTo(o.x + uy.x * L, o.y + uy.y * L);
  ctx.stroke();
  ctx.restore();
  if (!strong) return;
  const xe = { x: o.x + ux.x * AXIS_PX, y: o.y + ux.y * AXIS_PX };
  const ye = { x: o.x + uy.x * AXIS_PX * 0.7, y: o.y + uy.y * AXIS_PX * 0.7 };
  arrow(ctx, o, ye, PINK, 3);
  arrow(ctx, o, xe, PINK, 3);
  label(ctx, 'y', ye.x + uy.x * 16, ye.y + uy.y * 16, PINK);
  handleDot(ctx, o, PINK, 10);
  handleDot(ctx, xe, PINK, 11);
  label(ctx, 'x', xe.x + ux.x * 24, xe.y + ux.y * 24, PINK);
}

function drawScale(ctx, viewer, scale, strong) {
  const a = viewer.toScreen(scale.a), b = viewer.toScreen(scale.b);
  ctx.save();
  ctx.globalAlpha = strong ? 1 : 0.5;
  ctx.strokeStyle = BLUE;
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  // Засечки на концах — перпендикулярно отрезку.
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  // Нормаль, смотрящая вверх по экрану (чтобы подпись не уходила под линейку).
  let nx = -(b.y - a.y) / len * 10, ny = (b.x - a.x) / len * 10;
  if (ny > 0) { nx = -nx; ny = -ny; }
  ctx.beginPath();
  ctx.moveTo(a.x - nx, a.y - ny); ctx.lineTo(a.x + nx, a.y + ny);
  ctx.moveTo(b.x - nx, b.y - ny); ctx.lineTo(b.x + nx, b.y + ny);
  ctx.stroke();
  if (strong) {
    handleDot(ctx, a, BLUE);
    handleDot(ctx, b, BLUE);
  }
  const txt = (scale.length > 0 ? String(scale.length).replace('.', num(1.5, 1)[1]) : '?') + ' m';
  label(ctx, txt, (a.x + b.x) / 2 + nx * 2.4, (a.y + b.y) / 2 + ny * 2.4, BLUE);
  ctx.restore();
}

export function initCalibration(app) {
  const { video, viewer, state } = app;
  const $ = s => document.querySelector(s);
  let tab = 'frames';

  const fpsInput = $('#fpsInput'), fpsNote = $('#fpsNote');
  const lengthInput = $('#lengthInput'), ppmNote = $('#ppmNote');
  const angleInput = $('#angleInput');

  function axisEnd() {
    const { ux } = axisDirs(state.cal.axes);
    const o = state.cal.axes.origin;
    return { x: o.x + ux.x * AXIS_PX / viewer.k, y: o.y + ux.y * AXIS_PX / viewer.k };
  }

  function handles() {
    const { scale, axes } = state.cal;
    if (tab === 'scale') return [{ id: 'a', ...scale.a }, { id: 'b', ...scale.b }];
    if (tab === 'axes') return [{ id: 'xend', ...axisEnd() }, { id: 'origin', ...axes.origin }];
    return [];
  }

  function clampToVideo(p) {
    return { x: Math.max(0, Math.min(video.width, p.x)), y: Math.max(0, Math.min(video.height, p.y)) };
  }

  function onDrag(id, p) {
    const { scale, axes } = state.cal;
    if (id === 'a' || id === 'b') scale[id] = clampToVideo(p);
    else if (id === 'origin') axes.origin = clampToVideo(p);
    else if (id === 'xend') {
      let deg = Math.atan2(-(p.y - axes.origin.y), p.x - axes.origin.x) * 180 / Math.PI;
      // Притягивание к горизонтали/вертикали.
      const snap = Math.round(deg / 90) * 90;
      if (Math.abs(deg - snap) < 3) deg = snap;
      axes.angle = deg * Math.PI / 180;
    }
    updateFields();
    app.changed();
  }

  function overlay(ctx, v) {
    drawAxes(ctx, v, state.cal.axes, tab === 'axes');
    drawScale(ctx, v, state.cal.scale, tab === 'scale');
  }

  function updateFields() {
    const { scale, axes } = state.cal;
    const ppm = pixelsPerMeter(scale);
    ppmNote.textContent = ppm > 0 ? t('cal.ppm', { v: num(ppm, 1) }) : '';
    if (document.activeElement !== angleInput) {
      let deg = axes.angle * 180 / Math.PI;
      deg = ((deg % 360) + 540) % 360 - 180;
      angleInput.value = fieldNum(Math.round(deg * 10) / 10);
    }
    document.querySelectorAll('#yDir button').forEach(b => b.classList.toggle('on', (b.dataset.ydir === 'down') === !!axes.flipY));
    $('#startVal').textContent = state.start;
    $('#endVal').textContent = state.end;
    if (document.activeElement !== fpsInput) fpsInput.value = fieldNum(Math.round(video.fps * 1000) / 1000);
    if (document.activeElement !== lengthInput) lengthInput.value = state.cal.scale.length ? fieldNum(state.cal.scale.length) : '';
    const notes = {
      file: t(video.variableFps ? 'fps.fileVar' : 'fps.file'),
      estimate: t('fps.estimate'),
      default: t('fps.default'),
      manual: t('fps.manual'),
    };
    fpsNote.textContent = notes[video.fpsSource] || '';
  }

  function setTab(t) {
    tab = t;
    document.querySelectorAll('#calTabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
    document.querySelectorAll('#step2 [data-panel]').forEach(p => p.classList.toggle('hidden', p.dataset.panel !== t));
    viewer.render();
  }

  document.querySelectorAll('#calTabs button').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));

  fpsInput.addEventListener('change', () => {
    const f = parseNum(fpsInput.value);
    if (!(f >= 1 && f <= 1000)) { updateFields(); app.toast(t('toast.fpsRange')); return; }
    const t0 = video.timeOf(state.start), t1 = video.timeOf(state.end);
    const cur = video.timeOf(Math.max(0, video.current));
    video.setFps(f);
    // Сохраняем выбранный диапазон по времени.
    state.start = video.clampFrame(t0 * video.fps);
    state.end = video.clampFrame(t1 * video.fps);
    state.points.clear();
    app.setFrameRange(0, video.frameCount - 1);
    app.goto(cur * video.fps);
    updateFields();
    app.changed();
  });

  lengthInput.addEventListener('input', () => {
    const v = parseNum(lengthInput.value);
    state.cal.scale.length = v > 0 ? v : 0;
    updateFields();
    app.changed();
  });

  angleInput.addEventListener('change', () => {
    const v = parseNum(angleInput.value);
    if (isFinite(v)) state.cal.axes.angle = v * Math.PI / 180;
    updateFields();
    app.changed();
  });
  document.querySelector('[data-angle="0"]').addEventListener('click', () => {
    state.cal.axes.angle = 0;
    updateFields();
    app.changed();
  });
  document.querySelectorAll('#yDir button').forEach(b => b.addEventListener('click', () => {
    state.cal.axes.flipY = b.dataset.ydir === 'down';
    updateFields();
    app.changed();
  }));

  $('#setStart').addEventListener('click', () => {
    state.start = video.current;
    if (state.end < state.start) state.end = video.frameCount - 1;
    updateFields();
    app.toast(t('toast.startSet', { n: state.start }));
    app.changed();
  });
  $('#setEnd').addEventListener('click', () => {
    if (video.current <= state.start) { app.toast(t('toast.endAfterStart')); return; }
    state.end = video.current;
    updateFields();
    app.toast(t('toast.endSet', { n: state.end }));
    app.changed();
  });

  return {
    enter() {
      lengthInput.value = state.cal.scale.length ? fieldNum(state.cal.scale.length) : '';
      viewer.mode = 'pan';
      viewer.hit = s => hitHandles(viewer, s, handles());
      viewer.onDrag = onDrag;
      viewer.onPlace = null;
      viewer.overlay = overlay;
      app.setFrameRange(0, video.frameCount - 1);
      updateFields();
      setTab(tab);
    },
    leave() {},
    onFrame() {},
    relabel: updateFields,
    valid() {
      return pixelsPerMeter(state.cal.scale) > 0;
    },
  };
}
