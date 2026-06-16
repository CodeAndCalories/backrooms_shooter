// Dev playtest-cheats verifier. Cheats are ?dev=1-only UI/input, but the LOGIC
// (toggles, give-cash, kill-all sparing the unkillable chaser, god-mode no-op)
// is deterministic — so this extracts the REAL handleDevCheatKey / devKillAllMobs
// / damagePlayer from js/main.js and drives them with stubs, then regex-checks the
// DEV_MODE gating (so the normal/co-op build is provably inert) + the HUD wiring.
// Usage: node tools/test_devcheats.js

const fs = require('fs');
const path = require('path');
const mainSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'main.js'), 'utf8');
const htmlSrc = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const cssSrc = fs.readFileSync(path.join(__dirname, '..', 'css', 'style.css'), 'utf8');

function sliceBalanced(s, from) {
  const open = s[from], close = open === '{' ? '}' : ']';
  let depth = 0;
  for (let i = from; i < s.length; i++) {
    if (s[i] === open) depth++;
    else if (s[i] === close && --depth === 0) return i;
  }
  throw new Error('unbalanced from ' + from);
}
function extractFn(decl) {
  const i = mainSrc.indexOf(decl);
  if (i < 0) throw new Error('not found: ' + decl);
  const bodyOpen = mainSrc.indexOf('{', mainSrc.indexOf(')', i));
  return mainSrc.slice(i, sliceBalanced(mainSrc, bodyOpen) + 1);
}
function constVal(name) {
  const m = mainSrc.match(new RegExp('const ' + name + '\\s*=\\s*([^;]+);'));
  if (!m) throw new Error('const not found: ' + name);
  return m[1];
}

let fails = 0;
const fail = (m) => { fails++; console.error('FAIL: ' + m); };
const ok = (m) => console.log('  ok: ' + m);

// Sandbox: real cheat fns over stubs. fresh per call via a factory.
function makeApi() {
  return new Function(`
    let cheatGod = false, cheatInfAmmo = false;
    let cheatFlashMsg = '', cheatFlashTO = null;
    let playerMoney = 0;
    const DEV_CASH_GRANT = ${constVal('DEV_CASH_GRANT')};
    let enemies = [];
    let _isClient = false;
    let hudRenders = 0, hudUpdates = 0;
    const flashes = [];
    const player = { clipAmmo: 0, reserveAmmo: 0, health: 100, isDown: false };
    const shopStats = { clipMult: 1, reserveMult: 1 };
    function curWeapon() { return { clipSize: 12, reserveMax: 84 }; }
    function wpnClip(w) { return Math.round(w.clipSize * shopStats.clipMult); }
    function wpnReserve(w) { return Math.round(w.reserveMax * shopStats.reserveMult); }
    function updateHUD() { hudUpdates++; }
    function renderCheatHud() { hudRenders++; }
    function cheatFlash(m) { flashes.push(m); }
    function netIsClient() { return _isClient; }
    // minimal stubs for damagePlayer's NON-early-return path (not exercised here)
    function getTheme() { return { id: -1 }; }
    function playDamage() {}
    const SANITY_SAFE_THEME = 3, SANITY_DRAIN_PER_DMG = 0.6, SANITY_DRAIN_CAP = 16;
    let damageVigTimer = 0;
    ${extractFn('function devKillAllMobs')}
    ${extractFn('function handleDevCheatKey')}
    ${extractFn('function damagePlayer')}
    return {
      handleDevCheatKey, devKillAllMobs, damagePlayer,
      get god() { return cheatGod; }, set god(v) { cheatGod = v; },
      get inf() { return cheatInfAmmo; },
      get money() { return playerMoney; },
      get clip() { return player.clipAmmo; }, get reserve() { return player.reserveAmmo; },
      player, flashes,
      setEnemies: (e) => { enemies = e; },
      getEnemies: () => enemies,
      setClient: (v) => { _isClient = v; }
    };
  `)();
}

/* ── 1. god mode toggle + damagePlayer no-op ── */
console.log('1. god mode');
{
  const a = makeApi();
  a.handleDevCheatKey('KeyG');
  if (!a.god) fail('G did not enable god mode'); else ok('G toggles god ON');
  a.player.health = 100;
  a.damagePlayer(40, null);
  if (a.player.health !== 100) fail(`god mode took damage: hp ${a.player.health}`); else ok('damagePlayer no-ops under god (no damage / no down)');
  a.handleDevCheatKey('KeyG');
  if (a.god) fail('G did not toggle god OFF'); else ok('G toggles god OFF');
  // sanity: with god OFF and player DOWN, damage is still blocked (existing rule)
  a.player.isDown = true; a.player.health = 100; a.damagePlayer(40, null);
  if (a.player.health !== 100) fail('downed player took damage'); else ok('non-god early-returns preserved (downed)');
}

