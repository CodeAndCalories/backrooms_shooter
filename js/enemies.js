"use strict";

/* BACKROOMS FPS — ENEMY & BOSS SYSTEM */

/* ═══════════════════════════════════════════
   PROCEDURAL SPRITES (Canvas)
   ═══════════════════════════════════════════ */
const spriteTextures = {};

function createTextureFromCanvas(drawFn, width = 256, height = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  drawFn(ctx, width, height);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

function initSpriteTextures() {
  // Smiler (Phantom)
  spriteTextures['phantom'] = createTextureFromCanvas((ctx, w, h) => {
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.fillRect(0, 0, w, h);
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 15;
    ctx.fillStyle = '#ffffff';
    // Eyes
    ctx.beginPath(); ctx.ellipse(w*0.35, h*0.3, w*0.08, h*0.05, Math.PI*0.1, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(w*0.65, h*0.3, w*0.08, h*0.05, -Math.PI*0.1, 0, Math.PI*2); ctx.fill();
    // Smile
    ctx.beginPath();
    ctx.moveTo(w*0.2, h*0.6);
    ctx.quadraticCurveTo(w*0.5, h*0.9, w*0.8, h*0.6);
    ctx.quadraticCurveTo(w*0.5, h*0.7, w*0.2, h*0.6);
    ctx.fill();
  });

  // Wiremonster (Crawler / Danger Crawler)
  const drawWiremonster = (ctx, w, h, isDanger) => {
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.fillRect(0, 0, w, h);
    
    ctx.strokeStyle = isDanger ? '#220000' : '#111111';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    
    // Messy wire body (Lifeform / Bacteria)
    for (let i = 0; i < 30; i++) {
      ctx.beginPath();
      const startX = w*0.4 + Math.random()*w*0.2;
      const startY = h*0.1 + Math.random()*h*0.3;
      const endX = w*0.3 + Math.random()*w*0.4;
      const endY = h*0.6 + Math.random()*h*0.4;
      
      ctx.moveTo(startX, startY);
      ctx.bezierCurveTo(
        Math.random()*w, startY + Math.random()*h*0.2,
        Math.random()*w, endY - Math.random()*h*0.2,
        endX, endY
      );
      ctx.stroke();
    }
    
    ctx.fillStyle = isDanger ? '#ff2222' : '#000000';
    ctx.shadowColor = isDanger ? '#ff0000' : '#000000';
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.arc(w*0.5, h*0.15, w*0.1, 0, Math.PI*2);
    ctx.fill();
    
    ctx.fillStyle = isDanger ? '#ffffff' : '#ff4444';
    for(let i=0; i< (isDanger ? 3 : 1); i++) {
      ctx.beginPath();
      ctx.arc(w*0.45 + Math.random()*w*0.1, h*0.12 + Math.random()*h*0.05, 3, 0, Math.PI*2);
      ctx.fill();
    }
  };
  spriteTextures['crawler'] = createTextureFromCanvas((ctx, w, h) => drawWiremonster(ctx, w, h, false));
  spriteTextures['danger_crawler'] = createTextureFromCanvas((ctx, w, h) => drawWiremonster(ctx, w, h, true));

  // Faceling / Hound (Stalker)
  const drawStalker = (ctx, w, h, isDanger) => {
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.fillRect(0, 0, w, h);
    ctx.shadowColor = '#000000';
    ctx.shadowBlur = 5;
    
    ctx.fillStyle = isDanger ? '#aa5555' : '#c8b6a6';
    
    ctx.beginPath();
    ctx.ellipse(w*0.5, h*0.7, w*0.3, h*0.2, 0, 0, Math.PI*2);
    ctx.fill();
    
    ctx.beginPath();
    ctx.moveTo(w*0.35, h*0.7); ctx.lineTo(w*0.2, h*0.95);
    ctx.moveTo(w*0.65, h*0.7); ctx.lineTo(w*0.8, h*0.95);
    ctx.strokeStyle = isDanger ? '#aa5555' : '#c8b6a6';
    ctx.lineWidth = w*0.1;
    ctx.lineCap = 'round';
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(w*0.4, h*0.8); ctx.lineTo(w*0.4, h*0.95);
    ctx.moveTo(w*0.6, h*0.8); ctx.lineTo(w*0.6, h*0.95);
    ctx.lineWidth = w*0.12;
    ctx.stroke();

    ctx.beginPath(); 
    ctx.arc(w*0.5, h*0.5, w*0.15, 0, Math.PI*2); 
    ctx.fill();
    
    ctx.fillStyle = '#111111';
    ctx.beginPath();
    ctx.arc(w*0.5, h*0.45, w*0.16, Math.PI, 0);
    ctx.fill();
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 3;
    for (let i = 0; i < 15; i++) {
      ctx.beginPath();
      ctx.moveTo(w*0.35 + i*(w*0.3/14), h*0.45);
      ctx.lineTo(w*0.35 + i*(w*0.3/14) + (Math.random()-0.5)*w*0.05, h*0.65 + Math.random()*h*0.1);
      ctx.stroke();
    }
  };
  spriteTextures['stalker'] = createTextureFromCanvas((ctx, w, h) => drawStalker(ctx, w, h, false));
  spriteTextures['danger_stalker'] = createTextureFromCanvas((ctx, w, h) => drawStalker(ctx, w, h, true));

  // Bosses
  spriteTextures['boss_warden'] = createTextureFromCanvas((ctx, w, h) => {
    ctx.fillStyle = '#220000'; ctx.fillRect(w*0.2, h*0.2, w*0.6, h*0.8);
    ctx.fillStyle = '#110000'; ctx.beginPath(); ctx.arc(w*0.5, h*0.2, w*0.3, 0, Math.PI*2); ctx.fill();
    ctx.shadowColor = '#ff0000'; ctx.shadowBlur = 20; ctx.fillStyle = '#ff4444';
    ctx.fillRect(w*0.4, h*0.15, w*0.2, h*0.05); // visor
  }, 512, 512);

  spriteTextures['boss_amalgam'] = createTextureFromCanvas((ctx, w, h) => {
    for(let i=0; i<30; i++) {
      ctx.fillStyle = `hsl(${Math.random()*40}, 50%, ${Math.random()*20+10}%)`;
      ctx.beginPath(); ctx.arc(w*0.5+(Math.random()-0.5)*w*0.6, h*0.6+(Math.random()-0.5)*h*0.4, Math.random()*w*0.2, 0, Math.PI*2); ctx.fill();
    }
    ctx.shadowColor = '#ffaa00'; ctx.shadowBlur = 15; ctx.fillStyle = '#ffffff';
    for(let i=0; i<8; i++) {
      ctx.beginPath(); ctx.arc(w*0.3+Math.random()*w*0.4, h*0.3+Math.random()*h*0.5, 6, 0, Math.PI*2); ctx.fill();
    }
  }, 512, 512);

  spriteTextures['boss_hive'] = createTextureFromCanvas((ctx, w, h) => {
    ctx.fillStyle = '#1a0522'; ctx.beginPath(); ctx.arc(w*0.5, h*0.5, w*0.45, 0, Math.PI*2); ctx.fill();
    ctx.shadowColor = '#ff00ff'; ctx.shadowBlur = 25; ctx.strokeStyle = '#aa00aa'; ctx.lineWidth = 5;
    for(let i=0; i<5; i++) { ctx.beginPath(); ctx.arc(w*0.5, h*0.5, w*0.08*(i+1), 0, Math.PI*2); ctx.stroke(); }
  }, 512, 512);
}

// Swap the 3 procedural boss placeholders for custom PNG art. Call at startup AFTER
// initSpriteTextures() so the procedural texture stays cached as a graceful fallback:
// if a PNG 404s or fails to decode we simply keep the placeholder. Loaded textures
// overwrite spriteTextures under the SAME keys, so spawnBoss picks them up via
// theme.bossTex with no other change. Async: a boss spawning before its PNG finishes
// just uses the placeholder (boss floors are 1.5-2s after entry, long after init).
function loadBossSprites() {
  const loader = new THREE.TextureLoader();
  const files = {
    boss_warden:  'sprites/warden.png',
    boss_amalgam: 'sprites/amalgam.png',
    boss_hive:    'sprites/hivemind.png'
  };
  Object.keys(files).forEach(key => {
    loader.load(
      files[key],
      tex => {
        tex.encoding = THREE.sRGBEncoding;   // colors match renderer.outputEncoding (sRGB), not washed out
        tex.magFilter = THREE.LinearFilter;  // smooth scaling of the detailed art
        tex.minFilter = THREE.LinearFilter;  // no mipmaps → avoids non-power-of-two warnings
        tex.generateMipmaps = false;
        spriteTextures[key] = tex;           // replace the procedural placeholder
        console.log('[sprites] boss texture loaded', key, files[key]);
      },
      undefined,
      err => { console.warn('[sprites] FAILED', files[key], '— keeping procedural placeholder.', err); }
    );
  });
}

/* ═══════════════════════════════════════════
   MOB TYPES (UPDATED SCALING)
   ═══════════════════════════════════════════ */
const MOB_TYPES = {
  stalker:        { speed: 2.0, health: 130, damage: 10, color: 0x332222, scale: 1.8,  height: 3.6, attackRange: 1.8, attackCooldown: 1.4, name: 'Stalker' },
  crawler:        { speed: 4.5, health: 50,  damage: 7,  color: 0x443333, scale: 0.65, height: 0.85, attackRange: 1.5, attackCooldown: 0.7, name: 'Crawler' },
  phantom:        { speed: 3.0, health: 75,  damage: 13, color: 0x222244, scale: 0.9,  height: 1.7,  attackRange: 2.0, attackCooldown: 1.1, name: 'Phantom', erratic: true },
  danger_stalker: { speed: 3.5, health: 160, damage: 14, color: 0x551111, scale: 2.0,  height: 4.0,  attackRange: 2.0, attackCooldown: 1.0, name: 'Danger Stalker' },
  danger_crawler: { speed: 6.0, health: 70,  damage: 10, color: 0x553322, scale: 1.1,  height: 1.6,  attackRange: 1.6, attackCooldown: 0.5, name: 'Danger Crawler' },
  // Aranea spider — medium speed, moderate HP, straightforward melee. Sits between the
  // tanky stalker and the fast/fragile crawler.
  spider:         { speed: 3.5, health: 90,  damage: 11, color: 0x2a2a22, scale: 1.0,  height: 1.4,  attackRange: 1.6, attackCooldown: 1.0, name: 'Spider' },
  // Partygoer — the signature mob of Level Fun. Human-sized, unhurried, moderately tanky
  // melee (it shambles toward you and hits hard up close).
  partygoer:      { speed: 2.8, health: 110, damage: 12, color: 0x884466, scale: 1.0,  height: 1.8,  attackRange: 1.7, attackCooldown: 1.2, name: 'Partygoer' }
};

/* ═══════════════════════════════════════════
   MOB VISUALS — swappable seam
   buildMobModel() is the ONLY place mob bodies
   are defined. A model-loader can later replace
   the internals of a case without touching AI,
   spawning, stats, hit-flash or death code.
   ═══════════════════════════════════════════ */
// Visual-only height multiplier for the wire figure. Its armature is built
// ~2.5m tall (head clump ends at y=2.5), so a scale of 1.0 renders it at full
// intended height. This is DELIBERATELY decoupled from the crawler's mt.scale
// (0.65 / 1.1), which was tuned for the old small sprite and only governs
// gameplay stats/hitbox — NOT the rendered model height.
const WIRE_VISUAL_SCALE = 1.0;

/* ═══════════════════════════════════════════
   REAL 3D MODEL PIPELINE (GLTF) — first test on TWO mob slots
   Models are PRELOADED once at startup into modelCache, then each spawn CLONES
   the cached scene (geometry stays shared; materials are cloned per-instance so
   hit-flash / death-fade don't leak across mobs). If a model isn't loaded yet or
   failed, buildMobModel falls back to the existing placeholder/sprite.
   ═══════════════════════════════════════════ */
const MODEL_DEFS = {
  // crawler family → tall "bacteria" mob; stalker family → humanoid skinstealer.
  // faceOffset: added to the atan2 facing angle so the model's FRONT (not back)
  // points at the player. Most GLB mobs face -Z by default → Math.PI. Flip to 0
  // (or tweak) per-model if a model turns out to already face +Z.
  crawler:        { url: 'models/bacteria_-_kane_pixels_backrooms.glb', height: 2.6, faceOffset: Math.PI },
  danger_crawler: { url: 'models/bacteria_-_kane_pixels_backrooms.glb', height: 2.6, faceOffset: Math.PI },
  // skinstealer faceOffset is 0 (was Math.PI): the optimization pass stripped its
  // skinning, and the un-skinned mesh renders 180° from how the SkinnedMesh did
  // (node-chain rotations apply where joint matrices used to override them).
  stalker:        { url: 'models/escape_the_backrooms_skinstealer.glb', height: 2.2, faceOffset: 0 },
  danger_stalker: { url: 'models/escape_the_backrooms_skinstealer.glb', height: 2.2, faceOffset: 0 },
  // phantom → floating death-moths. `float` (m) = hover height of the model's CENTER;
  // its presence also tells instanceMobModel to center the model vertically (not plant
  // feet at y=0) so it bobs in the air rather than standing on the floor.
  phantom:        { url: 'models/death_moths_backrooms.glb', height: 1.6, faceOffset: Math.PI, float: 1.5 },
  // spider → rigged aranea. Grounded (feet at y=0), auto-scaled to ~1.4m, faces player.
  spider:         { url: 'models/backrooms_aranea_membri_rigged_blender_3.01.glb', height: 1.4, faceOffset: Math.PI },
  // partygoer → human-sized. Grounded, auto-scaled to ~1.8m. faceOffset 0: this model
  // already faces +Z, so no 180° flip (Math.PI would turn its back to the player).
  partygoer:      { url: 'models/partygoer_from_backrooms.glb', height: 1.8, faceOffset: 0 }
};
const modelCache = {}; // url -> { scene, rigged } on success, or null on failure

// Preload every unique GLB ONCE (call during init/loading). main.js keeps the
// loading screen up until onComplete fires, so mobs can no longer spawn as
// fallbacks just because the network was slow — the one localhost-vs-deployed
// gameplay difference. onProgress(0..1) drives the loading bar: byte-accurate
// per file when the server sends a length (Vercel does), file-count otherwise.
// onComplete ALWAYS fires, success or failure: a 404/parse error falls back to
// placeholder visuals per-model, it never blocks the game from starting.
function preloadMobModels(onProgress, onComplete) {
  const done = () => { if (onComplete) onComplete(); };
  if (typeof THREE.GLTFLoader === 'undefined') {
    console.warn('[models] GLTFLoader not present — mobs will use placeholders.');
    done();
    return;
  }
  const loader = new THREE.GLTFLoader();
  const urls = Array.from(new Set(Object.values(MODEL_DEFS).map(d => d.url)));
  let remaining = urls.length;
  const fileProgress = {}; // url -> 0..1
  const report = () => {
    if (!onProgress) return;
    let sum = 0;
    for (const u of urls) sum += fileProgress[u] || 0;
    onProgress(sum / urls.length);
  };
  const settle = url => {
    fileProgress[url] = 1;
    report();
    if (--remaining === 0) done();
  };
  urls.forEach(url => {
    loader.load(
      url,
      gltf => {
        let rigged = false;
        gltf.scene.traverse(o => { if (o.isSkinnedMesh) rigged = true; });
        modelCache[url] = { scene: gltf.scene, rigged };
        console.log('[models] loaded', url, rigged ? '(rigged)' : '(static)');
        settle(url);
      },
      xhr => {
        // download progress only; parse time after the last byte is negligible.
        // Cap below 1 so a file only reads "done" once it has actually settled.
        if (xhr.total > 0) { fileProgress[url] = Math.min(0.99, xhr.loaded / xhr.total); report(); }
      },
      err => { modelCache[url] = null; console.warn('[models] FAILED', url, '— using placeholder.', err); settle(url); }
    );
  });
}

// Build a ready-to-place instance of a cached model, or null if unavailable.
// Returns an outer Group whose base scale stays (1,1,1) so the existing isGroup
// death-squash (scale.y = WIRE_VISUAL_SCALE * squashY) keeps working; the inner
// object carries the auto-computed scale + grounding offset.
function instanceMobModel(type) {
  const def = MODEL_DEFS[type];
  if (!def) return null;
  const entry = modelCache[def.url];
  if (!entry) return null; // not loaded yet, or load failed → caller falls back

  // Clone: SkeletonUtils for rigged meshes (preserves skinning), else plain clone.
  const inner = (entry.rigged && THREE.SkeletonUtils)
    ? THREE.SkeletonUtils.clone(entry.scene)
    : entry.scene.clone(true);

  // Per-instance materials so setMobFlash/death-fade affect only this mob.
  // NOTE: Material.clone() reference-copies .map and clones .color, so the clone
  // preserves textures — it is NOT what makes the bacteria render white. That
  // model's materials simply ship without a usable texture map, so they fall back
  // to the default white base color. For the bacteria (crawler family) ONLY, force
  // any map-less material dark so it matches the intended near-black look. Other
  // models (skinstealer) and sprites are untouched.
  const isBacteria = (type === 'crawler' || type === 'danger_crawler');
  inner.traverse(o => {
    if (o.isMesh && o.material) {
      o.material = Array.isArray(o.material) ? o.material.map(m => m.clone()) : o.material.clone();
      if (isBacteria) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach(m => { if (!m.map && m.color) m.color.setHex(0x0a0a0a); });
      }
    }
  });

  // Auto-scale to the intended height: measure native bounding box, then
  // scale = targetHeight / measuredHeight (uniform, preserves proportions).
  inner.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(inner);
  const size = new THREE.Vector3(); box.getSize(size);
  const s = size.y > 0.0001 ? def.height / size.y : 1;
  inner.scale.setScalar(s);

  // Re-measure at final scale, then center horizontally (x/z). Vertically: float models
  // are centered on the group origin (so they hover), grounded models drop feet to y=0.
  inner.updateMatrixWorld(true);
  const box2 = new THREE.Box3().setFromObject(inner);
  inner.position.x -= (box2.min.x + box2.max.x) / 2;
  inner.position.z -= (box2.min.z + box2.max.z) / 2;
  if (def.float !== undefined) {
    inner.position.y -= (box2.min.y + box2.max.y) / 2; // center → hovers around group origin
  } else {
    inner.position.y -= box2.min.y;                    // feet planted at y=0
  }

  const outer = new THREE.Group();
  outer.add(inner);
  // Mark as a real loaded model (vs. the wire-figure fallback, which is also a Group)
  // so updateEnemies knows to face it at the player. faceOffset corrects models whose
  // default orientation shows their back when rotation.y points at the player.
  outer.userData.isModel = true;
  outer.userData.faceOffset = (def.faceOffset !== undefined) ? def.faceOffset : Math.PI;
  // float (if set) = hover height for updateEnemies; absence means grounded.
  if (def.float !== undefined) outer.userData.float = def.float;
  return outer;
}

function buildMobModel(type, scale) {
  // SLOT 1 — bacteria model for the crawler family (placeholder fallback).
  if (type === 'crawler' || type === 'danger_crawler') {
    return instanceMobModel(type) || buildWiremonster(WIRE_VISUAL_SCALE);
  }
  // SLOT 2 — skinstealer model for the stalker family (sprite fallback).
  if (type === 'stalker' || type === 'danger_stalker') {
    return instanceMobModel(type) || buildSpriteMob(type, scale);
  }
  // SLOT 3 — floating death-moths for the phantom (sprite fallback).
  if (type === 'phantom') {
    return instanceMobModel(type) || buildSpriteMob(type, scale);
  }
  // SLOT 4 — rigged aranea for the spider. No spider sprite exists, so fall back to the
  // procedural wire figure (a grounded isGroup placeholder) if the GLB fails to load.
  if (type === 'spider') {
    return instanceMobModel(type) || buildWiremonster(WIRE_VISUAL_SCALE);
  }
  // SLOT 5 — partygoer model (Level Fun). Wire-figure fallback (no partygoer sprite).
  if (type === 'partygoer') {
    return instanceMobModel(type) || buildWiremonster(WIRE_VISUAL_SCALE);
  }
  // Everything else unchanged: original sprite.
  return buildSpriteMob(type, scale);
}

// Original sprite mob — unchanged behavior, extracted so it can serve as both the
// default path and the stalker fallback.
function buildSpriteMob(type, scale) {
  const tex = spriteTextures[type];
  const mat = new THREE.SpriteMaterial({ map: tex, color: 0xffffff, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(scale * 2.5, scale * 2.5, 1);

  // NO per-mob PointLight (was a faint red "eyeLight"). SpriteMaterial is unlit,
  // so the mob itself renders full-bright with or without it — the light only
  // tinted nearby walls. The real cost: every spawn/death changed the scene's
  // LIGHT COUNT, and three.js compiles a new shader variant per light count
  // (a visible hitch) while every extra light adds per-fragment cost scene-wide.
  return sprite;
}

// TEMPORARY cheap placeholder for the wire figure — a simple tall humanoid that
// reads as "tall figure looming over the player" in just a handful of draw calls.
// All body parts SHARE one dark material (6 body meshes + 1 glowing eye = 7 meshes
// total) instead of the old 80-tube / 80-material build. This is a stand-in until
// real 3D models are loaded through the same buildMobModel() seam; keep the name,
// the ~2.5m height, feet-at-y=0, and the userData.core ref so the existing
// hit-flash and death/fade code keep working unchanged.
function buildWiremonster(scale) {
  const group = new THREE.Group();

  // ONE shared material for every body part — a few draw calls, not 80.
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.6, metalness: 0.3 });

  // Tapered torso (wider at the hips, narrow at the shoulders): y 0.90 -> 2.05
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.24, 1.15, 8), bodyMat);
  torso.position.y = 1.475;
  group.add(torso);

  // Two thin legs: y 0.00 -> 0.95
  const legGeo = new THREE.CylinderGeometry(0.07, 0.06, 0.95, 6);
  const legL = new THREE.Mesh(legGeo, bodyMat); legL.position.set(-0.13, 0.475, 0); group.add(legL);
  const legR = new THREE.Mesh(legGeo, bodyMat); legR.position.set( 0.13, 0.475, 0); group.add(legR);

  // Two thin arms hanging at the sides: y ~1.07 -> 1.93
  const armGeo = new THREE.CylinderGeometry(0.05, 0.045, 0.85, 6);
  const armL = new THREE.Mesh(armGeo, bodyMat); armL.position.set(-0.30, 1.50, 0); group.add(armL);
  const armR = new THREE.Mesh(armGeo, bodyMat); armR.position.set( 0.30, 1.50, 0); group.add(armR);

  // Sphere head: top ~2.45m → towers over the 1.6m player
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.20, 10, 8), bodyMat);
  head.position.y = 2.25;
  group.add(head);

  // Glowing red core "eye" on the head. MeshBasicMaterial ignores lighting, so it
  // reads as a glow on its own — NO PointLight behind it anymore (the old coreLight
  // changed the scene's light count on every spawn/death → shader-recompile hitch
  // plus scene-wide per-fragment cost). Hit-flash now whitens the core's color
  // (see setMobFlash) instead of pulsing the removed light.
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xff4040 })
  );
  core.position.set(0, 2.28, 0.17);
  group.add(core);

  group.userData.core = core;

  group.scale.setScalar(scale);
  return group;
}

