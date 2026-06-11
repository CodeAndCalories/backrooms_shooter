// Level-generation simulator/verifier. Extracts the REAL generator code out of
// js/main.js (no copies to drift), regenerates floors exactly the way
// generateCurrentFloor does (same floor->seed mapping), then:
//   1. flood-fill verifies FULL connectivity (every floor cell reachable from
//      the spawn cell (1,1)) for floors 0..63 and for hundreds of extra seeds
//      per archetype (co-op host can override floorSeed, so arbitrary seeds
//      must hold too);
//   2. runs the REAL pickExitCell (same rng stream position as buildMazeScene:
//      right after generation) and verifies the chosen exit is reachable, on
//      dry deck (value 1), far from spawn (top-25% BFS distance band; rear
//      rows on 'linear'), and actually VARIES across seeds per theme;
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
  'function pickExitCell',
].map(extract);

const api = new Function(`
  let mazeGrid = [];
  let poolRects = [];
  let rng = Math.random;
  ${pieces.join('\n')}
  return { LEVEL_THEMES, mulberry32, generateLevel, generateBossArena, pickExitCell,
           setRng: (f) => { rng = f; }, grid: () => mazeGrid, pools: () => poolRects };
`)();

const THEMES = api.LEVEL_THEMES;

// Mirror of generateCurrentFloor (floor -> seed -> size -> generator), plus
// the exit pick at the SAME rng-stream position buildMazeScene uses (exit is
// the first seeded draw after generation; ammo pickups come after it).
function genFloor(floor, seedOverride) {
  const theme = THEMES[floor % THEMES.length];
  const seed = seedOverride !== undefined ? seedOverride : (floor * 2654435761) >>> 0;
  api.setRng(api.mulberry32(seed));
  if (theme.isBoss) {
    api.generateBossArena(theme.mazeSize);
    return { theme, grid: api.grid(), exit: null };
  }
  const size = Math.min(theme.mazeSize + Math.floor(floor / THEMES.length), 20);
  api.generateLevel(theme, size, size);
  return { theme, grid: api.grid(), exit: api.pickExitCell(theme) };
}

// BFS over deck cells (value 1) from spawn — returns the distance grid
// (-1 = unreachable), the independent cross-check for pickExitCell's BFS.
function flood(grid) {
  const gh = grid.length, gw = grid[0].length;
  const dist = grid.map((row) => row.map(() => -1));
  if (grid[1][1] !== 1) return dist; // spawn buried — caught by the checks
  dist[1][1] = 0;
  const q = [[1, 1]];
  for (let qi = 0; qi < q.length; qi++) {
    const [x, y] = q[qi];
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
      if (grid[ny][nx] !== 1 || dist[ny][nx] >= 0) continue;
      dist[ny][nx] = dist[y][x] + 1;
      q.push([nx, ny]);
    }
  }
  return dist;
}

// Connectivity is checked on the WALKABLE DECK level only (cell value 1) —
// pool basins (value 2) are optional sunken space and must never be needed
// to reach the exit. A basin sealing the only path would show up here as a
// disconnected deck. The exit comes from the REAL pickExitCell (via genFloor)
// and is verified independently: dry deck, reachable, and inside the far band
// it claims to draw from.
function check(grid, theme, exit) {
  const gh = grid.length, gw = grid[0].length;
  const errs = [];
  if (grid[1][1] !== 1) errs.push('spawn (1,1) is not dry floor');
  const dist = flood(grid);
  let floorCells = 0, reached = 0, basinCells = 0;
  const reachableDists = [];
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    if (grid[y][x] === 1) {
      floorCells++;
      if (dist[y][x] >= 0) { reached++; if (dist[y][x] > 0) reachableDists.push(dist[y][x]); }
    }
    if (grid[y][x] === 2) basinCells++;
  }
  if (reached !== floorCells) errs.push(`disconnected: ${floorCells - reached}/${floorCells} deck cells unreachable`);
  if (theme.archetype === 'pools' && basinCells === 0) errs.push('pools floor generated zero basins');
  if (!theme.isBoss) {
    if (!exit) errs.push('pickExitCell returned nothing');
    else if (grid[exit.ey] === undefined || grid[exit.ey][exit.ex] !== 1) errs.push(`exit (${exit.ex},${exit.ey}) is not dry deck floor`);
    else if (dist[exit.ey][exit.ex] <= 0) errs.push(`exit (${exit.ex},${exit.ey}) unreachable from spawn`);
    else if (theme.archetype === 'linear') {
      if (exit.ey < gh - 3) errs.push(`linear exit row ${exit.ey} not in rear rows (>= ${gh - 3})`);
    } else {
      // Far-from-spawn: exit distance must sit in the top-25% rank band.
      reachableDists.sort((a, b) => b - a);
      const cut = reachableDists[Math.max(0, Math.ceil(reachableDists.length * 0.25) - 1)];
      if (dist[exit.ey][exit.ex] < cut) errs.push(`exit dist ${dist[exit.ey][exit.ex]} below top-25% cutoff ${cut}`);
    }
  }
  return { errs, floorCells, total: (gw - 2) * (gh - 2), dist };
}

