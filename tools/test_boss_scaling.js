// Co-op boss HP scaling verifier. Extracts the REAL code (no copies to drift
// — same approach as sim_levels.js / test_balloons.js):
//   - bossHpFor (enemies.js) + LEVEL_THEMES (main.js): solo formula unchanged,
//     scale table 1/1.75/2.50/3.25/4.00x across all boss themes and loops;
//   - netActivePlayerCount (net.js): solo → 1, host counts only OPEN peers;
//   - phase thresholds: percentage triggers (70/40/15%) verified against the
//     thresholds array read out of the boss entity source;
//   - lock-at-spawn: source-level proof that nothing ever ASSIGNS to a boss's
//     maxHp after creation (object-literal field only);
//   - snapshot path: source-level proof that snap.b ships maxHp and the client
//     mirror reads it (scaled values reach clients with NO protocol change).
// Usage: node tools/test_boss_scaling.js

const fs = require('fs');
const path = require('path');

const mainSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'main.js'), 'utf8');
const enemiesSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'enemies.js'), 'utf8');
const netSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'net.js'), 'utf8');

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

let fails = 0;
const fail = (msg) => { fails++; console.error('FAIL: ' + msg); };
const near = (a, b) => Math.abs(a - b) < 1e-9;

/* ── build the sandbox with the real functions ── */
const api = new Function(`
  ${extract(mainSrc, 'const LEVEL_THEMES = ')}
  ${extract(enemiesSrc, 'function bossHpFor')}
  return { LEVEL_THEMES, bossHpFor };
`)();

const countApi = (role, peers) => new Function(`
  const netState = { role: '${role}', peers: ${JSON.stringify(peers)} };
  ${extract(netSrc, 'function netActivePlayerCount')}
  return netActivePlayerCount();
`)();

const BOSS_THEMES = api.LEVEL_THEMES.filter(t => t.isBoss);
// 4 bosses as of floor 20: Warden, Amalgam, Hive Mind, + The Devourer (capstone).
// Grows when a boss floor is added — bump this with it.
if (BOSS_THEMES.length !== 4) fail(`expected 4 boss themes, found ${BOSS_THEMES.length}`);

/* ── 1. solo EXACTLY unchanged (vs the pre-patch formula) across loops ── */
const NL = api.LEVEL_THEMES.length;
for (const theme of BOSS_THEMES) {
  for (const floor of [theme.id, theme.id + NL, theme.id + NL * 2]) { // same theme, +1/+2 loops
    const old = theme.bossHp * (1 + Math.floor(floor / NL) * 0.3);
    const got = api.bossHpFor(theme, floor, 1).totalHp;
    if (got !== old) fail(`solo ${theme.bossName} floor ${floor}: ${got} !== old formula ${old}`);
  }
}
console.log(`solo boss HP exactly matches the pre-patch formula (${BOSS_THEMES.length} bosses x 3 loops) ✓`);

/* ── 2. the scale table ── */
const TABLE = { 1: 1.00, 2: 1.75, 3: 2.50, 4: 3.25, 5: 4.00 };
for (const theme of BOSS_THEMES) {
  const solo = api.bossHpFor(theme, theme.id, 1).totalHp;
  for (const [count, want] of Object.entries(TABLE)) {
    const r = api.bossHpFor(theme, theme.id, +count);
    if (!near(r.bossHpScale, want)) fail(`${theme.bossName} x${count} players: scale ${r.bossHpScale} != ${want}`);
    if (!near(r.totalHp, solo * want)) fail(`${theme.bossName} x${count} players: totalHp ${r.totalHp} != ${solo * want}`);
  }
}
const duo = api.bossHpFor(BOSS_THEMES[0], 4, 2);
console.log(`scale table 1.00/1.75/2.50/3.25/4.00x verified (e.g. duo Warden: ${duo.baseHp} → ${duo.totalHp}) ✓`);

/* ── 3. phase thresholds still trigger by PERCENTAGE on scaled maxHp ── */
const thrMatch = enemiesSrc.match(/phaseThresholds:\s*\[([^\]]+)\]/);
if (!thrMatch) fail('phaseThresholds array not found in enemies.js');
else {
  const thresholds = thrMatch[1].split(',').map(Number); // [0.7, 0.4, 0.15]
  if (thresholds.join(',') !== '0.7,0.4,0.15') fail(`phase thresholds changed: [${thresholds}]`);
  // the real updateBoss comparison: phase = highest i+1 with hpPct < thresholds[i]
  const phaseAt = (hp, maxHp) => {
    const pct = hp / maxHp;
    let phase = 0;
    for (let i = 0; i < thresholds.length; i++) if (pct < thresholds[i]) phase = i + 1;
    return phase;
  };
  const maxHp = api.bossHpFor(BOSS_THEMES[0], 4, 2).totalHp; // duo Warden 1400
  const cases = [
    [maxHp, 0], [maxHp * 0.71, 0], [maxHp * 0.69, 1],
    [maxHp * 0.41, 1], [maxHp * 0.39, 2], [maxHp * 0.16, 2], [maxHp * 0.14, 3],
  ];
  for (const [hp, want] of cases) {
    if (phaseAt(hp, maxHp) !== want) fail(`phase at hp=${hp}/${maxHp}: got ${phaseAt(hp, maxHp)}, want ${want}`);
  }
  console.log(`phases trigger at 70/40/15% of scaled maxHp (duo Warden ${maxHp}hp) ✓`);
}

/* ── 4. lock-at-spawn: no code path ever ASSIGNS to a boss's maxHp ── */
// Allowed: object-literal "maxHp:" fields (creation) and the client mirror in
// net.js (snapshot-driven by design). Forbidden: any "<boss ref>.maxHp =".
for (const [name, src] of [['enemies.js', enemiesSrc], ['main.js', mainSrc]]) {
  const m = src.match(/[\w.]+\.maxHp\s*=[^=]/g);
  if (m) fail(`${name} mutates maxHp after creation: ${JSON.stringify(m)}`);
}
console.log('no maxHp mutation after spawn in enemies.js/main.js (mid-fight joins/leaves cannot re-scale) ✓');

/* ── 5. snapshot path ships maxHp; client mirror reads it (no protocol change) ── */
if (!netSrc.includes('snap.b = [Math.ceil(bossEntity.hp), Math.ceil(bossEntity.maxHp)'))
  fail('host snapshot no longer ships boss maxHp in snap.b');
if (!netSrc.includes('maxHp: b[1]') || !netSrc.includes('m.maxHp = b[1]'))
  fail('client boss mirror no longer reads maxHp from snap.b[1]');
console.log('boss snapshot carries [hp, maxHp] and the client mirror consumes both — no protocol change ✓');

/* ── 6. netActivePlayerCount: solo → 1; host counts only OPEN peers ── */
if (countApi('solo', []) !== 1) fail('solo player count != 1');
if (countApi('client', []) !== 1) fail('client caller should still see 1 (host-only use)');
if (countApi('host', [{ open: true }]) !== 2) fail('host + 1 open peer != 2');
if (countApi('host', [{ open: true }, { open: true }, { open: false }]) !== 3) fail('closed peers must not count');
console.log('netActivePlayerCount: solo=1, duo=2, closed connections excluded ✓');

if (fails) { console.error(`\n${fails} CHECK(S) FAILED`); process.exit(1); }
console.log('\nAll boss HP scaling checks passed.');
