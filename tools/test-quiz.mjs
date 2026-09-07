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
check(`world 50 -> no adjacent same-region (max run ${maxRun})`, maxRun === 1);

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

const now = Date.now();
let e0 = build.applyResult(undefined, true, 2000, now);
check('srs: correct -> box 1, due tomorrow', e0.box === 1 && e0.due === now + 86400000);
e0 = build.applyResult(e0, true, 2000, now);
e0 = build.applyResult(e0, false, 2000, now);
check('srs: miss resets box to 0, due in 10min', e0.box === 0 && e0.due === now + 600000);
check('srs: streak resets on miss', e0.streak === 0);
check('srs: avg ms tracks', e0.avgMs === 2000);
check('srs: attempts counted', e0.attempts === 3 && e0.correct === 2);

check('rank: box0 = sprout', build.rankOf(e0) === 'sprout');
const champ = build.applyResult(build.applyResult(build.applyResult(build.applyResult(build.applyResult(e0, true, 100, now), true, 100, now), true, 100, now), true, 100, now), true, 100, now);
check('rank: 5 more correct = champion', champ.box === 5 && build.rankOf(champ) === 'champion');

const srsWeak = {
  'flag:fr': { box: 0, attempts: 4, correct: 1, streak: 0, avgMs: 9000, due: now - 1000, lastAt: now },
  'flag:de': { box: 5, attempts: 5, correct: 5, streak: 5, avgMs: 800, due: now + 86400000, lastAt: now },
  'flag:jp': { box: 3, attempts: 3, correct: 3, streak: 3, avgMs: 1000, due: now - 500, lastAt: now },
};
const qWeak = run({ region: ['World'], count: 5, focus: 'Weak' }, srsWeak, now);
check('weak focus: fr first (weakest)', qWeak[0].c === 'fr');
check('weak focus: no unseen before due weak', qWeak.slice(0, 2).map((q) => q.c).every((c) => ['fr', 'jp'].includes(c)));

const qNew = run({ region: ['World'], count: 5, focus: 'New' }, srsWeak, now);
check('new focus: no seen flags first', qNew.slice(0, 2).every((q) => !['fr', 'de', 'jp'].includes(q.c)));

const ex1 = build.explainPair({ c: 'td', country: 'Chad' }, 'Romania');
check('explain pair chad/romania', ex1 && ex1.flags.length === 2 && ex1.text.length > 20);
const ex2 = build.explainPair({ c: 'td', country: 'Chad' }, 'Japan');
check('explain non-family = null', ex2 === null);

const qFull = run({ region: ['World'], count: 250 }, {}, now);
const td = qFull.find((q) => q.c === 'td');
check('family distractors: Romania always among Chad options', td && td.choices.includes('Romania') && td.choices.includes('Moldova'));

check('stats aggregates ranks + weak', (() => {
  const st = build.stats(srsWeak, now);
  return st.seen === 3 && st.ranks.champion === 1 && st.weak.length >= 1 && st.due === 2;
})());

if (failures) { console.error(`\n${failures} test(s) failed`); process.exit(1); }
console.log('\nquiz logic tests OK');
