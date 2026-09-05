# Agent Instructions

## Core Rules

- Use `bd` for all task tracking
- Do not create markdown TODO lists or alternate tracking systems
- Use non-interactive shell flags for file operations
- Isolate task work in a dedicated branch or worktree before editing code
- For mobile Playwright testing, use headed runs against the PR's Netlify HTTPS preview when available

## Task Tracking

This project uses **bd (beads)** for issue tracking.

Common commands:

```bash
bd ready --json
bd show <id>
bd update <id> --claim --json
bd close <id> --reason "Done" --json
bd sync
```

Rules:

- Always use `bd` for task status and discovery
- Always use `--json` when an agent is reading command output programmatically
- If new follow-up work is discovered, create a linked `bd` issue

## Branch / Worktree Isolation

Before making code changes, create or switch to a dedicated branch for the task.
If the current checkout has unrelated changes or is already being used for other work, create a separate worktree instead.

Default flow:

```bash
bd update <id> --claim --json
git checkout -b <task-branch>
```

If the current checkout is dirty:

```bash
git worktree add ../<repo>-<task-branch> -b <task-branch>
```

Rules:

- Never mix task changes with unrelated local changes
- Prefer a worktree when preserving an existing debugging state
- Prefer a worktree when running parallel tasks

### Beads in a worktree

A worktree shares the main checkout's beads database automatically, through git
common-directory discovery. A worktree must therefore **not** have a
`.beads/dolt` directory of its own.

Older versions of bd gave each worktree one anyway, and the result is quiet
rather than loud: bd finds the local copy before it walks up to the real one, so
the backlog you read there is frozen at whatever day the worktree was made.
Issues closed weeks ago look open, issues filed since are missing entirely, and
nothing says you are reading a stale copy. Six worktrees on this machine were in
that state on 2026-09-05.

Check with `npm run beads:check`; clear it with
`scripts/check-beads-worktree.sh --fix`, which stops the worktree's stray Dolt
server and moves the database aside rather than deleting it.

**Never run `bd init`, `bd bootstrap` or `bd migrate` inside a worktree**, even
when bd's own error message recommends it. When bd hits a stray database it
reports pending schema migrations and offers exactly those two remedies:
`bd bootstrap` recreates the stray, and migrating a clone forks the shared
schema so `bd dolt pull` can never merge again. The fix is always to remove the
stray, never to repair it.

To read or write the tracker from somewhere bd is resolving wrongly, point it at
the main checkout instead of migrating anything:

```bash
bd -C /path/to/main/checkout --readonly ready
```

## Playwright Testing

For iPhone Safari and Android verification:

- Always run Playwright in headed mode
- Use the PR's Netlify deploy preview as the primary HTTPS test target
- Before a PR preview exists, reuse the currently running `cloudflared` tunnel
- Set `PLAYWRIGHT_EXTERNAL_SERVER=1`
- Set `PLAYWRIGHT_BASE_URL` to the Netlify preview or active tunnel URL
- Do not start a Playwright-managed local server when an HTTPS target already exists

Examples:

```bash
PLAYWRIGHT_EXTERNAL_SERVER=1 PLAYWRIGHT_BASE_URL=https://deploy-preview-<pr>--<site>.netlify.app/ npm run sim:path:https:iphone
PLAYWRIGHT_EXTERNAL_SERVER=1 PLAYWRIGHT_BASE_URL=https://deploy-preview-<pr>--<site>.netlify.app/ npm run sim:path:https:pixel
```

## Non-Interactive Shell Commands

Always use non-interactive flags for file operations that may otherwise prompt.

Examples:

```bash
cp -f source dest
mv -f source dest
rm -f file
rm -rf directory
cp -rf source dest
```

Also prefer:

- `scp -o BatchMode=yes`
- `ssh -o BatchMode=yes`
- `apt-get -y`
- `HOMEBREW_NO_AUTO_UPDATE=1 brew ...`

## Session Completion

Before ending a work session:

1. File issues for remaining follow-up work
2. Run relevant quality gates if code changed
3. Let the user manually review code when requested
4. Add or update tests when applicable
5. Update `bd` issue state
6. Sync and push all completed work
7. Verify the branch is pushed and clean
8. Hand off useful context for the next session

Required git flow:

```bash
git pull --rebase
bd sync
git push
git status
```

Rules:

- Work is not complete until changes are pushed successfully
- Do not leave completed work stranded locally
- If push fails, resolve it and retry
- Create a draft pull request after the branch is pushed when a Netlify preview is needed for testing
- Keep the pull request in draft until automated checks and requested manual tests are complete
- Do not merge until testing is complete and the user explicitly approves the merge
