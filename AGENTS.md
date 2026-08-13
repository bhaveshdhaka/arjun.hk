# AGENTS.md — arjun.hk

Guidance for AI agents working in this repository. Read this first. This is
the single source of truth for how this project is built, run, and shipped.

## What this is

`arjun.hk` is a tiny **static single-page site** (one `index.html` served by
nginx). It is a placeholder landing page for Arjun (a welcome/hello page).

- Stack: `nginx:alpine`, a single `index.html`, minimal inline CSS. Very little
  surface — keep it that way.
- Live: `https://arjun.hk` (production; no preprod/test instance).

## Ship & Deploy (push → GitHub → GHCR → Coolify)

Develop in **oc-dev**, commit, and **push to GitHub** — no PR gate, direct
pushes allowed. This repo has **one branch (`main`)** only. Pushing triggers
deployment end-to-end:

1. **Push** to `main` on `github.com/bhaveshdhaka/arjun.hk`.
2. GitHub Actions `docker-publish.yml` builds the image and pushes it to **GHCR**
   (`ghcr.io/bhaveshdhaka/arjun.hk`, tagged `:main` + git sha).
3. The same workflow POSTs to the **Coolify API** to pull `:main` and redeploy
   **arjun.hk** (`pexxwuld0pa8q9bnwhnriqbl`) → `https://arjun.hk`.
4. Coolify pulls the image and serves the live URL behind Cloudflare.

**Verify live**: open `https://arjun.hk` (or `curl` it) and confirm your change
is present. If Coolify didn't redeploy, check the deploy log in the Coolify
dashboard or hit the trigger endpoint.
**Standard protocol:** read **`docs/SHIP.md`** — the exact push commands, the Coolify webhook to watch, and the identical chat reply (with lead-time timing) every agent gives.


**Key facts:**
- Coolify API: `https://coolify.bhavesh.hk/api/v1`. Token:
  `/srv/secrets/coolify-api`; also stored as GitHub Actions `COOLIFY_TOKEN`.
- Deploy trigger endpoint: `POST /api/v1/applications/<uuid>/start`.
- Single app: **arjun.hk** `pexxwuld0pa8q9bnwhnriqbl` (pulls `:main`).