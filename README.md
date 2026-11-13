# Heretto Publishing Scheduler

A web application for scheduling and automating Heretto CCMS publishing jobs. Create cron-based schedules that publish DITA maps — individually or by folder — across multiple scenarios, locales, and output formats. Includes authentication (password + optional Google and Microsoft SSO), multi-tenancy, automatic retry with exponential backoff, circuit breaking, job history, and optional bundle delivery to SFTP or S3.

---

## Prerequisites

- Python 3.11+
- Node.js 20+
- A Heretto CCMS account with API access and publishing permissions
- Network access to GitHub (the backend installs `hop-core` and the frontend installs `@heretto/hop-ui` from GitHub releases)

Optional: Docker & Docker Compose for the containerized path.

---

## Install

### Local development (recommended for getting started)

```bash
git clone https://github.com/Heretto/publishing-scheduler.git
cd publishing-scheduler
bash backend/scripts/setup.sh
```

`setup.sh` creates the Python virtualenv, installs dependencies, generates required secrets, runs database migrations, and seeds a first admin account. After it finishes, add your Heretto connection under **Credentials**.

### Docker

```bash
git clone https://github.com/Heretto/publishing-scheduler.git
cd publishing-scheduler
cp .env.example .env
```

Open `.env` and fill in at minimum:

```bash
# Generate with: openssl rand -hex 32
APP_SECRET_KEY=<generated>
JWT_SECRET_KEY=<generated>
ENCRYPTION_KEY=<generated>

# First admin account — created automatically on first startup
ADMIN_EMAIL=you@yourcompany.com
ADMIN_PASSWORD=YourStr0ng!Password
```

Then start the stack:

```bash
bash scripts/docker-up.sh
```

> **⚠️ Do not lose `ENCRYPTION_KEY`.** Stored credentials are encrypted with a key derived from it. Change it and existing encrypted rows can no longer be decrypted.

Services once running:

| | URL |
|---|---|
| Frontend | http://localhost:4200 |
| Backend API | http://localhost:3000 |
| Interactive API docs | http://localhost:3000/docs |
| Health check | http://localhost:3000/api/health |

---

## Usage

```bash
bash scripts/dev.sh
```

Starts backend and frontend, picks free ports (backend from 8000, frontend from 4200), and opens the browser. Press Ctrl+C to stop both. Interactive API docs are at `/docs`.

To run only the backend: `bash backend/scripts/start.sh`.

---

## Features

- **Flexible scheduling** — cron-based schedules with a visual builder or raw cron expressions
- **Locale-aware publishing** — select source and translated locales per schedule; each locale triggers a separate Heretto publish job
- **DITA map filtering** — browse your CCMS content repository and pick individual DITA maps or entire folders
- **Folder-based scheduling** — folder references resolve at run time, so maps added to a folder after the schedule was created are automatically included
- **Release publishing** — pin a specific named release (snapshot) of a map instead of always using the latest version
- **Multiple scenarios** — assign multiple publishing scenarios to a single schedule; each runs as an independent job
- **Multiple output formats** — choose multiple output types (PDF, HTML5, XHTML, etc.) per scenario
- **Bundle delivery** — deliver published bundles to an SFTP server or S3 bucket automatically after each run
- **Authentication & SSO** — username/password plus optional Google and Microsoft (Entra ID) sign-in
- **Multi-tenancy** — organizations, members, invitations, and per-org data isolation
- **Automatic retry** — exponential backoff for transient failures (network, timeouts, 5xx errors)
- **Circuit breaker** — auto-disables a schedule after consecutive failures to prevent resource waste
- **Job history** — full audit trail with per-publish-result detail including scenario, locale, document ID, and Heretto job ID
- **Manual triggers** — run a schedule immediately for testing without waiting for the next cron fire
- **Status exclusions** — block maps with specific Heretto statuses from being chosen or published

---

## Configuration

### Two `.env` files, by design

| File | Used by | Created by |
|---|---|---|
| `backend/.env` | local development (`dev.sh`, `start.sh`, `uvicorn`) | `backend/scripts/setup.sh` |
| `.env` (repo root) | `docker compose` | you, from `.env.example` |

Each has a matching template documenting every supported variable.

### Required settings

| Variable | Notes |
|---|---|
| `APP_SECRET_KEY` | Generate with `openssl rand -hex 32` |
| `JWT_SECRET_KEY` | Separate value from the above |
| `ENCRYPTION_KEY` | Minimum 16 characters. Encrypts stored credentials |
| `DATABASE_URL` | SQLAlchemy URL. Compose sets this automatically; locally `sqlite:///./data/scheduler.db` |

