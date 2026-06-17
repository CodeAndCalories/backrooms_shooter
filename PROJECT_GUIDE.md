# PROJECT_GUIDE.md — Backrooms Shooter

**Durable "how & why" handoff for future AI sessions (any model).** This is the
companion to `BACKROOMS_STATE.md`:

- **`BACKROOMS_STATE.md`** = the *living* doc. What's done/unplayed/next *right now*.
  Updated every session. Read it FIRST, every time.
- **`PROJECT_GUIDE.md`** (this file) = the *durable* doc. How the project is run,
  where everything lives, and — critically — **why the constraints exist**. Changes
  rarely. Read it once to onboard, then trust `BACKROOMS_STATE.md` for current state.

---

## 0. WHAT THE GAME IS (one paragraph)

A liminal-horror first-person shooter set in the Backrooms. **Three.js r128 (CDN),
raw WebGL, no build step** — plain `.js` files loaded as classic scripts (NOT ES
modules) that all share one global scope. P2P **co-op via PeerJS 1.5.4**, WebRTC data
channels, **host-authoritative**. 20 themed floors, a boss every 5th (the 20th is a
capstone final boss → victory screen). Procedural
everything (canvas textures + Web Audio); the only file assets are 4 boss GLB mob
models + 3 boss sprite PNGs. Deployed on Vercel from `origin/main`. Repo:
`github.com/CodeAndCalories/backrooms_shooter`.

**Load order (index.html, matters — globals):** `audio.js` → `net.js` → `enemies.js`
→ `main.js`. Function declarations hoist, so cross-file calls resolve at runtime even
when the callee is defined in a later-loaded file. `init()` runs at the very bottom of
main.js. **BUT top-level *statements* must never READ a later file's globals** (e.g. a
top-level `const X = CELL * 3` in enemies.js — `CELL` lives in main.js): that throws at
load and silently kills every top-level initialization below it in that file. See §4
and `tools/test_loadorder.js`, which guards exactly this.

---

## 1. PROJECT PHILOSOPHY & WORKING METHOD

