// Los episodios se leen del feed de Captivate, así que el sitio se actualiza solo al publicar.
const FEED = 'https://feeds.captivate.fm/breakdown-sessions/';
const ITUNES = 'http://www.itunes.com/dtds/podcast-1.0.dtd';
// El botón de play es un vinilo con surcos y etiqueta, igual en todos los tamaños.
const RINGS = '<circle cx="32" cy="32" r="31" stroke-width="1.5"/><circle cx="32" cy="32" r="25" stroke-width=".6"/><circle cx="32" cy="32" r="20" stroke-width=".6"/><circle cx="32" cy="32" r="14" stroke-width="1.5"/>';
const vinyl = (playing) =>
  `<svg viewBox="0 0 64 64" aria-hidden="true">${RINGS}<path class="glyph" d="${playing ? 'M27 26h3.5v12H27zM33.5 26H37v12h-3.5z' : 'M29 26v12l10-6Z'}"/></svg>`;
// En la lista de episodios el play es solo el triángulo; el vinilo queda para el último episodio.
const glyph = (playing) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true"><path class="glyph" d="${playing ? 'M6 4h4.5v16H6zM13.5 4H18v16h-4.5z' : 'M6 3v18l15-9z'}"/></svg>`;

const $ = (id) => document.getElementById(id);
const audio = $('audio');
let episodes = [];
let current = null;

// Textos del sitio en los dos idiomas. Los títulos y descripciones de los episodios vienen del
// feed tal como se publicaron; eso no se traduce.
const I18N = {
  es: {
    navEpisodes: "Episodios",
    navAbout: "Acerca",
    navListen: "Escuchar",
    latest: "Último episodio",
    sessionNo: "Session n.º",
    loading: "Cargando episodios…",
    loadError: "No se pudieron cargar los episodios. Escúchalos en Spotify o Apple Podcasts.",
    released: "Publicado el",
    length: "Duración:",
    description: "Descripción de",
    play: "Reproducir",
    pause: "Pausar",
    theLatest: "el último episodio",
    position: "Posición",
    back15: "Retroceder 15 segundos",
    fwd15: "Adelantar 15 segundos",
    fold: "Bajar reproductor",
    unfold: "Subir reproductor",
    about1: "Breakdown Sessions es un podcast en inglés y español dedicado al análisis y la conversación sobre rock y metal.",
    about2: "En cada episodio exploramos canciones, álbumes y bandas desde distintos ángulos: composición, producción, letras, contexto y actualidad de la escena. También compartimos opiniones personales, experiencias como músicos y reflexiones sobre lo que está pasando en el género hoy.",
    about3: "Un espacio para hablar de música con criterio, sin exageraciones. Solo conversaciones honestas sobre las bandas y los sonidos que están marcando a esta generación.",
    byline: "Conduce Victor Martinez · Nuevos episodios cada semana",
  },
  en: {
    navEpisodes: "Episodes",
    navAbout: "About",
    navListen: "Listen",
    latest: "Latest episode",
    sessionNo: "Session no.",
    loading: "Loading episodes…",
    loadError: "Couldn't load the episodes. Listen on Spotify or Apple Podcasts.",
    released: "Released",
    length: "Length:",
    description: "Description of",
    play: "Play",
    pause: "Pause",
    theLatest: "the latest episode",
    position: "Position",
    back15: "Back 15 seconds",
    fwd15: "Forward 15 seconds",
    fold: "Hide player",
    unfold: "Show player",
    about1: "Breakdown Sessions is a podcast in English and Spanish devoted to analysis and conversation about rock and metal.",
    about2: "In each episode we explore songs, albums, and bands from different angles: songwriting, production, lyrics, context, and what's happening in the scene. We also share personal opinions, our experience as musicians, and thoughts on where the genre is today.",
    about3: "A place to talk about music with judgment and without hype. Just honest conversations about the bands and sounds shaping this generation.",
    byline: "Hosted by Victor Martinez · New episodes every week",
  },
};
let lang = 'en';
try {
  if (I18N[localStorage.getItem('lang')]) lang = localStorage.getItem('lang');
} catch {}
const t = (key) => I18N[lang][key];

