# Tool Assessment: How Each kunchenguid Tool Fits the OC Pipeline

> Analyzed against the existing oc-infra/oc-dev system documented in `/srv/OC-SYSTEM-DOCS.md`.
> Date: 2026-08-14

---

## Summary Table

| Tool | Impact | Where it fits | Effort to adopt |
|---|---|---|---|
| **no-mistakes** | **HIGH** | Replaces the CI gate with adversarial local validation | Low — install + configure per repo |
| **gnhf** | **HIGH** | Overnight autonomous loop for oc-infra maintenance tasks | Low — install globally, run with opencode agent |
| **treehouse** | **HIGH** | Replaces manual `/var/repos/<repo>-preprod` worktree management | Low — install + configure |
| **gh-axi** | **MEDIUM** | Token-efficient GitHub operations for agents | Low — skill install |
| **chrome-devtools-axi** | **MEDIUM** | Replaces Playwright MCP with faster, cheaper browser automation | Medium — swap MCP config |
| **firstmate** | **MEDIUM** | Multi-agent orchestration (overkill for current scale) | High — requires workflow redesign |
| **lavish-axi** | **LOW-MEDIUM** | Rich HTML review artifacts for design specs | Low — skill install |
| **axi** | **LOW** | Design philosophy, not a tool — informs how to build CLIs | Reference only |
| **baby-menu** | **LOW** | macOS only, not applicable to headless Debian server | N/A |
| **dotfiles** | **LOW** | Reference for nix-darwin patterns, not directly applicable | N/A |

---

## 1. no-mistakes — Kill Slop, Raise Clean PR

**What it does:** Puts a local git proxy in front of your real remote. Push to `no-mistakes` instead of `origin`, and it spins up a disposable worktree, runs an AI-driven validation pipeline (review → test → docs → lint → push → PR → CI), and only forwards to origin after every check passes.

**How it fits your pipeline:**

Your current pipeline is:
```
Agent edits → runs check locally → git push → CI gate → Coolify deploy
```

The problem: agents sometimes push red. The check command passes locally but CI fails (different environment, missing deps, etc). The agent then has to fix and re-push, wasting a CI cycle and time.

With no-mistakes:
```
Agent edits → git push no-mistakes → disposable worktree validation → 
  adversarial AI review → lint → test → build → 
  only then: push to origin → CI gate → Coolify deploy
```

**The key insight:** no-mistakes adds an *adversarial review* step that your current pipeline lacks. Your Superpowers system has `superpowers-code-reviewer`, but that reviews code *before* commit. no-mistakes reviews *after* commit, in an isolated worktree, with a fresh perspective. It catches things the implementer's own review misses.

**Where it specifically helps:**
- oc-dev pushes code that passes local checks but fails CI — no-mistakes catches this in a disposable worktree first
- The adversarial review acts as a second pair of eyes on every push
- Auto-fix for mechanical issues (formatting, imports) saves agent round-trips

**Adoption plan:**
1. Install: `curl -fsSL https://raw.githubusercontent.com/kunchenguid/no-mistakes/main/docs/install.sh | sh`
2. In each repo: `no-mistakes init` (sets up the gate remote)
3. Update oc-dev's workflow: push to `no-mistakes` instead of `origin`
4. Configure `.no-mistakes.yaml` per repo with the validation pipeline

**Risk:** Adds latency to each push. The disposable worktree validation takes time. But it's parallelizable and catches errors before they burn CI minutes.

---

## 2. gnhf — Good Night, Have Fun

**What it does:** An autonomous loop orchestrator. You give it a prompt, it runs your agent in a loop — each iteration makes one small, committed, documented change. You wake up to a branch full of clean work.

**How it fits your pipeline:**

Your current system has no overnight automation. oc-infra does maintenance manually — security audits, dependency updates, infrastructure cleanup. oc-dev works on features during active sessions.

With gnhf:
```bash
# oc-infra: overnight security hardening
gnhf "audit and harden all container configurations, update dependencies, 
      fix any security findings from audit-server-sec.sh" --agent opencode

# oc-dev: overnight refactoring
gnhf "refactor walogger-v2 to use async/await consistently, 
      add proper error handling" --agent opencode --worktree

# Parallel worktree tasks
gnhf --worktree "add comprehensive tests to 1ed-ge" &
gnhf --worktree "update walogger-v3-ui to match v3 API changes" &
```