### Heretto

The Heretto account is each organization's **Heretto connection**, configured in the app under **Credentials** (not an environment variable). Add a Heretto credential (server URL, username, API token) and use **Test** to verify it.

```bash
HERETTO_ORG=acme          # CCMS content-path org; defaults to the first label of the connection's host
HERETTO_BRANCH=master
HERETTO_REPOSITORY=content
```

### Server & security

```bash
APP_ENV=production
APP_DEBUG=false
CORS_ORIGINS=https://scheduler.yourcompany.com
FRONTEND_BASE_URL=https://scheduler.yourcompany.com
COOKIE_SECURE=true
```

### Scheduler, jobs, and retry

```bash
SCHEDULER_MAX_CONSECUTIVE_FAILURES=5
JOB_RETENTION_DAYS=90
JOB_TIMEOUT_SECONDS=1800

RETRY_MAX_ATTEMPTS=3
RETRY_INITIAL_DELAY_MS=1000
RETRY_MAX_DELAY_MS=30000
RETRY_BACKOFF_MULTIPLIER=2
```

### Tokens and email

```bash
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=15
JWT_REFRESH_TOKEN_EXPIRE_DAYS=7
PASSWORD_RESET_TOKEN_EXPIRE_MINUTES=30

SMTP_HOST=
SMTP_PORT=587
SMTP_USERNAME=
SMTP_PASSWORD=
SMTP_FROM_EMAIL=
SMTP_FROM_NAME=Publishing Scheduler
SMTP_USE_TLS=true

SINGLE_ORG_MODE=false
```

### SSO / Single Sign-On

**Google** and **Microsoft (Azure AD / Entra ID)** are supported alongside password login. The login page shows only configured providers.

#### Google

```bash
GOOGLE_OAUTH_CLIENT_ID=123456789-xxxxxxxxxxxx.apps.googleusercontent.com
```

