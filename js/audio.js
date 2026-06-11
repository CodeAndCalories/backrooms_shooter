/* BACKROOMS FPS — PROCEDURAL AUDIO ENGINE */
"use strict";

let audioCtx = null, masterGain = null, sfxGain = null, ambientGain = null;
let humNode = null, humGain = null, poolNode = null, pipeNode = null;
let volMaster = 1.0, volAmbient = 0.6, volSFX = 1.0;
let humFlickerTimer = 0;

/* ═══════════════════════════════════════════
   PROCEDURAL AUDIO
   ═══════════════════════════════════════════ */
function initAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  
  masterGain = audioCtx.createGain();
  masterGain.gain.value = volMaster;
  masterGain.connect(audioCtx.destination);
  
  sfxGain = audioCtx.createGain();
  sfxGain.gain.value = volSFX;
  sfxGain.connect(masterGain);
  
  ambientGain = audioCtx.createGain();
  ambientGain.gain.value = volAmbient;
  ambientGain.connect(masterGain);
}

function playSound(fn) { if (audioCtx) fn(); }

/* ═══════════════════════════════════════════
   GUN SOUND SELECTOR — 3 procedural variants, chosen in pause settings,
   persisted in localStorage. playGunshot() dispatches on gunSoundMode, so the
   change applies to the very next shot (and the settings button test-fires).
   ═══════════════════════════════════════════ */
const GUN_SOUND_KEY = 'backrooms_gun_sound';
const GUN_SOUND_MODES = ['sharp', 'heavy', 'suppressed'];
const GUN_SOUND_LABELS = { sharp: 'Sharp', heavy: 'Heavy', suppressed: 'Suppressed' };
let gunSoundMode = (() => {
  try {
    const v = localStorage.getItem(GUN_SOUND_KEY);
    return GUN_SOUND_MODES.includes(v) ? v : 'sharp';
  } catch (e) { return 'sharp'; }
})();
function setGunSoundMode(mode) {
  if (!GUN_SOUND_MODES.includes(mode)) return;
  gunSoundMode = mode;
  try { localStorage.setItem(GUN_SOUND_KEY, mode); } catch (e) {}
}

function playGunshot() {
  if (gunSoundMode === 'heavy') return playGunshotHeavy();
  if (gunSoundMode === 'suppressed') return playGunshotSuppressed();
  return playGunshotSharp();
}

// OPTION 1 "Sharp" — the original shot, unchanged: bright broadband crack,
// short 1.6kHz bark, small 220→90Hz pop.
function playGunshotSharp() {
  playSound(() => {
    const t = audioCtx.currentTime;
    const sr = audioCtx.sampleRate;

    // 1. CRACK — the loud, bright, broadband transient that makes a gun a gun. White
    //    noise, near-instant attack, ~10ms decay, aggressively high-passed with TWO
    //    boosted high bands (a 5kHz snap peak + a 7kHz air shelf) so the top end
    //    dominates. Much louder than before so the crack — not the low-end — is the
    //    sound you hear.
    const crackLen = sr * 0.04;
    const crackBuf = audioCtx.createBuffer(1, crackLen, sr);
    const cd = crackBuf.getChannelData(0);
    for (let i = 0; i < crackLen; i++) {
      cd[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sr * 0.010)); // ~10ms decay
    }
    const crack = audioCtx.createBufferSource();
    crack.buffer = crackBuf;
    const crackHP = audioCtx.createBiquadFilter();
    crackHP.type = 'highpass'; crackHP.frequency.value = 3500; crackHP.Q.value = 0.7;
    const peak1 = audioCtx.createBiquadFilter();
    peak1.type = 'peaking'; peak1.frequency.value = 5000; peak1.Q.value = 0.9; peak1.gain.value = 11;
    const peak2 = audioCtx.createBiquadFilter();
    peak2.type = 'highshelf'; peak2.frequency.value = 7000; peak2.gain.value = 9; // extra "air"/snap
    const crackGain = audioCtx.createGain();
    crackGain.gain.setValueAtTime(5.5, t);   // much louder, instant
    crackGain.gain.exponentialRampToValueAtTime(0.01, t + 0.035);
    crack.connect(crackHP); crackHP.connect(peak1); peak1.connect(peak2); peak2.connect(crackGain);
    crackGain.connect(sfxGain);
    crack.start(t);

    // 2. BODY — a short mid "bark" so it isn't pure hiss. A BANDPASS around 1.6kHz
    //    (not a lowpass sweeping down to 400Hz — that downward sweep is exactly what
    //    made the old shot read as a drum). Short and modest.
    const bodyLen = sr * 0.06;
    const bodyBuf = audioCtx.createBuffer(1, bodyLen, sr);
    const bd = bodyBuf.getChannelData(0);
    for (let i = 0; i < bodyLen; i++) {
      bd[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sr * 0.018));
    }
    const body = audioCtx.createBufferSource();
    body.buffer = bodyBuf;
    const bodyBP = audioCtx.createBiquadFilter();
    bodyBP.type = 'bandpass'; bodyBP.frequency.value = 1600; bodyBP.Q.value = 0.8;
    const bodyGain = audioCtx.createGain();
    bodyGain.gain.setValueAtTime(0.8, t);
    bodyGain.gain.exponentialRampToValueAtTime(0.01, t + 0.06);
    body.connect(bodyBP); bodyBP.connect(bodyGain); bodyGain.connect(sfxGain);
    body.start(t);

    // 3. PUNCH — a tiny, fast click for weight. Short (~35ms) and NOT sub-bass: it
    //    bottoms out at 90Hz, not 40Hz, so it adds a "pop" without the boomy drum tail.
    const osc = audioCtx.createOscillator();
    const oscGain = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(90, t + 0.03);
    oscGain.gain.setValueAtTime(0.35, t);    // small — supports, never dominates
    oscGain.gain.exponentialRampToValueAtTime(0.01, t + 0.035);
    osc.connect(oscGain); oscGain.connect(sfxGain);
    osc.start(t); osc.stop(t + 0.04);
  });
}

