'use strict';

const SUPABASE_URL = 'https://xxptxcqrehjffeteatck.supabase.co';
const SUPABASE_KEY = 'sb_publishable_ncso1ruNN4X1bE2AwzLAUQ_wUND2f01';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = (id) => document.getElementById(id);
const state = {
  user: null, profile: null,
  servers: [], server: null,
  channels: [], channel: null,
  members: [], profiles: new Map(),
  sub: null, pendingFile: null, lastMsg: null,
  view: 'channel', dmPeer: null, unread: new Map(), online: new Map(), presence: new Map(), rt: null,
};

/* ---------- utilidades ---------- */
const COLORS = ['#7c5cff', '#22d3ee', '#f59e0b', '#ef4444', '#10b981', '#ec4899', '#3b82f6', '#84cc16'];
const colorFor = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return COLORS[h % COLORS.length]; };
const initial = (s) => (String(s || '?').trim()[0] || '?').toUpperCase();
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
function avatar(name) { const a = el('span', 'avatar', initial(name)); a.style.background = colorFor(name); return a; }
function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 3000); }
function fmtTime(iso) {
  const d = new Date(iso), now = new Date();
  const hm = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === now.toDateString() ? `Hoje às ${hm}` : `${d.toLocaleDateString('pt-BR')} ${hm}`;
}
function ask(title, placeholder = '') {
  return new Promise((resolve) => {
    const dlg = $('dlg'); $('dlg-title').textContent = title;
    const input = $('dlg-input'); input.value = ''; input.placeholder = placeholder;
    dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok' ? input.value.trim() : null), { once: true });
    dlg.showModal(); input.focus();
  });
}

$('dlg-cancel').onclick = () => $('dlg').close('cancel');

/* ---------- auth ---------- */
let signupMode = false;
function setMode(signup) {
  signupMode = signup;
  $('tab-login').setAttribute('aria-selected', String(!signup));
  $('tab-signup').setAttribute('aria-selected', String(signup));
  $('username-wrap').hidden = !signup;
  $('username').required = signup;
  $('auth-submit').textContent = signup ? 'Criar conta' : 'Entrar';
  $('password').autocomplete = signup ? 'new-password' : 'current-password';
  $('auth-error').textContent = '';
}
$('tab-login').onclick = () => setMode(false);
$('tab-signup').onclick = () => setMode(true);

$('auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('email').value.trim(), password = $('password').value;
  const btn = $('auth-submit'); btn.disabled = true; $('auth-error').textContent = '';
  try {
    if (signupMode) {
      const username = $('username').value.trim();
      const { data, error } = await sb.auth.signUp({ email, password, options: { data: { username } } });
      if (error) throw error;
      if (!data.session) { $('auth-error').textContent = 'Conta criada! Confirme o e-mail que enviamos e depois entre.'; setMode(false); }
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }
  } catch (err) {
    const m = err.message || '';
    $('auth-error').textContent = /Invalid login/i.test(m) ? 'E-mail ou senha incorretos.'
      : /already registered/i.test(m) ? 'Esse e-mail já tem conta. Use "Entrar".'
      : /rate limit/i.test(m) ? 'Muitas tentativas. Espere um pouco.' : m;
  } finally { btn.disabled = false; }
});

$('logout').onclick = () => sb.auth.signOut();

sb.auth.onAuthStateChange((event, session) => {
  // não fazer chamadas ao Supabase direto aqui dentro; adiar
  setTimeout(() => (session ? onSignedIn(session.user) : onSignedOut()), 0);
});

function onSignedOut() {
  leaveVoice(); for (const o of voice.obs.values()) sb.removeChannel(o.ch); voice.obs.clear();
  stopRealtime(); unsubscribe(); Object.assign(state, { user: null, profile: null, servers: [], server: null, channels: [], channel: null });
  $('app').hidden = true; $('auth').hidden = false;
}

async function onSignedIn(user) {
  if (state.user && state.user.id === user.id) return;
  state.user = user;
  $('auth').hidden = true; $('app').hidden = false;
  const { data } = await sb.from('profiles').select('*').eq('id', user.id).single();
  state.profile = data; state.profiles.set(user.id, data);
  const name = data?.username || user.email;
  $('me-name').textContent = name;
  const av = $('me-avatar'); av.textContent = initial(name); av.style.background = colorFor(name);
  await handleInviteFromUrl();
  await loadServers();
  startRealtime(); loadDmUnread(); setupNotifButton(); setupSoundButton();
}

/* ---------- convite ---------- */
async function handleInviteFromUrl() {
  const url = new URL(location.href);
  const code = url.searchParams.get('convite') || localStorage.getItem('nm_convite');
  if (!code) return;
  localStorage.removeItem('nm_convite');
  url.searchParams.delete('convite'); history.replaceState(null, '', url.pathname + url.search);
  const { data, error } = await sb.rpc('join_server', { code });
  if (error) toast('Convite inválido.'); else { toast('Você entrou no servidor!'); localStorage.setItem('nm_last_server', data); }
}
(function rememberInvite() {
  const c = new URL(location.href).searchParams.get('convite');
  if (c) localStorage.setItem('nm_convite', c);
})();

$('invite-btn').onclick = async () => {
  if (!state.server) return;
  const link = `${location.origin}${location.pathname}?convite=${state.server.invite_code}`;
  try { await navigator.clipboard.writeText(link); toast('Link de convite copiado!'); }
  catch { prompt('Copie o link de convite:', link); }
};

/* ---------- servidores ---------- */
async function loadServers() {
  const { data, error } = await sb.from('servers').select('*').order('created_at');
  if (error) return toast('Erro ao carregar servidores.');
  state.servers = data;
  setupPresence();
  renderServers();
  const last = localStorage.getItem('nm_last_server');
  const target = data.find((s) => s.id === last) || data[0];
  if (target) selectServer(target.id); else showEmpty();
}

