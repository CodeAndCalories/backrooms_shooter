
"use strict";

/* ═══════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════ */
const CELL = 4, WALL_H = 3.4;
const GRAVITY = 22, JUMP_V = 8, MOVE_SPEED = 5.5, SPRINT_MULT = 1.65;
const MOUSE_SENS = 0.0018;
const MAX_HEALTH = 100, MAX_STAMINA = 100, STAMINA_DRAIN = 22, STAMINA_REGEN = 14;
const CLIP_SIZE = 12, RESERVE_MAX = 84, RELOAD_TIME = 1.6, FIRE_RATE = 0.12;
const GUN_DAMAGE = 28, GUN_RANGE = 90;

// ADS constants
const DEFAULT_FOV = 75, ADS_FOV = 55, ADS_LERP_SPEED = 8;
const ADS_GUN_POS = { x: 0.0, y: -0.12, z: -0.32 };
const DEFAULT_GUN_POS = { x: 0.22, y: -0.18, z: -0.35 };

// Anti-linger constants
const LINGER_SAFE_TIME = 45; // seconds before danger starts rising
const LINGER_MAX_DANGER = 5; // max danger level
const LINGER_SPAWN_BASE = 8; // seconds between danger spawns at level 1
const LINGER_SPAWN_MIN = 1.5; // minimum seconds between spawns at max danger

/* ═══════════════════════════════════════════
   SEEDED PRNG (level generation only)
   ═══════════════════════════════════════════ */
function mulberry32(seed) {
  return function() {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ═══════════════════════════════════════════
   LEVEL THEMES — 15+ Levels with Boss every 5
   ═══════════════════════════════════════════ */
const LEVEL_THEMES = [
  {
    id: 0,
    archetype: 'rooms',
    // open-office lobby: MANY big rooms, wide flowing connections
    genParams: { roomCount: [7, 10], roomW: [3, 7], roomH: [3, 5], widen: 0.35, doorMax: 2 },
    name: "The Lobby",
    subtitle: "Mono-yellow purgatory. ~600 million sq miles of empty rooms.",
    wallColor: '#c9b968', wallColor2: '#b5a855',
    floorColor: '#5a4a32', floorColor2: '#4d3f2a',
    ceilColor: '#e8e0c8',
    fogColor: 0x1a1408, fogNear: 1, fogFar: 30,
    lightColor: 0xfff0c0, lightIntensity: 0.8,
    ambientColor: 0xfff5d4, ambientIntensity: 0.08,
    bgColor: 0x0d0a04,
    mazeSize: 8,
    floorType: 'carpet',
    decorations: 'pillars',
    enemyTint: 0.0,
    darknessLevel: 0,
    // MOB ECOLOGY (see getThemeMobs/waveSizeFor): entry floor — few, weak, mostly
    // crawlers with the odd phantom. Gentle on-ramp.
    mobs: { types: ['crawler', 'phantom'], weights: [3, 1], danger: ['danger_crawler'],
            speedMult: 1.0, hpMult: 0.8, countMult: 0.8, waveBase: 2, waveCap: 5 }
  },
  {
    id: 1,
    archetype: 'rooms',
    // warehouse district: medium rooms, some widened corridors
    genParams: { roomCount: [6, 8], roomW: [2, 5], roomH: [2, 5], widen: 0.25, doorMax: 2 },
    name: "Habitable Zone",
    subtitle: "Concrete warehouses stretching into infinity.",
    wallColor: '#707070', wallColor2: '#606060',
    floorColor: '#484848', floorColor2: '#3a3a3a',
    ceilColor: '#909090',
    fogColor: 0x0a0a0e, fogNear: 1, fogFar: 26,
    lightColor: 0xccccff, lightIntensity: 0.7,
    ambientColor: 0xaaaacc, ambientIntensity: 0.06,
    bgColor: 0x08080c,
    mazeSize: 10,
    floorType: 'concrete',
    decorations: 'crates',
    enemyTint: 0.2,
    darknessLevel: 0.3,
    // Still an early floor: small mixed crawler/phantom waves, slightly less frail.
    mobs: { types: ['crawler', 'phantom'], weights: [2, 2], danger: ['danger_crawler'],
            speedMult: 1.0, hpMult: 0.85, countMult: 0.9, waveBase: 2, waveCap: 6 }
  },
  {
    id: 2,
    archetype: 'rooms',
    // maintenance tunnels: tight + mazy — few small rooms, almost no widening
    genParams: { roomCount: [4, 6], roomW: [2, 3], roomH: [2, 3], widen: 0.10, doorMax: 1 },
    name: "Pipe Dreams",
    subtitle: "Maintenance tunnels. The machinery never stops.",
    wallColor: '#4a4035', wallColor2: '#3d352c',
    floorColor: '#2e2822', floorColor2: '#252018',
    ceilColor: '#3a332a',
    fogColor: 0x120808, fogNear: 0.5, fogFar: 20,
    lightColor: 0xff4422, lightIntensity: 0.55,
    ambientColor: 0x331100, ambientIntensity: 0.04,
    bgColor: 0x0a0404,
    mazeSize: 10,
    floorType: 'metal',
    decorations: 'pipes',
    enemyTint: 0.4,
    darknessLevel: 0.6,
    // STAT VARIANT floor: tight tunnels, FAST mobs (speedMult) but still weak —
    // the scare is speed in confined space, not numbers.
    mobs: { types: ['crawler', 'phantom'], weights: [3, 1], danger: ['danger_crawler'],
            speedMult: 1.25, hpMult: 0.8, countMult: 0.85, waveBase: 2, waveCap: 6 }
  },
  {
    id: 3,
    archetype: 'pools', // sunken pool basins in wide-archway halls (generatePools)
    genParams: { cols: [2, 3], rows: [2, 2], poolChance: 0.85, bridgeChance: 0.5 },
    // BRIGHT variant: clear turquoise water, shallow wade-able basins
    water: { depth: 1.2, surfaceDrop: 0.3, color: 0x35d8e8, opacity: 0.4, slow: 0.55, underAlpha: 0.45, causticColor: 0x7df0ff, causticIntensity: 0.5 },
    name: "The Poolrooms",
    subtitle: "Endless tiled pools. The water is warm. You are not alone.",
    wallColor: '#e9e4d4', wallColor2: '#dcd6c4',
    floorColor: '#cfe6e6', floorColor2: '#bdd9da',
    ceilColor: '#f2eee2',
    fogColor: 0x0e1a1c, fogNear: 2, fogFar: 35,
    lightColor: 0xffeec8, lightIntensity: 0.9,
    ambientColor: 0xcfe8e4, ambientIntensity: 0.12,
    bgColor: 0x081416,
    mazeSize: 9,
    floorType: 'tile',
    decorations: 'water',
    enemyTint: 0.6,
    darknessLevel: 0.1,
    // SIGNATURE: phantoms drifting over the water + crawlers wading the basins.
    mobs: { types: ['phantom', 'crawler'], weights: [2, 2], danger: ['danger_crawler'],
            speedMult: 1.0, hpMult: 1.0, countMult: 1.0, waveBase: 3, waveCap: 8 }
  },
  {
    id: 4,
    archetype: 'arena', // boss floors always use generateBossArena — label is informational
    name: "BOSS — The Warden",
    subtitle: "Something massive guards this threshold.",
    wallColor: '#3a1010', wallColor2: '#2a0808',
    floorColor: '#1a0808', floorColor2: '#120404',
    ceilColor: '#2a1010',
    fogColor: 0x0a0202, fogNear: 2, fogFar: 40,
    lightColor: 0xff2200, lightIntensity: 0.5,
    ambientColor: 0x220800, ambientIntensity: 0.04,
    bgColor: 0x050101,
    mazeSize: 6,
    floorType: 'metal',
    decorations: 'none',
    enemyTint: 0.8,
    darknessLevel: 0.7,
    isBoss: true,
    bossName: "THE WARDEN",
    bossTex: 'boss_warden',
    bossHp: 800,
    bossScale: 3.0,
    bossSpeed: 2.2,
    bossDamage: 18,
    bossSpawnCount: 3
  },
  {
    id: 5,
    archetype: 'rooms',
    // party venue: a handful of HUGE halls, very open flow between them
    genParams: { roomCount: [5, 7], roomW: [4, 7], roomH: [4, 6], widen: 0.45, doorMax: 2 },
    name: "Level Fun =)",
    subtitle: "Come play with us! We have cake! =) =) =)",
    wallColor: '#ff88aa', wallColor2: '#88ddff',
    floorColor: '#ffdd66', floorColor2: '#ff9944',
    ceilColor: '#8fae8f',                         // dimmed, sickly green ceiling — party-gone-wrong
    fogColor: 0x180810, fogNear: 1, fogFar: 22,
    lightColor: 0xff66cc, lightIntensity: 0.75,
    ambientColor: 0xff88aa, ambientIntensity: 0.08,
    bgColor: 0x100608,
    mazeSize: 12,
    floorType: 'party',
    decorations: 'party',                         // balloons + candle-lit cake tables (see addDecorations)
    enemyTint: 0.8,
    darknessLevel: 0.0,
    // SIGNATURE: partygoers ONLY (anti-linger included — more guests keep arriving).
    // STAT VARIANT: numerous-but-weak — the party swells, each guest is soft.
    mobs: { types: ['partygoer'], weights: [1], danger: ['partygoer'],
            speedMult: 1.0, hpMult: 0.7, countMult: 1.5, waveBase: 4, waveCap: 12 }
  },
  {
    id: 6,
    archetype: 'rooms',
    // transformer maze: tight corridors, sparse small switch-rooms
    genParams: { roomCount: [4, 6], roomW: [2, 4], roomH: [2, 3], widen: 0.12, doorMax: 1 },
    name: "The Electrical Station",
    subtitle: "Buzzing transformers. The air tastes like copper.",
    wallColor: '#3a4050', wallColor2: '#2c3340',
    floorColor: '#222830', floorColor2: '#1a2028',
    ceilColor: '#4a5060',
    fogColor: 0x060810, fogNear: 1, fogFar: 22,
    lightColor: 0x4488ff, lightIntensity: 0.45,
    ambientColor: 0x223366, ambientIntensity: 0.03,
    bgColor: 0x040608,
    mazeSize: 11,
    floorType: 'metal',
    decorations: 'pipes',
    enemyTint: 0.3,
    darknessLevel: 0.8,
    // Dark transformer maze: erratic phantoms flickering between the racks.
    mobs: { types: ['phantom', 'crawler', 'stalker'], weights: [3, 2, 1], danger: ['danger_crawler', 'danger_stalker'],
            speedMult: 1.1, hpMult: 1.0, countMult: 1.0, waveBase: 3, waveCap: 8 }
  },
  {
    id: 7,
    archetype: 'open',
    name: "The Suburbs",
    subtitle: "Cookie-cutter houses. Nobody's home. Nobody was ever home.",
    wallColor: '#a8a090', wallColor2: '#988878',
    floorColor: '#60584a', floorColor2: '#504838',
    ceilColor: '#c0b8a8',
    fogColor: 0x10100a, fogNear: 1, fogFar: 28,
    lightColor: 0xffeecc, lightIntensity: 0.6,
    ambientColor: 0xddccaa, ambientIntensity: 0.06,
    bgColor: 0x0a0a06,
    mazeSize: 12,
    floorType: 'carpet',
    decorations: 'crates',
    enemyTint: 0.1,
    darknessLevel: 0.4,
    // SIGNATURE: facelings/stalkers (skinstealer model) looming in the fog —
    // fewer mobs, taller silhouettes.
    mobs: { types: ['stalker', 'phantom'], weights: [3, 1], danger: ['danger_stalker'],
            speedMult: 1.0, hpMult: 1.0, countMult: 0.9, waveBase: 3, waveCap: 8 }
  },
  {
    id: 8,
    archetype: 'chambers', // interconnected stone rooms — test floor for the chambers generator
    name: "The Crypt",
    subtitle: "Ancient stone. The walls weep something dark.",
    wallColor: '#484040', wallColor2: '#383030',
    floorColor: '#2a2222', floorColor2: '#201818',
    ceilColor: '#504848',
    fogColor: 0x080404, fogNear: 0.5, fogFar: 18,
    lightColor: 0xcc8844, lightIntensity: 0.4,
    ambientColor: 0x442200, ambientIntensity: 0.03,
    bgColor: 0x060303,
    mazeSize: 11,
    floorType: 'concrete',
    decorations: 'pillars',
    enemyTint: 0.5,
    darknessLevel: 0.85,
    // Mid-game gut check: mixed roster (spiders join here), a touch tankier.
    mobs: { types: ['stalker', 'crawler', 'spider'], weights: [2, 2, 1], danger: ['danger_stalker', 'danger_crawler'],
            speedMult: 0.95, hpMult: 1.15, countMult: 1.0, waveBase: 3, waveCap: 9 }
  },
  {
    id: 9,
    archetype: 'arena', // boss floors always use generateBossArena — label is informational
    name: "BOSS — The Amalgam",
    subtitle: "It has consumed everything on this level. You're next.",
    wallColor: '#1a1020', wallColor2: '#120818',
    floorColor: '#0a0610', floorColor2: '#060408',
    ceilColor: '#201828',
    fogColor: 0x040208, fogNear: 2, fogFar: 45,
    lightColor: 0x8844ff, lightIntensity: 0.5,
    ambientColor: 0x220044, ambientIntensity: 0.04,
    bgColor: 0x020104,
    mazeSize: 7,
    floorType: 'concrete',
    decorations: 'none',
    enemyTint: 0.6,
    darknessLevel: 0.7,
    isBoss: true,
    bossName: "THE AMALGAM",
    bossTex: 'boss_amalgam',
    bossHp: 1400,
    bossScale: 3.5,
    bossSpeed: 2.8,
    bossDamage: 22,
    bossSpawnCount: 4
  },
  {
    id: 10,
    archetype: 'chambers', // wards + corridors: a denser chamber grid reads as hospital wards
    genParams: { cols: [3, 4], rows: [2, 3] },
    name: "The Hospital",
    subtitle: "Fluorescent lights. Sterile halls. Something on the gurney moved.",
    wallColor: '#c8c8c0', wallColor2: '#b0b0a8',
    floorColor: '#88887a', floorColor2: '#78786a',
    ceilColor: '#e0e0d8',
    fogColor: 0x101010, fogNear: 1, fogFar: 25,
    lightColor: 0xeeffee, lightIntensity: 0.7,
    ambientColor: 0xccddcc, ambientIntensity: 0.06,
    bgColor: 0x080808,
    mazeSize: 13,
    floorType: 'tile',
    decorations: 'crates',
    enemyTint: 0.2,
    darknessLevel: 0.3,
    // SIGNATURE: skinstealers (stalker model) stalking the wards + wretches
    // (crawler/bacteria model) on the gurneys. The flagship stalker floor.
    mobs: { types: ['stalker', 'crawler'], weights: [3, 2], danger: ['danger_stalker'],
            speedMult: 1.05, hpMult: 1.1, countMult: 1.0, waveBase: 4, waveCap: 10 }
  },
  {
    id: 11,
    archetype: 'field', // open overgrown ground with sparse obstacles — the nature/field floor
    name: "The Greenhouse",
    subtitle: "Overgrown corridors. The plants are watching.",
    wallColor: '#4a6a3a', wallColor2: '#3a5a2a',
    floorColor: '#2a3a20', floorColor2: '#1a2a10',
    ceilColor: '#5a7a4a',
    fogColor: 0x040a04, fogNear: 1, fogFar: 24,
    lightColor: 0x66ff44, lightIntensity: 0.55,
    ambientColor: 0x226600, ambientIntensity: 0.05,
    bgColor: 0x020602,
    mazeSize: 12,
    floorType: 'concrete',
    decorations: 'pillars',
    enemyTint: 0.4,
    darknessLevel: 0.5,
    // Overgrown: spiders in the foliage, quick skittering threats.
    mobs: { types: ['spider', 'crawler', 'phantom'], weights: [2, 2, 1], danger: ['danger_crawler'],
            speedMult: 1.1, hpMult: 1.0, countMult: 1.0, waveBase: 4, waveCap: 10 }
  },
  {
    id: 12,
    archetype: 'linear', // infinite shelves = long aisle with shelving down both sides — the corridor floor
    name: "The Archive",
    subtitle: "Infinite shelves. The books contain only your name.",
    wallColor: '#6a5a40', wallColor2: '#5a4a30',
    floorColor: '#3a3020', floorColor2: '#2a2010',
    ceilColor: '#7a6a50',
    fogColor: 0x0a0804, fogNear: 1, fogFar: 22,
    lightColor: 0xffcc66, lightIntensity: 0.5,
    ambientColor: 0x664400, ambientIntensity: 0.04,
    bgColor: 0x060402,
    mazeSize: 14,
    floorType: 'carpet',
    decorations: 'crates',
    enemyTint: 0.3,
    darknessLevel: 0.6,
    // Quiet stacks, things between the shelves: phantom-led, slightly hardened.
    mobs: { types: ['phantom', 'stalker', 'spider'], weights: [2, 1, 1], danger: ['danger_stalker'],
            speedMult: 1.0, hpMult: 1.05, countMult: 0.9, waveBase: 4, waveCap: 9 }
  },
  {
    id: 13,
    archetype: 'open', // cold-storage warehouse: open ground between big freezer-rack blocks
    name: "The Freezer",
    subtitle: "Sub-zero. Your breath crystallizes. Something exhales behind you.",
    wallColor: '#8898a8', wallColor2: '#7888a0',
    floorColor: '#506070', floorColor2: '#405060',
    ceilColor: '#a0b0c0',
    fogColor: 0x060a10, fogNear: 0.5, fogFar: 20,
    lightColor: 0x88ccff, lightIntensity: 0.45,
    ambientColor: 0x446688, ambientIntensity: 0.04,
    bgColor: 0x040608,
    mazeSize: 11,
    floorType: 'metal',
    decorations: 'pipes',
    enemyTint: 0.5,
    darknessLevel: 0.75,
    // STAT VARIANT floor: frozen-stiff mobs — SLOWER but much TANKIER. Kite or die.
    mobs: { types: ['stalker', 'crawler', 'spider'], weights: [2, 1, 1], danger: ['danger_stalker'],
            speedMult: 0.8, hpMult: 1.5, countMult: 0.85, waveBase: 4, waveCap: 8 }
  },
  {
    id: 14,
    archetype: 'arena', // boss floors always use generateBossArena — label is informational
    name: "BOSS — The Hive Mind",
    subtitle: "A thousand voices speak as one. It wants you to join.",
    wallColor: '#2a1a2a', wallColor2: '#1a0a1a',
    floorColor: '#100810', floorColor2: '#0a040a',
    ceilColor: '#3a2a3a',
    fogColor: 0x080408, fogNear: 2, fogFar: 50,
    lightColor: 0xff44ff, lightIntensity: 0.5,
    ambientColor: 0x440044, ambientIntensity: 0.04,
    bgColor: 0x040204,
    mazeSize: 8,
    floorType: 'concrete',
    decorations: 'none',
    enemyTint: 0.7,
    darknessLevel: 0.65,
    isBoss: true,
    bossName: "THE HIVE MIND",
    bossTex: 'boss_hive',
    bossHp: 2200,
    bossScale: 4.0,
    bossSpeed: 3.2,
    bossDamage: 28,
    bossSpawnCount: 5
  },
  {
    id: 15,
    archetype: 'linear', // long aisle with seat blocks down both sides — see generateLinear
    name: "The Endless Bus",
    subtitle: "The route has no stops. The seats are never empty behind you.",
    wallColor: '#b5a44e', wallColor2: '#8f8246', // dull school-bus yellow panels
    floorColor: '#2a2824', floorColor2: '#201e1a', // dark rubber aisle matting
    ceilColor: '#9a958a',                          // grimy grey ceiling
    fogColor: 0x0a0904, fogNear: 1, fogFar: 22,
    lightColor: 0xffe8a0, lightIntensity: 0.5,     // dim sickly cabin lights
    ambientColor: 0x33301f, ambientIntensity: 0.05,
    bgColor: 0x080704,
    mazeSize: 10,
    floorType: 'metal',
    decorations: 'none',
    enemyTint: 0.4,
    darknessLevel: 0.5,
    // 1-cell aisle: SMALL waves only (countMult + low cap) — two crawlers in a
    // bus aisle are plenty. Slightly hardened so each one matters.
    mobs: { types: ['crawler', 'stalker'], weights: [2, 1], danger: ['danger_crawler'],
            speedMult: 1.05, hpMult: 1.1, countMult: 0.7, waveBase: 3, waveCap: 6 }
  },
  {
    id: 16,
    archetype: 'pools',
    genParams: { cols: [2, 3], rows: [2, 3], poolChance: 0.9, bridgeChance: 0.6 },
    // DARK variant: near-opaque black-teal water, basins too deep for a normal
    // jump (the in-water push-off in updatePlayer scales with depth), head goes
    // UNDER the surface while wading (underwater overlay kicks in).
    water: { depth: 2.5, surfaceDrop: 0.5, color: 0x041e22, opacity: 0.93, slow: 0.5, underAlpha: 0.82, causticColor: 0x16454c, causticIntensity: 0.3 },
    name: "The Dark Pools",
    subtitle: "The water remembers everyone who ever swam here. Listen.",
    wallColor: '#2c3c3c', wallColor2: '#223030',
    floorColor: '#16282a', floorColor2: '#102022',
    ceilColor: '#1c2c2c',
    fogColor: 0x020809, fogNear: 0.5, fogFar: 14,
    lightColor: 0x2e8e8e, lightIntensity: 0.35,
    ambientColor: 0x0e3438, ambientIntensity: 0.04,
    bgColor: 0x010505,
    mazeSize: 10,
    floorType: 'tile',
    decorations: 'water',
    enemyTint: 0.7,
    darknessLevel: 0.85,
    // SIGNATURE: sparse — DREAD over density. Half-size waves, tiny cap, tanky
    // phantoms over black water. The emptiness is the point.
    mobs: { types: ['phantom', 'stalker'], weights: [2, 1], danger: ['danger_stalker'],
            speedMult: 0.9, hpMult: 1.25, countMult: 0.5, waveBase: 2, waveCap: 4 }
  }
];

function getTheme(floor) {
  return LEVEL_THEMES[floor % LEVEL_THEMES.length];
}

function isBossFloor(floor) {
  const theme = getTheme(floor);
  return theme.isBoss === true;
}

/* ═══════════════════════════════════════════
   MOB ECOLOGY — per-theme spawn tables
   Composition/pacing/stat-variants all read from LEVEL_THEMES[].mobs (data
   only, no new mob types). Spawning itself stays HOST-only (spawnEnemy bails
   on clients; mirrors come via snapshots), so none of this needs the seeded
   rng — EXCEPT waveSizeFor, which killTarget derives from on EVERY machine
   independently (co-op kill-gate) and therefore must stay deterministic.
   ═══════════════════════════════════════════ */
// Fallback for themes without a table — boss-floor adds spawn through
// spawnEnemy too and get neutral multipliers from here.
const DEFAULT_THEME_MOBS = {
  types: ['stalker', 'crawler', 'phantom'], weights: [1, 1, 1],
  danger: ['danger_stalker', 'danger_crawler'],
  speedMult: 1.0, hpMult: 1.0, countMult: 1.0, waveBase: 3, waveCap: 10
};
function getThemeMobs(floor) { return getTheme(floor).mobs || DEFAULT_THEME_MOBS; }

// Wave size: theme base + intra-floor wave ramp + depth ramp, theme-scaled and
// capped (caps are the entity-budget guard; old global cap was 15).
// DETERMINISTIC — no randomness allowed in here (see block comment above).
function waveSizeFor(floor, wave) {
  const M = getThemeMobs(floor);
  const raw = (M.waveBase + (wave - 1) + floor * 0.5) * M.countMult;
  return Math.max(2, Math.min(M.waveCap, Math.round(raw)));
}

// Breather between a cleared wave and the next: long on early floors,
// tightening with depth. Anti-linger pressure is separate and unchanged.
function waveRespiteMs(floor) { return Math.max(2500, 6500 - floor * 400); }

/* ═══════════════════════════════════════════
   STATE
   ═══════════════════════════════════════════ */
let scene, camera, renderer, clock;
let gameState = 'menu';

// Seeded RNG for level generation (host may override floorSeed for multiplayer later)
let rng = Math.random;
let floorSeed = 0;
function seedFloor(floor) { floorSeed = (floor * 2654435761) >>> 0; rng = mulberry32(floorSeed); }
let player = {
  pos: new THREE.Vector3(0, 1.6, 0),
  vel: new THREE.Vector3(),
  yaw: 0, pitch: 0,
  onGround: true,
  health: MAX_HEALTH, stamina: MAX_STAMINA,
  isSprinting: false,
  // MP down/revive (Phase 4, co-op only): at 0 HP a co-op player goes DOWN
  // (no move/shoot) instead of game over; a teammate nearby for ~3s revives.
  isDown: false, reviveProgress: 0,
  clipAmmo: CLIP_SIZE, reserveAmmo: RESERVE_MAX,
  isReloading: false, reloadTimer: 0, fireTimer: 0,
  kills: 0, floorReached: 0,
  isADS: false, currentFOV: DEFAULT_FOV
};
let currentFloor = 0, currentWave = 1, waveMobsLeft = 0;
// MP kill-gate (Phase 4): the party's COMBINED kills this floor vs the target
// that unlocks the exit. Reset per floor in buildMazeScene. Authoritative on
// the host; mirrored to clients via the enemy snapshot's `k` field. Solo play
// ignores the gate entirely (netExitGateOpen → true).
let floorKills = 0, killTarget = 0;
// The floor startGame() begins on. Written by EITHER the dev level-select (PART 1,
// unrestricted, ?dev=1 only) or the player level-select (PART 2, unlock-gated). 0 = Level 1.
let selectedStartFloor = 0;

/* ═══════════════════════════════════════════
   PART 1 — DEV MODE GATE
   Dev tools (L-key debug labels, FPS counter, unrestricted level-select) only
   activate when the URL contains ?dev=1. Friends loading the plain URL get none.
   ═══════════════════════════════════════════ */
const DEV_MODE = new URLSearchParams(location.search).get('dev') === '1';

/* ═══════════════════════════════════════════
   PART 2 — PLAYER PROGRESSION (unlock gating, persisted)
   Tracks which floors the player has cleared in localStorage so the player-facing
   level-select can gate replays. Floor 0 (Level 1) is always unlocked; floor i
   unlocks once floor i-1 has been beaten. Wholly separate from PART 1's dev tools.
   ═══════════════════════════════════════════ */
const PROGRESS_KEY = 'backrooms_beaten_floors';
function loadBeatenFloors() {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch (e) { return new Set(); }
}
let beatenFloors = loadBeatenFloors();
function markFloorBeaten(i) {
  if (beatenFloors.has(i)) return;
  beatenFloors.add(i);
  try { localStorage.setItem(PROGRESS_KEY, JSON.stringify([...beatenFloors])); } catch (e) {}
}
// Floor 0 is always playable; any other floor needs the previous one beaten.
function isFloorUnlocked(i) { return i === 0 || beatenFloors.has(i - 1); }
let keys = {}, mouseDown = false, rightMouseDown = false;
let mazeWalls = [], mazeGrid = [];
// 'pools' archetype state (see generatePools/buildPoolsGeometry). mazeGrid cell
// value 2 = sunken pool basin: walkable floor at -poolWater.depth, water on top.
let poolRects = [];   // basin cell-rects for the current pools floor
let poolWater = null; // active theme.water (null on every other floor — physics no-op)
let poolFx = null;    // animated water/caustics handles (floor-owned, rebuilt per floor)
let enemies = [], lights = [];
let exitZone = null, exitMesh = null, exitLight = null;
let gunGroup = null, gunRecoil = 0, gunSwayX = 0, gunSwayY = 0;
let damageVigTimer = 0, hitmarkerTimer = 0, hitmarkerKill = false;
let dmgInd = { left: 0, right: 0, top: 0, bottom: 0 };
let floorAnnounceTimer = 0;
const FLOOR_ANNOUNCE_TOTAL = 4.0; // two-step intro: "LEVEL N" then the level name

let flickerTimers = [];
let muzzleFlashLight = null, muzzleFlashTimer = 0;

/* ── FIXED LIGHT BUDGET ──
   three.js (r128) bakes the scene's point-light COUNT into every shader
   program's cache key, so any floor (or mid-fight event) that changes the
   number of PointLights forces a recompile of every material — the per-floor
   PROG climb and transition hitch on the dev HUD. Every floor therefore
   carries the SAME fixed set of point lights:
     CEILING_LIGHT_BUDGET ceiling slots (real ones lit, the rest parked dark
     below the floor) + 1 exit slot + 1 boss slot + BOSS_PROJ_LIGHT_COUNT
     projectile slots + the muzzle flash on the camera = 32 total.
   Combat/exit lights only ever change INTENSITY (the muzzle-flash pattern),
   never the count, so programs compiled on floor 0 are reused forever. */
const CEILING_LIGHT_BUDGET = 26;  // covers the worst real placement (5x5 sample grid = 25)
const BOSS_PROJ_LIGHT_COUNT = 3;  // max concurrent lit boss projectiles
let bossLight = null;             // persistent slot — lit only while a boss is alive
let bossProjLights = [];          // persistent slots — intensity 0 marks a free slot
let programKeepalive = null;      // camera-riding micro-meshes pinning shader programs (see createProgramKeepalive)
let flashlightWarmupToken = 0;    // invalidates in-flight async warm-up frames on rebuild

// Flashlight
let flashlight = null, flashlightOn = false;

// Anti-linger
let floorTimer = 0, dangerLevel = 0, dangerSpawnTimer = 0;

// Boss
let bossEntity = null;
let bossProjectiles = [];

// ADS interpolation state
let adsLerp = 0; // 0 = hip, 1 = full ADS

// Economy
let playerMoney = 0;
const KILL_REWARD = 25;
const FLOOR_CLEAR_REWARD = 150;
const BOSS_KILL_REWARD = 500;

// Bullet trails
let bulletTrails = [];

// Model preload gate. The loading screen (z-index above the menu) stays up until
// every mob GLB has SETTLED (loaded or failed), so first-visit players on slow
// connections wait a few seconds instead of fighting fallback mobs. startGame
// also checks this flag as a backstop in case the overlay is ever bypassed.
let modelsReady = false;

// Shop upgrades state
let shopUpgrades = {
  damage1:   { name: 'Hardened Rounds',   desc: 'Increase bullet damage by 30%',          cost: 200,  bought: false, apply: () => { shopStats.damageMult = 1.3; } },
  damage2:   { name: 'Hollow Points',     desc: 'Increase bullet damage by 65%',          cost: 500,  bought: false, apply: () => { shopStats.damageMult = 1.65; }, requires: 'damage1' },
  firerate1: { name: 'Hair Trigger',      desc: 'Increase fire rate by 25%',              cost: 250,  bought: false, apply: () => { shopStats.fireRateMult = 0.75; } },
  firerate2: { name: 'Auto Sear',         desc: 'Increase fire rate by 50%',              cost: 600,  bought: false, apply: () => { shopStats.fireRateMult = 0.5; }, requires: 'firerate1' },
  mag1:      { name: 'Extended Mag',      desc: 'Magazine capacity: 18 rounds',           cost: 150,  bought: false, apply: () => { shopStats.clipSize = 18; } },
  mag2:      { name: 'Drum Magazine',     desc: 'Magazine capacity: 30 rounds',           cost: 400,  bought: false, apply: () => { shopStats.clipSize = 30; }, requires: 'mag1' },
  stamina1:  { name: 'Adrenaline Shot',   desc: 'Stamina recovers 40% faster',            cost: 175,  bought: false, apply: () => { shopStats.staminaRegenMult = 1.4; } },
  stamina2:  { name: 'Endurance Serum',   desc: 'Stamina recovers 100% faster',           cost: 450,  bought: false, apply: () => { shopStats.staminaRegenMult = 2.0; }, requires: 'stamina1' },
  reserve1:  { name: 'Ammo Crate',       desc: 'Max reserve ammo increased to 120',       cost: 200,  bought: false, apply: () => { shopStats.reserveMax = 120; } },
  health1:   { name: 'Kevlar Vest',       desc: 'Max health increased to 140',            cost: 300,  bought: false, apply: () => { shopStats.maxHealth = 140; } },
};

// Active stat modifiers from shop
let shopStats = {
  damageMult: 1.0,
  fireRateMult: 1.0,
  clipSize: CLIP_SIZE,
  staminaRegenMult: 1.0,
  reserveMax: RESERVE_MAX,
  maxHealth: MAX_HEALTH,
};

/* ═══════════════════════════════════════════
   PROCEDURAL TEXTURES (themed)
   ═══════════════════════════════════════════ */
function hexToRgb(hex) {
  hex = hex.replace('#', '');
  return {
    r: parseInt(hex.substring(0, 2), 16),
    g: parseInt(hex.substring(2, 4), 16),
    b: parseInt(hex.substring(4, 6), 16)
  };
}

// Every canvas-generated texture must be tagged sRGB AT CREATION: the renderer
// outputs sRGB (init), so linear-tagged maps render shifted/muddy. NEVER toggle
// encoding on a live texture — it changes the shader program variant and forces
// a mid-game recompile hitch. The program-keepalive pin texture carries the
// same tag so the pinned program variants are the ones the world actually uses.
let srgbCanvasTexCount = 0;
function texMarkSRGB(tex) {
  tex.encoding = THREE.sRGBEncoding;
  srgbCanvasTexCount++;
  return tex;
}

function createWallTexture(theme) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const ctx = c.getContext('2d');
  const base = hexToRgb(theme.wallColor);

  ctx.fillStyle = theme.wallColor;
  ctx.fillRect(0, 0, 256, 256);

  if (theme.id === 0 || theme.id === 7) {
    for (let x = 0; x < 256; x += 16) {
      ctx.fillStyle = `rgba(${base.r - 20 + Math.random() * 30},${base.g - 15 + Math.random() * 20},${base.b - 10 + Math.random() * 20},0.15)`;
      ctx.fillRect(x, 0, 8, 256);
    }
    for (let i = 0; i < 4; i++) {
      const gx = Math.random() * 256, gy = Math.random() * 256;
      const grad = ctx.createRadialGradient(gx, gy, 0, gx, gy, 30 + Math.random() * 40);
      grad.addColorStop(0, 'rgba(100,90,50,0.12)');
      grad.addColorStop(1, 'rgba(100,90,50,0)');
      ctx.fillStyle = grad; ctx.fillRect(0, 0, 256, 256);
    }
  } else if (theme.id === 1 || theme.id === 8 || theme.id === 10 || theme.id === 12) {
    for (let i = 0; i < 3000; i++) {
      ctx.fillStyle = `rgba(${base.r - 20 + Math.random() * 40},${base.g - 20 + Math.random() * 40},${base.b - 20 + Math.random() * 40},0.15)`;
      ctx.fillRect(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 4, 1 + Math.random() * 2);
    }
    ctx.strokeStyle = 'rgba(50,50,50,0.15)'; ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      let x = Math.random() * 256, y = Math.random() * 256;
      ctx.moveTo(x, y);
      for (let j = 0; j < 5; j++) { x += (Math.random() - 0.5) * 40; y += Math.random() * 30; ctx.lineTo(x, y); }
      ctx.stroke();
    }
  } else if (theme.id === 2 || theme.id === 6 || theme.id === 13) {
    for (let i = 0; i < 2000; i++) {
      const rust = Math.random() < 0.3;
      ctx.fillStyle = rust ? `rgba(${120 + Math.random() * 50},${50 + Math.random() * 30},${20 + Math.random() * 20},0.2)` :
        `rgba(${base.r - 10 + Math.random() * 20},${base.g - 10 + Math.random() * 20},${base.b - 10 + Math.random() * 20},0.15)`;
      ctx.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 3, 1 + Math.random() * 6);
    }
  } else if (theme.id === 3 || theme.id === 11 || theme.id === 16) {
    ctx.strokeStyle = 'rgba(100,180,200,0.3)'; ctx.lineWidth = 2;
    for (let x = 0; x < 256; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 256); ctx.stroke(); }
    for (let y = 0; y < 256; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y); ctx.stroke(); }
    for (let i = 0; i < 5; i++) {
      const gx = Math.random() * 256, gy = Math.random() * 256;
      const grad = ctx.createRadialGradient(gx, gy, 0, gx, gy, 40);
      grad.addColorStop(0, 'rgba(255,255,255,0.08)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad; ctx.fillRect(0, 0, 256, 256);
    }
  } else if (theme.id === 5) {
    const colors = ['#ff4466', '#44aaff', '#ffdd00', '#44ff88', '#ff88ff', '#ff8844'];
    for (let i = 0; i < 80; i++) {
      ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)] + '44';
      const x = Math.random() * 256, y = Math.random() * 256;
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.random() * Math.PI);
      ctx.fillRect(-2, -8, 4, 16);
      ctx.restore();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.font = '24px monospace';
    for (let i = 0; i < 3; i++) {
      ctx.fillText('=)', Math.random() * 220, 20 + Math.random() * 220);
    }
  } else {
    // Generic noisy texture for boss/other levels
    for (let i = 0; i < 2000; i++) {
      ctx.fillStyle = `rgba(${base.r - 15 + Math.random() * 30},${base.g - 15 + Math.random() * 30},${base.b - 15 + Math.random() * 30},0.18)`;
      ctx.fillRect(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 4, 2 + Math.random() * 4);
    }
  }

  const id = ctx.getImageData(0, 0, 256, 256);
  for (let i = 0; i < id.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 14;
    id.data[i] += n; id.data[i + 1] += n; id.data[i + 2] += n;
  }
  ctx.putImageData(id, 0, 0);

  const tex = new THREE.CanvasTexture(c);
  texMarkSRGB(tex);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function createFloorTexture(theme) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const ctx = c.getContext('2d');
  const base = hexToRgb(theme.floorColor);

  ctx.fillStyle = theme.floorColor;
  ctx.fillRect(0, 0, 256, 256);

  if (theme.floorType === 'carpet') {
    for (let i = 0; i < 6000; i++) {
      ctx.fillStyle = `rgba(${base.r - 15 + Math.random() * 30},${base.g - 10 + Math.random() * 20},${base.b - 8 + Math.random() * 16},0.25)`;
      ctx.fillRect(Math.random() * 256, Math.random() * 256, 1, 2 + Math.random() * 3);
    }
    for (let i = 0; i < 4; i++) {
      const gx = Math.random() * 256, gy = Math.random() * 256;
      const grad = ctx.createRadialGradient(gx, gy, 0, gx, gy, 35 + Math.random() * 30);
      grad.addColorStop(0, `rgba(${base.r - 30},${base.g - 25},${base.b - 20},0.25)`);
      grad.addColorStop(1, `rgba(${base.r - 30},${base.g - 25},${base.b - 20},0)`);
      ctx.fillStyle = grad; ctx.fillRect(0, 0, 256, 256);
    }
  } else if (theme.floorType === 'concrete' || theme.floorType === 'metal') {
    for (let i = 0; i < 3000; i++) {
      ctx.fillStyle = `rgba(${base.r - 10 + Math.random() * 20},${base.g - 10 + Math.random() * 20},${base.b - 10 + Math.random() * 20},0.2)`;
      ctx.fillRect(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 5, 1 + Math.random() * 3);
    }
    if (theme.floorType === 'metal') {
      ctx.strokeStyle = 'rgba(60,50,40,0.2)'; ctx.lineWidth = 1;
      for (let x = 0; x < 256; x += 20) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 256); ctx.stroke(); }
    }
  } else if (theme.floorType === 'tile') {
    ctx.strokeStyle = 'rgba(80,160,180,0.25)'; ctx.lineWidth = 2;
    for (let x = 0; x < 256; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 256); ctx.stroke(); }
    for (let y = 0; y < 256; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y); ctx.stroke(); }
    for (let i = 0; i < 8; i++) {
      ctx.strokeStyle = `rgba(150,220,255,${0.05 + Math.random() * 0.08})`;
      ctx.lineWidth = 1 + Math.random() * 2;
      ctx.beginPath();
      let x = Math.random() * 256, y = Math.random() * 256;
      ctx.moveTo(x, y);
      for (let j = 0; j < 6; j++) { x += (Math.random() - 0.5) * 60; y += (Math.random() - 0.5) * 60; ctx.lineTo(x, y); }
      ctx.stroke();
    }
  } else if (theme.floorType === 'party') {
    const colors = ['#ffdd66', '#ff9944', '#ff6688', '#88ddff'];
    for (let y = 0; y < 256; y += 32) for (let x = 0; x < 256; x += 32) {
      ctx.fillStyle = colors[((x / 32 + y / 32) % colors.length)] + '33';
      ctx.fillRect(x, y, 32, 32);
    }
  }

  const id = ctx.getImageData(0, 0, 256, 256);
  for (let i = 0; i < id.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 12;
    id.data[i] += n; id.data[i + 1] += n; id.data[i + 2] += n;
  }
  ctx.putImageData(id, 0, 0);

  const tex = new THREE.CanvasTexture(c);
  texMarkSRGB(tex);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}

