import test from 'node:test';
import assert from 'node:assert/strict';
import { projectDateError } from './project-dates.ts';

test('no dates is valid', () => assert.equal(projectDateError(), null));
test('valid date range', () => assert.equal(projectDateError('2026-01-01','2026-12-31'), null));
test('same-day projects are allowed', () => assert.equal(projectDateError('2026-01-01','2026-01-01'), null));
test('finish before start is denied', () => assert.match(projectDateError('2026-12-31','2026-01-01'), /earlier/));
test('invalid leap day is denied', () => assert.match(projectDateError('2025-02-29',null), /valid/));
test('valid leap day accepted', () => assert.equal(projectDateError('2024-02-29',null), null));
test('invalid month is denied', () => assert.match(projectDateError(null,'2026-13-01'), /valid/));
test('free-form dates are denied', () => assert.match(projectDateError('today',null), /valid/));