// Hit-flash that works for both Group (3D) and Sprite (default) mobs
function setMobFlash(enemy, on) {
  const mesh = enemy.mesh;
  if (mesh.isGroup) {
    mesh.traverse(o => {
      if (o.material && o.material.emissive) {
        o.material.emissive.setHex(on ? 0xff0000 : 0x000000);
      }
    });
    // Wire-figure core: flash the unlit eye white (replaces the old coreLight
    // intensity pulse — the light itself is gone, see buildWiremonster).
    if (mesh.userData.core) {
      mesh.userData.core.material.color.setHex(on ? 0xffffff : 0xff4040);
    }
  } else {
    // sprite mobs: tint the sprite material (SpriteMaterial has no emissive)
    mesh.material.color.setHex(on ? 0xff0000 : 0xffffff);
  }
}

/* ═══════════════════════════════════════════
   SPAWN ENEMY
   ═══════════════════════════════════════════ */
function spawnEnemy(type, forcePos) {
  const mt = MOB_TYPES[type];
  if (!mt) return;
  const gh = mazeGrid.length, gw = mazeGrid[0].length;
  const theme = getTheme(currentFloor);

  let bestDist = 0, bestX = 0, bestZ = 0;

  if (forcePos) {
    bestX = forcePos.x;
    bestZ = forcePos.z;
    bestDist = 10;
  } else {
    for (let attempts = 0; attempts < 60; attempts++) {
      const ry = 1 + Math.floor(Math.random() * (gh - 2));
      const rx = 1 + Math.floor(Math.random() * (gw - 2));
      if (mazeGrid[ry][rx] === 1) {
        const wx = rx * CELL + CELL / 2, wz = ry * CELL + CELL / 2;
        const d = Math.sqrt((wx - player.pos.x) ** 2 + (wz - player.pos.z) ** 2);
        if (d > CELL * 4 && d > bestDist) { bestDist = d; bestX = wx; bestZ = wz; }
      }
    }
  }
  if (bestDist === 0) return;

  // Visuals come from the swappable seam; enemy.scale === mt.scale
  const mesh = buildMobModel(type, mt.scale);

  const spriteH = mt.scale * 2.5;
  // Grounded 3D mobs (wire figure) are built feet-at-y=0; sprite mobs stay center-anchored.
  mesh.position.set(bestX, mesh.isGroup ? 0 : spriteH / 2, bestZ);
  scene.add(mesh);

  const scaleMult = 1 + (currentFloor % LEVEL_THEMES.length) * 0.05;
  const enemy = {
    type, mesh,
    height: mt.height,
    scale: mt.scale,
    hp: mt.health * (1 + currentFloor * 0.12) * scaleMult,
    maxHp: mt.health * (1 + currentFloor * 0.12) * scaleMult,
    speed: mt.speed * (1 + currentFloor * 0.06),
    damage: mt.damage * (1 + currentFloor * 0.08),
    attackRange: mt.attackRange,
    attackCooldown: mt.attackCooldown,
    erratic: mt.erratic || false,
    pos: new THREE.Vector3(bestX, spriteH / 2, bestZ),
    attackTimer: mt.attackCooldown,
    erraticTimer: 0,
    erraticDir: new THREE.Vector3(),
    alive: true,
    deathTimer: 0,
    stunTimer: 0,
    hitFlashTimer: 0
  };
  enemies.push(enemy);
}

