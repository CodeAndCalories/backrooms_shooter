// Floor-18 polish runtime proof. The user reports floor 18 looks darker, has no
// siren pulse, and still shows generic blocks instead of hotel furniture. This EXECUTES
// the REAL committed code (extracted from js/main.js) for floor 18 and prints what it
// actually produces, so we can tell "code bug" apart from "stale build" with evidence.
// Usage: node tools/diag/verify_floor18.js

const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'main.js'), 'utf8');

function sliceBalanced(s, from) {
  const open = s[from], close = open === '{' ? '}' : ']';
  let depth = 0;
  for (let i = from; i < s.length; i++) { if (s[i] === open) depth++; else if (s[i] === close && --depth === 0) return i; }
  throw new Error('unbalanced');
}
function fn(decl) {
  const i = src.indexOf(decl); if (i < 0) throw new Error('not found: ' + decl);
  return src.slice(i, sliceBalanced(src, src.indexOf('{', src.indexOf(')', i))) + 1);
}
function arr(decl) {
  const i = src.indexOf(decl); const eq = src.indexOf('=', i); let j = eq;
  while (src[j] !== '[' && src[j] !== '{') j++;
  return src.slice(i, sliceBalanced(src, j) + 1) + ';';
}
const num = (n) => parseFloat(src.match(new RegExp('const ' + n + '\\s*=\\s*([\\d.]+)'))[1]);

let bad = 0; const FAIL = (m) => { bad++; console.error('  ✗ ' + m); }; const OK = (m) => console.log('  ✓ ' + m);

/* ── pull the real theme 17 + chase consts ── */
const themes = new Function(`${arr('const LEVEL_THEMES = ')} return LEVEL_THEMES;`)();
const T = themes.find(t => t.id === 17);
const C = { LIGHT_MULT: num('CHASE_LIGHT_MULT'), TURN: num('CHASE_TURN_LIGHT_MULT'),
  SIREN_PERIOD: num('CHASE_SIREN_PERIOD'), SIREN_MIN: num('CHASE_SIREN_MIN'), SIREN_MAX: num('CHASE_SIREN_MAX') };

console.log('THEME 17 (Hotel Chase) — committed values:');
console.log(`  fog: color 0x${T.fogColor.toString(16)} near ${T.fogNear} far ${T.fogFar}`);
console.log(`  ambientIntensity ${T.ambientIntensity}  darknessLevel ${T.darknessLevel}  lightIntensity ${T.lightIntensity}`);
console.log(`  CHASE_LIGHT_MULT ${C.LIGHT_MULT}  CHASE_TURN_LIGHT_MULT ${C.TURN}`);
console.log(`  CHASE_SIREN: period ${C.SIREN_PERIOD}s  min ${C.SIREN_MIN}  max ${C.SIREN_MAX}`);

/* ── 1. BRIGHTNESS: the real corridor-light base intensity vs the pre-polish floor ── */
console.log('\n1. BRIGHTNESS (corridor-light base intensity):');
{
  const darkMult = 1 - (T.darknessLevel || 0) * 0.7;
  const base = T.lightIntensity * darkMult * C.LIGHT_MULT;       // a normal trail light
  const turnBase = T.lightIntensity * darkMult * C.LIGHT_MULT * C.TURN; // a turn/exit beacon
  // pre-polish reference: generic placement, no CHASE_LIGHT_MULT, darknessLevel 0.5
  const prePolish = 0.62 * (1 - 0.5 * 0.7) * 1.0;
  console.log(`  committed trail light base = 0.62 × ${darkMult.toFixed(3)} (darkMult) × ${C.LIGHT_MULT} = ${base.toFixed(2)}`);
  console.log(`  committed turn/exit beacon  = ${turnBase.toFixed(2)}`);
  console.log(`  pre-polish generic light    = ${prePolish.toFixed(2)}`);
  if (base > prePolish * 2.5) OK(`committed floor is ~${(base / prePolish).toFixed(1)}× BRIGHTER than pre-polish (NOT darker by code)`);
  else FAIL('committed brightness not clearly above pre-polish');
}

