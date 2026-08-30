# 09 · Site Blueprint — southpawaesthetic.com

The build specification. Everything here traces to harvested research (docs 01–08). A working draft implementing this spec ships at **/manish/site-draft/** in this repo.

## Sitemap (v1)

```
/                    Home (full single-page narrative + anchors)
/method  (anchor)    ATG-informed approach
/results (anchor)    Proof strip (championship, podcast, client story)
/coaching (anchor)   Services + how it works
/about   (anchor)    Origin story + fight résumé
/faq     (anchor)    Objection handling
→ DM CTA throughout (Instagram direct message — his existing funnel)
```

Single page, five anchors. No blog at launch (his Instagram *is* the content engine; embed it).

## Section-by-section spec

### 0 · Sticky nav
`SOUTHPAW AESTHETIC` wordmark (Anton, all-caps) · anchors · gold **DM TO TRAIN** button → instagram.com/southpawaesthetic.

### 1 · Hero
- **Backdrop:** ink `#141414`, faint `#B03A2E` texture; one embedded reel cover of the AJP walkout/fight content (from `DLu4wijSn1Z` or `DLOz2a3RJ5l`) as masked media column.
- **H1 (Anton, all caps, gold `#FFD520`):** `CONQUER PAIN. DON'T JUST MANAGE IT.` — lifted directly from his bio.
- **Sub (his words):** "Strength & Rehab Coach · 10+ years in the game · Martial Artist"
- **Proof ribbon under H1:** `ATG LEVEL 3 CERTIFIED` · `AJP INDIA 2025 CHAMPION` · `FEATURED ON THE ATG PODCAST`
- **CTA:** gold button "DM FOR COACHING" + ghost button "See the method".

### 2 · Authority strip (the trust block)
Four cards, each linking its source:
1. ATG L3 directory listing (doc 06 §3)
2. AJP India gold + #1 ranking announcement embed (`DLOz2a3RJ5l`)
3. ATG Podcast episode player (Spotify embed, 15 Jan 2025)
4. "One of the first Level 3 ATG coaches in the Eastern Hemisphere" — podcast copy quote

### 3 · Method (P1)
- Headline: "Slow is a weapon." (his line)
- Body: ATG framework in his register — ground-up, side-to-side, front-to-back, short-range/long-range, light-to-heavy. Six movement cards: ATG Split Squat · Nordic Curl · Step-Up · Sled Push/Pull · Loaded Dip/Carry · Tibialis/Calf Work (all documented in his posts + ATG articles).
- Media: `Dbsu82cubLH` (split squat + Nordic reel), `DMMWarcSuHk` (ATG split squats in nature).
- Compliance note: scaled-for-you language; no medical claims (doc 06 §6).

### 4 · Proof / Results (P3)
- Client story, verbatim block-quote from `DbPyhWquc6z` ("zero pushups… 30kg weighted pull-ups") framed as "a client story, in Manish's words" + embed.
- Championship mini-timeline: 2008 origin → 2024 ATG L3 (`C91KGxjyfkF`) → Jun 2025 AJP gold + #1 India → 2026 GPP process series.

### 5 · About (P4 + P5)
- Portrait-style block using his profile photo energy (black polo, contemplative) + Himalaya content (`DMUOyQWS9Bd`, `DMNUfccS5xS`) for the nature-medicine identity.
- Origin narrative from doc 04 ("the person I needed… way back in 2008").
- Mentor chain line: trained under the eyes of Ben Patrick & Keegan Smith's ATG system.
- One devotional signature allowed: "HAR HAR MAHADEV 🔱" as a sign-off flourish.

### 6 · Coaching (services — directory-anchored)
Three cards exactly matching the ATG directory listing:
1. **Online Coaching** — programming, check-ins, homework culture
2. **Online Personal Training** — remote live sessions
3. **1:1 Personal Training** — in-person, Tricity (Mohali/Chandigarh)
Each: who it's for (directory client groups), what a week looks like (from his process posts), CTA "DM 'READY'". *No pricing until Manish confirms (doc 10).*

### 7 · FAQ (objections)
- "Is this physiotherapy?" → coaching, not medical treatment; scoped per doc 06 §6.
- "Online actually works?" → the 30 kg pull-up story happened on twice-weekly + homework.
- "I'm not a fighter." → directory client groups; fighters are the loudest clients, not the only ones.
- "What is ATG?" → 3-line method explainer + principles link.
- "Where are you?" → Mohali, Punjab; online worldwide.

### 8 · Footer
IG handle · ATG directory link · podcast link · AJP event link · "Built on the ATG framework" · noindex until approval.

## Technical spec

- Static single `index.html` + `style.css`, zero build step, nginx:alpine (matches this repo's arjun.hk pattern).
- Fonts: Google Fonts Anton + Inter (one `<link>`), system fallback stack.
- Instagram: styled **link-cards** (cover + caption + "View on Instagram") — zero third-party JS; upgradeable to official embeds post-approval.
- `noindex` meta until Manish approves; then title/meta/description from doc 08 keyword seeds:
  - title: "Southpaw Aesthetic — Manish Singh · Strength & Rehab Coach, Mohali"
  - description: "Conquer pain, don't just manage it. ATG Level 3 coach, AJP India champion, and martial artist Manish Singh — online & 1:1 coaching."
- Lighthouse posture: single file, no JS frameworks, lazy-loaded images.

## Launch checklist

1. Manish approves copy + claims (docs 04/06 wording).
2. Pricing/booking added (doc 10).
3. Original portraits replace embeds where he supplies them.
4. Swap link-cards → official IG embeds if he prefers.
5. Remove `noindex`, submit to Search Console, announce via his own IG (his channel, his audience).