// OPTION 2 "Heavy" — beefier bang: the crack is darker and slightly tamer, the
// body is a longer, louder low-mid bark (700Hz, ~120ms), and the punch is a
// bigger 160→55Hz thump. Same three-layer recipe as Sharp, weighted downward.
function playGunshotHeavy() {
  playSound(() => {
    const t = audioCtx.currentTime;
    const sr = audioCtx.sampleRate;

    // 1. CRACK — same broadband transient but high-passed lower (2kHz) with a
    //    modest 3.5kHz peak instead of Sharp's 5k/7k sizzle: present, not piercing.
    const crackLen = sr * 0.04;
    const crackBuf = audioCtx.createBuffer(1, crackLen, sr);
    const cd = crackBuf.getChannelData(0);
    for (let i = 0; i < crackLen; i++) {
      cd[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sr * 0.010));
    }
    const crack = audioCtx.createBufferSource();
    crack.buffer = crackBuf;
    const crackHP = audioCtx.createBiquadFilter();
    crackHP.type = 'highpass'; crackHP.frequency.value = 2000; crackHP.Q.value = 0.7;
    const peak = audioCtx.createBiquadFilter();
    peak.type = 'peaking'; peak.frequency.value = 3500; peak.Q.value = 0.9; peak.gain.value = 7;
    const crackGain = audioCtx.createGain();
    crackGain.gain.setValueAtTime(3.8, t);
    crackGain.gain.exponentialRampToValueAtTime(0.01, t + 0.035);
    crack.connect(crackHP); crackHP.connect(peak); peak.connect(crackGain);
    crackGain.connect(sfxGain);
    crack.start(t);

    // 2. BODY — the beef. Bandpass dropped to 700Hz, twice the length (~120ms),
    //    noticeably louder than Sharp's bark: the low-mid "boom" of a big bore.
    const bodyLen = sr * 0.12;
    const bodyBuf = audioCtx.createBuffer(1, bodyLen, sr);
    const bd = bodyBuf.getChannelData(0);
    for (let i = 0; i < bodyLen; i++) {
      bd[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sr * 0.035));
    }
    const body = audioCtx.createBufferSource();
    body.buffer = bodyBuf;
    const bodyBP = audioCtx.createBiquadFilter();
    bodyBP.type = 'bandpass'; bodyBP.frequency.value = 700; bodyBP.Q.value = 0.7;
    const bodyGain = audioCtx.createGain();
    bodyGain.gain.setValueAtTime(2.2, t);
    bodyGain.gain.exponentialRampToValueAtTime(0.01, t + 0.12);
    body.connect(bodyBP); bodyBP.connect(bodyGain); bodyGain.connect(sfxGain);
    body.start(t);

    // 3. PUNCH — bigger and deeper than Sharp's pop: 160→55Hz over ~70ms. Still
    //    short enough not to read as a drum.
    const osc = audioCtx.createOscillator();
    const oscGain = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(55, t + 0.06);
    oscGain.gain.setValueAtTime(0.7, t);
    oscGain.gain.exponentialRampToValueAtTime(0.01, t + 0.075);
    osc.connect(oscGain); oscGain.connect(sfxGain);
    osc.start(t); osc.stop(t + 0.08);
  });
}

// OPTION 3 "Suppressed" — for long sessions: a quiet, muffled thump-click.
// Everything lowpassed, total level far below the other two (loudest gain 0.9
// vs Sharp's 5.5 crack), and over in ~80ms. Thump + tiny mechanical click.
function playGunshotSuppressed() {
  playSound(() => {
    const t = audioCtx.currentTime;
    const sr = audioCtx.sampleRate;

    // 1. THUMP — short noise burst through a 900Hz lowpass: the muffled "pfft".
    const thumpLen = sr * 0.06;
    const thumpBuf = audioCtx.createBuffer(1, thumpLen, sr);
    const td = thumpBuf.getChannelData(0);
    for (let i = 0; i < thumpLen; i++) {
      td[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sr * 0.015));
    }
    const thump = audioCtx.createBufferSource();
    thump.buffer = thumpBuf;
    const thumpLP = audioCtx.createBiquadFilter();
    thumpLP.type = 'lowpass'; thumpLP.frequency.value = 900; thumpLP.Q.value = 0.7;
    const thumpGain = audioCtx.createGain();
    thumpGain.gain.setValueAtTime(0.9, t);
    thumpGain.gain.exponentialRampToValueAtTime(0.01, t + 0.06);
    thump.connect(thumpLP); thumpLP.connect(thumpGain); thumpGain.connect(sfxGain);
    thump.start(t);

    // 2. CLICK — the action cycling: a faint, very short (~8ms) mid tick so each
    //    shot still has a crisp edge to time follow-up shots by.
    const clickLen = sr * 0.012;
    const clickBuf = audioCtx.createBuffer(1, clickLen, sr);
    const kd = clickBuf.getChannelData(0);
    for (let i = 0; i < clickLen; i++) {
      kd[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sr * 0.002));
    }
    const click = audioCtx.createBufferSource();
    click.buffer = clickBuf;
    const clickBP = audioCtx.createBiquadFilter();
    clickBP.type = 'bandpass'; clickBP.frequency.value = 2500; clickBP.Q.value = 1.2;
    const clickGain = audioCtx.createGain();
    clickGain.gain.setValueAtTime(0.25, t);
    clickGain.gain.exponentialRampToValueAtTime(0.01, t + 0.015);
    click.connect(clickBP); clickBP.connect(clickGain); clickGain.connect(sfxGain);
    click.start(t);

    // 3. Low sine knock for a hint of weight — quiet and brief.
    const osc = audioCtx.createOscillator();
    const oscGain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(70, t + 0.04);
    oscGain.gain.setValueAtTime(0.3, t);
    oscGain.gain.exponentialRampToValueAtTime(0.01, t + 0.05);
    osc.connect(oscGain); oscGain.connect(sfxGain);
    osc.start(t); osc.stop(t + 0.06);
  });
}

