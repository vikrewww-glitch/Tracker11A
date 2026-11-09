// Шаг 4: графики, линия тренда, таблица и экспорт.
import { computeSeries, polyfit } from './physics.js?v=20261109154903';
import { drawChart, nearestPoint } from './chart.js?v=20261109154903';
import { columnsFor, fmt, sig, tableText, copyText, saveBlob, canvasToBlobSync } from './export.js?v=20261109154903';
import { addRow, nextName } from './experiment.js?v=20261109154903';
import { getTrack, putTrack } from './history.js?v=20261109154903';
import { t, getLang } from './i18n.js?v=20261109154903';

export const QUANTITIES = [
  { key: 'x', html: 'x', name: 'x', unit: 'm', dec: 3 },
  { key: 'y', html: 'y', name: 'y', unit: 'm', dec: 3 },
  { key: 'vx', html: 'v<sub>x</sub>', name: 'vx', unit: 'm/s', dec: 3 },
  { key: 'vy', html: 'v<sub>y</sub>', name: 'vy', unit: 'm/s', dec: 3 },
  { key: 'v', html: 'v', name: 'v', unit: 'm/s', dec: 3 },
  { key: 'ax', html: 'a<sub>x</sub>', name: 'ax', unit: 'm/s²', dec: 2 },
  { key: 'ay', html: 'a<sub>y</sub>', name: 'ay', unit: 'm/s²', dec: 2 },
  { key: 'Fx', html: 'F<sub>x</sub>', name: 'Fx', unit: 'N', dec: 3, force: true },
  { key: 'Fy', html: 'F<sub>y</sub>', name: 'Fy', unit: 'N', dec: 3, force: true },
  { key: 'F', html: 'F', name: 'F', unit: 'N', dec: 3, force: true },
];

// Тип тренда по умолчанию: для координат — парабола (равноускоренное движение), для остального — прямая.
const DEFAULT_DEG = { x: 2, y: 2 };

// Ускорение из квадратичного тренда координаты — для каких величин его показывать как «Trend …».
const TREND_ACC = { ax: ['x'], ay: ['y'], Fx: ['x'], Fy: ['y'], F: ['x', 'y'] };

// Цвета графика из текущей темы (светлая/тёмная).
function theme() {
  const cs = getComputedStyle(document.documentElement);
  const v = n => cs.getPropertyValue(n).trim();
  return { bg: v('--surface'), grid: v('--sep'), zero: v('--text-3'), text: v('--text'), text2: v('--text-2'), accent: v('--accent'), trend: v('--orange'), band: v('--accent-tint') };
}

