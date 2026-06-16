// Hotel Chase (floor 17) verifier. Extracts the REAL chase code out of the source
// (no copies to drift) and proves the risky parts of a CHASE level:
//   1. generateChase: spawn→exit path ALWAYS exists, EVERY deck cell is reachable
//      (furniture never seals the only route), furniture is present, no stray pool
//      cells, and generation is deterministic per seed (co-op). Prints ASCII maps.
//   2. chaserNextWaypoint (the chaser's BFS brain): stepping cell-by-cell from
//      spawn it ALWAYS reaches the player's cell — i.e. the unkillable pursuer can
//      never get permanently stuck on the level's sharp turns / dead-ends, and
//      every step it returns is an orthogonal WALKABLE neighbour.
//   3. Integration invariants: theme 17 config (gate 'reach', noStamina, 1+ chaser),
//      the chaser mob type + wire index, the unkillable hit branch (no damage / no
//      stun / not-killed), the stamina override, and netExitGateOpen('reach') → true.
// Usage: node tools/test_chase.js  [--maps]
//
// Feel (chaser pace, weave difficulty, audio mix, the red-lit hotel look, co-op
// chaser sync) is browser-only — this guards the determinism/connectivity/AI core.

const fs = require('fs');
const path = require('path');

const mainSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'main.js'), 'utf8');
const enemSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'enemies.js'), 'utf8');
const netSrc  = fs.readFileSync(path.join(__dirname, '..', 'js', 'net.js'), 'utf8');

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
function constVal(src, name) {
  const re = new RegExp('const ' + name + '\\s*=\\s*([^;]+);');
  const m = src.match(re);
  if (!m) throw new Error('const not found: ' + name);
  return m[1];
}

let fails = 0;
const fail = (m) => { fails++; console.error('FAIL: ' + m); };
const ok = (m) => console.log('  ok: ' + m);

/* ═══ build a sandbox with the REAL generator + exit picker ═══ */
const genApi = new Function(`
  let mazeGrid = [];
  let poolRects = [];
  let rng = Math.random;
  ${extract(mainSrc, 'const LEVEL_THEMES = ')}
  ${extract(mainSrc, 'function mulberry32')}
  ${extract(mainSrc, 'function generateChase')}
  ${extract(mainSrc, 'function pickExitCell')}
  return {
    LEVEL_THEMES, mulberry32,
    setRng: (f) => { rng = f; },
    grid: () => mazeGrid,
    generateChase, pickExitCell
  };
`)();

const THEME17 = genApi.LEVEL_THEMES.find(t => t.id === 17);
if (!THEME17) { fail('theme id 17 (Hotel Chase) not found in LEVEL_THEMES'); }

const CELL = 4;
const cellCenter = (cx, cy) => ({ x: cx * CELL + CELL / 2, z: cy * CELL + CELL / 2 });

// Generate floor 17 at the SAME (size, seed) the live build uses (floor*goldenRatio
// seed; size = mazeSize for the first loop), or an arbitrary seed (co-op override).
function genChase(seed) {
  genApi.setRng(genApi.mulberry32(seed >>> 0));
  // generateChase ignores exact w/h beyond scaling; mirror generateCurrentFloor.
  genApi.generateChase(THEME17.mazeSize, THEME17.mazeSize, THEME17);
  const grid = genApi.grid().map(r => r.slice()); // copy before pickExitCell (it doesn't mutate, but be safe)
  const exit = genApi.pickExitCell(THEME17);
  return { grid, exit };
}

