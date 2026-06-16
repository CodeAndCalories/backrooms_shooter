// Lights Out (floor 18) scanner verifier. The CONSTRAINT-CRITICAL invariant here
// is that the scanner-dot system adds ZERO point lights (dots GLOW via emissive
// only) and reuses an already-present shader family — so this statically checks
// the dot source, then drives the REAL doScanPulse over a grid to confirm it
// paints wall + floor dots and reveals monsters with LOS gating (a mob behind a
// wall stays hidden). Plus theme/darkness/input/co-op wiring checks.
// Usage: node tools/test_scanner.js

const fs = require('fs');
const path = require('path');
const mainSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'main.js'), 'utf8');
const enemSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'enemies.js'), 'utf8');
const netSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'net.js'), 'utf8');
const audioSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'audio.js'), 'utf8');

function sliceBalanced(s, from) {
  const open = s[from], close = open === '{' ? '}' : ']';
  let depth = 0;
  for (let i = from; i < s.length; i++) {
    if (s[i] === open) depth++;
    else if (s[i] === close && --depth === 0) return i;
  }
  throw new Error('unbalanced from ' + from);
}
function extractFn(src, decl) {
  const i = src.indexOf(decl);
  if (i < 0) throw new Error('not found: ' + decl);
  const bodyOpen = src.indexOf('{', src.indexOf(')', i));
  return src.slice(i, sliceBalanced(src, bodyOpen) + 1);
}

let fails = 0;
const fail = (m) => { fails++; console.error('FAIL: ' + m); };
const ok = (m) => console.log('  ok: ' + m);

/* ── 1. CONSTRAINT-CRITICAL: dot system adds NO point lights + reuses the
      instanced-Standard-no-map family (no new shader program) ── */
console.log('1. no new lights / correct material family (the easy mistake)');
{
  const dotSection = mainSrc.slice(mainSrc.indexOf('SCANNER DOTS'), mainSrc.indexOf('function fireScannerLocal'));
  if (/new THREE\.PointLight/.test(dotSection)) fail('the dot system creates a PointLight!'); else ok('zero PointLights in the dot system');
  if (/new THREE\.SpotLight/.test(dotSection)) fail('the dot system creates a SpotLight!'); else ok('zero SpotLights in the dot system');
  const entry = extractFn(mainSrc, 'function getScanDotEntry');
  if (!/new THREE\.InstancedMesh/.test(entry)) fail('dots are not InstancedMesh (1 draw call/color)'); else ok('dots = InstancedMesh (one draw call per color)');
  if (!/MeshStandardMaterial/.test(entry)) fail('dots not MeshStandardMaterial'); else ok('dots use MeshStandardMaterial');
  if (/map:/.test(entry)) fail('dot material has a map (would be a different program family)'); else ok('no map → the ammoPickupMat/fixture-pinned no-map family (no new program)');
  if (!/emissive:/.test(entry)) fail('dots not emissive (they must GLOW in the dark)'); else ok('dots glow via emissive (do not cast light)');
  // fade is per-instance SCALE (shared material never mutates → 1 draw call holds)
  const upd = extractFn(mainSrc, 'function updateScanDots');
  if (!/makeScale/.test(upd) || !/instanceMatrix\.needsUpdate/.test(upd)) fail('fade is not per-instance scale'); else ok('per-instance scale fade (shared material, single draw call)');
}