function createCeilingTexture(theme) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = theme.ceilColor;
  ctx.fillRect(0, 0, 128, 128);

  if (theme.id <= 1 || theme.id === 7 || theme.id === 10 || theme.id === 12) {
    ctx.strokeStyle = 'rgba(150,140,120,0.3)'; ctx.lineWidth = 1;
    ctx.strokeRect(2, 2, 124, 124);
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = `rgba(140,130,110,${0.15 + Math.random() * 0.2})`;
      ctx.beginPath(); ctx.arc(Math.random() * 128, Math.random() * 128, 0.5 + Math.random(), 0, Math.PI * 2); ctx.fill();
    }
  } else if (theme.id === 3) {
    for (let i = 0; i < 5; i++) {
      const gx = Math.random() * 128, gy = Math.random() * 128;
      const grad = ctx.createRadialGradient(gx, gy, 0, gx, gy, 30);
      grad.addColorStop(0, 'rgba(100,200,255,0.08)');
      grad.addColorStop(1, 'rgba(100,200,255,0)');
      ctx.fillStyle = grad; ctx.fillRect(0, 0, 128, 128);
    }
  }

  const tex = new THREE.CanvasTexture(c);
  texMarkSRGB(tex);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}

/* ═══════════════════════════════════════════
   THEME TEXTURE CACHE
   The 3 procedural CanvasTextures (wall/floor/ceiling) depend ONLY on the
   theme, so they're generated once per theme id and reused on every revisit
   (loops, restarts, level select) — skipping ~5-15ms of canvas work AND the
   first-render GPU upload per floor. 16 themes ≈ 9 MB VRAM ceiling, bounded.

   OWNERSHIP: cached textures are SHARED, not floor-owned. Each is tagged
   userData.themeCached = true, and the floor-teardown dispose in
   buildMazeScene skips any .map carrying that tag. If you add a new
   per-floor texture, leave the tag off and teardown will dispose it; if you
   add a new shared/cached one, tag it the same way. Never call .dispose()
   on a tagged texture — the cache holds it for the whole session.
   ═══════════════════════════════════════════ */
const themeTextureCache = new Map(); // theme.id -> { wall, floor, ceil }

function getThemeTextures(theme) {
  let entry = themeTextureCache.get(theme.id);
  if (!entry) {
    entry = {
      wall: createWallTexture(theme),
      floor: createFloorTexture(theme),
      ceil: createCeilingTexture(theme)
    };
    // Exempt from floor teardown. NOTE: r128 textures have no built-in
    // .userData (added in a later three.js release) — create it explicitly.
    for (const k in entry) entry[k].userData = { themeCached: true };
    themeTextureCache.set(theme.id, entry);
  }
  return entry;
}

/* ═══════════════════════════════════════════
   MAZE GENERATION
   ═══════════════════════════════════════════ */
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } }

// 'rooms' archetype — THE backrooms generator. A recursive-backtracker maze is
// only the corridor skeleton; a heavy seeded room pass then carves overlapping
// room clusters whose exposed edges are re-WALLED and connected through punched
// 1-2-cell doorways (rooms read as rooms, not open bleed), and a fraction of
// corridor cells are bulged to 2 wide. Per-theme structure knobs ride in
// theme.genParams (all optional, defaults below):
//   roomCount [min,max] — rooms carved per floor; overlaps merge into irregular
//                         open areas, which is intentional (liminal)
//   roomW/roomH [min,max] — room interior size in grid cells
//   widen 0..1          — fraction of corridor cells widened to 2 cells
//   doorMax             — doorways punched per room (1..doorMax)
// A final flood-fill REPAIR pass tunnels extra door-like openings to any region
// the room walls sealed off, so connectivity is guaranteed for every seed.
// Everything draws only from the seeded rng() in deterministic order — co-op
// machines regenerate the identical grid from the floor seed.
const MAZE_GEN_DEFAULTS = { roomCount: [6, 8], roomW: [2, 5], roomH: [2, 5], widen: 0.3, doorMax: 2 };

