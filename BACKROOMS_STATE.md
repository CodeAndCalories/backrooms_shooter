# BACKROOMS_STATE.md — Backrooms Shooter

**What this is:** Living state doc. Paste into any chat session (or tell it "read
BACKROOMS_STATE.md") to resume with full context. UPDATE THIS at the end of every
session: what changed, what's validated vs unplayed, what's next.

**Last updated:** June 17, 2026

---

## THE GAME
Three.js r128 (CDN) WebGL first-person shooter. P2P co-op, host-authoritative.
Repo: `github.com/CodeAndCalories/backrooms_shooter`, deployed on Vercel.
20 themed floors (Lobby → The Last Door), a boss every 5th (Warden/Amalgam/Hive/
Devourer) ending in a 20th-floor capstone with a victory screen, anti-linger
spawner, fog-of-war minimap, pool/water system with fake caustics.

## HARD CONSTRAINTS (go in EVERY Claude Code prompt)
- Seeded RNG only for anything world/spawn related (co-op sync)
- Fixed light budget: 32 point + 1 spot + 1 ambient per floor (budget pads fill to 26
  ceiling lights) — never exceed, never destabilize the shader program cache
- New material/shader families must be pinned in the program keepalive
- Procedural-FIRST assets (canvas textures + Web Audio). File assets are the
  DELIBERATE exceptions, kept few: boss GLB models + boss PNG sprites, and — as of
  June 16 — **real music files in `assets/audio/` (.ogg/.mp3)** for floors that opt
  in via `theme.musicFile` (streamed through `ambientGain`, looped, graceful
  fallback to the procedural track if absent). Don't add casual file assets beyond
  these.
- No head-bob / no screen shake (accessibility) — gun-only recoil
- Host-authoritative, co-op safe; protocol changes require BOTH players on new build

## CURRENT STATE
- **FLOOR 18 "HOTEL CHASE" REBUILT → ON-RAILS AUTO-RUN (June 17, UNPLAYED) — the
  serpentine-maze/BFS-pursuit version is GONE; replaced by a Temple-Run-style auto-run.
  Shipped in 4 commits (generator → movement+gate → wall → docs). PROTOCOL ADDITION
  (both players on new build): snapshot `cs` field + `chase_hold` message.**
  - **MOVEMENT — auto-run (`theme.autoRun`, updatePlayer branch):** forced FORWARD at
    `AUTORUN_SPEED` (= 1.7× sprint ≈ 15.4 u/s). **Steering = MOUSE-LOOK-STEERS-FORWARD:**
    velocity is along the camera's horizontal heading, so wherever you look you run
    (look left → curve left); pitch ignored (constant pace, look up/down freely). **A/D**
    add a lateral dodge nudge (`AUTORUN_STRAFE_FRAC` 0.55); **W/S do nothing**. No
    head-bob/shake (velocity only). **Guns disabled** (playerShoot bails, viewmodel
    hidden); flashlight still works. Rooted until the gate opens / while downed.
  - **LAYOUT — `generateCorridorChase`:** ONE readable serpentine of long narrow
    corridors (2-row lanes), sharp U-turns at alternating ends, **narrowing** (last 3
    lanes → 1 row). **Dodgeable obstacles** (value 3): one row per column, never adjacent
    columns → never seals the path, density rises with lane index. **Overshoot dead-ends**
    past every turn (miss the turn = run into a lethal stub). Emits `chasePath` (the rail)
    + a deterministic track-end exit. Flood-fill-safe, seeded, co-op-identical. ~15 lanes
    × ~15 cells ≈ a 20×46 grid (instanced walls = 1 draw call), clean run ~75-110s.
  - **THE CHASER = an advancing WALL (not a pathfinder):** a wall of writhing flesh
    fills the corridor and advances along the TRACK at `CHASE_WALL_SPEED` (= 0.92× auto-run
    ≈ 14.2 u/s), fixed. Each machine projects its OWN player onto the rail (`chaseProjectProgress`
    — lateral dodging barely changes progress; turning around / leaving the track stops
    it). **Caught = your track progress falls within `CHASE_CATCH_GAP` of the wall →**
    solo game over / co-op DOWN. So a dead-end, wrong turn, obstacle-hit or any slowdown
    lets the fixed-pace wall reach you, and you can't "hide behind" it (track-space, not
    world chase). 16-unit head start. Visual: a dark occluder slab + 3 procedural
    blob-masses (reuses `buildChaserMonster`/`animateChaserMesh`, widened across the hall,
    eyes facing you) — **ZERO lights**, pinned no-map Standard family. Relentless roar
    spatialized per-machine.
  - **START GATE:** players spawn behind a closed shutter; **HOLD-E** (host-authoritative,
    `CHASE_GATE_HOLD` 2s) — progress accumulates while ANY player holds (**a single player
    opens it**; decays on release). The MOMENT it opens: barrier drops, the run begins, the
    wall spawns, the alarm/music kick in (`playChaseGateOpen` + deferred `updateFloorMusic`).
    Gives everyone a moment to load in.
  - **CAUGHT = OUT for the level** (`theme.noRevive` disables the revive hold) — you
    spectate; the party only wipes if ALL are caught; reaching the exit advances everyone
    (downed carried + revived on the next floor). REACH gate (find the far exit = win).
  - **CO-OP:** host owns gate progress + the wall's track position, broadcast in the
    enemy snapshot's new **`cs` field** `{gp gate-progress, go gate-open, rs run-started,
    ws wall-arc}`; clients lerp `ws` + self-detect their own catch; clients stream a
    **`chase_hold`** signal (8Hz) while holding E. Each player auto-runs locally (movement
    is client-local as always) → positions sync via the existing pos stream.
  - **Light budget intact** (wall/gate add no lights; corridor uses the normal capped
    ceiling placement + exit-door slot → 32). No new shader family (all pinned no-map
    Standard + the blob's MeshBasic eyes, which are floor-18-local exactly like the old
    chaser → no per-floor PROG churn elsewhere). Old BFS chaser (`spawnChaser`/
    `chaserNextWaypoint`) retired/unused; the blob LOOK is reused by the wall.
  - **Knobs:** `AUTORUN_SPEED` (1.7×), `AUTORUN_STRAFE_FRAC` 0.55, `CHASE_WALL_SPEED`
    (0.92×, **the knife-edge knob**), `CHASE_WALL_GRACE_DIST` 16, `CHASE_CATCH_GAP` 2,
    `CHASE_GATE_HOLD` 2, `CHASE_RUNS` 15 / `CHASE_RUN_LEN` 15 / `CHASE_NARROW_RUNS` 3 /
    `CHASE_OBST_MAX` 0.5 (length/difficulty). All in main.js.
  - **Headless:** `test_chase.js` rewritten (connectivity/no-islands, track continuity
    spawn→exit, obstacle no-seal + non-adjacent, overshoot dead-ends, narrowing, theme
    wiring; ASCII maps) + new `test_autorun.js` (gate accumulation/open/decay solo/host/
    client + single-holder, movement+disabled-gun source invariants, wall arc-lookup +
    projection + fixed-pace advance + client lerp + caught solo/co-op + wall<auto-run +
    no-light). `sim_levels` 68/68 + 4800/4800 (exit-variety exempts the fixed track).
    Full suite green (22 tools); node --check clean.
  - **Needs a co-op + solo session — playtest gate (FEEL, the part tests can't cover):**
    - **The knife-edge** — is `CHASE_WALL_SPEED` 0.92× right (clean run barely stays ahead,
      any fumble = caught)? Tune toward 0.90 (kinder) / 0.94 (brutal); `CHASE_WALL_GRACE_DIST`.
    - **Steering feel** — does mouse-look-steers-forward read well at speed? Are the sharp
      U-turns navigable but tense? Is A/D dodge useful? Motion-sickness OK (no shake)?
    - **Readability** — can you SEE the path/turns ahead (lighting on the serpentine — the
      generic capped placement may leave dark stretches; corridor-aware lights are a
      follow-up if needed)? Do obstacles read as dodge-left/right in time?
    - **The wall** — does the writhing mass fill the hall + read as horrifying? Roar
      relentless? Dead-ends actually lethal (the wall reaches you)?
    - **The gate** — HOLD-E load-in moment land? Alarm/music kick-in on open?
    - **Co-op** — both run together on open; caught players go out (not wipe) + are carried
      to the next floor on a survivor's reach; wall position agrees across machines.
    - **Length** — clean run ~90-120s? (bump `CHASE_RUNS`/`CHASE_RUN_LEN` if short.)
- **CO-OP AVATARS → HUMANOID SOLDIER + WALK ANIM (June 17, UNPLAYED) — cosmetic
  only, NO protocol change (avatars still sync via the existing `pos` stream):**
  the remote-player avatars were hazmat primitives (torso/hood/two arm-stubs). They
  are now an articulated **soldier/survivor figure** (`netAvatarBuild`, net.js):
  head + **colored helmet** + dark visor, a two-box armored **vest** + dark chest-rig,
  a **backpack + bedroll**, shoulder pads, and — the point — **TWO arms and TWO legs
  built as PIVOT chains** (hip→upper-leg→knee→lower-leg+boot; shoulder→upper-arm→
  elbow→lower-arm+glove, forearm carried forward for a "ready" look). Group origin
  stays at the feet; -z is forward (visor + facing match the camera).
  - **Per-slot COLOR kept:** the entire suit is ONE shared colored
    `MeshStandardMaterial` (P1 yellow … P5 purple), so every limb is the player's
    color (still distinguishable) AND the existing down-tint (`netSetAvatarDown`
    retargets `av.bodyMat`) recolors the whole figure dark-red. Only the dark gear
    material is separate. **NO new lights, NO new shader family** — untextured
    Standard is the ammoPickupMat-pinned family (same as the chaser/pickups), the
    label's SpriteMaterial is keepalive-pinned.
  - **SIMPLE WALK ANIMATION (`netTickAvatarWalk`, sin-driven like the chaser, gated
    on movement):** the per-frame avatar-smoothing loop feeds each avatar's on-screen
    displacement to the tick. Stride **phase advances by distance travelled** (cadence
    tracks real speed); a **swing amplitude eases in/out** (0→1 moving, →0 idle), so
    a moving avatar swings legs (anti-phase) + arms (contralateral — arm L opposes
    leg L) + a small knee bend, and a **standing OR downed avatar settles to a still
    neutral pose** (no sliding statue). Cheap: a handful of `sin()` per remote avatar,
    co-op only. Knobs: `NET_WALK_MIN_SPEED` 0.5, `NET_WALK_CADENCE` 2.6,
    `NET_LEG_SWING` 0.55, `NET_ARM_SWING` 0.45, `NET_KNEE_BEND` 0.5, `NET_WALK_AMP_EASE` 0.12.
  - **Kept:** facing (yaw lerp toward look/move dir), the camera-facing **name label**
    above, and the **down-state tint**. Solo unaffected (no remote avatars).
  - Headless: **`tools/test_avatar.js`** (new) — static build invariants (no lights,
    one shared colored no-map suit material, two articulated legs + two arms with
    hip/knee + shoulder/elbow pivots, helmet/visor/backpack, the `userData.rig` walk
    stash, label kept, the smoothing-loop wiring) + the extracted `netTickAvatarWalk`
    over a fake rig (moving→swing ramps + limbs swing, legs anti-phase, arm⟂leg
    contralateral, knee≥0, idle→eases to neutral, down→never swings, determinism).
    Full suite green (21 tools); node --check clean.
  - **Needs a co-op session — playtest gate:** do the avatars read as soldiers (helmet
    + pack + limbs) and stay color-distinct at distance? Does the walk look alive —
    arms/legs swinging while a teammate runs, settling to still when they stop, no
    jitter/sliding? Facing toward movement, label legible, down-tint covers the whole
    figure? (Tune the `NET_WALK_*` knobs if the swing is too fast/slow or too big/small.)
- **CO-OP SPAWN FAN-OUT (June 17, UNPLAYED) — players no longer spawn stacked:**
  all players used to build the floor and land on the SAME spawn cell (1,1), piled
  inside each other. **Fix (no protocol change):** `buildMazeScene` now places the
  player by SLOT — `playerSpawnCellFor(netMySlot())`. Each machine computes the
  spawn from its OWN slot + the identical seeded grid, so the ordered open-cell list
  (and thus every slot's cell) matches everywhere with NO host authority / message.
  The corner spawn (1,1) is walls at x=0/z=0, so candidates fan out into the open
  +x/+z quadrant (`SPAWN_FANOUT_OFFSETS`, ordered by ring distance → players land as
  close together as possible while DISTINCT). Only value-1 dry open floor qualifies
  (never wall/pool/furniture); if the maze is too tight to give each slot its own
  cell, higher slots **clamp onto the last open candidate** (never a wall, never a
  crash). **Solo = slot 0 = the canonical (1,1) cell → unaffected.** Headless:
  **`tools/test_spawn.js`** (new) extracts the real helpers and proves slot-0-at-(1,1),
  every cell open-floor across 400 hazard grids × 5 slots, distinct-while-candidates-
  last + graceful 2-cell clamp, determinism, near-first offset ordering, and the
  buildMazeScene wiring. Full suite green (20 tools); node --check clean.
  - **Needs a co-op session — playtest gate:** host + 2-4 clients enter a floor →
    confirm players spawn BESIDE each other (≈1 cell apart) on open floor, not
    stacked, and not clipped into a wall; check a tight-spawn floor (e.g. a maze
    'rooms' floor) still places everyone on valid floor. Solo spawn unchanged.
- **PRE-CO-OP HOST-HEALTH CHECK — PASSED (June 16):** the old host-lag bug
  (CELL load-order exception loop) is still gone AND no recent batch introduced a
  new host-only problem. (1) `test_loadorder` green — no pre-main file reads a
  later-file global at top level (chaser/scanner/audio/finale code all clean). (2)
  Static audit: chaser blob anim is per-frame but cheap on host AND client; the
  `mob_vocal`/`scan_fx`/`run_won` broadcasts are event-driven (not per-frame-per-mob),
  boss scaling is once-at-spawn. (3) **Live repro harness `tools/diag/repro_floors.js`
  ran 3 headless Chromes over the REAL PeerJS broker** on normal floor 0, Hotel Chase
  (17, chaser), Lights Out (18, scanner), AND a DUO on floor 17:
  **ZERO uncaught exceptions in every phase**; **PROG stable 13→13 everywhere**;
  **host fps ≈ client fps** (2.9 vs 2.7 — the old bug was host ~0 / client normal +
  1100 exceptions, so parity = healthy). updateEnemies 0.11ms/frame on the chaser
  floor (blob anim incl.), updateScanDots 0.027ms with live dots, netUpdate 0.035ms.
  The low absolute fps (~3) is the headless SwiftShader software renderer (equal
  across solo too), not a game issue. The duo also re-confirmed **co-op floor
  propagation** (host picked 17 → client loaded 17). Only console noise: 2 benign
  resource-404s/page (favicon-class) + the not-yet-present audio files 404→graceful
  procedural fallback.
- **MUSIC FILE FIXES (June 16):** Level Fun `musicFile` now points at the actual
  files **`['assets/audio/level_fun_1.mp3','assets/audio/level_fun_2.mp3']`** (.mp3,
  two Suno takes) — `updateFloorMusic` picks one at RANDOM per visit (the other is
  the load fallback; per-machine, like the procedural ambience). **Restart now
  switches the music off:** new `stopAllFloorAudio()` (file track + every procedural
  bed) is called from `gameOver` + `quitToMenu` (previously only the Level Fun loop
  was stopped, so the file track / ambient bed bled into those screens). **Confirmed
  in the live harness:** missing files 404 → graceful procedural fallback, no crash;
  once the real files are dropped into `assets/audio/` the loader streams + loops them
  (verified loader path). NOTE: requested path was `level_fun.mp3` but the real files
  are `_1`/`_2`, so both are wired (a single `level_fun.mp3` would 404→procedural).
  `test_music` extended (random-pick, two-take path, restart-stops). Full suite green.
- **8 NEW PER-THEME AMBIENT BEDS + ALL-UNLOCKED PLAYTEST FLAG (June 16, UNPLAYED):**
  - **Ambient beds** (audio.js `startAmbient`, through `ambientGain`, started/stopped
    per floor, subtle/cheap/capped) for the floors that were on the generic hum:
    **Habitable Zone** (soft low hum + distant settling thuds) · **The Suburbs**
    (swelling wind + faint house creaks) · **The Crypt** (deep cavernous drone +
    slow echoing drips + stone-grind groans) · **Greenhouse** (humid hum + high
    insect shimmer + condensation drips + leaf rustle) · **The Archive** (HVAC bed +
    paper rustle + faint disembodied whispers) · **Endless Bus** (diesel engine drone
    + sub rumble + tire/road hiss + occasional bump) · **Lights Out** (oppressive
    24/31Hz sub-bass VOID with a slow beat + sparse whispers/thuds — silence broken
    by dread) · **The Last Door** (heavy 28/41Hz dread drone + groans + structural
    creaks). 5 new one-shot textures (`ambWind`/`ambCreak`/`ambWhisper`/`ambRustle`/
    `ambThud`); reuse `ambDrip`/`ambGroan`. Gains 0.004-0.06, loop intervals
    2.6-15s @ ≤0.7 prob, all torn down via `stopAmbient`. Audio-only (no lights).
    Boss floors 4/9/14 keep the generic hum (have the boss roar). Headless: `test_audio`
    extended (all 13 bed ids + the new helpers + no-THREE invariant).
  - **⚠ ALL_UNLOCKED playtest flag (main.js, top of PART 2 progression):**
    `const ALL_UNLOCKED = true;` makes `isFloorUnlocked()` return true for EVERY floor,
    so all 20 are clickable in the PLAYER level-select (normal menu, NO `?dev=1`).
    localStorage progress is still recorded underneath — only the gate check is
    bypassed. **REVERT after the playtest: flip `ALL_UNLOCKED` to `false`.**
  - **CO-OP confirmed:** the host's chosen floor already propagates — host picks (now
    any) floor → `startGame` sets `currentFloor` → `netOnHostStart` broadcasts
    `game_start {floor, seed}` → the client's `netTryStart` sets `selectedStartFloor =
    d.floor` and calls `startGame` (same seed via `seedFloor`). The client NEVER checks
    `isFloorUnlocked` on this path, so host-picks-14 → everyone loads 14 regardless of
    the flag. (test_finale: ALL_UNLOCKED unlocks all; flipping to false restores gating.)
  - Full suite green (19 tools); node --check clean.
- **REAL MUSIC FILES wired for 2 floors (June 16, UNPLAYED) — Suno Pro,
  commercial-licensed; the procedural loader from the earlier batch now drives them:**
  - **Hotel Chase (floor 18):** `musicFile: 'assets/audio/hotel_chase.mp3'` (single
    `.mp3` per the actual file). **LAYERED** (`musicLayer: true`) — the music plays
    OVER the procedural alarm/elevator bed (keeps chase urgency); both route through
    `ambientGain` so the Ambient slider balances them. Streamed + looped; if the file
    is missing the bed plays alone.
  - **Level Fun (floor 6):** `musicFile: 'assets/audio/level_fun.ogg'`. **REPLACES**
    the procedural music box (no `musicLayer`); falls back to procedural if missing.
  - **`updateFloorMusic` now layer-vs-replace aware:** `musicLayer` → start the
    procedural bed THEN the file (no fallback needed); else file replaces with a
    procedural fallback. `startFileMusic` gained an `onStart` callback that fires only
    on a REAL successful load.
  - **CREDIT LINE:** `theme.musicCredit` → a small non-intrusive `♪ MUSIC: <name> ·
    Suno` line (bottom-center, menu style) shown for ~4s then fades (CSS opacity
    transition). Driven by `onStart`, so it appears ONLY when the file truly plays
    (a missing file → procedural fallback → no false credit); cleared on every floor
    entry (`hideMusicCredit` in `updateFloorMusic`). New `#musicCredit` element + CSS.
  - Headless: `test_music` extended (onStart fires on success / NOT on miss; layer
    vs replace wiring; theme 5 + 17 paths/modes/credits; credit show/hide + fade +
    floor-entry clear; `#musicCredit` DOM/CSS). Full suite green (19 tools); node
    --check clean. **Loads/loops confirmed in the loader** (`audio.loop = true`,
    streamed via HTMLAudioElement → `createMediaElementSource` → `ambientGain`).
  - **Needs a browser session:** drop `hotel_chase.mp3` + `level_fun.ogg` into
    `assets/audio/`, hard-refresh → confirm each streams + loops; Hotel Chase music
    sits OVER the alarm (balance via Ambient slider); Level Fun music replaces the box;
    the "♪ MUSIC" credit shows ~4s then fades; deleting a file cleanly falls back.
