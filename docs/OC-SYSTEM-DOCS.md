# OC-INFRA & OC-DEV — The Complete System Document

> Single source of truth for the self-hosted AI-agent development platform on `hk-03-dev`.
> Written 2026-08-14. No redactions — every token path, every key, every identity.

---

## Table of Contents

1. [The Why — Philosophy & Principles](#1-the-why)
2. [The Server](#2-the-server)
3. [Identities — Who Is What](#3-identities)
4. [Architecture & Pipeline](#4-architecture)
5. [Secrets & Credentials Map](#5-secrets)
6. [Project Registry](#6-projects)
7. [Networking & Ingress](#7-networking)
8. [Security & Firewall](#8-security)
9. [Agent System (Superpowers)](#9-agents)
10. [Permission Model](#10-permissions)
11. [Friend Sandboxes](#11-sandboxes)
12. [OpenChamber Instances](#12-openchamber)
13. [Operational Scripts](#13-scripts)
14. [Dash — DORA Dashboard](#14-dash)
15. [Gotchas & Tribal Knowledge](#15-gotchas)

---

## 1. The Why — Philosophy & Principles {#1-the-why}

### Why Self-Host?

This isn't a cost play. It's a control play. Every layer — from the VPS to the tunnel to the container orchestrator — is owned, auditable, and replaceable. No Vercel, no Render, no Heroku, no "platform team" between you and your infra. The AI agents are first-class operators on this machine, not just autocomplete in an editor.

### Why Separate oc-infra from oc-dev?

**Security boundary.** oc-infra runs as root and owns the server. oc-dev runs restricted and owns application code. If oc-dev hallucinates a `rm -rf /`, it literally cannot execute it — the permission model blocks it. If oc-infra needs to reconfigure the firewall, it can. This is not about trust; it's about blast radius.

**Scope discipline.** oc-infra never writes app features. oc-dev never touches Coolify, Cloudflare, secrets, or `/srv` outside its own space. Each agent has a clear job description enforced by configuration, not by hoping it follows instructions.

### Why AI Agents as Developers?

The agents don't just suggest code — they push it, CI tests it, and it deploys. The workflow is:

1. Agent writes code in a repo checkout
2. Agent runs the check command locally (same as CI)
3. Agent pushes via HTTPS
4. CI gates the push (the only gate)
5. Green → image builds → deploys → live

No human reviews the PR. No human approves the deploy. CI is the gate. If CI passes, it ships. If CI fails, the agent fixes it and re-pushes. This is not "AI-assisted development" — this is AI-driven development with automated quality gates.

### Core Principles

- **One credential, one job.** Never share tokens across roles. Each token has exactly the permissions it needs and no more.
- **CI is the only gate.** No manual review, no PR-required, no human approval. Agents push; CI passes or the code is rejected.
- **The push token enforces the gate.** `ocdev-push-token` has `repo` scope but NO `workflow` scope. A push to `.github/workflows` with this token is hard-rejected by GitHub. This is verified behavior, not theoretical.
- **No SSH deploy keys.** SSH keys can bypass branch protections and have private-repo workflow-edit access. HTTPS PATs with scoped permissions are strictly better.
- **Secrets live on disk, not in repos.** Paths are documented; values are never committed, never logged, never put in AGENTS.md files.
- **Event-driven verification.** Don't sleep-poll. Use dash's SSE endpoint or the Coolify API to check deploy status.

---

## 2. The Server {#2-the-server}

| Property | Value |
|---|---|
| Hostname | `hk-03-dev` |
| IP | `202.73.4.149` |
| OS | Debian 13 (Trixie) |
| Node.js | `/opt/node22/bin/node` (v22) |
| OpenCode binary | `/root/.opencode/bin/opencode` |
| OpenChamber binary | `/opt/node22/bin/openchamber` |
| Cloudflared | `/usr/local/bin/cloudflared` |
| Docker | Standard Debian package |
| Coolify | Running on port 9040 (internal) |

### Filesystem Layout

```
/root/                          # oc-infra home
  .config/opencode/             # oc-infra OpenCode config
    AGENTS.md                   # oc-infra operating manual
    opencode.jsonc              # oc-infra OpenCode config
    agents/                     # Superpowers agent definitions
    skills/                     # Superpowers skill definitions
    oc-env                      # Environment vars (UI password)
  .config/gh/hosts.yml          # GitHub CLI OAuth token
  .docker/config.json           # GHCR pull credentials
  .gitconfig                    # Root git config (SSH→HTTPS rewrite, gh credential helper)

/srv/                           # Application data root
  oc-dev/                       # oc-dev home directory
    .config/opencode/           # oc-dev OpenCode config
      AGENTS.md                 # oc-dev operating manual
      opencode.jsonc            # oc-dev config with permission deny rules
      .env                      # OPENROUTER_API_KEY
      agents/                   # Superpowers agents (copy)
      skills/                   # Superpowers skills (copy)
    .config/openchamber/        # oc-dev OpenChamber config
      settings.json             # UI settings, relay keys, project list
      projects/                 # Per-project OpenChamber metadata
      managed-opencode/         # Running opencode process info
      sessions-directories.json # Session folder mapping
      agent-tool/               # OpenChamber plugin
    .gitconfig                  # oc-dev git config (HTTPS, credential store)
    .git-credentials            # ocdev-push-token for git push
    .cache/                     # Playwright browsers, npm cache
    .npm/                       # npm cache
    .local/                     # Local data
  varun-oc/                     # varun's sandbox home
    .config/opencode/           # varun's OpenCode config
    .config/openchamber/        # varun's OpenChamber config
  manish-oc/                    # manish's sandbox home
    .config/opencode/           # manish's OpenCode config
    .config/openchamber/        # manish's OpenChamber config
  secrets/                      # All secrets (700, root-only)
  scripts/                      # Operational scripts
  deploy-keys/                  # LEGACY SSH deploy keys (unused, kept for reference)
  1edge/                        # 1ed.ge app persistent volume
  1edge-test/                   # 1ed.ge preprod persistent volume
  walogger/                     # walogger-v2 app persistent volume
  walogger-v3-media/            # walogger-v3 media volume
  walogger-v3-ui/               # walogger-v3-ui volume
  landing/                      # Landing page volume

/var/repos/                     # Git repo checkouts (oc-dev works here)
  1ed-ge/                       # main branch checkout
  1ed-ge-preprod/               # preprod branch checkout
  arjun.hk/                     # main branch checkout
  walogger-v2/                  # main branch checkout
  walogger-v2-preprod/          # preprod branch checkout
  walogger-v3/                  # main branch checkout
  walogger-v3-ui/               # main branch checkout
  dash.bhavesh.hk/              # main branch checkout

/etc/systemd/system/            # Service definitions
  openchamber.service           # oc-infra OpenChamber (port 3000)
  openchamber-ocdev.service     # oc-dev OpenChamber (port 3005)
  openchamber-varun-oc.service  # varun OpenChamber (port 3001)
  openchamber-manish-oc.service # manish OpenChamber (port 3003)
  cf-tunnel-oc.service          # Cloudflare tunnel
```

---

## 3. Identities — Who Is What {#3-identities}

### oc-infra (You are here)

| Property | Value |
|---|---|
| Role | DevOps / SysAdmin |
| Runs as | `root` |
| Home | `/root` |
| Config | `/root/.config/opencode/opencode.jsonc` |
| AGENTS.md | `/root/.config/opencode/AGENTS.md` |
| Port | 3000 |
| URL | `oc-infra.bhavesh.hk` |
| Access | Cloudflare Access (login wall) |
| Owns | Server, Coolify, Cloudflare, containers, `/srv`, secrets, firewall, OpenChamber instances |
| Does NOT write | App features, application code |
| Model | `cline-pass/deepseek-v4-flash` (primary), various via OpenRouter |

**oc-infra's git identity:**

- Uses `gh` OAuth token (`gho_REDACTED`) stored in `/root/.config/gh/hosts.yml`
- Scopes: `repo`, `workflow`, `read:org`
- Git config at `/root/.gitconfig` rewrites SSH→HTTPS and uses `gh auth git-credential` as credential helper
- This token CAN modify `.github/workflows` — that's intentional, because oc-infra owns CI wiring

**oc-infra's OpenCode config (`/root/.config/opencode/opencode.jsonc`):**

```jsonc
{
  "mcp": {
    "context7": { "type": "local", "command": ["npx", "--yes", "@upstash/context7-mcp@latest"], "enabled": true },
    "playwright": { "type": "local", "command": ["npx", "--yes", "@playwright/mcp@latest", "--headless", "--no-sandbox", "--browser", "chromium"], "env": { "PLAYWRIGHT_BROWSERS_PATH": "/srv/oc-dev/.cache/ms-playwright" }, "enabled": true }
  }
}
```

No permission deny rules — oc-infra runs as root with full access.

---

### oc-dev

| Property | Value |
|---|---|
| Role | Software Engineer / Designer / Tester |
| Runs as | `root` (but permission-restricted via OpenCode) |
| Home | `/srv/oc-dev` |
| Config | `/srv/oc-dev/.config/opencode/opencode.jsonc` |
| AGENTS.md | `/srv/oc-dev/.config/opencode/AGENTS.md` |
| Port | 3005 |
| URL | `oc-dev.bhavesh.hk` |
| Access | Cloudflare Access (login wall) |
| Owns | Application code in `/var/repos/<repo>`, own `/srv/oc-dev` space |
| Does NOT touch | Server, Coolify, Cloudflare, secrets, `/srv` (except own space) |
| Models | Various via OpenRouter (`sk-or-v1-REDACTED`) |

**oc-dev's git identity:**

- Uses `ocdev-push-token` (classic PAT, `repo` scope, **NO `workflow` scope**)
- Token stored at `/srv/secrets/ocdev-push-token`
- Wired via `/srv/oc-dev/.git-credentials`:
  ```
  https://bhaveshdhaka:ghp_REDACTED@github.com
  ```
- Git config at `/srv/oc-dev/.gitconfig`:
  ```ini
  [url "https://github.com/"]
      insteadOf = git@github.com:
  [credential]
      helper = store
  [user]
      name = bhaveshdhaka
      email = mail@bhavesh.net
  ```
- **The gate:** This token CANNOT push changes to `.github/workflows/`. GitHub hard-rejects it. Verified.

**oc-dev's OpenCode config (`/srv/oc-dev/.config/opencode/opencode.jsonc`):**

```jsonc
{
  "mcp": {
    "context7": { "type": "local", "command": ["npx", "--yes", "@upstash/context7-mcp@latest"], "enabled": true },
    "playwright": { "type": "local", "command": ["npx", "--yes", "@playwright/mcp@latest", "--headless", "--no-sandbox", "--browser", "chromium"], "env": { "PLAYWRIGHT_BROWSERS_PATH": "/srv/oc-dev/.cache/ms-playwright" }, "enabled": true }
  },
  "permission": {
    "bash": {
      "*": "ask",
      "git push*": "allow",
      "docker*": "deny",
      "sudo*": "deny",
      "ssh*": "deny",
      "systemctl*": "deny"
    },
    "edit": "allow",
    "webfetch": "ask"
  }
}
```

**Permission deny rules for oc-dev:**
- `docker*` → deny (can't touch containers)
- `sudo*` → deny (can't escalate)
- `ssh*` → deny (can't SSH anywhere)
- `systemctl*` → deny (can't manage services)
- `git push*` → allow (can push code)
- Everything else bash → ask (requires confirmation)

---

### varun-oc (Friend Sandbox)

| Property | Value |
|---|---|
| Role | Noob sandbox |
| Home | `/srv/varun-oc` |
| Port | 3001 |
| URL | `varun-oc.bhavesh.hk` |
| Access | Cloudflare Access |
| Password | `v@run` |
| API Key | BYOK — empty `OPENROUTER_API_KEY` (friend provides their own) |
| Limits | CPU 150%, Memory 4GB |

**varun-oc's OpenCode config (`/srv/varun-oc/.config/opencode/opencode.jsonc`):**

```jsonc
{
  "mcp": { "context7": { "type": "local", "command": ["npx","--yes","@upstash/context7-mcp@latest"], "enabled": true } },
  "permission": {
    "bash": { "*":"ask", "git push main":"deny", "git push preprod":"deny", "docker*":"deny", "sudo*":"deny", "ssh*":"deny", "systemctl*":"deny" },
    "edit": "allow", "webfetch": "ask"
  }
}
```

**Cannot push to main or preprod.** Can edit files in their sandbox. BYOK model — no API key provided by the system.

---

### manish-oc (Friend Sandbox)

| Property | Value |
|---|---|
| Role | Noob sandbox |
| Home | `/srv/manish-oc` |
| Port | 3003 |
| URL | `manish-oc.bhavesh.hk` |
| Access | Cloudflare Access |
| Password | `m@nish` |
| API Key | BYOK — empty `OPENROUTER_API_KEY` |
| Limits | CPU 150%, Memory 4GB |

Identical permission model to varun-oc. Cannot push to main/preprod. Cannot touch docker/sudo/ssh/systemctl.

---

## 4. Architecture & Pipeline {#4-architecture}

### Topology (the whole machine)

```
Developer / AI Agent
       │
       ▼
  git push (HTTPS via PAT)
       │
       ▼
  GitHub (bhaveshdhaka/*)
       │
       ▼
  GitHub Actions CI ──── ci.yml ──── check job (lint/typecheck/test/build)
       │                                    │
       │                              fail? → agent fixes + re-pushes
       │                              pass? ↓
       │                          publish job (needs: check)
       │                                    │
       │                          docker build → ghcr.io/bhaveshdhaka/<repo>:<branch>
       │                                    │
       │                          POST Coolify /start
       │                                    │
       ▼                                    ▼
  Coolify (127.0.0.1:9040)    ←────    pulls image from GHCR
       │                                    │
       │                          recreates container with:
       │                            - env vars
       │                            - volume mounts
       │                            - port mappings
       │                            - healthcheck
       │                                    │
       ▼                                    ▼
  Container running on host port     deploy-complete webhook
       │                                    │
       ▼                                    ▼
  Cloudflare Tunnel                dash.bhavesh.hk/webhook
  (cf-tunnel-oc.service)                    │
       │                                    ▼
       │                          SSE broadcast to connected clients
       ▼
  DNS CNAME → tunnel → 127.0.0.1:<port>
       │
       ▼
  Public URL (or Access-protected URL)
```

### Step-by-Step Pipeline

1. **Agent edits code** in `/var/repos/<repo>` (oc-dev) or any repo (oc-infra)
2. **Agent runs check command locally** — same command CI runs. Fix until it passes.
3. **`git push`** — HTTPS push via credential store. SSH→HTTPS rewrite in gitconfig.
4. **GitHub Actions CI triggers** — `ci.yml` runs:
   - `check` job: lint, typecheck, test, build (varies by repo maturity)
   - `publish` job: `needs: check`, `if: success()` — a red check CANNOT ship
5. **publish builds Docker image** → pushes to `ghcr.io/bhaveshdhaka/<repo>:<branch>`
   - On `main` branch: also tags `:latest`
6. **publish POSTs to Coolify** `/api/v1/applications/<uuid>/start`
7. **Coolify pulls image** from GHCR, recreates container
8. **Container starts** with healthcheck (`/health`, `/ping`, or `/`)
9. **Deploy-complete webhook** fires → dash `/webhook` → SSE broadcast
10. **Verify live**: `curl -N https://dash.bhavesh.hk/events` and wait for `status=finished`

### Why This Design

- **CI is the only gate.** No human bottleneck. No "waiting for review." No merge queue. Code either passes CI or it doesn't.
- **The push token is the security boundary.** `ocdev-push-token` cannot modify workflows. This means oc-dev cannot change the CI pipeline, cannot add backdoors, cannot skip checks. GitHub enforces this at the API level.
- **Coolify is dumb infrastructure.** It pulls images, sets env vars, mounts volumes, maps ports, and runs healthchecks. It does NOT route traffic. It does NOT manage DNS. It's a container orchestrator, nothing more.
- **Cloudflare is the router.** All traffic goes through the tunnel. Published container ports are only reachable via tunnel/loopback (enforced by firewall). No direct IP access to app ports.
- **Event-driven verification.** Dash provides SSE and JSON state endpoints. Don't sleep-poll; listen for events.

---

## 5. Secrets & Credentials Map {#5-secrets}

### Where Secrets Live

All secrets are in `/srv/secrets/` with permissions `700` (root-only).

```
/srv/secrets/
  coolify-api                   # Coolify API bearer token
  cloudflare-api-token          # Cloudflare API token (zone:edit, Access:write)
  cloudflare-tunnel-token       # Cloudflare tunnel auth token (for cloudflared)
  github-pat                    # GitHub PAT (used by weekly-update.mjs for PR creation)
  openrouter-api-key            # OpenRouter API key for AI model access
  firebase_key.json             # Firebase service account key (walogger-23941 project)
  firebase_walogger_v3_key.json # Firebase service account key (waloggerv3 project)
  oc-passwords                  # Miscellaneous passwords
  1edge-admin-secret            # 1ed.ge admin secret
  ghcr-pull-token               # Classic PAT, read:packages scope (Coolify pulls images)
  ocdev-push-token              # Classic PAT, repo scope, NO workflow scope (oc-dev pushes code)
```

### GitHub Actions Secrets (per-repo)

| Repo | Secrets |
|---|---|
| All deploying repos | `COOLIFY_TOKEN` (Coolify API token for POST /start) |
| walogger-v2 | `COOLIFY_TOKEN`, `FIREBASE_KEY_JSON` (minified), `WALOGGER_ENV` |
| Others | `COOLIFY_TOKEN` only |

### Credentials Map — One Credential, One Job

| Job | Credential | Location | Scopes | Notes |
|---|---|---|---|---|
| oc-dev push code | `ocdev-push-token` (classic PAT) | `/srv/secrets/ocdev-push-token` → `/srv/oc-dev/.git-credentials` | `repo` (NO `workflow`) | GitHub hard-rejects workflow file changes |
| oc-infra push code + workflows | `gh` OAuth token | `/root/.config/gh/hosts.yml` → `gho_REDACTED` | `repo`, `workflow`, `read:org` | Full access — oc-infra owns CI |
| Coolify pull images | `ghcr-pull-token` (classic PAT) | `/srv/secrets/ghcr-pull-token` → docker login → `/root/.docker/config.json` | `read:packages` | Only reads GHCR |
| CI push image to GHCR | Actions `GITHUB_TOKEN` (built-in) | In-repo workflow | `packages:write` | Automatic per-workflow |
| Dash PR creation | `github-pat` | `/srv/secrets/github-pat` | `repo` | Used by `weekly-update.mjs` |
| Coolify API | `coolify-api` | `/srv/secrets/coolify-api` | Full Coolify API | Used by oc-infra, dash, scripts |
| Cloudflare API | `cloudflare-api-token` | `/srv/secrets/cloudflare-api-token` | `zone:edit`, Access write | Zone-level token |
| Cloudflare Tunnel | `cloudflare-tunnel-token` | `/srv/secrets/cloudflare-tunnel-token` | Tunnel auth | Used by `cf-tunnel-oc` service |
| AI Models | `openrouter-api-key` | `/srv/secrets/openrouter-api-key` | OpenRouter API | Also in `/srv/oc-dev/.config/opencode/.env` |
| Firebase (v2) | `firebase_key.json` | `/srv/secrets/firebase_key.json` | Service account | Project: `walogger-23941` |
| Firebase (v3) | `firebase_walogger_v3_key.json` | `/srv/secrets/firebase_walogger_v3_key.json` | Service account | Project: `waloggerv3` |

### The Gate Enforcement Mechanism

```
ocdev-push-token (classic PAT)
  ├── Scopes: repo
  ├── Missing: workflow
  │
  ├── Push to any branch: ✅ ALLOWED
  ├── Push to .github/workflows/: ❌ HARD REJECTED by GitHub API
  ├── Create PR: ✅ ALLOWED
  └── Merge PR: ✅ ALLOWED (but CI must pass first)

gh OAuth token (oc-infra)
  ├── Scopes: repo, workflow, read:org
  ├── Push to any branch: ✅ ALLOWED
  ├── Push to .github/workflows/: ✅ ALLOWED
  └── This is intentional — oc-infra owns CI wiring
```

**There are NO SSH deploy keys on this system.** The `/srv/deploy-keys/` directory contains legacy key pairs that are NOT wired to any repo or agent. SSH deploy keys can bypass branch protections and have private-repo workflow-edit access. HTTPS PATs with scoped permissions are strictly more secure.

### Docker GHCR Auth

`/root/.docker/config.json`:
```json
{
  "auths": {
    "ghcr.io": {
      "auth": "REDACTED_BASE64"
    }
  }
}
```

This is base64 of `bhaveshdhaka:ghp_REDACTED` — the `ghcr-pull-token`.

---

## 6. Project Registry {#6-projects}

### Active Projects

| Repo | Branches | Type | Coolify App (UUID) | Image Tag | Port Mapping | URL | Access |
|---|---|---|---|---|---|---|---|
| `1ed-ge` | `main` | Astro/Node | 1edge-prod `oqz7u0yho3lulqdt0ymwdibx` | `:main` | `4321:4321` | 1ed.ge, www.1ed.ge | public |
| `1ed-ge` | `preprod` | Astro/Node | 1edge-preprod `fyn2fhxrsltey8dr6k6plxg8` | `:preprod` | `4323:4321` | test.1ed.ge | public |
| `arjun.hk` | `main` | Static (nginx) | arjun.hk `pexxwuld0pa8q9bnwhnriqbl` | `:main` | `8081:80` | arjun.hk, www.arjun.hk | public |
| `walogger-v2` | `main` | FastAPI UI | walogger-prod `yjgd05eqbfsxdwhvivxjx1id` | `:main` | `8082:8000` | wa.1ed.ge | public |
| `walogger-v2` | `preprod` | FastAPI UI | walogger-preprod `ovmlppoij86cbwvki6uqhp05` | `:preprod` | `8083:8000` | test-wa.1ed.ge | public |
| `walogger-v3` | `main` | Baileys QR + Firestore ingest | walogger-v3 `iijj4ecqhpnumh2rbwegfycs` | `:main` | `8040:3000` | wa3.1ed.ge | public (QR) |
| `walogger-v3-ui` | `main` | FastAPI UI (v2 fork) | walogger-v3-ui `pqyxnybwpiuocsu0avk4nid2` | `:main` | `8085:8000` | wa3ui.1ed.ge | public |
| `dash.bhavesh.hk` | `main` | Node DORA dashboard | dash `6btyfrzstkm3chs6npkjjer2` | `:main` | `4045:4345` | dash.bhavesh.hk | public |

### Coolify Projects (grouping)

| Coolify Project | UUID |
|---|---|
| walogger-v2 | `7amogtuos681b0kzrvzahvju` |
| 1ed-ge | `w4ijmrxmlxxvrrmgqgftxz60` |
| arjun.hk | `fevqnjvdtbke9w6pgy0dn2gk` |
| dash | `raxv8e4fgcvo7bgoe33f2uij` |
| walogger-v3-ui | `wo2kqoccahtziywgbnpjq1qf` |
| walogger-v3 | `4gt3grc9h2lprv69fgthtytr` |

### Firebase Projects

| App(s) | Firebase Project | Key File |
|---|---|---|
| walogger-v2 | `walogger-23941` | `/srv/secrets/firebase_key.json` |
| walogger-v3, walogger-v3-ui | `waloggerv3` | `/srv/secrets/firebase_walogger_v3_key.json` |

The v3-ui needs a composite Firestore index on `Messages/timestamp` for sync.

### What Each Project Does

- **1ed-ge** — Personal website / link-in-bio. Astro frontend + Node SSR. Main + preprod branches.
- **arjun.hk** — Static site. Served by nginx in container. Single branch.
- **walogger-v2** — WhatsApp message logger. FastAPI backend + web UI. Connects to WhatsApp Web via QR. Stores messages in Firebase. Main + preprod.
- **walogger-v3** — Next-gen WhatsApp logger. Baileys library for WhatsApp connection, Firestore for ingest. QR-based auth.
- **walogger-v3-ui** — Web UI for walogger-v3. Fork of v2 UI adapted for v3's data model.
- **dash.bhavesh.hk** — DORA metrics dashboard. Node.js app that tracks GitHub pushes/PRs/CI + Coolify deployments. Provides SSE + JSON state + webhook endpoints.

### New Repo Checklist

1. CI from day one — `ci.yml` with `check` job gating `publish` (`needs: check`)
2. Push via `ocdev-push-token` (no SSH deploy keys, no owner PAT)
3. `COOLIFY_TOKEN` set as GitHub Actions secret
4. `health_check_path` set on the Coolify app
5. Cloudflare tunnel CNAME + ingress configured
6. Row added to this project registry
7. Image pushed to `ghcr.io/bhaveshdhaka/<repo>`

---

## 7. Networking & Ingress {#7-networking}

### Cloudflare Tunnel

`cf-tunnel-oc.service` runs:
```bash
exec /usr/local/bin/cloudflared tunnel run --token "$(cat /srv/secrets/cloudflare-tunnel-token | tr -d '\n')"
```

The tunnel config is **remote-managed** — editable in the Cloudflare dashboard, not a local YAML file. This means config changes don't require server restarts.

### Cloudflare IDs

| Resource | ID |
|---|---|
| Account | `f04fa041640e4096493366f32948663a` |
| Tunnel | `4a82137a-3205-4210-8607-5a152bc2c0d2` |
| Zone: `1ed.ge` | `bd8a4f5c0869d9168d06ce5f3740e116` |
| Zone: `bhavesh.hk` | `49d72a4ea4425dacaa3a76e91e044388` |
| Zone: `arjun.hk` | `161e5b456b03c86419bb6e026da130aa` |

### Hostname → Port → Access Map

| Hostname | → Port | Access Policy |
|---|---|---|
| `1ed.ge`, `www.1ed.ge` | 4321 | **public** |
| `test.1ed.ge` | 4323 | **public** |
| `arjun.hk`, `www.arjun.hk` | 8081 | **public** |
| `wa.1ed.ge` | 8082 | **public** |
| `test-wa.1ed.ge` | 8083 | **public** |
| `wa3.1ed.ge` | 8040 | **public** (QR code page) |
| `wa3ui.1ed.ge` | 8085 | **public** |
| `dash.bhavesh.hk` | 4045 | **public** |
| `oc-infra.bhavesh.hk` | 3000 | **Cloudflare Access** |
| `oc-dev.bhavesh.hk` | 3005 | **Cloudflare Access** |
| `varun-oc.bhavesh.hk` | 3001 | **Cloudflare Access** |
| `varun-app.bhavesh.hk` | 3002 | **public** |
| `manish-oc.bhavesh.hk` | 3003 | **Cloudflare Access** |
| `manish-app.bhavesh.hk` | 3004 | **public** |
| `coolify.bhavesh.hk` | 9040 | **Cloudflare Access** |

### Access Rule

**Agent/infra hostnames = Cloudflare Access (login wall).** This includes oc-infra, oc-dev, varun-oc, manish-oc, and coolify.

**App hostnames = public.** No login wall. Anyone can visit 1ed.ge, wa.1ed.ge, etc. This is intentional — apps are public-facing products.

### Critical: Never `localhost` in Tunnel Ingress

Tunnel ingress must use `127.0.0.1`, never `localhost`. On this system, `localhost` resolves to IPv6 `::1`, which causes a 502 Bad Gateway because the services listen on IPv4 only. Always use `127.0.0.1`.

---

## 8. Security & Firewall {#8-security}

### Firewall Rules

**ufw default-deny incoming.** Only explicitly allowed ports are reachable.

**DOCKER-USER iptables chain:**
```bash
# Allow return/related traffic (existing connections)
iptables -I DOCKER-USER -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT

# Allow loopback (tunnel → localhost)
iptables -I DOCKER-USER -i lo -j ACCEPT

# Drop NEW tcp from external NIC (direct-IP access to published container ports)
iptables -A DOCKER-USER -i eth0 -p tcp -m conntrack --ctstate NEW -j DROP
```

This means: published container ports (4321, 8081, 8082, etc.) are ONLY reachable via:
1. The Cloudflare tunnel (loopback interface)
2. Existing/established connections (return traffic)

Direct IP access to `202.73.4.149:4321` is blocked by the DOCKER-USER drop rule.

### Making a Port Directly Accessible

If you ever need a port reachable on the public IP (not through tunnel):
1. `ufw allow <port>`
2. Add a DOCKER-USER ACCEPT rule before the drop
3. Persist in `/srv/scripts/ufw-docker-rules.sh`

### SSH Hardening

- Root login: pubkey only
- Password authentication: disabled
- Standard port 22

### Secrets Permissions

```
/srv/secrets/  →  drwx------ (700) root:root
```

All files inside are readable only by root. No group, no other.

---

## 9. Agent System (Superpowers) {#9-agents}

### What is Superpowers?

Superpowers is a structured agent workflow system installed via `opencode-superpowers` (npm package). It provides:

- **5 agent definitions** (primary orchestrator + 4 specialized subagents)
- **6 skill definitions** (workflow controllers that enforce process)

Installed 2026-08-13 from package version `0.4.0`, upstream commit `6efe32c9e2dd002d0c394e861e0529675d1ab32e`.

### Agent Definitions

All defined in `/root/.config/opencode/agents/` (and copied to `/srv/oc-dev/.config/opencode/agents/`):

| Agent | File | Mode | Model | Role |
|---|---|---|---|---|
| `superpowers` | `superpowers.md` | primary | `cline-pass/deepseek-v4-flash` | Orchestrator — manages flow, delegates to subagents |
| `superpowers-spec-writer` | `superpowers-spec-writer.md` | subagent (hidden) | `cline-pass/deepseek-v4-pro` | Writes design specs from approved brainstorms |
| `superpowers-plan-writer` | `superpowers-plan-writer.md` | subagent (hidden) | `cline-pass/deepseek-v4-pro` | Writes implementation plans from approved specs |
| `superpowers-implementer` | `superpowers-implementer.md` | subagent (hidden) | `cline-pass/deepseek-v4-flash` | Executes approved plans, task by task |
| `superpowers-code-reviewer` | `superpowers-code-reviewer.md` | subagent (hidden) | `cline-pass/deepseek-v4-pro` | Reviews code before task finalization |

### Skill Definitions

All in `/root/.config/opencode/skills/`:

| Skill | Purpose |
|---|---|
| `superpowers-using-superpowers` | Establishes skill usage discipline — must check for skills before any action |
| `superpowers-brainstorming` | Turns ideas into designs through collaborative dialogue. Hard gate: no code until design approved. |
| `superpowers-writing-plans` | Converts approved specs into execution-ready implementation plans |
| `superpowers-executing-plans` | Guides implementation execution following approved plans |
| `superpowers-subagent-driven-development` | Workflow for delegated task execution |
| `superpowers-verification-before-completion` | Verification checklist before any completion claim |

### Workflow Phases

```
Phase 1: Brainstorming
  Load superpowers-brainstorming skill
  → Explore context, ask questions (one at a time), propose approaches
  → Present design, get user approval
  → Write spec to docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md
  → Self-review spec (placeholders, contradictions, ambiguity, scope)
  → USER GATE: review spec before proceeding

Phase 2: Spec Writing
  Dispatch @superpowers-spec-writer with approved brainstorm
  → Writes structured spec with: Goal, Non-Goals, Context, Architecture,
    Files To Change, Testing Strategy, Risks, Decision Summary
  → Self-reviews and audits before returning
  → USER GATE: confirm spec before proceeding to planning

Phase 3: Plan Writing
  Dispatch @superpowers-plan-writer with approved spec
  → Writes exhaustive plan: each task = 2-5 min action
  → Full file contents for creates, exact diffs for edits
  → Checkbox syntax for tracking
  → Validation commands with expected output
  → USER GATE: confirm plan before proceeding to implementation

Phase 4: Implementation
  Dispatch @superpowers-implementer with approved plan
  → Execute tasks one at a time
  → After each task: verify, code-review, commit
  → Report status after each task
  → superpowers-verification-before-completion before final claim
```

### Orchestrator Rules (superpowers.md)

- **Never writes product code itself.** Coordinates only.
- **Delegation contract:** spec writing, plan writing, implementation, review — all delegated to designated subagents.
- **Scope discipline:** approved artifacts are the scope contract. New scope → pause and call it out.
- **Confirmation gates are mandatory:** Phase 2→3 and Phase 3→4 require explicit user confirmation via `question` tool.

### Implementer Rules (superpowers-implementer.md)

- Executes plan exactly as written. Plan is source of truth.
- After each task: verify → code-review (using `superpowers-code-reviewer`) → commit.
- Uses `github-copilot/gpt-5.4` for review passes.
- Stops and reports if plan has errors/contradictions.
- Returns: summary, task statuses, verification results, review findings, commit hashes.

---

## 10. Permission Model {#10-permissions}

### oc-infra Permissions

```jsonc
{
  // No permission block — full access (runs as root)
  "mcp": { /* context7, playwright */ }
}
```

oc-infra has unrestricted access to everything. This is intentional — it owns the server.

### oc-dev Permissions

```jsonc
{
  "permission": {
    "bash": {
      "*": "ask",           // Default: ask for any bash command
      "git push*": "allow", // Can push code
      "docker*": "deny",    // CANNOT touch containers
      "sudo*": "deny",      // CANNOT escalate
      "ssh*": "deny",       // CANNOT SSH
      "systemctl*": "deny"  // CANNOT manage services
    },
    "edit": "allow",        // Can edit files freely
    "webfetch": "ask"       // Asks before fetching URLs
  }
}
```

### varun-oc / manish-oc Permissions

```jsonc
{
  "permission": {
    "bash": {
      "*": "ask",
      "git push main": "deny",    // CANNOT push to main
      "git push preprod": "deny", // CANNOT push to preprod
      "docker*": "deny",
      "sudo*": "deny",
      "ssh*": "deny",
      "systemctl*": "deny"
    },
    "edit": "allow",
    "webfetch": "ask"
  }
}
```

Friends can edit files in their sandbox, but cannot push to production branches, cannot touch infrastructure.

### Permission Enforcement

These are enforced by OpenCode at the tool-call level. When the agent tries to execute a denied command, OpenCode blocks it before it reaches the shell. This is not instruction-following — it's a hard block.

---

## 11. Friend Sandboxes {#11-sandboxes}

### Purpose

Friends (varun, manish) get their own isolated OpenChamber instances to experiment with AI coding. They are completely isolated from:
- oc-infra (server management)
- oc-dev (production code)
- Each other

### Resource Limits

```ini
CPUQuota=150%     # Max 1.5 CPU cores
MemoryMax=4000M   # Max 4GB RAM
```

These are set in the systemd unit files. oc-infra and oc-dev have no resource limits.

### BYOK Model

Friend sandboxes use "Bring Your Own Key" — the `OPENROUTER_API_KEY` in their `.env` is empty. They must provide their own API key to use AI models. This prevents abuse of the system's API credits.

### What Friends Can Do

- Edit files in their `/srv/<name>-oc` space
- Run non-destructive bash commands (with confirmation)
- Use OpenCode's read, glob, grep tools

### What Friends Cannot Do

- Push to main or preprod branches
- Use docker, sudo, ssh, systemctl
- Access other users' spaces
- Access secrets
- Modify server configuration

---

## 12. OpenChamber Instances {#12-openchamber}

### What is OpenChamber?

OpenChamber is a web UI wrapper around OpenCode. Each instance runs as a systemd service, binding to a specific port on `127.0.0.1`. Cloudflare tunnel maps hostnames to these ports.

### Instance Map

| Instance | Service File | Port | Home Dir | Config Dir | Password |
|---|---|---|---|---|---|
| oc-infra | `openchamber.service` | 3000 | `/root` | `/root/.config/opencode` | `mylo1tanic` (from oc-env) |
| oc-dev | `openchamber-ocdev.service` | 3005 | `/srv/oc-dev` | `/srv/oc-dev/.config/opencode` | `mylo1tanic` |
| varun-oc | `openchamber-varun-oc.service` | 3001 | `/srv/varun-oc` | `/srv/varun-oc/.config/opencode` | `v@run` |
| manish-oc | `openchamber-manish-oc.service` | 3003 | `/srv/manish-oc` | `/srv/manish-oc/.config/opencode` | `m@nish` |

### Service Definition Pattern

Each service follows this pattern:

```ini
[Unit]
Description=OpenChamber <name> (port <port>)
After=network.target

[Service]
Type=simple
User=root
Environment=OPENCHAMBER_UI_PASSWORD=<password>
Environment=PATH=/opt/node22/bin:/root/.opencode/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
Environment=HOME=<home_dir>
Environment=XDG_CONFIG_HOME=<config_dir>
Environment=XDG_DATA_HOME=<data_dir>/local/share
Environment=XDG_RUNTIME_DIR=/run/user/0
Environment=DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/0/bus
ExecStart=/opt/node22/bin/openchamber serve --foreground --host 127.0.0.1 --port <port>
Restart=always
RestartSec=5
```

Friend instances also have `CPUQuota=150%` and `MemoryMax=4000M`.

### OpenChamber Internal Structure

Each instance's config directory contains:

```
.config/openchamber/
  settings.json              # UI theme, notification prefs, relay keys, project list
  projects/                  # Per-project metadata (scheduled tasks, etc.)
  managed-opencode/          # Running opencode process info (PID, port, binary path)
  sessions-directories.json  # Session folder mapping
  agent-tool/                # OpenChamber plugin (openchamber-plugin.js)
  jwt-secret                 # JWT signing secret
  logs/                      # Session logs
  ui-passkeys.json           # WebAuthn passkeys (if configured)
  run/                       # Runtime data
```

### Relay Keys (End-to-End Encryption)

Each OpenChamber instance has its own relay signing and encryption keys (EC P-256). These are generated per-instance and stored in `settings.json`. They enable end-to-end encrypted communication between the UI and the agent.

oc-dev's relay keys:
- Signing: `x: aOOL7wGs9qQU3nKKzHMIboJLFW_oQ22hPwRoQzO-7WE`
- Encryption: `x: 6GXxEuCSU0p_N7JrtKf4fp48D4M3HCzLInHxwFYseYY`

manish-oc's relay keys:
- Signing: `x: njO5LcovEtFBUbeAFh9-y6gjfBcKlfvFnQiuIeVCjdU`
- Encryption: `x: Z7cvJq6KnJ0ErJbyD1euGw36YuY-QNyMl6mJW6tF6lY`

varun-oc: No relay keys (settings.json has no relay key section — simpler config).

---

## 13. Operational Scripts {#13-scripts}

### `/srv/scripts/ufw-docker-rules.sh`

Firewall hardening script. Closes the Cloudflare-Access-bypass: drops NEW TCP arriving on the external NIC so published container ports are only reachable via the tunnel (loopback) or established sessions.

```bash
#!/usr/bin/env bash
set -u
EXT="${EXT_IFACE:-eth0}"
# allow return/related traffic
iptables -C DOCKER-USER -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT 2>/dev/null \
  || iptables -I DOCKER-USER -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT
# allow loopback (tunnel -> localhost)
iptables -C DOCKER-USER -i lo -j ACCEPT 2>/dev/null || iptables -I DOCKER-USER -i lo -j ACCEPT
# drop NEW tcp from the external NIC
iptables -C DOCKER-USER -i "$EXT" -p tcp -m conntrack --ctstate NEW -j DROP 2>/dev/null \
  || iptables -A DOCKER-USER -i "$EXT" -p tcp -m conntrack --ctstate NEW -j DROP
```

### `/srv/scripts/audit-server-sec.sh`

Security posture dump. Runs daily (or on demand). Checks:
- ufw status
- sshd config (Port, PermitRootLogin, PasswordAuth, PubkeyAuth)
- `/srv/secrets` permissions
- Docker containers status
- Coolify health
- Cloudflare tunnel ingress config
- OpenChamber service status

### `/srv/scripts/self-destruct.sh`

**NUCLEAR OPTION.** Wipes app data and removes app containers. Requires typing exact confirmation phrase: `yes destroy everything`. Manual use only.

What it destroys:
- `/srv/1edge`, `/srv/1edge-test`, `/srv/walogger` (data volumes)
- Docker containers matching `1edge|walogger|arjun`

What it preserves:
- Coolify infrastructure itself
- Secrets
- Server config
- Other apps

### `/srv/scripts/weekly-update.mjs`

Automated weekly status report generator. Queries Coolify for deployment stats, writes a markdown report, creates a git branch, commits, pushes, and opens a PR on the `1ed-ge` repo.

Uses:
- `/srv/secrets/coolify-api` for Coolify API
- `/srv/secrets/github-pat` for GitHub PR creation

---

## 14. Dash — DORA Dashboard {#14-dash}

### What It Is

`dash.bhavesh.hk` is a Node.js DORA metrics dashboard. It tracks:
- GitHub pushes, PRs, CI status
- Coolify deployments (success/failure)

### Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/state` | GET | JSON snapshot of current state |
| `/events` | GET | SSE stream of real-time events |
| `/webhook?token=...` | POST | Coolify deploy-complete webhook receiver |
| `/health` | GET | Health check |

### How Deploy Verification Works

Instead of sleep-polling:

```bash
# Listen for real-time events
curl -N https://dash.bhavesh.hk/events

# Or get a snapshot
curl -s https://dash.bhavesh.hk/api/state
```

Wait for the app's `status=finished` event. This is event-driven, not polling.

### Fallback Verification

If dash is unavailable:
1. Coolify API: `GET /api/v1/deployments/applications/<uuid>`
2. Public URL health check: `curl -s https://<app-url>/health`

---

## 15. Gotchas & Tribal Knowledge {#15-gotchas}

### Never `localhost` in Tunnel Ingress

`localhost` resolves to IPv6 `::1` on this system. Services listen on IPv4 `127.0.0.1`. Using `localhost` in Cloudflare tunnel ingress → 502 Bad Gateway. Always use `127.0.0.1`.

### Don't Restart cf-tunnel-oc.service Unless Needed

The tunnel is stable. Restarting it causes brief downtime for all Access-protected hostnames. Only restart if the tunnel process has actually crashed.

### Coolify Env Values Must Be Single-Line

Multi-line JSON (e.g., a Firebase service-account key) breaks Coolify's generated `.env` file. Always pass minified JSON, not pretty-printed.

**Wrong:**
```json
{
  "type": "service_account",
  "project_id": "..."
}
```

**Right:**
```json
{"type":"service_account","project_id":"..."}
```

### All Apps Must Have Healthchecks

A deploy is only "finished" once the container is healthy. Set `health_check_path` to `/health`, `/ping`, or `/` depending on the app. Without this, Coolify reports "finished" before the app is actually ready.

### SSH Deploy Keys Are Banned

They can bypass branch protections and have private-repo workflow-edit access. HTTPS PATs with scoped permissions are strictly better. The `/srv/deploy-keys/` directory is legacy — do not wire these keys to any repo.

### Never Recreate a Broad Owner PAT

Each job has its own token with exactly the permissions it needs. If a token is compromised, the blast radius is limited to that one job. A broad owner PAT would give access to everything.

### The Push Token's Missing `workflow` Scope Is the Security Gate

This is the single most important security property of the system. `ocdev-push-token` cannot modify `.github/workflows/`. This means:
- oc-dev cannot change CI configuration
- oc-dev cannot add deployment backdoors
- oc-dev cannot skip checks
- oc-dev cannot modify the publish pipeline

GitHub enforces this at the API level. A push to workflow files with this token returns a hard error. This has been verified.

### Keep AGENTS.md as Single Source of Truth

`/root/.config/opencode/AGENTS.md` is the master document. Per-repo `AGENTS.md` files only carry project-specific checks and a pointer to the ship model. Don't duplicate the full system docs in each repo.

### Firebase Composite Index

walogger-v3-ui needs a composite Firestore index on `Messages/timestamp` for the sync query to work. If the UI shows query errors, check that this index exists in the Firebase console.

### Playwright Browser Path

Both oc-infra and oc-dev share the same Playwright browser installation at `/srv/oc-dev/.cache/ms-playwright`. This is set via the `PLAYWRIGHT_BROWSERS_PATH` env var in both OpenCode configs.

### Model Access

oc-infra and oc-dev share the same OpenRouter API key (`/srv/secrets/openrouter-api-key`). Friend sandboxes use BYOK (empty key). The OpenRouter key is also in oc-dev's `.env` file at `/srv/oc-dev/.config/opencode/.env`:

```
OPENROUTER_API_KEY=sk-or-v1-REDACTED
```

### Coolify API

Base URL: `http://127.0.0.1:9040/api/v1`
Auth: `Authorization: Bearer <token>` where token is from `/srv/secrets/coolify-api`

Key endpoints:
- `POST /applications/dockerimage` — create docker-image app (do NOT send `build_pack`)
- `PATCH /applications/<uuid>` — set FQDN, healthcheck
- `POST /applications/<uuid>/storages` — add persistent volume
- `POST /applications/<uuid>/envs` — add environment variable
- `POST /applications/<uuid>/start` — trigger deploy
- `GET /deployments/applications/<uuid>` — deployment history

Server UUID: `mtnltclljj6qcfjhxjppjwde`

---

## Appendix A: Systemd Service Files

### `/etc/systemd/system/openchamber.service` (oc-infra, port 3000)

```ini
[Unit]
Description=OpenChamber web UI for OpenCode
After=network.target

[Service]
Type=simple
User=root
EnvironmentFile=/root/.config/opencode/oc-env
Environment=PATH=/opt/node22/bin:/root/.opencode/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
Environment=HOME=/root
Environment=XDG_RUNTIME_DIR=/run/user/0
Environment=DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/0/bus
ExecStart=/opt/node22/bin/openchamber serve --foreground --host 127.0.0.1 --port 3000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### `/etc/systemd/system/openchamber-ocdev.service` (oc-dev, port 3005)

```ini
[Unit]
Description=OpenChamber oc-dev (dev agent instance, port 3005)
After=network.target

[Service]
Type=simple
User=root
Environment=OPENCHAMBER_UI_PASSWORD=mylo1tanic
Environment=PATH=/opt/node22/bin:/root/.opencode/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
Environment=HOME=/srv/oc-dev
Environment=XDG_CONFIG_HOME=/srv/oc-dev/.config
Environment=XDG_DATA_HOME=/srv/oc-dev/.local/share
Environment=XDG_RUNTIME_DIR=/run/user/0
Environment=DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/0/bus
ExecStart=/opt/node22/bin/openchamber serve --foreground --host 127.0.0.1 --port 3005
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### `/etc/systemd/system/openchamber-varun-oc.service` (varun, port 3001)

```ini
[Unit]
Description=OpenChamber varun-oc (port 3001)
After=network.target

[Service]
Type=simple
User=root
Environment=OPENCHAMBER_UI_PASSWORD=v@run
Environment=PATH=/opt/node22/bin:/root/.opencode/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
Environment=HOME=/srv/varun-oc
Environment=XDG_CONFIG_HOME=/srv/varun-oc/.config
Environment=XDG_DATA_HOME=/srv/varun-oc/.local/share
Environment=XDG_RUNTIME_DIR=/run/user/0
Environment=DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/0/bus
EnvironmentFile=/srv/varun-oc/.config/opencode/.env
ExecStart=/opt/node22/bin/openchamber serve --foreground --host 127.0.0.1 --port 3001
Restart=always
RestartSec=5
CPUQuota=150%
MemoryMax=4000M

[Install]
WantedBy=multi-user.target
```

### `/etc/systemd/system/openchamber-manish-oc.service` (manish, port 3003)

```ini
[Unit]
Description=OpenChamber manish-oc (port 3003)
After=network.target

[Service]
Type=simple
User=root
Environment=OPENCHAMBER_UI_PASSWORD=m@nish
Environment=PATH=/opt/node22/bin:/root/.opencode/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
Environment=HOME=/srv/manish-oc
Environment=XDG_CONFIG_HOME=/srv/manish-oc/.config
Environment=XDG_DATA_HOME=/srv/manish-oc/.local/share
Environment=XDG_RUNTIME_DIR=/run/user/0
Environment=DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/0/bus
EnvironmentFile=/srv/manish-oc/.config/opencode/.env
ExecStart=/opt/node22/bin/openchamber serve --foreground --host 127.0.0.1 --port 3003
Restart=always
RestartSec=5
CPUQuota=150%
MemoryMax=4000M

[Install]
WantedBy=multi-user.target
```

### `/etc/systemd/system/cf-tunnel-oc.service`

```ini
[Unit]
Description=Cloudflare Tunnel for oc.bhavesh.hk -> OpenChamber
After=network.target openchamber.service
Wants=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/cf-tunnel-oc
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Where `/usr/local/bin/cf-tunnel-oc` is:
```bash
#!/bin/bash
set -euo pipefail
exec /usr/local/bin/cloudflared tunnel run --token "$(cat /srv/secrets/cloudflare-tunnel-token | tr -d '\n')"
```

---

## Appendix B: Git Configuration

### Root (oc-infra) — `/root/.gitconfig`

```ini
[credential "https://github.com"]
    helper =
    helper = !/usr/bin/gh auth git-credential
[credential "https://gist.github.com"]
    helper =
    helper = !/usr/bin/gh auth git-credential
[url "https://github.com/"]
    insteadOf = git@github.com:
```

Uses `gh` CLI for credential management. SSH URLs are rewritten to HTTPS.

### oc-dev — `/srv/oc-dev/.gitconfig`

```ini
[url "https://github.com/"]
    insteadOf = git@github.com:
[credential]
    helper = store
[user]
    name = bhaveshdhaka
    email = mail@bhavesh.net
```

Uses credential store (file-based). Credentials in `/srv/oc-dev/.git-credentials`.

---

## Appendix C: MCP Servers

Both oc-infra and oc-dev have the same MCP servers configured:

| Server | Package | Purpose | Status |
|---|---|---|---|
| context7 | `@upstash/context7-mcp@latest` | Library documentation lookup | enabled |
| playwright | `@playwright/mcp@latest` | Browser automation (headless chromium) | enabled |
| browser-control | `@delorenj/browser-control-firefox` | Firefox browser control | disabled |

Playwright shares browser cache at `/srv/oc-dev/.cache/ms-playwright`.

---

## Appendix D: OpenCode Plugin

Both instances use `@opencode-ai/plugin` version `1.18.18` as defined in their respective `package.json` files.

---

*Document generated 2026-08-14. Update this file when the system changes.*
