// Hotel Chase AUTO-RUN verifier — the movement model + start gate (and, from §3,
// the advancing wall + progress projection). Extracts the REAL functions out of
// main.js (no copies to drift) and drives them over stubs.
//   1. updateChaseGate: HOLD-E accumulates to 1 in CHASE_GATE_HOLD s and opens the
//      run; releasing decays it; a single holder suffices; the CLIENT path only
//      streams its hold signal (host owns progress).
//   2. Movement wiring (source invariants): the auto-run branch forces forward along
//      the look heading (mouse-look steers), A/D strafe-dodge, W/S ignored, constant
//      AUTORUN_SPEED, rooted until runStarted; guns disabled; gate-barrier collision.
// Usage: node tools/test_autorun.js
//
// (§3 appends wall-advance + projection-caught math + visual/no-light checks here.)

const fs = require('fs');
const path = require('path');
const mainSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'main.js'), 'utf8');

function sliceBalanced(s, from) {
  const open = s[from], close = open === '{' ? '}' : ']';
  let depth = 0;
  for (let i = from; i < s.length; i++) { if (s[i] === open) depth++; else if (s[i] === close && --depth === 0) return i; }
  throw new Error('unbalanced');
}
function extractFn(src, decl) {
  const i = src.indexOf(decl);
  if (i < 0) throw new Error('not found: ' + decl);
  return src.slice(i, sliceBalanced(src, src.indexOf('{', src.indexOf(')', i))) + 1);
}
function constNum(name) {
  const m = mainSrc.match(new RegExp('const ' + name + '\\s*=\\s*([\\d.]+)'));
  if (!m) throw new Error('const not found: ' + name);
  return parseFloat(m[1]);
}

let fails = 0;
const fail = (m) => { fails++; console.error('FAIL: ' + m); };
const ok = (m) => console.log('  ok: ' + m);

const GATE_HOLD = constNum('CHASE_GATE_HOLD');

/* ── 1. updateChaseGate behavior ── */
console.log('1. start gate (HOLD-E, host-authoritative)');
{
  // env shared by the extracted function (it references these as free vars)
  const env = {
    keys: {}, gameState: 'playing',
    player: { isDown: false },
    chaseState: null,
    role: 'solo', anyPeer: false,
    sentHold: 0, openedCount: 0,
    CHASE_GATE_HOLD: GATE_HOLD,
  };
  const tick = new Function('E', `
    with (E) {
      function netIsClient(){ return role === 'client'; }
      function netSendChaseHold(){ sentHold++; }
      function netAnyChaseHold(){ return anyPeer === true; }
      function openChaseRun(){ openedCount++; if (chaseState) { chaseState.gateOpen = true; chaseState.runStarted = true; chaseState.gateProg = 1; } }
      ${extractFn(mainSrc, 'function updateChaseGate')}
      updateChaseGate(dt);
    }
  `);
  const fresh = () => ({ gateOpen: false, gateProg: 0, runStarted: false });

  // SOLO: hold E → opens in ~GATE_HOLD seconds
  env.role = 'solo'; env.chaseState = fresh(); env.keys = { KeyE: true }; env.dt = 1 / 60;
  let frames = 0;
  while (!env.chaseState.gateOpen && frames < 60 * (GATE_HOLD + 1)) { tick(env); frames++; }
  const secs = frames / 60;
  if (env.chaseState.gateOpen && Math.abs(secs - GATE_HOLD) < 0.2) ok(`solo: HOLD-E opens the gate in ~${GATE_HOLD}s (took ${secs.toFixed(2)}s)`);
  else fail(`solo gate open timing off (open=${env.chaseState.gateOpen} at ${secs.toFixed(2)}s)`);
  if (env.chaseState.runStarted) ok('opening sets runStarted (the run begins)'); else fail('runStarted not set on open');

  // RELEASE decays progress back toward 0
  env.chaseState = fresh(); env.keys = { KeyE: true }; env.dt = 1 / 60;
  for (let i = 0; i < 30; i++) tick(env);         // build some progress
  const peak = env.chaseState.gateProg;
  env.keys = {};                                   // release
  for (let i = 0; i < 200; i++) tick(env);
  if (peak > 0.1 && env.chaseState.gateProg < 0.01) ok(`releasing E decays progress to ~0 (peak ${peak.toFixed(2)} → ${env.chaseState.gateProg.toFixed(3)})`);
  else fail(`decay wrong (peak ${peak.toFixed(2)} → ${env.chaseState.gateProg.toFixed(3)})`);

  // CLIENT: never advances progress locally; just streams the hold signal
  env.role = 'client'; env.chaseState = fresh(); env.keys = { KeyE: true }; env.sentHold = 0; env.dt = 1 / 60;
  for (let i = 0; i < 60; i++) tick(env);
  if (env.chaseState.gateProg === 0 && env.sentHold > 0) ok('client: holds stream a signal but progress stays host-owned (no local advance)');
  else fail(`client path wrong (prog ${env.chaseState.gateProg}, sent ${env.sentHold})`);

  // a single holder suffices (no requirement that all players hold)
  env.role = 'host'; env.chaseState = fresh(); env.keys = { KeyE: true }; env.anyPeer = false; env.dt = 1 / 60;
  frames = 0; while (!env.chaseState.gateOpen && frames < 60 * (GATE_HOLD + 1)) { tick(env); frames++; }
  if (env.chaseState.gateOpen) ok('host: a single player holding opens it (peers not required)'); else fail('single-holder open failed');
}