- **HOTEL CHASE (floor 18) FIXES (June 16, UNPLAYED) — scarier chaser + tighter,
  faster knife-edge:**
  - **CHASER MODEL → fully PROCEDURAL writhing mass** (`buildChaserMonster`,
    enemies.js) — replaced the red-tinted skinstealer. A lumpy central blob (3
    overlapping faceted icosahedra) with **11 scrambling limbs** (2-segment, pivot+
    knee groups) splaying out and down, plus a cluster of glowing eyes. `animateChaserMesh`
    writhes every limb each frame (fast sin oscillation = frantic scramble), called
    on BOTH the host (updateEnemies) and the client mirror (netClientUpdate). NO model
    file (removed MODEL_DEFS.chaser), distinct from every normal mob. Shared flesh
    material (emissive driven by setMobFlash) + unlit eye material; **zero lights**
    (verified). isGroup so it rides the existing teardown; unkillable so the
    death-squash path never runs. Display scale 2.0→1.5 (~3.5m mass, fits the tight
    corridors). Faces the player (mass of limbs scrambling toward you).
  - **TIGHTER MAZE** (`generateChase`): lanes **3→2 cells** (narrower), **7-9 lanes**
    (was 5-7 → more forced U-turns), **shorter lanes** (LANE_LEN +5→+3 → turns come
    sooner), **furniture 0.42→0.55** (denser). The path is now a tight ~1-wide thread
    through walls of debris. Still flood-fill-safe: the reserved spine + island-seal
    guarantee a clear spawn→exit path (test_chase: 600 seeds connectivity, 200 seeds
    chaser-BFS-reaches-player, all green).
  - **FASTER CHASER:** `CHASER_SPRINT_FRAC` **0.9 → 0.95** (chaser = 95% of player
    sprint). A CLEAN run barely escapes; any fumble (obstacle / sharp turn / stopping
    to shoot / a mob) lets it close. The tighter maze (more turns = lower player avg
    speed) + near-sprint chaser is the intended knife-edge. Knobs: `CHASER_SPRINT_FRAC`
    0.95, `CHASER_GRACE` 3s, `LANE_H`/`NL`/`LANE_LEN`/`P_FURNITURE` in generateChase.
  - Headless: `test_chase` extended (procedural-model no-lights + limbs + animation
    wiring on host & mirror; speed ≥0.95). Full suite green (19 tools); node --check
    clean; sim_levels sweeps the tightened floor.
  - **Needs a browser/co-op session:** does the writhing mass read as horrifying (limb
    scramble speed, eye cluster, size in the tight corridor)? Is 0.95 the right
    knife-edge — clean run barely makes it, fumble = caught — or tune toward 0.93
    (kinder) / 0.97 (brutal)? Is the tighter maze claustrophobic without being
    unfair? Co-op: chaser limbs animate on the client mirror too.
