# Menu v2 — work packages

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[B]` blocked.
Update this file BEFORE every report. Each WP has its own acceptance check and
must be verified before moving on. Screenshots land in `tmp/shots/` (repo-root,
gitignored after use).

- **WP-0 Baseline capture** `[ ]`
  Screenshots of current live pages (guest, admin, hub, quiz, stats) at all
  5 viewports, WebKit + Chromium. Acceptance: 2 × 5 × N pages stored, no code
  changes.


- **WP-1 CSS foundation + pressed/disabled states + toast** [x] done (chips min-heights, guest bottom-reserve, staff target, save button states)
- **WP-1.2 Toast** [x] (setMsg + toastHTML already extended by 8d5107d)
- **WP-2 Auto-save + undo** [x] (autosave ~1.2s post-edit; conflict guard kept; live "✓ Live at HH:MM")
- **WP-3.1 Grouped list + sort chips** [x] (menu/price/name, groups expanded)
- **WP-3.2 Thumbnails always visible (tap to replace)** [x]
- **WP-3.3 iOS switch + curated emoji picker + two-tap delete (was already present)** [x]
- **WP-3.4 Admin responsive 1/2/3-col (640→940→1200)** [x]
- **WP-4.1 Emoji chip always beside dish name** [x]
- **WP-4.2 Guest: all sections expanded + 4-col ≥1024 + centered panels ≥768 + jump chips + back-soon** [x]
- **WP-5 Games pages: hub profile chips + quiz preset chips now 40px+ tap targets; staff link 44px** [x]
- **WP-6 Ship gate** [~]
  6.1 check.sh extended — 210 checks green [x]
  6.2/6.3/6.4 — pending deploy + live re-run
Progress log: WP-0..WP-5 complete 14:xx; WP-6.1 done; 6.4 next.
 Ship gate**
  6.1 check.sh extended for every new control; commit.
  6.2 Two-engine × five-size browser suite (~60 checks) green vs live.
  6.3 Screenshot pack (before/after) presented for approval BEFORE deploy.
  6.4 Deploy → ops verify → live re-run of the browser suite against the
      deployed URLs.

Progress log:
- WP-0 started — (state/current)