**Where it specifically helps:**
- **Overnight maintenance:** Run `audit-server-sec.sh`, fix findings, update deps, clean up docker images
- **Batch refactoring:** Large-scale code changes that are too tedious for interactive sessions
- **Parallel feature work:** Multiple `--worktree` runs on different repos simultaneously
- **Incremental progress:** Each iteration is committed, so you can cherry-pick or revert individual changes

**Adoption plan:**
1. Install: `npm install -g gnhf`
2. Configure `~/.gnhf/config.yml` with `agent: opencode`
3. Run overnight tasks from oc-infra with appropriate prompts
4. Use `--worktree` for parallel work on multiple repos

**Risk:** Agent hallucinations compound over iterations. The 3-consecutive-failure abort limit mitigates this. Always review the branch before merging.

---

## 3. treehouse — Worktree Pool Manager

**What it does:** Manages a pool of reusable, isolated git worktrees. Each agent gets its own environment instantly — no cloning, no conflicts, no coordination overhead. Worktrees are preserved with deps and build cache intact.

**How it fits your pipeline:**

Your current setup has manually managed worktrees:
```
/var/repos/1ed-ge          # main
/var/repos/1ed-ge-preprod  # preprod
/var/repos/walogger-v2     # main
/var/repos/walogger-v2-preprod  # preprod
```

These are static. If oc-dev needs to work on two features simultaneously, there's no isolation. If two agents touch the same repo, they collide.

With treehouse:
```bash
cd /var/repos/1ed-ge
treehouse  # drops into isolated worktree at ~/.treehouse/1ed-ge-xxx/1/1ed-ge
# agent works here
exit  # worktree returns to pool, deps intact
# next agent gets same worktree instantly
```

**Where it specifically helps:**
- **oc-dev parallel work:** Multiple features in the same repo without collision
- **gnhf integration:** `gnhf --worktree` already uses worktrees, but treehouse makes them reusable
- **firstmate integration:** firstmate uses treehouse for crewmate worktrees
- **Preprod branches:** Instead of static `*-preprod` directories, use dynamic worktrees
- **Build cache preservation:** npm install / build cache persists across sessions

**Adoption plan:**
1. Install: `curl -fsSL https://kunchenguid.github.io/treehouse/install.sh | sh`
2. Create `treehouse.toml` in each repo with `max_trees = 8`
3. Replace static preprod worktrees with dynamic treehouse worktrees
4. Update oc-dev AGENTS.md to use `treehouse get` instead of manual worktree management

**Risk:** Low. Worktrees are git-native. Worst case, `treehouse prune` cleans up.

---

## 4. gh-axi — Agent-Ergonomic GitHub CLI

**What it does:** Wraps the official `gh` CLI with token-efficient TOON output, contextual next-step suggestions, and structured error handling. Benchmarks show 100% task success vs 86% for raw `gh` CLI, at 7% lower cost.

**How it fits your pipeline:**

Your agents currently use raw `gh` CLI for GitHub operations — checking PRs, viewing CI runs, creating issues. This works but is verbose and error-prone.

With gh-axi:
```
Before: gh pr view 42 --json title,body,status,checks,reviews,comments,...
After:  gh-axi pr view 42
        → TOON output: 40% fewer tokens, includes next-step suggestions
```

**Where it specifically helps:**
- **CI investigation:** `gh-axi run view --log-failed` with structured output
- **PR management:** `gh-axi pr checks` with pass/fail/pending bucketing
- **Issue triage:** `gh-axi issue list` with pre-computed aggregates
- **Token savings:** Every `gh` call costs tokens. TOON format saves ~40%.

**Adoption plan:**
1. Install: `npm install -g gh-axi` or `npx skills add kunchenguid/gh-axi --skill gh-axi -g`
2. Add to AGENTS.md: "Use `gh-axi` for GitHub operations"
3. No workflow changes needed — it's a drop-in replacement for `gh`

**Risk:** Near zero. It wraps `gh`, so if gh-axi fails, you can fall back to raw `gh`.

---

## 5. chrome-devtools-axi — Agent-Ergonomic Browser Automation

