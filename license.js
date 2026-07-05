/**
 * git city — licensing.
 *
 * One-time personal license, validated against the Lemon Squeezy license API
 * (no backend of our own). Activation state lives in ~/.gitcity/license.json.
 *
 * A `.gitcity-dev` marker file next to this module unlocks a working copy for
 * development. It is NOT shipped in the npm package (see package.json "files").
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const DIR = path.join(os.homedir(), '.gitcity');
const FILE = path.join(DIR, 'license.json');
const DEV_MARKER = path.join(__dirname, '.gitcity-dev');

// Filled in when the Lemon Squeezy store exists. STORE_ID pins keys to our store.
const BUY_URL = 'https://gitcity.lemonsqueezy.com';   // placeholder until the store is live
const STORE_ID = null;

function readState() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return null; }
}

function isLicensed() {
  if (fs.existsSync(DEV_MARKER)) return true;
  const s = readState();
  return !!(s && s.key && s.valid);
}

async function lsPost(endpoint, params) {
  const r = await fetch(`https://api.lemonsqueezy.com/v1/licenses/${endpoint}`, {
    method: 'POST',
    headers: { Accept: 'application/json' },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(10000),
  });
  return r.json();
}

async function activate(key) {
  key = String(key || '').trim();
  if (!key) return { ok: false, error: 'enter a license key' };
  try {
    const j = await lsPost('activate', { license_key: key, instance_name: os.hostname() });
    if (!j.activated) return { ok: false, error: j.error || 'invalid license key' };
    if (STORE_ID && j.meta && String(j.meta.store_id) !== String(STORE_ID)) {
      return { ok: false, error: 'this key belongs to a different product' };
    }
    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify({
      key,
      instanceId: j.instance && j.instance.id,
      activatedAt: new Date().toISOString(),
      valid: true,
    }, null, 2) + '\n');
    return { ok: true };
  } catch {
    return { ok: false, error: 'could not reach the license server — check your connection' };
  }
}

async function deactivate() {
  const s = readState();
  if (!s) return { ok: true };
  try {
    if (s.key && s.instanceId) {
      await lsPost('deactivate', { license_key: s.key, instance_id: s.instanceId });
    }
  } catch { /* best effort */ }
  fs.rmSync(FILE, { force: true });
  return { ok: true };
}

module.exports = { isLicensed, activate, deactivate, readState, BUY_URL };
