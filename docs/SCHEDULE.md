# Schedule

Every scheduled GitHub Actions job in this repo. Times are Central (America/Chicago): each
`schedule:` entry carries `timezone: America/Chicago`, which GitHub Actions honours, so the clock
change in March and November no longer moves a job. Rebalanced 1 Nov 2026 (owner-approved weekly
schedule); see the notes below for what moved.

| Job | Workflow | When | Cron |
|---|---|---|---|
| CI - Build and Validate | `ci.yml` | every day 07:15 CT | `15 7 * * *` |
| Credential Check - Secrets and Public Key Readiness | `credential-check.yml` | Fri 07:45 CT | `45 7 * * 5` |
| Entity Backlink Watch | `entity-backlink-watch.yml` | Thu 08:00 CT | `0 8 * * 4` |
| Query Intelligence - GSC Gemini and $0 Signals | `query-intelligence.yml` | every day 02:10, 14:10 CT | `10 2,14 * * *` |
| Search Loop (shared engine `seq23/search-loop@v1`) | `search-loop.yml` | every day 03:35 CT, plus the engine's fixed 0–39 min stagger | `35 3 * * *` |
| Search Repair and Retest - Diagnose, Bounded Repair, Delayed Retest | `search-repair-retest.yml` | every day 05:40 CT | `40 5 * * *` |
| Bounded Self-Healing | `self-heal.yml` | Wed 10:30 CT | `30 10 * * 3` |

## Weekly windows

- **Saturday 04:00–08:00 CT is the weekly-upkeep window for every Spry Labs side business**
  (owner ruling, 1 Nov 2026): weekly maintenance, refresh and metrics jobs run there, staggered
  at least 15 minutes apart, never two in the same slot. Publishing, link checks and
  self-healing are not upkeep and keep their own days.

## Moved on 1 Nov 2026
- Entity Backlink Watch: Monday → Thursday 08:00 CT.
- Credential Check: Monday → Friday 07:45 CT.
- Bounded Self-Healing joins the Wednesday 10:00–10:30 CT self-healing sweep (p-n-p 10:00, Dream Wedding 10:10, backlink network 10:20, WPP 10:30).

## Moved on 1 Nov 2026 (search loop)
- Programmatic Content Release (`programmatic-release.yml`) retired; the Search Loop takes its 03:35 CT slot, once a day.
