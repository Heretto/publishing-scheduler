import { Component, OnInit, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ScheduleService, Schedule } from '../../core/services/schedule.service';
import { NotificationService } from '../../core/services/notification.service';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge.component';
import { CronDisplayComponent } from '../../shared/components/cron-display/cron-display.component';
import { HopConfirmDialogComponent } from '@heretto/hop-ui';

@Component({
    selector: 'app-schedule-list',
    imports: [
        CommonModule, FormsModule, RouterModule, MatButtonModule, MatIconModule,
        MatDialogModule, MatProgressSpinnerModule, MatTooltipModule,
        StatusBadgeComponent, CronDisplayComponent,
    ],
    template: `
    <!-- Page header banner -->
    <div class="page-banner">
      <div class="banner-inner">
        <div class="banner-left">
          <nav class="breadcrumb" aria-label="Breadcrumb">
            <a routerLink="/dashboard" class="bc-link">Home</a>
            <mat-icon class="bc-sep" aria-hidden="true">chevron_right</mat-icon>
            <span class="bc-current">Schedules</span>
          </nav>
          <h1 class="banner-title">Publishing Schedules</h1>
          <p class="banner-subtitle">
            Manage and monitor automated publishing jobs across your organization.
          </p>
        </div>
        <div class="banner-right">
          <a mat-flat-button class="create-btn" routerLink="new" aria-label="New Schedule">
            <mat-icon>add</mat-icon> New Schedule
          </a>
        </div>
      </div>
    </div>

    <!-- KPI metrics -->
    <div class="metrics-bar">
      <div class="metric-tile">
        <div class="metric-icon-wrap metric-icon-total">
          <mat-icon>event_repeat</mat-icon>
        </div>
        <div class="metric-body">
          <div class="metric-value">{{ schedules.length }}</div>
          <div class="metric-label">Total Schedules</div>
        </div>
      </div>
      <div class="metric-tile">
        <div class="metric-icon-wrap metric-icon-active">
          <mat-icon>check_circle</mat-icon>
        </div>
        <div class="metric-body">
          <div class="metric-value metric-value-active">{{ activeCount }}</div>
          <div class="metric-label">Active</div>
        </div>
      </div>
      <div class="metric-tile">
        <div class="metric-icon-wrap metric-icon-paused">
          <mat-icon>pause_circle</mat-icon>
        </div>
        <div class="metric-body">
          <div class="metric-value">{{ pausedCount }}</div>
          <div class="metric-label">Paused</div>
        </div>
      </div>
      <div class="metric-tile" [class.metric-tile-alert]="needsAttentionCount > 0">
        <div class="metric-icon-wrap" [class.metric-icon-alert]="needsAttentionCount > 0"
             [class.metric-icon-ok]="needsAttentionCount === 0">
          <mat-icon>{{ needsAttentionCount > 0 ? 'warning' : 'verified' }}</mat-icon>
        </div>
        <div class="metric-body">
          <div class="metric-value" [class.metric-value-alert]="needsAttentionCount > 0">
            {{ needsAttentionCount }}
          </div>
          <div class="metric-label">Need Attention</div>
        </div>
      </div>
    </div>

    <!-- Filter toolbar -->
    <div class="filter-bar">
      <div class="search-wrap">
        <mat-icon class="search-icon">search</mat-icon>
        <input
          class="search-input"
          type="text"
          placeholder="Search schedules..."
          [(ngModel)]="searchQuery"
          aria-label="Search schedules">
        <button *ngIf="searchQuery" class="search-clear" (click)="searchQuery = ''" aria-label="Clear search">
          <mat-icon>close</mat-icon>
        </button>
      </div>
      <div class="filter-tabs" role="tablist">
        <button role="tab" class="filter-tab" [class.filter-tab-active]="activeFilter === 'all'"
                [attr.aria-selected]="activeFilter === 'all'"
                (click)="activeFilter = 'all'" aria-label="Show all schedules">
          All <span class="tab-count">{{ schedules.length }}</span>
        </button>
        <button role="tab" class="filter-tab" [class.filter-tab-active]="activeFilter === 'active'"
                [attr.aria-selected]="activeFilter === 'active'"
                (click)="activeFilter = 'active'" aria-label="Show active schedules">
          Active <span class="tab-count">{{ activeCount }}</span>
        </button>
        <button role="tab" class="filter-tab" [class.filter-tab-active]="activeFilter === 'paused'"
                [attr.aria-selected]="activeFilter === 'paused'"
                (click)="activeFilter = 'paused'" aria-label="Show paused schedules">
          Paused <span class="tab-count">{{ pausedCount }}</span>
        </button>
      </div>
      <div class="filter-bar-right">
        <span class="results-count">{{ filteredSchedules.length }} record{{ filteredSchedules.length !== 1 ? 's' : '' }}</span>
      </div>
    </div>

    <!-- Loading state -->
    <div *ngIf="loading" class="loading-center">
      <mat-spinner diameter="36" aria-label="Loading schedules"></mat-spinner>
    </div>

    <!-- Empty state -->
    <div *ngIf="!loading && schedules.length === 0" class="empty-state">
      <div class="empty-icon-wrap">
        <mat-icon>event_repeat</mat-icon>
      </div>
      <h2>No schedules configured</h2>
      <p>Create your first publishing schedule to start automating deployments.</p>
      <a mat-flat-button color="primary" routerLink="new">
        <mat-icon>add</mat-icon> Create a Schedule
      </a>
    </div>

    <!-- No results (filtered) -->
    <div *ngIf="!loading && schedules.length > 0 && filteredSchedules.length === 0" class="empty-state">
      <div class="empty-icon-wrap">
        <mat-icon>search_off</mat-icon>
      </div>
      <h2>No matching schedules</h2>
      <p>Try adjusting your search or filter.</p>
      <button mat-stroked-button (click)="clearFilters()">Clear filters</button>
    </div>

    <!-- Card grid -->
    <div *ngIf="!loading && filteredSchedules.length > 0" class="card-grid">
      <article class="sched-card" *ngFor="let s of filteredSchedules"
               (click)="openDetail(s)" role="button" tabindex="0"
               (keydown.enter)="openDetail(s)" (keydown.space)="openDetail(s)"
               [attr.aria-label]="'Open schedule: ' + s.name">

        <!-- Status accent bar -->
        <div class="card-status-bar"
             [class.bar-active]="s.enabled && !hasFailures(s)"
             [class.bar-paused]="!s.enabled"
             [class.bar-alert]="hasFailures(s)">
        </div>

        <div class="card-inner">
          <!-- Card header -->
          <div class="card-header">
            <div class="card-status-dot"
                 [class.dot-active]="s.enabled && !hasFailures(s)"
                 [class.dot-paused]="!s.enabled"
                 [class.dot-alert]="hasFailures(s)"
                 [matTooltip]="hasFailures(s) ? (s.consecutive_failures + ' consecutive failure(s)') : (s.enabled ? 'Active' : 'Paused')">
            </div>
            <div class="card-name-wrap">
              <h3 class="card-name" [title]="s.name">{{ s.name }}</h3>
              <span *ngIf="s.description" class="card-desc" [title]="s.description">{{ s.description }}</span>
            </div>
            <span class="card-status-pill"
                  [class.pill-active]="s.enabled && !hasFailures(s)"
                  [class.pill-paused]="!s.enabled"
                  [class.pill-alert]="hasFailures(s)">
              {{ hasFailures(s) ? 'Alert' : (s.enabled ? 'Active' : 'Paused') }}
            </span>
          </div>

          <!-- Schedule info -->
          <div class="card-cron-row">
            <mat-icon class="card-field-icon">schedule</mat-icon>
            <app-cron-display [expression]="s.cron_expression"></app-cron-display>
          </div>

          <!-- Metadata tags -->
          <div class="card-tags">
            <span *ngIf="s.branch" class="tag tag-branch">
              <mat-icon aria-hidden="true">alt_route</mat-icon> {{ s.branch }}
            </span>
            <span *ngIf="s.locales?.length" class="tag tag-locale">
              <mat-icon aria-hidden="true">language</mat-icon>
              {{ localeDisplay(s.locales) }}
            </span>
            <span *ngIf="sourceCount(s) > 0" class="tag tag-source">
              <mat-icon aria-hidden="true">description</mat-icon>
              {{ sourceCount(s) }} source{{ sourceCount(s) !== 1 ? 's' : '' }}
            </span>
          </div>

          <!-- Card footer -->
          <div class="card-footer">
            <div class="card-run-info">
              <div class="run-row" *ngIf="s.last_run_status">
                <span class="run-label">Last run:</span>
                <app-status-badge [status]="s.last_run_status"></app-status-badge>
                <span *ngIf="s.last_run_at" class="run-time">{{ s.last_run_at | date:'MMM d, h:mm a' }}</span>
              </div>
              <div class="run-row" *ngIf="!s.last_run_status">
                <span class="run-label">Never run</span>
              </div>
              <div class="run-row next-run-row" *ngIf="s.next_run_time">
                <span class="run-label">Next:</span>
                <span class="next-run-val">{{ s.next_run_time | date:'MMM d, h:mm a' }}</span>
              </div>
            </div>
            <div class="card-actions" (click)="$event.stopPropagation()">
              <button mat-icon-button class="action-btn" (click)="triggerNow(s)"
                      matTooltip="Run now" [attr.aria-label]="'Run ' + s.name + ' now'">
                <mat-icon>play_arrow</mat-icon>
              </button>
              <a mat-icon-button class="action-btn" [routerLink]="[s.id, 'edit']"
                 matTooltip="Edit" [attr.aria-label]="'Edit ' + s.name"
                 (click)="$event.stopPropagation()">
                <mat-icon>edit</mat-icon>
              </a>
              <button mat-icon-button class="action-btn action-btn-danger" (click)="deleteSchedule(s)"
                      matTooltip="Delete" [attr.aria-label]="'Delete ' + s.name">
                <mat-icon>delete</mat-icon>
              </button>
            </div>
          </div>
        </div>
      </article>
    </div>
  `,
    styles: [`
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
      align-items: center;
      padding: 24px 0;
    }
    .breadcrumb {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-bottom: 8px;
    }
    .bc-link {
      font-size: 12px;
      color: rgba(255,255,255,0.5);
      text-decoration: none !important;
      transition: color 0.1s;
    }
    .bc-link:hover { color: #79ECDD; }
    .bc-sep {
      font-size: 14px;
      width: 14px;
      height: 14px;
      color: rgba(255,255,255,0.3);
    }
    .bc-current {
      font-size: 12px;
      color: rgba(255,255,255,0.55);
    }
    .banner-title {
      font-size: 22px;
      font-weight: 700;
      color: #ffffff;
      margin: 0 0 4px;
      letter-spacing: -0.2px;
    }
    .banner-subtitle {
      font-size: 13px;
      color: rgba(255,255,255,0.5);
      margin: 0;
    }
    .create-btn {
      background: #79ECDD !important;
      color: #011627 !important;
      font-weight: 600;
      border-radius: 4px;
      padding: 0 18px;
      height: 38px;
      font-size: 13px;
    }

    /* ── KPI metrics bar ─────────────────────────────────────── */
    .metrics-bar {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 0;
      background: #fff;
      border-bottom: 1px solid #dee2ec;
      margin: 0 -24px;
    }
    .metric-tile {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 16px 24px;
      border-right: 1px solid #dee2ec;
      transition: background 0.12s;
    }
    .metric-tile:last-child { border-right: none; }
    .metric-tile:hover { background: #f8f9fb; }
    .metric-tile-alert { background: rgba(222,53,11,0.03); }
    .metric-icon-wrap {
      width: 40px;
      height: 40px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .metric-icon-wrap mat-icon { font-size: 20px; width: 20px; height: 20px; }
    .metric-icon-total { background: rgba(1,22,39,0.07); }
    .metric-icon-total mat-icon { color: #5a6070; }
    .metric-icon-active { background: rgba(0,166,80,0.1); }
    .metric-icon-active mat-icon { color: #00a650; }
    .metric-icon-paused { background: rgba(151,160,175,0.15); }
    .metric-icon-paused mat-icon { color: #5e6e82; }
    .metric-icon-alert { background: rgba(222,53,11,0.1); }
    .metric-icon-alert mat-icon { color: #de350b; }
    .metric-icon-ok { background: rgba(0,166,80,0.1); }
    .metric-icon-ok mat-icon { color: #00a650; }
    .metric-body { display: flex; flex-direction: column; }
    .metric-value {
      font-size: 22px;
      font-weight: 700;
      color: #1d1f2b;
      line-height: 1.1;
    }
    .metric-value-active { color: #00a650; }
    .metric-value-alert { color: #de350b; }
    .metric-label {
      font-size: 11px;
      font-weight: 600;
      color: #5e6e82;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      margin-top: 2px;
    }

    /* ── Filter toolbar ──────────────────────────────────────── */
    .filter-bar {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 10px 28px;
      background: #fff;
      border-bottom: 1px solid #dee2ec;
      margin: 0 -24px;
    }
    .search-wrap {
      display: flex;
      align-items: center;
      gap: 6px;
      background: #f4f5f7;
      border: 1px solid #dee2ec;
      border-radius: 4px;
      padding: 0 10px;
      height: 34px;
      width: 260px;
      flex-shrink: 0;
    }
    .search-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
      color: #5e6e82;
    }
    .search-input {
      border: none;
      background: transparent;
      outline: none;
      font-size: 13px;
      color: #1d1f2b;
      width: 100%;
      font-family: inherit;
    }
    .search-input::placeholder { color: #5e6e82; }
    .search-clear {
      background: none;
      border: none;
      cursor: pointer;
      padding: 0;
      display: flex;
      color: #5e6e82;
    }
    .search-clear mat-icon { font-size: 16px; width: 16px; height: 16px; }
    .filter-tabs {
      display: flex;
      gap: 2px;
      background: #f4f5f7;
      border: 1px solid #dee2ec;
      border-radius: 4px;
      padding: 3px;
    }
    .filter-tab {
      border: none;
      background: transparent;
      padding: 4px 12px;
      border-radius: 3px;
      font-size: 12.5px;
      font-weight: 500;
      color: #5a6070;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 5px;
      transition: all 0.12s;
      font-family: inherit;
    }
    .filter-tab:hover { color: #1d1f2b; background: rgba(0,0,0,0.04); }
    .filter-tab-active {
      background: #fff !important;
      color: #011627 !important;
      font-weight: 600;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .tab-count {
      background: #e8eaf0;
      color: #5a6070;
      border-radius: 10px;
      padding: 1px 6px;
      font-size: 11px;
      font-weight: 600;
    }
    .filter-tab-active .tab-count {
      background: rgba(1,22,39,0.08);
      color: #011627;
    }
    .filter-bar-right { margin-left: auto; }
    .results-count {
      font-size: 12px;
      color: #5e6e82;
      white-space: nowrap;
    }

    /* ── Content area ────────────────────────────────────────── */
    .loading-center {
      display: flex;
      justify-content: center;
      padding: 60px;
    }
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 80px 24px;
      text-align: center;
    }
    .empty-icon-wrap {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      background: #f0f2f7;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 20px;
    }
    .empty-icon-wrap mat-icon { font-size: 30px; width: 30px; height: 30px; color: #5e6e82; }
    .empty-state h2 { font-size: 16px; color: #3d4460; margin: 0 0 8px; font-weight: 600; }
    .empty-state p { color: #5e6e82; font-size: 13.5px; margin: 0 0 24px; }

    /* ── Card grid ───────────────────────────────────────────── */
    .card-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
      gap: 16px;
      padding: 20px 0;
    }

    /* ── Schedule card ───────────────────────────────────────── */
    .sched-card {
      background: #fff;
      border: 1px solid #dee2ec;
      border-radius: 4px;
      display: flex;
      cursor: pointer;
      transition: box-shadow 0.15s, border-color 0.15s, transform 0.12s;
      overflow: hidden;
    }
    .sched-card:hover {
      border-color: #b8c0d0;
      box-shadow: 0 4px 16px rgba(0,65,117,0.12);
      transform: translateY(-1px);
    }
    .sched-card:focus-visible {
      outline: 2px solid #79ECDD;
      outline-offset: 2px;
    }

    /* Left status bar */
    .card-status-bar {
      width: 4px;
      flex-shrink: 0;
    }
    .bar-active { background: #00a650; }
    .bar-paused { background: #c4cad6; }
    .bar-alert { background: #de350b; }

    .card-inner {
      flex: 1;
      padding: 14px 16px 10px;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    /* Card header */
    .card-header {
      display: flex;
      align-items: flex-start;
      gap: 8px;
    }
    .card-status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
      margin-top: 5px;
    }
    .dot-active { background: #00a650; box-shadow: 0 0 0 2px rgba(0,166,80,0.18); }
    .dot-paused { background: #c4cad6; }
    .dot-alert { background: #de350b; box-shadow: 0 0 0 2px rgba(222,53,11,0.18); }
    .card-name-wrap {
      flex: 1;
      min-width: 0;
    }
    .card-name {
      font-size: 14px;
      font-weight: 600;
      color: #1d1f2b;
      margin: 0 0 2px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .card-desc {
      font-size: 12px;
      color: #5e6e82;
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .card-status-pill {
      font-size: 10.5px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 3px;
      flex-shrink: 0;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .pill-active { background: rgba(0,166,80,0.1); color: #006b34; }
    .pill-paused { background: #f0f2f7; color: #5e6e82; }
    .pill-alert { background: rgba(222,53,11,0.1); color: #b22a09; }

    /* Cron row */
    .card-cron-row {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12.5px;
      color: #5a6070;
    }
    .card-field-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
      color: #5e6e82;
      flex-shrink: 0;
    }

    /* Tags */
    .card-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
    }
    .tag {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      font-size: 11px;
      font-weight: 500;
      padding: 2px 7px;
      border-radius: 3px;
      white-space: nowrap;
    }
    .tag mat-icon { font-size: 11px; width: 11px; height: 11px; }
    .tag-branch { background: #eef1f8; color: #4a5270; }
    .tag-locale { background: #eef6ff; color: #1a5fa0; }
    .tag-source { background: #f3f0ff; color: #5a34a0; }

    /* Footer */
    .card-footer {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      border-top: 1px solid #f0f2f7;
      padding-top: 8px;
      margin-top: 2px;
    }
    .card-run-info { display: flex; flex-direction: column; gap: 3px; }
    .run-row {
      display: flex;
      align-items: center;
      gap: 5px;
      flex-wrap: wrap;
    }
    .run-label { font-size: 11px; color: #5e6e82; font-weight: 500; }
    .run-time { font-size: 11px; color: #5e6e82; }
    .next-run-row .run-label { color: #5e6e82; }
    .next-run-val { font-size: 11px; color: #5a6070; font-weight: 500; }
    .card-actions { display: flex; gap: 0; }
    .action-btn { color: #5e6e82 !important; }
    .action-btn:hover { color: #011627 !important; }
    .action-btn-danger:hover { color: #de350b !important; }
  `]
})
export class ScheduleListComponent implements OnInit {
  private destroyRef = inject(DestroyRef);