function generateMaze(w, h, theme) {
  const P = Object.assign({}, MAZE_GEN_DEFAULTS, (theme && theme.genParams) || {});
  const gw = w * 2 + 1, gh = h * 2 + 1;
  const ri = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));

  mazeGrid = [];
  for (let y = 0; y < gh; y++) { mazeGrid[y] = []; for (let x = 0; x < gw; x++) mazeGrid[y][x] = 0; }

  // 1. Corridor skeleton (recursive backtracker on the cell lattice).
  const visited = [];
  for (let y = 0; y < h; y++) { visited[y] = []; for (let x = 0; x < w; x++) visited[y][x] = false; }
  function carve(cx, cy) {
    visited[cy][cx] = true;
    mazeGrid[cy * 2 + 1][cx * 2 + 1] = 1;
    const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    shuffle(dirs);
    for (const [dx, dy] of dirs) {
      const nx = cx + dx, ny = cy + dy;
      if (nx >= 0 && nx < w && ny >= 0 && ny < h && !visited[ny][nx]) {
        mazeGrid[cy * 2 + 1 + dy][cx * 2 + 1 + dx] = 1;
        carve(nx, ny);
      }
    }
  }
  carve(0, 0);

  // 2. Extra loop openings so the maze isn't a strict tree.
  const extra = Math.floor(w * h * 0.15);
  for (let i = 0; i < extra; i++) {
    const rx = 1 + Math.floor(rng() * (gw - 2));
    const ry = 1 + Math.floor(rng() * (gh - 2));
    if (mazeGrid[ry][rx] === 0) {
      let nb = 0;
      if (mazeGrid[ry - 1][rx]) nb++;
      if (mazeGrid[ry + 1][rx]) nb++;
      if (mazeGrid[ry][rx - 1]) nb++;
      if (mazeGrid[ry][rx + 1]) nb++;
      if (nb >= 2) mazeGrid[ry][rx] = 1;
    }
  }

  // 3. Corridor widening: bulge a seeded fraction of corridor cells by opening
  // one orthogonal wall neighbour. Runs BEFORE the room pass so room walls (and
  // their doorway feel) aren't eroded. Opening a wall next to floor can only
  // merge regions, never split them.
  if (P.widen > 0) {
    for (let y = 1; y < gh - 1; y++) {
      for (let x = 1; x < gw - 1; x++) {
        if (mazeGrid[y][x] !== 1 || rng() >= P.widen) continue;
        const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
        const [dx, dy] = dirs[Math.floor(rng() * 4)];
        const nx = x + dx, ny = y + dy;
        if (nx > 0 && nx < gw - 1 && ny > 0 && ny < gh - 1) mazeGrid[ny][nx] = 1;
      }
    }
  }

  // 4. Room pass. Each room: carve the interior, re-wall the perimeter ring
  // (except where it would cut into an earlier room — overlaps merge into
  // bigger irregular halls), then punch door-like openings. Rooms placed with
  // interiors in 2..gw-3 so the ring (±1) never touches the outer border.
  const inRoom = [];
  for (let y = 0; y < gh; y++) { inRoom[y] = []; for (let x = 0; x < gw; x++) inRoom[y][x] = false; }
  const nRooms = ri(P.roomCount[0], P.roomCount[1]);
  for (let r = 0; r < nRooms; r++) {
    const rw = ri(P.roomW[0], P.roomW[1]);
    const rh = ri(P.roomH[0], P.roomH[1]);
    if (rw > gw - 5 || rh > gh - 5) continue; // grid too small for this room
    const rx = 2 + Math.floor(rng() * (gw - rw - 4));
    const ry = 2 + Math.floor(rng() * (gh - rh - 4));
    for (let dy = 0; dy < rh; dy++) for (let dx = 0; dx < rw; dx++) {
      mazeGrid[ry + dy][rx + dx] = 1;
      inRoom[ry + dy][rx + dx] = true;
    }
    // Perimeter ring → wall. This is what makes a room a ROOM: without it the
    // carve just bleeds open into every corridor it grazed.
    for (let x = rx - 1; x <= rx + rw; x++) {
      if (!inRoom[ry - 1][x]) mazeGrid[ry - 1][x] = 0;
      if (!inRoom[ry + rh][x]) mazeGrid[ry + rh][x] = 0;
    }
    for (let y = ry; y < ry + rh; y++) {
      if (!inRoom[y][rx - 1]) mazeGrid[y][rx - 1] = 0;
      if (!inRoom[y][rx + rw]) mazeGrid[y][rx + rw] = 0;
    }
    // Doorways: 1..doorMax openings, each 1-2 cells, on random sides. A door
    // into solid wall is a harmless alcove — the repair pass below guarantees
    // the room itself ends up connected regardless.
    const doors = 1 + Math.floor(rng() * P.doorMax);
    for (let d = 0; d < doors; d++) {
      const side = Math.floor(rng() * 4);
      const dw = 1 + Math.floor(rng() * 2);
      if (side < 2) {
        const wy = side === 0 ? ry - 1 : ry + rh;
        const x0 = rx + Math.floor(rng() * Math.max(1, rw - dw + 1));
        for (let k = 0; k < dw && x0 + k < rx + rw; k++) mazeGrid[wy][x0 + k] = 1;
      } else {
        const wx = side === 2 ? rx - 1 : rx + rw;
        const y0 = ry + Math.floor(rng() * Math.max(1, rh - dw + 1));
        for (let k = 0; k < dw && y0 + k < ry + rh; k++) mazeGrid[y0 + k][wx] = 1;
      }
    }
  }

  // 5. Spawn anchor (1,1) + far-corner anchor stay floor no matter what the
  // rooms overwrote. (The exit is now seeded-random via pickExitCell; the
  // far corner remains its degenerate-grid fallback.)
  mazeGrid[1][1] = 1;
  mazeGrid[gh - 2][gw - 2] = 1;

  // 6. Connectivity guarantee (exit reachability + co-op determinism both
  // depend on this): tunnel doorways to anything the room walls sealed off.
  mazeRepairConnectivity(gw, gh);
}

// Flood-fill from the spawn cell (1,1); while any floor region is unreached,
// BFS the SHORTEST wall path from the reached set to it and carve that path
// (1-2 cells in practice — it reads as just another doorway). Pure scan-order
// BFS, no rng: deterministic, so every co-op machine repairs identically.
// Border walls are never carved (search is confined to the 1..gw-2 interior).
function mazeRepairConnectivity(gw, gh) {
  const floodFrom = () => {
    const seen = [];
    for (let y = 0; y < gh; y++) seen.push(new Array(gw).fill(false));
    const q = [[1, 1]];
    seen[1][1] = true;
    while (q.length) {
      const [x, y] = q.pop();
      if (mazeGrid[y - 1] && mazeGrid[y - 1][x] === 1 && !seen[y - 1][x]) { seen[y - 1][x] = true; q.push([x, y - 1]); }
      if (mazeGrid[y + 1] && mazeGrid[y + 1][x] === 1 && !seen[y + 1][x]) { seen[y + 1][x] = true; q.push([x, y + 1]); }
      if (mazeGrid[y][x - 1] === 1 && !seen[y][x - 1]) { seen[y][x - 1] = true; q.push([x - 1, y]); }
      if (mazeGrid[y][x + 1] === 1 && !seen[y][x + 1]) { seen[y][x + 1] = true; q.push([x + 1, y]); }
    }
    return seen;
  };
  for (let guard = 0; guard < 256; guard++) {
    const seen = floodFrom();
    let disconnected = false;
    for (let y = 1; y < gh - 1 && !disconnected; y++)
      for (let x = 1; x < gw - 1; x++)
        if (mazeGrid[y][x] === 1 && !seen[y][x]) { disconnected = true; break; }
    if (!disconnected) return;

    // BFS outward from ALL reached floor cells, stepping through wall cells,
    // until the wavefront touches an unreached floor cell; carve the wall path.
    const visited = [];
    for (let y = 0; y < gh; y++) visited.push(new Array(gw).fill(false));
    const prev = new Map(); // 'x,y' of a wall cell -> parent 'x,y'
    const q = [];
    for (let y = 1; y < gh - 1; y++)
      for (let x = 1; x < gw - 1; x++)
        if (seen[y][x]) { visited[y][x] = true; q.push([x, y]); }
    let hit = null;
    for (let qi = 0; qi < q.length && !hit; qi++) {
      const [x, y] = q[qi];
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 1 || ny < 1 || nx > gw - 2 || ny > gh - 2 || visited[ny][nx]) continue;
        visited[ny][nx] = true;
        prev.set(nx + ',' + ny, x + ',' + y);
        if (mazeGrid[ny][nx] === 1) { hit = [nx, ny]; break; } // unreached floor found
        q.push([nx, ny]); // wall cell — keep tunnelling
      }
    }
    if (!hit) return; // no path even through walls — cannot happen on these grids
    let key = prev.get(hit[0] + ',' + hit[1]);
    while (key && prev.has(key)) { // walk back over the wall cells, carving
      const c = key.split(',');
      mazeGrid[+c[1]][+c[0]] = 1;
      key = prev.get(key);
    }
  }
}

// Boss arena: large open area in center
function generateBossArena(size) {
  mazeGrid = [];
  const s = size * 2 + 1;
  for (let y = 0; y < s; y++) { mazeGrid[y] = []; for (let x = 0; x < s; x++) mazeGrid[y][x] = 0; }
  // Open the center as a large arena
  for (let y = 1; y < s - 1; y++) {
    for (let x = 1; x < s - 1; x++) {
      mazeGrid[y][x] = 1;
    }
  }
  // Add some pillars for cover
  const pillarPositions = [];
  for (let i = 0; i < 6; i++) {
    const px = 2 + Math.floor(rng() * (s - 4));
    const py = 2 + Math.floor(rng() * (s - 4));
    // Don't place in center spawn area
    if (Math.abs(px - Math.floor(s/2)) < 2 && Math.abs(py - Math.floor(s/2)) < 2) continue;
    mazeGrid[py][px] = 0;
    pillarPositions.push({x: px, y: py});
  }
}

/* ═══════════════════════════════════════════
   PLUGGABLE LEVEL GENERATION
   Each theme selects a generator via theme.archetype. Boss floors are
   handled separately (generateBossArena) before this is called. Add new
   archetypes ('caves', 'office', ...) as additional cases here.
   ═══════════════════════════════════════════ */
function generateLevel(theme, w, h) {
  poolRects = []; // only generatePools fills this; everyone else has no basins
  switch (theme.archetype) {
    case 'pools':
      generatePools(w, h, theme);
      break;
    case 'open':
      generateOpen(w, h);
      break;
    case 'field':
      generateField(w, h);
      break;
    case 'linear':
      generateLinear(w, h);
      break;
    case 'chambers':
      generateChambers(w, h, theme);
      break;
    case 'rooms':
    default:
      generateMaze(w, h, theme);
      break;
  }
}

// 'pools' archetype — interconnected POOL HALLS (Poolrooms / Dark Pools).
// An irregular hall grid (jittered column/row boundaries → varying hall sizes)
// is carved fully open; every adjacent pair of halls connects through a WIDE
// 2-4-cell archway punched in the shared wall (open flow, not maze corridors).
// Most halls get a SUNKEN POOL BASIN: cell value 2 = walkable lowered floor at
// y = -theme.water.depth, rendered as water by buildPoolsGeometry. Pools are
// inset >=1 cell from the hall edge, so a dry tiled DECK rings every basin —
// the deck network (value 1) alone is connected by construction (ring +
// archways + grid-connected hall graph), so pools can never gate progress and
// spawn (1,1) + the exit (pickExitCell draws from value-1 cells only) always
// sit on dry deck. Big pools sometimes
// keep a 1-cell deck BRIDGE across the middle (reads as a raised walkway
// between two pools). Pool rects are recorded in poolRects for the renderer.
// Grid contract grows: 0 = wall, 1 = deck floor, 2 = pool basin. Seeded rng()
// only → co-op machines regenerate the identical grid.
function generatePools(w, h, theme) {
  const G = (theme && theme.genParams) || {};
  const ri = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
  const gw = w * 2 + 1, gh = h * 2 + 1;

  mazeGrid = [];
  for (let y = 0; y < gh; y++) { mazeGrid[y] = []; for (let x = 0; x < gw; x++) mazeGrid[y][x] = 0; }

  // 1. Hall grid with jittered boundaries. Clamped so halls stay >=4 wide
  // (1-cell deck ring + a >=2-cell pool needs 4).
  let cols = G.cols ? ri(G.cols[0], G.cols[1]) : 2 + (rng() < 0.5 ? 1 : 0);
  let rows = G.rows ? ri(G.rows[0], G.rows[1]) : 2;
  const innerW = gw - 2, innerH = gh - 2;
  while (cols > 2 && Math.floor((innerW - (cols - 1)) / cols) < 5) cols--;
  while (rows > 2 && Math.floor((innerH - (rows - 1)) / rows) < 5) rows--;
  const colB = [], rowB = []; // wall line positions between halls
  for (let c = 1; c < cols; c++) colB.push(Math.round((innerW + 1) * c / cols) + ri(-1, 1));
  for (let r = 1; r < rows; r++) rowB.push(Math.round((innerH + 1) * r / rows) + ri(-1, 1));

  // Hall rects from the boundary lines.
  const x0s = [1, ...colB.map(b => b + 1)], x1s = [...colB.map(b => b - 1), gw - 2];
  const y0s = [1, ...rowB.map(b => b + 1)], y1s = [...rowB.map(b => b - 1), gh - 2];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    for (let y = y0s[r]; y <= y1s[r]; y++) for (let x = x0s[c]; x <= x1s[c]; x++) mazeGrid[y][x] = 1;
  }

  // 2. Wide archways through every shared wall (hall graph = connected grid).
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (c < cols - 1) { // right neighbour, opening along the shared column
      const wx = colB[c], lo = y0s[r], hi = y1s[r];
      const span = hi - lo + 1, aw = Math.min(span, ri(2, 4));
      const start = lo + ri(0, span - aw);
      for (let k = 0; k < aw; k++) mazeGrid[start + k][wx] = 1;
    }
    if (r < rows - 1) { // neighbour below, opening along the shared row
      const wy = rowB[r], lo = x0s[c], hi = x1s[c];
      const span = hi - lo + 1, aw = Math.min(span, ri(2, 4));
      const start = lo + ri(0, span - aw);
      for (let k = 0; k < aw; k++) mazeGrid[wy][start + k] = 1;
    }
  }

  // 3. Sunken pools: inset >=1 cell from the hall edge (deck ring survives).
  const poolChance = G.poolChance !== undefined ? G.poolChance : 0.85;
  const bridgeChance = G.bridgeChance !== undefined ? G.bridgeChance : 0.5;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const hx0 = x0s[c], hx1 = x1s[c], hy0 = y0s[r], hy1 = y1s[r];
    const hw = hx1 - hx0 + 1, hh = hy1 - hy0 + 1;
    if (hw < 4 || hh < 4 || rng() >= poolChance) continue;
    // jittered inset for varying pool sizes/positions inside the hall
    const px0 = hx0 + 1 + (hw > 5 ? ri(0, 1) : 0);
    const px1 = hx1 - 1 - (hw > 5 ? ri(0, 1) : 0);
    const py0 = hy0 + 1 + (hh > 5 ? ri(0, 1) : 0);
    const py1 = hy1 - 1 - (hh > 5 ? ri(0, 1) : 0);
    if (px1 - px0 < 1 || py1 - py0 < 1) continue; // pools are >=2x2 cells
    for (let y = py0; y <= py1; y++) for (let x = px0; x <= px1; x++) mazeGrid[y][x] = 2;
    // Raised walkway: a 1-cell deck bridge across the middle of a big pool,
    // splitting it into two recorded basins (each gets its own water + lips).
    const pw = px1 - px0 + 1, ph = py1 - py0 + 1;
    if ((pw >= 4 || ph >= 4) && rng() < bridgeChance) {
      if (pw >= ph) {
        const bx = px0 + 1 + ri(0, pw - 3); // keeps >=1 pool cell each side
        for (let y = py0; y <= py1; y++) mazeGrid[y][bx] = 1;
        poolRects.push({ x0: px0, y0: py0, x1: bx - 1, y1: py1 });
        poolRects.push({ x0: bx + 1, y0: py0, x1: px1, y1: py1 });
      } else {
        const by = py0 + 1 + ri(0, ph - 3);
        for (let x = px0; x <= px1; x++) mazeGrid[by][x] = 1;
        poolRects.push({ x0: px0, y0: py0, x1: px1, y1: by - 1 });
        poolRects.push({ x0: px0, y0: by + 1, x1: px1, y1: py1 });
      }
    } else {
      poolRects.push({ x0: px0, y0: py0, x1: px1, y1: py1 });
    }
  }
}

// 'chambers' archetype — interconnected ROOMS instead of maze corridors. The grid is
// split into a small grid of large rectangular rooms (2x2 or 3x2); each room is open
// floor walled off from its neighbours, and every adjacent pair of rooms is linked by
// 1-2 doorway gaps punched through the shared wall. Connecting EVERY adjacent pair makes
// the room-adjacency graph a fully-connected grid → guaranteed flood-fill connected.
// Same mazeGrid contract (0=wall, 1=floor); spawn (1,1) lands inside the first
// room (the exit is seeded-random via pickExitCell). Deterministic via rng().
function generateChambers(w, h, theme) {
  const gw = w * 2 + 1, gh = h * 2 + 1;

  // 1. Solid everywhere; rooms get carved out below.
  mazeGrid = [];
  for (let y = 0; y < gh; y++) { mazeGrid[y] = []; for (let x = 0; x < gw; x++) mazeGrid[y][x] = 0; }

  // 2. Room grid. Default: 2-3 columns x 2 rows of big halls. Themes can shape
  // the grid via genParams.cols/rows [min,max] (e.g. Hospital 3-4x2-3 = wards,
  // Poolrooms 2-3x2 = big pool halls). Clamped so rooms stay >=3 cells wide.
  const G = (theme && theme.genParams) || {};
  const ri = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
  let cols = G.cols ? ri(G.cols[0], G.cols[1]) : 2 + (rng() < 0.5 ? 1 : 0);
  let rows = G.rows ? ri(G.rows[0], G.rows[1]) : 2;
  const innerW = gw - 2, innerH = gh - 2;                 // playable band is indices 1..gw-2 / 1..gh-2
  while (cols > 2 && Math.floor((innerW - (cols - 1)) / cols) < 3) cols--;
  while (rows > 2 && Math.floor((innerH - (rows - 1)) / rows) < 3) rows--;
  const colW = Math.floor((innerW - (cols - 1)) / cols);  // room width  (1-cell wall between cols)
  const rowH = Math.floor((innerH - (rows - 1)) / rows);  // room height (1-cell wall between rows)

  // Room interior rectangles. The last col/row stretches to gw-2 / gh-2 to absorb any
  // remainder, so the far corner (pickExitCell's fallback) is always inside the
  // bottom-right room.
  const rooms = []; // rooms[r][c] = {x0,x1,y0,y1}
  for (let r = 0; r < rows; r++) {
    rooms[r] = [];
    for (let c = 0; c < cols; c++) {
      const x0 = 1 + c * (colW + 1);
      const y0 = 1 + r * (rowH + 1);
      const x1 = (c === cols - 1) ? gw - 2 : x0 + colW - 1;
      const y1 = (r === rows - 1) ? gh - 2 : y0 + rowH - 1;
      rooms[r][c] = { x0, x1, y0, y1 };
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) mazeGrid[y][x] = 1;
    }
  }

  // Punch 1-2 doorway gaps (each 1-2 cells wide) through a shared wall. `along` lists the
  // valid coordinates on the wall; `set(p)` carves the wall cell at parametric position p.
  const punch = (lo, hi, set) => {
    const doors = 1 + Math.floor(rng() * 2); // 1 or 2 doorways
    for (let d = 0; d < doors; d++) {
      const width = 1 + Math.floor(rng() * 2);            // 1-2 cells wide
      const span = hi - lo;
      const start = lo + Math.floor(rng() * Math.max(1, span - width + 1));
      for (let k = 0; k < width && start + k <= hi; k++) set(start + k);
    }
  };

  // 3. Connect every adjacent room pair (→ guaranteed connectivity).
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const room = rooms[r][c];
      if (c < cols - 1) {                                  // shared wall with right neighbour
        const wx = room.x1 + 1;                            // the wall column between them
        punch(room.y0, room.y1, p => { mazeGrid[p][wx] = 1; });
      }
      if (r < rows - 1) {                                  // shared wall with room below
        const wy = room.y1 + 1;                            // the wall row between them
        punch(room.x0, room.x1, p => { mazeGrid[wy][p] = 1; });
      }
    }
  }
}

// 'open' archetype — Backrooms suburbs: open ground with scattered isolated
// "house" blocks (walls) and streets between them. Same mazeGrid contract as
// generateMaze (0 = wall, 1 = floor) so the existing mazeWalls collision and
// exit-zone placement work unchanged. Deterministic via the seeded rng().
function generateOpen(w, h) {
  const gw = w * 2 + 1, gh = h * 2 + 1;

  // 1. Whole grid is open floor...
  mazeGrid = [];
  for (let y = 0; y < gh; y++) { mazeGrid[y] = []; for (let x = 0; x < gw; x++) mazeGrid[y][x] = 1; }
  // ...with a solid wall border around the edge.
  for (let x = 0; x < gw; x++) { mazeGrid[0][x] = 0; mazeGrid[gh - 1][x] = 0; }
  for (let y = 0; y < gh; y++) { mazeGrid[y][0] = 0; mazeGrid[y][gw - 1] = 0; }

  // Keep-out spots that must stay open: player spawn (1,1) and the far corner
  // (pickExitCell's degenerate-grid fallback; the real exit is seeded-random).
  const keepClear = [{ x: 1, y: 1 }, { x: gw - 2, y: gh - 2 }];
  const CLEAR_PAD = 2;
  function hitsKeepout(hx, hy, hw, hh) {
    for (const s of keepClear) {
      if (s.x >= hx - CLEAR_PAD && s.x <= hx + hw - 1 + CLEAR_PAD &&
          s.y >= hy - CLEAR_PAD && s.y <= hy + hh - 1 + CLEAR_PAD) return true;
    }
    return false;
  }

  // 2. Scatter several rectangular house blocks (wall=0). Houses are isolated
  //    with a >=1-cell street gap, so the surrounding open ground stays connected.
  const numHouses = 5 + Math.floor(rng() * 5); // 5..9
  const placed = [];
  let attempts = 0;
  while (placed.length < numHouses && attempts < numHouses * 25) {
    attempts++;
    const hw = 3 + Math.floor(rng() * 3); // 3..5 cells
    const hh = 3 + Math.floor(rng() * 3); // 3..5 cells
    // Leave a 2-cell margin from the border so streets ring every house.
    const spanX = gw - hw - 4, spanY = gh - hh - 4;
    if (spanX < 1 || spanY < 1) break; // grid too small for this house size
    const hx = 2 + Math.floor(rng() * spanX);
    const hy = 2 + Math.floor(rng() * spanY);
    if (hitsKeepout(hx, hy, hw, hh)) continue;
    // Require a 1-cell street gap from already-placed houses (inflate by 1 and test overlap).
    let clash = false;
    for (const p of placed) {
      if (hx - 1 < p.x + p.w && hx + hw + 1 > p.x && hy - 1 < p.y + p.h && hy + hh + 1 > p.y) { clash = true; break; }
    }
    if (clash) continue;
    for (let dy = 0; dy < hh; dy++) for (let dx = 0; dx < hw; dx++) mazeGrid[hy + dy][hx + dx] = 0;
    placed.push({ x: hx, y: hy, w: hw, h: hh });
  }
}

