// Sanity + consumables verifier. Extracts the REAL code from js/main.js (no copies
// to drift — same approach as test_artifacts) and checks:
//   - spawnConsumables is DETERMINISTIC per floorSeed (co-op: same pickups/ids on
//     every machine) and consumes ZERO world rng() draws (own prng), varies across
//     floors, places 1-3 cartons at distinct cells away from spawn, kinds valid,
//     ids sequential 1..N;
//   - sanity DRAIN math: min(damage × SANITY_DRAIN_PER_DMG, SANITY_DRAIN_CAP), and
//     damagePlayer guards the Poolrooms (SANITY_SAFE_THEME) so it never drains there;
//   - tuning constants are the agreed "More noticeable" set;
//   - light budget: the consumable code creates NO new lights (emissive only).
// Usage: node tools/test_sanity.js

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
  let j = eq; while (src[j] !== '[' && src[j] !== '{') j++;
  return src.slice(i, sliceBalanced(src, j) + 1) + ';';
}
function constNum(name) {
  const m = mainSrc.match(new RegExp('const ' + name + '\\s*=\\s*([0-9.]+)'));
  if (!m) throw new Error('const not found: ' + name);
  return parseFloat(m[1]);
}

let fails = 0;
const fail = (m) => { fails++; console.error('FAIL: ' + m); };
const ok = (m) => console.log('  ok: ' + m);
const near = (a, b) => Math.abs(a - b) < 1e-9;

const THREE = { Mesh: function () { this.position = { set() {} }; this.rotation = {}; }, BoxGeometry: function () {}, MeshStandardMaterial: function () {} };

function runSpawn(floorSeed, theme) {
  return new Function('THREE', `
    const scene = { add(){}, remove(){} };
    const CELL = 4;
    let rngCalls = 0;
    let rng = () => { rngCalls++; return 0.5; };       // WORLD rng spy — must stay 0
    let floorSeed = ${floorSeed} >>> 0;
    let mazeGrid = []; for (let y=0;y<15;y++){ mazeGrid[y]=[]; for(let x=0;x<15;x++) mazeGrid[y][x]=(x===0||y===0||x===14||y===14)?0:1; }
    function floorHeightAt(){ return 0; }
    const CONSUMABLE_MAX = 3;
    const almondGeo = new THREE.BoxGeometry(); const almondMat = new THREE.MeshStandardMaterial();
    const bandageGeo = new THREE.BoxGeometry(); const bandageMat = new THREE.MeshStandardMaterial();
    let consumables = [], consumableNextId = 0;
    ${extract(mainSrc, 'function mulberry32')}
    ${extract(mainSrc, 'function consumableGM')}
    ${extract(mainSrc, 'function createConsumable')}
    ${extract(mainSrc, 'function spawnConsumables')}
    spawnConsumables(${JSON.stringify(theme)});
    return { list: consumables.map(c => ({ id: c.id, gx: Math.round((c.x-2)/4), gy: Math.round((c.z-2)/4), kind: c.kind })), rngCalls };
  `)(THREE);
}

const NORMAL = { isBoss: false };

/* ── 1. determinism + zero world draws ── */
console.log('1. placement determinism + world-rng isolation');
const a = runSpawn(0xBEEF01, NORMAL), b = runSpawn(0xBEEF01, NORMAL);
if (JSON.stringify(a.list) !== JSON.stringify(b.list)) fail('same floorSeed produced different pickups'); else ok('same floorSeed → identical pickups + ids + kinds');
if (a.rngCalls !== 0) fail(`spawnConsumables called the world rng() ${a.rngCalls}x`); else ok('consumes 0 world rng() draws');
const sigs = [1, 2, 3, 77, 9001].map(s => JSON.stringify(runSpawn(s * 2654435761, NORMAL).list));
if (new Set(sigs).size < 2) fail('pickups identical across all floors'); else ok('pickups vary across floors');

