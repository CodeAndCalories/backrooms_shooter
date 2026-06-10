/* ═══════════════════════════════════════════════════════════════
   NET — multiplayer connection skeleton (PHASE 1: connections ONLY)

   WebRTC peer-to-peer via PeerJS (loaded from CDN in index.html,
   using the free public PeerJS cloud broker for signaling). Star
   topology: every client connects to the host; the host relays.

   PHASE 1 SCOPE — there is NO gameplay sync. This file only:
     • hosts / joins a room by short code,
     • tracks connections in netState,
     • exchanges a test ping/pong (console-logged both sides).
   In solo play nothing here runs beyond binding two menu buttons —
   zero impact on the existing game.

   ROOM CODES: the host's PeerJS ID is derived from the code as
   NET_ID_PREFIX + code (e.g. "brfps-K7M3Q"), so a client can
   reconstruct the full peer ID from the 5 typed characters alone —
   no lookup service needed. Codes use an unambiguous alphabet
   (no 0/O, 1/I/L) — 31^5 ≈ 28.6M rooms.

   MESSAGE API (the Phase-2 seam):
     sendToAll(type, data)   — host → every connected client
     sendToHost(type, data)  — client → host
     onMessage(type, handler)— register handler(data, fromConn)
   Wire format is plain JSON: {t: type, d: data} on a reliable
   DataConnection with serialization:'json'.
   ═══════════════════════════════════════════════════════════════ */

const NET_ID_PREFIX = 'brfps-';   // namespaces our rooms on the public PeerJS broker
const NET_MAX_CLIENTS = 4;        // 5 players total (host + 4)
const NET_CODE_LEN = 5;
const NET_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O 1/I/L

const netState = {
  role: 'solo',   // 'solo' | 'host' | 'client'  — 'solo' = netcode fully inert
  peers: [],      // host: open DataConnections to clients; client: [conn to host]
  myId: null,     // our PeerJS id once the broker assigns it
  roomCode: null  // host only: the shareable code
};

let netPeer = null;          // our Peer object (null while solo)
const netHandlers = new Map(); // message type -> Set of handler(data, fromConn)

/* ── message API ── */

function onMessage(type, handler) {
  if (!netHandlers.has(type)) netHandlers.set(type, new Set());
  netHandlers.get(type).add(handler);
}

function sendToAll(type, data) {
  if (netState.role !== 'host') return;
  for (const conn of netState.peers) {
    if (conn.open) conn.send({ t: type, d: data });
  }
}

function sendToHost(type, data) {
  if (netState.role !== 'client') return;
  const conn = netState.peers[0];
  if (conn && conn.open) conn.send({ t: type, d: data });
}

// Reply on a specific connection (used by handlers, e.g. ping → pong).
function sendTo(conn, type, data) {
  if (conn && conn.open) conn.send({ t: type, d: data });
}

function netDispatch(msg, fromConn) {
  if (!msg || typeof msg.t !== 'string') return; // ignore malformed frames
  const handlers = netHandlers.get(msg.t);
  if (!handlers) { console.log(`[net] unhandled message '${msg.t}' from ${fromConn.peer}`); return; }
  for (const h of handlers) h(msg.d, fromConn);
}

/* ── connection plumbing ── */

// Shared per-connection wiring for both roles. Counts the peer, dispatches
// inbound JSON frames, and fires the Phase-1 ping test once the channel opens.
function netWireConnection(conn, label) {
  conn.on('open', () => {
    netState.peers.push(conn);
    console.log(`[net] connected to ${label} ${conn.peer} (${netState.peers.length} peer${netState.peers.length === 1 ? '' : 's'})`);
    netUiStatus();
    sendTo(conn, 'ping', { sent: Date.now() }); // both sides ping on open → proves both directions
    if (netState.role === 'host') {
      // Assign the joiner a slot (name "P<slot+1>" + color) and re-broadcast
      // the full roster so every client can label every avatar.
      if (!(conn.peer in netRoster)) netRoster[conn.peer] = netNextSlot++;
      sendToAll('roster', { slots: netRoster });
    }
  });

  conn.on('data', (msg) => netDispatch(msg, conn));

  conn.on('close', () => {
    const i = netState.peers.indexOf(conn);
    if (i !== -1) netState.peers.splice(i, 1);
    console.log(`[net] ${label} ${conn.peer} disconnected (${netState.peers.length} left)`);
    if (netState.role === 'host') {
      // Drop the leaver's avatar here and on every remaining client.
      netAvatarRemove(conn.peer);
      sendToAll('player_left', { id: conn.peer });
      // A downed player leaving may make the wipe-check true for the rest.
      netDownPeers.delete(conn.peer);
      netCheckPartyOver();
    }
    if (netState.role === 'client') {
      // Host gone → drop back to inert solo so the game behaves exactly as before.
      console.log('[net] lost host — returning to solo');
      netReset();
    }
    netUiStatus();
  });

  conn.on('error', (err) => console.warn(`[net] connection error (${conn.peer}):`, err));

  // PeerJS only emits 'close' on a GRACEFUL shutdown. A killed tab / dropped
  // network surfaces as an ICE state change instead — promote it to a close so
  // peers and avatars are cleaned up either way.
  conn.on('iceStateChanged', (state) => {
    if (state === 'failed' || state === 'closed' || state === 'disconnected') {
      console.log(`[net] ICE '${state}' for ${conn.peer} — closing connection`);
      conn.close();
    }
  });
}

function netRandomCode() {
  let code = '';
  for (let i = 0; i < NET_CODE_LEN; i++) {
    code += NET_CODE_ALPHABET[Math.floor(Math.random() * NET_CODE_ALPHABET.length)];
  }
  return code;
}

function netReset() {
  if (netPeer) { netPeer.destroy(); netPeer = null; }
  netState.role = 'solo';
  netState.peers = [];
  netState.myId = null;
  netState.roomCode = null;
  // Phase-2 state: drop all remote avatars + roster; back to a fully inert solo.
  netAvatarsClear();
  netRoster = {};
  netNextSlot = 1;
  netPendingStart = null;
  // Phase-3 state: drop all enemy/boss/projectile mirrors (client side).
  netOnSceneTeardown();
  // Phase-4 state: back to solo rules — no down state, no downed overlay.
  netDownPeers.clear();
  if (typeof player !== 'undefined') { player.isDown = false; player.reviveProgress = 0; }
  netShowDownedMsg(false);
}