/* ═══════════════════════════════════════════
   PER-WEAPON SHOT SOUNDS — the pistol keeps the selectable sharp/heavy/
   suppressed report (playGunshot); the new guns each get a fixed character.
   playWeaponShot dispatches by the weapon's sound id (main.js: playerShoot).
   ═══════════════════════════════════════════ */
function playWeaponShot(sound) {
  if (sound === 'shotgun') return playGunshotShotgun();
  if (sound === 'smg') return playGunshotSmg();
  if (sound === 'flare') return playGunshotFlare();
  return playGunshot(); // pistol — user-selectable variant
}

// SHOTGUN — a heavy procedural BOOM: a big low-mid blast body (450Hz, ~180ms),
// a broad crack on top, and a deep 130→45Hz thump. Loud and round.
function playGunshotShotgun() {
  playSound(() => {
    const t = audioCtx.currentTime, sr = audioCtx.sampleRate;
    // CRACK — broad noise transient
    const cl = sr * 0.05, cb = audioCtx.createBuffer(1, cl, sr), cd = cb.getChannelData(0);
    for (let i = 0; i < cl; i++) cd[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sr * 0.012));
    const crack = audioCtx.createBufferSource(); crack.buffer = cb;
    const chp = audioCtx.createBiquadFilter(); chp.type = 'highpass'; chp.frequency.value = 1600; chp.Q.value = 0.6;
    const cpk = audioCtx.createBiquadFilter(); cpk.type = 'peaking'; cpk.frequency.value = 3200; cpk.Q.value = 0.8; cpk.gain.value = 8;
    const cg = audioCtx.createGain(); cg.gain.setValueAtTime(4.2, t); cg.gain.exponentialRampToValueAtTime(0.01, t + 0.05);
    crack.connect(chp); chp.connect(cpk); cpk.connect(cg); cg.connect(sfxGain); crack.start(t);
    // BODY — fat low-mid blast, the "boom"
    const bl = sr * 0.18, bb = audioCtx.createBuffer(1, bl, sr), bd = bb.getChannelData(0);
    for (let i = 0; i < bl; i++) bd[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sr * 0.05));
    const body = audioCtx.createBufferSource(); body.buffer = bb;
    const bbp = audioCtx.createBiquadFilter(); bbp.type = 'bandpass'; bbp.frequency.value = 450; bbp.Q.value = 0.6;
    const bg = audioCtx.createGain(); bg.gain.setValueAtTime(3.0, t); bg.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
    body.connect(bbp); bbp.connect(bg); bg.connect(sfxGain); body.start(t);
    // THUMP — deep concussion
    const o = audioCtx.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.1);
    const og = audioCtx.createGain(); og.gain.setValueAtTime(1.0, t); og.gain.exponentialRampToValueAtTime(0.01, t + 0.12);
    o.connect(og); og.connect(sfxGain); o.start(t); o.stop(t + 0.13);
  });
}

// SMG — snappy, light, bright crack: short noise pop, tight high peak, almost no
// body. Built to be rattled off fast without fatiguing.
function playGunshotSmg() {
  playSound(() => {
    const t = audioCtx.currentTime, sr = audioCtx.sampleRate;
    const cl = sr * 0.03, cb = audioCtx.createBuffer(1, cl, sr), cd = cb.getChannelData(0);
    for (let i = 0; i < cl; i++) cd[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sr * 0.006));
    const crack = audioCtx.createBufferSource(); crack.buffer = cb;
    const hp = audioCtx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3000; hp.Q.value = 0.7;
    const pk = audioCtx.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 5200; pk.Q.value = 1.0; pk.gain.value = 9;
    const g = audioCtx.createGain(); g.gain.setValueAtTime(2.6, t); g.gain.exponentialRampToValueAtTime(0.01, t + 0.025);
    crack.connect(hp); hp.connect(pk); pk.connect(g); g.connect(sfxGain); crack.start(t);
    // tiny mid click for mechanical edge
    const o = audioCtx.createOscillator(); o.type = 'square';
    o.frequency.setValueAtTime(420, t); o.frequency.exponentialRampToValueAtTime(180, t + 0.018);
    const og = audioCtx.createGain(); og.gain.setValueAtTime(0.18, t); og.gain.exponentialRampToValueAtTime(0.01, t + 0.02);
    o.connect(og); og.connect(sfxGain); o.start(t); o.stop(t + 0.025);
  });
}

// FLARE — a hollow THUNK + a rising whoosh of the burning projectile launching:
// muffled low pop then a band-swept noise tail. Distinct from the bullet guns.
function playGunshotFlare() {
  playSound(() => {
    const t = audioCtx.currentTime, sr = audioCtx.sampleRate;
    // THUNK — short low pop (the launch charge)
    const o = audioCtx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(280, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.07);
    const og = audioCtx.createGain(); og.gain.setValueAtTime(0.9, t); og.gain.exponentialRampToValueAtTime(0.01, t + 0.09);
    o.connect(og); og.connect(sfxGain); o.start(t); o.stop(t + 0.1);
    // WHOOSH — noise tail swept up through a bandpass (the flare leaving the bore)
    const nl = sr * 0.32, nb = audioCtx.createBuffer(1, nl, sr), nd = nb.getChannelData(0);
    for (let i = 0; i < nl; i++) nd[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sr * 0.12));
    const n = audioCtx.createBufferSource(); n.buffer = nb;
    const bp = audioCtx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.9;
    bp.frequency.setValueAtTime(500, t); bp.frequency.exponentialRampToValueAtTime(2600, t + 0.3);
    const ng = audioCtx.createGain(); ng.gain.setValueAtTime(0.5, t); ng.gain.exponentialRampToValueAtTime(0.01, t + 0.32);
    n.connect(bp); bp.connect(ng); ng.connect(sfxGain); n.start(t);
  });
}

