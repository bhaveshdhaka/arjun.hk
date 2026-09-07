import * as build from '../games/flags/js/build.js';

const def = { describe: build.describe };
if (!def) { console.error('FAIL: build module loaded'); process.exit(1); }
const run = build.buildQuestions;

let failures = 0;
const check = (name, cond) => {
  if (cond) console.log(`ok - ${name}`);
  else { failures++; console.error(`FAIL - ${name}`); }
};

const codes = (qs) => qs.map((q) => q.c);
const unique = (qs) => new Set(codes(qs)).size === qs.length;
const regionsOf = (qs) => new Set(qs.map((q) => q.region));

const qAll = run({ region: ['World'], count: 250 });
check('world 250 -> 250 questions', qAll.length === 250);
check('world 250 -> no duplicates', unique(qAll));

const qAnt = run({ region: ['Antarctica'], count: 50 });
check('antarctica 50 -> clamped to pool (5)', qAnt.length === 5);
check('antarctica -> all antarctica', regionsOf(qAnt).size === 1);

const qEA = run({ region: ['Europe', 'Asia'], count: 20 });
check('europe+asia 20 -> 20 questions', qEA.length === 20);
check('europe+asia 20 -> no duplicates', unique(qEA));
check('europe+asia 20 -> only europe/asia', [...regionsOf(qEA)].every((r) => r === 'Europe' || r === 'Asia'));
const asiaShare = codes(qEA).filter((c) => qEA.find((q) => q.c === c).region === 'Asia').length;
check(`europe+asia 20 -> proportional split (asia=${asiaShare}, expect 9-11)`, asiaShare >= 9 && asiaShare <= 11);

const qW50 = run({ region: ['World'], count: 50 });
check('world 50 -> 50 questions', qW50.length === 50);
let maxRun = 1, cur = 1;
for (let i = 1; i < qW50.length; i++) {
  cur = qW50[i].region === qW50[i - 1].region ? cur + 1 : 1;
  maxRun = Math.max(maxRun, cur);
}
check(`world 50 -> no 3+ same-region streaks (max run ${maxRun})`, maxRun <= 2);

const qCount = run({ region: ['World'], count: 7 });
check('world 7 -> 7 questions', qCount.length === 7);
check('every question: 4 unique choices, valid answer index', run({ region: ['World'], count: 30 }).every((q) =>
  q.choices.length === 4 && new Set(q.choices).size === 4 && q.choices[q.answer] === q.country
));

const d1 = def.describe({ region: ['World'], count: 10 });
const d2 = def.describe({ region: ['Antarctica'], count: 50 });
const d3 = def.describe({ region: ['World'], count: 300 });
check('describe world ok', typeof d1.text === 'string' && d1.warn === false);
check('describe antarctica warns', d2.warn === true);
check('describe over-max warns', d3.warn === true);

if (failures) { console.error(`\n${failures} test(s) failed`); process.exit(1); }
console.log('\nquiz logic tests OK');
