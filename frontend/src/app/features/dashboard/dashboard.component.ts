import { Component, OnInit, DestroyRef, inject, Inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { forkJoin, take } from 'rxjs';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { ScheduleService, Schedule } from '../../core/services/schedule.service';
import { JobService, Job } from '../../core/services/job.service';
import { DashboardService, DailyVolume, DashboardSummary, LocaleStat } from '../../core/services/dashboard.service';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge.component';
import { CronDisplayComponent } from '../../shared/components/cron-display/cron-display.component';

@Component({
  selector: 'app-maps-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Maps — {{ data.scheduleName }}</h2>
    <mat-dialog-content>
      <ul class="maps-list">
        <li *ngFor="let name of data.maps">{{ name }}</li>
      </ul>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Close</button>
    </mat-dialog-actions>
  `,
  styles: [`.maps-list { margin: 8px 0 0; padding-left: 20px; } li { padding: 4px 0; font-size: 0.9rem; }`],
})
class MapsDialogComponent {
  constructor(@Inject(MAT_DIALOG_DATA) public data: { scheduleName: string; maps: string[] }) {}
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule, RouterModule, MatCardModule, MatButtonModule, MatIconModule,
    MatTableModule, MatProgressSpinnerModule, MatTooltipModule, MatDialogModule,
    StatusBadgeComponent, CronDisplayComponent,
  ],
  template: `
    <h1>Dashboard</h1>

    <div class="stats-row" role="region" aria-label="Statistics">
      <mat-card>
        <mat-card-content>
          <div class="stat-value">{{ activeSchedules }}</div>
          <div class="stat-label">Active Schedules</div>
        </mat-card-content>
      </mat-card>
      <mat-card>
        <mat-card-content>
          <div class="stat-value">{{ totalSchedules }}</div>
          <div class="stat-label">Total Schedules</div>
        </mat-card-content>
      </mat-card>
      <mat-card>
        <mat-card-content>
          <div class="stat-value">{{ totalJobs }}</div>
          <div class="stat-label">Total Jobs</div>
        </mat-card-content>
      </mat-card>
      <mat-card>
        <mat-card-content>
          <div class="stat-value"
            [class.rate-good]="successRate >= 80"
            [class.rate-warn]="successRate >= 50 && successRate < 80"
            [class.rate-bad]="successRate < 50">
            {{ recentJobs.length ? successRate + '%' : '—' }}
          </div>
          <div class="stat-label">Success Rate (recent)</div>
        </mat-card-content>
      </mat-card>
    </div>

    <mat-spinner *ngIf="loading" diameter="40"></mat-spinner>

    <ng-container *ngIf="!loading">

      <!-- Needs Attention -->
      <mat-card class="attention-card" *ngIf="needsAttentionSchedules.length">
        <mat-card-content>
          <div class="alert-header">
            <mat-icon class="attention-icon">warning</mat-icon>
            <span class="alert-title">Needs Attention</span>
          </div>
          <div *ngFor="let s of needsAttentionSchedules" class="alert-row">
            <a [routerLink]="['/schedules', s.id, 'edit']" class="table-link">{{ s.name }}</a>
            <span class="failure-count">{{ s.consecutive_failures ?? 0 }} consecutive failure{{ (s.consecutive_failures ?? 0) !== 1 ? 's' : '' }}</span>
            <span *ngIf="!s.enabled" class="badge-disabled">Auto-disabled</span>
          </div>
        </mat-card-content>
      </mat-card>

      <!-- Stale Schedules -->
      <mat-card class="stale-card" *ngIf="staleSchedules.length">
        <mat-card-content>
          <div class="alert-header">
            <mat-icon class="stale-icon">schedule</mat-icon>
            <span class="alert-title">Stale Schedules</span>
          </div>
          <p class="stale-note">These enabled schedules haven't run recently. Check their cron configuration.</p>
          <div *ngFor="let s of staleSchedules" class="alert-row">
            <a [routerLink]="['/schedules', s.id, 'edit']" class="table-link">{{ s.name }}</a>
            <span *ngIf="s.last_run_at" class="muted-text">Last run: {{ s.last_run_at | date:'short' }}</span>
            <span *ngIf="!s.last_run_at" class="muted-text">Never run</span>
          </div>
        </mat-card-content>
      </mat-card>

      <!-- Active Schedules -->
      <h2>Active Schedules</h2>
      <mat-card *ngIf="schedules.length > 0; else noSchedules">
        <table mat-table [dataSource]="schedules.slice(0, 5)" aria-label="Active schedules">
          <ng-container matColumnDef="name">
            <th mat-header-cell *matHeaderCellDef>Name</th>
            <td mat-cell *matCellDef="let s">
              <a [routerLink]="['/schedules']" class="table-link">{{ s.name }}</a>
            </td>
          </ng-container>
          <ng-container matColumnDef="description">
            <th mat-header-cell *matHeaderCellDef>Description</th>
            <td mat-cell *matCellDef="let s">{{ s.description }}</td>
          </ng-container>
          <ng-container matColumnDef="mapName">
            <th mat-header-cell *matHeaderCellDef>Map</th>
            <td mat-cell *matCellDef="let s">
              <div class="map-cell">
                <span class="map-cell-name">{{ scheduleDocNames(s) }}</span>
                <button *ngIf="scheduleAllDocNames(s).length > 1"
                  class="map-more-btn"
                  matTooltip="Click to view all maps"
                  (click)="openMapsDialog(s); $event.stopPropagation()">
                  +{{ scheduleAllDocNames(s).length - 1 }} more
                </button>
              </div>
            </td>
          </ng-container>
          <ng-container matColumnDef="locales">
            <th mat-header-cell *matHeaderCellDef>Locales</th>
            <td mat-cell *matCellDef="let s" class="col-truncate">{{ scheduleLocales(s) }}</td>
          </ng-container>
          <ng-container matColumnDef="cron">
            <th mat-header-cell *matHeaderCellDef>Schedule</th>
            <td mat-cell *matCellDef="let s">
              <app-cron-display [expression]="s.cron_expression"></app-cron-display>
            </td>
          </ng-container>
          <ng-container matColumnDef="lastRun">
            <th mat-header-cell *matHeaderCellDef>Last Run</th>
            <td mat-cell *matCellDef="let s">
              <app-status-badge *ngIf="s.last_run_status" [status]="s.last_run_status"></app-status-badge>
              <span *ngIf="!s.last_run_status">Never</span>
            </td>
          </ng-container>
          <ng-container matColumnDef="nextRun">
            <th mat-header-cell *matHeaderCellDef>Next Run</th>
            <td mat-cell *matCellDef="let s">
              <span *ngIf="s.next_run_time">{{ s.next_run_time | date:'short' }}</span>
              <span *ngIf="!s.next_run_time">—</span>
            </td>
          </ng-container>
          <ng-container matColumnDef="successRate">
            <th mat-header-cell *matHeaderCellDef>Success %</th>
            <td mat-cell *matCellDef="let s">
              <ng-container *ngIf="scheduleSuccessRate(s.id) !== null; else noRate">
                <span class="rate-badge"
                  [class.rate-good]="scheduleSuccessRate(s.id)! >= 80"
                  [class.rate-warn]="scheduleSuccessRate(s.id)! >= 50 && scheduleSuccessRate(s.id)! < 80"
                  [class.rate-bad]="scheduleSuccessRate(s.id)! < 50">
                  {{ scheduleSuccessRate(s.id) }}%
                </span>
              </ng-container>
              <ng-template #noRate><span class="muted-text">—</span></ng-template>
            </td>
          </ng-container>
          <ng-container matColumnDef="scheduleActions">
            <th mat-header-cell *matHeaderCellDef></th>
            <td mat-cell *matCellDef="let s">
              <button mat-icon-button
                [disabled]="!!triggeringId"
                (click)="triggerNow(s)"
                matTooltip="Run Now"
                aria-label="Run now">
                <mat-spinner *ngIf="triggeringId === s.id" diameter="20"></mat-spinner>
                <mat-icon *ngIf="triggeringId !== s.id">play_arrow</mat-icon>
              </button>
            </td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="scheduleColumns"></tr>
          <tr mat-row *matRowDef="let row; columns: scheduleColumns"></tr>
        </table>
      </mat-card>
      <ng-template #noSchedules>
        <mat-card>
          <mat-card-content>
            <p>No schedules yet. <a routerLink="/schedules/new">Create one</a></p>
          </mat-card-content>
        </mat-card>
      </ng-template>

      <!-- Recent Jobs -->
      <h2>
        Recent Jobs
        <span *ngIf="selectedDate" class="date-filter-chip">
          {{ selectedDate | date:'mediumDate' }}
          <button mat-icon-button class="chip-clear" (click)="selectedDate = null" aria-label="Clear date filter">
            <mat-icon>close</mat-icon>
          </button>
        </span>
      </h2>
      <mat-card *ngIf="filteredJobs.length > 0; else noJobs">
        <table mat-table [dataSource]="filteredJobs" aria-label="Recent jobs">
          <ng-container matColumnDef="status">
            <th mat-header-cell *matHeaderCellDef>Status</th>
            <td mat-cell *matCellDef="let j"><app-status-badge [status]="j.status"></app-status-badge></td>
          </ng-container>
          <ng-container matColumnDef="schedule">
            <th mat-header-cell *matHeaderCellDef>Schedule</th>
            <td mat-cell *matCellDef="let j">
              <a [routerLink]="['/schedules', j.schedule_id, 'edit']" class="table-link">
                {{ j.schedule_name || j.schedule_id }}
              </a>
            </td>
          </ng-container>
          <ng-container matColumnDef="mapName">
            <th mat-header-cell *matHeaderCellDef>Map</th>
            <td mat-cell *matCellDef="let j">
              <div class="map-cell">
                <span class="map-cell-name">{{ jobDocNames(j) }}</span>
                <button *ngIf="jobDocNamesCount(j) > 1"
                  class="map-more-btn"
                  matTooltip="Click to view all maps"
                  (click)="openJobMapsDialog(j); $event.stopPropagation()">
                  +{{ jobDocNamesCount(j) - 1 }} more
                </button>
              </div>
            </td>
          </ng-container>
          <ng-container matColumnDef="locales">
            <th mat-header-cell *matHeaderCellDef>Locales</th>
            <td mat-cell *matCellDef="let j" class="col-truncate">{{ jobLocales(j) }}</td>
          </ng-container>
          <ng-container matColumnDef="trigger">
            <th mat-header-cell *matHeaderCellDef>Trigger</th>
            <td mat-cell *matCellDef="let j">{{ j.trigger_type }}</td>
          </ng-container>
          <ng-container matColumnDef="startedAt">
            <th mat-header-cell *matHeaderCellDef>Started</th>
            <td mat-cell *matCellDef="let j">{{ j.started_at | date:'short' }}</td>
          </ng-container>
          <ng-container matColumnDef="jobActions">
            <th mat-header-cell *matHeaderCellDef></th>
            <td mat-cell *matCellDef="let j">
              <a mat-button [routerLink]="['/jobs', j.id]">Details</a>
            </td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="['status', 'schedule', 'mapName', 'locales', 'trigger', 'startedAt', 'jobActions']"></tr>
          <tr mat-row *matRowDef="let row; columns: ['status', 'schedule', 'mapName', 'locales', 'trigger', 'startedAt', 'jobActions']"></tr>
        </table>
      </mat-card>
      <ng-template #noJobs>
        <mat-card>
          <mat-card-content>
            <p *ngIf="selectedDate">
              No recent jobs found for {{ selectedDate | date:'mediumDate' }}.
              <a style="cursor:pointer;color:inherit" (click)="selectedDate = null">Clear filter</a>
            </p>
            <p *ngIf="!selectedDate">No jobs have run yet.</p>
          </mat-card-content>
        </mat-card>
      </ng-template>

      <!-- Daily Activity Sparkline -->
      <ng-container *ngIf="summary?.daily_volumes?.length">
        <h2>Daily Activity</h2>
        <p class="section-subtitle">Last 14 days · click a bar to filter Recent Jobs</p>
        <mat-card>
          <mat-card-content>
            <!-- Summary row -->
            <div class="sparkline-summary">
              <span class="sparkline-summary-total">{{ periodTotalJobs }} jobs</span>
              <span class="sparkline-summary-sep">·</span>
              <span [class.rate-good]="(periodSuccessRate ?? 0) >= 80"
                    [class.rate-warn]="(periodSuccessRate ?? 0) >= 50 && (periodSuccessRate ?? 0) < 80"
                    [class.rate-bad]="(periodSuccessRate ?? 0) < 50">
                {{ periodSuccessRate !== null ? periodSuccessRate + '% success' : '—' }}
              </span>
              <span class="sparkline-summary-sep">·</span>
              <span class="sparkline-summary-failed">{{ periodFailedJobs }} failed</span>
            </div>
            <!-- Chart -->
            <svg width="100%" height="60" viewBox="0 0 420 60" preserveAspectRatio="none">
              <!-- 50% reference line -->
              <line x1="0" y1="35" x2="420" y2="35" stroke="#e8e8e8" stroke-width="0.75"></line>
              <ng-container *ngFor="let d of summary!.daily_volumes; let i = index">
                <!-- Weekend tint -->
                <rect *ngIf="isWeekend(d.date)"
                  [attr.x]="i * 30" y="0" width="30" height="60" fill="#f5f5f5"></rect>
                <!-- Succeeded bar (green, bottom portion) -->
                <rect
                  [attr.x]="i * 30 + 2"
                  [attr.y]="58 - barHeightSucceeded(d)"
                  width="26"
                  [attr.height]="barHeightSucceeded(d)"
                  fill="#43a047">
                </rect>
                <!-- Failed bar (red, stacked above succeeded) -->
                <rect *ngIf="d.failed > 0"
                  [attr.x]="i * 30 + 2"
                  [attr.y]="58 - barHeightTotal(d)"
                  width="26"
                  [attr.height]="barHeightTotal(d) - barHeightSucceeded(d)"
                  fill="#e53935">
                </rect>
                <!-- Selected-day outline -->
                <rect *ngIf="selectedDate === d.date"
                  [attr.x]="i * 30 + 1" y="1" width="28" height="57"
                  fill="none" stroke="#1976d2" stroke-width="1.5" rx="2">
                </rect>
                <!-- Invisible clickable overlay with tooltip -->
                <rect
                  [attr.x]="i * 30" y="0" width="30" height="60"
                  fill="transparent"
                  class="sparkline-col-hit"
                  (click)="selectDay(d.date)"
                  [matTooltip]="d.date + ': ' + d.total + ' jobs · ' + d.succeeded + ' succeeded · ' + d.failed + ' failed'">
                </rect>
              </ng-container>
            </svg>
            <!-- Date labels -->
            <div class="sparkline-labels">
              <span>{{ summary!.daily_volumes[0]?.date | date:'M/d' }}</span>
              <span>{{ summary!.daily_volumes[6]?.date | date:'M/d' }}</span>
              <span>{{ summary!.daily_volumes[13]?.date | date:'M/d' }}</span>
            </div>
            <!-- Legend -->
            <div class="chart-legend">
              <span class="legend-swatch" style="background:#43a047"></span><span>Succeeded</span>
              <span class="legend-swatch" style="background:#e53935; margin-left:12px"></span><span>Failed</span>
              <span class="legend-weekend">&#9618; Weekend</span>
            </div>
          </mat-card-content>
        </mat-card>
      </ng-container>

      <!-- Locale Breakdown (commented out — may restore later)
      <ng-container *ngIf="topLocales.length">
        <h2>Locale Breakdown</h2>
        <p class="section-subtitle">Last 30 days · bar width = relative volume</p>
        <mat-card>
          <mat-card-content>
            <div class="chart-legend" style="margin-bottom:10px">
              <span class="legend-swatch" style="background:#43a047"></span><span>Succeeded</span>
              <span class="legend-swatch" style="background:#e53935; margin-left:12px"></span><span>Failed</span>
            </div>
            <div *ngFor="let locale of topLocales" class="locale-block">
              <div class="locale-row">
                <span class="locale-code">{{ locale.code }}</span>
                <span class="locale-bar-wrap">
                  <span class="locale-bar-succeeded" [style.width.%]="localeBarSucceededPct(locale)"></span>
                  <span class="locale-bar-failed" [style.width.%]="localeBarFailedPct(locale)"></span>
                </span>
                <span class="locale-count">{{ locale.total }}</span>
                <span class="locale-stat-ok">✓ {{ locale.succeeded }}</span>
                <span class="locale-stat-fail">✗ {{ locale.failed }}</span>
              </div>
              <div class="locale-schedules-row" *ngIf="locale.top_schedules.length">
                <mat-icon class="locale-sched-icon">schedule</mat-icon>
                <span>{{ locale.top_schedules[0].name }}</span>
                <span *ngIf="locale.top_schedules.length > 1" class="muted-text">
                  +{{ locale.top_schedules.length - 1 }} more
                </span>
              </div>
            </div>
          </mat-card-content>
        </mat-card>
      </ng-container>
      -->

    </ng-container>

    <mat-card *ngIf="errorMessage" class="error-card">
      <mat-card-content>
        <mat-icon>warning</mat-icon> {{ errorMessage }}
      </mat-card-content>
    </mat-card>
  `,
  styles: [`
    .stats-row { display: flex; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }
    .stats-row mat-card { flex: 1; text-align: center; min-width: 120px; }
    .stat-value { font-size: 2rem; font-weight: bold; }
    .stat-label { color: #666; }
    .rate-good { color: #2e7d32; }
    .rate-warn { color: #e65100; }
    .rate-bad { color: #c62828; }
    h2 { margin-top: 24px; }
    .error-card { margin-top: 16px; color: #f44336; }
    .table-link { color: inherit; text-decoration: none; font-weight: 500; }
    .table-link:hover { text-decoration: underline; }
    .muted-text { color: #888; font-size: 0.875rem; }

    /* Needs Attention */
    .attention-card { margin-bottom: 16px; border-left: 4px solid #fb8c00; }
    .stale-card { margin-bottom: 16px; border-left: 4px solid #90a4ae; }
    .alert-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
    .alert-title { font-weight: 600; font-size: 1rem; }
    .attention-icon { color: #fb8c00; }
    .stale-icon { color: #90a4ae; }
    .alert-row { display: flex; align-items: center; gap: 12px; padding: 4px 0; }
    .failure-count { color: #e65100; font-size: 0.875rem; }
    .badge-disabled { background: #e0e0e0; color: #555; font-size: 0.75rem; padding: 2px 6px; border-radius: 4px; }
    .stale-note { margin: 0 0 8px; color: #666; font-size: 0.875rem; }

    /* Rate badge */
    .rate-badge { padding: 2px 8px; border-radius: 12px; font-size: 0.875rem; font-weight: 600; }
    .rate-badge.rate-good { background: #e8f5e9; color: #2e7d32; }
    .rate-badge.rate-warn { background: #fff3e0; color: #e65100; }
    .rate-badge.rate-bad { background: #ffebee; color: #c62828; }

    /* Sparkline */
    .sparkline-summary { display: flex; align-items: center; gap: 6px; font-size: 0.85rem; margin-bottom: 8px; }
    .sparkline-summary-total { font-weight: 600; }
    .sparkline-summary-sep { color: #ccc; }
    .sparkline-summary-failed { color: #c62828; }
    .sparkline-labels { display: flex; justify-content: space-between; font-size: 0.75rem; color: #888; margin-top: 4px; }
    .sparkline-col-hit { cursor: pointer; }

    /* Shared chart legend */
    .chart-legend { display: flex; align-items: center; gap: 4px; font-size: 0.75rem; color: #555; margin-top: 6px; flex-wrap: wrap; }
    .legend-swatch { display: inline-block; width: 10px; height: 10px; border-radius: 2px; flex-shrink: 0; }
    .legend-weekend { margin-left: 12px; color: #bbb; }

    /* Recent jobs date-filter chip */
    .date-filter-chip {
      display: inline-flex; align-items: center; vertical-align: middle;
      font-size: 0.8rem; font-weight: normal;
      background: #e3f2fd; color: #1565c0;
      border-radius: 12px; padding: 2px 4px 2px 10px; margin-left: 10px;
    }
    .chip-clear { width: 20px !important; height: 20px !important; line-height: 20px !important; padding: 0 !important; }
    .chip-clear mat-icon { font-size: 14px; width: 14px; height: 14px; line-height: 14px; }

    /* Locale Breakdown */
    .locale-block { margin-bottom: 8px; }
    .locale-row { display: flex; align-items: center; gap: 8px; }
    .locale-code { font-family: monospace; font-size: 0.875rem; width: 72px; flex-shrink: 0; }
    .locale-bar-wrap { flex: 1; background: #f0f0f0; border-radius: 4px; height: 10px; overflow: hidden; display: flex; }
    .locale-bar-succeeded { height: 100%; background: #43a047; }
    .locale-bar-failed { height: 100%; background: #e53935; }
    .locale-count { width: 36px; text-align: right; font-size: 0.8rem; color: #555; flex-shrink: 0; }
    .locale-stat-ok { width: 52px; font-size: 0.8rem; color: #2e7d32; flex-shrink: 0; }
    .locale-stat-fail { width: 44px; font-size: 0.8rem; color: #c62828; flex-shrink: 0; }
    .locale-schedules-row { display: flex; align-items: center; gap: 4px; padding-left: 80px; font-size: 0.75rem; color: #999; margin-top: 2px; }
    .locale-sched-icon { font-size: 12px; width: 12px; height: 12px; line-height: 12px; color: #bbb; }

    /* Truncated table cells (Locales, job Map) */
    .col-truncate { max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    /* Schedule Map cell with overflow chip */
    .map-cell { display: flex; align-items: center; gap: 6px; max-width: 210px; }
    .map-cell-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0; font-size: 0.875rem; }
    .map-more-btn {
      background: #e8eaf6; color: #3949ab; border: none; border-radius: 10px;
      padding: 2px 8px; font-size: 0.72rem; font-weight: 500; cursor: pointer;
      white-space: nowrap; flex-shrink: 0; line-height: 1.6; font-family: inherit;
    }
    .map-more-btn:hover { background: #c5cae9; }

    /* Section subtitle */
    .section-subtitle { color: #888; font-size: 0.8rem; margin: -16px 0 8px; }
  `],
})
export class DashboardComponent implements OnInit {
  private destroyRef = inject(DestroyRef);
  private dialog = inject(MatDialog);

  schedules: Schedule[] = [];
  recentJobs: Job[] = [];
  totalJobs = 0;
  summary: DashboardSummary | null = null;
  triggeringId: string | null = null;
  loading = true;
  errorMessage = '';
  selectedDate: string | null = null;
  documentNameCache: Record<string, string> = {};
  scheduleLatestJobCache: Record<string, Job> = {};

  readonly scheduleColumns = ['name', 'description', 'mapName', 'locales', 'cron', 'lastRun', 'nextRun', 'successRate', 'scheduleActions'];

  get activeSchedules() { return this.schedules.filter(s => s.enabled).length; }
  get totalSchedules() { return this.schedules.length; }

  get successRate(): number {
    if (!this.recentJobs.length) return 0;
    const succeeded = this.recentJobs.filter(j => j.status === 'completed' || j.status === 'success').length;
    return Math.round((succeeded / this.recentJobs.length) * 100);
  }

  get needsAttentionSchedules(): Schedule[] {
    return this.schedules.filter(s => (s.consecutive_failures ?? 0) > 0);
  }

  get staleSchedules(): Schedule[] {
    const now = Date.now();
    return this.schedules.filter(s => {
      if (!s.enabled) return false;
      if (!s.last_run_at) return true;
      if (!s.next_run_time) return false;
      const interval = new Date(s.next_run_time).getTime() - now;
      if (interval <= 0) return false;
      return (now - new Date(s.last_run_at).getTime()) > interval * 3;
    });
  }

  scheduleSuccessRate(id: string): number | null {
    const stat = this.summary?.per_schedule_stats[id];
    if (!stat || stat.total === 0) return null;
    return Math.round((stat.succeeded / stat.total) * 100);
  }

  scheduleAllDocNames(s: Schedule): string[] {
    if (s.document_ids?.length) {
      return s.document_ids.map(id => this.documentNameCache[id] ?? id);
    }
    if (s.folder_ids?.length) {
      const latestJob = this.scheduleLatestJobCache[s.id];
      return Object.values(latestJob?.request_payload?.documentNames ?? {});
    }
    return [];
  }

  scheduleDocNames(s: Schedule): string {
    const names = this.scheduleAllDocNames(s);
    if (!names.length) return '—';
    return names[0];
  }

  openMapsDialog(s: Schedule): void {
    this.dialog.open(MapsDialogComponent, {
      data: { scheduleName: s.name, maps: this.scheduleAllDocNames(s) },
      width: '420px',
    });
  }

  scheduleLocales(s: Schedule): string {
    return s.locales?.length ? s.locales.join(', ') : '—';
  }

  jobDocNames(j: Job): string {
    const names = Object.values(j.request_payload?.documentNames ?? {});
    if (!names.length) return '—';
    return names[0];
  }

  jobDocNamesCount(j: Job): number {
    return Object.keys(j.request_payload?.documentNames ?? {}).length;
  }

  openJobMapsDialog(j: Job): void {
    this.dialog.open(MapsDialogComponent, {
      data: {
        scheduleName: j.schedule_name ?? j.schedule_id,
        maps: Object.values(j.request_payload?.documentNames ?? {}),
      },
      width: '420px',
    });
  }

  jobLocales(j: Job): string {
    return j.request_payload?.locales?.join(', ') || '—';
  }

  get topLocales(): (LocaleStat & { code: string })[] {
    if (!this.summary) return [];
    return Object.entries(this.summary.top_locales)
      .map(([code, stat]) => ({ code, ...stat }))
      .sort((a, b) => b.total - a.total);
  }

  get sparkMaxJobs(): number {
    return Math.max(...(this.summary?.daily_volumes.map(d => d.total) ?? [1]), 1);
  }

  barHeightTotal(d: DailyVolume): number {
    return Math.max(2, Math.round((d.total / this.sparkMaxJobs) * 46));
  }

  barHeightSucceeded(d: DailyVolume): number {
    if (d.total === 0) return 0;
    return Math.max(0, Math.round((d.succeeded / this.sparkMaxJobs) * 46));
  }

  isWeekend(dateStr: string): boolean {
    const day = new Date(dateStr + 'T12:00:00').getDay();
    return day === 0 || day === 6;
  }

  selectDay(date: string): void {
    this.selectedDate = this.selectedDate === date ? null : date;
  }

  get filteredJobs(): Job[] {
    if (!this.selectedDate) return this.recentJobs;
    return this.recentJobs.filter(j => {
      if (!j.started_at) return false;
      return new Date(j.started_at).toISOString().slice(0, 10) === this.selectedDate;
    });
  }

  get totalLocaleJobs(): number {
    return this.topLocales.reduce((sum, l) => sum + l.total, 0);
  }

  localePercent(locale: { total: number }): number {
    if (!this.totalLocaleJobs) return 0;
    return Math.round((locale.total / this.totalLocaleJobs) * 100);
  }

  localeTooltip(locale: LocaleStat & { code: string }): string {
    const scheduleList = locale.top_schedules.map(s => `${s.name} (${s.count})`).join(', ');
    const parts = [`${locale.succeeded} succeeded`, `${locale.failed} failed`];
    if (scheduleList) parts.push(`Schedules: ${scheduleList}`);
    return parts.join(' · ');
  }

  localeBarSucceededPct(locale: LocaleStat): number {
    const max = this.topLocales[0]?.total || 1;
    return (locale.succeeded / max) * 100;
  }

  localeBarFailedPct(locale: LocaleStat): number {
    const max = this.topLocales[0]?.total || 1;
    return (locale.failed / max) * 100;
  }

  get periodTotalJobs(): number {
    return this.summary?.daily_volumes.reduce((s, d) => s + d.total, 0) ?? 0;
  }

  get periodSucceededJobs(): number {
    return this.summary?.daily_volumes.reduce((s, d) => s + d.succeeded, 0) ?? 0;
  }

  get periodFailedJobs(): number {
    return this.summary?.daily_volumes.reduce((s, d) => s + d.failed, 0) ?? 0;
  }

  get periodSuccessRate(): number | null {
    if (!this.periodTotalJobs) return null;
    return Math.round((this.periodSucceededJobs / this.periodTotalJobs) * 100);
  }

  constructor(
    private scheduleService: ScheduleService,
    private jobService: JobService,
    private dashboardService: DashboardService,
  ) {}

  ngOnInit() {
    forkJoin({
      schedules: this.scheduleService.getAll(),
      jobs: this.jobService.getAll({ limit: '30' }),
      summary: this.dashboardService.getSummary(),
    }).pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ schedules, jobs, summary }) => {
          this.schedules = schedules;
          this.recentJobs = jobs.data;
          this.totalJobs = jobs.total;
          this.summary = summary;
          for (const job of jobs.data) {
            Object.assign(this.documentNameCache, job.request_payload?.documentNames ?? {});
            if (!this.scheduleLatestJobCache[job.schedule_id]) {
              this.scheduleLatestJobCache[job.schedule_id] = job;
            }
          }
          this.loading = false;
        },
        error: () => {
          this.loading = false;
          this.errorMessage = 'Failed to load dashboard';
        },
      });
  }

  triggerNow(s: Schedule) {
    if (this.triggeringId) return;
    this.triggeringId = s.id;
    this.scheduleService.trigger(s.id).subscribe({
      next: () => {
        this.triggeringId = null;
        this.jobService.getAll({ limit: '30' })
          .pipe(take(1))
          .subscribe(r => {
            this.recentJobs = r.data;
            this.totalJobs = r.total;
            this.scheduleLatestJobCache = {};
            for (const job of r.data) {
              Object.assign(this.documentNameCache, job.request_payload?.documentNames ?? {});
              if (!this.scheduleLatestJobCache[job.schedule_id]) {
                this.scheduleLatestJobCache[job.schedule_id] = job;
              }
            }
          });
      },
      error: () => { this.triggeringId = null; },
    });
  }
}