/* ── 2. movement + disabled-guns wiring (source invariants) ── */
console.log('2. auto-run movement wiring');
{
  const up = extractFn(mainSrc, 'function updatePlayer');
  const arBranch = up.slice(up.indexOf('if (theme.autoRun) {'), up.indexOf('} else {', up.indexOf('if (theme.autoRun) {')));
  if (/moveDir\.copy\(forward\)/.test(arBranch)) ok('forced forward along the look heading (mouse-look steers the run)');
  else fail('auto-run branch does not force forward along look heading');
  if (/addScaledVector\(right, strafe \* AUTORUN_STRAFE_FRAC\)/.test(arBranch)) ok('A/D add a lateral strafe-dodge');
  else fail('no A/D strafe dodge');
  if (!/KeyW|KeyS|ArrowUp|ArrowDown/.test(arBranch)) ok('W/S do nothing in auto-run');
  else fail('auto-run branch reads W/S');
  if (/speed = AUTORUN_SPEED/.test(arBranch)) ok('constant AUTORUN_SPEED (no head-bob/shake — velocity only)');
  else fail('auto-run speed not AUTORUN_SPEED');
  if (/chaseState && chaseState\.runStarted/.test(arBranch) && /!player\.isDown/.test(arBranch)) ok('rooted until the gate opens (runStarted) and while downed');
  else fail('auto-run not gated on runStarted/!isDown');

  if (/getTheme\(currentFloor\)\.autoRun\) return;/.test(extractFn(mainSrc, 'function playerShoot'))) ok('guns disabled (playerShoot bails on auto-run)');
  else fail('playerShoot not guarded for auto-run');
  if (/getTheme\(currentFloor\)\.autoRun/.test(extractFn(mainSrc, 'function updateGun'))) ok('gun viewmodel hidden on auto-run');
  else fail('gun not hidden on auto-run');
  if (/chaseState && !chaseState\.gateOpen/.test(up) && /chaseState\.gateBarriers/.test(up)) ok('start-gate barriers block movement until open');
  else fail('gate-barrier collision missing in updatePlayer');

  // theme flag drives auto-run pace ≈ 1.7× sprint
  const m = mainSrc.match(/AUTORUN_SPEED = MOVE_SPEED \* SPRINT_MULT \* ([\d.]+)/);
  if (m && parseFloat(m[1]) === 1.7) ok('AUTORUN_SPEED = 1.7× sprint (the pace knob)');
  else fail('AUTORUN_SPEED pace multiplier not 1.7');

  // spawn faces DOWN the corridor (else gate-open would auto-run into the start wall)
  if (/theme\.autoRun && chaseState && chaseState\.worldPts\.length > 1/.test(mainSrc) &&
      /player\.yaw = Math\.atan2\(-\(b\.x - a\.x\), -\(b\.z - a\.z\)\)/.test(mainSrc))
    ok('spawn faces down the track on auto-run floors');
  else fail('spawn-facing for auto-run not set');
}

