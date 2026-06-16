/* BACKROOMS FPS — PROCEDURAL AUDIO ENGINE */
"use strict";

let audioCtx = null, masterGain = null, sfxGain = null, ambientGain = null;
let humNode = null, humGain = null, poolNode = null, pipeNode = null;
let volMaster = 1.0, volAmbient = 0.6, volSFX = 1.0;
let humFlickerTimer = 0, humBaseGain = 0.018;

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
// VICTORY STING (20th-floor capstone) — a slow rising major triad swell: relief
// with an uneasy edge (it's still the Backrooms). Through sfxGain.
function playVictorySting() {
  playSound(() => {
    const t = audioCtx.currentTime;
    const freqs = [261.63, 329.63, 392.00, 523.25]; // C major + octave
    freqs.forEach((f, i) => {
      const o = audioCtx.createOscillator(); o.type = i === 3 ? 'triangle' : 'sine';
      o.frequency.value = f;
      const g = audioCtx.createGain();
      const at = i * 0.18; // arpeggiated swell-in
      g.gain.setValueAtTime(0.0001, t + at);
      g.gain.exponentialRampToValueAtTime(0.12, t + at + 0.25);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
      // a faint detuned shadow voice keeps it from feeling fully safe
      const o2 = audioCtx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f; o2.detune.value = -12;
      const g2 = audioCtx.createGain(); g2.gain.value = 0.4; o2.connect(g2); g2.connect(g);
      o.connect(g); g.connect(sfxGain);
      o.start(t + at); o.stop(t + 3.0); o2.start(t + at); o2.stop(t + 3.0);
    });
  });
}

// SCANNER PING (Lights Out) — a short rising electronic sonar blip + a soft noise
// "sweep" tail, so a pulse feels like sound leaving you. Through sfxGain.
function playScannerPing() {
  playSound(() => {
    const t = audioCtx.currentTime, sr = audioCtx.sampleRate;
    // rising blip
    const o = audioCtx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(420, t); o.frequency.exponentialRampToValueAtTime(1300, t + 0.12);
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    const bp = audioCtx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 1.2;
    o.connect(bp); bp.connect(g); g.connect(sfxGain); o.start(t); o.stop(t + 0.24);
    // airy outward sweep tail (the "ping" radiating)
    const len = Math.floor(sr * 0.3), buf = audioCtx.createBuffer(1, len, sr), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sr * 0.10));
    const src = audioCtx.createBufferSource(); src.buffer = buf;
    const hp = audioCtx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.setValueAtTime(600, t); hp.frequency.exponentialRampToValueAtTime(3000, t + 0.28);
    const ng = audioCtx.createGain(); ng.gain.setValueAtTime(0.05, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    src.connect(hp); hp.connect(ng); ng.connect(sfxGain); src.start(t);
  });
}

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

/* ── SANITY + CONSUMABLES ── */

// Low-sanity whisper — a faint, diffuse breath of bandpassed noise, swelling in
// and out, quiet (routes through sfxGain). Plays occasionally when sanity is low.
function playSanityWhisper() {
  playSound(() => {
    const t = audioCtx.currentTime, sr = audioCtx.sampleRate;
    const len = sr * (0.7 + Math.random() * 0.5), buf = audioCtx.createBuffer(1, len, sr), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) { const tt = i / len; d[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * tt) * 0.5; }
    const src = audioCtx.createBufferSource(); src.buffer = buf;
    const bp = audioCtx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500 + Math.random() * 1200; bp.Q.value = 4;
    const hp = audioCtx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 700;
    // a touch of delay for an unplaceable, "behind you" smear
    const delay = audioCtx.createDelay(0.4); delay.delayTime.value = 0.12;
    const fb = audioCtx.createGain(); fb.gain.value = 0.3;
    const g = audioCtx.createGain(); g.gain.value = 0.16;
    src.connect(bp); bp.connect(hp); hp.connect(g);
    hp.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(g);
    g.connect(sfxGain); src.start(t);
  });
}

// Almond Water — a soft glug/gulp: a couple of low blips through a lowpass.
function playDrink() {
  playSound(() => {
    const t = audioCtx.currentTime;
    for (let i = 0; i < 2; i++) {
      const at = t + i * 0.14;
      const o = audioCtx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(180 - i * 30, at);
      o.frequency.exponentialRampToValueAtTime(90 - i * 20, at + 0.1);
      const lp = audioCtx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
      const g = audioCtx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.22, at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.01, at + 0.13);
      o.connect(lp); lp.connect(g); g.connect(sfxGain); o.start(at); o.stop(at + 0.15);
    }
  });
}