- **MINIMAP → HEADING-UP (June 16, UI only):** the minimap was world-locked
  (north-up) and geometrically correct, but because it didn't rotate with the
  player, "forward" only pointed up when facing north and otherwise read as a 90°
  rotation (W/S → left/right once you turned). **Diagnosis:** NOT an x/z swap — the
  world→canvas mapping (pos.x→canvasX, pos.z→canvasY) was consistent across the grid,
  every blip, and the heading arrow; a literal swap would've rotated a correct map.
  **Fix (per the requirement "forward moves the blip in a *consistent* direction"):**
  converted `updateMinimap` to **heading-up** — one `ctx.translate(center) →
  rotate(player.yaw) → translate(-playerCanvas)` wraps EVERY rotated element (grid,
  basins, exit, artifacts, enemies, boss, teammates) in a single save/restore, so
  they all stay aligned; the player is drawn fixed at the center pointing straight
  up. Now forward is ALWAYS up and strafe always perpendicular, at every facing.
  (`rot == yaw` because forward `(-sin,-cos)` → screen-up.) Headless:
  **`tools/test_minimap.js`** (new) reproduces the exact transform and proves
  forward→up / strafe→right / back→down / left→left + perpendicularity across 8
  facings, the player-at-center invariant, and the wiring (single save/restore, old
  world-locked arrow removed). Full suite green (19 tools); node --check clean.
- **UI OVERLAY-LAYERING BUG FIXED (June 16) — pure UI state, no gameplay change:**
  on the `?dev=1` start menu the "YOU ESCAPED" victory screen + both level-selects
  rendered stacked on top of each other. **Root cause:** `#victoryMenu` (added in
  the capstone batch) inherited `.menu-overlay{display:flex}` but — unlike
  `#pauseMenu`/`#gameOverMenu` — had **no `display:none`** AND **no background**, so
  it floated TRANSPARENTLY over the start menu from first load (everything visible
  through it). **Fix:** (1) CSS `#victoryMenu{display:none; background:rgba(8,6,0,.95)}`
  (hidden by default + opaque); (2) a single source of truth `showMenuOverlay(id)`
  that hides ALL four menu overlays (start/pause/gameover/victory) + force-closes the
  shop, showing exactly one — every transition now routes through it
  (startGame→none, pauseGame→pause, resumeGame→none, gameOver→gameover,
  showVictory→victory, quitToMenu→start), plus a defensive `showMenuOverlay('startMenu')`
  at load; (3) **dev/player level-select now mutually exclusive** — `?dev=1` shows the
  dev panel and hides the player panel (and vice-versa). **Visibility rules** (one
  menu overlay per gameState): `menu`→startMenu, `paused`→pauseMenu (or the shop over
  it, exclusive), `gameover`→gameOverMenu, `won`→victoryMenu, `playing`→none; the two
  level-selects live inside #startMenu so they only show with it. Headless:
  **`tools/test_overlays.js`** (new — drives the real showMenuOverlay over a fake DOM:
  exactly one overlay at a time + shop always closed; CSS defaults; every transition
  routes through it; dev/player exclusivity) and **`test_esc_shop` strengthened** with
  an "at most one menu overlay visible" invariant. Full suite green (18 tools).
