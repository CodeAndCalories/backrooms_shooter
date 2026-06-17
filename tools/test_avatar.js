// Co-op humanoid avatar verifier. The avatars used to be hazmat primitives
// (torso/hood/arm-stubs); they're now an articulated SOLDIER figure (head+helmet,
// vest, backpack, TWO pivoted arms + TWO pivoted legs) with a sin-driven WALK
// animation gated on movement. This is cosmetic + per-machine (no protocol change).
//
// Two halves, both against the REAL net.js source (no copies to drift):
//   1. STATIC build invariants (grep netAvatarBuild's body): NO new lights, the
//      whole suit shares ONE colored material (so the down-tint covers every limb
//      and the slot color stays the ID), two articulated legs + two arms (hip/knee
//      + shoulder pivots), the walk rig stashed in userData, slot colors + label kept.
//   2. The EXTRACTED netTickAvatarWalk run over a fake rig of plain {rotation:{x}}
//      objects: moving → swing amplitude rises and limbs swing (legs anti-phase,
//      arms opposite their own-side leg, knee bend ≥ 0); idle → amp eases to 0 and
//      limbs settle to neutral; a DOWN avatar never swings; determinism.
// Usage: node tools/test_avatar.js
//
// Feel (does it read as a soldier, is the walk natural) is browser/co-op only.

const fs = require('fs');
const path = require('path');
const netSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'net.js'), 'utf8');

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
function constNum(src, name) {
  const m = src.match(new RegExp('const ' + name + '\\s*=\\s*([\\d.]+)'));
  if (!m) throw new Error('const not found: ' + name);
  return parseFloat(m[1]);
}

let fails = 0;
const fail = (m) => { fails++; console.error('FAIL: ' + m); };
const ok = (m) => console.log('  ok: ' + m);

const buildBody = extractFn(netSrc, 'function netAvatarBuild');

