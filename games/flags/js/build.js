import { COUNTRIES } from './data.js';
import { TIDBITS } from './tidbits.js';

export const tidbitFor = (code) => TIDBITS[code] || null;

const GLOBE = { Asia: '🌏', Europe: '🌍', Africa: '🌍', Oceania: '🌏', Americas: '🌎', Antarctica: '🐧' };
const WORLD_COUNT = COUNTRIES.length;
const NAME_TO_CODE = new Map(COUNTRIES.map((c) => [c.n, c.c]));
const CODE_TO_COUNTRY = new Map(COUNTRIES.map((c) => [c.c, c]));

export const SRS_DAYS = [0, 1, 2, 4, 8, 16, 32];
export const MAX_BOX = 6;

export const emptySrsEntry = () => ({ box: 0, attempts: 0, correct: 0, streak: 0, avgMs: 0, due: 0, lastAt: 0 });

export const applyResult = (entry, ok, ms, now) => {
  const e = { ...(entry || emptySrsEntry()) };
  e.attempts = (e.attempts || 0) + 1;
  e.correct = (e.correct || 0) + (ok ? 1 : 0);
  e.streak = ok ? (e.streak || 0) + 1 : 0;
  e.avgMs = e.attempts > 1 ? Math.round((e.avgMs * (e.attempts - 1) + ms) / e.attempts) : Math.round(ms);
  e.box = ok ? Math.min(MAX_BOX, (e.box || 0) + 1) : 0;
  const days = SRS_DAYS[Math.min(e.box, SRS_DAYS.length - 1)];
  e.due = ok ? now + days * 86400000 : now + 10 * 60000;
  e.lastAt = now;
  return e;
};

export const rankOf = (e) => {
  if (!e || !e.attempts) return null;
  if (e.box >= 5) return 'champion';
  if (e.box >= 4) return 'sharp';
  if (e.box >= 2) return 'rising';
  return 'sprout';
};

export const RANK_LABELS = { sprout: '🌱 Sprout', rising: '🌿 Rising', sharp: '⚡ Sharp', champion: '🏆 Champion' };

export const weakness = (e) => {
  if (!e || !e.attempts) return 0;
  const acc = e.correct / e.attempts;
  return (3 - Math.min(e.box, 3)) * 2 + (acc < 0.7 ? 1 : 0) + (e.avgMs > 6000 ? 1 : 0);
};

export const stats = (srs, now = Date.now()) => {
  const entries = Object.entries(srs || {}).filter(([, e]) => e && e.attempts);
  const ranks = { sprout: 0, rising: 0, sharp: 0, champion: 0 };
  const byRegion = {};
  for (const [key, e] of entries) {
    const rk = rankOf(e);
    if (rk) ranks[rk] += 1;
    const code = key.replace('flag:', '');
    const country = CODE_TO_COUNTRY.get(code);
    if (!country) continue;
    const r = byRegion[country.r] || { attempts: 0, correct: 0 };
    r.attempts += e.attempts;
    r.correct += e.correct;
    byRegion[country.r] = r;
  }
  const weak = entries
    .map(([key, e]) => ({ key, code: key.replace('flag:', ''), e, w: weakness(e) }))
    .filter((x) => x.w > 0)
    .sort((a, b) => b.w - a.w || (a.e.correct / a.e.attempts) - (b.e.correct / b.e.attempts))
    .slice(0, 12);
  const due = entries.filter(([, e]) => (e.due || 0) <= now).length;
  return { seen: entries.length, ranks, byRegion, weak, due };
};

