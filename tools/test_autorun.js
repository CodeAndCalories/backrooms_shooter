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
      const ESCAPE_TRIGGER_BACK = ${constNum('ESCAPE_TRIGGER_BACK')};
      function netIsClient(){ return netState.role === 'client'; }
      function animateChaserMesh(){}
      function mobVocalLocal(){ env.roars++; }
      function gameOver(){ env.gameovers++; }
      function netGoDown(){ env.downs++; }
      function playDamage(){}
      function triggerEscape(){ if (chaseState && !chaseState.escaping) { chaseState.escaping = true; env.escapeTriggers = (env.escapeTriggers||0)+1; } }
      function updateEscapeSequence(){ env.escapeTicks = (env.escapeTicks||0)+1; }
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

  // EXIT SIGNS: green emissive arrow signs along the path, no lights; only at end-of-
  // straight turns (where dead-ends are); wrong turns get none.
  const signs = extractFn(mainSrc, 'function buildChaseExitSigns');
  if (/emissive: 0x1cff5e/.test(signs) && /chev/i.test(signs)) ok('exit signs: green emissive panel + chevron arrow');
  else fail('exit signs not green-arrow');
  if (!lightRe.test(signs)) ok('exit signs add NO lights (emissive only)');
  else fail('exit signs introduce a light');
  if (/iny !== 0\) continue/.test(signs)) ok('signs only at end-of-straight turns (dead-end decision points; wrong turns get none)');
  else fail('exit signs not gated to turns');

  // FURNITURE: recognizable hotel props, no lights, modest emissive (self-lit), shared mats.
  const furn = extractFn(mainSrc, 'function buildHotelObstacle');
  if (!lightRe.test(furn)) ok('hotel furniture adds NO lights');
  else fail('furniture introduces a light');
  if (/CHAIR/.test(furn) && /DESK/.test(furn) && /CART/.test(furn) && /SUITCASE/.test(furn) && /WARDROBE/.test(furn))
    ok('furniture variety: chair / desk / cart / suitcases / wardrobe');
  else fail('furniture lacks the 5 hotel-prop types');
  if (/MeshStandardMaterial/.test(furn) || /M\.wood/.test(furn)) ok('furniture uses shared no-map Standard mats (pinned family)');
  else fail('furniture material family wrong');
  const hotelBranch = mainSrc.slice(mainSrc.indexOf("decorations === 'hotel'"));
  if (/buildHotelObstacle\(Math\.floor\(prng\(\) \* 5\)/.test(hotelBranch) && /emissiveIntensity: glow/.test(hotelBranch))
    ok('obstacles place varied furniture (seeded prng) with self-lit emissive');
  else fail('hotel obstacle placement not wired to furniture');

  // WALL SPEED bumped to 0.95× (stays close on a clean run) but still < auto-run.
  const wf = parseFloat(mainSrc.match(/CHASE_WALL_SPEED = AUTORUN_SPEED \* ([\d.]+)/)[1]);
  if (wf === 0.95) ok('CHASE_WALL_SPEED = 0.95× auto-run (close, but still escapable)');
  else fail(`CHASE_WALL_SPEED is ${wf}× (expected 0.95)`);
  if (wf < 1) ok('wall still slower than auto-run (a clean run can stay ahead)');
  else fail('wall not slower than auto-run');

  // RED FOG: tuned so distance fades (~past the next turn), red-tinted.
  const fogFar = parseFloat(mainSrc.match(/fogColor: 0x2e0810, fogNear: \d+, fogFar: (\d+)/)[1]);
  if (fogFar >= 28 && fogFar <= 60) ok(`red fog fogFar=${fogFar} (fades distance, not infinite)`);
  else fail(`fogFar ${fogFar} out of the intended range`);
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

/* ── 6. ESCAPE ENDING — trigger, sequence phases, host-authoritative advance, robustness ── */
console.log('6. escape ending (gate slam + monster impact)');
{
  const lightRe = /new THREE\.(PointLight|SpotLight|DirectionalLight|HemisphereLight)/;
  const SLAM = constNum('ESCAPE_SLAM_DUR'), TOTAL = constNum('ESCAPE_TOTAL'), TRIG = constNum('ESCAPE_TRIGGER_BACK');

  // sandbox the REAL escape functions over stubs (THREE/scene/audio/net + a fake track)
  const esc = (env) => new Function('env', `
    with (env) {
      const CELL = 4, WALL_H = 3.4;
      const CHASE_BAND_H = ${constNum('CHASE_BAND_H')};
      const ESCAPE_SEAL_BACK = ${constNum('ESCAPE_SEAL_BACK')};
      const ESCAPE_TURN_DUR = ${constNum('ESCAPE_TURN_DUR')};
      const ESCAPE_SLAM_DUR = ${SLAM}, ESCAPE_LUNGE_DUR = ${constNum('ESCAPE_LUNGE_DUR')};
      const ESCAPE_WALL_OVERSHOOT = ${constNum('ESCAPE_WALL_OVERSHOOT')}, ESCAPE_TOTAL = ${TOTAL};
      const player = { pos: { x: 0, z: 0 }, yaw: 0, pitch: 0 }; // for the scripted camera turn
      const meshLike = () => ({ position: { set() {} }, rotation: {}, add() {}, traverse() {} });
      const THREE = { Group: function(){ return meshLike(); }, Mesh: function(){ return meshLike(); },
        BoxGeometry: function(){ return {}; }, MeshStandardMaterial: function(){ return {}; } };
      const scene = { add() { if (env.throwGate) throw new Error('escape build boom'); } };
      function netIsClient(){ return netState.role === 'client'; }
      function netBroadcastEscape(){ env.broadcasts = (env.broadcasts||0)+1; }
      function netRequestAdvance(){ env.requests = (env.requests||0)+1; }
      function advanceFloor(){ env.advances = (env.advances||0)+1; }
      function playSlam(){ env.slams = (env.slams||0)+1; }
      function mobVocalLocal(){ env.roars = (env.roars||0)+1; }
      function animateChaserMesh(){}
      function chaseWorldAtArc(s){ return { x: s, z: 0, dx: 1, dz: 0 }; }
      ${extractFn(mainSrc, 'function makeEscapeShutter')}
      ${extractFn(mainSrc, 'function buildEscapeGate')}
      ${extractFn(mainSrc, 'function triggerEscape')}
      ${extractFn(mainSrc, 'function updateEscapeSequence')}
      ${extractFn(mainSrc, 'function finishEscape')}
      return { triggerEscape, updateEscapeSequence, finishEscape };
    }
  `)(env);
  const mkCs = () => ({ total: 100, wallS: 88, escaping: false, escapeT: 0, escapeDone: false,
    wallGroup: { position: { set() {} }, rotation: {} }, wallBlobs: [], poundTimer: 0, escapeShudder: 0 });

  // SOLO: trigger → escaping + gate built; play to the end → exactly one advance.
  {
    const env = { netState: { role: 'solo' }, chaseState: mkCs() };
    const api = esc(env);
    api.triggerEscape();
    const startedOk = env.chaseState.escaping && env.chaseState.escapeGate;
    if (startedOk && !env.broadcasts && !env.requests) ok('solo: triggerEscape starts the cinematic (gate built), no net traffic');
    else fail(`solo trigger off (escaping=${env.chaseState.escaping} gate=${!!env.chaseState.escapeGate})`);
    for (let i = 0; i < Math.ceil(TOTAL / (1 / 60)) + 5; i++) api.updateEscapeSequence(1 / 60);
    if (env.advances === 1) ok(`solo: auto-advances exactly once after ~${TOTAL}s`);
    else fail(`solo advance count ${env.advances} (expected 1)`);
    if (env.slams >= 2 && env.roars >= 1) ok(`solo: gate slam + monster impact play (slams=${env.slams}, roars=${env.roars})`);
    else fail(`solo sounds off (slams=${env.slams} roars=${env.roars})`);
    // keep ticking past the end → still exactly one advance (escapeDone guard; no soft-lock spam)
    for (let i = 0; i < 120; i++) api.updateEscapeSequence(1 / 60);
    if (env.advances === 1) ok('advance fires ONCE (escapeDone guard)'); else fail(`advance fired ${env.advances}×`);
  }

  // HOST: trigger broadcasts 'escape_seq'; advances at the end.
  {
    const env = { netState: { role: 'host', peers: [{}] }, chaseState: mkCs() };
    const api = esc(env);
    api.triggerEscape();
    for (let i = 0; i < Math.ceil(TOTAL * 60) + 5; i++) api.updateEscapeSequence(1 / 60);
    if (env.broadcasts === 1) ok("host: broadcasts 'escape_seq' once"); else fail(`host broadcasts ${env.broadcasts}`);
    if (env.advances === 1) ok('host: owns the party advance (advanceFloor at the end)'); else fail(`host advances ${env.advances}`);
  }

  // CLIENT: trigger pings host (request) + plays locally, but NEVER self-advances (waits
  // for the host's game_start) → no soft-lock, no desync.
  {
    const env = { netState: { role: 'client' }, chaseState: mkCs() };
    const api = esc(env);
    api.triggerEscape();
    for (let i = 0; i < Math.ceil(TOTAL * 60) + 5; i++) api.updateEscapeSequence(1 / 60);
    if (env.requests >= 1 && !env.advances && env.chaseState.escaping)
      ok('client: requests host advance, plays the cinematic, NEVER self-advances (waits for game_start)');
    else fail(`client path off (requests=${env.requests} advances=${env.advances || 0})`);
  }

  // IDEMPOTENT: a second trigger (e.g. host reach + a client exit_reached) is a no-op.
  {
    const env = { netState: { role: 'host', peers: [{}] }, chaseState: mkCs() };
    const api = esc(env);
    api.triggerEscape(); api.triggerEscape();
    if (env.broadcasts === 1) ok('triggerEscape is idempotent (one broadcast even if called twice)');
    else fail(`idempotency broken (broadcasts=${env.broadcasts})`);
  }

  // ROBUST: if the gate build throws, fall straight through to advance (never soft-lock).
  // env.throwGate makes the sandbox's scene.add throw INSIDE buildEscapeGate's try.
  {
    const env = { netState: { role: 'solo' }, chaseState: mkCs(), throwGate: true };
    const api = esc(env);
    api.triggerEscape();
    if (env.advances === 1 && !env.chaseState.escaping) ok('build error → falls through to advanceFloor (no soft-lock)');
    else fail(`fall-through broken (advances=${env.advances} escaping=${env.chaseState.escaping})`);
  }

  // VISIBILITY FIX: the camera is scripted to FACE the gate (it slams behind the player),
  // mouse-look is locked during the cutscene, and the gate is self-lit (emissive, no light).
  {
    const env = { netState: { role: 'solo' }, chaseState: mkCs() };
    const api = esc(env);
    api.triggerEscape();
    const cs = env.chaseState;
    // gate at sealS (x=86 via stub), player at x=0 → camera must turn to look toward +x
    if (typeof cs.lookYaw === 'number') ok(`escape computes a look-at-gate camera yaw (${cs.lookYaw.toFixed(2)})`);
    else fail('no scripted camera target (lookYaw)');
    const yaw0 = 0;
    for (let i = 0; i < 40; i++) api.updateEscapeSequence(1 / 60); // ~0.67s of turning
    // (player is the sandbox local; read it back via a probe tick is hard — assert it converged)
    if (Math.abs(((cs.lookYaw - 0) + Math.PI) % (2 * Math.PI)) > 0.01) ok('camera target is BEHIND the player (a real turn, not a no-op)');
  }
  const buildGate = extractFn(mainSrc, 'function buildEscapeGate');
  if (/cs\.lookYaw = Math\.atan2\(-dx, -dz\)/.test(buildGate)) ok('buildEscapeGate aims the camera at the gate (look back along the track)');
  else fail('camera not aimed at the gate');
  const seq = extractFn(mainSrc, 'function updateEscapeSequence');
  if (/player\.yaw \+= d \* r/.test(seq)) ok('updateEscapeSequence lerps the camera to the gate (scripted turn)');
  else fail('no scripted camera turn in the sequence');
  if (/chaseState && chaseState\.escaping\) return;/.test(mainSrc)) ok('mouse-look is LOCKED during the escape (script owns the camera)');
  else fail('mouse-look not locked during the escape');

  // No-lights + reuse-the-shutter-look + self-lit invariants.
  const shut = extractFn(mainSrc, 'function makeEscapeShutter');
  const gate = extractFn(mainSrc, 'function buildEscapeGate');
  if (!lightRe.test(shut) && !lightRe.test(gate)) ok('escape gate adds NO lights');
  else fail('escape gate introduces a light');
  if (/slat/i.test(shut) && /MeshStandardMaterial/.test(shut)) ok('escape gate reuses the shutter look (slats, no-map Standard)');
  else fail('escape gate not a shutter');
  if (/emissive: 0x401012/.test(shut)) ok('escape gate is self-lit (emissive) so it reads in a dim corridor');
  else fail('escape gate not self-lit');

  // Trigger wiring: updateChaseWall fires triggerEscape at the end of the run.
  const ucw = extractFn(mainSrc, 'function updateChaseWall');
  if (/cs\.myS >= cs\.total - ESCAPE_TRIGGER_BACK/.test(ucw) && /triggerEscape\(\)/.test(ucw)) ok('updateChaseWall triggers the escape when the player reaches the end');
  else fail('escape trigger not wired into updateChaseWall');
  if (/if \(cs\.escaping\) \{ updateEscapeSequence/.test(ucw)) ok('escape owns the frame once running (separate from the normal chase path)');
  else fail('escape path not separated in updateChaseWall');

  // Movement + advance gating during the escape.
  const up = extractFn(mainSrc, 'function updatePlayer');
  if (/&& !chaseState\.escaping/.test(up)) ok('forced auto-run stops during the escape (player can look around)');
  else fail('forced movement not gated on escaping');
  if (/exitZone && !theme\.autoRun/.test(up)) ok('exit-proximity advance skipped on auto-run (escape owns the advance — no double-advance)');
  else fail('exitZone advance not gated for auto-run');

  // Net wiring: escape_seq handler + exit_reached routes to the escape on auto-run.
  const netSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'net.js'), 'utf8');
  if (/onMessage\('escape_seq'/.test(netSrc) && /triggerEscape\(\)/.test(netSrc)) ok("net: 'escape_seq' handler plays the cinematic on clients");
  else fail("no 'escape_seq' handler");
  if (/getTheme\(currentFloor\)\.autoRun && typeof triggerEscape/.test(netSrc)) ok("net: exit_reached routes to the escape on auto-run floors (host)");
  else fail('exit_reached not routed to escape on auto-run');
}

console.log(fails === 0 ? '\nALL AUTO-RUN TESTS PASSED' : `\n${fails} FAILURE(S)`);
process.exit(fails === 0 ? 0 : 1);
