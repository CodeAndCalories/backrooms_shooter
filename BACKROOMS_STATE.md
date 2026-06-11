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
3. **Scripted scare events** (after ecology): starter set of 3-4 — lights cut for 5s,
   mob that freezes until looked at, distant roar, door slam. Proximity/timer
   triggered, designed not random.
4. **Gun/visual polish pass**: better procedural viewmodel (current = 24 primitive
   boxes), muzzle light flash, impact sparks/decals on walls. Teammate shot effects
   already landed — verify in co-op.
5. **Lore objectives** (biggest scope — parked last): "find item + kill" — per-level
   configurable gate condition (kills OR item OR boss) slotting into existing
   kill-gate system. Needs item spawns, pickup, objective HUD.

## WHAT DIDN'T WORK / DECIDED AGAINST
- Bloom via EffectComposer — parked (pipeline risk vs payoff)
- Slides in poolrooms — parked (real new player-physics work; pools shipped without)
- Random scares — rejected in favor of designed scripted moments

## KNOWN AUDIT FACTS (reference)
- Light slots: ambient 1, ceiling ≤26 (+ budget pads to exactly 26), boss glow 1,
  boss projectiles 3, exit beacon 1, flashlight spot 1, muzzle flash 1
- Textures: walls/floors 256px, ceiling 128px, mob sprites 256px Nearest-filtered
- Full per-theme palette table lives in LEVEL_THEMES (main.js:40-407)

## SESSION PROTOCOL
- Open: paste this file + "Today's goal: [one thing]"
- Every Claude Code prompt carries the HARD CONSTRAINTS block
- Close: update CURRENT STATE + queues, mark validated vs unplayed, commit this file
