import { Component, OnInit, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ScheduleService, Schedule } from '../../core/services/schedule.service';
import { JobService, Job } from '../../core/services/job.service';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge.component';
import { CronDisplayComponent } from '../../shared/components/cron-display/cron-display.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule, RouterModule, MatCardModule, MatButtonModule, MatIconModule,
    MatTableModule, MatProgressSpinnerModule, StatusBadgeComponent, CronDisplayComponent,
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
          <div class="stat-value" [class.rate-good]="successRate >= 80" [class.rate-warn]="successRate >= 50 && successRate < 80" [class.rate-bad]="successRate < 50">
            {{ recentJobs.length ? successRate + '%' : '—' }}
          </div>
          <div class="stat-label">Success Rate (recent)</div>
        </mat-card-content>
      </mat-card>
    </div>

    <mat-spinner *ngIf="loading" diameter="40"></mat-spinner>

    <ng-container *ngIf="!loading">
      <h2>Active Schedules</h2>
      <mat-card *ngIf="schedules.length > 0; else noSchedules">
        <table mat-table [dataSource]="schedules.slice(0, 5)" aria-label="Active schedules">
          <ng-container matColumnDef="name">
            <th mat-header-cell *matHeaderCellDef>Name</th>
            <td mat-cell *matCellDef="let s">
              <a [routerLink]="['/schedules']">{{ s.name }}</a>
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
          <tr mat-header-row *matHeaderRowDef="['name', 'description', 'cron', 'lastRun']"></tr>
          <tr mat-row *matRowDef="let row; columns: ['name', 'description', 'cron', 'lastRun']"></tr>
        </table>
      </mat-card>
      <ng-template #noSchedules>
        <mat-card>
          <mat-card-content>
            <p>No schedules yet. <a routerLink="/schedules/new">Create one</a></p>
          </mat-card-content>
        </mat-card>
      </ng-template>

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
          <ng-container matColumnDef="actions">
            <th mat-header-cell *matHeaderCellDef></th>
            <td mat-cell *matCellDef="let j">
              <a mat-button [routerLink]="['/jobs', j.id]">Details</a>
            </td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="['status', 'schedule', 'trigger', 'startedAt', 'actions']"></tr>
          <tr mat-row *matRowDef="let row; columns: ['status', 'schedule', 'trigger', 'startedAt', 'actions']"></tr>
        </table>
      </mat-card>
      <ng-template #noJobs>
        <mat-card>
          <mat-card-content>
            <p>No jobs have run yet.</p>
          </mat-card-content>
        </mat-card>
      </ng-template>
    </ng-container>

    <mat-card *ngIf="errorMessage" class="error-card">
      <mat-card-content>
        <mat-icon>warning</mat-icon> {{ errorMessage }}
      </mat-card-content>
    </mat-card>
  `,
  styles: [`
    .stats-row { display: flex; gap: 16px; margin-bottom: 24px; }
    .stats-row mat-card { flex: 1; text-align: center; }
    .stat-value { font-size: 2rem; font-weight: bold; }
    .stat-label { color: #666; }
    .rate-good { color: #2e7d32; }
    .rate-warn { color: #e65100; }
    .rate-bad { color: #c62828; }
    h2 { margin-top: 24px; }
    .error-card { margin-top: 16px; color: #f44336; }
    .table-link { color: inherit; text-decoration: none; font-weight: 500; }
    .table-link:hover { text-decoration: underline; }
  `],
})
export class DashboardComponent implements OnInit {
  private destroyRef = inject(DestroyRef);

  schedules: Schedule[] = [];
  recentJobs: Job[] = [];
  totalJobs = 0;
  loading = true;
  errorMessage = '';

  get activeSchedules() { return this.schedules.filter(s => s.enabled).length; }
  get totalSchedules() { return this.schedules.length; }
  get successRate(): number {
    if (!this.recentJobs.length) return 0;
    const succeeded = this.recentJobs.filter(j => j.status === 'completed' || j.status === 'success').length;
    return Math.round((succeeded / this.recentJobs.length) * 100);
  }

  constructor(
    private scheduleService: ScheduleService,
    private jobService: JobService,
  ) {}

  ngOnInit() {
    this.scheduleService.getAll()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: s => { this.schedules = s; this.loading = false; },
        error: () => { this.loading = false; this.errorMessage = 'Failed to load schedules'; },
      });

    this.jobService.getAll({ limit: '10' })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: r => { this.recentJobs = r.data; this.totalJobs = r.total; },
        error: () => {},
      });
  }
}
