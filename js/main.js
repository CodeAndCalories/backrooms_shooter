
"use strict";

/* ═══════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════ */
const CELL = 4, WALL_H = 3.4;
const GRAVITY = 22, JUMP_V = 8, MOVE_SPEED = 5.5, SPRINT_MULT = 1.65;
const MOUSE_SENS = 0.0018;
const MAX_HEALTH = 100, MAX_STAMINA = 100, STAMINA_DRAIN = 22, STAMINA_REGEN = 14;

/* ── SANITY (gentle, atmospheric — per-player, PERSISTS across floors; only ever
   drains from TAKING damage, never ambient/dark). "More noticeable" tuning.
   ALL of these are meant to be tweaked — they're the knobs the design asked to see. */
const MAX_SANITY = 100;
const SANITY_DRAIN_PER_DMG = 0.60;   // sanity lost per point of damage taken
const SANITY_DRAIN_CAP    = 16;      // ...capped per hit (one big boss hit ≠ instant break)
const SANITY_RECOVER_RATE = 0.9;     // passive sanity regained per second once calm
const SANITY_RECOVER_DELAY = 10;     // seconds with no damage before passive recovery starts
const SANITY_LOW      = 55;          // whisper + vignette begin below this
const SANITY_CRITICAL = 30;          // stronger unease (breathing vignette, denser whispers) below this
const SANITY_SAFE_THEME = 3;         // Poolrooms — calm zone, sanity never drains here

/* ── CONSUMABLES — inventory items that heal OVER TIME (never instant). Carry up
   to 3 of each. Almond Water → sanity, Bandages → health. Buyable + findable. ── */
const CONSUMABLE_MAX  = 3;           // carry cap per kind
const ALMOND_RESTORE  = 30;          // sanity restored per Almond Water (delivered over time)
const ALMOND_PRICE    = 140;         // Black Market price (repeatable)
const BANDAGE_RESTORE = 40;          // health restored per Bandage (delivered over time)
const BANDAGE_PRICE   = 150;
const SANITY_HEAL_RATE = 6;          // sanity/sec drained from the almond regen pool
const HEALTH_HEAL_RATE = 8;          // health/sec drained from the bandage regen pool
const CONSUMABLE_PICKUP_RADIUS = 1.1;
const CONSUMABLE_DROP_CHANCE = 0.06; // kill-drop chance (then ~65% almond / 35% bandage)
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

// Balloon trap (Level Fun) constants
const MOB_HARD_CAP = 30;      // total live mobs — a pop spawns fewer rather than exceed this
const BALLOON_TRAP_AGGRO = 9; // seconds trap partygoers stay locked on the popper (or until they land a hit)

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
            speedMult: 1.0, hpMult: 0.7, countMult: 1.5, waveBase: 4, waveCap: 12 },
    // REAL MUSIC FILE (Suno Pro, .mp3). Two takes exist → a random one plays each
    // visit (the other is the load fallback). REPLACES the procedural music box (no
    // musicLayer); falls back to procedural if BOTH files are missing.
    musicFile: ['assets/audio/level_fun_1.mp3', 'assets/audio/level_fun_2.mp3'],
    musicCredit: 'Level Fun · Suno'
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
            speedMult: 0.95, hpMult: 1.15, countMult: 1.0, waveBase: 3, waveCap: 9 },
    // OBJECTIVE: the relics ARE the exit gate (kills not required — mobs still
    // spawn as pressure). See the gate-condition system / spawnArtifacts.
    gate: 'item', itemCount: 2, itemLabel: 'RELICS', itemName: 'relic'
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
            speedMult: 1.05, hpMult: 1.1, countMult: 1.0, waveBase: 4, waveCap: 10 },
    // OBJECTIVE: recover the patient records to open the exit (kills not required).
    gate: 'item', itemCount: 3, itemLabel: 'RECORDS', itemName: 'patient record'
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
            speedMult: 1.0, hpMult: 1.05, countMult: 0.9, waveBase: 4, waveCap: 9 },
    // OBJECTIVE: find the lost files to open the exit (kills not required).
    gate: 'item', itemCount: 3, itemLabel: 'FILES', itemName: 'lost file'
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
  },
  {
    id: 17,
    archetype: 'chase', // CHASE level: winding hotel corridor, run from an unkillable pursuer to the far exit
    name: "Hotel Chase",
    subtitle: "Run for your life. Don't stop. Don't look back. The hallways go on forever.",
    // Vintage hotel: deep maroon patterned wallpaper, dark-red carpet, neon-RED light.
    wallColor: '#5e2530', wallColor2: '#43161e',
    floorColor: '#3a1216', floorColor2: '#290c10',
    ceilColor: '#4a1c22',
    fogColor: 0x140204, fogNear: 1, fogFar: 20,
    lightColor: 0xff2630, lightIntensity: 0.62,   // blaring neon RED corridor lights
    ambientColor: 0x3a0a0c, ambientIntensity: 0.05,
    bgColor: 0x0e0203,
    mazeSize: 12,
    floorType: 'carpet',
    decorations: 'hotel',
    enemyTint: 0.5,
    darknessLevel: 0.5,
    // OBJECTIVE: REACH the far exit (no kills, no items — surviving the run wins).
    gate: 'reach', goalText: 'RUN — REACH THE EXIT',
    // THE LEVEL IS THE ENEMY: no stamina drain (sprint forever), 1 unkillable chaser.
    noStamina: true,
    chaserCount: 1,
    // REAL MUSIC FILE (Suno Pro, commercial-licensed). Streamed through ambientGain,
    // looped. musicLayer:true → the track plays OVER the procedural alarm/elevator bed
    // (keeps the chase urgency). If the file is missing, the bed plays alone.
    musicFile: 'assets/audio/hotel_chase.mp3',
    musicLayer: true,
    musicCredit: 'Hotel Chase · Suno',
    // A FEW weak, SLOW shootable mobs scattered as living obstacles in the path —
    // shoot to clear the way, but stopping to fight lets the chaser close in.
    mobs: { types: ['crawler', 'spider'], weights: [3, 1], danger: ['crawler'],
            speedMult: 0.55, hpMult: 0.6, countMult: 0.45, waveBase: 2, waveCap: 4 }
  },
  {
    id: 18,
    archetype: 'rooms', // the classic backrooms maze — most disorienting to navigate BLIND
    name: "Lights Out",
    subtitle: "The dark is total. Your scanner is the only way to see — and it sees you back.",
    // Palette is near-irrelevant (with ambient ~0 + lights off, Standard surfaces
    // render BLACK — only emissive scan dots + the exit beacon are visible) but kept
    // plausibly dark. fog/bg pure black so there's no horizon glow.
    wallColor: '#0c0c10', wallColor2: '#080809',
    floorColor: '#0a0a0c', floorColor2: '#060607',
    ceilColor: '#0a0a0e',
    fogColor: 0x000000, fogNear: 1, fogFar: 16,
    lightColor: 0x223044, lightIntensity: 0.0,   // ceiling lights exist for the budget but stay DARK
    ambientColor: 0x05060a, ambientIntensity: 0.0,
    bgColor: 0x000000,
    mazeSize: 12,
    floorType: 'concrete',
    decorations: 'none',
    enemyTint: 0.6,
    darknessLevel: 1.0,
    // SCANNER FLOOR: total darkness, no flashlight, LMB pulses the scanner (see
    // buildMazeScene darkness override + fireScannerLocal + the dot system).
    scanner: true,
    // OBJECTIVE: find the exit in the dark (no kills — sparse, lethal mobs you evade).
    gate: 'reach', goalText: 'FIND THE EXIT',
    // Sparse but lethal. Stalker (distant growl) + phantom (whisper) — you HEAR them
    // before a scan reveals them (the mob vocalizations carry this floor).
    mobs: { types: ['stalker', 'phantom'], weights: [2, 1], danger: ['danger_stalker'],
            speedMult: 0.85, hpMult: 1.2, countMult: 0.45, waveBase: 2, waveCap: 4 }
  },
  {
    id: 19,
    archetype: 'arena', // boss floors always use generateBossArena — label is informational
    name: "The Last Door",
    subtitle: "Everything these halls swallowed has become one. It stands between you and the way out.",
    // Capstone palette: a deep crimson-black void — the "end of the run" room.
    wallColor: '#2a0a12', wallColor2: '#1a0610',
    floorColor: '#140409', floorColor2: '#0c0206',
    ceilColor: '#240810',
    fogColor: 0x080103, fogNear: 2, fogFar: 50,
    lightColor: 0xff3322, lightIntensity: 0.5,
    ambientColor: 0x2a0610, ambientIntensity: 0.045,
    bgColor: 0x040001,
    mazeSize: 9,            // BIGGER arena than the other bosses (Warden 6 / Amalgam 7 / Hive 8)
    floorType: 'concrete',
    decorations: 'none',
    enemyTint: 0.85,
    darknessLevel: 0.65,
    isBoss: true,
    isFinale: true,         // 20th-floor CAPSTONE: boss death ends the RUN (victory screen, no exit)
    bossName: "THE DEVOURER",
    bossTex: 'boss_amalgam', // reuse the Amalgam sprite ("it has consumed everything") — scaled up
    bossHp: 3600,           // toughest by far (Warden 800 / Amalgam 1400 / Hive 2200) — per-player scaling still applies
    bossScale: 5.0,         // biggest (10m; the arena is built tall to fit — generateBossArena/roomH)
    bossSpeed: 3.4,
    bossDamage: 32,
    bossSpawnCount: 6
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
  // SANITY (persists across floors; reset only on a new run). Heal pools deliver
  // consumable restores gradually. noDamageTimer gates passive recovery.
  sanity: MAX_SANITY, sanityHealPool: 0, healthHealPool: 0, noDamageTimer: SANITY_RECOVER_DELAY,
  almondWater: 0, bandages: 0, // carried consumables (max CONSUMABLE_MAX each)
  isSprinting: false,
  // MP down/revive (Phase 4, co-op only): at 0 HP a co-op player goes DOWN
  // (no move/shoot) instead of game over; a teammate nearby for ~3s revives.
  isDown: false, reviveProgress: 0,
  clipAmmo: CLIP_SIZE, reserveAmmo: RESERVE_MAX,
  isReloading: false, reloadTimer: 0, fireTimer: 0,
  kills: 0, floorReached: 0,
  isADS: false, currentFOV: DEFAULT_FOV,
  // WEAPON SYSTEM: which weapon is equipped + per-weapon ammo bank. clipAmmo/
  // reserveAmmo above always mirror the ACTIVE weapon (so the HUD/reload/shoot
  // code reads one place); switchWeapon stows/restores the bank entry.
  weaponIdx: 0, weaponAmmo: []
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
   PART 1b — DEV PLAYTEST CHEATS (?dev=1 ONLY)
   Toggles/actions for feel-testing (esp. the Hotel Chase chaser) without dying.
   ALL gated behind DEV_MODE at the keydown handler, so the normal/co-op build
   never reads or shows any of this. No protocol impact (purely local state):
     G = God mode (damagePlayer no-ops → no damage, no down)
     I = Infinite ammo (clip never decrements → never empties / never reloads)
     C = Give cash (+$1000)
     K = Kill all mobs (host/solo; spares the unkillable chaser)
   The active toggles + last action show in a small dev-only #hudCheats readout.
   ═══════════════════════════════════════════ */
const DEV_CASH_GRANT = 1000;
let cheatGod = false, cheatInfAmmo = false;
let cheatFlashMsg = '', cheatFlashTO = null;

function renderCheatHud() {
  if (!DEV_MODE) return;
  const el = document.getElementById('hudCheats');
  if (!el) return;
  const parts = [];
  if (cheatGod) parts.push('🛡 GOD');
  if (cheatInfAmmo) parts.push('∞ AMMO');
  if (cheatFlashMsg) parts.push(cheatFlashMsg);
  el.textContent = parts.length ? ('CHEATS  ' + parts.join('   ·   ')) : '';
}
// Briefly show a momentary action (give-cash / kill-all) alongside the toggles.
function cheatFlash(msg) {
  cheatFlashMsg = msg;
  if (cheatFlashTO) clearTimeout(cheatFlashTO);
  cheatFlashTO = setTimeout(() => { cheatFlashMsg = ''; renderCheatHud(); }, 1300);
  renderCheatHud();
}
// Kill every killable mob (host/solo only — clients mirror the host, so killing
// mirrors locally would just desync on the next snapshot). Spares the unkillable
// chaser (the whole point is to feel-test IT). Leaves the wave counter alone so
// it doesn't instantly respawn a fresh wave.
function devKillAllMobs() {
  if (typeof netIsClient === 'function' && netIsClient()) { cheatFlash('KILL-ALL (host only)'); return; }
  let n = 0;
  for (const e of enemies) {
    if (e.alive && !e.unkillable) { e.alive = false; e.deathTimer = 0; n++; }
  }
  cheatFlash('KILLED ' + n);
}
// Dev cheat dispatch — called ONLY from the DEV_MODE-gated keydown branch.
function handleDevCheatKey(code) {
  if (code === 'KeyG') { cheatGod = !cheatGod; renderCheatHud(); }
  else if (code === 'KeyI') {
    cheatInfAmmo = !cheatInfAmmo;
    if (cheatInfAmmo) { player.clipAmmo = wpnClip(curWeapon()); player.reserveAmmo = wpnReserve(curWeapon()); updateHUD(); }
    renderCheatHud();
  }
  else if (code === 'KeyC') { playerMoney += DEV_CASH_GRANT; updateHUD(); cheatFlash('+$' + DEV_CASH_GRANT); }
  else if (code === 'KeyK') { devKillAllMobs(); }
}

/* ═══════════════════════════════════════════
   PART 2 — PLAYER PROGRESSION (unlock gating, persisted)
   Tracks which floors the player has cleared in localStorage so the player-facing
   level-select can gate replays. Floor 0 (Level 1) is always unlocked; floor i
   unlocks once floor i-1 has been beaten. Wholly separate from PART 1's dev tools.
   ═══════════════════════════════════════════ */
// ⚠ PLAYTEST OVERRIDE (TEMPORARY): when true, EVERY floor is unlocked + clickable
// in the PLAYER level-select (the normal menu, no ?dev=1 needed) so we can jump to
// any floor on the live build. Flip back to `false` after the playtest to restore
// the normal unlock-progression gating. (localStorage progress is still recorded
// underneath — only the GATE check is bypassed.)
const ALL_UNLOCKED = true;
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
// Floor 0 is always playable; any other floor needs the previous one beaten —
// UNLESS the ALL_UNLOCKED playtest override is on (then every floor is unlocked).
function isFloorUnlocked(i) { return ALL_UNLOCKED || i === 0 || beatenFloors.has(i - 1); }
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
// Dropped 26→25 to free ONE point-light slot for the flare (below) and stay at
// exactly 32 point lights. 25 still covers the worst real placement (5x5 sample
// grid = 25); the grid-spacing inflater and the placeCeilingLight hard cap both
// read this constant, so the count self-bounds — only the 1 spare pad is gone.
const CEILING_LIGHT_BUDGET = 25;
const BOSS_PROJ_LIGHT_COUNT = 3;  // max concurrent lit boss projectiles
let bossLight = null;             // persistent slot — lit only while a boss is alive
let bossProjLights = [];          // persistent slots — intensity 0 marks a free slot
// Flare light — ONE persistent slot (intensity 0 when idle, same pattern as the
// muzzle flash). Recreated per floor like bossLight; planted by the flare gun.
let flareLight = null;
let programKeepalive = null;      // camera-riding micro-meshes pinning shader programs (see createProgramKeepalive)
let flashlightWarmupToken = 0;    // invalidates in-flight async warm-up frames on rebuild

// Flashlight
let flashlight = null, flashlightOn = false;

// Anti-linger
let floorTimer = 0, dangerLevel = 0, dangerSpawnTimer = 0;

// The single AmbientLight (the budget's "+1 ambient"), held at module scope so
// the DISTANT ROAR scare can briefly dip its intensity (intensity-only, not a
// point light — budget untouched). Reassigned every floor in buildMazeScene.
let ambientLight = null;

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
  // Mag/reserve are now MULTIPLIERS (not absolute counts) so they scale every
  // weapon sensibly. The pistol math is unchanged: 12×1.5=18, 12×2.5=30.
  mag1:      { name: 'Extended Mag',      desc: 'Magazine capacity +50% (all guns)',      cost: 150,  bought: false, apply: () => { shopStats.clipMult = 1.5; } },
  mag2:      { name: 'Drum Magazine',     desc: 'Magazine capacity +150% (all guns)',     cost: 400,  bought: false, apply: () => { shopStats.clipMult = 2.5; }, requires: 'mag1' },
  stamina1:  { name: 'Adrenaline Shot',   desc: 'Stamina recovers 40% faster',            cost: 175,  bought: false, apply: () => { shopStats.staminaRegenMult = 1.4; } },
  stamina2:  { name: 'Endurance Serum',   desc: 'Stamina recovers 100% faster',           cost: 450,  bought: false, apply: () => { shopStats.staminaRegenMult = 2.0; }, requires: 'stamina1' },
  reserve1:  { name: 'Ammo Crate',       desc: 'Max reserve ammo +50% (all guns)',        cost: 200,  bought: false, apply: () => { shopStats.reserveMult = 1.5; } },
  health1:   { name: 'Kevlar Vest',       desc: 'Max health increased to 140',            cost: 300,  bought: false, apply: () => { shopStats.maxHealth = 140; } },
  // ── ARSENAL: weapon unlocks. Per-player like every other upgrade (reset each
  //    run in startGame). apply() is a no-op — ownership is read straight off
  //    `bought` by weaponOwned(); the buy handler tops up that weapon's bank. ──
  wpn_shotgun: { name: 'Sawn-Off Shotgun', desc: '8-pellet close-range boomstick [2]',    cost: 450,  bought: false, apply: () => {}, weapon: 1 },
  wpn_smg:     { name: 'Compact SMG',       desc: 'Fast fire · low dmg · deep mag [3]',    cost: 500,  bought: false, apply: () => {}, weapon: 2 },
  wpn_flare:   { name: 'Flare Pistol',      desc: 'Lights a dark area ~8s [4]',            cost: 350,  bought: false, apply: () => {}, weapon: 3 },
  // ── SUPPLIES: REPEATABLE consumables (never permanently `bought`; the buy
  //    handler special-cases `consumable` — spend → +1 to that inventory, capped). ──
  buy_almond:  { name: 'Almond Water',      desc: 'Restores sanity over time · [Q] to drink', cost: ALMOND_PRICE,  consumable: true, inv: 'almondWater', apply: () => {} },
  buy_bandage: { name: 'Bandages',          desc: 'Heals health over time · [H] to apply',    cost: BANDAGE_PRICE, consumable: true, inv: 'bandages',    apply: () => {} },
};

// Active stat modifiers from shop. clipMult/reserveMult are MULTIPLIERS applied
// to each weapon's own base clip/reserve (see wpnClip/wpnReserve).
let shopStats = {
  damageMult: 1.0,
  fireRateMult: 1.0,
  clipMult: 1.0,
  staminaRegenMult: 1.0,
  reserveMult: 1.0,
  maxHealth: MAX_HEALTH,
};

/* ═══════════════════════════════════════════
   WEAPON SYSTEM — definition table + stat helpers
   Weapon 0 (Pistol) uses the ORIGINAL pistol constants verbatim, so it behaves
   bit-for-bit as before. Shop multipliers (damage/fireRate/clip/reserve) apply
   across every weapon via the wpn* helpers below. Each weapon owns its combat
   stats, a procedural viewmodel builder (build*, declared near createGun and
   hoisted), a sound id, and optional flags (pellets/spread/falloff/flare).
   ═══════════════════════════════════════════ */
