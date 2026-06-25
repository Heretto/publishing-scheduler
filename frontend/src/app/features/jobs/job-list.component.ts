import { Component, OnInit, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { JobService, Job } from '../../core/services/job.service';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge.component';

@Component({
    selector: 'app-job-list',
    imports: [
        CommonModule, RouterModule, MatTableModule, MatPaginatorModule,
        MatButtonModule, MatIconModule, MatProgressSpinnerModule, StatusBadgeComponent,
    ],
    template: `
    <!-- Page banner -->
    <div class="page-banner">
      <div class="banner-breadcrumb">
        <span>Home</span>
        <mat-icon class="bc-sep">chevron_right</mat-icon>
        <span>Job History</span>
      </div>
      <div class="banner-row">
        <h1 class="banner-title">Job History</h1>
      </div>
    </div>

    <mat-spinner *ngIf="loading" diameter="40" style="margin-top: 32px;"></mat-spinner>

    <div class="sn-card" *ngIf="!loading" style="margin-top: 20px;">
      <div class="sn-card-header">
        <span class="section-title">All Jobs</span>
        <span class="job-count" *ngIf="totalJobs">{{ totalJobs | number }} total</span>
      </div>
      <table mat-table [dataSource]="jobs" *ngIf="jobs.length > 0" aria-label="Job history" class="jobs-table">
        <ng-container matColumnDef="status">
          <th mat-header-cell *matHeaderCellDef>Status</th>
          <td mat-cell *matCellDef="let j"><app-status-badge [status]="j.status"></app-status-badge></td>
        </ng-container>
        <ng-container matColumnDef="schedule">
          <th mat-header-cell *matHeaderCellDef>Schedule</th>
          <td mat-cell *matCellDef="let j">
            <a [routerLink]="['/schedules', j.schedule_id]" class="schedule-link">
              {{ j.schedule_name || j.schedule_id }}
            </a>
          </td>
        </ng-container>
        <ng-container matColumnDef="trigger">
          <th mat-header-cell *matHeaderCellDef>Trigger</th>
          <td mat-cell *matCellDef="let j">
            <span class="trigger-badge" [class.trigger-manual]="j.trigger_type === 'manual'" [class.trigger-schedule]="j.trigger_type !== 'manual'">
              <mat-icon class="trigger-icon">{{ j.trigger_type === 'manual' ? 'touch_app' : 'schedule' }}</mat-icon>
              {{ j.trigger_type }}
            </span>
          </td>
        </ng-container>
        <ng-container matColumnDef="startedAt">
          <th mat-header-cell *matHeaderCellDef>Started</th>
          <td mat-cell *matCellDef="let j">{{ j.started_at | date:'medium' }}</td>
        </ng-container>
        <ng-container matColumnDef="completedAt">
          <th mat-header-cell *matHeaderCellDef>Completed</th>
          <td mat-cell *matCellDef="let j">{{ j.completed_at ? (j.completed_at | date:'medium') : '—' }}</td>
        </ng-container>
        <ng-container matColumnDef="actions">
          <th mat-header-cell *matHeaderCellDef></th>
          <td mat-cell *matCellDef="let j">
            <a mat-button [routerLink]="[j.id]" [attr.aria-label]="'View details for job ' + j.id" class="details-btn">Details</a>
          </td>
        </ng-container>
        <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
        <tr mat-row *matRowDef="let row; columns: displayedColumns" class="job-row"></tr>
      </table>
      <p *ngIf="jobs.length === 0" class="empty-state">No jobs yet.</p>
      <mat-paginator
        [length]="totalJobs"
        [pageSize]="pageSize"
        [pageSizeOptions]="[10, 20, 50]"
        (page)="onPage($event)"
        aria-label="Job list pagination">
      </mat-paginator>
    </div>
  `,
    styles: [`
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
    .bc-sep { font-size: 14px; width: 14px; height: 14px; line-height: 14px; }
    .banner-row {
      display: flex;
      align-items: center;
      padding: 10px 0 16px;
    }
    .banner-title { font-size: 22px; font-weight: 700; margin: 0; color: #fff; }

    /* ── Card ───────────────────────────────────────────────── */
    .sn-card {
      background: #fff;
      border: 1px solid #dee2ec;
      border-radius: 4px;
      overflow: hidden;
    }
    .sn-card-header {
      padding: 10px 16px;
      border-bottom: 1px solid #dee2ec;
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: #f8f9fb;
    }
    .section-title {
      font-size: 11px;
      font-weight: 700;
      color: #97a0af;
      text-transform: uppercase;
      letter-spacing: 0.6px;
    }
    .job-count { font-size: 12px; color: #97a0af; }

    /* ── Table ──────────────────────────────────────────────── */
    .jobs-table { width: 100%; }
    .job-row:hover td { background: rgba(1,22,39,0.03); }

    .schedule-link { color: #1d1f2b; text-decoration: none; font-weight: 500; }
    .schedule-link:hover { text-decoration: underline; color: #AD4780; }

    .trigger-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
      text-transform: capitalize;
    }
    .trigger-manual { background: #fff3e0; color: #e65100; }
    .trigger-schedule { background: #e8f5e9; color: #2e7d32; }
    .trigger-icon { font-size: 12px; width: 12px; height: 12px; }

    .details-btn { font-size: 12px; }
    .empty-state { padding: 24px 16px; color: #97a0af; margin: 0; }
  `]
})
export class JobListComponent implements OnInit {
  private destroyRef = inject(DestroyRef);

  jobs: Job[] = [];
  totalJobs = 0;
  pageSize = 20;
  currentPage = 1;
  loading = true;
  displayedColumns = ['status', 'schedule', 'trigger', 'startedAt', 'completedAt', 'actions'];

  constructor(private jobService: JobService) {}

  ngOnInit() { this.loadJobs(); }

  loadJobs() {
    this.loading = true;
    this.jobService.getAll({
      page: String(this.currentPage),
      limit: String(this.pageSize),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: r => { this.jobs = r.data; this.totalJobs = r.total; this.loading = false; },
        error: () => { this.loading = false; },
      });
  }

  onPage(event: PageEvent) {
    this.currentPage = event.pageIndex + 1;
    this.pageSize = event.pageSize;
    this.loadJobs();
  }
}
