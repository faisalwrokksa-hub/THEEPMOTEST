import test from 'node:test';
import assert from 'node:assert/strict';
import { validInvitationToken, invitationErrorText } from './invitation-feedback.mjs';

const token = '11111111-1111-4111-8111-111111111111.' + 'a'.repeat(43);

test('only structurally valid single-use invitation tokens are submitted', () => {
  assert.equal(validInvitationToken(token), true);
  for (const value of [null, undefined, '', [], {}, 'a'.repeat(500),
    '11111111-1111-4111-8111-111111111111.' + 'a'.repeat(42),
    '11111111-1111-4111-8111-111111111111.' + 'a'.repeat(43) + '.extra',
    '11111111-1111-0111-8111-111111111111.' + 'a'.repeat(43)]) {
    assert.equal(validInvitationToken(value), false);
  }
});

test('upstream failure status maps only to safe bilingual user guidance', () => {
  for (const status of [0, 400, 401, 403, 404, 409, 410, 429, 500, 502, 503, 504]) {
    for (const lang of ['en', 'ar']) {
      const message = invitationErrorText(status, lang);
      assert.equal(typeof message, 'string');
      assert.ok(message.length > 15);
      assert.ok(!message.includes(token));
      assert.ok(!/stack trace|postgres|SELECT|internal server error/i.test(message));
    }
  }
  assert.match(invitationErrorText(429, 'en'), /Too many attempts/);
  assert.match(invitationErrorText(503, 'ar'), /الخدمة/);
});
