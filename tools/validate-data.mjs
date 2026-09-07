import { readFileSync, readdirSync } from 'node:fs';
import { COUNTRIES } from '../games/flags/js/data.js';

const imgDir = new URL('../games/flags/img/', import.meta.url).pathname;
const files = new Set(readdirSync(imgDir).filter((f) => f.endsWith('.svg')));
const codes = new Set();
const names = new Set();
const regions = new Set(['Asia', 'Europe', 'Africa', 'Oceania', 'Americas', 'Antarctica']);
const errors = [];

for (const c of COUNTRIES) {
  if (!/^[a-z]{2}$/.test(c.c)) errors.push(`bad code: ${c.c}`);
  if (codes.has(c.c)) errors.push(`duplicate code: ${c.c}`);
  if (names.has(c.n)) errors.push(`duplicate name: ${c.n}`);
  codes.add(c.c);
  names.add(c.n);
  if (!regions.has(c.r)) errors.push(`bad region: ${c.r} (${c.n})`);
  if (!files.has(`${c.c}.svg`)) errors.push(`missing flag: ${c.c}.svg (${c.n})`);
}
for (const f of files) {
  if (!codes.has(f.replace('.svg', ''))) errors.push(`orphan flag file: ${f}`);
}
if (COUNTRIES.length < 240) errors.push(`suspiciously few countries: ${COUNTRIES.length}`);

if (errors.length) {
  console.error('DATA CHECK FAILED:');
  errors.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log(`data check OK: ${COUNTRIES.length} countries, ${files.size} flag files, regions ${[...regions].join('/')}`);