// Bandage — a short cloth/wrap rustle: lowpassed noise with a soft swell.
function playBandage() {
  playSound(() => {
    const t = audioCtx.currentTime, sr = audioCtx.sampleRate;
    const len = sr * 0.35, buf = audioCtx.createBuffer(1, len, sr), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) { const tt = i / len; d[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * tt) * 0.5; }
    const src = audioCtx.createBufferSource(); src.buffer = buf;
    const bp = audioCtx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = 0.8;
    const g = audioCtx.createGain(); g.gain.value = 0.22;
    src.connect(bp); bp.connect(g); g.connect(sfxGain); src.start(t);
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
    // 1. SNAP — white noise, ~4ms decay, sharply highpassed so it CRACKS (crisper
    //    + louder than before for a satisfying latex burst).
    const len = sr * 0.06;
    const buf = audioCtx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sr * 0.004));
    const src = audioCtx.createBufferSource(); src.buffer = buf;
    const hp = audioCtx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2200; hp.Q.value = 0.8;
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(1.8, t);
    g.gain.exponentialRampToValueAtTime(0.01, t + 0.05);
    src.connect(hp); hp.connect(g); g.connect(sfxGain); src.start(t);
    // 2. BLIP — fast 320→70Hz square pip (the rubber recoiling)
    const o = audioCtx.createOscillator(); o.type = 'square';
    o.frequency.setValueAtTime(320, t);
    o.frequency.exponentialRampToValueAtTime(70, t + 0.05);
    const og = audioCtx.createGain();
    og.gain.setValueAtTime(0.24, t);
    og.gain.exponentialRampToValueAtTime(0.01, t + 0.055);
    o.connect(og); og.connect(sfxGain);
    o.start(t); o.stop(t + 0.06);
    // 3. LATEX FWIP — a tiny downward sine slap for body (the skin whipping back)
    const fw = audioCtx.createOscillator(); fw.type = 'sine';
    fw.frequency.setValueAtTime(140, t); fw.frequency.exponentialRampToValueAtTime(45, t + 0.04);
    const fwg = audioCtx.createGain();
    fwg.gain.setValueAtTime(0.18, t); fwg.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    fw.connect(fwg); fwg.connect(sfxGain); fw.start(t); fw.stop(t + 0.06);
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
      // base growl SWEEPS UP a touch over the tail → reads as "rising anger"
      const sweep = 38 * (1 + t * 0.25);
      d[i] = Math.sin(t * sweep * (1 + Math.sin(t * 3) * 0.6)) * Math.exp(-t * 0.9) * 0.7;
      d[i] += (Math.random() * 2 - 1) * Math.exp(-t * 1.2) * 0.35;
      d[i] += Math.sin(t * 19) * Math.exp(-t * 0.7) * 0.35;
      d[i] += Math.sin(t * 26) * Math.exp(-t * 0.6) * 0.3; // sub-octave for menace/weight
    }
    const src = audioCtx.createBufferSource(); src.buffer = buf;
    const lp = audioCtx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 340;
    const g = audioCtx.createGain(); g.gain.value = 0.62;
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

/* ═══════════════════════════════════════════
   PER-THEME AMBIENT BEDS — a distinct low, looping room tone per floor so the
   levels don't feel dead. All procedural, routed through ambientGain (Master +
   Ambient sliders apply), deliberately SUBTLE (low gain — atmosphere, not noise).
   REBUILT ON EVERY FLOOR ENTRY (buildMazeScene → startAmbient), unlike before
   when it was set once at game start. Floors with dedicated audio (Level Fun
   music id 5, Hotel Chase alarm — 'chase') get NO bed; everything else gets a
   theme bed or a generic quiet hum. Cheap: a couple of long-lived oscillators +
   one setInterval of short one-shots per floor; all torn down by stopAmbient.
   ═══════════════════════════════════════════ */
let ambientExtra = null; // { oscs:[], intervals:[] } — every long-lived node/timer of the active bed

function stopAmbient() {
  if (humNode) { try { humNode.stop(); } catch (e) {} humNode = null; }
  humGain = null;
  if (poolNode) { clearInterval(poolNode); poolNode = null; }
  if (pipeNode) { clearInterval(pipeNode); pipeNode = null; }
  if (ambientExtra) {
    for (const o of ambientExtra.oscs) { try { o.stop(); } catch (e) {} }
    for (const id of ambientExtra.intervals) clearInterval(id);
    ambientExtra = null;
  }
}

