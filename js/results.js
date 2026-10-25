// Шаг 4: графики, таблица и экспорт.
import { computeSeries } from './physics.js';
import { drawChart, nearestPoint } from './chart.js';
import { COLUMNS, fmt, tableText, copyText, saveBlob, canvasToBlobSync } from './export.js';

export const QUANTITIES = [
  { key: 'x', name: 'x', unit: 'м', color: '#5a4bff', dec: 3 },
  { key: 'y', name: 'y', unit: 'м', color: '#ff3b8b', dec: 3 },
  { key: 'vx', name: 'vx', unit: 'м/с', color: '#1f9bff', dec: 3 },
  { key: 'vy', name: 'vy', unit: 'м/с', color: '#17b978', dec: 3 },
  { key: 'v', name: 'v', unit: 'м/с', color: '#ff7a3d', dec: 3 },
  { key: 'ax', name: 'ax', unit: 'м/с²', color: '#8a4bff', dec: 2 },
  { key: 'ay', name: 'ay', unit: 'м/с²', color: '#e5484d', dec: 2 },
];

export function initResults(app) {
  const { state } = app;
  const $ = s => document.querySelector(s);
  const chart = $('#chart'), readout = $('#readout');
  let series = null, layout = null, highlight = null;

  try { state.comma = localStorage.getItem('decSep') !== 'dot'; } catch { state.comma = true; }
  $('#decSep').value = state.comma ? 'comma' : 'dot';

  const tabs = $('#qTabs');
  for (const q of QUANTITIES) {
    const b = document.createElement('button');
    b.dataset.q = q.key;
    b.textContent = `${q.name}(t)`;
    b.addEventListener('click', () => { state.quantity = q.key; highlight = null; draw(); });
    tabs.appendChild(b);
  }

  const quantity = () => QUANTITIES.find(q => q.key === state.quantity) || QUANTITIES[1];
  const num = (v, dec) => fmt(v, dec, true).replace('-', '−');

  function draw() {
    const q = quantity();
    tabs.querySelectorAll('button').forEach(b => {
      const on = b.dataset.q === q.key;
      b.classList.toggle('on', on);
      b.style.background = on ? q.color : '';
    });
    const w = chart.parentElement.clientWidth - 16;
    if (w <= 0 || !series) return;
    const h = Math.round(Math.min(Math.max(w * 0.72, 240), 420));
    chart.style.height = h + 'px';
    layout = drawChart(chart, {
      width: w, height: h, dpr: window.devicePixelRatio || 1,
      xs: series.t, ys: series[q.key], color: q.color,
      xLabel: 't, с', yLabel: `${q.name}, ${q.unit}`, highlight,
    });
    const vals = series[q.key].filter(v => v != null);
    if (vals.length) {
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      $('#stats').textContent = `Среднее ${q.name} = ${num(mean, q.dec)} ${q.unit} · мин ${num(Math.min(...vals), q.dec)} · макс ${num(Math.max(...vals), q.dec)}`;
    } else {
      $('#stats').textContent = 'Мало точек для этой величины';
    }
    if (highlight == null) readout.textContent = 'Тапните по графику, чтобы увидеть значение';
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
    readout.textContent = `t = ${num(series.t[p.i], 3)} с · ${q.name} = ${num(p.y, q.dec + 1)} ${q.unit}`;
    draw();
  }
  chart.addEventListener('pointerdown', pick);
  chart.addEventListener('pointermove', e => { if (e.buttons || e.pointerType !== 'mouse') pick(e); });

  document.querySelectorAll('#smoothTabs button').forEach(b => b.addEventListener('click', () => {
    state.smoothing = b.dataset.smooth;
    document.querySelectorAll('#smoothTabs button').forEach(x => x.classList.toggle('on', x === b));
    recompute();
  }));

  $('#decSep').addEventListener('change', e => {
    state.comma = e.target.value === 'comma';
    try { localStorage.setItem('decSep', e.target.value); } catch { /* приватный режим */ }
    drawTable();
  });

  const baseName = () => (app.video.name || 'video').replace(/\.[^.]+$/, '').replace(/[^\wа-яё-]+/gi, '_');

  $('#copyBtn').addEventListener('click', async () => {
    const ok = await copyText(tableText(series, '\t', state.comma));
    app.toast(ok ? '✓ Скопировано. Вставьте в Excel или Google Таблицы' : 'Не удалось скопировать. Скачайте CSV');
  });

  $('#csvBtn').addEventListener('click', () => {
    const text = '﻿' + tableText(series, state.comma ? ';' : ',', state.comma);
    saveBlob(new Blob([text], { type: 'text/csv;charset=utf-8' }), `${baseName()}_данные.csv`);
  });

  $('#pngBtn').addEventListener('click', () => {
    const q = quantity();
    const c = document.createElement('canvas');
    drawChart(c, {
      width: 1200, height: 800, dpr: 1, font: 26,
      xs: series.t, ys: series[q.key], color: q.color,
      xLabel: 't, с', yLabel: `${q.name}, ${q.unit}`,
      title: `График ${q.name}(t)${state.smoothing !== 'none' ? ' (сглажено)' : ''}`,
    });
    saveBlob(canvasToBlobSync(c), `${baseName()}_${q.key}.png`).then(r => {
      if (r === 'downloaded') app.toast('Картинка сохранена');
    });
  });

  window.addEventListener('resize', () => { if (state.step === 4) draw(); });

  return {
    enter() {
      document.querySelectorAll('#smoothTabs button').forEach(x => x.classList.toggle('on', x.dataset.smooth === state.smoothing));
      highlight = null;
      requestAnimationFrame(recompute);
    },
    leave() {},
    get series() { return series; },
  };
}
