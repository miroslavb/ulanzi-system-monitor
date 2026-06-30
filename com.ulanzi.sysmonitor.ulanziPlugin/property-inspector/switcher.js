// Property Inspector for the Host Switch action.
// A list of remote hosts (alias / agent URL / MDI icon) + an optional local
// "this PC" source, with an inline MDI icon picker (window.MDI_LITE). Settings
// are sent as a structured object so `hosts` arrives as a real array.

const MDI = (typeof window !== 'undefined' && window.MDI_LITE) || {};

let state = { includeLocal: true, localAlias: '', localIcon: 'monitor', theme: 'dark', hosts: [] };
let pickerTarget = null;   // 'local' | <host index>

function iconSvg(name, px) {
  px = px || 18;
  const d = MDI[name];
  if (!d) return `<span style="display:inline-block;width:${px}px;height:${px}px;border:1px dashed #6b6b6b;border-radius:3px"></span>`;
  return `<svg viewBox="0 0 24 24" width="${px}" height="${px}"><path d="${d}"></path></svg>`;
}

function refreshIconBtn(btn, name, withName) {
  if (!btn) return;
  btn.title = name || 'pick icon';
  btn.innerHTML = iconSvg(name, 18) + (withName ? `<span class="ibname">${name || 'pick'}</span>` : '');
}

function currentIcon(target) {
  if (target === 'local') return state.localIcon;
  if (typeof target === 'number' && state.hosts[target]) return state.hosts[target].icon;
  return '';
}

// --- host rows ---------------------------------------------------------------
function makeRow(host, i) {
  const row = document.createElement('div');
  row.className = 'hostrow';

  const alias = document.createElement('input');
  alias.type = 'text'; alias.placeholder = 'alias'; alias.value = host.alias || '';
  const url = document.createElement('input');
  url.type = 'text'; url.placeholder = 'http://100.x.y.z:9888'; url.value = host.url || '';
  const iconBtn = document.createElement('button');
  iconBtn.type = 'button'; iconBtn.className = 'iconbtn';
  refreshIconBtn(iconBtn, host.icon || 'server', false);   // glyph-only in rows
  const del = document.createElement('button');
  del.type = 'button'; del.className = 'h-del'; del.textContent = '✕'; del.title = 'Remove host';

  alias.addEventListener('input', () => { state.hosts[i].alias = alias.value; saveDebounced(); });
  url.addEventListener('input', () => { state.hosts[i].url = url.value; saveDebounced(); });
  iconBtn.addEventListener('click', () => openPicker(i));
  del.addEventListener('click', () => { state.hosts.splice(i, 1); renderHosts(); saveNow(); });

  row.append(alias, url, iconBtn, del);
  return row;
}

function renderHosts() {
  const list = document.querySelector('#hostlist');
  list.innerHTML = '';
  state.hosts.forEach((h, i) => list.appendChild(makeRow(h, i)));
}

// --- inline icon picker ------------------------------------------------------
function openPicker(target) {
  pickerTarget = target;
  const label = target === 'local'
    ? (state.localAlias || 'this PC')
    : ((state.hosts[target] && state.hosts[target].alias) || `host ${target + 1}`);
  document.querySelector('#iconpanel-title').textContent = `Icon for: ${label}`;
  const search = document.querySelector('#iconsearch');
  search.value = '';
  buildGrid('');
  const panel = document.querySelector('#iconpanel');
  panel.classList.remove('hidden');
  panel.scrollIntoView({ block: 'nearest' });
  search.focus();
}
function closePicker() {
  document.querySelector('#iconpanel').classList.add('hidden');
  pickerTarget = null;
}
function buildGrid(filter) {
  const grid = document.querySelector('#icongrid');
  grid.innerHTML = '';
  const f = (filter || '').toLowerCase().trim();
  const sel = currentIcon(pickerTarget);
  Object.keys(MDI).filter((n) => !f || n.includes(f)).forEach((name) => {
    const cell = document.createElement('div');
    cell.className = 'ic' + (name === sel ? ' sel' : '');
    cell.title = name;
    cell.innerHTML = iconSvg(name, 22);
    cell.addEventListener('click', () => chooseIcon(name));
    grid.appendChild(cell);
  });
}
function chooseIcon(name) {
  if (pickerTarget === 'local') {
    state.localIcon = name;
    refreshIconBtn(document.querySelector('#localIconBtn'), name, true);
  } else if (typeof pickerTarget === 'number') {
    if (state.hosts[pickerTarget]) state.hosts[pickerTarget].icon = name;
    renderHosts();
  }
  closePicker();
  saveNow();
}

// --- save / load -------------------------------------------------------------
function buildSettings() {
  return {
    includeLocal: !!document.querySelector('#includeLocal').checked,
    localAlias: (document.querySelector('#localAlias').value || '').trim(),
    localIcon: state.localIcon,
    theme: document.querySelector('#theme').value,
    hosts: state.hosts.map((h) => ({
      alias: (h.alias || '').trim(),
      url: (h.url || '').trim(),
      icon: h.icon || 'server',
    })),
  };
}
function saveNow() {
  const s = buildSettings();
  state.includeLocal = s.includeLocal;
  state.localAlias = s.localAlias;
  state.theme = s.theme;
  $UD.sendParamFromPlugin(s);
}
const saveDebounced = (typeof Utils !== 'undefined' && Utils.debounce) ? Utils.debounce(saveNow) : saveNow;

function load(p) {
  p = p || {};
  state.includeLocal = p.includeLocal === undefined
    ? true : !(p.includeLocal === false || p.includeLocal === 'false' || p.includeLocal === 'off');
  state.localAlias = p.localAlias || '';
  state.localIcon = p.localIcon || 'monitor';
  state.theme = p.theme === 'light' ? 'light' : 'dark';
  state.hosts = Array.isArray(p.hosts)
    ? p.hosts.map((h) => ({ alias: h.alias || '', url: h.url || '', icon: h.icon || 'server' }))
    : [];

  document.querySelector('#includeLocal').checked = state.includeLocal;
  document.querySelector('#localAlias').value = state.localAlias;
  document.querySelector('#theme').value = state.theme;
  refreshIconBtn(document.querySelector('#localIconBtn'), state.localIcon, true);
  renderHosts();
}

// --- wire up -----------------------------------------------------------------
$UD.connect();

$UD.onConnected(() => {
  document.querySelector('.uspi-wrapper').classList.remove('hidden');

  refreshIconBtn(document.querySelector('#localIconBtn'), state.localIcon, true);
  renderHosts();

  document.querySelector('#localIconBtn').addEventListener('click', () => openPicker('local'));
  document.querySelector('#addhost').addEventListener('click', () => {
    state.hosts.push({ alias: '', url: '', icon: 'server' });
    renderHosts();
  });
  document.querySelector('#includeLocal').addEventListener('change', saveNow);
  document.querySelector('#localAlias').addEventListener('input', saveDebounced);
  document.querySelector('#theme').addEventListener('change', saveNow);
  document.querySelector('#iconclose').addEventListener('click', closePicker);
  document.querySelector('#iconsearch').addEventListener('input', (e) => buildGrid(e.target.value));
});

$UD.onAdd((jsn) => { if (jsn && jsn.param) load(jsn.param); });
$UD.onParamFromApp((jsn) => { if (jsn && jsn.param) load(jsn.param); });