const WEAPONS = [
  { id: 0, name: 'Pistol', slot: 1, shopKey: null,
    damage: GUN_DAMAGE, fireRate: FIRE_RATE, clipSize: CLIP_SIZE, reserveMax: RESERVE_MAX,
    reloadTime: RELOAD_TIME, range: GUN_RANGE, pellets: 1, spread: 0,
    recoil: 0.15, muzzleTime: 0.08, muzzleColor: 0xffaa44, muzzleScale: 1.0,
    sound: 'pistol', build: buildPistolViewmodel },

  // Shotgun — close-range panic weapon: 8 pellets, steep damage falloff, slow
  // fire, tiny clip. Per-pellet damage is low; point-blank all 8 = ~112 base.
  { id: 1, name: 'Shotgun', slot: 2, shopKey: 'wpn_shotgun',
    damage: 14, fireRate: 0.85, clipSize: 6, reserveMax: 36,
    reloadTime: 2.4, range: 60, pellets: 8, spread: 0.105,
    falloff: { near: 7, far: 26, farMult: 0.25 },
    recoil: 0.42, muzzleTime: 0.13, muzzleColor: 0xffcc55, muzzleScale: 2.0,
    sound: 'shotgun', build: buildShotgunViewmodel },

  // SMG — spray weapon: very fast, low per-shot damage, big mag that drains the
  // (also big) reserve fast. Slight spread so it isn't a laser.
  { id: 2, name: 'SMG', slot: 3, shopKey: 'wpn_smg',
    damage: 11, fireRate: 0.062, clipSize: 30, reserveMax: 180,
    reloadTime: 1.8, range: 75, pellets: 1, spread: 0.024,
    recoil: 0.075, muzzleTime: 0.045, muzzleColor: 0xfff0b0, muzzleScale: 0.8,
    sound: 'smg', build: buildSmgViewmodel },

  // Flare pistol — low damage, slow, single-shot, but the impact plants a light
  // that illuminates the area for ~8s (see plantFlare/updateFlares). Made for
  // the dark floors (Dark Pools).
  { id: 3, name: 'Flare Gun', slot: 4, shopKey: 'wpn_flare',
    damage: 20, fireRate: 1.1, clipSize: 1, reserveMax: 12,
    reloadTime: 1.5, range: 50, pellets: 1, spread: 0,
    recoil: 0.32, muzzleTime: 0.1, muzzleColor: 0xff5522, muzzleScale: 1.4,
    sound: 'flare', flare: true, build: buildFlareViewmodel },
];

function curWeapon() { return WEAPONS[player.weaponIdx]; }
function wpnClip(w)    { return Math.max(1, Math.round(w.clipSize * shopStats.clipMult)); }
function wpnReserve(w) { return Math.round(w.reserveMax * shopStats.reserveMult); }
function wpnFireRate(w){ return w.fireRate * shopStats.fireRateMult; }
// Weapon falloff multiplier (1 at point-blank → farMult at range; flat 1 for
// weapons with no falloff). Distance-only, independent of the damage upgrade.
function wpnFalloff(w, dist) {
  if (!w.falloff) return 1;
  const f = w.falloff;
  if (dist <= f.near) return 1;
  if (dist >= f.far) return f.farMult;
  return 1 + (f.farMult - 1) * (dist - f.near) / (f.far - f.near);
}
// Owned? Pistol (no shopKey) is always owned; the rest follow their shop item.
function weaponOwned(idx) {
  const w = WEAPONS[idx];
  if (!w || !w.shopKey) return true;
  return !!(shopUpgrades[w.shopKey] && shopUpgrades[w.shopKey].bought);
}
// Fill the whole per-weapon ammo bank to each weapon's current max (start of a
// run, and the source of a freshly-bought weapon's loadout).
function initWeaponBank() {
  player.weaponAmmo = WEAPONS.map(w => ({ clip: wpnClip(w), reserve: wpnReserve(w) }));
}
// Top up the equipped gun + every stashed gun by ~3 mags on a floor clear.
function floorReserveTopUp() {
  for (let i = 0; i < WEAPONS.length; i++) {
    const cap = wpnReserve(WEAPONS[i]), add = wpnClip(WEAPONS[i]) * 3;
    if (i === player.weaponIdx) player.reserveAmmo = Math.min(cap, player.reserveAmmo + add);
    else if (player.weaponAmmo[i]) player.weaponAmmo[i].reserve = Math.min(cap, player.weaponAmmo[i].reserve + add);
  }
}

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
// Max anisotropic-filtering samples for world textures — set once in init() from
// the GPU's capability, capped at 8. Sampler state (NOT a program-cache key), set
// at texture CREATION, so it sharpens grazing-angle surfaces (floors at distance)
// with no shader recompile and no mid-game mutation. Default 1 until init runs;
// every texMarkSRGB caller (wall/floor/ceiling/water/caustics) runs after init.
let MAX_ANISO = 1;
function texMarkSRGB(tex) {
  tex.encoding = THREE.sRGBEncoding;
  tex.anisotropy = MAX_ANISO;
  srgbCanvasTexCount++;
  return tex;
}

/* ── BAKED FAKE AMBIENT OCCLUSION (drawn into the canvas at creation — zero
   runtime cost, no lights). Grounds surfaces: walls get a darkened band where
   they meet the ceiling and (darker) the floor; floor tiles get a soft corner
   vignette so each per-cell tile reads as a discrete grounded panel. Both are
   symmetric across the canvas edges, so the textures still TILE seamlessly. ── */
function bakeWallAO(ctx, S) {
  const band = S * 0.12;                     // top/bottom ~12%
  // Canvas top (y=0) maps to the wall TOP (flipY) — ceiling contact.
  let g = ctx.createLinearGradient(0, 0, 0, band);
  g.addColorStop(0, 'rgba(0,0,0,0.36)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, band);
  // Canvas bottom (y=S) maps to the wall BOTTOM — floor contact (a bit darker).
  g = ctx.createLinearGradient(0, S - band, 0, S);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.46)');
  ctx.fillStyle = g; ctx.fillRect(0, S - band, S, band);
}
function bakeFloorVignette(ctx, S) {
  const h = S / 2;
  // Transparent center → dark toward the edges/corners. Radius/center symmetric
  // about the canvas, so opposite edges match → seamless per-cell tiling.
  const g = ctx.createRadialGradient(h, h, S * 0.42, h, h, S * 0.74);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.30)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
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

  bakeWallAO(ctx, 256); // grounded top/bottom shading (on top of the noise)

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

  bakeFloorVignette(ctx, 256); // soft corner vignette → each per-cell tile reads grounded

  const tex = new THREE.CanvasTexture(c);
  texMarkSRGB(tex);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  // repeat stays 1,1: per-cell tiling is baked into the MESH UVs now (one tile
  // per CELL on the slab + pools deck), so texel density matches the wall faces.
  return tex;
}

function createCeilingTexture(theme) {
  // Bumped 128 → 256 to match the wall/floor texel resolution (the ceiling tile
  // was the lowest-res surface). Tiling is unchanged (repeat 2,2 across the slab).
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = theme.ceilColor;
  ctx.fillRect(0, 0, 256, 256);

  if (theme.id <= 1 || theme.id === 7 || theme.id === 10 || theme.id === 12) {
    ctx.strokeStyle = 'rgba(150,140,120,0.3)'; ctx.lineWidth = 2;
    ctx.strokeRect(4, 4, 248, 248);
    for (let i = 0; i < 240; i++) {
      ctx.fillStyle = `rgba(140,130,110,${0.15 + Math.random() * 0.2})`;
      ctx.beginPath(); ctx.arc(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 1.5, 0, Math.PI * 2); ctx.fill();
    }
  } else if (theme.id === 3) {
    for (let i = 0; i < 8; i++) {
      const gx = Math.random() * 256, gy = Math.random() * 256;
      const grad = ctx.createRadialGradient(gx, gy, 0, gx, gy, 60);
      grad.addColorStop(0, 'rgba(100,200,255,0.08)');
      grad.addColorStop(1, 'rgba(100,200,255,0)');
      ctx.fillStyle = grad; ctx.fillRect(0, 0, 256, 256);
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
    case 'chase':
      generateChase(w, h, theme);
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

  // SAFETY: a 'pools' floor must have at least one basin (rare seeds can roll the
  // pool chance off in every hall). If none were placed, FORCE one in the largest
  // hall, inset 1 from its edges so the deck ring (and thus connectivity) survives.
  // Deterministic and consumes ZERO rng() draws → the post-generation rng stream
  // (pickExitCell, ammo) stays identical for the common already-has-a-pool case.
  if (poolRects.length === 0) {
    let best = null, bestArea = 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const a = (x1s[c] - x0s[c] + 1) * (y1s[r] - y0s[r] + 1);
      if (a > bestArea) { bestArea = a; best = { c, r }; }
    }
    if (best) {
      const px0 = x0s[best.c] + 1, px1 = x1s[best.c] - 1;
      const py0 = y0s[best.r] + 1, py1 = y1s[best.r] - 1;
      if (px1 - px0 >= 1 && py1 - py0 >= 1) {
        for (let y = py0; y <= py1; y++) for (let x = px0; x <= px1; x++) mazeGrid[y][x] = 2;
        poolRects.push({ x0: px0, y0: py0, x1: px1, y1: py1 });
      }
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

// 'chase' archetype — Hotel Chase (Run For Your Life). A long WINDING corridor
// route from spawn to a distant exit: horizontal LANES (LANE_H cells tall) stacked
// vertically, each linked to the next by a 3-wide vertical CONNECTOR punched at a
// SEEDED column — so the player serpentines, hitting sharp 90°/180° turns, while
// the lane ends past the connectors are real DEAD-ENDS that punish wrong turns.
//
// FLOOD-FILL SAFETY (the whole point of a chase): a guaranteed-clear SPINE
// (entry-vertical + bottom-row run + connector links, per lane) is reserved up
// front and NEVER furnished, so a valid spawn→exit path always exists by
// construction. Furniture (grid value 3 — collidable, rendered as low props, not
// tall walls) is then scattered only on NON-spine lane cells, forcing the player
// to weave. A final flood-fill from spawn seals any stray island (→ value 3) so
// every remaining deck cell (value 1) stays reachable. Grid contract: 0 = wall,
// 1 = walkable deck, 3 = furniture/obstacle (blocks movement + BFS, like a wall,
// but the renderer draws a knee-high prop instead of a full wall block).
// Deterministic via the seeded rng(); co-op machines build the identical maze.
function generateChase(w, h, theme) {
  const ri = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
  // TIGHTER (claustrophobic speed-run): narrower lanes, MORE lanes (more forced
  // U-turns), SHORTER lanes (turns come sooner), DENSER furniture. The spine +
  // island-seal still guarantee a clear spawn→exit path (verified by test_chase).
  const LANE_H = 2;                                  // interior rows per lane (was 3 → narrower)
  const NL = Math.min(9, Math.max(7, 3 + Math.round((h || 12) / 3))); // 7..9 lanes (was 5..7)
  const LANE_LEN = Math.min(19, Math.max(12, (w || 12) + 3));         // shorter lanes (was +5)
  const gw = LANE_LEN + 2;                           // + the two side border walls
  const gh = 1 + NL * (LANE_H + 1);                  // top border + NL bands (lane + wall row)

  // 1. Solid everywhere; carve lane interiors open below.
  mazeGrid = [];
  for (let y = 0; y < gh; y++) { mazeGrid[y] = []; for (let x = 0; x < gw; x++) mazeGrid[y][x] = 0; }

  // Per-lane interior row range. rTop(i)..rBot(i); the wall row BELOW lane i is
  // wallRow(i) = rBot(i)+1 (= top border of the band below, or the bottom border).
  const rTop = (i) => 1 + i * (LANE_H + 1);
  const rBot = (i) => rTop(i) + LANE_H - 1;
  for (let i = 0; i < NL; i++)
    for (let y = rTop(i); y <= rBot(i); y++)
      for (let x = 1; x <= gw - 2; x++) mazeGrid[y][x] = 1;

  // 2. Connector columns: where each lane drops into the next. Seeded, kept off
  // the very ends so the 3-wide opening fits and there's lane to run past it.
  const conn = [];
  for (let i = 0; i < NL - 1; i++) conn.push(ri(2, gw - 3));

  // Entry/exit column of each lane along the spine. Lane 0 enters at the spawn
  // corner (x=1); the last lane exits at the FAR end (opposite its entry) so the
  // final stretch is long and the exit lands deep down the corridor.
  const entryCol = (i) => (i === 0 ? 1 : conn[i - 1]);
  const lastEntry = entryCol(NL - 1);
  const exitCol = (i) => (i === NL - 1 ? (lastEntry < gw / 2 ? gw - 2 : 1) : conn[i]);

  // 3. SPINE — reserve the guaranteed-clear through-path (anti-furniture set).
  const spine = new Set();
  const keep = (x, y) => { if (mazeGrid[y] && mazeGrid[y][x] === 1) spine.add(y * gw + x); };
  for (let i = 0; i < NL; i++) {
    const ec = entryCol(i), xc = exitCol(i), top = rTop(i), bot = rBot(i);
    for (let y = top; y <= bot; y++) keep(ec, y);                 // entry vertical (down from the connector above)
    const lo = Math.min(ec, xc), hi = Math.max(ec, xc);
    for (let x = lo; x <= hi; x++) keep(x, bot);                  // run along the bottom row to the exit column
    if (i < NL - 1) {                                             // open + reserve the connector to the next lane
      const c = conn[i], wy = bot + 1;
      for (let dx = -1; dx <= 1; dx++) { const nx = c + dx; if (nx >= 1 && nx <= gw - 2) mazeGrid[wy][nx] = 1; }
      keep(c, wy);            // wall-row link cell
      keep(c, rTop(i + 1));   // ...landing in the next lane's top row (its entry vertical continues down)
    }
  }

  // 4. Furniture: scatter obstacles on NON-spine lane cells (never the spine, never
  // walls/connectors). DENSER now (0.55) → the path stays a tight ~1-wide thread
  // through walls of debris; the spine guarantees it's never fully blocked.
  const P_FURNITURE = 0.55;
  for (let i = 0; i < NL; i++) {
    for (let y = rTop(i); y <= rBot(i); y++) {
      for (let x = 1; x <= gw - 2; x++) {
        if (mazeGrid[y][x] !== 1) continue;
        if (spine.has(y * gw + x)) continue;
        if (rng() < P_FURNITURE) mazeGrid[y][x] = 3;
      }
    }
  }

  // 5. Seal islands: flood from spawn over deck (1); any unreached deck cell is
  // converted to furniture (3) so EVERY remaining deck cell is reachable — the
  // invariant the connectivity test asserts. The spine guarantees the flood
  // reaches the exit region; this only cleans up pockets furniture boxed off.
  const seen = [];
  for (let y = 0; y < gh; y++) seen.push(new Array(gw).fill(false));
  if (mazeGrid[1][1] === 1) {
    seen[1][1] = true;
    const q = [[1, 1]];
    for (let qi = 0; qi < q.length; qi++) {
      const [x, y] = q[qi];
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 1 || ny < 1 || nx >= gw - 1 || ny >= gh - 1) continue;
        if (mazeGrid[ny][nx] === 1 && !seen[ny][nx]) { seen[ny][nx] = true; q.push([nx, ny]); }
      }
    }
  }
  for (let y = 1; y < gh - 1; y++) for (let x = 1; x < gw - 1; x++) {
    if (mazeGrid[y][x] === 1 && !seen[y][x]) mazeGrid[y][x] = 3;
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
   EXIT DOOR — the way out, as a glowing doorway set into a wall.
   Replaces the old floor disc + beacon: a dark door frame against the nearest
   wall cell with a brilliant white emissive panel filling the opening, and the
   EXISTING exit-light slot (no new lights) pouring white light into the room.
   Reused by both the normal exit and the post-boss exit (createBossExit). Sets
   exitZone / exitMesh (the glow panel — updateLights pulses it) / exitLight.
   Materials are MeshStandardMaterial WITHOUT a map, FrontSide — the program
   family already pinned by ammoPickupMat, so no new shader family.
   ═══════════════════════════════════════════ */
function buildExitDoor(ex, ey, radius) {
  const gh = mazeGrid.length, gw = mazeGrid[0].length;
  exitZone = { x: ex * CELL + CELL / 2, z: ey * CELL + CELL / 2, radius: radius || CELL * 1.2 };

  // Find an adjacent WALL cell to mount the door against (pool cells count as
  // open, so pools get the door on a real dry-deck wall). Fall back to a
  // freestanding lit doorway (open archetypes — field/open) when none borders.
  const neigh = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let wd = null;
  for (const [dx, dy] of neigh) {
    const nx = ex + dx, ny = ey + dy;
    // Mount on a REAL wall (value 0 / out-of-bounds) only — NOT on a chase
    // furniture obstacle (value 3), which is knee-high, nor on deck/pool. For
    // floors 0-16 (which only use values 0/1/2) this is identical to the old
    // `cell !== 1 && cell !== 2` test; it only matters on the chase floor.
    const cell = (ny >= 0 && ny < gh && nx >= 0 && nx < gw) ? mazeGrid[ny][nx] : 0;
    if (cell === 0) { wd = { dx, dy }; break; }
  }
  if (!wd) wd = { dx: 0, dy: -1 }; // freestanding fallback

  const cx = exitZone.x, cz = exitZone.z;
  const doorX = cx + wd.dx * (CELL / 2 - 0.05);
  const doorZ = cz + wd.dy * (CELL / 2 - 0.05);
  const facing = Math.atan2(-wd.dx, -wd.dy); // door's +z (local) points INTO the cell

  const door = new THREE.Group();
  door.position.set(doorX, 0, doorZ);
  door.rotation.y = facing;

  const DW = 1.6, DH = 2.7, FT = 0.18; // doorway width / height, frame thickness
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x0c0c0e, emissive: 0x2a3a4a, emissiveIntensity: 0.35, roughness: 0.5, metalness: 0.65 });
  const post = (w, h, x, y) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, FT), frameMat); m.position.set(x, y, 0); door.add(m); };
  post(FT, DH, -DW / 2, DH / 2);          // left post
  post(FT, DH, DW / 2, DH / 2);           // right post
  post(DW + FT, FT, 0, DH + FT / 2);      // lintel
  post(DW + FT, FT, 0, FT / 2);           // threshold

  // The opening — a brilliant white emissive panel. Bright base; updateLights
  // gives it a slow pulse so it reads as living light.
  const glowMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.3, roughness: 1, metalness: 0, transparent: true, opacity: 0.95 });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(DW - 0.06, DH - 0.12), glowMat);
  glow.position.set(0, DH / 2, 0.04);
  door.add(glow);
  scene.add(door);
  exitMesh = glow; // updateLights pulses its emissiveIntensity (the "way out" shimmer)

  // The exit light pours OUT of the opening into the room — the existing slot,
  // recolored white + brightened (intensity/position only, count unchanged).
  exitLight.color.setHex(0xffffff);
  exitLight.intensity = 1.5;
  exitLight.distance = CELL * 5;
  exitLight.position.set(cx - wd.dx * 0.6, 1.5, cz - wd.dy * 0.6); // just inside the cell
}

/* ═══════════════════════════════════════════
   3D GUN MODEL
   ═══════════════════════════════════════════ */
// Shared viewmodel material palette — built fresh each createGun (disposed with
// the group) so the per-floor dispose traversal stays correct. Returned as an
// object the build* fns pull from, keeping each weapon's silhouette distinct
// while sharing the metal/dark/grip/sight looks.
function gunMatSet() {
  return {
    metal:  new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.4, metalness: 0.8 }),
    dark:   new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.3, metalness: 0.9 }),
    grip:   new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.85, metalness: 0.1 }),
    sight:  new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.3, metalness: 0.9 }),
    accent: new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.25, metalness: 0.9 }),
  };
}
function addPart(group, geo, mat, x, y, z, rx, ry, rz) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  if (rx || ry || rz) m.rotation.set(rx || 0, ry || 0, rz || 0);
  group.add(m);
  return m;
}

