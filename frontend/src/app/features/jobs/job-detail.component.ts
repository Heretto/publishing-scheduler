import { Component, OnInit, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatDividerModule } from '@angular/material/divider';
import { JobService, Job, PublishResult } from '../../core/services/job.service';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge.component';

@Component({
  selector: 'app-job-detail',
  standalone: true,
  imports: [
    CommonModule, RouterModule, MatCardModule, MatButtonModule,
    MatProgressSpinnerModule, MatIconModule, MatTableModule,
    MatDividerModule, StatusBadgeComponent,
  ],
  template: `
    <div class="loading-wrap" *ngIf="loading">
      <mat-spinner diameter="40"></mat-spinner>
    </div>

    <mat-card *ngIf="!loading && !job">
      <mat-card-content>Job not found.</mat-card-content>
    </mat-card>

    <ng-container *ngIf="job">
      <!-- nav -->
      <div class="nav-row">
        <a mat-button routerLink="/jobs">
          <mat-icon>arrow_back</mat-icon> Job History
        </a>
        <a mat-button [routerLink]="['/schedules', job.schedule_id, 'edit']" *ngIf="job.schedule_id">
          <mat-icon>schedule</mat-icon> {{ job.schedule_name || 'Schedule' }}
        </a>
      </div>

      <!-- header -->
      <div class="page-header">
        <app-status-badge [status]="job.status" class="status-large"></app-status-badge>
        <div class="header-meta">
          <h1>Job Run</h1>
          <span class="trigger-label">
            {{ job.trigger_type === 'manual' ? 'Triggered manually' : 'Triggered by schedule' }}
            &nbsp;·&nbsp;
            {{ job.started_at | date:'medium' }}
          </span>
        </div>
      </div>

      <!-- summary cards -->
      <div class="summary-row">
        <mat-card class="summary-card">
          <mat-card-content>
            <div class="summary-label">Schedule</div>
            <div class="summary-value">
              <a [routerLink]="['/schedules', job.schedule_id, 'edit']" *ngIf="job.schedule_id">
                {{ job.schedule_name || job.schedule_id }}
              </a>
              <span *ngIf="!job.schedule_id">—</span>
            </div>
          </mat-card-content>
        </mat-card>
        <mat-card class="summary-card">
          <mat-card-content>
            <div class="summary-label">Started</div>
            <div class="summary-value">{{ job.started_at | date:'HH:mm:ss, MMM d' }}</div>
          </mat-card-content>
        </mat-card>
        <mat-card class="summary-card">
          <mat-card-content>
            <div class="summary-label">Completed</div>
            <div class="summary-value">
              {{ job.completed_at ? (job.completed_at | date:'HH:mm:ss, MMM d') : '—' }}
            </div>
          </mat-card-content>
        </mat-card>
        <mat-card class="summary-card">
          <mat-card-content>
            <div class="summary-label">Duration</div>
            <div class="summary-value">{{ duration }}</div>
          </mat-card-content>
        </mat-card>
      </div>

      <!-- error banner -->
      <mat-card class="error-card" *ngIf="job.error">
        <mat-card-content>
          <div class="error-header">
            <mat-icon>error_outline</mat-icon>
            <strong>Job Failed</strong>
          </div>
          <pre class="error-text">{{ job.error }}</pre>
        </mat-card-content>
      </mat-card>

      <!-- publish results table -->
      <mat-card class="section-card" *ngIf="publishResults.length > 0">
        <mat-card-header>
          <mat-card-title>Publish Results</mat-card-title>
          <mat-card-subtitle>
            {{ publishResults.length }} publish operation{{ publishResults.length !== 1 ? 's' : '' }}
          </mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
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
        </mat-card-content>
      </mat-card>

      <!-- partial failures -->
      <mat-card class="section-card warn-card" *ngIf="partialErrors.length > 0">
        <mat-card-header>
          <mat-card-title>
            <mat-icon class="warn-icon">warning_amber</mat-icon>
            Partial Failures
          </mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <ul class="error-list">
            <li *ngFor="let e of partialErrors">{{ e }}</li>
          </ul>
        </mat-card-content>
      </mat-card>

      <!-- request details -->
      <mat-card class="section-card">
        <mat-card-header>
          <mat-card-title>Request Details</mat-card-title>
        </mat-card-header>
        <mat-card-content>
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
        </mat-card-content>
      </mat-card>
    </ng-container>
  `,
  styles: [`
    .loading-wrap { display: flex; justify-content: center; padding: 48px; }

    .nav-row { display: flex; gap: 4px; margin-bottom: 12px; }

    .page-header {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 20px;
    }
    .page-header h1 { margin: 0; font-size: 24px; }
    .status-large { transform: scale(1.2); transform-origin: left center; flex-shrink: 0; }
    .header-meta { display: flex; flex-direction: column; gap: 2px; margin-left: 28px; }
    .trigger-label { font-size: 13px; color: #666; }

    .summary-row {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 16px;
    }
    .summary-card mat-card-content { padding: 12px 16px; }
    .summary-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: .06em;
      color: #888;
      margin-bottom: 4px;
    }
    .summary-value { font-size: 15px; font-weight: 500; }
    .summary-value a { color: inherit; text-decoration: none; }
    .summary-value a:hover { text-decoration: underline; }

    .section-card { margin-bottom: 16px; }

    .error-card {
      margin-bottom: 16px;
      border-left: 4px solid #f44336;
      background: #fff8f8;
    }
    .error-header {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #c62828;
      margin-bottom: 8px;
    }
    .error-header mat-icon { font-size: 20px; width: 20px; height: 20px; }
    .error-text {
      margin: 0;
      font-size: 13px;
      white-space: pre-wrap;
      word-break: break-word;
      color: #c62828;
      background: transparent;
    }

    .warn-card { border-left: 4px solid #ff9800; background: #fffaf0; }
    .warn-icon {
      color: #e65100;
      font-size: 20px;
      width: 20px;
      height: 20px;
      vertical-align: middle;
      margin-right: 4px;
    }
    .error-list { margin: 0; padding-left: 20px; }
    .error-list li { font-size: 13px; margin-bottom: 4px; color: #5d4037; }

    .results-table { width: 100%; margin-top: 8px; }

    .locale-chip {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 12px;
      background: #e3f2fd;
      color: #1565c0;
    }
    .locale-chip.source { background: #f3e5f5; color: #6a1b9a; }

    .detail-grid {
      display: grid;
      grid-template-columns: 100px 1fr;
      gap: 10px 16px;
      align-items: start;
      margin-top: 8px;
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
  `],
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
