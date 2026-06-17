/* repro_floors.js — host-health check on the floors the recent batches touched.
   Reuses repro_coop's approach (local http + headless Chrome + per-frame profiling
   + exception capture) but drives SPECIFIC floors: normal (0), Hotel Chase /chaser
   (17), Lights Out /scanner (18). SOLO == the host sim path (they share it), so
   solo profiling here exercises updateEnemies + the chaser blob anim + scan dots
   exception-free. Then a DUO on the chaser floor exercises the broadcasts
   (mob_vocal / scan_fx) — skipped gracefully if the PeerJS broker is unreachable.
   Diagnostic only. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = 8078;
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.glb': 'model/gltf-binary', '.json': 'application/json', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };

function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      const p = decodeURIComponent(req.url.split('?')[0]);
      const file = path.join(ROOT, p === '/' ? 'index.html' : p);
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
const FLAGS = ['--mute-audio', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--window-size=1280,720', '--use-angle=swiftshader'];

async function newGamePage(label) {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: FLAGS });
  const page = (await browser.pages())[0];
  const log = { pageerrors: [], errors: [], lines: 0 };
  page.on('console', m => { log.lines++; if (m.type() === 'error') log.errors.push(m.text()); });
  page.on('pageerror', e => log.pageerrors.push(String(e && e.stack || e)));
  await page.goto(`http://127.0.0.1:${PORT}/index.html?dev=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('typeof modelsReady !== "undefined" && modelsReady === true', { timeout: 120000 });
  return { browser, page, log, label };
}

const INSTRUMENT = `(() => {
  window.__prof = { frames: 0, render: 0 };
  const NAMES = ['updatePlayer','updateEnemies','updateBoss','netClientUpdate','updateMinimap','updateScanDots','updateAmbient','updateImpactSparks','netUpdate','netBuildSnapshot','updateHUD'];
  for (const n of NAMES) { const fn = window[n]; if (typeof fn !== 'function') continue; window.__prof[n] = 0;
    window[n] = function (...a) { const t0 = performance.now(); const r = fn.apply(this, a); window.__prof[n] += performance.now() - t0; return r; }; }
  const nu = window.netUpdate; if (nu) window.netUpdate = function (...a) { window.__prof.frames++; return nu.apply(this, a); };
  window.__sent = {}; const sa = window.sendToAll, sh = window.sendToHost;
  if (sa) window.sendToAll = function (t, d) { window.__sent[t] = (window.__sent[t]||0)+1; return sa(t, d); };
  if (sh) window.sendToHost = function (t, d) { window.__sent[t] = (window.__sent[t]||0)+1; return sh(t, d); };
})()`;
const SAMPLE = `({ frames: __prof.frames, prof: {...__prof}, sent: {...__sent},
  scene: (typeof scene!=='undefined'&&scene)?scene.children.length:-1,
  programs: (typeof renderer!=='undefined'&&renderer)?renderer.info.programs.length:-1,
  enemies: (typeof enemies!=='undefined')?enemies.length:-1, now: performance.now() })`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function measure(ctx, sec) {
  await ctx.page.evaluate(INSTRUMENT);
  const a = await ctx.page.evaluate(`(${SAMPLE})`);
  await sleep(sec * 1000);
  const b = await ctx.page.evaluate(`(${SAMPLE})`);
  const frames = b.frames - a.frames, wall = (b.now - a.now) / 1000;
  const perFrame = {};
  for (const k of Object.keys(b.prof)) { if (k === 'frames') continue; const v = (b.prof[k] - (a.prof[k]||0)) / Math.max(1, frames); if (v > 0.01) perFrame[k] = +v.toFixed(3); }
  const sent = {}; for (const k of Object.keys(b.sent)) sent[k] = +((b.sent[k] - (a.sent[k]||0)) / wall).toFixed(1);
  return { fps: +(frames / wall).toFixed(1), frames, msPerFrame: perFrame, sentPerSec: sent, scene: [a.scene, b.scene], programs: [a.programs, b.programs], enemies: [a.enemies, b.enemies] };
}
function report(ctx, win) {
  console.log(`\n=== ${ctx.label} ===`);
  console.log(JSON.stringify(win));
  console.log(`uncaught exceptions: ${ctx.log.pageerrors.length}${ctx.log.pageerrors.length ? ' → ' + [...new Set(ctx.log.pageerrors)].slice(0,3).map(e=>e.split('\\n')[0]).join(' | ') : ''}`);
  console.log(`console.error lines: ${ctx.log.errors.length}${ctx.log.errors.length ? ' → ' + [...new Set(ctx.log.errors)].slice(0,3).join(' | ') : ''}`);
  return ctx.log.pageerrors.length;
}

async function soloFloor(floorIdx, label, prep) {
  const ctx = await newGamePage(label);
  await ctx.page.evaluate(`selectedStartFloor = ${floorIdx};`);
  await ctx.page.evaluate(`document.getElementById('btnStart').click()`);
  await ctx.page.waitForFunction(`typeof gameState!=='undefined' && gameState==='playing'`, { timeout: 20000 });
  await sleep(3800); // let waves / chasers spawn (chase: 1.5s spawn + 3s grace)
  if (prep) { await ctx.page.evaluate(prep).catch(() => {}); }
  const win = await measure(ctx, 8);
  const exc = report(ctx, win);
  await ctx.browser.close();
  return exc;
}

(async () => {
  const srv = await serve();
  let totalExc = 0;
  try {
    totalExc += await soloFloor(0, 'SOLO floor 0 (normal)', null);
    // Hotel Chase: chaser blob spawned + animating; trigger a shot or two is not needed
    totalExc += await soloFloor(17, 'SOLO floor 17 (Hotel Chase / chaser)', null);
    // Lights Out: fire a scanner pulse so the dot system + updateScanDots are live
    totalExc += await soloFloor(18, 'SOLO floor 18 (Lights Out / scanner)', `try{ fireScannerLocal(); }catch(e){}`);

    /* ── DUO on the chaser floor (broadcasts: mob_vocal / scan_fx / snapshot) ── */
    let host, client;
    try {
      host = await newGamePage('HOST f17');
      client = await newGamePage('CLIENT f17');
      await host.page.evaluate(`hostGame()`);
      await host.page.waitForFunction(`netState.roomCode !== null`, { timeout: 30000 });
      const code = await host.page.evaluate(`netState.roomCode`);
      console.log(`\nHOST room ${code} — waiting for peer (needs PeerJS broker)…`);
      await client.page.evaluate(`joinGame(${JSON.stringify(code)})`);
      await host.page.waitForFunction(`netState.peers.length===1 && netState.peers[0].open`, { timeout: 35000 });
      await host.page.evaluate(`selectedStartFloor = 17;`);
      await client.page.evaluate(`document.getElementById('btnReady').click()`);
      await sleep(800);
      await host.page.evaluate(`document.getElementById('btnStartCoop').click()`);
      await host.page.waitForFunction(`gameState==='playing'`, { timeout: 20000 });
      await client.page.waitForFunction(`gameState==='playing'`, { timeout: 20000 });
      await sleep(3800);
      const [hw, cw] = await Promise.all([measure(host, 8), measure(client, 8)]);
      totalExc += report(host, hw);
      totalExc += report(client, cw);
      console.log(`\nDUO fps parity: host ${hw.fps} vs client ${cw.fps}`);
      await host.browser.close(); await client.browser.close();
    } catch (e) {
      console.log(`\nDUO phase SKIPPED — ${e.message} (likely no PeerJS broker reachable in this sandbox).`);
      for (const c of [host, client]) if (c) await c.browser.close().catch(() => {});
    }
  } catch (e) {
    console.error('HARNESS FAILURE:', e && e.message);
    process.exitCode = 1;
  } finally {
    srv.close();
    console.log(`\nTOTAL uncaught exceptions across all phases: ${totalExc}`);
  }
})();