/* ── one-shot ambient textures (each a few nodes through ambientGain, then gone) ── */
function ambDrip(dark) {
  const t = audioCtx.currentTime;
  const o = audioCtx.createOscillator(); o.type = 'sine';
  const f0 = dark ? 350 : 800, f1 = dark ? 550 : 1200;
  o.frequency.setValueAtTime(f0 + Math.random() * 400, t);
  o.frequency.exponentialRampToValueAtTime(f1 + Math.random() * 200, t + 0.1);
  const g = audioCtx.createGain(); g.gain.setValueAtTime(0.05, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
  const delay = audioCtx.createDelay(); delay.delayTime.value = 0.3;
  const fb = audioCtx.createGain(); fb.gain.value = 0.4; delay.connect(fb); fb.connect(delay);
  o.connect(g); g.connect(ambientGain); g.connect(delay); delay.connect(ambientGain);
  o.start(t); o.stop(t + 0.5);
}
function ambClank() {
  const t = audioCtx.currentTime;
  const o = audioCtx.createOscillator(); o.type = 'square';
  o.frequency.setValueAtTime(40, t); o.frequency.exponentialRampToValueAtTime(10, t + 0.2);
  const g = audioCtx.createGain(); g.gain.setValueAtTime(0.08, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
  const f = audioCtx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 400;
  o.connect(f); f.connect(g); g.connect(ambientGain); o.start(t); o.stop(t + 0.4);
}
function ambGroan() { // freezer: metal/pipe stress groan
  const t = audioCtx.currentTime, dur = 1.2 + Math.random() * 0.9;
  const o = audioCtx.createOscillator(); o.type = 'sawtooth';
  const base = 58 + Math.random() * 34;
  o.frequency.setValueAtTime(base, t); o.frequency.linearRampToValueAtTime(base * 0.7, t + dur);
  const f = audioCtx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 220;
  const g = audioCtx.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.04, t + dur * 0.3); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  const lfo = audioCtx.createOscillator(); lfo.frequency.value = 5 + Math.random() * 4;
  const lfoG = audioCtx.createGain(); lfoG.gain.value = 6; lfo.connect(lfoG); lfoG.connect(o.detune); lfo.start(t); lfo.stop(t + dur);
  o.connect(f); f.connect(g); g.connect(ambientGain); o.start(t); o.stop(t + dur + 0.02);
}
function ambBeep() { // hospital: distant monitor blip
  const t = audioCtx.currentTime;
  const o = audioCtx.createOscillator(); o.type = 'sine'; o.frequency.value = 920 + Math.random() * 60;
  const g = audioCtx.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.022, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
  o.connect(g); g.connect(ambientGain); o.start(t); o.stop(t + 0.18);
}
function ambZap() { // electrical: arc/sputter
  const t = audioCtx.currentTime, sr = audioCtx.sampleRate;
  const len = Math.floor(sr * 0.13), buf = audioCtx.createBuffer(1, len, sr), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sr * 0.02)) * (Math.random() < 0.5 ? 1 : 0);
  const src = audioCtx.createBufferSource(); src.buffer = buf;
  const f = audioCtx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 2000;
  const g = audioCtx.createGain(); g.gain.value = 0.05;
  src.connect(f); f.connect(g); g.connect(ambientGain); src.start(t);
}
function ambCrackle() { // lobby: fluorescent flicker tick
  const t = audioCtx.currentTime, sr = audioCtx.sampleRate;
  const len = Math.floor(sr * 0.08), buf = audioCtx.createBuffer(1, len, sr), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sr * 0.03));
  const src = audioCtx.createBufferSource(); src.buffer = buf;
  const bp = audioCtx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = 2;
  const g = audioCtx.createGain(); g.gain.value = 0.03;
  src.connect(bp); bp.connect(g); g.connect(ambientGain); src.start(t);
}

function startAmbient() {
  if (!audioCtx) return;
  stopAmbient();
  const out = ambientGain;
  const theme = getTheme(currentFloor);
  const extra = { oscs: [], intervals: [] };
  ambientExtra = extra;

  // steady tonal drone (osc → optional lowpass → gain → ambientGain). returns the gain node.
  const drone = (freq, type, vol, lpf) => {
    const o = audioCtx.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = audioCtx.createGain(); g.gain.value = vol;
    if (lpf) { const f = audioCtx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lpf; o.connect(f); f.connect(g); }
    else o.connect(g);
    g.connect(out); o.start(); extra.oscs.push(o);
    return g;
  };
  // steady filtered-noise drone (airy/rumble bed) — a 2s looping noise buffer.
  const noiseDrone = (vol, ftype, freq, q) => {
    const sr = audioCtx.sampleRate, len = sr * 2;
    const buf = audioCtx.createBuffer(1, len, sr), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = audioCtx.createBufferSource(); src.buffer = buf; src.loop = true;
    const f = audioCtx.createBiquadFilter(); f.type = ftype; f.frequency.value = freq; if (q) f.Q.value = q;
    const g = audioCtx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(out); src.start(); extra.oscs.push(src);
    return g;
  };
  // periodic one-shot loop (drips/beeps/zaps/groans) — fixed interval, probabilistic
  // firing for irregularity, cleanly torn down via clearInterval.
  const loop = (intervalMs, prob, fn) => {
    extra.intervals.push(setInterval(() => { if (audioCtx && Math.random() < prob) fn(); }, intervalMs));
  };
  // fluorescent hum (uses humNode/humGain so updateAmbient's flicker still works).
  const startHum = (vol, buzzy) => {
    humBaseGain = vol;
    humNode = audioCtx.createOscillator(); humGain = audioCtx.createGain();
    humNode.type = 'sawtooth'; humNode.frequency.value = 60; humGain.gain.value = vol;
    const f = audioCtx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = buzzy ? 260 : 120;
    humNode.connect(f); f.connect(humGain); humGain.connect(out); humNode.start();
    if (buzzy) { // 2nd harmonic for the electrical "buzz"
      const h = audioCtx.createOscillator(); h.type = 'sawtooth'; h.frequency.value = 120;
      const hf = audioCtx.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 420;
      const hg = audioCtx.createGain(); hg.gain.value = vol * 0.4;
      h.connect(hf); hf.connect(hg); hg.connect(out); h.start(); extra.oscs.push(h);
    }
  };

  // Floors with dedicated audio already carry the bed (music / alarm).
  if (theme.id === 5 || theme.archetype === 'chase') return;

  if (theme.water) {
    // Poolrooms / Dark Pools: water lapping + echoing drips (+ ominous sub on dark).
    const dark = (theme.darknessLevel || 0) > 0.5;
    const lapG = noiseDrone(dark ? 0.012 : 0.016, 'lowpass', dark ? 280 : 480);
    const lfo = audioCtx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.22 + Math.random() * 0.1;
    const lfoAmt = audioCtx.createGain(); lfoAmt.gain.value = dark ? 0.006 : 0.008;
    lfo.connect(lfoAmt); lfoAmt.connect(lapG.gain); lfo.start(); extra.oscs.push(lfo);
    loop(dark ? 2400 : 1500, 0.85, () => ambDrip(dark));
    if (dark) drone(30, 'sine', 0.05, 80); // deep ominous sub-drone (Dark Pools)
  } else if (theme.id === 2) {        // Pipe Dreams: metallic clanks
    loop(2500, 0.8, ambClank);
  } else if (theme.id === 13) {       // Freezer: HVAC rumble + pipe groans
    noiseDrone(0.03, 'lowpass', 90);
    drone(48, 'sawtooth', 0.018, 110);
    loop(7000, 0.6, ambGroan);
  } else if (theme.id === 10) {       // Hospital: air handling + monitor beeps
    noiseDrone(0.014, 'bandpass', 500, 0.7);
    loop(4500, 0.7, ambBeep);
  } else if (theme.id === 6) {        // Electrical Station: transformer hum + zaps
    drone(60, 'sawtooth', 0.02, 220);
    drone(120, 'sawtooth', 0.012, 420);
    loop(6000, 0.6, ambZap);
  } else if (theme.id === 0) {        // Lobby: classic fluorescent buzz + flicker crackle
    startHum(0.02, true);
    loop(5000, 0.5, ambCrackle);
  } else {                            // GENERIC quiet room-tone hum
    startHum(0.014, false);
  }
}