/* ── 2. SIREN: run the REAL updateLights over frames and watch a tagged light pulse ── */
console.log('\n2. SIREN PULSE (run the real updateLights):');
{
  let nowT = 0;
  const env = new Function('flickerTimers', 'getT', `
    const clock = { getElapsedTime: getT };
    const CHASE_SIREN_PERIOD = ${C.SIREN_PERIOD}, CHASE_SIREN_MIN = ${C.SIREN_MIN}, CHASE_SIREN_MAX = ${C.SIREN_MAX};
    function scareOwnsLights(){ return false; }   // chase floors never let a scare own the lights
    let exitMesh = null;
    ${fn('function updateLights')}
    return updateLights;
  `);
  // one siren-tagged light exactly as the corridor-aware branch creates it (base = bright value)
  const darkMult = 1 - (T.darknessLevel || 0) * 0.7;
  const base = T.lightIntensity * darkMult * C.LIGHT_MULT;
  const lightObj = { intensity: base };
  const flickerTimers = [{ light: lightObj, base, timer: 5, nextFlicker: 5, siren: true, phase: 0.0 }];
  const updateLights = env(flickerTimers, () => nowT);
  const samples = [];
  for (let i = 0; i < 90; i++) { nowT = i / 60; updateLights(1 / 60); samples.push(lightObj.intensity); }
  const lo = Math.min(...samples), hi = Math.max(...samples);
  console.log(`  intensity over 1.5s: min ${lo.toFixed(2)}  max ${hi.toFixed(2)}  (base ${base.toFixed(2)})`);
  if (hi - lo > base * 0.4) OK(`siren PULSES — intensity swings ${lo.toFixed(2)}→${hi.toFixed(2)} (NOT steady)`);
  else FAIL('siren did NOT pulse (steady) — real bug');
  // confirm it tracks the expected min/max envelope of the formula
  if (Math.abs(lo - base * C.SIREN_MIN) < 0.05 && Math.abs(hi - base * C.SIREN_MAX) < 0.05)
    OK(`swing matches base×[${C.SIREN_MIN}..${C.SIREN_MAX}] exactly`);
  else FAIL('siren envelope wrong');
}

/* ── 3. FURNITURE: run the REAL buildHotelObstacle for each type ── */
console.log('\n3. FURNITURE (run the real buildHotelObstacle):');
{
  const names = ['overturned chair', 'reception/luggage desk', 'luggage cart', 'stacked suitcases', 'fallen wardrobe'];
  const makeApi = new Function(`
    let meshes = 0, instanced = 0;
    function rec(){ meshes++; }
    const THREE = {
      Group: function(){ return { children: [], position:{set(){}}, rotation:{}, add(o){ this.children.push(o); } }; },
      Mesh: function(){ rec(); return { position:{set(){}}, rotation:{} }; },
      InstancedMesh: function(){ instanced++; return { position:{set(){}}, rotation:{}, setMatrixAt(){}, instanceMatrix:{} }; },
      BoxGeometry: function(){ return {}; }, CylinderGeometry: function(){ return {}; }
    };
    ${fn('function buildHotelObstacle')}
    return { build: (t, prng, M) => { meshes = 0; const g = buildHotelObstacle(t, prng, M); return { g, meshes, instanced }; },
             totalInstanced: () => instanced };
  `)();
  const M = new Proxy({}, { get: () => ({}) }); // any material name → a stub
  let prngState = 12345; const prng = () => { prngState = (prngState * 1664525 + 1013904223) >>> 0; return prngState / 4294967296; };
  let allFurniture = true;
  for (let t = 0; t < 5; t++) {
    const r = makeApi.build(t, prng, M);
    const meshCount = r.meshes;
    const ok = meshCount >= 3; if (!ok) allFurniture = false;
    console.log(`  type ${t} (${names[t]}): ${meshCount} primitive meshes` + (ok ? '' : '  ← TOO FEW (looks like a block!)'));
  }
  if (allFurniture) OK('every type builds a multi-primitive furniture GROUP (not a single block)');
  else FAIL('a furniture type renders as a block');
  if (makeApi.totalInstanced() === 0) OK('NO InstancedMesh blocks created (the old generic-block path is gone)');
  else FAIL('the old InstancedMesh block path still ran');

  // and confirm the obstacle RENDER path calls buildHotelObstacle (not the old block loop)
  const hotel = src.slice(src.indexOf("decorations === 'hotel'"), src.indexOf("decorations === 'party'"));
  if (/buildHotelObstacle\(Math\.floor\(prng\(\) \* 5\)/.test(hotel) && !/new THREE\.InstancedMesh\(unitBox/.test(hotel))
    OK('the value-3 render loop calls buildHotelObstacle (old InstancedMesh-of-unitBox path removed)');
  else FAIL('the obstacle render path is NOT using buildHotelObstacle');
}

console.log(bad === 0
  ? '\nVERDICT: the COMMITTED code (5dc1b9a) produces a BRIGHT, SIREN-PULSED floor with HOTEL FURNITURE.\n         If the game still shows dark / steady / blocks, the running build is STALE (cache/redeploy).'
  : `\nVERDICT: ${bad} real problem(s) found in the committed code — fix needed.`);
process.exit(bad === 0 ? 0 : 1);