// Weapon swap — a quick two-part mechanical clack (handling + a lighter snap).
function playWeaponSwitch() {
  playSound(() => {
    const t = audioCtx.currentTime, sr = audioCtx.sampleRate;
    for (const [at, freq, lvl] of [[0, 220, 0.3], [0.06, 520, 0.2]]) {
      const cl = sr * 0.02, cb = audioCtx.createBuffer(1, cl, sr), cd = cb.getChannelData(0);
      for (let i = 0; i < cl; i++) cd[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sr * 0.004));
      const s = audioCtx.createBufferSource(); s.buffer = cb;
      const f = audioCtx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 1.4;
      const g = audioCtx.createGain(); g.gain.setValueAtTime(lvl, t + at); g.gain.exponentialRampToValueAtTime(0.01, t + at + 0.03);
      s.connect(f); f.connect(g); g.connect(sfxGain); s.start(t + at);
    }
  });
}

// MP: a teammate's shot, distance-attenuated, with a tone hint per weapon class
// (boomy shotgun / snappy smg / hollow flare / generic pistol). Replaces the old
// single playRemoteGunshot for the weapon system.
function playRemoteShot(sound, dist) {
  playSound(() => {
    const t = audioCtx.currentTime, sr = audioCtx.sampleRate;
    const gain = Math.max(0.03, 0.30 / (1 + dist * 0.09));
    const dur = sound === 'shotgun' ? 0.22 : 0.14;
    const buf = audioCtx.createBuffer(1, sr * dur, sr), d = buf.getChannelData(0);
    const decay = sound === 'shotgun' ? 16 : (sound === 'smg' ? 60 : 30);
    for (let i = 0; i < d.length; i++) { const tt = i / sr; d[i] = (Math.random() * 2 - 1) * Math.exp(-tt * decay) * 0.9; }
    const src = audioCtx.createBufferSource(); src.buffer = buf;
    const f = audioCtx.createBiquadFilter();
    if (sound === 'shotgun') { f.type = 'lowpass'; f.frequency.value = Math.max(350, 1400 - dist * 30); }
    else if (sound === 'smg') { f.type = 'highpass'; f.frequency.value = Math.max(400, 1200 - dist * 20); }
    else { f.type = 'lowpass'; f.frequency.value = Math.max(500, 2400 - dist * 45); }
    const g = audioCtx.createGain(); g.gain.value = gain * (sound === 'shotgun' ? 1.3 : 1.0);
    src.connect(f); f.connect(g); g.connect(sfxGain); src.start(t);
  });
}

function playHit() {
  playSound(() => {
    const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.08, audioCtx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) { const t = i / audioCtx.sampleRate; d[i] = Math.sin(t * 2200) * Math.exp(-t * 55) * 0.4; }
    const src = audioCtx.createBufferSource(); src.buffer = buf;
    const g = audioCtx.createGain(); g.gain.value = 0.3;
    src.connect(g); g.connect(sfxGain); src.start();
  });
}

function playReload() {
  playSound(() => {
    const dur = 0.5;
    const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * dur, audioCtx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      const t = i / audioCtx.sampleRate;
      const noise = Math.random() * 2 - 1;
      let val = 0;
      if (t < 0.1) val += (noise * 0.5 + Math.sin(t * 800) * 0.5) * Math.exp(-t * 50);
      if (t > 0.2 && t < 0.3) val += (noise * 0.6 + Math.sin((t-0.2) * 600) * 0.4) * Math.exp(-(t-0.2) * 60);
      if (t > 0.35 && t < 0.5) {
        const slideT = t - 0.35;
        val += (noise * 0.8 + Math.sin(slideT * 1200) * 0.5) * Math.exp(-slideT * 40);
        if (slideT > 0.05) val += Math.sin((slideT - 0.05) * 4000) * Math.exp(-(slideT - 0.05) * 100) * 0.3;
      }
      d[i] = val;
    }
    const src = audioCtx.createBufferSource(); src.buffer = buf;
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'bandpass'; filter.frequency.value = 1500; filter.Q.value = 1.0;
    const g = audioCtx.createGain(); g.gain.value = 0.8;
    src.connect(filter); filter.connect(g); g.connect(sfxGain); src.start();
  });
}

function playPickup() {
  playSound(() => {
    const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.2, audioCtx.sampleRate);
    const d = buf.getChannelData(0);
    for(let i=0; i<d.length; i++) {
      const t = i/audioCtx.sampleRate;
      d[i] = Math.sin(t * 1500) * Math.exp(-t * 15) * 0.2 + Math.sin(t * 2500) * Math.exp(-t * 20) * 0.1;
    }
    const src = audioCtx.createBufferSource(); src.buffer = buf;
    const g = audioCtx.createGain(); g.gain.value = 0.3;
    src.connect(g); g.connect(sfxGain); src.start();
  });
}

// Lore objective: collecting an artifact — a bright ascending chime (a resolving
// "found it" sound), clearly distinct from the ammo pickup blip.
function playArtifactPickup() {
  playSound(() => {
    const t = audioCtx.currentTime;
    const notes = [[523.25, 0], [783.99, 0.09], [1046.5, 0.18]]; // C5 → G5 → C6
    for (const [freq, at] of notes) {
      const o = audioCtx.createOscillator(); o.type = 'triangle';
      o.frequency.setValueAtTime(freq, t + at);
      const g = audioCtx.createGain();
      g.gain.setValueAtTime(0.0001, t + at);
      g.gain.exponentialRampToValueAtTime(0.3, t + at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.01, t + at + 0.35);
      const o2 = audioCtx.createOscillator(); o2.type = 'sine';
      o2.frequency.setValueAtTime(freq * 2, t + at);
      const g2 = audioCtx.createGain();
      g2.gain.setValueAtTime(0.0001, t + at);
      g2.gain.exponentialRampToValueAtTime(0.08, t + at + 0.02);
      g2.gain.exponentialRampToValueAtTime(0.01, t + at + 0.3);
      o.connect(g); g.connect(sfxGain); o.start(t + at); o.stop(t + at + 0.38);
      o2.connect(g2); g2.connect(sfxGain); o2.start(t + at); o2.stop(t + at + 0.32);
    }
  });
}

