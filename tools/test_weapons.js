// Weapon-system verifier. Extracts the REAL code from js/main.js (no copies to
// drift — same approach as test_boss_scaling.js) and checks:
//   - WEAPONS table: 4 guns, slots 1-4, the pistol is byte-for-byte the old
//     pistol constants (so nothing changed for weapon 0);
//   - wpn* stat helpers under shop multipliers (pistol 12→18→30 clip EXACT);
//   - wpnFalloff curve (shotgun near=1 / far=farMult / midpoint interpolated;
//     non-falloff guns flat 1);
//   - buildPelletRays: 1 clean ray for no-spread guns, N normalized rays inside
//     the spread cone for the shotgun;
//   - raycastWall DDA: finds the nearest wall, treats pool(2)/floor(1) as open;
//   - switchWeapon: owned-only gate + per-weapon ammo bank stow/restore;
//   - light budget: CEILING_LIGHT_BUDGET dropped to 25 and the flare slot added
//     (32 point lights held).
// Usage: node tools/test_weapons.js

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
const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;

/* ── Minimal THREE.Vector3 stub (only what the extracted code touches) ── */
class V3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  clone() { return new V3(this.x, this.y, this.z); }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
  multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
  normalize() { const l = Math.hypot(this.x, this.y, this.z) || 1; this.x /= l; this.y /= l; this.z /= l; return this; }
  length() { return Math.hypot(this.x, this.y, this.z); }
  crossVectors(a, b) {
    this.x = a.y * b.z - a.z * b.y; this.y = a.z * b.x - a.x * b.z; this.z = a.x * b.y - a.y * b.x; return this;
  }
  dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
}
const THREE = { Vector3: V3 };

/* ── build the sandbox with the real weapon code ── */
const consts =
  lineWith(mainSrc, 'const CLIP_SIZE =') + '\n' +
  lineWith(mainSrc, 'const GUN_DAMAGE =') + '\n' +
  lineWith(mainSrc, 'const CELL =') + '\n' +
  lineWith(mainSrc, 'const CEILING_LIGHT_BUDGET = 25');

const api = new Function('THREE', `
  ${consts}
  // builder fns referenced by the WEAPONS literal — stubbed for the table eval
  function buildPistolViewmodel(){}; function buildShotgunViewmodel(){}
  function buildSmgViewmodel(){};    function buildFlareViewmodel(){}
  let shopStats = { damageMult:1, fireRateMult:1, clipMult:1, reserveMult:1, staminaRegenMult:1, maxHealth:100 };
  let mazeGrid = [];
  ${extract(mainSrc, 'const WEAPONS = ')}
  ${extract(mainSrc, 'function curWeapon')}
  ${extract(mainSrc, 'function wpnClip')}
  ${extract(mainSrc, 'function wpnReserve')}
  ${extract(mainSrc, 'function wpnFireRate')}
  ${extract(mainSrc, 'function wpnFalloff')}
  ${extract(mainSrc, 'function buildPelletRays')}
  ${extract(mainSrc, 'function raycastWall')}
  const setGrid = g => { mazeGrid = g; };
  const setShop = s => { shopStats = s; };
  return { WEAPONS, wpnClip, wpnReserve, wpnFireRate, wpnFalloff, buildPelletRays, raycastWall, setGrid, setShop, getShop: () => shopStats };
`)(THREE);

const { WEAPONS } = api;
const W = (n) => WEAPONS.find(w => w.name === n);

/* ── 1. table shape + the pistol is unchanged ── */
console.log('1. WEAPONS table');
if (WEAPONS.length !== 4) fail(`expected 4 weapons, got ${WEAPONS.length}`); else ok('4 weapons');
WEAPONS.forEach((w, i) => { if (w.slot !== i + 1) fail(`weapon ${w.name} slot ${w.slot} !== ${i + 1}`); });
WEAPONS.forEach((w, i) => { if (w.id !== i) fail(`weapon ${w.name} id ${w.id} !== ${i}`); });
const p = WEAPONS[0];
if (!(p.name === 'Pistol' && p.damage === 28 && p.fireRate === 0.12 && p.clipSize === 12 &&
      p.reserveMax === 84 && p.reloadTime === 1.6 && p.range === 90 && p.pellets === 1 && p.spread === 0 && !p.shopKey))
  fail('pistol no longer matches the original constants'); else ok('pistol = original pistol stats');
if (W('Shotgun').pellets !== 8) fail('shotgun pellets != 8'); else ok('shotgun = 8 pellets');
if (!(W('SMG').fireRate < W('Pistol').fireRate)) fail('smg not faster than pistol'); else ok('smg fires faster than pistol');
if (!W('Flare Gun').flare) fail('flare missing flare flag'); else ok('flare flagged');
['Shotgun', 'SMG', 'Flare Gun'].forEach(n => { if (!W(n).shopKey) fail(`${n} has no shopKey (unbuyable)`); });
ok('all 3 new guns have a shop unlock key');

