#!/usr/bin/env bash
# Overnight runner for Claude Code (macOS / Linux / WSL / Git Bash).
# Relaunches Claude Code whenever a session ends: usage limit, crash, or finished turns.
# Stops at the deadline, or when a STOP file exists in the project folder.
#
# Usage:  cd undercroft && bash overnight.sh
# Deadline (local time, 24h):
DEADLINE="10:00"

PROMPT='You are resuming the overnight build. Follow CLAUDE.md exactly. Run the Resume Protocol (section 1), then work through PROGRESS.md in strict priority order. Do not ask questions; decide, log decisions in DECISIONS.md, and keep going. Commit after every task. Do not stop while tasks remain.'

deadline_epoch() {
  # Next occurrence of DEADLINE (today if still ahead, else tomorrow)
  if date -d "today $DEADLINE" +%s >/dev/null 2>&1; then
    local t; t=$(date -d "today $DEADLINE" +%s)
    [ "$t" -le "$(date +%s)" ] && t=$(date -d "tomorrow $DEADLINE" +%s)
    echo "$t"
  else # macOS BSD date
    local t; t=$(date -j -f "%H:%M" "$DEADLINE" +%s)
    [ "$t" -le "$(date +%s)" ] && t=$((t + 86400))
    echo "$t"
  fi
}
END=$(deadline_epoch)
mkdir -p logs
echo "Running until $(date -r "$END" 2>/dev/null || date -d "@$END")"

while [ "$(date +%s)" -lt "$END" ] && [ ! -f STOP ]; do
  START=$(date +%s)
  LOG="logs/session-$(date +%Y%m%d-%H%M%S).log"
  echo "=== session start $(date) ===" | tee -a "$LOG"

  claude -p "$PROMPT" --dangerously-skip-permissions --max-turns 400 2>&1 | tee -a "$LOG"

  ELAPSED=$(( $(date +%s) - START ))
  if grep -qiE "usage limit|rate limit|limit reached|resets at|try again" "$LOG" || [ "$ELAPSED" -lt 120 ]; then
    echo "Looks like a usage limit or a quick failure. Sleeping 15 min..." | tee -a "$LOG"
    sleep 900
  else
    sleep 20
  fi
done
echo "Overnight run finished at $(date)."