function playDamage() {
  playSound(() => {
    const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.15, audioCtx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      const t = i / audioCtx.sampleRate;
      d[i] = (Math.random() * 2 - 1) * Math.exp(-t * 20) * 0.3 + Math.sin(t * 120) * Math.exp(-t * 18) * 0.2;
    }
    const src = audioCtx.createBufferSource(); src.buffer = buf;
    const g = audioCtx.createGain(); g.gain.value = 0.35;
    src.connect(g); g.connect(sfxGain); src.start();
  });
}

function playEnemyDeath() {
  playSound(() => {
    const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.5, audioCtx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      const t = i / audioCtx.sampleRate;
      d[i] = Math.sin(t * 280 * (1 - t * 0.8)) * Math.exp(-t * 5) * 0.4 + (Math.random() * 2 - 1) * Math.exp(-t * 7) * 0.15;
    }
    const src = audioCtx.createBufferSource(); src.buffer = buf;
    const g = audioCtx.createGain(); g.gain.value = 0.35;
    src.connect(g); g.connect(sfxGain); src.start();
  });
}

function playBossRoar() {
  playSound(() => {
    const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * 1.5, audioCtx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      const t = i / audioCtx.sampleRate;
      d[i] = Math.sin(t * 60 * (1 + Math.sin(t * 4) * 0.5)) * Math.exp(-t * 1.0) * 0.6;
      d[i] += (Math.random() * 2 - 1) * Math.exp(-t * 1.5) * 0.4;
      d[i] += Math.sin(t * 30) * Math.exp(-t * 0.8) * 0.3;
    }
    const src = audioCtx.createBufferSource(); src.buffer = buf;
    const g = audioCtx.createGain(); g.gain.value = 0.6;
    src.connect(g); g.connect(sfxGain); src.start();
  });
}

// Level Fun balloon trap: the pop — an instant high noise SNAP (latex burst)
// plus a tiny square-wave "blip" of escaping air. Short and loud-ish.
function playBalloonPop() {
  playSound(() => {
    const t = audioCtx.currentTime;
    const sr = audioCtx.sampleRate;
    // 1. SNAP — white noise, ~6ms decay, highpassed so it cracks
    const len = sr * 0.07;
    const buf = audioCtx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sr * 0.006));
    const src = audioCtx.createBufferSource(); src.buffer = buf;
    const hp = audioCtx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1800; hp.Q.value = 0.7;
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(1.4, t);
    g.gain.exponentialRampToValueAtTime(0.01, t + 0.06);
    src.connect(hp); hp.connect(g); g.connect(sfxGain); src.start(t);
    // 2. BLIP — fast 300→80Hz square pip (the rubber recoiling)
    const o = audioCtx.createOscillator(); o.type = 'square';
    o.frequency.setValueAtTime(300, t);
    o.frequency.exponentialRampToValueAtTime(80, t + 0.05);
    const og = audioCtx.createGain();
    og.gain.setValueAtTime(0.22, t);
    og.gain.exponentialRampToValueAtTime(0.01, t + 0.055);
    o.connect(og); og.connect(sfxGain);
    o.start(t); o.stop(t + 0.06);
  });
}

// Level Fun balloon trap: the party answers. Same synth recipe as playBossRoar
// pitched DOWN (60→38Hz base, slower modulation, longer tail) and lowpassed —
// reads as a big angry thing growling rather than the boss's full roar.
function playPartyGrowl() {
  playSound(() => {
    const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * 1.8, audioCtx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      const t = i / audioCtx.sampleRate;
      d[i] = Math.sin(t * 38 * (1 + Math.sin(t * 3) * 0.6)) * Math.exp(-t * 0.9) * 0.7;
      d[i] += (Math.random() * 2 - 1) * Math.exp(-t * 1.2) * 0.35;
      d[i] += Math.sin(t * 19) * Math.exp(-t * 0.7) * 0.35;
    }
    const src = audioCtx.createBufferSource(); src.buffer = buf;
    const lp = audioCtx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320;
    const g = audioCtx.createGain(); g.gain.value = 0.55;
    src.connect(lp); lp.connect(g); g.connect(sfxGain); src.start();
  });
}

function playProjectileThrow() {
  playSound(() => {
    const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.25, audioCtx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      const t = i / audioCtx.sampleRate;
      d[i] = (Math.random() * 2 - 1) * Math.exp(-t * 12) * 0.3;
      d[i] += Math.sin(t * 500 * (1 - t * 2)) * Math.exp(-t * 10) * 0.2;
    }
    const src = audioCtx.createBufferSource(); src.buffer = buf;
    const g = audioCtx.createGain(); g.gain.value = 0.3;
    src.connect(g); g.connect(sfxGain); src.start();
  });
}

function playFlashlightClick() {
  playSound(() => {
    const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.04, audioCtx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      const t = i / audioCtx.sampleRate;
      d[i] = Math.sin(t * 3000) * Math.exp(-t * 120) * 0.3;
    }
    const src = audioCtx.createBufferSource(); src.buffer = buf;
    const g = audioCtx.createGain(); g.gain.value = 0.2;
    src.connect(g); g.connect(sfxGain); src.start();
  });
}

// MP: a TEAMMATE's gunshot — quieter and muffled with distance (net.js passes
// the world-space distance to the shooter). Generic report on purpose: it
// doesn't track each player's gun-sound setting.
function playRemoteGunshot(dist) {
  playSound(() => {
    const gain = Math.max(0.03, 0.30 / (1 + dist * 0.09));
    const dur = 0.14;
    const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * dur, audioCtx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      const t = i / audioCtx.sampleRate;
      d[i] = (Math.random() * 2 - 1) * Math.exp(-t * 45) * 0.9;
    }
    const src = audioCtx.createBufferSource(); src.buffer = buf;
    const f = audioCtx.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.value = Math.max(500, 2400 - dist * 45); // farther = duller
    const g = audioCtx.createGain(); g.gain.value = gain;
    src.connect(f); f.connect(g); g.connect(sfxGain); src.start();
  });
}

