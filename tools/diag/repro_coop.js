/* repro_coop.js — live co-op host-lag reproduction harness.
   Serves the repo over http, drives 3 headless Chromes (solo / host / client),
   instruments the per-frame functions, message counts, scene growth and
   console errors, and prints a comparison. Diagnostic only — not shipped. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = 8077;
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.glb': 'model/gltf-binary', '.json': 'application/json' };

function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      const p = decodeURIComponent(req.url.split('?')[0]);
      let file = path.join(ROOT, p === '/' ? 'index.html' : p);
      if (!file.startsWith(ROOT)) { rsp.writeHead(403); rsp.end(); return; }
      fs.readFile(file, (err, data) => {
        if (err) { rsp.writeHead(404); rsp.end(); return; }
        rsp.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
        rsp.end(data);
      });
    });
    srv.listen(PORT, '127.0.0.1', () => res(srv));
  });
}

const FLAGS = [
  '--mute-audio', '--autoplay-policy=no-user-gesture-required',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows', '--window-size=1280,720',
  '--use-angle=swiftshader',
];

async function newGamePage(label) {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: FLAGS });
  const page = (await browser.pages())[0];
  const log = { errors: [], pageerrors: [], lines: [] };
  page.on('console', m => {
    const t = `[${m.type()}] ${m.text()}`;
    log.lines.push(t);
    if (m.type() === 'error') log.errors.push(t);
  });
  page.on('pageerror', e => log.pageerrors.push(String(e && e.stack || e)));
  await page.goto(`http://127.0.0.1:${PORT}/index.html?dev=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('typeof modelsReady !== "undefined" && modelsReady === true', { timeout: 120000 });
  console.log(`${label}: page loaded, models ready`);
  return { browser, page, log, label };
}

// Wrap every per-frame global + renderer.render + send/dispatch counters.
const INSTRUMENT = `(() => {
  window.__prof = { frames: 0, render: 0 };
  const NAMES = ['updatePlayer','updateEnemies','updateBoss','updateBossProjectiles','updateAntiLinger',
    'updateScareTriggers','updateMinimap','updateScareEffects','updateLights','updateHUDTimers','updateAmbient',
    'updateWaterFX','updateBulletTrails','updateImpactSparks','updateFlares','updateAmmoPickups','updateArtifacts',
    'updateConsumables','updateSanity','updateBalloons','updateHUD','netUpdate','netClientUpdate','netBuildSnapshot'];
  for (const n of NAMES) {
    const fn = window[n];
    if (typeof fn !== 'function') continue;
    window.__prof[n] = 0;
    window[n] = function (...a) { const t0 = performance.now(); const r = fn.apply(this, a); window.__prof[n] += performance.now() - t0; return r; };
  }
  // frame counter rides netUpdate (called once per animate frame)
  const nu = window.netUpdate;
  window.netUpdate = function (...a) { window.__prof.frames++; return nu.apply(this, a); };
  if (typeof renderer !== 'undefined' && renderer) {
    const rr = renderer.render.bind(renderer);
    renderer.render = function (...a) { const t0 = performance.now(); rr(...a); window.__prof.render += performance.now() - t0; };
  }
  window.__sent = {}; window.__recv = {};
  const sa = window.sendToAll;
  window.sendToAll = function (t, d) { window.__sent[t] = (window.__sent[t] || 0) + 1; return sa(t, d); };
  const sh = window.sendToHost;
  window.sendToHost = function (t, d) { window.__sent[t] = (window.__sent[t] || 0) + 1; return sh(t, d); };
  const nd = window.netDispatch;
  window.netDispatch = function (m, c) { if (m && m.t) window.__recv[m.t] = (window.__recv[m.t] || 0) + 1; return nd(m, c); };
})()`;

const SAMPLE = `({
  frames: __prof.frames,
  prof: Object.fromEntries(Object.entries(__prof).filter(([k]) => k !== 'frames')),
  sent: { ...__sent }, recv: { ...__recv },
  sceneChildren: (typeof scene !== 'undefined' && scene) ? scene.children.length : -1,
  programs: (typeof renderer !== 'undefined' && renderer) ? renderer.info.programs.length : -1,
  enemies: (typeof enemies !== 'undefined') ? enemies.length : -1,
  trails: (typeof bulletTrails !== 'undefined') ? bulletTrails.length : -1,
  gameState: (typeof gameState !== 'undefined') ? gameState : '?',
  now: performance.now(),
})`;

function diffSample(a, b) {
  const frames = b.frames - a.frames;
  const wall = (b.now - a.now) / 1000;
  const perFrame = {};
  for (const k of Object.keys(b.prof)) perFrame[k] = +(((b.prof[k] - (a.prof[k] || 0)) / Math.max(1, frames))).toFixed(3);
  const sent = {}; for (const k of Object.keys(b.sent)) sent[k] = b.sent[k] - (a.sent[k] || 0);
  const recv = {}; for (const k of Object.keys(b.recv)) recv[k] = b.recv[k] - (a.recv[k] || 0);
  return {
    fps: +(frames / wall).toFixed(1), frames, wallSec: +wall.toFixed(1),
    msPerFrame: Object.fromEntries(Object.entries(perFrame).filter(([, v]) => v > 0.005).sort((x, y) => y[1] - x[1])),
    sentPerSec: Object.fromEntries(Object.entries(sent).map(([k, v]) => [k, +(v / wall).toFixed(1)])),
    recvPerSec: Object.fromEntries(Object.entries(recv).map(([k, v]) => [k, +(v / wall).toFixed(1)])),
    sceneChildren: [a.sceneChildren, b.sceneChildren], programs: [a.programs, b.programs],
    enemies: [a.enemies, b.enemies], trails: [a.trails, b.trails],
  };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function measure(ctx, seconds, phases = 2) {
  await ctx.page.evaluate(INSTRUMENT);
  const out = [];
  let prev = await ctx.page.evaluate(`(${SAMPLE})`);
  for (let i = 0; i < phases; i++) {
    await sleep(seconds * 1000);
    const cur = await ctx.page.evaluate(`(${SAMPLE})`);
    out.push(diffSample(prev, cur));
    prev = cur;
  }
  return out;
}

function report(ctx, windows) {
  console.log(`\n=================== ${ctx.label} ===================`);
  windows.forEach((w, i) => console.log(`window ${i + 1}:`, JSON.stringify(w, null, 1)));
  if (ctx.log.pageerrors.length) {
    console.log(`UNCAUGHT EXCEPTIONS (${ctx.log.pageerrors.length}):`);
    [...new Set(ctx.log.pageerrors)].slice(0, 5).forEach(e => console.log('  ', e.split('\n').slice(0, 4).join(' | ')));
  } else console.log('uncaught exceptions: none');
  if (ctx.log.errors.length) {
    console.log(`console.error lines (${ctx.log.errors.length}):`);
    [...new Set(ctx.log.errors)].slice(0, 5).forEach(e => console.log('  ', e.slice(0, 300)));
  } else console.log('console.error lines: none');
  console.log(`total console lines: ${ctx.log.lines.length}`);
  const counts = {};
  for (const l of ctx.log.lines) { const k = l.slice(0, 80); counts[k] = (counts[k] || 0) + 1; }
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  console.log('most repeated console lines:');
  top.forEach(([k, v]) => console.log(`   ${v}x  ${k}`));
}

(async () => {
  const srv = await serve();
  let solo, host, client;
  try {
    /* ── phase A: SOLO control ── */
    solo = await newGamePage('SOLO');
    await solo.page.evaluate(`document.getElementById('btnStart').click()`);
    await solo.page.waitForFunction(`typeof gameState !== 'undefined' && gameState === 'playing'`, { timeout: 20000 });
    console.log('SOLO: playing; measuring 2x10s…');
    const soloWin = await measure(solo, 10);
    report(solo, soloWin);
    await solo.browser.close(); solo = null;

    /* ── phase B: DUO ── */
    host = await newGamePage('HOST');
    client = await newGamePage('CLIENT');
    await host.page.evaluate(`hostGame()`);
    await host.page.waitForFunction(`netState.roomCode !== null`, { timeout: 30000 });
    const code = await host.page.evaluate(`netState.roomCode`);
    console.log(`HOST: room ${code}`);
    await client.page.evaluate(`joinGame(${JSON.stringify(code)})`);
    await host.page.waitForFunction(`netState.peers.length === 1 && netState.peers[0].open`, { timeout: 45000 });
    console.log('HOST: client connected');
    await client.page.evaluate(`document.getElementById('btnReady').click()`);
    await sleep(800);
    await host.page.evaluate(`document.getElementById('btnStartCoop').click()`);
    await host.page.waitForFunction(`gameState === 'playing'`, { timeout: 20000 });
    await client.page.waitForFunction(`gameState === 'playing'`, { timeout: 20000 });
    console.log('DUO: both playing; measuring 2x10s…');
    const [hostWin, clientWin] = await Promise.all([measure(host, 10), measure(client, 10)]);
    report(host, hostWin);
    report(client, clientWin);
  } catch (e) {
    console.error('HARNESS FAILURE:', e && e.message);
    for (const c of [solo, host, client]) if (c) { console.log(`--- ${c.label} last console lines ---`); c.log.lines.slice(-15).forEach(l => console.log('  ', l)); }
    process.exitCode = 1;
  } finally {
    for (const c of [solo, host, client]) if (c) await c.browser.close().catch(() => {});
    srv.close();
  }
})();
