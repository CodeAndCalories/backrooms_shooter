// Heading-up minimap verifier. The bug: the minimap was world-locked (north-up),
// so "forward" only pointed up when facing north and otherwise read as a 90°
// rotation. Fix: center on the player + rotate the whole render by player.yaw so
// FORWARD is ALWAYS up. This test reproduces the exact ctx transform
// (translate(center) → rotate(yaw) → translate(-playerCanvas)) and proves, for
// EVERY facing, that a point in front of the player maps ABOVE the centered
// marker and a point to their right maps to the RIGHT (perpendicular) — i.e. the
// world↔screen mapping is consistent with movement at all yaws. Plus wiring.
// Usage: node tools/test_minimap.js

const fs = require('fs');
const path = require('path');
const mainSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'main.js'), 'utf8');

let fails = 0;
const fail = (m) => { fails++; console.error('FAIL: ' + m); };
const ok = (m) => console.log('  ok: ' + m);

const CELL = 4, W = 190, H = 190;
const GW = 21, GH = 21;            // square grid → uniform scale (clean angle check)
const cellW = W / GW, cellH = H / GH;
const cx = W / 2, cy = H / 2;

// Movement vectors EXACTLY as updatePlayer defines them.
const forward = (yaw) => ({ x: -Math.sin(yaw), z: -Math.cos(yaw) });
const right = (yaw) => ({ x: Math.cos(yaw), z: -Math.sin(yaw) });

// Reproduce the canvas transform: ctx.translate(cx,cy); ctx.rotate(yaw);
// ctx.translate(-pcx,-pcy); then a world point (wx,wz) is drawn at its
// world→canvas coords (wx/CELL*cellW, wz/CELL*cellH).
function screenOf(wx, wz, player, yaw) {
  const pcx = player.x / CELL * cellW, pcy = player.z / CELL * cellH;
  const X = wx / CELL * cellW, Y = wz / CELL * cellH;
  const dx = X - pcx, dy = Y - pcy;
  // ctx.rotate(a): (x,y) → (x cos a − y sin a, x sin a + y cos a)
  const rx = dx * Math.cos(yaw) - dy * Math.sin(yaw);
  const ry = dx * Math.sin(yaw) + dy * Math.cos(yaw);
  return { x: cx + rx, y: cy + ry };
}

/* ── 1. forward → up, right → right, for EVERY facing ── */
console.log('1. forward→up / strafe→right at all facings (heading-up)');
{
  const player = { x: 42, z: 42 }; // mid-grid
  const yaws = [0, Math.PI / 4, Math.PI / 2, Math.PI, -Math.PI / 2, -Math.PI / 4, 2.3, -1.1];
  const EPS = 0.5; // px tolerance for "centered on the axis"
  let allFwd = true, allRight = true, allPerp = true, centered = true;
  for (const yaw of yaws) {
    // the player itself maps to the center
    const self = screenOf(player.x, player.z, player, yaw);
    if (Math.abs(self.x - cx) > 1e-6 || Math.abs(self.y - cy) > 1e-6) centered = false;

    const f = forward(yaw), r = right(yaw);
    const d = 8; // world units ahead / to the side
    const fp = screenOf(player.x + f.x * d, player.z + f.z * d, player, yaw);
    const rp = screenOf(player.x + r.x * d, player.z + r.z * d, player, yaw);

    // forward point must be directly ABOVE center (x≈cx, y < cy)
    if (!(Math.abs(fp.x - cx) < EPS && fp.y < cy - 1)) { allFwd = false; fail(`yaw ${yaw.toFixed(2)}: forward not up → (${fp.x.toFixed(1)},${fp.y.toFixed(1)})`); }
    // right point must be directly to the RIGHT (x > cx, y≈cy)
    if (!(Math.abs(rp.y - cy) < EPS && rp.x > cx + 1)) { allRight = false; fail(`yaw ${yaw.toFixed(2)}: strafe not right → (${rp.x.toFixed(1)},${rp.y.toFixed(1)})`); }
    // forward and right must be PERPENDICULAR on screen
    const fv = { x: fp.x - cx, y: fp.y - cy }, rv = { x: rp.x - cx, y: rp.y - cy };
    if (Math.abs(fv.x * rv.x + fv.y * rv.y) > 1e-3) allPerp = false;
  }
  if (centered) ok('player always maps to the canvas center'); else fail('player not centered');
  if (allFwd) ok('forward ALWAYS points up (every facing)'); else fail('forward not consistently up');
  if (allRight) ok('strafe-right ALWAYS points right (every facing)'); else fail('strafe not consistently right');
  if (allPerp) ok('forward ⟂ strafe on screen (no shear)'); else fail('forward/strafe not perpendicular');
}

/* ── 2. back → down, strafe-left → left (sanity, a couple of facings) ── */
console.log('2. back→down / strafe-left→left');
{
  const player = { x: 30, z: 50 };
  for (const yaw of [0.0, 1.0, 2.5, -2.0]) {
    const f = forward(yaw), r = right(yaw), d = 8;
    const back = screenOf(player.x - f.x * d, player.z - f.z * d, player, yaw);
    const left = screenOf(player.x - r.x * d, player.z - r.z * d, player, yaw);
    if (!(back.y > cy + 1 && Math.abs(back.x - cx) < 0.5)) fail(`yaw ${yaw}: back not down`);
    if (!(left.x < cx - 1 && Math.abs(left.y - cy) < 0.5)) fail(`yaw ${yaw}: strafe-left not left`);
  }
  ok('back→down and strafe-left→left hold');
}

/* ── 3. source wiring ── */
console.log('3. updateMinimap wiring (single transform → all elements)');
{
  const i = mainSrc.indexOf('function updateMinimap');
  const body = mainSrc.slice(i, mainSrc.indexOf('\n}', i));
  if (!/ctx\.translate\(cx, cy\)/.test(body)) fail('no translate to canvas center'); else ok('translates to canvas center');
  if (!/ctx\.rotate\(player\.yaw\)/.test(body)) fail('does not rotate by player.yaw'); else ok('rotates the map by player.yaw (heading-up)');
  if (!/ctx\.translate\(-pcx, -pcy\)/.test(body)) fail('does not center on the player'); else ok('centers on the player position');
  // exactly one save/restore pair wrapping the world elements
  const saves = (body.match(/ctx\.save\(\)/g) || []).length;
  const restores = (body.match(/ctx\.restore\(\)/g) || []).length;
  if (saves !== 1 || restores !== 1) fail(`expected 1 save/1 restore, got ${saves}/${restores}`); else ok('one save/restore wraps every rotated element (grid, exit, enemies, boss, teammates, basins)');
  // player drawn fixed at center, pointing up; old per-position arrow gone
  if (!/ctx\.arc\(cx, cy, 3/.test(body)) fail('player not drawn at the fixed center'); else ok('player marker fixed at center');
  if (!/lineTo\(cx, cy - 8\)/.test(body)) fail('player arrow not pointing straight up'); else ok('player arrow points straight up (= forward)');
  if (/const dx2 = px - Math\.sin/.test(body)) fail('old north-up player arrow still present'); else ok('old world-locked player arrow removed');
}

console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL MINIMAP CHECKS PASSED');
process.exit(fails ? 1 : 0);
