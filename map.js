'use strict';
/* Mapa vivo: cada canal é uma ilha flutuante e cada pessoa online é um avatar que anda entre elas.
   Usa o estado do app.js (state, voice) e só desenha; a lógica de chat e voz continua lá. */

const SVGNS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs, parent) => {
  const e = document.createElementNS(SVGNS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
};

/* ---------- estrelas (posições fixas, sem sorteio a cada abertura) ---------- */
(function drawStars() {
  const box = document.getElementById('stars'); if (!box) return;
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 60; i++) {
    const c = svgEl('circle', { cx: rnd() * 1000, cy: -50 + rnd() * 710, r: 0.8 + rnd() * 1.6, class: 'star' }, box);
    c.style.animationDelay = rnd() * 3 + 's';
  }
})();

/* ---------- desenhos das ilhas (coordenadas locais, centro em 0,0) ---------- */
const ISLAND_ART = {
  navio: `<g transform="translate(-172 -138)">
    <path class="cloud" d="M96 288 q-26 -4 -22 -24 q6 -22 32 -14 q10 -22 40 -14 q22 -12 40 6 q30 -6 34 20 q4 22 -22 26z"/>
    <path class="ink" fill="#8b5a3c" d="M52 150 C60 200 100 250 140 292 C150 300 160 270 172 292 C184 308 196 262 214 280 C246 244 288 200 296 150Z"/>
    <path class="ink top-s" fill="#f4d58d" d="M40 130 C40 70 110 36 172 40 C240 36 304 76 304 132 C300 168 240 184 172 184 C100 184 44 170 40 130Z"/>
    <g class="ink" stroke-width="4"><path d="M76 120C80 100 82 88 86 70" fill="none"/><path d="M86 70C68 60 54 68 48 80C64 76 76 76 86 70Z M86 70C98 54 118 54 126 62C112 66 98 66 86 70Z" fill="#2f9e55"/><rect x="262" y="128" width="22" height="18" fill="#a86a3c"/></g>
    <g transform="translate(172 100) rotate(-7)"><g class="ink" stroke-width="4">
      <path d="M-72 0L72 0L54 28L-54 28Z" fill="#a86a3c"/><path d="M0 0V-78" fill="none"/>
      <path d="M2 -72Q48 -58 42 -8L2 -8Z" fill="#fff3d1"/><path d="M-2 -78L-28 -70L-2 -62Z" fill="#ef4b3c"/>
      <circle cx="22" cy="-38" r="10" fill="#ef4b3c"/>
      <circle cx="-34" cy="13" r="4.5" fill="#ffcf3a"/><circle cx="-12" cy="14" r="4.5" fill="#ffcf3a"/><circle cx="10" cy="14" r="4.5" fill="#ffcf3a"/>
    </g></g></g>`,
  polaroid: `<g transform="translate(-758 -112)">
    <g class="cloud" style="stroke-width:4"><circle cx="696" cy="238" r="16"/><circle cx="722" cy="248" r="21"/><circle cx="794" cy="246" r="19"/><circle cx="822" cy="238" r="15"/><circle cx="758" cy="250" r="22"/></g>
    <g class="cloud" style="stroke:none"><circle cx="696" cy="238" r="14"/><circle cx="722" cy="248" r="19"/><circle cx="794" cy="246" r="17"/><circle cx="822" cy="238" r="13"/><circle cx="758" cy="250" r="20"/></g>
    <g transform="rotate(-8 758 112)">
      <g class="ink top-s" stroke-width="5" fill="#fff3d1"><rect x="666" y="10" width="184" height="206" rx="6"/></g>
      <g class="ink" stroke-width="4"><rect x="684" y="30" width="148" height="136" fill="#4aa3e8"/>
        <circle cx="804" cy="62" r="17" fill="#ffcf3a"/><path d="M684 166L738 104L774 142L802 98L832 166Z" fill="#58c26b"/>
        <rect x="728" y="-2" width="60" height="22" fill="#ffcf3a" opacity=".92"/></g>
    </g></g>`,
  moinho: `<g transform="scale(1.3) translate(-100 -110)"><g stroke="#1a1030" stroke-width="4" stroke-linejoin="round">
    <path d="M30 112Q40 148 80 170Q100 182 120 168Q160 148 170 112Z" fill="#8b5a3c"/>
    <ellipse class="top-s" cx="100" cy="110" rx="70" ry="20" fill="#58c26b"/>
    <path d="M82 112L90 62H110L118 112Z" fill="#fff3d1"/><path d="M84 64L100 42L116 64Z" fill="#ef4b3c"/>
    <path d="M94 112V94Q100 86 106 94V112Z" fill="#8b5a3c"/>
    <rect x="96" y="6" width="8" height="40" fill="#fff3d1"/><rect x="96" y="54" width="8" height="40" fill="#fff3d1"/>
    <rect x="54" y="48" width="40" height="8" fill="#fff3d1"/><rect x="106" y="48" width="40" height="8" fill="#fff3d1"/>
    <circle cx="100" cy="52" r="6" fill="#ffcf3a"/></g>
    <g fill="#ff7fb0" stroke="#1a1030" stroke-width="2"><circle cx="52" cy="112" r="4"/><circle cx="148" cy="116" r="4"/><circle cx="136" cy="106" r="4"/></g></g>`,
  taverna: `<g transform="scale(1.3) translate(-100 -110)"><g stroke="#1a1030" stroke-width="4" stroke-linejoin="round">
    <path d="M30 112Q40 148 80 170Q100 182 120 168Q160 148 170 112Z" fill="#8b5a3c"/>
    <ellipse class="top-s" cx="100" cy="110" rx="70" ry="20" fill="#58c26b"/>
    <rect x="124" y="30" width="14" height="26" fill="#cfd3e8"/>
    <rect x="50" y="64" width="100" height="46" fill="#c98b4e"/><path d="M42 66L100 36L158 66Z" fill="#8f2f2f"/>
    <rect x="88" y="80" width="24" height="30" fill="#5a3a22"/>
    <rect x="60" y="76" width="18" height="16" fill="#ffcf3a"/><rect x="122" y="76" width="18" height="16" fill="#ffcf3a"/></g>
    <g fill="#fff" stroke="#1a1030" stroke-width="3"><circle cx="134" cy="22" r="7"/><circle cx="146" cy="12" r="6"/></g></g>`,
  voz: `<g transform="translate(-432 -436)">
    <path class="cloud" d="M360 612 q-26 -4 -22 -24 q6 -22 32 -14 q10 -22 40 -14 q22 -12 40 6 q30 -6 34 20 q4 22 -22 26z"/>
    <path class="ink" fill="#8b6f93" d="M304 460 C316 508 356 550 392 584 C404 592 416 566 432 586 C448 600 460 566 478 578 C512 548 552 508 562 462Z"/>
    <path class="ink top-s" fill="#cfd3e8" d="M290 440 C286 380 360 346 436 348 C516 346 580 384 574 440 C570 480 510 498 434 498 C356 498 294 480 290 440Z"/>
    <g class="crater"><ellipse cx="350" cy="410" rx="22" ry="10"/><ellipse cx="530" cy="470" rx="26" ry="10"/><ellipse cx="520" cy="396" rx="14" ry="6"/><ellipse cx="350" cy="478" rx="16" ry="7"/></g>
    <g transform="translate(432 436) scale(1.15)"><circle r="34" fill="#fff3d1" class="ink" stroke-width="4"/>
      <g class="needle"><path d="M0 -27 L7 -5 L0 0 L-7 -5Z" fill="#ef4b3c"/></g>
      <path d="M0 27 L5 5 L0 0 L-5 5ZM-27 0 L-5 -5 L0 0 L-5 5ZM27 0 L5 -5 L0 0 L5 5Z" fill="#1a1030"/></g></g>`,
};

