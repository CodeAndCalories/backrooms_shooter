// Lore-objective (item gate) verifier. Extracts the REAL code from js/main.js +
// js/net.js (no copies to drift — same approach as test_weapons/test_scares) and
// checks:
//   - 3 themes carry an item gate (Crypt 2 / Hospital 3 / Archive 3); no boss
//     theme does; a normal floor defaults to the kills gate;
//   - spawnArtifacts is DETERMINISTIC per floorSeed (co-op: same artifacts/ids on
//     every machine) and consumes ZERO world rng() draws (own prng), varies
//     across floors, places the right count at distinct cells far from spawn;
//   - collectArtifact is idempotent (an id counts once) — the co-op sync can't
//     double-count;
//   - netExitGateOpen: item gate opens only when all collected (SOLO and co-op);
//     kills gate is co-op-only; boss floors always open.
// Usage: node tools/test_artifacts.js

const fs = require('fs');
const path = require('path');
const mainSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'main.js'), 'utf8');
const netSrc  = fs.readFileSync(path.join(__dirname, '..', 'js', 'net.js'), 'utf8');

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

let fails = 0;
const fail = (m) => { fails++; console.error('FAIL: ' + m); };
const ok = (m) => console.log('  ok: ' + m);

/* ── THREE / scene stubs (only what the extracted code touches) ── */
const THREE = {
  OctahedronGeometry: function () {},
  MeshStandardMaterial: function () {},
  Mesh: function () { this.position = { set() {} }; this.rotation = {}; },
};
const sceneStub = 'const scene = { add(){}, remove(){} };';

/* ── 1. theme gate config ── */
console.log('1. item-gate theme config');
const THEMES = new Function(`${extract(mainSrc, 'const LEVEL_THEMES = ')} return LEVEL_THEMES;`)();
const byName = (n) => THEMES.find(t => t.name === n);
const expect = [['The Crypt', 2], ['The Hospital', 3], ['The Archive', 3]];
for (const [name, cnt] of expect) {
  const t = byName(name);
  if (!t) { fail(`theme ${name} missing`); continue; }
  if (t.gate !== 'item') fail(`${name} gate=${t.gate} (expected item)`);
  else if (t.itemCount !== cnt) fail(`${name} itemCount=${t.itemCount} (expected ${cnt})`);
  else ok(`${name}: item gate, ${cnt} to collect`);
}
const itemThemes = THEMES.filter(t => t.gate === 'item');
if (itemThemes.length !== 3) fail(`expected exactly 3 item-gate floors, got ${itemThemes.length}`); else ok('exactly 3 item-gate floors');
if (THEMES.some(t => t.isBoss && t.gate === 'item')) fail('a boss floor has an item gate'); else ok('no boss floor has an item gate');
if (byName('The Lobby').gate) fail('The Lobby should default (no gate field = kills)'); else ok('normal floor defaults to kills gate');

/* ── sandbox that runs spawnArtifacts for a floorSeed over an open 15x15 grid ── */
function openGrid(n = 15) {
  const g = [];
  for (let y = 0; y < n; y++) { g[y] = []; for (let x = 0; x < n; x++) g[y][x] = (x === 0 || y === 0 || x === n - 1 || y === n - 1) ? 0 : 1; }
  return g;
}
function runSpawn(floorSeed, theme) {
  return new Function('THREE', `
    ${sceneStub}
    const CELL = 4;
    let rngCalls = 0;
    let rng = () => { rngCalls++; return 0.5; };       // WORLD rng spy — must stay at 0
    let floorSeed = ${floorSeed} >>> 0;
    let mazeGrid = (${openGrid.toString()})();
    function floorHeightAt(){ return 0; }
    function updateHUD(){}
    let artifacts = [], artifactNextId = 0, artifactsTotal = 0, artifactsCollected = 0;
    const ARTIFACT_RADIUS = 1.3;
    const artifactGeo = new THREE.OctahedronGeometry(0.3, 0);
    const artifactMat = new THREE.MeshStandardMaterial({});
    ${extract(mainSrc, 'function mulberry32')}
    ${extract(mainSrc, 'function createArtifact')}
    ${extract(mainSrc, 'function spawnArtifacts')}
    ${extract(mainSrc, 'function collectArtifact')}
    spawnArtifacts(${JSON.stringify(theme)});
    return {
      list: artifacts.map(a => ({ id: a.id, gx: Math.round((a.x - 2) / 4), gy: Math.round((a.z - 2) / 4) })),
      total: artifactsTotal, rngCalls,
      collectApi: { collectArtifact, get collected(){ return artifactsCollected; }, get count(){ return artifacts.length; } }
    };
  `)(THREE);
}

const ITEM = { gate: 'item', itemCount: 3, isBoss: false };

/* ── 2. determinism + zero world draws ── */
console.log('2. placement determinism + world-rng isolation');
const a = runSpawn(0xABCDEF, ITEM), b = runSpawn(0xABCDEF, ITEM);
if (JSON.stringify(a.list) !== JSON.stringify(b.list)) fail('same floorSeed produced different artifacts'); else ok('same floorSeed → identical artifacts + ids');
if (a.rngCalls !== 0) fail(`spawnArtifacts called the world rng() ${a.rngCalls}x`); else ok('consumes 0 world rng() draws');
const sigs = [1, 2, 3, 50, 9999].map(s => JSON.stringify(runSpawn(s * 2654435761, ITEM).list));
if (new Set(sigs).size < 2) fail('artifacts identical across all floors'); else ok('artifacts vary across floors');

