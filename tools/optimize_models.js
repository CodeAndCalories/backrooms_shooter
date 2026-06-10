// One-shot GLB optimizer — audit/asset tool, not shipped with the game.
// Constraints: output must stay loadable by three.js r128 GLTFLoader with no
// extra decoders → NO draco/meshopt compression, NO webp/ktx2. Plain PNG/JPEG
// textures (resized) and uncompressed-but-decimated geometry only.
//
// Skin stripping is gated on a bind-pose check: skinning is a visual no-op at
// rest pose iff jointWorldMatrix * inverseBindMatrix ≈ I for every joint (and
// the skinned mesh node itself has ~identity world transform). Only then is
// dropping skins + JOINTS/WEIGHTS attributes guaranteed lossless on screen.
const fs = require('fs');
const path = require('path');
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const { weld, simplify, prune, dedup, textureCompress } = require('@gltf-transform/functions');
const { MeshoptSimplifier } = require('meshoptimizer');
const sharp = require('sharp');

const MODELS_DIR = path.join(__dirname, '..', 'models');

// per-model plan: simplifyRatio (null = skip), stripSkin attempt, texture max size
const PLAN = {
  'escape_the_backrooms_skinstealer.glb':              { simplifyRatio: 0.22, stripSkin: true,  texSize: 512 },
  'partygoer_from_backrooms.glb':                      { simplifyRatio: null, stripSkin: false, texSize: 512 },
  'backrooms_aranea_membri_rigged_blender_3.01.glb':   { simplifyRatio: 0.5,  stripSkin: true,  texSize: 512 },
  'death_moths_backrooms.glb':                         { simplifyRatio: null, stripSkin: false, texSize: 512 },
  'bacteria_-_kane_pixels_backrooms.glb':              { simplifyRatio: null, stripSkin: false, texSize: null },
  // smiler_backrooms.glb intentionally absent: not in MODEL_DEFS, never downloaded.
};

function mat4Mul(a, b) { // column-major 4x4, glTF convention
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++)
    for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
function maxIdentityDeviation(m) {
  let max = 0;
  for (let i = 0; i < 16; i++) max = Math.max(max, Math.abs(m[i] - (i % 5 === 0 ? 1 : 0)));
  return max;
}

// Returns worst deviation across all skins' joints; Infinity if IBMs missing.
function bindPoseDeviation(doc) {
  let worst = 0;
  for (const skin of doc.getRoot().listSkins()) {
    const ibm = skin.getInverseBindMatrices();
    if (!ibm) return Infinity;
    const el = [];
    skin.listJoints().forEach((joint, i) => {
      ibm.getElement(i, el);
      worst = Math.max(worst, maxIdentityDeviation(mat4Mul(joint.getWorldMatrix(), el.slice())));
    });
  }
  // skinned-mesh node transforms are IGNORED under glTF skinning but APPLY once
  // skinning is stripped — they must be ~identity too.
  for (const node of doc.getRoot().listNodes()) {
    if (node.getSkin()) worst = Math.max(worst, maxIdentityDeviation(node.getWorldMatrix()));
  }
  return worst;
}

function stripSkinning(doc) {
  for (const node of doc.getRoot().listNodes()) node.setSkin(null);
  for (const skin of doc.getRoot().listSkins()) skin.dispose();
  for (const mesh of doc.getRoot().listMeshes())
    for (const prim of mesh.listPrimitives()) {
      prim.setAttribute('JOINTS_0', null);
      prim.setAttribute('WEIGHTS_0', null);
    }
}

function triCount(doc) {
  let tris = 0;
  for (const mesh of doc.getRoot().listMeshes())
    for (const prim of mesh.listPrimitives()) {
      const idx = prim.getIndices();
      tris += Math.round((idx ? idx.getCount() : prim.getAttribute('POSITION').getCount()) / 3);
    }
  return tris;
}

(async () => {
  // ALL_EXTENSIONS so models using e.g. KHR_materials_pbrSpecularGlossiness
  // (partygoer) read/write unchanged — three.js r128 GLTFLoader supports it.
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  await MeshoptSimplifier.ready;
  const report = [];

  // Optional CLI args restrict the run (e.g. after a partial failure) —
  // re-running a model that was already optimized would compound the simplify.
  const files = process.argv.length > 2 ? process.argv.slice(2) : Object.keys(PLAN);
  for (const file of files) {
    const plan = PLAN[file];
    if (!plan) { console.warn(`no plan for ${file}, skipping`); continue; }
    const full = path.join(MODELS_DIR, file);
    const beforeBytes = fs.statSync(full).size;
    const doc = await io.read(full);
    const beforeTris = triCount(doc);

    if (plan.stripSkin) {
      const dev = bindPoseDeviation(doc);
      if (dev < 1e-3) {
        stripSkinning(doc);
        console.log(`[${file}] bind-pose deviation ${dev.toExponential(2)} → skin stripped (lossless at rest pose)`);
      } else {
        console.log(`[${file}] bind-pose deviation ${dev} too large → KEEPING skin (stripping would change the visible pose)`);
      }
    }

    await doc.transform(dedup(), weld());
    if (plan.simplifyRatio) {
      await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: plan.simplifyRatio, error: 0.01 }));
    }
    if (plan.texSize) {
      // resize only; targetFormat stays the source format (PNG/JPEG) for r128 compat
      await doc.transform(textureCompress({ encoder: sharp, resize: [plan.texSize, plan.texSize] }));
    }
    await doc.transform(prune());

    const out = await io.writeBinary(doc);
    fs.writeFileSync(full, out);
    report.push({
      file,
      'before MB': (beforeBytes / 1048576).toFixed(2),
      'after MB': (out.length / 1048576).toFixed(2),
      'before tris': beforeTris,
      'after tris': triCount(doc),
    });
  }
  console.table(report);
  const total = report.reduce((a, r) => a + parseFloat(r['after MB']), 0);
  console.log(`TOTAL downloaded models after: ${total.toFixed(2)} MB`);
})();
