// Шаг 4: графики, таблица и экспорт.
import { computeSeries } from './physics.js?v=20261025110519';
import { drawChart, nearestPoint } from './chart.js?v=20261025110519';
import { COLUMNS, fmt, tableText, copyText, saveBlob, canvasToBlobSync } from './export.js?v=20261025110519';
import { t, getLang } from './i18n.js?v=20261025110519';

export const QUANTITIES = [
  { key: 'x', html: 'x', name: 'x', unit: 'm', dec: 3 },
  { key: 'y', html: 'y', name: 'y', unit: 'm', dec: 3 },
  { key: 'vx', html: 'v<sub>x</sub>', name: 'vx', unit: 'm/s', dec: 3 },
  { key: 'vy', html: 'v<sub>y</sub>', name: 'vy', unit: 'm/s', dec: 3 },
  { key: 'v', html: 'v', name: 'v', unit: 'm/s', dec: 3 },
  { key: 'ax', html: 'a<sub>x</sub>', name: 'ax', unit: 'm/s²', dec: 2 },
  { key: 'ay', html: 'a<sub>y</sub>', name: 'ay', unit: 'm/s²', dec: 2 },
];

// Цвета графика из текущей темы (светлая/тёмная).
function theme() {
  const cs = getComputedStyle(document.documentElement);
  const v = n => cs.getPropertyValue(n).trim();
  return { bg: v('--surface'), grid: v('--sep'), zero: v('--text-3'), text: v('--text'), text2: v('--text-2'), accent: v('--accent') };
}

export function initResults(app) {
  const { state } = app;
  const $ = s => document.querySelector(s);
  const chart = $('#chart'), readout = $('#readout');
  let series = null, layout = null, highlight = null;

  // Разделитель: сохранённый выбор, иначе — по языку (в португальском принята запятая).
  const savedSep = () => { try { return localStorage.getItem('decSep'); } catch { return null; } };
  const defaultComma = () => (savedSep() ? savedSep() === 'comma' : getLang() === 'pt');
  state.comma = defaultComma();

  const tabs = $('#qTabs');
  for (const q of QUANTITIES) {
    const b = document.createElement('button');
    b.dataset.q = q.key;
    b.innerHTML = q.html;
    b.addEventListener('click', () => { state.quantity = q.key; highlight = null; draw(); });
    tabs.appendChild(b);
  }

  const quantity = () => QUANTITIES.find(q => q.key === state.quantity) || QUANTITIES[1];
  const num = (v, dec) => fmt(v, dec, state.comma).replace('-', '−');

  function setSegmented(sel, attr, value) {
    document.querySelectorAll(`${sel} button`).forEach(b => b.classList.toggle('on', b.dataset[attr] === value));
  }

  function draw() {
    const q = quantity();
    tabs.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.q === q.key));
    const w = chart.parentElement.clientWidth - 16;
    if (w <= 0 || !series) return;
    const h = Math.round(Math.min(Math.max(w * 0.68, 240), 400));
    chart.style.height = h + 'px';
    const th = theme();
    layout = drawChart(chart, {
      width: w, height: h, dpr: window.devicePixelRatio || 1,
      xs: series.t, ys: series[q.key], color: th.accent, theme: th,
      xLabel: 't (s)', yLabel: `${q.name} (${q.unit})`, highlight, comma: state.comma,
    });
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
    if (highlight == null) readout.textContent = t(vals.length ? 'res.touch' : 'res.notEnough');
  }

  function drawTable() {
    const head = '<tr>' + COLUMNS.map(c => `<th>${c.label}</th>`).join('') + '</tr>';
    const rows = [];
    for (let i = 0; i < series.t.length; i++) {
      rows.push('<tr>' + COLUMNS.map(c => `<td>${fmt(series[c.key][i], c.dec, state.comma)}</td>`).join('') + '</tr>');
    }
    $('#table').innerHTML = `<thead>${head}</thead><tbody>${rows.join('')}</tbody>`;
  }

  function recompute() {
    series = computeSeries(app.samples(), state.smoothing);
    draw();
    drawTable();
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

  const baseName = () => (app.video.name || 'video').replace(/\.[^.]+$/, '').replace(/[^\wа-яё-]+/gi, '_').replace(/^_+|_+$/g, '') || 'video';

  $('#copyBtn').addEventListener('click', async () => {
    const ok = await copyText(tableText(series, '\t', state.comma));
    app.toast(t(ok ? 'toast.copied' : 'toast.copyFailed'));
  });

  $('#csvBtn').addEventListener('click', () => {
    const text = '﻿' + tableText(series, state.comma ? ';' : ',', state.comma);
    saveBlob(new Blob([text], { type: 'text/csv;charset=utf-8' }), `${baseName()}_${t('res.file')}.csv`);
  });

  $('#pngBtn').addEventListener('click', () => {
    const q = quantity();
    const c = document.createElement('canvas');
    drawChart(c, {
      width: 1600, height: 1000, dpr: 1, font: 26,
      xs: series.t, ys: series[q.key], color: '#0071e3',
      xLabel: 't (s)', yLabel: `${q.name} (${q.unit})`, comma: state.comma,
      title: t('res.chartTitle', { q: q.name }) + (state.smoothing !== 'none' ? t('res.smoothed') : ''),
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
      requestAnimationFrame(recompute);
    },
    leave() {},
    relabel() {
      state.comma = defaultComma();
      setSegmented('#decSep', 'dec', state.comma ? 'comma' : 'dot');
      if (series) { draw(); drawTable(); }
    },
    get series() { return series; },
  };
}
