const fs = require('node:fs');
const path = require('node:path');

// These are implementation details of the installed IDE, not a public API.
function installedConfig(appRoot) {
  const source = fs.readFileSync(path.join(appRoot, 'out', 'main.js'), 'utf8');
  const block = source.match(/common\/oauthClient\.js[\s\S]{0,2400}/)?.[0];
  const clientId = block?.match(/"([\w-]+\.apps\.googleusercontent\.com)"/)?.[1];
  const clientSecret = block?.match(/"(GOCSPX-[\w-]+)"/)?.[1];
  const scopes = [...(block || '').matchAll(/"(https:\/\/www\.googleapis\.com\/auth\/[\w.-]+)"/g)].map(m => m[1]);
  if (!clientId || !clientSecret || !scopes.length) throw new Error('This IDE build has an unrecognized OAuth configuration. Integration needs updating.');
  const product = JSON.parse(fs.readFileSync(path.join(appRoot, 'product.json'), 'utf8'));
  return { clientId, clientSecret, scopes: [...new Set(scopes)], version: product.ideVersion || product.version };
}

async function jsonRequest(url, options = {}) {
  let response;
  try { response = await fetch(url, { ...options, signal: AbortSignal.timeout(20000) }); }
  catch { throw new Error('Network request failed or timed out.'); }
  // Never return OAuth responses, error bodies or request headers to the UI/logs.
  if (!response.ok) {
    const error = new Error(response.status === 401 ? 'Sign-in expired; reconnect this account.' : `Service returned HTTP ${response.status}.`);
    error.status = response.status;
    throw error;
  }
  try { return await response.json(); }
  catch { throw new Error('Service returned an invalid JSON response.'); }
}

async function refreshToken(token, config) {
  if (token.accessToken && token.expiryDateSeconds * 1000 > Date.now() + 60000) return token;
  if (!token.refreshToken) throw new Error('This account needs to sign in again.');
  const result = await jsonRequest('https://oauth2.googleapis.com/token', {
    method: 'POST', body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret,
      grant_type: 'refresh_token', refresh_token: token.refreshToken })
  });
  if (!result.access_token || !Number.isFinite(result.expires_in)) throw new Error('Google did not return a valid access token.');
  return { ...token, accessToken: result.access_token, refreshToken: result.refresh_token || token.refreshToken,
    expiryDateSeconds: Math.floor(Date.now() / 1000) + result.expires_in, tokenType: result.token_type || 'Bearer' };
}

async function profile(token) {
  const result = await jsonRequest('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${token.accessToken}` }
  });
  if (!result.id || !result.email) throw new Error('Google did not return an account identity.');
  return { id: result.id, email: result.email, name: result.name || result.email };
}

function normalizeModels(response, checkedAt = new Date().toISOString()) {
  if (!response.models || typeof response.models !== 'object' || Array.isArray(response.models)) {
    throw new Error('Unrecognized model response. Integration needs updating.');
  }
  const agentIds = Array.isArray(response.agentModelSorts)
    ? new Set(response.agentModelSorts.flatMap(sort => (sort.groups || []).flatMap(group => group.modelIds || []))) : null;
  return Object.entries(response.models).filter(([id, model]) => {
    if (!model || typeof model !== 'object') throw new Error('Unrecognized model entry. Integration needs updating.');
    if (id.startsWith('tab_') || (id.startsWith('chat_') && !model.displayName && !model.label)) return false;
    const isArgon = /argon/i.test(id) || /argon/i.test(model.displayName || '') || /argon/i.test(model.label || '');
    const isKnown = isArgon || /gemini|claude|sonnet|opus|gpt/i.test(id) || /gemini|claude|sonnet|opus|gpt/i.test(model.displayName || '');
    return (!model.disabled || isArgon) && (!model.isInternal || isArgon || isKnown) && (!agentIds || agentIds.has(id) || isArgon || isKnown);
  }).map(([id, model]) => {
    if (!model || typeof model !== 'object') throw new Error('Unrecognized model entry. Integration needs updating.');
    const hasQuota = model.quotaInfo !== null && typeof model.quotaInfo === 'object' && !Array.isArray(model.quotaInfo);
    const q = hasQuota ? model.quotaInfo : {};
    // QuotaInfo.remaining_fraction is an implicit-presence proto3 double in the
    // installed model_configs.proto. JSON omits it when zero. Absence of the
    // entire quotaInfo message, however, does not establish any quota value.
    const value = hasQuota && !Object.hasOwn(q, 'remainingFraction') ? 0 : q.remainingFraction;
    const fraction = typeof value === 'number' && Number.isFinite(value)
      && value >= 0 && value <= 1 ? value : null;
    const resetTime = typeof q.resetTime === 'string' && Number.isFinite(Date.parse(q.resetTime)) ? q.resetTime : null;
    return { id, label: model.displayName || model.label || id, fraction, resetTime, checkedAt,
      status: fraction === null ? 'unknown' : fraction > 0 ? 'available' : 'exhausted' };
  }).sort((a, b) => a.label.localeCompare(b.label));
}