export const FAMILIES = [
  { codes: ['td', 'ro', 'md', 'ad'], name: 'The blue-yellow-red twins' },
  { codes: ['id', 'mc', 'pl'], name: 'The upside-down twins' },
  { codes: ['ml', 'sn', 'gn'], name: 'The green-yellow-red three' },
  { codes: ['au', 'nz'], name: 'Southern Cross twins' },
  { codes: ['us', 'lr', 'my'], name: 'Stripes & canton trio' },
  { codes: ['nl', 'lu', 'ru'], name: 'Red-white-blue trio' },
  { codes: ['no', 'is', 'dk', 'se', 'fi'], name: 'The Nordic cross family' },
  { codes: ['co', 'ec', 've'], name: 'The yellow-blue-red trio' },
  { codes: ['eg', 'sy', 'iq', 'ye'], name: 'The pan-Arab tricolors' },
  { codes: ['hu', 'bg', 'it', 'ie'], name: 'Tricolor mix-ups' },
  { codes: ['jp', 'bd', 'pw'], name: 'The circle-on-a-flag set' },
  { codes: ['qa', 'bh'], name: 'The maroon vs red pair' },
  { codes: ['at', 'lv', 'lb'], name: 'Red-white with something' },
  { codes: ['si', 'sk'], name: 'Slavic shield twins' },
  { codes: ['ee', 'bw'], name: 'The unlikely twins' },
];

const familyByCode = new Map();
for (const f of FAMILIES) for (const c of f.codes) familyByCode.set(c, f);
export const familyOf = (code) => familyByCode.get(code) || null;

export const pairKey = (a, b) => [a, b].sort().join('-');

export const PAIR_LESSONS = {
  'ro-td': "Chad's blue is darker, like night 🌙 — Romania's is brighter, like daytime sky. Same stripes, different blue!",
  'md-ro': "Romania is plain stripes. Moldova puts its eagle emblem 🦅 right in the middle of the same blue-yellow-red.",
  'md-td': "Chad is plain stripes. Moldova squeezes its eagle emblem 🦅 into the middle of the same stripes.",
  'ad-md': "Both wear emblems! Moldova's eagle holds a shield; Andorra's coat of arms is a quartered shield without an eagle.",
  'ad-ro': "Romania: plain blue-yellow-red stripes. Andorra: same stripes with its coat of arms sitting in the middle.",
  'ad-td': "Chad: plain stripes, dark night-blue. Andorra: brighter blue with its coat of arms in the centre.",
  'id-pl': "Indonesia: red fire on top 🔥, white clouds below. Poland: snow on top ❄️, red roof below. Upside-down twins!",
  'id-mc': "Almost identical twins! Monaco's red is brighter and the country is tiny — Indonesia is a giant of islands.",
  'mc-pl': "Monaco: red on top, white below, like Indonesia. Poland is the flipped one: white on top!",
  'ml-sn': "Senegal wears a green star ⭐ in its middle stripe. Mali is the plain one — no star at all.",
  'gn-ml': "Mali runs green→yellow→red. Guinea runs the other way: red→yellow→green!",
  'gn-sn': "Senegal has the star ⭐ and starts with green. Guinea starts with red and has no star.",
  'au-nz': "Australia has a big extra star ⭐ below the cross. New Zealand's four stars wear red coats with white trim.",
  'lr-us': "Liberia has 11 stripes and a star in a dark blue box. The USA has 50 stars and many more stripes.",
  'lr-my': "Liberia: one white star on a dark blue corner. Malaysia: a yellow star and crescent 🌙 on blue, with thinner stripes.",
  'my-us': "Malaysia's stripes are 14 thin ones, with a yellow star and crescent on blue.",
  'lu-nl': "Netherlands' blue is deep navy; Luxembourg's is a soft sky blue. Flags differ only in that blue!",
  'lu-ru': "Luxembourg: red-white-LIGHT blue. Russia: white-blue-red — flipped, with the white band on top!",
  'nl-ru': "Netherlands: red-white-blue horizontal. Russia: white-blue-red — flipped!",
  'co-ec': "Colombia's flag is plain stripes. Ecuador squeezes its coat of arms 🛡️ between the same stripes.",
  'co-ve': "Venezuela adds an arc of stars ⭐ on the blue stripe. Colombia keeps it plain.",
  'ec-ve': "Same yellow-blue-red! Venezuela has stars in an arc; Ecuador has a coat of arms in the middle.",
  'eg-iq': "Egypt wears a golden eagle 🦅. Iraq writes the takbir in green script.",
  'eg-sy': "Egypt has the golden eagle 🦅; Syria has two green stars ⭐⭐.",
  'eg-ye': "Egypt's red stripe carries an eagle 🦅. Yemen's stripes are completely plain.",
  'iq-sy': "Syria: two green stars ⭐⭐. Iraq: green writing across the middle.",
  'iq-ye': "Iraq has green script on red-white-black; Yemen's tricolor is plain.",
  'sy-ye': "Syria carries two stars ⭐⭐; Yemen is the plain one.",
  'bg-hu': "Hungary: red-white-green horizontal. Bulgaria: white-green-red horizontal. Order is everything!",
  'bg-ie': "Ireland: vertical green-white-orange. Bulgaria: horizontal white-green-red.",
  'bg-it': "Italy: vertical green-white-red. Bulgaria: horizontal white-green-red. Same colors, rotated!",
  'hu-ie': "Hungary's stripes are horizontal (red-white-green); Ireland's are vertical (green-white-orange).",
  'hu-it': "Hungary: horizontal red-white-green. Italy: vertical green-white-red. Same colors, different direction!",
  'ie-it': "Both vertical green-white-? — Italy finishes with red 🔴, Ireland with orange 🟠.",
  'bd-jp': "Japan: red circle ☀️ on white. Bangladesh: red circle on GREEN. Green is the land, red is the sun!",
  'bd-pw': "Bangladesh: red circle on green, in the middle. Palau: YELLOW circle on blue, sitting off-center.",
  'jp-pw': "Japan: red sun on white. Palau: yellow moon on deep blue, shifted to the left.",
  'bh-qa': "Bahrain's edge has 5 smooth bumps and is red. Qatar's edge has 9 jagged points and is deep maroon.",
  'at-lv': "Austria: bold red-white-red. Latvia: very dark red with a THIN white stripe.",
  'at-lb': "Austria: plain red-white-red. Lebanon: red top and bottom with a green cedar tree 🌲 in the middle.",
  'lb-lv': "Latvia: thin white line through dark red. Lebanon: white middle with a green cedar tree.",
  'si-sk': "Both Slavic white-blue-red with shields! Slovakia's shield has a double cross ⚫; Slovenia's shows mountains and 3 stars.",
  'bw-ee': "Estonia: blue-black-white horizontal. Botswana: light blue with a black stripe edged in white.",
  'dk-fi': "Denmark: white cross on red. Finland: white cross on BLUE.",
  'dk-is': "Denmark: white cross on red. Iceland: blue field with a red cross trimmed in white.",
  'dk-no': "Denmark's cross is plain white on red. Norway's cross is red with a white-and-blue border.",
  'dk-se': "Denmark: white cross on red. Sweden: YELLOW cross on blue.",
  'fi-is': "Finland: plain white cross on blue. Iceland: red cross with white trim on blue.",
  'fi-no': "Finland: plain white cross on blue. Norway: red cross wearing white-and-blue borders, on red.",
  'fi-se': "Both blue fields! Finland's cross is white ❄️, Sweden's cross is yellow 💛.",
  'is-no': "Both red-white-blue! Iceland: blue field, red cross with white trim. Norway: red field, white-blue trimmed cross.",
  'is-se': "Both blue fields! Iceland's cross is red with white trim, Sweden's is plain yellow.",
  'no-se': "Norway: red field with a white-and-blue bordered cross. Sweden: blue field with a plain yellow cross.",
};


