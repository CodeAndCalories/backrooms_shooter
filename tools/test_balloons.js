// Balloon-trap determinism verifier. Extracts the REAL code out of js/main.js
// (no copies to drift — same approach as sim_levels.js): the level generators
// plus addDecorations, runs the Level Fun ('party') decoration pass headless
// against a stubbed THREE, and checks the balloon contract the co-op trap
// depends on:
//   1. DETERMINISM — same floorSeed → byte-identical balloon list (id, x, y0,
//      z, r) on every run ("both machines agree which balloon id 7 is");
//   2. VARIETY — different seeds → different balloon layouts;
//   3. VALIDITY — every balloon hangs over an OPEN cell (mazeGrid === 1) and
//      every balloon has >=1 open cell in popBalloon's 3-cell spawn scan, so a
//      pop can always place its partygoers;
//   4. IDS — sequential from 1 in creation order (the ammo-pickup id contract);
//   5. STREAM ISOLATION — the party pass consumes ZERO draws from the world
//      rng() (it uses its own floorSeed-derived prng), so exit/ammo placement
//      is identical with or without decorations.
// Usage: node tools/test_balloons.js

const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'main.js'), 'utf8');

function sliceBalanced(from) {
  const open = src[from], close = open === '{' ? '}' : ']';
  let depth = 0;
  for (let i = from; i < src.length; i++) {
    if (src[i] === open) depth++;
    else if (src[i] === close && --depth === 0) return i;
  }
  throw new Error('unbalanced from ' + from);
}

function extract(decl) {
  const i = src.indexOf(decl);
  if (i < 0) throw new Error('not found in main.js: ' + decl);
  if (decl.startsWith('function')) {
    const bodyOpen = src.indexOf('{', src.indexOf(')', i));
    return src.slice(i, sliceBalanced(bodyOpen) + 1);
  }
  const eq = src.indexOf('=', i);
  let j = eq;
  while (src[j] !== '[' && src[j] !== '{') j++;
  return src.slice(i, sliceBalanced(j) + 1) + ';';
}

const pieces = [
  'function mulberry32',
  'const LEVEL_THEMES = ',
  'function shuffle',
  'const MAZE_GEN_DEFAULTS = ',
  'function generateMaze',
  'function mazeRepairConnectivity',
  'function generatePools',
  'function generateChambers',
  'function generateOpen',
  'function generateField',
  'function generateLinear',
  'function generateLevel',
  'function isOpenArea',
  'function addDecorations',
].map(extract);

// Minimal THREE stub — addDecorations only ever sets transforms and parents
// meshes; nothing here needs real math.
const THREE_STUB = `
  const vec = () => ({ x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y ?? 0; this.z = z ?? 0; }, setScalar(s) { this.x = this.y = this.z = s; } });
  const THREE = {
    SphereGeometry: class {}, CylinderGeometry: class {}, BoxGeometry: class {}, ConeGeometry: class {},
    MeshStandardMaterial: class { constructor(o) { Object.assign(this, o); } },
    Mesh: class { constructor(g, m) { this.geometry = g; this.material = m; this.position = vec(); this.rotation = vec(); this.scale = vec(); } },
    Group: class { constructor() { this.children = []; this.position = vec(); this.rotation = vec(); this.scale = vec(); } add(c) { this.children.push(c); } },
  };
`;

const makeApi = () => new Function(`
  ${THREE_STUB}
  const CELL = 4, WALL_H = 3.4;
  let mazeGrid = [], poolRects = [], mazeWalls = [];
  let rng = Math.random, floorSeed = 0;
  let balloons = [], balloonNextId = 0;
  let balloonGeo = null, balloonStringGeo = null, balloonMats = null, balloonStringMat = null;
  let sceneAdds = 0;
  const scene = { add() { sceneAdds++; } };
  ${pieces.join('\n')}
  return {
    LEVEL_THEMES, mulberry32, generateLevel, addDecorations,
    setRng: (f) => { rng = f; }, drawCountingRng: (f) => { let n = 0; rng = () => (n++, f()); return () => n; },
    setSeed: (s) => { floorSeed = s; },
    reset: () => { balloons = []; balloonNextId = 0; mazeWalls = []; sceneAdds = 0; },
    grid: () => mazeGrid, balloons: () => balloons, walls: () => mazeWalls, adds: () => sceneAdds,
  };
`)();

