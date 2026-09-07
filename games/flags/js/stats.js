import { Store } from '../assets/js/store.js?v=09072120';
import { cycleTheme } from '../assets/js/theme.js?v=09072120';
import { makeSpeaker } from '../assets/js/pronunciation.js?v=09072120';
import { stats, RANK_LABELS, GLOBE, WORLD_COUNT } from './build.js?v=09072120';
import { REGIONS, COUNTRIES } from './data.js?v=09072120';
import { makeSpeaker as makeSpeakerLocal } from '../assets/js/pronunciation.js?v=09072120';

const speak = makeSpeaker(
  typeof speechSynthesis !== 'undefined' ? speechSynthesis : null,
  typeof SpeechSynthesisUtterance !== 'undefined' ? SpeechSynthesisUtterance : null,
);

const esc = (x) => String(x).replace(/[&<>"']/g, (c) => ({ '&': '&', '<': '<', '>': '>', '"': '"', "'": ''' }[c]));
const codeNames = Object.fromEntries(COUNTRIES.map((c) => [c.c, c.n]));

const p = Store.profile();
document.getElementById('who').textContent = `${Store.profileEmoji(p)} ${p}`;

let s = Store.load('flags');
let rescueView = false;
if (!Store.syncEnabled() && p !== 'Arjun') {
  try {
    const arjun = JSON.parse(localStorage.getItem('games.Arjun.flags') || 'null');
    if (arjun && arjun.totals && arjun.totals.plays > 0) { s = arjun; rescueView = true; }
  } catch {}

const p = Store.profile();
document.getElementById('who').textContent = `${Store.profileEmoji(p)} ${p}`;
const s = Store.load('flags');
let rescueView = false;
if (!Store.syncEnabled() && p !== 'Arjun') {
  try {
    const arjun = JSON.parse(localStorage.getItem('games.Arjun.flags') || 'null');
    if (arjun && arjun.totals && arjun.totals.plays > 0) { s = arjun; rescueView = true; }
  } catch {}

const p = Store.profile();
document.getElementById('who').textContent = `${Store.profileEmoji(p)} ${p}`;
const s = Store.load('flags');
let rescueView = false;
if (!Store.syncEnabled() && p !== 'Arjun') {
  try {
    const arjun = JSON.parse(localStorage.getItem('games.Arjun.flags') || 'null');
    if (arjun && arjun.totals && arjun.totals.plays > 0) { s = arjun; rescueView = true; }
  } catch {}

const p = Store.profile();
document.getElementById('who').textContent = `${Store.profileEmoji(p)} ${p}`;
const s = Store.load('flags');
let rescueView = false;
if (!Store.syncEnabled() && p !== 'Arjun') {
  try {
    const arjun = JSON.parse(localStorage.getItem('games.Arjun.flags') || 'null');
    if (arjun && arjun.totals && arjun.totals.plays > 0) { s = arjun; rescueView = true; }
  } catch {}

const p = Store.profile();
document.getElementById('who').textContent = `${Store.profileEmoji(p)} ${p}`;
const s = Store.load('flags');
let rescueView = false;
if (!Store.syncEnabled() && p !== 'Arjun') {
  try {
    const arjun = JSON.parse(localStorage.getItem('games.Arjun.flags') || 'null');
    if (arjun && arjun.totals && arjun.totals.plays > 0) { s = arjun; rescueView = true; }
  } catch {}
