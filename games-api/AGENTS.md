# games-api — project law

## What this is
The backend API for arjun.hk games: pin login, SRS/game state storage and
merge for a single customer (the arjun.hk site). Not a multi-tenant service;
scope stays personal-use.

## Run / build
- Run locally: `ARJUN_PIN=... go run .` (listens on `0.0.0.0:8080`, override with `PORT`).
- Container: build the `Dockerfile` (two-stage, `golang:1.23-alpine` → `alpine:3.20`, static binary).

## Verify
- `scripts/test.sh` at repo root: `go vet ./...` + `go test ./...`. It must stay
  executable and exit 0. This is the doctor docs-contract verification.

## Access doctrine
- CORS is pinned to `https://arjun.hk` (`allowOrigin` in main.go). Changing the
  allowed origin requires updating the site registry entry first — do not edit
  the constant ad hoc.
- Login is rate-limited (5 failures / 5 min per IP). Keep it.

## Data discipline
- The JSON store (`/data/state.json`, `/data/tokens.json`; `DATA_DIR` overridable)
  is the application's own data. Live data files are READ-ONLY to agents:
  touch state only through the API (`/v1/login`, `/v1/state`, `/v1/sync`),
  never by hand-editing files.

## Style
- Stdlib-only tendencies: no new dependencies without a law update in this file.
- Go 1.23 (see go.mod / Dockerfile pin). Keep them in sync.
