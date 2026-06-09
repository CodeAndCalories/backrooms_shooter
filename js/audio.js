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

function playGunshot() {
  playSound(() => {
    const t = audioCtx.currentTime;
    const sr = audioCtx.sampleRate;

    // 1. CRACK — sharp high-frequency transient. A very short noise burst pushed
    //    through a highpass, with a near-instant attack and a fast (~25ms) decay.
    //    This is what makes it read as a "crack" instead of a "thump".
    const crackLen = sr * 0.05;
    const crackBuf = audioCtx.createBuffer(1, crackLen, sr);
    const crackData = crackBuf.getChannelData(0);
    for (let i = 0; i < crackLen; i++) {
      crackData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sr * 0.008)); // ~8ms decay
    }
    const crack = audioCtx.createBufferSource();
    crack.buffer = crackBuf;
    const crackHP = audioCtx.createBiquadFilter();
    crackHP.type = 'highpass';
    crackHP.frequency.value = 3000;          // keep only the bright top end
    const crackPeak = audioCtx.createBiquadFilter();
    crackPeak.type = 'peaking';              // emphasize the snap band
    crackPeak.frequency.value = 5000;
    crackPeak.Q.value = 0.8;
    crackPeak.gain.value = 8;
    const crackGain = audioCtx.createGain();
    crackGain.gain.setValueAtTime(3.0, t);   // loud, instant
    crackGain.gain.exponentialRampToValueAtTime(0.01, t + 0.03);
    crack.connect(crackHP); crackHP.connect(crackPeak); crackPeak.connect(crackGain);
    crackGain.connect(sfxGain);
    crack.start(t);

    // 2. BODY — a bit of midrange punch so it has weight behind the crack.
    //    Shorter and snappier than before (decays by ~90ms instead of ~250ms).
    const bodyLen = sr * 0.12;
    const bodyBuf = audioCtx.createBuffer(1, bodyLen, sr);
    const bodyData = bodyBuf.getChannelData(0);
    for (let i = 0; i < bodyLen; i++) {
      bodyData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sr * 0.025));
    }
    const body = audioCtx.createBufferSource();
    body.buffer = bodyBuf;
    const bodyLP = audioCtx.createBiquadFilter();
    bodyLP.type = 'lowpass';
    bodyLP.frequency.setValueAtTime(6000, t);
    bodyLP.frequency.exponentialRampToValueAtTime(400, t + 0.08); // quick darkening
    const bodyGain = audioCtx.createGain();
    bodyGain.gain.setValueAtTime(1.6, t);
    bodyGain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
    body.connect(bodyLP); bodyLP.connect(bodyGain); bodyGain.connect(sfxGain);
    body.start(t);

    // 3. LOW-END — keep a touch of sub for chest-thump, but short so it doesn't
    //    smear the transient into a soft "whump".
    const osc = audioCtx.createOscillator();
    const oscGain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.06);
    oscGain.gain.setValueAtTime(0.7, t);     // lower than before — supports, not dominates
    oscGain.gain.exponentialRampToValueAtTime(0.01, t + 0.06);
    osc.connect(oscGain); oscGain.connect(sfxGain);
    osc.start(t); osc.stop(t + 0.07);
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
