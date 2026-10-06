/**
 * Soundscape - filled in by the sound task. Until then the toggle stays hidden.
 */
import { qs } from '../utils/dom.js';

export function createSound() {
  qs('[data-sound]').hidden = true;
  return { update() {} };
}