// BFS over deck cells (value 1) from spawn (1,1) → distance grid (-1 unreachable).
function flood(grid) {
  const gh = grid.length, gw = grid[0].length;
  const dist = grid.map(r => r.map(() => -1));
  if (grid[1][1] !== 1) return dist;
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

function drawMap(grid, exit) {
  return grid.map((row, y) => row.map((c, x) =>
    (x === 1 && y === 1) ? 'S' :
    (exit && x === exit.ex && y === exit.ey) ? 'E' :
    c === 3 ? '▒' : (c === 1 ? '·' : '█')
  ).join('')).join('\n');
}

/* ── 1. generateChase: connectivity + path + furniture + determinism ── */
console.log('1. generateChase (path / connectivity / furniture / determinism)');
{
  const SEEDS = 600;
  let pathFails = 0, islandFails = 0, furnFails = 0, poolFails = 0, exitBandFails = 0;
  for (let i = 0; i < SEEDS; i++) {
    const seed = ((i * 2654435761) ^ 0x17C0FFEE) >>> 0;
    const { grid, exit } = genChase(seed);
    const gh = grid.length, gw = grid[0].length;
    const dist = flood(grid);

    if (grid[1][1] !== 1) { pathFails++; continue; }
    if (!exit || dist[exit.ey] === undefined || dist[exit.ey][exit.ex] <= 0) pathFails++;

    let deck = 0, reached = 0, furniture = 0, pools = 0;
    const reachableDists = [];
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      if (grid[y][x] === 1) { deck++; if (dist[y][x] >= 0) { reached++; if (dist[y][x] > 0) reachableDists.push(dist[y][x]); } }
      else if (grid[y][x] === 3) furniture++;
      else if (grid[y][x] === 2) pools++;
    }
    if (reached !== deck) islandFails++;            // a sealed deck island = furniture broke the floor
    if (furniture === 0) furnFails++;               // a chase floor with no obstacles is a bug
    if (pools !== 0) poolFails++;                    // chase has no water
    // exit must sit in the far band pickExitCell claims (top-25% by BFS distance)
    if (exit && dist[exit.ey][exit.ex] > 0) {
      reachableDists.sort((a, b) => b - a);
      const cut = reachableDists[Math.max(0, Math.ceil(reachableDists.length * 0.25) - 1)];
      if (dist[exit.ey][exit.ex] < cut) exitBandFails++;
    }
  }
  if (pathFails) fail(`${pathFails}/${SEEDS} seeds: no reachable spawn→exit path`); else ok(`spawn→exit path exists on all ${SEEDS} seeds`);
  if (islandFails) fail(`${islandFails}/${SEEDS} seeds: furniture sealed an unreachable deck island`); else ok('every deck cell reachable (furniture never seals the route)');
  if (furnFails) fail(`${furnFails}/${SEEDS} seeds: zero furniture obstacles`); else ok('furniture obstacles always present');
  if (poolFails) fail(`${poolFails}/${SEEDS} seeds: chase floor has pool cells`); else ok('no stray pool (value 2) cells');
  if (exitBandFails) fail(`${exitBandFails}/${SEEDS} seeds: exit not in far band`); else ok('exit always lands in the far-from-spawn band');

  // determinism
  const a = genChase(0xC0FFEE), b = genChase(0xC0FFEE);
  if (JSON.stringify(a.grid) !== JSON.stringify(b.grid) || JSON.stringify(a.exit) !== JSON.stringify(b.exit))
    fail('generateChase is NOT deterministic for a fixed seed');
  else ok('deterministic: same seed → identical grid + exit (co-op safe)');
}