/* ── host / join ── */

function hostGame() {
  if (typeof Peer === 'undefined') { netUiStatus('PeerJS failed to load — check connection'); return; }
  netReset();
  const code = netRandomCode();
  netUiStatus('Creating room…');

  // Claim the code-derived ID on the broker. If it's somehow taken
  // ('unavailable-id'), the error handler below rerolls a fresh code.
  const peer = new Peer(NET_ID_PREFIX + code);
  netPeer = peer;

  peer.on('open', (id) => {
    netState.role = 'host';
    netState.myId = id;
    netState.roomCode = code;
    netRoster[id] = 0; // the host is always slot 0 ("P1", gold)
    console.log(`[net] hosting room ${code} (peer id ${id})`);
    netUiShowCode(code);
  });

  peer.on('connection', (conn) => {
    if (netState.peers.length >= NET_MAX_CLIENTS) {
      console.log(`[net] rejecting ${conn.peer} — room full (${NET_MAX_CLIENTS} clients max)`);
      conn.on('open', () => { sendTo(conn, 'room_full', {}); conn.close(); });
      return;
    }
    netWireConnection(conn, 'client');
  });

  peer.on('error', (err) => {
    if (err.type === 'unavailable-id') { console.log(`[net] room code ${code} taken, rerolling`); hostGame(); return; }
    console.warn('[net] peer error:', err.type, err);
    netUiStatus('Error: ' + err.type);
  });

  peer.on('disconnected', () => console.log('[net] lost signaling broker (existing connections unaffected)'));
}

function joinGame(code) {
  if (typeof Peer === 'undefined') { netUiStatus('PeerJS failed to load — check connection'); return; }
  code = (code || '').toUpperCase().replace(/[^A-Z2-9]/g, '');
  if (code.length !== NET_CODE_LEN) { netUiStatus(`Enter the ${NET_CODE_LEN}-character room code`); return; }
  netReset();
  netUiStatus(`Joining ${code}…`);

  const peer = new Peer(); // broker assigns the client a random ID
  netPeer = peer;

  peer.on('open', (id) => {
    netState.role = 'client';
    netState.myId = id;
    console.log(`[net] joining room ${code} as ${id}`);
    // Reliable + JSON: the wire format for ALL game traffic (see header).
    const conn = peer.connect(NET_ID_PREFIX + code, { reliable: true, serialization: 'json' });
    netWireConnection(conn, 'host');
  });

  peer.on('error', (err) => {
    console.warn('[net] peer error:', err.type, err);
    netReset(); // back to inert solo; the status line below keeps the reason visible
    if (err.type === 'peer-unavailable') netUiStatus('Room not found — check the code');
    else netUiStatus('Error: ' + err.type);
  });
}

/* ── Phase-1 test protocol: ping/pong, both directions ── */

onMessage('ping', (d, fromConn) => {
  console.log(`[net] ping from ${fromConn.peer}`);
  sendTo(fromConn, 'pong', { sent: d && d.sent });
});

onMessage('pong', (d, fromConn) => {
  const rtt = d && d.sent ? `${Date.now() - d.sent}ms round-trip` : 'no timestamp';
  console.log(`[net] pong from ${fromConn.peer} — ${rtt}`);
});

onMessage('room_full', () => {
  console.log('[net] room is full (5 players max)');
  netUiStatus('Room full (5 players max)');
  netReset();
});

/* ═══════════════════════════════════════════════════════════════
   PHASE 2 — SHARED WORLD + POSITION SYNC
   Scope: host broadcasts 'game_start' {floor, seed}; everyone runs
   the same deterministic seedFloor + generation path → identical
   maze. Each player streams {x,y,z,yaw} at ~15Hz ('pos'); the host
   relays each client's stream (plus its own) to the other clients.
   Remote players render as colored capsules with a name label.
   NOT synced yet (Phase 3): enemies, damage, floor advancement —
   per-player enemies will visibly desync; that's expected.

   Message flow:
     client --pos {x,y,z,yaw}-----------------> host
     host   --pos {id, x,y,z,yaw}------------> every client   (own + relayed)
     host   --game_start {floor, seed}-------> every client   (on Noclip In)
     host   --roster {slots:{peerId:slot}}---> every client   (on each join)
     host   --player_left {id}---------------> every client   (on a disconnect)
   ═══════════════════════════════════════════════════════════════ */

const NET_POS_HZ = 15;            // position send rate
const NET_AVATAR_LERP = 0.1;      // remote avatar smoothing: ~10% of the gap per frame
const NET_EYE_HEIGHT = 1.6;       // player.pos.y is EYE height; avatar group origin is at the feet
const NET_PLAYER_COLORS = [0xd4c36a, 0x44aaff, 0xff6644, 0x44ff88, 0xff44ff]; // by slot; 0 = host

let netRoster = {};               // peerId -> slot (host-assigned by join order; host = 0)
let netNextSlot = 1;              // host-side slot allocator
const netAvatars = new Map();     // peerId -> { id, group, builtSlot, target:{x,y,z,yaw} }
let netPosAccum = 0;              // send-rate accumulator (netUpdate)
let netPendingStart = null;       // client: game_start received while still loading models
let netStartingFromHost = false;  // lets the host-driven startGame() through netGateStart

/* ── game start (shared world) ── */

// Called by startGame() (main.js) right after seedFloor(): the host announces
// the run so every client generates the IDENTICAL level.
function netOnHostStart(floor, seed) {
  if (netState.role !== 'host') return;
  sendToAll('game_start', { floor, seed });
  console.log(`[net] game_start broadcast (floor ${floor}, seed ${seed})`);
}

// Called at the top of startGame(): a connected client never starts its own
// solo run — the host's game_start drives it. Returns true to block the start.
function netGateStart() {
  if (netState.role !== 'client' || netStartingFromHost) return false;
  console.log('[net] waiting for host to start the game');
  netUiStatus('Connected — waiting for host to start');
  return true;
}

