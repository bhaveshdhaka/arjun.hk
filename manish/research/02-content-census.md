# 02 · Content Census — @southpawaesthetic

**Account total:** 231 posts (Instagram-reported, 30 Aug 2026).
**This census:** live harvest via Instagram's public feed API from hk03, paginating the full timeline. Harvest is incremental and idempotent — pages land in `/tmp/opencode/manish-research/feed-*.json` and merge into `media/manifest.json` in this repo.

## Harvest status at dossier build

| Item | Count |
|---|---|
| Posts harvested with full data | see `media/manifest.json` (`meta.harvest.count`) |
| Coverage of 231 | see `meta.harvest.coverage` |
| Fields per post | shortcode, permalink, timestamp, type (photo/reel/video/carousel), full caption, likes, comments, tagged accounts, co-authors, cover-image URL, video URL, carousel image URLs |

> **Why not all 231 at once:** anonymous API access is rate-limited by Instagram (HTTP 429-style "please wait" responses after ~2 rapid requests). The paginator (`paginate2.sh`, included below) spaces requests minutes apart and retries until the feed is exhausted. It was still running at dossier-build time; **re-run the harvest to top up to 100%** — every remaining gap is filled by re-running one script.

## Harvest procedure (reproducible)

```bash
# 1) profile snapshot (bio, counts, latest 12, cursor)
curl -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ... Chrome/139 Safari/537.36" \
  -H "x-ig-app-id: 936619743392459" \
  "https://www.instagram.com/api/v1/users/web_profile_info/?username=southpawaesthetic"

# 2) feed pagination (user-id 3955140834), repeat with next_max_id until more_available=false
curl -A "<same UA>" -H "x-ig-app-id: 936619743392459" \
  "https://www.instagram.com/api/v1/feed/user/3955140834/?count=33&max_id=<cursor>"

# 3) wait 4–7 minutes between requests; on rate-limit, sleep 420s and retry (paginator does this)
```

Anonymous access yields: full captions, like/comment counts, media URLs (including reel cover frames and often direct MP4 URLs), timestamps, tags. It does **not** yield: stories, highlight contents, comment threads, follower lists.

## Media-rights stance (set by site owner)

**Inventory only — no media files are copied into this repository.** The manifest records source URLs (they expire after days) and permanent permalink URLs. For production, either use Instagram's official embed or obtain originals from Manish (see doc 10).

## Best performers (from harvested posts, as of build)

| Rank | Post | Date | Type | Likes | Comments | Theme |
|---|---|---|---|---|---|---|
| 1 | `DLpHBnGyPic` "99% v/s 1%" | 2025-07-03 | reel | 239 | 7 | fight identity / discipline |
| 2 | `DLVKCYiSf8R` "WINNING celebration with team" | 2025-06-25 | carousel | 193 | 7 | AJP gold celebration |
| 3 | `DLu4wijSn1Z` "SOME WAR ROUNDS" | 2025-07-05 | carousel | 155 | 1 | boxing identity |
| 4 | `DL18ya8yAp8` "BORN TO FIGHT / LEARN TO WIN / LIVE TO HELP" | 2025-07-08 | reel | 117 | 5 | fight culture |
| 5 | `Dba3vhhO3eN` "Week 4, Phase 1 GPP" | 2026-07-30 | reel | 69 | 8 | training process |
| 6 | `DLOz2a3RJ5l` "THE FIGHT — AJP INDIA Champion" | 2025-06-23 | reel | 58 | 11 | championship announcement |

**Pattern:** fight-identity and competition content massively out-performs gym-technique content (3–7×). Technique/rehab reels hold a steady 25–50 likes with comment ratios that suggest genuine coaching questions.

## Posting cadence observed

- Active month clusters: Jun–Aug 2025 (fight-competition season), Feb 2026, Jul–Aug 2026 (current GPP series).
- Reels dominate (~75% of harvest); carousels for photo essays/celebrations; photos rare.
- Caption style bifurcates: short + hashtag-heavy on fight posts, long-form storytelling on coaching milestones.

## Complete shortcode register

Full machine-readable register with all fields lives in **`manish/media/manifest.json`**. Key anchor posts:

| Shortcode | Why it matters |
|---|---|
| `DLOz2a3RJ5l` | AJP India 2025 GOLD + "#1 ranking in India" announcement |
| `DLVKCYiSf8R` | Team gold celebration (community proof) |
| `DHLbEtzyRAf` | ATG L3 gratitude post — full ecosystem thanks (Mar 2025) |
| `C91KGxjyfkF` | "Finally in the league" — ATG L3 graduation reel (Jul 2024) |
| `C9epfs8SqaL` | Bulgarian split squat education post (Jul 2024) |
| `DIOW7ItSRio` | Alternate AJP result post ("Mastering the art of jiu-jitsu one roll at a time") |
| `DbPyhWquc6z` | Client transformation story (zero → 30 kg weighted pull-ups) |
| `DLpHBnGyPic` | Best-performing reel (239 likes) |