/* ── 3. advancing wall: arc lookup, projection, advance, caught ── */
console.log('3. advancing wall (track projection + caught)');
{
  const CATCH = constNum('CHASE_CATCH_GAP');
  const AUTOSPD = 5.5 * 1.65 * parseFloat(mainSrc.match(/AUTORUN_SPEED = MOVE_SPEED \* SPRINT_MULT \* ([\d.]+)/)[1]);
  const WALL_FRAC = parseFloat(mainSrc.match(/CHASE_WALL_SPEED = AUTORUN_SPEED \* ([\d.]+)/)[1]);
  const WALL_SPEED = AUTOSPD * WALL_FRAC; // the REAL wall pace (≈14.2 u/s), not the raw fraction

  const wallApi = (env) => new Function('env', `
    with (env) {
      function netIsClient(){ return netState.role === 'client'; }
      function animateChaserMesh(){}
      function mobVocalLocal(){ env.roars++; }
      function gameOver(){ env.gameovers++; }
      function netGoDown(){ env.downs++; }
      function playDamage(){}
      ${extractFn(mainSrc, 'function chaseProjectProgress')}
      ${extractFn(mainSrc, 'function chaseWorldAtArc')}
      ${extractFn(mainSrc, 'function updateChaseWall')}
      return { project: chaseProjectProgress, worldAt: chaseWorldAtArc, tick: updateChaseWall };
    }
  `)(env);

  // Build an L-shaped track: 10 cells east, then 10 cells south (cell centers).
  const C = 4, pts = [];
  for (let i = 0; i <= 10; i++) pts.push({ x: (1 + i) * C + C / 2, z: 1 * C + C / 2 });
  for (let i = 1; i <= 10; i++) pts.push({ x: 11 * C + C / 2, z: (1 + i) * C + C / 2 });
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum[i] = cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  const total = cum[cum.length - 1];
  const mkState = (extra) => Object.assign({
    worldPts: pts, cum, total, runStarted: true, gateOpen: true,
    wallS: -16, wallTargetS: -16, myIdx: 0, myS: 0, caught: false, wallGroup: null, wallBlobs: []
  }, extra || {});

  // worldAt clamps + interpolates
  {
    const env = { player: { pos: { x: 0, z: 0 } }, chaseState: mkState(), netState: { role: 'solo' }, CHASE_WALL_SPEED: WALL_SPEED, CHASE_CATCH_GAP: CATCH, roars: 0, gameovers: 0, downs: 0 };
    const api = wallApi(env);
    const a = api.worldAt(-5), b = api.worldAt(total + 5), mid = api.worldAt(total / 2);
    const okEnds = a.x === pts[0].x && a.z === pts[0].z && b.x === pts[pts.length - 1].x && b.z === pts[pts.length - 1].z;
    const okMid = mid.x >= pts[0].x - 1e-6 && mid.z >= pts[0].z - 1e-6; // on the track somewhere
    if (okEnds && okMid) ok('worldAtArc clamps to track ends and interpolates the middle');
    else fail(`worldAtArc wrong (a=${a.x},${a.z} b=${b.x},${b.z})`);
  }

  // projection: player standing on a track point → myS ≈ cum there; lateral offset barely changes it
  {
    const onPt = pts[6];
    const env = { player: { pos: { x: onPt.x, z: onPt.z }, isDown: false }, chaseState: mkState(), netState: { role: 'solo' }, CHASE_WALL_SPEED: WALL_SPEED, CHASE_CATCH_GAP: CATCH, roars: 0, gameovers: 0, downs: 0 };
    const api = wallApi(env);
    api.project();
    const sOn = env.chaseState.myS;
    env.player.pos.x = onPt.x; env.player.pos.z = onPt.z + 1.2; // dodge sideways 1.2u
    api.project();
    const sOff = env.chaseState.myS;
    if (Math.abs(sOn - cum[6]) < 0.6 && Math.abs(sOn - sOff) < 0.6) ok('projection: progress ≈ arc-length, lateral dodge barely changes it');
    else fail(`projection off (sOn=${sOn.toFixed(1)} cum6=${cum[6].toFixed(1)} sOff=${sOff.toFixed(1)})`);
  }

  // host advances the wall at the fixed pace; client lerps toward the broadcast target
  {
    const envH = { player: { pos: { x: pts[0].x, z: pts[0].z }, isDown: true }, chaseState: mkState(), netState: { role: 'host' }, CHASE_WALL_SPEED: WALL_SPEED, CHASE_CATCH_GAP: CATCH, roars: 0, gameovers: 0, downs: 0 };
    const apiH = wallApi(envH);
    const s0 = envH.chaseState.wallS; apiH.tick(0.1);
    const adv = envH.chaseState.wallS - s0;
    if (Math.abs(adv - WALL_SPEED * 0.1) < 1e-6) ok(`host advances wall at fixed CHASE_WALL_SPEED (${WALL_SPEED.toFixed(1)} u/s)`);
    else fail(`host wall advance wrong (${adv.toFixed(3)} vs ${(WALL_SPEED * 0.1).toFixed(3)})`);
    if (WALL_SPEED < AUTOSPD) ok(`wall (${WALL_SPEED.toFixed(1)}) is slower than auto-run (${AUTOSPD.toFixed(1)}) — a clean run stays ahead`);
    else fail('wall not slower than auto-run');

    const envC = { player: { pos: { x: pts[0].x, z: pts[0].z }, isDown: true }, chaseState: mkState({ wallS: 0, wallTargetS: 20 }), netState: { role: 'client' }, CHASE_WALL_SPEED: WALL_SPEED, CHASE_CATCH_GAP: CATCH, roars: 0, gameovers: 0, downs: 0 };
    const apiC = wallApi(envC);
    for (let i = 0; i < 60; i++) apiC.tick(1 / 60);
    if (Math.abs(envC.chaseState.wallS - 20) < 0.5) ok('client lerps wall toward the host-broadcast position');
    else fail(`client wall lerp off (${envC.chaseState.wallS.toFixed(2)})`);
  }

  // caught: ahead of the wall → safe; wall reaches you → solo game over / co-op down
  {
    const safe = { player: { pos: { x: pts[8].x, z: pts[8].z }, isDown: false }, chaseState: mkState({ wallS: cum[2] }), netState: { role: 'solo' }, CHASE_WALL_SPEED: WALL_SPEED, CHASE_CATCH_GAP: CATCH, roars: 0, gameovers: 0, downs: 0 };
    const apiS = wallApi(safe); apiS.tick(1 / 60);
    if (!safe.chaseState.caught && safe.gameovers === 0) ok('ahead of the wall → not caught');
    else fail('false catch while ahead');

    const caughtSolo = { player: { pos: { x: pts[2].x, z: pts[2].z }, isDown: false }, chaseState: mkState({ wallS: cum[2] }), netState: { role: 'solo' }, CHASE_WALL_SPEED: WALL_SPEED, CHASE_CATCH_GAP: CATCH, roars: 0, gameovers: 0, downs: 0 };
    const apiCS = wallApi(caughtSolo); apiCS.tick(1 / 60);
    if (caughtSolo.chaseState.caught && caughtSolo.gameovers === 1) ok('wall reaches you (solo) → game over');
    else fail(`solo catch failed (caught=${caughtSolo.chaseState.caught} go=${caughtSolo.gameovers})`);

    const caughtCo = { player: { pos: { x: pts[2].x, z: pts[2].z }, isDown: false }, chaseState: mkState({ wallS: cum[2] }), netState: { role: 'host' }, CHASE_WALL_SPEED: WALL_SPEED, CHASE_CATCH_GAP: CATCH, roars: 0, gameovers: 0, downs: 0 };
    const apiCC = wallApi(caughtCo); apiCC.tick(1 / 60);
    if (caughtCo.chaseState.caught && caughtCo.downs === 1) ok('wall reaches you (co-op) → DOWN (non-revivable)');
    else fail(`co-op catch failed (down=${caughtCo.downs})`);
  }

  // RUN-GRACE (bug fix): during the post-open head-start, the wall is FROZEN and CANNOT
  // catch even when overlapping the player → zero threat until the run truly begins.
  {
    const g = { player: { pos: { x: pts[2].x, z: pts[2].z }, isDown: false },
      chaseState: mkState({ wallS: cum[2], runGrace: 1.5 }), netState: { role: 'solo' },
      CHASE_WALL_SPEED: WALL_SPEED, CHASE_CATCH_GAP: CATCH, roars: 0, gameovers: 0, downs: 0 };
    const api = wallApi(g);
    const w0 = g.chaseState.wallS;
    api.tick(0.1);
    if (!g.chaseState.caught && g.gameovers === 0) ok('run-grace: overlapping the wall does NOT catch (zero threat post-open)');
    else fail('run-grace failed — caught during the head-start window');
    if (Math.abs(g.chaseState.wallS - w0) < 1e-9) ok('run-grace: wall is FROZEN (no advance) during the head start');
    else fail(`wall advanced during grace (${(g.chaseState.wallS - w0).toFixed(3)})`);
    // after the grace elapses it resumes catching
    g.chaseState.runGrace = 0;
    api.tick(1 / 60);
    if (g.chaseState.caught) ok('after grace elapses, the wall catches normally');
    else fail('wall never catches after grace');
  }
}