export const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export const byRegion = (r) => COUNTRIES.filter((c) => c.r === r);

export const poolSize = (cfg) => {
  if (!cfg.region || cfg.region.includes('World')) return WORLD_COUNT;
  return COUNTRIES.filter((c) => cfg.region.includes(c.r)).length;
};

const sizeLabel = (n) => (n <= 10 ? 'a Quick one ⚡' : n <= 25 ? 'Regular 🎯' : n <= 50 ? 'a Long one 🔥' : 'a MARATHON 🏔️');

export const describe = (cfg) => {
  const pool = poolSize(cfg);
  const want = Math.floor(Number(cfg.count)) || 0;
  if (want > pool) return { text: `Only ${pool} flags here → playing all ${pool}`, warn: true };
  return { text: `${pool} flags available → ${want} is ${sizeLabel(want)}`, warn: false };
};

const pickDistractors = (pool, q, n) => {
  const fam = familyOf(q.c);
  const family = fam ? shuffle(pool.filter((c) => c.c !== q.c && fam.codes.includes(c.c))) : [];
  const sameRegion = shuffle(pool.filter((c) => c.c !== q.c && c.r === q.r && !(fam && fam.codes.includes(c.c))));
  const rest = shuffle(pool.filter((c) => c.c !== q.c && c.r !== q.r && !(fam && fam.codes.includes(c.c))));
  return [...family, ...sameRegion, ...rest].slice(0, n);
};

