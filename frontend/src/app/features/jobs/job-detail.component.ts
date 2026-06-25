import { Component, OnInit, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { JobService, Job, PublishResult } from '../../core/services/job.service';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge.component';

@Component({
    selector: 'app-job-detail',
    imports: [
        CommonModule, RouterModule, MatButtonModule,
        MatProgressSpinnerModule, MatIconModule, MatTableModule,
        StatusBadgeComponent,
    ],
    template: `
    <div class="loading-wrap" *ngIf="loading">
      <mat-spinner diameter="40" aria-label="Loading job details"></mat-spinner>
    </div>

    <div class="sn-card not-found-card" *ngIf="!loading && !job">
      <p>Job not found.</p>
    </div>

    <ng-container *ngIf="job">
      <!-- Page banner -->
      <div class="page-banner">
        <div class="banner-breadcrumb">
          <a routerLink="/jobs" class="bc-link">Job History</a>
          <mat-icon class="bc-sep" aria-hidden="true">chevron_right</mat-icon>
          <span>Job Run</span>
        </div>
        <div class="banner-row">
          <div class="banner-status-dot" [class]="'status-' + job.status"></div>
          <h1 class="banner-title">Job Run</h1>
          <span class="banner-trigger">
            {{ job.trigger_type === 'manual' ? 'Triggered manually' : 'Triggered by schedule' }}
            &nbsp;·&nbsp; {{ job.started_at | date:'medium' }}
          </span>
          <div class="banner-actions">
            <a mat-stroked-button [routerLink]="['/schedules', job.schedule_id]" *ngIf="job.schedule_id" class="banner-btn-outline">
              <mat-icon>schedule</mat-icon>
              {{ job.schedule_name || 'Schedule' }}
            </a>
          </div>
        </div>
      </div>

      <!-- Record header field strip -->
      <div class="record-header">
        <div class="record-field">
          <div class="record-label">Schedule</div>
          <div class="record-value">
            <a [routerLink]="['/schedules', job.schedule_id]" *ngIf="job.schedule_id" class="record-link">
              {{ job.schedule_name || job.schedule_id }}
            </a>
            <span *ngIf="!job.schedule_id">—</span>
          </div>
        </div>
        <div class="record-divider"></div>
        <div class="record-field">
          <div class="record-label">Started</div>
          <div class="record-value">{{ job.started_at | date:'HH:mm:ss, MMM d' }}</div>
        </div>
        <div class="record-divider"></div>
        <div class="record-field">
          <div class="record-label">Completed</div>
          <div class="record-value">{{ job.completed_at ? (job.completed_at | date:'HH:mm:ss, MMM d') : '—' }}</div>
        </div>
        <div class="record-divider"></div>
        <div class="record-field">
          <div class="record-label">Duration</div>
          <div class="record-value">{{ duration }}</div>
        </div>
        <div class="record-divider"></div>
        <div class="record-field">
          <div class="record-label">Status</div>
          <div class="record-value"><app-status-badge [status]="job.status"></app-status-badge></div>
        </div>
      </div>

      <div class="content-area">
        <!-- error banner -->
        <div class="sn-card error-card" *ngIf="job.error">
          <div class="sn-card-header error-header-bar">
            <div class="error-header-inner">
              <mat-icon>error_outline</mat-icon>
              <span>Job Failed</span>
            </div>
          </div>
          <div class="sn-card-body">
            <pre class="error-text">{{ job.error }}</pre>
          </div>
        </div>

        <!-- publish results table -->
        <div class="sn-card" *ngIf="publishResults.length > 0">
          <div class="sn-card-header">
            <span class="section-title">Publish Results</span>
            <span class="section-count">{{ publishResults.length }} operation{{ publishResults.length !== 1 ? 's' : '' }}</span>
          </div>
          <table mat-table [dataSource]="publishResults" class="results-table">
            <ng-container matColumnDef="scenario">
              <th mat-header-cell *matHeaderCellDef>Scenario</th>
              <td mat-cell *matCellDef="let r">{{ scenarioDisplay(r._scenario) }}</td>
            </ng-container>
            <ng-container matColumnDef="locale">
              <th mat-header-cell *matHeaderCellDef>Locale</th>
              <td mat-cell *matCellDef="let r">
                <span class="locale-chip" [class.source]="r._locale === 'source'">
                  {{ r._locale === 'source' ? 'Source' : r._locale }}
                </span>
              </td>
            </ng-container>
            <ng-container matColumnDef="document">
              <th mat-header-cell *matHeaderCellDef>Document</th>
              <td mat-cell *matCellDef="let r" class="mono small">{{ documentDisplay(r.fileId) }}</td>
            </ng-container>
            <ng-container matColumnDef="herettoJobId">
              <th mat-header-cell *matHeaderCellDef>Heretto Job ID</th>
              <td mat-cell *matCellDef="let r" class="mono small">{{ r.id || '—' }}</td>
            </ng-container>
            <ng-container matColumnDef="status">
              <th mat-header-cell *matHeaderCellDef>Status</th>
              <td mat-cell *matCellDef="let r">
                <app-status-badge [status]="r.status"></app-status-badge>
              </td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="resultColumns"></tr>
            <tr mat-row *matRowDef="let row; columns: resultColumns"></tr>
          </table>
        </div>

        <!-- partial failures -->
        <div class="sn-card warn-card" *ngIf="partialErrors.length > 0">
          <div class="sn-card-header warn-header-bar">
            <div class="warn-header-inner">
              <mat-icon>warning_amber</mat-icon>
              <span class="section-title" style="color: #e65100;">Partial Failures</span>
            </div>
          </div>
          <div class="sn-card-body">
            <ul class="error-list">
              <li *ngFor="let e of partialErrors">{{ e }}</li>
            </ul>
          </div>
        </div>

        <!-- request details -->
        <div class="sn-card">
          <div class="sn-card-header">
            <span class="section-title">Request Details</span>
          </div>
          <div class="sn-card-body">
            <dl class="detail-grid">
              <dt>Scenarios</dt>
              <dd>
                <span class="chip" *ngFor="let s of requestScenarios">{{ scenarioDisplay(s) }}</span>
                <span *ngIf="requestScenarios.length === 0" class="muted">—</span>
              </dd>
              <dt>Locales</dt>
              <dd>
                <span class="chip" *ngFor="let l of requestLocales">
                  {{ l === '' ? 'Source' : l }}
                </span>
                <span *ngIf="requestLocales.length === 0" class="muted">—</span>
              </dd>
              <dt>Documents</dt>
              <dd class="doc-list">
                <span class="mono small" *ngFor="let d of requestDocuments">{{ documentDisplay(d) }}</span>
                <span *ngIf="requestDocuments.length === 0" class="muted">—</span>
              </dd>
              <ng-container *ngIf="requestParameters.length > 0">
                <dt>Parameters</dt>
                <dd>
                  <div *ngFor="let p of requestParameters" class="param-row">
                    <span class="param-name">{{ p['name'] }}:</span>
                    <span class="param-value">{{ p['value'] }}</span>
                  </div>
                </dd>
              </ng-container>
            </dl>
          </div>
        </div>
      </div>
    </ng-container>
  `,
    styles: [`
    .loading-wrap { display: flex; justify-content: center; padding: 48px; }

    /* ── Banner ─────────────────────────────────────────────── */
    .page-banner {
      background: linear-gradient(135deg, #011627 0%, #0d2137 100%);
      padding: 0 28px;
      margin: -20px -24px 0;
      color: #fff;
    }
    .banner-breadcrumb {
      font-size: 11px;
      color: rgba(255,255,255,0.5);
      padding-top: 16px;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .bc-link { color: rgba(255,255,255,0.6); text-decoration: none; }
    .bc-link:hover { color: #fff; text-decoration: none; }
    .bc-sep { font-size: 14px; width: 14px; height: 14px; line-height: 14px; }
    .banner-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 0 16px;
    }
    .banner-title { font-size: 22px; font-weight: 700; margin: 0; color: #fff; }
    .banner-trigger { font-size: 12px; color: rgba(255,255,255,0.55); flex: 1; }
    .banner-actions { display: flex; gap: 8px; }
    .banner-btn-outline {
      color: rgba(255,255,255,0.85) !important;
      border-color: rgba(255,255,255,0.3) !important;
      font-size: 12px;
    }

    /* Status dot in banner */
    .banner-status-dot {
      width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;
    }
    .status-completed, .status-success { background: #00a650; }
    .status-failed, .status-error { background: #de350b; }
    .status-running { background: #0065ff; }
    .status-pending { background: #97a0af; }

    /* ── Record header field strip ──────────────────────────── */
    .record-header {
      margin: 0 -24px;
      background: #fff;
      border-bottom: 1px solid #dee2ec;
      display: flex;
      align-items: stretch;
      overflow-x: auto;
    }
    .record-field {
      padding: 12px 20px;
      min-width: 140px;
      flex-shrink: 0;
    }
    .record-divider {
      width: 1px;
      background: #dee2ec;
      flex-shrink: 0;
    }
    .record-label {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: #5e6e82;
      margin-bottom: 4px;
    }
    .record-value { font-size: 13px; font-weight: 500; color: #1d1f2b; }
    .record-link { color: #1d1f2b; text-decoration: none; }
    .record-link:hover { text-decoration: underline; color: #AD4780; }

    /* ── Content area ───────────────────────────────────────── */
    .content-area { padding-top: 20px; }

    /* ── Cards ──────────────────────────────────────────────── */
    .sn-card {
      background: #fff;
      border: 1px solid #dee2ec;
      border-radius: 4px;
      overflow: hidden;
      margin-bottom: 14px;
    }
    .not-found-card { padding: 24px; color: #5e6e82; }
    .sn-card-header {
      padding: 10px 16px;
      border-bottom: 1px solid #dee2ec;
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: #f8f9fb;
    }
    .sn-card-body { padding: 16px; }
    .section-title {
      font-size: 11px;
      font-weight: 700;
      color: #42526e;
      text-transform: uppercase;
      letter-spacing: 0.6px;
    }
    .section-count { font-size: 12px; color: #5e6e82; }

    /* ── Error card ─────────────────────────────────────────── */
    .error-card { border-left: 4px solid #de350b; }
    .error-header-bar { background: #fff8f8; }
    .error-header-inner {
      display: flex; align-items: center; gap: 8px; color: #c62828;
      font-weight: 600; font-size: 13px;
    }
    .error-header-inner mat-icon { font-size: 18px; width: 18px; height: 18px; }
    .error-text {
      margin: 0; font-size: 13px;
      white-space: pre-wrap; word-break: break-word;
      color: #c62828; background: transparent;
    }

    /* ── Warn card ──────────────────────────────────────────── */
    .warn-card { border-left: 4px solid #ff9800; }
    .warn-header-bar { background: #fffaf0; }
    .warn-header-inner { display: flex; align-items: center; gap: 8px; }
    .warn-header-inner mat-icon { font-size: 18px; width: 18px; height: 18px; color: #e65100; }
    .error-list { margin: 0; padding-left: 20px; }
    .error-list li { font-size: 13px; margin-bottom: 4px; color: #5d4037; }

    /* ── Results table ──────────────────────────────────────── */
    .results-table { width: 100%; }

    .locale-chip {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 12px;
      background: #e3f2fd;
      color: #1565c0;
    }
    .locale-chip.source { background: #f3e5f5; color: #6a1b9a; }

    /* ── Detail grid ────────────────────────────────────────── */
    .detail-grid {
      display: grid;
      grid-template-columns: 100px 1fr;
      gap: 10px 16px;
      align-items: start;
    }
    dt { font-weight: 600; font-size: 13px; color: #555; padding-top: 2px; }
    dd { margin: 0; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
    .doc-list { flex-direction: column; align-items: flex-start; gap: 2px; }

    .chip {
      display: inline-block;
      padding: 2px 10px;
      border-radius: 12px;
      font-size: 12px;
      background: #f0f0f0;
      color: #333;
    }
    .mono { font-family: monospace; word-break: break-all; }
    .small { font-size: 12px; }
    .muted { color: #999; font-size: 13px; }
    .param-row { font-size: 13px; }
    .param-name { font-weight: 500; margin-right: 4px; }
    .param-value { color: #555; }
  `]
})
export class JobDetailComponent implements OnInit {
  private destroyRef = inject(DestroyRef);

  job: Job | null = null;
  loading = true;
  resultColumns = ['scenario', 'locale', 'document', 'herettoJobId', 'status'];

  constructor(private route: ActivatedRoute, private jobService: JobService) {}

  ngOnInit() {
    const id = this.route.snapshot.params['id'];
    this.jobService.getById(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: j => { this.job = j; this.loading = false; },
        error: () => { this.loading = false; },
      });
  }

  get duration(): string {
    if (!this.job?.started_at || !this.job?.completed_at) return '—';
    const ms = new Date(this.job.completed_at).getTime() - new Date(this.job.started_at).getTime();
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  }

  get publishResults(): PublishResult[] {
    return this.job?.response_payload?.results ?? [];
  }

  get partialErrors(): string[] {
    return this.job?.response_payload?.errors ?? [];
  }

  get requestScenarios(): string[] {
    return this.job?.request_payload?.scenarios ?? [];
  }

  get requestLocales(): string[] {
    return this.job?.request_payload?.locales ?? [];
  }

  get requestDocuments(): string[] {
    return this.job?.request_payload?.documentIds ?? [];
  }

  get requestParameters(): Record<string, unknown>[] {
    return this.job?.request_payload?.parameters ?? [];
  }

  scenarioDisplay(id: string): string {
    const name = (this.job?.request_payload?.scenarioNames ?? {})[id];
    return name ? `${name} (${id})` : id;
  }

  documentDisplay(id: string): string {
    const name = (this.job?.request_payload?.documentNames ?? {})[id];
    return name ? `${name} (${id})` : id;
  }
}
