# BACKROOMS_STATE.md — Backrooms Shooter

**What this is:** Living state doc. Paste into any chat session (or tell it "read
BACKROOMS_STATE.md") to resume with full context. UPDATE THIS at the end of every
session: what changed, what's validated vs unplayed, what's next.

**Last updated:** June 11, 2026

---

## THE GAME
Three.js r128 (CDN) WebGL first-person shooter. P2P co-op, host-authoritative.
Repo: `github.com/CodeAndCalories/backrooms_shooter`, deployed on Vercel.
17 themed floors (Lobby → Dark Pools), bosses every 5 levels, anti-linger spawner,
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
2. **Anisotropy** — currently 1 everywhere; floors smear at grazing angles. Set from
   `renderer.capabilities.getMaxAnisotropy()` (cap 8) on wall/floor/ceiling/water
   textures. Trivial, no visual-direction change.
3. **Floor texel density** — one 256px tile stretched repeat(2,2) across the entire
   level slab vs per-face wall tiles. Fix: repeat per cell; floor canvas must tile
   seamlessly. Ceiling is only 128px — bump to 256 while in there.
4. **Baked fake AO** — darken top/bottom ~10% of wall tiles + corner vignette on floor
   tiles, drawn into the canvas. Zero runtime cost, biggest "finished" feel.
   → Playtest after 2-4 as a batch.

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

## WHAT DIDN'T WORK / DECIDED AGAINST
- Bloom via EffectComposer — parked (pipeline risk vs payoff)
- Slides in poolrooms — parked (real new player-physics work; pools shipped without)
- Random scares — rejected in favor of designed scripted moments

## KNOWN AUDIT FACTS (reference)
- Light slots (32 point + 1 spot + 1 ambient): ambient 1, ceiling ≤25 (+ budget
  pads to exactly 25 — was 26, dropped 1 for the flare), boss glow 1, boss
  projectiles 3, exit beacon 1, muzzle flash 1, FLARE 1 (= 32 point); flashlight
  is the 1 spot
- Textures: walls/floors 256px, ceiling 128px, mob sprites 256px Nearest-filtered
- Full per-theme palette table lives in LEVEL_THEMES (main.js:40-407)

## SESSION PROTOCOL
- Open: paste this file + "Today's goal: [one thing]"
- Every Claude Code prompt carries the HARD CONSTRAINTS block
- Close: update CURRENT STATE + queues, mark validated vs unplayed, commit this file