function drawMap(grid, exit) {
  const gh = grid.length, gw = grid[0].length;
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
  const { theme, grid, exit } = genFloor(f);
  const { errs, floorCells, total } = check(grid, theme, exit);
  const openPct = Math.round((floorCells / total) * 100);
  console.log(`\n── Floor ${f}: ${theme.name} [${theme.archetype}] ` +
    `${grid[0].length}x${grid.length}, ${openPct}% open ` +
    (errs.length ? `*** ${errs.join('; ')} ***` : '(connected ✓)') + ' ──');
  console.log(drawMap(grid, exit));
}

if (process.argv.includes('--maps-only')) process.exit(0);

/* ── 2. connectivity sweep: floors 0..67 (4 wraps of the 17-theme table) ── */
let fails = 0;
const SWEEP = 68;
for (let f = 0; f < SWEEP; f++) {
  const { theme, grid, exit } = genFloor(f);
  const { errs } = check(grid, theme, exit);
  if (errs.length) { fails++; console.error(`FAIL floor ${f} (${theme.name}): ${errs.join('; ')}`); }
}
console.log(`\nFloors 0..${SWEEP - 1}: ${SWEEP - fails}/${SWEEP} pass`);

/* ── 3. arbitrary-seed sweep (co-op hosts may override floorSeed) ── */
const SEEDS_PER_THEME = 300;
let seedFails = 0, seedRuns = 0, varietyFails = 0;
for (const theme of THEMES) {
  if (theme.isBoss) continue;
  const exitCells = new Set();
  for (let i = 0; i < SEEDS_PER_THEME; i++) {
    const seed = ((i * 2654435761) ^ (theme.id * 0x9e3779b9)) >>> 0;
    const { grid, exit } = genFloor(theme.id, seed);
    const { errs } = check(grid, theme, exit);
    seedRuns++;
    if (exit) exitCells.add(exit.ex + ',' + exit.ey);
    if (errs.length) {
      seedFails++;
      console.error(`FAIL theme ${theme.id} (${theme.name}) seed ${seed}: ${errs.join('; ')}`);
    }
  }
  // Exit VARIETY: a single repeated cell across 300 seeds means the
  // randomization is dead (the old fixed-corner bug this pass removes).
  if (exitCells.size < 2) {
    varietyFails++;
    console.error(`FAIL theme ${theme.id} (${theme.name}): exit landed on ${exitCells.size} distinct cell(s) across ${SEEDS_PER_THEME} seeds`);
  }
  console.log(`theme ${String(theme.id).padStart(2)} ${theme.name.padEnd(24)} exits: ${exitCells.size} distinct cells / ${SEEDS_PER_THEME} seeds`);
}
console.log(`Arbitrary seeds: ${seedRuns - seedFails}/${seedRuns} pass`);

if (fails || seedFails || varietyFails) { console.error('\nVERIFICATION FAILED'); process.exit(1); }
console.log('\nAll connectivity + exit-reachability + exit-variety checks passed.');