function renderServers() {
  const nav = $('servers'); nav.replaceChildren();
  for (const s of state.servers) {
    const b = el('button', 'srv' + (state.server?.id === s.id ? ' active' : ''), initial(s.name));
    b.title = s.name; b.setAttribute('aria-label', s.name);
    b.onclick = () => selectServer(s.id);
    nav.append(b);
  }
  const add = el('button', 'srv add', '+'); add.title = 'Criar servidor'; add.setAttribute('aria-label', 'Criar servidor');
  add.onclick = createServer;
  const join = el('button', 'srv add', '→'); join.title = 'Entrar com código de convite'; join.setAttribute('aria-label', 'Entrar com código de convite');
  join.onclick = joinByCode;
  nav.append(add, join);
}

async function createServer() {
  const name = await ask('Nome do novo servidor', 'Ex.: Galera do jogo');
  if (!name) return;
  const { data, error } = await sb.rpc('create_server', { server_name: name });
  if (error) return toast('Não foi possível criar o servidor.');
  localStorage.setItem('nm_last_server', data); await loadServers();
}

async function joinByCode() {
  let code = await ask('Cole o código ou link de convite');
  if (!code) return;
  try { code = new URL(code).searchParams.get('convite') || code; } catch { /* era só o código */ }
  const { data, error } = await sb.rpc('join_server', { code });
  if (error) return toast('Convite inválido.');
  localStorage.setItem('nm_last_server', data); await loadServers();
}

function showEmpty() {
  state.server = null; state.channel = null; unsubscribe();
  $('server-name').textContent = 'Novo Mundo';
  $('channel-list').replaceChildren(el('p', 'muted', 'Crie um servidor (+) ou entre em um com um convite (→).'));
  $('channel-title').textContent = '';
  const m = $('messages'); m.replaceChildren(el('div', 'empty', 'Nenhum servidor ainda.'));
  $('members').replaceChildren();
}

async function selectServer(id) {
  state.server = state.servers.find((s) => s.id === id);
  localStorage.setItem('nm_last_server', id);
  $('server-name').textContent = state.server.name;
  renderServers();
  const [{ data: chs }, { data: mem }] = await Promise.all([
    sb.from('channels').select('*').eq('server_id', id).order('created_at'),
    sb.from('members').select('user_id, role').eq('server_id', id),
  ]);
  state.channels = chs || []; state.members = mem || [];
  const ids = state.members.map((m) => m.user_id).filter((u) => !state.profiles.has(u));
  if (ids.length) {
    const { data: ps } = await sb.from('profiles').select('*').in('id', ids);
    (ps || []).forEach((p) => state.profiles.set(p.id, p));
  }
  watchVoiceChannels();
  renderChannels(); renderMembers();
  const first = state.channels.find((c) => c.type === 'text');
  if (first) selectChannel(first.id);
}

/* ---------- canais ---------- */
function badge(n) { return n ? el('span', 'badge', n > 99 ? '99+' : String(n)) : null; }

function renderChannels() {
  const list = $('channel-list'); list.replaceChildren();
  if (!state.server) return;
  const isOwner = state.server.owner_id === state.user.id;
  for (const [type, label] of [['text', 'Canais de texto'], ['voice', 'Canais de voz']]) {
    const head = el('div', 'ch-group'); head.append(el('span', null, label));
    if (isOwner && type === 'text') {
      const add = el('button', 'icon-btn', '+'); add.title = 'Novo canal de texto'; add.setAttribute('aria-label', 'Novo canal de texto');
      add.onclick = createChannel; head.append(add);
    }
    list.append(head);
    for (const c of state.channels.filter((x) => x.type === type)) {
      const isActive = type === 'text' ? state.view === 'channel' && state.channel?.id === c.id : voice.id === c.id;
      const b = el('button', 'ch' + (isActive ? ' active' : ''));
      b.append(el('span', 'nm', (type === 'text' ? '# ' : '🔊 ') + c.name));
      if (type === 'text') { const bd = badge(state.unread.get('c:' + c.id)); if (bd) b.append(bd); }
      b.onclick = type === 'text' ? () => selectChannel(c.id) : () => joinVoice(c);
      list.append(b);
      if (type === 'voice') list.append(renderVoiceUsers(c.id));
    }
  }
  const head = el('div', 'ch-group'); head.append(el('span', null, 'Mensagens diretas')); list.append(head);
  const others = state.members.filter((m) => m.user_id !== state.user.id);
  if (!others.length) list.append(el('p', 'muted', 'Convide amigos para conversar.'));
  for (const m of others) {
    const name = state.profiles.get(m.user_id)?.username || 'Usuário';
    const b = el('button', 'ch' + (state.view === 'dm' && state.dmPeer === m.user_id ? ' active' : ''));
    const dot = el('span', 'dot' + (isOnline(m.user_id) ? ' on' : '')); dot.title = isOnline(m.user_id) ? 'Online' : 'Offline';
    b.append(dot, el('span', 'nm', name));
    const bd = badge(state.unread.get('d:' + m.user_id)); if (bd) b.append(bd);
    b.onclick = () => openDm(m.user_id);
    list.append(b);
  }
}

async function createChannel() {
  const name = await ask('Nome do canal', 'ex.: memes');
  if (!name) return;
  const clean = name.toLowerCase().replace(/[^a-z0-9à-ú]+/gi, '-').replace(/^-|-$/g, '').slice(0, 40);
  const { error } = await sb.from('channels').insert({ server_id: state.server.id, name: clean || 'novo', type: 'text' });
  if (error) return toast('Não foi possível criar o canal.');
  await selectServer(state.server.id);
}

function renderMembers() {
  const box = $('members'); box.replaceChildren(el('h3', null, `Membros — ${state.members.length}`));
  for (const m of state.members) {
    const name = state.profiles.get(m.user_id)?.username || 'Usuário';
    const row = el('div', 'mem'); row.append(el('span', 'dot' + (isOnline(m.user_id) ? ' on' : '')), avatar(name), el('span', null, name));
    if (m.user_id !== state.user.id) { row.title = 'Enviar mensagem direta'; row.onclick = () => openDm(m.user_id); }
    box.append(row);
  }
}