/* ── 2. doScanPulse over a real grid: wall + floor + LOS-gated monster dots ── */
console.log('2. doScanPulse (wall / floor / monster reveal + LOS gating)');
{
  // 7x7 room: open 5x5 interior, solid border.
  const grid = [
    [0, 0, 0, 0, 0, 0, 0],
    [0, 1, 1, 1, 1, 1, 0],
    [0, 1, 1, 1, 1, 1, 0],
    [0, 1, 1, 1, 1, 1, 0],
    [0, 1, 1, 1, 1, 1, 0],
    [0, 1, 1, 1, 1, 1, 0],
    [0, 0, 0, 0, 0, 0, 0]
  ];
  const sb = new Function(`
    const CELL = 4, WALL_H = 3.4;
    const SCAN_RANGE = CELL * 6;
    const SCAN_WALL_RAYS = 64;
    const SCAN_MONSTER_COLOR = 0xff1414;
    const NET_PLAYER_COLORS = ${JSON.stringify([0xf2d22e, 0x3fd964, 0xe8413a, 0x3f7be8, 0xa64ae8])};
    class V3 {
      constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}
      set(x,y,z){this.x=x;this.y=y;this.z=z;return this;}
      clone(){return new V3(this.x,this.y,this.z);}
      add(v){this.x+=v.x;this.y+=v.y;this.z+=v.z;return this;}
      multiplyScalar(s){this.x*=s;this.y*=s;this.z*=s;return this;}
      length(){return Math.hypot(this.x,this.y,this.z);}
      normalize(){const l=this.length()||1;return this.multiplyScalar(1/l);}
    }
    const THREE = { Vector3: V3 };
    let mazeGrid = ${JSON.stringify(grid)};
    const _scanDir = new V3();
    const dots = [];
    function spawnScanDot(key, hex, x, y, z) { dots.push({ key, hex, x, y, z }); }
    let _mobs = [];
    function scanMobPositions() { return _mobs; }
    ${extractFn(mainSrc, 'function raycastWall')}
    ${extractFn(enemSrc, 'function isOpenCell')}
    ${extractFn(mainSrc, 'function doScanPulse')}
    return { doScanPulse, dots, setMobs: (m) => { _mobs = m; }, V3, clear: () => { dots.length = 0; } };
  `)();

  const origin = new sb.V3(14, 1.6, 14); // center cell (3,3)
  // mob A in LOS (cell 4,3), mob B behind the border wall (z beyond the room)
  sb.setMobs([{ x: 18, y: 1, z: 14 }, { x: 14, y: 1, z: 30 }]);
  sb.doScanPulse(origin, 0);

  const wallFloor = sb.dots.filter(d => d.key === 'p0');
  const red = sb.dots.filter(d => d.key === 'red');
  if (wallFloor.length === 0) fail('no wall/floor dots painted'); else ok(`painted ${wallFloor.length} wall/floor dots in the firer's slot color`);
  if (red.length !== 2) fail(`monster reveal wrong: ${red.length} red dots (expected 2 = the one in-LOS mob × 2)`); else ok('in-LOS monster revealed (red); behind-wall monster stays hidden (LOS-gated)');
  // all red dots belong to the in-LOS mob A (near x=18), none near B (z=30)
  if (red.some(d => d.z > 25)) fail('painted a red dot on the behind-wall mob'); else ok('no red dot leaked through the wall');
  // slot color routing: p0 dots use P1 yellow
  if (wallFloor[0].hex !== 0xf2d22e) fail('slot-0 dots not P1 yellow'); else ok('slot 0 → P1 yellow dots');

  // determinism: same pulse paints the SAME dot positions (co-op reproducibility)
  const first = sb.dots.map(d => `${d.key}:${d.x.toFixed(2)},${d.z.toFixed(2)}`).join('|');
  sb.clear(); sb.doScanPulse(origin, 0);
  const second = sb.dots.map(d => `${d.key}:${d.x.toFixed(2)},${d.z.toFixed(2)}`).join('|');
  if (first !== second) fail('doScanPulse is not deterministic (co-op would diverge)'); else ok('deterministic dot positions (co-op reproducible)');

  // a teammate's pulse in slot 1 paints GREEN
  sb.clear(); sb.doScanPulse(origin, 1);
  if (!sb.dots.some(d => d.key === 'p1' && d.hex === 0x3fd964)) fail('slot 1 not P2 green'); else ok('slot 1 → P2 green dots (teammates distinct)');
}