/* ═══════════════════════════════════════════
   BOSS SYSTEM
   ═══════════════════════════════════════════ */
function spawnBoss() {
  const theme = getTheme(currentFloor);
  if (!theme.isBoss) return;

  const gh = mazeGrid.length, gw = mazeGrid[0].length;
  const bx = Math.floor(gw / 2) * CELL + CELL / 2;
  const bz = Math.floor(gh / 2) * CELL + CELL / 2;

  const sc = theme.bossScale;
  const bh = 2.0 * sc;
  const bw = 0.6 * sc, bd = 0.5 * sc;

  // Texture is tied to the boss FLOOR's theme (theme.bossTex), not raw currentFloor,
  // so each boss always shows its own art on every loop. Fallback to warden if unset.
  const texName = theme.bossTex || 'boss_warden';

  const tex = spriteTextures[texName];
  // transparent + alphaTest: discard near-transparent pixels so the PNG's edges are
  // clean — no rectangle/halo around the boss. depthWrite:false keeps sprite sorting.
  const mat = new THREE.SpriteMaterial({ map: tex, color: 0xffffff, transparent: true, alphaTest: 0.1, depthWrite: false });
  const mesh = new THREE.Sprite(mat);

  // Quad height = bh (the boss's intended body height, 2.0*scale), centered at
  // bh/2 → feet at y=0, head at y=bh. The old sc*4.0 made the quad TWICE the
  // body height, sinking half of it below the floor (only the legs showed).
  // The full height fits because buildMazeScene raises boss-arena ceilings.
  mesh.scale.set(bh, bh, 1);
  mesh.position.set(bx, bh / 2, bz);
  scene.add(mesh);

  // Brighten the persistent boss-light slot (created at intensity 0 by
  // buildMazeScene on every floor). Reusing an existing light instead of adding
  // one keeps the scene's point-light count fixed — adding a light here used to
  // change the shader cache key and recompile every material mid-floor.
  // updateBoss tracks the boss position each frame; death parks the slot again.
  bossLight.intensity = 0.6;
  bossLight.position.set(bx, bh / 2, bz);

  const totalHp = theme.bossHp * (1 + Math.floor(currentFloor / LEVEL_THEMES.length) * 0.3);

  bossEntity = {
    mesh,
    name: theme.bossName, // used by dev label overlay
    pos: new THREE.Vector3(bx, bh / 2, bz),
    height: bh,
    scale: sc,
    hp: totalHp,
    maxHp: totalHp,
    speed: theme.bossSpeed,
    damage: theme.bossDamage,
    attackRange: 3.0 * sc,
    attackCooldown: 2.0,
    attackTimer: 2.0,
    throwCooldown: 4.0,
    throwTimer: 3.0,
    spawnCooldown: 12.0,
    spawnTimer: 8.0,
    spawnCount: theme.bossSpawnCount,
    alive: true,
    deathTimer: 0,
    stunTimer: 0,
    hitFlashTimer: 0,
    phaseThresholds: [0.7, 0.4, 0.15],
    currentPhase: 0
  };

  // Show boss HP bar
  document.getElementById('bossHpContainer').style.opacity = '1';
  document.getElementById('bossHpName').textContent = theme.bossName;

  playBossRoar();
}