/* ---------- mensagens ---------- */
function unsubscribe() { if (state.sub) { sb.removeChannel(state.sub); state.sub = null; } }

async function selectChannel(id) {
  state.channel = state.channels.find((c) => c.id === id);
  state.view = 'channel'; state.dmPeer = null; state.unread.delete('c:' + id); updateTitle();
  document.body.classList.remove('nav-open');
  $('channel-title').textContent = '# ' + state.channel.name;
  $('text').placeholder = `Enviar mensagem em #${state.channel.name}`;
  renderChannels(); state.lastMsg = null;
  const box = $('messages'); box.replaceChildren();
  const { data, error } = await sb.from('messages').select('*').eq('channel_id', id).order('created_at', { ascending: false }).limit(100);
  if (error) return toast('Erro ao carregar mensagens.');
  const msgs = data.reverse();
  if (!msgs.length) box.append(el('div', 'empty', `Este é o começo de #${state.channel.name}. Diga oi!`));
  for (const m of msgs) await addMessage(m);
  box.scrollTop = box.scrollHeight;
}

/* ---------- tempo real global (mensagens, DMs, canais, membros) ---------- */
function stopRealtime() {
  if (state.rt) { sb.removeChannel(state.rt); state.rt = null; }
  for (const ch of state.presence.values()) sb.removeChannel(ch);
  state.presence.clear(); state.online.clear(); state.unread.clear(); updateTitle();
}

function startRealtime() {
  if (state.rt) sb.removeChannel(state.rt);
  state.rt = sb.channel('global-' + state.user.id)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (p) => onNewMessage(p.new))
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, (p) => document.getElementById('m-' + p.old.id)?.remove())
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dm_messages' }, (p) => onNewDm(p.new))
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'dm_messages' }, (p) => document.getElementById('m-' + p.old.id)?.remove())
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'channels' }, () => refreshServerData())
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'members' }, () => refreshServerData())
    .subscribe();
}

async function refreshServerData() {
  if (!state.server) return;
  const id = state.server.id;
  const [{ data: chs }, { data: mem }] = await Promise.all([
    sb.from('channels').select('*').eq('server_id', id).order('created_at'),
    sb.from('members').select('user_id, role').eq('server_id', id),
  ]);
  if (state.server?.id !== id) return;
  state.channels = chs || state.channels; state.members = mem || state.members;
  const ids = state.members.map((m) => m.user_id).filter((u) => !state.profiles.has(u));
  if (ids.length) { const { data: ps } = await sb.from('profiles').select('*').in('id', ids); (ps || []).forEach((p) => state.profiles.set(p.id, p)); }
  watchVoiceChannels(); renderChannels(); renderMembers();
}

async function showIncoming(m) {
  const box = $('messages');
  if (document.getElementById('m-' + m.id)) return;
  box.querySelector('.empty')?.remove();
  const stick = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
  await addMessage(m); if (stick) box.scrollTop = box.scrollHeight;
}

async function onNewMessage(m) {
  if (state.view === 'channel' && state.channel?.id === m.channel_id) {
    await showIncoming(m);
    if (m.user_id !== state.user.id && document.hidden) notify(await nameOf(m.user_id), m.content || '📷 Imagem', 'c' + m.channel_id);
    return;
  }
  if (m.user_id === state.user.id) return;
  state.unread.set('c:' + m.channel_id, (state.unread.get('c:' + m.channel_id) || 0) + 1);
  updateTitle(); renderChannels();
  const ch = state.channels.find((c) => c.id === m.channel_id);
  notify((await nameOf(m.user_id)) + (ch ? ` em #${ch.name}` : ''), m.content || '📷 Imagem', 'c' + m.channel_id);
}

async function onNewDm(d) {
  const peer = d.sender === state.user.id ? d.recipient : d.sender;
  const m = { id: d.id, user_id: d.sender, content: d.content, image_path: d.image_path, created_at: d.created_at, _t: 'dm_messages' };
  if (state.view === 'dm' && state.dmPeer === peer) {
    await showIncoming(m);
    if (d.sender !== state.user.id) { markDmRead(peer); if (document.hidden) notify(await nameOf(d.sender), d.content || '📷 Imagem', 'd' + peer); }
    return;
  }
  if (d.sender === state.user.id) return;
  state.unread.set('d:' + peer, (state.unread.get('d:' + peer) || 0) + 1);
  updateTitle(); renderChannels();
  notify((await nameOf(d.sender)) + ' (mensagem direta)', d.content || '📷 Imagem', 'd' + peer);
}

function updateTitle() {
  let n = 0; for (const v of state.unread.values()) n += v;
  document.title = (n ? `(${n}) ` : '') + 'Novo Mundo';
}

/* ---------- notificações do navegador ---------- */
function notify(title, body, tag) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const n = new Notification(title, { body: body.slice(0, 140), tag, icon: 'icon.svg' });
    n.onclick = () => { window.focus(); n.close(); };
  } catch { /* alguns celulares exigem service worker */ }
}
/* ---------- avisos de "fulano conectou" ---------- */
const soundOn = () => { try { return localStorage.getItem('nm_sound') !== 'off'; } catch { return true; } };
let chimeCtx = null;
function chime() {
  if (!soundOn()) return;
  try {
    chimeCtx = chimeCtx || new (window.AudioContext || window.webkitAudioContext)(); chimeCtx.resume();
    const t = chimeCtx.currentTime;
    [660, 880].forEach((f, i) => {
      const o = chimeCtx.createOscillator(), g = chimeCtx.createGain(), at = t + i * 0.12;
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.12, at + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.25);
      o.connect(g).connect(chimeCtx.destination); o.start(at); o.stop(at + 0.3);
    });
  } catch { /* som bloqueado até a primeira interação */ }
}
async function announce(uid, text, icon) {
  const name = await nameOf(uid);
  toast(`${icon} ${name} ${text}`); chime();
  if (document.hidden) notify('Novo Mundo', `${name} ${text}`, 'on' + uid);
}
function setupSoundButton() {
  const b = $('sound-btn');
  const paint = () => { const on = soundOn(); b.textContent = on ? '🔊' : '🔕'; b.title = on ? 'Som dos avisos: ligado' : 'Som dos avisos: desligado'; b.setAttribute('aria-label', b.title); };
  b.onclick = () => { try { localStorage.setItem('nm_sound', soundOn() ? 'off' : 'on'); } catch { /* sem storage */ } paint(); if (soundOn()) chime(); };
  paint();
}