function updateAmbient(dt) {
  // Fluorescent flicker on the hum bed (lobby + generic floors only — humGain is
  // null on water/pipe/freezer/etc. beds, so this no-ops there).
  if (humGain) {
    humFlickerTimer -= dt;
    if (humFlickerTimer <= 0) {
      humFlickerTimer = 3 + Math.random() * 8;
      humGain.gain.setValueAtTime(humBaseGain * 0.12, audioCtx.currentTime);
      humGain.gain.linearRampToValueAtTime(humBaseGain, audioCtx.currentTime + 0.06 + Math.random() * 0.1);
    }
  }
}

/* ═══════════════════════════════════════════
   MOB VOCALIZATIONS — procedural creature sounds, the dread layer. The AI
   (main.js mobVocalLocal / hostMobVocal) computes gain+pan from the listener's
   camera and calls playMobVocal(type, kind, gain, pan); host events also
   broadcast so co-op players share them. kind: 'idle' (ambient creature noise),
   'aggro' (roam→hunt — the scary one), 'attack' (it just hit), 'roar' (chaser).
   CHEAP + CAPPED: at most a few concurrent voices (important events get a small
   reserve) so a whole wave never becomes a cacophony.
   ═══════════════════════════════════════════ */
let activeVocals = 0;
const MOB_VOCAL_CAP = 4;
function vocalSlot(dur, important) {
  const cap = important ? MOB_VOCAL_CAP + 2 : MOB_VOCAL_CAP;
  if (activeVocals >= cap) return false;
  activeVocals++;
  setTimeout(() => { activeVocals = Math.max(0, activeVocals - 1); }, dur * 1000 + 60);
  return true;
}
// shared synth primitives → write into a destination node (a StereoPanner).
function _vNoise(dest, t, dur, decay, ftype, freq, q, peak) {
  const sr = audioCtx.sampleRate, len = Math.max(1, Math.floor(sr * dur));
  const buf = audioCtx.createBuffer(1, len, sr), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sr * decay));
  const src = audioCtx.createBufferSource(); src.buffer = buf;
  const f = audioCtx.createBiquadFilter(); f.type = ftype; f.frequency.value = freq; if (q) f.Q.value = q;
  const g = audioCtx.createGain(); g.gain.setValueAtTime(Math.max(0.0001, peak), t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(dest); src.start(t); src.stop(t + dur + 0.02);
}
function _vTone(dest, t, dur, f0, f1, type, peak) {
  const o = audioCtx.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  const g = audioCtx.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), t + dur * 0.18); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.02);
}