const basePool = (cfg) => {
  const world = !cfg.region || cfg.region.includes('World');
  return world ? COUNTRIES : COUNTRIES.filter((c) => cfg.region.includes(c.r));
};

const orderWeak = (pool, srs, now) => {
  const seen = pool.filter((c) => srs[`flag:${c.c}`] && srs[`flag:${c.c}`].attempts);
  const isNew = (c) => !srs[`flag:${c.c}`] || !srs[`flag:${c.c}`].attempts;
  const weak = seen
    .map((c) => ({ c, e: srs[`flag:${c.c}`], w: weakness(srs[`flag:${c.c}`]) }))
    .filter((x) => x.w > 0 || (x.e.due || 0) <= now)
    .sort((a, b) => b.w - a.w || (a.e.due || 0) - (b.e.due || 0))
    .map((x) => x.c);
  const fresh = shuffle(pool.filter(isNew));
  const rest = shuffle(pool.filter((c) => !weak.includes(c) && !isNew(c)));
  return [...weak, ...fresh, ...rest];
};

const selectPicks = (cfg, pool, n, srs, now) => {
  if (cfg.focus === 'Weak') return orderWeak(pool, srs, now).slice(0, n);
  if (cfg.focus === 'New') {
    const fresh = shuffle(pool.filter((c) => !srs[`flag:${c.c}`] || !srs[`flag:${c.c}`].attempts));
    if (fresh.length >= n) return fresh.slice(0, n);
    const old = shuffle(pool.filter((c) => !fresh.includes(c)));
    return [...fresh, ...old].slice(0, n);
  }
  const world = !cfg.region || cfg.region.includes('World');
  if (world) return shuffle(COUNTRIES).slice(0, n);
  const picks = [];
  for (const e of quotas(n, pool)) picks.push(...shuffle(byRegion(e.r)).slice(0, e.base));
  return picks;
};

export const buildQuestions = (cfg, srs = {}, now = Date.now()) => {
  const world = !cfg.region || cfg.region.includes('World');
  const pool = basePool(cfg);
  const n = Math.max(1, Math.min(Math.floor(Number(cfg.count)) || 10, pool.length));
  const picks = selectPicks(cfg, pool, n, srs, now);
  const deck = cfg.focus === 'Weak' ? picks : dealSmart(picks);
  return assignTypes(deck.map((c) => {
    const choices = shuffle([c, ...pickDistractors(pool, c, 3)]);
    return {
      c: c.c,
      country: c.n,
      region: c.r,
      choices: choices.map((x) => x.n),
      answer: choices.findIndex((x) => x.c === c.c),
    };
  }), srs, cfg.mode);
};

export const explainPair = (q, pickedName) => {
  const pickedCode = NAME_TO_CODE.get(pickedName);
  if (!pickedCode) return null;
  const famA = familyOf(q.c);
  if (!famA || !famA.codes.includes(pickedCode)) return null;
  const text = PAIR_LESSONS[pairKey(q.c, pickedCode)];
  if (!text) return null;
  const other = CODE_TO_COUNTRY.get(pickedCode);
  const others = famA.codes
    .filter((c) => c !== q.c && c !== pickedCode)
    .map((c) => {
      const country = CODE_TO_COUNTRY.get(c);
      return country ? { code: c, label: country.n } : null;
    })
    .filter(Boolean);
  return {
    flags: [
      { code: q.c, label: q.country },
      { code: pickedCode, label: other ? other.n : pickedName },
    ],
    others,
    family: famA.name,
    text,
  };
};

const strip = (s) => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();

