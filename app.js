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
  unsubscribe(); Object.assign(state, { user: null, profile: null, servers: [], server: null, channels: [], channel: null });
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
function renderChannels() {
  const list = $('channel-list'); list.replaceChildren();
  const isOwner = state.server.owner_id === state.user.id;
  for (const [type, label] of [['text', 'Canais de texto'], ['voice', 'Canais de voz']]) {
    const head = el('div', 'ch-group'); head.append(el('span', null, label));
    if (isOwner && type === 'text') {
      const add = el('button', 'icon-btn', '+'); add.title = 'Novo canal de texto'; add.setAttribute('aria-label', 'Novo canal de texto');
      add.onclick = createChannel; head.append(add);
    }
    list.append(head);
    for (const c of state.channels.filter((x) => x.type === type)) {
      const b = el('button', 'ch' + (type === 'text' && state.channel?.id === c.id ? ' active' : '') + (type === 'voice' && voice.id === c.id ? ' active' : ''),
        (type === 'text' ? '# ' : '🔊 ') + c.name);
      b.onclick = type === 'text' ? () => selectChannel(c.id) : () => joinVoice(c);
      list.append(b);
      if (type === 'voice') list.append(renderVoiceUsers(c.id));
    }
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
    const row = el('div', 'mem'); row.append(avatar(name), el('span', null, name));
    box.append(row);
  }
}

/* ---------- mensagens ---------- */
function unsubscribe() { if (state.sub) { sb.removeChannel(state.sub); state.sub = null; } }

async function selectChannel(id) {
  state.channel = state.channels.find((c) => c.id === id);
  document.body.classList.remove('nav-open');
  $('channel-title').textContent = '# ' + state.channel.name;
  $('text').placeholder = `Enviar mensagem em #${state.channel.name}`;
  renderChannels(); unsubscribe(); state.lastMsg = null;
  const box = $('messages'); box.replaceChildren();
  const { data, error } = await sb.from('messages').select('*').eq('channel_id', id).order('created_at', { ascending: false }).limit(100);
  if (error) return toast('Erro ao carregar mensagens.');
  const msgs = data.reverse();
  if (!msgs.length) box.append(el('div', 'empty', `Este é o começo de #${state.channel.name}. Diga oi!`));
  for (const m of msgs) await addMessage(m);
  box.scrollTop = box.scrollHeight;

  state.sub = sb.channel('msgs-' + id)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `channel_id=eq.${id}` }, async (p) => {
      if (document.getElementById('m-' + p.new.id)) return;
      box.querySelector('.empty')?.remove();
      const stick = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
      await addMessage(p.new); if (stick) box.scrollTop = box.scrollHeight;
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, (p) => {
      document.getElementById('m-' + p.old.id)?.remove();
    })
    .subscribe();
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
      del.onclick = async () => { const { error } = await sb.from('messages').delete().eq('id', m.id); if (error) toast('Não foi possível apagar.'); else row.remove(); };
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
  if (!state.channel) return;
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
    const { error } = await sb.from('messages').insert({ channel_id: state.channel.id, user_id: state.user.id, content, image_path });
    if (error) throw error;
    $('text').value = ''; state.pendingFile = null; $('preview').hidden = true;
  } catch (err) { toast('Não foi possível enviar.'); }
  finally { if (btn) btn.disabled = false; $('text').focus(); }
});

/* ---------- voz (WebRTC P2P, sinalização via Supabase Realtime) ---------- */
const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] };
const voice = { id: null, name: '', stream: null, muted: false, peers: new Map(), pending: new Map(), obs: new Map(), ctx: null, meters: new Map(), timer: null };

function voiceUsers(cid) {
  const o = voice.obs.get(cid); if (!o) return [];
  return Object.entries(o.ch.presenceState()).map(([uid, arr]) => ({ uid, ...(arr[arr.length - 1] || {}) }));
}

function renderVoiceUsers(cid) {
  const box = el('div', 'vusers');
  for (const u of voiceUsers(cid)) {
    const row = el('div', 'vuser'); row.dataset.vuid = u.uid;
    row.append(avatar(u.name || 'Usuário'), el('span', null, (u.name || 'Usuário') + (u.muted ? ' 🔇' : '')));
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
    const ch = sb.channel('voice-' + c.id, { config: { private: true, presence: { key: state.user.id }, broadcast: { self: false } } });
    ch.on('presence', { event: 'sync' }, () => { if (state.server) renderChannels(); })
      .on('presence', { event: 'join' }, ({ key }) => { if (voice.id === c.id && key !== state.user.id) { closePeer(key); maybeOffer(key); } })
      .on('presence', { event: 'leave' }, ({ key }) => { if (voice.id === c.id) closePeer(key); })
      .on('broadcast', { event: 'signal' }, ({ payload }) => { if (voice.id === c.id) onSignal(payload); })
      .subscribe();
    voice.obs.set(c.id, { ch });
  }
}

