# BACKROOMS_STATE.md — Backrooms Shooter

**What this is:** Living state doc. Paste into any chat session (or tell it "read
BACKROOMS_STATE.md") to resume with full context. UPDATE THIS at the end of every
session: what changed, what's validated vs unplayed, what's next.

**Last updated:** June 16, 2026

---

## THE GAME
Three.js r128 (CDN) WebGL first-person shooter. P2P co-op, host-authoritative.
Repo: `github.com/CodeAndCalories/backrooms_shooter`, deployed on Vercel.
18 themed floors (Lobby → Hotel Chase), bosses every 5 levels, anti-linger spawner,
fog-of-war minimap, pool/water system with fake caustics.

## HARD CONSTRAINTS (go in EVERY Claude Code prompt)
- Seeded RNG only for anything world/spawn related (co-op sync)
- Fixed light budget: 32 point + 1 spot + 1 ambient per floor (budget pads fill to 26
  ceiling lights) — never exceed, never destabilize the shader program cache
- New material/shader families must be pinned in the program keepalive
- Procedural assets (canvas textures + Web Audio); boss PNGs are the only file assets
- No head-bob / no screen shake (accessibility) — gun-only recoil
- Host-authoritative, co-op safe; protocol changes require BOTH players on new build

## CURRENT STATE
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
