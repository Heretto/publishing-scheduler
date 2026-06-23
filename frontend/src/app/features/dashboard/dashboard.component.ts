import { Component, OnInit, DestroyRef, inject } from '@angular/core';
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
import { ScheduleService, Schedule } from '../../core/services/schedule.service';
import { JobService, Job } from '../../core/services/job.service';
import { DashboardService, DailyVolume, DashboardSummary } from '../../core/services/dashboard.service';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge.component';
import { CronDisplayComponent } from '../../shared/components/cron-display/cron-display.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule, RouterModule, MatCardModule, MatButtonModule, MatIconModule,
    MatTableModule, MatProgressSpinnerModule, MatTooltipModule,
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
      <h2>Recent Jobs</h2>
      <mat-card *ngIf="recentJobs.length > 0; else noJobs">
        <table mat-table [dataSource]="recentJobs" aria-label="Recent jobs">
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
          <tr mat-header-row *matHeaderRowDef="['status', 'schedule', 'trigger', 'startedAt', 'jobActions']"></tr>
          <tr mat-row *matRowDef="let row; columns: ['status', 'schedule', 'trigger', 'startedAt', 'jobActions']"></tr>
        </table>
      </mat-card>
      <ng-template #noJobs>
        <mat-card>
          <mat-card-content>
            <p>No jobs have run yet.</p>
          </mat-card-content>
        </mat-card>
      </ng-template>

      <!-- Daily Activity Sparkline -->
      <ng-container *ngIf="summary?.daily_volumes?.length">
        <h2>Daily Activity</h2>
        <mat-card>
          <mat-card-content>
            <svg width="100%" height="60" viewBox="0 0 420 60" preserveAspectRatio="none">
              <ng-container *ngFor="let d of summary!.daily_volumes; let i = index">
                <rect
                  [attr.x]="i * 30 + 2"
                  [attr.y]="58 - barHeight(d)"
                  width="26"
                  [attr.height]="barHeight(d)"
                  [attr.fill]="d.failed === 0 ? '#43a047' : '#fb8c00'"
                  [matTooltip]="d.date + ': ' + d.total + ' total, ' + d.succeeded + ' ok, ' + d.failed + ' failed'"
                ></rect>
              </ng-container>
            </svg>
            <div class="sparkline-labels">
              <span>{{ summary!.daily_volumes[0]?.date | date:'M/d' }}</span>
              <span>{{ summary!.daily_volumes[6]?.date | date:'M/d' }}</span>
              <span>{{ summary!.daily_volumes[13]?.date | date:'M/d' }}</span>
            </div>
          </mat-card-content>
        </mat-card>
      </ng-container>

      <!-- Locale Breakdown -->
      <ng-container *ngIf="topLocales.length">
        <h2>Locale Breakdown</h2>
        <mat-card>
          <mat-card-content>
            <div *ngFor="let locale of topLocales" class="locale-row">
              <span class="locale-code">{{ locale.code }}</span>
              <span class="locale-bar-wrap">
                <span class="locale-bar" [style.width.%]="(locale.count / topLocales[0].count) * 100"></span>
              </span>
              <span class="locale-count">{{ locale.count }}</span>
            </div>
          </mat-card-content>
        </mat-card>
      </ng-container>

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
    .sparkline-labels { display: flex; justify-content: space-between; font-size: 0.75rem; color: #888; margin-top: 4px; }

    /* Locale Breakdown */
    .locale-row { display: flex; align-items: center; gap: 12px; padding: 4px 0; }
    .locale-code { font-family: monospace; font-size: 0.875rem; width: 80px; flex-shrink: 0; }
    .locale-bar-wrap { flex: 1; background: #f0f0f0; border-radius: 4px; height: 10px; overflow: hidden; }
    .locale-bar { display: block; height: 100%; background: #1976d2; border-radius: 4px; transition: width 0.3s; }
    .locale-count { width: 40px; text-align: right; font-size: 0.875rem; color: #555; flex-shrink: 0; }
  `],
})
export class DashboardComponent implements OnInit {
  private destroyRef = inject(DestroyRef);

  schedules: Schedule[] = [];
  recentJobs: Job[] = [];
  totalJobs = 0;
  summary: DashboardSummary | null = null;
  triggeringId: string | null = null;
  loading = true;
  errorMessage = '';

  readonly scheduleColumns = ['name', 'description', 'cron', 'lastRun', 'nextRun', 'successRate', 'scheduleActions'];

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

  get topLocales(): { code: string; count: number }[] {
    if (!this.summary) return [];
    return Object.entries(this.summary.top_locales)
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count);
  }

  get sparkMaxJobs(): number {
    return Math.max(...(this.summary?.daily_volumes.map(d => d.total) ?? [1]), 1);
  }

  barHeight(d: DailyVolume): number {
    return Math.max(2, Math.round((d.total / this.sparkMaxJobs) * 46));
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
          .subscribe(r => { this.recentJobs = r.data; this.totalJobs = r.total; });
      },
      error: () => { this.triggeringId = null; },
    });
  }
}