// 'field' archetype — Backrooms wheat field: a near-empty expanse of open ground
// with only a FEW tiny scattered obstacles (the occasional shed/object). Emptier
// and more open than 'open'. Same mazeGrid contract (0 = wall, 1 = floor) and the
// same flood-fill-safe approach as generateOpen: every obstacle is isolated with a
// >=1-cell gap, so the surrounding open ground stays fully connected. Deterministic
// via the seeded rng().
function generateField(w, h) {
  const gw = w * 2 + 1, gh = h * 2 + 1;

  // 1. Whole grid is open floor...
  mazeGrid = [];
  for (let y = 0; y < gh; y++) { mazeGrid[y] = []; for (let x = 0; x < gw; x++) mazeGrid[y][x] = 1; }
  // ...with a solid wall border around the edge.
  for (let x = 0; x < gw; x++) { mazeGrid[0][x] = 0; mazeGrid[gh - 1][x] = 0; }
  for (let y = 0; y < gh; y++) { mazeGrid[y][0] = 0; mazeGrid[y][gw - 1] = 0; }

  // Keep-out spots that must stay open: player spawn (1,1) and the far corner
  // (pickExitCell's degenerate-grid fallback; the real exit is seeded-random).
  const keepClear = [{ x: 1, y: 1 }, { x: gw - 2, y: gh - 2 }];
  const CLEAR_PAD = 2;
  function hitsKeepout(hx, hy, hw, hh) {
    for (const s of keepClear) {
      if (s.x >= hx - CLEAR_PAD && s.x <= hx + hw - 1 + CLEAR_PAD &&
          s.y >= hy - CLEAR_PAD && s.y <= hy + hh - 1 + CLEAR_PAD) return true;
    }
    return false;
  }

  // 2. Scatter only a FEW tiny obstacles (wall=0), 1x1 or 2x2. Each is isolated
  //    with a >=1-cell gap, so the open ground stays one connected region.
  const numObstacles = 2 + Math.floor(rng() * 3); // 2..4 tiny clusters
  const placed = [];
  let attempts = 0;
  while (placed.length < numObstacles && attempts < numObstacles * 25) {
    attempts++;
    const sz = 1 + Math.floor(rng() * 2); // 1..2 cells (square)
    const hw = sz, hh = sz;
    // Leave a 2-cell margin from the border so open ground rings every obstacle.
    const spanX = gw - hw - 4, spanY = gh - hh - 4;
    if (spanX < 1 || spanY < 1) break; // grid too small
    const hx = 2 + Math.floor(rng() * spanX);
    const hy = 2 + Math.floor(rng() * spanY);
    if (hitsKeepout(hx, hy, hw, hh)) continue;
    // Require a 1-cell gap from already-placed obstacles (inflate by 1 and test overlap).
    let clash = false;
    for (const p of placed) {
      if (hx - 1 < p.x + p.w && hx + hw + 1 > p.x && hy - 1 < p.y + p.h && hy + hh + 1 > p.y) { clash = true; break; }
    }
    if (clash) continue;
    for (let dy = 0; dy < hh; dy++) for (let dx = 0; dx < hw; dx++) mazeGrid[hy + dy][hx + dx] = 0;
    placed.push({ x: hx, y: hy, w: hw, h: hh });
  }
}

// 'linear' archetype — Backrooms endless bus: one long claustrophobic corridor.
// A center aisle runs the full LENGTH of the grid with rows of "seat" blocks down
// both sides. The grid is forced NARROW (fixed width) and LONG (length scales with
// h), ignoring the square w/h the caller passes. Same mazeGrid contract (0 = wall,
// 1 = floor). Flood-fill safe: the 3-wide center aisle (x = 3,4,5) is never touched
// by seats, so it's connected end to end. Deterministic via the seeded rng().
function generateLinear(w, h) {
  const gw = 5;                              // NARROW bus: x 0..4, interior 1..3
  const len = Math.min(Math.max(h, 8), 16);  // length scales with h, clamped
  const gh = len * 3 + 1;                    // shorter corridor (~25..49 cells, was len*6+1)

  // 1. Whole grid open floor...
  mazeGrid = [];
  for (let y = 0; y < gh; y++) { mazeGrid[y] = []; for (let x = 0; x < gw; x++) mazeGrid[y][x] = 1; }
  // ...with a solid wall border (the bus body shell) around the outside.
  for (let x = 0; x < gw; x++) { mazeGrid[0][x] = 0; mazeGrid[gh - 1][x] = 0; }
  for (let y = 0; y < gh; y++) { mazeGrid[y][0] = 0; mazeGrid[y][gw - 1] = 0; }

  // 2. Seat benches line BOTH walls in short rows with small gaps, leaving only the
  //    1-cell CENTER AISLE (x = 2) open end-to-end — a tight bus tunnel. Left bench is
  //    x = 1, right bench x = gw-2 (= 3); both sit right against the border walls
  //    (x = 0 / x = 4) so the walls feel close. Front rows (spawn at 1,1) and back rows
  //    (exit at gw-2,gh-2) are kept clear so both ends stay open. Aisle x=2 is never
  //    touched, so the corridor is flood-fill connected end to end.
  // CONTINUOUS, REGULAR seat rhythm down BOTH walls, mirrored left↔right, so the whole
  // corridor reads like a bus aisle top to bottom. Fixed period (no randomness, no
  // patchy stretches): a SEAT_LEN-cell seat block, then a GAP-cell legroom gap, repeated
  // from FRONT to BACK on x=1 (left) and x=gw-2 (right). Only the front (spawn) and back
  // (exit) get a small clearance; everything between is seated.
  const FRONT = 3;            // rows 1..2 clear for spawn / driver area
  const BACK = gh - 3;        // last 2 rows clear for the rear-door exit
  const SEAT_LEN = 2;         // each seat block is 2 cells deep
  const GAP = 1;              // single-cell legroom gap between blocks
  for (let y = FRONT; y + SEAT_LEN <= BACK; y += SEAT_LEN + GAP) {
    for (let dy = 0; dy < SEAT_LEN; dy++) {
      mazeGrid[y + dy][1] = 0;          // left bench (against x=0 wall)
      mazeGrid[y + dy][gw - 2] = 0;     // right bench (x=3, against x=4 wall) — mirrored
    }
  }
}

/* ═══════════════════════════════════════════
   EXIT PLACEMENT — seeded random, far from spawn
   Replaces the old fixed corner search from (gw-2, gh-2): BFS the walkable
   deck (mazeGrid === 1 — the same 4-neighbor space players move through, so
   pool basins (2) are automatically excluded → dry deck) from spawn (1,1),
   then draw with the seeded rng() from the top 25% of reachable cells by
   path distance. 'linear' floors restrict to the rear-clearance rows that
   generateLinear keeps seat-free, so the exit stays a rear-door.
   DETERMINISM: called at a FIXED point in the build order on every machine
   (buildMazeScene, before spawnAmmoPickups) and consumes exactly ONE rng()
   draw on every path — co-op machines agree on the cell. The fog-of-war
   minimap already hides the exit until its cell is discovered.
   ═══════════════════════════════════════════ */
function pickExitCell(theme) {
  const gh = mazeGrid.length, gw = mazeGrid[0].length;

  // BFS distances from spawn over deck cells.
  const dist = [];
  for (let y = 0; y < gh; y++) dist.push(new Array(gw).fill(-1));
  if (mazeGrid[1] && mazeGrid[1][1] === 1) {
    dist[1][1] = 0;
    const q = [[1, 1]];
    for (let qi = 0; qi < q.length; qi++) {
      const [x, y] = q[qi], d = dist[y][x] + 1;
      if (y > 0 && mazeGrid[y - 1][x] === 1 && dist[y - 1][x] < 0) { dist[y - 1][x] = d; q.push([x, y - 1]); }
      if (y < gh - 1 && mazeGrid[y + 1][x] === 1 && dist[y + 1][x] < 0) { dist[y + 1][x] = d; q.push([x, y + 1]); }
      if (x > 0 && mazeGrid[y][x - 1] === 1 && dist[y][x - 1] < 0) { dist[y][x - 1] = d; q.push([x - 1, y]); }
      if (x < gw - 1 && mazeGrid[y][x + 1] === 1 && dist[y][x + 1] < 0) { dist[y][x + 1] = d; q.push([x + 1, y]); }
    }
  }

  // Reachable candidates in scan order (deterministic), spawn cell excluded.
  const cands = [];
  for (let y = 1; y < gh - 1; y++) for (let x = 1; x < gw - 1; x++) {
    if (dist[y][x] > 0) cands.push({ x, y, d: dist[y][x] });
  }

  let pool;
  if (theme && theme.archetype === 'linear') {
    pool = cands.filter(c => c.y >= gh - 3); // rear-door rows (kept clear by generateLinear)
  } else {
    // Top 25% by path distance; ties broken by scan order for determinism.
    cands.sort((a, b) => b.d - a.d || a.y - b.y || a.x - b.x);
    pool = cands.slice(0, Math.max(1, Math.ceil(cands.length * 0.25)));
  }
  if (pool.length) {
    const pick = pool[Math.floor(rng() * pool.length)];
    return { ex: pick.x, ey: pick.y };
  }

  // Legacy corner fallback — only reachable if the grid is degenerate (spawn
  // sealed), which the generators' connectivity guarantees prevent. Burn the
  // rng() draw anyway so the stream stays aligned across machines regardless.
  rng();
  let ex = gw - 2, ey = gh - 2;
  for (let dy = 0; dy > -6; dy--) {
    let found = false;
    for (let dx = 0; dx > -6; dx--) {
      if (ey + dy >= 0 && ex + dx >= 0 && ey + dy < gh && ex + dx < gw && mazeGrid[ey + dy][ex + dx] === 1) {
        ex = ex + dx; ey = ey + dy; found = true; break;
      }
    }
    if (found) break;
  }
  return { ex, ey };
}

/* ═══════════════════════════════════════════
   3D GUN MODEL
   ═══════════════════════════════════════════ */
function createGun() {
  if (gunGroup) {
    // The gun is rebuilt every floor — dispose the old one's ~24 geometries
    // and materials or they accumulate in VRAM per floor.
    gunGroup.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach(m => m.dispose());
      }
    });
    camera.remove(gunGroup);
  }

  gunGroup = new THREE.Group();

  const gunMetal = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.4, metalness: 0.8 });
  const gunMetalDark = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.3, metalness: 0.9 });
  const gripMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.85, metalness: 0.1 });
  const sightMat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.3, metalness: 0.9 });

  const slide = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.05, 0.28), gunMetal);
  slide.position.set(0, 0.015, -0.06);
  gunGroup.add(slide);

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.08, 8), gunMetalDark);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.005, -0.24);
  gunGroup.add(barrel);

  const shroud = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.06), gunMetal);
  shroud.position.set(0, 0.0, -0.22);
  gunGroup.add(shroud);

  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.03, 0.2), gunMetal);
  frame.position.set(0, -0.02, -0.04);
  gunGroup.add(frame);

  const tGuard = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.003, 0.05), gunMetal);
  tGuard.position.set(0, -0.045, -0.05);
  gunGroup.add(tGuard);
  const tGuardF = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.025, 0.003), gunMetal);
  tGuardF.position.set(0, -0.034, -0.075);
  gunGroup.add(tGuardF);
  const tGuardB = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.015, 0.003), gunMetal);
  tGuardB.position.set(0, -0.038, -0.025);
  gunGroup.add(tGuardB);

  const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.018, 0.004), new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.9, roughness: 0.2 }));
  trigger.position.set(0, -0.035, -0.048);
  gunGroup.add(trigger);

  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.09, 0.04), gripMat);
  grip.position.set(0, -0.075, -0.01);
  grip.rotation.x = 0.15;
  gunGroup.add(grip);

  for (let i = 0; i < 5; i++) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.002, 0.042), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 }));
    line.position.set(0, -0.04 - i * 0.015, -0.01);
    line.rotation.x = 0.15;
    gunGroup.add(line);
  }

  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.034), gunMetalDark);
  mag.position.set(0, -0.12, -0.008);
  mag.rotation.x = 0.15;
  gunGroup.add(mag);

  const fSight = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.015, 0.006), sightMat);
  fSight.position.set(0, 0.048, -0.17);
  gunGroup.add(fSight);

  const rSightL = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.012, 0.006), sightMat);
  rSightL.position.set(-0.012, 0.046, 0.06);
  gunGroup.add(rSightL);
  const rSightR = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.012, 0.006), sightMat);
  rSightR.position.set(0.012, 0.046, 0.06);
  gunGroup.add(rSightR);

  for (let i = 0; i < 6; i++) {
    const ser = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.003, 0.002), gunMetalDark);
    ser.position.set(0, 0.035, 0.02 + i * 0.012);
    gunGroup.add(ser);
  }

  const ePort = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.004, 0.04), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2, metalness: 1.0 }));
  ePort.position.set(0.015, 0.038, -0.02);
  gunGroup.add(ePort);

  // Muzzle flash light (attached to gun)
  muzzleFlashLight = new THREE.PointLight(0xffaa44, 0, 12);
  muzzleFlashLight.position.set(0, 0, -0.3);
  gunGroup.add(muzzleFlashLight);

  // Position gun in default (hip) view
  gunGroup.position.set(DEFAULT_GUN_POS.x, DEFAULT_GUN_POS.y, DEFAULT_GUN_POS.z);
  gunGroup.rotation.set(0, 0, 0);

  camera.add(gunGroup);
}

function updateGun(dt, isMoving, isSprinting) {
  if (!gunGroup) return;

  // Recoil recovery (gun-only, NOT camera)
  gunRecoil *= 0.82;

  // ADS interpolation
  if (player.isADS) {
    adsLerp = Math.min(1, adsLerp + dt * ADS_LERP_SPEED);
  } else {
    adsLerp = Math.max(0, adsLerp - dt * ADS_LERP_SPEED);
  }

  // Gun sway from movement (reduced in ADS)
  const adsSway = 1 - adsLerp * 0.85;
  if (isMoving) {
    const bobPhase = clock.getElapsedTime() * (isSprinting ? 12 : 8);
    gunSwayX = Math.sin(bobPhase * 0.8) * 0.008 * (isSprinting ? 1.5 : 1.0) * adsSway;
    gunSwayY = Math.cos(bobPhase * 1.6) * 0.005 * (isSprinting ? 1.5 : 1.0) * adsSway;
  } else {
    gunSwayX *= 0.92;
    gunSwayY *= 0.92;
  }

  // Idle sway (reduced in ADS)
  const t = clock.getElapsedTime();
  const idleX = Math.sin(t * 1.2) * 0.001 * adsSway;
  const idleY = Math.cos(t * 0.9) * 0.0008 * adsSway;

  // Lerp gun position between hip and ADS
  const targetX = DEFAULT_GUN_POS.x + (ADS_GUN_POS.x - DEFAULT_GUN_POS.x) * adsLerp;
  const targetY = DEFAULT_GUN_POS.y + (ADS_GUN_POS.y - DEFAULT_GUN_POS.y) * adsLerp;
  const targetZ = DEFAULT_GUN_POS.z + (ADS_GUN_POS.z - DEFAULT_GUN_POS.z) * adsLerp;

  gunGroup.position.set(
    targetX + gunSwayX + idleX,
    targetY + gunSwayY + idleY - gunRecoil * 0.15,
    targetZ + gunRecoil * 0.08
  );

  gunGroup.rotation.set(
    -gunRecoil * 0.6,
    (gunSwayX * 3 + idleX * 2) * adsSway,
    0
  );

  // Muzzle flash light
  if (muzzleFlashTimer > 0) {
    muzzleFlashTimer -= dt;
    muzzleFlashLight.intensity = muzzleFlashTimer * 60;
  } else {
    muzzleFlashLight.intensity = 0;
  }
}

/* ═══════════════════════════════════════════
   FLASHLIGHT
   ═══════════════════════════════════════════ */
function createFlashlight() {
  if (flashlight) camera.remove(flashlight);
  flashlight = new THREE.SpotLight(0xfff5e0, 1.2, 40, Math.PI * 0.18, 0.4, 1.5);
  flashlight.position.set(0, -0.05, -0.1);
  flashlight.target.position.set(0, -0.05, -10);
  // Shadows OFF deliberately: a shadow-casting spotlight allocates + renders a shadow
  // map on first use (a lag spike) and costs an extra depth pass every frame after.
  // The flashlight is a cosmetic cone, not a shadow-caster, so we skip all of that.
  flashlight.castShadow = false;
  camera.add(flashlight);
  camera.add(flashlight.target);
  flashlight.visible = flashlightOn;
  // NOTE: the shader warm-up is NOT done here. createFlashlight() runs BEFORE the
  // scene's point lights are added, so compiling now would cache the wrong variant
  // (0 point lights). warmUpFlashlight() is called at the END of buildMazeScene,
  // once the real point-light count is in place.
}

// Pre-compile the flashlight's shader variants so the first in-game toggle is instant.
// Must run AFTER every scene PointLight is added, so the compiled programs match real
// gameplay: N point lights with the spot ON and with it OFF. We compile BOTH states
// (an actual render, not just renderer.compile, to defeat drivers that defer the real
// shader compile until the first draw call — that deferral was the lingering 2nd spike).
//
// The two renders are NO LONGER done synchronously in the transition frame: each is
// scheduled on its own requestAnimationFrame, so the old one-frame double-compile
// hitch becomes two half-hitches on the next two frames — hidden behind the 4-second
// floor-announce card that goes up in the same transition. Each warm-up render is
// scissored to a single pixel: the draw calls still execute (forcing the driver-side
// compile) but they cost almost nothing and can't flash a flashlight-ON frame at the
// player (animate() renders earlier in the same rAF cycle and keeps the canvas).
function warmUpFlashlight() {
  if (!renderer || !flashlight) return;
  const token = ++flashlightWarmupToken; // a rebuild before both frames run cancels the stale ones

  const warmRender = (spotVisible) => {
    const prev = flashlight.visible;
    flashlight.visible = spotVisible;
    renderer.setScissorTest(true);
    renderer.setScissor(0, 0, 1, 1);
    renderer.render(scene, camera);
    renderer.setScissorTest(false);
    flashlight.visible = prev;
  };

  requestAnimationFrame(() => {
    if (token !== flashlightWarmupToken || !flashlight) return;
    warmRender(true);                       // announce frame 1: spot-ON variant
    requestAnimationFrame(() => {
      if (token !== flashlightWarmupToken || !flashlight) return;
      warmRender(false);                    // announce frame 2: spot-OFF variant
    });
  });
}

// ── PROGRAM KEEPALIVE ──
// three.js destroys a shader program when the last material using it is disposed
// (usedTimes hits 0). buildMazeScene disposes every world material on teardown, so
// even with a fixed light count the textured "standard" programs would die and
// recompile every floor. These four micro-meshes (0.1mm, parked in front of the
// camera, never disposed) each pin one heavy program family alive for the session:
//   1. MeshStandardMaterial + map               (floors/ceilings/decorations)
//   2. MeshStandardMaterial + map, DoubleSide   (walls)
//   3. SpriteMaterial + map                     (mobs)
//   4. SpriteMaterial + map + alphaTest 0.1     (bosses)
// (MeshStandardMaterial WITHOUT a map is already pinned by the never-disposed
// ammoPickupMat.) They ride the camera — scene.remove(camera) runs before the
// teardown traverse, so they're spared — and cost 4 sub-pixel draw calls a frame.
function createProgramKeepalive() {
  programKeepalive = new THREE.Group();
  const tex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
  // sRGB to MATCH the world textures (texMarkSRGB): map encoding is part of the
  // program cache key, so a linear pin here would pin the WRONG variants and
  // every floor would recompile. White decodes to white — visually a no-op.
  tex.encoding = THREE.sRGBEncoding;
  tex.needsUpdate = true;
  const quad = new THREE.PlaneGeometry(1, 1);
  const pin = (obj) => {
    obj.scale.setScalar(0.0001);
    obj.position.set(0, 0, -0.5);
    obj.frustumCulled = false; // must actually DRAW every frame, never get culled
    programKeepalive.add(obj);
  };
  pin(new THREE.Mesh(quad, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0.05 })));
  pin(new THREE.Mesh(quad, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0.05, side: THREE.DoubleSide })));
  pin(new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })));
  pin(new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.1, depthWrite: false })));
  //   5. MeshBasicMaterial + map, DoubleSide   (pool caustics — the ONE new
  //      program family the water system adds; water itself reuses family 2)
  pin(new THREE.Mesh(quad, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide })));
  camera.add(programKeepalive);
}

function toggleFlashlight() {
  flashlightOn = !flashlightOn;
  if (flashlight) flashlight.visible = flashlightOn;
  playFlashlightClick();
  updateFlashlightHUD();
}

function updateFlashlightHUD() {
  const el = document.getElementById('hudFlashlight');
  if (flashlightOn) {
    el.style.color = 'rgba(255,220,120,0.7)';
    el.textContent = '● FLASHLIGHT ON';
  } else {
    el.style.color = 'rgba(255,220,120,0.25)';
    el.textContent = '○ FLASHLIGHT [F]';
  }
}

/* ═══════════════════════════════════════════
   AMMO PICKUPS
   Small glowing canisters on the floor. Emissive material ONLY — deliberately
   no PointLight, so the scene's light count (and thus the compiled shader
   variants) stays stable. One shared geometry+material → 1 draw call each.
   Floor spawns use the SEEDED rng() so placement is deterministic per floor
   (multiplayer-ready); enemy death drops use Math.random (combat isn't
   deterministic anyway).
   ═══════════════════════════════════════════ */
let ammoPickups = []; // { id, mesh, x, z, baseY, phase }
const AMMO_PICKUP_RADIUS = 1.1;      // world units — walk-over distance
const AMMO_DROP_CHANCE = 0.2;        // chance a killed enemy drops one
// MP: stable per-floor pickup ids. Seeded floor spawns consume the counter in
// the same order on every machine (same seed → same ids); host-authoritative
// kill-drops continue the sequence and ship their id in 'pickup_spawn'.
let ammoPickupNextId = 0;            // reset per floor in buildMazeScene

const ammoPickupGeo = new THREE.BoxGeometry(0.32, 0.22, 0.2);
const ammoPickupMat = new THREE.MeshStandardMaterial({
  color: 0x554411, emissive: 0xffcc33, emissiveIntensity: 0.9,
  roughness: 0.4, metalness: 0.3
});

function createAmmoPickup(wx, wz, id) {
  const mesh = new THREE.Mesh(ammoPickupGeo, ammoPickupMat);
  // Pools: a kill-drop over a basin sinks to the pool floor (same height on
  // every machine — floorHeightAt is grid-derived, and the grid is seeded).
  const baseY = 0.18 + floorHeightAt(wx, wz);
  mesh.position.set(wx, baseY, wz);
  scene.add(mesh);
  ammoPickups.push({ id, mesh, x: wx, z: wz, baseY, phase: ammoPickups.length * 1.7 });
}

// MP: a pickup consumed elsewhere (another player walked over it) vanishes
// here too — no ammo granted, it just disappears.
function removeAmmoPickupById(id) {
  const i = ammoPickups.findIndex(p => p.id === id);
  if (i === -1) return;
  scene.remove(ammoPickups[i].mesh);
  ammoPickups.splice(i, 1);
}

// 2-4 per floor at random OPEN cells, away from the player spawn. Called from
// buildMazeScene AFTER generation, so the rng() draw order — and therefore the
// placement — is reproducible from the floor seed.
function spawnAmmoPickups() {
  const gh = mazeGrid.length, gw = mazeGrid[0].length;
  const count = 2 + Math.floor(rng() * 3); // 2..4
  const used = new Set();
  for (let n = 0; n < count; n++) {
    for (let attempts = 0; attempts < 40; attempts++) {
      const rx = 1 + Math.floor(rng() * (gw - 2));
      const ry = 1 + Math.floor(rng() * (gh - 2));
      const key = ry + ',' + rx;
      // open cell, not reused, and at least ~3 cells from the spawn corner (1,1)
      if (mazeGrid[ry][rx] !== 1 || used.has(key)) continue;
      if (Math.abs(rx - 1) + Math.abs(ry - 1) < 3) continue;
      used.add(key);
      // Seeded order → every machine assigns the SAME id to the same pickup.
      createAmmoPickup(rx * CELL + CELL / 2, ry * CELL + CELL / 2, ++ammoPickupNextId);
      break;
    }
  }
}

