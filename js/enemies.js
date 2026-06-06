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

/* ═══════════════════════════════════════════
   MOB TYPES (UPDATED SCALING)
   ═══════════════════════════════════════════ */
const MOB_TYPES = {
  stalker:        { speed: 2.0, health: 130, damage: 10, color: 0x332222, scale: 1.8,  height: 3.6, attackRange: 1.8, attackCooldown: 1.4, name: 'Stalker' },
  crawler:        { speed: 4.5, health: 50,  damage: 7,  color: 0x443333, scale: 0.65, height: 0.85, attackRange: 1.5, attackCooldown: 0.7, name: 'Crawler' },
  phantom:        { speed: 3.0, health: 75,  damage: 13, color: 0x222244, scale: 0.9,  height: 1.7,  attackRange: 2.0, attackCooldown: 1.1, name: 'Phantom', erratic: true },
  danger_stalker: { speed: 3.5, health: 160, damage: 14, color: 0x551111, scale: 2.0,  height: 4.0,  attackRange: 2.0, attackCooldown: 1.0, name: 'Danger Stalker' },
  danger_crawler: { speed: 6.0, health: 70,  damage: 10, color: 0x553322, scale: 1.1,  height: 1.6,  attackRange: 1.6, attackCooldown: 0.5, name: 'Danger Crawler' }
};

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

  const tex = spriteTextures[type];
  const mat = new THREE.SpriteMaterial({ map: tex, color: 0xffffff, transparent: true, depthWrite: false });
  const mesh = new THREE.Sprite(mat);
  
  mesh.scale.set(mt.scale * 2.5, mt.scale * 2.5, 1);
  const spriteH = mt.scale * 2.5;
  mesh.position.set(bestX, spriteH / 2, bestZ);
  scene.add(mesh);

  // Add a faint red light to the sprite center for atmosphere
  const eyeLight = new THREE.PointLight(0xff2200, 0.2, 4);
  eyeLight.position.set(0, 0, 0.5);
  mesh.add(eyeLight);

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

  let texName = 'boss_warden';
  if (currentFloor > 5) texName = 'boss_amalgam';
  if (currentFloor > 10) texName = 'boss_hive';
  
  const tex = spriteTextures[texName];
  const mat = new THREE.SpriteMaterial({ map: tex, color: 0xffffff, transparent: true, depthWrite: false });
  const mesh = new THREE.Sprite(mat);
  
  mesh.scale.set(sc * 4.0, sc * 4.0, 1);
  mesh.position.set(bx, bh / 2, bz);
  scene.add(mesh);

  const bossLight = new THREE.PointLight(0xff2200, 0.6, 10);
  bossLight.position.set(0, 0, 0.5);
  mesh.add(bossLight);

  const totalHp = theme.bossHp * (1 + Math.floor(currentFloor / LEVEL_THEMES.length) * 0.3);

  bossEntity = {
    mesh,
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

  const projLight = new THREE.PointLight(0xff4400, 0.5, 5);
  projMesh.add(projLight);

  const speed = 12 + boss.currentPhase * 3;
  bossProjectiles.push({
    mesh: projMesh,
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
    p.mesh.rotation.x += dt * 8;
    p.mesh.rotation.z += dt * 6;

    // Hit player
    const dx = p.pos.x - player.pos.x;
    const dz = p.pos.z - player.pos.z;
    const dy = p.pos.y - player.pos.y;
    if (Math.sqrt(dx * dx + dz * dz + dy * dy) < 1.0) {
      damagePlayer(p.damage, p.pos);
      scene.remove(p.mesh);
      bossProjectiles.splice(i, 1);
      continue;
    }

    // Hit wall or expired
    let hitWall = false;
    for (const w of mazeWalls) {
      if (p.pos.x > w.minX && p.pos.x < w.maxX && p.pos.z > w.minZ && p.pos.z < w.maxZ) { hitWall = true; break; }
    }

    if (p.life <= 0 || hitWall) {
      scene.remove(p.mesh);
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

    // Boss death animation
    const b = bossEntity;
    const deathAnim = () => {
      b.deathTimer += 0.016;
      b.mesh.material.opacity = Math.max(0, 1 - b.deathTimer * 1.5);
      b.mesh.material.transparent = true;
      b.mesh.scale.y = Math.max(0.01, 1 - b.deathTimer * 2);
      b.mesh.position.y = b.height / 2 * b.mesh.scale.y;
      if (b.deathTimer < 1.0) {
        requestAnimationFrame(deathAnim);
      } else {
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

  exitLight = new THREE.PointLight(exitColor, 1.2, CELL * 6);
  exitLight.position.set(exitZone.x, 2, exitZone.z);
  scene.add(exitLight);

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
  const types = ['stalker', 'crawler', 'phantom'];
  for (let i = 0; i < count; i++) {
    const t = types[i % types.length];
    setTimeout(() => {
      if (gameState === 'playing') spawnEnemy(t);
    }, i * 600 + Math.random() * 400);
  }
}

// Anti-linger: spawn from behind player
function spawnDangerMob() {
  const behindAngle = player.yaw + Math.PI + (Math.random() - 0.5) * 1.0;
  const spawnDist = CELL * 5 + Math.random() * CELL * 3;
  const sx = player.pos.x + Math.sin(behindAngle) * spawnDist;
  const sz = player.pos.z + Math.cos(behindAngle) * spawnDist;

  // Find nearest valid cell
  const gh = mazeGrid.length, gw = mazeGrid[0].length;
  const cx = Math.floor(sx / CELL), cy = Math.floor(sz / CELL);
  if (cx >= 0 && cx < gw && cy >= 0 && cy < gh && mazeGrid[cy][cx] === 1) {
    const types = ['danger_stalker', 'danger_crawler'];
    spawnEnemy(types[Math.floor(Math.random() * types.length)], { x: sx, z: sz });
  } else {
    // Fallback: spawn normally
    const types = ['danger_stalker', 'danger_crawler'];
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
      e.deathTimer += dt;
      e.mesh.material.opacity = Math.max(0, 1 - e.deathTimer * 2.5);
      e.mesh.material.transparent = true;
      e.mesh.scale.y = Math.max(0.01, 1 - e.deathTimer * 3);
      e.mesh.position.y = (e.scale * 2.5) / 2 * e.mesh.scale.y;
      if (e.deathTimer > 0.7) {
        scene.remove(e.mesh);
        enemies.splice(i, 1);
      }
      continue;
    }

    // Hit flash recovery
    if (e.hitFlashTimer > 0) {
      e.hitFlashTimer -= dt;
      if (e.hitFlashTimer <= 0) {
        e.mesh.material.color.setHex(0xffffff);
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
    if (e.type === 'crawler' || e.type === 'danger_crawler') {
      e.mesh.position.y = (e.scale * 2.5) / 2 + Math.sin(clock.getElapsedTime() * 14) * 0.06;
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
}
