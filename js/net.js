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
  netPendingStart = d;
  netTryStart(); // may defer until modelsReady (retried from netUpdate)
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

  // Outbound: my eye position + yaw at NET_POS_HZ while actually playing.
  if (gameState === 'playing') {
    netPosAccum += dt;
    if (netPosAccum >= 1 / NET_POS_HZ) {
      netPosAccum = 0;
      const p = { x: player.pos.x, y: player.pos.y, z: player.pos.z, yaw: player.yaw };
      if (netState.role === 'host') { p.id = netState.myId; sendToAll('pos', p); }
      else sendToHost('pos', p);
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
function netOnSceneRebuilt() {
  for (const av of netAvatars.values()) av.group = null;
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