export const ALIASES = {
  usa: 'us', 'united states of america': 'us', america: 'us',
  uk: 'gb', britain: 'gb', 'great britain': 'gb', england: 'gb',
  uae: 'ae', 'emirates': 'ae',
  'south korea': 'kr', korea: 'kr',
  holland: 'nl',
  'czech republic': 'cz', czechia: 'cz',
  burma: 'mm',
  macedonia: 'mk',
  swaziland: 'sz',
  'cape verde': 'cv',
  'ivory coast': 'ci',
  'east timor': 'tl',
  turkiye: 'tr', turkey: 'tr',
  persia: 'ir',
  'vatican city': 'va', vatican: 'va',
  'bosnia': 'ba',
  'russia federation': 'ru',
  'democratic republic of congo': 'cd', drc: 'cd',
  'republic of congo': 'cg', congo: 'cg',
  'south sudan republic': 'ss',
  'sao tome': 'st',
  'north korea': 'kp', 'dprk': 'kp',
  'lao': 'la',
  'syrian arab republic': 'sy',
  'islamic republic of iran': 'ir',
};

const NORM_NAME_TO_CODE = new Map(COUNTRIES.map((c) => [strip(c.n), c.c]));

export const levenshtein = (a, b) => {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
};

export const resolveName = (input) => {
  const norm = strip(input || '');
  if (!norm) return null;
  if (NORM_NAME_TO_CODE.has(norm)) return NORM_NAME_TO_CODE.get(norm);
  if (ALIASES[norm]) return ALIASES[norm];
  for (const [name, code] of Object.entries(ALIASES)) {
    if (levenshtein(norm, name) <= 1) return code;
  }
  let best = null, bestD = 3;
  for (const [name, code] of NORM_NAME_TO_CODE) {
    const d = levenshtein(norm, name);
    if (d < bestD) { bestD = d; best = code; }
  }
  return bestD <= (norm.length > 6 ? 2 : 1) ? best : null;
};

export const checkTypein = (q, input) => {
  const norm = strip(input || '');
  const target = strip(q.country);
  const resolved = resolveName(input);
  const matchedName = resolved && resolved !== q.c ? (CODE_TO_COUNTRY.get(resolved) || {}).n || null : null;
  if (resolved === q.c) return { ok: true, close: false, matched: null };
  const d = levenshtein(norm, target);
  const tol = target.length > 6 ? 2 : 1;
  if (d <= tol || matchedName) return { ok: false, close: d <= tol, matched: matchedName };
  return { ok: false, close: false, matched: null };
};

export const assignTypes = (qs, srs = {}, mode = 'choices') => {
  if (mode === 'typein') return qs.map((q) => ({ ...q, type: 'typein' }));
  if (mode === 'smart') {
    return qs.map((q) => {
      const e = srs[`flag:${q.c}`];
      return { ...q, type: e && e.attempts && e.box >= 4 ? 'typein' : 'choices' };
    });
  }
  return qs.map((q) => ({ ...q, type: 'choices' }));
};

export const quotas = (n, pool) => {
  const groups = new Map();
  for (const c of pool) groups.set(c.r, (groups.get(c.r) || 0) + 1);
  const entries = [...groups.entries()]
    .map(([r, size]) => ({ r, size, base: Math.floor((n * size) / pool.length) }))
    .sort((a, b) => ((n * b.size) % pool.length) - ((n * a.size) % pool.length) || b.size - a.size);
  let left = n - entries.reduce((a, e) => a + e.base, 0);
  for (const e of entries) {
    if (left <= 0) break;
    e.base += 1;
    left -= 1;
  }
  return entries;
};

export const dealSmart = (items) => {
  const rest = new Map();
  for (const it of shuffle(items)) {
    const list = rest.get(it.r) || [];
    list.push(it);
    rest.set(it.r, list);
  }
  const total = () => [...rest.values()].reduce((a, l) => a + l.length, 0);
  const out = [];
  let last = null;
  while (total() > 0) {
    let pick = null;
    for (const [r, list] of rest) {
      if (!list.length || r === last) continue;
      if (!pick || list.length > rest.get(pick).length) pick = r;
    }
    if (!pick) {
      for (const [r, list] of rest) {
        if (list.length) { pick = r; break; }
      }
    }
    out.push(rest.get(pick).pop());
    last = pick;
  }
  return out;
};

export { WORLD_COUNT, GLOBE };