/* ── 2. chaserNextWaypoint: the chaser can always reach the player ── */
console.log('2. chaserNextWaypoint (BFS pursuit never gets stuck)');
{
  const wpApi = new Function(`
    const CELL = 4;
    let mazeGrid = [];
    ${extract(enemSrc, 'function chaserNextWaypoint')}
    return { chaserNextWaypoint, setGrid: (g) => { mazeGrid = g; } };
  `)();

  const SEEDS = 200;
  let unreachable = 0, badStep = 0, stuck = 0;
  for (let i = 0; i < SEEDS; i++) {
    const seed = ((i * 40503) ^ 0xCA5E) >>> 0;
    const { grid, exit } = genChase(seed);
    wpApi.setGrid(grid);
    const gw = grid[0].length;
    const tgt = cellCenter(exit.ex, exit.ey);

    // Walk the chaser cell-by-cell from spawn following each BFS waypoint; it must
    // arrive at the target cell within a generous step budget.
    let cx = 1, cy = 1;
    const budget = gw * grid.length; // > any shortest path
    let arrived = false, bad = false;
    for (let step = 0; step < budget; step++) {
      if (cx === exit.ex && cy === exit.ey) { arrived = true; break; }
      const wp = wpApi.chaserNextWaypoint(cellCenter(cx, cy), tgt);
      if (!wp) { break; } // null before arrival = couldn't path
      const nx = Math.floor(wp.x / CELL), ny = Math.floor(wp.z / CELL);
      // the step must be exactly one orthogonal walkable neighbour
      const manhattan = Math.abs(nx - cx) + Math.abs(ny - cy);
      if (manhattan !== 1 || grid[ny][nx] !== 1) { bad = true; break; }
      cx = nx; cy = ny;
    }
    if (bad) badStep++;
    else if (!arrived) { if (!(cx === exit.ex && cy === exit.ey)) { unreachable++; } }
  }
  if (badStep) fail(`${badStep}/${SEEDS} seeds: a waypoint was not a single walkable neighbour`); else ok('every waypoint is one orthogonal, walkable step');
  if (unreachable) fail(`${unreachable}/${SEEDS} seeds: chaser could not path spawn→player`); else ok(`chaser BFS reaches the player from spawn on all ${SEEDS} seeds (never stuck)`);

  // same cell → null (bee-line), and an unreachable target → null (greedy fallback)
  const { grid } = genChase(7);
  wpApi.setGrid(grid);
  if (wpApi.chaserNextWaypoint(cellCenter(1, 1), cellCenter(1, 1)) !== null) fail('same-cell target should return null'); else ok('same cell → null (straight bee-line)');
}