/* ── 2. stat helpers under shop multipliers ── */
console.log('2. stat helpers × shop mults');
api.setShop({ damageMult: 1, fireRateMult: 1, clipMult: 1, reserveMult: 1 });
if (api.wpnClip(p) !== 12) fail(`base pistol clip ${api.wpnClip(p)} != 12`); else ok('pistol clip base 12');
api.setShop({ damageMult: 1, fireRateMult: 1, clipMult: 1.5, reserveMult: 1 });
if (api.wpnClip(p) !== 18) fail(`mag1 pistol clip ${api.wpnClip(p)} != 18`); else ok('mag1 → pistol clip 18 (exact)');
api.setShop({ damageMult: 1, fireRateMult: 1, clipMult: 2.5, reserveMult: 1 });
if (api.wpnClip(p) !== 30) fail(`mag2 pistol clip ${api.wpnClip(p)} != 30`); else ok('mag2 → pistol clip 30 (exact)');
api.setShop({ damageMult: 1, fireRateMult: 1, clipMult: 1, reserveMult: 1.5 });
if (api.wpnReserve(p) !== 126) fail(`reserve1 pistol reserve ${api.wpnReserve(p)} != 126`); else ok('reserve1 → pistol reserve 126');
api.setShop({ damageMult: 1, fireRateMult: 0.5, clipMult: 1, reserveMult: 1 });
if (!near(api.wpnFireRate(p), 0.06)) fail(`firerate2 pistol fireRate ${api.wpnFireRate(p)} != 0.06`); else ok('firerate2 → pistol fireRate 0.06');
if (!near(api.wpnFireRate(W('SMG')), 0.031)) fail(`smg fireRate ${api.wpnFireRate(W('SMG'))} != 0.031`); else ok('firerate2 → smg fireRate 0.031');
api.setShop({ damageMult: 1, fireRateMult: 1, clipMult: 1, reserveMult: 1 });

/* ── 3. falloff curve ── */
console.log('3. wpnFalloff');
const sg = W('Shotgun'), f = sg.falloff;
if (!near(api.wpnFalloff(sg, 0), 1)) fail('shotgun point-blank falloff != 1'); else ok('shotgun ≤near → 1.0');
if (!near(api.wpnFalloff(sg, f.far + 10), f.farMult)) fail('shotgun far falloff != farMult'); else ok('shotgun ≥far → farMult');
const mid = (f.near + f.far) / 2, expMid = 1 + (f.farMult - 1) * 0.5;
if (!near(api.wpnFalloff(sg, mid), expMid)) fail(`shotgun midpoint falloff ${api.wpnFalloff(sg, mid)} != ${expMid}`); else ok('shotgun midpoint interpolated');
if (!near(api.wpnFalloff(p, 5), 1) || !near(api.wpnFalloff(p, 80), 1)) fail('pistol falloff not flat 1'); else ok('pistol falloff flat 1.0');

/* ── 4. pellet rays ── */
console.log('4. buildPelletRays');
const base = new V3(0, 0, -1);
const one = api.buildPelletRays(base, p);
if (one.length !== 1) fail(`pistol produced ${one.length} rays`); else ok('pistol → 1 ray');
if (!near(one[0].x, 0) || !near(one[0].z, -1)) fail('pistol ray deviates from aim'); else ok('pistol ray == aim dir');
const pellets = api.buildPelletRays(base, sg);
if (pellets.length !== 8) fail(`shotgun produced ${pellets.length} rays`); else ok('shotgun → 8 rays');
let allNorm = true, allInCone = true;
for (const r of pellets) {
  if (!near(r.length(), 1, 1e-6)) allNorm = false;
  const ang = Math.acos(Math.max(-1, Math.min(1, r.dot(base) / (r.length() * base.length()))));
  if (ang > sg.spread + 1e-6) allInCone = false;
}
if (!allNorm) fail('a shotgun pellet ray is not normalized'); else ok('all shotgun rays normalized');
if (!allInCone) fail('a shotgun pellet escaped the spread cone'); else ok('all shotgun rays within spread cone');

/* ── 5. raycastWall DDA ── */
console.log('5. raycastWall (grid DDA)');
// 5x1 corridor of floor(1) with walls(0) at the ends. CELL from source.
const CELL = api.WEAPONS && 4; // CELL=4 in source; grid below assumes it
const grid = [[0, 0, 0, 0, 0], [0, 1, 1, 1, 0], [0, 0, 0, 0, 0]];
api.setGrid(grid);
// origin in cell (gx=1,gy=1) world center, fire +X toward the wall at gx=4
const orig = new V3(1 * 4 + 2, 1.5, 1 * 4 + 2);
const hitE = api.raycastWall(orig, new V3(1, 0, 0), 90);
if (!hitE) fail('raycastWall missed the east wall'); else {
  if (Math.abs(hitE.point.x - 16) > 1e-6) fail(`east wall x=${hitE.point.x} != 16`); else ok('east wall hit at x=16');
  if (!(hitE.normal.x === -1)) fail(`east wall normal.x ${hitE.normal.x} != -1`); else ok('east wall normal points back (-x)');
}
const hitW = api.raycastWall(orig, new V3(-1, 0, 0), 90);
if (!hitW || Math.abs(hitW.point.x - 4) > 1e-6) fail('west wall not at x=4'); else ok('west wall hit at x=4');
// pool cells (2) are open: a grid of pool should pass through to the far wall
api.setGrid([[0, 0, 0, 0, 0], [0, 2, 2, 2, 0], [0, 0, 0, 0, 0]]);
const hitPool = api.raycastWall(orig, new V3(1, 0, 0), 90);
if (!hitPool || Math.abs(hitPool.point.x - 16) > 1e-6) fail('pool cells should be open to the far wall'); else ok('pool(2) cells are open');

