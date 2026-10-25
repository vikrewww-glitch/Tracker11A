// Экспорт: таблица для Excel (через табуляцию), CSV и PNG.

export const COLUMNS = [
  { key: 't', label: 't (с)', dec: 4 },
  { key: 'x', label: 'x (м)', dec: 4 },
  { key: 'y', label: 'y (м)', dec: 4 },
  { key: 'vx', label: 'vx (м/с)', dec: 3 },
  { key: 'vy', label: 'vy (м/с)', dec: 3 },
  { key: 'ax', label: 'ax (м/с²)', dec: 3 },
  { key: 'ay', label: 'ay (м/с²)', dec: 3 },
];

export function fmt(v, dec, comma) {
  if (v == null || !isFinite(v)) return '';
  const s = v.toFixed(dec);
  return comma ? s.replace('.', ',') : s;
}

export function tableText(series, sep, comma) {
  const lines = [COLUMNS.map(c => c.label).join(sep)];
  for (let i = 0; i < series.t.length; i++) {
    lines.push(COLUMNS.map(c => fmt(series[c.key][i], c.dec, comma)).join(sep));
  }
  return lines.join('\r\n');
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

const isTouch = () => window.matchMedia('(pointer: coarse)').matches;

// На телефоне — системное меню «Поделиться» (там есть «Сохранить изображение»),
// на компьютере — обычное скачивание.
export async function saveBlob(blob, filename) {
  const file = new File([blob], filename, { type: blob.type });
  if (isTouch() && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return 'shared';
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return 'downloaded';
}

// Синхронное получение Blob из canvas, чтобы не потерять «жест пользователя» в Safari.
export function canvasToBlobSync(canvas) {
  const data = canvas.toDataURL('image/png');
  const bin = atob(data.split(',')[1]);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: 'image/png' });
}
