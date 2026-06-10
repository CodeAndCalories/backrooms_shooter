// One-shot asset repair: the boss sprite PNGs were exported RGB with the white
// background BAKED IN (no alpha channel). Flood-fill from the image borders,
// marking border-connected near-white/neutral pixels as background → alpha 0.
// Interior whites (eyes, visors, highlights) are NOT border-connected, so they
// survive — a naive global white-key would punch holes in them.
const fs = require('fs');
const sharp = require('./node_modules/sharp');

const FILES = ['sprites/warden.png', 'sprites/amalgam.png', 'sprites/hivemind.png'];

// background predicate: light and near-neutral (the baked bg is white/grey)
function isBg(data, i) {
  const r = data[i], g = data[i + 1], b = data[i + 2];
  const min = Math.min(r, g, b), max = Math.max(r, g, b);
  return min > 165 && (max - min) < 30;
}

(async () => {
  for (const f of FILES) {
    const before = fs.statSync(f).size;
    const { data, info } = await sharp(f).raw().toBuffer({ resolveWithObject: true });
    const { width: w, height: h, channels: ch } = info;

    // BFS flood fill from every border pixel that matches the bg predicate
    const visited = new Uint8Array(w * h);
    const queue = [];
    for (let x = 0; x < w; x++) { queue.push(x, 0, x, h - 1); }
    for (let y = 0; y < h; y++) { queue.push(0, y, w - 1, y); }
    const flood = new Uint8Array(w * h);
    const stack = [];
    for (let i = 0; i < queue.length; i += 2) {
      const x = queue[i], y = queue[i + 1], p = y * w + x;
      if (!visited[p] && isBg(data, p * ch)) { visited[p] = 1; flood[p] = 1; stack.push(p); }
    }
    while (stack.length) {
      const p = stack.pop();
      const x = p % w, y = (p / w) | 0;
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
        const np = ny * w + nx;
        if (!visited[np] && isBg(data, np * ch)) { visited[np] = 1; flood[np] = 1; stack.push(np); }
      }
    }

    // Build RGBA: background → alpha 0; everything else opaque. One dilation
    // pass softens the fringe: non-bg pixels TOUCHING the flood that are still
    // light get half alpha, so the cutout edge doesn't glow white in-game.
    const out = Buffer.alloc(w * h * 4);
    let keyed = 0;
    for (let p = 0; p < w * h; p++) {
      const si = p * ch, di = p * 4;
      out[di] = data[si]; out[di + 1] = data[si + 1]; out[di + 2] = data[si + 2];
      if (flood[p]) { out[di + 3] = 0; keyed++; continue; }
      let edge = false;
      const x = p % w, y = (p / w) | 0;
      if ((x > 0 && flood[p - 1]) || (x < w - 1 && flood[p + 1]) ||
          (y > 0 && flood[p - w]) || (y < h - 1 && flood[p + w])) edge = true;
      out[di + 3] = (edge && Math.min(out[di], out[di + 1], out[di + 2]) > 140) ? 120 : 255;
    }

    await sharp(out, { raw: { width: w, height: h, channels: 4 } })
      .png({ quality: 90, palette: true }) // quantized RGBA PNG keeps the file small
      .toFile(f + '.tmp');
    fs.renameSync(f + '.tmp', f);
    const after = fs.statSync(f).size;
    console.log(`${f}: keyed ${(keyed / (w * h) * 100).toFixed(1)}% of pixels as background | ${(before / 1024).toFixed(0)} KB -> ${(after / 1024).toFixed(0)} KB`);
  }
})();
