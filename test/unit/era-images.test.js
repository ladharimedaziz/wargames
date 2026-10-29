// The Cold War committee's period coats of arms and flags. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { COLD_COATS, COLD_FLAGS, COLD_COAT_OF, COLD_FLAG_OF, coatUrl, flagUrl } from '../../shared/data/era-images.js';
import { OUT_OF_BOUNDS } from '../../shared/engine/core.js';

const file = url => new URL(`../..${url}`, import.meta.url);

test('every period coat and flag has its file, and out-of-bounds lands get none', () => {
  for (const id of COLD_COATS) assert.ok(existsSync(file(`/client/img/coats/cold85/${id}.webp`)), `coat ${id}`);
  for (const id of COLD_FLAGS) assert.ok(existsSync(file(`/client/img/flags/cold85/${id}.webp`)), `flag ${id}`);
  for (const id of [...COLD_COATS, ...COLD_FLAGS, ...Object.keys(COLD_COAT_OF), ...Object.keys(COLD_FLAG_OF)]) assert.ok(!OUT_OF_BOUNDS.includes(id), id);
  for (const id of [...Object.keys(COLD_COAT_OF), '276', '840']) assert.ok(existsSync(file(coatUrl(id, 'cold85'))), `coat url ${id}`);
  for (const id of [...Object.keys(COLD_FLAG_OF), '276', '840']) assert.ok(existsSync(file(flagUrl(id, 'cold85'))), `flag url ${id}`);
});

test('the Cold War swaps in the 1985 coat and flag; other eras keep the modern ones', () => {
  assert.equal(coatUrl('278', 'cold85'), '/client/img/coats/cold85/278.webp');
  assert.equal(flagUrl('643', 'cold85'), '/client/img/flags/cold85/643.webp');
  assert.equal(flagUrl('643', 'modern'), '/client/img/flags/643.webp');
  assert.equal(coatUrl('643', undefined), '/client/img/coats/643.webp');
  assert.equal(flagUrl('840', 'cold85'), '/client/img/flags/840.webp');
  assert.equal(flagUrl('703', 'cold85'), flagUrl('203', 'cold85'));
});