/* ── 3. theme config ── */
console.log('3. Lights Out theme');
{
  const m = mainSrc.match(/id:\s*18,[\s\S]*?mobs:\s*\{[\s\S]*?\}\s*\}/);
  const t = m ? m[0] : '';
  if (!/scanner:\s*true/.test(t)) fail('theme 18 missing scanner:true'); else ok('theme 18 scanner:true');
  if (!/archetype:\s*'rooms'/.test(t)) fail('theme 18 not rooms archetype'); else ok("theme 18 archetype 'rooms' (maze — scary blind)");
  if (!/gate:\s*'reach'/.test(t)) fail('theme 18 not reach-gated'); else ok("theme 18 gate 'reach' (find the exit)");
  if (!/lightIntensity:\s*0\b/.test(t)) fail('theme 18 ceiling lights not 0'); else ok('ceiling lights intensity 0 (dark, but the slots still exist → budget intact)');
  if (!/ambientIntensity:\s*0\b/.test(t)) fail('theme 18 ambient not 0'); else ok('ambient 0 (total darkness)');
}

/* ── 4. darkness override + input + flashlight wiring ── */
console.log('4. darkness / input / flashlight');
{
  if (!/const scanner = !!theme\.scanner;/.test(mainSrc)) fail('no scanner darkness branch in buildMazeScene'); else ok('buildMazeScene has a scanner darkness branch');
  if (!/scanner \? 0 : theme\.ambientIntensity/.test(mainSrc)) fail('ambient not forced to 0 on scanner floors'); else ok('ambient forced 0 on scanner floors');
  if (!/emissiveIntensity:\s*scanner \? 0/.test(mainSrc)) fail('fixtures still glow on scanner floors'); else ok('fixtures non-emissive on scanner floors (program still present)');
  if (!/getTheme\(currentFloor\)\.scanner\) return; \/\/ Lights Out: no flashlight/.test(mainSrc)) fail('flashlight not disabled on scanner floors'); else ok('flashlight (F) disabled on scanner floors');
  if (!/if \(scannerFloor\) fireScannerLocal\(\)/.test(mainSrc)) fail('LMB does not fire the scanner'); else ok('LMB pulses the scanner on this floor');
  if (!/scanner \? rightMouseDown : mouseDown/.test(mainSrc)) fail('gun auto-fire not moved to RMB on scanner floors'); else ok('gun auto-fires on held RMB (LMB is the scanner)');
  if (!/scanCooldown > 0\) return;/.test(mainSrc)) fail('scanner has no cooldown'); else ok('scanner is cooldown-gated (no spam-lighting)');
}

/* ── 5. co-op relay + audio ── */
console.log('5. co-op scan relay + audio');
{
  if (!/function netMySlot/.test(netSrc)) fail('netMySlot missing'); else ok('netMySlot (local slot color)');
  if (!/function netAnnounceScan/.test(netSrc)) fail('netAnnounceScan missing'); else ok('netAnnounceScan (share my pulse)');
  if (!/onMessage\('scan'/.test(netSrc) || !/onMessage\('scan_fx'/.test(netSrc)) fail("'scan'/'scan_fx' handlers missing"); else ok("'scan' + 'scan_fx' relay (teammates' pulses, in their colors)");
  if (!/doScanPulse\(new THREE\.Vector3/.test(netSrc)) fail('relay does not reproduce the pulse'); else ok('receivers reproduce the pulse via doScanPulse (monster reveal stays per-machine)');
  if (!/function playScannerPing/.test(audioSrc)) fail('playScannerPing missing'); else ok('scanner ping sound present');
  // teardown + per-frame
  if (!/clearScanDots\(\);/.test(mainSrc)) fail('clearScanDots not called in teardown'); else ok('dot meshes pulled before the dispose traverse (shared geo/mats safe)');
  if (!/updateScanDots\(dt\);/.test(mainSrc)) fail('updateScanDots not in the loop'); else ok('updateScanDots in the animate loop');
}

console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL SCANNER CHECKS PASSED');
process.exit(fails ? 1 : 0);