async function joinVoice(c) {
  if (voice.id === c.id) return;
  if (voice.id) await leaveVoice();
  if (!navigator.mediaDevices?.getUserMedia) return toast('Seu navegador não permite microfone aqui (precisa de HTTPS).');
  try {
    voice.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
  } catch { return toast('Permita o acesso ao microfone para entrar na voz.'); }
  voice.id = c.id; voice.name = c.name; voice.muted = false;
  voice.ctx = voice.ctx || new (window.AudioContext || window.webkitAudioContext)();
  voice.ctx.resume();
  watchMeter(state.user.id, voice.stream);
  voice.timer = setInterval(tickMeters, 120);
  $('voice-bar').hidden = false; $('voice-name').textContent = c.name; setMuteUI();
  const ch = voice.obs.get(c.id)?.ch; if (!ch) { await leaveVoice(); return toast('Canal de voz indisponível.'); }
  await ch.track({ name: state.profile?.username || 'Usuário', muted: false });
  for (const u of voiceUsers(c.id)) if (u.uid !== state.user.id) maybeOffer(u.uid);
  renderChannels();
}

async function leaveVoice() {
  const cid = voice.id; if (!cid) return;
  const ch = voice.obs.get(cid)?.ch;
  voice.id = null;
  for (const uid of [...voice.peers.keys()]) closePeer(uid);
  clearInterval(voice.timer); voice.timer = null;
  for (const m of voice.meters.values()) m.src.disconnect(); voice.meters.clear();
  voice.stream?.getTracks().forEach((t) => t.stop()); voice.stream = null;
  $('voice-bar').hidden = true; $('audio-sink').replaceChildren();
  try { await ch?.untrack(); } catch { /* já desconectado */ }
  if (state.server && !state.channels.some((x) => x.id === cid)) { const o = voice.obs.get(cid); if (o) { sb.removeChannel(o.ch); voice.obs.delete(cid); } }
  if (state.server) renderChannels();
}

function setMuteUI() {
  const b = $('mute-btn'); b.setAttribute('aria-pressed', String(voice.muted));
  b.textContent = voice.muted ? '🔇' : '🎤'; b.title = voice.muted ? 'Ativar microfone' : 'Silenciar microfone';
  b.setAttribute('aria-label', b.title);
}
$('mute-btn').onclick = async () => {
  if (!voice.stream) return;
  voice.muted = !voice.muted; voice.stream.getAudioTracks().forEach((t) => (t.enabled = !voice.muted)); setMuteUI();
  await voice.obs.get(voice.id)?.ch.track({ name: state.profile?.username || 'Usuário', muted: voice.muted });
};
$('leave-voice').onclick = leaveVoice;
window.addEventListener('pagehide', () => { voice.stream?.getTracks().forEach((t) => t.stop()); });

function send(to, type, data) {
  voice.obs.get(voice.id)?.ch.send({ type: 'broadcast', event: 'signal', payload: { from: state.user.id, to, type, data } });
}

function makePeer(uid) {
  closePeer(uid);
  const pc = new RTCPeerConnection(ICE);
  voice.stream.getTracks().forEach((t) => pc.addTrack(t, voice.stream));
  pc.onicecandidate = (e) => { if (e.candidate) send(uid, 'ice', e.candidate.toJSON()); };
  pc.ontrack = (e) => attachRemote(uid, e.streams[0]);
  pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') { toast('Falha de conexão de voz com um amigo.'); } };
  voice.peers.set(uid, pc); voice.pending.set(uid, []);
  return pc;
}

function closePeer(uid) {
  voice.peers.get(uid)?.close(); voice.peers.delete(uid); voice.pending.delete(uid);
  document.getElementById('a-' + uid)?.remove();
  const m = voice.meters.get(uid); if (m) { m.src.disconnect(); voice.meters.delete(uid); }
}

async function maybeOffer(uid) {
  // só um lado oferece (o de menor id) para não haver conflito de ofertas
  if (!voice.id || !voice.stream || state.user.id >= uid) return;
  const pc = makePeer(uid);
  await pc.setLocalDescription(await pc.createOffer());
  send(uid, 'offer', pc.localDescription.toJSON());
}

async function onSignal({ from, to, type, data }) {
  if (!voice.id || to !== state.user.id) return;
  try {
    if (type === 'offer') {
      const pc = makePeer(from);
      await pc.setRemoteDescription(data); await flushIce(from);
      await pc.setLocalDescription(await pc.createAnswer());
      send(from, 'answer', pc.localDescription.toJSON());
    } else if (type === 'answer') {
      const pc = voice.peers.get(from); if (!pc) return;
      await pc.setRemoteDescription(data); await flushIce(from);
    } else if (type === 'ice') {
      const pc = voice.peers.get(from); if (!pc) return;
      if (pc.remoteDescription) await pc.addIceCandidate(data); else voice.pending.get(from)?.push(data);
    }
  } catch (err) { console.warn('voz:', err); }
}
async function flushIce(uid) {
  const pc = voice.peers.get(uid), q = voice.pending.get(uid) || [];
  for (const c of q.splice(0)) { try { await pc.addIceCandidate(c); } catch { /* candidato antigo */ } }
}

function attachRemote(uid, stream) {
  let a = document.getElementById('a-' + uid);
  if (!a) { a = document.createElement('audio'); a.id = 'a-' + uid; a.autoplay = true; a.setAttribute('playsinline', ''); $('audio-sink').append(a); }
  a.srcObject = stream; a.play?.().catch(() => {});
  watchMeter(uid, stream);
}

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