  schedules: Schedule[] = [];
  loading = true;
  activeFilter: 'all' | 'active' | 'paused' = 'all';
  searchQuery = '';

  get activeCount(): number { return this.schedules.filter(s => s.enabled).length; }
  get pausedCount(): number { return this.schedules.filter(s => !s.enabled).length; }
  get needsAttentionCount(): number { return this.schedules.filter(s => (s.consecutive_failures ?? 0) > 0).length; }

  get filteredSchedules(): Schedule[] {
    let result = this.schedules;
    if (this.activeFilter === 'active') result = result.filter(s => s.enabled);
    if (this.activeFilter === 'paused') result = result.filter(s => !s.enabled);
    if (this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase();
      result = result.filter(s => s.name.toLowerCase().includes(q) ||
        (s.description ?? '').toLowerCase().includes(q));
    }
    return result;
  }

  hasFailures(s: Schedule): boolean { return (s.consecutive_failures ?? 0) > 0; }
  sourceCount(s: Schedule): number { return (s.document_ids?.length ?? 0) + (s.folder_ids?.length ?? 0); }

  localeDisplay(locales: string[]): string {
    const codes = (locales || []).filter(l => l !== '');
    return codes.length ? codes.join(' · ') : 'Source';
  }

  clearFilters() { this.searchQuery = ''; this.activeFilter = 'all'; }

  constructor(
    private scheduleService: ScheduleService,
    private notifications: NotificationService,
    private dialog: MatDialog,
    private router: Router,
  ) {}

  ngOnInit() { this.loadSchedules(); }

  loadSchedules() {
    this.loading = true;
    this.scheduleService.getAll()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: s => { this.schedules = s; this.loading = false; },
        error: () => { this.loading = false; },
      });
  }

  openDetail(schedule: Schedule) {
    this.router.navigate(['/schedules', schedule.id]);
  }

  triggerNow(schedule: Schedule) {
    this.scheduleService.trigger(schedule.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: () => this.notifications.success('Job triggered successfully') });
  }

  deleteSchedule(schedule: Schedule) {
    const ref = this.dialog.open(HopConfirmDialogComponent, {
      data: {
        title: 'Delete Schedule',
        message: `Delete "${schedule.name}"? This will also delete all job history for this schedule.`,
        confirmText: 'Delete',
      },
    });
    ref.afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(confirmed => {
        if (confirmed) {
          this.scheduleService.delete(schedule.id)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({ next: () => this.loadSchedules() });
        }
      });
  }
}
