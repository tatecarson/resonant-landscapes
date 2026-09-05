#!/usr/bin/env bash
set -euo pipefail

#
# Guard against a stray beads database inside a git worktree.
#
# Worktrees share the main repository's beads database automatically, through
# git common-directory discovery — `bd worktree --help` says so outright, and
# bd 1.2.2 was verified doing it: a freshly created worktree resolves straight
# to the main tracker with no .beads/dolt of its own.
#
# Older bd did not. Worktrees created under it grew their own .beads/dolt: an
# independent clone of the tracker, frozen at whatever the schema was that day.
# Six of them were still on this machine on 2026-09-05, and the newest issue any
# of them had heard of was three weeks old.
#
# The reason this is worth a script rather than a note is how it fails. bd finds
# the stray database before it walks up to the real one, so `bd ready` in that
# worktree does not error in a way that says "wrong database" — it either
# refuses on a schema-migration check or, worse, answers. An agent asked to pick
# up the next task reads a backlog where everything shipped weeks ago looks
# open, everything filed since is simply absent, and nothing on screen suggests
# it is reading a fossil.
#
# `bd doctor` does notice, but misnames it: "Unable to open database", which
# reads as a server problem. Following that, or following the migration error's
# own advice to run `bd migrate` or `bd bootstrap`, is how the stray gets
# recreated or the shared schema gets forked. Hence a check that names the
# actual cause and the actual fix.
#
# Usage:
#   scripts/check-beads-worktree.sh          # check the current checkout
#   scripts/check-beads-worktree.sh --all    # check every worktree of this repo
#   scripts/check-beads-worktree.sh --fix    # move any stray aside, with a backup
#
# Exits non-zero when a stray is found and --fix was not given.
#

FIX=0
ALL=0
for arg in "$@"; do
  case "$arg" in
    --fix) FIX=1 ;;
    --all) ALL=1 ;;
    -h|--help) sed -n '4,38p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

# The main checkout is the one whose root contains the common git directory.
# It is *supposed* to hold .beads/dolt, so it is never a finding here.
COMMON_DIR="$(git rev-parse --git-common-dir)"
case "$COMMON_DIR" in
  /*) ;;
  *) COMMON_DIR="$(cd "$COMMON_DIR" && pwd)" ;;
esac
MAIN_ROOT="$(cd "$(dirname "$COMMON_DIR")" && pwd)"

# Built with a read loop rather than mapfile: macOS still ships bash 3.2 as
# /bin/bash, and this has to run on the machine the walk is developed on.
ROOTS=()
if [ "$ALL" -eq 1 ]; then
  while IFS= read -r line; do
    ROOTS+=("$line")
  done < <(git worktree list --porcelain | awk '/^worktree /{print $2}')
else
  ROOTS=("$(git rev-parse --show-toplevel)")
fi

found=0
fixed=0
for root in "${ROOTS[@]}"; do
  [ "$root" = "$MAIN_ROOT" ] && continue
  [ -d "$root/.beads/dolt" ] || continue

  found=$((found + 1))
  echo "stray beads database: $root/.beads/dolt"

  if [ "$FIX" -eq 0 ]; then
    continue
  fi

  # Stop the sql-server holding the directory open before moving it. Moving a
  # live Dolt data directory out from under its server corrupts both.
  pid_file="$root/.beads/dolt-server.pid"
  if [ -f "$pid_file" ]; then
    pid="$(cat "$pid_file" 2>/dev/null || true)"
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      while kill -0 "$pid" 2>/dev/null; do sleep 1; done
      echo "  stopped dolt sql-server (pid $pid)"
    fi
  fi

  # Moved, never deleted. A stray is usually a strict subset of the real
  # tracker, but "usually" is not a thing to bet somebody's filed issues on.
  backup="$root/../.beads-stray-$(basename "$root")-$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$backup"
  for f in dolt backup dolt-server.lock dolt-server.log dolt-server.pid \
           dolt-server.port dolt-config.log dolt-server.activity \
           export-state.json push-state.json last-touched .local_version \
           .beads-credential-key embeddeddolt proxieddb; do
    [ -e "$root/.beads/$f" ] && mv -f "$root/.beads/$f" "$backup/"
  done
  echo "  moved aside to $backup"
  fixed=$((fixed + 1))
done

if [ "$found" -eq 0 ]; then
  echo "no stray beads databases; worktrees are sharing the main tracker"
  exit 0
fi

if [ "$FIX" -eq 1 ]; then
  echo
  echo "fixed $fixed. Confirm with: bd context   (beads dir should be $MAIN_ROOT/.beads)"
  exit 0
fi

cat <<EOF

$found worktree(s) hold their own beads database instead of sharing the main one.
Anything reading the backlog there is reading a fossil.

Fix:  scripts/check-beads-worktree.sh --fix

Do NOT run 'bd init', 'bd bootstrap' or 'bd migrate' in a worktree to clear
this, whatever bd's own error suggests: bootstrap recreates the stray, and
migrating a clone forks the shared schema so 'bd dolt pull' can never merge
again.
EOF
exit 1