function createGun() {
  if (gunGroup) {
    // The gun is rebuilt every weapon-switch / floor — dispose the old one's
    // geometries and materials or they accumulate in VRAM.
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
  const w = curWeapon();
  (w.build || buildPistolViewmodel)(gunGroup, gunMatSet());

  // Muzzle flash light (attached to gun) — color/range tuned per weapon, but it
  // is still the SAME persistent slot pattern (intensity 0 when idle).
  muzzleFlashLight = new THREE.PointLight(w.muzzleColor || 0xffaa44, 0, 12);
  muzzleFlashLight.position.set(0, 0, -0.32);
  gunGroup.add(muzzleFlashLight);

  // Position gun in default (hip) view
  gunGroup.position.set(DEFAULT_GUN_POS.x, DEFAULT_GUN_POS.y, DEFAULT_GUN_POS.z);
  gunGroup.rotation.set(0, 0, 0);

  camera.add(gunGroup);
}

/* ── Procedural viewmodels — each shaped with intent for a distinct silhouette,
   still all primitives. They build INTO the passed group using the shared mat
   set. ── */

// PISTOL — the original 24-box pistol, unchanged.
function buildPistolViewmodel(g, M) {
  addPart(g, new THREE.BoxGeometry(0.045, 0.05, 0.28), M.metal, 0, 0.015, -0.06);          // slide
  addPart(g, new THREE.CylinderGeometry(0.012, 0.012, 0.08, 8), M.dark, 0, 0.005, -0.24, Math.PI / 2); // barrel
  addPart(g, new THREE.BoxGeometry(0.05, 0.04, 0.06), M.metal, 0, 0.0, -0.22);             // shroud
  addPart(g, new THREE.BoxGeometry(0.042, 0.03, 0.2), M.metal, 0, -0.02, -0.04);           // frame
  addPart(g, new THREE.BoxGeometry(0.035, 0.003, 0.05), M.metal, 0, -0.045, -0.05);        // trigger guard
  addPart(g, new THREE.BoxGeometry(0.035, 0.025, 0.003), M.metal, 0, -0.034, -0.075);
  addPart(g, new THREE.BoxGeometry(0.035, 0.015, 0.003), M.metal, 0, -0.038, -0.025);
  addPart(g, new THREE.BoxGeometry(0.006, 0.018, 0.004), M.accent, 0, -0.035, -0.048);     // trigger
  const grip = addPart(g, new THREE.BoxGeometry(0.038, 0.09, 0.04), M.grip, 0, -0.075, -0.01, 0.15);
  for (let i = 0; i < 5; i++) addPart(g, new THREE.BoxGeometry(0.04, 0.002, 0.042), M.dark, 0, -0.04 - i * 0.015, -0.01, 0.15);
  addPart(g, new THREE.BoxGeometry(0.03, 0.04, 0.034), M.dark, 0, -0.12, -0.008, 0.15);    // mag
  addPart(g, new THREE.BoxGeometry(0.006, 0.015, 0.006), M.sight, 0, 0.048, -0.17);        // front sight
  addPart(g, new THREE.BoxGeometry(0.006, 0.012, 0.006), M.sight, -0.012, 0.046, 0.06);    // rear sights
  addPart(g, new THREE.BoxGeometry(0.006, 0.012, 0.006), M.sight, 0.012, 0.046, 0.06);
  for (let i = 0; i < 6; i++) addPart(g, new THREE.BoxGeometry(0.048, 0.003, 0.002), M.dark, 0, 0.035, 0.02 + i * 0.012); // serrations
  addPart(g, new THREE.BoxGeometry(0.02, 0.004, 0.04), M.dark, 0.015, 0.038, -0.02);       // ejection port
}

// SHOTGUN — fat double-barrel silhouette: wide twin tubes, a long wooden body
// and a pump under the barrels. Reads instantly as a boomstick.
function buildShotgunViewmodel(g, M) {
  const wood = new THREE.MeshStandardMaterial({ color: 0x3a2412, roughness: 0.7, metalness: 0.05 });
  const blued = new THREE.MeshStandardMaterial({ color: 0x20211f, roughness: 0.35, metalness: 0.85 });
  // twin barrels
  addPart(g, new THREE.CylinderGeometry(0.026, 0.026, 0.40, 12), blued, -0.022, 0.012, -0.18, Math.PI / 2);
  addPart(g, new THREE.CylinderGeometry(0.026, 0.026, 0.40, 12), blued,  0.022, 0.012, -0.18, Math.PI / 2);
  // muzzle caps
  addPart(g, new THREE.CylinderGeometry(0.03, 0.03, 0.02, 12), M.dark, -0.022, 0.012, -0.375, Math.PI / 2);
  addPart(g, new THREE.CylinderGeometry(0.03, 0.03, 0.02, 12), M.dark,  0.022, 0.012, -0.375, Math.PI / 2);
  // receiver / breech block
  addPart(g, new THREE.BoxGeometry(0.075, 0.07, 0.12), M.metal, 0, 0.0, 0.02);
  // wooden forend (pump) slung under the barrels
  addPart(g, new THREE.BoxGeometry(0.07, 0.045, 0.16), wood, 0, -0.045, -0.16);
  for (let i = 0; i < 5; i++) addPart(g, new THREE.BoxGeometry(0.072, 0.004, 0.006), M.dark, 0, -0.024, -0.22 + i * 0.025); // grooves
  // wooden stock/grip raked back
  addPart(g, new THREE.BoxGeometry(0.05, 0.055, 0.16), wood, 0, -0.06, 0.11, 0.28);
  addPart(g, new THREE.BoxGeometry(0.055, 0.06, 0.04), wood, 0, -0.11, 0.18, 0.28);        // butt
  // trigger guard + trigger
  addPart(g, new THREE.BoxGeometry(0.04, 0.004, 0.05), M.metal, 0, -0.05, 0.05);
  addPart(g, new THREE.BoxGeometry(0.006, 0.02, 0.005), M.accent, 0, -0.04, 0.04);
  // bead front sight
  addPart(g, new THREE.SphereGeometry(0.007, 6, 6), M.sight, 0, 0.04, -0.37);
}

// SMG — boxy, compact: short receiver, stubby barrel + perforated shroud, a long
// curved-ish mag, a wire-ish folding stock and a top rail.
function buildSmgViewmodel(g, M) {
  const poly = new THREE.MeshStandardMaterial({ color: 0x18191b, roughness: 0.6, metalness: 0.3 });
  // receiver body
  addPart(g, new THREE.BoxGeometry(0.05, 0.06, 0.20), poly, 0, 0.0, -0.04);
  // top rail
  addPart(g, new THREE.BoxGeometry(0.03, 0.012, 0.18), M.dark, 0, 0.04, -0.04);
  for (let i = 0; i < 7; i++) addPart(g, new THREE.BoxGeometry(0.034, 0.006, 0.004), M.metal, 0, 0.05, -0.10 + i * 0.02); // rail teeth
  // stubby barrel + vented shroud
  addPart(g, new THREE.CylinderGeometry(0.011, 0.011, 0.14, 10), M.dark, 0, 0.005, -0.20, Math.PI / 2);
  addPart(g, new THREE.CylinderGeometry(0.022, 0.022, 0.09, 12), M.metal, 0, 0.005, -0.17, Math.PI / 2);
  for (let i = 0; i < 4; i++) addPart(g, new THREE.BoxGeometry(0.005, 0.03, 0.05), M.dark, 0.022 * Math.cos(i), 0.005, -0.17, 0, 0, i * 0.6); // vent slots
  // long curved mag
  addPart(g, new THREE.BoxGeometry(0.026, 0.13, 0.03), poly, 0, -0.10, -0.02, 0.22);
  addPart(g, new THREE.BoxGeometry(0.026, 0.05, 0.03), poly, 0, -0.17, 0.0, 0.45);
  // pistol grip
  addPart(g, new THREE.BoxGeometry(0.034, 0.08, 0.038), M.grip, 0, -0.07, 0.06, 0.2);
  // trigger guard
  addPart(g, new THREE.BoxGeometry(0.036, 0.004, 0.05), poly, 0, -0.045, 0.03);
  // skeleton folding stock (two thin rails + pad)
  addPart(g, new THREE.BoxGeometry(0.006, 0.006, 0.14), M.metal, -0.018, 0.02, 0.12);
  addPart(g, new THREE.BoxGeometry(0.006, 0.006, 0.14), M.metal,  0.018, 0.02, 0.12);
  addPart(g, new THREE.BoxGeometry(0.05, 0.05, 0.012), M.dark, 0, 0.01, 0.19);
  // front sight post
  addPart(g, new THREE.BoxGeometry(0.005, 0.016, 0.005), M.sight, 0, 0.05, -0.21);
}

// FLARE GUN — fat stubby single-barrel break-action with a bright orange body
// and a wide bore: visually unmistakable from the combat guns.
function buildFlareViewmodel(g, M) {
  const orange = new THREE.MeshStandardMaterial({ color: 0xc24a18, roughness: 0.55, metalness: 0.2, emissive: 0x3a1402, emissiveIntensity: 0.4 });
  const black = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.5, metalness: 0.6 });
  // wide short barrel
  addPart(g, new THREE.CylinderGeometry(0.034, 0.036, 0.20, 14), orange, 0, 0.02, -0.14, Math.PI / 2);
  // flared muzzle ring
  addPart(g, new THREE.CylinderGeometry(0.044, 0.04, 0.025, 14), black, 0, 0.02, -0.245, Math.PI / 2);
  addPart(g, new THREE.CylinderGeometry(0.03, 0.03, 0.01, 14), new THREE.MeshStandardMaterial({ color: 0x301000, roughness: 1, metalness: 0 }), 0, 0.02, -0.252, Math.PI / 2); // dark bore
  // chunky receiver / hinge
  addPart(g, new THREE.BoxGeometry(0.06, 0.06, 0.07), orange, 0, 0.0, -0.01);
  addPart(g, new THREE.CylinderGeometry(0.012, 0.012, 0.07, 8), black, 0, 0.02, -0.03, 0, 0, Math.PI / 2); // hinge pin
  // fat grip
  addPart(g, new THREE.BoxGeometry(0.044, 0.10, 0.05), orange, 0, -0.075, 0.02, 0.2);
  addPart(g, new THREE.BoxGeometry(0.046, 0.06, 0.052), black, 0, -0.105, 0.03, 0.2);   // grip base
  // trigger guard + trigger
  addPart(g, new THREE.BoxGeometry(0.04, 0.004, 0.05), black, 0, -0.045, 0.0);
  addPart(g, new THREE.BoxGeometry(0.006, 0.02, 0.005), M.accent, 0, -0.035, -0.01);
  // hammer spur
  addPart(g, new THREE.BoxGeometry(0.012, 0.022, 0.01), black, 0, 0.03, 0.04, -0.3);
  // bead sight
  addPart(g, new THREE.SphereGeometry(0.006, 6, 6), M.sight, 0, 0.05, -0.22);
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

  // Muzzle flash light — scaled by the weapon (shotgun flashes bigger, smg
  // smaller). Still the same persistent slot, only its intensity changes.
  if (muzzleFlashTimer > 0) {
    muzzleFlashTimer -= dt;
    muzzleFlashLight.intensity = muzzleFlashTimer * 60 * (curWeapon().muzzleScale || 1);
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
  if (getTheme(currentFloor).scanner) return; // Lights Out: no flashlight (F does nothing)
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

/* ═══════════════════════════════════════════
   BALLOONS (Level Fun) — shootable party props / the balloon-pop trap
   Placed by the SEEDED rng() in addDecorations' party branch, with sequential
   ids in seeded creation order — same contract as ammo pickups, so every
   co-op machine has the identical balloon at the identical id. Popping is
   HOST-authoritative (see popBalloon): the host raycasts (local shot or a
   client's relayed 'shoot'), removes + spawns + broadcasts 'balloon_pop';
   clients mirror the removal + sounds, and the spawned partygoers arrive via
   the regular enemy snapshots.
   Visual resources are session-shared and NEVER disposed (the ammoPickupMat
   pattern): teardown scene.remove()s balloon meshes BEFORE the dispose
   traverse, so the shared geometry/materials are never seen by it. Materials
   are plain MeshStandardMaterial (no map) — an already-pinned program family,
   and there are NO balloon lights.
   ═══════════════════════════════════════════ */
let balloons = [];        // { id, mesh, x, y0, z, r, alive, phase } — current floor only
let balloonNextId = 0;    // reset per floor in buildMazeScene (seeded creation order)
let balloonGeo = null, balloonStringGeo = null, balloonMats = null, balloonStringMat = null;

// Gentle float: bob + slow sway. Pure position updates, no allocations.
function updateBalloons(dt) {
  if (balloons.length === 0) return;
  const t = clock.getElapsedTime();
  for (const b of balloons) {
    if (!b.alive) continue;
    b.mesh.position.y = b.y0 + Math.sin(t * 0.8 + b.phase) * 0.12;
    b.mesh.rotation.y = Math.sin(t * 0.3 + b.phase) * 0.3;
  }
}

// Nearest LIVE balloon the ray pierces → { balloon, point, dist } or null.
// Sphere test against the CURRENT (bobbed) position, radius padded slightly.
function raycastBalloons(ray, origin) {
  let best = null, bestD = Infinity;
  const v = new THREE.Vector3();
  for (const b of balloons) {
    if (!b.alive) continue;
    const hit = ray.ray.intersectSphere(new THREE.Sphere(b.mesh.position, b.r), v);
    if (hit) {
      const d = origin.distanceTo(hit);
      if (d < bestD) { bestD = d; best = { balloon: b, point: hit.clone(), dist: d }; }
    }
  }
  return best;
}

// HOST: pop a balloon. popperConn = null when the host's own shot popped it,
// else the client conn whose relayed shot did (the trap aggros onto them).
function popBalloon(b, popperConn) {
  b.alive = false;
  scene.remove(b.mesh); // shared geo/mats — never disposed (see block comment)
  playBalloonPop();
  setTimeout(() => { if (gameState === 'playing') playPartyGrowl(); }, 350);
  netBroadcastBalloonPop(b.id);

  // The party answers: 3-5 partygoers (host-side roll — same convention as
  // spawn positions; clients mirror via snapshots) at open cells around the
  // balloon, all aggro'd onto the popper. Capped so a pop never pushes the
  // live-mob count past MOB_HARD_CAP — spawn fewer instead.
  let alive = 0;
  for (const e of enemies) if (e.alive) alive++;
  const want = 3 + Math.floor(Math.random() * 3);
  const n = Math.min(want, Math.max(0, MOB_HARD_CAP - alive));
  const gh = mazeGrid.length, gw = mazeGrid[0].length;
  const bcx = Math.floor(b.x / CELL), bcy = Math.floor(b.z / CELL);
  // Candidate cells: open floor (mazeGrid===1 — never a wall; generator
  // connectivity guarantees every floor cell is reachable) within 3 cells.
  const cells = [];
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
    if (dx === 0 && dy === 0) continue;
    const cx = bcx + dx, cy = bcy + dy;
    if (cx > 0 && cy > 0 && cx < gw - 1 && cy < gh - 1 && mazeGrid[cy][cx] === 1) cells.push({ cx, cy });
  }
  for (let i = 0; i < n && cells.length > 0; i++) {
    const c = cells.splice(Math.floor(Math.random() * cells.length), 1)[0];
    const e = spawnEnemy('partygoer', {
      x: c.cx * CELL + CELL / 2 + (Math.random() - 0.5),
      z: c.cy * CELL + CELL / 2 + (Math.random() - 0.5)
    });
    if (e) { e.aggroPeer = popperConn ? popperConn.peer : null; e.aggroTimer = BALLOON_TRAP_AGGRO; }
  }
}

// CLIENT: the host popped balloon `id` — mirror the removal + audio. The
// spawned partygoers arrive via the regular enemy snapshot, no work here.
function netOnBalloonPop(id) {
  const b = balloons.find(bb => bb.id === id);
  if (!b || !b.alive) return;
  b.alive = false;
  scene.remove(b.mesh);
  playBalloonPop();
  setTimeout(() => { if (gameState === 'playing') playPartyGrowl(); }, 350);
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
      const w = curWeapon();
      const rmax = wpnReserve(w);
      if (player.reserveAmmo >= rmax) continue; // already full for the equipped gun
      // +1 magazine of reserve, capped at the (possibly shop-upgraded) max
      player.reserveAmmo = Math.min(rmax, player.reserveAmmo + wpnClip(w));
      playPickup();
      scene.remove(p.mesh);
      ammoPickups.splice(i, 1);
      netAnnouncePickupTaken(p.id); // MP: remove it on every other machine too
      updateHUD();
    }
  }
}

/* ═══════════════════════════════════════════
   LORE OBJECTIVE — ARTIFACTS (item gate)
   On item-gate floors (theme.gate === 'item') N glowing artifacts spawn far
   from the spawn corner; collecting all of them opens the exit (the kills gate
   is bypassed — mobs still spawn as pressure). SAME contract as ammo pickups:
   ONE shared geometry+material (emissive, NO PointLight — light count stable),
   sequential ids in seeded creation order so every co-op machine has the
   identical artifact at the identical id. Placement uses a floorSeed-derived
   prng (0 world-rng draws — like balloons/scares — so it can't shift exit/ammo
   placement). Collection is shared + host-validated: any player walks over one,
   it vanishes on every machine via 'artifact_taken' {id}, and each machine
   counts its own (idempotent), so the HUD agrees everywhere; the host
   re-validates the gate before advancing the floor.
   ═══════════════════════════════════════════ */
let artifacts = [];                 // { id, mesh, x, z, baseY, phase } — current floor only
let artifactNextId = 0;             // reset per floor (seeded creation order)
let artifactsTotal = 0, artifactsCollected = 0;
const ARTIFACT_RADIUS = 1.3;        // walk-over distance

// Shared resources — created once, NEVER disposed (keeps the MeshStandardMaterial
// no-map program family pinned, same as ammoPickupMat). Teardown scene.remove()s
// the meshes before the dispose traverse, so these are never caught by it.
const artifactGeo = new THREE.OctahedronGeometry(0.3, 0);
const artifactMat = new THREE.MeshStandardMaterial({
  color: 0x123338, emissive: 0x55ddee, emissiveIntensity: 1.0,
  roughness: 0.25, metalness: 0.4
});

function createArtifact(wx, wz, id) {
  const mesh = new THREE.Mesh(artifactGeo, artifactMat);
  const baseY = 0.95 + floorHeightAt(wx, wz);
  mesh.position.set(wx, baseY, wz);
  scene.add(mesh);
  artifacts.push({ id, mesh, x: wx, z: wz, baseY, phase: artifacts.length * 1.3 });
}

// Called EVERY floor from buildMazeScene (resets the counters). Only item-gate
// floors actually place artifacts.
function spawnArtifacts(theme) {
  for (const a of artifacts) scene.remove(a.mesh);
  artifacts = [];
  artifactNextId = 0;
  artifactsCollected = 0;
  artifactsTotal = 0;
  if (theme.isBoss || (theme.gate || 'kills') !== 'item') return;
  const n = theme.itemCount || 3;

  const gh = mazeGrid.length, gw = mazeGrid[0].length;
  // BFS path-distance from spawn (1,1) over floor cells — deterministic (grid is
  // seeded). Same idea as pickExitCell, so artifacts land genuinely far away.
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
  const cands = [];
  for (let y = 1; y < gh - 1; y++) for (let x = 1; x < gw - 1; x++) if (dist[y][x] > 0) cands.push({ x, y, d: dist[y][x] });
  if (!cands.length) return;
  // Far half by path distance; deterministic tie-break by scan order.
  cands.sort((a, b) => b.d - a.d || a.y - b.y || a.x - b.x);
  const pool = cands.slice(0, Math.max(n, Math.ceil(cands.length * 0.5)));

  const sp = mulberry32((floorSeed ^ 0xA27FAC7) >>> 0); // dedicated stream, 0 world draws
  const chosen = [], used = new Set();
  let guard = 0;
  while (chosen.length < n && guard++ < 600) {
    const c = pool[Math.floor(sp() * pool.length)];
    const key = c.y + ',' + c.x;
    if (used.has(key)) continue;
    // keep artifacts spaced (≥4 cells apart) so they're not clustered
    if (chosen.some(ch => Math.abs(ch.x - c.x) + Math.abs(ch.y - c.y) < 4)) continue;
    used.add(key); chosen.push(c);
  }
  // Spacing may starve a small floor — fill the remainder ignoring spacing.
  for (let i = 0; chosen.length < n && i < pool.length; i++) {
    const key = pool[i].y + ',' + pool[i].x;
    if (!used.has(key)) { used.add(key); chosen.push(pool[i]); }
  }
  artifactsTotal = chosen.length;
  for (const c of chosen) createArtifact(c.x * CELL + CELL / 2, c.y * CELL + CELL / 2, ++artifactNextId);
}

// Spin/bob; collect on the LOCAL player's walk-over (any player can collect).
function updateArtifacts(dt) {
  if (artifacts.length === 0) return;
  const t = clock.getElapsedTime();
  for (let i = artifacts.length - 1; i >= 0; i--) {
    const a = artifacts[i];
    a.mesh.rotation.y += dt * 1.4;
    a.mesh.rotation.x += dt * 0.6;
    a.mesh.position.y = a.baseY + Math.sin(t * 2 + a.phase) * 0.12;
    const dx = a.x - player.pos.x, dz = a.z - player.pos.z;
    if (dx * dx + dz * dz < ARTIFACT_RADIUS * ARTIFACT_RADIUS) {
      if (collectArtifact(a.id)) { playArtifactPickup(); netAnnounceArtifactTaken(a.id); }
    }
  }
}

// Remove an artifact by id + count it. Idempotent (an id collected once) so the
// host relay and the local walk-over can't double-count. Shared on ALL machines
// (local collect + the 'artifact_taken' handler) → every HUD converges.
function collectArtifact(id) {
  const i = artifacts.findIndex(a => a.id === id);
  if (i === -1) return false;
  scene.remove(artifacts[i].mesh); // shared geo/mat — never disposed
  artifacts.splice(i, 1);
  artifactsCollected++;
  updateHUD();
  return true;
}

