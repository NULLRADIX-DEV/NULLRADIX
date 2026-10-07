import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projects, skills, experience } from '../src/data/content.js';
import { NODES, MILESTONES, makeWorld } from '../src/film/world.js';

// the film is rendered from world.js; content.js drives the DOM. They must describe the same world.
test('every film node is a project with the same coordinate', () => {
  assert.equal(NODES.length, projects.length);
  for (const n of NODES) {
    const p = projects.find((q) => q.id === n.id);
    assert.ok(p, `no project with id ${n.id}`);
    assert.deepEqual(p.coord, n.coord);
  }
});

test('one glass panel per skill group', () => {
  for (const fmt of ['l', 'p']) assert.equal(makeWorld(fmt).panels.length, skills.length);
});

test('one timeline marker per experience entry', () => {
  assert.equal(MILESTONES.length, experience.length);
});

test('one slam word in the bore per discipline', async () => {
  const { disciplines } = await import('../src/data/content.js');
  const { SLAMS } = await import('../src/film/world.js');
  assert.equal(disciplines.length, SLAMS.length);
  for (const d of disciplines) assert.ok(d.k && d.v);
});
