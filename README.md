# Publishing Scheduler

A web application for scheduling and triggering publishing jobs in Heretto CCMS.

## Quick Start (Docker)

1. Copy and configure environment variables:
   ```bash
   cp .env.example .env
   # Edit .env with your Heretto credentials
   ```

2. Start the application:
   ```bash
   docker compose up --build
   ```

3. Open http://localhost:4200 in your browser.

## Development Setup

### Backend

```bash
cd backend
npm install
npm run dev
```

The backend runs on http://localhost:3000. Test with:
```bash
curl http://localhost:3000/api/health
```

Run tests:
```bash
npm test
```

### Frontend

```bash
cd frontend
npm install
npx ng serve
```

The frontend runs on http://localhost:4200 and proxies `/api` requests to the backend.

## Configuration

All configuration is via environment variables (see `.env.example`):

| Variable | Description | Default |
|----------|-------------|---------|
| `HERETTO_API_BASE_URL` | Heretto API base URL | `https://demo-nxt.heretto.com/ezdnxtgen/api/v2` |
| `HERETTO_USERNAME` | Heretto username | — |
| `HERETTO_PASSWORD` | Heretto password | — |
| `PORT` | Backend port | `3000` |
| `DB_PATH` | SQLite database path | `./data/scheduler.db` |

## Architecture

- **Backend:** Node.js/Express with TypeScript, SQLite (better-sqlite3), node-cron
- **Frontend:** Angular 17 with Angular Material
- **Docker:** Two containers (backend + nginx-served frontend), SQLite in a volume

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/schedules` | List all schedules |
| POST | `/api/schedules` | Create schedule |
| GET | `/api/schedules/:id` | Get schedule |
| PUT | `/api/schedules/:id` | Update schedule |
| DELETE | `/api/schedules/:id` | Delete schedule |
| POST | `/api/schedules/:id/trigger` | Trigger job manually |
| PATCH | `/api/schedules/:id/toggle` | Enable/disable schedule |
| GET | `/api/jobs` | List job history (paginated) |
| GET | `/api/jobs/:id` | Job detail |
| GET | `/api/heretto/deployments` | Proxy: list deployments |
| GET | `/api/heretto/scenarios` | Proxy: list scenarios |
| GET | `/api/heretto/releases` | Proxy: list releases |

## License

Apache-2.0