/* ═══════════════════════════════════════════
   SANITY — gentle atmospheric pressure (per-player, persists across floors).
   Drains ONLY on damage (see damagePlayer); recovers slowly when calm; topped up
   by Almond Water (over time). Low sanity is COSMETIC ONLY — a darkening vignette
   and faint whispers, NO screen shake, NO slowdown, NO control loss.
   ═══════════════════════════════════════════ */
let _sanityWhisperTimer = 0;
function updateSanity(dt) {
  player.noDamageTimer += dt;
  // Passive slow recovery once you've been un-hit for a while.
  if (player.noDamageTimer >= SANITY_RECOVER_DELAY && player.sanity < MAX_SANITY) {
    player.sanity = Math.min(MAX_SANITY, player.sanity + SANITY_RECOVER_RATE * dt);
  }
  // Consumable regen pools drip into the stats OVER TIME (never instant).
  if (player.sanityHealPool > 0) {
    const tick = Math.min(player.sanityHealPool, SANITY_HEAL_RATE * dt);
    player.sanity = Math.min(MAX_SANITY, player.sanity + tick);
    player.sanityHealPool -= tick;
  }
  if (player.healthHealPool > 0) {
    const tick = Math.min(player.healthHealPool, HEALTH_HEAL_RATE * dt);
    player.health = Math.min(shopStats.maxHealth, player.health + tick);
    player.healthHealPool -= tick;
  }
  // Cosmetic effects.
  const s = player.sanity;
  let vig = 0;
  if (s < SANITY_LOW) {
    vig = (SANITY_LOW - s) / SANITY_LOW * 0.5;                       // edges darken as it falls
    if (s < SANITY_CRITICAL) vig += 0.14 * (0.5 + 0.5 * Math.sin(clock.getElapsedTime() * 2.0)); // slow "breathing"
    _sanityWhisperTimer -= dt;
    if (_sanityWhisperTimer <= 0) {
      _sanityWhisperTimer = (s < SANITY_CRITICAL ? 5 : 11) + Math.random() * (s < SANITY_CRITICAL ? 6 : 13);
      playSanityWhisper();
    }
  }
  hudSetStyle('sanityVignette', 'opacity', Math.min(0.82, vig).toFixed(2));
}

// Drink an Almond Water: queue a sanity restore over time (won't overfill, won't
// be wasted at full). Inventory-limited; per-player.
function useAlmondWater() {
  if (player.isDown || player.almondWater <= 0) return;
  if (player.sanity + player.sanityHealPool >= MAX_SANITY) return; // already topping out — keep the carton
  player.almondWater--;
  player.sanityHealPool = Math.min(MAX_SANITY - player.sanity, player.sanityHealPool + ALMOND_RESTORE);
  playDrink();
  updateHUD();
}
// Apply a Bandage: queue a health restore over time.
function useBandage() {
  if (player.isDown || player.bandages <= 0) return;
  if (player.health + player.healthHealPool >= shopStats.maxHealth) return;
  player.bandages--;
  player.healthHealPool = Math.min(shopStats.maxHealth - player.health, player.healthHealPool + BANDAGE_RESTORE);
  playBandage();
  updateHUD();
}

/* ═══════════════════════════════════════════
   CONSUMABLE PICKUPS — glowing cartons (Almond Water) / packs (Bandages) on the
   floor. SAME contract as ammo pickups: ONE shared geo+material per kind (emissive,
   NO PointLight — light count stable), sequential ids in seeded creation order so
   every co-op machine has the identical pickup at the identical id. Placement uses
   a floorSeed-derived prng (0 world-rng draws). Collection grants to whoever walks
   over (per-player inventory, capped); the removal broadcasts ('consumable_taken'
   {id}) so it vanishes for everyone — exactly the ammo-pickup pattern.
   ═══════════════════════════════════════════ */
let consumables = [];           // { id, mesh, x, z, baseY, phase, kind } — current floor only
let consumableNextId = 0;       // reset per floor (seeded order); kill-drops continue the sequence
// Shared resources — created once, NEVER disposed (keeps the no-map standard
// program family pinned, same as ammoPickupMat). Distinct looks, same program.
const almondGeo = new THREE.BoxGeometry(0.24, 0.34, 0.16);
const almondMat = new THREE.MeshStandardMaterial({ color: 0xd8e8d0, emissive: 0x66cc88, emissiveIntensity: 0.7, roughness: 0.5, metalness: 0.1 });
const bandageGeo = new THREE.BoxGeometry(0.30, 0.15, 0.22);
const bandageMat = new THREE.MeshStandardMaterial({ color: 0xeeeae2, emissive: 0xcc4444, emissiveIntensity: 0.55, roughness: 0.6, metalness: 0.05 });
function consumableGM(kind) { return kind === 'bandage' ? [bandageGeo, bandageMat] : [almondGeo, almondMat]; }

function createConsumable(wx, wz, id, kind) {
  const [g, m] = consumableGM(kind);
  const mesh = new THREE.Mesh(g, m);
  const baseY = 0.5 + floorHeightAt(wx, wz);
  mesh.position.set(wx, baseY, wz);
  scene.add(mesh);
  consumables.push({ id, mesh, x: wx, z: wz, baseY, phase: consumables.length * 1.6, kind });
}

// 1-3 cartons per non-boss floor at seeded cells away from spawn (0 world-rng
// draws). Almond Water is more common than Bandages.
function spawnConsumables(theme) {
  for (const c of consumables) scene.remove(c.mesh);
  consumables = [];
  consumableNextId = 0;
  if (theme.isBoss) return;
  const sp = mulberry32((floorSeed ^ 0xC047A1E) >>> 0); // dedicated stream
  const gh = mazeGrid.length, gw = mazeGrid[0].length;
  const cells = [];
  for (let y = 1; y < gh - 1; y++) for (let x = 1; x < gw - 1; x++) {
    if (mazeGrid[y][x] !== 1 && mazeGrid[y][x] !== 2) continue;
    if (Math.abs(x - 1) + Math.abs(y - 1) < 5) continue; // keep clear of spawn
    cells.push({ x, y });
  }
  if (!cells.length) return;
  const count = 1 + Math.floor(sp() * 3); // 1..3
  for (let i = 0; i < count && cells.length; i++) {
    const c = cells.splice(Math.floor(sp() * cells.length), 1)[0];
    const kind = sp() < 0.62 ? 'almond' : 'bandage';
    createConsumable(c.x * CELL + CELL / 2, c.y * CELL + CELL / 2, ++consumableNextId, kind);
  }
}

// Spin/bob; collect on the LOCAL player's walk-over into inventory (capped). Full
// for that kind → left on the ground (like full-reserve ammo).
function updateConsumables(dt) {
  if (consumables.length === 0) return;
  const t = clock.getElapsedTime();
  for (let i = consumables.length - 1; i >= 0; i--) {
    const c = consumables[i];
    c.mesh.rotation.y += dt * 1.3;
    c.mesh.position.y = c.baseY + Math.sin(t * 2.2 + c.phase) * 0.08;
    const dx = c.x - player.pos.x, dz = c.z - player.pos.z;
    if (dx * dx + dz * dz < CONSUMABLE_PICKUP_RADIUS * CONSUMABLE_PICKUP_RADIUS) {
      const have = c.kind === 'bandage' ? player.bandages : player.almondWater;
      if (have >= CONSUMABLE_MAX) continue; // inventory full → leave it for later
      const kind = c.kind;
      if (collectConsumableById(c.id)) {
        if (kind === 'bandage') player.bandages = Math.min(CONSUMABLE_MAX, player.bandages + 1);
        else player.almondWater = Math.min(CONSUMABLE_MAX, player.almondWater + 1);
        playPickup();
        netAnnounceConsumableTaken(c.id); // MP: remove it on every other machine too
        updateHUD();
      }
    }
  }
}

// Remove a pickup by id (idempotent). Shared by the local walk-over and the
// 'consumable_taken' net handler — NO grant here (grant is local to the collector).
function collectConsumableById(id) {
  const i = consumables.findIndex(c => c.id === id);
  if (i === -1) return false;
  scene.remove(consumables[i].mesh); // shared geo/mat — never disposed
  consumables.splice(i, 1);
  return true;
}

// HOST: a killed enemy may drop a consumable (host-authoritative roll, broadcast
// like the ammo kill-drop so clients spawn the same id).
function maybeDropConsumable(wx, wz) {
  if (Math.random() >= CONSUMABLE_DROP_CHANCE) return;
  const kind = Math.random() < 0.65 ? 'almond' : 'bandage';
  const id = ++consumableNextId;
  createConsumable(wx, wz, id, kind);
  netBroadcastConsumableSpawn(id, wx, wz, kind);
}