function setupNotifButton() {
  const b = $('notif-btn');
  if (!('Notification' in window) || Notification.permission !== 'default') { b.hidden = true; return; }
  b.hidden = false;
  b.onclick = async () => { const p = await Notification.requestPermission(); b.hidden = true; toast(p === 'granted' ? 'Notificações ativadas!' : 'Notificações bloqueadas no navegador.'); };
}

/* ---------- presença online ---------- */
function isOnline(uid) {
  if (uid === state.user.id) return true;
  return !!state.server && state.online.get(state.server.id)?.has(uid);
}
function setupPresence() {
  for (const s of state.servers) {
    if (state.presence.has(s.id)) continue;
    const ch = sb.channel('online-' + s.id, { config: { private: true, presence: { key: state.user.id } } });
    ch.on('presence', { event: 'sync' }, () => {
      const now = new Set(Object.keys(ch.presenceState())), prev = state.online.get(s.id);
      state.online.set(s.id, now);
      if (prev) for (const k of now) if (!prev.has(k) && k !== state.user.id) announce(k, `entrou no servidor ${s.name}`, '🟢');
      if (state.server) { renderChannels(); renderMembers(); }
    }).subscribe(async (st) => { if (st === 'SUBSCRIBED') await ch.track({ at: Date.now() }); });
    state.presence.set(s.id, ch);
  }
}

/* ---------- mensagens diretas ---------- */
const readKey = (peer) => `nm_dm_read_${state.user.id}_${peer}`;
function markDmRead(peer) { try { localStorage.setItem(readKey(peer), new Date().toISOString()); } catch { /* sem storage */ } state.unread.delete('d:' + peer); updateTitle(); }

async function loadDmUnread() {
  const { data } = await sb.from('dm_messages').select('sender, created_at').eq('recipient', state.user.id).order('created_at', { ascending: false }).limit(200);
  for (const d of data || []) {
    let last = ''; try { last = localStorage.getItem(readKey(d.sender)) || ''; } catch { /* sem storage */ }
    if (!last || d.created_at > last) state.unread.set('d:' + d.sender, (state.unread.get('d:' + d.sender) || 0) + 1);
  }
  updateTitle(); if (state.server) renderChannels();
}

async function openDm(peer) {
  state.view = 'dm'; state.dmPeer = peer; state.lastMsg = null;
  document.body.classList.remove('nav-open');
  const name = await nameOf(peer);
  $('channel-title').textContent = '@ ' + name; $('text').placeholder = `Enviar mensagem para ${name}`;
  markDmRead(peer); renderChannels();
  const box = $('messages'); box.replaceChildren();
  const me = state.user.id;
  const { data, error } = await sb.from('dm_messages').select('*')
    .or(`and(sender.eq.${me},recipient.eq.${peer}),and(sender.eq.${peer},recipient.eq.${me})`)
    .order('created_at', { ascending: false }).limit(100);
  if (error) return toast('Erro ao carregar a conversa.');
  const msgs = data.reverse();
  if (!msgs.length) box.append(el('div', 'empty', `Início da conversa com ${name}.`));
  for (const d of msgs) await addMessage({ id: d.id, user_id: d.sender, content: d.content, image_path: d.image_path, created_at: d.created_at, _t: 'dm_messages' });
  box.scrollTop = box.scrollHeight;
}

async function nameOf(uid) {
  if (!state.profiles.has(uid)) {
    const { data } = await sb.from('profiles').select('*').eq('id', uid).single();
    if (data) state.profiles.set(uid, data);
  }
  return state.profiles.get(uid)?.username || 'Usuário';
}

async function addMessage(m) {
  const name = await nameOf(m.user_id);
  const last = state.lastMsg;
  const cont = last && last.user_id === m.user_id && new Date(m.created_at) - new Date(last.created_at) < 5 * 60e3;
  state.lastMsg = m;

  const row = el('div', 'msg' + (cont ? ' cont' : '')); row.id = 'm-' + m.id;
  const body = el('div', 'body');
  if (!cont) {
    const meta = el('div', 'meta', null);
    meta.append(el('span', 'who', name), el('span', 'when', fmtTime(m.created_at)));
    if (m.user_id === state.user.id) {
      const del = el('button', 'icon-btn del', '🗑'); del.title = 'Apagar'; del.setAttribute('aria-label', 'Apagar mensagem');
      del.onclick = async () => { const { error } = await sb.from(m._t || 'messages').delete().eq('id', m.id); if (error) toast('Não foi possível apagar.'); else row.remove(); };
      meta.append(del);
    }
    body.append(meta);
  }
  if (m.content) body.append(el('div', 'txt', m.content));
  if (m.image_path) {
    const { data } = await sb.storage.from('chat-images').createSignedUrl(m.image_path, 3600);
    if (data) {
      const img = el('img'); img.src = data.signedUrl; img.alt = 'Imagem enviada por ' + name; img.loading = 'lazy';
      img.onclick = () => window.open(data.signedUrl, '_blank', 'noopener');
      body.append(img);
    }
  }
  row.append(avatar(name), body);
  $('messages').append(row);
}

