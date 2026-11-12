# Overnight runner for Claude Code (Windows PowerShell).
# Relaunches Claude Code whenever a session ends: usage limit, crash, or finished turns.
# Stops at the deadline, or when a STOP file exists in the project folder.
#
# Usage:  cd undercroft ; powershell -ExecutionPolicy Bypass -File .\overnight.ps1
$Deadline = "10:00"

$Prompt = 'You are resuming the overnight build. Follow CLAUDE.md exactly. Run the Resume Protocol (section 1), then work through PROGRESS.md in strict priority order. Do not ask questions; decide, log decisions in DECISIONS.md, and keep going. Commit after every task. Do not stop while tasks remain.'

$end = [datetime]::ParseExact($Deadline, "HH:mm", $null)
if ($end -le (Get-Date)) { $end = $end.AddDays(1) }
New-Item -ItemType Directory -Force -Path logs | Out-Null
Write-Host "Running until $end"

while ((Get-Date) -lt $end -and -not (Test-Path STOP)) {
  $start = Get-Date
  $log = "logs\session-$((Get-Date).ToString('yyyyMMdd-HHmmss')).log"
  "=== session start $(Get-Date) ===" | Tee-Object -FilePath $log -Append

  claude -p $Prompt --dangerously-skip-permissions --max-turns 400 2>&1 | Tee-Object -FilePath $log -Append

  $elapsed = ((Get-Date) - $start).TotalSeconds
  $text = Get-Content $log -Raw
  if ($text -match '(?i)usage limit|rate limit|limit reached|resets at|try again' -or $elapsed -lt 120) {
    "Looks like a usage limit or a quick failure. Sleeping 15 min..." | Tee-Object -FilePath $log -Append
    Start-Sleep -Seconds 900
  } else {
    Start-Sleep -Seconds 20
  }
}
Write-Host "Overnight run finished at $(Get-Date)."