// Spin/bob the canisters; pick up on walk-over. Full reserve = the pickup is
// LEFT on the ground (no wasted ammo), so the walk-over check repeats later.
function updateAmmoPickups(dt) {
  if (ammoPickups.length === 0) return;
  const t = clock.getElapsedTime();
  for (let i = ammoPickups.length - 1; i >= 0; i--) {
    const p = ammoPickups[i];
    p.mesh.rotation.y += dt * 2.0;
    p.mesh.position.y = p.baseY + Math.sin(t * 3 + p.phase) * 0.05;

    const dx = p.x - player.pos.x, dz = p.z - player.pos.z;
    if (dx * dx + dz * dz < AMMO_PICKUP_RADIUS * AMMO_PICKUP_RADIUS) {
      if (player.reserveAmmo >= shopStats.reserveMax) continue; // already full
      // +1 magazine of reserve, capped at the (possibly shop-upgraded) max
      player.reserveAmmo = Math.min(shopStats.reserveMax, player.reserveAmmo + shopStats.clipSize);
      playPickup();
      scene.remove(p.mesh);
      ammoPickups.splice(i, 1);
      netAnnouncePickupTaken(p.id); // MP: remove it on every other machine too
      updateHUD();
    }
  }
}

/* ═══════════════════════════════════════════
   RESOURCE DISPOSAL
   three.js never frees GPU resources on scene.remove() — geometry, materials
   and textures stay in VRAM until .dispose(). Ownership rules here:
   - GLB mob clones (userData.isModel): geometry is SHARED with modelCache →
     keep. Materials are per-instance clones → dispose. Their .map textures are
     reference-copied from the cache (material.dispose() leaves textures alone,
     which is exactly right).
   - Wire-figure fallbacks: geometry AND materials per-instance → dispose both.
   - Sprites (mobs, boss): ALL three.js Sprites share one static plane geometry
     → never dispose it; the material is per-instance → dispose (.map lives in
     the shared spriteTextures cache, untouched).
   - Rigged clones (aranea): each SkinnedMesh clone lazily allocates its own
     skeleton boneTexture on first render → dispose it or it leaks per spawn.
   ═══════════════════════════════════════════ */
function disposeMobVisual(mesh) {
  const sharedGeo = !!mesh.userData.isModel;
  mesh.traverse(o => {
    if (o.geometry && !sharedGeo && !o.isSprite) o.geometry.dispose();
    if (o.isSkinnedMesh && o.skeleton && o.skeleton.boneTexture) o.skeleton.boneTexture.dispose();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach(m => m.dispose());
    }
  });
}

/* ═══════════════════════════════════════════
   BUILD SCENE
   ═══════════════════════════════════════════ */
function buildMazeScene() {
  // ── TEARDOWN: dispose the old floor's GPU resources BEFORE dropping the
  // references (this was the audit's per-floor VRAM leak: 3 CanvasTextures +
  // all world geometry/materials every floor). Mixed-ownership objects first:
  for (const e of enemies) { removeDebugLabel(e); disposeMobVisual(e.mesh); scene.remove(e.mesh); }
  if (bossEntity && bossEntity.mesh) { removeDebugLabel(bossEntity); disposeMobVisual(bossEntity.mesh); scene.remove(bossEntity.mesh); }
  for (const p of bossProjectiles) { p.mesh.geometry.dispose(); p.mesh.material.dispose(); scene.remove(p.mesh); }
  // MP CLIENT: mirror mobs/boss/projectiles are mixed-ownership too (shared GLB
  // geometry!) — they must go through disposeMobVisual BEFORE the traverse below.
  netOnSceneTeardown();
  for (const t of bulletTrails) { t.mesh.geometry.dispose(); t.mesh.material.dispose(); scene.remove(t.mesh); }
  bulletTrails = [];
  for (const p of ammoPickups) scene.remove(p.mesh); // geometry/material are module-level SHARED — never disposed
  scene.remove(camera); // gun + flashlight persist across floors (createGun disposes the old gun itself)

  // Everything still in the scene is floor-owned world geometry (walls, floor,
  // ceiling, fixtures, decorations, exit). Dispose it all — including material
  // .map textures — EXCEPT textures tagged userData.themeCached: those are the
  // wall/floor/ceiling CanvasTextures, which are SHARED via themeTextureCache
  // (one set per theme id, alive for the whole session), not floor-owned.
  scene.traverse(o => {
    if (o.geometry && !o.isSprite) o.geometry.dispose();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach(m => {
        // r128 textures lack a default .userData — guard before reading the tag
        if (m.map && !(m.map.userData && m.map.userData.themeCached)) m.map.dispose();
        m.dispose();
      });
    }
  });

  while (scene.children.length > 0) scene.remove(scene.children[0]);
  mazeWalls = []; enemies = []; lights = []; flickerTimers = [];
  poolFx = null; poolWater = null; // pools materials died in the traverse above
  ammoPickups = [];
  bossEntity = null;
  bossProjectiles = [];

  const theme = getTheme(currentFloor);

  // Boss arenas are built TALL so the full boss sprite (2.0 * bossScale meters:
  // Warden 6m / Amalgam 7m / Hive 8m) fits below the ceiling instead of being
  // depth-clipped by it. Normal floors keep the standard claustrophobic WALL_H.
  // Only ceiling + wall geometry use roomH; lights/fixtures stay at WALL_H
  // (wall-mount height) so floor lighting is identical to before.
  const roomH = theme.isBoss ? Math.max(WALL_H, theme.bossScale * 2.0 + 0.8) : WALL_H;

  // Cached per theme id — generated on first visit, reused (same GPU texture,
  // no re-upload) on every revisit. SHARED, not floor-owned: see themeTextureCache.
  const { wall: wallTex, floor: floorTex, ceil: ceilTex } = getThemeTextures(theme);

  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.85, metalness: 0.05, side: THREE.DoubleSide });
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.9, metalness: 0.02 });
  const ceilMat = new THREE.MeshStandardMaterial({ map: ceilTex, roughness: 0.8, metalness: 0.0 });

  const gw = mazeGrid[0].length, gh = mazeGrid.length;

  // Floor. Pools floors swap the single slab for per-cell deck quads + sunken
  // basins + water/caustics (the old full-grid Poolrooms water plane is gone —
  // water now lives only inside the basins).
  if (theme.archetype === 'pools' && theme.water) {
    poolWater = theme.water; // physics/audio/decorations read this from here on
    buildPoolsGeometry(theme, gw, gh, floorMat, wallMat);
  } else {
    const floorGeo = new THREE.PlaneGeometry(gw * CELL, gh * CELL);
    floorGeo.rotateX(-Math.PI / 2);
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.position.set(gw * CELL / 2, 0, gh * CELL / 2);
    scene.add(floorMesh);
  }

  // Ceiling
  const ceilGeo = new THREE.PlaneGeometry(gw * CELL, gh * CELL);
  ceilGeo.rotateX(Math.PI / 2);
  const ceilMesh = new THREE.Mesh(ceilGeo, ceilMat);
  ceilMesh.position.set(gw * CELL / 2, roomH, gh * CELL / 2);
  scene.add(ceilMesh);

  // Walls (instanced) — roomH-tall on boss floors, WALL_H elsewhere
  const wallGeo = new THREE.BoxGeometry(CELL, roomH, CELL);
  const matrices = [];

  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    if (mazeGrid[y][x] === 0) {
      const m = new THREE.Matrix4();
      m.setPosition(x * CELL + CELL / 2, roomH / 2, y * CELL + CELL / 2);
      matrices.push(m);
      mazeWalls.push({ minX: x * CELL, maxX: x * CELL + CELL, minZ: y * CELL, maxZ: y * CELL + CELL });
    }
  }

  if (matrices.length > 0) {
    const iMesh = new THREE.InstancedMesh(wallGeo, wallMat, matrices.length);
    matrices.forEach((m, i) => iMesh.setMatrixAt(i, m));
    iMesh.instanceMatrix.needsUpdate = true;
    scene.add(iMesh);
  }

  // Decorations
  if (theme.decorations !== 'none') {
    addDecorations(theme, gw, gh);
  }

  // Lights — reduce for dark levels
  const darkMult = 1 - (theme.darknessLevel || 0) * 0.7;
  const ambLight = new THREE.AmbientLight(theme.ambientColor, theme.ambientIntensity * darkMult);
  scene.add(ambLight);

  scene.add(camera);
  createGun();
  createFlashlight();
  if (!programKeepalive) createProgramKeepalive(); // once per session; survives floor teardowns on the camera

  const lightSpacing = Math.max(4, 6 - Math.floor(theme.id === 3 ? -1 : (theme.darknessLevel || 0) * 2));
  // The maze generator only carves floor cells at odd/odd coordinates (plus odd/even
  // passages); it never carves even/even cells. With an even lightSpacing the sample
  // grid lands exclusively on even/even cells, so for Level 0 (spacing 6) every sample
  // hits a wall and no lights get placed. Snap each sample to the nearest open floor
  // cell so lighting is robust regardless of layout/seed.
  const litCells = new Set();
  // Fixture meshes are INSTANCED (one draw call for all of them) instead of one
  // separate Mesh per light — geometry + material are identical, so a single
  // InstancedMesh replaces what used to be 16-38 extra draw calls.
  const fixGeo = new THREE.BoxGeometry(0.8, 0.05, 0.22);
  const fixMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, emissive: theme.lightColor, emissiveIntensity: 0.4 * darkMult
  });
  const fixtureMatrices = [];

  // Place one ceiling PointLight + record its fixture instance at the given floor cell.
  const placeCeilingLight = (lx, ly) => {
    if (lights.length >= CEILING_LIGHT_BUDGET) return; // hard cap — the budget is FIXED
    const key = ly + ',' + lx;
    if (litCells.has(key)) return;     // avoid stacking two lights on one snapped cell
    litCells.add(key);

    const pl = new THREE.PointLight(theme.lightColor, theme.lightIntensity * darkMult, CELL * 5);
    pl.position.set(lx * CELL + CELL / 2, WALL_H - 0.2, ly * CELL + CELL / 2);
    scene.add(pl);
    lights.push(pl);

    const m = new THREE.Matrix4();
    m.setPosition(lx * CELL + CELL / 2, WALL_H - 0.03, ly * CELL + CELL / 2);
    fixtureMatrices.push(m);

    flickerTimers.push({ light: pl, base: pl.intensity, timer: Math.random() * 5, nextFlicker: 1 + Math.random() * 5 });
  };

  if (theme.archetype === 'linear') {
    // LINEAR corridor: decouple light count from corridor length. Place a single row
    // of evenly-spaced lights down the CENTER aisle, HARD-CAPPED so a long bus never
    // seeds dozens of lights (was 24-38). Step grows with length to honor the cap.
    const MAX_LINEAR_LIGHTS = 12;
    const aisleX = Math.floor(gw / 2);          // center aisle column (x=2 for gw=5)
    const first = 3, last = gh - 3;
    const span = Math.max(1, last - first);
    const step = Math.max(lightSpacing, Math.ceil(span / MAX_LINEAR_LIGHTS));
    for (let y = first; y <= last; y += step) {
      // snap to the nearest floor cell at/near the aisle column on this row
      let ly = -1, lx = aisleX;
      for (let r = 0; r <= 2 && ly === -1; r++) {
        for (let dx = -r; dx <= r && ly === -1; dx++) {
          const nx = aisleX + dx;
          if (nx >= 0 && nx < gw && mazeGrid[y][nx] === 1) { ly = y; lx = nx; break; }
        }
      }
      if (ly !== -1) placeCeilingLight(lx, ly);
    }
  } else {
    // Inflate the spacing on oversized late-loop floors so the sample grid can
    // never exceed the fixed ceiling-light budget (instead of letting the hard
    // cap in placeCeilingLight leave the far corner of a 41x41 grid unlit).
    let gridSpacing = lightSpacing;
    while (Math.ceil((gh - 2) / gridSpacing) * Math.ceil((gw - 2) / gridSpacing) > CEILING_LIGHT_BUDGET) gridSpacing++;
    for (let y = 2; y < gh; y += gridSpacing) for (let x = 2; x < gw; x += gridSpacing) {
      let ly = -1, lx = -1;
      for (let r = 0; r <= 2 && ly === -1; r++) {
        for (let dy = -r; dy <= r && ly === -1; dy++) for (let dx = -r; dx <= r; dx++) {
          const ny = y + dy, nx = x + dx;
          if (ny >= 0 && ny < gh && nx >= 0 && nx < gw && mazeGrid[ny][nx] === 1) {
            ly = ny; lx = nx; break;
          }
        }
      }
      if (ly !== -1) placeCeilingLight(lx, ly);
    }
  }

  if (fixtureMatrices.length > 0) {
    const fixMesh = new THREE.InstancedMesh(fixGeo, fixMat, fixtureMatrices.length);
    fixtureMatrices.forEach((m, i) => fixMesh.setMatrixAt(i, m));
    fixMesh.instanceMatrix.needsUpdate = true;
    scene.add(fixMesh);
  }

  // Pad the ceiling lights up to the FIXED budget: dead slots at intensity 0,
  // parked below the floor. They add nothing visually but keep the scene's
  // point-light count identical on every floor, so the shader programs compiled
  // on floor 0 are reused for the whole session. They must stay visible=true —
  // invisible lights drop out of three.js's light count (and the cache key).
  while (lights.length < CEILING_LIGHT_BUDGET) {
    const pad = new THREE.PointLight(0xffffff, 0, 0.01);
    pad.position.set(0, -100, 0);
    scene.add(pad);
    lights.push(pad);
  }

  // Persistent combat light slots — same idea as the muzzle flash: the boss glow
  // and projectile lights exist on EVERY floor at intensity 0 and are only ever
  // brightened/parked by enemies.js, never added/removed, so boss fights can't
  // change the light count mid-fight either.
  bossLight = new THREE.PointLight(0xff2200, 0, 10);
  bossLight.position.set(0, -100, 0);
  scene.add(bossLight);
  bossProjLights = [];
  for (let i = 0; i < BOSS_PROJ_LIGHT_COUNT; i++) {
    const l = new THREE.PointLight(0xff4400, 0, 5);
    l.position.set(0, -100, 0);
    scene.add(l);
    bossProjLights.push(l);
  }

  // Fog
  scene.fog = new THREE.Fog(theme.fogColor, theme.fogNear, theme.fogFar);
  scene.background = new THREE.Color(theme.bgColor);

  // Exit light is a persistent slot too: created on every floor — boss floors
  // park it dark until createBossExit (enemies.js) brightens it — so the exit
  // appearing after a boss kill can't change the light count.
  const exitColor = 0x44ff88;
  exitLight = new THREE.PointLight(exitColor, 0, CELL * 4);
  exitLight.position.set(0, -100, 0);
  scene.add(exitLight);

  // Exit zone (not on boss levels — boss must be killed first). Seeded random
  // placement far from spawn — see pickExitCell. Keep this BEFORE
  // spawnAmmoPickups: both consume the seeded rng() and the draw order must
  // be identical on every machine.
  if (!theme.isBoss) {
    const { ex, ey } = pickExitCell(theme);
    exitZone = { x: ex * CELL + CELL / 2, z: ey * CELL + CELL / 2, radius: CELL * 1.2 };

    const exitGeo = new THREE.CylinderGeometry(1.0, 1.0, 0.06, 20);
    const exitMat = new THREE.MeshStandardMaterial({ color: exitColor, emissive: exitColor, emissiveIntensity: 0.6, transparent: true, opacity: 0.5 });
    exitMesh = new THREE.Mesh(exitGeo, exitMat);
    exitMesh.position.set(exitZone.x, 0.06, exitZone.z);
    scene.add(exitMesh);

    exitLight.intensity = 0.8;
    exitLight.position.set(exitZone.x, 2, exitZone.z);

    const beaconGeo = new THREE.CylinderGeometry(0.05, 0.05, WALL_H, 8);
    const beaconMat = new THREE.MeshStandardMaterial({ color: exitColor, emissive: exitColor, emissiveIntensity: 0.5, transparent: true, opacity: 0.3 });
    const beacon = new THREE.Mesh(beaconGeo, beaconMat);
    beacon.position.set(exitZone.x, WALL_H / 2, exitZone.z);
    scene.add(beacon);
  } else {
    exitZone = null;
    exitMesh = null;
  }

  // Ammo pickups — seeded rng(), so keep this call AFTER generation and at a
  // fixed point in the build order (determinism per floor seed).
  ammoPickupNextId = 0; // ids restart per floor, identically on every machine
  spawnAmmoPickups();

  // MP kill-gate: party kills needed to open the exit ≈ the mobs of the first
  // two waves at this floor, via the per-theme spawn table (waveSizeFor is
  // deterministic). Computed on every machine (same floor → same target);
  // only enforced in co-op.
  floorKills = 0;
  killTarget = waveSizeFor(currentFloor, 1) + waveSizeFor(currentFloor, 2);

  // Place player
  player.pos.set(1 * CELL + CELL / 2, 1.6, 1 * CELL + CELL / 2);
  player.vel.set(0, 0, 0);
  player.onGround = true;

  // Now that every PointLight is in the scene, schedule the flashlight shader
  // warm-up. It no longer renders synchronously here: the two warm-up renders are
  // spread over the next two animation frames, hidden behind the 4s floor-announce
  // card that goes up in this same transition (see warmUpFlashlight).
  warmUpFlashlight();

  // Floor-specific music: start the Level Fun loop on floor 5, stop it on every other
  // floor. Runs here because buildMazeScene is the one path hit on every floor entry.
  updateFloorMusic();

  // Reset anti-linger
  floorTimer = 0;
  dangerLevel = 0;
  dangerSpawnTimer = LINGER_SPAWN_BASE;

  // New floor: wipe fog-of-war exploration and force the next minimap tick to
  // redraw (the signature — player spawn cell, empty enemy list — could
  // otherwise match the previous floor's).
  resetSeenGrid();
  minimapSig = '';

  // MP: the teardown above disposed any remote-player avatars with the old
  // world — tell net.js to drop its dead references (rebuilt on next 'pos').
  netOnSceneRebuilt();
}

function addDecorations(theme, gw, gh) {
  if (theme.decorations === 'pillars') {
    const pillarGeo = new THREE.CylinderGeometry(0.15, 0.18, WALL_H, 8);
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0xa09060, roughness: 0.7 });
    for (let y = 3; y < gh - 2; y += 4) for (let x = 3; x < gw - 2; x += 4) {
      if (isOpenArea(x, y, gw, gh) && Math.random() < 0.35) {
        const p = new THREE.Mesh(pillarGeo, pillarMat);
        p.position.set(x * CELL + CELL / 2, WALL_H / 2, y * CELL + CELL / 2);
        scene.add(p);
        mazeWalls.push({ minX: x * CELL + CELL / 2 - 0.22, maxX: x * CELL + CELL / 2 + 0.22, minZ: y * CELL + CELL / 2 - 0.22, maxZ: y * CELL + CELL / 2 + 0.22 });
      }
    }
  } else if (theme.decorations === 'crates') {
    const crateMat = new THREE.MeshStandardMaterial({ color: 0x5a4a32, roughness: 0.9 });
    for (let y = 2; y < gh - 1; y += 5) for (let x = 2; x < gw - 1; x += 5) {
      if (mazeGrid[y][x] === 1 && Math.random() < 0.4) {
        const size = 0.4 + Math.random() * 0.4;
        const crate = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), crateMat);
        crate.position.set(x * CELL + CELL / 2 + (Math.random() - 0.5), size / 2, y * CELL + CELL / 2 + (Math.random() - 0.5));
        crate.rotation.y = Math.random() * Math.PI;
        scene.add(crate);
        mazeWalls.push({
          minX: crate.position.x - size / 2, maxX: crate.position.x + size / 2,
          minZ: crate.position.z - size / 2, maxZ: crate.position.z + size / 2
        });
      }
    }
  } else if (theme.decorations === 'pipes') {
    const pipeMat = new THREE.MeshStandardMaterial({ color: 0x665544, roughness: 0.6, metalness: 0.4 });
    for (let y = 2; y < gh - 1; y += 3) for (let x = 2; x < gw - 1; x += 3) {
      if (mazeGrid[y][x] === 1 && Math.random() < 0.3) {
        const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, WALL_H, 6), pipeMat);
        pipe.position.set(x * CELL + CELL / 2 + (Math.random() - 0.5) * 2, WALL_H / 2, y * CELL + CELL / 2 + (Math.random() - 0.5) * 2);
        scene.add(pipe);
        if (Math.random() < 0.5) {
          const hpipe = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, CELL * 1.5, 6), pipeMat);
          hpipe.rotation.z = Math.PI / 2;
          hpipe.position.set(x * CELL + CELL / 2, WALL_H * 0.7, y * CELL + CELL / 2);
          scene.add(hpipe);
        }
      }
    }
  } else if (theme.decorations === 'water') {
    const colMat = new THREE.MeshStandardMaterial({ color: 0xd0e0e8, roughness: 0.3, metalness: 0.1 });
    for (let y = 3; y < gh - 2; y += 5) for (let x = 3; x < gw - 2; x += 5) {
      if (isOpenArea(x, y, gw, gh) && Math.random() < 0.5) {
        // A column standing in a basin runs all the way down to the POOL floor
        // (rising out of the water), not just to deck level.
        const fh = floorHeightAt(x * CELL + CELL / 2, y * CELL + CELL / 2);
        const colH = WALL_H - fh;
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, colH, 12), colMat);
        col.position.set(x * CELL + CELL / 2, fh + colH / 2, y * CELL + CELL / 2);
        scene.add(col);
        mazeWalls.push({ minX: x * CELL + CELL / 2 - 0.25, maxX: x * CELL + CELL / 2 + 0.25, minZ: y * CELL + CELL / 2 - 0.25, maxZ: y * CELL + CELL / 2 + 0.25 });
      }
    }
  } else if (theme.decorations === 'party') {
    // CREEPY BIRTHDAY PARTY (Level Fun only). Floating balloons (harmless, no collision)
    // + party tables, each set with a single candle-lit cake. Tables are solid and
    // pushed into mazeWalls so player/mobs collide. Reuses the same placement idiom as
    // the other decoration branches, scoped via Level Fun's decorations:'party'.
    const balloonColors = [0xff4466, 0x44aaff, 0xffdd00, 0x44ff88, 0xff88ff];

    // Balloons — drift overhead.
    for (let y = 2; y < gh - 1; y += 4) for (let x = 2; x < gw - 1; x += 4) {
      if (mazeGrid[y][x] === 1 && Math.random() < 0.5) {
        const color = balloonColors[Math.floor(Math.random() * balloonColors.length)];
        const balloon = new THREE.Mesh(
          new THREE.SphereGeometry(0.2 + Math.random() * 0.15, 8, 8),
          new THREE.MeshStandardMaterial({ color: color, emissive: color, emissiveIntensity: 0.2 })
        );
        balloon.position.set(x * CELL + CELL / 2 + (Math.random() - 0.5) * 2, 2 + Math.random(), y * CELL + CELL / 2 + (Math.random() - 0.5) * 2);
        scene.add(balloon);
        const strGeo = new THREE.CylinderGeometry(0.005, 0.005, balloon.position.y - 0.5, 4);
        const str = new THREE.Mesh(strGeo, new THREE.MeshStandardMaterial({ color: 0x888888 }));
        str.position.set(balloon.position.x, balloon.position.y / 2, balloon.position.z);
        scene.add(str);
      }
    }

    // Party tables — pale-clothed round top on a single leg, topped with a glowing cake
    // and a lit candle. Solid obstacles (added to mazeWalls).
    const tableMat = new THREE.MeshStandardMaterial({ color: 0xede0c8, roughness: 0.85 }); // grimy tablecloth
    const legMat   = new THREE.MeshStandardMaterial({ color: 0x6b5a44, roughness: 0.9 });
    const cakeMat  = new THREE.MeshStandardMaterial({ color: 0xff9ec4, emissive: 0xff5599, emissiveIntensity: 0.25, roughness: 0.6 });
    const flameMat = new THREE.MeshStandardMaterial({ color: 0xfff0c0, emissive: 0xffcc66, emissiveIntensity: 0.7 });
    const TABLE_TOP_Y = 1.0, TABLE_R = 0.55;
    for (let y = 3; y < gh - 2; y += 5) for (let x = 3; x < gw - 2; x += 5) {
      if (isOpenArea(x, y, gw, gh) && Math.random() < 0.5) {
        const cx = x * CELL + CELL / 2, cz = y * CELL + CELL / 2;
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, TABLE_TOP_Y, 8), legMat);
        leg.position.set(cx, TABLE_TOP_Y / 2, cz);
        scene.add(leg);
        const top = new THREE.Mesh(new THREE.CylinderGeometry(TABLE_R, TABLE_R, 0.08, 16), tableMat);
        top.position.set(cx, TABLE_TOP_Y, cz);
        scene.add(top);
        const cake = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.18, 12), cakeMat);
        cake.position.set(cx, TABLE_TOP_Y + 0.13, cz);
        scene.add(cake);
        const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.12, 6), flameMat);
        candle.position.set(cx, TABLE_TOP_Y + 0.28, cz);
        scene.add(candle);
        mazeWalls.push({ minX: cx - TABLE_R, maxX: cx + TABLE_R, minZ: cz - TABLE_R, maxZ: cz + TABLE_R });
      }
    }
  }
}

