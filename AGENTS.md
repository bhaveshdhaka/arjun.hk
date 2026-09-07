# arjun.hk

Static site (`index.html` + `games/` section, served by `nginx:alpine`).
Single branch `main`. Deploys are **fleet-managed** (k3s on `hk-03-dev`,
service `arjun-hk`, host `arjun.hk`, multiple sites → pass `--site hk-03-dev`
to fleet ops). There is no Coolify, no ghcr deploy path, and no webhook —
the GitHub CI workflow runs `check.sh` only; it is a lint gate, not the
deploy pipeline.

## Site structure

- `index.html` — restaurant menu page: inline CSS, no JS, no external assets.
  - Header: "Baby Boy's Restaurant" + "Now Open!" badge
  - Menu grid: 5 cards (Cheese, Matcha, Bagel, Cream, Ice-Cream), priced in
    "dollarbucks"
  - Payment section: "We accept dollarbanks 💳" chips — Tap/NFC (contactless
    waves), Octopus (HK octopus-card swirl), Visa (wordmark), Mastercard
    (overlapping circles). Icons are inline SVG on purpose — adding images/
    files means check.sh validates them, and the page stays self-contained.
  - "Play Room" link chip + caterpillar footer 🐛
- `games/` — quiz section (vanilla ES modules, no build system):
  - `games/index.html` — Play Room hub (Arjun/Guest profile, totals)
  - `games/flags/` — Flags of the World quiz; `js/build.js` = pure logic
    (node-testable), `js/quiz.js` = browser wiring, `img/*.svg` = 250 flags
    from flagcdn (flagpedia)
  - `games/assets/js/engine.js` — reusable quiz engine (presets, chips,
    number stepper, session/scoring/keyboard); `store.js` = localStorage
    profiles/stats
- `tools/` — `validate-data.mjs` (countries ↔ flags integrity),
  `test-quiz.mjs` (quiz logic), `bump-assets.sh` (cache-bust versioning)
- `check.sh` — static validation + data + quiz tests, same script CI runs
- `.github/workflows/ci.yml` — push gate: runs check.sh on main. Nothing
  else (the old GHCR build + Coolify trigger was removed; it was dead).

## Before you ship

Ship protocol — all six gates, in order, every time. "Checked" means this
list ran; anything outside the list is stated explicitly as unverified.

1. **Logic tests** — `node tools/test-quiz.mjs` (SRS math, quotas, type-in
   grading, profiles, lessons coverage). Blocks ship on failure.
2. **Data + link integrity** — `node tools/validate-data.mjs` (countries ↔
   flags), page scans, **JS-generated `href`/`src` scan** (runtime links are
   checked against every page dir), banned-glyph check (☁ renders as a blob
   on iOS chips — use the `.dot` status indicator).
3. **Headless flow tests** — `node tests/flow.test.mjs`: a DOM stub drives
   the real engine/hub/store through user paths (wrong-PIN isolation,
   sign-in merge, drills autostart, type-in toggle, summary, sign-out).
   These simulate behavior, NOT pixels.
4. **Dead-button inventory** — part of flow tests: every emitted
   `data-*`/href must have a handler or existing target.
5. **Presentation audit** — emoji render-safety, touch-target size, safe
   areas, spacing; findings written into the handoff, not assumed clean.
6. **Honest handoff** — every deploy message states: verified by me (X, Y),
   NOT verifiable by me (Z), and a ≤30s numbered check for Z only.

If anything under `games/` changed, bump the asset cache-bust version
(Cloudflare caches .js/.css by extension — stale assets otherwise):

```bash
bash tools/bump-assets.sh
```

Then run the check locally — it's the same command CI runs:

```bash
bash check.sh
```

It verifies every page + referenced local asset (including runtime links),
country↔flag data integrity, the quiz logic tests, and the flow tests.
Fix anything that fails first.

## Ship (fleet is the only deploy path)

Commit your work, then from the **fleet repo**:

```bash
export FLEET_ROOT=/home/openchamber/workspaces/fleet
export FLEET_SECRETS_HOME=/root/.fleet/secrets   # secrets live under /root
export FLEET_TOOLCHAIN_PREFIX="$FLEET_ROOT/.toolchain"  # pinned Go for the
                                                 # fleet CLI shim — it rebuilds
                                                 # dist/fleet whenever fleet
                                                 # sources are newer; without
                                                 # this the build dies with
                                                 # "no usable go binary"
cd "$FLEET_ROOT"
./scripts/fleet ops build  arjun-hk              # kaniko build from the local
                                                 # arjun.hk checkout
./scripts/fleet ops deploy arjun-hk              # rollout + dns + tunnel + monitor
```

Verify:

```bash
./scripts/fleet ops verify arjun-hk
curl -s -o /dev/null -w '%{http_code}\n' https://arjun.hk
```

That's it. `git push` publishes source; `ops build` + `ops deploy` make it
live. CI is a lint gate, not the deploy pipeline.