- **NEW FLOOR 20 — "The Last Door" (FINAL BOSS capstone, index 19, June 16,
  UNPLAYED):** the milestone ending. Pure config + a tougher fight + a finale
  screen — **no new systems** (reuses the boss archetype, `bossHpFor` scaling, and
  the boss sprites).
  - **The boss:** reuses the **Amalgam sprite** (`boss_amalgam` — "it has consumed
    everything," and not the immediately-prior boss) as a new identity, **THE
    DEVOURER**. Toughest by far: **bossHp 3600** (Warden 800 / Amalgam 1400 / Hive
    2200), **bossScale 5.0** (~10m — the arena builds tall via `roomH`), speed 3.4,
    damage 32, 6 adds, in a **bigger arena** (mazeSize 9 vs Hive's 8). Per-player HP
    scaling applies (solo 3600 → duo 6300 → 4p 11700). First-visit has NO loop bonus
    (floor 19 / 20 themes = 0); the loop bonus still kicks in on later loops.
  - **The finale (`isFinale: true`):** killing the boss **ENDS THE RUN** — no exit to
    walk to. After the death animation, `winRun()` (host/solo) shows a **"YOU
    ESCAPED" victory screen** (run stats: floor reached, kills, floors cleared) with
    **Play Again** + **Main Menu** buttons, sets `gameState='won'` (freezes gameplay
    — ESC/shoot/scan all no-op), marks the capstone beaten, and silences floor audio.
    A procedural **victory sting** plays (`playVictorySting` — a rising C-major swell
    with an uneasy detuned shadow). Every OTHER boss still spawns the exit door.
  - **CO-OP:** host owns the boss, so it decides the win and broadcasts it. **⚠
    PROTOCOL ADDITION (FLAGGED):** `'run_won'` (host→all) → clients show the same
    victory screen. The whole party gets the ending together. Host-authoritative,
    cosmetic-state only.
  - **Level-select:** both the dev (`?dev=1`) and player level-selects iterate
    `LEVEL_THEMES`, so floors 19 (Lights Out) + 20 (The Last Door) appear
    **automatically** — confirmed by test. The reach-gate HUD text is now per-theme.
  - **Headless: `tools/test_finale.js`** (new) — theme config (toughest boss, finale
    flag, reused sprite, bigger arena), the REAL `bossHpFor` on floor 19 (solo
    unchanged, per-player + loop scaling), the boss-death→winRun branch, the victory
    screen + buttons + `gameState='won'`, the `'run_won'` co-op broadcast, and
    level-select auto-pickup. **`test_boss_scaling` updated 3→4 bosses** (loop offsets
    now derive from `LEVEL_THEMES.length`). Full suite green (17 tools); node --check
    clean; sim_levels sweeps the floor-19 arena.
  - **Needs a browser/co-op session — playtest gate:** Does the Devourer feel like a
    real capstone (HP/phase pacing not a slog, the bigger arena + 10m boss read as
    climactic)? Does "YOU ESCAPED" land as an ending (sting, Play Again works, Main
    Menu returns cleanly)? **Co-op:** the duo/4p HP scaling fight length, and both
    players getting the victory screen via `'run_won'`. Tuning knobs: `bossHp 3600`,
    `bossScale 5.0`, `bossDamage 32`, `bossSpawnCount 6`, `mazeSize 9`.
- **NEW FLOOR 19 — "Lights Out" (scanner level, index 18, June 16, UNPLAYED):** a
  pitch-black SCANNER floor — the most novel mechanic so far. Appended after Hotel
  Chase. Archetype **'rooms'** (the classic maze — most disorienting blind).
  - **TOTAL DARKNESS (`theme.scanner = true`):** ambient forced 0, ceiling lights
    at intensity 0, fixtures non-emissive, **flashlight DISABLED** (F no-ops on this
    floor). With no light, Standard surfaces render BLACK — only emissive scan dots +
    the exit beacon are visible. **The 32-light COUNT is untouched** (lights still
    exist at intensity 0 → the program cache never moves); only intensities change.
    The exit-door light (1.5) is the one thing that pierces the dark.
  - **THE SCANNER (the dot system):** **LMB fires a radial pulse** (cooldown 1.5s).
    It casts a ring of grid-DDA rays → paints short-lived **glowing dots** where they
    hit walls (the firer's slot color), radial floor samples (LOS-gated), and **RED
    dots on monsters** (LOS-gated — a mob behind a wall stays hidden; you HEAR it via
    the new vocalizations). Dots fade over ~3.6s; you navigate by memory between
    pulses. **CONSTRAINT-CRITICAL & verified: dots add ZERO lights** — each color is
    ONE `InstancedMesh` of `MeshStandardMaterial` **no-map emissive** (the SAME family
    the ceiling-light fixtures + Hotel-Chase furniture instance every floor → no new
    shader program), fade is per-INSTANCE SCALE (shared material never mutates → one
    draw call per color, capped 256/color, ring-recycled). Pulled from the scene
    before the teardown traverse (shared geo/mats, like sparks/decals).
  - **INPUT scheme (scanner floor only):** **LMB = scan**, **RMB = shoot** (ADS is
    useless in the dark → repurposed; gun auto-fires on held RMB). Shooting still
    works — the muzzle flash briefly lights the room (risk/reward: firing reveals
    you). Off this floor, controls are unchanged (LMB shoots, RMB ADS).
  - **ENEMIES:** sparse but lethal (stalker + phantom, countMult 0.45) — only visible
    when scanned (red) or extremely close. They hunt via normal AI; their idle/aggro
    vocalizations carry the floor.
  - **EXIT:** `gate: 'reach'` (find the exit = win; `goalText: 'FIND THE EXIT'`). The
    reach-gate HUD text is now per-theme (`theme.goalText`). The glowing door + its
    light is the beacon once you're near; fog-of-war + darkness make it hard to find.
  - **CO-OP:** each player scans in THEIR slot color (P1 yellow, P2 green, …); monster
    dots are RED. Monster reveal is PER-MACHINE (each reveals from its own mob list —
    no host authority). **⚠ PROTOCOL ADDITION (FLAGGED):** `'scan'` (client→host) +
    `'scan_fx'` (host→clients) — purely COSMETIC, shares a pulse's origin+slot so
    teammates' wall/floor dots show up in their colors; old builds ignore it. No
    gameplay state crosses the wire.
  - **Audio:** `playScannerPing` (rising sonar blip + airy sweep tail) on each pulse.
  - **Headless: `tools/test_scanner.js`** (new) — proves NO PointLight/SpotLight in
    the dot system + InstancedMesh/no-map/emissive material + per-instance-scale fade;
    drives the REAL `doScanPulse` over a grid (wall+floor dots, monster reveal with
    LOS gating, slot-color routing, determinism); theme/darkness/input/co-op wiring.
    Full suite green (16 tools); node --check clean; sim_levels sweeps floor 18.
  - **Needs a browser/co-op session — playtest gate:** Is the darkness total + the
    scan reveal readable (dot size/brightness/fade ~3.6s, range ~6 cells)? Does LMB-
    scan / RMB-shoot feel right, and the muzzle-flash risk/reward land? Are mobs scary
    when you only hear them then catch a red flicker? **PROG counter flat** entering/
    leaving the floor (proves the dots added no shader program)? Exit beacon findable?
    Co-op: teammates' scans in distinct colors, shared via 'scan_fx'.
- **DEV PLAYTEST CHEATS (June 16) — `?dev=1` ONLY, zero effect on the normal/co-op
  build, no protocol impact:**
  - **Clearer jump-to-floor:** the dev level-select (start menu, `?dev=1`) was tiny
    numbered squares with hover-only names — now a scrollable NAMED list:
    `L18  Hotel Chase            [chase]` (boss floors tinted red), so you can scan
    + click the floor you want. (`buildDevLevelSelect` in main.js + `.dev-ls-*` CSS.)
  - **Cheat keys (in-game, `?dev=1` only — all gated by `DEV_MODE && gameState==='playing'`):**
    **G** = god mode (toggle — `damagePlayer` no-ops: no damage, no down) ·
    **I** = infinite ammo (toggle — clip never decrements, never empties/reloads) ·
    **C** = give cash (+$1000, repeatable) ·
    **K** = kill all mobs (host/solo only — clients mirror; **spares the unkillable
    chaser** so you can feel-test IT; leaves the wave counter so it doesn't instantly
    respawn). Built for tuning the Hotel Chase chaser without dying repeatedly.
  - **Indicator:** a small dev-only `#hudCheats` readout (top-left) shows active
    toggles (`🛡 GOD`, `∞ AMMO`) + a brief flash for give-cash / kill-all. Hidden
    entirely unless `?dev=1` (like the FPS/PROG readouts).
  - **Gating proof:** every cheat is behind `DEV_MODE`; the normal build never reads
    the keys or shows the HUD. Cheat state is local only (no co-op message).
  - **Headless: `tools/test_devcheats.js`** (new) — extracts the REAL
    `handleDevCheatKey`/`devKillAllMobs`/`damagePlayer` and verifies: god toggle +
    damage no-op (and the existing downed-guard still holds), infinite-ammo top-up,
    repeatable cash, kill-all sparing the chaser, the client kill-all guard, and the
    `DEV_MODE` gating + HUD/level-select wiring. Full suite green (15 tools);
    node --check clean.
- **AUDIO PASS — richer procedural soundscape (June 16, UNPLAYED). All Web Audio
  synthesis (no files); the file loader from the previous batch is untouched.**
  - **PER-THEME AMBIENT BEDS (audio.js `startAmbient`, now rebuilt EVERY floor via
    buildMazeScene — previously it was set ONCE at game start, a real gap):** each
    theme gets a distinct subtle looping bed through `ambientGain` (sliders apply):
    Lobby = fluorescent buzz (60Hz + 120Hz harmonic) + flicker crackle; Poolrooms/
    Dark Pools = water-lapping noise bed + echoing drips (+ deep ominous sub-drone on
    the dark variant); Freezer = low HVAC rumble + motor hum + occasional pipe groan;
    Hospital = soft air-handling + intermittent monitor beeps; Electrical = 60/120Hz
    transformer hum + intermittent zap; Pipe Dreams = metallic clanks; **everything
    else = a generic quiet room-tone hum.** Level Fun (music) + Hotel Chase (alarm)
    get NO bed (their dedicated audio IS the bed). `stopAmbient` tears every bed down
    (oscillators + intervals). Gains deliberately low (atmosphere, not noise).
  - **MOB VOCALIZATIONS (the dread layer):** procedural per-type creature sounds,
    distance-attenuated + stereo-panned from the listener's camera (like the remote
    gunshots). `playMobVocal(type, kind, gain, pan)` (audio.js); `mobVocalLocal` /
    `hostMobVocal` (main.js) spatialize + trigger. Per type: crawler/spider = wet
    skitter-clicks; stalker = low growl; phantom = soft fluttering wingbeats; partygoer
    = unsettling descending giggle. **kind = idle | aggro | attack | roar.** The big
    ones for dread: **aggro screech on the roam→hunt transition**, an attack
    growl/screech on a landed hit, and the **Hotel Chase CHASER's relentless angry
    roar** (~every 2.4-3.8s while pursuing). Throttled per-mob + a global **voice cap
    (4 idle, +2 reserve for events)** so a wave never becomes a cacophony; idle gated
    by audible distance. Idle ambience plays **per-machine** (host voices `enemies`,
    each client voices its `netMobs` mirrors); state-driven events are host-owned.
  - **⚠ PROTOCOL ADDITION — `'mob_vocal'` {t,k,x,z}, host → all (FLAGGED per the
    prompt).** State-driven events (aggro/attack/roar) are broadcast so co-op players
    SHARE the scares (each re-spatializes from its own camera). Idle ambience is NOT
    broadcast. Cosmetic only — no gameplay state, no host-authority change. Old builds
    log it unhandled (just miss the sound) → both players on the new build (already
    required by recent batches).
  - **BALLOON POP improved (Level Fun):** crisper/louder latex snap (4ms decay,
    2.2kHz highpass) + a downward latex "fwip" body + the recoil blip; the following
    `playPartyGrowl` deepened (sub-octave + a rising-anger sweep) for menace.
  - **Headless: `tools/test_audio.js`** (new) — extracts the REAL vocalSlot + the
    synth (`_vNoise`/`_vTone`/`playMobVocal`) and drives a fake Web Audio graph:
    the concurrency cap (4 idle + 2 reserve, frees on voice end), EVERY type×kind
    synth branch runs without throwing + routes through sfxGain, the per-theme beds
    exist + are rebuilt per floor, and the trigger/broadcast wiring across all four
    files. Full suite green (14 tools); node --check clean.
  - **Needs a browser/co-op session — playtest gate:** Are the ambient beds
    audible-but-subtle (Lobby buzz, Freezer rumble, Hospital beeps, Electrical zap,
    Dark Pools sub)? Do mob vocals add dread without nagging — the aggro screech land,
    the attack growl read, the **chaser roar feel relentless** on Hotel Chase? Is the
    voice cap enough that a full wave isn't a wall of noise? Balloon pop satisfying +
    growl menacing? **Co-op:** both players hear aggro/attack/roar (the 'mob_vocal'
    broadcast) while idle ambience is each player's own nearby mobs.
- **REAL MUSIC FILES now supported (June 16, UNPLAYED) — deliberate relaxation of
  the procedural-only audio rule (see HARD CONSTRAINTS; PROJECT_GUIDE §3.4):**
  - **Loader (`startFileMusic`/`stopFileMusic`, audio.js):** a floor opts in with
    `theme.musicFile` (a path, or an array of fallback candidates tried in order —
    e.g. `.ogg` then `.mp3`). The file STREAMS via an HTMLAudioElement wired into the
    Web Audio graph through **`ambientGain`** (Master + Ambient sliders control it,
    like procedural music) and **loops**.
  - **Graceful fallback (never crashes / never silent on a missing file):** if every
    candidate 404s / errors / stalls (8s), it falls back to that floor's PROCEDURAL
    track. A floor-change mid-load is token-guarded so a stale load can't start
    playing after you've left. `updateFloorMusic` now: stop all → if `musicFile`
    play the file (fallback procedural) → else procedural (`proceduralMusicStarterFor`).
  - **First floor wired: Hotel Chase (Floor 18).** `theme.musicFile =
    ['assets/audio/hotel_chase.ogg','assets/audio/hotel_chase.mp3']`. With NO file
    present (current state — none committed yet) it plays the existing procedural
    alarm + dread drone + elevator-near-exit. Drop a file in to upgrade it.
    **Trade-off accepted:** a file REPLACES the chase procedural, so the alarm 'run!'
    cue + distance-faded elevator are only present in the fallback (say the word to
    LAYER the file over the alarm instead).
  - **Files live in `assets/audio/`** (new folder; see its README) — committed +
    served by Vercel as static assets like `models/`. **LOAD WEIGHT:** streamed
    LAZILY on floor entry, so they do NOT gate the startup loading screen (unlike the
    GLB mob models); only floors that use a file pay, and only on arrival. Guidance:
    ≤ ~3 MB per track (~96-128 kbps OGG, mono ok).
  - **No new shader/light/protocol impact.** Audio-only; no co-op protocol change
    (music is per-machine ambience). Both players hear their own bus.
  - **Headless: `tools/test_music.js`** (new) — extracts the REAL loader and drives
    every branch with a fake Audio/Web-Audio graph: present file wired+played+looped
    through ambientGain; missing/erroring → onFail (procedural); `.ogg→.mp3`
    candidate fallthrough; all-fail → onFail; 8s stall → onFail; floor-change aborts
    a stale load; stop tears down (pause+disconnect). Plus wiring + folder-exists
    checks. Full suite green; node --check clean.
  - **Needs a browser session — playtest gate:** drop a real `hotel_chase.ogg` into
    `assets/audio/`, hard-refresh, enter Floor 18 → confirm it streams, loops, the
    Master/Ambient sliders move it, and that DELETING/renaming the file cleanly
    falls back to the procedural alarm (no crash, no silence). Co-op: each player
    streams its own copy.
- **NEW FLOOR 18 — "Hotel Chase" (chase archetype, June 16, UNPLAYED):** a CHASE
  level — a new gameplay verb (survive & run, not clear-the-room). Floor index 17,
  appended after Dark Pools. Canon "Run For Your Life." **The level IS the enemy.**
  - **New 'chase' generator (`generateChase`, main.js):** a serpentine of horizontal
    LANES (3 cells tall) stacked vertically, each linked to the next by a 3-wide
    vertical CONNECTOR at a SEEDED column → the player serpentines through sharp
    90°/180° turns, and the lane ends past the connectors are real DEAD-ENDS that
    punish wrong turns. **Flood-fill safety by construction:** a guaranteed-clear
    SPINE (entry-vertical + bottom-row run + connector links per lane) is reserved
    first and NEVER furnished; FURNITURE (new grid value **3** — collidable, drawn as
    knee-high props, never tall walls) is scattered only on non-spine cells; a final
    flood-fill seals any stray island (→ value 3). Seeded rng() only, co-op safe.
    `pickExitCell` (unchanged far-band path) lands the exit deep in the last lane.
  - **THE CHASER (`spawnChaser`/`chaserNextWaypoint`, enemies.js):** a new `chaser`
    mob type (skinstealer model, scaled 2.0 + red color-tint). **Host-authoritative,
    UNKILLABLE** (`applyEnemyHit` flinches it — NO damage, NO stun [so a fast gun
    can't freeze it], NO death). Pursues via **BFS waypoints** (robust around the
    sharp turns/dead-ends — never permanently stuck; proven 200 seeds), at a **FIXED
    speed = 0.9× the player's full sprint** (depth-independent; derived at RUNTIME
    inside spawnChaser, not at enemies.js top level — load-order safe). 3s spawn-grace
    head start; targets the nearest non-downed player; heavy melee (34 dmg). 1 chaser
    (theme.chaserCount). Mirrors to clients via the existing snapshot (no death → it
    never vanishes → clients never animate its death).
  - **NO STAMINA on this floor (`theme.noStamina`):** `updatePlayer` pins stamina full
    and lets sprint run forever — "run for your life" would be ruined by stamina mgmt.
  - **SHOOTABLE OBSTACLE MOBS:** sparse, slow, weak crawlers/spiders (theme.mobs:
    speedMult 0.55 / hpMult 0.6 / countMult 0.45) as living obstacles — shoot to clear
    the path, but stopping lets the chaser close in. Risk/reward.
  - **REACH gate (`gate: 'reach'`, net.js `netExitGateOpen`):** exit is OPEN from the
    start — surviving the run TO it wins. No kills, no items. Goal HUD: "RUN — REACH
    THE EXIT". Exit is the existing glowing door (now mounts only on a REAL wall, not
    on furniture — a no-op change for floors 0-16, which only use grid values 0/1/2).
  - **Atmosphere:** neon-RED ceiling lights (theme.lightColor — intensity/color only,
    **no net-new lights**, generic sampler within the 25-ceiling budget), vintage
    maroon wallpaper/carpet palette, `decorations: 'hotel'` = furniture barricades
    (3-4 InstancedMeshes, SAME instanced-Standard-no-map family the light fixtures
    already use every floor → no new shader program) + cosmetic hotel-room doors.
    Audio (audio.js): blaring two-tone ALARM loop + low dread drone + faint ELEVATOR
    music that swells as the exit nears (`updateChaseAudio` distance-driven), all
    procedural through ambientGain, started/stopped by `updateFloorMusic`.
  - **PROTOCOL ADDITIONS (both players on new build):** `'chaser'` APPENDED to
    `NET_TYPE_LIST` (existing wire indices unchanged) + the `'reach'` gate type. No
    new message types — the chaser rides the existing 'enemies' snapshot.
  - **Latent bug fixed in passing:** `generatePools` could roll zero basins on rare
    seeds (a pool-less "pools" floor); adding an 18th theme shifted the floor→seed
    map and exposed it at floor 39. Added a deterministic forced-basin fallback
    (ZERO extra rng() draws → post-gen stream unchanged for the common case).
  - **Headless: `tools/test_chase.js`** (new) — generateChase path/connectivity/
    furniture/no-pools/determinism over 600 seeds; chaserNextWaypoint reaches the
    player from spawn over 200 seeds (never stuck) + every waypoint is a walkable
    neighbour; theme/gate/noStamina/chaser-type/wire-index/unkillable/stamina-override
    invariants; prints ASCII maps proving a clear path. `sim_levels.js` extended
    (generateChase registered, floor 17 shown, furniture glyph ▒) — **4500/4500
    arbitrary seeds + all floors pass.** Full suite green; node --check clean.
  - **Needs a browser/co-op session — playtest gate:**
    - **Floor 18 (LEVEL 18, "Hotel Chase"):** does the chaser's 0.9× pace feel right —
      escapable on a clean run, catches you on a wrong turn/obstacle/stopping to
      shoot? (THE key knob — `CHASER_SPRINT_FRAC` in enemies.js.) Spawn-grace head
      start length, heavy-hit lethality, the BFS pursuit looking smart around corners.
    - The weave: furniture density (`P_FURNITURE` 0.42) — too blocking / not enough?
      Dead-end lane ends actually punishing? The red-lit vintage-hotel read.
    - Audio mix: alarm not fatiguing on a loop, elevator music swelling at the exit,
      dread drone. Unlimited-sprint feel (no stamina). Bullets-do-nothing flinch read.
    - **Co-op:** chaser targets nearest non-downed, shared via snapshot, both players
      see the same pursuer; reaching the exit advances the party.
- **CO-OP HOST-FREEZE REGRESSION FIXED (June 12, validated in a live headless
  2-browser session):** the reported "host fully lags / can't move, clients
  fine" bug. **Root cause:** the roam/hunt AI batch (42ca481) added top-level
  `const HUNT_NEAR = CELL * 3.0` (+ HUNT_VISION) to enemies.js — but enemies.js
  loads BEFORE main.js, which defines `CELL`. The script body threw
  `ReferenceError: CELL is not defined` at load, leaving every const below it
  (HUNT_*, ROAM_SPEED_MULT, `_steer`, `_whiskers`, `_losDir`) permanently
  uninitialized (TDZ). All hoisted FUNCTIONS still existed, so the game booted —
  but `updateEnemies` then threw "Cannot access 'HUNT_NEAR' before
  initialization" EVERY FRAME on the machine running the sim, aborting
  `animate()` before `renderer.render` → frozen screen. Clients never run
  `updateEnemies` → unaffected. **NOTE: this also freezes SOLO on this build**
  (1000+ exceptions/30s reproduced solo AND host) — a "solo was fine" report is
  the stale-cache/old-deploy pattern (PROJECT_GUIDE §4). **Fix (zero behavior
  change):** constants stored in CELL units (`HUNT_NEAR_CELLS` 3.0 /
  `HUNT_VISION_CELLS` 8.0) and converted to world units inside updateEnemies.
  **Evidence/validation:** new `tools/diag/repro_coop.js` (puppeteer-core
  harness: solo + host + client headless Chromes over the real PeerJS broker,
  per-frame function profile, message counters, exception capture). Before:
  host 0-1 completed frames/10s, 1100+ uncaught exceptions. After: host ==
  client frame rate, 0 exceptions, snapshot flowing, PROG stable (13→13). The
  profile also cleared the rest of the audit: netBuildSnapshot 0.007ms/frame,
  updateEnemies 0.05ms/frame, no per-frame sends, no per-client snapshot
  rebuild. **New guard: `tools/test_loadorder.js`** executes the REAL top-level
  code of audio/net/enemies in index.html order with browser stubs and NO
  main.js globals (this class of bug was invisible to the extraction tests —
  test_ai.js defines its own `CELL` in the sandbox). Full suite green.
  **DEPLOY: push to origin/main — the live Vercel build (c8f5aad) HAS this bug;
  no protocol change, but everyone should hard-refresh onto the fixed build.**
- **Sanity mechanic + consumables + Level Fun music rework (June 11, UNPLAYED):**
  - **SANITY (0-100, per-player, PERSISTS across floors; resets only on a new
    run):** drains ONLY on taking damage — `min(dmg×0.60, 16)` per hit ("More
    noticeable" tuning) — NEVER ambient/dark, and NEVER in the Poolrooms (floor 3,
    the calm safe zone; Dark Pools still drains). Passive recovery +0.9/sec after
    10s with no damage. LOW <55 / CRITICAL <30. Effects are COSMETIC ONLY: a cold
    violet edge-vignette (CSS overlay, opacity-driven) + faint diffuse whispers
    (denser when critical) — NO shake, NO slowdown, NO control loss.
  - **CONSUMABLES — inventory, heal OVER TIME (never instant), carry ≤3 each:**
    Almond Water → sanity (+30 over time, [Q]), Bandages → health (+40 over time,
    [H]). Both BUYABLE (repeatable SUPPLIES shop track: $140 / $150) AND FINDABLE
    (seeded 1-3 cartons/non-boss floor via a floorSeed-derived prng — 0 world-rng
    draws — plus a 6% kill-drop). Same pickup contract as ammo: ONE shared
    emissive geo/mat per kind (NO lights — light budget intact; no-map standard =
    pinned family), seeded sequential ids. **PROTOCOL ADDITIONS: 'consumable_taken'
    {id} + 'consumable_spawn' {id,x,z,kind}** (ammo-pickup pattern — collector
    grants to own inventory, removal broadcasts; host kill-drops). Both on new build.
  - **HUD:** sanity bar (violet) under health/stamina + inventory readout
    ([Q] Almond n/3, [H] Bandage n/3, dimmed when empty).
  - **Level Fun music reworked toward DREAD** (was too "ping-ping"): drone now
    LEADS (louder 0.09→0.16 + a sub-octave), music box is SPARSE (3.5-10s near-
    silent gaps, was a 680ms 16-step loop), an octave LOWER, SOFT-attacked
    (0.05s, was 5ms), lowpassed to kill the plink, and warped (wider flat detune +
    per-note pitch wobble). Party horn/laugh stabs are RARER (30-70s, was 12-35s),
    quieter, and pushed far away through a feedback-delay reverb tail. Floor 5
    only, ambientGain bus, same updateFloorMusic start/stop.
  - Audio: playSanityWhisper (delayed/diffuse), playDrink, playBandage.
  - Headless: tools/test_sanity.js (placement determinism + 0 world draws,
    1-3/distinct/away-from-spawn/sequential-id/valid-kind over 400 seeds, almond>
    bandage frequency, boss→0, drain math + Poolrooms-safe guard, tuning
    constants, no-new-lights). Full suite green; node --check clean.
  - **Tuning is intentionally exposed** as named constants at the top of main.js
    (SANITY_*, ALMOND_*, BANDAGE_*) — easy to retune after playtest.
  - **Needs a browser/co-op session:** does sanity feel gentle (drain pace,
    recovery, vignette/whisper intensity)? the over-time heals; almond/bandage
    pickup spawns + kill-drops; shop SUPPLIES buying; live co-op consumable sync;
    and whether the reworked Level Fun music reads as tense near-silence vs the
    old plinky loop.
- **Visual fix queue 2-4 landed (June 11, UNPLAYED) — texture-creation only, zero
  runtime cost, PROG stable (no new materials/lights/shader families):**
  - **Anisotropy:** `MAX_ANISO = min(8, getMaxAnisotropy())` set once in init,
    applied in `texMarkSRGB` so every world canvas texture (wall/floor/ceiling/
    water/caustics) is created with it. Sampler state, not a program-cache key —
    no recompile, no mid-game mutation. Sharpens floors at grazing angles.
  - **Floor texel density (per-cell):** floor texture `repeat` dropped 2,2→1,1;
    per-cell tiling is now baked into the MESH UVs — the main slab scales its
    0..1 plane UVs to 0..gw/0..gh, and the pools deck + basin quads use per-cell
    UVs ([x,y] not [x/gw,y/gh]). One floor tile per CELL now, matching the
    per-face wall tiles instead of one 256px tile stretched across the slab.
  - **Ceiling 128→256px** (resolution bump; tiling unchanged at repeat 2,2).
  - **Baked fake AO:** `bakeWallAO` darkens the top ~12% (ceiling contact) and
    bottom ~12% (floor contact, a touch darker) of each wall tile via vertical
    gradients; `bakeFloorVignette` adds a soft symmetric corner vignette to each
    floor tile. Both drawn into the canvas at creation (cached per theme →
    literally zero runtime cost), symmetric so textures still TILE seamlessly.
    Grounds surfaces / adds depth with no lights.
  - All sRGB-tagged (unchanged), cached per theme.id (shared, themeCached). node
    --check clean; full suite green; no new `new THREE.*Material`/light/program.
  - **Needs a browser session — what to look at:**
    - **Lobby (0)** + **Habitable Zone (1):** floor sharpness at distance
      (anisotropy) and the wall top/bottom AO grounding — the clearest "finished"
      read; ceiling panel grid should look crisper.
    - **The Poolrooms (3)** + **Dark Pools (16):** the per-cell deck/basin floor
      tiling + AO on the basin lip walls; confirm the water/caustics still align
      and nothing shimmers wrong (deck UVs changed).
    - **The Hospital (10)** ('tile' floor) + **Level Fun (5)** ('party' floor):
      ⚠ per-cell density makes their GRID patterns much finer (≈8 sub-tiles per
      cell now). Realistic (small hospital tiles) but check it isn't too busy —
      if so, the floorType grid spacing in createFloorTexture is the knob.
    - Any floor: PROG counter on the dev HUD (?dev=1) must stay flat across floor
      transitions (proves no shader recompile from the texture/UV changes).
- **Playtest-fix batch landed (June 11, UNPLAYED):**
  - **ESC from Black Market → straight to gameplay** (not back to the pause menu).
    `closeShop` now always `resumeGame()`s — fast mid-fight escape, same in co-op.
    shopReturnTo is vestigial. Updated tools/test_esc_shop.js (8/8; step 4 now
    expects resume-to-play, the never-both-overlays invariant still holds).
  - **Solo kill-gate:** `netExitGateOpen` kills branch now applies to SOLO too
    (was co-op only) — clear the floor's killTarget before the exit opens (same
    `waveSizeFor` threshold, player count 1). Boss + item floors keep their own
    gates. Goal HUD now shows in solo for kills floors. test_artifacts updated.
  - **Goal HUD big + centered:** the objective counter is now the most readable
    thing on screen — ~2em bold "ELIMINATIONS 8/20" / "RELICS x/N", wider glowing
    progress bar, prominent green "EXIT OPEN" pulse when cleared (css only).
  - **Exit = glowing DOOR:** replaced the floor disc + beacon with a doorway set
    into the nearest wall cell — dark frame (posts/lintel/threshold) + a brilliant
    WHITE emissive panel filling the opening, and the EXISTING exit-light slot
    recolored white pouring light into the room. `buildExitDoor(ex,ey,radius)`
    (main.js) is shared by the normal exit AND the post-boss exit (createBossExit).
    Finds an adjacent wall (pools → dry-deck wall; falls back to freestanding for
    open/field archetypes). **No new lights** (reuses the slot, intensity/color/
    position only); materials are MeshStandardMaterial no-map FrontSide — the
    ammoPickupMat-pinned family, **no new shader program**. updateLights pulses
    the panel (no spin).
  - **Enemy AI — roam vs hunt + wall avoidance (host-authoritative):**
    - **Wall-sticking fixed:** `steerAround` whisker steering — if the heading
      runs into a wall just ahead, it rotates to the nearest open heading so mobs
      ROUND corners instead of piling on the wall (the axis-slide collision still
      backs it up). Cheap: 1 grid lookup when clear, ≤7 when blocked.
    - **Behavior variety:** each non-danger spawn rolls ROAM (~42%) or HUNT.
      Roamers wander at 0.5× speed until they NOTICE the player — proximity
      (≤3 cells) or line-of-sight within 8 cells (throttled `raycastWall` LOS) —
      then hunt for 5s after losing them. Danger variants + trap spawns always
      hunt. A floor now has wandering AND charging mobs, not an all-rush.
    - Host-only sim, mirrored to clients via the existing snapshot — NO protocol
      change. Math.random fine (combat sim isn't seeded; clients mirror positions).
  - Headless: tools/test_ai.js (isOpenCell, steerAround clear-vs-rounds-wall,
    behavior constants/mix). Full suite green (ai, esc_shop 8/8, artifacts,
    weapons, scares, balloons, boss_scaling, lobby, sim 4200/4200).
  - **Needs a browser/co-op session:** ESC-escape feel, solo kill-gate pacing,
    goal-HUD legibility, the exit door across all archetypes (incl. pools dry-deck
    + boss arena), and the roam/hunt mix + corner-rounding actually looking smart.
- **Lore objectives / item-gate system landed (June 11, UNPLAYED):**
  - **Gate condition is now per-theme configurable** (`theme.gate`): 'kills'
    (default, co-op only — unchanged), 'item' (collect N artifacts), 'boss'
    (implicit on boss floors). `netExitGateOpen` (net.js) generalized: boss→always
    open; item→`artifactsCollected >= artifactsTotal` (applies in SOLO **and**
    co-op); kills→co-op-only as before. Exit still spawns normally; the gate just
    decides when it opens.
  - **ITEM OBJECTIVE:** glowing octahedron artifacts (emissive, **NO lights** —
    MeshStandardMaterial no-map, already-pinned family; light budget untouched)
    spawn at seeded cells far from spawn (BFS far-half + ≥4-cell spacing) via a
    floorSeed-derived prng — **0 world-rng draws** (headless-proven), so exit/ammo
    placement is undisturbed. Walk-over to collect; HUD goal shows
    "RELICS/RECORDS/FILES n/N → EXIT OPEN". Minimap shows cyan markers only when
    the cell is fog-revealed (like the exit). Mobs still spawn as pressure (kills
    just aren't the gate).
  - **Co-op:** any player can collect (shared progress, host-validated advance).
    **PROTOCOL ADDITION: 'artifact_taken' {id}** — exact ammo-pickup pattern
    (seeded sequential ids, idempotent count on every machine, host relays to the
    other clients). Old builds miss it — both on new build.
  - **Assigned floors:** The Crypt (2 relics), The Hospital (3 patient records),
    The Archive (3 lost files) — kills NOT required there, the items ARE the gate.
  - **Goal HUD** (top center) reflects the active objective type (ARTIFACTS vs
    ELIMINATIONS vs hidden-on-boss).
  - Audio: playArtifactPickup (ascending C-G-C chime) in audio.js.
  - Headless: tools/test_artifacts.js (theme gate config, placement determinism +
    0 world-rng draws, count/distinct/distance/id constraints over 400 seeds,
    collect idempotency, netExitGateOpen across all gate types). Full suite green.
  - **Needs a browser/co-op session:** artifact readability + glow, walk-over feel,
    minimap fog-reveal of markers, the objective HUD on the 3 floors, and live
    co-op shared collection + host-validated exit.
- **Scripted scare events landed (June 11, UNPLAYED):** designed-moment system,
  not random.
  - **Placement** seeded per floor via a dedicated floorSeed-derived prng
    (`mulberry32(floorSeed ^ 0x5CA3E5)`) — consumes 0 world rng() draws
    (headless-proven), so spawn/exit/ammo order is untouched. 1-2 triggers/floor,
    each proximity (enter a cell radius) OR timer-window. NEVER < 30s after floor
    start, NEVER on a boss floor.
  - **Host owns triggers + the which-event roll** (spawn-composition model);
    clients never evaluate, they just apply. **PROTOCOL ADDITION: 'scare'
    {type,data}** broadcast so the whole party shares the moment (data carries
    only what each client needs to reproduce it from its OWN viewpoint). Old
    builds log it unhandled and miss the scare — both players on new build.
  - **4 events:** (1) LIGHTS OUT — all ceiling lights drop to ~5% over 0.4s,
    hold 5s, flicker back (intensity ONLY; updateLights yields via
    scareOwnsLights()), distant rumble. (2) THE WATCHER — a still mob-sprite
    billboard placed ~down the corridor the player faces (host raycastWall pick);
    cosmetic only (no AI/damage/kill-gate/not shootable), despawns with a
    whisper the first time you look away then back, or get close; each player
    evaluates against their OWN camera. (3) DISTANT ROAR — quieter boss-roar with
    a feedback-delay reverb smear + a smooth 1s ambient-light dip. (4) SLAM —
    stereo-PANNED door-bang (pan from each listener's facing) + a ~160ms light
    pulse. **NO screen shake** (accessibility) — sound + light only.
  - **Per-floor flavor (weighted, all types still possible):** pools→ROAR,
    dark (darknessLevel≥0.6)→LIGHTS OUT, Level Fun→WATCHER.
  - **Light budget intact:** zero new lights — every effect is intensity-only on
    existing slots; the Watcher is a Sprite on the already-pinned SpriteMaterial+
    map family. Effects run on all machines (updateScareEffects); triggers
    host/solo only. clearScares() pulls watcher sprites out before the floor
    teardown dispose pass (shared mob textures).
  - Audio: playRumble / playDistantRoar (DelayNode feedback) / playWhisper /
    playSlam(pan, StereoPanner) in audio.js.
  - Headless: tools/test_scares.js (placement determinism + 0 world-rng draws,
    ≤2/floor + spawn-clearance + timer≥30s constraints over 500 seeds, boss→0,
    theme-flavor modality, intensity-only light invariant). Full suite green.
  - **Needs a browser/co-op session:** the actual scare feel + pacing, watcher
    look-away despawn timing, lights-out darkness depth, slam panning direction,
    roar reverb mix, and live co-op shared-scare sync.
- **Weapon system + 3 new guns + visual polish landed (June 11, UNPLAYED):**
  - **Weapon definition system:** WEAPONS table (main.js) — each gun = stats
    (damage/fireRate/clipSize/reserveMax/reloadTime/range/pellets/spread/falloff)
    + a procedural viewmodel builder + sound id + flags. Weapon 0 (Pistol) uses
    the ORIGINAL pistol constants verbatim (headless-proven byte-identical).
    Switch on keys 1-4 (Digit+Numpad) and scroll wheel (cycles OWNED guns only).
    Per-weapon ammo BANK (player.weaponAmmo[]) stowed/restored on switch;
    player.clipAmmo/reserveAmmo always mirror the active gun so HUD/reload/shoot
    read one place. HUD shows the equipped weapon name.
  - **Shop made multiplier-based so upgrades scale every gun:** mag1/mag2 are now
    clipMult 1.5/2.5 (pistol still 12→18→30 EXACT), reserve1 is reserveMult 1.5
    (pistol 84→126, was 120). damage/fireRate were already mults. shopStats lost
    clipSize/reserveMax, gained clipMult/reserveMult.
  - **THREE NEW GUNS** (ARSENAL shop track, per-player like upgrades, reset each
    run): SHOTGUN [2] $450 — 8 pellets, 0.105rad spread, steep falloff
    (1→0.25 over 7-26u), slow 0.85s fire, 6 clip, heavy procedural boom. SMG [3]
    $500 — 0.062s fire, 11 dmg, 30 clip / 180 reserve, slight spread, snappy
    crack. FLARE [4] $350 — 20 dmg, 1.1s, 1 clip; impact PLANTS LIGHT for 8s.
  - **FLARE LIGHT within the 32-light budget:** dropped CEILING_LIGHT_BUDGET
    26→25 (still covers the worst real 5x5=25 placement; only the 1 spare pad is
    gone — zero visual change) and added ONE persistent flare slot (intensity 0
    when idle, planted at the impact, flickers down over 8s). Recreated per floor
    like bossLight. 25+boss1+proj3+exit1+muzzle1+flare1 = 32 point lights held.
  - **Visual polish (all guns):** distinct primitive viewmodels per gun (twin
    wood-stocked shotgun / boxy railed SMG / fat orange break-action flare),
    per-weapon muzzle-flash color+scale on the existing muzzle slot, pooled
    impact SPARKS (64 emissive boxes, fly+fade, NO lights), pooled bullet-hole
    DECALS (max 20 dark quads, oldest recycled, oriented to the wall normal).
    Sparks/decals/flare-bead all use the already-pinned MeshStandardMaterial
    (no-map) program family (same as the teammate muzzle flash) — NO new shader
    program. New grid-DDA raycastWall (cosmetics only: trail clip + spark/decal
    placement; combat raycasts UNCHANGED, so hit logic is untouched).
  - **CO-OP / PROTOCOL ADDITION: 'shoot' & 'shot_fx' now carry `w` (weapon id)
    and, for shotguns, `p` (the pellet dir array the shooter actually fired —
    host resolves the same rays).** Single-ray guns omit p. Host resolves each
    pellet with the shooter's own damage mult + the weapon's falloff. Teammate
    shot_fx renders the right weapon's trails/sound and plants the flare light
    for the whole party (single slot — most recent flare wins). Old builds would
    misread it: BOTH PLAYERS ON NEW BUILD (already required).
  - Headless: tools/test_weapons.js (7 groups — table/pistol-unchanged, stat
    helpers under mults, falloff curve, pellet-ray cone math, raycastWall DDA,
    switchWeapon bank+owned-gate, light-budget invariant). All existing suites
    still green (esc_shop 8/8, balloons, boss_scaling, lobby 19/19, sim 4200/4200).
  - **Needs a browser/co-op session:** viewmodel silhouettes + recoil feel, the
    4 gun sounds in the mix, shotgun pellet spread/falloff feel, flare lighting a
    Dark Pools room, spark/decal density + decal orientation on real walls, PROG
    counter stability on the dev HUD, and live co-op pellet/flare sync.
- **Co-op boss HP scaling landed (June 11, UNPLAYED in co-op):** bossHpFor
  (enemies.js, pure/extractable) = themeBase × loop bonus × (1 + 0.75×(players-1));
  player count from new netActivePlayerCount (host + OPEN peers, downed still
  count). Computed ONCE in spawnBoss and locked — joins/leaves/downs never
  re-scale (verified: nothing assigns to maxHp after creation). Solo is
  bit-identical to the old formula. Clients get scaled hp/maxHp via the
  existing snap.b — NO protocol change. Phases still 70/40/15% of maxHp.
  DEV_MODE-gated spawn log (players/baseHp/scale/finalHp). Boss damage/speed/
  phases/waves/killTarget untouched (duo mobs already feel rough — tune later).
  Headless: tools/test_boss_scaling.js (6 check groups, incl. solo-unchanged
  across loops + scale table + snapshot path). Needs a real duo session to
  feel the 1.75x fight length.
- **Black market + Level Fun batch landed (June 11, UNPLAYED):**
  - ESC centralized into ONE handler: market → pause → pause-the-game priority;
    pause menu and market are exclusive via openShop/closeShop/closeShopSilent
    (main.js). resumeGame refuses while the market is up; game-over/quit/restart
    force-close it. Headless-verified: tools/test_esc_shop.js (extracts the real
    handlers, 8/8 transitions + never-both-overlays invariant).
  - Market UI: upgrades grouped into 6 labeled tier columns, FUNDS banner,
    explicit owned/locked(shows prereq)/can't-afford(red)/buyable states, hover
    glow on buyable only, Back [ESC] button. CSS + existing DOM only.
  - Level Fun music reworked (procedural, ambientGain): warped LFO drone,
    broken music-box lullaby (always slightly flat, 6% tritone / 10% semitone
    WRONG notes), distant party-horn/laughter stabs every 12-35s (Math.random
    timers — per-machine ambience, allowed). Same updateFloorMusic start/stop.
  - Level Fun props: party pass placement now via a floorSeed-derived prng
    (NOT the world rng — consumes 0 world draws, verified; exit/ammo placement
    unchanged from the ecology build). More balloons + tables + gift stacks +
    cups/hats clutter + streamers/crooked pictures. All MeshStandardMaterial
    no-map (already-pinned family), no DoubleSide, NO new lights, ~60 extra
    meshes on the party floor.
  - **Balloon pop trap:** balloons are shootable (seeded ids, ammo-pickup
    contract — tools/test_balloons.js verifies determinism/validity). Host owns
    the pop (local shot or relayed client 'shoot'): pop snap + delayed growl
    (boss-roar synth pitched down), 3-5 partygoers spawn at open cells within
    3 cells (capped by MOB_HARD_CAP=30, spawns fewer), aggro'd onto the popper
    for 9s or until they land a hit (enemies.js aggroPeer/aggroTimer).
    **PROTOCOL ADDITION: 'balloon_pop' {id}** — old builds ignore it (balloon
    stays visible there); both players on new build, already required.
  - Needs a real browser/co-op session: audio mix, shop look, Chrome ESC
    pointer-lock cooldown feel, live pop sync + aggro feel, PROG counter
    stability on the dev HUD.
- **Mob ecology pass landed (June 11, UNPLAYED):** per-theme spawn tables in
  LEVEL_THEMES[].mobs (types/weights/danger + speedMult/hpMult/countMult +
  waveBase/waveCap). spawnWave/spawnDangerMob/spawnEnemy read them; killTarget now
  derives from waveSizeFor (deterministic — co-op kill-gate safe). Early floors few/
  weak (Lobby wave 1 = 2 mobs), Pipe Dreams 1.25x speed, Freezer 0.8x/1.5x hp,
  Level Fun 1.5x count @ 0.7x hp, Dark Pools 0.5x count. Danger variants mix into
  waves past floor 8 (+4%/floor, 35% cap). Wave respite 6.5s→2.5s with depth.
  Boss floors untouched (adds get neutral mults).
- **Exit placement randomized (June 11, UNPLAYED):** pickExitCell (main.js) — BFS
  from spawn over deck cells, seeded rng() pick from top-25% by path distance;
  linear floors restrict to rear-door rows; pools auto-dry-deck (value-1 only).
  One rng() draw at a fixed build-order point (before spawnAmmoPickups) → co-op
  deterministic, but ammo placement shifts vs old builds: **BOTH PLAYERS MUST BE
  ON THE NEW BUILD** (version warning already pending from QoL batch anyway).
- Sim suite extended: extracts the real pickExitCell, verifies exit on dry deck,
  reachable, in the top-25% distance band (rear rows on linear), plus exit VARIETY
  across 300 seeds/theme. 68/68 floors + 4200/4200 seeds pass.
- QoL batch landed and verified: lobby 19/19, hazmat skins, revive UX, teammate shot
  effects. **PENDING: push the build — protocol changed, version-mismatch warning will
  fire until both players update.**
- Full visual/rendering audit complete (June 10). Renderer foundation confirmed
  correct: ACES tone mapping @0.85, sRGB output, pixel ratio capped at 2, AA on,
  all-PBR materials, per-theme linear fog. No shadows (intentional), no post-processing
  (CSS overlays only).

## VISUAL FIX QUEUE (from audit — ranked by impact)
All four are zero/near-zero runtime cost by design. Do IN ORDER with the gate.

1. **sRGB encoding on canvas textures** — every canvas texture is linear-encoded while
   the renderer outputs sRGB; all authored colors render shifted/muddy. Fix: set
   `tex.encoding = THREE.sRGBEncoding` at texture CREATION (load-time) — never toggle
   on live textures mid-game (forces shader recompile hitch). Boss PNGs already correct.
   ⚠ **PLAYTEST GATE:** this shifts all 17 palettes at once. Walk Lobby, Poolrooms,
   Dark Pools after. If too hot/saturated, nudge toneMappingExposure (0.85 → ~0.78)
   before touching individual palette values.
2. ~~**Anisotropy**~~ DONE June 11 (unplayed) — MAX_ANISO via texMarkSRGB.
3. ~~**Floor texel density**~~ DONE June 11 (unplayed) — per-cell mesh UVs (slab +
   pools deck), floorTex repeat 1,1, ceiling bumped to 256. See CURRENT STATE.
4. ~~**Baked fake AO**~~ DONE June 11 (unplayed) — wall top/bottom bands + floor
   corner vignette baked at creation. See CURRENT STATE.
→ **All four visual-queue items now done (sRGB was already in).** Playtest 2-4 as
  a batch — see the "what to look at" list in CURRENT STATE.

Parked: bloom/EffectComposer (new render pipeline, fights program keepalive; fake
additive glow sprites on emissives gets 80% later).

## DESIGN ROADMAP (from June 10 design session — in order)
1. ~~**Mob ecology pass**~~ DONE June 11 (unplayed) — see CURRENT STATE.
2. ~~**Exit placement variety**~~ DONE June 11 (unplayed) — see CURRENT STATE.
3. ~~**Scripted scare events**~~ DONE June 11 (unplayed) — starter set of 4
   (lights out / the watcher / distant roar / slam), seeded triggers, host-owned
   + 'scare' broadcast, per-floor flavor. See CURRENT STATE.
4. ~~**Gun/visual polish pass**~~ DONE June 11 (unplayed) — folded into the
   weapon system batch: distinct per-gun viewmodels, per-weapon muzzle flash,
   pooled impact sparks + bullet-hole decals. See CURRENT STATE.
5. ~~**Lore objectives**~~ DONE June 11 (unplayed) — per-theme gate condition
   (kills/item/boss), artifact spawns + pickup + objective HUD + minimap markers,
   co-op 'artifact_taken' sync. Crypt/Hospital/Archive are item floors. See
   CURRENT STATE.

**The design roadmap is now fully cleared.** Possible next directions (unprioritized):
more gate variants (escort/survive-timer), item lore text on pickup, per-floor
objective variety, or circling back to the parked VISUAL FIX QUEUE (sRGB pass etc.).

**New gameplay verb added June 16 (beyond the roadmap):** the CHASE archetype +
'reach' gate (Hotel Chase, floor 18) — survive-and-run instead of clear-the-room,
with an unkillable BFS pursuer. The 'reach' gate + the chase generator are reusable
for future survive/escort floors. See CURRENT STATE.

## WHAT DIDN'T WORK / DECIDED AGAINST
- Bloom via EffectComposer — parked (pipeline risk vs payoff)
- Slides in poolrooms — parked (real new player-physics work; pools shipped without)
- Random scares — rejected in favor of designed scripted moments

## KNOWN AUDIT FACTS (reference)
- Light slots (32 point + 1 spot + 1 ambient): ambient 1, ceiling ≤25 (+ budget
  pads to exactly 25 — was 26, dropped 1 for the flare), boss glow 1, boss
  projectiles 3, exit-door light 1 (was the beacon — same slot), muzzle flash 1,
  FLARE 1 (= 32 point); flashlight
  is the 1 spot
- Textures: walls/floors 256px, ceiling 128px, mob sprites 256px Nearest-filtered
- Full per-theme palette table lives in LEVEL_THEMES (main.js:40-407)

## SESSION PROTOCOL
- Open: paste this file + "Today's goal: [one thing]"
- Every Claude Code prompt carries the HARD CONSTRAINTS block
- Close: update CURRENT STATE + queues, mark validated vs unplayed, commit this file
