// Scripted-scare verifier. Extracts the REAL code from js/main.js (no copies to
// drift — same approach as test_weapons.js) and checks:
//   - placeScareTriggers is DETERMINISTIC per floorSeed (co-op: same WHERE on
//     every machine) and varies across floors;
//   - it consumes ZERO world rng() draws (uses a floorSeed-derived prng), so it
//     can't shift spawn/exit/ammo placement — proven by a spy on rng();
//   - constraints: ≤2 triggers/floor, none within 6 cells of spawn, timer
//     windows always ≥ SCARE_SAFE_TIME, proximity radii positive;
//   - rollScareType honors per-floor flavor (pools→roar, dark→lights out,
//     Level Fun→watcher) while keeping every type possible;
//   - light-budget invariant: the scare code never creates a PointLight (effects
//     are intensity-only).
// Usage: node tools/test_scares.js

const fs = require('fs');
const path = require('path');
const mainSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'main.js'), 'utf8');

function sliceBalanced(src, from) {
  const open = src[from], close = open === '{' ? '}' : ']';
  let depth = 0;
  for (let i = from; i < src.length; i++) {
    if (src[i] === open) depth++;
    else if (src[i] === close && --depth === 0) return i;
  }
  throw new Error('unbalanced from ' + from);
}
function extract(src, decl) {
  const i = src.indexOf(decl);
  if (i < 0) throw new Error('not found: ' + decl);
  if (decl.startsWith('function')) {
    const bodyOpen = src.indexOf('{', src.indexOf(')', i));
    return src.slice(i, sliceBalanced(src, bodyOpen) + 1);
  }
  const eq = src.indexOf('=', i);
  let j = eq;
  while (src[j] !== '[' && src[j] !== '{') j++;
  return src.slice(i, sliceBalanced(src, j) + 1) + ';';
}
function lineWith(src, needle) {
  const i = src.indexOf(needle);
  const a = src.lastIndexOf('\n', i) + 1, b = src.indexOf('\n', i);
  return src.slice(a, b);
}

let fails = 0;
const fail = (msg) => { fails++; console.error('FAIL: ' + msg); };
const ok = (msg) => console.log('  ok: ' + msg);

/* ── a 15x15 grid: all floor(1) with a wall(0) border ── */
function makeGrid() {
  const g = [];
  for (let y = 0; y < 15; y++) { g[y] = []; for (let x = 0; x < 15; x++) g[y][x] = (x === 0 || y === 0 || x === 14 || y === 14) ? 0 : 1; }
  return g;
}

// Build a sandbox that runs placeScareTriggers for a given floorSeed and returns
// the produced triggers + how many times the WORLD rng() was called (must be 0).
function place(floorSeed) {
  return new Function(`
    ${extract(mainSrc, 'function mulberry32')}
    const CELL = 4;
    const SCARE_SAFE_TIME = 30;
    let rngCalls = 0;
    let rng = () => { rngCalls++; return 0.5; };   // WORLD rng spy — must stay untouched
    let floorSeed = ${floorSeed} >>> 0;
    let mazeGrid = (${makeGrid.toString()})();
    let scareTriggers = [], scaresFiredThisFloor = 0, scareMaxThisFloor = 0;
    let scareLightsOut = null, scarePulse = 0, scareAmbientDim = null;
    ${extract(mainSrc, 'function placeScareTriggers')}
    placeScareTriggers({ isBoss: false, name: 'Test', archetype: 'rooms', darknessLevel: 0 });
    return { triggers: scareTriggers, max: scareMaxThisFloor, rngCalls };
  `)();
}

/* ── 1. determinism + zero world draws ── */
console.log('1. placement determinism + world-rng isolation');
const a1 = place(12345), a2 = place(12345);
if (JSON.stringify(a1.triggers) !== JSON.stringify(a2.triggers)) fail('same floorSeed produced different triggers'); else ok('same floorSeed → identical triggers');
if (a1.rngCalls !== 0) fail(`placeScareTriggers called the world rng() ${a1.rngCalls}x`); else ok('consumes 0 world rng() draws');
let varied = false;
const seeds = [1, 2, 7, 99, 4242, 88888];
const sigs = seeds.map(s => JSON.stringify(place(s).triggers));
for (let i = 1; i < sigs.length; i++) if (sigs[i] !== sigs[0]) varied = true;
if (!varied) fail('triggers identical across all floors'); else ok('triggers vary across floors');