// Pools: body-drop splash on entering water (triggered by updateWaterPlayerFX
// in main.js). Low-passed noise burst with a quick decay — reads as displaced
// water without any sample assets.
function playSplash() {
  playSound(() => {
    const dur = 0.45;
    const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * dur, audioCtx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      const t = i / audioCtx.sampleRate;
      d[i] = (Math.random() * 2 - 1) * Math.exp(-t * 9) * 0.6;
    }
    const src = audioCtx.createBufferSource(); src.buffer = buf;
    const f = audioCtx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; f.Q.value = 0.7;
    const g = audioCtx.createGain(); g.gain.value = 0.5;
    src.connect(f); f.connect(g); g.connect(sfxGain); src.start();
  });
}

// Pools: soft wading swish while moving through water — one per "footfall"
// (main.js paces these on a ~0.4-0.55s timer). Quieter, shorter splash with a
// randomized band so consecutive steps don't sound identical.
function playWade() {
  playSound(() => {
    const dur = 0.18;
    const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * dur, audioCtx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      const t = i / audioCtx.sampleRate;
      d[i] = (Math.random() * 2 - 1) * Math.exp(-t * 16) * 0.5;
    }
    const src = audioCtx.createBufferSource(); src.buffer = buf;
    const f = audioCtx.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.value = 550 + Math.random() * 350; f.Q.value = 0.8;
    const g = audioCtx.createGain(); g.gain.value = 0.16;
    src.connect(f); f.connect(g); g.connect(sfxGain); src.start();
  });
}