function updateBoss(dt) {
  if (!bossEntity || !bossEntity.alive) return;
  const b = bossEntity;

  if (b.stunTimer > 0) { b.stunTimer -= dt; }

  // Hit flash recovery
  if (b.hitFlashTimer > 0) {
    b.hitFlashTimer -= dt;
    if (b.hitFlashTimer <= 0) {
      b.mesh.material.color.setHex(0xffffff);
    }
  }

  const dx = player.pos.x - b.pos.x;
  const dz = player.pos.z - b.pos.z;
  const dist = Math.sqrt(dx * dx + dz * dz);

  // Phase check — gets faster and more aggressive at lower HP
  const hpPct = b.hp / b.maxHp;
  let phase = 0;
  for (let i = 0; i < b.phaseThresholds.length; i++) {
    if (hpPct < b.phaseThresholds[i]) phase = i + 1;
  }
  if (phase > b.currentPhase) {
    b.currentPhase = phase;
    playBossRoar();
    // Spawn adds on phase change
    const types = ['stalker', 'crawler', 'phantom'];
    for (let i = 0; i < 1 + phase; i++) {
      setTimeout(() => {
        if (gameState === 'playing' && bossEntity && bossEntity.alive) {
          spawnEnemy(types[i % types.length]);
        }
      }, i * 500);
    }
  }

  const phaseMult = 1 + phase * 0.25;

  // Movement
  if (b.stunTimer <= 0 && dist > b.attackRange * 0.8) {
    let moveX = dx / dist, moveZ = dz / dist;
    const spd = b.speed * phaseMult * dt;
    const eRad = 0.8 * b.scale;
    let newX = b.pos.x + moveX * spd;
    let newZ = b.pos.z + moveZ * spd;
    let blocked = false;
    for (const w of mazeWalls) {
      if (newX + eRad > w.minX && newX - eRad < w.maxX && newZ + eRad > w.minZ && newZ - eRad < w.maxZ) { blocked = true; break; }
    }
    if (!blocked) { b.pos.x = newX; b.pos.z = newZ; }
  }

  b.mesh.position.set(b.pos.x, b.height / 2, b.pos.z);
  b.mesh.rotation.y = Math.atan2(dx, dz);
  // The boss glow is a persistent scene-level slot (not a child of the mesh, so
  // removing the mesh on death can't change the light count) — follow the boss.
  if (bossLight) bossLight.position.set(b.pos.x, b.height / 2, b.pos.z);

  // Melee attack
  if (dist < b.attackRange) {
    b.attackTimer -= dt;
    if (b.attackTimer <= 0) {
      b.attackTimer = b.attackCooldown / phaseMult;
      damagePlayer(b.damage * phaseMult, b.pos);
    }
  }

  // Throw projectile
  b.throwTimer -= dt;
  if (b.throwTimer <= 0 && dist > b.attackRange) {
    b.throwTimer = b.throwCooldown / phaseMult;
    throwBossProjectile(b);
  }

  // Spawn minions periodically
  b.spawnTimer -= dt;
  if (b.spawnTimer <= 0) {
    b.spawnTimer = b.spawnCooldown / phaseMult;
    const types = ['crawler', 'stalker'];
    for (let i = 0; i < b.spawnCount; i++) {
      setTimeout(() => {
        if (gameState === 'playing' && bossEntity && bossEntity.alive) {
          spawnEnemy(types[i % types.length]);
        }
      }, i * 400);
    }
  }

  // Update boss HP bar
  document.getElementById('bossHpFill').style.width = (b.hp / b.maxHp * 100) + '%';
}

