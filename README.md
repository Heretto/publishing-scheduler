# 📅 Heretto Publishing Scheduler

> A production-ready web application for scheduling and automating publishing jobs in Heretto CCMS with enterprise-grade reliability, monitoring, and security.

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green)](https://nodejs.org/)
[![Angular](https://img.shields.io/badge/Angular-17-red)](https://angular.io/)

## 🌟 Features

- **🕐 Flexible Scheduling** - Create cron-based schedules with visual builder or advanced cron expressions
- **🌍 Locale-Aware Publishing** - Select source and/or translated locales per schedule; each locale triggers a separate Heretto publish job automatically
- **🗺️ DITA Map Filtering** - Document picker filters to DITA maps only, with full folder browsing of your CCMS content repository
- **🎭 Multiple Scenarios** - Assign multiple publishing scenarios to a single schedule; each runs as an independent publish job
- **📄 Multiple Output Formats** - Choose multiple output types (PDF, HTML5, XHTML, etc.) per scenario in a single schedule
- **🔄 Automatic Retry** - Exponential backoff for transient failures (network, timeouts, 5xx errors)
- **🛡️ Circuit Breaker** - Auto-disable schedules after consecutive failures to prevent resource waste
- **📈 Job History** - Complete audit trail with per-publish-result detail, including scenario, locale, document ID, and Heretto job ID
- **🎯 Manual Triggers** - Override schedules and run jobs on-demand
- **🚦 Graceful Shutdown** - Waits for in-flight jobs during server restarts
- **🧪 Test Coverage** - Comprehensive test suite covering scheduling, locale, and publishing features

## 📋 Table of Contents

- [Prerequisites](#-prerequisites)
- [Quick Start](#-quick-start)
- [Installation Options](#-installation-options)
- [Configuration](#-configuration)
- [Usage Guide](#-usage-guide)
- [Use Cases & Recommendations](#-use-cases--recommendations)
- [Monitoring & Metrics](#-monitoring--metrics)
- [Architecture](#-architecture)
- [Development](#-development)
- [Deployment](#-deployment)
- [API Reference](#-api-reference)
- [Troubleshooting](#-troubleshooting)
- [Contributing](#-contributing)

## 🔧 Prerequisites

### Required

- **Node.js 20+** - [Download](https://nodejs.org/)
- **Heretto CCMS Account** - Active subscription with API access
- **Heretto Credentials** - Username and password with publishing permissions

### Optional (for different deployment methods)

- **Docker & Docker Compose** - [Install Docker](https://docs.docker.com/get-docker/)
- **Git** - [Install Git](https://git-scm.com/downloads)
- **Prometheus** - For metrics collection (production)
- **Grafana** - For metrics visualization (production)

### System Requirements

- **Memory:** Minimum 512MB RAM (1GB+ recommended for production)
- **Disk:** ~100MB for application + space for SQLite database (grows with job history)
- **Network:** Outbound HTTPS access to Heretto CCMS API

## 🚀 Quick Start

### Option 1: Docker (Recommended)

The fastest way to get started:

```bash
# 1. Clone the repository
git clone https://github.com/jarodsickler/publishing-scheduler.git
cd publishing-scheduler

# 2. Configure environment
cp .env.example .env
nano .env  # Edit with your Heretto credentials

# 3. Start the application
docker compose up -d

# 4. Open your browser
open http://localhost:4200
```

**That's it!** The application is now running with:
- Frontend: http://localhost:4200
- Backend API: http://localhost:3000
- Metrics: http://localhost:3000/metrics
- Health Check: http://localhost:3000/api/health

### Option 2: Local Development

For development and customization:

```bash
# 1. Clone and configure
git clone https://github.com/jarodsickler/publishing-scheduler.git
cd publishing-scheduler
cp .env.example .env
nano .env  # Add your credentials

# 2. Start backend
cd backend
npm install
npm run dev  # Runs on http://localhost:3000

# 3. In a new terminal, start frontend
cd ../frontend
npm install
npm start  # Runs on http://localhost:4200
```

## 📦 Installation Options

### Docker Deployment (Production)

**Best for:** Production environments, consistent deployments, easy scaling

```bash
# Production mode with optimized builds
docker compose up -d

# View logs
docker compose logs -f

# Stop services
docker compose down

# Update to latest version
git pull
docker compose up -d --build
```

**Pros:**
- Isolated environment
- Consistent across platforms
- Easy updates and rollbacks
- Includes Nginx for frontend serving

### Manual Installation (Development)

**Best for:** Local development, customization, debugging

```bash
# Backend setup
cd backend
npm install
npm run build  # Compile TypeScript
npm start      # Production mode
# OR
npm run dev    # Development with hot reload

# Frontend setup
cd frontend
npm install
npm run build  # Production build
# OR
npx ng serve   # Development with hot reload
```

**Pros:**
- Full control over the environment
- Easy debugging
- Live code reloading
- Direct access to all tools

### PM2 Deployment (Production without Docker)

**Best for:** VPS deployments, systemd integration

```bash
# Install PM2 globally
npm install -g pm2

# Build and start backend
cd backend
npm install
npm run build
pm2 start dist/index.js --name publishing-scheduler

# Build and serve frontend (with nginx or serve)
cd ../frontend
npm install
npm run build
# Serve dist/frontend with nginx or: npx serve -s dist/frontend -l 4200

# Save PM2 configuration
pm2 save
pm2 startup  # Follow instructions for auto-start on reboot
```

## ⚙️ Configuration

### Environment Variables

Create a `.env` file in the project root (copy from `.env.example`):

```bash
# ============================================
# HERETTO CREDENTIALS (Required)
# ============================================
HERETTO_API_BASE_URL=https://your-instance.heretto.com/ezdnxtgen/api/v2
HERETTO_CCMS_BASE_URL=https://your-instance.heretto.com/rest
HERETTO_USERNAME=your-username
HERETTO_PASSWORD=your-password

# ============================================
# SERVER CONFIGURATION
# ============================================
PORT=3000
NODE_ENV=production  # or 'development'

# ============================================
# CORS SECURITY (Important for production!)
# ============================================
# Comma-separated list of allowed origins
# Development default: http://localhost:4200,http://localhost:3000
CORS_ALLOWED_ORIGINS=https://scheduler.yourcompany.com

# ============================================
# DATABASE
# ============================================
DB_PATH=./data/scheduler.db  # SQLite database location

# ============================================
# RETRY CONFIGURATION (Optional)
# ============================================
RETRY_MAX_ATTEMPTS=3              # Number of retry attempts
RETRY_INITIAL_DELAY_MS=1000       # Initial delay before retry
RETRY_MAX_DELAY_MS=30000          # Maximum delay between retries
RETRY_BACKOFF_MULTIPLIER=2        # Exponential backoff multiplier

# ============================================
# SCHEDULER CONFIGURATION (Optional)
# ============================================
SCHEDULER_MAX_CONSECUTIVE_FAILURES=5  # Auto-disable after N failures
```

### Configuration Validation

The application validates configuration on startup and warns about missing required values:

```bash
npm run dev

# You'll see warnings like:
# ⚠️  HERETTO_USERNAME is not set — Heretto API calls will fail
# ⚠️  CORS_ALLOWED_ORIGINS is not set in production — API will reject cross-origin requests
```

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
   - **Documents:** Browse your CCMS content repository (filtered to DITA maps by default) and select the maps to publish
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

**Recommended Setup:**
```
Schedule: 0 2 * * * (2 AM daily)
Scenario: "Website Publishing"
Documents: All product documentation
Branch: master
```

**Benefits:**
- Ensures documentation is always current
- Reduces manual publishing workload
- Consistent publishing schedule

---

### 2. **Multi-Environment Deployments**

**Use Case:** Publish to staging hourly, production daily.

**Recommended Setup:**

**Staging:**
```
Schedule: 0 * * * * (Every hour)
Deployment: "Staging Environment"
Scenario: "Staging Publish"
```

**Production:**
```
Schedule: 0 3 * * * (3 AM daily)
Deployment: "Production Environment"
Scenario: "Production Publish"
```

**Benefits:**
- Staging stays synchronized with content updates
- Production deploys at low-traffic times
- Separate testing and production cycles

---

### 3. **Release Publishing Workflow**

**Use Case:** Publish release notes when new versions are tagged.

**Recommended Setup:**
```
Schedule: Manual trigger only (disable automatic)
Scenario: "Release Notes Publishing"
Documents: release-notes/v1.0.0.md
```

**Workflow:**
1. Tag release in source control
2. Manually trigger schedule after validation
3. Job history provides audit trail

**Benefits:**
- Controlled, deliberate publishing
- Audit trail for compliance
- Manual verification before publishing

---

### 4. **Batch Content Updates**

**Use Case:** Publish large content batches during off-hours.

**Recommended Setup:**
```
Schedule: 0 1 * * 6 (Saturday 1 AM)
Scenario: "Batch Update Publishing"
Documents: [100+ documents]
Max Failures: 10
Retry Attempts: 5
```

**Benefits:**
- Minimizes impact on business hours
- Retry logic handles transient failures
- Auto-disable prevents infinite retry loops

---

### 5. **Compliance & Audit Requirements**

**Use Case:** Maintain audit trail for regulated industries.

**Recommended Features:**
- Job history retained for 90 days (configurable)
- Request/response payloads captured
- Trigger type tracked (scheduled vs manual)
- Prometheus metrics for compliance reporting

**Recommended Monitoring:**
```
- Alert on failed jobs
- Track publish success rate
- Monitor job execution duration
- Export job history for audits
```

---

### Best Practices

✅ **Start with conservative schedules** - Test with manual triggers first
✅ **Use descriptive names** - Future you will thank you
✅ **Monitor job history** - Check for patterns in failures
✅ **Set up alerts** - Use Prometheus metrics for proactive monitoring
✅ **Test on staging first** - Validate schedules before production
✅ **Document your schedules** - Use the description field extensively
✅ **Review logs regularly** - Catch issues before they become critical

⚠️ **Avoid:**
- Scheduling too many concurrent jobs
- Very short intervals (<5 minutes) without consideration
- Publishing during peak traffic hours
- Ignoring failed job notifications

## 📊 Monitoring & Metrics

### Prometheus Metrics

Access metrics at: `http://localhost:3000/metrics`

**Available Metrics:**

| Metric | Type | Description |
|--------|------|-------------|
| `http_request_duration_seconds` | Histogram | Request latency by endpoint |
| `http_requests_total` | Counter | Total requests by method/route/status |
| `job_execution_duration_seconds` | Histogram | Job execution time |
| `job_executions_total` | Counter | Total jobs by status |
| `job_concurrent_executions` | Gauge | Currently running jobs |
| `scheduler_active_schedules` | Gauge | Number of active schedules |
| `schedule_failures_total` | Counter | Schedule failures by reason |

**Plus default Node.js metrics:** CPU, memory, event loop lag, GC stats

### Setting Up Monitoring

**1. Deploy Prometheus:**

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'publishing-scheduler'
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/metrics'
    scrape_interval: 15s
```

**2. Example Queries:**

```promql
# Request success rate
rate(http_requests_total{status_code=~"2.."}[5m]) /
rate(http_requests_total[5m]) * 100

# Job success rate
rate(job_executions_total{status="success"}[5m]) /
rate(job_executions_total[5m]) * 100

# 95th percentile request latency
histogram_quantile(0.95,
  rate(http_request_duration_seconds_bucket[5m])
)

# Active jobs right now
job_concurrent_executions
```

**3. Recommended Alerts:**

```yaml
# High error rate
- alert: HighErrorRate
  expr: rate(http_requests_total{status_code=~"5.."}[5m]) > 0.05
  for: 5m

# Job failure rate
- alert: HighJobFailureRate
  expr: rate(job_executions_total{status="failed"}[5m]) / rate(job_executions_total[5m]) > 0.1
  for: 10m

# Schedule auto-disabled
- alert: ScheduleAutoDisabled
  expr: increase(schedules_auto_disabled_total[5m]) > 0
```

### Health Checks

**Endpoint:** `GET /api/health`

```json
{
  "status": "ok",
  "timestamp": "2026-06-18T04:06:52.855Z",
  "checks": {
    "database": "ok",
    "scheduler": {
      "activeJobs": 0
    }
  }
}
```

**Use for:**
- Load balancer health checks
- Kubernetes liveness/readiness probes
- Uptime monitoring services

## 🏗️ Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────┐
│                     User Browser                        │
└────────────────────┬────────────────────────────────────┘
                     │ HTTP/HTTPS
                     ▼
┌─────────────────────────────────────────────────────────┐
│              Angular Frontend (Port 4200)               │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Dashboard │ Schedules │ Jobs │ Settings        │   │
│  └──────────────────────────────────────────────────┘   │
└────────────────────┬────────────────────────────────────┘
                     │ REST API (/api)
                     ▼
┌─────────────────────────────────────────────────────────┐
│           Express Backend (Port 3000)                   │
│  ┌─────────────────────────────────────────────────┐    │
│  │ Rate Limiter │ CORS │ Metrics │ Error Handler  │    │
│  └─────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────┐    │
│  │  Scheduler Service  │  Job Executor Service    │    │
│  │  (node-cron)        │  (Retry Logic)           │    │
│  └─────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────┐    │
│  │  SQLite Database    │  Heretto API Client      │    │
│  └─────────────────────────────────────────────────┘    │
└────────────────────┬────────────────────────────────────┘
                     │ HTTPS
                     ▼
┌─────────────────────────────────────────────────────────┐
│              Heretto CCMS API                           │
│  Deployments │ Scenarios │ Publishing Jobs              │
└─────────────────────────────────────────────────────────┘
```

### Technology Stack

**Backend:**
- **Runtime:** Node.js 20 (TypeScript 5.5)
- **Framework:** Express.js 4.21
- **Database:** SQLite (better-sqlite3) with WAL mode
- **Scheduler:** node-cron
- **Validation:** Zod
- **Metrics:** prom-client (Prometheus)
- **Security:** Helmet, CORS, express-rate-limit

**Frontend:**
- **Framework:** Angular 17
- **UI Library:** Angular Material
- **HTTP Client:** RxJS
- **Cron Parser:** cronstrue

**Infrastructure:**
- **Containerization:** Docker & Docker Compose
- **Web Server:** Nginx (for frontend in production)
- **Process Management:** PM2 (optional)

### Database Schema

**schedules table:**
```sql
- id (TEXT PRIMARY KEY)
- name, description
- cron_expression
- scenario_id, deployment_id
- document_ids (JSON array)
- enabled (BOOLEAN)
- branch, publish_parameters (JSON)
- consecutive_failures (INTEGER)
- last_run_at, last_run_status
- created_at, updated_at
```

**job_history table:**
```sql
- id (TEXT PRIMARY KEY)
- schedule_id (FOREIGN KEY)
- status, trigger_type
- started_at, completed_at
- heretto_job_id
- request_payload, response_payload (JSON)
- error
```

### Key Design Decisions

✅ **SQLite over PostgreSQL** - Simpler deployment, sufficient for workload
✅ **Better-sqlite3 over node-sqlite3** - Synchronous API, better performance
✅ **WAL mode** - Concurrent reads during writes
✅ **Zod validation** - Type-safe runtime validation
✅ **Circuit breaker** - Prevents runaway failures
✅ **Exponential backoff** - Handles transient failures gracefully

## 🛠️ Development

### Project Structure

```
publishing-scheduler/
├── backend/
│   ├── src/
│   │   ├── controllers/      # Request handlers
│   │   ├── models/           # Database models
│   │   ├── services/         # Business logic
│   │   ├── routes/           # API routes
│   │   ├── middleware/       # Express middleware
│   │   ├── metrics/          # Prometheus metrics
│   │   ├── heretto/          # Heretto API client
│   │   ├── db/migrations/    # Database migrations
│   │   └── utils/            # Utilities
│   ├── tests/
│   │   ├── unit/             # Unit tests
│   │   └── integration/      # Integration tests
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── core/         # Services, interceptors
│   │   │   ├── features/     # Feature modules
│   │   │   ├── shared/       # Shared components
│   │   │   └── layouts/      # Layout components
│   │   └── assets/
│   └── package.json
├── docker-compose.yml
├── .env.example
└── README.md
```

### Running Tests

```bash
# Backend tests
cd backend
npm test              # Run all tests
npm run test:watch    # Watch mode for development

# Frontend tests
cd frontend
npm test              # Run unit tests
npm run test:watch    # Watch mode
npm run e2e           # End-to-end tests
```

**Current test coverage:** 107 passing tests

### Adding a New Feature

1. **Backend:**
   ```bash
   # 1. Create model (if needed)
   touch backend/src/models/new-feature.model.ts

   # 2. Create service
   touch backend/src/services/new-feature.service.ts

   # 3. Create controller
   touch backend/src/controllers/new-feature.controller.ts

   # 4. Create routes
   touch backend/src/routes/new-feature.routes.ts

   # 5. Add tests
   touch backend/tests/unit/new-feature.test.ts

   # 6. Update app.ts to register routes
   ```

2. **Frontend:**
   ```bash
   # 1. Generate feature module
   npx ng generate module features/new-feature

   # 2. Generate components
   npx ng generate component features/new-feature/new-feature

   # 3. Generate service
   npx ng generate service core/services/new-feature

   # 4. Add route to app.routes.ts
   ```

### Code Style

**Backend:**
- TypeScript strict mode enabled
- Prefer async/await over callbacks
- Use Zod for validation
- Export types and interfaces

**Frontend:**
- Angular style guide
- Reactive forms
- RxJS for async operations
- Material Design components

### Database Migrations

Create a new migration:

```bash
cd backend/src/db/migrations
touch 004-description.sql
```

Migrations run automatically on application start in order by filename.

## 🚀 Deployment

### Docker Deployment

**Production-ready Docker Compose:**

```yaml
# docker-compose.prod.yml
services:
  backend:
    build: ./backend
    restart: always
    environment:
      - NODE_ENV=production
      - PORT=3000
    volumes:
      - db-data:/app/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  frontend:
    build: ./frontend
    restart: always
    ports:
      - "80:80"
      - "443:443"
    depends_on:
      - backend
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl

volumes:
  db-data:
```

### Kubernetes Deployment

**Example manifests:**

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: publishing-scheduler
spec:
  replicas: 2
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
        image: your-registry/publishing-scheduler:latest
        env:
        - name: NODE_ENV
          value: "production"
        - name: HERETTO_USERNAME
          valueFrom:
            secretKeyRef:
              name: heretto-creds
              key: username
        ports:
        - containerPort: 3000
        livenessProbe:
          httpGet:
            path: /api/health
            port: 3000
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"
            cpu: "500m"
```

### Security Checklist

Before deploying to production:

- [ ] Set `NODE_ENV=production`
- [ ] Configure `CORS_ALLOWED_ORIGINS` with your domain
- [ ] Use strong, unique `HERETTO_PASSWORD`
- [ ] Enable HTTPS/TLS for all traffic
- [ ] Set up firewall rules (only expose ports 80/443)
- [ ] Configure rate limiting appropriately
- [ ] Set up log aggregation (e.g., ELK stack)
- [ ] Enable automatic security updates
- [ ] Implement authentication (coming soon)
- [ ] Set up backup strategy for SQLite database
- [ ] Configure monitoring and alerting

### Backup & Restore

**Backup SQLite database:**

```bash
# Using Docker
docker compose exec backend sqlite3 /app/data/scheduler.db ".backup '/app/data/backup.db'"

# Or copy the file
docker cp publishing-scheduler-backend-1:/app/data/scheduler.db ./backup.db
```

**Restore:**

```bash
docker cp ./backup.db publishing-scheduler-backend-1:/app/data/scheduler.db
docker compose restart backend
```

## 📚 API Reference

### Schedules

**`GET /api/schedules`** - List all schedules

**Response:**
```json
[
  {
    "id": "uuid",
    "name": "Daily Documentation Build",
    "description": "Publishes docs daily",
    "cron_expression": "0 2 * * *",
    "scenario_id": "123",
    "deployment_id": "456",
    "document_ids": ["doc-1", "doc-2"],
    "enabled": true,
    "consecutive_failures": 0,
    "last_run_at": "2026-06-18T02:00:00Z",
    "last_run_status": "success",
    "created_at": "2026-06-01T10:00:00Z",
    "updated_at": "2026-06-18T02:00:00Z"
  }
]
```

---

**`POST /api/schedules`** - Create schedule

**Request:**
```json
{
  "name": "Daily Documentation Build",
  "description": "Publishes all docs daily at 2 AM",
  "cron_expression": "0 2 * * *",
  "scenario_id": "123",
  "deployment_id": "456",
  "document_ids": ["doc-1", "doc-2"],
  "enabled": true,
  "publish_parameters": []
}
```

---

**`POST /api/schedules/:id/trigger`** - Manually trigger job

**Response:** Returns created job object

---

**`PATCH /api/schedules/:id/toggle`** - Enable/disable

**Request:**
```json
{
  "enabled": false
}
```

### Jobs

**`GET /api/jobs?page=1&limit=20&schedule_id=uuid&status=completed`**

Query params:
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 20, max: 100)
- `schedule_id` - Filter by schedule
- `status` - Filter by status (running|completed|failed)

**Response:**
```json
{
  "data": [...],
  "total": 150,
  "page": 1,
  "limit": 20,
  "totalPages": 8
}
```

### Heretto API Proxy

**`GET /api/heretto/deployments`** - List deployments

**`GET /api/heretto/scenarios`** - List publishing scenarios

**`GET /api/heretto/scenarios/:id/parameters`** - Get scenario parameters

### Metrics

**`GET /metrics`** - Prometheus metrics (text/plain)

### Health

**`GET /api/health`** - Health check

## 🔍 Troubleshooting

### Common Issues

**❌ "HERETTO_USERNAME is not set"**

**Solution:** Configure credentials in `.env`:
```bash
HERETTO_USERNAME=your-username
HERETTO_PASSWORD=your-password
```

---

**❌ "Database not initialized"**

**Solution:** Ensure the data directory exists and is writable:
```bash
mkdir -p backend/data
chmod 755 backend/data
```

---

**❌ "Port 3000 already in use"**

**Solution:** Change the port in `.env`:
```bash
PORT=3001
```

Or kill the process using port 3000:
```bash
lsof -ti:3000 | xargs kill -9
```

---

**❌ Jobs failing with network errors**

**Solution:** Check retry configuration and network connectivity:
```bash
# Test Heretto API connectivity
curl -u username:password https://your-instance.heretto.com/ezdnxtgen/api/v2/deployments

# Increase retry attempts
RETRY_MAX_ATTEMPTS=5
```

---

**❌ Schedule auto-disabled**

**Solution:** Check job history for errors, fix the issue, then re-enable:
```
1. Go to Jobs tab
2. Filter by the schedule
3. Review error messages
4. Fix the issue (e.g., invalid document ID)
5. Re-enable the schedule
```

---

**❌ CORS errors in browser**

**Solution:** Configure CORS for your domain:
```bash
CORS_ALLOWED_ORIGINS=https://yourdomain.com
```

### Debug Mode

Enable verbose logging:

```bash
LOG_LEVEL=debug npm run dev
```

### Getting Help

1. **Check the logs:**
   ```bash
   docker compose logs -f backend
   ```

2. **Review job history** in the web UI

3. **Check Prometheus metrics** at `/metrics`

4. **Open an issue:** [GitHub Issues](https://github.com/jarodsickler/publishing-scheduler/issues)

## 🤝 Contributing

We welcome contributions! Here's how to get started:

1. **Fork the repository**
2. **Create a feature branch:** `git checkout -b feature/amazing-feature`
3. **Make your changes**
4. **Write tests:** Ensure tests pass with `npm test`
5. **Commit:** `git commit -m 'Add amazing feature'`
6. **Push:** `git push origin feature/amazing-feature`
7. **Open a Pull Request**

### Development Guidelines

- Follow existing code style
- Write tests for new features
- Update documentation
- Keep commits atomic and well-described
- Run tests before submitting PR

## 📄 License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built for [Heretto CCMS](https://heretto.com/)
- Uses [Angular Material](https://material.angular.io/)
- Metrics powered by [prom-client](https://github.com/siimon/prom-client)
- Scheduling via [node-cron](https://github.com/node-cron/node-cron)

## 📞 Support

- **Documentation:** See [IMPROVEMENTS.md](IMPROVEMENTS.md) and [SECURITY-FIXES.md](SECURITY-FIXES.md)
- **Issues:** [GitHub Issues](https://github.com/jarodsickler/publishing-scheduler/issues)
- **Discussions:** [GitHub Discussions](https://github.com/jarodsickler/publishing-scheduler/discussions)

---

**Made with ❤️ for the technical documentation community**