function startAmbient() {
  if (!audioCtx) return;
  if (humNode) { humNode.stop(); humNode = null; }
  if (poolNode) { clearInterval(poolNode); poolNode = null; }
  if (pipeNode) { clearInterval(pipeNode); pipeNode = null; }

  const theme = getTheme(currentFloor);

  if (theme.water) {
    // Pools floors (Poolrooms + Dark Pools): echoing water drops. The dark
    // variant drips slower and lower-pitched.
    const dark = (theme.darknessLevel || 0) > 0.5;
    poolNode = setInterval(() => {
      playSound(() => {
        const t = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        osc.type = 'sine';
        const f0 = dark ? 350 : 800, f1 = dark ? 550 : 1200;
        osc.frequency.setValueAtTime(f0 + Math.random() * 400, t);
        osc.frequency.exponentialRampToValueAtTime(f1 + Math.random() * 200, t + 0.1);
        g.gain.setValueAtTime(0.05, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
        
        // Add echo (delay)
        const delay = audioCtx.createDelay();
        delay.delayTime.value = 0.3;
        const fb = audioCtx.createGain(); fb.gain.value = 0.4;
        delay.connect(fb); fb.connect(delay);
        
        osc.connect(g); g.connect(ambientGain);
        g.connect(delay); delay.connect(ambientGain);
        
        osc.start(t); osc.stop(t + 0.5);
      });
    }, dark ? 2400 : 1500);
  } else if (theme.id === 2) {
    // Pipe Dreams: Metallic clanks
    pipeNode = setInterval(() => {
      playSound(() => {
        const t = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(40, t);
        osc.frequency.exponentialRampToValueAtTime(10, t + 0.2);
        g.gain.setValueAtTime(0.1, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
        
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass'; filter.frequency.value = 400;
        
        osc.connect(filter); filter.connect(g); g.connect(ambientGain);
        osc.start(t); osc.stop(t + 0.4);
      });
    }, 2500);
  } else {
    // Standard Fluorescent Hum
    humNode = audioCtx.createOscillator();
    humGain = audioCtx.createGain();
    humNode.type = 'sawtooth'; humNode.frequency.value = 60;
    humGain.gain.value = 0.018;
    const f = audioCtx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 120;
    humNode.connect(f); f.connect(humGain); humGain.connect(ambientGain);
    humNode.start();
  }
}

function updateAmbient(dt) {
  if (humGain && getTheme(currentFloor).id !== 2 && getTheme(currentFloor).id !== 3) {
    humFlickerTimer -= dt;
    if (humFlickerTimer <= 0) {
      humFlickerTimer = 3 + Math.random() * 8;
      humGain.gain.setValueAtTime(0.002, audioCtx.currentTime);
      humGain.gain.linearRampToValueAtTime(0.018, audioCtx.currentTime + 0.06 + Math.random() * 0.1);
    }
  }
}

/* ═══════════════════════════════════════════
   LEVEL FUN MUSIC (theme id 5)
   Toy-room-gone-wrong, three layers, all procedural through ambientGain:
   1. WARPED DRONE — two detuned lows beating against each other, with slow
      LFOs bending the filter and "tape-warbling" the pitch.
   2. BROKEN MUSIC BOX — a slow minor lullaby, every note slightly flat; some
      notes come out WRONG (semitone slip, rarely a tritone), like the
      mechanism is damaged.
   3. DISTANT PARTY — sparse, muffled party-horn bleats / laughter-like stabs
      at long random intervals. Timer-based Math.random ON PURPOSE: this is
      per-machine ambience, not world/spawn state — the seeded-rng constraint
      doesn't apply, and co-op players hearing different far-off laughter is
      a feature.
   Started/stopped by updateFloorMusic() on every floor change.
   ═══════════════════════════════════════════ */
let levelFunMusic = null; // { nodes:[osc...], seqTimer, stabId } while playing, else null

function startLevelFunMusic() {
  if (!audioCtx || levelFunMusic) return; // no context, or already playing
  const out = ambientGain;                // ← routes through the Ambient bus / slider
  const nodes = [];                       // every long-lived oscillator, for teardown

  // ── 1. WARPED DRONE ──
  const droneA = audioCtx.createOscillator();
  const droneB = audioCtx.createOscillator();
  droneA.type = 'sine';     droneA.frequency.value = 55;          // ~A1
  droneB.type = 'triangle'; droneB.frequency.value = 55 * 1.007;  // detuned → slow beat
  const droneFilter = audioCtx.createBiquadFilter();
  droneFilter.type = 'lowpass'; droneFilter.frequency.value = 170;
  const droneGain = audioCtx.createGain(); droneGain.gain.value = 0.09;
  // ~14s filter sweep: the room slowly "breathes"
  const lfoFilter = audioCtx.createOscillator(); lfoFilter.frequency.value = 0.07;
  const lfoFilterAmt = audioCtx.createGain(); lfoFilterAmt.gain.value = 55;
  lfoFilter.connect(lfoFilterAmt); lfoFilterAmt.connect(droneFilter.frequency);
  // ~5s pitch warble on droneB: warped-record wobble
  const lfoPitch = audioCtx.createOscillator(); lfoPitch.frequency.value = 0.21;
  const lfoPitchAmt = audioCtx.createGain(); lfoPitchAmt.gain.value = 1.6; // Hz of wobble
  lfoPitch.connect(lfoPitchAmt); lfoPitchAmt.connect(droneB.frequency);
  droneA.connect(droneFilter); droneB.connect(droneFilter);
  droneFilter.connect(droneGain); droneGain.connect(out);
  droneA.start(); droneB.start(); lfoFilter.start(); lfoPitch.start();
  nodes.push(droneA, droneB, lfoFilter, lfoPitch);

  // ── 2. BROKEN MUSIC BOX ──
  // A-minor lullaby phrase (Hz), 0 = rest. Slower than the old loop — a box
  // winding down — with rests that leave room for the drone underneath.
  const melody = [440.00, 523.25, 659.25, 523.25, 698.46, 659.25, 0, 523.25,
                  622.25, 587.33, 440.00, 0, 415.30, 440.00, 0, 0];
  const noteEvery = 680; // ms between steps
  let step = 0;

  const playNote = (freq) => {
    if (!freq) return;                       // rest
    const t = audioCtx.currentTime;
    // WRONG-note roll: 6% a tritone (really wrong), 10% a semitone slip.
    let f = freq;
    const roll = Math.random();
    if (roll < 0.06) f *= Math.pow(2, 6 / 12);
    else if (roll < 0.16) f *= Math.pow(2, (Math.random() < 0.5 ? -1 : 1) / 12);
    const detune = -8 - Math.random() * 24;  // cents — always a touch FLAT, and wavering
    const o1 = audioCtx.createOscillator(); o1.type = 'triangle'; // music-box body
    const o2 = audioCtx.createOscillator(); o2.type = 'sine';     // octave-up shimmer
    o1.frequency.value = f;     o1.detune.value = detune;
    o2.frequency.value = f * 2; o2.detune.value = detune;
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.15, t + 0.005); // fast pluck attack
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3); // long bell decay
    const g2 = audioCtx.createGain(); g2.gain.value = 0.35; // shimmer quieter
    o1.connect(g); o2.connect(g2); g2.connect(g); g.connect(out);
    o1.start(t); o2.start(t);
    o1.stop(t + 1.4); o2.stop(t + 1.4);
  };

  const seqTimer = setInterval(() => { playNote(melody[step % melody.length]); step++; }, noteEvery);
  playNote(melody[0]); step = 1; // first note now, so there's no silent gap

  // ── 3. DISTANT PARTY ──
  // A sad, bending party horn: lowpassed sawtooth sliding flat over ~0.8s.
  const hornStab = () => {
    const t = audioCtx.currentTime;
    const o = audioCtx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(233, t);
    o.frequency.linearRampToValueAtTime(176, t + 0.7); // deflating bend
    const bp = audioCtx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 480; bp.Q.value = 1.2;
    const lp = audioCtx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; // heard through walls
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.12);    // swell in
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.85);
    o.connect(bp); bp.connect(lp); lp.connect(g); g.connect(out);
    o.start(t); o.stop(t + 0.9);
  };
  // Laughter-like stab: 5 short descending muffled blips — "ha-ha-ha-ha-ha".
  const laughStab = () => {
    for (let i = 0; i < 5; i++) {
      const t = audioCtx.currentTime + i * 0.10;
      const o = audioCtx.createOscillator(); o.type = 'square';
      o.frequency.setValueAtTime(540 - i * 45, t);
      o.frequency.linearRampToValueAtTime(480 - i * 45, t + 0.07);
      const lp = audioCtx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 800;
      const g = audioCtx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.028, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      o.connect(lp); lp.connect(g); g.connect(out);
      o.start(t); o.stop(t + 0.1);
    }
  };
  const scheduleStab = () => {
    if (!levelFunMusic) return; // stopped while a stab was pending
    levelFunMusic.stabId = setTimeout(() => {
      if (!levelFunMusic) return;
      (Math.random() < 0.5 ? hornStab : laughStab)();
      scheduleStab();
    }, 12000 + Math.random() * 23000); // every 12-35s — sparse, never a rhythm
  };

  levelFunMusic = { nodes, seqTimer, stabId: null };
  scheduleStab();
}

function stopLevelFunMusic() {
  if (!levelFunMusic) return;
  clearInterval(levelFunMusic.seqTimer);
  if (levelFunMusic.stabId) clearTimeout(levelFunMusic.stabId);
  for (const n of levelFunMusic.nodes) { try { n.stop(); } catch (e) {} }
  levelFunMusic = null;
}

// Called on every floor entry (from buildMazeScene): play the Level Fun loop on floor 5,
// stop it everywhere else. Theme-keyed (id 5), so it also works on later loops.
function updateFloorMusic() {
  if (!audioCtx) return;
  if (getTheme(currentFloor).id === 5) startLevelFunMusic();
  else stopLevelFunMusic();
}

