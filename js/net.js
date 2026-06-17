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
      // Slot the joiner into the roster (their 'hi' fills in the name) and
      // re-broadcast so every client can label every avatar + lobby row.
      netHostAddPlayer(conn.peer, '');
    }
    if (netState.role === 'client') {
      sendTo(conn, 'hi', { name: netMyName() }); // introduce myself by display name
      netUiRenderLobby();
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
      netHostRemovePlayer(conn.peer); // roster + lobby update everywhere
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
  netMyReady = false;
  netPendingStart = null;
  netUiRenderLobby();
  // Phase-3 state: drop all enemy/boss/projectile mirrors (client side).
  netOnSceneTeardown();
  // Phase-4 state: back to solo rules — no down state, no downed overlay.
  netDownPeers.clear();
  if (typeof player !== 'undefined') { player.isDown = false; player.reviveProgress = 0; }
  netBeingRevivedUntil = -1;
  netShowDownedMsg(false);
  netShowRevivePrompt(false);
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
    netSaveMyName();
    netHostInitSelf(netMyName()); // host = slot 0 (P1 yellow), always ready
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
    netState.roomCode = code; // shown in the lobby header
    netSaveMyName();
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
     client --hi {name}----------------------> host           (on connect)
     host   --roster {players:{id:{slot,name,ready}}}-> all   (join/name/ready/leave)
     client --ready {r}----------------------> host           (lobby toggle)
     host   --player_left {id}---------------> every client   (on a disconnect)
   ═══════════════════════════════════════════════════════════════ */

const NET_POS_HZ = 15;            // position send rate
const NET_AVATAR_LERP = 0.1;      // remote avatar smoothing: ~10% of the gap per frame
const NET_EYE_HEIGHT = 1.6;       // player.pos.y is EYE height; avatar group origin is at the feet
// Hazmat suit color per slot: P1 yellow, P2 green, P3 red, P4 blue, P5 purple.
const NET_PLAYER_COLORS = [0xf2d22e, 0x3fd964, 0xe8413a, 0x3f7be8, 0xa64ae8];
const NET_NAME_KEY = 'brfps_name';
const NET_NAME_MAX = 12;

let netRoster = {};               // peerId -> { slot, name, ready } (host-authoritative)
const netAvatars = new Map();     // peerId -> { id, group, builtSlot, builtName, target:{x,y,z,yaw} }
let netPosAccum = 0;              // send-rate accumulator (netUpdate)
let netPendingStart = null;       // client: game_start received while still loading models
let netStartingFromHost = false;  // lets the host-driven startGame() through netGateStart
let netMyReady = false;           // client: my lobby ready state

// Display names are user input that crosses the wire — keep them to a safe
// charset on BOTH ends (host sanitizes again before rebroadcasting).
function netCleanName(s) {
  return String(s || '').replace(/[^A-Za-z0-9 _\-]/g, '').trim().slice(0, NET_NAME_MAX);
}

function netMyName() {
  let v = '';
  const input = document.getElementById('coopNameInput');
  if (input) v = input.value;
  if (!v) { try { v = localStorage.getItem(NET_NAME_KEY) || ''; } catch (e) {} }
  return netCleanName(v);
}

function netSaveMyName() {
  try { localStorage.setItem(NET_NAME_KEY, netMyName()); } catch (e) {}
}

function netSlotOf(id) { const e = netRoster[id]; return e ? e.slot : 0; }
function netNameOf(id) {
  const e = netRoster[id];
  return (e && e.name) ? e.name : 'P' + (netSlotOf(id) + 1);
}
function netColorOf(id) { return NET_PLAYER_COLORS[netSlotOf(id) % NET_PLAYER_COLORS.length]; }
// The LOCAL player's color slot (solo → 0 = P1 yellow). Used by the Lights Out
// scanner so each player paints dots in their own slot color.
function netMySlot() { return netSlotOf(netState.myId); }

/* ── host-side roster management (named functions → headless-testable) ── */

// Lowest free slot, so a rejoiner gets the leaver's color back.
function netLowestFreeSlot() {
  const used = new Set(Object.values(netRoster).map(e => e.slot));
  let s = 0;
  while (used.has(s)) s++;
  return s;
}

// hostGame: put the host itself in the roster (slot 0, always ready).
function netHostInitSelf(name) {
  netRoster = { [netState.myId]: { slot: 0, name: netCleanName(name), ready: true } };
  netUiRenderLobby();
}

function netHostAddPlayer(id, name) {
  if (!netRoster[id]) netRoster[id] = { slot: netLowestFreeSlot(), name: netCleanName(name), ready: false };
  else if (name) netRoster[id].name = netCleanName(name);
  netBroadcastRoster();
}

function netHostRemovePlayer(id) {
  delete netRoster[id];
  netBroadcastRoster();
}

function netHostSetReady(id, ready) {
  if (netRoster[id]) netRoster[id].ready = !!ready;
  netBroadcastRoster();
}

function netAllReady() {
  const all = Object.values(netRoster);
  return all.length > 0 && all.every(e => e.ready);
}

function netBroadcastRoster() {
  sendToAll('roster', { players: netRoster });
  netUiRenderLobby();
  netUiStatus();
}

// Client → host on connect: introduce myself by name.
onMessage('hi', (d, fromConn) => {
  if (netState.role !== 'host') return;
  netHostAddPlayer(fromConn.peer, d && d.name);
});

// Client lobby READY toggle → host updates + rebroadcasts.
onMessage('ready', (d, fromConn) => {
  if (netState.role !== 'host') return;
  netHostSetReady(fromConn.peer, d && d.r);
});

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

/* ── roster sync (host → clients: slots, names, ready states) ── */

onMessage('roster', (d) => {
  if (netState.role !== 'client' || !d) return;
  netRoster = d.players || {};
  if (netRoster[netState.myId]) netMyReady = !!netRoster[netState.myId].ready;
  console.log('[net] roster:', JSON.stringify(netRoster));
  // If an avatar was built before its slot/name was known, rebuild it with the
  // right color/label on its next pos update.
  for (const av of netAvatars.values()) {
    if (av.group && (av.builtSlot !== netSlotOf(av.id) || av.builtName !== netNameOf(av.id))) {
      netAvatarDisposeGroup(av);
    }
  }
  netUiRenderLobby();
});

/* ── position stream ── */

// Per-frame driver, called from animate() in main.js. In solo this falls
// through both branches immediately — zero impact.
function netUpdate(dt) {
  if (netPendingStart) netTryStart();
  if (netState.role === 'solo') return;

  netUpdateDownState(dt);   // down/revive progress (no-op unless this player is down)
  netUpdateReviverSide(dt); // HOLD-E revive prompt/signal (no-op unless near a downed mate)

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

// HAZMAT SUIT figure — body, hood, visor, backpack tank, arm stubs, all
// primitives. One COLORED suit material per player (slot color; the down-tint
// targets it) + one dark material for visor/tank. Deliberately NO PointLight
// (fixed light budget) and no new shader families: untextured
// MeshStandardMaterial is pinned by ammoPickupMat, the label's map+transparent
// SpriteMaterial by the keepalives.
function netAvatarBuild(av) {
  const slot = netSlotOf(av.id);
  const name = netNameOf(av.id);
  const color = NET_PLAYER_COLORS[slot % NET_PLAYER_COLORS.length];

  const group = new THREE.Group();
  const suitMat = new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: 0.28, roughness: 0.75
  });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x14181c, roughness: 0.25, metalness: 0.4 });

  const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.26, 0.55, 10), suitMat);
  legs.position.y = 0.28;
  group.add(legs);
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.33, 0.78, 10), suitMat);
  torso.position.y = 0.93;
  group.add(torso);
  const hood = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), suitMat);
  hood.position.y = 1.48;
  hood.scale.set(1, 1.08, 1); // slightly tall — hood, not head
  group.add(hood);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.13, 0.06), darkMat);
  visor.position.set(0, 1.48, -0.21); // -z = look direction at yaw 0, matching the camera
  group.add(visor);
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.46, 8), darkMat);
  tank.position.set(0, 1.02, 0.24); // small air tank on the back
  group.add(tank);
  const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.085, 0.6, 8), suitMat);
  armL.position.set(-0.38, 0.95, 0); armL.rotation.z = 0.16;
  group.add(armL);
  const armR = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.085, 0.6, 8), suitMat);
  armR.position.set(0.38, 0.95, 0); armR.rotation.z = -0.16;
  group.add(armR);

  const label = netMakeNameLabel(name, color);
  label.position.y = 2.05;
  group.add(label);

  group.position.set(av.target.x, av.target.y - NET_EYE_HEIGHT, av.target.z); // snap on (re)build
  group.rotation.y = av.target.yaw;
  scene.add(group);
  av.group = group;
  av.builtSlot = slot;
  av.builtName = name;
  // Down/revive (Phase 4): keep refs for the dark-red "down" tint, and re-apply
  // it if this avatar was rebuilt (e.g. new floor) while its player is down.
  av.bodyMat = suitMat;
  av.baseColor = color;
  if (av.down) netSetAvatarDown(av.id, true);
}