onMessage('game_start', (d) => {
  if (netState.role !== 'client' || !d) return;
  console.log(`[net] game_start received (floor ${d.floor}, seed ${d.seed})`);
  if (gameState === 'playing') {
    // Mid-run: the host advanced floors — rebuild in place (Phase-3 interim:
    // floor transitions are host-triggered only).
    netClientLoadFloor(d.floor, d.seed);
  } else {
    netPendingStart = d;
    netTryStart(); // may defer until modelsReady (retried from netUpdate)
  }
});

function netTryStart() {
  if (!netPendingStart || netState.role !== 'client') return;
  if (typeof modelsReady !== 'undefined' && !modelsReady) return; // loading screen still up
  const d = netPendingStart;
  netPendingStart = null;
  selectedStartFloor = d.floor;
  netStartingFromHost = true;
  startGame();
  netStartingFromHost = false;
  // seedFloor(floor) is deterministic, so this only fires on a version mismatch
  if (typeof floorSeed !== 'undefined' && floorSeed !== d.seed) {
    console.warn(`[net] SEED MISMATCH: host ${d.seed} vs local ${floorSeed} — game versions differ?`);
  }
}

/* ── roster (host-assigned slots → names "P1..P5" + colors) ── */

onMessage('roster', (d) => {
  if (netState.role !== 'client' || !d) return;
  netRoster = d.slots || {};
  console.log('[net] roster:', JSON.stringify(netRoster));
  // If an avatar was built before its slot was known, rebuild it with the
  // right color/name on its next pos update.
  for (const av of netAvatars.values()) {
    if (av.group && av.builtSlot !== netSlotOf(av.id)) netAvatarDisposeGroup(av);
  }
});

function netSlotOf(id) { return netRoster[id] !== undefined ? netRoster[id] : 0; }

/* ── position stream ── */

// Per-frame driver, called from animate() in main.js. In solo this falls
// through both branches immediately — zero impact.
function netUpdate(dt) {
  if (netPendingStart) netTryStart();
  if (netState.role === 'solo') return;

  netUpdateDownState(dt); // down/revive progress (no-op unless this player is down)

  // Outbound: my eye position + yaw at NET_POS_HZ while actually playing.
  if (gameState === 'playing') {
    netPosAccum += dt;
    if (netPosAccum >= 1 / NET_POS_HZ) {
      netPosAccum = 0;
      const p = { x: player.pos.x, y: player.pos.y, z: player.pos.z, yaw: player.yaw };
      if (netState.role === 'host') { p.id = netState.myId; sendToAll('pos', p); }
      else sendToHost('pos', p);
    }

    // Host: authoritative enemy snapshot at NET_SNAPSHOT_HZ (Phase 3).
    if (netState.role === 'host' && netState.peers.length > 0) {
      netSnapAccum += dt;
      if (netSnapAccum >= 1 / NET_SNAPSHOT_HZ) {
        netSnapAccum = 0;
        sendToAll('enemies', netBuildSnapshot());
      }
    }
  }

  // Inbound smoothing: lerp every remote avatar toward its latest target
  // (~10%/frame) instead of teleporting on each 15Hz packet.
  for (const av of netAvatars.values()) {
    if (!av.group) continue;
    const g = av.group;
    g.position.x += (av.target.x - g.position.x) * NET_AVATAR_LERP;
    g.position.y += ((av.target.y - NET_EYE_HEIGHT) - g.position.y) * NET_AVATAR_LERP;
    g.position.z += (av.target.z - g.position.z) * NET_AVATAR_LERP;
    let dyaw = av.target.yaw - g.rotation.y;                  // shortest-arc yaw lerp
    dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
    g.rotation.y += dyaw * NET_AVATAR_LERP;
  }
}

onMessage('pos', (d, fromConn) => {
  if (!d) return;
  if (netState.role === 'host') {
    // Client → host: show it here, then relay (tagged with the sender's id)
    // to every OTHER client so all peers see all players.
    netAvatarUpdate(fromConn.peer, d);
    for (const conn of netState.peers) {
      if (conn !== fromConn && conn.open) {
        conn.send({ t: 'pos', d: { id: fromConn.peer, x: d.x, y: d.y, z: d.z, yaw: d.yaw } });
      }
    }
  } else if (netState.role === 'client') {
    if (d.id && d.id !== netState.myId) netAvatarUpdate(d.id, d);
  }
});

onMessage('player_left', (d) => {
  if (netState.role === 'client' && d && d.id) netAvatarRemove(d.id);
});

/* ── remote avatars ── */

function netAvatarUpdate(id, p) {
  let av = netAvatars.get(id);
  if (!av) {
    av = { id, group: null, builtSlot: -1, target: { x: p.x, y: p.y, z: p.z, yaw: p.yaw || 0 } };
    netAvatars.set(id, av);
  }
  av.target.x = p.x; av.target.y = p.y; av.target.z = p.z; av.target.yaw = p.yaw || 0;
  // Built lazily so a pos arriving between floors just waits for the new scene.
  if (!av.group && typeof scene !== 'undefined' && scene) netAvatarBuild(av);
}

// Simple capsule: cylinder body + sphere head (+ dark visor showing facing),
// distinct color per slot. Deliberately NO PointLight (fixed light budget) and
// no new shader families: untextured MeshStandardMaterial is pinned by
// ammoPickupMat, the label's map+transparent SpriteMaterial by the keepalives.
function netAvatarBuild(av) {
  const slot = netSlotOf(av.id);
  const color = NET_PLAYER_COLORS[slot % NET_PLAYER_COLORS.length];

  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: 0.35, roughness: 0.6
  });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 1.1, 10), bodyMat);
  body.position.y = 0.85;
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 10), bodyMat);
  head.position.y = 1.52;
  group.add(head);
  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.06, 0.08),
    new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2 })
  );
  visor.position.set(0, 1.55, -0.16); // -z = look direction at yaw 0, matching the camera
  group.add(visor);

  const label = netMakeNameLabel('P' + (slot + 1));
  label.position.y = 2.0;
  group.add(label);

  group.position.set(av.target.x, av.target.y - NET_EYE_HEIGHT, av.target.z); // snap on (re)build
  group.rotation.y = av.target.yaw;
  scene.add(group);
  av.group = group;
  av.builtSlot = slot;
  // Down/revive (Phase 4): keep refs for the dark-red "down" tint, and re-apply
  // it if this avatar was rebuilt (e.g. new floor) while its player is down.
  av.bodyMat = bodyMat;
  av.baseColor = color;
  if (av.down) netSetAvatarDown(av.id, true);
}

