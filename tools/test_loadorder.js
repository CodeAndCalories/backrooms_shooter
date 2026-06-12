// Script LOAD-ORDER smoke test. index.html loads the game as classic scripts:
//   audio.js → net.js → enemies.js → main.js (shared global scope).
// Any TOP-LEVEL statement in a pre-main file that reads a main.js global
// (e.g. `const HUNT_NEAR = CELL * 3` — the June-12 host-freeze regression)
// throws at load time and silently kills every top-level initialization BELOW
// it in that file (TDZ), while all hoisted functions still "exist" — so the
// game half-works and per-function extraction tests stay green. This test
// executes the REAL top-level code of the three pre-main files, in load
// order, in one shared scope with browser stubs and deliberately NO main.js
// globals. A clean pass = the menus/boot path can't die on load order.
// (main.js itself is excluded: it loads last — nothing after it to depend on
// — and its bottom-of-file init() needs a real WebGL browser.)
// Usage: node tools/test_loadorder.js

const fs = require('fs');
const path = require('path');

const FILES = ['audio.js', 'net.js', 'enemies.js']; // index.html order, pre-main
const src = FILES
  .map(f => `/* ══ ${f} ══ */\n` + fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'))
  .join('\n;\n');

// ── browser stubs: absorb DOM/THREE/storage touches without simulating them ──
// A recursive absorber: any property read returns another absorber, calls are
// no-ops, property writes are accepted. Enough for addEventListener wiring,
// style/classList pokes, canvas 2D contexts, etc. at load time.
function absorber() {
  const fn = function () { return proxy; };
  const proxy = new Proxy(fn, {
    get: (t, p) => {
      if (p === Symbol.toPrimitive || p === 'toString' || p === 'valueOf') return () => '';
      if (p === 'length') return 0;
      return proxy;
    },
    set: () => true,
    apply: () => proxy,
    construct: () => proxy,
  });
  return proxy;
}

class V3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  clone() { return new V3(this.x, this.y, this.z); }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
  normalize() { const l = Math.hypot(this.x, this.y, this.z) || 1; return this.multiplyScalar(1 / l); }
  lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
}
// THREE: real-ish Vector3 (used at top level), absorber for everything else.
const THREE = new Proxy({ Vector3: V3 }, { get: (t, p) => (p in t ? t[p] : absorber()) });

const documentStub = absorber();
const windowStub = absorber();
const localStorageStub = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

let fails = 0;
const fail = (m) => { fails++; console.error('FAIL: ' + m); };
const ok = (m) => console.log('  ok: ' + m);

console.log('1. top-level execution in index.html load order (no main.js globals)');
let scope = null;
try {
  scope = new Function(
    'window', 'document', 'localStorage', 'THREE', 'navigator', 'location', 'Peer',
    src + `
    ;return {
      // spot-check bindings DECLARED LAST in each file actually initialized
      // (a mid-file throw would leave them in the TDZ):
      audioTail: typeof stopLevelFunMusic,
      netTail: typeof netUiRenderLobby,
      enemiesTail: (typeof _losDir === 'object') && (typeof _steer === 'object') &&
                   (typeof HUNT_NEAR_CELLS === 'number') && (typeof ROAM_SPEED_MULT === 'number'),
      updateEnemies: typeof updateEnemies,
    };`
  )(windowStub, documentStub, localStorageStub, THREE, absorber(), absorber(), undefined);
  ok('audio.js + net.js + enemies.js top-level ran without throwing');
} catch (e) {
  fail(`top-level throw during load: ${e.message}`);
}

console.log('2. tail bindings initialized (no silent TDZ casualties)');
if (scope) {
  if (scope.enemiesTail) ok('enemies.js AI consts/scratch vectors all initialized');
  else fail('enemies.js tail bindings missing — top-level aborted mid-file');
  if (scope.updateEnemies === 'function') ok('updateEnemies defined');
  else fail('updateEnemies missing');
} else {
  fail('scope unavailable (load threw) — tail checks skipped');
}

console.log('3. no top-level reads of main.js globals in pre-main files');
// Static guard for the known-shared main.js names most tempting to use in
// top-level tuning constants. Only flags use OUTSIDE any function body (depth
// tracking by braces — coarse but exact for this file style).
const MAIN_GLOBALS = ['CELL', 'WALL_H', 'mazeGrid', 'mazeWalls', 'scene', 'rng', 'floorSeed', 'player'];
for (const f of FILES) {
  // Blank out /* */ comments (newlines kept → line numbers stay true).
  const body = fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '));
  let depth = 0, bad = [];
  const lines = body.split('\n');
  lines.forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, '');
    if (depth === 0) {
      for (const g of MAIN_GLOBALS) {
        if (new RegExp(`(^|[^.\\w$'"\`])${g}\\b`).test(code) && !/^\s*(function|\/\*|\*)/.test(code)) {
          bad.push(`${f}:${i + 1} reads '${g}' at top level → ${line.trim().slice(0, 70)}`);
        }
      }
    }
    for (const ch of code) { if (ch === '{') depth++; else if (ch === '}') depth = Math.max(0, depth - 1); }
  });
  if (bad.length) bad.forEach(b => fail(b));
  else ok(`${f}: no top-level main.js-global reads`);
}

console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL LOAD-ORDER CHECKS PASSED');
process.exit(fails ? 1 : 0);
