// GLB inspector — audit tool, not shipped. Reports per-GLB:
// embedded images (mime, bytes, pixel dims), mesh/primitive counts, triangles.
const fs = require('fs');
const path = require('path');

function pngDims(buf) {
  // PNG: width/height at bytes 16..23 of the file (IHDR)
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}
function jpegDims(buf) {
  let i = 2;
  while (i < buf.length - 9) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return { w: -1, h: -1 };
}

const COMP_SIZE = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };

for (const file of process.argv.slice(2)) {
  const buf = fs.readFileSync(file);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  // binary chunk starts after JSON chunk header+data
  const binStart = 20 + jsonLen + 8;

  console.log(`\n=== ${path.basename(file)} (${(buf.length / 1024 / 1024).toFixed(2)} MB) ===`);

  // Images
  const bvs = json.bufferViews || [];
  (json.images || []).forEach((img, idx) => {
    if (img.bufferView === undefined) { console.log(`  image[${idx}] external uri: ${img.uri}`); return; }
    const bv = bvs[img.bufferView];
    const data = buf.subarray(binStart + (bv.byteOffset || 0), binStart + (bv.byteOffset || 0) + bv.byteLength);
    let dims = { w: '?', h: '?' };
    if (img.mimeType === 'image/png') dims = pngDims(data);
    else if (img.mimeType === 'image/jpeg') dims = jpegDims(data);
    console.log(`  image[${idx}] ${img.mimeType} ${(bv.byteLength / 1024).toFixed(0)} KB  ${dims.w}x${dims.h}  name=${img.name || ''}`);
  });

  // Meshes / primitives / triangles
  let prims = 0, tris = 0;
  const accessors = json.accessors || [];
  (json.meshes || []).forEach(m => {
    m.primitives.forEach(p => {
      prims++;
      const count = p.indices !== undefined ? accessors[p.indices].count
        : accessors[p.attributes.POSITION].count;
      tris += Math.round(count / 3);
    });
  });
  const skinned = (json.skins || []).length;
  const anims = (json.animations || []).length;
  const mats = (json.materials || []).length;
  console.log(`  meshes=${(json.meshes || []).length} primitives(=draw calls/instance)=${prims} triangles=${tris} materials=${mats} skins=${skinned} animations=${anims}`);
}