/* ── 1. STATIC build invariants ── */
console.log('1. humanoid build invariants (netAvatarBuild source)');
{
  // NO new lights (fixed light budget).
  if (!/new THREE\.(PointLight|SpotLight|DirectionalLight|HemisphereLight)/.test(buildBody))
    ok('adds NO lights (light budget intact)');
  else fail('netAvatarBuild creates a light');

  // Exactly ONE colored suit material, untextured Standard (pinned family) → down-tint
  // covers every limb + slot color is the ID. (darkMat is the only other material.)
  const suitDefs = (buildBody.match(/new THREE\.MeshStandardMaterial/g) || []).length;
  const suitColored = /const suitMat = new THREE\.MeshStandardMaterial\(\{[^}]*\bcolor\b[^}]*\bemissive\b/.test(buildBody);
  const noMap = !/suitMat[\s\S]*?\bmap\s*:/.test(buildBody.split('darkMat')[0]);
  if (suitDefs === 2 && suitColored && noMap) ok('one colored no-map suit material + one dark material (2 total, pinned family)');
  else fail(`material setup off (defs=${suitDefs} colored=${suitColored} noMap=${noMap})`);
  if (/av\.bodyMat = suitMat/.test(buildBody)) ok('down-tint targets the shared suit material → whole figure tints');
  else fail('av.bodyMat not the shared suit material');
  if (/NET_PLAYER_COLORS\[slot/.test(buildBody)) ok('suit uses the per-slot color (P1..P5 distinguishable)');
  else fail('slot color not used');

  // Two articulated legs + two arms: hip + knee pivots, shoulder pivots.
  const hasLegFn = /function buildLeg/.test(buildBody) && /buildLeg\(-1\)/.test(buildBody) && /buildLeg\(1\)/.test(buildBody);
  const hasArmFn = /function buildArm/.test(buildBody) && /buildArm\(-1\)/.test(buildBody) && /buildArm\(1\)/.test(buildBody);
  const hipKnee = /const hip = new THREE\.Group/.test(buildBody) && /const knee = new THREE\.Group/.test(buildBody);
  const shoulderElbow = /const shoulder = new THREE\.Group/.test(buildBody) && /const elbow = new THREE\.Group/.test(buildBody);
  if (hasLegFn && hasArmFn) ok('two legs + two arms built (buildLeg(-1/1), buildArm(-1/1))');
  else fail(`limb builders missing (legs=${hasLegFn} arms=${hasArmFn})`);
  if (hipKnee && shoulderElbow) ok('articulated: hip+knee pivot groups (legs), shoulder+elbow pivot groups (arms)');
  else fail(`pivot joints missing (hipKnee=${hipKnee} shoulderElbow=${shoulderElbow})`);

  // Soldier silhouette bits: helmet, visor, backpack.
  const soldier = /helmet/.test(buildBody) && /visor/.test(buildBody) && /pack/.test(buildBody);
  if (soldier) ok('soldier silhouette: helmet + visor + backpack present');
  else fail('soldier silhouette pieces missing');

  // Walk rig stashed for the animator + label kept above the figure.
  const rigStash = /group\.userData\.rig =/.test(buildBody) && /legs:\s*\[/.test(buildBody) && /arms:\s*\[/.test(buildBody);
  const phases = /phase: 0/.test(buildBody) && /phase: Math\.PI/.test(buildBody);
  if (rigStash && phases) ok('walk rig stashed in group.userData.rig with anti-phase limbs');
  else fail(`rig stash off (rig=${rigStash} phases=${phases})`);
  if (/netMakeNameLabel\(name, color\)/.test(buildBody) && /label\.position\.y = 2\.05/.test(buildBody))
    ok('name label kept above the avatar');
  else fail('name label missing/moved');

  // The per-frame smoothing loop drives the walk from the lerp displacement.
  if (/netTickAvatarWalk\(av, g\.position\.x - px, g\.position\.z - pz, dt\)/.test(netSrc))
    ok('smoothing loop feeds frame displacement to netTickAvatarWalk');
  else fail('walk tick not wired into the avatar smoothing loop');
}

/* ── 2. netTickAvatarWalk behavior over a fake rig ── */
console.log('2. walk animation (extracted netTickAvatarWalk)');
{
  const tick = new Function('av', 'dx', 'dz', 'dt', `
    const NET_WALK_MIN_SPEED = ${constNum(netSrc, 'NET_WALK_MIN_SPEED')};
    const NET_WALK_CADENCE = ${constNum(netSrc, 'NET_WALK_CADENCE')};
    const NET_WALK_AMP_EASE = ${constNum(netSrc, 'NET_WALK_AMP_EASE')};
    const NET_LEG_SWING = ${constNum(netSrc, 'NET_LEG_SWING')};
    const NET_KNEE_BEND = ${constNum(netSrc, 'NET_KNEE_BEND')};
    const NET_ARM_SWING = ${constNum(netSrc, 'NET_ARM_SWING')};
    ${extractFn(netSrc, 'function netTickAvatarWalk')}
    return netTickAvatarWalk(av, dx, dz, dt);
  `);

  const makeAv = () => ({
    walkPhase: 0, walkAmp: 0, down: false,
    group: { userData: { rig: {
      legs: [ { pivot: { rotation: { x: 0 } }, knee: { rotation: { x: 0 } }, phase: 0 },
              { pivot: { rotation: { x: 0 } }, knee: { rotation: { x: 0 } }, phase: Math.PI } ],
      arms: [ { pivot: { rotation: { x: 0 } }, phase: Math.PI },
              { pivot: { rotation: { x: 0 } }, phase: 0 } ]
    } } }
  });

  // Walk at ~3 m/s (above threshold) for ~1.5s; amplitude should ramp up and limbs swing.
  const av = makeAv();
  const dt = 1 / 60, vx = 3.0; // m/s along +x
  let maxLeg = 0, maxArm = 0, minKnee = Infinity;
  for (let i = 0; i < 90; i++) {
    tick(av, vx * dt, 0, dt);
    const r = av.group.userData.rig;
    maxLeg = Math.max(maxLeg, Math.abs(r.legs[0].pivot.rotation.x));
    maxArm = Math.max(maxArm, Math.abs(r.arms[0].pivot.rotation.x));
    minKnee = Math.min(minKnee, r.legs[0].knee.rotation.x);
  }
  if (av.walkAmp > 0.8) ok(`moving → swing amplitude ramps up (amp=${av.walkAmp.toFixed(2)})`);
  else fail(`amp did not ramp while moving (amp=${av.walkAmp.toFixed(2)})`);
  if (maxLeg > 0.2 && maxArm > 0.15) ok(`legs + arms actually swing (legΔ=${maxLeg.toFixed(2)}, armΔ=${maxArm.toFixed(2)})`);
  else fail(`limbs barely move (leg=${maxLeg.toFixed(2)} arm=${maxArm.toFixed(2)})`);
  if (minKnee >= -1e-9) ok('knee bend is always ≥ 0 (no hyperextension)');
  else fail(`knee went negative (${minKnee.toFixed(3)})`);

  // At a single mid-stride frame, legs are in anti-phase and each arm opposes its leg.
  {
    const a = makeAv(); a.walkAmp = 1; a.walkPhase = 0.4; // mid-stride, full amplitude
    tick(a, 0.02, 0, dt); // tiny step: stays "moving" (amp high), barely advances phase
    const r = a.group.userData.rig;
    const legL = r.legs[0].pivot.rotation.x, legR = r.legs[1].pivot.rotation.x; // phases 0 vs π
    const armL = r.arms[0].pivot.rotation.x; // arm L phase π → opposes leg L (phase 0)
    if (Math.sign(legL) === -Math.sign(legR) && legL !== 0) ok('legs swing in anti-phase (one forward, one back)');
    else fail(`legs not anti-phase (L=${legL.toFixed(2)} R=${legR.toFixed(2)})`);
    if (Math.sign(armL) === -Math.sign(legL) && armL !== 0) ok('contralateral: arm L opposes leg L');
    else fail(`arm/leg not contralateral (legL=${legL.toFixed(2)} armL=${armL.toFixed(2)})`);
  }

  // Idle: amp eases back to ~0 and limbs settle to neutral.
  const idle = makeAv(); idle.walkAmp = 1; idle.walkPhase = 1.2;
  for (let i = 0; i < 200; i++) tick(idle, 0, 0, dt); // no displacement
  const ri = idle.group.userData.rig;
  const settled = Math.abs(ri.legs[0].pivot.rotation.x) < 1e-3 && Math.abs(ri.arms[0].pivot.rotation.x) < 1e-3;
  if (idle.walkAmp < 0.01 && settled) ok(`idle → amp eases to 0 (${idle.walkAmp.toExponential(1)}), limbs settle to neutral`);
  else fail(`idle did not settle (amp=${idle.walkAmp.toFixed(3)} leg=${ri.legs[0].pivot.rotation.x.toFixed(3)})`);

  // Down avatar never swings even if "moving".
  const down = makeAv(); down.down = true;
  for (let i = 0; i < 120; i++) tick(down, vx * dt, 0, dt);
  if (down.walkAmp < 0.01) ok('down avatar never swings (amp stays 0)');
  else fail(`down avatar animated (amp=${down.walkAmp.toFixed(3)})`);

  // Determinism: identical inputs → identical output.
  const a1 = makeAv(), a2 = makeAv();
  for (let i = 0; i < 50; i++) { tick(a1, 0.04, 0.02, dt); tick(a2, 0.04, 0.02, dt); }
  if (a1.walkPhase === a2.walkPhase && a1.walkAmp === a2.walkAmp) ok('deterministic for identical inputs');
  else fail('non-deterministic walk tick');
}

console.log(fails === 0 ? '\nALL AVATAR TESTS PASSED' : `\n${fails} FAILURE(S)`);
process.exit(fails === 0 ? 0 : 1);
