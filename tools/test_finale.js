// Floor 20 "The Last Door" capstone verifier. Reuses the boss system, so the
// logic to guard is: the theme config (toughest boss, finale flag), the REAL
// bossHpFor scaling on floor 19 (solo unchanged, per-player scale, no surprise
// loop bonus on the first visit), and the finale/victory wiring across the files
// — including that the dev + player level-selects pick up floors 19 & 20
// automatically (they iterate LEVEL_THEMES).
// Usage: node tools/test_finale.js

const fs = require('fs');
const path = require('path');
const mainSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'main.js'), 'utf8');
const enemSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'enemies.js'), 'utf8');
const netSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'net.js'), 'utf8');
const htmlSrc = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

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
  let j = eq; while (src[j] !== '[' && src[j] !== '{') j++;
  return src.slice(i, sliceBalanced(src, j) + 1) + ';';
}

let fails = 0;
const fail = (m) => { fails++; console.error('FAIL: ' + m); };
const ok = (m) => console.log('  ok: ' + m);

// Sandbox: real LEVEL_THEMES + bossHpFor.
const api = new Function(`
  ${extract(mainSrc, 'const LEVEL_THEMES = ')}
  ${extract(enemSrc, 'function bossHpFor')}
  return { LEVEL_THEMES, bossHpFor };
`)();
const THEMES = api.LEVEL_THEMES;
const finale = THEMES.find(t => t.id === 19);

/* ── 1. capstone theme config ── */
console.log('1. The Last Door theme (floor 20 / index 19)');
{
  if (THEMES.length !== 20) fail(`expected 20 themes, got ${THEMES.length}`); else ok('20 floors total (Lobby → The Last Door)');
  if (!finale) { fail('theme id 19 missing'); }
  else {
    if (!finale.isBoss) fail('finale not a boss floor'); else ok('isBoss (reuses the boss system)');
    if (!finale.isFinale) fail('missing isFinale flag'); else ok('isFinale (boss death ends the run)');
    if (finale.archetype !== 'arena') fail('not arena archetype'); else ok("archetype 'arena' (generateBossArena)");
    if (finale.bossTex !== 'boss_amalgam') fail('not reusing an existing boss sprite'); else ok("reuses boss_amalgam sprite (no new asset)");
    if (!(finale.mazeSize > 8)) fail('arena not bigger than the other bosses'); else ok(`bigger arena (mazeSize ${finale.mazeSize} > Hive's 8)`);
    if (!(finale.bossScale >= 5)) fail('boss not scaled up'); else ok(`boss scaled up (${finale.bossScale} → ~${(finale.bossScale * 2).toFixed(0)}m)`);
  }
}

/* ── 2. toughest boss + bossHpFor scaling ── */
console.log('2. boss HP (toughest + per-player scaling)');
{
  const bosses = THEMES.filter(t => t.isBoss);
  const maxOther = Math.max(...bosses.filter(t => t.id !== 19).map(t => t.bossHp));
  if (!(finale.bossHp > maxOther)) fail(`finale bossHp ${finale.bossHp} not > other bosses (${maxOther})`); else ok(`toughest boss: ${finale.bossHp} HP (next highest ${maxOther})`);

  // first-visit (floor 19) must have NO loop bonus (floor 19 / 20 themes = 0)
  const solo = api.bossHpFor(finale, 19, 1);
  if (solo.totalHp !== finale.bossHp) fail(`solo first-visit HP ${solo.totalHp} != base ${finale.bossHp} (unexpected loop bonus?)`); else ok(`solo first visit = base ${finale.bossHp} (no surprise loop bonus)`);
  const duo = api.bossHpFor(finale, 19, 2);
  if (Math.abs(duo.totalHp - finale.bossHp * 1.75) > 0.5) fail(`duo scale wrong: ${duo.totalHp}`); else ok(`duo = ${duo.totalHp} (×1.75 per-player scaling applies)`);
  const quad = api.bossHpFor(finale, 19, 4);
  if (Math.abs(quad.totalHp - finale.bossHp * 3.25) > 0.5) fail(`4p scale wrong: ${quad.totalHp}`); else ok(`4-player = ${quad.totalHp} (×3.25)`);
  // second loop (floor 39) DOES get the loop bonus — scaling intact
  const loop2 = api.bossHpFor(finale, 39, 1);
  if (Math.abs(loop2.totalHp - finale.bossHp * 1.3) > 0.5) fail(`loop-2 bonus wrong: ${loop2.totalHp}`); else ok(`second loop = ${loop2.totalHp} (×1.3 loop bonus — scaling unbroken)`);
}

