// Audio-pass verifier. Sound is browser-only, but two things are deterministic
// and worth guarding headlessly: (1) the mob-vocalization CONCURRENCY CAP (so a
// wave can't become a cacophony), and (2) that every mob synth BRANCH actually
// runs without throwing (a typo in a rarely-hit type/kind would otherwise only
// surface in-game). It extracts the REAL vocalSlot/_vNoise/_vTone/playMobVocal
// from js/audio.js and drives them over a fake Web Audio graph, then regex-checks
// the per-theme ambient beds + the trigger/broadcast wiring across the files.
// Usage: node tools/test_audio.js

const fs = require('fs');
const path = require('path');
const audioSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'audio.js'), 'utf8');
const mainSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'main.js'), 'utf8');
const enemSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'enemies.js'), 'utf8');
const netSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'net.js'), 'utf8');

function sliceBalanced(s, from) {
  const open = s[from], close = open === '{' ? '}' : ']';
  let depth = 0;
  for (let i = from; i < s.length; i++) {
    if (s[i] === open) depth++;
    else if (s[i] === close && --depth === 0) return i;
  }
  throw new Error('unbalanced from ' + from);
}
function extractFn(src, decl) {
  const i = src.indexOf(decl);
  if (i < 0) throw new Error('not found: ' + decl);
  const bodyOpen = src.indexOf('{', src.indexOf(')', i));
  return src.slice(i, sliceBalanced(src, bodyOpen) + 1);
}
function constVal(src, name) {
  const m = src.match(new RegExp('const ' + name + '\\s*=\\s*([^;]+);'));
  if (!m) throw new Error('const not found: ' + name);
  return m[1];
}

let fails = 0;
const fail = (m) => { fails++; console.error('FAIL: ' + m); };
const ok = (m) => console.log('  ok: ' + m);

const api = new Function(`
  let activeVocals = 0;
  const MOB_VOCAL_CAP = ${constVal(audioSrc, 'MOB_VOCAL_CAP')};
  const timers = [];
  function setTimeout(fn) { timers.push(fn); return timers.length - 1; }
  let panners = 0, lastPannerTarget = null;
  const P = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {}, setTargetAtTime() {} });
  const node = (extra) => Object.assign({ connect(t) { this._t = t; return t; }, disconnect() {}, start() {}, stop() {}, frequency: P(), detune: P(), gain: P(), Q: P(), pan: P(), type: '', buffer: null, loop: false }, extra || {});
  const sfxGain = node();
  const audioCtx = {
    sampleRate: 44100, currentTime: 0,
    createOscillator: () => node(),
    createGain: () => node(),
    createBiquadFilter: () => node(),
    createBufferSource: () => node(),
    createDelay: () => node({ delayTime: P() }),
    createStereoPanner: () => { panners++; const n = node(); n.connect = (t) => { lastPannerTarget = t; n._t = t; return t; }; return n; },
    createBuffer: (ch, len) => ({ getChannelData: () => new Float32Array(len) })
  };
  ${extractFn(audioSrc, 'function vocalSlot')}
  ${extractFn(audioSrc, 'function _vNoise')}
  ${extractFn(audioSrc, 'function _vTone')}
  ${extractFn(audioSrc, 'function playMobVocal')}
  return {
    playMobVocal, vocalSlot, MOB_VOCAL_CAP, sfxGain,
    getActive: () => activeVocals,
    resetActive: () => { activeVocals = 0; },
    fireAllTimers: () => { const c = timers.splice(0); for (const fn of c) fn(); },
    panners: () => panners,
    lastTarget: () => lastPannerTarget
  };
`)();

/* ── 1. concurrency cap ── */
console.log('1. mob-vocal concurrency cap');
{
  const CAP = api.MOB_VOCAL_CAP;
  api.resetActive();
  let granted = 0;
  for (let i = 0; i < CAP + 3; i++) if (api.vocalSlot(0.3, false)) granted++;
  if (granted !== CAP) fail(`idle cap: granted ${granted}, expected ${CAP}`); else ok(`idle vocals capped at ${CAP}`);
  // important (aggro/attack/roar) gets a small reserve above the idle cap
  let extra = 0;
  for (let i = 0; i < 4; i++) if (api.vocalSlot(0.3, true)) extra++;
  if (extra !== 2) fail(`important reserve: granted ${extra} extra, expected 2`); else ok('important events get a +2 reserve over idle');
  // when voices finish (their timers fire) slots free up again
  api.fireAllTimers();
  if (api.getActive() !== 0) fail(`active not drained after timers fired: ${api.getActive()}`); else ok('slots free as voices end');
  if (!api.vocalSlot(0.3, false)) fail('no slot after draining'); else ok('new vocals allowed again after draining');
}

