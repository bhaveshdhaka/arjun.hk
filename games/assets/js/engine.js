import { Store } from './store.js?v=20260907b';

const registry = new Map();
const pts = (ms) => 100 + Math.max(0, 50 - Math.floor(ms / 1000) * 5);
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CHEERS = ['Nice! 🎉', 'Correct! ⭐', 'Yes! 💪', 'Great! ✨', 'Nailed it! 🙌'];

export const QuizEngine = {
  register(def) { registry.set(def.id, def); },
  get(id) { return registry.get(id); },

  run(root, quizId) {
    const def = registry.get(quizId);
    if (!def) { root.innerHTML = '<p>Unknown quiz.</p>'; return; }

    const cfgKey = `games.${quizId}.cfg`;
    const state = {
      screen: 'intro',
      cfg: {},
      qs: [],
      idx: 0,
      score: 0,
      correct: 0,
      streak: 0,
      results: [],
      qStart: 0,
      sessionStart: 0,
      answered: false,
      timer: null,
    };
    def.config.forEach((c) => { state.cfg[c.key] = c.def; });
    loadCfg();

    const optVal = (o) => (o.value !== undefined ? o.value : o);
    const optLabel = (o) => (o.label !== undefined ? o.label : String(o));
    const clampCount = (c, v) => Math.max(c.min ?? 1, Math.min(c.max ?? 9999, Math.floor(Number(v) || 0) || (c.def ?? 1)));

    function loadCfg() {
      try {
        const saved = JSON.parse(localStorage.getItem(cfgKey));
        if (!saved || typeof saved !== 'object') return;
        def.config.forEach((c) => {
          const v = saved[c.key];
          if (v === undefined) return;
          if (c.type === 'chips') {
            const known = c.options.map(optVal);
            const list = (Array.isArray(v) ? v : []).filter((x) => known.includes(x));
            if (list.length) state.cfg[c.key] = list;
          } else if (c.type === 'number') {
            state.cfg[c.key] = clampCount(c, v);
          } else {
            state.cfg[c.key] = v;
          }
        });
      } catch {}
    }

    const saveCfg = () => { try { localStorage.setItem(cfgKey, JSON.stringify(state.cfg)); } catch {} };

    const syncCountFromInput = () => {
      const inp = root.querySelector('[data-num]');
      if (!inp) return;
      const c = def.config.find((x) => x.key === inp.dataset.num);
      state.cfg[c.key] = clampCount(c, inp.value.replace(/[^0-9]/g, ''));
    };

    const describeHtml = () => {
      if (!def.describe) return '';
      const d = def.describe(state.cfg);
      const text = typeof d === 'string' ? d : d.text;
      const warn = typeof d === 'object' && d.warn;
      return { text: esc(text), warn };
    };

    const updateVerdict = () => {
      const el = root.querySelector('#verdict');
      if (!el) return;
      const d = describeHtml();
      el.textContent = d.text;
      el.classList.toggle('warn', !!d.warn);
    };

    const render = () => screens[state.screen]();

    const dots = () => state.qs.map((_, i) => {
      if (i < state.results.length) return `<i class="d ${state.results[i] ? 'done' : 'miss'}"></i>`;
      if (i === state.idx) return '<i class="d cur"></i>';
      return '<i class="d"></i>';
    }).join('');

    const header = () => `
      <div class="topbar">
        <button class="chip" data-act="quit">✕</button>
        <span class="dots">${dots()}</span>
        <span style="display:flex;gap:.4rem">
          ${state.streak >= 2 ? `<span class="chip">🔥 ${state.streak}</span>` : ''}
          <span class="chip">⭐ ${state.score}</span>
        </span>
      </div>`;

    const KEYBAR = '<div class="keybar">⌨️ <kbd>1</kbd>–<kbd>9</kbd> answer · <kbd>Enter</kbd> next · <kbd>Esc</kbd> quit</div>';

    const endSession = () => {
      clearTimeout(state.timer);
      state.timer = null;
      if (state.results.length === 0) { state.screen = 'intro'; render(); return; }
      const session = {
        at: new Date().toISOString(),
        n: state.results.length,
        correct: state.correct,
        score: state.score,
        streak: Math.max(0, ...state.results.reduce((acc, ok, i) => {
          acc.push(ok ? (acc[i - 1] || 0) + 1 : 0);
          return acc;
        }, [])),
        timeMs: Date.now() - state.sessionStart,
        cfg: { ...state.cfg },
      };
      const saved = Store.recordSession(def.id, session);
      state.lastBest = session.score > 0 && session.score >= saved.totals.best && session.n === state.results.length;
      state.screen = 'summary';
      render();
    };

    const showQuestion = () => {
      const q = state.qs[state.idx];
      state.answered = false;
      state.qStart = performance.now();
      root.innerHTML = `
        ${header()}
        <div class="stage" id="stage"></div>
        <div id="playarea"></div>
        <div class="feedback" id="fb"></div>
        ${KEYBAR}`;
      def.render(root.querySelector('#stage'), q);
      const area = root.querySelector('#playarea');
      area.innerHTML = `
        <div class="answers">${q.choices.map((c, i) =>
          `<button class="answer" data-opt="${i}"><span class="num">${i + 1}</span> ${esc(c)}</button>`
        ).join('')}</div>`;
    };

    const headerSync = () => {
      const top = root.querySelector('.topbar');
      if (top) { top.outerHTML = header(); }
    };

    const answer = (i) => {
      if (state.answered) return;
      state.answered = true;
      const q = state.qs[state.idx];
      const ms = performance.now() - state.qStart;
      const ok = i === q.answer;
      const gained = ok ? pts(ms) : 0;
      state.results.push(ok);
      if (ok) { state.correct += 1; state.score += gained; state.streak += 1; }
      else { state.streak = 0; }
      root.querySelectorAll('.answer').forEach((b) => {
        b.disabled = true;
        const n = Number(b.dataset.opt);
        if (n === q.answer) b.classList.add('correct');
        else if (n === i) b.classList.add('wrong');
      });
      const fb = root.querySelector('#fb');
      if (ok) fb.innerHTML = `${CHEERS[Math.floor(Math.random() * CHEERS.length)]} +${gained}`;
      else fb.innerHTML = `It was <b>${esc(q.choices[q.answer])}</b> — we'll see it again soon`;
      fb.className = `feedback ${ok ? 'good' : 'bad'}`;
      headerSync();
      state.timer = setTimeout(next, ok ? 900 : 1800);
    };

    const next = () => {
      if (state.timer) { clearTimeout(state.timer); state.timer = null; }
      else return;
      if (state.idx + 1 >= state.qs.length) endSession();
      else { state.idx += 1; showQuestion(); }
    };

    const start = () => {
      def.config.forEach((c) => {
        if (c.type === 'number') state.cfg[c.key] = clampCount(c, state.cfg[c.key]);
      });
      syncCountFromInput();
      saveCfg();
      state.qs = def.buildQuestions(state.cfg);
      if (!state.qs.length) return;
      state.screen = 'play';
      state.idx = 0; state.score = 0; state.correct = 0; state.streak = 0;
      state.results = [];
      render();
    };

    const controlHtml = (c) => {
      if (c.type === 'chips') {
        const sel = state.cfg[c.key] || [];
        return `
          <div class="cfgrow">
            <label>${esc(c.label)}</label>
            <div class="chiprow">
              ${c.options.map((o) => {
                const v = optVal(o);
                const on = sel.includes(v);
                return `<button type="button" class="chip ${on ? 'on' : 'ghost'}" data-chip="${c.key}" data-val="${esc(String(v))}">${esc(optLabel(o))}</button>`;
              }).join('')}
            </div>
          </div>`;
      }
      if (c.type === 'number') {
        return `
          <div class="cfgrow">
            <label>${esc(c.label)}</label>
            <div class="stepper">
              <button type="button" data-step="-1" data-numkey="${c.key}">−</button>
              <input class="numfield" data-num="${c.key}" inputmode="numeric" pattern="[0-9]*" value="${Number(state.cfg[c.key])}" aria-label="${esc(c.label)}"/>
              <button type="button" data-step="1" data-numkey="${c.key}">+</button>
            </div>
          </div>`;
      }
      return `
        <div class="cfgrow">
          <label>${esc(c.label)}</label>
          <select class="cfg" data-key="${c.key}">
            ${c.options.map((o) => `<option value="${esc(String(optVal(o)))}" ${String(optVal(o)) === String(state.cfg[c.key]) ? 'selected' : ''}>${esc(optLabel(o))}</option>`).join('')}
          </select>
        </div>`;
    };

    const toggleChip = (c, val) => {
      const allVal = c.all;
      let sel = state.cfg[c.key] || [];
      if (allVal !== undefined && val === String(allVal)) {
        state.cfg[c.key] = [allVal];
        return;
      }
      let set = new Set(sel.filter((x) => x !== allVal).map(String));
      if (set.has(val)) set.delete(val);
      else set.add(val);
      if (set.size === 0) return;
      const others = c.options.map(optVal).filter((v) => v !== allVal).map(String);
      state.cfg[c.key] = set.size === others.length ? [allVal] : [...set];
    };

    const screens = {
      intro: () => {
        const s = Store.load(def.id);
        const presets = def.presets || [];
        const d = describeHtml();
        root.innerHTML = `
          <div class="topbar">
            <a class="chip" href="../">🏠 Play Room</a>
            <span class="chip">👑 ${esc(Store.profile())}</span>
          </div>
          <h1 class="title" style="animation:none">${def.emoji} ${esc(def.title)}</h1>
          <div class="sub">${esc(def.tagline)}</div>
          <div class="statrow">
            <span class="chip">🏆 Best: ${s.totals.best}</span>
            <span class="chip">🎮 ${s.totals.plays} played</span>
            <span class="chip">✅ ${s.totals.seen ? Math.round(100 * s.totals.correct / s.totals.seen) : 0}% correct</span>
          </div>
          ${presets.length ? `
          <div class="presets">
            ${presets.map((p, i) => `<button type="button" class="preset" data-preset="${i}"><span class="pl">${esc(p.label)}</span><span class="ps">${esc(p.sub)}</span></button>`).join('')}
          </div>` : ''}
          <div class="card">
            ${def.config.map(controlHtml).join('')}
            ${def.describe ? `<div class="verdict ${d.warn ? 'warn' : ''}" id="verdict">${d.text}</div>` : ''}
            <div class="actions">
              <button class="btn" data-act="start">▶ Start</button>
            </div>
          </div>
          ${KEYBAR}`;
      },

      play: () => {
        state.sessionStart = Date.now();
        showQuestion();
      },

      summary: () => {
        const s = Store.load(def.id);
        const acc = Math.round(100 * state.correct / state.results.length);
        root.innerHTML = `
          <div class="topbar">
            <a class="chip" href="../">🏠 Play Room</a>
            <span class="chip">👑 ${esc(Store.profile())}</span>
          </div>
          <div class="card" style="margin-bottom:1.2rem">
            <h1 class="title" style="animation:none;font-size:clamp(1.8rem,8vw,2.6rem)">Session complete! 🎉</h1>
            <div class="big" style="margin-top:.6rem"><span class="pct">⭐ ${state.score}</span></div>
            ${state.lastBest ? '<span class="pb">🏆 New personal best!</span>' : ''}
            <div class="statrow" style="margin-top:1.1rem;margin-bottom:0">
              <span class="chip">✅ ${state.correct}/${state.results.length}</span>
              <span class="chip">📊 ${acc}% accurate</span>
              <span class="chip">⏱ ${Math.round((Date.now() - state.sessionStart) / 1000)}s</span>
            </div>
          </div>
          <div class="card">
            <div class="meta" style="margin-bottom:.7rem">All-time: 🏆 best ${s.totals.best} · ${s.totals.plays} games · ${Math.round(s.totals.timeMs / 60000)} min played</div>
            <div class="actions">
              <button class="btn" data-act="start">🔁 Play again</button>
              <div class="row">
                <button class="btn alt" data-act="intro">⚙️ Change setup</button>
                <button class="btn alt" data-act="quit">🏠 Hub</button>
              </div>
            </div>
          </div>
          <footer>the caterpillar is proud of you! 🐛</footer>`;
      },
    };

    root.addEventListener('click', (e) => {
      const stepBtn = e.target.closest('[data-step]');
      if (stepBtn) {
        const c = def.config.find((x) => x.key === stepBtn.dataset.numkey);
        const step = Number(stepBtn.dataset.step) * (Number(state.cfg[c.key]) < 20 ? 1 : 5);
        state.cfg[c.key] = clampCount(c, Number(state.cfg[c.key]) + step);
        const inp = root.querySelector(`[data-num="${c.key}"]`);
        if (inp) inp.value = state.cfg[c.key];
        saveCfg();
        updateVerdict();
        return;
      }
      const chipBtn = e.target.closest('[data-chip]');
      if (chipBtn) {
        syncCountFromInput();
        const c = def.config.find((x) => x.key === chipBtn.dataset.chip);
        toggleChip(c, chipBtn.dataset.val);
        saveCfg();
        render();
        return;
      }
      const presetBtn = e.target.closest('[data-preset]');
      if (presetBtn) {
        const p = (def.presets || [])[Number(presetBtn.dataset.preset)];
        if (p) { state.cfg = { ...state.cfg, ...p.cfg }; start(); }
        return;
      }
      const act = e.target.closest('[data-act]');
      if (act) {
        const a = act.dataset.act;
        if (a === 'start') {
          root.querySelectorAll('select.cfg').forEach((sel) => {
            const v = sel.value;
            state.cfg[sel.dataset.key] = Number.isNaN(Number(v)) ? v : Number(v);
          });
          start();
        } else if (a === 'quit') {
          endSession();
        } else if (a === 'intro') {
          state.screen = 'intro';
          render();
        }
        return;
      }
      const opt = e.target.closest('[data-opt]');
      if (opt) answer(Number(opt.dataset.opt));
    });

    root.addEventListener('input', (e) => {
      const inp = e.target.closest('[data-num]');
      if (inp) {
        const c = def.config.find((x) => x.key === inp.dataset.num);
        state.cfg[c.key] = Number(inp.value.replace(/[^0-9]/g, '')) || 0;
        updateVerdict();
      }
    });

    root.addEventListener('change', (e) => {
      const inp = e.target.closest('[data-num]');
      if (inp) {
        const c = def.config.find((x) => x.key === inp.dataset.num);
        state.cfg[c.key] = clampCount(c, inp.value.replace(/[^0-9]/g, ''));
        inp.value = state.cfg[c.key];
        saveCfg();
        updateVerdict();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (state.screen === 'play') {
        if (e.key >= '1' && e.key <= '9') {
          const btn = root.querySelector(`[data-opt="${Number(e.key) - 1}"]`);
          if (btn) answer(Number(e.key) - 1);
        } else if (e.key === 'Enter') {
          if (state.answered) next();
        } else if (e.key === 'Escape') {
          endSession();
        }
      } else if (state.screen === 'intro' && e.key === 'Enter') {
        syncCountFromInput();
        start();
      }
    });

    render();
  },
};
