const api = acquireVsCodeApi();
let state = { accounts: [], busy: false, activeId: null, monitor: {} };
const el = id => document.getElementById(id);

function send(type, id) { api.postMessage({ type, id }); }

for (const answer of ['switch', 'later', 'stop']) {
  const btn = el(`offer-${answer}`);
  if (btn) {
    btn.onclick = () => {
      if (state.pendingOffer) api.postMessage({ type: 'monitorAnswer', id: state.pendingOffer.id, answer });
    };
  }
}

const preferences = api.getState() || { collapsed: {}, query: '', available: false, autoSwitch: true, autoResume: true };
preferences.collapsed ||= {};
if (el('model')) el('model').value = preferences.query || '';
if (el('available')) el('available').checked = !!preferences.available;
if (el('auto-switch-enabled')) el('auto-switch-enabled').checked = preferences.autoSwitch !== false;
if (el('auto-resume-enabled')) el('auto-resume-enabled').checked = preferences.autoResume !== false;

for (const name of ['login', 'import', 'chromeImport', 'refresh', 'restore']) {
  const btn = el(name);
  if (btn) btn.onclick = () => send(name);
}
if (el('github-link')) el('github-link').onclick = () => send('github');
if (el('github-footer')) el('github-footer').onclick = () => send('github');

function filter() {
  preferences.query = el('model')?.value || '';
  preferences.available = el('available')?.checked || false;
  preferences.selectedModel = el('selected-model')?.value || '';
  preferences.autoSwitch = el('auto-switch-enabled')?.checked ?? true;
  preferences.autoResume = el('auto-resume-enabled')?.checked ?? true;
  api.setState(preferences);
  render();
}

if (el('model')) el('model').oninput = filter;
if (el('available')) el('available').onchange = filter;

function syncMonitor() {
  const modelId = el('selected-model')?.value || '';
  const enabled = !!el('monitor-enabled')?.checked;
  const autoSwitch = !!el('auto-switch-enabled')?.checked;
  const autoResume = !!el('auto-resume-enabled')?.checked;
  api.postMessage({ type: 'monitor', enabled, modelId, autoSwitch, autoResume });
}

if (el('selected-model')) {
  el('selected-model').onchange = () => {
    filter();
    if (state.monitor?.enabled) syncMonitor();
  };
}
if (el('monitor-enabled')) el('monitor-enabled').onchange = syncMonitor;
if (el('auto-switch-enabled')) el('auto-switch-enabled').onchange = () => { filter(); syncMonitor(); };
if (el('auto-resume-enabled')) el('auto-resume-enabled').onchange = () => { filter(); syncMonitor(); };

function node(tag, text, className) {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (className) e.className = className;
  return e;
}

function button(label, action, id) {
  const b = node('button', label);
  b.disabled = state.busy;
  b.onclick = () => send(action, id);
  return b;
}

function chevron() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 12 12');
  svg.setAttribute('class', 'chevron');
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(svg.namespaceURI, 'path');
  p.setAttribute('d', 'm4 2 4 4-4 4');
  svg.append(p);
  return svg;
}

function resetLabel(time, status) {
  if (!time) return 'Reset not reported';
  const delta = Date.parse(time) - Date.now();
  if (delta <= 0) return status === 'exhausted' ? 'Reset time passed · still exhausted' : 'Reset due · recheck';
  const minutes = Math.ceil(delta / 60000), hours = Math.floor(minutes / 60), days = Math.floor(hours / 24);
  return `Resets in ${days ? `${days}d ${hours % 24}h` : hours ? `${hours}h ${minutes % 60}m` : `${minutes}m`}`;
}

function providerIcon(id) {
  const provider = /claude/i.test(id) ? 'claude' : /gemini|google|argon/i.test(id) ? 'google' : /gpt|openai/i.test(id) ? 'openai' : 'model';
  const circle = node('span', undefined, `provider-icon ${provider}`);
  const img = node('img');
  img.src = new URL(`${provider}.svg`, document.querySelector('script[src]').src).toString();
  img.alt = '';
  img.setAttribute('aria-hidden', 'true');
  circle.append(img);
  return circle;
}

