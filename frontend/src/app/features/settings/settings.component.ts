import { Component, OnInit, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { forkJoin } from 'rxjs';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ApiService } from '../../core/services/api.service';

@Component({
    selector: 'app-settings',
    imports: [
        CommonModule,
        RouterModule,
        MatCheckboxModule,
        MatIconModule,
        MatProgressSpinnerModule,
        MatSnackBarModule,
    ],
    template: `
    <!-- Page banner -->
    <div class="page-banner">
      <div class="banner-breadcrumb">
        <span>Home</span>
        <mat-icon class="bc-sep">chevron_right</mat-icon>
        <span>Settings</span>
      </div>
      <div class="banner-row">
        <h1 class="banner-title">Settings</h1>
        <span class="banner-subtitle">Manage API connections, environment configuration, and publishing preferences.</span>
      </div>
    </div>

    <!-- API Connection Status -->
    <div class="sn-card" style="margin-top: 20px;">
      <div class="sn-card-header">
        <span class="section-title">API Connection Status</span>
      </div>
      <div class="sn-card-body">
        <mat-spinner *ngIf="checking" diameter="24"></mat-spinner>
        <ng-container *ngIf="!checking">
          <div class="status-item">
            <div class="status-dot" [class.dot-ok]="backendOk" [class.dot-err]="!backendOk"></div>
            <div class="status-info">
              <span class="status-name">Backend API</span>
              <span class="status-value" [class.ok]="backendOk" [class.err]="!backendOk">
                {{ backendOk ? 'Connected' : 'Unreachable' }}
              </span>
            </div>
          </div>
          <div class="status-item">
            <div class="status-dot" [class.dot-ok]="herettoOk" [class.dot-err]="!herettoOk"></div>
            <div class="status-info">
              <span class="status-name">Heretto API</span>
              <span class="status-value" [class.ok]="herettoOk" [class.err]="!herettoOk">
                {{ herettoOk ? 'Connected' : herettoError }}
              </span>
            </div>
          </div>
        </ng-container>
      </div>
    </div>

    <!-- Configuration -->
    <div class="sn-card">
      <div class="sn-card-header">
        <span class="section-title">Configuration</span>
      </div>
      <div class="sn-card-body">
        <p class="config-note">Configuration is managed via environment variables. See the <code>.env.example</code> file in the project root.</p>
        <div class="env-list">
          <div class="env-row">
            <code class="env-key">HERETTO_API_BASE_URL</code>
            <span class="env-desc">Heretto API base URL</span>
          </div>
          <div class="env-row">
            <code class="env-key">HERETTO_USERNAME</code>
            <span class="env-desc">Heretto username</span>
          </div>
          <div class="env-row">
            <code class="env-key">HERETTO_PASSWORD</code>
            <span class="env-desc">Heretto password</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Status Value Exclusions -->
    <div class="sn-card">
      <div class="sn-card-header">
        <span class="section-title">Status Value Exclusions</span>
        <span class="section-sub">Values checked below will not appear in the schedule status dropdown</span>
      </div>
      <div class="sn-card-body">
        <mat-spinner *ngIf="valuesLoading" diameter="24"></mat-spinner>
        <ng-container *ngIf="!valuesLoading">
          <p *ngIf="allValues.length === 0" class="empty-hint">No status values found.</p>
          <div *ngFor="let v of allValues" class="value-row">
            <mat-checkbox [checked]="excludedSet.has(v)" (change)="toggleExclusion(v, $event.checked)">
              {{ v }}
            </mat-checkbox>
          </div>
        </ng-container>
      </div>
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
      align-items: baseline;
      gap: 16px;
      padding: 10px 0 16px;
    }
    .banner-title { font-size: 22px; font-weight: 700; margin: 0; color: #fff; }
    .banner-subtitle { font-size: 12px; color: rgba(255,255,255,0.5); }

    /* ── Cards ──────────────────────────────────────────────── */
    .sn-card {
      background: #fff;
      border: 1px solid #dee2ec;
      border-radius: 4px;
      overflow: hidden;
      margin-bottom: 14px;
    }
    .sn-card-header {
      padding: 10px 16px;
      border-bottom: 1px solid #dee2ec;
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: #f8f9fb;
      flex-wrap: wrap;
      gap: 4px;
    }
    .sn-card-body { padding: 16px; }
    .section-title {
      font-size: 11px;
      font-weight: 700;
      color: #97a0af;
      text-transform: uppercase;
      letter-spacing: 0.6px;
    }
    .section-sub { font-size: 11px; color: #97a0af; }

    /* ── Connection status ───────────────────────────────────── */
    .status-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 0;
      border-bottom: 1px solid #f0f2f5;
    }
    .status-item:last-child { border-bottom: none; }
    .status-dot {
      width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;
    }
    .dot-ok { background: #00a650; box-shadow: 0 0 0 3px rgba(0,166,80,0.15); }
    .dot-err { background: #de350b; box-shadow: 0 0 0 3px rgba(222,53,11,0.15); }
    .status-info { display: flex; flex-direction: column; gap: 1px; }
    .status-name { font-size: 13px; font-weight: 500; color: #1d1f2b; }
    .status-value { font-size: 12px; }
    .ok { color: #006644; }
    .err { color: #de350b; }

    /* ── Config ─────────────────────────────────────────────── */
    .config-note { margin: 0 0 12px; color: #555; font-size: 13px; }
    .env-list { display: flex; flex-direction: column; gap: 8px; }
    .env-row { display: flex; align-items: baseline; gap: 12px; }
    .env-key {
      font-family: monospace;
      font-size: 12px;
      background: #f0f2f5;
      color: #1d1f2b;
      padding: 2px 6px;
      border-radius: 3px;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .env-desc { font-size: 13px; color: #555; }

    /* ── Exclusions ─────────────────────────────────────────── */
    .value-row { margin: 4px 0; }
    .empty-hint { color: #999; font-size: 0.85rem; margin: 0; }
  `]
})
export class SettingsComponent implements OnInit {
  private destroyRef = inject(DestroyRef);

