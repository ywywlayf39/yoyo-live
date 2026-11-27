const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname + '/..';
const panel = fs.readFileSync(path.join(root, 'LiveQuizPanel.js'), 'utf8');
const room = fs.readFileSync(path.join(root, 'LiveRoomScreen.native.js'), 'utf8');

for (const rpc of ['yoyo_quiz_start', 'yoyo_quiz_get_state', 'yoyo_quiz_answer', 'yoyo_quiz_next']) {
  assert.ok(panel.includes("rpc('" + rpc + "'"), 'Missing server-validated quiz RPC: ' + rpc);
}
assert.ok(panel.includes("table: 'yoyo_quiz_sessions'"), 'Quiz must subscribe to session updates');
assert.ok(panel.includes("table: 'yoyo_quiz_rounds'"), 'Quiz must subscribe to question updates');
assert.ok(panel.includes("table: 'yoyo_quiz_participants'"), 'Quiz must subscribe to leaderboard updates');
assert.ok(panel.includes('answered || secondsLeft <= 0'), 'Players must not answer twice or after the timer');
assert.ok(panel.includes('correct_index'), 'Correct answer reveal must be driven by server state');
assert.ok(panel.includes('النقاط للترتيب والتحدي فقط'), 'Quiz points must be clearly non-cash');
assert.ok(!/wallets|wallet_transactions|purchased_coins|withdrawal/i.test(panel), 'Quiz must not touch wallet or withdrawal logic');
assert.ok(!room.includes("import LiveQuizPanel from './LiveQuizPanel'"), 'YOYO QUIZ must not be imported into live rooms');
assert.ok(!room.includes('<LiveQuizPanel'), 'YOYO QUIZ must not be mounted in the live room');

console.log('YOYO QUIZ static checks passed.');