function render() {
  const catalog = new Map();
  let totalReadyQuota = 0;
  for (const a of state.accounts) {
    for (const m of a.models || []) {
      catalog.set(m.id, m.label);
      if (m.fraction && m.fraction > 0) totalReadyQuota++;
    }
  }

  // Populate selected model dropdown
  const select = el('selected-model');
  if (select) {
    select.replaceChildren();
    const all = node('option', 'Select model to monitor…');
    all.value = '';
    select.append(all);
    for (const [id, label] of [...catalog].sort((a, b) => a[1].localeCompare(b[1]))) {
      const option = node('option', label);
      option.value = id;
      select.append(option);
    }
    select.value = catalog.has(preferences.selectedModel) ? preferences.selectedModel : '';
  }
  const selected = select?.value || '';

  // Stats Grid
  if (el('count')) el('count').textContent = state.accounts.length;
  if (el('stat-ready')) el('stat-ready').textContent = totalReadyQuota;
  if (el('stat-autopilot')) {
    const isAuto = state.monitor?.enabled && state.monitor?.autoSwitch;
    el('stat-autopilot').textContent = isAuto ? 'ACTIVE' : (state.monitor?.enabled ? 'MANUAL' : 'OFF');
    el('stat-autopilot').className = isAuto ? 'stat-value text-accent' : (state.monitor?.enabled ? 'stat-value text-amber' : 'stat-value');
  }

  // Auto-Pilot Controls
  if (el('monitor-enabled')) {
    el('monitor-enabled').checked = !!state.monitor?.enabled;
    el('monitor-enabled').disabled = !selected && !state.monitor?.enabled;
  }
  if (el('auto-switch-enabled')) {
    el('auto-switch-enabled').checked = state.monitor?.autoSwitch !== false;
  }
  if (el('auto-resume-enabled')) {
    el('auto-resume-enabled').checked = state.monitor?.autoResume !== false;
  }

  const monitoredLabel = catalog.get(state.monitor?.modelId) || state.monitor?.modelId;
  if (el('monitor-status')) {
    if (state.monitor?.enabled) {
      el('monitor-status').textContent = `${monitoredLabel} · ${state.monitor.status || 'Active'}`;
    } else {
      el('monitor-status').textContent = selected ? 'Ready to activate. Checks every 20s.' : 'Select a target model above.';
    }
  }

  if (el('switch-offer')) el('switch-offer').hidden = !state.pendingOffer;
  if (el('offer-text')) {
    el('offer-text').textContent = state.pendingOffer ? `${state.pendingOffer.model} exhausted on ${state.pendingOffer.from}. Switch to ${state.pendingOffer.to}?` : '';
  }

  // Model breakdown
  const result = el('model-result');
  if (result) {
    result.hidden = !selected;
    result.replaceChildren();
    if (selected && typeof AccountReadiness !== 'undefined') {
      const groups = AccountReadiness.selectedAvailability(state.accounts, selected);
      result.append(node('div', `${groups.ready.length} ready · ${groups.waiting.length} waiting · ${groups.check.length} need refresh`, 'model-total'));
    }
  }

  if (el('notice')) {
    el('notice').textContent = state.notice || '';
    el('notice').hidden = !state.notice;
  }
  if (el('activity')) {
    el('activity').innerHTML = state.busy ? '<span class="pulse-dot"></span> Syncing…' : '<span class="pulse-dot"></span> Online';
  }

  for (const name of ['login', 'import', 'chromeImport', 'refresh', 'restore']) {
    if (el(name)) el(name).disabled = state.busy;
  }
  if (el('empty')) el('empty').hidden = state.accounts.length > 0;

  const accountsContainer = el('accounts');
  if (!accountsContainer) return;
  accountsContainer.replaceChildren();

  const query = (el('model')?.value || '').toLowerCase().trim();
  let visible = 0;

  for (const a of state.accounts) {
    const accountMatch = `${a.email} ${a.name}`.toLowerCase().includes(query);
    const models = (a.models || []).filter(m => {
      const matchSearch = accountMatch || `${m.label} ${m.id}`.toLowerCase().includes(query);
      const isAvail = typeof AccountReadiness !== 'undefined' ? AccountReadiness.modelState(a, m) === 'available' : m.fraction > 0;
      return matchSearch && (!el('available')?.checked || isAvail);
    });

    if (selected && !models.some(m => m.id === selected)) continue;
    if (!models.length && (query || el('available')?.checked) && !(accountMatch && !el('available')?.checked)) continue;
    visible++;

    const card = node('details', undefined, 'account');
    if (state.activeId === a.id) card.setAttribute('data-active', 'true');
    card.open = query ? true : preferences.collapsed[a.id] === false;
    card.addEventListener('toggle', () => {
      if (!card.isConnected || query) return;
      preferences.collapsed[a.id] = !card.open;
      api.setState(preferences);
    });

    const heading = node('summary');
    const identity = node('div', undefined, 'identity');
    const email = node('div', a.email, 'email');
    email.title = a.email;
    const meta = node('div', undefined, 'meta');
    meta.append(node('span', a.tier || 'Standard Plan'));
    if (state.activeId === a.id) meta.append(node('span', '● ACTIVE SESSION', 'active-pill'));
    if (a.checkedAt) {
      const checked = node('span', `· ${new Date(a.checkedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
      checked.title = `Last checked: ${new Date(a.checkedAt).toLocaleString()}`;
      meta.append(checked);
    }
    identity.append(email, meta);

    const summary = typeof AccountReadiness !== 'undefined' ? AccountReadiness.summarize(a) : { label: `${models.length} models`, ready: 1 };
    const badge = node('span', summary.label, summary.ready ? 'available-count' : 'subtle');
    badge.title = summary.detail || '';

    heading.append(chevron(), node('span', (a.name || a.email).slice(0, 2).toUpperCase(), 'avatar'), identity, badge);
    card.append(heading);

    const actions = node('div', undefined, 'account-actions');
    const remove = button('Remove', 'remove', a.id);
    remove.className = 'remove';
    const switchButton = button(state.activeId === a.id ? 'Active Session' : '⚡ Switch to this', 'switch', a.id);
    switchButton.className = state.activeId === a.id ? 'btn-ghost-sm' : 'btn-switch';
    switchButton.disabled = state.busy || state.activeId === a.id;
    actions.append(switchButton, button('Sync', 'refresh', a.id), remove);
    card.append(actions);

    if (a.error) card.append(node('p', a.error, 'notice-banner'));

    if (models.length) {
      const list = node('div', undefined, 'models');
      for (const m of models) {
        const status = typeof AccountReadiness !== 'undefined' ? AccountReadiness.modelState(a, m) : 'available';
        const row = node('div', undefined, `model-row ${status}`);
        const top = node('div', undefined, 'model-title');
        const label = node('span', m.label, 'model-label');
        label.title = m.id;
        const percent = node('span', m.fraction === null ? '—' : `${Math.round(m.fraction * 100)}%`, 'percent');
        top.append(providerIcon(m.id), label, percent);

        const bottom = node('div', undefined, 'model-meta');
        const names = { available: 'Ready', exhausted: 'Depleted', stale: 'Stale', recheck: 'Recheck', unknown: 'Unknown' };
        const reset = node('span', m.fraction === 1 ? 'Full Quota' : resetLabel(m.resetTime, status), 'reset');
        if (m.resetTime && m.fraction !== 1) reset.title = new Date(m.resetTime).toLocaleString();
        bottom.append(node('span', names[status] || 'Unknown', `status-pill ${status}`), reset);
        row.append(top, bottom);

        if (m.fraction !== null) {
          const p = node('progress');
          p.max = 1;
          p.value = m.fraction;
          p.setAttribute('aria-label', `${m.label}: ${Math.round(m.fraction * 100)}% remaining`);
          row.append(p);
        }
        list.append(row);
      }
      card.append(list);
    } else {
      card.append(node('div', 'No quota cached. Click Sync to check.', 'empty-state-compact'));
    }

    accountsContainer.append(card);
  }

  if (el('no-results')) el('no-results').hidden = !state.accounts.length || visible > 0;
}

let receivedInitialState = false;
window.addEventListener('message', ({ data }) => {
  if (data.type === 'state') {
    if (!receivedInitialState && data.monitor?.enabled) preferences.selectedModel = data.monitor.modelId;
    receivedInitialState = true;
    state = data;
    render();
  }
});
send('ready');