// Camera-facing name tag — same canvas-text approach as the dev debug labels,
// but always on in co-op. depthTest:false keeps it readable through walls.
function netMakeNameLabel(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 34px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#000000';
  ctx.strokeText(text, 128, 32);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, 128, 32);
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.9, 0.22, 1);
  sprite.renderOrder = 999;
  return sprite;
}

// Dispose one avatar's meshes (label texture included) and detach from the
// scene, keeping the record so the next pos packet can rebuild it.
function netAvatarDisposeGroup(av) {
  if (!av.group) return;
  av.group.traverse(o => {
    if (o.geometry && !o.isSprite) o.geometry.dispose();
    if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
  });
  scene.remove(av.group);
  av.group = null;
}

function netAvatarRemove(id) {
  const av = netAvatars.get(id);
  if (!av) return;
  netAvatarDisposeGroup(av);
  netAvatars.delete(id);
  console.log(`[net] removed avatar for ${id}`);
}

function netAvatarsClear() {
  for (const id of [...netAvatars.keys()]) netAvatarRemove(id);
}

// Called at the end of buildMazeScene (main.js): the floor teardown already
// disposed every avatar mesh along with the old world, so just drop the dead
// references — the next pos from each player rebuilds them in the new scene.
// A new floor also REVIVES everyone (down state doesn't carry across floors).
function netOnSceneRebuilt() {
  for (const av of netAvatars.values()) { av.group = null; av.bodyMat = null; av.down = false; }
  netDownPeers.clear();
  player.isDown = false;
  player.reviveProgress = 0;
  netShowDownedMsg(false);
  netExitReqT = -10;
}

/* ═══════════════════════════════════════════════════════════════
   PHASE 3 — HOST-AUTHORITATIVE ENEMIES
   The HOST is the only machine simulating enemies/bosses (solo runs
   the same code as always). Clients render mirrors of what the host
   broadcasts and send their shots to the host for resolution.

   Message flow (on top of Phase 1/2):
     host   --enemies {w,e,b,p}---> clients   10Hz snapshot (below)
     client --shoot {ox..dz}------> host      host raycasts + applies damage
     host   --damaged {a,x,z}-----> one client enemy hit THAT player

   Snapshot format ('enemies', compact arrays, living things only):
     w: currentWave                                  (client HUD)
     e: [ [id, typeIdx, x, z, hp, maxHp], ... ]      per living enemy
     b: [hp, maxHp, phase, x, z]                     only while a boss is alive
     p: [ [x, z], ... ]                              boss projectiles (y is fixed)
   A mirrored id missing from a snapshot = that enemy died → client
   plays the death animation. hp drop between snapshots = hit flash.
   ═══════════════════════════════════════════════════════════════ */

const NET_SNAPSHOT_HZ = 10;
// Wire-format type indices — order must match on every game version.
const NET_TYPE_LIST = ['stalker', 'crawler', 'phantom', 'danger_stalker', 'danger_crawler', 'spider', 'partygoer'];
const netR2 = (v) => Math.round(v * 100) / 100; // 2-decimal wire rounding

let netEnemyIdCounter = 0;     // host: stable per-spawn enemy ids (spawnEnemy)
let netSnapAccum = 0;          // host: snapshot send-rate accumulator
const netMobs = new Map();     // client: id -> mirror { id, type, mesh, scale, tx, tz, hp, maxHp, flashT, dying, deathT }
let netBossMirror = null;      // client: { mesh, height, hp, maxHp, tx, tz, flashT, dying, deathT }
let netProjMirrors = [];       // client: [{ mesh, light, tx, tz, fresh }]

function netIsClient() { return netState.role === 'client'; }

/* ── host-side targeting helpers (also the SOLO path: 1-entry list) ── */

// Every player the host knows: itself + each connected client (positions come
// from the Phase-2 pos stream via netAvatars). conn === null means "the local
// player" — netDealDamage uses that to pick damagePlayer vs a 'damaged' message.
function netAllPlayers() {
  const list = [];
  // DOWNED players are invisible to enemy AI (no chasing/attacking a body).
  // Solo: player.isDown is always false, so this is the same 1-entry list.
  if (!player.isDown) list.push({ x: player.pos.x, y: player.pos.y, z: player.pos.z, yaw: player.yaw, conn: null });
  if (netState.role === 'host') {
    for (const conn of netState.peers) {
      const av = netAvatars.get(conn.peer);
      if (av && conn.open && !netDownPeers.has(conn.peer)) {
        list.push({ x: av.target.x, y: av.target.y, z: av.target.z, yaw: av.target.yaw, conn });
      }
    }
  }
  // Everyone down (party-over is imminent) — return the local player so the
  // AI callers always have a target to do math against.
  if (list.length === 0) list.push({ x: player.pos.x, y: player.pos.y, z: player.pos.z, yaw: player.yaw, conn: null });
  return list;
}

function netNearestOf(players, x, z) {
  let best = players[0], bestD2 = Infinity;
  for (const pl of players) {
    const dx = pl.x - x, dz = pl.z - z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD2) { bestD2 = d2; best = pl; }
  }
  return best;
}

// Host: route enemy damage to whichever player got hit. Local target → the
// existing damagePlayer; remote target → 'damaged' message, applied by that
// client via ITS damagePlayer (vignette, directional indicator, death).
function netDealDamage(tgt, amount, fromPos) {
  if (tgt && tgt.conn) {
    sendTo(tgt.conn, 'damaged', { a: Math.round(amount * 10) / 10, x: netR2(fromPos.x), z: netR2(fromPos.z) });
  } else {
    damagePlayer(amount, fromPos);
  }
}

