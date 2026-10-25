// Минимальный парсер MP4/MOV: достаёт из видеодорожки точные времена кадров
// (таблицы stts/ctts + список правок elst), чтобы знать FPS и время каждого кадра.

const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts']);

function type4(dv, off) {
  return String.fromCharCode(dv.getUint8(off), dv.getUint8(off + 1), dv.getUint8(off + 2), dv.getUint8(off + 3));
}

// Перебор дочерних боксов в диапазоне [start, end) буфера.
function* boxes(dv, start, end) {
  let off = start;
  while (off + 8 <= end) {
    let size = dv.getUint32(off);
    const type = type4(dv, off + 4);
    let hdr = 8;
    if (size === 1) { size = Number(dv.getBigUint64(off + 8)); hdr = 16; }
    else if (size === 0) size = end - off;
    if (size < hdr || off + size > end) return;
    yield { type, start: off + hdr, end: off + size };
    off += size;
  }
}

function find(dv, start, end, path) {
  const [head, ...rest] = path;
  for (const b of boxes(dv, start, end)) {
    if (b.type === head) return rest.length ? find(dv, b.start, b.end, rest) : b;
  }
  return null;
}

// Ищем бокс moov верхнего уровня, читая файл кусками (moov бывает в конце файла).
async function readMoov(file) {
  let off = 0;
  while (off + 8 <= file.size) {
    const dv = new DataView(await file.slice(off, off + 16).arrayBuffer());
    let size = dv.getUint32(0);
    const type = type4(dv, 4);
    let hdr = 8;
    if (size === 1) { size = Number(dv.getBigUint64(8)); hdr = 16; }
    else if (size === 0) size = file.size - off;
    if (size < hdr) return null;
    if (type === 'moov') {
      if (size > 200e6) return null;
      return new DataView(await file.slice(off + hdr, off + size).arrayBuffer());
    }
    // Первый бокс в MP4/MOV — ftyp/wide/mdat/free и т.п.; если иначе, это не MP4.
    if (off === 0 && !/^[a-z]{4}$/.test(type)) return null;
    off += size;
  }
  return null;
}

function timescaleOf(dv, box) {
  const v = dv.getUint8(box.start);
  return dv.getUint32(box.start + (v === 1 ? 20 : 12));
}

export async function readMp4Timing(file) {
  const dv = await readMoov(file);
  if (!dv) return null;
  const mvhd = find(dv, 0, dv.byteLength, ['mvhd']);
  const movieTs = mvhd ? timescaleOf(dv, mvhd) : 0;

  for (const trak of boxes(dv, 0, dv.byteLength)) {
    if (trak.type !== 'trak') continue;
    const hdlr = find(dv, trak.start, trak.end, ['mdia', 'hdlr']);
    if (!hdlr || type4(dv, hdlr.start + 8) !== 'vide') continue;
    const mdhd = find(dv, trak.start, trak.end, ['mdia', 'mdhd']);
    const stts = find(dv, trak.start, trak.end, ['mdia', 'minf', 'stbl', 'stts']);
    if (!mdhd || !stts) continue;
    const ts = timescaleOf(dv, mdhd);
    if (!ts) continue;

    // Время декодирования каждого сэмпла.
    const dts = [];
    let t = 0;
    const n = dv.getUint32(stts.start + 4);
    for (let i = 0; i < n; i++) {
      const count = dv.getUint32(stts.start + 8 + i * 8);
      const delta = dv.getUint32(stts.start + 12 + i * 8);
      for (let k = 0; k < count; k++) { dts.push(t); t += delta; }
      if (dts.length > 500000) return null;
    }
    if (dts.length < 2) continue;

    // Сдвиги композиции (B-кадры): pts = dts + offset.
    const pts = dts.slice();
    const ctts = find(dv, trak.start, trak.end, ['mdia', 'minf', 'stbl', 'ctts']);
    if (ctts) {
      const m = dv.getUint32(ctts.start + 4);
      let idx = 0;
      for (let i = 0; i < m; i++) {
        const count = dv.getUint32(ctts.start + 8 + i * 8);
        const offset = dv.getInt32(ctts.start + 12 + i * 8);
        for (let k = 0; k < count && idx < pts.length; k++) pts[idx++] += offset;
      }
    }

    // Список правок: пустые сегменты сдвигают начало, media_time обрезает начало.
    let mediaTime = 0, emptyOffset = 0;
    const elst = find(dv, trak.start, trak.end, ['edts', 'elst']);
    if (elst) {
      const v = dv.getUint8(elst.start);
      const m = dv.getUint32(elst.start + 4);
      let p = elst.start + 8;
      for (let i = 0; i < m; i++) {
        const segDur = v === 1 ? Number(dv.getBigUint64(p)) : dv.getUint32(p);
        const mt = v === 1 ? Number(dv.getBigInt64(p + 8)) : dv.getInt32(p + 4);
        p += v === 1 ? 20 : 12;
        if (mt === -1) { if (movieTs) emptyOffset += segDur / movieTs; }
        else { mediaTime = mt; break; }
      }
    }

    pts.sort((a, b) => a - b);
    const times = [];
    for (const p of pts) {
      const sec = (p - mediaTime) / ts + emptyOffset;
      if (sec > -1e-6) times.push(Math.max(0, sec));
    }
    if (times.length < 2) continue;
    const fps = Math.round((times.length - 1) / (times[times.length - 1] - times[0]) * 1e6) / 1e6;
    // Проверка постоянства частоты: насколько интервалы отличаются от среднего.
    const mean = 1 / fps;
    let maxDev = 0;
    for (let i = 1; i < times.length; i++) maxDev = Math.max(maxDev, Math.abs(times[i] - times[i - 1] - mean));
    return { times, fps, variable: maxDev > mean * 0.25 };
  }
  return null;
}
