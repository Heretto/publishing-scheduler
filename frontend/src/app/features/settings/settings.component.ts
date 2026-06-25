import { Component, OnInit, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { forkJoin } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ApiService } from '../../core/services/api.service';

@Component({
    selector: 'app-settings',
    imports: [
        CommonModule,
        RouterModule,
        MatButtonModule,
        MatCheckboxModule,
        MatIconModule,
        MatProgressSpinnerModule,
        MatSnackBarModule,
        MatTooltipModule,
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
        <div class="header-right">
          <span *ngIf="lastChecked" class="last-checked">Checked {{ lastChecked | date:'h:mm:ss a' }}</span>
          <button mat-icon-button class="refresh-btn" (click)="checkConnections()"
            [disabled]="checking" matTooltip="Refresh" aria-label="Refresh connection status">
            <mat-icon [class.spinning]="checking">refresh</mat-icon>
          </button>
        </div>
      </div>
      <div class="sn-card-body status-body">
        <ng-container *ngIf="checking && !lastChecked">
          <div class="status-checking">
            <mat-spinner diameter="20"></mat-spinner>
            <span>Checking connections…</span>
          </div>
        </ng-container>
        <ng-container *ngIf="!checking || lastChecked">
          <div class="status-row">
            <span class="status-name">Backend API</span>
            <span class="status-badge" [class.badge-ok]="backendOk" [class.badge-err]="!backendOk">
              <span class="badge-dot"></span>
              {{ backendOk ? 'Connected' : 'Unreachable' }}
            </span>
          </div>
          <div class="status-row">
            <span class="status-name">Heretto API</span>
            <span class="status-badge" [class.badge-ok]="herettoOk" [class.badge-err]="!herettoOk">
              <span class="badge-dot"></span>
              {{ herettoOk ? 'Connected' : herettoError }}
            </span>
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
      color: #42526e;
      text-transform: uppercase;
      letter-spacing: 0.6px;
    }
    .section-sub { font-size: 11px; color: #97a0af; }

    /* ── Connection status ───────────────────────────────────── */
    .header-right { display: flex; align-items: center; gap: 4px; }
    .last-checked { font-size: 11px; color: #97a0af; }
    .refresh-btn { color: #42526e !important; width: 28px !important; height: 28px !important; }
    .refresh-btn mat-icon { font-size: 18px; width: 18px; height: 18px; line-height: 18px; }
    .spinning { animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }

    .status-body { padding: 0 16px; }
    .status-checking {
      display: flex; align-items: center; gap: 10px;
      padding: 14px 0; color: #97a0af; font-size: 13px;
    }
    .status-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 0;
      border-bottom: 1px solid #f0f2f5;
    }
    .status-row:last-child { border-bottom: none; }
    .status-name { font-size: 13px; font-weight: 500; color: #1d1f2b; }
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 3px 10px 3px 8px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
    }
    .badge-ok { background: #e3fcef; color: #006644; }
    .badge-err { background: #ffebe6; color: #de350b; }
    .badge-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
    .badge-ok .badge-dot { background: #00a650; }
    .badge-err .badge-dot { background: #de350b; }

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
  lastChecked: Date | null = null;

  allValues: string[] = [];
  excludedSet = new Set<string>();
  valuesLoading = true;

  constructor(private http: HttpClient, private api: ApiService, private snackBar: MatSnackBar) {}

  ngOnInit() {
    this.checkConnections();
    this.loadValues();
  }

  checkConnections() {
    this.checking = true;
    let pending = 2;
    const done = () => { if (--pending === 0) { this.checking = false; this.lastChecked = new Date(); } };

    this.http.get('/api/health')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => { this.backendOk = true; done(); },
        error: () => { this.backendOk = false; done(); },
      });

    this.api.get('/heretto/deployments')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => { this.herettoOk = true; done(); },
        error: (err) => {
          this.herettoOk = false;
          this.herettoError = err.status === 0 ? 'Server unreachable' :
            err.status === 502 ? 'Heretto API unreachable' :
            `Connection failed (${err.status})`;
          done();
        },
      });
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
