// Entry for the static legal pages (Impressum, Datenschutz).
// Deliberately minimal: no field/panel/scroll JS — just shared styles, fonts,
// and the year stamp. NOTE: legal pages must NOT use [data-reveal] (its CSS
// hides content until scroll.js adds .is-in, and scroll.js isn't loaded here).
import './styles/legal.css';

// self-hosted variable fonts (same as the home page)
import '@fontsource-variable/roboto-flex/full.css';
import '@fontsource-variable/inter';
import '@fontsource-variable/space-grotesk';
import { wirePageJumps, takeArrival } from './modules/pagejump.js';

const year = document.querySelector('[data-year]');
if (year) year.textContent = String(new Date().getFullYear());

// the lens between pages: open if we arrived through it, close it when leaving to another page
const arrival = takeArrival();
let motion = !matchMedia('(prefers-reduced-motion: reduce)').matches || !!arrival;
try {
  motion ||= sessionStorage.getItem('nr-motion') === '1';
} catch {
  /* no session */
}
if (motion) {
  const jump = wirePageJumps();
  if (arrival) jump.arrive({ ...arrival, ready: () => document.fonts.ready });
}