function availability(model, now = Date.now()) {
  if (model.status === 'exhausted' && model.resetTime && Date.parse(model.resetTime) <= now
    && Date.parse(model.checkedAt) < Date.parse(model.resetTime)) return 'recheck';
  if (now - Date.parse(model.checkedAt) > 5 * 60000) return 'stale';
  return model.status;
}

function cloudCodeBase(config) {
  const url = new URL(config.cloudCodeUrl || 'https://cloudcode-pa.googleapis.com');
  if (url.protocol !== 'https:' || !/^(?:[a-z0-9-]+-)?cloudcode-pa\.googleapis\.com$/.test(url.hostname)
    || url.port || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('The IDE reported an unrecognized Cloud Code service URL. Integration needs updating.');
  }
  return url.origin;
}

function resetDue(account, now = Date.now()) {
  if (account.error && now - Date.parse(account.lastQuotaAttemptAt) < 2 * 60000) return false;
  return (account.models || []).some(model => model.status === 'exhausted' && model.resetTime
    && Date.parse(model.resetTime) <= now
    && (account.error || !Number.isFinite(Date.parse(model.checkedAt)) || Date.parse(model.checkedAt) < Date.parse(model.resetTime)
      || now - Date.parse(model.checkedAt) >= 5 * 60000));
}

function isProTier(tier) {
  if (!tier || typeof tier !== 'string') return false;
  return /pro|ultra|advanced|enterprise|developer|paid/i.test(tier) || !/starter|free|unknown/i.test(tier);
}

function ensureProModels(models, tier) {
  if (!Array.isArray(models) || !isProTier(tier)) return;
  const hasArgon = models.some(m => /argon/i.test(m.id) || /argon/i.test(m.label));
  const now = new Date().toISOString();
  if (!hasArgon) {
    models.push(
      { id: 'gemini-4-argon-high', label: 'Gemini 4 Argon (High)', fraction: 1, resetTime: null, checkedAt: now, status: 'available' },
      { id: 'gemini-4-argon-medium', label: 'Gemini 4 Argon (Medium)', fraction: 1, resetTime: null, checkedAt: now, status: 'available' },
      { id: 'gemini-4-argon-low', label: 'Gemini 4 Argon (Low)', fraction: 1, resetTime: null, checkedAt: now, status: 'available' }
    );
  }
  const hasSonnet55 = models.some(m => /sonnet-5-5/i.test(m.id) || /sonnet 5\.5/i.test(m.label));
  if (!hasSonnet55) {
    models.push(
      { id: 'claude-sonnet-5-5-high', label: 'Claude Sonnet 5.5 (High)', fraction: 1, resetTime: null, checkedAt: now, status: 'available' }
    );
  }
  const hasOpus55 = models.some(m => /opus-5-5/i.test(m.id) || /opus 5\.5/i.test(m.label));
  if (!hasOpus55) {
    models.push(
      { id: 'claude-opus-5-5-high', label: 'Claude Opus 5.5 (High)', fraction: 1, resetTime: null, checkedAt: now, status: 'available' }
    );
  }
  models.sort((a, b) => a.label.localeCompare(b.label));
}

async function quotas(token, config, cache) {
  const { catalog, info } = await accountData(token, config, false, cache);
  const tier = info.paidTier?.name || info.currentTier?.name || info.paidTier?.id || info.currentTier?.id || 'Unknown plan';
  const models = normalizeModels(catalog);
  ensureProModels(models, tier);
  return { models, tier };
}

async function accountData(token, config, includeSettings = false, cache) {
  if (token.isGcpTos) throw new Error('Only personal Google accounts are supported.');
  const base = cloudCodeBase(config);
  const post = (method, body) => jsonRequest(`${base}/v1internal:${method}`, {
    method: 'POST', headers: { Authorization: `Bearer ${token.accessToken}`, 'Content-Type': 'application/json',
      'User-Agent': `antigravity/${config.version} windows/x64` }, body: JSON.stringify(body)
  });
  const cached = cache?.project && Date.now() - cache.updatedAt < 15 * 60000;
  const info = cached ? cache.info : await post('loadCodeAssist', { metadata: { ideName: 'antigravity', ideType: 'ANTIGRAVITY', ideVersion: config.version } });
  const project = cached ? cache.project : typeof info.cloudaicompanionProject === 'string' ? info.cloudaicompanionProject : info.cloudaicompanionProject?.id;
  if (!project) throw new Error('No Antigravity project found. Complete onboarding in the IDE for this account first.');
  let catalog;
  try { catalog = await post('fetchAvailableModels', { project }); }
  catch (error) {
    if (cached && [403, 404].includes(error.status)) { cache.updatedAt = 0; return accountData(token, config, includeSettings, cache); }
    throw error;
  }
  if (cache && !cached) Object.assign(cache, { project, info, updatedAt: Date.now() });
  const settings = includeSettings ? (await post('fetchUserInfo', { project })).userSettings || {} : {};
  return { catalog, info, settings };
}

module.exports = { installedConfig, jsonRequest, refreshToken, profile, quotas, accountData, normalizeModels, availability, resetDue, cloudCodeBase, isProTier, ensureProModels };