function throwBossProjectile(boss) {
  playProjectileThrow();
  const dx = player.pos.x - boss.pos.x;
  const dz = player.pos.z - boss.pos.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist < 0.1) return;

  const projGeo = new THREE.SphereGeometry(0.25, 8, 8);
  const projMat = new THREE.MeshStandardMaterial({
    color: 0xff4400, emissive: 0xff2200, emissiveIntensity: 2.0,
    roughness: 0.3
  });
  const projMesh = new THREE.Mesh(projGeo, projMat);
  projMesh.position.set(boss.pos.x, 1.5, boss.pos.z);
  scene.add(projMesh);

  // Grab a free slot from the persistent projectile-light pool (intensity 0 =
  // free; created by buildMazeScene on every floor). If every slot is lit the
  // projectile flies unlit (its emissive material still glows) — better than
  // adding a new light, which would change the scene's point-light count and
  // recompile every shader mid-fight. updateBossProjectiles tracks position
  // and releases the slot when the projectile dies.
  const projLight = bossProjLights.find(l => l.intensity === 0) || null;
  if (projLight) {
    projLight.intensity = 0.5;
    projLight.position.copy(projMesh.position);
  }

  const speed = 12 + boss.currentPhase * 3;
  bossProjectiles.push({
    mesh: projMesh,
    light: projLight,
    vel: new THREE.Vector3(dx / dist * speed, 0, dz / dist * speed),
    pos: projMesh.position.clone(),
    life: 5,
    damage: boss.damage * 0.7
  });
}