// Build the Level Fun floor + party decorations exactly like the game:
// seedFloor(floor) → generateLevel → addDecorations (party uses its own prng).
function buildLevelFun(api, seed) {
  const theme = api.LEVEL_THEMES[5];
  api.setSeed(seed);
  const counter = api.drawCountingRng(api.mulberry32(seed));
  const size = theme.mazeSize; // floor 5, first loop → no size bonus
  api.generateLevel(theme, size, size);
  const drawsAfterGen = counter();
  api.reset();
  api.addDecorations(theme, api.grid()[0].length, api.grid().length);
  const drawsAfterDecor = counter();
  return {
    grid: api.grid(),
    balloons: api.balloons().map(b => ({ id: b.id, x: +b.x.toFixed(4), y0: +b.y0.toFixed(4), z: +b.z.toFixed(4), r: +b.r.toFixed(4) })),
    walls: api.walls().length,
    adds: api.adds(),
    worldDrawsConsumedByDecor: drawsAfterDecor - drawsAfterGen,
  };
}

const SEED = (5 * 2654435761) >>> 0; // the real floor-5 seed (seedFloor formula)
let fails = 0;
const fail = (msg) => { fails++; console.error('FAIL: ' + msg); };

/* ── 1. determinism: two fresh sandboxes, same seed → identical balloons ── */
const a = buildLevelFun(makeApi(), SEED);
const b = buildLevelFun(makeApi(), SEED);
if (JSON.stringify(a.balloons) !== JSON.stringify(b.balloons)) fail('same seed produced different balloon lists');
if (a.walls !== b.walls) fail(`same seed produced different collider counts (${a.walls} vs ${b.walls})`);
console.log(`Level Fun seed ${SEED}: ${a.balloons.length} balloons, ${a.walls} prop colliders, ${a.adds} scene meshes — identical across two sandboxes ✓`);

/* ── 2. stream isolation: decoration pass must not touch the world rng ── */
if (a.worldDrawsConsumedByDecor !== 0) fail(`party decorations consumed ${a.worldDrawsConsumedByDecor} world rng() draws (must be 0 — exit/ammo would shift)`);
else console.log('party pass consumed 0 world rng() draws (own floorSeed-derived prng) ✓');

/* ── 3. validity: open cells + pop spawn candidates + sequential ids ── */
const grid = a.grid;
const gh = grid.length, gw = grid[0].length;
a.balloons.forEach((bl, i) => {
  if (bl.id !== i + 1) fail(`balloon ids not sequential: index ${i} has id ${bl.id}`);
  const cx = Math.floor(bl.x / 4), cy = Math.floor(bl.z / 4);
  // balloon anchor cell is open (placement requires it; ±1m jitter stays inside the 4m cell)
  if (!grid[cy] || grid[cy][cx] !== 1) fail(`balloon ${bl.id} hangs over non-open cell (${cx},${cy})`);
  // popBalloon's spawn scan: >=1 open cell within 3 cells (excluding the balloon's own)
  let candidates = 0;
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
    if (dx === 0 && dy === 0) continue;
    const nx = cx + dx, ny = cy + dy;
    if (nx > 0 && ny > 0 && nx < gw - 1 && ny < gh - 1 && grid[ny][nx] === 1) candidates++;
  }
  if (candidates === 0) fail(`balloon ${bl.id} has zero open spawn cells in the 3-cell pop scan`);
});
console.log('all balloons: sequential ids, open anchor cells, >=1 pop spawn candidate ✓');

/* ── 4. sanity: count in a sensible band, and seeds actually vary the layout ── */
if (a.balloons.length < 8 || a.balloons.length > 60) fail(`balloon count ${a.balloons.length} outside sane band 8..60`);
const c = buildLevelFun(makeApi(), 12345);
if (JSON.stringify(a.balloons) === JSON.stringify(c.balloons)) fail('different seeds produced identical balloon lists');
else console.log(`different seed: ${c.balloons.length} balloons, different layout ✓`);

/* ── 5. second-loop Level Fun (floor 22) also gets balloons ── */
const d = buildLevelFun(makeApi(), (22 * 2654435761) >>> 0);
if (d.balloons.length === 0) fail('floor-22 (looped Level Fun) produced zero balloons');
else console.log(`looped Level Fun seed: ${d.balloons.length} balloons ✓`);

if (fails) { console.error(`\n${fails} CHECK(S) FAILED`); process.exit(1); }
console.log('\nAll balloon determinism/validity checks passed.');