  backendOk = false;
  herettoOk = false;
  herettoError = 'Not tested';
  checking = true;

  allValues: string[] = [];
  excludedSet = new Set<string>();
  valuesLoading = true;

  constructor(private http: HttpClient, private api: ApiService, private snackBar: MatSnackBar) {}

  ngOnInit() {
    this.http.get('/api/health')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => { this.backendOk = true; this.checking = false; },
        error: () => { this.backendOk = false; this.checking = false; },
      });

    this.api.get('/heretto/deployments')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.herettoOk = true,
        error: (err) => {
          this.herettoOk = false;
          this.herettoError = err.status === 0 ? 'Server unreachable' :
            err.status === 502 ? 'Heretto API unreachable' :
            `Connection failed (${err.status})`;
        },
      });

    this.loadValues();
  }

  loadValues() {
    forkJoin({
      excluded: this.api.get<{ value: string }[]>('/settings/status-exclusions'),
      available: this.api.get<string[]>('/heretto/ccms/metadata/status-values'),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ excluded, available }) => {
          const excludedValues = excluded.map(r => r.value);
          this.excludedSet = new Set(excludedValues);
          const merged = new Set([...available, ...excludedValues]);
          this.allValues = [...merged].sort();
          this.valuesLoading = false;
        },
        error: () => { this.valuesLoading = false; },
      });
  }

  toggleExclusion(value: string, checked: boolean) {
    if (checked) {
      this.api.post('/settings/status-exclusions', { value })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: () => { this.excludedSet = new Set([...this.excludedSet, value]); },
          error: (err) => this.snackBar.open(err.error?.detail ?? 'Failed to exclude', 'OK', { duration: 3000 }),
        });
    } else {
      this.api.delete(`/settings/status-exclusions/${encodeURIComponent(value)}`)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: () => {
            const next = new Set(this.excludedSet);
            next.delete(value);
            this.excludedSet = next;
          },
          error: () => this.snackBar.open('Failed to remove', 'OK', { duration: 3000 }),
        });
    }
  }
}
