// Account and session tests. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.SESSION_SECRET = 'test-secret';
delete process.env.KRONOS_PASSWORD;
const auth = await import('../../server/auth.js');
auth.initAuth(mkdtempSync(join(tmpdir(), 'we-auth-')));

test('there is one Kronos and one Zeus account per committee', () => {
  const list = auth.accounts();
  assert.equal(list.length, 1 + auth.COMMITTEE_IDS.length);
  assert.ok(list.some(a => a.username === 'kronos' && a.role === 'kronos'));
  assert.ok(!list.some(a => a.role === 'stage'));
  assert.ok(list.some(a => a.username === 'ww3-backroom' && a.role === 'backroom'));
});

test('passwords are stable for the same secret and check correctly', () => {
  const pw = auth.passwordFor('ww3-backroom');
  assert.equal(auth.passwordFor('ww3-backroom'), pw);
  assert.match(pw, /^[a-z]+-[a-z]+-\d{3}$/);
  assert.ok(auth.checkPassword('ww3-backroom', pw));
  assert.ok(!auth.checkPassword('ww3-backroom', pw + 'x'));
  assert.notEqual(auth.passwordFor('bravo-backroom'), pw);
});

test('session tokens verify, and rotating a password signs that account out', () => {
  const token = auth.issueToken('bravo-backroom');
  assert.equal(auth.verifyToken(token)?.username, 'bravo-backroom');
  assert.equal(auth.verifyToken(token.slice(0, -2) + 'xx'), null);
  const old = auth.passwordFor('bravo-backroom');
  auth.rotatePassword('bravo-backroom');
  assert.notEqual(auth.passwordFor('bravo-backroom'), old);
  assert.equal(auth.verifyToken(token), null);
});
