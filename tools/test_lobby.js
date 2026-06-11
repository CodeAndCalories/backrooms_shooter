// Headless lobby-flow test. Loads the REAL js/net.js (no copies) with stubbed
// browser globals and drives the host-side roster machinery + client-side
// roster reception exactly the way PeerJS events would:
//   join -> slot/color assignment -> 'hi' name propagation (sanitized) ->
//   ready toggles -> all-ready -> leave -> slot reuse -> client roster mirror.
// Anything DOM/scene-related is null-guarded in net.js, so it no-ops here.
// Usage: node tools/test_lobby.js

const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'net.js'), 'utf8');

function makeInstance() {
  const documentStub = { getElementById: () => null, createElement: () => ({ getContext: () => null, style: {} }) };
  const factory = new Function('document', src + `;
    return {
      netState, netHostInitSelf, netHostAddPlayer, netHostRemovePlayer,
      netHostSetReady, netAllReady, netLowestFreeSlot, netDispatch,
      netSlotOf, netNameOf, netColorOf, netCleanName,
      roster: () => netRoster, myReady: () => netMyReady,
      COLORS: NET_PLAYER_COLORS
    };`);
  return factory(documentStub);
}

function fakeConn(peer) {
  return { peer, open: true, sent: [], send(m) { this.sent.push(m); } };
}

let passed = 0, failed = 0;
function check(label, cond, detail) {
  if (cond) { passed++; console.log(`  ok  ${label}`); }
  else { failed++; console.error(`FAIL  ${label}${detail !== undefined ? ' — got: ' + JSON.stringify(detail) : ''}`); }
}

/* ── host-side flow ── */
console.log('HOST FLOW');
const host = makeInstance();
host.netState.role = 'host';
host.netState.myId = 'HOST';
host.netState.roomCode = 'K7M3Q';

host.netHostInitSelf('Gambino');
check('host registers itself at slot 0, ready', host.roster().HOST &&
  host.roster().HOST.slot === 0 && host.roster().HOST.ready === true && host.roster().HOST.name === 'Gambino', host.roster());

const connA = fakeConn('peerA'), connB = fakeConn('peerB');
host.netState.peers.push(connA, connB);
host.netHostAddPlayer('peerA', '');   // what netWireConnection does on open
host.netHostAddPlayer('peerB', '');
check('joiners get slots 1 and 2', host.netSlotOf('peerA') === 1 && host.netSlotOf('peerB') === 2, host.roster());
check('unnamed joiner falls back to P<slot+1>', host.netNameOf('peerB') === 'P3', host.netNameOf('peerB'));
check('slot colors: P1 yellow / P2 green / P3 red',
  host.netColorOf('HOST') === 0xf2d22e && host.netColorOf('peerA') === 0x3fd964 && host.netColorOf('peerB') === 0xe8413a);

// name propagation via 'hi' (dirty input must be sanitized)
host.netDispatch({ t: 'hi', d: { name: '  Alice<script>!! ' } }, connA);
check("'hi' sets a sanitized name", host.netNameOf('peerA') === 'Alicescript', host.netNameOf('peerA'));
check('overlong names clamp to 12 chars', host.netCleanName('ThisNameIsWayTooLong').length === 12);

const lastRosterMsg = connB.sent.filter(m => m.t === 'roster').pop();
check('roster rebroadcast on name change reaches clients',
  lastRosterMsg && lastRosterMsg.d.players.peerA.name === 'Alicescript', lastRosterMsg);

// ready flow
check('not all ready initially (A, B unready)', host.netAllReady() === false);
host.netDispatch({ t: 'ready', d: { r: true } }, connA);
check('A ready → still waiting on B', host.roster().peerA.ready === true && host.netAllReady() === false);
host.netDispatch({ t: 'ready', d: { r: true } }, connB);
check('B ready → ALL ready (host START goes bright)', host.netAllReady() === true);
host.netDispatch({ t: 'ready', d: { r: false } }, connB);
check('B unready → all-ready drops again', host.netAllReady() === false);

// leave + slot reuse
host.netHostRemovePlayer('peerA');
check('leaver removed from roster', !host.roster().peerA);
check('freed slot 1 is the next assigned', host.netLowestFreeSlot() === 1);
const connC = fakeConn('peerC');
host.netState.peers.push(connC);
host.netHostAddPlayer('peerC', 'Carl');
check('rejoiner takes the freed slot (and its color)', host.netSlotOf('peerC') === 1 && host.netColorOf('peerC') === 0x3fd964);
const finalRoster = connC.sent.filter(m => m.t === 'roster').pop();
check('final roster wire format carries names + ready states',
  finalRoster && finalRoster.d.players.peerC.name === 'Carl' && finalRoster.d.players.HOST.ready === true, finalRoster);

/* ── client-side mirror ── */
console.log('CLIENT FLOW');
const client = makeInstance();
client.netState.role = 'client';
client.netState.myId = 'peerB';
client.netDispatch({ t: 'roster', d: { players: {
  HOST: { slot: 0, name: 'Gambino', ready: true },
  peerB: { slot: 2, name: '', ready: true },
  peerC: { slot: 1, name: 'Carl', ready: false }
} } }, fakeConn('HOST'));
check('client mirrors the roster', client.netNameOf('peerC') === 'Carl' && client.netSlotOf('HOST') === 0, client.roster());
check('client name fallback for itself', client.netNameOf('peerB') === 'P3');
check('client adopts its own ready state from the roster', client.myReady() === true);
check('client all-ready view matches host logic', client.netAllReady() === false);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