function playMobVocal(type, kind, gain, pan) {
  if (!audioCtx) return;
  const important = (kind === 'aggro' || kind === 'attack' || kind === 'roar');
  const durs = {
    crawler: important ? 0.45 : 0.28, danger_crawler: important ? 0.45 : 0.28, spider: important ? 0.45 : 0.28,
    stalker: important ? 1.1 : 0.9, danger_stalker: important ? 1.1 : 0.9,
    phantom: important ? 0.55 : 0.7, partygoer: important ? 0.9 : 0.8, chaser: important ? 1.5 : 1.2
  };
  const dur = durs[type] || (important ? 0.6 : 0.5);
  if (!vocalSlot(dur, important)) return;
  const t = audioCtx.currentTime;
  const panner = audioCtx.createStereoPanner();
  panner.pan.value = Math.max(-1, Math.min(1, pan || 0));
  panner.connect(sfxGain);
  const G = Math.max(0.01, gain);

  switch (type) {
    case 'crawler': case 'danger_crawler': case 'spider': {
      // wet skittering: a flurry of short clicks; aggro/attack add a rising squeal
      const n = important ? 6 : 4;
      for (let i = 0; i < n; i++) _vNoise(panner, t + i * 0.04, 0.05, 0.004, 'highpass', 2600 + Math.random() * 1500, 0.7, G * (important ? 1.3 : 0.9));
      if (important) _vTone(panner, t, 0.4, 700, 1700, 'sawtooth', G * 0.7);
      break;
    }
    case 'stalker': case 'danger_stalker': {
      // low growl; aggro/attack = a sharper, louder snarl-roar
      _vTone(panner, t, dur, important ? 150 : 90, important ? 70 : 55, 'sawtooth', G * (important ? 1.1 : 0.6));
      _vNoise(panner, t, dur * 0.8, dur * 0.4, 'lowpass', important ? 700 : 400, 0, G * (important ? 0.5 : 0.25));
      if (important) _vTone(panner, t + 0.05, 0.5, 320, 120, 'square', G * 0.4);
      break;
    }
    case 'phantom': {
      // soft fluttering wingbeats / whisper; aggro = a sharp hiss
      if (important) { _vNoise(panner, t, 0.5, 0.12, 'bandpass', 2400, 3, G * 1.1); }
      else {
        const sr = audioCtx.sampleRate, len = Math.floor(sr * dur), buf = audioCtx.createBuffer(1, len, sr), d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) { const tt = i / sr; d[i] = (Math.random() * 2 - 1) * (0.5 + 0.5 * Math.sin(tt * 2 * Math.PI * 16)); }
        const s = audioCtx.createBufferSource(); s.buffer = buf;
        const f = audioCtx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1500; f.Q.value = 1.5;
        const g = audioCtx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(G * 0.6, t + 0.1); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        s.connect(f); f.connect(g); g.connect(panner); s.start(t); s.stop(t + dur + 0.02);
      }
      break;
    }
    case 'partygoer': {
      // unsettling descending giggle/murmur; aggro = manic, with a yell under it
      const n = important ? 6 : 4;
      for (let i = 0; i < n; i++) {
        const f = (important ? 560 : 440) - i * 32 + (Math.random() - 0.5) * 30;
        _vTone(panner, t + i * (important ? 0.07 : 0.11), important ? 0.08 : 0.1, f, f * 0.85, 'square', G * (important ? 0.9 : 0.5));
      }
      if (important) _vTone(panner, t + 0.1, 0.5, 300, 700, 'sawtooth', G * 0.6);
      break;
    }
    case 'chaser': {
      // RELENTLESS angry roar — big, harsh, low: the Hotel Chase signature
      _vTone(panner, t, dur, 130, 60, 'sawtooth', G * 1.2);
      _vTone(panner, t, dur * 0.9, 90, 45, 'square', G * 0.7);
      _vNoise(panner, t, dur * 0.7, dur * 0.5, 'lowpass', 900, 0, G * 0.6);
      _vTone(panner, t + 0.08, dur * 0.6, 380, 140, 'sawtooth', G * 0.5);
      break;
    }
    default:
      _vTone(panner, t, dur, 200, 90, 'sawtooth', G * 0.6);
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
let levelFunMusic = null; // { nodes:[osc...], boxId, stabId } while playing, else null

// REWORKED toward DREAD (was too "ping-ping"): the LOW DRONE now leads and is
// more present; the music box is occasional, an octave lower, soft-attacked and
// warped (no bright plink); long stretches of near-silence between notes; the
// party stabs are rarer and pushed far away with a reverb-ish delay tail.
function startLevelFunMusic() {
  if (!audioCtx || levelFunMusic) return; // no context, or already playing
  const out = ambientGain;                // ← routes through the Ambient bus / slider
  const nodes = [];                       // every long-lived oscillator, for teardown

  // ── 1. WARPED DRONE (now carries the dread — louder + a sub octave) ──
  const droneA = audioCtx.createOscillator();
  const droneB = audioCtx.createOscillator();
  const droneSub = audioCtx.createOscillator();                  // NEW low sub for weight
  droneA.type = 'sine';     droneA.frequency.value = 55;          // ~A1
  droneB.type = 'triangle'; droneB.frequency.value = 55 * 1.007;  // detuned → slow beat
  droneSub.type = 'sine';   droneSub.frequency.value = 27.5;      // ~A0 — felt more than heard
  const droneFilter = audioCtx.createBiquadFilter();
  droneFilter.type = 'lowpass'; droneFilter.frequency.value = 150;
  const droneGain = audioCtx.createGain(); droneGain.gain.value = 0.16; // up from 0.09 — drone leads
  const subGain = audioCtx.createGain(); subGain.gain.value = 0.10;
  // slow filter "breathing"
  const lfoFilter = audioCtx.createOscillator(); lfoFilter.frequency.value = 0.06;
  const lfoFilterAmt = audioCtx.createGain(); lfoFilterAmt.gain.value = 60;
  lfoFilter.connect(lfoFilterAmt); lfoFilterAmt.connect(droneFilter.frequency);
  // warped-record pitch warble on droneB
  const lfoPitch = audioCtx.createOscillator(); lfoPitch.frequency.value = 0.17;
  const lfoPitchAmt = audioCtx.createGain(); lfoPitchAmt.gain.value = 1.4;
  lfoPitch.connect(lfoPitchAmt); lfoPitchAmt.connect(droneB.frequency);
  droneA.connect(droneFilter); droneB.connect(droneFilter);
  droneFilter.connect(droneGain); droneGain.connect(out);
  droneSub.connect(subGain); subGain.connect(out);
  droneA.start(); droneB.start(); droneSub.start(); lfoFilter.start(); lfoPitch.start();
  nodes.push(droneA, droneB, droneSub, lfoFilter, lfoPitch);

  // ── 2. BROKEN MUSIC BOX — now SPARSE, LOW, SOFT, WARPED accents ──
  // Low A-minor notes (an octave below the old phrase). Played one at a time with
  // LONG near-silent gaps; the silence does the scaring. Soft attack (no plink),
  // dulled with a lowpass, always flat + wobbling like a damaged mechanism.
  const lowNotes = [220.00, 261.63, 293.66, 329.63, 349.23, 207.65, 246.94];
  const playNote = () => {
    const t = audioCtx.currentTime;
    let f = lowNotes[Math.floor(Math.random() * lowNotes.length)];
    const roll = Math.random();
    if (roll < 0.08) f *= Math.pow(2, 6 / 12);                       // tritone — really wrong
    else if (roll < 0.22) f *= Math.pow(2, (Math.random() < 0.5 ? -1 : 1) / 12); // semitone slip
    const detune = -14 - Math.random() * 30;                         // always FLAT, more wavering
    const o1 = audioCtx.createOscillator(); o1.type = 'triangle';
    const o2 = audioCtx.createOscillator(); o2.type = 'sine';        // soft body (no bright octave-up ping)
    o1.frequency.value = f;     o1.detune.value = detune;
    o2.frequency.value = f * 2; o2.detune.value = detune;
    // slow per-note pitch wobble → warped/wrong, not cheerful
    const wob = audioCtx.createOscillator(); wob.type = 'sine'; wob.frequency.value = 3 + Math.random() * 3;
    const wobAmt = audioCtx.createGain(); wobAmt.gain.value = 7;     // cents of wobble
    wob.connect(wobAmt); wobAmt.connect(o1.detune); wobAmt.connect(o2.detune);
    const lp = audioCtx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 850; // kill the "ping"
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.055, t + 0.06);            // SOFT attack (was 0.15 @ 5ms)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.0);           // long decay back into silence
    const g2 = audioCtx.createGain(); g2.gain.value = 0.22;
    o1.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g); g.connect(out);
    o1.start(t); o2.start(t); wob.start(t);
    o1.stop(t + 2.1); o2.stop(t + 2.1); wob.stop(t + 2.1);
  };
  const scheduleNote = () => {
    if (!levelFunMusic) return;
    levelFunMusic.boxId = setTimeout(() => {
      if (!levelFunMusic) return;
      playNote();
      // occasionally a slow 2-note phrase, otherwise a lone note — then silence
      if (Math.random() < 0.28) setTimeout(() => { if (levelFunMusic) playNote(); }, 750 + Math.random() * 550);
      scheduleNote();
    }, 3500 + Math.random() * 6500); // 3.5–10s of near-silence between notes
  };

  // ── 3. DISTANT PARTY — rarer, quieter, pushed far away with a reverb-ish delay ──
  // Shared "distance" send: a feedback delay so a stab smears into a cavern tail.
  const farDelay = audioCtx.createDelay(1.0); farDelay.delayTime.value = 0.26;
  const farFb = audioCtx.createGain(); farFb.gain.value = 0.5;
  const farWet = audioCtx.createGain(); farWet.gain.value = 0.6;
  farDelay.connect(farFb); farFb.connect(farDelay); farDelay.connect(farWet); farWet.connect(out);
  // A sad, bending party horn — quieter than before and mostly heard via the tail.
  const hornStab = () => {
    const t = audioCtx.currentTime;
    const o = audioCtx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(233, t);
    o.frequency.linearRampToValueAtTime(176, t + 0.7);
    const bp = audioCtx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 440; bp.Q.value = 1.2;
    const lp = audioCtx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 750; // duller / further
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.03, t + 0.14);   // quieter swell (was 0.05)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.85);
    o.connect(bp); bp.connect(lp); lp.connect(g); g.connect(out); lp.connect(farDelay); // dry + far tail
    o.start(t); o.stop(t + 0.9);
  };
  // Laughter-like stab — fainter descending blips, smeared by the same delay.
  const laughStab = () => {
    for (let i = 0; i < 5; i++) {
      const t = audioCtx.currentTime + i * 0.11;
      const o = audioCtx.createOscillator(); o.type = 'square';
      o.frequency.setValueAtTime(520 - i * 42, t);
      o.frequency.linearRampToValueAtTime(462 - i * 42, t + 0.07);
      const lp = audioCtx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
      const g = audioCtx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.016, t + 0.015); // quieter (was 0.028)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      o.connect(lp); lp.connect(g); g.connect(out); lp.connect(farDelay);
      o.start(t); o.stop(t + 0.1);
    }
  };
  const scheduleStab = () => {
    if (!levelFunMusic) return;
    levelFunMusic.stabId = setTimeout(() => {
      if (!levelFunMusic) return;
      (Math.random() < 0.5 ? hornStab : laughStab)();
      scheduleStab();
    }, 30000 + Math.random() * 40000); // every 30–70s — much rarer, never a rhythm
  };

  levelFunMusic = { nodes, boxId: null, stabId: null };
  scheduleNote(); // start in silence; first note arrives after the first gap
  scheduleStab();
}

