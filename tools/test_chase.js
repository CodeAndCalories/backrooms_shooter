// Hotel Chase (floor 17) verifier — the ON-RAILS AUTO-RUN rebuild. Extracts the
// REAL generator + chase globals/consts out of main.js (no copies to drift) and
// proves the layout invariants a Temple-Run-style auto-run needs:
//   1. generateCorridorChase: spawn (1,1) → exit ALWAYS connected, EVERY open cell
//      reachable (no islands), deterministic per seed (co-op), prints ASCII maps.
//   2. The TRACK (chasePath, the auto-run rail): starts at spawn, ends at the exit
//      cell, every consecutive pair is a 4-neighbour (a continuous walkable rail).
//   3. OBSTACLES force dodges WITHOUT sealing: present; never BOTH band rows blocked
//      in one column; never two adjacent obstacle columns (→ always a clear column to
//      switch rows). Density rises with lane index.
//   4. OVERSHOOT dead-ends past every turn (off-track open cells — the wrong-turn
//      trap), and the last lanes NARROW to a single row.
//   5. Theme 17 wiring: autoRun, gate 'reach', noStamina, noRevive, no mobs.
// Usage: node tools/test_chase.js  [--maps]
//
// Feel (auto-run pace, steering, the wall's knife-edge, audio) is browser/co-op only;
// the auto-run movement + wall projection MATH live in tools/test_autorun.js.

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
  // const NAME = [...] | {...}
  const eq = src.indexOf('=', i);
  let j = eq;
  while (src[j] !== '[' && src[j] !== '{') j++;
  return src.slice(i, sliceBalanced(src, j) + 1) + ';';
}

let fails = 0;
const fail = (m) => { fails++; console.error('FAIL: ' + m); };
const ok = (m) => console.log('  ok: ' + m);

// Drift-proof: inject the real chase globals + CHASE_* consts block.
const chaseGlobals = mainSrc.slice(mainSrc.indexOf('let chasePath = []'), mainSrc.indexOf('function generateCorridorChase'));
const genApi = new Function(`
  let mazeGrid = [];
  let rng = Math.random;
  ${chaseGlobals}
  ${extract(mainSrc, 'const LEVEL_THEMES = ')}
  ${extract(mainSrc, 'function mulberry32')}
  ${extract(mainSrc, 'function generateCorridorChase')}
  return {
    LEVEL_THEMES, mulberry32,
    setRng: (f) => { rng = f; },
    gen: (theme) => generateCorridorChase(theme),
    grid: () => mazeGrid, path: () => chasePath, exitCell: () => chaseExitCell,
    K: { RUNS: CHASE_RUNS, RL: CHASE_RUN_LEN, BH: CHASE_BAND_H, NARROW: CHASE_NARROW_RUNS, GATE: CHASE_GATE_COL }
  };
`)();

const THEME17 = genApi.LEVEL_THEMES.find(t => t.id === 17);
if (!THEME17) fail('theme id 17 (Hotel Chase) not found');
const K = genApi.K;
const PITCH = K.BH + 1;
const rTop = (i) => 1 + i * PITCH;
const rBot = (i) => rTop(i) + K.BH - 1;
const isNarrow = (i) => i >= K.RUNS - K.NARROW;

function genChase(seed) {
  genApi.setRng(genApi.mulberry32(seed >>> 0));
  genApi.gen(THEME17);
  return { grid: genApi.grid().map(r => r.slice()), path: genApi.path().slice(), exit: genApi.exitCell() };
}

// BFS over open cells (value 1) from spawn (1,1) → distance grid (-1 unreachable).
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
      dist[ny][nx] = dist[y][x] + 1; q.push([nx, ny]);
    }
  }
  return dist;
}

