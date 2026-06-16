# assets/audio/ — real music files

Drop floor **music files** here. This is a **deliberate exception** to the
otherwise procedural-only audio rule (same status as the boss `models/*.glb` +
boss `*.png` sprites — see `PROJECT_GUIDE.md` §3.4 and the HARD CONSTRAINTS in
`BACKROOMS_STATE.md`).

## How a floor uses a file

A theme opts in with a `musicFile` field in `LEVEL_THEMES` (`js/main.js`):

```js
// single path, or an array of fallback candidates tried in order (.ogg then .mp3)
musicFile: ['assets/audio/hotel_chase.ogg', 'assets/audio/hotel_chase.mp3'],
```

The loader (`startFileMusic` in `js/audio.js`) streams the file through the
**`ambientGain`** bus (so the Master + Ambient volume sliders control it, exactly
like the procedural music) and **loops** it. Floors with no `musicFile` keep their
procedural track.

## Graceful fallback (no file = no crash)

If **every** candidate path is missing / 404s / fails to decode / stalls (8s),
the loader logs a warning and falls back to that floor's **procedural** track.
So you can commit this folder empty and the game still runs — the file just
"upgrades" the floor once it's present.

## Currently wired

| Floor (display) | Theme | Expected file(s) | Fallback if absent |
|---|---|---|---|
| Floor 18 — Hotel Chase | id 17, `chase` | `hotel_chase.ogg` (or `.mp3`) | procedural alarm + dread drone + elevator-near-exit |

To add another floor: set `musicFile` on its theme and drop the file here with a
matching name.

## Format / size guidance (LOAD WEIGHT)

- **Format:** `.ogg` (Vorbis/Opus) preferred — smaller, open. `.mp3` works too
  (Safari-friendly fallback). List both in `musicFile` if you have both.
- **Streamed, not preloaded:** files load **on floor entry**, NOT at startup —
  they do **not** gate the loading screen (unlike the GLB mob models). Only the
  floors that use a file pay for it, and only when you reach them.
- **Keep it modest:** target **≤ ~3 MB** per track. A 2–3 minute loop at
  ~96–128 kbps OGG lands around 1.5–3 MB. Mono is fine for ambience and halves
  the size. Trim/normalize so the loop point is seamless.
- **Committed + deployed:** files in this folder are committed to git and served
  by Vercel as static assets (same as `models/`), so they load in production from
  the same relative path.

## Licensing

Only commit audio you have the right to ship (CC0 / your own / properly licensed).