function isOpenArea(x, y, gw, gh) {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const ny = y + dy, nx = x + dx;
    if (ny < 0 || ny >= gh || nx < 0 || nx >= gw || mazeGrid[ny][nx] === 0) return false;
  }
  return true;
}

/* ═══════════════════════════════════════════
   POOLS — sunken basins, water surface, fake caustics
   Built only on 'pools' floors (Poolrooms / Dark Pools). Everything renders
   from FOUR merged meshes (deck+basin floors, basin lip walls, water surfaces,
   caustics) — no per-pool draw calls, no render targets, no new lights.
   Textures are session-cached (userData.themeCached spares them the floor
   teardown); the materials are floor-owned and rebuilt every visit.
   ═══════════════════════════════════════════ */

// Ground height at a world position: 0 everywhere except inside a pool basin.
// The ONLY source of truth for walkable height — player physics, pickups,
// decorations and mob wading all read this.
function floorHeightAt(x, z) {
  if (!poolWater) return 0;
  const cx = Math.floor(x / CELL), cy = Math.floor(z / CELL);
  const row = mazeGrid[cy];
  return (row && row[cx] === 2) ? -poolWater.depth : 0;
}

// Mobs WADE rather than dive: sink to ~55% of basin depth so they stay visible
// above even the near-opaque Dark Pools water. Used by updateEnemies +
// raycastEnemies (host) and the netClientUpdate mirrors (clients).
function mobGroundOffset(x, z) {
  const fh = floorHeightAt(x, z);
  return fh < 0 ? fh * 0.55 : 0;
}

let waterTexCache = null, causticsTexCache = null;

// Soft ripple-noise sheet, tinted/faded by the per-theme water material.
function getWaterTexture() {
  if (waterTexCache) return waterTexCache;
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 256, 256);
  // wrapped strokes (drawn at 3x3 offsets) keep the texture tileable
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * 256, y = Math.random() * 256;
    const rx = 12 + Math.random() * 30, ry = 3 + Math.random() * 8;
    const dark = Math.random() < 0.6;
    ctx.strokeStyle = dark ? `rgba(40,80,90,${0.04 + Math.random() * 0.08})`
                           : `rgba(255,255,255,${0.06 + Math.random() * 0.10})`;
    ctx.lineWidth = 1 + Math.random() * 2;
    for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]) {
      ctx.beginPath();
      ctx.ellipse(x + ox, y + oy, rx, ry, Math.random() * Math.PI, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  texMarkSRGB(tex);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.userData = { themeCached: true }; // session-cached — exempt from floor teardown
  waterTexCache = tex;
  return tex;
}

// FAKE CAUSTICS: a black sheet webbed with bright arc filaments. Scrolled +
// opacity-pulsed by updateWaterFX and blended additively onto basin floors and
// lip walls — the signature poolrooms shimmer with zero render-target cost.
function getCausticsTexture() {
  if (causticsTexCache) return causticsTexCache;
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * 256, y = Math.random() * 256;
    const r = 8 + Math.random() * 22;
    const a0 = Math.random() * Math.PI * 2, a1 = a0 + 1.2 + Math.random() * 2.2;
    ctx.strokeStyle = `rgba(255,255,255,${0.15 + Math.random() * 0.35})`;
    ctx.lineWidth = 1 + Math.random() * 2;
    for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]) {
      ctx.beginPath();
      ctx.arc(x + ox, y + oy, r, a0, a1);
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  texMarkSRGB(tex);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.userData = { themeCached: true };
  causticsTexCache = tex;
  return tex;
}

// Tiny merged-quad builder: corners CCW as seen from the face's front side.
function poolsQuadBuilder() {
  return {
    pos: [], uv: [], idx: [],
    add(p1, p2, p3, p4, u1, u2, u3, u4) {
      const b = this.pos.length / 3;
      this.pos.push(...p1, ...p2, ...p3, ...p4);
      this.uv.push(...u1, ...u2, ...u3, ...u4);
      this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    },
    build() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
      g.setIndex(this.idx);
      g.computeVertexNormals();
      return g;
    }
  };
}

function buildPoolsGeometry(theme, gw, gh, floorMat, wallMat) {
  const W = theme.water;
  const D = W.depth, surfY = -W.surfaceDrop;
  const floors = poolsQuadBuilder();  // deck cells + basin floors (theme floor texture)
  const lips = poolsQuadBuilder();    // basin inner walls (theme wall texture)
  const water = poolsQuadBuilder();   // one surface quad per basin
  const caus = poolsQuadBuilder();    // caustics overlay: basin floors + lips

  // Deck: one quad per non-basin cell at y=0. UVs span 0..1 across the whole
  // grid (the shared theme texture's repeat does the tiling), matching the
  // exact look of the single floor slab other archetypes use.
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    if (mazeGrid[y][x] === 2) continue;
    const x0 = x * CELL, x1 = x0 + CELL, z0 = y * CELL, z1 = z0 + CELL;
    floors.add([x0, 0, z0], [x0, 0, z1], [x1, 0, z1], [x1, 0, z0],
      [x / gw, y / gh], [x / gw, (y + 1) / gh], [(x + 1) / gw, (y + 1) / gh], [(x + 1) / gw, y / gh]);
  }

  const CAUS_UV = 0.5; // caustics/water texture tiles per grid cell
  for (const r of poolRects) {
    const x0 = r.x0 * CELL, x1 = (r.x1 + 1) * CELL;
    const z0 = r.y0 * CELL, z1 = (r.y1 + 1) * CELL;
    const cw = r.x1 - r.x0 + 1, ch = r.y1 - r.y0 + 1;

    // basin floor (same theme floor texture, just lower)
    floors.add([x0, -D, z0], [x0, -D, z1], [x1, -D, z1], [x1, -D, z0],
      [r.x0 / gw, r.y0 / gh], [r.x0 / gw, (r.y1 + 1) / gh], [(r.x1 + 1) / gw, (r.y1 + 1) / gh], [(r.x1 + 1) / gw, r.y0 / gh]);

    // 4 lip walls, from basin floor up to deck level (wallMat is DoubleSide,
    // so winding is irrelevant). One wall-texture tile per cell horizontally,
    // depth/WALL_H of a tile vertically (no squashed tiles).
    const vTile = D / WALL_H;
    lips.add([x0, -D, z0], [x0, 0, z0], [x1, 0, z0], [x1, -D, z0], [0, 0], [0, vTile], [cw, vTile], [cw, 0]); // north
    lips.add([x0, -D, z1], [x0, 0, z1], [x1, 0, z1], [x1, -D, z1], [0, 0], [0, vTile], [cw, vTile], [cw, 0]); // south
    lips.add([x0, -D, z0], [x0, 0, z0], [x0, 0, z1], [x0, -D, z1], [0, 0], [0, vTile], [ch, vTile], [ch, 0]); // west
    lips.add([x1, -D, z0], [x1, 0, z0], [x1, 0, z1], [x1, -D, z1], [0, 0], [0, vTile], [ch, vTile], [ch, 0]); // east

    // water surface (DoubleSide: Dark Pools puts the camera under it)
    water.add([x0, surfY, z0], [x0, surfY, z1], [x1, surfY, z1], [x1, surfY, z0],
      [0, 0], [0, ch * CAUS_UV], [cw * CAUS_UV, ch * CAUS_UV], [cw * CAUS_UV, 0]);

    // caustics: basin floor sheet + the 4 lips, nudged 3cm off the surfaces
    caus.add([x0, -D + 0.03, z0], [x0, -D + 0.03, z1], [x1, -D + 0.03, z1], [x1, -D + 0.03, z0],
      [0, 0], [0, ch * CAUS_UV], [cw * CAUS_UV, ch * CAUS_UV], [cw * CAUS_UV, 0]);
    const cv = D / CELL * CAUS_UV;
    caus.add([x0, -D, z0 + 0.03], [x0, 0, z0 + 0.03], [x1, 0, z0 + 0.03], [x1, -D, z0 + 0.03], [0, 0], [0, cv], [cw * CAUS_UV, cv], [cw * CAUS_UV, 0]);
    caus.add([x0, -D, z1 - 0.03], [x0, 0, z1 - 0.03], [x1, 0, z1 - 0.03], [x1, -D, z1 - 0.03], [0, 0], [0, cv], [cw * CAUS_UV, cv], [cw * CAUS_UV, 0]);
    caus.add([x0 + 0.03, -D, z0], [x0 + 0.03, 0, z0], [x0 + 0.03, 0, z1], [x0 + 0.03, -D, z1], [0, 0], [0, cv], [ch * CAUS_UV, cv], [ch * CAUS_UV, 0]);
    caus.add([x1 - 0.03, -D, z0], [x1 - 0.03, 0, z0], [x1 - 0.03, 0, z1], [x1 - 0.03, -D, z1], [0, 0], [0, cv], [ch * CAUS_UV, cv], [ch * CAUS_UV, 0]);
  }

  scene.add(new THREE.Mesh(floors.build(), floorMat));
  scene.add(new THREE.Mesh(lips.build(), wallMat));

  // Floor-owned materials (teardown disposes them); textures are the cached
  // singletons. Standard+map(+DoubleSide) programs are already pinned by the
  // keepalive; basic+map+DoubleSide (caustics) gets its own pin there.
  const waterMat = new THREE.MeshStandardMaterial({
    map: getWaterTexture(), color: W.color, transparent: true, opacity: W.opacity,
    roughness: 0.15, metalness: 0.25, depthWrite: false, side: THREE.DoubleSide
  });
  const causMat = new THREE.MeshBasicMaterial({
    map: getCausticsTexture(), color: W.causticColor, transparent: true,
    opacity: W.causticIntensity, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide
  });
  const causMesh = new THREE.Mesh(caus.build(), causMat);
  causMesh.renderOrder = 1; // caustics under the water sheet
  scene.add(causMesh);
  const waterMesh = new THREE.Mesh(water.build(), waterMat);
  waterMesh.renderOrder = 2;
  scene.add(waterMesh);

  poolFx = { waterMat, causMat, base: W.causticIntensity, t: 0 };
}

// Per-frame water animation: UV drift on the (shared, repeat-wrapped) textures
// + a slow opacity pulse on the caustics. Pure uniform updates — no canvas
// redraws, no extra draw calls.
function updateWaterFX(dt) {
  if (!poolFx) return;
  poolFx.t += dt;
  const t = poolFx.t;
  poolFx.waterMat.map.offset.set(t * 0.018, t * 0.011);
  poolFx.causMat.map.offset.set(t * 0.012 + Math.sin(t * 0.2) * 0.08, t * 0.016);
  poolFx.causMat.opacity = poolFx.base * (0.75 + 0.25 * Math.sin(t * 1.7));
}

// In-water player feedback: entry splash, wading footfalls, underwater tint.
// The overlay is a CSS div (zero render cost) that only ever shows when the
// EYE is below the water plane — i.e. wading through Dark Pools basins.
let waterOverlayEl = null, wadeTimer = 0, wasInWater = false;
function updateWaterPlayerFX(dt, isMoving, inWater) {
  if (inWater && !wasInWater) playSplash();
  wasInWater = inWater;
  if (inWater && isMoving) {
    wadeTimer -= dt;
    if (wadeTimer <= 0) { wadeTimer = 0.4 + Math.random() * 0.15; playWade(); }
  }
  if (!waterOverlayEl) {
    waterOverlayEl = document.createElement('div');
    waterOverlayEl.style.cssText =
      'position:fixed;left:0;top:0;right:0;bottom:0;pointer-events:none;z-index:5;opacity:0;transition:opacity 0.2s;';
    document.body.appendChild(waterOverlayEl);
  }
  const under = inWater && poolWater && player.pos.y < -poolWater.surfaceDrop;
  if (under) {
    const c = poolWater.color, r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
    waterOverlayEl.style.background =
      `rgba(${r >> 1},${g >> 1},${b >> 1},${poolWater.underAlpha})`;
    waterOverlayEl.style.opacity = '1';
  } else {
    waterOverlayEl.style.opacity = '0';
  }
}

/* ═══════════════════════════════════════════

/* ═══════════════════════════════════════════
   PLAYER
   ═══════════════════════════════════════════ */
function damagePlayer(amount, fromPos) {
  if (player.isDown) return; // MP: a downed player can't be damaged further
  player.health -= amount;
  playDamage();
  damageVigTimer = 0.5;

  if (fromPos) {
    const dx = fromPos.x - player.pos.x, dz = fromPos.z - player.pos.z;
    const angle = Math.atan2(dx, dz) - player.yaw;
    const na = ((angle % (Math.PI * 2)) + (Math.PI * 2)) % (Math.PI * 2);
    if (na > Math.PI * 1.75 || na < Math.PI * 0.25) dmgInd.top = 0.6;
    else if (na > Math.PI * 0.25 && na < Math.PI * 0.75) dmgInd.right = 0.6;
    else if (na > Math.PI * 0.75 && na < Math.PI * 1.25) dmgInd.bottom = 0.6;
    else dmgInd.left = 0.6;
  }

  if (player.health <= 0) {
    player.health = 0;
    // MP (co-op): go DOWN instead of dying — a teammate can revive you, and
    // only an all-players-down wipe ends the game (host broadcasts it).
    // Solo: unchanged instant game over.
    if (netState.role !== 'solo') netGoDown();
    else gameOver();
  }
}

function spawnBulletTrail(startPos, endPos) {
  const points = [startPos.clone(), endPos.clone()];
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color: 0xffffaa,
    transparent: true,
    opacity: 0.8,
    linewidth: 1
  });
  const line = new THREE.Line(geometry, material);
  scene.add(line);
  bulletTrails.push({ mesh: line, life: 0.12 });
}

function updateBulletTrails(dt) {
  for (let i = bulletTrails.length - 1; i >= 0; i--) {
    const t = bulletTrails[i];
    t.life -= dt;
    t.mesh.material.opacity = Math.max(0, t.life / 0.12) * 0.8;
    if (t.life <= 0) {
      scene.remove(t.mesh);
      t.mesh.geometry.dispose();
      t.mesh.material.dispose();
      bulletTrails.splice(i, 1);
    }
  }
}

function playerShoot() {
  if (player.isDown) return; // MP: downed players can't shoot
  if (player.isReloading || player.fireTimer > 0 || player.clipAmmo <= 0) return;
  player.clipAmmo--;
  player.fireTimer = FIRE_RATE * shopStats.fireRateMult;
  gunRecoil = 0.15;
  muzzleFlashTimer = 0.08;
  playGunshot();

  // Screen flash
  document.getElementById('muzzleOverlay').style.opacity = '1';
  setTimeout(() => document.getElementById('muzzleOverlay').style.opacity = '0', 45);

  // Raycast
  const dir = new THREE.Vector3(0, 0, -1);
  dir.applyQuaternion(camera.quaternion);
  const ray = new THREE.Raycaster(camera.position.clone(), dir, 0.1, GUN_RANGE);

  // MP HOST: clients' shots reach peers via the 'shoot' relay; the host's own
  // shots need this explicit cosmetic broadcast (net.js — trail/flash/sound).
  if (netState.role === 'host') netAnnounceShot(camera.position, dir);

  // Compute gun tip world position for bullet trail start
  const gunTip = new THREE.Vector3(0, 0, -0.3);
  if (gunGroup) gunTip.applyMatrix4(gunGroup.matrixWorld);
  else gunTip.copy(camera.position);

  // Default trail end = max range in firing direction
  let trailEnd = camera.position.clone().add(dir.clone().multiplyScalar(GUN_RANGE));
  const effectiveDamage = GUN_DAMAGE * shopStats.damageMult;

  // MP CLIENT: this machine has no authoritative enemies — everything above
  // (ammo, recoil, flash, sound) already played for zero-latency feel; send the
  // ray to the host, which resolves the hit. The outcome comes back via the
  // next enemy snapshot (hp drop / death).
  if (netIsClient()) {
    netSendShoot(camera.position, dir);
    spawnBulletTrail(gunTip, trailEnd);
    if (player.clipAmmo === 0 && player.reserveAmmo > 0) {
      hudSetStyle('ammoWarning', 'opacity', '1');
    }
    updateHUD();
    return;
  }

  // Check boss hit
  if (bossEntity && bossEntity.alive) {
    const bHit = raycastBoss(ray);
    if (bHit) {
      const dmg = effectiveDamage * (0.9 + Math.random() * 0.3);
      damageBoss(dmg);
      playHit();
      hitmarkerTimer = 0.18;
      hitmarkerKill = false;
      trailEnd = bHit.clone();
      spawnBulletTrail(gunTip, trailEnd);

      if (player.clipAmmo === 0 && player.reserveAmmo > 0) {
        hudSetStyle('ammoWarning', 'opacity', '1');
      }
      updateHUD();
      return;
    }
  }

  const res = raycastEnemies(ray, camera.position);
  if (res) {
    trailEnd = res.point.clone();
    const dmg = effectiveDamage * (0.9 + Math.random() * 0.3);
    const killed = applyEnemyHit(res.enemy, dmg);
    playHit();
    hitmarkerTimer = 0.18;
    hitmarkerKill = killed;
    if (killed) player.kills++;
  }

  // Spawn bullet trail
  spawnBulletTrail(gunTip, trailEnd);

  if (player.clipAmmo === 0 && player.reserveAmmo > 0) {
    hudSetStyle('ammoWarning', 'opacity', '1');
  }
  updateHUD();
}

/* ── shared hitscan + hit application ──
   Used by BOTH the local shot path (playerShoot) and remote client shots
   (netResolveRemoteShot), so a client's bullet obeys the exact same hitboxes
   and side effects as the host's. */

// Boss hit test: same sphere playerShoot always used.
function raycastBoss(ray) {
  const bSphere = new THREE.Sphere(bossEntity.pos.clone().setY(bossEntity.height * 0.4), 0.8 * bossEntity.scale);
  return ray.ray.intersectSphere(bSphere, new THREE.Vector3());
}

// Nearest living enemy whose hitbox the ray crosses → { enemy, point } or null.
function raycastEnemies(ray, origin) {
  let hitEnemy = null, hitDist = Infinity, hitPoint = null;
  for (const e of enemies) {
    if (!e.alive) continue;
    let boxSize, boxCenter;
    const wade = mobGroundOffset(e.pos.x, e.pos.z); // pools: hitbox follows the wading visual
    if (e.mesh.isGroup) {
      // 3D wire figure: armature is ~2.5m tall and ~0.7m wide at the arms.
      // Use the true VISUAL height (NOT e.height, which is gameplay-only) so
      // head/torso shots register. Box spans ~floor up to ~2.5m, widened to
      // 0.9m so the outstretched arms are coverable.
      const visH = 2.5 * WIRE_VISUAL_SCALE;
      boxSize = new THREE.Vector3(0.9, visH, 0.9);
      boxCenter = e.pos.clone().setY(visH * 0.5 + wade);
    } else {
      // sprite mobs: unchanged
      boxSize = new THREE.Vector3(e.scale * 1.5, e.height * 1.1, e.scale * 1.5);
      boxCenter = e.pos.clone().setY(e.height * 0.5 + wade);
    }
    const box = new THREE.Box3().setFromCenterAndSize(boxCenter, boxSize);
    const hit = ray.ray.intersectBox(box, new THREE.Vector3());
    if (hit) {
      const d = origin.distanceTo(hit);
      if (d < hitDist) { hitDist = d; hitEnemy = e; hitPoint = hit.clone(); }
    }
  }
  return hitEnemy ? { enemy: hitEnemy, point: hitPoint } : null;
}

// Apply damage + ALL its side effects (stun, flash, death, wave/economy).
// Personal cosmetics (hitmarker, kill counter for LOCAL shots) stay with each
// shooter. shooterConn identifies a remote shooter (null/undefined = the local
// player) so the kill reward is credited to whoever actually got the kill.
// Returns true if this hit killed the enemy.
function applyEnemyHit(e, dmg, shooterConn) {
  e.hp -= dmg;
  e.stunTimer = 0.12;
  e.hitFlashTimer = 0.15;
  setMobFlash(e, true); // HIT FLASH: briefly flash enemy red

  if (e.hp > 0) return false;

  e.alive = false;
  e.deathTimer = 0;
  waveMobsLeft--;
  floorKills++; // MP kill-gate: PARTY total, regardless of who got the kill
  // Kill reward goes to the KILLER: remote shooter → 'reward' message (their
  // machine adds money + kill count); local shooter → directly.
  if (shooterConn) sendTo(shooterConn, 'reward', { money: KILL_REWARD, kills: 1 });
  else playerMoney += KILL_REWARD;
  playEnemyDeath();

  // ~20% ammo drop where the enemy died (Math.random, not the seeded rng —
  // combat outcomes aren't deterministic, so drops don't need to be either).
  // MP: drops are HOST-authoritative — broadcast so clients spawn the same one.
  if (Math.random() < AMMO_DROP_CHANCE) {
    const id = ++ammoPickupNextId;
    createAmmoPickup(e.pos.x, e.pos.z, id);
    netBroadcastPickupSpawn(id, e.pos.x, e.pos.z);
  }

  if (waveMobsLeft <= 0 && !isBossFloor(currentFloor)) {
    currentWave++;
    updateHUD();
    setTimeout(() => { if (gameState === 'playing') spawnWave(); }, waveRespiteMs(currentFloor));
  }
  return true;
}

// MP HOST: authoritatively resolve a client's 'shoot' ray against THIS
// machine's enemies — same hitboxes, same hit logic. The client's shop damage
// multiplier rides along in d.m (client-trusted: fine for friend co-op, must
// move host-side if this ever goes public).
function netResolveRemoteShot(d, fromConn) {
  const origin = new THREE.Vector3(d.ox, d.oy, d.oz);
  const dir = new THREE.Vector3(d.dx, d.dy, d.dz).normalize();
  const ray = new THREE.Raycaster(origin, dir, 0.1, GUN_RANGE);
  const dmg = GUN_DAMAGE * (d.m || 1) * (0.9 + Math.random() * 0.3);

  if (bossEntity && bossEntity.alive && raycastBoss(ray)) {
    damageBoss(dmg);
    return;
  }
  const res = raycastEnemies(ray, origin);
  if (res) applyEnemyHit(res.enemy, dmg, fromConn);
}