/* ── 1. connectivity + determinism over many seeds ── */
console.log('1. connectivity (spawn→exit, no islands) + determinism, 400 seeds');
{
  let disc = 0, exitBad = 0, nondet = 0;
  for (let s = 1; s <= 400; s++) {
    const a = genChase(s);
    const grid = a.grid, gh = grid.length, gw = grid[0].length;
    const dist = flood(grid);
    let open = 0, reached = 0;
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      if (grid[y][x] === 1) { open++; if (dist[y][x] >= 0) reached++; }
    }
    if (reached !== open) { disc++; if (disc <= 3) fail(`seed ${s}: ${open - reached}/${open} open cells unreachable`); }
    const ex = a.exit;
    if (!ex || grid[ex.y][ex.x] !== 1 || dist[ex.y][ex.x] <= 0) { exitBad++; if (exitBad <= 3) fail(`seed ${s}: exit (${ex && ex.x},${ex && ex.y}) bad/unreachable`); }
    // determinism: same seed → identical grid + path
    const b = genChase(s);
    if (JSON.stringify(a.grid) !== JSON.stringify(b.grid) || JSON.stringify(a.path) !== JSON.stringify(b.path)) { nondet++; if (nondet <= 2) fail(`seed ${s}: non-deterministic`); }
  }
  if (!disc) ok('every open cell reachable from spawn (no islands) across 400 seeds');
  if (!exitBad) ok('exit cell is open + reachable across 400 seeds');
  if (!nondet) ok('deterministic per seed (grid + track identical)');
}

/* ── 2. track is a continuous walkable rail spawn→exit ── */
console.log('2. track (chasePath) continuity');
{
  let bad = 0, ends = 0;
  for (let s = 1; s <= 200; s++) {
    const { grid, path, exit } = genChase(s);
    if (!(path.length && path[0].x === 1 && path[0].y === 1)) { ends++; if (ends <= 2) fail(`seed ${s}: track does not start at spawn (1,1)`); }
    const last = path[path.length - 1];
    if (!(last.x === exit.x && last.y === exit.y)) { ends++; if (ends <= 2) fail(`seed ${s}: track does not end at the exit cell`); }
    for (let i = 1; i < path.length; i++) {
      const d = Math.abs(path[i].x - path[i - 1].x) + Math.abs(path[i].y - path[i - 1].y);
      if (d !== 1) { bad++; break; }
      if (grid[path[i].y] === undefined || grid[path[i].y][path[i].x] === 0) { bad++; break; } // never a hard wall
    }
  }
  if (!ends) ok('track starts at spawn (1,1) and ends at the exit cell');
  if (!bad) ok('every consecutive track step is a 4-neighbour on a non-wall cell (continuous rail)');
}

/* ── 3. obstacles force dodges but never seal ── */
console.log('3. obstacles: present, never seal a column, never adjacent columns');
{
  let none = 0, bothRows = 0, adjacent = 0;
  for (let s = 1; s <= 300; s++) {
    const { grid } = genChase(s);
    const gw = grid[0].length;
    let obstacles = 0;
    for (let i = 0; i < K.RUNS; i++) {
      if (isNarrow(i)) continue;
      const tr = rTop(i), br = rBot(i);
      let prevObsCol = -2;
      for (let x = 1; x < gw - 1; x++) {
        const a = grid[tr][x] === 3, b = grid[br][x] === 3;
        if (a && b) bothRows++;                       // a column fully blocked → would seal
        if (a || b) { obstacles++; if (x - prevObsCol < 2) adjacent++; prevObsCol = x; }
      }
    }
    if (obstacles === 0) none++;
  }
  if (none < 30) ok(`obstacles present on the vast majority of layouts (${300 - none}/300 seeds had ≥1)`);
  else fail(`too many seeds with no obstacles (${none}/300)`);
  if (!bothRows) ok('NO column ever has both band rows blocked (path never sealed)');
  else fail(`${bothRows} columns blocked both rows`);
  if (!adjacent) ok('NO two adjacent columns both carry an obstacle (always a clear switch column)');
  else fail(`${adjacent} adjacent obstacle-column pairs`);

  // Polish: lane 0 (the gate lane) stays CLEAR for a fair start; obstacles appear EARLY
  // (lane 1+) thanks to CHASE_OBST_MIN — not just clustered at the end.
  let lane0Dirty = 0, earlyEmpty = 0;
  for (let s = 1; s <= 200; s++) {
    const { grid } = genChase(s);
    const gw = grid[0].length;
    const countLane = (i) => { let c = 0; for (let x = 1; x < gw - 1; x++) { if (grid[rTop(i)][x] === 3) c++; if (grid[rBot(i)] && grid[rBot(i)][x] === 3) c++; } return c; };
    if (countLane(0) > 0) lane0Dirty++;
    // obstacles should show up within the first few wide lanes (1..3), not only late
    let early = 0; for (let i = 1; i <= 3 && !isNarrow(i); i++) early += countLane(i);
    if (early === 0) earlyEmpty++;
  }
  if (!lane0Dirty) ok('lane 0 (gate lane) is always clear — a fair start');
  else fail(`${lane0Dirty} seeds put obstacles in lane 0`);
  if (earlyEmpty < 20) ok(`obstacles appear EARLY (lanes 1–3) on ${200 - earlyEmpty}/200 seeds`);
  else fail(`obstacles too sparse early (${earlyEmpty}/200 seeds empty in lanes 1–3)`);
}

