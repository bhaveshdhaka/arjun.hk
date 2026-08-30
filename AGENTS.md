# arjun.hk

Static single-page site (one `index.html` + assets, served by `nginx:alpine`).
Single branch `main`. Deploys are **fleet-managed** (k3s on `hk-03-dev`,
service `arjun-hk`, host `arjun.hk`). There is no Coolify, no ghcr deploy
path, and no webhook — the GitHub CI workflow only runs `check.sh` (and a
vestigial build/trigger that the real path ignores).

## Before you ship

Run the check locally — it's the same command CI runs:

```bash
bash check.sh
```

It verifies `index.html` is present + well-formed and that every referenced
local asset exists. Fix anything that fails first.

## Ship (fleet is the only deploy path)

Commit your work, then from the **fleet repo**:

```bash
export FLEET_ROOT=/home/openchamber/workspaces/fleet
export FLEET_SECRETS_HOME=/root/.fleet/secrets   # secrets live under /root
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
