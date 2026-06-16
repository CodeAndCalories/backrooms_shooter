// Real-music-file loader verifier. Audio PLAYBACK is browser-only, but the
// loader's GRACEFUL-FALLBACK logic (the "missing file must not crash / must fall
// back to procedural" requirement) is deterministic — so this extracts the REAL
// startFileMusic / stopFileMusic out of js/audio.js and drives every branch with
// a fake Audio element + fake Web Audio graph:
//   - a present file → wired through ambientGain + played, no fallback;
//   - a missing/erroring file → onFail() (procedural fallback), no crash;
//   - [.ogg, .mp3] candidates → tries the next when the first fails;
//   - all candidates fail → onFail();
//   - a stalled fetch (the 8s timeout) → onFail();
//   - a floor change mid-load (stopFileMusic) → the late 'canplay' is ignored;
//   - stopFileMusic on an active track pauses + disconnects it.
// Plus wiring checks: updateFloorMusic routes musicFile→file with a procedural
// fallback, and theme 17 (Hotel Chase) points at assets/audio/ (which exists).
// Usage: node tools/test_music.js

const fs = require('fs');
const path = require('path');
const audioSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'audio.js'), 'utf8');
const mainSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'main.js'), 'utf8');

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

// Fresh sandbox per scenario: the REAL loader fns over fakes. setTimeout/clearTimeout
// are LOCAL (recorded, never real) so the 8s stall timer can be fired on demand and
// can't keep Node's event loop alive.
function makeApi() {
  return new Function(`
    let audioCtx = {
      _mes: 0,
      createMediaElementSource(el) { audioCtx._mes++; const node = { connect(t) { node._to = t; }, disconnect() { node._disc = true; } }; return node; }
    };
    let ambientGain = { _isAmbientBus: true };
    let fileMusic = null;
    let fileMusicToken = 0;
    const created = [];
    const timers = [];
    function setTimeout(fn) { timers.push(fn); return timers.length - 1; }
    function clearTimeout(id) { if (id != null) timers[id] = null; }
    const console = { warn() {}, log() {}, error() {} };
    class Audio {
      constructor() { this._l = {}; this.loop = false; this.preload = ''; this._src = ''; this.played = false; this.paused = false; created.push(this); }
      addEventListener(t, fn) { (this._l[t] = this._l[t] || []).push(fn); }
      removeEventListener(t, fn) { if (this._l[t]) this._l[t] = this._l[t].filter(f => f !== fn); }
      set src(v) { this._src = v; } get src() { return this._src; }
      load() {}
      play() { this.played = true; return Promise.resolve(); }
      pause() { this.paused = true; }
      fire(t) { (this._l[t] || []).slice().forEach(fn => fn()); }
    }
    ${extractFn(audioSrc, 'function startFileMusic')}
    ${extractFn(audioSrc, 'function stopFileMusic')}
    return {
      startFileMusic, stopFileMusic, created, timers, ambientGain, audioCtx,
      getFileMusic: () => fileMusic
    };
  `)();
}

/* ── 1. present file → wired + played ── */
console.log('1. present file');
{
  const a = makeApi();
  let failed = 0;
  a.startFileMusic('assets/audio/x.ogg', () => failed++);
  a.created[0].fire('canplay');
  const fm = a.getFileMusic();
  if (!fm) fail('no fileMusic after a successful load'); else ok('fileMusic set on success');
  if (failed) fail('onFail ran despite a successful load'); else ok('procedural fallback NOT triggered');
  if (a.audioCtx._mes !== 1) fail('createMediaElementSource not called once'); else ok('element wired into the graph');
  if (!fm || fm.srcNode._to !== a.ambientGain) fail('source not connected to ambientGain'); else ok('routed through ambientGain (volume sliders apply)');
  if (!fm || !fm.audio.played) fail('audio.play() not called'); else ok('playback started');
  if (!a.created[0].loop) fail('loop not enabled'); else ok('loops');
}

/* ── 2. missing file → graceful fallback, no crash ── */
console.log('2. missing file → procedural fallback');
{
  const a = makeApi();
  let failed = 0;
  a.startFileMusic('assets/audio/missing.ogg', () => failed++);
  a.created[0].fire('error');
  if (failed !== 1) fail('onFail (procedural) not called on a missing file'); else ok('missing file → onFail() once');
  if (a.getFileMusic()) fail('fileMusic set despite the file being missing'); else ok('no file track left active');
}