export function initResults(app) {
  const { state } = app;
  const $ = s => document.querySelector(s);
  const chart = $('#chart'), readout = $('#readout'), trendInfo = $('#trendInfo');
  let series = null, layout = null, highlight = null;
  state.trend = { on: false, deg: {} };

  // Разделитель: сохранённый выбор, иначе — по языку (в португальском принята запятая).
  const savedSep = () => { try { return localStorage.getItem('decSep'); } catch { return null; } };
  const defaultComma = () => (savedSep() ? savedSep() === 'comma' : getLang() === 'pt');
  state.comma = defaultComma();

  const tabs = $('#qTabs');
  for (const q of QUANTITIES) {
    const b = document.createElement('button');
    b.dataset.q = q.key;
    b.innerHTML = q.html;
    b.addEventListener('click', () => {
      if (q.force && !hasForce()) { app.toast(t('res.needMass')); return; }
      state.quantity = q.key;
      highlight = null;
      draw();
    });
    tabs.appendChild(b);
  }

  const hasForce = () => !!(series && series.Fx);
  const quantity = () => {
    const q = QUANTITIES.find(q => q.key === state.quantity) || QUANTITIES[1];
    return q.force && !hasForce() ? QUANTITIES[1] : q;
  };
  const num = (v, dec) => fmt(v, dec, state.comma).replace('-', '−');
  const degOf = key => state.trend.deg[key] || DEFAULT_DEG[key] || 1;

  function setSegmented(sel, attr, value) {
    document.querySelectorAll(`${sel} button`).forEach(b => b.classList.toggle('on', b.dataset[attr] === value));
  }

  // ---------- Линия тренда ----------

  function fit(key, deg = degOf(key), range = null) {
    if (!series || !series[key]) return null;
    const ys = range ? series[key].map((v, i) => (i >= range[0] && i <= range[1] ? v : null)) : series[key];
    return polyfit(series.t, ys, deg);
  }

  // Ускорение 2·A из квадратичного тренда координаты.
  const accFrom = (axis, range) => { const f = fit(axis, 2, range); return f ? 2 * f.coef[2] : null; };

  // «Trend …»: ускорение (или сила) из квадратичного тренда x(t)/y(t) — без шума численного дифференцирования.
  function trendValue(key) {
    if (key === 'x' || key === 'y') return accFrom(key);
    const axes = TREND_ACC[key];
    if (!axes) return null;
    const a = axes.map(ax => accFrom(ax));
    if (a.some(v => v == null)) return null;
    const m = QUANTITIES.find(q => q.key === key).force ? app.mass() : 1;
    return m * (a.length === 2 ? Math.hypot(a[0], a[1]) : a[0]);
  }

  // Уравнение вида «y = −4.905t² + 4.200t + 0.001».
  function equation(f, lhs, x = 't', comma = state.comma) {
    const terms = [];
    for (let k = f.deg; k >= 0; k--) {
      const c = f.coef[k];
      if (k < f.deg && c === 0) continue;
      const body = sig(Math.abs(c), 4, comma) + (k === 2 ? x + '²' : k === 1 ? x : '');
      terms.push(terms.length ? (c < 0 ? ' − ' : ' + ') + body : (c < 0 ? '−' : '') + body);
    }
    return `${lhs} = ${terms.join('')}`;
  }
  const r2Text = f => `R² = ${fmt(f.r2, 4, state.comma)}`;

  function trendStatKey(q) {
    if (!state.trend.on) return null;
    const deg = degOf(q.key);
    if ((q.key === 'x' || q.key === 'y') && deg === 2) return q.key === 'x' ? 'ax' : 'ay';
    if (TREND_ACC[q.key] && deg === 1) return q.key;
    return null;
  }

  // ---------- Добавление в эксперимент ----------

  const addPanel = $('#addPanel'), expFrom = $('#expFrom'), expTo = $('#expTo'), expName = $('#expName');
  let adding = false, addAxis = 'x';
  const addRange = () => [Math.min(+expFrom.value, +expTo.value), Math.max(+expFrom.value, +expTo.value)];

  function addPreview() {
    const r = addRange();
    const frame = i => series.frame[i];
    $('#expFromVal').textContent = t('exp.frameT', { n: frame(r[0]), t: num(series.t[r[0]], 2) });
    $('#expToVal').textContent = t('exp.frameT', { n: frame(r[1]), t: num(series.t[r[1]], 2) });
    const a = r[1] - r[0] >= 2 ? accFrom(addAxis, r) : null;
    const add = $('#expAdd');
    add.disabled = a == null || !(app.mass() > 0);
    $('#expPreview').innerHTML = a == null ? t('exp.needRange')
      : `a = <b>${num(a, 3)}</b> m/s² · F<sub>a</sub> = m·|a| = <b>${num(app.mass() * Math.abs(a), 3)}</b> N`;
    return a;
  }

  function openAdd() {
    if (!(app.mass() > 0)) { app.toast(t('res.needMass')); return; }
    if (!series || series.t.length < 3) { app.toast(t('res.notEnough')); return; }
    adding = true;
    const n = series.t.length - 1;
    for (const el of [expFrom, expTo]) { el.min = 0; el.max = n; }
    expFrom.value = 0;
    expTo.value = n;
    [expFrom, expTo].forEach(app.paintRange);
    expName.value = nextName();
    setSegmented('#expAxis', 'axis', addAxis);
    state.quantity = addAxis;
    highlight = null;
    addPanel.classList.remove('hidden');
    $('#addBtn').classList.add('hidden');
    draw();
    $('#step4 .chartcard').scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  function closeAdd() {
    adding = false;
    addPanel.classList.add('hidden');
    $('#addBtn').classList.remove('hidden');
    draw();
  }

  $('#addBtn').addEventListener('click', openAdd);
  $('#expCancel').addEventListener('click', closeAdd);
  for (const el of [expFrom, expTo]) el.addEventListener('input', draw);
  document.querySelectorAll('#expAxis button').forEach(b => b.addEventListener('click', () => {
    addAxis = b.dataset.axis;
    setSegmented('#expAxis', 'axis', addAxis);
    state.quantity = addAxis;
    draw();
  }));
  $('#expAdd').addEventListener('click', async () => {
    const a = addPreview();
    if (a == null) return;
    const r = addRange();
    const exp = { from: series.frame[r[0]], to: series.frame[r[1]], axis: addAxis };
    if (!state.archived) await app.saveHistory();
    const id = state.archived ? state.archived.id : state.historyId;
    const n = addRow({ name: expName.value.trim() || nextName(), m: app.mass(), a, track: id });
    closeAdd();
    app.toast(t('exp.added', { n }));
    app.changed();
    // Участок торможения запоминаем в истории — «Добавить из истории» возьмёт его же.
    if (id) {
      try {
        const rec = await getTrack(id);
        if (rec) { rec.exp = exp; await putTrack(rec); if (state.archived) state.archived.exp = exp; }
      } catch { /* история недоступна */ }
    }
  });

  // ---------- Отрисовка ----------

  function draw() {
    const q = quantity();
    tabs.querySelectorAll('button').forEach(b => {
      b.classList.toggle('on', b.dataset.q === q.key);
      const off = !!QUANTITIES.find(x => x.key === b.dataset.q).force && !hasForce();
      b.classList.toggle('dis', off);
      b.title = off ? t('res.needMass') : '';
    });
    const w = chart.parentElement.clientWidth - 16;
    if (w <= 0 || !series) return;
    const h = Math.round(Math.min(Math.max(w * 0.68, 240), 400));
    chart.style.height = h + 'px';
    const th = theme();

    // При добавлении в эксперимент — парабола по выбранному участку; иначе — тренд по переключателю.
    const range = adding ? addRange() : null;
    const f = adding ? fit(q.key, 2, range) : state.trend.on ? fit(q.key) : null;
    layout = drawChart(chart, {
      width: w, height: h, dpr: window.devicePixelRatio || 1,
      xs: series.t, ys: series[q.key], color: th.accent, theme: th,
      xLabel: 't (s)', yLabel: `${q.name} (${q.unit})`, highlight, comma: state.comma,
      trend: f ? f.f : null, band: range ? [series.t[range[0]], series.t[range[1]]] : null,
    });

    $('#trendOn').checked = state.trend.on;
    $('#trendTypeRow').classList.toggle('hidden', !state.trend.on);
    setSegmented('#trendType', 'deg', String(degOf(q.key)));
    let info = '';
    if (f && !adding) {
      info = `${equation(f, q.html)} <span class="sep">·</span> ${r2Text(f)}`;
      if (f.deg === 2 && (q.key === 'x' || q.key === 'y')) {
        info += `<br>a<sub>${q.key}</sub> = 2·A = <b>${num(2 * f.coef[2], 3)}</b> m/s²`;
      } else if (TREND_ACC[q.key] && f.deg === 1) {
        const v = trendValue(q.key);
        if (v != null) info += `<br>${t('res.fromTrend', { axis: TREND_ACC[q.key].map(a => a + '(t)').join(', ') })}: <b>${num(v, q.dec + 1)}</b> ${q.unit}`;
      }
    }
    trendInfo.innerHTML = info;
    trendInfo.classList.toggle('hidden', !info);
    if (adding) addPreview();

    const vals = series[q.key].filter(v => v != null);
    $('#statLabel').textContent = t('res.mean', { q: q.name });
    if (vals.length) {
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      $('#statMean').textContent = `${num(mean, q.dec)} ${q.unit}`;
      $('#statMin').textContent = num(Math.min(...vals), q.dec);
      $('#statMax').textContent = num(Math.max(...vals), q.dec);
    } else {
      ['#statMean', '#statMin', '#statMax'].forEach(s => { $(s).textContent = '—'; });
    }
    const tk = trendStatKey(q);
    const tv = tk ? trendValue(tk) : null;
    $('#statTrendBox').classList.toggle('hidden', tv == null);
    $('.stats').classList.toggle('four', tv != null);
    if (tv != null) {
      const tq = QUANTITIES.find(x => x.key === tk);
      $('#statTrendLabel').textContent = t('res.trendStat', { q: tq.name });
      $('#statTrend').textContent = `${num(tv, tq.dec)} ${tq.unit}`;
    }
    if (highlight == null) readout.textContent = t(vals.length ? 'res.touch' : 'res.notEnough');
  }

  function drawTable() {
    const cols = columnsFor(series);
    const head = '<tr>' + cols.map(c => `<th>${c.label}</th>`).join('') + '</tr>';
    const rows = [];
    for (let i = 0; i < series.t.length; i++) {
      rows.push('<tr>' + cols.map(c => `<td>${fmt(series[c.key][i], c.dec, state.comma)}</td>`).join('') + '</tr>');
    }
    $('#table').innerHTML = `<thead>${head}</thead><tbody>${rows.join('')}</tbody>`;
  }

  // Просмотр сохранённого трекинга из истории — плашка с названием и кнопкой «Закрыть».
  function banner() {
    const r = state.archived;
    $('#archBanner').classList.toggle('hidden', !r);
    if (!r) return;
    $('#archName').textContent = r.name;
    $('#archMeta').textContent = t('hist.viewing', {
      d: new Date(r.date).toLocaleString(getLang() === 'pt' ? 'pt-PT' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    });
  }
  $('#archClose').addEventListener('click', () => app.closeArchived());

  function recompute() {
    banner();
    series = computeSeries(app.samples(), state.smoothing, app.mass());
    draw();
    drawTable();
  }

  // Таблица данных и под ней — уравнения трендов всех величин (тип — как выбран на графике).
  function exportText(sep, comma) {
    const lines = [tableText(series, sep, comma), ''];
    if (app.mass() > 0) lines.push(['m (kg)', fmt(app.mass(), 4, comma)].join(sep), '');
    lines.push([t('res.trendline'), t('res.trendType'), t('res.equation'), 'A (t²)', 'B (t)', 'C', 'R²', 'a = 2A (m/s²)'].join(sep));
    for (const q of QUANTITIES) {
      const f = fit(q.key);
      if (!f) continue;
      const c = f.coef;
      const e = n => (Math.abs(n) < 1e-12 ? '0' : sig(n, 6, comma));
      lines.push([
        `${q.name} (${q.unit})`, t(f.deg === 2 ? 'res.quadratic' : 'res.linear'),
        equation(f, q.name, 't', comma).replace(/−/g, '-'),
        f.deg === 2 ? e(c[2]) : '', e(c[1]), e(c[0]), fmt(f.r2, 5, comma),
        f.deg === 2 && (q.key === 'x' || q.key === 'y') ? e(2 * c[2]) : '',
      ].join(sep));
    }
    return lines.join('\r\n');
  }

  function pick(e) {
    if (!layout) return;
    const r = chart.getBoundingClientRect();
    const p = nearestPoint(layout, e.clientX - r.left);
    if (!p) return;
    highlight = p.i;
    const q = quantity();
    readout.textContent = `t = ${num(series.t[p.i], 3)} s   ${q.name} = ${num(p.y, q.dec + 1)} ${q.unit}`;
    draw();
  }
  chart.addEventListener('pointerdown', pick);
  chart.addEventListener('pointermove', e => { if (e.buttons || e.pointerType !== 'mouse') pick(e); });

  $('#trendOn').addEventListener('change', e => { state.trend.on = e.target.checked; draw(); });
  document.querySelectorAll('#trendType button').forEach(b => b.addEventListener('click', () => {
    state.trend.deg[quantity().key] = +b.dataset.deg;
    draw();
  }));

  document.querySelectorAll('#smoothTabs button').forEach(b => b.addEventListener('click', () => {
    state.smoothing = b.dataset.smooth;
    setSegmented('#smoothTabs', 'smooth', state.smoothing);
    recompute();
  }));

  document.querySelectorAll('#decSep button').forEach(b => b.addEventListener('click', () => {
    state.comma = b.dataset.dec === 'comma';
    setSegmented('#decSep', 'dec', b.dataset.dec);
    try { localStorage.setItem('decSep', b.dataset.dec); } catch { /* приватный режим */ }
    draw();
    drawTable();
  }));

  const baseName = () => (app.dataName() || 'video').replace(/\.[^.]+$/, '').replace(/[^\wа-яё-]+/gi, '_').replace(/^_+|_+$/g, '') || 'video';

  $('#copyBtn').addEventListener('click', async () => {
    const ok = await copyText(exportText('\t', state.comma));
    app.toast(t(ok ? 'toast.copied' : 'toast.copyFailed'));
  });

  $('#csvBtn').addEventListener('click', () => {
    const text = '﻿' + exportText(state.comma ? ';' : ',', state.comma);
    saveBlob(new Blob([text], { type: 'text/csv;charset=utf-8' }), `${baseName()}_${t('res.file')}.csv`);
  });

  $('#pngBtn').addEventListener('click', () => {
    const q = quantity();
    const f = state.trend.on ? fit(q.key) : null;
    const c = document.createElement('canvas');
    drawChart(c, {
      width: 1600, height: 1000, dpr: 1, font: 26,
      xs: series.t, ys: series[q.key], color: '#0071e3',
      xLabel: 't (s)', yLabel: `${q.name} (${q.unit})`, comma: state.comma,
      title: t('res.chartTitle', { q: q.name }) + (state.smoothing !== 'none' ? t('res.smoothed') : ''),
      subtitle: f ? `${t('res.trendline')}: ${equation(f, q.name, 't', state.comma)}   ${r2Text(f)}` : '',
      trend: f ? f.f : null,
    });
    saveBlob(canvasToBlobSync(c), `${baseName()}_${q.key}.png`).then(r => {
      if (r === 'downloaded') app.toast(t('toast.chartSaved'));
    });
  });

  window.addEventListener('resize', () => { if (state.step === 4) draw(); });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (state.step === 4) draw(); });

  return {
    enter() {
      setSegmented('#smoothTabs', 'smooth', state.smoothing);
      setSegmented('#decSep', 'dec', state.comma ? 'comma' : 'dot');
      highlight = null;
      if (adding) closeAdd();
      requestAnimationFrame(recompute);
    },
    leave() {},
    relabel() {
      state.comma = defaultComma();
      setSegmented('#decSep', 'dec', state.comma ? 'comma' : 'dot');
      banner();
      if (series) { draw(); drawTable(); }
    },
    exportText,
    get series() { return series; },
  };
}