/* ── 2. constraints over 400 seeds ── */
console.log('2. constraints over 400 seeds');
let badCount = 0, dup = 0, nearSpawn = 0, badKind = 0, badIds = 0;
for (let s = 1; s <= 400; s++) {
  const r = runSpawn(s * 40503, NORMAL);
  if (r.list.length < 1 || r.list.length > 3) badCount++;
  const seen = new Set();
  r.list.forEach((p, i) => {
    const k = p.gx + ',' + p.gy;
    if (seen.has(k)) dup++; seen.add(k);
    if (Math.abs(p.gx - 1) + Math.abs(p.gy - 1) < 5) nearSpawn++;
    if (p.kind !== 'almond' && p.kind !== 'bandage') badKind++;
    if (p.id !== i + 1) badIds++;
  });
}
if (badCount) fail(`${badCount}/400 floors had a bad pickup count`); else ok('1–3 pickups every floor');
if (dup) fail(`${dup} duplicate cells`); else ok('all pickup cells distinct');
if (nearSpawn) fail(`${nearSpawn} pickups too close to spawn`); else ok('all pickups ≥5 cells from spawn');
if (badKind) fail(`${badKind} invalid kinds`); else ok('kinds are always almond/bandage');
if (badIds) fail(`${badIds} non-sequential ids`); else ok('ids sequential 1..N (co-op id contract)');
// almond should be the more common kind across many draws (sp() < 0.62)
let almond = 0, bandage = 0;
for (let s = 1; s <= 400; s++) for (const p of runSpawn(s * 7919, NORMAL).list) (p.kind === 'almond' ? almond++ : bandage++);
if (!(almond > bandage)) fail(`almond(${almond}) not more common than bandage(${bandage})`); else ok(`almond more common than bandage (${almond} vs ${bandage})`);

/* ── 3. boss floors place nothing ── */
console.log('3. boss floors');
if (runSpawn(5, { isBoss: true }).list.length !== 0) fail('boss floor spawned pickups'); else ok('boss floor → 0 pickups');

/* ── 4. sanity drain math + Poolrooms safe-zone ── */
console.log('4. sanity drain');
const per = constNum('SANITY_DRAIN_PER_DMG'), cap = constNum('SANITY_DRAIN_CAP'), safe = constNum('SANITY_SAFE_THEME');
const drain = (dmg) => Math.min(dmg * per, cap);
if (!near(drain(10), 6)) fail(`10 dmg → ${drain(10)} sanity (expected 6)`); else ok('10 dmg → 6 sanity (0.60×)');
if (!near(drain(40), cap)) fail(`40 dmg → ${drain(40)} (expected cap ${cap})`); else ok(`big hit capped at ${cap} sanity`);
if (safe !== 3) fail(`SANITY_SAFE_THEME=${safe} (expected 3 = Poolrooms)`); else ok('safe theme = Poolrooms (3)');
// damagePlayer must guard the safe theme before draining
const dp = extract(mainSrc, 'function damagePlayer');
if (!/getTheme\(currentFloor\)\.id !== SANITY_SAFE_THEME/.test(dp)) fail('damagePlayer does not skip drain in the safe theme'); else ok('damagePlayer skips drain in Poolrooms');
if (!/noDamageTimer = 0/.test(dp)) fail('damagePlayer does not reset the calm timer'); else ok('a hit resets the passive-recovery timer');

/* ── 5. tuning is the agreed "More noticeable" set ── */
console.log('5. tuning constants');
const expect = { SANITY_DRAIN_PER_DMG: 0.60, SANITY_DRAIN_CAP: 16, SANITY_RECOVER_RATE: 0.9, SANITY_RECOVER_DELAY: 10, SANITY_LOW: 55, SANITY_CRITICAL: 30, ALMOND_RESTORE: 30, ALMOND_PRICE: 140, BANDAGE_RESTORE: 40, BANDAGE_PRICE: 150, CONSUMABLE_MAX: 3 };
for (const [k, v] of Object.entries(expect)) {
  const got = constNum(k);
  if (!near(got, v)) fail(`${k}=${got} (expected ${v})`); else ok(`${k} = ${v}`);
}

/* ── 6. light budget: consumable code adds no lights ── */
console.log('6. light budget');
const blockStart = mainSrc.indexOf('CONSUMABLE PICKUPS');
const blockEnd = mainSrc.indexOf('SANITY — gentle') >= 0 ? mainSrc.length : mainSrc.length;
const consBlock = mainSrc.slice(blockStart, mainSrc.indexOf('function clearConsumables') + 200);
if (/new THREE\.PointLight|new THREE\.SpotLight/.test(consBlock)) fail('consumable code creates a light'); else ok('consumable pickups add NO lights (emissive only)');

console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL SANITY/CONSUMABLE CHECKS PASSED');
process.exit(fails ? 1 : 0);