// Floor teardown: pull pickups out of the scene BEFORE the dispose traverse
// (shared geo/mats must not be caught).
function clearConsumables() {
  for (const c of consumables) if (c.mesh.parent) scene.remove(c.mesh);
  consumables = [];
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
   CO-OP SPAWN FAN-OUT
   ═══════════════════════════════════════════
   In co-op every player builds the (identical, seeded) floor independently and
   used to land on the SAME spawn cell (1,1) → everyone stacked inside each other.
   Spread them out by SLOT: each machine computes this from its own grid + own
   slot, no protocol/host-authority needed (the grid is identical everywhere, so
   the ordered open-cell list — and thus each slot's cell — is the same on every
   machine). Solo is slot 0 and always gets the canonical spawn cell, so it's
   unaffected.

   The spawn corner (1,1) is a corner (walls at x=0 / z=0), so candidates fan out
   into the open +x/+z quadrant, ordered by ring distance so players land as close
   together as possible while still on DISTINCT open floor. Only value-1 (dry open
   floor) cells qualify — never a wall (0), pool basin (2), or furniture (3). If
   the maze is too tight near spawn to give every slot its own cell, higher slots
   CLAMP onto the last open candidate (acceptable per "clamp to walkable cells");
   the base spawn cell is always valid (generators force mazeGrid[1][1] = 1). */
const SPAWN_FANOUT_OFFSETS = [
  [0, 0],                                              // ring 0 — host/solo spawn
  [1, 0], [0, 1], [1, 1],                              // ring 1
  [2, 0], [0, 2], [2, 1], [1, 2], [2, 2],              // ring 2
  [3, 0], [0, 3], [3, 1], [1, 3], [3, 2], [2, 3], [3, 3] // ring 3
];
// Ordered list of walkable spawn candidates near the (1,1) corner.
function spawnOpenCells() {
  const baseX = 1, baseY = 1;
  const open = [];
  for (const [dx, dy] of SPAWN_FANOUT_OFFSETS) {
    const cx = baseX + dx, cy = baseY + dy;
    const row = mazeGrid[cy];
    if (row && row[cx] === 1) open.push([cx, cy]);
  }
  if (open.length === 0) open.push([baseX, baseY]); // grid degenerate — fall back to spawn
  return open;
}
// The [cellX, cellY] this player slot spawns on. Pure function of the grid + slot.
function playerSpawnCellFor(slot) {
  const open = spawnOpenCells();
  const idx = Math.max(0, Math.min(slot | 0, open.length - 1)); // clamp to last open
  return open[idx];
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
  clearImpactFx(); // pull pooled sparks/decals/flare out before the dispose pass (shared geo/mats)
  clearScanDots(); // pull instanced scanner-dot meshes out too (shared geo/mats) + reset slots
  clearScares();   // pull active watcher sprites out too (shared mob textures) + reset effects
  clearConsumables(); // pull almond/bandage pickups out (shared geo/mats) before the dispose pass
  for (const p of ammoPickups) scene.remove(p.mesh); // geometry/material are module-level SHARED — never disposed
  for (const a of artifacts) scene.remove(a.mesh);   // same pattern: shared artifact geo/mat stay out of the dispose traverse
  artifacts = [];
  for (const b of balloons) scene.remove(b.mesh);    // same pattern: shared balloon geo/mats stay out of the dispose traverse
  balloons = [];
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
    // Per-cell tiling: scale the 0..1 plane UVs to 0..gw / 0..gh so the floor
    // texture (repeat 1,1) tiles once per CELL — texel density now matches the
    // per-face wall tiles instead of one 256px tile stretched across the slab.
    const fuv = floorGeo.attributes.uv;
    for (let i = 0; i < fuv.count; i++) fuv.setXY(i, fuv.getX(i) * gw, fuv.getY(i) * gh);
    fuv.needsUpdate = true;
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

  // Decorations. Balloon ids restart per floor here (the party branch creates
  // them in seeded order) — identical sequence on every machine, like pickups.
  balloonNextId = 0;
  if (theme.decorations !== 'none') {
    addDecorations(theme, gw, gh);
  }

  // Lights — reduce for dark levels
  const darkMult = 1 - (theme.darknessLevel || 0) * 0.7;
  // SCANNER FLOOR (Lights Out): force TOTAL darkness. Ambient → 0, ceiling lights
  // stay at the theme's 0 intensity, fixtures non-emissive (below), flashlight
  // disabled. The 32-light COUNT is untouched (the point lights still exist at
  // intensity 0 — only intensities change, so the program cache never moves). The
  // exit-door light (buildExitDoor, 1.5) is the ONE thing that pierces the dark.
  const scanner = !!theme.scanner;
  ambientLight = new THREE.AmbientLight(theme.ambientColor, scanner ? 0 : theme.ambientIntensity * darkMult);
  scene.add(ambientLight);
  if (scanner) flashlightOn = false; // no flashlight on this floor (createFlashlight reads this)

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
  // Fixtures stay INSTANCED-Standard-no-map (the dot system reuses this exact
  // program family — see the scanner dots). On the scanner floor they're created
  // but non-emissive (invisible in the dark) so the program is still present.
  const fixMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, emissive: theme.lightColor, emissiveIntensity: scanner ? 0 : 0.4 * darkMult
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

  // Flare slot — persistent, parked dark below the floor until a flare is fired.
  // Freed by dropping CEILING_LIGHT_BUDGET 26→25, so the 32-light total holds.
  flareLight = new THREE.PointLight(0xff5a22, 0, CELL * 3.6);
  flareLight.position.set(0, -100, 0);
  scene.add(flareLight);
  flareState.active = false; flareState.timer = 0; // a new floor clears any live flare

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
    buildExitDoor(ex, ey, CELL * 1.2); // glowing doorway set into the nearest wall
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

  // Lore objective: on item-gate floors, seed N artifacts far from spawn (0
  // world-rng draws — own prng). Resets the counters every floor either way.
  spawnArtifacts(theme);

  // Consumable pickups (almond water / bandages) — seeded, 0 world-rng draws.
  spawnConsumables(theme);

  // Place player. CO-OP: fan players out by slot so they don't spawn stacked
  // inside each other (solo = slot 0 = the canonical (1,1) cell, unaffected).
  // Each machine computes its own slot's cell from the identical seeded grid.
  const mySlot = (typeof netMySlot === 'function') ? netMySlot() : 0;
  const [scx, scy] = playerSpawnCellFor(mySlot);
  player.pos.set(scx * CELL + CELL / 2, 1.6, scy * CELL + CELL / 2);
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

  // Per-theme AMBIENT BED (fluorescent buzz / water / HVAC / transformer / …) —
  // rebuilt on every floor entry (this is the one path hit on every floor change,
  // host + solo + client). startGame no longer pre-starts it; this drives it.
  startAmbient();

  // Reset anti-linger
  floorTimer = 0;
  dangerLevel = 0;
  dangerSpawnTimer = LINGER_SPAWN_BASE;

  // Scripted scares: seed this floor's trigger placement (deterministic, 0 world
  // rng draws). Host evaluates them; clients wait for 'scare' broadcasts.
  placeScareTriggers(theme);

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
  } else if (theme.decorations === 'hotel') {
    // HOTEL CHASE (chase archetype). Two cosmetic-deterministic passes, both via a
    // floorSeed-derived prng (0 world-rng draws — same pattern as party/scares, so
    // exit/ammo placement is undisturbed and co-op machines agree):
    //   (a) FURNITURE BARRICADES on every grid value-3 cell — knee-high piles that
    //       block the corridor (full-cell collision, like a wall, but you see over
    //       them). Drawn as a FEW InstancedMeshes (one per palette tone) — the SAME
    //       program family the light fixtures already instance every floor (instanced
    //       MeshStandardMaterial, no map, no instanceColor), so NO new shader program.
    //   (b) HOTEL-ROOM DOORS on lane-facing walls — pure flavor, no collision change.
    const prng = mulberry32((floorSeed ^ 0x40DEED) >>> 0);
    const TONES = [0x4a3526, 0x39281c, 0x52403a, 0x2c2622]; // wood / dark wood / dust / shadow
    const unitBox = new THREE.BoxGeometry(1, 1, 1);
    const furMats = TONES.map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.92, metalness: 0.04 }));
    const toneMatrices = TONES.map(() => []);

    for (let y = 1; y < gh - 1; y++) for (let x = 1; x < gw - 1; x++) {
      if (mazeGrid[y][x] !== 3) continue;
      const cx = x * CELL + CELL / 2, cz = y * CELL + CELL / 2;
      // Full-cell collision so the obstacle blocks exactly its grid cell (matches
      // the chaser BFS + the connectivity guarantee — value 3 is impassable).
      mazeWalls.push({ minX: x * CELL, maxX: x * CELL + CELL, minZ: y * CELL, maxZ: y * CELL + CELL });
      // A pile: a wide low base + a smaller offset piece on top (reads as stacked
      // furniture / a barricade). Position/scale/rotation jittered per cell.
      const baseH = 0.9 + prng() * 0.6;
      const bw = CELL * (0.78 + prng() * 0.14), bd = CELL * (0.78 + prng() * 0.14);
      const ry1 = (prng() - 0.5) * 0.5;
      const m1 = new THREE.Matrix4().compose(
        new THREE.Vector3(cx + (prng() - 0.5) * 0.4, baseH / 2, cz + (prng() - 0.5) * 0.4),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry1, 0)),
        new THREE.Vector3(bw, baseH, bd));
      toneMatrices[Math.floor(prng() * TONES.length)].push(m1);
      const topH = 0.5 + prng() * 0.7;
      const tw = CELL * (0.4 + prng() * 0.22), td = CELL * (0.4 + prng() * 0.22);
      const m2 = new THREE.Matrix4().compose(
        new THREE.Vector3(cx + (prng() - 0.5) * 1.0, baseH + topH / 2, cz + (prng() - 0.5) * 1.0),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, (prng() - 0.5) * 1.2, 0)),
        new THREE.Vector3(tw, topH, td));
      toneMatrices[Math.floor(prng() * TONES.length)].push(m2);
    }
    for (let ti = 0; ti < TONES.length; ti++) {
      const mats = toneMatrices[ti];
      if (!mats.length) continue;
      const im = new THREE.InstancedMesh(unitBox, furMats[ti], mats.length);
      mats.forEach((m, i) => im.setMatrixAt(i, m));
      im.instanceMatrix.needsUpdate = true;
      scene.add(im);
    }

    // (b) Hotel-room doors: a dark panel flush on a wall face that borders a lane
    // cell. Cosmetic only (no AABB — the wall already blocks). Capped + sparse.
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x2a1410, roughness: 0.7, metalness: 0.1 });
    const knobMat = new THREE.MeshStandardMaterial({ color: 0xc9a23a, roughness: 0.4, metalness: 0.7, emissive: 0x6a5212, emissiveIntensity: 0.3 });
    const doorGeo = new THREE.BoxGeometry(1.4, 2.4, 0.08);
    const knobGeo = new THREE.BoxGeometry(0.12, 0.12, 0.14);
    const neigh = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    let doorCount = 0;
    for (let y = 1; y < gh - 1 && doorCount < 48; y++) for (let x = 1; x < gw - 1 && doorCount < 48; x++) {
      if (mazeGrid[y][x] !== 0) continue;            // doors mount on solid wall cells
      if (prng() > 0.16) continue;                   // sparse
      // pick a neighbouring open (deck) cell to face into
      let f = null;
      for (const [dx, dy] of neigh) { const nx = x + dx, ny = y + dy; if (mazeGrid[ny] && mazeGrid[ny][nx] === 1) { f = { dx, dy }; break; } }
      if (!f) continue;
      const cx = x * CELL + CELL / 2, cz = y * CELL + CELL / 2;
      const door = new THREE.Group();
      door.position.set(cx + f.dx * (CELL / 2 - 0.05), 1.2, cz + f.dy * (CELL / 2 - 0.05));
      door.rotation.y = Math.atan2(-f.dx, -f.dy);
      const panel = new THREE.Mesh(doorGeo, doorMat); door.add(panel);
      const knob = new THREE.Mesh(knobGeo, knobMat); knob.position.set(0.5, 0, 0.06); door.add(knob);
      scene.add(door);
      doorCount++;
    }
  } else if (theme.decorations === 'party') {
    // CREEPY BIRTHDAY PARTY (Level Fun only). EVERYTHING here places via prng,
    // a SEPARATE seeded stream derived from floorSeed: balloons are shootable
    // world objects whose ids must match on every co-op machine (see the
    // balloon trap), so placement must be deterministic — but it must NOT
    // consume the main world rng(), or the exit/ammo draws that follow in
    // buildMazeScene would shift (and the sim suite's stream mirror with
    // them). Same floorSeed on every machine → same prng → same balloons.
    // All materials are plain MeshStandardMaterial (no map) — already-pinned
    // program family — and nothing here adds a light.
    const prng = mulberry32((floorSeed ^ 0xBA1100) >>> 0);
    const partyColors = [0xff4466, 0x44aaff, 0xffdd00, 0x44ff88, 0xff88ff, 0xff8844];

    // Session-shared balloon resources (created once, NEVER disposed — the
    // teardown removes balloon meshes before the dispose traverse).
    if (!balloonGeo) {
      balloonGeo = new THREE.SphereGeometry(1, 8, 8);
      balloonStringGeo = new THREE.CylinderGeometry(0.005, 0.005, 1, 4);
      balloonStringMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.9 });
      balloonMats = partyColors.map(c =>
        new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.2, roughness: 0.6 }));
    }

    // Balloons — MORE of them (stride 3), varied color/size/height, bobbing in
    // updateBalloons. Shared geometry + 6 shared materials → cheap despite the
    // count. Registered in `balloons` with seeded sequential ids → shootable.
    for (let y = 2; y < gh - 1; y += 3) for (let x = 2; x < gw - 1; x += 3) {
      if (mazeGrid[y][x] === 1 && prng() < 0.45) {
        const r = 0.2 + prng() * 0.15;
        const bx = x * CELL + CELL / 2 + (prng() - 0.5) * 2;
        const bz = y * CELL + CELL / 2 + (prng() - 0.5) * 2;
        const by = 2.0 + prng() * 0.9;
        const g = new THREE.Group();
        const ball = new THREE.Mesh(balloonGeo, balloonMats[Math.floor(prng() * balloonMats.length)]);
        ball.scale.setScalar(r);
        g.add(ball);
        const strLen = Math.max(0.4, by - r - 0.5); // string ends ~0.5m above the floor
        const str = new THREE.Mesh(balloonStringGeo, balloonStringMat);
        str.scale.y = strLen;
        str.position.y = -(r + strLen / 2);
        g.add(str);
        g.position.set(bx, by, bz);
        scene.add(g);
        balloons.push({ id: ++balloonNextId, mesh: g, x: bx, y0: by, z: bz, r: r + 0.06, alive: true, phase: prng() * Math.PI * 2 });
      }
    }

    // Party tables — pale-clothed round top on a single leg, topped with a glowing cake
    // and a lit candle. Solid obstacles (added to mazeWalls — now the SAME cells on
    // every machine, an upgrade over the old Math.random placement).
    const tableMat = new THREE.MeshStandardMaterial({ color: 0xede0c8, roughness: 0.85 }); // grimy tablecloth
    const legMat   = new THREE.MeshStandardMaterial({ color: 0x6b5a44, roughness: 0.9 });
    const cakeMat  = new THREE.MeshStandardMaterial({ color: 0xff9ec4, emissive: 0xff5599, emissiveIntensity: 0.25, roughness: 0.6 });
    const flameMat = new THREE.MeshStandardMaterial({ color: 0xfff0c0, emissive: 0xffcc66, emissiveIntensity: 0.7 });
    const TABLE_TOP_Y = 1.0, TABLE_R = 0.55;
    for (let y = 3; y < gh - 2; y += 4) for (let x = 3; x < gw - 2; x += 4) {
      if (isOpenArea(x, y, gw, gh) && prng() < 0.45) {
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

    // Gift boxes — 1-2 stacked bright boxes with a contrasting "ribbon" strip.
    // Solid (small collider, like crates).
    const giftBoxGeo = new THREE.BoxGeometry(1, 1, 1); // unit cube, scaled per box
    const giftMats = partyColors.map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 }));
    for (let y = 2; y < gh - 2; y += 4) for (let x = 4; x < gw - 2; x += 4) {
      if (mazeGrid[y][x] === 1 && prng() < 0.35) {
        const gx = x * CELL + CELL / 2 + (prng() - 0.5) * 1.2;
        const gz = y * CELL + CELL / 2 + (prng() - 0.5) * 1.2;
        const stack = 1 + Math.floor(prng() * 2);
        let topY = 0;
        let baseS = 0;
        for (let s = 0; s < stack; s++) {
          const sz = (0.45 - s * 0.14) * (0.85 + prng() * 0.3);
          if (s === 0) baseS = sz;
          const ci = Math.floor(prng() * giftMats.length);
          const box = new THREE.Mesh(giftBoxGeo, giftMats[ci]);
          box.scale.set(sz, sz, sz);
          box.position.set(gx, topY + sz / 2, gz);
          box.rotation.y = prng() * Math.PI;
          scene.add(box);
          // ribbon: thin strip across the lid in a different party color
          const ribbon = new THREE.Mesh(giftBoxGeo, giftMats[(ci + 2) % giftMats.length]);
          ribbon.scale.set(sz * 1.04, sz * 0.08, sz * 0.16);
          ribbon.position.set(gx, topY + sz, gz);
          ribbon.rotation.y = box.rotation.y;
          scene.add(ribbon);
          topY += sz;
        }
        mazeWalls.push({ minX: gx - baseS / 2, maxX: gx + baseS / 2, minZ: gz - baseS / 2, maxZ: gz + baseS / 2 });
      }
    }

    // Party clutter — abandoned cups and dropped cone hats. Tiny, no collision.
    const cupGeo = new THREE.CylinderGeometry(0.035, 0.045, 0.1, 6);
    const hatGeo = new THREE.ConeGeometry(0.09, 0.2, 6);
    const clutterMats = partyColors.map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }));
    for (let y = 2; y < gh - 1; y += 3) for (let x = 3; x < gw - 1; x += 3) {
      if (mazeGrid[y][x] === 1 && prng() < 0.3) {
        const n = 1 + Math.floor(prng() * 2);
        for (let i = 0; i < n; i++) {
          const isHat = prng() < 0.4;
          const m = new THREE.Mesh(isHat ? hatGeo : cupGeo, clutterMats[Math.floor(prng() * clutterMats.length)]);
          const px = x * CELL + CELL / 2 + (prng() - 0.5) * 2.4;
          const pz = y * CELL + CELL / 2 + (prng() - 0.5) * 2.4;
          if (isHat && prng() < 0.6) {
            // knocked-over hat lying on its side
            m.rotation.z = Math.PI / 2;
            m.rotation.y = prng() * Math.PI * 2;
            m.position.set(px, 0.09, pz);
          } else {
            m.rotation.y = prng() * Math.PI * 2;
            m.position.set(px, isHat ? 0.1 : 0.05, pz);
          }
          scene.add(m);
        }
      }
    }

    // Odd wall decorations — sagging ceiling streamers along the walls and the
    // occasional crooked "picture" flat against a wall face. Thin single-sided
    // boxes only (no DoubleSide planes — `doubleSided` is a program-cache key
    // and standard-no-map is only pinned single-sided).
    const streamerGeo = new THREE.BoxGeometry(0.05, 1, 0.05);
    for (let y = 2; y < gh - 1; y += 3) for (let x = 2; x < gw - 1; x += 3) {
      if (mazeGrid[y][x] !== 1) continue;
      // find a wall neighbor to hug (deterministic scan order)
      let wallDir = null;
      if (mazeGrid[y - 1] && mazeGrid[y - 1][x] === 0) wallDir = { dx: 0, dz: -1 };
      else if (mazeGrid[y + 1] && mazeGrid[y + 1][x] === 0) wallDir = { dx: 0, dz: 1 };
      else if (mazeGrid[y][x - 1] === 0) wallDir = { dx: -1, dz: 0 };
      else if (mazeGrid[y][x + 1] === 0) wallDir = { dx: 1, dz: 0 };
      if (!wallDir) continue;
      const wx = x * CELL + CELL / 2 + wallDir.dx * (CELL / 2 - 0.15);
      const wz = y * CELL + CELL / 2 + wallDir.dz * (CELL / 2 - 0.15);
      const roll = prng();
      if (roll < 0.3) {
        // streamer: hangs from the ceiling at a tired angle
        const len = 0.9 + prng() * 0.7;
        const s = new THREE.Mesh(streamerGeo, clutterMats[Math.floor(prng() * clutterMats.length)]);
        s.scale.y = len;
        s.position.set(wx, WALL_H - len / 2, wz);
        s.rotation.x = (prng() - 0.5) * 0.3;
        s.rotation.z = (prng() - 0.5) * 0.3;
        scene.add(s);
      } else if (roll < 0.42) {
        // crooked picture: dark frame + party-color inner, tilted off square.
        // Group yaw faces it INTO the room; the child tilt is the crookedness.
        const pic = new THREE.Group();
        const frame = new THREE.Mesh(giftBoxGeo, legMat); // reuse the dark wood material
        frame.scale.set(0.42, 0.55, 0.04);
        const inner = new THREE.Mesh(giftBoxGeo, clutterMats[Math.floor(prng() * clutterMats.length)]);
        inner.scale.set(0.32, 0.44, 0.05);
        frame.rotation.z = inner.rotation.z = (prng() - 0.5) * 0.3; // crooked
        pic.add(frame); pic.add(inner);
        pic.position.set(wx, 1.5 + prng() * 0.5, wz);
        pic.rotation.y = Math.atan2(-wallDir.dx, -wallDir.dz); // face the open cell
        scene.add(pic);
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

  // Deck: one quad per non-basin cell at y=0. UVs are PER-CELL (0..1 per cell →
  // one floor tile per CELL with the texture's repeat at 1,1), matching the slab
  // floor's new per-cell density and the per-face wall tiles.
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    if (mazeGrid[y][x] === 2) continue;
    const x0 = x * CELL, x1 = x0 + CELL, z0 = y * CELL, z1 = z0 + CELL;
    floors.add([x0, 0, z0], [x0, 0, z1], [x1, 0, z1], [x1, 0, z0],
      [x, y], [x, y + 1], [x + 1, y + 1], [x + 1, y]);
  }

  const CAUS_UV = 0.5; // caustics/water texture tiles per grid cell
  for (const r of poolRects) {
    const x0 = r.x0 * CELL, x1 = (r.x1 + 1) * CELL;
    const z0 = r.y0 * CELL, z1 = (r.y1 + 1) * CELL;
    const cw = r.x1 - r.x0 + 1, ch = r.y1 - r.y0 + 1;

    // basin floor (same theme floor texture, just lower) — per-cell UVs too.
    floors.add([x0, -D, z0], [x0, -D, z1], [x1, -D, z1], [x1, -D, z0],
      [r.x0, r.y0], [r.x0, r.y1 + 1], [r.x1 + 1, r.y1 + 1], [r.x1 + 1, r.y0]);

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
  if (cheatGod) return;      // DEV god mode (?dev=1 only): no damage, no down
  if (player.isDown) return; // MP: a downed player can't be damaged further
  player.health -= amount;
  // SANITY drains ONLY from taking damage — scaled to the hit, capped, and never
  // in the Poolrooms (the calm safe zone). No ambient/dark drain anywhere.
  if (getTheme(currentFloor).id !== SANITY_SAFE_THEME) {
    player.sanity = Math.max(0, player.sanity - Math.min(amount * SANITY_DRAIN_PER_DMG, SANITY_DRAIN_CAP));
  }
  player.noDamageTimer = 0; // restart the calm timer → passive recovery pauses
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

/* ═══════════════════════════════════════════
   IMPACT FX — wall raycast, sparks, bullet-hole decals, flare light
   All pooled, all using the already-pinned MeshStandardMaterial (no-map)
   program family (same one the teammate muzzle flash uses) so no new shader
   program is introduced. NO new lights except the single flare slot above.
   ═══════════════════════════════════════════ */

// Grid DDA wall raycast (2D, ignores Y). Returns the first wall the ray crosses
// as { point, normal, dist } or null (open to max range). Walkable = grid cell
// 1 (floor) or 2 (pool); anything else, incl. out-of-bounds, is a wall. Used
// ONLY for cosmetics (trail clip, spark/decal placement) — combat raycasts are
// unchanged, so enemy hit logic is untouched.
function raycastWall(origin, dir, maxDist) {
  if (!mazeGrid || !mazeGrid.length) return null;
  const dx = dir.x, dz = dir.z;
  if (Math.abs(dx) < 1e-6 && Math.abs(dz) < 1e-6) return null;
  let gx = Math.floor(origin.x / CELL), gy = Math.floor(origin.z / CELL);
  const stepX = dx >= 0 ? 1 : -1, stepZ = dz >= 0 ? 1 : -1;
  const nextBX = (gx + (dx >= 0 ? 1 : 0)) * CELL;
  const nextBZ = (gy + (dz >= 0 ? 1 : 0)) * CELL;
  let tMaxX = Math.abs(dx) < 1e-6 ? Infinity : (nextBX - origin.x) / dx;
  let tMaxZ = Math.abs(dz) < 1e-6 ? Infinity : (nextBZ - origin.z) / dz;
  const tDeltaX = Math.abs(dx) < 1e-6 ? Infinity : Math.abs(CELL / dx);
  const tDeltaZ = Math.abs(dz) < 1e-6 ? Infinity : Math.abs(CELL / dz);
  let axis = 'x';
  for (let i = 0; i < 256; i++) {
    let t;
    if (tMaxX < tMaxZ) { gx += stepX; t = tMaxX; tMaxX += tDeltaX; axis = 'x'; }
    else               { gy += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; axis = 'z'; }
    if (t > maxDist) return null;
    const row = mazeGrid[gy];
    const cell = row ? row[gx] : undefined;
    if (cell !== 1 && cell !== 2) {
      const point = origin.clone().add(dir.clone().multiplyScalar(t));
      const normal = axis === 'x' ? new THREE.Vector3(-stepX, 0, 0) : new THREE.Vector3(0, 0, -stepZ);
      return { point, normal, dist: t };
    }
  }
  return null;
}

// ── Sparks: pooled tiny emissive boxes that fly out + fade (~0.25s). No lights. ──
const SPARK_POOL_SIZE = 64;
let sparkPool = [], sparkGeo = null, sparkMat = null;
function ensureSparkPool() {
  if (sparkGeo) return;
  sparkGeo = new THREE.BoxGeometry(0.05, 0.05, 0.05);
  sparkMat = new THREE.MeshStandardMaterial({ color: 0xffd27a, emissive: 0xffaa44, emissiveIntensity: 2.6, transparent: true, opacity: 1 });
  for (let i = 0; i < SPARK_POOL_SIZE; i++) {
    const mesh = new THREE.Mesh(sparkGeo, sparkMat);
    mesh.visible = false;
    sparkPool.push({ mesh, active: false, life: 0, maxLife: 0.25, vel: new THREE.Vector3() });
  }
}
let _sparkScan = 0;
function spawnImpactSparks(point, count) {
  ensureSparkPool();
  for (let n = 0; n < count; n++) {
    // find a free slot (round-robin scan; skip if pool saturated)
    let s = null;
    for (let k = 0; k < SPARK_POOL_SIZE; k++) {
      const cand = sparkPool[(_sparkScan + k) % SPARK_POOL_SIZE];
      if (!cand.active) { s = cand; _sparkScan = (_sparkScan + k + 1) % SPARK_POOL_SIZE; break; }
    }
    if (!s) return;
    s.active = true;
    s.life = s.maxLife = 0.18 + Math.random() * 0.12;
    s.mesh.position.copy(point);
    s.mesh.visible = true;
    s.mesh.scale.setScalar(0.6 + Math.random() * 0.8);
    s.vel.set((Math.random() - 0.5) * 6, (Math.random() - 0.2) * 6, (Math.random() - 0.5) * 6);
    if (!s.mesh.parent) scene.add(s.mesh);
  }
}
function updateImpactSparks(dt) {
  for (const s of sparkPool) {
    if (!s.active) continue;
    s.life -= dt;
    if (s.life <= 0) { s.active = false; s.mesh.visible = false; continue; }
    s.vel.y -= 14 * dt; // gravity
    s.mesh.position.addScaledVector(s.vel, dt);
    s.mesh.scale.setScalar(Math.max(0.05, (s.life / s.maxLife) * 1.2));
  }
}

// ── Bullet-hole decals: pooled dark quads, max 20, oldest recycled (ring). ──
const DECAL_POOL_MAX = 20;
let decalPool = [], decalRing = 0, decalGeo = null, decalMat = null;
function ensureDecalPool() {
  if (decalGeo) return;
  decalGeo = new THREE.PlaneGeometry(0.17, 0.17);
  decalMat = new THREE.MeshStandardMaterial({ color: 0x0a0807, roughness: 1, metalness: 0, transparent: true, opacity: 0.72, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
}
function spawnBulletHole(point, normal) {
  // skip if the hit is above the wall or below the floor band (DDA ignores Y)
  if (point.y < 0.12 || point.y > WALL_H - 0.12) return;
  ensureDecalPool();
  let slot = decalPool[decalRing];
  if (!slot) { slot = new THREE.Mesh(decalGeo, decalMat); decalPool[decalRing] = slot; }
  decalRing = (decalRing + 1) % DECAL_POOL_MAX;
  slot.position.copy(point).addScaledVector(normal, 0.013);
  slot.lookAt(point.clone().add(normal));
  slot.rotation.z = (point.x * 7.3 + point.z * 3.1) % Math.PI; // pseudo-random spin, deterministic
  slot.visible = true;
  if (!slot.parent) scene.add(slot);
}

// ── Flare light: plant the persistent slot + a glowing bead at the impact for
//    ~8s, flickering down. ONE slot — a new flare re-plants it (last wins). ──
const FLARE_DURATION = 8;
let flareState = { active: false, timer: 0, mesh: null };
let flareGeo = null, flareMat = null;
function plantFlare(point) {
  if (!flareLight) return;
  if (!flareGeo) {
    flareGeo = new THREE.SphereGeometry(0.09, 8, 8);
    flareMat = new THREE.MeshStandardMaterial({ color: 0xff6622, emissive: 0xff5522, emissiveIntensity: 3, transparent: true, opacity: 1 });
    flareState.mesh = new THREE.Mesh(flareGeo, flareMat);
  }
  flareState.active = true;
  flareState.timer = FLARE_DURATION;
  flareLight.position.copy(point);
  flareLight.position.y = Math.max(0.5, Math.min(WALL_H - 0.3, flareLight.position.y));
  flareState.mesh.position.copy(flareLight.position);
  flareState.mesh.visible = true;
  if (!flareState.mesh.parent) scene.add(flareState.mesh);
}
function updateFlares(dt) {
  if (!flareState.active) { if (flareLight) flareLight.intensity = 0; return; }
  flareState.timer -= dt;
  if (flareState.timer <= 0) {
    flareState.active = false;
    if (flareLight) flareLight.intensity = 0;
    if (flareState.mesh) flareState.mesh.visible = false;
    return;
  }
  const k = flareState.timer / FLARE_DURATION;
  const flick = 0.82 + 0.18 * Math.sin(clock.getElapsedTime() * 28);
  flareLight.intensity = 2.6 * Math.max(0.15, k) * flick;
  if (flareState.mesh) {
    flareState.mesh.material.emissiveIntensity = 3 * Math.max(0.2, k) * flick;
    flareState.mesh.material.opacity = Math.min(1, k * 2.2);
  }
}

// Pull every active pooled FX mesh OUT of the scene before the buildMazeScene
// teardown traversal runs — their geo/mats are module-level SHARED (never
// disposed), so they must not be caught by that dispose pass (same contract as
// ammo pickups / balloons).
function clearImpactFx() {
  for (const s of sparkPool) { if (s.mesh.parent) scene.remove(s.mesh); s.active = false; s.mesh.visible = false; }
  for (const d of decalPool) { if (d && d.parent) scene.remove(d); }
  decalRing = 0;
  if (flareState.mesh && flareState.mesh.parent) scene.remove(flareState.mesh);
  flareState.active = false; flareState.timer = 0;
}

/* ═══════════════════════════════════════════
   SCANNER DOTS (Lights Out, floor 18) — the novel mechanic. A pulse paints
   short-lived GLOWING dots where its rays hit geometry (the firer's slot color)
   and on monsters (RED). Between pulses you're blind; you navigate by memory.

   CONSTRAINT-CRITICAL: dots are EMISSIVE-ONLY and add ZERO lights. Each color is
   ONE InstancedMesh of MeshStandardMaterial WITHOUT a map — the SAME program
   family the ceiling-light fixtures (and Hotel-Chase furniture) instance on every
   floor, so no new shader program and no PROG movement. Fade is per-INSTANCE
   SCALE (shrink to nothing) — the shared material never changes, so all of one
   color's dots ride a single draw call. Shared geometry is never disposed; the
   meshes are pulled from the scene before the buildMazeScene teardown traverse
   (same contract as sparks/decals/ammo).
   ═══════════════════════════════════════════ */
const SCAN_DOT_CAP = 256;        // per color (ring-recycled)
const SCAN_DOT_SIZE = 0.085;     // dot world radius at full scale
const SCAN_DOT_LIFE = 3.6;       // seconds a dot lingers before it winks out
const SCAN_RANGE = CELL * 6;     // how far a pulse reaches
const SCAN_WALL_RAYS = 64;       // radial rays that trace walls
const SCAN_COOLDOWN = 1.5;       // seconds between pulses (can't spam-light the room)
const SCAN_MONSTER_COLOR = 0xff1414; // monsters are always RED, distinct from any slot color
let scanCooldown = 0;
let scanDotGeo = null;
const scanDotMeshes = {};        // colorKey -> { mesh, mat, slots:[{active,life,maxLife,x,y,z}], ring }
const _scanM4 = new THREE.Matrix4();
const _scanZero = new THREE.Matrix4().makeScale(0, 0, 0);

function getScanDotEntry(colorKey, hex) {
  let entry = scanDotMeshes[colorKey];
  if (entry) { if (!entry.mesh.parent) scene.add(entry.mesh); return entry; }
  if (!scanDotGeo) scanDotGeo = new THREE.SphereGeometry(1, 6, 5); // unit sphere; per-instance matrix scales it
  // Emissive Standard NO-MAP → ammoPickupMat-pinned family; the INSTANCED variant
  // is what the light fixtures use every floor. color black so ONLY the emissive
  // shows (it glows in pitch black; it does NOT light anything — no PointLight).
  const mat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: hex, emissiveIntensity: 2.6, roughness: 1, metalness: 0 });
  const mesh = new THREE.InstancedMesh(scanDotGeo, mat, SCAN_DOT_CAP);
  mesh.frustumCulled = false;
  for (let i = 0; i < SCAN_DOT_CAP; i++) mesh.setMatrixAt(i, _scanZero);
  mesh.instanceMatrix.needsUpdate = true;
  scene.add(mesh);
  entry = { mesh, mat, ring: 0, slots: Array.from({ length: SCAN_DOT_CAP }, () => ({ active: false, life: 0, maxLife: 1, x: 0, y: 0, z: 0 })) };
  scanDotMeshes[colorKey] = entry;
  return entry;
}
function spawnScanDot(colorKey, hex, x, y, z) {
  const entry = getScanDotEntry(colorKey, hex);
  const i = entry.ring; entry.ring = (entry.ring + 1) % SCAN_DOT_CAP;
  const s = entry.slots[i];
  s.active = true; s.life = s.maxLife = SCAN_DOT_LIFE * (0.82 + Math.random() * 0.36);
  s.x = x; s.y = y; s.z = z;
}
function updateScanDots(dt) {
  for (const key in scanDotMeshes) {
    const entry = scanDotMeshes[key];
    let dirty = false;
    const slots = entry.slots;
    for (let i = 0; i < SCAN_DOT_CAP; i++) {
      const s = slots[i];
      if (!s.active) continue;
      s.life -= dt;
      if (s.life <= 0) { s.active = false; entry.mesh.setMatrixAt(i, _scanZero); dirty = true; continue; }
      const k = s.life / s.maxLife;                 // 1 → 0
      const sc = SCAN_DOT_SIZE * (0.35 + 0.65 * k); // shrink as it fades out
      _scanM4.makeScale(sc, sc, sc); _scanM4.setPosition(s.x, s.y, s.z);
      entry.mesh.setMatrixAt(i, _scanM4);
      dirty = true;
    }
    if (dirty) entry.mesh.instanceMatrix.needsUpdate = true;
  }
}
// Teardown: pull the instanced dot meshes out of the scene BEFORE the dispose
// traverse (shared geo/mats persist for the session) and reset every slot.
function clearScanDots() {
  for (const key in scanDotMeshes) {
    const entry = scanDotMeshes[key];
    if (entry.mesh.parent) scene.remove(entry.mesh);
    for (const s of entry.slots) s.active = false;
    entry.ring = 0;
    for (let i = 0; i < SCAN_DOT_CAP; i++) entry.mesh.setMatrixAt(i, _scanZero);
    entry.mesh.instanceMatrix.needsUpdate = true;
  }
}

// Local mob positions for the monster-reveal pass (host: real enemies; client:
// snapshot mirrors). Each machine reveals from ITS OWN list → no host authority
// needed for the reveal.
function scanMobPositions() {
  const out = [];
  if (typeof netIsClient === 'function' && netIsClient()) {
    if (typeof netMobs !== 'undefined') for (const m of netMobs.values()) if (!m.dying) out.push(m.mesh.position);
  } else {
    for (const e of enemies) if (e.alive) out.push(e.pos);
  }
  return out;
}

// THE PULSE. origin = world eye point; slot = firer's color slot (co-op). Paints
// wall dots (radial rays), floor dots (radial samples), and RED monster dots
// (LOS-gated) — all from THIS machine's geometry + mob knowledge, so it's
// reproducible for a teammate's pulse too. Pure cosmetics (no damage/gameplay).
function doScanPulse(origin, slot) {
  if (!mazeGrid || !mazeGrid.length) return;
  const hex = NET_PLAYER_COLORS[slot % NET_PLAYER_COLORS.length];
  const key = 'p' + (slot % NET_PLAYER_COLORS.length);
  const oy = origin.y;

  // WALLS — a radial ring of rays at eye height (slightly downward so dots ride
  // the wall a touch below eye level), traced by the grid-DDA wall raycast.
  for (let i = 0; i < SCAN_WALL_RAYS; i++) {
    const a = (i / SCAN_WALL_RAYS) * Math.PI * 2;
    _scanDir.set(Math.sin(a), -0.04, Math.cos(a));
    const hit = raycastWall(origin, _scanDir, SCAN_RANGE);
    if (hit) {
      const dy = Math.max(0.15, Math.min(WALL_H - 0.15, hit.point.y));
      spawnScanDot(key, hex, hit.point.x, dy, hit.point.z);
    }
  }
  // FLOOR — radial samples on open ground (LOS-gated so you don't paint through walls).
  const rings = [CELL * 1.1, CELL * 2.4, CELL * 3.9, CELL * 5.2];
  for (let ri = 0; ri < rings.length; ri++) {
    const r = rings[ri], steps = 12 + ri * 4;
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2 + ri * 0.6;
      const fx = origin.x + Math.sin(a) * r, fz = origin.z + Math.cos(a) * r;
      if (!isOpenCell(fx, fz)) continue;
      _scanDir.set(fx - origin.x, 0, fz - origin.z);
      const d = _scanDir.length(); if (d < 0.01) continue;
      _scanDir.multiplyScalar(1 / d);
      const w = raycastWall(origin, _scanDir, d);
      if (w && w.dist < d - 0.25) continue; // a wall is between → don't paint it
      spawnScanDot(key, hex, fx, 0.06, fz);
    }
  }
  // MONSTERS — RED dots, LOS-gated (a mob behind a wall stays hidden; you hear it).
  for (const p of scanMobPositions()) {
    const dx = p.x - origin.x, dz = p.z - origin.z;
    const d = Math.hypot(dx, dz);
    if (d > SCAN_RANGE || d < 0.01) continue;
    _scanDir.set(dx, 0, dz).multiplyScalar(1 / d);
    const w = raycastWall(origin, _scanDir, d);
    if (w && w.dist < d - 0.4) continue;
    spawnScanDot('red', SCAN_MONSTER_COLOR, p.x, 1.15, p.z);
    spawnScanDot('red', SCAN_MONSTER_COLOR, p.x, 0.45, p.z); // a second dot reads as a "body"
  }
}
const _scanDir = new THREE.Vector3();

// LOCAL fire: cooldown-gated. Paints my pulse in my slot color + pings + tells
// teammates so my dots show up in their world (in my color). Co-op cosmetic.
function fireScannerLocal() {
  if (scanCooldown > 0) return;
  scanCooldown = SCAN_COOLDOWN;
  const slot = (typeof netMySlot === 'function') ? netMySlot() : 0;
  doScanPulse(camera.position, slot);
  if (typeof playScannerPing === 'function') playScannerPing();
  if (typeof netAnnounceScan === 'function') netAnnounceScan(camera.position, slot);
}

/* ═══════════════════════════════════════════
   WEAPON SWITCHING
   ═══════════════════════════════════════════ */
// Stow the active weapon's ammo, equip idx, restore its ammo, rebuild the
// viewmodel. Owned-only; a denied switch is silent. Brief fire delay so a
// switch can't instantly fire the new gun.
function switchWeapon(idx) {
  if (idx < 0 || idx >= WEAPONS.length || idx === player.weaponIdx) return;
  if (player.isDown || !weaponOwned(idx)) return;
  player.weaponAmmo[player.weaponIdx] = { clip: player.clipAmmo, reserve: player.reserveAmmo };
  player.weaponIdx = idx;
  let a = player.weaponAmmo[idx];
  if (!a) { a = { clip: wpnClip(WEAPONS[idx]), reserve: wpnReserve(WEAPONS[idx]) }; player.weaponAmmo[idx] = a; }
  player.clipAmmo = a.clip;
  player.reserveAmmo = a.reserve;
  player.isReloading = false;
  player.reloadTimer = 0;
  player.fireTimer = 0.18;
  document.getElementById('reloadBarContainer').style.opacity = '0';
  hudSetStyle('ammoWarning', 'opacity', '0');
  createGun();
  playWeaponSwitch();
  updateHUD();
}
// Scroll to the next/prev OWNED weapon.
function cycleWeapon(dir) {
  const n = WEAPONS.length;
  for (let step = 1; step <= n; step++) {
    const idx = ((player.weaponIdx + dir * step) % n + n) % n;
    if (weaponOwned(idx)) { switchWeapon(idx); return; }
  }
}

// Build the per-pellet direction rays for a shot: 1 clean ray for a no-spread
// weapon, else N rays randomly distributed in the weapon's spread cone. The
// SHOOTER generates these and (in MP) ships them so the host resolves the very
// same rays — combat already being non-deterministic (damage variance / drops),
// the spread randomness rides along with it.
function buildPelletRays(baseDir, w) {
  const rays = [];
  if (w.pellets <= 1 && !w.spread) { rays.push(baseDir.clone().normalize()); return rays; }
  const up = Math.abs(baseDir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(baseDir, up).normalize();
  const realUp = new THREE.Vector3().crossVectors(right, baseDir).normalize();
  const n = Math.max(1, w.pellets);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * w.spread; // uniform over the disc
    rays.push(baseDir.clone()
      .addScaledVector(right, Math.cos(a) * r)
      .addScaledVector(realUp, Math.sin(a) * r)
      .normalize());
  }
  return rays;
}

// Resolve ONE pellet against boss → (enemy vs balloon, nearest wins), applying
// the weapon's distance-faloff damage. Shared by the local host shot and the
// host's resolution of a remote client's pellet (shooterConn routes the kill
// reward / balloon aggro). Returns { hit, killed, point, kind }.
// dmgMult defaults to the LOCAL player's shop damage; a remote client's shot
// passes its own multiplier (client-trusted, same as before) so the host scores
// it with the shooter's upgrades, not the host's.
function resolveCombatPellet(origin, dir, w, shooterConn, dmgMult) {
  const mult = dmgMult != null ? dmgMult : shopStats.damageMult;
  const ray = new THREE.Raycaster(origin.clone(), dir.clone().normalize(), 0.1, w.range);
  const dmgAt = (dist) => w.damage * mult * wpnFalloff(w, dist) * (0.9 + Math.random() * 0.3);
  if (bossEntity && bossEntity.alive) {
    const bHit = raycastBoss(ray);
    if (bHit) {
      damageBoss(dmgAt(origin.distanceTo(bHit)));
      return { hit: true, killed: false, point: bHit.clone(), kind: 'boss' };
    }
  }
  const res = raycastEnemies(ray, origin);
  const bres = balloons.length > 0 ? raycastBalloons(ray, origin) : null;
  if (bres && (!res || bres.dist < origin.distanceTo(res.point))) {
    popBalloon(bres.balloon, shooterConn);
    return { hit: true, killed: false, point: bres.point.clone(), kind: 'balloon' };
  }
  if (res) {
    const killed = applyEnemyHit(res.enemy, dmgAt(origin.distanceTo(res.point)), shooterConn);
    return { hit: true, killed, point: res.point.clone(), kind: 'enemy' };
  }
  return { hit: false, killed: false, point: null, kind: null };
}

// Cosmetics for one pellet: trail to the impact, sparks, and a wall decal on a
// miss. bodyPoint (an enemy/boss/balloon hit) overrides the wall raycast.
function drawPelletFx(gunTip, origin, dir, w, bodyPoint) {
  let end, isWall = false, normal = null;
  if (bodyPoint) {
    end = bodyPoint;
  } else {
    const wh = raycastWall(origin, dir, w.range);
    if (wh) { end = wh.point; isWall = true; normal = wh.normal; }
    else end = origin.clone().add(dir.clone().normalize().multiplyScalar(w.range));
  }
  spawnBulletTrail(gunTip, end);
  spawnImpactSparks(end, w.pellets > 1 ? 2 : (w.sound === 'smg' ? 2 : 4));
  if (isWall) spawnBulletHole(end, normal);
}

// Where a flare's light plants: the wall it strikes (pulled back slightly) or a
// capped throw distance, so the glow lands in the room rather than at max range.
function flareImpactPoint(origin, dir, w) {
  const THROW = 14;
  const wh = raycastWall(origin, dir, THROW);
  if (wh) return wh.point.clone().addScaledVector(dir.clone().normalize(), -0.3);
  return origin.clone().add(dir.clone().normalize().multiplyScalar(THROW));
}

function ammoWarnAndHud() {
  if (player.clipAmmo === 0 && player.reserveAmmo > 0) hudSetStyle('ammoWarning', 'opacity', '1');
  updateHUD();
}

function playerShoot() {
  if (player.isDown) return; // MP: downed players can't shoot
  if (player.isReloading || player.fireTimer > 0 || player.clipAmmo <= 0) return;
  const w = curWeapon();
  if (!cheatInfAmmo) player.clipAmmo--; // DEV infinite ammo: clip never drops → never empties/reloads
  player.fireTimer = wpnFireRate(w);
  gunRecoil = w.recoil;
  muzzleFlashTimer = w.muzzleTime;
  playWeaponShot(w.sound);

  // Screen flash
  document.getElementById('muzzleOverlay').style.opacity = '1';
  setTimeout(() => document.getElementById('muzzleOverlay').style.opacity = '0', 45);

  const baseDir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  const rays = buildPelletRays(baseDir, w);

  // Gun tip (world) for trail starts
  const gunTip = new THREE.Vector3(0, 0, -0.32);
  if (gunGroup) gunTip.applyMatrix4(gunGroup.matrixWorld);
  else gunTip.copy(camera.position);

  // MP HOST: clients' shots reach peers via the 'shoot' relay; the host's own
  // shots need this explicit cosmetic broadcast (net.js — carries weapon + rays).
  if (netState.role === 'host') netAnnounceShot(camera.position, baseDir, rays, w.id);

  // MP CLIENT: no authoritative enemies here — play cosmetics locally and send
  // the rays to the host, which resolves damage (result returns via snapshot).
  if (netIsClient()) {
    netSendShoot(camera.position, baseDir, rays, w.id);
    for (const rd of rays) drawPelletFx(gunTip, camera.position, rd, w, null);
    if (w.flare) plantFlare(flareImpactPoint(camera.position, baseDir, w));
    ammoWarnAndHud();
    return;
  }

  // HOST / SOLO: resolve every pellet authoritatively.
  let anyHit = false, kills = 0;
  for (const rd of rays) {
    const r = resolveCombatPellet(camera.position, rd, w, null);
    if (r.hit) { anyHit = true; if (r.killed) kills++; }
    drawPelletFx(gunTip, camera.position, rd, w, r.point);
  }
  if (anyHit) {
    playHit();
    hitmarkerTimer = 0.18;
    hitmarkerKill = kills > 0;
    player.kills += kills;
  }
  if (w.flare) plantFlare(flareImpactPoint(camera.position, baseDir, w));
  ammoWarnAndHud();
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
  // THE CHASER (Hotel Chase) is UNKILLABLE: bullets only FLINCH it — no damage,
  // and crucially NO stun (a stun per shot would let a fast gun freeze it in
  // place and trivialize the level). Returns not-killed → no reward / kill-gate
  // credit. There is no death state for it.
  if (e.unkillable) {
    e.hitFlashTimer = 0.1;
    setMobFlash(e, true);
    return false;
  }
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
  maybeDropConsumable(e.pos.x, e.pos.z); // small chance of an almond water / bandage drop

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
  const w = WEAPONS[d.w] || WEAPONS[0];
  // Pellet rays the client actually fired (d.p); fall back to the single aim dir
  // for a one-ray weapon. Each is resolved with the shooter's own damage mult.
  const rays = (d.p && d.p.length)
    ? d.p.map(p => new THREE.Vector3(p[0], p[1], p[2]).normalize())
    : [new THREE.Vector3(d.dx, d.dy, d.dz).normalize()];
  for (const rd of rays) resolveCombatPellet(origin, rd, w, fromConn, d.m || 1);
}

function playerReload() {
  if (player.isDown) return; // MP: downed players can't reload
  const w = curWeapon();
  if (player.isReloading || player.clipAmmo >= wpnClip(w) || player.reserveAmmo <= 0) return;
  player.isReloading = true;
  player.reloadTimer = w.reloadTime;
  player.reloadDuration = w.reloadTime; // for the HUD bar fill ratio (per-weapon)
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

  // CHASE floors (Hotel Chase) override stamina: you can sprint the WHOLE way.
  // Stamina is pinned full and never gates/drains — "run for your life" would be
  // ruined by stamina management (see theme.noStamina).
  const noStamina = !!getTheme(currentFloor).noStamina;
  player.isSprinting = keys['ShiftLeft'] && isMoving && (noStamina || player.stamina > 0) && player.onGround;
  // Pools: wading below the water line slows you (per-theme theme.water.slow).
  const inWater = !!poolWater && floorHeightAt(player.pos.x, player.pos.z) < 0 &&
                  (player.pos.y - 1.6) < -poolWater.surfaceDrop + 0.05;
  const speed = MOVE_SPEED * (player.isSprinting ? SPRINT_MULT : 1) * (player.isADS ? 0.6 : 1) *
                (inWater ? poolWater.slow : 1);

  if (noStamina) player.stamina = MAX_STAMINA;       // pinned full — no drain, no gate
  else if (player.isSprinting) player.stamina = Math.max(0, player.stamina - STAMINA_DRAIN * dt);
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
  if (scanCooldown > 0) scanCooldown -= dt; // Lights Out scanner recharge
  // SCANNER FLOOR (Lights Out): LMB pulses the scanner (fired on the mousedown
  // EVENT, not held), and the GUN auto-fires on held RIGHT mouse (ADS is useless
  // in the dark, so RMB is repurposed to shoot). Elsewhere: LMB auto-fires as usual.
  const autoFireHeld = getTheme(currentFloor).scanner ? rightMouseDown : mouseDown;
  if (autoFireHeld && !player.isReloading && player.fireTimer <= 0 && player.clipAmmo > 0) playerShoot();

  if (player.isReloading) {
    player.reloadTimer -= dt;
    const rdur = player.reloadDuration || RELOAD_TIME;
    document.getElementById('reloadBarFill').style.width = ((1 - player.reloadTimer / rdur) * 100) + '%';
    if (player.reloadTimer <= 0) {
      const take = Math.min(wpnClip(curWeapon()) - player.clipAmmo, player.reserveAmmo);
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
  floorReserveTopUp(); // ~3 mags back across the equipped gun + every stashed gun

  const theme = generateCurrentFloor();
  netOnHostStart(currentFloor, floorSeed); // MP: rebuild all clients on this floor

  buildMazeScene();

  if (theme.isBoss) {
    setTimeout(() => { if (gameState === 'playing') spawnBoss(); }, 1500);
  } else {
    spawnWave();
    // CHASE floors: release the unkillable pursuer(s) shortly after the floor
    // builds (each has its own spawn-grace head start — see spawnChaser).
    if (theme.archetype === 'chase') setTimeout(() => { if (gameState === 'playing') spawnFloorChasers(); }, 1500);
  }

  updateHUD();
  showFloorAnnounce();
}

/* ── MUSIC CREDIT — a small, non-intrusive line shown for ~4s (then fades) when a
   floor's real music FILE actually starts. Driven from updateFloorMusic's onStart
   (audio.js), so it only appears when the file truly plays (not on a procedural
   fallback). hideMusicCredit clears any lingering credit on the next floor entry. */
let _musicCreditTO = null;
function showMusicCredit(theme) {
  const el = document.getElementById('musicCredit');
  if (!el) return;
  if (!theme || !theme.musicCredit) { el.style.opacity = '0'; return; }
  el.textContent = '♪ MUSIC: ' + theme.musicCredit;
  el.style.opacity = '1';
  if (_musicCreditTO) clearTimeout(_musicCreditTO);
  _musicCreditTO = setTimeout(() => { el.style.opacity = '0'; }, 4000); // CSS transition fades it
}
function hideMusicCredit() {
  const el = document.getElementById('musicCredit');
  if (el) el.style.opacity = '0';
  if (_musicCreditTO) { clearTimeout(_musicCreditTO); _musicCreditTO = null; }
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
  // Artifacts join the sig only once their cell is fog-revealed; collecting one
  // drops it from `artifacts`, changing the sig → redraw.
  for (const a of artifacts) if (isCellSeen(a.x, a.z)) sig += '|A' + a.x.toFixed(1) + ',' + a.z.toFixed(1);
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

  // HEADING-UP minimap: center on the player and rotate the whole map by the
  // player's yaw so FORWARD is ALWAYS up (strafe always perpendicular). EVERY
  // element below (grid, basins, exit, artifacts, enemies, boss, teammates) is
  // drawn in the same world→canvas space (pos/CELL*cell), so they all rotate
  // together and stay perfectly aligned; the player is then drawn fixed at the
  // center pointing up. rot == yaw: forward (-sin yaw, -cos yaw) → screen-up.
  const cx = w / 2, cy = h / 2;
  const pcx = player.pos.x / CELL * cellW;
  const pcy = player.pos.z / CELL * cellH;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(player.yaw);
  ctx.translate(-pcx, -pcy);

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

  // Artifacts — cyan markers, fog-gated like the exit (hidden until their cell
  // is discovered). Collected ones are gone from `artifacts`, so they vanish.
  for (const a of artifacts) {
    if (!isCellSeen(a.x, a.z)) continue;
    const ax = a.x / CELL * cellW, az = a.z / CELL * cellH;
    ctx.beginPath();
    ctx.arc(ax, az, 3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(110,230,255,0.9)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ax, az, 5.5, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(110,230,255,0.35)';
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

  ctx.restore(); // end heading-up transform (player marker below is screen-fixed)

  // Player — fixed at the CENTER, ALWAYS pointing up. The rotated map above puts
  // the world's "forward" toward the top, so this fixed arrow reads as the
  // player's heading; moving forward slides the world downward past it.
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,255,80,0.9)';
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx, cy - 8); // straight up = forward
  ctx.strokeStyle = 'rgba(0,255,80,0.6)';
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
  hudSetStyle('sanityFill', 'width', (player.sanity / MAX_SANITY * 100).toFixed(1) + '%');
  // Consumable inventory counts (dim a slot to 0.35 when empty).
  hudSetText('invAlmondCount', player.almondWater + '/' + CONSUMABLE_MAX);
  hudSetText('invBandageCount', player.bandages + '/' + CONSUMABLE_MAX);
  hudSetStyle('invAlmond', 'opacity', player.almondWater > 0 ? '1' : '0.35');
  hudSetStyle('invBandage', 'opacity', player.bandages > 0 ? '1' : '0.35');
  hudSetText('ammoWeapon', curWeapon().name);
  hudSetText('ammoCurrent', String(player.clipAmmo));
  hudSetText('ammoReserve', '/ ' + player.reserveAmmo);
  hudSetText('hudFloor', 'Level ' + currentFloor);
  hudSetText('hudLevelName', theme.name);
  hudSetText('hudWave', theme.isBoss ? 'BOSS' : 'Wave ' + currentWave);
  // OBJECTIVE GOAL — top center, reflects the floor's active gate condition.
  //  • 'item'  : ARTIFACTS n/N (solo AND co-op — the objective always applies).
  //  • 'kills' : ELIMINATIONS n/m (solo AND co-op now — the kill gate applies to both).
  //  • boss / no gate: hidden (the boss HP bar carries the boss goal).
  const gate = theme.gate || 'kills';
  if (!theme.isBoss && gate === 'reach') {
    // REACH gate: the exit is always open — the goal is to get TO it. Per-theme
    // flavor text (chase = "RUN — REACH THE EXIT"; Lights Out = "FIND THE EXIT").
    hudSetStyle('goalHud', 'display', 'block');
    hudSetText('goalHudText', theme.goalText || 'REACH THE EXIT');
    hudSetStyle('goalHudFill', 'width', '100%');
    if (!_goalHudOpen) { _goalHudOpen = true; hudEl('goalHud').classList.toggle('goal-open', true); }
  } else if (!theme.isBoss && gate === 'item' && artifactsTotal > 0) {
    const open = artifactsCollected >= artifactsTotal;
    const label = theme.itemLabel || 'ARTIFACTS';
    hudSetStyle('goalHud', 'display', 'block');
    hudSetText('goalHudText', open ? 'EXIT OPEN — FIND THE EXIT' : `${label} ${artifactsCollected}/${artifactsTotal}`);
    hudSetStyle('goalHudFill', 'width', Math.min(100, artifactsCollected / artifactsTotal * 100).toFixed(0) + '%');
    if (open !== _goalHudOpen) { _goalHudOpen = open; hudEl('goalHud').classList.toggle('goal-open', open); }
  } else if (!theme.isBoss && gate === 'kills' && killTarget > 0) {
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
  // While a scare owns the ceiling lights (LIGHTS OUT or the SLAM pulse), it
  // drives their intensity directly every frame — skip the normal flicker so
  // the two don't fight (its stray setTimeouts get overwritten next frame).
  if (!scareOwnsLights()) {
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
  }

  if (exitMesh) {
    // Exit doorway: a slow bright pulse on the white opening (no spin — it's a
    // door now, not a disc). Intensity-only; the light slot is unchanged.
    exitMesh.material.emissiveIntensity = 1.25 + Math.sin(clock.getElapsedTime() * 2.2) * 0.35;
  }
}

/* ═══════════════════════════════════════════
   SCRIPTED SCARE EVENTS — designed moments, not random.
   Placement is SEEDED per floor (deterministic, 0 world-rng draws — a
   floorSeed-derived prng like the Level Fun props), but the HOST owns trigger
   evaluation + the which-event roll (spawn-composition model) and broadcasts
   'scare' {type,data} so the whole party gets the same moment (net.js). Clients
   never evaluate triggers — they only apply received scares. Constraints honored
   here: ≤2 per floor, never < SCARE_SAFE_TIME after floor start, never on a boss
   floor; lights only ever change INTENSITY (budget untouched); NO screen shake
   (SLAM is a sound + a light pulse). The 4 effects run on EVERY machine via
   updateScareEffects; trigger evaluation runs host/solo only.
   ═══════════════════════════════════════════ */
const SCARE_SAFE_TIME = 30;        // no scare in the first 30s of a floor
const SCARE_TYPES = ['lightsout', 'watcher', 'roar', 'slam'];
let scareTriggers = [];            // [{ wx, wz, kind:'prox'|'timer', at, radius, fired }]
let scaresFiredThisFloor = 0;
let scareMaxThisFloor = 0;
// Active effects (run on all machines):
let scareLightsOut = null;         // { t, phase }
let scarePulse = 0;                // SLAM light-pulse countdown (s)
let scareAmbientDim = null;        // { t, base } — DISTANT ROAR ambient dip
let scareWatchers = [];            // [{ sprite, seen, away, life }]

function scareOwnsLights() { return scareLightsOut !== null || scarePulse > 0; }

// Seeded, deterministic per floor — placed at buildMazeScene time. Uses a
// floorSeed-derived prng (NOT the world rng()), so it consumes ZERO world draws
// and can't shift spawn/exit/ammo placement. Trigger WHERE is fixed; the host
// still rolls WHICH event + WHEN it actually fires.
function placeScareTriggers(theme) {
  scareTriggers = [];
  scaresFiredThisFloor = 0;
  scareMaxThisFloor = 0;
  scareLightsOut = null; scarePulse = 0; scareAmbientDim = null;
  if (theme.isBoss) return; // no scares during a boss

  const sp = mulberry32((floorSeed ^ 0x5CA3E5) >>> 0); // dedicated stream
  // gather walkable floor cells reasonably far from the spawn cell (1,1-ish)
  const cells = [];
  for (let y = 0; y < mazeGrid.length; y++) {
    const row = mazeGrid[y];
    for (let x = 0; x < row.length; x++) {
      if (row[x] !== 1 && row[x] !== 2) continue;
      if (Math.abs(x - 1) + Math.abs(y - 1) < 6) continue; // keep clear of spawn
      cells.push({ x, y });
    }
  }
  if (cells.length === 0) return;

  scareMaxThisFloor = 1 + (sp() < 0.55 ? 1 : 0); // 1 or 2 per floor
  for (let i = 0; i < scareMaxThisFloor && cells.length; i++) {
    const c = cells.splice(Math.floor(sp() * cells.length), 1)[0];
    const wx = c.x * CELL + CELL / 2, wz = c.y * CELL + CELL / 2;
    // ~half proximity-triggered, half on a timer window past the safe time
    if (sp() < 0.5) {
      scareTriggers.push({ wx, wz, kind: 'prox', radius: CELL * 1.8, fired: false });
    } else {
      scareTriggers.push({ wx, wz, kind: 'timer', at: SCARE_SAFE_TIME + 8 + sp() * 55, fired: false });
    }
  }
}

// HOST / SOLO only: evaluate triggers against the real floor clock + player.
function updateScareTriggers(dt) {
  if (netIsClient()) return;
  if (scaresFiredThisFloor >= scareMaxThisFloor) return;
  if (isBossFloor(currentFloor)) return;
  if (floorTimer < SCARE_SAFE_TIME) return; // never within 30s of floor start

  for (const tr of scareTriggers) {
    if (tr.fired) continue;
    let go = false;
    if (tr.kind === 'prox') {
      const dx = player.pos.x - tr.wx, dz = player.pos.z - tr.wz;
      go = (dx * dx + dz * dz) < tr.radius * tr.radius;
    } else {
      go = floorTimer >= tr.at;
    }
    if (!go) continue;
    tr.fired = true;
    scaresFiredThisFloor++;
    fireScare(tr);
    break; // at most one per frame
  }
}

// HOST / SOLO: roll which event (theme-flavored), build its data, apply it
// locally AND broadcast so every player shares the moment.
function fireScare(tr) {
  const theme = getTheme(currentFloor);
  let type = rollScareType(theme);
  let data = {};
  if (type === 'watcher') {
    const spot = pickWatcherSpot();
    if (spot) data = spot;
    else type = 'roar'; // no decent corridor for a watcher → fall back to dread
  }
  if (type === 'slam' || type === 'roar') data = { x: tr.wx, z: tr.wz };
  applyScare(type, data);
  netBroadcastScare(type, data);
}

// Per-floor flavor: pools→roar, dark→lights out, Level Fun→watcher; everything
// stays possible (base weight 1) so floors still vary.
function rollScareType(theme) {
  const w = { lightsout: 1, watcher: 1, roar: 1, slam: 1 };
  if (theme.archetype === 'pools') w.roar += 3;
  if ((theme.darknessLevel || 0) >= 0.6) w.lightsout += 3;
  if (/Level Fun/.test(theme.name || '')) w.watcher += 3;
  const total = w.lightsout + w.watcher + w.roar + w.slam;
  let r = Math.random() * total;
  for (const t of SCARE_TYPES) { r -= w[t]; if (r < 0) return t; }
  return 'roar';
}

// Apply a scare locally. Called directly on the host/solo AND from the 'scare'
// message on clients (net.js), so both sides reproduce the moment identically.
function applyScare(type, data) {
  if (type === 'lightsout') startLightsOut();
  else if (type === 'watcher') spawnWatcher(data.x, data.z);
  else if (type === 'roar') { playDistantRoar(); scareAmbientDim = { t: 1.0, base: ambientLight ? ambientLight.intensity : 0 }; }
  else if (type === 'slam') { playSlam(scarePanToward(data.x, data.z)); scarePulse = 0.16; }
}

/* ── effect updates (run on EVERY machine) ── */
function updateScareEffects(dt) {
  // LIGHTS OUT — drop to ~5% over 0.4s, hold 5s, flicker back over ~1.3s.
  if (scareLightsOut) {
    const s = scareLightsOut; s.t += dt;
    let mult;
    if (s.t < 0.4) mult = 1 - (s.t / 0.4) * 0.95;            // 1 → 0.05
    else if (s.t < 5.4) mult = 0.05;                          // hold dark
    else if (s.t < 6.7) {
      const k = (s.t - 5.4) / 1.3;                            // recover with a stutter
      mult = 0.05 + (1 - 0.05) * k;
      if (Math.sin(s.t * 47) > 0.6) mult *= 0.4;              // flicker on the way back
    } else { mult = 1; }
    for (const f of flickerTimers) f.light.intensity = f.base * mult;
    if (s.t >= 6.7) { for (const f of flickerTimers) f.light.intensity = f.base; scareLightsOut = null; }
  }

  // SLAM light pulse — a sharp dip then partial, ~160ms (no screen shake).
  if (scarePulse > 0) {
    scarePulse -= dt;
    const lit = scarePulse > 0.08 ? 0.2 : 0.65;
    for (const f of flickerTimers) f.light.intensity = f.base * lit;
    if (scarePulse <= 0) { scarePulse = 0; for (const f of flickerTimers) f.light.intensity = f.base; }
  }

  // DISTANT ROAR ambient dip — a smooth 1s dip-and-recover of the ambient light.
  if (scareAmbientDim && ambientLight) {
    const a = scareAmbientDim; a.t -= dt;
    const k = Math.max(0, a.t);                               // 1 → 0
    ambientLight.intensity = a.base * (1 - 0.3 * Math.sin(Math.PI * (1 - k)));
    if (a.t <= 0) { ambientLight.intensity = a.base; scareAmbientDim = null; }
  }

  // THE WATCHER — static billboard; despawns when you look away then back, or get
  // close. Each player evaluates against their OWN camera (per-viewpoint scare).
  if (scareWatchers.length) {
    const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd);
    for (let i = scareWatchers.length - 1; i >= 0; i--) {
      const wch = scareWatchers[i];
      wch.life -= dt;
      const dx = wch.sprite.position.x - camera.position.x;
      const dz = wch.sprite.position.z - camera.position.z;
      const dist = Math.hypot(dx, dz);
      const inView = (dx * fwd.x + dz * fwd.z) / (dist || 1) > 0.6 && dist < 45;
      let gone = false;
      if (dist < 5.5) gone = true;                            // got close
      else if (wch.seen && wch.away && inView) gone = true;   // looked away → back
      else {
        if (inView) wch.seen = true;
        else if (wch.seen) wch.away = true;
      }
      if (gone || wch.life <= 0) {
        scene.remove(wch.sprite);
        wch.sprite.material.dispose(); // per-instance material; .map is the SHARED mob texture — never disposed
        scareWatchers.splice(i, 1);
        if (gone) playWhisper();                              // silent on the safety-timeout despawn
      }
    }
  }
}

function startLightsOut() {
  scareLightsOut = { t: 0 };
  playRumble();
}

// A still billboard down a corridor, facing the player (sprites auto-face the
// camera). Cosmetic only — not an enemy: no AI, no contact damage, not in the
// kill gate, not shootable. Reuses a shared mob sprite texture (pinned program
// family) so no new shader program.
function spawnWatcher(wx, wz) {
  if (typeof spriteTextures === 'undefined') return;
  const tex = spriteTextures['stalker'] || spriteTextures['phantom'] || spriteTextures['crawler'];
  if (!tex) return;
  const mat = new THREE.SpriteMaterial({ map: tex, color: 0xffffff, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(2.6, 2.6, 1);
  sprite.position.set(wx, 1.3, wz);
  scene.add(sprite);
  scareWatchers.push({ sprite, seen: false, away: false, life: 30 });
}

// HOST: pick a spot ~down the corridor the player faces (medium distance), short
// of the wall. Returns {x,z} or null when there's no decent corridor (caller
// falls back to a non-watcher scare). Uses the cosmetic wall raycast.
function pickWatcherSpot() {
  const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd);
  fwd.y = 0;
  if (fwd.lengthSq() < 1e-4) return null;
  fwd.normalize();
  const wall = raycastWall(player.pos, fwd, 32);
  const corridor = wall ? wall.dist : 32;
  if (corridor < 9) return null;            // too cramped for a medium-distance figure
  const d = Math.min(corridor - 2.5, 22);   // a couple units short of the wall, capped
  if (d < 7) return null;
  return { x: player.pos.x + fwd.x * d, z: player.pos.z + fwd.z * d };
}

// Stereo pan [-1,1] from the listener's facing to a world point (+ = right).
function scarePanToward(wx, wz) {
  const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd);
  const rightX = -fwd.z, rightZ = fwd.x;   // forward rotated -90° about Y
  let dx = wx - camera.position.x, dz = wz - camera.position.z;
  const len = Math.hypot(dx, dz) || 1; dx /= len; dz /= len;
  return Math.max(-1, Math.min(1, dx * rightX + dz * rightZ));
}

/* ═══════════════════════════════════════════
   MOB VOCALIZATIONS — spatialize a creature sound from the LOCAL camera (distance
   attenuation like the remote gunshots + a stereo pan toward the source) and play
   it. `mobVocalLocal` runs on every machine for what it can see; `hostMobVocal`
   ALSO broadcasts the event so co-op players share the scary aggro/attack/roar
   (idle ambience stays local — each machine voices its own nearby mobs). kind:
   'idle' | 'aggro' | 'attack' | 'roar'. Cosmetic — capped in audio.js.
   ═══════════════════════════════════════════ */
function mobVocalLocal(type, kind, wx, wz) {
  if (typeof camera === 'undefined' || !camera || typeof playMobVocal !== 'function') return;
  const dx = wx - camera.position.x, dz = wz - camera.position.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  // idle ambience is quiet + NEARBY only (skitters/whispers around you); events
  // (aggro/attack/roar) carry further + louder so you hear the threat coming.
  if (kind === 'idle' && dist > 34) return; // ~8.5 cells — keep idle local, not level-wide
  const base = (kind === 'idle') ? 0.18 : 0.5;
  const gain = base / (1 + dist * 0.10);
  if (gain < 0.015) return; // too far to bother (also reserves the voice cap for near mobs)
  playMobVocal(type, kind, gain, scarePanToward(wx, wz));
}
function hostMobVocal(type, kind, wx, wz) {
  mobVocalLocal(type, kind, wx, wz);
  if (typeof netBroadcastMobVocal === 'function') netBroadcastMobVocal(type, kind, wx, wz);
}

// Floor teardown: pull active watcher sprites out of the scene BEFORE the
// dispose traverse (their .map is the shared mob texture — must not be caught),
// and clear every active effect / trigger.
function clearScares() {
  for (const wch of scareWatchers) { if (wch.sprite.parent) scene.remove(wch.sprite); wch.sprite.material.dispose(); }
  scareWatchers = [];
  scareLightsOut = null; scarePulse = 0; scareAmbientDim = null;
  scareTriggers = []; scaresFiredThisFloor = 0; scareMaxThisFloor = 0;
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
  // (the per-floor ambient bed is started by buildMazeScene → startAmbient below)

  player.health = shopStats.maxHealth;
  player.stamina = MAX_STAMINA;
  // SANITY + consumables reset on a NEW RUN only (they persist across floors).
  player.sanity = MAX_SANITY;
  player.sanityHealPool = 0; player.healthHealPool = 0;
  player.noDamageTimer = SANITY_RECOVER_DELAY;
  player.almondWater = 0; player.bandages = 0;
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
    clipMult: 1.0,
    staminaRegenMult: 1.0,
    reserveMult: 1.0,
    maxHealth: MAX_HEALTH,
  };
  for (const k in shopUpgrades) shopUpgrades[k].bought = false;

  // WEAPONS: back to the pistol with a full ammo bank for every gun. Owned
  // weapons reset with the shop above (per-run, like upgrades).
  player.weaponIdx = 0;
  initWeaponBank();
  player.clipAmmo = player.weaponAmmo[0].clip;
  player.reserveAmmo = player.weaponAmmo[0].reserve;

  const theme = generateCurrentFloor();
  // MP: the HOST announces the run (floor + seed) so connected clients start
  // the identical level via this same deterministic path. No-op solo/client.
  netOnHostStart(currentFloor, floorSeed);
  buildMazeScene();

  showMenuOverlay(null); // entering gameplay → hide every menu overlay + close the shop
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
    // CHASE floors: release the unkillable pursuer(s) (own spawn-grace head start).
    if (theme.archetype === 'chase') setTimeout(() => { if (gameState === 'playing') spawnFloorChasers(); }, 1500);
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

/* ── Menu state machine ──
   The pause menu and the black market are EXCLUSIVE: opening one hides the
   other, and ESC is handled in exactly ONE place (the keydown listener) with
   the priority black market → pause menu → pause the game. shopReturnTo
   remembers where the market was opened from ('pause' is the only entry point
   today; 'game' is supported so a future hotkey can open it mid-run). */
let shopOpen = false;
let shopReturnTo = 'pause';

/* ── OVERLAY VISIBILITY — single source of truth ──
   The four full-screen MENU overlays are mutually exclusive: exactly ONE shows
   (or NONE, during gameplay). Every state transition routes through here so
   nothing can leak visible across screens (the stacked-overlay bug). The shop is
   a separate gameplay overlay (openShop/closeShop) and is ALWAYS force-closed
   here so it can't end up layered on a menu. The two level-select panels live
   INSIDE #startMenu, so they show only with it (and dev-vs-player exclusivity is
   set once at load — see buildDevLevelSelect / the dev-mode block).
     gameState 'menu'      → startMenu
     gameState 'paused'    → pauseMenu (or the shop, opened separately over it)
     gameState 'gameover'  → gameOverMenu
     gameState 'won'       → victoryMenu
     gameState 'playing'   → none (showMenuOverlay(null)) */
const MENU_OVERLAYS = ['startMenu', 'pauseMenu', 'gameOverMenu', 'victoryMenu'];
function showMenuOverlay(id) {
  for (const o of MENU_OVERLAYS) {
    const el = document.getElementById(o);
    if (el) el.style.display = (o === id) ? 'flex' : 'none';
  }
  closeShopSilent(); // never leave the market layered under/over a menu
}

function openShop(from) {
  if (shopOpen) return;
  shopOpen = true;
  shopReturnTo = from || 'pause';
  document.getElementById('pauseMenu').style.display = 'none'; // exclusivity
  document.getElementById('shopOverlay').style.display = 'flex';
  updateShopUI();
}

function closeShop() {
  if (!shopOpen) return;
  shopOpen = false;
  document.getElementById('shopOverlay').style.display = 'none';
  if (gameState !== 'paused') return; // game state moved on (game over / quit) — leave it be
  // FAST ESCAPE: ESC / Back from the market drops STRAIGHT into gameplay (never
  // back to the pause menu), so you can bail mid-fight — matters in co-op where
  // the world keeps moving. shopReturnTo is intentionally ignored: speed beats
  // retracing the open path.
  document.getElementById('pauseMenu').style.display = 'none'; // keep the pause menu hidden
  resumeGame(); // guarded relock inside
}

// Force-hide the market with NO return-state side effects. Safety net for
// paths that leave the pause state underneath it (game over, quit, restart,
// pointer-lock-loss pause) — guarantees the two overlays are never both up.
function closeShopSilent() {
  shopOpen = false;
  document.getElementById('shopOverlay').style.display = 'none';
}

function pauseGame() {
  if (gameState !== 'playing') return;
  gameState = 'paused';
  showMenuOverlay('pauseMenu'); // also force-closes the shop (exclusivity)
  document.exitPointerLock();
}

function resumeGame() {
  if (gameState !== 'paused' || shopOpen) return; // market must close first (ESC handles it)
  gameState = 'playing';
  showMenuOverlay(null); // hide every menu overlay (returns to gameplay)
  tryPointerLock(); // may fail inside Chrome's post-Esc cooldown → click re-locks
}

function gameOver() {
  gameState = 'gameover';
  stopAllFloorAudio(); // kill the music file + every procedural bed (no bleed into the game-over screen)
  document.getElementById('hud').style.display = 'none';
  showMenuOverlay('gameOverMenu'); // hides start/pause/victory + closes the shop
  document.getElementById('bossHpContainer').style.opacity = '0';
  const theme = getTheme(player.floorReached);
  document.getElementById('goStats').innerHTML =
    `Reached: Level ${player.floorReached} — ${theme.name}<br>Enemies Eliminated: ${player.kills}<br>Waves Survived: ${currentWave - 1}`;
  document.exitPointerLock();
}

/* ═══════════════════════════════════════════
   RUN VICTORY (20th-floor capstone). Triggered when the FINALE boss dies
   (enemies.js → winRun). winRun is the host/solo entry: it shows the screen AND
   broadcasts 'run_won' so the whole party gets the ending together; showVictory
   is the local screen (also called on clients from the 'run_won' handler).
   ═══════════════════════════════════════════ */
function winRun() {
  showVictory();
  if (typeof netBroadcastRunWon === 'function') netBroadcastRunWon(); // host → clients (no-op solo/client)
}

function showVictory() {
  if (gameState === 'won') return; // idempotent (boss death + a relayed 'run_won' could race)
  gameState = 'won';
  // Silence the floor audio for a clean ending.
  if (typeof stopAllFloorAudio === 'function') stopAllFloorAudio();
  if (typeof playVictorySting === 'function') playVictorySting();
  markFloorBeaten(currentFloor); // the capstone counts as cleared (local progression)

  document.getElementById('hud').style.display = 'none';
  document.getElementById('bossHpContainer').style.opacity = '0';
  const theme = getTheme(currentFloor);
  const vs = document.getElementById('vicStats');
  if (vs) vs.innerHTML =
    `You made it out after Level ${currentFloor + 1} — ${theme.name}` +
    `<br>Enemies Eliminated: ${player.kills}` +
    `<br>Floors Cleared: ${currentFloor + 1} / ${LEVEL_THEMES.length}`;
  showMenuOverlay('victoryMenu'); // hides start/pause/gameover + closes the shop
  document.exitPointerLock();
}

function quitToMenu() {
  gameState = 'menu';
  stopAllFloorAudio(); // kill the music file + every procedural bed when bailing to the menu
  document.getElementById('hud').style.display = 'none';
  buildPlayerLevelSelect(); // PART 2: refresh unlocks earned this run
  showMenuOverlay('startMenu'); // the ONLY visible overlay now (hides pause/gameover/victory)
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
  if (e.code === 'KeyQ' && gameState === 'playing') useAlmondWater(); // drink — restore sanity over time
  if (e.code === 'KeyH' && gameState === 'playing') useBandage();     // bandage — restore health over time
  // Weapon select 1-4 (Digit row + numpad). Owned-only switch is handled inside.
  if (gameState === 'playing' && /^(Digit|Numpad)[1-4]$/.test(e.code)) {
    switchWeapon(parseInt(e.code.slice(-1), 10) - 1);
  }
  if (DEV_MODE && e.code === 'KeyL' && gameState === 'playing') { // PART 1: dev-only debug labels
    window.debugLabels = !window.debugLabels;     // DEV: toggle enemy type labels
    console.log('debug labels:', window.debugLabels); // confirms the L handler fired
    if (!window.debugLabels) clearDebugLabels();  // tear down immediately when off
  }
  // PART 1b: dev-only PLAYTEST CHEATS (G god / I infinite-ammo / C cash / K kill-all).
  // Guarded by DEV_MODE so the normal/co-op build never reacts to these keys at all.
  if (DEV_MODE && gameState === 'playing' && (e.code === 'KeyG' || e.code === 'KeyI' || e.code === 'KeyC' || e.code === 'KeyK')) {
    handleDevCheatKey(e.code);
  }
  if (e.code === 'Escape') {
    e.preventDefault();
    // The ONE ESC handler. Priority: black market → pause menu → pause.
    // (While pointer-locked the browser eats ESC for the unlock; that path
    // pauses via the pointerlockchange listener instead.)
    if (shopOpen) closeShop();
    else if (gameState === 'paused') resumeGame();
    else if (gameState === 'playing') pauseGame();
  }
});
document.addEventListener('keyup', e => { keys[e.code] = false; });

// Scroll wheel cycles through OWNED weapons (down = next, up = previous).
document.addEventListener('wheel', e => {
  if (gameState !== 'playing' || document.pointerLockElement !== document.body) return;
  cycleWeapon(e.deltaY > 0 ? 1 : -1);
}, { passive: true });

document.addEventListener('mousemove', e => {
  if (gameState !== 'playing' || document.pointerLockElement !== document.body) return;
  player.yaw -= e.movementX * MOUSE_SENS;
  player.pitch -= e.movementY * MOUSE_SENS;
  player.pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, player.pitch));
});