function stopLevelFunMusic() {
  if (!levelFunMusic) return;
  if (levelFunMusic.boxId) clearTimeout(levelFunMusic.boxId);
  if (levelFunMusic.stabId) clearTimeout(levelFunMusic.stabId);
  for (const n of levelFunMusic.nodes) { try { n.stop(); } catch (e) {} }
  levelFunMusic = null;
}

/* ═══════════════════════════════════════════
   HOTEL CHASE AMBIENCE (chase archetype — floor 17)
   Procedural through ambientGain, three layers:
   1. LOW DREAD DRONE — a constant sub-saw under everything.
   2. BLARING EVACUATION ALARM — a two-tone beep looping forever (the "RUN" cue).
   3. FAINT ELEVATOR MUSIC — a cheesy major phrase whose gain is driven by
      updateChaseAudio(distToExit): near-silent down the corridor, swelling at the
      exit (the canon "elevator music near the way out" detail).
   Started/stopped by updateFloorMusic() like the Level Fun music. The alarm/elev
   note timers use Math.random for tiny humanisation — per-machine ambience, not
   world state, so the seeded-rng rule doesn't apply.
   ═══════════════════════════════════════════ */
let hotelChaseAudio = null; // { nodes, alarmId, elevId, elevGain, elevTarget } while playing