/* ═══════════════════════════════════════════
   SCARE EVENTS — procedural one-shots for the scripted-scare system
   (main.js). All Web Audio, no assets. playSlam is stereo-panned (the only
   panned SFX) so the bang has a direction.
   ═══════════════════════════════════════════ */

// LIGHTS OUT — a distant, building low rumble (~1.3s): a slow 45→30Hz sub plus
// lowpassed noise, quiet, with a soft attack so it creeps in as the lights die.
function playRumble() {
  playSound(() => {
    const t = audioCtx.currentTime, sr = audioCtx.sampleRate;
    const len = sr * 1.3, buf = audioCtx.createBuffer(1, len, sr), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const tt = i / sr;
      const env = Math.min(1, tt * 4) * Math.exp(-tt * 1.3); // soft attack, long-ish tail
      d[i] = Math.sin(tt * 2 * Math.PI * (45 - tt * 11)) * env * 0.6;
      d[i] += (Math.random() * 2 - 1) * env * 0.25;
    }
    const src = audioCtx.createBufferSource(); src.buffer = buf;
    const lp = audioCtx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 180; lp.Q.value = 0.6;
    const g = audioCtx.createGain(); g.gain.value = 0.5;
    src.connect(lp); lp.connect(g); g.connect(sfxGain); src.start(t);
  });
}

// DISTANT ROAR — the boss roar, far away: lower gain, heavily lowpassed, and run
// through a feedback DELAY so it smears into a cavernous, reverb-ish tail.
function playDistantRoar() {
  playSound(() => {
    const t = audioCtx.currentTime, sr = audioCtx.sampleRate;
    const len = sr * 1.4, buf = audioCtx.createBuffer(1, len, sr), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const tt = i / sr;
      d[i] = Math.sin(tt * 55 * (1 + Math.sin(tt * 3.5) * 0.5)) * Math.exp(-tt * 1.1) * 0.6;
      d[i] += (Math.random() * 2 - 1) * Math.exp(-tt * 1.6) * 0.3;
      d[i] += Math.sin(tt * 27) * Math.exp(-tt * 0.85) * 0.3;
    }
    const src = audioCtx.createBufferSource(); src.buffer = buf;
    const lp = audioCtx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 0.5;
    // delay line with feedback = a cheap "distance / reverb" smear
    const delay = audioCtx.createDelay(1.0); delay.delayTime.value = 0.23;
    const fb = audioCtx.createGain(); fb.gain.value = 0.45;
    const wet = audioCtx.createGain(); wet.gain.value = 0.5;
    const dry = audioCtx.createGain(); dry.gain.value = 0.28; // far-off → quiet
    src.connect(lp);
    lp.connect(dry); dry.connect(sfxGain);
    lp.connect(delay); delay.connect(fb); fb.connect(delay); // feedback loop
    delay.connect(wet); wet.connect(sfxGain);
    src.start(t);
  });
}

// THE WATCHER despawn — a soft breathy whisper: short bandpassed noise with a
// gentle swell, quiet and close-feeling. The "it was never there" sound.
function playWhisper() {
  playSound(() => {
    const t = audioCtx.currentTime, sr = audioCtx.sampleRate;
    const len = sr * 0.6, buf = audioCtx.createBuffer(1, len, sr), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const tt = i / sr;
      const env = Math.sin(Math.PI * Math.min(1, tt / 0.6)); // swell in and out
      d[i] = (Math.random() * 2 - 1) * env * 0.5;
    }
    const src = audioCtx.createBufferSource(); src.buffer = buf;
    const bp = audioCtx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 3.5;
    const hp = audioCtx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 800;
    const g = audioCtx.createGain(); g.gain.value = 0.3;
    src.connect(bp); bp.connect(hp); hp.connect(g); g.connect(sfxGain); src.start(t);
  });
}

// SLAM — a sharp door-bang, stereo-PANNED toward the source direction (pan ∈
// [-1,1], main.js computes it from the player's facing). Loud noise crack +
// low wooden thud through a StereoPanner.
function playSlam(pan) {
  playSound(() => {
    const t = audioCtx.currentTime, sr = audioCtx.sampleRate;
    const panner = audioCtx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan || 0));
    panner.connect(sfxGain);
    // CRACK — the impact transient
    const cl = sr * 0.05, cb = audioCtx.createBuffer(1, cl, sr), cd = cb.getChannelData(0);
    for (let i = 0; i < cl; i++) cd[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sr * 0.008));
    const crack = audioCtx.createBufferSource(); crack.buffer = cb;
    const cbp = audioCtx.createBiquadFilter(); cbp.type = 'bandpass'; cbp.frequency.value = 1100; cbp.Q.value = 0.6;
    const cg = audioCtx.createGain(); cg.gain.setValueAtTime(2.2, t); cg.gain.exponentialRampToValueAtTime(0.01, t + 0.06);
    crack.connect(cbp); cbp.connect(cg); cg.connect(panner); crack.start(t);
    // THUD — the heavy wooden body
    const o = audioCtx.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(50, t + 0.09);
    const og = audioCtx.createGain(); og.gain.setValueAtTime(1.1, t); og.gain.exponentialRampToValueAtTime(0.01, t + 0.12);
    o.connect(og); og.connect(panner); o.start(t); o.stop(t + 0.13);
    // low noise body for weight
    const bl = sr * 0.1, bb = audioCtx.createBuffer(1, bl, sr), bd = bb.getChannelData(0);
    for (let i = 0; i < bl; i++) bd[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sr * 0.03));
    const body = audioCtx.createBufferSource(); body.buffer = bb;
    const blp = audioCtx.createBiquadFilter(); blp.type = 'lowpass'; blp.frequency.value = 400;
    const bg = audioCtx.createGain(); bg.gain.setValueAtTime(1.0, t); bg.gain.exponentialRampToValueAtTime(0.01, t + 0.11);
    body.connect(blp); blp.connect(bg); bg.connect(panner); body.start(t);
  });
}