/* ── 2. constraints across many seeds ── */
console.log('2. constraints over 500 seeds');
let badCount = 0, nearSpawn = 0, badTimer = 0, badRadius = 0;
for (let s = 1; s <= 500; s++) {
  const { triggers, max } = place(s * 2654435761);
  if (max > 2 || triggers.length > 2) badCount++;
  for (const tr of triggers) {
    const gx = Math.floor(tr.wx / 4), gy = Math.floor(tr.wz / 4);
    if (Math.abs(gx - 1) + Math.abs(gy - 1) < 6) nearSpawn++;
    if (tr.kind === 'timer' && tr.at < 30) badTimer++;
    if (tr.kind === 'prox' && !(tr.radius > 0)) badRadius++;
  }
}
if (badCount) fail(`${badCount} floors exceeded 2 scares`); else ok('≤2 scares on every floor');
if (nearSpawn) fail(`${nearSpawn} triggers placed too close to spawn`); else ok('no trigger within 6 cells of spawn');
if (badTimer) fail(`${badTimer} timer windows fired before the 30s safe time`); else ok('every timer window ≥ 30s');
if (badRadius) fail(`${badRadius} proximity triggers had a non-positive radius`); else ok('proximity radii all positive');

/* ── 3. boss floors get NO scares ── */
console.log('3. boss floors');
const bossRun = new Function(`
  ${extract(mainSrc, 'function mulberry32')}
  const CELL = 4; const SCARE_SAFE_TIME = 30;
  let rng = () => 0.5; let floorSeed = 999 >>> 0;
  let mazeGrid = (${makeGrid.toString()})();
  let scareTriggers = [], scaresFiredThisFloor = 0, scareMaxThisFloor = 0;
  let scareLightsOut = null, scarePulse = 0, scareAmbientDim = null;
  ${extract(mainSrc, 'function placeScareTriggers')}
  placeScareTriggers({ isBoss: true, name: 'Boss', archetype: 'arena' });
  return scareTriggers.length;
`)();
if (bossRun !== 0) fail(`boss floor produced ${bossRun} triggers`); else ok('boss floor → 0 triggers');

/* ── 4. theme flavor weighting ── */
console.log('4. rollScareType flavor (4000 samples each)');
const roller = new Function(`
  const SCARE_TYPES = ['lightsout','watcher','roar','slam'];
  ${extract(mainSrc, 'function rollScareType')}
  return rollScareType;
`)();
function modal(theme) {
  const c = { lightsout: 0, watcher: 0, roar: 0, slam: 0 };
  for (let i = 0; i < 4000; i++) c[roller(theme)]++;
  return Object.entries(c).sort((a, b) => b[1] - a[1])[0][0];
}
const pm = modal({ archetype: 'pools', darknessLevel: 0.1, name: 'The Poolrooms' });
if (pm !== 'roar') fail(`pools floor modal scare = ${pm}, expected roar`); else ok('pools floor favors DISTANT ROAR');
const dm = modal({ archetype: 'rooms', darknessLevel: 0.85, name: 'The Dark' });
if (dm !== 'lightsout') fail(`dark floor modal scare = ${dm}, expected lightsout`); else ok('dark floor favors LIGHTS OUT');
const lm = modal({ archetype: 'rooms', darknessLevel: 0, name: 'Level Fun =)' });
if (lm !== 'watcher') fail(`Level Fun modal scare = ${lm}, expected watcher`); else ok('Level Fun favors THE WATCHER');
// every type still reachable on a neutral floor
const neutral = { archetype: 'rooms', darknessLevel: 0, name: 'Neutral' };
const seen = new Set(); for (let i = 0; i < 4000; i++) seen.add(roller(neutral));
if (seen.size !== 4) fail(`neutral floor only produced ${seen.size}/4 scare types`); else ok('all 4 scare types still possible');

/* ── 5. light-budget invariant: scares are intensity-only ── */
console.log('5. light budget (intensity-only)');
const scareBlockStart = mainSrc.indexOf('SCRIPTED SCARE EVENTS');
const scareBlockEnd = mainSrc.indexOf('GAME FLOW', scareBlockStart);
const scareBlock = mainSrc.slice(scareBlockStart, scareBlockEnd);
if (/new THREE\.PointLight|new THREE\.SpotLight/.test(scareBlock)) fail('scare code creates a new light (budget risk)'); else ok('scare code creates NO new point/spot lights');
if (!/scareOwnsLights\(\)/.test(lineWith(mainSrc, 'if (!scareOwnsLights())'))) fail('updateLights does not yield to active scares'); else ok('updateLights yields light control during scares');
if (!/f\.light\.intensity = f\.base/.test(scareBlock)) fail('lights-out does not restore light base intensity'); else ok('lights restored to base intensity after a scare');

console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL SCARE CHECKS PASSED');
process.exit(fails ? 1 : 0);