// Camera-facing name tag, readable at distance: big canvas text with a black
// halo + a colored outline matching the player's suit. depthTest:false keeps
// it visible through walls (find your teammates).
function netMakeNameLabel(text, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 96;
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 52px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 14;
  ctx.strokeStyle = '#000000';
  ctx.strokeText(text, 256, 48);
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#' + (color || 0xffffff).toString(16).padStart(6, '0');
  ctx.strokeText(text, 256, 48);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, 256, 48);
  const tex = new THREE.CanvasTexture(canvas);
  texMarkSRGB(tex); // main.js — sRGB at creation (labels are built at runtime)
  tex.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.7, 0.32, 1);
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
  for (const av of netAvatars.values()) { av.group = null; av.bodyMat = null; av.down = false; av.reviveProg = 0; }
  netDownPeers.clear();
  player.isDown = false;
  player.reviveProgress = 0;
  netBeingRevivedUntil = -1;
  netLastSentProg = -1;
  netShowDownedMsg(false);
  netShowRevivePrompt(false);
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
// APPEND-ONLY: new types go on the END so existing wire indices never shift.
// (Adding 'chaser' is a protocol addition — both players must run the new build.)
const NET_TYPE_LIST = ['stalker', 'crawler', 'phantom', 'danger_stalker', 'danger_crawler', 'spider', 'partygoer', 'chaser'];
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