/* ---------- envio ---------- */
$('file').addEventListener('change', (e) => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  if (f.size > 5 * 1024 * 1024) return toast('Imagem muito grande (máx. 5 MB).');
  state.pendingFile = f; const p = $('preview'); p.textContent = '📎 ' + f.name + ' — será enviada com a mensagem'; p.hidden = false;
});
$('text').addEventListener('paste', (e) => {
  const f = [...(e.clipboardData?.files || [])].find((x) => x.type.startsWith('image/'));
  if (f) { state.pendingFile = f; const p = $('preview'); p.textContent = '📎 Imagem colada — será enviada com a mensagem'; p.hidden = false; }
});

$('composer').addEventListener('submit', async (e) => {
  e.preventDefault();
  const isDm = state.view === 'dm';
  if (isDm ? !state.dmPeer : !state.channel) return;
  const content = $('text').value.trim(), file = state.pendingFile;
  if (!content && !file) return;
  const btn = e.submitter; if (btn) btn.disabled = true;
  try {
    let image_path = null;
    if (file) {
      const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'png';
      image_path = `${state.user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await sb.storage.from('chat-images').upload(image_path, file, { contentType: file.type });
      if (upErr) throw upErr;
    }
    const { error } = isDm
      ? await sb.from('dm_messages').insert({ sender: state.user.id, recipient: state.dmPeer, content, image_path })
      : await sb.from('messages').insert({ channel_id: state.channel.id, user_id: state.user.id, content, image_path });
    if (error) throw error;
    $('text').value = ''; state.pendingFile = null; $('preview').hidden = true;
  } catch (err) { toast('Não foi possível enviar.'); }
  finally { if (btn) btn.disabled = false; $('text').focus(); }
});

/* ---------- voz (WebRTC P2P, sinalização via Supabase Realtime) ---------- */
const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] };
const voice = {
  id: null, name: '', sid: null, stream: null, screen: null, muted: false,
  peers: new Map(), st: new Map(), peerSid: new Map(), screens: new Map(),
  obs: new Map(), ctx: null, meters: new Map(), timer: null,
  gateOff: false, sens: (() => { try { return Math.min(10, Math.max(1, +localStorage.getItem('nm_sens') || 8)); } catch { return 8; } })(),
};

function voiceUsers(cid) {
  const o = voice.obs.get(cid); if (!o) return [];
  return Object.entries(o.ch.presenceState()).map(([uid, arr]) => ({ uid, ...(arr[arr.length - 1] || {}) }));
}

function renderVoiceUsers(cid) {
  const box = el('div', 'vusers');
  for (const u of voiceUsers(cid)) {
    const row = el('div', 'vuser'); row.dataset.vuid = u.uid;
    row.append(avatar(u.name || 'Usuário'), el('span', null, (u.name || 'Usuário') + (u.sharing ? ' 🖥' : '') + (u.muted ? ' 🔇' : '')));
    box.append(row);
  }
  return box;
}

// observa (sem entrar) cada canal de voz do servidor atual, para mostrar quem está na sala
function watchVoiceChannels() {
  for (const [cid, o] of voice.obs) {
    if (cid !== voice.id) { sb.removeChannel(o.ch); voice.obs.delete(cid); }
  }
  for (const c of state.channels.filter((x) => x.type === 'voice')) {
    if (voice.obs.has(c.id)) continue;
    const ch = sb.channel('voice-' + c.id, { config: { private: true, presence: { key: state.user.id, enabled: true }, broadcast: { self: false } } });
    let prevKeys = new Set(), ready = false; // só avisa depois de ler quem já estava na sala
    ch.on('presence', { event: 'sync' }, () => {
      const now = new Set(Object.keys(ch.presenceState()));
      if (ready) for (const k of now) if (!prevKeys.has(k) && k !== state.user.id) announce(k, `entrou na sala 🔊 ${c.name}`, '🎙');
      prevKeys = now;
      if (state.server) renderChannels();
      if (voice.id === c.id) updateVoiceStatus();
    })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => { if (voice.id === c.id) onPeerJoin(key, newPresences?.[0]?.sid); })
      .on('presence', { event: 'leave' }, ({ key }) => {
        // atualizar o mudo/tela também gera "leave"+"join" da mesma pessoa: só fecha se ela realmente saiu
        if (voice.id === c.id && key !== state.user.id && !ch.presenceState()[key]) { voice.peerSid.delete(key); closePeer(key); }
      })
      .on('broadcast', { event: 'signal' }, ({ payload }) => { if (voice.id === c.id) onSignal(payload); })
      .subscribe((st) => {
        if (st === 'SUBSCRIBED') setTimeout(() => { prevKeys = new Set(Object.keys(ch.presenceState())); ready = true; }, 1500);
      });
    voice.obs.set(c.id, { ch });
  }
}

async function joinVoice(c) {
  if (voice.id === c.id) return;
  if (voice.id) await leaveVoice();
  if (!navigator.mediaDevices?.getUserMedia) return toast('Seu navegador não permite microfone aqui (precisa de HTTPS).');
  voice.ctx = voice.ctx || new (window.AudioContext || window.webkitAudioContext)();
  voice.ctx.resume();
  try {
    // sem ganho automático: ele sobe o chiado de fundo quando você fica quieto
    voice.raw = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false, channelCount: 1, sampleRate: 48000 }, video: false,
    });
  } catch { return toast('Permita o acesso ao microfone para entrar na voz.'); }
  voice.stream = cleanMic(voice.raw);
  voice.id = c.id; voice.name = c.name; voice.muted = false; voice.sid = crypto.randomUUID(); voice.peerSid.clear();
  watchMeter(state.user.id, voice.stream);
  voice.timer = setInterval(tickMeters, 120);
  $('voice-bar').hidden = false; $('mic-tune').hidden = false; $('voice-pill').hidden = false; $('voice-name').textContent = c.name; setMuteUI(); setGateUI();
  const ch = voice.obs.get(c.id)?.ch; if (!ch) { await leaveVoice(); return toast('Canal de voz indisponível.'); }
  setShareUI();
  await updatePresence();
  for (const u of voiceUsers(c.id)) onPeerJoin(u.uid, u.sid);
  renderChannels(); updateVoiceStatus();
}

async function leaveVoice() {
  const cid = voice.id; if (!cid) return;
  const ch = voice.obs.get(cid)?.ch;
  if (voice.screen) { voice.screen.getTracks().forEach((t) => { t.onended = null; t.stop(); }); voice.screen = null; setShareUI(); }
  voice.id = null; voice.peerSid.clear();
  for (const uid of [...voice.peers.keys()]) closePeer(uid);
  voice.screens.clear(); renderScreens();
  clearInterval(voice.timer); voice.timer = null;
  for (const m of voice.meters.values()) m.src.disconnect(); voice.meters.clear();
  clearInterval(voice.gateTimer); voice.gateNodes?.forEach((n) => n.disconnect()); voice.gateNodes = null;
  voice.stream?.getTracks().forEach((t) => t.stop()); voice.stream = null;
  voice.raw?.getTracks().forEach((t) => t.stop()); voice.raw = null;
  $('voice-bar').hidden = true; $('mic-tune').hidden = true; $('voice-pill').hidden = true; $('audio-sink').replaceChildren();
  try { await ch?.untrack(); } catch { /* já desconectado */ }
  if (state.server && !state.channels.some((x) => x.id === cid)) { const o = voice.obs.get(cid); if (o) { sb.removeChannel(o.ch); voice.obs.delete(cid); } }
  if (state.server) renderChannels();
}

function setMuteUI() {
  const b = $('mute-btn'); b.setAttribute('aria-pressed', String(voice.muted));
  $('pill-mute').textContent = voice.muted ? '🔇' : '🎤';
  b.textContent = voice.muted ? '🔇' : '🎤'; b.title = voice.muted ? 'Ativar microfone' : 'Silenciar microfone';
  b.setAttribute('aria-label', b.title);
}
$('mute-btn').onclick = async () => {
  if (!voice.stream) return;
  voice.muted = !voice.muted; voice.stream.getAudioTracks().forEach((t) => (t.enabled = !voice.muted)); setMuteUI();
  await updatePresence();
};
$('leave-voice').onclick = leaveVoice;
// no celular o menu lateral fica fechado: mudo e sair ficam também no topo do chat
$('pill-mute').onclick = () => $('mute-btn').click();
$('pill-leave').onclick = leaveVoice;
if (!navigator.mediaDevices?.getDisplayMedia) $('share-btn').hidden = true; // celulares geralmente não compartilham tela
// tocar fora do menu (no escurecido) fecha o menu no celular
document.addEventListener('click', (e) => {
  if (document.body.classList.contains('nav-open') && !e.target.closest('.servers, .channels, #menu-btn')) document.body.classList.remove('nav-open');
});

function setGateUI() {
  const b = $('gate-btn'), on = !voice.gateOff;
  b.setAttribute('aria-pressed', String(on)); b.style.opacity = on ? '1' : '.5';
  b.title = on ? 'Filtro de ruído: ligado (clique para desligar se ninguém te ouvir)' : 'Filtro de ruído: desligado (clique para ligar)';
  b.setAttribute('aria-label', b.title);
}
$('gate-btn').onclick = () => { voice.gateOff = !voice.gateOff; setGateUI(); toast(voice.gateOff ? 'Filtro de ruído desligado' : 'Filtro de ruído ligado'); };
$('gate-sens').value = voice.sens;
$('gate-sens').oninput = (e) => { voice.sens = +e.target.value; try { localStorage.setItem('nm_sens', String(voice.sens)); } catch { /* sem storage */ } };

// mostra na barra de voz quantas pessoas estão realmente conectadas
function updateVoiceStatus() {
  if (!voice.id) return;
  const others = voiceUsers(voice.id).filter((u) => u.uid !== state.user.id).length;
  const ok = [...voice.peers.values()].filter((p) => p.connectionState === 'connected').length;
  $('voice-name').textContent = others ? `${voice.name} · ${ok}/${others} conectados` : `${voice.name} · só você`;
}
window.addEventListener('pagehide', () => { voice.stream?.getTracks().forEach((t) => t.stop()); voice.raw?.getTracks().forEach((t) => t.stop()); });

// Limpa o microfone: corta graves de teclado/mesa e fecha o "portão" quando você não está falando.
// O portão só abre com som sustentado (~60 ms), então um clique isolado de tecla não passa.
function cleanMic(raw) {
  const ctx = voice.ctx;
  const src = ctx.createMediaStreamSource(raw);
  const pre = ctx.createGain(); pre.gain.value = 3; // pré-amplificador: microfones de notebook chegam muito baixos
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 110;
  const an = ctx.createAnalyser(); an.fftSize = 512;
  const delay = ctx.createDelay(0.5); delay.delayTime.value = 0.1; // dá tempo do portão abrir antes da fala chegar
  const gate = ctx.createGain(); gate.gain.value = 0;
  // microfone sem ganho automático vem baixo: sobe o volume e o compressor segura os picos (gritos não estouram)
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -24; comp.knee.value = 6; comp.ratio.value = 8; comp.attack.value = 0.003; comp.release.value = 0.25;
  const makeup = ctx.createGain(); makeup.gain.value = 1;
  const dest = ctx.createMediaStreamDestination();
  src.connect(pre); pre.connect(hp); hp.connect(an); hp.connect(delay); delay.connect(gate); gate.connect(comp); comp.connect(makeup); makeup.connect(dest);
  // o limite do portão acompanha o ruído de fundo medido; a "sensibilidade" (1-10) define quão acima do ruído a fala precisa estar
  const buf = new Uint8Array(an.fftSize), hist = []; let hold = 0, floor = 0.05, tick = 0;
  voice.gateTimer = setInterval(() => {
    an.getByteTimeDomainData(buf);
    let sum = 0; for (const v of buf) { const d = (v - 128) / 128; sum += d * d; }
    const rms = Math.sqrt(sum / buf.length);
    // piso de ruído: desce rápido nas pausas e sobe devagar (sempre, com o portão aberto ou fechado); 1ª meia segundo só calibra
    floor = rms < floor ? floor * 0.9 + rms * 0.1 : Math.min(0.05, floor * 1.001 + 1e-6);
    floor = Math.max(0.0008, floor);
    const calibrating = tick < 25;
    const thr = Math.max(0.0025, floor * (5.4 - voice.sens * 0.4)), loud = !calibrating && rms > thr;
    // abre quando 3 das últimas 5 janelas (~100 ms) estão acima do limite: fala (sílabas com pausas) passa, clique isolado de tecla não
    hist.push(loud ? 1 : 0); if (hist.length > 5) hist.shift();
    if (hist.reduce((a, b) => a + b, 0) >= 3) hold = 20; else if (hold > 0) hold--;
    const open = voice.gateOff || hold > 0;
    gate.gain.setTargetAtTime(open ? 1.8 : 0, ctx.currentTime, open ? 0.015 : 0.06);
    if (++tick % 3 === 0) paintLevel(rms, thr, open);
  }, 20);
  voice.gateNodes = [src, hp, an, delay, gate, comp, makeup, pre];
  return dest.stream;
}

// medidor: barra = o que o microfone capta; traço = limite para o filtro abrir; verde = transmitindo
function paintLevel(rms, thr, open) {
  const bar = $('lvl-bar'), mark = $('lvl-thr'); if (!bar) return;
  const sc = (v) => Math.min(100, Math.sqrt(v / 0.08) * 100);
  bar.style.width = sc(rms) + '%'; mark.style.left = sc(thr) + '%';
  bar.style.background = open ? '#4ade80' : '#6b6d80';
}

function send(to, type, data, fresh) {
  voice.obs.get(voice.id)?.ch.send({ type: 'broadcast', event: 'signal', payload: { from: state.user.id, to, type, data, fresh: !!fresh } });
}

function updatePresence() {
  return voice.obs.get(voice.id)?.ch.track({ sid: voice.sid, name: state.profile?.username || 'Usuário', muted: voice.muted, sharing: !!voice.screen });
}

// áudio com mais taxa (voz mais limpa) e prioridade alta; vídeo da tela limitado para não competir com a voz
async function tuneSenders(pc) {
  for (const s of pc.getSenders()) {
    if (!s.track) continue;
    try {
      const p = s.getParameters(); if (!p.encodings?.length) p.encodings = [{}];
      if (s.track.kind === 'audio') Object.assign(p.encodings[0], { maxBitrate: 96000, priority: 'high', networkPriority: 'high' });
      else Object.assign(p.encodings[0], { maxBitrate: 1500000, priority: 'low', networkPriority: 'low' });
      await s.setParameters(p);
    } catch { /* navegador sem suporte: segue com o padrão */ }
  }
}

function addLocalTracks(pc, st) {
  voice.stream.getTracks().forEach((t) => pc.addTrack(t, voice.stream));
  if (voice.screen) st.screenSender = pc.addTrack(voice.screen.getVideoTracks()[0], voice.screen);
}

// "negociação perfeita": os dois lados podem renegociar (ex.: ao compartilhar tela) sem conflito
function makePeer(uid, addTracks) {
  closePeer(uid);
  const pc = new RTCPeerConnection(ICE);
  const st = { making: false, ignore: false, polite: state.user.id > uid, screenSender: null, pending: [], first: !!addTracks, timers: [], born: Date.now() };
  pc.onicecandidate = (e) => { if (e.candidate) send(uid, 'ice', e.candidate.toJSON()); };
  pc.ontrack = (e) => attachRemote(uid, e);
  pc.onnegotiationneeded = async () => {
    try {
      st.making = true; await pc.setLocalDescription();
      send(uid, 'desc', pc.localDescription.toJSON(), st.first); st.first = false; // a 1ª oferta é "nova": o outro lado recria a conexão
    }
    catch (err) { console.warn('voz:', err); } finally { st.making = false; }
  };
  pc.onconnectionstatechange = () => {
    st.timers.forEach(clearTimeout); st.timers = [];
    const s = pc.connectionState; updateVoiceStatus();
    if (s === 'connected') tuneSenders(pc);
    else if (s === 'disconnected') st.timers.push(setTimeout(() => recoverPeer(uid, pc), 2000));
    else if (s === 'failed') recoverPeer(uid, pc);
  };
  voice.peers.set(uid, pc); voice.st.set(uid, st);
  if (addTracks) addLocalTracks(pc, st);
  return pc;
}

// conexão caiu: 1º tenta reiniciar o caminho de rede (ICE); se não voltar em 5 s, recria a conexão do zero
function recoverPeer(uid, pc) {
  const st = voice.st.get(uid);
  if (!st || voice.peers.get(uid) !== pc || pc.connectionState === 'connected') return;
  try { pc.restartIce(); } catch { /* ignora */ }
  st.timers.push(setTimeout(() => {
    if (voice.peers.get(uid) !== pc || pc.connectionState === 'connected') return;
    if (state.user.id < uid) { closePeer(uid); maybeOffer(uid); } // quem tem menor id recria; o outro recebe uma oferta "nova"
    else send(uid, 'reset');                                       // o outro lado pede ao de menor id para recriar
  }, 5000));
}

function closePeer(uid) {
  voice.st.get(uid)?.timers.forEach(clearTimeout);
  voice.peers.get(uid)?.close(); voice.peers.delete(uid); voice.st.delete(uid);
  document.getElementById('a-' + uid)?.remove();
  const m = voice.meters.get(uid); if (m) { m.src.disconnect(); voice.meters.delete(uid); }
  if (voice.screens.delete(uid)) renderScreens();
  updateVoiceStatus();
}

function onPeerJoin(uid, sid) {
  if (!voice.id || uid === state.user.id) return;
  // se a oferta do outro lado já chegou e criou a conexão, não derruba: só registra a sessão dele
  const cur = voice.st.get(uid);
  if (cur && !voice.peerSid.has(uid) && Date.now() - cur.born < 8000) { voice.peerSid.set(uid, sid); return; }
  if (voice.peerSid.get(uid) === sid && voice.peers.has(uid)) return; // só atualização (mudo/tela), mesma sessão
  voice.peerSid.set(uid, sid);
  closePeer(uid); maybeOffer(uid);
}

function maybeOffer(uid) {
  // só o lado de menor id inicia a conexão; o outro responde
  if (!voice.id || !voice.stream || state.user.id >= uid) return;
  makePeer(uid, true); // adicionar as faixas dispara a oferta (onnegotiationneeded)
}

async function onSignal({ from, to, type, data, fresh }) {
  if (!voice.id || to !== state.user.id) return;
  try {
    if (type === 'reset') { if (state.user.id < from) { closePeer(from); maybeOffer(from); } }
    else if (type === 'desc') { if (fresh && voice.peers.has(from)) closePeer(from); await onDesc(from, data); }
    else if (type === 'ice') {
      const pc = voice.peers.get(from), st = voice.st.get(from); if (!pc) return;
      if (pc.remoteDescription) { try { await pc.addIceCandidate(data); } catch (e) { if (!st.ignore) console.warn(e); } }
      else st.pending.push(data);
    }
  } catch (err) { console.warn('voz:', err); }
}

async function onDesc(from, desc) {
  let pc = voice.peers.get(from);
  if (!pc) { if (desc.type !== 'offer') return; pc = makePeer(from, false); }
  const st = voice.st.get(from);
  const collision = desc.type === 'offer' && (st.making || pc.signalingState !== 'stable');
  st.ignore = !st.polite && collision;
  if (st.ignore) return;
  await pc.setRemoteDescription(desc);
  for (const c of st.pending.splice(0)) { try { await pc.addIceCandidate(c); } catch { /* candidato antigo */ } }
  if (desc.type === 'offer') {
    if (!pc.getSenders().some((s) => s.track)) addLocalTracks(pc, st); // reaproveita as faixas da oferta recebida
    await pc.setLocalDescription();
    send(from, 'desc', pc.localDescription.toJSON());
  }
}

function attachRemote(uid, e) {
  const stream = e.streams[0] || new MediaStream([e.track]);
  if (e.track.kind === 'video') {
    voice.screens.set(uid, stream); renderScreens();
    e.track.onmute = () => { voice.screens.delete(uid); renderScreens(); };
    e.track.onunmute = () => { voice.screens.set(uid, stream); renderScreens(); };
    return;
  }
  let a = document.getElementById('a-' + uid);
  if (!a) { a = document.createElement('audio'); a.id = 'a-' + uid; a.autoplay = true; a.setAttribute('playsinline', ''); $('audio-sink').append(a); }
  a.srcObject = stream; a.play?.().catch(() => {});
  watchMeter(uid, stream);
}

/* ---------- compartilhar tela ---------- */
function renderScreens() {
  const box = $('screens'); box.replaceChildren();
  for (const [uid, stream] of voice.screens) {
    const wrap = el('div', 'screen');
    const v = document.createElement('video'); v.srcObject = stream; v.autoplay = true; v.muted = true; v.playsInline = true;
    v.title = 'Clique para tela cheia'; v.onclick = () => v.requestFullscreen?.();
    const name = state.profiles.get(uid)?.username || 'Amigo';
    wrap.append(v, el('span', null, '🖥 ' + name));
    box.append(wrap);
  }
  box.hidden = voice.screens.size === 0;
}

function setShareUI() {
  const b = $('share-btn'); const on = !!voice.screen;
  b.setAttribute('aria-pressed', String(on)); b.title = on ? 'Parar de compartilhar' : 'Compartilhar tela'; b.setAttribute('aria-label', b.title);
}

async function startShare() {
  if (!voice.id || voice.screen) return;
  if (!navigator.mediaDevices?.getDisplayMedia) return toast('Este aparelho não permite compartilhar a tela.');
  try { voice.screen = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: false }); } catch { return; }
  const track = voice.screen.getVideoTracks()[0];
  if ('contentHint' in track) track.contentHint = 'detail';
  track.onended = stopShare;
  for (const [uid, pc] of voice.peers) voice.st.get(uid).screenSender = pc.addTrack(track, voice.screen);
  setTimeout(() => voice.peers.forEach(tuneSenders), 1500);
  setShareUI(); await updatePresence(); renderChannels();
}

async function stopShare() {
  const s = voice.screen; if (!s) return;
  voice.screen = null; s.getTracks().forEach((t) => { t.onended = null; t.stop(); });
  for (const [uid, pc] of voice.peers) {
    const st = voice.st.get(uid);
    if (st?.screenSender) { try { pc.removeTrack(st.screenSender); } catch { /* conexão já fechada */ } st.screenSender = null; }
  }
  setShareUI(); if (voice.id) { await updatePresence(); renderChannels(); }
}
$('share-btn').onclick = () => (voice.screen ? stopShare() : startShare());

// indicador de "quem está falando"
function watchMeter(uid, stream) {
  if (!voice.ctx) return;
  const old = voice.meters.get(uid); if (old) old.src.disconnect();
  const src = voice.ctx.createMediaStreamSource(stream), an = voice.ctx.createAnalyser();
  an.fftSize = 512; src.connect(an);
  voice.meters.set(uid, { src, an, buf: new Uint8Array(an.fftSize) });
}
function tickMeters() {
  for (const [uid, m] of voice.meters) {
    m.an.getByteTimeDomainData(m.buf);
    let sum = 0; for (const v of m.buf) { const d = (v - 128) / 128; sum += d * d; }
    const talking = Math.sqrt(sum / m.buf.length) > 0.04 && !(uid === state.user.id && voice.muted);
    document.querySelectorAll(`[data-vuid="${uid}"]`).forEach((r) => r.classList.toggle('speaking', talking));
  }
}

/* ---------- mobile + PWA ---------- */
$('menu-btn').onclick = () => document.body.classList.toggle('nav-open');
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});

sb.auth.getSession().then(({ data }) => { if (!data.session) { $('auth').hidden = false; } });