/* ── 2. infinite ammo toggle tops the clip ── */
console.log('2. infinite ammo');
{
  const a = makeApi();
  a.player.clipAmmo = 0; a.player.reserveAmmo = 0;
  a.handleDevCheatKey('KeyI');
  if (!a.inf) fail('I did not enable infinite ammo'); else ok('I toggles infinite ammo ON');
  if (a.clip !== 12) fail(`clip not topped: ${a.clip}`); else ok('clip topped to full on enable');
  if (a.reserve !== 84) fail(`reserve not topped: ${a.reserve}`); else ok('reserve topped on enable');
  a.handleDevCheatKey('KeyI');
  if (a.inf) fail('I did not toggle infinite ammo OFF'); else ok('I toggles infinite ammo OFF');
}

/* ── 3. give cash ── */
console.log('3. give cash');
{
  const a = makeApi();
  const grant = parseInt(constVal('DEV_CASH_GRANT'), 10);
  a.handleDevCheatKey('KeyC');
  if (a.money !== grant) fail(`cash not granted: ${a.money}`); else ok(`C grants +$${grant}`);
  a.handleDevCheatKey('KeyC');
  if (a.money !== grant * 2) fail('cash not cumulative'); else ok('C is repeatable (cumulative)');
}

/* ── 4. kill-all spares the unkillable chaser ── */
console.log('4. kill all mobs');
{
  const a = makeApi();
  a.setEnemies([
    { alive: true, unkillable: false },              // crawler
    { alive: true, unkillable: false },              // spider
    { alive: true, unkillable: true, isChaser: true } // THE CHASER
  ]);
  a.handleDevCheatKey('KeyK');
  const e = a.getEnemies();
  if (e[0].alive || e[1].alive) fail('kill-all left a killable mob alive'); else ok('killable mobs killed');
  if (!e[2].alive) fail('kill-all killed the unkillable chaser'); else ok('unkillable chaser SPARED (the point of feel-testing it)');
  if (!a.flashes.some(f => /KILLED/.test(f))) fail('no kill-all flash'); else ok('kill-all flashes a confirmation');
}

/* ── 5. kill-all is host/solo only (clients mirror) ── */
console.log('5. kill-all client guard');
{
  const a = makeApi();
  a.setClient(true);
  a.setEnemies([{ alive: true, unkillable: false }]);
  a.handleDevCheatKey('KeyK');
  if (!a.getEnemies()[0].alive) fail('client killed a mirror locally (would desync)'); else ok('client kill-all no-ops (host owns enemies)');
  if (!a.flashes.some(f => /host only/i.test(f))) fail('no host-only notice'); else ok('client shown a "host only" notice');
}

/* ── 6. DEV-ONLY gating + wiring (normal build inert) ── */
console.log('6. dev gating + wiring');
{
  // cheat keys only dispatched under DEV_MODE && playing
  if (!/DEV_MODE && gameState === 'playing' && \(e\.code === 'KeyG' \|\| e\.code === 'KeyI' \|\| e\.code === 'KeyC' \|\| e\.code === 'KeyK'\)/.test(mainSrc))
    fail('cheat keys not gated behind DEV_MODE+playing'); else ok('cheat keys gated behind DEV_MODE && playing');
  // damagePlayer god no-op is the FIRST guard
  if (!/function damagePlayer\([^)]*\)\s*\{\s*if \(cheatGod\) return;/.test(mainSrc)) fail('damagePlayer cheatGod guard missing/not first'); else ok('damagePlayer guards on cheatGod first');
  // playerShoot infinite-ammo guard
  if (!/if \(!cheatInfAmmo\) player\.clipAmmo--/.test(mainSrc)) fail('playerShoot does not guard the clip decrement'); else ok('playerShoot clip decrement guarded by cheatInfAmmo');
  // HUD element + non-dev hide + dev prime
  if (!/id="hudCheats"/.test(htmlSrc)) fail('#hudCheats not in index.html'); else ok('#hudCheats element present');
  if (!/getElementById\('hudCheats'\); if \(_ch\) _ch\.style\.display = 'none'/.test(mainSrc)) fail('#hudCheats not hidden in non-dev'); else ok('#hudCheats hidden when not ?dev=1');
  if (!/\.hud-cheats\{/.test(cssSrc)) fail('.hud-cheats CSS missing'); else ok('.hud-cheats styled');
  // dev level-select now shows NAMES (not just numbers)
  if (!/ls-name/.test(mainSrc) || !/querySelector\('\.ls-name'\)\.textContent = theme\.name/.test(mainSrc)) fail('dev level-select does not render floor names'); else ok('dev level-select renders floor names (clearer list)');
}

console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL DEV-CHEAT CHECKS PASSED');
process.exit(fails ? 1 : 0);