Create a Web application OAuth 2.0 Client ID in [Google Cloud Console](https://console.cloud.google.com/apis/credentials) and add your app's URL to **Authorized JavaScript origins**. No client secret is needed.

#### Microsoft

```bash
MICROSOFT_OAUTH_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
MICROSOFT_OAUTH_CLIENT_SECRET=your-client-secret-value
MICROSOFT_OAUTH_TENANT_ID=common
```

Set the redirect URI to `https://your-domain/api/v1/auth/sso/microsoft/callback` in [Azure Portal → App registrations](https://portal.azure.com/#blade/Microsoft_AAD_IAM/ActiveDirectoryMenuBlade/RegisteredApps).

#### Additional SSO options

| Variable | Default | Description |
|---|---|---|
| `SSO_ONLY` | `false` | Disables username/password login |
| `ALLOWED_EMAIL_DOMAINS` | _(none)_ | Comma-separated domains for SSO auto-registration |
| `OAUTH_REDIRECT_BASE_URL` | _(none)_ | Override for proxied deployments |

---

## Usage Guide

### Creating a schedule

1. Navigate to **Schedules** and click **New Schedule**
2. Fill in name, description, and cron expression (use the visual builder or type directly)
3. Select a deployment, one or more scenarios, output formats, and locales
4. Under **Documents**, browse and select DITA maps, folders, or a mix of both
   - Folder references are dynamic — maps added after the schedule was saved are picked up on the next run
   - For any selected map, pin a specific named release instead of always using latest
5. Save — the schedule starts automatically

> **How jobs multiply:** 2 scenarios × 2 output formats × 3 locales × 1 document = 12 Heretto publish jobs per run. Each is tracked individually in Job History.

### Cron expression reference

```
┌───────────── minute (0–59)
│ ┌───────────── hour (0–23)
│ │ ┌───────────── day of month (1–31)
│ │ │ ┌───────────── month (1–12)
│ │ │ │ ┌───────────── day of week (0–6, Sunday = 0)
* * * * *
```

| Expression | Description |
|---|---|
| `0 2 * * *` | Daily at 2:00 AM |
| `0 */4 * * *` | Every 4 hours |
| `0 9 * * 1-5` | Weekdays at 9:00 AM |
| `0 0 1 * *` | First day of month at midnight |

---

## Use Cases

### Automated documentation publishing

Publish updated documentation to your website on a daily schedule. Keeps content current without manual publishing work.

### Multi-environment deployments

Publish to staging hourly and production daily using separate schedules pointed at different deployment scenarios.

### Release publishing workflow

Disable the schedule and use manual triggers only. Tag the release, verify content, then trigger. Job history provides the audit trail.

### Batch content updates

Schedule large content batches during off-hours with retry and circuit breaking to absorb transient failures cleanly.

### Compliance & audit

Job history retains request and response payloads, trigger type, and timing for `JOB_RETENTION_DAYS` (default 90). Per-organization isolation supports audit review in regulated environments.

---

## Health & Observability

### Health check

**`GET /api/health`** — no authentication required.

```json
{
  "status": "ok",
  "checks": {
    "database": "ok",
    "scheduler": { "activeJobs": 0 }
  }
}
```

`status` is `ok` when the database probe succeeds and `degraded` otherwise; the endpoint returns HTTP 200 either way.

### Logs

The backend logs structured JSON to stdout. Set `APP_DEBUG=true` for verbose output plus SQLAlchemy statement echo. Every response carries an `X-Request-ID` header for log correlation across a proxy.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     User Browser                        │
└────────────────────┬────────────────────────────────────┘
                     │ HTTP/HTTPS
                     ▼
┌─────────────────────────────────────────────────────────┐
│         Angular Frontend (nginx, port 4200)             │
│   Dashboard │ Schedules │ Jobs │ Settings │ Account     │
│   Shared UI and theme from @heretto/hop-ui              │
└────────────────────┬────────────────────────────────────┘
                     │ REST (/api/v1), proxied by nginx
                     ▼
┌─────────────────────────────────────────────────────────┐
│            FastAPI Backend (port 3000)                  │
│  ┌───────────────────────────────────────────────────┐  │
│  │ hop-core: auth, SSO, orgs, invitations,           │  │
│  │           credentials, rate limiting              │  │
│  └───────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────┐  │
│  │ APScheduler        │  Job Executor (retry,        │  │
│  │ (cron triggers)    │  circuit breaker)            │  │
│  └───────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────┐  │
│  │ SQLAlchemy + Alembic → SQLite                     │  │
│  │ Delivery poller (SFTP/S3) │ Status cache          │  │
│  └───────────────────────────────────────────────────┘  │
└────────────────────┬────────────────────────────────────┘
                     │ HTTPS
                     ▼
┌─────────────────────────────────────────────────────────┐
│              Heretto CCMS API                           │
│  Deployments │ Scenarios │ Releases │ Publishing Jobs   │
└─────────────────────────────────────────────────────────┘
```

**Backend:** Python 3.11+, FastAPI, Uvicorn, hop-core, SQLite via SQLAlchemy 2.x, Alembic, APScheduler, httpx, Pydantic v2, SlowAPI.

**Frontend:** Angular 22, Angular Material, `@heretto/hop-ui`.

### Database schema (application tables)

**`schedules`** — cron expression, scenario/deployment/document IDs, folder IDs, document releases, locales, enabled state, circuit breaker counter.

**`job_history`** — status, trigger type, start/end times, Heretto job ID, request/response payloads, error.

**`delivery_targets`** — SFTP or S3 delivery config per schedule.

**`status_value_exclusions`** — per-org blocked Heretto status values.

hop-core owns `users`, `organizations`, `organization_members`, `organization_invitations`, and `credentials` in the same database.

---

## Development

### Project structure

```
publishing-scheduler/
├── backend/
│   ├── main.py              # app factory, lifespan, middleware, /api/health
│   ├── settings.py
│   ├── models.py
│   ├── routes/              # schedules, jobs, heretto, dashboard, settings
│   ├── services/            # scheduler, job_executor, delivery_poller, status_cache
│   ├── clients/             # heretto, heretto_ccms
│   ├── migrations/versions/
│   ├── scripts/             # setup.sh, start.sh, seed.py
│   └── tests/
├── frontend/
│   ├── src/app/
│   │   ├── core/            # services, guards, interceptors
│   │   ├── features/        # dashboard, schedules, jobs, settings
│   │   └── shared/
│   └── nginx.conf
├── scripts/dev.sh
├── docker-compose.yml
└── .env.example
```

### Running tests

```bash
# Backend
cd backend && pytest

# Frontend
cd frontend && npm test
```

### Database migrations

Migrations in `backend/migrations/versions/` are applied automatically at startup. To apply manually:

```bash
cd backend && .venv/bin/alembic upgrade head
```

Revision files are numbered manually (`001_`, `002_`, …). Autogenerate is intentionally restricted — `Base.metadata` includes hop-core tables, which would generate spurious operations against schema this app does not own.

---

## Deployment

### Docker Compose

For production, set:

```bash
APP_ENV=production
APP_DEBUG=false
COOKIE_SECURE=true
CORS_ORIGINS=https://scheduler.yourcompany.com
FRONTEND_BASE_URL=https://scheduler.yourcompany.com
```

Front with a TLS-terminating reverse proxy. Run a **single** backend instance — APScheduler has no distributed lock and multiple replicas would each fire the same schedule.

### Without Docker

Run Uvicorn under a process supervisor (e.g. systemd). Build the frontend with `npm run build` and serve `dist/frontend/browser` from nginx, proxying `/api` to the backend. `frontend/nginx.conf` is a working reference.

### Security checklist

- [ ] `APP_ENV=production` and `APP_DEBUG=false`
- [ ] `CORS_ORIGINS` restricted to your domain
- [ ] `COOKIE_SECURE=true` behind HTTPS
- [ ] Secrets injected from a secret manager, not committed
- [ ] `ENCRYPTION_KEY` backed up somewhere recoverable
- [ ] TLS terminated in front of the app
- [ ] Database backups scheduled and restore tested

### Backup & restore

```bash
# Back up
docker compose cp backend:/app/data/scheduler.db ./scheduler-backup.db

# Restore
docker compose stop backend
docker compose cp ./scheduler-backup.db backend:/app/data/scheduler.db
docker compose start backend
```

Back up `ENCRYPTION_KEY` alongside the database file.

---

## API Reference

All endpoints are under `/api/v1` and require authentication. Interactive docs are at `/docs` (Swagger UI) and `/redoc`. The only unauthenticated endpoint is `GET /api/health`.

### Schedules

| Method | Path |
|---|---|
| GET | `/api/v1/schedules/` |
| POST | `/api/v1/schedules/` |
| GET | `/api/v1/schedules/{schedule_id}` |
| PUT | `/api/v1/schedules/{schedule_id}` |
| DELETE | `/api/v1/schedules/{schedule_id}` |
| PATCH | `/api/v1/schedules/{schedule_id}/toggle` |
| POST | `/api/v1/schedules/{schedule_id}/trigger` |

### Jobs

| Method | Path |
|---|---|
| GET | `/api/v1/jobs/` |
| GET | `/api/v1/jobs/{job_id}` |

### Dashboard, settings, and Heretto proxy

See `/docs` for the full list — it is generated from the code and always current.

---

## Troubleshooting

**Can't log in — no account exists**

```bash
docker compose exec backend python scripts/seed.py
```

**`docker compose up` fails: required variable is missing**

Add the three required secrets (`APP_SECRET_KEY`, `JWT_SECRET_KEY`, `ENCRYPTION_KEY`) to the root `.env`.

**Code changes have no effect in Docker**

```bash
bash scripts/docker-up.sh --build
```

**`pip install` fails on `hop-core`**

Requires `git` and network access to GitHub. Confirm both, then retry.

**`npm ci` fails on `@heretto/hop-ui`**

The package installs from a hop-core GitHub release asset. Confirm the URL in `frontend/package.json` matches an existing `.tgz` release asset (not the auto-generated source archive).

**Pydantic validation error at startup**

Required settings are missing. Run `bash backend/scripts/setup.sh` locally, or check the root `.env` under Docker.

**Schedule auto-disabled**

The circuit breaker tripped after `SCHEDULER_MAX_CONSECUTIVE_FAILURES` consecutive failures. Fix the underlying cause in the Jobs view, then re-enable the schedule.

**CORS errors in the browser**

Set `CORS_ORIGINS` to the exact origin serving the frontend, including scheme and port.

**Password reset emails never arrive**

SMTP is not configured. Set `SMTP_HOST` and `SMTP_FROM_EMAIL` at minimum.

---

## Contributing

1. Create a feature branch: `git checkout -b feature/your-feature`
2. Make changes and write tests: `cd backend && pytest`, `cd frontend && npm test`
3. Add an Alembic migration for any schema change (written by hand — see the autogenerate caveat above)
4. Open a pull request

---

## License

Apache License 2.0 — see [LICENSE](LICENSE).
