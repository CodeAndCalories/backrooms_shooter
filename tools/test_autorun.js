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
}

console.log(fails === 0 ? '\nALL AUTO-RUN TESTS PASSED' : `\n${fails} FAILURE(S)`);
process.exit(fails === 0 ? 0 : 1);
