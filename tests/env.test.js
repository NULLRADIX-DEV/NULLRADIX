import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveMode } from '../src/modules/env.js';

test('override wins', () => {
  assert.equal(resolveMode({ reducedMotion: true, saveData: false, override: '1', filmSupported: true }), 'film');
  assert.equal(resolveMode({ reducedMotion: false, saveData: false, override: '0', filmSupported: true }), 'static');
});

test('reduced motion / save-data / unsupported → static', () => {
  assert.equal(resolveMode({ reducedMotion: true, saveData: false, override: null, filmSupported: true }), 'static');
  assert.equal(resolveMode({ reducedMotion: false, saveData: true, override: null, filmSupported: true }), 'static');
  assert.equal(resolveMode({ reducedMotion: false, saveData: false, override: '1', filmSupported: false }), 'static');
});

test('default film', () => {
  assert.equal(resolveMode({ reducedMotion: false, saveData: false, override: null, filmSupported: true }), 'film');
});
