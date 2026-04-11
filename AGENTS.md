# Agent Instructions

## Core Rules

- Use `bd` for all task tracking
- Do not create markdown TODO lists or alternate tracking systems
- Use non-interactive shell flags for file operations
- Isolate task work in a dedicated branch or worktree before editing code
- For mobile Playwright testing, use headed runs against the active `cloudflared` HTTPS tunnel

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

## Playwright Testing

For iPhone Safari and Android verification:

- Always run Playwright in headed mode
- Always reuse the currently running `cloudflared` tunnel for HTTPS
- Set `PLAYWRIGHT_EXTERNAL_SERVER=1`
- Set `PLAYWRIGHT_BASE_URL=https://<active-tunnel-host>/`
- Do not start a separate Playwright-managed local server when an active tunnel already exists

Examples:

```bash
PLAYWRIGHT_BASE_URL=https://<active-tunnel-host>/ npm run sim:path:https:iphone
PLAYWRIGHT_BASE_URL=https://<active-tunnel-host>/ npm run sim:path:https:pixel
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
- Do not create a pull request until the user explicitly says testing is done