**What it does:** Wraps chrome-devtools-mcp with AXI-compliant CLI. Benchmarks show 57% fewer input tokens, 26% lower cost, and 27% fewer agent turns vs raw chrome-devtools-mcp. 100% task success.

**How it fits your pipeline:**

You currently have Playwright MCP configured for both oc-infra and oc-dev:
```jsonc
"playwright": {
  "type": "local",
  "command": ["npx", "--yes", "@playwright/mcp@latest", "--headless", "--no-sandbox", "--browser", "chromium"],
  "env": { "PLAYWRIGHT_BROWSERS_PATH": "/srv/oc-dev/.cache/ms-playwright" }
}
```

Playwright MCP works but is verbose. The agent makes many tool calls per browser task.

With chrome-devtools-axi:
- Combined operations: one command navigates, captures, and suggests next steps
- TOON output: ~40% fewer tokens per response
- Persistent bridge: Chrome doesn't restart every invocation
- Stale ref detection: `STALE_REF` error instead of silent no-op

**Where it specifically helps:**
- **UI testing:** Verify deployed apps look correct after deploys
- **Visual regression:** Screenshot comparison for design system compliance
- **Form testing:** Fill forms, click through flows with fewer tool calls
- **Debugging:** Console messages, network requests, performance audits

**Adoption plan:**
1. Install: `npm install -g chrome-devtools-axi` or `npx skills add kunchenguid/chrome-devtools-axi --skill chrome-devtools-axi -g`
2. Replace Playwright MCP config with chrome-devtools-axi skill
3. Or keep both — Playwright for existing workflows, chrome-devtools-axi for new ones