onMessage('damaged', (d) => {
  if (netIsClient() && gameState === 'playing' && d) damagePlayer(d.a, { x: d.x, z: d.z });
});

/* ── client shooting → host resolution ── */

function netSendShoot(origin, dir) {
  sendToHost('shoot', {
    ox: netR2(origin.x), oy: netR2(origin.y), oz: netR2(origin.z),
    dx: Math.round(dir.x * 1000) / 1000, dy: Math.round(dir.y * 1000) / 1000, dz: Math.round(dir.z * 1000) / 1000,
    m: shopStats.damageMult // this client's shop damage multiplier (client-trusted; fine for friend co-op)
  });
}

onMessage('shoot', (d, fromConn) => {
  // main.js — host's authoritative raycast; fromConn = who fired (kill credit)
  if (netState.role === 'host' && gameState === 'playing' && d) netResolveRemoteShot(d, fromConn);
});

/* ── host snapshot broadcast (called from netUpdate) ── */

function netBuildSnapshot() {
  const snap = { w: currentWave, k: floorKills, e: [] };
  for (const e of enemies) {
    if (!e.alive) continue; // dying mobs are clients' business once the id vanishes
    snap.e.push([e.id, NET_TYPE_LIST.indexOf(e.type), netR2(e.pos.x), netR2(e.pos.z), Math.ceil(e.hp), Math.ceil(e.maxHp)]);
  }
  if (bossEntity && bossEntity.alive) {
    snap.b = [Math.ceil(bossEntity.hp), Math.ceil(bossEntity.maxHp), bossEntity.currentPhase, netR2(bossEntity.pos.x), netR2(bossEntity.pos.z)];
    snap.p = bossProjectiles.map(pr => [netR2(pr.pos.x), netR2(pr.pos.z)]);
  }
  return snap;
}

/* ── client mirror: snapshot reception ── */

onMessage('enemies', (snap) => {
  if (!netIsClient() || !snap || gameState !== 'playing') return;
  if (typeof snap.w === 'number') currentWave = snap.w; // wave readout on the client HUD
  if (typeof snap.k === 'number') floorKills = snap.k;  // party kill-gate progress (HUD + exit check)

  const seen = new Set();
  for (const t of (snap.e || [])) {
    const [id, ti, x, z, hp, maxHp] = t;
    seen.add(id);
    let m = netMobs.get(id);
    if (!m) m = netMobSpawn(id, NET_TYPE_LIST[ti], x, z, hp, maxHp);
    if (!m) continue;
    m.tx = x; m.tz = z;
    if (hp < m.hp) { m.flashT = 0.15; setMobFlash(m, true); } // hp dropped → someone hit it
    m.hp = hp; m.maxHp = maxHp;
  }
  // Mirrored id no longer in the snapshot → it died on the host.
  for (const m of netMobs.values()) {
    if (!seen.has(m.id) && !m.dying) { m.dying = true; m.deathT = 0; playEnemyDeath(); }
  }

  netBossSnapshot(snap.b || null, snap.p || []);
});

// Spawn a VISUAL-ONLY mirror via the same buildMobModel seam real spawns use.
// No AI fields — the host owns behavior; this thing only gets moved and killed.
function netMobSpawn(id, type, x, z, hp, maxHp) {
  const mt = MOB_TYPES[type];
  if (!mt || typeof scene === 'undefined' || !scene) return null;
  const mesh = buildMobModel(type, mt.scale);
  const sH = mt.scale * 2.5;
  mesh.position.set(x, mesh.isGroup ? 0 : sH / 2, z);
  scene.add(mesh);
  const m = { id, type, mesh, scale: mt.scale, tx: x, tz: z, hp, maxHp, flashT: 0, dying: false, deathT: 0 };
  netMobs.set(id, m);
  return m;
}

/* ── client mirror: boss + projectiles ── */

function netBossSnapshot(b, projs) {
  if (b) {
    if (!netBossMirror) netBossMirrorBuild(b);
    const m = netBossMirror;
    if (m) {
      if (b[0] < m.hp) { m.flashT = 0.12; m.mesh.material.color.setHex(0xff0000); }
      m.hp = b[0]; m.maxHp = b[1]; m.tx = b[3]; m.tz = b[4];
      document.getElementById('bossHpFill').style.width = (m.hp / m.maxHp * 100) + '%';
    }
  } else if (netBossMirror && !netBossMirror.dying) {
    netBossMirror.dying = true;
    netBossMirror.deathT = 0;
    document.getElementById('bossHpContainer').style.opacity = '0';
    playBossRoar();
  }

  // Projectile mirrors reconcile by INDEX (transient, fast, visually fine).
  while (netProjMirrors.length < projs.length) netProjMirrorAdd();
  while (netProjMirrors.length > projs.length) netProjMirrorRemove();
  for (let i = 0; i < projs.length; i++) {
    const pr = netProjMirrors[i];
    pr.tx = projs[i][0]; pr.tz = projs[i][1];
    if (pr.fresh) { pr.mesh.position.set(pr.tx, 1.5, pr.tz); pr.fresh = false; } // snap on first sighting
  }
}

// Visual twin of spawnBoss's sprite (spawnBoss itself is host-gated).
function netBossMirrorBuild(b) {
  if (typeof scene === 'undefined' || !scene) return;
  const theme = getTheme(currentFloor);
  if (!theme.isBoss) return; // we haven't loaded the boss floor yet — next snapshot retries
  const bh = 2.0 * theme.bossScale;
  const tex = spriteTextures[theme.bossTex || 'boss_warden'];
  const mat = new THREE.SpriteMaterial({ map: tex, color: 0xffffff, transparent: true, alphaTest: 0.1, depthWrite: false });
  const mesh = new THREE.Sprite(mat);
  mesh.scale.set(bh, bh, 1);
  mesh.position.set(b[3], bh / 2, b[4]);
  scene.add(mesh);
  netBossMirror = { mesh, height: bh, hp: b[0], maxHp: b[1], tx: b[3], tz: b[4], flashT: 0, dying: false, deathT: 0 };
  document.getElementById('bossHpName').textContent = theme.bossName;
  document.getElementById('bossHpContainer').style.opacity = '1';
  if (bossLight) bossLight.intensity = 0.6; // persistent slot — same glow as the host sees
  playBossRoar();
}

