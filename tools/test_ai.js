// Enemy-AI steering verifier. Extracts the REAL wall-avoidance helpers from
// js/enemies.js (isOpenCell / steerAround) and checks:
//   - isOpenCell treats floor(1)/pool(2) as open, walls(0)/out-of-bounds as solid;
//   - steerAround passes a clear heading through unchanged, and when the heading
//     runs into a wall it returns a rotated heading whose look-ahead cell IS open
//     (the mob rounds the corner instead of jamming the wall);
//   - the roam/hunt threshold constants are ordered sanely.
// (Full AI feel — roam wander, hunt pursuit, LOS detection — is browser-verified;
// this guards the geometric core that the playtest flagged: wall-sticking.)
// Usage: node tools/test_ai.js

const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'enemies.js'), 'utf8');

function sliceBalanced(s, from) {
  const open = s[from], close = open === '{' ? '}' : ']';
  let depth = 0;
  for (let i = from; i < s.length; i++) {
    if (s[i] === open) depth++;
    else if (s[i] === close && --depth === 0) return i;
  }
  throw new Error('unbalanced');
}
function extractFn(decl) {
  const i = src.indexOf(decl);
  if (i < 0) throw new Error('not found: ' + decl);
  const bodyOpen = src.indexOf('{', src.indexOf(')', i));
  return src.slice(i, sliceBalanced(src, bodyOpen) + 1);
}
function constVal(name) {
  const re = new RegExp('const ' + name + '\\s*=\\s*([^;]+);');
  const m = src.match(re);
  if (!m) throw new Error('const not found: ' + name);
  return m[1];
}

let fails = 0;
const fail = (m) => { fails++; console.error('FAIL: ' + m); };
const ok = (m) => console.log('  ok: ' + m);

// 5x5 grid: border walls; a wall at (x=2,y=1) blocks due-east of cell (1,1).
//   row1:  0 1 0 1 0     ← x=2 is a wall
//   row2:  0 1 1 1 0
const grid = [
  [0, 0, 0, 0, 0],
  [0, 1, 0, 1, 0],
  [0, 1, 1, 1, 0],
  [0, 1, 1, 2, 0], // (3,3) is a POOL cell (value 2) — must count as open
  [0, 0, 0, 0, 0],
];

const api = new Function(`
  const CELL = 4;
  let mazeGrid = ${JSON.stringify(grid)};
  const _steer = { x: 0, z: 0 };
  ${constVal('_whiskers') ? `const _whiskers = ${constVal('_whiskers')};` : ''}
  ${extractFn('function isOpenCell')}
  ${extractFn('function steerAround')}
  const LOOK = CELL * 0.85;
  return {
    isOpenCell,
    steerAround,
    aheadOpen: (px, pz, d) => isOpenCell(px + d.x * LOOK, pz + d.z * LOOK),
  };
`)();

const cellCenter = (cx, cy) => ({ x: cx * 4 + 2, z: cy * 4 + 2 });

/* ── 1. isOpenCell ── */
console.log('1. isOpenCell');
if (!api.isOpenCell(6, 6)) fail('floor cell (1,1) read as solid'); else ok('floor cell → open');
if (api.isOpenCell(10, 6)) fail('wall cell (2,1) read as open'); else ok('wall cell → solid');
if (!api.isOpenCell(14, 14)) fail('pool cell (3,3) read as solid'); else ok('pool(2) cell → open');
if (api.isOpenCell(-5, 6)) fail('out-of-bounds read as open'); else ok('out-of-bounds → solid');

/* ── 2. steerAround passes a clear heading ── */
console.log('2. clear heading unchanged');
{
  const p = cellCenter(1, 2); // (6,10) — east neighbor (2,2) is open
  const d = api.steerAround(p.x, p.z, 1, 0);
  if (Math.abs(d.x - 1) > 1e-9 || Math.abs(d.z) > 1e-9) fail(`clear heading altered → (${d.x.toFixed(2)},${d.z.toFixed(2)})`);
  else ok('open path ahead → heading unchanged');
}

/* ── 3. steerAround rounds a wall ── */
console.log('3. wall avoidance');
{
  const p = cellCenter(1, 1); // (6,6) — due-east (2,1) is a WALL
  const d = api.steerAround(p.x, p.z, 1, 0);
  // it must have turned AND the new heading's look-ahead cell must be open
  const turned = Math.abs(d.x - 1) > 1e-6 || Math.abs(d.z) > 1e-6;
  const opensUp = api.aheadOpen(p.x, p.z, d);
  if (!turned) fail('heading into a wall was not adjusted'); else ok('blocked heading was rotated');
  if (!opensUp) fail('steered heading still points into a wall'); else ok('steered heading clears the wall (rounds the corner)');
}

/* ── 4. behavior constants sane ── */
console.log('4. roam/hunt constants');
// Thresholds are stored in CELL units (load-order safety: enemies.js runs
// before main.js defines CELL) and converted to world units in updateEnemies.
const sandbox2 = new Function(`
  const CELL = 4;
  const HUNT_NEAR = CELL * (${constVal('HUNT_NEAR_CELLS')});
  const HUNT_VISION = CELL * (${constVal('HUNT_VISION_CELLS')});
  const HUNT_MEMORY = ${constVal('HUNT_MEMORY')};
  const ROAM_SPEED_MULT = ${constVal('ROAM_SPEED_MULT')};
  return { HUNT_NEAR, HUNT_VISION, HUNT_MEMORY, ROAM_SPEED_MULT };
`)();
if (!(sandbox2.HUNT_NEAR < sandbox2.HUNT_VISION)) fail('HUNT_NEAR should be < HUNT_VISION'); else ok('near-detect radius < vision radius');
if (!(sandbox2.HUNT_MEMORY > 0)) fail('HUNT_MEMORY must be positive'); else ok('hunt memory positive');
if (!(sandbox2.ROAM_SPEED_MULT > 0 && sandbox2.ROAM_SPEED_MULT < 1)) fail('ROAM_SPEED_MULT should be in (0,1)'); else ok('roamers slower than hunters');
// danger variants always hunt; the rest get a roam roll → a mix exists
if (!/behavior:\s*\(type\.indexOf\('danger_'\)\s*===\s*0\s*\|\|\s*forcePos\)\s*\?\s*'hunt'/.test(src)) fail('danger/forced spawns are not forced to hunt'); else ok('danger + forced spawns always hunt; others roll roam/hunt');

console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL AI STEERING CHECKS PASSED');
process.exit(fails ? 1 : 0);