function startHotelChaseAmbience() {
  if (!audioCtx || hotelChaseAudio) return;
  const out = ambientGain;
  const nodes = [];

  // 1. Low dread drone.
  const drone = audioCtx.createOscillator(); drone.type = 'sawtooth'; drone.frequency.value = 41;
  const droneF = audioCtx.createBiquadFilter(); droneF.type = 'lowpass'; droneF.frequency.value = 130;
  const droneG = audioCtx.createGain(); droneG.gain.value = 0.05;
  drone.connect(droneF); droneF.connect(droneG); droneG.connect(out);
  drone.start();
  nodes.push(drone);

  // 2. Blaring two-tone alarm.
  const alarmOut = audioCtx.createGain(); alarmOut.gain.value = 0.055; alarmOut.connect(out);
  const beep = (freq, dur) => {
    const t = audioCtx.currentTime;
    const o = audioCtx.createOscillator(); o.type = 'square'; o.frequency.value = freq;
    const bp = audioCtx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = 3.5;
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(1, t + 0.03);
    g.gain.setValueAtTime(1, t + dur - 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(bp); bp.connect(g); g.connect(alarmOut);
    o.start(t); o.stop(t + dur + 0.02);
  };
  let alarmHigh = true;
  const scheduleAlarm = () => {
    if (!hotelChaseAudio) return;
    hotelChaseAudio.alarmId = setTimeout(() => {
      if (!hotelChaseAudio) return;
      beep(alarmHigh ? 740 : 560, 0.46);
      alarmHigh = !alarmHigh;
      scheduleAlarm();
    }, 600);
  };

  // 3. Faint elevator music — gain driven by updateChaseAudio (distance to exit).
  const elevGain = audioCtx.createGain(); elevGain.gain.value = 0.0; elevGain.connect(out);
  const elevNotes = [523.25, 659.25, 783.99, 659.25, 587.33, 698.46, 587.33, 493.88]; // C E G E D F D B
  let elevI = 0;
  const elevNote = () => {
    const t = audioCtx.currentTime;
    const f = elevNotes[elevI % elevNotes.length]; elevI++;
    const o = audioCtx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
    const o2 = audioCtx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 2;
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.46);
    const g2 = audioCtx.createGain(); g2.gain.value = 0.18;
    o.connect(g); o2.connect(g2); g2.connect(g); g.connect(elevGain);
    o.start(t); o2.start(t); o.stop(t + 0.5); o2.stop(t + 0.5);
  };
  const scheduleElev = () => {
    if (!hotelChaseAudio) return;
    hotelChaseAudio.elevId = setTimeout(() => {
      if (!hotelChaseAudio) return;
      if (hotelChaseAudio.elevTarget > 0.02) elevNote(); // only synth when audible (near the exit)
      scheduleElev();
    }, 360);
  };

  hotelChaseAudio = { nodes, alarmId: null, elevId: null, elevGain, elevTarget: 0 };
  scheduleAlarm();
  scheduleElev();
}

function stopHotelChaseAmbience() {
  if (!hotelChaseAudio) return;
  if (hotelChaseAudio.alarmId) clearTimeout(hotelChaseAudio.alarmId);
  if (hotelChaseAudio.elevId) clearTimeout(hotelChaseAudio.elevId);
  for (const n of hotelChaseAudio.nodes) { try { n.stop(); } catch (e) {} }
  hotelChaseAudio = null;
}