**One focused prompt at a time.** Each session tackles ONE batch (a feature or a fix
set), carrying the HARD CONSTRAINTS block. The user (a non-engineer playtester) gives
**casual playtest notes** ("the music is annoying, too ping-ping"; "I don't see the
kill counter"). The model's job is to **turn those into precise, scoped prompts/work**:
diagnose first, confirm the real cause, then implement narrowly.

**Verify before stacking.** Never pile feature B on top of unverified feature A. The
order every batch follows:

1. Read `BACKROOMS_STATE.md` (+ relevant code).
2. Implement the one batch.
3. `node --check` every touched `.js`.
4. Run/extend the **headless test suites** for anything verifiable.
5. Update `BACKROOMS_STATE.md` (CURRENT STATE + queues; mark validated vs **UNPLAYED**).
6. Commit the batch (one commit per batch).
7. Hand the user a **playtest gate**: exactly what to look at, on which floors, to
   confirm *feel* (the part tests can't cover).

**Ask, don't assume, on design forks.** When a prompt says "your call, ask me" or a
decision changes what gets built (e.g. safe-zone scope, instant-vs-inventory), use the
question tool BEFORE finalizing. Show tuning numbers for sign-off before shipping feel-
sensitive values.

**Headless tests are the spine.** Everything deterministic/logical gets a `tools/test_*.js`
that **extracts the REAL source** (regex slice of the actual function/table, eval'd in a
stub sandbox) rather than copying logic — so tests can't drift from the code. Current
suite (all must stay green):

| tool | covers |
|---|---|
| `tools/sim_levels.js` | Level generation across all 17 floors × 300+ seeds: full connectivity, exit reachability, exit-cell variety, `pickExitCell` band/rear-row rules. ~4200 seeds. |
| `tools/test_lobby.js` | Co-op lobby state: roster, ready flags, host/client start gating (19 checks). |
| `tools/test_boss_scaling.js` | `bossHpFor` (solo-unchanged + per-player scale table), `netActivePlayerCount`, phase thresholds, snapshot ships maxHp. |
| `tools/test_balloons.js` | Level Fun balloon-trap pickups: seeded id determinism + validity. |
| `tools/test_esc_shop.js` | ESC/menu state machine: 8 transitions + the never-both-overlays invariant (extracts the real handlers + ESC dispatch block). |
| `tools/test_weapons.js` | WEAPONS table (pistol byte-identical to old), stat helpers under shop mults, shotgun falloff, pellet-ray cone math, `raycastWall` DDA, `switchWeapon` ammo bank + owned-gate, 32-light invariant. |
| `tools/test_scares.js` | Scare trigger placement determinism + 0 world-rng draws, ≤2/floor + ≥30s + spawn-clearance constraints, boss→0, theme-flavor modality, intensity-only-lights invariant. |
| `tools/test_artifacts.js` | Item-gate theme config, artifact placement determinism + 0 world draws, `netExitGateOpen` across all gate types (incl. solo kill-gate), collect idempotency. |
| `tools/test_ai.js` | `isOpenCell`, `steerAround` (clear pass-through vs rounds-a-wall), roam/hunt threshold constants, danger-always-hunts. |
| `tools/test_sanity.js` | Consumable placement determinism + 0 world draws + constraints, sanity drain math + Poolrooms safe-zone guard, tuning constants, no-new-lights. |
| `tools/test_loadorder.js` | Executes the REAL top-level code of audio/net/enemies in index.html load order (browser stubs, deliberately NO main.js globals): no load-time throw, no TDZ casualties, plus a static no-top-level-main.js-global-reads scan. Catches the bug class the extraction sandboxes mask. |
| `tools/test_minimap.js` | Heading-up minimap: reproduces the `translate(center)→rotate(yaw)→translate(-playerCanvas)` transform and proves forward→up / strafe→right / back→down / left→left + perpendicularity at every facing, the player-at-center invariant, and the single-save/restore wiring (all elements rotate together). |
| `tools/test_overlays.js` | Menu-overlay visibility: the real `showMenuOverlay` shows exactly ONE of start/pause/gameover/victory at a time (or none in gameplay) + always force-closes the shop; CSS hides pause/gameover/victory by default (victory opaque); every state transition routes through the helper; dev/player level-selects are mutually exclusive. Guards the stacked-overlay class of bug. |
| `tools/test_finale.js` | Floor 20 "The Last Door" capstone: theme config (toughest boss, `isFinale`, reused `boss_amalgam` sprite, bigger arena), the real `bossHpFor` on floor 19 (solo unchanged + per-player + loop scaling), boss-death→`winRun` branch, the victory screen + `gameState='won'` + buttons, the `run_won` co-op broadcast, and level-select auto-pickup of floors 19+20. |
| `tools/test_scanner.js` | Lights Out (floor 18): the constraint-critical "dots add NO point lights" check (no PointLight/SpotLight in the dot source) + InstancedMesh/no-map/emissive material + per-instance-scale fade; drives the REAL `doScanPulse` over a grid (wall+floor dots, LOS-gated monster reveal, slot-color routing, determinism); theme/darkness/flashlight/input/co-op-relay wiring. |
| `tools/test_devcheats.js` | `?dev=1` playtest cheats: god toggle + `damagePlayer` no-op, infinite-ammo clip top-up, repeatable give-cash, kill-all (spares the unkillable chaser, host/solo only), the `DEV_MODE` gating, and the `#hudCheats` + named level-select wiring. |
| `tools/test_audio.js` | Audio pass: mob-vocal concurrency cap (4 idle + 2 event reserve, frees on voice end) via the real `vocalSlot`; every `playMobVocal` type×kind synth branch runs without throwing + routes through `sfxGain` (real `_vNoise`/`_vTone` over a fake Web Audio graph); per-theme ambient beds exist + are rebuilt per floor; the vocal trigger + `mob_vocal` broadcast/handler wiring; balloon-pop + growl improvements. |
| `tools/test_music.js` | Real-music-file loader: extracts `startFileMusic`/`stopFileMusic` and drives every branch over a fake Audio/Web-Audio graph — present file wired+played+looped through `ambientGain`; missing/error/stall → procedural `onFail`; `.ogg→.mp3` candidate fallthrough; floor-change aborts a stale load; `stopFileMusic` tears down. Plus `updateFloorMusic` wiring + `assets/audio/` exists. |
| `tools/test_avatar.js` | Co-op humanoid soldier avatars: static `netAvatarBuild` invariants (NO new lights, ONE shared colored no-map Standard suit material + one dark gear material, TWO articulated legs + TWO arms via hip/knee + shoulder/elbow pivot groups, helmet/visor/backpack, the `group.userData.rig` walk stash, slot color + name label kept, the smoothing-loop wiring) + the extracted `netTickAvatarWalk` over a fake rig (moving → swing amp ramps + limbs swing, legs anti-phase, arm⟂own-side-leg contralateral, knee bend ≥ 0, idle → eases to neutral still pose, downed → never swings, determinism). |
| `tools/test_spawn.js` | Co-op spawn fan-out: extracts the real `SPAWN_FANOUT_OFFSETS`/`spawnOpenCells`/`playerSpawnCellFor` and proves slot 0 → canonical (1,1) (solo unaffected), every slot's cell is open floor (value 1, never wall/pool/furniture) across 400 hazard grids × 5 slots, distinct cells while candidates last + graceful clamp-to-last when the spawn corner is tight, determinism, near-first offset ordering, and the `buildMazeScene` wiring (local `netMySlot()` → cell-centered spawn). |
| `tools/test_chase.js` | Hotel Chase (floor 17, 'chase' archetype): `generateChase` spawn→exit path always exists + every deck cell reachable (furniture never seals it) + furniture present + no pools + determinism (600 seeds); `chaserNextWaypoint` BFS reaches the player from spawn over 200 seeds (never stuck) with valid single-step waypoints; theme/gate/noStamina/chaser-type/wire-index/unkillable-hit/stamina-override/`netExitGateOpen('reach')` invariants. Prints ASCII maps. |

Non-test tooling: `optimize_models.js` (GLB Draco/quantize — how the boss mob models
were shrunk), `quantize_pngs.js` (boss sprite PNG palette reduction), `inspect_glb.js`,
`key_boss_sprites.js`. Run tests with `node tools/<name>.js` (exit 0 = pass). There is no
package manager step; tests are dependency-free Node.

**Test pattern to copy** (when adding a system): write a `test_<system>.js` that
`extract()`s the real function via brace-balanced source slicing, builds a `new Function`
sandbox with minimal stubs (a fake `THREE.Vector3`, a `scene` with no-op add/remove, a
`rng` *spy* that counts calls), and asserts: determinism (same seed → identical output),
**zero world-rng draws** (the spy stays at 0), constraints, and a light/program invariant
(grep the source block for `new THREE.PointLight`). See `test_artifacts.js` /
`test_sanity.js` as templates.

---

## 2. ARCHITECTURE MAP (file-by-file)

### `index.html` (~225 lines)
DOM skeleton + script tags. Holds: menus (start/pause/game-over/co-op lobby), the `#hud`
(bars: health/stamina/**sanity**, ammo block, **consumable inventory**, crosshair,
hitmarker, damage arrows, minimap canvas, party-goal HUD `#goalHud`, boss HP bar), and
full-screen overlays (`#muzzleOverlay`, `#damageVignette`, `#sanityVignette`). CDN
scripts: three r128 (cdnjs), GLTFLoader + SkeletonUtils (jsDelivr, version-matched
0.128.0), PeerJS 1.5.4 (cdnjs). Then the 4 game scripts in load order.

### `css/style.css` (~218 lines)
All HUD/menu styling. Notable: the bars (`#healthFill`/`#staminaFill`/`#sanityFill`),
`.goal-hud` (big centered objective readout), `.shop-*` (Black Market grid),
`.sanity-vignette`/`.damage-vignette` (full-screen cosmetic overlays, opacity-driven from
JS). No CSS framework.

### `js/audio.js` (~1000 lines)
**Procedural Web Audio engine.** `initAudio()` builds the bus graph: `masterGain` →
`sfxGain` + `ambientGain` (the latter is the Ambient volume slider; music routes through
it). Every sound is synthesized at call time (oscillators, noise buffers, biquads,
delays, stereo panners) — no audio files. Key groups: weapon shots (pistol selectable
sharp/heavy/suppressed + shotgun/smg/flare + remote-attenuated variants), hit/reload/
pickup/death, boss roar, scare one-shots (`playRumble`/`playDistantRoar`/`playWhisper`/
`playSlam`(panned)), sanity (`playSanityWhisper`/`playDrink`/`playBandage`), ambient
hum/pools, the **Level Fun music** (`startLevelFunMusic`/`stopLevelFunMusic`, floor 5
only, drone + sparse warped music-box + distant party stabs), the **per-theme ambient
beds** (`startAmbient`/`stopAmbient` — rebuilt EVERY floor entry; Lobby buzz / Pools water
/ Freezer HVAC / Hospital beeps / Electrical transformer / Pipe clanks / generic room-tone,
all subtle through `ambientGain`), and the **mob vocalizations** (`playMobVocal(type, kind,
gain, pan)` + the `vocalSlot` voice cap; idle/aggro/attack/roar synths per mob type — the
chaser roar is the Hotel Chase signature). `updateFloorMusic()` starts/stops music on floor
entry; the ambient bed is driven from `buildMazeScene → startAmbient`. Mob vocals are
triggered by the AI via main.js `mobVocalLocal`/`hostMobVocal` (distance/pan from the
camera). **Real music files** (`startFileMusic`/`stopFileMusic`):
floors with `theme.musicFile` stream an `assets/audio/*.ogg|.mp3` through `ambientGain`
(looped), with a graceful fallback to the procedural track if the file is absent — see
§3.4. `updateFloorMusic` picks file-vs-procedural per floor (`proceduralMusicStarterFor`);
`theme.musicLayer:true` plays the file OVER the procedural bed instead of replacing it
(Hotel Chase = music + alarm). `theme.musicCredit` → a small "♪ MUSIC: …" line (main.js
`showMusicCredit`, driven by `startFileMusic`'s `onStart` so it only shows on real playback).

### `js/enemies.js` (~1250 lines)
**Mobs + bosses + waves (host-authoritative sim).** `spriteTextures` (procedural mob art
+ boss PNG swap-in via `loadBossSprites`). `MOB_TYPES` (base stats). `buildMobModel` is
the swappable visual seam (GLB clones via SkeletonUtils, or the cheap wire-figure
fallback). `spawnEnemy` (seeds the enemy object incl. **roam/hunt behavior**),
`updateEnemies` (the AI loop: target nearest player, **roam vs hunt state**, `steerAround`
wall avoidance, attack, death fade, pools wading; the **chaser** gets its own BFS-waypoint
branch). **THE CHASER (Hotel Chase): `spawnChaser`/`spawnFloorChasers` + `chaserNextWaypoint`**
(grid-BFS pursuit, robust around sharp turns; fixed speed = 0.95× sprint derived at runtime;
`unkillable` flag → `applyEnemyHit` flinches but never kills/stuns it). Its visual is a fully
PROCEDURAL writhing limb-mass (`buildChaserMonster` + `animateChaserMesh`), no model file. `bossHpFor` (PURE, co-op HP scaling),
`spawnBoss`/`updateBoss`/`updateBossProjectiles`, `createBossExit`. Wave system
(`spawnWave`, `waveSizeFor`) + anti-linger (`updateAntiLinger`, `spawnDangerMob`).
Clients never run any of this — they render mirrors from snapshots.

### `js/net.js` (~1600 lines)
**Co-op: PeerJS signaling, the message bus, host authority, mirroring.** `onMessage(type,
fn)` registers handlers; `sendToAll`/`sendToHost`/`sendTo` send. `netState` (role
solo/host/client, peers). Lobby (host/join/roster/ready/start), the 15Hz `pos` stream +
remote-avatar smoothing, the host **enemy snapshot** broadcast + client mirror rebuild,
combat resolution relays, the down/revive system, and all pickup/objective/event syncs.
**Remote avatars** (`netAvatarBuild`) are procedural-primitive HUMANOID soldier figures
(head/helmet/visor, vest, backpack, TWO articulated arms + TWO legs as hip/knee +
shoulder/elbow pivot groups), one shared per-slot-colored no-map Standard material
(ammoPickupMat-pinned family; the down-tint retargets it) + one dark gear material, NO
lights. `netTickAvatarWalk` (driven from the smoothing loop's per-frame displacement)
does the cosmetic sin-driven WALK swing, gated on movement (idle/down = still) — no
protocol change (purely visual, off the existing `pos` stream).
`netExitGateOpen()`, `netActivePlayerCount()`, `netAllPlayers()`/`netNearestOf()` (used by
host AI targeting). **All protocol message types listed in §2.1.**

### `js/main.js` (~5350 lines — the hub)
Everything else. Roughly in source order: constants (incl. all tuning knobs), `LEVEL_THEMES`
(17-theme table), `player` state, shop (`shopUpgrades` + `shopStats` + `SHOP_TRACKS`),
`WEAPONS` table + weapon helpers, seeded RNG (`mulberry32`/`seedFloor`/`rng`), procedural
texture creators + `themeTextureCache` + `texMarkSRGB`, level generators (per archetype),
`pickExitCell` + `buildExitDoor`, gun viewmodels + `createGun`/`updateGun`, flashlight +
`createProgramKeepalive`, ammo pickups, balloons, **artifacts**, **consumables**, the
**impact-FX pools** (sparks/decals/flare), the **scanner-dot system** (Lights Out floor 18
— `doScanPulse`/`spawnScanDot`/`updateScanDots`: emissive-only InstancedMesh dots, ZERO
lights, per-instance-scale fade, reuses the instanced-Standard-no-map family; plus
`fireScannerLocal`, the LMB-scan/RMB-shoot routing, and the darkness override in
buildMazeScene), `buildMazeScene` (the per-floor teardown +
rebuild — read its teardown comment carefully before adding any scene object), shooting
(`playerShoot`/`resolveCombatPellet`/`raycastWall`), `damagePlayer` + **sanity** +
`updateSanity`, **scare events**, minimap (fog-of-war), HUD, the menu/ESC state machine,
the shop UI, input handlers, and the `animate()` loop + `init()`.

### 2.1 FULL CO-OP PROTOCOL (every message type)

Host-authoritative. A "protocol change" = adding/altering any of these → **BOTH players
must run the new build** (old builds log unhandled messages and silently miss the
feature). Message = `{ t: type, d: data }`.

**Connection / lobby:** `hi` (handshake + name), `roster` (host → all: lobby list),
`ready` (client → host: ready toggle), `room_full` (host → joiner: reject), `player_left`,
`ping`/`pong` (latency).

**Run flow:** `game_start` (host → all: floor + seed; drives the deterministic client
build via the same `generateCurrentFloor` path).

**Position / sim:** `pos` (15Hz position/orientation stream, both directions), `enemies`
(host → all: enemy snapshot — id, type, x/z, hp, maxHp; clients rebuild mirrors + the
kill-gate count `k`). The **chaser** rides this same snapshot (its wire type `'chaser'` is
APPENDED to `NET_TYPE_LIST` — existing indices unchanged; it never dies so it never leaves
the snapshot). The **'reach' gate** (chase floors) is decided in `netExitGateOpen` (always
open), no message of its own. Both are protocol additions → both players on the new build.

**Combat:** `shoot` (client → host: ray origin/dir + weapon id `w` + pellet rays `p` +
damage mult `m`; host resolves authoritatively), `shot_fx` (cosmetic relay so teammates
see trails/flash/sound + flare light; carries `w`/`p`), `damaged` (host → target client:
apply damage), `reward` (host → killer: money + kill credit).

**Down / revive (co-op only):** `down`, `down_state`, `reviving`, `revive_prog`,
`revived`, `party_over` (all-down wipe).

**World pickups / objectives / objects:** `pickup_spawn` (host kill-drop → all: ammo),
`pickup_taken` (whoever grabbed → remove everywhere), `consumable_spawn` /
`consumable_taken` (almond/bandage — same pattern, `kind` on spawn), `artifact_taken`
(item-gate objective, idempotent count on every machine), `balloon_pop` (Level Fun trap),
`boss_exit` (host → all: post-boss exit door), `exit_reached` (client → host: requests
floor advance; host re-validates `netExitGateOpen` then advances all).

**Events:** `scare` (host → all: `{type, data}` — shared scripted scares; data carries
only what each client needs to reproduce it from its own viewpoint). `scan` (client → host)
+ `scan_fx` (host → clients): Lights Out scanner pulse sharing — origin + firer color slot
so teammates' dots paint in their colors; COSMETIC (monster reveal is per-machine, no host
authority). `run_won` (host → all): the 20th-floor finale boss died → the whole party gets
the victory screen (host-authoritative; `showVictory`). `mob_vocal` (host →
all: `{t:type, k:kind, x, z}` — state-driven mob vocalizations [aggro/attack/chaser-roar]
so co-op players share them; each receiver re-spatializes from its own camera. Idle mob
ambience is NOT broadcast — every machine voices its own nearby mobs. Cosmetic, no
gameplay state).

**The pickup contract** (ammo/consumable/artifact/balloon all follow it): items get
**seeded sequential ids** in deterministic creation order, so the same id names the same
object on every machine. Collection grants locally to whoever walked over it; the
*removal* is broadcast by id; the host relays to the other clients. Gate-relevant counts
(kills, artifacts) are host-re-validated before the floor advances.

---

## 3. WHY THE CONSTRAINTS EXIST (reasoning, not just rules)

These are in `BACKROOMS_STATE.md`'s HARD CONSTRAINTS block. **Understand the why or you
will reintroduce a solved bug.**

### 3.1 "Seeded RNG only for world/spawn" → co-op world sync
Co-op is host-authoritative for *simulation*, but **world generation runs independently
on every machine** from a shared seed (`game_start` ships floor + seed; each client calls
the same `generateCurrentFloor`). If generation/placement used `Math.random()`, clients
would build different mazes, exits, and pickups → instant desync. So anything touching the
world uses `rng()` (the seeded `mulberry32` world stream), and **draw order must be
identical on every machine** — adding an `rng()` call shifts every later draw.

**The dedicated-PRNG pattern (important):** new placement systems must NOT consume world
`rng()` draws, or they'd shift ammo/exit placement and break determinism vs older code.
So balloons, scares, artifacts, and consumables each derive a **private PRNG from
`floorSeed`** (`mulberry32((floorSeed ^ 0xUNIQUE) >>> 0)`) — deterministic per floor,
**zero world draws**. Every test asserts this with an `rng` spy that must stay at 0. Use
this pattern for any new seeded placement.

Combat outcomes (damage variance, kill-drops, AI wander, spread) intentionally use
`Math.random()` — they're host-authoritative and mirrored to clients via snapshots, so
they don't need determinism.

### 3.2 The fixed light budget (32 point + 1 spot + 1 ambient) + intensity-only changes
Two reasons, both about the **forward renderer**:
- **Per-fragment cost:** every point light is evaluated per fragment scene-wide. Lights
  are not free; an unbounded count tanks fill-rate.
- **Shader program cache stability (the big one):** three.js r128 **bakes the scene's
  point-light COUNT into every material's shader program cache key.** Change the number of
  point lights and *every* material recompiles — a visible hitch (the "PROG" climb on the
  dev HUD). So the light count is **fixed at exactly 32 point lights on every floor** and
  **never changes at runtime**. Breakdown: `CEILING_LIGHT_BUDGET` 25 (real ones lit, the
  rest parked dark below the floor as pads) + boss glow 1 + boss projectiles 3 + exit-door
  1 + muzzle flash 1 + flare 1 = 32. Plus the 1 flashlight SpotLight + 1 AmbientLight.
  Combat/exit/flare/scare effects only ever change light **intensity/color/position**,
  never the count. (The flare slot was freed by dropping the ceiling budget 26→25 — see
  the weapon batch.) **Never add a light. Restructure within 32 and say so.**

### 3.3 The program keepalive → r128 destroys programs when their last material disposes
`buildMazeScene` disposes every floor-owned material on teardown. r128 frees a shader
program the moment its `usedTimes` hits 0 — so even with a fixed light count, the heavy
textured-Standard programs would die and recompile *every floor*. `createProgramKeepalive`
parks 5 sub-pixel meshes on the camera (never disposed) that each pin one program family
alive for the session: (1) Standard+map, (2) Standard+map+DoubleSide, (3) Sprite+map, (4)
Sprite+map+alphaTest, (5) Basic+map+DoubleSide (pool caustics). **Standard WITHOUT a map is
pinned by the never-disposed `ammoPickupMat`** — which is why all the emissive no-map
pickups/sparks/decals/flare/consumables/exit-door reuse that family for free. **If you
introduce a genuinely new material/shader family, pin it in the keepalive** or it
recompiles every floor.

### 3.4 Procedural-FIRST assets → a near-zero-asset pipeline
Textures are canvas-drawn at runtime; audio is synthesized. This keeps the repo nearly
asset-free and instantly deployable. The **deliberate exceptions** (kept few):
- **4 boss mob GLB models + 3 boss sprite PNGs** (procedural bosses looked weak). Optimized
  offline via `tools/optimize_models.js` (Draco/quantization) + `tools/quantize_pngs.js`,
  and the GLB load is **gated behind the loading screen** (see §3.7 war story) — they MUST
  be ready before gameplay, so they block startup.
- **Real music files in `assets/audio/` (.ogg/.mp3)** — added June 16. A floor opts in with
  `theme.musicFile` (a path or an ordered candidate array); `startFileMusic` (audio.js)
  streams it via an HTMLAudioElement wired through **`ambientGain`** (so the volume sliders
  apply), looped, with a **graceful fallback to that floor's procedural track** if every
  candidate is missing/errors/stalls — it never crashes or goes silent. CONTRAST with the
  GLBs: music is **streamed LAZILY on floor entry**, so it does NOT gate the loading screen,
  and only the floors that set `musicFile` pay for it (and only on arrival). Keep tracks
  ≤ ~3 MB (see `assets/audio/README.md`). Files are committed + served by Vercel like
  `models/`. No co-op protocol impact (music is per-machine ambience).

Don't add casual file assets beyond these categories.

### 3.5 No head-bob / no screen shake → accessibility
A hard accessibility line. Recoil is **gun-model-only** (the camera never moves). Impact
feedback is sound + light + vignette, never camera shake. The SLAM scare is a sound + a
light pulse; low sanity is a vignette + whispers. **Never shake the camera.**

### 3.6 Host-authoritative → anti-desync
The host owns all enemy/boss/wave/trigger simulation and re-validates gates. Clients send
intent (`shoot`, `exit_reached`) and render mirrors. This prevents two machines from
disagreeing about game state. Per-player things (sanity, inventory, personal kills,
look-away scares) are computed locally per machine — that's fine because they don't affect
shared world state.

### 3.7 War stories (brief — these were real bugs)
- **First-visit model-latency cascade:** the boss GLBs load async; early builds spawned
  fallback mobs and hitched while models streamed in on first visit. Fix: a loading screen
  gates `startGame` until every mob GLB has *settled* (`modelsReady`).
- **The sRGB pin-texture catch:** the renderer outputs sRGB, so canvas textures must be
  tagged `sRGBEncoding` at creation (`texMarkSRGB`). The program-keepalive's pin texture
  had to carry the **same** sRGB tag — a linear pin would pin the *wrong* program variants
  and the whole world would recompile every floor. Texture encoding is part of the program
  cache key.
- **The DoubleSide program-cache-key dodge:** `material.side` (DoubleSide) IS a shader
  `#define` (`DOUBLE_SIDED`), so it's a *different* program from FrontSide. The exit-door
  glow panel was deliberately kept **FrontSide, no-map** so it reuses the
  ammoPickupMat-pinned family instead of spawning a new (unpinned) no-map+DoubleSide
  program that would recompile every floor.
- **Anisotropy/repeat/UV are NOT program keys:** the visual batch set `tex.anisotropy`,
  changed `tex.repeat`, and rewrote floor mesh UVs for per-cell tiling — none of these
  recompile shaders (they're sampler state / uniforms / geometry). Only light-count,
  defines (map/DoubleSide/emissiveMap/etc.), and encoding move the cache key.

---

## 4. LESSONS LEARNED / FAILURE MODES

- **Context-limit loss → commit-per-batch.** Long sessions can lose context mid-work.
  Commit each verified batch so progress is durable and `BACKROOMS_STATE.md` always
  reflects committed reality.
- **Stale-browser-cache false bugs → hard-refresh first.** A "the fix isn't working" report
  is often a cached `main.js` or an un-redeployed Vercel build, not a code bug. **Diagnose
  the code first** (confirm the logic is actually correct in the committed tree + prove it
  with the test suite), then tell the user to hard-refresh / confirm the live deploy is on
  the right commit. Real example: the "solo kill-gate counter not showing" report — the
  code was correct and committed; the cause was build freshness.
- **Browser-specific weirdness is a browser issue, not code.** (Opera GX surfaced an
  oddity once.) Reproduce in a standard Chromium build before touching code.
- **"The diffs look right" ≠ "the game works."** Headless tests prove logic/determinism/
  budget; they CANNOT prove *feel*, audio mix, visual read, pointer-lock cooldown, or co-op
  sync timing. Every batch ends with an explicit **playtest gate** listing what to look at
  and where. Mark everything **UNPLAYED** in the state doc until the user confirms.
- **Protocol changes need both players on the new build.** Any new/changed message silently
  no-ops on an old build. Always call this out in the state doc.
- **Top-level cross-file reads are a load-order landmine (the June-12 host freeze).**
  enemies.js gained a top-level `const HUNT_NEAR = CELL * 3.0`; `CELL` is defined in
  main.js, which loads LAST → ReferenceError at load → every const below it in the file
  stuck in the TDZ → `updateEnemies` threw every frame on the sim-owning machine (host
  AND solo) and froze it before `renderer.render`, while clients (mirror-only) ran fine.
  Three lessons: (1) pre-main files keep tuning constants self-contained (CELL-unit
  literals, convert inside functions); (2) extraction tests can't see this — they stub
  the missing global in their sandbox; `tools/test_loadorder.js` runs the real top-level
  code without main.js globals and must stay green; (3) a "only mode X breaks" report
  maps to WHO RUNS THE CODE, not where the code lives — host+solo share the sim path, so
  "solo is fine" + "host frozen" on the same build usually means the solo check happened
  on a stale cached/older build. `tools/diag/repro_coop.js` (puppeteer-core, 3 headless
  Chromes: solo/host/client over the real PeerJS broker, per-frame profiling + exception
  capture) is the live-repro harness — reuse it for any future co-op-only regression.
- **`buildMazeScene` teardown is a trap for new scene objects.** It disposes every scene
  child's geometry+materials, EXCEPT textures tagged `userData.themeCached`. Any pooled/
  shared object you add (sparks, decals, watchers, pickups, consumables, the flare/exit
  meshes) MUST be `scene.remove`d in the teardown *before* the dispose traverse, or its
  shared geo/mat gets disposed and corrupts the pool. Follow the ammoPickup pattern.

---

## 5. TUNING KNOBS REGISTRY

Feel-knobs flagged across sessions. All are named constants/values — change in place,
re-run the relevant test, playtest.

| Knob | Location | Effect |
|---|---|---|
| `killTarget` formula | main.js `buildMazeScene`: `waveSizeFor(f,1)+waveSizeFor(f,2)` | Kills needed to open a normal-floor exit (solo + co-op). `waveSizeFor` (min 2) sets per-wave size from theme `mobs.waveBase/waveCap/countMult`. |
| Boss HP per-player scale | enemies.js `bossHpFor` → `1 + 0.75*(players-1)` | Co-op boss HP (+75%/extra player); `0.75` is the knob. Solo unchanged. |
| Floor-clear top-ups | main.js `floorReserveTopUp` (+~3 mags), `advanceFloor` (+35 HP) | Between-floor resupply. |
| Sanity drain | main.js `SANITY_DRAIN_PER_DMG` 0.60, `SANITY_DRAIN_CAP` 16 | Sanity lost per damage point, capped per hit. |
| Sanity recovery | `SANITY_RECOVER_RATE` 0.9/s, `SANITY_RECOVER_DELAY` 10s | Passive regen once un-hit. |
| Sanity thresholds | `SANITY_LOW` 55, `SANITY_CRITICAL` 30 | Vignette/whisper onset + intensify. |
| Sanity safe zone | `SANITY_SAFE_THEME` 3 (Poolrooms) | Theme id where sanity never drains. |
| Consumables | `ALMOND_RESTORE` 30 / `ALMOND_PRICE` 140, `BANDAGE_RESTORE` 40 / `BANDAGE_PRICE` 150, `CONSUMABLE_MAX` 3, `CONSUMABLE_DROP_CHANCE` 0.06, heal rates `SANITY_HEAL_RATE` 6 / `HEALTH_HEAL_RATE` 8 | Restore amounts, prices, carry cap, kill-drop %, over-time drip rates. |
| Ammo | main.js `CLIP_SIZE`/`RESERVE_MAX`/`AMMO_DROP_CHANCE` 0.2; per-weapon stats in `WEAPONS` | Pistol baseline + each gun's damage/fireRate/clip/pellets/spread/falloff. |
| Scare frequency | main.js `placeScareTriggers` (1-2/floor), `SCARE_SAFE_TIME` 30, `rollScareType` weights | How often/early scares fire + per-theme flavor. |
| AI behavior | enemies.js `ROAM` roll (~0.42 in `spawnEnemy`), `HUNT_NEAR` 3cells, `HUNT_VISION` 8cells, `HUNT_MEMORY` 5s, `ROAM_SPEED_MULT` 0.5 | Roam-vs-hunt mix + detection ranges. |
| Hotel Chase (chaser) | enemies.js `CHASER_SPRINT_FRAC` 0.95 (**the key knob** — chaser speed vs player sprint; 0.95 = knife-edge), `CHASER_GRACE` 3s (head start), `CHASER_REPATH` 0.3s (BFS interval), `MOB_TYPES.chaser.damage` 34 / `.scale` 1.5; main.js `generateChase` `P_FURNITURE` 0.55 (obstacle density), `LANE_H` 2 / `NL` 7-9 / `LANE_LEN` (corridor shape — narrower/more turns); theme 17 `chaserCount`/`mobs` (obstacle-mob sparsity) | Chase pace, head start, obstacle density, corridor tightness. The chaser visual is procedural (`buildChaserMonster`). |
| Mob ecology | `LEVEL_THEMES[].mobs` (types/weights/danger/speedMult/hpMult/countMult/waveBase/waveCap) | Per-floor roster, difficulty, pacing. |
| Anti-linger | main.js `LINGER_SAFE_TIME` 45, `LINGER_SPAWN_BASE/MIN` | When/how fast danger mobs pressure a lingering player. |
| Level Fun music | audio.js `startLevelFunMusic`: note gap 3.5-10s, drone gain 0.16, stab interval 30-70s | Dread pacing (sparse music-box, leading drone, rare distant stabs). |
| Exposure / tone | main.js `init`: `toneMappingExposure` 0.85 | Global brightness (nudge if sRGB palettes read too hot). |

---

## 6. CURRENT QUALITY BAR ("done" means all of these)

A batch is **DONE** only when:

1. `node --check` passes on every touched `.js`.
2. The relevant `tools/test_*.js` suite is **green** — and if the batch added a
   deterministic/seeded/logic system, a **new or extended test** proves: determinism
   (same seed → identical output), **zero world-rng draws** (spy stays 0), and the
   constraints.
3. **Light/program budget verified:** no new point/spot light (count stays 32); no new
   unpinned shader family; no mid-game texture mutation that moves the program cache key.
4. **Co-op safety verified:** host-authoritative; per-player state computed locally; any
   protocol addition noted as "both players on new build."
5. `BACKROOMS_STATE.md` updated — CURRENT STATE entry, queues, and everything marked
   **UNPLAYED** with a concrete **playtest gate** (what to look at, which floors).
6. **Committed** (one commit per batch, conventional descriptive message).

Only THEN does it go to the user for the **playtest gate** — feel, audio mix, visual read,
co-op timing — which is the final, human-only acceptance step. Tests gate correctness; the
playtest gates *quality*. Nothing is "shipped" on tests alone.

---

*Keep this file current only when the HOW changes (new constraint, new subsystem class,
new failure mode). Day-to-day state lives in `BACKROOMS_STATE.md`.*
