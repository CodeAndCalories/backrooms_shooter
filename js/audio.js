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

function startAmbient() {
  if (!audioCtx) return;
  if (humNode) { humNode.stop(); humNode = null; }
  if (poolNode) { clearInterval(poolNode); poolNode = null; }
  if (pipeNode) { clearInterval(pipeNode); pipeNode = null; }

  const theme = getTheme(currentFloor);
  
  if (theme.id === 3) {
    // Poolrooms: Water drops
    poolNode = setInterval(() => {
      playSound(() => {
        const t = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800 + Math.random() * 400, t);
        osc.frequency.exponentialRampToValueAtTime(1200 + Math.random() * 200, t + 0.1);
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
    }, 1500);
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
   LEVEL FUN MUSIC (floor 5 only)
   A slow, detuned, off-key music-box melody over a low detuned drone — a creepy
   birthday-party loop. Everything routes through ambientGain so the Ambient volume
   slider controls it. Started/stopped by updateFloorMusic() on every floor change.
   ═══════════════════════════════════════════ */
let levelFunMusic = null; // { droneA, droneB, seqTimer } while playing, else null

function startLevelFunMusic() {
  if (!audioCtx || levelFunMusic) return; // no context, or already playing
  const out = ambientGain;                // ← routes through the Ambient bus / slider

  // Low drone: two slightly-detuned oscillators through a lowpass. The detune makes them
  // beat slowly against each other for an uneasy, wavering floor under the melody.
  const droneA = audioCtx.createOscillator();
  const droneB = audioCtx.createOscillator();
  droneA.type = 'sine';     droneA.frequency.value = 55;          // ~A1
  droneB.type = 'triangle'; droneB.frequency.value = 55 * 1.006;  // detuned → slow beat
  const droneFilter = audioCtx.createBiquadFilter();
  droneFilter.type = 'lowpass'; droneFilter.frequency.value = 200;
  const droneGain = audioCtx.createGain(); droneGain.gain.value = 0.10;
  droneA.connect(droneFilter); droneB.connect(droneFilter);
  droneFilter.connect(droneGain); droneGain.connect(out);
  droneA.start(); droneB.start();

  // Off-key music-box motif (Hz). 0 = a rest. Deliberately uneasy little tune.
  const melody = [659.25, 622.25, 523.25, 466.16, 523.25, 622.25, 587.33, 0, 440.0, 523.25, 493.88, 0];
  const noteEvery = 520; // ms between notes — slow, like a winding-down box
  let step = 0;

  const playNote = (freq) => {
    if (!freq) return;                       // rest
    const t = audioCtx.currentTime;
    const detune = -12 - Math.random() * 28; // cents — always a touch FLAT, and wavering
    const o1 = audioCtx.createOscillator(); o1.type = 'triangle'; // music-box-ish body
    const o2 = audioCtx.createOscillator(); o2.type = 'sine';     // octave-up shimmer
    o1.frequency.value = freq;     o1.detune.value = detune;
    o2.frequency.value = freq * 2; o2.detune.value = detune;
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.005); // fast pluck attack
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9); // bell-like decay
    const g2 = audioCtx.createGain(); g2.gain.value = 0.4; // shimmer quieter than fundamental
    o1.connect(g); o2.connect(g2); g2.connect(g); g.connect(out);
    o1.start(t); o2.start(t);
    o1.stop(t + 1.0); o2.stop(t + 1.0);
  };

  const seqTimer = setInterval(() => { playNote(melody[step % melody.length]); step++; }, noteEvery);
  playNote(melody[0]); step = 1; // first note now, so there's no silent gap before the loop

  levelFunMusic = { droneA, droneB, seqTimer };
}

function stopLevelFunMusic() {
  if (!levelFunMusic) return;
  clearInterval(levelFunMusic.seqTimer);
  try { levelFunMusic.droneA.stop(); } catch (e) {}
  try { levelFunMusic.droneB.stop(); } catch (e) {}
  levelFunMusic = null;
}

// Called on every floor entry (from buildMazeScene): play the Level Fun loop on floor 5,
// stop it everywhere else. Theme-keyed (id 5), so it also works on later loops.
function updateFloorMusic() {
  if (!audioCtx) return;
  if (getTheme(currentFloor).id === 5) startLevelFunMusic();
  else stopLevelFunMusic();
}