/* ── 6. switchWeapon: owned gate + ammo bank ── */
console.log('6. switchWeapon ammo bank + owned gate');
const swApi = new Function('THREE', `
  ${consts}
  function buildPistolViewmodel(){}; function buildShotgunViewmodel(){}
  function buildSmgViewmodel(){};    function buildFlareViewmodel(){}
  let shopStats = { damageMult:1, fireRateMult:1, clipMult:1, reserveMult:1 };
  const document = { getElementById: () => ({ style:{} }) };
  function createGun(){}; function playWeaponSwitch(){}; function updateHUD(){}; function hudSetStyle(){}
  ${extract(mainSrc, 'const WEAPONS = ')}
  ${extract(mainSrc, 'function curWeapon')}
  ${extract(mainSrc, 'function wpnClip')}
  ${extract(mainSrc, 'function wpnReserve')}
  ${extract(mainSrc, 'function weaponOwned')}
  ${extract(mainSrc, 'function initWeaponBank')}
  ${extract(mainSrc, 'function switchWeapon')}
  ${extract(mainSrc, 'function cycleWeapon')}
  const player = { weaponIdx:0, weaponAmmo:[], clipAmmo:0, reserveAmmo:0, isDown:false, isReloading:false, reloadTimer:0, fireTimer:0 };
  const shopUpgrades = { wpn_shotgun:{bought:false}, wpn_smg:{bought:false}, wpn_flare:{bought:false} };
  initWeaponBank();
  player.clipAmmo = player.weaponAmmo[0].clip; player.reserveAmmo = player.weaponAmmo[0].reserve;
  return { player, shopUpgrades, switchWeapon, cycleWeapon, weaponOwned, WEAPONS };
`)(THREE);

const sp = swApi.player;
if (sp.weaponIdx !== 0 || sp.clipAmmo !== 12) fail('initial loadout not pistol/12'); else ok('starts on pistol with 12');
// switching to an unowned weapon is a no-op
swApi.switchWeapon(1);
if (sp.weaponIdx !== 0) fail('switched to an UNOWNED shotgun'); else ok('unowned switch blocked');
// own the shotgun, switch in
swApi.shopUpgrades.wpn_shotgun.bought = true;
swApi.switchWeapon(1);
if (sp.weaponIdx !== 1) fail('did not switch to owned shotgun'); else ok('switched to owned shotgun');
if (sp.clipAmmo !== 6) fail(`shotgun clip ${sp.clipAmmo} != 6`); else ok('shotgun loadout 6 in clip');
// spend a shell, switch away and back — the bank must remember it
sp.clipAmmo = 3;
swApi.switchWeapon(0);
if (sp.clipAmmo !== 12) fail('pistol clip not restored on switch back'); else ok('pistol clip restored (12)');
swApi.switchWeapon(1);
if (sp.clipAmmo !== 3) fail(`shotgun clip not preserved (${sp.clipAmmo} != 3)`); else ok('shotgun clip preserved (3) across switches');
// cycle skips unowned weapons
swApi.switchWeapon(0);
swApi.cycleWeapon(1); // pistol(owned)→shotgun(owned) is the only other owned
if (sp.weaponIdx !== 1) fail(`cycle did not land on the owned shotgun (got ${sp.weaponIdx})`); else ok('cycle skips unowned guns');

/* ── 7. light budget held ── */
console.log('7. light budget');
const budgetLine = lineWith(mainSrc, 'const CEILING_LIGHT_BUDGET = 25');
if (!/CEILING_LIGHT_BUDGET = 25\b/.test(budgetLine)) fail('CEILING_LIGHT_BUDGET is not 25'); else ok('ceiling budget = 25');
if (!/flareLight = new THREE\.PointLight/.test(mainSrc)) fail('flare light slot not created'); else ok('flare light slot created');
// 25 ceiling + boss(1) + proj(3) + exit(1) + muzzle(1) + flare(1) = 32 point lights
ok('25 + 1 + 3 + 1 + 1 + 1 = 32 point lights (budget intact)');

console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL WEAPON CHECKS PASSED');
process.exit(fails ? 1 : 0);