const fmtDate = (d) => d.toLocaleDateString(lang, { day: 'numeric', month: 'short', year: 'numeric' }).replace(/\./g, '');

function fmtTime(s) {
  if (!isFinite(s)) return '0:00';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(sec).padStart(2, '0');
}

// El feed trae HTML en la descripción: se conserva solo el texto, párrafo por párrafo.
function paragraphs(html) {
  const doc = new DOMParser().parseFromString(html || '', 'text/html');
  const blocks = [...doc.body.querySelectorAll('p, li')].map((n) => n.textContent.trim()).filter(Boolean);
  return blocks.length ? blocks : [doc.body.textContent.trim()].filter(Boolean);
}

function parse(xml) {
  return [...xml.querySelectorAll('item')].map((item) => {
    const text = (tag) => item.querySelector(tag)?.textContent.trim() || '';
    const itunes = (tag) => item.getElementsByTagNameNS(ITUNES, tag)[0]?.textContent.trim() || '';
    const full = text('title');
    const num = itunes('episode') || (full.match(/#(\d+)/) || [])[1] || '';
    const title = full.replace(/^Session\s*#\d+\s*/i, '').trim() || full;
    return {
      num,
      title,
      date: new Date(text('pubDate')),
      duration: itunes('duration'),
      src: item.querySelector('enclosure')?.getAttribute('url') || '',
      slug: text('link').split('/').filter(Boolean).pop() || '',
      body: paragraphs(text('description')),
    };
  });
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function render() {
  const list = $('episodes');
  list.textContent = '';
  episodes.forEach((ep, i) => {
    const li = el('li');
    const head = el('div', 'ep-row');
    const play = el('button', 'play');
    play.type = 'button';
    play.addEventListener('click', () => toggleEpisode(i));

    // Tocar el título reproduce el episodio; el "+" de al lado abre su descripción.
    const row = el('button', 'ep');
    row.type = 'button';
    row.addEventListener('click', () => toggleEpisode(i));
    row.append(el('span', 'ep-num', ep.num), el('span', 'ep-title', ep.title), el('span', 'ep-date', fmtDate(ep.date)));

    const body = el('div', 'ep-body');
    body.hidden = true;
    // En celular la fecha no cabe en el renglón, así que abre la descripción.
    body.append(el('p', 'ep-when', `${t('released')} ${fmtDate(ep.date)}`));
    ep.body.forEach((p) => body.append(el('p', null, p)));
    if (ep.duration) body.append(el('p', null, `${t('length')} ${ep.duration}`));

    const more = el('button', 'more');
    more.type = 'button';
    more.setAttribute('aria-expanded', 'false');
    more.setAttribute('aria-label', `${t('description')} Session ${ep.num}`);
    more.addEventListener('click', () => {
      body.hidden = !body.hidden;
      more.setAttribute('aria-expanded', String(!body.hidden));
    });
    head.append(play, row, more);
    li.append(head, body);
    list.append(li);
  });

  const latest = episodes[0];
  $('latest-num').textContent = latest.title.startsWith('Session') ? t('latest') : `${t('sessionNo')} ${latest.num}`;
  $('latest-title').textContent = latest.title;
  $('latest-meta').textContent = [fmtDate(latest.date), latest.duration].filter(Boolean).join(' · ');
  $('latest').hidden = false;
}

function open(i, scroll) {
  const li = $('episodes').children[i];
  if (!li) return;
  li.querySelector('.ep-body').hidden = false;
  li.querySelector('.more').setAttribute('aria-expanded', 'true');
  if (scroll) li.scrollIntoView({ block: 'center' });
}

function load(i) {
  const ep = episodes[i];
  current = i;
  audio.src = ep.src;
  $('fill').style.width = '0';
  $('player-title').textContent = `${ep.num} · ${ep.title}`;
  $('mini-title').textContent = `${ep.num} · ${ep.title}`;
  $('player-time').textContent = ep.duration;
  [...$('episodes').children].forEach((li, j) => li.classList.toggle('playing', j === i));
  syncButtons();
  // Pantalla de bloqueo y controles del sistema: muestran el episodio en vez de un audio sin nombre.
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: ep.title,
      artist: 'Breakdown Sessions',
      album: `Session ${ep.num}`,
      artwork: [{ src: new URL('assets/icono-512.png', location.href).href, sizes: '512x512', type: 'image/png' }],
    });
  }
}

// Al terminar un episodio el navegador no lo marca como pausado, así que se mira también `ended`.
const playing = () => !audio.paused && !audio.ended;
// play() se rechaza si llega otra orden antes de que arranque; no es un error que mostrar.
const toggle = () => (playing() ? audio.pause() : audio.play().catch(() => {}));

// El reproductor aparece al dar play a un episodio. La flecha lo baja a una tira delgada con
// el título (el audio sigue sonando) y desde la tira se vuelve a subir.
function toggleEpisode(i) {
  if (current !== i) load(i);
  document.documentElement.classList.add('has-player');
  $('player').hidden = false;
  toggle();
}
const fold = (folded) => document.documentElement.classList.toggle('player-min', folded);
$('fold').addEventListener('click', () => fold(true));
$('mini-open').addEventListener('click', () => fold(false));
$('mini-play').addEventListener('click', () => toggle());

// Cada botón muestra pausa solo si su episodio es el que está sonando.
function syncButtons() {
  const on = playing();
  const set = (btn, playing, name) => {
    btn.innerHTML = btn.classList.contains('play-lg') ? vinyl(playing) : glyph(playing);
    btn.setAttribute('aria-label', `${playing ? t('pause') : t('play')} ${name}`.trim());
  };
  $('toggle').setAttribute('aria-label', on ? t('pause') : t('play'));
  $('mini-play').innerHTML = glyph(on);
  $('mini-play').setAttribute('aria-label', on ? t('pause') : t('play'));
  set($('latest-play'), on && current === 0, t('theLatest'));
  [...$('episodes').children].forEach((li, j) => set(li.querySelector('.play'), on && current === j, `Session ${episodes[j].num}`));
}

function seek(ratio) {
  if (isFinite(audio.duration)) audio.currentTime = Math.max(0, Math.min(1, ratio)) * audio.duration;
}

$('toggle').addEventListener('click', toggle);

// Saltos de 15 segundos (botones y controles del sistema).
function skip(seconds) {
  const end = isFinite(audio.duration) ? audio.duration : Infinity;
  audio.currentTime = Math.max(0, Math.min(end, audio.currentTime + seconds));
}
$('back15').addEventListener('click', () => skip(-15));
$('fwd15').addEventListener('click', () => skip(15));
if ('mediaSession' in navigator) {
  navigator.mediaSession.setActionHandler('seekbackward', () => skip(-15));
  navigator.mediaSession.setActionHandler('seekforward', () => skip(15));
}
// La calavera es el botón de play del reproductor: al tocarla se prende en llamas y suena; al
// tocarla otra vez se apaga.
// El video (un bucle que ya empata solo) no se muestra: cada cuadro se pinta en un lienzo
// volviendo transparente el negro, para que la llama pueda asomarse sobre la página.
const skull = $('toggle');
const clip = skull.querySelector('video');
const flame = $('skull-flame');
const pen = flame.getContext('2d', { willReadFrequently: true });
let painting = false;

// Los ojos y la nariz que quedan en pausa. La calavera se mueve un poco dentro del video, así
// que al pausar se copian del cuadro en curso para que no brinquen; antes del primer play
// salen de una imagen fija.
const eyes = $('skull-eyes').getContext('2d');
const firstEyes = new Image();
firstEyes.onload = () => eyes.drawImage(firstEyes, 0, 0);
firstEyes.src = 'assets/calavera-ojos.png';
let painted = false;
function snapEyes() {
  if (!painted) return;
  eyes.clearRect(0, 0, flame.width, flame.height);
  eyes.drawImage(flame, 0, 0);
}

function paintFlame() {
  if (clip.readyState < 2) return;
  const { width: w, height: h } = flame;
  pen.drawImage(clip, 0, 0, w, h);
  const frame = pen.getImageData(0, 0, w, h);
  const px = frame.data;
  for (let i = 0; i < px.length; i += 4) {
    // El negro del video nunca es negro puro: por debajo del umbral se descarta del todo,
    // si no queda un recuadro apenas visible alrededor de la calavera.
    const light = px[i];
    px[i + 3] = light <= 36 ? 0 : Math.min(255, (light - 36) * 1.3);
    px[i] = 237;
    px[i + 1] = 233;
    px[i + 2] = 225;
  }
  pen.putImageData(frame, 0, 0);
  painted = true;
}

// Se pinta en cada refresco de pantalla. (requestVideoFrameCallback no sirve aquí: como el
// video está invisible, el navegador no avisa de sus cuadros.)
function loopFlame() {
  if (!playing()) return (painting = false);
  paintFlame();
  requestAnimationFrame(loopFlame);
}


audio.addEventListener('play', () => {
  syncButtons();
  skull.classList.add('lit');
  clip.play().catch(() => {});
  if (!painting) {
    painting = true;
    requestAnimationFrame(loopFlame);
  }
});
const onStop = () => {
  syncButtons();
  clip.pause();
  snapEyes();
  skull.classList.remove('lit');
};
audio.addEventListener('pause', onStop);
audio.addEventListener('ended', onStop);
// Si el audio falla al cargar, los botones vuelven a play en vez de quedarse en pausa.
audio.addEventListener('error', onStop);
audio.addEventListener('timeupdate', () => {
  const ratio = audio.duration ? audio.currentTime / audio.duration : 0;
  $('fill').style.width = ratio * 100 + '%';
  $('bar').setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
  // Mientras el audio aún no informa su duración, se muestra la del feed.
  const total = isFinite(audio.duration) ? fmtTime(audio.duration) : episodes[current].duration;
  $('player-time').textContent = `${fmtTime(audio.currentTime)} / ${total}`;
});
$('bar').addEventListener('click', (e) => {
  const r = e.currentTarget.getBoundingClientRect();
  seek((e.clientX - r.left) / r.width);
});
$('bar').addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight') skip(15);
  if (e.key === 'ArrowLeft') skip(-15);
});

