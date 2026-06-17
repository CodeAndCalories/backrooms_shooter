// Co-op spawn fan-out verifier. The bug: every player built the floor and landed
// on the SAME spawn cell (1,1) → all players stacked inside each other. Fix: each
// machine spreads players out by SLOT, deterministically, onto DISTINCT open-floor
// cells near the corner spawn (no protocol — the seeded grid is identical on every
// machine, so the ordered open-cell list and each slot's cell match everywhere).
//
// This extracts the REAL helpers (SPAWN_FANOUT_OFFSETS / spawnOpenCells /
// playerSpawnCellFor) out of main.js (no copy to drift) and proves:
//   1. slot 0 (host/solo) ALWAYS lands on the canonical spawn cell (1,1).
//   2. cells are NEVER walls / pool / furniture — only value-1 open floor.
//   3. distinct slots get DISTINCT cells while open candidates last (no stacking);
//      excess slots clamp onto the last open cell (never crash, never wall).
//   4. determinism: same grid + slot → identical cell; offsets prefer near cells.
//   5. wiring: buildMazeScene uses the local slot + clamps the spawn to the cell.
// Usage: node tools/test_spawn.js
//
// Feel (do players read as "beside each other" in the live co-op session) is
// browser-only — this guards the determinism / distinctness / walkable core.

const fs = require('fs');
const path = require('path');
const mainSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'main.js'), 'utf8');

function sliceBalanced(s, from) {
  const open = s[from], close = open === '{' ? '}' : ']';
  let depth = 0;
  for (let i = from; i < s.length; i++) {
    if (s[i] === open) depth++;
    else if (s[i] === close && --depth === 0) return i;
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

/* ═══ sandbox holding the REAL spawn helpers over a settable grid ═══ */
const api = new Function(`
  let mazeGrid = [];
  ${extract(mainSrc, 'const SPAWN_FANOUT_OFFSETS = ')}
  ${extract(mainSrc, 'function spawnOpenCells')}
  ${extract(mainSrc, 'function playerSpawnCellFor')}
  return {
    SPAWN_FANOUT_OFFSETS,
    setGrid: (g) => { mazeGrid = g; },
    spawnOpenCells, playerSpawnCellFor
  };
`)();

const MAX_SLOT = 4; // NET_MAX_CLIENTS 4 → 5 players (host + 4), slots 0..4

// Grid helpers (0=wall, 1=open floor, 2=pool, 3=furniture).
function fullOpen(w, h) {
  const g = [];
  for (let y = 0; y < h; y++) { g[y] = []; for (let x = 0; x < w; x++) g[y][x] = (x === 0 || y === 0 || x === w - 1 || y === h - 1) ? 0 : 1; }
  return g;
}

/* ── 1. slot 0 always lands on the canonical spawn cell (1,1) ── */
console.log('1. slot 0 → canonical spawn cell (1,1)');
{
  const grids = [
    fullOpen(12, 12),
    // tight: only (1,1) open near spawn (everything else wall)
    (() => { const g = fullOpen(12, 12); for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) if (!(x === 1 && y === 1)) g[y][x] = 0; return g; })(),
    // spawn flanked by pool/furniture (not value 1) — must skip those
    (() => { const g = fullOpen(12, 12); g[1][2] = 2; g[2][1] = 3; return g; })()
  ];
  let allBase = true;
  for (const g of grids) {
    api.setGrid(g);
    const c = api.playerSpawnCellFor(0);
    if (!(c[0] === 1 && c[1] === 1)) { allBase = false; fail(`slot 0 not at (1,1): (${c})`); }
  }
  if (allBase) ok('slot 0 is the spawn cell (1,1) on open / tight / hazard-flanked grids → solo unaffected');
}

/* ── 2. NEVER a wall / pool / furniture cell, any slot, many grids ── */
console.log('2. spawn cells are always open floor (value 1)');
{
  // a maze-ish grid: punch random walls but keep (1,1) open
  function mazey(seed) {
    const g = fullOpen(16, 16);
    let s = seed >>> 0;
    const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let y = 1; y < 15; y++) for (let x = 1; x < 15; x++) {
      const r = rnd();
      if (r < 0.35) g[y][x] = 0;          // wall
      else if (r < 0.42) g[y][x] = 2;      // pool
      else if (r < 0.49) g[y][x] = 3;      // furniture
    }
    g[1][1] = 1; // generators force the spawn open
    return g;
  }
  let bad = 0, checked = 0;
  for (let seed = 1; seed <= 400; seed++) {
    const g = mazey(seed);
    api.setGrid(g);
    for (let slot = 0; slot <= MAX_SLOT; slot++) {
      const [cx, cy] = api.playerSpawnCellFor(slot);
      checked++;
      if (!(g[cy] && g[cy][cx] === 1)) { bad++; if (bad <= 3) fail(`seed ${seed} slot ${slot}: cell (${cx},${cy}) = ${g[cy] ? g[cy][cx] : 'oob'} (not open floor)`); }
    }
  }
  if (bad === 0) ok(`every spawn cell is open floor across 400 hazard-laden grids × ${MAX_SLOT + 1} slots (${checked} placements)`);
}

