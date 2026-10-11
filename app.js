// Los episodios se leen del feed de Captivate, así que el sitio se actualiza solo al publicar.
const FEED = 'https://feeds.captivate.fm/breakdown-sessions/';
const ITUNES = 'http://www.itunes.com/dtds/podcast-1.0.dtd';
// El botón de play es un vinilo con surcos y etiqueta, igual en todos los tamaños.
const RINGS = '<circle cx="32" cy="32" r="31" stroke-width="1.5"/><circle cx="32" cy="32" r="25" stroke-width=".6"/><circle cx="32" cy="32" r="20" stroke-width=".6"/><circle cx="32" cy="32" r="14" stroke-width="1.5"/>';
const vinyl = (playing) =>
  `<svg viewBox="0 0 64 64" aria-hidden="true">${RINGS}<path class="glyph" d="${playing ? 'M27 26h3.5v12H27zM33.5 26H37v12h-3.5z' : 'M29 26v12l10-6Z'}"/></svg>`;

const $ = (id) => document.getElementById(id);
const audio = $('audio');
let episodes = [];
let current = null;

const fmtDate = (d) => d.toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' }).replace(/\./g, '');

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

    const row = el('button', 'ep');
    row.type = 'button';
    row.setAttribute('aria-expanded', 'false');
    row.append(el('span', 'ep-num', ep.num), el('span', 'ep-title', ep.title), el('span', 'ep-date', fmtDate(ep.date)));

    const body = el('div', 'ep-body');
    body.hidden = true;
    ep.body.forEach((p) => body.append(el('p', null, p)));
    if (ep.duration) body.append(el('p', null, `Duración: ${ep.duration}`));

    row.addEventListener('click', () => {
      body.hidden = !body.hidden;
      row.setAttribute('aria-expanded', String(!body.hidden));
    });
    head.append(play, row);
    li.append(head, body);
    list.append(li);
  });

  const latest = episodes[0];
  $('latest-num').textContent = latest.title.startsWith('Session') ? 'Último episodio' : `Session n.º ${latest.num}`;
  $('latest-title').textContent = latest.title;
  $('latest-meta').textContent = [fmtDate(latest.date), latest.duration].filter(Boolean).join(' · ');
  $('latest-play').addEventListener('click', () => toggleEpisode(0));
  $('latest').hidden = false;

  // El reproductor queda a la vista desde el inicio, con el último episodio listo.
  load(0);
  $('player').hidden = false;
}

function open(i, scroll) {
  const li = $('episodes').children[i];
  if (!li) return;
  li.querySelector('.ep-body').hidden = false;
  li.querySelector('.ep').setAttribute('aria-expanded', 'true');
  if (scroll) li.scrollIntoView({ block: 'center' });
}

function load(i) {
  const ep = episodes[i];
  current = i;
  audio.src = ep.src;
  $('fill').style.width = '0';
  $('player-title').textContent = `${ep.num} · ${ep.title}`;
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

function toggleEpisode(i) {
  if (current !== i) load(i);
  toggle();
}

// Cada botón muestra pausa solo si su episodio es el que está sonando.
function syncButtons() {
  const on = playing();
  const set = (btn, playing, name) => {
    btn.innerHTML = vinyl(playing);
    btn.setAttribute('aria-label', `${playing ? 'Pausar' : 'Reproducir'} ${name}`.trim());
  };
  set($('toggle'), on, '');
  set($('latest-play'), on && current === 0, 'el último episodio');
  [...$('episodes').children].forEach((li, j) => set(li.querySelector('.play'), on && current === j, `Session ${episodes[j].num}`));
}

function seek(ratio) {
  if (isFinite(audio.duration)) audio.currentTime = Math.max(0, Math.min(1, ratio)) * audio.duration;
}

$('toggle').addEventListener('click', toggle);
// La calavera del reproductor: la llama se enciende y se mueve al dar play, y se apaga en pausa.
// El video (un bucle que ya empata solo) no se muestra: cada cuadro se pinta en un lienzo
// volviendo transparente el negro, para que la llama pueda asomarse sobre la página.
const skull = $('skull');
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

clip.addEventListener('error', () => (skull.hidden = true));

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
  if (e.key === 'ArrowRight') audio.currentTime += 15;
  if (e.key === 'ArrowLeft') audio.currentTime -= 15;
});

$('year').textContent = new Date().getFullYear();

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
    // Los enlaces viejos /episode/<slug> llegan aquí como ?e=<slug> (ver 404.html).
    const slug = new URLSearchParams(location.search).get('e');
    const i = episodes.findIndex((ep) => ep.slug === slug);
    if (i >= 0) open(i, true);
  })
  .catch(() => {
    $('status').textContent = 'No se pudieron cargar los episodios. Escúchalos en Spotify o Apple Podcasts.';
  });