$('year').textContent = new Date().getFullYear();

// Cambio de idioma: traduce los textos fijos y vuelve a pintar la lista (fechas y rótulos).
function applyLang() {
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach((node) => (node.textContent = t(node.dataset.i18n)));
  document.querySelectorAll('[data-i18n-label]').forEach((node) => node.setAttribute('aria-label', t(node.dataset.i18nLabel)));
  document.querySelectorAll('.lang button').forEach((btn) => btn.setAttribute('aria-pressed', String(btn.dataset.lang === lang)));
  if (!episodes.length) return;
  render();
  [...$('episodes').children].forEach((li, j) => li.classList.toggle('playing', j === current));
  syncButtons();
}
document.querySelectorAll('.lang button').forEach((btn) =>
  btn.addEventListener('click', () => {
    lang = btn.dataset.lang;
    try {
      localStorage.setItem('lang', lang);
    } catch {}
    applyLang();
  })
);
applyLang();

fetch(FEED)
  .then((r) => {
    if (!r.ok) throw new Error(r.status);
    return r.text();
  })
  .then((t) => {
    episodes = parse(new DOMParser().parseFromString(t, 'text/xml'));
    if (!episodes.length) throw new Error('feed vacío');
    $('status').hidden = true;
    render();
    // El reproductor no se muestra ni carga nada hasta que se le da play a un episodio.
    $('latest-play').addEventListener('click', () => toggleEpisode(0));
    syncButtons();
    // Los enlaces viejos /episode/<slug> llegan aquí como ?e=<slug> (ver 404.html).
    const slug = new URLSearchParams(location.search).get('e');
    const i = episodes.findIndex((ep) => ep.slug === slug);
    if (i >= 0) open(i, true);
  })
  .catch(() => {
    $('status').dataset.i18n = 'loadError';
    $('status').textContent = t('loadError');
  });