/* onde cada tipo de ilha põe o letreiro, o aviso de não lidas e os lugares dos avatares (relativo ao centro) */
const ISLAND_SPOTS = {
  navio:    { banner: [0, 4],   bud: [112, -72], spots: [[-74, 78], [74, 78], [0, 104], [64, -56]] },
  polaroid: { banner: [0, 84],  bud: [100, -100], spots: [[-42, 0], [38, 14], [2, -54], [74, -42]] },
  moinho:   { banner: [0, 34],  bud: [95, -60], spots: [[-78, 20], [78, 20], [0, 62], [-40, -30]] },
  taverna:  { banner: [0, 34],  bud: [95, -60], spots: [[-78, 20], [78, 20], [0, 62], [-40, -30]] },
  voz:      { banner: [0, 176], bud: [0, 0],    spots: [[0, -64], [-96, 20], [96, 20], [0, 84]] },
};
const TEXT_SLOTS = [
  { x: 172, y: 138, kind: 'navio', s: 1 },
  { x: 758, y: 112, kind: 'polaroid', s: 1 },
  { x: 170, y: 470, kind: 'moinho', s: 1 },
  { x: 800, y: 345, kind: 'taverna', s: 0.8 },
];
const VOICE_SLOT = { x: 432, y: 436, kind: 'voz', s: 1 };
const COSTA = { x: 470, y: 150, s: 1, spots: [[-60, 10], [0, 34], [60, 10], [0, -34]] };

