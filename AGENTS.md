# arjun.hk

Static single-page site (one `index.html` + assets, served by `nginx:alpine`).
Single branch `main`. Coolify app `arjun.hk` (`pexxwuld0pa8q9bnwhnriqbl`) pulls
`ghcr.io/bhaveshdhaka/arjun.hk:main` → https://arjun.hk / www.arjun.hk (public).

## Before you push

Run the check locally — it's the same command CI runs:

```bash
bash check.sh
```

It verifies `index.html` is present + well-formed and that every referenced
local asset exists. Fix anything that fails before pushing.

## Ship

`git push origin main` → CI gate (check.sh) → image build → Coolify deploy →
live. Verify with `curl -N https://dash.bhavesh.hk/events` (wait for
`status=finished`), then confirm HTTP 200 at https://arjun.hk.

CI is the gate; there is no manual review and no way to bypass it.