/* ── 2. every synth branch runs (no throw) + routes through sfxGain ── */
console.log('2. playMobVocal synth branches');
{
  const types = ['crawler', 'danger_crawler', 'spider', 'stalker', 'danger_stalker', 'phantom', 'partygoer', 'chaser', 'mystery'];
  const kinds = ['idle', 'aggro', 'attack', 'roar'];
  let threw = 0, routed = true, made = true;
  for (const ty of types) {
    for (const k of kinds) {
      api.resetActive();           // ensure the cap never blocks the smoke test
      api.fireAllTimers();
      const before = api.panners();
      try {
        api.playMobVocal(ty, k, 0.3, 0.25);
      } catch (e) { threw++; fail(`playMobVocal('${ty}','${k}') threw: ${e.message}`); continue; }
      if (api.panners() !== before + 1) made = false;
      if (api.lastTarget() !== api.sfxGain) routed = false;
    }
  }
  if (!threw) ok(`all ${types.length}×${kinds.length} type/kind combos synthesize without throwing`);
  if (made) ok('each vocal builds a StereoPanner'); else fail('a vocal did not create its panner');
  if (routed) ok('every vocal routes through sfxGain (volume slider applies)'); else fail('a vocal was not routed to sfxGain');
}

/* ── 3. per-theme ambient beds present ── */
console.log('3. per-theme ambient beds (startAmbient)');
{
  const sa = extractFn(audioSrc, 'function startAmbient');
  const beds = [
    ['Lobby buzz (id 0)', /theme\.id === 0/],
    ['Pipe Dreams clanks (id 2)', /theme\.id === 2/],
    ['Electrical hum+zap (id 6)', /theme\.id === 6/],
    ['Hospital air+beeps (id 10)', /theme\.id === 10/],
    ['Freezer rumble+groan (id 13)', /theme\.id === 13/],
    ['Pools water bed', /theme\.water/]
  ];
  for (const [label, re] of beds) { if (!re.test(sa)) fail(`ambient bed missing: ${label}`); else ok(`bed: ${label}`); }
  if (!/theme\.id === 5 \|\| theme\.archetype === 'chase'/.test(sa)) fail('startAmbient should skip Level Fun + chase (dedicated audio)'); else ok('skips floors with dedicated audio (Level Fun / chase)');
  if (!/else \{\s*\/\/ GENERIC|GENERIC quiet/.test(sa) && !/startHum\(0\.014/.test(sa)) fail('no generic room-tone fallback'); else ok('generic quiet room-tone fallback for other floors');
  if (!/function stopAmbient/.test(audioSrc)) fail('stopAmbient missing (teardown)'); else ok('stopAmbient teardown present');
  // rebuilt per floor (not just at game start)
  if (!/updateFloorMusic\(\);[\s\S]{0,400}startAmbient\(\);/.test(mainSrc)) fail('startAmbient not called per-floor in buildMazeScene'); else ok('ambient bed rebuilt every floor (buildMazeScene)');
}

/* ── 4. mob vocal triggers + co-op broadcast wiring ── */
console.log('4. vocal triggers + co-op broadcast');
{
  // main.js spatializer + host event helper
  if (!/function mobVocalLocal\(/.test(mainSrc)) fail('mobVocalLocal missing'); else ok('mobVocalLocal (distance/pan spatializer) present');
  if (!/function hostMobVocal\(/.test(mainSrc)) fail('hostMobVocal missing'); else ok('hostMobVocal (local + broadcast) present');
  // enemies.js triggers: aggro on roam→hunt, attack, chaser roar, idle
  if (!/hostMobVocal\(e\.type, 'aggro'/.test(enemSrc)) fail('no aggro vocal on roam→hunt'); else ok('aggro screech on roam→hunt transition');
  if (!/hostMobVocal\(e\.type, 'attack'/.test(enemSrc)) fail('no attack vocal'); else ok('attack vocal on a landed hit');
  if (!/hostMobVocal\('chaser', 'roar'/.test(enemSrc)) fail('no chaser roar'); else ok('relentless chaser roar (Hotel Chase)');
  if (!/mobVocalLocal\(e\.type, 'idle'/.test(enemSrc)) fail('no idle vocal (host)'); else ok('idle ambience vocals (host, local)');
  // net.js: broadcast + handler + client mirror idle
  if (!/function netBroadcastMobVocal/.test(netSrc)) fail('netBroadcastMobVocal missing'); else ok('netBroadcastMobVocal (host→all)');
  if (!/onMessage\('mob_vocal'/.test(netSrc)) fail("no 'mob_vocal' handler"); else ok("'mob_vocal' handler (clients re-spatialize locally)");
  if (!/mobVocalLocal\(m\.type, 'idle'/.test(netSrc)) fail('clients do not voice mirror idle ambience'); else ok('clients voice their own mirror idle ambience');
}

/* ── 5. balloon pop + growl ── */
console.log('5. balloon pop + party growl');
{
  const pop = extractFn(audioSrc, 'function playBalloonPop');
  if (!/SNAP/.test(pop) || !/FWIP|LATEX/.test(pop)) fail('balloon pop not improved (snap + latex fwip)'); else ok('balloon pop: crisp snap + latex fwip + recoil blip');
  const growl = extractFn(audioSrc, 'function playPartyGrowl');
  if (!/sub-octave|menace|rising/.test(growl)) fail('party growl not made more menacing'); else ok('party growl deepened (sub-octave + rising anger)');
}

console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL AUDIO-PASS CHECKS PASSED');
process.exit(fails ? 1 : 0);