function netProjMirrorAdd() {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.25, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xff4400, emissive: 0xff2200, emissiveIntensity: 2.0, roughness: 0.3 })
  );
  scene.add(mesh);
  const light = bossProjLights.find(l => l.intensity === 0) || null; // persistent pool, same as the host
  if (light) light.intensity = 0.5;
  netProjMirrors.push({ mesh, light, tx: 0, tz: 0, fresh: true });
}

function netProjMirrorRemove() {
  const pr = netProjMirrors.pop();
  if (!pr) return;
  pr.mesh.geometry.dispose(); pr.mesh.material.dispose();
  scene.remove(pr.mesh);
  if (pr.light) { pr.light.intensity = 0; pr.light.position.set(0, -100, 0); }
}

/* ── client mirror: per-frame animation (replaces updateEnemies & co.) ── */

function netClientUpdate(dt) {
  const t = clock.getElapsedTime();
  // Everyone this client can see, for mob FACING (computed locally per frame —
  // cheap, and "face whoever is closest" looks right without syncing rotation).
  const ppl = [{ x: player.pos.x, z: player.pos.z }];
  for (const av of netAvatars.values()) {
    if (av.group) ppl.push({ x: av.group.position.x, z: av.group.position.z });
  }

  for (const m of netMobs.values()) {
    if (m.dying) {
      // Same fade/squash the host plays in updateEnemies' death branch.
      m.deathT += dt;
      const fade = Math.max(0, 1 - m.deathT * 2.5);
      const squashY = Math.max(0.01, 1 - m.deathT * 3);
      if (m.mesh.isGroup) {
        m.mesh.traverse(o => { if (o.material) { o.material.transparent = true; o.material.opacity = fade; } });
        m.mesh.scale.y = WIRE_VISUAL_SCALE * squashY;
        m.mesh.position.y = 0;
      } else {
        m.mesh.material.opacity = fade;
        m.mesh.material.transparent = true;
        m.mesh.scale.y = squashY;
        m.mesh.position.y = (m.scale * 2.5) / 2 * squashY;
      }
      if (m.deathT > 0.7) { disposeMobVisual(m.mesh); scene.remove(m.mesh); netMobs.delete(m.id); }
      continue;
    }

    if (m.flashT > 0) { m.flashT -= dt; if (m.flashT <= 0) setMobFlash(m, false); }

    // Lerp toward the latest snapshot (like player avatars), then re-apply the
    // exact y/bob/facing presentation rules from updateEnemies.
    m.mesh.position.x += (m.tx - m.mesh.position.x) * NET_AVATAR_LERP;
    m.mesh.position.z += (m.tz - m.mesh.position.z) * NET_AVATAR_LERP;
    if (m.mesh.isGroup) {
      if (m.mesh.userData.float !== undefined) {
        m.mesh.position.y = m.mesh.userData.float + Math.sin(t * 2 + m.tx) * 0.18;
      } else {
        m.mesh.position.y = 0.05 + Math.sin(t * 14) * 0.05;
      }
      if (m.mesh.userData.isModel) {
        const near = netNearestOf(ppl, m.mesh.position.x, m.mesh.position.z);
        m.mesh.rotation.y = Math.atan2(near.x - m.mesh.position.x, near.z - m.mesh.position.z) + (m.mesh.userData.faceOffset || 0);
      }
    } else {
      let yPos = (m.scale * 2.5) / 2;
      if (m.type === 'phantom') yPos += Math.sin(Date.now() * 0.003 + m.mesh.position.x) * 0.4;
      m.mesh.position.y = yPos;
    }
  }

  // Boss mirror
  if (netBossMirror) {
    const m = netBossMirror;
    if (m.dying) {
      // same collapse as the host's boss deathAnim
      m.deathT += dt;
      m.mesh.material.opacity = Math.max(0, 1 - m.deathT * 1.5);
      m.mesh.material.transparent = true;
      const squash = Math.max(0.01, 1 - m.deathT * 2);
      m.mesh.scale.y = m.height * squash;
      m.mesh.position.y = m.height / 2 * squash;
      if (bossLight) { bossLight.intensity = 0; bossLight.position.set(0, -100, 0); }
      if (m.deathT >= 1) { disposeMobVisual(m.mesh); scene.remove(m.mesh); netBossMirror = null; }
    } else {
      if (m.flashT > 0) { m.flashT -= dt; if (m.flashT <= 0) m.mesh.material.color.setHex(0xffffff); }
      m.mesh.position.x += (m.tx - m.mesh.position.x) * NET_AVATAR_LERP;
      m.mesh.position.z += (m.tz - m.mesh.position.z) * NET_AVATAR_LERP;
      m.mesh.position.y = m.height / 2;
      if (bossLight) bossLight.position.set(m.mesh.position.x, m.height / 2, m.mesh.position.z);
    }
  }

  // Projectile mirrors (faster lerp — they fly quick)
  for (const pr of netProjMirrors) {
    pr.mesh.position.x += (pr.tx - pr.mesh.position.x) * 0.25;
    pr.mesh.position.z += (pr.tz - pr.mesh.position.z) * 0.25;
    pr.mesh.position.y = 1.5;
    pr.mesh.rotation.x += dt * 8;
    pr.mesh.rotation.z += dt * 6;
    if (pr.light) pr.light.position.copy(pr.mesh.position);
  }
}

/* ── mirror cleanup ── */

// Dispose every client-side mirror PROPERLY (disposeMobVisual guards shared GLB
// geometry). Called from buildMazeScene's teardown BEFORE its scene.traverse —
// if the traverse got to a model mirror first it would dispose the SHARED model
// geometry and break every future spawn of that mob type.
function netOnSceneTeardown() {
  if (typeof scene === 'undefined' || !scene) return;
  for (const m of netMobs.values()) { disposeMobVisual(m.mesh); scene.remove(m.mesh); }
  netMobs.clear();
  if (netBossMirror) { disposeMobVisual(netBossMirror.mesh); scene.remove(netBossMirror.mesh); netBossMirror = null; }
  while (netProjMirrors.length > 0) netProjMirrorRemove();
}

