# Issue tracker: bd (beads)

Issues and specs for this repo live in **bd (beads)**, the git-backed issue tracker in `.beads/`. Use the `bd` CLI for all operations. Do not create GitHub issues, markdown TODO lists, or any alternate tracking system — see the Core Rules in `AGENTS.md`.

Always pass `--json` when reading command output programmatically.

## Conventions

- **Create an issue**: `bd create --title "..." --description "..." --type=task|bug|feature|epic|chore --priority=2 --json`. Priority is `0`–`4` (0 = critical, 2 = medium, 4 = backlog) — never `high`/`medium`/`low`. Use a heredoc or `--description "$(cat <<'MD' ... MD)"` for multi-line bodies.
  - Optional structure: `--acceptance="..."`, `--design="..."`, `--notes="..."`, `--labels=a,b`, `--parent=<id>`.
- **Read an issue**: `bd show <id> --json` — includes dependencies, labels, and status.
- **List issues**: `bd list --status=open --json`, `bd list --status=in_progress --json`. Filter by label with `bd list --label=<label> --json`.
- **Search**: `bd search "<query>" --json`
- **Comment on an issue**: `bd comment <id> "..."` (or `bd comments add <id> "..."`; read with `bd comments <id>`).
- **Apply / remove labels**: `bd label add <id> <label>` / `bd label remove <id> <label>`. `bd label list-all` shows the vocabulary in use.
- **Update fields**: `bd update <id> --title/--description/--notes/--design/--priority/--status`.
- **Close**: `bd close <id> --reason "..."`. Multiple at once: `bd close <id1> <id2> ...`.

**Never run `bd edit`** — it opens `$EDITOR` and blocks the agent.

## Dependencies

- `bd dep add <issue> <depends-on>` — `<issue>` is blocked by `<depends-on>` (default `--type=blocks`).
- Other edge types: `parent-child`, `tracks`, `related`, `discovered-from`, `supersedes`.
- `bd blocked` lists everything with an open blocker; `bd ready` lists everything with none.

## Sync

`bd dolt pull` at session start, and again before committing. See the session-close checklist in `AGENTS.md`.

## When a skill says "publish to the issue tracker"

Run `bd create`. Record the returned issue ID and hand it back to the user.

## When a skill says "fetch the relevant ticket"

Run `bd show <id> --json`, plus `bd comments <id>` when the conversation history matters. The user will normally pass the issue ID (e.g. `rl-uqb`) directly.

## Wayfinding operations

Used by `/wayfinder`. The **map** is an epic issue with **child** issues as tickets.

- **Map**: `bd create --type=epic --labels=wayfinder:map --title "..." --description "..."` — the Notes / Decisions-so-far / Fog body lives in the description.
- **Child ticket**: `bd create --parent=<map-id> --labels=wayfinder:<type> --title "..." --description "<the question>"`, where `<type>` is `research` / `prototype` / `grilling` / `task`.
- **Blocking**: `bd dep add <child> <blocker>`. A ticket is unblocked when every blocker is closed.
- **Frontier query**: `bd ready --json`, kept to children of the map (`bd show <map-id> --json`) with no assignee; first in creation order wins.
- **Claim**: `bd update <id> --claim --json` — the session's first write.
- **Resolve**: `bd comment <id> "<answer>"`, then `bd close <id> --reason "..."`, then append a context pointer (gist + issue ID) to the map's Decisions-so-far via `bd update <map-id> --description ...`.