const mapState = { isles: new Map(), pins: new Map(), trailsKey: '', reactTimer: null };
const $m = (id) => document.getElementById(id);

function bannerSize(text) { return Math.max(96, Math.min(230, 30 + text.length * 16)); }

function buildIsland(ch, slot, floatCls) {
  const g = svgEl('g', { class: 'isle', tabindex: '0', role: 'button', 'data-ch': ch.id });
  const fl = svgEl('g', { class: 'float ' + floatCls }, g);
  const sp = ISLAND_SPOTS[slot.kind];
  const body = svgEl('g', { transform: `translate(${slot.x} ${slot.y}) scale(${slot.s})` }, fl);
  body.innerHTML = ISLAND_ART[slot.kind];
  const ban = svgEl('g', { class: 'banner', transform: `translate(${sp.banner[0]} ${sp.banner[1]})` }, body);
  const bn = svgEl('g', { class: 'bn' }, ban);
  const rect = svgEl('rect', { y: -20, height: 40, rx: 8 }, bn);
  const label = svgEl('text', { y: 10 }, bn);
  let bud = null, budText = null;
  if (ch.type === 'text') {
    bud = svgEl('g', { class: 'bud', transform: `translate(${sp.bud[0]} ${sp.bud[1]})` }, body);
    svgEl('circle', { r: 16 }, bud); budText = svgEl('text', { y: 7 }, bud);
  }
  g.addEventListener('click', () => onIslandClick(ch.id));
  g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onIslandClick(ch.id); } });
  $m('isles').appendChild(g);
  return { g, rect, label, bud, budText, slot };
}

function onIslandClick(id) {
  const ch = state.channels.find((c) => c.id === id); if (!ch) return;
  if (ch.type === 'text') selectChannel(id);
  else if (!voice.id) toast('Toque em "Entrar na voz" para falar com a galera.');
}

function setLabel(isle, ch) {
  const text = (ch.type === 'text' ? '# ' : '') + (ch.type === 'voice' && /^sala$/i.test(ch.name) ? 'Sala de voz' : ch.name);
  const t = text.length > 16 ? text.slice(0, 15) + '…' : text, w = bannerSize(t);
  isle.label.textContent = t; isle.rect.setAttribute('x', -w / 2); isle.rect.setAttribute('width', w);
}

/* ---------- quem está onde ---------- */
function peopleOnMap() {
  const out = [], seen = new Set();
  const voiceCh = state.channels.filter((c) => c.type === 'voice');
  for (const c of voiceCh) for (const u of voiceUsers(c.id)) if (!seen.has(u.uid)) { seen.add(u.uid); out.push({ uid: u.uid, key: 'v:' + c.id, muted: !!u.muted, sharing: !!u.sharing, name: u.name }); }
  const where = state.where.get(state.server?.id) || new Map();
  for (const m of state.members) {
    if (seen.has(m.user_id) || !isOnline(m.user_id)) continue;
    const at = m.user_id === state.user.id ? (state.view === 'channel' ? state.channel?.id : null) : where.get(m.user_id);
    out.push({ uid: m.user_id, key: at && state.channels.some((c) => c.id === at && c.type === 'text') ? 't:' + at : 'costa' });
  }
  return out;
}

function spotAt(origin, spots, i, scale) {
  if (i < spots.length) return [origin.x + spots[i][0] * scale, origin.y + spots[i][1] * scale];
  const a = (i - spots.length) * 1.1, r = 100 * scale;
  return [origin.x + Math.cos(a) * r, origin.y + Math.sin(a) * r * 0.6 + 40 * scale];
}