// Host advanced floors mid-run → rebuild this client on the same floor, with
// the same between-floor bonuses advanceFloor grants the host. Interim Phase-3
// behavior: floor advance is host-triggered only.
function netClientLoadFloor(floor, seed) {
  console.log(`[net] host advanced to floor ${floor} — rebuilding`);
  currentFloor = floor;
  currentWave = 1;
  player.floorReached = currentFloor;
  player.health = Math.min(shopStats.maxHealth, player.health + 35);
  player.reserveAmmo = Math.min(shopStats.reserveMax, player.reserveAmmo + shopStats.clipSize * 3);
  generateCurrentFloor();
  buildMazeScene(); // its teardown clears all mirrors via netOnSceneTeardown
  updateHUD();
  showFloorAnnounce();
  if (typeof floorSeed !== 'undefined' && floorSeed !== seed) {
    console.warn(`[net] SEED MISMATCH on floor ${floor}: host ${seed} vs local ${floorSeed}`);
  }
}

/* ═══════════════════════════════════════════════════════════════
   PHASE 4 — SHARED PROGRESSION + DOWN/REVIVE
   Adds to the protocol:
     host   --reward {money,kills}---> one/all   kill credit to the killer;
                                                 floor-clear/boss pay to all
     any    --pickup_taken {id}-----> relayed    grabbed ammo vanishes everywhere
     host   --pickup_spawn {id,x,z}-> clients    authoritative kill-drops
     client --exit_reached----------> host       kill-gated advance, any player
     client --down / revived--------> host       down-state bookkeeping
     host   --down_state {id,down}--> clients    avatar tint + revive eligibility
     host   --party_over------------> clients    everyone down → wipe
   The 'enemies' snapshot gains `k` = party kills this floor (kill-gate HUD).
   ═══════════════════════════════════════════════════════════════ */

const NET_REVIVE_RANGE = 2.5; // m — teammate must stand this close to revive
const NET_REVIVE_TIME = 3.0;  // s of continuous proximity
const netDownPeers = new Set(); // host: peer ids currently down (host's own state = player.isDown)

/* ── rewards (money/kills are PER PLAYER; the fight is shared) ── */

// Host: pay every connected client (host pays itself at the call site).
function netRewardAll(money, kills) {
  if (netState.role === 'host') sendToAll('reward', { money, kills });
}

onMessage('reward', (d) => {
  if (!netIsClient() || !d) return;
  playerMoney += d.money || 0;
  player.kills += d.kills || 0;
  updateHUD();
});

/* ── kill-gated exit ── */

// Solo: always open (unchanged solo behavior). Boss floors: the boss IS the
// gate (the exit only exists after it dies). Co-op normal floors: the party's
// combined kills must reach killTarget (host counts; clients mirror via snap.k).
function netExitGateOpen() {
  if (netState.role === 'solo') return true;
  if (getTheme(currentFloor).isBoss) return true;
  return floorKills >= killTarget;
}

// Post-boss exit (the one createBossExit spawns on the host when its boss
// dies). Clients rebuild it locally from the same grid-deterministic function;
// the broadcast x/z only sanity-checks that both machines agree on the spot.
function netBroadcastBossExit(x, z) {
  if (netState.role === 'host') sendToAll('boss_exit', { x: netR2(x), z: netR2(z) });
}

onMessage('boss_exit', (d) => {
  if (!netIsClient() || !d || gameState !== 'playing' || exitZone) return;
  createBossExit(); // enemies.js — same deterministic zone + visuals as the host
  if (exitZone && (Math.abs(exitZone.x - d.x) > 1 || Math.abs(exitZone.z - d.z) > 1)) {
    console.warn(`[net] boss exit mismatch: host (${d.x},${d.z}) vs local (${exitZone.x},${exitZone.z}) — grids differ?`);
  }
  console.log('[net] boss down — exit is open');
});

let netExitReqT = -10;
function netRequestAdvance() {
  const now = clock.getElapsedTime();
  if (now - netExitReqT < 1) return; // standing in the exit → don't spam
  netExitReqT = now;
  sendToHost('exit_reached', {});
}

onMessage('exit_reached', () => {
  if (netState.role !== 'host' || gameState !== 'playing') return;
  if (!exitZone || !netExitGateOpen()) return; // host re-validates the gate
  console.log('[net] a client reached the exit — advancing the party');
  advanceFloor();
});

/* ── ammo pickup sync ── */

function netAnnouncePickupTaken(id) {
  if (netState.role === 'solo' || id === undefined) return;
  if (netState.role === 'host') sendToAll('pickup_taken', { id });
  else sendToHost('pickup_taken', { id });
}

onMessage('pickup_taken', (d, fromConn) => {
  if (netState.role === 'solo' || !d) return;
  removeAmmoPickupById(d.id); // main.js — removes mesh + entry, grants nothing
  if (netState.role === 'host') {
    // relay so the OTHER clients lose it too
    for (const conn of netState.peers) {
      if (conn !== fromConn && conn.open) conn.send({ t: 'pickup_taken', d: { id: d.id } });
    }
  }
});

// Kill-drop pickups are host-authoritative (applyEnemyHit rolls the dice).
function netBroadcastPickupSpawn(id, x, z) {
  if (netState.role === 'host') sendToAll('pickup_spawn', { id, x: netR2(x), z: netR2(z) });
}

onMessage('pickup_spawn', (d) => {
  if (netIsClient() && d && gameState === 'playing') createAmmoPickup(d.x, d.z, d.id);
});

/* ── minimap blip sources (host/solo: real lists; client: mirrors) ── */

function netMinimapBlips() {
  const out = [];
  if (netIsClient()) {
    for (const m of netMobs.values()) if (!m.dying) out.push(m.mesh.position);
  } else {
    for (const e of enemies) if (e.alive) out.push(e.pos);
  }
  return out;
}