document.addEventListener('mousedown', e => {
  const scannerFloor = gameState === 'playing' && getTheme(currentFloor).scanner;
  if (e.button === 0) {
    mouseDown = true;
    if (gameState === 'playing') {
      if (document.pointerLockElement === document.body) {
        // SCANNER FLOOR: LMB pulses the scanner instead of firing the gun.
        if (scannerFloor) fireScannerLocal();
        else playerShoot();
      } else {
        // FALLBACK: playing but not locked — happens when resumeGame's relock
        // was rejected by Chrome's post-Esc cooldown. Clicking the game area
        // re-acquires the lock (this click does NOT fire a shot / scan).
        tryPointerLock();
      }
    }
  }
  if (e.button === 2) {
    rightMouseDown = true;
    if (gameState === 'playing') {
      // SCANNER FLOOR: RMB shoots (ADS is useless in the dark); single shot now,
      // auto-fire while held handled in updatePlayer. Elsewhere RMB = ADS.
      if (scannerFloor) { if (document.pointerLockElement === document.body) playerShoot(); }
      else player.isADS = true;
    }
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
// Victory screen (20th-floor capstone): Play Again restarts a run; Main Menu bails.
{
  const va = document.getElementById('btnVictoryAgain');
  const vmn = document.getElementById('btnVictoryMenu');
  // startGame → showMenuOverlay(null) and quitToMenu → showMenuOverlay('startMenu')
  // both hide the victory screen, so no manual display toggle is needed here.
  if (va) va.addEventListener('click', startGame);
  if (vmn) vmn.addEventListener('click', quitToMenu);
}

/* ════ PART 1 — DEV TOOL: unrestricted level-select (jump to ANY floor). Only built
   when ?dev=1; otherwise the whole #devLevelSelect block is hidden so friends never
   see it. Clicking sets selectedStartFloor, which startGame() uses as the start floor.
   DEV vs PLAYER select are MUTUALLY EXCLUSIVE on the start menu: ?dev=1 shows the
   dev panel (unrestricted) and hides the player panel; otherwise the reverse.
   ════ */
(function buildDevLevelSelect() {
  const panel = document.getElementById('devLevelSelect');
  const playerPanel = document.getElementById('playerLevelSelect');
  if (!DEV_MODE) { if (panel) panel.style.display = 'none'; return; }
  if (playerPanel) playerPanel.style.display = 'none'; // dev panel supersedes the player panel in ?dev=1
  const wrap = document.getElementById('devLevelButtons');
  const label = document.getElementById('devSelectedFloor');
  if (!wrap) return;
  LEVEL_THEMES.forEach((theme, i) => {
    const b = document.createElement('button');
    b.className = 'dev-ls-btn' + (theme.isBoss ? ' boss' : '') + (i === selectedStartFloor ? ' selected' : '');
    // Clear named row: "L18  Hotel Chase            [chase]" (was a bare number +
    // hover-only tooltip — clunky to scan).
    const tag = theme.isBoss ? 'BOSS' : (theme.archetype || 'rooms');
    b.innerHTML = `<span class="ls-num">L${i + 1}</span><span class="ls-name"></span><span class="ls-tag"></span>`;
    b.querySelector('.ls-name').textContent = theme.name;
    b.querySelector('.ls-tag').textContent = tag;
    b.title = 'Level ' + (i + 1) + ' — ' + theme.name + ' [' + tag + '] (floor index ' + i + ')';
    b.addEventListener('click', () => {
      selectedStartFloor = i;
      label.textContent = (i + 1) + ' · ' + theme.name;
      wrap.querySelectorAll('.dev-ls-btn').forEach(el => el.classList.remove('selected'));
      b.classList.add('selected');
    });
    wrap.appendChild(b);
  });
  if (label) label.textContent = (selectedStartFloor + 1) + ' · ' + LEVEL_THEMES[selectedStartFloor].name;
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
// Fresh load → the start menu is the ONLY visible overlay (defensive: also enforced
// by CSS display:none on pause/gameover/victory; this guarantees it regardless).
showMenuOverlay('startMenu');

// PART 1: hide the FPS readout entirely unless ?dev=1 (the update is already gated).
if (!DEV_MODE) {
  const _fps = document.getElementById('hudFps'); if (_fps) _fps.style.display = 'none';
  const _st = document.getElementById('hudStats'); if (_st) _st.style.display = 'none';
  const _ch = document.getElementById('hudCheats'); if (_ch) _ch.style.display = 'none';
} else {
  renderCheatHud(); // dev: prime the cheats readout (blank until a cheat is toggled)
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
// Upgrade tracks: tier 1 above tier 2 in a labeled column each, so the
// prerequisite chains read top-down instead of being an unordered pile.
const SHOP_TRACKS = [
  { title: 'ARSENAL',   keys: ['wpn_shotgun', 'wpn_smg', 'wpn_flare'] },
  { title: 'FIREPOWER', keys: ['damage1', 'damage2'] },
  { title: 'TRIGGER',   keys: ['firerate1', 'firerate2'] },
  { title: 'MAGAZINE',  keys: ['mag1', 'mag2'] },
  { title: 'STAMINA',   keys: ['stamina1', 'stamina2'] },
  { title: 'SUPPLY',    keys: ['reserve1'] },
  { title: 'ARMOR',     keys: ['health1'] },
  { title: 'SUPPLIES',  keys: ['buy_almond', 'buy_bandage'] } // repeatable consumables
];

function updateShopUI() {
  document.getElementById('shopBalance').textContent = '$' + playerMoney;
  const grid = document.getElementById('shopGrid');
  grid.innerHTML = '';

  for (const track of SHOP_TRACKS) {
    const col = document.createElement('div');
    col.className = 'shop-track';
    const head = document.createElement('div');
    head.className = 'shop-track-title';
    head.textContent = track.title;
    col.appendChild(head);

    for (const key of track.keys) {
      const up = shopUpgrades[key];
      const div = document.createElement('div');
      const canAfford = playerMoney >= up.cost;
      const reqMet = !up.requires || shopUpgrades[up.requires].bought;

      // ── REPEATABLE CONSUMABLE (Almond Water / Bandages) — never "owned"; shows
      //    the carried count and stays buyable until the inventory is full. ──
      if (up.consumable) {
        const held = player[up.inv] || 0;
        const full = held >= CONSUMABLE_MAX;
        let cls = 'shop-item consumable';
        if (full) cls += ' purchased';
        else if (!canAfford) cls += ' cant-afford';
        div.className = cls;
        div.innerHTML = `
          <div class="shop-item-name">${up.name}</div>
          <div class="shop-item-desc">${up.desc}</div>
          ${full ? `<div class="shop-item-owned">FULL ${held}/${CONSUMABLE_MAX}</div>`
                 : `<div class="shop-item-cost">$${up.cost} · ${held}/${CONSUMABLE_MAX}</div>`}
        `;
        if (!full) {
          div.addEventListener('click', () => {
            if (playerMoney >= up.cost && (player[up.inv] || 0) < CONSUMABLE_MAX) {
              playerMoney -= up.cost;
              player[up.inv] = Math.min(CONSUMABLE_MAX, (player[up.inv] || 0) + 1);
              div.classList.add('shop-flash');
              playPickup();
              updateShopUI();
              updateHUD();
            } else {
              div.classList.remove('shop-insufficient');
              void div.offsetWidth;
              div.classList.add('shop-insufficient');
            }
          });
        }
        col.appendChild(div);
        continue;
      }

      // Four explicit visual states: purchased / locked (prereq missing) /
      // can't afford / buyable — styled in css (.shop-item.*).
      let cls = 'shop-item';
      if (up.bought) cls += ' purchased';
      else if (!reqMet) cls += ' locked';
      else if (!canAfford) cls += ' cant-afford';
      div.className = cls;

      const footer = up.bought
        ? '<div class="shop-item-owned">✓ OWNED</div>'
        : !reqMet
          ? `<div class="shop-item-req">REQUIRES ${shopUpgrades[up.requires].name.toUpperCase()}</div>`
          : `<div class="shop-item-cost">$${up.cost}</div>`;

      div.innerHTML = `
        <div class="shop-item-name">${up.name}</div>
        <div class="shop-item-desc">${up.desc}</div>
        ${footer}
      `;

      if (!up.bought && reqMet) {
        div.addEventListener('click', () => {
          if (playerMoney >= up.cost) {
            playerMoney -= up.cost;
            up.bought = true;
            up.apply();

            // Heal/ammo fill up to the new max on upgrades (now multiplier-based).
            if (key.includes('health')) player.health = shopStats.maxHealth;
            if (key.includes('mag')) player.clipAmmo = wpnClip(curWeapon());
            if (key.includes('reserve')) player.reserveAmmo = wpnReserve(curWeapon());
            // Weapon unlock: stock it full and equip it for instant feedback.
            if (up.weapon != null) {
              player.weaponAmmo[up.weapon] = { clip: wpnClip(WEAPONS[up.weapon]), reserve: wpnReserve(WEAPONS[up.weapon]) };
              switchWeapon(up.weapon);
            }

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
      col.appendChild(div);
    }
    grid.appendChild(col);
  }
}

// Open/close go through the menu state machine (see openShop/closeShop) so
// ESC, the buttons, and every forced-close path agree on one source of truth.
document.getElementById('btnShop').addEventListener('click', () => openShop('pause'));
document.getElementById('btnShopClose').addEventListener('click', closeShop);

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
  // Anisotropic filtering budget for world textures (capped at 8) — read once,
  // applied at every texture's creation via texMarkSRGB.
  MAX_ANISO = Math.min(8, renderer.capabilities.getMaxAnisotropy() || 1);
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
      updateScareTriggers(dt); // host/solo only: fire scares (broadcasts to clients)
    }
    updateMinimap(dt);
    updateScareEffects(dt);    // all machines: animate active lights-out/watcher/roar/slam
    updateLights(dt);
    updateHUDTimers(dt);
    updateAmbient(dt);
    updateWaterFX(dt); // pools floors: water UV drift + caustics pulse (no-op elsewhere)
    updateBulletTrails(dt);
    updateImpactSparks(dt); // pooled spark particles fly out + fade (no lights)
    updateScanDots(dt);     // Lights Out: fade scanner dots (per-instance scale; no lights)
    updateFlares(dt);       // flare light/bead countdown (no-op when idle)
    updateAmmoPickups(dt);
    updateArtifacts(dt); // lore objective: bob/spin + walk-over collect (no-op off item floors)
    updateConsumables(dt); // almond water / bandage pickups
    updateSanity(dt);      // passive recovery, heal-over-time pools, low-sanity vignette/whisper
    updateBalloons(dt); // Level Fun: balloon bob/sway (no-op elsewhere — empty list)
    // Hotel Chase: swell the faint elevator music as the exit nears (no-op off the
    // chase floor — updateChaseAudio bails when its ambience isn't running).
    if (exitZone && getTheme(currentFloor).archetype === 'chase') {
      const cdx = player.pos.x - exitZone.x, cdz = player.pos.z - exitZone.z;
      updateChaseAudio(Math.sqrt(cdx * cdx + cdz * cdz));
    }
    updateHUD();
  }

  // MP: position send (15Hz) + remote avatar smoothing. Immediate no-op solo.
  netUpdate(dt);

  renderer.render(scene, camera);
  updateRendererStats(rawDt);
}

init();

