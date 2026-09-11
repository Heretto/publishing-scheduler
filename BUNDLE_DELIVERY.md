# Bundle Delivery

> Feature branch: `feature/bundle-delivery`

Delivers publish bundle ZIPs from completed Heretto publishing jobs to a customer-configured SFTP server or Amazon S3 bucket — one bundle per DITA map, sent automatically after each successful schedule run.

## How it works

1. A schedule runs and triggers one or more Heretto publish jobs.
2. When each job completes, the scheduler stores a `pending_delivery` record pointing to the Heretto file ID and publish ID.
3. A background poller (60-second interval by default) calls the Heretto bundle endpoint for each pending record. When Heretto signals the bundle is ready (HTTP 200), the scheduler streams the ZIP to a local temp file and uploads it to the configured target.
4. Each bundle is named `{document-name}_{UTC-timestamp}.zip` and delivered independently. Multiple maps in one schedule produce multiple files.

The poller retries up to 60 times (~1 hour window) before marking a delivery permanently failed, accommodating long PDF generation or large DITA OT jobs.

---

## Configuring delivery on a schedule

Delivery is **optional and per-schedule**. To enable it:

1. Open a schedule (create or edit).
2. Scroll to the **Publish Delivery** section.
3. Check **Deliver publish bundles after each job completes**.
4. Choose a target type — **SFTP** or **Amazon S3** — and fill in the fields below.

### SFTP

| Field | Required | Notes |
|---|---|---|
| Host | Yes | Hostname or IP of the SFTP server |
| Port | Yes | Default 22 |
| Username | Yes | |
| Password | Yes | Stored encrypted; shown masked (***) after saving |
| Remote Path | No | Directory on the server; defaults to `/` |
| Host Key | Yes | The server's SSH public key — see below |

#### Obtaining the host key

The host key field is required for all internet-facing connections. It prevents man-in-the-middle attacks by verifying the server's identity before transmitting credentials and content.

**Step 1 — run ssh-keyscan from a terminal:**

```bash
ssh-keyscan -p 22 sftp.example.com
```

Replace `22` with your actual port and `sftp.example.com` with your server hostname.

**Step 2 — identify the right output line:**

`ssh-keyscan` may return multiple lines (one per key type). Prefer `ssh-ed25519` if available, then `ecdsa-sha2-*`, then `ssh-rsa`. The line looks like:

```
sftp.example.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGq8...
```

**Step 3 — paste the line into the Host Key field.**

You can paste the whole line (including the hostname prefix) or just the `keytype base64data` part — both are accepted.

#### Provider-specific notes

| Provider | Where to find the host key |
|---|---|
| AWS Transfer Family | AWS Console → Transfer Family → Server → "Server host key" tab |
| FileZilla Server | Admin UI → Server → Host key fingerprint (run `ssh-keyscan` against the public hostname for the full key) |
| WinSCP / ProFTPD / OpenSSH | Run `ssh-keyscan` as above; the server admin can also export the key from `/etc/ssh/ssh_host_*_key.pub` |
| Managed hosting (Kinsta, Cloudways, etc.) | Provider dashboard → SFTP section → host key or fingerprint field. If only a fingerprint is shown, run `ssh-keyscan` to get the full key. |

### Amazon S3

| Field | Required | Notes |
|---|---|---|
| Bucket | Yes | Must already exist; no bucket creation |
| Region | Yes | e.g. `us-east-1` |
| Access Key ID | Yes | IAM user credential |
| Secret Access Key | Yes | Stored encrypted; shown masked (***) after saving |
| Key Prefix | No | Optional path prefix inside the bucket, e.g. `heretto/bundles/`. Files land at `prefix/filename.zip`. |

**Minimum IAM policy required:**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::your-bucket-name/*"
    }
  ]
}
```

Using an IAM user scoped to `s3:PutObject` on a single bucket is recommended over broader credentials.

---

## Security

### SFTP

- **Transport encryption:** SFTP runs over SSH. All data — credentials and bundle content — is encrypted in transit using standard SSH cipher suites.
- **Server authentication:** The host key field enforces strict server identity verification. Connections to servers whose key does not match the stored value are rejected immediately, preventing MITM attacks. This is equivalent to HTTPS certificate validation for SSH.
- **Credential storage:** SFTP passwords are encrypted at rest using Fernet (AES-128-CBC + HMAC-SHA256) derived from the `ENCRYPTION_KEY` environment variable. They are never returned in plaintext through the API — only the `***` mask token is shown after initial save.

### S3

- **Transport encryption:** boto3 uploads via HTTPS with full TLS certificate validation. There is no option to disable this.
- **Credential storage:** Secret access keys are encrypted at rest identically to SFTP passwords.

---

## Operational notes

### Settings

```env
DELIVERY_POLL_INTERVAL_SECONDS=60   # How often the poller checks for pending deliveries
DELIVERY_MAX_POLL_ATTEMPTS=60       # Max attempts before marking a delivery failed (~1 hour at 60s intervals)
```

### Delivery status

Delivery state is stored in the `pending_deliveries` table. Each row passes through: `pending` → `delivering` → `completed` (or `failed`). A delivery target being disabled after a job runs will cause any pending rows for that schedule to be marked `failed` on the next poller tick.

### What happens on failure

If a delivery fails (network error, bad credentials, full disk on the SFTP server), the row is marked `failed` and the error is logged. The schedule continues to run normally — delivery failure does not affect the Heretto publish job result or future schedule runs.

### Changing credentials

Edit the schedule and save. For masked fields (`***`), leave the field unchanged to keep the stored credential. Enter a new value to replace it.

### Removing a delivery target

Uncheck **Deliver publish bundles after each job completes** and save. This removes the stored target configuration including encrypted credentials. Any already-pending deliveries for in-progress jobs will be marked `failed` on the next poller tick.

---

## Architecture

```
Schedule run
    └── JobExecutorService.execute()
            └── _create_pending_deliveries()   ← creates PendingDelivery rows
                        │
                        ▼
            pending_deliveries table
                        │
                        ▼ (every 60s)
            DeliveryPollerService._tick()
                    ├── _download_bundle()     ← GET /files/{id}/publishes/{id}/assets-all
                    │       200 → stream ZIP to temp file
                    │       4xx → not yet ready, retry next tick
                    │       5xx → raise (row stays pending)
                    └── client.deliver()
                            ├── SFTPDeliveryClient  (paramiko, RejectPolicy + host key)
                            └── S3DeliveryClient    (boto3, HTTPS)
```

## Database schema

Three additions to the existing schema (migration `003_add_bundle_delivery`):

**`delivery_targets`** — one row per schedule (unique constraint on `schedule_id`)

| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| schedule_id | UUID | FK → schedules, cascade delete |
| type | VARCHAR(20) | `sftp` or `s3` |
| config_encrypted | LargeBinary | Fernet-encrypted JSON blob of all config fields |
| enabled | Boolean | |

**`pending_deliveries`** — one row per publish job × per DITA map

| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| job_history_id | UUID | FK → job_history, cascade delete |
| file_id | TEXT | Heretto file ID |
| publish_id | TEXT | Heretto publish job ID |
| document_name | TEXT | Human-readable name for filename generation |
| status | TEXT | `pending`, `delivering`, `completed`, `failed` |
| attempts | Integer | Incremented each poller tick |
| last_polled_at | DateTime | |
| delivered_at | DateTime | Set on success |
| error | TEXT | Last error message if failed |

**`job_history.publish_jobs`** — new TEXT column, JSON array of `{fileId, publishId, documentName}` written by the executor to bridge executor → poller.