function playerReload() {
  if (player.isDown) return; // MP: downed players can't reload
  if (player.isReloading || player.clipAmmo === shopStats.clipSize || player.reserveAmmo <= 0) return;
  player.isReloading = true;
  player.reloadTimer = RELOAD_TIME;
  playReload();
  document.getElementById('reloadBarContainer').style.opacity = '1';
  hudSetStyle('ammoWarning', 'opacity', '0');
}

// Module-level scratch vectors for updatePlayer — allocated once and reused
// every frame instead of 3 fresh Vector3s per frame (GC pressure in the loop).
const _tmpForward = new THREE.Vector3();
const _tmpRight = new THREE.Vector3();
const _tmpMoveDir = new THREE.Vector3();

function updatePlayer(dt) {
  const forward = _tmpForward.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  const right = _tmpRight.set(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
  const moveDir = _tmpMoveDir.set(0, 0, 0);

  if (keys['KeyW'] || keys['ArrowUp']) moveDir.add(forward);
  if (keys['KeyS'] || keys['ArrowDown']) moveDir.sub(forward);
  if (keys['KeyA'] || keys['ArrowLeft']) moveDir.sub(right);
  if (keys['KeyD'] || keys['ArrowRight']) moveDir.add(right);
  if (player.isDown) moveDir.set(0, 0, 0); // MP: downed = rooted (look only)

  const isMoving = moveDir.length() > 0.01;
  if (isMoving) moveDir.normalize();

  player.isSprinting = keys['ShiftLeft'] && isMoving && player.stamina > 0 && player.onGround;
  // Pools: wading below the water line slows you (per-theme theme.water.slow).
  const inWater = !!poolWater && floorHeightAt(player.pos.x, player.pos.z) < 0 &&
                  (player.pos.y - 1.6) < -poolWater.surfaceDrop + 0.05;
  const speed = MOVE_SPEED * (player.isSprinting ? SPRINT_MULT : 1) * (player.isADS ? 0.6 : 1) *
                (inWater ? poolWater.slow : 1);

  if (player.isSprinting) player.stamina = Math.max(0, player.stamina - STAMINA_DRAIN * dt);
  else player.stamina = Math.min(shopStats.maxHealth, player.stamina + STAMINA_REGEN * shopStats.staminaRegenMult * dt);

  const newX = player.pos.x + moveDir.x * speed * dt;
  const newZ = player.pos.z + moveDir.z * speed * dt;
  const pRad = 0.35;
  let canX = true, canZ = true;
  for (const w of mazeWalls) {
    if (newX + pRad > w.minX && newX - pRad < w.maxX && player.pos.z + pRad > w.minZ && player.pos.z - pRad < w.maxZ) canX = false;
    if (player.pos.x + pRad > w.minX && player.pos.x - pRad < w.maxX && newZ + pRad > w.minZ && newZ - pRad < w.maxZ) canZ = false;
  }
  // Pools: the basin lip is a height step, not an AABB. You can always walk IN
  // (drop), but climbing OUT needs your feet above (deck - 0.55m) — i.e. a
  // jump. While airborne over the lip the same check lets you through.
  if (poolWater) {
    const footY = player.pos.y - 1.6;
    if (canX && floorHeightAt(newX, player.pos.z) > footY + 0.55) canX = false;
    if (canZ && floorHeightAt(player.pos.x, newZ) > footY + 0.55) canZ = false;
  }
  if (canX) player.pos.x = newX;
  if (canZ) player.pos.z = newZ;

  if (keys['Space'] && player.onGround && !player.isDown) {
    // In water: push off the pool floor hard enough to clear the lip — Dark
    // Pools basins (2.5m) are deeper than a normal jump (apex ~1.45m) reaches.
    player.vel.y = inWater ? Math.sqrt(2 * GRAVITY * (poolWater.depth + 0.7)) : JUMP_V;
    player.onGround = false;
  }
  player.vel.y -= GRAVITY * (inWater ? 0.45 : 1) * dt; // buoyant sink/rise in water
  player.pos.y += player.vel.y * dt;
  const groundEyeY = floorHeightAt(player.pos.x, player.pos.z) + 1.6;
  if (player.pos.y <= groundEyeY) { player.pos.y = groundEyeY; player.vel.y = 0; player.onGround = true; }
  updateWaterPlayerFX(dt, isMoving, inWater);

  // ACCESSIBILITY: NO head bob — camera stays perfectly steady
  camera.position.set(player.pos.x, player.pos.y, player.pos.z);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch;

  // ADS FOV smoothly lerp
  const targetFOV = player.isADS ? ADS_FOV : DEFAULT_FOV;
  player.currentFOV += (targetFOV - player.currentFOV) * Math.min(1, dt * ADS_LERP_SPEED);
  camera.fov = player.currentFOV;
  camera.updateProjectionMatrix();

  if (player.fireTimer > 0) player.fireTimer -= dt;
  if (mouseDown && !player.isReloading && player.fireTimer <= 0 && player.clipAmmo > 0) playerShoot();

  if (player.isReloading) {
    player.reloadTimer -= dt;
    document.getElementById('reloadBarFill').style.width = ((1 - player.reloadTimer / RELOAD_TIME) * 100) + '%';
    if (player.reloadTimer <= 0) {
      const take = Math.min(shopStats.clipSize - player.clipAmmo, player.reserveAmmo);
      player.clipAmmo += take;
      player.reserveAmmo -= take;
      player.isReloading = false;
      document.getElementById('reloadBarContainer').style.opacity = '0';
      updateHUD();
    }
  }

  updateGun(dt, isMoving, player.isSprinting);

  // Exit zone check — MP: gated on the party's combined kills (netExitGateOpen;
  // always open solo). ANY player can trigger the advance: a client asks the
  // host ('exit_reached'), the host executes + rebroadcasts game_start.
  if (exitZone) {
    const edx = player.pos.x - exitZone.x, edz = player.pos.z - exitZone.z;
    if (Math.sqrt(edx * edx + edz * edz) < exitZone.radius && netExitGateOpen()) {
      if (netIsClient()) netRequestAdvance();
      else advanceFloor();
    }
  }
}

/* ═══════════════════════════════════════════
   FLOOR PROGRESSION
   ═══════════════════════════════════════════ */
// One shared path for "produce currentFloor's level data": theme + seed + maze.
// Used by startGame, advanceFloor AND the MP client's host-driven floor load
// (net.js), so all three are guaranteed to generate the identical level.
function generateCurrentFloor() {
  const theme = getTheme(currentFloor);
  seedFloor(currentFloor);
  if (theme.isBoss) {
    generateBossArena(theme.mazeSize);
  } else {
    const size = theme.mazeSize + Math.floor(currentFloor / LEVEL_THEMES.length);
    generateLevel(theme, Math.min(size, 20), Math.min(size, 20));
  }
  return theme;
}

function advanceFloor() {
  // MP: floor advance is HOST-authoritative. A client touching the exit does
  // nothing — when the HOST advances, the game_start broadcast below rebuilds
  // every client on the new floor (Phase-3 interim behavior).
  if (netIsClient()) return;

  markFloorBeaten(currentFloor); // PART 2: reaching the exit = this floor cleared → unlocks the next
  playerMoney += FLOOR_CLEAR_REWARD;
  netRewardAll(FLOOR_CLEAR_REWARD, 0); // MP: floor-clear pay goes to the WHOLE party
  currentFloor++;
  currentWave = 1;
  player.floorReached = currentFloor;
  player.health = Math.min(shopStats.maxHealth, player.health + 35);
  player.reserveAmmo = Math.min(shopStats.reserveMax, player.reserveAmmo + shopStats.clipSize * 3);

  const theme = generateCurrentFloor();
  netOnHostStart(currentFloor, floorSeed); // MP: rebuild all clients on this floor

  buildMazeScene();

  if (theme.isBoss) {
    setTimeout(() => { if (gameState === 'playing') spawnBoss(); }, 1500);
  } else {
    spawnWave();
  }

  updateHUD();
  showFloorAnnounce();
}

function showFloorAnnounce() {
  const theme = getTheme(currentFloor);
  const el = document.getElementById('floorAnnounce');
  // Player-friendly counting: internal index 0 displays as "LEVEL 1". This is
  // display-only — currentFloor and all generation/boss/level-select logic are
  // unchanged; only the text shown to the player differs.
  document.getElementById('faLevel').textContent = 'LEVEL ' + (currentFloor + 1);
  document.getElementById('faName').textContent = theme.name;
  document.getElementById('faSubtitle').textContent = theme.subtitle || '';

  if (theme.isBoss) {
    document.getElementById('faLevel').style.color = '#ff4444';
    document.getElementById('faName').style.color = '#ff6644';
  } else {
    document.getElementById('faLevel').style.color = '#d4c36a';
    document.getElementById('faName').style.color = '#8a7f55';
  }

  // Container stays fully on; the per-frame logic in updateHUDTimers crossfades
  // the two steps via the child elements' opacity. Start with everything hidden.
  el.style.opacity = '1';
  document.getElementById('faLevel').style.opacity = '0';
  document.getElementById('faName').style.opacity = '0';
  document.getElementById('faSubtitle').style.opacity = '0';

  floorAnnounceTimer = FLOOR_ANNOUNCE_TOTAL;
}

/* ═══════════════════════════════════════════
   MINIMAP
   Redrawn at most 10x/sec, and within a tick ONLY if something it shows has
   actually changed (player pose, alive blips, boss, exit). A full redraw is
   up to ~1.7k canvas fillRects on big floors — far too much to run at 144Hz.
   ═══════════════════════════════════════════ */
const MINIMAP_INTERVAL = 0.1; // seconds between redraw checks (10 Hz)
let minimapAccum = 0;
let minimapSig = ''; // signature of everything drawn last time ('' = force redraw)

/* ── MINIMAP MODE + FOG OF WAR ──
   'fog' (default): cells start hidden, permanently revealed per-floor as the
   player gets near them; blips only show in revealed cells (the exit stays
   hidden until discovered). 'always': pre-fog behavior. 'off': hidden.
   Mode persists in localStorage; the seen-grid resets every floor. */
const MINIMAP_MODE_KEY = 'backrooms_minimap_mode';
const MINIMAP_MODES = ['fog', 'always', 'off'];
const MINIMAP_MODE_LABELS = { fog: 'Fog of War', always: 'Always On', off: 'Off' };
let minimapMode = (() => {
  try {
    const v = localStorage.getItem(MINIMAP_MODE_KEY);
    return MINIMAP_MODES.includes(v) ? v : 'fog';
  } catch (e) { return 'fog'; }
})();

let seenGrid = null;      // per-floor; seenGrid[y][x] = player has been near cell
const REVEAL_RADIUS = 2;  // cells (~8m) revealed around the player each tick

function resetSeenGrid() {
  seenGrid = mazeGrid.map(row => row.map(() => false));
}

// Mark cells around the player as seen. Runs on the 10Hz minimap tick in EVERY
// mode (even 'off'/'always'), so exploration is fully tracked if the player
// switches to fog mid-floor. ~20 cells per tick — negligible.
function markSeenAroundPlayer() {
  if (!seenGrid) return;
  const gh = seenGrid.length, gw = seenGrid[0].length;
  const pcx = Math.floor(player.pos.x / CELL), pcy = Math.floor(player.pos.z / CELL);
  for (let dy = -REVEAL_RADIUS; dy <= REVEAL_RADIUS; dy++) {
    for (let dx = -REVEAL_RADIUS; dx <= REVEAL_RADIUS; dx++) {
      if (dx * dx + dy * dy > REVEAL_RADIUS * REVEAL_RADIUS + 1) continue; // round-ish reveal
      const nx = pcx + dx, ny = pcy + dy;
      if (nx >= 0 && nx < gw && ny >= 0 && ny < gh) seenGrid[ny][nx] = true;
    }
  }
}

// Is this WORLD position in a revealed cell? Always true outside fog mode, so
// the blip-drawing code below needs no per-mode branches.
function isCellSeen(wx, wz) {
  if (minimapMode !== 'fog') return true;
  if (!seenGrid) return false;
  const cx = Math.floor(wx / CELL), cy = Math.floor(wz / CELL);
  return cy >= 0 && cy < seenGrid.length && cx >= 0 && cx < seenGrid[0].length && seenGrid[cy][cx];
}

function setMinimapMode(mode) {
  if (!MINIMAP_MODES.includes(mode)) return;
  minimapMode = mode;
  try { localStorage.setItem(MINIMAP_MODE_KEY, mode); } catch (e) {}
  const container = document.querySelector('.minimap-container');
  if (container) container.style.display = (mode === 'off') ? 'none' : '';
  const btn = document.getElementById('btnMinimapMode');
  if (btn) btn.textContent = MINIMAP_MODE_LABELS[mode];
  minimapSig = ''; // force a redraw under the new mode
}

function updateMinimap(dt) {
  minimapAccum += dt;
  if (minimapAccum < MINIMAP_INTERVAL) return;
  minimapAccum = 0;

  markSeenAroundPlayer(); // track exploration in every mode (see comment above)
  if (minimapMode === 'off') return;

  // Cheap change signature. Positions are quantized (~canvas-pixel precision),
  // so sub-visible jitter doesn't count as a change. Only VISIBLE blips are
  // included: in fog mode an enemy roaming unseen cells can't dirty the map,
  // and the exit joins the signature the moment it's discovered.
  // MP: blip sources route through net helpers — host/solo read the real
  // enemies/boss, clients read their mirrored lists. Same fog rules either way.
  const blips = netMinimapBlips();
  const bossBlip = netMinimapBoss();
  let sig = minimapMode + '|' + player.pos.x.toFixed(1) + ',' + player.pos.z.toFixed(1) + ',' + player.yaw.toFixed(2);
  for (const b of blips) {
    if (isCellSeen(b.x, b.z)) sig += '|' + b.x.toFixed(1) + ',' + b.z.toFixed(1);
  }
  if (bossBlip && isCellSeen(bossBlip.x, bossBlip.z)) {
    sig += '|B' + bossBlip.x.toFixed(1) + ',' + bossBlip.z.toFixed(1);
  }
  if (exitZone && isCellSeen(exitZone.x, exitZone.z)) sig += '|E' + exitZone.x + ',' + exitZone.z;
  // MP: teammates are ALWAYS visible (no fog check — you should always be able
  // to find your team), so they always join the signature.
  if (netState.role !== 'solo') {
    for (const av of netAvatars.values()) {
      if (av.group) sig += '|T' + av.group.position.x.toFixed(1) + ',' + av.group.position.z.toFixed(1) + ',' + (av.down ? 1 : 0);
    }
  }
  if (sig === minimapSig) return;
  minimapSig = sig;

  const canvas = document.getElementById('minimapCanvas');
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const gh = mazeGrid.length, gw = mazeGrid[0].length;

  ctx.clearRect(0, 0, w, h);

  // Background
  ctx.fillStyle = 'rgba(0,10,0,0.5)';
  ctx.fillRect(0, 0, w, h);

  const cellW = w / gw, cellH = h / gh;

  // Draw maze cells (fog mode: unrevealed cells are near-black voids)
  const fog = minimapMode === 'fog';
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      if (fog && !seenGrid[y][x]) {
        ctx.fillStyle = 'rgba(0,0,0,0.88)';
      } else if (mazeGrid[y][x] === 2) {
        ctx.fillStyle = 'rgba(30,120,160,0.6)'; // pool basin — water blue
      } else if (mazeGrid[y][x] === 1) {
        ctx.fillStyle = 'rgba(60,80,60,0.4)';
      } else {
        ctx.fillStyle = 'rgba(20,30,20,0.7)';
      }
      ctx.fillRect(x * cellW, y * cellH, cellW, cellH);
    }
  }

  // Grid lines
  ctx.strokeStyle = 'rgba(0,100,30,0.12)';
  ctx.lineWidth = 0.5;
  for (let x = 0; x <= gw; x++) {
    ctx.beginPath(); ctx.moveTo(x * cellW, 0); ctx.lineTo(x * cellW, h); ctx.stroke();
  }
  for (let y = 0; y <= gh; y++) {
    ctx.beginPath(); ctx.moveTo(0, y * cellH); ctx.lineTo(w, y * cellH); ctx.stroke();
  }

  // Exit zone — in fog mode, hidden until the player has discovered its cell
  if (exitZone && isCellSeen(exitZone.x, exitZone.z)) {
    const ex = exitZone.x / CELL * cellW;
    const ez = exitZone.z / CELL * cellH;
    ctx.beginPath();
    ctx.arc(ex, ez, 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(68,255,136,0.8)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ex, ez, 7, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(68,255,136,0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Enemy blips — only inside revealed cells (real enemies on host/solo,
  // mirrored enemies on MP clients — `blips` from the sig pass above)
  for (const b of blips) {
    if (!isCellSeen(b.x, b.z)) continue;
    const ex = b.x / CELL * cellW;
    const ez = b.z / CELL * cellH;
    ctx.beginPath();
    ctx.arc(ex, ez, 2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,50,30,0.75)';
    ctx.fill();
  }

  // Boss blip — only once its cell has been revealed
  if (bossBlip && isCellSeen(bossBlip.x, bossBlip.z)) {
    const bx = bossBlip.x / CELL * cellW;
    const bz = bossBlip.z / CELL * cellH;
    ctx.beginPath();
    ctx.arc(bx, bz, 5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,0,0,0.9)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(bx, bz, 8, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,0,0,0.3)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // MP: teammate markers — slot-colored arrow dots, drawn through fog (the sig
  // pass above already included them unconditionally). Downed = red ring.
  if (netState.role !== 'solo') {
    for (const av of netAvatars.values()) {
      if (!av.group) continue;
      const tx = av.group.position.x / CELL * cellW;
      const tz = av.group.position.z / CELL * cellH;
      const col = '#' + netColorOf(av.id).toString(16).padStart(6, '0');
      ctx.beginPath();
      ctx.arc(tx, tz, 3, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();
      // facing tick (same forward mapping as the local player arrow below)
      ctx.beginPath();
      ctx.moveTo(tx, tz);
      ctx.lineTo(tx - Math.sin(av.target.yaw) * 6, tz - Math.cos(av.target.yaw) * 6);
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      if (av.down) {
        ctx.beginPath();
        ctx.arc(tx, tz, 6, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,40,40,0.9)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
  }

  // Player
  const px = player.pos.x / CELL * cellW;
  const pz = player.pos.z / CELL * cellH;
  ctx.beginPath();
  ctx.arc(px, pz, 3, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,255,80,0.9)';
  ctx.fill();

  // Player direction
  const dirLen = 8;
  // Match the world-space forward vector used in updatePlayer:
  // forward = (-sin(yaw), -cos(yaw)) in (x, z), and the minimap maps world x->x, z->y directly.
  const dx2 = px - Math.sin(player.yaw) * dirLen;
  const dz2 = pz - Math.cos(player.yaw) * dirLen;
  ctx.beginPath();
  ctx.moveTo(px, pz);
  ctx.lineTo(dx2, dz2);
  ctx.strokeStyle = 'rgba(0,255,80,0.5)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Border
  ctx.strokeStyle = 'rgba(212,195,106,0.2)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0, 0, w, h);
}

/* ═══════════════════════════════════════════
   HUD
   updateHUD runs EVERY frame, so all writes go through change-detecting setters:
   element refs are looked up once, and the DOM is only touched when the string
   actually differs from what was last written. Steady-state frames (full
   stamina, no kills) cost zero DOM writes / zero style recalcs.
   NOTE: anything else that writes one of these same properties must use these
   setters too (see playerShoot/playerReload), or the cache goes stale and a
   later updateHUD write gets skipped.
   ═══════════════════════════════════════════ */
const _hudEls = {};
const _hudCache = {};
function hudEl(id) { return _hudEls[id] || (_hudEls[id] = document.getElementById(id)); }
function hudSetText(id, v) { if (_hudCache['t:' + id] !== v) { _hudCache['t:' + id] = v; hudEl(id).textContent = v; } }
let _goalHudOpen = false; // class-toggle cache for the party-goal pulse state
function hudSetStyle(id, prop, v) {
  const k = prop + ':' + id;
  if (_hudCache[k] !== v) { _hudCache[k] = v; hudEl(id).style[prop] = v; }
}

function updateHUD() {
  const theme = getTheme(currentFloor);
  // bar widths rounded to 0.1% so a slowly-regenerating stat doesn't produce a
  // new string (= a new layout pass) on literally every frame
  hudSetStyle('healthFill', 'width', (player.health / shopStats.maxHealth * 100).toFixed(1) + '%');
  hudSetStyle('staminaFill', 'width', (player.stamina / MAX_STAMINA * 100).toFixed(1) + '%');
  hudSetText('ammoCurrent', String(player.clipAmmo));
  hudSetText('ammoReserve', '/ ' + player.reserveAmmo);
  hudSetText('hudFloor', 'Level ' + currentFloor);
  hudSetText('hudLevelName', theme.name);
  hudSetText('hudWave', theme.isBoss ? 'BOSS' : 'Wave ' + currentWave);
  // PARTY GOAL — top center, co-op only (solo has no kill gate; boss floors
  // gate on the boss itself). Host counts kills authoritatively; clients
  // mirror via the snapshot's `k`. Personal kills stay in hudKills below.
  if (netState.role !== 'solo' && !theme.isBoss && killTarget > 0) {
    const open = floorKills >= killTarget;
    hudSetStyle('goalHud', 'display', 'block');
    hudSetText('goalHudText', open ? 'EXIT OPEN — FIND THE EXIT' : `ELIMINATIONS ${floorKills}/${killTarget}`);
    hudSetStyle('goalHudFill', 'width', Math.min(100, floorKills / killTarget * 100).toFixed(0) + '%');
    if (open !== _goalHudOpen) {
      _goalHudOpen = open;
      hudEl('goalHud').classList.toggle('goal-open', open);
    }
  } else {
    hudSetStyle('goalHud', 'display', 'none');
  }
  hudSetText('hudKills', 'Kills: ' + player.kills);
  hudSetText('hudMoney', '$' + playerMoney);

  const hpPct = player.health / shopStats.maxHealth;
  let hpGrad;
  if (hpPct < 0.25) hpGrad = 'linear-gradient(90deg,#ff0000,#ff2200)';
  else if (hpPct < 0.55) hpGrad = 'linear-gradient(90deg,#ff6622,#ffaa33)';
  else hpGrad = 'linear-gradient(90deg,#ff2222,#ff6644)';
  hudSetStyle('healthFill', 'background', hpGrad);

  const warn = (player.clipAmmo === 0 && player.reserveAmmo > 0 && !player.isReloading) ? '1' : '0';
  hudSetStyle('ammoWarning', 'opacity', warn);
}

function updateHUDTimers(dt) {
  if (damageVigTimer > 0) {
    damageVigTimer -= dt;
    document.getElementById('damageVignette').style.opacity = Math.min(1, damageVigTimer * 2.5);
  } else {
    document.getElementById('damageVignette').style.opacity = '0';
  }

  const hm = document.getElementById('hitmarker');
  if (hitmarkerTimer > 0) {
    hitmarkerTimer -= dt;
    hm.style.opacity = '1';
    if (hitmarkerKill) hm.classList.add('kill'); else hm.classList.remove('kill');
  } else { hm.style.opacity = '0'; }

  for (const dir of ['left', 'right', 'top', 'bottom']) {
    if (dmgInd[dir] > 0) {
      dmgInd[dir] -= dt;
      document.getElementById('dmg' + dir.charAt(0).toUpperCase() + dir.slice(1)).style.opacity = Math.min(1, dmgInd[dir] * 2.5);
    } else {
      document.getElementById('dmg' + dir.charAt(0).toUpperCase() + dir.slice(1)).style.opacity = '0';
    }
  }

  if (floorAnnounceTimer > 0) {
    floorAnnounceTimer -= dt;
    const elapsed = FLOOR_ANNOUNCE_TOTAL - floorAnnounceTimer;
    // ramp(a,b): 0 before a, 1 after b, linear in between — used to build smooth fades.
    const ramp = (a, b) => Math.max(0, Math.min(1, (elapsed - a) / (b - a)));
    // Step 1 "LEVEL N": fade in 0.0-0.4s, hold, fade out 1.5-1.9s.
    const lvlOp = ramp(0, 0.4) * (1 - ramp(1.5, 1.9));
    // Step 2 level name + subtitle: fade in 1.9-2.3s, hold, fade out 3.5-4.0s.
    const nameOp = ramp(1.9, 2.3) * (1 - ramp(3.5, 4.0));
    document.getElementById('faLevel').style.opacity = lvlOp.toFixed(3);
    document.getElementById('faName').style.opacity = nameOp.toFixed(3);
    document.getElementById('faSubtitle').style.opacity = nameOp.toFixed(3);
    if (floorAnnounceTimer <= 0) document.getElementById('floorAnnounce').style.opacity = '0';
  }
}

/* ═══════════════════════════════════════════
   LIGHTS
   ═══════════════════════════════════════════ */
function updateLights(dt) {
  for (const f of flickerTimers) {
    f.timer -= dt;
    if (f.timer <= 0) {
      f.timer = f.nextFlicker;
      f.nextFlicker = 0.5 + Math.random() * 6;
      const orig = f.base;
      f.light.intensity = orig * 0.05;
      setTimeout(() => { f.light.intensity = orig; }, 40 + Math.random() * 80);
      if (Math.random() < 0.35) {
        setTimeout(() => { if (f.light) f.light.intensity = orig * 0.15; }, 150);
        setTimeout(() => { if (f.light) f.light.intensity = orig; }, 200 + Math.random() * 60);
      }
    }
  }

  if (exitMesh) {
    exitMesh.rotation.y += dt * 0.6;
    exitMesh.material.emissiveIntensity = 0.4 + Math.sin(clock.getElapsedTime() * 2.5) * 0.25;
  }
}

/* ═══════════════════════════════════════════
   GAME FLOW
   ═══════════════════════════════════════════ */
function startGame() {
  if (!modelsReady) return; // preload gate backstop — loading screen still covers the menu
  // MP: a connected CLIENT never starts its own run — the host's game_start
  // message drives it (net.js shows "waiting for host" and calls back in here).
  if (netGateStart()) return;

  initAudio();
  startAmbient();

  player.health = shopStats.maxHealth;
  player.stamina = MAX_STAMINA;
  player.clipAmmo = shopStats.clipSize;
  player.reserveAmmo = shopStats.reserveMax;
  player.isReloading = false;
  player.kills = 0;
  player.floorReached = 0;
  player.yaw = 0;
  player.pitch = 0;
  player.isADS = false;
  player.currentFOV = DEFAULT_FOV;
  currentFloor = selectedStartFloor; currentWave = 1; // 0 for a normal start; or a chosen unlocked/dev floor
  player.floorReached = currentFloor;
  flashlightOn = false;
  adsLerp = 0;
  bossEntity = null;
  bossProjectiles = [];

  playerMoney = 0;
  shopStats = {
    damageMult: 1.0,
    fireRateMult: 1.0,
    clipSize: CLIP_SIZE,
    staminaRegenMult: 1.0,
    reserveMax: RESERVE_MAX,
    maxHealth: MAX_HEALTH,
  };
  for (const k in shopUpgrades) shopUpgrades[k].bought = false;

  const theme = generateCurrentFloor();
  // MP: the HOST announces the run (floor + seed) so connected clients start
  // the identical level via this same deterministic path. No-op solo/client.
  netOnHostStart(currentFloor, floorSeed);
  buildMazeScene();

  document.getElementById('startMenu').style.display = 'none';
  document.getElementById('gameOverMenu').style.display = 'none';
  document.getElementById('pauseMenu').style.display = 'none';
  document.getElementById('hud').style.display = 'block';
  document.getElementById('bossHpContainer').style.opacity = '0';

  gameState = 'playing';
  tryPointerLock(); // same cooldown applies on a fast quit→restart
  updateHUD();
  updateFlashlightHUD();
  showFloorAnnounce();
  if (theme.isBoss) {
    setTimeout(() => { if (gameState === 'playing') spawnBoss(); }, 2000);
  } else {
    setTimeout(() => { if (gameState === 'playing') spawnWave(); }, 2000);
  }
}

// Request pointer lock, tolerating failure. Chrome enforces a ~1.25s cooldown
// after an Esc-release; a request inside that window is REJECTED (it fires
// 'pointerlockerror', NOT 'pointerlockchange'), which used to strand the game
// in 'playing' with a free cursor and no way back. Failures are recovered by
// the click-to-relock fallback in the mousedown handler.
function tryPointerLock() {
  const p = document.body.requestPointerLock();
  // Modern Chrome returns a Promise; swallow the cooldown rejection (the
  // pointerlockerror event + click fallback handle recovery).
  if (p && typeof p.catch === 'function') p.catch(() => {});
}

function pauseGame() {
  if (gameState !== 'playing') return;
  gameState = 'paused';
  document.getElementById('pauseMenu').style.display = 'flex';
  document.exitPointerLock();
}

function resumeGame() {
  if (gameState !== 'paused') return;
  gameState = 'playing';
  document.getElementById('pauseMenu').style.display = 'none';
  tryPointerLock(); // may fail inside Chrome's post-Esc cooldown → click re-locks
}

function gameOver() {
  gameState = 'gameover';
  stopLevelFunMusic(); // don't let the Level Fun loop bleed into the game-over screen
  document.getElementById('hud').style.display = 'none';
  document.getElementById('gameOverMenu').style.display = 'flex';
  document.getElementById('bossHpContainer').style.opacity = '0';
  const theme = getTheme(player.floorReached);
  document.getElementById('goStats').innerHTML =
    `Reached: Level ${player.floorReached} — ${theme.name}<br>Enemies Eliminated: ${player.kills}<br>Waves Survived: ${currentWave - 1}`;
  document.exitPointerLock();
}

function quitToMenu() {
  gameState = 'menu';
  stopLevelFunMusic(); // stop Level Fun loop when bailing to the menu
  document.getElementById('pauseMenu').style.display = 'none';
  document.getElementById('hud').style.display = 'none';
  buildPlayerLevelSelect(); // PART 2: refresh unlocks earned this run
  document.getElementById('startMenu').style.display = 'flex';
  document.getElementById('bossHpContainer').style.opacity = '0';
  document.exitPointerLock();
}

/* ═══════════════════════════════════════════
   DEV TOOLS — enemy type labels (toggle: L)
   Self-contained debug overlay. Labels are created
   lazily (only while debugLabels is on) so there is
   zero cost during normal play. Zero-asset: text is
   drawn to a canvas, no external fonts/images.
   ═══════════════════════════════════════════ */
window.debugLabels = false; // on window so it's inspectable/toggleable from the console

// Build a camera-facing text sprite (white text, dark outline).
function makeDebugLabel(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 256, 64);
  ctx.font = 'bold 34px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#000000';
  ctx.strokeText(text, 128, 32); // dark outline for readability
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, 128, 32);

  const tex = new THREE.CanvasTexture(canvas);
  texMarkSRGB(tex);
  tex.minFilter = THREE.LinearFilter;
  // depthTest off so the label is readable even through the mob/walls
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.4, 0.35, 1); // world units
  sprite.renderOrder = 999;
  return sprite;
}

// Remove a single holder's label (enemy or boss) and free its texture.
function removeDebugLabel(holder) {
  if (holder && holder.debugLabel) {
    scene.remove(holder.debugLabel);
    holder.debugLabel.material.map.dispose();
    holder.debugLabel.material.dispose();
    holder.debugLabel = null;
  }
}

// Tear down every label (called when the feature is toggled off).
function clearDebugLabels() {
  for (const e of enemies) removeDebugLabel(e);
  removeDebugLabel(bossEntity);
}

/* ═══════════════════════════════════════════
   INPUT
   ═══════════════════════════════════════════ */
document.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'KeyR' && gameState === 'playing') playerReload();
  if (e.code === 'KeyF' && gameState === 'playing') toggleFlashlight();
  if (DEV_MODE && e.code === 'KeyL' && gameState === 'playing') { // PART 1: dev-only debug labels
    window.debugLabels = !window.debugLabels;     // DEV: toggle enemy type labels
    console.log('debug labels:', window.debugLabels); // confirms the L handler fired
    if (!window.debugLabels) clearDebugLabels();  // tear down immediately when off
  }
  if (e.code === 'Escape') {
    e.preventDefault();
    if (gameState === 'playing') pauseGame();
    else if (gameState === 'paused') resumeGame();
  }
});
document.addEventListener('keyup', e => { keys[e.code] = false; });

document.addEventListener('mousemove', e => {
  if (gameState !== 'playing' || document.pointerLockElement !== document.body) return;
  player.yaw -= e.movementX * MOUSE_SENS;
  player.pitch -= e.movementY * MOUSE_SENS;
  player.pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, player.pitch));
});