/* ── 3. [.ogg, .mp3] candidates: ogg fails → mp3 wins ── */
console.log('3. candidate fallback (.ogg → .mp3)');
{
  const a = makeApi();
  let failed = 0;
  a.startFileMusic(['assets/audio/x.ogg', 'assets/audio/x.mp3'], () => failed++);
  a.created[0].fire('error');         // ogg missing
  if (a.created.length !== 2) fail('did not try the .mp3 candidate'); else ok('falls through to the next candidate');
  a.created[1].fire('canplay');       // mp3 ok
  const fm = a.getFileMusic();
  if (!fm || fm.path !== 'assets/audio/x.mp3') fail('mp3 candidate not adopted'); else ok('.mp3 fallback adopted');
  if (failed) fail('onFail ran even though a candidate succeeded'); else ok('no procedural fallback when a candidate works');
}

/* ── 4. all candidates fail → onFail ── */
console.log('4. all candidates fail');
{
  const a = makeApi();
  let failed = 0;
  a.startFileMusic(['a.ogg', 'a.mp3'], () => failed++);
  a.created[0].fire('error');
  a.created[1].fire('error');
  if (failed !== 1) fail('onFail not called after all candidates failed'); else ok('all-fail → onFail() once (procedural)');
}

/* ── 5. stalled fetch → timeout → onFail ── */
console.log('5. stalled fetch (8s timeout)');
{
  const a = makeApi();
  let failed = 0;
  a.startFileMusic('a.ogg', () => failed++);
  if (!a.timers.length || typeof a.timers[0] !== 'function') fail('no stall timeout registered'); else ok('stall timeout armed');
  a.timers[0]();   // simulate the 8s stall firing
  if (failed !== 1) fail('stall did not fall back to procedural'); else ok('stall → onFail() (procedural)');
}

/* ── 6. floor change mid-load → late canplay ignored ── */
console.log('6. floor change aborts an in-flight load');
{
  const a = makeApi();
  let failed = 0;
  a.startFileMusic('a.ogg', () => failed++);
  a.stopFileMusic();              // a new floor began before the file was ready
  a.created[0].fire('canplay');  // late readiness for the abandoned floor
  if (a.getFileMusic()) fail('stale load started playing after a floor change'); else ok('stale load ignored (token guard)');
  if (a.created[0].played) fail('abandoned element started playing'); else ok('abandoned element never plays');
}

/* ── 7. stopFileMusic tears an active track down ── */
console.log('7. stopFileMusic cleanup');
{
  const a = makeApi();
  a.startFileMusic('a.ogg', () => {});
  a.created[0].fire('canplay');
  const fm = a.getFileMusic();
  a.stopFileMusic();
  if (a.getFileMusic()) fail('fileMusic not cleared on stop'); else ok('fileMusic cleared');
  if (!fm.audio.paused) fail('audio not paused on stop'); else ok('element paused');
  if (!fm.srcNode._disc) fail('source node not disconnected on stop'); else ok('source disconnected');
}

/* ── 8. wiring: updateFloorMusic + theme 17 + folder ── */
console.log('8. wiring');
{
  if (!/function stopFileMusic\(/.test(audioSrc) || !/function startFileMusic\(/.test(audioSrc)) fail('loader fns missing from audio.js'); else ok('startFileMusic/stopFileMusic present');
  // updateFloorMusic must prefer a file and fall back to procedural
  const ufm = extractFn(audioSrc, 'function updateFloorMusic');
  if (!/startFileMusic\(theme\.musicFile/.test(ufm)) fail('updateFloorMusic does not use theme.musicFile'); else ok('updateFloorMusic uses theme.musicFile');
  if (!/startProcedural/.test(ufm)) fail('updateFloorMusic lacks a procedural fallback'); else ok('procedural fallback wired into updateFloorMusic');
  // theme 17 (Hotel Chase) points at assets/audio/
  if (!/musicFile:\s*\[[^\]]*assets\/audio\/hotel_chase/.test(mainSrc)) fail('theme 17 musicFile not pointing at assets/audio/hotel_chase'); else ok('Hotel Chase wired to assets/audio/hotel_chase.{ogg,mp3}');
  // the drop folder exists in the repo (so Vercel serves it)
  if (!fs.existsSync(path.join(__dirname, '..', 'assets', 'audio', 'README.md'))) fail('assets/audio/ folder (README) missing'); else ok('assets/audio/ exists in the repo');
}

console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL MUSIC-FILE LOADER CHECKS PASSED');
process.exit(fails ? 1 : 0);