function updateBossProjectiles(dt) {
  for (let i = bossProjectiles.length - 1; i >= 0; i--) {
    const p = bossProjectiles[i];
    p.life -= dt;
    p.pos.add(p.vel.clone().multiplyScalar(dt));
    p.mesh.position.copy(p.pos);
    if (p.light) p.light.position.copy(p.pos); // pooled slot, not a mesh child
    p.mesh.rotation.x += dt * 8;
    p.mesh.rotation.z += dt * 6;

    // Hit player
    const dx = p.pos.x - player.pos.x;
    const dz = p.pos.z - player.pos.z;
    const dy = p.pos.y - player.pos.y;
    if (Math.sqrt(dx * dx + dz * dz + dy * dy) < 1.0) {
      damagePlayer(p.damage, p.pos);
      p.mesh.geometry.dispose(); p.mesh.material.dispose(); // per-projectile resources
      scene.remove(p.mesh);
      if (p.light) { p.light.intensity = 0; p.light.position.set(0, -100, 0); } // free the pooled slot
      bossProjectiles.splice(i, 1);
      continue;
    }

    // Hit wall or expired
    let hitWall = false;
    for (const w of mazeWalls) {
      if (p.pos.x > w.minX && p.pos.x < w.maxX && p.pos.z > w.minZ && p.pos.z < w.maxZ) { hitWall = true; break; }
    }

    if (p.life <= 0 || hitWall) {
      p.mesh.geometry.dispose(); p.mesh.material.dispose(); // per-projectile resources
      scene.remove(p.mesh);
      if (p.light) { p.light.intensity = 0; p.light.position.set(0, -100, 0); } // free the pooled slot
      bossProjectiles.splice(i, 1);
    }
  }
}

function damageBoss(amount) {
  if (!bossEntity || !bossEntity.alive) return;
  bossEntity.hp -= amount;
  bossEntity.stunTimer = 0.08;
  bossEntity.hitFlashTimer = 0.12;

  // Hit flash red
  bossEntity.mesh.material.color.setHex(0xff0000);

  if (bossEntity.hp <= 0) {
    bossEntity.alive = false;
    bossEntity.deathTimer = 0;
    playBossRoar();

    // Park the persistent boss-light slot (never remove it — fixed light count).
    if (bossLight) { bossLight.intensity = 0; bossLight.position.set(0, -100, 0); }

    // Boss death animation
    const b = bossEntity;
    const deathAnim = () => {
      b.deathTimer += 0.016;
      b.mesh.material.opacity = Math.max(0, 1 - b.deathTimer * 1.5);
      b.mesh.material.transparent = true;
      // quad scale.y is in world meters (b.height tall when alive) — collapse
      // from FULL height, not from 1 (which would snap a 6-8m boss to 1m)
      const squash = Math.max(0.01, 1 - b.deathTimer * 2);
      b.mesh.scale.y = b.height * squash;
      b.mesh.position.y = b.height / 2 * squash;
      if (b.deathTimer < 1.0) {
        requestAnimationFrame(deathAnim);
      } else {
        disposeMobVisual(b.mesh); // per-instance sprite material; shared boss texture untouched
        scene.remove(b.mesh);
        document.getElementById('bossHpContainer').style.opacity = '0';
        // Create exit after boss dies
        createBossExit();
      }
    };
    deathAnim();

    player.kills++;
    playerMoney += BOSS_KILL_REWARD;
    playEnemyDeath();
  }

  updateHUD();
}

