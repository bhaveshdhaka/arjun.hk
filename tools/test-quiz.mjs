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
check('explain family includes others[] (nordics)', (() => {
  const ex = build.explainPair({ c: 'no', country: 'Norway' }, 'Sweden');
  return ex && ex.others.length === 3 && ex.others.every((o) => o.label && o.code);
})());

const codeSet = new Set((await import('../games/flags/js/data.js')).COUNTRIES.map((c) => c.c));
let lessonFails = 0;
for (const fam of build.FAMILIES) {
  for (let i = 0; i < fam.codes.length; i++) {
    for (let j = i + 1; j < fam.codes.length; j++) {
      const key = [fam.codes[i], fam.codes[j]].sort().join('-');
      if (!codeSet.has(fam.codes[i]) || !codeSet.has(fam.codes[j])) { console.error(`FAIL - lesson family ${key}: unknown code`); lessonFails++; continue; }
      if (!build.PAIR_LESSONS[key]) { console.error(`FAIL - missing lesson for pair ${key} (${fam.name})`); lessonFails++; }
    }
  }
}
const orphanLessons = Object.keys(build.PAIR_LESSONS).filter((k) => {
  const [a, b] = k.split('-');
  return !codeSet.has(a) || !codeSet.has(b);
});
check(`every family pair has a written lesson (${Object.keys(build.PAIR_LESSONS).length} lessons)`, lessonFails === 0);
check('no lesson references unknown countries', orphanLessons.length === 0);

const { TIDBITS } = await import('../games/flags/js/tidbits.js');const badTidbits = Object.keys(TIDBITS).filter((k) => !codeSet.has(k));
const missingTidbits = [...codeSet].filter((c) => !TIDBITS[c]);
check(`every country has a tidbit (${Object.keys(TIDBITS).length})`, missingTidbits.length === 0 && badTidbits.length === 0);
const famNoTidbit = build.FAMILIES.flatMap((f) => f.codes).filter((c) => !TIDBITS[c]);
check('every lookalike family member has a tidbit', famNoTidbit.length === 0);
check('tidbitFor works', build.tidbitFor('al').includes('Eagle'));

const qFull = run({ region: ['World'], count: 250 }, {}, now);
const td = qFull.find((q) => q.c === 'td');
check('family distractors: Romania always among Chad options', td && td.choices.includes('Romania') && td.choices.includes('Moldova'));

check('stats aggregates ranks + weak', (() => {
  const st = build.stats(srsWeak, now);
  return st.seen === 3 && st.ranks.champion === 1 && st.weak.length >= 1 && st.due === 2;
})());

check('typein: exact ok', build.checkTypein({ c: 'fr', country: 'France' }, 'France').ok === true);
check('typein: case/space insensitive', build.checkTypein({ c: 'fr', country: 'France' }, '  FRANCE ').ok === true);
check('typein: 1-char typo forgiven as correct', build.checkTypein({ c: 'fr', country: 'France' }, 'Ftance').ok === true);
check('typein: alias USA ok', build.checkTypein({ c: 'us', country: 'United States' }, 'USA').ok === true);
check('typein: alias UK ok', build.checkTypein({ c: 'gb', country: 'United Kingdom' }, 'UK').ok === true);
check('typein: wrong far -> not close', (() => {
  const r = build.checkTypein({ c: 'fr', country: 'France' }, 'Brazil');
  return r.ok === false && r.close === false;
})());
check('typein: long-name 1-char typo forgiven', build.checkTypein({ c: 'ch', country: 'Switzerland' }, 'Switzerlandd').ok === true);
check('typein: matched country name returned for near-miss', build.checkTypein({ c: 'fr', country: 'France' }, 'Germany').matched === 'Germany');
check('resolveName: garbage -> null', build.resolveName('xyzzyplugh') === null);

const qsSmart = build.assignTypes(
  [{ c: 'de', country: 'Germany', region: 'Europe', choices: [], answer: 0 },
   { c: 'fr', country: 'France', region: 'Europe', choices: [], answer: 0 }],
  { 'flag:de': { box: 4, attempts: 6, correct: 5, streak: 4, avgMs: 900, due: now, lastAt: now } },
  'smart'
);
check('smart mixer: mastered flag -> type-in', qsSmart[0].type === 'typein');
check('smart mixer: learning flag -> choices', qsSmart[1].type === 'choices');
check('mode choices -> all choices', build.assignTypes([{ c: 'de', country: 'Germany', region: 'Europe', choices: [], answer: 0 }], {}, 'choices')[0].type === 'choices');
check('mode typein -> all type-in', build.assignTypes([{ c: 'de', country: 'Germany', region: 'Europe', choices: [], answer: 0 }], {}, 'typein')[0].type === 'typein');
check('buildQuestions honors mode', run({ region: ['World'], count: 5, mode: 'typein' }, {}, now).every((q) => q.type === 'typein'));

if (failures) { console.error(`\n${failures} test(s) failed`); process.exit(1); }
console.log('\nquiz logic tests OK');

const { validNewProfile, normalizeName } = await import('../games/assets/js/store.js');
check('profile: empty name rejected', validNewProfile('   ') !== null);
check('profile: arjun reserved (any case)', validNewProfile('ARJUN') !== null && validNewProfile('arjun ') !== null);
check('profile: guest reserved', validNewProfile('Guest') !== null);
check('profile: duplicate blocked', validNewProfile('mia', ['Mia']) !== null);
check('profile: valid name passes', validNewProfile('Mia') === null);
check('profile: names normalized + capped at 12', normalizeName('  Mia   Bell  ') === 'Mia Bell' && normalizeName('abcdefghijklmno').length === 12);

const theme = await import('../games/assets/js/theme.js');
check('theme: saved choice wins', theme.initialTheme({ getItem: () => 'dark' }, false) === 'dark');
check('theme: falls back to system', theme.initialTheme({ getItem: () => null }, true) === 'dark');
check('theme: system light default', theme.initialTheme({ getItem: () => null }, false) === 'light');
check('theme: broken storage safe', theme.initialTheme({ getItem: () => { throw new Error('x'); } }, false) === 'light');
check('theme: invalid saved ignored', theme.initialTheme({ getItem: () => 'sepia' }, true) === 'dark');
check('theme: next flips', theme.nextTheme('dark') === 'light' && theme.nextTheme('light') === 'dark');

if (failures) { console.error(`\n${failures} test(s) failed`); process.exit(1); }
console.log('\nquiz logic tests OK');

const { makeSpeaker } = await import('../games/assets/js/pronunciation.js');
check('pron: no synth = no-crash noop', makeSpeaker(null, null)('France') === false);
check('pron: speaks with lang + rate', (() => {
  const spoken = [];
  const synth = { cancel() {}, speak(u) { spoken.push(u); } };
  const Ut = class { constructor(t) { this.text = t; } };
  const say = makeSpeaker(synth, Ut);
  const okR = say('France');
  return okR === true && spoken.length === 1 && spoken[0].text === 'France' && spoken[0].lang === 'en-US' && spoken[0].rate === 0.85;
})());
check('pron: cancel before each speak', (() => {
  let cancels = 0;
  const synth = { cancel() { cancels++; }, speak() {} };
  const Ut = class { constructor(t) { this.text = t; } };
  const say = makeSpeaker(synth, Ut);
  say('Chad'); say('Romania');
  return cancels === 2;
})());