/* ── 3. finale → victory wiring ── */
console.log('3. finale / victory wiring');
{
  // boss death routes to winRun on the finale floor (else the normal exit)
  if (!/if \(getTheme\(currentFloor\)\.isFinale\)/.test(enemSrc) || !/winRun\(\)/.test(enemSrc)) fail('boss death does not branch to winRun on the finale'); else ok('finale boss death → winRun() (no exit); other bosses → createBossExit()');
  if (!/function winRun\(/.test(mainSrc)) fail('winRun missing'); else ok('winRun (host/solo entry + broadcast)');
  if (!/function showVictory\(/.test(mainSrc)) fail('showVictory missing'); else ok('showVictory (the screen)');
  const sv = extract(mainSrc, 'function showVictory');
  if (!/gameState = 'won'/.test(sv)) fail("showVictory doesn't set the 'won' state"); else ok("sets gameState 'won' (freezes gameplay; ESC/shoot/scan all no-op)");
  if (!/markFloorBeaten\(currentFloor\)/.test(sv)) fail('capstone not marked beaten'); else ok('capstone marked beaten (progression)');
  if (!/victoryMenu/.test(htmlSrc)) fail('#victoryMenu not in index.html'); else ok('#victoryMenu overlay present');
  if (!/YOU ESCAPED/.test(htmlSrc)) fail('no "you escaped" finale text'); else ok('"YOU ESCAPED" finale message');
  if (!/btnVictoryAgain/.test(mainSrc) || !/btnVictoryMenu/.test(mainSrc)) fail('victory buttons not wired'); else ok('Play Again + Main Menu wired');
}

/* ── 4. co-op finale broadcast ── */
console.log('4. co-op victory broadcast');
{
  if (!/function netBroadcastRunWon/.test(netSrc)) fail('netBroadcastRunWon missing'); else ok('netBroadcastRunWon (host → all)');
  if (!/onMessage\('run_won'/.test(netSrc)) fail("no 'run_won' handler"); else ok("'run_won' handler → showVictory (whole party gets the ending)");
  if (!/sendToAll\('run_won'/.test(netSrc)) fail('run_won not broadcast to all'); else ok('host broadcasts the win to the party');
}

/* ── 5. level-select auto-picks up new floors ── */
console.log('5. level-select picks up floors 19 + 20 automatically');
{
  const dev = extract(mainSrc, 'function buildDevLevelSelect');
  const player = extract(mainSrc, 'function buildPlayerLevelSelect');
  if (!/LEVEL_THEMES\.forEach/.test(dev)) fail('dev level-select does not iterate LEVEL_THEMES'); else ok('dev level-select iterates LEVEL_THEMES → floors 19+20 appear automatically');
  if (!/LEVEL_THEMES\.forEach/.test(player)) fail('player level-select does not iterate LEVEL_THEMES'); else ok('player level-select iterates LEVEL_THEMES → unlock-gated, auto-includes 19+20');
  // getTheme wraps on length, so index 19 resolves to the finale
  const t19 = THEMES[19 % THEMES.length];
  if (!t19 || !t19.isFinale) fail('getTheme(19) does not resolve to the finale'); else ok('getTheme(19) → The Last Door (finale)');
}

/* ── 6. ALL_UNLOCKED playtest override ── */
console.log('6. ALL_UNLOCKED player-select override');
{
  // run the REAL isFloorUnlocked under both flag states (beatenFloors empty).
  const mk = (flag) => new Function(`
    const ALL_UNLOCKED = ${flag};
    const beatenFloors = new Set();
    ${extract(mainSrc, 'function isFloorUnlocked')}
    return isFloorUnlocked;
  `)();
  const onAll = mk(true), gated = mk(false);
  // flag ON: every floor 0..19 unlocked (no progress needed)
  let allOk = true; for (let i = 0; i < 20; i++) if (!onAll(i)) allOk = false;
  if (!allOk) fail('ALL_UNLOCKED=true did not unlock every floor'); else ok('ALL_UNLOCKED=true → all 20 floors clickable in the player menu');
  // flag OFF (after the playtest): gating restored — only floor 0 with no progress
  if (gated(0) && !gated(1) && !gated(14)) ok('ALL_UNLOCKED=false → progression gating restored (only floor 0 with no progress)');
  else fail('flipping ALL_UNLOCKED=false should restore unlock gating');
  // the flag actually exists in source, defaulting ON for the playtest
  if (!/const ALL_UNLOCKED = true;/.test(mainSrc)) fail('ALL_UNLOCKED flag not present/ON in source'); else ok('ALL_UNLOCKED flag present (=true for the playtest; flip to false to revert)');
}

console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL FINALE CHECKS PASSED');
process.exit(fails ? 1 : 0);