function createBossExit() {
  const gh = mazeGrid.length, gw = mazeGrid[0].length;
  const ex = Math.floor(gw / 2), ey = gh - 2;
  exitZone = { x: ex * CELL + CELL / 2, z: ey * CELL + CELL / 2, radius: CELL * 1.5 };

  const exitColor = 0x44ff88;
  const exitGeo = new THREE.CylinderGeometry(1.5, 1.5, 0.06, 20);
  const exitMat = new THREE.MeshStandardMaterial({ color: exitColor, emissive: exitColor, emissiveIntensity: 0.8, transparent: true, opacity: 0.6 });
  exitMesh = new THREE.Mesh(exitGeo, exitMat);
  exitMesh.position.set(exitZone.x, 0.06, exitZone.z);
  scene.add(exitMesh);

  // Brighten the persistent exit-light slot buildMazeScene parked at intensity 0
  // on this boss floor — reusing it keeps the scene's point-light count fixed.
  exitLight.intensity = 1.2;
  exitLight.distance = CELL * 6;
  exitLight.position.set(exitZone.x, 2, exitZone.z);

  const beaconGeo = new THREE.CylinderGeometry(0.08, 0.08, WALL_H, 8);
  const beaconMat = new THREE.MeshStandardMaterial({ color: exitColor, emissive: exitColor, emissiveIntensity: 0.6, transparent: true, opacity: 0.4 });
  const beacon = new THREE.Mesh(beaconGeo, beaconMat);
  beacon.position.set(exitZone.x, WALL_H / 2, exitZone.z);
  scene.add(beacon);
}

/* ═══════════════════════════════════════════
   WAVE AND LINGER SYSTEM
   ═══════════════════════════════════════════ */
function spawnWave() {
  const theme = getTheme(currentFloor);
  if (theme.isBoss) return; // Boss levels don't have waves

  const count = Math.min(3 + currentFloor + currentWave, 15);
  waveMobsLeft = count;
  // Spider joins the wave rotation only from floor index 8 onward (the in-game "LEVEL 9"+),
  // so it's a later-game threat. Lower SPIDER_MIN_FLOOR to make it appear earlier.
  const SPIDER_MIN_FLOOR = 8;
  // Level Fun (theme id 5, incl. looped repeats): the party is EXCLUSIVELY
  // partygoers — no stalkers/crawlers/phantoms crash it.
  const types = getTheme(currentFloor).id === 5
    ? ['partygoer']
    : currentFloor >= SPIDER_MIN_FLOOR
      ? ['stalker', 'crawler', 'phantom', 'spider']
      : ['stalker', 'crawler', 'phantom'];
  for (let i = 0; i < count; i++) {
    const t = types[i % types.length];
    setTimeout(() => {
      if (gameState === 'playing') spawnEnemy(t);
    }, i * 600 + Math.random() * 400);
  }
}

// Anti-linger: spawn from behind player. On Level Fun the escalation mobs are
// ALSO partygoers (the floor's only mob — more guests keep arriving); the
// escalating spawn RATE still provides the linger pressure. Everywhere else:
// danger variants as before.
function spawnDangerMob() {
  const types = getTheme(currentFloor).id === 5
    ? ['partygoer']
    : ['danger_stalker', 'danger_crawler'];

  const behindAngle = player.yaw + Math.PI + (Math.random() - 0.5) * 1.0;
  const spawnDist = CELL * 5 + Math.random() * CELL * 3;
  const sx = player.pos.x + Math.sin(behindAngle) * spawnDist;
  const sz = player.pos.z + Math.cos(behindAngle) * spawnDist;

  // Find nearest valid cell
  const gh = mazeGrid.length, gw = mazeGrid[0].length;
  const cx = Math.floor(sx / CELL), cy = Math.floor(sz / CELL);
  if (cx >= 0 && cx < gw && cy >= 0 && cy < gh && mazeGrid[cy][cx] === 1) {
    spawnEnemy(types[Math.floor(Math.random() * types.length)], { x: sx, z: sz });
  } else {
    // Fallback: spawn normally
    spawnEnemy(types[Math.floor(Math.random() * types.length)]);
  }
}

function updateAntiLinger(dt) {
  const theme = getTheme(currentFloor);
  if (theme.isBoss) return; // Boss levels don't use linger

  floorTimer += dt;

  if (floorTimer > LINGER_SAFE_TIME) {
    dangerLevel = Math.min(LINGER_MAX_DANGER, (floorTimer - LINGER_SAFE_TIME) / 30);
    dangerSpawnTimer -= dt;

    const spawnInterval = LINGER_SPAWN_BASE - (LINGER_SPAWN_BASE - LINGER_SPAWN_MIN) * (dangerLevel / LINGER_MAX_DANGER);
    if (dangerSpawnTimer <= 0) {
      dangerSpawnTimer = spawnInterval;
      spawnDangerMob();
    }
  }

  // Update danger HUD
  const dangerPct = dangerLevel / LINGER_MAX_DANGER;
  if (dangerPct > 0.01) {
    document.getElementById('hudDanger').style.color = `rgba(255,${Math.floor(80 - dangerPct * 60)},${Math.floor(40 - dangerPct * 40)},${0.4 + dangerPct * 0.6})`;
    document.getElementById('dangerBarContainer').style.opacity = '1';
    document.getElementById('dangerBarFill').style.width = (dangerPct * 100) + '%';
  } else {
    document.getElementById('dangerBarContainer').style.opacity = '0';
    document.getElementById('hudDanger').style.color = 'rgba(255,80,40,0)';
  }
}

/* ═══════════════════════════════════════════
   ENEMY AI / UPDATE
   ═══════════════════════════════════════════ */
