import { Component, OnInit, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { ScheduleService, Schedule } from '../../core/services/schedule.service';
import { JobService, Job } from '../../core/services/job.service';
import { HerettoService } from '../../core/services/heretto.service';
import { NotificationService } from '../../core/services/notification.service';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge.component';
import { CronDisplayComponent } from '../../shared/components/cron-display/cron-display.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';

@Component({
    selector: 'app-schedule-detail',
    imports: [
        CommonModule, RouterModule, MatButtonModule, MatIconModule,
        MatTableModule, MatDialogModule, MatProgressSpinnerModule,
        MatTooltipModule, StatusBadgeComponent, CronDisplayComponent,
    ],
    template: `
    <div *ngIf="loading" class="loading-center">
      <mat-spinner diameter="36"></mat-spinner>
    </div>

    <ng-container *ngIf="!loading && schedule">

      <!-- Page banner -->
      <div class="page-banner">
        <div class="banner-inner">
          <div class="banner-left">
            <nav class="breadcrumb" aria-label="Breadcrumb">
              <a routerLink="/dashboard" class="bc-link">Home</a>
              <mat-icon class="bc-sep">chevron_right</mat-icon>
              <a routerLink="/schedules" class="bc-link">Schedules</a>
              <mat-icon class="bc-sep">chevron_right</mat-icon>
              <span class="bc-current">{{ schedule.name }}</span>
            </nav>
            <div class="banner-title-row">
              <div class="record-status-dot"
                   [class.dot-active]="schedule.enabled && !hasFailures"
                   [class.dot-paused]="!schedule.enabled"
                   [class.dot-alert]="hasFailures">
              </div>
              <h1 class="banner-title">{{ schedule.name }}</h1>
              <span class="record-status-badge"
                    [class.badge-active]="schedule.enabled && !hasFailures"
                    [class.badge-paused]="!schedule.enabled"
                    [class.badge-alert]="hasFailures">
                {{ hasFailures ? 'Needs Attention' : (schedule.enabled ? 'Active' : 'Paused') }}
              </span>
            </div>
            <p *ngIf="schedule.description" class="banner-subtitle">{{ schedule.description }}</p>
          </div>
          <div class="banner-actions">
            <button mat-stroked-button class="banner-btn" (click)="triggerNow()" aria-label="Run now">
              <mat-icon>play_arrow</mat-icon> Run Now
            </button>
            <a mat-stroked-button class="banner-btn" [routerLink]="['/schedules', schedule.id, 'edit']" aria-label="Edit">
              <mat-icon>edit</mat-icon> Edit
            </a>
            <button mat-stroked-button class="banner-btn" (click)="toggleEnabled()"
                    [attr.aria-label]="schedule.enabled ? 'Pause' : 'Enable'">
              <mat-icon>{{ schedule.enabled ? 'pause_circle_outline' : 'play_circle_outline' }}</mat-icon>
              {{ schedule.enabled ? 'Pause' : 'Enable' }}
            </button>
            <button mat-stroked-button class="banner-btn banner-btn-danger" (click)="deleteSchedule()" aria-label="Delete">
              <mat-icon>delete_outline</mat-icon> Delete
            </button>
          </div>
        </div>
      </div>

      <!-- Record header fields -->
      <div class="record-header-card">
        <div class="record-field">
          <div class="field-label">Schedule</div>
          <div class="field-value">
            <app-cron-display [expression]="schedule.cron_expression"></app-cron-display>
          </div>
        </div>
        <div class="record-field-divider"></div>
        <div class="record-field">
          <div class="field-label">Branch</div>
          <div class="field-value">{{ schedule.branch || '—' }}</div>
        </div>
        <div class="record-field-divider"></div>
        <div class="record-field">
          <div class="field-label">Locales</div>
          <div class="field-value">
            <div *ngIf="schedule.locales?.length" class="locale-code-list">
              <span class="locale-code-chip" *ngFor="let l of schedule.locales">
                <mat-icon class="locale-code-icon">translate</mat-icon>{{ l || 'Source' }}
              </span>
            </div>
            <span *ngIf="!schedule.locales?.length">—</span>
          </div>
        </div>
        <div class="record-field-divider"></div>
        <div class="record-field">
          <div class="field-label">Sources</div>
          <div class="field-value">{{ sourceCount > 0 ? sourceCount + ' document' + (sourceCount !== 1 ? 's' : '') : '—' }}</div>
        </div>
        <div class="record-field-divider"></div>
        <div class="record-field">
          <div class="field-label">Created</div>
          <div class="field-value">{{ schedule.created_at | date:'MMM d, y' }}</div>
        </div>
        <div class="record-field-divider"></div>
        <div class="record-field">
          <div class="field-label">Updated</div>
          <div class="field-value">{{ schedule.updated_at | date:'MMM d, y' }}</div>
        </div>
      </div>

      <!-- Tab bar -->
      <div class="tab-bar">
        <button class="tab-btn" [class.tab-active]="activeTab === 'overview'"
                (click)="activeTab = 'overview'" role="tab" aria-label="Overview">
          <mat-icon>dashboard</mat-icon> Overview
        </button>
        <button class="tab-btn" [class.tab-active]="activeTab === 'jobs'"
                (click)="switchToJobs()" role="tab" aria-label="Job History">
          <mat-icon>history</mat-icon> Job History
          <span *ngIf="jobs.length > 0" class="tab-badge">{{ jobs.length }}</span>
        </button>
      </div>

      <!-- Tab content -->
      <div class="tab-content">

        <!-- Overview tab -->
        <ng-container *ngIf="activeTab === 'overview'">

          <!-- KPI cards -->
          <div class="kpi-grid">
            <div class="kpi-card">
              <div class="kpi-header">
                <div class="kpi-icon-wrap kpi-icon-run">
                  <mat-icon>play_circle</mat-icon>
                </div>
                <div class="kpi-label">Last Run Status</div>
              </div>
              <div class="kpi-value-area">
                <app-status-badge *ngIf="schedule.last_run_status" [status]="schedule.last_run_status"></app-status-badge>
                <span *ngIf="!schedule.last_run_status" class="kpi-empty">Never run</span>
              </div>
              <div *ngIf="schedule.last_run_at" class="kpi-sub">{{ schedule.last_run_at | date:'MMM d, y · h:mm a' }}</div>
            </div>

            <div class="kpi-card">
              <div class="kpi-header">
                <div class="kpi-icon-wrap kpi-icon-next">
                  <mat-icon>schedule</mat-icon>
                </div>
                <div class="kpi-label">Next Run</div>
              </div>
              <div class="kpi-value-area">
                <span *ngIf="schedule.next_run_time" class="kpi-value">{{ schedule.next_run_time | date:'MMM d' }}</span>
                <span *ngIf="!schedule.next_run_time" class="kpi-empty">—</span>
              </div>
              <div *ngIf="schedule.next_run_time" class="kpi-sub">{{ schedule.next_run_time | date:'h:mm a' }}</div>
            </div>

            <div class="kpi-card" [class.kpi-card-alert]="hasFailures">
              <div class="kpi-header">
                <div class="kpi-icon-wrap" [class.kpi-icon-fail]="hasFailures" [class.kpi-icon-ok]="!hasFailures">
                  <mat-icon>{{ hasFailures ? 'warning' : 'check_circle' }}</mat-icon>
                </div>
                <div class="kpi-label">Consecutive Failures</div>
              </div>
              <div class="kpi-value-area">
                <span class="kpi-value" [class.kpi-value-alert]="hasFailures">
                  {{ schedule.consecutive_failures ?? 0 }}
                </span>
              </div>
              <div class="kpi-sub">{{ hasFailures ? 'Requires attention' : 'All clear' }}</div>
            </div>

            <div class="kpi-card">
              <div class="kpi-header">
                <div class="kpi-icon-wrap kpi-icon-sources">
                  <mat-icon>description</mat-icon>
                </div>
                <div class="kpi-label">Sources</div>
              </div>
              <div class="kpi-value-area">
                <span class="kpi-value">{{ sourceCount }}</span>
              </div>
              <div class="kpi-sub">
                {{ schedule.document_ids?.length ?? 0 }} doc{{ (schedule.document_ids?.length ?? 0) !== 1 ? 's' : '' }},
                {{ schedule.folder_ids?.length ?? 0 }} folder{{ (schedule.folder_ids?.length ?? 0) !== 1 ? 's' : '' }}
              </div>
            </div>
          </div>

          <!-- Detail sections -->
          <div class="detail-sections">
            <!-- Locales section -->
            <div class="detail-section" *ngIf="schedule.locales?.length">
              <div class="section-header">
                <mat-icon class="section-icon">language</mat-icon>
                <span class="section-title">Locales</span>
                <span class="section-count">{{ schedule.locales.length }}</span>
              </div>
              <div class="locale-grid">
                <div class="locale-item" *ngFor="let l of schedule.locales">
                  <mat-icon class="locale-icon">translate</mat-icon>
                  <span>{{ l || 'Source' }}</span>
                </div>
              </div>
            </div>

            <!-- Sources section -->
            <div class="detail-section" *ngIf="sourceCount > 0">
              <div class="section-header">
                <mat-icon class="section-icon">description</mat-icon>
                <span class="section-title">Sources</span>
                <span class="section-count">{{ sourceCount }}</span>
              </div>
              <div *ngIf="sourcesLoading" class="sources-loading">
                <mat-spinner diameter="18"></mat-spinner>
                <span>Resolving source names…</span>
              </div>
              <div *ngIf="!sourcesLoading" class="source-list">
                <ng-container *ngFor="let src of sourceItems">
                  <div class="source-item">
                    <mat-icon class="source-icon-item">{{ src.type === 'folder' ? 'folder' : 'article' }}</mat-icon>
                    <div class="source-info">
                      <span class="source-name">{{ src.name }}</span>
                      <span class="source-type-badge source-type-{{ src.type }}">{{ src.type }}</span>
                    </div>
                  </div>
                  <div class="source-children" *ngIf="src.children?.length">
                    <div class="source-child" *ngFor="let child of src.children">
                      <mat-icon class="source-child-icon">article</mat-icon>
                      <span class="source-child-name">{{ child.name }}</span>
                    </div>
                  </div>
                </ng-container>
              </div>
            </div>

            <!-- Alerts section -->
            <div class="detail-section detail-section-alert" *ngIf="hasFailures">
              <div class="section-header">
                <mat-icon class="section-icon section-icon-alert">warning</mat-icon>
                <span class="section-title">Alert</span>
              </div>
              <div class="alert-body">
                <p class="alert-text">
                  This schedule has experienced <strong>{{ schedule.consecutive_failures }}</strong>
                  consecutive failure{{ schedule.consecutive_failures !== 1 ? 's' : '' }}.
                  Review the job history or check your Heretto configuration.
                </p>
                <button mat-stroked-button class="alert-action-btn" (click)="switchToJobs()">
                  <mat-icon>history</mat-icon> View Job History
                </button>
              </div>
            </div>
          </div>
        </ng-container>

        <!-- Job History tab -->
        <ng-container *ngIf="activeTab === 'jobs'">
          <div *ngIf="jobsLoading" class="loading-center">
            <mat-spinner diameter="32"></mat-spinner>
          </div>

          <div *ngIf="!jobsLoading && jobs.length > 0" class="jobs-table-wrap">
            <table mat-table [dataSource]="jobs" class="jobs-table" aria-label="Job history">
              <ng-container matColumnDef="status">
                <th mat-header-cell *matHeaderCellDef>Status</th>
                <td mat-cell *matCellDef="let j">
                  <app-status-badge [status]="j.status"></app-status-badge>
                </td>
              </ng-container>
              <ng-container matColumnDef="trigger">
                <th mat-header-cell *matHeaderCellDef>Trigger</th>
                <td mat-cell *matCellDef="let j">
                  <span class="trigger-badge" [class.trigger-manual]="j.trigger_type === 'manual'"
                        [class.trigger-scheduled]="j.trigger_type === 'scheduled'">
                    <mat-icon>{{ j.trigger_type === 'manual' ? 'touch_app' : 'event' }}</mat-icon>
                    {{ j.trigger_type }}
                  </span>
                </td>
              </ng-container>
              <ng-container matColumnDef="started">
                <th mat-header-cell *matHeaderCellDef>Started</th>
                <td mat-cell *matCellDef="let j" class="col-mono">{{ j.started_at | date:'MMM d, y · h:mm a' }}</td>
              </ng-container>
              <ng-container matColumnDef="completed">
                <th mat-header-cell *matHeaderCellDef>Completed</th>
                <td mat-cell *matCellDef="let j" class="col-mono">
                  <span *ngIf="j.completed_at">{{ j.completed_at | date:'h:mm a' }}</span>
                  <span *ngIf="!j.completed_at" class="in-progress-badge">
                    <mat-icon>sync</mat-icon> In progress
                  </span>
                </td>
              </ng-container>
              <ng-container matColumnDef="link">
                <th mat-header-cell *matHeaderCellDef></th>
                <td mat-cell *matCellDef="let j">
                  <a mat-icon-button [routerLink]="['/jobs', j.id]" matTooltip="View job details" aria-label="View job details" class="view-link">
                    <mat-icon>open_in_new</mat-icon>
                  </a>
                </td>
              </ng-container>
              <tr mat-header-row *matHeaderRowDef="jobColumns"></tr>
              <tr mat-row *matRowDef="let row; columns: jobColumns" class="job-row"></tr>
            </table>
            <div class="table-footer" *ngIf="jobs.length >= 50">
              <mat-icon>info_outline</mat-icon>
              Showing the 50 most recent jobs.
              <a routerLink="/jobs" [queryParams]="{ schedule_id: schedule.id }" class="view-all-link">View all in Job History</a>
            </div>
          </div>

          <div *ngIf="!jobsLoading && jobs.length === 0" class="empty-state">
            <div class="empty-icon-wrap">
              <mat-icon>history_toggle_off</mat-icon>
            </div>
            <h2>No jobs yet</h2>
            <p>This schedule hasn't run yet. Trigger it manually or wait for the next scheduled run.</p>
            <button mat-stroked-button (click)="triggerNow()">
              <mat-icon>play_arrow</mat-icon> Run Now
            </button>
          </div>
        </ng-container>

      </div>
    </ng-container>
  `,
    styles: [`
    .loading-center { display: flex; justify-content: center; padding: 60px; }

    /* ── Page banner ─────────────────────────────────────────── */
    .page-banner {
      background: linear-gradient(135deg, #011627 0%, #0d2137 100%);
      border-bottom: 1px solid rgba(255,255,255,0.06);
      padding: 0 28px;
      margin: -20px -24px 0;
    }
    .banner-inner {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding: 20px 0;
      gap: 24px;
      flex-wrap: wrap;
    }
    .breadcrumb {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-bottom: 10px;
    }
    .bc-link {
      font-size: 12px;
      color: rgba(255,255,255,0.45);
      text-decoration: none !important;
      transition: color 0.1s;
    }
    .bc-link:hover { color: #79ECDD; }
    .bc-sep {
      font-size: 14px;
      width: 14px;
      height: 14px;
      color: rgba(255,255,255,0.25);
    }
    .bc-current { font-size: 12px; color: rgba(255,255,255,0.55); }
    .banner-title-row {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .record-status-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .dot-active { background: #00a650; box-shadow: 0 0 0 3px rgba(0,166,80,0.25); }
    .dot-paused { background: #7a8494; }
    .dot-alert { background: #de350b; box-shadow: 0 0 0 3px rgba(222,53,11,0.25); }
    .banner-title {
      font-size: 20px;
      font-weight: 700;
      color: #fff;
      margin: 0;
    }
    .record-status-badge {
      font-size: 11px;
      font-weight: 700;
      padding: 3px 10px;
      border-radius: 3px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .badge-active { background: rgba(0,166,80,0.2); color: #4dd68c; }
    .badge-paused { background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.55); }
    .badge-alert { background: rgba(222,53,11,0.2); color: #ff6b4a; }
    .banner-subtitle {
      font-size: 13px;
      color: rgba(255,255,255,0.45);
      margin: 6px 0 0;
    }
    .banner-actions {
      display: flex;
      gap: 8px;
      flex-shrink: 0;
      flex-wrap: wrap;
      align-items: center;
      padding-top: 22px;
    }
    .banner-btn {
      color: rgba(255,255,255,0.8) !important;
      border-color: rgba(255,255,255,0.2) !important;
      font-size: 12.5px !important;
      height: 34px !important;
    }
    .banner-btn:hover {
      border-color: rgba(255,255,255,0.5) !important;
      background: rgba(255,255,255,0.06) !important;
      color: #fff !important;
    }
    .banner-btn-danger {
      color: rgba(255,120,100,0.85) !important;
      border-color: rgba(222,53,11,0.3) !important;
    }
    .banner-btn-danger:hover {
      border-color: rgba(222,53,11,0.6) !important;
      background: rgba(222,53,11,0.08) !important;
    }

    /* ── Record header fields ────────────────────────────────── */
    .record-header-card {
      display: flex;
      align-items: stretch;
      background: #fff;
      border-bottom: 1px solid #dee2ec;
      overflow-x: auto;
      margin: 0 -24px;
    }
    .record-field {
      padding: 12px 20px;
      min-width: 120px;
      flex: 1;
    }
    .record-field-divider {
      width: 1px;
      background: #dee2ec;
      flex-shrink: 0;
      align-self: stretch;
      margin: 8px 0;
    }
    .field-label {
      font-size: 10.5px;
      font-weight: 700;
      color: #5e6e82;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 4px;
    }
    .field-value {
      font-size: 13px;
      color: #1d1f2b;
      font-weight: 500;
    }

    /* ── Tab bar ─────────────────────────────────────────────── */
    .tab-bar {
      display: flex;
      background: #fff;
      border-bottom: 2px solid #dee2ec;
      padding: 0 28px;
      gap: 0;
      margin: 0 -24px;
    }
    .tab-btn {
      display: flex;
      align-items: center;
      gap: 7px;
      padding: 12px 18px 10px;
      border: none;
      border-bottom: 2px solid transparent;
      background: transparent;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      color: #5e6e82;
      margin-bottom: -2px;
      font-family: inherit;
      transition: color 0.12s;
    }
    .tab-btn mat-icon { font-size: 16px; width: 16px; height: 16px; }
    .tab-btn:hover { color: #1d1f2b; }
    .tab-active {
      color: #011627 !important;
      font-weight: 700;
      border-bottom-color: #79ECDD !important;
    }
    .tab-badge {
      background: rgba(1,22,39,0.08);
      color: #5a6070;
      font-size: 10px;
      font-weight: 700;
      padding: 1px 6px;
      border-radius: 10px;
    }

    /* ── Tab content ─────────────────────────────────────────── */
    .tab-content { padding: 24px 0; }

    /* ── KPI grid ────────────────────────────────────────────── */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 14px;
      margin-bottom: 20px;
    }
    .kpi-card {
      background: #fff;
      border: 1px solid #dee2ec;
      border-radius: 4px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .kpi-card-alert { border-color: rgba(222,53,11,0.3); background: rgba(222,53,11,0.02); }
    .kpi-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 4px;
    }
    .kpi-icon-wrap {
      width: 32px;
      height: 32px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .kpi-icon-wrap mat-icon { font-size: 17px; width: 17px; height: 17px; }
    .kpi-icon-run { background: rgba(1,22,39,0.07); }
    .kpi-icon-run mat-icon { color: #5a6070; }
    .kpi-icon-next { background: rgba(26,95,160,0.1); }
    .kpi-icon-next mat-icon { color: #1a5fa0; }
    .kpi-icon-fail { background: rgba(222,53,11,0.1); }
    .kpi-icon-fail mat-icon { color: #de350b; }
    .kpi-icon-ok { background: rgba(0,166,80,0.1); }
    .kpi-icon-ok mat-icon { color: #00a650; }
    .kpi-icon-sources { background: rgba(90,52,160,0.1); }
    .kpi-icon-sources mat-icon { color: #5a34a0; }
    .kpi-label {
      font-size: 10.5px;
      font-weight: 700;
      color: #5e6e82;
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }
    .kpi-value-area { display: flex; align-items: center; min-height: 28px; }
    .kpi-value { font-size: 24px; font-weight: 700; color: #1d1f2b; }
    .kpi-value-alert { color: #de350b; }
    .kpi-empty { font-size: 14px; color: #5e6e82; }
    .kpi-sub { font-size: 11.5px; color: #5e6e82; }

    /* ── Detail sections ─────────────────────────────────────── */
    .detail-sections { display: flex; flex-direction: column; gap: 14px; }
    .detail-section {
      background: #fff;
      border: 1px solid #dee2ec;
      border-radius: 4px;
      overflow: hidden;
    }
    .detail-section-alert { border-color: rgba(222,53,11,0.25); }
    .section-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 16px;
      background: #f8f9fb;
      border-bottom: 1px solid #dee2ec;
    }
    .section-icon { font-size: 16px; width: 16px; height: 16px; color: #5e6e82; }
    .section-icon-alert { color: #de350b; }
    .section-title { font-size: 12.5px; font-weight: 700; color: #3d4460; }
    .section-count {
      background: rgba(1,22,39,0.07);
      color: #5a6070;
      font-size: 11px;
      font-weight: 700;
      padding: 1px 7px;
      border-radius: 10px;
    }

    .locale-code-list {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }
    .locale-code-chip {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      background: #eef1f8;
      color: #3d4460;
      font-size: 11.5px;
      font-weight: 500;
      padding: 2px 7px 2px 5px;
      border-radius: 3px;
    }
    .locale-code-icon { font-size: 12px; width: 12px; height: 12px; color: #5e6e82; }

    .locale-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      padding: 12px 16px;
    }
    .locale-item {
      display: flex;
      align-items: center;
      gap: 5px;
      background: #eef1f8;
      color: #3d4460;
      font-size: 12px;
      font-weight: 500;
      padding: 4px 10px;
      border-radius: 3px;
    }
    .locale-icon { font-size: 13px; width: 13px; height: 13px; color: #5e6e82; }

    .alert-body { padding: 14px 16px; }
    .alert-text { font-size: 13.5px; color: #5a0000; margin: 0 0 12px; line-height: 1.5; }
    .alert-action-btn {
      color: #de350b !important;
      border-color: rgba(222,53,11,0.3) !important;
      font-size: 12.5px !important;
      height: 32px !important;
    }

    /* ── Job history table ───────────────────────────────────── */
    .jobs-table-wrap {
      background: #fff;
      border: 1px solid #dee2ec;
      border-radius: 4px;
      overflow: hidden;
    }
    .jobs-table { width: 100%; }
    .col-mono { font-size: 12.5px; }
    .trigger-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 11.5px;
      font-weight: 500;
      padding: 2px 8px;
      border-radius: 3px;
      text-transform: capitalize;
    }
    .trigger-badge mat-icon { font-size: 13px; width: 13px; height: 13px; }
    .trigger-manual { background: #eef6ff; color: #1a5fa0; }
    .trigger-scheduled { background: #f3f0ff; color: #5a34a0; }
    .in-progress-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 12px;
      color: #f59e0b;
    }
    .in-progress-badge mat-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
      animation: spin 1.5s linear infinite;
    }
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    .view-link { color: #5a6070 !important; }
    .view-link:hover { color: #011627 !important; }
    .job-row:hover .mat-mdc-cell { background: #f8f9fb !important; }
    .table-footer {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 10px 16px;
      border-top: 1px solid #dee2ec;
      font-size: 12.5px;
      color: #5e6e82;
      background: #fafbfc;
    }
    .table-footer mat-icon { font-size: 14px; width: 14px; height: 14px; }
    .view-all-link { color: #1a5fa0; margin-left: 4px; }

    /* ── Sources section ─────────────────────────────────────── */
    .sources-loading {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 14px 16px;
      color: #5e6e82;
      font-size: 13px;
    }
    .source-list { display: flex; flex-direction: column; }
    .source-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 16px;
      border-bottom: 1px solid #f0f2f5;
    }
    .source-item:last-child { border-bottom: none; }
    .source-icon-item {
      font-size: 18px;
      width: 18px;
      height: 18px;
      color: #5e6e82;
      flex-shrink: 0;
    }
    .source-info { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; }
    .source-name {
      font-size: 13px;
      font-weight: 500;
      color: #1d1f2b;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .source-type-badge {
      font-size: 10.5px;
      font-weight: 600;
      padding: 2px 7px;
      border-radius: 3px;
      text-transform: capitalize;
      flex-shrink: 0;
    }
    .source-type-document { background: #e8f0fe; color: #1a5fa0; }
    .source-type-folder { background: #fff8e1; color: #b45309; }
    .source-children {
      background: #fafbfc;
      border-bottom: 1px solid #f0f2f5;
      padding: 2px 0 4px;
    }
    .source-child {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 5px 16px 5px 38px;
    }
    .source-child-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      color: #5e6e82;
      flex-shrink: 0;
    }
    .source-child-name { font-size: 12.5px; color: #3d4460; }

    /* Empty states */
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 60px 24px;
      text-align: center;
    }
    .empty-icon-wrap {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: #f0f2f7;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 16px;
    }
    .empty-icon-wrap mat-icon { font-size: 26px; width: 26px; height: 26px; color: #5e6e82; }
    .empty-state h2 { font-size: 15px; color: #3d4460; margin: 0 0 8px; font-weight: 600; }
    .empty-state p { color: #5e6e82; font-size: 13px; margin: 0 0 20px; max-width: 340px; }
  `]
})
export class ScheduleDetailComponent implements OnInit {
  private destroyRef = inject(DestroyRef);

  schedule: Schedule | null = null;
  loading = true;
  activeTab: 'overview' | 'jobs' = 'overview';

  jobs: Job[] = [];
  jobsLoading = false;
  jobColumns = ['status', 'trigger', 'started', 'completed', 'link'];

  sourceItems: { id: string; name: string; type: 'document' | 'folder'; children?: { id: string; name: string }[] }[] = [];
  sourcesLoading = false;

  get hasFailures(): boolean { return (this.schedule?.consecutive_failures ?? 0) > 0; }
  get sourceCount(): number {
    return (this.schedule?.document_ids?.length ?? 0) + (this.schedule?.folder_ids?.length ?? 0);
  }

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private scheduleService: ScheduleService,
    private jobService: JobService,
    private herettoService: HerettoService,
    private notifications: NotificationService,
    private dialog: MatDialog,
  ) {}

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) { this.router.navigate(['/schedules']); return; }

    this.scheduleService.getById(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: s => { this.schedule = s; this.loading = false; this.loadSources(); },
        error: () => { this.loading = false; this.router.navigate(['/schedules']); },
      });
  }

  switchToJobs() {
    this.activeTab = 'jobs';
    if (this.jobs.length === 0 && !this.jobsLoading) { this.loadJobs(); }
  }

  loadJobs() {
    if (!this.schedule) return;
    this.jobsLoading = true;
    this.jobService.getAll({ schedule_id: this.schedule.id, limit: '50' })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: r => { this.jobs = r.data; this.jobsLoading = false; },
        error: () => { this.jobsLoading = false; },
      });
  }

  loadSources() {
    if (!this.schedule) return;
    const docIds = this.schedule.document_ids ?? [];
    const folderIds = this.schedule.folder_ids ?? [];
    if (docIds.length === 0 && folderIds.length === 0) return;

    this.sourcesLoading = true;
    const requests = [
      ...docIds.map(id =>
        this.herettoService.getDocumentInfo(id).pipe(
          map(r => ({ id, name: r.title, type: 'document' as const })),
          catchError(() => of({ id, name: id.substring(0, 8) + '…', type: 'document' as const })),
        )
      ),
      ...folderIds.map(id =>
        this.herettoService.getFolderContents(id).pipe(
          map(r => ({
            id,
            name: r.title,
            type: 'folder' as const,
            children: r.children
              .filter(c => c.type?.toLowerCase().includes('map'))
              .map(c => ({ id: c.id, name: c.title })),
          })),
          catchError(() => of({ id, name: id.substring(0, 8) + '…', type: 'folder' as const, children: [] })),
        )
      ),
    ];

    forkJoin(requests)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: items => { this.sourceItems = items; this.sourcesLoading = false; },
        error: () => { this.sourcesLoading = false; },
      });
  }

  triggerNow() {
    if (!this.schedule) return;
    this.scheduleService.trigger(this.schedule.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: () => this.notifications.success('Job triggered successfully') });
  }

  toggleEnabled() {
    if (!this.schedule) return;
    this.scheduleService.toggle(this.schedule.id, !this.schedule.enabled)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: updated => { this.schedule = updated; } });
  }

  deleteSchedule() {
    if (!this.schedule) return;
    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Delete Schedule',
        message: `Delete "${this.schedule.name}"? This will also delete all job history for this schedule.`,
        confirmText: 'Delete',
      },
    });
    ref.afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(confirmed => {
        if (confirmed && this.schedule) {
          this.scheduleService.delete(this.schedule.id)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({ next: () => this.router.navigate(['/schedules']) });
        }
      });
  }
}