// HOST: how many players are in the fight — the local player plus every OPEN
// peer connection. Deliberately NOT netAllPlayers(): downed players still
// count (they're revivable mid-fight) and the empty-list fallback never
// applies. Solo (and any non-host caller) → 1. Used by spawnBoss to scale
// boss HP; the result is read ONCE at spawn and never re-applied.
function netActivePlayerCount() {
  let n = 1;
  if (netState.role === 'host') {
    for (const conn of netState.peers) if (conn.open) n++;
  }
  return n;
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

// PROTOCOL: 'shoot' now also carries w (weapon id) and, for multi-pellet guns,
// p (the array of pellet dir vectors the client actually fired — host resolves
// the very same rays). Single-ray weapons omit p and use dx/dy/dz. Both players
// on the new build (already required by prior protocol additions).
function netSendShoot(origin, dir, rays, weaponId) {
  const r3 = v => Math.round(v * 1000) / 1000;
  const msg = {
    ox: netR2(origin.x), oy: netR2(origin.y), oz: netR2(origin.z),
    dx: r3(dir.x), dy: r3(dir.y), dz: r3(dir.z),
    m: shopStats.damageMult, // this client's shop damage mult (client-trusted; fine for friend co-op)
    w: weaponId | 0
  };
  if (rays && rays.length > 1) msg.p = rays.map(v => [r3(v.x), r3(v.y), r3(v.z)]);
  sendToHost('shoot', msg);
}

onMessage('shoot', (d, fromConn) => {
  // main.js — host's authoritative raycast; fromConn = who fired (kill credit)
  if (netState.role !== 'host' || gameState !== 'playing' || !d) return;
  netResolveRemoteShot(d, fromConn);
  // Cosmetic: show this client's shot here, and relay it to the OTHER clients
  // as 'shot_fx' (damage already handled above — fx only). Carry weapon + pellets.
  netShowRemoteShot(fromConn.peer, [d.ox, d.oy, d.oz], [d.dx, d.dy, d.dz], d.w, d.p);
  for (const conn of netState.peers) {
    if (conn !== fromConn && conn.open) {
      conn.send({ t: 'shot_fx', d: { id: fromConn.peer, o: [d.ox, d.oy, d.oz], d: [d.dx, d.dy, d.dz], w: d.w, p: d.p } });
    }
  }
});

/* ── teammate shot FX (cosmetic only — see playerShoot/netResolveRemoteShot
   for the damage paths, which are unchanged) ── */

// Host's own shots have no 'shoot' message to derive from — broadcast directly.
// Called from playerShoot (main.js) when hosting.
function netAnnounceShot(origin, dir, rays, weaponId) {
  if (netState.role !== 'host' || netState.peers.length === 0) return;
  const r3 = v => Math.round(v * 1000) / 1000;
  const msg = {
    id: netState.myId,
    o: [netR2(origin.x), netR2(origin.y), netR2(origin.z)],
    d: [r3(dir.x), r3(dir.y), r3(dir.z)],
    w: weaponId | 0
  };
  if (rays && rays.length > 1) msg.p = rays.map(v => [r3(v.x), r3(v.y), r3(v.z)]);
  sendToAll('shot_fx', msg);
}

onMessage('shot_fx', (d) => {
  if (!netIsClient() || gameState !== 'playing' || !d || d.id === netState.myId) return;
  netShowRemoteShot(d.id, d.o, d.d, d.w, d.p);
});

/* ── SCANNER pulse sharing (Lights Out, floor 18) ──
   Purely COSMETIC: each machine reproduces a teammate's RADIAL pulse from its
   origin + the firer's color slot (doScanPulse, main.js), painting that player's
   dots in their slot color. Monster reveal needs NO host authority — every
   machine reveals from its OWN local mob list. The firer paints locally
   immediately; this just shares the wall/floor dots so teammates' scans show up
   distinctly. PROTOCOL ADDITION: 'scan' (client→host) + 'scan_fx' (host→clients);
   old builds ignore them (they just don't see teammates' scans). */
function netAnnounceScan(origin, slot) {
  if (netState.role === 'host') {
    if (netState.peers.length) sendToAll('scan_fx', { id: netState.myId, x: netR2(origin.x), y: netR2(origin.y), z: netR2(origin.z), s: slot });
  } else if (netState.role === 'client') {
    sendToHost('scan', { x: netR2(origin.x), y: netR2(origin.y), z: netR2(origin.z) });
  }
}

onMessage('scan', (d, fromConn) => {
  if (netState.role !== 'host' || gameState !== 'playing' || !d) return;
  const slot = netSlotOf(fromConn.peer);
  if (typeof doScanPulse === 'function') doScanPulse(new THREE.Vector3(d.x, d.y, d.z), slot); // host sees the client's scan
  for (const conn of netState.peers) { // relay to the OTHER clients (the firer already painted locally)
    if (conn !== fromConn && conn.open) conn.send({ t: 'scan_fx', d: { id: fromConn.peer, x: d.x, y: d.y, z: d.z, s: slot } });
  }
});

onMessage('scan_fx', (d) => {
  if (!netIsClient() || gameState !== 'playing' || !d || d.id === netState.myId) return;
  if (typeof doScanPulse === 'function') doScanPulse(new THREE.Vector3(d.x, d.y, d.z), d.s);
});

/* ── run victory (20th-floor capstone) ──
   The HOST owns the boss, so it decides the run is won (the finale boss died) and
   tells the party so everyone sees the ending together. PROTOCOL ADDITION:
   'run_won' (host→all). Old builds ignore it (they'd just keep playing / loop). */
function netBroadcastRunWon() {
  if (netState.role === 'host' && netState.peers.length) sendToAll('run_won', {});
}

onMessage('run_won', () => {
  if (netIsClient() && typeof showVictory === 'function') showVictory(); // main.js — local victory screen
});

// Render a teammate's shot: the same fading trail the shooter saw (full range,
// like local trails — they don't clip on walls either), a brief muzzle-flash
// blob at the avatar, and a distance-attenuated gunshot. Both flash mesh and
// trail ride the existing bulletTrails fade/dispose loop. Emissive standard
// material — already-pinned program family, no lights.
function netShowRemoteShot(id, o, dv, weaponId, rays) {
  if (typeof scene === 'undefined' || !scene || gameState !== 'playing') return;
  const origin = new THREE.Vector3(o[0], o[1], o[2]);
  const w = (typeof WEAPONS !== 'undefined' && WEAPONS[weaponId]) ? WEAPONS[weaponId] : null;
  const range = w ? w.range : GUN_RANGE;
  // All pellet dirs the shooter fired (or the single aim dir).
  const dirs = (rays && rays.length)
    ? rays.map(p => new THREE.Vector3(p[0], p[1], p[2]).normalize())
    : [new THREE.Vector3(dv[0], dv[1], dv[2]).normalize()];
  const primary = dirs[0];
  for (const dir of dirs) {
    const gunTip = origin.clone().add(dir.clone().multiplyScalar(0.4));
    // Reuse the local cosmetic path (wall-clipped trail + sparks + decal) when
    // available, so a teammate's shot looks just like your own.
    if (w && typeof drawPelletFx === 'function') drawPelletFx(gunTip, origin, dir, w, null);
    else spawnBulletTrail(gunTip, origin.clone().add(dir.clone().multiplyScalar(range)));
  }
  const flash = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 6, 6),
    new THREE.MeshStandardMaterial({
      color: 0xffcc66, emissive: 0xffaa33, emissiveIntensity: 2.5,
      transparent: true, opacity: 0.9
    })
  );
  flash.position.copy(origin).add(primary.clone().multiplyScalar(0.45));
  scene.add(flash);
  bulletTrails.push({ mesh: flash, life: 0.07 });
  // Flare: light the area for the whole party on dark floors (single slot — the
  // most recent flare, local or remote, wins it).
  if (w && w.flare && typeof plantFlare === 'function' && typeof flareImpactPoint === 'function') {
    plantFlare(flareImpactPoint(origin, primary, w));
  }
  if (typeof playRemoteShot === 'function') playRemoteShot(w ? w.sound : 'pistol', origin.distanceTo(player.pos));
  else playRemoteGunshot(origin.distanceTo(player.pos));
}

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
  const m = { id, type, mesh, scale: mt.scale, tx: x, tz: z, hp, maxHp, flashT: 0, dying: false, deathT: 0, vocalTimer: Math.random() * 3 };
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
    // pools: mirrors wade exactly like the host's mobs (mobGroundOffset is
    // grid-derived, and the grid is seeded-identical on every machine)
    const wadeY = mobGroundOffset(m.mesh.position.x, m.mesh.position.z);
    if (m.mesh.isGroup) {
      if (m.mesh.userData.float !== undefined) {
        m.mesh.position.y = m.mesh.userData.float + Math.sin(t * 2 + m.tx) * 0.18;
      } else {
        m.mesh.position.y = 0.05 + Math.sin(t * 14) * 0.05 + wadeY;
      }
      if (m.mesh.userData.isModel) {
        const near = netNearestOf(ppl, m.mesh.position.x, m.mesh.position.z);
        m.mesh.rotation.y = Math.atan2(near.x - m.mesh.position.x, near.z - m.mesh.position.z) + (m.mesh.userData.faceOffset || 0);
      }
      // THE CHASER mirror: writhe its limbs + face the nearest player (matches host).
      if (m.type === 'chaser' && typeof animateChaserMesh === 'function') {
        animateChaserMesh(m.mesh, t);
        const near = netNearestOf(ppl, m.mesh.position.x, m.mesh.position.z);
        m.mesh.rotation.y = Math.atan2(near.x - m.mesh.position.x, near.z - m.mesh.position.z);
      }
    } else {
      let yPos = (m.scale * 2.5) / 2;
      if (m.type === 'phantom') yPos += Math.sin(Date.now() * 0.003 + m.mesh.position.x) * 0.4;
      else yPos += wadeY;
      m.mesh.position.y = yPos;
    }

    // IDLE vocalizations for this mirror (per-machine ambience — the client voices
    // its OWN nearby mobs). State-driven events (aggro/attack/roar) instead arrive
    // from the host via 'mob_vocal'. Skip the chaser (its roar is broadcast).
    if (m.type !== 'chaser' && typeof mobVocalLocal === 'function') {
      if (m.vocalTimer === undefined) m.vocalTimer = Math.random() * 3;
      m.vocalTimer -= dt;
      if (m.vocalTimer <= 0) {
        m.vocalTimer = 3 + Math.random() * 3.5;
        mobVocalLocal(m.type, 'idle', m.mesh.position.x, m.mesh.position.z);
      }
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
  floorReserveTopUp(); // ~3 mags back across the equipped gun + every stashed gun
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
  const theme = getTheme(currentFloor);
  if (theme.isBoss) return true; // boss floors: the boss death spawns the exit
  // REACH gate (Hotel Chase): the exit is open from the start — surviving the
  // run to it IS the win. No kills, no items.
  if ((theme.gate || 'kills') === 'reach') return true;
  // ITEM gate: collect every artifact (applies in SOLO and co-op — the lore
  // objective is the gate). The count is shared/host-validated (see main.js).
  if ((theme.gate || 'kills') === 'item') return artifactsTotal > 0 ? artifactsCollected >= artifactsTotal : true;
  // KILLS gate: now applies to SOLO as well as co-op — clear the floor's kill
  // target before the exit opens (same waveSizeFor threshold; player count 1
  // just yields a smaller number). floorKills counts the solo player's kills.
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

/* ── lore-objective artifact sync (item gate) ──
   Same shape as 'pickup_taken': whoever walks over an artifact removes it
   locally and announces it; every other machine removes the SAME id (seeded
   creation order) and counts it (idempotent), so the shared ARTIFACTS n/N
   agrees everywhere. The exit advance stays host-validated (netExitGateOpen).
   PROTOCOL ADDITION 'artifact_taken' {id} — both players on the new build. */
function netAnnounceArtifactTaken(id) {
  if (netState.role === 'solo' || id === undefined) return;
  if (netState.role === 'host') sendToAll('artifact_taken', { id });
  else sendToHost('artifact_taken', { id });
}

onMessage('artifact_taken', (d, fromConn) => {
  if (netState.role === 'solo' || !d) return;
  collectArtifact(d.id); // main.js — remove mesh + count (idempotent)
  if (netState.role === 'host') {
    // relay so the OTHER clients lose it + count it too
    for (const conn of netState.peers) {
      if (conn !== fromConn && conn.open) conn.send({ t: 'artifact_taken', d: { id: d.id } });
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

/* ── consumable (almond water / bandage) sync ──
   Same shape as the ammo pickup pair: seeded sequential ids name the SAME pickup
   on every machine; whoever walks over one grants it to THEIR OWN inventory and
   announces the removal ('consumable_taken' {id}), which every machine applies
   (remove only — no grant). Host kill-drops broadcast 'consumable_spawn'
   {id,x,z,kind}. PROTOCOL ADDITION — both players on the new build. */
function netAnnounceConsumableTaken(id) {
  if (netState.role === 'solo' || id === undefined) return;
  if (netState.role === 'host') sendToAll('consumable_taken', { id });
  else sendToHost('consumable_taken', { id });
}

onMessage('consumable_taken', (d, fromConn) => {
  if (netState.role === 'solo' || !d) return;
  collectConsumableById(d.id); // main.js — remove the mesh (no grant for others)
  if (netState.role === 'host') {
    for (const conn of netState.peers) {
      if (conn !== fromConn && conn.open) conn.send({ t: 'consumable_taken', d: { id: d.id } });
    }
  }
});

function netBroadcastConsumableSpawn(id, x, z, kind) {
  if (netState.role === 'host') sendToAll('consumable_spawn', { id, x: netR2(x), z: netR2(z), kind });
}

onMessage('consumable_spawn', (d) => {
  if (netIsClient() && d && gameState === 'playing') createConsumable(d.x, d.z, d.id, d.kind);
});

/* ── balloon pop sync (Level Fun trap) ──
   host --balloon_pop {id}--> clients. Balloons are placed by the seeded rng
   with sequential ids (addDecorations party branch), so the id names the SAME
   balloon on every machine — exactly the ammo-pickup id contract. The pop
   itself, the partygoer spawns and the aggro are host-owned (popBalloon,
   main.js); clients only mirror the removal + audio here. PROTOCOL ADDITION:
   an old build ignores the message (balloon stays visible there) — both
   players must be on the new build, which this batch already requires. */

function netBroadcastBalloonPop(id) {
  if (netState.role === 'host' && netState.peers.length > 0) sendToAll('balloon_pop', { id });
}

onMessage('balloon_pop', (d) => {
  if (netIsClient() && d && gameState === 'playing') netOnBalloonPop(d.id); // main.js
});

/* ── scripted scare events (main.js) ──
   The HOST owns ALL scare triggers (proximity / timer windows) and which-event
   rolls — exactly the spawn-composition model. When one fires it broadcasts
   'scare' {type, data} so every player gets the SAME scare together (shared
   scares read better). data carries only what each client needs to reproduce
   the moment locally (e.g. a world point for the watcher / slam pan), so each
   player experiences it from their own viewpoint. PROTOCOL ADDITION: an old
   build logs it as unhandled and just misses the scare — both players on the
   new build (already required by prior additions). */

function netBroadcastScare(type, data) {
  if (netState.role === 'host' && netState.peers.length > 0) sendToAll('scare', { type, data });
}

onMessage('scare', (d) => {
  if (netIsClient() && d && gameState === 'playing') applyScare(d.type, d.data); // main.js
});

/* ── mob vocalizations (audio pass) ──
   The HOST owns mob STATE, so the state-driven scary vocals (aggro on roam→hunt,
   attack, the chaser's roar) are host events: hostMobVocal (main.js) plays them
   locally AND calls this to broadcast {t:type, k:kind, x, z} so co-op players
   share the dread. Each receiver re-spatializes from its OWN camera. IDLE
   ambience is NOT broadcast — every machine voices its own nearby mobs/mirrors.
   PROTOCOL ADDITION: an old build logs it unhandled (just misses the sound) —
   both players on the new build (already required by prior additions). Cosmetic,
   no gameplay state. */

function netBroadcastMobVocal(type, kind, x, z) {
  if (netState.role === 'host' && netState.peers.length > 0) sendToAll('mob_vocal', { t: type, k: kind, x: netR2(x), z: netR2(z) });
}

onMessage('mob_vocal', (d) => {
  if (netIsClient() && d && gameState === 'playing' && typeof mobVocalLocal === 'function') mobVocalLocal(d.t, d.k, d.x, d.z); // main.js
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
  if (!d.down) { const av = netAvatars.get(d.id); if (av) av.reviveProg = 0; }
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

let netDownedMsgHtml = ''; // change-detect cache (this runs every frame)
function netShowDownedMsg(on, prog, reviverName) {
  const el = document.getElementById('downedMsg');
  if (!el) return;
  if (!on) { if (netDownedMsgHtml !== '') { netDownedMsgHtml = ''; el.style.display = 'none'; } return; }
  const pct = Math.floor((prog || 0) * 100);
  let line;
  if (reviverName) line = `${reviverName.toUpperCase()} IS REVIVING YOU… ${pct}%`;
  else if (prog > 0) line = `REVIVE PAUSED — ${pct}%`;
  else line = 'YOU ARE DOWN — a teammate can hold [E] near you';
  // reviverName comes from netCleanName'd roster entries — safe charset.
  const html = `<div>${line}</div><div class="revive-bar"><div class="revive-bar-fill" style="width:${pct}%"></div></div>`;
  if (html !== netDownedMsgHtml) { netDownedMsgHtml = html; el.innerHTML = html; el.style.display = 'block'; }
}

/* ── HOLD-E revive ──
   The REVIVER drives it: stand within range of a downed teammate and HOLD E.
   While held, the reviver streams 'reviving' signals (8Hz) routed to the
   downed player's machine, which owns the progress bar exactly as before
   (accumulate while signals are fresh, decay at half speed otherwise) and
   streams 'revive_prog' back so the reviver's bar matches. Releasing E just
   stops the signals → progress pauses, then decays. */

let netBeingRevivedUntil = -1; // downed side: how long the last 'reviving' signal stays fresh
let netReviverName = '';       // downed side: who's reviving me (for the HUD line)
let netReviveSendAccum = 0;    // reviver side: signal pacing
let netReviveProgAccum = 0;    // downed side: progress broadcast pacing
let netLastSentProg = -1;

function netUpdateReviverSide(dt) {
  if (gameState !== 'playing' || player.isDown) { netShowRevivePrompt(false); return; }
  let best = null, bestD2 = NET_REVIVE_RANGE * NET_REVIVE_RANGE;
  for (const av of netAvatars.values()) {
    if (!av.down) continue;
    const dx = av.target.x - player.pos.x, dz = av.target.z - player.pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD2) { bestD2 = d2; best = av; }
  }
  if (!best) { netShowRevivePrompt(false); return; }
  const holding = !!keys['KeyE'];
  netShowRevivePrompt(true, netNameOf(best.id), holding, best.reviveProg || 0);
  if (holding) {
    netReviveSendAccum += dt;
    if (netReviveSendAccum >= 0.12) {
      netReviveSendAccum = 0;
      if (netState.role === 'client') sendToHost('reviving', { id: best.id });
      else for (const conn of netState.peers) {
        if (conn.peer === best.id) { sendTo(conn, 'reviving', { id: best.id, from: netState.myId }); break; }
      }
    }
  }
}

onMessage('reviving', (d, fromConn) => {
  if (!d || !d.id) return;
  if (netState.role === 'host') {
    if (d.id === netState.myId) { netOnRevivingMe(fromConn.peer); return; } // I'm the target
    for (const conn of netState.peers) { // relay to the downed player's machine
      if (conn.peer === d.id && conn.open) { conn.send({ t: 'reviving', d: { id: d.id, from: fromConn.peer } }); break; }
    }
  } else if (d.id === netState.myId) {
    netOnRevivingMe(d.from);
  }
});

function netOnRevivingMe(fromId) {
  if (!player.isDown) return;
  netBeingRevivedUntil = clock.getElapsedTime() + 0.35; // signal stays fresh between 8Hz packets
  netReviverName = netNameOf(fromId);
}

// Downed side: progress owner. Accumulates while 'reviving' signals are fresh,
// decays at half speed otherwise; streams the % to everyone for the reviver bar.
function netUpdateDownState(dt) {
  if (!player.isDown || gameState !== 'playing') return;
  const active = clock.getElapsedTime() < netBeingRevivedUntil;
  if (active) {
    player.reviveProgress += dt;
    if (player.reviveProgress >= NET_REVIVE_TIME) {
      netBroadcastReviveProg(0);
      netRevive();
      return;
    }
  } else if (player.reviveProgress > 0) {
    player.reviveProgress = Math.max(0, player.reviveProgress - dt * 0.5);
  }
  netShowDownedMsg(true, player.reviveProgress / NET_REVIVE_TIME, active ? netReviverName : '');
  netReviveProgAccum += dt;
  if (netReviveProgAccum >= 0.12) {
    netReviveProgAccum = 0;
    const p = Math.round(player.reviveProgress / NET_REVIVE_TIME * 50) / 50;
    if (p !== netLastSentProg) { netLastSentProg = p; netBroadcastReviveProg(p); }
  }
}

function netBroadcastReviveProg(p) {
  if (netState.role === 'host') sendToAll('revive_prog', { id: netState.myId, p });
  else sendToHost('revive_prog', { p });
}

onMessage('revive_prog', (d, fromConn) => {
  if (!d) return;
  let id = d.id;
  if (netState.role === 'host') {
    id = fromConn.peer; // trust the connection, not the payload
    for (const conn of netState.peers) {
      if (conn !== fromConn && conn.open) conn.send({ t: 'revive_prog', d: { id, p: d.p } });
    }
  }
  const av = netAvatars.get(id);
  if (av) av.reviveProg = d.p || 0;
});

// Reviver-side prompt + progress bar ("HOLD [E] TO REVIVE <name>" → "REVIVING <name>…").
let netRevivePromptHtml = '';
function netShowRevivePrompt(on, name, holding, prog) {
  const el = document.getElementById('revivePrompt');
  if (!el) return;
  if (!on) { if (netRevivePromptHtml !== '') { netRevivePromptHtml = ''; el.style.display = 'none'; } return; }
  const n = (name || '').toUpperCase();
  const pct = Math.floor((prog || 0) * 100);
  const html = holding
    ? `<div>REVIVING ${n}… ${pct}%</div><div class="revive-bar"><div class="revive-bar-fill" style="width:${pct}%"></div></div>`
    : `<div>HOLD [E] TO REVIVE ${n}</div>`;
  if (html !== netRevivePromptHtml) { netRevivePromptHtml = html; el.innerHTML = html; el.style.display = 'block'; }
}

/* ── CO-OP LOBBY panel ──
   Markup lives in index.html (#coopPanel + #coopLobby); styles in
   css/style.css. After hosting/joining, the host/join row hides and the lobby
   shows "ROOM <CODE> — n/5 PLAYERS", a live colored player list with ready
   states, a READY toggle (clients), and START (host; bright when all ready,
   clickable anyway = force start). */

function netUiStatus(text) {
  const el = document.getElementById('coopStatus');
  if (!el) return;
  if (text === undefined) {
    const n = Object.keys(netRoster).length;
    if (netState.role === 'host') text = `${n}/${NET_MAX_CLIENTS + 1} players — waiting in lobby`;
    else if (netState.role === 'client') text = netState.peers.length ? 'In lobby — ready up!' : 'Connecting…';
    else text = 'Play with up to 5 players';
  }
  el.textContent = text;
}

function netUiShowCode(code) {
  const codeEl = document.getElementById('coopRoomCode');
  if (codeEl) { codeEl.textContent = code; codeEl.style.display = 'block'; }
  netUiStatus();
}

// Rebuild the lobby DOM from netRoster. Called on every roster/membership
// change (cheap — at most 5 rows) and safe headless (all lookups null-guarded).
function netUiRenderLobby() {
  const lobby = document.getElementById('coopLobby');
  if (!lobby) return;
  const joinRow = document.getElementById('coopJoinRow');
  const nameRow = document.getElementById('coopNameRow');
  const inLobby = netState.role !== 'solo';
  lobby.style.display = inLobby ? 'block' : 'none';
  if (joinRow) joinRow.style.display = inLobby ? 'none' : 'flex';
  if (nameRow) nameRow.style.display = inLobby ? 'none' : 'flex'; // name locked once connected
  if (!inLobby) return;

  const entries = Object.entries(netRoster).sort((a, b) => a[1].slot - b[1].slot);
  const head = document.getElementById('coopLobbyHead');
  if (head) head.textContent = `ROOM ${netState.roomCode || '?????'} — ${entries.length}/${NET_MAX_CLIENTS + 1} PLAYERS`;

  const list = document.getElementById('coopLobbyList');
  if (list) {
    list.innerHTML = '';
    for (const [id, e] of entries) {
      const row = document.createElement('div');
      row.className = 'coop-lobby-row';
      const dot = document.createElement('span');
      dot.className = 'coop-dot';
      dot.style.background = '#' + NET_PLAYER_COLORS[e.slot % NET_PLAYER_COLORS.length].toString(16).padStart(6, '0');
      const nm = document.createElement('span');
      nm.className = 'coop-lobby-name';
      nm.textContent = (e.name || 'P' + (e.slot + 1)) + (id === netState.myId ? ' (you)' : '');
      const st = document.createElement('span');
      st.className = 'coop-lobby-ready' + (e.ready ? ' is-ready' : '');
      st.textContent = e.slot === 0 ? 'HOST' : (e.ready ? 'READY' : '. . .');
      row.append(dot, nm, st);
      list.appendChild(row);
    }
  }

  const btnReady = document.getElementById('btnReady');
  if (btnReady) {
    btnReady.style.display = netState.role === 'client' ? 'inline-block' : 'none';
    btnReady.textContent = netMyReady ? 'UNREADY' : 'READY';
    btnReady.classList.toggle('is-ready', netMyReady);
  }
  const btnStart = document.getElementById('btnStartCoop');
  if (btnStart) {
    btnStart.style.display = netState.role === 'host' ? 'inline-block' : 'none';
    const ready = Object.values(netRoster).filter(e => e.ready).length;
    const all = netAllReady();
    btnStart.textContent = all ? 'START' : `START (${ready}/${entries.length} READY)`;
    btnStart.classList.toggle('all-ready', all);
  }
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

  // Display name: prefill from localStorage, sanitize as typed, persist.
  const nameInput = document.getElementById('coopNameInput');
  if (nameInput) {
    try { nameInput.value = localStorage.getItem(NET_NAME_KEY) || ''; } catch (e) {}
    nameInput.addEventListener('input', () => {
      const clean = netCleanName(nameInput.value);
      if (nameInput.value !== clean) nameInput.value = clean;
      netSaveMyName();
    });
  }

  // Lobby buttons: READY toggle (client) / START (host — force-start allowed).
  const btnReady = document.getElementById('btnReady');
  if (btnReady) btnReady.addEventListener('click', () => {
    if (netState.role !== 'client') return;
    netMyReady = !netMyReady;
    if (netRoster[netState.myId]) netRoster[netState.myId].ready = netMyReady; // optimistic
    sendToHost('ready', { r: netMyReady });
    netUiRenderLobby();
  });
  const btnStart = document.getElementById('btnStartCoop');
  if (btnStart) btnStart.addEventListener('click', () => {
    if (netState.role !== 'host') return;
    if (!netAllReady()) console.log('[net] force-starting with unready players');
    startGame(); // netOnHostStart inside broadcasts game_start to the room
  });
})();