function updateEnemies(dt) {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];

    if (!e.alive) {
      removeDebugLabel(e); // DEV: dead mobs drop their type label
      e.deathTimer += dt;
      const fade = Math.max(0, 1 - e.deathTimer * 2.5);
      const squashY = Math.max(0.01, 1 - e.deathTimer * 3);
      if (e.mesh.isGroup) {
        // 3D mob: fade every child material, squash relative to base uniform scale
        e.mesh.traverse(o => {
          if (o.material) { o.material.transparent = true; o.material.opacity = fade; }
        });
        // Squash relative to the wire figure's VISUAL base scale (not gameplay e.scale).
        e.mesh.scale.y = WIRE_VISUAL_SCALE * squashY;
        e.mesh.position.y = 0; // feet planted; figure collapses down into the floor
      } else {
        // sprite mob: original behavior
        e.mesh.material.opacity = fade;
        e.mesh.material.transparent = true;
        e.mesh.scale.y = squashY;
        e.mesh.position.y = (e.scale * 2.5) / 2 * squashY;
      }
      if (e.deathTimer > 0.7) {
        disposeMobVisual(e.mesh); // free per-instance materials (+ wire geometry); shared GLB/sprite resources untouched
        scene.remove(e.mesh);
        enemies.splice(i, 1);
      }
      continue;
    }

    // Hit flash recovery
    if (e.hitFlashTimer > 0) {
      e.hitFlashTimer -= dt;
      if (e.hitFlashTimer <= 0) {
        setMobFlash(e, false);
      }
    }

    if (e.stunTimer > 0) { e.stunTimer -= dt; continue; }

    const dx = player.pos.x - e.pos.x;
    const dz = player.pos.z - e.pos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    let moveX = 0, moveZ = 0;
    if (dist > 0.3) { moveX = dx / dist; moveZ = dz / dist; }

    if (e.erratic) {
      e.erraticTimer -= dt;
      if (e.erraticTimer <= 0) {
        e.erraticTimer = 0.4 + Math.random() * 1.2;
        e.erraticDir.set((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2).normalize();
      }
      moveX = moveX * 0.55 + e.erraticDir.x * 0.45;
      moveZ = moveZ * 0.55 + e.erraticDir.z * 0.45;
      const m = Math.sqrt(moveX * moveX + moveZ * moveZ);
      if (m > 0) { moveX /= m; moveZ /= m; }
    }

    const spd = e.speed * dt;
    const eRad = 0.3;
    let newX = e.pos.x + moveX * spd;
    let newZ = e.pos.z + moveZ * spd;
    let blocked = false;
    for (const w of mazeWalls) {
      if (newX + eRad > w.minX && newX - eRad < w.maxX && newZ + eRad > w.minZ && newZ - eRad < w.maxZ) { blocked = true; break; }
    }
    if (!blocked) {
      e.pos.x = newX; e.pos.z = newZ;
    } else {
      let canX = true;
      for (const w of mazeWalls) {
        if (newX + eRad > w.minX && newX - eRad < w.maxX && e.pos.z + eRad > w.minZ && e.pos.z - eRad < w.maxZ) { canX = false; break; }
      }
      if (canX) e.pos.x = newX;

      let canZ = true;
      for (const w of mazeWalls) {
        if (e.pos.x + eRad > w.minX && e.pos.x - eRad < w.maxX && newZ + eRad > w.minZ && newZ - eRad < w.maxZ) { canZ = false; break; }
      }
      if (canZ) e.pos.z = newZ;
    }

    let yPos = (e.scale * 2.5) / 2;
    if (e.type === 'phantom') {
      yPos += Math.sin(Date.now() * 0.003 + e.pos.x) * 0.4;
    }
    e.mesh.position.set(e.pos.x, yPos, e.pos.z);
    if (e.mesh.isGroup) {
      if (e.mesh.userData.float !== undefined) {
        // floating model (phantom moths): hover at chest/head height with a slow,
        // gentle vertical bob — never plant feet on the floor.
        e.mesh.position.y = e.mesh.userData.float + Math.sin(clock.getElapsedTime() * 2 + e.pos.x) * 0.18;
      } else {
        // grounded mob: bob around floor level so feet stay near y=0
        e.mesh.position.y = 0.05 + Math.sin(clock.getElapsedTime() * 14) * 0.05;
      }
      // Loaded 3D models: face the player. Y-axis only (no tilt), so the bob above is
      // preserved. dx/dz are player − mob (lines above); faceOffset (default Math.PI)
      // corrects models that default to facing away. Sprites auto-face the camera, so
      // they're skipped (isModel is only set on real loaded models).
      if (e.mesh.userData.isModel) {
        e.mesh.rotation.y = Math.atan2(dx, dz) + (e.mesh.userData.faceOffset || 0);
      }
    }

    // DEV: floating type label above the mob's head (toggled with L).
    // Created lazily so there's no cost unless the overlay is on.
    if (window.debugLabels) {
      if (!e.debugLabel) { e.debugLabel = makeDebugLabel(e.type); scene.add(e.debugLabel); }
      // 3D group mobs render ~2.5m tall → sit the label at ~2.7m;
      // sprite mobs sit just above their sprite top (e.scale * 2.5).
      const labelY = e.mesh.isGroup ? 2.7 : (e.scale * 2.5) + 0.3;
      e.debugLabel.position.set(e.pos.x, labelY, e.pos.z);
    }

    if (dist < e.attackRange) {
      e.attackTimer -= dt;
      if (e.attackTimer <= 0) {
        e.attackTimer = e.attackCooldown;
        damagePlayer(e.damage, e.pos);
      }
    } else {
      e.attackTimer = Math.max(0, e.attackTimer - dt * 0.5);
    }
  }

  // DEV: boss type label, shown above the boss while the overlay is on.
  if (window.debugLabels && bossEntity && bossEntity.alive) {
    if (!bossEntity.debugLabel) {
      bossEntity.debugLabel = makeDebugLabel(bossEntity.name || 'BOSS');
      scene.add(bossEntity.debugLabel);
    }
    bossEntity.debugLabel.position.set(bossEntity.pos.x, bossEntity.height + 0.6, bossEntity.pos.z);
  } else if (bossEntity && bossEntity.debugLabel) {
    removeDebugLabel(bossEntity); // boss dead/gone → drop its label
  }
}
