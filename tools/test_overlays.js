// Overlay visibility verifier — guards the stacked-overlay bug (victory screen +
// both level-selects rendering over the start menu at once). It drives the REAL
// showMenuOverlay over a fake DOM to prove exactly ONE menu overlay shows at a
// time (and the shop is always force-closed), then statically confirms each state
// transition routes through it, the CSS hides pause/gameover/victory by default,
// and the dev/player level-selects are mutually exclusive.
// Usage: node tools/test_overlays.js

const fs = require('fs');
const path = require('path');
const mainSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'main.js'), 'utf8');
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
function fnBody(decl) { return extractFn(decl); }

let fails = 0;
const fail = (m) => { fails++; console.error('FAIL: ' + m); };
const ok = (m) => console.log('  ok: ' + m);

/* ── 1. showMenuOverlay → exactly one overlay, shop always closed ── */
console.log('1. showMenuOverlay mutual exclusivity');
{
  const menuOverlaysDecl = (mainSrc.match(/const MENU_OVERLAYS = \[[^\]]*\];/) || [])[0];
  if (!menuOverlaysDecl) fail('MENU_OVERLAYS const not found');
  const api = new Function(`
    const els = {};
    const mk = (id) => (els[id] = { style: { display: 'init' } });
    ['startMenu','pauseMenu','gameOverMenu','victoryMenu','shopOverlay'].forEach(mk);
    const document = { getElementById: (id) => els[id] };
    let shopClosed = 0, shopOpen = true;
    function closeShopSilent() { shopClosed++; shopOpen = false; els.shopOverlay.style.display = 'none'; }
    ${menuOverlaysDecl}
    ${fnBody('function showMenuOverlay')}
    return {
      showMenuOverlay, els,
      shopClosed: () => shopClosed,
      visible: () => MENU_OVERLAYS.filter(o => els[o].style.display === 'flex')
    };
  `)();

  for (const target of ['startMenu', 'pauseMenu', 'gameOverMenu', 'victoryMenu', null]) {
    const before = api.shopClosed();
    api.showMenuOverlay(target);
    const vis = api.visible();
    const label = target || '(none / gameplay)';
    if (target === null) {
      if (vis.length !== 0) { fail(`showMenuOverlay(null) left ${vis.join(',')} visible`); continue; }
      ok('showMenuOverlay(null) → every menu hidden (gameplay)');
    } else {
      if (vis.length !== 1 || vis[0] !== target) { fail(`showMenuOverlay('${target}') → visible=[${vis.join(',')}]`); continue; }
      ok(`showMenuOverlay('${label}') → only ${target} visible`);
    }
    if (api.shopClosed() !== before + 1) fail(`showMenuOverlay('${label}') did not force-close the shop`);
  }
  ok('every transition force-closes the shop (never layered on a menu)');
}

/* ── 2. CSS: pause/gameover/victory hidden by default + victory opaque ── */
console.log('2. CSS defaults');
{
  if (!/#pauseMenu\{[^}]*display:none/.test(cssSrc)) fail('#pauseMenu not display:none by default'); else ok('#pauseMenu hidden by default');
  if (!/#gameOverMenu\{[^}]*display:none/.test(cssSrc)) fail('#gameOverMenu not display:none by default'); else ok('#gameOverMenu hidden by default');
  if (!/#victoryMenu\{[^}]*display:none/.test(cssSrc)) fail('#victoryMenu not display:none by default (THE bug)'); else ok('#victoryMenu hidden by default (fixes the stacked overlay)');
  if (!/#victoryMenu\{[^}]*background:/.test(cssSrc)) fail('#victoryMenu has no opaque background (would show through)'); else ok('#victoryMenu has an opaque background');
}

/* ── 3. each transition routes through showMenuOverlay with the right target ── */
console.log('3. state transitions route through showMenuOverlay');
{
  const cases = [
    ['startGame', /showMenuOverlay\(null\)/, 'startGame → none (gameplay)'],
    ['pauseGame', /showMenuOverlay\('pauseMenu'\)/, "pauseGame → 'pauseMenu'"],
    ['resumeGame', /showMenuOverlay\(null\)/, 'resumeGame → none'],
    ['gameOver', /showMenuOverlay\('gameOverMenu'\)/, "gameOver → 'gameOverMenu'"],
    ['showVictory', /showMenuOverlay\('victoryMenu'\)/, "showVictory → 'victoryMenu'"],
    ['quitToMenu', /showMenuOverlay\('startMenu'\)/, "quitToMenu → 'startMenu'"]
  ];
  for (const [fn, re, label] of cases) {
    if (!re.test(fnBody('function ' + fn))) fail(`${fn} does not route through showMenuOverlay correctly`); else ok(label);
  }
  // no transition should still be toggling victoryMenu's display by hand
  if (/getElementById\('victoryMenu'\)\.style\.display/.test(mainSrc)) fail('victoryMenu still toggled by hand somewhere (bypasses the helper)'); else ok('no ad-hoc victoryMenu display toggles remain');
}

/* ── 4. fresh load + dev/player level-select exclusivity ── */
console.log('4. fresh load + level-select exclusivity');
{
  if (!/buildPlayerLevelSelect\(\);[\s\S]{0,160}showMenuOverlay\('startMenu'\)/.test(mainSrc)) fail('no fresh-load showMenuOverlay(startMenu)'); else ok('fresh load → start menu is the only overlay');
  const dev = fnBody('function buildDevLevelSelect');
  if (!/playerPanel[\s\S]*display = 'none'/.test(dev)) fail('dev mode does not hide the player level-select'); else ok('?dev=1 hides the player panel (dev panel supersedes it)');
  if (!/if \(!DEV_MODE\) \{ if \(panel\) panel\.style\.display = 'none'/.test(dev)) fail('non-dev does not hide the dev panel'); else ok('non-dev hides the dev panel');
}

console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL OVERLAY-VISIBILITY CHECKS PASSED');
process.exit(fails ? 1 : 0);
