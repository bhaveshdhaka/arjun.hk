# Ship Protocol (push → GHCR → Coolify → LIVE)

This is the **single canonical** ship → verify protocol. Every repo under
`bhaveshdhaka` uses it, and every opencode agent must follow it identically so
the chat response is the same each time. Keep this file in sync across all repos.

## 1. Push commands

Per environment / branch. Run from the repo's worktree directory.

| Env | Branch | Command | Coolify app |
|---|---|---|---|
| prod | `main` | `git push origin main` | prod app (pulls `:main`) |
| test | `preprod` | `git push origin preprod` | preprod app (pulls `:preprod`) |

Worktrees / local repos:
- `/var/repos/<repo>` → prod (`main`)
- `/var/repos/<repo>-preprod` → test (`preprod`)

> In oc-dev, pushes are `ask`-gated — you approve each `git push` in the chat.

## 2. Deploy trigger (how a push becomes LIVE)

```
you push → GitHub Actions `docker-publish.yml`
        → builds image → pushes to GHCR (tag `:main` or `:preprod` + sha)
        → calls Coolify API  POST /api/v1/applications/<uuid>/start
        → Coolify pulls the tag + recreates the container
        → app returns HTTP 200 on its public URL
```

Green build → the same workflow POSTs to Coolify. That POST is what actually
pulls + deploys. There is **no** manual deploy step.

## 3. What to look for (deploy-complete webhook)

Coolify POSTs a deploy-complete webhook to
**`https://dash.bhavesh.hk/webhook?token=<WEBHOOK_SECRET>`** on
`deployment_success_webhook_notifications`. The dashboard shows it instantly.

To confirm "it's live", use (in order):

1. **Primary — the dashboard SSE feed (no polling):**
   `curl -N https://dash.bhavesh.hk/events` streams live. New events appear <1s.
   Or query one snapshot: `curl -s https://dash.bhavesh.hk/api/state` and look at
   the topmost deployment for that app: `status: finished` + `lead_s` populated.

2. **Direct probe (fallback, backoff):**
   ```
   GET /api/v1/deployments/applications/<app-uuid>   # till latest is "finished"
   GET <public-url>/health                            # until HTTP 200
   ```
   Backoff: 2s → 4s → 8s → 16s, cap ~60s. Stop at first success.

**App UUIDs** (Coolify):
| Repo | prod app | preprod app |
|---|---|---|
| 1ed-ge | `oqz7u0yho3lulqdt0ymwdibx` | `fyn2fhxrsltey8dr6k6plxg8` |
| walogger-v2 | `yjgd05eqbfsxdwhvivxjx1id` | `ovmlppoij86cbwvki6uqhp05` |
| arjun.hk | `pexxwuld0pa8q9bnwhnriqbl` | — |
| dash.bhavesh.hk | `6btyfrzstkm3chs6npkjjer2` | — |

## 4. Standardized completion reply (say this in the chat)

Timing: `T0` = push time (after `git push` returns), `T1` = deploy `finished`
(HTTP 200). Lead time = `T1 − T0`. Report duration explicitly; you measured it.

```
Shipped <repo> → <branch> [<sha>]     push=HH:MM:SS
CI: ✓ passed                          (or: 🔁 N retries before green — CI rejected it N-1 times)
Deploy: <app-uuid> → <public-url>
Status: 🟢 LIVE (HTTP 200) at HH:MM:SS
Lead time: <T1−T0>s · window avg: <avg>s · 7d avg: <todayAvg>s
```

## 5. Webhook endpoint contract

- Method: `POST`
- Path: `/webhook`
- Auth: `?token=<WEBHOOK_SECRET>` query param (env `WEBHOOK_SECRET` on the dash app)
- Body: Coolify's `toWebhook()` payload (ignored; the dashboard just re-polls + pushes over SSE)
- Response: `200 ok` (rejects `403` on bad token)

## 6. Where the metrics come from

The dashboard computes industry-standard DORA-style metrics server-side:
- **Lead time (for changes)** = push→live (`T1 − T0`), per deploy
- **Deployment frequency** = deploys/day
- **Change failure rate (CFR)** = % of deploy attempts that failed
- **Rework / CI failure** = GitHub Actions runs per commit that failed before green