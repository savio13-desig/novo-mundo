'use strict';
/* Escritório em pixel art 2D, visto de cima. Etapa 1: cenário + seu personagem andando.
   Usa só o canvas #office; o mapa de ilhas continua funcionando (botão #view-btn alterna). */

const OFFICE = (() => {
  const T = 16, COLS = 40, ROWS = 28, WW = COLS * T, WH = ROWS * T;
  const INK = '#1a1030';
  const canvas = document.getElementById('office'), sea = document.getElementById('sea');
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');

  /* ---------- planta ---------- */
  const ROOMS = [
    { id: 'recepcao', name: 'RECEPÇÃO', ox: 2, oy: 2, a: '#e8d9b0', b: '#dfcf9f', door: 'down' },
    { id: 'vendas', name: 'VENDAS', ox: 15, oy: 2, a: '#b9d7f2', b: '#a9c9e8', door: 'down' },
    { id: 'financeiro', name: 'FINANCEIRO', ox: 28, oy: 2, a: '#cfe6c8', b: '#bfdab8', door: 'down' },
    { id: 'suporte', name: 'SUPORTE', ox: 2, oy: 18, a: '#d3c2f0', b: '#c5b3e6', door: 'up' },
    { id: 'reuniao', name: 'SALA DE REUNIÃO', ox: 15, oy: 18, a: '#f2c6b4', b: '#e8b9a5', door: 'up' },
    { id: 'lounge', name: 'GERAL', ox: 28, oy: 18, a: '#f5e1a4', b: '#ecd696', door: 'up' },
  ].map((r) => ({ ...r, w: 10, h: 8 }));

  /* móveis por sala, em tiles relativos ao canto da sala */
  const FURN = {
    recepcao: [['counter', 2, 2, 6, 1], ['sofa', 1, 5, 3, 1], ['plant', 8, 1, 1, 1], ['plant', 0, 1, 1, 1], ['plant', 9, 6, 1, 1], ['rug', 4, 4, 4, 3]],
    vendas: [['desk', 1, 2, 3, 1], ['desk', 6, 2, 3, 1], ['desk', 1, 5, 3, 1], ['desk', 6, 5, 3, 1], ['board', 3, 0, 4, 1], ['plant', 9, 1, 1, 1]],
    suporte: [['desk', 1, 2, 3, 1], ['desk', 6, 2, 3, 1], ['desk', 1, 5, 3, 1], ['desk', 6, 5, 3, 1], ['board', 3, 0, 4, 1], ['plant', 0, 7, 1, 1]],
    financeiro: [['vault', 3, 0, 4, 1], ['desk', 1, 3, 3, 1], ['desk', 6, 3, 3, 1], ['coins', 9, 1, 1, 1], ['plant', 0, 1, 1, 1], ['rug', 3, 5, 4, 2]],
    reuniao: [['screen', 3, 0, 4, 1], ['table', 2, 2, 6, 3], ['chair', 2, 1, 1, 1], ['chair', 3, 1, 1, 1], ['chair', 4, 1, 1, 1], ['chair', 5, 1, 1, 1], ['chair', 6, 1, 1, 1], ['chair', 7, 1, 1, 1], ['chair', 2, 5, 1, 1], ['chair', 3, 5, 1, 1], ['chair', 6, 5, 1, 1], ['chair', 7, 5, 1, 1]],
    lounge: [['tv', 3, 0, 4, 1], ['sofa', 1, 2, 3, 1], ['sofa', 6, 2, 3, 1], ['ctable', 3, 4, 4, 1], ['plant', 9, 1, 1, 1], ['plant', 0, 6, 1, 1], ['rug', 2, 3, 6, 3]],
  };

  /* grade: 0 vazio, 1 parede, 2 piso (andável), 3 piso de sala */
  const grid = Array.from({ length: ROWS }, () => new Uint8Array(COLS));
  const roomAt = Array.from({ length: ROWS }, () => new Array(COLS).fill(null));
  const blocked = Array.from({ length: ROWS }, () => new Uint8Array(COLS));
  const fill = (x0, y0, x1, y1, v) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) grid[y][x] = v; };
  for (const r of ROOMS) { fill(r.ox - 1, r.oy - 1, r.ox + r.w, r.oy + r.h, 1); fill(r.ox, r.oy, r.ox + r.w - 1, r.oy + r.h - 1, 3); }
  fill(0, 10, 39, 17, 1); fill(1, 11, 38, 16, 2);
  for (const r of ROOMS) { /* portas: 2 tiles na parede voltada para o corredor */
    const y = r.door === 'down' ? r.oy + r.h : r.oy - 1;
    grid[y][r.ox + 4] = 2; grid[y][r.ox + 5] = 2;
    for (let y2 = r.oy; y2 < r.oy + r.h; y2++) for (let x = r.ox; x < r.ox + r.w; x++) roomAt[y2][x] = r;
  }
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (grid[y][x] < 2) blocked[y][x] = 1;
  const furn = [];
  for (const r of ROOMS) for (const [t, x, y, w, h] of FURN[r.id]) {
    const ry = r.door === 'up' ? r.h - 1 - y - (h - 1) : y; /* salas de baixo: espelha, para a parede do fundo ficar longe da porta */
    const f = { t, x: r.ox + x, y: r.oy + ry, w, h, room: r }; furn.push(f);
    if (t !== 'rug') for (let yy = f.y; yy < f.y + h; yy++) for (let xx = f.x; xx < f.x + w; xx++) blocked[yy][xx] = 1;
  }
  const solidAt = (px, py) => { const x = Math.floor(px / T), y = Math.floor(py / T); return x < 0 || y < 0 || x >= COLS || y >= ROWS || !!blocked[y][x]; };
  /* os pés ocupam uma caixa pequena para dar para passar por portas de 2 tiles */
  const canStand = (x, y) => !(solidAt(x - 4, y) || solidAt(x + 4, y) || solidAt(x - 4, y - 5) || solidAt(x + 4, y - 5));

  /* ---------- desenho do cenário (uma vez) ---------- */
  const world = document.createElement('canvas'); world.width = WW; world.height = WH;
  const wc = world.getContext('2d');
  const R = (c, x, y, w, h, col) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  const box = (c, x, y, w, h, col, top) => { R(c, x, y, w, h, INK); R(c, x + 1, y + 1, w - 2, h - 2, col); if (top) R(c, x + 1, y + 1, w - 2, Math.min(4, h - 2), top); };

  function drawFurn(c, f) {
    const x = f.x * T, y = f.y * T, w = f.w * T, h = f.h * T;
    switch (f.t) {
      case 'rug': R(c, x + 1, y + 1, w - 2, h - 2, 'rgba(239,75,60,.55)'); R(c, x + 4, y + 4, w - 8, h - 8, 'rgba(255,243,209,.35)'); break;
      case 'counter': box(c, x, y + 2, w, h - 2, '#a86a3c', '#c98b4e'); R(c, x + w / 2 - 4, y - 1, 8, 5, INK); R(c, x + w / 2 - 3, y, 6, 3, '#ffcf3a'); break;
      case 'sofa': box(c, x, y + 2, w, h - 2, '#ef4b3c', '#ff7a6b'); R(c, x + 2, y + 5, w - 4, h - 8, '#c63a2c'); break;
      case 'ctable': box(c, x + 4, y + 4, w - 8, h - 6, '#8b5a3c', '#c98b4e'); R(c, x + 14, y + 4, 6, 4, '#fff3d1'); break;
      case 'plant': R(c, x + 4, y + 9, 8, 6, INK); R(c, x + 5, y + 10, 6, 4, '#a86a3c'); R(c, x + 3, y + 1, 10, 9, INK); R(c, x + 4, y + 2, 8, 7, '#58c26b'); R(c, x + 6, y + 2, 3, 3, '#8be58a'); break;
      case 'desk':
        box(c, x, y + 4, w, h - 4, '#c98b4e', '#e0a868');
        for (let i = 0; i < 2; i++) { const mx = x + 5 + i * 22; R(c, mx - 1, y - 1, 12, 10, INK); R(c, mx, y, 10, 7, '#5ed3e6'); R(c, mx + 1, y + 1, 4, 2, '#d8f7ff'); R(c, mx + 3, y + 8, 4, 2, INK); }
        break;
      case 'board': box(c, x + 2, y + 1, w - 4, 12, '#fff3d1'); R(c, x + 6, y + 8, 6, 3, '#ef4b3c'); R(c, x + 14, y + 6, 6, 5, '#2fc6b0'); R(c, x + 22, y + 3, 6, 8, '#ffcf3a'); R(c, x + 30, y + 5, 6, 6, '#8a4dff'); break;
      case 'vault': box(c, x, y, w, h + 2, '#8aa0b8', '#b5c6d8'); R(c, x + w / 2 - 9, y + 2, 18, 12, INK); R(c, x + w / 2 - 7, y + 3, 14, 10, '#cfd3e8'); R(c, x + w / 2 - 1, y + 7, 3, 3, '#ffcf3a'); break;
      case 'coins': R(c, x + 3, y + 8, 10, 5, INK); R(c, x + 4, y + 9, 8, 3, '#ffcf3a'); R(c, x + 4, y + 4, 8, 5, INK); R(c, x + 5, y + 5, 6, 3, '#ffe27a'); break;
      case 'table': box(c, x, y, w, h, '#8b5a3c', '#b57a4e'); R(c, x + 8, y + 10, 10, 6, '#fff3d1'); R(c, x + 30, y + 14, 10, 6, '#fff3d1'); R(c, x + 58, y + 8, 12, 8, '#2fc6b0'); break;
      case 'chair': box(c, x + 3, y + 3, 10, 10, '#ff9a3d', '#ffbb6e'); break;
      case 'screen': box(c, x + 2, y + 1, w - 4, 13, '#2a2a4a'); R(c, x + 5, y + 4, w - 10, 7, '#5ed3e6'); R(c, x + 9, y + 6, 14, 2, '#d8f7ff'); R(c, x + 9, y + 9, 22, 1, '#d8f7ff'); break;
      case 'tv': box(c, x + 8, y + 2, w - 16, 12, '#2a2a4a'); R(c, x + 11, y + 4, w - 22, 8, '#ff7fb0'); R(c, x + 16, y + 6, 10, 3, '#fff3d1'); break;
      default: break;
    }
  }

  (function paintWorld() {
    R(wc, 0, 0, WW, WH, '#0c0a2e');
    let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 70; i++) R(wc, rnd() * WW, rnd() * WH, 1, 1, '#ffffff88');
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const g = grid[y][x], px = x * T, py = y * T;
      if (g === 2) { const r = (x + y) % 2; R(wc, px, py, T, T, r ? '#8f86c4' : '#867cbb'); if (y === 13 || y === 14) R(wc, px, py + (y === 13 ? 12 : 0), T, 4, '#9d94cf'); }
      else if (g === 3) { const r = roomAt[y][x]; R(wc, px, py, T, T, (x + y) % 2 ? r.a : r.b); }
    }
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (grid[y][x] === 1) {
      const px = x * T, py = y * T, below = y + 1 < ROWS && grid[y + 1][x] >= 2;
      R(wc, px, py, T, T, '#2b1f66');
      if (below) { R(wc, px, py, T, T - 2, '#5a49b0'); R(wc, px, py, T, 3, '#7a69d0'); R(wc, px, py + T - 2, T, 2, INK); }
    }
    for (const r of ROOMS) for (const f of furn.filter((q) => q.room === r)) drawFurn(wc, f);
    /* placas com o nome das salas */
    wc.font = 'bold 8px monospace'; wc.textAlign = 'center'; wc.textBaseline = 'middle';
    for (const r of ROOMS) {
      const cx = (r.ox + r.w / 2) * T, cy = (r.oy - 1) * T + 8, w = r.name.length * 5 + 10;
      R(wc, cx - w / 2 - 1, cy - 6, w + 2, 12, INK); R(wc, cx - w / 2, cy - 5, w, 10, '#fff3d1');
      wc.fillStyle = INK; wc.fillText(r.name, cx, cy + 0.5);
    }
  })();

  /* ---------- personagens ---------- */
  const SKINS = ['#ffd9b3', '#f1c08d', '#d9996b', '#b97a4c', '#8a5a3a'];
  const HAIRS = ['#2a1b12', '#5a3a22', '#c98b4e', '#e8c45a', '#8a4dff', '#ef4b3c', '#1a1030'];
  const hashOf = (s, m) => { let h = 7; for (const ch of String(s)) h = (h * 33 + ch.charCodeAt(0)) >>> 0; return h % m; };
  const lookFor = (name) => ({ skin: SKINS[hashOf(name, SKINS.length)], hair: HAIRS[hashOf(name + 'h', HAIRS.length)], shirt: colorFor(name), pants: '#2f2a6b' });

  /* dir: 0 baixo, 1 esquerda, 2 direita, 3 cima; frame 0/1 enquanto anda */
  function drawChar(c, x, y, a) {
    x = Math.round(x); y = Math.round(y);
    const L = a.look, step = a.moving ? (a.frame % 2) : 0, bob = a.moving && step ? -1 : 0;
    R(c, x - 6, y - 1, 12, 3, 'rgba(0,0,0,.28)');
    /* pernas */
    R(c, x - 5, y - 6 - (step ? 1 : 0), 5, 6, INK); R(c, x, y - 6 - (step ? 0 : 1), 5, 6, INK);
    R(c, x - 4, y - 5 - (step ? 1 : 0), 3, 4, L.pants); R(c, x + 1, y - 5 - (step ? 0 : 1), 3, 4, L.pants);
    /* corpo */
    R(c, x - 6, y - 14 + bob, 12, 9, INK); R(c, x - 5, y - 13 + bob, 10, 7, L.shirt); R(c, x - 5, y - 13 + bob, 10, 2, 'rgba(255,255,255,.28)');
    R(c, x - 7, y - 12 + bob, 2, 5, INK); R(c, x + 5, y - 12 + bob, 2, 5, INK); R(c, x - 6, y - 11 + bob, 1, 3, L.skin); R(c, x + 5, y - 11 + bob, 1, 3, L.skin);
    /* cabeça */
    R(c, x - 6, y - 23 + bob, 12, 10, INK); R(c, x - 5, y - 22 + bob, 10, 8, L.skin);
    if (a.dir === 3) R(c, x - 5, y - 22 + bob, 10, 8, L.hair);
    else {
      R(c, x - 5, y - 22 + bob, 10, 3, L.hair);
      if (a.dir !== 2) R(c, x - 5, y - 22 + bob, 2, 6, L.hair);
      if (a.dir !== 1) R(c, x + 3, y - 22 + bob, 2, 6, L.hair);
      const ex = a.dir === 0 ? [x - 3, x + 1] : a.dir === 1 ? [x - 4, x - 1] : [x, x + 3];
      R(c, ex[0], y - 17 + bob, 2, 2, INK); R(c, ex[1], y - 17 + bob, 2, 2, INK);
    }
  }
  function drawName(c, x, y, name) {
    c.font = 'bold 8px monospace'; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    c.lineWidth = 3; c.strokeStyle = INK; c.strokeText(name, Math.round(x), Math.round(y) - 27); c.fillStyle = '#fff3d1'; c.fillText(name, Math.round(x), Math.round(y) - 27);
  }

  /* ---------- atores ---------- */
  const actors = new Map();
  const SPAWN = [20 * T, 13.5 * T];
  function actorFor(uid, name) {
    let a = actors.get(uid);
    if (!a) { a = { uid, name, x: SPAWN[0], y: SPAWN[1], dir: 0, moving: false, frame: 0, t: 0, look: lookFor(name) }; actors.set(uid, a); }
    return a;
  }

  /* ---------- entrada ---------- */
  const keys = new Set(); let target = null, route = [], routeStuck = 0;
  const KEYMAP = { ArrowUp: 'u', ArrowDown: 'd', ArrowLeft: 'l', ArrowRight: 'r', w: 'u', s: 'd', a: 'l', d: 'r', W: 'u', S: 'd', A: 'l', D: 'r' };
  const typing = () => { const t = document.activeElement; return t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName); };
  window.addEventListener('keydown', (e) => {
    if (!active || typing() || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = KEYMAP[e.key]; if (!k) return; keys.add(k); target = null; e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { const k = KEYMAP[e.key]; if (k) keys.delete(k); });
  window.addEventListener('blur', () => keys.clear());

  /* ---------- câmera e laço ---------- */
  let active = false, raf = 0, last = 0, scale = 2, camX = 0, camY = 0;
  function resize() {
    const W = sea.clientWidth, H = sea.clientHeight - 64; if (W < 50 || H < 50) return;
    scale = Math.max(2, Math.floor(Math.min(W / WW, H / WH)));
    canvas.width = Math.ceil(W / scale); canvas.height = Math.ceil(H / scale);
    canvas.style.width = canvas.width * scale + 'px'; canvas.style.height = canvas.height * scale + 'px';
    ctx.imageSmoothingEnabled = false;
  }
  new ResizeObserver(() => { if (active) resize(); }).observe(sea);

  function step(dt) {
    const me = actors.get(state.user?.id); if (!me) return;
    let dx = (keys.has('r') ? 1 : 0) - (keys.has('l') ? 1 : 0), dy = (keys.has('d') ? 1 : 0) - (keys.has('u') ? 1 : 0);
    if (dx || dy) route = [];
    let walking = false;
    if (!dx && !dy && route.length) { /* caminho até uma sala */
      const w = route[0], tx = w[0] - me.x, ty = w[1] - me.y, d = Math.hypot(tx, ty);
      if (d < 2) { me.x = w[0]; me.y = w[1]; route.shift(); } else { dx = tx / d; dy = ty / d; walking = true; }
    } else if (!dx && !dy && target) {
      const tx = target.x - me.x, ty = target.y - me.y, d = Math.hypot(tx, ty);
      if (d < 3 || target.stuck > 12) target = null; else { dx = tx / d; dy = ty / d; }
    }
    const moving = !!(dx || dy);
    if (moving) {
      const n = Math.hypot(dx, dy) || 1, sp = (walking ? 104 : 64) * dt; dx = dx / n * sp; dy = dy / n * sp;
      const ox = me.x, oy = me.y;
      if (canStand(me.x + dx, me.y)) me.x += dx; if (canStand(me.x, me.y + dy)) me.y += dy;
      const stuck = me.x === ox && me.y === oy;
      if (target) target.stuck = stuck ? (target.stuck || 0) + 1 : 0;
      if (walking) { routeStuck = stuck ? routeStuck + 1 : 0; if (routeStuck > 15) { route = []; routeStuck = 0; } }
      me.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 1 : 2) : (dy < 0 ? 3 : 0);
    }
    me.moving = moving && (me.x !== undefined); me.t += dt; if (me.t > 0.16) { me.t = 0; me.frame++; }
  }

  function render() {
    const me = actors.get(state.user?.id);
    const vw = canvas.width, vh = canvas.height;
    camX = me ? me.x - vw / 2 : 0; camY = me ? me.y - 8 - vh / 2 : 0;
    camX = WW <= vw ? (WW - vw) / 2 : Math.max(0, Math.min(WW - vw, camX));
    camY = WH <= vh ? (WH - vh) / 2 : Math.max(0, Math.min(WH - vh, camY));
    camX = Math.round(camX); camY = Math.round(camY);
    ctx.fillStyle = '#0c0a2e'; ctx.fillRect(0, 0, vw, vh);
    ctx.drawImage(world, -camX, -camY);
    ctx.save(); ctx.translate(-camX, -camY);
    const list = [...actors.values()].sort((p, q) => p.y - q.y);
    for (const a of list) drawChar(ctx, a.x, a.y, a);
    for (const a of list) drawName(ctx, a.x, a.y, a.name);
    for (const a of list) if (inVoice(a.uid)) drawVoiceMark(ctx, a);
    for (const a of list) { drawBubble(ctx, a); drawEmoji(ctx, a); }
    drawBadges(ctx);
    ctx.restore();
  }

  /* ---------- salas ligadas aos canais ---------- */
  const ROOM_RE = { recepcao: /recep|aviso|bem.?vind/i, vendas: /venda|comercial/i, suporte: /suporte|atendimento|ajuda/i, financeiro: /financ|caixa/i, lounge: /geral|general/i };
  function channelFor(room) {
    const chs = state.channels || [];
    if (room.id === 'reuniao') return chs.find((c) => c.type === 'voice') || null;
    const texts = chs.filter((c) => c.type === 'text');
    const hit = texts.find((c) => ROOM_RE[room.id].test(c.name)); if (hit) return hit;
    if (room.id === 'lounge') return texts.find((c) => !Object.values(ROOM_RE).some((re) => re.test(c.name))) || null;
    return null;
  }
  const roomOf = (x, y) => { const tx = Math.floor(x / T), ty = Math.floor((y - 2) / T); return roomAt[ty]?.[tx] || null; };
  let myRoom = null;
  function checkRoom(me) {
    const r = roomOf(me.x, me.y); if (r === myRoom) return; myRoom = r; if (!r) return;
    const ch = channelFor(r); if (!ch) return;
    if (ch.type === 'text') { if (!(state.view === 'channel' && state.channel?.id === ch.id)) selectChannel(ch.id); }
    else if (!voice.id) toast('Sala de reunião: toque em "Entrar na voz" para falar com a galera.');
  }
  /* caminho mais curto entre tiles livres (busca em largura) */
  function findPath(sx, sy, isGoal) {
    const prev = new Map(), key = (x, y) => y * COLS + x, q = [[sx, sy]]; prev.set(key(sx, sy), null);
    let gx = -1, gy = -1;
    while (q.length) {
      const [x, y] = q.shift(); if (isGoal(x, y)) { gx = x; gy = y; break; }
      for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + ax, ny = y + ay;
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS || blocked[ny][nx] || prev.has(key(nx, ny))) continue;
        prev.set(key(nx, ny), [x, y]); q.push([nx, ny]);
      }
    }
    if (gx < 0) return [];
    const out = []; for (let p = [gx, gy]; p; p = prev.get(key(p[0], p[1]))) out.unshift([p[0] * T + T / 2, p[1] * T + 12]);
    return out.slice(1);
  }
  /* quem escolhe um canal pelo menu: o personagem anda até a sala dele */
  function enterChannel(id) {
    const me = actors.get(state.user?.id); if (!active || !me) return;
    const room = ROOMS.find((r) => channelFor(r)?.id === id); if (!room || roomOf(me.x, me.y) === room) return;
    const doorY = room.door === 'down' ? room.oy + room.h - 1 : room.oy;
    const sx = Math.floor(me.x / T), sy = Math.floor((me.y - 2) / T);
    route = findPath(sx, sy, (x, y) => roomAt[y][x] === room && Math.abs(y - doorY) >= 2 && Math.abs(x - (room.ox + 4.5)) <= 3); routeStuck = 0; target = null;
    if (!route.length) { me.x = (room.ox + 4.5) * T; me.y = doorY * T + 12; sentX = -1; } /* sem caminho: aparece na sala */
  }
  function inVoice(uid) { return !!(typeof voiceUsers === 'function' && state.channels.some((c) => c.type === 'voice' && voiceUsers(c.id).some((u) => u.uid === uid))); }
  const isSpeaking = (uid) => !!document.querySelector(`[data-vuid="${uid}"].speaking`);
  /* balão de fala quando alguém manda mensagem */
  function say(uid, text) {
    const a = actors.get(uid); if (!a || !text) return;
    const t = String(text).replace(/\s+/g, ' '); a.say = { text: t.length > 34 ? t.slice(0, 33) + '…' : t, until: performance.now() + 4500 };
  }
  function react(uid, e) { const a = actors.get(uid); if (a) a.emo = { e, start: performance.now() }; }
  function drawEmoji(c, a) {
    if (!a.emo) return; const t = (performance.now() - a.emo.start) / 1900; if (t > 1) { a.emo = null; return; }
    c.save(); c.globalAlpha = 1 - t * t; c.font = '14px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(a.emo.e, Math.round(a.x + Math.sin(t * 9) * 3), Math.round(a.y - 46 - t * 30)); c.restore();
  }
  function drawBubble(c, a) {
    if (!a.say || performance.now() > a.say.until) return;
    c.font = 'bold 8px monospace'; const w = Math.ceil(c.measureText(a.say.text).width) + 10, x = Math.round(a.x - w / 2), y = Math.round(a.y) - 52;
    R(c, x - 1, y - 1, w + 2, 15, INK); R(c, x, y, w, 13, '#fff3d1'); R(c, Math.round(a.x) - 2, y + 13, 5, 4, INK); R(c, Math.round(a.x) - 1, y + 13, 3, 3, '#fff3d1');
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = INK; c.fillText(a.say.text, Math.round(a.x), y + 7);
  }
  function drawBadges(c) {
    for (const r of ROOMS) {
      const ch = channelFor(r), n = ch && ch.type === 'text' ? state.unread.get('c:' + ch.id) || 0 : 0; if (!n) continue;
      const x = (r.ox + r.w) * T - 4, y = (r.oy - 1) * T + 3;
      R(c, x - 7, y - 7, 14, 14, INK); R(c, x - 6, y - 6, 12, 12, '#ef4b3c');
      c.font = 'bold 8px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#fff'; c.fillText(n > 9 ? '9+' : String(n), x, y + 0.5);
    }
  }
  function drawVoiceMark(c, a) {
    const talking = isSpeaking(a.uid), x = Math.round(a.x), y = Math.round(a.y) - 36 - (talking ? Math.round(Math.sin(performance.now() / 120) * 1.5) : 0);
    R(c, x - 6, y - 5, 12, 11, INK); R(c, x - 5, y - 4, 10, 9, talking ? '#ffcf3a' : '#fff3d1');
    R(c, x - 1, y - 3, 3, 5, INK); R(c, x - 2, y + 2, 5, 1, INK);
    if (talking) { R(c, x + 7, y - 2, 1, 4, '#ffcf3a'); R(c, x + 9, y - 4, 1, 8, '#ffcf3a'); R(c, x - 8, y - 2, 1, 4, '#ffcf3a'); R(c, x - 10, y - 4, 1, 8, '#ffcf3a'); }
  }

  /* ---------- tempo real: posições dos amigos (broadcast no canal online-<servidor>) ---------- */
  let curServer = null, lastSent = 0, sentX = -1, sentY = -1;
  function onPos(sid, p) {
    if (!p || sid !== state.server?.id || p.u === state.user?.id || typeof p.x !== 'number' || typeof p.y !== 'number') return;
    const known = state.profiles.get(p.u)?.username;
    const a = actorFor(p.u, known || 'Amigo');
    if (!known) nameOf(p.u).then((n) => { a.name = n; a.look = lookFor(n); });
    if (a.seen === undefined) { a.x = p.x; a.y = p.y; }
    a.tx = Math.max(0, Math.min(WW, p.x)); a.ty = Math.max(0, Math.min(WH, p.y)); a.dir = p.d & 3; a.seen = performance.now();
  }
  function syncRemote(dt, now) {
    for (const [uid, a] of actors) {
      if (uid === state.user.id) continue;
      const online = state.online.get(state.server?.id)?.has(uid);
      if (now - (a.seen || 0) > 12000 || online === false) { actors.delete(uid); continue; }
      const dx = a.tx - a.x, dy = a.ty - a.y, d = Math.hypot(dx, dy);
      if (d > 0.6) { const sp = Math.min(d, (d > 48 ? 260 : 130) * dt); a.x += dx / d * sp; a.y += dy / d * sp; a.moving = true; } else a.moving = false;
      a.t += dt; if (a.t > 0.16) { a.t = 0; a.frame++; }
    }
  }
  function broadcastPos(now) {
    const me = actors.get(state.user.id), ch = state.presence.get(state.server?.id); if (!me || !ch) return;
    const changed = Math.abs(me.x - sentX) > 0.5 || Math.abs(me.y - sentY) > 0.5;
    if (now - lastSent < (changed ? 120 : 2500)) return;
    lastSent = now; sentX = me.x; sentY = me.y;
    try { ch.send({ type: 'broadcast', event: 'pos', payload: { u: state.user.id, x: Math.round(me.x), y: Math.round(me.y), d: me.dir } }); } catch { /* canal ainda conectando */ }
  }

  function loop(ts) {
    if (!active) return;
    const dt = Math.min(0.05, (ts - (last || ts)) / 1000); last = ts;
    if (state.user) {
      if (curServer !== state.server?.id) { if (curServer) for (const uid of [...actors.keys()]) if (uid !== state.user.id) actors.delete(uid); curServer = state.server?.id; sentX = -1; }
      actorFor(state.user.id, state.profile?.username || 'Você'); step(dt); syncRemote(dt, ts); broadcastPos(ts); checkRoom(actors.get(state.user.id));
    }
    render(); raf = requestAnimationFrame(loop);
  }

  canvas.addEventListener('pointerdown', (e) => {
    const r = canvas.getBoundingClientRect(), k = canvas.width / r.width;
    target = { x: (e.clientX - r.left) * k + camX, y: (e.clientY - r.top) * k + camY + 6, stuck: 0 };
  });

  function setActive(on) {
    active = on; document.body.classList.toggle('office', on);
    try { localStorage.setItem('nm_view', on ? 'office' : 'map'); } catch { /* sem storage */ }
    cancelAnimationFrame(raf); keys.clear();
    if (on) { resize(); last = 0; raf = requestAnimationFrame(loop); }
  }
  document.addEventListener('visibilitychange', () => { if (active && !document.hidden) { cancelAnimationFrame(raf); last = 0; raf = requestAnimationFrame(loop); } });
  return { setActive, get active() { return active; }, actors, actorFor, ROOMS, canStand, T, onPos, enterChannel, channelFor, say, react };
})();

if (OFFICE) OFFICE.setActive(true); /* o escritório é a única tela do mundo; o mapa de ilhas foi aposentado */