/* ── 5. POLISH: gate visual, siren lighting, corridor-aware placement (no new lights) ── */
console.log('5. polish wiring (gate / siren / corridor lights)');
{
  const lightRe = /new THREE\.(PointLight|SpotLight|DirectionalLight|HemisphereLight)/;
  // GATE: clearly a shutter (frame + slats + lock lamp) distinct from walls; no lights;
  // a world-space HOLD-E prompt sprite; recolors red→green by progress.
  const gate = extractFn(mainSrc, 'function buildChaseGate');
  if (/slat/i.test(gate) && /frameMat/.test(gate) && /lamp/i.test(gate)) ok('gate reads as a shutter (frame + slats + lock lamp)');
  else fail('gate not rebuilt as a shutter');
  if (!lightRe.test(gate)) ok('gate adds NO lights');
  else fail('gate introduces a light');
  if (/buildGatePromptSprite/.test(gate) && /Sprite/.test(extractFn(mainSrc, 'function buildGatePromptSprite'))) ok('world-space HOLD-E prompt sprite at the gate');
  else fail('no world-space gate prompt');
  const gateUpd = extractFn(mainSrc, 'function updateChaseGate');
  if (/gateGlowMat/.test(gateUpd) && /emissive\.setRGB/.test(gateUpd)) ok('lock lamp pulses + recolors red→green by progress');
  else fail('gate glow pulse/recolor missing');

  // SIREN: intensity-only pulse on existing lights (no new lights), traveling phase.
  const ul = extractFn(mainSrc, 'function updateLights');
  if (/f\.siren/.test(ul) && /CHASE_SIREN_MIN/.test(ul) && /f\.phase/.test(ul)) ok('siren pulse drives existing lights (intensity-only, traveling phase)');
  else fail('siren pulse not wired into updateLights');
  if (!lightRe.test(ul)) ok('updateLights creates no lights (intensity-only)');
  else fail('updateLights creates a light');
  // period in the 1–2s range (slow, not a seizure strobe)
  const per = parseFloat(mainSrc.match(/CHASE_SIREN_PERIOD = ([\d.]+)/)[1]);
  if (per >= 1 && per <= 2) ok(`siren period ${per}s (slow strobe, 1–2s)`);
  else fail(`siren period ${per}s out of the 1–2s range`);

  // CORRIDOR-AWARE placement: lights walk chasePath; placeCeilingLight respects the budget.
  const bms = mainSrc.slice(mainSrc.indexOf('function buildMazeScene'));
  if (/theme\.autoRun && chasePath && chasePath\.length/.test(bms) && /placeCeilingLight\(path\[j\]\.x, path\[j\]\.y/.test(bms))
    ok('corridor-aware placement: lights walk the track (trail bends at turns)');
  else fail('no corridor-aware light placement for auto-run');
  if (/lights\.length >= CEILING_LIGHT_BUDGET\) return;/.test(bms)) ok('placeCeilingLight still respects CEILING_LIGHT_BUDGET (count fixed)');
  else fail('budget cap missing');
}

/* ── 4. the wall adds NO lights (budget intact) ── */
console.log('4. wall visual: no new lights');
{
  const enemSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'enemies.js'), 'utf8');
  const buildWall = extractFn(mainSrc, 'function buildChaseWall');
  const buildBlob = extractFn(enemSrc, 'function buildChaserMonster');
  const lightRe = /new THREE\.(PointLight|SpotLight|DirectionalLight|HemisphereLight)/;
  if (!lightRe.test(buildWall) && !lightRe.test(buildBlob)) ok('buildChaseWall + buildChaserMonster add ZERO lights');
  else fail('the wall introduces a light');
  if (/buildChaserMonster/.test(buildWall)) ok('wall reuses the procedural blob-mass look (buildChaserMonster), widened across the corridor');
  else fail('wall does not reuse the blob-mass');
  if (/MeshStandardMaterial/.test(buildWall)) ok('occluder slab uses the pinned no-map Standard family');
  else fail('slab material not Standard');
}

console.log(fails === 0 ? '\nALL AUTO-RUN TESTS PASSED' : `\n${fails} FAILURE(S)`);
process.exit(fails === 0 ? 0 : 1);
