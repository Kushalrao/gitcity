#!/usr/bin/env node
/**
 * git city — your codebase as a living cartoon city.
 *
 *   gitcity [dir]              watch a repo (defaults to the current directory)
 *   gitcity activate <key>     unlock with your license key
 *   gitcity deactivate         release this machine's activation
 *   gitcity status             license + install status
 *   gitcity install-hooks      auto-start with every Claude Code session
 *   gitcity uninstall-hooks    remove the Claude Code integration
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const license = require('./license.js');

const HOME = os.homedir();
const RUNTIME = path.join(HOME, '.gitcity', 'runtime');
const SETTINGS = path.join(HOME, '.claude', 'settings.json');
const args = process.argv.slice(2);
const cmd = args[0];

function openBrowser(url) {
  const opener = process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'cmd'
    : 'xdg-open';
  const a = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  execFile(opener, a, () => {});
}

function start() {
  const dir = args.find(a => !a.startsWith('-'));
  const pi = args.indexOf('--port');
  if (pi >= 0 && args[pi + 1]) process.env.PORT = args[pi + 1];
  process.argv[2] = path.resolve(dir || process.cwd());
  require('./server.js');
  if (!args.includes('--no-open')) {
    setTimeout(() => openBrowser(`http://localhost:${process.env.PORT || 4517}`), 500);
  }
  if (!license.isLicensed()) {
    console.log('\nunlicensed — the city will show its gate.');
    console.log(`buy a key:  ${license.BUY_URL}`);
    console.log('then run:   gitcity activate <KEY>\n');
  }
}

function loadSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS, 'utf8')); } catch { return {}; }
}

function copyRuntime() {
  fs.mkdirSync(path.join(RUNTIME, 'public'), { recursive: true });
  for (const f of ['server.js', 'hook.js', 'autostart.js', 'license.js']) {
    fs.copyFileSync(path.join(__dirname, f), path.join(RUNTIME, f));
  }
  fs.copyFileSync(path.join(__dirname, 'public', 'index.html'), path.join(RUNTIME, 'public', 'index.html'));
}

function installHooks() {
  copyRuntime();
  const s = loadSettings();
  if (fs.existsSync(SETTINGS)) fs.copyFileSync(SETTINGS, SETTINGS + '.gitcity-backup');
  s.hooks = s.hooks || {};
  const mentions = (arr, file) => (arr || []).some(m =>
    (m.hooks || []).some(h => (h.command || '').includes(path.join('.gitcity', 'runtime', file))));
  s.hooks.SessionStart = s.hooks.SessionStart || [];
  if (!mentions(s.hooks.SessionStart, 'autostart.js')) {
    s.hooks.SessionStart.push({
      hooks: [{ type: 'command', command: `node ${path.join(RUNTIME, 'autostart.js')}`, timeout: 10, async: true }],
    });
  }
  s.hooks.PreToolUse = s.hooks.PreToolUse || [];
  if (!mentions(s.hooks.PreToolUse, 'hook.js')) {
    s.hooks.PreToolUse.push({
      matcher: 'Edit|Write|MultiEdit|NotebookEdit|Read',
      hooks: [{ type: 'command', command: `node ${path.join(RUNTIME, 'hook.js')}`, timeout: 5, async: true }],
    });
  }
  fs.mkdirSync(path.dirname(SETTINGS), { recursive: true });
  fs.writeFileSync(SETTINGS, JSON.stringify(s, null, 2) + '\n');
  console.log('git city hooks installed.');
  console.log('every new Claude Code session now starts the city for its project.');
  console.log(`(settings backed up to ${SETTINGS}.gitcity-backup — remove with: gitcity uninstall-hooks)`);
}

function uninstallHooks() {
  const s = loadSettings();
  const strip = arr => (arr || []).filter(m =>
    !(m.hooks || []).some(h => (h.command || '').includes('.gitcity')));
  if (s.hooks) {
    for (const k of ['SessionStart', 'PreToolUse']) {
      s.hooks[k] = strip(s.hooks[k]);
      if (!s.hooks[k].length) delete s.hooks[k];
    }
    if (!Object.keys(s.hooks).length) delete s.hooks;
  }
  fs.writeFileSync(SETTINGS, JSON.stringify(s, null, 2) + '\n');
  fs.rmSync(RUNTIME, { recursive: true, force: true });
  console.log('git city hooks removed.');
}

(async () => {
  switch (cmd) {
    case 'activate': {
      const r = await license.activate(args[1]);
      if (r.ok) console.log('✓ license activated — welcome to git city.');
      else { console.error(`✗ ${r.error}`); process.exit(1); }
      break;
    }
    case 'deactivate':
      await license.deactivate();
      console.log('license released on this machine.');
      break;
    case 'status': {
      const st = license.readState();
      console.log(`licensed:  ${license.isLicensed() ? 'yes' : 'no'}`);
      if (st) console.log(`activated: ${st.activatedAt}`);
      console.log(`hooks:     ${fs.existsSync(RUNTIME) ? 'installed' : 'not installed'}`);
      if (!license.isLicensed()) console.log(`buy a key: ${license.BUY_URL}`);
      break;
    }
    case 'install-hooks': installHooks(); break;
    case 'uninstall-hooks': uninstallHooks(); break;
    case 'help': case '--help': case '-h':
      console.log(require('fs').readFileSync(__filename, 'utf8').split('*/')[0].split('\n').slice(2, 10).map(l => l.replace(/^ \* ?/, '')).join('\n'));
      break;
    default: start();
  }
})();
