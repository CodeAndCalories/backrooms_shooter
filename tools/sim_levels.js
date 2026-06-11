// Level-generation simulator/verifier. Extracts the REAL generator code out of
// js/main.js (no copies to drift), regenerates floors exactly the way
// generateCurrentFloor does (same floor->seed mapping), then:
//   1. flood-fill verifies FULL connectivity (every floor cell reachable from
//      the spawn cell (1,1)) for floors 0..63 and for hundreds of extra seeds
//      per archetype (co-op host can override floorSeed, so arbitrary seeds
//      must hold too);
//   2. verifies the exit-search window used by buildMazeScene (6x6 from
//      (gw-2, gh-2)) always lands on a reachable floor cell;
//   3. prints ASCII maps of representative floors for eyeballing layout.
// Usage: node tools/sim_levels.js [--maps-only]

const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'main.js'), 'utf8');

// Slice a balanced {...} or [...] starting at the first opener at/after `from`.
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
  // const NAME = [...]; or {...};
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
  'function generateBossArena',
  'function generateLevel',
].map(extract);

const api = new Function(`
  let mazeGrid = [];
  let poolRects = [];
  let rng = Math.random;
  ${pieces.join('\n')}
  return { LEVEL_THEMES, mulberry32, generateLevel, generateBossArena,
           setRng: (f) => { rng = f; }, grid: () => mazeGrid, pools: () => poolRects };
`)();

const THEMES = api.LEVEL_THEMES;

// Mirror of generateCurrentFloor (floor -> seed -> size -> generator).
function genFloor(floor, seedOverride) {
  const theme = THEMES[floor % THEMES.length];
  const seed = seedOverride !== undefined ? seedOverride : (floor * 2654435761) >>> 0;
  api.setRng(api.mulberry32(seed));
  if (theme.isBoss) {
    api.generateBossArena(theme.mazeSize);
  } else {
    const size = Math.min(theme.mazeSize + Math.floor(floor / THEMES.length), 20);
    api.generateLevel(theme, size, size);
  }
  return { theme, grid: api.grid() };
}

function flood(grid) {
  const gh = grid.length, gw = grid[0].length;
  const seen = grid.map((row) => row.map(() => false));
  const q = [[1, 1]];
  if (grid[1][1] !== 1) return seen; // spawn buried — caught by the checks
  seen[1][1] = true;
  while (q.length) {
    const [x, y] = q.pop();
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
      if (grid[ny][nx] !== 1 || seen[ny][nx]) continue;
      seen[ny][nx] = true;
      q.push([nx, ny]);
    }
  }
  return seen;
}

// Same corner search buildMazeScene runs to place the exit.
function findExit(grid, seen) {
  const gh = grid.length, gw = grid[0].length;
  for (let dy = 0; dy > -6; dy--) {
    for (let dx = 0; dx > -6; dx--) {
      const ex = gw - 2 + dx, ey = gh - 2 + dy;
      if (ey >= 0 && ex >= 0 && grid[ey][ex] === 1) {
        return { ex, ey, reachable: seen[ey][ex] };
      }
    }
  }
  return null;
}

// Connectivity is checked on the WALKABLE DECK level only (cell value 1) —
// pool basins (value 2) are optional sunken space and must never be needed
// to reach the exit. A basin sealing the only path would show up here as a
// disconnected deck.
function check(grid, isBoss, isPools) {
  const gh = grid.length, gw = grid[0].length;
  const errs = [];
  if (grid[1][1] !== 1) errs.push('spawn (1,1) is not dry floor');
  const seen = flood(grid);
  let floorCells = 0, reached = 0, basinCells = 0;
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    if (grid[y][x] === 1) { floorCells++; if (seen[y][x]) reached++; }
    if (grid[y][x] === 2) basinCells++;
  }
  if (reached !== floorCells) errs.push(`disconnected: ${floorCells - reached}/${floorCells} deck cells unreachable`);
  if (isPools && basinCells === 0) errs.push('pools floor generated zero basins');
  if (!isBoss) {
    const exit = findExit(grid, seen);
    if (!exit) errs.push('no dry floor cell in the 6x6 exit-search window');
    else if (!exit.reachable) errs.push('exit cell unreachable from spawn');
  }
  return { errs, floorCells, total: (gw - 2) * (gh - 2), seen };
}

function drawMap(grid, seen) {
  const gh = grid.length, gw = grid[0].length;
  const exit = findExit(grid, seen);
  const lines = [];
  for (let y = 0; y < gh; y++) {
    let line = '';
    for (let x = 0; x < gw; x++) {
      if (x === 1 && y === 1) line += 'S';
      else if (exit && x === exit.ex && y === exit.ey) line += 'E';
      else if (grid[y][x] === 2) line += '≈'; // sunken pool basin
      else line += grid[y][x] === 1 ? '·' : '█';
    }
    lines.push(line);
  }
  return lines.join('\n');
}

/* ── 1. eyeball maps ── */
const SHOW = process.argv.includes('--pools') ? [3, 16] : [0, 1, 2, 3, 5, 6, 7, 10, 13, 16];
for (const f of SHOW) {
  const { theme, grid } = genFloor(f);
  const { errs, floorCells, total, seen } = check(grid, theme.isBoss, theme.archetype === 'pools');
  const openPct = Math.round((floorCells / total) * 100);
  console.log(`\n── Floor ${f}: ${theme.name} [${theme.archetype}] ` +
    `${grid[0].length}x${grid.length}, ${openPct}% open ` +
    (errs.length ? `*** ${errs.join('; ')} ***` : '(connected ✓)') + ' ──');
  console.log(drawMap(grid, seen));
}

if (process.argv.includes('--maps-only')) process.exit(0);

/* ── 2. connectivity sweep: floors 0..67 (4 wraps of the 17-theme table) ── */
let fails = 0;
const SWEEP = 68;
for (let f = 0; f < SWEEP; f++) {
  const { theme, grid } = genFloor(f);
  const { errs } = check(grid, theme.isBoss, theme.archetype === 'pools');
  if (errs.length) { fails++; console.error(`FAIL floor ${f} (${theme.name}): ${errs.join('; ')}`); }
}
console.log(`\nFloors 0..${SWEEP - 1}: ${SWEEP - fails}/${SWEEP} pass`);

/* ── 3. arbitrary-seed sweep (co-op hosts may override floorSeed) ── */
const SEEDS_PER_THEME = 300;
let seedFails = 0, seedRuns = 0;
for (const theme of THEMES) {
  if (theme.isBoss) continue;
  for (let i = 0; i < SEEDS_PER_THEME; i++) {
    const seed = ((i * 2654435761) ^ (theme.id * 0x9e3779b9)) >>> 0;
    const { grid } = genFloor(theme.id, seed);
    const { errs } = check(grid, false, theme.archetype === 'pools');
    seedRuns++;
    if (errs.length) {
      seedFails++;
      console.error(`FAIL theme ${theme.id} (${theme.name}) seed ${seed}: ${errs.join('; ')}`);
    }
  }
}
console.log(`Arbitrary seeds: ${seedRuns - seedFails}/${seedRuns} pass`);

if (fails || seedFails) { console.error('\nVERIFICATION FAILED'); process.exit(1); }
console.log('\nAll connectivity + exit-reachability checks passed.');