// Per-frame from animate(): fade the elevator music up as the player nears the
// exit. distToExit is in world units (or <0 / undefined → silent). No-op off the
// chase floor (hotelChaseAudio is null).
function updateChaseAudio(distToExit) {
  if (!hotelChaseAudio || !audioCtx) return;
  let target = 0;
  if (typeof distToExit === 'number' && distToExit >= 0) {
    target = Math.max(0, Math.min(1, 1 - distToExit / 16)) * 0.5; // audible within ~16m
  }
  hotelChaseAudio.elevTarget = target;
  hotelChaseAudio.elevGain.gain.setTargetAtTime(target, audioCtx.currentTime, 0.3);
}

/* ═══════════════════════════════════════════
   REAL MUSIC FILES (assets/audio/*.ogg|.mp3)
   DELIBERATE exception to the procedural-only rule (like the boss GLB/PNG assets —
   see PROJECT_GUIDE §3.4). A floor opts in with `theme.musicFile` (a path, or an
   array of fallback paths tried in order, e.g. .ogg then .mp3). The file is STREAMED
   via an HTMLAudioElement wired into the Web Audio graph through ambientGain, so the
   Master + Ambient volume sliders control it exactly like the procedural music, and
   it loops. LOAD WEIGHT: streamed lazily ON FLOOR ENTRY — it does NOT gate the
   startup loading screen (unlike the GLB mob models), and only the floors that use a
   file pay for it. Keep files modest (see assets/audio/README.md).
   GRACEFUL FALLBACK: if every candidate path is missing / fails / stalls, onFail()
   runs (the caller starts that floor's procedural track) — it NEVER crashes or
   leaves the floor silent when a file is absent.
   ═══════════════════════════════════════════ */
let fileMusic = null;       // { audio, srcNode, path } while a file track plays
let fileMusicToken = 0;     // bumps on every floor change → in-flight loads abort

function startFileMusic(paths, onFail) {
  if (!audioCtx) { if (onFail) onFail(); return; }
  const candidates = Array.isArray(paths) ? paths.slice() : [paths];
  const token = ++fileMusicToken; // a later floor change (stopFileMusic) invalidates this load

  const tryNext = () => {
    if (token !== fileMusicToken) return;                 // floor changed mid-load → abort silently
    if (!candidates.length) { if (onFail) onFail(); return; } // all paths failed → procedural fallback
    const path = candidates.shift();
    const audio = new Audio();
    audio.loop = true;
    audio.preload = 'auto';
    let settled = false;
    const cleanup = () => {
      audio.removeEventListener('canplay', onReady);
      audio.removeEventListener('error', onErr);
      clearTimeout(timer);
    };
    const onReady = () => {
      if (settled || token !== fileMusicToken) { if (token !== fileMusicToken) { try { audio.pause(); } catch (e) {} } return; }
      settled = true; cleanup();
      // Route the element through the Ambient bus (volume sliders apply, like procedural).
      let srcNode;
      try { srcNode = audioCtx.createMediaElementSource(audio); }
      catch (e) { console.warn('[music] graph wire failed for', path, e); tryNext(); return; }
      srcNode.connect(ambientGain);
      audio.play().catch(e => console.warn('[music] autoplay blocked (will play on next gesture):', e));
      fileMusic = { audio, srcNode, path };
      console.log('[music] file track:', path);
    };
    const onErr = () => {
      if (settled) return;
      settled = true; cleanup();
      console.warn('[music] missing/failed, falling back:', path);
      tryNext(); // try the next candidate; if none remain, onFail() (procedural)
    };
    const timer = setTimeout(onErr, 8000); // stalled fetch → treat as a miss
    audio.addEventListener('canplay', onReady);
    audio.addEventListener('error', onErr);
    audio.src = path;
    audio.load();
  };
  tryNext();
}

function stopFileMusic() {
  fileMusicToken++; // abort any load still in flight
  if (!fileMusic) return;
  try { fileMusic.audio.pause(); } catch (e) {}
  try { fileMusic.srcNode.disconnect(); } catch (e) {}
  fileMusic.audio.src = ''; // release the stream; the MediaElementSource GCs with the element
  fileMusic = null;
}

// The procedural music starter for the CURRENT floor (null = floor has no music).
// Used both as the default track and as the file-load fallback.
function proceduralMusicStarterFor() {
  const theme = getTheme(currentFloor);
  if (theme.id === 5) return startLevelFunMusic;          // Level Fun
  if (theme.archetype === 'chase') return startHotelChaseAmbience; // Hotel Chase alarm/elevator bed
  return null;
}

// Called on every floor entry (from buildMazeScene). Stops all music, then starts
// the right track: a real file (theme.musicFile) if one is configured — falling
// back to the floor's procedural track if the file is missing — else procedural.
function updateFloorMusic() {
  if (!audioCtx) return;
  stopFileMusic();
  stopLevelFunMusic();
  stopHotelChaseAmbience();

  const theme = getTheme(currentFloor);
  const startProcedural = proceduralMusicStarterFor();
  if (theme.musicFile) {
    startFileMusic(theme.musicFile, () => { if (startProcedural) startProcedural(); });
  } else if (startProcedural) {
    startProcedural();
  }
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