/* ── 3. count / distinctness / distance / id sequence ── */
console.log('3. placement constraints over 400 seeds');
let badCount = 0, dup = 0, nearSpawn = 0, badIds = 0;
for (let s = 1; s <= 400; s++) {
  const r = runSpawn(s * 40503, ITEM);
  if (r.total !== 3 || r.list.length !== 3) badCount++;
  const seen = new Set();
  r.list.forEach((p, i) => {
    const k = p.gx + ',' + p.gy;
    if (seen.has(k)) dup++; seen.add(k);
    if (Math.abs(p.gx - 1) + Math.abs(p.gy - 1) < 6) nearSpawn++;
    if (p.id !== i + 1) badIds++; // sequential 1..N in creation order
  });
}
if (badCount) fail(`${badCount}/400 floors didn't place 3 artifacts`); else ok('exactly itemCount artifacts every floor');
if (dup) fail(`${dup} duplicate artifact cells`); else ok('all artifact cells distinct');
if (nearSpawn) fail(`${nearSpawn} artifacts spawned too close to spawn`); else ok('all artifacts ≥6 cells from spawn');
if (badIds) fail(`${badIds} artifacts had non-sequential ids`); else ok('ids are sequential 1..N (co-op id contract)');

/* ── 4. non-item / boss floors place nothing ── */
console.log('4. gate gating');
if (runSpawn(7, { gate: 'kills', isBoss: false }).total !== 0) fail('kills floor spawned artifacts'); else ok('kills floor → 0 artifacts');
if (runSpawn(7, { gate: 'item', isBoss: true, itemCount: 3 }).total !== 0) fail('boss floor spawned artifacts'); else ok('boss floor → 0 artifacts');

/* ── 5. collectArtifact idempotency ── */
console.log('5. collect idempotency (co-op double-count guard)');
const c = runSpawn(123, ITEM).collectApi;
const firstId = 1;
if (!c.collectArtifact(firstId)) fail('first collect of a valid id failed'); else ok('first collect succeeds + counts');
if (c.collected !== 1) fail(`collected=${c.collected} after one pickup (expected 1)`); else ok('count = 1 after first');
if (c.collectArtifact(firstId)) fail('second collect of the SAME id counted again'); else ok('re-collecting same id is a no-op (idempotent)');
if (c.collected !== 1) fail(`collected=${c.collected} after a duplicate (expected 1)`); else ok('count stays 1 — no double-count');

/* ── 6. netExitGateOpen across gate types ── */
console.log('6. netExitGateOpen');
function gateOpen(theme, role, opts = {}) {
  return new Function(`
    const netState = { role: '${role}' };
    function getTheme(){ return ${JSON.stringify(theme)}; }
    let currentFloor = 0;
    let floorKills = ${opts.floorKills || 0}, killTarget = ${opts.killTarget || 0};
    let artifactsTotal = ${opts.total || 0}, artifactsCollected = ${opts.collected || 0};
    ${extract(netSrc, 'function netExitGateOpen')}
    return netExitGateOpen();
  `)();
}
const itemTheme = { gate: 'item', isBoss: false };
// item gate: closed until all collected, in BOTH solo and co-op
if (gateOpen(itemTheme, 'solo', { total: 3, collected: 1 })) fail('item gate open with 1/3 (solo)'); else ok('solo item gate CLOSED at 1/3');
if (!gateOpen(itemTheme, 'solo', { total: 3, collected: 3 })) fail('item gate not open at 3/3 (solo)'); else ok('solo item gate OPEN at 3/3');
if (gateOpen(itemTheme, 'host', { total: 3, collected: 2 })) fail('item gate open with 2/3 (co-op)'); else ok('co-op item gate CLOSED at 2/3');
if (!gateOpen(itemTheme, 'host', { total: 3, collected: 3 })) fail('item gate not open at 3/3 (co-op)'); else ok('co-op item gate OPEN at 3/3');
// kills gate: now applies to SOLO as well as co-op
const killTheme = { gate: 'kills', isBoss: false };
if (gateOpen(killTheme, 'solo', { killTarget: 5, floorKills: 0 })) fail('solo kills gate open at 0/5'); else ok('solo kills gate CLOSED at 0/5');
if (!gateOpen(killTheme, 'solo', { killTarget: 5, floorKills: 5 })) fail('solo kills gate not open at 5/5'); else ok('solo kills gate OPEN at 5/5');
if (gateOpen(killTheme, 'host', { killTarget: 5, floorKills: 2 })) fail('co-op kills gate open at 2/5'); else ok('co-op kills gate CLOSED at 2/5');
if (!gateOpen(killTheme, 'host', { killTarget: 5, floorKills: 5 })) fail('co-op kills gate not open at 5/5'); else ok('co-op kills gate OPEN at 5/5');
// boss: always open (death spawns the exit)
if (!gateOpen({ gate: 'kills', isBoss: true }, 'host')) fail('boss gate not open'); else ok('boss floor gate always OPEN');

console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL ARTIFACT/GATE CHECKS PASSED');
process.exit(fails ? 1 : 0);
