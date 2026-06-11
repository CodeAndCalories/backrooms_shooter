# BACKROOMS_STATE.md — Backrooms Shooter

**What this is:** Living state doc. Paste into any chat session (or tell it "read
BACKROOMS_STATE.md") to resume with full context. UPDATE THIS at the end of every
session: what changed, what's validated vs unplayed, what's next.

**Last updated:** June 10, 2026

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
1. **Mob ecology pass** (first — changes every minute of play): per-floor spawn tables
   replacing the generic mix — early floors few/weak, 1-2 signature mobs per theme
   (Hospital=wretches/skinstealers, Poolrooms=phantoms+crawlers, Suburbs=facelings/
   stalkers in fog, Dark Pools=sparse dread), deeper = bigger waves + danger variants.
   Stat variants via per-theme multiplier fields (Pipe Dreams faster, Freezer tankier,
   Level Fun numerous-but-weak). Spawn pacing ramps with depth; anti-linger stays as
   universal pressure. Data-only; respect existing entity caps. Host-authoritative.
2. **Exit placement variety** (can bundle with #1): seeded random exit from candidate
   cells far from spawn (top 25% by distance), reachable, dry deck on pool floors.
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
