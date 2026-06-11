// ESC / menu-exclusivity verifier. Extracts the REAL state-machine functions
// (openShop/closeShop/closeShopSilent/pauseGame/resumeGame) AND the real ESC
// dispatch block out of js/main.js (no copies to drift), runs them against a
// stub DOM, and walks every transition the spec demands:
//   - playing + ESC → paused (menu up)
//   - paused + ESC → playing (resume path)
//   - market open + ESC → market closed, back to where it was opened from
//   - pause menu and black market NEVER visible simultaneously (checked after
//     EVERY step)
//   - resumeGame refuses while the market is up (no resuming under the shop)
//   - force-close paths (game over / quit) leave no stuck overlay
// Usage: node tools/test_esc_shop.js

const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'main.js'), 'utf8');

function sliceBalanced(from) {
  const open = src[from], close = open === '{' ? '}' : ']';
  let depth = 0;
  for (let i = from; i < src.length; i++) {
    if (src[i] === open) depth++;
    else if (src[i] === close && --depth === 0) return i;
  }
  throw new Error('unbalanced from ' + from);
}

function extractFn(decl) {
  const i = src.indexOf(decl);
  if (i < 0) throw new Error('not found in main.js: ' + decl);
  const bodyOpen = src.indexOf('{', src.indexOf(')', i));
  return src.slice(i, sliceBalanced(bodyOpen) + 1);
}

// The REAL ESC branch out of the keydown listener, verbatim.
const escAt = src.indexOf("if (e.code === 'Escape')");
if (escAt < 0) throw new Error('ESC handler not found');
const escBlock = src.slice(escAt, sliceBalanced(src.indexOf('{', escAt)) + 1);

const fns = ['function openShop', 'function closeShop', 'function closeShopSilent',
             'function pauseGame', 'function resumeGame'].map(extractFn);

const api = new Function(`
  let gameState = 'playing';
  const els = { pauseMenu: { style: { display: 'none' } }, shopOverlay: { style: { display: 'none' } } };
  const document = { getElementById: (id) => els[id], exitPointerLock() {} };
  const tryPointerLock = () => {};
  const updateShopUI = () => {};
  let shopOpen = false, shopReturnTo = 'pause';
  ${fns.join('\n')}
  function pressEsc() { const e = { code: 'Escape', preventDefault() {} }; ${escBlock} }
  return {
    pressEsc, openShop, closeShopSilent,
    resumeGame: () => resumeGame(),
    state: () => ({ gameState, shopOpen, pause: els.pauseMenu.style.display, shop: els.shopOverlay.style.display }),
    setState: (s) => { gameState = s; },
  };
`)();

let fails = 0, step = 0;
const fail = (msg) => { fails++; console.error(`FAIL [step ${step}]: ${msg} — state ${JSON.stringify(api.state())}`); };
const expect = (desc, want) => {
  step++;
  const s = api.state();
  // THE invariant: never both overlays
  if (s.pause === 'flex' && s.shop === 'flex') fail('pause menu AND black market visible simultaneously');
  for (const k of Object.keys(want)) {
    if (s[k] !== want[k]) fail(`${desc}: expected ${k}=${want[k]}, got ${s[k]}`);
  }
  console.log(`  ${step}. ${desc} ✓`);
};

console.log('ESC state machine (real extracted handlers):');

// playing → ESC pauses
api.pressEsc();
expect('playing + ESC → paused, menu up', { gameState: 'paused', pause: 'flex', shop: 'none', shopOpen: false });

// paused → ESC resumes
api.pressEsc();
expect('paused + ESC → playing, menus down', { gameState: 'playing', pause: 'none', shop: 'none' });

// pause again, open market from pause: exclusive
api.pressEsc();
api.openShop('pause');
expect('market opened from pause → pause hidden, market up', { gameState: 'paused', pause: 'none', shop: 'flex', shopOpen: true });

// ESC with market open → back to PAUSE MENU (not resume!)
api.pressEsc();
expect('market + ESC → market closed, pause menu restored', { gameState: 'paused', pause: 'flex', shop: 'none', shopOpen: false });

// ESC again → resume
api.pressEsc();
expect('paused + ESC → playing', { gameState: 'playing', pause: 'none', shop: 'none' });

// resumeGame refuses while market is up
api.pressEsc();              // pause
api.openShop('pause');       // market up
api.resumeGame();            // direct call (e.g. stray btnResume) must refuse
expect('resumeGame refused while market open', { gameState: 'paused', shop: 'flex', shopOpen: true });

// force-close (game over / quit path) → nothing stuck
api.closeShopSilent();
expect('closeShopSilent → market gone, no pause menu resurrected', { shop: 'none', shopOpen: false, pause: 'none' });
api.setState('playing');

// market opened from GAMEPLAY (future hotkey path) closes back to play
api.pressEsc();              // pause first (openShop('game') is the future direct path)
api.pressEsc();              // resume
api.setState('paused');      // simulate the pause that a mid-game open would pass through
api.openShop('game');
api.pressEsc();
expect("market opened from 'game' + ESC → resumed to play", { gameState: 'playing', pause: 'none', shop: 'none', shopOpen: false });

if (fails) { console.error(`\n${fails} CHECK(S) FAILED`); process.exit(1); }
console.log('\nAll ESC / menu-exclusivity checks passed.');