**Risk:** Low. Can coexist with Playwright. Chrome needs to be installed (already is via Playwright's browser cache).

---

## 6. firstmate — Multi-Agent Orchestration

**What it does:** You talk to a single agent (the first mate), it runs a crew for you: spawning autonomous agents in visible sessions, giving each a clean git worktree, supervising them to completion, and handing you finished PRs.

**How it fits your pipeline:**

Your current model is single-agent: oc-infra or oc-dev works on one task at a time. For parallel work, you'd need to manually manage multiple sessions.

With firstmate:
```
You: "fix the flaky login test in walogger-v2 and add dark mode to 1ed-ge"
Firstmate: spawns two crewmates in separate worktrees
  → PR 1: fix flaky login test (CI green)
  → PR 2: add dark mode (CI green)
```

**Assessment:** firstmate is powerful but **overkill for your current scale**. You have 6 repos and 2 agent identities. firstmate is designed for teams running 5-10+ parallel tasks. Your Superpowers system already handles the brainstorm → spec → plan → implement → review workflow. firstmate would add a coordination layer on top that you don't yet need.

**When it becomes relevant:**
- If you start running 3+ parallel tasks regularly
- If you add more team members who need agent coordination
- If you want to automate the "fix CI failure" loop without manual intervention

**Adoption plan (when ready):**
1. Clone firstmate repo
2. Configure projects in `projects/` directory
3. Launch with Claude Code, Grok, or Pi as primary harness
4. Uses treehouse for worktree management

**Risk:** High complexity. Requires understanding tmux backends, supervision protocols, project modes. Not worth it until you hit the scale where manual coordination is the bottleneck.

---

## 7. lavish-axi — HTML Artifact Collaboration

**What it does:** Opens agent-generated HTML files in a local browser, lets you pinpoint elements and selected text, edit Mermaid diagrams as whiteboards, and send feedback to the agent.

**How it fits your pipeline:**

Your Superpowers workflow generates design specs as markdown files. These are text-heavy. For visual features (UI changes, architecture diagrams, layout decisions), the current workflow is suboptimal — you're describing visual changes in words.

With lavish-axi:
- Agent writes a design spec as HTML with interactive elements
- You annotate specific elements: "this button should be blue"
- Agent receives structured feedback with exact selectors
- Mermaid diagrams become editable whiteboards

**Where it specifically helps:**
- **Design specs for UI work:** 1ed.ge, walogger-v3-ui, arjun.hk
- **Architecture diagrams:** System topology, data flow, deployment pipeline
- **Visual regression review:** Before/after screenshots with annotation

**Adoption plan:**
1. Install: `npx skills add kunchenguid/lavish-axi --skill lavish`
2. Update Superpowers brainstorming skill to offer lavish for visual topics
3. Agent generates HTML artifacts instead of markdown for visual specs

**Risk:** Low. Purely additive — doesn't change existing workflows, just adds a visual review option.

---

## 8. axi — Design Principles (Reference Only)

**What it does:** 10 design principles for building agent-ergonomic CLIs. Not a tool — a specification and design philosophy.

**How it fits your pipeline:**

This is a reference for building better agent tools, not something you install. The principles are:
1. Token-efficient output (TOON format)
2. Minimal default schemas (3-4 fields, not 10+)
3. Content truncation with `--full` escape hatch
4. Pre-computed aggregates
5. Definitive empty states
6. Structured errors & exit codes
7. Ambient context (session hooks)
8. Content first (no-args shows live data)
9. Contextual disclosure (next-step suggestions)
10. Consistent way to get help

**Where it specifically helps:**
- If you build custom CLI tools for your infrastructure (e.g., a Coolify CLI wrapper)
- When evaluating any new CLI tool — does it follow AXI principles?
- When writing agent instructions — prefer AXI-compliant tools over verbose ones

**Adoption:** Reference only. No installation.

---

## 9. baby-menu — Not Applicable

macOS-only Electron menu bar app. Your server is headless Debian. Not applicable.

**Future consideration:** If you ever run a Mac as a local dev machine, baby-menu could provide a quick system status dashboard (CPU, deploy status, Coolify health) in the menu bar, driven by an agent that self-modifies the widgets.

---

## 10. dotfiles — Reference Only

nix-darwin + home-manager dotfiles for macOS. Your server is Debian and doesn't use Nix.

**What's useful to steal:**
- The `AGENTS.md` sharing pattern: one agent policy installed for Claude, Codex, and opencode
- The symlink model: config files in a repo, symlinked to their live locations
- The `cc` and `co` aliases pattern for high-agency agent shortcuts

**Adoption:** Reference only. Your current setup with `/root/.config/opencode/AGENTS.md` and `/srv/oc-dev/.config/opencode/AGENTS.md` already follows a similar pattern.

---

## Recommended Adoption Order

### Phase 1: Quick Wins (this week)
1. **gh-axi** — Drop-in replacement, zero risk, immediate token savings
2. **treehouse** — Install and configure, replace static preprod worktrees

### Phase 2: Pipeline Hardening (next week)
3. **no-mistakes** — Install per-repo, configure adversarial validation
4. **chrome-devtools-axi** — Replace Playwright MCP for new browser tasks

### Phase 3: Automation (when ready)
5. **gnhf** — Start running overnight maintenance tasks
6. **lavish-axi** — Use for visual design specs on UI projects

### Phase 4: Scale (when needed)
7. **firstmate** — When you hit 3+ parallel tasks regularly

### Not Adopted
- **axi** — Reference only
- **baby-menu** — Not applicable (headless Linux)
- **dotfiles** — Reference only

---

## How These Tools Interact

These tools form a coherent ecosystem:

```
treehouse (worktree pool)
    ↓ used by
firstmate (multi-agent orchestration)
    ↓ uses
gnhf (overnight loops) + no-mistakes (push validation)
    ↓ all use
gh-axi (GitHub operations) + chrome-devtools-axi (browser)
    ↓ visual review via
lavish-axi (HTML artifacts)
    ↓ all follow
axi (design principles)
```

The key insight: **no-mistakes + treehouse + gh-axi** is the highest-impact combination for your current pipeline. These three together give you:
- Isolated worktrees (treehouse)
- Adversarial validation before CI (no-mistakes)
- Token-efficient GitHub operations (gh-axi)

This directly addresses your pipeline's current weaknesses:
- Agents pushing red → no-mistakes catches it
- Static worktree management → treehouse automates it
- Verbose GitHub operations → gh-axi compresses it

---

## Integration with Existing Superpowers

Your Superpowers workflow (brainstorm → spec → plan → implement → review) is complementary to all of these tools:

- **no-mistakes** wraps around the "implement" phase — after the implementer commits, no-mistakes validates before CI
- **treehouse** provides the worktrees that Superpowers implementer works in
- **gh-axi** replaces raw `gh` in all agent instructions
- **gnhf** runs the Superpowers workflow in a loop for batch tasks
- **lavish-axi** enhances the "brainstorm" and "spec" phases for visual topics

No conflicts. All additive.
