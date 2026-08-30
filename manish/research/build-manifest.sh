#!/bin/bash
# Build manish/media/manifest.json from the /tmp harvest directory.
# Re-run after paginate2.sh collects more feed pages to refresh the census.
set -e
SRC=/tmp/opencode/manish-research
DEST="$(dirname "$0")/../media/manifest.json"

[ -d "$SRC" ] || { echo "harvest dir $SRC missing — run the census first (see research/02-content-census.md)"; exit 1; }

jq -s '
  ($posts) as $posts
  | {
      meta: {
        generated: (now | todate),
        subject: "Manish Singh / @southpawaesthetic",
        ig_user_id: "3955140834",
        rights: "INVENTORY ONLY — no media files copied. Source URLs expire; permalinks are permanent. Reproduction requires the creator’s permission.",
        account: {
          posts_total: ($pcount | tonumber),
          followers: ($followers | tonumber),
          harvest: { count: ($posts | length), coverage: ((($posts | length) / ($pcount | tonumber) * 1000 | floor) / 10) }
        }
      },
      profile: {
        url: "https://www.instagram.com/southpawaesthetic/",
        bio: "Strength & Rehab Coach | 10+ Years in the game\nMartial Artist\nI Help People Conquer Pain, Not Just Manage It\nDM for Coaching Inquiries",
        highlights: ["💪", "workout"],
        profile_pic_url: $pic
      },
      podcast: {
        show: "The ATG Podcast (Pain-Free Ability Podcast)",
        episode: "From Athlete to Life-Changer: Manish’s Journey to ATG Level 3 Coach",
        host: "Ben Patrick (kneesovertoesguy)",
        published: "2025-01-15",
        duration: "26:34",
        rss: "https://anchor.fm/s/db42bdec/podcast/rss",
        spotify: "https://open.spotify.com/show/5EGaFplsmrLQT9qOQaVERK",
        mp3: "https://anchor.fm/s/db42bdec/podcast/play/97097024/https%3A%2F%2Fd3ctxlq1ktw2nl.cloudfront.net%2Fstaging%2F2025-0-15%2F393131424-44100-2-c9ee97adf25fb.mp3"
      },
      credential_links: {
        atg_directory: "https://map.atgforcoaches.com/coach/manish-singh",
        atg_mohali: "https://map.atgforcoaches.com/coaches/india/mohali",
        ajp_event: "https://ajptour.com/en/event/1196",
        ajp_results: "https://ajptour.com/en/event/1196/results"
      },
      posts: $posts | map(. + { permalink: ("https://www.instagram.com/p/" + .code + "/") })
    }' \
  --slurpfile posts <(jq -s '.[].items[]? | select(.code != null)' "$SRC"/feed-*.json) \
  --arg pcount "$(jq -r '.data.user.edge_owner_to_timeline_media.count // 231' "$SRC/wpi.json")" \
  --arg followers "$(jq -r '.data.user.edge_followed_by.count // 966' "$SRC/wpi.json")" \
  --arg pic "$(jq -r '.data.user.profile_pic_url_hd // .data.user.profile_pic_url // ""' "$SRC/wpi.json")" \
  <(echo '{}') > "$DEST"

echo "wrote $DEST: $(jq -r '.meta.account.harvest.count' "$DEST") of $(jq -r '.meta.account.posts_total' "$DEST") posts, $(jq -r '.meta.account.harvest.coverage' "$DEST")% coverage"