document.addEventListener('mousedown', e => {
  if (e.button === 0) {
    mouseDown = true;
    if (gameState === 'playing') {
      if (document.pointerLockElement === document.body) {
        playerShoot();
      } else {
        // FALLBACK: playing but not locked — happens when resumeGame's relock
        // was rejected by Chrome's post-Esc cooldown. Clicking the game area
        // re-acquires the lock (this click does NOT fire a shot).
        tryPointerLock();
      }
    }
  }
  if (e.button === 2) {
    rightMouseDown = true;
    if (gameState === 'playing') player.isADS = true;
  }
});
document.addEventListener('mouseup', e => {
  if (e.button === 0) mouseDown = false;
  if (e.button === 2) {
    rightMouseDown = false;
    player.isADS = false;
  }
});

// Prevent context menu on right-click
document.addEventListener('contextmenu', e => { e.preventDefault(); });

document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== document.body && gameState === 'playing') pauseGame();
});

// Fires when a lock request is rejected (typically Chrome's ~1.25s post-Esc
// cooldown). No state change needed — the game is either paused (menu visible)
// or playing-unlocked, where the mousedown fallback re-requests on next click.
document.addEventListener('pointerlockerror', () => {
  console.warn('[pointerlock] request rejected (browser cooldown?) — click the game area to re-lock.');
});

document.getElementById('btnStart').addEventListener('click', startGame);
document.getElementById('btnControls').addEventListener('click', () => {
  const ci = document.getElementById('controlsInfo');
  ci.style.display = ci.style.display === 'none' ? 'block' : 'none';
});
document.getElementById('btnResume').addEventListener('click', resumeGame);
document.getElementById('btnQuit').addEventListener('click', quitToMenu);
document.getElementById('btnRestart').addEventListener('click', startGame);

/* ════ PART 1 — DEV TOOL: unrestricted level-select (jump to ANY floor). Only built
   when ?dev=1; otherwise the whole #devLevelSelect block is hidden so friends never
   see it. Clicking sets selectedStartFloor, which startGame() uses as the start floor.
   ════ */
(function buildDevLevelSelect() {
  const panel = document.getElementById('devLevelSelect');
  if (!DEV_MODE) { if (panel) panel.style.display = 'none'; return; }
  const wrap = document.getElementById('devLevelButtons');
  const label = document.getElementById('devSelectedFloor');
  if (!wrap) return;
  LEVEL_THEMES.forEach((theme, i) => {
    const b = document.createElement('button');
    b.className = 'dev-ls-btn' + (theme.isBoss ? ' boss' : '') + (i === selectedStartFloor ? ' selected' : '');
    b.textContent = i;
    b.title = theme.name + (theme.archetype ? ' [' + theme.archetype + ']' : '');
    b.addEventListener('click', () => {
      selectedStartFloor = i;
      label.textContent = i;
      wrap.querySelectorAll('.dev-ls-btn').forEach(el => el.classList.remove('selected'));
      b.classList.add('selected');
    });
    wrap.appendChild(b);
  });
})();

/* ════ PART 2 — PLAYER level-select (always visible). Replays of BEATEN levels only:
   floor 0 is unlocked from the start, each cleared floor unlocks the next. Locked
   floors render greyed with a 🔒 and aren't clickable. Rebuilt whenever the start menu
   is shown so newly-unlocked floors appear. Sets selectedStartFloor on click. ════ */
function buildPlayerLevelSelect() {
  const wrap = document.getElementById('playerLevelButtons');
  if (!wrap) return;
  wrap.innerHTML = '';
  LEVEL_THEMES.forEach((theme, i) => {
    const unlocked = isFloorUnlocked(i);
    const b = document.createElement('button');
    b.className = 'pls-btn'
      + (theme.isBoss ? ' boss' : '')
      + (unlocked ? '' : ' locked')
      + (i === selectedStartFloor ? ' selected' : '');
    b.textContent = unlocked ? (i + 1) : '🔒';   // friendly 1-based number; lock when gated
    b.title = unlocked
      ? ('Level ' + (i + 1) + ' — ' + theme.name + (theme.isBoss ? ' (Boss)' : ''))
      : ('Locked — beat Level ' + i + ' to unlock');
    if (unlocked) {
      b.addEventListener('click', () => {
        selectedStartFloor = i;
        wrap.querySelectorAll('.pls-btn').forEach(el => el.classList.remove('selected'));
        b.classList.add('selected');
      });
    } else {
      b.disabled = true;
    }
    wrap.appendChild(b);
  });
}
buildPlayerLevelSelect(); // initial build at load

// PART 1: hide the FPS readout entirely unless ?dev=1 (the update is already gated).
if (!DEV_MODE) {
  const _fps = document.getElementById('hudFps'); if (_fps) _fps.style.display = 'none';
  const _st = document.getElementById('hudStats'); if (_st) _st.style.display = 'none';
}

/* ════ PAUSE-MENU SETTINGS: minimap mode + gun sound (both persisted) ════ */
// Cycle Fog of War → Always On → Off. setMinimapMode persists + syncs the label.
document.getElementById('btnMinimapMode').addEventListener('click', () => {
  const next = MINIMAP_MODES[(MINIMAP_MODES.indexOf(minimapMode) + 1) % MINIMAP_MODES.length];
  setMinimapMode(next);
});
// Cycle Sharp → Heavy → Suppressed, then TEST-FIRE the new sound immediately
// (no-op before the first game start, when the AudioContext doesn't exist yet).
document.getElementById('btnGunSound').addEventListener('click', () => {
  const next = GUN_SOUND_MODES[(GUN_SOUND_MODES.indexOf(gunSoundMode) + 1) % GUN_SOUND_MODES.length];
  setGunSoundMode(next);
  document.getElementById('btnGunSound').textContent = GUN_SOUND_LABELS[gunSoundMode];
  playGunshot(); // instant preview of the selected variant
});
// Sync both buttons + minimap visibility with the persisted choices at load.
setMinimapMode(minimapMode);
document.getElementById('btnGunSound').textContent = GUN_SOUND_LABELS[gunSoundMode];

// Volume sliders → audio gain nodes (sliders are 0–100, gains are 0–1)
document.getElementById('sliderVolMaster').addEventListener('input', e => {
  volMaster = e.target.value / 100;
  if (masterGain) masterGain.gain.value = volMaster;
  document.getElementById('lblVolMaster').textContent = e.target.value + '%';
});
document.getElementById('sliderVolSFX').addEventListener('input', e => {
  volSFX = e.target.value / 100;
  if (sfxGain) sfxGain.gain.value = volSFX;
  document.getElementById('lblVolSFX').textContent = e.target.value + '%';
});
document.getElementById('sliderVolAmbient').addEventListener('input', e => {
  volAmbient = e.target.value / 100;
  if (ambientGain) ambientGain.gain.value = volAmbient;
  document.getElementById('lblVolAmbient').textContent = e.target.value + '%';
});

/* ═══════════════════════════════════════════
   SHOP SYSTEM
   ═══════════════════════════════════════════ */
function updateShopUI() {
  document.getElementById('shopBalance').textContent = 'Balance: $' + playerMoney;
  const grid = document.getElementById('shopGrid');
  grid.innerHTML = '';
  
  for (const [key, up] of Object.entries(shopUpgrades)) {
    const div = document.createElement('div');
    div.className = 'shop-item' + (up.bought ? ' purchased' : '');
    
    let canAfford = playerMoney >= up.cost;
    let reqMet = !up.requires || shopUpgrades[up.requires].bought;
    
    if (!reqMet) {
      div.style.opacity = '0.15';
      div.style.pointerEvents = 'none';
    }

    div.innerHTML = `
      <div class="shop-item-name">${up.name}</div>
      <div class="shop-item-desc">${up.desc}</div>
      ${up.bought ? '<div class="shop-item-owned">OWNED</div>' : `<div class="shop-item-cost">$${up.cost}</div>`}
    `;

    if (!up.bought && reqMet) {
      div.addEventListener('click', () => {
        if (playerMoney >= up.cost) {
          playerMoney -= up.cost;
          up.bought = true;
          up.apply();
          
          // Heal/ammo fill up to new max on upgrades
          if (key.includes('health')) player.health = shopStats.maxHealth;
          if (key.includes('mag')) player.clipAmmo = shopStats.clipSize;
          if (key.includes('reserve')) player.reserveAmmo = shopStats.reserveMax;

          div.classList.add('shop-flash');
          playReload();
          updateShopUI();
          updateHUD();
        } else {
          div.classList.remove('shop-insufficient');
          void div.offsetWidth; // trigger reflow
          div.classList.add('shop-insufficient');
        }
      });
    }
    grid.appendChild(div);
  }
}

document.getElementById('btnShop').addEventListener('click', () => {
  document.getElementById('pauseMenu').style.display = 'none';
  document.getElementById('shopOverlay').style.display = 'flex';
  updateShopUI();
});

document.getElementById('btnShopClose').addEventListener('click', () => {
  document.getElementById('shopOverlay').style.display = 'none';
  document.getElementById('pauseMenu').style.display = 'flex';
});

/* ═══════════════════════════════════════════
   INIT & LOOP
   ═══════════════════════════════════════════ */
function init() {
  initSpriteTextures();
  loadBossSprites();  // swap procedural boss placeholders for custom PNGs (falls back if a PNG fails)

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d0a04);

  camera = new THREE.PerspectiveCamera(DEFAULT_FOV, window.innerWidth / window.innerHeight, 0.05, 200);

  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.85;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.domElement.id = 'gameCanvas';
  document.body.prepend(renderer.domElement);

  clock = new THREE.Clock();

  // initSpriteTextures above created the mob-sprite batch; theme/water/label
  // textures are tagged the same way lazily as they're first created.
  console.log(`[TEX] sRGB encoding applied to ${srgbCanvasTexCount} canvas textures`);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // PRELOAD GATE: load every mob GLB before dropping the loading screen. The bar
  // tracks real download bytes (~3.7 MB across 5 optimized models), so slow
  // connections see honest progress instead of an instant fake "100%". onComplete
  // fires even if a model 404s — that model keeps its placeholder; never blocks.
  const loadText = document.querySelector('#loadingScreen .loading-text');
  preloadMobModels(
    frac => {
      const pct = Math.round(frac * 100);
      document.getElementById('loadBarFill').style.width = pct + '%';
      if (loadText) loadText.textContent = 'Noclipping... ' + pct + '%';
    },
    () => {
      modelsReady = true;
      document.getElementById('loadBarFill').style.width = '100%';
      if (loadText) loadText.textContent = 'Noclipping... 100%';
      setTimeout(() => { document.getElementById('loadingScreen').style.display = 'none'; }, 400);
    }
  );

  animate();
}

// FPS counter — sampled over a rolling window so the readout is steady, not jittery
let _fpsFrames = 0, _fpsAccum = 0, _fpsValue = 0;
function updateFpsCounter(dt) {
  if (!DEV_MODE) return; // PART 1: FPS counter is a dev-only tool
  _fpsFrames++;
  _fpsAccum += dt;
  if (_fpsAccum >= 0.5) { // refresh twice a second
    _fpsValue = Math.round(_fpsFrames / _fpsAccum);
    _fpsFrames = 0; _fpsAccum = 0;
    const el = document.getElementById('hudFps');
    if (el) el.textContent = 'FPS: ' + _fpsValue;
  }
}

// DEV: extended renderer stats (?dev=1 only). renderer.info resets on every
// renderer.render() call, so it must be sampled AFTER render, same frame.
// The scene traversal for light counts only runs on the throttled refresh tick.
let _statsAccum = 0;
function updateRendererStats(dt) {
  if (!DEV_MODE) return;
  _statsAccum += dt;
  if (_statsAccum < 0.5) return;
  _statsAccum = 0;
  const el = document.getElementById('hudStats');
  if (!el) return;

  let ptTotal = 0, ptLit = 0, spotOn = 0;
  scene.traverse(o => {
    if (o.isPointLight) { ptTotal++; if (o.visible && o.intensity > 0) ptLit++; }
    else if (o.isSpotLight && o.visible) spotOn++;
  });

  const r = renderer.info.render, m = renderer.info.memory;
  el.textContent =
    `DRAW ${r.calls}  TRIS ${(r.triangles / 1000).toFixed(1)}k  PROG ${renderer.info.programs.length}\n` +
    `GEO ${m.geometries}  TEX ${m.textures}  PTLIGHT ${ptLit}/${ptTotal}  SPOT ${spotOn}\n` +
    `DPR ${window.devicePixelRatio.toFixed(2)}→${renderer.getPixelRatio().toFixed(2)}  ` +
    `CANVAS ${renderer.domElement.width}x${renderer.domElement.height}`;
}

function animate() {
  requestAnimationFrame(animate);
  const rawDt = clock.getDelta();        // true frame time (for the FPS readout)
  const dt = Math.min(rawDt, 0.05);      // clamped for stable physics/gameplay

  updateFpsCounter(rawDt);

  if (gameState === 'playing') {
    updatePlayer(dt);
    if (netIsClient()) {
      // MP CLIENT: the host owns ALL enemy/boss simulation. We only animate
      // the mirrored visuals built from its snapshots — no AI, no spawning,
      // no anti-linger here.
      netClientUpdate(dt);
    } else {
      // host AND solo: the existing simulation, unchanged
      updateEnemies(dt);
      updateBoss(dt);
      updateBossProjectiles(dt);
      updateAntiLinger(dt);
    }
    updateMinimap(dt);
    updateLights(dt);
    updateHUDTimers(dt);
    updateAmbient(dt);
    updateWaterFX(dt); // pools floors: water UV drift + caustics pulse (no-op elsewhere)
    updateBulletTrails(dt);
    updateAmmoPickups(dt);
    updateHUD();
  }

  // MP: position send (15Hz) + remote avatar smoothing. Immediate no-op solo.
  netUpdate(dt);

  renderer.render(scene, camera);
  updateRendererStats(rawDt);
}

init();