const BURST_POINTS = (() => { let s = ''; for (let i = 0; i < 20; i++) { const a = i / 20 * 6.2832, r = i % 2 ? 44 : 60; s += Math.cos(a) * r + ',' + Math.sin(a) * r + ' '; } return s; })();

function ensurePin(uid) {
  let p = mapState.pins.get(uid); if (p) return p;
  const g = svgEl('g', { class: 'pin' + (uid === state.user.id ? ' me' : ''), 'data-vuid': uid }, $m('pins'));
  g.innerHTML = `<g class="bob"><polygon class="burst" points="${BURST_POINTS}"/><circle class="body" r="34"/><text class="emj" y="12"></text>
    <rect class="tag" x="-42" y="40" width="84" height="26" rx="13"/><text class="nm" y="60"></text><text class="state" x="-30" y="-24"></text></g>`;
  g.addEventListener('click', () => { if (uid !== state.user.id) openDm(uid); });
  p = { g, emj: g.querySelector('.emj'), nm: g.querySelector('.nm'), st: g.querySelector('.state'), tag: g.querySelector('.tag') };
  mapState.pins.set(uid, p); return p;
}

function renderMap() {
  if (!$m('map') || !state.user) return;
  $m('top-server').textContent = state.server ? state.server.name : '';
  const none = !state.server;
  $m('map-empty').hidden = !none; $m('isles').style.display = none ? 'none' : ''; $m('pins').style.display = none ? 'none' : '';
  if (none) { updateDock(); return; }

  /* ilhas */
  const texts = state.channels.filter((c) => c.type === 'text'), voices = state.channels.filter((c) => c.type === 'voice');
  const wanted = new Map();
  texts.slice(0, TEXT_SLOTS.length).forEach((c, i) => wanted.set(c.id, { ch: c, slot: TEXT_SLOTS[i], cls: ['', 'f2', 'f3', 'f2'][i] }));
  if (voices[0]) wanted.set(voices[0].id, { ch: voices[0], slot: VOICE_SLOT, cls: 'f3' });
  for (const [id, isle] of mapState.isles) if (!wanted.has(id)) { isle.g.remove(); mapState.isles.delete(id); }
  for (const [id, w] of wanted) {
    let isle = mapState.isles.get(id);
    if (!isle) { isle = buildIsland(w.ch, w.slot, w.cls); mapState.isles.set(id, isle); }
    setLabel(isle, w.ch);
    if (isle.bud) {
      const n = state.unread.get('c:' + id) || 0; isle.bud.style.display = n ? '' : 'none';
      isle.budText.textContent = n > 99 ? '99+' : String(n);
    }
    const sel = w.ch.type === 'text' ? state.view === 'channel' && state.channel?.id === id : voice.id === id;
    isle.g.classList.toggle('sel', sel);
    isle.g.setAttribute('aria-label', (w.ch.type === 'text' ? 'Canal ' : 'Sala de voz ') + w.ch.name);
  }
  const extra = texts.length - TEXT_SLOTS.length;
  $m('map-more').hidden = extra <= 0; if (extra > 0) $m('map-more').textContent = `+${extra} canal(is) no menu ☰`;
  drawTrails([...wanted.values()].map((w) => w.slot));

  /* pessoas */
  const origins = new Map();
  for (const [id, w] of wanted) origins.set((w.ch.type === 'text' ? 't:' : 'v:') + id, { x: w.slot.x, y: w.slot.y, s: w.slot.s, spots: ISLAND_SPOTS[w.slot.kind].spots });
  origins.set('costa', { x: COSTA.x, y: COSTA.y, s: 1, spots: COSTA.spots });
  const list = peopleOnMap(), counts = new Map(), live = new Set();
  for (const p of list) {
    const o = origins.get(p.key) || origins.get('costa'), k = origins.has(p.key) ? p.key : 'costa';
    const i = counts.get(k) || 0; counts.set(k, i + 1);
    const [x, y] = spotAt(o, o.spots, i, o.s);
    const name = (state.profiles.get(p.uid)?.username) || p.name || 'Amigo';
    const pin = ensurePin(p.uid); live.add(p.uid);
    pin.g.style.setProperty('--c', colorFor(name));
    pin.emj.textContent = emojiFor(name); pin.nm.textContent = name.length > 8 ? name.slice(0, 7) + '…' : name;
    pin.st.textContent = (p.sharing ? '🖥' : '') + (p.muted ? '🔇' : '');
    pin.g.style.transform = `translate(${x}px,${y}px)`;
    pin.g.setAttribute('aria-label', name);
  }
  for (const [uid, p] of mapState.pins) if (!live.has(uid)) { p.g.remove(); mapState.pins.delete(uid); }

  /* online no topo */
  $m('stack').innerHTML = '';
  for (const p of list.slice(0, 6)) {
    const name = state.profiles.get(p.uid)?.username || p.name || 'Amigo';
    const i = document.createElement('i'); i.style.setProperty('--c', colorFor(name)); i.textContent = emojiFor(name); i.title = name;
    $m('stack').appendChild(i);
  }
  updateDock();
}