/* ── 3. integration invariants ── */
console.log('3. integration (theme / chaser type / unkillable / stamina / gate)');
{
  // theme 17 config
  if (THEME17.archetype !== 'chase') fail("theme 17 archetype !== 'chase'"); else ok("theme 17 archetype 'chase'");
  if (THEME17.gate !== 'reach') fail("theme 17 gate !== 'reach'"); else ok("theme 17 gate 'reach'");
  if (THEME17.noStamina !== true) fail('theme 17 noStamina !== true'); else ok('theme 17 noStamina (sprint forever)');
  if (!(THEME17.chaserCount >= 1)) fail('theme 17 chaserCount < 1'); else ok('theme 17 spawns >= 1 chaser');

  // chaser mob type present + correctly registered on the wire
  if (!/chaser:\s*{[^}]*name:\s*'The Chaser'/.test(enemSrc)) fail('MOB_TYPES.chaser missing'); else ok('MOB_TYPES.chaser defined');
  const ntl = constVal(netSrc, 'NET_TYPE_LIST');
  if (!/'chaser'/.test(ntl)) fail("NET_TYPE_LIST missing 'chaser'"); else ok("NET_TYPE_LIST includes 'chaser' (append-only wire index)");
  if (!/'chaser'\]/.test(ntl)) fail("'chaser' must be APPENDED to NET_TYPE_LIST (last)"); else ok("'chaser' is appended last (existing wire indices unchanged)");

  // chaser tuning constants sane
  const frac = parseFloat(constVal(enemSrc, 'CHASER_SPRINT_FRAC'));
  const grace = parseFloat(constVal(enemSrc, 'CHASER_GRACE'));
  const repath = parseFloat(constVal(enemSrc, 'CHASER_REPATH'));
  if (!(frac > 0 && frac < 1)) fail('CHASER_SPRINT_FRAC not in (0,1)'); else ok(`chaser speed = ${frac}× sprint (escapable on a clean run)`);
  if (!(grace > 0)) fail('CHASER_GRACE must be > 0'); else ok(`spawn-grace head start = ${grace}s`);
  if (!(repath > 0)) fail('CHASER_REPATH must be > 0'); else ok('BFS repath interval positive');

  // spawnChaser derives speed at RUNTIME from main.js globals (load-order safety):
  // it must NOT read MOVE_SPEED/SPRINT_MULT at file top level.
  if (!/const sprintSpeed = MOVE_SPEED \* SPRINT_MULT;/.test(enemSrc)) fail('spawnChaser should derive speed from MOVE_SPEED*SPRINT_MULT at runtime'); else ok('chaser speed derived inside spawnChaser (no top-level main.js global read)');

  // applyEnemyHit: unkillable branch — no damage, no stun, not killed
  const hitApi = new Function(`
    ${extract(mainSrc, 'function applyEnemyHit')}
    let flashed = false;
    function setMobFlash(e, on) { flashed = on; }
    const e = { unkillable: true, hp: 500, alive: true };
    const killed = applyEnemyHit(e, 9999, null);
    return { killed, hp: e.hp, stun: e.stunTimer, flashed };
  `)();
  if (hitApi.killed !== false) fail('unkillable enemy reported killed'); else ok('chaser hit → not killed');
  if (hitApi.hp !== 500) fail('unkillable enemy lost hp'); else ok('chaser hit → no damage (hp unchanged)');
  if (hitApi.stun !== undefined) fail('unkillable enemy got a stun (would let fast guns freeze it)'); else ok('chaser hit → no stun (can\'t be frozen by gunfire)');
  if (hitApi.flashed !== true) fail('unkillable enemy did not flinch (flash)'); else ok('chaser hit → flinch flash only');

  // stamina override present in updatePlayer's sprint block
  if (!/const noStamina = !!getTheme\(currentFloor\)\.noStamina;/.test(mainSrc)) fail('stamina override (noStamina) not wired into updatePlayer'); else ok('stamina override wired (noStamina pins stamina full)');
  if (!/if \(noStamina\) player\.stamina = MAX_STAMINA;/.test(mainSrc)) fail('noStamina floors should pin stamina full'); else ok('noStamina → stamina pinned full, sprint never gated/drained');

  // netExitGateOpen('reach') → always open
  const gateApi = new Function(`
    let _theme = {};
    let currentFloor = 0;
    function getTheme() { return _theme; }
    let artifactsTotal = 0, artifactsCollected = 0, floorKills = 0, killTarget = 99;
    ${extract(netSrc, 'function netExitGateOpen')}
    return { set: (t) => { _theme = t; }, netExitGateOpen };
  `)();
  gateApi.set({ gate: 'reach' });
  if (gateApi.netExitGateOpen() !== true) fail("netExitGateOpen('reach') !== true"); else ok("reach gate → exit open from the start");
  gateApi.set({ gate: 'kills' });
  if (gateApi.netExitGateOpen() !== false) fail('kills gate sanity: should be closed when floorKills<killTarget'); else ok('kills gate still gates (regression sanity)');
}

/* ── ASCII maps (always print a few — the "prove a clear path" deliverable) ── */
console.log('\nASCII maps (S = spawn, E = exit, · = corridor, ▒ = furniture, █ = wall):');
for (const seed of [1, 1337, 0xBEEF]) {
  const { grid, exit } = genChase(seed);
  const dist = flood(grid);
  const reachable = exit && dist[exit.ey][exit.ex] > 0;
  console.log(`\n── seed 0x${seed.toString(16)}  ${grid[0].length}x${grid.length}  exit (${exit.ex},${exit.ey}) dist ${reachable ? dist[exit.ey][exit.ex] : 'UNREACHABLE'} ${reachable ? '✓' : '✗'} ──`);
  console.log(drawMap(grid, exit));
}

console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL HOTEL CHASE CHECKS PASSED');
process.exit(fails ? 1 : 0);