/* ── 4. overshoot dead-ends + narrowing ── */
console.log('4. overshoot dead-ends past turns + narrowing toward the end');
{
  let noOvershoot = 0, notNarrow = 0;
  for (let s = 1; s <= 200; s++) {
    const { grid } = genChase(s);
    const gw = grid[0].length;
    // every wide lane's turn end has open cells PAST the turn col (the overshoot trap)
    for (let i = 0; i < K.RUNS - 1; i++) {
      const tr = rTop(i);
      const even = i % 2 === 0;
      const beyond = even ? [gw - 3, gw - 2] : [2, 1]; // cells past turnCol (gw-4 / 3)
      if (!(grid[tr][beyond[0]] === 1 && grid[tr][beyond[1]] === 1)) { noOvershoot++; break; }
    }
    // narrow lanes: the dodge row (rBot) is wall almost everywhere (only the connector punches it)
    for (let i = K.RUNS - K.NARROW; i < K.RUNS; i++) {
      let openInDodge = 0;
      for (let x = 1; x < gw - 1; x++) if (grid[rBot(i)] && grid[rBot(i)][x] === 1) openInDodge++;
      if (openInDodge > 3) { notNarrow++; break; }
    }
  }
  if (!noOvershoot) ok('every turn leaves an overshoot dead-end (open cells past the turn column)');
  else fail(`${noOvershoot} seeds missing an overshoot stub`);
  if (!notNarrow) ok(`last ${K.NARROW} lanes narrow to a single row (dodge row sealed)`);
  else fail(`${notNarrow} seeds had a non-narrow final lane`);
}

/* ── 5. theme wiring ── */
console.log('5. theme 17 auto-run wiring');
{
  if (THEME17.autoRun === true) ok('autoRun = true'); else fail('autoRun not set');
  if ((THEME17.gate || '') === 'reach') ok("gate = 'reach'"); else fail('gate not reach');
  if (THEME17.noStamina === true) ok('noStamina = true'); else fail('noStamina not set');
  if (THEME17.noRevive === true) ok('noRevive = true (caught = out for the level)'); else fail('noRevive not set');
  if (!THEME17.mobs) ok('no mobs table (survival only — no waves)'); else fail('theme still has a mobs table');
}

/* ── ASCII maps (a clean seed + a dense seed) ── */
function drawMap(seed) {
  const { grid, path, exit } = genChase(seed);
  const gh = grid.length, gw = grid[0].length;
  const onTrack = new Set(path.map(p => p.y * gw + p.x));
  console.log(`\n  seed ${seed}  (${gw}×${gh})  S=spawn E=exit +=track ·=open ▒=obstacle █=wall`);
  for (let y = 0; y < gh; y++) {
    let line = '  ';
    for (let x = 0; x < gw; x++) {
      if (x === 1 && y === 1) line += 'S';
      else if (exit && x === exit.x && y === exit.y) line += 'E';
      else if (grid[y][x] === 3) line += '▒';
      else if (grid[y][x] === 0) line += '█';
      else line += onTrack.has(y * gw + x) ? '+' : '·';
    }
    console.log(line);
  }
}
if (process.argv.includes('--maps')) { drawMap(1); drawMap(7); }

console.log(fails === 0 ? '\nALL CHASE GENERATOR TESTS PASSED' : `\n${fails} FAILURE(S)`);
process.exit(fails === 0 ? 0 : 1);