/* ── 3. distinct slots → distinct cells while candidates last; clamp otherwise ── */
console.log('3. no stacking while open cells last; graceful clamp when tight');
{
  // wide-open grid → all 5 slots must be DISTINCT
  api.setGrid(fullOpen(16, 16));
  const cells = [];
  for (let slot = 0; slot <= MAX_SLOT; slot++) cells.push(api.playerSpawnCellFor(slot).join(','));
  const distinct = new Set(cells);
  if (distinct.size === MAX_SLOT + 1) ok(`open grid: all ${MAX_SLOT + 1} slots land on DISTINCT cells (${cells.join(' | ')})`);
  else fail(`open grid: slots collided → ${cells.join(' | ')}`);

  // exactly 2 open cells near spawn → slots 2..4 clamp onto the 2nd (no crash, still open)
  const g2 = fullOpen(12, 12);
  for (let y = 1; y < 11; y++) for (let x = 1; x < 11; x++) g2[y][x] = 0;
  g2[1][1] = 1; g2[1][2] = 1; // only two open cells: (1,1) and (2,1)
  api.setGrid(g2);
  const got = [];
  for (let slot = 0; slot <= MAX_SLOT; slot++) got.push(api.playerSpawnCellFor(slot).join(','));
  const onlyTwo = new Set(got);
  const allOpen2 = got.every(s => { const [x, y] = s.split(',').map(Number); return g2[y][x] === 1; });
  if (got[0] === '1,1' && got[1] === '2,1' && onlyTwo.size === 2 && allOpen2)
    ok(`2-cell spawn: slots 0/1 distinct, slots 2-4 clamp onto (2,1) — all on open floor (${got.join(' | ')})`);
  else fail(`2-cell clamp wrong → ${got.join(' | ')}`);
}

/* ── 4. determinism + near-first ordering ── */
console.log('4. determinism + closest-open-cell-first');
{
  const g = fullOpen(16, 16);
  api.setGrid(g);
  let stable = true;
  for (let slot = 0; slot <= MAX_SLOT; slot++) {
    const a = api.playerSpawnCellFor(slot).join(',');
    const b = api.playerSpawnCellFor(slot).join(',');
    if (a !== b) stable = false;
  }
  if (stable) ok('same grid + slot → identical cell every call'); else fail('non-deterministic spawn cell');

  // offsets are ordered by ring distance: each successive offset is no closer to
  // the corner than the previous (Chebyshev/Manhattan non-decreasing rings).
  const offs = api.SPAWN_FANOUT_OFFSETS;
  let ordered = offs[0][0] === 0 && offs[0][1] === 0;
  for (let i = 1; i < offs.length; i++) {
    const prev = Math.max(offs[i - 1][0], offs[i - 1][1]);
    const cur = Math.max(offs[i][0], offs[i][1]);
    if (cur < prev) ordered = false;
  }
  // every offset distinct
  const distinctOffs = new Set(offs.map(o => o.join(','))).size === offs.length;
  if (ordered && distinctOffs && offs.length >= MAX_SLOT + 1)
    ok(`fan-out offsets: ring 0 first, non-decreasing distance, all distinct, ≥${MAX_SLOT + 1} candidates`);
  else fail(`fan-out offset ordering bad (ordered=${ordered} distinct=${distinctOffs} n=${offs.length})`);
}

/* ── 5. wiring: buildMazeScene uses the local slot + clamps spawn to the cell ── */
console.log('5. buildMazeScene wiring (local slot → cell-centered spawn)');
{
  const i = mainSrc.indexOf('function buildMazeScene');
  const body = mainSrc.slice(i, sliceBalanced(mainSrc, mainSrc.indexOf('{', i)) + 1);
  const usesSlot = /netMySlot\s*===\s*'function'\s*\)\s*\?\s*netMySlot\(\)\s*:\s*0/.test(body);
  const usesHelper = /playerSpawnCellFor\(\s*mySlot\s*\)/.test(body);
  const centersCell = /player\.pos\.set\(\s*scx\s*\*\s*CELL\s*\+\s*CELL\s*\/\s*2,\s*1\.6,\s*scy\s*\*\s*CELL\s*\+\s*CELL\s*\/\s*2\s*\)/.test(body);
  const noOldFixed = !/player\.pos\.set\(1 \* CELL \+ CELL \/ 2, 1\.6, 1 \* CELL \+ CELL \/ 2\)/.test(body);
  if (usesSlot) ok('reads the LOCAL slot (netMySlot, guarded; solo → 0)'); else fail('buildMazeScene does not read netMySlot');
  if (usesHelper) ok('spawns via playerSpawnCellFor(mySlot)'); else fail('buildMazeScene does not call playerSpawnCellFor');
  if (centersCell) ok('places player at the chosen cell center'); else fail('spawn not centered on the chosen cell');
  if (noOldFixed) ok('old hard-coded (1,1) spawn removed'); else fail('old fixed spawn line still present');
}

console.log(fails === 0 ? '\nALL SPAWN TESTS PASSED' : `\n${fails} FAILURE(S)`);
process.exit(fails === 0 ? 0 : 1);
