// Переводы интерфейса: английский и европейский португальский (pt-PT).

export const DICT = {
  en: {
    'doc.title': 'Tracker11A — Motion Analysis',
    'lang.switch': 'Language',
    'step.video': 'Video',
    'step.calibrate': 'Calibrate',
    'step.track': 'Track',
    'step.results': 'Results',

    'hero.title': 'See motion<br>in numbers.',
    'hero.lead': 'Video motion analysis for physics class. Track a moving object frame by frame. Position, velocity and acceleration are computed on your device — your video never leaves it.',
    'src.choose': 'Choose Video',
    'src.choose.sub': 'From your library or files',
    'src.record': 'Record Video',
    'src.record.sub': 'Use the camera',
    'src.sample': 'Try a Sample',
    'src.sample.sub': 'A ball in projectile motion',
    'tips.title': 'For best results',
    'tips.trim': '<b>Trim the video first.</b> It should show only the time interval you’re interested in — no more, no less — because the app reads the motion across the whole video.',
    'tips.still': 'Keep the phone still — use a tripod or rest it on something.',
    'tips.straight': 'Point the camera straight at the plane of motion.',
    'tips.ruler': 'Include an object of known length, like a meter stick.',
    'tips.light': 'Use good lighting and a plain, contrasting background.',

    'cal.title': 'Calibrate',
    'cal.lead': 'Set the time range, the scale and the coordinate axes.',
    'cal.frames': 'Frames',
    'cal.scale': 'Scale',
    'cal.axes': 'Axes',
    'cal.fps': 'Frame rate',
    'cal.start': 'Start frame',
    'cal.end': 'End frame',
    'cal.setCurrent': 'Set to Current',
    'cal.framesNote': 'Scrub to where the motion begins and tap “Set to Current”, then do the same for the end.',
    'cal.length': 'Reference length',
    'cal.scaleNote': 'Drag the two blue handles to the ends of an object of known length.',
    'cal.ppm': 'Scale: {v} px per meter.',
    'cal.rotation': 'Rotation',
    'cal.reset': 'Reset',
    'cal.yAxis': 'Y axis',
    'cal.up': 'Up',
    'cal.down': 'Down',
    'cal.axesNote': 'Drag the origin to move the axes. Drag the end of the x arrow to rotate them.',
    'fps.file': 'Frame rate read from the file.',
    'fps.fileVar': 'Frame rate read from the file (variable).',
    'fps.estimate': 'Frame rate estimated — please check it.',
    'fps.default': 'Frame rate unknown — please enter it.',
    'fps.manual': 'Frame rate entered manually.',
    'toast.fpsRange': 'Enter a frame rate between 1 and 1000',
    'toast.startSet': 'Start frame set to {n}',
    'toast.endSet': 'End frame set to {n}',
    'toast.endAfterStart': 'The end frame must come after the start frame',

    'track.title': 'Track',
    'track.leadManual': 'Tap the center of the object. The video advances to the next frame automatically.',
    'track.leadAuto': 'Tap the object once and fit the box around it. Tracking then follows it frame by frame.',
    'track.manual': 'Manual',
    'track.auto': 'Automatic',
    'track.boxSize': 'Box size',
    'track.start': 'Start Tracking',
    'track.stop': 'Stop',
    'track.resume': 'Resume',
    'track.endHere': 'End Here',
    'track.frameStep': 'Frame step',
    'track.every1': 'Every frame',
    'track.every2': 'Every 2nd',
    'track.every3': 'Every 3rd',
    'track.every5': 'Every 5th',
    'track.points': 'Points',
    'track.delete': 'Delete Point',
    'track.clear': 'Clear All',
    'track.confirmClear': 'Remove all marked points?',
    'status.selected': 'Object selected. Tap Start Tracking.',
    'status.lowContrast': 'The object blends into the background. Try a larger box.',
    'status.done': 'Done — tracked to the end frame.',
    'status.lost': 'Lost the object at frame {n}. Tap it and tap Resume — or, if the motion is over, tap End Here.',
    'status.tracking': 'Tracking… frame {n} of {end}',
    'status.stopped': 'Stopped.',
    'status.endSet': 'End frame set to {n}. You can see the results now.',
    'toast.outOfRange': 'This frame is outside the selected range',
    'toast.tapFirst': 'Tap the object first',
    'toast.lastFrame': 'Last frame reached — on to the results',

    'res.title': 'Results',
    'res.lead': 'Velocity and acceleration use central differences.',
    'res.touch': 'Touch the chart to read a value',
    'res.notEnough': 'Not enough points for this quantity',
    'res.mean': 'Mean {q}',
    'res.min': 'Min',
    'res.max': 'Max',
    'res.smoothing': 'Smoothing',
    'res.off': 'Off',
    'res.light': 'Light',
    'res.strong': 'Strong',
    'res.decimal': 'Decimal',
    'res.copy': 'Copy for Excel',
    'res.copy.sub': 'Paste straight into Excel or Google Sheets',
    'res.csv': 'Download CSV',
    'res.png': 'Save Chart as Image',
    'res.data': 'Data',
    'res.chartTitle': '{q} vs. t',
    'res.smoothed': ' (smoothed)',
    'res.file': 'data',
    'toast.copied': 'Copied — paste it into Excel or Google Sheets',
    'toast.copyFailed': 'Couldn’t copy. Try Download CSV instead',
    'toast.chartSaved': 'Chart saved',

    'nav.back': 'Back',
    'nav.continue': 'Continue',
    'nav.results': 'See Results',
    'aria.zoomOut': 'Zoom out',
    'aria.fit': 'Fit to screen',
    'aria.zoomIn': 'Zoom in',
    'aria.prev': 'Previous frame',
    'aria.next': 'Next frame',
    'aria.frame': 'Frame',
    'frame.info': 'Frame <b>{n}</b> of {max} · t = <b>{t}</b> s',
    'frame.infoRange': 'Frame <b>{n}</b> <span>({a}–{b})</span> · t = <b>{t}</b> s',
    'frame.marked': 'Marked',

    'toast.needVideo': 'Choose a video first',
    'toast.needLength': 'Enter the reference length',
    'toast.needPoints': 'Mark at least 3 points',
    'load.confirm': 'Open a new video? Your marked points will be removed.',
    'load.opening': 'Opening video…',
    'load.failed': 'This video can’t be opened',
    'load.failedHint': 'Your browser may not support its format — for example, HEVC from an iPhone in Chrome on Android or Windows. Try another video, or set iPhone Settings → Camera → Formats to “Most Compatible”.',
    'load.meta': '{w} × {h} · {d} s · {n} frames · {fps}',
    'load.fps': '{v} fps',
    'load.fpsEstimate': '≈ {v} fps (estimated — check it in Calibrate)',
    'load.fpsUnknown': 'frame rate unknown — enter it in Calibrate',
    'load.variable': 'Variable frame rate — each frame’s exact time is read from the file.',
    'load.sample': 'Loading sample…',
    'load.sampleFailed': 'The sample couldn’t be loaded',
    'load.sampleName': 'Sample — projectile.mp4',
  },

  pt: {
    'doc.title': 'Tracker11A — Análise de Movimento',
    'lang.switch': 'Idioma',
    'step.video': 'Vídeo',
    'step.calibrate': 'Calibrar',
    'step.track': 'Rastrear',
    'step.results': 'Resultados',

    'hero.title': 'Veja o movimento<br>em números.',
    'hero.lead': 'Análise de movimento em vídeo para as aulas de Física. Acompanhe um objeto em movimento, fotograma a fotograma. A posição, a velocidade e a aceleração são calculadas no seu dispositivo — o vídeo nunca sai dele.',
    'src.choose': 'Escolher vídeo',
    'src.choose.sub': 'Da galeria ou dos ficheiros',
    'src.record': 'Gravar vídeo',
    'src.record.sub': 'Usar a câmara',
    'src.sample': 'Experimentar um exemplo',
    'src.sample.sub': 'Uma bola em lançamento oblíquo',
    'tips.title': 'Para melhores resultados',
    'tips.trim': '<b>Corte o vídeo antes de o carregar.</b> Deve mostrar apenas o intervalo de tempo que lhe interessa — nem mais, nem menos — porque a aplicação lê o movimento ao longo de todo o vídeo.',
    'tips.still': 'Mantenha o telemóvel imóvel — use um tripé ou apoie-o em algo.',
    'tips.straight': 'Aponte a câmara de frente para o plano do movimento.',
    'tips.ruler': 'Inclua no enquadramento um objeto de comprimento conhecido, como uma régua de um metro.',
    'tips.light': 'Use boa iluminação e um fundo liso e contrastante.',

    'cal.title': 'Calibração',
    'cal.lead': 'Defina o intervalo de tempo, a escala e os eixos de coordenadas.',
    'cal.frames': 'Fotogramas',
    'cal.scale': 'Escala',
    'cal.axes': 'Eixos',
    'cal.fps': 'Taxa de fotogramas',
    'cal.start': 'Fotograma inicial',
    'cal.end': 'Fotograma final',
    'cal.setCurrent': 'Usar o atual',
    'cal.framesNote': 'Avance até ao momento em que o movimento começa e toque em «Usar o atual»; depois faça o mesmo para o fim.',
    'cal.length': 'Comprimento de referência',
    'cal.scaleNote': 'Arraste os dois pontos azuis para as extremidades de um objeto de comprimento conhecido.',
    'cal.ppm': 'Escala: {v} px por metro.',
    'cal.rotation': 'Rotação',
    'cal.reset': 'Repor',
    'cal.yAxis': 'Eixo Y',
    'cal.up': 'Para cima',
    'cal.down': 'Para baixo',
    'cal.axesNote': 'Arraste a origem para mover os eixos. Arraste a ponta da seta x para os rodar.',
    'fps.file': 'Taxa de fotogramas lida do ficheiro.',
    'fps.fileVar': 'Taxa de fotogramas lida do ficheiro (variável).',
    'fps.estimate': 'Taxa de fotogramas estimada — confirme-a.',
    'fps.default': 'Taxa de fotogramas desconhecida — introduza-a.',
    'fps.manual': 'Taxa de fotogramas introduzida manualmente.',
    'toast.fpsRange': 'Introduza uma taxa de fotogramas entre 1 e 1000',
    'toast.startSet': 'Fotograma inicial: {n}',
    'toast.endSet': 'Fotograma final: {n}',
    'toast.endAfterStart': 'O fotograma final tem de ser posterior ao inicial',

    'track.title': 'Rastreio',
    'track.leadManual': 'Toque no centro do objeto. O vídeo avança automaticamente para o fotograma seguinte.',
    'track.leadAuto': 'Toque uma vez no objeto e ajuste a caixa à volta dele. O rastreio segue-o depois fotograma a fotograma.',
    'track.manual': 'Manual',
    'track.auto': 'Automático',
    'track.boxSize': 'Tamanho da caixa',
    'track.start': 'Iniciar rastreio',
    'track.stop': 'Parar',
    'track.resume': 'Retomar',
    'track.endHere': 'Terminar aqui',
    'track.frameStep': 'Passo',
    'track.every1': 'Todos os fotogramas',
    'track.every2': '1 em cada 2',
    'track.every3': '1 em cada 3',
    'track.every5': '1 em cada 5',
    'track.points': 'Pontos',
    'track.delete': 'Apagar ponto',
    'track.clear': 'Apagar tudo',
    'track.confirmClear': 'Apagar todos os pontos marcados?',
    'status.selected': 'Objeto selecionado. Toque em «Iniciar rastreio».',
    'status.lowContrast': 'O objeto confunde-se com o fundo. Experimente uma caixa maior.',
    'status.done': 'Concluído — rastreado até ao fotograma final.',
    'status.lost': 'O objeto perdeu-se no fotograma {n}. Toque nele e em «Retomar» — ou, se o movimento já terminou, em «Terminar aqui».',
    'status.tracking': 'A rastrear… fotograma {n} de {end}',
    'status.stopped': 'Parado.',
    'status.endSet': 'Fotograma final definido como {n}. Já pode ver os resultados.',
    'toast.outOfRange': 'Este fotograma está fora do intervalo escolhido',
    'toast.tapFirst': 'Toque primeiro no objeto',
    'toast.lastFrame': 'Último fotograma — siga para os resultados',

    'res.title': 'Resultados',
    'res.lead': 'A velocidade e a aceleração são calculadas por diferenças centrais.',
    'res.touch': 'Toque no gráfico para ler um valor',
    'res.notEnough': 'Pontos insuficientes para esta grandeza',
    'res.mean': 'Média de {q}',
    'res.min': 'Mín.',
    'res.max': 'Máx.',
    'res.smoothing': 'Suavização',
    'res.off': 'Não',
    'res.light': 'Leve',
    'res.strong': 'Forte',
    'res.decimal': 'Separador decimal',
    'res.copy': 'Copiar para o Excel',
    'res.copy.sub': 'Cole diretamente no Excel ou no Google Sheets',
    'res.csv': 'Transferir CSV',
    'res.png': 'Guardar gráfico como imagem',
    'res.data': 'Dados',
    'res.chartTitle': '{q} em função de t',
    'res.smoothed': ' (suavizado)',
    'res.file': 'dados',
    'toast.copied': 'Copiado — cole no Excel ou no Google Sheets',
    'toast.copyFailed': 'Não foi possível copiar. Transfira o CSV',
    'toast.chartSaved': 'Gráfico guardado',

    'nav.back': 'Voltar',
    'nav.continue': 'Continuar',
    'nav.results': 'Ver resultados',
    'aria.zoomOut': 'Reduzir',
    'aria.fit': 'Ajustar ao ecrã',
    'aria.zoomIn': 'Ampliar',
    'aria.prev': 'Fotograma anterior',
    'aria.next': 'Fotograma seguinte',
    'aria.frame': 'Fotograma',
    'frame.info': 'Fotograma <b>{n}</b> de {max} · t = <b>{t}</b> s',
    'frame.infoRange': 'Fotograma <b>{n}</b> <span>({a}–{b})</span> · t = <b>{t}</b> s',
    'frame.marked': 'Marcado',

    'toast.needVideo': 'Escolha primeiro um vídeo',
    'toast.needLength': 'Introduza o comprimento de referência',
    'toast.needPoints': 'Marque pelo menos 3 pontos',
    'load.confirm': 'Abrir um novo vídeo? Os pontos marcados serão apagados.',
    'load.opening': 'A abrir o vídeo…',
    'load.failed': 'Não é possível abrir este vídeo',
    'load.failedHint': 'O navegador pode não suportar este formato — por exemplo, HEVC de um iPhone no Chrome em Android ou Windows. Experimente outro vídeo ou, no iPhone, escolha Definições → Câmara → Formatos → «Mais compatível».',
    'load.meta': '{w} × {h} · {d} s · {n} fotogramas · {fps}',
    'load.fps': '{v} fps',
    'load.fpsEstimate': '≈ {v} fps (estimado — confirme na calibração)',
    'load.fpsUnknown': 'taxa de fotogramas desconhecida — introduza-a na calibração',
    'load.variable': 'Taxa de fotogramas variável — o tempo exato de cada fotograma é lido do ficheiro.',
    'load.sample': 'A carregar o exemplo…',
    'load.sampleFailed': 'Não foi possível carregar o exemplo',
    'load.sampleName': 'Exemplo — lançamento.mp4',
  },
};

const LANGS = Object.keys(DICT);
const listeners = [];

function initialLang() {
  try {
    const saved = localStorage.getItem('lang');
    if (LANGS.includes(saved)) return saved;
  } catch { /* приватный режим */ }
  return /^pt\b/i.test(navigator.language || '') ? 'pt' : 'en';
}

let lang = initialLang();

export function getLang() { return lang; }

export function t(key, vars) {
  let s = DICT[lang][key] ?? DICT.en[key] ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
  return s;
}

// Число в формате текущего языка (в португальском — десятичная запятая).
export function num(v, dec) {
  const s = v.toFixed(dec);
  return lang === 'pt' ? s.replace('.', ',') : s;
}

export function applyDom(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-html]').forEach(el => { el.innerHTML = t(el.dataset.i18nHtml); });
  root.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
  document.title = t('doc.title');
  document.documentElement.lang = lang === 'pt' ? 'pt-PT' : 'en';
}

export function setLang(l) {
  if (!LANGS.includes(l) || l === lang) return;
  lang = l;
  try { localStorage.setItem('lang', l); } catch { /* приватный режим */ }
  applyDom();
  listeners.forEach(fn => fn(l));
}

export function onLang(fn) { listeners.push(fn); }
