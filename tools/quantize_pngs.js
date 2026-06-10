// Second pass: palette-quantize PNG textures in place (sharp/libimagequant).
// PNG stays PNG — no format change, alpha preserved, three.js r128 safe.
// JPEGs are untouched (formats filter), since converting them to PNG would grow them.
const fs = require('fs');
const path = require('path');
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const { textureCompress } = require('@gltf-transform/functions');
const sharp = require('sharp');

const MODELS_DIR = path.join(__dirname, '..', 'models');

(async () => {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  for (const file of process.argv.slice(2)) {
    const full = path.join(MODELS_DIR, file);
    const before = fs.statSync(full).size;
    const doc = await io.read(full);
    await doc.transform(textureCompress({
      encoder: sharp,
      targetFormat: 'png',
      formats: /image\/png/, // only re-encode textures that are already PNG
      quality: 75,           // palette quantization quality
    }));
    const out = await io.writeBinary(doc);
    fs.writeFileSync(full, out);
    console.log(`${file}: ${(before / 1048576).toFixed(2)} MB -> ${(out.length / 1048576).toFixed(2)} MB`);
  }
})();