function drawTrails(slots) {
  const key = slots.map((s) => s.x + ',' + s.y).join('|'); if (key === mapState.trailsKey) return; mapState.trailsKey = key;
  const g = $m('trails'); g.replaceChildren();
  const by = (k) => slots.find((s) => s.kind === k);
  const pairs = [['navio', 'polaroid'], ['navio', 'voz'], ['voz', 'polaroid'], ['moinho', 'voz'], ['moinho', 'navio'], ['taverna', 'polaroid'], ['taverna', 'voz']];
  for (const [a, b] of pairs) {
    const A = by(a), B = by(b); if (!A || !B) continue;
    const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2 - 50;
    svgEl('path', { class: 'trail', d: `M${A.x} ${A.y} Q${mx} ${my} ${B.x} ${B.y}` }, g);
  }
}

/* ---------- barra de voz do mapa ---------- */
function updateDock() {
  const inVoice = !!voice.id, hasVoice = state.channels.some((c) => c.type === 'voice');
  const join = $m('dk-join');
  join.hidden = !inVoice && !hasVoice;
  join.textContent = inVoice ? 'Sair da voz' : 'Entrar na voz'; join.classList.toggle('leave', inVoice);
  $m('dk-mute').hidden = !inVoice; $m('dk-tune').hidden = !inVoice; $m('dk-react').hidden = !inVoice;
  $m('dk-share').hidden = !inVoice || !navigator.mediaDevices?.getDisplayMedia;
  const mute = $m('dk-mute'); mute.textContent = voice.muted ? '🔇' : '🎙️'; mute.setAttribute('aria-pressed', String(!!voice.muted));
  mute.title = voice.muted ? 'Ativar microfone' : 'Silenciar microfone'; mute.setAttribute('aria-label', mute.title);
  $m('dk-share').setAttribute('aria-pressed', String(!!voice.screen));
  if (!inVoice) $m('react-pop').hidden = true;
}
$m('dk-join').onclick = () => { if (voice.id) leaveVoice(); else { const c = state.channels.find((x) => x.type === 'voice'); if (c) joinVoice(c); } };
$m('dk-mute').onclick = () => $m('mute-btn').click();
$m('dk-share').onclick = () => $m('share-btn').click();
$m('dk-tune').onclick = () => document.body.classList.toggle('nav-open');
$m('dk-react').onclick = (e) => { e.stopPropagation(); $m('react-pop').hidden = !$m('react-pop').hidden; };
$m('react-pop').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  const emoji = b.textContent; $m('react-pop').hidden = true;
  showReaction(state.user.id, emoji);
  voice.obs.get(voice.id)?.ch.send({ type: 'broadcast', event: 'react', payload: { from: state.user.id, emoji } });
});
document.addEventListener('click', (e) => { if (!e.target.closest('#react-pop, #dk-react')) $m('react-pop').hidden = true; });

/* reação: um emoji sobe do avatar de quem mandou */
function showReaction(uid, emoji) {
  const p = mapState.pins.get(uid); if (!p) return;
  const m = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(p.g.style.transform); if (!m) return;
  const t = svgEl('text', { x: +m[1] + (Math.random() < 0.5 ? -18 : 18), y: +m[2] - 44, class: 'emo' }, $m('pins'));
  t.textContent = emoji; setTimeout(() => t.remove(), 2200);
}

window.addEventListener('DOMContentLoaded', () => { updateDock(); });
