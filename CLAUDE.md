# Publishing Scheduler — agent notes

Built on [hop-core](https://github.com/Heretto/hop-core), pinned at **v0.1.17**
(`backend/requirements.txt` and the `@heretto/hop-ui` asset URL in
`frontend/package.json` — always bump them together).

**Node ^22.22.3 || ^24.15.0 || >=26 is required** — Angular 22's engine constraint. A plain
major-version check is not enough: Node 22.22.1 satisfies "Node 22" and still fails the build.

## Before changing anything

Run `hop-doctor` from the repo root (installed with hop-core into the backend
venv: `backend/.venv/bin/hop-doctor`). It audits this project's hop-core
integration and exits non-zero on real problems.

## hop-core references — a different repository, not loaded here

- Integration rules, failure modes, upgrade steps: hop-core `AGENTS.md`
- Design system, components, tokens, app skeleton: hop-core `DESIGN-SYSTEM.md`

Read those instead of inferring from this project's code. Do not copy them here.

## What this app is

A cron-based publishing scheduler for Heretto CCMS. The domain model:

| Thing | Owned by | Notes |
|---|---|---|
| Heretto connection (server URL, credentials) | hop-core credential of type `heretto` | registered via `register_builtin_types("heretto")` |
| **Schedule** (cron, maps/folders, scenarios, locales, delivery) | this app, `models.Schedule` | one per publishing job definition |
| **JobHistory** (audit trail, per-publish results) | this app, `models.JobHistory` | many per schedule; pruned after `JOB_RETENTION_DAYS` |
| **DeliveryTarget** (optional SFTP/S3 bundle delivery) | this app, `models.DeliveryTarget` | one-to-one with a schedule |
| StatusValueExclusion (blocked Heretto statuses) | this app, `models.StatusValueExclusion` | set under Settings › Status Value Exclusions |

Backend entry points:
- `backend/services/job_executor.py` — runs all scenario × locale combos for a schedule, handles retries, checks status exclusions
- `backend/services/scheduler.py` — APScheduler wrapper; loads schedules at startup
- `backend/services/delivery_poller.py` — background task polling Heretto Deploy for bundle delivery
- `backend/services/status_cache.py` — in-memory document status cache (populated at startup, refreshed hourly)
- `backend/services/status_exclusions.py` — decides which maps are blocked from publishing based on their Heretto status

## What is specific to this project

**Start the stack locally**: `bash scripts/dev.sh` (installs on first run, picks free ports,
writes a temporary Angular proxy config, starts uvicorn + ng serve).
No Docker required for local dev — uses SQLite by default.

**Settings** live in `backend/.env` (local) and the repo-root `.env` (Docker Compose).
Template: `backend/.env.example`. Key non-defaults: `SINGLE_ORG_MODE=true`,
`SINGLE_ORG_SLUG=publishing-scheduler`.

**Migrations run themselves at startup** — `main.py` calls `_run_migrations()` inside the
lifespan wrapper (after hop-core's `init_db()`). No separate migrate service. Alembic
revision files are numbered (`001_`, `002_`, …) and live in `backend/migrations/versions/`.
Every schema change that adds a column needs an Alembic migration file — `create_all()` on
startup only creates *missing tables*, never alters existing ones.

**Status cache** (`services/status_cache.py`): all document statuses are loaded from every
organization's Heretto connection at startup and refreshed hourly. The cache also supports
on-demand fallback for documents that miss the cache. `MAX_CACHE_SIZE` is 500,000 documents.
The status exclusion feature (`services/status_exclusions.py`) uses the cache to block maps
whose status appears in the organization's excluded set.

**Folder expansion happens at run time**, not when the schedule is saved. `folder_ids`
(JSON array on `Schedule`) are resolved to their contained map IDs each time a job fires —
so maps added to the folder after the schedule was created are automatically picked up.

**Circuit breaker**: `SCHEDULER_MAX_CONSECUTIVE_FAILURES` (default 5) consecutive job
failures auto-disable a schedule (`enabled = False`). Re-enabling it in the UI resets the
counter.

**APScheduler** (`services/scheduler.py`) runs in-process. Each schedule's cron expression
fires `_run_scheduled_job(schedule_id)` in `main.py`. Manual triggers call the same executor.
There is no distributed lock — run a single replica only.

**Delivery poller** (`services/delivery_poller.py`) polls Heretto Deploy every
`DELIVERY_POLL_INTERVAL_SECONDS` for bundle delivery jobs, up to
`DELIVERY_MAX_POLL_ATTEMPTS` before giving up.

**Angular 22 bundle budget is 2 MB**, not Angular's default 1 MB — the hop-ui flat bundle
(eager `hopAuthInterceptor` import) exceeds 1 MB, and `ng build` fails at the default. Do
not lower it back without first confirming the bundle stays under 1 MB.

**`npm audit` reports ~11 high findings. Do NOT run `npm audit fix --force`** — it
downgrades karma, breaks the test setup, and fixes nothing (all are devDependencies that
never reach the shipped bundle). The real fix is the two Angular 22 optional migrations,
deliberately deferred.

**SSO is configuration-only** — no code is needed. Set `GOOGLE_OAUTH_CLIENT_ID` and/or
`MICROSOFT_OAUTH_CLIENT_ID` / `MICROSOFT_OAUTH_CLIENT_SECRET` / `MICROSOFT_OAUTH_TENANT_ID`
in `.env`. hop-core's SSO routes and hop-ui's login component handle everything automatically.

**Accounts are entirely hop-core's.** This app adds no sign-up or sign-in logic.
`docker-compose.yml` passes hop-core's SSO settings through as env vars; unset ones arrive
as empty strings, which hop-core treats as unset.

## Upgrading hop-core

Resolve the current release (hop-core `AGENTS.md`, Step 0 — do not copy a version out of
any document), bump the Python pin in `backend/requirements.txt` and the `@heretto/hop-ui`
asset URL in `frontend/package.json` **together**, regenerate the npm lock, **recreate
`backend/.venv`** (pip will not swap a git URL in place on an existing install), rebuild,
then re-run `hop-doctor`.
