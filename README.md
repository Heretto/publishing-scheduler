# 📅 Heretto Publishing Scheduler

> A web application for scheduling and automating publishing jobs in Heretto CCMS, with authentication, multi-tenancy, retry handling, and a full audit trail.

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Python](https://img.shields.io/badge/Python-3.11+-blue)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-informational)](https://fastapi.tiangolo.com/)
[![Angular](https://img.shields.io/badge/Angular-19-red)](https://angular.io/)

## 🌟 Features

- **🕐 Flexible Scheduling** - Create cron-based schedules with visual builder or advanced cron expressions
- **🌍 Locale-Aware Publishing** - Select source and/or translated locales per schedule; each locale triggers a separate Heretto publish job automatically
- **🗺️ DITA Map Filtering** - Document picker filters to DITA maps only, with full folder browsing of your CCMS content repository
- **📁 Folder-Based Scheduling** - Select an entire folder to publish all DITA maps it contains; folder references are resolved dynamically at run time, so maps added to the folder after the schedule was created are automatically included in future runs
- **🏷️ Release Publishing** - Pin a specific named release (snapshot) of a DITA map for scheduled publishing instead of always using the latest version
- **🎭 Multiple Scenarios** - Assign multiple publishing scenarios to a single schedule; each runs as an independent publish job
- **📄 Multiple Output Formats** - Choose multiple output types (PDF, HTML5, XHTML, etc.) per scenario in a single schedule
- **🔐 Authentication & SSO** - Username/password plus optional Google and Microsoft (Entra ID) sign-in
- **🏢 Multi-Tenancy** - Organizations, members, invitations, and per-org data isolation
- **🔄 Automatic Retry** - Exponential backoff for transient failures (network, timeouts, 5xx errors)
- **🛡️ Circuit Breaker** - Auto-disable schedules after consecutive failures to prevent resource waste
- **📈 Job History** - Complete audit trail with per-publish-result detail, including scenario, locale, document ID, and Heretto job ID
- **🎯 Manual Triggers** - Override schedules and run jobs on-demand
- **🚦 Graceful Shutdown** - Waits for in-flight jobs during server restarts

## 📋 Table of Contents

- [Prerequisites](#-prerequisites)
- [Quick Start](#-quick-start)
- [Configuration](#-configuration)
  - [SSO / Single Sign-On](#-sso--single-sign-on)
- [Usage Guide](#-usage-guide)
- [Use Cases & Recommendations](#-use-cases--recommendations)
- [Health & Observability](#-health--observability)
- [Architecture](#-architecture)
- [Development](#-development)
- [Deployment](#-deployment)
- [API Reference](#-api-reference)
- [Troubleshooting](#-troubleshooting)
- [Contributing](#-contributing)

## 🔧 Prerequisites

### Required

- **Python 3.11+** — the backend ([download](https://www.python.org/downloads/))
- **Node.js 20+** — to build or serve the Angular frontend ([download](https://nodejs.org/))
- **Heretto CCMS account** with API access, and credentials with publishing permissions
- **Network access to GitHub** — the backend installs `hop-core` and the frontend installs `@heretto/hop-ui` from GitHub releases

### Optional

- **Docker & Docker Compose** — for the containerized path ([install](https://docs.docker.com/get-docker/))
- **SMTP server** — required only for password reset and invitation emails

### System Requirements

- **Memory:** 512 MB minimum, 1 GB+ recommended
- **Disk:** ~200 MB for the application, plus space for the SQLite database (grows with job history)
- **Network:** outbound HTTPS to your Heretto CCMS instance

## 🚀 Quick Start

### Option 1: Local development (recommended for getting started)

Two scripts do the whole job. The setup script creates a virtualenv, installs dependencies, **generates the required secrets for you**, prompts for your Heretto credentials, and seeds the database:

```bash
git clone https://github.com/Heretto/publishing-scheduler.git
cd publishing-scheduler

bash backend/scripts/setup.sh   # one time: venv, deps, secrets, backend/.env, seed
bash scripts/dev.sh             # starts backend + frontend, opens the browser
```

`dev.sh` picks free ports (backend from 8000, frontend from 4200), wires an Angular proxy so the frontend reaches the API, and tails both servers until you press Ctrl+C. It prints the URLs it chose, including interactive API docs at `/docs`.

To run only the backend: `bash backend/scripts/start.sh`.

### Option 2: Docker

```bash
git clone https://github.com/Heretto/publishing-scheduler.git
cd publishing-scheduler

bash scripts/docker-up.sh
```

That script creates `.env` from `.env.example` if it is missing, generates any of the three required secrets that are absent, and then starts the stack. It **never overwrites a value that is already set**, so it is safe to re-run.

Add your Heretto credentials to `.env` and re-run it, or the app will start but Heretto API calls will fail — the script warns when that is the case.

Arguments are passed straight through to `docker compose up`, so `bash scripts/docker-up.sh --build` works.

<details>
<summary>Doing it manually instead</summary>

```bash
cp .env.example .env
openssl rand -hex 32   # once per variable, into .env
```

```bash
APP_SECRET_KEY=<generated>
JWT_SECRET_KEY=<generated>
ENCRYPTION_KEY=<generated>
```

```bash
docker compose up -d
```

</details>

Services:

| | URL |
|---|---|
| Frontend | http://localhost:4200 |
| Backend API | http://localhost:3000 |
| Interactive API docs | http://localhost:3000/docs |
| Health check | http://localhost:3000/api/health |

Compose refuses to start if any of the three secrets is missing, naming the one it needs. Useful commands:

```bash
docker compose logs -f backend
docker compose down          # stop
docker compose down -v       # stop and delete the database volume
docker compose up -d --build # rebuild after a git pull
```

> **⚠️ Do not lose `ENCRYPTION_KEY`.** Stored Heretto credentials are encrypted with a key derived from it. Change it and existing encrypted rows can no longer be decrypted.

## ⚙️ Configuration

### Two `.env` files, by design

This trips people up, so it is worth stating plainly:

| File | Used by | Created by |
|---|---|---|
| `backend/.env` | local development (`dev.sh`, `start.sh`, `uvicorn`) | `backend/scripts/setup.sh` |
| `.env` (repo root) | `docker compose` | you, from `.env.example` |

The backend reads `.env` relative to its working directory, which is `backend/` when run locally. Docker Compose reads the root `.env` and passes the values into the container. Keeping both in sync matters only if you use both paths.

Each has a matching template: `.env.example` at the repo root documents every supported variable for the Docker path, and `backend/.env.example` is the local-development equivalent.

### Required settings

The application will not start without these. Compose fails fast with a readable message; run locally and you get a Pydantic validation error.

| Variable | Notes |
|---|---|
| `APP_SECRET_KEY` | Generate with `openssl rand -hex 32` |
| `JWT_SECRET_KEY` | Separate value from the above |
| `ENCRYPTION_KEY` | Minimum 16 characters. Encrypts stored credentials — see the warning above |
| `DATABASE_URL` | SQLAlchemy URL. Compose sets this to the container volume for you; locally `sqlite:///./data/scheduler.db` |

### Heretto

```bash
HERETTO_API_BASE_URL=https://your-instance.heretto.com/ezdnxtgen/api/v2
HERETTO_USERNAME=your-username
HERETTO_PASSWORD=your-password
HERETTO_ORG=your-org-slug
HERETTO_BRANCH=master
HERETTO_REPOSITORY=content
```

The CCMS and search base URLs are **derived** from `HERETTO_API_BASE_URL` and cannot be set independently.

### Server & security

```bash
APP_ENV=production            # or 'development'
APP_DEBUG=false               # true also enables SQL echo and verbose logs
CORS_ORIGINS=https://scheduler.yourcompany.com   # comma-separated
FRONTEND_BASE_URL=https://scheduler.yourcompany.com  # used in outbound email links
COOKIE_SECURE=true            # enable when serving over HTTPS
COOKIE_DOMAIN=
```

### Scheduler, jobs, and retry

```bash
SCHEDULER_MAX_CONSECUTIVE_FAILURES=5   # auto-disable a schedule after N failures
JOB_RETENTION_DAYS=90                  # job history older than this is pruned daily
JOB_TIMEOUT_SECONDS=1800

RETRY_MAX_ATTEMPTS=3
RETRY_INITIAL_DELAY_MS=1000
RETRY_MAX_DELAY_MS=30000
RETRY_BACKOFF_MULTIPLIER=2
```

### Tokens, email, and tenancy

```bash
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=15
JWT_REFRESH_TOKEN_EXPIRE_DAYS=7
PASSWORD_RESET_TOKEN_EXPIRE_MINUTES=30

SMTP_HOST=                    # password reset and invitations need SMTP
SMTP_PORT=587
SMTP_USERNAME=
SMTP_PASSWORD=
SMTP_FROM_EMAIL=
SMTP_FROM_NAME=Publishing Scheduler
SMTP_USE_TLS=true

SINGLE_ORG_MODE=false         # setup.sh sets this true for local development
SINGLE_ORG_SLUG=
```

`REDIS_URL` is accepted but unused; it is reserved for future work and the rate limiter currently stores state in memory.

### 🔐 SSO / Single Sign-On

**Google** and **Microsoft (Azure AD / Entra ID)** are supported. Enabling either is optional, and username/password login remains available alongside SSO unless you set `SSO_ONLY=true`. The login page shows only the providers that are configured.

#### Google

You need a Google Cloud project with an OAuth consent screen and a Web client ID.

1. Go to [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
2. Create an **OAuth 2.0 Client ID** (type: Web application)
3. Add your app's URL to **Authorized JavaScript origins**
4. Set the client ID:

```bash
GOOGLE_OAUTH_CLIENT_ID=123456789-xxxxxxxxxxxx.apps.googleusercontent.com
```

No client secret is needed — the backend verifies a client-side token against Google's public keys.

#### Microsoft (Azure AD / Entra ID)

1. Go to [Azure Portal → App registrations](https://portal.azure.com/#blade/Microsoft_AAD_IAM/ActiveDirectoryMenuBlade/RegisteredApps) → **New registration**
2. Set the **Redirect URI** (type: Web) to `https://your-domain/api/v1/auth/sso/microsoft/callback`
3. Under **Certificates & secrets**, create a client secret and copy it immediately
4. Set:

```bash
MICROSOFT_OAUTH_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
MICROSOFT_OAUTH_CLIENT_SECRET=your-client-secret-value
MICROSOFT_OAUTH_TENANT_ID=common   # 'common' allows any Microsoft account
```

#### Additional options

| Variable | Default | Description |
|---|---|---|
| `SSO_ONLY` | `false` | `true` disables username/password login |
| `ALLOWED_EMAIL_DOMAINS` | _(none)_ | Comma-separated domains allowed to auto-register via SSO. Existing users are unaffected |
| `OAUTH_REDIRECT_BASE_URL` | _(none)_ | Override the base URL used to build OAuth redirects, for proxied deployments |

#### How it works

- On first SSO login an account is created and enrolled in the organization.
- If an account already exists with the same email, the provider is linked to it.
- Restart the backend after changing SSO variables.

## 📖 Usage Guide

### Creating Your First Schedule

1. **Navigate to Schedules** - Click "Schedules" in the sidebar
2. **Click "New Schedule"**
3. **Fill in the form:**
   - **Name:** "Daily Documentation Build"
   - **Description:** "Builds all product documentation daily at 2 AM"
   - **Schedule:** Use the cron builder or enter `0 2 * * *`
   - **Deployment:** Select your target deployment
   - **Scenarios:** Choose one or more publishing scenarios — each selected scenario triggers a separate publish job per run
   - **Output Formats:** For each scenario, select one or more output types (PDF, HTML5, XHTML, DITA, Markdown); each output type runs as an independent job
   - **Locales:** Select "Source" to publish the source language and/or any translated locales present in your CCMS — each locale triggers its own publish job
   - **Documents:** Browse your CCMS content repository and select individual DITA maps, entire folders, or a mix of both
     - Check a **folder's checkbox** to include all DITA maps currently in that folder; a live preview of which maps are included appears beneath the folder chip in the selection summary
     - Folder references are **dynamic** — maps added to the folder after the schedule was saved are automatically picked up on the next run
     - For any selected DITA map, click **"Latest ▾"** in the selection summary to pin a specific named release (snapshot) instead of publishing the latest version
4. **Save** - The schedule will start automatically

> **How jobs multiply:** A schedule with 2 scenarios × 2 output formats × 3 locales × 1 document = 12 Heretto publish jobs per run. Each is tracked individually in the Job History detail view.

### Managing Schedules

- **Enable/Disable:** Toggle schedules without deleting them
- **Edit:** Update any schedule parameter at any time
- **Manual Trigger:** Run a schedule immediately for testing
- **Delete:** Permanently remove a schedule (job history is preserved)

### Monitoring Job Execution

1. **Go to Jobs** - View all job executions
2. **Filter:** By schedule, status, or date range
3. **View Details:** Click any job to see:
   - Request payload sent to Heretto
   - Response from Heretto API
   - Error messages (if failed)
   - Execution duration
   - Trigger type (scheduled vs manual)

### Understanding Cron Expressions

The scheduler uses standard cron syntax:

```
┌───────────── minute (0 - 59)
│ ┌───────────── hour (0 - 23)
│ │ ┌───────────── day of month (1 - 31)
│ │ │ ┌───────────── month (1 - 12)
│ │ │ │ ┌───────────── day of week (0 - 6, Sunday = 0)
│ │ │ │ │
* * * * *
```

**Common Examples:**

| Expression | Description |
|------------|-------------|
| `0 2 * * *` | Daily at 2:00 AM |
| `0 */4 * * *` | Every 4 hours |
| `0 9 * * 1-5` | Weekdays at 9:00 AM |
| `0 0 1 * *` | First day of month at midnight |
| `*/15 * * * *` | Every 15 minutes |

**Use the visual builder** for common patterns or **advanced mode** for complex schedules.

## 💡 Use Cases & Recommendations

### 1. **Automated Documentation Publishing**

**Use Case:** Publish updated documentation to your website daily.

```
Schedule: 0 2 * * * (2 AM daily)
Scenario: "Website Publishing"
Documents: All product documentation
Branch: master
```

Keeps documentation current, removes manual publishing work, and runs on a predictable cadence.

### 2. **Multi-Environment Deployments**

**Use Case:** Publish to staging hourly, production daily.

```
Staging:     0 * * * *   → "Staging Environment"
Production:  0 3 * * *   → "Production Environment"
```

Staging stays synchronized with content updates while production deploys at low-traffic times.

### 3. **Release Publishing Workflow**

**Use Case:** Publish release notes when new versions are tagged.

```
Schedule: disabled — manual trigger only
Scenario: "Release Notes Publishing"
```

Tag the release, verify, then trigger manually. Job history provides the audit trail.

### 4. **Batch Content Updates**

**Use Case:** Publish large content batches during off-hours.

```
Schedule: 0 1 * * 6 (Saturday 1 AM)
Documents: [100+ documents]
Retry Attempts: 5
```

Minimizes business-hours impact; retry logic absorbs transient failures and the circuit breaker prevents runaway retries.

### 5. **Compliance & Audit Requirements**

Job history retains request and response payloads, trigger type, and timing for `JOB_RETENTION_DAYS` (default 90). Combined with per-organization isolation, this supports audit review in regulated environments.

### Best Practices

✅ Test new schedules with a manual trigger first
✅ Use descriptive names and fill in the description field
✅ Review job history for failure patterns
✅ Validate on staging before production
✅ Back up the SQLite database (see [Backup & Restore](#backup--restore))

⚠️ Avoid:
- Scheduling many concurrent jobs
- Intervals under 5 minutes without a specific reason
- Publishing during peak traffic hours

## 📊 Health & Observability

### Health check

**`GET /api/health`** — note this sits *outside* the `/api/v1` prefix and requires no authentication.

```json
{
  "status": "ok",
  "timestamp": "2026-08-21T16:01:03.904112+00:00",
  "checks": {
    "database": "ok",
    "scheduler": { "activeJobs": 0 }
  }
}
```

`status` is `ok` when the database probe succeeds and `degraded` otherwise; the endpoint returns HTTP 200 either way, so alerting should inspect the body rather than the status code. The container `HEALTHCHECK` uses this endpoint, and Compose waits for the backend to report healthy before starting the frontend.

Suitable for load balancer checks and Kubernetes liveness/readiness probes.

### Logs

The backend logs structured JSON to stdout:

```bash
docker compose logs -f backend
```

Set `APP_DEBUG=true` for verbose logging plus SQLAlchemy statement echo. Every response carries an `X-Request-ID` header, echoing the inbound value when present, which is useful for correlating logs across a proxy.

### Other built-in protections

- **Rate limiting** via SlowAPI, with in-memory storage
- **Security headers** on every response: CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and HSTS when the request is HTTPS

> **No Prometheus metrics.** Earlier versions of this document described a `/metrics` endpoint and named counters and histograms. Those do not exist in the current backend. Use `/api/health` and the logs, or open an issue if metrics are needed.

## 🏗️ Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────┐
│                     User Browser                        │
└────────────────────┬────────────────────────────────────┘
                     │ HTTP/HTTPS
                     ▼
┌─────────────────────────────────────────────────────────┐
│         Angular 19 Frontend (nginx, port 4200)          │
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
│  │ Heretto API clients │ document status cache       │  │
│  └───────────────────────────────────────────────────┘  │
└────────────────────┬────────────────────────────────────┘
                     │ HTTPS
                     ▼
┌─────────────────────────────────────────────────────────┐
│              Heretto CCMS API                           │
│  Deployments │ Scenarios │ Releases │ Publishing Jobs   │
└─────────────────────────────────────────────────────────┘
```

### Technology Stack

**Backend**
- **Runtime:** Python 3.11+ (containers use 3.12)
- **Framework:** FastAPI, served by Uvicorn
- **Platform library:** [`hop-core`](https://github.com/Heretto/hop-core), pinned to a release tag in `requirements.txt`
- **Database:** SQLite via SQLAlchemy 2.x, migrated with Alembic
- **Scheduler:** APScheduler
- **HTTP client:** httpx
- **Validation:** Pydantic v2 / pydantic-settings
- **Rate limiting:** SlowAPI

**Frontend**
- **Framework:** Angular 19
- **UI:** Angular Material 19 plus `@heretto/hop-ui` (shared components and design system, installed from a hop-core GitHub release)
- **Cron parsing:** cronstrue
- **Served by:** nginx in the container image

### Database Schema

Application tables (`backend/models.py`):

**`schedules`**
```
id, org_id (FK → organizations)
name, description
cron_expression
scenario_id, deployment_id
document_ids       (JSON array)
folder_ids         (JSON array)   -- resolved to DITA maps at run time
document_releases  (JSON object)  -- {mapId: snapshotFileId} for pinned releases
locale, branch, publish_parameters (JSON)
enabled, consecutive_failures
last_run_at, last_run_status
created_at, updated_at
```

**`job_history`**
```
id, schedule_id (FK → schedules, cascade)
status, trigger_type
started_at, completed_at
heretto_job_id
request_payload, response_payload
error
```

**`status_value_exclusions`**
```
id, org_id (FK → organizations, cascade)
value, created_at
unique (org_id, value)
```

Additional tables — `users`, `organizations`, `organization_members`, `organization_invitations`, `credentials` — are defined by `hop-core` and share the same database and metadata.

### Key Design Decisions

- **SQLite over PostgreSQL** — simpler deployment, sufficient for this workload
- **Built on hop-core** — auth, SSO, and multi-tenancy are shared with other Heretto applications rather than reimplemented
- **Migrations applied at startup** — no separate deploy step can be forgotten
- **Circuit breaker + exponential backoff** — contains transient Heretto failures without unbounded retries
- **In-memory document status cache** — refreshed hourly, avoiding repeated CCMS search calls

## 🛠️ Development

### Project Structure

```
publishing-scheduler/
├── backend/
│   ├── main.py              # app factory, lifespan, middleware, /api/health
│   ├── settings.py          # AppSettings, extends hop-core's HopCoreSettings
│   ├── models.py            # SQLAlchemy models
│   ├── limiter.py           # SlowAPI rate limiting
│   ├── utils.py
│   ├── routes/              # schedules, jobs, heretto, dashboard, settings
│   ├── services/            # scheduler, job_executor, status_cache
│   ├── clients/             # heretto, heretto_ccms
│   ├── migrations/          # Alembic env + versions/
│   ├── scripts/             # setup.sh, start.sh, seed.py
│   ├── tests/
│   ├── requirements.txt
│   └── requirements-test.txt
├── frontend/
│   ├── src/app/
│   │   ├── core/            # services, guards, interceptors
│   │   ├── features/        # dashboard, schedules, jobs, settings
│   │   ├── shared/          # shared components
│   │   └── shell/           # layout
│   ├── nginx.conf
│   └── package.json
├── scripts/dev.sh           # start both servers
├── docker-compose.yml
└── .env.example
```

### Running Tests

```bash
# Backend
cd backend
pip install -r requirements-test.txt
pytest

# Frontend
cd frontend
npm test
```

The backend suite is pytest with `asyncio_mode = auto` and uses `respx` to stub Heretto HTTP calls; `tests/conftest.py` patches settings, so no `.env` is needed. The frontend uses Karma and Jasmine via `ng test`.

There is no coverage tooling configured and **no end-to-end suite**. Older documentation referenced `npm run test:watch` and `npm run e2e`; neither script exists.

### Database Migrations

Migrations live in `backend/migrations/versions/` and are **applied automatically at startup**, so there is no manual upgrade step in normal operation. To apply them by hand:

```bash
cd backend
.venv/bin/alembic upgrade head
```

Revision files here are numbered manually (`001_…`, `002_…`) rather than hash-generated.

> **⚠️ Autogenerate is restricted, deliberately.** This app's models share hop-core's declarative `Base`, so `Base.metadata` also describes hop-core's tables. Left unfiltered, `--autogenerate` emits a dozen spurious `modify_type` operations against hop-core's schema, because its UUID columns reflect out of SQLite as `NUMERIC` — migrations that would rewrite tables this app does not own. `backend/migrations/env.py` therefore restricts the comparison to our own tables, which it derives from `models.py` rather than a hand-written list. A table absent from that set is excluded from the comparison entirely, so changes to it would never reach a migration and the schema would drift unnoticed.
>
> Note that `alembic revision` also needs a `script.py.mako` template, which this project does not have; existing revisions are written by hand and numbered manually (`001_…`, `002_…`).

### Adding a Feature

**Backend:** add the model to `models.py`, business logic under `services/`, the route module under `routes/`, register the router in `main.py`'s `create_hop_app(extra_routers=[...])` call, then add a migration under `migrations/versions/` and tests under `tests/`.

**Frontend:**

```bash
cd frontend
npx ng generate component features/new-feature
npx ng generate service core/services/new-feature
# then add the route in src/app/app.routes.ts
```

### Code Style

**Backend:** type hints throughout, Pydantic models for request and response validation, `async def` for I/O-bound handlers, dependency injection for database sessions and the current user.

**Frontend:** Angular style guide, standalone components, reactive forms, RxJS for async work, Material plus `hop-ui` components rather than bespoke widgets.

## 🚀 Deployment

### Docker Compose

`docker-compose.yml` builds both services, keeps the SQLite database on the `db-data` volume, and gates frontend startup on the backend reporting healthy. For production, front it with a TLS-terminating reverse proxy and set:

```bash
APP_ENV=production
APP_DEBUG=false
COOKIE_SECURE=true
CORS_ORIGINS=https://scheduler.yourcompany.com
FRONTEND_BASE_URL=https://scheduler.yourcompany.com
```

### Without Docker

Run Uvicorn under a process supervisor. A minimal systemd unit:

```ini
[Unit]
Description=Publishing Scheduler
After=network.target

[Service]
WorkingDirectory=/opt/publishing-scheduler/backend
EnvironmentFile=/opt/publishing-scheduler/backend/.env
ExecStart=/opt/publishing-scheduler/backend/.venv/bin/uvicorn main:app --host 127.0.0.1 --port 3000
Restart=always
User=scheduler

[Install]
WantedBy=multi-user.target
```

Build the frontend with `npm run build` and serve `dist/frontend/browser` from nginx, proxying `/api` to the backend. `frontend/nginx.conf` is a working reference.

> Run a **single** backend instance. Schedules are held by an in-process APScheduler with no distributed lock, so multiple replicas would each fire the same schedule. Scale vertically, or introduce a shared job store first.

### Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: publishing-scheduler
spec:
  replicas: 1          # see the note above about APScheduler
  selector:
    matchLabels:
      app: publishing-scheduler
  template:
    metadata:
      labels:
        app: publishing-scheduler
    spec:
      containers:
        - name: backend
          image: your-registry/publishing-scheduler-backend:latest
          ports:
            - containerPort: 3000
          env:
            - name: APP_ENV
              value: "production"
            - name: DATABASE_URL
              value: "sqlite:////app/data/scheduler.db"
          envFrom:
            - secretRef:
                name: scheduler-secrets   # APP_SECRET_KEY, JWT_SECRET_KEY, ENCRYPTION_KEY, HERETTO_*
          livenessProbe:
            httpGet:
              path: /api/health
              port: 3000
          resources:
            requests: { memory: "512Mi", cpu: "250m" }
            limits:   { memory: "1Gi",   cpu: "500m" }
```

SQLite on a volume means the pod is stateful; use a `StatefulSet` with a `PersistentVolumeClaim` rather than a rolling `Deployment` if you keep SQLite.

### Security Checklist

- [ ] `APP_ENV=production` and `APP_DEBUG=false`
- [ ] `CORS_ORIGINS` restricted to your domain
- [ ] `COOKIE_SECURE=true` behind HTTPS
- [ ] Secrets injected from a secret manager, not committed
- [ ] `ENCRYPTION_KEY` backed up somewhere recoverable
- [ ] TLS terminated in front of the app
- [ ] Only the proxy's ports exposed publicly
- [ ] `ALLOWED_EMAIL_DOMAINS` set if SSO auto-registration is enabled
- [ ] Database backups scheduled and restore tested
- [ ] Log aggregation in place

### Backup & Restore

The image is slim and does **not** include the `sqlite3` CLI, so copy the file out instead:

```bash
# Back up
docker compose cp backend:/app/data/scheduler.db ./scheduler-backup.db

# Restore
docker compose stop backend
docker compose cp ./scheduler-backup.db backend:/app/data/scheduler.db
docker compose start backend
```

For a consistent snapshot without stopping the service, use Python's backup API inside the container:

```bash
docker compose exec backend python -c "
import sqlite3
src = sqlite3.connect('/app/data/scheduler.db')
dst = sqlite3.connect('/app/data/backup.db')
src.backup(dst); dst.close(); src.close()
"
```

Back up `ENCRYPTION_KEY` alongside the database. Without it, encrypted rows in the restored copy cannot be read.

## 📚 API Reference

All application endpoints are under **`/api/v1`** and **require authentication**; unauthenticated requests return `401 {"detail":"Not authenticated"}`. The exception is `GET /api/health`.

Interactive, always-current documentation is served by the app itself:

- **Swagger UI:** `/docs`
- **ReDoc:** `/redoc`
- **OpenAPI JSON:** `/openapi.json`

Prefer those over this section — they are generated from the code.

> **Collection routes end with a slash.** `GET /api/v1/schedules/` is correct; `/api/v1/schedules` (no slash) does not match and returns 404.

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

Create payload:

```json
{
  "name": "Daily Documentation Build",
  "description": "Publishes all docs daily at 2 AM",
  "cron_expression": "0 2 * * *",
  "scenario_id": "123",
  "deployment_id": "456",
  "document_ids": ["doc-1", "doc-2"],
  "folder_ids": ["folder-uuid"],
  "document_releases": { "doc-1": "snapshot-file-uuid" },
  "enabled": true,
  "publish_parameters": []
}
```

### Jobs

| Method | Path |
|---|---|
| GET | `/api/v1/jobs/` |
| GET | `/api/v1/jobs/{job_id}` |

### Dashboard & Settings

| Method | Path |
|---|---|
| GET | `/api/v1/dashboard/summary` |
| GET | `/api/v1/settings/status-exclusions` |
| POST | `/api/v1/settings/status-exclusions` |
| DELETE | `/api/v1/settings/status-exclusions/{value}` |

### Heretto Proxy

| Method | Path |
|---|---|
| GET | `/api/v1/heretto/deployments` |
| GET | `/api/v1/heretto/scenarios` |
| GET | `/api/v1/heretto/scenarios/{scenario_id}/parameters` |
| GET | `/api/v1/heretto/releases` |
| GET | `/api/v1/heretto/ccms/root` |
| GET | `/api/v1/heretto/ccms/branches` |
| GET | `/api/v1/heretto/ccms/folders/{folder_id}` |
| GET | `/api/v1/heretto/ccms/folders/search` |
| GET | `/api/v1/heretto/ccms/documents/{doc_id}` |
| GET | `/api/v1/heretto/ccms/documents/{doc_id}/releases` |
| GET | `/api/v1/heretto/ccms/documents/{doc_id}/status` |
| GET | `/api/v1/heretto/ccms/metadata/status-values` |
| POST | `/api/v1/heretto/ccms/locales` |
| POST | `/api/v1/heretto/ccms/search` |

### Auth, Account, and Organizations

Provided by `hop-core`: `/api/v1/auth/*` (login, logout, refresh, register, forgot-password, reset-password, SSO), `/api/v1/account/me`, `/api/v1/credentials`, `/api/v1/organizations/*`, `/api/v1/invitations/*`, `/api/v1/admin/*`, and `/api/v1/superadmin/*`. See `/docs` for the full list.

## 🔍 Troubleshooting

**❌ `docker compose up` fails: `required variable APP_SECRET_KEY is missing a value`**

Add the three required secrets to the root `.env`:

```bash
openssl rand -hex 32   # run once per variable
```

---

**❌ `docker compose up` fails: `failed to read dockerfile`**

You are on an old checkout from before the backend had a Dockerfile, or `docker-compose.yml` points at a directory that no longer exists. Pull the latest `main`.

---

**❌ Code changes have no effect in Docker**

`docker compose up -d` reuses the existing image and does not rebuild when source changes. Rebuild explicitly:

```bash
bash scripts/docker-up.sh --build
```

If that still serves the old code, Docker's view of the build context can go stale — the build log will report `COPY . .` as `CACHED` even though files changed. Force it:

```bash
docker compose build --no-cache backend
docker compose up -d
```

To confirm which code a container is actually running:

```bash
docker compose exec backend grep -n 'SELECT 1' /app/main.py
```

---

**❌ `pip install -r requirements.txt` fails on `hop-core`**

`hop-core` installs from a GitHub release tag and needs `git` plus network access:

```bash
git --version
pip install "hop-core @ git+https://github.com/Heretto/hop-core.git@v0.1.0"
```

---

**❌ `npm ci` fails on `@heretto/hop-ui`**

That package installs from a hop-core GitHub release asset. Confirm you can reach GitHub, and that the URL in `frontend/package.json` matches an existing release asset. Note the auto-generated source archives on a release are *not* npm-installable; the `.tgz` asset is.

---

**❌ Pydantic validation error at startup naming several fields**

Required settings are missing. Locally, check `backend/.env` — running `bash backend/scripts/setup.sh` generates it with valid secrets. Under Docker, check the root `.env`.

---

**❌ API returns 401 for everything**

Expected when not signed in — every `/api/v1` route requires authentication. Sign in through the frontend, or use `/docs` to authenticate interactively. `/api/health` is the only unauthenticated endpoint.

---

**❌ API returns 404 for a path that should exist**

Check for a missing trailing slash on collection routes: `/api/v1/schedules/`, not `/api/v1/schedules`.

---

**❌ `/api/health` reports `"database": "error"`**

The database probe failed. The reason is logged as `Health check database probe failed: …` — check `docker compose logs backend`. A common cause is the data volume not being writable.

---

**❌ Jobs failing with network errors**

Verify connectivity and credentials, then consider raising the retry budget:

```bash
curl -u username:password https://your-instance.heretto.com/ezdnxtgen/api/v2/deployments
```

```bash
RETRY_MAX_ATTEMPTS=5
```

---

**❌ Schedule auto-disabled**

The circuit breaker tripped after `SCHEDULER_MAX_CONSECUTIVE_FAILURES` consecutive failures. Review the errors in the Jobs view, fix the cause, then re-enable the schedule.

---

**❌ CORS errors in the browser**

Set `CORS_ORIGINS` to the exact origin serving the frontend, including scheme and port:

```bash
CORS_ORIGINS=https://scheduler.yourcompany.com
```

---

**❌ Password reset or invitation emails never arrive**

SMTP is not configured. Set at least `SMTP_HOST` and `SMTP_FROM_EMAIL`; without them the app runs but sends nothing.

### Debug logging

```bash
APP_DEBUG=true bash backend/scripts/start.sh
```

### Getting Help

1. Check the logs: `docker compose logs -f backend`
2. Review job history in the web UI
3. Confirm the API surface at `/docs`
4. Open an issue: [GitHub Issues](https://github.com/Heretto/publishing-scheduler/issues)

## 🤝 Contributing

1. **Create a feature branch:** `git checkout -b feature/amazing-feature`
2. **Make your changes**
3. **Write tests:** `cd backend && pytest`, `cd frontend && npm test`
4. **Commit:** keep commits atomic and well described
5. **Push and open a Pull Request**

### Guidelines

- Follow existing code style
- Write tests for new behavior
- Update documentation, including this file, when behavior changes
- Add a migration for any schema change, written by hand (see the autogenerate caveat above)

## 📄 License

Apache License 2.0 — see [LICENSE](LICENSE).

## 🙏 Acknowledgments

- Built for [Heretto CCMS](https://heretto.com/)
- Platform features from [hop-core](https://github.com/Heretto/hop-core)
- Scheduling via [APScheduler](https://apscheduler.readthedocs.io/)
- API framework: [FastAPI](https://fastapi.tiangolo.com/)
- UI: [Angular Material](https://material.angular.io/)

## 📞 Support

- **Additional docs:** [IMPROVEMENTS.md](IMPROVEMENTS.md), [SECURITY-FIXES.md](SECURITY-FIXES.md)
- **Issues:** [GitHub Issues](https://github.com/Heretto/publishing-scheduler/issues)

---

**Made for the technical documentation community**