function netMinimapBoss() {
  if (netIsClient()) return (netBossMirror && !netBossMirror.dying) ? netBossMirror.mesh.position : null;
  return (bossEntity && bossEntity.alive) ? bossEntity.pos : null;
}

/* ── down / revive / party wipe (co-op only — damagePlayer routes here) ── */

function netGoDown() {
  if (player.isDown) return;
  player.isDown = true;
  player.reviveProgress = 0;
  player.isADS = false;
  console.log('[net] you are DOWN — a teammate can revive you');
  netShowDownedMsg(true, 0);
  if (netState.role === 'host') {
    sendToAll('down_state', { id: netState.myId, down: true });
    netCheckPartyOver();
  } else {
    sendToHost('down', {});
  }
}

function netRevive() {
  player.isDown = false;
  player.reviveProgress = 0;
  player.health = Math.ceil(shopStats.maxHealth * 0.5); // back up at half HP
  netShowDownedMsg(false);
  updateHUD();
  console.log('[net] revived!');
  if (netState.role === 'host') sendToAll('down_state', { id: netState.myId, down: false });
  else sendToHost('revived', {});
}

onMessage('down', (d, fromConn) => {
  if (netState.role !== 'host') return;
  console.log(`[net] ${fromConn.peer} is down`);
  netDownPeers.add(fromConn.peer);
  netSetAvatarDown(fromConn.peer, true);
  sendToAll('down_state', { id: fromConn.peer, down: true });
  netCheckPartyOver();
});

onMessage('revived', (d, fromConn) => {
  if (netState.role !== 'host') return;
  console.log(`[net] ${fromConn.peer} was revived`);
  netDownPeers.delete(fromConn.peer);
  netSetAvatarDown(fromConn.peer, false);
  sendToAll('down_state', { id: fromConn.peer, down: false });
});

// Clients learn everyone's down state for avatar tint + "can they revive me".
onMessage('down_state', (d) => {
  if (!netIsClient() || !d) return;
  netSetAvatarDown(d.id, d.down);
});

function netSetAvatarDown(id, down) {
  const av = netAvatars.get(id);
  if (!av) return;
  av.down = !!down;
  if (av.bodyMat) { // dark-red tint while down
    av.bodyMat.color.setHex(down ? 0x551515 : av.baseColor);
    av.bodyMat.emissive.setHex(down ? 0x551515 : av.baseColor);
  }
}

// Host: every player down at once = party wipe. Host machine keeps simulating
// while ITS player is down (gameState stays 'playing'), so this is the only
// co-op end state.
function netCheckPartyOver() {
  if (netState.role !== 'host' || gameState !== 'playing') return;
  if (!player.isDown) return;
  for (const conn of netState.peers) {
    if (conn.open && !netDownPeers.has(conn.peer)) return; // someone's still up
  }
  console.log('[net] party wiped — game over for everyone');
  sendToAll('party_over', {});
  netShowDownedMsg(false);
  gameOver();
}

onMessage('party_over', () => {
  if (!netIsClient()) return;
  console.log('[net] party wiped');
  netShowDownedMsg(false);
  player.isDown = false;
  gameOver();
});

function netShowDownedMsg(on, prog) {
  const el = document.getElementById('downedMsg');
  if (!el) return;
  if (!on) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  el.textContent = (prog > 0)
    ? `REVIVING… ${Math.floor(prog * 100)}%`
    : 'YOU ARE DOWN — a teammate can revive you';
}

// While down, any teammate who is NOT down standing within range fills the
// revive bar; it drains (half speed) when they step away. Runs on the DOWNED
// player's machine — it has everyone's positions via the avatars.
function netUpdateDownState(dt) {
  if (!player.isDown || gameState !== 'playing') return;
  let nearHelper = false;
  for (const av of netAvatars.values()) {
    if (av.down) continue;
    const dx = av.target.x - player.pos.x, dz = av.target.z - player.pos.z;
    if (dx * dx + dz * dz < NET_REVIVE_RANGE * NET_REVIVE_RANGE) { nearHelper = true; break; }
  }
  if (nearHelper) {
    player.reviveProgress += dt;
    if (player.reviveProgress >= NET_REVIVE_TIME) netRevive();
    else netShowDownedMsg(true, player.reviveProgress / NET_REVIVE_TIME);
  } else if (player.reviveProgress > 0) {
    player.reviveProgress = Math.max(0, player.reviveProgress - dt * 0.5);
    netShowDownedMsg(true, player.reviveProgress / NET_REVIVE_TIME);
  }
}

/* ── CO-OP (BETA) menu panel ──
   Markup lives in index.html (#coopPanel); styles in css/style.css.
   This only toggles the panel and routes button clicks — no game-start
   logic yet, connecting just logs on both sides. */

function netUiStatus(text) {
  const el = document.getElementById('coopStatus');
  if (!el) return;
  if (text === undefined) {
    // default line: connection summary
    if (netState.role === 'host') text = `${netState.peers.length}/${NET_MAX_CLIENTS} players joined`;
    else if (netState.role === 'client') text = netState.peers.length ? 'Connected to host' : 'Connecting…';
    else text = 'Play with up to 5 players';
  }
  el.textContent = text;
}

function netUiShowCode(code) {
  const codeEl = document.getElementById('coopRoomCode');
  if (codeEl) { codeEl.textContent = code; codeEl.style.display = 'block'; }
  netUiStatus(`Share this code — 0/${NET_MAX_CLIENTS} players joined`);
}

(function netUiInit() {
  const btnCoop = document.getElementById('btnCoop');
  const panel = document.getElementById('coopPanel');
  const btnHost = document.getElementById('btnHostGame');
  const btnJoin = document.getElementById('btnJoinGame');
  const codeInput = document.getElementById('coopCodeInput');
  if (!btnCoop || !panel) return; // markup missing — netcode stays fully inert

  btnCoop.addEventListener('click', () => {
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  });
  btnHost.addEventListener('click', hostGame);
  btnJoin.addEventListener('click', () => joinGame(codeInput.value));
  codeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinGame(codeInput.value); });
  codeInput.addEventListener('input', () => {
    codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, NET_CODE_LEN);
  });
})();
